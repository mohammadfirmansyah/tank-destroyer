# Changelog

All notable changes to Tank Destroyer: Ultimate Edition will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-RC.9] - 2025-12-01

### Fixed
- 📱 **Mobile GPU Compatibility Fix** - Prevent canvas glitch on mobile devices
  - **Removed `desynchronized: true`** from canvas context - causes visual glitches on:
    - Samsung Exynos GPU
    - Qualcomm Adreno GPU
    - ARM Mali GPU
    - PowerVR GPU
  - **Removed `will-change: contents`** from CSS - overloads mobile GPU memory
  - **Removed `transform: translateZ(0)`** from canvas - conflicts with some mobile browsers
  - Canvas now uses stable, universally-supported GPU hints only
- 🔧 **Canvas Context State Reset** - Prevent GPU state corruption
  - Reset transform matrix with `CTX.setTransform(1, 0, 0, 1, 0, 0)` before init
  - Reset `globalAlpha` and `globalCompositeOperation` to defaults
  - Fill canvas with terrain base color (`#8B9A6B`) to match draw() output
- 📺 **Improved Canvas Visibility Control** - Hidden during initialization
  - Canvas uses `visibility: hidden` during init (not just opacity)
  - Double `requestAnimationFrame` ensures GPU buffer is ready before reveal
  - First frame rendered completely before canvas becomes visible
- 🎮 **Demo Screen GPU-Safe Initialization** - Same fixes applied to demo.js
  - Reset canvas context state before demo starts
  - Use terrain color for initial fill
  - Delay demo loop start with `requestAnimationFrame`

---

## [2.0.0-RC.8] - 2025-12-01

### Fixed
- 🌑 **Complete Shadow Optimization** - All shadows now respect quality settings
  - Tank body shadow: Skip rendering if `shadowQuality < 0.3`
  - Tank turret shadow: Skip rendering if `shadowQuality < 0.3`
  - Bullet shadows (regular + shaped): Dynamic blur and opacity based on quality
  - Plasma teardrop shadow: Skip if `shadowQuality < 0.3`, reduced blur at medium quality
  - Supply crate shadow: Skip if `shadowQuality < 0.3`, reduced blur at medium quality
  - Boss body shadow: Skip if `shadowQuality < 0.3`, blur reduced from 8px to 4px at medium
  - Boss omega shadow: Skip if `shadowQuality < 0.3`, blur reduced from 6px to 3px at medium
  - Boss turret shadows: Skip all 7 turret shadows if `shadowQuality < 0.3`
- 🛤️ **Enemy & Clone Tank Tracks Optimization** - Tracks hidden at lowest quality
  - All enemy tank tracks (including clone tanks) already respect `trackQuality`
  - Tracks completely hidden when `trackQuality = 0` (emergency mode)
  - Track rendering skipped entirely in lowest graphics settings
- 📺 **Enhanced Canvas Glitch Prevention** - Improved transitions between screens
  - Remove `canvas.active` class BEFORE clearing to prevent visible artifacts
  - Fill canvas with terrain base color (`#8B9A6B`) before clear operation
  - Double `requestAnimationFrame` for ultra-clean canvas show transition
  - First frame render delay ensures content is ready before visibility
  - Demo screen uses same robust canvas clearing pattern
- 🎨 **Dynamic Shadow Quality Scaling** - Smoother quality degradation
  - Blur intensity now scales with shadow quality (4px → 2px → none)
  - Shadow opacity now scales with quality for gradual fade-out
  - All shadow effects use `getShadowQuality()` for consistent behavior
- 🔄 **Smooth Graphics Recovery** - All effects restore smoothly when FPS improves
  - All quality values use `smoothPerfValues` with lerp interpolation
  - `PERF_LERP_SPEED = 0.08` ensures buttery smooth transitions both ways
  - Shadows gradually fade in when quality recovers from low to high
  - Tracks reappear smoothly when `trackQuality` lerps from 0 to 1
  - No sudden visual jumps when switching between quality levels

---

## [2.0.0-RC.7] - 2025-11-30

