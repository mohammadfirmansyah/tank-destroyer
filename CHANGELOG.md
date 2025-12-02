# Changelog

All notable changes to Tank Destroyer: Ultimate Edition will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.5] - 2025-12-03

### Fixed
- 🔫 **Player Firing Bug After Continue/Load** - Critical save/load fix
  - Player tank now always able to fire immediately after loading saved game
  - Reset `fireDelay`, `overheated`, `temperature` states in `deserializePlayer()`
  - Reset `consecutiveShots`, `lastShotTime`, `thermalLocked` for clean fire state
  - Ensures firing system works identically to new game after continue

- 🖱️ **Mobile Cursor Arrow on Pause Button** - Touch device fix enhancement
  - Added `!important` flag to override any conflicting cursor styles
  - Added wildcard selectors (`*`) to cover all child elements
  - Added `#pause-btn` ID selector for higher specificity
  - Added `.controls-area` and children to cursor: none rule
  - Prevents arrow cursor from appearing on any HUD element tap

### Technical
- `js/saveManager.js`:
  - `deserializePlayer()` now resets:
    - `fireDelay: 0` - fire cooldown
    - `overheated: false` - overheat state
    - `temperature: 20` - normal temperature
    - `baseTemperature: 20` - base temp
    - `thermalLocked: false` - thermal lock
    - `consecutiveShots: 0` - shot counter
    - `lastShotTime: 0` - last shot timestamp

- `css/style.css`:
  - `@media (pointer: coarse)` enhanced with:
    - `.pause-btn, #pause-btn { cursor: none !important; }`
    - `.hud-top *, .stats-panel *, .top-right *` wildcard selectors
    - `.controls-area, .controls-area *` for joystick area
    - `!important` flag ensures override

- `index.html`:
  - Updated version number to v2.1.5

- `js/cache-buster.js`:
  - Updated `CACHE_BUSTER_VERSION` to v2.1.5

## [2.1.4] - 2025-12-03

### Fixed
- 🎵 **Music Playing Wrong Track Bug** - Critical soundtrack fix
  - Fixed opening music playing on achievement, game, and pause screens
  - Fixed `getExpectedTrack()` to properly detect hidden elements (display:none + hidden class)
  - Fixed `onUserInteraction()` to use `getExpectedTrack()` on first interaction instead of stale `pendingTrack`
  - Fixed `play()` to clear `pendingTrack` immediately when user has already interacted
  - Added `isVisible()` helper that checks classList, inline style, and computed style

### Technical
- `js/music.js`:
  - Added `isVisible(el)` helper - checks hidden class, display:none, and computed style
  - Fixed `getExpectedTrack()` to use `isVisible()` for proper screen detection
  - Fixed `onUserInteraction()` - uses `getExpectedTrack()` on first interaction
  - Fixed `play()` - clears `pendingTrack` when user has interacted

- `index.html`:
  - Updated version number to v2.1.4

- `js/cache-buster.js`:
  - Updated `CACHE_BUSTER_VERSION` to v2.1.4

## [2.1.3] - 2025-12-03

### Added
- 🎵 **Comprehensive Music Validation System** - Smart soundtrack verification
  - New `getExpectedTrack()` function determines correct music based on current screen state
  - New `ensureCorrectMusic()` function validates and corrects playing music
  - New `getMusicState()` function for debugging music state
  - Automatic music correction when wrong track is playing
  - Screen detection priority: splash → victory → gameover → pause → achievement → settings → home → game
  - All screen transitions now include music verification with 100ms delay

### Technical
- `js/music.js`:
  - Added `getExpectedTrack()` - determines expected track based on DOM screen visibility
  - Added `ensureCorrectMusic(contextHint)` - validates and corrects music state
  - Added `getMusicState()` - returns debug info about current music state
  - Exported new functions in public API

- `js/input.js`:
  - Added `ensureCorrectMusic()` calls when opening/closing achievements screen

- `js/gameplay.js`:
  - Added `ensureCorrectMusic()` calls in `togglePause()`, `returnHome()`, `startGame()`
  - Added `ensureCorrectMusic()` call in `finalizeGameOver()`

- `js/systems.js`:
  - Added `ensureCorrectMusic()` call in `showVictoryScreen()`

- `js/splash.js`:
  - Added `ensureCorrectMusic()` calls in `startSplashAnimations()`, `showHomepage()`

## [2.1.2] - 2025-12-03

### Fixed
- 🐛 **Mobile Cursor Bug on Pause Button** - Touch device fix
  - Fixed arrow cursor appearing when pressing pause button on mobile
  - Added `cursor: none` for touch devices (`pointer: coarse`) on HUD elements
  - Affects: `.pause-btn`, `.hud-top`, `.stats-panel`, `.top-right`, `.minimap-box`, `#wave-indicator`
  - Cursor now stays hidden during gameplay on mobile devices

### Technical
- `css/style.css`:
  - Added `@media (pointer: coarse)` rule for touch devices
  - Set `cursor: none` on all HUD interactive elements for mobile

- `index.html`:
  - Updated version number to v2.1.2

- `js/cache-buster.js`:
  - Updated `CACHE_BUSTER_VERSION` to v2.1.2

## [2.1.1] - 2025-12-02

### Fixed
- 🐛 **Tank Shooting Bug After Continue** - Critical save/load fix
  - Enemies loaded from save now have `aiState: 'alerted'` instead of default 'patrol'
  - Set `alertShootDelay: 0` so enemies can shoot immediately after continue
  - Added `spawnWarmup: 0` and `spawnHoldoff: 0` for instant engagement
  - Enemies no longer stand idle after loading a saved game

- 🎯 **Magic Skill Range Bug** - Ice and Fire skills activation fix
  - Ice Burst now requires player within 180px range (strict check)
  - Fire Nova now requires player within 150px range (strict check)
  - Added early return in `shouldUseMagicSkill()` to prevent out-of-range activation
  - Skill-specific range constants: `ICE_BURST_RANGE = 180`, `FIRE_NOVA_RANGE = 150`

- 🧊 **Ice/Fire Tank Approach Logic** - Aggressive pursuit behavior
  - Ice and Fire tanks now start in 'approaching' state by default
  - Removed cooldown blocking that prevented approach behavior
  - Added `skillAlmostReady` check (cooldown <= 120 frames) for urgency
  - Speed boost based on `urgencyBonus = (1 - cooldownRatio) * 0.5`
  - Tanks actively pursue player to get within skill range

