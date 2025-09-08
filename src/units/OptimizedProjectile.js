// units/OptimizedProjectile.js
import { TILE_SIZE, GRID_COLS, GRID_ROWS } from '../world/map.js';

function enemyCenterPx(e) {
  if (!e) return null;
  // Prefer explicit fields if present
  if (Number.isFinite(e.px) && Number.isFinite(e.py)) return { x: e.px, y: e.py };
  if (Number.isFinite(e.cx) && Number.isFinite(e.cy)) return { x: e.cx, y: e.cy };
  if (Number.isFinite(e.centerX) && Number.isFinite(e.centerY)) return { x: e.centerX, y: e.centerY };

  // x/y: either pixels or tiles
  if (Number.isFinite(e.x) && Number.isFinite(e.y)) {
    const x = e.x, y = e.y;
    const nearInt = (v) => Math.abs(v - Math.round(v)) < 1e-3;
    const looksTile = x >= 0 && y >= 0 && x < GRID_COLS && y < GRID_ROWS && nearInt(x) && nearInt(y);
    if (looksTile) return { x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 };
    if (Number.isFinite(e.w) && Number.isFinite(e.h)) return { x: x + e.w / 2, y: y + e.h / 2 };
    return { x, y };
  }
  if (e.pos && Number.isFinite(e.pos.x) && Number.isFinite(e.pos.y)) return { x: e.pos.x, y: e.pos.y };
  if (e.position && Number.isFinite(e.position.x) && Number.isFinite(e.position.y)) return { x: e.position.x, y: e.position.y };
  return null;
}

export class Projectile {
  constructor() { this.reset(); }

  reset() {
    this.x = 0; this.y = 0;
    this.speed = 250;
    this.damage = 0;
    this.target = null;
    this.hitTarget = false;
    this.done = false;
  }

  // Supports (x, y, target, damage, speed?) OR a single config object
  init(a, b, c, d, e) {
    if (typeof a === 'object' && a !== null) {
      const cfg = a;
      this.x = cfg.x | 0; this.y = cfg.y | 0;
      this.target = cfg.target || null;
      this.damage = Number.isFinite(cfg.damage) ? cfg.damage : 0;
      this.speed  = Number.isFinite(cfg.speed)  ? cfg.speed  : 250;
      return;
    }
    this.x = a | 0;
    this.y = b | 0;
    this.target = c || null;
    this.damage = Number.isFinite(d) ? d : 0;
    this.speed  = Number.isFinite(e) ? e : 250;
  }

  update(dt) {
    if (this.done) return;

    // Validate target
    if (!this.target || this.target.isDead || this.target.reachedEnd) {
      this.done = true;
      return;
    }

    const tc = enemyCenterPx(this.target);
    if (!tc) { this.done = true; return; }

    const dx = tc.x - this.x;
    const dy = tc.y - this.y;
    const dist = Math.hypot(dx, dy) || 1e-6;

    // Hit threshold (a small radius so fast bullets still connect)
    const hitRadius = 8;
    if (dist <= hitRadius) {
      this.hitTarget = true;
      this.done = true;
      return;
    }

    // Advance toward target
    const step = this.speed * dt;
    const ux = dx / dist, uy = dy / dist;
    const nx = this.x + ux * step;
    const ny = this.y + uy * step;

    // If we would overshoot, clamp to near target and mark hit
    if (step >= dist) {
      this.x = tc.x; this.y = tc.y;
      this.hitTarget = true;
      this.done = true;
      return;
    }

    this.x = nx; this.y = ny;
  }

  render(g) {
    g.save();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(this.x, this.y, 2, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}
