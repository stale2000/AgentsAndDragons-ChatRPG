import { findPathCoarse } from '@/utils/pathfinding';
import {
  getCoarseBlock,
  classifyAllyTag,
  pickTargets,
  isAdjacentCoarse,
  buildOccupiedSet,
  buildAdjacencyGoalsFor,
  resolveMeleeAttack,
  selectNearestTarget,
} from '@/utils/ai/behavior';

type GridCell = { walls: number; doors: number; [key: string]: any };

export type ExecuteTurnInput = {
  entityId: string;
  tokens: any[];
  gridData: GridCell[][] | null;
  gridSize: number;
  cellPixels: number;
  step?: number; // coarse cell size in fine cells (default 10)
};

export type ExecuteTurnResult = {
  tokens: any[];
  log: string[];
  summary?: {
    actorName: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
    movedSquares: number;
    action: 'attack' | 'dash' | 'move' | 'wait';
    attack?: {
      targetName: string;
      d20: number;
      total: number;
      ac: number;
      dmg: number;
      hit: boolean;
      crit: boolean;
    };
  };
};

// use shared helpers from utils/pathfinding

export function executeTurn(input: ExecuteTurnInput): ExecuteTurnResult {
  const { entityId, gridData, gridSize, cellPixels } = input;
  const step = input.step ?? 10;
  const tokens = [...(input.tokens || [])];
  const log: string[] = [];
  let summary: ExecuteTurnResult['summary'] | undefined;

  const meIdx = tokens.findIndex(t => (t.uuid || t.id) === entityId);
  if (meIdx === -1) return { tokens, log };
  const me = tokens[meIdx] as any;
  const squaresPerMove = Math.max(1, Math.floor(((me?.actor?.system?.attributes?.movement?.walk ?? 30) as number) / 5));

  const myTag = classifyAllyTag(me?.name || me?.actor?.name || '');
  const { livingOthers, targets } = pickTargets(tokens, meIdx, myTag);
  if (livingOthers.length === 0) { log.push(`${me.name || 'Creature'} waits.`); return { tokens, log }; }

  const myB = getCoarseBlock(me, cellPixels, step);
  const startB = { ...myB };
  const { target: best, targetBlock: tgtB } = selectNearestTarget(myB, targets, cellPixels, step);

  // Move toward target if not adjacent
  let movedSquares = 0;
  if (!isAdjacentCoarse(myB, tgtB, step)) {
    const occupied = buildOccupiedSet(tokens, meIdx, cellPixels, step);
    const goals = buildAdjacencyGoalsFor(tgtB, occupied, gridSize, step);
    const path = findPathCoarse(gridData, gridSize, myB.x / step, myB.y / step, goals, occupied);
    if (path && path.length > 1) {
      let current = { ...myB };
      for (let i = 1; i < path.length && movedSquares < squaresPerMove; i++) {
        const next = path[i];
        if (occupied.has(`${next.x},${next.y}`)) break;
        current = { x: next.x * step, y: next.y * step };
        movedSquares++;
      }
      me.x = current.x * cellPixels;
      me.y = current.y * cellPixels;
      log.push(`${me.name || 'Creature'} moves ${movedSquares} square(s).`);
    } else {
      log.push(`${me.name || 'Creature'} dashes (no clear path).`);
    }
  }

  // Attack if adjacent
  const myBAfter = getCoarseBlock(me, cellPixels, step);
  let action: 'attack' | 'dash' | 'move' | 'wait' = movedSquares > 0 ? 'move' : 'wait';
  if (isAdjacentCoarse(myBAfter, tgtB, step)) {
    const outcome = resolveMeleeAttack(me, best);
    const targetToken: any = best;
    if (outcome.hit && outcome.damage > 0) {
      const hpObj = targetToken?.actor?.system?.attributes?.hp;
      if (hpObj) {
        const cur = Number(hpObj.value ?? 0);
        const max = Number(hpObj.max ?? cur);
        hpObj.value = Math.max(0, cur - outcome.damage);
        hpObj.max = max;
      }
    }
    const targetName = (targetToken as any)?.name || (targetToken as any)?.actor?.name || 'target';
    if (outcome.hit) {
      log.push(`${me.name || 'Creature'} attacks ${targetName}: ${outcome.crit ? 'CRIT! ' : ''}hit (d20 ${outcome.d20} = ${outcome.total}) for ${outcome.damage}.`);
    } else {
      log.push(`${me.name || 'Creature'} attacks ${targetName}: misses (d20 ${outcome.d20} = ${outcome.total} vs AC ${outcome.targetAC}).`);
    }
    action = 'attack';
    summary = {
      actorName: me.name || me?.actor?.name || 'Creature',
      from: startB,
      to: myBAfter,
      movedSquares,
      action,
      attack: {
        targetName,
        d20: outcome.d20,
        total: outcome.total,
        ac: outcome.targetAC,
        dmg: outcome.damage,
        hit: outcome.hit,
        crit: outcome.crit,
      },
    };
  } else if (movedSquares < squaresPerMove) {
    // Dash
    const occupied2 = buildOccupiedSet(tokens, meIdx, cellPixels, step);
    const goals2 = buildAdjacencyGoalsFor(tgtB, occupied2, gridSize, step);
    const path2 = findPathCoarse(gridData, gridSize, myBAfter.x / step, myBAfter.y / step, goals2, occupied2);
    if (path2 && path2.length > 1) {
      let current = { ...myBAfter };
      let dashMoved = 0;
      const limit = Math.max(1, Math.floor(((me?.actor?.system?.attributes?.movement?.walk ?? 30) as number) / 5));
      for (let i = 1; i < path2.length && dashMoved < limit; i++) {
        const next = path2[i];
        if (occupied2.has(`${next.x},${next.y}`)) break;
        current = { x: next.x * step, y: next.y * step };
        dashMoved++;
      }
      me.x = current.x * cellPixels;
      me.y = current.y * cellPixels;
      log.push(`${me.name || 'Creature'} dashes ${dashMoved} extra square(s).`);
      action = 'dash';
      const afterDash = getCoarseBlock(me, cellPixels, step);
      summary = {
        actorName: me.name || me?.actor?.name || 'Creature',
        from: startB,
        to: afterDash,
        movedSquares: movedSquares + dashMoved,
        action,
      };
    }
  }

  if (!summary) {
    // default summary if none set yet
    summary = {
      actorName: me.name || me?.actor?.name || 'Creature',
      from: startB,
      to: getCoarseBlock(me, cellPixels, step),
      movedSquares,
      action,
    };
  }

  return { tokens, log, summary };
}


