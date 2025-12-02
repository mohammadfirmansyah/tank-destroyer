// --- CONFIG ---
// Global configuration wires up canvas references plus world bounds so other
// modules can import them without re-querying the DOM every frame.
const WORLD_W = 10000; // Expanded Battlefield Size
const WORLD_H = 10000;
const RIVER_WIDTH = 80; // Width of river border around the battlefield
const RIVER_BOUNDARY = RIVER_WIDTH + 35; // Collision boundary for river (accounts for tank visual width ~30px)
const CANVAS = document.getElementById('gameCanvas');

// Display dimensions (actual viewport size) - separate from canvas buffer size
// These are used for camera/viewport calculations to ensure consistent zoom behavior
// between game screen and demo screen across all display sizes
// NOTE: Both gameplay.js and demo.js use displayWidth/displayHeight for camera calculations,
// ensuring the same "zoom level" (relative tank size to screen) on any screen size
let displayWidth = window.innerWidth;
let displayHeight = window.innerHeight;

// === MOBILE-COMPATIBLE CANVAS CONTEXT SETTINGS ===
// These settings prioritize stability across all devices including mobile GPUs:
// - alpha: false - Disables alpha channel for opaque canvas (performance boost)
// - willReadFrequently: false - Optimizes for write-only operations
// NOTE: desynchronized removed - causes visual glitches on mobile GPUs
//       (Samsung, Qualcomm Adreno, Mali, PowerVR have issues with async rendering)
const CTX = CANVAS.getContext('2d', { 
    alpha: false,
    willReadFrequently: false
});

// Apply GPU-friendly settings that work on all devices
// Disable image smoothing for crisp pixel-art look (blocky like Minecraft)
CTX.imageSmoothingEnabled = false;

// Minimap canvas with mobile-safe settings
const MINI_CANVAS = document.getElementById('minimap');
const MINI_CTX = MINI_CANVAS.getContext('2d', { 
    alpha: true, 
    willReadFrequently: false
});
// Enable smoothing for clean minimap rendering (not blocky)
MINI_CTX.imageSmoothingEnabled = true;
MINI_CTX.imageSmoothingQuality = 'high';
const ENEMY_WALL_PADDING = 8; // Reduced to allow tanks to pass through narrow passages
const SPAWN_WARMUP_FRAMES = 300; // 5 seconds at 60fps for dramatic spawn animation
const WAVE_INTERMISSION_FRAMES = 300; // 5 seconds at 60fps for wave reward popup

// Player Ultimate Types - Upgrades every 3 waves
const PLAYER_ULTIMATES = {
    // Wave 1-3: Default BEAM ultimate
    BEAM: {
        name: 'DEVASTATOR',
        description: 'Powerful piercing beam',
        unlockWave: 1,
        chargeTime: 120, // 2 seconds charge
        killsRequired: 10,
        color: '#22c55e',
        icon: '⚡'
    },
    // Wave 4-6: SHOCKWAVE ultimate (area damage over time + stun)
    SHOCKWAVE: {
        name: 'SHOCKWAVE',
        description: 'Area DOT + stun',
        unlockWave: 4,
        chargeTime: 90, // 1.5 seconds charge
        killsRequired: 8,
        color: '#3b82f6',
        icon: '💥',
        radius: 400,
        duration: 180, // 3 seconds of damage
        tickInterval: 6, // Damage tick every 0.1 seconds (6 frames)
        maxDamagePercent: 0.90, // Max 90% of enemy HP as total damage
        stunDuration: 120 // 2 seconds stun
    },
    // Wave 7-9: BERSERKER ultimate (speed + damage + invincibility)
    BERSERKER: {
        name: 'BERSERKER',
        description: 'Rage mode',
        unlockWave: 7,
        chargeTime: 60, // 1 second charge
        killsRequired: 6,
        color: '#ef4444',
        icon: '🔥',
        duration: 720, // 12 seconds (was 8)
        speedMultiplier: 2.0,
        damageMultiplier: 2.5,
        fireRateMultiplier: 2.0
    },
    // Wave 10+: CLONE ultimate (spawn ally tanks)
    CLONE: {
        name: 'CLONE ARMY',
        description: 'Summon allies',
        unlockWave: 10,
        chargeTime: 120, // 2 seconds charge
        killsRequired: 10,
        color: '#a855f7',
        icon: '👥',
        cloneCount: 3, // Number of clones to spawn (configurable)
        cloneTier: 7, // AI tier for clones - uses HIGHEST tier (Tier 7 Electric, intelligence: 6)
        cloneHPPercent: 0.5, // Clone HP = 50% of player HP
        // NOTE: Clones are permanent - they only die when HP reaches 0 (no duration timer)
        cloneColor: '#22d3ee' // Bright cyan color for clones (distinct from player green and enemy red)
    }
};

// Track ally clones spawned by player
let playerClones = [];

// --- STATE ---
// Runtime state keeps loose globals centralized so gameplay.js can drive the
// loop without juggling dozens of parameters.
let state = 'MENU';
let paused = false;
let frame = 0;
let score = 0;
let gameTime = 0;
let camX = 0;
let camY = 0;
let screenShake = 0;
let bossActive = false;
let bossSpawned = false;
let bossDefeated = false;
let animationId = null;
let lastTime = 0;
let spawnDelay = 0;
// Mouse control state - direction-based aiming (not screen center)
// leftDown: fire toward mouse, rightDown: move toward mouse direction
let mouseAim = { 
    active: false,    // Set to true only when mouse is actively used
    x: 0, 
    y: 0,
    screenX: 0,        // Raw screen coordinates for crosshair
    screenY: 0,
    leftDown: false,   // Left-click = shoot
    rightDown: false,  // Right-click = move
    angle: 0,          // Direction angle from player to mouse (world coords)
    down: false        // Legacy: true if either button down (for compatibility)
};
let deathSequence = { active: false, timer: 0, missionTriggered: false, stamp: 0 };
let missionFailPending = false;
let missionFailDelay = 0;
let missionFailCallback = null;
let terrainNoiseOffsetX = 0;
let terrainNoiseOffsetY = 0;
let waveRewardSummary = null;

// =============================================================================
// DEBUG MODE OPTIONS - For testing purposes only
// Set these to true/value to enable testing features during development.
// IMPORTANT: Set all to false/null before deploying to production!
// =============================================================================

// DEBUG_START_WAVE: Skip to a specific wave number for testing late-game content.
// Acceptable values: null (default - start from wave 1) or integer from 1 to FINAL_WAVE (12).
// Useful for: Testing specific wave mechanics, boss encounters, difficulty scaling.
// Default: null (normal progression from wave 1)
const DEBUG_START_WAVE = null;

// DEBUG_START_WEAPON: Spawn with a specific weapon instead of the default cannon.
// Valid weapon ids: cannon, twin, shotgun, sniper, burst, flak, rocket, laser,
// gauss, ice, fire, electric. Set to null to keep the default cannon.
// Useful for: Testing specific weapon mechanics, balancing, visual effects.
// Default: null (start with cannon)
const DEBUG_START_WEAPON = 'null';

