// --- CONFIG ---
// Global configuration wires up canvas references plus world bounds so other
// modules can import them without re-querying the DOM every frame.
const WORLD_W = 10000; // Expanded Battlefield Size
const WORLD_H = 10000;
const RIVER_WIDTH = 80; // Width of river border around the battlefield
const RIVER_BOUNDARY = RIVER_WIDTH + 35; // Collision boundary for river (accounts for tank visual width ~30px)
const CANVAS = document.getElementById('gameCanvas');

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
CTX.imageSmoothingEnabled = false;

// Minimap canvas with mobile-safe settings
const MINI_CANVAS = document.getElementById('minimap');
const MINI_CTX = MINI_CANVAS.getContext('2d', { 
    alpha: true, 
    willReadFrequently: false
});
MINI_CTX.imageSmoothingEnabled = false;
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
let mouseAim = { active: true, x: 0, y: 0, down: false, angle: 0 };  // active:true, angle:0 so mouse aim works immediately
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
const DEBUG_START_WEAPON = null;

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

// DEBUG_SMART_PERFORMANCE: When true, enables the Smart Performance Optimizer.
// This system automatically detects FPS drops below 59 FPS and applies intelligent
// optimizations to maintain stable frame rate without significantly affecting visuals.
// Optimizations include: particle reduction, culling distance adjustment, effect simplification.
// Useful for: Low-end devices, mobile browsers, maintaining 60 FPS target.
// Default: true (Smart Performance enabled)
const DEBUG_SMART_PERFORMANCE = true;

// =============================================================================
// SMART PERFORMANCE OPTIMIZER SYSTEM - COMPREHENSIVE BOTTLENECK DETECTION
// =============================================================================
// This system identifies and addresses ALL major sources of FPS drops:
// 1. PARTICLES - Explosion effects, trails, sparks (GPU fill rate)
// 2. TERRAIN - Background tiles with multiple layers (GPU overdraw)
// 3. SHADOWS - blur() filters are VERY expensive on CPU/GPU
// 4. TRACKS - Tank track bezier curves (CPU path calculations)
// 5. ENEMIES - AI calculations, pathfinding (CPU heavy)
// 6. BULLETS - Collision detection with walls/enemies (CPU)
// 7. EFFECTS - Magic circles, auras, glows (GPU blending)
// 8. WALLS/CRATES - Complex rendering with gradients (GPU)
// =============================================================================

// Performance optimizer state
let smartPerfEnabled = DEBUG_SMART_PERFORMANCE;
let smartPerfLevel = 0; // 0 = Full quality, 1-5 = Progressive optimization levels
let smartPerfLastCheck = 0;
let smartPerfCheckInterval = 400; // Check every 400ms (faster response)
let smartPerfFPSHistory = [];
let smartPerfHistorySize = 8; // Track last 8 FPS samples for faster response
let smartPerfTargetFPS = 58; // Target FPS threshold (slightly below 60 for headroom)
let smartPerfRecoveryFrames = 0; // Frames of good performance before recovering quality
let smartPerfBottleneck = 'none'; // Current detected bottleneck type

// Smooth transition values - lerp towards target for glitch-free quality changes
let smoothPerfValues = {
    particleMultiplier: 1.0,
    maxParticles: 500,
    cullDistance: 1500,
    trailLength: 1.0,
    effectDetail: 1.0,
    shadowQuality: 1.0,
    terrainDetail: 1.0,
    trackQuality: 1.0,
    wallDetail: 1.0
};
const PERF_LERP_SPEED = 0.08; // How fast values transition (0.08 = smooth, 0.2 = faster)

// Linear interpolation helper
function lerpValue(current, target, speed) {
    const diff = target - current;
    if (Math.abs(diff) < 0.001) return target; // Snap if very close
    return current + diff * speed;
}

