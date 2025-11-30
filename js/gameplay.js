let achievementPulse = 0;

// Auto-aim accuracy bonus - 50% boost when firing with auto-aim
const AUTO_AIM_ACCURACY_BONUS = 0.5; // 50% reduction in spread/instability
let currentShotIsAutoAim = false; // Track if current shot is from auto-aim

// Smart auto-aim targeting system
// Priority: Boss > Higher tier enemies > Closest enemies
// AUTO_AIM_SPAWN_HOLDOFF: Grace period after spawn completes before auto-aim targets enemy
const AUTO_AIM_SPAWN_HOLDOFF = 90; // 1.5 seconds at 60fps - gives dramatic entrance time

function getAutoAimAngle() {
    let bestTarget = null;
    let bestPriority = -1;
    let bestDist = Infinity;
    
    // Track shielded enemies as fallback targets
    let fallbackTarget = null;
    let fallbackDist = Infinity;
    
    // Priority 1: Boss (highest priority)
    if (boss && checkLineOfSight(player.x, player.y, boss.x, boss.y)) {
        return Math.atan2(boss.y - player.y, boss.x - player.x);
    }
    
    // Priority 2-3: Enemies sorted by tier (higher tier = higher priority), then by distance
    for (let enemy of enemies) {
        // Skip enemies that are still spawning (have spawn warmup active)
        if (enemy.spawnWarmup && enemy.spawnWarmup > 0) continue;
        
        // FIXED: Skip enemies that recently finished spawning (holdoff period)
        // This gives them time to complete their dramatic entrance animation
        if (enemy.spawnHoldoff === undefined) enemy.spawnHoldoff = AUTO_AIM_SPAWN_HOLDOFF;
        if (enemy.spawnHoldoff > 0) continue;
        
        if (!checkLineOfSight(player.x, player.y, enemy.x, enemy.y)) continue;
        
        const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        const tier = enemy.tier || enemy.id || 0;
        
        // SMART: Track shielded enemies as fallback, but prefer unshielded
        if (enemy.magicShieldActive && enemy.magicShieldHP > 0) {
            // Save as fallback if closer than current fallback
            if (dist < fallbackDist) {
                fallbackTarget = enemy;
                fallbackDist = dist;
            }
            continue; // Skip for primary targeting
        }
        
        // Higher tier enemies have higher priority
        // Within same tier, prefer closer enemies
        if (tier > bestPriority || (tier === bestPriority && dist < bestDist)) {
            bestPriority = tier;
            bestDist = dist;
            bestTarget = enemy;
        }
    }
    
    // Return best unshielded target, or fallback to shielded if no other option
    if (bestTarget) {
        return Math.atan2(bestTarget.y - player.y, bestTarget.x - player.x);
    }
    
    // Fallback: target shielded enemy if no unshielded targets available
    if (fallbackTarget) {
        return Math.atan2(fallbackTarget.y - player.y, fallbackTarget.x - player.x);
    }
    
    return null;
}

// Check if auto-aim should fire (smart conditions)
function shouldAutoAimFire() {
    // Don't fire if overheated
    if (player.overheated) return false;
    
    // Don't fire if thermal locked
    if (player.thermalLocked) return false;
    
    // Don't fire if temperature is too high (above 80%)
    const tempPercent = ((player.temperature - player.baseTemperature) / 
                        (player.maxTemperature - player.baseTemperature)) * 100;
    if (tempPercent > 80) return false;
    
    // Don't fire if energy is too low (below 20%)
    const energyPercent = (player.energy / player.maxEnergy) * 100;
    if (energyPercent < 20) return false;
    
    // fireDelay is handled internally by fireWeapon(), don't check here
    // This allows auto-aim to attempt firing and let fireWeapon handle cooldown
    
    return true;
}

// Entry point used by buttons; reinitializes everything so repeated runs feel
// consistent regardless of prior state.
function startGame() {
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.remove('mission-failed-enter');
    missionFailPending = false;
    missionFailDelay = 0;
    missionFailCallback = null;
    
    // Stop demo battle background
    if (typeof stopDemo === 'function') stopDemo();
    
    // CRITICAL: Clear canvas before showing to prevent glitch artifacts
    const gameCanvas = document.getElementById('gameCanvas');
    CTX.clearRect(0, 0, CANVAS.width, CANVAS.height);
    
    // CRITICAL: Force canvas resize before showing game to prevent mobile glitch
    // This ensures canvas dimensions are correct before any rendering
    if (typeof resize === 'function') {
        // Reset last dimensions to force resize
        if (typeof lastWidth !== 'undefined') lastWidth = 0;
        if (typeof lastHeight !== 'undefined') lastHeight = 0;
        resize();
    }
    
    // CRITICAL: Reset frame timing state to ensure smooth start
    // This prevents skipped frames or timing issues on game start
    lastFrameTime = -1;
    frameTimeAccumulator = 0;
    
    // Clear canvas again after resize to ensure no artifacts
    CTX.clearRect(0, 0, CANVAS.width, CANVAS.height);
    
    // Add canvas fade-in effect with slight delay for clean transition
    requestAnimationFrame(() => {
        gameCanvas.classList.add('active');
    });
    
    // Show UI layer when game starts
    document.getElementById('ui-layer').classList.add('active');
    
    terrainNoiseOffsetX = Math.random() * 10000;
    terrainNoiseOffsetY = Math.random() * 10000;

    state = 'GAME';
    paused = false;
    initWorld();
    
    // Scale wall HP for wave 1 (or current wave if loading save)
    if (typeof scaleWorldHP === 'function') {
        scaleWorldHP(player.currentWave || 1);
    }
    
    spawnPlayer();
    resetDeathSequenceState();
    
    // DEBUG_START_ITEMS: Apply starting items to player
    if (DEBUG_START_ITEMS && DEBUG_START_ITEMS.length > 0) {
        for (const itemType of DEBUG_START_ITEMS) {
            applyRareDropReward(itemType);
        }
    }
    
    // DEBUG_UNLIMITED_TURBO: Give starting turbo charges for testing
    if (DEBUG_UNLIMITED_TURBO) {
        player.turboCharges = 3; // Start with max charges
    }
    
    // DEBUG_UNLIMITED_SHIELD: Activate shield immediately if enabled
    if (DEBUG_UNLIMITED_SHIELD) {
        player.shieldActive = true;
        player.shieldHp = 150;
        player.shieldTime = 9999;
    }
    
    score = 0;
    gameTime = 0;
    achievementPulse = 0;
    player.tookDamageThisWave = false;
    player.consecutiveWaves = 0;
    frame = 0;
    lastShot = 0; // CRITICAL: Reset fire rate cooldown to allow shooting after restart
    lastTime = performance.now();
    enemies = [];
    bullets = [];
    particles = [];
    pickups = [];
    playerClones = []; // Clear clones from CLONE ultimate
    boss = null;
    bossActive = false;
    bossSpawned = false;
    finalWaveTriggered = false;
    
    // CRITICAL: Reset wave transition state to prevent immediate wave skip
    waveTransition = false;
    waveTransitionTimer = 0;
    if (typeof window !== 'undefined') {
        window.pendingWaveRewards = null;
    }
    waveRewardSummary = null;
    currentWave = 1;
    enemiesKilledThisWave = 0;
    enemiesPerWave = getBaseEnemiesPerWave(1);
    
    // Reset berserker state
    player.berserkerActive = false;
    player.berserkerTime = 0;
    player.berserkerSpeedMult = 1;
    player.berserkerDamageMult = 1;
    player.berserkerFireRateMult = 1;
    player.shockwaveActive = false;
    player.ultType = 'BEAM'; // Reset to default ultimate
    
    // Set ultimate type based on starting wave (for DEBUG_START_WAVE)
    if (player.currentWave > 1) {
        updatePlayerUltimateType(player.currentWave);
    }

    const startingFinalWave = player.currentWave >= FINAL_WAVE;
    player.totalEnemiesInWave = 0;
    if (!startingFinalWave) {
        const initialSpawnCount = Math.min(player.enemiesPerWave || 15, 12);
        for (let i = 0; i < initialSpawnCount; i++) {
            spawnEnemy();
            player.totalEnemiesInWave++;
        }
    }

    if (startingFinalWave) {
        activateFinalWave(true);
    }

    if (animationId) cancelAnimationFrame(animationId);
    loop(performance.now());
}

// Resume game from save
function resumeGame() {
    if (loadGame()) {
        // Success
    } else {
        // Fallback if load fails
        startGame();
    }
}

// Pause toggles the loop while keeping timestamps in sync for smooth resume.
function togglePause() {
    paused = !paused;
    if (paused) {
        resetVirtualJoysticks();
        document.getElementById('pause-screen').classList.remove('hidden');
        if (typeof saveGame === 'function') saveGame();
    }
    else {
        document.getElementById('pause-screen').classList.add('hidden');
        lastTime = performance.now();
        loop(performance.now());
    }
}

// Return to menu overlay without refreshing the page; useful for touch UI.
function returnHome() {
    // Save game before returning home if player is alive (not for victory state)
    if (state === 'GAME' && player.hp > 0) {
        if (typeof saveGame === 'function') {
            saveGame();
        }
    }
    
    // Check if coming from victory screen for special exit animation
    const victoryScreen = document.getElementById('victory-screen');
    const isFromVictory = victoryScreen && !victoryScreen.classList.contains('hidden');
    
    missionFailPending = false;
    missionFailDelay = 0;
    missionFailCallback = null;
    state = 'MENU';
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.remove('mission-failed-enter');
    
    // Victory screen exit animation
    if (isFromVictory) {
        victoryScreen.classList.add('exit-to-home');
        // After animation completes, fully hide
        setTimeout(() => {
            victoryScreen.classList.add('hidden');
            victoryScreen.classList.remove('exit-to-home');
        }, 700);
    } else {
        victoryScreen.classList.add('hidden');
    }
    
    document.getElementById('overlay').classList.remove('hidden');
    resetDeathSequenceState();
    
    // Update score display with current high score and last score
    updateScoreDisplay();
    
    // Update continue button state
    if (typeof updateContinueButtonState === 'function') {
        updateContinueButtonState();
    }
    
    // Fade out game canvas
    const gameCanvas = document.getElementById('gameCanvas');
    gameCanvas.classList.remove('active');
    
    // Hide UI layer
    document.getElementById('ui-layer').classList.remove('active');
    
    // Restart demo battle background
    if (typeof stopDemo === 'function') stopDemo();
    if (typeof initDemo === 'function') {
        // New demo uses main CANVAS, no need for separate demoCanvas
        initDemo();
    }
}

// Calculate dynamic font size based on digit count for landscape mode
function getScoreFontSize(score) {
    const digitCount = score.toLocaleString().length;
    const isLandscape = window.matchMedia('(orientation: landscape)').matches;
    
    if (!isLandscape) {
        // Portrait mode uses CSS clamp values
        return null;
    }
    
    // Landscape: shrink font as digits increase
    // Base size 24px, reduce by 1.5px per digit after 4 digits
    const baseSize = 24;
    const minSize = 14;
    
    if (digitCount <= 4) return baseSize + 'px';
    if (digitCount <= 6) return Math.max(minSize, baseSize - (digitCount - 4) * 2) + 'px';
    if (digitCount <= 8) return Math.max(minSize, baseSize - 4 - (digitCount - 6) * 1.5) + 'px';
    return minSize + 'px';
}

// Update score display on homepage
function updateScoreDisplay() {
    const highScoresDiv = document.getElementById('high-scores-list');
    const highScore = parseInt(localStorage.getItem('tankHighestScore') || '0');
    const lastScore = parseInt(localStorage.getItem('tankLastScore') || '0');
    
    const highFontSize = getScoreFontSize(highScore);
    const lastFontSize = getScoreFontSize(lastScore);
    
    // Apply dynamic font size only in landscape via inline style
    const highStyle = highFontSize ? `style="font-size: ${highFontSize};"` : '';
    const lastStyle = lastFontSize ? `style="font-size: ${lastFontSize};"` : '';
    
    highScoresDiv.innerHTML = `
        <div class="score-card score-card-high">
            <span class="score-label">HIGH SCORE</span>
            <span class="score-number" ${highStyle}>${highScore.toLocaleString()}</span>
        </div>
        <div class="score-divider"></div>
        <div class="score-card score-card-last">
            <span class="score-label">LAST SCORE</span>
            <span class="score-number" ${lastStyle}>${lastScore.toLocaleString()}</span>
        </div>
    `;
}

// Update scores on orientation change
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        if (typeof updateScoreDisplay === 'function') updateScoreDisplay();
    }, 100);
});

window.addEventListener('resize', () => {
    if (typeof updateScoreDisplay === 'function') updateScoreDisplay();
});

function normalizeAngleDiff(current, previous) {
    let diff = current - previous;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
}

function updateTrackFade(list, dt) {
    for (let i = list.length - 1; i >= 0; i--) {
        const track = list[i];
        if (!track) continue;
        if (!track.maxLife || track.maxLife <= 0) track.maxLife = Math.max(1, track.life || 1);
        const decay = typeof track.decayRate === 'number' ? track.decayRate : 1;
        track.life = (typeof track.life === 'number' ? track.life : track.maxLife) - dt * decay;
        const ratio = Math.max(0, track.life / track.maxLife);
        const baseAlpha = typeof track.baseAlpha === 'number' ? track.baseAlpha : (track.alpha ?? 0.5);
        
        // Ultra-smooth extended fade curve for seamless long transition
        // Using sine-based easing for natural, organic fade that stays visible longer
        // sin(x * π/2) gives perfect 0->1 curve with gentle start and end
        const smoothRatio = Math.sin(ratio * Math.PI * 0.5);
        
        // Apply additional smoothing for extra-long visible duration
        // Square root makes the fade stay visible longer before dropping
        const extendedRatio = Math.sqrt(smoothRatio);
        
        track.alpha = extendedRatio * baseAlpha;
        
        // Remove only when completely invisible
        if (track.alpha <= 0.0005 || track.life <= 0) {
            list.splice(i, 1);
        }
    }
}

// Emits continuous nitrous flames behind the tank while turbo is active.
function emitTurboAfterburn(dt) {
    if (!player || !player.turboActive || player.turboTime <= 0) {
        if (player) player.turboExhaustClock = 0;
        return;
    }
    if (typeof player.turboExhaustClock !== 'number' || Number.isNaN(player.turboExhaustClock)) {
        player.turboExhaustClock = 0;
    }
    player.turboExhaustClock += dt;
    const interval = Math.max(0.35, 1.05 - (player.turboSpeed || 7.5) * 0.06);
    while (player.turboExhaustClock >= interval) {
        player.turboExhaustClock -= interval;
        for (let side = -1; side <= 1; side += 2) {
            const lateral = 13 * side;
            const backward = 30 + Math.random() * 12;
            const nozzleX = player.x - Math.cos(player.angle) * 12 + Math.cos(player.angle + Math.PI / 2) * lateral;
            const nozzleY = player.y - Math.sin(player.angle) * 12 + Math.sin(player.angle + Math.PI / 2) * lateral;
            const spawnX = nozzleX - Math.cos(player.angle) * backward;
            const spawnY = nozzleY - Math.sin(player.angle) * backward;
            const jitter = (Math.random() - 0.5) * 0.4;
            const flameAngle = player.angle + Math.PI + jitter;
            const speed = 2.3 + Math.random() * 2.2;
            const life = 26 + Math.random() * 12;
            particles.push({
                x: spawnX,
                y: spawnY,
                vx: Math.cos(flameAngle) * speed,
                vy: Math.sin(flameAngle) * speed,
                life,
                maxLife: life,
                color: `rgba(56, 189, 248, ${0.65 + Math.random() * 0.25})`,
                coreColor: 'rgba(224, 242, 254, 0.95)',
                size: 8 + Math.random() * 3,
                drag: 0.05,
                gravity: -0.02,
                style: 'turbo'
            });
            const sparkLife = 18 + Math.random() * 10;
            particles.push({
                x: spawnX,
                y: spawnY,
                vx: Math.cos(flameAngle) * (speed * 1.1) + (Math.random() - 0.5),
                vy: Math.sin(flameAngle) * (speed * 1.1) + (Math.random() - 0.5),
                life: sparkLife,
                maxLife: sparkLife,
                color: 'rgba(59, 130, 246, 0.6)',
                size: 3 + Math.random() * 2,
                drag: 0.04
            });
        }
    }
}

// Performance tracking for adaptive quality
let perfFrameCount = 0;
let perfTotalTime = 0;
let avgFrameTime = 16.67;
let adaptiveQuality = 1.0; // 1.0 = full quality, lower = reduced effects

// === FPS LIMITER SYSTEM ===
// Caps frame rate at 60 FPS for consistent gameplay and power efficiency
// Uses a robust timing approach that works on high refresh rate monitors (120Hz, 144Hz, etc.)
// TARGET_FPS and FRAME_TIME are defined in config.js
// DEBUG_FPS_LIMITER controls whether the limiter is active
const FRAME_MIN_TIME = FRAME_TIME; // Use FRAME_TIME from config.js (16.67ms for 60fps)
let lastFrameTime = -1; // Initialize to -1 to ensure first frame always runs
let frameTimeAccumulator = 0; // Accumulates fractional frame time for precision
let currentRealFPS = 60; // Track actual FPS for Smart Performance Optimizer

// === FIXED TIMESTEP SYSTEM ===
// Accumulates time and runs physics in fixed steps to ensure consistent speed
// regardless of frame rate. Prevents speed-up during lag.
const FIXED_TIMESTEP = 16.67; // Fixed physics step (60 updates per second)
const MAX_ACCUMULATED_TIME = 100; // Max time to accumulate (prevents spiral of death)
let accumulatedTime = 0;

// Frame loop uses FIXED TIMESTEP to ensure consistent gameplay speed
// Physics updates happen at a fixed rate (60Hz) regardless of actual frame rate
// This prevents the game from speeding up when FPS drops
function loop(timestamp) {
    if ((state !== 'GAME' && state !== 'MISSION_FAIL') || paused) return;
    
    // Schedule next frame immediately (let browser handle timing)
    animationId = requestAnimationFrame(loop);
    
    // === FPS LIMITER (Controlled by DEBUG_FPS_LIMITER) ===
    // When enabled, caps frame rate at 60 FPS for consistent gameplay
    // When disabled, runs at monitor's native refresh rate
    if (DEBUG_FPS_LIMITER) {
        // Initialize lastFrameTime on first frame
        if (lastFrameTime < 0) {
            lastFrameTime = timestamp;
            lastTime = timestamp;
            return; // Skip first frame to establish baseline
        }
        
        // Calculate time since last rendered frame
        const deltaTime = timestamp - lastFrameTime;
        
        // Accumulate time - this handles fractional frame times properly
        frameTimeAccumulator += deltaTime;
        lastFrameTime = timestamp;
        
        // Only process frame if enough time has accumulated (16.67ms for 60 FPS)
        if (frameTimeAccumulator < FRAME_MIN_TIME) {
            return; // Skip this frame, not enough time accumulated
        }
        
        // Consume the frame time (keep remainder for next frame)
        frameTimeAccumulator -= FRAME_MIN_TIME;
        
        // Cap accumulator to prevent spiral if we fall behind
        if (frameTimeAccumulator > FRAME_MIN_TIME) {
            frameTimeAccumulator = 0;
        }
    } else {
        // FPS limiter disabled - initialize lastFrameTime if needed
        if (lastFrameTime < 0) {
            lastFrameTime = timestamp;
            lastTime = timestamp;
            return;
        }
        lastFrameTime = timestamp;
    }
    
    // Calculate elapsed time since last processed frame
    const elapsed = timestamp - lastTime;
    lastTime = timestamp;
    
    // Performance tracking - calculate rolling average frame time
    perfFrameCount++;
    perfTotalTime += elapsed;
    if (perfFrameCount >= 30) {
        avgFrameTime = perfTotalTime / perfFrameCount;
        
        // Calculate current real FPS for Smart Performance Optimizer
        currentRealFPS = 1000 / avgFrameTime;
        
        // Update Smart Performance Optimizer with current FPS
        if (typeof updateSmartPerformance === 'function') {
            updateSmartPerformance(currentRealFPS);
        }
        
        perfFrameCount = 0;
        perfTotalTime = 0;
        
        // Adaptive quality: reduce particle effects if frame time is too high
        // Target: 16.67ms (60fps), Warning: >20ms (50fps), Critical: >33ms (30fps)
        if (avgFrameTime > 33) {
            adaptiveQuality = Math.max(0.3, adaptiveQuality - 0.1);
        } else if (avgFrameTime > 20) {
            adaptiveQuality = Math.max(0.5, adaptiveQuality - 0.05);
        } else if (avgFrameTime < 14 && adaptiveQuality < 1.0) {
            // Frame time is good, gradually restore quality
            adaptiveQuality = Math.min(1.0, adaptiveQuality + 0.02);
        }
    }
    
    // Update smooth performance transition values every frame for glitch-free quality changes
    if (typeof updateSmoothPerfValues === 'function') {
        updateSmoothPerfValues();
    }
    
    // === FIXED TIMESTEP ACCUMULATOR ===
    // Add elapsed time to accumulator, but cap it to prevent spiral of death
    // If game lags severely, we don't try to "catch up" which would cause speed-up
    accumulatedTime += elapsed;
    if (accumulatedTime > MAX_ACCUMULATED_TIME) {
        // Severe lag - discard excess time to prevent speed-up
        // Game will appear to slow down rather than speed up
        accumulatedTime = MAX_ACCUMULATED_TIME;
    }
    
    // Run physics updates at fixed timestep (60Hz)
    // Each update uses dt=1 (normalized for 60fps)
    let updatesThisFrame = 0;
    const MAX_UPDATES_PER_FRAME = 4; // Limit updates to prevent freeze on severe lag
    
    while (accumulatedTime >= FIXED_TIMESTEP && updatesThisFrame < MAX_UPDATES_PER_FRAME) {
        frame++;
        update(1); // Always update with dt=1 (fixed timestep)
        accumulatedTime -= FIXED_TIMESTEP;
        updatesThisFrame++;
    }
    
    // Always render once per frame (interpolation not needed for this game style)
    draw();
    
    // Update FPS counter display if enabled in config
    if (typeof updateFPSCounter === 'function') {
        updateFPSCounter();
    }
}

// Get current adaptive quality level (for other modules to use)
function getAdaptiveQuality() {
    return adaptiveQuality;
}