// DEBUG_UNLIMITED_HP: When true, player HP will never decrease from damage.
// The player becomes invincible and cannot die from enemy attacks.
// Useful for: Testing late-game content, boss mechanics, level design.
// Default: false (normal gameplay with damage)
const DEBUG_UNLIMITED_HP = false;

// DEBUG_UNLIMITED_ENERGY: When true, weapon energy will never decrease.
// The player can fire continuously without running out of energy or overheating.
// Useful for: Testing weapon effects, DPS calculations, stress testing.
// Default: false (normal energy consumption)
const DEBUG_UNLIMITED_ENERGY = false;

// DEBUG_NO_TEMPERATURE: When true, tank temperature will not increase from firing.
// Prevents overheating mechanics from activating during extended combat.
// Useful for: Testing sustained fire scenarios, weapon balance.
// Default: false (normal temperature mechanics)
const DEBUG_NO_TEMPERATURE = false;

// DEBUG_ULTIMATE_ALWAYS_ACTIVE: When true, ultimate ability is always ready to use.
// Player can trigger ultimate at any time without needing to fill the kill streak.
// Useful for: Testing ultimate mechanics, visual effects, damage calculations.
// Default: false (normal ultimate charging via kill streaks)
const DEBUG_ULTIMATE_ALWAYS_ACTIVE = false;

// DEBUG_UNLIMITED_TURBO: When true, turbo charges are unlimited (never decrease).
// Player still needs to press turbo button to activate, but charges won't be consumed.
// Useful for: Testing turbo mechanics, speed testing, boss dodging practice.
// Default: false (normal turbo mechanics requiring item pickups and consuming charges)
const DEBUG_UNLIMITED_TURBO = false;

// DEBUG_UNLIMITED_SHIELD: When true, shield is always active from game start.
// Player begins with full shield (150 HP) that never expires or takes damage.
// Useful for: Testing enemy AI behavior, visual effects, gameplay without damage.
// Default: false (normal shield mechanics requiring item pickups)
const DEBUG_UNLIMITED_SHIELD = false;

// DEBUG_START_ITEMS: Array of item types to give player at game start.
// Each item in array will be \"claimed\" as if picked up at game start.
// Useful for: Testing specific power-up combinations, starting with advantages.
// Default: [] (empty - no starting items)
//
// === VALID ITEM TYPES ===
// Power-up Items (temporary effects):
//   'shield'    - Shield Core: Activates protective shield
//   'armor'     - Armor Plate: Adds +50 armor points
//   'turbo'     - Turbo Boost: Adds +1 turbo charge (max 3)
//   'magnet'    - Magnet Field: Attracts items for 10 seconds
//   'damage'    - Damage Boost: +50% damage for 10 seconds
//   'speed'     - Speed Boost: Movement speed increase for 10 seconds
//   'autoaim'   - Auto-Aim Module: +15 auto-aim shots (stackable to 75)
//
// Passive Items (permanent upgrades, tiered levels):
//   'dmgmult'   - Damage Amplifier: +15% permanent damage (max 2.5x total)
//   'cooling'   - Cryo Core: +15% cooling efficiency (max 2.0x total)
//   'critical'  - Critical Strike: +8% crit chance (max 35% total)
//   'lifesteal' - Vampire Core: +5% lifesteal per level (max level 5 = 25%)
//                 Lifesteal applies to ALL damage: direct hits, burn DOT, freeze DOT, chain lightning
//
// === RARITY UNLOCK BY WAVE ===
//   Wave 1+: shield, armor, turbo, magnet, autoaim (common/very-common)
//   Wave 2+: damage, speed (uncommon)
//   Wave 4+: dmgmult, cooling (medium-rare)
//   Wave 6+: critical (rare)
//   Wave 8+: lifesteal (legendary)
//
// Example configurations:
//   ['shield', 'turbo'] - Start with shield protection and turbo charge
//   ['autoaim', 'autoaim', 'autoaim'] - Start with 45 auto-aim shots
//   ['dmgmult', 'critical', 'lifesteal'] - Start with passive damage boosts
//   ['magnet', 'speed', 'damage'] - Start with active power-ups
const DEBUG_START_ITEMS = [];

// DEBUG_SHOW_FPS: When true, displays an elegant FPS counter at bottom center of screen.
// Shows current FPS, average FPS, and frame time in a compact, semi-transparent overlay.
// Useful for: Performance monitoring, optimization testing, identifying lag spikes.
// Default: false (no FPS display)
const DEBUG_SHOW_FPS = true;

// DEBUG_FPS_LIMITER: When true, enables the 60 FPS frame rate limiter.
// This caps the game at 60 FPS to save power and ensure consistent gameplay.
// When false, the game runs at the monitor's refresh rate (uncapped).
// Useful for: Testing performance on high refresh rate monitors, comparing capped vs uncapped.
// Default: true (FPS limiter enabled)
const DEBUG_FPS_LIMITER = false;

// =============================================================================
// GRAPHICS SETTINGS SYSTEM - User Configurable Quality Presets
// =============================================================================
// This replaces the old DEBUG_SMART_PERFORMANCE system with user-controllable settings.
// Users can choose quality presets or customize individual settings.
// Settings are persisted in localStorage for cross-session consistency.
// DEFAULT: Lowest quality (level 5) for maximum compatibility
// =============================================================================

// Graphics quality level (0-5): 0=Ultra, 1=High, 2=Medium, 3=Low, 4=Very Low, 5=Lowest
// Default is 5 (Lowest) for best compatibility across all devices
let graphicsQualityLevel = 5;

// Load graphics settings from localStorage on startup
function loadGraphicsSettings() {
    try {
        const saved = localStorage.getItem('tankDestroyer_graphicsQuality');
        if (saved !== null) {
            const level = parseInt(saved, 10);
            if (level >= 0 && level <= 5) {
                graphicsQualityLevel = level;
                console.log('[Graphics] Loaded quality level:', level, GRAPHICS_QUALITY_LEVELS[level].name);
            }
        } else {
            // First time - default to lowest quality
            graphicsQualityLevel = 5;
            saveGraphicsSettings();
            console.log('[Graphics] First run, defaulting to Lowest quality for compatibility');
        }
    } catch (e) {
        console.warn('[Graphics] Could not load settings:', e);
        graphicsQualityLevel = 5;
    }
}

// Save graphics settings to localStorage
function saveGraphicsSettings() {
    try {
        localStorage.setItem('tankDestroyer_graphicsQuality', graphicsQualityLevel.toString());
    } catch (e) {
        console.warn('[Graphics] Could not save settings:', e);
    }
}

