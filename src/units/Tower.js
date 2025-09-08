// src/units/Tower.js
import { TILE_SIZE } from '../world/map.js';

// Global multiplier for all ranges (1.0 = as listed below)
const RANGE_TWEAK = 0.85; // try 0.75 if you want even tighter

// Define range in *tiles* for clarity, then we convert to pixels.
const RANGE_TILES = {
  basic: 1.00, // ~1 tile
  rapid: 0.80, // ~0.8 tile
  heavy: 0.60, // ~0.6 tile
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
    // Range: convert tiles -> pixels and apply tweak
    const tiles = RANGE_TILES[type] ?? RANGE_TILES.basic;
    this.range = tiles * TILE_SIZE * RANGE_TWEAK; // pixels

    // Damage / fire rate (unchanged from your last setup)
    const baseStats = {
      basic: { damage: 10, fireRate: 1.0 },
      rapid: { damage:  6, fireRate: 2.0 },
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
      this.damageLevel++; this.damage = Math.round(this.damage * 1.25); return true;
    }
    if (kind === 'range' && this.rangeLevel < this.maxUpgradeLevel) {
      // Range upgrades scale multiplicatively but gently
      this.rangeLevel++;
      this.range = +(this.range * 1.10).toFixed(3); // +10% per range upgrade
      return true;
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

    // Find a target (prefer spatial grid)
    let target = null;
    if (spatialGrid && typeof spatialGrid.queryCircle === 'function') {
      const candidates = spatialGrid.queryCircle(this.x, this.y, this.range);
      target = candidates.find(e => !e.isDead && !e.reachedEnd);
    } else {
      target = enemies.find(e => !e.isDead && !e.reachedEnd &&
        Math.hypot(e.x - this.x, e.y - this.y) <= this.range);
    }
    if (!target) return false;

    // Fire projectile
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

    // // (Optional) visualize range:
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
