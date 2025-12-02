const SAVE_KEY = 'tankDestroyerSave';

function saveGame() {
    if (state !== 'GAME') return;
    if (player.hp <= 0) return;

    // Get current music time for seamless resume
    let musicTime = 0;
    if (typeof MusicManager !== 'undefined' && MusicManager.getCurrentTrackName() === 'game') {
        musicTime = MusicManager.getCurrentTime();
    }

    const saveData = {
        timestamp: Date.now(),
        score,
        gameTime,
        musicTime,  // Save music position for seamless continue
        camX,
        camY,
        waveTransition: typeof waveTransition !== 'undefined' ? !!waveTransition : false,
        waveTransitionTimer: typeof waveTransitionTimer !== 'undefined' ? waveTransitionTimer : 0,
        bossActive,
        bossSpawned,
        boss: (typeof boss !== 'undefined' && boss) ? serializeBoss(boss) : null,
        player: serializePlayer(),
        enemies: enemies.map(serializeEnemy).filter(Boolean),
        bullets: serializeBullets(bullets),
        walls: serializeStructures(walls),
        crates: serializeStructures(crates),
        pickups: serializePickups(pickups)
    };

    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
        console.log('Game saved successfully');
    } catch (e) {
        console.error('Failed to save game:', e);
    }
}