// Set graphics quality and apply immediately
function setGraphicsQuality(level) {
    if (level < 0 || level > 5) return;
    
    graphicsQualityLevel = level;
    saveGraphicsSettings();
    
    // Apply smooth values immediately for instant feedback
    const settings = GRAPHICS_QUALITY_LEVELS[level];
    smoothPerfValues.particleMultiplier = settings.particleMultiplier;
    smoothPerfValues.maxParticles = settings.maxParticles;
    smoothPerfValues.cullDistance = settings.cullDistance;
    smoothPerfValues.trailLength = settings.trailLength;
    smoothPerfValues.effectDetail = settings.effectDetail;
    smoothPerfValues.shadowQuality = settings.shadowQuality;
    smoothPerfValues.terrainDetail = settings.terrainDetail;
    smoothPerfValues.trackQuality = settings.trackQuality;
    smoothPerfValues.wallDetail = settings.wallDetail;
    smoothPerfValues.floatTextMax = settings.floatTextMax;
    
    console.log('[Graphics] Quality set to:', settings.name);
    return settings;
}

// Get current graphics quality level
function getGraphicsQuality() {
    return graphicsQualityLevel;
}

// Get current graphics settings object
function getGraphicsSettings() {
    return GRAPHICS_QUALITY_LEVELS[graphicsQualityLevel] || GRAPHICS_QUALITY_LEVELS[5];
}

// =============================================================================
// GRAPHICS QUALITY LEVELS - Comprehensive Visual Settings
// =============================================================================
// This system controls ALL major rendering parameters for performance/quality balance:
// 1. PARTICLES - Explosion effects, trails, sparks (GPU fill rate)
// 2. TERRAIN - Background tiles with multiple layers (GPU overdraw)
// 3. SHADOWS - blur() filters are VERY expensive on CPU/GPU
// 4. TRACKS - Tank track bezier curves (CPU path calculations)
// 5. EFFECTS - Magic circles, auras, glows (GPU blending)
// 6. WALLS/CRATES - Complex rendering with gradients (GPU)
// =============================================================================

// Smooth transition values - lerp towards target for glitch-free quality changes
let smoothPerfValues = {
    particleMultiplier: 0.15,  // Default to lowest quality values
    maxParticles: 50,
    cullDistance: 500,
    trailLength: 0.1,
    effectDetail: 0.2,
    shadowQuality: 0,
    terrainDetail: 0.1,
    trackQuality: 0,
    wallDetail: 0.3,
    floatTextMax: 15  // Maximum floating texts allowed
};
const PERF_LERP_SPEED = 0.15; // How fast values transition

// Linear interpolation helper
function lerpValue(current, target, speed) {
    const diff = target - current;
    if (Math.abs(diff) < 0.001) return target; // Snap if very close
    return current + diff * speed;
}

// Graphics quality levels - 6 presets from Ultra to Lowest
const GRAPHICS_QUALITY_LEVELS = {
    0: { // Ultra Quality - Maximum visual fidelity
        name: 'ULTRA',
        particleMultiplier: 1.0,
        maxParticles: 500,
        cullDistance: 1500,
        trailLength: 1.0,
        effectDetail: 1.0,
        shadowQuality: 1.0,
        terrainDetail: 1.0,
        trackQuality: 1.0,
        wallDetail: 1.0,
        aiUpdateRate: 1,
        floatTextMax: 100,  // Maximum floating texts on screen
        description: 'Maximum visual quality with all effects enabled'
    },
    1: { // High Quality
        name: 'HIGH',
        particleMultiplier: 0.85,
        maxParticles: 350,
        cullDistance: 1300,
        trailLength: 0.85,
        effectDetail: 0.9,
        shadowQuality: 0.8,
        terrainDetail: 0.9,
        trackQuality: 0.9,
        wallDetail: 0.95,
        aiUpdateRate: 1,
        floatTextMax: 80,
        description: 'High quality with minor optimizations'
    },
    2: { // Medium Quality
        name: 'MEDIUM',
        particleMultiplier: 0.65,
        maxParticles: 250,
        cullDistance: 1100,
        trailLength: 0.7,
        effectDetail: 0.75,
        shadowQuality: 0.5,
        terrainDetail: 0.7,
        trackQuality: 0.7,
        wallDetail: 0.8,
        aiUpdateRate: 2,
        floatTextMax: 60,
        description: 'Balanced quality and performance'
    },
    3: { // Low Quality
        name: 'LOW',
        particleMultiplier: 0.45,
        maxParticles: 150,
        cullDistance: 900,
        trailLength: 0.5,
        effectDetail: 0.5,
        shadowQuality: 0.3,
        terrainDetail: 0.5,
        trackQuality: 0.5,
        wallDetail: 0.6,
        aiUpdateRate: 2,
        floatTextMax: 40,
        description: 'Reduced quality for better performance'
    },
    4: { // Very Low Quality
        name: 'VERY LOW',
        particleMultiplier: 0.3,
        maxParticles: 100,
        cullDistance: 700,
        trailLength: 0.3,
        effectDetail: 0.3,
        shadowQuality: 0.1,
        terrainDetail: 0.3,
        trackQuality: 0.3,
        wallDetail: 0.4,
        aiUpdateRate: 3,
        floatTextMax: 25,
        description: 'Minimum visuals for performance priority'
    },
    5: { // Lowest Quality - Maximum Performance
        name: 'LOWEST',
        particleMultiplier: 0.15,
        maxParticles: 50,
        cullDistance: 500,
        trailLength: 0.1,
        effectDetail: 0.2,
        shadowQuality: 0,
        terrainDetail: 0.1,
        trackQuality: 0,
        wallDetail: 0.3,
        aiUpdateRate: 4,
        floatTextMax: 15,  // Minimal floating texts for max FPS
        description: 'Fastest performance for low-end devices'
    }
};

// Initialize graphics settings on load
function initGraphicsSettings() {
    loadGraphicsSettings();
    // Apply current settings immediately
    const settings = GRAPHICS_QUALITY_LEVELS[graphicsQualityLevel];
    smoothPerfValues.particleMultiplier = settings.particleMultiplier;
    smoothPerfValues.maxParticles = settings.maxParticles;
    smoothPerfValues.cullDistance = settings.cullDistance;
    smoothPerfValues.trailLength = settings.trailLength;
    smoothPerfValues.effectDetail = settings.effectDetail;
    smoothPerfValues.shadowQuality = settings.shadowQuality;
    smoothPerfValues.terrainDetail = settings.terrainDetail;
    smoothPerfValues.trackQuality = settings.trackQuality;
    smoothPerfValues.wallDetail = settings.wallDetail;
    smoothPerfValues.floatTextMax = settings.floatTextMax;
    console.log('[Graphics] Initialized with quality:', settings.name);
}