- 🐛 **Floating Text Performance Bug** - Major performance improvement
  - Added `floatTextMax` limit per quality level (15-100)
  - Prevents floating text array from growing indefinitely
  - Automatic cleanup of oldest non-critical texts when limit reached
  - **Optimized cleanup from O(n²) to O(n)** using single-pass filter
  - Uses swap-with-last removal instead of splice for efficiency
  - Lowest quality: 15 max, Ultra quality: 100 max

### Improved
- 🤖 **Demo AI Configuration** - Full Tier 5 intelligence
  - Demo player now uses complete tier 5 AI configuration
  - Intelligence: 5, Aim Speed: 0.15, Accuracy: 0.90
  - Added `pathSmoothingFactor: 0.15` for smooth movement
  - Includes all tier 5 decision-making capabilities

- 🧭 **Wall Avoidance AI** - Intelligent obstacle navigation
  - Ray-casting system checks obstacles at 100px, 60px, 35px distances
  - 30-frame `wallAvoidanceLock` prevents zigzag movement
  - Smooth angle interpolation using `pathSmoothingFactor`
  - Checks both left and right directions for best escape path
  - Maintains movement commitment during avoidance maneuvers

- 🔫 **Near-Miss Bullet Detection** - Alert system for patrol enemies
  - Bullets passing within 60px of patrol enemies trigger alert
  - Uses angle check (within 45°) to ensure bullet is heading toward enemy
  - Only triggers for player bullets, not enemy bullets
  - Patrol enemies become alerted even when not directly hit
- 🌫️ **Fog of War Animation** - Smoother seamless looping
  - Uses `performance.now()` for sub-millisecond precision timing
  - Added smooth easing function `smoothLoop()` for seamless loop transitions
  - Slower fog wisp speeds with longer periods for natural flow
  - Gentler cloud movement with golden ratio offsets for organic feel
  - Smoother particle drift with varied speeds per mote
  - Longer breathing cycle (~12.5 seconds) for atmospheric pulse

- ⚙️ **Settings Screen** - Full-screen layout redesign
  - Now uses full-screen layout matching Achievement Screen style
  - Added decorative top border glow animation
  - Section cards with background and border styling
  - Larger quality preset buttons with improved touch targets
  - Responsive 2-column grid on mobile (3-column on desktop)
  - Removed emoji from "GRAPHICS SETTINGS" title for cleaner appearance
  - Removed icons from section titles and back button
  - Added "Floating Text" setting display showing current limit

- 📜 **Settings Scrollbar** - Military theme consistency
  - Custom scrollbar matching Achievement Screen style
  - 8px width with rounded thumb
  - Brown/khaki colors matching game theme
  - Hover state for better interactivity

### Changed
- ⚙️ **Settings Screen Animation** - Cleaner appearance
  - Removed fade-in animation when settings screen opens
  - Settings screen now appears instantly for snappier feel
  - Fade-out animation on close still preserved

### Added
- ✨ **Screen Transition Animations** - Smooth closing animations
  - Settings screen now fades out with slide animation when closing
  - Achievement screen now fades out smoothly when returning to home
  - Both screens use 300ms transition duration
  - Consistent animation style across both screens

### Technical
- `js/demo.js`:
  - Added tier 5 AI config: `intelligence`, `aimSpeed`, `accuracy`, `pathSmoothingFactor`
  - Added `smoothMoveAngle`, `smoothMoveWeight` for interpolation
  - Added `wallAvoidanceAngle`, `wallAvoidanceLock` (30 frames)
  - Ray-casting checks at WALL_CHECK_DISTANCE (100), MID_DISTANCE (60), CLOSE_DISTANCE (35)
  - Angle lerp: `current + (target - current) * smoothingFactor`

- `js/saveManager.js`:
  - `createEnemyFromSave()` now includes:
    - `aiState: 'alerted'` - immediate combat readiness
    - `alertShootDelay: 0` - no shooting delay
    - `spawnWarmup: 0` - no spawn protection
    - `spawnHoldoff: 0` - can be targeted immediately
    - `baseSpeed`, `tierId`, wheel/turret visual properties

- `js/config.js`:
  - Added `floatTextMax` to `smoothPerfValues` defaults
  - Added `getFloatTextMax()` getter function
  - Updated `setGraphicsQuality()`, `initGraphicsSettings()`, `updateSmoothPerfValues()`

- `js/systems.js`:
  - `addFloatText()` now enforces `floatTextMax` limit
  - Removes oldest non-critical texts when at capacity
  - Prioritizes keeping critical texts visible
  - Uses swap-with-last removal O(1) instead of splice O(n)
  - First cleans dead texts before checking limit
  - Added `NEAR_MISS_RADIUS = 60` constant
  - Added near-miss detection in `handleBulletCollision()`
  - Modified `shouldUseMagicSkill()` with strict range checks at function start
  - Ice/Fire approach: default 'approaching' state, urgencyBonus calculation
  - `skillAlmostReady = cooldownFrames <= 120` for urgency detection

- `js/render.js`:
  - Fog animation now uses `rawTime` from `performance.now()`
  - Added `smoothLoop()` helper function for seamless sine-based looping
  - **Replaced splice-in-loop O(n²) with single-pass filter O(n)**
  - Uses in-place compaction with array truncation
  - Fog wisps use configurable `period` property per layer
  - Particle positions use `rawTime` with `driftSpeed` multiplier

- `js/input.js`:
  - Added `settingFloatText` element reference
  - `updateSettingsDisplay()` now shows floating text limit

- `index.html`:
  - Added "Floating Text" row in settings info display

- `css/style.css`:
  - `#settings-screen` uses `inset: 0` for full-screen coverage
  - Added `-webkit-overflow-scrolling: touch` for smooth mobile scroll
  - Added `::before` pseudo-element for top glow decoration
  - Added custom scrollbar rules matching achievement screen
  - `.settings-section` has card-style background with shadow
  - `.quality-presets` responsive grid with media query
  - `.settings-back-btn` with arrow icon via `::before`
  - Added `@keyframes settingsFadeOut` and `settingsSlideOut` animations
  - Added `#settings-screen.closing` class for exit animation
  - Added `@keyframes achFadeOut` animation for achievements
  - Added `#achievements-screen.closing` class for exit animation
  - Removed `display: flex` and emoji from `.section-title`
  - Removed `animation: settingsFadeIn 0.4s ease-out` from `#settings-screen`
  - Removed `@keyframes settingsFadeIn` entirely

- `js/input.js`:
  - `closeSettings()` now adds `.closing` class before hiding
  - Achievement back button now triggers fade-out animation
  - Both use 300ms setTimeout matching CSS animation duration

## [2.1.0] - 2025-12-02