function loadGame() {
    const saveString = localStorage.getItem(SAVE_KEY);
    if (!saveString) {
        console.log('No save game found');
        return false;
    }

    try {
        const saveData = JSON.parse(saveString);
		
        // Basic validation
        if (!saveData.player || !saveData.timestamp) {
            console.log('Invalid save data');
            return false;
        }

        console.log('Loading game from save...');

        missionFailPending = false;
        missionFailDelay = 0;
        missionFailCallback = null;
        deathSequence.active = false;
        deathSequence.timer = 0;
        deathSequence.missionTriggered = false;
        deathSequence.stamp = 0;
        
        // CRITICAL: Stop demo FIRST before restoring anything
        // stopDemo() clears walls/crates/enemies arrays, so must be called BEFORE restore
        if (typeof stopDemo === 'function') {
            stopDemo();
            console.log('[loadGame] Demo stopped before restore');
        }

        // Restore State
        state = 'GAME';
        paused = false;
		
        // Restore Player
        Object.assign(player, deserializePlayer(saveData.player));
		
        // Restore Globals
        score = saveData.score || 0;
        gameTime = saveData.gameTime || 0;
        camX = typeof saveData.camX === 'number' ? saveData.camX : camX;
        camY = typeof saveData.camY === 'number' ? saveData.camY : camY;
        bossActive = !!saveData.bossActive;
        bossSpawned = !!saveData.bossSpawned;
        boss = saveData.boss ? deserializeBoss(saveData.boss) : null;
        if (typeof waveTransition !== 'undefined') waveTransition = !!saveData.waveTransition;
        if (typeof waveTransitionTimer !== 'undefined') waveTransitionTimer = saveData.waveTransitionTimer || 0;

        // CRITICAL FIX: Restore world structures PROPERLY
        // Must clear arrays first, then push restored items to avoid reference issues
        // Do NOT call initWorld() as it would overwrite our restored data
        
        // Restore walls - clear then populate
        walls.length = 0;
        const restoredWalls = deserializeStructures(saveData.walls, 'wall');
        for (const wall of restoredWalls) {
            walls.push(wall);
        }
        console.log(`[loadGame] Restored ${walls.length} walls`);
        
        // Restore crates - clear then populate  
        crates.length = 0;
        const restoredCrates = deserializeStructures(saveData.crates, 'crate');
        for (const crate of restoredCrates) {
            crates.push(crate);
        }
        console.log(`[loadGame] Restored ${crates.length} crates`);
        
        // Only generate new world if save had NO structures at all (corrupted save)
        if (walls.length === 0 && crates.length === 0) {
            console.log('[loadGame] No structures found in save, generating new world');
            if (typeof initWorld === 'function') {
                initWorld();
            }
        }
        
        // CRITICAL: Rebuild spatial grid after walls/crates are restored
        // Without this, collision detection won't work properly
        if (typeof markSpatialGridDirty === 'function') {
            markSpatialGridDirty();
            console.log('[loadGame] Spatial grid marked dirty after restoring structures');
        }

        // Clear transient entities for clean resume
        bullets.length = 0;
        const restoredBullets = deserializeBullets(saveData.bullets);
        for (const bullet of restoredBullets) {
            bullets.push(bullet);
        }
        particles.length = 0;
        
        // Restore pickups (item drops) - so they persist on save/load
        pickups.length = 0;
        if (Array.isArray(saveData.pickups)) {
            const restoredPickups = deserializePickups(saveData.pickups);
            for (const pickup of restoredPickups) {
                pickups.push(pickup);
            }
            console.log(`[loadGame] Restored ${pickups.length} pickups`);
        }
        
        playerTracks.length = 0;
        enemyTracks.length = 0;

        // Restore Enemies - clear then populate
        enemies.length = 0;
        if (Array.isArray(saveData.enemies)) {
            saveData.enemies.forEach(eData => {
                const restored = createEnemyFromSave(eData);
                if (restored) enemies.push(restored);
            });
        }
        console.log(`[loadGame] Restored ${enemies.length} enemies`);
        
        // FIX: Proper wave state restoration after load
        // 
        // Wave completion condition: enemies.length === 0 && totalEnemiesInWave >= enemiesPerWave
        // 
        // If we set totalEnemiesInWave = enemiesPerWave when there ARE enemies, it prevents extra spawns
        // BUT if enemies.length === 0 after restore, the wave will instantly complete!
        //
        // Solution: 
        // - If there ARE enemies: set totalEnemiesInWave = enemiesPerWave (prevents new spawns)
        // - If NO enemies: set totalEnemiesInWave = 0 so new enemies will spawn to replace them
        //
        // This ensures:
        // 1. With enemies: player kills remaining, then wave completes normally
        // 2. Without enemies: game spawns fresh enemies for the current wave
        
        if (enemies.length > 0) {
            // There are alive enemies - prevent additional spawning
            // Player must kill these to complete the wave
            player.totalEnemiesInWave = player.enemiesPerWave;
            console.log(`[loadGame] Restored ${enemies.length} enemies, totalEnemiesInWave set to ${player.enemiesPerWave}`);
        } else {
            // No enemies restored - reset to allow spawning
            // This happens when save file has empty enemies array (rare but possible)
            player.totalEnemiesInWave = 0;
            console.log(`[loadGame] No enemies restored, totalEnemiesInWave reset to 0 for fresh spawns`);
        }

        // Clear save after successful load to prevent loop
        localStorage.removeItem(SAVE_KEY);
        
        // CRITICAL: Reset graphics to full quality on load
        // Without this, game starts at degraded quality from previous session
        if (typeof resetSmartPerformance === 'function') {
            resetSmartPerformance();
            console.log('[loadGame] Smart performance reset to full quality');
        }
		
        // UI Updates
        document.getElementById('overlay').classList.add('hidden');
        document.getElementById('pause-screen').classList.add('hidden');
        document.getElementById('gameover-screen').classList.add('hidden');
        document.getElementById('gameover-screen').classList.remove('mission-failed-enter');
        document.getElementById('gameCanvas').classList.add('active');
        document.getElementById('ui-layer').classList.add('active');
        resize();
        resetVirtualJoysticks();
        
        // Reset input states to prevent stuck controls
        if (typeof resetMouseAimState === 'function') resetMouseAimState();
        if (typeof resetAllInputStates === 'function') resetAllInputStates();

        // Update continue button state since save is now consumed
        if (typeof updateContinueButtonState === 'function') {
            updateContinueButtonState();
        }
        
        // CRITICAL: Start game music from saved position
        // Must be done after UI updates to ensure user interaction is registered
        if (typeof MusicManager !== 'undefined') {
            const savedMusicTime = saveData.musicTime || 0;
            MusicManager.playAtTime('game', savedMusicTime);
            console.log('[loadGame] Starting game music at time:', savedMusicTime);
        }

        // Start Loop immediately
        lastTime = performance.now();
        loop(lastTime);
        updateUI();
        draw();
		
        console.log('Game loaded successfully');
        return true;
    } catch (e) {
        console.error('Failed to load save:', e);
        localStorage.removeItem(SAVE_KEY); // Clear corrupted save
        return false;
    }
}

