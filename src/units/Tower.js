// src/units/Tower.js
import { TILE_SIZE } from '../world/map.js';
import { Projectile } from './OptimizedProjectile.js';

// Global multiplier for all ranges
const RANGE_TWEAK = 0.90;

// Range defined in tiles, converted once to pixels
const RANGE_TILES = { basic: 1.00, rapid: 0.80, heavy: 0.60 };
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
    const base = this.baseCosts[type] ?? 0;
    const mul  = this.priceMul[type] ?? 1.0;
    const n    = this.towerCounts[type] ?? 0;
    const steps = Math.floor(n / 2);
    return Math.max(1, Math.round(base * Math.pow(mul, steps)));
  }
  static registerPurchase(type) { this.towerCounts[type] = (this.towerCounts[type] ?? 0) + 1; }

  static colors = { basic: '#4DB6FF', rapid: '#66BB6A', heavy: '#FFB74D' };

  constructor(tx, ty, type, purchasePrice) {
    this.tx = tx; this.ty = ty; this.type = type;

    this.purchasePrice = Number.isFinite(purchasePrice) ? purchasePrice : Tower.getNextTowerCost(type);

    // Pixel center
    this.x = tx * TILE_SIZE + TILE_SIZE / 2;
    this.y = ty * TILE_SIZE + TILE_SIZE / 2;

    // Stats
    this.range  = RANGE_PX[type] ?? RANGE_PX.basic;
    this.range2 = this.range * this.range;

    const baseStats = {
      basic: { damage: 10, fireRate: 1.0 },
      rapid: { damage:  6, fireRate: 2.0 },
      heavy: { damage: 20, fireRate: 0.6 },
    }[type] || { damage: 8, fireRate: 1.0 };

    this.damage = baseStats.damage;
    this.fireRate = baseStats.fireRate;
    this.color = Tower.colors[type] || '#9E9E9E';

    // Upgrades
    this.maxUpgradeLevel = 5;
    this.damageLevel = 0; this.rangeLevel = 0; this.fireRateLevel = 0;

    this._cooldown = 0;
  }

  getSellValue() { return Math.floor(this.purchasePrice * 0.75); }

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

  _inRange(e) {
    const dx = e.x - this.x, dy = e.y - this.y;
    return (dx*dx + dy*dy) <= this.range2;
  }

  _acquireTarget(enemies) {
    let best = null, bestD2 = Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || e.isDead || e.reachedEnd) continue;
      const dx = e.x - this.x, dy = e.y - this.y;
      const d2 = dx*dx + dy*dy;
      if (d2 <= this.range2 && d2 < bestD2) { best = e; bestD2 = d2; }
    }
    return best;
  }

  // Minimal, self-contained shooting
  update(dt, enemies, projectiles /* ignore grid/pool for stability */) {
    this._cooldown -= dt;
    if (this._cooldown > 0) return false;

    const target = this._acquireTarget(enemies);
    if (!target) return false;

    const p = new Projectile();
    p.init(this.x, this.y, target, this.damage, 260);
    projectiles.push(p);

    this._cooldown = 1 / this.fireRate;
    return true;
  }

  render(g) {
    const left = this.x - TILE_SIZE / 2, top = this.y - TILE_SIZE / 2;
    g.save();
    g.fillStyle = this.color; g.fillRect(left, top, TILE_SIZE, TILE_SIZE);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
    g.strokeRect(Math.floor(left) + 0.5, Math.floor(top) + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    g.restore();

    // // Uncomment to see range:
    // g.save(); g.strokeStyle = this.color; g.globalAlpha = 0.25;
    // g.beginPath(); g.arc(this.x, this.y, this.range, 0, Math.PI * 2); g.stroke(); g.restore();
  }
}
