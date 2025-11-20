// Entry point used by buttons; reinitializes everything so repeated runs feel
// consistent regardless of prior state.
function startGame() {
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.remove('mission-failed-enter');
    
    // Stop demo battle background
    if (typeof stopDemo === 'function') stopDemo();
    
    // Add canvas fade-in effect
    const gameCanvas = document.getElementById('gameCanvas');
    gameCanvas.classList.add('active');
    
    // Show UI layer when game starts
    document.getElementById('ui-layer').classList.add('active');
    
    state = 'GAME';
    paused = false;
    initWorld();
    spawnPlayer();
    resetDeathSequenceState();
    score = 0;
    frame = 0;
    lastTime = performance.now();
    enemies = [];
    bullets = [];
    particles = [];
    pickups = [];
    boss = null;
    bossActive = false;
    bossSpawned = false;

    // Seed a light enemy wave so the battlefield is alive instantly without
    // overwhelming the player during the opening moments.
    for (let i = 0; i < 12; i++) spawnEnemy();

    if (animationId) cancelAnimationFrame(animationId);
    loop(performance.now());
}

// Pause toggles the loop while keeping timestamps in sync for smooth resume.
function togglePause() {
    paused = !paused;
    if (paused) document.getElementById('pause-screen').classList.remove('hidden');
    else {
        document.getElementById('pause-screen').classList.add('hidden');
        lastTime = performance.now();
        loop(performance.now());
    }
}

// Return to menu overlay without refreshing the page; useful for touch UI.
function returnHome() {
    state = 'MENU';
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.remove('mission-failed-enter');
    document.getElementById('overlay').classList.remove('hidden');
    resetDeathSequenceState();
    
    // Update score display with current high score and last score
    updateScoreDisplay();
    
    // Fade out game canvas
    const gameCanvas = document.getElementById('gameCanvas');
    gameCanvas.classList.remove('active');
    
    // Hide UI layer
    document.getElementById('ui-layer').classList.remove('active');
    
    // Restart demo battle background with fade-in
    if (typeof stopDemo === 'function') stopDemo();
    if (typeof initDemo === 'function') {
        const demoCanvas = document.getElementById('demoCanvas');
        demoCanvas.classList.add('active');
        initDemo();
    }
}

// Update score display on homepage
function updateScoreDisplay() {
    const highScoresDiv = document.getElementById('high-scores-list');
    const highScore = parseInt(localStorage.getItem('tankHighestScore') || '0');
    const lastScore = parseInt(localStorage.getItem('tankLastScore') || '0');
    
    highScoresDiv.innerHTML = `
        <div class="score-card" style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 10px; background: rgba(139, 195, 74, 0.15); border-radius: 8px; border: 2px solid rgba(139, 195, 74, 0.4); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);">
            <span style="color: #a89070; font-size: 10px; letter-spacing: 2px; font-weight: 700; text-transform: uppercase; opacity: 0.85;">High Score</span>
            <span style="color: #8bc34a; font-weight: 900; font-size: 26px; font-family: 'Black Ops One', monospace; text-shadow: 0 0 18px rgba(139, 195, 74, 0.9), 2px 2px 8px rgba(0, 0, 0, 0.9); line-height: 1;">${highScore.toLocaleString()}</span>
        </div>
        <div class="score-divider" style="width: 2px; height: 2px; background: linear-gradient(to bottom, transparent, rgba(139, 115, 85, 0.6), transparent); margin: 2px 0;"></div>
        <div class="score-card" style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 10px; background: rgba(212, 197, 176, 0.12); border-radius: 8px; border: 2px solid rgba(212, 197, 176, 0.3); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);">
            <span style="color: #a89070; font-size: 10px; letter-spacing: 2px; font-weight: 700; text-transform: uppercase; opacity: 0.85;">Last Score</span>
            <span style="color: #d4c5b0; font-weight: 900; font-size: 26px; font-family: 'Black Ops One', monospace; text-shadow: 0 0 15px rgba(212, 197, 176, 0.6), 2px 2px 8px rgba(0, 0, 0, 0.9); line-height: 1;">${lastScore.toLocaleString()}</span>
        </div>
    `;
}

// Frame loop normalizes delta time so dynamics stay stable even when FPS dips.
function loop(timestamp) {
    if (state !== 'GAME' || paused) return;
    animationId = requestAnimationFrame(loop);
    let dt = (timestamp - lastTime) / 16.67;
    if (dt > 4) dt = 4;
    lastTime = timestamp;
    frame++;
    update(dt);
    draw();
}

