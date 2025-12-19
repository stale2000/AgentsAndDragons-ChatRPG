/**
 * Tool Registry - Static Loading
 * All 50 tools are registered here at startup.
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Re-export SDK type for external use
export type { CallToolResult };

// Tool Definition Interface
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type?: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    anyOf?: Array<{
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    }>;
    oneOf?: Array<{
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    }>;
  };
  handler: (args: unknown) => Promise<CallToolResult>;
}

// Helper: Format success response (can accept either Markdown or JSON)
export function success(content: string): CallToolResult {
  return {
    content: [{ type: 'text', text: content }],
  };
}

// Helper: Format error response
export function error(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: `❌ **Error:** ${message}` }],
    isError: true,
  };
}

// ============================================================
// TOOL CALL TRACKING
// ============================================================

// Call counter for each tool
const toolCallCounts: Record<string, number> = {};

// Get call count for a specific tool
export function getToolCallCount(name: string): number {
  return toolCallCounts[name] || 0;
}

// Get all call counts
export function getAllToolCallCounts(): Record<string, number> {
  return { ...toolCallCounts };
}

// Reset all counts (useful for testing)
export function resetToolCallCounts(): void {
  for (const key of Object.keys(toolCallCounts)) {
    delete toolCallCounts[key];
  }
}

// Increment counter (called internally)
function trackToolCall(name: string): void {
  toolCallCounts[name] = (toolCallCounts[name] || 0) + 1;
}

// ============================================================
// TOOL REGISTRY (Static)
// ============================================================

import { parseDice } from './modules/dice.js';
import {
  createCharacter,
  createCharacterSchema,
  getCharacter,
  getCharacterSchema,
  updateCharacter,
  updateCharacterSchema,
  rollCheck,
  rollCheckSchema
} from './modules/characters.js';
import { measureDistance, measureDistanceSchema } from './modules/spatial.js';
import { manageCondition, manageConditionSchema, createEncounter, createEncounterSchema, executeAction, executeActionSchema } from './modules/combat.js';
import { createBox, BOX } from './modules/ascii-art.js';
import { ToolResponse, toResponse } from './modules/markdown-format.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

// ============================================================
// DICE FORMATTING HELPERS
// ============================================================

/**
 * Format a single dice roll result as a ToolResponse with Semantic Markdown
 */
function formatSingleDiceRoll(
  result: { expression: string; rolls: number[]; kept: number[]; modifier: number; total: number },
  reason?: string
): string {
  const { expression, rolls, kept, modifier, total } = result;

  // Detect critical hits/misses on d20
  const isCriticalHit =
    expression.toLowerCase().includes('d20') &&
    rolls.length === 1 &&
    rolls[0] === 20;
  const isCriticalMiss =
    expression.toLowerCase().includes('d20') &&
    rolls.length === 1 &&
    rolls[0] === 1;

  let display = '';

  if (isCriticalHit) {
    display = `## 💥 CRITICAL HIT!\n\n**d20:** [${rolls[0]}]`;
    if (modifier !== 0) {
      const sign = modifier > 0 ? '+' : '';
      display += ` ${sign}${modifier}`;
    }
    display += ` = **${total}**`;
  } else if (isCriticalMiss) {
    display = `## 💀 Critical Miss\n\n**d20:** [${rolls[0]}]`;
    if (modifier !== 0) {
      const sign = modifier > 0 ? '+' : '';
      display += ` ${sign}${modifier}`;
    }
    display += ` = **${total}**`;
  } else {
    // Normal roll
    display = `## 🎲 ${expression}\n\n`;

    // Show dice results
    const rollDisplay = rolls.map((r) => `[${r}]`).join(' ');
    display += `**Dice:** ${rollDisplay}`;

    // Show kept if different from rolled
    if (rolls.length !== kept.length) {
      const keptDisplay = kept.map((r) => `[${r}]`).join(' ');
      display += `\n**Kept:** ${keptDisplay}`;
    }

    // Show modifier if present
    if (modifier !== 0) {
      const sign = modifier > 0 ? '+' : '';
      display += `\n**Modifier:** ${sign}${modifier}`;
    }

    // Show total
    display += `\n**Total:** **${total}**`;
  }

  // Add reason if provided
  if (reason) {
    display += `\n\n*${reason}*`;
  }

  return display;
}

/**
 * Convert a single roll to a ToolResponse JSON
 */
