// utils/SpatialGrid.js
export class SpatialGrid {
  constructor(width, height, cellSize) {
    this.width = width | 0;
    this.height = height | 0;
    this.cellSize = Math.max(4, cellSize | 0);
    this.cols = Math.max(1, Math.ceil(this.width / this.cellSize));
    this.rows = Math.max(1, Math.ceil(this.height / this.cellSize));
    this.cells = new Array(this.cols * this.rows);
    this.clear();
  }

  clear() {
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = null;
  }

  _indexFor(x, y) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return -1;
    return cy * this.cols + cx;
  }

  insert(obj) {
    // Expect obj.x/obj.y in PIXELS (center)
    if (!obj || !Number.isFinite(obj.x) || !Number.isFinite(obj.y)) return;
    const idx = this._indexFor(obj.x, obj.y);
    if (idx < 0) return;
    if (!this.cells[idx]) this.cells[idx] = [];
    this.cells[idx].push(obj);
  }

  // Query circle in PIXELS; returns an array (possibly empty)
  queryCircle(cx, cy, r) {
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r) || r <= 0) return [];
    const minCx = Math.max(0, Math.floor((cx - r) / this.cellSize));
    const maxCx = Math.min(this.cols - 1, Math.floor((cx + r) / this.cellSize));
    const minCy = Math.max(0, Math.floor((cy - r) / this.cellSize));
    const maxCy = Math.min(this.rows - 1, Math.floor((cy + r) / this.cellSize));

    const out = [];
    const seen = new Set();

    for (let gy = minCy; gy <= maxCy; gy++) {
      for (let gx = minCx; gx <= maxCx; gx++) {
        const idx = gy * this.cols + gx;
        const bucket = this.cells[idx];
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const obj = bucket[i];
          if (!obj) continue;
          // de-dup by object identity
          if (seen.has(obj)) continue;
          seen.add(obj);
          out.push(obj);
        }
      }
    }
    return out;
  }
}
