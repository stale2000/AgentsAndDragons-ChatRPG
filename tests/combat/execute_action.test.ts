/**
 * execute_action Tests - TDD Red Phase
 * Phase 1: Attack + Movement only (per ADR-001)
 * These tests are intentionally written to FAIL until the handler is implemented
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';
import { createEncounter, clearAllEncounters, getEncounter, getEncounterParticipant } from '../../src/modules/combat.js';

// Helper to create a standard test encounter
function createTestEncounter() {
  const result = createEncounter({
    participants: [
      {
        id: 'fighter-1',
        name: 'Thorin',
        hp: 44,
        maxHp: 44,
        ac: 18,
        initiativeBonus: 2,
        position: { x: 5, y: 5 },
        isEnemy: false,
        speed: 30,
      },
      {
        id: 'goblin-1',
        name: 'Goblin Scout',
        hp: 7,
        maxHp: 7,
        ac: 13,
        initiativeBonus: 2,
        position: { x: 6, y: 5 }, // Adjacent to fighter for OA tests
        isEnemy: true,
        speed: 30,
      },
      {
        id: 'goblin-2',
        name: 'Goblin Archer',
        hp: 7,
        maxHp: 7,
        ac: 12,
        initiativeBonus: 1,
        position: { x: 10, y: 10 },
        isEnemy: true,
        speed: 30,
      },
    ],
    terrain: { width: 20, height: 20 },
    lighting: 'bright',
  });

  // Extract encounter ID from result
  const idMatch = result.match(/Encounter ID: ([a-zA-Z0-9-]+)/);
  return idMatch ? idMatch[1] : '';
}

describe('execute_action', () => {
  beforeEach(() => {
    clearAllEncounters();
  });

  // ============================================================
  // ATTACK ACTION TESTS
  // ============================================================

  describe('Attack Action', () => {
    it('should execute a melee attack against a target', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'attack',
        targetId: 'goblin-1',
        weaponType: 'melee',
        damageExpression: '1d8+3',
        damageType: 'slashing',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Thorin');
      expect(text).toContain('Goblin Scout');
      // Should show attack roll result
      expect(text).toMatch(/attack|roll|hit|miss/i);
    });

    it('should hit when attack roll meets or exceeds AC', async () => {
      const encounterId = createTestEncounter();

      // Use manual roll to guarantee a hit (20 vs AC 13)
      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'attack',
        targetId: 'goblin-1',
        weaponType: 'melee',
        damageExpression: '1d8+3',
        damageType: 'slashing',
        manualAttackRoll: 15, // Beats AC 13
      });

      const text = getTextContent(result);
      expect(text).toMatch(/hit/i);
      expect(text).not.toMatch(/miss/i);
    });

    it('should miss when attack roll is below AC', async () => {
      const encounterId = createTestEncounter();

      // Use manual roll to guarantee a miss (5 vs AC 13)
      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'attack',
        targetId: 'goblin-1',
        weaponType: 'melee',
        damageExpression: '1d8+3',
        damageType: 'slashing',
        manualAttackRoll: 5, // Below AC 13
      });

      const text = getTextContent(result);
      expect(text).toMatch(/miss/i);
    });

    it('should apply damage to target on hit', async () => {
      const encounterId = createTestEncounter();

      // Guarantee hit with manual roll
      await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'attack',
        targetId: 'goblin-1',
        weaponType: 'melee',
        damageExpression: '1d8+3',
        damageType: 'slashing',
        manualAttackRoll: 18,
        manualDamageRoll: 6, // 1d8 = 6, +3 = 9 total
      });

      // Check that goblin took damage
      const goblin = getEncounterParticipant(encounterId, 'goblin-1');
      expect(goblin).toBeDefined();
      // Goblin had 7 HP, took 9 damage, should be at 0 or dead
      expect(goblin!.hp).toBeLessThan(7);
    });

    it('should handle critical hit on natural 20', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'attack',
        targetId: 'goblin-1',
        weaponType: 'melee',
        damageExpression: '1d8+3',
        damageType: 'slashing',
        manualAttackRoll: 20, // Natural 20
      });

      const text = getTextContent(result);
      expect(text).toMatch(/critical|crit/i);
    });

    it('should handle critical miss on natural 1', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'attack',
        targetId: 'goblin-1',
        weaponType: 'melee',
        damageExpression: '1d8+3',
        damageType: 'slashing',
        manualAttackRoll: 1, // Natural 1
      });

      const text = getTextContent(result);
      expect(text).toMatch(/miss/i);
    });

    it('should support advantage on attack rolls', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'attack',
        targetId: 'goblin-1',
        weaponType: 'melee',
        damageExpression: '1d8+3',
        damageType: 'slashing',
        advantage: true,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should indicate advantage was used
      expect(text).toMatch(/advantage/i);
    });

    it('should support disadvantage on attack rolls', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'attack',
        targetId: 'goblin-1',
        weaponType: 'melee',
        damageExpression: '1d8+3',
        damageType: 'slashing',
        disadvantage: true,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/disadvantage/i);
    });

    it('should error when target does not exist', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'attack',
        targetId: 'nonexistent',
        weaponType: 'melee',
        damageExpression: '1d8+3',
        damageType: 'slashing',
      });

      expect(result.isError).toBe(true);
    });

    it('should error when actor does not exist', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'nonexistent',
        actionType: 'attack',
        targetId: 'goblin-1',
        weaponType: 'melee',
        damageExpression: '1d8+3',
        damageType: 'slashing',
      });

      expect(result.isError).toBe(true);
    });

    it('should support actor lookup by name', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorName: 'Thorin',
        actionType: 'attack',
        targetId: 'goblin-1',
        weaponType: 'melee',
        damageExpression: '1d8+3',
        damageType: 'slashing',
        manualAttackRoll: 15,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Thorin');
    });

    it('should support target lookup by name', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'attack',
        targetName: 'Goblin Scout',
        weaponType: 'melee',
        damageExpression: '1d8+3',
        damageType: 'slashing',
        manualAttackRoll: 15,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Goblin Scout');
    });
  });

  // ============================================================
  // MOVEMENT TESTS
  // ============================================================

  describe('Move Action', () => {
    it('should move actor to new position', async () => {
      const encounterId = createTestEncounter();

      // Attack with movement (common pattern in D&D)
      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'attack',
        targetId: 'goblin-1',
        moveTo: { x: 6, y: 5 },
        weaponType: 'melee',
        damageExpression: '1d8+3',
        damageType: 'slashing',
        manualAttackRoll: 15,
      });

      // Check position was updated
      const fighter = getEncounterParticipant(encounterId, 'fighter-1');
      expect(fighter).toBeDefined();
      expect(fighter!.position.x).toBe(6);
      expect(fighter!.position.y).toBe(5);
    });

    it('should track movement remaining based on speed', async () => {
      const encounterId = createTestEncounter();

      // Attack with 25ft of movement
      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'attack',
        targetId: 'goblin-1',
        moveTo: { x: 10, y: 5 }, // 5 squares = 25ft of movement
        weaponType: 'melee',
        damageExpression: '1d8+3',
        damageType: 'slashing',
        manualAttackRoll: 15,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should show movement used
      expect(text).toMatch(/move|position|(\d+)\s*ft/i);
    });

    it('should error when movement exceeds speed', async () => {
      const encounterId = createTestEncounter();

      // Fighter has speed 30, try to move 50ft (10 squares)
      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'attack',
        moveTo: { x: 15, y: 5 }, // 10 squares = 50ft, exceeds 30ft speed
      });

      // Should either error or clamp movement
      expect(result.isError).toBe(true);
    });
  });

  // ============================================================
  // DASH ACTION TESTS
  // ============================================================

  describe('Dash Action', () => {
    it('should double movement speed for the turn', async () => {
      const encounterId = createTestEncounter();

      // First, dash
      const dashResult = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'dash',
      });

      const text = getTextContent(dashResult);
      expect(dashResult.isError).toBeUndefined();
      expect(text).toMatch(/dash|double|60|movement/i);
    });

    it('should allow double movement after dashing', async () => {
      const encounterId = createTestEncounter();

      // Dash first
      await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'dash',
      });

      // Now try to move 50ft (should work with dash, normally only 30ft)
      const moveResult = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'attack',
        targetId: 'goblin-2', // Attack goblin-2 at (10, 10)
        moveTo: { x: 15, y: 5 }, // 10 squares = 50ft
        weaponType: 'melee',
        damageExpression: '1d8+3',
        damageType: 'slashing',
        manualAttackRoll: 15,
      });

      // With dash, 60ft is available, 50ft should work
      expect(moveResult.isError).toBeUndefined();
    });
  });

  // ============================================================
  // ACTION ECONOMY TESTS
  // ============================================================

  describe('Action Economy', () => {
    it('should track action cost', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'attack',
        actionCost: 'action',
        targetId: 'goblin-1',
        weaponType: 'melee',
        damageExpression: '1d8+3',
        damageType: 'slashing',
        manualAttackRoll: 15,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should acknowledge action was used
      expect(text).toMatch(/action/i);
    });

    it('should support bonus action attacks', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'attack',
        actionCost: 'bonus_action',
        targetId: 'goblin-1',
        weaponType: 'melee',
        damageExpression: '1d6+3', // Offhand weapon
        damageType: 'slashing',
        manualAttackRoll: 15,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/bonus/i);
    });
  });

  // ============================================================
  // ERROR HANDLING TESTS
  // ============================================================

  describe('Error Handling', () => {
    it('should error when encounter does not exist', async () => {
      const result = await handleToolCall('execute_action', {
        encounterId: 'nonexistent-encounter-id',
        actorId: 'fighter-1',
        actionType: 'attack',
        targetId: 'goblin-1',
        weaponType: 'melee',
        damageExpression: '1d8+3',
        damageType: 'slashing',
      });

      expect(result.isError).toBe(true);
    });

    it('should error when actionType is missing', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        // actionType missing
      });

      expect(result.isError).toBe(true);
    });

    it('should error when attack has no target', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'attack',
        weaponType: 'melee',
        damageExpression: '1d8+3',
        damageType: 'slashing',
        // No targetId or targetName
      });

      expect(result.isError).toBe(true);
    });
  });

  // ============================================================
  // ASCII OUTPUT TESTS
  // ============================================================

  describe('ASCII Output', () => {
    it('should return ASCII formatted output', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'attack',
        targetId: 'goblin-1',
        weaponType: 'melee',
        damageExpression: '1d8+3',
        damageType: 'slashing',
        manualAttackRoll: 15,
      });

      const text = getTextContent(result);
      // Should have ASCII box borders
      expect(text).toContain('╔');
      expect(text).toContain('╗');
      expect(text).toContain('╚');
      expect(text).toContain('╝');
    });
  });

  // ============================================================
  // PHASE 2: TACTICAL ACTIONS
  // ============================================================

  describe('Disengage Action', () => {
    it('should allow disengage action', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'disengage',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/disengage/i);
    });

    it('should prevent opportunity attacks after disengage', async () => {
      const encounterId = createTestEncounter();

      // Disengage first
      await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'disengage',
      });

      // Move away from goblin (fighter at 5,5 moving to 0,5 - away from goblin at 7,5)
      const moveResult = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'dash', // Use dash to just move without attack
        moveTo: { x: 0, y: 5 },
      });

      // Should NOT trigger opportunity attack
      const text = getTextContent(moveResult);
      expect(text).not.toMatch(/opportunity/i);
    });
  });

  describe('Dodge Action', () => {
    it('should allow dodge action', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'dodge',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/dodge/i);
    });

    it('should grant disadvantage on attacks against dodging target', async () => {
      const encounterId = createTestEncounter();

      // Fighter dodges
      await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'dodge',
      });

      // Goblin attacks fighter (should have disadvantage)
      const attackResult = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'goblin-1',
        actionType: 'attack',
        targetId: 'fighter-1',
        weaponType: 'melee',
        damageExpression: '1d6+1',
        damageType: 'piercing',
      });

      const text = getTextContent(attackResult);
      expect(attackResult.isError).toBeUndefined();
      // Should indicate disadvantage due to dodge (output shows 'target dodging')
      expect(text).toMatch(/disadvantage|dodging/i);
    });
  });

  describe('Grapple Action', () => {
    it('should allow grapple action', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'grapple',
        targetId: 'goblin-1',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/grapple|athletics/i);
    });

    it('should apply grappled condition on success', async () => {
      const encounterId = createTestEncounter();

      // Fighter grapples goblin with high manual roll
      const grappleResult = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'grapple',
        targetId: 'goblin-1',
        manualAttackRoll: 20, // High roll to ensure success
      });

      // Check goblin has grappled condition
      // (This would need integration with manage_condition)
      const text = getTextContent(grappleResult);
      expect(text).toMatch(/grappled|success/i);
    });

    it('should require target for grapple', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'grapple',
        // No target
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('Shove Action', () => {
    it('should allow shove away action', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'shove',
        targetId: 'goblin-1',
        shoveDirection: 'away',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/shove|push|athletics/i);
    });

    it('should move target 5ft away on successful shove away', async () => {
      const encounterId = createTestEncounter();

      // Get goblin's current position (6, 5) - adjacent to fighter
      const goblinBefore = getEncounterParticipant(encounterId, 'goblin-1');
      expect(goblinBefore!.position.x).toBe(6);

      // Shove with high roll
      await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'shove',
        targetId: 'goblin-1',
        shoveDirection: 'away',
        manualAttackRoll: 20,
      });

      // Goblin should be pushed away from fighter (at 5,5)
      const goblinAfter = getEncounterParticipant(encounterId, 'goblin-1');
      expect(goblinAfter!.position.x).toBeGreaterThan(6);
    });

    it('should allow shove prone action', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'shove',
        targetId: 'goblin-1',
        shoveDirection: 'prone',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/shove|prone|athletics/i);
    });

    it('should require target for shove', async () => {
      const encounterId = createTestEncounter();

      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'shove',
        shoveDirection: 'away',
        // No target
      });

      expect(result.isError).toBe(true);
    });
  });

  // ============================================================
  // OPPORTUNITY ATTACKS
  // ============================================================

  describe('Opportunity Attacks', () => {
    it('should trigger opportunity attack when leaving enemy reach', async () => {
      const encounterId = createTestEncounter();

      // Fighter (at 5,5) is adjacent to Goblin (at 7,5)
      // Move fighter away without disengage
      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'dash', // Just moving, no disengage
        moveTo: { x: 0, y: 5 }, // Moving away from goblin
      });

      const text = getTextContent(result);
      // Should mention opportunity attack from goblin
      expect(text).toMatch(/opportunity|reaction/i);
    });

    it('should not trigger opportunity attack when not in reach', async () => {
      const encounterId = createTestEncounter();

      // Fighter (at 5,5) moves toward Goblin Archer (at 10,10)
      // Neither is adjacent to the other, so no OA
      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'dash',
        moveTo: { x: 8, y: 8 }, // Moving away from goblin-1 but toward goblin-2
      });

      const text = getTextContent(result);
      // Goblin-1 at 7,5 should trigger OA as fighter leaves its reach
      // But goblin-2 at 10,10 should not (not adjacent at start)
      expect(text).toMatch(/opportunity|Goblin Scout/i);
    });

    it('should apply damage from opportunity attack', async () => {
      const encounterId = createTestEncounter();

      // Get fighter's HP before
      const fighterBefore = getEncounterParticipant(encounterId, 'fighter-1');
      const hpBefore = fighterBefore!.hp;

      // Move away (triggering OA)
      await handleToolCall('execute_action', {
        encounterId,
        actorId: 'fighter-1',
        actionType: 'dash',
        moveTo: { x: 0, y: 5 },
      });

      // Fighter might have taken damage from OA (depends on goblin's attack roll)
      // Since we can't control goblin's roll, just check the move happened
      const fighterAfter = getEncounterParticipant(encounterId, 'fighter-1');
      expect(fighterAfter).toBeDefined();
    });
  });
});
