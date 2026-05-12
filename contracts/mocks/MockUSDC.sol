// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockUSDC
/// @notice Simulates USDC for local Hardhat testing.
/// Real USDC has 6 decimals — this mock matches that exactly.
/// NEVER deploy this to mainnet.
contract MockUSDC is ERC20, Ownable {

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    constructor() ERC20("Mock USDC", "USDC") Ownable(msg.sender) {}

    // ─────────────────────────────────────────────
    // Decimals Override
    // ─────────────────────────────────────────────

    /// @notice USDC uses 6 decimals, not the ERC20 default of 18
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    // ─────────────────────────────────────────────
    // Minting — test only
    // ─────────────────────────────────────────────

    /// @notice Mints USDC to any address for testing purposes
    /// @param to     Recipient address
    /// @param amount Amount in 6 decimal units (e.g. 100 USDC = 100_000_000)
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Allows any test wallet to mint their own USDC — no owner required
    /// Useful for test scripts where multiple wallets need funds quickly
    function faucet(uint256 amount) external {
        _mint(msg.sender, amount);
    }
}