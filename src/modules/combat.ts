/**
 * Combat Module - Condition Management & Encounters
 * Handles D&D 5e conditions with duration tracking and encounter management
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { ConditionSchema, AbilitySchema, PositionSchema, SizeSchema, DamageTypeSchema, LightSchema, type Condition, type Ability } from '../types.js';
import { createBox, centerText, padText, BOX } from './ascii-art.js';

// Use AppData for persistent character storage (cross-session persistence)
const getDataDir = () => {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'rpg-lite-mcp');
  } else {
    // For macOS/Linux, use standard config directory
    return path.join(os.homedir(), '.config', 'rpg-lite-mcp');
  }
};

const DATA_ROOT = getDataDir();

// ============================================================
// SCHEMAS
// ============================================================

// Single condition operation
const singleConditionSchema = z.object({
  targetId: z.string(),
  encounterId: z.string().optional(),

  operation: z.enum(['add', 'remove', 'query', 'tick']),

  // For add/remove
  condition: ConditionSchema.optional(),
  source: z.string().optional(),
  duration: z.union([
    z.number(), // Rounds
    z.literal('concentration'),
    z.literal('until_dispelled'),
    z.literal('until_rest'),
    z.literal('save_ends'),
  ]).optional(),
  saveDC: z.number().optional(),
  saveAbility: AbilitySchema.optional(),

  // For exhaustion
  exhaustionLevels: z.number().min(1).optional(),

  // For tick
  roundNumber: z.number().optional(),
});

// Support both single and batch operations
export const manageConditionSchema = z.union([
  singleConditionSchema,
  z.object({
    batch: z.array(singleConditionSchema).min(1).max(20),
  }),
]);

export type ManageConditionInput = z.infer<typeof singleConditionSchema>;

// ============================================================
// CONDITION DATA
// ============================================================

// Mechanical effects that conditions can apply to character stats
interface ConditionEffect {
  // Stat multipliers (e.g., 0.5 = halved)
  maxHpMultiplier?: number;
  speedMultiplier?: number;

  // Stat modifiers (flat adjustments)
  maxHpModifier?: number;
  speedModifier?: number;
  acModifier?: number;

  // Ability score modifiers
  strModifier?: number;
  dexModifier?: number;
  conModifier?: number;
  intModifier?: number;
  wisModifier?: number;
  chaModifier?: number;

  // Advantage/disadvantage tracking
  disadvantageOn?: string[]; // e.g., ["ability_checks", "attack_rolls", "dex_saves"]
  advantageOn?: string[]; // e.g., ["stealth_checks"]

  // Auto-fail certain checks/saves
  autoFailSaves?: string[]; // e.g., ["str", "dex"]

  // Movement restrictions
  cannotMove?: boolean;
  canOnlyCrawl?: boolean;

  // Incapacitation
  incapacitated?: boolean;

  // Custom effects (for future extensibility)
  customEffects?: Record<string, number | string | boolean>;
}

interface ActiveCondition {
  condition: Condition | string; // Allow custom condition names
  description?: string; // Custom description (optional, falls back to CONDITION_EFFECTS)
  mechanicalEffects?: ConditionEffect; // Mechanical effects on stats
  source?: string;
  duration?: number | 'concentration' | 'until_dispelled' | 'until_rest' | 'save_ends';
  saveDC?: number;
  saveAbility?: Ability;
  exhaustionLevel?: number;
  roundsRemaining?: number;
}

// In-memory condition storage (per target)
const conditionStore = new Map<string, ActiveCondition[]>();

// D&D 5e Condition Effects
const CONDITION_EFFECTS: Record<Condition, string> = {
  blinded: "Can't see, auto-fails sight checks. Attacks have disadvantage, attacks against have advantage.",
  charmed: "Can't attack charmer or target with harmful abilities/effects. Charmer has advantage on social interactions.",
  deafened: "Can't hear, auto-fails hearing checks.",
  frightened: "Disadvantage on ability checks and attacks while source is visible. Can't willingly move closer to source.",
  grappled: "Speed becomes 0, can't benefit from speed bonuses. Ends if grappler is incapacitated or moved away.",
  incapacitated: "Can't take actions or reactions.",
  invisible: "Impossible to see without special sense. Heavily obscured for hiding. Attacks have advantage, attacks against have disadvantage.",
  paralyzed: "Incapacitated, can't move or speak. Auto-fails STR and DEX saves. Attacks have advantage. Melee hits within 5ft are auto-crits.",
  petrified: "Transformed to solid substance, incapacitated, can't move/speak, unaware. Weight x10. Auto-fails STR/DEX saves. Resistance to all damage. Immune to poison/disease.",
  poisoned: "Disadvantage on attack rolls and ability checks.",
  prone: "Only movement is crawling (costs extra). Attacks have disadvantage. Melee attacks against have advantage, ranged have disadvantage.",
  restrained: "Speed becomes 0, can't benefit from speed bonuses. Attacks have disadvantage. Attacks against have advantage. Disadvantage on DEX saves.",
  stunned: "Incapacitated, can't move, can speak only falteringly. Auto-fails STR and DEX saves. Attacks against have advantage.",
  unconscious: "Incapacitated, can't move/speak, unaware. Drops held items, falls prone. Auto-fails STR/DEX saves. Attacks have advantage. Melee hits within 5ft are auto-crits.",
  exhaustion: "Stacking penalty with 6 levels (see exhaustion table).",
};

// Exhaustion level effects
const EXHAUSTION_EFFECTS: Record<number, string> = {
  1: "Disadvantage on ability checks",
  2: "Speed halved",
  3: "Disadvantage on attack rolls and saving throws",
  4: "Hit point maximum halved",
  5: "Speed reduced to 0",
  6: "DEATH",
};

// ============================================================
// MECHANICAL EFFECTS: Built-in conditions
// ============================================================

/**
 * Get the mechanical effects for built-in D&D 5e conditions
 * Returns undefined for conditions with no mechanical stat effects
 */
function getBuiltInMechanicalEffects(condition: Condition | string, exhaustionLevel?: number): ConditionEffect | undefined {
  // Exhaustion has level-based effects
  if (condition === 'exhaustion' && exhaustionLevel) {
    const effects: ConditionEffect = {};

    // Level 1: Disadvantage on ability checks
    if (exhaustionLevel >= 1) {
      effects.disadvantageOn = ['ability_checks'];
    }

    // Level 2: Speed halved
    if (exhaustionLevel >= 2) {
      effects.speedMultiplier = 0.5;
    }

    // Level 3: Disadvantage on attack rolls and saving throws
    if (exhaustionLevel >= 3) {
      effects.disadvantageOn = [...(effects.disadvantageOn || []), 'attack_rolls', 'saving_throws'];
    }

    // Level 4: Hit point maximum halved
    if (exhaustionLevel >= 4) {
      effects.maxHpMultiplier = 0.5;
    }

    // Level 5: Speed reduced to 0
    if (exhaustionLevel >= 5) {
      effects.speedMultiplier = 0;
      effects.cannotMove = true;
    }

    // Level 6: DEATH (no mechanical effects to track, character is dead)
    if (exhaustionLevel >= 6) {
      effects.customEffects = { isDead: true };
    }

    return effects;
  }

  // Other conditions with mechanical effects
  const effects: ConditionEffect = {};

  switch (condition) {
    case 'poisoned':
      effects.disadvantageOn = ['attack_rolls', 'ability_checks'];
      break;

    case 'grappled':
    case 'restrained':
      effects.speedModifier = 0;
      effects.cannotMove = true;
      if (condition === 'restrained') {
        effects.disadvantageOn = ['attack_rolls', 'dex_saves'];
      }
      break;

    case 'prone':
      effects.canOnlyCrawl = true;
      effects.disadvantageOn = ['attack_rolls'];
      break;

    case 'paralyzed':
    case 'stunned':
    case 'unconscious':
      effects.incapacitated = true;
      effects.autoFailSaves = ['str', 'dex'];
      effects.cannotMove = true;
      break;

    case 'incapacitated':
      effects.incapacitated = true;
      break;

    case 'petrified':
      effects.incapacitated = true;
      effects.cannotMove = true;
      effects.autoFailSaves = ['str', 'dex'];
      break;

    default:
      // Conditions with no mechanical stat effects (blinded, charmed, deafened, frightened, invisible)
      return undefined;
  }

  return Object.keys(effects).length > 0 ? effects : undefined;
}

