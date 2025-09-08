// src/units/Tower.js
import { TILE_SIZE } from '../world/map.js';

export class Tower {
  // --- Pricing knobs ---
  static baseCosts = { basic: 50, rapid: 80, heavy: 120 };
  static priceMul  = { basic: 1.15, rapid: 1.17, heavy: 1.20 };

  // Visuals per type
  static colors = {
    basic: '#4DB6FF', // blue
    rapid: '#66BB6A', // green
    heavy: '#FFB74D', // orange
  };

  // Counts drive price. By default this is "ever built".
  static towerCounts = { basic: 0, rapid: 0, heavy: 0 };

  static resetCounts() {
    this.towerCounts = { basic: 0, rapid: 0, heavy: 0 };
  }

  static getNextTowerCost(type) {
    const base = this.baseCosts[type] ?? 0;
    const mul  = this.priceMul[type]  ?? 1.0;
    const n    = this.towerCounts[type] ?? 0;
    return Math.max(1, Math.round(base * Math.pow(mul, n)));
  }

  static registerPurchase(type) {
    this.towerCounts[type] = (this.towerCounts[type] ?? 0) + 1;
  }

  static deregisterOnSell(type) {
    const n = (this.towerCounts[type] ?? 0) - 1;
    this.towerCounts[type] = Math.max(0, n);
  }

  constructor(tx, ty, type, purchasePrice) {
    this.tx = tx;
    this.ty = ty;
    this.type = type;

    // Price actually paid (shown in UI / used for sell value)
    this.purchasePrice = Number.isFinite(purchasePrice)
      ? purchasePrice
      : Tower.getNextTowerCost(type);

    // Convert to world pixels once and use everywhere
    this.x = tx * TILE_SIZE + TILE_SIZE / 2;
    this.y = ty * TILE_SIZE + TILE_SIZE / 2;

    // Stats tuned originally around 32px tiles; scale them to current TILE_SIZE
    const RANGE_SCALE = TILE_SIZE / 32;

    const baseStats = {
      basic: { range: 30, damage: 10, fireRate: 1.0 },
      rapid: { range:  30, damage:  6, fireRate: 2.0 },
      heavy: { range: 10, damage: 20, fireRate: 0.6 },
    }[type] || { range: 30, damage: 8, fireRate: 1.0 };

    this.range    = (baseStats.range ?? 96) * RANGE_SCALE; // pixels
    this.damage   = baseStats.damage ?? 8;
    this.fireRate = baseStats.fireRate ?? 1.0;

    // Visuals
    this.color = Tower.colors[type] || '#9E9E9E';

    // upgrade tracking
    this.maxUpgradeLevel = 5;
    this.damageLevel = 0;
    this.rangeLevel = 0;
    this.fireRateLevel = 0;

    this._cooldown = 0;
  }

  // Example sell formula
  getSellValue() {
    return Math.floor(this.purchasePrice * 0.75);
  }

  // Example upgrade costs
  getUpgradeCost(kind) {
    const base = 30;
    const lvl = kind === 'damage' ? this.damageLevel
              : kind === 'range'  ? this.rangeLevel
              : kind === 'fireRate' ? this.fireRateLevel : 0;
    return Math.round(base * Math.pow(1.25, lvl));
  }

  upgrade(kind) {
    if (kind === 'damage' && this.damageLevel < this.maxUpgradeLevel) {
      this.damageLevel++; this.damage = Math.round(this.damage * 1.25); return true;
    }
    if (kind === 'range' && this.rangeLevel < this.maxUpgradeLevel) {
      this.rangeLevel++; this.range = Math.round(this.range * 1.15); return true;
    }
    if (kind === 'fireRate' && this.fireRateLevel < this.maxUpgradeLevel) {
      this.fireRateLevel++; this.fireRate = +(this.fireRate * 1.20).toFixed(3); return true;
    }
    return false;
  }

  // Minimal shooting API expected by Game.js
  update(dt, enemies, projectiles, spatialGrid, projectilePool) {
    this._cooldown -= dt;
    if (this._cooldown > 0) return false;

    // Find a target (use grid if available)
    let target = null;
    if (spatialGrid && typeof spatialGrid.queryCircle === 'function') {
      const candidates = spatialGrid.queryCircle(this.x, this.y, this.range);
      target = candidates.find(e => !e.isDead && !e.reachedEnd);
    } else {
      target = enemies.find(e => !e.isDead && !e.reachedEnd &&
        Math.hypot(e.x - this.x, e.y - this.y) <= this.range);
    }

    if (!target) return false;

    const p = projectilePool ? projectilePool.get() : null;
    if (p && typeof p.init === 'function') {
      p.init(this.x, this.y, target, this.damage);
      projectiles.push(p);
    } else {
      projectiles.push({
        x: this.x, y: this.y, target,
        damage: this.damage, speed: 250,
        done: false, hitTarget: false
      });
    }

    this._cooldown = 1 / this.fireRate;
    return true;
  }

  render(g) {
    const size = Math.floor(TILE_SIZE * 0.6);
    const half = size / 2;

    g.save();
    g.fillStyle = this.color;
    g.fillRect(this.x - half, this.y - half, size, size);

    // subtle outline for visibility on dark tiles
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 2;
    g.strokeRect(this.x - half, this.y - half, size, size);
    g.restore();

    // // (Optional) draw range for debugging:
    // g.save();
    // g.strokeStyle = this.color;
    // g.globalAlpha = 0.25;
    // g.beginPath();
    // g.arc(this.x, this.y, this.range, 0, Math.PI * 2);
    // g.stroke();
    // g.restore();
  }

  onSold() {
    // Tower.deregisterOnSell(this.type);
  }
}