// Main simulation step covers movement, targeting, entity updates, and spawn
// management in one pass to keep sequencing predictable.
function update(dt) {
    if (state === 'MISSION_FAIL') {
        if (screenShake > 0) screenShake *= 0.9;

        if (missionFailPending) {
            missionFailDelay -= dt;
            if (missionFailDelay <= 0) {
                missionFailPending = false;
                if (typeof missionFailCallback === 'function') {
                    missionFailCallback();
                    missionFailCallback = null;
                }
            }
        }

        updateParticles(dt);

        updateTrackFade(playerTracks, dt);
        updateTrackFade(enemyTracks, dt);

        updateUI();
        return;
    }

    gameTime += dt / 60;
    achievementPulse += dt;
    if (achievementPulse >= 60 && typeof checkAchievements === 'function') {
        achievementPulse = 0;
        checkAchievements({ sessionTime: gameTime, score });
    }

    // === SPATIAL PARTITIONING: Build spatial grid for O(1) collision lookups ===
    // This replaces O(n²) collision checks with O(n) grid insertion + O(1) queries
    if (typeof SPATIAL_GRID !== 'undefined') {
        SPATIAL_GRID.clear();
        // Insert all enemies into spatial grid
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            SPATIAL_GRID.insert(e, e.x, e.y, e.radius || 25);
        }
        // Insert player into grid for enemy-player collision queries
        SPATIAL_GRID.insert(player, player.x, player.y, player.radius || 25);
        // Insert boss if active
        if (boss && boss.hp > 0) {
            SPATIAL_GRID.insert(boss, boss.x, boss.y, boss.radius || 80);
        }
    }
    
    // === PERFORMANCE MONITORING ===
    if (typeof PERF_MONITOR !== 'undefined') {
        PERF_MONITOR.recordFrame(performance.now());
    }

    let tx = player.x - CANVAS.width / 2;
    let ty = player.y - CANVAS.height / 2;
    let maxX = Math.max(0, WORLD_W - CANVAS.width);
    let maxY = Math.max(0, WORLD_H - CANVAS.height);
    camX += (tx - camX) * 0.15 * dt;
    camY += (ty - camY) * 0.15 * dt;
    camX = Math.max(0, Math.min(camX, maxX));
    camY = Math.max(0, Math.min(camY, maxY));
    if (screenShake > 0) screenShake *= 0.9;

    const playerDown = deathSequence.active;
    if (typeof player.spawnWarmup !== 'number') player.spawnWarmup = 0;
    if (!player.spawnWarmupMax) player.spawnWarmupMax = SPAWN_WARMUP_FRAMES;
    if (player.spawnWarmup > 0) player.spawnWarmup = Math.max(0, player.spawnWarmup - dt);
    const playerSpawnLocked = player.spawnWarmup > 0;

    // Decrement fireDelay every frame (mobile fire rate limiter)
    if (player.fireDelay > 0) {
        player.fireDelay = Math.max(0, player.fireDelay - dt);
    }

    // Temperature system: Cool down over time, affects fire rate
    if (!playerDown) {
        if (typeof player.heatSoakTime !== 'number') player.heatSoakTime = 0;
        // Temperature naturally cools toward 20°C (room temperature)
        // Cooling is intentionally sluggish so heat sticks around longer
        const BASE_COOL_RATE = 0.05; // degrees per second baseline
        const CEASE_FIRE_RATE = 0.15; // bonus cooling when laying off the trigger
        const CAREFUL_DELAY = 60; // frames (~1s) before careful cooling engages
        const framesSinceLastShot = frame - (lastShot || 0);
        let coolingRate = BASE_COOL_RATE;
        if (framesSinceLastShot > CAREFUL_DELAY) {
            const patience = Math.min(1, (framesSinceLastShot - CAREFUL_DELAY) / 180);
            coolingRate += CEASE_FIRE_RATE * patience;
        }
        if (player.heatSoakTime > 0) {
            player.heatSoakTime = Math.max(0, player.heatSoakTime - dt);
            coolingRate *= 0.4; // residual heat makes cooldown painfully slow
        }
        if (player.overheated) coolingRate *= 0.7; // overheated tanks shed heat slower
        
        // Apply cooling efficiency from passive drops (1.0 = normal, 2.0 = 100% faster)
        coolingRate *= (player.coolingEfficiency || 1.0);
        
        // Temperature regulation toward base temperature (20°C)
        // After freeze (temp < 20), temperature rises back to 20
        // When hot (temp > 20), temperature cools down to 20
        if (player.temperature > player.baseTemperature) {
            player.temperature = Math.max(player.baseTemperature, player.temperature - coolingRate * dt);
        } else if (player.temperature < player.baseTemperature) {
            // After freeze, gradually warm back up to base temperature
            const warmupRate = coolingRate * 0.5; // Warm up slower than cool down
            player.temperature = Math.min(player.baseTemperature, player.temperature + warmupRate * dt);
        }

        const heatRatio = Math.max(0, Math.min(1, (player.temperature - player.baseTemperature) / (player.maxTemperature - player.baseTemperature)));
        const heatProfile = getHeatProfile(heatRatio);
        player.heatEffectName = heatProfile.name;
        player.heatEffectLevel = heatProfile.severity;
        // Store heat penalty for use in fireWeapon() - don't set fireDelay here
        // fireDelay is only set after actually firing to prevent blocking auto-aim
        player.currentHeatPenalty = heatProfile.penalty;

        // Automatically release thermal lock once temperature drops a bit
        if (player.thermalLocked && player.temperature <= player.maxTemperature - 5) {
            player.thermalLocked = false;
        }
    }

    // Status effect processing
    if (!playerDown) {
        // Burning: Damage over time, increases temperature
        if (player.burning > 0) {
            player.burning -= dt;
            const BURN_DAMAGE = 2.0; // HP per second
            const HEAT_PER_TICK = 0.5; // Temperature increase
            // DEBUG MODE: Skip damage when unlimited HP is enabled
            if (!DEBUG_UNLIMITED_HP) {
                player.hp = Math.max(0, player.hp - BURN_DAMAGE * dt);
            }
            // DEBUG MODE: Skip temperature increase when no temperature mode is enabled
            // Apply cooling efficiency to reduce heat gain from burning
            if (!DEBUG_NO_TEMPERATURE) {
                const coolingMod = player.coolingEfficiency || 1.0;
                player.temperature = Math.min(100, player.temperature + (HEAT_PER_TICK / coolingMod) * dt);
            }
            
            // Burning particle effects
            if (Math.random() < 0.4 * dt) {
                particles.push({
                    x: player.x + (Math.random() - 0.5) * 40,
                    y: player.y + (Math.random() - 0.5) * 40,
                    vx: (Math.random() - 0.5) * 3,
                    vy: -2 - Math.random() * 2,
                    life: 30 + Math.random() * 20,
                    color: Math.random() < 0.5 ? '#ff6b35' : '#ff9500',
                    size: Math.random() * 6 + 3,
                    gravity: -0.03
                });
            }
        }
        
        // CURSED BURNED: Eternal dark flame - small but never stops
        if (player.cursedBurned) {
            const CURSED_DPS = player.cursedBurnedDPS || 3; // Damage per second
            // DEBUG MODE: Skip damage when unlimited HP is enabled
            if (!DEBUG_UNLIMITED_HP && player.shieldTime <= 0) {
                player.hp = Math.max(0, player.hp - (CURSED_DPS / 60) * dt);
            }
            
            // Dark flame particle effects - ominous purple/black flames
            if (Math.random() < 0.6 * dt) {
                const angle = Math.random() * Math.PI * 2;
                const dist = player.radius * 0.8;
                particles.push({
                    x: player.x + Math.cos(angle) * dist,
                    y: player.y + Math.sin(angle) * dist,
                    vx: Math.cos(angle) * 0.5 + (Math.random() - 0.5) * 2,
                    vy: -3 - Math.random() * 3, // Rise upward menacingly
                    life: 35 + Math.random() * 25,
                    color: Math.random() < 0.3 ? '#8b00ff' : (Math.random() < 0.5 ? '#4a0080' : '#1a0030'),
                    size: Math.random() * 7 + 4,
                    gravity: -0.05 // Float upward
                });
            }
            
            // Occasional soul spark effect
            if (frame % 30 === 0) {
                particles.push({
                    x: player.x + (Math.random() - 0.5) * 30,
                    y: player.y + (Math.random() - 0.5) * 30,
                    vx: (Math.random() - 0.5) * 3,
                    vy: -5 - Math.random() * 3,
                    life: 50,
                    color: '#ff00ff',
                    size: 3 + Math.random() * 2,
                    gravity: -0.08
                });
            }
        }
        
        // Frozen: Cannot move, temperature stays at 0 until freeze wears off
        if (player.frozen > 0) {
            player.frozen -= dt;
            player.vx = 0;
            player.vy = 0;
            // Keep temperature at 0 while frozen (already set when ice hits)
            player.temperature = 0;
            
            // Ice particle effects
            if (Math.random() < 0.3 * dt) {
                particles.push({
                    x: player.x + (Math.random() - 0.5) * 40,
                    y: player.y + (Math.random() - 0.5) * 40,
                    vx: (Math.random() - 0.5) * 2,
                    vy: -1 - Math.random(),
                    life: 40 + Math.random() * 30,
                    color: Math.random() < 0.5 ? '#00bcd4' : '#4dd0e1',
                    size: Math.random() * 5 + 2,
                    gravity: 0.02
                });
            }
        }
        
        // Stunned: Energy drains rapidly
        if (player.stunned > 0) {
            player.stunned -= dt;
            // DEBUG MODE: Skip energy drain when unlimited energy is enabled
            if (!DEBUG_UNLIMITED_ENERGY) {
                player.energy = Math.max(0, player.energy - 5.0 * dt);
            }
            
            // Electric spark effects
            if (Math.random() < 0.5 * dt) {
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
        }
        
        // Slowed: Speed reduction (handled in movement calculation below)
        if (player.slowed > 0) {
            player.slowed -= dt;
        }
    }

    let activeRareEffects = 0;
    if (player.invisible) {
        player.invisibleTime = Math.max(0, player.invisibleTime - dt);
        if (player.invisibleTime <= 0) player.invisible = false;
        else activeRareEffects++;
    }
    if (player.turboActive) {
        player.turboTime = Math.max(0, player.turboTime - dt);
        if (player.turboTime <= 0) player.turboActive = false;
        if (player.turboActive) activeRareEffects++;
    }
    if (typeof player.turboCooldown !== 'number') player.turboCooldown = 0;
    if (player.turboCooldown > 0) player.turboCooldown = Math.max(0, player.turboCooldown - dt);
    
    // Lifesteal is now permanent passive - no timer management needed
    // It stays active as long as player has lifesteal level > 0
    
    if (player.autoAim) {
        // Shots-based auto-aim - deactivate when no shots remaining
        if (player.autoAimShots <= 0) {
            player.autoAim = false;
            player.autoAimMaxShots = 0;
        }
        // No activeRareEffects++ for auto-aim since it's common item now
    }
    if (player.magnetActive) {
        player.magnetTime = Math.max(0, player.magnetTime - dt);
        if (player.magnetTime <= 0) player.magnetActive = false;
        else activeRareEffects++;
    }
    rareItemTracker.activeRareItems = activeRareEffects;

    let isShooting = false;
    if (!playerDown && !playerSpawnLocked) isShooting = input.aim.active || keys.up || keys.down || keys.left || keys.right || mouseAim.down;
    
    // Energy recharge with delay after shooting
    if (!playerDown && (!isShooting || player.overheated || player.fireDelay > 0)) {
        // Wait for recharge delay to expire before regenerating energy
        if (player.rechargeDelay > 0) {
            player.rechargeDelay -= dt;
        } else {
            let regen = (player.overheated ? 0.5 : player.energyRegen) * dt;
            if (player.energy < player.maxEnergy) {
                player.energy += regen;
                // Recover from overheat when energy reaches minimum 100 units
                // Weapon cannot fire until this threshold is met (not percentage-based)
                const recoveryThreshold = 100; // Fixed 100 energy minimum to recover
                if (player.overheated && player.energy >= recoveryThreshold) {
                    player.overheated = false;
                    addFloatText('SYSTEMS ONLINE', player.x, player.y - 40, '#22c55e');
                }
                if (player.energy >= player.maxEnergy) {
                    player.energy = player.maxEnergy;
                }
            }
        }
    }
    
    // Overheat causes drastic temperature spike (system stress)
    // Skip if debug no temperature mode is active
    if (player.energy <= 0 && !player.overheated && !DEBUG_NO_TEMPERATURE) {
        player.overheated = true;
        const tempRange = player.maxTemperature - player.baseTemperature || 1;
        const currentHeatRatio = Math.max(0, Math.min(1, (player.temperature - player.baseTemperature) / tempRange));
        // Apply cooling efficiency to reduce overheat spike
        const coolingMod = player.coolingEfficiency || 1.0;
        const spike = Math.round((40 + Math.round(currentHeatRatio * 30)) / coolingMod); // drastic spike (40-70 range), reduced by cooling efficiency
        player.temperature = Math.min(100, player.temperature + spike);
        player.heatSoakTime = Math.max(player.heatSoakTime || 0, 280); // linger for ~4.5 seconds
        addFloatText('SYSTEM OVERLOAD!', player.x, player.y - 60, '#ff0000');
    }
    
    // === KNOCKBACK ANIMATION UPDATE ===
    // Dramatic bouncing knockback effect when hit by boss headbutt
    if (player.knockbackActive && player.knockbackTime > 0) {
        player.knockbackTime -= dt;
        
        // Calculate animation progress (0 to 1)
        const totalDuration = 45;
        const progress = 1 - (player.knockbackTime / totalDuration);
        
        // Smooth easing - ease out quad for natural deceleration
        const easedProgress = 1 - (1 - progress) * (1 - progress);
        
        // Get stored positions (set when knockback starts)
        const startX = player.knockbackStartX;
        const startY = player.knockbackStartY;
        const targetX = player.knockbackTargetX;
        const targetY = player.knockbackTargetY;
        
        // Validate positions exist
        if (startX === undefined || targetX === undefined) {
            player.knockbackActive = false;
            return;
        }
        
        // Add vertical arc (tank flies up then down)
        const arcHeight = 30 * Math.sin(progress * Math.PI);
        
        // Calculate new position with smooth linear interpolation
        let newX = startX + (targetX - startX) * easedProgress;
        let newY = startY + (targetY - startY) * easedProgress - arcHeight;
        
        // Clamp to river boundary during knockback to prevent going out of bounds
        const riverBoundary = typeof RIVER_BOUNDARY !== 'undefined' ? RIVER_BOUNDARY : 90;
        newX = Math.max(riverBoundary, Math.min(WORLD_W - riverBoundary, newX));
        newY = Math.max(riverBoundary, Math.min(WORLD_H - riverBoundary, newY));
        
        // Apply position - use direct assignment for smooth animation
        player.x = newX;
        player.y = newY;
        
        // Spin player during knockback for dramatic effect
        player.angle += 0.15 * dt;
        
        // Trail particles during flight
        if (frame % 2 === 0) {
            particles.push({
                x: player.x + (Math.random() - 0.5) * 20,
                y: player.y + (Math.random() - 0.5) * 20,
                vx: -Math.cos(player.knockbackAngle) * 3 + (Math.random() - 0.5) * 2,
                vy: -Math.sin(player.knockbackAngle) * 3 + (Math.random() - 0.5) * 2,
                life: 20,
                color: '#ff6600',
                size: 4 + Math.random() * 4
            });
        }
        
        // Dust cloud at landing
        if (player.knockbackTime <= 0) {
            player.knockbackActive = false;
            screenShake = 10;
            
            // Landing dust cloud
            for (let i = 0; i < 20; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 2 + Math.random() * 5;
                particles.push({
                    x: player.x,
                    y: player.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 25 + Math.random() * 15,
                    color: '#996633',
                    size: 4 + Math.random() * 6
                });
            }
        }
    }
    
    // Decay knockback flash
    if (player.knockbackFlash > 0) player.knockbackFlash -= dt;

    // Apply speed modifiers from status effects
    let baseSpeed = player.speedBase * (player.buffTime > 0 ? 1.4 : 1);
    // Apply berserker speed bonus
    if (player.berserkerActive && player.berserkerTime > 0) {
        baseSpeed *= player.berserkerSpeedMult || 2.0;
    }
    if (player.turboActive && player.turboTime > 0) baseSpeed = Math.max(baseSpeed, player.turboSpeed);
    let spd = baseSpeed * dt;
    if (player.isUlting) spd *= 0.2;
    if (player.frozen > 0) spd = 0; // Cannot move when frozen
    if (player.slowed > 0) spd *= 0.5; // 50% speed reduction when slowed
    
    let moveX = 0;
    let moveY = 0;
    if (!playerDown && !playerSpawnLocked) {
        if (input.move.active) {
            moveX = input.move.x;
            moveY = input.move.y;
            player.angle = input.move.angle;
        } else {
            // Desktop users rely on WASD, so we normalize the vector manually.
            if (keys.w) moveY -= 1;
            if (keys.s) moveY += 1;
            if (keys.a) moveX -= 1;
            if (keys.d) moveX += 1;
            if (moveX !== 0 || moveY !== 0) {
                let ang = Math.atan2(moveY, moveX);
                player.angle = ang;
                let mag = Math.hypot(moveX, moveY);
                moveX /= mag;
                moveY /= mag;
            }
        }
        if (moveX !== 0 || moveY !== 0) {
            player.vx += (moveX * spd - player.vx) * 0.2 * dt;
            player.vy += (moveY * spd - player.vy) * 0.2 * dt;
        } else {
            player.vx *= Math.pow(0.8, dt);
            player.vy *= Math.pow(0.8, dt);
        }
    } else {
        player.vx *= Math.pow(0.8, dt);
        player.vy *= Math.pow(0.8, dt);
    }

    // Update wheel rotation based on movement velocity
    const playerSpeed = Math.hypot(player.vx, player.vy);
    if (playerSpeed > 0.05) {
        // Rotate wheels based on speed - faster movement = faster rotation
        // Multiplier 0.35 gives visually satisfying wheel spin
        player.wheelRotation += playerSpeed * 0.35 * dt;
        // Keep rotation in reasonable bounds
        if (player.wheelRotation > Math.PI * 2) player.wheelRotation -= Math.PI * 2;
    }

    let nx = player.x + player.vx * dt;
    let ny = player.y + player.vy * dt;
    
    // Player tracks disabled - only enemies leave tracks for better tracking
    // (Player track generation code removed for cleaner gameplay)
    
    if (!checkWall(nx, player.y, player.radius) && !checkCrate(nx, player.y, player.radius)) player.x = nx;
    if (!checkWall(player.x, ny, player.radius) && !checkCrate(player.x, ny, player.radius)) player.y = ny;
    
    // === RIVER BOUNDARY - Prevent player from entering river border ===
    const riverBoundary = typeof RIVER_BOUNDARY !== 'undefined' ? RIVER_BOUNDARY : 90;
    player.x = Math.max(riverBoundary, Math.min(WORLD_W - riverBoundary, player.x));
    player.y = Math.max(riverBoundary, Math.min(WORLD_H - riverBoundary, player.y));

    emitTurboAfterburn(dt);

    // Turret keeps its last angle unless actively aimed
    // This prevents turret snapping to default angle (0 = right) when idle
    let aimAngle = player.turretAngle;  // Start with current turret angle
    let shouldFire = false;
    let isActivelyAiming = false;  // Track if player is actively providing aim input
    
    if (!playerDown) {
        // Priority: 1. Touch joystick, 2. Keyboard arrows, 3. Mouse aim (only when clicking or recently moved)
        if (input.aim.active) {
            // Touch joystick has highest priority
            aimAngle = input.aim.angle;
            shouldFire = true;
            isActivelyAiming = true;
        } else if (keys.up || keys.down || keys.left || keys.right) {
            // Keyboard arrow keys - fires while held
            let kx = 0;
            let ky = 0;
            if (keys.up) ky -= 1;
            if (keys.down) ky += 1;
            if (keys.left) kx -= 1;
            if (keys.right) kx += 1;
            if (kx !== 0 || ky !== 0) {
                aimAngle = Math.atan2(ky, kx);
                shouldFire = true;
                isActivelyAiming = true;
            }
        } else if (mouseAim.down) {
            // Mouse click - aim and fire
            aimAngle = mouseAim.angle;
            shouldFire = true;
            isActivelyAiming = true;
        }
        // NOTE: Mouse movement without click no longer forces turret rotation
        // This prevents turret from resetting to angle 0 when idle
    }

    // Track if player is manually aiming/firing BEFORE auto-aim kicks in
    const isManualFiring = input.aim.active || mouseAim.down || keys.up || keys.down || keys.left || keys.right;
    
    // Auto-aim only activates when player is NOT manually controlling
    let isAutoAimShot = false;
    let autoAimTargetAngle = null;
    if (!playerDown && !playerSpawnLocked && player.autoAim && player.autoAimShots > 0 && !shouldFire && shouldAutoAimFire()) {
        // Smart auto-aim: fires independently when player is not manually aiming
        const autoAimAngle = getAutoAimAngle();
        if (autoAimAngle !== null) {
            autoAimTargetAngle = autoAimAngle;
            aimAngle = autoAimAngle;
            
            // Check if turret is already aimed at target before allowing fire
            let turretDiff = autoAimAngle - player.turretAngle;
            while (turretDiff < -Math.PI) turretDiff += Math.PI * 2;
            while (turretDiff > Math.PI) turretDiff -= Math.PI * 2;
            
            // Only fire if turret is within 0.15 radians (~8.6 degrees) of target
            if (Math.abs(turretDiff) < 0.15) {
                shouldFire = true;
                isAutoAimShot = true; // Mark this shot as from auto-aim
            }
            // Turret will rotate toward target regardless of whether we fire
        }
    }

    // Turret rotates with easing so heavy cannons feel weighty.
    if (playerSpawnLocked) shouldFire = false;

    // Block shooting when stunned (same as enemies cannot fire when stunned)
    const isStunned = player.stunned > 0 || player.stunnedTime > 0;
    
    // Block ALL actions when frozen - complete immobilization (movement, turret rotation, shooting)
    // This ensures frozen effect is consistent between player and enemies
    const isFrozen = player.frozen > 0;
    
    // === SMOOTH TURRET ROTATION ===
    // Turret rotates smoothly toward aim direction with configurable speed
    const TURRET_ROTATION_SPEED = 0.12; // Base rotation speed (radians per frame at dt=1)
    
    // Recoil recovery: slow down turret tracking after firing to show accuracy error visually
    // Recovery time is extended at high temperatures (stored when firing)
    let turretRotationMultiplier = 1.0;
    if (player.recoilRecoveryTime > 0) {
        // Store max recovery time for progress calculation (set when firing)
        if (!player.recoilRecoveryTimeMax || player.recoilRecoveryTime > player.recoilRecoveryTimeMax) {
            player.recoilRecoveryTimeMax = player.recoilRecoveryTime;
        }
        player.recoilRecoveryTime -= dt;
        // Significantly reduce rotation speed during recoil recovery
        // Use exponential slowdown - slower at start, gradually speeds up
        const recoveryProgress = Math.max(0, player.recoilRecoveryTime / player.recoilRecoveryTimeMax);
        turretRotationMultiplier = 0.03 + (1 - recoveryProgress) * 0.12; // 0.03 at start, 0.15 at end
    } else {
        player.recoilRecoveryTimeMax = 0; // Reset when recovery complete
    }
    const effectiveRotationSpeed = TURRET_ROTATION_SPEED * turretRotationMultiplier;
    
    // Frozen tanks cannot rotate turret or shoot - complete immobilization
    if (!playerDown && shouldFire && !player.isUlting && !playerSpawnLocked && !isStunned && !isFrozen) {
        let diff = aimAngle - player.turretAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        // Smooth rotation with speed limit to prevent instant snapping
        const maxRotation = effectiveRotationSpeed * dt;
        player.turretAngle += Math.sign(diff) * Math.min(Math.abs(diff), Math.max(maxRotation, Math.abs(diff) * 0.5 * dt * turretRotationMultiplier));
        if (!player.overheated) {
            // Set auto-aim flag before firing for accuracy bonus
            currentShotIsAutoAim = isAutoAimShot;
            const firedShot = fireWeapon();
            currentShotIsAutoAim = false; // Reset flag after firing
            // Decrement auto-aim shots only if auto-aim fired successfully
            if (firedShot && isAutoAimShot && player.autoAimShots > 0) {
                player.autoAimShots--;
            }
        }
    } else if (!playerDown && isActivelyAiming && !playerSpawnLocked && !isFrozen) {
        // Only rotate turret when player is actively aiming (not just mouseAim.active)
        // This prevents turret from snapping to angle 0 when idle
        let diff = aimAngle - player.turretAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        // Smooth rotation for active aiming
        const maxRotation = effectiveRotationSpeed * dt;
        player.turretAngle += Math.sign(diff) * Math.min(Math.abs(diff), Math.max(maxRotation, Math.abs(diff) * 0.5 * dt * turretRotationMultiplier));
    } else if (!playerDown && autoAimTargetAngle !== null && !playerSpawnLocked && !isFrozen) {
        // Auto-aim turret rotation even when not firing (turret tracks target)
        // Frozen tanks cannot rotate turret - complete immobilization
        let diff = autoAimTargetAngle - player.turretAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        const maxRotation = effectiveRotationSpeed * dt;
        player.turretAngle += Math.sign(diff) * Math.min(Math.abs(diff), Math.max(maxRotation, Math.abs(diff) * 0.5 * dt * turretRotationMultiplier));
    }

    if (player.isUlting && !playerDown) {
        player.ultTimer -= dt;
        if (player.ultTimer > 60) {
            screenShake = 1;
            spawnUltChargeSparks(dt);
            // Activate shield during ultimate charging phase
            if (player.shieldTime < 300) player.shieldTime = 300;
            
            // Allow aiming during charging phase - update beam angle with joystick/mouse/keyboard
            if (input.aim.active && input.aim.mag > 0.2) {
                // Smoothly adjust ultimate beam aim direction with joystick
                let targetAngle = input.aim.angle;
                let diff = targetAngle - player.turretAngle;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                player.turretAngle += diff * 0.15 * dt; // Slower turn during charging
            } else if (mouseAim.active) {
                // Mouse aim during charging
                const aimAngle = Math.atan2(mouseAim.y - player.y, mouseAim.x - player.x);
                let diff = aimAngle - player.turretAngle;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                player.turretAngle += diff * 0.15 * dt;
            } else if (keys.up || keys.down || keys.left || keys.right) {
                // Keyboard aim during charging
                let kx = 0;
                let ky = 0;
                if (keys.up) ky -= 1;
                if (keys.down) ky += 1;
                if (keys.left) kx -= 1;
                if (keys.right) kx += 1;
                if (kx !== 0 || ky !== 0) {
                    const targetAngle = Math.atan2(ky, kx);
                    let diff = targetAngle - player.turretAngle;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    player.turretAngle += diff * 0.15 * dt;
                }
            }
        } else if (player.ultTimer <= 60 && player.ultTimer > 0 && !player.firedUlt) {
            fireUltimate();
            player.firedUlt = true;
        } else if (player.ultTimer <= 0) {
            player.isUlting = false;
            player.killStreak = 0;
            player.ultReady = false;
            player.firedUlt = false;
        }
    } else if (player.killStreak >= player.maxStreak) player.ultReady = true;
    
    // DEBUG_ULTIMATE_ALWAYS_ACTIVE: Ultimate is always ready to fire
    if (DEBUG_ULTIMATE_ALWAYS_ACTIVE && !player.isUlting) player.ultReady = true;

    if (player.buffTime > 0) player.buffTime -= dt;
    if (player.recoil > 0) player.recoil *= Math.pow(0.8, dt);
    
    // Update berserker mode timer and effects
    if (player.berserkerActive && player.berserkerTime > 0) {
        player.berserkerTime -= dt;
        // Berserker visual particles - fire aura
        if (Math.random() < 0.4 * dt) {
            const angle = Math.random() * Math.PI * 2;
            const dist = player.radius + Math.random() * 15;
            particles.push({
                x: player.x + Math.cos(angle) * dist,
                y: player.y + Math.sin(angle) * dist,
                vx: (Math.random() - 0.5) * 4,
                vy: -Math.random() * 6 - 2,
                life: 30,
                color: '#ef4444',
                size: 4
            });
        }
        // End berserker when timer runs out
        if (player.berserkerTime <= 0) {
            player.berserkerActive = false;
            player.berserkerSpeedMult = 1;
            player.berserkerDamageMult = 1;
            player.berserkerFireRateMult = 1;
            addFloatText('BERSERKER ENDED', player.x, player.y - 50, '#888888');
        }
    }
    
    // Update shockwave expansion animation
    if (player.shockwaveActive) {
        player.shockwaveRadius += (player.shockwaveExpansionSpeed || 15) * dt;
        if (player.shockwaveRadius >= player.shockwaveMaxRadius) {
            player.shockwaveActive = false;
        }
    }
    
    // Update shockwave DOT (damage over time)
    if (player.shockwaveDOT) {
        updateShockwaveDOT();
    }
    
    // Visual turret recoil decay - turret smoothly returns to centered position
    // Recoil offset follows turret angle direction so visual feedback is accurate
    if (player.turretRecoilOffsetX !== 0 || player.turretRecoilOffsetY !== 0) {
        // Calculate current recoil magnitude
        const recoilMagnitude = Math.hypot(player.turretRecoilOffsetX, player.turretRecoilOffsetY);
        
        // Decay magnitude
        const newMagnitude = recoilMagnitude * Math.pow(player.turretRecoilDecay, dt);
        
        if (newMagnitude < 0.01) {
            // Snap to zero when very small
            player.turretRecoilOffsetX = 0;
            player.turretRecoilOffsetY = 0;
        } else {
            // Recalculate offset based on CURRENT turret angle (backward direction)
            // This keeps recoil visual aligned with turret even as it rotates
            const kickAngle = player.turretAngle - Math.PI;
            player.turretRecoilOffsetX = Math.cos(kickAngle) * newMagnitude;
            player.turretRecoilOffsetY = Math.sin(kickAngle) * newMagnitude;
        }
    }
    
    if (player.shieldTime > 0) {
        // DEBUG_UNLIMITED_SHIELD: Shield never expires
        if (!DEBUG_UNLIMITED_SHIELD) player.shieldTime -= dt;
        if (Math.random() < 0.1 * dt) createParticle(player.x + (Math.random() - 0.5) * 40, player.y + (Math.random() - 0.5) * 40, 'cyan', 1);
    }
    if (player.armor > 0) {
        if (Math.random() < 0.15 * dt) createParticle(player.x + (Math.random() - 0.5) * 40, player.y + (Math.random() - 0.5) * 40, '#38bdf8', 1);
    }
    
    // CRITICAL TEMPERATURE FIRE SPARKS - Fire sparks appear at turret tip when tank overheats (60%+)
    // Intensity increases as temperature rises, disappears as it cools down
    // FIXED: Now supports multi-barrel weapons with sparks from ALL barrels
    const tempPercent = (player.temperature - player.baseTemperature) / (player.maxTemperature - player.baseTemperature);
    if (tempPercent > 0.6 && !DEBUG_NO_TEMPERATURE) { // Start sparks at 60%+ temperature (68°C+)
        const heatIntensity = (tempPercent - 0.6) / 0.4; // 0 to 1 scale above 60%
        const sparkChance = heatIntensity * 0.4 * dt;
        const isCriticalHeat = tempPercent > 0.85; // 85%+ is critical (88°C+)
        
        // Weapon-specific muzzle distances (same as overheat smoke)
        const WEAPON_MUZZLE_DISTANCE = {
            'cannon': 40, 'twin': 34, 'shotgun': 36, 'sniper': 52,
            'burst': 32, 'flak': 32, 'rocket': 34, 'laser': 42,
            'gauss': 49, 'ice': 38, 'fire': 36, 'electric': 40
        };
        
        // Multi-barrel offset configurations (perpendicular to firing direction)
        const WEAPON_BARREL_OFFSETS = {
            'twin': [-8, 8],           // Dual parallel barrels
            'burst': [0, 9, -9],       // Triple-stacked barrels: center, right, left
            'shotgun': [-3.5, 3.5]     // Dual heavy barrels
        };
        
        const turretLength = WEAPON_MUZZLE_DISTANCE[player.weapon] || 35;
        const barrelOffsets = WEAPON_BARREL_OFFSETS[player.weapon] || [0]; // Default single barrel
        const perpAngle = player.turretAngle + Math.PI / 2;
        
        // Fire sparks from turret barrel tip (indicates weapon overheating) - ALL barrels
        if (Math.random() < sparkChance) {
            // Scale rate by barrel count to keep total particles similar
            const rateScale = 1 / barrelOffsets.length;
            
            for (const offset of barrelOffsets) {
                if (Math.random() > rateScale) continue; // Probabilistic skip for multi-barrel
                
                // Calculate turret tip position for this barrel
                const turretTipX = player.x + Math.cos(player.turretAngle) * turretLength + Math.cos(perpAngle) * offset;
                const turretTipY = player.y + Math.sin(player.turretAngle) * turretLength + Math.sin(perpAngle) * offset;
                
                // Random spread around turret tip
                const sparkX = turretTipX + (Math.random() - 0.5) * 8;
                const sparkY = turretTipY + (Math.random() - 0.5) * 8;
                
                // Fire spark - shoots outward from turret direction with some spread
                const spreadAngle = player.turretAngle + (Math.random() - 0.5) * 0.8;
                const sparkSpeed = 3 + Math.random() * 4 + heatIntensity * 3;
                
                particles.push({
                    x: sparkX,
                    y: sparkY,
                    vx: Math.cos(spreadAngle) * sparkSpeed + (Math.random() - 0.5) * 2,
                    vy: Math.sin(spreadAngle) * sparkSpeed + (Math.random() - 0.5) * 2,
                    life: 15 + Math.random() * 20,
                    maxLife: 15 + Math.random() * 20,
                    color: isCriticalHeat ? '#ff3300' : (Math.random() < 0.5 ? '#ff6600' : '#ff9900'),
                    size: 2 + Math.random() * 3 + heatIntensity * 2,
                    gravity: 0.15, // Sparks fall slightly
                    drag: 0.03,
                    noScale: true,
                    particleId: Date.now() + Math.random() // Unique ID for consistent rendering
                });
                
                // Secondary ember trails
                if (Math.random() < heatIntensity * 0.5) {
                    particles.push({
                        x: sparkX + (Math.random() - 0.5) * 6,
                        y: sparkY + (Math.random() - 0.5) * 6,
                        vx: Math.cos(spreadAngle) * (sparkSpeed * 0.5) + (Math.random() - 0.5) * 3,
                        vy: Math.sin(spreadAngle) * (sparkSpeed * 0.5) + (Math.random() - 0.5) * 3,
                        life: 10 + Math.random() * 15,
                        maxLife: 10 + Math.random() * 15,
                        color: '#ffcc00',
                        size: 1 + Math.random() * 2,
                        gravity: 0.1,
                        drag: 0.04,
                        noScale: true,
                        particleId: Date.now() + Math.random()
                    });
                }
            }
        }
        
        // Critical heat: Additional intense sparks and small flame bursts - ALL barrels
        if (isCriticalHeat && Math.random() < 0.25 * dt) {
            for (const offset of barrelOffsets) {
                // Calculate turret tip position for this barrel
                const turretTipX = player.x + Math.cos(player.turretAngle) * turretLength + Math.cos(perpAngle) * offset;
                const turretTipY = player.y + Math.sin(player.turretAngle) * turretLength + Math.sin(perpAngle) * offset;
                
                // Intense flame burst from overheating barrel
                const burstCount = Math.floor((2 + Math.floor(Math.random() * 3)) / barrelOffsets.length) + 1;
                for (let i = 0; i < burstCount; i++) {
                    const burstAngle = player.turretAngle + (Math.random() - 0.5) * 1.2;
                    const burstSpeed = 2 + Math.random() * 3;
                    particles.push({
                        x: turretTipX + (Math.random() - 0.5) * 5,
                        y: turretTipY + (Math.random() - 0.5) * 5,
                        vx: Math.cos(burstAngle) * burstSpeed,
                        vy: Math.sin(burstAngle) * burstSpeed,
                        life: 8 + Math.random() * 12,
                        maxLife: 8 + Math.random() * 12,
                        color: Math.random() < 0.3 ? '#ffffff' : (Math.random() < 0.5 ? '#ff4400' : '#ff0000'),
                        size: 3 + Math.random() * 4,
                        gravity: 0.08,
                        drag: 0.02,
                        noScale: true,
                        particleId: Date.now() + Math.random()
                    });
                }
            }
        }
    }
    
    // REALISTIC DAMAGE SMOKE - Multi-layered volumetric smoke system
    // Creates billowing smoke clouds with varying density based on damage level
    const playerHpRatio = player.hp / player.maxHp;
    if (playerHpRatio < 0.7 && !player.overheated) {
        const damageLevel = 0.7 - playerHpRatio; // 0 to 0.7
        const isCritical = playerHpRatio < 0.3;
        const smokeChance = damageLevel * 0.4 * dt;
        
        // Engine exhaust smoke (rear of tank)
        if (Math.random() < smokeChance) {
            const smokeOffsetX = Math.cos(player.angle + Math.PI) * 22;
            const smokeOffsetY = Math.sin(player.angle + Math.PI) * 22;
            const baseX = player.x + smokeOffsetX;
            const baseY = player.y + smokeOffsetY;
            
            // Primary smoke puff - large billowing cloud
            particles.push({
                x: baseX + (Math.random() - 0.5) * 12,
                y: baseY + (Math.random() - 0.5) * 12,
                vx: (Math.random() - 0.5) * 1.0 + Math.cos(player.angle + Math.PI) * 0.8,
                vy: -1.5 - Math.random() * 2.5, // Rise upward
                life: 80 + Math.random() * 50,
                color: isCritical ? '#1a1a1a' : '#3a3a3a',
                size: (isCritical ? 14 : 10) + Math.random() * 8,
                gravity: -0.04, // Negative gravity = rise
                drag: 0.015,
                type: 'smoke',
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.05
            });
            
            // Secondary wispy smoke - smaller trails
            if (Math.random() < 0.6) {
                particles.push({
                    x: baseX + (Math.random() - 0.5) * 18,
                    y: baseY + (Math.random() - 0.5) * 18,
                    vx: (Math.random() - 0.5) * 2.5,
                    vy: -2 - Math.random() * 1.5,
                    life: 50 + Math.random() * 30,
                    color: isCritical ? '#2d2d2d' : '#555555',
                    size: 5 + Math.random() * 5,
                    gravity: -0.03,
                    drag: 0.025,
                    type: 'smoke'
                });
            }
        }
        
        // Fire licks when critically damaged (under 30% HP)
        if (isCritical && Math.random() < 0.25 * dt) {
            const fireX = player.x + (Math.random() - 0.5) * 28;
            const fireY = player.y + (Math.random() - 0.5) * 28;
            
            // Flame particle
            particles.push({
                x: fireX,
                y: fireY,
                vx: (Math.random() - 0.5) * 2,
                vy: -4 - Math.random() * 3,
                life: 15 + Math.random() * 10,
                color: Math.random() < 0.4 ? '#ff4400' : (Math.random() < 0.5 ? '#ff8800' : '#ffcc00'),
                size: 4 + Math.random() * 4,
                gravity: -0.15,
                drag: 0.03,
                type: 'fire'
            });
        }
        
        // Hot ember sparks when critically damaged
        if (isCritical && Math.random() < 0.2 * dt) {
            particles.push({
                x: player.x + (Math.random() - 0.5) * 32,
                y: player.y + (Math.random() - 0.5) * 32,
                vx: (Math.random() - 0.5) * 8,
                vy: -5 - Math.random() * 6,
                life: 20 + Math.random() * 20,
                color: Math.random() < 0.5 ? '#ff6600' : '#ffaa00',
                size: 1 + Math.random() * 2,
                gravity: 0.12,
                drag: 0.01,
                type: 'spark'
            });
        }
    }
    
    // REALISTIC OVERHEAT SMOKE - Per-weapon muzzle distance with dramatic heat vent
    // FIXED: Now supports multi-barrel weapons (twin, burst) with smoke from ALL barrels
    if (player.overheated) {
        // Weapon-specific muzzle distances (based on turret barrel lengths)
        const WEAPON_MUZZLE_DISTANCE = {
            'cannon': 40,   // Classic barrel + muzzle brake
            'twin': 34,     // Dual parallel barrels
            'shotgun': 36,  // Wide scatter barrel
            'sniper': 52,   // Long sleek barrel + muzzle extension
            'burst': 32,    // Triple-stacked barrels
            'flak': 32,     // Chunky barrel
            'rocket': 34,   // Rocket tube launcher
            'laser': 42,    // Plasma emitter + tip glow
            'gauss': 49,    // Electromagnetic rail gun
            'ice': 38,      // Crystalline barrel
            'fire': 36,     // Flamethrower barrel
            'electric': 40  // Tesla coil rifle
        };
        
        // Multi-barrel offset configurations (perpendicular to firing direction)
        // Matches turret rendering and muzzle flash positions
        const WEAPON_BARREL_OFFSETS = {
            'twin': [-8, 8],           // Dual parallel barrels (same as twin muzzle flash)
            'burst': [0, 9, -9],       // Triple-stacked barrels: center, right, left
            'shotgun': [-3.5, 3.5]     // Dual heavy barrels (from DEVASTATOR config)
        };
        
        const muzzleDistance = WEAPON_MUZZLE_DISTANCE[player.weapon] || 35;
        const barrelOffsets = WEAPON_BARREL_OFFSETS[player.weapon] || [0]; // Default single barrel
        const perpAngle = player.turretAngle + Math.PI / 2; // Perpendicular to firing direction
        
        // Generate overheat particles for EACH barrel
        for (const offset of barrelOffsets) {
            // Calculate muzzle position for this barrel
            const muzzleX = player.x + Math.cos(player.turretAngle) * muzzleDistance + Math.cos(perpAngle) * offset;
            const muzzleY = player.y + Math.sin(player.turretAngle) * muzzleDistance + Math.sin(perpAngle) * offset;
            
            // Scale particle rate by number of barrels (so total particle count stays similar)
            const rateScale = 1 / barrelOffsets.length;
            
            // Primary smoke plume - thick billowing clouds
            if (Math.random() < 0.5 * dt * rateScale) {
                const plumeAngle = player.turretAngle + (Math.random() - 0.5) * 0.4;
                particles.push({
                    x: muzzleX + (Math.random() - 0.5) * 8,
                    y: muzzleY + (Math.random() - 0.5) * 8,
                    vx: Math.cos(plumeAngle) * (2 + Math.random() * 2) + (Math.random() - 0.5) * 1.5,
                    vy: -3.5 - Math.random() * 3, // Strong upward rise
                    life: 90 + Math.random() * 50,
                    color: Math.random() < 0.35 ? '#2a2a2a' : (Math.random() < 0.5 ? '#4a4a4a' : '#6a6a6a'),
                    size: 8 + Math.random() * 8, // Slightly smaller for multi-barrel
                    gravity: -0.05,
                    drag: 0.018,
                    type: 'smoke',
                    rotation: Math.random() * Math.PI * 2,
                    rotationSpeed: (Math.random() - 0.5) * 0.04
                });
            }
            
            // Secondary wispy smoke trails
            if (Math.random() < 0.35 * dt * rateScale) {
                particles.push({
                    x: muzzleX + (Math.random() - 0.5) * 12,
                    y: muzzleY + (Math.random() - 0.5) * 12,
                    vx: (Math.random() - 0.5) * 3,
                    vy: -2 - Math.random() * 2.5,
                    life: 60 + Math.random() * 30,
                    color: '#777777',
                    size: 4 + Math.random() * 5,
                    gravity: -0.04,
                    drag: 0.02,
                    type: 'smoke'
                });
            }
            
            // Heat shimmer/distortion effect
            if (Math.random() < 0.25 * dt * rateScale) {
                particles.push({
                    x: muzzleX,
                    y: muzzleY,
                    vx: 0,
                    vy: -1,
                    size: 16 + Math.random() * 8,
                    life: 25,
                    color: 'rgba(255, 180, 50, 0.15)',
                    type: 'heatwave',
                    gravity: -0.02,
                    drag: 0
                });
            }
            
            // Orange heat glow particles
            if (Math.random() < 0.2 * dt * rateScale) {
                particles.push({
                    x: muzzleX + (Math.random() - 0.5) * 6,
                    y: muzzleY + (Math.random() - 0.5) * 6,
                    vx: (Math.random() - 0.5) * 2,
                    vy: -2 - Math.random() * 2,
                    life: 20 + Math.random() * 15,
                    color: Math.random() < 0.5 ? '#ff6633' : '#ff9944',
                    size: 3 + Math.random() * 3,
                    gravity: -0.03,
                    drag: 0.02
                });
            }
        }
    }
    
    // Ultimate beam DPS system - damage applied over time during beam active
    if (player.ultBeamTime > 0) {
        player.ultBeamTime = Math.max(0, player.ultBeamTime - dt);
        // Apply damage per tick (DPS spread over beam duration)
        applyUltimateBeamDamage(dt);
    }

    if (typeof updateBullets === 'function') updateBullets(dt);
    
    // Process accumulated lifesteal heals - displays combined floating text
    if (typeof processLifestealAccumulator === 'function') processLifestealAccumulator();
    
    if (typeof updateEnemies === 'function') updateEnemies(dt);
    
    // Update magic skill visual effects
    if (typeof updateMagicEffects === 'function') updateMagicEffects(dt);
    
    if (typeof resolveTankCollisions === 'function') resolveTankCollisions();
    if (typeof updateBoss === 'function') updateBoss(dt);
    if (typeof updatePickups === 'function') updatePickups(dt);
    if (typeof updateParticles === 'function') updateParticles(dt);
    
    // Update player clones (ally tanks from CLONE ultimate)
    updatePlayerClones(dt);
    
    // Update tank tracks (fade out over time)
    if (typeof updateTrackFade === 'function') {
        updateTrackFade(playerTracks, dt);
        updateTrackFade(enemyTracks, dt);
    }
    
    updateUI();

    if (player.hp <= 0 && !deathSequence.active) beginPlayerDeathSequence();
    updateDeathSequence(dt);

    // Wave-based enemy spawning system
    if (!bossActive && !bossSpawned) {
        // Check if in wave transition (cooldown period between waves)
        if (waveTransition) {
            waveTransitionTimer -= dt;
            
            // Display wave transition timer
            if (waveTransitionTimer > 0) {
                const secondsLeft = Math.ceil(waveTransitionTimer / 60);
                // Timer will be displayed in UI
            } else {
                // Transition complete, start next wave
                waveTransition = false;
                // Remove canvas and HUD blur
                if (typeof CANVAS !== 'undefined' && CANVAS) CANVAS.classList.remove('wave-blur');
                if (typeof document !== 'undefined' && document.body) document.body.classList.remove('intermission-blur');
                
                // Apply pending wave rewards when popup closes (NO floating text)
                if (typeof window !== 'undefined' && window.pendingWaveRewards) {
                    const pending = window.pendingWaveRewards;
                    
                    // Apply HP restore (silently, no floating text)
                    if (pending.hpRestore > 0) {
                        const hpAmount = Math.floor(pending.hpRestore);
                        player.hp = Math.min(player.maxHp, player.hp + hpAmount);
                    }
                    
                    // Apply energy restore (silently, no floating text)
                    if (pending.energyRestore > 0) {
                        const energyAmount = Math.floor(pending.energyRestore);
                        player.energy = Math.min(player.maxEnergy, player.energy + energyAmount);
                    }
                    
                    // Apply score bonus
                    if (pending.scoreBonus) {
                        score += Math.floor(pending.scoreBonus);
                    }
                    
                    // Apply max HP bonus (silently, no floating text)
                    if (pending.maxHpBonus > 0) {
                        const hpBonus = Math.floor(pending.maxHpBonus);
                        player.maxHp += hpBonus;
                        player.hp = Math.min(player.maxHp, player.hp + hpBonus);
                    }
                    
                    // Apply max energy bonus (silently, no floating text)
                    if (pending.maxEnergyBonus > 0) {
                        const energyBonus = Math.floor(pending.maxEnergyBonus);
                        player.maxEnergy += energyBonus;
                        player.energy = Math.min(player.maxEnergy, player.energy + energyBonus);
                    }
                    
                    // Apply cooling efficiency bonus (guaranteed every wave)
                    if (pending.coolingBonus > 0) {
                        const maxCooling = 2.0;
                        player.coolingEfficiency = Math.min(maxCooling, (player.coolingEfficiency || 1.0) + pending.coolingBonus);
                    }
                    
                    // Apply revive bonus (milestone wave system: Wave 3=+1, Wave 6=+2, Wave 9=+3)
                    if (pending.reviveBonus && pending.reviveBonus > 0) {
                        const revivesToAdd = typeof pending.reviveBonus === 'number' ? pending.reviveBonus : 1;
                        player.revives = Math.min(player.maxRevives, player.revives + revivesToAdd);
                    }
                    
                    // Apply rare item drop instantly (silently, no floating text)
                    if (pending.rareDropType) {
                        applyRareDropReward(pending.rareDropType);
                    }
                    
                    // Clear pending rewards
                    window.pendingWaveRewards = null;
                }
                
                if (typeof waveRewardSummary !== 'undefined') waveRewardSummary = null;
                player.tookDamageThisWave = false;
                player.currentWave++;
                
                // Scale wall and crate HP for the new wave
                if (typeof scaleWorldHP === 'function') {
                    scaleWorldHP(player.currentWave);
                }
                
                // Upgrade player ultimate based on wave
                updatePlayerUltimateType(player.currentWave);
                
                if (player.currentWave >= FINAL_WAVE) {
                    // CRITICAL: Call activateFinalWave immediately and return
                    // This prevents any normal wave spawn logic from executing
                    activateFinalWave();
                    return; // Exit early - final wave handles its own spawning
                } else {
                    player.enemiesPerWave = getBaseEnemiesPerWave(player.currentWave);
                    player.totalEnemiesInWave = 0;
                    addFloatText('WAVE ' + player.currentWave + ' START!', player.x, player.y - 80, '#00ff00');
                }
            }
        } else {
            // Normal wave - spawn enemies (NOT for final wave)
            // Skip normal spawning if finalWaveTriggered to prevent spurious spawns
            if (player.currentWave >= FINAL_WAVE || finalWaveTriggered) return;
            
            const totalSpawned = player.totalEnemiesInWave || 0;
            const aliveCap = Math.min(player.enemiesPerWave, MAX_ENEMIES_ON_MAP);
            if (totalSpawned < player.enemiesPerWave && enemies.length < aliveCap) {
                const spawnChance = 0.04 + (player.currentWave * 0.008);
                if (Math.random() < spawnChance * dt) {
                    spawnEnemy();
                    player.totalEnemiesInWave = (player.totalEnemiesInWave || 0) + 1;
                }
            }
            
            // Check if wave is complete (all enemies defeated)
            // Skip wave reward popup if boss was just defeated - victory screen handles this
            if (enemies.length === 0 && player.totalEnemiesInWave >= player.enemiesPerWave && !bossDefeated) {
                // Wave completed - calculate rewards (apply later after popup closes)
                const waveBonus = 200 * player.currentWave;
                
                // Store pending rewards (will be applied when popup closes)
                const pendingRewards = {
                    scoreBonus: waveBonus,
                    maxHpBonus: 0,
                    maxEnergyBonus: 0,
                    coolingBonus: 0,  // Guaranteed cooling efficiency bonus every wave
                    reviveBonus: false,
                    rareDropType: null,
                    rareDropName: null
                };
                
                // WAVE REWARD SCALING FORMULA
                // Small at start, exponentially larger toward end
                // Target cumulative at Wave 12: HP ~5000, Energy ~2500%
                
                const wave = player.currentWave;
                
                // HP Bonus: Uses polynomial growth for steeper late-game curve
                // Wave 1: 20, Wave 6: ~150, Wave 12: ~1200
                // Total after 12 waves: ~5000+ HP
                const hpBonus = Math.floor(20 * Math.pow(wave, 1.8));
                pendingRewards.maxHpBonus = hpBonus;
                
                // Energy Bonus: Uses polynomial growth
                // Wave 1: 15%, Wave 6: ~100%, Wave 12: ~600%
                // Total after 12 waves: ~2500%+ Energy
                const energyBonus = Math.floor(15 * Math.pow(wave, 1.7));
                pendingRewards.maxEnergyBonus = energyBonus;
                
                // COOLING EFFICIENCY BONUS: Guaranteed every wave
                // Small increments that stack - +0.02 per wave (2% improvement)
                // Max capped at 2.0 (100% more efficient cooling)
                const currentCooling = player.coolingEfficiency || 1.0;
                const maxCooling = 2.0;
                if (currentCooling < maxCooling) {
                    // Scale bonus: higher waves give slightly more (+0.02 base + wave * 0.005)
                    const coolingBonus = Math.min(0.02 + wave * 0.005, maxCooling - currentCooling);
                    pendingRewards.coolingBonus = Math.round(coolingBonus * 100) / 100; // Round to 2 decimals
                }
                
                // === MILESTONE WAVE SYSTEM: Wave 3, 6, 9 get REVIVE as the random item drop ===
                // Instead of a separate reward, revive IS the rare drop on milestone waves
                const isMilestoneWave = [3, 6, 9].includes(wave);
                const reviveReward = typeof getWaveReviveReward === 'function' 
                    ? getWaveReviveReward(player.currentWave) 
                    : 0;
                
                if (isMilestoneWave && reviveReward > 0) {
                    // Milestone wave - revive is the random item drop
                    if (player.revives < player.maxRevives) {
                        pendingRewards.reviveBonus = reviveReward;
                        // Set revive as the rare drop display (replaces normal random item)
                        pendingRewards.rareDropType = 'revive';
                        pendingRewards.rareDropName = `Revive Spell ×${reviveReward}`;
                        pendingRewards.rareDropColor = '#ec4899'; // Pink for revive
                    } else {
                        // Player already has max revives - give alternative drop instead
                        pendingRewards.rareDropType = 'shield';
                        pendingRewards.rareDropName = 'Shield Core (MAX Revives)';
                        pendingRewards.rareDropColor = '#3b82f6';
                    }
                } else {
                    // Non-milestone wave - normal random item drop system
                    // ONE rare item drop per wave (excluding HP/Energy/Revive which are already given)
                    // Includes new tiered passive drops with color-coded levels
                    const rareDrops = [
                        { type: 'shield', name: 'Shield Core', color: '#3b82f6', rarity: 'common' },
                        { type: 'armor', name: 'Armor Plate', color: '#78716c', rarity: 'common' },
                        { type: 'turbo', name: 'Turbo Boost', color: '#fb923c', rarity: 'common' },
                        { type: 'magnet', name: 'Magnet Field', color: '#22d3ee', rarity: 'common' },
                        { type: 'autoaim', name: 'Auto-Aim Module', color: '#10b981', rarity: 'very-common' },
                        { type: 'damage', name: 'Damage Boost', color: '#ef4444', rarity: 'uncommon' },
                        { type: 'speed', name: 'Speed Boost', color: '#a3e635', rarity: 'uncommon' },
                        { type: 'dmgmult', name: 'Damage Amplifier', rarity: 'medium-rare', tiered: true },
                        { type: 'cooling', name: 'Cryo Core', rarity: 'medium-rare', tiered: true },
                        { type: 'critical', name: 'Critical Strike', rarity: 'rare', tiered: true },
                        { type: 'lifesteal', name: 'Vampire Core', rarity: 'legendary', tiered: true, minWave: 8 }
                    ];
                    
                // Calculate current levels for each passive FIRST (needed for drop filtering)
                const dmgMultLevel = Math.floor(((player.baseDamageMultiplier || 1) - 1) / 0.15); // 0-10 levels
                const critLevel = Math.floor((player.criticalChance || 0) / 0.08); // 0-4 levels (max 5)
                const coolLevel = Math.floor(((player.coolingEfficiency || 1) - 1) / 0.15); // 0-6 levels (max 7)
                const lifestealLevel = player.lifestealLevel || 0; // 0-5 levels
                    
                // Higher waves unlock better drops with rarity-based selection
                let availableDrops = [];
                
                // Very common: auto-aim (TRIPLE chance - more frequent than HP/energy)
                if (wave >= 1) {
                    availableDrops.push(...rareDrops.filter(d => d.rarity === 'very-common'));
                    availableDrops.push(...rareDrops.filter(d => d.rarity === 'very-common'));
                    availableDrops.push(...rareDrops.filter(d => d.rarity === 'very-common')); // Triple chance
                }
                
                // Always available: common drops
                availableDrops.push(...rareDrops.filter(d => d.rarity === 'common'));
                
                // Wave 2+: uncommon drops
                if (wave >= 2) {
                    availableDrops.push(...rareDrops.filter(d => d.rarity === 'uncommon'));
                }
                
                // Wave 4+: medium-rare drops (damage multiplier, cooling)
                // Only add if player hasn't reached max level
                if (wave >= 4) {
                    const mediumRareItems = rareDrops.filter(d => d.rarity === 'medium-rare');
                    for (const item of mediumRareItems) {
                        // Check max level for each tiered passive
                        if (item.type === 'dmgmult' && dmgMultLevel >= 10) continue; // Max level 10
                        if (item.type === 'cooling' && coolLevel >= 7) continue; // Max level 7
                        availableDrops.push(item);
                    }
                }
                
                // Wave 6+: rare drops (critical hit) - only if not max level
                if (wave >= 6 && critLevel < 5) {
                    availableDrops.push(...rareDrops.filter(d => d.rarity === 'rare'));
                }
                
                // Wave 8+: legendary drops (lifesteal - very rare)
                if (wave >= 8) {
                    // Only add lifesteal if player doesn't already have max level
                    const lifestealDrops = rareDrops.filter(d => d.rarity === 'legendary' && (!d.minWave || wave >= d.minWave));
                    if ((player.lifestealLevel || 0) < 5) {
                        availableDrops.push(...lifestealDrops);
                    }
                }
                
                // Smart rarity: reduce chance of passive items based on current level
                // Each level owned makes the next drop exponentially harder to get
                // This creates meaningful progression where early drops are easier
                // (levels already calculated above for drop filtering)
                
                // Exponential penalty: each level reduces chance by ~25-40%
                // Level 0: 100% chance, Level 1: 60%, Level 2: 36%, Level 3: 22%, Level 4: 13%, Level 5: 8%
                const dmgMultPenalty = 1 - Math.pow(0.6, dmgMultLevel);
                const critPenalty = 1 - Math.pow(0.55, critLevel);
                const coolPenalty = 1 - Math.pow(0.6, coolLevel);
                const lifestealPenalty = 1 - Math.pow(0.5, lifestealLevel); // Hardest to stack
                
                // Weight selection toward rarer items at higher waves (with smart penalties)
                let selectedDrop;
                const rareRoll = Math.random();
                
                // Legendary drop (lifesteal) - base 12% at wave 8+, heavily reduced by current level
                const baseLegendaryChance = 0.12;
                const effectiveLegendaryChance = Math.max(0.01, baseLegendaryChance * (1 - lifestealPenalty));
                if (wave >= 8 && rareRoll < effectiveLegendaryChance && lifestealLevel < 5) {
                    const legendaryItems = availableDrops.filter(d => d.rarity === 'legendary');
                    if (legendaryItems.length > 0) {
                        selectedDrop = legendaryItems[Math.floor(Math.random() * legendaryItems.length)];
                    }
                }
                
                // Rare drop (critical) - base 20% at wave 6+, reduced by current level
                if (!selectedDrop) {
                    const baseRareChance = 0.20;
                    const effectiveRareChance = Math.max(0.02, baseRareChance * (1 - critPenalty));
                    if (wave >= 6 && rareRoll < effectiveRareChance && critLevel < 5) {
                        const rareItems = availableDrops.filter(d => d.rarity === 'rare');
                        selectedDrop = rareItems.length > 0 ? rareItems[Math.floor(Math.random() * rareItems.length)] : null;
                    }
                }
                
                // Medium-rare drop (dmgmult, cooling) - base 40% at wave 4+, reduced by current levels
                if (!selectedDrop) {
                    const baseMediumRareChance = 0.40;
                    const combinedPenalty = Math.max(dmgMultPenalty, coolPenalty);
                    const effectiveMediumRareChance = Math.max(0.05, baseMediumRareChance * (1 - combinedPenalty));
                    if (wave >= 4 && rareRoll < effectiveMediumRareChance) {
                        // Filter to only include passives that aren't maxed
                        let mediumRareItems = availableDrops.filter(d => d.rarity === 'medium-rare');
                        // Prefer the one with lower level
                        if (dmgMultLevel > coolLevel && coolLevel < 7) {
                            mediumRareItems = mediumRareItems.filter(d => d.type === 'cooling');
                        } else if (coolLevel > dmgMultLevel && dmgMultLevel < 10) {
                            mediumRareItems = mediumRareItems.filter(d => d.type === 'dmgmult');
                        }
                        selectedDrop = mediumRareItems.length > 0 ? mediumRareItems[Math.floor(Math.random() * mediumRareItems.length)] : null;
                    }
                }
                
                // Default: random from available drops
                if (!selectedDrop) {
                    selectedDrop = availableDrops[Math.floor(Math.random() * availableDrops.length)];
                }
                
                // Determine tier color for tiered passive items (dmgmult, critical, cooling, lifesteal)
                let dropColor = selectedDrop.color;
                if (selectedDrop.tiered) {
                    dropColor = getTieredDropColor(selectedDrop.type, player);
                }
                
                pendingRewards.rareDropType = selectedDrop.type;
                pendingRewards.rareDropName = selectedDrop.name;
                pendingRewards.rareDropColor = dropColor;
                } // End of else block for non-milestone waves
                
                player.consecutiveWaves = (player.consecutiveWaves || 0) + 1;
                const perfectWave = !player.tookDamageThisWave;
                player.tookDamageThisWave = false;
                if (perfectWave) {
                    player.perfectWaveCount = (player.perfectWaveCount || 0) + 1;
                }
                if (typeof checkAchievements === 'function') {
                    const achievementPayload = {
                        waves: player.consecutiveWaves,
                        waveStreak: player.consecutiveWaves,
                        score,
                        perfectWaveCount: player.perfectWaveCount
                    };
                    if (perfectWave) achievementPayload.perfectWave = true;
                    checkAchievements(achievementPayload);
                }

                // Create reward summary for popup display (calculate only, don't apply yet)
                const rewardSummary = calculateWaveIntermissionRewards();
                rewardSummary.scoreBonus = waveBonus;
                rewardSummary.maxHpBonus = pendingRewards.maxHpBonus;
                rewardSummary.maxEnergyBonus = pendingRewards.maxEnergyBonus;
                rewardSummary.coolingBonus = pendingRewards.coolingBonus;  // Cooling efficiency bonus for popup display
                rewardSummary.reviveBonus = pendingRewards.reviveBonus;
                rewardSummary.reviveReward = typeof getWaveReviveReward === 'function' 
                    ? getWaveReviveReward(player.currentWave) 
                    : 0;
                rewardSummary.perfectWave = perfectWave;
                rewardSummary.waveNumber = player.currentWave;
                
                // Store rare drop info in summary for popup display
                rewardSummary.rareDropType = pendingRewards.rareDropType;
                rewardSummary.rareDropName = pendingRewards.rareDropName;
                rewardSummary.rareDropColor = pendingRewards.rareDropColor;
                
                // Store pending rewards globally
                if (typeof window !== 'undefined') {
                    window.pendingWaveRewards = pendingRewards;
                    // Store HP/Energy restore amounts from summary
                    window.pendingWaveRewards.hpRestore = rewardSummary.hp || 0;
                    window.pendingWaveRewards.energyRestore = rewardSummary.energy || 0;
                    window.pendingWaveRewards.reviveGranted = rewardSummary.reviveGranted || false;
                }
                
                if (typeof waveRewardSummary !== 'undefined') waveRewardSummary = rewardSummary;
                
                // Start wave transition with 10 second cooldown
                waveTransition = true;
                waveTransitionTimer = WAVE_INTERMISSION_FRAMES; // 10 seconds at 60fps
                // Blur canvas and all HUD elements during intermission
                if (typeof CANVAS !== 'undefined' && CANVAS) CANVAS.classList.add('wave-blur');
                if (typeof document !== 'undefined' && document.body) document.body.classList.add('intermission-blur');
            }
        }
        
        // Boss only spawns in final wave (wave 12)
        // Removed automatic boss spawn at 100 kills
    }

    if (finalWaveTriggered) {
        handleFinalWaveEscorts(dt);
    }
}

