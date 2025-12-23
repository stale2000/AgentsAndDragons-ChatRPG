// Shared, wall-aware pathfinding helpers on the fine grid raster

export type GridCell = { walls: number; doors: number; [key: string]: any };

export function pathBlockedLocalFine(
  gridData: GridCell[][] | null,
  gridSize: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
) {
  let x0 = fromX;
  let y0 = fromY;
  const x1 = toX;
  const y1 = toY;
  let dx = Math.abs(x1 - x0);
  let sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0);
  let sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let guard = gridSize * gridSize * 2;
  while (guard-- > 0) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const px = x0 + ox, py = y0 + oy;
        if (py >= 0 && py < gridSize && px >= 0 && px < gridSize) {
          const cell = gridData?.[py]?.[px];
          const walls = cell?.walls || 0;
          const doors = cell?.doors || 0;
          if (walls > 0 && doors === 0) return true;
        }
      }
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return false;
}

export function findPathCoarse(
  gridData: GridCell[][] | null,
  gridSize: number,
  startX: number,
  startY: number,
  goals: Set<string>,
  occupied: Set<string>,
  step = 10,
  maxSquares?: number,
): { x: number; y: number }[] | null {
  const coarseMax = gridSize / step;
  const open: { x: number; y: number; f: number }[] = [];
  const g: number[][] = Array.from({ length: coarseMax }, () => Array(coarseMax).fill(Infinity));
  const cameX: number[][] = Array.from({ length: coarseMax }, () => Array(coarseMax).fill(-1));
  const cameY: number[][] = Array.from({ length: coarseMax }, () => Array(coarseMax).fill(-1));
  const heuristic = (x: number, y: number) => {
    let best = Infinity;
    goals.forEach(key => {
      const [gx, gy] = key.split(',').map(n => parseInt(n, 10));
      const d = Math.hypot(gx - x, gy - y);
      if (d < best) best = d;
    });
    return best;
  };
  g[startY][startX] = 0;
  open.push({ x: startX, y: startY, f: heuristic(startX, startY) });
  const dirs = [
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
    { dx: -1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 1 },
  ];
  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;
    
    // Check if we've exceeded max movement distance
    if (maxSquares !== undefined && g[current.y][current.x] >= maxSquares) {
      continue;
    }
    
    if (goals.has(`${current.x},${current.y}`)) {
      const path: { x: number; y: number }[] = [];
      let cx = current.x, cy = current.y;
      while (!(cx === startX && cy === startY)) {
        path.push({ x: cx, y: cy });
        const px = cameX[cy][cx];
        const py = cameY[cy][cx];
        if (px === -1 || py === -1) break;
        cx = px; cy = py;
      }
      path.push({ x: startX, y: startY });
      path.reverse();
      
      // Limit path length to maxSquares if specified
      if (maxSquares !== undefined && path.length > maxSquares + 1) {
        return path.slice(0, maxSquares + 1);
      }
      return path;
    }
    for (const d of dirs) {
      const nx = current.x + d.dx, ny = current.y + d.dy;
      if (nx < 0 || ny < 0 || nx >= coarseMax || ny >= coarseMax) continue;
      if (!(nx === startX && ny === startY) && occupied.has(`${nx},${ny}`)) continue;
      const blocked = pathBlockedLocalFine(
        gridData,
        gridSize,
        current.x * step + Math.floor(step / 2),
        current.y * step + Math.floor(step / 2),
        nx * step + Math.floor(step / 2),
        ny * step + Math.floor(step / 2),
      );
      if (blocked) continue;
      const cost = (d.dx === 0 || d.dy === 0) ? 1 : 2; // Diagonal costs 2 squares
      const tentative = g[current.y][current.x] + cost;
      
      // Skip if this would exceed max movement
      if (maxSquares !== undefined && tentative > maxSquares) continue;
      
      if (tentative < g[ny][nx]) {
        g[ny][nx] = tentative;
        cameX[ny][nx] = current.x; cameY[ny][nx] = current.y;
        const f = tentative + heuristic(nx, ny);
        const existing = open.find(i => i.x === nx && i.y === ny);
        if (existing) existing.f = Math.min(existing.f, f);
        else open.push({ x: nx, y: ny, f });
      }
    }
  }
  
  // If maxSquares is set and we didn't reach a goal, return the best path we found
  if (maxSquares !== undefined) {
    // Find the closest reachable cell to any goal
    let bestCell: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    let bestPathLength = Infinity;
    
    for (let y = 0; y < coarseMax; y++) {
      for (let x = 0; x < coarseMax; x++) {
        if (g[y][x] !== Infinity && g[y][x] <= maxSquares) {
          goals.forEach(key => {
            const [gx, gy] = key.split(',').map(n => parseInt(n, 10));
            const d = Math.hypot(gx - x, gy - y);
            if (d < bestDist || (d === bestDist && g[y][x] < bestPathLength)) {
              bestDist = d;
              bestPathLength = g[y][x];
              bestCell = { x, y };
            }
          });
        }
      }
    }
    
    if (bestCell) {
      const path: { x: number; y: number }[] = [];
      let cx = bestCell.x, cy = bestCell.y;
      while (!(cx === startX && cy === startY)) {
        path.push({ x: cx, y: cy });
        const px = cameX[cy][cx];
        const py = cameY[cy][cx];
        if (px === -1 || py === -1) break;
        cx = px; cy = py;
      }
      path.push({ x: startX, y: startY });
      path.reverse();
      return path;
    }
  }
  
  return null;
}

