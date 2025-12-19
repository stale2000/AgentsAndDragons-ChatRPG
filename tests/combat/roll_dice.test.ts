/**
 * roll_dice Tests - TDD
 * Red -> Green -> Refactor
 */

import { describe, it, expect } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent, parseToolResponse } from '../helpers.js';

describe('roll_dice', () => {
  describe('Basic Rolls', () => {
    it('should roll a simple d20', async () => {
      const result = await handleToolCall('roll_dice', { expression: '1d20' });
      const response = parseToolResponse(result);
      expect(result.isError).toBeUndefined();
      expect(response.data.success).toBe(true);
      expect(response.data.type).toBe('roll');
      expect(response.data.expression).toBe('1d20');
      expect(response.data.total).toBeGreaterThanOrEqual(1);
      expect(response.data.total).toBeLessThanOrEqual(20);
      expect(response.display).toContain('🎲');
    });

    it('should roll 2d6+4', async () => {
      const result = await handleToolCall('roll_dice', { expression: '2d6+4' });
      const response = parseToolResponse(result);
      expect(response.data.success).toBe(true);
      expect(response.data.type).toBe('roll');
      expect(response.data.expression).toBe('2d6+4');
      expect(response.data.total).toBeGreaterThanOrEqual(6);  // 2+4
      expect(response.data.total).toBeLessThanOrEqual(16);    // 12+4
      expect(response.display).toContain('2d6+4');
      expect(response.display).toContain('**Total:**');
    });

    it('should handle negative modifiers', async () => {
      const result = await handleToolCall('roll_dice', { expression: '1d20-2' });
      const response = parseToolResponse(result);
      expect(response.data.success).toBe(true);
      expect(response.data.expression).toBe('1d20-2');
    });
  });

  describe('Keep/Drop Modifiers', () => {
    it('should keep highest with kh modifier (4d6kh3)', async () => {
      const result = await handleToolCall('roll_dice', { expression: '4d6kh3' });
      const response = parseToolResponse(result);
      expect(response.data.success).toBe(true);
      expect(response.data.type).toBe('roll');
      expect(response.data.expression).toBe('4d6kh3');
      expect(response.data.kept.length).toBe(3);
      expect(response.data.rolls.length).toBe(4);
      expect(response.data.total).toBeGreaterThanOrEqual(3);   // 1+1+1
      expect(response.data.total).toBeLessThanOrEqual(18);     // 6+6+6
      expect(response.display).toContain('**Kept:**');
    });

    it('should keep lowest with kl modifier (disadvantage)', async () => {
      const result = await handleToolCall('roll_dice', { expression: '2d20kl1' });
      const response = parseToolResponse(result);
      expect(response.data.success).toBe(true);
      expect(response.data.expression).toBe('2d20kl1');
      expect(response.data.kept.length).toBe(1);
      expect(response.data.rolls.length).toBe(2);
      expect(response.display).toContain('**Kept:**');
    });
  });

  describe('Reason/Context', () => {
    it('should include reason in output when provided', async () => {
      const result = await handleToolCall('roll_dice', { 
        expression: '1d20+5', 
        reason: 'Attack roll' 
      });
      const response = parseToolResponse(result);
      expect(response.data.success).toBe(true);
      expect(response.display).toContain('Attack roll');
    });
  });

  describe('Advantage/Disadvantage', () => {
    it('should roll with advantage (2d20kh1)', async () => {
      const result = await handleToolCall('roll_dice', {
        expression: '1d20',
        advantage: true
      });
      const response = parseToolResponse(result);
      expect(result.isError).toBeUndefined();
      expect(response.data.success).toBe(true);
      expect(response.data.expression).toBe('2d20kh1');
      expect(response.data.rolls.length).toBe(2);
      expect(response.data.kept.length).toBe(1);
      expect(response.data.total).toBeGreaterThanOrEqual(1);
      expect(response.data.total).toBeLessThanOrEqual(20);
      expect(response.display).toContain('**Kept:**');
    });

    it('should roll with disadvantage (2d20kl1)', async () => {
      const result = await handleToolCall('roll_dice', {
        expression: '1d20',
        disadvantage: true
      });
      const response = parseToolResponse(result);
      expect(result.isError).toBeUndefined();
      expect(response.data.success).toBe(true);
      expect(response.data.expression).toBe('2d20kl1');
      expect(response.data.rolls.length).toBe(2);
      expect(response.data.kept.length).toBe(1);
      expect(response.data.total).toBeGreaterThanOrEqual(1);
      expect(response.data.total).toBeLessThanOrEqual(20);
      expect(response.display).toContain('**Kept:**');
    });

    it('should roll with advantage and modifier (1d20+5)', async () => {
      const result = await handleToolCall('roll_dice', {
        expression: '1d20+5',
        advantage: true
      });
      const response = parseToolResponse(result);
      expect(result.isError).toBeUndefined();
      expect(response.data.success).toBe(true);
      expect(response.data.expression).toBe('2d20kh1+5');
      expect(response.data.modifier).toBe(5);
      const total = parseInt(response.data.total);
      expect(total).toBeGreaterThanOrEqual(6);  // 1+5
      expect(total).toBeLessThanOrEqual(25);    // 20+5
    });

    it('should return error when both advantage and disadvantage are set', async () => {
      const result = await handleToolCall('roll_dice', {
        expression: '1d20',
        advantage: true,
        disadvantage: true
      });
      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('Cannot have both advantage and disadvantage');
    });

    it('should return error when advantage used with non-d20 roll', async () => {
      const result = await handleToolCall('roll_dice', {
        expression: '2d6',
        advantage: true
      });
      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('only works with single d20 rolls');
    });
  });

  describe('Critical Hits/Misses', () => {
    it('should detect critical hit (natural 20)', async () => {
      // We can't guarantee a natural 20, but we can test the detection logic
      // by looking at responses until we get one, or by mocking
      // For now, we'll test the structure is correct
      const result = await handleToolCall('roll_dice', { expression: '1d20' });
      const response = parseToolResponse(result);
      if (response.data.rolls[0] === 20) {
        expect(response.data.isCritical).toBe(true);
        expect(response.display).toContain('💥 CRITICAL HIT!');
      } else {
        expect(response.data.isCritical).toBe(false);
      }
    });

    it('should detect critical miss (natural 1)', async () => {
      // Same as above - check the structure
      const result = await handleToolCall('roll_dice', { expression: '1d20' });
      const response = parseToolResponse(result);
      if (response.data.rolls[0] === 1) {
        expect(response.data.isCriticalMiss).toBe(true);
        expect(response.display).toContain('💀 Critical Miss');
      } else {
        expect(response.data.isCriticalMiss).toBe(false);
      }
    });
  });

  describe('Error Handling', () => {
    it('should return error for invalid expression', async () => {
      const result = await handleToolCall('roll_dice', { expression: 'invalid' });
      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('Error');
    });

    it('should return error for missing expression', async () => {
      const result = await handleToolCall('roll_dice', {});
      expect(result.isError).toBe(true);
    });
  });
});