// NOTE: checkWall() is now defined in world.js (loaded before this file)
// This ensures it's available for systems.js which also loads before gameplay.js

function activateFinalWave(force = false) {
    if (finalWaveTriggered && !force) return;
    finalWaveTriggered = true;
    waveTransition = false;
    waveTransitionTimer = 0;
    bossSpawned = false;
    bossActive = false;
    player.currentWave = FINAL_WAVE;
    currentWave = FINAL_WAVE;
    player.enemiesPerWave = 0;
    player.totalEnemiesInWave = 0;
    
    // Clear any existing float texts to prevent stacking
    if (typeof floatText !== 'undefined') floatText.length = 0;
    
    // Dramatic boss arrival announcement - single elegant message
    setTimeout(() => {
        addFloatText('⚠ OMEGA DESTROYER INCOMING ⚠', WORLD_W / 2, WORLD_H / 2 - 100, '#ff0000', true);
    }, 100);
    
    enemies.length = 0;
    finalWaveEscortTimer = FINAL_WAVE_ESCORT_INITIAL_DELAY;
    startBossFight({ finalWave: true });
    spawnFinalWaveEscorts(FINAL_WAVE_ESCORT_SPAWN);
}

function spawnFinalWaveEscorts(count = FINAL_WAVE_ESCORT_SPAWN) {
    if (!boss || count <= 0) return;
    
    // Minimum distance from player to prevent spawning near player
    const MIN_PLAYER_DISTANCE = 300;
    
    // Spawn escorts evenly distributed around boss (not random angles)
    for (let i = 0; i < count; i++) {
        // Distribute escorts evenly around boss (5 escorts = 72 degrees apart)
        const baseAngle = (Math.PI * 2 / count) * i + Math.random() * 0.3;
        // Try multiple positions to avoid spawning on walls/crates
        let spawnPos = null;
        
        // First pass: Try to spawn at ideal distance from boss (tight formation)
        for (let attempt = 0; attempt < 30; attempt++) {
            const angle = baseAngle + (attempt > 0 ? (Math.random() - 0.5) * 1.2 : 0);
            // Spawn closer to boss (tight formation), increase distance on retry
            const orbit = boss.radius + 120 + Math.random() * 40 + attempt * 15;
            const testX = Math.min(Math.max(boss.x + Math.cos(angle) * orbit, 100), WORLD_W - 100);
            const testY = Math.min(Math.max(boss.y + Math.sin(angle) * orbit, 100), WORLD_H - 100);
            
            // CRITICAL: Check distance from player - never spawn close to player
            const distToPlayer = Math.hypot(testX - player.x, testY - player.y);
            if (distToPlayer < MIN_PLAYER_DISTANCE) continue;
            
            // Check if position is valid (no collision with walls or crates)
            if (canOccupy(testX, testY, 30)) {
                spawnPos = { x: testX, y: testY };
                break;
            }
        }
        
        // Fallback: Try wider area around boss but ALWAYS relative to boss position
        // Never use findSafeSpot which could place enemy anywhere on map
        if (!spawnPos) {
            for (let fallbackAttempt = 0; fallbackAttempt < 20; fallbackAttempt++) {
                const angle = Math.random() * Math.PI * 2;
                const orbit = boss.radius + 200 + Math.random() * 150;
                const testX = Math.min(Math.max(boss.x + Math.cos(angle) * orbit, 100), WORLD_W - 100);
                const testY = Math.min(Math.max(boss.y + Math.sin(angle) * orbit, 100), WORLD_H - 100);
                
                // Check distance from player
                const distToPlayer = Math.hypot(testX - player.x, testY - player.y);
                if (distToPlayer < MIN_PLAYER_DISTANCE) continue;
                
                if (canOccupy(testX, testY, 30)) {
                    spawnPos = { x: testX, y: testY };
                    break;
                }
            }
        }
        
        // Last resort fallback - spawn directly at boss position offset
        // This ensures escort always spawns near boss, never near player
        if (!spawnPos) {
            const angle = baseAngle;
            const fallbackX = boss.x + Math.cos(angle) * (boss.radius + 150);
            const fallbackY = boss.y + Math.sin(angle) * (boss.radius + 150);
            spawnPos = { 
                x: Math.min(Math.max(fallbackX, 100), WORLD_W - 100), 
                y: Math.min(Math.max(fallbackY, 100), WORLD_H - 100) 
            };
        }
        
        const escort = spawnEnemy({ tierId: FINAL_ENEMY_TIER, position: spawnPos, escort: true });
        if (escort) {
            escort.guardPoint = { x: boss.x, y: boss.y };
            escort.patrolPoint = createPatrolWaypoint(escort.guardPoint, 150);
            escort.escortOrbit = baseAngle;
        }
    }
}

