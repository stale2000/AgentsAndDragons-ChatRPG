import { describe, it, expect } from "vitest";
import {
  ToolResponse,
  toResponse,
  formatHpBar,
  formatDiceResult,
  formatAbilityScores,
  formatConditionIcon,
  formatError,
  calculateModifier,
  formatModifier,
} from "../../src/modules/markdown-format";

describe("markdown-format module", () => {
  describe("ToolResponse interface", () => {
    it("should create a valid ToolResponse with required fields", () => {
      const response: ToolResponse = {
        display: "# Test",
        data: {
          success: true,
          type: "test",
        },
      };

      expect(response.display).toBe("# Test");
      expect(response.data.success).toBe(true);
      expect(response.data.type).toBe("test");
    });

    it("should support optional suggestions field", () => {
      const response: ToolResponse = {
        display: "# Test",
        data: {
          success: true,
          type: "test",
        },
        suggestions: ["Do something", "Try another thing"],
      };

      expect(response.suggestions).toHaveLength(2);
      expect(response.suggestions?.[0]).toBe("Do something");
    });

    it("should support additional arbitrary data fields", () => {
      const response: ToolResponse = {
        display: "# Test",
        data: {
          success: true,
          type: "character",
          characterId: "uuid-123",
          name: "Vario",
        },
      };

      expect(response.data.characterId).toBe("uuid-123");
      expect(response.data.name).toBe("Vario");
    });
  });

  describe("toResponse()", () => {
    it("should serialize a ToolResponse to JSON string", () => {
      const response: ToolResponse = {
        display: "Test display",
        data: {
          success: true,
          type: "test",
        },
      };

      const json = toResponse(response);
      expect(typeof json).toBe("string");
      expect(JSON.parse(json)).toEqual(response);
    });

    it("should handle complex nested data", () => {
      const response: ToolResponse = {
        display: "Character created",
        data: {
          success: true,
          type: "character",
          character: {
            id: "uuid-123",
            name: "Vario",
            hp: { current: 10, max: 10 },
            stats: { str: 15, dex: 14 },
          },
        },
      };

      const json = toResponse(response);
      const parsed = JSON.parse(json);
      expect(parsed.data.character.name).toBe("Vario");
      expect(parsed.data.character.hp.max).toBe(10);
    });
  });

  describe("formatHpBar()", () => {
    it("should format HP bar at 100%", () => {
      const bar = formatHpBar(20, 20);
      expect(bar).toBe("**HP:** 20/20 ████████████████████ (100%)");
      expect(bar).not.toContain("🩸");
      expect(bar).not.toContain("💀");
    });

    it("should format HP bar at 75%", () => {
      const bar = formatHpBar(15, 20);
      expect(bar).toBe("**HP:** 15/20 ███████████████░░░░░ (75%)");
      expect(bar).not.toContain("🩸");
      expect(bar).not.toContain("💀");
    });

    it("should format HP bar at 50% with bloodied indicator", () => {
      const bar = formatHpBar(10, 20);
      expect(bar).toBe("**HP:** 10/20 ██████████░░░░░░░░░░ (50%) 🩸");
      expect(bar).toContain("🩸");
      expect(bar).not.toContain("💀");
    });

    it("should format HP bar at 25% with critical indicator", () => {
      const bar = formatHpBar(5, 20);
      expect(bar).toBe("**HP:** 5/20 █████░░░░░░░░░░░░░░░ (25%) 💀");
      expect(bar).toContain("💀");
    });

    it("should format HP bar at 0% with critical indicator", () => {
      const bar = formatHpBar(0, 20);
      expect(bar).toBe("**HP:** 0/20 ░░░░░░░░░░░░░░░░░░░░ (0%) 💀");
      expect(bar).toContain("💀");
    });

    it("should format HP bar at 26% without critical indicator", () => {
      const bar = formatHpBar(26, 100);
      expect(bar).toContain("(26%)");
      expect(bar).not.toContain("💀");
      expect(bar).toContain("🩸");
    });

    it("should support custom bar width", () => {
      const bar = formatHpBar(5, 10, 10);
      expect(bar).toContain("█████░░░░░");
    });

    it("should round percentages correctly", () => {
      const bar = formatHpBar(7, 20);
      expect(bar).toContain("(35%)");
    });
  });

  describe("formatDiceResult()", () => {
    it("should format single die roll", () => {
      const result = formatDiceResult([17]);
      expect(result).toBe("**d20:** [17]");
    });

    it("should format single die with expression", () => {
      const result = formatDiceResult([17], undefined, "d20");
      expect(result).toBe("**d20:** [17]");
    });

    it("should format multiple dice without modifier", () => {
      const result = formatDiceResult([4, 6]);
      expect(result).toBe("**2d6:** [4] [6] = 10");
    });

    it("should format single die with modifier", () => {
      const result = formatDiceResult([14], 5, "1d20+5");
      expect(result).toBe("**1d20+5:** [14] + 5 = **19**");
    });

    it("should format multiple dice with modifier", () => {
      const result = formatDiceResult([3, 5], 4, "2d6+4");
      expect(result).toBe("**2d6+4:** [3] [5] + 4 = **12**");
    });

    it("should handle 4d6 rolls", () => {
      const result = formatDiceResult([6, 5, 4, 2]);
      expect(result).toContain("**4d6:**");
      expect(result).toContain("[6] [5] [4] [2]");
      expect(result).toContain("= 17");
    });

    it("should handle zero modifier", () => {
      const result = formatDiceResult([4, 6], 0, "2d6");
      expect(result).toBe("**2d6:** [4] [6] = 10");
    });

    it("should handle empty rolls array", () => {
      const result = formatDiceResult([]);
      expect(result).toBe("**Dice:** No rolls");
    });

    it("should default to d20 for single roll", () => {
      const result = formatDiceResult([12]);
      expect(result).toContain("**d20:**");
    });

    it("should default to dXd6 for multiple rolls", () => {
      const result = formatDiceResult([1, 2, 3]);
      expect(result).toContain("**3d6:**");
    });
  });

  describe("formatAbilityScores()", () => {
    it("should format ability scores as markdown table", () => {
      const stats = {
        str: 16,
        dex: 14,
        con: 15,
        int: 10,
        wis: 12,
        cha: 8,
      };

      const table = formatAbilityScores(stats);

      expect(table).toContain("| STR | DEX | CON | INT | WIS | CHA |");
      expect(table).toContain("|:---:|:---:|:---:|:---:|:---:|:---:|");
      expect(table).toContain("| 16 | 14 | 15 | 10 | 12 | 8 |");
      expect(table).toContain("| +3 | +2 | +2 | +0 | +1 | -1 |");
    });

    it("should include modifier row", () => {
      const stats = {
        str: 10,
        dex: 10,
        con: 10,
        int: 10,
        wis: 10,
        cha: 10,
      };

      const table = formatAbilityScores(stats);
      const lines = table.split("\n");

      expect(lines.length).toBe(4);
      expect(lines[3]).toContain("+0 | +0 | +0 | +0 | +0 | +0");
    });

    it("should handle all +3 stats", () => {
      const stats = {
        str: 16,
        dex: 16,
        con: 16,
        int: 16,
        wis: 16,
        cha: 16,
      };

      const table = formatAbilityScores(stats);
      expect(table).toContain("| +3 | +3 | +3 | +3 | +3 | +3 |");
    });

    it("should handle all -1 stats", () => {
      const stats = {
        str: 8,
        dex: 8,
        con: 8,
        int: 8,
        wis: 8,
        cha: 8,
      };

      const table = formatAbilityScores(stats);
      expect(table).toContain("| -1 | -1 | -1 | -1 | -1 | -1 |");
    });
  });

  describe("formatConditionIcon()", () => {
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

    Object.entries(conditionMap).forEach(([condition, emoji]) => {
      it(`should return ${emoji} for ${condition}`, () => {
        expect(formatConditionIcon(condition)).toBe(emoji);
      });

      it(`should return ${emoji} for ${condition.toUpperCase()} (case-insensitive)`, () => {
        expect(formatConditionIcon(condition.toUpperCase())).toBe(emoji);
      });
    });

    it("should return ⚠️ for unknown condition", () => {
      expect(formatConditionIcon("unknown")).toBe("⚠️");
      expect(formatConditionIcon("foobar")).toBe("⚠️");
      expect(formatConditionIcon("")).toBe("⚠️");
    });
  });

  describe("formatError()", () => {
    it("should format error with title and message", () => {
      const error = formatError("Test Error", "Something went wrong");
      expect(error).toBe("## ⚠️ Test Error\n\nSomething went wrong");
    });

    it("should format error with suggestions", () => {
      const error = formatError("Not Found", "Character not found", [
        "Create a new character",
        "Check existing characters",
      ]);

      expect(error).toContain("## ⚠️ Not Found");
      expect(error).toContain("Character not found");
      expect(error).toContain("**Suggestions:**");
      expect(error).toContain("- Create a new character");
      expect(error).toContain("- Check existing characters");
    });

    it("should handle empty suggestions array", () => {
      const error = formatError("Test", "Message", []);
      expect(error).toBe("## ⚠️ Test\n\nMessage");
    });

    it("should handle undefined suggestions", () => {
      const error = formatError("Test", "Message", undefined);
      expect(error).toBe("## ⚠️ Test\n\nMessage");
    });

    it("should format single suggestion", () => {
      const error = formatError("Error", "Oops", ["Try again"]);
      expect(error).toContain("- Try again");
    });

    it("should handle multiline error messages", () => {
      const error = formatError("Complex Error", "Line 1\nLine 2");
      expect(error).toContain("Line 1\nLine 2");
    });
  });

  describe("calculateModifier()", () => {
    it("should calculate +3 modifier for 16", () => {
      expect(calculateModifier(16)).toBe(3);
    });

    it("should calculate +2 modifier for 14", () => {
      expect(calculateModifier(14)).toBe(2);
    });

    it("should calculate +1 modifier for 12", () => {
      expect(calculateModifier(12)).toBe(1);
    });

    it("should calculate +0 modifier for 10", () => {
      expect(calculateModifier(10)).toBe(0);
    });

    it("should calculate -1 modifier for 8", () => {
      expect(calculateModifier(8)).toBe(-1);
    });

    it("should calculate -2 modifier for 6", () => {
      expect(calculateModifier(6)).toBe(-2);
    });

    it("should calculate -4 modifier for 3", () => {
      expect(calculateModifier(3)).toBe(-4);
    });

    it("should calculate +5 modifier for 20", () => {
      expect(calculateModifier(20)).toBe(5);
    });
  });

  describe("formatModifier()", () => {
    it("should format positive modifier with + sign", () => {
      expect(formatModifier(1)).toBe("+1");
      expect(formatModifier(3)).toBe("+3");
      expect(formatModifier(5)).toBe("+5");
    });

    it("should format negative modifier with - sign", () => {
      expect(formatModifier(-1)).toBe("-1");
      expect(formatModifier(-2)).toBe("-2");
      expect(formatModifier(-5)).toBe("-5");
    });

    it("should format zero modifier as +0", () => {
      expect(formatModifier(0)).toBe("+0");
    });
  });

  describe("Integration tests", () => {
    it("should create a complete character response", () => {
      const response: ToolResponse = {
        display: `## ⚔️ Character Created: Vario

**Level 1 Human Fighter**

### Vital Stats
- ${formatHpBar(10, 10)}
- **AC:** 10
- **Speed:** 30 ft

### Ability Scores
${formatAbilityScores({
  str: 15,
  dex: 14,
  con: 13,
  int: 10,
  wis: 12,
  cha: 8,
})}`,
        data: {
          success: true,
          type: "character",
          characterId: "uuid-123",
          name: "Vario",
          level: 1,
          class: "Fighter",
          race: "Human",
          hp: { current: 10, max: 10 },
          ac: 10,
          speed: 30,
        },
        suggestions: [
          "Choose equipment",
          "Set a background",
          "Start an encounter",
        ],
      };

      const json = toResponse(response);
      const parsed = JSON.parse(json);

      expect(parsed.data.success).toBe(true);
      expect(parsed.data.name).toBe("Vario");
      expect(parsed.suggestions).toHaveLength(3);
      expect(response.display).toContain("Level 1 Human Fighter");
      expect(response.display).toContain("**HP:**");
    });

    it("should create a dice roll response", () => {
      const rolls = [17];
      const modifier = 5;

      const response: ToolResponse = {
        display: `## 🎲 Attack Roll

**Result:** ${formatDiceResult(rolls, modifier, "1d20+5")}`,
        data: {
          success: true,
          type: "roll",
          expression: "1d20+5",
          rolls: rolls,
          modifier: modifier,
          total: 22,
        },
      };

      expect(response.data.total).toBe(22);
      expect(response.display).toContain("[17] + 5");
    });

    it("should create an error response with suggestions", () => {
      const response: ToolResponse = {
        display: formatError(
          "Character Not Found",
          "The character with ID 'invalid-id' does not exist.",
          [
            "Create a new character with 'create_character'",
            "Use 'get_character' with a valid ID",
            "Check available characters with 'list_characters'",
          ]
        ),
        data: {
          success: false,
          type: "error",
          error: "CHARACTER_NOT_FOUND",
          characterId: "invalid-id",
        },
      };

      expect(response.data.success).toBe(false);
      expect(response.display).toContain("⚠️ Character Not Found");
      expect(response.display).toContain("invalid-id");
    });
  });
});
