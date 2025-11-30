// Demo Battle System - Realistic gameplay showcase on main menu
// ================================================================
// This module provides a non-interactive demo battle that plays in the background
// of the main menu. It showcases actual gameplay using the game's real rendering,
// AI, physics, and particle systems rather than creating simplified versions.
// 
// Key Design Principles:
// 1. REUSE - Use actual game functions (draw, updateEnemies, createExplosion, etc.)
// 2. NO DUPLICATION - Don't recreate rendering or physics logic
// 3. AUTHENTIC - Demo should look identical to actual gameplay
// 4. ISOLATED - Demo state doesn't persist when real game starts
// ================================================================

let demoActive = false;
let demoFrame = 0;
let demoAnimationFrame = null;
let demoLastTime = 0;
let demoDt = 1;

// Demo configuration
const DEMO_AREA_SIZE = 2500;
let demoAreaOffsetX = 0;
let demoAreaOffsetY = 0;

// Demo timing constants - fast-paced action for showcase (1 second = 60 frames)
const DEMO_DEATH_ANIMATION_FRAMES = 60; // 1 second death animation
const DEMO_SPAWN_WARMUP_FRAMES = 60;    // 1 second spawn/revive animation

// Store original player spawn position for respawn at same location
let demoPlayerSpawnX = 0;
let demoPlayerSpawnY = 0;

// Store original spawn positions for all enemies (respawn at original position)
let demoEnemySpawns = [];

// Initialize demo - compatibility wrapper called by splash/gameplay
function initDemo() {
    startDemo();
}

// Start demo battle - called when main menu is shown
function startDemo() {
    demoActive = true;
    demoFrame = 0;
    demoLastTime = performance.now();
    
    // Calculate demo area offset (random position within world bounds)
    const margin = 500;
    demoAreaOffsetX = margin + Math.random() * (WORLD_W - DEMO_AREA_SIZE - margin * 2);
    demoAreaOffsetY = margin + Math.random() * (WORLD_H - DEMO_AREA_SIZE - margin * 2);
    
    // Use main game canvas
    CANVAS.width = window.innerWidth;
    CANVAS.height = window.innerHeight;
    
    // === MOBILE GPU-SAFE DEMO INITIALIZATION ===
    // Reset canvas context state (prevents GPU state corruption on mobile)
    CTX.setTransform(1, 0, 0, 1, 0, 0);
    CTX.globalAlpha = 1.0;
    CTX.globalCompositeOperation = 'source-over';
    
    // Fill canvas with terrain color to match draw() output
    CTX.fillStyle = '#8B9A6B'; // Terrain base color
    CTX.fillRect(0, 0, CANVAS.width, CANVAS.height);
    
    // FRUSTUM CULLING: Initialize viewport bounds immediately for particle system
    // This ensures visible particle counting works from the first frame
    // Works correctly for portrait, landscape, and desktop screen orientations
    if (typeof updateViewportBounds === 'function') {
        updateViewportBounds();
    }
    
    // Add demo-active class to hide other UI elements
    document.body.classList.add('demo-active');
    
    // Initialize demo world using game's terrain generation
    initDemoWorld();
    
    // Create AI-controlled player tank at fixed spawn position
    createDemoPlayer();
    
    // Create enemies from all tiers at fixed spawn positions
    createDemoEnemies();
    
    // Center camera on player within demo area
    camX = Math.max(demoAreaOffsetX, Math.min(player.x - CANVAS.width / 2, demoAreaOffsetX + DEMO_AREA_SIZE - CANVAS.width));
    camY = Math.max(demoAreaOffsetY, Math.min(player.y - CANVAS.height / 2, demoAreaOffsetY + DEMO_AREA_SIZE - CANVAS.height));
    
    // Start demo loop with delay to ensure GPU is ready
    requestAnimationFrame(() => {
        demoBattleLoop();
    });
}

// Stop demo battle
function stopDemo() {
    demoActive = false;
    if (demoAnimationFrame) {
        cancelAnimationFrame(demoAnimationFrame);
        demoAnimationFrame = null;
    }
    
    // Remove demo-active class to restore UI
    document.body.classList.remove('demo-active');
    
    // Clear all game entities (use length = 0 for const arrays)
    enemies.length = 0;
    bullets.length = 0;
    particles.length = 0;
    walls.length = 0;
    crates.length = 0;
    pickups.length = 0;
    floatText.length = 0;
    enemyTracks.length = 0;
    // Clear magic effects to prevent them from persisting
    if (typeof magicEffects !== 'undefined') magicEffects.length = 0;
    playerTracks.length = 0;
    demoEnemySpawns = [];
    
    // Reset death sequences
    demoDeathSequences = {
        player: { active: false, timer: 0, x: 0, y: 0 },
        enemies: []
    };
}

// Initialize demo world - uses game's actual wall/crate generation style
function initDemoWorld() {
    // Clear entities (use length = 0 for const arrays)
    walls.length = 0;
    crates.length = 0;
    bullets.length = 0;
    particles.length = 0;
    pickups.length = 0;
    floatText.length = 0;
    enemies.length = 0;
    enemyTracks.length = 0;
    playerTracks.length = 0;
    demoEnemySpawns = [];
    // Clear magic effects to start fresh
    if (typeof magicEffects !== 'undefined') magicEffects.length = 0;
    
    // Generate terrain seed for consistent ground rendering
    terrainNoiseOffsetX = Math.random() * 10000;
    terrainNoiseOffsetY = Math.random() * 10000;
    
    // Demo area bounds
    const minX = demoAreaOffsetX + 100;
    const minY = demoAreaOffsetY + 100;
    const maxX = demoAreaOffsetX + DEMO_AREA_SIZE - 100;
    const maxY = demoAreaOffsetY + DEMO_AREA_SIZE - 100;
    const areaW = maxX - minX;
    const areaH = maxY - minY;
    
    // Generate walls similar to game's initWorld() - dramatic tactical walls
    const wallCount = 12;
    for (let i = 0; i < wallCount; i++) {
        let attempts = 0;
        let placed = false;
        
        while (!placed && attempts < 50) {
            attempts++;
            
            // Wall types matching game's generation
            const wallType = Math.random();
            let w, h;
            
            if (wallType < 0.3) {
                // Large fortress walls
                w = 200 + Math.random() * 250;
                h = 40 + Math.random() * 50;
            } else if (wallType < 0.6) {
                // Medium tactical walls
                w = 120 + Math.random() * 150;
                h = 120 + Math.random() * 150;
            } else {
                // Tall barriers
                w = 40 + Math.random() * 50;
                h = 150 + Math.random() * 200;
            }
            
            const x = minX + Math.random() * (areaW - w);
            const y = minY + Math.random() * (areaH - h);
            
            // Check collision with existing walls
            let collision = false;
            for (let wall of walls) {
                if (x < wall.x + wall.w + 80 && x + w + 80 > wall.x &&
                    y < wall.y + wall.h + 80 && y + h + 80 > wall.y) {
                    collision = true;
                    break;
                }
            }
            
            // Keep center open for spawn area
            const centerX = demoAreaOffsetX + DEMO_AREA_SIZE / 2;
            const centerY = demoAreaOffsetY + DEMO_AREA_SIZE / 2;
            if (Math.hypot(x + w/2 - centerX, y + h/2 - centerY) < 200) {
                collision = true;
            }
            
            if (!collision) {
                // Use game's wall structure with destructible property
                walls.push({
                    x, y, w, h,
                    destructible: true,
                    hp: 1200,
                    maxHp: 1200,
                    seed: Math.random(),
                    shakeX: 0,
                    shakeY: 0
                });
                placed = true;
            }
        }
    }
    
    // Generate crates similar to game's generation
    const crateCount = 8;
    for (let i = 0; i < crateCount; i++) {
        let attempts = 0;
        let placed = false;
        
        while (!placed && attempts < 50) {
            attempts++;
            
            // Crate sizes matching game
            const size = 60 + Math.random() * 20;
            const x = minX + Math.random() * (areaW - size);
            const y = minY + Math.random() * (areaH - size);
            
            // Check collision with walls and crates
            let collision = false;
            for (let wall of walls) {
                if (x < wall.x + wall.w + 60 && x + size + 60 > wall.x &&
                    y < wall.y + wall.h + 60 && y + size + 60 > wall.y) {
                    collision = true;
                    break;
                }
            }
            for (let crate of crates) {
                if (x < crate.x + crate.w + 60 && x + size + 60 > crate.x &&
                    y < crate.y + crate.h + 60 && y + size + 60 > crate.y) {
                    collision = true;
                    break;
                }
            }
            
            // Keep center open
            const centerX = demoAreaOffsetX + DEMO_AREA_SIZE / 2;
            const centerY = demoAreaOffsetY + DEMO_AREA_SIZE / 2;
            if (Math.hypot(x + size/2 - centerX, y + size/2 - centerY) < 200) {
                collision = true;
            }
            
            if (!collision) {
                // Use game's crate structure
                crates.push({
                    x, y,
                    w: size,
                    h: size,
                    hp: 400,
                    maxHp: 400,
                    seed: Math.random(),
                    shakeX: 0,
                    shakeY: 0
                });
                placed = true;
            }
        }
    }
    
    // Mark spatial grid dirty so walls/crates are properly indexed for collision
    if (typeof markSpatialGridDirty === 'function') {
        markSpatialGridDirty();
    }
    
    // Debug log wall count
    console.log('[Demo] Generated', walls.length, 'walls and', crates.length, 'crates');
}

// Find safe spawn position in demo area
function findDemoSafeSpot(radius = 30, avoidPlayer = false) {
    const margin = 100;
    const maxAttempts = 100;
    
    const minX = demoAreaOffsetX + margin;
    const minY = demoAreaOffsetY + margin;
    const maxX = demoAreaOffsetX + DEMO_AREA_SIZE - margin;
    const maxY = demoAreaOffsetY + DEMO_AREA_SIZE - margin;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const x = minX + Math.random() * (maxX - minX);
        const y = minY + Math.random() * (maxY - minY);
        
        let safe = true;
        
        // Check walls
        for (let wall of walls) {
            if (x > wall.x - radius - 50 && x < wall.x + wall.w + radius + 50 &&
                y > wall.y - radius - 50 && y < wall.y + wall.h + radius + 50) {
                safe = false;
                break;
            }
        }
        
        // Check crates
        if (safe) {
            for (let crate of crates) {
                if (x > crate.x - radius - 50 && x < crate.x + crate.w + radius + 50 &&
                    y > crate.y - radius - 50 && y < crate.y + crate.h + radius + 50) {
                    safe = false;
                    break;
                }
            }
        }
        
        // Check player distance if avoiding player
        if (safe && avoidPlayer && player) {
            const dist = Math.hypot(x - player.x, y - player.y);
            if (dist < 400) safe = false;
        }
        
        // Check other enemies
        if (safe) {
            for (let e of enemies) {
                const dist = Math.hypot(x - e.x, y - e.y);
                if (dist < 150) {
                    safe = false;
                    break;
                }
            }
        }
        
        if (safe) return { x, y };
    }
    
    // Fallback - return center of demo area
    return {
        x: demoAreaOffsetX + DEMO_AREA_SIZE / 2 + (Math.random() - 0.5) * 100,
        y: demoAreaOffsetY + DEMO_AREA_SIZE / 2 + (Math.random() - 0.5) * 100
    };
}

