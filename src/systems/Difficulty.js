// src/systems/Difficulty.js
// Gentle early ramp → firmer mid/late ramp. All numbers are easy to tweak.
const CENTER_WAVE = 24; // where the curve starts to lean harder
const TRANSITION_SHARPNESS = 7; // how quickly it leans harder around center

function mix(a, b, t) { return a * (1 - t) + b * t; }
function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
function growthRate(wave, low, high, center = CENTER_WAVE, k = TRANSITION_SHARPNESS) {
  const t = sigmoid((wave - center) / k);
  return mix(low, high, t); // per-wave % growth between [low, high]
}

/** Returns multipliers for this wave (apply to base stats). */
export function getWaveScaling(wave) {
  // Early waves grow ~6% hp/kill reward, later ~12%. Speed grows slowly and caps.
  const hpRate = growthRate(wave, 0.08, 0.15);
  const rewardRate = growthRate(wave, 0.04, 0.07);
  const hpMul = Math.pow(1 + hpRate, Math.max(0, wave - 1));
  const rewardMul = Math.pow(1 + rewardRate, Math.max(0, wave - 1)) * Math.pow(0.97, Math.floor(wave / 10));
  const speedMul = Math.min(2.25, 1 + 0.015 * (wave - 1)); // don't let speed get silly
  return { hpMul, rewardMul, speedMul };
}

/** How many enemies and how quickly to spawn them this wave. */
export function getWavePlan(wave) {
  // Linear + mild super-linear count; spawn interval shrinks gently.
  // UPDATED: Added +5 to base enemy count
  const count = Math.floor(13 + wave * 0.9 + Math.pow(Math.max(0, wave - 6), 1.12) * 0.12); // was 8, now 13
  const interval = Math.max(0.35, 1.20 * Math.pow(0.985, Math.max(0, wave - 1)));

  // Enemy mix starts basic → adds fast/tank bias over time
  const tankW = Math.min(0.48, 0.10 + wave * 0.012);
  const fastW = Math.min(0.44, 0.24 + wave * 0.008);
  const basicW = Math.max(0.12, 1 - (tankW + fastW));

  return {
    count,
    interval,
    weights: { basic: basicW, fast: fastW, tank: tankW },
    // A gentle "pressure spike" every 5 waves - also increased by 5
    burstEvery: 5,
    burstBonus: (wave % 5 === 0) ? Math.max(7, Math.floor(wave / 5) + 5) : 0, // was Math.max(2, Math.floor(wave / 5)), now +5
  };
}

export function pickType(weights) {
  const r = Math.random();
  const a = weights.basic;
  const b = a + weights.fast;
  return r < a ? "basic" : (r < b ? "fast" : "tank");
}