### Added
- ⚙️ **Graphics Settings Screen** - User-configurable quality presets
  - 6 quality presets: Ultra, High, Medium, Low, Very Low, Lowest
  - **Default: Lowest quality** for maximum device compatibility
  - Settings saved to localStorage for persistence
  - Real-time preview of current settings values
  - Dramatic military-themed UI with animations

- 🔧 **Settings Button** - Quick access to graphics settings
  - Located above mute button in bottom-left corner
  - Gear icon (⚙️) with rotation animation on hover
  - Same size and style as mute button

### Changed
- 🎵 **Music Start Hint** - Repositioned to horizontal center
  - Now appears in the center-bottom of the screen
  - More prominent with music note icon (🎵)
  - Improved animations with backdrop blur effect

- 📊 **Benchmark HUD** - Simplified display
  - Removed "Level X" text, keeping only quality badge
  - Shows user's graphics setting instead of auto-detected level

### Removed
- 🗑️ **DEBUG_SMART_PERFORMANCE** - Replaced with user-controlled settings
  - Auto-performance adjustment removed
  - Users now have full control over graphics quality
  - Bottleneck detection system removed

### Technical
- `js/config.js`:
  - Added `graphicsQualityLevel`, `loadGraphicsSettings()`, `saveGraphicsSettings()`
  - Added `setGraphicsQuality()`, `getGraphicsQuality()`, `initGraphicsSettings()`
  - Replaced `SMART_PERF_LEVELS` with `GRAPHICS_QUALITY_LEVELS`
  - Removed auto-performance optimizer functions
  
- `index.html`:
  - Added `#settings-screen` with quality presets grid
  - Added `.settings-btn` button with gear icon
  - Moved `.music-start-hint` to center as `.music-start-hint-container`
  - Removed `#bench-quality-level` from benchmark HUD
  
- `css/style.css`:
  - Added comprehensive settings screen styling
  - Added `.preset-btn` grid with active states
  - Updated music hint with centered positioning
  - Hidden `.quality-level` in benchmark HUD
  
- `js/input.js`:
  - Added settings screen open/close handlers
  - Added preset button click handlers with quality application
  - Added `updateSettingsDisplay()` for real-time preview
  
- `js/main.js`:
  - Updated to use `graphicsQualityLevel` instead of `smartPerfLevel`
  - Removed resolution scaling references

---

## [2.0.7] - 2025-12-02

### Added
- 🎵 **Music Start Hint** - Visual prompt to help users start music playback
  - Shows "Tap anywhere to start music" with animated arrow next to mute button
  - Dramatic pulse, glow, and bounce animations for attention
  - Golden/amber color scheme matching game aesthetics
  - Auto-hides when: user interacts with screen OR music is muted
  - Helps with browser autoplay policy (requires user interaction for audio)

### Technical
- `index.html`: Added `.music-start-hint` element with arrow and text
- `css/style.css`: Added `.music-controls-row`, hint styling with keyframe animations
  - `hintPulse` - Scale breathing animation (2s loop)
  - `hintGlow` - Box-shadow glow animation (1.5s alternate)
  - `arrowBounce` - Arrow bounce animation (0.8s loop)
- `js/input.js`: Added `updateMusicStartHint()` function with interaction listeners

---

## [2.0.6] - 2025-12-02

### Removed
- 🗑️ **Resolution Scaling System** - Removed entirely as it did not provide performance benefits
  - Removed `DEBUG_ENABLE_RESOLUTION_SCALING` debug flag
  - Removed `currentResolutionScale` variable
  - Removed `applyResolutionScale()` function
  - Removed `resolutionScale` from SMART_PERF_LEVELS and smoothPerfValues
  - Simplified resize logic in `world.js` and `demo.js`

### Performance Optimizations
- ⚡ **Bitwise Floor Operations** - Replaced `Math.floor()` and `Math.round()` with bitwise operators
  - `(x | 0)` for integer conversion (faster than Math.floor)
  - `(x + 0.5) | 0` for rounding (faster than Math.round)
  - Applied to render-heavy functions: terrain rendering, color calculations, camera positioning

- 🎨 **Disabled Antialiasing** - `imageSmoothingEnabled = false` enforced across all contexts
  - Main canvas context in `draw()` function
  - Demo canvas context in `initDemo()` and resize handler
  - World canvas context in `resize()` function
  - Ensures crisp pixel-art style rendering

- 🖼️ **OffscreenCanvas Terrain Cache** - Added terrain tile caching system
  - Uses `OffscreenCanvas` for hardware-accelerated pre-rendering
  - Falls back to regular canvas on unsupported browsers
  - Includes cache invalidation on camera movement
  - Works with existing frustum culling system

- 🔧 **Optimized Color Functions** - Bitwise operations for RGB manipulation
  - `lightenColor()` uses `(r * factor) | 0` instead of `Math.floor()`
  - `adjustColor()` uses direct bitwise clamping instead of Math.max/min
  - Faster color calculations for hit flashes, terrain, and effects

### Technical
- `js/config.js`: Removed all resolution scaling code, simplified SMART_PERF_LEVELS
- `js/world.js`: Simplified resize() to use reference resolution only
- `js/demo.js`: Removed resolution scaling checks, added antialiasing disable
- `js/render.js`: Added OffscreenCanvas cache, bitwise optimizations, antialiasing control

---

## [2.0.5] - 2025-12-02

### Fixed
- 🎮 **Tank Shooting Bug** - Fixed critical bug where player tank wouldn't shoot after:
  - Game sitting idle for extended periods
  - Switching between screens (menu → game → pause → game)
  - Window losing and regaining focus
  - Loading saved games
  - **Root Cause**: `mouseAim.active` was initialized as `true` but never properly reset during state transitions
  - **Solution**: Added comprehensive input state reset system across all game state transitions

### Changed
- 🔄 **Improved Cache Buster** - Force hard refresh every time application opens
  - Now performs true cache bypass on every fresh page load (not just per session)
  - Uses `fetch` with `cache: 'reload'` header for reliable cache bypass
  - Pre-fetches critical resources (CSS, JS) with cache bypass before reload
  - Improved Chrome Mobile handling for GPU cache issues
  - Clears sessionStorage completely on each refresh for clean state

### Added
- 🎯 **Input State Reset System** - New functions for reliable input handling
  - `resetMouseAimState()` - Complete reset of mouse aim state (position, buttons, angle)
  - Enhanced `resetAllInputStates()` - Now also resets `mouseAim.active`
  - Input reset calls added to: `startGame()`, `returnHome()`, `togglePause()`, `loadGame()`
  - Focus handler now clears stuck mouse button states

### Technical
- `js/config.js`: Changed `mouseAim.active` initial value from `true` to `false`
- `js/input.js`: Added `resetMouseAimState()`, improved event handlers
- `js/gameplay.js`: Added input reset calls in state transition functions
- `js/saveManager.js`: Added input reset calls in `loadGame()`
- `js/cache-buster.js`: Complete rewrite for reliable force refresh