// Create AI-controlled player tank
function createDemoPlayer() {
    const spawnPos = findDemoSafeSpot(30);
    
    // Store spawn position for respawn at same location
    demoPlayerSpawnX = spawnPos.x;
    demoPlayerSpawnY = spawnPos.y;
    
    // Random weapon selection
    const weapons = ['cannon', 'twin', 'burst', 'sniper', 'laser', 'shotgun', 'rocket'];
    const selectedWeapon = weapons[Math.floor(Math.random() * weapons.length)];
    
    // Set player properties directly (using game's player object)
    player.x = spawnPos.x;
    player.y = spawnPos.y;
    player.vx = 0;
    player.vy = 0;
    player.angle = Math.random() * Math.PI * 2;
    player.turretAngle = player.angle;
    player.maxHp = 2500;
    player.hp = 2500;
    player.radius = 25; // CRITICAL: Required for bullet hit detection in updateBullets()
    player.weapon = selectedWeapon;
    player.recoil = 0;
    player.recoilRecoveryTime = 0; // Turret tracking lock after firing
    player.hitFlash = 0;
    player.wheelRotation = 0;
    player.turretRecoilOffsetX = 0;
    player.turretRecoilOffsetY = 0;
    player.seed = Math.random();
    player.shieldTime = 0;
    player.armor = 0;
    player.spawnWarmup = DEMO_SPAWN_WARMUP_FRAMES; // Fast 1 second spawn for demo
    player.spawnWarmupMax = DEMO_SPAWN_WARMUP_FRAMES;
    player.isReviving = false;
    player.isDying = false; // Not in death animation
    player.fireDelay = 0;
    player.lastShotTime = 0;
    player.energy = 100;
    player.maxEnergy = 100;
    player.overheated = false;
    player.temperature = 20; // Normal temperature (not frozen)
    player.baseTemperature = 20; // Base temperature returns to 20°C after freeze ends
    
    // Initialize status effects to 0 (important for proper float text display)
    player.slowed = 0;
    player.frozen = 0;
    player.burning = 0;
    player.stunned = 0;
    
    // AI-specific properties stored on player for demo
    player.demoAI = {
        target: null,
        targetSwitchTimer: 0,
        strafeDir: 1,
        cooldown: 0
    };
}

// Create enemies from all tiers at strategic positions around the demo area
// FIXED: Now properly checks wall/crate collision before spawning
function createDemoEnemies() {
    enemies.length = 0;
    demoEnemySpawns = [];
    
    // Calculate strategic spawn positions around the demo area (surrounding player)
    const centerX = demoAreaOffsetX + DEMO_AREA_SIZE / 2;
    const centerY = demoAreaOffsetY + DEMO_AREA_SIZE / 2;
    const spawnRadius = DEMO_AREA_SIZE * 0.35;
    const tankRadius = 30; // Tank collision radius
    
    // Spawn 8 enemies - one from each tier (0-7) for full variety showcase
    const enemyCount = 8;
    const tierSelection = [0, 1, 2, 3, 4, 5, 6, 7];
    
    for (let i = 0; i < enemyCount; i++) {
        const tierId = tierSelection[i];
        const tier = ENEMY_TIERS[tierId] || ENEMY_TIERS[0];
        
        // Find safe spawn position with collision checking
        let spawnX, spawnY;
        let foundSafeSpot = false;
        
        for (let attempt = 0; attempt < 50 && !foundSafeSpot; attempt++) {
            // Calculate spawn angle (evenly distributed around player with some randomness)
            const spawnAngle = (Math.PI * 2 * i) / enemyCount + (Math.random() - 0.5) * 0.5;
            const radiusVariation = spawnRadius + (Math.random() - 0.5) * 100;
            
            spawnX = centerX + Math.cos(spawnAngle) * radiusVariation;
            spawnY = centerY + Math.sin(spawnAngle) * radiusVariation;
            
            // Clamp to demo area bounds with margin for tank size
            spawnX = Math.max(demoAreaOffsetX + 100 + tankRadius, Math.min(demoAreaOffsetX + DEMO_AREA_SIZE - 100 - tankRadius, spawnX));
            spawnY = Math.max(demoAreaOffsetY + 100 + tankRadius, Math.min(demoAreaOffsetY + DEMO_AREA_SIZE - 100 - tankRadius, spawnY));
            
            // Check wall collision using proper circle-rect collision
            let wallCollision = false;
            for (const wall of walls) {
                const closestX = Math.max(wall.x, Math.min(spawnX, wall.x + wall.w));
                const closestY = Math.max(wall.y, Math.min(spawnY, wall.y + wall.h));
                const distToWall = Math.hypot(spawnX - closestX, spawnY - closestY);
                if (distToWall < tankRadius + 20) { // Extra margin to prevent clipping
                    wallCollision = true;
                    break;
                }
            }
            if (wallCollision) continue;
            
            // Check crate collision
            let crateCollision = false;
            for (const crate of crates) {
                const closestX = Math.max(crate.x, Math.min(spawnX, crate.x + crate.w));
                const closestY = Math.max(crate.y, Math.min(spawnY, crate.y + crate.h));
                const distToCrate = Math.hypot(spawnX - closestX, spawnY - closestY);
                if (distToCrate < tankRadius + 20) {
                    crateCollision = true;
                    break;
                }
            }
            if (crateCollision) continue;
            
            // Check distance from other already-spawned enemies
            let tooCloseToEnemy = false;
            for (const e of enemies) {
                const dist = Math.hypot(spawnX - e.x, spawnY - e.y);
                if (dist < 80) {
                    tooCloseToEnemy = true;
                    break;
                }
            }
            if (tooCloseToEnemy) continue;
            
            // Check distance from player spawn area
            const distFromCenter = Math.hypot(spawnX - centerX, spawnY - centerY);
            if (distFromCenter < 150) continue;
            
            foundSafeSpot = true;
        }
        
        // Fallback if no safe spot found
        if (!foundSafeSpot) {
            const fallbackAngle = (Math.PI * 2 * i) / enemyCount;
            spawnX = centerX + Math.cos(fallbackAngle) * (spawnRadius + 50);
            spawnY = centerY + Math.sin(fallbackAngle) * (spawnRadius + 50);
            spawnX = Math.max(demoAreaOffsetX + 120, Math.min(demoAreaOffsetX + DEMO_AREA_SIZE - 120, spawnX));
            spawnY = Math.max(demoAreaOffsetY + 120, Math.min(demoAreaOffsetY + DEMO_AREA_SIZE - 120, spawnY));
        }
        
        // Store original spawn position for respawning
        demoEnemySpawns.push({ x: spawnX, y: spawnY, tierId: tierId });
        
        // Use game's deriveTurretColor if available
        const enemyAccent = typeof deriveTurretColor === 'function' 
            ? deriveTurretColor(tier.weapon, tier.accent)
            : (tier.accent || '#475569');
        
        // Create enemy using game's structure
        const enemy = {
            x: spawnX,
            y: spawnY,
            hp: tier.hp,
            maxHp: tier.hp,
            radius: 25,
            speed: tier.speed,
            baseSpeed: tier.speed,
            angle: Math.random() * Math.PI * 2,
            turretAngle: Math.random() * Math.PI * 2,
            cooldown: Math.random() * 60,
            maxCooldown: tier.cd,
            err: tier.err,
            color: tier.color,
            accent: enemyAccent,
            hitFlash: 0,
            weapon: tier.weapon,
            id: tierId,
            tierId: tierId,
            seed: Math.random(),
            wheelRotation: 0,
            turretRecoilOffsetX: 0,
            turretRecoilOffsetY: 0,
            turretRecoilDecay: 0.70,
            recoilRecoveryTime: 0, // Turret tracking lock after firing
            recoil: 0,
            shakeX: 0,
            shakeY: 0,
            vx: 0,
            vy: 0,
            // Spawn animation - fast 1 second for demo
            spawnWarmup: DEMO_SPAWN_WARMUP_FRAMES,
            spawnWarmupMax: DEMO_SPAWN_WARMUP_FRAMES,
            spawnHoldoff: 0,
            isReviving: false, // Enemies RESPAWN, not revive
            // AI state
            lastKnownPlayerX: player.x,
            lastKnownPlayerY: player.y,
            timeSinceLastSeen: 0,
            stuckTimer: 0,
            lastX: spawnX,
            lastY: spawnY,
            // Flank system for surrounding behavior
            flankSide: (i % 2 === 0) ? 1 : -1,
            flankTimer: Math.random() * 60 // Faster flank for demo
        };
        
        enemies.push(enemy);
    }
}

// === FIXED TIMESTEP SYSTEM FOR DEMO ===
const DEMO_FIXED_TIMESTEP = 16.67;
const DEMO_MAX_ACCUMULATED = 100;
let demoAccumulatedTime = 0;

// === FPS LIMITER FOR DEMO (Robust for high refresh rate monitors) ===
// Uses DEBUG_FPS_LIMITER from config.js to control whether limiter is active
const DEMO_TARGET_FPS = 60;
const DEMO_FRAME_MIN_TIME = 1000 / DEMO_TARGET_FPS;
let demoLastFrameTime = -1; // Initialize to -1 for first frame detection
let demoFrameTimeAccumulator = 0; // Accumulates fractional frame time
let demoCurrentFPS = 60; // Track current FPS for Smart Performance Optimizer
let demoPerfFrameCount = 0;
let demoPerfTotalTime = 0;

