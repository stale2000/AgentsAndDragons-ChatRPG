# ADR-003: ChatGPT / OpenAI Apps SDK Integration Strategy

## Status: PROPOSED

**Date:** 2025-12-19  
**Author:** Architecture Mode  
**Context:** ChatRPG MCP server successfully running on ChatGPT via MCP connector

---

## Context

ChatRPG (RPG-Lite MCP) has been successfully deployed to ChatGPT using the OpenAI MCP connector. This opens significant new distribution channels but introduces UX/UI considerations specific to OpenAI's platform.

### Current Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    ChatRPG MCP Server                       │
├────────────────────────────────────────────────────────────┤
│  Tools: 8 implemented / 50 planned                          │
│  Output: ASCII Box Art (╔═══╗ style)                        │
│  Protocol: MCP (Model Context Protocol)                     │
├────────────────────────────────────────────────────────────┤
│  Clients:                                                   │
│  ├─ Claude Desktop (PRIMARY - Designed for)                 │
│  ├─ ChatGPT Connector (NEW - Working!)                      │
│  └─ Any MCP-compatible client                               │
└────────────────────────────────────────────────────────────┘
```

### Evidence from ChatGPT Integration

Screenshot analysis shows:
1. ✅ Tool calls work correctly through MCP connector
2. ✅ Character creation succeeds with full stat output
3. ✅ User sees tool confirmation dialog before execution
4. ⚠️ ASCII box art renders in ChatGPT response (readability TBD)
5. ⚠️ JSON outputs (search/fetch) vs ASCII outputs (game tools) inconsistency

### OpenAI Apps SDK Constraints

Based on OpenAI's UX Principles and UI Guidelines:

1. **Tool Confirmation UX**: Users must approve tool calls before execution
2. **Response Rendering**: ChatGPT renders tool responses inline in chat
3. **Error Handling**: Graceful degradation expected
4. **Content Policy**: Must not generate harmful content
5. **Structured Data**: JSON preferred for programmatic consumption

---

## Decision Drivers

1. **Multi-Client Support**: Same MCP server serves Claude Desktop AND ChatGPT
2. **Immersion vs Clarity**: ASCII art is immersive but may reduce readability in some clients
3. **Maintenance Burden**: Dual output modes increase complexity
4. **User Expectations**: ChatGPT users expect conversational responses; Claude Desktop users expect terminal-style output
5. **Performance**: Large ASCII blocks consume more tokens

---

## Options Analysis

### Option A: Single Mode - JSON + LLM Rendering

**Description:** All tools return structured JSON. Let the LLM (ChatGPT/Claude) render the data naturally.

```typescript
// Tool returns structured data
return {
  content: [{
    type: 'text',
    text: JSON.stringify({
      character: {
        name: "Vario",
        level: 1,
        class: "Fighter",
        race: "Human",
        hp: { current: 10, max: 10 },
        stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        ac: 10,
        speed: 30
      },
      id: "uuid-here"
    })
  }]
};
```

**Pros:**
- ✅ Universal client compatibility
- ✅ Minimal output size (token efficient)
- ✅ LLM can adapt presentation to context
- ✅ Simplest to maintain

**Cons:**
- ❌ Loses distinctive immersive aesthetic
- ❌ LLM may format inconsistently across sessions
- ❌ No visual dice, HP bars, or battlefield rendering

**Verdict:** Too bland. Loses what makes ChatRPG special.

---

### Option B: Dual Mode - Client-Aware Output

**Description:** Detect client type and return appropriate format.

```typescript
// In registry.ts
function formatOutput(data: any, clientHint?: string): CallToolResult {
  if (clientHint === 'chatgpt' || process.env.OUTPUT_MODE === 'json') {
    return success(JSON.stringify(data));
  }
  return success(formatAsAscii(data));
}
```

**Pros:**
- ✅ Preserves ASCII art for Claude Desktop
- ✅ Clean JSON for ChatGPT integration
- ✅ Can optimize per-client

**Cons:**
- ❌ Complex: Two rendering paths to maintain
- ❌ MCP doesn't provide client identification
- ❌ Testing burden doubles
- ❌ Configuration required (environment variable)

**Verdict:** Feasible but high maintenance cost.

---

### Option C: Semantic Markdown - Universal Format

**Description:** Use clean Markdown that renders well everywhere.

```typescript
// Replace ASCII boxes with semantic Markdown
return success(`
## Vario — Level 1 Human Fighter

**HP:** 10/10 ████████████░░░░░░░░  
**AC:** 10 | **Speed:** 30 ft | **Initiative:** +0

### Ability Scores
| STR | DEX | CON | INT | WIS | CHA |
|:---:|:---:|:---:|:---:|:---:|:---:|
| 10 (+0) | 10 (+0) | 10 (+0) | 10 (+0) | 10 (+0) | 10 (+0) |

### Combat Stats
- **Proficiency Bonus:** +2
- **Character ID:** \`9518ddf2-73b4-42fa-8821-f03748b748d7\`
`);
```

**Pros:**
- ✅ Universal rendering (ChatGPT, Claude, any markdown client)
- ✅ Still visually appealing with HP bars, tables
- ✅ Single codebase
- ✅ Token efficient vs ASCII boxes
- ✅ Accessible (screen readers can parse)

**Cons:**
- ⚠️ Less "terminal aesthetic" than ASCII
- ⚠️ Loses box-drawing characters charm
- ⚠️ Some formatting may vary by client

**Verdict:** RECOMMENDED - Best balance of immersion and compatibility.

---

### Option D: Hybrid - ASCII Core + JSON Companion

**Description:** Return both formats in the response.

```typescript
return {
  content: [
    { type: 'text', text:iiFormatted },
    { 
      type: 'text', 
      annotations: { role: 'structured_data' },
      text: JSON.stringify(structuredData) 
    }
  ]
};
```

**Pros:**
- ✅ Clients can choose what to display
- ✅ Programmatic access to data
- ✅ Preserves ASCII for display

**Cons:**
- ❌ MCP doesn't have standard annotation handling
- ❌ Doubles response size
- ❌ Client must know to parse second content block

**Verdict:** Not supported by current MCP spec.

---

## Decision

**ADOPT Option C: Semantic Markdown**

Rationale:
1. Single output format reduces maintenance burden
2. Markdown tables and visual elements (████) work universally
3. Preserves visual appeal without client-specific code
4. Aligns with OpenAI's preference for clear, readable responses
5. Can still include visual elements (HP bars, dice results) in Unicode

---

## Implementation Strategy

### Phase 1: Output Format Migration

**Goal:** Replace ASCII box art with Semantic Markdown

```typescript
// BEFORE (ASCII Art)
╔═══════════════════════ DICE ROLL ═══════════════════════╗
║                    Rolling: 2d6+4                        ║
║                                                          ║
║                   ⚀ ⚁ ⚂ ⚃ ⚄ ⚅                          ║
║                   [3] [5]                                ║
║                                                          ║
║                    Total: 12                             ║
╚═════════════════════════════════════════════════════════╝