function handleFinalWaveEscorts(dt) {
    if (!bossActive || !boss) return;
    if (typeof finalWaveEscortTimer !== 'number') finalWaveEscortTimer = FINAL_WAVE_ESCORT_RESPAWN_FRAMES;
    finalWaveEscortTimer = Math.max(0, finalWaveEscortTimer - dt);
    const aliveEscorts = enemies.reduce((total, enemy) => total + (enemy.isFinalEscort ? 1 : 0), 0);
    const needsEscort = aliveEscorts < FINAL_WAVE_ESCORT_CAP;
    if (needsEscort && finalWaveEscortTimer <= 0) {
        const spawnCount = Math.min(FINAL_WAVE_ESCORT_SPAWN, FINAL_WAVE_ESCORT_CAP - aliveEscorts);
        spawnFinalWaveEscorts(spawnCount);
        finalWaveEscortTimer = FINAL_WAVE_ESCORT_RESPAWN_FRAMES;
    }
}

// NOTE: checkCrate() is now defined in world.js (loaded before this file)
// This ensures it's available for systems.js which also loads before gameplay.js

// Line-of-sight sampling prevents enemies from shooting through cover.
function checkLineOfSight(x1, y1, x2, y2) {
    let dist = Math.hypot(x2 - x1, y2 - y1);
    let steps = dist / 40;
    let dx = (x2 - x1) / steps;
    let dy = (y2 - y1) / steps;
    for (let i = 1; i < steps; i++) {
        let cx = x1 + dx * i;
        let cy = y1 + dy * i;
        if (checkWall(cx, cy, 10) || checkCrate(cx, cy, 10)) return false;
    }
    return true;
}

function canOccupy(x, y, radius) {
    // Check river boundary - tanks cannot enter water
    const riverBoundary = typeof RIVER_BOUNDARY !== 'undefined' ? RIVER_BOUNDARY : 90;
    if (x - radius < riverBoundary || x + radius > WORLD_W - riverBoundary ||
        y - radius < riverBoundary || y + radius > WORLD_H - riverBoundary) {
        return false;
    }
    return !checkWall(x, y, radius) && !checkCrate(x, y, radius);
}

// Applies end-of-wave resupply bonuses and returns data for the HUD summary card.
// Calculate wave intermission rewards WITHOUT applying them
// Actual application happens after popup closes (in waveTransition completion)
// NOTE: HP and Energy restore REMOVED - only milestone revives remain
function calculateWaveIntermissionRewards() {
    const currentWave = player.currentWave || 1;
    const summary = {
        wave: currentWave,
        hp: 0, // HP restore removed from wave rewards
        energy: 0, // Energy restore removed from wave rewards
        reviveGranted: false,
        reviveReward: typeof getWaveReviveReward === 'function' 
            ? getWaveReviveReward(currentWave) 
            : 0
    };

    // HP and Energy restore removed - players must use item drops to heal
    // This makes gameplay more challenging and strategic

    // Check milestone revive reward (Wave 3, 6, 9)
    if (summary.reviveReward > 0 && player.revives < player.maxRevives) {
        summary.reviveGranted = true;
    }

    return summary;
}

// Get tiered color based on current passive level
function getTieredDropColor(dropType, player) {
    const tierColors = {
        bronze: '#cd7f32',
        silver: '#c0c0c0', 
        gold: '#ffd700',
        legendary: '#ff4d94' // Pink for legendary lifesteal
    };
    
    let currentLevel = 0;
    switch (dropType) {
        case 'dmgmult':
            // 1.0 -> 1.15 -> 1.30 -> 1.45 -> ... -> 2.5
            currentLevel = Math.floor(((player.baseDamageMultiplier || 1) - 1) / 0.15);
            break;
        case 'critical':
            // 0 -> 0.08 -> 0.16 -> 0.24 -> 0.35
            currentLevel = Math.floor((player.criticalChance || 0) / 0.08);
            break;
        case 'cooling':
            // 1.0 -> 1.15 -> 1.30 -> 1.45 -> ... -> 2.0
            currentLevel = Math.floor(((player.coolingEfficiency || 1) - 1) / 0.15);
            break;
        case 'lifesteal':
            // 0 -> 1 -> 2 -> 3 -> 4 -> 5 (levels)
            currentLevel = player.lifestealLevel || 0;
            if (currentLevel >= 4) return tierColors.legendary; // Max level = legendary pink
            break;
    }
    
    // Tier based on current level (what they will get)
    if (currentLevel >= 4) return tierColors.gold;      // High level = gold tier
    if (currentLevel >= 2) return tierColors.silver;    // Medium level = silver tier
    return tierColors.bronze;                            // Low level = bronze tier
}

// Apply rare drop reward from wave completion (silently, no floating text)
function applyRareDropReward(dropType) {
    switch (dropType) {
        case 'shield':
            // Activate or restore shield
            if (!player.shieldActive) {
                player.shieldActive = true;
                player.shieldHp = 150;
            } else {
                player.shieldHp = Math.min(150, (player.shieldHp || 0) + 75);
            }
            break;
            
        case 'armor':
            // ARMOR SYSTEM: 15% of max HP per drop, stackable to 75% of max HP
            const armorPerDrop = Math.ceil(player.maxHp * 0.15);
            const maxArmorCap = Math.ceil(player.maxHp * 0.75);
            player.armor = Math.min((player.armor || 0) + armorPerDrop, maxArmorCap);
            player.maxArmor = maxArmorCap;
            break;
            
        case 'turbo':
            // Add turbo charge
            player.turboCharges = Math.min(3, (player.turboCharges || 0) + 1);
            break;
            
        case 'magnet':
            // Activate magnet field for 10 seconds
            player.magnetActive = true;
            player.magnetTime = Math.max(player.magnetTime || 0, 600); // 10 seconds
            player.magnetRange = player.magnetRange || 480;
            break;
            
        case 'lifesteal':
            // Permanent lifesteal passive (levels 1-5, each level adds 5%)
            // Level 1: 5%, Level 2: 10%, Level 3: 15%, Level 4: 20%, Level 5: 25%
            player.lifestealLevel = Math.min(5, (player.lifestealLevel || 0) + 1);
            player.lifesteal = player.lifestealLevel * 0.05; // 5% per level
            break;
            
        case 'autoaim':
            // Add auto-aim shots (stackable to 100)
            player.autoAim = true;
            player.autoAimShots = Math.min(100, (player.autoAimShots || 0) + 20);
            player.autoAimMaxShots = 100;
            break;
            
        case 'damage':
            // Temporary damage boost for 10 seconds
            player.damageBoostTime = Math.max(player.damageBoostTime || 0, 600); // 10 seconds
            player.damageMultiplier = Math.max(player.damageMultiplier || 1, 1.5);
            break;
            
        case 'speed':
            // Temporary speed boost for 10 seconds
            player.speedBoostTime = Math.max(player.speedBoostTime || 0, 600); // 10 seconds
            break;
            
        case 'dmgmult':
            // Permanent damage multiplier increase (stacks up to 2.5x)
            player.baseDamageMultiplier = Math.min(2.5, (player.baseDamageMultiplier || 1.0) + 0.15);
            break;
            
        case 'critical':
            // Permanent critical hit chance increase (stacks up to 35%)
            player.criticalChance = Math.min(0.35, (player.criticalChance || 0) + 0.08);
            // Set critical damage multiplier if not set
            if (!player.criticalDamage) player.criticalDamage = 2.5;
            break;
            
        case 'cooling':
            // Permanent cooling efficiency increase (stacks up to 2.0x = 100% faster cooling)
            player.coolingEfficiency = Math.min(2.0, (player.coolingEfficiency || 1.0) + 0.15);
            break;
    }
}

// Gentle separation keeps tanks from overlapping without causing sudden teleports.
function resolveTankCollisions() {
    const iterations = 3;
    for (let pass = 0; pass < iterations; pass++) {
        // Separate player from enemies first
        for (let i = 0; i < enemies.length; i++) {
            separateEntities(player, enemies[i], 0.3);
        }
        // Then separate enemies from each other with equal bias
        for (let i = 0; i < enemies.length; i++) {
            for (let j = i + 1; j < enemies.length; j++) {
                separateEntities(enemies[i], enemies[j], 0.5);
            }
        }
        // Separate all tanks from boss (boss is solid and impassable)
        if (typeof boss !== 'undefined' && boss) {
            separateFromBoss(player, 0.0); // Player gets fully pushed away
            for (let i = 0; i < enemies.length; i++) {
                separateFromBoss(enemies[i], 0.0); // Enemies also get pushed away
            }
        }
    }
}

// Separate entity from boss (boss is immovable)
function separateFromBoss(entity, bias = 0.0) {
    if (!entity || !boss) return;
    
    // Skip separation during knockback animation to allow crush contact
    if (entity === player && player.knockbackActive) return;
    
    const bossRadius = boss.radius || 120;
    const entityRadius = entity.radius || player.radius;
    const minDist = bossRadius + entityRadius; // No buffer - direct contact allowed
    
    let dx = entity.x - boss.x;
    let dy = entity.y - boss.y;
    let dist = Math.hypot(dx, dy);
    
    if (dist === 0) {
        const randomAngle = Math.random() * Math.PI * 2;
        dx = Math.cos(randomAngle);
        dy = Math.sin(randomAngle);
        dist = 0.001;
    }
    
    if (dist >= minDist) return;
    
    const overlap = minDist - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    
    // Push entity away from boss (boss doesn't move)
    const pushAmount = overlap * 1.0; // Full push amount for instant separation
    const newX = entity.x + nx * pushAmount;
    const newY = entity.y + ny * pushAmount;
    
    // Check if new position is valid before moving
    const riverBoundary = typeof RIVER_BOUNDARY !== 'undefined' ? RIVER_BOUNDARY : 90;
    if (newX > riverBoundary && newX < WORLD_W - riverBoundary &&
        newY > riverBoundary && newY < WORLD_H - riverBoundary &&
        !checkWall(newX, newY, entityRadius) && !checkCrate(newX, newY, entityRadius)) {
        entity.x = newX;
        entity.y = newY;
    }
}

// Minimum separation distance constants for cleaner tank formations
const TANK_MIN_SEPARATION = 85; // Minimum distance tanks should maintain
const TANK_SOFT_REPULSION_ZONE = 120; // Zone where soft repulsion starts

function separateEntities(a, b, bias = 0.5) {
    if (!a || !b) return;
    const radiusA = a.radius || player.radius;
    const radiusB = b.radius || player.radius;
    const hardMinDist = (radiusA + radiusB) * 1.05; // Hard collision - instant separation
    const softMinDist = TANK_SOFT_REPULSION_ZONE; // Soft zone - gradual push
    
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let dist = Math.hypot(dx, dy);
    if (dist === 0) {
        const randomAngle = Math.random() * Math.PI * 2;
        dx = Math.cos(randomAngle);
        dy = Math.sin(randomAngle);
        dist = 0.001;
    }
    
    // Skip if far enough apart
    if (dist >= softMinDist) return;

    const nx = dx / dist;
    const ny = dy / dist;
    
    let pushStrength = 0;
    
    if (dist < hardMinDist) {
        // Hard overlap - strong immediate separation
        const overlap = hardMinDist - dist;
        pushStrength = overlap * 0.5;
    } else if (dist < softMinDist) {
        // Soft zone - gradual push to maintain cleaner spacing
        // Strength increases as tanks get closer
        const softOverlap = softMinDist - dist;
        const ratio = softOverlap / (softMinDist - hardMinDist);
        pushStrength = ratio * 1.5; // Gentle push
    }
    
    if (pushStrength <= 0) return;
    
    const pushA = pushStrength * bias;
    const pushB = pushStrength * (1 - bias);
    const movedA = attemptShift(a, -nx * pushA, -ny * pushA);
    const movedB = attemptShift(b, nx * pushB, ny * pushB);

    // If both failed, try again with reduced push
    if (!movedA && !movedB) {
        attemptShift(a, -nx * pushA * 0.3, -ny * pushA * 0.3);
        attemptShift(b, nx * pushB * 0.3, ny * pushB * 0.3);
    }
}

function attemptShift(entity, dx, dy) {
    if (!entity) return false;
    const radius = entity.radius || player.radius;
    const targetX = entity.x + dx;
    const targetY = entity.y + dy;
    if (canOccupy(targetX, targetY, radius)) {
        entity.x = targetX;
        entity.y = targetY;
        return true;
    }
    if (dx !== 0 && canOccupy(entity.x + dx, entity.y, radius)) {
        entity.x += dx;
        return true;
    }
    if (dy !== 0 && canOccupy(entity.x, entity.y + dy, radius)) {
        entity.y += dy;
        return true;
    }
    const reducedX = entity.x + dx * 0.4;
    const reducedY = entity.y + dy * 0.4;
    if (canOccupy(reducedX, reducedY, radius)) {
        entity.x = reducedX;
        entity.y = reducedY;
        return true;
    }
    return false;
}

const HEAT_EFFECT_STATES = [
    { max: 0.25, name: 'Cryo Stability' },
    { max: 0.45, name: 'Thermal Whisper' },
    { max: 0.65, name: 'Heat Bloom' },
    { max: 0.85, name: 'Inferno Drift' },
    { max: 1.0, name: 'Critical Surge' }
];

