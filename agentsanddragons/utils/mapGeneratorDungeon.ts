import type { GeneratedMap } from '@/utils/mapGenerator';
import { generateLocalDungeon } from '@/utils/mapGenerator';

type GenerateOpts = {
  gridSize: number; // fine grid size, matches GRID_SIZE in page
  cellPixels: number; // fine pixel size per cell, matches CELL_PIXELS
  step?: number; // coarse cells per block (default 10)
  rooms?: any[]; // optional room templates; if omitted, defaults are used by the lib
  seed?: string;
};

export function generateHalftheoppositeDungeon(opts: GenerateOpts): GeneratedMap {
  const GRID_SIZE = opts.gridSize;
  const CELL_PIXELS = opts.cellPixels;
  const step = typeof opts.step === 'number' && opts.step > 0 ? opts.step : 10;

  try {
    const api = resolveDungeonAPI();
    // If the library is unavailable, fall back to a very simple local generator
    if (!api) {
      const simpleTiles = simpleDungeonTiles(40, 25, { minSize: 4, maxSize: 8, maxRooms: 10 }, opts.seed || 'simple');
      return mapFromTiles(simpleTiles, { gridSize: GRID_SIZE, cellPixels: CELL_PIXELS, step }, opts.seed);
    }
    // The library works on its own tile map dimensions, not our fine grid.
    // Choose a coarse map width/height based on our coarse grid.
    const mapWidth = Math.floor(GRID_SIZE / step);
    const mapHeight = Math.floor(GRID_SIZE / step);

    // Prefer class API if available, else fallback to generate(config)
    let dungeonObj: any = null;
    if (api.Dungeon) {
      const roomsCfg = { minSize: 4, maxSize: 8, maxRooms: 10 };
      const d = new api.Dungeon({ width: mapWidth, height: mapHeight, rooms: roomsCfg });
      if (typeof d.generate === 'function') d.generate();
      dungeonObj = d;
    } else if (api.generate) {
      dungeonObj = api.generate({
        rooms: opts.rooms || [],
        mapWidth,
        mapHeight,
        mapGutterWidth: 1,
        iterations: 5,
        containerSplitRetries: 20,
        containerMinimumRatio: 0.45,
        containerMinimumSize: 4,
        corridorWidth: 2,
        seed: opts.seed || 'dungeon',
      } as any);
    }

    // Extract tiles map from either API shape
    let tiles: number[][] = extractTilesFrom(dungeonObj) || [];
    if (!tiles || tiles.length === 0) {
      // Fallback if library returned nothing
      tiles = simpleDungeonTiles(40, 25, { minSize: 4, maxSize: 8, maxRooms: 10 }, opts.seed || 'simple');
    }
    const coarseH = tiles.length;
    const coarseW = tiles[0]?.length || 0;

    const toPx = (c: number) => c * step * CELL_PIXELS;
    // Detect which numeric value represents floor tiles (rooms/corridors)
    const valueCounts = new Map<number, number>();
    for (let y = 0; y < coarseH; y++) {
      const row = tiles[y] || [];
      for (let x = 0; x < coarseW; x++) {
        const v = row[x] ?? 0;
        valueCounts.set(v, (valueCounts.get(v) || 0) + 1);
      }
    }
    let floorValue: number | null = null;
    if (valueCounts.size > 1) {
      // Prefer the most frequent non-zero value as floor, else fallback to the least frequent overall
      let mostFreqNonZero: [number, number] | null = null;
      for (const [v, c] of valueCounts.entries()) {
        if (v === 0) continue;
        if (!mostFreqNonZero || c > mostFreqNonZero[1]) mostFreqNonZero = [v, c];
      }
      if (mostFreqNonZero) floorValue = mostFreqNonZero[0];
      else {
        // Only zero present? Use zero as floor.
        floorValue = 0;
      }
    } else {
      // Single-valued map, assume non-zero means floor else zero
      const only = [...valueCounts.keys()][0] ?? 0;
      floorValue = only !== 0 ? only : 0;
    }
    const isFloor = (x: number, y: number) => {
      if (y < 0 || y >= coarseH || x < 0 || x >= coarseW) return false;
      const v = tiles[y][x];
      return v === floorValue;
    };

    return mapFromTiles(tiles, { gridSize: GRID_SIZE, cellPixels: CELL_PIXELS, step }, opts.seed);
  } catch (err) {
    // Fallback: ensure something renders using the simple generator
    const simpleTiles = simpleDungeonTiles(40, 25, { minSize: 4, maxSize: 8, maxRooms: 10 }, opts.seed || 'simple');
    return mapFromTiles(simpleTiles, { gridSize: GRID_SIZE, cellPixels: CELL_PIXELS, step }, opts.seed);
  }
}

