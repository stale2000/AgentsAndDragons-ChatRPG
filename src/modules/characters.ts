/**
 * Characters Module - Character Creation & Management
 * Implements D&D 5e character system
 */

import { z } from 'zod';
import {
  createBox,
  createTableRow,
  createDivider,
  formatAbilityScore,
  createStatusBar,
  centerText,
  padText,
  BOX
} from './ascii-art.js';
import {
  AbilitySchema,
  DamageTypeSchema,
  ConditionSchema,
  SkillSchema
} from '../types.js';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as os from 'os';
import { calculateEffectiveStats, getActiveConditions } from './combat.js';
import { parseDice } from './dice.js';

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

export const createCharacterSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  race: z.string().default('Human'),
  class: z.string().default('Fighter'),
  level: z.number().min(1, 'Level must be at least 1').max(20, 'Level cannot exceed 20').default(1),
  background: z.string().optional(),
  characterType: z.enum(['pc', 'npc', 'enemy', 'neutral']).default('pc'),
  stats: z.object({
    str: z.number().min(1, 'Ability score must be at least 1').max(30, 'Ability score cannot exceed 30').default(10),
    dex: z.number().min(1, 'Ability score must be at least 1').max(30, 'Ability score cannot exceed 30').default(10),
    con: z.number().min(1, 'Ability score must be at least 1').max(30, 'Ability score cannot exceed 30').default(10),
    int: z.number().min(1, 'Ability score must be at least 1').max(30, 'Ability score cannot exceed 30').default(10),
    wis: z.number().min(1, 'Ability score must be at least 1').max(30, 'Ability score cannot exceed 30').default(10),
    cha: z.number().min(1, 'Ability score must be at least 1').max(30, 'Ability score cannot exceed 30').default(10),
  }).optional(),
  hp: z.number().optional(),
  maxHp: z.number().optional(),
  ac: z.number().default(10),
  speed: z.number().default(30),
  resistances: z.array(DamageTypeSchema).optional(),
  immunities: z.array(DamageTypeSchema).optional(),
  vulnerabilities: z.array(DamageTypeSchema).optional(),
  conditionImmunities: z.array(ConditionSchema).optional(),
  spellcastingAbility: AbilitySchema.optional(),
  knownSpells: z.array(z.string()).optional(),
  preparedSpells: z.array(z.string()).optional(),
  cantrips: z.array(z.string()).optional(),
  skillProficiencies: z.array(SkillSchema).optional(),
  saveProficiencies: z.array(AbilitySchema).optional(),
  equipment: z.array(z.string()).optional(),
});

export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;

// Single get object
const singleGetSchema = z.object({
  characterId: z.string().min(1).optional(),
  characterName: z.string().min(1).optional(),
}).refine(data => data.characterId || data.characterName, {
  message: 'Either characterId or characterName must be provided',
});

// Support both single and batch get
export const getCharacterSchema = z.union([
  singleGetSchema,
  z.object({
    batch: z.array(singleGetSchema).min(1).max(20),
  }),
]);

export type GetCharacterInput = z.infer<typeof getCharacterSchema>;

// Single update object
const singleUpdateSchema = z.object({
  characterId: z.string().min(1).optional(),
  characterName: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  race: z.string().optional(),
  class: z.string().optional(),
  level: z.number().min(1, 'Level must be at least 1').max(20, 'Level cannot exceed 20').optional(),
  background: z.string().optional(),
  characterType: z.enum(['pc', 'npc', 'enemy', 'neutral']).optional(),
  stats: z.object({
    str: z.number().min(1).max(30).optional(),
    dex: z.number().min(1).max(30).optional(),
    con: z.number().min(1).max(30).optional(),
    int: z.number().min(1).max(30).optional(),
    wis: z.number().min(1).max(30).optional(),
    cha: z.number().min(1).max(30).optional(),
  }).optional(),
  hp: z.union([
    z.string().regex(/^[+-]\d+$/, 'Relative HP must be in format "+5" or "-10"'),
    z.number() // Supports both absolute (positive) and delta (negative) values
  ]).optional(),
  healing: z.number().positive('Healing must be a positive number').optional(),
  maxHp: z.number().min(1).optional(),
  ac: z.number().optional(),
  speed: z.number().optional(),
  resistances: z.array(DamageTypeSchema).optional(),
  immunities: z.array(DamageTypeSchema).optional(),
  vulnerabilities: z.array(DamageTypeSchema).optional(),
  conditionImmunities: z.array(ConditionSchema).optional(),
  spellcastingAbility: AbilitySchema.optional(),
  knownSpells: z.array(z.string()).optional(),
  preparedSpells: z.array(z.string()).optional(),
  cantrips: z.array(z.string()).optional(),
  skillProficiencies: z.array(SkillSchema).optional(),
  saveProficiencies: z.array(AbilitySchema).optional(),
  equipment: z.array(z.string()).optional(),
}).refine(data => data.characterId || data.characterName, {
  message: 'Either characterId or characterName must be provided',
});

// Support both single and batch updates
export const updateCharacterSchema = z.union([
  singleUpdateSchema,
  z.object({
    batch: z.array(singleUpdateSchema).min(1).max(20),
  }),
]);

export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;

// Roll check schema
export const rollCheckSchema = z.object({
  characterId: z.string().optional(),
  characterName: z.string().optional(),

  checkType: z.enum(['skill', 'ability', 'save', 'attack', 'initiative']),

  skill: SkillSchema.optional(),
  ability: AbilitySchema.optional(),

  dc: z.number().optional(),
  advantage: z.boolean().optional(),
  disadvantage: z.boolean().optional(),
  bonus: z.number().optional(),

  contestedBy: z.string().optional(),
  contestedCheck: z.object({
    type: z.enum(['skill', 'ability']),
    skillOrAbility: z.string(),
  }).optional(),
});

export type RollCheckInput = z.infer<typeof rollCheckSchema>;

// ============================================================
// CHARACTER INTERFACE
// ============================================================

