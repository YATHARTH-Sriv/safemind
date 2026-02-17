"use client";

import { AnimatedOrb } from "@/components/chat/animated-orb";
import { MessageRenderer } from "@/components/chat/MessageRenderer";
import { ApiKeyModal } from "@/components/chat/ApiKeyModal";
import { VaultModal } from "@/components/chat/VaultModal";
import { PlanBuilderModal } from "@/components/chat/PlanBuilderModal";
import { PrivacyDashboard } from "@/components/chat/PrivacyDashboard";
import { useState, useEffect, useRef, useCallback } from "react";
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
import { Landing } from "@/components/landingpage/Landing";

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
                    <MessageRenderer content={msg.content} />
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
                    <div className="sm-msg-content sm-msg-content-ai">
                      <MessageRenderer content={streamingContent} />
                    </div>
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
        retentionOptions={RETENTION_OPTIONS}
        attestationLabel={attestationLabel}
        formatTime={formatTime}
        formatDate={formatDate}
        formatDurationLeft={formatDurationLeft}
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
        templates={PLAN_TEMPLATES}
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
