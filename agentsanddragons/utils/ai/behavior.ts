import { calculateAbilityModifier } from '@/utils/dnd5e';
import { WEAPONS } from '@/data/dnd5e/items';
import type { TokenEntity } from '@/app/actions/scenes';

const WEAPONS_MAP = new Map<string, (typeof WEAPONS)[number]>();
for (const w of WEAPONS) WEAPONS_MAP.set(w.name, w);

type Block = { x: number; y: number };

export function getCoarseBlock(token: TokenEntity, cellPixels: number, step: number): Block {
  const cellX = Math.floor((token?.x ?? 0) / cellPixels);
  const cellY = Math.floor((token?.y ?? 0) / cellPixels);
  const blockX = Math.floor(cellX / step) * step;
  const blockY = Math.floor(cellY / step) * step;
  return { x: blockX, y: blockY };
}

export function classifyAllyTag(name: string): 'goblin' | 'other' {
  return (name || '').toLowerCase().includes('goblin') ? 'goblin' : 'other';
}

export function pickTargets(tokens: TokenEntity[], myIndex: number, myTag: string) {
  const livingOthers = tokens.filter((t, i) => {
    if (i === myIndex) return false;
    const actor = t.actor as any;
    const system = actor?.system as any;
    const hp = system?.attributes?.hp?.value ?? 1;
    return hp > 0;
  });
  const enemies = livingOthers.filter(o => {
    const name = o.name || o.actor?.name || '';
    return classifyAllyTag(name) !== myTag;
  });
  const targets = enemies.length ? enemies : livingOthers;
  return { livingOthers, targets };
}

export function isAdjacentCoarse(a: Block, b: Block, step: number): boolean {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= step;
}

/**
 * Find a token at the specified coarse coordinates
 * @param tokens Array of tokens to search
 * @param targetX Coarse X coordinate (in coarse cells)
 * @param targetY Coarse Y coordinate (in coarse cells)
 * @param cellPixels Pixels per fine cell
 * @param step Fine cells per coarse cell
 * @returns The token at the coordinates, or null if not found
 */
export function findTokenAtCoarse(
  tokens: TokenEntity[],
  targetX: number,
  targetY: number,
  cellPixels: number,
  step: number
): { token: TokenEntity; index: number } | null {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const fineX = Math.floor((token?.x ?? 0) / cellPixels);
    const fineY = Math.floor((token?.y ?? 0) / cellPixels);
    const coarseX = Math.floor(fineX / step);
    const coarseY = Math.floor(fineY / step);
    
    if (coarseX === targetX && coarseY === targetY) {
      return { token, index: i };
    }
  }
  return null;
}

export function buildOccupiedSet(tokens: TokenEntity[], myIndex: number, cellPixels: number, step: number): Set<string> {
  const occupied = new Set<string>();
  tokens.forEach((tk, i) => {
    if (i === myIndex) return;
    const b = getCoarseBlock(tk, cellPixels, step);
    occupied.add(`${b.x / step},${b.y / step}`);
  });
  return occupied;
}

export function buildAdjacencyGoalsFor(targetBlock: Block, occupied: Set<string>, gridSize: number, step: number): Set<string> {
  const goals = new Set<string>();
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const gx = targetBlock.x / step + dx;
      const gy = targetBlock.y / step + dy;
      if (gx < 0 || gy < 0 || gx >= gridSize / step || gy >= gridSize / step) continue;
      const key = `${gx},${gy}`;
      if (!occupied.has(key)) goals.add(key);
    }
  }
  return goals;
}

export function selectNearestTarget(myBlock: Block, targets: TokenEntity[], cellPixels: number, step: number): { target: TokenEntity; targetBlock: Block } {
  let best = targets[0];
  let bestDist = Infinity;
  let bestBlock: Block = getCoarseBlock(best, cellPixels, step);
  for (const t of targets) {
    const b = getCoarseBlock(t, cellPixels, step);
    const d = Math.hypot(b.x - myBlock.x, b.y - myBlock.y);
    if (d < bestDist) { bestDist = d; best = t; bestBlock = b; }
  }
  return { target: best, targetBlock: bestBlock };
}

export type AttackOutcome = {
  d20: number;
  total: number;
  targetAC: number;
  damage: number;
  hit: boolean;
  crit: boolean;
};

export function resolveMeleeAttack(me: TokenEntity, target: TokenEntity): AttackOutcome {
  const actor = me.actor as any;
  const system = actor?.system as any;
  const items = Array.isArray(actor?.items) ? actor.items : [];
  const melee = items.find((i: any) => (i?.type === 'weapon') && (!i?.system?.range?.value || (i?.system?.range?.value ?? 5) <= 5));
  const targetActor = target.actor as any;
  const targetSystem = targetActor?.system as any;
  const targetAttrs = targetSystem?.attributes || {};
  const targetAC = targetAttrs?.ac?.value ?? targetAttrs?.ac?.flat ?? 10;
  const strMod = calculateAbilityModifier(system?.abilities?.str?.value ?? 10);
  const dexMod = calculateAbilityModifier(system?.abilities?.dex?.value ?? 10);
  const pb = 2; // low-CR baseline; replace with actor PB if available later
  // Prefer explicit item attack bonus if provided (e.g., goblin scimitar +4)
  const itemAttackBonus = Number(melee?.system?.attack?.bonus);
  const base = WEAPONS_MAP.get((melee?.name || '').toString());
  const usesDex = base?.properties?.includes('finesse') ?? false;
  const atkMod = usesDex ? dexMod : strMod;
  const fallbackToHit = pb + Math.max(atkMod, usesDex ? dexMod : strMod);
  const toHit = Number.isFinite(itemAttackBonus) ? (itemAttackBonus as number) : fallbackToHit;
  const d20 = Math.floor(Math.random() * 20) + 1;
  const total = d20 + toHit;
  const crit = d20 === 20;
  const hit = crit || total >= targetAC;
  let damage = 0;
  if (hit) {
    let formula = melee?.system?.damage?.parts?.[0]?.[0] as string | undefined;
    if (!formula && base?.damage) {
      const mod = usesDex ? dexMod : strMod;
      const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
      formula = `${base.damage}${modStr}`;
    }
    if (!formula) {
      const mod = Math.max(strMod, dexMod);
      const d6 = Math.floor(Math.random() * 6) + 1;
      damage = Math.max(1, d6 + mod);
    } else {
      damage = Math.max(1, rollFormulaSimple(formula));
    }
  }
  return { d20, total, targetAC, damage, hit, crit };
}

function rollFormulaSimple(formula: string): number {
  const m = formula.match(/(\d+)?d(\d+)([+-]\d+)?/i);
  if (!m) return 0;
  const num = parseInt(m[1] || '1', 10);
  const faces = parseInt(m[2] || '6', 10);
  const mod = m[3] ? parseInt(m[3], 10) : 0;
  let total = 0;
  for (let i = 0; i < num; i++) total += (Math.floor(Math.random() * faces) + 1);
  return total + mod;
}


