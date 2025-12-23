#!/usr/bin/env node

/**
 * Grid Detection Script
 * 
 * Detects a grid overlay on an image and draws dark lines over it.
 * Usage: tsx scripts/griddetection.ts <input-image> [output-image]
 */

import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

interface GridInfo {
  cellSize: number; // Average cell size for reference
  offsetX: number;
  offsetY: number;
  horizontalLines: number[]; // Exact positions of each horizontal grid line
  verticalLines: number[]; // Exact positions of each vertical grid line
  debug?: {
    horizontalSpacings: number[];
    verticalSpacings: number[];
  };
}

/**
 * Apply edge detection using Sobel operator
 */
function applyEdgeDetection(
  pixels: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const edgeData = new Uint8Array(width * height * 4);
  
  // Sobel kernels
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const gray = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
          const kernelIdx = (ky + 1) * 3 + (kx + 1);
          gx += gray * sobelX[kernelIdx];
          gy += gray * sobelY[kernelIdx];
        }
      }
      
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      const edgeValue = Math.min(255, magnitude);
      
      const outIdx = (y * width + x) * 4;
      edgeData[outIdx] = edgeValue;
      edgeData[outIdx + 1] = edgeValue;
      edgeData[outIdx + 2] = edgeValue;
      edgeData[outIdx + 3] = 255;
    }
  }
  
  return edgeData;
}

/**
 * Find dominant spacing using autocorrelation
 */
function findDominantSpacing(projection: number[]): number {
  const n = projection.length;
  const autocorr: number[] = [];
  
  // Calculate autocorrelation for different lags
  for (let lag = 10; lag < Math.min(200, n / 2); lag++) {
    let sum = 0;
    let count = 0;
    
    for (let i = 0; i < n - lag; i++) {
      sum += projection[i] * projection[i + lag];
      count++;
    }
    
    autocorr.push(sum / count);
  }
  
  // Find peaks in autocorrelation (these indicate periodic spacing)
  let maxPeak = 0;
  let bestSpacing = 50;
  
  for (let i = 1; i < autocorr.length - 1; i++) {
    if (
      autocorr[i] > autocorr[i - 1] &&
      autocorr[i] > autocorr[i + 1] &&
      autocorr[i] > maxPeak * 1.1 // Must be significantly higher
    ) {
      maxPeak = autocorr[i];
      bestSpacing = i + 10; // Adjust for offset
    }
  }
  
  return bestSpacing;
}

/**
 * Find sub-pixel peak position using quadratic interpolation
 */
function refinePeakPosition(projection: number[], peakIndex: number): number {
  if (peakIndex <= 0 || peakIndex >= projection.length - 1) {
    return peakIndex;
  }
  
  const y0 = projection[peakIndex - 1];
  const y1 = projection[peakIndex];
  const y2 = projection[peakIndex + 1];
  
  // Quadratic interpolation to find sub-pixel peak
  const a = (y0 + y2) / 2 - y1;
  const b = (y2 - y0) / 2;
  
  if (Math.abs(a) < 0.001) {
    // If a is too small, peak is at center
    return peakIndex;
  }
  
  const offset = -b / (2 * a);
  return peakIndex + offset;
}

/**
 * Calculate mean spacing with higher precision
 */
function calculateMeanSpacing(spacings: number[]): number {
  if (spacings.length === 0) return 0;
  return spacings.reduce((a, b) => a + b, 0) / spacings.length;
}

/**
 * Find the mode (most common value) with tolerance for rounding
 * Returns mean of values within the mode bucket for better precision
 */
function findMode(values: number[], tolerance: number = 1): number {
  if (values.length === 0) return 0;
  
  // Round values to nearest tolerance
  const rounded = values.map(v => Math.round(v / tolerance) * tolerance);
  
  // Count frequencies
  const freq: Map<number, number[]> = new Map();
  for (let i = 0; i < rounded.length; i++) {
    const roundedVal = rounded[i];
    const originalVal = values[i];
    if (!freq.has(roundedVal)) {
      freq.set(roundedVal, []);
    }
    freq.get(roundedVal)!.push(originalVal);
  }
  
  // Find most common bucket and return mean of values in that bucket
  let maxFreq = 0;
  let modeBucket: number[] = [];
  for (const [val, originalVals] of freq.entries()) {
    if (originalVals.length > maxFreq) {
      maxFreq = originalVals.length;
      modeBucket = originalVals;
    }
  }
  
  // Return mean of values in the mode bucket for better precision
  return modeBucket.reduce((a, b) => a + b, 0) / modeBucket.length;
}

