// ─────────────────────────────────────────────
// Auth Middleware — SIWE Verification
// ─────────────────────────────────────────────
// Sign-In with Ethereum (SIWE) lets users prove they own
// a wallet address without a password.
// The frontend signs a message with MetaMask.
// This middleware verifies that signature server-side.
// ─────────────────────────────────────────────

import { ethers } from "ethers";

/// @notice Verifies a SIWE signature from the request headers.
/// Attaches the verified wallet address to req.walletAddress.
///
/// Expected headers:
///   x-wallet-address  : "0x1234..."
///   x-wallet-signature: "0xabcd..." (signature of the message)
///   x-siwe-message    : the original message that was signed

export function requireAuth(req, res, next) {
  try {
    const walletAddress = req.headers["x-wallet-address"];
    const signature = req.headers["x-wallet-signature"];
    const rawMessage = req.headers["x-siwe-message"];

    if (!walletAddress || !signature || !rawMessage) {
      return res.status(401).json({
        error: "Authentication required. Provide wallet address and signature.",
      });
    }

    // The frontend base64-encodes the SIWE message because HTTP header values
    // can't contain newlines. Decode here so we verify against the original.
    let message;
    try {
      message = Buffer.from(rawMessage, "base64").toString("utf8");
    } catch (_e) {
      message = rawMessage;
    }

    if (!ethers.isAddress(walletAddress)) {
      return res.status(401).json({ error: "Invalid wallet address format" });
    }

    // Recover the address that signed the message
    const recoveredAddress = ethers.verifyMessage(message, signature);

    // Verify recovered address matches claimed address
    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(401).json({
        error: "Signature verification failed — address mismatch",
      });
    }

    // Attach verified wallet address to request
    req.walletAddress = walletAddress.toLowerCase();
    next();
  } catch (error) {
    console.error("[Auth] SIWE verification error:", error);
    return res.status(401).json({ error: "Invalid signature" });
  }
}

/// @notice Weak auth — only verifies address format, no signature check.
/// Used for read-only routes where we just need to know who's asking.
export function optionalAuth(req, res, next) {
  const walletAddress = req.headers["x-wallet-address"];
  if (walletAddress && ethers.isAddress(walletAddress)) {
    req.walletAddress = walletAddress.toLowerCase();
  }
  next();
}

/// @notice Checks that the authenticated wallet matches a specific address.
/// Used to ensure a creator can only submit proof for their own campaigns.
export function requireWalletMatch(addressField) {
  return (req, res, next) => {
    const target = req.body[addressField] || req.params[addressField];
    if (!target) return next();

    if (req.walletAddress !== target.toLowerCase()) {
      return res.status(403).json({
        error: "Forbidden — wallet address mismatch",
      });
    }
    next();
  };
}