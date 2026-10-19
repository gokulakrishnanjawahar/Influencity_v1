// ─────────────────────────────────────────────
// Session Tokens
// ─────────────────────────────────────────────
// After a wallet proves control with a SIWE signature, the server issues a
// short-lived signed token naming that wallet. Every authenticated request
// carries the token instead of re-sending a signature, so a signature is used
// exactly once — at sign-in — and can never be replayed against the API.
// ─────────────────────────────────────────────

import { SignJWT, jwtVerify } from "jose";

const ISSUER = "influencity";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  // Fail closed: without a strong secret anyone could mint a session.
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

/// @returns {Promise<{ token: string, expiresAt: number }>}
export async function issueSession(walletAddress) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(walletAddress.toLowerCase())
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secretKey());
  return { token, expiresAt };
}

/// @returns {Promise<string>} the lowercase wallet address the token was issued to
export async function verifySession(token) {
  const { payload } = await jwtVerify(token, secretKey(), {
    issuer: ISSUER,
    algorithms: ["HS256"],
  });
  return payload.sub;
}