export interface Character {
  id: string;
  name: string;
  race: string;
  class: string;
  level: number;
  background?: string;
  characterType: 'pc' | 'npc' | 'enemy' | 'neutral';
  stats: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  hp: number;
  maxHp: number;
  ac: number;
  speed: number;
  proficiencyBonus: number;
  resistances?: string[];
  immunities?: string[];
  vulnerabilities?: string[];
  conditionImmunities?: string[];
  spellcastingAbility?: string;
  knownSpells?: string[];
  preparedSpells?: string[];
  cantrips?: string[];
  skillProficiencies?: string[];
  saveProficiencies?: string[];
  equipment?: string[];
  createdAt: string;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

// Hit die by class
const HIT_DIE_BY_CLASS: Record<string, number> = {
  'Barbarian': 12,
  'Fighter': 10,
  'Paladin': 10,
  'Ranger': 10,
  'Bard': 8,
  'Cleric': 8,
  'Druid': 8,
  'Monk': 8,
  'Rogue': 8,
  'Warlock': 8,
  'Sorcerer': 6,
  'Wizard': 6,
};

// Calculate ability modifier
function calculateModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

// Calculate proficiency bonus by level
function calculateProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

// Calculate max HP
function calculateMaxHP(className: string, level: number, conModifier: number): number {
  const hitDie = HIT_DIE_BY_CLASS[className] || 8;

  // First level: max hit die + CON mod
  // Additional levels: average of hit die (rounded up) + CON mod per level
  const firstLevelHP = hitDie + conModifier;
  const additionalLevels = level - 1;
  const avgHitDie = Math.floor(hitDie / 2) + 1;
  const additionalHP = additionalLevels * (avgHitDie + conModifier);

  return Math.max(1, firstLevelHP + additionalHP);
}

// Get character type emoji
function getCharacterTypeEmoji(type: string): string {
  const emojiMap: Record<string, string> = {
    'pc': '🎭',
    'npc': '🧑',
    'enemy': '⚔️',
    'neutral': '🤝',
  };
  return emojiMap[type] || '🎭';
}

// Find character by name (returns ID)
function findCharacterByName(name: string): string | null {
  const dataDir = path.join(DATA_ROOT, 'characters');

  // Ensure directory exists
  if (!fs.existsSync(dataDir)) {
    return null;
  }

  try {
    const files = fs.readdirSync(dataDir);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(dataDir, file);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const character: Character = JSON.parse(fileContent);

      // Case-insensitive name match
      if (character.name.toLowerCase() === name.toLowerCase()) {
        return character.id;
      }
    }

    return null;
  } catch (err) {
    return null;
  }
}

// ============================================================
// CREATE CHARACTER HANDLER
// ============================================================

export function createCharacter(input: CreateCharacterInput): {
  success: boolean;
  character: Character;
  markdown: string;
} {
  // Generate unique ID
  const id = randomUUID();

  // Get stats with defaults
  const stats = input.stats || {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
  };

  // Calculate derived stats
  const conModifier = calculateModifier(stats.con);
  const proficiencyBonus = calculateProficiencyBonus(input.level);

  // Calculate HP (use provided values or auto-calculate)
  const maxHp = input.maxHp || calculateMaxHP(input.class, input.level, conModifier);
  const hp = input.hp !== undefined ? input.hp : maxHp;

  // Build character object
  const character: Character = {
    id,
    name: input.name,
    race: input.race,
    class: input.class,
    level: input.level,
    background: input.background,
    characterType: input.characterType,
    stats,
    hp,
    maxHp,
    ac: input.ac,
    speed: input.speed,
    proficiencyBonus,
    resistances: input.resistances,
    immunities: input.immunities,
    vulnerabilities: input.vulnerabilities,
    conditionImmunities: input.conditionImmunities,
    spellcastingAbility: input.spellcastingAbility,
    knownSpells: input.knownSpells,
    preparedSpells: input.preparedSpells,
    cantrips: input.cantrips,
    skillProficiencies: input.skillProficiencies,
    saveProficiencies: input.saveProficiencies,
    equipment: input.equipment,
    createdAt: new Date().toISOString(),
  };

  // Save to file
  const dataDir = path.join(DATA_ROOT, 'characters');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const filePath = path.join(dataDir, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(character, null, 2), 'utf-8');

  // Format markdown output
  const markdown = formatCharacterSheet(character);

  return {
    success: true,
    character,
    markdown,
  };
}

// ============================================================
// FORMATTING
// ============================================================