/**
 * Detect grid lines in a specific region
 */
function detectGridInRegion(
  edgeData: Uint8Array,
  width: number,
  height: number,
  regionX: number,
  regionY: number,
  regionW: number,
  regionH: number
): { horizontalSpacing: number; verticalSpacing: number; horizontalPeaks: number[]; verticalPeaks: number[] } {
  // Calculate projections for this region
  const horizontalProjection = new Array(regionH).fill(0);
  const verticalProjection = new Array(regionW).fill(0);
  
  for (let y = 0; y < regionH; y++) {
    for (let x = 0; x < regionW; x++) {
      const imgX = regionX + x;
      const imgY = regionY + y;
      if (imgX >= 0 && imgX < width && imgY >= 0 && imgY < height) {
        const idx = (imgY * width + imgX) * 4;
        horizontalProjection[y] += edgeData[idx];
        verticalProjection[x] += edgeData[idx];
      }
    }
  }
  
  // Normalize
  const maxH = Math.max(...horizontalProjection, 1);
  const maxV = Math.max(...verticalProjection, 1);
  const normalizedH = horizontalProjection.map(v => v / maxH);
  const normalizedV = verticalProjection.map(v => v / maxV);
  
  // Find peaks
  const meanH = normalizedH.reduce((a, b) => a + b, 0) / regionH;
  const meanV = normalizedV.reduce((a, b) => a + b, 0) / regionW;
  const peakThresholdH = Math.max(0.2, meanH * 1.5);
  const peakThresholdV = Math.max(0.2, meanV * 1.5);
  
  const horizontalPeaks: number[] = [];
  const verticalPeaks: number[] = [];
  
  for (let i = 2; i < regionH - 2; i++) {
    if (
      normalizedH[i] > peakThresholdH &&
      normalizedH[i] > normalizedH[i - 1] &&
      normalizedH[i] > normalizedH[i + 1] &&
      normalizedH[i] > normalizedH[i - 2] &&
      normalizedH[i] > normalizedH[i + 2]
    ) {
      // Use sub-pixel precision for peak position
      const refinedPos = refinePeakPosition(normalizedH, i);
      horizontalPeaks.push(regionY + refinedPos);
    }
  }
  
  for (let i = 2; i < regionW - 2; i++) {
    if (
      normalizedV[i] > peakThresholdV &&
      normalizedV[i] > normalizedV[i - 1] &&
      normalizedV[i] > normalizedV[i + 1] &&
      normalizedV[i] > normalizedV[i - 2] &&
      normalizedV[i] > normalizedV[i + 2]
    ) {
      // Use sub-pixel precision for peak position
      const refinedPos = refinePeakPosition(normalizedV, i);
      verticalPeaks.push(regionX + refinedPos);
    }
  }
  
  // Calculate spacings
  const horizontalSpacings: number[] = [];
  const verticalSpacings: number[] = [];
  
  for (let i = 1; i < horizontalPeaks.length; i++) {
    horizontalSpacings.push(horizontalPeaks[i] - horizontalPeaks[i - 1]);
  }
  
  for (let i = 1; i < verticalPeaks.length; i++) {
    verticalSpacings.push(verticalPeaks[i] - verticalPeaks[i - 1]);
  }
  
  // Filter out outliers (more than 30% different from median)
  const filterSpacings = (spacings: number[]): number[] => {
    if (spacings.length === 0) return [];
    const sorted = [...spacings].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    // Filter to within 30% of median, and also reject values that are clearly too small (< 60% of median)
    return spacings.filter(s => {
      const ratio = s / median;
      return ratio >= 0.6 && ratio <= 1.4;
    });
  };
  
  const filteredH = filterSpacings(horizontalSpacings);
  const filteredV = filterSpacings(verticalSpacings);
  
  // Use mean for better precision if we have enough samples, otherwise use mode
  const horizontalSpacing = filteredH.length > 2 
    ? calculateMeanSpacing(filteredH) 
    : (filteredH.length > 0 ? findMode(filteredH, 0.1) : 0);
  const verticalSpacing = filteredV.length > 2
    ? calculateMeanSpacing(filteredV)
    : (filteredV.length > 0 ? findMode(filteredV, 0.1) : 0);
  
  return {
    horizontalSpacing,
    verticalSpacing,
    horizontalPeaks,
    verticalPeaks,
  };
}

