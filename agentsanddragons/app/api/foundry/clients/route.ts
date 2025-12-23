import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    const apiKey = process.env.FOUNDRY_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing FOUNDRY_API_KEY" },
        { status: 500 },
      );
    }

    const base = process.env.FOUNDRY_RELAY_BASE_URL || "http://localhost:3010";
    const url = `${base}/clients`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
      },
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") || "";
    const raw = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Foundry clients error: ${response.status} ${response.statusText}`,
          body: raw,
        },
        { status: 502 },
      );
    }

    if (contentType.includes("application/json")) {
      try {
        const data = JSON.parse(raw);
        return NextResponse.json(data);
      } catch (_e) {
        // Fall through to return as text
      }
    }

    return new NextResponse(raw, {
      status: 200,
      headers: { "content-type": contentType || "text/plain" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 },
    );
  }
}


