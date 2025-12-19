/**
 * Semantic Markdown Formatting Module
 *
 * Provides formatting functions for Universal Semantic Markdown output,
 * replacing ASCII box art to enable multi-client MCP compatibility.
 *
 * @see design docs/OUTPUT-FORMAT-SPEC.md
 * @see design docs/ADR-003-CHATGPT-OPENAI-INTEGRATION.md
 */

/**
 * Standard MCP Tool Response Format
 *
 * All tools should return responses in this structure for consistent
 * handling across ChatGPT, Claude Desktop, and other MCP clients.
 */
export interface ToolResponse {
  /** Human-readable formatted Markdown output */
  display: string;

  /** Machine-parseable structured data */
  data: {
    success: boolean;
    type: string; // 'roll' | 'character' | 'encounter' | 'condition' | etc.
    [key: string]: unknown;
  };

  /** Optional suggestions for next actions */
  suggestions?: string[];
}

/**
 * Serializes a ToolResponse to JSON string for MCP return
 *
 * @param response - The ToolResponse to serialize
 * @returns JSON string representation
 */
export function toResponse(response: ToolResponse): string {
  return JSON.stringify(response);
}

/**
 * Formats an HP bar with Unicode blocks and health indicators
 *
 * Examples:
 * - 100%: **HP:** 20/20 ████████████████████ (100%)
 * - 75%: **HP:** 15/20 ███████████████░░░░░ (75%)
 * - 50%: **HP:** 10/20 ██████████░░░░░░░░░░ (50%) 🩸
 * - 25%: **HP:** 5/20 █████░░░░░░░░░░░░░░░ (25%) 💀
 * - 0%: **HP:** 0/20 ░░░░░░░░░░░░░░░░░░░░ (0%) 💀
 *
 * @param current - Current HP
 * @param max - Maximum HP
 * @param width - Width of bar in characters (default: 20)
 * @returns Formatted HP bar as Markdown string
 */
export function formatHpBar(
  current: number,
  max: number,
  width: number = 20
): string {
  const percentage = Math.round((current / max) * 100);
  const filled = Math.round((current / max) * width);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);

  let indicator = "";
  if (percentage <= 25) {
    indicator = " 💀";
  } else if (percentage <= 50) {
    indicator = " 🩸";
  }

  return `**HP:** ${current}/${max} ${bar} (${percentage}%)${indicator}`;
}

/**
 * Formats dice roll results in a readable format
 *
 * Examples:
 * - Single die: **d20:** [17]
 * - Multiple dice: **2d6:** [4] [6] = 10
 * - With modifier: **1d20+5:** [14] + 5 = **19**
 * - Expression: **2d6+4:** [3] [5] + 4 = **12**
 *
 * @param rolls - Array of individual die roll values
 * @param modifier - Optional modifier to add to total
 * @param expression - Optional expression label (e.g., "2d6+4")
 * @returns Formatted dice result as Markdown string
 */
export function formatDiceResult(
  rolls: number[],
  modifier?: number,
  expression?: string
): string {
  if (rolls.length === 0) {
    return "**Dice:** No rolls";
  }

  const rollDisplay = rolls.map((roll) => `[${roll}]`).join(" ");
  const rollSum = rolls.reduce((a, b) => a + b, 0);
  const total = modifier ? rollSum + modifier : rollSum;

  const label = expression || (rolls.length === 1 ? "d20" : `${rolls.length}d6`);

  if (rolls.length === 1 && !modifier) {
    return `**${label}:** [${rolls[0]}]`;
  }

  if (modifier && modifier !== 0) {
    return `**${label}:** ${rollDisplay} + ${modifier} = **${total}**`;
  }

  if (rolls.length === 1) {
    return `**${label}:** [${rolls[0]}]`;
  }

  return `**${label}:** ${rollDisplay} = ${total}`;
}

