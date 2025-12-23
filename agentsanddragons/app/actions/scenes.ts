"use server";

// Import Foundry types from our type declaration file
import type { FoundryActor } from "@/types/foundry-vtt";

export type SceneListItem = {
  uuid: string;
  id: string;
  name: string;
  package?: string;
  packageName?: string;
};

export type GetSceneIdsParams = {
  clientId: string;
  worldId?: string;
};

type RelaySearchResult = {
  documentType: string;
  id: string;
  name: string;
  package?: string;
  packageName?: string;
  uuid: string;
};

type RelaySearchResponse = {
  requestId: string;
  clientId: string;
  totalResults: number;
  results: RelaySearchResult[];
};

export async function getSceneIds(
  params: GetSceneIdsParams,
): Promise<SceneListItem[]> {
  const apiKey = process.env.FOUNDRY_API_KEY;
  if (!apiKey) {
    throw new Error("Missing FOUNDRY_API_KEY");
  }
  if (!params?.clientId) {
    throw new Error("clientId is required");
  }

  console.log("Getting scene ids for clientId:", params.clientId);

  const base = process.env.FOUNDRY_RELAY_BASE_URL || "http://localhost:3010";
  const url = new URL("/search", base);
  url.searchParams.set("clientId", params.clientId);
  url.searchParams.set("query", "");
  const baseFilter = "documentType:Scene";
  const filter = params.worldId
    ? `${baseFilter},package:world.${params.worldId}`
    : baseFilter;
  url.searchParams.set("filter", filter);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { "x-api-key": apiKey },
    cache: "no-store",
  });

  console.log("Relay search response:", response);

  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();

  if (!response.ok) {
    throw new Error(
      `Foundry scenes search error: ${response.status} ${response.statusText} - ${raw}`,
    );
  }

  if (!contentType.includes("application/json")) {
    throw new Error("Unexpected non-JSON response from search endpoint");
  }
  console.log("Relay search results:", raw);

  const data = JSON.parse(raw) as RelaySearchResponse;
  return (data.results || [])
    .filter((r) => r.documentType === "Scene")
    .map((r) => ({
      uuid: r.uuid,
      id: r.id,
      name: r.name,
      package: r.package,
      packageName: r.packageName,
    }));
}


// Types for scene entities response
// Using Foundry VTT types where possible, with custom extensions for our API response format
export type SceneGridInfo = {
  size: number;
  distance: number;
  units: string;
};

export type SceneInfo = {
  id: string;
  uuid: string;
  name: string;
  width: number;
  height: number;
  grid: SceneGridInfo;
};

// TokenEntity matches our API response structure
// Uses Foundry's Actor type for the actor property to get type safety
export type TokenEntity = {
  id: string;
  uuid: string;
  name: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  elevation?: number;
  rotation?: number;
  actor?: FoundryActor;
};

export type TileEntity = {
  id: string;
  uuid: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
};

export type DrawingEntity = {
  id: string;
  uuid: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
};

export type LightEntity = {
  id: string;
  uuid: string;
  x: number;
  y: number;
};

export type SoundEntity = {
  id: string;
  uuid: string;
  x: number;
  y: number;
};

export type NoteEntity = {
  id: string;
  uuid: string;
  x: number;
  y: number;
};

export type GetSceneEntitiesResponse = {
  scene: SceneInfo;
  tokens: TokenEntity[];
  tiles: TileEntity[];
  drawings: DrawingEntity[];
  lights: LightEntity[];
  sounds: SoundEntity[];
  notes: NoteEntity[];
};

export type GetSceneEntitiesParams = {
  clientId: string;
  sceneId?: string; // Optional: Foundry Scene id (not UUID)
};