function hasSaveGame() {
    return !!localStorage.getItem(SAVE_KEY);
}

// Flag to indicate next game should start fresh (ignore debug wave)
let forceNewMission = false;

// Clear saved game data - thoroughly reset all save state
function clearSaveGame() {
    // Remove from localStorage
    localStorage.removeItem(SAVE_KEY);
    
    // Double-check it's actually gone
    if (localStorage.getItem(SAVE_KEY)) {
        console.warn('Save data still exists after clear, attempting force clear');
        try {
            localStorage.clear();
            localStorage.setItem('tankDestroyerCleared', 'true');
            localStorage.removeItem('tankDestroyerCleared');
        } catch (e) {
            console.error('Failed to force clear localStorage:', e);
        }
    }
    
    // Reset any global wave state that might persist
    if (typeof currentWave !== 'undefined') currentWave = 1;
    
    // Set flag to force new mission (ignore debug settings for this spawn)
    forceNewMission = true;
    
    // Update UI to hide resume button
    const resumeBtn = document.getElementById('resume-game-btn');
    if (resumeBtn) resumeBtn.classList.add('inactive');
    
    console.log('Save game cleared, ready for new mission');
}

// Helper to serialize player state
function serializePlayer() {
    return JSON.parse(JSON.stringify(player));
}

function deserializePlayer(data) {
    if (!data) return player;
    const clone = { ...data };
    clone.x = typeof clone.x === 'number' ? clone.x : player.x;
    clone.y = typeof clone.y === 'number' ? clone.y : player.y;
    clone.hp = Math.max(0, clone.hp || player.hp);
    clone.maxHp = clone.maxHp || player.maxHp;
    clone.energy = Math.max(0, clone.energy || player.energy);
    clone.maxEnergy = clone.maxEnergy || player.maxEnergy;
    clone.currentWave = clone.currentWave || player.currentWave || 1;
    clone.enemiesPerWave = clone.enemiesPerWave || player.enemiesPerWave || 15;
    clone.totalEnemiesInWave = clone.totalEnemiesInWave || player.totalEnemiesInWave || 0;
    clone.weapon = clone.weapon || player.weapon || 'cannon';
    clone.kills = clone.kills || 0;
    clone.bestKillStreak = clone.bestKillStreak || 0;
    clone.consecutiveWaves = clone.consecutiveWaves || 0;
    clone.tookDamageThisWave = !!clone.tookDamageThisWave;
    clone.perfectWaveCount = typeof clone.perfectWaveCount === 'number' ? clone.perfectWaveCount : 0;
    clone.turboCharges = typeof clone.turboCharges === 'number' ? clone.turboCharges : 0;
    clone.turboChargeCap = clone.turboChargeCap || player.turboChargeCap || 2;
    clone.turboCooldown = typeof clone.turboCooldown === 'number' ? clone.turboCooldown : 0;
    clone.turboCooldownMax = clone.turboCooldownMax || player.turboCooldownMax || 240;
    clone.turboDuration = clone.turboDuration || player.turboDuration || 420;
    clone.lastTrackAngle = typeof clone.lastTrackAngle === 'number' ? clone.lastTrackAngle : clone.angle;
    
    // Restore passive item stats (lifesteal, dmgmult, critical, cooling)
    clone.lifestealLevel = typeof clone.lifestealLevel === 'number' ? clone.lifestealLevel : 0;
    clone.lifesteal = clone.lifestealLevel * 0.05; // Recalculate lifesteal from level
    clone.baseDamageMultiplier = typeof clone.baseDamageMultiplier === 'number' ? clone.baseDamageMultiplier : 1.0;
    clone.criticalChance = typeof clone.criticalChance === 'number' ? clone.criticalChance : 0;
    clone.criticalDamage = clone.criticalDamage || 2.5;
    clone.coolingEfficiency = typeof clone.coolingEfficiency === 'number' ? clone.coolingEfficiency : 1.0;
    
    return clone;
}

