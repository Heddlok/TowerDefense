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

// --- Exact path rasterization to tile mask (Manhattan) ---
const _k = (x, y) => `${x},${y}`;

function rasterizePathToMask(path) {
  const mask = new Set();
  if (!Array.isArray(path) || path.length < 2) return mask;

  const xi = (p) => (p && typeof p.x === 'number' ? (p.x | 0) : 0);
  const yi = (p) => (p && typeof p.y === 'number' ? (p.y | 0) : 0);

  const add = (x, y) => mask.add(_k(x | 0, y | 0));

  for (let i = 0; i < path.length - 1; i++) {
    let x0 = xi(path[i]),     y0 = yi(path[i]);
    const x1 = xi(path[i+1]), y1 = yi(path[i+1]);

    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;

    if (x0 === x1) {
      // vertical
      for (let y = y0; y !== y1; y += sy) add(x0, y);
      add(x1, y1);
    } else if (y0 === y1) {
      // horizontal
      for (let x = x0; x !== x1; x += sx) add(x, y0);
      add(x1, y1);
    } else {
      // L-shape: first horizontal, then vertical (avoids diagonal bleed)
      for (let x = x0; x !== x1; x += sx) add(x, y0);
      add(x1, y0);
      for (let y = y0; y !== y1; y += sy) add(x1, y);
      add(x1, y1);
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
