export const NEAR_AI_BASE_URL = "https://cloud-api.near.ai/v1";
export const APP_API_BASE_URL = "/api";
export const MODEL_ID = "deepseek-ai/DeepSeek-V3.1";
export const SIGNING_ALGO = "ecdsa";

export const SYSTEM_PROMPT = `You are SafeMind, a private AI health and wellness companion. You provide thoughtful, evidence-based health and wellness information.

Guidelines:
- Be empathetic, warm, and thorough in your responses
- Use bullet points and clear formatting for readability
- Always recommend consulting a healthcare professional for serious concerns
- Cover common causes, practical advice, and when to seek help
- Never diagnose conditions — provide general wellness information only
- Keep responses focused and actionable

Do not claim a diagnosis. If there are emergency warning signs, clearly advise immediate professional care.`;

export const HEALTH_RESPONSES: Record<string, string> = {
    headache:
        "Based on what you've described, there are several common causes of persistent headaches:\n\n• **Tension headaches** — Often caused by stress, poor posture, or screen time. Try taking regular breaks and gentle neck stretches.\n\n• **Dehydration** — Ensure you're drinking at least 8 glasses of water daily.\n\n• **Sleep quality** — Irregular sleep patterns can trigger headaches.\n\n⚕️ *If your headaches persist for more than a week, are sudden and severe, or are accompanied by vision changes, please consult a healthcare professional.*\n\nThis conversation is end-to-end encrypted. Only you can see it.",
    sleep:
        "Here are evidence-based strategies to improve your sleep quality:\n\n• **Consistent schedule** — Go to bed and wake up at the same time every day, even weekends.\n\n• **Blue light** — Avoid screens 1 hour before bed. Use night mode if needed.\n\n• **Environment** — Keep your room cool (65-68°F), dark, and quiet.\n\n• **Caffeine cutoff** — No caffeine after 2 PM.\n\n• **Wind-down routine** — Try 10 minutes of deep breathing or gentle stretching.\n\n⚕️ *If you experience chronic insomnia lasting more than 3 weeks, consider speaking with a sleep specialist.*\n\nYour sleep data stays private — encrypted on your device only.",
    anxiety:
        "I understand you're experiencing anxiety. Here are some techniques that may help:\n\n• **4-7-8 Breathing** — Inhale for 4 seconds, hold for 7, exhale for 8. Repeat 4 times.\n\n• **Grounding (5-4-3-2-1)** — Name 5 things you see, 4 you feel, 3 you hear, 2 you smell, 1 you taste.\n\n• **Progressive muscle relaxation** — Tense and release each muscle group from toes to head.\n\n• **Limit stimulants** — Reduce caffeine and sugar intake.\n\n💚 Remember: anxiety is common and manageable. You're not alone in this.\n\n⚕️ *If anxiety significantly impacts your daily life, please reach out to a mental health professional.*\n\nThis conversation is fully private — your mental health data never leaves your device.",
    default:
        "Thank you for sharing that with me. I'm here to help with your health and wellness questions.\n\nI can assist with topics like:\n• Sleep and rest optimization\n• Stress and anxiety management\n• Nutrition and hydration\n• Exercise and movement\n• General symptom information\n• Medication reminders\n\n⚕️ *I provide general wellness information. For medical diagnoses or emergencies, always consult a healthcare professional or call emergency services.*\n\nEverything you share here is end-to-end encrypted using NEAR AI's Trusted Execution Environment.",
};

export function getFallbackResponse(userMessage: string): string {
    const lower = userMessage.toLowerCase();
    if (lower.includes("headache") || lower.includes("head") || lower.includes("migraine"))
        return HEALTH_RESPONSES.headache;
    if (lower.includes("sleep") || lower.includes("insomnia") || lower.includes("tired"))
        return HEALTH_RESPONSES.sleep;
    if (lower.includes("anxiety") || lower.includes("anxious") || lower.includes("stress") || lower.includes("worried"))
        return HEALTH_RESPONSES.anxiety;
    return HEALTH_RESPONSES.default;
}
