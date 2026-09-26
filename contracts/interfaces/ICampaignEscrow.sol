// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../libraries/MilestoneLib.sol";

/// @title ICampaignEscrow
/// @notice Interface for the CampaignEscrow contract — the subset of functions
/// other protocol contracts (oracle, automation) interact with.
interface ICampaignEscrow {
    /// @notice Called by the MetricsConsumer with a verified metric value
    /// @param milestoneIndex Index of the milestone being verified
    /// @param reportedValue  The verified metric value from the oracle
    function receiveVerifiedMetric(uint256 milestoneIndex, uint256 reportedValue) external;

    /// @notice Binds the chosen creator to the campaign, forming the agreement
    /// @param creator Wallet address of the selected creator
    function assignCreator(address creator) external;

    /// @notice Cancels an open campaign and refunds the locked balance to the brand
    function cancelCampaign() external;

    /// @notice Returns the number of milestones in the campaign
    function getMilestoneCount() external view returns (uint256);

    /// @notice Returns a single milestone by index
    function getMilestone(uint256 index) external view returns (MilestoneLib.Milestone memory);

    /// @notice Whether the campaign has been settled and can no longer pay out
    function isFinalized() external view returns (bool);

    /// @notice The brand that funded the campaign
    function brand() external view returns (address);

    /// @notice The assigned creator (address(0) until an agreement is formed)
    function creator() external view returns (address);

    /// @notice The unique campaign ID assigned by the CampaignFactory
    function campaignId() external view returns (uint256);
}
