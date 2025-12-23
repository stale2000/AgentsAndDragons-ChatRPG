"use server";

export type MoveEntitiesParams = {
  clientId: string;
  uuids?: string[]; // Specific entity UUIDs like Scene.X.Token.Y
  selected?: boolean; // If true, applies to all currently selected entities
  x?: number; // Absolute X (pixels). Optional; supply x and/or y
  y?: number; // Absolute Y (pixels)
};

export type MoveEntityResult = {
  target: string; // "selected" or the uuid
  success: boolean;
  status?: number;
  error?: string;
};

export type MoveEntitiesResponse = {
  clientId: string;
  results: MoveEntityResult[];
};

export async function moveEntities(
  params: MoveEntitiesParams,
): Promise<MoveEntitiesResponse> {
  const apiKey = process.env.FOUNDRY_API_KEY;
  if (!apiKey) throw new Error("Missing FOUNDRY_API_KEY");

  const { clientId, uuids, selected, x, y } = params ?? {} as MoveEntitiesParams;
  if (!clientId) throw new Error("clientId is required");
  if (x === undefined && y === undefined) {
    throw new Error("At least one of x or y must be provided");
  }
  if (!selected && (!uuids || uuids.length === 0)) {
    throw new Error("Provide uuids or set selected=true");
  }

  const body: { data: Record<string, number> } = { data: {} };
  if (x !== undefined) body.data.x = x;
  if (y !== undefined) body.data.y = y;

  const makeRequest = async (target: string, isSelected: boolean) => {
    const base = process.env.FOUNDRY_RELAY_BASE_URL || "http://localhost:3010";
    const url = new URL("/update", base);
    url.searchParams.set("clientId", clientId);
    if (isSelected) {
      url.searchParams.set("selected", "true");
    } else {
      url.searchParams.set("uuid", target);
    }

    try {
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: {
          "x-api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });

      const text = await res.text();
      if (!res.ok) {
        return {
          target,
          success: false,
          status: res.status,
          error: text,
        } as MoveEntityResult;
      }

      return { target, success: true, status: res.status } as MoveEntityResult;
    } catch (e: any) {
      return {
        target,
        success: false,
        error: e?.message || "request failed",
      } as MoveEntityResult;
    }
  };

  const results: MoveEntityResult[] = [];

  if (selected) {
    results.push(await makeRequest("selected", true));
  }

  if (uuids && uuids.length > 0) {
    const perUuid = await Promise.all(
      uuids.map((u) => makeRequest(u, false)),
    );
    results.push(...perUuid);
  }

  return { clientId, results };
}


