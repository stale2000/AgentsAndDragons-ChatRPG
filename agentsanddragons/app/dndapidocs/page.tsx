'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getRolls, type FoundryRollsResponse } from '@/app/actions/rolls';
import { requestAiTurn } from '@/app/actions/ai_turn';
import { makeRoll } from '@/app/actions/rolls_action';
import { getEncounters, type GetEncountersResponse } from '@/app/actions/encounters';
import { getSceneIds, getSceneEntities, getSceneWalls, type SceneListItem, type GetSceneEntitiesResponse, type TokenEntity, type WallEntity } from '@/app/actions/scenes';
import type { FoundryActor } from '@/types/foundry-vtt';
import { moveEntities, type MoveEntitiesResponse } from '@/app/actions/entities';
import { getValidMoves, checkPath, type GetValidMovesResponse } from '@/app/actions/pathfinding';
import { generateLocalDungeon } from '@/utils/mapGenerator';
import { generateHalftheoppositeDungeon, generateHalftheoppositeDungeonWithTiles } from '@/utils/mapGeneratorDungeon';
import { generateGraphDungeon, generateGraphDungeonWithTiles } from '@/utils/mapGeneratorGraph';
import { executeTurn } from '@/utils/turnEngine';
import CombatModule from '@/components/CombatModule';
import CharacterSheet from '@/components/CharacterSheet';
import { createBlankCharacter, buildCharacter, type DnD5eCharacter, calculateAbilityModifier } from '@/utils/dnd5e';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { findPathCoarseToTarget, findPathCoarse as findPathCoarseShared, pathBlockedLocalFine } from '@/utils/pathfinding';
import type { GridCell } from '@/utils/pathfinding';
import { GRID_SIZE, CELL_PIXELS, COARSE_STEP, CELL_CSS_PX } from '@/utils/constants';
import { findTokenAtCoarse, getCoarseBlock, isAdjacentCoarse } from '@/utils/ai/behavior';
import { applyDamage } from '@/app/actions/apply_damage';