// Temperature penalties now stay mild at mid heat and spike sharply near 95°C.
function getHeatProfile(rawRatio) {
    const clamped = Math.max(0, Math.min(1, rawRatio));
    const rampStart = 0.5; // Start penalty at 50% heat (60°C) for more noticeable effect
    const normalized = Math.max(0, clamped - rampStart) / (1 - rampStart || 1);
    const eased = normalized * normalized; // Quadratic easing - smoother ramp
    const baseline = Math.pow(clamped, 1.2) * 0.08; // Stronger baseline drag
    const surgeBoost = Math.max(0, (clamped - 0.85) / 0.15); // Start surge earlier at 85%
    const penalty = Math.min(1, baseline + eased * 0.85 + surgeBoost * 0.5);
    let tier = HEAT_EFFECT_STATES[HEAT_EFFECT_STATES.length - 1];
    for (const candidate of HEAT_EFFECT_STATES) {
        if (clamped <= candidate.max) {
            tier = candidate;
            break;
        }
    }
    return {
        penalty,
        severity: clamped,
        name: tier.name
    };
}

// Fire weapon consumes energy, spawns projectile archetypes, and applies recoil
// so each weapon class retains a unique personality.
// Returns true if weapon fired successfully, false otherwise
function fireWeapon() {
    // Block firing if overheated - must wait for energy to recover to at least 100
    // This prevents any firing until the overheat recovery threshold is met
    if (player.overheated) {
        return false;
    }
    
    const tempRange = player.maxTemperature - player.baseTemperature || 1;
    const heatRatio = Math.max(0, Math.min(1, (player.temperature - player.baseTemperature) / tempRange));
    const heatProfile = getHeatProfile(heatRatio);
    const heatPenalty = heatProfile.penalty;

    if (player.temperature >= player.maxTemperature) {
        if (!player.thermalLocked) addFloatText('THERMAL LOCK', player.x, player.y - 50, '#ff5722');
        player.thermalLocked = true;
        return false;
    }

    // Base fire rate multiplier from heat
    let fireRateMultiplier = 1 + heatPenalty * 4; // Up to 5x delay at max heat
    // Berserker mode reduces fire delay (faster shooting)
    if (player.berserkerActive && player.berserkerTime > 0) {
        fireRateMultiplier /= (player.berserkerFireRateMult || 2.0);
    }
    const adjustedDelay = WEAPONS[player.weapon].delay * fireRateMultiplier;
    
    // Check fire rate delay (frame-based cooldown with temperature penalty)
    if (frame - lastShot < adjustedDelay) return false;
    
    // Mobile fire rate limiter: prevent spam on touch devices
    // fireDelay is decremented every frame, not inside fireWeapon
    if (player.fireDelay > 0) {
        return false;
    }
    
    // Check energy cost
    const wStats = WEAPONS[player.weapon];
    const efficiencyProfile = typeof getWeaponEfficiencyScaling === 'function'
        ? getWeaponEfficiencyScaling(player.weapon)
        : { efficiency: 1, damage: 1 };
    const tierEfficiency = Math.max(0.01, efficiencyProfile.efficiency || 1);
    const tierDamageBonus = efficiencyProfile.damage || 1;
    const energyCost = Math.max(1, Math.round((wStats?.cost || 0) / tierEfficiency));
    if (player.energy >= energyCost) {
        // DEBUG MODE: Skip energy consumption when unlimited energy is enabled
        if (!DEBUG_UNLIMITED_ENERGY) {
            player.energy -= energyCost;
        }
        player.rechargeDelay = 30; // 0.5 second delay at 60fps before energy recharges
    } else {
        // DEBUG MODE: Never overheat with unlimited energy
        if (DEBUG_UNLIMITED_ENERGY) {
            // Allow firing even with low energy
        } else {
            player.overheated = true;
            // Dramatic temperature spike when overheating (skip if debug no temperature)
            if (!DEBUG_NO_TEMPERATURE) {
                player.temperature = Math.min(100, player.temperature + 15);
            }
            addFloatText('OVERHEAT', player.x, player.y, 'red');
            return false;
        }
    }
    lastShot = frame;
    
    // Set fire delay after successful shot (mobile fire rate limiter)
    // Heat penalty increases delay between shots
    const heatBasedDelay = Math.round((player.currentHeatPenalty || 0) * 15);
    player.fireDelay = Math.max(5, heatBasedDelay); // Minimum 5 frames between shots
    
    // Temperature system: Firing heats up the tank
    const HEAT_PER_SHOT = {
        'cannon': 3.2,
        'spread': 5.5,
        'twin': 4.2,
        'burst': 6.5,
        'flak': 8,
        'pierce': 10,
        'sniper': 2.5,
        'mg': 1.5,
        'rocket': 6.5,
        'ice': 1.0,     // Ice weapons generate less heat
        'fire': 11,     // Fire weapons generate more heat
        'electric': 4.8
    };
    const heatGainMultiplier = 0.85 + heatRatio * 0.45 + (player.overheated ? 0.2 : 0);
    const baseHeat = HEAT_PER_SHOT[player.weapon] || 4;
    // Apply cooling efficiency to reduce heat gain from shots
    // Higher coolingEfficiency = less heat buildup per shot
    const coolingEfficiencyMod = player.coolingEfficiency || 1.0;
    const heatGain = (baseHeat * heatGainMultiplier) / coolingEfficiencyMod;
    // DEBUG MODE: Skip temperature increase when no temperature mode is enabled
    if (!DEBUG_NO_TEMPERATURE) {
        player.temperature = Math.min(100, player.temperature + heatGain);
        player.heatSoakTime = Math.min((player.heatSoakTime || 0) + heatGain * 0.5, 420);
    }
    
    // Recoil buildup system - continuous firing makes turret unstable
    // Track consecutive shots for accumulating recoil
    if (!player.consecutiveShots) player.consecutiveShots = 0;
    if (!player.lastShotTime) player.lastShotTime = 0;
    
    // If shooting within 1 second, accumulate recoil
    if (frame - player.lastShotTime < 60) {
        player.consecutiveShots++;
    } else {
        player.consecutiveShots = 1; // Reset if pause between shots
    }
    player.lastShotTime = frame;
    
    // Apply accuracy error to turret angle BEFORE firing
    // Add instability based on consecutive shots (recoil buildup)
    const recoilInstability = Math.min(player.consecutiveShots * 0.025, 0.18); // Increased from 0.02/0.15
    // Base accuracy error - tanks always have some natural inaccuracy
    const baseAccuracyError = 0.04; // ~2.3 degrees base error even at cold temp
    // Temperature accuracy penalty: increases spread significantly at high heat
    // heatPenalty ranges 0-1, this gives up to ~23 degrees of error at max heat
    const tempAccuracyPenalty = heatPenalty * 0.4;
    // Additional random shake at high temperatures (jitter effect)
    const heatJitter = heatPenalty > 0.3 ? (Math.random() - 0.5) * heatPenalty * 0.15 : 0;
    let totalInstability = baseAccuracyError + recoilInstability + tempAccuracyPenalty + heatJitter;
    
    // AUTO-AIM ACCURACY BONUS: 50% reduction in spread/instability when auto-aiming
    // Computer-assisted targeting provides enhanced stability
    if (currentShotIsAutoAim) {
        totalInstability *= (1 - AUTO_AIM_ACCURACY_BONUS); // 50% reduction
    }
    
    const accurateAngle = applyWeaponAccuracy(player.turretAngle, player.weapon, false, 1, currentShotIsAutoAim) + (Math.random() - 0.5) * totalInstability;
    player.turretAngle = accurateAngle;
    
    // Set recoil recovery time - increased at higher temperatures
    // Hot tank takes longer to stabilize turret
    const baseRecoveryTime = 18;
    const heatRecoveryPenalty = Math.floor(heatPenalty * 12); // Up to +12 frames at max heat
    player.recoilRecoveryTime = baseRecoveryTime + heatRecoveryPenalty;
    
    // Apply recoil kick with temperature multiplier (higher temp = more recoil)
    const baseRecoil = getWeaponRecoilValue(player.weapon);
    const tempRecoilMultiplier = 1.0 + heatPenalty * 1.5; // up to 2.5x at max heat (was 2.25x)
    player.recoil = baseRecoil * tempRecoilMultiplier;
    
    // Store current heat penalty for visual feedback
    player.currentHeatPenalty = heatPenalty;
    
    // PER-WEAPON KICKBACK PROFILES - Each weapon has unique kickback characteristics
    // Different weapons create different recoil patterns: sharp/sustained, vertical/horizontal, etc.
    const weaponKickbackProfiles = {
        // Standard weapons - balanced kickback
        'cannon': { 
            multiplier: 1.6,      // Base kickback strength
            verticalBias: 0.15,   // Slight upward kick
            decay: 0.70,          // Standard recovery
            shake: 3, 
            flashSize: 1.0 
        },
        'twin': { 
            multiplier: 1.2,      // Lighter per-shot due to rapid fire
            verticalBias: 0.08,   // Minimal vertical
            decay: 0.65,          // Faster recovery for continuous fire
            shake: 2, 
            flashSize: 0.8 
        },
        // Heavy impact weapons - strong single kick
        'shotgun': { 
            multiplier: 2.8,      // Heavy spread creates strong kickback
            verticalBias: 0.25,   // Noticeable upward jump
            decay: 0.60,          // Quick recovery after blast
            shake: 5, 
            flashSize: 1.5 
        },
        'sniper': { 
            multiplier: 3.5,      // Massive single shot recoil
            verticalBias: 0.35,   // Strong vertical component
            decay: 0.55,          // Longer to stabilize
            shake: 8, 
            flashSize: 2.0 
        },
        'burst': { 
            multiplier: 1.4,      // Light per-burst kick
            verticalBias: 0.12,   // Controlled vertical climb
            decay: 0.68,          // Medium recovery
            shake: 2, 
            flashSize: 0.7 
        },
        'flak': { 
            multiplier: 2.4,      // Explosive shells = strong kick
            verticalBias: 0.22,   // Upward with side torque
            decay: 0.62,          // Fairly quick reset
            shake: 4, 
            flashSize: 1.3 
        },
        // Explosive/heavy weapons - sustained heavy kickback
        'rocket': { 
            multiplier: 3.8,      // Heaviest kickback - rocket launch force
            verticalBias: 0.40,   // Strong upward thrust
            decay: 0.50,          // Slow recovery, feels heavy
            shake: 7, 
            flashSize: 1.8 
        },
        // Energy weapons - minimal physical kickback
        'laser': { 
            multiplier: 0.6,      // Minimal recoil - energy beam
            verticalBias: 0.02,   // Almost none
            decay: 0.85,          // Very fast stabilization
            shake: 1, 
            flashSize: 0.5 
        },
        'gauss': { 
            multiplier: 4.2,      // Extreme electromagnetic pulse kickback
            verticalBias: 0.45,   // Massive vertical component
            decay: 0.48,          // Slowest recovery - devastating power
            shake: 10, 
            flashSize: 2.5 
        },
        // Elemental weapons - unique kickback characteristics
        'ice': { 
            multiplier: 1.8,      // Moderate recoil with cryo effect
            verticalBias: 0.10,   // Slight upward
            decay: 0.72,          // Smooth recovery
            shake: 3, 
            flashSize: 1.0 
        },
        'fire': { 
            multiplier: 2.0,      // Combustion creates moderate kick
            verticalBias: 0.18,   // Fire bursts upward slightly
            decay: 0.65,          // Quick reset for sustained burning
            shake: 3, 
            flashSize: 1.2 
        },
        'electric': { 
            multiplier: 2.2,      // Tesla coil discharge kick
            verticalBias: 0.08,   // Mostly horizontal spread
            decay: 0.70,          // Medium recovery
            shake: 4, 
            flashSize: 1.1 
        }
    };
    
    const kickProfile = weaponKickbackProfiles[player.weapon] || weaponKickbackProfiles['cannon'];
    
    // DRAMATIC VISUAL TURRET RECOIL - turret physically shifts backward when firing
    // Each weapon has unique kickback feel based on its profile
    const recoilStrength = player.recoil * kickProfile.multiplier;
    
    // Calculate kickback with vertical bias (makes heavy weapons feel like they "jump")
    const kickAngle = accurateAngle - Math.PI; // Base: backward direction
    const verticalKick = kickProfile.verticalBias * recoilStrength; // Upward component
    
    player.turretRecoilOffsetX = Math.cos(kickAngle) * recoilStrength;
    player.turretRecoilOffsetY = Math.sin(kickAngle) * recoilStrength - verticalKick;
    
    // Apply weapon-specific decay rate (stored for update loop)
    player.turretRecoilDecay = kickProfile.decay;
    
    const recoilVisual = kickProfile;
    
    // Add weapon-specific screen shake for dramatic effect
    if (!screenShake || screenShake < recoilVisual.shake) {
        screenShake = recoilVisual.shake;
    }
    
    // Calculate muzzle position - bullets ALWAYS spawn from turret tip
    // Use the CURRENT turret angle (already has accuracy applied)
    const muzzleDistance = getMuzzleDistanceFromRecoil(player.recoil, 35);
    let ax = player.x + Math.cos(player.turretAngle) * muzzleDistance;
    let ay = player.y + Math.sin(player.turretAngle) * muzzleDistance;
    
    // Bullets fire in EXACT turret direction (no additional spread)
    const firedAngle = player.turretAngle;
    
    // DRAMATIC MUZZLE FLASH - universal for all weapons
    // Creates intense flash with core burst, smoke ring, and sparks
    const flashSize = recoilVisual.flashSize || 1.0;
    const flashColors = {
        'cannon': ['#ffaa00', '#ff6600', '#ffcc44'],
        'twin': ['#44ff88', '#22cc55', '#88ffaa'],
        'shotgun': ['#ff44ff', '#cc22cc', '#ff88ff'],
        'sniper': ['#ffffff', '#dddddd', '#00ffff'],
        'burst': ['#ffdd00', '#ffaa00', '#ffff44'],
        'flak': ['#ff8844', '#aa4400', '#ffaa66'],
        'rocket': ['#ff3300', '#ff6600', '#ff0000'],
        'laser': ['#00ffff', '#00cccc', '#44ffff'],
        'gauss': ['#aa44ff', '#8822dd', '#cc88ff'],
        'ice': ['#44aaff', '#2288ff', '#88ccff'],
        'fire': ['#ff4400', '#ff8800', '#ffcc00'],
        'electric': ['#ffff00', '#aaaa00', '#ffff88']
    };
    const muzzleColors = flashColors[player.weapon] || flashColors.cannon;
    
    // Core flash burst (bright center)
    for (let i = 0; i < Math.floor(8 * flashSize); i++) {
        const burstAngle = firedAngle + (Math.random() - 0.5) * 0.8;
        const burstSpeed = (8 + Math.random() * 6) * flashSize;
        particles.push({
            x: ax,
            y: ay,
            vx: Math.cos(burstAngle) * burstSpeed + (Math.random() - 0.5) * 3,
            vy: Math.sin(burstAngle) * burstSpeed + (Math.random() - 0.5) * 3,
            life: 8 + Math.random() * 6,
            color: muzzleColors[0],
            size: (4 + Math.random() * 4) * flashSize,
            gravity: 0,
            drag: 0.15
        });
    }
    
    // Smoke ring (expanding outward)
    for (let i = 0; i < Math.floor(6 * flashSize); i++) {
        const smokeAngle = firedAngle + (i / (6 * flashSize)) * Math.PI * 2 * 0.3 - Math.PI * 0.15;
        particles.push({
            x: ax,
            y: ay,
            vx: Math.cos(smokeAngle) * (2 + Math.random() * 2),
            vy: Math.sin(smokeAngle) * (2 + Math.random() * 2),
            life: 20 + Math.random() * 15,
            color: '#666666',
            size: (3 + Math.random() * 3) * flashSize,
            gravity: -0.02,
            drag: 0.05
        });
    }
    
    // Hot sparks (scattered)
    for (let i = 0; i < Math.floor(4 * flashSize); i++) {
        particles.push({
            x: ax + (Math.random() - 0.5) * 6,
            y: ay + (Math.random() - 0.5) * 6,
            vx: Math.cos(firedAngle) * (4 + Math.random() * 8) + (Math.random() - 0.5) * 6,
            vy: Math.sin(firedAngle) * (4 + Math.random() * 8) + (Math.random() - 0.5) * 6,
            life: 15 + Math.random() * 10,
            color: muzzleColors[2],
            size: 1 + Math.random() * 2,
            gravity: 0.08,
            drag: 0.02
        });
    }
    
    let speed = wStats.speed;
    let dmg = wStats.dmg * tierDamageBonus;
    // Apply berserker damage multiplier
    if (player.berserkerActive && player.berserkerTime > 0) {
        dmg *= (player.berserkerDamageMult || 2.5);
    }
    let color = wStats.color;
    const originX = player.x;
    const originY = player.y;

    if (wStats.type === 'spread') {
        for (let i = -2; i <= 2; i++) {
            let a = firedAngle + i * 0.15;
            bullets.push({ x: ax, y: ay, prevX: originX, prevY: originY, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 60, color: color, dmg: dmg, isEnemy: false, type: 'spread' });
        }
        // Shotgun spread muzzle blast
        for (let i = 0; i < 25; i++) {
            particles.push({
                x: ax,
                y: ay,
                vx: Math.cos(firedAngle + (Math.random() - 0.5) * 0.6) * (6 + Math.random() * 5),
                vy: Math.sin(firedAngle + (Math.random() - 0.5) * 0.6) * (6 + Math.random() * 5),
                life: 20 + Math.random() * 15,
                color: i < 10 ? color : '#888888',
                size: Math.random() * 6 + 3,
                gravity: 0,
                drag: 0.1
            });
        }
        screenShake = 2;
    } else if (wStats.type === 'twin') {
        let ox = Math.cos(firedAngle + Math.PI / 2) * 8;
        let oy = Math.sin(firedAngle + Math.PI / 2) * 8;
        // Twin bullets must have type: 'twin' to render with drawTwinBullet() 
        bullets.push({ x: ax + ox, y: ay + oy, prevX: originX, prevY: originY, vx: Math.cos(firedAngle) * speed, vy: Math.sin(firedAngle) * speed, life: 80, color: color, dmg: dmg, isEnemy: false, type: 'twin' });
        bullets.push({ x: ax - ox, y: ay - oy, prevX: originX, prevY: originY, vx: Math.cos(firedAngle) * speed, vy: Math.sin(firedAngle) * speed, life: 80, color: color, dmg: dmg, isEnemy: false, type: 'twin' });
        
        // Enhanced twin cannon muzzle flash - plasma burst effect (same as enemy)
        const twinColors = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'];
        for (let side of [1, -1]) {
            const sideX = ax + ox * side;
            const sideY = ay + oy * side;
            
            // Plasma burst particles from each barrel
            for (let i = 0; i < 10; i++) {
                const particleColor = twinColors[Math.floor(Math.random() * twinColors.length)];
                const spreadAngle = firedAngle + (Math.random() - 0.5) * 0.6;
                const particleSpeed = 8 + Math.random() * 6;
                particles.push({
                    x: sideX,
                    y: sideY,
                    vx: Math.cos(spreadAngle) * particleSpeed,
                    vy: Math.sin(spreadAngle) * particleSpeed,
                    life: 15 + Math.random() * 10,
                    color: particleColor,
                    size: 3 + Math.random() * 4,
                    gravity: 0,
                    drag: 0.12
                });
            }
            
            // Core flash wave
            particles.push({
                x: sideX + Math.cos(firedAngle) * 5,
                y: sideY + Math.sin(firedAngle) * 5,
                vx: Math.cos(firedAngle) * 3,
                vy: Math.sin(firedAngle) * 3,
                life: 8,
                color: '#d1fae5',
                size: 12,
                gravity: 0,
                drag: 0.2
            });
            
            // Spark streaks
            for (let j = 0; j < 4; j++) {
                const sparkAngle = firedAngle + (Math.random() - 0.5) * 1.2;
                particles.push({
                    x: sideX,
                    y: sideY,
                    vx: Math.cos(sparkAngle) * (12 + Math.random() * 8),
                    vy: Math.sin(sparkAngle) * (12 + Math.random() * 8),
                    life: 10 + Math.random() * 6,
                    color: '#ffffff',
                    size: 2,
                    gravity: 0,
                    drag: 0.15
                });
            }
        }
        screenShake = 3;
    } else if (wStats.type === 'burst') {
        const burstOriginX = originX;
        const burstOriginY = originY;
        const burstAngle = firedAngle;
        const burstMuzzle = muzzleDistance;
        
        // Barrel offsets perpendicular to firing direction: center (0), right (+9), left (-9)
        // Matching the triple-barrel turret design - fires center first, then right, then left
        const barrelOffsets = [0, 9, -9];
        const perpAngle = burstAngle + Math.PI / 2; // Perpendicular to firing direction
        
        // Store kickback profile for burst shots
        const burstKickProfile = weaponKickbackProfiles['burst'] || weaponKickbackProfiles['cannon'];
        const burstRecoilBase = player.recoil;
        
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                // Calculate barrel-specific origin with perpendicular offset
                const barrelOffset = barrelOffsets[i];
                const barrelOriginX = burstOriginX + Math.cos(perpAngle) * barrelOffset;
                const barrelOriginY = burstOriginY + Math.sin(perpAngle) * barrelOffset;
                
                // Muzzle position extends from each barrel
                let bx = barrelOriginX + Math.cos(burstAngle) * burstMuzzle;
                let by = barrelOriginY + Math.sin(burstAngle) * burstMuzzle;
                bullets.push({ x: bx, y: by, prevX: barrelOriginX, prevY: barrelOriginY, vx: Math.cos(burstAngle) * speed, vy: Math.sin(burstAngle) * speed, life: 80, color: color, dmg: dmg, isEnemy: false, type: 'burst' });
                
                // Apply kickback per burst shot - each of 3 shots adds recoil
                const burstRecoilStrength = burstRecoilBase * burstKickProfile.multiplier * 0.5; // 50% per shot, 150% total
                const burstKickAngle = player.turretAngle - Math.PI;
                player.turretRecoilOffsetX += Math.cos(burstKickAngle) * burstRecoilStrength;
                player.turretRecoilOffsetY += Math.sin(burstKickAngle) * burstRecoilStrength;
                player.recoil = Math.min(player.recoil + burstRecoilBase * 0.4, burstRecoilBase * 2); // Stack recoil per shot
                
                // Burst muzzle flash per shot
                for (let j = 0; j < 10; j++) {
                    particles.push({
                        x: bx,
                        y: by,
                        vx: Math.cos(burstAngle) * (7 + Math.random() * 5) + (Math.random() - 0.5) * 2,
                        vy: Math.sin(burstAngle) * (7 + Math.random() * 5) + (Math.random() - 0.5) * 2,
                        life: 10 + Math.random() * 8,
                        color: color,
                        size: Math.random() * 4 + 2,
                        gravity: 0,
                        drag: 0.15
                    });
                }
                
                // Screen shake per shot
                screenShake = Math.min((screenShake || 0) + 2, 6);
            }, i * 100);
        }
    } else if (wStats.type === 'flak') {
        bullets.push({ x: ax, y: ay, prevX: originX, prevY: originY, vx: Math.cos(firedAngle) * speed, vy: Math.sin(firedAngle) * speed, life: 100, color: color, dmg: dmg, isEnemy: false, type: 'flak' });
        // Flak heavy artillery blast
        for (let i = 0; i < 20; i++) {
            particles.push({
                x: ax,
                y: ay,
                vx: Math.cos(firedAngle + (Math.random() - 0.5) * 0.4) * (5 + Math.random() * 6),
                vy: Math.sin(firedAngle + (Math.random() - 0.5) * 0.4) * (5 + Math.random() * 6),
                life: 18 + Math.random() * 12,
                color: color,
                size: Math.random() * 6 + 3,
                gravity: 0.02,
                drag: 0.08
            });
        }
        screenShake = 4;
    } else if (wStats.type === 'pierce') {
        bullets.push({ x: ax, y: ay, prevX: originX, prevY: originY, vx: Math.cos(firedAngle) * speed, vy: Math.sin(firedAngle) * speed, life: 80, color: color, dmg: dmg, isEnemy: false, type: 'pierce', pierce: 3 });
        // Gauss electromagnetic discharge
        for (let i = 0; i < 25; i++) {
            particles.push({
                x: ax,
                y: ay,
                vx: Math.cos(firedAngle + (Math.random() - 0.5) * 0.3) * (12 + Math.random() * 10),
                vy: Math.sin(firedAngle + (Math.random() - 0.5) * 0.3) * (12 + Math.random() * 10),
                life: 15 + Math.random() * 10,
                color: i % 2 === 0 ? color : '#ffffff',
                size: Math.random() * 4 + 2,
                gravity: 0,
                drag: 0.12
            });
        }
        screenShake = 6;
    } else {
        // Determine if bullet has elemental properties
        let elementType = null;
        if (player.weapon === 'ice') elementType = 'ice';
        else if (player.weapon === 'fire') elementType = 'fire';
        else if (player.weapon === 'electric') elementType = 'electric';
        
        bullets.push({ 
            x: ax, 
            y: ay, 
            prevX: originX, 
            prevY: originY, 
            vx: Math.cos(firedAngle) * speed, 
            vy: Math.sin(firedAngle) * speed, 
            life: wStats.type === 'sniper' ? 60 : 100, 
            color: color, 
            dmg: dmg, 
            isEnemy: false, 
            type: wStats.type,
            element: elementType,
            trailClock: 0 // For elemental trail effects
        });
        
        // Weapon-specific muzzle effects
        if (player.weapon === 'cannon') {
            // Cannon - Heavy artillery blast with steel-colored particles
            const cannonColors = ['#d1d5db', '#9ca3af', '#6b7280', '#ffffff'];
            // Primary blast cone
            for (let i = 0; i < 18; i++) {
                const spreadAngle = firedAngle + (Math.random() - 0.5) * 0.6;
                particles.push({
                    x: ax,
                    y: ay,
                    vx: Math.cos(spreadAngle) * (9 + Math.random() * 7),
                    vy: Math.sin(spreadAngle) * (9 + Math.random() * 7),
                    life: 18 + Math.random() * 12,
                    color: cannonColors[Math.floor(Math.random() * cannonColors.length)],
                    size: Math.random() * 6 + 3,
                    gravity: 0,
                    drag: 0.12
                });
            }
            // Smoke puffs
            for (let i = 0; i < 5; i++) {
                particles.push({
                    x: ax + (Math.random() - 0.5) * 8,
                    y: ay + (Math.random() - 0.5) * 8,
                    vx: Math.cos(firedAngle) * (2 + Math.random() * 2),
                    vy: Math.sin(firedAngle) * (2 + Math.random() * 2) - Math.random(),
                    life: 25 + Math.random() * 15,
                    color: '#6b7280',
                    size: 8 + Math.random() * 5,
                    gravity: 0,
                    drag: 0.08
                });
            }
            // Bright muzzle flash core
            particles.push({
                x: ax + Math.cos(firedAngle) * 8,
                y: ay + Math.sin(firedAngle) * 8,
                vx: Math.cos(firedAngle) * 4,
                vy: Math.sin(firedAngle) * 4,
                life: 10,
                color: '#ffffff',
                size: 14,
                gravity: 0,
                drag: 0.25
            });
            screenShake = 5;
        } else if (player.weapon === 'sniper') {
            // Sniper - Railgun precision discharge
            for (let i = 0; i < 15; i++) {
                particles.push({
                    x: ax,
                    y: ay,
                    vx: Math.cos(firedAngle) * (10 + Math.random() * 8) + (Math.random() - 0.5) * 2,
                    vy: Math.sin(firedAngle) * (10 + Math.random() * 8) + (Math.random() - 0.5) * 2,
                    life: 12 + Math.random() * 8,
                    color: '#ffffff',
                    size: Math.random() * 4 + 2,
                    gravity: 0,
                    drag: 0.18
                });
            }
        } else if (wStats.type === 'aoe') {
            // Rocket - Massive smoke backblast
            for (let i = 0; i < 30; i++) {
                particles.push({
                    x: ax,
                    y: ay,
                    vx: Math.cos(firedAngle + Math.PI) * (3 + Math.random() * 4) + (Math.random() - 0.5) * 3,
                    vy: Math.sin(firedAngle + Math.PI) * (3 + Math.random() * 4) + (Math.random() - 0.5) * 3,
                    life: 30 + Math.random() * 20,
                    color: i < 10 ? color : '#666666',
                    size: Math.random() * 8 + 4,
                    gravity: 0.05,
                    drag: 0.05
                });
            }
        } else if (player.weapon === 'laser') {
            // Laser - Electric plasma discharge
            for (let i = 0; i < 20; i++) {
                particles.push({
                    x: ax + (Math.random() - 0.5) * 10,
                    y: ay + (Math.random() - 0.5) * 10,
                    vx: Math.cos(firedAngle) * (10 + Math.random() * 8) + (Math.random() - 0.5) * 4,
                    vy: Math.sin(firedAngle) * (10 + Math.random() * 8) + (Math.random() - 0.5) * 4,
                    life: 12 + Math.random() * 10,
                    color: i % 3 === 0 ? '#ffffff' : color,
                    size: Math.random() * 5 + 2,
                    gravity: 0,
                    drag: 0.08
                });
            }
        }
        
        if (wStats.type === 'aoe') screenShake = 5;
        if (wStats.type === 'sniper') screenShake = 4;
    }
    
    // Return true to indicate shot was fired successfully
    return true;
}

