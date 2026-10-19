// ─────────────────────────────────────────────
// Auth Middleware
// ─────────────────────────────────────────────
// Requests authenticate with the session token issued by POST /auth/verify,
// sent as `Authorization: Bearer <token>`. The token is only ever issued after
// a fresh SIWE signature over a server-issued, single-use nonce, so neither a
// stolen old signature nor a signature made for another site can be replayed.
// ─────────────────────────────────────────────

import { verifySession } from "../services/session.js";

function bearerToken(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token ? token : null;
}

/// @notice Rejects the request unless it carries a valid session token.
/// Sets req.walletAddress (lowercase) to the wallet that signed in.
export async function requireAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Sign in with your wallet to continue" });
  }

  try {
    req.walletAddress = await verifySession(token);
    next();
  } catch (error) {
    if (error.message?.includes("SESSION_SECRET")) return next(error);
    return res.status(401).json({ error: "Session expired or invalid — sign in again" });
  }
}

/// @notice Sets req.walletAddress when a valid session token is present, and
/// carries on without one. For read-only routes that personalise their output.
export async function optionalAuth(req, res, next) {
  const token = bearerToken(req);
  if (token) {
    try {
      req.walletAddress = await verifySession(token);
    } catch (_error) {
      // An invalid token on a public route is treated as anonymous
    }
  }
  next();
}
