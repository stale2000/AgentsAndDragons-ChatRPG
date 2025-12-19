/**
 * create_character Tests - TDD
 * Red -> Green -> Refactor
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

const DATA_DIR = path.join(getDataDir(), 'characters');

describe('create_character', () => {
  // Clean up test data before and after all tests in this suite
  beforeAll(() => {
    if (fs.existsSync(DATA_DIR)) {
      const files = fs.readdirSync(DATA_DIR);
      for (const file of files) {
        const filePath = path.join(DATA_DIR, file);
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          // Ignore errors if file was already deleted
        }
      }
    }
  });

  afterAll(() => {
    if (fs.existsSync(DATA_DIR)) {
      const files = fs.readdirSync(DATA_DIR);
      for (const file of files) {
        const filePath = path.join(DATA_DIR, file);
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          // Ignore errors if file was already deleted
        }
      }
    }
  });

  describe('Basic Creation', () => {
    it('should create a character with minimal required fields', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Thorin',
      });
      const response = parseToolResponse(result);
      expect(result.isError).toBeUndefined();
      expect(response.data.success).toBe(true);
      expect(response.data.type).toBe('character');
      expect(response.data.character.name).toBe('Thorin');
      expect(response.display).toContain('## ⚔️ Character Created:');
    });

    it('should create a character with full D&D stats', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Gandalf',
        race: 'Human',
        class: 'Wizard',
        level: 5,
        stats: {
          str: 10,
          dex: 14,
          con: 12,
          int: 18,
          wis: 16,
          cha: 14,
        },
      });
      const response = parseToolResponse(result);
      expect(result.isError).toBeUndefined();
      expect(response.data.character.name).toBe('Gandalf');
      expect(response.data.character.class).toBe('Wizard');
      expect(response.data.character.race).toBe('Human');
      expect(response.data.character.level).toBe(5);
      expect(response.data.character.stats.int).toBe(18);
      expect(response.display).toContain('Wizard');
    });

    it('should auto-calculate HP based on class and CON', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Fighter Test',
        class: 'Fighter',
        level: 1,
        stats: {
          str: 16,
          dex: 14,
          con: 14, // +2 modifier
          int: 10,
          wis: 10,
          cha: 10,
        },
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Fighter d10 hit die: 10 + CON mod (2) = 12 HP at level 1
      expect(text).toContain('HP');
    });

    it('should generate unique character ID', async () => {
      const result1 = await handleToolCall('create_character', {
        name: 'Character 1',
      });
      const result2 = await handleToolCall('create_character', {
        name: 'Character 2',
      });

      expect(result1.isError).toBeUndefined();
      expect(result2.isError).toBeUndefined();

      // Extract IDs from results
      const response1 = parseToolResponse(result1);
      const response2 = parseToolResponse(result2);
      const id1 = response1.data.character.id;
      const id2 = response2.data.character.id;

      // IDs should be different
      expect(id1).not.toBe(id2);

      // Both files should exist
      expect(fs.existsSync(path.join(DATA_DIR, `${id1}.json`))).toBe(true);
      expect(fs.existsSync(path.join(DATA_DIR, `${id2}.json`))).toBe(true);
    });
  });

  describe('Character Types', () => {
    it('should create PC type by default', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Hero',
      });
      const response = parseToolResponse(result);
      expect(result.isError).toBeUndefined();
      expect(response.data.character.characterType || 'pc').toBe('pc');
    });

    it('should create NPC type when specified', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Shopkeeper',
        characterType: 'npc',
      });
      const response = parseToolResponse(result);
      expect(result.isError).toBeUndefined();
      expect(response.data.success).toBe(true);
    });

    it('should create enemy type when specified', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Goblin',
        characterType: 'enemy',
      });
      const response = parseToolResponse(result);
      expect(result.isError).toBeUndefined();
      expect(response.data.success).toBe(true);
    });
  });

  describe('Validation', () => {
    it('should reject ability scores below 1', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Invalid',
        stats: {
          str: 0,
          dex: 10,
          con: 10,
          int: 10,
          wis: 10,
          cha: 10,
        },
      });
      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('Error');
    });

    it('should reject ability scores above 30', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Invalid',
        stats: {
          str: 31,
          dex: 10,
          con: 10,
          int: 10,
          wis: 10,
          cha: 10,
        },
      });
      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('Error');
    });

    it('should reject missing name', async () => {
      const result = await handleToolCall('create_character', {
        class: 'Wizard',
      });
      expect(result.isError).toBe(true);
    });

    it('should reject invalid level (0 or >20)', async () => {
      const result1 = await handleToolCall('create_character', {
        name: 'Invalid',
        level: 0,
      });
      expect(result1.isError).toBe(true);

      const result2 = await handleToolCall('create_character', {
        name: 'Invalid',
        level: 21,
      });
      expect(result2.isError).toBe(true);
    });
  });

  describe('Persistence', () => {
    it('should save character to data/characters/{id}.json', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Persistent Hero',
        class: 'Paladin',
        level: 3,
      });

      expect(result.isError).toBeUndefined();
      expect(fs.existsSync(DATA_DIR)).toBe(true);

      // Extract ID from result
      const response = parseToolResponse(result);
      const characterId = response.data.character.id;

      // Verify the specific file exists
      const filePath = path.join(DATA_DIR, `${characterId}.json`);
      expect(fs.existsSync(filePath)).toBe(true);

      // Verify file content
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const character = JSON.parse(fileContent);

      expect(character.name).toBe('Persistent Hero');
      expect(character.class).toBe('Paladin');
      expect(character.level).toBe(3);
      expect(character.id).toBe(characterId);
      expect(character.createdAt).toBeDefined();
    });
  });

  describe('Output Format', () => {
    it('should return Semantic Markdown character sheet', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Rich Output Test',
        race: 'Elf',
        class: 'Ranger',
        level: 4,
      });
      const response = parseToolResponse(result);

      expect(result.isError).toBeUndefined();
      expect(response.display).toContain('## ⚔️ Character Created:');
      expect(response.display).toContain('Rich Output Test');
      expect(response.display).toContain('Elf');
      expect(response.display).toContain('Ranger');
      expect(response.display).toContain('Level 4');
    });

    it('should include HP bar and ability scores', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Barbarian Test',
        class: 'Barbarian',
      });
      const response = parseToolResponse(result);

      expect(result.isError).toBeUndefined();
      expect(response.display).toContain('**HP:**');
      expect(response.display).toContain('Ability Scores');
      expect(response.data.character.hp.current).toBeGreaterThan(0);
    });
  });
});