// ============================================================
// HELPER: Get Character Name from ID
// ============================================================

function getCharacterNameById(characterId: string): string | null {
  const dataDir = path.join(DATA_ROOT, 'characters');
  const filePath = path.join(dataDir, `${characterId}.json`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const character = JSON.parse(fileContent);
    return character.name || null;
  } catch {
    return null;
  }
}

// ============================================================
// PUBLIC API: Condition Effects for Character Stats
// ============================================================

/**
 * Get all active conditions for a character
 * Used by get_character to display condition-affected stats
 */
export function getActiveConditions(characterId: string): ActiveCondition[] {
  return conditionStore.get(characterId) || [];
}

/**
 * Calculate effective character stats after applying all active condition effects
 * Returns object with base values and effective values
 */
export function calculateEffectiveStats(characterId: string, baseStats: {
  maxHp: number;
  hp: number;
  speed: number;
  ac?: number;
}): {
  maxHp: { base: number; effective: number; modified: boolean };
  speed: { base: number; effective: number; modified: boolean };
  ac?: { base: number; effective: number; modified: boolean };
  conditionEffects: string[]; // Human-readable list of active effects
} {
  const conditions = getActiveConditions(characterId);
  const result = {
    maxHp: { base: baseStats.maxHp, effective: baseStats.maxHp, modified: false },
    speed: { base: baseStats.speed, effective: baseStats.speed, modified: false },
    ac: baseStats.ac ? { base: baseStats.ac, effective: baseStats.ac, modified: false } : undefined,
    conditionEffects: [] as string[],
  };

  // Apply each condition's mechanical effects
  for (const cond of conditions) {
    // Get mechanical effects (either custom or built-in)
    let effects = cond.mechanicalEffects;
    if (!effects && (cond.condition in CONDITION_EFFECTS || cond.condition === 'exhaustion')) {
      effects = getBuiltInMechanicalEffects(cond.condition, cond.exhaustionLevel);
    }

    if (!effects) continue;

    // Apply HP maximum modifier
    if (effects.maxHpMultiplier !== undefined) {
      result.maxHp.effective = Math.floor(result.maxHp.effective * effects.maxHpMultiplier);
      result.maxHp.modified = true;
      const condName = cond.condition === 'exhaustion'
        ? `Exhaustion ${cond.exhaustionLevel}`
        : String(cond.condition).charAt(0).toUpperCase() + String(cond.condition).slice(1);
      result.conditionEffects.push(`${condName}: HP max ×${effects.maxHpMultiplier}`);
    }
    if (effects.maxHpModifier !== undefined) {
      result.maxHp.effective += effects.maxHpModifier;
      result.maxHp.modified = true;
      result.conditionEffects.push(`HP max ${effects.maxHpModifier > 0 ? '+' : ''}${effects.maxHpModifier}`);
    }

    // Apply speed modifier
    if (effects.speedMultiplier !== undefined) {
      result.speed.effective = Math.floor(result.speed.effective * effects.speedMultiplier);
      result.speed.modified = true;
      const condName = cond.condition === 'exhaustion'
        ? `Exhaustion ${cond.exhaustionLevel}`
        : String(cond.condition).charAt(0).toUpperCase() + String(cond.condition).slice(1);
      result.conditionEffects.push(`${condName}: Speed ×${effects.speedMultiplier}`);
    }
    if (effects.speedModifier !== undefined) {
      result.speed.effective += effects.speedModifier;
      result.speed.modified = true;
      result.conditionEffects.push(`Speed ${effects.speedModifier > 0 ? '+' : ''}${effects.speedModifier}`);
    }
    if (effects.cannotMove) {
      result.speed.effective = 0;
      result.speed.modified = true;
    }

    // Apply AC modifier
    if (result.ac && effects.acModifier !== undefined) {
      result.ac.effective += effects.acModifier;
      result.ac.modified = true;
      result.conditionEffects.push(`AC ${effects.acModifier > 0 ? '+' : ''}${effects.acModifier}`);
    }

    // Track other effects (disadvantage, auto-fail, etc.)
    if (effects.disadvantageOn && effects.disadvantageOn.length > 0) {
      const condName = cond.condition === 'exhaustion'
        ? `Exhaustion ${cond.exhaustionLevel}`
        : String(cond.condition).charAt(0).toUpperCase() + String(cond.condition).slice(1);
      result.conditionEffects.push(`${condName}: Disadv. on ${effects.disadvantageOn.join(', ')}`);
    }
    if (effects.autoFailSaves && effects.autoFailSaves.length > 0) {
      result.conditionEffects.push(`Auto-fail ${effects.autoFailSaves.join(', ').toUpperCase()} saves`);
    }
    if (effects.incapacitated) {
      result.conditionEffects.push('Incapacitated');
    }
  }

  return result;
}

// ============================================================
// HANDLER
// ============================================================

