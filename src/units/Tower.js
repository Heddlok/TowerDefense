import { TILE_SIZE } from '../world/map.js';
import { Projectile } from './OptimizedProjectile.js';

export class Tower {
  // ===== Dynamic pricing config & tracking =====
  static SECOND_BUMP = 0.42; // +42% for every 2 towers bought (per type)
  static towerCounts = { basic: 0, rapid: 0, heavy: 0 };

  static STATS = {
    basic: {
      range: 140,
      fireRate: 0.8,
      damage: 9,
      cost: 50,
      color: '#6ea6ff',
      projectileColor: '#ffd866',
      projectileSpeed: 250
    },
    rapid: {
      range: 120,
      fireRate: 2.0,
      damage: 5,
      cost: 80,
      color: '#ff6b6b',
      projectileColor: '#ff9f43',
      projectileSpeed: 300
    },
    heavy: {
      range: 180,
      fireRate: 0.4,
      damage: 22,
      cost: 120,
      color: '#4ecdc4',
      projectileColor: '#ff6b6b',
      projectileSpeed: 200
    }
  };

  // ---- helpers (normalize + shared lookups)
  static normalizeType(type) {
    return (type || 'basic').toLowerCase();
  }
  static getTowerStats(type) {
    const t = Tower.normalizeType(type);
    return Tower.STATS[t] || Tower.STATS.basic;
  }

  /** +42% for every 2 towers already owned: 0–1 -> 1.00x, 2–3 -> 1.42x, 4–5 -> 1.84x, ... */
  static getPriceMultiplier(type, countOverride = null) {
    const t = Tower.normalizeType(type);
    const countNow = (countOverride ?? Tower.towerCounts[t] ?? 0);
    const steps = Math.floor(Math.max(0, countNow) / 2);
    return 1 + Tower.SECOND_BUMP * steps;
  }

  /** Price to buy the next tower of this type (given current counts). */
  static getNextTowerCost(type) {
    const t = Tower.normalizeType(type);
    const base = Tower.getTowerStats(t).cost;
    return Math.floor(base * Tower.getPriceMultiplier(t));
  }

  /** Preview price after n more purchases (e.g., n=1 = “after this one”). */
  static getFutureTowerCost(type, n = 1) {
    const t = Tower.normalizeType(type);
    const base = Tower.getTowerStats(t).cost;
    const curr = Tower.towerCounts[t] ?? 0;
    const mult = Tower.getPriceMultiplier(t, curr + n);
    return Math.floor(base * mult);
  }

  /** Call this only after successfully deducting money. */
  static registerPurchase(type) {
    const t = Tower.normalizeType(type);
    Tower.towerCounts[t] = (Tower.towerCounts[t] ?? 0) + 1;
  }

  /** Reset counts when starting a new game. */
  static resetCounts() {
    Tower.towerCounts = { basic: 0, rapid: 0, heavy: 0 };
  }

  // ===== Instance =====
  constructor(tx, ty, type = 'basic', purchaseCost = null) {
    this.type = Tower.normalizeType(type);

    this.tx = tx;
    this.ty = ty;
    this.x = tx * TILE_SIZE + TILE_SIZE / 2;
    this.y = ty * TILE_SIZE + TILE_SIZE / 2;

    // Stats from table
    const stats = Tower.getTowerStats(this.type);
    this.baseRange = stats.range;
    this.baseFireRate = stats.fireRate;
    this.baseDamage = stats.damage;
    this.baseCost = stats.cost;
    this.color = stats.color;
    this.projectileColor = stats.projectileColor;
    this.projectileSpeed = stats.projectileSpeed;

    // Upgrade levels
    this.damageLevel = 0;
    this.rangeLevel = 0;
    this.fireRateLevel = 0;
    this.maxUpgradeLevel = 3;

    // Current stats (base + upgrades)
    this.range = this.baseRange;
    this.fireRate = this.baseFireRate;
    this.damage = this.baseDamage;

    // What you actually paid for this tower
    const paid = (purchaseCost != null) ? purchaseCost : Tower.getNextTowerCost(this.type);
    this.cost = paid;
    this.totalCost = paid;

    this.cooldown = 0;
  }

