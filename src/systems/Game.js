// systems/Game.js
import { createPath, TILE_SIZE, GRID_COLS, GRID_ROWS } from '../world/map.js';
import { Enemy } from '../units/Enemy.js';
import { Tower } from '../units/Tower.js';
import { Projectile } from '../units/OptimizedProjectile.js';
import { SoundManager } from '../audio/SoundManager.js';
import { ObjectPool } from '../utils/ObjectPool.js';
import { SpatialGrid } from '../utils/SpatialGrid.js';
import { PerformanceMonitor } from '../utils/PerformanceMonitor.js';
import { getWavePlan, getWaveScaling } from './Difficulty.js';

// ---------- Path helpers (Manhattan-only) ----------
const _k = (x, y) => `${x},${y}`;

function expandToOrthogonalPath(nodes) {
  const out = [];
  if (!Array.isArray(nodes) || nodes.length === 0) return out;

  const xi = (p) => (p && typeof p.x === 'number' ? (p.x | 0) : 0);
  const yi = (p) => (p && typeof p.y === 'number' ? (p.y | 0) : 0);

  let x0 = xi(nodes[0]), y0 = yi(nodes[0]);
  out.push({ x: x0, y: y0 });

  for (let i = 1; i < nodes.length; i++) {
    const x1 = xi(nodes[i]), y1 = yi(nodes[i]);
    if (x0 !== x1) {
      const sx = x0 < x1 ? 1 : -1;
      for (let x = x0 + sx; x !== x1 + sx; x += sx) out.push({ x, y: y0 });
    }
    if (y0 !== y1) {
      const sy = y0 < y1 ? 1 : -1;
      for (let y = y0 + sy; y !== y1 + sy; y += sy) out.push({ x: x1, y });
    }
    x0 = x1; y0 = y1;
  }
  return out;
}

function maskFromSteps(steps) {
  const s = new Set();
  for (const n of steps) s.add(_k(n.x | 0, n.y | 0));
  return s;
}

export class Game {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.time = 0;

    this.money = 100;
    this.lives = 20;
    this.wave = 0;
    this.gameOver = false;
    this.phase = 'planning'; // 'planning' | 'combat'
    this.planningTime = 5.0;
    this.spawning = false;

    // Track wave spawn accounting for "enemies left" UI
    this.waveTotalToSpawn = 0; // total scheduled for this wave
    this.waveSpawned = 0;      // how many we've spawned so far

    // ---- Path setup ----
    this._cornerNodes = createPath();
    this.path = expandToOrthogonalPath(this._cornerNodes);
    this.pathMask = maskFromSteps(this.path);

    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.hoverTile = null;

    this.selectedTowerType = null;
    this.sellMode = false;
    this.upgradeMode = false;
    this.selectedTower = null;
    this._muted = false;
    this.soundManager = new SoundManager();

    // Perf / spatial
    this.perfMonitor = new PerformanceMonitor();
    this.spatialGrid = new SpatialGrid(canvas.width, canvas.height, TILE_SIZE);
    this.currentRenderScale = 1;

    // Pools
    this.enemyPool = new ObjectPool(() => new Enemy(), (e) => e.reset(), 20);
    this.projectilePool = new ObjectPool(() => new Projectile(), (p) => p.reset(), 50);

    Tower.resetCounts();

    // Events
    this._onMouseMove = (e) => this.onMouseMove(e);
    this._onClick = (e) => this.onClick(e);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('click', this._onClick);

