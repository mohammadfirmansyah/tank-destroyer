# 🎮 Tank Destroyer: Ultimate Edition

[![GitHub](https://img.shields.io/badge/GitHub-tank--destroyer-blue?logo=github)](https://github.com/mohammadfirmansyah/tank-destroyer)
[![HTML5](https://img.shields.io/badge/HTML5-Canvas-orange?logo=html5)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow?logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A modern, action-packed top-down tank shooter built with pure JavaScript and HTML5 Canvas. Experience intense arcade-style combat with intelligent AI enemies, progressive weapon systems, and cinematic visual effects.

## 📚 Documentation

- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Learn how to contribute to the project
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and release notes
- **[BUILD_INFO.md](BUILD_INFO.md)** - Build instructions and deployment guide

## ✨ Key Features

- **🎯 Dynamic Combat System** - 9 unique weapons with distinct behaviors (Cannon, Twin, Shotgun, Railgun, Burst Rifle, Flak Cannon, Rocket Launcher, Plasma Beam, Gauss Rifle)
- **🤖 Advanced AI** - 5-tier enemy intelligence system with pursuit mechanics, path-finding, and adaptive behavior
- **💥 Visual Effects** - Cinematic particles, muzzle flashes, explosions, and screen shake
- **🗺️ Smart Minimap** - Dynamic viewport that prevents edge clipping and shows tactical information
- **📊 Progressive Loot System** - Rarity-based weapon drops (Common → Uncommon → Rare → Epic → Legendary → Mythic)
- **🎨 Elegant UI** - Military-themed HUD with health bars, energy gauge, kill streak tracker, and weapon display
- **📱 Cross-Platform** - Dual control scheme: WASD + Mouse for desktop, dual joysticks for mobile
- **🏆 Local High Score** - Persistent score tracking with localStorage
- **🎬 Splash Screen** - Professional 3-page intro with studio branding and health warning

## 🎮 Gameplay Mechanics

### Combat System
- **Energy Management** - Each weapon consumes energy; manage overheating to stay in the fight
- **Recoil Physics** - Realistic weapon kickback affects aim and positioning
- **Kill Streaks** - Build your streak to unlock devastating Ultimate abilities
- **Armor & Shields** - Collect pickups to gain temporary invincibility and damage reduction
- **Revive System** - Second chances to continue your mission

### Enemy Tiers
| Tier | Color | HP | Speed | Intelligence | Weapon |
|------|-------|-----|-------|--------------|--------|
| 0 | Yellow | 120 | 1.8 | Basic | Cannon |
| 1 | Orange | 180 | 2.2 | Improved | Twin |
| 2 | Pink | 250 | 2.6 | Tactical | Shotgun |
| 3 | Red | 400 | 3.0 | Advanced | Burst |
| 4 | Purple | 650 | 3.2 | Elite | Laser |

### AI Behavior
- **Pursuit Mode** - Enemies chase the player aggressively based on tier intelligence (Tier 0: 1500 units, Tier 4: 3500 units)
- **Obstacle Avoidance** - Smart pathfinding around walls and crates
- **Predictive Targeting** - Higher-tier enemies lead their shots against moving targets
- **Queue System** - Enemies coordinate attacks rather than swarming blindly
- **Last Known Position Tracking** - Enemies search for the player when line of sight is lost

## 🛠️ Technologies Used

- **HTML5 Canvas** - Hardware-accelerated 2D rendering
- **Vanilla JavaScript** - Modular ES6+ architecture
- **Tailwind CSS** - Utility-first styling framework
- **LocalStorage API** - Client-side data persistence

## 📂 Project Structure

```
tank-destroyer/
├── tank-destroyer.html    # Main HTML entry point
├── css/
│   └── style.css           # Game styling and UI themes
├── js/
│   ├── config.js           # Global configuration and constants
│   ├── world.js            # Map generation and world setup
│   ├── gameplay.js         # Core game loop and state management
│   ├── systems.js          # AI, combat, loot, and game systems
│   ├── render.js           # Canvas rendering and visual effects
│   ├── ui.js               # HUD updates and score display
│   ├── input.js            # Keyboard, mouse, and touch controls
│   ├── demo.js             # Homepage background demo battle
│   ├── splash.js           # Splash screen animation system
│   └── main.js             # Initialization and startup
├── assets/                 # Game assets (if any)
├── README.md               # This file
├── CONTRIBUTING.md         # Contribution guidelines
├── CHANGELOG.md            # Version history
├── BUILD_INFO.md           # Build and deployment instructions
└── LICENSE                 # MIT License
```

## 🚀 Quick Start

### Prerequisites
- Modern web browser with HTML5 Canvas support (Chrome, Firefox, Edge, Safari)
- No build tools or dependencies required

### Running Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/mohammadfirmansyah/tank-destroyer.git
   cd tank-destroyer
   ```

2. **Open in browser:**
   ```bash
   # Simply open the HTML file in your browser
   start tank-destroyer.html  # Windows
   open tank-destroyer.html   # macOS
   xdg-open tank-destroyer.html  # Linux
   ```

   Or use a local server (recommended):
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js (http-server)
   npx http-server -p 8000
   ```

3. **Play the game:**
   - Navigate to `http://localhost:8000/tank-destroyer.html`
   - Click through the splash screen
   - Use WASD to move, mouse to aim and fire
   - Survive as long as possible and beat your high score!

## 💻 Controls

### Desktop
- **WASD** - Tank movement
- **Mouse Move** - Aim turret
- **Left Click / Space** - Fire weapon
- **P / ESC** - Pause game

### Mobile
- **Left Joystick** - Tank movement
- **Right Joystick** - Aim and fire

## 🎯 Gameplay Tips

1. **Energy Management** - Don't spam-fire; let your energy recharge to avoid overheating
2. **Use Cover** - Destructible walls and crates provide tactical advantages
3. **Weapon Progression** - Don't pick up weapons with lower rarity than your current weapon
4. **Kill Streaks** - Build streaks to charge your Ultimate ability for devastating area damage
5. **Mobility** - Higher-tier enemies are faster; keep moving to avoid getting cornered
6. **Map Awareness** - Use the minimap to track enemy positions and avoid ambushes

## 📝 Code Highlights

### Modular Architecture
The codebase is split into logical modules for maintainability:
- **config.js** - Centralized constants prevent magic numbers
- **systems.js** - Pure functions for AI, loot, and combat logic
- **render.js** - Isolated rendering code for easy optimization

### Intelligent AI
```javascript
// Enemies adapt pursuit strategy based on intelligence level
const pursuitRadius = 1000 + (intelligence * 500); // Tier 0: 1500, Tier 4: 3500
const aggressivenessBonus = intelligence * 0.25;   // Up to +37.5% speed boost

// Predictive targeting for higher-tier enemies
let timeToHit = d / bulletSpeed;
let predictX = player.x + player.vx * timeToHit * 0.5;
let predictY = player.y + player.vy * timeToHit * 0.5;
```

### Progressive Loot System
```javascript
// Weapons only drop if they're at or above player's current tier
pool = pool.filter(w => 
    w.rarity >= currentWeaponRarity && 
    w.rarity <= currentWeaponRarity + 1 && 
    w.id !== player.weapon  // No duplicate weapons
);
```

## 📖 Learning Outcomes

This project demonstrates:
- ✅ **Game Loop Architecture** - RequestAnimationFrame-based update/render cycle
- ✅ **Canvas Rendering** - Efficient 2D graphics with layered rendering
- ✅ **State Management** - Centralized game state without frameworks
- ✅ **AI Programming** - Behavior trees, pathfinding, and decision-making
- ✅ **Physics Simulation** - Collision detection, projectile trajectories, recoil
- ✅ **Input Handling** - Multi-platform control schemes (keyboard, mouse, touch)
- ✅ **Particle Systems** - Dynamic visual effects for explosions and impacts
- ✅ **Data Persistence** - LocalStorage for high score tracking
- ✅ **Responsive Design** - Adaptive UI for desktop and mobile devices

## 🤝 Contributing

We welcome contributions! Please see our **[Contributing Guide](CONTRIBUTING.md)** for details on how to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License. See the **[LICENSE](LICENSE)** file for details.

## 👨‍💻 Developer

- **Mohammad Firman Syah**
- **Project Link:** [https://github.com/mohammadfirmansyah/tank-destroyer](https://github.com/mohammadfirmansyah/tank-destroyer)

---

**Built with ❤️ by Firman Dev Studio - Premium Interactive Entertainment**
