// ─────────────────────────────────────────────
// useIPFS React Hook
// ─────────────────────────────────────────────
// Wraps all IPFS interactions (via backend API) with
// loading states, error handling, and caching.
//
// Usage:
//   const { uploadBrief, uploadProof, fetchFromIPFS, loading, error } = useIPFS();
//   const { cid, url } = await uploadBrief(briefData);
// ─────────────────────────────────────────────

import { useState, useCallback, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

export function useIPFS() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Simple in-memory CID cache — avoids re-fetching the same content
  const cache = useRef(new Map());

  // ─────────────────────────────────────────────
  // Upload Campaign Brief
  // ─────────────────────────────────────────────
  // Called from CreateCampaign page.
  // Posts brief data to backend → backend uploads to Pinata → returns CID.
  // Frontend then uses the CID to call CampaignFactory.createCampaign()

  const uploadBrief = useCallback(async (campaignData) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaignData),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();

      return {
        campaignId: data.campaignId,
        cid: data.ipfsBriefCid,
        url: data.ipfsBriefUrl,
        contractParams: data.contractParams,
      };
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ─────────────────────────────────────────────
  // Upload Content Proof
  // ─────────────────────────────────────────────
  // Called from CampaignDetail page when creator submits proof.
  // Posts proof data to backend → backend uploads to Pinata → returns CID.
  // Frontend then calls CampaignEscrow.submitProof(milestoneIndex, cid)

  const uploadProof = useCallback(async (campaignId, proofData) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/campaigns/${campaignId}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proofData),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();

      return {
        cid: data.ipfsProofCid,
        url: data.ipfsProofUrl,
        contractParams: data.contractParams,
      };
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ─────────────────────────────────────────────
  // Fetch Content from IPFS
  // ─────────────────────────────────────────────
  // Retrieves JSON content by CID via the Pinata gateway.
  // Used to display campaign briefs and content proofs.
  // Results are cached in memory to avoid redundant fetches.

  const fetchFromIPFS = useCallback(async (cid) => {
    if (!cid) {
      throw new Error("CID is required");
    }

    // Check cache first
    if (cache.current.has(cid)) {
      return cache.current.get(cid);
    }

    setLoading(true);
    setError(null);

    try {
      const gateway = import.meta.env.VITE_PINATA_GATEWAY || "gateway.pinata.cloud";
      const response = await fetch(`https://${gateway}/ipfs/${cid}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch CID ${cid}: ${response.status}`);
      }

      const data = await response.json();

      // Cache the result
      cache.current.set(cid, data);

      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ─────────────────────────────────────────────
  // Build Gateway URL
  // ─────────────────────────────────────────────
  // Pure function — no async, no loading state needed.
  // Used to create clickable links to IPFS content.

  const getGatewayUrl = useCallback((cid) => {
    if (!cid) return "";
    const gateway = import.meta.env.VITE_PINATA_GATEWAY || "gateway.pinata.cloud";
    return `https://${gateway}/ipfs/${cid}`;
  }, []);

  // ─────────────────────────────────────────────
  // Clear Error
  // ─────────────────────────────────────────────

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    uploadBrief,
    uploadProof,
    fetchFromIPFS,
    getGatewayUrl,
    clearError,
    loading,
    error,
  };
}