# ChatRPG Output Format Specification

## Universal Semantic Markdown for Multi-Client MCP

**Version:** 1.0.0  
**Status:** PROPOSED  
**Supersedes:** ASCII Art output format (src/modules/ascii-art.ts)

---

## Design Principles

### 1. Universal Rendering
Output must render well on:
- ChatGPT (Web, iOS, Android)
- Claude Desktop (Terminal-style)
- Claude.ai (Web)
- Any future MCP client

### 2. Visual Appeal
Preserve the "game feel" through:
- Unicode symbols for dice, HP bars, status effects
- Markdown tables for structured data
- Emoji for quick visual scanning
- Consistent iconography

### 3. Token Efficiency
- No excessive whitespace or box-drawing characters
- Compact but readable
- Structured data separate from display text

### 4. Accessibility
- Screen reader compatible
- No ASCII art that loses meaning when linearized
- Clear heading hierarchy

---

## Response Structure

### Standard Tool Response Format

All tools MUST return responses in this structure:

```typescript
interface ToolResponse {
  // Required: Human-readable formatted output
  display: string;
  
  // Required: Machine-parseable structured data
  data: {
    success: boolean;
    type: string;  // 'character' | 'roll' | 'encounter' | 'condition' | etc.
    [key: string]: unknown;
  };
  
  // Optional: Suggestions for next actions
  suggestions?: string[];
}

// MCP Return Format
return {
  content: [{
    type: 'text',
    text: JSON.stringify(response)
  }]
};
```

### Example Implementation

```typescript
function createCharacter(input: CreateCharacterInput): CallToolResult {
  const character = buildCharacter(input);
  
  const response: ToolResponse = {
    display: formatCharacterCreation(character),
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
        stats: character.stats
      }
    },
    suggestions: [
      "Roll for ability scores with 4d6 drop lowest",
      "Add equipment and background",
      "Set character portrait description"
    ]
  };
  
  return success(JSON.stringify(response));
}
```

---

## Visual Element Standards

### HP Bars

**Format:** Progress bar using Unicode blocks

```markdown
**HP:** 15/20 ███████████████░░░░░ (75%)
```

**Implementation:**
```typescript
function formatHpBar(current: number, max: number, width: number = 20): string {
  const percentage = Math.round((current / max) * 100);
  const filled = Math.round((current / max) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `**HP:** ${current}/${max} ${bar} (${percentage}%)`;
}
```

**Bloodied Indicator (≤50%):**
```markdown
**HP:** 8/20 ████████░░░░░░░░░░░░ (40%) 🩸
```

**Critical (≤25%):**
```markdown
**HP:** 4/20 ████░░░░░░░░░░░░░░░░ (20%) 💀
```

### Dice Results

**Single Die:**
```markdown
**d20:** [17]
```

**Multiple Dice:**
```markdown
**2d6:** [4] [6] = 10
```

**With Modifier:**
```markdown
**1d20+5:** [14] + 5 = **19**
```

**Advantage/Disadvantage:**
```markdown
**d20 (Advantage):** [8] ~~[3]~~ + 5 = **13**
**d20 (Disadvantage):** ~~[18]~~ [7] + 5 = **12**
```

**Keep Highest/Lowest:**
```markdown
**4d6kh3:** [6] [5] [4] ~~[2]~~ = **15**
```

**Critical Hit:**
```markdown
## 💥 CRITICAL HIT!
**d20:** [20] + 5 = **25**
```

**Critical Miss:**
```markdown
## 💀 Critical Miss
**d20:** [1] + 5 = **6**
```

### Ability Scores

**Table Format:**
```markdown
| STR | DEX | CON | INT | WIS | CHA |
|:---:|:---:|:---:|:---:|:---:|:---:|
| 16 | 14 | 15 | 10 | 12 | 8 |
| +3 | +2 | +2 | +0 | +1 | -1 |
```

### Conditions & Status Effects

**Icon Reference:**
| Condition | Icon | Example |
|-----------|------|---------|
| Blinded | 🔲 | 🔲 Blinded |
| Charmed | 💕 | 💕 Charmed |
| Deafened | 🔇 | 🔇 Deafened |
| Frightened | 😨 | 😨 Frightened |
| Grappled | 🤝 | 🤝 Grappled |
| Incapacitated | 💫 | 💫 Incapacitated |
| Invisible | 👻 | 👻 Invisible |
| Paralyzed | ⚡ | ⚡ Paralyzed |
| Petrified | 🗿 | 🗿 Petrified |
| Poisoned | 🤢 | 🤢 Poisoned |
| Prone | ⬇️ | ⬇️ Prone |
| Restrained | 🔗 | 🔗 Restrained |
| Stunned | 😵 | 😵 Stunned |
| Unconscious | 💤 | 💤 Unconscious |
| Exhaustion | 😫 | 😫 Exhaustion (3) |
| Concentrating | 🎯 | 🎯 Concentration: Bless |
| Burning | 🔥 | 🔥 Burning (2 rounds) |
| Blessed | ✨ | ✨ Blessed |
| Cursed | 👁️ | 👁️ Hex |

