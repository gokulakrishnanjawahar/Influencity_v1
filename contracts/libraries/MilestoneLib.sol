// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library MilestoneLib {

    /// @notice How long after a milestone's deadline the oracle may still post
    /// a reading. Without it, an oracle that reports even a minute late lets the
    /// deadline lapse and refunds the brand for a target the creator hit.
    /// Readings taken in this window can include views gained after the
    /// deadline; capping the window at two days bounds that slack.
    uint256 internal constant GRACE_PERIOD = 2 days;

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
        // Platform-specific content ID e.g. YouTube video ID or Twitch clip slug.
        // Set by the creator in submitProof — the content does not exist yet
        // when the brand creates the campaign.
        string contentId;
        // The creator's channel on the platform (YouTube channel ID, Twitch
        // login, LinkedIn organisation URN). The oracle checks that contentId
        // belongs to this channel and that the channel names the creator's wallet.
        string channelId;
        // CID of the creator's content proof pinned to IPFS
        string ipfsProofHash;
        // Current state of this milestone
        MilestoneStatus status;
    }

    // ─────────────────────────────────────────────
    // Validation Helpers
    // ─────────────────────────────────────────────

    /// @notice Checks if the milestone's delivery deadline has passed. After
    /// this the creator can no longer submit content.
    function isPastDeadline(Milestone storage milestone) internal view returns (bool) {
        return block.timestamp > milestone.deadline;
    }

    /// @notice Checks if the oracle grace window after the deadline has closed.
    /// Only then can an unmet milestone be failed and refunded to the brand.
    function isExpired(Milestone storage milestone) internal view returns (bool) {
        return block.timestamp > milestone.deadline + GRACE_PERIOD;
    }

    /// @notice Whether the oracle can actually measure this metric on this
    /// platform. A milestone that cannot be measured can never pay out, so it is
    /// rejected at creation instead of failing silently at its deadline.
    function isSupportedMetric(Platform platform, MetricType metricType)
        internal
        pure
        returns (bool)
    {
        if (platform == Platform.YOUTUBE) {
            return metricType == MetricType.VIEWS || metricType == MetricType.FOLLOWERS;
        }
        if (platform == Platform.TWITCH) {
            return metricType == MetricType.VIEWS
                || metricType == MetricType.CONCURRENT_VIEWERS
                || metricType == MetricType.FOLLOWERS;
        }
        // LINKEDIN
        return metricType == MetricType.VIEWS || metricType == MetricType.CLICKS;
    }

    /// @notice The metric name passed to the Chainlink Functions scripts
    function metricTypeName(MetricType metricType) internal pure returns (string memory) {
        if (metricType == MetricType.VIEWS) return "VIEWS";
        if (metricType == MetricType.CLICKS) return "CLICKS";
        if (metricType == MetricType.FOLLOWERS) return "FOLLOWERS";
        if (metricType == MetricType.WATCH_TIME) return "WATCH_TIME";
        return "CONCURRENT_VIEWERS";
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