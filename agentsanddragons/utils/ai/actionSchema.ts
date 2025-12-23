import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Enumerates the core action kinds an AI can take on its turn.
export const ActionTypeEnum = z.enum(['attack', 'move', 'dash', 'wait']);

// Target selector by index or id/uuid present in tokens array.
const TargetSelector = z.object({
  /** Optional stable id or uuid from token (e.g., token.uuid or token.id). */
  id: z.string().min(1).optional(),
  /** Optional index into the provided tokens array. */
  index: z.number().int().min(0).optional(),
}).refine(
  (v) => v.id !== undefined || v.index !== undefined,
  { message: 'target must include id or index' },
);

// Grid position in coarse or fine terms; use coarse blocks by default.
const Position = z.object({
  x: z.number().int(),
  y: z.number().int(),
  /**
   * Optional coordinate system hint:
   * - 'coarse': values are in coarse blocks (step-sized)
   * - 'fine': values are in fine grid cells (pixels/cellPixels)
   */
  space: z.enum(['coarse', 'fine']).default('coarse').optional(),
});

// Attack action with minimal targeting and optional weapon preference.
const AttackAction = z.object({
  type: z.literal('attack'),
  target: TargetSelector.optional(),
  /** Optional: target by coordinates instead of index/id. The player will attack the character at these coordinates if adjacent. */
  targetPosition: Position.optional(),
  /** Optional: prefer a specific item/weapon by name when making an attack. */
  weaponName: z.string().min(1).optional(),
  /** Optional: attempt ranged if not adjacent; otherwise move then attack. */
  allowApproach: z.boolean().default(true).optional(),
}).refine(
  (v) => {
    // Either target (with id or index) or targetPosition must be provided
    if (v.targetPosition !== undefined) return true;
    if (v.target !== undefined) {
      return v.target.id !== undefined || v.target.index !== undefined;
    }
    return false;
  },
  { message: 'attack must include either target (with id or index) or targetPosition' },
);

// Move action requests a destination. Engine will pathfind toward it.
const MoveAction = z.object({
  type: z.literal('move'),
  /** Desired destination; engine will attempt to pathfind and move up to speed. */
  destination: Position,
  /** Optional: maximum squares to move this action (<= movement). */
  maxSquares: z.number().int().min(0).optional(),
});

// Dash action: extend movement toward a goal or in a direction.
const DashAction = z.object({
  type: z.literal('dash'),
  /** Optional destination hint when dashing. */
  destination: Position.optional(),
});

// Wait action: do nothing intentionally.
const WaitAction = z.object({
  type: z.literal('wait'),
});

export const AiActionSchema = z.union([
  AttackAction,
  MoveAction,
  DashAction,
  WaitAction,
]);

export type AiAction = z.infer<typeof AiActionSchema>;

// JSON Schema for Together JSON mode
export const AiActionJsonSchema = zodToJsonSchema(AiActionSchema, {
  name: 'AiTurnAction',
});

// Helper to build Together response_format for JSON mode
export function getTogetherResponseFormat() {
  return {
    type: 'json_schema',
    schema: AiActionJsonSchema,
  } as const;
}

// Minimal system/user instruction snippet to enforce JSON-only output
export const JSON_ONLY_INSTRUCTION =
  'Only respond with a single JSON object matching the provided schema. Do not include any extra text.';


