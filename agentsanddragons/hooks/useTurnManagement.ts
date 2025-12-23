'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import type { GetSceneEntitiesResponse } from '@/app/actions/scenes';
import { executeTurn } from '@/utils/turnEngine';
import { GRID_SIZE, CELL_PIXELS, COARSE_STEP } from '@/utils/constants';
import { calculateAbilityModifier } from '@/utils/dnd5e';
import type { GridCell } from '@/utils/pathfinding';

interface TurnOrderEntry {
  id: string;
  name: string;
  hp: number;
  hpMax: number;
  token: any;
  initiative: number;
}

interface TurnSummary {
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
}

/**
 * Hook for managing turn order and turn execution
 */
export function useTurnManagement(
  sceneEntitiesResult: GetSceneEntitiesResponse | null,
  gridData: GridCell[][] | null,
  setSceneEntitiesResult: React.Dispatch<React.SetStateAction<GetSceneEntitiesResponse | null>>,
) {
  const [currentTurnId, setCurrentTurnId] = useState<string | null>(null);
  const [turnLog, setTurnLog] = useState<string[]>([]);
  const [turnSummary, setTurnSummary] = useState<TurnSummary | null>(null);

  const turnOrder = useMemo(() => {
    const tokens = sceneEntitiesResult?.tokens || [];
    const entries: TurnOrderEntry[] = tokens.map(t => {
      const abilities = t?.actor?.system?.abilities || {};
      const attrs = t?.actor?.system?.attributes || {};
      const hp = attrs?.hp?.value ?? 0;
      const hpMax = attrs?.hp?.max ?? hp;
      const initBonusRaw = attrs?.init?.bonus;
      const initBonus = typeof initBonusRaw === 'number' 
        ? initBonusRaw 
        : (typeof initBonusRaw === 'string' ? parseInt(initBonusRaw) : 0);
      const dexMod = calculateAbilityModifier(abilities?.dex?.value ?? 10);
      const initiative = initBonus || dexMod;
      return {
        id: t.uuid || t.id || '',
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
  useEffect(() => {
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

  const appendLog = useCallback((s: string) => {
    setTurnLog(prev => [s, ...prev].slice(0, 50));
  }, []);

  const goNextTurn = useCallback(() => {
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
        step: COARSE_STEP,
      });
      setSceneEntitiesResult(prev => prev ? ({ ...prev, tokens: res.tokens }) : prev);
      setTurnLog(prev => [...res.log, ...prev].slice(0, 50));
      setTurnSummary(res.summary || null);
    }
    const next = turnOrder[(idx >= 0 ? (idx + 1) % turnOrder.length : 0)];
    setCurrentTurnId(next.id);
  }, [turnOrder, currentTurnId, sceneEntitiesResult, gridData, setSceneEntitiesResult]);

  return {
    turnOrder,
    currentTurnId,
    setCurrentTurnId,
    turnLog,
    turnSummary,
    goNextTurn,
    appendLog,
  };
}

