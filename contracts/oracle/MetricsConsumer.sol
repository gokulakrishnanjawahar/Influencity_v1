// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import {ConfirmedOwner} from "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";
import "../core/CampaignEscrow.sol";

/// @title MetricsConsumer
/// @notice Chainlink Functions client that receives verified metrics
/// from decentralised Chainlink nodes and forwards them to the
/// correct CampaignEscrow contract.
/// This is the ONLY contract authorised to call receiveVerifiedMetric()
/// on any CampaignEscrow.
contract MetricsConsumer is FunctionsClient, ConfirmedOwner {
    using FunctionsRequest for FunctionsRequest.Request;

    // ─────────────────────────────────────────────
    // State Variables
    // ─────────────────────────────────────────────

    /// @notice Chainlink subscription ID — pays for Functions requests in LINK
    uint64 public subscriptionId;

    /// @notice Gas limit for the Chainlink Functions callback
    uint32 public callbackGasLimit = 300_000;

    /// @notice DON ID — identifies which Chainlink Decentralised Oracle Network to use
    bytes32 public donId;

    /// @notice The JS source code executed by Chainlink nodes for YouTube
    string public youtubeSourceCode;

    /// @notice The JS source code executed by Chainlink nodes for Twitch
    string public twitchSourceCode;

    /// @notice The JS source code executed by Chainlink nodes for LinkedIn
    string public linkedinSourceCode;

    /// @notice Tracks pending requests: requestId => RequestContext
    struct RequestContext {
        address escrowAddress;
        uint256 milestoneIndex;
        uint8 platform;          // 0=YOUTUBE, 1=TWITCH, 2=LINKEDIN
        bool fulfilled;
    }

    mapping(bytes32 => RequestContext) public pendingRequests;

    /// @notice Whitelisted CampaignEscrow contracts that can request metric checks
    mapping(address => bool) public authorisedEscrows;

    /// @notice Address of the CampaignFactory — only contract allowed to authorise escrows
    address public campaignFactory;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event MetricRequested(
        bytes32 indexed requestId,
        address indexed escrowAddress,
        uint256 indexed milestoneIndex,
        uint8 platform,
        string contentId
    );

    event MetricFulfilled(
        bytes32 indexed requestId,
        address indexed escrowAddress,
        uint256 indexed milestoneIndex,
        uint256 reportedValue
    );

    event MetricRequestFailed(
        bytes32 indexed requestId,
        bytes error
    );

    event SourceCodeUpdated(uint8 platform);
    event EscrowAuthorised(address indexed escrowAddress);
    event CampaignFactorySet(address indexed factory);

    // ─────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────

    modifier onlyAuthorisedEscrow() {
        require(
            authorisedEscrows[msg.sender],
            "MetricsConsumer: caller is not an authorised escrow"
        );
        _;
    }

    modifier onlyFactory() {
        require(
            msg.sender == campaignFactory || msg.sender == owner(),
            "MetricsConsumer: caller is not the factory or owner"
        );
        _;
    }

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    /// @param _router         Chainlink Functions router address (Base Sepolia / Base mainnet)
    /// @param _subscriptionId Chainlink subscription ID (created on functions.chain.link)
    /// @param _donId          DON ID for the target network
    constructor(
        address _router,
        uint64 _subscriptionId,
        bytes32 _donId
    ) FunctionsClient(_router) ConfirmedOwner(msg.sender) {
        subscriptionId = _subscriptionId;
        donId = _donId;
    }

    // ─────────────────────────────────────────────
    // Request Metric Verification
    // ─────────────────────────────────────────────

    /// @notice Requests a verified metric from Chainlink Functions.
    /// Called by an authorised CampaignEscrow (via AutomationHandler).
    /// Each Chainlink node independently calls the platform API and the
    /// network reaches consensus before posting the result on-chain.
    /// @param milestoneIndex Index of the milestone being verified
    /// @param platform       0=YOUTUBE, 1=TWITCH, 2=LINKEDIN
    /// @param contentId      Platform-specific content identifier (e.g. video ID, clip slug)
    /// @return requestId     Unique ID for tracking the request
    function requestMetric(
        uint256 milestoneIndex,
        uint8 platform,
        string memory contentId
    ) external onlyAuthorisedEscrow returns (bytes32 requestId) {
        require(platform <= 2, "MetricsConsumer: invalid platform");
        require(bytes(contentId).length > 0, "MetricsConsumer: contentId required");

        // Select source code based on platform
        string memory sourceCode = _getSourceCode(platform);
        require(bytes(sourceCode).length > 0, "MetricsConsumer: source code not set for platform");

        // Build Chainlink Functions request
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(sourceCode);

        // Pass content ID as an argument to the JS script
        string[] memory args = new string[](1);
        args[0] = contentId;
        req.setArgs(args);

        // Send request to Chainlink network
        requestId = _sendRequest(
            req.encodeCBOR(),
            subscriptionId,
            callbackGasLimit,
            donId
        );

        // Store request context for fulfillment callback
        pendingRequests[requestId] = RequestContext({
            escrowAddress: msg.sender,
            milestoneIndex: milestoneIndex,
            platform: platform,
            fulfilled: false
        });

        emit MetricRequested(requestId, msg.sender, milestoneIndex, platform, contentId);
    }

    // ─────────────────────────────────────────────
    // Chainlink Fulfillment Callback
    // ─────────────────────────────────────────────

    /// @notice Called by Chainlink network when the request is fulfilled.
    /// Decodes the metric value and forwards it to the escrow.
    /// @dev Overrides FunctionsClient.fulfillRequest
    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        RequestContext storage ctx = pendingRequests[requestId];
        require(ctx.escrowAddress != address(0), "MetricsConsumer: unknown requestId");
        require(!ctx.fulfilled, "MetricsConsumer: request already fulfilled");

        ctx.fulfilled = true;

        // If Chainlink reported an error, emit it and don't update escrow
        if (err.length > 0) {
            emit MetricRequestFailed(requestId, err);
            return;
        }

        // Decode the metric value (uint256) returned by the JS script
        uint256 reportedValue = abi.decode(response, (uint256));

        // Forward verified metric to the escrow contract
        CampaignEscrow(ctx.escrowAddress).receiveVerifiedMetric(
            ctx.milestoneIndex,
            reportedValue
        );

        emit MetricFulfilled(requestId, ctx.escrowAddress, ctx.milestoneIndex, reportedValue);
    }

    // ─────────────────────────────────────────────
    // Admin — Source Code Management
    // ─────────────────────────────────────────────

    /// @notice Sets the JS source code for a specific platform.
    /// This is the code Chainlink nodes execute when fetching metrics.
    function setSourceCode(uint8 platform, string memory code) external onlyOwner {
        require(platform <= 2, "MetricsConsumer: invalid platform");
        require(bytes(code).length > 0, "MetricsConsumer: code cannot be empty");

        if (platform == 0) youtubeSourceCode = code;
        else if (platform == 1) twitchSourceCode = code;
        else linkedinSourceCode = code;

        emit SourceCodeUpdated(platform);
    }

    function _getSourceCode(uint8 platform) internal view returns (string memory) {
        if (platform == 0) return youtubeSourceCode;
        if (platform == 1) return twitchSourceCode;
        return linkedinSourceCode;
    }

    // ─────────────────────────────────────────────
    // Admin — Escrow Authorisation
    // ─────────────────────────────────────────────

    /// @notice Authorises a CampaignEscrow to request metric verifications.
    /// Called by CampaignFactory after deploying a new escrow.
    function authoriseEscrow(address escrowAddress) external onlyFactory {
        require(escrowAddress != address(0), "MetricsConsumer: invalid address");
        authorisedEscrows[escrowAddress] = true;
        emit EscrowAuthorised(escrowAddress);
    }

    /// @notice Sets the CampaignFactory address that can authorise escrows
    function setCampaignFactory(address _factory) external onlyOwner {
        require(_factory != address(0), "MetricsConsumer: invalid factory address");
        campaignFactory = _factory;
        emit CampaignFactorySet(_factory);
    }

    // ─────────────────────────────────────────────
    // Admin — Config Updates
    // ─────────────────────────────────────────────

    function updateSubscriptionId(uint64 _subscriptionId) external onlyOwner {
        subscriptionId = _subscriptionId;
    }

    function updateCallbackGasLimit(uint32 _gasLimit) external onlyOwner {
        callbackGasLimit = _gasLimit;
    }

    function updateDonId(bytes32 _donId) external onlyOwner {
        donId = _donId;
    }
}