function singleRollToResponse(
  result: { expression: string; rolls: number[]; kept: number[]; modifier: number; total: number },
  reason?: string
): string {
  const { expression, rolls, kept, modifier, total } = result;

  const isCriticalHit =
    expression.toLowerCase().includes('d20') &&
    rolls.length === 1 &&
    rolls[0] === 20;
  const isCriticalMiss =
    expression.toLowerCase().includes('d20') &&
    rolls.length === 1 &&
    rolls[0] === 1;

  const response: ToolResponse = {
    display: formatSingleDiceRoll(result, reason),
    data: {
      success: true,
      type: 'roll',
      expression,
      rolls,
      kept,
      modifier,
      total,
      isCritical: isCriticalHit,
      isCriticalMiss,
    },
    suggestions: ['Roll damage', 'Make another attack'],
  };

  return toResponse(response);
}

/**
 * Convert batch rolls to a ToolResponse JSON
 */
function batchRollsToResponse(
  results: Array<{ label?: string; expression: string; total: number; rolls: number[]; kept: number[] }>,
  reason?: string
): string {
  // Build Markdown table
  let tableMarkdown = '## 🎲 Batch Roll\n\n| Label | Roll | Result |\n|-------|------|:------:|\n';

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const label = r.label || `Roll ${i + 1}`;
    const rollDisplay = r.rolls.map((roll) => `[${roll}]`).join(' ');

    // Build roll expression display
    let rollExpr = rollDisplay;
    if (r.rolls.length !== r.kept.length) {
      const keptDisplay = r.kept.map((roll) => `[${roll}]`).join(' ');
      rollExpr = `${keptDisplay} (from ${rollDisplay})`;
    }

    tableMarkdown += `| ${label} | ${rollExpr} | **${r.total}** |\n`;
  }

  const grandTotal = results.reduce((sum, r) => sum + r.total, 0);
  tableMarkdown += `\n**Grand Total:** ${grandTotal}`;

  if (reason) {
    tableMarkdown += `\n\n*${reason}*`;
  }

  const response: ToolResponse = {
    display: tableMarkdown,
    data: {
      success: true,
      type: 'batch_roll',
      results,
      grandTotal,
    },
    suggestions: ['Roll again', 'Continue combat'],
  };

  return toResponse(response);
}