function formatCharacterSheet(character: Character): string {
  const content: string[] = [];
  const box = BOX.LIGHT;
  const WIDTH = 68;

  // Calculate effective stats with conditions
  const effectiveStats = calculateEffectiveStats(character.id, {
    maxHp: character.maxHp,
    hp: character.hp,
    speed: character.speed,
    ac: character.ac,
  });

  // Character Header
  const typeLabel = character.characterType.toUpperCase();
  content.push(centerText(`${character.name}`, WIDTH));
  content.push(centerText(`${typeLabel} - ${character.race} ${character.class} (Level ${character.level})`, WIDTH));
  if (character.background) {
    content.push(centerText(`Background: ${character.background}`, WIDTH));
  }
  content.push('');
  content.push(box.H.repeat(WIDTH));
  content.push('');

  // Combat Stats Section
  content.push(padText('COMBAT STATS', WIDTH, 'center'));
  content.push('');

  // HP Bar - use effective maxHp if modified by conditions
  const displayMaxHp = effectiveStats.maxHp.effective;
  const displayHp = Math.min(character.hp, displayMaxHp); // Clamp current HP to effective max
  const hpBar = createStatusBar(displayHp, displayMaxHp, 40, 'HP');
  content.push(centerText(hpBar, WIDTH));

  // Show HP modification if conditions affect it
  if (effectiveStats.maxHp.modified) {
    const hpNote = `Base: ${character.hp}/${character.maxHp} → Effective: ${displayHp}/${displayMaxHp}`;
    content.push(centerText(hpNote, WIDTH));
  }
  content.push('');

  // Core combat stats in table
  content.push(createTableRow(['AC', 'Speed', 'Initiative', 'Prof Bonus'], [10, 12, 12, 14], 'LIGHT'));

  // Show effective values (with condition modifications if any)
  const displayAC = effectiveStats.ac ? effectiveStats.ac.effective : character.ac;
  const displaySpeed = effectiveStats.speed.effective;

  content.push(createTableRow([
    displayAC.toString() + (effectiveStats.ac?.modified ? '*' : ''),
    `${displaySpeed} ft` + (effectiveStats.speed.modified ? '*' : ''),
    `+${calculateModifier(character.stats.dex)}`,
    `+${character.proficiencyBonus}`
  ], [10, 12, 12, 14], 'LIGHT'));

  // Show condition notes if stats are modified
  if (effectiveStats.speed.modified && effectiveStats.speed.base !== displaySpeed) {
    content.push(padText(`  * Speed: ${effectiveStats.speed.base} ft (base)`, WIDTH, 'left'));
  }
  if (effectiveStats.ac?.modified && effectiveStats.ac.base !== displayAC) {
    content.push(padText(`  * AC: ${effectiveStats.ac.base} (base)`, WIDTH, 'left'));
  }

  content.push('');
  content.push(box.H.repeat(WIDTH));
  content.push('');

  // Ability Scores Section
  content.push(padText('ABILITY SCORES', WIDTH, 'center'));
  content.push('');

  // Ability scores in two rows of three
  const abilities = [
    { key: 'str', name: 'STR' },
    { key: 'dex', name: 'DEX' },
    { key: 'con', name: 'CON' },
    { key: 'int', name: 'INT' },
    { key: 'wis', name: 'WIS' },
    { key: 'cha', name: 'CHA' },
  ];

  // Header
  content.push(createTableRow(
    abilities.slice(0, 3).map(a => a.name),
    [10, 10, 10],
    'LIGHT'
  ));

  // Scores
  content.push(createTableRow(
    abilities.slice(0, 3).map(a => {
      const score = character.stats[a.key as keyof typeof character.stats];
      return `  ${score}`;
    }),
    [10, 10, 10],
    'LIGHT'
  ));

  // Modifiers
  content.push(createTableRow(
    abilities.slice(0, 3).map(a => {
      const score = character.stats[a.key as keyof typeof character.stats];
      const mod = calculateModifier(score);
      return ` ${mod >= 0 ? '+' : ''}${mod}`;
    }),
    [10, 10, 10],
    'LIGHT'
  ));

  content.push('');

  // Second row
  content.push(createTableRow(
    abilities.slice(3, 6).map(a => a.name),
    [10, 10, 10],
    'LIGHT'
  ));

  content.push(createTableRow(
    abilities.slice(3, 6).map(a => {
      const score = character.stats[a.key as keyof typeof character.stats];
      return `  ${score}`;
    }),
    [10, 10, 10],
    'LIGHT'
  ));

  content.push(createTableRow(
    abilities.slice(3, 6).map(a => {
      const score = character.stats[a.key as keyof typeof character.stats];
      const mod = calculateModifier(score);
      return ` ${mod >= 0 ? '+' : ''}${mod}`;
    }),
    [10, 10, 10],
    'LIGHT'
  ));

  // Proficiencies
  if (character.skillProficiencies && character.skillProficiencies.length > 0) {
    content.push('');
    content.push(box.H.repeat(WIDTH));
    content.push('');
    content.push(padText('SKILL PROFICIENCIES', WIDTH, 'center'));
    content.push('');
    const skills = character.skillProficiencies.join(', ');
    content.push(padText(skills, WIDTH, 'left'));
  }

  if (character.saveProficiencies && character.saveProficiencies.length > 0) {
    content.push('');
    content.push(padText('SAVING THROWS: ' + character.saveProficiencies.map(s => s.toUpperCase()).join(', '), WIDTH, 'left'));
  }

  // Resistances/Immunities/Vulnerabilities
  const defenses: string[] = [];
  if (character.resistances && character.resistances.length > 0) {
    defenses.push(`Resistances: ${character.resistances.join(', ')}`);
  }
  if (character.immunities && character.immunities.length > 0) {
    defenses.push(`Immunities: ${character.immunities.join(', ')}`);
  }
  if (character.vulnerabilities && character.vulnerabilities.length > 0) {
    defenses.push(`Vulnerabilities: ${character.vulnerabilities.join(', ')}`);
  }
  if (character.conditionImmunities && character.conditionImmunities.length > 0) {
    defenses.push(`Condition Immunities: ${character.conditionImmunities.join(', ')}`);
  }

  if (defenses.length > 0) {
    content.push('');
    content.push(box.H.repeat(WIDTH));
    content.push('');
    content.push(padText('DEFENSES', WIDTH, 'center'));
    content.push('');
    defenses.forEach(d => content.push(padText(d, WIDTH, 'left')));
  }

  // Spellcasting
  if (character.spellcastingAbility) {
    content.push('');
    content.push(box.H.repeat(WIDTH));
    content.push('');
    content.push(padText('SPELLCASTING', WIDTH, 'center'));
    content.push('');
    content.push(padText(`Ability: ${character.spellcastingAbility.toUpperCase()}`, WIDTH, 'left'));

    if (character.cantrips && character.cantrips.length > 0) {
      content.push(padText(`Cantrips: ${character.cantrips.join(', ')}`, WIDTH, 'left'));
    }
    if (character.knownSpells && character.knownSpells.length > 0) {
      content.push(padText(`Known: ${character.knownSpells.join(', ')}`, WIDTH, 'left'));
    }
    if (character.preparedSpells && character.preparedSpells.length > 0) {
      content.push(padText(`Prepared: ${character.preparedSpells.join(', ')}`, WIDTH, 'left'));
    }
  }

  // Equipment
  if (character.equipment && character.equipment.length > 0) {
    content.push('');
    content.push(box.H.repeat(WIDTH));
    content.push('');
    content.push(padText('EQUIPMENT', WIDTH, 'center'));
    content.push('');
    character.equipment.forEach(item => {
      content.push(padText(`• ${item}`, WIDTH, 'left'));
    });
  }

  // Active Conditions Section (if any)
  const activeConditions = getActiveConditions(character.id);
  if (activeConditions.length > 0 || effectiveStats.conditionEffects.length > 0) {
    content.push('');
    content.push(box.H.repeat(WIDTH));
    content.push('');
    content.push(padText('ACTIVE CONDITIONS', WIDTH, 'center'));
    content.push('');

    // List each condition
    for (const cond of activeConditions) {
      const condName = typeof cond.condition === 'string'
        ? cond.condition.charAt(0).toUpperCase() + cond.condition.slice(1)
        : cond.condition;

      let condLabel = cond.condition === 'exhaustion' && cond.exhaustionLevel
        ? `${condName} (Level ${cond.exhaustionLevel})`
        : condName;

      content.push(padText(`• ${condLabel}`, WIDTH, 'left'));

      // Show source if available
      if (cond.source) {
        content.push(padText(`  Source: ${cond.source}`, WIDTH, 'left'));
      }

      // Show duration
      if (cond.roundsRemaining !== undefined) {
        content.push(padText(`  Duration: ${cond.roundsRemaining} round${cond.roundsRemaining !== 1 ? 's' : ''}`, WIDTH, 'left'));
      } else if (cond.duration && typeof cond.duration === 'string') {
        content.push(padText(`  Duration: ${cond.duration.replace(/_/g, ' ')}`, WIDTH, 'left'));
      }

      content.push('');
    }

    // Show mechanical effects summary
    if (effectiveStats.conditionEffects.length > 0) {
      content.push(padText('MECHANICAL EFFECTS:', WIDTH, 'left'));
      for (const effect of effectiveStats.conditionEffects) {
        content.push(padText(`  ${effect}`, WIDTH, 'left'));
      }
    }
  }

  // Footer
  content.push('');
  content.push(box.H.repeat(WIDTH));
  content.push(centerText(`Character ID: ${character.id}`, WIDTH));
  content.push(centerText(`Created: ${new Date(character.createdAt).toLocaleString()}`, WIDTH));

  return createBox('CHARACTER SHEET', content, undefined, 'HEAVY');
}

