// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library MilestoneLib {

    // ─────────────────────────────────────────────
    // Enums
    // ─────────────────────────────────────────────

    enum Platform {
        YOUTUBE,
        TWITCH,
        LINKEDIN
    }

    enum MetricType {
        VIEWS,
        CLICKS,
        FOLLOWERS,
        WATCH_TIME,
        CONCURRENT_VIEWERS
    }

    enum MilestoneStatus {
        PENDING,
        MET,
        FAILED
    }

    // ─────────────────────────────────────────────
    // Structs
    // ─────────────────────────────────────────────

    struct Milestone {
        // Which platform this milestone tracks
        Platform platform;
        // What metric to measure
        MetricType metricType;
        // The numeric target e.g. 50000 for 50k views
        uint256 threshold;
        // USDC amount released when this milestone is met (in 6 decimal USDC units)
        uint256 trancheAmount;
        // Unix timestamp — if metric not met by this time, milestone fails
        uint256 deadline;
        // Platform-specific content ID e.g. YouTube video ID or Twitch clip slug
        string contentId;
        // CID of the creator's content proof pinned to IPFS via web3.storage
        string ipfsProofHash;
        // Current state of this milestone
        MilestoneStatus status;
    }

    // ─────────────────────────────────────────────
    // Validation Helpers
    // ─────────────────────────────────────────────

    /// @notice Checks if a milestone deadline has passed
    /// @param milestone The milestone to check
    /// @return true if the current time is past the deadline
    function isExpired(Milestone storage milestone) internal view returns (bool) {
        return block.timestamp > milestone.deadline;
    }

    /// @notice Checks if a milestone is still actionable (pending and not expired)
    /// @param milestone The milestone to check
    /// @return true if the milestone can still be fulfilled
    function isPending(Milestone storage milestone) internal view returns (bool) {
        return milestone.status == MilestoneStatus.PENDING;
    }

    /// @notice Validates that a milestone's core fields are properly set at creation time
    /// @param threshold The numeric target for the metric
    /// @param trancheAmount The USDC payout for this milestone
    /// @param deadline The unix timestamp deadline
    /// @return true if all fields are valid
    function isValidMilestone(
        uint256 threshold,
        uint256 trancheAmount,
        uint256 deadline
    ) internal view returns (bool) {
        return (
            threshold > 0 &&
            trancheAmount > 0 &&
            deadline > block.timestamp
        );
    }

    /// @notice Checks if a reported metric value meets the milestone threshold
    /// @param milestone The milestone to check against
    /// @param reportedValue The value returned by the oracle
    /// @return true if the reported value meets or exceeds the threshold
    function isThresholdMet(
        Milestone storage milestone,
        uint256 reportedValue
    ) internal view returns (bool) {
        return reportedValue >= milestone.threshold;
    }
}