/**
 * Detect grid lines using projection histograms with edge detection
 * Samples multiple regions for more robust detection
 */
function detectGridLines(
  imageData: Buffer,
  width: number,
  height: number,
  threshold: number = 0.25
): GridInfo {
  const pixels = new Uint8Array(imageData);
  
  // Apply edge detection to enhance grid lines
  const edgeData = applyEdgeDetection(pixels, width, height);
  
  // Sample multiple regions across the image
  const regionSize = Math.min(width, height) * 0.3; // 30% of image dimension
  
  const horizontalSpacings: number[] = [];
  const verticalSpacings: number[] = [];
  const allHorizontalPeaks: number[] = [];
  const allVerticalPeaks: number[] = [];
  
  const stepX = (width - regionSize) / 2;
  const stepY = (height - regionSize) / 2;
  
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const regionX = Math.floor(sx * stepX);
      const regionY = Math.floor(sy * stepY);
      const regionW = Math.floor(regionSize);
      const regionH = Math.floor(regionSize);
      
      const result = detectGridInRegion(
        edgeData,
        width,
        height,
        regionX,
        regionY,
        regionW,
        regionH
      );
      
      if (result.horizontalSpacing > 0) {
        horizontalSpacings.push(result.horizontalSpacing);
      }
      if (result.verticalSpacing > 0) {
        verticalSpacings.push(result.verticalSpacing);
      }
      
      allHorizontalPeaks.push(...result.horizontalPeaks);
      allVerticalPeaks.push(...result.verticalPeaks);
    }
  }
  
  // Also analyze full image for offset detection
  const horizontalProjection = new Array(height).fill(0);
  const verticalProjection = new Array(width).fill(0);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      horizontalProjection[y] += edgeData[idx];
      verticalProjection[x] += edgeData[idx];
    }
  }
  
  // Normalize full image projections
  const maxH = Math.max(...horizontalProjection, 1);
  const maxV = Math.max(...verticalProjection, 1);
  const normalizedH = horizontalProjection.map(v => v / maxH);
  const normalizedV = verticalProjection.map(v => v / maxV);
  
  // Find peaks in full image - use higher threshold and better peak detection
  const meanH = normalizedH.reduce((a, b) => a + b, 0) / height;
  const meanV = normalizedV.reduce((a, b) => a + b, 0) / width;
  const stdH = Math.sqrt(normalizedH.reduce((sum, v) => sum + Math.pow(v - meanH, 2), 0) / height);
  const stdV = Math.sqrt(normalizedV.reduce((sum, v) => sum + Math.pow(v - meanV, 2), 0) / width);
  
  // Use mean + 2*std for better threshold
  const peakThresholdH = Math.max(threshold, meanH + 2 * stdH);
  const peakThresholdV = Math.max(threshold, meanV + 2 * stdV);
  
  const fullHorizontalPeaks: number[] = [];
  const fullVerticalPeaks: number[] = [];
  
  // Detect peaks with a wider window to avoid noise
  for (let i = 3; i < height - 3; i++) {
    const val = normalizedH[i];
    if (
      val > peakThresholdH &&
      val > normalizedH[i - 1] &&
      val > normalizedH[i + 1] &&
      val > normalizedH[i - 2] &&
      val > normalizedH[i + 2] &&
      val > normalizedH[i - 3] &&
      val > normalizedH[i + 3]
    ) {
      // Use sub-pixel precision for peak position
      const refinedPos = refinePeakPosition(normalizedH, i);
      fullHorizontalPeaks.push(refinedPos);
    }
  }
  
  for (let i = 3; i < width - 3; i++) {
    const val = normalizedV[i];
    if (
      val > peakThresholdV &&
      val > normalizedV[i - 1] &&
      val > normalizedV[i + 1] &&
      val > normalizedV[i - 2] &&
      val > normalizedV[i + 2] &&
      val > normalizedV[i - 3] &&
      val > normalizedV[i + 3]
    ) {
      // Use sub-pixel precision for peak position
      const refinedPos = refinePeakPosition(normalizedV, i);
      fullVerticalPeaks.push(refinedPos);
    }
  }
  
  // Filter outliers from all collected spacings before finding mode
  const filterAllSpacings = (spacings: number[]): number[] => {
    if (spacings.length === 0) return [];
    const sorted = [...spacings].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return spacings.filter(s => {
      const ratio = s / median;
      return ratio >= 0.6 && ratio <= 1.4;
    });
  };
  
  // Sort peaks and remove duplicates/near-duplicates
  const dedupePeaks = (peaks: number[], minDistance: number = 0.5): number[] => {
    if (peaks.length === 0) return [];
    const sorted = [...peaks].sort((a, b) => a - b);
    const deduped = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - deduped[deduped.length - 1] >= minDistance) {
        deduped.push(sorted[i]);
      }
    }
    return deduped;
  };
  
  // Just dedupe - don't filter by spacing, accept all detected lines
  // Each line is found individually, so we keep all of them
  const dedupedHorizontalPeaks = dedupePeaks(fullHorizontalPeaks, 0.5);
  const dedupedVerticalPeaks = dedupePeaks(fullVerticalPeaks, 0.5);
  
  // Sort but don't filter - use all detected lines
  const sortedHorizontalPeaks = dedupedHorizontalPeaks.sort((a, b) => a - b);
  const sortedVerticalPeaks = dedupedVerticalPeaks.sort((a, b) => a - b);
  
  // Count grid cells: if we have N grid lines, we typically have N-1 cells
  // But we need to account for the grid potentially extending beyond the image
  const numHorizontalCells = sortedHorizontalPeaks.length - 1;
  const numVerticalCells = sortedVerticalPeaks.length - 1;
  
  // Calculate cell size based on image dimensions and number of cells
  // This ensures the grid fits perfectly across the image
  let cellSizeH = 0;
  let cellSizeV = 0;
  let offsetY = 0;
  let offsetX = 0;
  
  if (sortedHorizontalPeaks.length >= 2) {
    // Calculate the span covered by detected grid lines
    const firstPeak = sortedHorizontalPeaks[0];
    const lastPeak = sortedHorizontalPeaks[sortedHorizontalPeaks.length - 1];
    const span = lastPeak - firstPeak;
    
    // Number of cells between the first and last detected lines
    const cellsInSpan = sortedHorizontalPeaks.length - 1;
    const estimatedCellSize = span / cellsInSpan;
    
    // The offset is the first peak position
    offsetY = firstPeak;
    
    // Calculate how many full cells fit from the first grid line to the end of the image
    // Round to nearest integer to get the actual number of cells
    const remainingHeight = height - offsetY;
    const numCellsToEnd = Math.round(remainingHeight / estimatedCellSize);
    
    // Refine cell size to fit exactly: (height - offset) / numCells
    if (numCellsToEnd > 0) {
      cellSizeH = remainingHeight / numCellsToEnd;
    } else {
      cellSizeH = estimatedCellSize;
    }
  }
  
  if (sortedVerticalPeaks.length >= 2) {
    const firstPeak = sortedVerticalPeaks[0];
    const lastPeak = sortedVerticalPeaks[sortedVerticalPeaks.length - 1];
    const span = lastPeak - firstPeak;
    
    const cellsInSpan = sortedVerticalPeaks.length - 1;
    const estimatedCellSize = span / cellsInSpan;
    
    offsetX = firstPeak;
    
    const remainingWidth = width - offsetX;
    const numCellsToEnd = Math.round(remainingWidth / estimatedCellSize);
    
    if (numCellsToEnd > 0) {
      cellSizeV = remainingWidth / numCellsToEnd;
    } else {
      cellSizeV = estimatedCellSize;
    }
  }
  
  // Use the average of both or fallback to spacing-based calculation
  // Ensure consistent cell size for both directions
  let cellSize = 0;
  if (cellSizeH > 0 && cellSizeV > 0) {
    // Use average cell size for consistency
    cellSize = (cellSizeH + cellSizeV) / 2;
    
    // Recalculate offsets and cell counts using the unified cell size
    // This ensures the grid fits perfectly with the same cell size
    if (sortedHorizontalPeaks.length >= 2) {
      const remainingHeight = height - offsetY;
      const numCellsH = Math.round(remainingHeight / cellSize);
      if (numCellsH > 0) {
        // Adjust offset slightly to ensure perfect fit
        const totalHeightForCells = numCellsH * cellSize;
        offsetY = height - totalHeightForCells;
      }
    }
    
    if (sortedVerticalPeaks.length >= 2) {
      const remainingWidth = width - offsetX;
      const numCellsV = Math.round(remainingWidth / cellSize);
      if (numCellsV > 0) {
        const totalWidthForCells = numCellsV * cellSize;
        offsetX = width - totalWidthForCells;
      }
    }
  } else if (cellSizeH > 0) {
    cellSize = cellSizeH;
  } else if (cellSizeV > 0) {
    cellSize = cellSizeV;
  } else {
    // Fallback to spacing-based detection
    const filteredHorizontalSpacings = filterAllSpacings(horizontalSpacings);
    const filteredVerticalSpacings = filterAllSpacings(verticalSpacings);
    
    const fullHSpacings = fullHorizontalPeaks.length > 1
      ? Array.from({ length: fullHorizontalPeaks.length - 1 }, (_, i) => 
          fullHorizontalPeaks[i + 1] - fullHorizontalPeaks[i]
        )
      : [];
    const fullVSpacings = fullVerticalPeaks.length > 1
      ? Array.from({ length: fullVerticalPeaks.length - 1 }, (_, i) =>
          fullVerticalPeaks[i + 1] - fullVerticalPeaks[i]
        )
      : [];
    
    const filteredFullH = filterAllSpacings(fullHSpacings);
    const filteredFullV = filterAllSpacings(fullVSpacings);
    
    const finalHorizontalSpacing = filteredHorizontalSpacings.length > 2
      ? calculateMeanSpacing(filteredHorizontalSpacings)
      : (filteredHorizontalSpacings.length > 0
          ? findMode(filteredHorizontalSpacings, 0.1)
          : (filteredFullH.length > 2
              ? calculateMeanSpacing(filteredFullH)
              : (filteredFullH.length > 0
                  ? findMode(filteredFullH, 0.1)
                  : 50)));
    
    const finalVerticalSpacing = filteredVerticalSpacings.length > 2
      ? calculateMeanSpacing(filteredVerticalSpacings)
      : (filteredVerticalSpacings.length > 0
          ? findMode(filteredVerticalSpacings, 0.1)
          : (filteredFullV.length > 2
              ? calculateMeanSpacing(filteredFullV)
              : (filteredFullV.length > 0
                  ? findMode(filteredFullV, 0.1)
                  : 50)));
    
    cellSize = (finalHorizontalSpacing + finalVerticalSpacing) / 2 || 50;
    offsetX = sortedVerticalPeaks.length > 0 ? sortedVerticalPeaks[0] : 0;
    offsetY = sortedHorizontalPeaks.length > 0 ? sortedHorizontalPeaks[0] : 0;
  }
  
  // Calculate spacings between detected lines
  const lineHorizontalSpacings = Array.from({ length: sortedHorizontalPeaks.length - 1 }, (_, i) => 
    sortedHorizontalPeaks[i + 1] - sortedHorizontalPeaks[i]
  );
  const lineVerticalSpacings = Array.from({ length: sortedVerticalPeaks.length - 1 }, (_, i) =>
    sortedVerticalPeaks[i + 1] - sortedVerticalPeaks[i]
  );
  
  // Filter outliers to find typical spacing
  const filterLineSpacings = (spacings: number[]): number[] => {
    if (spacings.length === 0) return [];
    const sorted = [...spacings].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    // Keep spacings within 60% to 200% of median
    return spacings.filter(s => {
      const ratio = s / median;
      return ratio >= 0.6 && ratio <= 2.0;
    });
  };
  
  const filteredHSpacings = filterLineSpacings(lineHorizontalSpacings);
  const filteredVSpacings = filterLineSpacings(lineVerticalSpacings);
  
  // Find mode (most common) spacing
  const findModeSpacing = (spacings: number[]): number => {
    if (spacings.length === 0) return cellSize;
    const rounded = spacings.map(s => Math.round(s * 2) / 2); // Round to 0.5px
    const freq: Map<number, number> = new Map();
    for (const val of rounded) {
      freq.set(val, (freq.get(val) || 0) + 1);
    }
    let maxFreq = 0;
    let mode = rounded[0];
    for (const [val, count] of freq.entries()) {
      if (count > maxFreq) {
        maxFreq = count;
        mode = val;
      }
    }
    return mode;
  };
  
  const avgHorizontalSpacing = filteredHSpacings.length > 0 
    ? findModeSpacing(filteredHSpacings)
    : (lineHorizontalSpacings.length > 0 ? calculateMeanSpacing(lineHorizontalSpacings) : cellSize);
  
  const avgVerticalSpacing = filteredVSpacings.length > 0
    ? findModeSpacing(filteredVSpacings)
    : (lineVerticalSpacings.length > 0 ? calculateMeanSpacing(lineVerticalSpacings) : cellSize);
  
  // Fill in missing lines in gaps and extend to edges
  const fillMissingLines = (lines: number[], imageSize: number, avgSpacing: number): number[] => {
    if (lines.length === 0) return [];
    
    const sorted = [...lines].sort((a, b) => a - b);
    const filled: number[] = [];
    
    const firstLine = sorted[0];
    const lastLine = sorted[sorted.length - 1];
    
    // Extend backwards from first line to edge (0)
    if (firstLine > avgSpacing * 0.5) {
      // Add lines going backwards from first detected line
      let prevLine = firstLine - avgSpacing;
      while (prevLine >= 0) {
        filled.push(prevLine);
        prevLine -= avgSpacing;
      }
      // Reverse to get them in order (smallest first)
      filled.reverse();
    } else {
      // Start at 0 if first line is very close to edge
      filled.push(0);
    }
    
    // Add first detected line (if not already at 0)
    if (filled.length === 0 || filled[filled.length - 1] !== firstLine) {
      filled.push(firstLine);
    }
    
    // Check for gaps and fill them between detected lines
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i] - sorted[i - 1];
      const expectedGap = avgSpacing;
      
      // If gap is significantly larger than expected (1.5x), fill in missing lines
      if (gap > expectedGap * 1.5) {
        const numMissing = Math.round(gap / expectedGap) - 1;
        for (let j = 1; j <= numMissing; j++) {
          const interpolated = sorted[i - 1] + expectedGap * j;
          filled.push(interpolated);
        }
      }
      
      // Always add the detected line
      filled.push(sorted[i]);
    }
    
    // Extend forwards from last line to image edge
    if (lastLine + avgSpacing < imageSize) {
      let nextLine = lastLine + avgSpacing;
      while (nextLine <= imageSize) {
        filled.push(nextLine);
        nextLine += avgSpacing;
      }
      // Ensure we end at the edge if we're close
      if (filled[filled.length - 1] < imageSize - avgSpacing * 0.5) {
        filled.push(imageSize);
      }
    } else if (lastLine < imageSize - avgSpacing * 0.5) {
      // If last line is not at edge, add edge line
      filled.push(imageSize);
    }
    
    return filled.sort((a, b) => a - b);
  };
  
  // Fill missing lines using detected spacing
  const allHorizontalLines = fillMissingLines(sortedHorizontalPeaks, height, avgHorizontalSpacing);
  const allVerticalLines = fillMissingLines(sortedVerticalPeaks, width, avgVerticalSpacing);
  
  return {
    cellSize: (avgHorizontalSpacing + avgVerticalSpacing) / 2,
    offsetX: allVerticalLines.length > 0 ? allVerticalLines[0] : 0,
    offsetY: allHorizontalLines.length > 0 ? allHorizontalLines[0] : 0,
    horizontalLines: allHorizontalLines,
    verticalLines: allVerticalLines,
    debug: {
      horizontalSpacings: lineHorizontalSpacings,
      verticalSpacings: lineVerticalSpacings,
    },
  };
}