// Update smooth performance values - call every frame
function updateSmoothPerfValues() {
    if (!DEBUG_SMART_PERFORMANCE) return;
    
    const target = getSmartPerfSettings();
    const speed = PERF_LERP_SPEED;
    
    smoothPerfValues.particleMultiplier = lerpValue(smoothPerfValues.particleMultiplier, target.particleMultiplier, speed);
    smoothPerfValues.maxParticles = Math.round(lerpValue(smoothPerfValues.maxParticles, target.maxParticles, speed));
    smoothPerfValues.cullDistance = lerpValue(smoothPerfValues.cullDistance, target.cullDistance, speed);
    smoothPerfValues.trailLength = lerpValue(smoothPerfValues.trailLength, target.trailLength, speed);
    smoothPerfValues.effectDetail = lerpValue(smoothPerfValues.effectDetail, target.effectDetail, speed);
    smoothPerfValues.shadowQuality = lerpValue(smoothPerfValues.shadowQuality, target.shadowQuality, speed);
    smoothPerfValues.terrainDetail = lerpValue(smoothPerfValues.terrainDetail, target.terrainDetail, speed);
    smoothPerfValues.trackQuality = lerpValue(smoothPerfValues.trackQuality, target.trackQuality, speed);
    smoothPerfValues.wallDetail = lerpValue(smoothPerfValues.wallDetail, target.wallDetail, speed);
}

// Bottleneck detection counters (accumulated over check interval)
let smartPerfMetrics = {
    particleCount: 0,
    enemyCount: 0,
    bulletCount: 0,
    trackCount: 0,
    wallCount: 0,
    effectCount: 0,
    sampleCount: 0
};

// Update metrics each frame for bottleneck detection
function updatePerfMetrics() {
    if (!DEBUG_SMART_PERFORMANCE) return;
    
    // Safely get counts from game state
    smartPerfMetrics.particleCount += (typeof particles !== 'undefined' ? particles.length : 0);
    smartPerfMetrics.enemyCount += (typeof enemies !== 'undefined' ? enemies.filter(e => e.hp > 0).length : 0);
    smartPerfMetrics.bulletCount += (typeof bullets !== 'undefined' ? bullets.length : 0);
    smartPerfMetrics.trackCount += (typeof enemyTracks !== 'undefined' ? enemyTracks.length : 0);
    smartPerfMetrics.wallCount += (typeof walls !== 'undefined' ? walls.length : 0);
    smartPerfMetrics.effectCount += (typeof magicEffects !== 'undefined' ? magicEffects.length : 0);
    smartPerfMetrics.sampleCount++;
}

// Detect primary bottleneck based on metrics
function detectBottleneck() {
    if (smartPerfMetrics.sampleCount === 0) return 'unknown';
    
    const avgParticles = smartPerfMetrics.particleCount / smartPerfMetrics.sampleCount;
    const avgEnemies = smartPerfMetrics.enemyCount / smartPerfMetrics.sampleCount;
    const avgBullets = smartPerfMetrics.bulletCount / smartPerfMetrics.sampleCount;
    const avgTracks = smartPerfMetrics.trackCount / smartPerfMetrics.sampleCount;
    const avgEffects = smartPerfMetrics.effectCount / smartPerfMetrics.sampleCount;
    
    // Thresholds for each bottleneck type
    // Lower thresholds = earlier detection
    const thresholds = {
        particles: 150,  // Particles are expensive (GPU fill)
        enemies: 15,     // AI calculations are expensive (CPU)
        bullets: 50,     // Collision detection (CPU)
        tracks: 200,     // Bezier curve rendering (CPU/GPU)
        effects: 10      // Magic effects with blending (GPU)
    };
    
    // Calculate "pressure" for each system (0-1 scale)
    const pressures = {
        particles: avgParticles / thresholds.particles,
        enemies: avgEnemies / thresholds.enemies,
        bullets: avgBullets / thresholds.bullets,
        tracks: avgTracks / thresholds.tracks,
        effects: avgEffects / thresholds.effects,
        // Shadows/terrain are always potential bottlenecks
        rendering: 0.5 // Base rendering pressure
    };
    
    // Find highest pressure
    let maxPressure = 0;
    let bottleneck = 'rendering';
    
    for (const [type, pressure] of Object.entries(pressures)) {
        if (pressure > maxPressure) {
            maxPressure = pressure;
            bottleneck = type;
        }
    }
    
    return bottleneck;
}

