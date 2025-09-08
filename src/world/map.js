// src/world/map.js
export const TILE_SIZE = 64;
export const GRID_COLS = 15;
export const GRID_ROWS = 10;

/**
 * S-shaped polyline of path nodes in tile coordinates.
 * Nodes are integer grid positions: {x, y}
 */
export function createPath() {
  const nodes = [];
  for (let y = 1; y < GRID_ROWS - 1; y++) {
    const x = y % 2 === 0 ? GRID_COLS - 2 : 1;
    nodes.push({ x, y });
  }
  // Ensure start and end at edges
  nodes.unshift({ x: 1, y: 0 });
  nodes.push({ x: GRID_COLS - 2, y: GRID_ROWS - 1 });
  return nodes;
}

// --- Exact path rasterization to tile mask (Bresenham) ---
const _k = (x, y) => `${x},${y}`;

export function rasterizePathToMask(pathNodes) {
  const mask = new Set();
  const nodes = Array.isArray(pathNodes) ? pathNodes : [];
  if (nodes.length < 2) return mask;

  const xi = (p) => (p && typeof p.x === 'number' ? (p.x | 0) : 0);
  const yi = (p) => (p && typeof p.y === 'number' ? (p.y | 0) : 0);

  for (let i = 0; i < nodes.length - 1; i++) {
    let x0 = xi(nodes[i]),     y0 = yi(nodes[i]);
    const x1 = xi(nodes[i+1]), y1 = yi(nodes[i+1]);

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      mask.add(_k(x0, y0));
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 <  dx) { err += dx; y0 += sy; }
    }
  }
  return mask;
}

/**
 * Backwards-compatible helper:
 * - If given a Set mask (from rasterizePathToMask), uses it directly.
 * - If given path nodes, rasterizes on the fly.
 */
export function isOnPath(tx, ty, nodesOrMask) {
  if (nodesOrMask && typeof nodesOrMask.has === 'function') {
    // nodesOrMask is already a Set mask
    return nodesOrMask.has(_k(tx, ty));
  }
  const mask = rasterizePathToMask(nodesOrMask || createPath());
  return mask.has(_k(tx, ty));
}