// Main demo battle loop - uses fixed timestep for consistent speed
function demoBattleLoop() {
    if (!demoActive) return;
    
    // Schedule next frame immediately
    demoAnimationFrame = requestAnimationFrame(demoBattleLoop);
    
    const now = performance.now();
    
    // === FPS LIMITER (Controlled by DEBUG_FPS_LIMITER from config.js) ===
    if (typeof DEBUG_FPS_LIMITER !== 'undefined' && DEBUG_FPS_LIMITER) {
        // Initialize on first frame
        if (demoLastFrameTime < 0) {
            demoLastFrameTime = now;
            demoLastTime = now;
            return; // Skip first frame to establish baseline
        }
        
        // Calculate delta and accumulate
        const deltaTime = now - demoLastFrameTime;
        demoFrameTimeAccumulator += deltaTime;
        demoLastFrameTime = now;
        
        // Only process if enough time accumulated (16.67ms for 60 FPS)
        if (demoFrameTimeAccumulator < DEMO_FRAME_MIN_TIME) {
            return; // Skip, not enough time
        }
        
        // Consume frame time, keep remainder for precision
        demoFrameTimeAccumulator -= DEMO_FRAME_MIN_TIME;
        if (demoFrameTimeAccumulator > DEMO_FRAME_MIN_TIME) {
            demoFrameTimeAccumulator = 0; // Reset if behind
        }
    } else {
        // FPS limiter disabled - just track timing
        if (demoLastFrameTime < 0) {
            demoLastFrameTime = now;
            demoLastTime = now;
            return;
        }
        demoLastFrameTime = now;
    }
    
    const elapsed = now - demoLastTime;
    demoLastTime = now;
    
    // === SMART PERFORMANCE OPTIMIZER (For Demo) ===
    // Track FPS and call optimizer every 30 frames
    demoPerfFrameCount++;
    demoPerfTotalTime += elapsed;
    if (demoPerfFrameCount >= 30) {
        const avgFrameTime = demoPerfTotalTime / demoPerfFrameCount;
        demoCurrentFPS = 1000 / avgFrameTime;
        
        // Update Smart Performance Optimizer if enabled
        if (typeof DEBUG_SMART_PERFORMANCE !== 'undefined' && DEBUG_SMART_PERFORMANCE) {
            if (typeof updateSmartPerformance === 'function') {
                updateSmartPerformance(demoCurrentFPS);
            }
        }
        
        demoPerfFrameCount = 0;
        demoPerfTotalTime = 0;
    }
    
    // Fixed timestep accumulator - prevents speed-up during lag
    demoAccumulatedTime += elapsed;
    if (demoAccumulatedTime > DEMO_MAX_ACCUMULATED) {
        demoAccumulatedTime = DEMO_MAX_ACCUMULATED;
    }
    
    // Run updates at fixed rate
    let updatesThisFrame = 0;
    while (demoAccumulatedTime >= DEMO_FIXED_TIMESTEP && updatesThisFrame < 4) {
        demoDt = 1; // Fixed dt=1 for consistent physics
        demoFrame++;
        frame = demoFrame;
        updateDemo();
        demoAccumulatedTime -= DEMO_FIXED_TIMESTEP;
        updatesThisFrame++;
    }
    
    // Always render once per frame
    drawDemo();
}

// Update demo simulation
function updateDemo() {
    // Update player spawn warmup
    if (player.spawnWarmup > 0) {
        player.spawnWarmup = Math.max(0, player.spawnWarmup - demoDt);
        // Clear isReviving flag when spawn completes
        if (player.spawnWarmup <= 0) {
            player.isReviving = false;
        }
    }
    
    // Update camera to follow player
    if (player) {
        let tx = player.x - CANVAS.width / 2;
        let ty = player.y - CANVAS.height / 2;
        let minX = demoAreaOffsetX;
        let minY = demoAreaOffsetY;
        let maxX = Math.max(minX, demoAreaOffsetX + DEMO_AREA_SIZE - CANVAS.width);
        let maxY = Math.max(minY, demoAreaOffsetY + DEMO_AREA_SIZE - CANVAS.height);
        camX += (tx - camX) * 0.08 * demoDt;
        camY += (ty - camY) * 0.08 * demoDt;
        camX = Math.max(minX, Math.min(camX, maxX));
        camY = Math.max(minY, Math.min(camY, maxY));
    }
    
    // Update player AI (player acts as AI-controlled tank in demo)
    updateDemoPlayerAI();
    
    // Update enemy AI - USE GAME'S ACTUAL AI SYSTEM (updateEnemies from systems.js)
    // This ensures enemies behave EXACTLY like in real gameplay
    if (typeof updateEnemies === 'function') {
        updateEnemies(demoDt);
    }
    // Clamp enemies to demo area after game AI updates their positions
    clampEnemiesToDemoArea();
    
    // Update bullets using game's bullet system (handles wall/crate damage)
    updateDemoBullets();
    
    // Update particles using game's particle system
    updateDemoParticles();
    
    // === UPDATE MAGIC EFFECTS ===
    // Decay magic visual effects (shields, circles, etc.) so they don't persist forever
    if (typeof updateMagicEffects === 'function') {
        updateMagicEffects(demoDt);
    }
    
    // === UPDATE PICKUPS (allow player to collect drops) ===
    // Use game's pickup system so player can grab health, weapons, etc.
    if (typeof updatePickups === 'function') {
        updatePickups(demoDt);
    }
    
    // === DECAY PLAYER STATUS EFFECTS ===
    // Player status effects must decay over time (enemies handled by updateEnemies)
    updateDemoPlayerStatusEffects();
    // NOTE: Enemy status effects are now handled by updateEnemies() from systems.js
    
    // Decay screen shake
    if (screenShake > 0) screenShake *= 0.9;
    
    // Check for respawns (player and enemies)
    checkDemoRespawns();
}

// Update player status effects (decay timers for frozen, burning, slowed, stunned, etc.)
// This is critical - without this, effects like frozen persist forever!
function updateDemoPlayerStatusEffects() {
    if (!player || player.hp <= 0) return;
    
    // === NEGATIVE EFFECTS (from enemy attacks) ===
    // Game uses player.frozen, player.burning, etc (not frozenTime, burningTime)
    
    // Frozen effect - decays over time, prevents movement
    if (player.frozen && player.frozen > 0) {
        player.frozen -= demoDt;
        // Stop movement when frozen
        player.vx = 0;
        player.vy = 0;
        
        // Ice particle effects (matching gameplay.js)
        if (Math.random() < 0.3 * demoDt) {
            particles.push({
                x: player.x + (Math.random() - 0.5) * 40,
                y: player.y + (Math.random() - 0.5) * 40,
                vx: (Math.random() - 0.5) * 2,
                vy: -1 - Math.random(),
                life: 40 + Math.random() * 30,
                color: Math.random() < 0.5 ? '#00bcd4' : '#4dd0e1',
                size: Math.random() * 5 + 2
            });
        }
        
        if (player.frozen <= 0) {
            player.frozen = 0;
        }
    }
    
    // Burning effect - decays over time, deals damage
    if (player.burning && player.burning > 0) {
        player.burning -= demoDt;
        // Deal burning damage (0.5 HP per frame like gameplay.js)
        // DEBUG MODE: Skip damage when unlimited HP is enabled
        if (!DEBUG_UNLIMITED_HP) {
            player.hp -= 0.5 * demoDt;
        }
        
        // Fire particle effects (matching gameplay.js)
        if (Math.random() < 0.4 * demoDt) {
            particles.push({
                x: player.x + (Math.random() - 0.5) * 35,
                y: player.y + (Math.random() - 0.5) * 35,
                vx: (Math.random() - 0.5) * 3,
                vy: -2 - Math.random() * 2,
                life: 25 + Math.random() * 20,
                color: Math.random() < 0.5 ? '#ff6b35' : '#ff9500',
                size: Math.random() * 6 + 3
            });
        }
        
        if (player.burning <= 0) {
            player.burning = 0;
        }
    }
    
    // Slowed effect - decays over time, reduces speed (handled in movement)
    if (player.slowed && player.slowed > 0) {
        player.slowed -= demoDt;
        if (player.slowed <= 0) {
            player.slowed = 0;
        }
    }
    
    // Stunned effect - decays over time, drains energy
    if (player.stunned && player.stunned > 0) {
        player.stunned -= demoDt;
        // Drain energy when stunned
        player.energy = Math.max(0, (player.energy || 100) - 5.0 * demoDt);
        
        // Electric spark effects (matching gameplay.js)
        if (Math.random() < 0.5 * demoDt) {
            particles.push({
                x: player.x + (Math.random() - 0.5) * 50,
                y: player.y + (Math.random() - 0.5) * 50,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 15 + Math.random() * 10,
                color: '#ffeb3b',
                size: Math.random() * 4 + 2
            });
        }
        
        if (player.stunned <= 0) {
            player.stunned = 0;
        }
    }
    
    // === POSITIVE EFFECTS (from pickups) ===
    
    // Shield time - decays over time
    if (player.shieldTime && player.shieldTime > 0) {
        player.shieldTime -= demoDt;
        if (player.shieldTime <= 0) {
            player.shieldTime = 0;
        }
    }
    
    // Invisible - decays over time
    if (player.invisibleTime && player.invisibleTime > 0) {
        player.invisibleTime -= demoDt;
        if (player.invisibleTime <= 0) {
            player.invisibleTime = 0;
            player.invisible = false;
        }
    }
    
    // Turbo - decays over time
    if (player.turboTime && player.turboTime > 0) {
        player.turboTime -= demoDt;
        if (player.turboTime <= 0) {
            player.turboTime = 0;
            player.turboActive = false;
        }
    }
    
    // Magnet - decays over time
    if (player.magnetTime && player.magnetTime > 0) {
        player.magnetTime -= demoDt;
        if (player.magnetTime <= 0) {
            player.magnetTime = 0;
            player.magnetActive = false;
        }
    }
    
    // Damage boost - decays over time
    if (player.damageBoostTime && player.damageBoostTime > 0) {
        player.damageBoostTime -= demoDt;
        if (player.damageBoostTime <= 0) {
            player.damageBoostTime = 0;
            player.damageMultiplier = player.baseDamageMultiplier || 1.0;
        }
    }
    
    // Auto-aim time - decays over time
    if (player.autoAimTime && player.autoAimTime > 0) {
        player.autoAimTime -= demoDt;
        if (player.autoAimTime <= 0) {
            player.autoAimTime = 0;
            player.autoAim = false;
        }
    }
}

// NOTE: updateDemoEnemyStatusEffects() has been REMOVED
// Enemy status effects are now handled by updateEnemies() from systems.js
// This ensures enemy status effects work EXACTLY like the real game