  // ---- upgrades
  getUpgradeCost(upgradeType) {
    const baseMultiplier = { basic: 1.0, rapid: 1.2, heavy: 1.5 };
    const multiplier = baseMultiplier[this.type] || 1.0;
    const level = this[`${upgradeType}Level`];
    if (level >= this.maxUpgradeLevel) return Infinity;
    return Math.floor(this.baseCost * multiplier * (level + 1) * Math.pow(1.5, level));
  }

  upgrade(upgradeType) {
    const level = this[`${upgradeType}Level`];
    if (level >= this.maxUpgradeLevel) return false;
    const cost = this.getUpgradeCost(upgradeType);
    this.totalCost += cost;
    this[`${upgradeType}Level`] = level + 1;
    this.applyUpgrades();
    return true;
  }

  applyUpgrades() {
    this.damage = Math.floor(this.baseDamage * (1 + this.damageLevel * 0.25)); // +25%/lvl
    this.range  = Math.floor(this.baseRange  * (1 + this.rangeLevel  * 0.15)); // +15%/lvl
    this.fireRate = this.baseFireRate * (1 + this.fireRateLevel * 0.20);       // +20%/lvl
  }

  getTotalUpgradeLevel() {
    return this.damageLevel + this.rangeLevel + this.fireRateLevel;
  }
  canUpgrade() {
    return this.getTotalUpgradeLevel() < (this.maxUpgradeLevel * 3);
  }
  getSellValue() {
    return Math.floor(this.totalCost * 0.6);
  }

  // ---- runtime
  update(dt, enemies, projectiles, spatialGrid, projectilePool) {
    this.cooldown -= dt;
    if (this.cooldown > 0) return false;

    let best = null;
    let bestDist = 0;
    const nearby = spatialGrid ? spatialGrid.getNearby(this.x, this.y, this.range) : enemies;

    for (const e of nearby) {
      if (e.isDead || e.reachedEnd) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d <= this.range) {
        const score = e._sIndex ?? 0;
        if (best === null || score > bestDist) {
          best = e;
          bestDist = score;
        }
      }
    }

    if (best) {
      const p = projectilePool.get();
      p.init(this.x, this.y, best, this.damage, this.projectileSpeed, this.projectileColor);
      projectiles.push(p);
      this.cooldown = 1 / this.fireRate;
      return true;
    }
    return false;
  }

  render(g) {
    // base
    g.fillStyle = this.color;
    g.fillRect(this.tx * TILE_SIZE + 8, this.ty * TILE_SIZE + 8, TILE_SIZE - 16, TILE_SIZE - 16);

    // tower center
    g.beginPath();
    g.fillStyle = this.color;
    g.arc(this.x, this.y, 14, 0, Math.PI * 2);
    g.fill();

    // tower outline
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(this.x, this.y, 14, 0, Math.PI * 2);
    g.stroke();

    // type indicator
    g.fillStyle = '#ffffff';
    g.font = 'bold 12px system-ui';
    g.textAlign = 'center';
    g.fillText(this.type.charAt(0).toUpperCase(), this.x, this.y + 4);

    // upgrade indicators
    const totalLevel = this.getTotalUpgradeLevel();
    if (totalLevel > 0) {
      g.fillStyle = '#ffd700';
      g.font = 'bold 8px system-ui';
      g.textAlign = 'center';
      g.fillText(totalLevel.toString(), this.x, this.y - 20);

      const dotRadius = 2;
      const dotDistance = 18;
      for (let i = 0; i < totalLevel && i < 9; i++) {
        const angle = (i / Math.max(totalLevel, 1)) * Math.PI * 2;
        const dotX = this.x + Math.cos(angle) * dotDistance;
        const dotY = this.y + Math.sin(angle) * dotDistance;
        g.beginPath();
        g.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}
