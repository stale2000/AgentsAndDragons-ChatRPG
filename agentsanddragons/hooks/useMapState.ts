'use client';

import { useState, useMemo, useCallback } from 'react';
import type { GetSceneEntitiesResponse } from '@/app/actions/scenes';
import { GRID_SIZE, CELL_PIXELS, COARSE_STEP } from '@/utils/constants';
import type { GridCell } from '@/utils/pathfinding';

/**
 * Hook for managing grid data computation from scene entities and walls
 */
export function useGridData(
  sceneEntitiesResult: GetSceneEntitiesResponse | null,
  wallsResult: any | null,
) {
  const gridData = useMemo(() => {
    if (!sceneEntitiesResult && !wallsResult) return null;
    
    const makeRow = () => Array.from({ length: GRID_SIZE }, () => ({ 
      tokens: 0, 
      tiles: 0, 
      drawings: 0, 
      sounds: 0, 
      notes: 0, 
      walls: 0, 
      doors: 0 
    }));
    
    const grid: GridCell[][] = Array.from({ length: GRID_SIZE }, makeRow);
    
    const place = (x?: number, y?: number, kind?: keyof typeof grid[0][0]) => {
      if (x === undefined || y === undefined) return;
      const cx = Math.floor(x / CELL_PIXELS);
      const cy = Math.floor(y / CELL_PIXELS);
      if (cy >= 0 && cy < GRID_SIZE && cx >= 0 && cx < GRID_SIZE && kind) {
        (grid[cy][cx] as any)[kind] += 1;
      }
    };
    
    sceneEntitiesResult?.tokens?.forEach(t => place(t.x, t.y, 'tokens'));
    sceneEntitiesResult?.tiles?.forEach(t => place(t.x, t.y, 'tiles'));
    sceneEntitiesResult?.drawings?.forEach(d => place(d.x, d.y, 'drawings'));
    sceneEntitiesResult?.sounds?.forEach(s => place(s.x, s.y, 'sounds'));
    sceneEntitiesResult?.notes?.forEach(n => place(n.x, n.y, 'notes'));
    
    // Add walls: mark both endpoints and midpoint using Bresenham's algorithm
    const walls = wallsResult?.walls as undefined | Array<{ c: number[]; door?: number }>;
    
    const markCell = (cx: number, cy: number, isDoor: boolean) => {
      if (cy >= 0 && cy < GRID_SIZE && cx >= 0 && cx < GRID_SIZE) {
        grid[cy][cx].walls += 1;
        if (isDoor) {
          grid[cy][cx].doors += 1;
        }
      }
    };
    
    const bresenham = (x0: number, y0: number, x1: number, y1: number, isDoor: boolean) => {
      let cx0 = Math.floor(x0 / CELL_PIXELS);
      let cy0 = Math.floor(y0 / CELL_PIXELS);
      const cx1 = Math.floor(x1 / CELL_PIXELS);
      const cy1 = Math.floor(y1 / CELL_PIXELS);
      let dx = Math.abs(cx1 - cx0);
      const sx = cx0 < cx1 ? 1 : -1;
      let dy = -Math.abs(cy1 - cy0);
      const sy = cy0 < cy1 ? 1 : -1;
      let err = dx + dy;
      // Loop guard to avoid infinite loops
      let guard = GRID_SIZE * GRID_SIZE * 2;
      while (guard-- > 0) {
        markCell(cx0, cy0, isDoor);
        if (cx0 === cx1 && cy0 === cy1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; cx0 += sx; }
        if (e2 <= dx) { err += dx; cy0 += sy; }
      }
    };
    
    walls?.forEach(w => {
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

  return gridData;
}

/**
 * Hook for managing map state (agent block, exit block, paths, etc.)
 */
export function useMapState() {
  const [exitPlaceMode, setExitPlaceMode] = useState(false);
  const [exitBlock, setExitBlock] = useState<{ x: number; y: number } | null>(null);
  const [agentPlaceMode, setAgentPlaceMode] = useState(false);
  const [agentBlock, setAgentBlock] = useState<{ x: number; y: number } | null>(null);
  const [agentTokenUuid, setAgentTokenUuid] = useState<string | null>(null);
  const [plannedPath, setPlannedPath] = useState<{ x: number; y: number }[] | null>(null);
  const [validMoves, setValidMoves] = useState<Array<{ x: number; y: number }> | null>(null);
  const [validMovesLoading, setValidMovesLoading] = useState(false);
  const [generatedMap, setGeneratedMap] = useState(false);

  const resetMapState = useCallback(() => {
    setGeneratedMap(false);
    setExitBlock(null);
    setAgentBlock(null);
    setValidMoves(null);
    setPlannedPath(null);
  }, []);

  return {
    exitPlaceMode,
    setExitPlaceMode,
    exitBlock,
    setExitBlock,
    agentPlaceMode,
    setAgentPlaceMode,
    agentBlock,
    setAgentBlock,
    agentTokenUuid,
    setAgentTokenUuid,
    plannedPath,
    setPlannedPath,
    validMoves,
    setValidMoves,
    validMovesLoading,
    setValidMovesLoading,
    generatedMap,
    setGeneratedMap,
    resetMapState,
  };
}