---

## [2.0.4] - 2025-12-02

### Added
- 🎵 **Background Music System** - Immersive audio experience with Army Men RTS OST
  - **Tracks**: 7 unique tracks for different game states (opening, home, achievement, game, pause, failed, victory)
  - **Fade Effects**: Smooth fade-in/fade-out transitions between tracks (800ms)
  - **Streaming**: Audio files loaded on-demand for better performance
  - **Persistence**: Music preference saved to localStorage
  - **Toggle Button**: Music on/off toggle on homepage with mute icon (🔊/🔇)
  - **Save/Resume**: Game music position saved when pausing or quitting
  - **Browser Policy**: Handles autoplay restrictions gracefully with queued playback

- 🤖 **Patrol/Alert AI State System** - Strategic enemy behavior
  - **Patrol Mode**: Enemies spawn in patrol state with 25% speed, unaware of player
  - **Alert Triggers**: Enemies become alerted when:
    - Turret vision spots player (400px range, 45° cone)
    - Enemy takes damage from player
    - 50% or more enemies destroyed (global alert)
  - **Alert Indicator**: Animated "!" above enemy status bar when alerted
  - **Shoot Delay**: 1 second delay before enemy can fire after being alerted
  - **Smart Scanning**: Turret scans open corridors/roads during patrol
  - **Info Sharing**: Nearby enemies (180px) alerted when ally spots player

- ⚠️ **Off-Screen Bullet Warning Indicator** - Visual alert for incoming enemy bullets
  - **Feature**: Animated "!" indicators appear at screen edges when enemy bullets approach from off-screen
  - **Animation**: Pulsing effect with 50% base opacity for non-intrusive alerts
  - **Direction Arrows**: Small directional arrows show bullet approach direction
  - **Color**: Red warning color with glow effect, urgency increases as bullet gets closer
  - **Smart Deduplication**: Nearby warnings are combined to prevent visual clutter
  - **Performance**: Limited to 8 concurrent warnings maximum

- 📐 **Reference Resolution System** - Consistent world view across all devices
  - **Portrait Mode**: 1040px reference height for vertical screens
  - **Landscape Mode**: 480px reference height for horizontal screens
  - **Zoom Behavior**: 
    - Screens larger than reference = zoom in (closer view of battlefield)
    - Screens smaller than reference = zoom out (wider view of battlefield)
  - **Implementation**: Canvas buffer uses reference resolution, CSS stretches to fill screen
  - **Consistency**: Same visual experience on phones, tablets, and desktops

- 📊 **Deferred Status Bar Rendering System** - Status bars render above fog of war
  - **Queue System**: `queueStatusBar()` collects status bars during entity rendering
  - **Batch Render**: `renderDeferredStatusBars()` draws all bars after fog layer
  - **Z-Order**: Status bars now always appear above fog of war effects
  - **Smooth Rendering**: Uses `imageSmoothingEnabled` for anti-aliased appearance

### Fixed
- 🎯 **Crosshair Cursor Not Hiding in Demo Mode**
  - **Bug**: Target cursor (crosshair) remained visible during demo screen
  - **Fix**: Added `demoActive` check in `drawDesktopCrosshair()` function
  - **Result**: Crosshair now properly hidden when viewing demo/title screen

- 🎨 **Inconsistent Crosshair Color**
  - **Bug**: Crosshair color changed based on weapon type
  - **Fix**: Removed weapon-based color logic, crosshair now always uses military red
  - **Result**: Consistent `rgba(255, 80, 80, 0.9)` color regardless of weapon

- 🔳 **Status Bar Blocky Effect** - Smooth rendering for tank status bars
  - **Bug**: Status bars above tanks appeared blocky due to CSS `image-rendering: pixelated`
  - **Fix**: Added `imageSmoothingEnabled = true` and `imageSmoothingQuality = 'high'` for status bar rendering
  - **Affected Elements**: All entity status bars (player, enemy, clone, boss)
  - **Result**: Smooth, anti-aliased status bars while maintaining blocky terrain aesthetic

- 📏 **Status Bar Scaling During Resolution Changes** - Consistent size at all resolutions
  - **Bug**: Status bars scaled incorrectly during resolution scaling (appeared larger at lower resolutions)
  - **Fix**: Implemented inverse scaling system to compensate for CTX.scale()

- 🗺️ **Minimap Smooth Rendering**
  - **Bug**: Minimap appeared blocky like game canvas
  - **Fix**: Enabled `imageSmoothingEnabled = true` and `imageSmoothingQuality = 'high'` on minimap context
  - **Result**: Clean, smooth minimap rendering

- 🖱️ **Mouse to World Coordinate Conversion**
  - **Bug**: Mouse aiming incorrect with reference resolution system
  - **Fix**: Updated coordinate conversion to use buffer dimensions vs screen dimensions
  - **Formula**: `worldPos = camera + screenPos * (bufferSize / screenSize)`

- 🎯 **Turret Not Following Cursor**
  - **Bug**: Turret only rotated when mouse button pressed
  - **Fix**: Added turret tracking when `mouseAim.active` even without clicking
  - **Result**: Turret always follows cursor for better aiming feedback

### Improved
- 🤖 **Enemy AI Movement** - Smoother, more realistic tank movement
  - **Tier-based Smoothing**: Higher tier enemies have smoother movement (0.08-0.18 smoothing factor)
  - **Tier-based Turn Speed**: Higher tier enemies turn slower but more strategically
  - **All Enemies Dodge**: All tiers can now dodge bullets (lower tier = weaker/slower dodge)
  - **Demo Player AI**: Wall avoidance system for demo player

- 🌫️ **Fog of War Performance** - Respects `smoothPerfValues.fogQuality`
  - **Quality Scaling**: Fog layers skip rendering when quality < threshold
  - **Layer 1**: Always renders (basic fog)
  - **Layer 2-8**: Progressive quality requirements (0.3-0.7)
  - **Result**: Better FPS on lower-end devices

- 📦 **Crate Drop System**
  - **Change**: Crates now only drop consumables (HP, Energy, Shield, Armor)
  - **Reason**: Weapons should only come from enemy kills
  - **Drop Rates**: HP 35%, Energy 30%, Shield 20%, Armor 15%

- 🏗️ **Wall/Crate HP Scaling**
  - **Crates**: Base HP 50, exponential scaling (1.5^wave)
  - **Walls**: Base HP 800, aggressive scaling with wave bonus
  - **Result**: Very easy early game, challenging late game