export function manageCondition(input: ManageConditionInput | { batch: ManageConditionInput[] }): string {
  // Check if this is a batch operation
  if ('batch' in input && input.batch) {
    return handleBatchConditions(input.batch);
  }

  const singleInput = input as ManageConditionInput;
  const { targetId, operation } = singleInput;

  switch (operation) {
    case 'add':
      return handleAddCondition(targetId, singleInput);
    case 'remove':
      return handleRemoveCondition(targetId, singleInput);
    case 'query':
      return handleQueryConditions(targetId);
    case 'tick':
      return handleTickDuration(targetId, singleInput);
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

// ============================================================
// BATCH HANDLER
// ============================================================

function handleBatchConditions(operations: ManageConditionInput[]): string {
  const results: Array<{
    targetId: string;
    targetName: string | null;
    operation: string;
    condition?: string;
    success: boolean;
    message: string;
    queryResult?: string; // Store full query result for query operations
  }> = [];

  for (const op of operations) {
    const targetName = getCharacterNameById(op.targetId);

    try {
      const result = manageCondition(op);
      results.push({
        targetId: op.targetId,
        targetName,
        operation: op.operation,
        condition: op.condition,
        success: true,
        message: op.operation === 'query' ? 'Queried' : 'Applied',
        queryResult: op.operation === 'query' ? result : undefined,
      });
    } catch (error) {
      results.push({
        targetId: op.targetId,
        targetName,
        operation: op.operation,
        condition: op.condition,
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return formatBatchResults(results);
}

function formatBatchResults(results: Array<{
  targetId: string;
  targetName: string | null;
  operation: string;
  condition?: string;
  success: boolean;
  message: string;
  queryResult?: string;
}>): string {
  const content: string[] = [];

  // Check if this is all query operations
  const allQueries = results.every(r => r.operation === 'query');

  if (allQueries && results.length > 0) {
    // Special formatting for query batch - show full details
    content.push(centerText(`CONDITION STATUS - ${results.length} CHARACTERS`, 68));
    content.push('');
    content.push('═'.repeat(68));

    for (const result of results) {
      content.push('');
      const displayName = result.targetName || result.targetId;
      content.push(centerText(displayName.toUpperCase(), 68));
      content.push('─'.repeat(68));

      if (result.success && result.queryResult) {
        // Extract just the condition details from the query result
        // The query result is a full box, so we'll strip the outer box
        const lines = result.queryResult.split('\n');
        // Find lines that contain actual condition info (skip the box borders)
        const relevantLines = lines.filter(line => {
          return line.trim() && !line.match(/^[╔╗╚╝║═─┌┐└┘│]+$/) && !line.includes('CONDITION STATUS');
        });

        for (const line of relevantLines) {
          content.push(line);
        }
      } else if (!result.success) {
        content.push(padText(`  Error: ${result.message}`, 68, 'left'));
      } else {
        content.push(padText(`  No active conditions`, 68, 'left'));
      }
      content.push('');
    }

    content.push('═'.repeat(68));
    return createBox('BATCH CONDITION QUERY', content, undefined, 'HEAVY');
  }

  // Standard batch operation formatting (add/remove/tick)
  content.push(centerText(`PROCESSED ${results.length} OPERATIONS`, 68));
  content.push('');
  content.push('─'.repeat(68));
  content.push('');

  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;

  for (const result of results) {
    const status = result.success ? '✓' : '✗';
    const displayName = result.targetName || result.targetId;
    const opDesc = result.condition
      ? `${result.operation} ${result.condition}`
      : result.operation;

    content.push(padText(`${status} ${displayName}: ${opDesc}`, 68, 'left'));
    if (!result.success) {
      content.push(padText(`   Error: ${result.message}`, 68, 'left'));
    }
  }

  content.push('');
  content.push('─'.repeat(68));
  content.push('');
  content.push(padText(`Success: ${successCount} | Failed: ${failCount}`, 68, 'left'));

  return createBox('BATCH CONDITION UPDATE', content, undefined, 'HEAVY');
}

// Helper for testing: clear all conditions
export function clearAllConditions(): void {
  conditionStore.clear();
}

// ============================================================
// ADD CONDITION
// ============================================================

function handleAddCondition(targetId: string, input: ManageConditionInput): string {
  if (!input.condition) {
    throw new Error('condition is required for add operation');
  }

  const conditions = conditionStore.get(targetId) || [];

  // Handle exhaustion specially
  if (input.condition === 'exhaustion') {
    return handleAddExhaustion(targetId, conditions, input);
  }

  // Check if condition already exists
  const existing = conditions.find(c => c.condition === input.condition);
  if (existing) {
    return formatConditionUpdate(targetId, input.condition, 'already has', existing);
  }

  // Create new condition
  const newCondition: ActiveCondition = {
    condition: input.condition,
    source: input.source,
    duration: input.duration,
    saveDC: input.saveDC,
    saveAbility: input.saveAbility,
  };

  // Set rounds remaining for numeric durations
  if (typeof input.duration === 'number') {
    newCondition.roundsRemaining = input.duration;
  }

  conditions.push(newCondition);
  conditionStore.set(targetId, conditions);

  return formatConditionUpdate(targetId, input.condition, 'added', newCondition);
}

function handleAddExhaustion(
  targetId: string,
  conditions: ActiveCondition[],
  input: ManageConditionInput
): string {
  const existing = conditions.find(c => c.condition === 'exhaustion');
  const levelsToAdd = input.exhaustionLevels || 1;

  if (existing) {
    // Increment existing exhaustion
    const currentLevel = existing.exhaustionLevel || 1;
    const newLevel = Math.min(6, currentLevel + levelsToAdd);
    existing.exhaustionLevel = newLevel;
    conditionStore.set(targetId, conditions);
    return formatExhaustionLevel(targetId, newLevel, 'increased to');
  } else {
    // Add new exhaustion
    const level = Math.min(6, levelsToAdd);
    const newCondition: ActiveCondition = {
      condition: 'exhaustion',
      exhaustionLevel: level,
    };
    conditions.push(newCondition);
    conditionStore.set(targetId, conditions);
    return formatExhaustionLevel(targetId, level, 'added');
  }
}

// ============================================================
// REMOVE CONDITION
// ============================================================

function handleRemoveCondition(targetId: string, input: ManageConditionInput): string {
  const conditions = conditionStore.get(targetId) || [];

  // Special handling for "all"
  if (input.condition === 'all' as any) {
    conditionStore.set(targetId, []);
    const content: string[] = [];
    content.push(centerText(`TARGET: ${targetId}`, 58));
    content.push('');
    content.push(centerText('All conditions removed', 58));
    return createBox('CONDITIONS CLEARED', content, undefined, 'HEAVY');
  }

  if (!input.condition) {
    throw new Error('condition is required for remove operation');
  }

  // Handle exhaustion specially
  if (input.condition === 'exhaustion') {
    return handleRemoveExhaustion(targetId, conditions, input);
  }

  const index = conditions.findIndex(c => c.condition === input.condition);

  if (index === -1) {
    const content: string[] = [];
    content.push(centerText(`TARGET: ${targetId}`, 58));
    content.push('');
    content.push(centerText(`Not affected by ${input.condition}`, 58));
    return createBox('CONDITION NOT FOUND', content, undefined, 'HEAVY');
  }

  const removed = conditions.splice(index, 1)[0];
  conditionStore.set(targetId, conditions);

  return formatConditionUpdate(targetId, input.condition, 'removed', removed);
}

function handleRemoveExhaustion(
  targetId: string,
  conditions: ActiveCondition[],
  input: ManageConditionInput
): string {
  const existing = conditions.find(c => c.condition === 'exhaustion');

  if (!existing) {
    const content: string[] = [];
    content.push(centerText(`TARGET: ${targetId}`, 58));
    content.push('');
    content.push(centerText('Not affected by exhaustion', 58));
    return createBox('CONDITION NOT FOUND', content, undefined, 'HEAVY');
  }

  const currentLevel = existing.exhaustionLevel || 1;
  const levelsToRemove = input.exhaustionLevels || 1;
  const newLevel = currentLevel - levelsToRemove;

  if (newLevel <= 0) {
    // Remove exhaustion entirely
    const index = conditions.findIndex(c => c.condition === 'exhaustion');
    conditions.splice(index, 1);
    conditionStore.set(targetId, conditions);
    const content: string[] = [];
    content.push(centerText(`TARGET: ${targetId}`, 58));
    content.push('');
    content.push(centerText('Exhaustion removed completely', 58));
    return createBox('EXHAUSTION REMOVED', content, undefined, 'HEAVY');
  } else {
    // Reduce level
    existing.exhaustionLevel = newLevel;
    conditionStore.set(targetId, conditions);
    return formatExhaustionLevel(targetId, newLevel, 'reduced to');
  }
}

// ============================================================
// QUERY CONDITIONS
// ============================================================

function handleQueryConditions(targetId: string): string {
  const conditions = conditionStore.get(targetId) || [];
  const targetName = getCharacterNameById(targetId);
  const displayName = targetName || targetId;
  const content: string[] = [];
  const WIDTH = 58;

  content.push(centerText(`TARGET: ${displayName}`, WIDTH));
  content.push('');

  if (conditions.length === 0) {
    content.push(centerText('No active conditions', WIDTH));
    return createBox('CONDITION STATUS', content, undefined, 'HEAVY');
  }

  const box = BOX.LIGHT;
  content.push(box.H.repeat(WIDTH));
  content.push('');

  for (const cond of conditions) {
    if (cond.condition === 'exhaustion') {
      const level = cond.exhaustionLevel || 1;
      content.push(centerText(`EXHAUSTION - LEVEL ${level}`, WIDTH));
      content.push('');
      content.push(padText(`Current Effect: ${EXHAUSTION_EFFECTS[level]}`, WIDTH, 'left'));
      content.push('');

      // Show all effects up to current level
      content.push(padText('All Active Effects:', WIDTH, 'left'));
      for (let i = 1; i <= level; i++) {
        content.push(padText(`  ${i}. ${EXHAUSTION_EFFECTS[i]}`, WIDTH, 'left'));
      }
    } else {
      const condName = cond.condition.charAt(0).toUpperCase() + cond.condition.slice(1);
      content.push(centerText(condName.toUpperCase(), WIDTH));
      content.push('');

      // Show effect description (either built-in or custom)
      const effectText = cond.description
        || (cond.condition in CONDITION_EFFECTS ? CONDITION_EFFECTS[cond.condition as Condition] : 'Custom condition');
      content.push(padText(`Effect: ${effectText}`, WIDTH, 'left'));
      content.push('');

      if (cond.source) {
        content.push(padText(`Source: ${cond.source}`, WIDTH, 'left'));
      }

      if (cond.duration !== undefined) {
        if (typeof cond.duration === 'number' || cond.roundsRemaining !== undefined) {
          const rounds = cond.roundsRemaining ?? cond.duration;
          content.push(padText(`Duration: ${rounds} round${rounds !== 1 ? 's' : ''} remaining`, WIDTH, 'left'));
        } else {
          content.push(padText(`Duration: ${cond.duration.replace(/_/g, ' ')}`, WIDTH, 'left'));
        }
      }

      if (cond.saveDC) {
        const ability = cond.saveAbility?.toUpperCase() || 'SAVE';
        content.push(padText(`Save: DC ${cond.saveDC} ${ability} to end`, WIDTH, 'left'));
      }
    }
    content.push('');
    content.push(box.H.repeat(WIDTH));
    content.push('');
  }

  return createBox('CONDITION STATUS', content, undefined, 'HEAVY');
}

// ============================================================
// TICK DURATION
// ============================================================

function handleTickDuration(targetId: string, input: ManageConditionInput): string {
  const conditions = conditionStore.get(targetId) || [];
  const expired: string[] = [];
  const updated: string[] = [];

  for (let i = conditions.length - 1; i >= 0; i--) {
    const cond = conditions[i];

    // Only tick numeric durations
    if (cond.roundsRemaining !== undefined && typeof cond.roundsRemaining === 'number') {
      cond.roundsRemaining -= 1;

      if (cond.roundsRemaining <= 0) {
        expired.push(cond.condition);
        conditions.splice(i, 1);
      } else {
        updated.push(`${cond.condition} (${cond.roundsRemaining} round${cond.roundsRemaining !== 1 ? 's' : ''})`);
      }
    }
  }

  conditionStore.set(targetId, conditions);

  const content: string[] = [];
  const WIDTH = 58;

  content.push(centerText(`TARGET: ${targetId}`, WIDTH));
  content.push('');

  const box = BOX.LIGHT;
  content.push(box.H.repeat(WIDTH));
  content.push('');

  if (expired.length > 0) {
    content.push(padText(`Expired: ${expired.join(', ')}`, WIDTH, 'left'));
  }

  if (updated.length > 0) {
    if (expired.length > 0) content.push('');
    content.push(padText(`Updated: ${updated.join(', ')}`, WIDTH, 'left'));
  }

  if (expired.length === 0 && updated.length === 0) {
    content.push(centerText('No round-based conditions to update', WIDTH));
  }

  return createBox('CONDITION TICK', content, undefined, 'HEAVY');
}

// ============================================================
// FORMATTING HELPERS
// ============================================================

function formatConditionUpdate(
  targetId: string,
  condition: Condition,
  action: string,
  conditionData: ActiveCondition
): string {
  const targetName = getCharacterNameById(targetId);
  const displayName = targetName || targetId;
  const content: string[] = [];
  const WIDTH = 58;
  const condName = condition.charAt(0).toUpperCase() + condition.slice(1);
  const actionTitle = action.charAt(0).toUpperCase() + action.slice(1);

  content.push(centerText(`TARGET: ${displayName}`, WIDTH));
  content.push(centerText(`${condName} ${action}`, WIDTH));
  content.push('');

  const box = BOX.LIGHT;
  content.push(box.H.repeat(WIDTH));
  content.push('');

  content.push(centerText(condName.toUpperCase(), WIDTH));
  content.push('');
  content.push(padText(`Effect: ${CONDITION_EFFECTS[condition]}`, WIDTH, 'left'));

  if (conditionData.source) {
    content.push('');
    content.push(padText(`Source: ${conditionData.source}`, WIDTH, 'left'));
  }

  if (conditionData.duration !== undefined) {
    if (typeof conditionData.duration === 'number' || conditionData.roundsRemaining !== undefined) {
      const rounds = conditionData.roundsRemaining ?? conditionData.duration;
      content.push('');
      content.push(padText(`Duration: ${rounds} round${rounds !== 1 ? 's' : ''}`, WIDTH, 'left'));
    } else {
      content.push('');
      content.push(padText(`Duration: ${conditionData.duration.replace(/_/g, ' ')}`, WIDTH, 'left'));
    }
  }

  if (conditionData.saveDC) {
    const ability = conditionData.saveAbility?.toUpperCase() || 'SAVE';
    content.push('');
    content.push(padText(`Save: DC ${conditionData.saveDC} ${ability} to end`, WIDTH, 'left'));
  }

  return createBox(`CONDITION ${actionTitle.toUpperCase()}`, content, undefined, 'HEAVY');
}

function formatExhaustionLevel(targetId: string, level: number, action: string): string {
  const targetName = getCharacterNameById(targetId);
  const displayName = targetName || targetId;
  const content: string[] = [];
  const WIDTH = 58;
  const actionTitle = action.charAt(0).toUpperCase() + action.slice(1);

  content.push(centerText(`TARGET: ${displayName}`, WIDTH));
  content.push(centerText(`Exhaustion Level ${level}`, WIDTH));
  content.push('');

  const box = BOX.LIGHT;
  content.push(box.H.repeat(WIDTH));
  content.push('');

  content.push(centerText('EXHAUSTION', WIDTH));
  content.push('');
  content.push(padText(`Current Effect: ${EXHAUSTION_EFFECTS[level]}`, WIDTH, 'left'));
  content.push('');
  content.push(padText('All Active Effects:', WIDTH, 'left'));

  for (let i = 1; i <= level; i++) {
    content.push(padText(`  ${i}. ${EXHAUSTION_EFFECTS[i]}`, WIDTH, 'left'));
  }

  return createBox(`EXHAUSTION ${actionTitle.toUpperCase()}`, content, undefined, 'HEAVY');
}

// ============================================================
// ENCOUNTER MANAGEMENT
// ============================================================

// Encounter Participant Schema
const ParticipantSchema = z.object({
  id: z.string(),
  name: z.string(),
  hp: z.number().positive(),
  maxHp: z.number().positive(),
  ac: z.number().min(0).default(10),
  initiativeBonus: z.number().default(0),
  position: PositionSchema,
  isEnemy: z.boolean().default(false),
  size: SizeSchema.default('medium'),
  speed: z.number().default(30),
  resistances: z.array(DamageTypeSchema).optional(),
  immunities: z.array(DamageTypeSchema).optional(),
  vulnerabilities: z.array(DamageTypeSchema).optional(),
  conditionImmunities: z.array(ConditionSchema).optional(),
});

// Terrain Schema
const TerrainSchema = z.object({
  width: z.number().min(5).max(100).default(20),
  height: z.number().min(5).max(100).default(20),
  obstacles: z.array(z.string()).optional(),
  difficultTerrain: z.array(z.string()).optional(),
  water: z.array(z.string()).optional(),
  hazards: z.array(z.object({
    position: z.string(),
    type: z.string(),
    damage: z.string().optional(),
    dc: z.number().optional(),
  })).optional(),
});

// Create Encounter Schema
export const createEncounterSchema = z.object({
  seed: z.string().optional(),
  participants: z.array(ParticipantSchema).min(1),
  terrain: TerrainSchema.optional(),
  lighting: LightSchema.default('bright'),
  surprise: z.array(z.string()).optional(),
});

export type CreateEncounterInput = z.infer<typeof createEncounterSchema>;
export type Participant = z.infer<typeof ParticipantSchema>;

// Encounter State
interface EncounterState {
  id: string;
  round: number;
  participants: Array<Participant & { initiative: number; surprised?: boolean }>;
  terrain: z.infer<typeof TerrainSchema>;
  lighting: string;
  currentTurnIndex: number;
}

// In-memory encounter storage
const encounterStore = new Map<string, EncounterState>();

// Helper: Roll d20
function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

// Create Encounter Handler
export function createEncounter(input: CreateEncounterInput): string {
  // Validate unique participant IDs
  const ids = new Set<string>();
  for (const p of input.participants) {
    if (ids.has(p.id)) {
      throw new Error(`Duplicate participant ID: ${p.id}`);
    }
    ids.add(p.id);
  }

  // Generate unique encounter ID
  const encounterId = randomUUID();

  // Apply defaults
  const terrain = input.terrain || { width: 20, height: 20 };
  const lighting = input.lighting || 'bright';
  const surpriseSet = new Set(input.surprise || []);

  // Roll initiative for all participants and mark surprised
  const participantsWithInitiative = input.participants.map(p => {
    const initiativeRoll = rollD20();
    const initiative = initiativeRoll + (p.initiativeBonus || 0);
    const surprised = surpriseSet.has(p.id);
    
    return {
      ...p,
      initiative,
      surprised,
    };
  });

  // Sort by initiative (highest first)
  participantsWithInitiative.sort((a, b) => {
    if (b.initiative !== a.initiative) {
      return b.initiative - a.initiative;
    }
    // Tie-breaker: higher initiative bonus goes first
    return (b.initiativeBonus || 0) - (a.initiativeBonus || 0);
  });

  // Store encounter state
  const encounterState: EncounterState = {
    id: encounterId,
    round: 1,
    participants: participantsWithInitiative,
    terrain,
    lighting,
    currentTurnIndex: 0,
  };

  encounterStore.set(encounterId, encounterState);

  // Format output
  return formatEncounterCreated(encounterState);
}

// Format encounter creation output
function formatEncounterCreated(encounter: EncounterState): string {
  const content: string[] = [];
  const WIDTH = 72;

  // Header
  content.push(centerText(`Encounter ID: ${encounter.id}`, WIDTH));
  content.push(centerText(`Round: ${encounter.round} | Lighting: ${encounter.lighting}`, WIDTH));
  content.push(centerText(`${encounter.participants.length} Participants`, WIDTH));
  content.push('');
  content.push('═'.repeat(WIDTH));
  content.push('');

  // Initiative Order
  content.push(centerText('INITIATIVE ORDER', WIDTH));
  content.push('');
  content.push('─'.repeat(WIDTH));
  content.push('');

  // Table header - widened position column to 14 chars to fit "(100, 100) 50ft"
  const header = ' #  | Name                | Init | HP          | AC | Position      ';
  content.push(header);
  content.push('─'.repeat(WIDTH));

  // Participants
  for (let i = 0; i < encounter.participants.length; i++) {
    const p = encounter.participants[i];
    const num = (i + 1).toString().padStart(2);
    const name = p.name.padEnd(19).substring(0, 19);
    const init = p.initiative.toString().padStart(4);
    const hp = `${p.hp}/${p.maxHp}`.padEnd(11).substring(0, 11);
    const ac = p.ac.toString().padStart(2);
    
    // Format position - wider column to fit elevation
    let posStr = `(${p.position.x}, ${p.position.y})`;
    if (p.position.z && p.position.z !== 0) {
      posStr += ` ${p.position.z}ft`;
    }
    posStr = posStr.padEnd(14).substring(0, 14);

    let line = ` ${num} | ${name} | ${init} | ${hp} | ${ac} | ${posStr}`;
    
    // Add markers
    const markers: string[] = [];
    if (p.isEnemy) markers.push('[ENEMY]');
    if (p.surprised) markers.push('[SURPRISED]');
    if (p.size && p.size !== 'medium') markers.push(`[${p.size.toUpperCase()}]`);
    
    if (markers.length > 0) {
      line += ' ' + markers.join(' ');
    }

    content.push(line);
  }

  content.push('');
  
  // Initiative summary for each participant (helps with test regex matching)
  content.push('─'.repeat(WIDTH));
  content.push('');
  for (const p of encounter.participants) {
    const surprised = p.surprised ? ' (SURPRISED)' : '';
    const sizeStr = p.size ? ` [${p.size}]` : '';
    content.push(padText(`${p.name}: Initiative: ${p.initiative}${sizeStr}${surprised}`, WIDTH, 'left'));
  }
  
  content.push('');
  content.push('═'.repeat(WIDTH));
  content.push('');

  // Terrain info
  const terrainParts: string[] = [];
  terrainParts.push(`Terrain: ${encounter.terrain.width}x${encounter.terrain.height}`);
  
  if (encounter.terrain.obstacles && encounter.terrain.obstacles.length > 0) {
    terrainParts.push(`Obstacles: ${encounter.terrain.obstacles.length}`);
  }
  
  if (encounter.terrain.difficultTerrain && encounter.terrain.difficultTerrain.length > 0) {
    terrainParts.push(`Difficult terrain: ${encounter.terrain.difficultTerrain.length}`);
  }
  
  if (encounter.terrain.water && encounter.terrain.water.length > 0) {
    terrainParts.push(`Water: ${encounter.terrain.water.length}`);
  }
  
  if (encounter.terrain.hazards && encounter.terrain.hazards.length > 0) {
    terrainParts.push(`Hazards: ${encounter.terrain.hazards.length}`);
  }

  content.push(padText(terrainParts.join(' | '), WIDTH, 'left'));

  // Hazard details if present
  if (encounter.terrain.hazards && encounter.terrain.hazards.length > 0) {
    content.push('');
    content.push(padText('Hazards:', WIDTH, 'left'));
    for (const h of encounter.terrain.hazards) {
      let hazardStr = `  ${h.position}: ${h.type}`;
      if (h.dc) hazardStr += ` (DC ${h.dc})`;
      if (h.damage) hazardStr += ` ${h.damage} damage`;
      content.push(padText(hazardStr, WIDTH, 'left'));
    }
  }

  return createBox('ENCOUNTER CREATED', content, undefined, 'HEAVY');
}

// Helper for testing: get encounter by ID
export function getEncounter(id: string): EncounterState | undefined {
  return encounterStore.get(id);
}

// Helper for testing: get encounter participant by ID
export function getEncounterParticipant(encounterId: string, participantId: string): Participant & { initiative: number; surprised?: boolean } | undefined {
  const encounter = encounterStore.get(encounterId);
  if (!encounter) {
    return undefined;
  }
  return encounter.participants.find(p => p.id === participantId);
}

// Helper for testing: clear all encounters
export function clearAllEncounters(): void {
  encounterStore.clear();
}

// ============================================================
// EXECUTE ACTION (ADR-001 Phase 1: Attack + Movement)
// ============================================================

import { ActionTypeSchema, ActionCostSchema, WeaponTypeSchema, type ActionType, type ActionCost, type WeaponType, type DamageType, type Position } from '../types.js';
import { parseDice } from './dice.js';

// Execute Action Schema (Phase 1)
export const executeActionSchema = z.object({
  encounterId: z.string(),
  
  // Actor (either/or)
  actorId: z.string().optional(),
  actorName: z.string().optional(),
  
  // Action selection
  actionType: ActionTypeSchema,
  
  // Action economy
  actionCost: ActionCostSchema.default('action'),
  
  // Target (for attack)
  targetId: z.string().optional(),
  targetName: z.string().optional(),
  
  // Attack options
  weaponType: WeaponTypeSchema.optional(),
  damageExpression: z.string().optional(),
  damageType: DamageTypeSchema.optional(),
  
  // Movement options
  moveTo: PositionSchema.optional(),
  
  // Advantage/disadvantage
  advantage: z.boolean().optional(),
  disadvantage: z.boolean().optional(),
  
  // Manual rolls (pre-rolled dice)
  manualAttackRoll: z.number().optional(),
  manualDamageRoll: z.number().optional(),
  
  // Phase 2: Shove direction (away or prone)
  shoveDirection: z.enum(['away', 'prone']).optional(),
});

export type ExecuteActionInput = z.infer<typeof executeActionSchema>;

// Per-turn action tracking (in-memory, clears on advance_turn)
const turnActionTracker = new Map<string, {
  actionUsed: boolean;
  bonusActionUsed: boolean;
  reactionUsed: boolean;
  movementUsed: number;
  hasDashed: boolean;
  disengagedThisTurn: boolean; // Phase 2
  isDodging: boolean; // Phase 2
}>();

// Get or initialize turn tracker for an actor
function getTurnTracker(encounterId: string, actorId: string) {
  const key = `${encounterId}:${actorId}`;
  if (!turnActionTracker.has(key)) {
    turnActionTracker.set(key, {
      actionUsed: false,
      bonusActionUsed: false,
      reactionUsed: false,
      movementUsed: 0,
      hasDashed: false,
      disengagedThisTurn: false,
      isDodging: false,
    });
  }
  return turnActionTracker.get(key)!;
}

// Clear turn tracker for an encounter (for testing or advance_turn)
export function clearTurnTracker(encounterId?: string): void {
  if (encounterId) {
    for (const key of turnActionTracker.keys()) {
      if (key.startsWith(encounterId)) {
        turnActionTracker.delete(key);
      }
    }
  } else {
    turnActionTracker.clear();
  }
}

// Main execute action handler
export function executeAction(input: ExecuteActionInput): string {
  // Get encounter
  const encounter = encounterStore.get(input.encounterId);
  if (!encounter) {
    throw new Error(`Encounter not found: ${input.encounterId}`);
  }

  // Find actor
  let actor = input.actorId 
    ? encounter.participants.find(p => p.id === input.actorId)
    : encounter.participants.find(p => p.name.toLowerCase() === input.actorName?.toLowerCase());
  
  if (!actor) {
    throw new Error(`Actor not found: ${input.actorId || input.actorName}`);
  }

  // Dispatch by action type
  switch (input.actionType) {
    case 'attack':
      return handleAttackAction(encounter, actor, input);
    case 'dash':
      return handleDashAction(encounter, actor, input);
    case 'disengage':
      return handleDisengageAction(encounter, actor, input);
    case 'dodge':
      return handleDodgeAction(encounter, actor, input);
    case 'grapple':
      return handleGrappleAction(encounter, actor, input);
    case 'shove':
      return handleShoveAction(encounter, actor, input);
    default:
      // Other actions return a placeholder
      return formatActionNotImplemented(actor.name, input.actionType);
  }
}

// ============================================================
// ATTACK ACTION HANDLER
// ============================================================

function handleAttackAction(
  encounter: EncounterState,
  actor: Participant & { initiative: number; surprised?: boolean },
  input: ExecuteActionInput
): string {
  // Find target
  let target = input.targetId
    ? encounter.participants.find(p => p.id === input.targetId)
    : encounter.participants.find(p => p.name.toLowerCase() === input.targetName?.toLowerCase());

  if (!target) {
    throw new Error(`Target not found: ${input.targetId || input.targetName || 'No target specified'}`);
  }

  // Check if target is dodging - applies disadvantage
  const targetTracker = getTurnTracker(input.encounterId, target.id);
  const targetIsDodging = targetTracker.isDodging;
  const effectiveDisadvantage = input.disadvantage || targetIsDodging;

  // Roll attack (d20)
  let attackRoll: number;
  let isNat20 = false;
  let isNat1 = false;
  let rollDescription: string;

  if (input.manualAttackRoll !== undefined) {
    attackRoll = input.manualAttackRoll;
    isNat20 = attackRoll === 20;
    isNat1 = attackRoll === 1;
    rollDescription = `${attackRoll} (manual)`;
  } else if (input.advantage || effectiveDisadvantage) {
    // Roll 2d20
    const roll1 = Math.floor(Math.random() * 20) + 1;
    const roll2 = Math.floor(Math.random() * 20) + 1;
    
    if (input.advantage && !effectiveDisadvantage) {
      attackRoll = Math.max(roll1, roll2);
      rollDescription = `${attackRoll} (${roll1}, ${roll2} - advantage)`;
    } else if (effectiveDisadvantage && !input.advantage) {
      attackRoll = Math.min(roll1, roll2);
      const reason = targetIsDodging ? 'target dodging' : 'disadvantage';
      rollDescription = `${attackRoll} (${roll1}, ${roll2} - ${reason})`;
    } else {
      // Both advantage and disadvantage = straight roll
      attackRoll = Math.floor(Math.random() * 20) + 1;
      rollDescription = `${attackRoll} (adv/disadv cancel)`;
    }
    
    isNat20 = attackRoll === 20;
    isNat1 = attackRoll === 1;
  } else {
    attackRoll = Math.floor(Math.random() * 20) + 1;
    isNat20 = attackRoll === 20;
    isNat1 = attackRoll === 1;
    rollDescription = `${attackRoll}`;
  }


  // Calculate hit (natural 20 always hits, natural 1 always misses)
  const isHit = isNat20 || (!isNat1 && attackRoll >= target.ac);
  const isCritical = isNat20;

  // Calculate damage if hit
  let damage = 0;
  let damageRolls: number[] = [];
  let damageDescription = '';

  if (isHit && input.damageExpression) {
    if (input.manualDamageRoll !== undefined) {
      damage = input.manualDamageRoll;
      damageDescription = `${damage} (manual)`;
    } else {
      // Parse and roll damage
      const diceResult = parseDice(input.damageExpression);
      damage = diceResult.total;
      damageRolls = diceResult.rolls;
      
      // Double dice on critical hit (roll again and add)
      if (isCritical) {
        const critBonus = parseDice(input.damageExpression.replace(/[+-]\d+$/, '')); // Remove modifier for crit
        damage += critBonus.total;
        damageRolls = [...damageRolls, ...critBonus.rolls];
        damageDescription = `${damage} (${damageRolls.join(', ')} - CRITICAL!)`;
      } else {
        damageDescription = `${damage} (${damageRolls.join(', ')})`;
      }
    }
  }

  // Apply damage to target
  let oldHp = target.hp;
  if (isHit && damage > 0) {
    target.hp = Math.max(0, target.hp - damage);
  }

  // Handle movement if specified
  let movementInfo = '';
  if (input.moveTo) {
    const moveResult = handleMoveInternal(encounter, actor, input.moveTo);
    movementInfo = moveResult;
  }

  // Format output
  return formatAttackResult(
    actor.name,
    target.name,
    attackRoll,
    rollDescription,
    target.ac,
    isHit,
    isCritical,
    isNat1,
    damage,
    damageDescription,
    input.damageType || 'slashing',
    oldHp,
    target.hp,
    target.maxHp,
    input.actionCost || 'action',
    input.advantage,
    input.disadvantage,
    movementInfo
  );
}

// ============================================================
// DASH ACTION HANDLER
// ============================================================

function handleDashAction(
  encounter: EncounterState,
  actor: Participant & { initiative: number; surprised?: boolean },
  input: ExecuteActionInput
): string {
  const tracker = getTurnTracker(input.encounterId, actor.id);
  tracker.hasDashed = true;

  const content: string[] = [];
  content.push(centerText(`${actor.name.toUpperCase()} DASHES!`, 50));
  content.push('');
  content.push('─'.repeat(50));
  content.push('');
  content.push(centerText(`Movement: ${actor.speed}ft → ${actor.speed * 2}ft`, 50));
  content.push(centerText('(Doubled for this turn)', 50));
  content.push('');
  content.push('─'.repeat(50));
  content.push('');
  content.push(padText(`Action Cost: ${input.actionCost || 'action'}`, 50, 'left'));

  // Handle movement if specified
  if (input.moveTo) {
    content.push('');
    content.push('═'.repeat(50));
    content.push('');
    
    // Check for opportunity attacks
    const oaResults = checkOpportunityAttacks(encounter, actor, input.moveTo, tracker.disengagedThisTurn);
    
    for (const oa of oaResults) {
      content.push(centerText(`⚔ OPPORTUNITY ATTACK ⚔`, 50));
      content.push(centerText(`${oa.attackerName} attacks!`, 50));
      content.push(centerText(oa.result, 50));
      content.push('');
    }

    // Then process movement
    const moveResult = handleMoveInternal(encounter, actor, input.moveTo);
    content.push(padText(`Movement: ${moveResult}`, 50, 'left'));
  }

  return createBox('DASH ACTION', content, undefined, 'HEAVY');
}

// ============================================================
// OPPORTUNITY ATTACK CHECKER
// ============================================================

interface OpportunityAttackResult {
  attackerName: string;
  attackerId: string;
  result: string;
  damage: number;
  hit: boolean;
}

function checkOpportunityAttacks(
  encounter: EncounterState,
  mover: Participant & { initiative: number; surprised?: boolean },
  destination: Position,
  disengaged: boolean
): OpportunityAttackResult[] {
  // If disengaged, no opportunity attacks
  if (disengaged) {
    return [];
  }

  const results: OpportunityAttackResult[] = [];
  const MELEE_REACH = 1; // 1 square = 5ft

  for (const participant of encounter.participants) {
    // Skip self
    if (participant.id === mover.id) continue;
    
    // Skip allies (simple check: same isEnemy status)
    if (participant.isEnemy === mover.isEnemy) continue;

    // Get tracker for this potential attacker
    const attackerTracker = getTurnTracker(encounter.id, participant.id);
    
    // Check if attacker has reaction available
    if (attackerTracker.reactionUsed) continue;

    // Check if mover was in attacker's reach
    const distBefore = Math.max(
      Math.abs(mover.position.x - participant.position.x),
      Math.abs(mover.position.y - participant.position.y)
    );
    
    // Check if mover is leaving attacker's reach
    const distAfter = Math.max(
      Math.abs(destination.x - participant.position.x),
      Math.abs(destination.y - participant.position.y)
    );

    // OA triggers when: was in reach, and leaving reach
    if (distBefore <= MELEE_REACH && distAfter > MELEE_REACH) {
      // Use attacker's reaction
      attackerTracker.reactionUsed = true;

      // Roll attack
      const attackRoll = Math.floor(Math.random() * 20) + 1;
      const hit = attackRoll >= mover.ac;
      
      let result: string;
      let damage = 0;
      
      if (hit) {
        damage = Math.floor(Math.random() * 6) + 1 + 2; // 1d6+2 default
        mover.hp = Math.max(0, mover.hp - damage);
        result = `Roll: ${attackRoll} vs AC ${mover.ac} - HIT! ${damage} damage`;
      } else {
        result = `Roll: ${attackRoll} vs AC ${mover.ac} - MISS`;
      }

      results.push({
        attackerName: participant.name,
        attackerId: participant.id,
        result,
        damage,
        hit,
      });
    }
  }

  return results;
}


// ============================================================
// INTERNAL MOVEMENT HANDLER
// ============================================================

function handleMoveInternal(
  encounter: EncounterState,
  actor: Participant & { initiative: number; surprised?: boolean },
  destination: Position
): string {
  const tracker = getTurnTracker(encounter.id, actor.id);
  const maxMovement = tracker.hasDashed ? actor.speed * 2 : actor.speed;
  const availableMovement = maxMovement - tracker.movementUsed;

  // Calculate distance (simple grid distance, 5ft per square)
  const dx = Math.abs(destination.x - actor.position.x);
  const dy = Math.abs(destination.y - actor.position.y);
  const distanceSquares = Math.max(dx, dy); // D&D 5e diagonal = 5ft
  const distanceFeet = distanceSquares * 5;

  if (distanceFeet > availableMovement) {
    throw new Error(`Insufficient movement: need ${distanceFeet}ft, have ${availableMovement}ft remaining`);
  }

  // Update position
  const oldPosition = { ...actor.position };
  actor.position = destination;
  tracker.movementUsed += distanceFeet;

  return `Moved from (${oldPosition.x}, ${oldPosition.y}) to (${destination.x}, ${destination.y}) - ${distanceFeet}ft`;
}

// ============================================================
// FORMATTING HELPERS
// ============================================================

function formatAttackResult(
  attackerName: string,
  targetName: string,
  attackRoll: number,
  rollDescription: string,
  targetAC: number,
  isHit: boolean,
  isCritical: boolean,
  isNat1: boolean,
  damage: number,
  damageDescription: string,
  damageType: DamageType | string,
  oldHp: number,
  newHp: number,
  maxHp: number,
  actionCost: ActionCost | string,
  advantage?: boolean,
  disadvantage?: boolean,
  movementInfo?: string
): string {
  const content: string[] = [];
  const WIDTH = 60;

  // Header
  content.push(centerText(`${attackerName} ATTACKS ${targetName}`, WIDTH));
  content.push('');
  content.push('═'.repeat(WIDTH));
  content.push('');

  // Roll info
  if (advantage) {
    content.push(centerText('⚔ ATTACK ROLL (ADVANTAGE) ⚔', WIDTH));
  } else if (disadvantage) {
    content.push(centerText('⚔ ATTACK ROLL (DISADVANTAGE) ⚔', WIDTH));
  } else {
    content.push(centerText('⚔ ATTACK ROLL ⚔', WIDTH));
  }
  content.push('');
  content.push(centerText(`Roll: ${rollDescription}`, WIDTH));
  content.push(centerText(`vs AC ${targetAC}`, WIDTH));
  content.push('');

  // Result
  if (isCritical) {
    content.push(centerText('★★★ CRITICAL HIT! ★★★', WIDTH));
  } else if (isNat1) {
    content.push(centerText('✗ CRITICAL MISS ✗', WIDTH));
  } else if (isHit) {
    content.push(centerText('✓ HIT ✓', WIDTH));
  } else {
    content.push(centerText('✗ MISS ✗', WIDTH));
  }

  content.push('');
  content.push('─'.repeat(WIDTH));
  content.push('');

  // Damage (if hit)
  if (isHit && damage > 0) {
    content.push(centerText('DAMAGE', WIDTH));
    content.push('');
    content.push(centerText(`${damageDescription} ${damageType}`, WIDTH));
    content.push('');

    // HP bar
    const hpPercent = Math.floor((newHp / maxHp) * 20);
    const hpBar = '█'.repeat(hpPercent) + '░'.repeat(20 - hpPercent);
    content.push(centerText(`${targetName}: ${oldHp} → ${newHp}/${maxHp} HP`, WIDTH));
    content.push(centerText(`[${hpBar}]`, WIDTH));

    if (newHp === 0) {
      content.push('');
      content.push(centerText('☠ TARGET DOWN ☠', WIDTH));
    }
  }

  // Movement (if any)
  if (movementInfo) {
    content.push('');
    content.push('─'.repeat(WIDTH));
    content.push('');
    content.push(padText(`Movement: ${movementInfo}`, WIDTH, 'left'));
  }

  // Footer
  content.push('');
  content.push('═'.repeat(WIDTH));
  content.push('');
  content.push(padText(`Action Cost: ${actionCost}`, WIDTH, 'left'));

  return createBox('ATTACK RESULT', content, undefined, 'HEAVY');
}

// ============================================================
// PHASE 2: TACTICAL ACTION HANDLERS
// ============================================================

function handleDisengageAction(
  encounter: EncounterState,
  actor: Participant & { initiative: number; surprised?: boolean },
  input: ExecuteActionInput
): string {
  const tracker = getTurnTracker(input.encounterId, actor.id);
  tracker.disengagedThisTurn = true;

  const content: string[] = [];
  content.push(centerText(`${actor.name.toUpperCase()} DISENGAGES!`, 50));
  content.push('');
  content.push('─'.repeat(50));
  content.push('');
  content.push(centerText('Movement will not provoke', 50));
  content.push(centerText('opportunity attacks this turn', 50));
  content.push('');
  content.push('─'.repeat(50));
  content.push('');
  content.push(padText(`Action Cost: ${input.actionCost || 'action'}`, 50, 'left'));

  return createBox('DISENGAGE ACTION', content, undefined, 'HEAVY');
}

function handleDodgeAction(
  encounter: EncounterState,
  actor: Participant & { initiative: number; surprised?: boolean },
  input: ExecuteActionInput
): string {
  const tracker = getTurnTracker(input.encounterId, actor.id);
  tracker.isDodging = true;

  const content: string[] = [];
  content.push(centerText(`${actor.name.toUpperCase()} DODGES!`, 50));
  content.push('');
  content.push('─'.repeat(50));
  content.push('');
  content.push(centerText('Until next turn:', 50));
  content.push(centerText('• Attacks against you have DISADVANTAGE', 50));
  content.push(centerText('• DEX saves have ADVANTAGE', 50));
  content.push('');
  content.push('─'.repeat(50));
  content.push('');
  content.push(padText(`Action Cost: ${input.actionCost || 'action'}`, 50, 'left'));

  return createBox('DODGE ACTION', content, undefined, 'HEAVY');
}

function handleGrappleAction(
  encounter: EncounterState,
  actor: Participant & { initiative: number; surprised?: boolean },
  input: ExecuteActionInput
): string {
  // Require target
  let target = input.targetId
    ? encounter.participants.find(p => p.id === input.targetId)
    : encounter.participants.find(p => p.name.toLowerCase() === input.targetName?.toLowerCase());

  if (!target) {
    throw new Error(`Target not found: ${input.targetId || input.targetName || 'No target specified'}`);
  }

  // Roll contested Athletics check
  const attackerRoll = input.manualAttackRoll ?? (Math.floor(Math.random() * 20) + 1);
  const defenderRoll = Math.floor(Math.random() * 20) + 1;

  const success = attackerRoll > defenderRoll;

  const content: string[] = [];
  content.push(centerText(`${actor.name.toUpperCase()} GRAPPLES ${target.name.toUpperCase()}`, 50));
  content.push('');
  content.push('═'.repeat(50));
  content.push('');
  content.push(centerText('CONTESTED ATHLETICS CHECK', 50));
  content.push('');
  content.push(centerText(`${actor.name}: ${attackerRoll}`, 50));
  content.push(centerText(`${target.name}: ${defenderRoll}`, 50));
  content.push('');

  if (success) {
    content.push(centerText('✓ GRAPPLE SUCCESS! ✓', 50));
    content.push('');
    content.push(centerText(`${target.name} is now GRAPPLED`, 50));
    content.push(centerText('(Speed 0, can attempt escape)', 50));
    // Apply grappled condition would go here via manage_condition
  } else {
    content.push(centerText('✗ GRAPPLE FAILED ✗', 50));
    content.push('');
    content.push(centerText(`${target.name} breaks free!`, 50));
  }

  content.push('');
  content.push('═'.repeat(50));
  content.push('');
  content.push(padText(`Action Cost: ${input.actionCost || 'action'}`, 50, 'left'));

  return createBox('GRAPPLE ACTION', content, undefined, 'HEAVY');
}

function handleShoveAction(
  encounter: EncounterState,
  actor: Participant & { initiative: number; surprised?: boolean },
  input: ExecuteActionInput
): string {
  // Require target
  let target = input.targetId
    ? encounter.participants.find(p => p.id === input.targetId)
    : encounter.participants.find(p => p.name.toLowerCase() === input.targetName?.toLowerCase());

  if (!target) {
    throw new Error(`Target not found: ${input.targetId || input.targetName || 'No target specified'}`);
  }

  const shoveDirection = input.shoveDirection || 'away';

  // Roll contested Athletics check
  const attackerRoll = input.manualAttackRoll ?? (Math.floor(Math.random() * 20) + 1);
  const defenderRoll = Math.floor(Math.random() * 20) + 1;

  const success = attackerRoll > defenderRoll;

  const content: string[] = [];
  content.push(centerText(`${actor.name.toUpperCase()} SHOVES ${target.name.toUpperCase()}`, 50));
  content.push('');
  content.push('═'.repeat(50));
  content.push('');
  content.push(centerText('CONTESTED ATHLETICS CHECK', 50));
  content.push('');
  content.push(centerText(`${actor.name}: ${attackerRoll}`, 50));
  content.push(centerText(`${target.name}: ${defenderRoll}`, 50));
  content.push('');

  if (success) {
    if (shoveDirection === 'prone') {
      content.push(centerText('✓ SHOVE SUCCESS! ✓', 50));
      content.push('');
      content.push(centerText(`${target.name} is knocked PRONE`, 50));
      // Apply prone condition would go here
    } else {
      // Push 5ft away
      const dx = target.position.x - actor.position.x;
      const dy = target.position.y - actor.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 0) {
        // Normalize and push 1 square (5ft)
        target.position.x += Math.sign(dx);
        target.position.y += Math.sign(dy);
      }

      content.push(centerText('✓ SHOVE SUCCESS! ✓', 50));
      content.push('');
      content.push(centerText(`${target.name} pushed 5ft away!`, 50));
      content.push(centerText(`New position: (${target.position.x}, ${target.position.y})`, 50));
    }
  } else {
    content.push(centerText('✗ SHOVE FAILED ✗', 50));
    content.push('');
    content.push(centerText(`${target.name} holds their ground!`, 50));
  }

  content.push('');
  content.push('═'.repeat(50));
  content.push('');
  content.push(padText(`Action Cost: ${input.actionCost || 'action'}`, 50, 'left'));

  return createBox('SHOVE ACTION', content, undefined, 'HEAVY');
}

function formatActionNotImplemented(actorName: string, actionType: ActionType): string {
  const content: string[] = [];
  content.push(centerText(`${actorName} uses ${actionType.toUpperCase()}`, 50));
  content.push('');
  content.push(centerText('(Action type not yet implemented)', 50));
  content.push(centerText('Supports: attack, dash, disengage, dodge, grapple, shove', 50));
  
  return createBox('ACTION', content, undefined, 'HEAVY');
}


