import { useState, useCallback, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";
const GATEWAY = import.meta.env.VITE_PINATA_GATEWAY || "gateway.pinata.cloud";

export function useIPFS() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const cache = useRef(new Map());

  const uploadBrief = useCallback(async (campaignData) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaignData),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error: ${res.status}`);
      }
      const data = await res.json();
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

  const uploadProof = useCallback(async (campaignId, proofData) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/campaigns/${campaignId}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proofData),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error: ${res.status}`);
      }
      const data = await res.json();
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

  const fetchFromIPFS = useCallback(async (cid) => {
    if (!cid) throw new Error("CID is required");
    if (cache.current.has(cid)) return cache.current.get(cid);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`https://${GATEWAY}/ipfs/${cid}`);
      if (!res.ok) throw new Error(`Failed to fetch CID ${cid}`);
      const data = await res.json();
      cache.current.set(cid, data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getGatewayUrl = useCallback((cid) => {
    if (!cid) return "";
    return `https://${GATEWAY}/ipfs/${cid}`;
  }, []);

  const clearError = useCallback(() => setError(null), []);

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