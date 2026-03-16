// src/app/api/search/route.js
// Server-side property lookup via Anthropic web search

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_BETA = "web-search-2025-03-05";
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

export async function POST(request) {
  try {
    const { address } = await request.json();

    if (!address || typeof address !== "string") {
      return Response.json({ error: "Adresse requise" }, { status: 400 });
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
        "anthropic-beta": ANTHROPIC_BETA,
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{
          role: "user",
          content: `Recherche immobilière Québec pour: "${address}". JSON uniquement:\n{"found":true,"address":"","city":"montreal|laval|longueuil|quebec|sherbrooke|gatineau|saint-jerome|granby|brossard|saint-hyacinthe|other","propertyType":"duplex|triplex|quadruplex","askingPrice":0,"municipalEval":0,"yearBuilt":0,"units":[{"type":"4.5","currentRent":0}],"recentSales":[{"date":"","price":0,"description":""}],"confidence":"high|medium|low","notes":"","sources":[]}`,
        }],
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return Response.json({ error: data.error?.message || "Erreur Anthropic" }, { status: resp.status });
    }

    const logs = (data.content || [])
      .filter((block) => block.type === "tool_use")
      .map((block) => `⌕ ${block.input?.query || ""}`);
    const text = data.content?.find((block) => block.type === "text")?.text || "";

    let result = null;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) result = JSON.parse(match[0]);
    } catch {}

    return Response.json({ result, logs });
  } catch (error) {
    console.error("Search error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
