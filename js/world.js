// --- SETUP ---
// Canvas is responsive so recalculating dimensions here keeps the arena view
// matched to the browser window.
function resize() {
    CANVAS.width = window.innerWidth;
    CANVAS.height = window.innerHeight;
    
    // Reset joystick state on resize/orientation change to prevent input bugs
    if (typeof resetVirtualJoysticks === 'function') {
        resetVirtualJoysticks();
    }
}

window.addEventListener('resize', resize);

// Handle orientation change specifically for mobile devices
window.addEventListener('orientationchange', () => {
    // Small delay to allow browser to complete orientation change
    setTimeout(() => {
        resize();
        // Force joystick recalculation after orientation stabilizes
        if (typeof resetVirtualJoysticks === 'function') {
            resetVirtualJoysticks();
        }
    }, 100);
});

// --- INIT WORLD ---
// Procedurally place walls and crates to form light cover so each run feels
// slightly different while still respecting a protected spawn zone.

// Base HP values for walls and crates
const BASE_WALL_HP = 1200;
const BASE_CRATE_HP = 400;

// Scale wall and crate HP based on current wave
// Higher waves = sturdier walls (helps create longer cover for harder fights)
function scaleWorldHP(wave) {
    if (!wave || wave < 1) wave = 1;
    
    // HP multiplier: 1.0 at wave 1, increases by 15% per wave
    // Wave 1: 100%, Wave 5: 160%, Wave 10: 235%, Wave 15: 310%
    const hpMultiplier = 1 + (wave - 1) * 0.15;
    
    // Scale destructible walls
    for (const wall of walls) {
        if (wall.destructible) {
            wall.maxHp = Math.round(BASE_WALL_HP * hpMultiplier);
            // Only restore HP if wall still exists (hp > 0)
            if (wall.hp > 0) {
                wall.hp = wall.maxHp;
            }
        }
    }
    
    // Scale crates
    for (const crate of crates) {
        crate.maxHp = Math.round(BASE_CRATE_HP * hpMultiplier);
        // Only restore HP if crate still exists (hp > 0)
        if (crate.hp > 0) {
            crate.hp = crate.maxHp;
        }
    }
}
function initWorld() {
    walls.length = 0;
    crates.length = 0;
    // Borders double as kill planes so players never escape the arena bounds.
    walls.push({ x: -50, y: -50, w: WORLD_W + 100, h: 50, maxHp: 999999, hp: 999999 });
    walls.push({ x: -50, y: WORLD_H, w: WORLD_W + 100, h: 50, maxHp: 999999, hp: 999999 });
    walls.push({ x: -50, y: 0, w: 50, h: WORLD_H, maxHp: 999999, hp: 999999 });
    walls.push({ x: WORLD_W, y: 0, w: 50, h: WORLD_H, maxHp: 999999, hp: 999999 });

    const baseArea = 4000 * 4000;
    const areaRatio = Math.max(1, (WORLD_W * WORLD_H) / baseArea);
    const targetProps = Math.min(600, Math.floor(250 * areaRatio)); // More obstacles for 10000x10000
    let count = 0;
    while (count < targetProps) {
        // 12% crates (up from 8%), rest are dramatic walls
        let isCrate = Math.random() < 0.12;
        let w;
        let h;

        if (isCrate) {
            w = 60 + Math.random() * 20; // Larger crates
            h = 60 + Math.random() * 20;
        } else {
            // More dramatic wall sizes - larger and more varied
            const wallType = Math.random();
            if (wallType < 0.3) {
                // Large fortress walls
                w = 300 + Math.random() * 400;
                h = 40 + Math.random() * 60;
            } else if (wallType < 0.6) {
                // Medium tactical walls
                w = 150 + Math.random() * 200;
                h = 150 + Math.random() * 200;
            } else {
                // Tall barriers
                w = 40 + Math.random() * 60;
                h = 200 + Math.random() * 300;
            }
        }

        let x = Math.random() * (WORLD_W - w - 200) + 100;
        let y = Math.random() * (WORLD_H - h - 200) + 100;

        let overlap = false;
        for (let obj of walls) {
            if (x < obj.x + obj.w + 50 && x + w + 50 > obj.x && y < obj.y + obj.h + 50 && y + h + 50 > obj.y) overlap = true;
        }
        for (let c of crates) {
            if (x < c.x + c.w + 50 && x + w + 50 > c.x && y < c.y + c.h + 50 && y + h + 50 > c.y) overlap = true;
        }

        // Keep the center open so the player has breathing room off spawn.
        if (Math.hypot(x - WORLD_W / 2, y - WORLD_H / 2) < 250) overlap = true; // Larger spawn area for bigger map

        if (!overlap) {
            if (isCrate) crates.push({ x: x, y: y, w: w, h: h, hp: 400, maxHp: 400, seed: Math.random() });
            else walls.push({ x, y, w, h, destructible: true, hp: 1200, maxHp: 1200, seed: Math.random() });
            count++;
        }
    }
}