function serializeEnemy(enemy) {
    if (!enemy) return null;
    return {
        x: enemy.x,
        y: enemy.y,
        vx: enemy.vx || 0,
        vy: enemy.vy || 0,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        radius: enemy.radius,
        speed: enemy.speed,
        angle: enemy.angle,
        turretAngle: enemy.turretAngle,
        cooldown: enemy.cooldown,
        maxCooldown: enemy.maxCooldown,
        err: enemy.err,
        color: enemy.color,
        accent: enemy.accent,
        hitFlash: enemy.hitFlash || 0,
        weapon: enemy.weapon,
        id: enemy.id,
        stuckTimer: enemy.stuckTimer || 0,
        home: enemy.home || { x: enemy.x, y: enemy.y },
        guardPoint: enemy.guardPoint || { x: enemy.x, y: enemy.y },
        patrolPoint: enemy.patrolPoint || { x: enemy.x, y: enemy.y },
        patrolCooldown: enemy.patrolCooldown || 0,
        seed: enemy.seed || Math.random(),
        burningTime: safeNumber(enemy.burningTime, 0),
        frozenTime: safeNumber(enemy.frozenTime, 0),
        stunnedTime: safeNumber(enemy.stunnedTime, 0),
        slowedTime: safeNumber(enemy.slowedTime, 0),
        recoil: safeNumber(enemy.recoil, 0),
        queueAngle: typeof enemy.queueAngle === 'number' ? enemy.queueAngle : null,
        lastKnownPlayerX: typeof enemy.lastKnownPlayerX === 'number' ? enemy.lastKnownPlayerX : null,
        lastKnownPlayerY: typeof enemy.lastKnownPlayerY === 'number' ? enemy.lastKnownPlayerY : null,
        timeSinceLastSeen: safeNumber(enemy.timeSinceLastSeen, 0),
        guardOrbitAngle: typeof enemy.guardOrbitAngle === 'number' ? enemy.guardOrbitAngle : null,
        guardOrbitRadius: typeof enemy.guardOrbitRadius === 'number' ? enemy.guardOrbitRadius : null,
        turretError: safeNumber(enemy.turretError, 0),
        turretErrorTarget: safeNumber(enemy.turretErrorTarget, 0),
        turretErrorTimer: safeNumber(enemy.turretErrorTimer, 0),
        unstuck: enemy.unstuck ? { angle: safeNumber(enemy.unstuck.angle, 0), ttl: safeNumber(enemy.unstuck.ttl, 0) } : null,
        lastTrackAngle: typeof enemy.lastTrackAngle === 'number' ? enemy.lastTrackAngle : null
    };
}