- 🎖️ **Wave System**
  - **Starting Enemies**: 10 per wave (was 15)
  - **Scaling**: +2 per wave (10 at wave 1, 30 at wave 11)
  - **Spawn Distance**: Enemies spawn 1000-2500px from player (was 500-1500)
  - **Separation**: Enemies spawn 350px apart minimum (was 200px)

---

## [2.0.3] - 2025-12-01

### Fixed
- 🗺️ **Minimap Edge Indicator Size & Position** - Now matches enemy indicator and touches edge
  - **Bug 1**: Edge indicators for off-screen enemies were too small (only 4 pixels)
  - **Bug 2**: Edge indicators had 10-15px gap from minimap edge
  - **Fix**: Changed indicator size to `35 * zoom` with minimal edge padding
  - **Visual**: Edge indicators now use enemy body color instead of weapon color
  - **Result**: Off-screen indicators are clearly visible and positioned at true edge

- 🖱️ **Mouse Aiming System Overhaul** - Direction-based instead of screen-center
  - **Bug**: Turret rotation was calculated from screen center, causing inaccurate aiming at screen edges
  - **Fix**: Mouse position now converts to world coordinates relative to player position
  - **Controls Reworked**:
    - **Left-Click**: Aim and shoot toward mouse position
    - **Right-Click**: Move tank toward mouse direction
  - **Cursor Hidden**: Mouse cursor hidden during gameplay for immersion
  - **Context Menu Blocked**: Right-click no longer opens browser context menu during gameplay
  - **Result**: Intuitive point-and-click controls like top-down shooters

- 🎯 **Resolution Scaling Double Rendering Bug** - Fixed blur instead of blocky pixels
  - **Bug**: Resolution scaling was causing blurry rendering instead of crisp pixel-art
  - **Root Cause 1**: `CTX.scale(resScale)` in draw() was applied AFTER canvas buffer resize
    - Canvas buffer resize already handles scaling
    - Additional CTX.scale() caused double scaling → blurry output
  - **Root Cause 2**: `imageSmoothingEnabled` was still `true` in some code paths
  - **Root Cause 3**: `imageRendering` CSS was not set to 'pixelated'
  - **Fix Applied**:
    - Removed `CTX.scale(resScale)` from main draw loop
    - Set `imageSmoothingEnabled = false` in applyResolutionScale()
    - Set CSS `image-rendering: pixelated` for crisp upscaling
    - Viewport bounds now use buffer dimensions (CANVAS.width/height)
  - **Result**: Clean, blocky Minecraft-style pixels at lower resolution settings

- 🏷️ **HUD Size Scaling During Resolution Changes** - Consistent visual size
  - **Bug**: Status bars, labels, and effects above tanks scaled up when resolution decreased
  - **Cause**: Fixed pixel sizes rendered larger after CSS upscaling to display resolution
  - **Fix Applied**:
    - All HUD dimensions multiplied by `resScale` factor
    - Font sizes, shadow blur, corner radius, line widths all scaled
    - `drawUnifiedStatusPanel()` now uses scaled dimensions
    - `drawStatusBarEnhanced()` receives `resScale` parameter
    - Legacy `drawStatusBar()` also passes resolution scale
  - **Affected Elements**:
    - HP bars for player, enemy, clone, boss tanks
    - Status effect bars (shield, armor, burn, freeze, etc.)
    - Entity type labels (YOURS, ALLY, ENEMY, BOSS)
    - Glow effects and animated pulses
  - **Result**: HUD elements maintain consistent visual size regardless of resolution setting

### Added
- 📉 **Resolution Scaling for FPS Optimizer** - Reduces render load on lower settings
  - **Feature**: Canvas now renders at reduced resolution when performance drops
  - **Resolution Scale by Performance Level**:
    - Level 0 (Ultra): 100% native resolution (blocky but full res)
    - Level 1 (High): 95% resolution
    - Level 2 (Medium): 85% resolution
    - Level 3 (Low): 75% resolution
    - Level 4 (Very Low): 65% resolution
    - Level 5 (Emergency): 50% resolution
  - **Pixel-Art Rendering**: Blocky upscaling like Minecraft (no blur)
    - `imageSmoothingEnabled = false` for crisp pixels
    - CSS `image-rendering: pixelated` for browser-level sharpness
  - **No Zoom Effect**: Camera uses display dimensions, not buffer size
  - **UI Preserved**: HTML elements (health bar, wave counter, etc.) stay at native resolution
  - **Controls Unaffected**: Touch joysticks and mouse input work normally
  - **Result**: Significant FPS improvement with retro pixel-art aesthetic

- 📊 **Demo Benchmark HUD** - Comprehensive performance monitor for homepage demo
  - **Feature**: Hold on homepage background to reveal benchmark overlay
  - **Trigger**: Press and hold (300ms) on homepage dimmed background area
  - **Stats Display**:
    - **FPS**: Current frames per second with color-coded status
    - **AVG**: Rolling average FPS over 2 seconds (120 samples)
    - **MIN**: Lowest FPS recorded during benchmark session
    - **MAX**: Highest FPS recorded during benchmark session
    - **MS**: Frame time in milliseconds
  - **Quality Info**:
    - **Quality Badge**: Shows current graphics level (ULTRA/HIGH/MEDIUM/LOW/VERY LOW/EMERGENCY)
    - **Level Number**: Displays SmartPerf optimization level (0-5)
    - **Badge Colors**: Color-coded by quality level (green → yellow → orange → red)
  - **Resolution Display**:
    - Shows target render resolution (e.g., "960 × 540 (50%)")
    - Updates dynamically based on quality level
  - **Animation**:
    - Smooth fade-in with scale effect (0.9 → 1.0)
    - Bouncy easing: `cubic-bezier(0.34, 1.56, 0.64, 1)`
    - Subtle pulse glow animation when active
    - Matches "Release to Show Menu" box style
  - **Positioning**: Appears above the "Release to Show Menu" hint box
  - **Use Case**: Benchmark demo performance and monitor SmartPerf decisions
  - **Result**: Professional performance monitoring without entering gameplay

- 📝 **Enhanced Console Logging for Performance Optimizer**
  - **Improvement**: Console logs now include resolution information
  - **Format**: `Level: X - Description | Resolution: WxH (P%)`
  - **Details Shown**:
    - Current performance level and description
    - Actual render resolution in pixels (width × height)
    - Resolution scale percentage
  - **Use Case**: Debug and monitor resolution scaling in real-time
  - **Result**: Better visibility into performance optimizer decisions