export default function DndApiDocsPage() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<any>(null);
  const [clientId, setClientId] = React.useState<string | null>(null);
  const [worldId, setWorldId] = React.useState<string | null>(null);
  const [rollsLoading, setRollsLoading] = React.useState(false);
  const [rollsError, setRollsError] = React.useState<string | null>(null);
  const [rollsResult, setRollsResult] = React.useState<FoundryRollsResponse | null>(null);
  const [encountersLoading, setEncountersLoading] = React.useState(false);
  const [encountersError, setEncountersError] = React.useState<string | null>(null);
  const [encountersResult, setEncountersResult] = React.useState<GetEncountersResponse | null>(null);
  const [scenesLoading, setScenesLoading] = React.useState(false);
  const [scenesError, setScenesError] = React.useState<string | null>(null);
  const [scenesResult, setScenesResult] = React.useState<SceneListItem[] | null>(null);
  const [sceneEntitiesLoading, setSceneEntitiesLoading] = React.useState(false);
  const [sceneEntitiesError, setSceneEntitiesError] = React.useState<string | null>(null);
  const [sceneEntitiesResult, setSceneEntitiesResult] = React.useState<GetSceneEntitiesResponse | null>(null);
  const [wallsLoading, setWallsLoading] = React.useState(false);
  const [wallsError, setWallsError] = React.useState<string | null>(null);
  const [wallsResult, setWallsResult] = React.useState<any | null>(null);
  const [exitPlaceMode, setExitPlaceMode] = React.useState(false);
  const [exitBlock, setExitBlock] = React.useState<{ x: number; y: number } | null>(null);
  const [agentPlaceMode, setAgentPlaceMode] = React.useState(false);
  const [agentBlock, setAgentBlock] = React.useState<{ x: number; y: number } | null>(null);
  const [agentTokenUuid, setAgentTokenUuid] = React.useState<string | null>(null);
  const [plannedPath, setPlannedPath] = React.useState<{ x: number; y: number }[] | null>(null);
  const [validMoves, setValidMoves] = React.useState<Array<{ x: number; y: number }> | null>(null);
  const [useHtoDungeon, setUseHtoDungeon] = React.useState(false);
  const [generatorMode, setGeneratorMode] = React.useState<'local' | 'hto' | 'graph'>('local');
  const [graphText, setGraphText] = React.useState<string>('');
  const [debugTiles, setDebugTiles] = React.useState<number[][] | null>(null);
  const [validMovesLoading, setValidMovesLoading] = React.useState(false);
  const [importedMapData, setImportedMapData] = React.useState<{
    image: HTMLImageElement;
    grid: {
      horizontalLines: number[];
      verticalLines: number[];
      cellSize: number;
      offsetX: number;
      offsetY: number;
    };
    imageWidth: number;
    imageHeight: number;
  } | null>(null);
  // Constants imported from utils/constants.ts
  // Using shared constants for better maintainability
  const gridData = React.useMemo((): GridCell[][] | null => {
    if (!sceneEntitiesResult && !wallsResult) return null;
    const makeRow = (): GridCell[] => Array.from({ length: GRID_SIZE }, () => ({ tokens: 0, tiles: 0, drawings: 0, sounds: 0, notes: 0, walls: 0, doors: 0 }));
    const grid: GridCell[][] = Array.from({ length: GRID_SIZE }, makeRow);
    const place = (x?: number, y?: number, kind?: keyof typeof grid[0][0]) => {
      if (x === undefined || y === undefined) return;
      const cx = Math.floor(x / CELL_PIXELS);
      const cy = Math.floor(y / CELL_PIXELS);
      if (cy >= 0 && cy < GRID_SIZE && cx >= 0 && cx < GRID_SIZE && kind) {
        // @ts-ignore
        grid[cy][cx][kind] += 1;
      }
    };
    sceneEntitiesResult?.tokens?.forEach(t => place(t.x, t.y, 'tokens'));
    sceneEntitiesResult?.tiles?.forEach(t => place(t.x, t.y, 'tiles'));
    sceneEntitiesResult?.drawings?.forEach(d => place(d.x, d.y, 'drawings'));
    sceneEntitiesResult?.sounds?.forEach(s => place(s.x, s.y, 'sounds'));
    sceneEntitiesResult?.notes?.forEach(n => place(n.x, n.y, 'notes'));
    // Add walls: mark both endpoints and midpoint
    const walls = wallsResult?.walls || [];
    const markCell = (cx: number, cy: number, isDoor: boolean) => {
      if (cy >= 0 && cy < GRID_SIZE && cx >= 0 && cx < GRID_SIZE) {
        // @ts-ignore
        grid[cy][cx].walls += 1;
        if (isDoor) {
          // @ts-ignore
          grid[cy][cx].doors += 1;
        }
      }
    };
    // NOTE: Walls are rasterized across the fine grid. Since 10 cells = 100 px,
    // this means one 5x5 game square spans 10×10 cells in this canvas grid.
    const bresenham = (x0: number, y0: number, x1: number, y1: number, isDoor: boolean) => {
      let cx0 = Math.floor(x0 / CELL_PIXELS);
      let cy0 = Math.floor(y0 / CELL_PIXELS);
      const cx1 = Math.floor(x1 / CELL_PIXELS);
      const cy1 = Math.floor(y1 / CELL_PIXELS);
      let dx = Math.abs(cx1 - cx0);
      let sx = cx0 < cx1 ? 1 : -1;
      let dy = -Math.abs(cy1 - cy0);
      let sy = cy0 < cy1 ? 1 : -1;
      let err = dx + dy;
      // Loop
      // cap iterations to avoid infinite loops
      let guard = GRID_SIZE * GRID_SIZE * 2;
      while (guard-- > 0) {
        markCell(cx0, cy0, isDoor);
        if (cx0 === cx1 && cy0 === cy1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; cx0 += sx; }
        if (e2 <= dx) { err += dx; cy0 += sy; }
      }
    };
    walls?.forEach((w: WallEntity) => {
      const [x1, y1, x2, y2] = w.c || [];
      if (
        typeof x1 === 'number' && typeof y1 === 'number' &&
        typeof x2 === 'number' && typeof y2 === 'number'
      ) {
        bresenham(x1, y1, x2, y2, w?.door === 1);
      }
    });
    return grid;
  }, [sceneEntitiesResult, wallsResult]);

  // Invalidate planned path if endpoints or map change
  React.useEffect(() => {
    setPlannedPath(null);
  }, [exitBlock, agentBlock, gridData]);

  // Auto-set the first token as the agent when scene entities load
  React.useEffect(() => {
    if (sceneEntitiesResult?.tokens && sceneEntitiesResult.tokens.length > 0) {
      const firstToken = sceneEntitiesResult.tokens[0];
      if (firstToken.x !== undefined && firstToken.y !== undefined) {
        const step = 10;
        const cellX = Math.floor(firstToken.x / CELL_PIXELS);
        const cellY = Math.floor(firstToken.y / CELL_PIXELS);
        const blockX = Math.floor(cellX / step) * step;
        const blockY = Math.floor(cellY / step) * step;
        setAgentBlock({ x: blockX, y: blockY });
        // Store the UUID for sending movements to Foundry
        setAgentTokenUuid(firstToken.uuid || null);
      }
    }
  }, [sceneEntitiesResult]);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // (coarse grid removed)

  React.useEffect(() => {
    console.log('Canvas useEffect triggered, importedMapData:', importedMapData, 'gridData:', gridData);
    const canvas = canvasRef.current;
    if (!canvas) {
      console.log('Canvas ref not available');
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.log('Canvas context not available');
      return;
    }

    // If imported map exists, render it with grid overlay
    if (importedMapData) {
      console.log('Rendering imported map:', importedMapData);
      const { image, grid, imageWidth, imageHeight } = importedMapData;
      console.log('Canvas dimensions:', imageWidth, imageHeight);
      canvas.width = imageWidth;
      canvas.height = imageHeight;
      ctx.clearRect(0, 0, imageWidth, imageHeight);
      
      // Draw a test rectangle first to verify canvas is working
      ctx.fillStyle = 'blue';
      ctx.fillRect(0, 0, 100, 100);
      
      // Draw the image as background
      console.log('Drawing image...', 'Image complete:', image.complete, 'Image naturalWidth:', image.naturalWidth, 'Image naturalHeight:', image.naturalHeight);
      if (!image.complete) {
        console.error('Image not complete!');
      }
      ctx.drawImage(image, 0, 0, imageWidth, imageHeight);
      console.log('Image drawn, canvas dimensions:', canvas.width, canvas.height);
      
      // Draw grid lines overlay
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'; // Red grid lines with transparency
      ctx.lineWidth = 1;
      
      // Draw horizontal lines
      ctx.beginPath();
      grid.horizontalLines.forEach(y => {
        ctx.moveTo(0, y);
        ctx.lineTo(imageWidth, y);
      });
      ctx.stroke();
      
      // Draw vertical lines
      ctx.beginPath();
      grid.verticalLines.forEach(x => {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, imageHeight);
      });
      ctx.stroke();
      
      console.log('Imported map rendered successfully');
      return;
    }

    // Otherwise, use existing grid-based rendering
    if (!gridData) return;
    const w = GRID_SIZE;
    const h = GRID_SIZE;
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    for (let r = 0; r < h; r++) {
      const row = gridData[r];
      if (!row) continue;
      for (let c = 0; c < w; c++) {
        const cell = row[c];
        if (!cell) continue;
        const actors = (cell.tokens || 0) + (cell.tiles || 0) + (cell.drawings || 0) + (cell.sounds || 0) + (cell.notes || 0);
        const walls = (cell.walls || 0);
        if (!actors && !walls) continue;
        const red = Math.max(0, Math.min(255, walls * 40));
        const green = Math.max(0, Math.min(255, actors * 40));
        ctx.fillStyle = `rgb(${red},${green},0)`;
        ctx.fillRect(c, r, 1, 1);
      }
    }
    // Overlay door walls in blue for better visibility
    const doorWalls = (wallsResult?.walls || []).filter((w: WallEntity) => w?.door === 1);
    const drawWall = (x0: number, y0: number, x1: number, y1: number) => {
      let cx0 = Math.floor(x0 / CELL_PIXELS);
      let cy0 = Math.floor(y0 / CELL_PIXELS);
      const cx1 = Math.floor(x1 / CELL_PIXELS);
      const cy1 = Math.floor(y1 / CELL_PIXELS);
      let dx = Math.abs(cx1 - cx0);
      let sx = cx0 < cx1 ? 1 : -1;
      let dy = -Math.abs(cy1 - cy0);
      let sy = cy0 < cy1 ? 1 : -1;
      let err = dx + dy;
      let guard = GRID_SIZE * GRID_SIZE * 2;
      ctx.fillStyle = 'rgb(0,0,255)';
      while (guard-- > 0) {
        if (cy0 >= 0 && cy0 < h && cx0 >= 0 && cx0 < w) {
          ctx.fillRect(cx0, cy0, 1, 1);
        }
        if (cx0 === cx1 && cy0 === cy1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; cx0 += sx; }
        if (e2 <= dx) { err += dx; cy0 += sy; }
      }
    };
    doorWalls.forEach((w: WallEntity) => {
      const c = Array.isArray(w?.c) ? w.c : [];
      const [x1, y1, x2, y2] = c as number[];
      if (
        typeof x1 === 'number' && typeof y1 === 'number' &&
        typeof x2 === 'number' && typeof y2 === 'number'
      ) {
        drawWall(x1, y1, x2, y2);
      }
    });

    // Overlay light grey coarse grid: one line per 10 fine cells (10 px on canvas)
    const step = 10; // fine cells per coarse cell
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.5;
    // Vertical lines
    ctx.beginPath();
    for (let x = 0; x <= w; x += step) {
      const xx = x + 0.5; // crisp lines
      ctx.moveTo(xx, 0);
      ctx.lineTo(xx, h);
    }
    // Horizontal lines
    for (let y = 0; y <= h; y += step) {
      const yy = y + 0.5;
      ctx.moveTo(0, yy);
      ctx.lineTo(w, yy);
    }
    ctx.stroke();

    // Overlay scene entities as colored dots at their cell positions
    const plot = (x?: number, y?: number, color?: string) => {
      if (x === undefined || y === undefined) return;
      const cellX = Math.floor(x / CELL_PIXELS);
      const cellY = Math.floor(y / CELL_PIXELS);
      if (cellY < 0 || cellY >= GRID_SIZE || cellX < 0 || cellX >= GRID_SIZE) return;
      // Snap to coarse 10x10 block and fill an entire square-sized block
      const step = 10;
      const blockX = Math.floor(cellX / step) * step;
      const blockY = Math.floor(cellY / step) * step;
      ctx.fillStyle = color || '#00b3ff';
      ctx.fillRect(blockX, blockY, step, step);
    };
    if (sceneEntitiesResult) {
      sceneEntitiesResult.tokens?.forEach(t => plot(t.x, t.y, '#00b3ff')); // tokens: blue
      sceneEntitiesResult.tiles?.forEach(t => plot(t.x, t.y, '#64748b'));  // tiles: slate
      sceneEntitiesResult.drawings?.forEach(d => plot(d.x, d.y, '#6b7280')); // drawings: gray
      sceneEntitiesResult.sounds?.forEach(s => plot(s.x, s.y, '#f59e0b'));   // sounds: amber
      sceneEntitiesResult.notes?.forEach(n => plot(n.x, n.y, '#a855f7'));    // notes: violet
    }

    // Draw valid moves if present (green semi-transparent squares)
    if (validMoves && validMoves.length > 0) {
      validMoves.forEach(move => {
        const step = 10;
        const cellX = Math.floor(move.x / CELL_PIXELS);
        const cellY = Math.floor(move.y / CELL_PIXELS);
        const blockX = Math.floor(cellX / step) * step;
        const blockY = Math.floor(cellY / step) * step;
        ctx.fillStyle = 'rgba(34, 197, 94, 0.5)'; // green-500 with transparency
        ctx.fillRect(blockX, blockY, step, step);
        ctx.strokeStyle = '#16a34a'; // green-600
        ctx.lineWidth = 0.5;
        ctx.strokeRect(blockX + 0.25, blockY + 0.25, 9.5, 9.5);
      });
    }

    // Draw Exit block if present
    if (exitBlock) {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(exitBlock.x, exitBlock.y, 10, 10);
      ctx.strokeStyle = '#b91c1c';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(exitBlock.x + 0.25, exitBlock.y + 0.25, 9.5, 9.5);
    }

    // Draw Agent block if present (blue square)
    if (agentBlock) {
      ctx.fillStyle = '#2563eb'; // blue-600
      ctx.fillRect(agentBlock.x, agentBlock.y, 10, 10);
      ctx.strokeStyle = '#1e40af';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(agentBlock.x + 0.25, agentBlock.y + 0.25, 9.5, 9.5);
    }
  }, [gridData, wallsResult, sceneEntitiesResult, exitBlock, agentBlock, validMoves, importedMapData]);

  // (coarse grid removed)
  const [moveLoading, setMoveLoading] = React.useState(false);
  const [moveError, setMoveError] = React.useState<string | null>(null);
  const [moveResult, setMoveResult] = React.useState<MoveEntitiesResponse | null>(null);
  const [moveX, setMoveX] = React.useState<string>('');
  const [moveY, setMoveY] = React.useState<string>('');
  const [moveSelected, setMoveSelected] = React.useState<boolean>(false);
  const [moveUuids, setMoveUuids] = React.useState<string>('');
  const [aiInput, setAiInput] = React.useState<string>('');
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiError, setAiError] = React.useState<string | null>(null);
  const [aiMessages, setAiMessages] = React.useState<{ role: 'user' | 'assistant' | 'system'; content: string }[]>([]);
  const [aiResponse, setAiResponse] = React.useState<string>('');
  const [generatedMap, setGeneratedMap] = React.useState<boolean>(false);
  const [sheetChar, setSheetChar] = React.useState(createBlankCharacter());
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [currentTurnId, setCurrentTurnId] = React.useState<string | null>(null);
  const [turnLog, setTurnLog] = React.useState<string[]>([]);
  const [turnSummary, setTurnSummary] = React.useState<null | {
    actorName: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
    movedSquares: number;
    action: 'attack' | 'dash' | 'move' | 'wait';
    attack?: { targetName: string; d20: number; total: number; ac: number; dmg: number; hit: boolean; crit: boolean };
  }>(null);
  const [aiNextTurnLoading, setAiNextTurnLoading] = React.useState(false);
  const [aiActionNote, setAiActionNote] = React.useState<string | null>(null);

  const buildCharacterFromToken = React.useCallback((t: TokenEntity): DnD5eCharacter => {
    const actor = t.actor;
    if (!actor) {
      return buildCharacter({
        name: t.name || 'Unknown',
        role: 'npc',
        className: 'Creature',
        level: 1,
        ac: 10,
        speed: 30,
        hp: { max: 1, current: 1 },
        abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      });
    }
    
    // Type assertion for D&D 5e actor system data
    const system = actor.system as any;
    const abilities = system?.abilities || {};
    const attrs = system?.attributes || {};
    const acVal = attrs?.ac?.value ?? attrs?.ac?.flat ?? 10;
    const hpVal = attrs?.hp?.value ?? 1;
    const hpMax = attrs?.hp?.max ?? hpVal;
    const speed = attrs?.movement?.walk ?? 30;
    const level = 1;
    
    // Handle items - could be array or collection
    const itemsArray = Array.isArray(actor.items) 
      ? actor.items 
      : (actor.items as any)?.contents 
        ? Array.from((actor.items as any).contents)
        : [];
    
    const attacks = itemsArray
      .filter((i: any) => i?.type === 'weapon')
      .map((i: any) => ({
        name: i?.name || 'Attack',
        ability: 'str' as const,
        proficient: true,
        damage: (i?.system?.damage?.parts?.[0]?.[0]) || '1d6',
        damageType: (i?.system?.damage?.parts?.[0]?.[1]) || undefined,
        range: i?.system?.range?.value ? `${i.system.range.value} ${i.system.range.units || 'ft'}` : undefined,
      }));
    
    return buildCharacter({
      name: t.name || actor.name || 'Unknown',
      role: 'npc',
      className: 'Creature',
      level,
      ac: acVal,
      speed,
      hp: { max: hpMax, current: hpVal },
      abilityScores: {
        str: abilities?.str?.value ?? 10,
        dex: abilities?.dex?.value ?? 10,
        con: abilities?.con?.value ?? 10,
        int: abilities?.int?.value ?? 10,
        wis: abilities?.wis?.value ?? 10,
        cha: abilities?.cha?.value ?? 10,
      },
      attacks,
    });
  }, []);

  const turnOrder = React.useMemo(() => {
    const tokens = sceneEntitiesResult?.tokens || [];
    const entries = tokens.map(t => {
      const actor = t.actor;
      const system = actor?.system as any;
      const abilities = system?.abilities || {};
      const attrs = system?.attributes || {};
      const hp = attrs?.hp?.value ?? 0;
      const hpMax = attrs?.hp?.max ?? hp;
      const initBonusRaw = attrs?.init?.bonus;
      const initBonus = typeof initBonusRaw === 'number' ? initBonusRaw : (typeof initBonusRaw === 'string' ? parseInt(initBonusRaw) : 0);
      const dexMod = calculateAbilityModifier(abilities?.dex?.value ?? 10);
      const initiative = initBonus || dexMod;
      return {
        id: t.uuid || t.id,
        name: t.name || t?.actor?.name || 'Unknown',
        hp,
        hpMax,
        token: t,
        initiative,
      };
    });
    entries.sort((a, b) => (b.initiative || 0) - (a.initiative || 0));
    return entries;
  }, [sceneEntitiesResult]);

  // Keep current turn in sync with turn order
  React.useEffect(() => {
    if (!turnOrder || turnOrder.length === 0) {
      setCurrentTurnId(null);
      return;
    }
    if (!currentTurnId) {
      setCurrentTurnId(turnOrder[0].id);
      return;
    }
    if (!turnOrder.some(e => e.id === currentTurnId)) {
      setCurrentTurnId(turnOrder[0].id);
    }
  }, [turnOrder, currentTurnId]);

  const goNextTurn = React.useCallback(() => {
    if (!turnOrder || turnOrder.length === 0) return;
    const idx = turnOrder.findIndex(e => e.id === currentTurnId);
    const current = turnOrder[(idx >= 0 ? idx : 0)];
    if (current && sceneEntitiesResult) {
      const res = executeTurn({
        entityId: current.id,
        tokens: sceneEntitiesResult.tokens || [],
        gridData: gridData as any,
        gridSize: GRID_SIZE,
        cellPixels: CELL_PIXELS,
        step: 10,
      });
      setSceneEntitiesResult(prev => prev ? ({ ...prev, tokens: res.tokens }) : prev);
      setTurnLog(prev => [...res.log, ...prev].slice(0, 50));
      setTurnSummary(res.summary || null);
    }
    const next = turnOrder[(idx >= 0 ? (idx + 1) % turnOrder.length : 0)];
    setCurrentTurnId(next.id);
  }, [turnOrder, currentTurnId, sceneEntitiesResult, gridData]);

  // Helper function to extract damage from roll result
  const extractDamageFromRoll = (result: any): number | null => {
    const rawData = result?.rawData;
    if (!rawData) return null;
    
    // Check various locations where damage might be nested
    return rawData.rawData?.data?.damageRoll?.total ||
           rawData.data?.damageRoll?.total ||
           rawData.rawData?.damageRoll?.total ||
           rawData.damageRoll?.total ||
           rawData.rawData?.data?.damage?.total ||
           rawData.data?.damage?.total ||
           rawData.damage?.total ||
           (typeof rawData.rawData?.data?.damageRoll === 'number' ? rawData.rawData.data.damageRoll : null) ||
           (typeof rawData.data?.damageRoll === 'number' ? rawData.data.damageRoll : null) ||
           (typeof rawData.damageRoll === 'number' ? rawData.damageRoll : null);
  };

  // Helper function to calculate damage from weapon
  const calculateWeaponDamage = async (
    actorToken: TokenEntity,
    targetToken: TokenEntity,
    weapon: any
  ): Promise<number> => {
    try {
      const { resolveMeleeAttack } = await import('@/utils/ai/behavior');
      const outcome = resolveMeleeAttack(actorToken, targetToken);
      return outcome.damage;
    } catch (e) {
      // Fallback: use weapon damage formula if available
      const damageFormula = weapon?.system?.damage?.parts?.[0]?.[0] as string | undefined;
      if (damageFormula) {
        // Simple average calculation (1d6 = 3.5, 1d8 = 4.5, etc.)
        return 4; // Conservative default
      }
      return 0;
    }
  };

  // Helper function to apply damage to target token
  const applyDamageToToken = React.useCallback(async (
    targetToken: TokenEntity,
    damage: number,
    clientId: string | null
  ): Promise<void> => {
    if (damage <= 0) return;

    // Update local state
    setSceneEntitiesResult(prev => {
      if (!prev) return prev;
      const updated = { ...prev, tokens: [...(prev.tokens || [])] };
      const targetIdx = updated.tokens.findIndex((t) => (t.uuid || t.id) === targetToken.uuid);
      if (targetIdx >= 0 && updated.tokens[targetIdx]?.actor) {
        const token = { ...updated.tokens[targetIdx] };
        const actor = token.actor as any;
        const system = actor?.system as any;
        const hp = { ...(system?.attributes?.hp || {}) };
        hp.value = Math.max(0, (hp.value ?? 0) - damage);
        token.actor = {
          ...actor,
          system: {
            ...system,
            attributes: {
              ...system?.attributes,
              hp,
            },
          },
        };
        updated.tokens[targetIdx] = token;
      }
      return updated;
    });

    // Update Foundry if connected
    if (clientId && targetToken?.actor?.id) {
      try {
        await applyDamage({
          clientId,
          targetUuid: targetToken.actor.id,
          damage,
        });
      } catch (e) {
        console.warn('Failed to apply damage via Foundry API:', e);
      }
    }
  }, []);

  // Helper function to extract roll info from result
  const extractRollInfo = (roll: any): { d20: number | string; total: number | string; isCrit: boolean } => {
    const d20Die = roll.dice?.find((d: any) => d.faces === 20);
    return {
      d20: d20Die?.results?.[0]?.result ?? '?',
      total: roll.total ?? '?',
      isCrit: roll.isCritical ?? false,
    };
  };

  // Helper function to format attack log message
  const formatAttackLog = (
    flavor: string,
    d20: number | string,
    total: number | string,
    targetAC: number | string,
    isHit: boolean,
    isCrit: boolean,
    damage?: number | string | null
  ): string => {
    if (isCrit) {
      return `${flavor}: CRITICAL HIT! Roll: d20 ${d20} = ${total} (vs AC ${targetAC})${damage !== undefined ? ` - Damage: ${damage}` : ''}`;
    } else if (isHit) {
      return `${flavor}: HIT! Roll: d20 ${d20} = ${total} (vs AC ${targetAC})${damage !== undefined ? ` - Damage: ${damage}` : ''}`;
    } else {
      return `${flavor}: MISS! Roll: d20 ${d20} = ${total} (vs AC ${targetAC})`;
    }
  };

  const aiNextTurnForCurrent = React.useCallback(async () => {
    if (!sceneEntitiesResult?.tokens || sceneEntitiesResult.tokens.length === 0) return;
    if (!turnOrder || turnOrder.length === 0 || !currentTurnId) return;
    const current = turnOrder.find(e => e.id === currentTurnId);
    if (!current) return;
    const tokens = sceneEntitiesResult.tokens;
    const actorIndex = Math.max(0, tokens.findIndex(t => (t.uuid || t.id) === current.id));
    setAiNextTurnLoading(true);
    try {
      const ai = await requestAiTurn({
        actor: { index: actorIndex, id: current.id },
        tokens: tokens,
        grid: { gridSize: GRID_SIZE, cellPixels: CELL_PIXELS },
        gridData: gridData, // Pass gridData for wall-aware pathfinding
      });
      if (!ai.success) {
        appendLog(`AI error: ${ai.error}`);
        setAiActionNote(`AI error: ${ai.error}`);
        return;
      }
      const action = ai.action as any;
      if (action.type === 'attack') {
        const step = 10; // coarse cell size in fine cells
        const cellPx = CELL_PIXELS; // pixels per fine cell
        const actorToken = tokens[actorIndex];
        
        // Resolve target: either by index/id or by coordinates
        let targetToken: TokenEntity | undefined = undefined;
        if (action.targetPosition) {
          // Target by coordinates
          const targetPos = action.targetPosition;
          const space = targetPos.space || 'coarse';
          let targetX: number, targetY: number;
          
          if (space === 'coarse') {
            targetX = targetPos.x;
            targetY = targetPos.y;
          } else {
            // Convert fine coordinates to coarse
            targetX = Math.floor(targetPos.x / step);
            targetY = Math.floor(targetPos.y / step);
          }
          
          const found = findTokenAtCoarse(tokens, targetX, targetY, cellPx, step);
          if (!found) {
            appendLog(`AI chose attack at coordinates (${targetX}, ${targetY}) but no token found there`);
            setAiActionNote(`AI chose attack at (${targetX}, ${targetY}) but no token found`);
            return;
          }
          
          // Check if target is adjacent
          const actorBlock = getCoarseBlock(actorToken, cellPx, step);
          const targetBlock = getCoarseBlock(found.token, cellPx, step);
          
          if (!isAdjacentCoarse(actorBlock, targetBlock, step)) {
            appendLog(`AI chose attack at coordinates (${targetX}, ${targetY}) but target is not adjacent`);
            setAiActionNote(`AI chose attack at (${targetX}, ${targetY}) but target is not adjacent`);
            return;
          }
          
          targetToken = found.token;
        } else {
          // Target by index/id (existing behavior)
          const tIdx: number | undefined = action.target?.index;
          const tId: string | undefined = action.target?.id;
          targetToken = (typeof tIdx === 'number' && tIdx >= 0 && tIdx < tokens.length)
            ? tokens[tIdx]
            : (tId ? tokens.find(t => (t.uuid || t.id) === tId) : undefined);
          if (!targetToken) {
            appendLog('AI chose attack but no valid target found');
            return;
          }
        }
        const actor = actorToken.actor as any;
        const itemsArray = Array.isArray(actor?.items) 
          ? actor.items 
          : (actor?.items as any)?.contents 
            ? Array.from((actor.items as any).contents)
            : [];
        const weaponName: string | undefined = action.weaponName;
        const byName = weaponName ? itemsArray.find((i: any) => (i?.type === 'weapon') && (i?.name || '').toLowerCase().includes(weaponName.toLowerCase())) : undefined;
        const firstWeapon = itemsArray.find((i: any) => i?.type === 'weapon');
        const chosen = byName || firstWeapon;
        
        if (!targetToken) {
          appendLog('AI chose attack but target token is undefined');
          return;
        }
        
        // Get target AC
        const targetSystem = targetToken.actor?.system as any;
        const targetAC = targetSystem?.attributes?.ac?.value ?? 
                        targetSystem?.attributes?.ac?.flat ?? 
                        'unknown';
        
        const actorName = actorToken?.name || actorToken?.actor?.name || 'Creature';
        const targetName = targetToken.name || targetToken.actor?.name || 'target';
        const flavor = `AI Next Turn: ${actorName} attacks ${targetName}`;
        setAiActionNote(flavor);
        
        if (clientId && chosen?._id && actorToken?.uuid) {
          const itemUuid = `${actorToken.uuid}.Item.${chosen._id}`;
          const result = await makeRoll({
            clientId,
            itemUuid,
            flavor,
            createChatMessage: true,
            speaker: actorToken.uuid,
            target: targetToken.uuid,
          });
          if (result?.success && result?.roll) {
            const roll = result.roll;
            const { d20, total, isCrit } = extractRollInfo(roll);
            const isHit = typeof total === 'number' && typeof targetAC === 'number' && total >= targetAC;
            
            // Extract or calculate damage
            let damage = extractDamageFromRoll(result);
            if (damage === null && isHit && chosen && targetToken) {
              damage = await calculateWeaponDamage(actorToken, targetToken, chosen);
            }
            
            // Log attack result
            appendLog(formatAttackLog(flavor, d20, total, targetAC, isHit, isCrit, damage ?? '?'));
            
            // Apply damage if hit
            if (isHit && targetToken && damage && damage > 0) {
              await applyDamageToToken(targetToken, damage, clientId);
            }
          } else {
            appendLog(`AI roll failed: ${result?.error || 'unknown error'}`);
          }
        } else if (clientId) {
          // Fallback: simple attack roll using +0 if unknown
          const bonusRaw = Number(chosen?.system?.attack?.bonus);
          const bonus = Number.isFinite(bonusRaw) ? (bonusRaw as number) : 0;
          const formula = `1d20${bonus >= 0 ? '+' : ''}${bonus}`;
          const result = await makeRoll({
            clientId,
            formula,
            flavor: `${flavor} (Attack Roll)`,
            createChatMessage: true,
            speaker: actorToken?.uuid,
            target: targetToken?.uuid,
          });
          if (result?.success && result?.roll) {
            const roll = result.roll;
            const { d20, total, isCrit } = extractRollInfo(roll);
            const isHit = typeof total === 'number' && typeof targetAC === 'number' && total >= targetAC;
            
            // Log attack result
            appendLog(formatAttackLog(flavor, d20, total, targetAC, isHit, isCrit));
            
            // Calculate and apply damage if hit
            if (isHit && targetToken) {
              const damage = await calculateWeaponDamage(actorToken, targetToken, chosen);
              if (damage > 0) {
                await applyDamageToToken(targetToken, damage, clientId);
              }
            }
          } else {
            appendLog(`AI roll failed: ${result?.error || 'unknown error'}`);
          }
        } else {
          // Offline/local: use resolveMeleeAttack for simulation
          const { resolveMeleeAttack } = await import('@/utils/ai/behavior');
          const outcome = resolveMeleeAttack(actorToken, targetToken);
          
          // Log attack result
          appendLog(formatAttackLog(
            flavor,
            outcome.d20,
            outcome.total,
            outcome.targetAC,
            outcome.hit,
            outcome.crit,
            outcome.damage
          ));
          
          // Apply damage if hit
          if (outcome.hit && outcome.damage > 0 && targetToken) {
            await applyDamageToToken(targetToken, outcome.damage, clientId);
          }
        }
      } else if (action.type === 'move' || action.type === 'dash') {
        const actorToken = tokens[actorIndex];
        const step = 10; // coarse cell size in fine cells
        const cellPx = CELL_PIXELS; // pixels per fine cell
        // Current coarse position
        const cellX = Math.floor((actorToken?.x ?? 0) / cellPx);
        const cellY = Math.floor((actorToken?.y ?? 0) / cellPx);
        const sx = Math.floor(cellX / step);
        const sy = Math.floor(cellY / step);
        // Destination goal: default to 'coarse' if space is not specified (matches schema default)
        const dest = action.destination || action.destination?.position || undefined;
        let goalX = sx, goalY = sy;
        if (dest && typeof dest.x === 'number' && typeof dest.y === 'number') {
          // Default to 'coarse' if space is not specified (matches schema default)
          const space = dest.space || 'coarse';
          if (space === 'coarse') {
            goalX = dest.x;
            goalY = dest.y;
          } else if (space === 'fine') {
            goalX = Math.floor(dest.x / step);
            goalY = Math.floor(dest.y / step);
          } else {
            // assume pixels (fallback)
            const fineX = Math.floor(dest.x / cellPx);
            const fineY = Math.floor(dest.y / cellPx);
            goalX = Math.floor(fineX / step);
            goalY = Math.floor(fineY / step);
          }
        }
        const goals = new Set<string>([`${goalX},${goalY}`]);
        // Build occupied set from other tokens
        const occupied = new Set<string>();
        tokens.forEach((t, i) => {
          if (i === actorIndex) return;
          const cx = Math.floor(Math.floor((t?.x ?? 0) / cellPx) / step);
          const cy = Math.floor(Math.floor((t?.y ?? 0) / cellPx) / step);
          occupied.add(`${cx},${cy}`);
        });
        // Compute movement allowance
        const actorSystem = actorToken?.actor?.system as any;
        const movement = Number(actorSystem?.attributes?.movement?.walk ?? 30);
        const squaresPerMove = Math.max(1, Math.floor(movement / 5));
        const maxSquares = action.type === 'dash' ? squaresPerMove * 2 : squaresPerMove;
        // Plan path using shared wall-aware pathfinding with movement limit
        const path = findPathCoarseShared(gridData, GRID_SIZE, sx, sy, goals, occupied, step, maxSquares);
        if (!path || path.length <= 1) {
          appendLog(`AI chose move but no path available: ${JSON.stringify(action)}`);
          setAiActionNote('AI chose move but no path available');
          return;
        }
        // Path is already limited to maxSquares by pathfinding, use the last valid cell
        const destCoarse = path[path.length - 1];
        // Verify destination is not occupied
        if (occupied.has(`${destCoarse.x},${destCoarse.y}`) && !(destCoarse.x === sx && destCoarse.y === sy)) {
          // If destination is occupied, use the previous cell in path
          if (path.length > 1) {
            const prev = path[path.length - 2];
            if (!occupied.has(`${prev.x},${prev.y}`)) {
              const newBlockX = prev.x * step;
              const newBlockY = prev.y * step;
              const newPxX = newBlockX * cellPx;
              const newPxY = newBlockY * cellPx;
              setSceneEntitiesResult(prev => {
                if (!prev) return prev;
                const updated: GetSceneEntitiesResponse = { ...prev, tokens: [...(prev.tokens || [])] };
                const idx = updated.tokens.findIndex((t) => (t.uuid || t.id) === current.id);
                if (idx >= 0) {
                  const t = { ...updated.tokens[idx] };
                  t.x = newPxX;
                  t.y = newPxY;
                  updated.tokens[idx] = t;
                }
                return updated;
              });
              const moved = path.length - 2;
              appendLog(`AI moved ${moved} square(s).`);
              setAiActionNote(`${action.type === 'dash' ? 'Dashed' : 'Moved'} ${moved} square(s) toward (${goalX}, ${goalY})`);
              return;
            }
          }
          appendLog('AI chose move but destination is occupied');
          setAiActionNote('AI chose move but destination is occupied');
          return;
        }
        // Calculate distance moved (path length minus start position)
        const moved = path.length - 1;
        const newBlockX = destCoarse.x * step;
        const newBlockY = destCoarse.y * step;
        const newPxX = newBlockX * cellPx;
        const newPxY = newBlockY * cellPx;
        setSceneEntitiesResult(prev => {
          if (!prev) return prev;
          const updated: GetSceneEntitiesResponse = { ...prev, tokens: [...(prev.tokens || [])] };
          const idx = updated.tokens.findIndex((t) => (t.uuid || t.id) === current.id);
          if (idx >= 0) {
            const t = { ...updated.tokens[idx] };
            t.x = newPxX;
            t.y = newPxY;
            updated.tokens[idx] = t;
          }
          return updated;
        });
        appendLog(`AI moved ${moved} square(s).`);
        setAiActionNote(`${action.type === 'dash' ? 'Dashed' : 'Moved'} ${moved} square(s) toward (${goalX}, ${goalY})`);
      } else {
        appendLog(`AI chose action: ${action.type}`);
        setAiActionNote(`AI chose action: ${action.type}`);
      }
    } catch (e: any) {
      appendLog(`AI error: ${e?.message || 'unknown error'}`);
      setAiActionNote(`AI error: ${e?.message || 'unknown error'}`);
    } finally {
      setAiNextTurnLoading(false);
    }
  }, [clientId, sceneEntitiesResult, turnOrder, currentTurnId, gridData, applyDamageToToken]);

  const appendLog = (s: string) => setTurnLog(prev => [s, ...prev].slice(0, 50));

  // NOTE: Duplicate pathfinding logic removed - use findPathCoarse from utils/pathfinding.ts instead
  // The shared utility functions provide the same functionality with better maintainability

  // Removed in-page doTurn; using executeTurn from utils/turnEngine instead.

  // Map Generation Algorithm
  const initializeGame = async () => {
    // Reset state
    setGeneratedMap(false);
    setExitBlock(null);
    setAgentBlock(null);
    setValidMoves(null);
    setPlannedPath(null);
    setImportedMapData(null); // Clear imported map when generating new map

    let walls: any[] = [], tokens: any[] = [], playerBlock: any, exitBlock: any;
    if (generatorMode === 'hto' || generatorMode === 'graph') {
      const seedStr = `${generatorMode}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
      const res = await fetch('/api/dungeon/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: generatorMode,
          gridSize: GRID_SIZE,
          cellPixels: CELL_PIXELS,
          step: 10,
          seed: seedStr,
          graph: generatorMode === 'graph' ? safeParseGraph(graphText) : undefined,
        }),
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || 'generation failed');
      walls = json.map.walls; tokens = json.map.tokens; playerBlock = json.map.playerBlock; exitBlock = json.map.exitBlock; setDebugTiles(json.tiles);
    } else {
      const res = generateLocalDungeon({ gridSize: GRID_SIZE, cellPixels: CELL_PIXELS, step: 10 });
      walls = res.walls; tokens = res.tokens; playerBlock = res.playerBlock; exitBlock = res.exitBlock; setDebugTiles(null);
    }
    setWallsResult({ walls, sceneId: 'generated', sceneUuid: 'generated' });
    setSceneEntitiesResult({
      scene: {
        id: 'generated',
        uuid: 'generated-scene',
        name: generatorMode === 'hto' ? 'Generated Dungeon (HTO)' : generatorMode === 'graph' ? 'Generated Dungeon (Graph)' : 'Generated Dungeon',
        width: GRID_SIZE * CELL_PIXELS,
        height: GRID_SIZE * CELL_PIXELS,
        grid: { size: 10 * CELL_PIXELS, distance: 5, units: 'ft' }
      },
      tokens,
      tiles: [],
      drawings: [],
      lights: [],
      sounds: [],
      notes: []
    });
    setAgentBlock(playerBlock);
    setExitBlock(exitBlock);
    setGeneratedMap(true);
  };

  const handleImportMap = async () => {
    try {
      console.log('Importing map...');
      // Load the grid JSON file from public folder
      const response = await fetch('/scripts/image1_gridded.json');
      if (!response.ok) {
        throw new Error(`Failed to load grid JSON: ${response.statusText}`);
      }
      
      const jsonData = await response.json();
      console.log('Loaded JSON data:', jsonData);
      
      if (!jsonData.grid || !jsonData.imagePath) {
        throw new Error('Invalid map JSON format');
      }

      // Load the image
      const image = new Image();
      image.crossOrigin = 'anonymous';
      
      await new Promise((resolve, reject) => {
        image.onload = () => {
          console.log('Image loaded successfully:', image.width, image.height);
          resolve(null);
        };
        image.onerror = (e) => {
          console.error('Image load error:', e);
          reject(new Error(`Failed to load image from ${image.src}`));
        };
        // Use the imagePath from JSON (already web-accessible)
        console.log('Loading image from:', jsonData.imagePath);
        image.src = jsonData.imagePath;
      });

      console.log('Setting imported map data...');
      setImportedMapData({
        image,
        grid: jsonData.grid,
        imageWidth: jsonData.imageWidth || image.width,
        imageHeight: jsonData.imageHeight || image.height,
      });

      // Clear previous map data
      setWallsResult(null);
      setSceneEntitiesResult(null);
      setGeneratedMap(false);
      console.log('Map imported successfully!');
    } catch (error) {
      console.error('Failed to import map:', error);
      alert(`Failed to import map: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const getClients = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/foundry/clients', { cache: 'no-store' });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Request failed: ${res.status} ${res.statusText} - ${body}`);
      }
      if (contentType.includes('application/json')) {
        const json = await res.json();
        setResult(json);
        const id = json?.clients?.[0]?.id ?? null;
        setClientId(id);
        const wid = json?.clients?.[0]?.worldId ?? null;
        setWorldId(wid);
      } else {
        const text = await res.text();
        setResult({ text });
      }
    } catch (e: any) {
      setError(e?.message || 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRolls = async () => {
    if (!clientId) {
      setRollsError('No clientId. Click "Get Foundry Clients" first.');
      return;
    }
    setRollsLoading(true);
    setRollsError(null);
    setRollsResult(null);
    try {
      const data = await getRolls({ clientId, limit: 5 });
      setRollsResult(data);
    } catch (e: any) {
      setRollsError(e?.message || 'Failed to fetch rolls');
    } finally {
      setRollsLoading(false);
    }
  };

  const onMoveEntities = async () => {
    if (!clientId) {
      setMoveError('No clientId. Click "Get Foundry Clients" first.');
      return;
    }
    const x = moveX.trim() === '' ? undefined : Number(moveX);
    const y = moveY.trim() === '' ? undefined : Number(moveY);
    if (x === undefined && y === undefined) {
      setMoveError('Provide at least X or Y.');
      return;
    }
    const uuids = moveUuids
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (!moveSelected && uuids.length === 0) {
      setMoveError('Enter UUIDs or check Selected.');
      return;
    }
    setMoveLoading(true);
    setMoveError(null);
    setMoveResult(null);
    try {
      const data = await moveEntities({ clientId, uuids: uuids.length ? uuids : undefined, selected: moveSelected, x, y });
      setMoveResult(data);
    } catch (e: any) {
      setMoveError(e?.message || 'Failed to move entities');
    } finally {
      setMoveLoading(false);
    }
  };

  const fetchEncounters = async () => {
    if (!clientId) {
      setEncountersError('No clientId. Click "Get Foundry Clients" first.');
      return;
    }
    setEncountersLoading(true);
    setEncountersError(null);
    setEncountersResult(null);
    try {
      const data = await getEncounters({ clientId });
      setEncountersResult(data);
    } catch (e: any) {
      setEncountersError(e?.message || 'Failed to fetch encounters');
    } finally {
      setEncountersLoading(false);
    }
  };

  const fetchScenes = async () => {
    if (!clientId) {
      setScenesError('No clientId. Click "Get Foundry Clients" first.');
      return;
    }
    setScenesLoading(true);
    setScenesError(null);
    setScenesResult(null);
    try {
      const data = await getSceneIds({ clientId, worldId: worldId ?? undefined });
      setScenesResult(data);
    } catch (e: any) {
      setScenesError(e?.message || 'Failed to fetch scenes');
    } finally {
      setScenesLoading(false);
    }
  };

  const fetchSceneEntities = async () => {
    if (!clientId) {
      setSceneEntitiesError('No clientId. Click "Get Foundry Clients" first.');
      return;
    }
    setSceneEntitiesLoading(true);
    setSceneEntitiesError(null);
    setSceneEntitiesResult(null);
    try {
      const data = await getSceneEntities({ clientId });
      setSceneEntitiesResult(data);
    } catch (e: any) {
      setSceneEntitiesError(e?.message || 'Failed to fetch scene entities');
    } finally {
      setSceneEntitiesLoading(false);
    }
  };

  const fetchWalls = async () => {
    if (!clientId) {
      setWallsError('No clientId. Click "Get Foundry Clients" first.');
      return;
    }
    setWallsLoading(true);
    setWallsError(null);
    setWallsResult(null);
    try {
      const data = await getSceneWalls({ clientId });
      setWallsResult(data);
    } catch (e: any) {
      setWallsError(e?.message || 'Failed to fetch walls');
    } finally {
      setWallsLoading(false);
    }
  };

  const fetchAllSceneData = async () => {
    // Set all loading states
    setIsLoading(true);
    setScenesLoading(true);
    setSceneEntitiesLoading(true);
    setWallsLoading(true);
    setError(null);
    setScenesError(null);
    setSceneEntitiesError(null);
    setWallsError(null);
    setResult(null);
    setScenesResult(null);
    setSceneEntitiesResult(null);
    setWallsResult(null);
    
    try {
      // Step 1: Get clients first to obtain clientId
      const res = await fetch('/api/foundry/clients', { cache: 'no-store' });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Request failed: ${res.status} ${res.statusText} - ${body}`);
      }
      
      let fetchedClientId: string | null = null;
      let fetchedWorldId: string | null = null;
      
      if (contentType.includes('application/json')) {
        const json = await res.json();
        setResult(json);
        fetchedClientId = json?.clients?.[0]?.id ?? null;
        fetchedWorldId = json?.clients?.[0]?.worldId ?? null;
        setClientId(fetchedClientId);
        setWorldId(fetchedWorldId);
      } else {
        const text = await res.text();
        setResult({ text });
      }
      
      if (!fetchedClientId) {
        throw new Error('No client ID found');
      }
      
      setIsLoading(false);
      
      // Step 2: Fetch scenes, entities, and walls in parallel using the clientId
      const [scenesData, entitiesData, wallsData] = await Promise.all([
        getSceneIds({ clientId: fetchedClientId, worldId: fetchedWorldId ?? undefined }),
        getSceneEntities({ clientId: fetchedClientId }),
        getSceneWalls({ clientId: fetchedClientId }),
      ]);
      
      setScenesResult(scenesData);
      setSceneEntitiesResult(entitiesData);
      setWallsResult(wallsData);
      
    } catch (e: any) {
      const errorMsg = e?.message || 'Failed to fetch scene data';
      setError(errorMsg);
      setScenesError(errorMsg);
      setSceneEntitiesError(errorMsg);
      setWallsError(errorMsg);
    } finally {
      setIsLoading(false);
      setScenesLoading(false);
      setSceneEntitiesLoading(false);
      setWallsLoading(false);
    }
  };


  const buildMapContext = () => {
    type MapContextCell = {
      x: number | null;
      y: number | null;
      cellX: number | null;
      cellY: number | null;
      name?: string;
    };
    
    const context: {
      gridCellPixels: number;
      gridCells: number;
      tokens: MapContextCell[];
      tiles: MapContextCell[];
      drawings: MapContextCell[];
      sounds: MapContextCell[];
      notes: MapContextCell[];
      walls: Array<{ p1: MapContextCell; p2: MapContextCell; door?: boolean }>;
    } = {
      gridCellPixels: CELL_PIXELS,
      gridCells: GRID_SIZE,
      tokens: [],
      tiles: [],
      drawings: [],
      sounds: [],
      notes: [],
      walls: [],
    };
    const toCell = (x?: number, y?: number) => ({
      x: x ?? null,
      y: y ?? null,
      cellX: x === undefined ? null : Math.floor(x / CELL_PIXELS),
      cellY: y === undefined ? null : Math.floor(y / CELL_PIXELS),
    });
    sceneEntitiesResult?.tokens?.slice(0, 200).forEach(t => {
      context.tokens.push({ name: t.name ?? '', ...toCell(t.x, t.y) });
    });
    sceneEntitiesResult?.tiles?.slice(0, 200).forEach(t => {
      context.tiles.push({ ...toCell(t.x, t.y) });
    });
    sceneEntitiesResult?.drawings?.slice(0, 200).forEach(d => {
      context.drawings.push({ ...toCell(d.x, d.y) });
    });
    sceneEntitiesResult?.sounds?.slice(0, 200).forEach(s => {
      context.sounds.push({ ...toCell(s.x, s.y) });
    });
    sceneEntitiesResult?.notes?.slice(0, 200).forEach(n => {
      context.notes.push({ ...toCell(n.x, n.y) });
    });
    (wallsResult?.walls || []).slice(0, 500).forEach((w: WallEntity) => {
      const c = Array.isArray(w?.c) ? w.c : [];
      const [x1, y1, x2, y2] = c as number[];
      context.walls.push({
        p1: toCell(x1, y1),
        p2: toCell(x2, y2),
        door: w?.door === 1,
      });
    });
    return JSON.stringify(context);
  };

  const sendToAI = async () => {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiResponse('');
    const context = buildMapContext();
    const newMessages = [
      ...aiMessages,
      { role: 'system', content: 'You are a tactical assistant. Use the provided map context.' },
      { role: 'user', content: `Map context (JSON):\n${context}\n\nUser message: ${aiInput}` },
    ] as { role: 'user' | 'assistant' | 'system'; content: string }[];
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `AI error ${res.status}`);
      }
      const text = await res.text();
      setAiMessages([...newMessages, { role: 'assistant', content: text }]);
      setAiResponse(text);
      setAiInput('');
    } catch (e: any) {
      setAiError(e?.message || 'Failed to get AI response');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto max-w-7xl p-8 space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-block">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
              Foundry VTT API
            </h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Interact with your Foundry Virtual Tabletop through the REST API. Visualize scenes, control tokens, and manage encounters.
          </p>
        </div>

        {/* Connection Card */}
        <Card className="border-2 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-2xl">🔌</span>
              Connection
            </CardTitle>
            <CardDescription>
              Connect to your Foundry instance and load scene data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <Button 
                  onClick={initializeGame}
                  size="lg"
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold shadow-md"
                >
                  🎮 Initialize Game {generatorMode === 'hto' ? '(HTO)' : generatorMode === 'graph' ? '(Graph)' : '(Local)'}
                </Button>
                <Button 
                  onClick={handleImportMap}
                  size="lg"
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold shadow-md"
                >
                  📥 Import Map
                </Button>
                <label className="flex items-center gap-2 text-sm text-muted-foreground select-none">
                  <select
                    className="border rounded px-2 py-1 bg-white dark:bg-slate-900"
                    value={generatorMode}
                    onChange={(e) => setGeneratorMode(e.target.value as any)}
                  >
                    <option value="local">Local</option>
                    <option value="hto">HTO (BSP)</option>
                    <option value="graph">Graph</option>
                  </select>
                </label>
              </div>
              <Button 
                onClick={fetchAllSceneData} 
                disabled={isLoading || scenesLoading || sceneEntitiesLoading || wallsLoading}
                size="lg"
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-md"
              >
                {(isLoading || scenesLoading || sceneEntitiesLoading || wallsLoading) 
                  ? '⏳ Loading All Data…' 
                  : '🚀 Get All Scene Data'}
              </Button>
              {error && (
                <span className="text-sm text-red-600 font-medium">{error}</span>
              )}
            </div>
            {generatedMap && (
              <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                <div className="flex-shrink-0 w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <div className="text-sm">
                  <span className="font-medium text-emerald-800 dark:text-emerald-300">Generated Map:</span>{' '}
                  <span className="text-emerald-700 dark:text-emerald-400">Procedural dungeon with player and enemies ready!</span>
                </div>
              </div>
            )}
            {clientId && (
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex-shrink-0 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <div className="text-sm">
                  <span className="font-medium text-green-800 dark:text-green-300">Connected:</span>{' '}
                  <code className="rounded bg-green-100 dark:bg-green-900/40 px-2 py-1 text-green-900 dark:text-green-200">{clientId}</code>
                  {worldId && (
                    <>
                      {' | '}
                      <span className="font-medium text-green-800 dark:text-green-300">World:</span>{' '}
                      <code className="rounded bg-green-100 dark:bg-green-900/40 px-2 py-1 text-green-900 dark:text-green-200">{worldId}</code>
                    </>
                  )}
                </div>
              </div>
            )}
            {generatorMode === 'graph' && (
              <div className="space-y-2 mt-4">
                <div className="text-sm text-muted-foreground">Optional Graph JSON (adjacency map, e.g. {`{"A":["B","C"],"B":["D"],"C":["E"],"D":[],"E":[]}`})</div>
                <textarea
                  className="w-full h-28 border rounded p-2 bg-white dark:bg-slate-900"
                  placeholder='{"A":["B","C"],"B":["D"],"C":["E"],"D":[],"E":[]}'
                  value={graphText}
                  onChange={(e) => setGraphText(e.target.value)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Main content area - left side */}
            <Card className="border-2 shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-2xl">🤖</span>
                  AI Assistant
                </CardTitle>
                <CardDescription>
                  Ask the AI about your map and get tactical advice
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Input 
                    value={aiInput} 
                    onChange={(e) => setAiInput(e.target.value)} 
                    placeholder="e.g., What's the best path to the exit?" 
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !aiLoading && clientId && (sceneEntitiesResult || wallsResult)) {
                        sendToAI();
                      }
                    }}
                  />
                  <Button 
                    onClick={sendToAI} 
                    disabled={aiLoading || !clientId || (!sceneEntitiesResult && !wallsResult)}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                  >
                    {aiLoading ? '💭 Thinking…' : '✨ Ask AI'}
                  </Button>
                </div>
                {aiError && (
                  <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/20 p-3 rounded-md border border-red-200 dark:border-red-800">
                    {aiError}
                  </div>
                )}
                {aiResponse && (
                  <div className="text-sm bg-purple-50 dark:bg-purple-950/20 p-4 rounded-md border border-purple-200 dark:border-purple-800">
                    <div className="font-medium text-purple-900 dark:text-purple-300 mb-2">AI Response:</div>
                    <div className="text-purple-800 dark:text-purple-200 whitespace-pre-wrap">{aiResponse}</div>
                  </div>
                )}
              </CardContent>
            </Card>
            {(gridData || importedMapData) && (
              <Card className="border-2 shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-2xl">🗺️</span>
                    Scene Visualization
                  </CardTitle>
                  <CardDescription>
                    Interactive map showing entities, walls, and movement paths. Click to place markers.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2 text-xs items-center justify-between">
                    <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-950/40 rounded">
                      <div className="w-3 h-3 bg-blue-500 rounded"></div>
                      <span>Tokens</span>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded">
                      <div className="w-3 h-3 bg-slate-500 rounded"></div>
                      <span>Tiles</span>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-950/40 rounded">
                      <div className="w-3 h-3 bg-red-500 rounded"></div>
                      <span>Walls</span>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-950/40 rounded">
                      <div className="w-3 h-3 bg-green-500 rounded"></div>
                      <span>Entities</span>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-[12px] text-muted-foreground">Current:</span>
                      <span className="text-[12px] font-medium">
                        {turnOrder.find(e => e.id === currentTurnId)?.name || '—'}
                      </span>
                      <Button size="sm" variant="outline" onClick={goNextTurn}>Next Turn</Button>
                      <Button size="sm" onClick={aiNextTurnForCurrent} disabled={!(sceneEntitiesResult?.tokens && sceneEntitiesResult.tokens.length > 0) || aiNextTurnLoading}>
                        {aiNextTurnLoading ? 'AI Thinking…' : 'AI Next Turn'}
                      </Button>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    {/* Turn Order Sidebar */}
                    <div className="w-64 flex-shrink-0 max-h-[600px] overflow-auto border rounded-lg bg-background">
                      <div className="px-3 py-2 text-sm font-medium border-b">Turn Order</div>
                      <div className="divide-y">
                        {turnOrder.length === 0 && (
                          <div className="p-3 text-xs text-muted-foreground">No tokens</div>
                        )}
                        {turnOrder.map((e, idx) => (
                          <button key={e.id || idx} onClick={() => { const c = buildCharacterFromToken(e.token); setSheetChar(c); setSheetOpen(true); }} className={`w-full text-left p-3 hover:bg-muted/50 ${currentTurnId === e.id ? 'bg-amber-50 dark:bg-amber-950/20 border-l-2 border-amber-500' : ''}`}>
                            <div className="flex items-center gap-3">
                              {/* Avatar placeholder */}
                              <div className="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center text-xs font-semibold">
                                {(e.name || '?').slice(0,1).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{e.name}</div>
                                <div className="text-[11px] text-muted-foreground">Init {e.initiative >= 0 ? `+${e.initiative}` : e.initiative}</div>
                                <div className="mt-1 h-1.5 bg-muted rounded overflow-hidden">
                                  <div className="h-full bg-green-500" style={{ width: `${e.hpMax ? (Math.max(0, Math.min(e.hp, e.hpMax)) / e.hpMax) * 100 : 0}%` }} />
                                </div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">{e.hp} / {e.hpMax}</div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Map Canvas */}
                    <div className="flex-1 max-h-[800px] max-w-full overflow-auto border-2 border-slate-300 dark:border-slate-700 rounded-lg p-3 bg-slate-100 dark:bg-slate-900 shadow-inner">
                      {importedMapData && (
                        <div className="mb-2 p-2 bg-green-100 dark:bg-green-900/20 rounded text-sm">
                          Map loaded: {importedMapData.imageWidth} × {importedMapData.imageHeight}px
                        </div>
                      )}
                      <div className="relative">
                        <canvas onClick={(e) => {
                const step = 10;
                const canvas = canvasRef.current;
                if (!canvas) return;
                const rect = canvas.getBoundingClientRect();
                const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
                const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
                const blockX = Math.floor(sx / step) * step;
                const blockY = Math.floor(sy / step) * step;
                if (exitPlaceMode) {
                  setExitBlock({ x: blockX, y: blockY });
                  setExitPlaceMode(false);
                } else if (agentPlaceMode) {
                  setAgentBlock({ x: blockX, y: blockY });
                  setAgentPlaceMode(false);
                }
              }} ref={canvasRef} style={{ 
                width: importedMapData 
                  ? `${Math.min(800, importedMapData.imageWidth)}px` 
                  : `${CELL_CSS_PX * GRID_SIZE}px`, 
                height: importedMapData 
                  ? `${Math.min(800, importedMapData.imageWidth) * (importedMapData.imageHeight / importedMapData.imageWidth)}px`
                  : `${CELL_CSS_PX * GRID_SIZE}px`, 
                maxWidth: importedMapData ? '800px' : 'none',
                imageRendering: 'auto' as any, 
                cursor: exitPlaceMode || agentPlaceMode ? 'crosshair' : 'default',
                display: 'block'
              }} />
                      </div>
                    </div>
                    {/* Tiles preview moved into main canvas overlay */}
                  </div>
                  {/* AI Decision Note (below map) */}
                  <div className="mt-3">
                    <div className="rounded-lg border bg-background p-3">
                      <div className="text-sm font-medium mb-1">AI Decision</div>
                      <div className="text-sm text-muted-foreground">
                        {aiActionNote ? (
                          <span>{aiActionNote}</span>
                        ) : (
                          <span>Ask the AI for its next action to see a summary here.</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tiles-only Map (Generated) */}
                  {debugTiles && (
                    <div className="mt-4">
                      <div className="text-sm font-medium mb-2">Tiles Map (generated)</div>
                      <div className="max-h-[600px] max-w-full overflow-auto border-2 border-slate-300 dark:border-slate-700 rounded-lg p-3 bg-slate-100 dark:bg-slate-900 shadow-inner">
                        <TilesPreview tiles={debugTiles} cellSize={6} />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={() => {
                        if (exitPlaceMode) { setExitPlaceMode(false); return; }
                        if (exitBlock) { setExitBlock(null); setExitPlaceMode(true); return; }
                        setExitPlaceMode(true);
                      }}
                      variant={exitPlaceMode ? "destructive" : exitBlock ? "secondary" : "default"}
                      className={!exitPlaceMode && !exitBlock ? "bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white" : ""}
                    >
                      {exitPlaceMode ? '❌ Cancel' : exitBlock ? '🔄 Replace Exit' : '🚪 Place Exit'}
                    </Button>
                    {exitBlock && (
                      <Button variant="outline" onClick={() => setExitBlock(null)}>
                        🗑️ Remove Exit
                      </Button>
                    )}
                    <Button
                      onClick={() => {
                        if (agentPlaceMode) { setAgentPlaceMode(false); return; }
                        setAgentPlaceMode(true);
                      }}
                      variant={agentPlaceMode ? "destructive" : "default"}
                      className={!agentPlaceMode ? "bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white" : ""}
                    >
                      {agentPlaceMode ? '❌ Cancel' : agentBlock ? '🎯 Move Agent' : '🧙 Place Agent'}
                    </Button>
                    <Button
                      onClick={async () => {
                        // single-step pathfind toward exit (local or Foundry)
                        if (!agentBlock || !exitBlock) return;
                        const step = COARSE_STEP;
                        const ax = Math.floor(agentBlock.x / step), ay = Math.floor(agentBlock.y / step);
                        const tx = Math.floor(exitBlock.x / step), ty = Math.floor(exitBlock.y / step);
                        let path = plannedPath;
                        if (!path || path[path.length - 1]?.x !== tx || path[path.length - 1]?.y !== ty || path[0]?.x !== ax || path[0]?.y !== ay) {
                          path = findPathCoarseToTarget(gridData, GRID_SIZE, ax, ay, tx, ty, step);
                          setPlannedPath(path);
                        }
                  
                  if (path && path.length > 1) {
                    const next = path[1];
                    const newBlockX = next.x * step;
                    const newBlockY = next.y * step;
                    
                    // If connected to Foundry, validate and move there; otherwise, do local move
                    if (clientId) {
                      // Validate the move with Foundry before executing
                      const agentPixelX = agentBlock.x * CELL_PIXELS + Math.floor(step * CELL_PIXELS / 2);
                      const agentPixelY = agentBlock.y * CELL_PIXELS + Math.floor(step * CELL_PIXELS / 2);
                      const nextPixelX = newBlockX * CELL_PIXELS + Math.floor(step * CELL_PIXELS / 2);
                      const nextPixelY = newBlockY * CELL_PIXELS + Math.floor(step * CELL_PIXELS / 2);

                      try {
                        const validationResult = await checkPath({
                          clientId,
                          fromX: agentPixelX,
                          fromY: agentPixelY,
                          toX: nextPixelX,
                          toY: nextPixelY,
                        });

                        if (validationResult.blocked) {
                          console.log('Move blocked by Foundry, invalidating path');
                          setPlannedPath(null);
                          return;
                        }

                        // Move is valid, proceed locally and in Foundry
                        setAgentBlock({ x: newBlockX, y: newBlockY });
                        setPlannedPath(path.slice(1));

                        // Send movement to Foundry (top-left corner expected)
                        if (agentTokenUuid) {
                          const moveX = newBlockX * CELL_PIXELS;
                          const moveY = newBlockY * CELL_PIXELS;
                          await moveEntities({ 
                            clientId, 
                            uuids: [agentTokenUuid], 
                            selected: false,
                            x: moveX, 
                            y: moveY 
                          });
                        }
                      } catch (e: any) {
                        console.error('Failed to validate or move:', e);
                      }
                    } else {
                      // Local mode: move without external validation
                      setAgentBlock({ x: newBlockX, y: newBlockY });
                      setPlannedPath(path.slice(1));
                    }
                        }
                      }}
                      disabled={!agentBlock || !exitBlock || (!clientId && !generatedMap)}
                      className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white col-span-2"
                    >
                      🧭 Pathfind to Exit (1 Step)
                    </Button>
                    <Button
                      onClick={async () => {
                        if (!agentBlock || !clientId) return;
                        setValidMovesLoading(true);
                  try {
                    const step = 10;
                    // Get agent's current position in pixels
                    const agentPixelX = agentBlock.x * CELL_PIXELS + Math.floor(step * CELL_PIXELS / 2);
                    const agentPixelY = agentBlock.y * CELL_PIXELS + Math.floor(step * CELL_PIXELS / 2);
                    
                    const result = await getValidMoves({
                      clientId,
                      fromX: agentPixelX,
                      fromY: agentPixelY,
                      maxDistance: 1000, // Check moves within 1000 pixels
                      gridSize: step * CELL_PIXELS, // 100 pixels = 1 grid square
                    });
                    
                    if (result.error) {
                      console.error('Error getting valid moves:', result.error);
                    } else {
                      setValidMoves(result.validMoves);
                    }
                    } catch (e: any) {
                      console.error('Failed to get valid moves:', e);
                    } finally {
                      setValidMovesLoading(false);
                    }
                      }}
                      disabled={!agentBlock || !clientId || validMovesLoading}
                      variant="secondary"
                      className="col-span-2"
                    >
                      {validMovesLoading ? '⏳ Finding...' : '🔍 Find Valid Paths'}
                    </Button>
                    {validMoves && validMoves.length > 0 && (
                      <Button
                        variant="outline"
                        onClick={() => setValidMoves(null)}
                        className="col-span-2"
                      >
                        🧹 Clear Valid Paths ({validMoves.length})
                      </Button>
                    )}
                  </div>
                  {/* Turn Log */}
                  {turnLog.length > 0 && (
                    <div className="mt-4 border rounded-lg bg-background">
                      <div className="px-3 py-2 text-sm font-medium border-b">Turn Log</div>
                      <div className="max-h-60 overflow-auto p-2 space-y-1 text-sm">
                        {turnLog.map((l, i) => (
                          <div key={i} className="text-muted-foreground">{l}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Turn Summary (outside map module) */}
            <Card className="border-2 shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-2xl">🎬</span>
                  Turn Summary
                </CardTitle>
                <CardDescription>What the active character did this turn</CardDescription>
              </CardHeader>
              <CardContent>
                {turnSummary ? (
                  <div className="p-1 text-sm space-y-2">
                    <div><span className="text-muted-foreground">Actor:</span> <span className="font-medium">{turnSummary.actorName}</span></div>
                    <div><span className="text-muted-foreground">Moved:</span> {turnSummary.movedSquares} square(s)</div>
                    <div className="text-xs text-muted-foreground">From ({turnSummary.from.x}, {turnSummary.from.y}) → To ({turnSummary.to.x}, {turnSummary.to.y})</div>
                    <div><span className="text-muted-foreground">Action:</span> <span className="uppercase font-medium">{turnSummary.action}</span></div>
                    {turnSummary.attack && (
                      <div className="rounded border p-2 bg-muted/30">
                        <div className="font-medium">Attack vs {turnSummary.attack.targetName}</div>
                        <div className="text-xs text-muted-foreground">d20 {turnSummary.attack.d20} + total {turnSummary.attack.total} vs AC {turnSummary.attack.ac}</div>
                        <div className="text-sm">{turnSummary.attack.hit ? `Hit${turnSummary.attack.crit ? ' (CRIT)' : ''} for ${turnSummary.attack.dmg}` : 'Miss'}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No turn taken yet.</div>
                )}
              </CardContent>
            </Card>

            <Card className="border-2 shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-2xl">↔️</span>
                  Move Entities
                </CardTitle>
                <CardDescription>
                  Move tokens and entities to specific coordinates
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">X (pixels)</label>
                    <Input value={moveX} onChange={(e) => setMoveX(e.target.value)} placeholder="e.g. 1200" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Y (pixels)</label>
                    <Input value={moveY} onChange={(e) => setMoveY(e.target.value)} placeholder="e.g. 640" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">UUIDs (comma-separated)</label>
                  <Input 
                    value={moveUuids} 
                    onChange={(e) => setMoveUuids(e.target.value)} 
                    placeholder="Scene.<sceneId>.Token.<tokenId>, ..." 
                    className="font-mono text-xs"
                  />
                </div>
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
                  <input 
                    id="move-selected" 
                    type="checkbox" 
                    checked={moveSelected} 
                    onChange={(e) => setMoveSelected(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="move-selected" className="text-sm cursor-pointer">
                    Apply to currently selected entities
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <Button 
                    onClick={onMoveEntities} 
                    disabled={moveLoading || !clientId}
                    className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white"
                  >
                    {moveLoading ? '⏳ Moving…' : '🎯 Move Entities'}
                  </Button>
                  {moveError && (
                    <span className="text-sm text-red-600 bg-red-50 dark:bg-red-950/20 px-3 py-1 rounded-md">
                      {moveError}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Character Sheet Demo */}
            <Card className="border-2 shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-2xl">📜</span>
                  Character Sheet (DnD 5e)
                </CardTitle>
                <CardDescription>
                  Local character data model with abilities, HP, AC, skills, and attacks
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-[1fr,auto] gap-4 items-start">
                  <CharacterSheet character={sheetChar} onUpdate={setSheetChar} />
                  <div className="space-y-2">
                    <Button onClick={() => setSheetChar(createBlankCharacter())} className="w-full">New Fighter</Button>
                    <Button onClick={() => {
                      const rogue = buildCharacter({
                        name: 'Shadow', role: 'pc', className: 'Rogue', level: 3, ac: 15,
                        abilityScores: { dex: 18, str: 10, con: 12, int: 12, wis: 10, cha: 14 }, hp: { max: 22 },
                        attacks: [
                          { name: 'Rapier', ability: 'dex', proficient: true, damage: '1d8+4', damageType: 'piercing', description: 'Sneak Attack +2d6 when applicable' },
                          { name: 'Shortbow', ability: 'dex', proficient: true, damage: '1d6+4', damageType: 'piercing', range: '80/320 ft' },
                        ],
                        skills: { stealth: { proficient: true, expertise: true }, acrobatics: { proficient: true }, perception: { proficient: true } },
                        features: ['Sneak Attack (2d6)', 'Cunning Action'],
                        traits: ['Darkvision 60 ft'],
                      });
                      setSheetChar(rogue);
                    }} variant="secondary" className="w-full">New Rogue</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Combat Module */}
            <div className="border-2 rounded-lg p-6 bg-card shadow-md">
              <CombatModule sceneEntities={sceneEntitiesResult} clientId={clientId} />
            </div>
          </div>
          
          {/* Individual Fetch Options - Right Side */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="border-2 shadow-md sticky top-8">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <span className="text-xl">⚙️</span>
                  Quick Actions
                </CardTitle>
                <CardDescription className="text-xs">
                  Individual data fetch options
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button 
                  onClick={getClients} 
                  disabled={isLoading} 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start text-sm hover:bg-blue-50 dark:hover:bg-blue-950/20"
                >
                  {isLoading ? '⏳ Loading…' : '📡 Get Clients'}
                </Button>
                
                <div className="pt-2 border-t">
                  <Button 
                    onClick={fetchRolls} 
                    disabled={rollsLoading || !clientId} 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start text-sm hover:bg-purple-50 dark:hover:bg-purple-950/20"
                  >
                    {rollsLoading ? '⏳ Loading…' : '🎲 Get Rolls'}
                  </Button>
                  {rollsError && (
                    <p className="text-xs text-red-600 mt-1 px-2">{rollsError}</p>
                  )}
                </div>
                
                <div className="pt-2 border-t">
                  <Button 
                    onClick={fetchEncounters} 
                    disabled={encountersLoading || !clientId} 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start text-sm hover:bg-orange-50 dark:hover:bg-orange-950/20"
                  >
                    {encountersLoading ? '⏳ Loading…' : '⚔️ Get Encounters'}
                  </Button>
                  {encountersError && (
                    <p className="text-xs text-red-600 mt-1 px-2">{encountersError}</p>
                  )}
                </div>
                
                <div className="pt-2 border-t">
                  <Button 
                    onClick={fetchScenes} 
                    disabled={scenesLoading || !clientId} 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start text-sm hover:bg-green-50 dark:hover:bg-green-950/20"
                  >
                    {scenesLoading ? '⏳ Loading…' : '🎬 Get Scenes'}
                  </Button>
                  {scenesError && (
                    <p className="text-xs text-red-600 mt-1 px-2">{scenesError}</p>
                  )}
                </div>
                
                <div className="pt-2 border-t">
                  <Button 
                    onClick={fetchSceneEntities} 
                    disabled={sceneEntitiesLoading || !clientId} 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start text-sm hover:bg-cyan-50 dark:hover:bg-cyan-950/20"
                  >
                    {sceneEntitiesLoading ? '⏳ Loading…' : '👥 Get Entities'}
                  </Button>
                  {sceneEntitiesError && (
                    <p className="text-xs text-red-600 mt-1 px-2">{sceneEntitiesError}</p>
                  )}
                </div>
                
                <div className="pt-2 border-t">
                  <Button 
                    onClick={fetchWalls} 
                    disabled={wallsLoading || !clientId} 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start text-sm hover:bg-red-50 dark:hover:bg-red-950/20"
                  >
                    {wallsLoading ? '⏳ Loading…' : '🧱 Get Walls'}
                  </Button>
                  {wallsError && (
                    <p className="text-xs text-red-600 mt-1 px-2">{wallsError}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      {/* Character Sheet Dialog */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Character Sheet</DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            <CharacterSheet character={sheetChar} onUpdate={setSheetChar} />
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}

function TilesPreview({ tiles, cellSize = 6 }: { tiles: number[][]; cellSize?: number }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const h = tiles.length;
    const w = tiles[0]?.length || 0;
    canvas.width = w * cellSize;
    canvas.height = h * cellSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    // determine floor value (most common non-zero)
    const counts = new Map<number, number>();
    for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) { const v = tiles[y][x] ?? 0; counts.set(v, (counts.get(v) || 0) + 1); } }
    let floor = 1, best = -1;
    for (const [v, c] of counts) { if (v !== 0 && c > best) { floor = v; best = c; } }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = tiles[y][x] ?? 0;
        const isFloor = v === floor;
        ctx.fillStyle = isFloor ? '#0ea5e9' : '#0f172a'; // cyan for floor, slate for empty
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
  }, [tiles, cellSize]);
  return <canvas ref={canvasRef} style={{ imageRendering: 'pixelated' as any }} />;
}

function safeParseGraph(text: string): Record<string, string[]> | undefined {
  try {
    const obj = text ? JSON.parse(text) : undefined;
    if (!obj || typeof obj !== 'object') return undefined;
    return obj as Record<string, string[]>;
  } catch {
    return undefined;
  }
}


