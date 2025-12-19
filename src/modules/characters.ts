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
  ToolResponse,
  toResponse,
  formatHpBar,
  formatAbilityScores,
  formatConditionIcon,
  formatModifier,
  calculateModifier as calculateModifierMarkdown
} from './markdown-format.js';
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

  // Format markdown output as ToolResponse JSON
  const markdown = formatCharacterDisplay(character);

  return {
    success: true,
    character,
    markdown,
  };
}

// ============================================================
// FORMATTING
// ============================================================

/**
 * Formats a character as Semantic Markdown with ToolResponse JSON
 * Returns the JSON stringified ToolResponse instead of ASCII art
 */
function formatCharacterDisplay(character: Character): string {
  const display: string[] = [];

  // Header
  display.push(`## ⚔️ Character Created: ${character.name}`);
  display.push('');
  display.push(`**Level ${character.level} ${character.race} ${character.class}**`);
  display.push('');

  // Vital Stats section
  display.push('### Vital Stats');
  display.push(`- **HP:** ${formatHpBar(character.hp, character.maxHp)}`);
  display.push(`- **AC:** ${character.ac}`);
  display.push(`- **Speed:** ${character.speed} ft`);
  display.push(`- **Initiative:** +${calculateModifierMarkdown(character.stats.dex)}`);
  display.push(`- **Proficiency:** +${character.proficiencyBonus}`);
  display.push('');

  // Ability Scores section (using the markdown formatter)
  display.push('### Ability Scores');
  display.push('');
  display.push(formatAbilityScores(character.stats));
  display.push('');

  // Active Conditions (if any)
  const activeConditions = getActiveConditions(character.id);
  if (activeConditions.length > 0) {
    display.push('### Active Conditions');
    display.push('');
    for (const cond of activeConditions) {
      const condName = typeof cond.condition === 'string'
        ? cond.condition.charAt(0).toUpperCase() + cond.condition.slice(1)
        : cond.condition;
      const icon = formatConditionIcon(cond.condition);
      display.push(`- ${icon} **${condName}**`);
      if (cond.roundsRemaining !== undefined) {
        display.push(`  Duration: ${cond.roundsRemaining} round${cond.roundsRemaining !== 1 ? 's' : ''}`);
      }
    }
    display.push('');
  }

  // Equipment (if any)
  if (character.equipment && character.equipment.length > 0) {
    display.push('### Equipment');
    display.push('');
    character.equipment.forEach(item => {
      display.push(`- ${item}`);
    });
    display.push('');
  }

  // Footer
  display.push('---');
  display.push(`*Character ID: \`${character.id}\`*`);
  display.push('');
  display.push('**Next:** Add equipment and background, set character portrait description');

  // Build the ToolResponse
  const response: ToolResponse = {
    display: display.join('\n'),
    data: {
      success: true,
      type: 'character',
      character: {
        id: character.id,
        name: character.name,
        level: character.level,
        class: character.class,
        race: character.race,
        hp: { current: character.hp, max: character.maxHp },
        ac: character.ac,
        speed: character.speed,
        stats: character.stats,
        proficiencyBonus: character.proficiencyBonus,
      },
    },
    suggestions: [
      'Add equipment and background',
      'Roll for ability scores with 4d6 drop lowest',
      'Set character portrait description',
    ],
  };

  return toResponse(response);
}

/**
 * Formats a character for get_character as Semantic Markdown with ToolResponse JSON
 * Returns the JSON stringified ToolResponse
 */
