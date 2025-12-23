import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Simple Speech-to-Text proxy to Together AI Whisper.
 * Accepts multipart/form-data with fields:
 *  - file: audio blob/file
 *  - language (optional): ISO 639-1 code or "auto"
 */
export async function POST(req: NextRequest) {
  try {
    const togetherApiKey = process.env.TOGETHER_API_KEY;
    if (!togetherApiKey) {
      return NextResponse.json(
        { error: "Missing TOGETHER_API_KEY" },
        { status: 500 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const language = (formData.get("language") as string) || "auto";

    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 },
      );
    }

    const upstream = new FormData();
    // Forward the file; preserve filename if present
    const filename = (file as any)?.name || "audio.webm";
    upstream.append("file", file, filename);
    upstream.append("model", "openai/whisper-large-v3");
    if (language) upstream.append("language", language);
    upstream.append("response_format", "json");

    const response = await fetch(
      "https://api.together.ai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${togetherApiKey}`,
        },
        body: upstream,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Together STT error: ${response.status} ${response.statusText} - ${errorText}` },
        { status: 502 },
      );
    }

    const json = await response.json();
    // Expect shape similar to { text: string, ... }
    return NextResponse.json({ text: json.text ?? "" });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 },
    );
  }
}


