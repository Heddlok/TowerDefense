# Tower Defense Game

A polished HTML5 Canvas tower defense game with multiple tower types, enemy varieties, sound effects, and modern UI.

## 🎮 Live Demo

**[Play the Game](https://heddlok.github.io/TowerDefense/)**

## ✨ Features

- **3 Tower Types**: Basic ($50), Rapid ($80), Heavy ($120) with unique stats
- **3 Enemy Types**: Basic, Fast, and Tank enemies with different behaviors
- **Tower Upgrades**: Upgrade damage, range, and fire rate up to 3 levels each
- **Sound System**: Procedural audio for shooting, hits, deaths, and ambient music
- **Auto Waves**: 5-second planning phase between waves
- **Visual Polish**: Gradient backgrounds, hover effects, and smooth animations
- **Game Over**: Ends when lives reach 0 with restart option
- **Performance Optimized**: Object pooling, spatial partitioning, adaptive quality scaling

## 🚀 Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/Heddlok/TowerDefense.git
   cd TowerDefense
   ```

2. **Open in browser**
   - Open `index.html` directly in a modern browser, or
   - Serve locally: `python3 -m http.server 8080`

## 🎯 How to Play

- Click tower buttons to select placement mode
- Click on non-path grid tiles to place towers
- Click "Upgrade" to enter upgrade mode, then click towers to upgrade them
- Towers auto-fire at enemies in range
- Earn money per kill (varies by enemy type)
- Lose lives when enemies reach the end
- Toggle "Sell" to remove towers for 60% refund
- Toggle sound on/off with 🔊 button

## 🏗️ Tower Upgrades

Each tower can be upgraded up to 3 levels in each stat:
- **Damage**: +25% per level
- **Range**: +15% per level  
- **Fire Rate**: +20% per level

Upgrade costs scale exponentially based on tower type and current level. Higher-tier towers cost more to upgrade but provide better base stats.

## 🏰 Tower Types

- **Basic**: Balanced stats, good for early game
- **Rapid**: High fire rate, lower damage, good for fast enemies
- **Heavy**: High damage, long range, slow fire rate, expensive

## 👾 Enemy Types

- **Basic**: Standard speed and health
- **Fast**: High speed, low health, higher reward
- **Tank**: Slow speed, high health, highest reward

## 🛠️ Technical Details

- **Pure vanilla JavaScript** - no build step required
- **Web Audio API** for procedural sound generation
- **Modular code organization**: systems, units, audio, world, utils
- **Responsive design** with modern CSS gradients and animations
- **Performance optimizations**:
  - Object pooling for enemies and projectiles (reduces GC pressure)
  - Spatial partitioning for efficient collision detection
  - Adaptive quality scaling based on FPS
  - Real-time performance monitoring with FPS display

## 📁 Project Structure

```
TowerDefense/
├── index.html              # Main HTML file
├── styles.css              # Game styling
├── README.md               # This file
└── src/
    ├── main.js             # Game initialization
    ├── audio/
    │   └── SoundManager.js # Web Audio API sound system
    ├── systems/
    │   └── Game.js         # Main game logic
    ├── units/
    │   ├── Enemy.js        # Enemy classes and behavior
    │   ├── Tower.js        # Tower classes and upgrades
    │   └── OptimizedProjectile.js # Projectile system
    ├── utils/
    │   ├── ObjectPool.js   # Object pooling for performance
    │   ├── SpatialGrid.js  # Spatial partitioning
    │   └── PerformanceMonitor.js # FPS monitoring
    └── world/
        └── map.js          # Game map and pathfinding
```

## 🎨 Screenshots

*Add screenshots of your game here*

## 🤝 Contributing

Feel free to fork this project and submit pull requests for improvements!

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

**Built with ❤️ using vanilla JavaScript and HTML5 Canvas**