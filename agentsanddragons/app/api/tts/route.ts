export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const debugId = (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    console.log(`[TTS] [${debugId}] POST /api/tts start`);
    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      console.error(`[TTS] [${debugId}] Missing TOGETHER_API_KEY`);
      return new Response(
        JSON.stringify({ error: "Missing TOGETHER_API_KEY server env var", debug_id: debugId }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const { text, voice, model: modelOverride } = await req.json();
    const model = (modelOverride || process.env.TOGETHER_TTS_MODEL || "cartesia/sonic-2") as string;
    console.log(`[TTS] [${debugId}] Input received`, {
      textLength: typeof text === "string" ? text.length : undefined,
      voice: voice || "helpful woman",
      model,
    });
    if (!text || typeof text !== "string") {
      console.error(`[TTS] [${debugId}] Invalid input: missing 'text'`);
      return new Response(
        JSON.stringify({ error: "Field 'text' is required", debug_id: debugId }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const togetherRes = await fetch(
      "https://api.together.ai/v1/audio/generations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "audio/mpeg,application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: text,
          voice: voice || "helpful woman",
          model,
          // Intentionally omit response_format to use Together's default (mp3)
          // which aligns with their SDK behavior
          stream: false,
        }),
      },
    );
    console.log(`[TTS] [${debugId}] Together request sent`, {
      url: "https://api.together.ai/v1/audio/generations",
      model,
      accept: "audio/mpeg,application/json",
    });

    if (!togetherRes.ok) {
      const rawText = await togetherRes.text();
      let togetherErrorMessage: string | undefined;
      try {
        const parsed = JSON.parse(rawText);
        togetherErrorMessage = parsed?.error?.message || parsed?.message;
      } catch {}
      const togetherRequestId =
        togetherRes.headers.get("x-request-id") ||
        togetherRes.headers.get("x-together-request-id") ||
        undefined;
      console.error(`[TTS] [${debugId}] Together TTS error`, {
        status: togetherRes.status,
        statusText: togetherRes.statusText,
        contentType: togetherRes.headers.get("content-type"),
        togetherRequestId,
        body: rawText,
        model,
      });
      return new Response(
        JSON.stringify({
          error: `Together TTS error: ${togetherRes.status} ${togetherRes.statusText}`,
          details: rawText,
          together_status: togetherRes.status,
          together_request_id: togetherRequestId,
          together_error_message: togetherErrorMessage,
          model,
          debug_id: debugId,
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    // Proxy the audio bytes to the client, preserving content-type when available
    const contentType = togetherRes.headers.get("content-type") || "audio/mpeg";
    const togetherRequestId =
      togetherRes.headers.get("x-request-id") ||
      togetherRes.headers.get("x-together-request-id") ||
      undefined;
    console.log(`[TTS] [${debugId}] Together TTS success`, {
      status: togetherRes.status,
      contentType,
      togetherRequestId,
    });
    const buffer = await togetherRes.arrayBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "X-Debug-Id": debugId,
        ...(togetherRequestId ? { "X-Together-Request-Id": togetherRequestId } : {}),
      },
    });
  } catch (err: any) {
    const debugId = Math.random().toString(36).slice(2);
    console.error(`[TTS] [${debugId}] Exception in /api/tts`, err);
    return new Response(
      JSON.stringify({ error: err?.message || "Unexpected error", debug_id: debugId }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}


