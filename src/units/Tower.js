import { TILE_SIZE } from '../world/map.js';
import { Projectile } from './OptimizedProjectile.js';


export class Tower {
  constructor(tx, ty, type = 'basic') {
    this.tx = tx;
    this.ty = ty;
    this.x = tx * TILE_SIZE + TILE_SIZE / 2;
    this.y = ty * TILE_SIZE + TILE_SIZE / 2;
    this.type = type;
    
    // Tower stats based on type
    const stats = this.getTowerStats(type);
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
    this.cost = this.baseCost;
    
    this.cooldown = 0;
    this.totalCost = this.baseCost; // Track total money spent
  }

  getTowerStats(type) {
    const stats = {
      basic: {
        range: 140,
        fireRate: 0.8,
        damage: 9, // Reduced from 15 (15 * 0.63 ≈ 9)
        cost: 50,
        color: '#6ea6ff',
        projectileColor: '#ffd866',
        projectileSpeed: 250
      },
      rapid: {
        range: 120,
        fireRate: 2.0,
        damage: 5, // Reduced from 8 (8 * 0.63 ≈ 5)
        cost: 80,
        color: '#ff6b6b',
        projectileColor: '#ff9f43',
        projectileSpeed: 300
      },
      heavy: {
        range: 180,
        fireRate: 0.4,
        damage: 22, // Reduced from 35 (35 * 0.63 ≈ 22)
        cost: 120,
        color: '#4ecdc4',
        projectileColor: '#ff6b6b',
        projectileSpeed: 200
      }
    };
    return stats[type] || stats.basic;
  }

  // Calculate upgrade cost based on tower type and current level
  getUpgradeCost(upgradeType) {
    const baseMultiplier = {
      basic: 1.0,
      rapid: 1.2,
      heavy: 1.5
    };
    
    const multiplier = baseMultiplier[this.type] || 1.0;
    const level = this[`${upgradeType}Level`];
    
    if (level >= this.maxUpgradeLevel) return Infinity;
    
    // Cost scales exponentially: baseCost * multiplier * (level + 1) * 1.5^level
    return Math.floor(this.baseCost * multiplier * (level + 1) * Math.pow(1.5, level));
  }

  // Upgrade a specific stat
  upgrade(upgradeType) {
    const level = this[`${upgradeType}Level`];
    if (level >= this.maxUpgradeLevel) return false;
    
    const cost = this.getUpgradeCost(upgradeType);
    this.totalCost += cost;
    
    // Increase level
    this[`${upgradeType}Level`] = level + 1;
    
    // Apply upgrade bonuses
    this.applyUpgrades();
    
    return true;
  }

  // Apply all upgrade bonuses to current stats
  applyUpgrades() {
    // Damage: +25% per level
    this.damage = Math.floor(this.baseDamage * (1 + this.damageLevel * 0.25));
    
    // Range: +15% per level
    this.range = Math.floor(this.baseRange * (1 + this.rangeLevel * 0.15));
    
    // Fire Rate: +20% per level
    this.fireRate = this.baseFireRate * (1 + this.fireRateLevel * 0.20);
  }

  // Get total upgrade level (for visual indicators)
  getTotalUpgradeLevel() {
    return this.damageLevel + this.rangeLevel + this.fireRateLevel;
  }

  // Check if tower can be upgraded further
  canUpgrade() {
    return this.getTotalUpgradeLevel() < (this.maxUpgradeLevel * 3);
  }

  // Get sell value (60% of total cost)
  getSellValue() {
    return Math.floor(this.totalCost * 0.6);
  }

  update(dt, enemies, projectiles, spatialGrid, projectilePool) {
    this.cooldown -= dt;
    if (this.cooldown > 0) return false;
    
    // Use spatial grid for efficient target finding
    let best = null;
    let bestDist = 0;
    
    const nearbyEnemies = spatialGrid ? spatialGrid.getNearby(this.x, this.y, this.range) : enemies;
    
    for (const e of nearbyEnemies) {
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
      const projectile = projectilePool.get();
      projectile.init(this.x, this.y, best, this.damage, this.projectileSpeed, this.projectileColor);
      projectiles.push(projectile);
      this.cooldown = 1 / this.fireRate;
      return true; // shot fired
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
    
    // upgrade level indicators (small dots around the tower)
    const totalLevel = this.getTotalUpgradeLevel();
    if (totalLevel > 0) {
      g.fillStyle = '#ffd700'; // Gold color for upgrades
      g.font = 'bold 8px system-ui';
      g.textAlign = 'center';
      
      // Show upgrade level as a number
      g.fillText(totalLevel.toString(), this.x, this.y - 20);
      
      // Show upgrade dots
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