// Update smooth performance values - call every frame for smooth transitions
function updateSmoothPerfValues() {
    const target = GRAPHICS_QUALITY_LEVELS[graphicsQualityLevel];
    if (!target) return;
    
    smoothPerfValues.particleMultiplier = lerpValue(smoothPerfValues.particleMultiplier, target.particleMultiplier, PERF_LERP_SPEED);
    smoothPerfValues.maxParticles = (lerpValue(smoothPerfValues.maxParticles, target.maxParticles, PERF_LERP_SPEED) + 0.5) | 0;
    smoothPerfValues.cullDistance = lerpValue(smoothPerfValues.cullDistance, target.cullDistance, PERF_LERP_SPEED);
    smoothPerfValues.trailLength = lerpValue(smoothPerfValues.trailLength, target.trailLength, PERF_LERP_SPEED);
    smoothPerfValues.effectDetail = lerpValue(smoothPerfValues.effectDetail, target.effectDetail, PERF_LERP_SPEED);
    smoothPerfValues.shadowQuality = lerpValue(smoothPerfValues.shadowQuality, target.shadowQuality, PERF_LERP_SPEED);
    smoothPerfValues.terrainDetail = lerpValue(smoothPerfValues.terrainDetail, target.terrainDetail, PERF_LERP_SPEED);
    smoothPerfValues.trackQuality = lerpValue(smoothPerfValues.trackQuality, target.trackQuality, PERF_LERP_SPEED);
    smoothPerfValues.wallDetail = lerpValue(smoothPerfValues.wallDetail, target.wallDetail, PERF_LERP_SPEED);
    smoothPerfValues.floatTextMax = (lerpValue(smoothPerfValues.floatTextMax, target.floatTextMax, PERF_LERP_SPEED) + 0.5) | 0;
}

// === GRAPHICS GETTER FUNCTIONS ===
// Used by rendering code to get current settings

function getParticleMultiplier() {
    return smoothPerfValues.particleMultiplier;
}

function getMaxParticles() {
    return smoothPerfValues.maxParticles;
}

function getCullDistance() {
    return smoothPerfValues.cullDistance;
}

function getShadowQuality() {
    return smoothPerfValues.shadowQuality;
}

function getTerrainDetail() {
    return smoothPerfValues.terrainDetail;
}

function getTrackQuality() {
    return smoothPerfValues.trackQuality;
}

function getWallDetail() {
    return smoothPerfValues.wallDetail;
}

function getAIUpdateRate() {
    return GRAPHICS_QUALITY_LEVELS[graphicsQualityLevel].aiUpdateRate;
}

function getEffectDetail() {
    return smoothPerfValues.effectDetail;
}

function getTrailLength() {
    return smoothPerfValues.trailLength;
}

function getFloatTextMax() {
    return smoothPerfValues.floatTextMax;
}

// Legacy compatibility - smartPerfLevel now maps to graphicsQualityLevel
let smartPerfLevel = 5; // Default to lowest for compatibility
Object.defineProperty(window, 'smartPerfLevel', {
    get: function() { return graphicsQualityLevel; },
    set: function(v) { graphicsQualityLevel = v; }
});


// =============================================================================
// FPS COUNTER SYSTEM (Canvas-based HUD - only renders during gameplay)
// =============================================================================

// FPS tracking variables
let fpsFrameCount = 0;
let fpsLastTime = performance.now();
let fpsCurrentFPS = 0;
let fpsAverageFPS = 0;
let fpsFrameTimeMs = 0;
let fpsSamples = [];
const FPS_SAMPLE_SIZE = 60; // Average over 60 samples for stability
const FPS_UPDATE_INTERVAL = 250; // Update display every 250ms for readability

// Update FPS counter calculations - call this every frame during gameplay
// Only active when DEBUG_SHOW_FPS is enabled (not for demo benchmark - handled by main.js)
function updateFPSCounter() {
    if (!DEBUG_SHOW_FPS) return;
    
    const now = performance.now();
    fpsFrameCount++;
    
    // Calculate frame time
    const deltaTime = now - fpsLastTime;
    
    // Update calculations at interval for readability
    if (deltaTime >= FPS_UPDATE_INTERVAL) {
        // Calculate current FPS
        fpsCurrentFPS = Math.round((fpsFrameCount * 1000) / deltaTime);
        fpsFrameTimeMs = (deltaTime / fpsFrameCount).toFixed(1);
        
        // Add to samples for average calculation
        fpsSamples.push(fpsCurrentFPS);
        if (fpsSamples.length > FPS_SAMPLE_SIZE) {
            fpsSamples.shift();
        }
        
        // Calculate average FPS
        fpsAverageFPS = Math.round(fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length);
        
        // Reset counters
        fpsFrameCount = 0;
        fpsLastTime = now;
    }
}

// FPS HUD HTML element references (cached for performance)
let fpsHudElement = null;
let fpsValueElement = null;
let fpsAvgElement = null;
let fpsMsElement = null;

// Initialize FPS HUD - call once on game start
function initFPSHUD() {
    if (!DEBUG_SHOW_FPS) return;
    
    fpsHudElement = document.getElementById('fps-hud');
    fpsValueElement = document.getElementById('fps-value');
    fpsAvgElement = document.getElementById('fps-avg');
    fpsMsElement = document.getElementById('fps-ms');
    
    if (fpsHudElement) {
        fpsHudElement.style.display = 'flex';
    }
}

// Update FPS HUD HTML element - call this at end of draw() function
// Uses HTML element with CSS backdrop-filter for true blur effect
// Only active during gameplay when DEBUG_SHOW_FPS is enabled
function drawFPSCounterHUD() {
    // Only show when debug flag is enabled
    if (!DEBUG_SHOW_FPS) return;
    
    // Initialize elements if not cached
    if (!fpsHudElement) {
        fpsHudElement = document.getElementById('fps-hud');
        fpsValueElement = document.getElementById('fps-value');
        fpsAvgElement = document.getElementById('fps-avg');
        fpsMsElement = document.getElementById('fps-ms');
        if (!fpsHudElement) return;
    }
    
    // Show HUD
    if (fpsHudElement.style.display !== 'flex') {
        fpsHudElement.style.display = 'flex';
        fpsHudElement.style.opacity = '1';
    }
    
    // Update text content
    const fpsValue = String(fpsCurrentFPS || '--').padStart(2, ' ');
    const avgValue = String(fpsAverageFPS || '--').padStart(2, ' ');
    const msValue = String(fpsFrameTimeMs || '--').padStart(4, ' ');
    
    if (fpsValueElement) fpsValueElement.textContent = `${fpsValue} FPS`;
    if (fpsAvgElement) fpsAvgElement.textContent = `avg ${avgValue}`;
    if (fpsMsElement) fpsMsElement.textContent = `${msValue} ms`;
    
    // Update color class based on FPS performance
    fpsHudElement.classList.remove('fps-excellent', 'fps-caution', 'fps-warning', 'fps-critical');
    
    if (fpsCurrentFPS < 30) {
        fpsHudElement.classList.add('fps-critical');
    } else if (fpsCurrentFPS < 45) {
        fpsHudElement.classList.add('fps-warning');
    } else if (fpsCurrentFPS < 55) {
        fpsHudElement.classList.add('fps-caution');
    } else {
        fpsHudElement.classList.add('fps-excellent');
    }
}

// Hide FPS HUD (call when returning to menu or pausing)
function hideFPSHUD() {
    if (fpsHudElement) {
        fpsHudElement.style.display = 'none';
    }
}

// =============================================================================
// FRAME RATE CONFIGURATION
// =============================================================================

