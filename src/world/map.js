export const TILE_SIZE = 64;
export const GRID_COLS = 15;
export const GRID_ROWS = 10;

export function createPath() {
  // Simple S-shaped path across the grid
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

export function isOnPath(tx, ty, nodes) {
  // mark tiles near path nodes as path tiles for simplicity
  for (const n of nodes) {
    if (Math.abs(n.x - tx) + Math.abs(n.y - ty) <= 0) return true;
  }
  return false;
}


