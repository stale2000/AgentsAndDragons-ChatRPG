export type GeneratedMap = {
  walls: Array<{ c: number[]; door?: number }>;
  tokens: any[];
  playerBlock: { x: number; y: number };
  exitBlock: { x: number; y: number };
};

type GenerateOpts = {
  gridSize: number; // fine grid size, matches GRID_SIZE in page
  cellPixels: number; // fine pixel size per cell, matches CELL_PIXELS
  step?: number; // coarse cells per block (default 10)
};

export function generateLocalDungeon(opts: GenerateOpts): GeneratedMap {
  const GRID_SIZE = opts.gridSize;
  const CELL_PIXELS = opts.cellPixels;
  const step = typeof opts.step === 'number' && opts.step > 0 ? opts.step : 10;

  const coarseW = Math.floor(GRID_SIZE / step);
  const coarseH = Math.floor(GRID_SIZE / step);
  const coarse: number[][] = Array.from({ length: coarseH }, () => Array(coarseW).fill(1)); // 1=wall, 0=floor

  type Room = { x: number; y: number; w: number; h: number; cx: number; cy: number };
  const rooms: Room[] = [];
  const desiredRooms = 10;
  const minW = 6, maxW = 14;
  const minH = 6, maxH = 14;
  const spacing = 1;

  const intersects = (a: Room, b: Room) => (
    a.x - spacing < b.x + b.w && a.x + a.w + spacing > b.x &&
    a.y - spacing < b.y + b.h && a.y + a.h + spacing > b.y
  );

  let attempts = 0;
  const maxAttempts = 300;
  while (rooms.length < desiredRooms && attempts++ < maxAttempts) {
    const w = Math.floor(Math.random() * (maxW - minW + 1)) + minW;
    const h = Math.floor(Math.random() * (maxH - minH + 1)) + minH;
    const x = Math.floor(Math.random() * (coarseW - w - 2)) + 1;
    const y = Math.floor(Math.random() * (coarseH - h - 2)) + 1;
    const candidate: Room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
    if (rooms.some(r => intersects(r, candidate))) continue;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        coarse[yy][xx] = 0;
      }
    }
    rooms.push(candidate);
  }

  if (rooms.length === 0) {
    const w = 10, h = 8, x = Math.floor(coarseW / 2) - Math.floor(w / 2), y = Math.floor(coarseH / 2) - Math.floor(h / 2);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) coarse[yy][xx] = 0;
    rooms.push({ x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
  }

  const carveCell = (x: number, y: number, thickness = 1) => {
    for (let oy = -thickness; oy <= thickness; oy++) {
      for (let ox = -thickness; ox <= thickness; ox++) {
        const nx = x + ox, ny = y + oy;
        if (ny >= 0 && ny < coarseH && nx >= 0 && nx < coarseW) coarse[ny][nx] = 0;
      }
    }
  };
  const carveCorridor = (x1: number, y1: number, x2: number, y2: number) => {
    let x = x1, y = y1;
    const thick = 1;
    if (Math.random() < 0.5) {
      while (x !== x2) { carveCell(x, y, thick); x += x < x2 ? 1 : -1; }
      while (y !== y2) { carveCell(x, y, thick); y += y < y2 ? 1 : -1; }
    } else {
      while (y !== y2) { carveCell(x, y, thick); y += y < y2 ? 1 : -1; }
      while (x !== x2) { carveCell(x, y, thick); x += x < x2 ? 1 : -1; }
    }
    carveCell(x2, y2, thick);
  };

  rooms.sort((a, b) => a.cx - b.cx);
  for (let i = 1; i < rooms.length; i++) {
    carveCorridor(rooms[i - 1].cx, rooms[i - 1].cy, rooms[i].cx, rooms[i].cy);
  }
  for (let i = 0; i < Math.min(3, rooms.length - 1); i++) {
    const a = rooms[Math.floor(Math.random() * rooms.length)];
    const b = rooms[Math.floor(Math.random() * rooms.length)];
    if (a !== b) carveCorridor(a.cx, a.cy, b.cx, b.cy);
  }

  const toPx = (c: number) => c * step * CELL_PIXELS;
  const walls: Array<{ c: number[]; door?: number }> = [];
  for (let y = 0; y < coarseH; y++) {
    for (let x = 0; x < coarseW; x++) {
      if (coarse[y][x] !== 0) continue;
      if (x + 1 >= coarseW || coarse[y][x + 1] === 1) walls.push({ c: [toPx(x + 1), toPx(y), toPx(x + 1), toPx(y + 1)], door: 0 });
      if (y + 1 >= coarseH || coarse[y + 1][x] === 1) walls.push({ c: [toPx(x), toPx(y + 1), toPx(x + 1), toPx(y + 1)], door: 0 });
      if (x === 0) walls.push({ c: [toPx(x), toPx(y), toPx(x), toPx(y + 1)], door: 0 });
      if (y === 0) walls.push({ c: [toPx(x), toPx(y), toPx(x + 1), toPx(y)], door: 0 });
    }
  }

  const first = rooms[0];
  const last = rooms[rooms.length - 1];
  const playerBlock = { x: first.cx * step, y: first.cy * step };
  const exitBlock = { x: last.cx * step, y: last.cy * step };

  const tokens: any[] = [{
    name: 'Player',
    x: toPx(first.cx),
    y: toPx(first.cy),
    uuid: `generated-player-${Date.now()}`,
    actor: {
      name: 'Player Character',
      system: {
        attributes: {
          hp: { value: 30, max: 30 },
          ac: { value: 15 },
          movement: { walk: 30 },
          init: { bonus: 2 }
        },
        abilities: {
          str: { value: 14 },
          dex: { value: 16 },
          con: { value: 13 },
          int: { value: 12 },
          wis: { value: 10 },
          cha: { value: 8 }
        }
      },
      items: [
        {
          _id: 'sword-1',
          name: 'Longsword',
          type: 'weapon',
          system: {
            activation: { type: 'action' },
            attack: { bonus: 5 },
            damage: { parts: [['1d8+2', 'slashing']] },
            range: { value: 5, units: 'ft' },
            description: { value: 'A reliable melee weapon' }
          }
        },
        {
          _id: 'bow-1',
          name: 'Shortbow',
          type: 'weapon',
          system: {
            activation: { type: 'action' },
            attack: { bonus: 5 },
            damage: { parts: [['1d6+3', 'piercing']] },
            range: { value: 80, units: 'ft' },
            description: { value: 'A ranged weapon' }
          }
        }
      ]
    }
  }];

  for (let i = 1; i < Math.min(rooms.length - 1, 5); i++) {
    const r = rooms[i];
    const ex = r.x + Math.floor(Math.random() * r.w);
    const ey = r.y + Math.floor(Math.random() * r.h);
    tokens.push({
      name: `Goblin ${i}`,
      x: toPx(ex),
      y: toPx(ey),
      uuid: `generated-goblin-${i}`,
      actor: {
        name: `Goblin ${i}`,
        system: {
          attributes: {
            hp: { value: 12, max: 12 },
            ac: { value: 13 },
            movement: { walk: 30 },
            init: { bonus: 2 }
          },
          abilities: {
            str: { value: 8 },
            dex: { value: 14 },
            con: { value: 10 },
            int: { value: 10 },
            wis: { value: 8 },
            cha: { value: 8 }
          }
        },
        items: [
          {
            _id: `scimitar-${i}`,
            name: 'Scimitar',
            type: 'weapon',
            system: {
              activation: { type: 'action' },
              range: { value: 5, units: 'ft' },
              description: { value: 'Goblin weapon' }
            }
          }
        ]
      }
    });
  }

  return { walls, tokens, playerBlock, exitBlock };
}