// TARGET_FPS: Maximum frames per second the game should run at.
// Game loop will cap at this value to ensure consistent gameplay across devices.
// Recommended: 60 for smooth gameplay without excessive CPU usage.
const TARGET_FPS = 60;
const FRAME_TIME = 1000 / TARGET_FPS; // Milliseconds per frame (~16.67ms for 60fps)

// =============================================================================
// DEBUG HELPER FUNCTIONS
// =============================================================================

function resolveDebugWave() {
    if (DEBUG_START_WAVE === null || DEBUG_START_WAVE === undefined) return null;
    const parsed = Number(DEBUG_START_WAVE);
    if (!Number.isFinite(parsed)) return null;
    const wave = Math.floor(parsed);
    if (wave < 1) return 1;
    if (wave > FINAL_WAVE) return FINAL_WAVE;
    return wave;
}

function resolveDebugWeapon() {
    if (!DEBUG_START_WEAPON || typeof DEBUG_START_WEAPON !== 'string') return null;
    const key = DEBUG_START_WEAPON.trim().toLowerCase();
    if (!WEAPONS[key]) return null;
    return key;
}

// Boss configuration - OMEGA DESTROYER with 7 unique weapon turrets
const BOSS_CONFIG = {
    hp: 15000,
    maxHp: 15000,
    radius: 110,
    speed: 1.8,
    turretCount: 7,
    rotationSpeed: 0.008,
    color: '#0a0a0a',
    accent: '#1a1a1a',
    score: 10000,
    // Combat AI parameters
    attackRange: 500, // Boss only attacks when within this range
    intelligence: 10, // Highest intelligence (enemies max at 6)
    accuracy: 0.45, // Low accuracy (enemies have 0.65-0.97)
    shotError: 0.5, // High shot error (enemies have 0.012-0.30)
    damageMultiplier: 2.5, // Large damage side effect
    obstacleDestructionRange: 200, // Range to detect and destroy obstacles
    // Sleep/awakening system
    sleepWakeThreshold: 500, // Damage needed to wake up sleeping boss
    awakeningDuration: 180, // 3 seconds awakening animation at 60fps
    // Ultimate trigger system - MULTIPLE HP THRESHOLDS
    // Boss triggers ultimate at specific HP percentages AND when damage threshold is met
    ultimateHPThresholds: [0.75, 0.50, 0.25], // Trigger ultimate at 75%, 50%, 25% HP
    ultimateDamageThreshold: 1500, // Damage needed to trigger ultimate (backup trigger)
    ultimateDamageWindow: 300, // 5 seconds window at 60fps
    ultimateAreaDamage: 8, // Damage per second to nearby player during ultimate
    ultimateAreaRange: 350, // Range of area damage effect
    // Guard escort system
    escortSpawnFromBoss: true, // Guards spawn from inside boss
    escortSpawnCount: 3, // Guards per spawn wave
    escortRespawnDelay: 420, // 7 seconds
    escortMaxCount: 5, // Max guards at once
    // Headbutt attack
    headbuttRange: 100, // Distance to trigger headbutt (reduced for closer contact)
    headbuttKnockback: 550, // Knockback force (increased for longer knockback)
    headbuttStunDuration: 120, // 2 seconds stun at 60fps
    headbuttDamage: 50, // Damage from headbutt
    headbuttCooldown: 300, // 5 seconds cooldown
    // Dark Fire Aura - eternal cursed flame around boss
    darkFireAuraRadius: 140, // Radius of dark fire protection circle
    darkFireDamagePerSecond: 3, // Small but eternal damage per second
    darkFireAuraParticleRate: 8, // Particles per frame
    // Sequential turret system - only one active at a time
    turretEnergy: 100, // Energy per turret before switching
    turretSwitchCooldown: 60, // Cooldown between turret switches (1 second)
    // 7 unique turrets with distinct visual shapes and weapons
    // kickback: visual recoil amount, recoilSpread: accuracy deviation
    turrets: [
        { 
            name: 'VOID LANCE', 
            angleOffset: 0, 
            weapon: 'gauss', 
            fireInterval: 45, 
            burst: 1, 
            energyCost: 20,
            switchCooldown: 60,
            shape: 'railgun',
            color: '#9333ea',
            glowColor: 'rgba(147, 51, 234, 0.6)',
            kickback: 12, // Heavy recoil for railgun
            recoilSpread: 0.08 // High precision weapon
        },
        { 
            name: 'FROST CHAIN', 
            angleOffset: Math.PI * 2 / 7, 
            weapon: 'ice', 
            fireInterval: 30, 
            burst: 3, 
            energyCost: 12,
            switchCooldown: 50,
            shape: 'crystalline',
            color: '#06b6d4',
            glowColor: 'rgba(6, 182, 212, 0.6)',
            kickback: 6, // Medium recoil
            recoilSpread: 0.15 // Moderate spread
        },
        { 
            name: 'EMBER VOLLEY', 
            angleOffset: Math.PI * 4 / 7, 
            weapon: 'fire', 
            fireInterval: 18, 
            burst: 5, 
            energyCost: 8,
            switchCooldown: 45,
            shape: 'flamethrower',
            color: '#f97316',
            glowColor: 'rgba(249, 115, 22, 0.6)',
            kickback: 3, // Light recoil for rapid fire
            recoilSpread: 0.25 // Wide spread flamethrower
        },
        { 
            name: 'STORM GATLING', 
            angleOffset: Math.PI * 6 / 7, 
            weapon: 'electric', 
            fireInterval: 8, 
            burst: 8, 
            energyCost: 5,
            switchCooldown: 40,
            shape: 'gatling',
            color: '#facc15',
            glowColor: 'rgba(250, 204, 21, 0.6)',
            kickback: 2, // Minimal recoil for gatling
            recoilSpread: 0.20, // Moderate spread
            // Multi-barrel configuration: bullets fire from each barrel in sequence
            barrelOffsets: [-6, -2, 2, 6], // Y offsets for 4 barrels
            barrelLength: 30 // Length of gatling barrels
        },
        { 
            name: 'PLASMA CANNON', 
            angleOffset: Math.PI * 8 / 7, 
            weapon: 'laser', 
            fireInterval: 35, 
            burst: 2, 
            energyCost: 18,
            switchCooldown: 55,
            shape: 'plasma',
            color: '#22c55e',
            glowColor: 'rgba(34, 197, 94, 0.6)',
            kickback: 8, // Medium-heavy recoil
            recoilSpread: 0.10 // Precise laser
        },
        { 
            name: 'SEEKER HIVE', 
            angleOffset: Math.PI * 10 / 7, 
            weapon: 'rocket', 
            fireInterval: 50, 
            burst: 4, 
            energyCost: 25,
            switchCooldown: 70,
            shape: 'missile_pod',
            color: '#ef4444',
            glowColor: 'rgba(239, 68, 68, 0.6)',
            kickback: 10, // Heavy recoil for rockets
            recoilSpread: 0.18, // Some spread
            // Multi-barrel configuration: 6 tubes in 2x3 grid
            barrelOffsets: [
                { x: 6, y: -8 },  // Top-left tube
                { x: 14, y: -8 }, // Top-right tube
                { x: 6, y: 0 },   // Middle-left tube
                { x: 14, y: 0 },  // Middle-right tube
                { x: 6, y: 8 },   // Bottom-left tube
                { x: 14, y: 8 }   // Bottom-right tube
            ],
            barrelLength: 12 // Length of missile tubes
        },
        { 
            name: 'DEVASTATOR', 
            angleOffset: Math.PI * 12 / 7, 
            weapon: 'shotgun', 
            fireInterval: 40, 
            burst: 1, 
            energyCost: 22,
            switchCooldown: 60,
            shape: 'heavy_cannon',
            color: '#64748b', // Steel gray - distinct from VOID LANCE purple
            glowColor: 'rgba(100, 116, 139, 0.6)',
            kickback: 15, // Massive recoil for shotgun
            recoilSpread: 0.30, // Wide shotgun spread
            // Multi-barrel configuration: 2 heavy barrels
            barrelOffsets: [-3.5, 3.5], // Y offsets for 2 barrels
            barrelLength: 25 // Length of heavy cannon barrels
        }
    ],
    // Ultimate ability - OMEGA BEAM (360 degree rotating beam)
    ultimate: {
        name: 'OMEGA ANNIHILATION',
        chargeTime: 180, // 3 seconds charge at 60fps
        beamDuration: 300, // 5 seconds beam
        cooldown: 1200, // 20 seconds cooldown
        damage: 15, // Damage per frame
        beamWidth: 25,
        rotationSpeed: 0.03, // Radians per frame (full rotation in ~3.5 seconds)
        beamColor: '#ff0000',
        chargeColor: '#ffff00'
    }
};