// Format character update showing before/after comparison
function formatCharacterUpdate(
  before: Character,
  after: Character,
  updates: z.infer<typeof singleUpdateSchema>
): string {
  const content: string[] = [];
  const box = BOX.LIGHT;
  const WIDTH = 68;

  // Header
  content.push(centerText(`${after.name}`, WIDTH));
  content.push(centerText(`Update Summary`, WIDTH));
  content.push('');
  content.push(box.H.repeat(WIDTH));
  content.push('');

  // Helper function to create before/after row
  const addComparison = (label: string, beforeVal: string, afterVal: string) => {
    const labelPad = 16;
    const valuePad = 24;

    const paddedLabel = label.padEnd(labelPad);
    const beforePadded = beforeVal.padEnd(valuePad);
    const afterPadded = afterVal.padEnd(valuePad);

    content.push(padText(`${paddedLabel}${beforePadded} → ${afterPadded}`, WIDTH, 'left'));
  };

  // Track what changed
  let changesCount = 0;

  // Name
  if (updates.name !== undefined && before.name !== after.name) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    addComparison('Name:', before.name, after.name);
    changesCount++;
  }

  // Level
  if (updates.level !== undefined && before.level !== after.level) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    addComparison('Level:', `${before.level}`, `${after.level}`);
    changesCount++;
  }

  // Proficiency Bonus (auto-calculated from level)
  if (before.proficiencyBonus !== after.proficiencyBonus) {
    addComparison('Prof Bonus:', `+${before.proficiencyBonus}`, `+${after.proficiencyBonus}`);
    changesCount++;
  }

  // HP
  if (updates.hp !== undefined && before.hp !== after.hp) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    addComparison('HP:', `${before.hp}/${before.maxHp}`, `${after.hp}/${after.maxHp}`);
    changesCount++;
  }

  // Max HP (could change from CON/level/class changes)
  if (before.maxHp !== after.maxHp && updates.hp === undefined) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    addComparison('Max HP:', `${before.maxHp}`, `${after.maxHp}`);
    changesCount++;
  }

  // AC
  if (updates.ac !== undefined && before.ac !== after.ac) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    addComparison('AC:', `${before.ac}`, `${after.ac}`);
    changesCount++;
  }

  // Speed
  if (updates.speed !== undefined && before.speed !== after.speed) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    addComparison('Speed:', `${before.speed} ft`, `${after.speed} ft`);
    changesCount++;
  }

  // Race
  if (updates.race !== undefined && before.race !== after.race) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    addComparison('Race:', before.race, after.race);
    changesCount++;
  }

  // Class
  if (updates.class !== undefined && before.class !== after.class) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    addComparison('Class:', before.class, after.class);
    changesCount++;
  }

  // Ability Scores
  const abilities: Array<{ key: keyof Character['stats']; name: string }> = [
    { key: 'str', name: 'STR' },
    { key: 'dex', name: 'DEX' },
    { key: 'con', name: 'CON' },
    { key: 'int', name: 'INT' },
    { key: 'wis', name: 'WIS' },
    { key: 'cha', name: 'CHA' },
  ];

  abilities.forEach(({ key, name }) => {
    if (before.stats[key] !== after.stats[key]) {
      if (changesCount === 0) {
        content.push(centerText('CHANGES', WIDTH));
        content.push('');
      }
      const beforeMod = calculateModifier(before.stats[key]);
      const afterMod = calculateModifier(after.stats[key]);
      addComparison(
        `${name}:`,
        `${before.stats[key]} (${beforeMod >= 0 ? '+' : ''}${beforeMod})`,
        `${after.stats[key]} (${afterMod >= 0 ? '+' : ''}${afterMod})`
      );
      changesCount++;
    }
  });

  // Equipment
  if (updates.equipment !== undefined) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    content.push('');
    content.push(padText('Equipment:', WIDTH, 'left'));
    after.equipment?.forEach(item => {
      content.push(padText(`  • ${item}`, WIDTH, 'left'));
    });
    changesCount++;
  }

  // Spellcasting
  if (updates.spellcastingAbility !== undefined || updates.cantrips !== undefined ||
      updates.knownSpells !== undefined || updates.preparedSpells !== undefined) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    content.push('');
    content.push(padText('Spellcasting:', WIDTH, 'left'));
    if (after.spellcastingAbility) {
      content.push(padText(`  Ability: ${after.spellcastingAbility.toUpperCase()}`, WIDTH, 'left'));
    }
    if (after.cantrips && after.cantrips.length > 0) {
      content.push(padText(`  Cantrips: ${after.cantrips.join(', ')}`, WIDTH, 'left'));
    }
    if (after.knownSpells && after.knownSpells.length > 0) {
      content.push(padText(`  Known: ${after.knownSpells.join(', ')}`, WIDTH, 'left'));
    }
    if (after.preparedSpells && after.preparedSpells.length > 0) {
      content.push(padText(`  Prepared: ${after.preparedSpells.join(', ')}`, WIDTH, 'left'));
    }
    changesCount++;
  }

  // Resistances/Immunities
  if (updates.resistances !== undefined && after.resistances && after.resistances.length > 0) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    content.push('');
    content.push(padText(`Resistances: ${after.resistances.join(', ')}`, WIDTH, 'left'));
    changesCount++;
  }

  if (updates.immunities !== undefined && after.immunities && after.immunities.length > 0) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    content.push('');
    content.push(padText(`Immunities: ${after.immunities.join(', ')}`, WIDTH, 'left'));
    changesCount++;
  }

  // Footer
  content.push('');
  content.push(box.H.repeat(WIDTH));
  content.push(centerText(`Character ID: ${after.id}`, WIDTH));
  content.push(centerText(`Updated: ${new Date().toLocaleString()}`, WIDTH));

  return createBox('CHARACTER UPDATE', content, undefined, 'HEAVY');
}

// ============================================================
// UPDATE CHARACTER HANDLER
// ============================================================