function createEnemyFromSave(data) {
    if (!data) return null;
    const tierId = typeof data.id === 'number' ? data.id : 0;
    const tier = ENEMY_TIERS[tierId] || ENEMY_TIERS[0];
    return {
        x: data.x,
        y: data.y,
        vx: data.vx || 0,
        vy: data.vy || 0,
        hp: typeof data.hp === 'number' ? data.hp : tier.hp,
        maxHp: data.maxHp || tier.hp,
        radius: data.radius || 25,
        speed: data.speed || tier.speed,
        baseSpeed: data.baseSpeed || tier.speed,
        angle: data.angle || 0,
        turretAngle: data.turretAngle || 0,
        cooldown: typeof data.cooldown === 'number' ? data.cooldown : 100,
        maxCooldown: data.maxCooldown || tier.cd,
        err: typeof data.err === 'number' ? data.err : tier.err,
        color: data.color || tier.color,
        accent: data.accent || tier.accent,
        hitFlash: data.hitFlash || 0,
        weapon: data.weapon || tier.weapon,
        id: tierId,
        tierId: tierId,
        stuckTimer: data.stuckTimer || 0,
        home: data.home || { x: data.x, y: data.y },
        guardPoint: data.guardPoint || { x: data.x, y: data.y },
        patrolPoint: data.patrolPoint || { x: data.x, y: data.y },
        patrolCooldown: data.patrolCooldown || 0,
        seed: data.seed || Math.random(),
        burningTime: safeNumber(data.burningTime, 0),
        frozenTime: safeNumber(data.frozenTime, 0),
        stunnedTime: safeNumber(data.stunnedTime, 0),
        slowedTime: safeNumber(data.slowedTime, 0),
        recoil: safeNumber(data.recoil, 0),
        queueAngle: typeof data.queueAngle === 'number' ? data.queueAngle : Math.random() * Math.PI * 2,
        lastKnownPlayerX: typeof data.lastKnownPlayerX === 'number' ? data.lastKnownPlayerX : undefined,
        lastKnownPlayerY: typeof data.lastKnownPlayerY === 'number' ? data.lastKnownPlayerY : undefined,
        timeSinceLastSeen: safeNumber(data.timeSinceLastSeen, 0),
        guardOrbitAngle: typeof data.guardOrbitAngle === 'number' ? data.guardOrbitAngle : Math.random() * Math.PI * 2,
        guardOrbitRadius: typeof data.guardOrbitRadius === 'number' ? data.guardOrbitRadius : (120 + Math.random() * 80),
        turretError: safeNumber(data.turretError, 0),
        turretErrorTarget: safeNumber(data.turretErrorTarget, 0),
        turretErrorTimer: safeNumber(data.turretErrorTimer, 0),
        unstuck: data.unstuck ? { angle: safeNumber(data.unstuck.angle, 0), ttl: safeNumber(data.unstuck.ttl, 0) } : null,
        lastTrackAngle: typeof data.lastTrackAngle === 'number' ? data.lastTrackAngle : (data.angle || 0),
        
        // === CRITICAL: AI STATE FOR SHOOTING ===
        // Set to 'alerted' so enemies can shoot immediately on continue
        // Without this, enemies would be stuck in 'patrol' mode unable to fire
        aiState: 'alerted',
        alertedReason: 'continue_game',
        alertShootDelay: 0, // No delay - can shoot immediately
        alertIndicator: 0,
        
        // === WHEEL AND TURRET VISUALS ===
        wheelRotation: data.wheelRotation || 0,
        turretRecoilOffsetX: 0,
        turretRecoilOffsetY: 0,
        turretRecoilDecay: 0.70,
        recoilRecoveryTime: 0,
        
        // === SPAWN PROTECTION ===
        spawnWarmup: 0, // No spawn protection on load - ready to fight
        spawnWarmupMax: typeof SPAWN_WARMUP_FRAMES !== 'undefined' ? SPAWN_WARMUP_FRAMES : 120,
        spawnHoldoff: 0, // Can be targeted immediately
        
        // === PATROL STATE (for reference, even though alerted) ===
        patrolSpeedMult: 0.25,
        visionAlertRange: 400,
        visionAlertAngle: Math.PI / 4,
        lastKnownPlayerPos: typeof player !== 'undefined' && player ? { x: player.x, y: player.y } : null
    };
}

function serializeBoss(b) {
    if (!b) return null;
    return {
        ...b,
        turrets: Array.isArray(b.turrets) ? b.turrets.map(t => ({ ...t })) : []
    };
}

function deserializeBoss(data) {
    if (!data) return null;
    const clone = { ...data };
    clone.turrets = Array.isArray(data.turrets) ? data.turrets.map(t => ({ ...t })) : [];
    return clone;
}

function serializeStructures(list) {
    if (!Array.isArray(list)) return [];
    return list.map(item => ({
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        hp: item.hp,
        maxHp: item.maxHp,
        destructible: !!item.destructible,
        seed: item.seed || Math.random()
    }));
}

