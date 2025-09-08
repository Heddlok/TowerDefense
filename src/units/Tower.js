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
  // --- Pricing knobs ---
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
      this.rangeLevel++; this.range = Math.round(this.range * 1.10); this.range2 = this.range * this.range; return true;
    }
    if (kind === 'fireRate' && this.fireRateLevel < this.maxUpgradeLevel) {
      this.fireRateLevel++; this.fireRate = +((this.fireRate * 1.20).toFixed(3)); return true;
    }
    return false;
  }

  // ---------- Robust enemy center in PIXELS ----------
  // Accepts many shapes:
  //  - tile center:   enemy.x/y are integers within grid (normalize to pixels)
  //  - pixel center:  enemy.x/y already pixels
  //  - pixel top-left + size: enemy.x/y + enemy.w/h  -> center
  //  - explicit fields: enemy.px/py, enemy.cx/cy, enemy.centerX/centerY
  _enemyCenterPx(e) {
    if (!e) return null;

    // 1) explicit center/px fields
    if (Number.isFinite(e.px) && Number.isFinite(e.py)) return { x: e.px, y: e.py };
    if (Number.isFinite(e.cx) && Number.isFinite(e.cy)) return { x: e.cx, y: e.cy };
    if (Number.isFinite(e.centerX) && Number.isFinite(e.centerY)) return { x: e.centerX, y: e.centerY };

    // 2) generic x/y
    if (Number.isFinite(e.x) && Number.isFinite(e.y)) {
      const x = e.x, y = e.y;

      // tiles?
      const nearInt = (v) => Math.abs(v - Math.round(v)) < 1e-3;
      const looksTileSpace = x >= 0 && y >= 0 && x < GRID_COLS && y < GRID_ROWS && nearInt(x) && nearInt(y);
      if (looksTileSpace) {
        return { x: x * TILE_SIZE + TILE_SIZE/2, y: y * TILE_SIZE + TILE_SIZE/2 };
      }

      // pixel top-left + size?
      if (Number.isFinite(e.w) && Number.isFinite(e.h)) {
        return { x: x + e.w / 2, y: y + e.h / 2 };
      }

      // Assume pixel center
      return { x, y };
    }

    // 3) vector-ish shapes
    if (e.pos && Number.isFinite(e.pos.x) && Number.isFinite(e.pos.y)) {
      return { x: e.pos.x, y: e.pos.y };
    }
    if (e.position && Number.isFinite(e.position.x) && Number.isFinite(e.position.y)) {
      return { x: e.position.x, y: e.position.y };
    }

    return null;
  }

  _inRange(enemy) {
    const p = this._enemyCenterPx(enemy);
    if (!p) return false;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    return (dx * dx + dy * dy) <= this.range2;
  }

  _acquireTarget(enemies, spatialGrid) {
    // Prefer grid candidates if available, but always re-check true range
    let candidates = enemies;
    if (spatialGrid && typeof spatialGrid.queryCircle === 'function') {
      candidates = spatialGrid.queryCircle(this.x, this.y, this.range) || enemies;
    }

    let best = null;
    let bestD2 = Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const e = candidates[i];
      if (!e || e.isDead || e.reachedEnd) continue;

      const p = this._enemyCenterPx(e);
      if (!p) continue;
      const dx = p.x - this.x, dy = p.y - this.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= this.range2 && d2 < bestD2) { best = e; bestD2 = d2; }
    }
    return best;
  }

  // ---------- Fire ----------
  update(dt, enemies, projectiles, spatialGrid, projectilePool) {
    this._cooldown -= dt;
    if (this._cooldown > 0) return false;

    const target = this._acquireTarget(enemies, spatialGrid);
    if (!target) return false;

    // Spawn projectile (adapt to your init signature)
    const speed = 250;
    const p = projectilePool ? projectilePool.get() : null;

    if (p && typeof p.init === 'function') {
      const arity = p.init.length;
      if (arity >= 5) p.init(this.x, this.y, target, this.damage, speed);
      else if (arity === 4) p.init(this.x, this.y, target, this.damage);
      else p.init({ x: this.x, y: this.y, target, damage: this.damage, speed });
      projectiles.push(p);
    } else {
      // Fallback (only used if you don't have a pool)
      projectiles.push({
        x: this.x, y: this.y, target,
        damage: this.damage, speed,
        done: false, hitTarget: false,
        render(g){ /* no-op to avoid crashes if your renderer calls p.render */ },
        update(){ this.done = true; this.hitTarget = true; },
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

    // // Debug range (uncomment while testing):
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