function getWeaponRecoilValue(weaponKey) {
    return WEAPONS[weaponKey]?.recoil ?? 8;
}

function getMuzzleDistanceFromRecoil(recoilAmount, baseLength = 35) {
    return Math.max(15, baseLength - (recoilAmount || 0));
}

// Ultimate beam damage caps - percentage of target's max HP
const ULT_BEAM_ENEMY_MAX_PERCENT = 0.70;  // Max 70% of enemy HP
const ULT_BEAM_STRUCTURE_MAX_PERCENT = 0.50;  // Max 50% of structure HP
const ULT_BEAM_DPS_TICKS = 60;  // Damage applied over 60 frames (1 second)
const ULT_BEAM_ENTITY_MULTIPLIER = 0.7;
const ULT_BEAM_STRUCTURE_MULTIPLIER = 0.5;

// Update player ultimate type based on current wave
function updatePlayerUltimateType(wave) {
    let newType = 'BEAM';
    let upgraded = false;
    
    if (wave >= PLAYER_ULTIMATES.CLONE.unlockWave && player.ultType !== 'CLONE') {
        newType = 'CLONE';
        upgraded = player.ultType !== 'CLONE';
    } else if (wave >= PLAYER_ULTIMATES.BERSERKER.unlockWave && player.ultType !== 'CLONE' && player.ultType !== 'BERSERKER') {
        newType = 'BERSERKER';
        upgraded = player.ultType !== 'BERSERKER';
    } else if (wave >= PLAYER_ULTIMATES.SHOCKWAVE.unlockWave && player.ultType === 'BEAM') {
        newType = 'SHOCKWAVE';
        upgraded = player.ultType !== 'SHOCKWAVE';
    }
    
    if (upgraded && newType !== player.ultType) {
        player.ultType = newType;
        const ultConfig = PLAYER_ULTIMATES[newType];
        player.maxStreak = ultConfig.killsRequired;
        
        // Show upgrade notification
        addFloatText('ULTIMATE UPGRADED!', player.x, player.y - 80, '#ffd700');
        addFloatText(ultConfig.icon + ' ' + ultConfig.name, player.x, player.y - 50, ultConfig.color);
        addFloatText(ultConfig.description, player.x, player.y - 25, '#ffffff');
        screenShake = 15;
        
        // Particle burst for upgrade
        for (let i = 0; i < 30; i++) {
            const angle = (Math.PI * 2 / 30) * i;
            const speed = 3 + Math.random() * 5;
            particles.push({
                x: player.x,
                y: player.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 60,
                color: ultConfig.color,
                size: 4
            });
        }
    }
}

// Fire player ultimate based on current ultimate type
function fireUltimate() {
    const ultType = player.ultType || 'BEAM';
    
    switch (ultType) {
        case 'SHOCKWAVE':
            fireShockwaveUltimate();
            break;
        case 'BERSERKER':
            fireBerserkerUltimate();
            break;
        case 'CLONE':
            fireCloneUltimate();
            break;
        case 'BEAM':
        default:
            fireBeamUltimate();
            break;
    }
}

// BEAM Ultimate - Original piercing beam
function fireBeamUltimate() {
    screenShake = 70;
    player.ultBeamTime = 120;  // 2 seconds beam duration
    player.ultBeamAngle = player.turretAngle;
    player.ultBeamDamageTicks = ULT_BEAM_DPS_TICKS;  // Track damage ticks
    player.ultBeamDamagedEntities = new Set();  // Track entities hit for max damage cap
    const muzzleX = player.x + Math.cos(player.turretAngle) * 40;
    const muzzleY = player.y + Math.sin(player.turretAngle) * 40;
    // Initial burst particles
    for (let i = 0; i < 80; i++) {
        particles.push({ x: muzzleX, y: muzzleY, vx: (Math.random() - 0.5) * 35, vy: (Math.random() - 0.5) * 35, life: 100, color: 'cyan', size: 6 });
    }
    const beamTrailLength = Math.max(WORLD_W, WORLD_H) * 2;
    for (let i = 0; i <= beamTrailLength; i += 60) {
        const cx = muzzleX + Math.cos(player.turretAngle) * i;
        const cy = muzzleY + Math.sin(player.turretAngle) * i;
        createParticle(cx, cy, 'rgba(0,255,255,0.6)', 4);
    }
    addFloatText('DEVASTATOR!', player.x, player.y - 60, '#00ffff');
}

// SHOCKWAVE Ultimate - Area DOT (damage over time) + stun
// Max damage capped at 90% of enemy HP over duration
// FIXED: Now continuously checks for enemies in radius during entire DOT duration
function fireShockwaveUltimate() {
    const config = PLAYER_ULTIMATES.SHOCKWAVE;
    screenShake = 50;
    
    // Create expanding shockwave ring visual
    player.shockwaveActive = true;
    player.shockwaveRadius = 0;
    player.shockwaveMaxRadius = config.radius;
    player.shockwaveExpansionSpeed = 15;
    
    // Store shockwave center position (player position at cast time)
    const centerX = player.x;
    const centerY = player.y;
    
    // Track enemies that have been affected (to cap total damage per enemy)
    // Key: enemy object reference, Value: { maxDamage, damageDealt }
    const affectedEnemiesMap = new Map();
    
    // Initial stun and knockback for enemies currently in range
    let stunnedCount = 0;
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const dist = Math.hypot(e.x - centerX, e.y - centerY);
        if (dist <= config.radius) {
            if (enemyHasSpawnShield && enemyHasSpawnShield(e)) continue;
            
            // Apply stun immediately
            e.stunTime = config.stunDuration;
            stunnedCount++;
            
            // Knockback from shockwave center
            const angle = Math.atan2(e.y - centerY, e.x - centerX);
            const knockback = (1 - dist / config.radius) * 10;
            e.x += Math.cos(angle) * knockback;
            e.y += Math.sin(angle) * knockback;
        }
    }
    
    // Store shockwave DOT state on player
    player.shockwaveDOT = {
        centerX: centerX,
        centerY: centerY,
        radius: config.radius,
        affectedEnemiesMap: affectedEnemiesMap,
        maxDamagePercent: config.maxDamagePercent,
        boss: { damageDealt: 0, maxDamage: 0 },
        duration: config.duration,
        tickInterval: config.tickInterval,
        tickTimer: 0,
        totalTicks: Math.floor(config.duration / config.tickInterval),
        stunDuration: config.stunDuration
    };
    
    // Visual effects - expanding ring particles
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
        for (let r = 0; r < config.radius; r += 50) {
            setTimeout(() => {
                const px = centerX + Math.cos(angle) * r;
                const py = centerY + Math.sin(angle) * r;
                particles.push({
                    x: px,
                    y: py,
                    vx: Math.cos(angle) * 2,
                    vy: Math.sin(angle) * 2,
                    life: 40,
                    color: config.color,
                    size: 5
                });
            }, r / 15);
        }
    }
    
    addFloatText('SHOCKWAVE!', centerX, centerY - 60, config.color);
    if (stunnedCount > 0) {
        addFloatText(stunnedCount + ' STUNNED!', centerX, centerY - 30, '#ffffff');
    }
}

// Update shockwave DOT - called every frame
// FIXED: Now continuously checks ALL enemies in radius, not just initial ones
function updateShockwaveDOT() {
    if (!player.shockwaveDOT || player.shockwaveDOT.duration <= 0) {
        player.shockwaveDOT = null;
        return;
    }
    
    const dot = player.shockwaveDOT;
    dot.duration--;
    dot.tickTimer++;
    
    // Apply damage tick
    if (dot.tickTimer >= dot.tickInterval) {
        dot.tickTimer = 0;
        const damagePerTick = 1 / dot.totalTicks; // Fraction of max damage per tick
        
        // Check ALL enemies currently in radius (not just initially detected ones)
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (!e || e.hp <= 0) continue;
            
            // Check if enemy is currently in shockwave radius
            const dist = Math.hypot(e.x - dot.centerX, e.y - dot.centerY);
            if (dist > dot.radius) continue;
            
            // Skip enemies with spawn shield
            if (enemyHasSpawnShield && enemyHasSpawnShield(e)) continue;
            
            // Get or create tracking data for this enemy
            let affected = dot.affectedEnemiesMap.get(e);
            if (!affected) {
                // New enemy entered the radius - calculate its max damage cap
                const falloff = 1 - (dist / dot.radius) * 0.5;
                const maxHp = e.maxHp || e.hp || 100;
                const maxDamage = maxHp * dot.maxDamagePercent * falloff;
                
                affected = {
                    maxDamage: maxDamage,
                    damageDealt: 0,
                    falloff: falloff
                };
                dot.affectedEnemiesMap.set(e, affected);
                
                // Apply stun to newly affected enemies
                if (!e.stunTime || e.stunTime < dot.stunDuration * 0.5) {
                    e.stunTime = Math.max(e.stunTime || 0, dot.stunDuration * 0.5); // Half stun for late entries
                }
            }
            
            // Calculate tick damage (portion of max damage)
            const tickDamage = affected.maxDamage * damagePerTick;
            
            // Only deal damage if we haven't exceeded cap
            if (affected.damageDealt < affected.maxDamage) {
                const actualDamage = Math.min(tickDamage, affected.maxDamage - affected.damageDealt);
                e.hp = Math.max(0, e.hp - actualDamage);
                e.hitFlash = 5;
                affected.damageDealt += actualDamage;
                
                // Show damage number occasionally
                if (Math.random() < 0.3) {
                    addFloatText('-' + Math.ceil(actualDamage), e.x + (Math.random() - 0.5) * 20, e.y - 20, '#3b82f6');
                }
                
                // Kill check
                if (e.hp <= 0) {
                    const enemyIndex = enemies.indexOf(e);
                    if (enemyIndex !== -1) killEnemy(enemyIndex);
                    dot.affectedEnemiesMap.delete(e);
                }
            }
        }
        
        // Clean up map entries for dead/removed enemies
        for (const [enemy, data] of dot.affectedEnemiesMap) {
            if (!enemy || enemy.hp <= 0 || !enemies.includes(enemy)) {
                dot.affectedEnemiesMap.delete(enemy);
            }
        }
        
        // Damage boss if in radius
        if (boss && boss.hp > 0) {
            const bossDist = Math.hypot(boss.x - dot.centerX, boss.y - dot.centerY);
            if (bossDist <= dot.radius) {
                // Initialize boss damage tracking if not already
                if (dot.boss.maxDamage === 0) {
                    const falloff = 1 - (bossDist / dot.radius) * 0.5;
                    dot.boss.maxDamage = boss.maxHp * (dot.maxDamagePercent * 0.5) * falloff;
                }
                
                if (dot.boss.damageDealt < dot.boss.maxDamage) {
                    const tickDamage = dot.boss.maxDamage * damagePerTick;
                    const actualDamage = Math.min(tickDamage, dot.boss.maxDamage - dot.boss.damageDealt);
                    boss.hp -= actualDamage;
                    dot.boss.damageDealt += actualDamage;
                    
                    // Track damage for ultimate trigger
                    if (boss.recentDamage) {
                        boss.recentDamage.push({ amount: actualDamage, frame: frame });
                    }
                    
                    if (Math.random() < 0.2) {
                        addFloatText('-' + Math.ceil(actualDamage), boss.x + (Math.random() - 0.5) * 40, boss.y - 40, '#3b82f6');
                    }
                    
                    if (boss.hp <= 0) killBoss();
                }
            }
        }
    }
    
    // Clear when duration ends
    if (dot.duration <= 0) {
        player.shockwaveDOT = null;
    }
}

// BERSERKER Ultimate - Speed + damage + invincibility buff
function fireBerserkerUltimate() {
    const config = PLAYER_ULTIMATES.BERSERKER;
    screenShake = 40;
    
    // Activate berserker mode
    player.berserkerActive = true;
    player.berserkerTime = config.duration;
    player.berserkerSpeedMult = config.speedMultiplier;
    player.berserkerDamageMult = config.damageMultiplier;
    player.berserkerFireRateMult = config.fireRateMultiplier;
    
    // Grant invincibility during berserker
    player.shieldTime = config.duration + 60; // Shield lasts duration + buffer
    
    // Visual effects - fire aura particles
    for (let i = 0; i < 50; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 50;
        particles.push({
            x: player.x + Math.cos(angle) * dist,
            y: player.y + Math.sin(angle) * dist,
            vx: (Math.random() - 0.5) * 8,
            vy: -Math.random() * 8,
            life: 60,
            color: config.color,
            size: 6
        });
    }
    
    addFloatText('BERSERKER MODE!', player.x, player.y - 90, config.color);
    addFloatText('2x SPEED - 2.5x DMG - 2x FIRE', player.x, player.y - 65, '#ffffff');
}

// CLONE Ultimate - Spawn ally tanks
function fireCloneUltimate() {
    const config = PLAYER_ULTIMATES.CLONE;
    screenShake = 30;
    
    // Clear existing clones
    playerClones = [];
    
    // Spawn clones around player
    for (let i = 0; i < config.cloneCount; i++) {
        const angle = (Math.PI * 2 / config.cloneCount) * i + player.angle;
        const spawnDist = 80;
        const cloneX = player.x + Math.cos(angle) * spawnDist;
        const cloneY = player.y + Math.sin(angle) * spawnDist;
        
        // Find valid spawn position (not inside wall, crate, or river)
        let validX = cloneX;
        let validY = cloneY;
        let attempts = 0;
        const riverBoundary = typeof RIVER_BOUNDARY !== 'undefined' ? RIVER_BOUNDARY : 90;
        
        while (attempts < 10) {
            let blocked = false;
            
            // Check wall collision
            if (checkWall(validX, validY, 25)) {
                blocked = true;
            }
            
            // Check crate collision
            if (!blocked && checkCrate(validX, validY, 25)) {
                blocked = true;
            }
            
            // Check river boundary
            if (!blocked && (validX < riverBoundary || validX > WORLD_W - riverBoundary ||
                            validY < riverBoundary || validY > WORLD_H - riverBoundary)) {
                blocked = true;
            }
            
            if (!blocked) break;
            attempts++;
            const newAngle = angle + (Math.random() - 0.5) * Math.PI;
            validX = player.x + Math.cos(newAngle) * (spawnDist + attempts * 20);
            validY = player.y + Math.sin(newAngle) * (spawnDist + attempts * 20);
        }
        
        // Final clamp to river boundary
        validX = Math.max(riverBoundary, Math.min(WORLD_W - riverBoundary, validX));
        validY = Math.max(riverBoundary, Math.min(WORLD_H - riverBoundary, validY));
        
        const clone = {
            x: validX,
            y: validY,
            angle: angle,
            turretAngle: angle,
            hp: player.maxHp * config.cloneHPPercent,
            maxHp: player.maxHp * config.cloneHPPercent,
            radius: 22,
            speed: player.speedBase * 0.8,
            weapon: player.weapon, // Clone uses SAME weapon as player
            color: config.cloneColor,
            // Clones are permanent - no lifetime, they stay until destroyed
            tier: config.cloneTier,
            fireDelay: 0,
            target: null,
            hitFlash: 0,
            spawnAnimation: 60, // Faster spawn for clones (1 second instead of 5)
            spawnAnimationMax: 60, // Store max for render calculations
            // Match player tank rendering properties
            recoil: 0,
            recoilRecoveryTime: 0, // Turret tracking lock after firing
            turretRecoilOffsetX: 0,
            turretRecoilOffsetY: 0,
            turretRecoilDecay: 0.70,
            wheelRotation: 0,
            seed: Math.random(),
            // Clone spawns with FULL armor (75% of clone's max HP) and active shield (20 seconds)
            // This makes clones powerful combat allies
            maxArmor: Math.ceil((player.maxHp * config.cloneHPPercent) * 0.75), // 75% of clone's max HP
            armor: Math.ceil((player.maxHp * config.cloneHPPercent) * 0.75), // Start with FULL armor
            shieldTime: 1200 // 20 seconds shield duration (same as player)
        };
        
        playerClones.push(clone);
        
        // Spawn particle effect
        for (let j = 0; j < 20; j++) {
            particles.push({
                x: validX,
                y: validY,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 40,
                color: config.cloneColor,
                size: 4
            });
        }
    }
    
    addFloatText('CLONE ARMY!', player.x, player.y - 60, config.color);
    addFloatText(config.cloneCount + ' ALLIES DEPLOYED!', player.x, player.y - 30, '#ffffff');
}