function deserializeStructures(data, type = 'wall') {
    if (!Array.isArray(data)) return [];
    return data.map(item => ({
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        hp: typeof item.hp === 'number' ? item.hp : (type === 'crate' ? 400 : 1200),
        maxHp: item.maxHp || (type === 'crate' ? 400 : 1200),
        destructible: type === 'wall' ? !!item.destructible : true,
        seed: item.seed || Math.random()
    }));
}

function safeNumber(value, fallback = 0) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function serializeBullets(list) {
    if (!Array.isArray(list)) return [];
    return list
        .filter(b => typeof b.x === 'number' && typeof b.y === 'number')
        .map(b => ({
            x: b.x,
            y: b.y,
            vx: safeNumber(b.vx, 0),
            vy: safeNumber(b.vy, 0),
            prevX: typeof b.prevX === 'number' ? b.prevX : b.x,
            prevY: typeof b.prevY === 'number' ? b.prevY : b.y,
            life: safeNumber(b.life, 0),
            color: b.color || '#ffffff',
            dmg: safeNumber(b.dmg, 0),
            isEnemy: !!b.isEnemy,
            type: b.type || null,
            pierce: typeof b.pierce === 'number' ? b.pierce : null,
            element: b.element || null
        }));
}

function deserializeBullets(data) {
    if (!Array.isArray(data)) return [];
    return data
        .map(b => ({
            x: safeNumber(b.x, 0),
            y: safeNumber(b.y, 0),
            vx: safeNumber(b.vx, 0),
            vy: safeNumber(b.vy, 0),
            prevX: typeof b.prevX === 'number' ? b.prevX : safeNumber(b.x, 0),
            prevY: typeof b.prevY === 'number' ? b.prevY : safeNumber(b.y, 0),
            life: safeNumber(b.life, 0),
            color: b.color || '#ffffff',
            dmg: safeNumber(b.dmg, 0),
            isEnemy: !!b.isEnemy,
            type: b.type || undefined,
            pierce: typeof b.pierce === 'number' ? b.pierce : undefined,
            element: b.element || undefined
        }))
        .filter(b => b.life > 0);
}

// Serialize pickups (item drops) for save
function serializePickups(pickupsArray) {
    if (!Array.isArray(pickupsArray)) return [];
    return pickupsArray.map(p => ({
        x: safeNumber(p.x, 0),
        y: safeNumber(p.y, 0),
        life: safeNumber(p.life, 1000),
        floatY: safeNumber(p.floatY, 0),
        type: p.type ? {
            id: p.type.id || '',
            t: p.type.t || '',
            short: p.type.short || '',
            c: p.type.c || '#888888',
            rarity: typeof p.type.rarity === 'number' ? p.type.rarity : 0
        } : null
    })).filter(p => p.type !== null);
}

// Deserialize pickups (item drops) from save
function deserializePickups(data) {
    if (!Array.isArray(data)) return [];
    return data
        .map(p => ({
            x: safeNumber(p.x, 0),
            y: safeNumber(p.y, 0),
            life: safeNumber(p.life, 1000),
            floatY: safeNumber(p.floatY, 0),
            type: p.type ? { ...p.type } : null
        }))
        .filter(p => p.type !== null && p.life > 0);
}

// Auto-save on visibility change (tab switch/close on mobile)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && state === 'GAME' && player.hp > 0) {
        console.log('Visibility change - auto-saving game...');
        saveGame();
    }
});

// Auto-save on unload (desktop close)
window.addEventListener('beforeunload', (e) => {
    if (state === 'GAME' && player.hp > 0) {
        console.log('Window unload - auto-saving game...');
        saveGame();
    }
});

// Auto-save on pagehide (more reliable for mobile and page reload)
window.addEventListener('pagehide', (e) => {
    if (state === 'GAME' && player.hp > 0) {
        console.log('Page hide - auto-saving game...');
        saveGame();
    }
});

// Periodic auto-save every 30 seconds during active gameplay
setInterval(() => {
    if (state === 'GAME' && player.hp > 0) {
        console.log('Periodic auto-save...');
        saveGame();
    }
}, 30000);