**Inline Format:**
```markdown
**Conditions:** 🤢 Poisoned | 😫 Exhaustion (2) | 🔗 Restrained
```

**Detailed Format:**
```markdown
### Active Conditions
- 🤢 **Poisoned** — Disadvantage on attacks and ability checks
- 😫 **Exhaustion 2** — Speed halved, disadvantage on ability checks
-  — Speed 0, attacks have disadvantage
```

### Initiative Tracker

**Compact (Current Combat State):**
```markdown
### Initiative
| # | Combatant | HP | Status |
|:-:|-----------|:--:|:------:|
| → | **Vario** | 15/20 | — |
| 2 | Goblin A | 7/7 | — |
| 3 | Goblin B | 3/7 | 🩸 |
```

**Extended (Full Details):**
```markdown
### Combat: Round 2

| Init | Name | HP | AC | Conditions |
|:----:|------|:--:|:--:|:----------:|
| **18** | → **Vario** (Fighter) | 15/20 | 16 | 🎯 Hunter's Mark |
| 15 | Goblin Scout | 7/7 | 13 | — |
| 12 | Goblin Archer | 3/7 | 13 | 🩸 Bloodied |
| 8 | Orc Chieftain | 45/45 | 16 | — |

**Current Turn:** Vario  
**Round:** 2 | **Lighting:** Dim | **Terrain:** Forest
```

### Attack/Damage Results

**Hit:**
```markdown
## ⚔️ Attack: Longsword

**Roll:** [17] + 5 = **22** vs AC 13  
**Result:** ✅ HIT!

**Damage:** [6] + 3 = **9 slashing**

*Goblin Scout: 7 → 0 HP* 💀
```

**Miss:**
```markdown
## ⚔️ Attack: Shortbow

**Roll:** [8] + 4 = **12** vs AC 16  
**Result:** ❌ Miss
```

**Critical Hit:**
```markdown
## 💥 CRITICAL HIT!

**Roll:** [20] + 5 = **25** vs AC 13

**Damage:** [6] + [4] + 3 = **13 slashing** (doubled dice!)

*Goblin Scout: 7 → 0 HP* 💀
```

### Skill Checks

**Success:**
```markdown
## 🎯 Perception Check

**DC:** 15  
**Roll:** [14] + 4 = **18**  
**Result:** ✅ Success!

*You notice goblin tracks leading into the underbrush.*
```

**Failure:**
```markdown
## 🎯 Stealth Check

**DC:** 12  
**Roll:** [3] + 5 = **8**  
**Result:** ❌ Failure

*A twig snaps under your foot. The goblins turn toward the sound.*
```

### Saving Throws

**Success:**
```markdown
## 🛡️ Dexterity Save vs Fireball

**DC:** 15  
**Roll:** [16] + 2 = **18**  
**Result:** ✅ Save! Half damage.

**Damage:** 28 → **14 fire**
```

**Failure:**
```markdown
## 🛡️ Wisdom Save vs Hold Person

**DC:** 14  
**Roll:** [7] + 1 = **8**  
**Result:** ❌ Failed!

*You feel your muscles lock. You are ⚡ Paralyzed!*
```

### Spell Slots

**Display:**
```markdown
### Spell Slots
| Level | Slots |
|:-----:|:-----:|
| 1st | ●●●○○ |
| 2nd | ●●○○ |
| 3rd | ●○○ |
```

**After Casting:**
```markdown
*Expended 1st-level slot: ●●○○○ remaining*
```

---

## Tool-Specific Formats

### create_character

```markdown
## ⚔️ Character Created: {name}

**Level {level} {race} {class}**

### Vital Stats
- **HP:** {hp}/{maxHp} ████████████████████
- **AC:** {ac}
- **Speed:** {speed} ft
- **Initiative:** {init}
- **Proficiency:** +{prof}

### Ability Scores
| STR | DEX | CON | INT | WIS | CHA |
|:---:|:---:|:---:|:---:|:---:|:---:|
| {str} | {dex} | {con} | {int} | {wis} | {cha} |
| {strMod} | {dexMod} | {conMod} | {intMod} | {wisMod} | {chaMod} |

---
*Character ID: `{id}`*

**Next:** {suggestion}
```

