# Changelog

All notable changes to Tank Destroyer: Ultimate Edition will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-RC.2] - 2025-11-30

### Added
- 🔄 **Cache Buster System** - Force fresh assets on every page load
  - Automatically clears browser Cache Storage API
  - Unregisters stale Service Workers
  - Adds cache-busting query parameters to resources
  - Performs hard reload on first visit per session
  - Manual cache clear via `TankDestroyer.clearCache()`

### Changed
- 🔧 New module: `js/cache-buster.js` for cache management
- 🔧 Modular JavaScript architecture expanded to **14 modules**

---

## [2.0.0-rc.1] - 2025-11-30

### 🚀 Major Release: Ultimate Edition

This is a complete overhaul of Tank Destroyer with extensive new features, including boss battles, ultimate abilities, achievements, save system, and much more.

### Added

#### ⚡ 4 Ultimate Abilities (Progressive Unlock)
- **DEVASTATOR** (Wave 1-3): Piercing beam attack - 10 kills to charge
- **SHOCKWAVE** (Wave 4-6): Area DOT + 2s stun effect - 8 kills to charge
- **BERSERKER** (Wave 7-9): 12s rage mode with 2.5× damage, 2× speed, invincibility - 6 kills to charge
- **CLONE ARMY** (Wave 10+): Summon 3 AI ally tanks that fight alongside you - 10 kills to charge

#### 👹 OMEGA DESTROYER Boss Battle (Wave 12)
- **15,000 HP** multi-phase boss (Phase 1/2/3 at 100%/66%/33% HP)
- **7 Unique Turrets**: Void Lance, Frost Chain, Ember Volley, Storm Gatling, Arc Lance, Seeker Hive, Gravity Maul
- **Special Attacks**: Dark Fire Aura (DOT zone), Headbutt Stun, Guard Escorts spawning
- **Ultimate Beam**: Devastating attack triggered at 75%/50%/25% HP thresholds
- **Victory Screen**: Celebratory screen with final score and mission time

#### 🔫 12-Tier Weapon System (Expanded from 9)
- Tier 6: **Frost Cannon** - Ice projectiles with 40% slow effect
- Tier 7: **Inferno Gun** - Fire bullets with burning DOT damage
- Tier 10: **Tesla Rifle** - Chain lightning that arcs to nearby enemies
- Balanced DPE (Damage Per Energy) progression from 3.33 to 12.00

#### 🤖 8-Tier Enemy System (Expanded from 5)
- Tier 3: **Elite** - Magic Shield that blocks first hit
- Tier 4: **Commander** - Blink/Teleport ability
- Tier 5: **Frost** - Ice attacks with freezing aura
- Tier 6: **Inferno** - Fire attacks with burning damage
- Tier 7: **Tesla** - Electric attacks with chain stun

#### 🏆 Achievement System
- **40+ Achievements** across multiple categories
- Kill milestones, wave progression, weapon mastery
- Visual popup notifications with unlock effects
- Persistent tracking via LocalStorage

#### 💾 Save/Load System
- Auto-save game progress
- Resume interrupted games
- Confirmation popup when starting new game with active save

#### 🎬 Cinematic Features
- **Splash Screen**: 3-page intro with game title, developer branding, health warning
- **Demo Battle Background**: AI tanks fighting in main menu
- **Local Fonts**: Rajdhani and Black Ops One fonts (no CDN required)
- **Tailwind CSS Local**: Full offline support

#### 🗺️ Minimap Enhancements
- Weapon drop icons with tier-specific colors and blinking animation
- Boss indicator with HP bar during boss fight
- Clone ally markers (green triangles)
- Destructible walls indicator

#### 🎮 Input System Overhaul
- Fixed mouse + keyboard aim coexistence
- Keyboard arrow keys now properly fire (not just aim)
- Improved touch joystick responsiveness
- Active aiming detection (turret stays at last aimed direction)

#### 🛡️ Armor System
- New armor stat with damage absorption
- Armor drops from loot crates
- Sparkle particle effects when armor blocks damage
- Separate armor bar in HUD

### Fixed
- 🐛 Boss not dying at 0 HP - added periodic death check in updateBoss()
- 🐛 `pushParticle is not defined` errors - replaced with particles.push() + particleIdCounter
- 🐛 Mouse aim broken after keyboard input - removed clearAnalogAim() interference  
- 🐛 Turret snapping to right when idle - added isActivelyAiming flag
- 🐛 Clone attacking spawning/sleeping boss - added meteorSpawnActive/isSleeping checks
- 🐛 AI pathfinding stuck in circles - improved A*-style alternate route finding
- 🐛 forceChaseExploration null error - added null check before angle access

### Changed
- 🔧 Wave system expanded to **12 waves** (was 10)
- 🔧 Revive rewards at **Wave 3/6/9** (+1/+2/+3 revives)
- 🔧 Enemy intelligence ranges **2-6** (was 1-5) for smarter AI
- 🔧 Temperature system with **heat soak** and **cooling efficiency**
- 🔧 Entry point changed from `tank-destroyer.html` to `index.html`
- 🔧 Modular JavaScript architecture expanded to **13 modules**

---

## [1.0.0] - 2025-11-21

### Added
- ✨ **Core Game Mechanics**
  - Top-down tank shooter with 10,000×10,000 battlefield
  - 9 unique weapons with distinct behaviors
  - Energy management with overheat mechanics
  - Recoil physics affecting aim and movement
  
- 🤖 **AI System**
  - 5-tier enemy intelligence
  - Pursuit, pathfinding, predictive targeting
  - Queue-based attack coordination
  
- 🗺️ **Smart Minimap**
  - Dynamic viewport with edge-clamping
  - Real-time enemy tracking
  
- 💥 **Visual Effects**
  - Particle systems for all combat events
  - Screen shake, muzzle flash, floating text
  
- 📱 **Cross-Platform**
  - Desktop: WASD + Mouse
  - Mobile: Dual joysticks

### Technical
- Modular JavaScript architecture (10 modules)
- GPU-optimized HTML5 Canvas
- RequestAnimationFrame game loop
- LocalStorage persistence

---

**Note:** Version numbers follow Semantic Versioning. Major.Minor.Patch