// Update and control player clones (ally tanks from CLONE ultimate)
// ENHANCED: Clones now use same AI and collision system as enemies (Tier 7 AI)
function updatePlayerClones(dt) {
    if (!playerClones || playerClones.length === 0) return;
    
    // === CLONE SEPARATION CONSTANTS (same as enemy) ===
    const CLONE_SOFT_SEPARATION = 120; // Same as ENEMY_SOFT_SEPARATION
    const CLONE_HARD_SEPARATION = 90;  // Same as ENEMY_HARD_SEPARATION
    
    for (let i = playerClones.length - 1; i >= 0; i--) {
        const clone = playerClones[i];
        
        // Clone death - only when HP reaches 0 (no lifetime/teleport - clones are permanent)
        if (clone.hp <= 0) {
            // Destroyed - dramatic explosion like enemy death
            createExplosion(clone.x, clone.y, '#86efac');
            
            // Additional clone-specific green/white sparks
            for (let j = 0; j < 25; j++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 3 + Math.random() * 6;
                particles.push({
                    x: clone.x,
                    y: clone.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 2,
                    life: 50 + Math.random() * 30,
                    color: j % 2 === 0 ? '#86efac' : '#ffffff',
                    size: Math.random() * 6 + 2,
                    gravity: -0.05
                });
            }
            
            addFloatText('CLONE DESTROYED', clone.x, clone.y - 30, '#ff6b6b');
            playerClones.splice(i, 1);
            continue;
        }
        
        // Spawn animation - dramatic materialization effect
        if (clone.spawnAnimation > 0) {
            clone.spawnAnimation -= dt;
            
            // CRITICAL: Shield timer should countdown during spawn animation
            // This prevents the visual delay where shield bar shows full but doesn't decrease
            if (clone.shieldTime > 0) {
                clone.shieldTime -= dt;
            }
            
            // Spawn particles during animation
            if (frame % 3 === 0) {
                const progress = 1 - (clone.spawnAnimation / 60);
                const ring = Math.sin(progress * Math.PI) * 30;
                for (let j = 0; j < 4; j++) {
                    const angle = (frame * 0.15) + (j / 4) * Math.PI * 2;
                    particles.push({
                        x: clone.x + Math.cos(angle) * ring,
                        y: clone.y + Math.sin(angle) * ring,
                        vx: Math.cos(angle) * 2,
                        vy: Math.sin(angle) * 2 - 1,
                        life: 20,
                        color: j % 2 === 0 ? '#86efac' : '#ffffff',
                        size: 3 + Math.random() * 3
                    });
                }
            }
            
            // Final spawn flash
            if (clone.spawnAnimation <= dt && clone.spawnAnimation > 0) {
                particles.push({ 
                    x: clone.x, 
                    y: clone.y, 
                    size: 50, 
                    life: 15, 
                    color: 'rgba(134, 239, 172, 0.6)', 
                    type: 'wave' 
                });
            }
            continue;
        }
        
        // Hit flash decay
        if (clone.hitFlash > 0) clone.hitFlash -= dt;
        
        // Shield time decay
        if (clone.shieldTime > 0) {
            clone.shieldTime -= dt;
            // Shield particle effect
            if (frame % 10 === 0) {
                const shieldAngle = Math.random() * Math.PI * 2;
                particles.push({
                    x: clone.x + Math.cos(shieldAngle) * (clone.radius + 5),
                    y: clone.y + Math.sin(shieldAngle) * (clone.radius + 5),
                    vx: Math.cos(shieldAngle) * 1,
                    vy: Math.sin(shieldAngle) * 1,
                    life: 15,
                    color: '#60a5fa',
                    size: 2 + Math.random() * 2
                });
            }
        }
        
        // Burning DOT effect (from enemy Fire Nova)
        if (clone.burningTime > 0) {
            clone.burningTime -= dt;
            
            // Apply burn damage every 30 frames (0.5 seconds)
            if (frame % 30 === 0) {
                const burnDmg = 5;
                clone.hp -= burnDmg;
                clone.hitFlash = 3;
                
                // Fire particles
                for (let j = 0; j < 5; j++) {
                    particles.push({
                        x: clone.x + (Math.random() - 0.5) * 30,
                        y: clone.y + (Math.random() - 0.5) * 30,
                        vx: (Math.random() - 0.5) * 3,
                        vy: -2 - Math.random() * 2,
                        life: 20 + Math.random() * 10,
                        color: Math.random() < 0.5 ? '#ff6b35' : '#ffcc00',
                        size: Math.random() * 4 + 2,
                        gravity: -0.1
                    });
                }
            }
        }
        
        // Slowed effect decay (from enemy Ice Burst)
        if (clone.slowed > 0) {
            clone.slowed -= dt;
            
            // Ice particles while slowed
            if (frame % 15 === 0) {
                particles.push({
                    x: clone.x + (Math.random() - 0.5) * 20,
                    y: clone.y + (Math.random() - 0.5) * 20,
                    vx: (Math.random() - 0.5) * 1,
                    vy: Math.random() * 1,
                    life: 15,
                    color: '#87ceeb',
                    size: Math.random() * 3 + 1
                });
            }
        }
        
        // Stunned effect decay (from enemy Chain Lightning)
        if (clone.stunnedTime > 0) {
            clone.stunnedTime -= dt;
            
            // Stun particles
            if (frame % 8 === 0) {
                particles.push({
                    x: clone.x + (Math.random() - 0.5) * 25,
                    y: clone.y - 20 + (Math.random() - 0.5) * 10,
                    vx: (Math.random() - 0.5) * 2,
                    vy: (Math.random() - 0.5) * 2,
                    life: 12,
                    color: '#ffeb3b',
                    size: Math.random() * 3 + 1
                });
            }
            
            // Skip movement and shooting while stunned
            continue;
        }
        
        // Find nearest enemy target
        let nearestEnemy = null;
        let nearestDist = Infinity;
        
        // Check regular enemies
        for (const e of enemies) {
            if (e.hp <= 0) continue;
            
            // Skip enemies that are still spawning (have spawn warmup active)
            if (e.spawnWarmup && e.spawnWarmup > 0) continue;
            
            // Skip enemies that recently finished spawning (holdoff period)
            // This gives them time to complete their dramatic entrance animation
            if (e.spawnHoldoff === undefined) e.spawnHoldoff = AUTO_AIM_SPAWN_HOLDOFF;
            if (e.spawnHoldoff > 0) continue;
            
            const dist = Math.hypot(e.x - clone.x, e.y - clone.y);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestEnemy = e;
            }
        }
        
        // Check boss - skip if spawning (meteor animation) or sleeping
        // Boss has meteorSpawnActive during dramatic entrance and isSleeping when dormant
        if (boss && boss.hp > 0 && !boss.meteorSpawnActive && !boss.isSleeping) {
            const bossDist = Math.hypot(boss.x - clone.x, boss.y - clone.y);
            if (bossDist < nearestDist) {
                nearestDist = bossDist;
                nearestEnemy = boss;
            }
        }
        
        clone.target = nearestEnemy;
        
        // === CLONE SEPARATION (same as enemy) ===
        // Prevent clones from overlapping with each other, player, and enemies
        let sepX = 0;
        let sepY = 0;
        
        // Separation from other clones
        for (let j = 0; j < playerClones.length; j++) {
            if (i === j) continue;
            const other = playerClones[j];
            const dx = clone.x - other.x;
            const dy = clone.y - other.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0 && dist < CLONE_SOFT_SEPARATION) {
                const strength = Math.pow(1 - dist / CLONE_SOFT_SEPARATION, 2);
                sepX += (dx / dist) * strength * 3;
                sepY += (dy / dist) * strength * 3;
            }
        }
        
        // Separation from player
        const pDx = clone.x - player.x;
        const pDy = clone.y - player.y;
        const pDist = Math.hypot(pDx, pDy);
        if (pDist > 0 && pDist < CLONE_SOFT_SEPARATION) {
            const strength = Math.pow(1 - pDist / CLONE_SOFT_SEPARATION, 2);
            sepX += (pDx / pDist) * strength * 4; // Stronger separation from player
            sepY += (pDy / pDist) * strength * 4;
        }
        
        // Separation from enemies (slight repel to avoid clipping)
        for (const e of enemies) {
            if (e.hp <= 0) continue;
            const eDx = clone.x - e.x;
            const eDy = clone.y - e.y;
            const eDist = Math.hypot(eDx, eDy);
            if (eDist > 0 && eDist < CLONE_HARD_SEPARATION) {
                const strength = Math.pow(1 - eDist / CLONE_HARD_SEPARATION, 2);
                sepX += (eDx / eDist) * strength * 2;
                sepY += (eDy / eDist) * strength * 2;
            }
        }
        
        // Apply separation movement with collision check
        if (sepX !== 0 || sepY !== 0) {
            const sepMag = Math.hypot(sepX, sepY);
            const maxSep = clone.speed * 0.5 * dt;
            if (sepMag > maxSep) {
                sepX = (sepX / sepMag) * maxSep;
                sepY = (sepY / sepMag) * maxSep;
            }
            
            // Test new position for collision before applying
            const newSepX = clone.x + sepX;
            const newSepY = clone.y + sepY;
            
            // Check wall and crate collision
            let sepBlocked = checkWall(newSepX, newSepY, clone.radius) || 
                             checkCrate(newSepX, newSepY, clone.radius);
            
            // Check river boundary - same as player (blocking, not clamping)
            if (!sepBlocked) {
                const riverBoundary = typeof RIVER_BOUNDARY !== 'undefined' ? RIVER_BOUNDARY : 90;
                if (newSepX - clone.radius < riverBoundary || newSepX + clone.radius > WORLD_W - riverBoundary ||
                    newSepY - clone.radius < riverBoundary || newSepY + clone.radius > WORLD_H - riverBoundary) {
                    sepBlocked = true;
                }
            }
            
            if (!sepBlocked) {
                clone.x = newSepX;
                clone.y = newSepY;
            }
        }
        
        if (nearestEnemy) {
            // Calculate angle to target
            const targetAngle = Math.atan2(nearestEnemy.y - clone.y, nearestEnemy.x - clone.x);
            
            // === RECOIL RECOVERY: Slow turret tracking after firing ===
            let turretRotationMultiplier = 1.0;
            if (clone.recoilRecoveryTime > 0) {
                clone.recoilRecoveryTime -= dt;
                // Exponential recovery - slower at start, gradually speeds up
                const recoveryProgress = Math.max(0, clone.recoilRecoveryTime / 18);
                turretRotationMultiplier = 0.03 + (1 - recoveryProgress) * 0.12;
            }
            
            // === TIER 7 AI (HIGHEST): SMOOTH CLONE TURRET ROTATION ===
            // Uses highest tier AI parameters (Tier 7 Electric - intelligence: 6, aimSpeed: 0.18)
            let turretDiff = targetAngle - clone.turretAngle;
            while (turretDiff < -Math.PI) turretDiff += Math.PI * 2;
            while (turretDiff > Math.PI) turretDiff -= Math.PI * 2;
            
            // Smooth rotation with speed cap (Tier 7 highest aimSpeed: 0.18)
            const aimSpeed = 0.18 * turretRotationMultiplier; // Apply recoil recovery slowdown
            const maxTurretRotation = 0.08 * dt * turretRotationMultiplier;
            const turretRotation = Math.sign(turretDiff) * Math.min(Math.abs(turretDiff), Math.max(maxTurretRotation, Math.abs(turretDiff) * aimSpeed * dt));
            clone.turretAngle += turretRotation;
            
            // === TIER 7 AI (HIGHEST): MOVEMENT WITH COLLISION AVOIDANCE ===
            // Tier 7 optimal combat distance (slightly closer due to higher intelligence)
            const optimalDist = 250; // Tier 7 closer engagement distance
            const distDiff = nearestDist - optimalDist;
            
            let moveAngle = clone.angle;
            let shouldMove = false;
            
            if (Math.abs(distDiff) > 40) {
                // Move towards/away from target
                moveAngle = distDiff > 0 ? targetAngle : targetAngle + Math.PI;
                shouldMove = true;
            } else {
                // Strafe around target (Tier 5 behavior)
                clone.strafeTimer = (clone.strafeTimer || 0) + dt;
                if (clone.strafeTimer > 120) {
                    clone.strafeDir = clone.strafeDir === 1 ? -1 : 1;
                    clone.strafeTimer = 0;
                }
                moveAngle = targetAngle + (Math.PI / 2) * (clone.strafeDir || 1);
                shouldMove = true;
            }
            
            if (shouldMove) {
                // Apply slow effect from Ice Burst
                let speedMult = 1.0;
                if (clone.slowed > 0) {
                    speedMult = 0.4; // 60% slow when affected by ice
                }
                const moveSpeed = clone.speed * 0.85 * speedMult * dt;
                
                // Try movement with collision avoidance (same as enemy)
                const offsets = [0, 0.35, -0.35, 0.75, -0.75];
                let moved = false;
                
                for (const offset of offsets) {
                    const ang = moveAngle + offset;
                    const newX = clone.x + Math.cos(ang) * moveSpeed;
                    const newY = clone.y + Math.sin(ang) * moveSpeed;
                    
                    // Check wall collision (same as player)
                    let blocked = checkWall(newX, newY, clone.radius);
                    
                    // Check crate collision (same as player)
                    if (!blocked) {
                        blocked = checkCrate(newX, newY, clone.radius);
                    }
                    
                    // Check hard collision with other clones
                    if (!blocked) {
                        for (let j = 0; j < playerClones.length; j++) {
                            if (i === j) continue;
                            const other = playerClones[j];
                            if (Math.hypot(newX - other.x, newY - other.y) < CLONE_HARD_SEPARATION) {
                                blocked = true;
                                break;
                            }
                        }
                    }
                    
                    // Check hard collision with player
                    if (!blocked && Math.hypot(newX - player.x, newY - player.y) < CLONE_HARD_SEPARATION) {
                        blocked = true;
                    }
                    
                    // Check collision with enemies (prevent clipping through enemies)
                    if (!blocked) {
                        for (const e of enemies) {
                            if (e.hp <= 0) continue;
                            const dist = Math.hypot(newX - e.x, newY - e.y);
                            if (dist < clone.radius + (e.radius || 25)) {
                                blocked = true;
                                break;
                            }
                        }
                    }
                    
                    // Check collision with boss (prevent clipping through boss)
                    if (!blocked && boss && boss.hp > 0) {
                        const bossDist = Math.hypot(newX - boss.x, newY - boss.y);
                        if (bossDist < clone.radius + (boss.radius || BOSS_CONFIG.radius)) {
                            blocked = true;
                        }
                    }
                    
                    // Check river boundary - same as player (blocking, not clamping)
                    if (!blocked) {
                        const riverBoundary = typeof RIVER_BOUNDARY !== 'undefined' ? RIVER_BOUNDARY : 90;
                        if (newX - clone.radius < riverBoundary || newX + clone.radius > WORLD_W - riverBoundary ||
                            newY - clone.radius < riverBoundary || newY + clone.radius > WORLD_H - riverBoundary) {
                            blocked = true;
                        }
                    }
                    
                    if (!blocked) {
                        clone.x = newX;
                        clone.y = newY;
                        clone.angle = ang;
                        
                        // Animate wheel rotation when moving
                        clone.wheelRotation = (clone.wheelRotation || 0) + moveSpeed * 0.35;
                        if (clone.wheelRotation > Math.PI * 2) clone.wheelRotation -= Math.PI * 2;
                        
                        moved = true;
                        break;
                    }
                }
            }
            
            // Decay turret recoil - recoil follows turret angle for accurate visual feedback
            if (clone.turretRecoilOffsetX !== 0 || clone.turretRecoilOffsetY !== 0) {
                const decay = clone.turretRecoilDecay || 0.70;
                // Calculate current recoil magnitude
                const recoilMagnitude = Math.hypot(clone.turretRecoilOffsetX, clone.turretRecoilOffsetY);
                const newMagnitude = recoilMagnitude * Math.pow(decay, dt);
                
                if (newMagnitude < 0.01) {
                    // Snap to zero when very small
                    clone.turretRecoilOffsetX = 0;
                    clone.turretRecoilOffsetY = 0;
                } else {
                    // Recalculate offset based on CURRENT turret angle (backward direction)
                    const kickAngle = clone.turretAngle - Math.PI;
                    clone.turretRecoilOffsetX = Math.cos(kickAngle) * newMagnitude;
                    clone.turretRecoilOffsetY = Math.sin(kickAngle) * newMagnitude;
                }
            }
            
            // Decay body recoil
            if (clone.recoil > 0) {
                clone.recoil *= Math.pow(0.85, dt);
                if (clone.recoil < 0.05) clone.recoil = 0;
            }
            
            // === TIER 7 AI (HIGHEST): FIRE AT TARGET ===
            // Tier 7 accuracy: 0.95, error: 0.018 - very accurate
            clone.fireDelay -= dt;
            if (clone.fireDelay <= 0 && Math.abs(turretDiff) < 0.15) { // Tier 7 tighter accuracy threshold
                // Double-check target is not spawning (in case target was cached before spawn)
                // For regular enemies: check spawnWarmup and spawnHoldoff
                // For boss: check meteorSpawnActive and isSleeping
                const isBoss = nearestEnemy === boss;
                const targetSpawning = isBoss 
                    ? (nearestEnemy.meteorSpawnActive || nearestEnemy.isSleeping)
                    : (nearestEnemy.spawnWarmup > 0 || nearestEnemy.spawnHoldoff > 0);
                if (targetSpawning) continue; // Skip firing at spawning enemies/boss
                
                // Check clear line of sight
                const hasLoS = checkLineOfSight(clone.x, clone.y, nearestEnemy.x, nearestEnemy.y);
                
                if (hasLoS) {
                    cloneFireBullet(clone);
                    
                    // === APPLY KICKBACK ON FIRE (same as player/enemy) ===
                    const weapon = WEAPONS[clone.weapon] || WEAPONS.cannon;
                    const kickbackForce = (weapon.recoil ?? 7) * 0.15;
                    const kickAngle = clone.turretAngle + Math.PI;
                    const newKickX = clone.x + Math.cos(kickAngle) * kickbackForce;
                    const newKickY = clone.y + Math.sin(kickAngle) * kickbackForce;
                    
                    // Check boundary before applying kickback
                    const riverBoundary = typeof RIVER_BOUNDARY !== 'undefined' ? RIVER_BOUNDARY : 90;
                    const kickBlocked = checkWall(newKickX, newKickY, clone.radius) ||
                                       checkCrate(newKickX, newKickY, clone.radius) ||
                                       newKickX - clone.radius < riverBoundary ||
                                       newKickX + clone.radius > WORLD_W - riverBoundary ||
                                       newKickY - clone.radius < riverBoundary ||
                                       newKickY + clone.radius > WORLD_H - riverBoundary;
                    
                    if (!kickBlocked) {
                        clone.x = newKickX;
                        clone.y = newKickY;
                    }
                    
                    clone.fireDelay = 25 + Math.random() * 10; // Slight randomness like enemy
                }
            }
        } else {
            // No target - turret follows body angle (same as enemy behavior)
            let diff = clone.angle - clone.turretAngle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            const maxRotation = 0.05 * dt;
            clone.turretAngle += Math.sign(diff) * Math.min(Math.abs(diff), Math.max(maxRotation, Math.abs(diff) * 0.08 * dt));
        }
    }
}

// Clone fires a bullet at its target
function cloneFireBullet(clone) {
    // Get weapon stats first
    const weapon = WEAPONS[clone.weapon] || WEAPONS.cannon;
    
    // Apply accuracy error to turret angle BEFORE firing (same as player/enemy)
    // Clone uses player accuracy but with slight penalty
    const baseAccuracy = weapon.playerAccuracy ?? 0.95;
    const cloneAccuracyPenalty = 0.95; // Clone is 95% as accurate as player
    const finalAccuracy = Math.min(1, baseAccuracy * cloneAccuracyPenalty);
    const missChance = 1 - finalAccuracy;
    
    // Calculate accuracy error
    let accuracyError = 0;
    if (missChance > 0 && Math.random() < missChance) {
        const spread = weapon.spread ?? 0.1;
        accuracyError = (Math.random() - 0.5) * spread * 2;
    }
    
    // Apply accuracy error to turret angle - turret points where bullet goes
    const firedAngle = clone.turretAngle + accuracyError;
    clone.turretAngle = firedAngle; // Update visual turret to match fired direction
    
    // Set recoil recovery time - slows turret tracking to show accuracy error visually
    clone.recoilRecoveryTime = 18; // Same as player (~0.3 sec)
    
    const muzzleX = clone.x + Math.cos(clone.turretAngle) * 28;
    const muzzleY = clone.y + Math.sin(clone.turretAngle) * 28;
    
    // Use weapon stats already obtained above for bullet properties
    const bulletSpeed = weapon.speed * 0.9;
    const bulletDamage = weapon.dmg * 0.7; // 70% of player damage (use dmg not damage)
    const bulletType = weapon.type || 'single'; // Use weapon's bullet type for proper rendering
    
    // Apply turret kickback visual effect (same as player)
    const kickbackProfiles = {
        'cannon': { multiplier: 1.6, verticalBias: 0.15, decay: 0.70 },
        'twin': { multiplier: 1.2, verticalBias: 0.08, decay: 0.65 },
        'shotgun': { multiplier: 2.8, verticalBias: 0.25, decay: 0.60 },
        'sniper': { multiplier: 2.2, verticalBias: 0.10, decay: 0.55 },
        'burst': { multiplier: 1.4, verticalBias: 0.12, decay: 0.68 },
        'flak': { multiplier: 1.8, verticalBias: 0.20, decay: 0.68 },
        'minigun': { multiplier: 0.6, verticalBias: 0.03, decay: 0.85 },
        'laser': { multiplier: 0.0, verticalBias: 0.0, decay: 0.95 },
        'rocket': { multiplier: 3.2, verticalBias: 0.35, decay: 0.50 },
        'flame': { multiplier: 0.3, verticalBias: 0.02, decay: 0.90 },
        'ice': { multiplier: 1.4, verticalBias: 0.12, decay: 0.72 },
        'electric': { multiplier: 1.2, verticalBias: 0.08, decay: 0.78 }
    };
    
    const profile = kickbackProfiles[clone.weapon] || kickbackProfiles['cannon'];
    const recoilKick = (weapon.recoil ?? 7) * 0.8;
    
    // Handle weapon types differently
    if (weapon.type === 'burst') {
        // BURST WEAPON: Fire 3 shots with kickback per shot
        const burstAngle = clone.turretAngle;
        const burstOriginX = clone.x;
        const burstOriginY = clone.y;
        const burstMuzzle = 28;
        const burstClone = clone;
        const burstProfile = profile;
        const burstRecoilBase = recoilKick;
        
        // Barrel offsets: center, right, left (same as player)
        const barrelOffsets = [0, 9, -9];
        const perpAngle = burstAngle + Math.PI / 2;
        
        for (let bi = 0; bi < 3; bi++) {
            setTimeout(() => {
                const barrelOffset = barrelOffsets[bi];
                const barrelOriginX = burstOriginX + Math.cos(perpAngle) * barrelOffset;
                const barrelOriginY = burstOriginY + Math.sin(perpAngle) * barrelOffset;
                
                const bx = barrelOriginX + Math.cos(burstAngle) * burstMuzzle;
                const by = barrelOriginY + Math.sin(burstAngle) * burstMuzzle;
                
                bullets.push({
                    x: bx, y: by,
                    vx: Math.cos(burstAngle) * bulletSpeed,
                    vy: Math.sin(burstAngle) * bulletSpeed,
                    dmg: bulletDamage,
                    owner: 'clone',
                    cloneIndex: playerClones.indexOf(burstClone),
                    radius: weapon.radius || 5,
                    color: weapon.color || '#86efac',
                    life: 180,
                    type: 'burst',
                    weapon: clone.weapon,
                    element: weapon.element || null
                });
                
                // Apply kickback per burst shot
                const burstRecoilStrength = burstRecoilBase * burstProfile.multiplier * 0.5;
                const burstKickAngle = burstClone.turretAngle - Math.PI;
                burstClone.turretRecoilOffsetX += Math.cos(burstKickAngle) * burstRecoilStrength;
                burstClone.turretRecoilOffsetY += Math.sin(burstKickAngle) * burstRecoilStrength;
                burstClone.recoil = Math.min(burstClone.recoil + burstRecoilBase * 0.4, burstRecoilBase * 2);
                
                // Muzzle flash per shot
                for (let j = 0; j < 8; j++) {
                    particles.push({
                        x: bx, y: by,
                        vx: Math.cos(burstAngle) * (3 + Math.random() * 5) + (Math.random() - 0.5) * 3,
                        vy: Math.sin(burstAngle) * (3 + Math.random() * 5) + (Math.random() - 0.5) * 3,
                        life: 15 + Math.random() * 10,
                        color: j % 2 === 0 ? (weapon.color || '#86efac') : '#ffffff',
                        size: 3 + Math.random() * 3
                    });
                }
            }, bi * 100);
        }
        
        // Initial recoil applied immediately
        clone.recoil = recoilKick;
        const kickAngle = clone.turretAngle + Math.PI;
        clone.turretRecoilOffsetX = Math.cos(kickAngle) * recoilKick * profile.multiplier * 0.5;
        clone.turretRecoilOffsetY = Math.sin(kickAngle) * recoilKick * profile.multiplier * 0.5;
        clone.turretRecoilDecay = profile.decay;
        
    } else if (weapon.type === 'twin') {
        // TWIN WEAPON: Fire 2 shots simultaneously
        const ox = Math.cos(clone.turretAngle + Math.PI / 2) * 8;
        const oy = Math.sin(clone.turretAngle + Math.PI / 2) * 8;
        
        for (let side of [1, -1]) {
            bullets.push({
                x: muzzleX + ox * side,
                y: muzzleY + oy * side,
                vx: Math.cos(clone.turretAngle) * bulletSpeed,
                vy: Math.sin(clone.turretAngle) * bulletSpeed,
                dmg: bulletDamage,
                owner: 'clone',
                cloneIndex: playerClones.indexOf(clone),
                radius: weapon.radius || 5,
                color: weapon.color || '#86efac',
                life: 180,
                type: 'twin',
                weapon: clone.weapon,
                element: weapon.element || null
            });
        }
        
        // Apply recoil for twin (2 shots = more kickback)
        clone.recoil = recoilKick;
        const kickbackStrength = recoilKick * profile.multiplier;
        const kickAngle = clone.turretAngle + Math.PI;
        clone.turretRecoilOffsetX = Math.cos(kickAngle) * kickbackStrength;
        clone.turretRecoilOffsetY = Math.sin(kickAngle) * kickbackStrength;
        clone.turretRecoilDecay = profile.decay;
        
        // Twin muzzle flash (both barrels)
        for (let side of [1, -1]) {
            for (let i = 0; i < 6; i++) {
                particles.push({
                    x: muzzleX + ox * side,
                    y: muzzleY + oy * side,
                    vx: Math.cos(clone.turretAngle) * (3 + Math.random() * 5) + (Math.random() - 0.5) * 3,
                    vy: Math.sin(clone.turretAngle) * (3 + Math.random() * 5) + (Math.random() - 0.5) * 3,
                    life: 15 + Math.random() * 10,
                    color: i % 2 === 0 ? (weapon.color || '#86efac') : '#ffffff',
                    size: 3 + Math.random() * 3
                });
            }
        }
        
    } else if (weapon.type === 'spread' || weapon.type === 'shotgun') {
        // SHOTGUN: Fire spread pattern
        for (let k = -1; k <= 1; k++) {
            const spreadAngle = clone.turretAngle + k * 0.2;
            bullets.push({
                x: muzzleX, y: muzzleY,
                vx: Math.cos(spreadAngle) * bulletSpeed,
                vy: Math.sin(spreadAngle) * bulletSpeed,
                dmg: bulletDamage,
                owner: 'clone',
                cloneIndex: playerClones.indexOf(clone),
                radius: weapon.radius || 5,
                color: weapon.color || '#86efac',
                life: 60,
                type: 'spread',
                weapon: clone.weapon,
                element: weapon.element || null
            });
        }
        
        // Shotgun kickback
        clone.recoil = recoilKick;
        const kickbackStrength = recoilKick * profile.multiplier;
        const kickAngle = clone.turretAngle + Math.PI;
        clone.turretRecoilOffsetX = Math.cos(kickAngle) * kickbackStrength;
        clone.turretRecoilOffsetY = Math.sin(kickAngle) * kickbackStrength;
        clone.turretRecoilDecay = profile.decay;
        
        // Shotgun muzzle flash
        for (let i = 0; i < 12; i++) {
            particles.push({
                x: muzzleX, y: muzzleY,
                vx: Math.cos(clone.turretAngle + (Math.random() - 0.5) * 0.4) * (4 + Math.random() * 5),
                vy: Math.sin(clone.turretAngle + (Math.random() - 0.5) * 0.4) * (4 + Math.random() * 5),
                life: 20 + Math.random() * 15,
                color: i < 6 ? (weapon.color || '#86efac') : '#888888',
                size: Math.random() * 4 + 2
            });
        }
        
    } else {
        // Default single-shot weapons (cannon, sniper, laser, etc.)
        bullets.push({
            x: muzzleX,
            y: muzzleY,
            vx: Math.cos(clone.turretAngle) * bulletSpeed,
            vy: Math.sin(clone.turretAngle) * bulletSpeed,
            dmg: bulletDamage,
            owner: 'clone',
            cloneIndex: playerClones.indexOf(clone),
            radius: weapon.radius || 5,
            color: weapon.color || '#86efac',
            life: 180,
            type: bulletType,
            weapon: clone.weapon,
            element: weapon.element || null
        });
        
        // Apply recoil to clone
        clone.recoil = recoilKick;
        const kickbackStrength = recoilKick * profile.multiplier;
        const kickAngle = clone.turretAngle + Math.PI + (Math.random() - 0.5) * profile.verticalBias * 2;
        clone.turretRecoilOffsetX = Math.cos(kickAngle) * kickbackStrength;
        clone.turretRecoilOffsetY = Math.sin(kickAngle) * kickbackStrength;
        clone.turretRecoilDecay = profile.decay;
        
        // Muzzle flash particles
        const muzzleColor = weapon.color || '#86efac';
        for (let i = 0; i < 8; i++) {
            particles.push({
                x: muzzleX,
                y: muzzleY,
                vx: Math.cos(clone.turretAngle) * (3 + Math.random() * 5) + (Math.random() - 0.5) * 3,
                vy: Math.sin(clone.turretAngle) * (3 + Math.random() * 5) + (Math.random() - 0.5) * 3,
                life: 15 + Math.random() * 10,
                color: i % 2 === 0 ? muzzleColor : '#ffffff',
                size: 3 + Math.random() * 3
            });
        }
    }
}

// Check if clones bullets should damage enemies (called from updateBullets)
function handleCloneBulletHit(bullet, target) {
    if (bullet.owner !== 'clone') return false;
    
    // Clone bullets damage enemies
    if (target.hp !== undefined) {
        target.hp -= bullet.damage;
        target.hitFlash = 5;
        if (target.hp <= 0) {
            return true; // Target killed
        }
    }
    return false;
}