    const hi = document.getElementById('hoverInfo');
    if (hi) { hi.style.pointerEvents = 'none'; hi.style.userSelect = 'none'; }
  }

  // ---------- Money helpers ----------
  addMoney(amount) {
    const a = Number.isFinite(amount) ? amount : 0;
    this.money = Math.max(0, this.money + a);
    return this.money;
  }
  trySpend(cost) {
    const c = Number.isFinite(cost) ? cost : 0;
    if (this.money >= c) { this.money -= c; return true; }
    return false;
  }

  // ---------- Upgrade pricing ----------
  getUpgradeCost(tower, stat) {
    // Simple, readable formula: 25 base + 15 per current level
    const base = 25, inc = 15;
    const level =
      stat === 'damage'   ? (tower.damageLevel   ?? 0) :
      stat === 'range'    ? (tower.rangeLevel    ?? 0) :
      stat === 'fireRate' ? (tower.fireRateLevel ?? 0) : 0;
    return base + inc * level;
  }

  // ---------- UI ----------
  selectTower(type) {
    this.selectedTowerType = type;
    this.sellMode = false;
    this.upgradeMode = false;
    this.selectedTower = null;
    this.updateUI();
  }
  toggleSellMode() {
    this.sellMode = !this.sellMode;
    if (this.sellMode) {
      this.upgradeMode = false;
      this.selectedTowerType = null;
      this.selectedTower = null;
      this.hideUpgradePanel();
    }
    this.updateUI();
  }
  toggleUpgradeMode() {
    this.upgradeMode = !this.upgradeMode;
    if (this.upgradeMode) {
      this.sellMode = false;
      this.selectedTowerType = null;
    } else {
      this.selectedTower = null;
      this.hideUpgradePanel();
    }
    this.updateUI();
  }
  toggleSound() {
    this._muted = !this._muted;
    if (typeof this.soundManager?.setMuted === 'function') this.soundManager.setMuted(this._muted);
    else if (this.soundManager) this.soundManager.muted = this._muted;
    const btn = document.getElementById('soundToggleBtn');
    if (btn) btn.textContent = this._muted ? 'Sound: Off' : 'Sound: On';
  }

  // Populate/refresh the upgrade panel from live state
  showUpgradePanel(t = this.selectedTower) {
    const p = document.getElementById('upgradePanel');
    if (!p || !t) return;
    p.style.display = 'block';

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };

    // Current stats
    set('currentDamage', t.damage ?? 0);
    set('currentRange',  Math.round(t.range ?? (TILE_SIZE*2)));
    set('currentFireRate', (t.fireRate ?? 0).toFixed(2));
    set('sellValue', t.getSellValue?.() ?? Math.floor((t.purchasePrice ?? 0) * 0.75));

    // Costs
    const dmgCost  = this.getUpgradeCost(t, 'damage');
    const rngCost  = this.getUpgradeCost(t, 'range');
    const frCost   = this.getUpgradeCost(t, 'fireRate');
    set('damageCost', dmgCost);
    set('rangeCost',  rngCost);
    set('fireRateCost', frCost);

    // Button states (visual-only)
    const max = t.maxUpgradeLevel ?? 5;
    const lockBtn = (btnId, unaffordableOrMax) => {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.classList.toggle('unaffordable', !!unaffordableOrMax);
      btn.setAttribute('aria-disabled', unaffordableOrMax ? 'true' : 'false');
    };
    lockBtn('upgradeDamageBtn', (t.damageLevel   ?? 0) >= max || this.money < dmgCost);
    lockBtn('upgradeRangeBtn',  (t.rangeLevel    ?? 0) >= max || this.money < rngCost);
    lockBtn('upgradeFireRateBtn', (t.fireRateLevel ?? 0) >= max || this.money < frCost);
  }
  hideUpgradePanel() { const p = document.getElementById('upgradePanel'); if (p) p.style.display = 'none'; }

  upgradeTower(stat) {
    const t = this.selectedTower;
    if (!t) return;

    const level =
      stat === 'damage'   ? (t.damageLevel   ?? 0) :
      stat === 'range'    ? (t.rangeLevel    ?? 0) :
      stat === 'fireRate' ? (t.fireRateLevel ?? 0) : 0;

    const max = t.maxUpgradeLevel ?? 5;
    if (level >= max) { this.showUpgradePanel(t); return; }

    const cost = this.getUpgradeCost(t, stat);
    if (!this.trySpend(cost)) { this.showUpgradePanel(t); return; }

    // Apply the upgrade
    if (typeof t.upgrade === 'function') t.upgrade(stat);
    else if (typeof t.tryUpgrade === 'function') t.tryUpgrade(stat);
    else {
      if (stat === 'damage')   t.damage   = Math.round((t.damage ?? 5) * 1.25);
      if (stat === 'range')   { t.range   = Math.round((t.range ?? (TILE_SIZE * 2)) * 1.10); t.range2 = t.range * t.range; }
      if (stat === 'fireRate') t.fireRate = +((t.fireRate ?? 1) * 1.20).toFixed(3);
    }

    // Feedback and refresh
    this.soundManager.playShoot?.(); // light “tick” feedback
    this.showUpgradePanel(t);
    this.updateUI();
  }

  // ---------- Placement ----------
  isOnPathTile(tx, ty) { return this.pathMask.has(_k(tx, ty)); }
  canBuildHere(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= GRID_COLS || ty >= GRID_ROWS) return false;
    if (this.isOnPathTile(tx, ty)) return false;
    if (this.towers.some(t => t.tx === tx && t.ty === ty)) return false;
    return true;
  }

  // ---------- Core loop ----------
  update(ts) {
    if (this.gameOver) { this.updateUI(); return; }
    this.time = ts;
    this.perfMonitor.update();

    const statsForInput = this.perfMonitor.getStats();
    this.currentRenderScale = statsForInput && Number.isFinite(statsForInput.renderScale)
      ? Math.max(0.001, statsForInput.renderScale) : 1;

    this.updateUI();

    if (this.phase === 'planning') {
      this.planningTime -= 1 / 60;
      if (this.planningTime <= 0) this.startWave();
    }

    if (!this.gameOver && this.phase === 'combat') {
      if (!this.spawning && this.enemies.length === 0) {
        this.phase = 'planning';
        this.planningTime = 5.0;
      }
    }

    // Enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.update(1 / 60, this.path);

      if (enemy.reachedEnd) {
        this.lives -= 1;
        enemy.isDead = true;
        if (this.lives <= 0) {
          this.gameOver = true;
          this.soundManager.playGameOver();
        }
      }

      // --- PAYOUT SAFEGUARD ---
      if (enemy.isDead) {
        if (!enemy.reachedEnd && !enemy._rewardGranted) {
          const reward = Math.max(0, enemy.reward | 0);
          if (reward > 0) {
            this.addMoney(reward);
            enemy._rewardGranted = true;
            this.soundManager.playEnemyDeath?.();
          }
        }
        this.enemyPool.release(enemy);
        this.enemies.splice(i, 1);
      }
    }

    // Keep grid up-to-date
    this.spatialGrid.clear();
    for (const e of this.enemies) this.spatialGrid.insert(e);

    // ---------- Towers & Projectiles (combat only) ----------
    if (this.phase === 'combat') {
      for (const t of this.towers) {
        const shot = t.update(1 / 60, this.enemies, this.projectiles, /*spatialGrid*/ null, /*projectilePool*/ null);
        if (shot) this.soundManager.playShoot();
      }

      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];

        if (typeof p.update === 'function') {
          p.update(1 / 60);
        } else {
          p.done = true;
          p.hitTarget = true;
        }

        if (p.hitTarget && p.target && !p.target.isDead && !p.target.reachedEnd) {
          const killed = (typeof p.target.takeDamage === 'function')
            ? p.target.takeDamage(p.damage)
            : ((p.target.hp -= (Number.isFinite(p.damage) ? Math.max(0, p.damage) : 0)),
              (p.target.hp <= 1e-6 ? (p.target.hp = 0, p.target.isDead = true, true) : false));

          if (killed && !p.target._rewardGranted) {
            this.addMoney(Math.max(0, p.target.reward | 0));
            p.target._rewardGranted = true;
            this.soundManager.playEnemyDeath();
          }
          p.done = true;
        }

        if (p.done) {
          if (typeof p.reset === 'function') this.projectilePool.release(p);
          this.projectiles.splice(i, 1);
        }
      }
    }
  }

  render() {
    const g = this.ctx;
    const stats = this.perfMonitor.getStats();

    this.currentRenderScale = stats && Number.isFinite(stats.renderScale)
      ? Math.max(0.001, stats.renderScale) : 1;

    if (stats.renderScale < 1.0) { g.save(); g.scale(stats.renderScale, stats.renderScale); }

    g.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Grid + path tiles
    g.fillStyle = '#0e1520';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        const px = x * TILE_SIZE, py = y * TILE_SIZE;
        g.strokeStyle = '#1f2836';
        g.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        if (this.isOnPathTile(x, y)) {
          g.fillStyle = '#2b3a4f';
          g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // Path outline
    g.strokeStyle = '#3b516f';
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < this.path.length; i++) {
      const n = this.path[i];
      const cx = n.x * TILE_SIZE + TILE_SIZE / 2;
      const cy = n.y * TILE_SIZE + TILE_SIZE / 2;
      if (i === 0) g.moveTo(cx, cy); else g.lineTo(cx, cy);
    }
    g.stroke();

    // Entities
    for (const t of this.towers) t.render(g);
    for (const e of this.enemies) e.render(g);

    // Safe projectile render
    for (const p of this.projectiles) {
      if (typeof p.render === 'function') {
        p.render(g);
      } else {
        g.save();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(p.x ?? 0, p.y ?? 0, 2, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }

    // Hover
    this.renderHover(g);

    if (this.gameOver) {
      g.save();
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
      g.fillStyle = '#ffffff';
      g.font = 'bold 42px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      g.textAlign = 'center';
      g.fillText('Game Over', this.canvas.width / 2, this.canvas.height / 2 - 10);
      g.font = '16px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      g.fillText('Refresh the page to restart', this.canvas.width / 2, this.canvas.height / 2 + 24);
      g.restore();
    }

    if (stats.renderScale < 1.0) g.restore();
  }

  // ---- NEW: compute total enemies left in this wave (alive + not-yet-spawned)
  getEnemiesLeftInWave() {
    if (this.phase !== 'combat' && !this.spawning) return 0;
    const remainingToSpawn = Math.max(0, (this.waveTotalToSpawn | 0) - (this.waveSpawned | 0));
    return Math.max(0, remainingToSpawn + this.enemies.length);
  }

  updateUI() {
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
    setText('money', this.money);
    setText('lives', this.lives);
    setText('wave', this.wave);
    setText('upgradeModeBtn', `Upgrade: ${this.upgradeMode ? 'On' : 'Off'}`);
    setText('sellModeBtn',    `Sell: ${this.sellMode ? 'On' : 'Off'}`);

    const planningEl = document.getElementById('planning');
    if (planningEl) planningEl.textContent = this.phase === 'planning' ? `${Math.max(0, this.planningTime).toFixed(1)}s` : '—';

    // ⬇️ Replaced FPS with Enemies Left in Wave
    setText('enemyCount', this.getEnemiesLeftInWave());

    // ---- Tower purchase buttons (visual-only disable) ----
    const btnFor = (type) =>
      document.querySelector(`.tower-btn[data-tower="${type}"]`) ||
      document.getElementById(`${type}TowerBtn`);

    const syncBuyBtn = (type) => {
      const btn = btnFor(type);
      if (!btn) return;
      const c = Tower.getNextTowerCost(type);
      const n = Tower.towerCounts[type] ?? 0;
      const label = type[0].toUpperCase() + type.slice(1);
      const unaffordable = this.gameOver || this.money < c;

      btn.textContent = `${label} (${c}) [${n} built]`;
      btn.classList.toggle('unaffordable', unaffordable);
      btn.setAttribute('aria-disabled', unaffordable ? 'true' : 'false');
    };
    syncBuyBtn('basic'); syncBuyBtn('rapid'); syncBuyBtn('heavy');

    // Keep the upgrade panel live with money changes
    if (this.selectedTower && this.upgradeMode) this.showUpgradePanel(this.selectedTower);
  }

  screenToTile(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    let mx = (e.clientX - rect.left) * scaleX;
    let my = (e.clientY - rect.top) * scaleY;

    const rs = this.currentRenderScale || 1;
    if (rs !== 1) { mx /= rs; my /= rs; }

    const tx = Math.floor(mx / TILE_SIZE);
    const ty = Math.floor(my / TILE_SIZE);
    const cssX = (e.clientX - rect.left);
    const cssY = (e.clientY - rect.top);
    return { tx, ty, mx, my, cssX, cssY };
  }

  onMouseMove(e) {
    const { tx, ty, cssX, cssY } = this.screenToTile(e);
    const hoverInfo = document.getElementById('hoverInfo');
    if (hoverInfo) {
      hoverInfo.style.pointerEvents = 'none';
      hoverInfo.style.userSelect = 'none';
      if (this.selectedTowerType) {
        hoverInfo.style.display = 'block'; hoverInfo.style.left = `${cssX + 12}px`; hoverInfo.style.top = `${cssY + 12}px`;
        hoverInfo.textContent = 'Place tower';
      } else if (this.sellMode) {
        hoverInfo.style.display = 'block'; hoverInfo.style.left = `${cssX + 12}px`; hoverInfo.style.top = `${cssY + 12}px`;
        hoverInfo.textContent = 'Sell tower';
      } else {
        hoverInfo.style.display = 'none';
      }
    }
    this.hoverTile = { x: tx, y: ty };
  }

  onClick(e) {
    if (this.gameOver) return;
    const { tx, ty } = this.screenToTile(e);

    if (this.sellMode) {
      const idx = this.towers.findIndex(t => t.tx === tx && t.ty === ty);
      if (idx >= 0) {
        const [sold] = this.towers.splice(idx, 1);
        this.addMoney(sold.getSellValue());
        if (typeof Tower.registerSell === 'function') {
          Tower.registerSell(sold.type);
        } else if (Tower.towerCounts && sold.type in Tower.towerCounts) {
          Tower.towerCounts[sold.type] = Math.max(0, (Tower.towerCounts[sold.type] | 0) - 1);
        }
      }
      return;
    }

    if (this.upgradeMode) {
      const tower = this.towers.find(t => t.tx === tx && t.ty === ty);
      if (tower) { this.selectedTower = tower; this.showUpgradePanel(tower); }
      else { this.selectedTower = null; this.hideUpgradePanel(); }
      return;
    }

    if (!this.selectedTowerType) return;
    if (!this.canBuildHere(tx, ty)) return;

    const type = this.selectedTowerType;
    const cost = Tower.getNextTowerCost(type);
    if (!this.trySpend(cost)) return;

    const t = new Tower(tx, ty, type, cost);
    this.towers.push(t);

    if (typeof Tower.registerPurchase === 'function') {
      Tower.registerPurchase(type);
    } else if (Tower.towerCounts && type in Tower.towerCounts) {
      Tower.towerCounts[type] = (Tower.towerCounts[type] | 0) + 1;
    }

    this.soundManager.playTowerPlace();
  }

  startWave() {
    if (this.gameOver) return;
    try {
      this.phase = 'combat';
      this.wave += 1;
      this.soundManager.playWaveStart();

      const s = getWaveScaling?.(this.wave) || {};
      const scaling = {
        hpMul:     Number.isFinite(s.hpMul)     ? s.hpMul     : 1,
        speedMul:  Number.isFinite(s.speedMul)  ? s.speedMul  : 1,
        rewardMul: Number.isFinite(s.rewardMul) ? s.rewardMul : 1,
      };

      const p = getWavePlan?.(this.wave) || {};
      const plan = {
        count:      Number.isFinite(p.count)      ? p.count      : 10,
        interval:   Number.isFinite(p.interval)   ? p.interval   : 1.0,
        burstBonus: Number.isFinite(p.burstBonus) ? p.burstBonus : 0,
      };

      let weights;
      if (this.wave <= 3) {
        weights = { basic: 1, fast: 0, tank: 0 };
      } else {
        const t = Math.max(0, this.wave - 3);
        let fastW = Math.min(0.40, 0.05 + 0.02 * t);
        let tankW = Math.min(0.35, 0.015 * Math.max(0, t - 2));
        let basicW = Math.max(0.15, 1 - fastW - tankW);
        const sum = basicW + fastW + tankW || 1;
        weights = { basic: basicW / sum, fast: fastW / sum, tank: tankW / sum };
      }

      const pickType = () => {
        if (this.wave <= 3) return 'basic';
        const a = Math.max(0, weights.basic || 0);
        const b = Math.max(0, weights.fast  || 0);
        const c = Math.max(0, weights.tank  || 0);
        const sum = a + b + c || 1;
        const r = Math.random() * sum;
        return (r < a) ? 'basic' : (r < a + b) ? 'fast' : 'tank';
      };

      const totalToSpawn = Math.max(0, (plan.count || 0) + (plan.burstBonus || 0));

      // record totals for "enemies left" UI
      this.waveTotalToSpawn = totalToSpawn;
      this.waveSpawned = 0;

      if (totalToSpawn === 0) {
        this.spawning = false;
        this.phase = 'planning';
        this.planningTime = 5.0;
        return;
      }

      let spawned = 0;
      this.spawning = true;

      const spawnOne = () => {
        if (this.gameOver) { this.spawning = false; return; }
        if (spawned >= totalToSpawn) { this.spawning = false; return; }

        let type = pickType();
        if (this.wave <= 3) type = 'basic';

        const enemy = this.enemyPool.get();

        if (enemy.init.length >= 3) enemy.init(type, scaling, this.path);
        else enemy.init(type, scaling);
        if (typeof enemy.setPath === 'function') enemy.setPath(this.path);
        else enemy.path = this.path;

        // hard reset payout guard
        enemy._rewardGranted = false;

        this.enemies.push(enemy);
        spawned++;
        this.waveSpawned++; // keep class-level count in sync

        const jitter = (Math.random() * 0.12) - 0.06;
        const base = Number.isFinite(plan.interval) ? plan.interval : 1.0;
        const intervalSec = Math.max(0.10, base + jitter);
        setTimeout(spawnOne, intervalSec * 1000);
      };

      spawnOne();
    } catch (err) {
      console.error('startWave failed:', err);
      this.spawning = false;
      this.phase = 'planning';
      this.planningTime = 5.0;
    }
  }

  renderHover(g) {
    if (!this.hoverTile) return;
    const { x, y } = this.hoverTile;
    g.save();
    g.strokeStyle = '#d29922';
    g.lineWidth = 2;
    g.strokeRect(x * TILE_SIZE + 1, y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    g.restore();
  }

  destroy() {
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('click', this._onClick);
  }
}
