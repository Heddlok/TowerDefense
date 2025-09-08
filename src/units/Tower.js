// src/units/Tower.js
export class Tower {
  // --- Pricing knobs ---
  static baseCosts = { basic: 50, rapid: 80, heavy: 120 };
  static priceMul  = { basic: 1.15, rapid: 1.17, heavy: 1.20 };

  // Counts drive price. By default this is "ever built".
  static towerCounts = { basic: 0, rapid: 0, heavy: 0 };

  static resetCounts() {
    this.towerCounts = { basic: 0, rapid: 0, heavy: 0 };
  }

  static getNextTowerCost(type) {
    const base = this.baseCosts[type] ?? 0;
    const mul  = this.priceMul[type]  ?? 1.0;
    const n    = this.towerCounts[type] ?? 0;
    // One formula used everywhere (display + charge)
    return Math.max(1, Math.round(base * Math.pow(mul, n)));
  }

  static registerPurchase(type) {
    this.towerCounts[type] = (this.towerCounts[type] ?? 0) + 1;
  }

  // Optional: call this on sell if you want prices to go back down
  static deregisterOnSell(type) {
    const n = (this.towerCounts[type] ?? 0) - 1;
    this.towerCounts[type] = Math.max(0, n);
  }

  constructor(tx, ty, type, purchasePrice) {
    this.tx = tx;
    this.ty = ty;
    this.type = type;

    // DO NOT increment counts here (avoid double-increment).
    // Store price actually paid so UI/sell value are consistent.
    this.purchasePrice = Number.isFinite(purchasePrice)
      ? purchasePrice
      : Tower.getNextTowerCost(type);

    // example baseline stats per type (adjust to your game)
    const stats = {
      basic: { range: 100, damage: 10, fireRate: 1.0 },
      rapid: { range: 90,  damage: 6,  fireRate: 2.0 },
      heavy: { range: 120, damage: 20, fireRate: 0.6 },
    }[type] || { range: 90, damage: 8, fireRate: 1.0 };

    this.range = stats.range;
    this.damage = stats.damage;
    this.fireRate = stats.fireRate;

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

  // Example upgrade costs (use same rounding everywhere)
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

    // Find a target (via grid if provided)
    let target = null;
    if (spatialGrid && spatialGrid.queryCircle) {
      const candidates = spatialGrid.queryCircle(this.tx * 32 + 16, this.ty * 32 + 16, this.range);
      target = candidates.find(e => !e.isDead && !e.reachedEnd);
    } else {
      target = enemies.find(e => !e.isDead && !e.reachedEnd &&
        Math.hypot(e.x - (this.tx * 32 + 16), e.y - (this.ty * 32 + 16)) <= this.range);
    }

    if (!target) return false;

    const px = this.tx * 32 + 16, py = this.ty * 32 + 16;
    const p = projectilePool ? projectilePool.get() : null;
    if (p) {
      p.init(px, py, target, this.damage);
      projectiles.push(p);
    } else {
      projectiles.push({ x: px, y: py, target, damage: this.damage, speed: 250, done: false, hitTarget: false });
    }

    this._cooldown = 1 / this.fireRate;
    return true;
  }

  render(g) {
    g.fillStyle = '#3498db';
    g.fillRect(this.tx * 32 + 6, this.ty * 32 + 6, 20, 20);
  }

  // (optional) call on sell if you want cost to drop back
  onSold() {
    // Tower.deregisterOnSell(this.type);
  }
}
