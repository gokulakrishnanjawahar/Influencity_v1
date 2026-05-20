// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../libraries/MilestoneLib.sol";
import "../interfaces/IReputationToken.sol";

/// @title CampaignEscrow
/// @notice Holds USDC funds for a single influencer campaign.
/// Releases tranches automatically when oracle-verified milestones are met.
/// Returns funds to brand if milestones fail or campaign ends with remainder.
contract CampaignEscrow is ReentrancyGuard, Ownable {
    using MilestoneLib for MilestoneLib.Milestone;

    // ─────────────────────────────────────────────
    // State Variables
    // ─────────────────────────────────────────────

    /// @notice The brand that created and funded this campaign
    address public brand;

    /// @notice The creator receiving payouts — unset (address(0)) until the
    /// brand selects an applicant and the agreement is formed
    address public creator;

    /// @notice USDC token contract
    IERC20 public usdc;

    /// @notice ReputationToken contract — mints on milestone completion
    IReputationToken public reputationToken;

    /// @notice The address allowed to post verified metric results (MetricsConsumer)
    address public metricsConsumer;

    /// @notice IPFS CID of the campaign brief — locked at deployment
    string public ipfsBriefHash;

    /// @notice Unique campaign ID assigned by CampaignFactory
    uint256 public campaignId;

    /// @notice Total USDC deposited by brand (6 decimal units)
    uint256 public totalDeposit;

    /// @notice Total USDC already paid out to creator
    uint256 public totalReleased;

    /// @notice Whether the campaign has been finalised
    bool public isFinalized;

    /// @notice Whether the campaign was cancelled by the brand before a creator was assigned
    bool public isCancelled;

    /// @notice Array of all milestones for this campaign
    MilestoneLib.Milestone[] public milestones;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event CampaignInitialised(
        uint256 indexed campaignId,
        address indexed brand,
        address indexed creator,
        uint256 totalDeposit,
        string ipfsBriefHash
    );

    event MilestoneAdded(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        MilestoneLib.Platform platform,
        MilestoneLib.MetricType metricType,
        uint256 threshold,
        uint256 trancheAmount,
        uint256 deadline
    );

    event MilestoneMet(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 verifiedValue,
        uint256 trancheReleased
    );

    event MilestoneFailed(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 trancheRefunded
    );

    event MetricVerified(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 reportedValue
    );

    event CampaignFinalized(
        uint256 indexed campaignId,
        uint256 remainderRefunded
    );

    event CreatorAssigned(
        uint256 indexed campaignId,
        address indexed creator
    );

    event CampaignCancelled(
        uint256 indexed campaignId,
        uint256 refundedToBrand
    );

    // ─────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────

    /// @notice Only the MetricsConsumer oracle contract can call this
    modifier onlyMetricsConsumer() {
        require(
            msg.sender == metricsConsumer,
            "CampaignEscrow: caller is not MetricsConsumer"
        );
        _;
    }

    /// @notice Only the brand that created this campaign
    modifier onlyBrand() {
        require(msg.sender == brand, "CampaignEscrow: caller is not brand");
        _;
    }

    /// @notice Campaign must not be finalised
    modifier notFinalized() {
        require(!isFinalized, "CampaignEscrow: campaign already finalized");
        _;
    }

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    /// @param _campaignId       Unique ID from CampaignFactory
    /// @param _brand            Wallet address of the brand
    /// @param _usdc             Address of the USDC token contract
    /// @param _reputationToken  Address of the ReputationToken contract
    /// @param _metricsConsumer  Address of the MetricsConsumer oracle contract
    /// @param _ipfsBriefHash    IPFS CID of the campaign brief
    /// @dev The creator is intentionally NOT set here — campaigns are deployed
    /// as open listings and a creator is bound later via assignCreator().
    constructor(
        uint256 _campaignId,
        address _brand,
        address _usdc,
        address _reputationToken,
        address _metricsConsumer,
        string memory _ipfsBriefHash
    ) Ownable(msg.sender) {
        require(_brand != address(0), "CampaignEscrow: invalid brand address");
        require(_usdc != address(0), "CampaignEscrow: invalid USDC address");
        require(bytes(_ipfsBriefHash).length > 0, "CampaignEscrow: brief hash required");

        campaignId = _campaignId;
        brand = _brand;
        usdc = IERC20(_usdc);
        reputationToken = IReputationToken(_reputationToken);
        metricsConsumer = _metricsConsumer;
        ipfsBriefHash = _ipfsBriefHash;
    }

    // ─────────────────────────────────────────────
    // Setup Functions
    // ─────────────────────────────────────────────

    /// @notice Brand deposits USDC to fund the campaign.
    /// Must approve this contract to spend USDC before calling.
    /// @param amount USDC amount in 6 decimal units (e.g. 100 USDC = 100_000_000)
function deposit(uint256 amount) external onlyBrand notFinalized nonReentrant {
        require(amount > 0, "CampaignEscrow: deposit amount must be > 0");
        require(totalDeposit == 0, "CampaignEscrow: already deposited");

        // Ensure deposit covers all milestones already added
        uint256 allocated = _getTotalAllocated();
        if (allocated > 0) {
            require(
                amount >= allocated,
                "CampaignEscrow: deposit does not cover all milestone tranches"
            );
        }

        bool success = usdc.transferFrom(msg.sender, address(this), amount);
        require(success, "CampaignEscrow: USDC transfer failed");

        totalDeposit = amount;
    }

    /// @notice Add a milestone to this campaign. Called by CampaignFactory during setup.
    /// Total tranche amounts must not exceed total deposit.
    function addMilestone(
        MilestoneLib.Platform _platform,
        MilestoneLib.MetricType _metricType,
        uint256 _threshold,
        uint256 _trancheAmount,
        uint256 _deadline,
        string memory _contentId
    ) external onlyOwner notFinalized {
        require(
            MilestoneLib.isValidMilestone(_threshold, _trancheAmount, _deadline),
            "CampaignEscrow: invalid milestone parameters"
        );

        // If deposit already made, ensure new milestone does not exceed it
        if (totalDeposit > 0) {
            uint256 allocatedSoFar = _getTotalAllocated();
            require(
                allocatedSoFar + _trancheAmount <= totalDeposit,
                "CampaignEscrow: tranches exceed total deposit"
            );
        }

        milestones.push(MilestoneLib.Milestone({
            platform: _platform,
            metricType: _metricType,
            threshold: _threshold,
            trancheAmount: _trancheAmount,
            deadline: _deadline,
            contentId: _contentId,
            ipfsProofHash: "",
            status: MilestoneLib.MilestoneStatus.PENDING
        }));

        emit MilestoneAdded(
            campaignId,
            milestones.length - 1,
            _platform,
            _metricType,
            _threshold,
            _trancheAmount,
            _deadline
        );
    }

    /// @notice Binds the chosen creator to this campaign, forming the agreement.
    /// Called once by the CampaignFactory after the brand selects an applicant.
    /// Can only be set while the campaign is still open (no creator yet).
    /// @param _creator Wallet address of the selected creator
    function assignCreator(address _creator) external onlyOwner notFinalized {
        require(creator == address(0), "CampaignEscrow: creator already assigned");
        require(_creator != address(0), "CampaignEscrow: invalid creator address");
        require(_creator != brand, "CampaignEscrow: brand and creator cannot be same");

        creator = _creator;
        emit CreatorAssigned(campaignId, _creator);
    }

    /// @notice Creator submits IPFS proof hash for a specific milestone
    function submitProof(uint256 milestoneIndex, string memory _ipfsProofHash) external notFinalized {
        require(msg.sender == creator, "CampaignEscrow: caller is not creator");
        require(milestoneIndex < milestones.length, "CampaignEscrow: invalid milestone index");
        require(
            milestones[milestoneIndex].status == MilestoneLib.MilestoneStatus.PENDING,
            "CampaignEscrow: milestone not pending"
        );
        require(bytes(_ipfsProofHash).length > 0, "CampaignEscrow: proof hash required");

        milestones[milestoneIndex].ipfsProofHash = _ipfsProofHash;
    }

    // ─────────────────────────────────────────────
    // Oracle Entry Point
    // ─────────────────────────────────────────────

    /// @notice Called by MetricsConsumer with the verified metric value from Chainlink.
    /// Compares against threshold — releases tranche or marks pending.
    /// @param milestoneIndex Index of the milestone being verified
    /// @param reportedValue  The verified metric value from the oracle
    function receiveVerifiedMetric(
        uint256 milestoneIndex,
        uint256 reportedValue
    ) external onlyMetricsConsumer notFinalized nonReentrant {
        require(creator != address(0), "CampaignEscrow: no creator assigned");
        require(milestoneIndex < milestones.length, "CampaignEscrow: invalid milestone index");

        MilestoneLib.Milestone storage milestone = milestones[milestoneIndex];

        require(
            milestone.status == MilestoneLib.MilestoneStatus.PENDING,
            "CampaignEscrow: milestone already resolved"
        );

        emit MetricVerified(campaignId, milestoneIndex, reportedValue);

        if (MilestoneLib.isThresholdMet(milestone, reportedValue)) {
            _releaseTranche(milestoneIndex);
        } else if (MilestoneLib.isExpired(milestone)) {
            _failMilestone(milestoneIndex);
        }
        // If threshold not met but deadline not passed — stays PENDING for next check
    }

    // ─────────────────────────────────────────────
    // Internal Logic
    // ─────────────────────────────────────────────

    /// @notice Releases the tranche to the creator and mints a ReputationToken
    function _releaseTranche(uint256 milestoneIndex) internal {
        MilestoneLib.Milestone storage milestone = milestones[milestoneIndex];

        milestone.status = MilestoneLib.MilestoneStatus.MET;
        totalReleased += milestone.trancheAmount;

        // Transfer USDC tranche to creator
        bool success = usdc.transfer(creator, milestone.trancheAmount);
        require(success, "CampaignEscrow: USDC transfer to creator failed");

        // Mint reputation token to creator
        // Token ID is derived from milestone index — can be mapped to tiers in ReputationToken
        reputationToken.mint(creator, milestoneIndex, campaignId);

        emit MilestoneMet(
            campaignId,
            milestoneIndex,
            milestone.threshold,
            milestone.trancheAmount
        );
    }

    /// @notice Marks milestone as failed and returns tranche to brand
    function _failMilestone(uint256 milestoneIndex) internal {
        MilestoneLib.Milestone storage milestone = milestones[milestoneIndex];

        milestone.status = MilestoneLib.MilestoneStatus.FAILED;

        // Return this tranche to brand
        bool success = usdc.transfer(brand, milestone.trancheAmount);
        require(success, "CampaignEscrow: USDC refund to brand failed");

        emit MilestoneFailed(campaignId, milestoneIndex, milestone.trancheAmount);
    }

    /// @notice Calculates total USDC allocated across all milestones
    function _getTotalAllocated() internal view returns (uint256 total) {
        for (uint256 i = 0; i < milestones.length; i++) {
            total += milestones[i].trancheAmount;
        }
    }

    // ─────────────────────────────────────────────
    // Campaign Finalization
    // ─────────────────────────────────────────────

    /// @notice Finalizes the campaign — checks for expired pending milestones,
    /// then returns any unallocated remainder to the brand.
    /// Can be called by brand or owner after all deadlines have passed.
    function finalizeCampaign() external nonReentrant notFinalized {
        require(
            msg.sender == brand || msg.sender == owner(),
            "CampaignEscrow: not authorized to finalize"
        );

        // Fail any milestones that are still pending but expired
        for (uint256 i = 0; i < milestones.length; i++) {
            MilestoneLib.Milestone storage milestone = milestones[i];
            if (
                milestone.status == MilestoneLib.MilestoneStatus.PENDING &&
                MilestoneLib.isExpired(milestone)
            ) {
                _failMilestone(i);
            }
        }

        // Return remainder balance to brand
        uint256 remainder = usdc.balanceOf(address(this));
        if (remainder > 0) {
            bool success = usdc.transfer(brand, remainder);
            require(success, "CampaignEscrow: remainder refund failed");
        }

        isFinalized = true;
        emit CampaignFinalized(campaignId, remainder);
    }

    // ─────────────────────────────────────────────
    // Campaign Cancellation
    // ─────────────────────────────────────────────

    /// @notice Cancels an open campaign and refunds the entire locked balance
    /// to the brand. Only callable while the campaign is still open — once a
    /// creator has been assigned the agreement is binding and cannot be cancelled.
    function cancelCampaign() external onlyBrand notFinalized nonReentrant {
        require(
            creator == address(0),
            "CampaignEscrow: creator already assigned, cannot cancel"
        );

        uint256 refund = usdc.balanceOf(address(this));
        if (refund > 0) {
            bool success = usdc.transfer(brand, refund);
            require(success, "CampaignEscrow: refund to brand failed");
        }

        isCancelled = true;
        isFinalized = true;
        emit CampaignCancelled(campaignId, refund);
    }

    // ─────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────

    /// @notice Returns all milestones for this campaign
    function getMilestones() external view returns (MilestoneLib.Milestone[] memory) {
        return milestones;
    }

    /// @notice Returns a single milestone by index
    function getMilestone(uint256 index) external view returns (MilestoneLib.Milestone memory) {
        require(index < milestones.length, "CampaignEscrow: invalid index");
        return milestones[index];
    }

    /// @notice Returns the number of milestones
    function getMilestoneCount() external view returns (uint256) {
        return milestones.length;
    }

    /// @notice Returns current USDC balance held in escrow
    function getBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}