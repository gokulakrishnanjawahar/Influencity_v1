// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../core/CampaignEscrow.sol";

/// @title MockMetricsOracle
/// @notice Simulates Chainlink Functions oracle responses for local Hardhat testing.
/// In production, MetricsConsumer.sol receives verified data from Chainlink nodes.
/// This mock lets us manually inject metric values in tests to trigger
/// milestone releases and refunds without needing real Chainlink infrastructure.
/// NEVER deploy this to mainnet.
contract MockMetricsOracle {

    // ─────────────────────────────────────────────
    // State Variables
    // ─────────────────────────────────────────────

    /// @notice Owner of the mock oracle — controls who can submit metrics
    address public owner;

    /// @notice Authorised test callers (test scripts and contracts)
    mapping(address => bool) public authorisedCallers;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event MockMetricSubmitted(
        address indexed escrowAddress,
        uint256 indexed milestoneIndex,
        uint256 reportedValue
    );

    // ─────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "MockMetricsOracle: caller is not owner");
        _;
    }

    modifier onlyAuthorised() {
        require(
            authorisedCallers[msg.sender] || msg.sender == owner,
            "MockMetricsOracle: caller is not authorised"
        );
        _;
    }

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
        // Owner is always authorised
        authorisedCallers[msg.sender] = true;
    }

    // ─────────────────────────────────────────────
    // Core — Simulate Oracle Response
    // ─────────────────────────────────────────────

    /// @notice Simulates a Chainlink oracle posting a verified metric to an escrow.
    /// Directly calls receiveVerifiedMetric() on the target CampaignEscrow.
    /// @param escrowAddress   Address of the CampaignEscrow to post the result to
    /// @param milestoneIndex  Which milestone is being verified
    /// @param reportedValue   The simulated metric value (e.g. 75000 for 75k views)
    function submitMetric(
        address escrowAddress,
        uint256 milestoneIndex,
        uint256 reportedValue
    ) external onlyAuthorised {
        require(escrowAddress != address(0), "MockMetricsOracle: invalid escrow address");

        CampaignEscrow escrow = CampaignEscrow(escrowAddress);
        escrow.receiveVerifiedMetric(milestoneIndex, reportedValue);

        emit MockMetricSubmitted(escrowAddress, milestoneIndex, reportedValue);
    }

    /// @notice Simulates multiple metric submissions in one transaction.
    /// Useful for testing campaigns with many milestones efficiently.
    /// @param escrowAddress    Address of the CampaignEscrow
    /// @param milestoneIndexes Array of milestone indexes to verify
    /// @param reportedValues   Array of metric values — must match milestoneIndexes length
    function submitMetricBatch(
        address escrowAddress,
        uint256[] memory milestoneIndexes,
        uint256[] memory reportedValues
    ) external onlyAuthorised {
        require(escrowAddress != address(0), "MockMetricsOracle: invalid escrow address");
        require(
            milestoneIndexes.length == reportedValues.length,
            "MockMetricsOracle: array length mismatch"
        );

        CampaignEscrow escrow = CampaignEscrow(escrowAddress);

        for (uint256 i = 0; i < milestoneIndexes.length; i++) {
            escrow.receiveVerifiedMetric(milestoneIndexes[i], reportedValues[i]);
            emit MockMetricSubmitted(escrowAddress, milestoneIndexes[i], reportedValues[i]);
        }
    }

    // ─────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────

    /// @notice No-op stand-in for MetricsConsumer.authoriseEscrow so that
    /// CampaignFactory can wire every escrow the same way regardless of whether
    /// the real Chainlink consumer or this mock is deployed. The mock has no
    /// per-escrow permissions — submitMetric is gated on the caller instead.
    function authoriseEscrow(address) external {}

    /// @notice Adds an authorised caller (e.g. a test contract or script wallet)
    function addAuthorisedCaller(address caller) external onlyOwner {
        authorisedCallers[caller] = true;
    }

    /// @notice Removes an authorised caller
    function removeAuthorisedCaller(address caller) external onlyOwner {
        authorisedCallers[caller] = false;
    }
}