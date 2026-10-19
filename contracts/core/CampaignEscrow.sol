// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../libraries/MilestoneLib.sol";
import "../interfaces/IReputationToken.sol";

/// @title CampaignEscrow
/// @notice Holds USDC funds for a single influencer campaign.
/// Credits tranches to the creator when oracle-verified milestones are met,
/// and credits the brand for failed milestones and any unallocated remainder.
///
/// Payouts are pull-based: settling a milestone only records who is owed what,
/// and each party collects with withdraw(). USDC can blacklist addresses, so a
/// direct transfer to a blacklisted creator or brand would revert — inside the
/// oracle callback, or inside finalizeCampaign — and strand everyone else's
/// funds with it. The contract only ever sends USDC to the account calling it.
contract CampaignEscrow is ReentrancyGuard, Ownable {
    using MilestoneLib for MilestoneLib.Milestone;
    using SafeERC20 for IERC20;

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

    /// @notice USDC each account can collect with withdraw()
    mapping(address => uint256) public withdrawable;

    /// @notice Sum of every withdrawable balance — USDC already owed to someone
    /// and therefore not part of the remainder returned at finalization
    uint256 public totalWithdrawable;

    /// @notice Array of all milestones for this campaign
    MilestoneLib.Milestone[] public milestones;

    /// @notice Upper bound on milestones per campaign. finalizeCampaign() and the
    /// Chainlink automation sweep both iterate this array, so it must stay small
    /// enough that neither can be pushed past the block gas limit.
    uint256 public constant MAX_MILESTONES = 20;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    /// @notice Emitted when the brand locks USDC into the escrow. Deposits were
    /// previously silent on-chain, leaving event listeners unable to observe
    /// funding. (Replaces CampaignInitialised, which described the old flow
    /// where a creator existed at construction, and was never emitted.)
    event CampaignFunded(
        uint256 indexed campaignId,
        uint256 amount
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

    /// @notice trancheRefunded is credited to the brand's withdrawable balance
    event MilestoneFailed(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 trancheRefunded
    );

    event ProofSubmitted(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        string contentId,
        string channelId,
        string ipfsProofHash
    );

    event Withdrawn(
        address indexed account,
        address indexed to,
        uint256 amount
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

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        totalDeposit = amount;
        emit CampaignFunded(campaignId, amount);
    }

    /// @notice Add a milestone to this campaign. Called by CampaignFactory during setup.
    /// Total tranche amounts must not exceed total deposit.
    function addMilestone(
        MilestoneLib.Platform _platform,
        MilestoneLib.MetricType _metricType,
        uint256 _threshold,
        uint256 _trancheAmount,
        uint256 _deadline
    ) external onlyOwner notFinalized {
        require(
            milestones.length < MAX_MILESTONES,
            "CampaignEscrow: too many milestones"
        );
        require(
            MilestoneLib.isValidMilestone(_threshold, _trancheAmount, _deadline),
            "CampaignEscrow: invalid milestone parameters"
        );
        require(
            MilestoneLib.isSupportedMetric(_platform, _metricType),
            "CampaignEscrow: metric not supported on platform"
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
            contentId: "",
            channelId: "",
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
        // Binding a creator to an empty escrow forms an agreement that can never
        // pay out: every _releaseTranche would revert on the USDC transfer, which
        // in turn reverts the oracle callback that triggered it.
        require(totalDeposit > 0, "CampaignEscrow: campaign not funded");

        creator = _creator;
        emit CreatorAssigned(campaignId, _creator);
    }

    /// @notice Creator names the content the oracle should measure for a milestone.
    /// @param _contentId     Platform content ID (YouTube video ID, Twitch clip ID…)
    /// @param _channelId     The creator's channel on that platform. The oracle
    ///                       only accepts the reading if the content belongs to
    ///                       this channel and the channel names the creator's wallet.
    /// @param _ipfsProofHash CID of the proof record pinned to IPFS
    /// @dev Content can be set once. Allowing it to change would let a creator
    /// swap in whichever video happened to perform best after the fact.
    function submitProof(
        uint256 milestoneIndex,
        string memory _contentId,
        string memory _channelId,
        string memory _ipfsProofHash
    ) external notFinalized {
        require(msg.sender == creator, "CampaignEscrow: caller is not creator");
        require(milestoneIndex < milestones.length, "CampaignEscrow: invalid milestone index");

        MilestoneLib.Milestone storage milestone = milestones[milestoneIndex];

        require(
            milestone.status == MilestoneLib.MilestoneStatus.PENDING,
            "CampaignEscrow: milestone not pending"
        );
        require(bytes(_contentId).length > 0, "CampaignEscrow: content ID required");
        require(bytes(_channelId).length > 0, "CampaignEscrow: channel ID required");
        require(bytes(_ipfsProofHash).length > 0, "CampaignEscrow: proof hash required");
        require(
            bytes(milestone.contentId).length == 0,
            "CampaignEscrow: proof already submitted"
        );
        require(
            !MilestoneLib.isPastDeadline(milestone),
            "CampaignEscrow: milestone deadline passed"
        );

        milestone.contentId = _contentId;
        milestone.channelId = _channelId;
        milestone.ipfsProofHash = _ipfsProofHash;

        emit ProofSubmitted(campaignId, milestoneIndex, _contentId, _channelId, _ipfsProofHash);
    }

    // ─────────────────────────────────────────────
    // Oracle Entry Point
    // ─────────────────────────────────────────────

    /// @notice Called by MetricsConsumer with the verified metric value from Chainlink.
    /// Compares against threshold — credits the tranche, fails the milestone once
    /// the grace window has closed, or leaves it pending for the next check.
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
        require(
            bytes(milestone.contentId).length > 0,
            "CampaignEscrow: no content submitted"
        );

        emit MetricVerified(campaignId, milestoneIndex, reportedValue);

        if (MilestoneLib.isThresholdMet(milestone, reportedValue)) {
            _releaseTranche(milestoneIndex, reportedValue);
        } else if (MilestoneLib.isExpired(milestone)) {
            _failMilestone(milestoneIndex);
        }
        // If threshold not met but deadline not passed — stays PENDING for next check
    }

    // ─────────────────────────────────────────────
    // Internal Logic
    // ─────────────────────────────────────────────

    /// @notice Credits the tranche to the creator and mints a ReputationToken
    function _releaseTranche(uint256 milestoneIndex, uint256 reportedValue) internal {
        MilestoneLib.Milestone storage milestone = milestones[milestoneIndex];

        milestone.status = MilestoneLib.MilestoneStatus.MET;
        totalReleased += milestone.trancheAmount;
        _credit(creator, milestone.trancheAmount);

        reputationToken.mint(
            creator,
            milestoneIndex,
            campaignId,
            brand,
            milestone.trancheAmount
        );

        emit MilestoneMet(
            campaignId,
            milestoneIndex,
            reportedValue,
            milestone.trancheAmount
        );
    }

    /// @notice Marks milestone as failed and credits its tranche back to the brand
    function _failMilestone(uint256 milestoneIndex) internal {
        MilestoneLib.Milestone storage milestone = milestones[milestoneIndex];

        milestone.status = MilestoneLib.MilestoneStatus.FAILED;
        _credit(brand, milestone.trancheAmount);

        emit MilestoneFailed(campaignId, milestoneIndex, milestone.trancheAmount);
    }

    function _credit(address account, uint256 amount) internal {
        withdrawable[account] += amount;
        totalWithdrawable += amount;
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

    /// @notice Finalizes the campaign — fails expired pending milestones, then
    /// credits any unallocated remainder to the brand.
    /// @dev Callable by anyone. It moves no USDC out of the contract and can only
    /// succeed once every milestone is settled, so there is nothing for a third
    /// party to abuse — and a keeper or the creator can close out a campaign the
    /// brand has abandoned.
    function finalizeCampaign() external nonReentrant notFinalized {
        // Settle every outstanding milestone first. A pending milestone past its
        // deadline is failed and refunded here; one that is still live blocks
        // finalization outright.
        //
        // Without that block the sweep below would hand the brand every
        // unresolved tranche on demand — including one the creator has already
        // earned but the oracle has not yet reported on — which would make the
        // escrow's core guarantee (a met milestone always pays) unenforceable.
        for (uint256 i = 0; i < milestones.length; i++) {
            MilestoneLib.Milestone storage milestone = milestones[i];
            if (milestone.status == MilestoneLib.MilestoneStatus.PENDING) {
                require(
                    MilestoneLib.isExpired(milestone),
                    "CampaignEscrow: milestone still live"
                );
                _failMilestone(i);
            }
        }

        // Credit the unallocated remainder to the brand. Balances already owed
        // to someone are excluded — they stay put until withdrawn.
        uint256 remainder = usdc.balanceOf(address(this)) - totalWithdrawable;
        if (remainder > 0) {
            _credit(brand, remainder);
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

        isCancelled = true;
        isFinalized = true;

        // Paid directly rather than credited: the brand is the caller, so a
        // failed transfer can only ever block the brand's own transaction.
        uint256 refund = usdc.balanceOf(address(this)) - totalWithdrawable;
        if (refund > 0) {
            usdc.safeTransfer(brand, refund);
        }

        emit CampaignCancelled(campaignId, refund);
    }

    // ─────────────────────────────────────────────
    // Withdrawals
    // ─────────────────────────────────────────────

    /// @notice Collects the caller's withdrawable USDC.
    /// @param to Where to send it. Usually the caller; a different address lets
    ///           an account whose own address is blacklisted still recover funds.
    function withdraw(address to) external nonReentrant {
        require(to != address(0), "CampaignEscrow: invalid recipient");
        uint256 amount = withdrawable[msg.sender];
        require(amount > 0, "CampaignEscrow: nothing to withdraw");

        withdrawable[msg.sender] = 0;
        totalWithdrawable -= amount;
        usdc.safeTransfer(to, amount);

        emit Withdrawn(msg.sender, to, amount);
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