export function generateHalftheoppositeDungeonWithTiles(opts: GenerateOpts): { map: GeneratedMap; tiles: number[][] } {
  const GRID_SIZE = opts.gridSize;
  const CELL_PIXELS = opts.cellPixels;
  const step = typeof opts.step === 'number' && opts.step > 0 ? opts.step : 10;
  try {
    const api = resolveDungeonAPI();
    if (!api) {
      const tiles = simpleDungeonTiles(40, 25, { minSize: 4, maxSize: 8, maxRooms: 10 }, opts.seed || 'simple');
      return { map: mapFromTiles(tiles, { gridSize: GRID_SIZE, cellPixels: CELL_PIXELS, step }, opts.seed), tiles };
    }

    const mapWidth = Math.floor(GRID_SIZE / step);
    const mapHeight = Math.floor(GRID_SIZE / step);
    let dungeonObj: any = null;
    if (api.Dungeon) {
      const roomsCfg = { minSize: 4, maxSize: 8, maxRooms: 10 };
      const d = new api.Dungeon({ width: mapWidth, height: mapHeight, rooms: roomsCfg });
      if (typeof d.generate === 'function') d.generate();
      dungeonObj = d;
    } else if (api.generate) {
      dungeonObj = api.generate({
        rooms: opts.rooms || [],
        mapWidth,
        mapHeight,
        mapGutterWidth: 1,
        iterations: 5,
        containerSplitRetries: 20,
        containerMinimumRatio: 0.45,
        containerMinimumSize: 4,
        corridorWidth: 2,
        seed: opts.seed || 'dungeon',
      } as any);
    }

    let tiles: number[][] = extractTilesFrom(dungeonObj) || [];
    if (!tiles || tiles.length === 0) {
      tiles = simpleDungeonTiles(40, 25, { minSize: 4, maxSize: 8, maxRooms: 10 }, opts.seed || 'simple');
    }
    return { map: mapFromTiles(tiles, { gridSize: GRID_SIZE, cellPixels: CELL_PIXELS, step }, opts.seed), tiles };
  } catch {
    const tiles = simpleDungeonTiles(40, 25, { minSize: 4, maxSize: 8, maxRooms: 10 }, opts.seed || 'simple');
    return { map: mapFromTiles(tiles, { gridSize: GRID_SIZE, cellPixels: CELL_PIXELS, step }, opts.seed), tiles };
  }
}
function resolveDungeonAPI(): { generate?: (config: any) => any; Dungeon?: any } | null {
  try {
    // avoid bundler static analysis
    // eslint-disable-next-line no-eval
    const req = eval('require') as (id: string) => any;
    const mod = req('@halftheopposite/dungeon');
    const api: any = {};
    if (mod?.generate) api.generate = mod.generate;
    if (mod?.default && typeof mod.default === 'function') api.generate = mod.default;
    if (mod?.Dungeon) api.Dungeon = mod.Dungeon;
    return Object.keys(api).length ? api : null;
  } catch {
    return null;
  }
}

