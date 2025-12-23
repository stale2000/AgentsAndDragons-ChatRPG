'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { makeRoll } from '@/app/actions/rolls_action';
import { requestAiTurn } from '@/app/actions/ai_turn';
import { findPathCoarse } from '@/utils/pathfinding';
import { findTokenAtCoarse, getCoarseBlock, isAdjacentCoarse } from '@/utils/ai/behavior';
import type { TokenEntity, GetSceneEntitiesResponse } from '@/app/actions/scenes';
import type { FoundryActor } from '@/types/foundry-vtt';

// Combat Module Types
interface AbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

interface CharacterAction {
  id: string;
  name: string;
  type: 'action' | 'bonus_action' | 'reaction' | 'legendary';
  description: string;
  attackBonus?: number;
  damage?: string;
  damageType?: string;
  range?: string;
  saveDC?: number;
  saveAbility?: string;
  itemUuid?: string; // Foundry item UUID for rolling
}

interface CombatCharacter {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  ac: number;
  initiative: number;
  abilityScores: AbilityScores;
  proficiencyBonus: number;
  speed: number;
  actions: CharacterAction[];
  conditions: string[];
  uuid?: string; // Foundry UUID for linking back to the token
}

interface CombatModuleProps {
  sceneEntities?: GetSceneEntitiesResponse | null;
  clientId?: string | null;
}

