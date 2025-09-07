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
    this.speed = speed;
    this.damage = damage;
    this.color = color;
    this.done = false;
    this.hitTarget = false;
  }

  reset() {
    this.done = true;
    this.target = null;
  }

  update(dt) {
    if (this.done) return;
    if (!this.target || this.target.isDead || this.target.reachedEnd) { 
      this.done = true; 
      return; 
    }
    
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    
    if (dist < 6) {
      this.done = true;
      this.hitTarget = true;
      return;
    }
    
    const ux = dx / dist;
    const uy = dy / dist;
    this.x += ux * this.speed * dt;
    this.y += uy * this.speed * dt;
  }

  render(g) {
    g.beginPath();
    g.fillStyle = this.color;
    g.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    g.fill();
  }
}
