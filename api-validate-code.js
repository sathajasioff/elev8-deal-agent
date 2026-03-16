// src/app/api/validate-code/route.js
// Server-side access code validation — codes never exposed to browser

const VALID_CODES = [
  "ELEV8",
  "BATISSEUR",
  "DEALAGENT",
  "SERUJAN2025",
  "PLEX2025",
  // Add student-specific codes here
];

export async function POST(request) {
  try {
    const { code } = await request.json();

    if (!code || typeof code !== "string") {
      return Response.json({ valid: false }, { status: 400 });
    }

    const valid = VALID_CODES.includes(code.toUpperCase().trim());

    // Add rate limiting here in production
    // e.g. track failed attempts by IP

    return Response.json({ valid });
  } catch (error) {
    return Response.json({ valid: false }, { status: 500 });
  }
}
