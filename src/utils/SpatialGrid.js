export class SpatialGrid {
  constructor(width, height, cellSize = 64) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.grid = new Array(this.cols * this.rows);
    
    for (let i = 0; i < this.grid.length; i++) {
      this.grid[i] = [];
    }
  }

  clear() {
    for (let i = 0; i < this.grid.length; i++) {
      this.grid[i].length = 0;
    }
  }

  getCell(x, y) {
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      return null;
    }
    
    return row * this.cols + col;
  }

  insert(obj) {
    const cell = this.getCell(obj.x, obj.y);
    if (cell !== null) {
      this.grid[cell].push(obj);
    }
  }

  getNearby(x, y, radius) {
    const nearby = [];
    const minCol = Math.max(0, Math.floor((x - radius) / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
    const minRow = Math.max(0, Math.floor((y - radius) / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));
    
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cell = row * this.cols + col;
        nearby.push(...this.grid[cell]);
      }
    }
    
    return nearby;
  }

  updateObject(obj, oldX, oldY) {
    const oldCell = this.getCell(oldX, oldY);
    const newCell = this.getCell(obj.x, obj.y);
    
    if (oldCell !== null && oldCell === newCell) {
      return; // Same cell, no update needed
    }
    
    if (oldCell !== null) {
      const cellArray = this.grid[oldCell];
      const index = cellArray.indexOf(obj);
      if (index !== -1) {
        cellArray.splice(index, 1);
      }
    }
    
    if (newCell !== null) {
      this.grid[newCell].push(obj);
    }
  }
}
