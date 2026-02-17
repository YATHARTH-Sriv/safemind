import { NextRequest } from "next/server";

const NEAR_API_BASE = "https://cloud-api.near.ai/v1";
const ALLOWED_NEAR_HEADERS = new Set([
    "x-signing-algo",
    "x-client-pub-key",
    "x-model-pub-key",
]);

function resolveApiKey(req: NextRequest): string {
    const headerKey = req.headers.get("x-near-api-key")?.trim();
    const envKey = process.env.NEAR_AI_API_KEY?.trim();
    const apiKey = headerKey || envKey || "";
    if (!apiKey) {
        throw new Error("Missing NEAR API key. Set NEAR_AI_API_KEY on server or pass x-near-api-key.");
    }
    return apiKey;
}

export async function POST(req: NextRequest) {
    try {
        const apiKey = resolveApiKey(req);
        const body = await req.json();
        const nearHeadersInput = body?.nearHeaders ?? {};

        const nearHeaders: Record<string, string> = {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        };

        for (const [key, value] of Object.entries(nearHeadersInput)) {
            const normalized = key.toLowerCase();
            if (!ALLOWED_NEAR_HEADERS.has(normalized)) continue;
            if (typeof value === "string" && value.length > 0) {
                nearHeaders[key] = value;
            }
        }

        const nearPayload = {
            model: body.model,
            messages: body.messages,
            stream: Boolean(body.stream),
        };

        const nearResponse = await fetch(`${NEAR_API_BASE}/chat/completions`, {
            method: "POST",
            headers: nearHeaders,
            body: JSON.stringify(nearPayload),
        });

        if (!nearResponse.ok) {
            const errText = await nearResponse.text().catch(() => "Upstream error");
            return Response.json(
                { error: `NEAR chat failed (${nearResponse.status}): ${errText}` },
                { status: nearResponse.status }
            );
        }

        if (nearPayload.stream) {
            return new Response(nearResponse.body, {
                status: nearResponse.status,
                headers: {
                    "Content-Type": nearResponse.headers.get("content-type") ?? "text/event-stream",
                    "Cache-Control": "no-cache, no-transform",
                    Connection: "keep-alive",
                    "X-Accel-Buffering": "no",
                },
            });
        }

        const data = await nearResponse.json();
        return Response.json(data, { status: nearResponse.status });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to proxy chat request";
        return Response.json({ error: message }, { status: 500 });
    }
}
