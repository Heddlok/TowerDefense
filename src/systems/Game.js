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

    this.selectedTowerType = null;
    this.sellMode = false;
    this.upgradeMode = false;
    this.selectedTower = null;
    this.soundManager = new SoundManager();
    
    // Performance optimizations
    this.perfMonitor = new PerformanceMonitor();
    this.spatialGrid = new SpatialGrid(canvas.width, canvas.height, TILE_SIZE);
    
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

    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('click', (e) => this.onClick(e));
  }

  update(ts) {
    if (this.gameOver) { this.updateUI(); return; }
    this.time = ts;
    this.perfMonitor.update();
    this.updateUI();

    // planning timer
    if (this.phase === 'planning') {
      this.planningTime -= 1/60;
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

    // Update spatial grid
    this.spatialGrid.clear();
    for (const enemy of this.enemies) {
      this.spatialGrid.insert(enemy);
    }

    // update enemies with object pooling
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.update(1/60, this.path);
      
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

    // towers acquire targets and shoot with spatial optimization
    for (const tower of this.towers) {
      const shot = tower.update(1/60, this.enemies, this.projectiles, this.spatialGrid, this.projectilePool);
      if (shot) {
        this.soundManager.playShoot();
      }
    }

    // projectiles with object pooling
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(1/60);
      
      if (p.hitTarget) {
        p.target.hp -= p.damage;
        if (p.target.hp <= 0) {
          p.target.isDead = true;
          this.money += p.target.reward;
          this.soundManager.playEnemyDeath();
        }
      }
      
      if (p.done) {
        this.projectilePool.release(p);
        this.projectiles.splice(i, 1);
      }
    }
  }

  render() {
    const g = this.ctx;
    const stats = this.perfMonitor.getStats();
    
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
    document.getElementById('money').textContent = String(this.money);
    document.getElementById('lives').textContent = String(this.lives);
    document.getElementById('wave').textContent = String(this.wave);
    document.getElementById('sellModeBtn').textContent = `Sell: ${this.sellMode ? 'On' : 'Off'}`;
    document.getElementById('upgradeModeBtn').textContent = `Upgrade: ${this.upgradeMode ? 'On' : 'Off'}`;
    
    const planningEl = document.getElementById('planning');
    if (planningEl) planningEl.textContent = this.phase === 'planning' ? `${Math.max(0, this.planningTime).toFixed(1)}s` : '—';
    
    // Performance stats
    const stats = this.perfMonitor.getStats();
    document.getElementById('fps').textContent = String(stats.fps);
    
    const disable = this.gameOver === true;
    const sellBtn = document.getElementById('sellModeBtn');
    if (sellBtn) sellBtn.disabled = disable;
    document.querySelectorAll('.tower-btn').forEach(b => { b.disabled = disable; });
  }

  startWave() {
    if (this.gameOver) return;
  
    // Enter combat + advance wave counter
    this.phase = 'combat';
    this.wave += 1;
    this.soundManager.playWaveStart();
  
    // Pull difficulty knobs for this wave
    const scaling = getWaveScaling(this.wave);   // { hpMul, rewardMul, speedMul }
    const plan    = getWavePlan(this.wave);      // { count, interval (sec), weights, burstBonus? }
  
    // Total enemies this wave (optionally add a small "pressure spike")
    const totalToSpawn = plan.count + (plan.burstBonus || 0);
  
    let spawned = 0;
    this.spawning = true;
  
    // Weighted type picker (basic / fast / tank)
    const pickType = () => {
      const w = plan.weights || { basic: 1, fast: 0, tank: 0 };
      const a = Math.max(0, w.basic || 0);
      const b = Math.max(0, w.fast  || 0);
      const c = Math.max(0, w.tank  || 0);
      const sum = a + b + c || 1;
      const r = Math.random() * sum;
      return (r < a) ? 'basic' : (r < a + b) ? 'fast' : 'tank';
    };
  
    const spawnOne = () => {
      if (this.gameOver) { this.spawning = false; return; }
      if (spawned >= totalToSpawn) { this.spawning = false; return; }
  
      // Acquire a pooled enemy, init with type, then apply wave scaling
      const type = pickType();
      const enemy = this.enemyPool.get();
      enemy.init(type, scaling);
  
      // Apply per-wave scaling (kept here so Enemy.js can stay unchanged)
      if (typeof enemy.maxHp === 'number') {
        enemy.maxHp = Math.max(1, Math.round(enemy.maxHp * (scaling.hpMul || 1)));
        enemy.hp = enemy.maxHp;
      }
      if (typeof enemy.speed === 'number') {
        enemy.speed = enemy.speed * (scaling.speedMul || 1);
      }
      if (typeof enemy.reward === 'number') {
        enemy.reward = Math.max(1, Math.round(enemy.reward * (scaling.rewardMul || 1)));
      }
  
      this.enemies.push(enemy);
      spawned++;
  
      // Spawn pacing: gentle shrink with light jitter, but never too fast
      const jitter = (Math.random() * 0.12) - 0.06; // ±0.06s
      const intervalSec = Math.max(0.10, (plan.interval || 1.0) + jitter);
      setTimeout(spawnOne, intervalSec * 1000);
    };
  
    spawnOne();
  }

  selectTower(type) { 
    this.selectedTowerType = type; 
    this.sellMode = false; 
    this.upgradeMode = false;
    this.selectedTower = null;
    this.hideUpgradePanel();
  }
  
  toggleSellMode() { 
    this.sellMode = !this.sellMode; 
    if (this.sellMode) {
      this.selectedTowerType = null;
      this.upgradeMode = false;
      this.selectedTower = null;
      this.hideUpgradePanel();
    }
  }
  
  toggleUpgradeMode() {
    this.upgradeMode = !this.upgradeMode;
    if (this.upgradeMode) {
      this.selectedTowerType = null;
      this.sellMode = false;
    } else {
      this.selectedTower = null;
      this.hideUpgradePanel();
    }
  }
  toggleSound() { 
    this.soundManager.toggle(); 
    const btn = document.getElementById('soundToggleBtn');
    btn.textContent = this.soundManager.enabled ? '🔊 Sound' : '🔇 Sound';
  }

  hideUpgradePanel() {
    const panel = document.getElementById('upgradePanel');
    if (panel) panel.style.display = 'none';
  }

  showUpgradePanel(tower) {
    const panel = document.getElementById('upgradePanel');
    if (!panel) return;
    
    // Update current stats
    document.getElementById('currentDamage').textContent = tower.damage;
    document.getElementById('currentRange').textContent = tower.range;
    document.getElementById('currentFireRate').textContent = tower.fireRate.toFixed(1);
    
    // Update upgrade costs
    document.getElementById('damageCost').textContent = tower.getUpgradeCost('damage');
    document.getElementById('rangeCost').textContent = tower.getUpgradeCost('range');
    document.getElementById('fireRateCost').textContent = tower.getUpgradeCost('fireRate');
    
    // Update sell value
    document.getElementById('sellValue').textContent = tower.getSellValue();
    
    // Enable/disable buttons based on upgrade levels and money
    const damageBtn = document.getElementById('upgradeDamageBtn');
    const rangeBtn = document.getElementById('upgradeRangeBtn');
    const fireRateBtn = document.getElementById('upgradeFireRateBtn');
    
    damageBtn.disabled = tower.damageLevel >= tower.maxUpgradeLevel || this.money < tower.getUpgradeCost('damage');
    rangeBtn.disabled = tower.rangeLevel >= tower.maxUpgradeLevel || this.money < tower.getUpgradeCost('range');
    fireRateBtn.disabled = tower.fireRateLevel >= tower.maxUpgradeLevel || this.money < tower.getUpgradeCost('fireRate');
    
    panel.style.display = 'block';
  }

  upgradeTower(upgradeType) {
    if (!this.selectedTower) return;
    
    const cost = this.selectedTower.getUpgradeCost(upgradeType);
    if (this.money < cost) return;
    
    this.money -= cost;
    this.selectedTower.upgrade(upgradeType);
    this.soundManager.playTowerPlace(); // Reuse sound for upgrade
    
    // Update the panel
    this.showUpgradePanel(this.selectedTower);
  }

  screenToTile(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const tx = Math.floor(mx / TILE_SIZE);
    const ty = Math.floor(my / TILE_SIZE);
    return { tx, ty, mx, my };
  }

  onMouseMove(e) {
    const { tx, ty, mx, my } = this.screenToTile(e);
    const hoverInfo = document.getElementById('hoverInfo');
    if (this.selectedTowerType) {
      hoverInfo.style.display = 'block';
      hoverInfo.style.left = `${mx + 12}px`;
      hoverInfo.style.top = `${my + 12}px`;
      hoverInfo.textContent = 'Place tower';
    } else if (this.sellMode) {
      hoverInfo.style.display = 'block';
      hoverInfo.style.left = `${mx + 12}px`;
      hoverInfo.style.top = `${my + 12}px`;
      hoverInfo.textContent = 'Sell tower';
    } else {
      hoverInfo.style.display = 'none';
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
    if (isOnPath(tx, ty, this.path)) return; // cannot build on path
    if (this.towers.some(t => t.tx === tx && t.ty === ty)) return; // occupied

    // Get cost for selected tower type
    const tempTower = new Tower(0, 0, this.selectedTowerType);
    const cost = tempTower.cost;
    if (this.money < cost) return;

    this.money -= cost;
    this.towers.push(new Tower(tx, ty, this.selectedTowerType));
    this.soundManager.playTowerPlace();
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
}


