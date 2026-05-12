// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./CampaignEscrow.sol";
import "../libraries/MilestoneLib.sol";

/// @title CampaignFactory
/// @notice Deploys a fresh CampaignEscrow for every new deal.
/// Maintains an on-chain registry of all campaigns.
/// The backend listens to CampaignCreated events to sync Supabase.
contract CampaignFactory {

    // ─────────────────────────────────────────────
    // State Variables
    // ─────────────────────────────────────────────

    /// @notice Auto-incrementing campaign ID counter
    uint256 public campaignCount;

    /// @notice Address of the ReputationToken contract — passed to every escrow
    address public reputationToken;

    /// @notice Address of the MetricsConsumer oracle contract — passed to every escrow
    address public metricsConsumer;

    /// @notice Address of the USDC token contract — passed to every escrow
    address public usdc;

    /// @notice Owner of the factory — can update protocol addresses
    address public owner;

    /// @notice Registry: campaignId => escrow contract address
    mapping(uint256 => address) public campaignEscrows;

    /// @notice Registry: wallet address => list of campaign IDs they are involved in
    mapping(address => uint256[]) public brandCampaigns;
    mapping(address => uint256[]) public creatorCampaigns;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed escrowAddress,
        address indexed brand,
        address creator,
        string ipfsBriefHash
    );

    event ProtocolAddressesUpdated(
        address usdc,
        address reputationToken,
        address metricsConsumer
    );

    // ─────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "CampaignFactory: caller is not owner");
        _;
    }

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    /// @param _usdc             Address of the USDC token contract
    /// @param _reputationToken  Address of the ReputationToken contract
    /// @param _metricsConsumer  Address of the MetricsConsumer oracle contract
    constructor(
        address _usdc,
        address _reputationToken,
        address _metricsConsumer
    ) {
        require(_usdc != address(0), "CampaignFactory: invalid USDC address");
        require(_reputationToken != address(0), "CampaignFactory: invalid ReputationToken address");
        require(_metricsConsumer != address(0), "CampaignFactory: invalid MetricsConsumer address");

        usdc = _usdc;
        reputationToken = _reputationToken;
        metricsConsumer = _metricsConsumer;
        owner = msg.sender;
    }

    // ─────────────────────────────────────────────
    // Core Function — Create Campaign
    // ─────────────────────────────────────────────

    /// @notice Deploys a new CampaignEscrow and registers it.
    /// Brand must call deposit() on the escrow after creation to fund it.
    /// @param _creator         Wallet address of the creator
    /// @param _ipfsBriefHash   IPFS CID of the campaign brief
    /// @param _platforms       Array of platforms for each milestone
    /// @param _metricTypes     Array of metric types for each milestone
    /// @param _thresholds      Array of numeric targets for each milestone
    /// @param _trancheAmounts  Array of USDC payout amounts for each milestone
    /// @param _deadlines       Array of unix timestamp deadlines for each milestone
    /// @param _contentIds      Array of platform content IDs for each milestone
    /// @return campaignId      The ID assigned to this campaign
    /// @return escrowAddress   The address of the deployed CampaignEscrow contract
    function createCampaign(
        address _creator,
        string memory _ipfsBriefHash,
        MilestoneLib.Platform[] memory _platforms,
        MilestoneLib.MetricType[] memory _metricTypes,
        uint256[] memory _thresholds,
        uint256[] memory _trancheAmounts,
        uint256[] memory _deadlines,
        string[] memory _contentIds
    ) external returns (uint256 campaignId, address escrowAddress) {
        // Validate inputs
        require(_creator != address(0), "CampaignFactory: invalid creator address");
        require(_creator != msg.sender, "CampaignFactory: brand and creator cannot be same");
        require(bytes(_ipfsBriefHash).length > 0, "CampaignFactory: brief hash required");
        require(_platforms.length > 0, "CampaignFactory: at least one milestone required");
        require(
            _platforms.length == _metricTypes.length &&
            _platforms.length == _thresholds.length &&
            _platforms.length == _trancheAmounts.length &&
            _platforms.length == _deadlines.length &&
            _platforms.length == _contentIds.length,
            "CampaignFactory: milestone arrays length mismatch"
        );

        // Increment campaign counter — IDs start at 1
        campaignCount++;
        campaignId = campaignCount;

        // Deploy a fresh isolated escrow contract for this campaign
        CampaignEscrow escrow = new CampaignEscrow(
            campaignId,
            msg.sender,     // brand
            _creator,
            usdc,
            reputationToken,
            metricsConsumer,
            _ipfsBriefHash
        );

        escrowAddress = address(escrow);

        // Register in mappings
        campaignEscrows[campaignId] = escrowAddress;
        brandCampaigns[msg.sender].push(campaignId);
        creatorCampaigns[_creator].push(campaignId);

        // Add milestones to the escrow
        // Note: deposit() must be called by brand BEFORE addMilestone checks pass,
        // so milestones are added here at zero deposit — deposit called separately after.
        // Validation of tranche vs deposit happens at deposit + addMilestone time.
        for (uint256 i = 0; i < _platforms.length; i++) {
            escrow.addMilestone(
                _platforms[i],
                _metricTypes[i],
                _thresholds[i],
                _trancheAmounts[i],
                _deadlines[i],
                _contentIds[i]
            );
        }

        emit CampaignCreated(
            campaignId,
            escrowAddress,
            msg.sender,
            _creator,
            _ipfsBriefHash
        );
    }

    // ─────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────

    /// @notice Returns the escrow address for a given campaign ID
    function getEscrowAddress(uint256 _campaignId) external view returns (address) {
        require(campaignEscrows[_campaignId] != address(0), "CampaignFactory: campaign not found");
        return campaignEscrows[_campaignId];
    }

    /// @notice Returns all campaign IDs for a brand wallet
    function getBrandCampaigns(address _brand) external view returns (uint256[] memory) {
        return brandCampaigns[_brand];
    }

    /// @notice Returns all campaign IDs for a creator wallet
    function getCreatorCampaigns(address _creator) external view returns (uint256[] memory) {
        return creatorCampaigns[_creator];
    }

    // ─────────────────────────────────────────────
    // Admin Functions
    // ─────────────────────────────────────────────

    /// @notice Updates protocol-level addresses — only callable by owner
    /// Useful if MetricsConsumer or ReputationToken is redeployed
    function updateProtocolAddresses(
        address _usdc,
        address _reputationToken,
        address _metricsConsumer
    ) external onlyOwner {
        require(_usdc != address(0), "CampaignFactory: invalid USDC address");
        require(_reputationToken != address(0), "CampaignFactory: invalid ReputationToken address");
        require(_metricsConsumer != address(0), "CampaignFactory: invalid MetricsConsumer address");

        usdc = _usdc;
        reputationToken = _reputationToken;
        metricsConsumer = _metricsConsumer;

        emit ProtocolAddressesUpdated(_usdc, _reputationToken, _metricsConsumer);
    }
}