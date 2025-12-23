'use client';

import { useState, useCallback } from 'react';
import { getSceneIds, getSceneEntities, getSceneWalls, type SceneListItem, type GetSceneEntitiesResponse } from '@/app/actions/scenes';
import type { FoundryRollsResponse } from '@/app/actions/rolls';
import type { GetEncountersResponse } from '@/app/actions/encounters';

/**
 * Hook for managing Foundry client connection state
 */
export function useFoundryClient() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [worldId, setWorldId] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const getClients = useCallback(async () => {
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
  }, []);

  return {
    clientId,
    worldId,
    isLoading,
    error,
    result,
    getClients,
    setClientId,
    setWorldId,
  };
}

/**
 * Hook for managing scene data (scenes, entities, walls)
 */
export function useSceneData(clientId: string | null) {
  const [scenesLoading, setScenesLoading] = useState(false);
  const [scenesError, setScenesError] = useState<string | null>(null);
  const [scenesResult, setScenesResult] = useState<SceneListItem[] | null>(null);
  
  const [sceneEntitiesLoading, setSceneEntitiesLoading] = useState(false);
  const [sceneEntitiesError, setSceneEntitiesError] = useState<string | null>(null);
  const [sceneEntitiesResult, setSceneEntitiesResult] = useState<GetSceneEntitiesResponse | null>(null);
  
  const [wallsLoading, setWallsLoading] = useState(false);
  const [wallsError, setWallsError] = useState<string | null>(null);
  const [wallsResult, setWallsResult] = useState<any | null>(null);

  const fetchScenes = useCallback(async () => {
    if (!clientId) {
      setScenesError('No clientId. Click "Get Foundry Clients" first.');
      return;
    }
    setScenesLoading(true);
    setScenesError(null);
    setScenesResult(null);
    try {
      const data = await getSceneIds({ clientId, worldId: undefined });
      setScenesResult(data);
    } catch (e: any) {
      setScenesError(e?.message || 'Failed to fetch scenes');
    } finally {
      setScenesLoading(false);
    }
  }, [clientId]);

  const fetchSceneEntities = useCallback(async () => {
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
  }, [clientId]);

  const fetchWalls = useCallback(async () => {
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
  }, [clientId]);

  const fetchAllSceneData = useCallback(async (worldId: string | null) => {
    setScenesLoading(true);
    setSceneEntitiesLoading(true);
    setWallsLoading(true);
    setScenesError(null);
    setSceneEntitiesError(null);
    setWallsError(null);
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
        fetchedClientId = json?.clients?.[0]?.id ?? null;
        fetchedWorldId = json?.clients?.[0]?.worldId ?? null;
      }
      
      if (!fetchedClientId) {
        throw new Error('No client ID found');
      }
      
      // Step 2: Fetch scenes, entities, and walls in parallel
      const [scenesData, entitiesData, wallsData] = await Promise.all([
        getSceneIds({ clientId: fetchedClientId, worldId: fetchedWorldId ?? undefined }),
        getSceneEntities({ clientId: fetchedClientId }),
        getSceneWalls({ clientId: fetchedClientId }),
      ]);
      
      setScenesResult(scenesData);
      setSceneEntitiesResult(entitiesData);
      setWallsResult(wallsData);
      
      return { clientId: fetchedClientId, worldId: fetchedWorldId };
    } catch (e: any) {
      const errorMsg = e?.message || 'Failed to fetch scene data';
      setScenesError(errorMsg);
      setSceneEntitiesError(errorMsg);
      setWallsError(errorMsg);
      throw e;
    } finally {
      setScenesLoading(false);
      setSceneEntitiesLoading(false);
      setWallsLoading(false);
    }
  }, []);

  return {
    scenesLoading,
    scenesError,
    scenesResult,
    fetchScenes,
    sceneEntitiesLoading,
    sceneEntitiesError,
    sceneEntitiesResult,
    setSceneEntitiesResult,
    fetchSceneEntities,
    wallsLoading,
    wallsError,
    wallsResult,
    setWallsResult,
    fetchWalls,
    fetchAllSceneData,
  };
}

/**
 * Hook for managing other API data (rolls, encounters)
 */
export function useApiData(clientId: string | null) {
  const [rollsLoading, setRollsLoading] = useState(false);
  const [rollsError, setRollsError] = useState<string | null>(null);
  const [rollsResult, setRollsResult] = useState<FoundryRollsResponse | null>(null);
  
  const [encountersLoading, setEncountersLoading] = useState(false);
  const [encountersError, setEncountersError] = useState<string | null>(null);
  const [encountersResult, setEncountersResult] = useState<GetEncountersResponse | null>(null);

  const fetchRolls = useCallback(async () => {
    if (!clientId) {
      setRollsError('No clientId. Click "Get Foundry Clients" first.');
      return;
    }
    setRollsLoading(true);
    setRollsError(null);
    setRollsResult(null);
    try {
      const { getRolls } = await import('@/app/actions/rolls');
      const data = await getRolls({ clientId, limit: 5 });
      setRollsResult(data);
    } catch (e: any) {
      setRollsError(e?.message || 'Failed to fetch rolls');
    } finally {
      setRollsLoading(false);
    }
  }, [clientId]);

  const fetchEncounters = useCallback(async () => {
    if (!clientId) {
      setEncountersError('No clientId. Click "Get Foundry Clients" first.');
      return;
    }
    setEncountersLoading(true);
    setEncountersError(null);
    setEncountersResult(null);
    try {
      const { getEncounters } = await import('@/app/actions/encounters');
      const data = await getEncounters({ clientId });
      setEncountersResult(data);
    } catch (e: any) {
      setEncountersError(e?.message || 'Failed to fetch encounters');
    } finally {
      setEncountersLoading(false);
    }
  }, [clientId]);

  return {
    rollsLoading,
    rollsError,
    rollsResult,
    fetchRolls,
    encountersLoading,
    encountersError,
    encountersResult,
    fetchEncounters,
  };
}

