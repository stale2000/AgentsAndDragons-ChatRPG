import type { GeneratedMap } from '@/utils/mapGenerator';
import { generateLocalDungeon } from '@/utils/mapGenerator';

type GenerateOpts = {
  gridSize: number;
  cellPixels: number;
  step?: number;
  seed?: string;
  // Optional input graph: adjacency list where keys are node ids and values are child ids
  graph?: Record<string, string[]>;
};

export function generateGraphDungeon(opts: GenerateOpts): GeneratedMap {
  const GRID_SIZE = opts.gridSize;
  const CELL_PIXELS = opts.cellPixels;
  const step = typeof opts.step === 'number' && opts.step > 0 ? opts.step : 10;

  try {
    const api = resolveGraphGenerator();
    if (!api) {
      // Simple fallback: produce a small tiles grid and turn into a map
      const tiles = simpleTilesFallback(40, 25, opts.seed || 'graph-simple');
      return mapFromTiles(tiles, { cellPixels: CELL_PIXELS, step });
    }

    const { generate, toTiles } = api;
    const graph = opts.graph || defaultGraph();
    const seed = opts.seed || 'graph';

    // Use the library to produce a Node<Room> tree from the graph
    const nodeTree = generate(graph, { seed });
    // Transform the node tree into a tiles map
    let tiles: number[][] = toTiles(nodeTree) as any;
    if (!tiles || tiles.length === 0) {
      tiles = simpleTilesFallback(40, 25, seed);
    }

    const coarseH = tiles.length;
    const coarseW = tiles[0]?.length || 0;
    const toPx = (c: number) => c * step * CELL_PIXELS;

    // Heuristic: pick the most common non-zero as floor
    const valueCounts = new Map<number, number>();
    for (let y = 0; y < coarseH; y++) {
      const row = tiles[y] || [];
      for (let x = 0; x < coarseW; x++) {
        const v = row[x] ?? 0;
        valueCounts.set(v, (valueCounts.get(v) || 0) + 1);
      }
    }
    let floorValue = 1;
    let bestCount = -1;
    for (const [v, c] of valueCounts) {
      if (v !== 0 && c > bestCount) { floorValue = v; bestCount = c; }
    }
    const isFloor = (x: number, y: number) => {
      if (y < 0 || y >= coarseH || x < 0 || x >= coarseW) return false;
      return tiles[y][x] === floorValue;
    };

    return mapFromTiles(tiles, { cellPixels: CELL_PIXELS, step });
  } catch {
    const tiles = simpleTilesFallback(40, 25, opts.seed || 'graph-simple');
    return mapFromTiles(tiles, { cellPixels: CELL_PIXELS, step });
  }
}

export function generateGraphDungeonWithTiles(opts: GenerateOpts): { map: GeneratedMap; tiles: number[][] } {
  const GRID_SIZE = opts.gridSize;
  const CELL_PIXELS = opts.cellPixels;
  const step = typeof opts.step === 'number' && opts.step > 0 ? opts.step : 10;
  try {
    const api = resolveGraphGenerator();
    if (!api) {
      const tiles = simpleTilesFallback(40, 25, opts.seed || 'graph-simple');
      return { map: mapFromTiles(tiles, { cellPixels: CELL_PIXELS, step }), tiles };
    }
    const { generate, toTiles } = api;
    const graph = opts.graph || defaultGraph();
    const seed = opts.seed || 'graph';
    const nodeTree = generate(graph, { seed });
    let tiles: number[][] = toTiles(nodeTree) as any;
    if (!tiles || tiles.length === 0) tiles = simpleTilesFallback(40, 25, seed);
    return { map: mapFromTiles(tiles, { cellPixels: CELL_PIXELS, step }), tiles };
  } catch {
    const tiles = simpleTilesFallback(40, 25, opts.seed || 'graph-simple');
    return { map: mapFromTiles(tiles, { cellPixels: CELL_PIXELS, step }), tiles };
  }
}
function resolveGraphGenerator(): { generate: Function; toTiles: Function } | null {
  try {
    // eslint-disable-next-line no-eval
    const req = eval('require') as (id: string) => any;
    // Try common entry points
    const mod = safeLoad(req, 'graph-dungeon-generator')
      || safeLoad(req, 'graph-dungeon-generator/dist/generate')
      || safeLoad(req, 'graph-dungeon-generator/src/generate')
      || null;
    const draw = safeLoad(req, 'graph-dungeon-generator/dist/draw')
      || safeLoad(req, 'graph-dungeon-generator/src/draw')
      || null;
    const generate = (mod && (mod.generate || mod.default || mod)) as any;
    const toTiles = (draw && (draw.toTiles || draw.default || draw)) as any;
    if (typeof generate === 'function' && typeof toTiles === 'function') {
      return { generate, toTiles };
    }
    return null;
  } catch {
    return null;
  }
}

