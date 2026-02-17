"use client";

import type { AttestationReport, ChatVerificationResult, Conversation } from "@/lib/types";

export function PrivacyDashboard({
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
    retentionOptions,
    attestationLabel,
    formatTime,
    formatDate,
    formatDurationLeft,
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
    retentionOptions: Array<{ label: string; value: number | null }>;
    attestationLabel: (attestation: AttestationReport | null) => string;
    formatTime: (ts: number) => string;
    formatDate: (ts: number) => string;
    formatDurationLeft: (expiresAt: number, nowMs: number) => string;
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
                                {retentionOptions.map((option) => (
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
