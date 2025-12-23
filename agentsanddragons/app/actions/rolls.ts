"use server";

export type DiceResult = {
  result: number;
  active: boolean;
};

export type DiceTerm = {
  faces: number;
  results: DiceResult[];
};

export type RollUser = {
  id: string;
  name: string;
};

export type RollSpeaker = {
  scene: string;
  actor: string | null;
  token: string | null;
  alias: string;
};

export type RollEntry = {
  id: string;
  messageId: string;
  user: RollUser;
  speaker: RollSpeaker;
  flavor: string;
  rollTotal: number;
  formula: string;
  isCritical: boolean;
  isFumble: boolean;
  dice: DiceTerm[];
  timestamp: number;
};

export type FoundryRollsResponse = {
  clientId: string;
  rolls: RollEntry[];
};

export type GetRollsParams = {
  clientId: string;
  limit?: number | string;
  before?: string;
  after?: string;
};

export async function getRolls(params: GetRollsParams): Promise<FoundryRollsResponse> {
  const apiKey = process.env.FOUNDRY_API_KEY;
  if (!apiKey) {
    throw new Error("Missing FOUNDRY_API_KEY");
  }
  if (!params?.clientId) {
    throw new Error("clientId is required");
  }

  const base = process.env.FOUNDRY_RELAY_BASE_URL || "http://localhost:3010";
  const url = new URL("/rolls", base);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
    },
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();

  if (!response.ok) {
    throw new Error(
      `Foundry rolls error: ${response.status} ${response.statusText} - ${raw}`,
    );
  }

  if (!contentType.includes("application/json")) {
    throw new Error("Unexpected non-JSON response from rolls endpoint");
  }

  return JSON.parse(raw) as FoundryRollsResponse;
}