export function findPathCoarseToTarget(
  gridData: GridCell[][] | null,
  gridSize: number,
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  step = 10,
  maxSquares?: number,
) {
  const goals = new Set<string>([`${targetX},${targetY}`]);
  const occupied = new Set<string>();
  return findPathCoarse(gridData, gridSize, startX, startY, goals, occupied, step, maxSquares);
}

/**
 * Find all reachable coarse cells within movement range using BFS.
 * Returns an array of {x, y} coordinates in coarse grid space.
 */
export function findReachableCells(
  gridData: GridCell[][] | null,
  gridSize: number,
  startX: number,
  startY: number,
  maxSquares: number,
  occupied: Set<string>,
  step = 10,
): { x: number; y: number }[] {
  const coarseMax = gridSize / step;
  const reachable: { x: number; y: number }[] = [];
  const visited = new Set<string>();
  const queue: { x: number; y: number; distance: number }[] = [];
  
  // Start position is always reachable
  queue.push({ x: startX, y: startY, distance: 0 });
  visited.add(`${startX},${startY}`);
  
  const dirs = [
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
    { dx: -1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 1 },
  ];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    // Add current cell to reachable (except start position for cleaner output)
    if (current.distance > 0) {
      reachable.push({ x: current.x, y: current.y });
    }
    
    // Stop if we've reached max movement distance
    if (current.distance >= maxSquares) {
      continue;
    }
    
    // Check all 8 directions
    for (const d of dirs) {
      const nx = current.x + d.dx;
      const ny = current.y + d.dy;
      const key = `${nx},${ny}`;
      
      // Bounds check
      if (nx < 0 || ny < 0 || nx >= coarseMax || ny >= coarseMax) continue;
      
      // Skip if already visited
      if (visited.has(key)) continue;
      
      // Skip if occupied (but allow starting position)
      if (!(nx === startX && ny === startY) && occupied.has(key)) continue;
      
      // Check if path is blocked by walls
      const blocked = pathBlockedLocalFine(
        gridData,
        gridSize,
        current.x * step + Math.floor(step / 2),
        current.y * step + Math.floor(step / 2),
        nx * step + Math.floor(step / 2),
        ny * step + Math.floor(step / 2),
      );
      
      if (blocked) continue;
      
      // Calculate movement cost (orthogonal = 1, diagonal = sqrt(2) ≈ 1.4, round up)
      const cost = (d.dx === 0 || d.dy === 0) ? 1 : 2; // Diagonal costs 2 squares
      const newDistance = current.distance + cost;
      
      // Only add if within movement range
      if (newDistance <= maxSquares) {
        visited.add(key);
        queue.push({ x: nx, y: ny, distance: newDistance });
      }
    }
  }
  
  return reachable;
}


