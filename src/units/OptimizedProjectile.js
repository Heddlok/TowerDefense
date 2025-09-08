// src/units/OptimizedProjectile.js
export class Projectile {
  constructor() { this.reset(); }

  reset() {
    this.x = 0; this.y = 0;
    this.speed = 250;     // px/s
    this.damage = 0;
    this.target = null;   // Enemy reference
    this.hitTarget = false;
    this.done = false;
  }

  // Supports (x, y, target, damage, speed?) OR a config object
  init(a, b, c, d, e) {
    if (typeof a === 'object' && a !== null) {
      const cfg = a;
      this.x = cfg.x | 0; this.y = cfg.y | 0;
      this.target = cfg.target || null;
      this.damage = Number.isFinite(cfg.damage) ? cfg.damage : 0;
      this.speed  = Number.isFinite(cfg.speed)  ? cfg.speed  : 250;
      return;
    }
    this.x = a | 0; this.y = b | 0;
    this.target = c || null;
    this.damage = Number.isFinite(d) ? d : 0;
    this.speed  = Number.isFinite(e) ? e : 250;
  }

  update(dt) {
    if (this.done) return;
    const t = this.target;
    if (!t || t.isDead || t.reachedEnd) { this.done = true; return; }

    const dx = t.x - this.x, dy = t.y - this.y;
    const dist = Math.hypot(dx, dy) || 1e-6;

    // Hit if within small radius
    if (dist <= 8) { this.hitTarget = true; this.done = true; return; }

    const step = this.speed * dt;
    if (step >= dist) { this.x = t.x; this.y = t.y; this.hitTarget = true; this.done = true; return; }
    this.x += (dx / dist) * step; this.y += (dy / dist) * step;
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