### Fixed
- 📺 **Canvas Glitch Prevention** - Prevent visual glitch when opening game/demo
  - Clear canvas with `CTX.clearRect()` before showing game screen
  - Clear canvas again after resize to ensure no artifacts
  - Add `requestAnimationFrame` delay before showing canvas for clean transition
  - Demo now clears canvas before starting battle loop
- 🎮 **FPS HUD Ultra-Compact Design** - Even shorter and cleaner
  - Reduced padding from 4px to 2px vertical
  - Reduced border from 2px to 1px
  - Reduced font size from 10px to 9px
  - Smaller min-widths (32px/30px/32px) for tighter layout
  - Reduced bottom position from 15px to 12px
- 🏆 **Achievement Popup HUD Transparency** - All HUD elements now fade
  - Added `.fps-hud` and `.minimap-container` to transparency list
  - Reduced opacity from 0.3 to 0.25 for better visibility of popup
- 🔄 **Smooth FPS Optimizer Transitions** - Glitch-free quality changes
  - Added `smoothPerfValues` object with lerp interpolation
  - Quality changes now smoothly transition over multiple frames
  - `PERF_LERP_SPEED = 0.08` for buttery smooth transitions
  - All getter functions now return smoothly interpolated values
  - AI update rate exempt from smoothing (discrete value)

---

## [2.0.0-RC.6] - 2025-11-30

### Fixed
- 📱 **Mobile Game Start Glitch Fix** - Prevent visual glitch when entering battlefield
  - Force canvas resize with dimension reset before showing game screen
  - Reset frame timing state (lastFrameTime, frameTimeAccumulator) on game start
  - Faster canvas fade-in transition (0.3s instead of 0.8s) to reduce visual artifacts
  - Added CSS `contain: layout style paint` for layout stability
- 📱 **Achievement Screen Mobile Scroll Fix** - Enable touch scrolling on mobile
  - Added `touch-action: pan-y` CSS to allow vertical swipe gestures
  - Added `overscroll-behavior: contain` to prevent scroll chaining
  - Touch event handlers now skip achievement screen (allow native scroll)
  - Touchstart/touchmove preventDefault skipped for scrollable UI elements
- 🎯 **FPS Counter HUD Improvements** - Cleaner, more compact design
  - Reduced height with smaller padding (4px vs 6px)
  - Thinner border (2px vs 3px) for lighter visual weight
  - Text now centered evenly within each section
  - Reduced min-widths for tighter layout
  - Added `line-height: 1.2` for better vertical alignment
  - Added `justify-content: center` for even spacing

---

## [2.0.0-RC.5] - 2025-11-30

### Added
- 🔧 **DEBUG_FPS_LIMITER** - Toggle variable to enable/disable FPS limiter (default: `true`)
  - Set to `false` in config.js to disable 60 FPS cap for testing
  - Easy toggle without code changes for performance comparison
- 🧠 **Smart Performance Optimizer v2** - Comprehensive bottleneck detection and optimization
  - `DEBUG_SMART_PERFORMANCE` toggle variable (default: `true`)
  - **Bottleneck Detection System** - Identifies the real source of FPS drops:
    - Particles (GPU fill rate)
    - Enemies (CPU - AI calculations)
    - Bullets (CPU - collision detection)
    - Tracks (CPU/GPU - bezier curve rendering)
    - Effects (GPU - magic circles, auras)
    - Rendering (GPU - shadows, terrain detail)
  - **6 Optimization Levels** (0-5): Full Quality → Emergency Mode
  - **Per-System Optimization Settings**:
    - `particleMultiplier` - Reduce particle spawn rate
    - `maxParticles` - Hard cap on active particles
    - `shadowQuality` - Blur radius reduction (blur() is expensive!)
    - `terrainDetail` - Skip grass blades, pebbles, tire marks
    - `trackQuality` - Use simple lines instead of bezier curves
    - `wallDetail` - Simplified wall rendering
    - `aiUpdateRate` - Skip AI updates (every 2-4 frames)
    - `effectDetail` - Reduce magic effect complexity
  - **Console Access**: `TankDestroyer.perfStatus()` for real-time monitoring
  - **Manual Override**: `TankDestroyer.setPerfLevel(0-5)` for testing
  - **Smart Threshold System** (improved):
    - Full quality (level 0) maintained when FPS ≥ 59
    - Graphics ONLY compromise when FPS drops BELOW 59
    - **Instant recovery** to full quality when FPS returns to 59+
    - Critical threshold: < 45 FPS (jump multiple levels)
    - Warning threshold: < 52 FPS (increase 1 level)
    - Gradual recovery in mid-range (52-58 FPS)