### Technical Details
- `render.js`: Fixed edge indicator in `drawMinimap()`
  - Changed `indicatorSize = 4` to `indicatorSize = 35 * zoom`
  - Edge padding now uses `indicatorSize * 0.7` instead of fixed 10-15px margin
  - Uses `enemyBodyColor` instead of weapon color for consistency
  - Added CTX.scale() for resolution scaling at start of draw()
  - Updated viewport bounds to use `displayWidth`/`displayHeight`
- `config.js`: Added resolution scaling to Smart Performance Optimizer
  - Added `displayWidth` and `displayHeight` global variables for viewport size
  - Added `resolutionScale` property to `smoothPerfValues`
  - Added `currentResolutionScale` tracker variable
  - Added `applyResolutionScale(scale)` function for dynamic scaling
  - Updated all `SMART_PERF_LEVELS` with `resolutionScale` values
  - Updated `resetSmartPerformance()` to reset resolution to 1.0
  - Updated `updateSmoothPerfValues()` to apply resolution changes smoothly
  - Extended `mouseAim` object with `leftDown`, `rightDown`, `worldX`, `worldY` properties
- `input.js`: Reworked mouse input handlers
  - `mousemove`: Calculates angle from player to mouse in world coordinates
  - `mousedown`: Left-click (button 0) for shooting, Right-click (button 2) for movement
  - `mouseup`: Releases corresponding button state
  - `contextmenu`: Prevents browser context menu during gameplay
- `gameplay.js`: Updated player controls
  - Camera uses `displayWidth`/`displayHeight` for consistent view
  - Movement priority: Touch joystick > Right-click mouse > WASD
  - Firing priority: Touch joystick > Arrow keys > Left-click mouse
- `world.js`: Updated `resize()` function
  - Stores display dimensions in `displayWidth`/`displayHeight`
  - Canvas internal buffer scales with `currentResolutionScale`
  - CSS width/height maintains viewport dimensions for upscaling
  - Formula: `buffer = viewport × resolutionScale`, CSS = viewport
- `demo.js`: Updated for resolution scaling consistency
  - Uses `displayWidth`/`displayHeight` for camera calculations
  - Applies resolution scaling in startDemo() and resize handler
  - Overlay renders at display resolution with CTX.scale()
- `style.css`: Added `cursor: none` to `#gameCanvas` for hidden cursor during gameplay
- `main.js`: Added comprehensive Demo Benchmark HUD system
  - Dedicated `#demo-benchmark-hud` element with independent animation loop
  - `startBenchmark()`: Initializes tracking and shows HUD with animation
  - `stopBenchmark()`: Cleans up and hides HUD on release
  - `benchmarkLoop()`: Independent requestAnimationFrame loop for FPS calculation
  - Tracks FPS samples, calculates AVG/MIN/MAX statistics
  - Quality level mapping: ULTRA/HIGH/MEDIUM/LOW/VERY LOW/EMERGENCY
  - Color-coded quality badges with CSS class switching
  - Target resolution calculation based on quality level
- `index.html`: Added Demo Benchmark HUD structure
  - `#demo-benchmark-hud` with header (title + quality badge) and footer (resolution)
  - Stats grid: FPS, AVG, MIN, MAX, MS with individual IDs
  - Quality badge and level display elements
- `style.css`: Added Demo Benchmark HUD styling
  - Glassmorphism design matching hold-hint box
  - Bouncy animation: `cubic-bezier(0.34, 1.56, 0.64, 1)`
  - Scale transform: `scale(0.9)` → `scale(1)` on active
  - Pulse glow animation: `benchmark-pulse 2.5s ease-in-out infinite`
  - Color-coded quality badges (quality-ultra through quality-emergency)
  - Responsive positioning: `bottom: clamp(140px, 22vh, 220px)`
- `config.js`: Updated console logging with target resolution info
  - All SmartPerf console logs now show target resolution
  - Format: `Target Resolution: WxH (P%)`
  - Shows width, height, and percentage based on quality level settings

### Fixed (Additional)
- 🖼️ **Viewport Culling with Resolution Scaling** - Prevents edge clipping
  - Fixed viewport bounds calculations to use `displayWidth`/`displayHeight`
  - Ensures all objects render correctly during resolution scaling
  - Affected areas:
    - Tank track rendering culling bounds
    - Wall rendering visibility check
    - Crate rendering visibility check
    - Player clone rendering visibility check
    - River border rendering visibility check
  - **Result**: No visual artifacts at screen edges when resolution scaling is active

- 🌫️ **Fog of War Stability with Resolution Scaling** - Consistent coverage
  - **Bug**: Fog of war would shrink when resolution scaling reduced canvas buffer size
  - **Cause**: Fog used `CANVAS.width/height` which changes with resolution scale
  - **Fix**: Now uses `displayWidth`/`displayHeight` for fog positioning
  - **Technical**: Added `CTX.scale(scale, scale)` to map display coords to buffer
  - **Result**: Fog of war maintains consistent visual coverage at all quality levels

- 🔍 **Double Scaling Bug in Game Screen** - Prevents zoom effect
  - **Bug**: Game screen would zoom in when SmartPerf reduced resolution
  - **Cause**: Both `resize()` in world.js and `applyResolutionScale()` in config.js were applying resolution scaling, causing double application
  - **Fix**: 
    - `resize()` now tracks display dimensions (not buffer) for resize detection
    - `applyResolutionScale()` no longer updates world.js tracking variables
    - Separated concerns: resize handles window changes, applyResolutionScale handles quality changes
  - **Result**: Resolution scaling works correctly without zoom effect

- 🎮 **Enemy/Clone Status Bars Coordinate System** - Consistent world-space rendering
  - **Bug**: Enemy and clone status bars were using screen coordinates inconsistently
  - **Cause**: Status bars were calling `CTX.resetTransform()` and using cached screen coords
  - **Fix**: Now renders in world space like player status bars (camera transform already applied)
  - **Result**: All entity status bars render consistently regardless of resolution scaling

### Added (Additional)
- 🔧 **DEBUG_ENABLE_RESOLUTION_SCALING Flag** - Development toggle for resolution scaling
  - **Feature**: New debug flag in `config.js` to enable/disable resolution scaling system
  - **Default**: `false` (disabled) - canvas always renders at native 100% resolution
  - **When Enabled** (`true`):
    - SmartPerf adjusts resolution based on FPS performance
    - Resolution scales from 100% (Ultra) down to 50% (Emergency)
    - Blocky pixel-art rendering at reduced resolutions
  - **When Disabled** (`false`):
    - All resolution-related code uses 100% native resolution
    - SmartPerf still adjusts other quality settings (particles, shadows, etc.)
    - Benchmark HUD shows 100% regardless of quality level
  - **Affected Files**: `config.js`, `world.js`, `render.js`, `demo.js`, `main.js`
  - **Use Case**: Toggle resolution scaling feature for testing/debugging
  - **Result**: Easy control over experimental resolution scaling feature

