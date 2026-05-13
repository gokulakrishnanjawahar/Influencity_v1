// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../core/CampaignEscrow.sol";
import "../libraries/MilestoneLib.sol";
import "./MetricsConsumer.sol";

/// @title AutomationHandler
/// @notice Chainlink Automation upkeep contract.
/// Periodically checks all registered campaigns to see if any milestones
/// need a fresh metric verification. When found, triggers the
/// MetricsConsumer to fetch the latest metric via Chainlink Functions.
/// Removes humans from the verification loop entirely.
contract AutomationHandler is AutomationCompatibleInterface, Ownable {

    // ─────────────────────────────────────────────
    // State Variables
    // ─────────────────────────────────────────────

    /// @notice The MetricsConsumer contract that talks to Chainlink Functions
    MetricsConsumer public metricsConsumer;

    /// @notice How often (in seconds) to check each campaign for metric updates
    /// Default = 24 hours per PRD §5.1
    uint256 public checkInterval = 24 hours;

    /// @notice Tracks campaigns registered for automated checks
    /// Each entry contains the escrow address + last check timestamp
    struct CampaignSchedule {
        address escrowAddress;
        uint256 lastCheckedAt;
        bool active;
    }

    /// @notice campaignId => CampaignSchedule
    mapping(uint256 => CampaignSchedule) public schedules;

    /// @notice Array of all registered campaign IDs (for iteration in checkUpkeep)
    uint256[] public campaignIds;

    /// @notice Maximum number of campaigns checked per upkeep call (gas limit safety)
    uint256 public maxCampaignsPerUpkeep = 5;

    /// @notice Address allowed to register new campaigns (CampaignFactory)
    address public campaignFactory;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event CampaignRegistered(uint256 indexed campaignId, address indexed escrowAddress);
    event CampaignDeactivated(uint256 indexed campaignId);
    event UpkeepPerformed(uint256[] campaignIds, uint256 timestamp);
    event MetricCheckTriggered(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        bytes32 requestId
    );
    event CheckIntervalUpdated(uint256 newInterval);
    event CampaignFactorySet(address indexed factory);

    // ─────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────

    modifier onlyFactory() {
        require(
            msg.sender == campaignFactory || msg.sender == owner(),
            "AutomationHandler: caller is not factory or owner"
        );
        _;
    }

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    constructor(address _metricsConsumer) Ownable(msg.sender) {
        require(_metricsConsumer != address(0), "AutomationHandler: invalid consumer address");
        metricsConsumer = MetricsConsumer(_metricsConsumer);
    }

    // ─────────────────────────────────────────────
    // Campaign Registration
    // ─────────────────────────────────────────────

    /// @notice Registers a new campaign for periodic metric checks.
    /// Called by CampaignFactory immediately after deploying an escrow.
    /// @param campaignId    The ID of the campaign
    /// @param escrowAddress Address of the deployed CampaignEscrow contract
    function registerCampaign(
        uint256 campaignId,
        address escrowAddress
    ) external onlyFactory {
        require(escrowAddress != address(0), "AutomationHandler: invalid escrow address");
        require(!schedules[campaignId].active, "AutomationHandler: campaign already registered");

        schedules[campaignId] = CampaignSchedule({
            escrowAddress: escrowAddress,
            lastCheckedAt: 0,
            active: true
        });

        campaignIds.push(campaignId);
        emit CampaignRegistered(campaignId, escrowAddress);
    }

    /// @notice Deactivates a campaign so it stops being checked.
    /// Called when a campaign is finalized or all milestones resolved.
    function deactivateCampaign(uint256 campaignId) external {
        CampaignSchedule storage sched = schedules[campaignId];
        require(sched.active, "AutomationHandler: campaign not active");

        // Allow either the escrow itself or the owner to deactivate
        require(
            msg.sender == sched.escrowAddress || msg.sender == owner(),
            "AutomationHandler: not authorized to deactivate"
        );

        sched.active = false;
        emit CampaignDeactivated(campaignId);
    }

    // ─────────────────────────────────────────────
    // Chainlink Automation Interface
    // ─────────────────────────────────────────────

    /// @notice Called OFF-CHAIN by Chainlink Automation to check if upkeep is needed.
    /// Returns the list of campaigns that are due for a metric check.
    /// This function is NOT executed on-chain — it's a free off-chain check.
    /// @dev Iterates through campaigns and returns those past their check interval.
    function checkUpkeep(bytes calldata /* checkData */)
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        uint256[] memory dueCampaigns = new uint256[](maxCampaignsPerUpkeep);
        uint256 count = 0;

        for (uint256 i = 0; i < campaignIds.length && count < maxCampaignsPerUpkeep; i++) {
            uint256 cid = campaignIds[i];
            CampaignSchedule memory sched = schedules[cid];

            if (!sched.active) continue;

            // Due if never checked, or interval has passed
            if (
                sched.lastCheckedAt == 0 ||
                block.timestamp >= sched.lastCheckedAt + checkInterval
            ) {
                dueCampaigns[count] = cid;
                count++;
            }
        }

        if (count == 0) {
            return (false, "");
        }

        // Trim array to actual count
        uint256[] memory finalList = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            finalList[i] = dueCampaigns[i];
        }

        upkeepNeeded = true;
        performData = abi.encode(finalList);
    }

    /// @notice Called ON-CHAIN by Chainlink Automation when checkUpkeep returns true.
    /// For each campaign in the list, requests a metric verification for every
    /// pending milestone via the MetricsConsumer.
    function performUpkeep(bytes calldata performData) external override {
        uint256[] memory dueCampaigns = abi.decode(performData, (uint256[]));

        for (uint256 i = 0; i < dueCampaigns.length; i++) {
            uint256 cid = dueCampaigns[i];
            CampaignSchedule storage sched = schedules[cid];

            // Re-validate on-chain (someone could have called this directly)
            if (!sched.active) continue;
            if (block.timestamp < sched.lastCheckedAt + checkInterval && sched.lastCheckedAt != 0) {
                continue;
            }

            _triggerMetricChecks(cid, sched.escrowAddress);
            sched.lastCheckedAt = block.timestamp;
        }

        emit UpkeepPerformed(dueCampaigns, block.timestamp);
    }

    // ─────────────────────────────────────────────
    // Internal — Trigger Per-Milestone Checks
    // ─────────────────────────────────────────────

    /// @notice For a given campaign, requests a fresh metric for every PENDING milestone.
    function _triggerMetricChecks(uint256 campaignId, address escrowAddress) internal {
        CampaignEscrow escrow = CampaignEscrow(escrowAddress);
        uint256 milestoneCount = escrow.getMilestoneCount();

        for (uint256 i = 0; i < milestoneCount; i++) {
            MilestoneLib.Milestone memory m = escrow.getMilestone(i);

            // Only check milestones that are still pending and have a contentId
            if (m.status != MilestoneLib.MilestoneStatus.PENDING) continue;
            if (bytes(m.contentId).length == 0) continue;

            bytes32 requestId = metricsConsumer.requestMetric(
                i,
                uint8(m.platform),
                m.contentId
            );

            emit MetricCheckTriggered(campaignId, i, requestId);
        }
    }

    // ─────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────

    function setCheckInterval(uint256 _intervalSeconds) external onlyOwner {
        require(_intervalSeconds >= 1 hours, "AutomationHandler: interval too short");
        checkInterval = _intervalSeconds;
        emit CheckIntervalUpdated(_intervalSeconds);
    }

    function setMaxCampaignsPerUpkeep(uint256 _max) external onlyOwner {
        require(_max > 0 && _max <= 50, "AutomationHandler: invalid max");
        maxCampaignsPerUpkeep = _max;
    }

    function setCampaignFactory(address _factory) external onlyOwner {
        require(_factory != address(0), "AutomationHandler: invalid factory address");
        campaignFactory = _factory;
        emit CampaignFactorySet(_factory);
    }

    function setMetricsConsumer(address _metricsConsumer) external onlyOwner {
        require(_metricsConsumer != address(0), "AutomationHandler: invalid consumer address");
        metricsConsumer = MetricsConsumer(_metricsConsumer);
    }

    // ─────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────

    function getRegisteredCampaignCount() external view returns (uint256) {
        return campaignIds.length;
    }

    function getCampaignSchedule(uint256 campaignId)
        external
        view
        returns (CampaignSchedule memory)
    {
        return schedules[campaignId];
    }
}