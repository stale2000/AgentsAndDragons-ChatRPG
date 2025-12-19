# ChatRPG Refactor - Orchestrator Prompt

## Mission

Execute the ChatGPT Integration Refactor as specified in the architecture documents. Transform ChatRPG from ASCII box art output to Universal Semantic Markdown for multi-client MCP compatibility.

---

## Context

ChatRPG MCP server is now running on ChatGPT via OpenAI's MCP connector. The current ASCII box art output format (╔═══╗) works but is not optimized for ChatGPT's rendering. Architecture has decided to migrate to Semantic Markdown.

### Key Documents
- **ADR:** `design docs/ADR-003-CHATGPT-OPENAI-INTEGRATION.md` - Decision rationale
- **Format Spec:** `design docs/OUTPUT-FORMAT-SPEC.md` - Visual element standards
- **Roadmap:** `design docs/REFACTOR-ROADMAP.md` - Sprint breakdown

### Current State
- 8/50 tools implemented with ASCII art output
- All 213 tests passing
- Tools: `roll_dice`, `create_character`, `get_character`, `update_character`, `manage_condition`, `measure_distance`, `create_encounter`, `roll_check`, `execute_action`
- ChatGPT connector tools: `search`, `fetch`

---

## Sprint 1 Tasks (Priority: Execute Now)

### Task 1.1: Create Markdown Format Module
**Mode:** Code  
**File:** `src/modules/markdown-format.ts`  
**Acceptance Criteria:**
- [ ] Export `ToolResponse` interface with `display`, `data`, `suggestions` fields
- [ ] Export `toResponse()` function to serialize response
- [ ] Export `formatHpBar(current, max)` using `███░░░` characters
- [ ] Export `formatDiceResult(rolls, modifier?)` using `[n]` notation
- [ ] Export `formatAb(stats)` as Markdown table
- [ ] Export `formatConditionIcon(condition)` returning emoji
- [ ] Export `formatError(title, message, suggestions?)` with helpful format
- [ ] Unit tests for all formatters

**Reference:** `design docs/OUTPUT-FORMAT-SPEC.md` sections: HP Bars, Dice Results, Ability Scores, Conditions

---

### Task 1.2: Migrate roll_dice Tool
**Mode:** Code  
**File:** `src/registry.ts` (roll_dice handler)  
**Dependencies:** Task 1.1 complete  
**Acceptance Criteria:**
- [ ] Import from `markdown-format.ts` instead of `ascii-art.ts`
- [ ] Return `ToolResponse` JSON structure
- [ ] Single roll: `## 🎲 {expression}` heading, dice display, total
- [ ] Batch roll: Summary table with labels
- [ ] Critical hit: `## 💥 CRITICAL HIT!` styling
- [ ] Critical miss: `## 💀 Critical Miss` styling
- [ ] Update tests in `tests/combat/roll_dice.test.ts`
- [ ] Update tests in `tests/combat/batch_roll.test.ts`

**Reference:** `design docs/OUTPUT-FORMAT-SPEC.md` section: Dice Results

---

### Task 1.3: Migrate create_character Tool
**Mode:** Code  
**File:** `src/modules/characters.ts`  
**Dependencies:** Task 1.1 complete  
**Acceptance Criteria:**
- [ ] Return `ToolResponse` JSON structure
- [ ] `## ⚔️ Character Created: {name}` heading
- [ ] HP bar using `formatHpBar()`
- [ ] Ability scores in 2-row Markdown table
- [ ] Combat stats in readable format
- [ ] Character ID in monospace code block
- [ ] Suggestions array for next steps
- [ ] `data` field contains full character object
- [ ] Update tests in `tests/characters/create_character.test.ts`

**Reference:** `design docs/OUTPUT-FORMAT-SPEC.md` section: create_character

---

### Task 1.4: Update Test Helpers
**Mode:** Code  
**File:** `tests/helpers.ts`  
**Dependencies:** Task 1.2 or 1.3 complete  
**Acceptance Criteria:**
- [ ] Add `parseToolResponse(result)` to extract `ToolResponse` from `CallToolResult`
- [ ] Add `expectDisplayContains(result, text)` assertion helper
- [ ] Add `expectDataField(result, path, value)` for structured data checks
- [ ] Refactor existing tests to use new helpers where applicable
- [ ] All 213 tests still pass

---

## Worker Constraints

### File Patterns
- Code workers may edit: `src/**/*.ts`, `tests/**/*.ts`
- Do NOT edit: `design docs/*.md` (read-only reference)

### Testing Requirements
- Run `npm test` after each tool migration
- All tests must pass before marking task complete

### Output Format Contract
All migrated tools MUST return JSON string matching:
```typescript
{
  display: string;      // Human-readable Markdown
  data: {
    success: boolean;
    type: string;       // 'roll' | 'character' | 'encounter' | etc.
    [key: string]: any; // Tool-specific data
  };
  suggestions?: string[]; // Optional next steps
}
```

---

## Parallelization Rules

- Task 1.1 MUST complete before 1.2 and 1.3
- Tasks.3 CAN run in parallel after 1.1
- Task 1.4 can start after either 1.2 or 1.3 completes

---

## Success Criteria for Sprint 1

1. `markdown-format.ts` module exists with all specified exports
2. `roll_dice` returns Semantic Markdown format
3. `create_character` returns Semantic Markdown format
4. Test helpers established for ToolResponse validation
5. All existing tests pass (213+)
6. New tests validate JSON structure of responses

---

## Boomerang Protocol

Workers must return structured completion:
```json
{
  "type": "task-completed",
  "task_id": "1.1|1.2|1.3|1.4",
  "status": "success|failed|blocked",
  "files_changed": ["src/modules/markdown-format.ts"],
  "tests_run": ["npm test"],
  "summary": "Created markdown format module with 8 exported functions",
  "notes": "Consider adding formatInitiativeTable for Sprint 2"
}
```

---

## Escalation Triggers

Escalate to Architect if:
- Format spec is ambiguous or conflicting
- Breaking change to tool API signature required
- New dependency needed

Escalate to Debug if:
- Tests fail after migration
- Runtime errors in tool handlers

---

_Orchestrator Prompt v1.0 • ChatRPG Refactor Sprint 1_
