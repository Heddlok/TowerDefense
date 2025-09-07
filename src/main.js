import { Game } from './systems/Game.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const game = new Game(canvas, ctx);

document.querySelectorAll('.tower-btn').forEach(btn => {
  btn.addEventListener('click', () => game.selectTower(btn.dataset.tower));
});
document.getElementById('sellModeBtn').addEventListener('click', () => game.toggleSellMode());
document.getElementById('upgradeModeBtn').addEventListener('click', () => game.toggleUpgradeMode());
document.getElementById('soundToggleBtn').addEventListener('click', () => game.toggleSound());

// Upgrade button event listeners
document.getElementById('upgradeDamageBtn').addEventListener('click', () => game.upgradeTower('damage'));
document.getElementById('upgradeRangeBtn').addEventListener('click', () => game.upgradeTower('range'));
document.getElementById('upgradeFireRateBtn').addEventListener('click', () => game.upgradeTower('fireRate'));

function loop(ts) {
  game.update(ts);
  game.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