export async function getSceneEntities(
  params: GetSceneEntitiesParams,
): Promise<GetSceneEntitiesResponse> {
  const apiKey = process.env.FOUNDRY_API_KEY;
  if (!apiKey) {
    throw new Error("Missing FOUNDRY_API_KEY");
  }
  if (!params?.clientId) {
    throw new Error("clientId is required");
  }
  // sceneId is optional; we'll infer the active/viewed scene when missing

  const base = process.env.FOUNDRY_RELAY_BASE_URL || "http://localhost:3010";
  const execUrl = new URL("/execute-js", base);
  execUrl.searchParams.set("clientId", params.clientId);

  // Build script to extract scene info and placeables with coordinates
  const script = `
    const sid = ${JSON.stringify(params.sceneId ?? null)};
    let s = sid ? (game?.scenes?.get(sid) ?? null) : null;
    // Infer a scene if none provided
    if (!s) {
      s = (game?.scenes?.viewed ?? (typeof canvas !== 'undefined' ? canvas?.scene : null) ?? game?.scenes?.active ?? game?.scenes?.current ?? (Array.isArray(game?.scenes?.contents) ? game?.scenes?.contents?.[0] : null)) || null;
    }
    if (!s) return { error: 'scene not found', sceneId: sid };
    const gridSize = (s.grid && typeof s.grid === 'object') ? (s.grid.size ?? s.grid) : (s.grid ?? 0);
    const gridDistance = (s.grid && typeof s.grid === 'object') ? (s.grid.distance ?? s.gridDistance ?? 0) : (s.gridDistance ?? 0);
    const gridUnits = (s.grid && typeof s.grid === 'object') ? (s.grid.units ?? s.gridUnits ?? '') : (s.gridUnits ?? '');
    const mapToken = t => {
      const actor = t.actor;
      return {
        id: t.id, 
        uuid: t.uuid, 
        name: t.name ?? '', 
        x: t.x ?? 0, 
        y: t.y ?? 0, 
        width: t.width, 
        height: t.height, 
        elevation: t.elevation, 
        rotation: t.rotation,
        actor: actor ? {
          name: actor.name,
          system: {
            attributes: {
              hp: actor.system?.attributes?.hp || {},
              ac: actor.system?.attributes?.ac || {},
              movement: actor.system?.attributes?.movement || {},
              init: actor.system?.attributes?.init || {}
            },
            abilities: {
              str: actor.system?.abilities?.str || {},
              dex: actor.system?.abilities?.dex || {},
              con: actor.system?.abilities?.con || {},
              int: actor.system?.abilities?.int || {},
              wis: actor.system?.abilities?.wis || {},
              cha: actor.system?.abilities?.cha || {}
            }
          },
          items: (() => {
            // Try multiple ways to access actor items
            const itemsArray = actor.items?.contents || actor.items || [];
            return Array.from(itemsArray).map(item => ({
              _id: item._id,
              name: item.name,
              type: item.type,
              img: item.img,
              system: {
                description: item.system?.description || {},
                activation: item.system?.activation || {},
                actionType: item.system?.actionType,
                attack: item.system?.attack || {},
                damage: item.system?.damage || {},
                range: item.system?.range || {},
                save: item.system?.save || {}
              }
            }));
          })()
        } : undefined
      };
    };
    const mapRect = o => ({ id: o.id, uuid: o.uuid, x: o.x ?? 0, y: o.y ?? 0, width: o.width, height: o.height, rotation: o.rotation });
    const scene = { id: s.id, uuid: s.uuid, name: s.name, width: s.width ?? 0, height: s.height ?? 0, grid: { size: gridSize || 0, distance: gridDistance || 0, units: gridUnits || '' } };
    return {
      scene,
      tokens: Array.from(s.tokens ?? []).map(mapToken),
      tiles: Array.from(s.tiles ?? []).map(mapRect),
      drawings: Array.from(s.drawings ?? []).map(mapRect),
      lights: Array.from(s.lights ?? []).map(o => ({ id: o.id, uuid: o.uuid, x: o.x ?? 0, y: o.y ?? 0 })),
      sounds: Array.from(s.sounds ?? []).map(o => ({ id: o.id, uuid: o.uuid, x: o.x ?? 0, y: o.y ?? 0 })),
      notes: Array.from(s.notes ?? []).map(o => ({ id: o.id, uuid: o.uuid, x: o.x ?? 0, y: o.y ?? 0 }))
    };
  `;

  const execRes = await fetch(execUrl.toString(), {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ script }),
    cache: "no-store",
  });

  const contentType = execRes.headers.get("content-type") || "";
  const raw = await execRes.text();

  if (!execRes.ok) {
    throw new Error(
      `Foundry execute-js error: ${execRes.status} ${execRes.statusText} - ${raw}`,
    );
  }
  if (!contentType.includes("application/json")) {
    throw new Error("Unexpected non-JSON response from execute-js endpoint");
  }

  const data: any = JSON.parse(raw);
  const result = data?.result;
  let payload: any = result;
  if (typeof result === "string") {
    try {
      payload = JSON.parse(result);
    } catch {
      // leave as string
    }
  }
  if (!payload || payload.error) {
    throw new Error(`Scene entities fetch failed: ${payload?.error || 'unknown error'}`);
  }

  return payload as GetSceneEntitiesResponse;
}

