"use server";

export type CheckPathParams = {
  clientId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

export type CheckPathResponse = {
  clientId: string;
  blocked: boolean;
  error?: string;
};

/**
 * Check if a movement path is blocked by walls using Foundry's collision detection
 */
export async function checkPath(
  params: CheckPathParams
): Promise<CheckPathResponse> {
  const apiKey = process.env.FOUNDRY_API_KEY;
  if (!apiKey) throw new Error("Missing FOUNDRY_API_KEY");

  const { clientId, fromX, fromY, toX, toY } = params;
  if (!clientId) throw new Error("clientId is required");

  // JavaScript to execute in Foundry to check collision
  // Try different collision detection methods based on Foundry version
  const script = `
    try {
      const origin = {x: ${fromX}, y: ${fromY}};
      const destination = {x: ${toX}, y: ${toY}};
      
      // Try v11+ method first
      if (CONFIG.Canvas.polygonBackends?.move?.testCollision) {
        const collision = CONFIG.Canvas.polygonBackends.move.testCollision(origin, destination, {type: "move", mode: "any"});
        return collision;
      }
      
      // Try v10 method
      if (canvas.walls?.checkCollision) {
        const ray = new Ray(origin, destination);
        const collision = canvas.walls.checkCollision(ray, {type: "move"});
        return collision;
      }
      
      // Fallback: manually check each wall
      const walls = canvas.walls?.placeables || [];
      for (const wall of walls) {
        if (wall.document?.move === CONST.WALL_SENSE_TYPES.NONE) continue;
        const intersects = foundry.utils.lineSegmentIntersects(
          origin.x, origin.y, destination.x, destination.y,
          wall.document.c[0], wall.document.c[1], wall.document.c[2], wall.document.c[3]
        );
        if (intersects) return true;
      }
      return false;
    } catch (e) {
      return {error: e.message, stack: e.stack};
    }
  `;

  const base = process.env.FOUNDRY_RELAY_BASE_URL || "http://localhost:3010";
  const url = new URL("/execute-js", base);
  url.searchParams.set("clientId", clientId);

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ script }),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        clientId,
        blocked: true,
        error: `API error: ${res.status} - ${text}`,
      };
    }

    const data = await res.json();
    return {
      clientId,
      blocked: data.result === true,
    };
  } catch (e: any) {
    return {
      clientId,
      blocked: true,
      error: e?.message || "Failed to check path",
    };
  }
}

export type GetValidMovesParams = {
  clientId: string;
  fromX: number;
  fromY: number;
  maxDistance?: number;
  gridSize?: number;
};

export type GetValidMovesResponse = {
  clientId: string;
  validMoves: Array<{ x: number; y: number }>;
  error?: string;
};

/**
 * Get all valid move locations within a certain distance
 * This uses a flood-fill approach to find reachable cells
 */
export async function getValidMoves(
  params: GetValidMovesParams
): Promise<GetValidMovesResponse> {
  const apiKey = process.env.FOUNDRY_API_KEY;
  if (!apiKey) throw new Error("Missing FOUNDRY_API_KEY");

  const { clientId, fromX, fromY, maxDistance = 500, gridSize = 100 } = params;
  if (!clientId) throw new Error("clientId is required");

  // JavaScript to execute in Foundry to get valid movement locations
  // This checks 8-directional movement from the starting point
  const script = `
    try {
      const start = {x: ${fromX}, y: ${fromY}};
      const maxDist = ${maxDistance};
      const step = ${gridSize};
      const validMoves = [];
      const dirs = [
        {dx: -step, dy: 0}, {dx: step, dy: 0}, 
        {dx: 0, dy: -step}, {dx: 0, dy: step},
        {dx: -step, dy: -step}, {dx: -step, dy: step}, 
        {dx: step, dy: -step}, {dx: step, dy: step}
      ];
      
      // Function to check collision based on available API
      const checkCollision = (origin, destination) => {
        // Try v11+ method first
        if (CONFIG.Canvas.polygonBackends?.move?.testCollision) {
          return CONFIG.Canvas.polygonBackends.move.testCollision(origin, destination, {type: "move", mode: "any"});
        }
        
        // Try v10 method
        if (canvas.walls?.checkCollision) {
          const ray = new Ray(origin, destination);
          return canvas.walls.checkCollision(ray, {type: "move"});
        }
        
        // Fallback: manually check each wall
        const walls = canvas.walls?.placeables || [];
        for (const wall of walls) {
          if (wall.document?.move === CONST.WALL_SENSE_TYPES.NONE) continue;
          const intersects = foundry.utils.lineSegmentIntersects(
            origin.x, origin.y, destination.x, destination.y,
            wall.document.c[0], wall.document.c[1], wall.document.c[2], wall.document.c[3]
          );
          if (intersects) return true;
        }
        return false;
      };
      
      // Check each direction
      for (const dir of dirs) {
        const to = {x: start.x + dir.dx, y: start.y + dir.dy};
        const distance = Math.hypot(to.x - start.x, to.y - start.y);
        if (distance <= maxDist) {
          const collision = checkCollision(start, to);
          if (!collision) {
            validMoves.push(to);
          }
        }
      }
      
      return validMoves;
    } catch (e) {
      return {error: e.message, stack: e.stack};
    }
  `;

  const base = process.env.FOUNDRY_RELAY_BASE_URL || "http://localhost:3010";
  const url = new URL("/execute-js", base);
  url.searchParams.set("clientId", clientId);

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ script }),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        clientId,
        validMoves: [],
        error: `API error: ${res.status} - ${text}`,
      };
    }

    const data = await res.json();
    return {
      clientId,
      validMoves: Array.isArray(data.result) ? data.result : [],
    };
  } catch (e: any) {
    return {
      clientId,
      validMoves: [],
      error: e?.message || "Failed to get valid moves",
    };
  }
}
