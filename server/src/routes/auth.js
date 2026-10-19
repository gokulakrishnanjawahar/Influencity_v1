// ─────────────────────────────────────────────
// Auth Routes — Sign-In With Ethereum (EIP-4361)
// ─────────────────────────────────────────────
//   POST /auth/nonce   → { nonce }                 single-use, 10-minute TTL
//   POST /auth/verify  { message, signature }      → { token, address, expiresAt }
//
// /verify accepts the signature only if the signed message:
//   - names this app's domain (so a signature collected by another site fails)
//   - targets this app's chain
//   - carries a nonce this server issued, unexpired and never used before
//   - was signed by the address it claims — EOAs and smart-contract wallets
// and then burns the nonce, so the same signed message cannot be used twice.
// ─────────────────────────────────────────────

import express from "express";
import { randomBytes } from "crypto";
import { createPublicClient, http } from "viem";
import { parseSiweMessage, verifySiweMessage } from "viem/siwe";
import { createNonce, consumeNonce } from "../services/supabase.js";
import { issueSession } from "../services/session.js";

const router = express.Router();

const NONCE_TTL_MS = 10 * 60 * 1000;

let publicClient;
function getPublicClient() {
  if (!publicClient) {
    if (!process.env.RPC_URL) throw new Error("RPC_URL not set");
    publicClient = createPublicClient({ transport: http(process.env.RPC_URL) });
  }
  return publicClient;
}

/// The domains (host[:port]) a SIWE message may name. Exact matches only — a
/// wildcard such as *.vercel.app would accept a message signed for any
/// attacker's deployment on the same platform.
function allowedDomains() {
  const domains = new Set(["localhost:5173"]);
  if (process.env.CLIENT_URL) {
    try {
      domains.add(new URL(process.env.CLIENT_URL).host);
    } catch (_error) {
      // Malformed CLIENT_URL — only localhost will be accepted
    }
  }
  for (const d of (process.env.SIWE_ALLOWED_DOMAINS || "").split(",")) {
    if (d.trim()) domains.add(d.trim());
  }
  return domains;
}

function expectedChainId() {
  return Number(process.env.CHAIN_ID || 80002);
}

// ─────────────────────────────────────────────
// POST /auth/nonce
// ─────────────────────────────────────────────

router.post("/nonce", async (req, res, next) => {
  try {
    // EIP-4361 nonces are alphanumeric, at least 8 characters
    const nonce = randomBytes(16).toString("hex");
    await createNonce(nonce, new Date(Date.now() + NONCE_TTL_MS));
    res.json({ nonce });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────
// POST /auth/verify
// ─────────────────────────────────────────────

router.post("/verify", async (req, res, next) => {
  try {
    const { message, signature } = req.body || {};
    if (typeof message !== "string" || typeof signature !== "string") {
      return res.status(400).json({ error: "message and signature are required" });
    }

    let parsed;
    try {
      parsed = parseSiweMessage(message);
    } catch (_error) {
      return res.status(400).json({ error: "Not a valid SIWE message" });
    }

    if (!parsed.address || !parsed.domain || !parsed.nonce) {
      return res.status(400).json({ error: "SIWE message is missing required fields" });
    }
    if (!allowedDomains().has(parsed.domain)) {
      return res.status(401).json({ error: `Sign-in message is for another site (${parsed.domain})` });
    }
    if (parsed.chainId !== expectedChainId()) {
      return res.status(401).json({ error: "Sign-in message is for the wrong chain" });
    }

    // Checks domain, nonce, address and expiry fields, then the signature
    // itself — including ERC-1271 / ERC-6492 smart-contract wallets.
    const valid = await verifySiweMessage(getPublicClient(), {
      message,
      signature,
      domain: parsed.domain,
      nonce: parsed.nonce,
    });
    if (!valid) {
      return res.status(401).json({ error: "Signature verification failed" });
    }

    // Burn the nonce only after the signature checks out, and refuse if it was
    // never issued, has expired, or was already used. This is atomic, so two
    // concurrent requests with the same message cannot both succeed.
    if (!(await consumeNonce(parsed.nonce))) {
      return res.status(401).json({ error: "Sign-in nonce is invalid, expired or already used" });
    }

    const address = parsed.address.toLowerCase();
    const { token, expiresAt } = await issueSession(address);

    res.json({ token, address, expiresAt });
  } catch (error) {
    next(error);
  }
});

export default router;