// Helper function to find safe spawn spot anywhere on map
function findSafeSpot(radius, avoidPlayer = false) {
    let attempts = 0;
    let x;
    let y;
    let safe = false;
    while (!safe && attempts < 200) {
        // Sample positions away from the edges so props have buffer space.
        x = Math.random() * (WORLD_W - 200) + 100;
        y = Math.random() * (WORLD_H - 200) + 100;

        let collision = false;
        for (let w of walls) {
            if (x > w.x - radius && x < w.x + w.w + radius && y > w.y - radius && y < w.y + w.h + radius) {
                collision = true;
                break;
            }
        }
        if (!collision) {
            for (let c of crates) {
                if (x > c.x - radius && x < c.x + c.w + radius && y > c.y - radius && y < c.y + c.h + radius) {
                    collision = true;
                    break;
                }
            }
        }

        if (avoidPlayer && !collision) {
            if (Math.hypot(x - player.x, y - player.y) < 1200) collision = true;
            if (!collision) {
                for (let e of enemies) {
                    if (Math.hypot(x - e.x, y - e.y) < 100) {
                        collision = true;
                        break;
                    }
                }
            }
        }

        if (!collision) safe = true;
        attempts++;
    }
    if (!safe) {
        x = WORLD_W / 2;
        y = WORLD_H / 2;
    }
    return { x, y };
}

function findPlayerRingSpawn(radius) {
    if (!player || typeof player.x !== 'number') return null;
    const innerRadius = 500;
    const outerRadius = 1500;
    const attempts = 80;
    const margin = radius + 80;
    for (let i = 0; i < attempts; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = innerRadius + Math.random() * (outerRadius - innerRadius);
        let x = player.x + Math.cos(ang) * dist;
        let y = player.y + Math.sin(ang) * dist;
        
        // Clamp to map bounds
        x = Math.min(Math.max(x, margin), WORLD_W - margin);
        y = Math.min(Math.max(y, margin), WORLD_H - margin);
        
        // Critical: Recheck actual distance after clamping
        // When player is near corner, clamped position might be too close
        const actualDist = Math.hypot(x - player.x, y - player.y);
        if (actualDist < innerRadius) continue;

        if (!canOccupy(x, y, radius)) continue;

        let overlap = false;
        for (let enemy of enemies) {
            if (Math.hypot(x - enemy.x, y - enemy.y) < enemy.radius + radius + 30) {
                overlap = true;
                break;
            }
        }
        if (!overlap) return { x, y };
    }
    return null;
}