- 🎨 **Always-Active Blocky/Pixelated Rendering** - Consistent retro aesthetic
  - **Feature**: Pixel-art rendering style now active at ALL quality levels
  - **Regardless of Resolution Scale**:
    - `imageSmoothingEnabled = false` always set
    - CSS `image-rendering: pixelated` always applied
  - **Result**: Crisp, blocky Minecraft-style graphics even at 100% resolution

---

## [2.0.2] - 2025-12-01

### Added
- 🗺️ **Minimap Edge Indicators for Enemies** - Track off-screen threats
  - Enemies outside minimap view now show as small diamond indicators at the edge
  - Indicators appear at 50% opacity for clear visibility without being intrusive
  - Each indicator uses the enemy's weapon color for easy identification
  - Helps players track enemies approaching from outside visible minimap area

- 🎯 **Guaranteed Weapon Drop on First Kill** - Ensures weapon progression
  - First kill of each wave now **guarantees** a weapon drop if player needs upgrade
  - Trigger condition: Player's weapon tier < current wave number
  - Drops the exact next-tier weapon player needs (e.g., wave 3 with tier 1 weapon → tier 2 weapon)
  - Prevents RNG from blocking weapon progression

### Fixed
- ⚔️ **Balanced Weapon Drop Distribution** - Even progression from wave 1-11
  - **Problem**: Players could get high-tier weapons too early, or miss upgrades
  - **Fix**: Weapon drops now follow strict wave-based tier limits:
    - Wave 1: Max Tier 2 (twin)
    - Wave 2: Max Tier 3 (shotgun)
    - Wave 3: Max Tier 4 (sniper)
    - Wave 4: Max Tier 5 (burst)
    - Wave 5: Max Tier 6 (ice)
    - Wave 6: Max Tier 7 (fire)
    - Wave 7: Max Tier 8 (flak)
    - Wave 8: Max Tier 9 (rocket)
    - Wave 9: Max Tier 10 (electric)
    - Wave 10: Max Tier 11 (laser)
    - Wave 11: Max Tier 12 (gauss)
  - **Result**: Guaranteed access to highest tier weapon (gauss) by wave 11
  - Combined with first-kill guarantee, players WILL get weapon upgrades each wave

### Technical Details
- `render.js`: Added enemy edge indicator rendering after boss edge indicator in `drawMinimap()`
  - Uses same pattern as boss indicator but simpler (small diamond, 50% opacity)
  - Loops through all enemies and calculates minimap position
  - Clamps position to minimap edge when enemy is outside view
- `systems.js`: 
  - Added `waveFirstKillTracker` object to track first kills per wave
  - Added `shouldGuaranteeWeapon` logic in `spawnDrop()` for first-kill weapon guarantee
  - Updated `filterPool()` with `maxTierForWave = currentWave + 1` cap
  - Updated minWave values for all weapons to match tier distribution
  - Guaranteed weapon drop bypasses RNG and directly spawns next-tier weapon
- `gameplay.js`: Reset `waveFirstKillTracker` in `startGame()` for clean state

---

## [2.0.1] - 2025-12-01

### Fixed
- 🎮 **Graphics Quality on Continue/Load** - Game now starts at full quality
  - **Bug**: When loading saved game, graphics started at lowest setting then slowly improved
  - **Root Cause**: `resetSmartPerformance()` was not called in `loadGame()`
  - **Fix**: Added `resetSmartPerformance()` call in `saveManager.js` after loading save data
  - **Result**: Continue/Load now immediately uses maximum graphics quality

- ✨ **Splash to Homepage Transition** - Smoother, more seamless animation
  - **Bug**: There was a noticeable gap/black frame between splash fade and homepage appearance
  - **Root Cause**: Demo battle only started AFTER splash was completely gone
  - **Improvements**:
    - Demo now starts early (behind splash screen) for seamless background transition
    - Reduced exit timing: 800ms → 600ms for snappier feel
    - Total transition time: 1800ms → 1400ms (faster, smoother)
    - Overlay now has proper opacity fade-in animation
    - Added transform transition for menu entrance effect
  - **Result**: No more black frame between splash and homepage

### Technical Details
- `saveManager.js`: Added `resetSmartPerformance()` call after save data restoration
- `splash.js`:
  - `dismissSplash()`: Now calls `initDemo()` early before splash fade-out
  - `showHomepage()`: Removed duplicate `initDemo()` call, added smoother overlay transitions
  - Exit timing reduced: 800ms → 600ms (initial delay), 1800ms → 1400ms (total)

---

## [2.0.0-RC.13] - 2025-12-01

### Fixed
- 💥 **Flak Cannon AOE Damage** - Now correctly deals splash damage on impact
  - **Bug**: Flak had explosion particles but NO actual AOE damage to nearby enemies
  - **Fix**: Added AOE damage logic + visual AOE ring indicator
  - **AOE Radius**: 80 pixels from impact point
  - **Splash Damage**: 35% of base damage (120 × 0.35 = 42 max splash)
  - **Damage Falloff**: Linear based on distance from impact center
  - **Visual**: Orange expanding ring shows blast radius

- 🚀 **Rocket Launcher AOE Damage** - Increased splash damage and added visual indicator
  - **Bug**: Rocket had visual effects but weak/no actual AOE damage
  - **Fix**: Increased AOE damage percentage + added visual ring
  - **AOE Radius**: 120 pixels from impact point
  - **Splash Damage**: 50% of base damage (250 × 0.50 = 125 max splash)
  - **Damage Falloff**: Linear based on distance from impact center
  - **Visual**: Red expanding ring shows blast radius

- 🎨 **Bullet Motion Blur Colors** - Fixed mismatched trail colors for 4 weapons
  - **Bug**: Motion blur trail colors didn't match bullet colors
  - **Cannon**: Was yellow `#c0a000` → Now pastel gray `#c8d0d8` (matches gray bullet)
  - **Twin**: Was orange `#ff9944` → Now pastel green `#4ade80` (matches green bullet)
  - **Shotgun**: Was amber `#ffaa22` → Now pastel pink `#e879f9` (matches pink bullet)
  - **Burst**: Was blue `#44aaff` → Now pastel gold `#ffe066` (matches gold bullet)
  - **Note**: Other weapons (sniper, flak, rocket, etc.) unchanged - already correct

### Added
- 🎯 **Visual AOE Ring Indicator** - New particle type `aoeRing`
  - Shows players the actual blast radius of AOE weapons
  - Outer ring expands from 60% to 100% of AOE radius
  - Inner ring adds visual depth
  - Color-coded: Orange for Flak, Red for Rocket
  - Smooth fade-out as ring expands
  - Rendered in `render.js` particle system

