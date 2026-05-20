import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import {
  ArrowRight, ArrowLeft, Plus, Trash2,
  Check, Upload, Zap, AlertCircle,
  Lock, Globe, Coins, Activity,
} from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import RoleGuard from "@/components/wallet/RoleGuard";
import PlatformIcon from "@/components/shared/PlatformIcon";
import { useCreateCampaign } from "@/hooks/useCampaign";
import { useIPFS } from "@/hooks/useIPFS";
import { PLATFORM_METRICS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─────────────────────────────────────────────
// TOKENS
// ─────────────────────────────────────────────
const BG = "#080808";
const SURFACE = "#111111";
const SURFACE2 = "#161616";
const BORDER = "#1f1f1f";
const BORDER2 = "#2a2a2a";
const TEXT = "#f5f5f5";
const MUTED = "#888888";
const VERY_MUTED = "#444444";
const SUCCESS = "#4ade80";
const DANGER = "#f87171";
const WARNING = "#fb923c";

// ─────────────────────────────────────────────
// STEP CONFIG
// ─────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "Details", icon: Globe },
  { id: 2, label: "Milestones", icon: Activity },
  { id: 3, label: "Review", icon: Lock },
  { id: 4, label: "Deploy", icon: Zap },
];

const PLATFORMS = ["YOUTUBE", "TWITCH", "LINKEDIN"];

const DEFAULT_MILESTONE = {
  platform: "YOUTUBE",
  metricType: "VIEWS",
  threshold: "",
  trancheAmount: "",
  deadline: "",
};

// ─────────────────────────────────────────────
// INPUT COMPONENT
// ─────────────────────────────────────────────
function Field({ label, hint, error, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6, letterSpacing: 0.3 }}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <p style={{ fontSize: 11, color: VERY_MUTED, marginTop: 5 }}>{hint}</p>
      )}
      {error && (
        <p style={{ fontSize: 11, color: DANGER, marginTop: 5, display: "flex", alignItems: "center", gap: 4 }}>
          <AlertCircle size={10} /> {error}
        </p>
      )}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: "100%",
        padding: "10px 14px",
        borderRadius: 9,
        background: SURFACE2,
        border: `1px solid ${focused ? BORDER2 : BORDER}`,
        color: TEXT,
        fontSize: 13,
        outline: "none",
        transition: "border-color 0.15s",
        boxSizing: "border-box",
      }}
      {...props}
    />
  );
}

function TextArea({ value, onChange, placeholder, rows = 4 }) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: "100%",
        padding: "10px 14px",
        borderRadius: 9,
        background: SURFACE2,
        border: `1px solid ${focused ? BORDER2 : BORDER}`,
        color: TEXT,
        fontSize: 13,
        outline: "none",
        resize: "vertical",
        transition: "border-color 0.15s",
        boxSizing: "border-box",
        fontFamily: "inherit",
      }}
    />
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        padding: "10px 14px",
        borderRadius: 9,
        background: SURFACE2,
        border: `1px solid ${BORDER}`,
        color: TEXT,
        fontSize: 13,
        outline: "none",
        cursor: "pointer",
        appearance: "none",
      }}
    >
      {options.map(({ value: v, label }) => (
        <option key={v} value={v} style={{ background: SURFACE2 }}>{label}</option>
      ))}
    </select>
  );
}