// Update demo player AI (tier 5 intelligence level)
function updateDemoPlayerAI() {
    // Skip if player is spawning or dead
    if (player.spawnWarmup > 0 || player.hp <= 0) return;
    
    // Skip ALL actions if frozen - complete immobilization
    // Frozen tanks cannot move, aim, or shoot (authentic status effect)
    if (player.frozen > 0) return;
    
    const ai = player.demoAI || {};
    
    // Decay recoil
    if (player.recoil > 0) {
        player.recoil *= Math.pow(0.85, demoDt);
        if (player.recoil < 0.05) player.recoil = 0;
    }
    
    // Decay turret recoil - recoil follows turret angle for accurate visual feedback
    if (player.turretRecoilOffsetX !== 0 || player.turretRecoilOffsetY !== 0) {
        // Calculate current recoil magnitude
        const recoilMagnitude = Math.hypot(player.turretRecoilOffsetX, player.turretRecoilOffsetY);
        const newMagnitude = recoilMagnitude * 0.7;
        
        if (newMagnitude < 0.01) {
            // Snap to zero when very small
            player.turretRecoilOffsetX = 0;
            player.turretRecoilOffsetY = 0;
        } else {
            // Recalculate offset based on CURRENT turret angle (backward direction)
            const kickAngle = player.turretAngle - Math.PI;
            player.turretRecoilOffsetX = Math.cos(kickAngle) * newMagnitude;
            player.turretRecoilOffsetY = Math.sin(kickAngle) * newMagnitude;
        }
    }
    
    // Decay hit flash
    if (player.hitFlash > 0) player.hitFlash -= demoDt;
    
    // Cooldown
    if (ai.cooldown > 0) ai.cooldown -= demoDt;
    
    // Target selection - find closest enemy that is alive and not spawning
    ai.targetSwitchTimer = (ai.targetSwitchTimer || 0) - demoDt;
    if (ai.targetSwitchTimer <= 0 || !ai.target || ai.target.hp <= 0) {
        let closestDist = Infinity;
        let closest = null;
        for (let e of enemies) {
            if (e.hp <= 0 || e.spawnWarmup > 0) continue;
            const dist = Math.hypot(e.x - player.x, e.y - player.y);
            if (dist < closestDist) {
                closestDist = dist;
                closest = e;
            }
        }
        ai.target = closest;
        ai.targetSwitchTimer = 120 + Math.random() * 120; // Switch target every 2-4 seconds
    }
    
    const target = ai.target;
    const playerSpeed = 3; // Demo player speed
    
    if (target && target.hp > 0) {
        const dx = target.x - player.x;
        const dy = target.y - player.y;
        const dist = Math.hypot(dx, dy);
        const targetAngle = Math.atan2(dy, dx);
        
        // === RECOIL RECOVERY: Slow turret tracking after firing ===
        let turretRotationMultiplier = 1.0;
        if (player.recoilRecoveryTime > 0) {
            player.recoilRecoveryTime -= demoDt;
            // Exponential recovery - slower at start, gradually speeds up
            const recoveryProgress = Math.max(0, player.recoilRecoveryTime / 18);
            turretRotationMultiplier = 0.03 + (1 - recoveryProgress) * 0.12;
        }
        
        // Aim turret at target with smooth tracking
        let angleDiff = targetAngle - player.turretAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        player.turretAngle += angleDiff * 0.15 * turretRotationMultiplier * demoDt;
        
        // Movement AI - strafe and approach
        // DEMO uses closer combat distance for more action (180 vs real game's larger range)
        const optimalDist = 180;
        
        // Update strafe direction periodically
        if (!ai.strafeDir || Math.random() < 0.01 * demoDt) {
            ai.strafeDir = Math.random() > 0.5 ? 1 : -1;
        }
        
        // Calculate movement
        let moveX = 0;
        let moveY = 0;
        
        // DEMO: Tighter approach/retreat thresholds for closer combat
        if (dist > optimalDist + 50) {
            // Move closer
            moveX = Math.cos(targetAngle) * playerSpeed;
            moveY = Math.sin(targetAngle) * playerSpeed;
        } else if (dist < optimalDist - 50) {
            // Move away
            moveX = -Math.cos(targetAngle) * playerSpeed * 0.7;
            moveY = -Math.sin(targetAngle) * playerSpeed * 0.7;
        }
        
        // Add strafing
        const strafeAngle = targetAngle + Math.PI / 2 * ai.strafeDir;
        moveX += Math.cos(strafeAngle) * playerSpeed * 0.5;
        moveY += Math.sin(strafeAngle) * playerSpeed * 0.5;
        
        // Apply movement with wall collision check
        const newX = player.x + moveX * demoDt;
        const newY = player.y + moveY * demoDt;
        
        if (!checkDemoWallCollision(newX, player.y, player.radius || 25)) {
            player.x = newX;
        }
        if (!checkDemoWallCollision(player.x, newY, player.radius || 25)) {
            player.y = newY;
        }
        
        // Clamp to demo area bounds
        player.x = Math.max(demoAreaOffsetX + 50, Math.min(demoAreaOffsetX + DEMO_AREA_SIZE - 50, player.x));
        player.y = Math.max(demoAreaOffsetY + 50, Math.min(demoAreaOffsetY + DEMO_AREA_SIZE - 50, player.y));
        
        // Update body angle towards movement direction
        if (Math.abs(moveX) > 0.1 || Math.abs(moveY) > 0.1) {
            const moveAngle = Math.atan2(moveY, moveX);
            let bodyDiff = moveAngle - player.angle;
            while (bodyDiff > Math.PI) bodyDiff -= Math.PI * 2;
            while (bodyDiff < -Math.PI) bodyDiff += Math.PI * 2;
            player.angle += bodyDiff * 0.08 * demoDt;
            
            // Update wheel rotation
            player.wheelRotation = (player.wheelRotation || 0) + Math.hypot(moveX, moveY) * 0.03 * demoDt;
        }
        
        // Fire at target - check LOS to avoid shooting through walls/crates
        // This matches real game behavior where AI won't waste ammo on blocked shots
        if (ai.cooldown <= 0 && Math.abs(angleDiff) < 0.3) {
            // Calculate muzzle position for LOS check
            const muzzleX = player.x + Math.cos(player.turretAngle) * 35;
            const muzzleY = player.y + Math.sin(player.turretAngle) * 35;
            
            // Only fire if clear line of sight to target
            if (target && checkDemoLineOfSight(muzzleX, muzzleY, target.x, target.y)) {
                fireDemoPlayerBullet();
            }
        }
    }
}