// Player spawn resets combat stats and camera, guaranteeing a breathable area
// by reusing the safe spot helper.
function spawnPlayer() {
    let pos = findSafeSpot(30, false);
    player.x = pos.x;
    player.y = pos.y;
    player.hp = 200;
    player.maxHp = 200;
    player.armor = 0;
    player.revives = 1;
    player.energy = 100;
    player.maxEnergy = 100;
    player.overheated = false;
    player.turboActive = false;
    player.turboTime = 0;
    player.turboCharges = 0;
    player.turboCooldown = 0;
    player.turboDuration = player.turboDuration || 420;
    player.turboSpeed = 7.5;
    player.turboExhaustClock = 0;
    player.killStreak = 0;
    player.ultReady = false;
    player.isUlting = false;
    player.shieldTime = 0;
    
    // Reset firing state - CRITICAL for bug where player can't shoot after restart
    player.fireDelay = 0;
    player.lastShotTime = 0;
    player.consecutiveShots = 0;
    
    // Reset stun/status effects
    player.stunned = false;
    player.stunnedTime = 0;
    player.frozen = false;
    player.frozenTime = 0;
    player.burning = false;
    player.burningTime = 0;
    player.cursedBurned = false;
    player.slowed = false;
    player.slowedTime = 0;
    
    // Reset temperature to normal (20°C base, only freeze effect drops to 0°C)
    player.temperature = 20;
    player.baseTemperature = 20;
    player.thermalLocked = false;
    
    // Reset knockback state
    player.knockbackActive = false;
    player.knockbackTime = 0;
    
    // CRITICAL: Reset visual/render state to prevent ghost tank bug
    // These flags control whether tank is drawn - must be reset on spawn
    player.angle = 0;           // Reset body angle to prevent NaN
    player.turretAngle = 0;     // Reset turret angle to prevent NaN
    player.isDying = false;     // Clear death animation flag
    player.victoryTeleporting = false; // Clear victory teleport flag
    player.victoryTeleportPhase = 0;   // Reset teleport phase
    player.victoryTeleportComplete = false; // Reset teleport completion flag
    player.victoryTeleportFlashDone = false; // Reset flash flag
    player.victoryDelayFrames = 0; // Reset delay frames
    player.recoil = 0;          // Reset recoil
    player.turretRecoilOffsetX = 0; // Reset turret visual offset
    player.turretRecoilOffsetY = 0;
    player.turretRecoilDecay = 0.70;
    player.wheelRotation = 0;   // Reset wheel animation
    
    // CRITICAL: Reset all claimed item effects on restart
    // This ensures a fresh start without any carried-over powerups
    player.autoAim = false;
    player.autoAimShots = 0;
    player.autoAimMaxShots = 100;
    player.magnetActive = false;
    player.magnetTime = 0;
    player.invisible = false;
    player.invisibleTime = 0;
    player.lifesteal = 0;
    player.lifestealLevel = 0;
    player.baseDamageMultiplier = 1.0;
    player.damageMultiplier = 1.0;
    player.damageBoostTime = 0;
    player.criticalChance = 0;
    player.coolingEfficiency = 1.0;
    player.heatResistance = 1.0;
    player.heatEffectLevel = 0;
    player.shieldActive = false;
    player.shieldHp = 0;
    player.shieldTime = 0;
    
    // Reset display values for smooth bar interpolation
    player.displayHp = player.hp;
    player.displayEnergy = player.energy;
    player.displayKillStreak = 0;
    
    // Determine starting weapon based on debug settings
    // Debug settings should ALWAYS be applied regardless of how game was started
    // This allows developers to test specific scenarios with any start method
    let startWeapon = 'cannon';
    const debugWeapon = resolveDebugWeapon();
    if (debugWeapon) {
        startWeapon = debugWeapon;
    }
    player.weapon = startWeapon;
    player.vx = 0;
    player.vy = 0;
    player.seed = Math.random(); // Unique seed for consistent crack rendering
    player.lastTrackAngle = player.angle;
    
    // Initialize wave system properties
    // Debug settings should ALWAYS be applied regardless of how game was started
    let startWave = 1;
    const debugWave = resolveDebugWave();
    if (debugWave) {
        startWave = debugWave;
    }
    
    // Reset the forceNewMission flag (used to clear saved game on new mission click)
    if (typeof forceNewMission !== 'undefined' && forceNewMission === true) {
        forceNewMission = false;
        console.log('New mission started (saved game cleared)');
    }
    
    // Log debug settings if active
    if (startWave > 1 || startWeapon !== 'cannon') {
        console.log(`Debug settings active: wave ${startWave}, weapon ${startWeapon}`);
    }
    
    player.currentWave = startWave;
    currentWave = startWave; // Ensure global currentWave is set correctly
    if (typeof window !== 'undefined') window.currentWave = startWave; // Also set on window for UI access
    player.enemiesPerWave = getBaseEnemiesPerWave(player.currentWave);
    console.log('Wave initialized to:', player.currentWave);
    player.totalEnemiesInWave = 0;
    player.totalKills = (player.currentWave - 1) * player.enemiesPerWave;
    player.kills = 0;
    player.bestKillStreak = 0;
    player.consecutiveWaves = 0;
    player.tookDamageThisWave = false;
    player.perfectWaveCount = 0;
    player.spawnWarmup = SPAWN_WARMUP_FRAMES;
    player.spawnWarmupMax = SPAWN_WARMUP_FRAMES;
    
    resize();
    camX = player.x - CANVAS.width / 2;
    camY = player.y - CANVAS.height / 2;
}

