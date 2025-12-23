'use client';

import { useState, useCallback } from 'react';
import { generateLocalDungeon } from '@/utils/mapGenerator';
import { GRID_SIZE, CELL_PIXELS, COARSE_STEP } from '@/utils/constants';

type GeneratorMode = 'local' | 'hto' | 'graph';

/**
 * Hook for managing map generation
 */
export function useMapGeneration(
  setWallsResult: React.Dispatch<React.SetStateAction<any | null>>,
  setSceneEntitiesResult: React.Dispatch<React.SetStateAction<any | null>>,
  setAgentBlock: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>,
  setExitBlock: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>,
  setGeneratedMap: React.Dispatch<React.SetStateAction<boolean>>,
  setDebugTiles: React.Dispatch<React.SetStateAction<number[][] | null>>,
) {
  const [generatorMode, setGeneratorMode] = useState<GeneratorMode>('local');
  const [graphText, setGraphText] = useState<string>('');

  const safeParseGraph = useCallback((text: string): Record<string, string[]> | undefined => {
    try {
      const obj = text ? JSON.parse(text) : undefined;
      if (!obj || typeof obj !== 'object') return undefined;
      return obj as Record<string, string[]>;
    } catch {
      return undefined;
    }
  }, []);

  const initializeGame = useCallback(async () => {
    let walls: any[] = [];
    let tokens: any[] = [];
    let playerBlock: any;
    let exitBlock: any;

    if (generatorMode === 'hto' || generatorMode === 'graph') {
      const seedStr = `${generatorMode}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
      const res = await fetch('/api/dungeon/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: generatorMode,
          gridSize: GRID_SIZE,
          cellPixels: CELL_PIXELS,
          step: COARSE_STEP,
          seed: seedStr,
          graph: generatorMode === 'graph' ? safeParseGraph(graphText) : undefined,
        }),
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || 'generation failed');
      walls = json.map.walls;
      tokens = json.map.tokens;
      playerBlock = json.map.playerBlock;
      exitBlock = json.map.exitBlock;
      setDebugTiles(json.tiles);
    } else {
      const res = generateLocalDungeon({ 
        gridSize: GRID_SIZE, 
        cellPixels: CELL_PIXELS, 
        step: COARSE_STEP 
      });
      walls = res.walls;
      tokens = res.tokens;
      playerBlock = res.playerBlock;
      exitBlock = res.exitBlock;
      setDebugTiles(null);
    }

    setWallsResult({ walls, sceneId: 'generated', sceneUuid: 'generated' });
    setSceneEntitiesResult({
      scene: {
        id: 'generated',
        uuid: 'generated-scene',
        name: generatorMode === 'hto' 
          ? 'Generated Dungeon (HTO)' 
          : generatorMode === 'graph' 
          ? 'Generated Dungeon (Graph)' 
          : 'Generated Dungeon',
        width: GRID_SIZE * CELL_PIXELS,
        height: GRID_SIZE * CELL_PIXELS,
        grid: { size: COARSE_STEP * CELL_PIXELS, distance: 5, units: 'ft' }
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
  }, [
    generatorMode,
    graphText,
    safeParseGraph,
    setWallsResult,
    setSceneEntitiesResult,
    setAgentBlock,
    setExitBlock,
    setGeneratedMap,
    setDebugTiles,
  ]);

  return {
    generatorMode,
    setGeneratorMode,
    graphText,
    setGraphText,
    initializeGame,
  };
}

