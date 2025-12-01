# 🎮 Tank Destroyer: Ultimate Edition

[![GitHub](https://img.shields.io/badge/GitHub-tank--destroyer-blue?logo=github)](https://github.com/mohammadfirmansyah/tank-destroyer)
[![Play Now](https://img.shields.io/badge/Play-Live%20Demo-brightgreen?logo=github)](https://mohammadfirmansyah.github.io/tank-destroyer/)
[![HTML5](https://img.shields.io/badge/HTML5-Canvas-orange?logo=html5)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow?logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

An epic top-down tank shooter built with pure JavaScript and HTML5 Canvas. Battle through 12 waves of increasingly intelligent enemies, unlock 4 devastating Ultimate abilities, and face the mighty OMEGA DESTROYER boss in an action-packed 10,000×10,000 battlefield.

## 🎮 Play Now

**[▶️ Play Tank Destroyer](https://mohammadfirmansyah.github.io/tank-destroyer/)** - No download required!

## 📚 Documentation

- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Contribution guidelines
- **[CHANGELOG.md](CHANGELOG.md)** - Version history
- **[BUILD_INFO.md](BUILD_INFO.md)** - Build and deployment guide

## ✨ Key Features

### 🔫 12 Unique Weapons (Tier 1-12)
| Tier | Weapon | Type | Damage | Special |
|------|--------|------|--------|---------|
| 1 | Cannon | Single | 10 | Starter weapon |
| 2 | Twin Cannon | Twin | 28 | Dual barrels |
| 3 | Scatter Gun | Spread | 52 | 5-pellet shotgun |
| 4 | Railgun | Sniper | 120 | High velocity pierce |
| 5 | Burst Rifle | Burst | 95 | 3-round burst |
| 6 | Frost Cannon | Ice | 85 | Slows enemies |
| 7 | Inferno Gun | Fire | 110 | Burning DOT |
| 8 | Flak Cannon | Explosive | 120 | Area damage |
| 9 | Rocket Launcher | AOE | 250 | Massive explosion |
| 10 | Tesla Rifle | Electric | 190 | Chain lightning |
| 11 | Plasma Beam | Rapid | 52 | Ultra-fast fire |
| 12 | Gauss Rifle | Pierce | 336 | Ultimate penetration |

### 🤖 8-Tier Enemy System
| Tier | Name | HP | Weapon | Special Ability |
|------|------|-----|--------|-----------------|
| 0 | Scout | 150 | Cannon | Basic AI |
| 1 | Assault | 220 | Twin | Improved tracking |
| 2 | Heavy | 320 | Shotgun | Tactical movement |
| 3 | Elite | 500 | Burst | Magic Shield |
| 4 | Commander | 800 | Plasma | Blink/Teleport |
| 5 | Frost | 650 | Ice | Freezing aura |
| 6 | Inferno | 700 | Fire | Burning attacks |
| 7 | Tesla | 750 | Electric | Chain stun |

### ⚡ 4 Ultimate Abilities
| Wave | Ultimate | Effect |
|------|----------|--------|
| 1-3 | **DEVASTATOR** | Piercing beam (10 kills to charge) |
| 4-6 | **SHOCKWAVE** | Area DOT + 2s stun (8 kills) |
| 7-9 | **BERSERKER** | 12s rage: 2.5× damage, 2× speed, invincible (6 kills) |
| 10+ | **CLONE ARMY** | Summon 3 ally tanks (10 kills) |

### 👹 OMEGA DESTROYER Boss
- **15,000 HP** with 3 phases (100% → 66% → 33%)
- **7 Unique Turrets**: Void Lance, Frost Chain, Ember Volley, Storm Gatling, Arc Lance, Seeker Hive, Gravity Maul
- **Special Attacks**: Dark Fire Aura, Headbutt Stun, Guard Escorts
- **Ultimate Beam**: Triggered at 75%, 50%, 25% HP

### 🎯 Progressive Wave System
- **12 Waves** of increasing difficulty
- **15+ enemies per wave** (scales with progression)
- **Revive Rewards**: Wave 3 (+1), Wave 6 (+2), Wave 9 (+3)
- **Final Wave**: Face OMEGA DESTROYER with elite escorts

### 📦 Loot & Progression
- **6-Tier Rarity**: Common → Uncommon → Rare → Epic → Legendary → Mythic
- **Drop Types**: Weapons, Health, Energy, Armor, Damage Boost, Revives
- **Smart Drops**: Only weapons at or above current tier

## 🛠️ Technologies

- **HTML5 Canvas** - GPU-optimized 2D rendering with desynchronized context
- **Vanilla JavaScript** - Modular ES6+ architecture (~15,000 lines)
- **Tailwind CSS** - Utility-first styling
- **LocalStorage** - Persistent high scores

## 📂 Project Structure

```
tank-destroyer/
├── index.html          # Main game entry
├── css/
│   └── style.css       # UI themes & animations
├── js/
│   ├── cache-buster.js # Cache management (auto-refresh)
│   ├── config.js       # Game constants, weapons, enemies, boss config
│   ├── world.js        # Map generation, spawning
│   ├── gameplay.js     # Core loop, player controls, ultimates
│   ├── systems.js      # AI, combat, bullets, pathfinding
│   ├── render.js       # Canvas rendering, particles, effects
│   ├── ui.js           # HUD, minimap, menus
│   ├── input.js        # Keyboard, mouse, touch controls
│   ├── demo.js         # Homepage demo battle
│   ├── splash.js       # Splash screen system
│   ├── achievements.js # Achievement system & tracking
│   ├── saveManager.js  # Save/load game state
│   ├── tailwind.js     # Tailwind CSS (local)
│   └── main.js         # Initialization
├── assets/
│   └── fonts/          # Custom fonts (Rajdhani, Black Ops One)
├── README.md
├── CONTRIBUTING.md
├── CHANGELOG.md
├── BUILD_INFO.md
└── LICENSE             # MIT
```

## 🚀 Quick Start

### Play Online
Visit **[mohammadfirmansyah.github.io/tank-destroyer](https://mohammadfirmansyah.github.io/tank-destroyer/)**

### Run Locally

```bash
# Clone repository
git clone https://github.com/mohammadfirmansyah/tank-destroyer.git
cd tank-destroyer

# Option 1: Open directly
start index.html          # Windows
open index.html           # macOS
xdg-open index.html       # Linux

# Option 2: Local server (recommended)
python -m http.server 8000
# Visit http://localhost:8000
```

## 💻 Controls

### Desktop
| Key | Action |
|-----|--------|
| WASD | Move tank |
| Mouse Move | Aim turret toward cursor |
| Left Click | Fire toward cursor |
| Right Click | Move toward cursor direction |
| Arrow Keys | Aim + Auto-fire |
| Space / Shift | Ultimate ability |
| ESC / P | Pause |

**Note**: Mouse cursor is hidden during gameplay for immersion. Turret always faces where you point!

### Mobile
- **Left Joystick** - Movement
- **Right Joystick** - Aim & Fire (auto-fires while held)

## 🧪 Debug Mode

Set these in `js/config.js` for testing:

```javascript
DEBUG_START_WAVE = 12;        // Skip to wave (1-12)
DEBUG_START_WEAPON = 'gauss'; // Start with weapon
DEBUG_INVINCIBLE = true;      // God mode
DEBUG_UNLIMITED_ENERGY = true;// No overheat
```

## 🎯 Gameplay Tips

1. **Manage Heat** - Watch temperature gauge; overheat = 2s lockout
2. **Use Cover** - Destructible walls regenerate HP over time
3. **Build Streaks** - 10 kills = Ultimate ready
4. **Prioritize Threats** - Magical enemies (Tier 3+) have special abilities
5. **Boss Strategy** - Watch for turret patterns, dodge the beam ultimate

## 📖 Technical Highlights

### GPU-Optimized Canvas
```javascript
const CTX = CANVAS.getContext('2d', { 
    alpha: false,           // No transparency compositing
    desynchronized: true,   // Async rendering
    willReadFrequently: false
});
```

### Intelligent AI
- **8 Intelligence Levels** with distinct behaviors
- **A*-style Pathfinding** with stuck detection
- **Predictive Targeting** for higher tiers
- **Coordinated Attack Queues** prevent swarming

### Particle System
- **Dynamic Effects**: Muzzle flash, explosions, trails
- **Performance Capped**: Max particles limit
- **Weapon-Specific**: Each weapon has unique visuals

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Fork, clone, branch
git checkout -b feature/YourFeature
git commit -m "feat: add YourFeature"
git push origin feature/YourFeature
# Open Pull Request
```

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 👨‍💻 Developer

**Mohammad Firman Syah**

- GitHub: [@mohammadfirmansyah](https://github.com/mohammadfirmansyah)
- Project: [tank-destroyer](https://github.com/mohammadfirmansyah/tank-destroyer)

---

**Built with ❤️ using pure JavaScript & HTML5 Canvas**