// AFTER (Semantic Markdown)
## 🎲 Dice Roll: 2d6+4

**Dice:** [3] [5]  
**Modifier:** +4  
**Total:** **12**
```

### Phase 2: Structured Data Addition

**Goal:** Tools return both human text AND parseable data

```typescript
interface ToolResponse {
  // Human-readable Markdown
  display: string;
  
  // Machine-parseable data (for automation/integrations)
  data: Record<string, unknown>;
}

// Tool implementation
return success(JSON.stringify({
  display: markdownFormatted,
  data: { character: charData, id: uuid }
}));
```

**ChatGPT benefit:** LLM can reference `data` for follow-up questions
**Claude benefit:** Same response works in terminal

### Phase 3: Tool Simplification

**Goal:** Align with OpenAI UX Principles

| Current Tool | OpenAI Alignment Issue | Recommended Change |
|--------------|----------------------|-------------------|
| `roll_dice` (batch mode) | Too complex for single call | Keep but document well |
| `update_character` (batch) | Mass updates confusing | Keep, add `hp_delta` helper |
| `manage_condition` (batch) | Good - batch adds clarity | Keep as-is |
| `search` + `fetch` | ✅ Already OpenAI pattern | Expand content database |

### Phase 4: Error Experience

**Goal:** Friendly errors that guide users

```typescript
// BEFORE
return error(`Character not found: ${id}`);