### roll_dice

**Single Roll:**
```markdown
## 🎲 {expression}

{diceDisplay}

**Total:** **{total}**

*{reason}*
```

**Batch Roll:**
```markdown
## 🎲 Batch Roll

| Label | Roll | Result |
|-------|------|:------:|
| Attack 1 | [14] + 5 | **19** |
| Attack 2 | [8] + 5 | **13** |
| Damage 1 | [6] + 3 | **9** |

**Total:** {sum}
```

### get_character

```markdown
## 📜 {name}

**Level {level} {race} {class}**

### Combat Stats
| HP | AC | Speed | Init |
|:--:|:--:|:-----:|:----:|
| {hp}/{maxHp} | {ac} | {speed} ft | {init} |

{hpBar}

### Ability Scores
| STR | DEX | CON | INT | WIS | CHA |
|:---:|:---:|:---:|:---:|:---:|:---:|
| {str} | {dex} | {con} | {int} | {wis} | {cha} |
| {strMod} | {dexMod} | {conMod} | {intMod} | {wisMod} | {chaMod} |

### Active Conditions
{conditions or "None"}

### Equipment
{equipment or "Not set"}

---
*ID: `{id}`*
```

### manage_condition

**Add:**
```markdown
## 🔴 Condition Added

**{targetName}** is now **{condition}**
{description}

{mechanicalEffects}

*Source: {source} | Duration: {duration}*
```

**Remove:**
```markdown
## 🟢 Condition Removed

**{targetName}** is no longer **{condition}**
```

**Query:**
```markdown
## 📋 Active Conditions: {targetName}

{conditionList or "No active conditions"}
```

### create_encounter

```markdown
## ⚔️ Combat Begins!

**{encounterName}**

### Environment
- **Lighting:** {lighting}
- **Terrain:** {terrain}
- **Special:** {features}

### Initiative Order
| # | Combatant | Init | HP | AC |
|:-:|-----------|:----:|:--:|:--:|
{participantRows}

**Current Turn:** {firstCombatant}

---
*Encounter ID: `{id}`*
```

### execute_action

```markdown
## ⚔️ {actorName}: {actionType}

{actionDetails}

{result}

{stateChange}

---
**Turn:** {actorName} | **Round:** {round}
```

---

## Error Format

### Standard Error

```markdown
## ⚠️ {errorTitle}

{errorMessage}

**Suggestions:**
- {suggestion1}
- {suggestion2}
```

### Not Found Error

```markdown
## ❓ {entityType} Not Found

Could not find {entityType} "{identifier}".

**Did you mean:**
- {suggestion1}
- {suggestion2}

**Or try:**
- List all {entityTypePlural}
- Create a new {entityType}
```

### Validation Error

```markdown
## ❌ Invalid Input

{fieldErrors}

**Required format:**
{example}
```

---

## Migration Guide

### From ASCII Art to Semantic Markdown

| ASCII Pattern | Markdown Replacement |
|--------------|---------------------|
| `╔═══╗ ... ╚═══╝` | `## Title` + content |
| `┌───┐ ... └───┘` | Markdown table |
| `Box divider ─────` | `---` or omit |
| `centerText()` | Heading alignment |
| `createStatusBar()` | `███░░░` unicode bar |
| `renderDiceHorizontal()` | `[n]` bracket notation |

### Code Changes Required

```typescript
// BEFORE (ascii-art.ts)
import { createBox, BOX } from './ascii-art.js';
const content: string[] = [];
content.push('TITLE');
return createBox('SECTION', content, undefined, 'HEAVY');

// AFTER (markdown-format.ts)
import { formatSection, toResponse } from './markdown-format.js';
return toResponse({
  display: formatSection('Title', content),
  data: { ... }
});
```

---

## Compatibility Notes

### ChatGPT Rendering
- Tables render well
- Emoji fully supported
- Code blocks with backticks work
- Bold/italic work
- Headers create visual hierarchy

### Claude Desktop
- All Markdown features work
- Monospace font preserves alignment
- HP bars align correctly
- Tables may need fixed-width consideration

### Claude.ai (Web)
- Full Markdown support
- Emoji rendered
- Tables functional

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-19 | Initial specification |

---

_Output Format Spec v1.0.0 • ChatRPG Universal Markdown_