// Calculate wave-based stat multipliers for enemy scaling
function getWaveMultipliers(waveNumber) {
    const wave = Math.max(1, waveNumber);
    // Progressive scaling: each wave increases stats
    const hpMult = 1 + (wave - 1) * 0.12; // +12% HP per wave
    const damageMult = 1 + (wave - 1) * 0.08; // +8% damage per wave
    const speedMult = 1 + (wave - 1) * 0.04; // +4% speed per wave
    const accuracyBonus = Math.min(0.15, (wave - 1) * 0.015); // Up to +15% accuracy
    return { hpMult, damageMult, speedMult, accuracyBonus };
}

// Enemy spawns scale tier selection with score so difficulty ramps over time.
function spawnEnemy(options = {}) {
    const { tierId = null, position = null, escort = false } = options || {};
    let tierIdx;
    if (typeof tierId === 'number' && !Number.isNaN(tierId)) {
        tierIdx = Math.max(0, Math.min(ENEMY_TIERS.length - 1, Math.round(tierId)));
    } else {
        // Wave-based tier selection instead of score-based
        const wave = player.currentWave || 1;
        tierIdx = 0;
        if (wave >= 3) tierIdx = Math.floor(Math.random() * 2);
        if (wave >= 5) tierIdx = Math.floor(Math.random() * 3);
        if (wave >= 7) tierIdx = Math.floor(Math.random() * 4);
        if (wave >= 9) tierIdx = Math.floor(Math.random() * 5);
        if (wave >= 10) tierIdx = Math.floor(Math.random() * 6);
        if (wave >= 11) tierIdx = Math.floor(Math.random() * Math.min(8, ENEMY_TIERS.length));
        // Wave 12 (FINAL_WAVE): ONLY spawn highest tier enemies
        if (wave >= 12) tierIdx = ENEMY_TIERS.length - 1;
    }

    const tier = ENEMY_TIERS[tierIdx] || ENEMY_TIERS[0];
    let pos = position;
    if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
        pos = findPlayerRingSpawn(30) || findSafeSpot(30, true);
    }
    const guardPoint = getNearestCrateCenter(pos.x, pos.y);
    const enemyAccent = deriveTurretColor(tier.weapon, tier.accent);
    
    // Apply wave multipliers for progressive difficulty
    const wave = player.currentWave || 1;
    const multipliers = getWaveMultipliers(wave);
    const scaledHP = Math.round(tier.hp * multipliers.hpMult);
    const scaledSpeed = tier.speed * multipliers.speedMult;
    const scaledErr = Math.max(0.005, tier.err * (1 - multipliers.accuracyBonus * 2));

    const enemy = {
        x: pos.x,
        y: pos.y,
        hp: scaledHP,
        maxHp: scaledHP,
        radius: 25,
        speed: scaledSpeed,
        baseSpeed: tier.speed,
        angle: 0,
        turretAngle: 0,
        cooldown: 100,
        maxCooldown: Math.max(30, tier.cd - wave * 2), // Slightly faster fire rate per wave
        err: scaledErr,
        color: tier.color,
        accent: enemyAccent,
        hitFlash: 0,
        weapon: tier.weapon,
        id: tier.id,
        tierId: tierIdx,
        waveSpawned: wave,
        damageMult: multipliers.damageMult, // Store for damage calculation
        stuckTimer: 0,
        home: { x: pos.x, y: pos.y },
        guardPoint,
        patrolPoint: createPatrolWaypoint(guardPoint),
        patrolCooldown: 0,
        seed: Math.random(),
        lastTrackAngle: 0,
        spawnWarmup: SPAWN_WARMUP_FRAMES,
        spawnWarmupMax: SPAWN_WARMUP_FRAMES,
        queueHangTime: 0,
        isFinalEscort: !!escort,
        wheelRotation: 0,
        turretRecoilOffsetX: 0,
        turretRecoilOffsetY: 0,
        turretRecoilDecay: 0.70,
        recoilRecoveryTime: 0 // Turret tracking lock after firing
    };

    enemies.push(enemy);
    return enemy;
}