### Fixed
- 📱 **Mobile Browser Glitch Fix** - Complete overhaul of resize handling
  - Added mobile device detection for special handling
  - Debounced resize events (150ms on mobile) to prevent rapid-fire calls
  - Multi-stage orientation change handling (50ms, 150ms, 500ms delays)
  - Skip resize if dimensions haven't actually changed (prevents glitch loops)
  - Added visibility change handler for tab switching/app backgrounding
  - Added window focus handler for PWA/fullscreen mode changes
  - Force re-render after resize if game is active (prevents black screen)
- 🎨 **Shadow Blur Optimization** - blur() filter is now conditional
  - Full blur at high quality (3px radius)
  - Reduced blur at medium quality (1-2px radius)
  - Simple rectangle shadow at low quality (no blur)
- 🏗️ **Track Rendering Optimization**
  - Bezier curves used only at quality >= 0.5
  - Simple straight lines at low quality (much faster)
  - Skip tracks entirely in emergency mode (quality = 0)
- 🌿 **Terrain Detail Optimization**
  - Skip grass blades at quality < 0.7
  - Skip pebbles at quality < 0.5
  - Skip tire marks at quality < 0.8
  - Skip shadows/highlights at quality < 0.6/0.9
  - Solid colors only in emergency mode

### Changed
- 🔧 FPS limiter now conditional on `DEBUG_FPS_LIMITER` flag (game + demo)
- 🔧 Performance monitoring integrated into game loop (every 30 frames)
- 🔧 Enhanced `resize()` function with dimension tracking
- 🔧 Demo battle also uses Smart Performance Optimizer
- 💥 **Bullet Rendering Optimization** - Major FPS improvement
  - Motion blur ghost count reduced from 10 to `ceil(10 * quality)`
  - Simple gradient streak used instead of ghosts at low quality
  - Skip motion blur entirely when `effectDetail < 0.3`
  - Bullet shadows skip blur filter at `shadowQuality < 0.7`
  - Skip bullet shadows entirely at `shadowQuality < 0.2`
  - **Bullet Render Cap** - Limit max bullets drawn based on quality:
    - Full quality: All bullets rendered
    - Medium quality: Max 80 bullets
    - Low quality: Max 40 bullets (excess drawn as simple dots)
  - Motion blur call skipped when `effectDetail < 0.4` (saves CPU)

---

## [2.0.0-RC.4] - 2025-11-30

### Fixed
- 🐛 **Duplicate `TARGET_FPS` declaration** - Removed duplicate const from gameplay.js (already in config.js)
- 🐛 **`checkWall is not defined` error** - Moved `checkWall()` and `checkCrate()` to world.js
  - These collision functions are now available for all modules (systems.js loads before gameplay.js)
- 🐛 **FPS limiter not working on 120Hz+ monitors** - Improved accumulator-based timing
  - Initialize lastFrameTime to -1 for proper first frame detection
  - Accumulate delta time with remainder preservation for precision
  - Reset accumulator if more than 1 frame behind (prevents spiral)

### Changed
- 🔧 Collision helpers (`checkWall`, `checkCrate`) moved from gameplay.js to world.js
- 🔧 FPS limiter now uses `FRAME_TIME` from config.js instead of local constant

---

## [2.0.0-RC.3] - 2025-11-30

### Added
- ⏱️ **60 FPS Frame Rate Limiter** - Stable and consistent frame rate
  - Caps game loop at 60 FPS maximum for power efficiency
  - Prevents unnecessary CPU/GPU usage on high refresh rate monitors
  - Consistent gameplay speed across all devices
  - Applied to both main game loop and demo battle background

### Changed
- 🔧 Improved frame timing with `FRAME_MIN_TIME` check before processing
- 🔧 Demo battle now also uses 60 FPS limiter for consistency

---

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