// Rare item spawn tracking (limit active rare items)
const rareItemTracker = {
    activeRareItems: 0,
    maxRareItems: 2
};

// Tank tracks (dirty trails)
const playerTracks = []; // Darker, more visible player tracks
const enemyTracks = [];  // Lighter enemy tracks

// --- INPUT STATE ---
const input = {
    move: { active: false, x: 0, y: 0, angle: 0, mag: 0 },
    aim: { active: false, x: 0, y: 0, angle: 0, mag: 0 }
};

// --- KEYBOARD ---
const keys = { w: false, a: false, s: false, d: false, up: false, down: false, left: false, right: false };

// --- ENEMY TIERS ---
// Enemy tiers with buffed stats and magical effects for higher tiers
// Tier 0-2: Standard tanks
// Tier 3: Magical Shield (regenerating shield)
// Tier 4: Magical Blink (can blink/teleport instantly)
// Tier 5: Ice Elemental (freezing attacks)
// Tier 6: Fire Elemental (burning attacks)
// Tier 7: Electric Elemental (stunning attacks)
const ENEMY_TIERS = [
    { id: 0, hp: 150, speed: 2.0, err: 0.30, accuracy: 0.65, cd: 130, score: 50, weapon: 'cannon', aimSpeed: 0.09, intelligence: 2, magical: false },
    { id: 1, hp: 220, speed: 2.4, err: 0.16, accuracy: 0.75, cd: 100, score: 100, weapon: 'twin', aimSpeed: 0.11, intelligence: 3, magical: false },
    { id: 2, hp: 320, speed: 2.8, err: 0.07, accuracy: 0.85, cd: 80, score: 200, weapon: 'shotgun', aimSpeed: 0.13, intelligence: 4, magical: false },
    { id: 3, hp: 500, speed: 3.2, err: 0.035, accuracy: 0.92, cd: 60, score: 350, weapon: 'burst', aimSpeed: 0.16, intelligence: 5, magical: true, magicType: 'shield', shieldRegen: 0.8 },
    { id: 4, hp: 800, speed: 3.5, err: 0.012, accuracy: 0.97, cd: 45, score: 600, weapon: 'laser', aimSpeed: 0.19, intelligence: 6, magical: true, magicType: 'blink', blinkCooldown: 300 },
    { id: 5, hp: 650, speed: 3.0, err: 0.025, accuracy: 0.90, cd: 70, score: 450, weapon: 'ice', aimSpeed: 0.15, intelligence: 5, magical: true, magicType: 'ice', element: 'ice' },
    { id: 6, hp: 700, speed: 3.3, err: 0.020, accuracy: 0.93, cd: 65, score: 500, weapon: 'fire', aimSpeed: 0.17, intelligence: 5, magical: true, magicType: 'fire', element: 'fire' },
    { id: 7, hp: 750, speed: 3.6, err: 0.018, accuracy: 0.95, cd: 55, score: 550, weapon: 'electric', aimSpeed: 0.18, intelligence: 6, magical: true, magicType: 'electric', element: 'electric' }
];
const FINAL_ENEMY_TIER = ENEMY_TIERS.length - 1;

// --- WAVE SYSTEM ---
// Wave-based spawning with progressive difficulty
let currentWave = 1;
let enemiesKilledThisWave = 0;
let enemiesPerWave = 10; // Starting enemies to kill before wave complete
let waveTransition = false;
let waveTransitionTimer = 0;
const MAX_ENEMIES_ON_MAP = 15; // Maximum enemies alive at once (spawn cap)
const FINAL_WAVE = 12;
const FINAL_WAVE_ESCORT_CAP = 5; // Only 5 escorts in final wave
const FINAL_WAVE_ESCORT_SPAWN = 5; // Spawn all 5 at once around boss
const FINAL_WAVE_ESCORT_RESPAWN_FRAMES = 480; // Slower respawn (8 seconds)
const FINAL_WAVE_ESCORT_INITIAL_DELAY = 60;
let finalWaveTriggered = false;
let finalWaveEscortTimer = 0;

// Calculate enemies per wave - progressive scaling
// Wave 1: 10 enemies, Wave 11: 30 enemies (linear increase)
// MAX_ENEMIES_ON_MAP (15) limits how many can be alive at once
function getBaseEnemiesPerWave(waveNumber = 1) {
    const wave = Math.max(1, Math.floor(waveNumber));
    // Formula: 10 at wave 1, +2 per wave = 30 at wave 11
    return 10 + Math.max(0, (wave - 1) * 2);
}