/**
 * Formats ability scores as a Markdown table with modifiers
 *
 * Example output:
 * | STR | DEX | CON | INT | WIS | CHA |
 * |:---:|:---:|:---:|:---:|:---:|:---:|
 * | 16 | 14 | 15 | 10 | 12 | 8 |
 * | +3 | +2 | +2 | +0 | +1 | -1 |
 *
 * @param stats - Object with ability scores
 * @returns Markdown table as string
 */
export function formatAbilityScores(stats: {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}): string {
  const abilities = [
    { label: "STR", value: stats.str },
    { label: "DEX", value: stats.dex },
    { label: "CON", value: stats.con },
    { label: "INT", value: stats.int },
    { label: "WIS", value: stats.wis },
    { label: "CHA", value: stats.cha },
  ];

  const headers = abilities.map((a) => a.label).join(" | ");
  const divider = "|:---:|:---:|:---:|:---:|:---:|:---:|";
  const scores = abilities.map((a) => a.value).join(" | ");
  const modifiers = abilities
    .map((a) => formatModifier(calculateModifier(a.value)))
    .join(" | ");

  return `| ${headers} |\n${divider}\n| ${scores} |\n| ${modifiers} |`;
}

/**
 * Returns an emoji icon for a D&D condition
 *
 * Condition emoji mappings:
 * - blinded: 🔲, charmed: 💕, deafened: 🔇, frightened: 😨
 * - grappled: 🤝, incapacitated: 💫, invisible: 👻, paralyzed: ⚡
 * - petrified: 🗿, poisoned: 🤢, prone: ⬇️, restrained: 🔗
 * - stunned: 😵, unconscious: 💤, exhaustion: 😫
 * - burning: 🔥, blessed: ✨, cursed: 👁️, concentrating: 🎯
 * - unknown: ⚠️
 *
 * @param condition - Condition name (lowercase)
 * @returns Emoji character
 */
export function formatConditionIcon(condition: string): string {
  const conditionMap: Record<string, string> = {
    blinded: "🔲",
    charmed: "💕",
    deafened: "🔇",
    frightened: "😨",
    grappled: "🤝",
    incapacitated: "💫",
    invisible: "👻",
    paralyzed: "⚡",
    petrified: "🗿",
    poisoned: "🤢",
    prone: "⬇️",
    restrained: "🔗",
    stunned: "😵",
    unconscious: "💤",
    exhaustion: "😫",
    burning: "🔥",
    blessed: "✨",
    cursed: "👁️",
    concentrating: "🎯",
  };

  return conditionMap[condition.toLowerCase()] || "⚠️";
}

/**
 * Formats an error message with suggestions
 *
 * Example output:
 * ## ⚠️ Character Not Found
 *
 * The character could not be found in the database.
 *
 * **Suggestions:**
 * - Create a new character with a different name
 * - Check the character list for available characters
 *
 * @param title - Error title
 * @param message - Error message body
 * @param suggestions - Optional array of suggestion strings
 * @returns Formatted error as Markdown string
 */
export function formatError(
  title: string,
  message: string,
  suggestions?: string[]
): string {
  let output = `## ⚠️ ${title}\n\n${message}`;

  if (suggestions && suggestions.length > 0) {
    output += "\n\n**Suggestions:**\n";
    output += suggestions.map((s) => `- ${s}`).join("\n");
  }

  return output;
}

/**
 * Calculates D&D 5e ability modifier from an ability score
 *
 * Formula: Math.floor((score - 10) / 2)
 *
 * Examples:
 * - 10 → +0
 * - 12 → +1
 * - 16 → +3
 * - 8 → -1
 *
 * @param score - Ability score (3-20)
 * @returns Modifier value
 */
export function calculateModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Formats a modifier as a string with sign
 *
 * Examples:
 * - 3 → "+3"
 * - -1 → "-1"
 * - 0 → "+0"
 *
 * @param modifier - Modifier value
 * @returns Formatted modifier string
 */
export function formatModifier(modifier: number): string {
  if (modifier >= 0) {
    return `+${modifier}`;
  }
  return String(modifier);
}
