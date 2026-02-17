"use client";

import { useState } from "react";

export function VaultModal({
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