// ─────────────────────────────────────────────
// STEP 1 — Campaign Details
// ─────────────────────────────────────────────
function Step1({ data, onChange, errors }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: TEXT, letterSpacing: -0.5, marginBottom: 6 }}>
          Campaign details
        </h2>
        <p style={{ fontSize: 13, color: MUTED }}>
          Basic information about your campaign. This gets stored permanently on IPFS.
        </p>
      </div>

      <Field label="Campaign title" error={errors.title}>
        <Input
          value={data.title}
          onChange={(v) => onChange("title", v)}
          placeholder="e.g. TechReview Q2 2026"
        />
      </Field>

      <Field label="Description" hint="Describe the campaign goals, content type, and expectations">
        <TextArea
          value={data.description}
          onChange={(v) => onChange("description", v)}
          placeholder="Brief description of what you want the creator to produce..."
        />
      </Field>

      <div style={{ padding: "14px 16px", borderRadius: 10, background: `rgba(74,222,128,0.04)`, border: `1px solid rgba(74,222,128,0.12)`, display: "flex", gap: 10 }}>
        <Lock size={14} style={{ color: MUTED, flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
          Your campaign is posted as a public listing — creators apply and you pick one to form the agreement. Details are pinned to IPFS and locked immutably into the escrow contract.
        </p>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// MILESTONE ROW
// ─────────────────────────────────────────────
function MilestoneRow({ milestone, index, onChange, onRemove, canRemove }) {
  const metricOptions = (PLATFORM_METRICS[milestone.platform] || ["VIEWS"]).map((m) => ({
    value: m,
    label: m.replace("_", " "),
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, height: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        padding: "20px",
        borderRadius: 12,
        background: SURFACE2,
        border: `1px solid ${BORDER}`,
        marginBottom: 12,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 22, height: 22, borderRadius: 6,
            background: BORDER, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: MUTED,
          }}>
            {index + 1}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Milestone {index + 1}</span>
        </div>
        {canRemove && (
          <button
            onClick={() => onRemove(index)}
            style={{ background: "none", border: "none", cursor: "pointer", color: VERY_MUTED, padding: 4 }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Field label="Platform">
          <Select
            value={milestone.platform}
            onChange={(v) => onChange(index, "platform", v)}
            options={PLATFORMS.map((p) => ({ value: p, label: p }))}
          />
        </Field>
        <Field label="Metric type">
          <Select
            value={milestone.metricType}
            onChange={(v) => onChange(index, "metricType", v)}
            options={metricOptions}
          />
        </Field>
        <Field label="Threshold" hint="Numeric target (e.g. 50000 for 50k views)">
          <Input
            value={milestone.threshold}
            onChange={(v) => onChange(index, "threshold", v)}
            placeholder="50000"
            type="number"
          />
        </Field>
        <Field label="Tranche amount (USDC)">
          <Input
            value={milestone.trancheAmount}
            onChange={(v) => onChange(index, "trancheAmount", v)}
            placeholder="500"
            type="number"
          />
        </Field>
        <Field label="Deadline">
          <Input
            value={milestone.deadline}
            onChange={(v) => onChange(index, "deadline", v)}
            type="date"
          />
        </Field>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// STEP 2 — Milestones
// ─────────────────────────────────────────────
function Step2({ milestones, onChange, onAdd, onRemove }) {
  const total = milestones.reduce((s, m) => s + (parseFloat(m.trancheAmount) || 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: TEXT, letterSpacing: -0.5, marginBottom: 6 }}>
            Define milestones
          </h2>
          <p style={{ fontSize: 13, color: MUTED }}>
            Each milestone releases a tranche when the oracle verifies the threshold.
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 11, color: VERY_MUTED, marginBottom: 2 }}>Total locked</p>
          <p style={{ fontSize: 20, fontWeight: 900, color: TEXT, fontFamily: "monospace" }}>
            ${total.toLocaleString()} USDC
          </p>
        </div>
      </div>

      <AnimatePresence>
        {milestones.map((m, i) => (
          <MilestoneRow
            key={i}
            milestone={m}
            index={i}
            onChange={onChange}
            onRemove={onRemove}
            canRemove={milestones.length > 1}
          />
        ))}
      </AnimatePresence>

      {milestones.length < 10 && (
        <button
          onClick={onAdd}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            width: "100%", padding: "12px 16px",
            borderRadius: 10, border: `1px dashed ${BORDER2}`,
            background: "transparent", color: MUTED,
            fontSize: 13, fontWeight: 500, cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = VERY_MUTED; e.currentTarget.style.color = TEXT; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER2; e.currentTarget.style.color = MUTED; }}
        >
          <Plus size={14} /> Add milestone
        </button>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// STEP 3 — Review
// ─────────────────────────────────────────────
function Step3({ details, milestones }) {
  const total = milestones.reduce((s, m) => s + (parseFloat(m.trancheAmount) || 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: TEXT, letterSpacing: -0.5, marginBottom: 6 }}>
          Review campaign
        </h2>
        <p style={{ fontSize: 13, color: MUTED }}>
          Review everything before deploying. Once deployed, the brief is immutable.
        </p>
      </div>

      {/* Details */}
      <div style={{ padding: "20px", borderRadius: 12, background: SURFACE2, border: `1px solid ${BORDER}`, marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: VERY_MUTED, marginBottom: 14 }}>
          Campaign details
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "Title", value: details.title },
            { label: "Description", value: details.description || "—" },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span style={{ fontSize: 12, color: VERY_MUTED, flexShrink: 0 }}>{label}</span>
              <span style={{ fontSize: 12, color: TEXT, textAlign: "right", wordBreak: "break-all" }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Milestones */}
      <div style={{ padding: "20px", borderRadius: 12, background: SURFACE2, border: `1px solid ${BORDER}`, marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: VERY_MUTED, marginBottom: 14 }}>
          {milestones.length} Milestone{milestones.length !== 1 ? "s" : ""}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {milestones.map((m, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, background: SURFACE, border: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <PlatformIcon platform={m.platform} size="sm" />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>
                    {Number(m.threshold).toLocaleString()} {m.metricType.replace("_", " ")}
                  </p>
                </div>
              </div>
              <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, fontFamily: "monospace" }}>
                ${parseFloat(m.trancheAmount || 0).toLocaleString()} USDC
              </p>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
          <span style={{ fontSize: 12, color: MUTED }}>Total to lock in escrow</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: TEXT, fontFamily: "monospace" }}>
            ${total.toLocaleString()} USDC
          </span>
        </div>
      </div>

      <div style={{ padding: "14px 16px", borderRadius: 10, background: `rgba(251,146,60,0.04)`, border: `1px solid rgba(251,146,60,0.15)`, display: "flex", gap: 10 }}>
        <AlertCircle size={14} style={{ color: WARNING, flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
          Deploying will upload the brief to IPFS, deploy a CampaignEscrow contract, and require a USDC approval + deposit transaction from your wallet. Make sure you have enough USDC on Base Sepolia.
        </p>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// STEP 4 — Deploy
// ─────────────────────────────────────────────
function Step4({ status, txHash, onDone }) {
  const navigate = useNavigate();

  const steps = [
    { label: "Uploading brief to IPFS", done: status >= 1 },
    { label: "Deploying campaign escrow", done: status >= 2 },
    { label: "Approving USDC spend", done: status >= 3 },
    { label: "Locking USDC in escrow", done: status >= 4 },
    { label: "Publishing campaign listing", done: status >= 5 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      style={{ textAlign: "center" }}
    >
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: TEXT, letterSpacing: -0.5, marginBottom: 6 }}>
          {status < 5 ? "Publishing campaign..." : "Campaign published!"}
        </h2>
        <p style={{ fontSize: 13, color: MUTED }}>
          {status < 5
            ? "Please confirm each transaction in your wallet."
            : "Your campaign is now an open listing creators can apply to."}
        </p>
      </div>

      <div style={{ textAlign: "left", marginBottom: 28 }}>
        {steps.map(({ label, done }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}
          >
            <motion.div
              animate={{
                background: done ? `rgba(74,222,128,0.15)` : SURFACE2,
                borderColor: done ? `rgba(74,222,128,0.3)` : BORDER,
              }}
              style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            >
              {done ? (
                <Check size={13} style={{ color: SUCCESS }} />
              ) : status === i ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  style={{ width: 10, height: 10, borderRadius: "50%", border: `2px solid ${BORDER2}`, borderTopColor: TEXT }}
                />
              ) : (
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: BORDER2 }} />
              )}
            </motion.div>
            <span style={{ fontSize: 13, color: done ? TEXT : MUTED }}>{label}</span>
          </motion.div>
        ))}
      </div>

      {status >= 5 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          {txHash && (
            <div style={{ padding: "12px 16px", borderRadius: 10, background: SURFACE2, border: `1px solid ${BORDER}`, fontFamily: "monospace", fontSize: 11, color: MUTED, wordBreak: "break-all" }}>
              tx: {txHash}
            </div>
          )}
          <button
            onClick={() => navigate("/dashboard")}
            style={{
              padding: "12px 24px", borderRadius: 10,
              background: TEXT, color: "#000",
              fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer",
            }}
          >
            Go to Dashboard
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function CreateCampaign() {
  const { address } = useAccount();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [deployStatus, setDeployStatus] = useState(0);
  const [txHash, setTxHash] = useState(null);

  const [details, setDetails] = useState({
    title: "",
    description: "",
  });

  const [milestones, setMilestones] = useState([{ ...DEFAULT_MILESTONE }]);
  const [errors, setErrors] = useState({});

  const { mutateAsync: createCampaign, isPending } = useCreateCampaign();

  const updateDetail = (key, value) => {
    setDetails((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const updateMilestone = (index, key, value) => {
    setMilestones((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      if (key === "platform") {
        next[index].metricType = PLATFORM_METRICS[value]?.[0] || "VIEWS";
      }
      return next;
    });
  };

  const addMilestone = () => {
    setMilestones((prev) => [...prev, { ...DEFAULT_MILESTONE }]);
  };

  const removeMilestone = (index) => {
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  };

  const validateStep1 = () => {
    const errs = {};
    if (!details.title.trim()) errs.title = "Title is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep2 = () => {
    for (const m of milestones) {
      if (!m.threshold || !m.trancheAmount || !m.deadline) {
        toast.error("All milestone fields are required");
        return false;
      }
      if (parseFloat(m.threshold) <= 0) {
        toast.error("Threshold must be greater than 0");
        return false;
      }
      if (parseFloat(m.trancheAmount) <= 0) {
        toast.error("Tranche amount must be greater than 0");
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep((s) => s + 1);
  };

  const handleBack = () => setStep((s) => s - 1);

  const handleDeploy = async () => {
    setStep(4);
    setDeployStatus(0);
    try {
      const payload = {
        brandAddress: address,
        title: details.title,
        description: details.description,
        milestones: milestones.map((m) => ({
          platform: m.platform,
          metricType: m.metricType,
          threshold: parseInt(m.threshold),
          trancheAmount: Math.floor(parseFloat(m.trancheAmount) * 1_000_000),
          deadline: Math.floor(new Date(m.deadline).getTime() / 1000),
          // contentId is filled in later by the creator when submitting proof
          contentId: "",
        })),
      };

      const result = await createCampaign({
        campaignData: payload,
        onProgress: setDeployStatus,
      });
      setTxHash(result.txHash);
      setDeployStatus(5);
      toast.success("Campaign published successfully!");
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Campaign creation failed");
      setStep(3);
      setDeployStatus(0);
    }
  };

  return (
    <RoleGuard role="brand">
      <PageLayout>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 0 80px" }}>

          {/* Step indicator */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 48 }}>
            {STEPS.map(({ id, label, icon: Icon }, i) => (
              <div key={id} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: step >= id ? (step > id ? `rgba(74,222,128,0.15)` : SURFACE2) : SURFACE,
                    border: `1px solid ${step >= id ? (step > id ? `rgba(74,222,128,0.3)` : BORDER2) : BORDER}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.3s",
                  }}>
                    {step > id ? (
                      <Check size={13} style={{ color: SUCCESS }} />
                    ) : (
                      <Icon size={13} style={{ color: step === id ? TEXT : VERY_MUTED }} />
                    )}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: step === id ? 700 : 500, color: step >= id ? TEXT : VERY_MUTED, whiteSpace: "nowrap" }}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 1, background: step > id ? `rgba(74,222,128,0.2)` : BORDER, margin: "0 12px", transition: "background 0.3s" }} />
                )}
              </div>
            ))}
          </div>

          {/* Step content */}
          <div style={{ padding: "32px", borderRadius: 16, background: SURFACE, border: `1px solid ${BORDER}`, minHeight: 400 }}>
            <AnimatePresence mode="wait">
              {step === 1 && (
                <Step1 key="step1" data={details} onChange={updateDetail} errors={errors} />
              )}
              {step === 2 && (
                <Step2
                  key="step2"
                  milestones={milestones}
                  onChange={updateMilestone}
                  onAdd={addMilestone}
                  onRemove={removeMilestone}
                />
              )}
              {step === 3 && (
                <Step3 key="step3" details={details} milestones={milestones} />
              )}
              {step === 4 && (
                <Step4
                  key="step4"
                  status={deployStatus}
                  txHash={txHash}
                  onDone={() => navigate("/dashboard")}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Navigation buttons */}
          {step < 4 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <button
                onClick={step === 1 ? () => navigate("/dashboard") : handleBack}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "10px 20px", borderRadius: 10,
                  background: "transparent", border: `1px solid ${BORDER}`,
                  color: MUTED, fontSize: 13, fontWeight: 500, cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <ArrowLeft size={14} />
                {step === 1 ? "Cancel" : "Back"}
              </button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={step === 3 ? handleDeploy : handleNext}
                disabled={isPending}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "10px 24px", borderRadius: 10,
                  background: step === 3 ? TEXT : TEXT,
                  color: "#000", fontSize: 13, fontWeight: 700,
                  border: "none", cursor: "pointer",
                  opacity: isPending ? 0.6 : 1,
                }}
              >
                {step === 3 ? (
                  <><Zap size={14} /> Publish Campaign</>
                ) : (
                  <>Continue <ArrowRight size={14} /></>
                )}
              </motion.button>
            </div>
          )}
        </div>
      </PageLayout>
    </RoleGuard>
  );
}