function formatGetCharacterDisplay(character: Character): string {
  const display: string[] = [];

  // Header
  display.push(`## 📜 ${character.name}`);
  display.push('');
  display.push(`**Level ${character.level} ${character.race} ${character.class}**`);
  display.push('');

  // Combat Stats table
  display.push('### Combat Stats');
  const initMod = calculateModifierMarkdown(character.stats.dex);
  display.push('| HP | AC | Speed | Init |');
  display.push('|:--:|:--:|:-----:|:----:|');
  display.push(`| ${character.hp}/${character.maxHp} | ${character.ac} | ${character.speed} ft | +${initMod} |`);
  display.push('');
  display.push(formatHpBar(character.hp, character.maxHp));
  display.push('');

  // Ability Scores section
  display.push('### Ability Scores');
  display.push('');
  display.push(formatAbilityScores(character.stats));
  display.push('');

  // Active Conditions
  display.push('### Active Conditions');
  const activeConditions = getActiveConditions(character.id);
  if (activeConditions.length > 0) {
    for (const cond of activeConditions) {
      const condName = typeof cond.condition === 'string'
        ? cond.condition.charAt(0).toUpperCase() + cond.condition.slice(1)
        : cond.condition;
      const icon = formatConditionIcon(cond.condition);
      let condLine = `- ${icon} **${condName}**`;
      if (cond.roundsRemaining !== undefined) {
        condLine += ` (${cond.roundsRemaining} round${cond.roundsRemaining !== 1 ? 's' : ''})`;
      }
      display.push(condLine);
    }
  } else {
    display.push('None');
  }
  display.push('');

  // Equipment (if any)
  if (character.equipment && character.equipment.length > 0) {
    display.push('### Equipment');
    character.equipment.forEach(item => {
      display.push(`- ${item}`);
    });
    display.push('');
  }

  // Footer
  display.push('---');
  display.push(`*ID: \`${character.id}\`*`);

  // Build the ToolResponse
  const response: ToolResponse = {
    display: display.join('\n'),
    data: {
      success: true,
      type: 'character',
      character: {
        id: character.id,
        name: character.name,
        level: character.level,
        class: character.class,
        race: character.race,
        hp: { current: character.hp, max: character.maxHp },
        ac: character.ac,
        speed: character.speed,
        stats: character.stats,
        proficiencyBonus: character.proficiencyBonus,
        conditions: activeConditions.map(c => ({
          name: c.condition,
          roundsRemaining: c.roundsRemaining,
        })),
      },
    },
  };

  return toResponse(response);
}

// Legacy ASCII art formatter (kept for reference, will be deprecated)
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

/**
 * Formats a character update as Semantic Markdown with ToolResponse JSON
 * Shows before/after comparison for changed fields
 * Returns the JSON stringified ToolResponse
 */
function formatUpdateCharacterDisplay(
  before: Character,
  after: Character,
  updates: z.infer<typeof singleUpdateSchema>
): string {
  const display: string[] = [];
  const changes: Array<{field: string; before: string; after: string; delta?: number}> = [];

  // Header
  display.push(`## 📋 Update: ${after.name}`);
  display.push('');

  // Build changes list and markdown
  display.push('### Changes');
  display.push('');

  // HP with delta notation
  if (before.hp !== after.hp) {
    const delta = after.hp - before.hp;
    const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
    display.push(`**HP:** ${before.hp} → ${after.hp} (${deltaStr})`);
    display.push(formatHpBar(after.hp, after.maxHp));
    display.push('');
    changes.push({ field: 'hp', before: `${before.hp}`, after: `${after.hp}`, delta });
  }

  // Max HP
  if (before.maxHp !== after.maxHp) {
    display.push(`**Max HP:** ${before.maxHp} → ${after.maxHp}`);
    changes.push({ field: 'maxHp', before: `${before.maxHp}`, after: `${after.maxHp}` });
  }

  // Name
  if (before.name !== after.name) {
    display.push(`**Name:** ${before.name} → ${after.name}`);
    changes.push({ field: 'name', before: before.name, after: after.name });
  }

  // Level
  if (before.level !== after.level) {
    display.push(`**Level:** ${before.level} → ${after.level}`);
    changes.push({ field: 'level', before: `${before.level}`, after: `${after.level}` });
  }

  // Proficiency Bonus
  if (before.proficiencyBonus !== after.proficiencyBonus) {
    display.push(`**Proficiency Bonus:** +${before.proficiencyBonus} → +${after.proficiencyBonus}`);
    changes.push({ field: 'proficiencyBonus', before: `+${before.proficiencyBonus}`, after: `+${after.proficiencyBonus}` });
  }

  // AC
  if (before.ac !== after.ac) {
    display.push(`**AC:** ${before.ac} → ${after.ac}`);
    changes.push({ field: 'ac', before: `${before.ac}`, after: `${after.ac}` });
  }

  // Speed
  if (before.speed !== after.speed) {
    display.push(`**Speed:** ${before.speed} ft → ${after.speed} ft`);
    changes.push({ field: 'speed', before: `${before.speed}`, after: `${after.speed}` });
  }

  // Race
  if (before.race !== after.race) {
    display.push(`**Race:** ${before.race} → ${after.race}`);
    changes.push({ field: 'race', before: before.race, after: after.race });
  }

  // Class
  if (before.class !== after.class) {
    display.push(`**Class:** ${before.class} → ${after.class}`);
    changes.push({ field: 'class', before: before.class, after: after.class });
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
      const beforeMod = calculateModifier(before.stats[key]);
      const afterMod = calculateModifier(after.stats[key]);
      const beforeStr = `${before.stats[key]} (${formatModifier(beforeMod)})`;
      const afterStr = `${after.stats[key]} (${formatModifier(afterMod)})`;
      display.push(`**${name}:** ${beforeStr} → ${afterStr}`);
      changes.push({ field: key, before: beforeStr, after: afterStr });
    }
  });

  // Equipment
  if (updates.equipment !== undefined) {
    display.push('');
    display.push('**Equipment:**');
    after.equipment?.forEach(item => {
      display.push(`- ${item}`);
    });
    changes.push({ field: 'equipment', before: 'updated', after: `${after.equipment?.length || 0} items` });
  }

  // Resistances/Immunities
  if (updates.resistances !== undefined && after.resistances && after.resistances.length > 0) {
    display.push(`**Resistances:** ${after.resistances.join(', ')}`);
    changes.push({ field: 'resistances', before: 'updated', after: after.resistances.join(', ') });
  }

  if (updates.immunities !== undefined && after.immunities && after.immunities.length > 0) {
    display.push(`**Immunities:** ${after.immunities.join(', ')}`);
    changes.push({ field: 'immunities', before: 'updated', after: after.immunities.join(', ') });
  }

  // Spellcasting
  if (updates.spellcastingAbility !== undefined) {
    display.push(`**Spellcasting Ability:** ${after.spellcastingAbility?.toUpperCase()}`);
    changes.push({ field: 'spellcastingAbility', before: 'updated', after: after.spellcastingAbility || '' });
  }

  display.push('');
  display.push('---');
  display.push(`*ID: \`${after.id}\`*`);

  // Build the ToolResponse
  const response: ToolResponse = {
    display: display.join('\n'),
    data: {
      success: true,
      type: 'update',
      changes,
      character: {
        id: after.id,
        name: after.name,
        level: after.level,
        class: after.class,
        race: after.race,
        hp: { current: after.hp, max: after.maxHp },
        ac: after.ac,
        speed: after.speed,
        stats: after.stats,
        proficiencyBonus: after.proficiencyBonus,
      },
    },
  };

  return toResponse(response);
}

