// src/world/map.js
export const TILE_SIZE = 64;
export const GRID_COLS = 15;
// Add vertical space between lanes by increasing rows.
// 19 rows gives 9 horizontal lanes with a blank row between each.
export const GRID_ROWS = 19;

/**
 * Return corner nodes for an S-shaped path where each horizontal lane
 * is separated by one empty row (Manhattan only when expanded in Game.js).
 */
export function createPath() {
  const nodes = [];

  // Start just inside the top edge at the left side
  nodes.push({ x: 1, y: 0 });

  // Lanes at y = 1, 3, 5, ... GRID_ROWS - 2 (blank row between lanes)
  let i = 0;
  for (let y = 1; y < GRID_ROWS - 1; y += 2, i++) {
    const x = (i % 2 === 0) ? (GRID_COLS - 2) : 1; // alternate end side each lane
    nodes.push({ x, y });
  }

  // Exit near bottom-right edge
  nodes.push({ x: GRID_COLS - 2, y: GRID_ROWS - 1 });

  return nodes;
}

/**
 * Backward-compatible helper used by some code paths.
 * Marks only tiles that are exactly on a node (not needed by Game.js,
 * which builds a proper mask from the expanded steps).
 */
export function isOnPath(tx, ty, nodes) {
  for (const n of nodes || []) {
    if ((n.x | 0) === (tx | 0) && (n.y | 0) === (ty | 0)) return true;
  }
  return false;
}
