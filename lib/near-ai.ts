import type { StreamCallback, E2EEKeys, StreamResult } from "./types";
import {
    decryptResponse,
    fetchModelPublicKey,
    fetchChatSignature,
    generateClientKeys,
    encryptMessageWithClientKeys,
    sha256Hex,
} from "./crypto";
import { APP_API_BASE_URL, MODEL_ID, SYSTEM_PROMPT, SIGNING_ALGO } from "./constants";
import type { AttestationReport, ChatVerificationResult } from "./types";

let cachedAttestation: AttestationReport | null = null;

export async function getAttestation(apiKey: string): Promise<AttestationReport> {
    if (cachedAttestation) return cachedAttestation;
    cachedAttestation = await fetchModelPublicKey(apiKey);
    return cachedAttestation;
}

export function clearAttestationCache() {
    cachedAttestation = null;
}

interface ChatOptions {
    apiKey: string;
    message: string;
    history: { role: "user" | "assistant"; content: string }[];
    useE2EE: boolean;
    onChunk: StreamCallback;
    onChatId?: (id: string) => void;
}

export async function streamChat(options: ChatOptions): Promise<StreamResult> {
    const { apiKey, message, history, useE2EE, onChunk, onChatId } = options;

    const messages = [
        { role: "system" as const, content: SYSTEM_PROMPT },
        ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
        { role: "user" as const, content: message },
    ];

    const appHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-near-api-key": apiKey } : {}),
    };

    const nearHeaders: Record<string, string> = {};
    let clientKeys: E2EEKeys | null = null;

    if (useE2EE) {
        const attestation = await getAttestation(apiKey);
        clientKeys = await generateClientKeys();

        nearHeaders["X-Signing-Algo"] = SIGNING_ALGO;
        nearHeaders["X-Client-Pub-Key"] = clientKeys.publicKeyHex;
        nearHeaders["X-Model-Pub-Key"] = attestation.signingPublicKey;

        for (let i = 0; i < messages.length; i += 1) {
            const encrypted = await encryptMessageWithClientKeys(
                messages[i].content,
                attestation.signingPublicKey,
                clientKeys
            );
            messages[i] = { ...messages[i], content: encrypted };
        }
    }

    const nearPayload = {
        model: MODEL_ID,
        messages,
        stream: true,
    };
    const requestHashPromise = sha256Hex(JSON.stringify(nearPayload));
    const body = JSON.stringify({
        ...nearPayload,
        nearHeaders,
    });

    const res = await fetch(`${APP_API_BASE_URL}/chat`, {
        method: "POST",
        headers: appHeaders,
        body,
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error");
        throw new Error(`NEAR AI API error ${res.status}: ${errText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response stream available");

    const decoder = new TextDecoder();
    let fullContent = "";
    let buffer = "";
    let rawResponse = "";
    let latestChatId = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const decodedChunk = decoder.decode(value, { stream: true });
        rawResponse += decodedChunk;
        buffer += decodedChunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;

            const data = trimmed.slice(6);
            if (data === "[DONE]") continue;

            try {
                const parsed = JSON.parse(data);

                if (onChatId && parsed.id) {
                    latestChatId = parsed.id;
                    onChatId(parsed.id);
                }

                const delta = parsed.choices?.[0]?.delta?.content;
                if (!delta) continue;

                if (useE2EE && clientKeys) {
                    try {
                        const decrypted = await decryptResponse(delta, clientKeys.privateKey);
                        fullContent += decrypted;
                        onChunk(decrypted);
                    } catch {
                        fullContent += delta;
                        onChunk(delta);
                    }
                } else {
                    fullContent += delta;
                    onChunk(delta);
                }
            } catch {
                // skip malformed SSE lines
            }
        }
    }

    const verification = latestChatId
        ? await buildVerification({
            chatId: latestChatId,
            requestHash: await requestHashPromise,
            responseHash: await sha256Hex(rawResponse),
            apiKey,
        })
        : undefined;

    return {
        content: fullContent,
        chatId: latestChatId || undefined,
        verification,
    };
}

export async function sendChatNonStreaming(apiKey: string, message: string): Promise<string> {
    const res = await fetch(`${APP_API_BASE_URL}/chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "x-near-api-key": apiKey } : {}),
        },
        body: JSON.stringify({
            model: MODEL_ID,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: message },
            ],
            stream: false,
            nearHeaders: {},
        }),
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "No response received.";
}

async function buildVerification(params: {
    chatId: string;
    requestHash: string;
    responseHash: string;
    apiKey: string;
}): Promise<ChatVerificationResult> {
    const { chatId, requestHash, responseHash, apiKey } = params;
    const signature = await fetchChatSignature(chatId, apiKey);
    const expected = `${requestHash}:${responseHash}`;
    const textMatches = signature?.text === expected;

    return {
        chatId,
        requestHash,
        responseHash,
        signatureFetched: Boolean(signature),
        signatureTextMatches: Boolean(textMatches),
        signature,
    };
}