// Main simulation step covers movement, targeting, entity updates, and spawn
// management in one pass to keep sequencing predictable.
function update(dt) {
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

    let isShooting = false;
    if (!playerDown) isShooting = input.aim.active || keys.up || keys.down || keys.left || keys.right || mouseAim.down;
    // Energy trickles back only when turrets cool down, encouraging bursts.
    if (!playerDown && (!isShooting || player.overheated)) {
        let regen = (player.overheated ? 0.5 : player.energyRegen) * dt;
        if (player.energy < player.maxEnergy) {
            player.energy += regen;
            if (player.energy >= player.maxEnergy) {
                player.energy = player.maxEnergy;
                player.overheated = false;
            }
        }
    }

    let spd = player.speedBase * (player.buffTime > 0 ? 1.4 : 1) * dt;
    if (player.isUlting) spd *= 0.2;
    let moveX = 0;
    let moveY = 0;
    if (!playerDown) {
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

    let nx = player.x + player.vx * dt;
    let ny = player.y + player.vy * dt;
    
    // Create player track marks (every 8 pixels of movement)
    const moved = Math.hypot(nx - player.x, ny - player.y);
    if (moved > 8 && frame % 3 === 0) {
        playerTracks.push({ x: player.x, y: player.y, angle: player.angle, alpha: 0.6, life: 450 });
        if (playerTracks.length > 800) playerTracks.shift(); // Limit track count
    }
    
    if (!checkWall(nx, player.y, player.radius) && !checkCrate(nx, player.y, player.radius)) player.x = nx;
    if (!checkWall(player.x, ny, player.radius) && !checkCrate(player.x, ny, player.radius)) player.y = ny;

    let aimAngle = player.turretAngle;
    let shouldFire = false;
    if (!playerDown) {
        if (input.aim.active) {
            aimAngle = input.aim.angle;
            shouldFire = true;
        } else if (mouseAim.active) {
            aimAngle = mouseAim.angle;
            if (mouseAim.down) shouldFire = true;
        } else if (keys.up || keys.down || keys.left || keys.right) {
            let kx = 0;
            let ky = 0;
            if (keys.up) ky -= 1;
            if (keys.down) ky += 1;
            if (keys.left) kx -= 1;
            if (keys.right) kx += 1;
            if (kx !== 0 || ky !== 0) {
                aimAngle = Math.atan2(ky, kx);
                shouldFire = true;
            }
        }
    }

    // Turret rotates with easing so heavy cannons feel weighty.
    if (!playerDown && shouldFire && !player.isUlting) {
        let diff = aimAngle - player.turretAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        player.turretAngle += diff * 0.5 * dt;
        if (!player.overheated) fireWeapon();
    } else if (!playerDown && mouseAim.active) {
        let diff = aimAngle - player.turretAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        player.turretAngle += diff * 0.5 * dt;
    }

    if (player.isUlting && !playerDown) {
        player.ultTimer -= dt;
        if (player.ultTimer > 60) {
            screenShake = 1;
            spawnUltChargeSparks(dt);
            // Activate shield during ultimate charging phase
            if (player.shieldTime < 300) player.shieldTime = 300;
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

    if (player.buffTime > 0) player.buffTime -= dt;
    if (player.recoil > 0) player.recoil *= Math.pow(0.8, dt);
    if (player.shieldTime > 0) {
        player.shieldTime -= dt;
        if (Math.random() < 0.1 * dt) createParticle(player.x + (Math.random() - 0.5) * 40, player.y + (Math.random() - 0.5) * 40, 'cyan', 1);
    }
    if (player.armor > 0) {
        if (Math.random() < 0.15 * dt) createParticle(player.x + (Math.random() - 0.5) * 40, player.y + (Math.random() - 0.5) * 40, '#38bdf8', 1);
    }
    
    // Overheat smoke effect
    if (player.overheated) {
        // Dense smoke rising from overheated tank
        if (Math.random() < 0.3 * dt) {
            particles.push({
                x: player.x + (Math.random() - 0.5) * 30,
                y: player.y + (Math.random() - 0.5) * 20,
                vx: (Math.random() - 0.5) * 2,
                vy: -3 - Math.random() * 3,
                life: 50 + Math.random() * 30,
                color: Math.random() < 0.5 ? '#666666' : '#888888',
                size: Math.random() * 8 + 5,
                gravity: -0.05,
                drag: 0.02
            });
        }
    }
    
    if (player.ultBeamTime > 0) {
        player.ultBeamTime = Math.max(0, player.ultBeamTime - dt);
        const beamDamagePerSecond = 400;
        const structureDamagePerSecond = Math.max(50, beamDamagePerSecond * 0.1);
        applyUltimateBeamDamage(beamDamagePerSecond * dt, structureDamagePerSecond * dt);
    }

    updateBullets(dt);
    updateEnemies(dt);
    resolveTankCollisions();
    updateBoss(dt);
    updatePickups();
    updateParticles(dt);
    
    // Update tank tracks (fade out over time)
    for (let i = playerTracks.length - 1; i >= 0; i--) {
        playerTracks[i].life--;
        playerTracks[i].alpha = Math.max(0, playerTracks[i].life / 450) * 0.6;
        if (playerTracks[i].life <= 0) playerTracks.splice(i, 1);
    }
    for (let i = enemyTracks.length - 1; i >= 0; i--) {
        enemyTracks[i].life--;
        enemyTracks[i].alpha = Math.max(0, enemyTracks[i].life / 350) * 0.4;
        if (enemyTracks[i].life <= 0) enemyTracks.splice(i, 1);
    }
    
    updateUI();

    if (player.hp <= 0 && !deathSequence.active) beginPlayerDeathSequence();
    updateDeathSequence(dt);

    if (!bossActive && enemies.length < 18 + score / 1500) {
        if (Math.random() < 0.05 * dt) spawnEnemy();
        if (score > 2000 && Math.random() < 0.02 * dt) spawnEnemy();
    }
    if (!bossSpawned && score > 5000 && enemies.length === 0) startBossFight();
}

// Collision helpers treat walls as axis-aligned boxes to keep tests cheap.
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
    return !checkWall(x, y, radius) && !checkCrate(x, y, radius);
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
    }
}

function separateEntities(a, b, bias = 0.5) {
    if (!a || !b) return;
    const radiusA = a.radius || player.radius;
    const radiusB = b.radius || player.radius;
    const minDist = (radiusA + radiusB) * 1.05; // Add 5% buffer to prevent constant touching
    let dx = b.x - a.x;
    let dy = b.y - a.y;
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
    // Use smaller push amounts to prevent visible "popping"
    const pushA = overlap * bias * 0.5;
    const pushB = overlap * (1 - bias) * 0.5;
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

// Fire weapon consumes energy, spawns projectile archetypes, and applies recoil
// so each weapon class retains a unique personality.
function fireWeapon() {
    if (frame - lastShot < WEAPONS[player.weapon].delay) return;
    const w = WEAPONS[player.weapon];
    if (player.energy >= w.cost) {
        player.energy -= w.cost;
        player.energyRegenDelay = player.energyRegenDelayMax;
    } else {
        player.overheated = true;
        addFloatText('OVERHEAT', player.x, player.y, 'red');
        return;
    }
    lastShot = frame;
    
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
    const recoilInstability = Math.min(player.consecutiveShots * 0.02, 0.15);
    const accurateAngle = applyWeaponAccuracy(player.turretAngle, player.weapon, false) + (Math.random() - 0.5) * recoilInstability;
    player.turretAngle = accurateAngle;
    
    // Apply recoil kick
    const recoilKick = getWeaponRecoilValue(player.weapon);
    player.recoil = recoilKick;
    
    // Calculate muzzle position - bullets ALWAYS spawn from turret tip
    // Use the CURRENT turret angle (already has accuracy applied)
    const muzzleDistance = getMuzzleDistanceFromRecoil(player.recoil, 35);
    let ax = player.x + Math.cos(player.turretAngle) * muzzleDistance;
    let ay = player.y + Math.sin(player.turretAngle) * muzzleDistance;
    
    // Bullets fire in EXACT turret direction (no additional spread)
    const firedAngle = player.turretAngle;
    
    let wStats = WEAPONS[player.weapon];
    let speed = wStats.speed;
    let dmg = wStats.dmg;
    let color = wStats.color;
    const originX = player.x;
    const originY = player.y;

    if (wStats.type === 'spread') {
        for (let i = -2; i <= 2; i++) {
            let a = firedAngle + i * 0.15;
            bullets.push({ x: ax, y: ay, prevX: originX, prevY: originY, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 60, color: color, dmg: dmg, isEnemy: false });
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
        bullets.push({ x: ax + ox, y: ay + oy, prevX: originX, prevY: originY, vx: Math.cos(firedAngle) * speed, vy: Math.sin(firedAngle) * speed, life: 80, color: color, dmg: dmg, isEnemy: false });
        bullets.push({ x: ax - ox, y: ay - oy, prevX: originX, prevY: originY, vx: Math.cos(firedAngle) * speed, vy: Math.sin(firedAngle) * speed, life: 80, color: color, dmg: dmg, isEnemy: false });
        // Twin cannon symmetric muzzle flashes
        for (let side of [1, -1]) {
            const sideX = ax + ox * side;
            const sideY = ay + oy * side;
            for (let i = 0; i < 8; i++) {
                particles.push({
                    x: sideX,
                    y: sideY,
                    vx: Math.cos(firedAngle) * (6 + Math.random() * 4) + (Math.random() - 0.5) * 2,
                    vy: Math.sin(firedAngle) * (6 + Math.random() * 4) + (Math.random() - 0.5) * 2,
                    life: 12 + Math.random() * 8,
                    color: color,
                    size: Math.random() * 4 + 2,
                    gravity: 0,
                    drag: 0.12
                });
            }
        }
    } else if (wStats.type === 'burst') {
        const burstOriginX = originX;
        const burstOriginY = originY;
        const burstAngle = firedAngle;
        const burstMuzzle = muzzleDistance;
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                let bx = burstOriginX + Math.cos(burstAngle) * burstMuzzle;
                let by = burstOriginY + Math.sin(burstAngle) * burstMuzzle;
                bullets.push({ x: bx, y: by, prevX: burstOriginX, prevY: burstOriginY, vx: Math.cos(burstAngle) * speed, vy: Math.sin(burstAngle) * speed, life: 80, color: color, dmg: dmg, isEnemy: false });
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
            }, i * 100);
        }
        screenShake = 3;
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
        bullets.push({ x: ax, y: ay, prevX: originX, prevY: originY, vx: Math.cos(firedAngle) * speed, vy: Math.sin(firedAngle) * speed, life: wStats.type === 'sniper' ? 60 : 100, color: color, dmg: dmg, isEnemy: false, type: wStats.type });
        
        // Weapon-specific muzzle effects
        if (player.weapon === 'cannon') {
            // Cannon - Standard powerful blast
            for (let i = 0; i < 15; i++) {
                particles.push({
                    x: ax,
                    y: ay,
                    vx: Math.cos(firedAngle) * (8 + Math.random() * 6) + (Math.random() - 0.5) * 3,
                    vy: Math.sin(firedAngle) * (8 + Math.random() * 6) + (Math.random() - 0.5) * 3,
                    life: 15 + Math.random() * 10,
                    color: color,
                    size: Math.random() * 5 + 3,
                    gravity: 0,
                    drag: 0.15
                });
            }
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
}

function getWeaponRecoilValue(weaponKey) {
    return WEAPONS[weaponKey]?.recoil ?? 8;
}

function getMuzzleDistanceFromRecoil(recoilAmount, baseLength = 35) {
    return Math.max(15, baseLength - (recoilAmount || 0));
}

// Ultimate beam deletes everything along its path, including scenery, to reward
// maintaining high kill streaks.
function fireUltimate() {
    screenShake = 70;
    const beamDamage = 400;
    const structureDamage = Math.max(50, beamDamage * 0.1);
    player.ultBeamTime = 120;
    player.ultBeamAngle = player.turretAngle;
    const muzzleX = player.x + Math.cos(player.turretAngle) * 40;
    const muzzleY = player.y + Math.sin(player.turretAngle) * 40;
    for (let i = 0; i < 80; i++) {
        particles.push({ x: muzzleX, y: muzzleY, vx: (Math.random() - 0.5) * 35, vy: (Math.random() - 0.5) * 35, life: 100, color: 'cyan', size: 6 });
    }
    const beamTrailLength = Math.max(WORLD_W, WORLD_H) * 2;
    for (let i = 0; i <= beamTrailLength; i += 60) {
        const cx = muzzleX + Math.cos(player.turretAngle) * i;
        const cy = muzzleY + Math.sin(player.turretAngle) * i;
        createParticle(cx, cy, 'rgba(0,255,255,0.6)', 4);
    }
    applyUltimateBeamDamage(beamDamage, structureDamage);
}

function applyUltimateBeamDamage(beamDamage, structureDamage) {
    if (player.ultBeamTime <= 0) return;
    const angle = player.ultBeamAngle;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const startX = player.x + dirX * 40;
    const startY = player.y + dirY * 40;
    const beamLength = Math.max(WORLD_W, WORLD_H) * 2;
    const endX = startX + dirX * beamLength;
    const endY = startY + dirY * beamLength;
    const beamWidth = 140;

    for (let j = enemies.length - 1; j >= 0; j--) {
        const dist = distancePointToSegment(enemies[j].x, enemies[j].y, startX, startY, endX, endY);
        if (dist <= enemies[j].radius + beamWidth) {
            enemies[j].hp -= beamDamage;
            enemies[j].hitFlash = 10;
            if (enemies[j].hp <= 0) killEnemy(j);
        }
    }
    if (boss) {
        const bossDist = distancePointToSegment(boss.x, boss.y, startX, startY, endX, endY);
        if (bossDist <= boss.radius + beamWidth) {
            boss.hp -= beamDamage;
            createParticle(boss.x, boss.y, 'purple', 6);
            if (boss.hp <= 0) killBoss();
        }
    }

    for (let wIdx = walls.length - 1; wIdx >= 0; wIdx--) {
        const w = walls[wIdx];
        if (!w.destructible) continue;
        if (rectangleIntersectsBeam(w.x, w.y, w.w, w.h, startX, startY, endX, endY, beamWidth)) {
            w.hp -= structureDamage;
            if (w.hp <= 0) {
                createExplosion(w.x + w.w / 2, w.y + w.h / 2, '#555');
                score += 10;
                walls.splice(wIdx, 1);
            }
        }
    }

    for (let k = crates.length - 1; k >= 0; k--) {
        const c = crates[k];
        if (rectangleIntersectsBeam(c.x, c.y, c.w, c.h, startX, startY, endX, endY, beamWidth)) {
            c.hp -= structureDamage;
            if (c.hp <= 0) destroyCrate(c, k);
        }
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
    deathSequence.timer = 120;
    deathSequence.missionTriggered = false;
    const stampRef = performance.now();
    deathSequence.stamp = stampRef;
    player.hp = 0;
    player.vx = 0;
    player.vy = 0;
    player.isUlting = false;
    player.ultBeamTime = 0;
    player.firedUlt = false;
    screenShake = 30;
    createExplosion(player.x, player.y, '#ef4444');
    particles.push({ x: player.x, y: player.y, size: 50, life: 30, color: 'rgba(255,255,255,0.4)', type: 'wave' });
    for (let i = 1; i <= 3; i++) {
        setTimeout(() => {
            if (deathSequence.stamp !== stampRef) return;
            createExplosion(player.x + (Math.random() - 0.5) * 160, player.y + (Math.random() - 0.5) * 160, '#fb923c');
        }, i * 140);
    }
}

function updateDeathSequence(dt) {
    if (!deathSequence.active) return;
    deathSequence.timer -= dt;
    if (Math.random() < 1.4 * dt) {
        const radius = Math.random() * 60;
        const angle = Math.random() * Math.PI * 2;
        particles.push({
            x: player.x + Math.cos(angle) * radius,
            y: player.y + Math.sin(angle) * radius,
            vx: (Math.random() - 0.5) * 6,
            vy: -Math.random() * 2,
            life: 50,
            color: '#fee2e2',
            size: Math.random() * 4 + 2,
            gravity: 0.3,
            drag: 0.04,
            targetPlayer: true,
            seekStrength: 0.05
        });
    }
    if (Math.random() < 0.5 * dt) particles.push({ x: player.x, y: player.y, size: 30 + Math.random() * 40, life: 25, color: 'rgba(255,255,255,0.25)', type: 'wave' });
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
        player.hp = player.maxHp;
        player.armor = player.maxArmor;
        player.shieldTime = 600;
        player.killStreak = 0; // Reset kill streak on revive
        
        // STAGE 1: Defeat moment - Dark particles falling
        for (let i = 0; i < 30; i++) {
            particles.push({
                x: player.x,
                y: player.y,
                vx: (Math.random() - 0.5) * 3,
                vy: Math.random() * 4 + 2,
                life: 40,
                color: '#333333',
                size: Math.random() * 4 + 2,
                gravity: 0.15,
                drag: 0.05
            });
        }
        
        // STAGE 2: Resurrection energy gathering (100ms delay)
        setTimeout(() => {
            // Energy particles rising from ground
            for (let i = 0; i < 60; i++) {
                const angle = Math.random() * Math.PI * 2;
                const radius = 80 + Math.random() * 60;
                particles.push({
                    x: player.x + Math.cos(angle) * radius,
                    y: player.y + Math.sin(angle) * radius + 40,
                    vx: -Math.cos(angle) * 2,
                    vy: -Math.sin(angle) * 2 - 4,
                    life: 50,
                    color: i % 2 === 0 ? '#fbbf24' : '#ff69b4',
                    size: Math.random() * 5 + 2,
                    gravity: -0.15,
                    drag: 0.03
                });
            }
        }, 100);
        
        // STAGE 3: Phoenix rebirth explosion (250ms delay)
        setTimeout(() => {
            // Massive radial burst - resurrection blast
            for (let i = 0; i < 120; i++) {
                const angle = (i / 120) * Math.PI * 2;
                const speed = 10 + Math.random() * 8;
                const layer = Math.floor(i / 40);
                particles.push({
                    x: player.x,
                    y: player.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 70 + Math.random() * 30,
                    color: layer === 0 ? '#ffffff' : (layer === 1 ? '#fbbf24' : '#ff69b4'),
                    size: Math.random() * 8 + 4,
                    gravity: -0.08,
                    drag: 0.04
                });
            }
            
            // Rising phoenix flames
            for (let i = 0; i < 50; i++) {
                particles.push({
                    x: player.x + (Math.random() - 0.5) * 30,
                    y: player.y + Math.random() * 20,
                    vx: (Math.random() - 0.5) * 4,
                    vy: -8 - Math.random() * 6,
                    life: 80,
                    color: i % 3 === 0 ? '#ff6600' : (i % 3 === 1 ? '#fbbf24' : '#ff69b4'),
                    size: Math.random() * 7 + 3,
                    gravity: -0.12,
                    drag: 0.02
                });
            }
        }, 250);
        
        // STAGE 4: Divine light rays (400ms delay)
        setTimeout(() => {
            // Heavenly light pillars
            for (let i = 0; i < 40; i++) {
                particles.push({
                    x: player.x + (Math.random() - 0.5) * 40,
                    y: player.y - 50,
                    vx: (Math.random() - 0.5) * 2,
                    vy: -12 - Math.random() * 8,
                    life: 60,
                    color: '#ffffff',
                    size: Math.random() * 6 + 3,
                    gravity: -0.05,
                    drag: 0.01
                });
            }
        }, 400);
        
        // STAGE 5: Multiple shockwave rings
        for (let r = 0; r < 4; r++) {
            setTimeout(() => {
                particles.push({ 
                    x: player.x, 
                    y: player.y, 
                    size: 70 + r * 50, 
                    life: 35, 
                    color: r % 2 === 0 ? 'rgba(255,105,180,0.5)' : 'rgba(251,191,36,0.5)', 
                    type: 'wave' 
                });
            }, r * 120);
        }
        
        // STAGE 6: Lingering aura particles (sustained effect)
        setTimeout(() => {
            for (let i = 0; i < 30; i++) {
                setTimeout(() => {
                    const angle = Math.random() * Math.PI * 2;
                    const radius = 25 + Math.random() * 15;
                    particles.push({
                        x: player.x + Math.cos(angle) * radius,
                        y: player.y + Math.sin(angle) * radius,
                        vx: 0,
                        vy: -2 - Math.random() * 2,
                        life: 50,
                        color: i % 2 === 0 ? '#fbbf24' : '#ff69b4',
                        size: Math.random() * 4 + 2,
                        gravity: -0.05,
                        drag: 0.05
                    });
                }, i * 30);
            }
        }, 500);
        
        return;
    }
    
    endGame(true);
}

function endGame(fromDeath = false) {
    state = 'MENU';
    
    // Save last score and update high score if needed
    // Use standardized keys matching ui.js
    localStorage.setItem('tankLastScore', score.toString());
    const highScore = parseInt(localStorage.getItem('tankHighestScore') || '0');
    if (score > highScore) {
        localStorage.setItem('tankHighestScore', score.toString());
    }
    
    // Also try to use the UI helper if available to ensure display updates
    if (typeof saveScore === 'function') {
        saveScore(score);
    }
    
    document.getElementById('go-score').textContent = `SCORE: ${score}`;
    
    // Add delay to show tank destruction before mission failed screen
    const delay = fromDeath ? 1500 : 0;
    setTimeout(() => {
        document.getElementById('gameover-screen').classList.remove('hidden');
        if (fromDeath) {
            document.getElementById('gameover-screen').classList.add('mission-failed-enter');
        }
    }, delay);
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
