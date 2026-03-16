// src/app/api/submit-deal/route.js
// Receives deal submission from students and notifies Serujan

export async function POST(request) {
  try {
    const { name, phone, notes, dealSummary } = await request.json();

    if (!name || !phone) {
      return Response.json({ error: "Nom et téléphone requis" }, { status: 400 });
    }

    // Option 1: Send via Anthropic API to generate a formatted email
    // Option 2: Use a service like Resend, SendGrid, or Zapier webhook
    // Option 3: Use Zapier MCP (already connected)

    // --- ZAPIER WEBHOOK (recommended - you already have Zapier connected) ---
    // Set up a Zapier webhook that receives this payload and:
    // 1. Sends you an email/SMS
    // 2. Creates a task in your CRM (GoHighLevel/Close)
    // 3. Notifies you on Slack

    const zapierWebhookUrl = process.env.ZAPIER_DEAL_WEBHOOK_URL;

    if (zapierWebhookUrl) {
      const webhookResp = await fetch(zapierWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          notes,
          dealSummary,
          submittedAt: new Date().toISOString(),
          source: "Elev8 Deal Agent v8",
        }),
      });

      if (!webhookResp.ok) {
        return Response.json({ error: "Webhook Zapier en erreur" }, { status: 502 });
      }
    } else {
      return Response.json({ error: "ZAPIER_DEAL_WEBHOOK_URL manquant" }, { status: 500 });
    }

    // --- FALLBACK: Log to console (for local development) ---
    console.log("=== NOUVEAU DEAL SOUMIS ===");
    console.log(`Nom: ${name}`);
    console.log(`Téléphone: ${phone}`);
    console.log(`Notes: ${notes}`);
    console.log(`Deal: ${dealSummary}`);
    console.log("===========================");

    return Response.json({ success: true });
  } catch (error) {
    console.error("Submit deal error:", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
