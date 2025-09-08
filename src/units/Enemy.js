// src/units/Enemy.js
import { TILE_SIZE } from '../world/map.js';

export class Enemy {
  constructor() { this.reset(); }

  reset() {
    this.type = 'basic';
    this.x = 0; this.y = 0;           // ALWAYS PIXELS (center)
    this.w = TILE_SIZE * 0.8;         // for render/centering if needed
    this.h = TILE_SIZE * 0.8;

    this.maxHp = 1;
    this.hp = 1;
    this.speed = 60;                   // px/s
    this.reward = 1;

    this.isDead = false;
    this.reachedEnd = false;

    this.path = null;                  // array of {x,y} in TILES
    this.seg = 0;                      // moving from path[seg-1] -> path[seg]
    this._tx = 0; this._ty = 0;        // current target (pixels)
  }

  _tileCenterPx(t) {
    return { x: t.x * TILE_SIZE + TILE_SIZE / 2, y: t.y * TILE_SIZE + TILE_SIZE / 2 };
  }

  setPath(path) {
    this.path = Array.isArray(path) ? path : null;
    if (!this.path || this.path.length < 2) {
      this.reachedEnd = true;
      return;
    }
    const a = this._tileCenterPx(this.path[0]);
    const b = this._tileCenterPx(this.path[1]);
    this.x = a.x; this.y = a.y;        // start in PIXELS
    this.seg = 1;
    this._tx = b.x; this._ty = b.y;
  }

  init(type, scaling = {}, path) {
    this.reset();
    this.type = type || 'basic';

    const base = {
      basic: { hp: 30,  speed: 70,  reward: 5 },
      fast:  { hp: 20,  speed: 120, reward: 6 },
      tank:  { hp: 120, speed: 45,  reward: 10 },
    }[this.type] || { hp: 30, speed: 70, reward: 5 };

    const hpMul     = Number.isFinite(scaling.hpMul)     ? scaling.hpMul     : 1;
    const speedMul  = Number.isFinite(scaling.speedMul)  ? scaling.speedMul  : 1;
    const rewardMul = Number.isFinite(scaling.rewardMul) ? scaling.rewardMul : 1;

    this.maxHp = Math.max(1, Math.round(base.hp * hpMul));
    this.hp    = this.maxHp;
    this.speed = Math.max(1, base.speed * speedMul);
    this.reward = Math.max(0, Math.round(base.reward * rewardMul));

    if (path) this.setPath(path);
  }

  takeDamage(dmg) {
    const d = Number.isFinite(dmg) ? Math.max(0, dmg) : 0;
    this.hp -= d;
    if (this.hp <= 0) {
      this.hp = 0; this.isDead = true;
      return true;
    }
    return false;
  }

  update(dt, pathFromCaller) {
    if (this.isDead || this.reachedEnd) return;

    if (!this.path) {
      if (pathFromCaller) this.setPath(pathFromCaller);
      if (!this.path) return;
    }

    // Move toward current target (pixel)
    const dx = this._tx - this.x;
    const dy = this._ty - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= 0.0001) {
      // advance to next node
      this.seg++;
      if (this.seg >= this.path.length) { this.reachedEnd = true; return; }
      const n = this._tileCenterPx(this.path[this.seg]);
      this._tx = n.x; this._ty = n.y;
      return; // step next frame
    }

    const step = this.speed * dt;
    if (step >= dist) {
      this.x = this._tx; this.y = this._ty;
      return;
    }

    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
  }

  render(g) {
    g.save();
    g.fillStyle = this.type === 'fast' ? '#ff6d6d' : (this.type === 'tank' ? '#c050ff' : '#ff5a5a');
    g.beginPath();
    g.arc(this.x, this.y, 10, 0, Math.PI * 2);
    g.fill();

    // HP bar
    const bw = 22, bh = 4, yOff = 16;
    const frac = this.maxHp ? Math.max(0, this.hp / this.maxHp) : 0;
    g.fillStyle = '#2b2b2b';
    g.fillRect(this.x - bw/2, this.y - yOff, bw, bh);
    g.fillStyle = '#3ecf8e';
    g.fillRect(this.x - bw/2, this.y - yOff, bw * frac, bh);

    // Label
    g.fillStyle = '#fff';
    g.font = '10px system-ui, -apple-system';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText((this.type[0] || 'B').toUpperCase(), this.x, this.y);
    g.restore();
  }
}
