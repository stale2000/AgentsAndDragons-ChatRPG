/**
 * get_character Tests - TDD
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

describe('get_character', () => {
  // Helper function to create a test character and return its ID
  async function createTestCharacter(): Promise<string> {
    const result = await handleToolCall('create_character', {
      name: 'Test Retrieval Character',
      race: 'Halfling',
      class: 'Rogue',
      level: 5,
      background: 'Criminal',
      stats: { str: 10, dex: 18, con: 12, int: 14, wis: 10, cha: 14 },
      skillProficiencies: ['stealth', 'sleight_of_hand', 'deception'],
      saveProficiencies: ['dex', 'int'],
    });

    if (result.isError) {
      const errorText = getTextContent(result);
      throw new Error(`Failed to create test character: ${errorText}`);
    }

    let response: any;
    try {
      response = parseToolResponse(result);
    } catch (parseError) {
      // If JSON.parse fails, the text might be stringified - try to extract raw ID from display
      const text = getTextContent(result);
      // Try to find the ID anywhere in the text (fallback for parsing issues)
      const idMatch = text.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
      if (idMatch && idMatch[1]) {
        return idMatch[1];
      }
      throw new Error(`Failed to parse response: ${String(parseError)}`);
    }
    
    const characterId = response.data?.character?.id;
    if (!characterId || typeof characterId !== 'string') {
      throw new Error(`Failed to extract character ID. Response: ${JSON.stringify(response).slice(0, 200)}`);
    }

    return characterId;
  }

  // Clean up before and after all tests in this suite
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

  describe('Retrieval', () => {
    it('should retrieve an existing character by ID', async () => {
      const testCharacterId = await createTestCharacter();

      const result = await handleToolCall('get_character', {
        characterId: testCharacterId
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      expect(text).toContain('Test Retrieval Character');
      expect(text).toContain('Rogue');
      expect(text).toContain('Level 5');
    });

    it('should return full character data including stats', async () => {
      const testCharacterId = await createTestCharacter();

      const result = await handleToolCall('get_character', {
        characterId: testCharacterId
      });

      expect(result.isError).toBeUndefined();
      const response = parseToolResponse(result);

      // Check for ability scores in display
      expect(response.display).toContain('DEX');
      expect(response.display).toContain('18');

      // Check for race info in display
      expect(response.display).toContain('Halfling');
      // Background is in data, not display
      expect(response.data.character.race).toBe('Halfling');
    });

    it('should include calculated values (modifiers, proficiency)', async () => {
      const testCharacterId = await createTestCharacter();

      const result = await handleToolCall('get_character', {
        characterId: testCharacterId
      });

      expect(result.isError).toBeUndefined();
      const response = parseToolResponse(result);

      // Check for proficiency bonus in data (level 5 = +3)
      expect(response.data.character.proficiencyBonus).toBe(3);

      // Check for ability modifier formatting in display (DEX 18 = +4)
      expect(response.display).toContain('+4');
    });
  });

  describe('Error Handling', () => {
    it('should return error for non-existent character ID', async () => {
      const result = await handleToolCall('get_character', {
        characterId: 'non-existent-uuid-12345'
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('Error');
      expect(text.toLowerCase()).toContain('not found');
    });

    it('should return error for empty character ID', async () => {
      const result = await handleToolCall('get_character', {
        characterId: ''
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('Error');
    });
  });

  describe('Output Format', () => {
    it('should return ToolResponse JSON with display and data fields', async () => {
      const testCharacterId = await createTestCharacter();

      const result = await handleToolCall('get_character', {
        characterId: testCharacterId
      });

      expect(result.isError).toBeUndefined();
      const response = parseToolResponse(result);

      // Should have display and data fields
      expect(response.display).toBeDefined();
      expect(response.data).toBeDefined();
      expect(response.data.success).toBe(true);
      expect(response.data.type).toBe('character');
      expect(response.data.character).toBeDefined();
    });

    it('should include Semantic Markdown header in display', async () => {
      const testCharacterId = await createTestCharacter();

      const result = await handleToolCall('get_character', {
        characterId: testCharacterId
      });

      expect(result.isError).toBeUndefined();
      const response = parseToolResponse(result);

      // Should have markdown header format
      expect(response.display).toContain('## 📜');
      expect(response.display).toContain('Test Retrieval Character');
      expect(response.display).toContain('Level 5');
    });

    it('should include Combat Stats table in markdown', async () => {
      const testCharacterId = await createTestCharacter();

      const result = await handleToolCall('get_character', {
        characterId: testCharacterId
      });

      expect(result.isError).toBeUndefined();
      const response = parseToolResponse(result);

      // Should have combat stats section
      expect(response.display).toContain('### Combat Stats');
      expect(response.display).toContain('HP');
      expect(response.display).toContain('AC');
    });

    it('should include all ability scores in Ability Scores table', async () => {
      const testCharacterId = await createTestCharacter();

      const result = await handleToolCall('get_character', {
        characterId: testCharacterId
      });

      expect(result.isError).toBeUndefined();
      const response = parseToolResponse(result);

      // Check all six ability scores are present in display
      expect(response.display).toContain('STR');
      expect(response.display).toContain('DEX');
      expect(response.display).toContain('CON');
      expect(response.display).toContain('INT');
      expect(response.display).toContain('WIS');
      expect(response.display).toContain('CHA');

      // Also check data structure
      const { stats } = response.data.character;
      expect(stats.str).toBe(10);
      expect(stats.dex).toBe(18);
      expect(stats.con).toBe(12);
      expect(stats.int).toBe(14);
      expect(stats.wis).toBe(10);
      expect(stats.cha).toBe(14);
    });

    it('should include HP bar visual in display', async () => {
      const testCharacterId = await createTestCharacter();

      const result = await handleToolCall('get_character', {
        characterId: testCharacterId
      });

      expect(result.isError).toBeUndefined();
      const response = parseToolResponse(result);

      // Should have HP bar format with blocks
      expect(response.display).toMatch(/[█▓░]/);
    });

    it('should include character ID in footer', async () => {
      const testCharacterId = await createTestCharacter();

      const result = await handleToolCall('get_character', {
        characterId: testCharacterId
      });

      expect(result.isError).toBeUndefined();
      const response = parseToolResponse(result);

      // Should have ID footer
      expect(response.display).toContain('*ID:');
      expect(response.display).toContain(testCharacterId);
    });
  });
});