// Helper to convert Zod schema to JSON Schema without $ref (Claude MCP client doesn't resolve refs)
// MCP requires type: "object" at root, so we flatten union schemas
function toJsonSchema(schema: z.ZodTypeAny) {
  const jsonSchema = zodToJsonSchema(schema, { $refStrategy: 'none' }) as any;

  // If schema has anyOf/oneOf at root, flatten it to a single object with all properties optional
  if (jsonSchema.anyOf || jsonSchema.oneOf) {
    const variants = jsonSchema.anyOf || jsonSchema.oneOf;
    const allProperties: Record<string, unknown> = {};

    // Merge all properties from all variants
    for (const variant of variants) {
      if (variant.properties) {
        Object.assign(allProperties, variant.properties);
      }
    }

    return {
      type: 'object',
      properties: allProperties,
    } as {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  }

  return jsonSchema as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const toolRegistry: Record<string, ToolDefinition> = {
  roll_dice: {
    name: 'roll_dice',
    description: 'Roll dice using standard notation (e.g., "2d6+4", "4d6kh3"). Supports single rolls or batch rolling multiple expressions at once. Supports advantage/disadvantage for d20 rolls. Provide either "expression" for single roll or "batch" for multiple rolls.',
    inputSchema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Dice expression for single roll (e.g., "2d6+4", "1d20", "4d6kh3")',
        },
        batch: {
          type: 'array',
          description: 'Array of roll requests for batch rolling (alternative to expression)',
          items: {
            type: 'object',
            properties: {
              expression: {
                type: 'string',
                description: 'Dice expression (e.g., "2d6+4", "1d20", "4d6kh3")',
              },
              label: {
                type: 'string',
                description: 'Label for this roll (e.g., "Attack 1", "Damage", "Goblin 1")',
              },
              advantage: {
                type: 'boolean',
                description: 'Roll with advantage (2d20, keep highest)',
              },
              disadvantage: {
                type: 'boolean',
                description: 'Roll with disadvantage (2d20, keep lowest)',
              },
            },
            required: ['expression'],
          },
          minItems: 1,
          maxItems: 20,
        },
        reason: {
          type: 'string',
          description: 'Optional reason for the roll(s)',
        },
        advantage: {
          type: 'boolean',
          description: 'Roll with advantage (2d20, keep highest). Only works with single d20 rolls.',
        },
        disadvantage: {
          type: 'boolean',
          description: 'Roll with disadvantage (2d20, keep lowest). Only works with single d20 rolls.',
        },
      },
    },
    handler: async (args) => {
      // Check if this is a batch operation
      const argsObj = args as Record<string, unknown>;
      if ('batch' in argsObj && argsObj.batch) {
        const { batch, reason } = args as {
          batch?: Array<{ expression: string; label?: string; advantage?: boolean; disadvantage?: boolean }>;
          reason?: string;
        };

        if (!batch || batch.length === 0) {
          return error('Missing required parameter: batch (must be non-empty array)');
        }

        if (batch.length > 20) {
          return error('Too many rolls (maximum 20 per batch)');
        }

        try {
          const results: Array<{ label?: string; expression: string; total: number; rolls: number[]; kept: number[] }> = [];

          for (const roll of batch) {
            if (!roll.expression) {
              return error('Each roll must have an expression');
            }

            if (roll.advantage && roll.disadvantage) {
              return error(`Roll "${roll.label || roll.expression}": Cannot have both advantage and disadvantage`);
            }

            let finalExpression = roll.expression;

            // Auto-convert d20 rolls to advantage/disadvantage
            if ((roll.advantage || roll.disadvantage) && roll.expression.match(/^1d20([+-]\d+)?$/i)) {
              const modifier = roll.expression.match(/([+-]\d+)$/)?.[1] || '';
              finalExpression = roll.advantage ? `2d20kh1${modifier}` : `2d20kl1${modifier}`;
            } else if (roll.advantage || roll.disadvantage) {
              return error(`Roll "${roll.label || roll.expression}": Advantage/disadvantage only works with single d20 rolls`);
            }

            const result = parseDice(finalExpression);
            results.push({
              label: roll.label,
              expression: finalExpression,
              total: result.total,
              rolls: result.rolls,
              kept: result.kept,
            });
          }

          // Format batch output as ToolResponse JSON
          return success(batchRollsToResponse(results, reason));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return error(message);
        }
      }

      // Single roll mode
      const { expression, reason, advantage, disadvantage } = args as {
        expression?: string;
        reason?: string;
        advantage?: boolean;
        disadvantage?: boolean;
      };

      if (!expression) {
        return error('Missing required parameter: expression');
      }

      if (advantage && disadvantage) {
        return error('Cannot have both advantage and disadvantage');
      }

      try {
        let finalExpression = expression;

        // Auto-convert d20 rolls to advantage/disadvantage
        if ((advantage || disadvantage) && expression.match(/^1d20([+-]\d+)?$/i)) {
          const modifier = expression.match(/([+-]\d+)$/)?.[1] || '';
          finalExpression = advantage ? `2d20kh1${modifier}` : `2d20kl1${modifier}`;
        } else if (advantage || disadvantage) {
          return error('Advantage/disadvantage only works with single d20 rolls (e.g., "1d20" or "1d20+5")');
        }

        const result = parseDice(finalExpression);
        return success(singleRollToResponse(result, reason));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  create_character: {
    name: 'create_character',
    description: 'Create a new D&D 5e character with stats, class, race, and equipment',
    inputSchema: toJsonSchema(createCharacterSchema),
    handler: async (args) => {
      try {
        const validated = createCharacterSchema.parse(args);
        const result = createCharacter(validated);
        return success(result.markdown);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  get_character: {
    name: 'get_character',
    description: 'Retrieve an existing D&D 5e character by ID',
    inputSchema: toJsonSchema(getCharacterSchema),
    handler: async (args) => {
      try {
        const validated = getCharacterSchema.parse(args);
        const result = getCharacter(validated);

        if (!result.success) {
          return error(result.error || 'Failed to retrieve character');
        }

        return success(result.markdown);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  update_character: {
    name: 'update_character',
    description: 'Update an existing D&D 5e character with new stats, HP, level, equipment, etc.',
    inputSchema: toJsonSchema(updateCharacterSchema),
    handler: async (args) => {
      try {
        const validated = updateCharacterSchema.parse(args);
        const result = updateCharacter(validated);

        if (!result.success) {
          return error(result.error || 'Failed to update character');
        }

        return success(result.markdown);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  measure_distance: {
    name: 'measure_distance',
    description: 'Measure distance between two positions using D&D 5e grid mechanics',
    inputSchema: toJsonSchema(measureDistanceSchema),
    handler: async (args) => {
      try {
        const validated = measureDistanceSchema.parse(args);
        const result = measureDistance(validated);
        return success(result.markdown);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  manage_condition: {
    name: 'manage_condition',
    description: 'Manage D&D 5e conditions on targets (add, remove, query, tick duration)',
    inputSchema: toJsonSchema(manageConditionSchema),
    handler: async (args) => {
      try {
        const validated = manageConditionSchema.parse(args);
        const result = manageCondition(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  create_encounter: {
    name: 'create_encounter',
    description: 'Create a D&D 5e combat encounter with participants, terrain, and initiative tracking',
    inputSchema: toJsonSchema(createEncounterSchema),
    handler: async (args) => {
      try {
        const validated = createEncounterSchema.parse(args);
        const result = createEncounter(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  roll_check: {
    name: 'roll_check',
    description: 'Roll D&D 5e checks including skill checks, ability checks, saving throws, attack rolls, and initiative',
    inputSchema: toJsonSchema(rollCheckSchema),
    handler: async (args) => {
      try {
        const validated = rollCheckSchema.parse(args);
        const result = rollCheck(validated);

        if (!result.success) {
          return error(result.error || 'Failed to roll check');
        }

        return success(result.markdown);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  execute_action: {
    name: 'execute_action',
    description: 'Execute a combat action in an encounter (attack, dash, disengage, dodge, etc.). Phase 1 supports attack and dash actions.',
    inputSchema: toJsonSchema(executeActionSchema),
    handler: async (args) => {
      try {
        const validated = executeActionSchema.parse(args);
        const result = executeAction(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  // ============================================================
  // CHATGPT CONNECTOR TOOLS (Required by OpenAI MCP)
  // ============================================================

  search: {
    name: 'search',
    description: 'Search D&D 5e content including spells, monsters, rules, and characters. Returns a list of matching results.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for D&D content',
        },
      },
      required: ['query'],
    },
    handler: async (args) => {
      const { query } = args as { query: string };
      
      if (!query) {
        return error('Missing required parameter: query');
      }

      // D&D 5e SRD content database (expandable)
      const content: Array<{ id: string; title: string; url: string; type: string; summary: string }> = [
        // Spells
        { id: 'spell-fireball', title: 'Fireball', url: 'https://5e.d20srd.org/srd/spells/fireball.htm', type: 'spell', summary: '3rd-level evocation, 8d6 fire damage in 20ft radius' },
        { id: 'spell-magic-missile', title: 'Magic Missile', url: 'https://5e.d20srd.org/srd/spells/magicMissile.htm', type: 'spell', summary: '1st-level evocation, 3 darts dealing 1d4+1 force damage each' },
        { id: 'spell-cure-wounds', title: 'Cure Wounds', url: 'https://5e.d20srd.org/srd/spells/cureWounds.htm', type: 'spell', summary: '1st-level evocation, heal 1d8 + spellcasting modifier' },
        { id: 'spell-shield', title: 'Shield', url: 'https://5e.d20srd.org/srd/spells/shield.htm', type: 'spell', summary: '1st-level abjuration, reaction +5 AC until next turn' },
        { id: 'spell-counterspell', title: 'Counterspell', url: 'https://5e.d20srd.org/srd/spells/counterspell.htm', type: 'spell', summary: '3rd-level abjuration, interrupt spell casting' },
        // Monsters
        { id: 'monster-goblin', title: 'Goblin', url: 'https://5e.d20srd.org/srd/monsters/goblin.htm', type: 'monster', summary: 'Small humanoid, CR 1/4, nimble escape ability' },
        { id: 'monster-dragon-red-adult', title: 'Adult Red Dragon', url: 'https://5e.d20srd.org/srd/monsters/dragonRed.htm', type: 'monster', summary: 'Huge dragon, CR 17, fire breath weapon' },
        { id: 'monster-beholder', title: 'Beholder', url: 'https://5e.d20srd.org/srd/monsters/beholder.htm', type: 'monster', summary: 'Large aberration, CR 13, antimagic cone' },
        { id: 'monster-owlbear', title: 'Owlbear', url: 'https://5e.d20srd.org/srd/monsters/owlbear.htm', type: 'monster', summary: 'Large monstrosity, CR 3, keen sight and smell' },
        // Rules
        { id: 'rule-advantage', title: 'Advantage and Disadvantage', url: 'https://5e.d20srd.org/srd/combat/makingAnAttack.htm', type: 'rule', summary: 'Roll 2d20, take higher (advantage) or lower (disadvantage)' },
        { id: 'rule-actions', title: 'Actions in Combat', url: 'https://5e.d20srd.org/srd/combat/actionsInCombat.htm', type: 'rule', summary: 'Attack, Cast a Spell, Dash, Disengage, Dodge, Help, Hide, Ready, Search, Use an Object' },
        { id: 'rule-cover', title: 'Cover', url: 'https://5e.d20srd.org/srd/combat/cover.htm', type: 'rule', summary: 'Half cover +2 AC, Three-quarters +5 AC, Total cover untargetable' },
        { id: 'rule-conditions', title: 'Conditions', url: 'https://5e.d20srd.org/srd/conditions.htm', type: 'rule', summary: 'Blinded, Charmed, Deafened, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious' },
        // Classes
        { id: 'class-fighter', title: 'Fighter', url: 'https://5e.d20srd.org/srd/classes/fighter.htm', type: 'class', summary: 'Martial class with Fighting Style, Second Wind, Action Surge, Extra Attack' },
        { id: 'class-wizard', title: 'Wizard', url: 'https://5e.d20srd.org/srd/classes/wizard.htm', type: 'class', summary: 'Arcane caster with spellbook, Arcane Recovery, school specialization' },
        { id: 'class-rogue', title: 'Rogue', url: 'https://5e.d20srd.org/srd/classes/rogue.htm', type: 'class', summary: 'Skill expert with Sneak Attack, Cunning Action, Evasion' },
        { id: 'class-cleric', title: 'Cleric', url: 'https://5e.d20srd.org/srd/classes/cleric.htm', type: 'class', summary: 'Divine caster with Domain, Channel Divinity, Divine Intervention' },
      ];

      // Simple search matching
      const queryLower = query.toLowerCase();
      const results = content
        .filter(item => 
          item.title.toLowerCase().includes(queryLower) ||
          item.summary.toLowerCase().includes(queryLower) ||
          item.type.toLowerCase().includes(queryLower)
        )
        .slice(0, 10) // Limit to 10 results
        .map(item => ({
          id: item.id,
          title: item.title,
          url: item.url,
        }));

      // ChatGPT expects JSON-encoded results in text field
      const response = { results };
      return success(JSON.stringify(response));
    },
  },

  fetch: {
    name: 'fetch',
    description: 'Retrieve full details of a D&D 5e content item by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Unique ID of the content to fetch',
        },
      },
      required: ['id'],
    },
    handler: async (args) => {
      const { id } = args as { id: string };
      
      if (!id) {
        return error('Missing required parameter: id');
      }

      // Full content database
      const contentDb: Record<string, { id: string; title: string; text: string; url: string; metadata: Record<string, string> }> = {
        'spell-fireball': {
          id: 'spell-fireball',
          title: 'Fireball',
          text: `**Fireball**
3rd-level evocation

**Casting Time:** 1 action
**Range:** 150 feet
**Components:** V, S, M (a tiny ball of bat guano and sulfur)
**Duration:** Instantaneous

A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere centered on that point must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.

The fire spreads around corners. It ignites flammable objects in the area that aren't being worn or carried.

**At Higher Levels.** When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.`,
          url: 'https://5e.d20srd.org/srd/spells/fireball.htm',
          metadata: { level: '3', school: 'evocation', source: 'SRD 5.1' },
        },
        'spell-magic-missile': {
          id: 'spell-magic-missile',
          title: 'Magic Missile',
          text: `**Magic Missile**
1st-level evocation

**Casting Time:** 1 action
**Range:** 120 feet
**Components:** V, S
**Duration:** Instantaneous

You create three glowing darts of magical force. Each dart hits a creature of your choice that you can see within range. A dart deals 1d4 + 1 force damage to its target. The darts all strike simultaneously, and you can direct them to hit one creature or several.

**At Higher Levels.** When you cast this spell using a spell slot of 2nd level or higher, the spell creates one more dart for each slot level above 1st.`,
          url: 'https://5e.d20srd.org/srd/spells/magicMissile.htm',
          metadata: { level: '1', school: 'evocation', source: 'SRD 5.1' },
        },
        'spell-cure-wounds': {
          id: 'spell-cure-wounds',
          title: 'Cure Wounds',
          text: `**Cure Wounds**
1st-level evocation

**Casting Time:** 1 action
**Range:** Touch
**Components:** V, S
**Duration:** Instantaneous

A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier. This spell has no effect on undead or constructs.

**At Higher Levels.** When you cast this spell using a spell slot of 2nd level or higher, the healing increases by 1d8 for each slot level above 1st.`,
          url: 'https://5e.d20srd.org/srd/spells/cureWounds.htm',
          metadata: { level: '1', school: 'evocation', source: 'SRD 5.1' },
        },
        'spell-shield': {
          id: 'spell-shield',
          title: 'Shield',
          text: `**Shield**
1st-level abjuration

**Casting Time:** 1 reaction, which you take when you are hit by an attack or targeted by the magic missile spell
**Range:** Self
**Components:** V, S
**Duration:** 1 round

An invisible barrier of magical force appears and protects you. Until the start of your next turn, you have a +5 bonus to AC, including against the triggering attack, and you take no damage from magic missile.`,
          url: 'https://5e.d20srd.org/srd/spells/shield.htm',
          metadata: { level: '1', school: 'abjuration', source: 'SRD 5.1' },
        },
        'spell-counterspell': {
          id: 'spell-counterspell',
          title: 'Counterspell',
          text: `**Counterspell**
3rd-level abjuration

**Casting Time:** 1 reaction, which you take when you see a creature within 60 feet of you casting a spell
**Range:** 60 feet
**Components:** S
**Duration:** Instantaneous

You attempt to interrupt a creature in the process of casting a spell. If the creature is casting a spell of 3rd level or lower, its spell fails and has no effect. If it is casting a spell of 4th level or higher, make an ability check using your spellcasting ability. The DC equals 10 + the spell's level. On a success, the creature's spell fails and has no effect.

**At Higher Levels.** When you cast this spell using a spell slot of 4th level or higher, the interrupted spell has no effect if its level is less than or equal to the level of the spell slot you used.`,
          url: 'https://5e.d20srd.org/srd/spells/counterspell.htm',
          metadata: { level: '3', school: 'abjuration', source: 'SRD 5.1' },
        },
        'monster-goblin': {
          id: 'monster-goblin',
          title: 'Goblin',
          text: `**Goblin**
Small humanoid (goblinoid), neutral evil

**Armor Class:** 15 (leather armor, shield)
**Hit Points:** 7 (2d6)
**Speed:** 30 ft.

| STR | DEX | CON | INT | WIS | CHA |
|-----|-----|-----|-----|-----|-----|
| 8 (-1) | 14 (+2) | 10 (+0) | 10 (+0) | 8 (-1) | 8 (-1) |

**Skills:** Stealth +6
**Senses:** darkvision 60 ft., passive Perception 9
**Languages:** Common, Goblin
**Challenge:** 1/4 (50 XP)

**Nimble Escape.** The goblin can take the Disengage or Hide action as a bonus action on each of its turns.

**Actions:**
**Scimitar.** Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.
**Shortbow.** Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.`,
          url: 'https://5e.d20srd.org/srd/monsters/goblin.htm',
          metadata: { cr: '1/4', type: 'humanoid', source: 'SRD 5.1' },
        },
        'monster-dragon-red-adult': {
          id: 'monster-dragon-red-adult',
          title: 'Adult Red Dragon',
          text: `**Adult Red Dragon**
Huge dragon, chaotic evil

**Armor Class:** 19 (natural armor)
**Hit Points:** 256 (19d12 + 133)
**Speed:** 40 ft., climb 40 ft., fly 80 ft.

| STR | DEX | CON | INT | WIS | CHA |
|-----|-----|-----|-----|-----|-----|
| 27 (+8) | 10 (+0) | 25 (+7) | 16 (+3) | 13 (+1) | 21 (+5) |

**Saving Throws:** Dex +6, Con +13, Wis +7, Cha +11
**Skills:** Perception +13, Stealth +6
**Damage Immunities:** fire
**Senses:** blindsight 60 ft., darkvision 120 ft., passive Perception 23
**Languages:** Common, Draconic
**Challenge:** 17 (18,000 XP)

**Legendary Resistance (3/Day).** If the dragon fails a saving throw, it can choose to succeed instead.

**Actions:**
**Multiattack.** The dragon can use its Frightful Presence. It then makes three attacks: one with its bite and two with its claws.
**Fire Breath (Recharge 5–6).** The dragon exhales fire in a 60-foot cone. Each creature in that area must make a DC 21 Dexterity saving throw, taking 63 (18d6) fire damage on a failed save, or half as much damage on a successful one.`,
          url: 'https://5e.d20srd.org/srd/monsters/dragonRed.htm',
          metadata: { cr: '17', type: 'dragon', source: 'SRD 5.1' },
        },
        'rule-advantage': {
          id: 'rule-advantage',
          title: 'Advantage and Disadvantage',
          text: `**Advantage and Disadvantage**

Sometimes a special ability or spell tells you that you have advantage or disadvantage on an ability check, a saving throw, or an attack roll. When that happens, you roll a second d20 when you make the roll.

**Advantage:** Use the higher of the two rolls.
**Disadvantage:** Use the lower of the two rolls.

If multiple situations affect a roll and each one grants advantage or imposes disadvantage on it, you don't roll more than one additional d20. If two favorable situations grant advantage, for example, you still roll only one additional d20.

If circumstances cause a roll to have both advantage and disadvantage, you are considered to have neither of them, and you roll one d20. This is true even if multiple circumstances impose disadvantage and only one grants advantage or vice versa.`,
          url: 'https://5e.d20srd.org/srd/combat/makingAnAttack.htm',
          metadata: { category: 'combat', source: 'SRD 5.1' },
        },
        'rule-actions': {
          id: 'rule-actions',
          title: 'Actions in Combat',
          text: `**Actions in Combat**

On your turn, you can take one action. The most common actions are:

- **Attack:** Make a melee or ranged attack.
- **Cast a Spell:** Cast a spell with a casting time of 1 action.
- **Dash:** Gain extra movement equal to your speed.
- **Disengage:** Your movement doesn't provoke opportunity attacks.
- **Dodge:** Attacks against you have disadvantage; Dex saves have advantage.
- **Help:** Give an ally advantage on their next ability check or attack.
- **Hide:** Make a Dexterity (Stealth) check to hide.
- **Ready:** Prepare to take an action in response to a trigger.
- **Search:** Make a Perception or Investigation check.
- **Use an Object:** Interact with an object that requires an action.

**Bonus Actions:** Some features let you take a bonus action on your turn.
**Reactions:** A reaction is an instant response to a trigger, like an opportunity attack.`,
          url: 'https://5e.d20srd.org/srd/combat/actionsInCombat.htm',
          metadata: { category: 'combat', source: 'SRD 5.1' },
        },
        'rule-conditions': {
          id: 'rule-conditions',
          title: 'Conditions',
          text: `**Conditions**

Conditions alter a creature's capabilities:

- **Blinded:** Can't see, auto-fail sight checks, attacks have disadvantage, attacks against have advantage.
- **Charmed:** Can't attack or target the charmer with harmful abilities.
- **Deafened:** Can't hear, auto-fail hearing checks.
- **Frightened:** Disadvantage on checks/attacks while source is in sight, can't willingly move closer.
- **Grappled:** Speed becomes 0, ends if grappler is incapacitated or forced apart.
- **Incapacitated:** Can't take actions or reactions.
- **Invisible:** Impossible to see without magic, heavily obscured, attacks have advantage, attacks against have disadvantage.
- **Paralyzed:** Incapacitated, can't move or speak, auto-fail Str/Dex saves, attacks have advantage, hits within 5 ft. are critical.
- **Petrified:** Transformed to stone, incapacitated, resistant to all damage, immune to poison/disease.
- **Poisoned:** Disadvantage on attack rolls and ability checks.
- **Prone:** Can only crawl, disadvantage on attacks, melee attacks have advantage, ranged attacks have disadvantage.
- **Restrained:** Speed 0, attacks have disadvantage, attacks against have advantage, disadvantage on Dex saves.
- **Stunned:** Incapacitated, can't move, auto-fail Str/Dex saves, attacks have advantage.
- **Unconscious:** Incapacitated, can't move or speak, unaware, drop what you're holding, fall prone, auto-fail Str/Dex saves, attacks have advantage, hits within 5 ft. are critical.`,
          url: 'https://5e.d20srd.org/srd/conditions.htm',
          metadata: { category: 'rules', source: 'SRD 5.1' },
        },
        'class-fighter': {
          id: 'class-fighter',
          title: 'Fighter',
          text: `**Fighter**

**Hit Die:** d10
**Primary Ability:** Strength or Dexterity
**Saving Throw Proficiencies:** Strength, Constitution
**Armor and Weapon Proficiencies:** All armor and shields, simple and martial weapons

**Class Features:**
- **Fighting Style (1st):** Choose a combat specialty (Archery, Defense, Dueling, Great Weapon Fighting, Protection, Two-Weapon Fighting)
- **Second Wind (1st):** Bonus action to regain 1d10 + level HP, once per short rest
- **Action Surge (2nd):** Take one additional action, once per short rest
- **Martial Archetype (3rd):** Choose Champion, Battle Master, or Eldritch Knight
- **Extra Attack (5th):** Attack twice when you take the Attack action
- **Indomitable (9th):** Reroll a failed saving throw, once per long rest`,
          url: 'https://5e.d20srd.org/srd/classes/fighter.htm',
          metadata: { type: 'class', hitDie: 'd10', source: 'SRD 5.1' },
        },
        'class-wizard': {
          id: 'class-wizard',
          title: 'Wizard',
          text: `**Wizard**

**Hit Die:** d6
**Primary Ability:** Intelligence
**Saving Throw Proficiencies:** Intelligence, Wisdom
**Armor and Weapon Proficiencies:** Daggers, darts, slings, quarterstaffs, light crossbows

**Spellcasting:** You are a prepared spellcaster using Intelligence. You learn spells by copying them into your spellbook.

**Class Features:**
- **Spellcasting (1st):** Prepare Int modifier + wizard level spells from your spellbook
- **Arcane Recovery (1st):** Once per day, recover spell slots equal to half your wizard level (rounded up)
- **Arcane Tradition (2nd):** Choose a school of magic (Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy, Transmutation)
- **Spell Mastery (18th):** Cast one 1st and one 2nd level spell at will`,
          url: 'https://5e.d20srd.org/srd/classes/wizard.htm',
          metadata: { type: 'class', hitDie: 'd6', source: 'SRD 5.1' },
        },
        'class-rogue': {
          id: 'class-rogue',
          title: 'Rogue',
          text: `**Rogue**

**Hit Die:** d8
**Primary Ability:** Dexterity
**Saving Throw Proficiencies:** Dexterity, Intelligence
**Armor and Weapon Proficiencies:** Light armor, simple weapons, hand crossbows, longswords, rapiers, shortswords

**Class Features:**
- **Expertise (1st):** Double proficiency bonus for two skills
- **Sneak Attack (1st):** Extra damage when you have advantage or an ally is adjacent to target. Starts at 1d6, increases every odd level.
- **Thieves' Cant (1st):** Secret language and code
- **Cunning Action (2nd):** Bonus action to Dash, Disengage, or Hide
- **Roguish Archetype (3rd):** Choose Thief, Assassin, or Arcane Trickster
- **Uncanny Dodge (5th):** Reaction to halve attack damage
- **Evasion (7th):** Take no damage on successful Dex save, half on failure`,
          url: 'https://5e.d20srd.org/srd/classes/rogue.htm',
          metadata: { type: 'class', hitDie: 'd8', source: 'SRD 5.1' },
        },
        'class-cleric': {
          id: 'class-cleric',
          title: 'Cleric',
          text: `**Cleric**

**Hit Die:** d8
**Primary Ability:** Wisdom
**Saving Throw Proficiencies:** Wisdom, Charisma
**Armor and Weapon Proficiencies:** Light and medium armor, shields, simple weapons

**Spellcasting:** You are a prepared spellcaster using Wisdom. You have access to the entire cleric spell list.

**Class Features:**
- **Spellcasting (1st):** Prepare Wis modifier + cleric level spells from the cleric list
- **Divine Domain (1st):** Choose a domain (Life, Light, Nature, Tempest, Trickery, War) which grants extra spells and abilities
- **Channel Divinity (2nd):** Turn Undead + domain-specific ability, once per short rest
- **Divine Intervention (10th):** Call on your deity for aid, percentage chance equal to cleric level`,
          url: 'https://5e.d20srd.org/srd/classes/cleric.htm',
          metadata: { type: 'class', hitDie: 'd8', source: 'SRD 5.1' },
        },
      };

      const item = contentDb[id];
      
      if (!item) {
        return error(`Content not found: ${id}`);
      }

      // ChatGPT expects JSON-encoded content in text field
      return success(JSON.stringify(item));
    },
  },
};

// ============================================================
// TOOL CALL HANDLER
// ============================================================

export async function handleToolCall(
  name: string,
  args: unknown
): Promise<CallToolResult> {
  const tool = toolRegistry[name];
  
  if (!tool) {
    return error(`Unknown tool: ${name}`);
  }

  // Track the call
  trackToolCall(name);

  try {
    return await tool.handler(args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`Tool "${name}" failed: ${message}`);
  }
}