export function updateCharacter(input: UpdateCharacterInput): {
  success: boolean;
  character?: Character;
  markdown: string;
  error?: string;
} {
  // Check if this is a batch operation
  if ('batch' in input && input.batch) {
    return updateCharacterBatch(input.batch);
  }

  // Type assertion: we know it's a single update at this point
  const singleInput = input as z.infer<typeof singleUpdateSchema>;

  const dataDir = path.join(DATA_ROOT, 'characters');

  // Resolve character ID (either from direct ID or by name lookup)
  let characterId: string | undefined = singleInput.characterId;
  if (!characterId && singleInput.characterName) {
    const foundId = findCharacterByName(singleInput.characterName);
    if (!foundId) {
      return {
        success: false,
        markdown: '',
        error: `Character not found with name: ${singleInput.characterName}`,
      };
    }
    characterId = foundId;
  }

  if (!characterId) {
    return {
      success: false,
      markdown: '',
      error: 'Character ID or name is required',
    };
  }

  const filePath = path.join(dataDir, `${characterId}.json`);

  // Check if character exists
  if (!fs.existsSync(filePath)) {
    return {
      success: false,
      markdown: '',
      error: `Character not found: ${characterId}`,
    };
  }

  // Read existing character
  let originalCharacter: Character;
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    originalCharacter = JSON.parse(fileContent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: '',
      error: `Failed to read character: ${message}`,
    };
  }

  // Create updated character by merging changes
  const updatedCharacter: Character = { ...originalCharacter };

  // Apply updates
  if (singleInput.name !== undefined) updatedCharacter.name = singleInput.name;
  if (singleInput.race !== undefined) updatedCharacter.race = singleInput.race;
  if (singleInput.class !== undefined) updatedCharacter.class = singleInput.class;
  if (singleInput.level !== undefined) updatedCharacter.level = singleInput.level;
  if (singleInput.background !== undefined) updatedCharacter.background = singleInput.background;
  if (singleInput.characterType !== undefined) updatedCharacter.characterType = singleInput.characterType;
  if (singleInput.ac !== undefined) updatedCharacter.ac = singleInput.ac;
  if (singleInput.speed !== undefined) updatedCharacter.speed = singleInput.speed;
  if (singleInput.resistances !== undefined) updatedCharacter.resistances = singleInput.resistances;
  if (singleInput.immunities !== undefined) updatedCharacter.immunities = singleInput.immunities;
  if (singleInput.vulnerabilities !== undefined) updatedCharacter.vulnerabilities = singleInput.vulnerabilities;
  if (singleInput.conditionImmunities !== undefined) updatedCharacter.conditionImmunities = singleInput.conditionImmunities;
  if (singleInput.spellcastingAbility !== undefined) updatedCharacter.spellcastingAbility = singleInput.spellcastingAbility;
  if (singleInput.knownSpells !== undefined) updatedCharacter.knownSpells = singleInput.knownSpells;
  if (singleInput.preparedSpells !== undefined) updatedCharacter.preparedSpells = singleInput.preparedSpells;
  if (singleInput.cantrips !== undefined) updatedCharacter.cantrips = singleInput.cantrips;
  if (singleInput.skillProficiencies !== undefined) updatedCharacter.skillProficiencies = singleInput.skillProficiencies;
  if (singleInput.saveProficiencies !== undefined) updatedCharacter.saveProficiencies = singleInput.saveProficiencies;
  if (singleInput.equipment !== undefined) updatedCharacter.equipment = singleInput.equipment;

  // Handle stats (partial update)
  if (singleInput.stats !== undefined) {
    updatedCharacter.stats = {
      ...originalCharacter.stats,
      ...singleInput.stats,
    };
  }

  // Recalculate derived stats if needed
  const conModifier = calculateModifier(updatedCharacter.stats.con);

  // Recalculate proficiency bonus if level changed
  if (singleInput.level !== undefined) {
    updatedCharacter.proficiencyBonus = calculateProficiencyBonus(updatedCharacter.level);
  }

  // Recalculate maxHp if class, level, or CON changed
  if (singleInput.class !== undefined || singleInput.level !== undefined || singleInput.stats?.con !== undefined) {
    const newMaxHp = calculateMaxHP(updatedCharacter.class, updatedCharacter.level, conModifier);
    updatedCharacter.maxHp = newMaxHp;

    // If current HP is over the new max, cap it
    if (updatedCharacter.hp > newMaxHp) {
      updatedCharacter.hp = newMaxHp;
    }
  }

  // Apply maxHp override if provided
  if (singleInput.maxHp !== undefined) {
    updatedCharacter.maxHp = singleInput.maxHp;
  }

  // Apply healing if provided (explicit healing parameter takes precedence)
  if (singleInput.healing !== undefined) {
    const newHp = Math.min(updatedCharacter.maxHp, updatedCharacter.hp + singleInput.healing);
    updatedCharacter.hp = newHp;
  }
  // Apply HP update if provided (supports relative values like "+8" or "-15")
  else if (singleInput.hp !== undefined) {
    let newHp: number;

    if (typeof singleInput.hp === 'string') {
      // String delta notation (e.g., "+8" for healing, "-15" for damage)
      const delta = parseInt(singleInput.hp, 10);
      newHp = Math.max(0, Math.min(updatedCharacter.maxHp, updatedCharacter.hp + delta));
    } else if (singleInput.hp < 0) {
      // Numeric delta notation (e.g., -12 for damage)
      // Negative numbers are always treated as deltas
      const delta = singleInput.hp;
      newHp = Math.max(0, Math.min(updatedCharacter.maxHp, updatedCharacter.hp + delta));
    } else {
      // Absolute HP update (positive number or zero)
      newHp = singleInput.hp;

      // Validate HP doesn't exceed maxHp
      if (newHp > updatedCharacter.maxHp) {
        return {
          success: false,
          markdown: '',
          error: `HP (${newHp}) cannot exceed max HP (${updatedCharacter.maxHp})`,
        };
      }
    }

    updatedCharacter.hp = newHp;
  }

  // Save updated character
  try {
    fs.writeFileSync(filePath, JSON.stringify(updatedCharacter, null, 2), 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: '',
      error: `Failed to save character: ${message}`,
    };
  }

  // Format output showing before/after comparison
  const markdown = formatCharacterUpdate(originalCharacter, updatedCharacter, singleInput);

  return {
    success: true,
    character: updatedCharacter,
    markdown,
  };
}

// ============================================================
// BATCH UPDATE CHARACTER
// ============================================================

function updateCharacterBatch(updates: Array<z.infer<typeof singleUpdateSchema>>): {
  success: boolean;
  markdown: string;
  error?: string;
} {
  const results: Array<{
    name: string;
    success: boolean;
    hpBefore?: number;
    hpAfter?: number;
    maxHp?: number;
    changes: string[];
    error?: string;
  }> = [];

  // Process each update
  for (const update of updates) {
    // Resolve character ID
    let characterId: string | undefined = update.characterId;
    if (!characterId && update.characterName) {
      const foundId = findCharacterByName(update.characterName);
      if (!foundId) {
        results.push({
          name: update.characterName || update.characterId || 'Unknown',
          success: false,
          changes: [],
          error: `Character not found: ${update.characterName}`,
        });
        continue;
      }
      characterId = foundId;
    }

    if (!characterId) {
      results.push({
        name: 'Unknown',
        success: false,
        changes: [],
        error: 'No character ID or name provided',
      });
      continue;
    }

    // Perform single update
    const singleResult = updateCharacter(update as any);

    if (!singleResult.success) {
      results.push({
        name: update.characterName || update.characterId || 'Unknown',
        success: false,
        changes: [],
        error: singleResult.error,
      });
      continue;
    }

    // Track what changed
    const changes: string[] = [];
    const char = singleResult.character!;

    if (update.hp !== undefined) {
      results.push({
        name: char.name,
        success: true,
        hpBefore: typeof update.hp === 'string' ? char.hp - parseInt(update.hp, 10) : undefined,
        hpAfter: char.hp,
        maxHp: char.maxHp,
        changes,
      });
    } else {
      results.push({
        name: char.name,
        success: true,
        changes,
      });
    }
  }

  // Format batch output
  return {
    success: true,
    markdown: formatBatchUpdate(results),
  };
}

