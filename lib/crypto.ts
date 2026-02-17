import type { E2EEKeys, AttestationReport, ChatSignature } from "./types";
import { APP_API_BASE_URL, MODEL_ID, SIGNING_ALGO } from "./constants";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

function hexToBytes(hex: string): Uint8Array {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
        bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
    }
    return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function normalizePubKey(pubKeyHex: string): Uint8Array {
    const clean = pubKeyHex.startsWith("0x") ? pubKeyHex.slice(2) : pubKeyHex;
    const bytes = hexToBytes(clean);
    if (bytes.length === 64) {
        const withPrefix = new Uint8Array(65);
        withPrefix[0] = 0x04;
        withPrefix.set(bytes, 1);
        return withPrefix;
    }
    return bytes;
}

function isHex(value: string) {
    return /^[0-9a-fA-F]+$/.test(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function findNonceRecursive(node: unknown, nonce: string, seen = new WeakSet<object>()): boolean {
    if (typeof node === "string") return node.toLowerCase() === nonce.toLowerCase();
    if (!node || typeof node !== "object") return false;
    if (seen.has(node)) return false;
    seen.add(node);

    if (Array.isArray(node)) {
        for (const item of node) {
            if (findNonceRecursive(item, nonce, seen)) return true;
        }
        return false;
    }

    for (const value of Object.values(node)) {
        if (findNonceRecursive(value, nonce, seen)) return true;
    }
    return false;
}

export async function fetchModelPublicKey(apiKey?: string): Promise<AttestationReport> {
    const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
    const url = `${APP_API_BASE_URL}/attestation?model=${encodeURIComponent(MODEL_ID)}&signing_algo=${SIGNING_ALGO}&nonce=${nonce}`;

    const res = await fetch(url, {
        headers: {
            accept: "application/json",
            ...(apiKey ? { "x-near-api-key": apiKey } : {}),
        },
    });

    if (!res.ok) throw new Error(`Attestation request failed: ${res.status}`);

    const data = await res.json();
    const modelAttestation = data.model_attestations?.[0];

    if (!modelAttestation?.signing_public_key) {
        throw new Error("No model public key in attestation response");
    }

    const signingPublicKey = String(modelAttestation.signing_public_key);
    const cleanKey = signingPublicKey.replace(/^0x/, "");
    const keyLength = signingPublicKey.startsWith("0x")
        ? signingPublicKey.length - 2
        : signingPublicKey.length;
    const keyLooksValid = isHex(cleanKey) && [128, 130].includes(keyLength);
    const nonceMatched = findNonceRecursive(data, nonce);
    const keyFingerprint = cleanKey.length >= 16
        ? `${cleanKey.slice(0, 8)}…${cleanKey.slice(-8)}`
        : cleanKey;
    const verificationLevel: AttestationReport["verificationLevel"] = keyLooksValid
        ? nonceMatched
            ? "nonce"
            : "format"
        : "none";

    const note =
        verificationLevel === "nonce"
            ? "Model key format and nonce freshness checks passed."
            : verificationLevel === "format"
                ? "Model key format check passed, but nonce echo was not found."
                : "Attestation payload did not include a valid model key format.";

    return {
        signingPublicKey,
        keyFingerprint,
        signingAlgo: SIGNING_ALGO,
        environment: "NEAR AI TEE Enclave",
        model: MODEL_ID,
        verified: verificationLevel === "nonce",
        verificationLevel,
        nonceMatched,
        nonce,
        checkedAt: Date.now(),
        note,
    };
}

export async function generateClientKeys(): Promise<E2EEKeys> {
    const privateKey = secp256k1.utils.randomSecretKey();
    const publicKey = secp256k1.getPublicKey(privateKey, false);
    return { publicKeyHex: bytesToHex(publicKey), privateKey };
}

export async function encryptMessageWithClientKeys(
    plaintext: string,
    modelPubKeyHex: string,
    clientKeys: E2EEKeys
): Promise<string> {
    const modelPubKeyBytes = normalizePubKey(modelPubKeyHex);
    const sharedSecretFull = secp256k1.getSharedSecret(clientKeys.privateKey, modelPubKeyBytes, false);
    const sharedSecret = sharedSecretFull.slice(1, 33);
    const derivedKey = hkdf(
        sha256,
        sharedSecret,
        undefined,
        new TextEncoder().encode("ecdsa_encryption"),
        32
    );
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const plaintextBytes = new TextEncoder().encode(plaintext);

    const cryptoKeyObj = await crypto.subtle.importKey(
        "raw", toArrayBuffer(derivedKey), { name: "AES-GCM" }, false, ["encrypt"]
    );

    const ciphertextWithTag = new Uint8Array(
        await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: toArrayBuffer(nonce) },
            cryptoKeyObj,
            toArrayBuffer(plaintextBytes)
        )
    );

    const ephemeralPub = normalizePubKey(clientKeys.publicKeyHex);
    const combined = new Uint8Array(ephemeralPub.length + nonce.length + ciphertextWithTag.length);
    combined.set(ephemeralPub, 0);
    combined.set(nonce, ephemeralPub.length);
    combined.set(ciphertextWithTag, ephemeralPub.length + nonce.length);

    return bytesToHex(combined);
}

export async function decryptResponse(
    encryptedHex: string,
    clientPrivateKey: Uint8Array
): Promise<string> {
    const data = hexToBytes(encryptedHex);
    const ephemeralPub = data.slice(0, 65);
    const nonce = data.slice(65, 77);
    const ciphertextWithTag = data.slice(77);

    const sharedSecretFull = secp256k1.getSharedSecret(clientPrivateKey, ephemeralPub, false);
    const sharedSecret = sharedSecretFull.slice(1, 33);
    const derivedKey = hkdf(
        sha256,
        sharedSecret,
        undefined,
        new TextEncoder().encode("ecdsa_encryption"),
        32
    );

    const cryptoKeyObj = await crypto.subtle.importKey(
        "raw", toArrayBuffer(derivedKey), { name: "AES-GCM" }, false, ["decrypt"]
    );

    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: toArrayBuffer(nonce) },
        cryptoKeyObj,
        toArrayBuffer(ciphertextWithTag)
    );

    return new TextDecoder().decode(decrypted);
}

export async function sha256Hex(input: string): Promise<string> {
    const data = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return bytesToHex(new Uint8Array(hashBuffer));
}

export async function fetchChatSignature(chatId: string, apiKey?: string): Promise<ChatSignature | null> {
    const url = `${APP_API_BASE_URL}/signature/${encodeURIComponent(chatId)}?model=${encodeURIComponent(MODEL_ID)}&signing_algo=${SIGNING_ALGO}`;
    const res = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "x-near-api-key": apiKey } : {}),
        },
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.signature || !data?.text) return null;
    return {
        text: data.text,
        signature: data.signature,
        signingAddress: data.signing_address,
        signingAlgo: data.signing_algo,
    };
}
