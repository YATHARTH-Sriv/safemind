export interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: number;
    encrypted: boolean;
    chatId?: string;
}

export interface Conversation {
    id: string;
    title: string;
    messages: Message[];
    createdAt: number;
    retentionHours?: number | null;
    expiresAt?: number | null;
    plans?: HealthPlan[];
}

export interface AttestationReport {
    signingPublicKey: string;
    keyFingerprint: string;
    signingAlgo: string;
    environment: string;
    model: string;
    verified: boolean;
    verificationLevel: "none" | "format" | "nonce";
    nonceMatched: boolean;
    nonce: string;
    checkedAt: number;
    note: string;
}

export interface E2EEKeys {
    publicKeyHex: string;
    privateKey: Uint8Array;
}

export interface ChatSignature {
    text: string;
    signature: string;
    signingAddress: string;
    signingAlgo: string;
}

export type StreamCallback = (chunk: string) => void;

export interface ChatVerificationResult {
    chatId: string;
    requestHash: string;
    responseHash: string;
    signatureFetched: boolean;
    signatureTextMatches: boolean;
    signature?: ChatSignature | null;
}

export interface StreamResult {
    content: string;
    chatId?: string;
    verification?: ChatVerificationResult;
}

export type HealthPlanTemplateId =
    | "weight-gain-8w"
    | "strength-8w"
    | "fat-loss-8w"
    | "anxiety-reset-14d"
    | "sleep-reset-14d"
    | "mobility-reset-21d";

export interface HealthPlanTask {
    id: string;
    label: string;
    completed: boolean;
}

export interface HealthPlanDay {
    day: number;
    title: string;
    tasks: HealthPlanTask[];
}

export interface HealthPlan {
    id: string;
    templateId: HealthPlanTemplateId;
    title: string;
    createdAt: number;
    goal: string;
    notes: string;
    durationDays: number;
    days: HealthPlanDay[];
}

export interface HealthPlanInput {
    templateId: HealthPlanTemplateId;
    profile: string;
    goal: string;
    startDate?: string;
}
