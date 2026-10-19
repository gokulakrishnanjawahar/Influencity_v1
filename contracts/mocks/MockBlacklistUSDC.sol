// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./MockUSDC.sol";

/// @title MockBlacklistUSDC
/// @notice MockUSDC plus Circle-style blacklisting: a blacklisted address can
/// neither send nor receive. Lets tests prove a blacklisted creator or brand
/// cannot freeze an escrow for the other party.
/// NEVER deploy this to mainnet.
contract MockBlacklistUSDC is MockUSDC {

    mapping(address => bool) public isBlacklisted;

    function setBlacklisted(address account, bool blacklisted) external onlyOwner {
        isBlacklisted[account] = blacklisted;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!isBlacklisted[from], "Blacklistable: account is blacklisted");
        require(!isBlacklisted[to], "Blacklistable: account is blacklisted");
        super._update(from, to, value);
    }
}
