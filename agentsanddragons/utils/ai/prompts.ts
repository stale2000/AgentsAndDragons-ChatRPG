import { JSON_ONLY_INSTRUCTION } from './actionSchema';

export type PromptContext = {
  maxSquares: number;
  validMoves: { x: number; y: number }[];
  farthestMoves: { x: number; y: number }[];
  adjacentTargets?: Array<{ index: number; name?: string; x: number; y: number; hp?: number; ac?: number }>;
};

/**
 * Generates the system message for AI turn decisions
 */
export function getSystemPrompt(context: PromptContext): string {
  const { maxSquares, validMoves, farthestMoves, adjacentTargets } = context;
  
  const validMovesNote = validMoves.length > 0 
    ? `\nCRITICAL CONSTRAINT: When choosing move or dash actions, you MUST select a destination from the validMoves array. Do NOT use coordinates outside this list. Your movement speed is ${maxSquares} squares. Use the same coordinate format as the tokens/enemies arrays.`
    : '';

  const adjacentTargetsNote = adjacentTargets && adjacentTargets.length > 0
    ? `\nATTACK TARGETS: You can attack these adjacent enemies right now: ${adjacentTargets.map(t => `tokens[${t.index}] at (${t.x}, ${t.y})${t.name ? ` (${t.name})` : ''}`).join(', ')}. Use target.index or targetPosition with their coordinates.`
    : '';

  return `${JSON_ONLY_INSTRUCTION} You are playing a D&D 5e-like character on a grid. Choose the single best action for this turn from: attack, move, dash, wait.
Guidelines:
- Attack when an enemy is adjacent or in range. You can target by index (target.index) or by coordinates (targetPosition with x, y). Use targetPosition when you want to attack a specific enemy at coordinates - the player will attack that character if it's adjacent.${adjacentTargetsNote}
- Move/Dash toward the nearest enemy or tactical goal. Use the enemies array to see enemy positions and the walls array to avoid obstacles. Use the same coordinate format as the tokens/enemies arrays (x and y values).${validMovesNote}
- Wait only if no better option.
Return ONLY a JSON object matching the schema.`;
}

/**
 * Generates action notes for the allowedActions array
 */
export function getAllowedActionsNotes(context: PromptContext): Array<{
  type: string;
  format: any;
  notes: string;
}> {
  const { maxSquares, validMoves, farthestMoves, adjacentTargets } = context;
  
  const attackNotes = adjacentTargets && adjacentTargets.length > 0
    ? `You can attack these adjacent enemies: ${adjacentTargets.map(t => `tokens[${t.index}] at (${t.x}, ${t.y})${t.name ? ` (${t.name})` : ''}`).join(', ')}. Use target.index to target by token index, or targetPosition with x,y coordinates to attack a character at specific coordinates. The player will attack the character at those coordinates if it is adjacent.`
    : 'Use target.index to target by token index, or targetPosition with x,y coordinates to attack a character at specific coordinates. The player will attack the character at those coordinates if it is adjacent. Prefer enemies adjacent; otherwise may move then attack if allowed.';
  
  return [
    {
      type: 'attack',
      format: { type: 'attack', target: { index: '<tokenIndex>' }, targetPosition: { x: '<x>', y: '<y>', space: 'coarse' } },
      notes: attackNotes,
    },
    {
      type: 'move',
      format: { type: 'move', destination: { x: '<x>', y: '<y>' } },
      notes: validMoves.length > 0 
        ? `CRITICAL: You MUST choose a destination from validMoves array. Your movement speed is ${maxSquares} squares. IMPORTANT: When moving toward an enemy or goal, choose the destination that is FARTHEST from your current position (up to ${maxSquares} squares away) in the direction of your goal. ${farthestMoves.length > 0 ? `PREFER destinations from the farthestMoves array (${farthestMoves.length} options at maximum distance).` : ''} Do NOT pick a destination only 1 square away if you can move ${maxSquares} squares. Only use coordinates listed in validMoves.`
        : 'Provide destination coordinates (same x/y format as tokens list). Move as far as possible toward your goal up to your movement speed.',
    },
    {
      type: 'dash',
      format: { type: 'dash', destination: { x: '<x>', y: '<y>' } },
      notes: validMoves.length > 0
        ? `CRITICAL: If dash destination is provided, it must be from validMoves array (extended range). Your movement speed is ${maxSquares} squares.`
        : 'Extend movement toward tactical goal when no attack is possible.',
    },
    { 
      type: 'wait', 
      format: { type: 'wait' }, 
      notes: 'Do nothing this turn.' 
    },
  ];
}