function formatBatchUpdate(results: Array<{
  name: string;
  success: boolean;
  hpBefore?: number;
  hpAfter?: number;
  maxHp?: number;
  changes: string[];
  error?: string;
}>): string {
  const content: string[] = [];
  const box = BOX.LIGHT;

  content.push(centerText(`Updated ${results.length} character${results.length !== 1 ? 's' : ''}`, 68));
  content.push('');
  content.push(box.H.repeat(68));
  content.push('');

  for (const result of results) {
    if (!result.success) {
      content.push(padText(`✗ ${result.name}`, 68, 'left'));
      content.push(padText(`  Error: ${result.error}`, 68, 'left'));
    } else {
      content.push(padText(`✓ ${result.name}`, 68, 'left'));

      if (result.hpBefore !== undefined && result.hpAfter !== undefined) {
        const hpBar = createStatusBar(result.hpAfter, result.maxHp || result.hpAfter, 40, 'HP');
        content.push(padText(`  HP: ${result.hpBefore} → ${result.hpAfter}/${result.maxHp}`, 68, 'left'));
        content.push(padText(`  ${hpBar}`, 68, 'left'));
      }
    }

    content.push('');
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;

  content.push(box.H.repeat(68));
  content.push(centerText(`Success: ${successCount} | Failed: ${failCount}`, 68));

  return createBox('BATCH CHARACTER UPDATE', content, undefined, 'HEAVY');
}

// ============================================================
// GET CHARACTER HANDLER
// ============================================================

export function getCharacter(input: GetCharacterInput): {
  success: boolean;
  character?: Character;
  markdown: string;
  error?: string;
} {
  // Check if this is a batch operation
  if ('batch' in input && input.batch) {
    return getCharacterBatch(input.batch);
  }

  // Type assertion: we know it's a single get at this point
  const singleInput = input as z.infer<typeof singleGetSchema>;

  const dataDir = path.join(DATA_ROOT, 'characters');

  // Resolve character ID (either from direct ID or by name lookup)
  let characterId: string | undefined = singleInput.characterId;
  if (!characterId && singleInput.characterName) {
    const foundId = findCharacterByName(singleInput.characterName);
    if (!foundId) {
      return {
        success: false,
        markdown: '',
        error: `Character not found with name: ${singleInput.characterName}`,
      };
    }
    characterId = foundId;
  }

  if (!characterId) {
    return {
      success: false,
      markdown: '',
      error: 'Character ID or name is required',
    };
  }

  const filePath = path.join(dataDir, `${characterId}.json`);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return {
      success: false,
      markdown: '',
      error: `Character not found: ${characterId}`,
    };
  }

  // Read and parse character data
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const character: Character = JSON.parse(fileContent);

    // Format markdown output using the same formatter as create
    const markdown = formatCharacterSheet(character);

    return {
      success: true,
      character,
      markdown,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: '',
      error: `Failed to read character: ${message}`,
    };
  }
}

// ============================================================
// BATCH GET CHARACTER
// ============================================================

function getCharacterBatch(requests: Array<z.infer<typeof singleGetSchema>>): {
  success: boolean;
  markdown: string;
  error?: string;
} {
  const characters: Character[] = [];
  const errors: Array<{ name: string; error: string }> = [];

  // Fetch each character
  for (const request of requests) {
    const result = getCharacter(request as any);

    if (result.success && result.character) {
      characters.push(result.character);
    } else {
      errors.push({
        name: request.characterName || request.characterId || 'Unknown',
        error: result.error || 'Unknown error',
      });
    }
  }

  // Format party roster
  return {
    success: true,
    markdown: formatPartyRoster(characters, errors),
  };
}

function formatPartyRoster(characters: Character[], errors: Array<{ name: string; error: string }>): string {
  const content: string[] = [];
  const box = BOX.LIGHT;

  content.push(centerText(`Party Roster (${characters.length} character${characters.length !== 1 ? 's' : ''})`, 68));
  content.push('');
  content.push(box.H.repeat(68));
  content.push('');

  for (const char of characters) {
    // Character name and class/level
    content.push(padText(`${char.name} - ${char.race} ${char.class} ${char.level}`, 68, 'left'));

    // HP bar
    const hpBar = createStatusBar(char.hp, char.maxHp, 40, 'HP');
    content.push(padText(`  ${hpBar}`, 68, 'left'));

    // Quick stats
    const stats = `AC ${char.ac} | SPD ${char.speed}ft | INIT +${calculateModifier(char.stats.dex)}`;
    content.push(padText(`  ${stats}`, 68, 'left'));

    content.push('');
  }

  // Show errors if any
  if (errors.length > 0) {
    content.push(box.H.repeat(68));
    content.push(centerText('ERRORS', 68));
    content.push('');

    for (const err of errors) {
      content.push(padText(`✗ ${err.name}: ${err.error}`, 68, 'left'));
    }

    content.push('');
  }

  return createBox('PARTY STATUS', content, undefined, 'HEAVY');
}

// ============================================================
// ROLL CHECK HANDLER
// ============================================================

// Skill to ability mapping (D&D 5e standard)
const SKILL_ABILITIES: Record<string, string> = {
  acrobatics: 'dex',
  animal_handling: 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  sleight_of_hand: 'dex',
  stealth: 'dex',
  survival: 'wis',
};

// ============================================================
// ROLL CHECK HELPER FUNCTIONS
// ============================================================

/**
 * Formats a snake_case skill name to Title Case
 * Example: "sleight_of_hand" -> "Sleight Of Hand"
 */