// --- PLAYER ---
// The player object doubles as a state machine for movement, resources, and
// super ability timers. Values are mutated directly for speed.
const player = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 29, // Matches visual tank body size (prevents visual wall penetration)
    angle: 0,
    turretAngle: 0,
    hp: 200,
    maxHp: 200,
    armor: 0,
    maxArmor: 100,
    revives: 1,
    maxRevives: 5,
    energy: 100,
    maxEnergy: 100,
    energyRegen: 0.6, // Reduced from 1.2 for better balance
    energyRegenDelay: 0,
    energyRegenDelayMax: 120, // Increased from 90 for better balance
    overheated: false,
    thermalLocked: false,
    killStreak: 0,
    maxStreak: 10,
    bestKillStreak: 0,
    kills: 0,
    consecutiveWaves: 0,
    tookDamageThisWave: false,
        perfectWaveCount: 0,
    ultReady: false,
    isUlting: false,
    ultTimer: 0,
    firedUlt: false,
    ultBeamTime: 0,
    ultBeamAngle: 0,
    // Ultimate type system - upgrades every 3 waves
    ultType: 'BEAM', // Current ultimate type: BEAM, SHOCKWAVE, BERSERKER, CLONE
    ultCharging: false,
    ultChargeProgress: 0,
    // Berserker mode state
    berserkerActive: false,
    berserkerTime: 0,
    weapon: 'cannon',
    speedBase: 4.5,
    buffTime: 0,
    recoil: 0,
    recoilRecoveryTime: 0, // Frames to slow turret tracking after firing (shows accuracy error)
    shieldTime: 0,
    fireDelay: 0,
    lastShotTime: 0,
    consecutiveShots: 0,
    spawnWarmup: 0,
    spawnWarmupMax: SPAWN_WARMUP_FRAMES,
    // New properties for advanced systems
    temperature: 20, // Temperature in Celsius (20-100+)
    baseTemperature: 20,
    maxTemperature: 100,
    temperatureCooldown: 0.5, // Cooling per frame
    temperatureHeatPerShot: 3, // Heat added per shot
    heatEffectName: 'Cryo Stability',
    heatEffectLevel: 0,
    // Cooling efficiency passive (stacks from cryo drops)
    coolingEfficiency: 1.0, // Multiplier for cooling speed (1.0 = 100%)
    heatResistance: 1.0, // Multiplier for heat generation reduction (1.0 = 100%)
    invisible: false,
    invisibleTime: 0,
    turboActive: false,
    turboTime: 0,
    turboSpeed: 7.5, // Speed during turbo
    turboDuration: 420,
    turboCharges: 0,
    turboChargeCap: 2,
    turboCooldown: 0,
    turboCooldownMax: 240,
    turboExhaustClock: 0,
    lifesteal: 0, // Permanent lifesteal percentage (stacks up to 0.25 = 25%)
    lifestealLevel: 0, // Lifesteal level (0-5)
    autoAim: false,
    autoAimShots: 0, // Remaining auto-aim shots
    autoAimMaxShots: 75, // Max shots for auto-aim (stackable to 75)
    // Damage system
    baseDamageMultiplier: 1.0, // Permanent damage multiplier (stacks with dmgmult drops)
    damageMultiplier: 1.0, // Temporary damage multiplier from damage boost
    damageBoostTime: 0, // Remaining time for damage boost
    criticalChance: 0, // Critical hit chance (0-0.35)
    criticalDamage: 2.5, // Critical hit damage multiplier
    magnetActive: false,
    magnetTime: 0,
    magnetRange: 300,
    stunned: false,
    stunnedTime: 0,
    frozen: false,
    frozenTime: 0,
    burning: false,
    burningTime: 0,
    burningDamage: 0.5, // Damage per frame
    // Cursed Burned - eternal dark flame from boss touch
    cursedBurned: false, // Eternal burning that doesn't stop
    cursedBurnedDPS: 3, // Damage per second (small but eternal)
    slowed: false,
    slowedTime: 0,
    slowMultiplier: 0.5,
    lastTrackAngle: 0,
    // Visual turret recoil system - DRAMATIC KICKBACK
    turretRecoilOffsetX: 0, // Turret visual offset from recoil
    turretRecoilOffsetY: 0,
    turretRecoilDecay: 0.70, // Slower decay = longer visible recoil (was 0.85)
    // Wheel rotation animation
    wheelRotation: 0 // Accumulated wheel rotation angle based on movement
};

// --- WEAPONS ---
// Weapon presets with unique tiers (1-9, no duplicates)
// Higher tier = better damage/energy efficiency
// Tier progression: Cannon(1) → Twin(2) → Shotgun(3) → Sniper(4) → Burst(5) → Flak(6) → Rocket(7) → Laser(8) → Gauss(9)
// DPE (Damage Per Energy) scales progressively with tier for better energy efficiency
// BALANCE RULE: Lower delay (faster fire rate) = WORSE accuracy/spread/recoil
//               Higher delay (slower fire rate) = BETTER accuracy/spread/recoil
// WEAPONS - All weapons have UNIQUE tiers (1-12), higher tier = better DPE (Damage Per Energy)
// Tier progression order for drop system:
// Cannon(1) → Twin(2) → Shotgun(3) → Sniper(4) → Burst(5) → Ice(6) → Fire(7) → Flak(8) → Rocket(9) → Electric(10) → Laser(11) → Gauss(12)
const WEAPONS = {
    // Tier 1-3: Starter weapons (DPE 3.3-5.2)
    cannon: { name: 'CANNON', short: 'CN', cost: 3, delay: 25, speed: 18, color: '#9ca3af', type: 'single', dmg: 10, laser: false, rarity: 1, playerAccuracy: 0.93, enemyAccuracy: 0.80, spread: 0.12, recoil: 9, dpe: 3.33, tier: 1 },
    twin: { name: 'TWIN CANNON', short: 'TW', cost: 6, delay: 20, speed: 18, color: '#10b981', type: 'twin', dmg: 28, laser: false, rarity: 2, playerAccuracy: 0.90, enemyAccuracy: 0.78, spread: 0.15, recoil: 7, dpe: 4.67, tier: 2 },
    shotgun: { name: 'SCATTER GUN', short: 'SG', cost: 10, delay: 40, speed: 14, color: '#d946ef', type: 'spread', dmg: 52, laser: false, rarity: 3, playerAccuracy: 0.95, enemyAccuracy: 0.82, spread: 0.22, recoil: 14, dpe: 5.20, tier: 3 },
    // Tier 4-6: Mid-tier weapons (DPE 5.5-7.0)
    sniper: { name: 'RAILGUN', short: 'RG', cost: 20, delay: 50, speed: 45, color: '#e5e5e5', type: 'sniper', dmg: 120, laser: true, rarity: 4, playerAccuracy: 0.98, enemyAccuracy: 0.90, spread: 0.04, recoil: 18, dpe: 6.00, tier: 4 },
    burst: { name: 'BURST RIFLE', short: 'BR', cost: 14, delay: 18, speed: 22, color: '#ffd700', type: 'burst', dmg: 95, laser: true, rarity: 5, playerAccuracy: 0.89, enemyAccuracy: 0.80, spread: 0.16, recoil: 8, dpe: 6.78, tier: 5 },
    ice: { name: 'FROST CANNON', short: 'FC', cost: 12, delay: 30, speed: 16, color: '#3b82f6', type: 'ice', dmg: 85, laser: true, rarity: 6, playerAccuracy: 0.94, enemyAccuracy: 0.84, spread: 0.10, recoil: 11, dpe: 7.08, tier: 6, slowDuration: 120 },
    // Tier 7-9: High-tier weapons (DPE 7.5-9.0)
    fire: { name: 'INFERNO GUN', short: 'IF', cost: 14, delay: 25, speed: 20, color: '#ff4500', type: 'fire', dmg: 110, laser: false, rarity: 7, playerAccuracy: 0.92, enemyAccuracy: 0.78, spread: 0.14, recoil: 10, dpe: 7.86, tier: 7, burnDuration: 180 },
    flak: { name: 'FLAK CANNON', short: 'FK', cost: 14, delay: 35, speed: 16, color: '#a0522d', type: 'flak', dmg: 120, laser: false, rarity: 8, playerAccuracy: 0.94, enemyAccuracy: 0.82, spread: 0.16, recoil: 14, dpe: 8.57, tier: 8 },
    rocket: { name: 'ROCKET LAUNCHER', short: 'RL', cost: 28, delay: 45, speed: 12, color: '#ff1a1a', type: 'aoe', dmg: 250, laser: true, rarity: 9, playerAccuracy: 0.96, enemyAccuracy: 0.86, spread: 0.08, recoil: 16, dpe: 8.93, tier: 9 },
    // Tier 10-12: Elite weapons (DPE 9.5-12.0)
    electric: { name: 'TESLA RIFLE', short: 'TR', cost: 20, delay: 35, speed: 30, color: '#a855f7', type: 'electric', dmg: 190, laser: true, rarity: 10, playerAccuracy: 0.95, enemyAccuracy: 0.86, spread: 0.09, recoil: 13, dpe: 9.50, tier: 10, chainRange: 300 },
    laser: { name: 'PLASMA BEAM', short: 'PB', cost: 5, delay: 4, speed: 35, color: '#00e5ff', type: 'rapid', dmg: 52, laser: true, rarity: 11, playerAccuracy: 0.88, enemyAccuracy: 0.82, spread: 0.18, recoil: 4, dpe: 10.40, tier: 11 },
    gauss: { name: 'GAUSS RIFLE', short: 'GS', cost: 28, delay: 20, speed: 50, color: '#8b5cf6', type: 'pierce', dmg: 336, laser: true, rarity: 12, playerAccuracy: 0.91, enemyAccuracy: 0.84, spread: 0.12, recoil: 20, dpe: 12.00, tier: 12 }
};
let lastShot = 0;

