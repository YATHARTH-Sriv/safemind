# SafeMind

SafeMind is a private AI health and wellness companion. It provides an encrypted chat interface where users can ask health-related questions, build structured daily plans, and export summaries for medical appointments. All conversations are end-to-end encrypted using NEAR AI's Trusted Execution Environment and stored locally in an encrypted vault.

## What It Does

- **Private Health Chat** -- Streaming AI conversations powered by DeepSeek V3.1 through NEAR AI. Every message is encrypted client-side before leaving the browser using ECIES (secp256k1 + AES-256-GCM).

- **Encrypted Local Storage** -- Conversations are encrypted at rest in IndexedDB using PBKDF2-derived AES-256-GCM keys (210,000 iterations). Access is gated behind a vault passphrase that is never stored.

- **TEE Attestation Verification** -- The client fetches and verifies attestation reports from the NEAR AI enclave, checking the model signing key format and nonce freshness to confirm inference runs in a trusted environment.

- **Per-Chat Signature Verification** -- After every response, the client computes SHA-256 hashes of the request and response, then fetches an ECDSA signature from the gateway to confirm data integrity.

- **Health Plan Builder** -- Six structured plan templates (weight gain, strength, fat loss, anxiety reset, sleep recovery, mobility/posture) with daily task checklists, progress tracking, and export to Markdown or PDF.

- **Doctor Visit Brief** -- Generates a structured summary of the conversation including patient context, guidance given, red-flag keywords detected, and suggested clinician questions. Exported as a downloadable Markdown file.

- **Safety Detection** -- Scans user input for 14 emergency-related keywords (chest pain, seizure, suicidal, etc.) and surfaces a prominent banner advising immediate professional care.

- **Auto-Delete Retention** -- Configurable self-destruct timers (1 hour, 24 hours, 7 days, or never) with live countdowns. Expired conversations are purged automatically.

## Getting Started

### Prerequisites

- Node.js 18 or later
- A NEAR AI API key

### Setup

```bash
git clone <repo-url>
cd safemind
npm install
```

Create a `.env` file in the project root:

```
NEAR_AI_API_KEY=your_near_ai_api_key_here
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

## Project Structure

```
safemind/
  app/
    api/
      attestation/route.ts    -- Proxies attestation report requests to NEAR AI Cloud.
      chat/route.ts            -- Proxies chat completion requests with streaming support.
      signature/[chatId]/
        route.ts               -- Proxies per-chat signature requests for integrity verification.
    globals.css                -- Complete application stylesheet. Design system tokens,
                                  landing page styles, chat UI, modals, plan drawer,
                                  and responsive breakpoints.
    layout.tsx                 -- Root HTML layout with SEO metadata and dark mode.
    page.tsx                   -- Main application entry. Contains the SafeMindApp component
                                  with chat logic, state management, sidebar, composer,
                                  plan workspace bar, and all event handlers.
  components/
    chat/
      animated-orb.tsx         -- Animated gradient orb used as a visual element.
      ApiKeyModal.tsx          -- Modal for optional NEAR AI API key override.
      MessageRenderer.tsx      -- Parses and renders markdown in AI responses (headings,
                                  lists, bold, italic, inline code).
      PlanBuilderModal.tsx     -- Modal for selecting a plan template, entering profile
                                  context, and generating a health plan.
      PrivacyDashboard.tsx     -- Full privacy control panel showing attestation details,
                                  verification hashes, retention settings, export options,
                                  and vault lock.
      VaultModal.tsx           -- Passphrase entry modal to unlock the encrypted vault.
    landingpage/
      Landing.tsx              -- Complete marketing landing page with navigation, hero
                                  section, feature rows, architecture trace, and footer.
    ui/
      badge.tsx                -- Reusable badge component.
      button.tsx               -- Reusable button component with variants.
      card.tsx                 -- Card layout component.
      dropdown-menu.tsx        -- Dropdown menu component.
      section-header.tsx       -- Section header component.
      skeleton.tsx             -- Loading skeleton component.
  lib/
    constants.ts               -- Application constants: API URLs, model ID, system prompt,
                                  and keyword-matched fallback health responses.
    crypto.ts                  -- Cryptographic engine. ECIES encryption/decryption using
                                  secp256k1 ECDH, HKDF key derivation, AES-256-GCM
                                  symmetric encryption, attestation fetching with nonce
                                  verification, and chat signature retrieval.
    health-plans.ts            -- Plan generation engine. Six template builders that produce
                                  structured daily checklists. Includes progress calculation,
                                  Markdown export, and PDF export via jsPDF.
    near-ai.ts                 -- NEAR AI chat client. Handles streaming SSE parsing,
                                  message encryption/decryption per chunk, request/response
                                  hash computation, and post-chat signature verification.
    storage.ts                 -- Encrypted storage layer. PBKDF2 key derivation, AES-256-GCM
                                  encrypt/decrypt for conversations, IndexedDB CRUD operations,
                                  JSON export, and legacy record migration.
    types.ts                   -- TypeScript type definitions for messages, conversations,
                                  attestation reports, E2EE keys, chat signatures, verification
                                  results, health plans, and plan templates.
    utils.ts                   -- General utility functions.
  public/                      -- Static assets (SVG icons).
  .env                         -- Environment variables (NEAR AI API key).
  package.json                 -- Dependencies and scripts.
  tsconfig.json                -- TypeScript configuration.
```

## Technology Stack

- **Framework** -- Next.js 16 with React 19
- **Language** -- TypeScript
- **Styling** -- Vanilla CSS with custom design system
- **Cryptography** -- @noble/curves (secp256k1), @noble/hashes (SHA-256, HKDF)
- **Storage** -- IndexedDB with AES-256-GCM encryption
- **PDF Generation** -- jsPDF
- **AI Backend** -- NEAR AI Cloud (DeepSeek V3.1) with TEE infrastructure

## Future

### Prescription Analysis

Support for uploading and parsing prescriptions and medical reports. Documents would be processed locally on the client before any data is sent to the AI. The parsed content would feed into conversations as private context, enabling the AI to give more relevant guidance based on the user's actual medications, dosages, and lab results. This also opens the door to medication interaction checks and adherence reminders.

### Personalized Experience

Building on prescription data and conversation history, SafeMind would generate personalized health profiles that adapt over time. Plans would be tailored to individual conditions, dietary restrictions, and medication schedules rather than relying solely on generic templates. The AI would reference prior conversations to track symptom progression and adjust recommendations accordingly.

### Mobile Application

A dedicated mobile app (iOS and Android) to make SafeMind accessible throughout the day. Push notifications for plan task reminders, medication schedules, and retention timer warnings. The encrypted vault and E2EE infrastructure would carry over with the same passphrase-based access model, keeping the privacy guarantees consistent across platforms. Offline support would allow users to review their plans and conversation history without an active connection.
