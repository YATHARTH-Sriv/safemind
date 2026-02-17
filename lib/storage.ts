import type { Conversation } from "./types";

const DB_NAME = "safemind_db";
const DB_VERSION = 1;
const STORE_NAME = "conversations";
const PBKDF2_ITERATIONS = 210_000;

interface EncryptedConversationRecord {
    id: string;
    createdAt: number;
    payload: string;
    iv: string;
    salt: string;
    v: 1;
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const baseKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(passphrase),
        "PBKDF2",
        false,
        ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            hash: "SHA-256",
            salt: toArrayBuffer(salt),
            iterations: PBKDF2_ITERATIONS,
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

async function encryptConversation(conversation: Conversation, passphrase: string): Promise<EncryptedConversationRecord> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveAesKey(passphrase, salt);
    const plaintext = new TextEncoder().encode(JSON.stringify(conversation));
    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: toArrayBuffer(iv) },
        key,
        toArrayBuffer(plaintext)
    );

    return {
        id: conversation.id,
        createdAt: conversation.createdAt,
        payload: bytesToBase64(new Uint8Array(encrypted)),
        iv: bytesToBase64(iv),
        salt: bytesToBase64(salt),
        v: 1,
    };
}

async function decryptConversation(record: EncryptedConversationRecord, passphrase: string): Promise<Conversation> {
    const salt = base64ToBytes(record.salt);
    const iv = base64ToBytes(record.iv);
    const encrypted = base64ToBytes(record.payload);
    const key = await deriveAesKey(passphrase, salt);
    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: toArrayBuffer(iv) },
        key,
        toArrayBuffer(encrypted)
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as Conversation;
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveConversation(conversation: Conversation, passphrase: string): Promise<void> {
    if (!passphrase) throw new Error("Vault is locked");
    const db = await openDB();
    const record = await encryptConversation(conversation, passphrase);
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getAllConversations(passphrase: string): Promise<Conversation[]> {
    if (!passphrase) return [];
    const db = await openDB();
    const records = await new Promise<unknown[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result as unknown[]);
        request.onerror = () => reject(request.error);
    });

    const decrypted = await Promise.all(
        records.map(async (item) => {
            if (isLegacyConversation(item)) return item;
            return decryptConversation(item as EncryptedConversationRecord, passphrase);
        })
    );

    decrypted.sort((a, b) => b.createdAt - a.createdAt);
    return decrypted;
}

export async function deleteConversation(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function deleteAllConversations(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export function exportConversations(conversations: Conversation[]): string {
    return JSON.stringify(conversations, null, 2);
}

export function downloadJson(data: string, filename: string): void {
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function isLegacyConversation(value: unknown): value is Conversation {
    if (!value || typeof value !== "object") return false;
    const maybe = value as Conversation;
    return (
        typeof maybe.id === "string" &&
        typeof maybe.createdAt === "number" &&
        Array.isArray(maybe.messages)
    );
}
