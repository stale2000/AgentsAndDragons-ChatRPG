/**
 * roll_dice (Batch Mode) Tests - TDD
 * Red -> Green -> Refactor
 */

import { describe, it, expect } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent, parseToolResponse } from '../helpers.js';

describe('roll_dice (batch mode)', () => {
  describe('Basic Batch Rolling', () => {
    it('should roll multiple dice expressions', async () => {
      const result = await handleToolCall('roll_dice', {
        batch: [
          { expression: '1d20+5', label: 'Attack' },
          { expression: '2d6+3', label: 'Damage' }
        ]
      });

      const response = parseToolResponse(result);
      expect(result.isError).toBeUndefined();
      expect(response.data.success).toBe(true);
      expect(response.data.type).toBe('batch_roll');
      expect(response.data.results).toHaveLength(2);
      expect(response.display).toContain('Batch Roll');
      expect(response.display).toContain('Attack');
      expect(response.display).toContain('Damage');
      expect(response.display).toContain('**Grand Total:**');
    });

    it('should handle rolls without labels', async () => {
      const result = await handleToolCall('roll_dice', {
        batch: [
          { expression: '1d20' },
          { expression: '1d20' }
        ]
      });

      const response = parseToolResponse(result);
      expect(result.isError).toBeUndefined();
      expect(response.data.success).toBe(true);
      expect(response.data.type).toBe('batch_roll');
      expect(response.data.results).toHaveLength(2);
      expect(response.display).toContain('Roll 1');
      expect(response.display).toContain('Roll 2');
    });

    it('should include reason when provided', async () => {
      const result = await handleToolCall('roll_dice', {
        batch: [{ expression: '1d20+5' }],
        reason: 'Multiattack'
      });

      const response = parseToolResponse(result);
      expect(response.data.success).toBe(true);
      expect(response.display).toContain('Multiattack');
    });
  });

  describe('Advantage/Disadvantage in Batch', () => {
    it('should support advantage in batch rolls', async () => {
      const result = await handleToolCall('roll_dice', {
        batch: [
          { expression: '1d20+5', label: 'Attack 1', advantage: true },
          { expression: '1d20+5', label: 'Attack 2' }
        ]
      });

      const response = parseToolResponse(result);
      expect(result.isError).toBeUndefined();
      expect(response.data.success).toBe(true);
      expect(response.data.type).toBe('batch_roll');
      expect(response.data.results[0].expression).toBe('2d20kh1+5'); // First roll has advantage
      expect(response.data.results[1].expression).toBe('1d20+5'); // Second roll doesn't
    });

    it('should support disadvantage in batch rolls', async () => {
      const result = await handleToolCall('roll_dice', {
        batch: [
          { expression: '1d20', disadvantage: true }
        ]
      });

      const response = parseToolResponse(result);
      expect(result.isError).toBeUndefined();
      expect(response.data.success).toBe(true);
      expect(response.data.results[0].expression).toBe('2d20kl1');
    });
  });

  describe('Total Calculation', () => {
    it('should sum all roll results', async () => {
      const result = await handleToolCall('roll_dice', {
        batch: [
          { expression: '1d4' },
          { expression: '1d4' },
          { expression: '1d4' }
        ]
      });

      const response = parseToolResponse(result);
      expect(response.data.success).toBe(true);
      expect(response.data.type).toBe('batch_roll');
      const grandTotal = response.data.grandTotal;
      expect(grandTotal).toBeGreaterThanOrEqual(3); // 1+1+1
      expect(grandTotal).toBeLessThanOrEqual(12);   // 4+4+4
      
      // Verify grand total matches sum of results
      const calculatedTotal = response.data.results.reduce((sum: number, r: any) => sum + r.total, 0);
      expect(grandTotal).toBe(calculatedTotal);
    });
  });

  describe('Error Handling', () => {
    it('should return error for empty batch array', async () => {
      const result = await handleToolCall('roll_dice', { batch: [] });
      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('non-empty array');
    });

    it('should return error for missing batch parameter', async () => {
      const result = await handleToolCall('roll_dice', {});
      expect(result.isError).toBe(true);
    });

    it('should return error for too many rolls', async () => {
      const batch = Array.from({ length: 21 }, (_, i) => ({
        expression: '1d20',
        label: `Roll ${i + 1}`
      }));

      const result = await handleToolCall('roll_dice', { batch });
      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('Too many rolls');
    });

    it('should return error for both advantage and disadvantage', async () => {
      const result = await handleToolCall('roll_dice', {
        batch: [{
          expression: '1d20',
          advantage: true,
          disadvantage: true
        }]
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('Cannot have both advantage and disadvantage');
    });

    it('should return error for invalid dice expression', async () => {
      const result = await handleToolCall('roll_dice', {
        batch: [{ expression: 'invalid' }]
      });

      expect(result.isError).toBe(true);
    });
  });
});
