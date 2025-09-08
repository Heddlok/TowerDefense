// systems/Game.js
import { createPath, TILE_SIZE, GRID_COLS, GRID_ROWS, isOnPath } from '../world/map.js';
import { Enemy } from '../units/Enemy.js';
import { Tower } from '../units/Tower.js';
import { Projectile } from '../units/OptimizedProjectile.js';
import { SoundManager } from '../audio/SoundManager.js';
import { ObjectPool } from '../utils/ObjectPool.js';
import { SpatialGrid } from '../utils/SpatialGrid.js';
import { PerformanceMonitor } from '../utils/PerformanceMonitor.js';
import { getWavePlan, getWaveScaling } from './Difficulty.js';

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
    this.planningTime = 5.0; // seconds between waves
    this.spawning = false; // true while current wave is still spawning

    this.path = createPath();
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

    // Performance optimizations
    this.perfMonitor = new PerformanceMonitor();
    this.spatialGrid = new SpatialGrid(canvas.width, canvas.height, TILE_SIZE);
    this.currentRenderScale = 1; // track current scale for accurate input mapping

    // Object pools
    this.enemyPool = new ObjectPool(
      () => new Enemy(),
      (enemy) => enemy.reset(),
      20
    );

    this.projectilePool = new ObjectPool(
      () => new Projectile(),
      (proj) => proj.reset(),
      50
    );

    // Reset tower counts when starting a new game
    Tower.resetCounts();

    // Events
    this._onMouseMove = (e) => this.onMouseMove(e);
    this._onClick = (e) => this.onClick(e);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('click', this._onClick);

    // Ensure hover tooltip never blocks clicks/taps
    const hi = document.getElementById('hoverInfo');
    if (hi) {
      hi.style.pointerEvents = 'none';
      hi.style.userSelect = 'none';
    }
  }

  // -----------------------------
  // UI-FACING METHODS (used by main.js)
  // -----------------------------

  selectTower(type) {
    this.selectedTowerType = type;
    // Avoid conflicting modes while placing
    this.sellMode = false;
    this.upgradeMode = false;
    this.selectedTower = null;
    this.updateUI();
  }

  toggleSellMode() {
    this.sellMode = !this.sellMode;
    if (this.sellMode) {
      this.upgradeMode = false;
      this.selectedTowerType = null; // do not place while selling
      this.selectedTower = null;
      this.hideUpgradePanel();
    }
    this.updateUI();
  }

  toggleUpgradeMode() {
    this.upgradeMode = !this.upgradeMode;
    if (this.upgradeMode) {
      this.sellMode = false;
      this.selectedTowerType = null; // upgrades target existing towers
    } else {
      this.selectedTower = null;
      this.hideUpgradePanel();
    }
    this.updateUI();
  }

  toggleSound() {
    this._muted = !this._muted;
    if (typeof this.soundManager?.setMuted === 'function') {
      this.soundManager.setMuted(this._muted);
    } else if (this.soundManager) {
      this.soundManager.muted = this._muted;
    }
    const btn = document.getElementById('soundToggleBtn');
    if (btn) btn.textContent = this._muted ? 'Sound: Off' : 'Sound: On';
  }

  // Acts on the currently selected tower (selected via click while in upgrade mode)
  upgradeTower(stat) {
    const t = this.selectedTower;
    if (!t) return;

    // Prefer tower's own upgrade API if present
    if (typeof t.upgrade === 'function') {
      t.upgrade(stat);
    } else if (typeof t.tryUpgrade === 'function') {
      t.tryUpgrade(stat);
    } else {
      // Fallback: simple inline upgrades
      switch (stat) {
        case 'damage':
          t.damage = (t.damage ?? 5) + 1;
          break;
        case 'range':
          t.range = (t.range ?? (TILE_SIZE * 2)) + TILE_SIZE * 0.25;
          break;
        case 'fireRate':
          // lower fireRate = faster shooting (if that's your API)
          t.fireRate = Math.max(0.05, (t.fireRate ?? 1) * 0.9);
          break;
      }
    }

    this.showUpgradePanel(t); // keep panel visible/updated
    this.updateUI();
  }

  showUpgradePanel(/* tower */) {
    const panel = document.getElementById('upgradePanel');
    if (panel) panel.style.display = 'block';
  }

  hideUpgradePanel() {
    const panel = document.getElementById('upgradePanel');
    if (panel) panel.style.display = 'none';
  }

  // -----------------------------
  // CORE LOOP
  // -----------------------------

  update(ts) {
    if (this.gameOver) { this.updateUI(); return; }
    this.time = ts;
    this.perfMonitor.update();

    // Keep a fresh copy of renderScale each frame for input mapping
    const statsForInput = this.perfMonitor.getStats();
    this.currentRenderScale = statsForInput && Number.isFinite(statsForInput.renderScale)
      ? Math.max(0.001, statsForInput.renderScale) : 1;

    this.updateUI();

    // planning timer
    if (this.phase === 'planning') {
      this.planningTime -= 1 / 60;
      if (this.planningTime <= 0) {
        this.startWave();
      }
    }

    // transition back to planning only after combat fully clears
    if (!this.gameOver && this.phase === 'combat') {
      if (!this.spawning && this.enemies.length === 0) {
        this.phase = 'planning';
        this.planningTime = 5.0;
      }
    }

    // --- Update enemies first (positions/state) ---
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

      if (enemy.isDead) {
        this.enemyPool.release(enemy);
        this.enemies.splice(i, 1);
      }
    }

    // --- Rebuild spatial grid with current positions (no 1-frame lag) ---
    this.spatialGrid.clear();
    for (const enemy of this.enemies) {
      this.spatialGrid.insert(enemy);
    }

    // towers acquire targets and shoot with spatial optimization
    for (const tower of this.towers) {
      const shot = tower.update(1 / 60, this.enemies, this.projectiles, this.spatialGrid, this.projectilePool);
      if (shot) {
        this.soundManager.playShoot();
      }
    }

    // projectiles with object pooling
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(1 / 60);

      if (p.hitTarget && p.target && !p.target.isDead && !p.target.reachedEnd) {
        const killed = (typeof p.target.takeDamage === 'function')
          ? p.target.takeDamage(p.damage)
          : ((p.target.hp -= (Number.isFinite(p.damage) ? Math.max(0, p.damage) : 0)),
            (p.target.hp <= 1e-6 ? (p.target.hp = 0, p.target.isDead = true, true) : false));

        if (killed && !p.target._rewardGranted) {
          this.money += Math.max(0, p.target.reward | 0);
          p.target._rewardGranted = true;
          this.soundManager.playEnemyDeath();
        }

        // Single-hit projectile consumption
        p.done = true;
      }

      // Return projectile to pool when finished
      if (p.done) {
        this.projectilePool.release(p);
        this.projectiles.splice(i, 1);
      }
    }
  }

  render() {
    const g = this.ctx;
    const stats = this.perfMonitor.getStats();

    // Also mirror renderScale here
    this.currentRenderScale = stats && Number.isFinite(stats.renderScale)
      ? Math.max(0.001, stats.renderScale) : 1;

    // Adaptive quality scaling
    if (stats.renderScale < 1.0) {
      g.save();
      g.scale(stats.renderScale, stats.renderScale);
    }

    g.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // grid
    g.fillStyle = '#0e1520';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        const px = x * TILE_SIZE, py = y * TILE_SIZE;
        g.strokeStyle = '#1f2836';
        g.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        if (isOnPath(x, y, this.path)) {
          g.fillStyle = '#2b3a4f';
          g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // path outline
    g.strokeStyle = '#3b516f';
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < this.path.length; i++) {
      const node = this.path[i];
      const cx = node.x * TILE_SIZE + TILE_SIZE / 2;
      const cy = node.y * TILE_SIZE + TILE_SIZE / 2;
      if (i === 0) g.moveTo(cx, cy); else g.lineTo(cx, cy);
    }
    g.stroke();

    // towers
    for (const tower of this.towers) tower.render(g);

    // enemies
    for (const enemy of this.enemies) enemy.render(g);

    // projectiles
    for (const p of this.projectiles) p.render(g);

    // hover
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

    if (stats.renderScale < 1.0) {
      g.restore();
    }
  }

  updateUI() {
    // Use safe setters to avoid null errors
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };

    setText('money', this.money);
    setText('lives', this.lives);
    setText('wave', this.wave);
    setText('upgradeModeBtn', `Upgrade: ${this.upgradeMode ? 'On' : 'Off'}`);
    setText('sellModeBtn',    `Sell: ${this.sellMode ? 'On' : 'Off'}`);

    const planningEl = document.getElementById('planning');
    if (planningEl) planningEl.textContent = this.phase === 'planning' ? `${Math.max(0, this.planningTime).toFixed(1)}s` : '—';

    // Performance stats
    const stats = this.perfMonitor.getStats();
    setText('fps', stats.fps);

    // Update tower button costs using Tower class static method
    const basicBtn = document.getElementById('basicTowerBtn');
    const rapidBtn = document.getElementById('rapidTowerBtn');
    const heavyBtn = document.getElementById('heavyTowerBtn');

    if (basicBtn) {
      const basicCost = Tower.getNextTowerCost('basic');
      const basicCount = Tower.towerCounts.basic;
      basicBtn.textContent = `Basic (${basicCost}) [${basicCount} built]`;
      basicBtn.disabled = this.gameOver || this.money < basicCost;
    }
    if (rapidBtn) {
      const rapidCost = Tower.getNextTowerCost('rapid');
      const rapidCount = Tower.towerCounts.rapid;
      rapidBtn.textContent = `Rapid (${rapidCost}) [${rapidCount} built]`;
      rapidBtn.disabled = this.gameOver || this.money < rapidCost;
    }
    if (heavyBtn) {
      const heavyCost = Tower.getNextTowerCost('heavy');
      const heavyCount = Tower.towerCounts.heavy;
      heavyBtn.textContent = `Heavy (${heavyCost}) [${heavyCount} built]`;
      heavyBtn.disabled = this.gameOver || this.money < heavyCost;
    }

    const sellBtn = document.getElementById('sellModeBtn');
    if (sellBtn) sellBtn.disabled = this.gameOver === true;

    // ---- LIVE COST READOUTS ----
    const costEl = document.getElementById('cost');
    if (costEl) {
      if (this.selectedTowerType) {
        costEl.textContent = `Cost: ${Tower.getNextTowerCost(this.selectedTowerType)}`;
      } else {
        costEl.textContent = 'Cost: —';
      }
    }
    const bc = document.getElementById('basicCost');
    const rc = document.getElementById('rapidCost');
    const hc = document.getElementById('heavyCost');
    if (bc) bc.textContent = String(Tower.getNextTowerCost('basic'));
    if (rc) rc.textContent = String(Tower.getNextTowerCost('rapid'));
    if (hc) hc.textContent = String(Tower.getNextTowerCost('heavy'));
  }

  // Map mouse to *canvas pixel space*, then undo renderScale, then to tile coords.
  screenToTile(e) {
    const rect = this.canvas.getBoundingClientRect();

    // Map CSS pixels -> canvas pixels (handles DPR and CSS size differences)
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    let mxCanvas = (e.clientX - rect.left) * scaleX;
    let myCanvas = (e.clientY - rect.top) * scaleY;

    // Undo our rendering scale so hit tests match what we drew
    const rs = this.currentRenderScale || 1;
    if (rs !== 1) {
      mxCanvas /= rs;
      myCanvas /= rs;
    }

    const tx = Math.floor(mxCanvas / TILE_SIZE);
    const ty = Math.floor(myCanvas / TILE_SIZE);

    // Also return CSS-space coords for positioning DOM tooltips
    const cssX = (e.clientX - rect.left);
    const cssY = (e.clientY - rect.top);

    return { tx, ty, mx: mxCanvas, my: myCanvas, cssX, cssY };
  }

  onMouseMove(e) {
    const { tx, ty, cssX, cssY } = this.screenToTile(e);
    const hoverInfo = document.getElementById('hoverInfo');

    if (hoverInfo) {
      hoverInfo.style.pointerEvents = 'none';
      hoverInfo.style.userSelect = 'none';

      if (this.selectedTowerType) {
        hoverInfo.style.display = 'block';
        hoverInfo.style.left = `${cssX + 12}px`;
        hoverInfo.style.top  = `${cssY + 12}px`;
        hoverInfo.textContent = 'Place tower';
      } else if (this.sellMode) {
        hoverInfo.style.display = 'block';
        hoverInfo.style.left = `${cssX + 12}px`;
        hoverInfo.style.top  = `${cssY + 12}px`;
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
        this.money += sold.getSellValue();
        // Optionally: Tower.deregisterOnSell(sold.type);
      }
      return;
    }

    if (this.upgradeMode) {
      const tower = this.towers.find(t => t.tx === tx && t.ty === ty);
      if (tower) {
        this.selectedTower = tower;
        this.showUpgradePanel(tower);
      } else {
        this.selectedTower = null;
        this.hideUpgradePanel();
      }
      return;
    }

    if (!this.selectedTowerType) return;
    if (tx < 0 || ty < 0 || tx >= GRID_COLS || ty >= GRID_ROWS) return; // guard
    if (isOnPath(tx, ty, this.path)) return;                              // cannot build on path
    if (this.towers.some(t => t.tx === tx && t.ty === ty)) return;        // occupied

    // Quote current price and buy safely
    const type = this.selectedTowerType;
    const cost = Tower.getNextTowerCost(type);
    if (this.money < cost) return;

    this.money -= cost;
    const t = new Tower(tx, ty, type, cost); // record actual price paid
    this.towers.push(t);
    Tower.registerPurchase(type);            // advance pricing AFTER successful buy
    this.soundManager.playTowerPlace();
  }

  startWave() {
    if (this.gameOver) return;

    try {
      // Enter combat + advance wave counter
      this.phase = 'combat';
      this.wave += 1;
      this.soundManager.playWaveStart();

      // Safe difficulty knobs for this wave
      const s = getWaveScaling?.(this.wave) || {};
      const scaling = {
        hpMul:    Number.isFinite(s.hpMul)    ? s.hpMul    : 1,
        speedMul: Number.isFinite(s.speedMul) ? s.speedMul : 1,
        rewardMul:Number.isFinite(s.rewardMul)? s.rewardMul: 1,
      };

      const p = getWavePlan?.(this.wave) || {};
      const plan = {
        count:      Number.isFinite(p.count)      ? p.count      : 10,
        interval:   Number.isFinite(p.interval)   ? p.interval   : 1.0,
        burstBonus: Number.isFinite(p.burstBonus) ? p.burstBonus : 0,
      };

      // ---- ENEMY COMPOSITION RULES ----
      // Waves 1–3: ONLY basic enemies (no exceptions).
      // After that: gradually add fast first, then tanks a bit later.
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
      if (totalToSpawn === 0) {
        // No enemies this wave — immediately go back to planning so game doesn't stall
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
        if (this.wave <= 3) type = 'basic'; // redundant guard

        const enemy = this.enemyPool.get();
        enemy.init(type, scaling);
        this.enemies.push(enemy);
        spawned++;

        // Spawn pacing (seconds) with light jitter and a floor
        const jitter = (Math.random() * 0.12) - 0.06; // ±0.06s
        const base = Number.isFinite(plan.interval) ? plan.interval : 1.0;
        const intervalSec = Math.max(0.10, base + jitter);
        setTimeout(spawnOne, intervalSec * 1000);
      };

      spawnOne();
    } catch (err) {
      // Graceful fallback to avoid a hard freeze
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

  // Optional: clean up listeners if you ever dispose/recreate the game
  destroy() {
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('click', this._onClick);
  }
}