// Fire bullet from player using game's bullet system
function fireDemoPlayerBullet() {
    if (!player || player.hp <= 0) return;
    
    const weapon = WEAPONS[player.weapon] || WEAPONS.cannon;
    const bulletSpeed = weapon.speed || 12;
    const bulletDamage = weapon.dmg || 25;
    const bulletColor = weapon.color || '#ffaa00';
    const bulletType = weapon.type || 'single'; // Use weapon's type property for proper rendering
    
    // Calculate spawn position
    const spawnX = player.x + Math.cos(player.turretAngle) * 35;
    const spawnY = player.y + Math.sin(player.turretAngle) * 35;
    
    // Add slight inaccuracy
    const spreadAmount = 0.05;
    const angle = player.turretAngle + (Math.random() - 0.5) * spreadAmount;
    
    // Handle twin cannon - fire two bullets side by side
    if (bulletType === 'twin') {
        const ox = Math.cos(angle + Math.PI / 2) * 8;
        const oy = Math.sin(angle + Math.PI / 2) * 8;
        
        // Fire dual bullets
        bullets.push({
            x: spawnX + ox, y: spawnY + oy,
            vx: Math.cos(angle) * bulletSpeed, vy: Math.sin(angle) * bulletSpeed,
            dmg: bulletDamage, color: bulletColor, type: 'twin',
            isEnemy: false, life: 180, prevX: spawnX + ox, prevY: spawnX + oy
        });
        bullets.push({
            x: spawnX - ox, y: spawnY - oy,
            vx: Math.cos(angle) * bulletSpeed, vy: Math.sin(angle) * bulletSpeed,
            dmg: bulletDamage, color: bulletColor, type: 'twin',
            isEnemy: false, life: 180, prevX: spawnX - ox, prevY: spawnY - oy
        });
        
        // Twin muzzle flash - dramatic plasma burst (same as gameplay.js)
        const twinColors = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'];
        for (let side of [1, -1]) {
            const sideX = spawnX + ox * side;
            const sideY = spawnY + oy * side;
            for (let i = 0; i < 10; i++) {
                const pColor = twinColors[Math.floor(Math.random() * twinColors.length)];
                const spreadAngle = angle + (Math.random() - 0.5) * 0.6;
                particles.push({
                    x: sideX, y: sideY,
                    vx: Math.cos(spreadAngle) * (8 + Math.random() * 6),
                    vy: Math.sin(spreadAngle) * (8 + Math.random() * 6),
                    life: 15 + Math.random() * 10, color: pColor,
                    size: 3 + Math.random() * 4
                });
            }
            // Core flash
            particles.push({
                x: sideX + Math.cos(angle) * 5, y: sideY + Math.sin(angle) * 5,
                vx: Math.cos(angle) * 3, vy: Math.sin(angle) * 3,
                life: 8, color: '#d1fae5', size: 12
            });
        }
    }
    // Handle shotgun - fire 5 pellets in spread pattern (same as gameplay.js)
    else if (bulletType === 'spread') {
        for (let i = -2; i <= 2; i++) {
            const pelletAngle = angle + i * 0.15;
            bullets.push({
                x: spawnX, y: spawnY,
                vx: Math.cos(pelletAngle) * bulletSpeed,
                vy: Math.sin(pelletAngle) * bulletSpeed,
                dmg: bulletDamage, color: bulletColor, type: 'spread',
                isEnemy: false, life: 60, prevX: spawnX, prevY: spawnY
            });
        }
        
        // Shotgun spread muzzle blast
        for (let i = 0; i < 25; i++) {
            particles.push({
                x: spawnX, y: spawnY,
                vx: Math.cos(angle + (Math.random() - 0.5) * 0.6) * (6 + Math.random() * 5),
                vy: Math.sin(angle + (Math.random() - 0.5) * 0.6) * (6 + Math.random() * 5),
                life: 20 + Math.random() * 15,
                color: i < 10 ? bulletColor : '#888888',
                size: Math.random() * 6 + 3
            });
        }
    }
    // Handle burst - fire 3 bullets in rapid succession (same as gameplay.js)
    else if (bulletType === 'burst') {
        const burstOriginX = player.x;
        const burstOriginY = player.y;
        
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                if (!player || player.hp <= 0 || !demoActive) return;
                
                const bx = burstOriginX + Math.cos(angle) * 35;
                const by = burstOriginY + Math.sin(angle) * 35;
                
                bullets.push({
                    x: bx, y: by,
                    vx: Math.cos(angle) * bulletSpeed,
                    vy: Math.sin(angle) * bulletSpeed,
                    dmg: bulletDamage, color: bulletColor, type: 'burst',
                    isEnemy: false, life: 80, prevX: burstOriginX, prevY: burstOriginY
                });
                
                // Burst muzzle flash per shot
                for (let j = 0; j < 10; j++) {
                    particles.push({
                        x: bx, y: by,
                        vx: Math.cos(angle) * (7 + Math.random() * 5) + (Math.random() - 0.5) * 2,
                        vy: Math.sin(angle) * (7 + Math.random() * 5) + (Math.random() - 0.5) * 2,
                        life: 10 + Math.random() * 8,
                        color: bulletColor,
                        size: Math.random() * 4 + 2
                    });
                }
            }, i * 100);
        }
    }
    // Handle sniper - single high-velocity round
    else if (bulletType === 'sniper') {
        bullets.push({
            x: spawnX, y: spawnY,
            vx: Math.cos(angle) * bulletSpeed, vy: Math.sin(angle) * bulletSpeed,
            dmg: bulletDamage, color: bulletColor, type: 'sniper',
            isEnemy: false, life: 180, prevX: spawnX, prevY: spawnY
        });
        
        // Sniper muzzle flash - intense focused blast
        for (let i = 0; i < 15; i++) {
            const flashAngle = angle + (Math.random() - 0.5) * 0.3;
            particles.push({
                x: spawnX, y: spawnY,
                vx: Math.cos(flashAngle) * (12 + Math.random() * 8),
                vy: Math.sin(flashAngle) * (12 + Math.random() * 8),
                life: 12 + Math.random() * 8,
                color: i < 5 ? '#ffffff' : bulletColor,
                size: Math.random() * 4 + 2
            });
        }
    }
    // Handle flak cannon - explosive shell
    else if (bulletType === 'flak') {
        bullets.push({
            x: spawnX, y: spawnY,
            vx: Math.cos(angle) * bulletSpeed, vy: Math.sin(angle) * bulletSpeed,
            dmg: bulletDamage, color: bulletColor, type: 'flak',
            isEnemy: false, life: 100, prevX: spawnX, prevY: spawnY
        });
        
        // Flak heavy artillery blast
        for (let i = 0; i < 20; i++) {
            particles.push({
                x: spawnX, y: spawnY,
                vx: Math.cos(angle + (Math.random() - 0.5) * 0.4) * (5 + Math.random() * 6),
                vy: Math.sin(angle + (Math.random() - 0.5) * 0.4) * (5 + Math.random() * 6),
                life: 18 + Math.random() * 12,
                color: bulletColor,
                size: Math.random() * 5 + 3
            });
        }
    }
    // Handle pierce (gauss) - armor piercing round
    else if (bulletType === 'pierce') {
        bullets.push({
            x: spawnX, y: spawnY,
            vx: Math.cos(angle) * bulletSpeed, vy: Math.sin(angle) * bulletSpeed,
            dmg: bulletDamage, color: bulletColor, type: 'pierce',
            isEnemy: false, life: 80, prevX: spawnX, prevY: spawnY, pierce: 3
        });
        
        // Gauss electromagnetic discharge
        for (let i = 0; i < 12; i++) {
            const flashAngle = angle + (Math.random() - 0.5) * 0.4;
            particles.push({
                x: spawnX, y: spawnY,
                vx: Math.cos(flashAngle) * (10 + Math.random() * 6),
                vy: Math.sin(flashAngle) * (10 + Math.random() * 6),
                life: 15 + Math.random() * 10,
                color: i % 2 === 0 ? '#60a5fa' : '#93c5fd',
                size: Math.random() * 3 + 2
            });
        }
    }
    // Handle elemental bullets (fire, ice, electric)
    else if (bulletType === 'fire') {
        bullets.push({
            x: spawnX, y: spawnY,
            vx: Math.cos(angle) * bulletSpeed, vy: Math.sin(angle) * bulletSpeed,
            dmg: bulletDamage, color: bulletColor, type: 'fire', element: 'fire',
            isEnemy: false, life: 120, prevX: spawnX, prevY: spawnY
        });
        
        // Fire muzzle blast
        const fireColors = ['#ff6b00', '#ff8c00', '#ffaa00', '#ffcc00'];
        for (let i = 0; i < 18; i++) {
            particles.push({
                x: spawnX, y: spawnY,
                vx: Math.cos(angle + (Math.random() - 0.5) * 0.5) * (6 + Math.random() * 5),
                vy: Math.sin(angle + (Math.random() - 0.5) * 0.5) * (6 + Math.random() * 5),
                life: 15 + Math.random() * 12,
                color: fireColors[Math.floor(Math.random() * fireColors.length)],
                size: Math.random() * 5 + 3
            });
        }
    }
    else if (bulletType === 'ice') {
        bullets.push({
            x: spawnX, y: spawnY,
            vx: Math.cos(angle) * bulletSpeed, vy: Math.sin(angle) * bulletSpeed,
            dmg: bulletDamage, color: bulletColor, type: 'ice', element: 'ice',
            isEnemy: false, life: 120, prevX: spawnX, prevY: spawnY
        });
        
        // Ice crystal muzzle flash
        const iceColors = ['#38bdf8', '#7dd3fc', '#bae6fd', '#ffffff'];
        for (let i = 0; i < 15; i++) {
            particles.push({
                x: spawnX, y: spawnY,
                vx: Math.cos(angle + (Math.random() - 0.5) * 0.4) * (5 + Math.random() * 4),
                vy: Math.sin(angle + (Math.random() - 0.5) * 0.4) * (5 + Math.random() * 4),
                life: 18 + Math.random() * 10,
                color: iceColors[Math.floor(Math.random() * iceColors.length)],
                size: Math.random() * 4 + 2
            });
        }
    }
    else if (bulletType === 'electric') {
        bullets.push({
            x: spawnX, y: spawnY,
            vx: Math.cos(angle) * bulletSpeed, vy: Math.sin(angle) * bulletSpeed,
            dmg: bulletDamage, color: bulletColor, type: 'electric', element: 'electric',
            isEnemy: false, life: 120, prevX: spawnX, prevY: spawnY
        });
        
        // Electric arc muzzle flash
        const electricColors = ['#a855f7', '#c084fc', '#ffeb3b', '#ffffff'];
        for (let i = 0; i < 15; i++) {
            particles.push({
                x: spawnX, y: spawnY,
                vx: Math.cos(angle + (Math.random() - 0.5) * 0.5) * (6 + Math.random() * 5),
                vy: Math.sin(angle + (Math.random() - 0.5) * 0.5) * (6 + Math.random() * 5),
                life: 12 + Math.random() * 10,
                color: electricColors[Math.floor(Math.random() * electricColors.length)],
                size: Math.random() * 4 + 2
            });
        }
    }
    else {
        // Default single bullet (cannon and others)
        bullets.push({
            x: spawnX, y: spawnY,
            vx: Math.cos(angle) * bulletSpeed, vy: Math.sin(angle) * bulletSpeed,
            dmg: bulletDamage, color: bulletColor,
            type: bulletType,
            isEnemy: false, life: 180, prevX: spawnX, prevY: spawnY
        });
        
        // Cannon - heavy artillery muzzle flash
        const cannonColors = ['#d1d5db', '#9ca3af', '#6b7280', '#ffffff'];
        for (let i = 0; i < 18; i++) {
            const spreadAngle = angle + (Math.random() - 0.5) * 0.6;
            particles.push({
                x: spawnX, y: spawnY,
                vx: Math.cos(spreadAngle) * (9 + Math.random() * 7),
                vy: Math.sin(spreadAngle) * (9 + Math.random() * 7),
                life: 18 + Math.random() * 12,
                color: cannonColors[Math.floor(Math.random() * cannonColors.length)],
                size: Math.random() * 6 + 3
            });
        }
        // Smoke puffs
        for (let i = 0; i < 5; i++) {
            particles.push({
                x: spawnX + (Math.random() - 0.5) * 8, y: spawnY + (Math.random() - 0.5) * 8,
                vx: Math.cos(angle) * (2 + Math.random() * 2),
                vy: Math.sin(angle) * (2 + Math.random() * 2) - Math.random(),
                life: 25 + Math.random() * 15, color: '#6b7280',
                size: 8 + Math.random() * 5
            });
        }
        // Core flash
        particles.push({
            x: spawnX + Math.cos(angle) * 8, y: spawnY + Math.sin(angle) * 8,
            vx: Math.cos(angle) * 4, vy: Math.sin(angle) * 4,
            life: 10, color: '#ffffff', size: 14
        });
    }
    
    // Apply recoil
    player.recoil = 8;
    player.turretRecoilOffsetX = -Math.cos(player.turretAngle) * 6;
    player.turretRecoilOffsetY = -Math.sin(player.turretAngle) * 6;
    player.recoilRecoveryTime = 18; // Turret tracking lock to show accuracy error (~0.3 sec)
    
    // Set cooldown based on weapon
    const cooldowns = { cannon: 40, twin: 30, burst: 25, sniper: 70, laser: 8, shotgun: 50, rocket: 80, flak: 45, gauss: 60, fire: 35, ice: 35, electric: 35 };
    if (player.demoAI) {
        player.demoAI.cooldown = cooldowns[player.weapon] || 40;
    }
}

// Clamp enemies to demo area bounds after game AI updates their positions
// This is needed because the game's updateEnemies() uses WORLD_W/WORLD_H bounds
// but demo uses a smaller demoAreaOffsetX/Y + DEMO_AREA_SIZE area
function clampEnemiesToDemoArea() {
    const margin = 50; // Keep tanks away from edges
    const minX = demoAreaOffsetX + margin;
    const maxX = demoAreaOffsetX + DEMO_AREA_SIZE - margin;
    const minY = demoAreaOffsetY + margin;
    const maxY = demoAreaOffsetY + DEMO_AREA_SIZE - margin;
    
    for (let e of enemies) {
        if (e.hp <= 0) continue;
        e.x = Math.max(minX, Math.min(maxX, e.x));
        e.y = Math.max(minY, Math.min(maxY, e.y));
    }
}

// NOTE: Demo now uses updateEnemies() from systems.js for enemy AI
// This ensures enemies use the EXACT SAME AI as the real game
// - All weapon firing is handled by systems.js
// - All status effects are handled by systems.js
// - All movement/retreat/dodge logic is handled by systems.js

// Check wall collision
function checkDemoWallCollision(x, y, radius) {
    for (let wall of walls) {
        if (x + radius > wall.x && x - radius < wall.x + wall.w &&
            y + radius > wall.y && y - radius < wall.y + wall.h) {
            return true;
        }
    }
    for (let crate of crates) {
        if (x + radius > crate.x && x - radius < crate.x + crate.w &&
            y + radius > crate.y && y - radius < crate.y + crate.h) {
            return true;
        }
    }
    return false;
}

// Check line-of-sight between two points (matches gameplay.js checkLineOfSight)
// Returns true if there's a clear shot, false if wall/crate blocks
// This prevents tanks from shooting through obstacles
function checkDemoLineOfSight(x1, y1, x2, y2) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = dist / 40; // Sample every 40 pixels like real game
    const dx = (x2 - x1) / steps;
    const dy = (y2 - y1) / steps;
    
    for (let i = 1; i < steps; i++) {
        const cx = x1 + dx * i;
        const cy = y1 + dy * i;
        
        // Check wall collision at sample point
        for (const wall of walls) {
            if (cx > wall.x - 10 && cx < wall.x + wall.w + 10 &&
                cy > wall.y - 10 && cy < wall.y + wall.h + 10) {
                return false; // Wall blocks LOS
            }
        }
        
        // Check crate collision at sample point
        for (const crate of crates) {
            if (cx > crate.x - 10 && cx < crate.x + crate.w + 10 &&
                cy > crate.y - 10 && cy < crate.y + crate.h + 10) {
                return false; // Crate blocks LOS
            }
        }
    }
    return true; // Clear line of sight
}

