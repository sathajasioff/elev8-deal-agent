// src/app/api/analyze/route.js
// Server-side AI summary for deal analysis

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

export async function POST(request) {
  try {
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return Response.json({ error: "Prompt requis" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "ANTHROPIC_API_KEY manquant" }, { status: 500 });
    }

    const resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 700,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return Response.json({ error: data.error?.message || "Erreur Anthropic" }, { status: resp.status });
    }

    const insight = data.content?.find((block) => block.type === "text")?.text || null;
    return Response.json({ insight });
  } catch (error) {
    console.error("Analyze error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