// Guard logic needs anchor points, so we pick the closest crate center to make
// enemies defend actual objectives instead of random coordinates.
function getNearestCrateCenter(x, y) {
    if (!crates.length) return { x, y };
    let best = null;
    let bestDist = Infinity;
    for (let crate of crates) {
        const cx = crate.x + crate.w / 2;
        const cy = crate.y + crate.h / 2;
        const dist = Math.hypot(cx - x, cy - y);
        if (dist < bestDist) {
            bestDist = dist;
            best = { x: cx, y: cy };
        }
    }
    return best || { x, y };
}

// Patrol waypoints are jittered so squads circle crates instead of remaining
// stationary, which keeps the battlefield lively.
function createPatrolWaypoint(center, radius = 160) {
    const angle = Math.random() * Math.PI * 2;
    const dist = radius * (0.4 + Math.random() * 0.6);
    return {
        x: Math.min(Math.max(center.x + Math.cos(angle) * dist, 60), WORLD_W - 60),
        y: Math.min(Math.max(center.y + Math.sin(angle) * dist, 60), WORLD_H - 60)
    };
}

function deriveTurretColor(weaponId, fallback) {
    const base = (weaponId && WEAPONS[weaponId]?.color) || fallback || '#475569';
    return shiftHexBrightness(base, 20);
}

function shiftHexBrightness(hex, delta) {
    if (typeof hex !== 'string') return '#475569';
    const normalized = hex.replace('#', '');
    if (normalized.length !== 6) return `#${normalized}`;
    const r = clampHex(parseInt(normalized.slice(0, 2), 16) + delta);
    const g = clampHex(parseInt(normalized.slice(2, 4), 16) + delta);
    const b = clampHex(parseInt(normalized.slice(4, 6), 16) + delta);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clampHex(value) {
    return Math.max(0, Math.min(255, value));
}

function toHex(value) {
    const hex = value.toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
}

// =============================================================================
// COLLISION HELPERS (Must be in world.js to be available for systems.js)
// =============================================================================

// Collision helpers treat walls as axis-aligned boxes to keep tests cheap.
// These functions are used by multiple modules (systems.js, gameplay.js)
function checkWall(x, y, r) {
    for (let w of walls) {
        if (x > w.x - r && x < w.x + w.w + r && y > w.y - r && y < w.y + w.h + r) return true;
    }
    return false;
}

function checkCrate(x, y, r) {
    for (let c of crates) {
        if (x > c.x - r && x < c.x + c.w + r && y > c.y - r && y < c.y + c.h + r) return true;
    }
    return false;
}