// Build a map (walls/tokens/blocks) from a tiles[][] grid, using the same logic as above
function mapFromTiles(tiles: number[][], dims: { gridSize: number; cellPixels: number; step: number }, seed?: string): GeneratedMap {
  const { cellPixels, step } = dims;
  const coarseH = tiles.length;
  const coarseW = tiles[0]?.length || 0;
  const toPx = (c: number) => c * step * cellPixels;
  const valueCounts = new Map<number, number>();
  for (let y = 0; y < coarseH; y++) {
    const row = tiles[y] || [];
    for (let x = 0; x < coarseW; x++) { const v = row[x] ?? 0; valueCounts.set(v, (valueCounts.get(v) || 0) + 1); }
  }
  let floorValue: number = 1, best = -1;
  for (const [v, c] of valueCounts) { if (v !== 0 && c > best) { floorValue = v; best = c; } }
  const isFloor = (x: number, y: number) => { if (y < 0 || y >= coarseH || x < 0 || x >= coarseW) return false; return tiles[y][x] === floorValue; };
  const walls: Array<{ c: number[]; door?: number }> = [];
  for (let y = 0; y < coarseH; y++) {
    for (let x = 0; x < coarseW; x++) {
      if (!isFloor(x, y)) continue;
      if (!isFloor(x + 1, y)) walls.push({ c: [toPx(x + 1), toPx(y), toPx(x + 1), toPx(y + 1)], door: 0 });
      if (!isFloor(x, y + 1)) walls.push({ c: [toPx(x), toPx(y + 1), toPx(x + 1), toPx(y + 1)], door: 0 });
      if (!isFloor(x - 1, y)) walls.push({ c: [toPx(x), toPx(y), toPx(x), toPx(y + 1)], door: 0 });
      if (!isFloor(x, y - 1)) walls.push({ c: [toPx(x), toPx(y), toPx(x + 1), toPx(y)], door: 0 });
    }
  }
  // choose first/last floor for start/exit
  let firstX = 1, firstY = 1, lastX = Math.max(1, coarseW - 2), lastY = Math.max(1, coarseH - 2);
  outer: for (let y = 0; y < coarseH; y++) { for (let x = 0; x < coarseW; x++) { if (isFloor(x, y)) { firstX = x; firstY = y; break outer; } } }
  outer2: for (let y = coarseH - 1; y >= 0; y--) { for (let x = coarseW - 1; x >= 0; x--) { if (isFloor(x, y)) { lastX = x; lastY = y; break outer2; } } }
  const playerBlock = { x: firstX * step, y: firstY * step };
  const exitBlock = { x: lastX * step, y: lastY * step };
  const tokens: any[] = [
    { name: 'Player', x: toPx(firstX), y: toPx(firstY), uuid: `generated-player-${Date.now()}`, actor: { name: 'Player Character', system: { attributes: { hp: { value: 30, max: 30 }, ac: { value: 15 }, movement: { walk: 30 }, init: { bonus: 2 } }, abilities: { str: { value: 14 }, dex: { value: 16 }, con: { value: 13 }, int: { value: 12 }, wis: { value: 10 }, cha: { value: 8 } } }, items: [] } }
  ];
  // Add monsters on random floor tiles (seeded for reproducibility)
  const rng = mulberry32(hashString((seed || 'hto') + '-monsters'));
  const floorCells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < coarseH; y++) {
    for (let x = 0; x < coarseW; x++) {
      if (!isFloor(x, y)) continue;
      if ((x === firstX && y === firstY) || (x === lastX && y === lastY)) continue;
      floorCells.push({ x, y });
    }
  }
  const monsterCount = Math.min(6, Math.max(3, Math.floor(floorCells.length / 30)));
  for (let i = 0; i < monsterCount && floorCells.length > 0; i++) {
    const idx = Math.floor(rng() * floorCells.length);
    const { x, y } = floorCells.splice(idx, 1)[0];
    tokens.push({
      name: `Goblin ${i + 1}`,
      x: toPx(x),
      y: toPx(y),
      uuid: `generated-goblin-${i + 1}-${Date.now()}`,
      actor: {
        name: `Goblin ${i + 1}`,
        system: {
          attributes: { hp: { value: 12, max: 12 }, ac: { value: 13 }, movement: { walk: 30 }, init: { bonus: 2 } },
          abilities: { str: { value: 8 }, dex: { value: 14 }, con: { value: 10 }, int: { value: 10 }, wis: { value: 8 }, cha: { value: 8 } },
        },
        items: [
          { _id: `scimitar-${i + 1}`, name: 'Scimitar', type: 'weapon', system: { activation: { type: 'action' }, range: { value: 5, units: 'ft' } } },
        ],
      },
    });
  }
  return { walls, tokens, playerBlock, exitBlock };
}

