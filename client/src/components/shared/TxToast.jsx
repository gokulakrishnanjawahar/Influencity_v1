import { toast } from "sonner";
import { CheckCircle, XCircle, Loader } from "lucide-react";

const SURFACE = "#111111";
const BORDER = "#1f1f1f";
const TEXT = "#f5f5f5";
const SUCCESS = "#4ade80";
const DANGER = "#f87171";
const MUTED = "#888888";

export function txPending(message = "Transaction pending...") {
  return toast.loading(message, {
    style: {
      background: SURFACE,
      border: `1px solid ${BORDER}`,
      color: TEXT,
    },
  });
}

export function txSuccess(toastId, message = "Transaction confirmed!", txHash) {
  toast.success(message, {
    id: toastId,
    description: txHash ? `tx: ${txHash.slice(0, 10)}...` : undefined,
    style: {
      background: SURFACE,
      border: `1px solid rgba(74,222,128,0.2)`,
      color: SUCCESS,
    },
    duration: 5000,
  });
}

export function txError(toastId, message = "Transaction failed") {
  toast.error(message, {
    id: toastId,
    style: {
      background: SURFACE,
      border: `1px solid rgba(248,113,113,0.2)`,
      color: DANGER,
    },
    duration: 5000,
  });
}