const MODEL = "gemini-3.8-flash";
const MAX_HISTORY = 16;
const MAX_TEXT = 12000;

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Vary": "Origin"
    }
  });
}

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || "https://miloopbd.github.io";
    const origin = request.headers.get("Origin") || "";
    if (origin && origin !== allowedOrigin) return new Response("Origin not allowed", { status: 403 });
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
      }});
    }
    if (request.method === "GET" && new URL(request.url).pathname === "/health") {
      return json({ ok: true, service: "MILOOP AI", model: MODEL }, 200, allowedOrigin);
    }
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, allowedOrigin);
    if (!env.GEMINI_API_KEY || !env.FIREBASE_API_KEY || !env.FIREBASE_PROJECT_ID) {
      return json({ error: "The MILOOP AI service has not been configured yet." }, 503, allowedOrigin);
    }
    const authHeader = request.headers.get("Authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!idToken || idToken.length > 10000) return json({ error: "Please sign in to use MILOOP AI." }, 401, allowedOrigin);

    try {
      const identityResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
      );
      if (!identityResponse.ok) return json({ error: "Your session could not be verified. Please sign in again." }, 401, allowedOrigin);
      const identity = await identityResponse.json();
      const account = identity.users?.[0];
      if (!account?.localId || account.localId.length < 1) return json({ error: "Invalid account session." }, 401, allowedOrigin);

      const body = await request.json();
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY) : [];
      if (!prompt || prompt.length > MAX_TEXT) return json({ error: "Write a question up to 12,000 characters." }, 400, allowedOrigin);
      const contents = [];
      for (const item of history) {
        if (!item || !["user", "model"].includes(item.role) || typeof item.text !== "string") continue;
        const text = item.text.trim().slice(0, MAX_TEXT);
        if (text) contents.push({ role: item.role, parts: [{ text }] });
      }
      contents.push({ role: "user", parts: [{ text: prompt }] });

      const aiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text:
              "You are MILOOP AI, a helpful, honest assistant inside the MILOOP social platform. Answer in the language the user uses, especially natural Bangla when they write Bangla. Be clear, kind, practical, and age-appropriate because some users may be minors. Explain uncertainty and never invent facts, sources, or capabilities. For current facts, say when you may be out of date. Do not provide instructions that facilitate self-harm, violence, dangerous substances, illegal activity, or bypassing safety systems. Do not sexualize minors. For medical, legal, or financial matters, provide general information and encourage an appropriate trusted adult or qualified professional when needed. Format answers with readable paragraphs and lists."
            }] },
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
          })
        }
      );
      const result = await aiResponse.json().catch(() => ({}));
      if (!aiResponse.ok) {
        const message = result.error?.message || "Gemini could not answer right now.";
        return json({ error: message.slice(0, 300) }, aiResponse.status === 429 ? 429 : 502, allowedOrigin);
      }
      const answer = (result.candidates?.[0]?.content?.parts || [])
        .map(part => typeof part.text === "string" ? part.text : "")
        .join("").trim();
      if (!answer) return json({ error: "MILOOP AI did not return a text answer. Please try again." }, 502, allowedOrigin);
      return json({ answer, model: MODEL }, 200, allowedOrigin);
    } catch (error) {
      return json({ error: "A network or server error occurred. Please try again." }, 500, allowedOrigin);
    }
  }
};
