// src/units/Tower.js
import { TILE_SIZE, GRID_COLS, GRID_ROWS } from '../world/map.js';

// Global multiplier for all ranges (1.0 = as listed below)
const RANGE_TWEAK = 0.90;

// Define range in *tiles*; converted to pixels below.
const RANGE_TILES = {
  basic: 1.00, // ~1 tile
  rapid: 0.80, // ~0.8 tile
  heavy: 0.60, // ~0.6 tile
};

// Convert to *pixels* once
const RANGE_PX = {
  basic: Math.round(RANGE_TILES.basic * TILE_SIZE * RANGE_TWEAK),
  rapid: Math.round(RANGE_TILES.rapid * TILE_SIZE * RANGE_TWEAK),
  heavy: Math.round(RANGE_TILES.heavy * TILE_SIZE * RANGE_TWEAK),
};

export class Tower {
  static baseCosts = { basic: 50, rapid: 80, heavy: 120 };
  static priceMul  = { basic: 1.15, rapid: 1.17, heavy: 1.20 };
  static towerCounts = { basic: 0, rapid: 0, heavy: 0 };
  static resetCounts() { this.towerCounts = { basic: 0, rapid: 0, heavy: 0 }; }

  static getNextTowerCost(type) {
    const base  = this.baseCosts[type] ?? 0;
    const mul   = this.priceMul[type]  ?? 1.0;
    const n     = this.towerCounts[type] ?? 0;
    const steps = Math.floor(n / 2);
    return Math.max(1, Math.round(base * Math.pow(mul, steps)));
  }
  static registerPurchase(type) { this.towerCounts[type] = (this.towerCounts[type] ?? 0) + 1; }
  static deregisterOnSell(type) {
    const n = (this.towerCounts[type] ?? 0) - 1;
    this.towerCounts[type] = Math.max(0, n);
  }

  static colors = {
    basic: '#4DB6FF',
    rapid: '#66BB6A',
    heavy: '#FFB74D',
  };

  constructor(tx, ty, type, purchasePrice) {
    this.tx = tx;
    this.ty = ty;
    this.type = type;

    this.purchasePrice = Number.isFinite(purchasePrice)
      ? purchasePrice
      : Tower.getNextTowerCost(type);

    // Pixel-space tower center
    this.x = tx * TILE_SIZE + TILE_SIZE / 2;
    this.y = ty * TILE_SIZE + TILE_SIZE / 2;

    // Range (pixels) + cached squared
    this.range = RANGE_PX[type] ?? RANGE_PX.basic;
    this.range2 = this.range * this.range;

    // Damage / fire rate
    const baseStats = {
      basic: { damage: 10, fireRate: 1.0 },
      rapid: { damage:  6, fireRate: 2.0 }, // bump to 3.0 if desired
      heavy: { damage: 20, fireRate: 0.6 },
    }[type] || { damage: 8, fireRate: 1.0 };

    this.damage   = baseStats.damage;
    this.fireRate = baseStats.fireRate;

    this.color = Tower.colors[type] || '#9E9E9E';

    // Upgrades
    this.maxUpgradeLevel = 5;
    this.damageLevel = 0;
    this.rangeLevel  = 0;
    this.fireRateLevel = 0;

    this._cooldown = 0;
  }

  getSellValue() { return Math.floor(this.purchasePrice * 0.75); }

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
      this.rangeLevel++; this.range = Math.round(this.range * 1.10); this.range2 = this.range * this.range; return true;
    }
    if (kind === 'fireRate' && this.fireRateLevel < this.maxUpgradeLevel) {
      this.fireRateLevel++; this.fireRate = +((this.fireRate * 1.20).toFixed(3)); return true;
    }
    return false;
  }

  // --- Coordinate normalization ---
  // If an enemy looks like it's in tile space (small integers inside grid),
  // convert to pixel center; otherwise assume pixels.
  _enemyPosPx(enemy) {
    let ex = enemy?.x, ey = enemy?.y;
    if (!Number.isFinite(ex) || !Number.isFinite(ey)) return null;

    const nearInt = (v) => Math.abs(v - Math.round(v)) < 1e-3;
    const looksTileSpace =
      ex >= 0 && ey >= 0 &&
      ex < GRID_COLS && ey < GRID_ROWS &&
      nearInt(ex) && nearInt(ey);

    if (looksTileSpace) {
      ex = ex * TILE_SIZE + TILE_SIZE / 2;
      ey = ey * TILE_SIZE + TILE_SIZE / 2;
    }
    return { x: ex, y: ey };
  }

  _inRange(enemy) {
    const p = this._enemyPosPx(enemy);
    if (!p) return false;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    return (dx * dx + dy * dy) <= this.range2;
  }

  _acquireTarget(enemies, spatialGrid) {
    let candidates = enemies;

    if (spatialGrid && typeof spatialGrid.queryCircle === 'function') {
      candidates = spatialGrid.queryCircle(this.x, this.y, this.range) || enemies;
    }

    let best = null;
    let bestD2 = Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const e = candidates[i];
      if (!e || e.isDead || e.reachedEnd) continue;

      const p = this._enemyPosPx(e);
      if (!p) continue;
      const dx = p.x - this.x, dy = p.y - this.y;
      const d2 = dx * dx + dy * dy;

      if (d2 <= this.range2 && d2 < bestD2) {
        best = e;
        bestD2 = d2;
      }
    }
    return best;
  }

  // Minimal shooting API expected by Game.js
  update(dt, enemies, projectiles, spatialGrid, projectilePool) {
    this._cooldown -= dt;
    if (this._cooldown > 0) return false;

    const target = this._acquireTarget(enemies, spatialGrid);
    if (!target) return false;

    const p = projectilePool ? projectilePool.get() : null;
    if (p && typeof p.init === 'function') {
      // OptimizedProjectile likely reads target.x/y each frame, so we pass the enemy ref.
      p.init(this.x, this.y, target, this.damage);
      projectiles.push(p);
    } else {
      // Fallback (only used if you don't have the pool)
      // NOTE: Your p.update should normalize target coords similarly if needed.
      projectiles.push({
        x: this.x, y: this.y, target,
        damage: this.damage, speed: 250,
        done: false, hitTarget: false,
      });
    }

    this._cooldown = 1 / this.fireRate;
    return true;
  }

  render(g) {
    const left = this.x - TILE_SIZE / 2;
    const top  = this.y - TILE_SIZE / 2;

    g.save();
    g.fillStyle = this.color;
    g.fillRect(left, top, TILE_SIZE, TILE_SIZE);

    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 2;
    g.strokeRect(Math.floor(left) + 0.5, Math.floor(top) + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    g.restore();

    // // Debug: visualize range
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