- 🔧 **`lightenColor()` Helper Function** - Color manipulation utility
  - Parameters: `(hexColor, percent = 30)`
  - Blends input color toward white by specified percentage
  - Used by `drawBulletWaterTrail()` for brighter trail colors

### Technical Details
- AOE Damage Values:
  - **Flak Cannon**: 80px radius, 35% splash damage (was: none)
  - **Rocket Launcher**: 120px radius, 50% splash damage (was: 40%)
- Visual Ring Properties:
  - Outer ring: 18 frame lifetime, expands from 60% to 100% radius
  - Inner ring: 12 frame lifetime, expands from 30% to 70% radius
  - Line width thins as ring expands (6px → 2px)
  - Alpha fades smoothly (0.7 → 0)
- Both enemy and boss collisions create AOE rings
- Screen shake: Rocket 12-15, Flak 8-10
- Trail lightening: 25% blend toward white for all bullet trails
- Cannon spark particles: Changed from yellow to light steel gray

---

## [2.0.0-RC.12] - 2025-12-01

### Fixed
- 🏆 **Achievement Popup HUD Transparency Refined** - Only TOP HUD elements fade
  - **Bug**: RC.11 made ALL HUD elements transparent including bottom controls
  - **Expected**: Only top-screen HUD should fade, bottom controls stay visible
  - **Fix**: Removed bottom control selectors from CSS rule
    - ❌ Removed: `.controls-area`, `.controls-area *`, `.keyboard-hint`, `.ability-btn`
    - ❌ Removed: `#ult-btn`, `#turbo-btn`, `#lifesteal-timer`, `#magnet-timer`, `.fps-hud`
    - ✅ Kept: `.hud-top`, `.hud-top *`, `#wave-indicator`, `#wave-timer`, `#pause-btn`
    - ✅ Kept: `.minimap-container`, `#minimap`
  - **Result**: Joysticks, turbo button, ultimate button, FPS counter stay fully visible

### Verified
- ✅ **FPS Limiter System** - Correctly respects `DEBUG_FPS_LIMITER` flag
  - When `DEBUG_FPS_LIMITER = true` → FPS capped at 60 (consistent gameplay)
  - When `DEBUG_FPS_LIMITER = false` → FPS uncapped (runs at monitor refresh rate)
  - Verified: No hidden FPS limitations during spawn sequence
  - Physics uses FIXED_TIMESTEP (60Hz) for consistent game speed regardless of FPS

---

## [2.0.0-RC.11] - 2025-12-01

### Fixed
- 🏆 **Achievement Popup HUD Transparency** - All HUD elements now properly fade
  - **Bug**: Only HUD elements directly overlapped by popup became transparent
  - **Fix**: Use CSS `!important` to override any inline styles or JS-set opacity
  - **Added selectors**: `.hud-top *`, `.controls-area *`, `#pause-btn`, `#minimap`
  - **Result**: ALL top-screen HUD elements fade to 25% opacity when achievement shows

- 🎮 **Game Start Full Quality Graphics** - Fix degraded graphics on deploy
  - **Bug**: Game started with lowest graphics setting, then slowly improved
  - **Root Cause**: `smoothPerfValues` retained degraded state from demo/previous session
  - **New `resetSmartPerformance()` Function** - Resets ALL performance values instantly
    - Resets `smartPerfLevel` to 0 (full quality)
    - Clears FPS history and bottleneck detection
    - Sets all `smoothPerfValues` to full quality immediately (no lerp delay)
  - **Called in `startGame()`** before canvas initialization
  - **Result**: Game always starts at maximum graphics quality

- 📝 **Improved PreWarm Console Logs** - Differentiate canvas initialization sources
  - `[PreWarm] Main canvas GPU initialized (page load)` - main.js on page load
  - `[PreWarm] Demo canvas GPU initialized (startDemo)` - demo.js for homepage battle
  - `[PreWarm] Game canvas GPU initialized (startGame)` - gameplay.js for actual game

---

## [2.0.0-RC.10] - 2025-12-01

### Fixed
- 📱 **GPU Pre-Warm Solution** - Fix first-frame canvas glitch on mobile devices
  - **Root Cause**: Canvas texture never initialized on mobile - GPU shows uninitialized buffer
  - **New `preWarmCanvas()` Function** - Renders dummy frame during page initialization
    - Draws checkerboard pattern to force GPU texture memory allocation
    - Fills with terrain base color (`#8B9A6B`) for seamless first frame
    - Uses `CTX.getImageData(0,0,1,1)` to force synchronous GPU flush
  - **Multiple Pre-Warm Points** - Comprehensive coverage across all entry points:
    - `main.js`: preWarmCanvas() called in initializeGame() after page load
    - `splash.js`: preWarmCanvas() called in initSplash() after assets loaded
    - `gameplay.js`: Full GPU pre-warm sequence in startGame() (checkerboard → fill → flush)
    - `demo.js`: Full GPU pre-warm sequence in startDemo() (checkerboard → fill → flush)
  - **Mobile-Specific Fix** - Targets Samsung, Qualcomm, Mali, PowerVR GPUs
    - First frame now shows clean terrain color instead of garbage buffer
    - No more black/glitchy frame on first game/demo screen transition
    - Works reliably on all mobile devices tested

- ⚡ **Faster Graphics Recovery** - Instant quality restoration when FPS >= 59
  - **Bug Fixed**: Graphics had noticeable delay returning to full quality when FPS improved
  - **Root Cause**: Single lerp speed (0.08) was too slow for recovery
  - **Solution**: Asymmetric lerp speeds - fast recovery, slow degradation
    - `PERF_LERP_SPEED = 0.08` - Slow transition when DECREASING quality (smooth degradation)
    - `PERF_LERP_SPEED_RECOVERY = 0.25` - FAST transition when RECOVERING quality (instant feel)
  - **Result**: Graphics snap back to full quality within ~12 frames (0.2 seconds) instead of ~75 frames (1.25 seconds)

- 🌐 **Chrome Mobile Cache Fix** - Prevent glitches from stale GPU cache state
  - **Issue**: Chrome Mobile (non-incognito) showed canvas glitches due to corrupt cached GPU state
  - **Detection**: Added `isChromeMobile()` function to detect Chrome on Android/iOS
  - **Version Change Detection**: Clear corrupt cache state when app version changes
  - **Extra Cache Clearing**: Chrome Mobile gets additional cache clearing on version update
  - **Safe Game Saves**: Only clears cache-related data, preserves player saves and high scores

---

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