// Weapon tier progression order (tier 1-12) - matches weapon.tier values
const WEAPON_TIER_ORDER = ['cannon', 'twin', 'shotgun', 'sniper', 'burst', 'ice', 'fire', 'flak', 'rocket', 'electric', 'laser', 'gauss'];
const WEAPON_TIER_MAP = WEAPON_TIER_ORDER.reduce((map, id, idx) => {
    map[id] = idx + 1;
    return map;
}, {});

function getWeaponTier(id) {
    if (!id) return null;
    if (Object.prototype.hasOwnProperty.call(WEAPON_TIER_MAP, id)) return WEAPON_TIER_MAP[id];
    const weapon = WEAPONS[id];
    if (!weapon || typeof weapon.tier !== 'number') return null;
    return weapon.tier;
}

function getWeaponTierValue(id) {
    return getWeaponTier(id) ?? (WEAPONS[id]?.rarity ?? 1);
}

function getWeaponEfficiencyScaling(id) {
    const tierValue = Math.max(1, getWeaponTierValue(id));
    const efficiency = 1 + (tierValue - 1) * 0.05; // -5% cost per tier step
    const damage = 1 + (tierValue - 1) * 0.015;   // +1.5% damage per tier step
    return { tier: tierValue, efficiency, damage };
}

// Get revive reward based on wave number (reworked system)
// Revives are only granted on specific waves:
// Wave 3: 1 revive, Wave 6: 2 revives, Wave 9: 3 revives
function getWaveReviveReward(waveNumber = 1) {
    const wave = Math.max(1, waveNumber);
    // Only specific milestone waves grant revives
    switch (wave) {
        case 3: return 1;  // Wave 3: +1 revive
        case 6: return 2;  // Wave 6: +2 revives
        case 9: return 3;  // Wave 9: +3 revives
        default: return 0; // No revives on other waves
    }
}

// Legacy function for backward compatibility (deprecated)
function getReviveDropChance(waveNumber = 1, reviveCount = 0) {
    // Revive system reworked - now wave-based, not chance-based
    // Return 0 to disable old chance system
    return 0;
}

// Boss-exclusive weapons to keep turret loadout unique from the player arsenal.
const BOSS_WEAPONS = {
    void_lance: { name: 'VOID LANCE', speed: 24, dmg: 85, color: '#a855f7', type: 'pierce' },
    frost_chain: { name: 'FROST CHAIN', speed: 18, dmg: 60, color: '#38bdf8', type: 'ice', element: 'ice' },
    ember_volley: { name: 'EMBER VOLLEY', speed: 20, dmg: 45, color: '#fb923c', type: 'fire', element: 'fire' },
    storm_gatling: { name: 'STORM GATLING', speed: 32, dmg: 22, color: '#e0f2fe', type: 'rapid', element: 'electric' },
    arc_lance: { name: 'ARC LANCE', speed: 28, dmg: 70, color: '#fde047', type: 'electric', element: 'electric' },
    seeker_hive: { name: 'SEEKER HIVE', speed: 16, dmg: 55, color: '#fefce8', type: 'aoe' },
    gravity_maul: { name: 'GRAVITY MAUL', speed: 14, dmg: 120, color: '#94a3b8', type: 'slam' }
};

// --- ENTITIES ---
// Collections track every dynamic entity in the arena. Having them here keeps
// reference sharing simple across modules.
let walls = [];
let enemies = [];
let boss = null;
let bullets = [];
let particles = [];
let pickups = [];
let crates = [];
let floatText = [];

// Shared helper applies per-weapon accuracy to both player and enemy shots so
// bullets always originate from the turret yet still have a chance to miss.
// isAutoAim: When true, applies 50% accuracy bonus for computer-assisted targeting
function applyWeaponAccuracy(baseAngle, weaponKey, isEnemy, tierAccuracy = 1, isAutoAim = false) {
    const weapon = WEAPONS[weaponKey] || {};
    let weaponAccuracy = isEnemy ? (weapon.enemyAccuracy ?? weapon.playerAccuracy ?? 1) : (weapon.playerAccuracy ?? weapon.enemyAccuracy ?? 1);
    
    // AUTO-AIM ACCURACY BONUS: 50% improvement to weapon accuracy
    // This reduces the chance to miss and tightens spread
    if (isAutoAim && !isEnemy) {
        const missChanceReduction = 0.5; // 50% reduction in miss chance
        const currentMissChance = 1 - weaponAccuracy;
        weaponAccuracy = 1 - (currentMissChance * (1 - missChanceReduction));
    }
    
    const finalAccuracy = Math.min(1, Math.max(0, weaponAccuracy * tierAccuracy));
    const missChance = 1 - finalAccuracy;
    if (missChance <= 0) return baseAngle;
    const shouldMiss = Math.random() < missChance;
    if (!shouldMiss) return baseAngle;
    
    // Spread is also reduced for auto-aim shots
    let spread = weapon.spread ?? 0.1;
    if (isAutoAim && !isEnemy) {
        spread *= 0.5; // 50% tighter spread
    }
    
    const deviation = (Math.random() - 0.5) * spread * 2;
    return baseAngle + deviation;
}
