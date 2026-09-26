// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The single FunctionsClient entry point the DON uses to deliver results.
interface IFunctionsClientLike {
    function handleOracleFulfillment(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) external;
}

/// @title MockFunctionsRouter
/// @notice Minimal stand-in for the Chainlink Functions router so MetricsConsumer
/// can be tested without a live DON. Accepts requests, hands back a request ID,
/// and lets tests drive the fulfillment callback the way the real router does.
/// NEVER deploy this to mainnet.
contract MockFunctionsRouter {

    /// @notice Number of requests received
    uint256 public requestCount;

    /// @notice The most recent request ID handed out
    bytes32 public lastRequestId;

    event RequestSent(
        bytes32 indexed requestId,
        uint64 subscriptionId,
        uint32 callbackGasLimit
    );

    /// @notice Mirrors IFunctionsRouter.sendRequest — the only router function
    /// FunctionsClient._sendRequest actually calls.
    function sendRequest(
        uint64 subscriptionId,
        bytes calldata /* data */,
        uint16 /* dataVersion */,
        uint32 callbackGasLimit,
        bytes32 /* donId */
    ) external returns (bytes32 requestId) {
        requestCount++;
        requestId = keccak256(abi.encodePacked(msg.sender, requestCount));
        lastRequestId = requestId;

        emit RequestSent(requestId, subscriptionId, callbackGasLimit);
    }

    /// @notice Delivers a result to the consumer. FunctionsClient only accepts
    /// fulfillment from the router address, so this must be routed through here.
    /// @param response ABI-encoded uint256 on success, empty on error
    /// @param err      Non-empty when the DON itself reported a failure
    function fulfill(
        address consumer,
        bytes32 requestId,
        bytes calldata response,
        bytes calldata err
    ) external {
        IFunctionsClientLike(consumer).handleOracleFulfillment(requestId, response, err);
    }
}
