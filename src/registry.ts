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

// Helper: Format success response
export function success(markdown: string): CallToolResult {
  return {
    content: [{ type: 'text', text: markdown }],
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

import { parseDice, formatDiceResult } from './modules/dice.js';
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
import { zodToJsonSchema } from 'zod-to-json-schema';

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

          // Format batch output
          const content: string[] = [];

          if (reason) {
            content.push(reason.toUpperCase());
            content.push('');
          }

          content.push(`ROLLING ${results.length} DICE ${results.length === 1 ? 'EXPRESSION' : 'EXPRESSIONS'}`);
          content.push('');
          content.push('─'.repeat(40));
          content.push('');

          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            const label = r.label || `Roll ${i + 1}`;

            content.push(`${label}:`);
            content.push(`  Expression: ${r.expression}`);

            if (r.rolls.length !== r.kept.length) {
              content.push(`  Rolled: [${r.rolls.join(', ')}]`);
              content.push(`  Kept: [${r.kept.join(', ')}]`);
            } else if (r.rolls.length > 1) {
              content.push(`  Rolled: [${r.rolls.join(', ')}]`);
            }

            content.push(`  Result: ${r.total}`);
            content.push('');
          }

          content.push('─'.repeat(40));
          content.push('');
          content.push(`TOTAL ACROSS ALL ROLLS: ${results.reduce((sum, r) => sum + r.total, 0)}`);

          return success(createBox('BATCH ROLL', content, undefined, 'HEAVY'));
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
        return success(formatDiceResult(result, reason));
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