// Update bullets using game's actual bullet system
// This uses updateBullets() from systems.js which handles:
// - Wall/crate collision with HP damage (destructible terrain)
// - Tank hit detection (player and enemies)
// - Impact particles and screen shake
// - Spatial optimization with grid system
function updateDemoBullets() {
    // Use the actual game's bullet update system for authentic behavior
    // This handles all collision detection including wall/crate HP reduction
    if (typeof updateBullets === 'function') {
        updateBullets(demoDt);
    } else {
        // Fallback: Simple bullet update if game function not available
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.x += b.vx * demoDt;
            b.y += b.vy * demoDt;
            b.life -= demoDt;
            
            // Remove if out of demo bounds or expired
            if (b.life <= 0 || 
                b.x < demoAreaOffsetX - 100 || b.x > demoAreaOffsetX + DEMO_AREA_SIZE + 100 || 
                b.y < demoAreaOffsetY - 100 || b.y > demoAreaOffsetY + DEMO_AREA_SIZE + 100) {
                bullets.splice(i, 1);
            }
        }
    }
}

// Create impact particles - uses game's actual particle system
function createDemoImpact(x, y, color, bulletType = 'single') {
    // Use game's actual createBulletImpact if available for authentic effects
    // Pass the actual bullet type for weapon-specific impact visuals
    if (typeof createBulletImpact === 'function') {
        createBulletImpact(x, y, bulletType, color, 20, Math.random() * Math.PI * 2);
        return;
    }
    
    // Fallback: Create particles manually using game's particle array
    for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 3;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 20 + Math.random() * 15,
            color: color,
            size: 2 + Math.random() * 3
        });
    }
}

// Create explosion particles - uses game's actual explosion system
function createDemoExplosion(x, y, color) {
    // Use game's actual createExplosion function for authentic tank death effects
    if (typeof createExplosion === 'function') {
        createExplosion(x, y, color || '#ff6b35');
        return;
    }
    
    // Fallback: Create explosion particles manually using game's particle array
    // Main explosion
    for (let i = 0; i < 25; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 5;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 30 + Math.random() * 25,
            color: Math.random() > 0.5 ? '#ff6b35' : '#ffaa00',
            size: 4 + Math.random() * 6
        });
    }
    
    // Smoke particles
    for (let i = 0; i < 10; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 2;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1,
            life: 50 + Math.random() * 30,
            color: '#444',
            size: 6 + Math.random() * 8
        });
    }
    
    screenShake = Math.min(screenShake + 8, 15);
}

// Update particles using game's actual particle system
function updateDemoParticles() {
    // Use game's updateParticles function if available
    if (typeof updateParticles === 'function') {
        updateParticles(demoDt);
        return;
    }
    
    // Fallback: Update particles manually using game's particle array
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * demoDt;
        p.y += p.vy * demoDt;
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.life -= demoDt;
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

// Demo death sequence state - tracks tanks that are in death animation
let demoDeathSequences = {
    player: { active: false, timer: 0, x: 0, y: 0 },
    enemies: [] // Array of { active, timer, x, y, index }
};

// Check and handle death/revive/respawn with proper animations
// IMPORTANT DISTINCTION:
// - PLAYER: REVIVE (phoenix effect, unlimited, at same spawn location)
// - ENEMY: RESPAWN (standard spawn effect, at new random position)
function checkDemoRespawns() {
    // === PLAYER DEATH SEQUENCE (REVIVE - unlimited) ===
    // Player tanks REVIVE with phoenix animation, not respawn
    if (player && player.hp <= 0 && !demoDeathSequences.player.active && player.spawnWarmup <= 0) {
        // Start death sequence - DO NOT revive yet, play death animation first
        demoDeathSequences.player.active = true;
        demoDeathSequences.player.timer = DEMO_DEATH_ANIMATION_FRAMES; // 1 second death animation
        demoDeathSequences.player.x = player.x;
        demoDeathSequences.player.y = player.y;
        
        // Set isDying flag to hide player tank during death animation
        player.isDying = true;
        
        // Create dramatic death explosion using game's explosion system
        if (typeof createExplosion === 'function') {
            createExplosion(player.x, player.y, '#ef4444');
        } else {
            createDemoExplosion(player.x, player.y, '#ef4444');
        }
        
        // Secondary explosions cascade
        for (let i = 1; i <= 3; i++) {
            setTimeout(() => {
                if (!demoDeathSequences.player.active) return;
                const angle = (i / 3) * Math.PI * 2;
                const dist = 30 + Math.random() * 50;
                const expX = demoDeathSequences.player.x + Math.cos(angle) * dist;
                const expY = demoDeathSequences.player.y + Math.sin(angle) * dist;
                if (typeof createExplosion === 'function') {
                    createExplosion(expX, expY, i % 2 === 0 ? '#fb923c' : '#ef4444');
                } else {
                    createDemoExplosion(expX, expY, i % 2 === 0 ? '#fb923c' : '#ef4444');
                }
                screenShake = Math.min(screenShake + 10, 20);
            }, i * 80);
        }
        
        // Add metal debris
        for (let i = 0; i < 30; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 6;
            particles.push({
                x: player.x,
                y: player.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 60 + Math.random() * 30,
                color: i % 3 === 0 ? '#4A5568' : (i % 3 === 1 ? '#718096' : '#2D3748'),
                size: Math.random() * 5 + 2,
                gravity: 0.1
            });
        }
        
        screenShake = 25;
    }
    
    // Update player death sequence timer
    if (demoDeathSequences.player.active) {
        demoDeathSequences.player.timer -= demoDt;
        
        // When death animation completes, REVIVE player (not respawn!)
        // Player has UNLIMITED revives in demo - phoenix rises from ashes
        if (demoDeathSequences.player.timer <= 0) {
            demoDeathSequences.player.active = false;
            
            // Clear isDying flag - player will be visible again
            player.isDying = false;
            
            // REVIVE at same position where player died (authentic revive behavior)
            // Unlike respawn which teleports to new location
            player.x = demoDeathSequences.player.x;
            player.y = demoDeathSequences.player.y;
            player.vx = 0;
            player.vy = 0;
            
            // === FULL REVIVE RESTORATION (matching real game) ===
            // Restore HP to full
            player.hp = player.maxHp || 2500;
            player.hitFlash = 0;
            player.seed = Math.random();
            
            // === CLEAR ALL ENEMY DEBUFF EFFECTS (critical for clean revive) ===
            // Note: Game uses numeric timers (e.g. player.frozen > 0), not booleans
            // Remove frozen effect
            player.frozen = 0;
            player.frozenTime = 0;
            // Remove burning effect
            player.burning = 0;
            player.burningTime = 0;
            // Remove slowed effect
            player.slowed = 0;
            player.slowedTime = 0;
            // Remove stunned effect
            player.stunned = 0;
            player.stunnedTime = 0;
            // Clear invisible (shouldn't persist through death)
            player.invisible = false;
            player.invisibleTime = 0;
            // Clear turbo
            player.turboActive = false;
            player.turboTime = 0;
            // Clear magnet
            player.magnetActive = false;
            player.magnetTime = 0;
            // Clear autoAim
            player.autoAim = false;
            player.autoAimTime = 0;
            
            // Random weapon on revive (like real game)
            const weapons = ['cannon', 'twin', 'burst', 'sniper', 'laser', 'shotgun', 'rocket'];
            player.weapon = weapons[Math.floor(Math.random() * weapons.length)];
            
            // DEFENSIVE LAYERS (critical for authentic revive)
            // Armor: 75% of maxHP as protective layer
            player.maxArmor = Math.ceil((player.maxHp || 2500) * 0.75);
            player.armor = player.maxArmor;
            // Shield: Extended protection (20 seconds = 1200 frames at 60fps)
            player.shieldTime = 1200;
            
            // Enable REVIVE animation (phoenix effect with pink/gold colors)
            // This is visually distinct from normal spawn animation
            player.spawnWarmup = DEMO_SPAWN_WARMUP_FRAMES;
            player.spawnWarmupMax = DEMO_SPAWN_WARMUP_FRAMES;
            player.isReviving = true; // CRITICAL: triggers phoenix animation (pink/gold glow)
            
            // Reset AI state
            if (player.demoAI) {
                player.demoAI.target = null;
                player.demoAI.cooldown = 30; // Faster recovery in demo
            }
            
            // === EPIC PHOENIX REVIVE ANIMATION (matching real game) ===
            createDemoPhoenixReviveAnimation(player.x, player.y);
        }
    }
    
    // === ENEMY DEATH SEQUENCES (RESPAWN - at new random position) ===
    // Enemy tanks RESPAWN (not revive) - they teleport to new surrounding position
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        
        // Check for existing ACTIVE death sequence for this enemy
        // Important: only check for active sequences, so completed ones don't block new respawns
        let deathSeq = demoDeathSequences.enemies.find(d => d.index === i && d.active);
        
        // When enemy dies, start death animation then RESPAWN at new position
        // Condition: HP <= 0 or isDying flag, no active death sequence, and not currently spawning
        if ((e.hp <= 0 || e.isDying) && !deathSeq && e.spawnWarmup <= 0) {
            // Set isDying flag to prevent killEnemy from being called repeatedly
            e.isDying = true;
            
            // Create new death sequence and assign to deathSeq for processing below
            deathSeq = { active: true, timer: DEMO_DEATH_ANIMATION_FRAMES, x: e.x, y: e.y, index: i };
            demoDeathSequences.enemies.push(deathSeq);
            
            // Create explosion
            if (typeof createExplosion === 'function') {
                createExplosion(e.x, e.y, e.color || '#ef4444');
            } else {
                createDemoExplosion(e.x, e.y, e.color || '#ef4444');
            }
            
            // Metal debris
            for (let j = 0; j < 15; j++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 2 + Math.random() * 4;
                particles.push({
                    x: e.x,
                    y: e.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 40 + Math.random() * 20,
                    color: j % 2 === 0 ? '#4A5568' : '#718096',
                    size: Math.random() * 4 + 2
                });
            }
            
            screenShake = Math.min(screenShake + 8, 15);
        }
        
        // Update enemy death sequence timer
        if (deathSeq && deathSeq.active) {
            deathSeq.timer -= demoDt;
            
            // When death animation completes, RESPAWN enemy at NEW random surrounding position
            // This is different from player REVIVE which stays at death location
            if (deathSeq.timer <= 0) {
                deathSeq.active = false;
                
                // Remove from death sequences array
                const seqIdx = demoDeathSequences.enemies.indexOf(deathSeq);
                if (seqIdx > -1) demoDeathSequences.enemies.splice(seqIdx, 1);
                
                // Find NEW random surrounding position (RESPAWN teleports to new location)
                const tier = ENEMY_TIERS[e.tierId || e.id] || ENEMY_TIERS[0];
                const spawnPos = findDemoEnemySurroundSpot(i);
                
                e.x = spawnPos.x;
                e.y = spawnPos.y;
                e.vx = 0;
                e.vy = 0;
                e.hp = tier.hp;
                e.maxHp = tier.hp;
                e.hitFlash = 0;
                e.seed = Math.random();
                e.angle = Math.random() * Math.PI * 2;
                e.turretAngle = e.angle;
                e.recoil = 0;
                e.cooldown = Math.random() * 30; // Faster recovery in demo
                e.isDying = false; // Clear dying flag - enemy is alive again
                
                // Enable SPAWN animation (standard green teleport, not phoenix)
                e.spawnWarmup = DEMO_SPAWN_WARMUP_FRAMES;
                e.spawnWarmupMax = DEMO_SPAWN_WARMUP_FRAMES;
                e.isReviving = false; // NOT reviving - standard respawn
                
                // Reset AI state and assign new surround sector
                e.surroundSector = undefined;
                e.flankTimer = Math.random() * 60; // Faster flank in demo
                
                // Create RESPAWN effect (standard teleport particles)
                createDemoRespawnEffect(e.x, e.y, false);
            }
        }
    }
}

