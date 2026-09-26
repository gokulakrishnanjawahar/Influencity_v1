// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAutomationHandler
/// @notice The slice of AutomationHandler that CampaignFactory depends on.
interface IAutomationHandler {
    /// @notice Enrols a campaign in the periodic metric-check sweep.
    function registerCampaign(uint256 campaignId, address escrowAddress) external;
}
