export class Projectile {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.target = null;
    this.speed = 250;
    this.damage = 15;
    this.radius = 3;
    this.color = '#ffd866';
    this.done = false;
    this.hitTarget = false;
  }

  init(x, y, target, damage = 15, speed = 250, color = '#ffd866') {
    this.x = x;
    this.y = y;
    this.target = target;
    this.speed = Number.isFinite(speed) ? speed : 250;
    this.damage = Number.isFinite(damage) ? damage : 15;
    this.color = color || '#ffd866';
    this.done = false;
    this.hitTarget = false;
  }

  reset() {
    // Pool-safe: make sure flags won't leak across reuses
    this.done = true;
    this.hitTarget = false;
    this.target = null;
  }

  update(dt) {
    if (this.done) return;

    // If target is gone or no longer valid, retire the projectile
    if (!this.target || this.target.isDead || this.target.reachedEnd) {
      this.done = true;
      return;
    }

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);

    // Dynamic hit radius: projectile + enemy radii (+ small slop)
    const hitR = (this.radius || 0) + (this.target.radius || 0) + 1;
    const step = this.speed * dt;

    // Register hit if we're already close enough OR will overshoot this frame
    if (dist <= Math.max(1e-6, hitR) || step >= dist) {
      // snap to target for clean visuals
      this.x = this.target.x;
      this.y = this.target.y;
      this.hitTarget = true;
      this.done = true;
      return;
    }

    // Advance toward target
    const ux = dx / dist;
    const uy = dy / dist;
    this.x += ux * step;
    this.y += uy * step;
  }

  render(g) {
    g.beginPath();
    g.fillStyle = this.color;
    g.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    g.fill();
  }
}