// Extremely simple room-and-corridor generator producing a tiles[][] array with floors as 1 and empty as 0
function simpleDungeonTiles(width: number, height: number, roomsCfg: { minSize: number; maxSize: number; maxRooms: number }, seed: string): number[][] {
  const tiles: number[][] = Array.from({ length: height }, () => Array(width).fill(0));
  const rng = mulberry32(hashString(seed));
  type Room = { x: number; y: number; w: number; h: number; cx: number; cy: number };
  const rooms: Room[] = [];
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const overlaps = (a: Room, b: Room) => !(a.x + a.w + 1 < b.x || b.x + b.w + 1 < a.x || a.y + a.h + 1 < b.y || b.y + b.h + 1 < a.y);
  const carveRoom = (r: Room) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) tiles[y][x] = 1; };
  const carveCorridor = (x0: number, y0: number, x1: number, y1: number) => {
    if (rng() < 0.5) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) tiles[y0][x] = 1; for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) tiles[y][x1] = 1; }
    else { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) tiles[y][x0] = 1; for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) tiles[y1][x] = 1; }
  };
  for (let i = 0; i < roomsCfg.maxRooms; i++) {
    const w = Math.floor(rng() * (roomsCfg.maxSize - roomsCfg.minSize + 1)) + roomsCfg.minSize;
    const h = Math.floor(rng() * (roomsCfg.maxSize - roomsCfg.minSize + 1)) + roomsCfg.minSize;
    const x = clamp(Math.floor(rng() * (width - w - 2)) + 1, 1, Math.max(1, width - w - 1));
    const y = clamp(Math.floor(rng() * (height - h - 2)) + 1, 1, Math.max(1, height - h - 1));
    const r: Room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
    if (rooms.some(other => overlaps(r, other))) continue;
    rooms.push(r);
    carveRoom(r);
  }
  rooms.sort((a, b) => a.cx - b.cx || a.cy - b.cy);
  for (let i = 1; i < rooms.length; i++) carveCorridor(rooms[i - 1].cx, rooms[i - 1].cy, rooms[i].cx, rooms[i].cy);
  // Ensure at least something
  if (rooms.length === 0) carveRoom({ x: 2, y: 2, w: Math.min(8, width - 4), h: Math.min(6, height - 4), cx: 0, cy: 0 });
  return tiles;
}

function hashString(s: string): number { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^ (h >>> 16)) >>> 0; }
function mulberry32(seed: number) { return function() { let t = (seed += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function extractTilesFrom(obj: any): number[][] | null {
  if (!obj) return null;
  // class-based instance
  if (typeof obj.getMap === 'function') {
    const map = obj.getMap();
    if (Array.isArray(map) && Array.isArray(map[0])) return map as number[][];
  }
  if (obj?.layers?.tiles?.map && Array.isArray(obj.layers.tiles.map)) {
    return obj.layers.tiles.map as number[][];
  }
  if (Array.isArray(obj?.map) && Array.isArray(obj.map[0])) {
    return obj.map as number[][];
  }
  if (obj?.tiles && Array.isArray(obj.tiles.map)) {
    return obj.tiles.map as number[][];
  }
  return null;
}