// Optimization settings per level (higher = more aggressive)
// Now includes ALL performance-affecting settings
const SMART_PERF_LEVELS = {
    0: { // Full quality - no optimizations
        particleMultiplier: 1.0,
        maxParticles: 500,
        cullDistance: 1500,
        trailLength: 1.0,
        effectDetail: 1.0,
        shadowQuality: 1.0,      // Full shadow blur
        terrainDetail: 1.0,     // All terrain details
        trackQuality: 1.0,      // Full bezier curves
        wallDetail: 1.0,        // Full wall rendering
        aiUpdateRate: 1,        // Update AI every frame
        description: 'Full Quality'
    },
    1: { // Slight reduction - barely noticeable
        particleMultiplier: 0.85,
        maxParticles: 350,
        cullDistance: 1300,
        trailLength: 0.85,
        effectDetail: 0.9,
        shadowQuality: 0.8,     // Reduced blur radius
        terrainDetail: 0.9,     // Skip some grass blades
        trackQuality: 0.9,      // Slightly simpler curves
        wallDetail: 0.95,       // Slightly less detail
        aiUpdateRate: 1,        // Still every frame
        description: 'High Quality'
    },
    2: { // Moderate reduction - minor visual difference
        particleMultiplier: 0.65,
        maxParticles: 250,
        cullDistance: 1100,
        trailLength: 0.7,
        effectDetail: 0.75,
        shadowQuality: 0.5,     // Low blur
        terrainDetail: 0.7,     // Skip pebbles & grass
        trackQuality: 0.7,      // Simpler curves
        wallDetail: 0.8,        // Skip some details
        aiUpdateRate: 2,        // Update AI every 2 frames
        description: 'Medium Quality'
    },
    3: { // Significant reduction - noticeable but playable
        particleMultiplier: 0.45,
        maxParticles: 150,
        cullDistance: 900,
        trailLength: 0.5,
        effectDetail: 0.5,
        shadowQuality: 0.3,     // Minimal blur
        terrainDetail: 0.5,     // Basic terrain only
        trackQuality: 0.5,      // Simple lines
        wallDetail: 0.6,        // Basic walls
        aiUpdateRate: 2,        // Every 2 frames
        description: 'Low Quality'
    },
    4: { // Heavy reduction - performance priority
        particleMultiplier: 0.3,
        maxParticles: 100,
        cullDistance: 700,
        trailLength: 0.3,
        effectDetail: 0.3,
        shadowQuality: 0.1,     // Almost no blur
        terrainDetail: 0.3,     // Flat colors only
        trackQuality: 0.3,      // Straight lines
        wallDetail: 0.4,        // Very basic
        aiUpdateRate: 3,        // Every 3 frames
        description: 'Very Low Quality'
    },
    5: { // Emergency mode - maximum performance
        particleMultiplier: 0.15,
        maxParticles: 50,
        cullDistance: 500,
        trailLength: 0.1,
        effectDetail: 0.2,
        shadowQuality: 0,       // No blur at all
        terrainDetail: 0.1,     // Solid colors
        trackQuality: 0,        // No tracks
        wallDetail: 0.3,        // Minimal
        aiUpdateRate: 4,        // Every 4 frames
        description: 'Emergency Mode'
    }
};

// Get current performance settings based on optimization level
function getSmartPerfSettings() {
    return SMART_PERF_LEVELS[smartPerfLevel] || SMART_PERF_LEVELS[0];
}

