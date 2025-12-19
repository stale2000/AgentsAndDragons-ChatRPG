/**
 * update_character Tests - TDD
 * Red -> Green -> Refactor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent, parseToolResponse } from '../helpers.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Helper to get the same data directory the code uses
const getDataDir = () => {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'rpg-lite-mcp');
  } else {
    return path.join(os.homedir(), '.config', 'rpg-lite-mcp');
  }
};

describe('update_character', () => {
  let testCharacterId: string;

  beforeEach(async () => {
    // Create a test character before each test
    const result = await handleToolCall('create_character', {
      name: 'Test Hero',
      class: 'Fighter',
      level: 5,
      stats: {
        str: 16,
        dex: 14,
        con: 15,
        int: 10,
        wis: 12,
        cha: 8,
      },
      ac: 18,
      speed: 30,
    });

    const response = parseToolResponse(result);
    testCharacterId = response.data.character.id;
  });

  describe('Basic Updates', () => {
    it('should update character HP', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: 25,
      });

      expect(result.isError).toBeUndefined();
      const response = parseToolResponse(result);
      expect(response.data.success).toBe(true);
      expect(response.data.type).toBe('update');
      expect(response.display).toContain('## 📋 Update:');
      expect(response.display).toContain('### Changes');
      expect(response.display).toContain('**HP:**');
      expect(response.display).toContain('25');
      expect(response.display).toContain('→'); // Arrow showing before → after
    });

    it('should update character level', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        level: 6,
      });

      const response = parseToolResponse(result);
      expect(response.display).toContain('**Level:**');
      expect(response.display).toContain('5'); // Before
      expect(response.display).toContain('6'); // After
      expect(response.display).toContain('→'); // Arrow format
      // Max HP should increase due to level up
      expect(response.display).toContain('**Max HP:**');
    });

    it('should update character name', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        name: 'Updated Hero',
      });

      const response = parseToolResponse(result);
      expect(response.display).toContain('Test Hero'); // Before
      expect(response.display).toContain('Updated Hero'); // After
    });

    it('should update AC', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        ac: 20,
      });

      const response = parseToolResponse(result);
      expect(response.display).toContain('**AC:**');
      expect(response.display).toContain('18'); // Before
      expect(response.display).toContain('20'); // After
    });
  });

  describe('Ability Score Updates', () => {
    it('should update a single ability score', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        stats: { str: 18 },
      });

      const response = parseToolResponse(result);
      expect(response.display).toContain('STR');
      expect(response.display).toContain('16'); // Before
      expect(response.display).toContain('18'); // After
      // Modifier should change from +3 to +4
      expect(response.display).toContain('+3');
      expect(response.display).toContain('+4');
    });

    it('should update multiple ability scores', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        stats: { str: 18, dex: 16, con: 16 },
      });

      const response = parseToolResponse(result);
      expect(response.display).toContain('STR');
      expect(response.display).toContain('DEX');
      expect(response.display).toContain('CON');
    });

    it('should recalculate maxHp when CON changes', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        stats: { con: 18 }, // +4 instead of +2, should add +10 HP (2 * 5 levels)
      });

      const response = parseToolResponse(result);
      expect(response.display).toContain('CON');
      expect(response.display).toContain('Max HP:');
      // Should show increased maxHp
    });
  });

  describe('Multiple Field Updates', () => {
    it('should update multiple fields at once', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: 30,
        ac: 19,
        speed: 35,
        level: 6,
      });

      const response = parseToolResponse(result);
      expect(response.display).toContain('HP:');
      expect(response.display).toContain('AC:');
      expect(response.display).toContain('Speed:');
      expect(response.display).toContain('Level:');
    });

    it('should update class and recalculate derived stats', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        class: 'Wizard', // Lower hit die (d6 vs d10)
      });

      const response = parseToolResponse(result);
      expect(response.display).toContain('Fighter'); // Before
      expect(response.display).toContain('Wizard'); // After
      expect(response.display).toContain('Max HP:'); // Should recalculate
    });
  });

  describe('Optional Fields', () => {
    it('should update equipment list', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        equipment: ['Longsword', 'Shield', 'Plate Armor'],
      });

      const response = parseToolResponse(result);
      expect(response.display).toContain('Equipment:');
      expect(response.display).toContain('Longsword');
      expect(response.display).toContain('Shield');
    });

    it('should update spellcasting info', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        spellcastingAbility: 'int',
        cantrips: ['Fire Bolt', 'Mage Hand'],
        knownSpells: ['Magic Missile', 'Shield'],
      });

      const response = parseToolResponse(result);
      expect(response.display).toContain('Spellcasting Ability');
      expect(response.display).toContain('INT');
    });

    it('should update resistances/immunities', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        resistances: ['fire', 'cold'],
        immunities: ['poison'],
      });

      const response = parseToolResponse(result);
      expect(response.display).toContain('Resistances:');
      expect(response.display).toContain('fire');
      expect(response.display).toContain('Immunities:');
      expect(response.display).toContain('poison');
    });
  });

  describe('Validation', () => {
    it('should reject HP greater than maxHp', async () => {
      // First get current maxHp from JSON data
      const getResult = await handleToolCall('get_character', {
        characterId: testCharacterId,
      });
      const getResponse = parseToolResponse(getResult);
      const maxHp = getResponse.data.character.hp.max;

      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: maxHp + 10, // Over max
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('Error');
      expect(text).toContain('HP');
    });

    it('should treat negative numbers as damage deltas', async () => {
      // Get initial HP from JSON data
      const getResult = await handleToolCall('get_character', {
        characterId: testCharacterId,
      });
      const getResponse = parseToolResponse(getResult);
      const initialHp = getResponse.data.character.hp.current;

      // Apply damage using negative number (delta)
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: -5,
      });

      expect(result.isError).toBeUndefined(); // Should succeed (delta notation)
      const response = parseToolResponse(result);
      expect(response.display).toContain('**HP:**');
      // HP should be reduced by 5 - check the data structure
      expect(response.data.character.hp.current).toBe(initialHp - 5);
    });

    it('should reject level out of range', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        level: 25, // Over 20
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('Level');
    });

    it('should reject ability scores out of range', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        stats: { str: 35 }, // Over 30
      });

      expect(result.isError).toBe(true);
    });

    it('should reject non-existent character', async () => {
      const result = await handleToolCall('update_character', {
        characterId: 'non-existent-id',
        hp: 30,
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('not found');
    });
  });

  describe('Persistence', () => {
    it('should persist changes to disk', async () => {
      await handleToolCall('update_character', {
        characterId: testCharacterId,
        name: 'Persisted Hero',
        hp: 42,
      });

      // Read the file directly from AppData
      const dataDir = path.join(getDataDir(), 'characters');
      const filePath = path.join(dataDir, `${testCharacterId}.json`);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const character = JSON.parse(fileContent);

      expect(character.name).toBe('Persisted Hero');
      expect(character.hp).toBe(42);
    });

    it('should retrieve updated character with get_character', async () => {
      await handleToolCall('update_character', {
        characterId: testCharacterId,
        ac: 22,
      });

      const result = await handleToolCall('get_character', {
        characterId: testCharacterId,
      });

      const response = parseToolResponse(result);
      expect(response.display).toContain('22'); // Updated AC
    });
  });

  describe('Output Format', () => {
    it('should return ToolResponse JSON with display and data fields', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: 35,
        level: 6,
      });

      const response = parseToolResponse(result);
      expect(response.display).toBeDefined();
      expect(response.data).toBeDefined();
      expect(response.data.success).toBe(true);
      expect(response.data.type).toBe('update');
      expect(response.data.changes).toBeDefined();
      expect(response.display).toContain('## 📋 Update:');
      expect(response.display).toContain('### Changes');
      expect(response.display).toContain('→'); // Arrow showing changes
    });

    it('should only show changed fields in comparison', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: 20,
      });

      const response = parseToolResponse(result);
      // Should show HP change
      expect(response.display).toContain('HP:');
      // Should not clutter with unchanged fields (test by checking reasonable length)
      expect(response.display.length).toBeLessThan(2000); // Compact output
    });

    it('should handle updates with no actual changes gracefully', async () => {
      // Get current HP first from JSON data
      const getResult = await handleToolCall('get_character', {
        characterId: testCharacterId,
      });
      const getResponse = parseToolResponse(getResult);
      const currentHp = getResponse.data.character.hp.current;

      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: currentHp, // Same value
      });

      const response = parseToolResponse(result);
      expect(result.isError).toBeUndefined();
      expect(response.display).toContain('## 📋 Update:');
    });
  });
});
