// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IMetricsConsumer
/// @notice The slice of MetricsConsumer that CampaignFactory depends on.
/// Kept as an interface so the factory can wire escrows to either the real
/// Chainlink-backed consumer or a local mock without importing either.
interface IMetricsConsumer {
    /// @notice Permits an escrow to request metric verifications.
    function authoriseEscrow(address escrowAddress) external;

    /// @notice Requests a verified metric for one milestone of one escrow.
    /// @param escrowAddress The escrow the result must be delivered to
    function requestMetric(
        address escrowAddress,
        uint256 milestoneIndex,
        uint8 platform,
        string memory contentId
    ) external returns (bytes32 requestId);
}
