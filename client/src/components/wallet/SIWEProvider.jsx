// ─────────────────────────────────────────────
// SIWEProvider — Sign-In with Ethereum (EIP-4361)
// ─────────────────────────────────────────────
// 1. Ask the backend for a single-use nonce.
// 2. Have the wallet sign a standard SIWE message naming this site, this
//    chain and that nonce.
// 3. The backend verifies it, burns the nonce, and returns a short-lived
//    session token, which authenticates every later API call.
//
// The signature itself never leaves this flow, so it cannot be replayed.
// ─────────────────────────────────────────────

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { createSiweMessage } from "viem/siwe";
import { API_BASE } from "@/lib/constants";

const SIWEContext = createContext(null);

const SESSION_KEY = "influencity_session";
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 80002);

function readSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (!session?.token || !session.address || !session.expiresAt) return null;
    // Treat a token within a minute of expiry as already expired
    if (session.expiresAt * 1000 < Date.now() + 60_000) return null;
    return session;
  } catch {
    return null;
  }
}

function sessionFor(address) {
  const session = readSession();
  return session && address && session.address === address.toLowerCase() ? session : null;
}

export function SIWEProvider({ children }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState(null);
  // Selected role (brand | creator) — persisted, null until the user picks one
  const [role, setRoleState] = useState(
    () => localStorage.getItem("influencity_role") || null
  );

  const authenticate = useCallback(async () => {
    const nonceRes = await fetch(`${API_BASE}/auth/nonce`, { method: "POST" });
    if (!nonceRes.ok) throw new Error("Could not start sign-in");
    const { nonce } = await nonceRes.json();

    const message = createSiweMessage({
      address,
      chainId: CHAIN_ID,
      domain: window.location.host,
      uri: window.location.origin,
      nonce,
      version: "1",
      statement: "Sign in to Influencity",
      issuedAt: new Date(),
    });
    const signature = await signMessageAsync({ message });

    const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    if (!verifyRes.ok) {
      const e = await verifyRes.json().catch(() => ({}));
      throw new Error(e.error || "Sign-in failed");
    }
    const session = await verifyRes.json();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setIsAuthenticated(true);
  }, [address, signMessageAsync]);

  // Sign in with wallet
  const signIn = useCallback(async () => {
    if (!address) return;
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      await authenticate();
    } catch (error) {
      setAuthError(error.message);
      console.error("SIWE sign-in failed:", error);
    } finally {
      setIsAuthenticating(false);
    }
  }, [address, authenticate]);

  // Ensure there is a live session for the currently connected wallet.
  // Lazy — prompts the wallet only when there is none (or it has expired).
  // Called automatically at the start of every authenticated mutation.
  const ensureAuth = useCallback(async () => {
    if (!address) {
      throw new Error("Connect your wallet first");
    }
    if (sessionFor(address)) {
      setIsAuthenticated(true);
      return;
    }

    setIsAuthenticating(true);
    setAuthError(null);
    try {
      await authenticate();
    } catch (error) {
      setAuthError(error.message);
      console.error("SIWE sign-in failed:", error);
      throw new Error(error.message || "Wallet signature is required to continue");
    } finally {
      setIsAuthenticating(false);
    }
  }, [address, authenticate]);

  // Sign out
  const signOut = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setIsAuthenticated(false);
  }, []);

  // Get auth headers for API calls
  const getAuthHeaders = useCallback(() => {
    const session = readSession();
    return session ? { Authorization: `Bearer ${session.token}` } : {};
  }, []);

  // Select or change the user's role (brand | creator)
  const setRole = useCallback((r) => {
    if (r) {
      localStorage.setItem("influencity_role", r);
    } else {
      localStorage.removeItem("influencity_role");
    }
    setRoleState(r);
  }, []);

  // Check if already authenticated on mount / wallet switch
  useEffect(() => {
    setIsAuthenticated(!!sessionFor(address));
  }, [address]);

  // Clear auth when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      signOut();
    }
  }, [isConnected, signOut]);

  return (
    <SIWEContext.Provider
      value={{
        isAuthenticated,
        isAuthenticating,
        authError,
        signIn,
        signOut,
        ensureAuth,
        getAuthHeaders,
        role,
        setRole,
      }}
    >
      {children}
    </SIWEContext.Provider>
  );
}

export function useSIWE() {
  const context = useContext(SIWEContext);
  if (!context) throw new Error("useSIWE must be used within SIWEProvider");
  return context;
}