// -------------------- Walls --------------------
export type WallEntity = {
  id: string;
  uuid: string;
  c: number[]; // [x1, y1, x2, y2]
  door?: number;
  ds?: number;
  move?: number;
  sight?: number;
  sound?: number;
  light?: number;
};

export type GetSceneWallsParams = {
  clientId: string;
  sceneId?: string;
};

export type GetSceneWallsResponse = {
  sceneId: string;
  sceneUuid?: string;
  walls: WallEntity[];
};

export async function getSceneWalls(
  params: GetSceneWallsParams,
): Promise<GetSceneWallsResponse> {
  const apiKey = process.env.FOUNDRY_API_KEY;
  if (!apiKey) throw new Error("Missing FOUNDRY_API_KEY");
  if (!params?.clientId) throw new Error("clientId is required");

  const base = process.env.FOUNDRY_RELAY_BASE_URL || "http://localhost:3010";
  const execUrl = new URL("/execute-js", base);
  execUrl.searchParams.set("clientId", params.clientId);

  const script = `
    const sid = ${JSON.stringify(params.sceneId ?? null)};
    let s = sid ? (game?.scenes?.get(sid) ?? null) : null;
    if (!s) {
      s = (game?.scenes?.viewed ?? (typeof canvas !== 'undefined' ? canvas?.scene : null) ?? game?.scenes?.active ?? game?.scenes?.current ?? (Array.isArray(game?.scenes?.contents) ? game?.scenes?.contents?.[0] : null)) || null;
    }
    if (!s) return { error: 'scene not found', sceneId: sid };
    const walls = Array.from(s.walls ?? []).map(w => ({ id: w.id, uuid: w.uuid, c: Array.isArray(w.c) ? w.c : [], door: w.door, ds: w.ds, move: w.move, sight: w.sight, sound: w.sound, light: w.light }));
    return { sceneId: s.id, sceneUuid: s.uuid, walls };
  `;

  const res = await fetch(execUrl.toString(), {
    method: "POST",
    headers: { "x-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ script }),
    cache: "no-store",
  });

  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(
      `Foundry execute-js error: ${res.status} ${res.statusText} - ${raw}`,
    );
  }
  if (!contentType.includes("application/json")) {
    throw new Error("Unexpected non-JSON response from execute-js endpoint");
  }

  const data: any = JSON.parse(raw);
  const result = data?.result;
  let payload: any = result;
  if (typeof result === "string") {
    try { payload = JSON.parse(result); } catch {}
  }
  if (!payload || payload.error) {
    throw new Error(`Scene walls fetch failed: ${payload?.error || 'unknown error'}`);
  }
  return payload as GetSceneWallsResponse;
}


