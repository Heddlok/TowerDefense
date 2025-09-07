import { TILE_SIZE } from '../world/map.js';

export class Enemy {
  constructor(type = 'basic') {
    this.type = type;

    // Enemy stats based on type
    const stats = this.getEnemyStats(type);
    this.speed = stats.speed;
    this.radius = stats.radius;
    this.color = stats.color;
    this.maxHp = stats.maxHp;
    this.hp = this.maxHp;
    this.reward = stats.reward;

    this.progress = 0; // along path segments
    this.isDead = false;
    this.reachedEnd = false;
    this.x = 0;
    this.y = 0;

    // NEW: grant-money-once flag (persists per enemy lifetime)
    this._rewardGranted = false;

    // Generation token (helps ignore stale hits after pooling reuse)
    this._gen = (Enemy._nextGen = (Enemy._nextGen || 0) + 1);

    // Pathfinding cache for performance
    this._segments = null;
    this._sIndex = 0;
    this._sProgress = 0;
  }

  /**
   * Initialize enemy with specific type and optional per-wave scaling.
   * @param {('basic'|'fast'|'tank')} type
   * @param {{hpMul?:number, speedMul?:number, rewardMul?:number}} [scaling]
   */
  init(type = 'basic', scaling = { hpMul: 1, speedMul: 1, rewardMul: 1 }) {
    this.type = type;
    const stats = this.getEnemyStats(type);

    // Apply per-wave scaling (defaults keep original behavior)
    const hpMul = Number.isFinite(scaling.hpMul) ? scaling.hpMul : 1;
    const spMul = Number.isFinite(scaling.speedMul) ? scaling.speedMul : 1;
    const rwMul = Number.isFinite(scaling.rewardMul) ? scaling.rewardMul : 1;

    this.speed = stats.speed * spMul;
    this.radius = stats.radius;
    this.color = stats.color;

    // Round hp/reward to ints, never below 1
    this.maxHp = Math.max(1, Math.round(stats.maxHp * hpMul));
    this.hp = this.maxHp;
    this.reward = Math.max(1, Math.round(stats.reward * rwMul));

    this.progress = 0;
    this.isDead = false;
    this.reachedEnd = false;
    this.x = 0;
    this.y = 0;

    // NEW: reset reward flag each reuse from the pool
    this._rewardGranted = false;

    // New generation token each reuse from the pool
    this._gen = (Enemy._nextGen = (Enemy._nextGen || 0) + 1);

    // Reset pathfinding cache
    this._segments = null;
    this._sIndex = 0;
    this._sProgress = 0;
  }

  // Reset for object pooling
  reset() {
    this.isDead = true;
    this.reachedEnd = false;
    this.hp = 0;            // defensive: clearly "not alive" while idle in pool
    this._segments = null;
    this._rewardGranted = false; // NEW: ensure clean when returned to pool
  }

  getEnemyStats(type) {
    const stats = {
      basic: {
        speed: 70,
        radius: 12,
        color: '#e5534b',
        maxHp: 30,
        reward: 10
      },
      fast: {
        speed: 120,
        radius: 8,
        color: '#f85149',
        maxHp: 15,
        reward: 15
      },
      tank: {
        speed: 40,
        radius: 16,
        color: '#8b5cf6',
        maxHp: 80,
        reward: 25
      }
    };
    return stats[type] || stats.basic;
  }

  /**
   * Safe damage application to avoid NaN/float edge-cases and double-rewards.
   * @param {number} dmg
   * @returns {boolean} true if this hit killed the enemy
   */
  takeDamage(dmg) {
    // Coerce to a finite, non-negative number
    const amount = Number.isFinite(dmg) ? Math.max(0, dmg) : 0;
    if (amount <= 0 || this.isDead || this.reachedEnd) return false;

    this.hp -= amount;

    // Use small epsilon to avoid lingering -0.0000001 style cases
    if (this.hp <= 1e-6) {
      this.hp = 0;
      this.isDead = true;
      return true;
    }
    return false;
  }

  update(dt, path) {
    if (this.isDead || this.reachedEnd) return;

    // Build path segments lazily
    if (!this._segments) {
      this._segments = [];
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        const ax = a.x * TILE_SIZE + TILE_SIZE / 2;
        const ay = a.y * TILE_SIZE + TILE_SIZE / 2;
        const bx = b.x * TILE_SIZE + TILE_SIZE / 2;
        const by = b.y * TILE_SIZE + TILE_SIZE / 2;
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy);
        this._segments.push({ ax, ay, bx, by, len, dx, dy });
      }
      this._sIndex = 0;
      this._sProgress = 0;
      if (this._segments.length) {
        this.x = this._segments[0].ax;
        this.y = this._segments[0].ay;
      }
    }

    // Advance along segments
    let remaining = this.speed * dt;
    while (remaining > 0 && this._sIndex < this._segments.length) {
      const s = this._segments[this._sIndex];
      const left = s.len - this._sProgress;
      const step = Math.min(remaining, left);
      const t = (this._sProgress + step) / s.len;
      this.x = s.ax + s.dx * t;
      this.y = s.ay + s.dy * t;
      this._sProgress += step;
      remaining -= step;
      if (this._sProgress >= s.len - 0.0001) {
        this._sIndex++;
        this._sProgress = 0;
      }
    }

    if (this._sIndex >= this._segments.length) {
      this.reachedEnd = true;
    }
  }

  render(g) {
    // health bar
    g.fillStyle = '#000000';
    g.fillRect(this.x - 14, this.y - 20, 28, 4);
    g.fillStyle = '#2ea043';
    const w = Math.max(0, 28 * (this.hp / this.maxHp));
    g.fillRect(this.x - 14, this.y - 20, w, 4);

    // body
    g.beginPath();
    g.fillStyle = this.color;
    g.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    g.fill();

    // outline
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    g.stroke();

    // type indicator
    g.fillStyle = '#ffffff';
    g.font = 'bold 10px system-ui';
    g.textAlign = 'center';
    g.fillText(this.type.charAt(0).toUpperCase(), this.x, this.y + 3);
  }
}
