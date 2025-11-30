#  Tank Destroyer: Ultimate Edition v2.0.1

The official stable release of Tank Destroyer: Ultimate Edition! This version represents the culmination of extensive testing and refinement through 13 release candidates, delivering a polished and optimized gaming experience.

##  What's New in v2.0.1

### Bug Fixes
- **Graphics Quality on Continue/Load** - Fixed issue where graphics started at lowest quality when loading a saved game
- **Smoother Splash Transition** - Improved animation between splash screen and homepage for seamless visual experience

---

##  Complete Feature List (RC.2  v2.0.1)

###  Performance & Optimization

#### Smart Performance Optimizer v2
- **Intelligent Bottleneck Detection** - Automatically identifies the real source of FPS drops:
  - Particles (GPU fill rate)
  - Enemies (CPU - AI calculations)  
  - Bullets (CPU - collision detection)
  - Tracks (CPU/GPU - bezier curve rendering)
  - Effects (GPU - magic circles, auras)
  - Rendering (GPU - shadows, terrain detail)
- **6 Optimization Levels** (0-5): Full Quality  Emergency Mode
- **Per-System Optimization Settings**: particle multiplier, shadow quality, terrain detail, track quality, AI update rate, effect detail
- **Smart Threshold System**: Maintains full quality at 59+ FPS, only compromises when necessary
- **Console Access**: `TankDestroyer.perfStatus()` for real-time monitoring
- **Manual Override**: `TankDestroyer.setPerfLevel(0-5)` for testing

#### 60 FPS Frame Rate Limiter
- Caps game loop at 60 FPS maximum for power efficiency
- Prevents unnecessary CPU/GPU usage on high refresh rate monitors
- Consistent gameplay speed across all devices

#### GPU Pre-warming System (RC.10)
- **Canvas Pre-warm** - Draw invisible elements to prime GPU before gameplay
- **Context Warming** - Pre-initialize canvas 2D context settings
- **Render Pipeline Kick** - Force GPU to compile shaders before game starts
- **Faster Quality Recovery** - Improved transition when FPS recovers

#### Shadow & Rendering Optimization
- Shadow blur is now conditional based on quality level
- Track rendering uses simple lines at low quality (vs bezier curves)
- Terrain detail dynamically adjusts (grass, pebbles, tire marks)
- Bullet rendering caps and simplified motion blur at lower quality

---

###  Gameplay & Combat

#### AOE Damage System (RC.13)
- **Flak Cannon Area Damage** - Deals 15% damage to enemies within 80px radius
- **Rocket Launcher Splash** - Deals 25% damage to enemies within 120px radius
- **Visual AOE Rings** - Yellow/orange expanding rings show damage radius
- **Balanced Mechanics** - Only affects enemies NOT directly hit by the bullet

#### Bullet Visual Improvements (RC.13)
- **Correct Motion Blur Colors** - Each weapon type now has proper trail colors:
  - Default/Cannon: Red (#ff4444)
  - Railgun: Cyan (#00ffff)
  - Laser: Lime green (#00ff00)
  - Flak: Orange (#ffaa00)
  - Rockets: Orange-red (#ff6600)

---

###  UI/UX Improvements

#### Achievement System Polish
- **Achievement Popup HUD Transparency** - All HUD elements fade during popup display
- **Refined Opacity** - HUD fades to 25% for better popup visibility
- **Mobile Scroll Support** - Touch scrolling enabled on achievement screen

#### FPS HUD Design
- Ultra-compact design with reduced padding and border
- Smaller font (9px) and tighter layout
- Better visual integration with gameplay

#### Splash & Homepage Transitions
- Demo battle starts early (behind splash) for seamless background
- Smooth overlay fade-in when showing homepage
- Reduced animation timing for snappier feel

---

###  Mobile & Cross-Platform

#### Mobile Browser Optimization
- **Glitch-Free Resize Handling** - Debounced resize events on mobile
- **Orientation Change Support** - Multi-stage handling for smooth rotation
- **Canvas Glitch Prevention** - Multi-step clear process before transitions
- **Touch Event Handling** - Proper gesture support for scrollable UI

#### Chrome Mobile Cache Fix (RC.10)
- Fixed issue where Chrome mobile served stale cached files
- Implemented proper cache-busting for reliable updates

---

###  Technical Improvements

#### Smooth Performance Transitions (RC.7)
- Quality changes now smoothly transition over multiple frames
- `PERF_LERP_SPEED = 0.08` for buttery smooth transitions
- Prevents jarring visual changes when optimizer adjusts quality

#### Game State Management
- Graphics quality properly resets on game load/continue
- Frame timing state reset on game start
- Visibility and focus handlers for tab switching/PWA support

#### Build & Debug Tools
- `DEBUG_FPS_LIMITER` toggle for testing without FPS cap
- `DEBUG_SMART_PERFORMANCE` toggle for optimizer testing
- Silent pre-warm logs (reduced console spam)

---

##  Technical Stack

- **Pure JavaScript** - No frameworks, maximum performance
- **HTML5 Canvas** - Hardware-accelerated 2D rendering
- **Web Audio API** - Dynamic sound effects and music
- **Local Storage** - Save/load game progress
- **Service Worker** - Offline support and caching

---

##  Quick Start

```bash
# Clone the repository
git clone https://github.com/mfirmansyahidris/game-tank-destroyer.git

# Open in browser (no build required!)
# Simply open index.html or use a local server:
npx serve .
```

---

##  Documentation

- [README.md](README.md) - Complete game documentation
- [CHANGELOG.md](CHANGELOG.md) - Detailed version history
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines

---

##  Version History Summary

| Version | Key Changes |
|---------|-------------|
| v2.0.1 | Graphics on load fix, smoother splash transition |
| RC.13 | AOE damage, visual rings, bullet trail colors |
| RC.12 | Achievement HUD transparency refinement |
| RC.11 | Achievement popup, game start graphics, prewarm logs |
| RC.10 | GPU pre-warm, faster recovery, Chrome mobile cache |
| RC.9 | Mobile GPU compatibility improvements |
| RC.8 | Shadow optimization, canvas glitch prevention |
| RC.7 | Canvas glitch prevention, FPS HUD design, smooth transitions |
| RC.6 | Mobile game start glitch, achievement scroll, FPS counter |
| RC.5 | Smart Performance Optimizer v2, mobile resize fixes |
| RC.4 | FPS limiter fix for 120Hz+, collision function moves |
| RC.3 | 60 FPS frame rate limiter |
| RC.2 | Initial v2.0.0 release candidate |

---

Built with  using vanilla JavaScript and HTML5 Canvas