// Update Smart Performance Optimizer - call every 30 frames from game loop
function updateSmartPerformance(currentFPS) {
    if (!DEBUG_SMART_PERFORMANCE) return;
    
    const now = performance.now();
    
    // Accumulate metrics for bottleneck detection
    updatePerfMetrics();
    
    // Only check at intervals to avoid overhead
    if (now - smartPerfLastCheck < smartPerfCheckInterval) return;
    smartPerfLastCheck = now;
    
    // Detect current bottleneck
    smartPerfBottleneck = detectBottleneck();
    
    // Reset metrics for next interval
    smartPerfMetrics = {
        particleCount: 0,
        enemyCount: 0,
        bulletCount: 0,
        trackCount: 0,
        wallCount: 0,
        effectCount: 0,
        sampleCount: 0
    };
    
    // Add current FPS to history
    smartPerfFPSHistory.push(currentFPS);
    if (smartPerfFPSHistory.length > smartPerfHistorySize) {
        smartPerfFPSHistory.shift();
    }
    
    // Need enough samples to make decisions
    if (smartPerfFPSHistory.length < 4) return;
    
    // Calculate average FPS over recent history
    const avgFPS = smartPerfFPSHistory.reduce((a, b) => a + b, 0) / smartPerfFPSHistory.length;
    const minFPS = Math.min(...smartPerfFPSHistory);
    
    // Threshold: Graphics ONLY compromise when FPS drops BELOW 59
    // Recovery: IMMEDIATE full quality when FPS is 59 or above
    const fullQualityFPS = 59;    // >= 59 FPS = full quality (level 0)
    const criticalFPS = 45;       // < 45 FPS = critical (jump multiple levels)
    const warningFPS = 52;        // < 52 FPS = warning (increase 1 level)
    
    // PRIORITY 1: Immediate recovery when FPS >= 59
    if (avgFPS >= fullQualityFPS && minFPS >= fullQualityFPS - 2) {
        // FPS is 59+ - IMMEDIATELY restore full quality
        if (smartPerfLevel > 0) {
            smartPerfLevel = 0; // Instant recovery to full quality
            smartPerfRecoveryFrames = 0;
            if (DEBUG_SHOW_FPS) {
                console.log(`[SmartPerf] FPS excellent (avg: ${avgFPS.toFixed(1)}). FULL QUALITY restored! Level: 0`);
            }
        }
        return;
    }
    
    // PRIORITY 2: Only optimize when FPS is BELOW 59
    if (avgFPS < fullQualityFPS || minFPS < fullQualityFPS - 3) {
        // FPS dropped below 59 - start compromising graphics
        
        if (minFPS < criticalFPS || avgFPS < criticalFPS) {
            // CRITICAL: FPS very low, jump multiple levels
            smartPerfRecoveryFrames = 0;
            const levelsToJump = Math.min(2, 5 - smartPerfLevel);
            if (levelsToJump > 0) {
                smartPerfLevel += levelsToJump;
                if (DEBUG_SHOW_FPS) {
                    console.log(`[SmartPerf] CRITICAL FPS (avg: ${avgFPS.toFixed(1)}, min: ${minFPS.toFixed(1)}). Bottleneck: ${smartPerfBottleneck}. Level: ${smartPerfLevel} - ${getSmartPerfSettings().description}`);
                }
            }
        } else if (minFPS < warningFPS || avgFPS < warningFPS) {
            // WARNING: FPS moderately low, increase 1 level
            smartPerfRecoveryFrames = 0;
            if (smartPerfLevel < 5) {
                smartPerfLevel++;
                if (DEBUG_SHOW_FPS) {
                    console.log(`[SmartPerf] FPS warning (avg: ${avgFPS.toFixed(1)}, min: ${minFPS.toFixed(1)}). Bottleneck: ${smartPerfBottleneck}. Level: ${smartPerfLevel} - ${getSmartPerfSettings().description}`);
                }
            }
        } else {
            // FPS between 52-58: mild optimization, try gradual recovery
            smartPerfRecoveryFrames++;
            
            // Gradual recovery if FPS stabilizing in mid-range
            if (smartPerfRecoveryFrames >= 3 && smartPerfLevel > 1) {
                smartPerfLevel--;
                smartPerfRecoveryFrames = 0;
                if (DEBUG_SHOW_FPS) {
                    console.log(`[SmartPerf] FPS improving (avg: ${avgFPS.toFixed(1)}). Gradual recovery. Level: ${smartPerfLevel}`);
                }
            }
        }
    }
}

// === PERFORMANCE GETTER FUNCTIONS ===
// Used by rendering code to get current optimization settings
// Now returns smoothly interpolated values for glitch-free transitions

// Get particle count multiplier based on current optimization level
function getParticleMultiplier() {
    if (!DEBUG_SMART_PERFORMANCE) return 1.0;
    return smoothPerfValues.particleMultiplier;
}

// Get max particles limit based on current optimization level
function getMaxParticles() {
    if (!DEBUG_SMART_PERFORMANCE) return 500;
    return smoothPerfValues.maxParticles;
}

// Get cull distance based on current optimization level
function getCullDistance() {
    if (!DEBUG_SMART_PERFORMANCE) return 1500;
    return smoothPerfValues.cullDistance;
}

// Get shadow quality (0 = no blur, 1 = full blur)
function getShadowQuality() {
    if (!DEBUG_SMART_PERFORMANCE) return 1.0;
    return smoothPerfValues.shadowQuality;
}

// Get terrain detail level (0 = solid colors, 1 = full detail)
function getTerrainDetail() {
    if (!DEBUG_SMART_PERFORMANCE) return 1.0;
    return smoothPerfValues.terrainDetail;
}

// Get track rendering quality (0 = no tracks, 1 = full bezier curves)
function getTrackQuality() {
    if (!DEBUG_SMART_PERFORMANCE) return 1.0;
    return smoothPerfValues.trackQuality;
}