// Find a surrounding spot for enemy respawn - ensures enemies spread around player
// Enemies respawn CLOSE to player to maintain aggressive surrounding formation
function findDemoEnemySurroundSpot(enemyIndex) {
    const centerX = player.x;
    const centerY = player.y;
    // DEMO: Closer spawn radius (200-300) for aggressive surrounding
    const spawnRadius = 200 + Math.random() * 100;
    const minDistFromOthers = 100; // Minimum distance from other tanks (closer together)
    const tankRadius = 30; // Enemy tank radius for collision check
    
    // Try to find a good surrounding position
    for (let attempt = 0; attempt < 50; attempt++) {
        // Random angle around player
        const angle = Math.random() * Math.PI * 2;
        let x = centerX + Math.cos(angle) * spawnRadius;
        let y = centerY + Math.sin(angle) * spawnRadius;
        
        // Clamp to demo area bounds (with extra margin for tank size)
        x = Math.max(demoAreaOffsetX + 100 + tankRadius, Math.min(demoAreaOffsetX + DEMO_AREA_SIZE - 100 - tankRadius, x));
        y = Math.max(demoAreaOffsetY + 100 + tankRadius, Math.min(demoAreaOffsetY + DEMO_AREA_SIZE - 100 - tankRadius, y));
        
        // Check distance from player - allow closer spawning in demo
        const distFromPlayer = Math.hypot(x - player.x, y - player.y);
        if (distFromPlayer < 120) continue; // Allow closer to player than real game
        
        // Check distance from other enemies
        let tooClose = false;
        for (let i = 0; i < enemies.length; i++) {
            if (i === enemyIndex) continue;
            const e = enemies[i];
            if (e.hp <= 0) continue; // Skip dead enemies
            const dist = Math.hypot(x - e.x, y - e.y);
            if (dist < minDistFromOthers) {
                tooClose = true;
                break;
            }
        }
        if (tooClose) continue;
        
        // Check wall collision - use PROPER bounding box collision with tank radius
        let wallCollision = false;
        for (const wall of walls) {
            // Check if tank circle overlaps with wall rectangle
            const closestX = Math.max(wall.x, Math.min(x, wall.x + wall.w));
            const closestY = Math.max(wall.y, Math.min(y, wall.y + wall.h));
            const distToWall = Math.hypot(x - closestX, y - closestY);
            if (distToWall < tankRadius + 10) { // Extra margin
                wallCollision = true;
                break;
            }
        }
        if (wallCollision) continue;
        
        // Check crate collision - same proper collision detection
        let crateCollision = false;
        for (const crate of crates) {
            const closestX = Math.max(crate.x, Math.min(x, crate.x + crate.w));
            const closestY = Math.max(crate.y, Math.min(y, crate.y + crate.h));
            const distToCrate = Math.hypot(x - closestX, y - closestY);
            if (distToCrate < tankRadius + 10) { // Extra margin
                crateCollision = true;
                break;
            }
        }
        if (crateCollision) continue;
        
        return { x, y };
    }
    
    // Fallback: Try multiple random positions with collision checks
    for (let fallbackAttempt = 0; fallbackAttempt < 20; fallbackAttempt++) {
        const fallbackAngle = Math.random() * Math.PI * 2;
        const fallbackDist = 300 + Math.random() * 200;
        let x = centerX + Math.cos(fallbackAngle) * fallbackDist;
        let y = centerY + Math.sin(fallbackAngle) * fallbackDist;
        
        // Clamp to bounds
        x = Math.max(demoAreaOffsetX + 100 + tankRadius, Math.min(demoAreaOffsetX + DEMO_AREA_SIZE - 100 - tankRadius, x));
        y = Math.max(demoAreaOffsetY + 100 + tankRadius, Math.min(demoAreaOffsetY + DEMO_AREA_SIZE - 100 - tankRadius, y));
        
        // Quick wall check
        let valid = true;
        for (const wall of walls) {
            const closestX = Math.max(wall.x, Math.min(x, wall.x + wall.w));
            const closestY = Math.max(wall.y, Math.min(y, wall.y + wall.h));
            if (Math.hypot(x - closestX, y - closestY) < tankRadius + 10) {
                valid = false;
                break;
            }
        }
        if (valid) return { x, y };
    }
    
    // Ultimate fallback: spawn at demo area center
    return {
        x: demoAreaOffsetX + DEMO_AREA_SIZE / 2,
        y: demoAreaOffsetY + DEMO_AREA_SIZE / 2
    };
}

// Create RESPAWN effect for enemies (standard teleport animation)
// Different from REVIVE which has phoenix/pink glow effect
function createDemoRespawnEffect(x, y, isPlayer) {
    // Enemy RESPAWN uses red/orange teleport effect
    const primaryColor = '#ef4444';   // Red
    const secondaryColor = '#fb923c'; // Orange
    
    // Teleport flash ring - expanding circle of particles
    for (let i = 0; i < 16; i++) {
        const angle = (Math.PI * 2 * i) / 16;
        particles.push({
            x: x + Math.cos(angle) * 35,
            y: y + Math.sin(angle) * 35,
            vx: Math.cos(angle) * 3,
            vy: Math.sin(angle) * 3,
            life: 25,
            color: primaryColor,
            size: 3
        });
    }
    
    // Inner glow particles
    for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 2;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 18 + Math.random() * 8,
            color: secondaryColor,
            size: 2 + Math.random() * 3
        });
    }
}

// Create REVIVE effect for player (phoenix animation with pink/gold glow)
// This is visually distinct from enemy respawn to show the difference
function createDemoReviveEffect(x, y) {
    // Simple version - called immediately for basic effect
    // Full animation is in createDemoPhoenixReviveAnimation
    const phoenixPink = '#ec4899';
    const phoenixGold = '#fbbf24';
    
    // Quick flash ring
    for (let i = 0; i < 16; i++) {
        const angle = (Math.PI * 2 * i) / 16;
        particles.push({
            x: x + Math.cos(angle) * 40,
            y: y + Math.sin(angle) * 40,
            vx: Math.cos(angle) * 2,
            vy: -2 - Math.random(),
            life: 25,
            color: i % 2 === 0 ? phoenixPink : phoenixGold,
            size: 4
        });
    }
}

// Create EPIC PHOENIX REVIVE ANIMATION (matching real game's completeDeathSequence)
// Multi-stage dramatic animation showing tank resurrection
function createDemoPhoenixReviveAnimation(x, y) {
    const phoenixPink = '#ff69b4';
    const phoenixGold = '#fbbf24';
    const phoenixOrange = '#ff6600';
    const phoenixWhite = '#ffffff';
    const phoenixCyan = '#00ffff';
    
    // STAGE 1: Ashes falling (0ms)
    screenShake = 15;
    for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 50;
        particles.push({
            x: x + Math.cos(angle) * dist,
            y: y + Math.sin(angle) * dist,
            vx: (Math.random() - 0.5) * 2,
            vy: 2 + Math.random() * 2,
            life: 40,
            color: '#333333',
            size: Math.random() * 4 + 2
        });
    }
    
    // STAGE 2: Soul Energy Gathering (100ms)
    setTimeout(() => {
        for (let dir = 0; dir < 6; dir++) {
            const baseAngle = (dir / 6) * Math.PI * 2;
            for (let i = 0; i < 8; i++) {
                const angle = baseAngle + (Math.random() - 0.5) * 0.3;
                const radius = 100 + Math.random() * 60;
                const startX = x + Math.cos(angle) * radius;
                const startY = y + Math.sin(angle) * radius;
                setTimeout(() => {
                    particles.push({
                        x: startX, y: startY,
                        vx: -Math.cos(angle) * (5 + Math.random() * 3),
                        vy: -Math.sin(angle) * (5 + Math.random() * 3),
                        life: 30,
                        color: i % 3 === 0 ? phoenixGold : (i % 3 === 1 ? phoenixPink : phoenixWhite),
                        size: Math.random() * 5 + 3
                    });
                }, i * 20);
            }
        }
    }, 100);
    
    // STAGE 3: Ground Energy Rising (200ms)
    setTimeout(() => {
        for (let i = 0; i < 40; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 15 + Math.random() * 35;
            setTimeout(() => {
                particles.push({
                    x: x + Math.cos(angle) * radius,
                    y: y + 40,
                    vx: (Math.random() - 0.5) * 1.2,
                    vy: -8 - Math.random() * 6,
                    life: 40,
                    color: i % 3 === 0 ? '#00ff88' : (i % 3 === 1 ? phoenixGold : phoenixPink),
                    size: Math.random() * 4 + 2
                });
            }, i * 6);
        }
    }, 200);
    
    // STAGE 4: Phoenix Core Ignition (350ms)
    setTimeout(() => {
        screenShake = 25;
        
        // Center flash
        particles.push({ x: x, y: y, size: 80, life: 25, color: 'rgba(255,255,255,0.8)', type: 'wave' });
        
        // Core burst
        for (let i = 0; i < 60; i++) {
            const angle = (i / 60) * Math.PI * 2;
            const speed = 2 + Math.random() * 3;
            particles.push({
                x: x, y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 35,
                color: phoenixWhite,
                size: Math.random() * 3 + 2
            });
        }
    }, 350);
    
    // STAGE 5: Phoenix Wings Burst (450ms)
    setTimeout(() => {
        screenShake = 35;
        
        // Explosion rings
        for (let r = 0; r < 3; r++) {
            setTimeout(() => {
                particles.push({ 
                    x: x, y: y, 
                    size: 60 + r * 40, life: 30 - r * 5, 
                    color: r % 2 === 0 ? 'rgba(255,105,180,0.5)' : 'rgba(251,191,36,0.5)', 
                    type: 'wave' 
                });
            }, r * 60);
        }
        
        // Wing particles (horizontal spread)
        for (let i = 0; i < 80; i++) {
            const isWing = Math.random() > 0.4;
            const angle = isWing 
                ? (Math.random() > 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.6
                : Math.random() * Math.PI * 2;
            const speed = isWing ? (8 + Math.random() * 6) : (4 + Math.random() * 4);
            
            particles.push({
                x: x, y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - (isWing ? 1.5 : 0),
                life: 50 + Math.random() * 25,
                color: i % 4 === 0 ? phoenixWhite : (i % 4 === 1 ? phoenixGold : (i % 4 === 2 ? phoenixPink : phoenixOrange)),
                size: Math.random() * 6 + 3
            });
        }
        
        // Fire trail rising
        for (let i = 0; i < 30; i++) {
            setTimeout(() => {
                particles.push({
                    x: x + (Math.random() - 0.5) * 30,
                    y: y + Math.random() * 15,
                    vx: (Math.random() - 0.5) * 3,
                    vy: -8 - Math.random() * 6,
                    life: 60,
                    color: i % 3 === 0 ? '#ff4500' : (i % 3 === 1 ? phoenixGold : phoenixPink),
                    size: Math.random() * 7 + 4
                });
            }, i * 10);
        }
    }, 450);
    
    // STAGE 6: Protective Aura (600ms)
    setTimeout(() => {
        for (let ring = 0; ring < 2; ring++) {
            for (let i = 0; i < 12; i++) {
                const angle = (i / 12) * Math.PI * 2 + ring * 0.25;
                const radius = 30 + ring * 12;
                setTimeout(() => {
                    particles.push({
                        x: x + Math.cos(angle) * radius,
                        y: y + Math.sin(angle) * radius,
                        vx: -Math.sin(angle) * 2.5,
                        vy: Math.cos(angle) * 2.5 - 0.8,
                        life: 40,
                        color: ring === 0 ? phoenixCyan : phoenixGold,
                        size: Math.random() * 4 + 2
                    });
                }, ring * 80 + i * 12);
            }
        }
    }, 600);
    
    // STAGE 7: Final Empowerment (750ms)
    setTimeout(() => {
        particles.push({ x: x, y: y, size: 100, life: 35, color: 'rgba(0,255,200,0.4)', type: 'wave' });
        
        // Celebration sparkles
        for (let i = 0; i < 25; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 20 + Math.random() * 30;
            particles.push({
                x: x + Math.cos(angle) * radius,
                y: y + Math.sin(angle) * radius,
                vx: (Math.random() - 0.5) * 2,
                vy: -2 - Math.random() * 3,
                life: 50,
                color: i % 2 === 0 ? phoenixGold : phoenixCyan,
                size: Math.random() * 3 + 2
            });
        }
    }, 750);
}

