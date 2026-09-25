// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockMetricsConsumer
/// @notice Stands in for MetricsConsumer when testing AutomationHandler.
/// Records how many metric requests it received and can be told to revert, so
/// tests can prove that one failing request does not abort an entire upkeep.
/// NEVER deploy this to mainnet.
contract MockMetricsConsumer {

    /// @notice Number of successful requestMetric calls received
    uint256 public requestCount;

    /// @notice When true, every requestMetric call reverts
    bool public shouldRevert;

    event MetricRequestReceived(
        uint256 indexed milestoneIndex,
        uint8 platform,
        string contentId
    );

    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    /// @notice Mirrors MetricsConsumer.requestMetric's selector and return type
    /// @notice Last escrow a request was placed for — lets tests assert that the
    /// handler forwards the escrow rather than its own address.
    address public lastEscrow;

    function requestMetric(
        address escrowAddress,
        uint256 milestoneIndex,
        uint8 platform,
        string memory contentId
    ) external returns (bytes32 requestId) {
        require(!shouldRevert, "MockMetricsConsumer: forced failure");

        requestCount++;
        lastEscrow = escrowAddress;
        requestId = keccak256(
            abi.encodePacked(milestoneIndex, platform, contentId, requestCount)
        );

        emit MetricRequestReceived(milestoneIndex, platform, contentId);
    }
}