// Apply ultimate beam damage per tick (called every frame during beam active)
// Beam penetrates everything - damages ALL entities in path, not just first hit
function applyUltimateBeamDamage(dt) {
    if (player.ultBeamTime <= 0) return;
    if (!player.ultBeamDamageTicks || player.ultBeamDamageTicks <= 0) return;
    
    // Initialize damage tracking if not exists
    if (!player.ultBeamDamageDealt) player.ultBeamDamageDealt = {};
    
    const angle = player.ultBeamAngle;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const startX = player.x + dirX * 40;
    const startY = player.y + dirY * 40;
    const beamLength = Math.max(WORLD_W, WORLD_H) * 2;
    const endX = startX + dirX * beamLength;
    const endY = startY + dirY * beamLength;
    const beamWidth = 140;
    
    // Calculate damage per tick based on remaining ticks
    const ticksRemaining = player.ultBeamDamageTicks;
    player.ultBeamDamageTicks = Math.max(0, ticksRemaining - dt);

    // Damage ALL enemies in beam path (penetrating)
    for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        const dist = distancePointToSegment(e.x, e.y, startX, startY, endX, endY);
        if (dist <= e.radius + beamWidth) {
            if (enemyHasSpawnShield && enemyHasSpawnShield(e)) continue;
            
            // Calculate max damage for this enemy (70% of max HP)
            const maxHp = e.maxHp || ENEMY_TIERS[e.id]?.hp || e.hp;
            const maxDamage = maxHp * ULT_BEAM_ENEMY_MAX_PERCENT;
            
            // Track damage dealt to this enemy
            const entityKey = 'enemy_' + j;
            if (!player.ultBeamDamageDealt[entityKey]) player.ultBeamDamageDealt[entityKey] = 0;
            
            // Calculate damage per tick (spread over ULT_BEAM_DPS_TICKS frames)
            const damagePerTick = (maxDamage / ULT_BEAM_DPS_TICKS) * dt;
            const remainingDamage = maxDamage - player.ultBeamDamageDealt[entityKey];
            let actualDamage = Math.min(damagePerTick, remainingDamage);
            
            if (actualDamage > 0) {
                // Check magic shield first - absorbs beam damage
                if (typeof handleMagicShieldDamage === 'function') {
                    actualDamage = handleMagicShieldDamage(e, actualDamage);
                }
                e.hp -= actualDamage;
                player.ultBeamDamageDealt[entityKey] += actualDamage;
                e.hitFlash = 5;
                // Spawn damage particles
                if (Math.random() < 0.3) {
                    createParticle(e.x + (Math.random() - 0.5) * 30, e.y + (Math.random() - 0.5) * 30, 'cyan', 3);
                }
                if (e.hp <= 0) killEnemy(j);
            }
        }
    }
    
    // Damage boss (penetrating - doesn't stop at boss)
    if (boss) {
        const bossDist = distancePointToSegment(boss.x, boss.y, startX, startY, endX, endY);
        if (bossDist <= boss.radius + beamWidth) {
            const maxDamage = boss.maxHp * ULT_BEAM_ENEMY_MAX_PERCENT;
            const entityKey = 'boss';
            if (!player.ultBeamDamageDealt[entityKey]) player.ultBeamDamageDealt[entityKey] = 0;
            
            const damagePerTick = (maxDamage / ULT_BEAM_DPS_TICKS) * dt;
            const remainingDamage = maxDamage - player.ultBeamDamageDealt[entityKey];
            const actualDamage = Math.min(damagePerTick, remainingDamage);
            
            if (actualDamage > 0) {
                boss.hp -= actualDamage;
                player.ultBeamDamageDealt[entityKey] += actualDamage;
                // Track damage for ultimate trigger (cracks now auto-generated based on HP%)
                if (boss.recentDamage) {
                    boss.recentDamage.push({ amount: actualDamage, frame: frame });
                }
                // Track accumulated damage for sleeping boss
                if (boss.isSleeping && boss.accumulatedDamage !== undefined) {
                    boss.accumulatedDamage += actualDamage;
                }
                if (Math.random() < 0.4) createParticle(boss.x, boss.y, 'purple', 6);
                if (boss.hp <= 0) killBoss();
            }
        }
    }

    // Damage ALL walls in beam path (penetrating)
    for (let wIdx = walls.length - 1; wIdx >= 0; wIdx--) {
        const w = walls[wIdx];
        if (!w.destructible) continue;
        if (rectangleIntersectsBeam(w.x, w.y, w.w, w.h, startX, startY, endX, endY, beamWidth)) {
            const maxDamage = (w.maxHp || w.hp) * ULT_BEAM_STRUCTURE_MAX_PERCENT;
            const entityKey = 'wall_' + wIdx;
            if (!player.ultBeamDamageDealt[entityKey]) player.ultBeamDamageDealt[entityKey] = 0;
            
            const damagePerTick = (maxDamage / ULT_BEAM_DPS_TICKS) * dt;
            const remainingDamage = maxDamage - player.ultBeamDamageDealt[entityKey];
            const actualDamage = Math.min(damagePerTick, remainingDamage);
            
            if (actualDamage > 0) {
                w.hp -= actualDamage;
                player.ultBeamDamageDealt[entityKey] += actualDamage;
                if (w.hp <= 0) {
                    createExplosion(w.x + w.w / 2, w.y + w.h / 2, '#555');
                    score += 10;
                    walls.splice(wIdx, 1);
                }
            }
        }
    }

    // Damage ALL crates in beam path (penetrating)
    for (let k = crates.length - 1; k >= 0; k--) {
        const c = crates[k];
        if (rectangleIntersectsBeam(c.x, c.y, c.w, c.h, startX, startY, endX, endY, beamWidth)) {
            const maxDamage = (c.maxHp || c.hp) * ULT_BEAM_STRUCTURE_MAX_PERCENT;
            const entityKey = 'crate_' + k;
            if (!player.ultBeamDamageDealt[entityKey]) player.ultBeamDamageDealt[entityKey] = 0;
            
            const damagePerTick = (maxDamage / ULT_BEAM_DPS_TICKS) * dt;
            const remainingDamage = maxDamage - player.ultBeamDamageDealt[entityKey];
            const actualDamage = Math.min(damagePerTick, remainingDamage);
            
            if (actualDamage > 0) {
                c.hp -= actualDamage;
                player.ultBeamDamageDealt[entityKey] += actualDamage;
                if (c.hp <= 0) destroyCrate(c, k);
            }
        }
    }
    
    // Clean up damage tracking when beam ends
    if (player.ultBeamDamageTicks <= 0) {
        player.ultBeamDamageDealt = {};
    }
}

function distancePointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    let t = 0;
    if (lengthSq > 0) t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
}

function rectangleIntersectsBeam(rx, ry, rw, rh, x1, y1, x2, y2, beamWidth) {
    const points = [
        { x: rx, y: ry },
        { x: rx + rw, y: ry },
        { x: rx, y: ry + rh },
        { x: rx + rw, y: ry + rh },
        { x: rx + rw / 2, y: ry + rh / 2 }
    ];
    for (const p of points) {
        const dist = distancePointToSegment(p.x, p.y, x1, y1, x2, y2);
        if (dist <= beamWidth) return true;
    }
    if (x1 >= rx && x1 <= rx + rw && y1 >= ry && y1 <= ry + rh) return true;
    if (x2 >= rx && x2 <= rx + rw && y2 >= ry && y2 <= ry + rh) return true;
    return false;
}

function resetDeathSequenceState() {
    deathSequence.active = false;
    deathSequence.timer = 0;
    deathSequence.missionTriggered = false;
    deathSequence.stamp = 0;
}

function beginPlayerDeathSequence() {
    deathSequence.active = true;
    deathSequence.timer = 240; // Extended duration for more dramatic effect
    deathSequence.missionTriggered = false;
    const stampRef = performance.now();
    deathSequence.stamp = stampRef;
    player.consecutiveWaves = 0;
    player.tookDamageThisWave = false;
    if (typeof checkAchievements === 'function') {
        checkAchievements({ waveStreak: 0 });
    }
    player.hp = 0;
    player.vx = 0;
    player.vy = 0;
    player.isUlting = false;
    player.ultBeamTime = 0;
    player.firedUlt = false;
    
    // Check if this is FINAL death (no revives left) for extra dramatic effect
    const isFinalDeath = player.revives <= 0;
    
    // ==================== DRAMATIC DEATH SEQUENCE ====================
    
    // PHASE 1: Initial impact - violent shake and flash
    screenShake = isFinalDeath ? 50 : 30;
    
    // White flash shockwave
    particles.push({ 
        x: player.x, 
        y: player.y, 
        size: 80, 
        life: 25, 
        color: 'rgba(255,255,255,0.8)', 
        type: 'wave' 
    });
    
    // Primary explosion
    createExplosion(player.x, player.y, '#ef4444');
    
    // PHASE 2: Secondary explosions cascade (100-400ms)
    for (let i = 1; i <= (isFinalDeath ? 6 : 3); i++) {
        setTimeout(() => {
            if (deathSequence.stamp !== stampRef) return;
            const angle = (i / 6) * Math.PI * 2;
            const dist = 40 + Math.random() * 80;
            createExplosion(
                player.x + Math.cos(angle) * dist, 
                player.y + Math.sin(angle) * dist, 
                i % 2 === 0 ? '#fb923c' : '#ef4444'
            );
            screenShake = Math.max(screenShake, 15);
        }, i * 100);
    }
    
    // PHASE 3: Metal debris flying outward
    for (let i = 0; i < (isFinalDeath ? 60 : 30); i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 8;
        particles.push({
            x: player.x,
            y: player.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 80 + Math.random() * 40,
            color: i % 4 === 0 ? '#4A5568' : (i % 4 === 1 ? '#718096' : (i % 4 === 2 ? '#2D3748' : '#1A202C')),
            size: Math.random() * 6 + 3,
            gravity: 0.15,
            drag: 0.02
        });
    }
    
    // PHASE 4: Fire and smoke plume
    for (let i = 0; i < (isFinalDeath ? 50 : 25); i++) {
        setTimeout(() => {
            if (deathSequence.stamp !== stampRef) return;
            particles.push({
                x: player.x + (Math.random() - 0.5) * 40,
                y: player.y + (Math.random() - 0.5) * 40,
                vx: (Math.random() - 0.5) * 3,
                vy: -3 - Math.random() * 4,
                life: 100 + Math.random() * 50,
                color: Math.random() > 0.5 ? '#ff6b35' : '#ff4444',
                size: Math.random() * 10 + 5,
                gravity: -0.08,
                drag: 0.02
            });
        }, i * 20);
    }
    
    // PHASE 5: Black smoke rising (for final death - more dramatic)
    if (isFinalDeath) {
        for (let i = 0; i < 40; i++) {
            setTimeout(() => {
                if (deathSequence.stamp !== stampRef) return;
                particles.push({
                    x: player.x + (Math.random() - 0.5) * 50,
                    y: player.y,
                    vx: (Math.random() - 0.5) * 2,
                    vy: -2 - Math.random() * 3,
                    life: 150 + Math.random() * 50,
                    color: `rgba(30, 30, 30, ${0.4 + Math.random() * 0.3})`,
                    size: Math.random() * 20 + 10,
                    gravity: -0.04,
                    drag: 0.01
                });
            }, 200 + i * 30);
        }
        
        // PHASE 6: Final flash and darkening (emotional impact)
        setTimeout(() => {
            if (deathSequence.stamp !== stampRef) return;
            // Massive final shockwave
            particles.push({ 
                x: player.x, 
                y: player.y, 
                size: 200, 
                life: 50, 
                color: 'rgba(200, 50, 50, 0.4)', 
                type: 'wave' 
            });
            screenShake = 40;
        }, 600);
        
        // PHASE 7: Falling embers (sad, fading effect)
        setTimeout(() => {
            if (deathSequence.stamp !== stampRef) return;
            for (let i = 0; i < 30; i++) {
                setTimeout(() => {
                    if (deathSequence.stamp !== stampRef) return;
                    const spawnX = player.x + (Math.random() - 0.5) * 150;
                    particles.push({
                        x: spawnX,
                        y: player.y - 80 - Math.random() * 40,
                        vx: (Math.random() - 0.5) * 0.8,
                        vy: 1 + Math.random() * 1.5,
                        life: 120,
                        color: i % 3 === 0 ? '#ff6b35' : (i % 3 === 1 ? '#fbbf24' : '#ef4444'),
                        size: Math.random() * 4 + 2,
                        gravity: 0.02,
                        drag: 0.01
                    });
                }, i * 50);
            }
        }, 800);
    }
}

function updateDeathSequence(dt) {
    if (!deathSequence.active) return;
    deathSequence.timer -= dt;
    
    const isFinalDeath = player.revives <= 0;
    const timerRatio = deathSequence.timer / 240; // 0 to 1 based on remaining time
    
    // Continuous fire and sparks during death sequence
    if (Math.random() < 2.5 * dt) {
        const radius = Math.random() * 50;
        const angle = Math.random() * Math.PI * 2;
        particles.push({
            x: player.x + Math.cos(angle) * radius,
            y: player.y + Math.sin(angle) * radius,
            vx: (Math.random() - 0.5) * 4,
            vy: -2 - Math.random() * 3,
            life: 60 + Math.random() * 30,
            color: Math.random() > 0.6 ? '#ff6b35' : (Math.random() > 0.3 ? '#fbbf24' : '#ef4444'),
            size: Math.random() * 6 + 3,
            gravity: -0.06,
            drag: 0.03
        });
    }
    
    // Continuous sparks flying out
    if (Math.random() < 1.5 * dt) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 5;
        particles.push({
            x: player.x + (Math.random() - 0.5) * 30,
            y: player.y + (Math.random() - 0.5) * 30,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 40,
            color: '#ffeb3b',
            size: Math.random() * 3 + 1,
            gravity: 0.1,
            drag: 0.02
        });
    }
    
    // Smoke rising (more intense for final death)
    if (Math.random() < (isFinalDeath ? 1.8 : 0.8) * dt) {
        particles.push({
            x: player.x + (Math.random() - 0.5) * 40,
            y: player.y + (Math.random() - 0.5) * 20,
            vx: (Math.random() - 0.5) * 1.5,
            vy: -1.5 - Math.random() * 2,
            life: 100 + Math.random() * 60,
            color: `rgba(40, 40, 40, ${0.3 + Math.random() * 0.2})`,
            size: Math.random() * 15 + 8,
            gravity: -0.03,
            drag: 0.01
        });
    }
    
    // Occasional pulse/shockwave during death
    if (Math.random() < 0.3 * dt && timerRatio > 0.3) {
        particles.push({ 
            x: player.x, 
            y: player.y, 
            size: 40 + Math.random() * 30, 
            life: 20, 
            color: 'rgba(255, 100, 50, 0.3)', 
            type: 'wave' 
        });
    }
    
    // Subtle screen shake during death
    if (Math.random() < 0.4 * dt) {
        screenShake = Math.max(screenShake, 5 + Math.random() * 8);
    }
    
    if (deathSequence.timer <= 0 && !deathSequence.missionTriggered) completeDeathSequence();
}

function completeDeathSequence() {
    deathSequence.missionTriggered = true;
    deathSequence.active = false;
    deathSequence.timer = 0;
    deathSequence.stamp = 0;
    
    // Check if player has revives available
    if (player.revives > 0) {
        player.revives--;

        // Core resources reset so revive feels like a true second chance
        player.hp = player.maxHp;
        player.energy = player.maxEnergy;
        player.overheated = false;
        player.rechargeDelay = 0;
        player.energyRegenDelay = 0;
        player.temperature = player.baseTemperature;
        player.killStreak = 0;
        player.ultReady = false;
        player.isUlting = false;
        player.ultTimer = 0;
        
        // === REVIVE SPAWN ANIMATION ===
        // Trigger the spawn effect (beam with two circles) by setting spawnWarmup
        // Use a shorter duration for revive (2 seconds vs 5 seconds for initial spawn)
        const REVIVE_SPAWN_DURATION = 120; // 2 seconds at 60fps
        player.spawnWarmup = REVIVE_SPAWN_DURATION;
        player.spawnWarmupMax = REVIVE_SPAWN_DURATION;
        // Mark player as reviving so render.js can use phoenix (pink/gold) colors
        player.isReviving = true;
        
        player.ultBeamTime = 0;
        player.firedUlt = false;
        player.buffTime = 0;
        player.recoil = 0;
        player.recoilRecoveryTime = 0; // Reset turret recoil lock on revive

        // Defensive layers - set maxArmor based on current maxHP
        player.maxArmor = Math.ceil(player.maxHp * 0.75);
        player.armor = player.maxArmor;
        player.shieldTime = 1200; // Extended shield (20 seconds)

        // Clear temporary power-ups and status effects
        player.invisible = false;
        player.invisibleTime = 0;
        player.turboActive = false;
        player.turboTime = 0;
        player.lifesteal = 0;
        player.lifestealTime = 0;
        player.autoAim = false;
        player.autoAimTime = 0;
        player.magnetActive = false;
        player.magnetTime = 0;
        player.stunned = false;
        player.stunnedTime = 0;
        player.frozen = false;
        player.frozenTime = 0;
        player.burning = false;
        player.burningTime = 0;
        player.slowed = false;
        player.slowedTime = 0;
        
        // Clear cursed burn effect (from boss touch) - revive purifies the curse
        player.cursedBurned = false;
        
        // ==================== EPIC PHOENIX REVIVE ANIMATION ====================
        
        // STAGE 1: Moment of Darkness (0ms)
        // Everything goes dark - ashes fall from where tank was destroyed
        screenShake = 20;
        for (let i = 0; i < 50; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 60;
            particles.push({
                x: player.x + Math.cos(angle) * dist,
                y: player.y + Math.sin(angle) * dist,
                vx: (Math.random() - 0.5) * 2,
                vy: 2 + Math.random() * 3,
                life: 60,
                color: `rgba(20, 20, 20, ${0.5 + Math.random() * 0.3})`,
                size: Math.random() * 5 + 2,
                gravity: 0.1,
                drag: 0.02
            });
        }
        
        // STAGE 2: Soul Energy Gathering (150ms)
        // Golden particles converge from all directions toward the tank
        setTimeout(() => {
            // Soul particles from all 8 directions
            for (let dir = 0; dir < 8; dir++) {
                const baseAngle = (dir / 8) * Math.PI * 2;
                for (let i = 0; i < 12; i++) {
                    const angle = baseAngle + (Math.random() - 0.5) * 0.4;
                    const radius = 150 + Math.random() * 100;
                    const startX = player.x + Math.cos(angle) * radius;
                    const startY = player.y + Math.sin(angle) * radius;
                    setTimeout(() => {
                        particles.push({
                            x: startX,
                            y: startY,
                            vx: -Math.cos(angle) * (6 + Math.random() * 4),
                            vy: -Math.sin(angle) * (6 + Math.random() * 4),
                            life: 40 + Math.random() * 20,
                            color: i % 3 === 0 ? '#fbbf24' : (i % 3 === 1 ? '#ff69b4' : '#ffffff'),
                            size: Math.random() * 6 + 3,
                            gravity: 0,
                            drag: 0.01
                        });
                    }, i * 25);
                }
            }
        }, 150);
        
        // STAGE 3: Ground Energy Rising (300ms)
        // Energy lines rise from beneath the tank like resurrection magic
        setTimeout(() => {
            for (let i = 0; i < 80; i++) {
                const angle = Math.random() * Math.PI * 2;
                const radius = 20 + Math.random() * 50;
                setTimeout(() => {
                    particles.push({
                        x: player.x + Math.cos(angle) * radius,
                        y: player.y + 60,
                        vx: (Math.random() - 0.5) * 1.5,
                        vy: -10 - Math.random() * 8,
                        life: 50 + Math.random() * 30,
                        color: i % 4 === 0 ? '#00ff88' : (i % 4 === 1 ? '#fbbf24' : (i % 4 === 2 ? '#ff69b4' : '#88ffff')),
                        size: Math.random() * 5 + 2,
                        gravity: -0.15,
                        drag: 0.02
                    });
                }, i * 8);
            }
        }, 300);
        
        // STAGE 4: Phoenix Core Ignition (500ms)
        // Bright flash at center - the phoenix awakens
        setTimeout(() => {
            screenShake = 35;
            
            // Blinding center flash
            particles.push({ 
                x: player.x, 
                y: player.y, 
                size: 120, 
                life: 30, 
                color: 'rgba(255, 255, 255, 0.9)', 
                type: 'wave' 
            });
            
            // Core ignition particles
            for (let i = 0; i < 100; i++) {
                const angle = (i / 100) * Math.PI * 2;
                const speed = 3 + Math.random() * 4;
                particles.push({
                    x: player.x,
                    y: player.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 50,
                    color: '#ffffff',
                    size: Math.random() * 4 + 2,
                    gravity: 0,
                    drag: 0.03
                });
            }
        }, 500);
        
        // STAGE 5: Phoenix Wings Burst (650ms)
        // Massive golden-pink explosion simulating phoenix wings spreading
        setTimeout(() => {
            screenShake = 50;
            
            // Main explosion rings
            for (let r = 0; r < 5; r++) {
                setTimeout(() => {
                    particles.push({ 
                        x: player.x, 
                        y: player.y, 
                        size: 80 + r * 60, 
                        life: 40 - r * 5, 
                        color: r % 2 === 0 ? 'rgba(255, 105, 180, 0.6)' : 'rgba(251, 191, 36, 0.6)', 
                        type: 'wave' 
                    });
                }, r * 80);
            }
            
            // Wing-like particle spread (horizontal emphasis)
            for (let i = 0; i < 150; i++) {
                const isHorizontal = Math.random() > 0.3;
                const angle = isHorizontal 
                    ? (Math.random() > 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.8
                    : Math.random() * Math.PI * 2;
                const speed = isHorizontal ? (12 + Math.random() * 10) : (6 + Math.random() * 6);
                
                particles.push({
                    x: player.x,
                    y: player.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - (isHorizontal ? 2 : 0),
                    life: 80 + Math.random() * 40,
                    color: i % 4 === 0 ? '#ffffff' : (i % 4 === 1 ? '#fbbf24' : (i % 4 === 2 ? '#ff69b4' : '#ff6600')),
                    size: Math.random() * 8 + 4,
                    gravity: isHorizontal ? -0.05 : 0.02,
                    drag: 0.025
                });
            }
            
            // Phoenix fire trail rising
            for (let i = 0; i < 60; i++) {
                setTimeout(() => {
                    particles.push({
                        x: player.x + (Math.random() - 0.5) * 40,
                        y: player.y + Math.random() * 20,
                        vx: (Math.random() - 0.5) * 5,
                        vy: -12 - Math.random() * 10,
                        life: 90,
                        color: i % 3 === 0 ? '#ff4500' : (i % 3 === 1 ? '#fbbf24' : '#ff69b4'),
                        size: Math.random() * 10 + 5,
                        gravity: -0.1,
                        drag: 0.015
                    });
                }, i * 12);
            }
        }, 650);
        
        // STAGE 6: Heavenly Light Descent (900ms)
        // Light rays descending from above like divine blessing
        setTimeout(() => {
            for (let i = 0; i < 50; i++) {
                const spreadX = (Math.random() - 0.5) * 80;
                setTimeout(() => {
                    particles.push({
                        x: player.x + spreadX,
                        y: player.y - 200,
                        vx: spreadX * -0.02,
                        vy: 15 + Math.random() * 8,
                        life: 50,
                        color: '#ffffff',
                        size: Math.random() * 5 + 3,
                        gravity: 0.3,
                        drag: 0.01
                    });
                }, i * 20);
            }
        }, 900);
        
        // STAGE 7: Protective Aura Formation (1100ms)
        // Swirling protective shield particles around tank
        setTimeout(() => {
            for (let ring = 0; ring < 3; ring++) {
                for (let i = 0; i < 20; i++) {
                    const angle = (i / 20) * Math.PI * 2 + ring * 0.3;
                    const radius = 40 + ring * 15;
                    setTimeout(() => {
                        particles.push({
                            x: player.x + Math.cos(angle) * radius,
                            y: player.y + Math.sin(angle) * radius,
                            vx: -Math.sin(angle) * 3,
                            vy: Math.cos(angle) * 3 - 1,
                            life: 60,
                            color: ring === 0 ? '#00ffff' : (ring === 1 ? '#fbbf24' : '#ff69b4'),
                            size: Math.random() * 5 + 3,
                            gravity: -0.02,
                            drag: 0.02
                        });
                    }, ring * 100 + i * 15);
                }
            }
        }, 1100);
        
        // STAGE 8: Final Empowerment Pulse (1400ms)
        // Last burst showing tank is fully restored
        setTimeout(() => {
            particles.push({ 
                x: player.x, 
                y: player.y, 
                size: 150, 
                life: 45, 
                color: 'rgba(0, 255, 200, 0.5)', 
                type: 'wave' 
            });
            
            // Celebration sparkles
            for (let i = 0; i < 40; i++) {
                const angle = Math.random() * Math.PI * 2;
                const radius = 30 + Math.random() * 40;
                particles.push({
                    x: player.x + Math.cos(angle) * radius,
                    y: player.y + Math.sin(angle) * radius,
                    vx: (Math.random() - 0.5) * 3,
                    vy: -3 - Math.random() * 4,
                    life: 70,
                    color: i % 2 === 0 ? '#fbbf24' : '#00ffff',
                    size: Math.random() * 4 + 2,
                    gravity: -0.03,
                    drag: 0.02
                });
            }
        }, 1400);
        
        return;
    }
    
    endGame(true);
}

function endGame(fromDeath = false) {
    // Save last score and update high score if needed
    localStorage.setItem('tankLastScore', score.toString());
    const highScore = parseInt(localStorage.getItem('tankHighestScore') || '0');
    if (score > highScore) {
        localStorage.setItem('tankHighestScore', score.toString());
    }
    
    if (typeof saveScore === 'function') {
        saveScore(score);
    }

    if (typeof checkAchievements === 'function') {
        checkAchievements({
            kills: player.kills || 0,
            totalKills: player.totalKills || 0,
            waves: player.currentWave - 1,
            waveStreak: player.consecutiveWaves || 0,
            maxStreak: player.bestKillStreak || 0,
            streak: player.killStreak || 0,
            score,
            sessionTime: gameTime
        });
    }
    
    document.getElementById('go-score').textContent = `SCORE: ${score}`;

    const finalizeGameOver = () => {
        missionFailPending = false;
        missionFailDelay = 0;
        missionFailCallback = null;
        state = 'MENU';
        const screen = document.getElementById('gameover-screen');
        screen.classList.remove('hidden');
        if (fromDeath) screen.classList.add('mission-failed-enter');
        else screen.classList.remove('mission-failed-enter');

        const gameCanvas = document.getElementById('gameCanvas');
        if (gameCanvas) gameCanvas.classList.remove('active');
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.classList.remove('active');

        if (typeof updateContinueButtonState === 'function') {
            updateContinueButtonState();
        }
    };

    if (fromDeath) {
        missionFailPending = true;
        missionFailDelay = Math.max(1, Math.round(1500 / 16.67));
        missionFailCallback = finalizeGameOver;
        state = 'MISSION_FAIL';
        return;
    }

    finalizeGameOver();
}

function spawnUltChargeSparks(dt) {
    const spawnCount = Math.max(1, Math.round(5 * dt));
    for (let i = 0; i < spawnCount; i++) {
        // Spawn particles in wide radius around player
        const spawnRadius = 200 + Math.random() * 150;
        const angle = Math.random() * Math.PI * 2;
        const sx = player.x + Math.cos(angle) * spawnRadius;
        const sy = player.y + Math.sin(angle) * spawnRadius;
        
        // Calculate radial direction toward player center
        const dx = player.x - sx;
        const dy = player.y - sy;
        const dist = Math.hypot(dx, dy);
        const radialPull = 0.15 + Math.random() * 0.08;
        
        particles.push({
            x: sx,
            y: sy,
            vx: (dx / dist) * radialPull * 8 + (Math.random() - 0.5) * 1,
            vy: (dy / dist) * radialPull * 8 + (Math.random() - 0.5) * 1,
            life: 60 + Math.random() * 20,
            color: Math.random() < 0.5 ? '#5eead4' : '#a5f3fc',
            size: Math.random() * 4 + 2,
            targetPlayer: true,
            seekStrength: 0.12 + Math.random() * 0.06,
            radialGravity: true
        });
    }
}
