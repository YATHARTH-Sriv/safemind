"use client";

import { AnimatedOrb } from "@/components/chat/animated-orb";
import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import type {
  Message,
  Conversation,
  AttestationReport,
  ChatVerificationResult,
  HealthPlanTemplateId,
} from "@/lib/types";
import { getFallbackResponse } from "@/lib/constants";
import { streamChat, getAttestation, clearAttestationCache } from "@/lib/near-ai";
import {
  PLAN_TEMPLATES,
  generateHealthPlan,
  planProgress,
  downloadPlanMarkdown,
  downloadPlanPdf,
} from "@/lib/health-plans";
import {
  saveConversation,
  getAllConversations,
  deleteConversation,
  deleteAllConversations,
  exportConversations,
  downloadJson,
} from "@/lib/storage";
import { Landing } from "@/components/Landingpage/Landing";

const QUICK_PROMPTS = [
  { text: "I've had headaches for 3 days" },
  { text: "How can I manage daily anxiety?" },
  { text: "Create a simple sleep recovery plan" },
  { text: "What should I eat for better energy?" },
];

const RETENTION_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: "Never auto-delete", value: null },
  { label: "Delete after 1 hour", value: 1 },
  { label: "Delete after 24 hours", value: 24 },
  { label: "Delete after 7 days", value: 24 * 7 },
];

const SAFETY_TERMS = [
  "chest pain",
  "faint",
  "fainted",
  "suicidal",
  "suicide",
  "self harm",
  "can't breathe",
  "difficulty breathing",
  "seizure",
  "stroke",
  "overdose",
  "blood in stool",
  "blood in vomit",
  "severe pain",
];

