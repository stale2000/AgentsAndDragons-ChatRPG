"use server";

import { AiActionSchema, getTogetherResponseFormat } from '@/utils/ai/actionSchema';
import { findReachableCells } from '@/utils/pathfinding';
import { buildOccupiedSet, classifyAllyTag, pickTargets, getCoarseBlock, isAdjacentCoarse } from '@/utils/ai/behavior';
import { getSystemPrompt, getAllowedActionsNotes } from '@/utils/ai/prompts';
import type { GridCell } from '@/utils/pathfinding';

export type RequestAiTurnParams = {
  model?: string;
  // Current actor taking the turn; index into tokens array or uuid string
  actor: { index?: number; id?: string };
  // Subset of scene state to make a decision
  tokens: Array<{
    name?: string;
    uuid?: string;
    x?: number;
    y?: number;
    actor?: any;
  }>;
  grid?: { gridSize: number; cellPixels: number } | null;
  // Grid data for pathfinding (walls, doors, etc.)
  gridData?: GridCell[][] | null;
  // Optional additional guidance/instructions
  hint?: string;
};

export type RequestAiTurnResult =
  | { success: true; action: ReturnType<typeof AiActionSchema.parse> }
  | { success: false; error: string; raw?: any };

export async function requestAiTurn(params: RequestAiTurnParams): Promise<RequestAiTurnResult> {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'Missing TOGETHER_API_KEY' };
  }

  const model = params.model || 'meta-llama/Llama-4-Scout-17B-16E-Instruct';
  const baseUrl = process.env.TOGETHER_BASE_URL || 'https://api.together.xyz/v1/chat/completions';

  const actorIndex = params.actor.index ?? -1;
  const actorId = params.actor.id;

  const step = 10; // fine cells per coarse cell
  const cellPx = params.grid?.cellPixels ?? 10;
  const gridSize = params.grid?.gridSize ?? 500;
  
  // Get actor token for position and movement speed
  const actorToken = params.tokens[actorIndex];
  const fineX = Math.floor((actorToken?.x ?? 0) / cellPx);
  const fineY = Math.floor((actorToken?.y ?? 0) / cellPx);
  const startCoarseX = Math.floor(fineX / step);
  const startCoarseY = Math.floor(fineY / step);
  
  // Calculate movement speed in squares (30 ft = 6 squares, etc.)
  const movementSpeed = actorToken?.actor?.system?.attributes?.movement?.walk ?? 30;
  const maxSquares = Math.max(1, Math.floor(movementSpeed / 5));
  
  // Identify enemies and allies
  const myTag = classifyAllyTag(actorToken?.name || actorToken?.actor?.name || '');
  const { targets: enemies } = pickTargets(params.tokens, actorIndex, myTag);
  
  // Extract wall locations from gridData (coarse grid cells with walls)
  const wallLocations: { x: number; y: number }[] = [];
  if (params.gridData && params.grid) {
    const coarseMax = gridSize / step;
    for (let cy = 0; cy < coarseMax; cy++) {
      for (let cx = 0; cx < coarseMax; cx++) {
        // Check center of coarse cell for walls
        const centerFineX = cx * step + Math.floor(step / 2);
        const centerFineY = cy * step + Math.floor(step / 2);
        if (centerFineY >= 0 && centerFineY < gridSize && centerFineX >= 0 && centerFineX < gridSize) {
          const cell = params.gridData[centerFineY]?.[centerFineX];
          if (cell && (cell.walls || 0) > 0 && (cell.doors || 0) === 0) {
            wallLocations.push({ x: cx, y: cy });
          }
        }
      }
    }
  }
  
  // Compute valid move destinations using pathfinding
  let validMoves: { x: number; y: number }[] = [];
  if (params.gridData && params.grid) {
    try {
      const occupied = buildOccupiedSet(params.tokens, actorIndex, cellPx, step);
      validMoves = findReachableCells(
        params.gridData,
        gridSize,
        startCoarseX,
        startCoarseY,
        maxSquares,
        occupied,
        step,
      );
    } catch (e) {
      console.warn('Failed to compute valid moves:', e);
    }
  }
  
  // Fallback: if no gridData, compute basic bounds-based valid moves
  if (validMoves.length === 0 && params.grid) {
    const coarseMax = gridSize / step;
    const bounds: { x: number; y: number }[] = [];
    // Add adjacent cells within movement range as fallback
    for (let dx = -maxSquares; dx <= maxSquares; dx++) {
      for (let dy = -maxSquares; dy <= maxSquares; dy++) {
        const nx = startCoarseX + dx;
        const ny = startCoarseY + dy;
        const distance = Math.max(Math.abs(dx), Math.abs(dy)); // Chebyshev distance
        if (nx >= 0 && ny >= 0 && nx < coarseMax && ny < coarseMax && distance <= maxSquares && distance > 0) {
          bounds.push({ x: nx, y: ny });
        }
      }
    }
    validMoves = bounds;
  }
  
  // Calculate distances for each valid move and find farthest moves
  const movesWithDistance = validMoves.map(move => {
    const dx = Math.abs(move.x - startCoarseX);
    const dy = Math.abs(move.y - startCoarseY);
    const distance = Math.max(dx, dy); // Chebyshev distance
    return { ...move, distance };
  });
  const maxDistance = Math.max(...movesWithDistance.map(m => m.distance), 0);
  const farthestMoves = maxDistance > 0 
    ? movesWithDistance.filter(m => m.distance === maxDistance).map(m => ({ x: m.x, y: m.y }))
    : [];
  
  // Extract enemy positions
  const enemyPositions = enemies.map((enemy, i) => {
    const enemyIdx = params.tokens.findIndex(t => t.uuid === enemy.uuid);
    if (enemyIdx === -1) return null;
    const fineX = Math.floor((enemy?.x ?? 0) / cellPx);
    const fineY = Math.floor((enemy?.y ?? 0) / cellPx);
    const coarseX = Math.floor(fineX / step);
    const coarseY = Math.floor(fineY / step);
    return {
      index: enemyIdx,
      name: enemy?.name || enemy?.actor?.name,
      x: coarseX,
      y: coarseY,
      hp: enemy?.actor?.system?.attributes?.hp?.value ?? undefined,
      ac: enemy?.actor?.system?.attributes?.ac?.value ?? enemy?.actor?.system?.attributes?.ac?.flat ?? undefined,
    };
  }).filter((e): e is NonNullable<typeof e> => e !== null);
  
  // Calculate adjacent targets
  const actorBlock = getCoarseBlock(actorToken, cellPx, step);
  const adjacentTargets = enemyPositions.filter(enemy => {
    const enemyToken = params.tokens[enemy.index];
    if (!enemyToken) return false;
    const enemyBlock = getCoarseBlock(enemyToken, cellPx, step);
    return isAdjacentCoarse(actorBlock, enemyBlock, step);
  });
  
  const brief = {
    actor: { index: actorIndex, id: actorId },
    tokens: (params.tokens || []).map((t, i) => {
      const fineX = Math.floor((t?.x ?? 0) / cellPx);
      const fineY = Math.floor((t?.y ?? 0) / cellPx);
      const coarseX = Math.floor(fineX / step);
      const coarseY = Math.floor(fineY / step);
      return {
        index: i,
        name: t?.name,
        uuid: t?.uuid,
        x: coarseX, // grid cell X
        y: coarseY, // grid cell Y
        hp: t?.actor?.system?.attributes?.hp?.value ?? undefined,
        ac: t?.actor?.system?.attributes?.ac?.value ?? t?.actor?.system?.attributes?.ac?.flat ?? undefined,
        tag: (t?.name || t?.actor?.name || '').toLowerCase().includes('goblin') ? 'goblin' : 'other',
      };
    }),
    enemies: enemyPositions.length > 0 ? enemyPositions : undefined, // Enemy positions for tactical awareness
    walls: wallLocations.length > 0 ? wallLocations : undefined, // Wall locations
    grid: params.grid || null,
    validMoves: validMoves.length > 0 ? validMoves : undefined, // Only include if we have valid moves
    farthestMoves: farthestMoves.length > 0 ? farthestMoves : undefined, // Farthest reachable moves (max distance)
    movementSpeed: maxSquares, // Movement speed in squares
    allowedActions: getAllowedActionsNotes({
      maxSquares,
      validMoves,
      farthestMoves,
      adjacentTargets: adjacentTargets.length > 0 ? adjacentTargets : undefined,
    }),
    hint: params.hint || undefined,
  };

  const messages = [
    {
      role: 'system',
      content: getSystemPrompt({
        maxSquares,
        validMoves,
        farthestMoves,
        adjacentTargets: adjacentTargets.length > 0 ? adjacentTargets : undefined,
      }),
    },
    {
      role: 'user',
      content: `State (you are tokens[${actorIndex}]):\n${JSON.stringify(brief, null, 2)}`,
    },
  ];

  const body = {
    model,
    messages,
    response_format: getTogetherResponseFormat(),
  } as any;

  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const rawText = await res.text();
    if (!res.ok) {
      return { success: false, error: `Together API error: ${res.status} ${res.statusText}`, raw: rawText };
    }
    const json = JSON.parse(rawText);
    const content = json?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      return { success: false, error: 'No content from Together API', raw: json };
    }
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      return { success: false, error: 'Model did not return valid JSON', raw: content };
    }
    const validation = AiActionSchema.safeParse(parsed);
    if (!validation.success) {
      return { success: false, error: 'Response failed schema validation', raw: validation.error.flatten() };
    }
    return { success: true, action: validation.data } as any;
  } catch (e: any) {
    return { success: false, error: e?.message || 'Failed to contact Together API' };
  }
}