/**
 * Refine individual grid line positions by finding exact matches in the image
 */
function refineGridLinePositions(
  edgeData: Uint8Array,
  width: number,
  height: number,
  gridInfo: GridInfo,
  searchRadius: number = 3
): GridInfo {
  // Calculate projections
  const verticalProjection = new Array(width).fill(0);
  const horizontalProjection = new Array(height).fill(0);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      verticalProjection[x] += edgeData[idx];
      horizontalProjection[y] += edgeData[idx];
    }
  }
  
  // Normalize
  const maxH = Math.max(...horizontalProjection, 1);
  const maxV = Math.max(...verticalProjection, 1);
  const normalizedH = horizontalProjection.map(v => v / maxH);
  const normalizedV = verticalProjection.map(v => v / maxV);
  
  // Refine each vertical line position
  const refinedVerticalLines: number[] = [];
  for (const expectedX of gridInfo.verticalLines) {
    const searchStart = Math.max(0, Math.floor(expectedX - searchRadius));
    const searchEnd = Math.min(width - 1, Math.ceil(expectedX + searchRadius));
    
    let bestMatch = expectedX;
    let bestScore = 0;
    for (let x = searchStart; x <= searchEnd; x++) {
      // Use sub-pixel refinement if we find a good match
      const score = normalizedV[x];
      if (score > bestScore) {
        bestScore = score;
        bestMatch = x;
      }
    }
    
    // Use sub-pixel refinement
    if (bestMatch > 0 && bestMatch < width - 1 && bestScore > 0.2) {
      const refined = refinePeakPosition(normalizedV, Math.floor(bestMatch));
      refinedVerticalLines.push(refined);
    } else {
      // Keep original if no good match found
      refinedVerticalLines.push(expectedX);
    }
  }
  
  // Refine each horizontal line position
  const refinedHorizontalLines: number[] = [];
  for (const expectedY of gridInfo.horizontalLines) {
    const searchStart = Math.max(0, Math.floor(expectedY - searchRadius));
    const searchEnd = Math.min(height - 1, Math.ceil(expectedY + searchRadius));
    
    let bestMatch = expectedY;
    let bestScore = 0;
    for (let y = searchStart; y <= searchEnd; y++) {
      const score = normalizedH[y];
      if (score > bestScore) {
        bestScore = score;
        bestMatch = y;
      }
    }
    
    if (bestMatch > 0 && bestMatch < height - 1 && bestScore > 0.2) {
      const refined = refinePeakPosition(normalizedH, Math.floor(bestMatch));
      refinedHorizontalLines.push(refined);
    } else {
      refinedHorizontalLines.push(expectedY);
    }
  }
  
  // Calculate average cell size from refined positions
  const avgVerticalSpacing = refinedVerticalLines.length > 1
    ? (refinedVerticalLines[refinedVerticalLines.length - 1] - refinedVerticalLines[0]) / (refinedVerticalLines.length - 1)
    : gridInfo.cellSize;
  
  const avgHorizontalSpacing = refinedHorizontalLines.length > 1
    ? (refinedHorizontalLines[refinedHorizontalLines.length - 1] - refinedHorizontalLines[0]) / (refinedHorizontalLines.length - 1)
    : gridInfo.cellSize;
  
  return {
    cellSize: (avgVerticalSpacing + avgHorizontalSpacing) / 2,
    offsetX: refinedVerticalLines.length > 0 ? refinedVerticalLines[0] : gridInfo.offsetX,
    offsetY: refinedHorizontalLines.length > 0 ? refinedHorizontalLines[0] : gridInfo.offsetY,
    horizontalLines: refinedHorizontalLines,
    verticalLines: refinedVerticalLines,
    debug: gridInfo.debug,
  };
}

