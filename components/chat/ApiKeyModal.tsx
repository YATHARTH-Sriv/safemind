"use client";

import { useState } from "react";

export function ApiKeyModal({
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