// Get wall detail level
function getWallDetail() {
    if (!DEBUG_SMART_PERFORMANCE) return 1.0;
    return smoothPerfValues.wallDetail;
}

// Get AI update rate (1 = every frame, 2 = every 2 frames, etc)
function getAIUpdateRate() {
    if (!DEBUG_SMART_PERFORMANCE) return 1;
    return getSmartPerfSettings().aiUpdateRate; // AI rate doesn't need smoothing
}

// Get effect detail level (magic circles, auras, etc)
function getEffectDetail() {
    if (!DEBUG_SMART_PERFORMANCE) return 1.0;
    return smoothPerfValues.effectDetail;
}

// Get trail length multiplier
function getTrailLength() {
    if (!DEBUG_SMART_PERFORMANCE) return 1.0;
    return smoothPerfValues.trailLength;
}

// Console access for debugging
function getPerfStatus() {
    return {
        enabled: DEBUG_SMART_PERFORMANCE,
        level: smartPerfLevel,
        description: getSmartPerfSettings().description,
        bottleneck: smartPerfBottleneck,
        settings: getSmartPerfSettings(),
        fpsHistory: smartPerfFPSHistory,
        avgFPS: smartPerfFPSHistory.length > 0 
            ? (smartPerfFPSHistory.reduce((a, b) => a + b, 0) / smartPerfFPSHistory.length).toFixed(1)
            : 'N/A'
    };
}

// Global access for console debugging
if (typeof window !== 'undefined') {
    window.TankDestroyer = window.TankDestroyer || {};
    window.TankDestroyer.perfStatus = getPerfStatus;
    window.TankDestroyer.setPerfLevel = (level) => {
        smartPerfLevel = Math.max(0, Math.min(5, level));
        console.log(`[SmartPerf] Manual level set: ${smartPerfLevel} - ${getSmartPerfSettings().description}`);
    };
}

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
// NOTE: Does NOT show during demo mode (handled by CSS)
function drawFPSCounterHUD() {
    // Only update when debug flag is enabled
    if (!DEBUG_SHOW_FPS) return;
    
    // Don't show during demo mode
    if (typeof demoActive !== 'undefined' && demoActive === true) {
        if (fpsHudElement) fpsHudElement.style.display = 'none';
        return;
    }
    
    // Initialize elements if not cached
    if (!fpsHudElement) {
        initFPSHUD();
        if (!fpsHudElement) return;
    }
    
    // Show the HUD
    if (fpsHudElement.style.display !== 'flex') {
        fpsHudElement.style.display = 'flex';
    }
    
    // Update text content
    const fpsValue = String(fpsCurrentFPS || '--').padStart(2, ' ');
    const avgValue = String(fpsAverageFPS || '--').padStart(2, ' ');
    const msValue = String(fpsFrameTimeMs || '--').padStart(4, ' ');
    
    if (fpsValueElement) fpsValueElement.textContent = `${fpsValue} FPS`;
    if (fpsAvgElement) fpsAvgElement.textContent = `avg ${avgValue}`;
    if (fpsMsElement) fpsMsElement.textContent = `${msValue} ms`;
    
    // Update color class based on FPS performance
    // Remove all state classes first
    fpsHudElement.classList.remove('fps-excellent', 'fps-caution', 'fps-warning', 'fps-critical');
    
    // Add appropriate class based on FPS
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
let enemiesPerWave = 15; // Enemies to kill before wave complete
let waveTransition = false;
let waveTransitionTimer = 0;
const MAX_ENEMIES_ON_MAP = 15; // Maximum enemies alive at once
const FINAL_WAVE = 12;
const FINAL_WAVE_ESCORT_CAP = 5; // Only 5 escorts in final wave
const FINAL_WAVE_ESCORT_SPAWN = 5; // Spawn all 5 at once around boss
const FINAL_WAVE_ESCORT_RESPAWN_FRAMES = 480; // Slower respawn (8 seconds)
const FINAL_WAVE_ESCORT_INITIAL_DELAY = 60;
let finalWaveTriggered = false;
let finalWaveEscortTimer = 0;

function getBaseEnemiesPerWave(waveNumber = 1) {
    const wave = Math.max(1, Math.floor(waveNumber));
    return 15 + Math.max(0, (wave - 1) * 2);
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