// Legacy ASCII art formatter (kept for reference, will be deprecated)
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
  const markdown = formatUpdateCharacterDisplay(originalCharacter, updatedCharacter, singleInput);

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
    id: string;
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
          id: '',
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
        id: '',
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
        id: characterId,
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
        id: characterId,
        name: char.name,
        success: true,
        hpBefore: typeof update.hp === 'string' ? char.hp - parseInt(update.hp, 10) : undefined,
        hpAfter: char.hp,
        maxHp: char.maxHp,
        changes,
      });
    } else {
      results.push({
        id: characterId,
        name: char.name,
        success: true,
        changes,
      });
    }
  }

  // Format batch output - return JSON format
  const response: ToolResponse = {
    display: formatBatchUpdateDisplay(results),
    data: {
      success: true,
      type: 'batch_update',
      results: results.map(r => ({
        id: r.id,
        name: r.name,
        success: r.success,
        hp: r.hpAfter !== undefined ? { before: r.hpBefore, after: r.hpAfter, max: r.maxHp } : undefined,
        error: r.error,
      })),
    },
  };
  return {
    success: true,
    markdown: toResponse(response),
  };
}

function formatBatchUpdateDisplay(results: Array<{
  id: string;
  name: string;
  success: boolean;
  hpBefore?: number;
  hpAfter?: number;
  maxHp?: number;
  changes: string[];
  error?: string;
}>): string {
  const display: string[] = [];
  
  display.push(`## 📋 Batch Update`);
  display.push('');
  display.push(`Updated ${results.length} character${results.length !== 1 ? 's' : ''}`);
  display.push('');

  for (const result of results) {
    if (!result.success) {
      display.push(`### ❌ ${result.name}`);
      display.push(`**Error:** ${result.error}`);
    } else {
      display.push(`### ✅ ${result.name}`);

      if (result.hpBefore !== undefined && result.hpAfter !== undefined) {
        const delta = result.hpAfter - result.hpBefore;
        const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
        display.push(`**HP:** ${result.hpBefore} → ${result.hpAfter}/${result.maxHp} (${deltaStr})`);
        display.push(formatHpBar(result.hpAfter, result.maxHp || result.hpAfter));
      }
    }
    display.push('');
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;

  display.push('---');
  display.push(`**Summary:** ✅ ${successCount} succeeded | ❌ ${failCount} failed`);

  return display.join('\n');
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
    const markdown = formatGetCharacterDisplay(character);

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
 * Returns ToolResponse JSON format for Semantic Markdown
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

  const char1Name = character1?.name || 'Unknown';
  const char2Name = character2.name;

  // Determine winner (ties favor defender - character 2)
  let winner: string;
  let char1Won: boolean | null;
  if (total1 > total2) {
    winner = char1Name;
    char1Won = true;
  } else if (total2 > total1) {
    winner = char2Name;
    char1Won = false;
  } else {
    winner = `${char2Name} (Tie - defender wins)`;
    char1Won = false;
  }

  // Format contested output as Semantic Markdown
  const display: string[] = [];

  display.push('## ⚔️ Contested Check');
  display.push('');
  display.push(`### ${char1Name} vs ${char2Name}`);
  display.push('');
  display.push(`| Combatant | Check | Roll | Total |`);
  display.push('|:----------|:------|:----:|:-----:|');
  display.push(`| **${char1Name}** | ${check1Name} | [${roll1.result.naturalRoll}] ${formatModifierSign(roll1.result.totalMod)} | **${total1}** |`);
  display.push(`| ${char2Name} | ${check2Name} | [${roll2.result.naturalRoll}] ${formatModifierSign(roll2.result.totalMod)} | **${total2}** |`);
  display.push('');
  display.push(`**Result:** ${total1} vs ${total2}`);
  display.push('');
  display.push(`### 🏆 Winner: ${winner}`);

  // Build the ToolResponse
  const response: ToolResponse = {
    display: display.join('\n'),
    data: {
      success: true,
      type: 'contested_check',
      character1: {
        name: char1Name,
        checkName: check1Name,
        roll: roll1.result.naturalRoll,
        modifier: roll1.result.totalMod,
        total: total1,
      },
      character2: {
        name: char2Name,
        checkName: check2Name,
        roll: roll2.result.naturalRoll,
        modifier: roll2.result.totalMod,
        total: total2,
      },
      winner,
      char1Won,
      tie: total1 === total2,
    },
  };

  return {
    success: true,
    markdown: toResponse(response),
  };
}

/**
 * Formats roll display with advantage/disadvantage showing strikethrough on unused die
 * Returns the formatted dice string for the display
 */
function formatRollWithAdvantage(
  rolls: number[],
  rollMode: 'normal' | 'advantage' | 'disadvantage' | 'cancelled',
  totalMod: number
): string {
  const modStr = totalMod >= 0 ? `+${totalMod}` : `${totalMod}`;
  
  if (rollMode === 'advantage' && rolls.length >= 2) {
    const higher = Math.max(...rolls);
    const lower = Math.min(...rolls);
    const total = higher + totalMod;
    return `**d20 (Advantage):** [${higher}] ~~[${lower}]~~ ${modStr} = **${total}**`;
  } else if (rollMode === 'disadvantage' && rolls.length >= 2) {
    const higher = Math.max(...rolls);
    const lower = Math.min(...rolls);
    const total = lower + totalMod;
    return `**d20 (Disadvantage):** ~~[${higher}]~~ [${lower}] ${modStr} = **${total}**`;
  } else if (rollMode === 'cancelled') {
    const total = rolls[0] + totalMod;
    return `**d20 (Normal - Adv/Disadv Cancel):** [${rolls[0]}] ${modStr} = **${total}**`;
  } else {
    const total = rolls[0] + totalMod;
    return `**Roll:** [${rolls[0]}] ${modStr} = **${total}**`;
  }
}

/**
 * Formats a roll check result into Semantic Markdown with ToolResponse JSON
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
  const display: string[] = [];
  
  // Determine critical roll status
  const isNat20 = params.naturalRoll === 20;
  const isNat1 = params.naturalRoll === 1;
  const critical: 'hit' | 'miss' | null = isNat20 ? 'hit' : isNat1 ? 'miss' : null;

  // Build header based on check type with critical indicator
  if (isNat20 && params.checkType === 'attack') {
    display.push('## 💥 CRITICAL HIT!');
  } else if (isNat1 && params.checkType === 'attack') {
    display.push('## 💀 Critical Miss');
  } else if (isNat20) {
    display.push('## ✨ Natural 20!');
    display.push('');
    // Add the check type header after natural 20 indicator
    if (params.checkType === 'skill') {
      display.push(`### 🎯 ${formatSkillName(params.checkName)} Check`);
    } else if (params.checkType === 'ability') {
      display.push(`### 🎯 ${params.abilityKey.toUpperCase()} Check`);
    } else if (params.checkType === 'save') {
      display.push(`### 🛡️ ${params.abilityKey.toUpperCase()} Save`);
    } else if (params.checkType === 'initiative') {
      display.push(`### 🏃 Initiative`);
    }
  } else if (isNat1) {
    display.push('## 😬 Natural 1');
    display.push('');
    // Add the check type header after natural 1 indicator
    if (params.checkType === 'skill') {
      display.push(`### 🎯 ${formatSkillName(params.checkName)} Check`);
    } else if (params.checkType === 'ability') {
      display.push(`### 🎯 ${params.abilityKey.toUpperCase()} Check`);
    } else if (params.checkType === 'save') {
      display.push(`### 🛡️ ${params.abilityKey.toUpperCase()} Save`);
    } else if (params.checkType === 'initiative') {
      display.push(`### 🏃 Initiative`);
    }
  } else {
    // Normal header based on check type
    if (params.checkType === 'skill') {
      display.push(`## 🎯 ${formatSkillName(params.checkName)} Check`);
    } else if (params.checkType === 'ability') {
      display.push(`## 🎯 ${params.abilityKey.toUpperCase()} Check`);
    } else if (params.checkType === 'save') {
      display.push(`## 🛡️ ${params.abilityKey.toUpperCase()} Save`);
    } else if (params.checkType === 'attack') {
      display.push(`## ⚔️ Attack Roll`);
    } else if (params.checkType === 'initiative') {
      display.push(`## 🏃 Initiative`);
    }
  }

  display.push('');

  // Character name if provided
  if (params.character) {
    display.push(`**Character:** ${params.character}`);
    display.push('');
  }

  // DC (if provided and not initiative)
  if (params.dc !== undefined && params.checkType !== 'initiative') {
    display.push(`**DC:** ${params.dc}`);
  }

  // Roll display with advantage/disadvantage strikethrough
  display.push(formatRollWithAdvantage(params.rolls, params.rollMode, params.totalMod));

  // Result (pass/fail) if DC provided
  if (params.dc !== undefined && params.dcResult) {
    if (params.checkType === 'save') {
      display.push(`**Result:** ${params.dcResult === 'success' ? '✅ Save!' : '❌ Failed!'}`);
    } else if (params.checkType === 'attack') {
      display.push(`**Result:** ${params.dcResult === 'success' ? '✅ HIT!' : '❌ Miss'}`);
    } else {
      display.push(`**Result:** ${params.dcResult === 'success' ? '✅ Success!' : '❌ Failure'}`);
    }
  }

  display.push('');

  // Modifier breakdown
  display.push('### Modifier Breakdown');
  display.push(`- **${params.abilityKey.toUpperCase()} Modifier:** ${formatModifierSign(params.abilityMod)}`);
  if (params.profMod > 0) {
    display.push(`- **Proficiency Bonus:** ${formatModifierSign(params.profMod)}`);
  }
  if (params.bonusMod !== 0) {
    display.push(`- **Additional Bonus:** ${formatModifierSign(params.bonusMod)}`);
  }
  display.push(`- **Total Modifier:** ${formatModifierSign(params.totalMod)}`);

  // Build the ToolResponse
  const response: ToolResponse = {
    display: display.join('\n'),
    data: {
      success: true,
      type: 'check',
      checkType: params.checkType as 'skill' | 'ability' | 'save' | 'attack' | 'initiative',
      checkName: params.checkName,
      character: params.character || null,
      roll: params.naturalRoll,
      modifier: params.totalMod,
      total: params.total,
      dc: params.dc || null,
      passed: params.dcResult === 'success' ? true : params.dcResult === 'failure' ? false : null,
      critical,
      advantage: params.rollMode === 'advantage',
      disadvantage: params.rollMode === 'disadvantage',
      rolls: params.rolls,
      abilityKey: params.abilityKey,
      abilityMod: params.abilityMod,
      profMod: params.profMod,
      bonusMod: params.bonusMod,
    },
  };

  return toResponse(response);
}
