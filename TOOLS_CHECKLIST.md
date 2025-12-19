# RPG-Lite MCP: Tool Implementation Checklist

## 50 Core Tools • TDD Tracker • ASCII Art Era

---

## ✅ Phase 1 Complete: ASCII Art Foundation + Batch Support + Condition System (8/50 tools, enhanced)

**All tools now output immersive ASCII art instead of markdown.**
**Conversion completed:** 2025-12-17
**Test status:** 213/213 passing
**Last updated:** 2025-12-18
**ASCII module:** [src/modules/ascii-art.ts](src/modules/ascii-art.ts)
**Content-Aware Auto-Sizing:** ✅ Implemented (boxes adapt to content, min 40/max 80 chars)
**Batch Operations:** ✅ Implemented (roll_dice, update_character, manage_condition support batch)
**Condition Effects System:** ✅ Implemented (dynamic stat modifications, generic & extensible)

### roll_dice ✅ 🎨 📦

- [x] Schema defined
- [x] Tests written (13/13 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (dice faces, critical hit/fail frames)
- [x] **Batch support** (roll multiple expressions in one call, up to 20)
- [x] Error handling
- **File:** [src/modules/dice.ts](src/modules/dice.ts#L88-L153)
- **Tests:** [tests/combat/roll_dice.test.ts](tests/combat/roll_dice.test.ts), [tests/combat/batch_roll.test.ts](tests/combat/batch_roll.test.ts)
- **ASCII Features:** d6 faces (●), d20 special frames, calculation boxes
- **Batch Features:** Labeled rolls, summary table, individual result tracking
- **Touches:** Standalone
- **Called By:** `execute_action`, `resolve_attack`, `roll_initiative`, `roll_death_save`, `roll_check`, `quick_roll`

### create_character ✅ 🎨

- [x] Schema defined
- [x] Tests written (14/14 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (character sheet with HP bar, stat tables)
- [x] Error handling
- **File:** [src/modules/characters.ts](src/modules/characters.ts)
- **Tests:** [tests/characters/create_character.test.ts](tests/characters/create_character.test.ts)
- **ASCII Features:** HP bars (█░), ability score tables, combat stats table
- **Touches:** Creates JSON in `data/characters/`
- **Called By:** Standalone, `spawn_from_template`

### measure_distance ✅ 🎨

- [x] Schema defined
- [x] Tests written (15/15 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (distance diagram with arrow paths)
- [x] Error handling
- **File:** [src/modules/spatial.ts](src/modules/spatial.ts#L34-L108)
- **Tests:** [tests/spatial/measure_distance.test.ts](tests/spatial/measure_distance.test.ts)
- **ASCII Features:** Arrow paths (→→↓↓), distance box, movement breakdown
- **Touches:** Standalone (pure calculation)
- **Called By:** `calculate_movement`, `check_line_of_sight`, `calculate_aoe`

### manage_condition ✅ 🎨 📦 ⚡

- [x] Schema defined
- [x] Tests written (19/19 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (condition status boxes with effect descriptions)
- [x] **Batch support** (manage multiple conditions in one call, up to 20)
- [x] **Mechanical effects system** (dynamic stat modifications)
- [x] **Character name display** (shows name instead of just ID)
- [x] Error handling
- **File:** [src/modules/combat.ts](src/modules/combat.ts)
- **Tests:** [tests/combat/manage_condition.test.ts](tests/combat/manage_condition.test.ts)
- **ASCII Features:** Condition boxes, exhaustion level tables, duration tracking
- **Batch Features:** Mixed operations (add/remove/query), success/failure summary
- **Mechanical Effects:** HP/speed modifiers, advantage/disadvantage tracking, auto-fail saves
- **Effect Types:** Exhaustion (level-based), Poisoned, Grappled, Paralyzed, Custom conditions
- **Touches:** In-memory condition store, integrates with character stats
- **Called By:** `apply_damage`, `execute_action`, `advance_turn`
- **Exports:** `getActiveConditions()`, `calculateEffectiveStats()` for character integration

### get_character ✅ 🎨 📦 ⚡

- [x] Schema defined
- [x] Tests written (7/7 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (enhanced character sheet with condition integration)
- [x] **Batch support** (retrieve multiple characters, roster view)
- [x] **Condition integration** (shows active conditions and mechanical effects)
- [x] **Effective stats display** (base stats → effective stats with conditions)
- [x] Error handling
- **File:** [src/modules/characters.ts](src/modules/characters.ts)
- **Tests:** [tests/characters/get_character.test.ts](tests/characters/get_character.test.ts)
- **ASCII Features:** HP bars, ability tables, combat stats, optional fields
- **Condition Features:**
  - Active Conditions section (lists all active conditions with sources/durations)
  - Mechanical Effects section (shows stat modifications from conditions)
  - HP bar shows effective max (e.g., 22/22 if halved by Exhaustion 4)
  - Speed/AC marked with `*` if modified, shows base value
  - Example: "Base: 44/44 → Effective: 22/22" for Exhaustion 4
- **Touches:** Reads JSON from `data/characters/`, queries condition store
- **Called By:** `update_character`, `roll_check`, `execute_action`

### update_character ✅ 🎨 📦

- [x] Schema defined
- [x] Tests written (22/22 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (before → after comparison)
- [x] **Batch support** (update multiple characters in one call, up to 20)
- [x] **Relative HP updates** ("+8", "-15" format for damage/healing)
- [x] Error handling
- **File:** [src/modules/characters.ts](src/modules/characters.ts)
- **Tests:** [tests/characters/update_character.test.ts](tests/characters/update_character.test.ts)
- **ASCII Features:** Change comparison with arrow format (→), field-specific updates
- **Batch Features:** HP tracking table, success/failure summary, relative value support
- **Relative HP:** Auto-clamps to 0-maxHp range (e.g., "-10" from 30 HP → 20 HP)
- **Touches:** Reads/writes JSON from `data/characters/`, recalculates derived stats
- **Called By:** `end_encounter` (HP sync), `take_rest`, `level_up`, `apply_damage`

---

## 🔴 Combat Module (14 tools)

### create_encounter ✅ 🎨

- [x] Schema defined
- [x] Tests written (43/43 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (initiative tracker, participant roster)
- [x] Error handling
- **File:** [src/modules/combat.ts](src/modules/combat.ts)
- **Tests:** [tests/combat/create_encounter.test.ts](tests/combat/create_encounter.test.ts)
- **ASCII Features:** Initiative order, participant table, terrain/lighting info
- **Touches:** → `roll_initiative` (internal), `spawn_from_template` (optional)
- **Called By:** Standalone (Combat Entry)

### get_encounter

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Touches:** Reads state
- **Called By:** `render_battlefield`, LLM context

### get_encounter_summary

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **New Tool:** Condensed narrative summary for LLM context injection.
- **Touches:** → `get_encounter`
- **Called By:** LLM for high-level tactical orientation.


### execute_action (The Hub)

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Merged:** `move_combatant`, `apply_healing`, `execute_lair_action`, `cast_spell`.
- **Touches:** → `roll_dice`, `apply_damage`, `manage_condition`, `check_concentration`
- **Reads:** Encounter state, Character state
- **Writes:** HP, Condition, Position

### batch_execute_action

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **New Tool:** Executes an array of actions for multiple actors (optimized for enemy turns).
- **Touches:** → `execute_action` (for each item)
- **Called By:** LLM on NPC turns.

### resolve_attack

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **New Tool:** High-level wrapper for "roll -> hit check -> damage -> death check".
- **Touches:** → `roll_dice`, `apply_damage`
- **Called By:** `execute_action`, LLM (shortcut)

### advance_turn

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Touches:** → `process_aura`, `manage_condition` (duration tick)
- **Writes:** Increments turn/round

### apply_damage (Batch)

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Touches:** → `check_concentration`, `manage_condition` (0 HP logic)
- **Called By:** `execute_action`, `resolve_attack`, `process_aura`

### roll_death_save

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Touches:** → `roll_dice`, `manage_condition`
- **Writes:** Death save successes/failures

### manage_condition

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Called By:** `apply_damage`, `execute_action`, `advance_turn`

### render_battlefield

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Output:** ASCII Grid Representation
- **Touches:** → `get_encounter`

### modify_terrain

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Touches:** Encounter terrain state

### end_encounter

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Touches:** → `update_character` (final HP/status sync), `add_session_note`

---

## 🔴 Characters Module (11 tools)

### roll_check ✅ 🎨

- [x] Schema defined
- [x] Tests written (46/46 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (check result box, modifier breakdown)
- [x] **Blue Phase complete** (refactored with helper functions, critical roll indicators)
- [x] Error handling
- **File:** [src/modules/characters.ts](src/modules/characters.ts)
- **Tests:** [tests/characters/roll_check.test.ts](tests/characters/roll_check.test.ts)
- **ASCII Features:** Advantage/disadvantage display, DC result (✓/✗), critical indicators (⭐/💀)
- **Touches:** → `roll_dice`
- **Reads:** Character bonuses/proficiencies
- **Features/ability/save/attack/initiative checks, contested rolls, DC evaluation

### quick_roll

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **New Tool:** Preset rolls (e.g., "fireball", "sneak_attack") mapped to character skills/spells.
- **Touches:** → `roll_dice`

### manage_effect

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Moved:** Now a permanent part of Character state (Boons/Curses).

### create_character

- [x] Schema defined
- [x] Tests written
- [x] Handler implemented

### get_character

- [x] Schema defined
- [x] Tests written
- [x] Handler implemented

### update_character

- [x] Schema defined
- [x] Tests written
- [x] Handler implemented

### list_characters

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### delete_character

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### take_rest

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Touches:** → `manage_spell_slots`, `update_character`

### level_up

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### fetch_character_template

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **New Tool:** Retrieves base stats for monster templating.

---

## 🔴 Magic Module (8 tools)

### check_concentration

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Called By:** `apply_damage`

### break_concentration

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### get_concentration

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### manage_spell_slots

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### use_scroll

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### create_aura

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### process_aura

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Called By:** `advance_turn`, `execute_action` (Move)

### synthesize_spell

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

---

## 🔴 Spatial Module (7 tools)

### calculate_aoe

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Called By:** `execute_action` (Spell)

### measure_distance

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### check_line_of_sight

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### check_cover

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Returns:** AC/Dex Save bonuses

### place_prop

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### calculate_movement

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Called By:** `execute_action` (Move)

### get_adjacent_squares

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

---

## 🔴 Data Module (10 tools)

### create_location (Node)

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Touches:** Creates Room in graph.

### get_location

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Returns:** Node data + Edges

### move_party

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Touches:** → `get_location`, `get_session_context`
- **Writes:** Current location state

### manage_inventory

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### manage_party

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### add_session_note

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### search_notes

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### get_session_context

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Touches:** Aggregates Location + Party + Notes + Encounter

### link_rooms

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **New Tool:** Creates an edge between two rooms.

### unlink_rooms

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **New Tool:** Removes an edge.

---

## 🔮 Phase 2 Predictions: Schema Evolution

### ASCII Pattern Will Require for Future Tools:

**1. Combat Encounters:**
- Initiative tracker with turn order arrows (→ for current turn)
- Multi-combatant HP bars in table format
- Battlefield grid rendering using `createGrid()`
- Action result summaries with damage dice visualization
- Status effect badges/icons per combatant

**2. Character Updates:**
- Before/after comparison boxes for stat changes
- List views with pagination (characters 1-10 of 45)
- Level-up progression trees (visual skill selection)
- Equipment inventory grids

**3. Magic System:**
- Spell slot visualization: `1st: ●●●○○ 2nd: ●●○○○○`
- Concentration indicators with duration timers
- AoE templates overlaid on grid
- Spell effect stacking displays

**4. Spatial Mechanics:**
- Line-of-sight path rendering (walls as █, clear as ·)
- Cover indicators (½ = half cover, ¾ = three-quarters)
- Movement range highlighting (current pos ◆, valid moves ·)
- Elevation changes (stair symbols)

**5. Session Management:**
- Timeline visualization for session notes
- Location connection graphs (ASCII node diagrams)
- Party roster with quick stats (mini character cards)
- Context summary boxes (DM brain injection)

### Schema Changes Required:

All future `format*Result()` functions must:
1. Import from `ascii-art.ts`
2. Use `createBox()` as primary wrapper (width parameter optional - auto-sizes to content)
3. Build `content: string[]` arrays instead of template literals
4. Let createBox handle sizing (40-80 char range, content-aware)
5. Avoid emoji (except for special dice/icons already in spec)
6. Test for ASCII borders (`╔`) not markdown (`#`, `**`)

---

---

## 📚 System Integration Reference

**Critical Reading:** [SYSTEM-INTERSECTIONS.md](design%20docs/SYSTEM-INTERSECTIONS.md)

This document maps all integration points between modules and predicts future intersections.

**Key Patterns Established:**
1. **Effective Stats Model** - Base → Equipment → Conditions → Effective (✅ Implemented for conditions)
2. **Batch Operations** - Single OR { batch: [...] } pattern (✅ 3 tools)
3. **Character Name Resolution** - characterId OR characterName (✅ 3 tools)
4. **Mechanical Effects Interface** - Generic stat modification system (✅ Implemented)

**Critical Intersections to Implement:**
- Damage → Concentration check (apply_damage needs magic module)
- 0 HP → Unconscious condition (apply_damage needs condition module)
- Incapacitated → Break concentration (condition module needs magic hooks)
- Rest → Multi-system orchestration (HP + slots + conditions + hit dice)
- Equipment → Stats calculation (same pattern as conditions)

---

## Summary

| Module     | Total  | Done  | Remaining | ASCII Ready | Batch Support | Condition Integration |
| ---------- | ------ | ----- | --------- | ----------- | ------------- | --------------------- |
| Combat     | 14     | 3     | 11        | 🎨 Yes      | 📦 Yes (1/3)  | ⚡ Yes (1/3)          |
| Characters | 11     | 5     | 6         | 🎨 Yes      | 📦 Yes (2/5)  | ⚡ Yes (1/5)          |
| Magic      | 8      | 0     | 8         | 🎨 Yes      | 📦 Planned    | ⚡ N/A                |
| Spatial    | 7      | 1     | 6         | 🎨 Yes      | 📦 Planned    | ⚡ N/A                |
| Data       | 10     | 0     | 10        | 🎨 Yes      | 📦 Planned    | ⚡ N/A                |
| **TOTAL**  | **50** | **8** | **42**    | **100%**    | **3 tools**   | **2 tools**           |

**Progress**: 16% complete (8/50 tools fully operational, with enhancements)
**ASCII Foundation**: ✅ Complete - all future tools will follow established patterns
**Test Status**: ✅ ALL 213 TESTS PASSING (11 test files)
**Build Status**: ✅ TypeScript compilation successful
**Batch Operations**: ✅ 3 tools support batch (roll_dice, update_character, manage_condition)
**Condition System**: ✅ Generic mechanical effects system implemented
  - ⚡ **Dynamic stat calculation**: HP, speed, AC modified by active conditions
  - ⚡ **Extensible effects**: Support custom conditions with custom effects
  - ⚡ **Character integration**: get_character shows effective stats + condition details
  - ⚡ **Examples**: Exhaustion 4 halves HP max (44→22), halves speed (30→15)
**Character Names**: ✅ All tool outputs show character names (not just IDs)
**Next Priority**: `apply_damage` (Combat damage processing) or `advance_turn` (Turn management)

_Last Updated: 2025-12-18 23:40 UTC - roll_check Blue Phase complete + create_encounter implemented_
