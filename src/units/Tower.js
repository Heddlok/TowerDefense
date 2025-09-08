// src/units/Tower.js
import { TILE_SIZE } from '../world/map.js';

// Global multiplier for all ranges (1.0 = as listed below)
// Bump ranges up a little from 0.80 → 0.90
const RANGE_TWEAK = 0.90;

// Define range in *tiles*; converted to pixels below.
const RANGE_TILES = {
  basic: 1.00, // ~1 tile
  rapid: 0.80, // ~0.8 tile
  heavy: 0.60, // ~0.6 tile
};

// ✅ Convert to *pixels* once up front to avoid unit mistakes elsewhere
const RANGE_PX = {
  basic: Math.round(RANGE_TILES.basic * TILE_SIZE * RANGE_TWEAK),
  rapid: Math.round(RANGE_TILES.rapid * TILE_SIZE * RANGE_TWEAK),
  heavy: Math.round(RANGE_TILES.heavy * TILE_SIZE * RANGE_TWEAK),
};

export class Tower {
  // --- Pricing knobs ---
  static baseCosts = { basic: 50, rapid: 80, heavy: 120 };
  static priceMul  = { basic: 1.15, rapid: 1.17, heavy: 1.20 };

  // Counts drive price (ever built per type).
  static towerCounts = { basic: 0, rapid: 0, heavy: 0 };
  static resetCounts() { this.towerCounts = { basic: 0, rapid: 0, heavy: 0 }; }

  // PRICE RAMP: increase only every 2nd purchase (pairs: 1–2 same, 3–4 higher, etc.)
  static getNextTowerCost(type) {
    const base  = this.baseCosts[type] ?? 0;
    const mul   = this.priceMul[type]  ?? 1.0;
    const n     = this.towerCounts[type] ?? 0; // already bought
    const steps = Math.floor(n / 2);           // bump every 2 towers
    return Math.max(1, Math.round(base * Math.pow(mul, steps)));
  }

  static registerPurchase(type) { this.towerCounts[type] = (this.towerCounts[type] ?? 0) + 1; }
  static deregisterOnSell(type) {
    const n = (this.towerCounts[type] ?? 0) - 1;
    this.towerCounts[type] = Math.max(0, n);
  }

  // Visuals per type
  static colors = {
    basic: '#4DB6FF', // blue
    rapid: '#66BB6A', // green
    heavy: '#FFB74D', // orange
  };

  constructor(tx, ty, type, purchasePrice) {
    this.tx = tx;
    this.ty = ty;
    this.type = type;

    // Price actually paid (shown in UI / used for sell value)
    this.purchasePrice = Number.isFinite(purchasePrice)
      ? purchasePrice
      : Tower.getNextTowerCost(type);

    // Pixel-space center of this tile
    this.x = tx * TILE_SIZE + TILE_SIZE / 2;
    this.y = ty * TILE_SIZE + TILE_SIZE / 2;

    // ---- Stats ----
    // Range: pick precomputed pixels and cache range^2 for fast checks
    this.range = RANGE_PX[type] ?? RANGE_PX.basic; // pixels
    this.range2 = this.range * this.range;

    // Damage / fire rate
    const baseStats = {
      basic: { damage: 10, fireRate: 1.0 },
      rapid: { damage:  6, fireRate: 2.0 }, // set to 3.0 if you want a true "rapid" feel
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

  // Sell value based on price actually paid
  getSellValue() { return Math.floor(this.purchasePrice * 0.75); }

  // Upgrade costs
  getUpgradeCost(kind) {
    const base = 30;
    const lvl = kind === 'damage' ? this.damageLevel
              : kind === 'range'  ? this.rangeLevel
              : kind === 'fireRate' ? this.fireRateLevel : 0;
    return Math.round(base * Math.pow(1.25, lvl));
  }

  upgrade(kind) {
    if (kind === 'damage' && this.damageLevel < this.maxUpgradeLevel) {
      this.damageLevel++;
      this.damage = Math.round(this.damage * 1.25);
      return true;
    }
    if (kind === 'range' && this.rangeLevel < this.maxUpgradeLevel) {
      // Gentle multiplicative bump
      this.rangeLevel++;
      this.range = Math.round(this.range * 1.10); // +10% per range upgrade
      this.range2 = this.range * this.range;      // keep squared cache in sync
      return true;
    }
    if (kind === 'fireRate' && this.fireRateLevel < this.maxUpgradeLevel) {
      this.fireRateLevel++;
      // store with a tiny rounding to avoid floating error accumulation
      this.fireRate = +((this.fireRate * 1.20).toFixed(3));
      return true;
    }
    return false;
  }

  // ---- Targeting helpers ----
  _inRange(enemy) {
    const dx = enemy.x - this.x;
    const dy = enemy.y - this.y;
    return (dx * dx + dy * dy) <= this.range2;
  }

  _acquireTarget(enemies, spatialGrid) {
    let candidates = enemies;

    if (spatialGrid && typeof spatialGrid.queryCircle === 'function') {
      candidates = spatialGrid.queryCircle(this.x, this.y, this.range) || enemies;
    }

    // Choose nearest valid target inside actual range
    let best = null;
    let bestD2 = Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const e = candidates[i];
      if (!e || e.isDead || e.reachedEnd) continue;
      const dx = e.x - this.x, dy = e.y - this.y;
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
    // Cooldown tick
    this._cooldown -= dt;
    if (this._cooldown > 0) return false;

    // Find target
    const target = this._acquireTarget(enemies, spatialGrid);
    if (!target) return false;

    // Fire projectile
    const p = projectilePool ? projectilePool.get() : null;
    if (p && typeof p.init === 'function') {
      p.init(this.x, this.y, target, this.damage);
      projectiles.push(p);
    } else {
      projectiles.push({
        x: this.x,
        y: this.y,
        target,
        damage: this.damage,
        speed: 250,
        done: false,
        hitTarget: false,
      });
    }

    this._cooldown = 1 / this.fireRate;
    return true;
  }

  render(g) {
    // Fill the ENTIRE tile this tower occupies
    const left = this.x - TILE_SIZE / 2;
    const top  = this.y - TILE_SIZE / 2;

    g.save();
    g.fillStyle = this.color;
    g.fillRect(left, top, TILE_SIZE, TILE_SIZE);

    // Subtle border for readability
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 2;
    g.strokeRect(Math.floor(left) + 0.5, Math.floor(top) + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    g.restore();

    // // (Optional) visualize range for quick tuning:
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
