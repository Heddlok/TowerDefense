import { Game } from './systems/Game.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const game = new Game(canvas, ctx);

// UI wiring
document.querySelectorAll('.tower-btn').forEach(btn => {
  btn.addEventListener('click', () => game.selectTower(btn.dataset.tower));
});
document.getElementById('sellModeBtn').addEventListener('click', () => game.toggleSellMode());
document.getElementById('upgradeModeBtn').addEventListener('click', () => game.toggleUpgradeMode());
document.getElementById('soundToggleBtn').addEventListener('click', () => game.toggleSound());
document.getElementById('upgradeDamageBtn').addEventListener('click', () => game.upgradeTower('damage'));
document.getElementById('upgradeRangeBtn').addEventListener('click', () => game.upgradeTower('range'));
document.getElementById('upgradeFireRateBtn').addEventListener('click', () => game.upgradeTower('fireRate'));

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
