/**
 * measure_distance Tests - TDD
 * Red -> Green -> Refactor
 */

import { describe, it, expect } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent, parseToolResponse } from '../helpers.js';

describe('measure_distance', () => {
  describe('Grid 5e Mode (Default)', () => {
    it('should calculate horizontal distance (5ft per square)', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 3, y: 0, z: 0 },
      });
      expect(result.isError).toBeUndefined();
      const response = parseToolResponse(result);
      expect(response.data.distanceFeet).toBe(15);
      expect(response.data.distanceSquares).toBe(3);
    });

    it('should calculate vertical distance', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 0, y: 4, z: 0 },
      });
      const response = parseToolResponse(result);
      expect(response.data.distanceFeet).toBe(20);
      expect(response.data.distanceSquares).toBe(4);
    });

    it('should calculate diagonal as 5ft (simplified)', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 2, y: 2, z: 0 },
        mode: 'grid_5e',
      });
      const response = parseToolResponse(result);
      // Grid 5e: max(|Δx|, |Δy|) = max(2, 2) = 2 squares = 10 feet
      expect(response.data.distanceFeet).toBe(10);
      expect(response.data.distanceSquares).toBe(2);
    });

    it('should handle multi-square diagonal paths', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 5, y: 3, z: 0 },
        mode: 'grid_5e',
      });
      const response = parseToolResponse(result);
      // Grid 5e: max(5, 3) = 5 squares = 25 feet
      expect(response.data.distanceFeet).toBe(25);
      expect(response.data.distanceSquares).toBe(5);
    });
  });

  describe('Euclidean Mode', () => {
    it('should calculate true geometric distance', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 3, y: 0, z: 0 },
        mode: 'euclidean',
      });
      const response = parseToolResponse(result);
      // √(3²) × 5 = 15 feet
      expect(response.data.distanceFeet).toBe(15);
      expect(response.data.distanceSquares).toBe(3);
    });

    it('should handle 3-4-5 triangle correctly', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 3, y: 4, z: 0 },
        mode: 'euclidean',
      });
      const response = parseToolResponse(result);
      // √(3² + 4²) × 5 = √25 × 5 = 5 × 5 = 25 feet
      expect(response.data.distanceFeet).toBe(25);
      expect(response.data.distanceSquares).toBe(5);
    });
  });

  describe('Grid Alt Mode', () => {
    it('should alternate diagonal cost 5/10/5/10', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 4, y: 4, z: 0 },
        mode: 'grid_alt',
      });
      const response = parseToolResponse(result);
      // 4 diagonals: 5+10+5+10 = 30 feet
      expect(response.data.distanceFeet).toBe(30);
      expect(response.data.distanceSquares).toBe(4);
    });

    it('should calculate mixed paths correctly', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 5, y: 3, z: 0 },
        mode: 'grid_alt',
      });
      const response = parseToolResponse(result);
      // 3 diagonals (5+10+5=20) + 2 straight (2×5=10) = 30 feet
      expect(response.data.distanceFeet).toBe(30);
      expect(response.data.distanceSquares).toBe(5);
    });
  });

  describe('Elevation', () => {
    it('should include Z axis in calculations', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 3, y: 4, z: 12 },
        mode: 'euclidean',
        includeElevation: true,
      });
      const response = parseToolResponse(result);
      // √(3² + 4² + 12²) × 5 = √(9+16+144) × 5 = √169 × 5 = 13 × 5 = 65 feet
      expect(response.data.distanceFeet).toBe(65);
      expect(response.data.distanceSquares).toBe(13);
    });

    it('should ignore elevation when includeElevation is false', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 3, y: 4, z: 12 },
        mode: 'euclidean',
        includeElevation: false,
      });
      const response = parseToolResponse(result);
      // √(3² + 4²) × 5 = 25 feet (ignoring z)
      expect(response.data.distanceFeet).toBe(25);
      expect(response.data.distanceSquares).toBe(5);
    });

    it('should handle flying creature distances', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 0, y: 0, z: 6 },
        mode: 'grid_5e',
      });
      const response = parseToolResponse(result);
      // 6 squares vertical = 30 feet
      expect(response.data.distanceFeet).toBe(30);
      expect(response.data.distanceSquares).toBe(6);
    });
  });

  describe('Semantic Markdown Output', () => {
    it('should return valid ToolResponse JSON', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 2, y: 2, z: 0 },
      });
      const response = parseToolResponse(result);
      expect(response).toHaveProperty('display');
      expect(response).toHaveProperty('data');
      expect(response.data.type).toBe('distance');
    });

    it('should include distance in display', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 2, y: 2, z: 0 },
      });
      const response = parseToolResponse(result);
      expect(response.display).toMatch(/Distance: \d+ft/);
    });

    it('should include structured data', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 3, y: 4, z: 0 },
      });
      const response = parseToolResponse(result);
      expect(response.data.distanceFeet).toBeDefined();
      expect(response.data.distanceSquares).toBeDefined();
      expect(response.data.mode).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing position coordinates', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0 },
        to: { x: 3, y: 4 },
      });
      // Should default z to 0 and still work
      expect(result.isError).toBeUndefined();
      const response = parseToolResponse(result);
      expect(response.data.distanceFeet).toBeDefined();
    });
  });
});