export default function CombatModule({ sceneEntities, clientId }: CombatModuleProps) {
  // Combat Module State
  const [combatCharacters, setCombatCharacters] = React.useState<CombatCharacter[]>([]);
  const [debugData, setDebugData] = React.useState<any>(null);
  const [rollingAction, setRollingAction] = React.useState<string | null>(null);
  const [lastRollResult, setLastRollResult] = React.useState<any>(null);
  const [thinkingAiFor, setThinkingAiFor] = React.useState<string | null>(null);

  // Combat Module Functions
  const calculateAbilityModifier = (score: number): number => Math.floor((score - 10) / 2);

  const deleteCharacter = (id: string) => {
    setCombatCharacters(prev => prev.filter(c => c.id !== id));
  };

  const updateCharacterHp = (id: string, newHp: number) => {
    setCombatCharacters(prev => prev.map(c => 
      c.id === id ? { ...c, hp: Math.max(0, Math.min(newHp, c.maxHp)) } : c
    ));
  };

  const importFromScene = () => {
    if (!sceneEntities?.tokens || sceneEntities.tokens.length === 0) {
      return;
    }

    // Store debug data
    setDebugData({
      timestamp: new Date().toISOString(),
      tokenCount: sceneEntities.tokens.length,
      tokens: sceneEntities.tokens,
      firstTokenSample: sceneEntities.tokens[0],
    });

    const newCharacters: CombatCharacter[] = sceneEntities.tokens.map((token: TokenEntity) => {
      // Extract stats from token.actor.system.attributes (Foundry structure)
      const actorData = token.actor as FoundryActor | undefined;
      const attributes = actorData?.system?.attributes;
      const abilities = actorData?.system?.abilities;
      
      // HP
      const hp = attributes?.hp?.value ?? 20;
      const maxHp = attributes?.hp?.max ?? hp;
      
      // AC (can be flat value or calculated)
      const ac = attributes?.ac?.value ?? attributes?.ac?.flat ?? 10;
      
      // Speed (walk speed is default)
      const speed = attributes?.movement?.walk ?? 30;
      
      // Initiative bonus
      const initBonus = attributes?.init?.bonus ? parseInt(attributes.init.bonus) : 0;
      
      // Ability scores
      const abilityScores = {
        strength: abilities?.str?.value ?? 10,
        dexterity: abilities?.dex?.value ?? 10,
        constitution: abilities?.con?.value ?? 10,
        intelligence: abilities?.int?.value ?? 10,
        wisdom: abilities?.wis?.value ?? 10,
        charisma: abilities?.cha?.value ?? 10,
      };
      
      // Process items into actions
      const items = actorData?.items || [];
      const actions: CharacterAction[] = items
        .filter((item) => {
          // Include weapons, feats, and spells
          // Also include class features if they have activation or are combat-relevant
          const isWeapon = item.type === 'weapon';
          const isFeat = item.type === 'feat';
          const isSpell = item.type === 'spell';
          const hasActivation = item.system?.activation?.type;
          const hasDamage = item.system?.damage?.base || item.system?.damage?.parts;
          
          // Include weapons, feats with activation, or any item with damage/activation
          return (isWeapon || isFeat || isSpell) && (hasActivation || hasDamage || isWeapon);
        })
        .map((item) => {
          // Map activation type to our action type
          let actionType: 'action' | 'bonus_action' | 'reaction' | 'legendary' = 'action';
          const activationType = item.system?.activation?.type;
          if (activationType === 'bonus') actionType = 'bonus_action';
          else if (activationType === 'reaction') actionType = 'reaction';
          else if (activationType === 'legendary') actionType = 'legendary';
          
          // Extract attack bonus
          const attackBonus = item.system?.attack?.bonus ? 
            parseInt(item.system.attack.bonus) : undefined;
          
          // Extract damage - handle both formats
          let damage: string | undefined;
          let damageType: string | undefined;
          
          // Try damage.parts format first (old format)
          const damageParts = item.system?.damage?.parts || [];
          if (damageParts.length > 0) {
            damage = damageParts[0][0];
            damageType = damageParts[0][1];
          } 
          // Try damage.base format (newer format)
          else if (item.system?.damage?.base) {
            const base = item.system.damage.base;
            if (base.custom?.enabled && base.custom?.formula) {
              damage = base.custom.formula;
            } else if (base.number && base.denomination) {
              damage = `${base.number}d${base.denomination}`;
            }
            damageType = base.types?.[0] || undefined;
          }
          
          // Extract range - handle both value and reach
          let range = '';
          const rangeData = item.system?.range;
          if (rangeData?.value) {
            range = `${rangeData.value} ${rangeData.units || 'ft'}`;
          } else if (rangeData?.reach) {
            range = `${rangeData.reach} ${rangeData.units || 'ft'} (reach)`;
          }
          
          // Extract save DC
          const saveDC = item.system?.save?.dc;
          const saveAbility = item.system?.save?.ability;
          
          // Strip HTML from description
          const description = item.system?.description?.value?.replace(/<[^>]*>/g, '') || '';
          
          // Construct item UUID if we have the character's uuid
          let itemUuid: string | undefined;
          if (token.uuid && item._id) {
            // Format: Scene.xxx.Token.xxx.Actor.xxx.Item.xxx OR Actor.xxx.Item.xxx
            if (token.uuid.includes('.Actor.')) {
              itemUuid = `${token.uuid}.Item.${item._id}`;
            } else {
              itemUuid = `${token.uuid}.Item.${item._id}`;
            }
          }
          
          return {
            id: item._id || `action-${Date.now()}-${Math.random()}`,
            name: item.name || 'Unnamed Action',
            type: actionType,
            description: description.substring(0, 200), // Limit description length
            attackBonus,
            damage,
            damageType,
            range,
            saveDC,
            saveAbility,
            itemUuid,
          };
        });
      
      return {
        id: token.uuid || `char-${Date.now()}-${Math.random()}`,
        name: token.name || actorData?.name || 'Unknown Entity',
        hp,
        maxHp,
        ac,
        initiative: initBonus,
        proficiencyBonus: 2, // Default, could calculate from actor level
        speed,
        abilityScores,
        actions,
        conditions: [],
        uuid: token.uuid,
      };
    });

    // Filter out any characters that are already imported (by uuid)
    const existingUuids = new Set(combatCharacters.map(c => c.uuid).filter(Boolean));
    const charactersToAdd = newCharacters.filter(char => !existingUuids.has(char.uuid));
    
    if (charactersToAdd.length > 0) {
      setCombatCharacters(prev => [...prev, ...charactersToAdd]);
    }
  };

  const clearAllCharacters = () => {
    setCombatCharacters([]);
  };

  const handleAttackRoll = async (character: CombatCharacter, action: CharacterAction) => {
    if (!clientId) {
      alert('No client ID available. Please load scene data first.');
      return;
    }

    // Build the attack formula
    let formula = '';
    if (action.attackBonus !== undefined) {
      // Attack roll: 1d20 + attack bonus
      formula = `1d20${action.attackBonus >= 0 ? '+' : ''}${action.attackBonus}`;
    } else if (action.damage) {
      // Just damage roll
      formula = action.damage;
    } else {
      // Default to d20 if no specific roll
      formula = '1d20';
    }

    setRollingAction(action.id);
    try {
      const result = await makeRoll({
        clientId,
        formula,
        flavor: `${character.name} - ${action.name} ${action.attackBonus !== undefined ? '(Attack Roll)' : ''}`,
        createChatMessage: true,
        speaker: character.uuid,
      });

      console.log('Roll result:', result);
      setLastRollResult(result);
    } catch (error: any) {
      console.error('Error making roll:', error);
      setLastRollResult({ success: false, error: error.message || 'Unknown error' });
    } finally {
      setRollingAction(null);
    }
  };

  const handleAiNextTurn = async (character: CombatCharacter) => {
    if (!clientId) {
      alert('No client ID available. Please load scene data first.');
      return;
    }
    if (!sceneEntities?.tokens || sceneEntities.tokens.length === 0) {
      alert('No scene tokens available.');
      return;
    }

    // Determine the actor index in the tokens list
    const tokens = sceneEntities.tokens;
    const actorIndex = Math.max(0, tokens.findIndex(t => t.uuid === character.uuid));

    setThinkingAiFor(character.id);
    try {
      // Extract grid info from sceneEntities if available
      const scene = sceneEntities?.scene;
      // Foundry grid.size is pixels per grid square; we use fine cells (10px per fine cell)
      // Default to match dndapidocs page constants: GRID_SIZE=500, CELL_PIXELS=10
      const sceneWidth = scene?.width ?? 5000; // Default scene width in pixels
      const gridSquareSize = scene?.grid?.size ?? 50; // Foundry grid square size in pixels
      const cellPixels = 10; // Fine cell size in pixels (matches dndapidocs)
      const gridSize = Math.floor(sceneWidth / cellPixels); // Total fine grid size
      
      const grid = scene?.grid?.size || scene?.width ? {
        gridSize: gridSize,
        cellPixels: cellPixels,
      } : null;
      
      const ai = await requestAiTurn({
        actor: { index: actorIndex, id: character.uuid },
        tokens: tokens as any,
        grid: grid,
        gridData: null, // TODO: Could fetch gridData if needed for wall-aware pathfinding
        hint: undefined,
      });

      if (!ai.success) {
        console.warn('AI turn request failed:', ai.error, ai.raw);
        return;
      }

      const action = ai.action as any;
      if (action.type === 'attack') {
        const step = 10; // coarse cell size in fine cells
        const cellPx = 10; // pixels per fine cell
        const actorToken = tokens[actorIndex];
        
        // Resolve target: either by index/id or by coordinates
        let targetToken: any = undefined;
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
            console.warn(`AI chose attack at coordinates (${targetX}, ${targetY}) but no token found there`);
            setDebugData((prev: any) => ({ ...(prev || {}), lastAiAction: { ...action, error: `No token at (${targetX}, ${targetY})` } }));
            return;
          }
          
          // Check if target is adjacent
          const actorBlock = getCoarseBlock(actorToken, cellPx, step);
          const targetBlock = getCoarseBlock(found.token, cellPx, step);
          
          if (!isAdjacentCoarse(actorBlock, targetBlock, step)) {
            console.warn(`AI chose attack at coordinates (${targetX}, ${targetY}) but target is not adjacent`);
            setDebugData((prev: any) => ({ ...(prev || {}), lastAiAction: { ...action, error: `Target at (${targetX}, ${targetY}) not adjacent` } }));
            return;
          }
          
          targetToken = found.token;
        } else {
          // Target by index/id (existing behavior)
          const tIdx: number | undefined = action.target?.index;
          const tId: string | undefined = action.target?.id;
          targetToken = (typeof tIdx === 'number' && tIdx >= 0 && tIdx < tokens.length)
            ? tokens[tIdx]
            : (tId ? tokens.find(t => t.uuid === tId) : undefined);

          if (!targetToken) {
            console.warn('AI chose attack but no valid target found:', action.target);
            return;
          }
        }

        // Choose an appropriate action for rolling (prefer weaponName if provided)
        const weaponName: string | undefined = action.weaponName;
        const byName = weaponName
          ? character.actions.find(a => a.attackBonus !== undefined && a.name?.toLowerCase().includes(weaponName.toLowerCase()))
          : undefined;
        const firstWeapon = character.actions.find(a => a.attackBonus !== undefined);
        const chosen = byName || firstWeapon;

        // Get target AC
        const targetAC = targetToken?.actor?.system?.attributes?.ac?.value ?? 
                        targetToken?.actor?.system?.attributes?.ac?.flat ?? 
                        'unknown';

        // Build roll request: prefer itemUuid if present, else formula using attackBonus
        const flavor = `AI Next Turn: ${character.name} attacks ${targetToken.name || 'target'}`;
        if (chosen?.itemUuid) {
          const result = await makeRoll({
            clientId,
            itemUuid: chosen.itemUuid,
            flavor,
            createChatMessage: true,
            speaker: character.uuid,
            target: targetToken.uuid,
          });
          setLastRollResult(result);
          
          // Log detailed attack results
          if (result?.success && result?.roll) {
            const roll = result.roll;
            const d20Die = roll.dice?.find((d: any) => d.faces === 20);
            const d20 = d20Die?.results?.[0]?.result ?? '?';
            const total = roll.total ?? '?';
            const isHit = typeof total === 'number' && typeof targetAC === 'number' && total >= targetAC;
            const isCrit = roll.isCritical ?? false;
            
            // Try to extract damage from rawData
            const damageRoll = result.rawData?.rawData?.data?.damageRoll || 
                             result.rawData?.data?.damageRoll ||
                             result.rawData?.damageRoll;
            const damage = damageRoll?.total ?? '?';
            
            if (isCrit) {
              console.log(`${flavor}: CRITICAL HIT! Roll: d20 ${d20} = ${total} (vs AC ${targetAC}) - Damage: ${damage}`);
            } else if (isHit) {
              console.log(`${flavor}: HIT! Roll: d20 ${d20} = ${total} (vs AC ${targetAC}) - Damage: ${damage}`);
            } else {
              console.log(`${flavor}: MISS! Roll: d20 ${d20} = ${total} (vs AC ${targetAC})`);
            }
          }
        } else {
          const bonus = chosen?.attackBonus ?? 0;
          const formula = `1d20${bonus >= 0 ? '+' : ''}${bonus}`;
          const result = await makeRoll({
            clientId,
            formula,
            flavor: `${flavor} (Attack Roll)`,
            createChatMessage: true,
            speaker: character.uuid,
            target: targetToken.uuid,
          });
          setLastRollResult(result);
          
          // Log detailed attack results
          if (result?.success && result?.roll) {
            const roll = result.roll;
            const d20Die = roll.dice?.find((d: any) => d.faces === 20);
            const d20 = d20Die?.results?.[0]?.result ?? '?';
            const total = roll.total ?? '?';
            const isHit = typeof total === 'number' && typeof targetAC === 'number' && total >= targetAC;
            const isCrit = roll.isCritical ?? false;
            
            if (isCrit) {
              console.log(`${flavor}: CRITICAL HIT! Roll: d20 ${d20} = ${total} (vs AC ${targetAC})`);
            } else if (isHit) {
              console.log(`${flavor}: HIT! Roll: d20 ${d20} = ${total} (vs AC ${targetAC})`);
            } else {
              console.log(`${flavor}: MISS! Roll: d20 ${d20} = ${total} (vs AC ${targetAC})`);
            }
          }
        }
      } else if (action.type === 'move' || action.type === 'dash' || action.type === 'wait') {
        if (action.type === 'wait') {
          setDebugData((prev: any) => ({ ...(prev || {}), lastAiAction: action }));
          return;
        }
        
        // Handle move/dash actions
        const actorToken = tokens[actorIndex];
        if (!actorToken) {
          console.warn('Actor token not found');
          return;
        }
        
        const step = 10; // coarse cell size in fine cells
        const cellPx = 10; // pixels per fine cell
        const sceneWidth = scene?.width ?? 5000;
        const gridSize = Math.floor(sceneWidth / cellPx);
        
        // Current coarse position
        const cellX = Math.floor((actorToken?.x ?? 0) / cellPx);
        const cellY = Math.floor((actorToken?.y ?? 0) / cellPx);
        const sx = Math.floor(cellX / step);
        const sy = Math.floor(cellY / step);
        
        // Destination goal
        const dest = action.destination;
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
        const movement = Number(actorToken?.actor?.system?.attributes?.movement?.walk ?? character.speed ?? 30);
        const squaresPerMove = Math.max(1, Math.floor(movement / 5));
        const maxSquares = action.type === 'dash' ? squaresPerMove * 2 : squaresPerMove;
        
        // Plan path using pathfinding with movement limit
        // Note: gridData is null here, so pathfinding will work without wall awareness
        const path = findPathCoarse(null, gridSize, sx, sy, goals, occupied, step, maxSquares);
        
        if (!path || path.length <= 1) {
          console.warn('AI chose move but no path available:', action);
          setDebugData((prev: any) => ({ ...(prev || {}), lastAiAction: { ...action, error: 'No path available' } }));
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
              
              // Update token position in sceneEntities
              // Note: This would require updating sceneEntities state, which may need to be handled differently
              // For now, log the movement
              const moved = path.length - 2;
              console.log(`AI moved ${moved} square(s) to (${prev.x}, ${prev.y})`);
              setDebugData((prev: any) => ({ ...(prev || {}), lastAiAction: { ...action, moved, destination: prev } }));
              return;
            }
          }
          console.warn('AI chose move but destination is occupied');
          setDebugData((prev: any) => ({ ...(prev || {}), lastAiAction: { ...action, error: 'Destination occupied' } }));
          return;
        }
        
        // Calculate distance moved (path length minus start position)
        const moved = path.length - 1;
        const newBlockX = destCoarse.x * step;
        const newBlockY = destCoarse.y * step;
        const newPxX = newBlockX * cellPx;
        const newPxY = newBlockY * cellPx;
        
        // Log the movement
        console.log(`AI ${action.type === 'dash' ? 'dashed' : 'moved'} ${moved} square(s) to (${destCoarse.x}, ${destCoarse.y})`);
        setDebugData((prev: any) => ({ ...(prev || {}), lastAiAction: { ...action, moved, destination: destCoarse } }));
        
        // TODO: Update token position in Foundry if clientId is available
        // This would require calling a Foundry API endpoint to update token position
      }
    } catch (e) {
      console.error('AI Next Turn error:', e);
    } finally {
      setThinkingAiFor(null);
    }
  };

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Combat Module</h2>
        <div className="flex gap-2">
          <Button 
            onClick={importFromScene} 
            disabled={!sceneEntities?.tokens || sceneEntities.tokens.length === 0}
            variant="default"
          >
            Import from Scene ({sceneEntities?.tokens?.length || 0})
          </Button>
          {combatCharacters.length > 0 && (
            <Button onClick={clearAllCharacters} variant="outline">
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Characters List */}
      {combatCharacters.length > 0 ? (
        <div className="space-y-3">
          {combatCharacters
            .sort((a, b) => b.initiative - a.initiative)
            .map(character => (
            <div key={character.id} className="rounded-lg border p-4 space-y-3 bg-muted/10">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{character.name}</h3>
                  <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                    <span>AC {character.ac}</span>
                    <span>Speed {character.speed} ft</span>
                    <span>Initiative {character.initiative >= 0 ? '+' : ''}{character.initiative}</span>
                    <span>Prof +{character.proficiencyBonus}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => deleteCharacter(character.id)}>Remove</Button>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handleAiNextTurn(character)}
                    disabled={!clientId || !sceneEntities?.tokens || thinkingAiFor === character.id}
                  >
                    {thinkingAiFor === character.id ? 'AI Thinking…' : 'AI Next Turn'}
                  </Button>
                </div>
              </div>

              {/* HP Bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Hit Points</span>
                  <span>{character.hp} / {character.maxHp}</span>
                </div>
                <div className="relative h-6 rounded bg-muted overflow-hidden">
                  <div 
                    className="absolute inset-y-0 left-0 bg-green-500 transition-all"
                    style={{ width: `${(character.hp / character.maxHp) * 100}%` }}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => updateCharacterHp(character.id, character.hp - 5)}>-5</Button>
                  <Button size="sm" variant="outline" onClick={() => updateCharacterHp(character.id, character.hp - 1)}>-1</Button>
                  <Button size="sm" variant="outline" onClick={() => updateCharacterHp(character.id, character.hp + 1)}>+1</Button>
                  <Button size="sm" variant="outline" onClick={() => updateCharacterHp(character.id, character.hp + 5)}>+5</Button>
                </div>
              </div>

              {/* Ability Scores */}
              <div className="grid grid-cols-6 gap-2">
                {Object.entries(character.abilityScores).map(([ability, score]) => (
                  <div key={ability} className="text-center rounded border p-2 bg-background">
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      {ability.slice(0, 3)}
                    </div>
                    <div className="text-lg font-bold">{score}</div>
                    <div className="text-xs text-muted-foreground">
                      {calculateAbilityModifier(score) >= 0 ? '+' : ''}{calculateAbilityModifier(score)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              {character.actions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Actions & Abilities ({character.actions.length})</h4>
                  <div className="space-y-2">
                    {character.actions.map(action => (
                      <div key={action.id} className="rounded border p-2 text-sm bg-background hover:bg-muted/30 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="font-semibold">{action.name}</div>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize whitespace-nowrap">
                                {action.type.replace('_', ' ')}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mb-1">
                              {action.range && <span>Range: {action.range}</span>}
                            </div>
                            {action.description && (
                              <div className="text-xs text-muted-foreground mb-1 line-clamp-2">
                                {action.description}
                              </div>
                            )}
                            <div className="text-xs font-mono space-y-0.5">
                              {action.attackBonus !== undefined && (
                                <div><span className="text-muted-foreground">Attack:</span> <span className="text-green-600 font-semibold">+{action.attackBonus}</span></div>
                              )}
                              {action.damage && (
                                <div><span className="text-muted-foreground">Damage:</span> <span className="font-semibold">{action.damage} {action.damageType}</span></div>
                              )}
                              {action.saveDC && (
                                <div><span className="text-muted-foreground">Save:</span> <span className="font-semibold">DC {action.saveDC} {action.saveAbility?.toUpperCase()}</span></div>
                              )}
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="default"
                            className="text-xs whitespace-nowrap self-start"
                            onClick={() => handleAttackRoll(character, action)}
                            disabled={!clientId || rollingAction === action.id}
                          >
                            {rollingAction === action.id ? 'Rolling...' : 'Use Action'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            {!sceneEntities?.tokens || sceneEntities.tokens.length === 0 
              ? 'No scene entities loaded. Click "Get All Scene Data" to load entities from Foundry.'
              : 'No characters imported. Click "Import from Scene" to add characters to combat.'}
          </div>
        )}

      {/* Last Roll Result Display */}
      {lastRollResult && (
        <div className="mt-6 border-t pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Last Roll Result</h3>
            <Button size="sm" variant="ghost" onClick={() => setLastRollResult(null)}>
              Clear
            </Button>
          </div>
          {lastRollResult.success && lastRollResult.roll ? (
            <div className="space-y-2">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Formula:</span>
                  <span className="text-lg font-mono">{lastRollResult.roll.formula}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Total:</span>
                  <span className="text-3xl font-bold">
                    {lastRollResult.roll.total}
                    {lastRollResult.roll.isCritical && ' 🎯'}
                    {lastRollResult.roll.isFumble && ' ☠️'}
                  </span>
                </div>
                {lastRollResult.roll.dice && lastRollResult.roll.dice.length > 0 && (
                  <div className="pt-2 border-t">
                    <span className="text-sm font-medium">Dice Rolls:</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {lastRollResult.roll.dice.map((die: any, idx: number) => (
                        <div key={idx} className="text-sm">
                          <span className="font-mono">d{die.faces}: </span>
                          {die.results.map((r: any, rIdx: number) => (
                            <span key={rIdx} className={`font-bold ${r.active ? '' : 'opacity-50'}`}>
                              {r.result}{rIdx < die.results.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  View Raw JSON
                </summary>
                <pre className="bg-muted p-3 rounded-md overflow-x-auto mt-2">
                  {JSON.stringify(lastRollResult, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
              <p className="font-medium">Error:</p>
              <p>{lastRollResult.error || 'Unknown error'}</p>
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer">View Raw Response</summary>
                <pre className="bg-muted p-3 rounded-md overflow-x-auto mt-2">
                  {JSON.stringify(lastRollResult, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}

      {/* Debug Data Display */}
      {debugData && (
        <div className="mt-6 border-t pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Import Debug Data</h3>
            <Button size="sm" variant="ghost" onClick={() => setDebugData(null)}>
              Clear Debug
            </Button>
          </div>
          <div className="space-y-2">
            <div className="text-sm">
              <span className="font-medium">Import Time:</span> {debugData.timestamp}
            </div>
            <div className="text-sm">
              <span className="font-medium">Tokens Found:</span> {debugData.tokenCount}
            </div>
            
            <div className="space-y-2">
              <div className="font-medium text-sm">First Token Sample:</div>
              <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-96 overflow-y-auto">
                {JSON.stringify(debugData.firstTokenSample, null, 2)}
              </pre>
            </div>
            
            <div className="space-y-2">
              <div className="font-medium text-sm">All Tokens (brief):</div>
              <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-64 overflow-y-auto">
                {JSON.stringify(
                  debugData.tokens.map((t: any) => ({
                    name: t.name,
                    uuid: t.uuid,
                    hasActor: !!t.actor,
                    actorName: t.actor?.name,
                    hasItems: !!t.actor?.items,
                    itemsCount: t.actor?.items?.length || 0,
                  })),
                  null,
                  2
                )}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
