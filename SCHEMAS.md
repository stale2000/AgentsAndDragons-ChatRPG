# RPG-Lite MCP: Tool Schema Reference

## Living Documentation - Updated as Tools are Implemented

---

## 50 Core Tools (Consolidated)

### Combat Module (14 Tools)

- [x] `roll_dice` (Foundation)
- [ ] `create_encounter` (Auto-rolls initiative, supports templates)
- [ ] `get_encounter` (Full state JSON)
- [ ] `get_encounter_summary` [NEW] (Tactical narrative for LLM)
- [ ] `spawn_from_template` [NEW] (Clone monster stats)
- [ ] `execute_action` (Hub: Move, Attack, Heal, Spell, Lair)
- [ ] `batch_execute_action` [NEW] (Multiple actors/turns)
- [ ] `resolve_attack` [NEW] (High-level wrapper: roll->hit->damage->death)
- [ ] `advance_turn` (Condition ticks)
- [ ] `apply_damage` (Batch support)
- [ ] `roll_death_save` (Dramatic standalone)
- [ ] `manage_condition`
- [ ] `render_battlefield` (ASCII Map)
- [ ] `modify_terrain`
- [ ] `end_encounter` (HP sync to characters)

### Characters Module (11 Tools)

- [ ] `create_character`
- [ ] `get_character`
- [ ] `update_character`
- [ ] `list_characters`
- [ ] `delete_character`
- [ ] `roll_check`
- [ ] `quick_roll` [NEW] (Named presets)
- [ ] `take_rest`
- [ ] `level_up`
- [ ] `manage_effect` (Boons/Curses)
- [ ] `fetch_character_template` [NEW] (Base stat lookup)

### Magic Module (8 Tools)

- [ ] `check_concentration`
- [ ] `break_concentration`
- [ ] `get_concentration`
- [ ] `manage_spell_slots`
- [ ] `use_scroll`
- [ ] `create_aura`
- [ ] `process_aura`
- [ ] `synthesize_spell`

### Spatial Module (7 Tools)

- [ ] `calculate_aoe`
- [ ] `measure_distance`
- [ ] `check_line_of_sight`
- [ ] `check_cover`
- [ ] `place_prop`
- [ ] `calculate_movement`
- [ ] `get_adjacent_squares`

### Data Module (10 Tools)

- [ ] `create_location` (Node)
- [ ] `get_location` (Room data + edges)
- [ ] `move_party` (Traverse edge)
- [ ] `manage_inventory`
- [ ] `manage_party`
- [ ] `add_session_note`
- [ ] `search_notes`
- [ ] `get_session_context` (The "Brain Injection")
- [ ] `link_rooms` [NEW]
- [ ] `unlink_rooms` [NEW]

---

## Implemented Details

### 1. `roll_dice`

**Status:** 🟢 Implemented

**Description:** Roll dice using standard notation with keep/drop modifiers.

**Input Schema:**

```typescript
{
  expression: string;  // Required: "2d6+4", "1d20", "4d6kh3", "2d20kl1"
  reason?: string;     // Optional: "Attack roll", "Damage"
}
```

**Output Example:**

```markdown
🎲 **Roll:** `4d6kh3`
**Dice:** [6, 4, 3, 2] → kept [6, 4, 3]
**Total:** 13
_Reason: Stat generation_
```

**Implementation:** `src/modules/dice.ts` + `src/registry.ts`
**Tests:** `tests/combat/roll_dice.test.ts` (8 passing)

---
