// src/app/api/validate-code/route.js
// Server-side access code validation — codes never exposed to browser

const DEFAULT_CODES = [
  "ELEV8",
  "BATISSEUR",
  "DEALAGENT",
  "SERUJAN2025",
  "PLEX2025",
];

function getValidCodes() {
  const envCodes = process.env.ELEV8_ACCESS_CODES;
  if (!envCodes) return DEFAULT_CODES;
  return envCodes
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}

export async function POST(request) {
  try {
    const { code } = await request.json();

    if (!code || typeof code !== "string") {
      return Response.json({ valid: false }, { status: 400 });
    }

    const valid = getValidCodes().includes(code.toUpperCase().trim());

    // Add rate limiting here in production
    // e.g. track failed attempts by IP

    return Response.json({ valid });
  } catch (error) {
    return Response.json({ valid: false }, { status: 500 });
  }
}