// Draw demo using actual game renderer
// This uses the game's draw() function from render.js which handles:
// - Tank rendering with proper turrets, colors, animations
// - Wall and crate rendering with damage/crack effects
// - Bullet rendering with proper types and effects
// - Particle rendering with glow and fade effects
// - Spawn animation effects (spawn warmup visual)
function drawDemo() {
    // Call actual game draw function - renders everything using game's graphics
    if (typeof draw === 'function') {
        draw();
    }
    
    // Draw demo title overlay (vignette effect for main menu aesthetic)
    drawDemoOverlay();
}

// Draw demo title overlay - fog of war effect for cinematic main menu
function drawDemoOverlay() {
    const w = CANVAS.width;
    const h = CANVAS.height;
    const time = typeof demoFrame !== 'undefined' ? demoFrame : Date.now() * 0.06;
    
    // Adaptive sizing for landscape/portrait
    const baseSize = Math.min(w, h);
    const isLandscape = w > h;
    
    CTX.save();
    
    // === LAYER 1: Base fog coverage - entire screen with uniform density ===
    CTX.globalAlpha = 0.15;
    CTX.fillStyle = 'rgb(12, 18, 32)';
    CTX.fillRect(0, 0, w, h);
    
    // === LAYER 2: Animated fog wisps - flowing across screen ===
    const fogLayers = [
        { speed: 0.0004, scale: 0.9, alpha: 0.1, yOffset: 0 },
        { speed: 0.0006, scale: 1.3, alpha: 0.08, yOffset: h * 0.35 },
        { speed: 0.0005, scale: 1.1, alpha: 0.09, yOffset: h * 0.65 }
    ];
    
    fogLayers.forEach((fog, index) => {
        const xOffset = (time * fog.speed * w) % (w * 2) - w * 0.5;
        const waveY = Math.sin(time * 0.007 + index) * 25;
        
        const fogGrad = CTX.createLinearGradient(
            xOffset, fog.yOffset + waveY,
            xOffset + w * fog.scale, fog.yOffset + h * 0.45 + waveY
        );
        fogGrad.addColorStop(0, 'rgba(18, 22, 38, 0)');
        fogGrad.addColorStop(0.3, `rgba(22, 28, 48, ${fog.alpha})`);
        fogGrad.addColorStop(0.5, `rgba(28, 35, 55, ${fog.alpha * 1.3})`);
        fogGrad.addColorStop(0.7, `rgba(22, 28, 48, ${fog.alpha})`);
        fogGrad.addColorStop(1, 'rgba(18, 22, 38, 0)');
        
        CTX.globalAlpha = 1;
        CTX.fillStyle = fogGrad;
        CTX.fillRect(0, 0, w, h);
    });
    
    // === LAYER 3: Fog density clouds - scattered across screen ===
    const cloudCount = isLandscape ? 10 : 7;
    for (let i = 0; i < cloudCount; i++) {
        const cloudX = (w * (i / cloudCount) + Math.sin(time * 0.004 + i * 2.2) * w * 0.12) % w;
        const cloudY = (h * ((i * 0.618) % 1) + Math.cos(time * 0.003 + i) * h * 0.1);
        const cloudSize = baseSize * (0.22 + Math.sin(time * 0.0025 + i * 1.3) * 0.06);
        const cloudAlpha = 0.05 + Math.sin(time * 0.005 + i * 0.7) * 0.025;
        
        const cloudGrad = CTX.createRadialGradient(
            cloudX, cloudY, 0,
            cloudX, cloudY, cloudSize
        );
        cloudGrad.addColorStop(0, `rgba(22, 32, 52, ${cloudAlpha})`);
        cloudGrad.addColorStop(0.4, `rgba(18, 28, 48, ${cloudAlpha * 0.65})`);
        cloudGrad.addColorStop(0.7, `rgba(14, 22, 42, ${cloudAlpha * 0.35})`);
        cloudGrad.addColorStop(1, 'rgba(14, 22, 42, 0)');
        
        CTX.fillStyle = cloudGrad;
        CTX.fillRect(0, 0, w, h);
    }
    
    // === LAYER 4: Edge darkening with rounded corners ===
    const edgeSize = baseSize * 0.28;
    const cornerRadius = baseSize * 0.18;
    
    // Top edge fog
    const topGrad = CTX.createLinearGradient(0, 0, 0, edgeSize);
    topGrad.addColorStop(0, 'rgba(8, 12, 28, 0.45)');
    topGrad.addColorStop(0.5, 'rgba(8, 12, 28, 0.2)');
    topGrad.addColorStop(1, 'rgba(8, 12, 28, 0)');
    CTX.fillStyle = topGrad;
    CTX.fillRect(0, 0, w, edgeSize);
    
    // Bottom edge fog
    const bottomGrad = CTX.createLinearGradient(0, h - edgeSize, 0, h);
    bottomGrad.addColorStop(0, 'rgba(8, 12, 28, 0)');
    bottomGrad.addColorStop(0.5, 'rgba(8, 12, 28, 0.2)');
    bottomGrad.addColorStop(1, 'rgba(8, 12, 28, 0.45)');
    CTX.fillStyle = bottomGrad;
    CTX.fillRect(0, h - edgeSize, w, edgeSize);
    
    // Left edge fog
    const leftGrad = CTX.createLinearGradient(0, 0, edgeSize, 0);
    leftGrad.addColorStop(0, 'rgba(8, 12, 28, 0.45)');
    leftGrad.addColorStop(0.5, 'rgba(8, 12, 28, 0.2)');
    leftGrad.addColorStop(1, 'rgba(8, 12, 28, 0)');
    CTX.fillStyle = leftGrad;
    CTX.fillRect(0, 0, edgeSize, h);
    
    // Right edge fog
    const rightGrad = CTX.createLinearGradient(w - edgeSize, 0, w, 0);
    rightGrad.addColorStop(0, 'rgba(8, 12, 28, 0)');
    rightGrad.addColorStop(0.5, 'rgba(8, 12, 28, 0.2)');
    rightGrad.addColorStop(1, 'rgba(8, 12, 28, 0.45)');
    CTX.fillStyle = rightGrad;
    CTX.fillRect(w - edgeSize, 0, edgeSize, h);
    
    // === LAYER 5: Rounded corner fog patches ===
    const corners = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: 0, y: h },
        { x: w, y: h }
    ];
    
    corners.forEach(corner => {
        const cornerGrad = CTX.createRadialGradient(
            corner.x, corner.y, 0,
            corner.x, corner.y, cornerRadius * 2.2
        );
        cornerGrad.addColorStop(0, 'rgba(6, 10, 22, 0.5)');
        cornerGrad.addColorStop(0.4, 'rgba(8, 12, 28, 0.3)');
        cornerGrad.addColorStop(0.7, 'rgba(10, 15, 32, 0.12)');
        cornerGrad.addColorStop(1, 'rgba(12, 18, 35, 0)');
        
        CTX.fillStyle = cornerGrad;
        CTX.fillRect(0, 0, w, h);
    });
    
    // === LAYER 6: Subtle pulsing atmosphere ===
    const pulseAlpha = 0.025 + Math.sin(time * 0.012) * 0.018;
    CTX.globalAlpha = pulseAlpha;
    CTX.fillStyle = 'rgb(18, 22, 42)';
    CTX.fillRect(0, 0, w, h);
    
    // === LAYER 7: Particle dust motes ===
    CTX.globalAlpha = 1;
    const particleCount = isLandscape ? 18 : 12;
    for (let i = 0; i < particleCount; i++) {
        const px = (w * ((i * 0.73 + time * 0.00004 * (i + 1)) % 1));
        const py = (h * ((i * 0.41 + Math.sin(time * 0.006 + i) * 0.12) % 1));
        const pSize = 1.2 + Math.sin(time * 0.008 + i * 2) * 0.6;
        const pAlpha = 0.18 + Math.sin(time * 0.01 + i * 1.3) * 0.12;
        
        CTX.beginPath();
        CTX.arc(px, py, pSize, 0, Math.PI * 2);
        CTX.fillStyle = `rgba(170, 185, 205, ${pAlpha})`;
        CTX.fill();
    }
    
    // === LAYER 8: Central visibility zone ===
    const centerX = w / 2;
    const centerY = h / 2;
    const clearRadius = baseSize * 0.32;
    
    const clearGrad = CTX.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, clearRadius
    );
    clearGrad.addColorStop(0, 'rgba(255, 255, 248, 0.04)');
    clearGrad.addColorStop(0.4, 'rgba(255, 255, 248, 0.02)');
    clearGrad.addColorStop(0.7, 'rgba(255, 255, 248, 0.008)');
    clearGrad.addColorStop(1, 'rgba(255, 255, 248, 0)');
    
    CTX.fillStyle = clearGrad;
    CTX.fillRect(0, 0, w, h);
    
    CTX.restore();
}

// Resize handler
window.addEventListener('resize', () => {
    if (demoActive) {
        CANVAS.width = window.innerWidth;
        CANVAS.height = window.innerHeight;
    }
});
