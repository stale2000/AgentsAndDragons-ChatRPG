/**
 * Shared constants for grid-based map rendering and pathfinding
 */

// Grid configuration constants
export const GRID_SIZE = 500;
export const CELL_PIXELS = 10;
export const COARSE_STEP = 10; // fine cells per coarse cell
export const CELL_CSS_PX = (16 * 50) / GRID_SIZE; // keep overall visual width similar to previous (50 cols * 16px)

// Movement constants
export const FEET_PER_SQUARE = 5; // D&D 5e: 1 square = 5 feet
export const DEFAULT_MOVEMENT_SPEED = 30; // feet per turn

// Grid coordinate conversion helpers
export function pixelsToFineCells(pixels: number): number {
  return Math.floor(pixels / CELL_PIXELS);
}

export function fineCellsToCoarseCells(fineCells: number): number {
  return Math.floor(fineCells / COARSE_STEP);
}

export function pixelsToCoarseCells(pixels: number): number {
  return fineCellsToCoarseCells(pixelsToFineCells(pixels));
}

export function coarseCellsToPixels(coarseCells: number): number {
  return coarseCells * COARSE_STEP * CELL_PIXELS;
}

export function coarseCellsToFineCells(coarseCells: number): number {
  return coarseCells * COARSE_STEP;
}

// Movement calculation helpers
export function movementSpeedToSquares(movementSpeed: number): number {
  return Math.max(1, Math.floor(movementSpeed / FEET_PER_SQUARE));
}