function formatSkillName(skill: string): string {
  return skill.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Formats a modifier with sign prefix
 * Example: 3 -> "+3", -2 -> "-2", 0 -> "+0"
 */
function formatModifierSign(modifier: number): string {
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

/**
 * Determines the roll mode based on advantage/disadvantage flags
 */
function determineRollMode(
  advantage?: boolean,
  disadvantage?: boolean
): 'normal' | 'advantage' | 'disadvantage' | 'cancelled' {
  if (advantage && disadvantage) {
    return 'cancelled';
  } else if (advantage) {
    return 'advantage';
  } else if (disadvantage) {
    return 'disadvantage';
  }
  return 'normal';
}

/**
 * Builds a dice expression string based on modifier and roll mode
 */
function buildDiceExpression(totalMod: number, rollMode: 'normal' | 'advantage' | 'disadvantage' | 'cancelled'): string {
  const modPart = totalMod >= 0 ? `+${totalMod}` : `${totalMod}`;
  
  switch (rollMode) {
    case 'advantage':
      return `2d20kh1${modPart}`;
    case 'disadvantage':
      return `2d20kl1${modPart}`;
    default:
      return `1d20${modPart}`;
  }
}

/**
 * Extracts the natural roll from dice results based on roll mode
 */
function extractNaturalRoll(rolls: number[], rollMode: 'normal' | 'advantage' | 'disadvantage' | 'cancelled'): number {
  if (rollMode === 'advantage') {
    return Math.max(...rolls);
  } else if (rollMode === 'disadvantage') {
    return Math.min(...rolls);
  }
  return rolls[0];
}

/**
 * Result interface for internal roll data (used by contested checks)
 */
interface RollResult {
  checkName: string;
  abilityKey: string;
  abilityMod: number;
  profMod: number;
  bonusMod: number;
  totalMod: number;
  rollMode: 'normal' | 'advantage' | 'disadvantage' | 'cancelled';
  rolls: number[];
  naturalRoll: number;
  total: number;
  dcResult?: 'success' | 'failure';
}

/**
 * Performs the core roll logic and returns structured data
 * Used internally by rollCheck() and handleContestedCheck()
 */
function performRoll(
  input: RollCheckInput,
  character?: Character
): { success: true; result: RollResult } | { success: false; error: string } {
  // Determine ability to use and check name
  let abilityKey: string;
  let checkName: string;

  if (input.checkType === 'initiative') {
    abilityKey = 'dex';
    checkName = 'Initiative';
  } else if (input.checkType === 'skill') {
    abilityKey = SKILL_ABILITIES[input.skill!];
    checkName = formatSkillName(input.skill!);
  } else {
    abilityKey = input.ability!;
    checkName = input.ability!.toUpperCase();
    if (input.checkType === 'save') {
      checkName += ' Save';
    } else if (input.checkType === 'attack') {
      checkName = 'Attack Roll';
    } else {
      checkName += ' Check';
    }
  }

  // Calculate modifiers from character (if provided)
  let abilityMod = 0;
  let proficiencyBonus = 0;
  let isProficient = false;

  if (character) {
    const abilityScore = character.stats[abilityKey as keyof typeof character.stats];
    abilityMod = calculateModifier(abilityScore);
    proficiencyBonus = character.proficiencyBonus;

    // Check proficiency based on check type
    if (input.checkType === 'skill' && character.skillProficiencies) {
      isProficient = character.skillProficiencies.includes(input.skill!);
    } else if (input.checkType === 'save' && character.saveProficiencies) {
      isProficient = character.saveProficiencies.includes(input.ability!);
    } else if (input.checkType === 'attack') {
      isProficient = true; // Always add proficiency to attacks
    }
  }

  const profMod = isProficient ? proficiencyBonus : 0;
  const bonusMod = input.bonus || 0;
  const totalMod = abilityMod + profMod + bonusMod;

  // Determine roll mode and build dice expression using helpers
  const rollMode = determineRollMode(input.advantage, input.disadvantage);
  const diceExpression = buildDiceExpression(totalMod, rollMode);

  // Execute the roll
  const diceResult = parseDice(diceExpression);
  const naturalRoll = extractNaturalRoll(diceResult.rolls, rollMode);
  const total = diceResult.total;

  return {
    success: true,
    result: {
      checkName,
      abilityKey,
      abilityMod,
      profMod,
      bonusMod,
      totalMod,
      rollMode,
      rolls: diceResult.rolls,
      naturalRoll,
      total,
    },
  };
}

/**
 * Evaluates DC check result, handling auto-success/fail for saving throws
 */
function evaluateDCResult(
  checkType: string,
  naturalRoll: number,
  total: number,
  dc: number
): 'success' | 'failure' {
  // Natural 20 on saves = auto success
  if (checkType === 'save' && naturalRoll === 20) {
    return 'success';
  }
  // Natural 1 on saves = auto fail
  if (checkType === 'save' && naturalRoll === 1) {
    return 'failure';
  }
  // Normal DC check
  return total >= dc ? 'success' : 'failure';
}

export function rollCheck(input: RollCheckInput): {
  success: boolean;
  markdown: string;
  error?: string;
} {
  // Validate check-specific requirements
  if (input.checkType === 'skill' && !input.skill) {
    return {
      success: false,
      markdown: '',
      error: 'skill is required for skill checks',
    };
  }

  if ((input.checkType === 'ability' || input.checkType === 'save' || input.checkType === 'attack') && !input.ability) {
    return {
      success: false,
      markdown: '',
      error: `ability is required for ${input.checkType} checks`,
    };
  }

  // Load character if provided
  let character: Character | undefined;
  if (input.characterId || input.characterName) {
    const charResult = getCharacter({
      characterId: input.characterId,
      characterName: input.characterName,
    } as any);

    if (!charResult.success || !charResult.character) {
      return {
        success: false,
        markdown: '',
        error: charResult.error || 'Character not found',
      };
    }

    character = charResult.character;
  }

  // Handle contested checks separately
  if (input.contestedBy && input.contestedCheck) {
    return handleContestedCheck(input, character);
  }

  // Perform the roll using helper function
  const rollResult = performRoll(input, character);
  if (!rollResult.success) {
    return {
      success: false,
      markdown: '',
      error: rollResult.error,
    };
  }

  const result = rollResult.result;

  // Evaluate DC if provided
  let dcResult: 'success' | 'failure' | undefined;
  if (input.dc !== undefined) {
    dcResult = evaluateDCResult(input.checkType, result.naturalRoll, result.total, input.dc);
  }

  // Format output
  const markdown = formatCheckResult({
    checkType: input.checkType,
    checkName: result.checkName,
    character: character?.name,
    abilityKey: result.abilityKey,
    abilityMod: result.abilityMod,
    profMod: result.profMod,
    bonusMod: result.bonusMod,
    totalMod: result.totalMod,
    rollMode: result.rollMode,
    rolls: result.rolls,
    naturalRoll: result.naturalRoll,
    total: result.total,
    dc: input.dc,
    dcResult,
  });

  return {
    success: true,
    markdown,
  };
}

/**
 * Handles contested checks between two characters
 * Uses performRoll() directly for structured data instead of parsing markdown
 */
function handleContestedCheck(
  input: RollCheckInput,
  character1: Character | undefined
): {
  success: boolean;
  markdown: string;
  error?: string;
} {
  // Load contested character
  const charResult = getCharacter({ characterId: input.contestedBy } as any);
  if (!charResult.success || !charResult.character) {
    return {
      success: false,
      markdown: '',
      error: charResult.error || 'Contested character not found',
    };
  }

  const character2 = charResult.character;

  // Perform roll for character 1 using structured data (avoids regex parsing)
  const roll1 = performRoll(input, character1);
  if (!roll1.success) {
    return {
      success: false,
      markdown: '',
      error: roll1.error,
    };
  }

  // Build input for character 2's contested check
  const contestedInput: RollCheckInput = {
    characterId: character2.id,
    checkType: input.contestedCheck!.type,
    skill: input.contestedCheck!.type === 'skill' ? input.contestedCheck!.skillOrAbility as any : undefined,
    ability: input.contestedCheck!.type === 'ability' ? input.contestedCheck!.skillOrAbility as any : undefined,
  };

  // Perform roll for character 2 using structured data (avoids regex parsing)
  const roll2 = performRoll(contestedInput, character2);
  if (!roll2.success) {
    return {
      success: false,
      markdown: '',
      error: roll2.error,
    };
  }

  // Use structured data directly instead of parsing markdown
  const total1 = roll1.result.total;
  const total2 = roll2.result.total;

  // Get check names from structured result (already formatted by performRoll)
  const check1Name = roll1.result.checkName;
  const check2Name = roll2.result.checkName;

  // Determine winner (ties favor defender - character 2)
  let winner: string;
  if (total1 > total2) {
    winner = character1?.name || 'Character 1';
  } else if (total2 > total1) {
    winner = character2.name;
  } else {
    winner = 'Tie (defender wins)';
  }

  // Format contested output
  const content: string[] = [];
  const WIDTH = 68;

  content.push(centerText('CONTESTED CHECK', WIDTH));
  content.push('');
  content.push(BOX.LIGHT.H.repeat(WIDTH));
  content.push('');

  const char1Name = character1?.name || 'Unknown';
  const char2Name = character2.name;

  content.push(padText(`${char1Name} (${check1Name}): ${total1}`, WIDTH, 'left'));
  content.push(padText(`${char2Name} (${check2Name}): ${total2}`, WIDTH, 'left'));
  content.push('');
  content.push(centerText(`${total1} vs ${total2}`, WIDTH));
  content.push('');
  content.push(BOX.LIGHT.H.repeat(WIDTH));
  content.push('');
  content.push(centerText(`WINNER: ${winner}`, WIDTH));

  return {
    success: true,
    markdown: createBox('CONTESTED CHECK', content, undefined, 'HEAVY'),
  };
}

/**
 * Formats a roll check result into rich ASCII art output
 * Uses helper functions for DRY code and consistent formatting
 */
function formatCheckResult(params: {
  checkType: string;
  checkName: string;
  character?: string;
  abilityKey: string;
  abilityMod: number;
  profMod: number;
  bonusMod: number;
  totalMod: number;
  rollMode: 'normal' | 'advantage' | 'disadvantage' | 'cancelled';
  rolls: number[];
  naturalRoll: number;
  total: number;
  dc?: number;
  dcResult?: 'success' | 'failure';
}): string {
  const content: string[] = [];
  const WIDTH = 68;
  const box = BOX.LIGHT;

  // Determine critical roll status for visual indicators
  const isNat20 = params.naturalRoll === 20;
  const isNat1 = params.naturalRoll === 1;
  const criticalIndicator = isNat20 ? ' ⭐' : isNat1 ? ' 💀' : '';

  // Title - build properly based on check type (using formatSkillName helper)
  let title: string;

  if (params.checkType === 'save') {
    title = 'SAVING THROW';
  } else if (params.checkType === 'attack') {
    title = 'ATTACK ROLL';
  } else if (params.checkType === 'initiative') {
    title = 'INITIATIVE';
  } else if (params.checkType === 'skill') {
    // Use helper function for consistent title-casing
    const skillName = formatSkillName(params.checkName);
    title = skillName.toUpperCase() + ' CHECK';
  } else {
    // Ability check
    title = params.abilityKey.toUpperCase() + ' Check';
  }

  content.push(centerText(title, WIDTH));

  if (params.character) {
    content.push(centerText(`Character: ${params.character}`, WIDTH));
  }

  content.push('');
  content.push(box.H.repeat(WIDTH));
  content.push('');

  // Add check type description for certain types (using helper)
  if (params.checkType === 'skill' && params.checkName) {
    const skillName = formatSkillName(params.checkName);
    content.push(padText(`Check Type: ${skillName}`, WIDTH, 'left'));
  } else if (params.checkType === 'save') {
    content.push(padText('Check Type: Save (SAVE)', WIDTH, 'left'));
  } else if (params.checkType === 'initiative') {
    content.push(padText('Check Type: Initiative', WIDTH, 'left'));
  } else if (params.checkType === 'attack') {
    content.push(padText('Check Type: Attack Roll', WIDTH, 'left'));
  }

  // Roll information with Advantage/Disadvantage indication and critical indicators
  if (params.rollMode === 'advantage') {
    const keptRoll = Math.max(...params.rolls);
    const keptIndicator = keptRoll === 20 ? ' ⭐' : keptRoll === 1 ? ' 💀' : '';
    content.push(padText(`Rolls: [${params.rolls.join(', ')}] (Advantage - kept ${keptRoll}${keptIndicator})`, WIDTH, 'left'));
  } else if (params.rollMode === 'disadvantage') {
    const keptRoll = Math.min(...params.rolls);
    const keptIndicator = keptRoll === 20 ? ' ⭐' : keptRoll === 1 ? ' 💀' : '';
    content.push(padText(`Rolls: [${params.rolls.join(', ')}] (Disadvantage - kept ${keptRoll}${keptIndicator})`, WIDTH, 'left'));
  } else if (params.rollMode === 'cancelled') {
    // Both advantage and disadvantage cancel out
    content.push(padText(`Roll: ${params.naturalRoll}${criticalIndicator} (Cancel - Advantage and Disadvantage neither apply)`, WIDTH, 'left'));
  } else {
    content.push(padText(`Roll: ${params.naturalRoll}${criticalIndicator}`, WIDTH, 'left'));
  }

  // Modifier breakdown using helper function for consistent sign formatting
  const abilityName = params.abilityKey.toUpperCase();
  content.push(padText(`${abilityName} Modifier: ${formatModifierSign(params.abilityMod)}`, WIDTH, 'left'));

  if (params.profMod > 0) {
    content.push(padText(`Proficiency Bonus: ${formatModifierSign(params.profMod)}`, WIDTH, 'left'));
  }

  if (params.bonusMod !== 0) {
    content.push(padText(`Additional Bonus: ${formatModifierSign(params.bonusMod)}`, WIDTH, 'left'));
  }

  // Display total modifier if there are multiple components
  if (params.profMod > 0 || params.bonusMod !== 0) {
    content.push(padText(`Total Modifier: ${formatModifierSign(params.totalMod)}`, WIDTH, 'left'));
  }

  content.push('');
  content.push(box.H.repeat(WIDTH));
  content.push(centerText(`Total: ${params.total}`, WIDTH));

  // DC result with enhanced visual feedback
  if (params.dc !== undefined && params.dcResult) {
    content.push('');
    const resultSymbol = params.dcResult === 'success' ? '✓ SUCCESS' : '✗ FAILURE';
    content.push(centerText(`DC ${params.dc}: ${resultSymbol}`, WIDTH));
  }

  return createBox(title, content, undefined, 'HEAVY');
}