// AFTER
return {
  content: [{
    type: 'text',
    text: `## ⚠️ Character Not Found

The character "${id}" doesn't exist in this campaign.

**Did you mean to:**
- Create a new character? → "Create a fighter named ${id}"
- Check existing characters? → "List all characters"
`
  }],
  isError: true
};
```

---

## Migration Path

### Step 1: Create Markdown Formatter Module

```typescript
// src/modules/markdown-format.ts
export function formatCharacter(char: Character): string { ... }
export function formatDiceRoll(roll: DiceResult): string { ... }
export function formatEncounter(enc: Encounter): string { ... }
```

### Step 2: Deprecate ASCII Art Module

```typescript
// src/modules/ascii-art.ts
// DEPRECATED: Use markdown-format.ts instead
// Keep for reference during migration
```

### Step 3: Update Tools One-by-One

Priority order:
1. `create_character` - Most visible, sets pattern
2. `roll_dice` - High frequency, establishes dice format
3. `get_character` - Character sheet format
4. `manage_condition` - Status effect format
5. Remaining tools...

### Step 4: Test on Both Clients

- Claude Desktop: Verify Markdown renders well
- ChatGPT: Verify response quality
- Add integration tests for format validation

---

## Visual Element Preservation

### HP Bars (Keep)
```markdown
**HP:** 15/20 █████████████░░░░░░░ (75%)
```

### Dice Visualization (Simplify)
```markdown
**Roll:** [4] [6] = 10
```

### Status Effects (Icons)
```markdown
**Conditions:** 🔥 Burning (2 rounds) | 😵 Stunned (save ends)
```

### Initiative Order (Tables)
```markdown
| # | Name | Init | HP | Status |
|---|------|------|-----|--------|
| → | **Vario** | 18 | 15/20 | — |
| 2 | Goblin A | 15 | 7/7 | — |
| 3 | Goblin B | 12 | 5/7 | 🩸 |
```

---

## Acceptance Criteria

1. [ ] All 8 implemented tools output Semantic Markdown
2. [ ] ASCII art module deprecated with migration guide
3. [ ] Tools return both `display` and `data` fields
4. [ ] Error messages include helpful suggestions
5. [ ] Visual elements (HP bars, dice) use Unicode that renders universally
6. [ ] Test suite validates Markdown output format
7. [ ] Documentation updated for new output format

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Markdown varies by client | Visual inconsistency | Test on 3+ clients |
| Loss of ASCII aesthetic | User disappointment | Preserve visual elements in Markdown |
| Breaking existing users | API disruption | Version bump, changelog |
| Token usage changes | Cost impact | Monitor before/after |

---

## References

- OpenAI Apps SDK UX Principles: https://developers.openai.com/apps-sdk/concepts/ux-principles
- OpenAI Apps SDK UI Guidelines: https://developers.openai.com/apps-sdk/concepts/ui-guidelines
- MCP Specification: https://modelcontextprotocol.io/
- Current ASCII Art Module: `src/modules/ascii-art.ts`

---

## Appendix: Sample Outputs

### Character Creation (After Migration)

```markdown
## ⚔️ Character Created: Vario

**Level 1 Human Fighter**

### Vital Stats
- **HP:** 10/10 ████████████████████
- **AC:** 10
- **Speed:** 30 ft
- **Initiative:** +0
- **Proficiency:** +2

### Ability Scores
| STR | DEX | CON | INT | WIS | CHA |
|:---:|:---:|:---:|:---:|:---:|:---:|
| 10 | 10 | 10 | 10 | 10 | 10 |
| +0 | +0 | +0 | +0 | +0 | +0 |

---
*Character ID: `9518ddf2-73b4-42fa-8821-f03748b748d7`*

**Next:** Lock in your background and equipment loadout!
```

### Dice Roll (After Migration)

```markdown
## 🎲 Attack Roll

**Rolling:** 1d20+5 (Longsword Attack)

**Result:** [17] + 5 = **22**

✅ **HIT!** (vs AC 15)
```

### Encounter (After Migration)

```markdown
## ⚔️ Combat Begins: Goblin Ambush

**Round 1** | Lighting: Dim | Terrain: Forest Path

### Initiative Order
| # | Combatant | Init | HP | Conditions |
|:-:|-----------|:----:|:--:|:----------:|
| → | **Vario** | 18 | 10/10 | — |
| 2 | Goblin Scout | 15 | 7/7 | — |
| 3 | Goblin Archer | 12 | 7/7 | — |

**Current Turn:** Vario (Fighter)  
**Actions Available:** Action, Bonus Action, Movement (30 ft)
```

---

_ADR-003 • ChatGPT Integration Strategy • v1.0_
