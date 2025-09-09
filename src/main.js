import { Game } from './systems/Game.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const game = new Game(canvas, ctx);

// UI wiring (use pointerdown for immediate, reliable taps/clicks)
document.querySelectorAll('.tower-btn').forEach(btn => {
  btn.addEventListener('pointerdown', () => game.selectTower(btn.dataset.tower), { passive: true });
});
document.getElementById('sellModeBtn').addEventListener('pointerdown', () => game.toggleSellMode(), { passive: true });
document.getElementById('upgradeModeBtn').addEventListener('pointerdown', () => game.toggleUpgradeMode(), { passive: true });
document.getElementById('soundToggleBtn').addEventListener('pointerdown', () => game.toggleSound(), { passive: true });
document.getElementById('upgradeDamageBtn').addEventListener('pointerdown', () => game.upgradeTower('damage'), { passive: true });
document.getElementById('upgradeRangeBtn').addEventListener('pointerdown', () => game.upgradeTower('range'), { passive: true });
document.getElementById('upgradeFireRateBtn').addEventListener('pointerdown', () => game.upgradeTower('fireRate'), { passive: true });

// ---- Fixed-step loop with background fallback ----
const STEP = 1000 / 60; // 60 FPS sim step (ms)
let rafId = null;
let bgTimer = null;
let lastTime = performance.now();
let simTime = lastTime;   // monotonic sim timestamp (ms)
let accumulator = 0;

function stepSimulation(dtMs, render = true) {
  accumulator += dtMs;
  // prevent huge catch-ups
  const maxSteps = 120; // ~2s of backlog
  let steps = 0;
  while (accumulator >= STEP && steps < maxSteps) {
    simTime += STEP;
    game.update(simTime);
    accumulator -= STEP;
    steps++;
  }
  if (render) game.render();
}

function foregroundFrame(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  stepSimulation(dt, /*render*/ true);
  rafId = requestAnimationFrame(foregroundFrame);
}

function startForeground() {
  if (rafId == null) {
    lastTime = performance.now();
    rafId = requestAnimationFrame(foregroundFrame);
  }
}
function stopForeground() {
  if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
}

function startBackground() {
  if (bgTimer == null) {
    lastTime = performance.now();
    bgTimer = setInterval(() => {
      const now = performance.now();
      const dt = now - lastTime;
      lastTime = now;
      // advance gameplay without rendering to avoid throttled rAF
      stepSimulation(dt, /*render*/ false);
    }, 250); // browsers may clamp; sim still advances in chunks
  }
}
function stopBackground() {
  if (bgTimer != null) { clearInterval(bgTimer); bgTimer = null; }
}

// Switch loops based on tab focus
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    stopForeground();
    startBackground();
  } else {
    stopBackground();
    startForeground();
  }
});

// Kick off
startForeground();
