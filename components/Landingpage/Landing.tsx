"use client";

import { useRef, useEffect } from "react";
import { FaGithub, FaTwitter, FaYoutube } from "react-icons/fa";

interface LandingProps {
    dissolving: boolean;
    onStart: () => void;
}

export function Landing({ dissolving, onStart }: LandingProps) {
    const shellRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const root = shellRef.current;
        if (!root) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("sm-revealed");
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.12 }
        );

        root.querySelectorAll(".sm-reveal").forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    return (
        <main className={`sm-landing ${dissolving ? "sm-landing-dissolve" : ""}`}>
            <div className="sm-landing-shell" ref={shellRef}>
                <header className="sm-nav">
                    <div className="sm-nav-brand">
                        <div className="sm-nav-logo">◍</div>
                        <span>SafeMind</span>
                    </div>
                    <nav className="sm-nav-links" aria-label="Primary">
                        <button type="button">Product</button>
                        <button type="button">Security</button>
                        <button type="button">Architecture</button>
                        <button type="button">Demo</button>
                    </nav>
                    <div className="sm-nav-actions">
                        <button className="sm-btn sm-btn-ghost" type="button" onClick={onStart}>Open App</button>
                        <button className="sm-btn sm-btn-solid" type="button" onClick={onStart}>Start Secure Chat</button>
                    </div>
                </header>

                <section className="sm-hero sm-reveal">
                    <div className="sm-hero-copy">
                        <p className="sm-kicker">Private inference for sensitive wellness workflows</p>
                        <h1>Private AI for health conversations that require trust.</h1>
                        <p className="sm-hero-sub">
                            Encrypted on device. Verified in NEAR TEE. Auditable with signature trace.
                            Built for everyday use, not a one-off demo.
                        </p>
                        <div className="sm-hero-cta-row">
                            <button className="sm-btn sm-btn-solid" type="button" onClick={onStart}>Launch App</button>
                            <button className="sm-btn sm-btn-ghost" type="button">View Architecture</button>
                        </div>
                    </div>

                    <aside className="sm-hero-preview" aria-label="App preview placeholder">
                        <div className="sm-preview-topbar">
                            <span className="sm-dot" />
                            <span className="sm-dot" />
                            <span className="sm-dot" />
                            <span className="sm-preview-title">SafeMind / Secure Session</span>
                            <span className="sm-preview-badge">Nonce-verified</span>
                        </div>
                        <div className="sm-preview-body">
                            <div className="sm-preview-sidebar">
                                <span>Sleep plan</span>
                                <span>Headache notes</span>
                                <span>Nutrition prompts</span>
                            </div>
                            <div className="sm-preview-main">
                                <div className="sm-preview-msg sm-preview-msg-user">I&apos;ve had headaches for 3 days.</div>
                                <div className="sm-preview-msg sm-preview-msg-ai">
                                    <h4>Common causes</h4>
                                    <ul>
                                        <li>Tension or stress</li>
                                        <li>Hydration and sleep debt</li>
                                        <li>Screen and posture fatigue</li>
                                    </ul>
                                </div>
                                <div className="sm-preview-input">Ask a private question…</div>
                            </div>
                        </div>
                    </aside>
                </section>

                <section className="sm-ops sm-reveal" aria-label="Core capabilities">
                    <div className="sm-split-head">
                        <h2>Make private health operations self-driving.</h2>
                        <p>
                            Turn sensitive conversations into actionable, verifiable insight.
                            Each step is routed, encrypted, and auditable end-to-end.
                        </p>
                    </div>
                    <div className="sm-feature-rows">
                        <article className="sm-feature-row sm-reveal" style={{ "--i": 0 } as React.CSSProperties}>
                            <div className="sm-feature-row-left">
                                <span>01</span>
                                <h3>Encrypted Local Vault</h3>
                            </div>
                            <div className="sm-feature-row-right">
                                <p>Conversation history is encrypted-at-rest with your passphrase before IndexedDB writes.</p>
                            </div>
                        </article>
                        <article className="sm-feature-row sm-reveal" style={{ "--i": 1 } as React.CSSProperties}>
                            <div className="sm-feature-row-left">
                                <span>02</span>
                                <h3>TEE-backed Inference</h3>
                            </div>
                            <div className="sm-feature-row-right">
                                <p>Prompts route through NEAR private inference, with attestation payloads checked client-side.</p>
                            </div>
                        </article>
                        <article className="sm-feature-row sm-reveal" style={{ "--i": 2 } as React.CSSProperties}>
                            <div className="sm-feature-row-left">
                                <span>03</span>
                                <h3>Verifiable Responses</h3>
                            </div>
                            <div className="sm-feature-row-right">
                                <p>Request hash and response hash are mapped to gateway signatures for auditable integrity.</p>
                            </div>
                        </article>
                    </div>
                </section>

                <section className="sm-architecture sm-reveal" aria-label="Architecture timeline">
                    <div className="sm-architecture-head">
                        <h2>Architecture Trace</h2>
                        <p>What happens to your data at each step.</p>
                    </div>
                    <div className="sm-architecture-track">
                        <article className="sm-arch-item">
                            <span className="sm-arch-node" />
                            <h4>Client Encrypts</h4>
                            <p>Messages are encrypted with model-bound public key before transit.</p>
                        </article>
                        <article className="sm-arch-item">
                            <span className="sm-arch-node" />
                            <h4>Secure Proxy</h4>
                            <p>Server routes forward requests with strict header controls to NEAR AI Cloud.</p>
                        </article>
                        <article className="sm-arch-item">
                            <span className="sm-arch-node" />
                            <h4>TEE Inference</h4>
                            <p>Inference executes in attested enclaves; outputs are signed for verification.</p>
                        </article>
                        <article className="sm-arch-item">
                            <span className="sm-arch-node" />
                            <h4>Signature Check</h4>
                            <p>Client compares request/response hash pair with signature endpoint result.</p>
                        </article>
                        <article className="sm-arch-item">
                            <span className="sm-arch-node" />
                            <h4>Encrypted Storage</h4>
                            <p>Final conversation is sealed locally in encrypted vault records.</p>
                        </article>
                    </div>
                </section>

                <section className="sm-story sm-reveal" aria-label="Collaboration section">
                    <div className="sm-split-head">
                        <h2>Move work forward across users and AI agents.</h2>
                        <p>
                            Keep sensitive context private while still shipping operationally useful outcomes:
                            summaries, evidence traces, and encrypted records.
                        </p>
                    </div>
                    <div className="sm-story-canvas sm-story-canvas-log">
                        <div className="sm-log-row">
                            <span>Secure intake captured</span>
                            <span>Encrypted</span>
                        </div>
                        <div className="sm-log-row">
                            <span>TEE inference completed</span>
                            <span>Attested</span>
                        </div>
                        <div className="sm-log-row">
                            <span>Response hash + signature matched</span>
                            <span>Verified</span>
                        </div>
                        <div className="sm-log-row">
                            <span>Conversation archived locally</span>
                            <span>Vault</span>
                        </div>
                    </div>
                </section>

                <section className="sm-future sm-reveal">
                    <h2>Built for the future. Ready right now.</h2>
                    <div className="sm-future-actions">
                        <button className="sm-btn sm-btn-solid" type="button" onClick={onStart}>Get started</button>
                        <button className="sm-btn sm-btn-ghost" type="button">Read Security Notes</button>
                    </div>
                </section>

                <footer className="sm-landing-footer" aria-label="Social links">
                    <div className="sm-landing-footer-icons">
                        <a
                            href="https://twitter.com/placeholder"
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Twitter"
                            className="sm-social-link"
                        >
                            <FaTwitter />
                        </a>
                        <a
                            href="https://github.com/placeholder/safemind"
                            target="_blank"
                            rel="noreferrer"
                            aria-label="GitHub"
                            className="sm-social-link"
                        >
                            <FaGithub />
                        </a>
                        <a
                            href="https://youtube.com/watch?v=placeholder"
                            target="_blank"
                            rel="noreferrer"
                            aria-label="YouTube demo"
                            className="sm-social-link"
                        >
                            <FaYoutube />
                        </a>
                    </div>
                </footer>
            </div>
        </main>
    );
}