function safeLoad(req: (id: string) => any, id: string) {
  try { return req(id); } catch { return null; }
}

function defaultGraph(): Record<string, string[]> {
  return {
    A: ['B', 'C'],
    B: ['D'],
    C: ['E'],
    D: [],
    E: [],
  };
}

// shared helpers (mirrors dungeon fallback behavior)
function mapFromTiles(tiles: number[][], dims: { cellPixels: number; step: number }): GeneratedMap {
  const { cellPixels, step } = dims;
  const coarseH = tiles.length;
  const coarseW = tiles[0]?.length || 0;
  const toPx = (c: number) => c * step * cellPixels;
  const counts = new Map<number, number>();
  for (let y = 0; y < coarseH; y++) { for (let x = 0; x < coarseW; x++) { const v = tiles[y][x] ?? 0; counts.set(v, (counts.get(v) || 0) + 1); } }
  let floor = 1, best = -1; for (const [v, c] of counts) { if (v !== 0 && c > best) { floor = v; best = c; } }
  const isFloor = (x: number, y: number) => { if (y < 0 || y >= coarseH || x < 0 || x >= coarseW) return false; return tiles[y][x] === floor; };
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
  let firstX = 1, firstY = 1, lastX = Math.max(1, coarseW - 2), lastY = Math.max(1, coarseH - 2);
  outer: for (let y = 0; y < coarseH; y++) { for (let x = 0; x < coarseW; x++) { if (isFloor(x, y)) { firstX = x; firstY = y; break outer; } } }
  outer2: for (let y = coarseH - 1; y >= 0; y--) { for (let x = coarseW - 1; x >= 0; x--) { if (isFloor(x, y)) { lastX = x; lastY = y; break outer2; } } }
  const playerBlock = { x: firstX * step, y: firstY * step };
  const exitBlock = { x: lastX * step, y: lastY * step };
  const tokens: any[] = [ { name: 'Player', x: toPx(firstX), y: toPx(firstY), uuid: `generated-player-${Date.now()}`, actor: { name: 'Player Character', system: { attributes: { hp: { value: 30, max: 30 }, ac: { value: 15 }, movement: { walk: 30 }, init: { bonus: 2 } }, abilities: { str: { value: 14 }, dex: { value: 16 }, con: { value: 13 }, int: { value: 12 }, wis: { value: 10 }, cha: { value: 8 } } }, items: [] } } ];
  return { walls, tokens, playerBlock, exitBlock };
}

function simpleTilesFallback(w: number, h: number, seed: string): number[][] {
  // carve a plus-shaped corridors and a couple of rooms as 1's
  const t: number[][] = Array.from({ length: h }, () => Array(w).fill(0));
  const rng = mulberry32(hash(seed));
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  for (let x = 1; x < w - 1; x++) t[cy][x] = 1;
  for (let y = 1; y < h - 1; y++) t[y][cx] = 1;
  const room = (rx: number, ry: number, rw: number, rh: number) => {
    for (let y = ry; y < Math.min(h - 1, ry + rh); y++) for (let x = rx; x < Math.min(w - 1, rx + rw); x++) t[y][x] = 1;
  };
  room(Math.max(1, cx - 6), Math.max(1, cy - 3), 5, 3);
  room(Math.min(w - 6, cx + 2), Math.max(1, cy - 3), 5, 3);
  if (rng() > 0.5) room(2, 2, 6, 4);
  if (rng() > 0.5) room(w - 8, h - 6, 6, 4);
  return t;
}

function hash(s: string): number { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^ (h >>> 16)) >>> 0; }
function mulberry32(seed: number) { return function() { let t = (seed += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }



