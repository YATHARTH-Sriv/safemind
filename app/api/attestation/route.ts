import { NextRequest } from "next/server";

const NEAR_API_BASE = "https://cloud-api.near.ai/v1";

function resolveApiKey(req: NextRequest): string {
    const headerKey = req.headers.get("x-near-api-key")?.trim();
    const envKey = process.env.NEAR_AI_API_KEY?.trim();
    const apiKey = headerKey || envKey || "";
    if (!apiKey) {
        throw new Error("Missing NEAR API key. Set NEAR_AI_API_KEY on server or pass x-near-api-key.");
    }
    return apiKey;
}

export async function GET(req: NextRequest) {
    try {
        const apiKey = resolveApiKey(req);
        const url = new URL(req.url);
        const model = url.searchParams.get("model");
        const signingAlgo = url.searchParams.get("signing_algo") ?? "ecdsa";
        const nonce = url.searchParams.get("nonce");

        const upstream = new URL(`${NEAR_API_BASE}/attestation/report`);
        if (model) upstream.searchParams.set("model", model);
        upstream.searchParams.set("signing_algo", signingAlgo);
        if (nonce) upstream.searchParams.set("nonce", nonce);

        const nearResponse = await fetch(upstream.toString(), {
            headers: {
                accept: "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
        });

        if (!nearResponse.ok) {
            const errText = await nearResponse.text().catch(() => "Upstream error");
            return Response.json(
                { error: `NEAR attestation failed (${nearResponse.status}): ${errText}` },
                { status: nearResponse.status }
            );
        }

        const data = await nearResponse.json();
        return Response.json(data, { status: nearResponse.status });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch attestation";
        return Response.json({ error: message }, { status: 500 });
    }
}
