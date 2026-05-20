// ─────────────────────────────────────────────
// SIWEProvider — Sign-In with Ethereum
// ─────────────────────────────────────────────
// Handles SIWE authentication flow.
// Signs a message with the connected wallet,
// verifies it with the backend, and stores the session.
// ─────────────────────────────────────────────

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { API_BASE } from "@/lib/constants";

const SIWEContext = createContext(null);

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

  // Build SIWE message
  const buildMessage = useCallback((address, nonce) => {
    return [
      "Influencity wants you to sign in with your Ethereum account:",
      address,
      "",
      "Sign in to Influencity — Decentralised Influencer Sponsorship Protocol",
      "",
      `Nonce: ${nonce}`,
      `Issued At: ${new Date().toISOString()}`,
    ].join("\n");
  }, []);

  // Sign in with wallet
  const signIn = useCallback(async (role = "brand") => {
    if (!address) return;
    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const nonce = Math.random().toString(36).slice(2);
      const message = buildMessage(address, nonce);
      const signature = await signMessageAsync({ message });

      // Store auth headers for API calls
      sessionStorage.setItem("siwe_address", address);
      sessionStorage.setItem("siwe_signature", signature);
      sessionStorage.setItem("siwe_message", message);
      sessionStorage.setItem("siwe_role", role);

      setIsAuthenticated(true);
    } catch (error) {
      setAuthError(error.message);
      console.error("SIWE sign-in failed:", error);
    } finally {
      setIsAuthenticating(false);
    }
  }, [address, signMessageAsync, buildMessage]);

  // Ensure the user has signed a SIWE message for the currently connected wallet.
  // Lazy — prompts the wallet only when no valid signature exists for this address.
  // Called automatically at the start of every authenticated mutation.
  const ensureAuth = useCallback(async () => {
    const stored = sessionStorage.getItem("siwe_address");
    const sig = sessionStorage.getItem("siwe_signature");

    if (stored && sig && stored.toLowerCase() === address?.toLowerCase()) {
      // Already signed for this wallet
      setIsAuthenticated(true);
      return;
    }

    if (!address) {
      throw new Error("Connect your wallet first");
    }

    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const nonce = Math.random().toString(36).slice(2);
      const message = buildMessage(address, nonce);
      const signature = await signMessageAsync({ message });

      sessionStorage.setItem("siwe_address", address);
      sessionStorage.setItem("siwe_signature", signature);
      sessionStorage.setItem("siwe_message", message);
      sessionStorage.setItem("siwe_role", role || "brand");

      setIsAuthenticated(true);
    } catch (error) {
      setAuthError(error.message);
      console.error("SIWE sign-in failed:", error);
      throw new Error("Wallet signature is required to continue");
    } finally {
      setIsAuthenticating(false);
    }
  }, [address, signMessageAsync, buildMessage, role]);

  // Sign out
  const signOut = useCallback(() => {
    sessionStorage.removeItem("siwe_address");
    sessionStorage.removeItem("siwe_signature");
    sessionStorage.removeItem("siwe_message");
    sessionStorage.removeItem("siwe_role");
    setIsAuthenticated(false);
  }, []);

  // Get auth headers for API calls
  const getAuthHeaders = useCallback(() => {
    return {
      "x-wallet-address": sessionStorage.getItem("siwe_address") || "",
      "x-wallet-signature": sessionStorage.getItem("siwe_signature") || "",
      "x-siwe-message": sessionStorage.getItem("siwe_message") || "",
    };
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

  // Check if already authenticated on mount
  useEffect(() => {
    const storedAddress = sessionStorage.getItem("siwe_address");
    if (storedAddress && storedAddress.toLowerCase() === address?.toLowerCase()) {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
    }
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