function createEmptyConvo(retentionHours: number | null = 24): Conversation {
  const createdAt = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "New conversation",
    messages: [],
    createdAt,
    retentionHours,
    expiresAt: retentionHours ? createdAt + retentionHours * 60 * 60 * 1000 : null,
    plans: [],
  };
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDurationLeft(expiresAt: number, nowMs: number) {
  const ms = Math.max(0, expiresAt - nowMs);
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

function detectSafetyRisk(text: string): string | null {
  const lower = text.toLowerCase();
  const matched = SAFETY_TERMS.find((term) => lower.includes(term));
  if (!matched) return null;
  return `Urgent symptom keyword detected (“${matched}”). This chat is informational only — seek immediate professional care if symptoms are severe or worsening.`;
}

function buildDoctorBrief(conversation: Conversation): string {
  const userMessages = conversation.messages.filter((m) => m.role === "user").map((m) => m.content.trim());
  const assistantMessages = conversation.messages.filter((m) => m.role === "assistant").map((m) => m.content.trim());
  const firstAt = conversation.messages[0]?.timestamp ?? conversation.createdAt;
  const lastAt = conversation.messages.at(-1)?.timestamp ?? conversation.createdAt;
  const possibleRedFlags = userMessages.filter((content) => detectSafetyRisk(content));

  const summary = userMessages.slice(-3).join(" | ") || "No user symptoms recorded yet.";
  const guidance = assistantMessages.at(-1) || "No assistant guidance recorded yet.";

  return [
    "# SafeMind Doctor Visit Brief",
    "",
    `Generated: ${new Date().toLocaleString()}`,
    `Conversation: ${conversation.title}`,
    `Window: ${new Date(firstAt).toLocaleString()} -> ${new Date(lastAt).toLocaleString()}`,
    "",
    "## Patient Summary",
    summary,
    "",
    "## Key Guidance Shared",
    guidance,
    "",
    "## Red-Flag Mentions",
    possibleRedFlags.length ? possibleRedFlags.map((m) => `- ${m}`).join("\n") : "- None detected by keyword scan.",
    "",
    "## Questions to Ask a Clinician",
    "- What likely causes fit these symptoms?",
    "- Which warning signs should trigger urgent care?",
    "- What immediate at-home steps are safe?",
    "- What follow-up tests or checks are recommended?",
    "",
    "Note: SafeMind is informational and not a medical diagnosis tool.",
  ].join("\n");
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={`c-${index}`} className="sm-md-inline-code">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`b-${index}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={`i-${index}`}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={`t-${index}`}>{part}</Fragment>;
  });
}

type MessageBlock =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

function isBlockStarter(line: string) {
  return /^(#{1,4})\s+/.test(line) || /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line);
}

function parseMessageBlocks(content: string): MessageBlock[] {
  const lines = content.replace(/\r/g, "").split("\n");
  const blocks: MessageBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      i += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const hashes = headingMatch[1].length;
      const level = (hashes <= 1 ? 2 : hashes === 2 ? 3 : 4) as 2 | 3 | 4;
      blocks.push({ type: "heading", level, text: headingMatch[2].trim() });
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const line = lines[i].trim();
        const match = line.match(/^[-*]\s+(.+)$/);
        if (!match) break;
        items.push(match[1].trim());
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const line = lines[i].trim();
        const match = line.match(/^\d+\.\s+(.+)$/);
        if (!match) break;
        items.push(match[1].trim());
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    const paragraphLines: string[] = [trimmed];
    i += 1;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next || isBlockStarter(next)) break;
      paragraphLines.push(next);
      i += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function renderMessage(content: string) {
  if (!content) return <p className="sm-md-paragraph"><br /></p>;
  const blocks = parseMessageBlocks(content);

  return blocks.map((block, index) => {
    if (block.type === "heading") {
      const className =
        block.level === 2 ? "sm-md-h2" : block.level === 3 ? "sm-md-h3" : "sm-md-h4";
      return (
        <h3 key={`h-${index}`} className={className}>
          {renderInlineMarkdown(block.text)}
        </h3>
      );
    }

    if (block.type === "ul") {
      return (
        <ul key={`ul-${index}`} className="sm-md-list">
          {block.items.map((item, itemIndex) => (
            <li key={`uli-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>
      );
    }

    if (block.type === "ol") {
      return (
        <ol key={`ol-${index}`} className="sm-md-list sm-md-list-ordered">
          {block.items.map((item, itemIndex) => (
            <li key={`oli-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>
      );
    }

    return (
      <p key={`p-${index}`} className="sm-md-paragraph">
        {renderInlineMarkdown(block.text)}
      </p>
    );
  });
}

function attestationLabel(attestation: AttestationReport | null) {
  if (!attestation) return "Pending";
  if (attestation.verificationLevel === "nonce") return "Nonce-verified";
  if (attestation.verificationLevel === "format") return "Format-checked";
  return "Unverified";
}

function statusCopy(
  attestation: AttestationReport | null,
  hasApiKeyOverride: boolean,
  apiKeyRequired: boolean
) {
  if (attestation?.verificationLevel === "nonce") return "Attestation Checked";
  if (attestation?.verificationLevel === "format") return "Partial Verification";
  if (apiKeyRequired && !hasApiKeyOverride) return "API Key Required";
  return "Demo Mode";
}



function ApiKeyModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (key: string) => void;
}) {
  const [key, setKey] = useState("");
  if (!open) return null;

  return (
    <div className="sm-modal-overlay" onClick={onClose}>
      <div className="sm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="sm-modal-header">
          <span className="sm-modal-title">NEAR AI API Key</span>
          <button className="sm-modal-close" onClick={onClose} type="button">✕</button>
        </div>
        <div className="sm-modal-body">
          <p className="sm-modal-copy">
            Optional override. If a server key is already configured, you can skip this.
            Override is kept in memory for the current session only.
          </p>
          <input
            className="sm-input"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && key.trim()) onSave(key.trim());
            }}
          />
          <div className="sm-modal-actions">
            <button className="sm-btn sm-btn-ghost" type="button" onClick={onClose}>Cancel</button>
            <button
              className="sm-btn sm-btn-solid"
              type="button"
              onClick={() => key.trim() && onSave(key.trim())}
              disabled={!key.trim()}
            >
              Use Session Key
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VaultModal({
  open,
  onUnlock,
  error,
}: {
  open: boolean;
  onUnlock: (passphrase: string) => void;
  error: string;
}) {
  const [passphrase, setPassphrase] = useState("");
  if (!open) return null;

  return (
    <div className="sm-modal-overlay">
      <div className="sm-modal" style={{ maxWidth: 460 }}>
        <div className="sm-modal-header">
          <span className="sm-modal-title">Unlock Encrypted Vault</span>
        </div>
        <div className="sm-modal-body">
          <p className="sm-modal-copy">
            Your passphrase decrypts local vault records. SafeMind does not store this passphrase.
          </p>
          {error && <p className="sm-error-text">{error}</p>}
          <input
            className="sm-input"
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Enter vault passphrase"
            onKeyDown={(e) => {
              if (e.key === "Enter" && passphrase.trim()) onUnlock(passphrase.trim());
            }}
          />
          <button
            className="sm-btn sm-btn-solid"
            type="button"
            onClick={() => passphrase.trim() && onUnlock(passphrase.trim())}
            disabled={!passphrase.trim()}
          >
            Unlock Vault
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanBuilderModal({
  open,
  initialTemplateId,
  onClose,
  onCreatePlan,
}: {
  open: boolean;
  initialTemplateId: HealthPlanTemplateId;
  onClose: () => void;
  onCreatePlan: (input: { templateId: HealthPlanTemplateId; profile: string; goal: string }) => void;
}) {
  const [templateId, setTemplateId] = useState<HealthPlanTemplateId>(initialTemplateId);
  const [profile, setProfile] = useState("");
  const [goal, setGoal] = useState("");

  if (!open) return null;

  return (
    <div className="sm-modal-overlay" onClick={onClose}>
      <div className="sm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="sm-modal-header">
          <span className="sm-modal-title">Create Daily Health Plan</span>
          <button className="sm-modal-close" type="button" onClick={onClose}>✕</button>
        </div>
        <div className="sm-modal-body">
          <label className="sm-field-label">
            Template
            <select
              className="sm-input"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value as HealthPlanTemplateId)}
            >
              {PLAN_TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title}
                </option>
              ))}
            </select>
          </label>
          <p className="sm-modal-copy">
            {PLAN_TEMPLATES.find((template) => template.id === templateId)?.description}
          </p>
          <label className="sm-field-label">
            Profile context
            <textarea
              className="sm-input sm-plan-textarea"
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              placeholder="Example: 70kg, 175cm, beginner gym level, vegetarian, lactose sensitive."
            />
          </label>
          <label className="sm-field-label">
            Goal
            <input
              className="sm-input"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Example: Gain 5kg clean muscle in 2 months."
            />
          </label>
          <div className="sm-modal-actions">
            <button className="sm-btn sm-btn-ghost" type="button" onClick={onClose}>Cancel</button>
            <button
              className="sm-btn sm-btn-solid"
              type="button"
              onClick={() => onCreatePlan({ templateId, profile, goal })}
            >
              Generate Plan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrivacyDashboard({
  open,
  onClose,
  activeConversation,
  nowMs,
  conversationCount,
  messageCount,
  attestation,
  verification,
  hasApiKeyOverride,
  onExportData,
  onExportDoctorBrief,
  onSetRetention,
  onDeleteAll,
  onOpenApiKey,
  onLockVault,
}: {
  open: boolean;
  onClose: () => void;
  activeConversation: Conversation;
  nowMs: number | null;
  conversationCount: number;
  messageCount: number;
  attestation: AttestationReport | null;
  verification: ChatVerificationResult | null;
  hasApiKeyOverride: boolean;
  onExportData: () => void;
  onExportDoctorBrief: () => void;
  onSetRetention: (hours: number | null) => void;
  onDeleteAll: () => void;
  onOpenApiKey: () => void;
  onLockVault: () => void;
}) {
  if (!open) return null;

  return (
    <div className="sm-modal-overlay" onClick={onClose}>
      <div className="sm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sm-modal-header">
          <span className="sm-modal-title">Privacy & Verification</span>
          <button className="sm-modal-close" onClick={onClose} type="button">✕</button>
        </div>
        <div className="sm-modal-body">
          <div className="sm-panel">
            <div className="sm-panel-head">
              <span className={`sm-status-dot ${attestation?.verified ? "sm-status-ok" : "sm-status-warn"}`} />
              <h4>{attestationLabel(attestation)}</h4>
            </div>
            <p className="sm-panel-note">
              {attestation?.note ?? "Attestation checks run after key access is available."}
            </p>
            <div className="sm-meta-grid">
              <div><span>Model</span><strong>{attestation?.model ?? "—"}</strong></div>
              <div><span>Nonce match</span><strong>{attestation?.nonceMatched ? "Yes" : "No"}</strong></div>
              <div><span>Nonce</span><strong>{attestation?.nonce ? `${attestation.nonce.slice(0, 10)}…` : "—"}</strong></div>
              <div><span>Model key fp</span><strong>{attestation?.keyFingerprint ?? "—"}</strong></div>
              <div><span>Level</span><strong>{attestation?.verificationLevel ?? "none"}</strong></div>
              <div><span>Checked</span><strong>{attestation?.checkedAt ? formatTime(attestation.checkedAt) : "—"}</strong></div>
            </div>
          </div>

          <div className="sm-panel">
            <h4>Verification Trace</h4>
            <p className="sm-panel-note">
              {verification
                ? verification.signatureTextMatches
                  ? `Chat ${verification.chatId.slice(0, 14)}… hashes matched signed text.`
                  : "Signature fetched, but hash pair did not match."
                : "Send a live message to generate signature evidence."}
            </p>
            {verification && (
              <div className="sm-meta-grid">
                <div><span>Request hash</span><strong>{`${verification.requestHash.slice(0, 10)}…${verification.requestHash.slice(-8)}`}</strong></div>
                <div><span>Response hash</span><strong>{`${verification.responseHash.slice(0, 10)}…${verification.responseHash.slice(-8)}`}</strong></div>
                <div><span>Chat ID</span><strong>{verification.chatId.slice(0, 18)}…</strong></div>
                <div><span>Signature</span><strong>{verification.signatureFetched ? "Fetched" : "Missing"}</strong></div>
              </div>
            )}
          </div>

          <div className="sm-panel sm-panel-actions">
            <div className="sm-action-row">
              <div>
                <strong>{conversationCount} conversations · {messageCount} messages</strong>
                <p>Encrypted local storage</p>
              </div>
              <button className="sm-btn sm-btn-ghost" type="button" onClick={onExportData}>Export JSON</button>
            </div>
            <div className="sm-action-row">
              <div>
                <strong>Doctor-ready Brief</strong>
                <p>Export structured summary for appointments</p>
              </div>
              <button className="sm-btn sm-btn-ghost" type="button" onClick={onExportDoctorBrief}>Export Brief</button>
            </div>
            <div className="sm-action-row">
              <div>
                <strong>Auto-delete Retention</strong>
                <p>
                  {activeConversation.expiresAt
                    ? nowMs !== null
                      ? `Current: ${formatDurationLeft(activeConversation.expiresAt, nowMs)}`
                      : `Current: expires ${formatDate(activeConversation.expiresAt)}`
                    : "Current: Never auto-delete"}
                </p>
              </div>
              <select
                className="sm-input sm-select"
                value={activeConversation.retentionHours === null || activeConversation.retentionHours === undefined ? "never" : String(activeConversation.retentionHours)}
                onChange={(e) => onSetRetention(e.target.value === "never" ? null : Number(e.target.value))}
                aria-label="Set retention timer"
              >
                {RETENTION_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value === null ? "never" : option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm-action-row">
              <div>
                <strong>API Key Mode</strong>
                <p>{hasApiKeyOverride ? "Session override active" : "Server-managed key"}</p>
              </div>
              <button className="sm-btn sm-btn-ghost" type="button" onClick={onOpenApiKey}>Set Override</button>
            </div>
            <div className="sm-action-row">
              <div>
                <strong>Lock Vault</strong>
                <p>Clear passphrase from memory</p>
              </div>
              <button className="sm-btn sm-btn-ghost" type="button" onClick={onLockVault}>Lock</button>
            </div>
            <div className="sm-action-row">
              <div>
                <strong>Delete All Data</strong>
                <p>Permanently remove local conversations</p>
              </div>
              <button className="sm-btn sm-btn-danger" type="button" onClick={onDeleteAll}>Delete</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SafeMindApp({ visible }: { visible: boolean }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [initialPlanTemplate, setInitialPlanTemplate] = useState<HealthPlanTemplateId>("weight-gain-8w");
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [vaultError, setVaultError] = useState("");
  const [vaultPassphrase, setVaultPassphrase] = useState("");
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([createEmptyConvo()]);
  const [activeConvoId, setActiveConvoId] = useState(conversations[0].id);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyRequired, setApiKeyRequired] = useState(false);
  const [attestation, setAttestation] = useState<AttestationReport | null>(null);
  const [lastVerification, setLastVerification] = useState<ChatVerificationResult | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(() => Date.now());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef(false);

  const activeConvo = conversations.find((c) => c.id === activeConvoId) ?? conversations[0];
  const totalMessages = conversations.reduce((sum, c) => sum + c.messages.length, 0);

  useEffect(() => {
    if (!vaultPassphrase) return;
    let cancelled = false;

    getAllConversations(vaultPassphrase)
      .then((saved) => {
        if (cancelled) return;
        const normalized = saved.map((convo) => ({
          ...convo,
          plans: convo.plans ?? [],
        }));
        const now = Date.now();
        const unexpired = normalized.filter((convo) => !convo.expiresAt || convo.expiresAt > now);
        const expiredIds = normalized.filter((convo) => convo.expiresAt && convo.expiresAt <= now).map((convo) => convo.id);
        if (expiredIds.length > 0) {
          expiredIds.forEach((id) => void deleteConversation(id));
        }

        if (unexpired.length > 0) {
          setConversations(unexpired);
          setActiveConvoId(unexpired[0].id);
        } else {
          const fresh = createEmptyConvo();
          setConversations([fresh]);
          setActiveConvoId(fresh.id);
        }
        setVaultError("");
      })
      .catch(() => {
        if (cancelled) return;
        setVaultPassphrase("");
        setVaultError("Unable to decrypt local data with this passphrase. Try again.");
        setVaultModalOpen(true);
      });

    return () => {
      cancelled = true;
    };
  }, [vaultPassphrase]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        clearAttestationCache();
        const report = await getAttestation(apiKey);
        if (!cancelled) {
          setAttestation(report);
          setApiKeyRequired(false);
        }
      } catch {
        if (!cancelled) {
          setAttestation(null);
          setApiKeyRequired(true);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      scrollToBottom(streamingContent ? "auto" : "smooth");
    }
  }, [activeConvo.messages, isTyping, streamingContent, scrollToBottom]);

  useEffect(() => {
    shouldAutoScrollRef.current = true;
    scrollToBottom("auto");
  }, [activeConvoId, scrollToBottom]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
  }, [inputValue]);

  useEffect(() => {
    const onResize = () => {
      if (!window.matchMedia("(max-width: 880px)").matches) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!vaultPassphrase) return;

    const purgeExpired = () => {
      const now = Date.now();
      const expiredIds: string[] = [];

      setConversations((prev) => {
        const filtered = prev.filter((convo) => {
          const expired = Boolean(convo.expiresAt && convo.expiresAt <= now);
          if (expired) expiredIds.push(convo.id);
          return !expired;
        });

        if (expiredIds.length === 0) return prev;

        const next = filtered.length > 0 ? filtered : [createEmptyConvo()];
        setActiveConvoId((currentId) => {
          if (next.some((convo) => convo.id === currentId)) return currentId;
          return next[0].id;
        });
        return next;
      });

      expiredIds.forEach((id) => void deleteConversation(id));
    };

    purgeExpired();
    const intervalId = window.setInterval(purgeExpired, 15000);
    return () => window.clearInterval(intervalId);
  }, [vaultPassphrase]);

  const persistConversation = useCallback(
    async (convo: Conversation) => {
      if (!vaultPassphrase) return;
      try {
        await saveConversation(convo, vaultPassphrase);
      } catch {
        setVaultError("Failed to persist encrypted conversation.");
      }
    },
    [vaultPassphrase]
  );

  const updateConversation = useCallback(
    (updater: (c: Conversation) => Conversation) => {
      setConversations((prev) => {
        const updated = prev.map((c) => (c.id === activeConvoId ? updater(c) : c));
        const convo = updated.find((c) => c.id === activeConvoId);
        if (convo) {
          void persistConversation(convo);
        }
        return updated;
      });
    },
    [activeConvoId, persistConversation]
  );

  const handleSubmit = useCallback(
    async (overrideText?: string) => {
      const text = overrideText ?? inputValue.trim();
      if (!text || isTyping || !vaultPassphrase) return;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: Date.now(),
        encrypted: true,
      };

      updateConversation((c) => {
        const updated = { ...c, messages: [...c.messages, userMsg] };
        if (c.messages.length === 0) {
          updated.title = text.length > 42 ? `${text.slice(0, 42)}…` : text;
        }
        return updated;
      });

      setInputValue("");
      setIsTyping(true);
      setStreamingContent("");
      shouldAutoScrollRef.current = true;
      abortRef.current = false;

      if (attestation || apiKey || !apiKeyRequired) {
        try {
          const history = activeConvo.messages.map((m) => ({ role: m.role, content: m.content }));
          const result = await streamChat({
            apiKey,
            message: text,
            history,
            useE2EE: Boolean(attestation && attestation.verificationLevel !== "none"),
            onChunk: (chunk) => {
              if (!abortRef.current) setStreamingContent((prev) => prev + chunk);
            },
            onChatId: () => { },
          });

          const assistantMsg: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: result.content,
            timestamp: Date.now(),
            encrypted: Boolean(attestation),
            chatId: result.chatId,
          };

          if (result.verification) setLastVerification(result.verification);
          updateConversation((c) => ({ ...c, messages: [...c.messages, assistantMsg] }));
        } catch (err) {
          const errorMsg: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Sorry, I encountered an error connecting to NEAR AI. ${err instanceof Error ? err.message : "Please check your API key or server configuration."
              }`,
            timestamp: Date.now(),
            encrypted: false,
          };
          updateConversation((c) => ({ ...c, messages: [...c.messages, errorMsg] }));
        }
      } else {
        await new Promise((r) => setTimeout(r, 1200 + Math.random() * 600));
        const fallback = getFallbackResponse(text);
        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: fallback,
          timestamp: Date.now(),
          encrypted: false,
        };
        updateConversation((c) => ({ ...c, messages: [...c.messages, assistantMsg] }));
      }

      setIsTyping(false);
      setStreamingContent("");
    },
    [
      inputValue,
      isTyping,
      apiKey,
      attestation,
      apiKeyRequired,
      activeConvo.messages,
      updateConversation,
      vaultPassphrase,
    ]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleNewConversation = () => {
    const convo = createEmptyConvo(activeConvo?.retentionHours ?? 24);
    setConversations((prev) => [convo, ...prev]);
    setActiveConvoId(convo.id);
    shouldAutoScrollRef.current = true;
    if (window.matchMedia("(max-width: 880px)").matches) {
      setSidebarOpen(false);
    }
  };

  const handleSidebarToggle = () => {
    if (window.matchMedia("(max-width: 880px)").matches) {
      setSidebarOpen((p) => !p);
      return;
    }
    setSidebarCollapsed((p) => !p);
  };

  const handleExportData = () => {
    const json = exportConversations(conversations);
    downloadJson(json, `safemind-export-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const handleExportDoctorBrief = () => {
    const brief = buildDoctorBrief(activeConvo);
    const blob = new Blob([brief], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `safemind-doctor-brief-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSetRetention = (hours: number | null) => {
    updateConversation((convo) => ({
      ...convo,
      retentionHours: hours,
      expiresAt: hours ? Date.now() + hours * 60 * 60 * 1000 : null,
    }));
  };

  const handleCreatePlan = (input: { templateId: HealthPlanTemplateId; profile: string; goal: string }) => {
    const plan = generateHealthPlan({
      templateId: input.templateId,
      profile: input.profile,
      goal: input.goal,
    });
    updateConversation((convo) => ({
      ...convo,
      plans: [...(convo.plans ?? []), plan],
      messages: [
        ...convo.messages,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: [
            `## ${plan.title}`,
            `Goal: ${plan.goal}`,
            `Duration: ${plan.durationDays} days`,
            "",
            "Plan has been added to your checklist workspace. Use Export buttons for Notion (Markdown) or PDF.",
          ].join("\n"),
          timestamp: Date.now(),
          encrypted: Boolean(attestation),
        },
      ],
    }));
    setExpandedPlanId(plan.id);
    setPlanModalOpen(false);
  };

  const handleTogglePlanTask = (planId: string, dayNumber: number, taskId: string) => {
    updateConversation((convo) => ({
      ...convo,
      plans: (convo.plans ?? []).map((plan) => {
        if (plan.id !== planId) return plan;
        return {
          ...plan,
          days: plan.days.map((day) => {
            if (day.day !== dayNumber) return day;
            return {
              ...day,
              tasks: day.tasks.map((task) =>
                task.id === taskId ? { ...task, completed: !task.completed } : task
              ),
            };
          }),
        };
      }),
    }));
  };

  const handleDeleteAll = async () => {
    if (!confirm("Delete all conversations? This cannot be undone.")) return;
    await deleteAllConversations();
    const fresh = createEmptyConvo();
    setConversations([fresh]);
    setActiveConvoId(fresh.id);
    setPrivacyOpen(false);
  };

  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    clearAttestationCache();
    setAttestation(null);
    setApiKeyModalOpen(false);
  };

  const lockVault = () => {
    setVaultPassphrase("");
    setVaultModalOpen(true);
    setPrivacyOpen(false);
  };

  const isVaultModalVisible = vaultModalOpen || (visible && !vaultPassphrase);

  const handleMessagesScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = distanceToBottom < 120;
  }, []);

  const safetyNotice = (() => {
    const latestUserMessage = [...activeConvo.messages].reverse().find((m) => m.role === "user");
    return latestUserMessage ? detectSafetyRisk(latestUserMessage.content) : null;
  })();
  const activePlans = activeConvo.plans ?? [];

  return (
    <div
      className={`sm-app ${visible ? "sm-app-visible" : ""} ${sidebarCollapsed ? "sm-app-sidebar-collapsed" : ""}`}
    >
      <div
        className={`sm-sidebar-overlay ${sidebarOpen ? "sm-sidebar-overlay-visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`sm-sidebar ${sidebarOpen ? "sm-sidebar-open" : ""}`}>
        <div className="sm-sidebar-header">
          <div className="sm-sidebar-brand">
            <span className="sm-sidebar-logo">◍</span>
            <span>SafeMind</span>
          </div>
          <button type="button" className="sm-icon-btn" onClick={handleNewConversation}>＋</button>
        </div>
        <div className="sm-sidebar-body">
          <p className="sm-sidebar-label">Conversations</p>
          <ul className="sm-sidebar-list">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`sm-sidebar-item ${c.id === activeConvoId ? "sm-sidebar-item-active" : ""}`}
                  onClick={() => {
                    setActiveConvoId(c.id);
                    if (window.matchMedia("(max-width: 880px)").matches) {
                      setSidebarOpen(false);
                    }
                  }}
                >
                  <span className="sm-sidebar-item-name">{c.title}</span>
                  <span className="sm-sidebar-item-date">
                    {c.expiresAt
                      ? nowMs !== null
                        ? formatDurationLeft(c.expiresAt, nowMs)
                        : formatDate(c.expiresAt)
                      : formatDate(c.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="sm-main">
        <header className="sm-topbar">
          <div className="sm-topbar-left">
            <button
              type="button"
              className="sm-icon-btn"
              onClick={handleSidebarToggle}
              aria-label="Toggle sidebar"
              aria-expanded={!sidebarCollapsed}
            >
              ☰
            </button>
            <span className="sm-topbar-title">Private session</span>
            <span className="sm-msg-tag">
              {activeConvo.expiresAt
                ? nowMs !== null
                  ? formatDurationLeft(activeConvo.expiresAt, nowMs)
                  : `Expires ${formatDate(activeConvo.expiresAt)}`
                : "No auto-delete"}
            </span>
          </div>
          <div className="sm-topbar-right">
            <button type="button" className="sm-status-pill" onClick={() => setPrivacyOpen(true)}>
              <span className="sm-status-pill-dot" />
              {statusCopy(attestation, Boolean(apiKey), apiKeyRequired)}
            </button>
            {apiKeyRequired && !apiKey && (
              <button type="button" className="sm-btn sm-btn-ghost" onClick={() => setApiKeyModalOpen(true)}>
                Set API key
              </button>
            )}
            <button type="button" className="sm-icon-btn" onClick={() => setPrivacyOpen(true)} aria-label="Privacy dashboard">⚙</button>
          </div>
        </header>

        <section className="sm-chat-area">
          {activePlans.length > 0 && (
            <div className="sm-workspace-bar">
              {activePlans.map((plan) => {
                const progress = planProgress(plan);
                return (
                  <div key={plan.id} className="sm-ws-plan-strip">
                    <span className="sm-ws-plan-name">{plan.title}</span>
                    <div className="sm-ws-progress-track">
                      <div className="sm-ws-progress-fill" style={{ width: `${progress.percent}%` }} />
                    </div>
                    <span className="sm-ws-plan-pct">{progress.percent}%</span>
                    <button
                      type="button"
                      className="sm-btn sm-btn-ghost sm-btn-mini"
                      onClick={() => setExpandedPlanId(expandedPlanId === plan.id ? null : plan.id)}
                    >
                      {expandedPlanId === plan.id ? "Close" : "Open"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Plan detail drawer */}
          {expandedPlanId && (() => {
            const plan = activePlans.find((p) => p.id === expandedPlanId);
            if (!plan) return null;
            const progress = planProgress(plan);
            return (
              <div className="sm-plan-drawer">
                <div className="sm-plan-drawer-header">
                  <div>
                    <h3>{plan.title}</h3>
                    <p>{plan.goal}</p>
                  </div>
                  <button type="button" className="sm-icon-btn" onClick={() => setExpandedPlanId(null)}>✕</button>
                </div>
                <div className="sm-plan-drawer-meta">
                  <span>{progress.completed}/{progress.total} tasks</span>
                  <span>{progress.percent}% complete</span>
                </div>
                <div className="sm-plan-drawer-actions">
                  <button type="button" className="sm-btn sm-btn-ghost sm-btn-mini" onClick={() => downloadPlanMarkdown(plan)}>Export MD</button>
                  <button type="button" className="sm-btn sm-btn-ghost sm-btn-mini" onClick={() => downloadPlanPdf(plan)}>Export PDF</button>
                </div>
                <div className="sm-plan-drawer-days">
                  {plan.days.map((day) => (
                    <div key={`${plan.id}-${day.day}`} className="sm-plan-day">
                      <strong>{day.title}</strong>
                      <ul>
                        {day.tasks.map((task) => (
                          <li key={task.id}>
                            <label>
                              <input
                                type="checkbox"
                                checked={task.completed}
                                onChange={() => handleTogglePlanTask(plan.id, day.day, task.id)}
                              />
                              <span>{task.label}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {activeConvo.messages.length === 0 && !isTyping ? (
            <div className="sm-empty">
              <AnimatedOrb size={60} />
              <h2>Start a secure conversation</h2>
              <p>
                Ask about symptoms, sleep, stress, nutrition, and wellness.
              </p>
              <div className="sm-quick-prompts">
                {QUICK_PROMPTS.map((p) => (
                  <button key={p.text} type="button" className="sm-quick-btn" onClick={() => void handleSubmit(p.text)}>
                    {p.text}
                  </button>
                ))}
              </div>
              <div className="sm-template-prompts">
                {PLAN_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className="sm-quick-btn"
                    onClick={() => {
                      setInitialPlanTemplate(template.id);
                      setPlanModalOpen(true);
                    }}
                  >
                    Create {template.title}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="sm-messages" ref={messagesContainerRef} onScroll={handleMessagesScroll}>
              {activeConvo.messages.map((msg) => (
                <article key={msg.id} className={`sm-msg ${msg.role === "user" ? "sm-msg-user" : "sm-msg-assistant"}`}>
                  <div className="sm-msg-head">
                    <span className="sm-msg-role">{msg.role === "assistant" ? "SafeMind" : "You"}</span>
                    <span className="sm-msg-time">{formatTime(msg.timestamp)}</span>
                    {msg.encrypted && <span className="sm-msg-tag">Encrypted</span>}
                  </div>
                  <div className={`sm-msg-content ${msg.role === "assistant" ? "sm-msg-content-ai" : "sm-msg-content-user"}`}>
                    {renderMessage(msg.content)}
                  </div>
                </article>
              ))}

              {isTyping && (
                <article className="sm-msg sm-msg-assistant">
                  <div className="sm-msg-head">
                    <span className="sm-msg-role">SafeMind</span>
                    <span className="sm-msg-tag">Streaming</span>
                  </div>
                  {streamingContent ? (
                    <div className="sm-msg-content sm-msg-content-ai">{renderMessage(streamingContent)}</div>
                  ) : (
                    <div className="sm-typing">
                      <div className="sm-typing-dot" />
                      <div className="sm-typing-dot" />
                      <div className="sm-typing-dot" />
                    </div>
                  )}
                </article>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </section>

        <footer className="sm-composer">
          {safetyNotice && (
            <div className="sm-safety-banner" role="status">
              <strong>Safety Notice:</strong> {safetyNotice}
            </div>
          )}
          <div className="sm-composer-tools">
            <button
              type="button"
              className="sm-btn sm-btn-ghost sm-btn-mini"
              onClick={() => {
                setInitialPlanTemplate("weight-gain-8w");
                setPlanModalOpen(true);
              }}
              disabled={isTyping || !vaultPassphrase}
            >
              Create Daily Plan
            </button>
            <span className="sm-composer-tools-hint">
              Template-first workflow. Build, track, and export your daily plan.
            </span>
          </div>
          <div className="sm-composer-inner">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a private health question…"
              rows={1}
              disabled={isTyping || !vaultPassphrase}
              className="sm-textarea"
            />
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!inputValue.trim() || isTyping || !vaultPassphrase}
              className="sm-send-btn"
            >
              ↑
            </button>
          </div>
          <div className="sm-composer-foot">
            {vaultPassphrase
              ? attestation
                ? `Vault encrypted · ${attestationLabel(attestation)} inference`
                : "Vault encrypted · waiting for attestation"
              : "Vault locked — unlock to chat"}
          </div>
        </footer>
      </div>

      <PrivacyDashboard
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        activeConversation={activeConvo}
        nowMs={nowMs}
        conversationCount={conversations.length}
        messageCount={totalMessages}
        attestation={attestation}
        verification={lastVerification}
        hasApiKeyOverride={Boolean(apiKey)}
        onExportData={handleExportData}
        onExportDoctorBrief={handleExportDoctorBrief}
        onSetRetention={handleSetRetention}
        onDeleteAll={() => void handleDeleteAll()}
        onOpenApiKey={() => {
          setPrivacyOpen(false);
          setApiKeyModalOpen(true);
        }}
        onLockVault={lockVault}
      />

      <ApiKeyModal
        open={apiKeyModalOpen}
        onClose={() => setApiKeyModalOpen(false)}
        onSave={handleSaveApiKey}
      />

      <PlanBuilderModal
        key={`${planModalOpen ? "open" : "closed"}-${initialPlanTemplate}`}
        open={planModalOpen}
        initialTemplateId={initialPlanTemplate}
        onClose={() => setPlanModalOpen(false)}
        onCreatePlan={handleCreatePlan}
      />

      <VaultModal
        open={isVaultModalVisible}
        error={vaultError}
        onUnlock={(passphrase) => {
          setVaultPassphrase(passphrase);
          setVaultModalOpen(false);
        }}
      />
    </div>
  );
}

export default function Home() {
  const [started, setStarted] = useState(false);
  const [dissolving, setDissolving] = useState(false);

  const startApp = () => {
    if (started || dissolving) return;
    setDissolving(true);
  };

  useEffect(() => {
    if (!dissolving) return;
    const t = window.setTimeout(() => {
      setStarted(true);
      setDissolving(false);
    }, 380);
    return () => window.clearTimeout(t);
  }, [dissolving]);

  return (
    <>
      {!started && <Landing dissolving={dissolving} onStart={startApp} />}
      {started && <SafeMindApp visible={started} />}
    </>
  );
}
