/**
 * Spatial Module - Distance & Position Calculations
 * Supports D&D 5e grid mechanics
 */

import { z } from 'zod';
import { PositionSchema } from '../types.js';
import { drawPath } from './ascii-art.js';
import { getEncounterParticipant } from './combat.js';
import { ToolResponse, toResponse } from './markdown-format.js';

// ============================================================
// MEASURE DISTANCE
// ============================================================

export const measureDistanceSchema = z.object({
  encounterId: z.string().optional(),
  from: z.union([z.string(), PositionSchema]),
  to: z.union([z.string(), PositionSchema]),
  mode: z.enum(['euclidean', 'grid_5e', 'grid_alt']).default('euclidean'),
  includeElevation: z.boolean().default(true),
});

export type MeasureDistanceInput = z.infer<typeof measureDistanceSchema>;

export interface MeasureDistanceResult {
  distanceFeet: number;
  distanceSquares: number;
  markdown: string;
  fromName?: string;
  toName?: string;
}

/**
 * Calculate distance between two positions
 * Supports multiple distance calculation modes
 * When using character/creature IDs (strings), encounterId must be provided
 */
export function measureDistance(input: MeasureDistanceInput): MeasureDistanceResult {
  let fromPos: any = input.from;
  let toPos: any = input.to;
  let fromName: string | undefined;
  let toName: string | undefined;

  // Handle character/creature ID lookups
  if (typeof input.from === 'string') {
    if (!input.encounterId) {
      throw new Error('encounterId is required for character position lookup');
    }
    const participant = getEncounterParticipant(input.encounterId, input.from);
    if (!participant) {
      throw new Error(`Character/creature not found in encounter: ${input.from}`);
    }
    fromPos = participant.position;
    fromName = participant.name;
  }

  if (typeof input.to === 'string') {
    if (!input.encounterId) {
      throw new Error('encounterId is required for character position lookup');
    }
    const participant = getEncounterParticipant(input.encounterId, input.to);
    if (!participant) {
      throw new Error(`Character/creature not found in encounter: ${input.to}`);
    }
    toPos = participant.position;
    toName = participant.name;
  }

  // Calculate deltas
  const dx = Math.abs(toPos.x - fromPos.x);
  const dy = Math.abs(toPos.y - fromPos.y);
  const dz = input.includeElevation ? Math.abs(toPos.z - fromPos.z) : 0;

  let distanceSquares: number;
  let distanceFeet: number;

  switch (input.mode) {
    case 'euclidean':
      // True geometric distance: √(dx² + dy² + dz²) × 5
      distanceSquares = Math.sqrt(dx * dx + dy * dy + dz * dz);
      distanceFeet = Math.round(distanceSquares * 5);
      distanceSquares = Math.round(distanceSquares);
      break;

    case 'grid_5e':
      // Simplified D&D: diagonals count as 5ft
      // Distance = max(dx, dy, dz) × 5
      distanceSquares = Math.max(dx, dy, dz);
      distanceFeet = distanceSquares * 5;
      break;

    case 'grid_alt':
      // Variant rule: diagonals alternate 5ft/10ft
      // Calculate diagonal and straight movement
      const minDim = Math.min(dx, dy);
      const maxDim = Math.max(dx, dy);
      const straight = maxDim - minDim;

      // Diagonal movement: alternate 5/10/5/10
      let diagonalCost = 0;
      for (let i = 0; i < minDim; i++) {
        diagonalCost += (i % 2 === 0) ? 5 : 10;
      }

      // Add straight movement and elevation
      distanceFeet = diagonalCost + (straight * 5) + (dz * 5);
      distanceSquares = Math.max(dx, dy, dz);
      break;

    default:
      throw new Error(`Unknown distance mode: ${input.mode}`);
  }

  // Format markdown output
  const markdown = formatDistanceResult({
    from: fromPos,
    to: toPos,
    fromName,
    toName,
    mode: input.mode,
    distanceFeet,
    distanceSquares,
    includeElevation: input.includeElevation,
    dx,
    dy,
    dz,
  });

  return {
    distanceFeet,
    distanceSquares,
    markdown,
    fromName,
    toName,
  };
}

/**
 * Format distance result as Semantic Markdown with ToolResponse
 */
function formatDistanceResult(params: {
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  fromName?: string;
  toName?: string;
  mode: string;
  distanceFeet: number;
  distanceSquares: number;
  includeElevation: boolean;
  dx: number;
  dy: number;
  dz: number;
}): string {
  const display: string[] = [];

  // Mode names
  const modeNames: Record<string, string> = {
    'euclidean': 'Euclidean (True Distance)',
    'grid_5e': 'Grid 5e (Simplified)',
    'grid_alt': 'Grid Alternate (5/10 Diagonal)',
  };

  display.push(`## 📏 Distance: ${params.distanceFeet}ft`);
  display.push('');

  // From/To
  const fromLabel = params.fromName || `(${params.from.x}, ${params.from.y}, ${params.from.z})`;
  const toLabel = params.toName || `(${params.to.x}, ${params.to.y}, ${params.to.z})`;
  display.push(`**${fromLabel}** → **${toLabel}**`);
  display.push('');

  // Details
  display.push(`**Mode:** ${modeNames[params.mode] || params.mode}`);
  display.push(`**Squares:** ${params.distanceSquares} (@ 5ft each)`);

  // Movement breakdown
  if (params.dx > 0 || params.dy > 0 || params.dz > 0) {
    display.push(`**Movement:** ${params.dx}x, ${params.dy}y, ${params.dz}z`);
  }

  // Notes
  if (!params.includeElevation && params.to.z !== params.from.z) {
    display.push('');
    display.push('*Elevation difference ignored*');
  }

  const response: ToolResponse = {
    display: display.join('\n'),
    data: {
      success: true,
      type: 'distance',
      distanceFeet: params.distanceFeet,
      distanceSquares: params.distanceSquares,
      mode: params.mode,
      from: {
        position: params.from,
        name: params.fromName,
      },
      to: {
        position: params.to,
        name: params.toName,
      },
      movement: {
        dx: params.dx,
        dy: params.dy,
        dz: params.dz,
      },
      includeElevation: params.includeElevation,
    },
  };

  return toResponse(response);
}
