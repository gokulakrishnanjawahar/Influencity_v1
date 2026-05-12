// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IReputationToken
/// @notice Interface for the ReputationToken ERC-1155 soulbound contract
interface IReputationToken {
    /// @notice Mints a reputation token to the creator on milestone completion
    /// @param to            Creator wallet address
    /// @param milestoneIndex Index of the completed milestone (used to derive token ID)
    /// @param campaignId    ID of the campaign this milestone belongs to
    function mint(
        address to,
        uint256 milestoneIndex,
        uint256 campaignId
    ) external;
}