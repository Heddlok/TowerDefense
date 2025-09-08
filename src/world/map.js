// src/world/map.js
export const TILE_SIZE = 64;
export const GRID_COLS = 15;
export const GRID_ROWS = 10;

// --- helpers ---
const key = (x, y) => `${x|0},${y|0}`;

/** Original S-shaped control nodes (corners). */
function createPathNodes() {
  const nodes = [];
  for (let y = 1; y < GRID_ROWS - 1; y++) {
    const x = y % 2 === 0 ? GRID_COLS - 2 : 1;
    nodes.push({ x, y });
  }
  nodes.unshift({ x: 1, y: 0 });
  nodes.push({ x: GRID_COLS - 2, y: GRID_ROWS - 1 });
  return nodes;
}

/** Expand control nodes into per-tile, axis-aligned steps (no diagonals). */
export function expandToOrthogonalPath(nodes) {
  const out = [];
  if (!Array.isArray(nodes) || nodes.length === 0) return out;

  let { x: x0, y: y0 } = nodes[0];
  out.push({ x: x0, y: y0 });

  for (let i = 1; i < nodes.length; i++) {
    const { x: x1, y: y1 } = nodes[i];

    if (x0 !== x1) {
      const sx = x0 < x1 ? 1 : -1;
      for (let x = x0 + sx; x !== x1 + sx; x += sx) out.push({ x, y: y0 });
    }
    if (y0 !== y1) {
      const sy = y0 < y1 ? 1 : -1;
      for (let y = y0 + sy; y !== y1 + sy; y += sy) out.push({ x: x1, y });
    }

    x0 = x1; y0 = y1;
  }
  return out;
}

/** Create the final Manhattan path (array of tile coords). */
export function createPath() {
  return expandToOrthogonalPath(createPathNodes());
}

/** Exact path mask for placement/rendering. */
export function rasterizePathToMask(steps) {
  const s = new Set();
  for (const n of steps || []) s.add(key(n.x, n.y));
  return s;
}

/** Works with either a Set mask or a steps array. */
export function isOnPath(tx, ty, maskOrSteps) {
  if (maskOrSteps && typeof maskOrSteps.has === 'function') return maskOrSteps.has(key(tx, ty));
  return rasterizePathToMask(maskOrSteps).has(key(tx, ty));
}
