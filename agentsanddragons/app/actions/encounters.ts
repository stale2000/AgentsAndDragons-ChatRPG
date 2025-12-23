"use server";

export type EncounterCombatant = {
  id: string;
  name: string;
  tokenUuid: string;
  actorUuid: string;
  img: string;
  initiative: number;
  hidden: boolean;
  defeated: boolean;
};

export type Encounter = {
  id: string;
  round: number;
  turn: number;
  current?: boolean;
  combatants: EncounterCombatant[];
};

export type GetEncountersResponse = {
  requestId: string;
  clientId: string;
  encounters: Encounter[];
};

export type GetEncountersParams = {
  clientId: string;
};

export async function getEncounters(
  params: GetEncountersParams,
): Promise<GetEncountersResponse> {
  const apiKey = process.env.FOUNDRY_API_KEY;
  if (!apiKey) {
    throw new Error("Missing FOUNDRY_API_KEY");
  }
  if (!params?.clientId) {
    throw new Error("clientId is required");
  }

  const base = process.env.FOUNDRY_RELAY_BASE_URL || "http://localhost:3010";
  const url = new URL("/encounters", base);
  url.searchParams.set("clientId", params.clientId);

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
      `Foundry encounters error: ${response.status} ${response.statusText} - ${raw}`,
    );
  }

  if (!contentType.includes("application/json")) {
    throw new Error("Unexpected non-JSON response from encounters endpoint");
  }

  return JSON.parse(raw) as GetEncountersResponse;
}