/**
 * Draw grid lines on the image using exact detected positions
 */
async function drawGrid(
  image: sharp.Sharp,
  gridInfo: GridInfo,
  lineWidth: number = 2
): Promise<Buffer> {
  const metadata = await image.metadata();
  const width = metadata.width!;
  const height = metadata.height!;
  
  // Create SVG overlay for grid lines
  const svgLines: string[] = [];
  
  // Draw vertical lines at exact detected positions
  for (const x of gridInfo.verticalLines) {
    if (x >= 0 && x < width) {
      svgLines.push(
        `<line x1="${x.toFixed(2)}" y1="0" x2="${x.toFixed(2)}" y2="${height}" stroke="black" stroke-width="${lineWidth}" opacity="0.8"/>`
      );
    }
  }
  
  // Draw horizontal lines at exact detected positions
  for (const y of gridInfo.horizontalLines) {
    if (y >= 0 && y < height) {
      svgLines.push(
        `<line x1="0" y1="${y.toFixed(2)}" x2="${width}" y2="${y.toFixed(2)}" stroke="black" stroke-width="${lineWidth}" opacity="0.8"/>`
      );
    }
  }
  
  const svg = `
    <svg width="${width}" height="${height}">
      ${svgLines.join('\n')}
    </svg>
  `;
  
  // Composite the grid overlay onto the image
  const output = await image
    .composite([
      {
        input: Buffer.from(svg),
        top: 0,
        left: 0,
      },
    ])
    .toBuffer();
  
  return output;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: tsx scripts/griddetection.ts <input-image> [output-image]');
    process.exit(1);
  }
  
  const inputPath = args[0];
  const outputPath = args[1] || inputPath.replace(/(\.[^.]+)$/, '_gridded$1');
  
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }
  
  console.log(`Processing: ${inputPath}`);
  
  try {
    // Load and convert to grayscale for better grid detection
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    
    // Enhance contrast to make grid lines more visible
    // Convert to RGBA format for edge detection
    const processed = await image
      .greyscale()
      .normalize()
      .linear(1.2, -(128 * 0.2)) // Increase contrast
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // Convert grayscale to RGBA format (4 channels)
    const rgbaData = Buffer.alloc(processed.data.length * 4);
    for (let i = 0; i < processed.data.length; i++) {
      rgbaData[i * 4] = processed.data[i]; // R
      rgbaData[i * 4 + 1] = processed.data[i]; // G
      rgbaData[i * 4 + 2] = processed.data[i]; // B
      rgbaData[i * 4 + 3] = 255; // A
    }
    
    // Apply edge detection (reuse for alignment analysis)
    const edgeData = applyEdgeDetection(new Uint8Array(rgbaData), processed.info.width, processed.info.height);
    
    // Detect grid
    console.log('Detecting grid...');
    const gridInfo = detectGridLines(
      rgbaData,
      processed.info.width,
      processed.info.height
    );
    
    console.log(`Detected grid:`);
    console.log(`  Average cell size: ${gridInfo.cellSize.toFixed(2)}px`);
    console.log(`  Offset: (${gridInfo.offsetX.toFixed(2)}, ${gridInfo.offsetY.toFixed(2)})`);
    console.log(`  Horizontal lines: ${gridInfo.horizontalLines.length}`);
    console.log(`  Vertical lines: ${gridInfo.verticalLines.length}`);
    
    if (gridInfo.debug) {
      const numHorizontalCells = gridInfo.debug.horizontalSpacings.length + 1;
      const numVerticalCells = gridInfo.debug.verticalSpacings.length + 1;
      console.log(`  Grid cells: ${numHorizontalCells} horizontal × ${numVerticalCells} vertical`);
      console.log(`  Sample spacings:`);
      console.log(`    Horizontal: ${gridInfo.debug.horizontalSpacings.length > 0 ? gridInfo.debug.horizontalSpacings.map(s => s.toFixed(1)).join(', ') : 'none'}`);
      console.log(`    Vertical: ${gridInfo.debug.verticalSpacings.length > 0 ? gridInfo.debug.verticalSpacings.map(s => s.toFixed(1)).join(', ') : 'none'}`);
    }
    
    if (gridInfo.cellSize < 5 || gridInfo.cellSize > 500) {
      console.warn('Warning: Detected cell size seems unusual. Results may be inaccurate.');
    }
    
    // Draw grid using exact detected line positions
    // Each line is positioned individually, so small differences don't accumulate
    console.log('Drawing grid lines at detected positions...');
    const originalImage = sharp(inputPath);
    const output = await drawGrid(originalImage, gridInfo, 1);
    
    // Save output
    await sharp(output).toFile(outputPath);
    
    // Ensure public/scripts directory exists
    const publicScriptsDir = 'public/scripts';
    if (!fs.existsSync(publicScriptsDir)) {
      fs.mkdirSync(publicScriptsDir, { recursive: true });
    }
    
    // Copy input image to public/scripts if it's not already there
    const inputFileName = path.basename(inputPath);
    const publicImagePath = path.join(publicScriptsDir, inputFileName);
    if (!fs.existsSync(publicImagePath)) {
      fs.copyFileSync(inputPath, publicImagePath);
      console.log(`Copied image to: ${publicImagePath}`);
    }
    
    // Save grid data to JSON file in public/scripts
    const jsonFileName = path.basename(outputPath).replace(/(\.[^.]+)$/, '.json');
    const jsonPath = path.join(publicScriptsDir, jsonFileName);
    const gridData = {
      imagePath: `/scripts/${inputFileName}`, // Web-accessible path
      imageWidth: processed.info.width,
      imageHeight: processed.info.height,
      grid: {
        cellSize: gridInfo.cellSize,
        offsetX: gridInfo.offsetX,
        offsetY: gridInfo.offsetY,
        horizontalLines: gridInfo.horizontalLines,
        verticalLines: gridInfo.verticalLines,
        numHorizontalCells: gridInfo.horizontalLines.length - 1,
        numVerticalCells: gridInfo.verticalLines.length - 1,
      },
      labels: []
    };
    
    fs.writeFileSync(jsonPath, JSON.stringify(gridData, null, 2));
    
    console.log(`Output saved to: ${outputPath}`);
    console.log(`Grid data saved to: ${jsonPath}`);
    console.log(`Image accessible at: ${gridData.imagePath}`);
  } catch (error) {
    console.error('Error processing image:', error);
    if (error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { detectGridLines, drawGrid };

