const MAX_SIMULTANEOUS_ATTACKERS = 3;
const ENEMY_AGGRO_RADIUS = 1100;
const ENEMY_STANDOFF_RADIUS = 360;

// Projectiles handle terrain destruction, enemy hits, and boss interactions in
// one sweep to guarantee deterministic behavior regardless of spawn order.
function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        const startX = b.prevX ?? b.x;
        const startY = b.prevY ?? b.y;
        const targetX = b.x + b.vx * dt;
        const targetY = b.y + b.vy * dt;
        const distance = Math.hypot(targetX - startX, targetY - startY);
        const steps = Math.max(1, Math.ceil(distance / 8));
        const stepX = (targetX - startX) / steps;
        const stepY = (targetY - startY) / steps;
        let hit = false;
        let curX = startX;
        let curY = startY;

        for (let s = 0; s < steps; s++) {
            curX += stepX;
            curY += stepY;
            b.x = curX;
            b.y = curY;
            if (handleBulletCollision(b)) {
                hit = true;
                break;
            }
        }

        b.prevX = b.x;
        b.prevY = b.y;
        b.life -= dt;
        if (hit || b.life <= 0) bullets.splice(i, 1);
    }
}

function handleBulletCollision(b) {
    for (let wIdx = walls.length - 1; wIdx >= 0; wIdx--) {
        let w = walls[wIdx];
        if (b.x > w.x && b.x < w.x + w.w && b.y > w.y && b.y < w.y + w.h) {
            createParticle(b.x, b.y, b.color, 3);
            if (w.destructible) {
                w.hp -= b.dmg;
                if (w.hp <= 0) {
                    createExplosion(w.x + w.w / 2, w.y + w.h / 2, '#555');
                    score += 10;
                    walls.splice(wIdx, 1);
                }
            }
            return true;
        }
    }

    for (let k = crates.length - 1; k >= 0; k--) {
        let c = crates[k];
        if (b.x > c.x && b.x < c.x + c.w && b.y > c.y && b.y < c.y + c.h) {
            createParticle(b.x, b.y, '#d97706', 3);
            let dmg = b.isEnemy ? b.dmg * 0.1 : b.dmg;
            c.hp -= dmg;
            if (c.hp <= 0) destroyCrate(c, k);
            return true;
        }
    }

    if (b.isEnemy && Math.hypot(b.x - player.x, b.y - player.y) < player.radius) {
        if (player.shieldTime > 0) createParticle(b.x, b.y, 'cyan', 5);
        else takeDamage(b.dmg);
        return true;
    }

    if (!b.isEnemy) {
        for (let j = enemies.length - 1; j >= 0; j--) {
            if (Math.hypot(b.x - enemies[j].x, b.y - enemies[j].y) < enemies[j].radius + 10) {
                enemies[j].hp -= b.dmg;
                enemies[j].hitFlash = 5;
                createParticle(b.x, b.y, b.color, 2);
                if (enemies[j].hp <= 0) killEnemy(j);
                return true;
            }
        }
        if (boss && Math.hypot(b.x - boss.x, b.y - boss.y) < boss.radius) {
            boss.hp -= b.dmg;
            createParticle(b.x, b.y, 'purple', 3);
            if (boss.hp <= 0) killBoss();
            return true;
        }
    }

    return false;
}

// Enemy AI mixes aggro prioritization with guard duties so not every bot rushes
// the player at once.
function updateEnemies(dt) {
    let attackers = [];
    let distances = enemies.map((e, idx) => ({
        enemy: e,
        index: idx,
        distance: Math.hypot(e.x - player.x, e.y - player.y)
    }));
    distances.sort((a, b) => a.distance - b.distance);
    for (let entry of distances) {
        if (entry.distance > ENEMY_AGGRO_RADIUS) break;
        attackers.push(entry.enemy);
        if (attackers.length >= MAX_SIMULTANEOUS_ATTACKERS) break;
    }
    const rankMap = new Map();
    distances.forEach((entry, idx) => rankMap.set(entry.enemy, idx));

    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        ensureGuardData(e);
        resolveEnemyWallPenetration(e);
        if (e.hitFlash > 0) e.hitFlash -= dt;
        if (e.recoil === undefined) e.recoil = 0;
        else if (e.recoil > 0) {
            e.recoil *= Math.pow(0.85, dt);
            if (e.recoil < 0.05) e.recoil = 0;
        }

        e.queueAngle = e.queueAngle ?? Math.random() * Math.PI * 2;

        if (!e.stuckTimer) e.stuckTimer = 0;
        if (!e.lastX) {
            e.lastX = e.x;
            e.lastY = e.y;
        }
        if (Math.hypot(e.x - e.lastX, e.y - e.lastY) < 1 * dt) e.stuckTimer += dt;
        else e.stuckTimer = 0;
        if (e.stuckTimer > 45) forceEnemyUnstuck(e);
        e.lastX = e.x;
        e.lastY = e.y;

        let d = Math.hypot(e.x - player.x, e.y - player.y);
        if (d < 2000) {
            let targetAngle = Math.atan2(player.y - e.y, player.x - e.x);
            let hasLOS = checkLineOfSight(e.x, e.y, player.x, player.y);

            // Intelligence system: track last known player position
            if (hasLOS) {
                e.lastKnownPlayerX = player.x;
                e.lastKnownPlayerY = player.y;
                e.timeSinceLastSeen = 0;
            } else {
                if (!e.timeSinceLastSeen) e.timeSinceLastSeen = 0;
                e.timeSinceLastSeen += dt;
            }

            // Only aim turret at player if we have line of sight
            if (hasLOS) {
                let aimAngle = targetAngle;
                if (e.id >= 2) {
                    // Higher-tier bots lead their shots to punish predictable motion.
                    let bulletSpeed = 8 + e.id * 2;
                    let timeToHit = d / bulletSpeed;
                    let predictX = player.x + player.vx * timeToHit * 0.5;
                    let predictY = player.y + player.vy * timeToHit * 0.5;
                    aimAngle = Math.atan2(predictY - e.y, predictX - e.x);
                }

                let dynamicError = e.err * (1 + Math.max(0, (d - 400) / 1000));
                let desiredAngle = aimAngle + updateEnemyTurretError(e, d, dt) + ((Math.random() - 0.5) * dynamicError * 0.1);
                let diff = desiredAngle - e.turretAngle;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;

                let aimSpeed = ENEMY_TIERS[e.id].aimSpeed || 0.1;
                e.turretAngle += diff * aimSpeed * dt;
            } else {
                // No LOS - turret points forward while searching for player
                let diff = e.angle - e.turretAngle;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                e.turretAngle += diff * 0.08 * dt;
            }

            let isAggro = attackers.includes(e);
            const rank = rankMap.get(e) ?? enemies.length;
            const queuedAttacker = !isAggro && rank >= attackers.length;
            let moveAngle = e.angle;
            let speedMult = 1.0;
            const unstuckOverride = consumeUnstuckVector(e, dt);
            
            // Pursuit mechanic: Higher tier enemies chase player more aggressively
            const intelligence = ENEMY_TIERS[e.id]?.intelligence || 1;
            // Increased pursuit radius - Tier 0: 1500, Tier 4: 3500
            const pursuitRadius = 1000 + (intelligence * 500); 
            // Increased speed bonus - Tier 4 gets +1.0 speed bonus when chasing
            const aggressivenessBonus = intelligence * 0.25; 
            // Pursuit overrides queue behavior for more aggressive chase
            const isPursuing = d < pursuitRadius;

            if (unstuckOverride !== null) {
                // Forced steering prevents AI from vibrating against walls for too
                // long. Biasing speed encourages decisive exits.
                moveAngle = unstuckOverride;
                speedMult = 1.1;
            } else if (isAggro || (isPursuing && !queuedAttacker)) {
                // Advanced AI: Use hunting strategy based on intelligence level
                // Pursuit mode activates for enemies within range who aren't queued
                
                if (!hasLOS && e.lastKnownPlayerX !== undefined) {
                    // Player is hiding - use intelligent search strategy
                    const huntingStrategy = getHuntingStrategy(e, intelligence, dt);
                    moveAngle = huntingStrategy.angle;
                    // Apply aggressive speed bonus during pursuit
                    speedMult = huntingStrategy.speedMult + (isPursuing && !isAggro ? aggressivenessBonus * 0.8 : 0);
                } else if (!hasLOS || pathBlocked(e, targetAngle)) {
                    // Path blocked - find alternative route
                    const alternativePath = findPathAroundObstacle(e, targetAngle);
                    moveAngle = alternativePath;
                    // Maintain speed during pursuit even when blocked
                    speedMult = 1.0 + (isPursuing && !isAggro ? aggressivenessBonus : 0);
                } else {
                    // Clear path - direct pursuit/approach
                    moveAngle = targetAngle;
                    // Higher tier = more aggressive chase speed (up to +1.5x speed for Tier 4)
                    speedMult = 1.0 + (isPursuing && !isAggro ? aggressivenessBonus * 1.5 : 0);
                }
            } else if (queuedAttacker) {
                e.queueAngle += 0.01 * dt;
                const queueRadius = 360 + Math.min(520, (rank - attackers.length + 1) * 40);
                const anchorX = player.x + Math.cos(e.queueAngle) * queueRadius;
                const anchorY = player.y + Math.sin(e.queueAngle) * queueRadius;
                moveAngle = Math.atan2(anchorY - e.y, anchorX - e.x);
                const distToAnchor = Math.hypot(anchorX - e.x, anchorY - e.y);
                speedMult = distToAnchor > 30 ? 0.9 : 0;
                const comfortableGap = queueRadius * 0.7;
                if (d < comfortableGap || d < ENEMY_STANDOFF_RADIUS) {
                    moveAngle = Math.atan2(e.y - player.y, e.x - player.x);
                    speedMult = 1.05;
                }
            } else {
                // Patrol mode - only when far away and not pursuing
                moveAngle = runGuardPatrol(e, dt);
                speedMult = 0.65;
                // Emergency retreat if player gets too close during patrol
                if (d < ENEMY_STANDOFF_RADIUS * 0.8) {
                    moveAngle = Math.atan2(e.y - player.y, e.x - player.x);
                    speedMult = 1.1;
                }
            }

            moveAngle += findAvoidanceAngle(e, moveAngle);

            let diffMove = moveAngle - e.angle;
            while (diffMove < -Math.PI) diffMove += Math.PI * 2;
            while (diffMove > Math.PI) diffMove -= Math.PI * 2;
            
            // Adaptive turn speed based on angle difference
            let baseTurnSpeed = (e.id >= 3 ? 0.15 : 0.08);
            let adaptiveTurnSpeed = baseTurnSpeed;
            
            // Slow down turning when angle difference is small to prevent oscillation
            if (Math.abs(diffMove) < 0.15) {
                adaptiveTurnSpeed *= 0.25; // Very slow for tiny corrections
            } else if (Math.abs(diffMove) < 0.4) {
                adaptiveTurnSpeed *= 0.5; // Slower for small corrections
            } else if (Math.abs(diffMove) < 0.8) {
                adaptiveTurnSpeed *= 0.75; // Moderately slower for medium corrections
            }
            
            // Apply smoothed angle change
            e.angle += diffMove * adaptiveTurnSpeed * dt;

            const travelSpeed = Math.max(0, e.speed * speedMult);
            
            // Only attempt movement if there's significant speed or angle change
            if (travelSpeed > 0.5 || Math.abs(diffMove) > 0.1) {
                const moved = moveEnemyWithAvoidance(e, e.angle, travelSpeed, dt);
                if (!moved && travelSpeed > 0) {
                    moveEnemyWithAvoidance(e, e.angle + 0.5, travelSpeed * 0.6, dt);
                }
            }
            if (travelSpeed <= 0 && d < 220) moveEnemyWithAvoidance(e, e.angle + Math.PI, e.speed * 0.4, dt);

            // Only fire if we have clear line of sight to player (no obstacles blocking)
            if (e.cooldown <= 0 && hasLOS && (isAggro || d < 400)) {
                // Double-check LOS before firing to prevent shooting through obstacles
                const finalLOS = checkLineOfSight(e.x, e.y, player.x, player.y);
                if (!finalLOS) {
                    e.cooldown = 15; // Short cooldown before rechecking
                } else {
                // Apply accuracy to turret angle BEFORE firing
                const tierAccuracy = ENEMY_TIERS[e.id]?.accuracy ?? 1;
                const accurateAngle = applyWeaponAccuracy(e.turretAngle, e.weapon || 'cannon', true, tierAccuracy);
                e.turretAngle = accurateAngle;
                
                // Apply recoil
                const recoilKick = (WEAPONS[e.weapon || 'cannon']?.recoil ?? 7) * 0.8;
                e.recoil = recoilKick;
                
                // Calculate muzzle position from CURRENT turret angle
                const muzzle = getMuzzleDistanceFromRecoil(e.recoil, 36);
                let bx = e.x + Math.cos(e.turretAngle) * muzzle;
                let by = e.y + Math.sin(e.turretAngle) * muzzle;
                
                // Bullets fire in EXACT turret direction
                const shotAng = e.turretAngle;
                
                let wStats = WEAPONS[e.weapon || 'cannon'];
                let dmg = wStats.dmg || 10;
                const originX = e.x;
                const originY = e.y;
                const weaponColor = wStats.color || 'red';

                if (wStats.type === 'spread' || wStats.type === 'shotgun') {
                    // Shotgun spread for enemy
                    for (let k = -1; k <= 1; k++) bullets.push({ x: bx, y: by, prevX: originX, prevY: originY, vx: Math.cos(shotAng + k * 0.2) * 9, vy: Math.sin(shotAng + k * 0.2) * 9, life: 60, color: weaponColor, dmg: dmg, isEnemy: true });
                    // Shotgun muzzle flash
                    for (let i = 0; i < 25; i++) {
                        particles.push({
                            x: bx,
                            y: by,
                            vx: Math.cos(shotAng + (Math.random() - 0.5) * 0.6) * (6 + Math.random() * 5),
                            vy: Math.sin(shotAng + (Math.random() - 0.5) * 0.6) * (6 + Math.random() * 5),
                            life: 20 + Math.random() * 15,
                            color: i < 10 ? weaponColor : '#888888',
                            size: Math.random() * 6 + 3,
                            gravity: 0,
                            drag: 0.1
                        });
                    }
                } else if (wStats.type === 'twin') {
                    let ox = Math.cos(shotAng + Math.PI / 2) * 8;
                    let oy = Math.sin(shotAng + Math.PI / 2) * 8;
                    bullets.push({ x: bx + ox, y: by + oy, prevX: originX, prevY: originY, vx: Math.cos(shotAng) * 10, vy: Math.sin(shotAng) * 10, life: 80, color: weaponColor, dmg: dmg, isEnemy: true });
                    bullets.push({ x: bx - ox, y: by - oy, prevX: originX, prevY: originY, vx: Math.cos(shotAng) * 10, vy: Math.sin(shotAng) * 10, life: 80, color: weaponColor, dmg: dmg, isEnemy: true });
                    // Twin muzzle flash for both barrels
                    for (let side of [1, -1]) {
                        const sideX = bx + ox * side;
                        const sideY = by + oy * side;
                        for (let i = 0; i < 8; i++) {
                            particles.push({
                                x: sideX,
                                y: sideY,
                                vx: Math.cos(shotAng) * (6 + Math.random() * 4) + (Math.random() - 0.5) * 2,
                                vy: Math.sin(shotAng) * (6 + Math.random() * 4) + (Math.random() - 0.5) * 2,
                                life: 12 + Math.random() * 8,
                                color: weaponColor,
                                size: Math.random() * 4 + 2,
                                gravity: 0,
                                drag: 0.12
                            });
                        }
                    }
                } else if (wStats.type === 'burst') {
                    // Burst fire
                    bullets.push({ x: bx, y: by, prevX: originX, prevY: originY, vx: Math.cos(shotAng) * 8, vy: Math.sin(shotAng) * 8, life: 80, color: weaponColor, dmg: dmg, isEnemy: true });
                    // Burst muzzle flash
                    for (let i = 0; i < 10; i++) {
                        particles.push({
                            x: bx,
                            y: by,
                            vx: Math.cos(shotAng) * (7 + Math.random() * 5) + (Math.random() - 0.5) * 2,
                            vy: Math.sin(shotAng) * (7 + Math.random() * 5) + (Math.random() - 0.5) * 2,
                            life: 10 + Math.random() * 8,
                            color: weaponColor,
                            size: Math.random() * 4 + 2,
                            gravity: 0,
                            drag: 0.15
                        });
                    }
                } else if (wStats.type === 'aoe' || wStats.type === 'rocket') {
                    // Rocket with backblast
                    bullets.push({ x: bx, y: by, prevX: originX, prevY: originY, vx: Math.cos(shotAng) * 6, vy: Math.sin(shotAng) * 6, life: 120, color: weaponColor, dmg: 25, isEnemy: true });
                    // Rocket backblast smoke
                    for (let i = 0; i < 30; i++) {
                        particles.push({
                            x: bx,
                            y: by,
                            vx: Math.cos(shotAng + Math.PI) * (3 + Math.random() * 4) + (Math.random() - 0.5) * 3,
                            vy: Math.sin(shotAng + Math.PI) * (3 + Math.random() * 4) + (Math.random() - 0.5) * 3,
                            life: 30 + Math.random() * 20,
                            color: i < 10 ? weaponColor : '#666666',
                            size: Math.random() * 8 + 4,
                            gravity: 0.05,
                            drag: 0.05
                        });
                    }
                } else if (wStats.type === 'laser') {
                    // Laser beam
                    bullets.push({ x: bx, y: by, prevX: originX, prevY: originY, vx: Math.cos(shotAng) * 15, vy: Math.sin(shotAng) * 15, life: 60, color: weaponColor, dmg: 5, isEnemy: true });
                    // Laser plasma discharge
                    for (let i = 0; i < 20; i++) {
                        particles.push({
                            x: bx + (Math.random() - 0.5) * 10,
                            y: by + (Math.random() - 0.5) * 10,
                            vx: Math.cos(shotAng) * (10 + Math.random() * 8) + (Math.random() - 0.5) * 4,
                            vy: Math.sin(shotAng) * (10 + Math.random() * 8) + (Math.random() - 0.5) * 4,
                            life: 12 + Math.random() * 10,
                            color: i % 3 === 0 ? '#ffffff' : weaponColor,
                            size: Math.random() * 5 + 2,
                            gravity: 0,
                            drag: 0.08
                        });
                    }
                } else if (wStats.type === 'flak') {
                    // Flak cannon
                    bullets.push({ x: bx, y: by, prevX: originX, prevY: originY, vx: Math.cos(shotAng) * 8, vy: Math.sin(shotAng) * 8, life: 100, color: weaponColor, dmg: dmg, isEnemy: true });
                    // Flak heavy blast
                    for (let i = 0; i < 20; i++) {
                        particles.push({
                            x: bx,
                            y: by,
                            vx: Math.cos(shotAng + (Math.random() - 0.5) * 0.4) * (5 + Math.random() * 6),
                            vy: Math.sin(shotAng + (Math.random() - 0.5) * 0.4) * (5 + Math.random() * 6),
                            life: 18 + Math.random() * 12,
                            color: weaponColor,
                            size: Math.random() * 6 + 3,
                            gravity: 0.02,
                            drag: 0.08
                        });
                    }
                } else if (wStats.type === 'pierce') {
                    // Gauss rifle
                    bullets.push({ x: bx, y: by, prevX: originX, prevY: originY, vx: Math.cos(shotAng) * 12, vy: Math.sin(shotAng) * 12, life: 80, color: weaponColor, dmg: dmg, isEnemy: true });
                    // Gauss electromagnetic discharge
                    for (let i = 0; i < 25; i++) {
                        particles.push({
                            x: bx,
                            y: by,
                            vx: Math.cos(shotAng + (Math.random() - 0.5) * 0.3) * (12 + Math.random() * 10),
                            vy: Math.sin(shotAng + (Math.random() - 0.5) * 0.3) * (12 + Math.random() * 10),
                            life: 15 + Math.random() * 10,
                            color: i % 2 === 0 ? weaponColor : '#ffffff',
                            size: Math.random() * 4 + 2,
                            gravity: 0,
                            drag: 0.12
                        });
                    }
                } else {
                    // Standard cannon
                    bullets.push({ x: bx, y: by, prevX: originX, prevY: originY, vx: Math.cos(shotAng) * 8, vy: Math.sin(shotAng) * 8, life: 100, color: weaponColor, dmg: dmg, isEnemy: true });
                    // Cannon muzzle flash
                    for (let i = 0; i < 15; i++) {
                        particles.push({
                            x: bx,
                            y: by,
                            vx: Math.cos(shotAng) * (8 + Math.random() * 6) + (Math.random() - 0.5) * 3,
                            vy: Math.sin(shotAng) * (8 + Math.random() * 6) + (Math.random() - 0.5) * 3,
                            life: 15 + Math.random() * 10,
                            color: weaponColor,
                            size: Math.random() * 5 + 3,
                            gravity: 0,
                            drag: 0.15
                        });
                    }
                }
                e.cooldown = e.maxCooldown + Math.random() * 30;
                }
            }
            e.cooldown -= dt;
        }
    }
}

// Guard metadata is lazily created to avoid bloating spawn objects.
function ensureGuardData(enemy) {
    if (!enemy.guardPoint) enemy.guardPoint = getNearestCrateCenter(enemy.x, enemy.y);
    if (!enemy.home) enemy.home = { x: enemy.x, y: enemy.y };
    if (!enemy.patrolPoint) enemy.patrolPoint = createPatrolWaypoint(enemy.guardPoint);
    if (enemy.patrolCooldown === undefined) enemy.patrolCooldown = 0;
    if (enemy.guardOrbitAngle === undefined) enemy.guardOrbitAngle = Math.random() * Math.PI * 2;
    if (!enemy.guardOrbitRadius) enemy.guardOrbitRadius = 120 + Math.random() * 80;
    if (enemy.turretError === undefined) enemy.turretError = 0;
    if (enemy.turretErrorTarget === undefined) enemy.turretErrorTarget = 0;
    if (enemy.turretErrorTimer === undefined) enemy.turretErrorTimer = 0;
    if (enemy.queueAngle === undefined) enemy.queueAngle = Math.random() * Math.PI * 2;
}

// Patrolling around guard point keeps non-aggro enemies busy protecting crates.
// The orbit slowly lerps so formations feel alive instead of jittery.
function runGuardPatrol(enemy, dt) {
    enemy.guardOrbitAngle += 0.015 * dt * (1 + enemy.id * 0.2);
    const orbitX = enemy.guardPoint.x + Math.cos(enemy.guardOrbitAngle) * enemy.guardOrbitRadius;
    const orbitY = enemy.guardPoint.y + Math.sin(enemy.guardOrbitAngle) * enemy.guardOrbitRadius;
    if (!enemy.patrolPoint || Math.random() < 0.01) enemy.patrolPoint = { x: orbitX, y: orbitY };
    else enemy.patrolPoint = {
        x: (enemy.patrolPoint.x * 0.9) + orbitX * 0.1,
        y: (enemy.patrolPoint.y * 0.9) + orbitY * 0.1
    };
    return Math.atan2(enemy.patrolPoint.y - enemy.y, enemy.patrolPoint.x - enemy.x);
}

// Directional avoidance makes enemies feel intentional when weaving around debris.
// We try progressively wider offsets until an unobstructed arc is found.
function findAvoidanceAngle(enemy, desiredAngle) {
    if (!pathBlocked(enemy, desiredAngle)) return 0;
    // Wider angle offsets for smoother navigation
    const offsets = [0.3, -0.3, 0.6, -0.6, 1.0, -1.0, 1.5, -1.5, 2.0, -2.0];
    for (let offset of offsets) {
        if (!pathBlocked(enemy, desiredAngle + offset)) return offset;
    }
    return 0;
}

// Short probing raymarch prevents tanks from ramming obstacles head-on.
function pathBlocked(enemy, angle) {
    // Longer detection range for better anticipation
    const step = 55;
    for (let i = 1; i <= 4; i++) {
        const px = enemy.x + Math.cos(angle) * step * i;
        const py = enemy.y + Math.sin(angle) * step * i;
        if (!canEnemyOccupyPosition(enemy, px, py, ENEMY_WALL_PADDING)) return true;
    }
    return false;
}

// Advanced pathfinding - finds route around obstacles with wide arc scanning
function findPathAroundObstacle(enemy, targetAngle) {
    // Try progressively wider angles to find clear path
    const scanAngles = [
        0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 
        2.0, -2.0, 2.5, -2.5, Math.PI * 0.5, -Math.PI * 0.5
    ];
    
    for (let angleOffset of scanAngles) {
        const testAngle = targetAngle + angleOffset;
        if (!pathBlocked(enemy, testAngle)) {
            return testAngle;
        }
    }
    
    // If all angles blocked, try perpendicular movement
    const leftAngle = targetAngle + Math.PI * 0.5;
    const rightAngle = targetAngle - Math.PI * 0.5;
    
    if (!pathBlocked(enemy, leftAngle)) return leftAngle;
    if (!pathBlocked(enemy, rightAngle)) return rightAngle;
    
    // Last resort: reverse direction
    return targetAngle + Math.PI;
}

// Intelligent hunting strategy - higher tier enemies use advanced tactics
function getHuntingStrategy(enemy, intelligence, dt) {
    const lastKnownX = enemy.lastKnownPlayerX;
    const lastKnownY = enemy.lastKnownPlayerY;
    const timeSinceSeen = enemy.timeSinceLastSeen || 0;
    
    // Distance to last known position
    const distToLastKnown = Math.hypot(lastKnownX - enemy.x, lastKnownY - enemy.y);
    const angleToLastKnown = Math.atan2(lastKnownY - enemy.y, lastKnownX - enemy.x);
    
    // Strategy varies by intelligence level
    if (intelligence >= 5) {
        // Elite AI (Tier 4): Predictive flanking with double checking
        // Predict where player might be moving and flank from multiple angles
        if (!enemy.flankingPhase) enemy.flankingPhase = Math.random() > 0.5 ? 1 : -1;
        
        if (distToLastKnown < 150) {
            // Close to last known - sweep around obstacles
            if (!enemy.sweepAngle) enemy.sweepAngle = 0;
            enemy.sweepAngle += 0.03 * dt * enemy.flankingPhase;
            
            const sweepRadius = 200;
            const targetX = lastKnownX + Math.cos(enemy.sweepAngle) * sweepRadius;
            const targetY = lastKnownY + Math.sin(enemy.sweepAngle) * sweepRadius;
            const sweepAngle = Math.atan2(targetY - enemy.y, targetX - enemy.x);
            
            return { angle: sweepAngle, speedMult: 1.1 };
        } else {
            // Far from last known - aggressive approach with prediction
            const predictX = lastKnownX + (player.vx || 0) * 80;
            const predictY = lastKnownY + (player.vy || 0) * 80;
            const predictAngle = Math.atan2(predictY - enemy.y, predictX - enemy.x);
            
            return { angle: predictAngle, speedMult: 1.15 };
        }
    } else if (intelligence >= 4) {
        // Advanced AI (Tier 3): Flanking maneuvers
        // Try to approach from side angles instead of direct route
        if (distToLastKnown < 180) {
            // Within range - execute flanking
            if (!enemy.flankDirection) enemy.flankDirection = Math.random() > 0.5 ? Math.PI * 0.4 : -Math.PI * 0.4;
            
            const flankAngle = angleToLastKnown + enemy.flankDirection;
            const flankDistance = 150;
            const flankX = lastKnownX + Math.cos(flankAngle) * flankDistance;
            const flankY = lastKnownY + Math.sin(flankAngle) * flankDistance;
            const moveAngle = Math.atan2(flankY - enemy.y, flankX - enemy.x);
            
            return { angle: moveAngle, speedMult: 1.05 };
        } else {
            // Approach last known position quickly
            return { angle: angleToLastKnown, speedMult: 1.1 };
        }
    } else if (intelligence >= 3) {
        // Intermediate AI (Tier 2): Smart searching with area coverage
        // Check around last known position in expanding circles
        if (distToLastKnown < 200) {
            // Near last position - search in circular pattern
            if (!enemy.searchAngle) enemy.searchAngle = Math.random() * Math.PI * 2;
            enemy.searchAngle += 0.02 * dt;
            
            const searchRadius = 120;
            const searchX = lastKnownX + Math.cos(enemy.searchAngle) * searchRadius;
            const searchY = lastKnownY + Math.sin(enemy.searchAngle) * searchRadius;
            const searchMoveAngle = Math.atan2(searchY - enemy.y, searchX - enemy.x);
            
            return { angle: searchMoveAngle, speedMult: 0.95 };
        } else {
            // Move to last known position
            return { angle: angleToLastKnown, speedMult: 1.0 };
        }
    } else if (intelligence >= 2) {
        // Basic AI (Tier 1): Simple pursuit with slight randomization
        // Add some uncertainty to movement
        const randomOffset = (Math.random() - 0.5) * 0.4;
        const pursuitAngle = angleToLastKnown + randomOffset;
        
        return { angle: pursuitAngle, speedMult: 0.9 };
    } else {
        // Novice AI (Tier 0): Direct approach to last known position
        // Most predictable behavior
        if (timeSinceSeen > 180) {
            // Lost player for too long - give up and patrol
            return { angle: enemy.angle + (Math.random() - 0.5) * 0.5, speedMult: 0.7 };
        }
        return { angle: angleToLastKnown, speedMult: 0.85 };
    }
}

function moveEnemyWithAvoidance(enemy, angle, speed, dt) {
    if (speed <= 0) return false;
    const travel = speed * dt;
    const offsets = [0, 0.35, -0.35, 0.75, -0.75, Math.PI];
    const step = Math.max(1, Math.ceil(travel / 12));
    for (let offset of offsets) {
        const ang = angle + offset;
        const stepX = Math.cos(ang) * (travel / step);
        const stepY = Math.sin(ang) * (travel / step);
        let nx = enemy.x;
        let ny = enemy.y;
        let blocked = false;
        for (let s = 0; s < step; s++) {
            nx += stepX;
            ny += stepY;
            if (!canEnemyOccupyPosition(enemy, nx, ny)) {
                blocked = true;
                break;
            }
            // Check collision with other enemies
            if (checkEnemyCollision(enemy, nx, ny)) {
                blocked = true;
                break;
            }
        }
        if (!blocked) {
            enemy.x = nx;
            enemy.y = ny;
            enemy.angle = ang;
            return true;
        }
    }
    const dirX = Math.cos(angle) * travel;
    const dirY = Math.sin(angle) * travel;
    const slideCandidates = [
        { x: enemy.x + dirX, y: enemy.y },
        { x: enemy.x, y: enemy.y + dirY },
        { x: enemy.x + dirX * 0.5, y: enemy.y + dirY * 0.5 }
    ];
    for (let candidate of slideCandidates) {
        const deltaX = candidate.x - enemy.x;
        const deltaY = candidate.y - enemy.y;
        if (canEnemyOccupyPosition(enemy, candidate.x, candidate.y)) {
            enemy.x = candidate.x;
            enemy.y = candidate.y;
            const heading = Math.atan2(deltaY, deltaX);
            if (!Number.isNaN(heading)) enemy.angle = heading;
            return true;
        }
    }
    return false;
}

function canEnemyOccupyPosition(enemy, x, y, padding = ENEMY_WALL_PADDING) {
    return !checkWall(x, y, (enemy.radius || player.radius) + padding) && !checkCrate(x, y, (enemy.radius || player.radius) + padding);
}

function checkEnemyCollision(currentEnemy, x, y) {
    const minSeparation = (currentEnemy.radius || 25) * 2.2;
    for (let other of enemies) {
        if (other === currentEnemy) continue;
        const dist = Math.hypot(x - other.x, y - other.y);
        if (dist < minSeparation) return true;
    }
    return false;
}

function resolveEnemyWallPenetration(enemy) {
    if (canEnemyOccupyPosition(enemy, enemy.x, enemy.y, ENEMY_WALL_PADDING)) return;
    
    // First try: gentle push in current facing direction
    const gentlePush = 8;
    for (let mult = 1; mult <= 3; mult++) {
        const testAngle = enemy.angle + (mult === 2 ? Math.PI : mult === 3 ? Math.PI / 2 : 0);
        const nx = enemy.x + Math.cos(testAngle) * gentlePush;
        const ny = enemy.y + Math.sin(testAngle) * gentlePush;
        if (canEnemyOccupyPosition(enemy, nx, ny, ENEMY_WALL_PADDING * 0.8) && !checkEnemyCollision(enemy, nx, ny)) {
            enemy.x = nx;
            enemy.y = ny;
            return;
        }
    }
    
    // Second try: radial search with progressive distance
    const maxLayers = 3;
    const slices = 12;
    const basePush = (enemy.radius || player.radius) + ENEMY_WALL_PADDING * 0.7;
    for (let layer = 1; layer <= maxLayers; layer++) {
        const pushDist = basePush * layer * 0.5;
        for (let i = 0; i < slices; i++) {
            const angle = (Math.PI * 2 * i) / slices;
            const nx = enemy.x + Math.cos(angle) * pushDist;
            const ny = enemy.y + Math.sin(angle) * pushDist;
            if (canEnemyOccupyPosition(enemy, nx, ny, ENEMY_WALL_PADDING * 0.75) && !checkEnemyCollision(enemy, nx, ny)) {
                enemy.x = nx;
                enemy.y = ny;
                enemy.angle = angle;
                return;
            }
        }
    }
}

// When an enemy fails to move we steer it using a temporary vector rather than teleporting.
// This keeps motion smooth, eliminating the visible "blink" during corrections.
function forceEnemyUnstuck(enemy) {
    enemy.stuckTimer = 0;
    enemy.unstuck = {
        angle: Math.random() * Math.PI * 2,
        ttl: 120 + Math.random() * 60
    };
    enemy.patrolPoint = createPatrolWaypoint(enemy.guardPoint);
    enemy.patrolCooldown = 120;
}

function updateEnemyTurretError(enemy, distance, dt) {
    const tier = ENEMY_TIERS[enemy.id] || {};
    const baseInaccuracy = Math.max(0, 1 - (tier.accuracy ?? 1));
    const weaponSpread = (WEAPONS[enemy.weapon || 'cannon']?.spread ?? 0.1) * 0.5;
    const distanceFactor = 0.5 + Math.min(1, distance / 1600) * 0.5;
    const maxOffset = (baseInaccuracy * 0.8 + weaponSpread * 0.4) * distanceFactor;

    enemy.turretErrorTimer -= dt;
    if (enemy.turretErrorTimer <= 0) {
        enemy.turretErrorTarget = (Math.random() - 0.5) * maxOffset * 2;
        enemy.turretErrorTimer = 45 + Math.random() * 60;
    }

    enemy.turretError += (enemy.turretErrorTarget - enemy.turretError) * Math.min(0.12 * dt, 0.12);
    enemy.turretError += (Math.random() - 0.5) * baseInaccuracy * 0.01;

    return enemy.turretError;
}


// Consumes the temporary unstuck vector so it gradually expires over time.
function consumeUnstuckVector(enemy, dt) {
    if (!enemy.unstuck) return null;
    enemy.unstuck.ttl -= dt;
    if (enemy.unstuck.ttl <= 0) {
        enemy.unstuck = null;
        return null;
    }
    return enemy.unstuck.angle;
}

// Boss behaviors switch between hovering, charging, and bullet barrages to
// contrast regular enemy pacing.
function updateBoss(dt) {
    if (!boss) return;
    boss.timer -= dt;
    let angle = Math.atan2(player.y - boss.y, player.x - boss.x);
    if (boss.state === 'hover') {
        boss.x += Math.cos(angle) * 2.5 * dt;
        boss.y += Math.sin(angle) * 2.5 * dt;
        if (boss.timer <= 0) {
            boss.state = Math.random() < 0.5 ? 'charge' : 'barrage';
            boss.timer = 120;
        }
    } else if (boss.state === 'charge') {
        createParticle(boss.x, boss.y, 'purple', 3);
        if (boss.timer <= 0) {
            if (player.shieldTime <= 0) {
                takeDamage(40);
                addFloatText('STUNNED', player.x, player.y, 'yellow');
                player.energy = 0;
            } else addFloatText('BLOCKED', player.x, player.y, 'cyan');
            screenShake = 20;
            boss.state = 'hover';
            boss.timer = 180;
        }
    } else if (boss.state === 'barrage') {
        if (Math.floor(boss.timer) % 8 === 0) {
            let s = (Math.random() - 0.5) * 0.8;
            const shotAng = applyWeaponAccuracy(angle + s, 'laser', true, 1);
            bullets.push({ x: boss.x, y: boss.y, prevX: boss.x, prevY: boss.y, vx: Math.cos(shotAng) * 9, vy: Math.sin(shotAng) * 9, life: 100, color: '#0f0', dmg: 15, isEnemy: true });
        }
        if (boss.timer <= 0) {
            boss.state = 'hover';
            boss.timer = 120;
        }
    }
}

// Reusable explosion helper spawns mixed particle sets for extra punch.
function createExplosion(x, y, c) {
    // Core white flash - initial blast
    for (let i = 0; i < 12; i++) {
        particles.push({ 
            x, y, 
            vx: (Math.random() - 0.5) * 6, 
            vy: (Math.random() - 0.5) * 6, 
            life: 20, 
            color: '#ffffff', 
            size: Math.random() * 8 + 5,
            gravity: 0,
            drag: 0.15
        });
    }
    
    // Fire particles - orange/red flames
    for (let i = 0; i < 25; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 6;
        particles.push({ 
            x, y, 
            vx: Math.cos(angle) * speed, 
            vy: Math.sin(angle) * speed, 
            life: 40 + Math.random() * 25, 
            color: i % 3 === 0 ? '#ff6600' : (i % 3 === 1 ? '#f59e0b' : '#ff3300'), 
            size: Math.random() * 6 + 3,
            gravity: -0.06,
            drag: 0.06
        });
    }
    
    // Heavy smoke clouds - gray/black
    for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 4;
        particles.push({ 
            x, y, 
            vx: Math.cos(angle) * speed, 
            vy: Math.sin(angle) * speed, 
            life: 60 + Math.random() * 30, 
            color: i % 2 === 0 ? '#333333' : '#555555', 
            size: Math.random() * 10 + 5,
            gravity: -0.02,
            drag: 0.04
        });
    }
    
    // Metal debris - tank colored fragments
    for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 6 + Math.random() * 10;
        particles.push({ 
            x, y, 
            vx: Math.cos(angle) * speed, 
            vy: Math.sin(angle) * speed - 2, 
            life: 70 + Math.random() * 30, 
            color: i % 3 === 0 ? c : (i % 3 === 1 ? '#888888' : '#666666'), 
            size: Math.random() * 5 + 2,
            gravity: 0.15,
            drag: 0.03
        });
    }
    
    // Fast shrapnel - sharp metal pieces
    for (let i = 0; i < 16; i++) {
        let a = (Math.PI * 2 / 16) * i;
        particles.push({ 
            x, y, 
            vx: Math.cos(a) * 15, 
            vy: Math.sin(a) * 15, 
            life: 40, 
            color: '#cccccc', 
            size: 2,
            gravity: 0.08,
            drag: 0.02
        });
    }
    
    // Shockwave ring
    particles.push({ 
        x, y, 
        size: 50, 
        life: 25, 
        color: 'rgba(255,100,0,0.6)', 
        type: 'wave' 
    });
}

// Loot table mirrors arcade shooters: common energy packs, rarer weapons, and
// legendary streak boosts. Guaranteed drops are used for crates/bosses.
// Higher tier enemies have better drop rates for rare items.
// Progressive weapon system: only spawn weapons slightly better than current weapon
function spawnDrop(x, y, guaranteed = false, enemyTier = 0) {
    // Chance for no drop (reduced for higher tiers)
    const noDropChance = Math.max(0.15, 0.35 - (enemyTier * 0.05));
    if (!guaranteed && Math.random() < noDropChance) return;
    
    // Get player's current weapon rarity for progressive drops
    const currentWeaponRarity = WEAPONS[player.weapon]?.rarity || 1;
    
    // Tier bonus: higher tier enemies shift probabilities towards better loot
    // Tier 0: Common 70%, Uncommon 12%, Rare 5%, Epic 3%, Legendary 2%, Mythic 1%
    // Tier 1: Common 64%, Uncommon 11%, Rare 8.75%, Epic 4.75%, Legendary 3%, Mythic 1.5%
    // Tier 2: Common 58%, Uncommon 10%, Rare 12.5%, Epic 6.5%, Legendary 4%, Mythic 2%
    // Tier 3: Common 52%, Uncommon 9%, Rare 16.25%, Epic 8.25%, Legendary 5%, Mythic 2.5%
    // Tier 4: Common 40%, Uncommon 8%, Rare 20%, Epic 10%, Legendary 6%, Mythic 3%
    
    const tierBonus = {
        common: Math.max(0.40, 0.70 - (enemyTier * 0.06)),      // 70% → 40% at tier 4
        uncommon: Math.max(0.08, 0.12 - (enemyTier * 0.01)),   // 12% → 8% at tier 4
        rare: Math.min(0.20, 0.05 + (enemyTier * 0.0375)),     // 5% → 20% at tier 4
        epic: Math.min(0.10, 0.03 + (enemyTier * 0.0175)),     // 3% → 10% at tier 4
        legendary: Math.min(0.06, 0.02 + (enemyTier * 0.01)),  // 2% → 6% at tier 4
        mythic: Math.min(0.03, 0.01 + (enemyTier * 0.005))     // 1% → 3% at tier 4
    };
    
    let rand = Math.random();
    let type;
    
    // Calculate cumulative probabilities
    const commonThreshold = tierBonus.common;
    const uncommonThreshold = commonThreshold + tierBonus.uncommon;
    const rareThreshold = uncommonThreshold + tierBonus.rare;
    const epicThreshold = rareThreshold + tierBonus.epic;
    const legendaryThreshold = epicThreshold + tierBonus.legendary;
    // mythic is remaining (1.0 - legendaryThreshold)

    if (rand < commonThreshold) {
        // Common drops - HP, Energy, Shield, Armor (weighted)
        let pool = [
            { id: 'hp', t: 'HEALTH REPAIR', short: 'HP', c: '#22c55e', rarity: 1 },
            { id: 'en', t: 'ENERGY CHARGE', short: 'EN', c: '#06b6d4', rarity: 1 },
            { id: 'shield', t: 'SHIELD GUARD', short: 'SH', c: '#3b82f6', rarity: 1 },
            { id: 'armor', t: 'ARMOR PLATING', short: 'AR', c: '#78716c', rarity: 1 }
        ];
        // Weighted: HP 40%, Energy 30%, Shield 20%, Armor 10%
        let commonRoll = Math.random();
        if (commonRoll < 0.40) type = pool[0]; // HP
        else if (commonRoll < 0.70) type = pool[1]; // Energy
        else if (commonRoll < 0.90) type = pool[2]; // Shield
        else type = pool[3]; // Armor
    } else if (rand < uncommonThreshold) {
        // Uncommon drops - Progressive weapon spawning
        // Only spawn weapons at current rarity or +1 level higher
        let pool = [
            { id: 'twin', t: 'TWIN CANNON', short: 'TW', c: '#00ffaa', rarity: 2 },
            { id: 'shotgun', t: 'SCATTER GUN', short: 'SG', c: '#d946ef', rarity: 2 }
        ];
        
        // Filter: only weapons at current rarity or +1 level, and not the currently equipped weapon
        pool = pool.filter(w => w.rarity >= currentWeaponRarity && w.rarity <= currentWeaponRarity + 1 && w.id !== player.weapon);
        
        if (pool.length > 0) {
            type = pool[Math.floor(Math.random() * pool.length)];
        } else {
            // Fallback to energy if no valid weapon
            type = { id: 'en', t: 'ENERGY CHARGE', short: 'EN', c: '#06b6d4', rarity: 1 };
        }
    } else if (rand < rareThreshold) {
        // Rare drops - Progressive weapon spawning
        let pool = [
            { id: 'sniper', t: 'RAILGUN', short: 'RG', c: '#ffffff', rarity: 3 },
            { id: 'burst', t: 'BURST RIFLE', short: 'BR', c: '#fbbf24', rarity: 3 },
            { id: 'flak', t: 'FLAK CANNON', short: 'FK', c: '#fb923c', rarity: 3 }
        ];
        
        // Filter: only weapons at current rarity or +1 level, and not the currently equipped weapon
        pool = pool.filter(w => w.rarity >= currentWeaponRarity && w.rarity <= currentWeaponRarity + 1 && w.id !== player.weapon);
        
        if (pool.length > 0) {
            type = pool[Math.floor(Math.random() * pool.length)];
        } else {
            // Fallback to shield if no valid weapon
            type = { id: 'shield', t: 'SHIELD GUARD', short: 'SH', c: '#3b82f6', rarity: 1 };
        }
    } else if (rand < epicThreshold) {
        // Epic drops - Progressive weapon and boosts
        let pool = [
            { id: 'rocket', t: 'ROCKET LAUNCHER', short: 'RL', c: '#f43f5e', rarity: 4 },
            { id: 'laser', t: 'PLASMA BEAM', short: 'PB', c: '#38bdf8', rarity: 4 },
            { id: 'hp_max', t: 'MAX HP UP', short: 'HP+', c: '#166534', rarity: 4 },
            { id: 'en_max', t: 'MAX ENERGY UP', short: 'EN+', c: '#155e75', rarity: 4 }
        ];
        
        // Filter weapons only (keep boosts)
        let weapons = pool.filter(w => w.id === 'rocket' || w.id === 'laser');
        let boosts = pool.filter(w => w.id === 'hp_max' || w.id === 'en_max');
        
        // Filter weapons by rarity progression and not currently equipped
        weapons = weapons.filter(w => w.rarity >= currentWeaponRarity && w.rarity <= currentWeaponRarity + 1 && w.id !== player.weapon);
        
        // Combine filtered weapons with boosts
        pool = [...weapons, ...boosts];
        
        if (pool.length > 0) {
            type = pool[Math.floor(Math.random() * pool.length)];
        } else {
            // Fallback to armor if no valid item
            type = { id: 'armor', t: 'ARMOR PLATING', short: 'AR', c: '#78716c', rarity: 1 };
        }
    } else if (rand < legendaryThreshold) {
        // Legendary drops - Progressive ultimate weapons and charge
        let pool = [
            { id: 'gauss', t: 'GAUSS RIFLE', short: 'GS', c: '#a78bfa', rarity: 5 },
            { id: 'streak', t: 'ULTIMATE CHARGE', short: 'ULT', c: '#fbbf24', rarity: 5 }
        ];
        
        // Filter weapons only (keep streak)
        let weapons = pool.filter(w => w.id === 'gauss');
        let streak = pool.filter(w => w.id === 'streak');
        
        // Filter weapons by rarity progression and not currently equipped
        weapons = weapons.filter(w => w.rarity >= currentWeaponRarity && w.rarity <= currentWeaponRarity + 1 && w.id !== player.weapon);
        
        // Combine filtered weapons with streak
        pool = [...weapons, ...streak];
        
        if (pool.length > 0) {
            type = pool[Math.floor(Math.random() * pool.length)];
        } else {
            // Fallback to HP if no valid item
            type = { id: 'hp', t: 'HEALTH REPAIR', short: 'HP', c: '#22c55e', rarity: 1 };
        }
    } else {
        // Mythic drops - REVIVE (rarest of all)
        type = { id: 'revive', t: 'REVIVE', short: '❤', c: '#ff69b4', rarity: 6 };
    }
    pickups.push({ x, y, type, life: 1000, floatY: 0 });
}

// Pickups float and glow to make them easy to notice even during chaos.
function updatePickups() {
    for (let i = pickups.length - 1; i >= 0; i--) {
        let p = pickups[i];
        p.floatY = Math.sin(frame * 0.1) * 5;
        if (Math.hypot(player.x - p.x, player.y - p.y) < 40) {
            // Check if pickup is a weapon and compare rarity
            const isWeapon = ['shotgun', 'rocket', 'laser', 'twin', 'sniper', 'burst', 'flak', 'gauss'].includes(p.type.id);
            let showText = p.type.t;
            let textColor = p.type.c;
            let shouldPickup = true;
            
            if (isWeapon) {
                const currentRarity = WEAPONS[player.weapon]?.rarity || 0;
                const newRarity = WEAPONS[p.type.id]?.rarity || 0;
                
                // Check if it's the same weapon
                if (p.type.id === player.weapon) {
                    showText = 'ALREADY EQUIPPED';
                    textColor = '#94a3b8'; // Gray color
                    shouldPickup = false;
                } else if (newRarity < currentRarity) {
                    // Weapon is lower tier - show rejection message
                    showText = 'ALREADY HAVE BETTER WEAPON';
                    textColor = '#94a3b8'; // Gray color
                    shouldPickup = false;
                }
            }
            
            addFloatText(showText, player.x, player.y, textColor);
            
            // Only create pickup particles if actually picking up
            if (shouldPickup) {
                for (let j = 0; j < 15; j++) {
                    particles.push({
                        x: p.x,
                        y: p.y,
                        vx: (Math.random() - 0.5) * 15,
                        vy: (Math.random() - 0.5) * 15,
                        life: 40,
                        color: p.type.c,
                        size: 4
                    });
                }
            } else {
                // Rejection particles - gray and fewer
                for (let j = 0; j < 8; j++) {
                    particles.push({
                        x: p.x,
                        y: p.y,
                        vx: (Math.random() - 0.5) * 8,
                        vy: (Math.random() - 0.5) * 8,
                        life: 30,
                        color: '#94a3b8',
                        size: 3
                    });
                }
            }

            if (p.type.id === 'hp') player.hp = Math.min(player.hp + 50, player.maxHp);
            if (p.type.id === 'en') {
                player.energy = Math.min(player.energy + 50, player.maxEnergy);
                // Reset overheated status when picking up energy
                if (player.energy > 0) player.overheated = false;
            }
            if (p.type.id === 'hp_max') {
                player.maxHp += 50;
                player.hp += 50;
            }
            if (p.type.id === 'en_max') {
                player.maxEnergy += 50;
                player.energy += 50;
                // Reset overheated status when increasing max energy
                if (player.energy > 0) player.overheated = false;
            }
            if (p.type.id === 'streak') {
                player.killStreak = player.maxStreak;
                player.ultReady = true;
            }
            if (p.type.id === 'shield') player.shieldTime = 900;
            if (p.type.id === 'armor') {
                player.armor = Math.min(player.armor + 50, player.maxArmor);
            }
            if (p.type.id === 'revive') {
                player.revives = Math.min(player.revives + 1, player.maxRevives);
            }
            
            // Only upgrade weapon if new weapon has higher or equal rarity
            if (isWeapon) {
                const currentRarity = WEAPONS[player.weapon]?.rarity || 0;
                const newRarity = WEAPONS[p.type.id]?.rarity || 0;
                if (newRarity >= currentRarity) {
                    player.weapon = p.type.id;
                }
            }
            pickups.splice(i, 1);
        }
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        
        // Standard gravity (downward)
        if (p.gravity) p.vy += p.gravity * dt;
        
        // Radial gravity pulls toward player center
        if (p.radialGravity && p.targetPlayer) {
            const targetX = player.x;
            const targetY = player.y;
            const dx = targetX - p.x;
            const dy = targetY - p.y;
            const dist = Math.hypot(dx, dy);
            
            if (dist > 5) {
                // Increase pull strength as particle gets closer (inverse square-like)
                const pullStrength = (p.seekStrength ?? 0.12) * (1 + (400 / Math.max(50, dist)));
                const ax = (dx / dist) * pullStrength * dt;
                const ay = (dy / dist) * pullStrength * dt;
                p.vx += ax;
                p.vy += ay;
            }
        } else if (p.targetPlayer) {
            // Simple linear seek for non-radial particles
            const targetX = player.x;
            const targetY = player.y - 10;
            const steer = (p.seekStrength ?? 0.08) * dt;
            const a = Math.atan2(targetY - p.y, targetX - p.x);
            p.vx += Math.cos(a) * steer;
            p.vy += Math.sin(a) * steer;
        }
        
        if (p.drag) {
            const dragFactor = Math.max(0, 1 - p.drag * dt);
            p.vx *= dragFactor;
            p.vy *= dragFactor;
        }
        
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function createParticle(x, y, c, n) {
    for (let i = 0; i < n; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, life: 30, color: c, size: 3 });
}

// Crates always reward the player to motivate environmental destruction.
function destroyCrate(c, index) {
    createExplosion(c.x + c.w / 2, c.y + c.h / 2, '#d97706');
    spawnDrop(c.x + c.w / 2, c.y + c.h / 2, true);
    score += 25;
    addFloatText('+25', c.x + c.w / 2, c.y + c.h / 2, '#fbbf24');
    crates.splice(index, 1);
}

function killEnemy(index) {
    let e = enemies[index];
    const explosionX = e.x;
    const explosionY = e.y;
    const explosionRadius = 120;
    const explosionDamage = 40;
    
    createExplosion(e.x, e.y, e.color);
    spawnDrop(e.x, e.y, false, e.id); // Pass enemy tier for better loot
    score += ENEMY_TIERS[e.id].score;
    player.killStreak = Math.min(player.killStreak + 1, player.maxStreak);
    addFloatText('+' + ENEMY_TIERS[e.id].score, e.x, e.y - 30, '#fbbf24');
    enemies.splice(index, 1);
    
    // Apply explosion damage to nearby entities
    // Damage nearby enemies
    enemies.forEach(enemy => {
        const dist = Math.hypot(enemy.x - explosionX, enemy.y - explosionY);
        if (dist < explosionRadius && dist > 0) {
            const damageFalloff = 1 - (dist / explosionRadius);
            const damage = explosionDamage * damageFalloff;
            enemy.hp -= damage;
            enemy.hitFlash = 8;
            // Push enemies away from explosion
            const pushAngle = Math.atan2(enemy.y - explosionY, enemy.x - explosionX);
            enemy.x += Math.cos(pushAngle) * 15 * damageFalloff;
            enemy.y += Math.sin(pushAngle) * 15 * damageFalloff;
        }
    });
    
    // Damage nearby walls
    for (let i = walls.length - 1; i >= 0; i--) {
        const w = walls[i];
        const centerX = w.x + w.w / 2;
        const centerY = w.y + w.h / 2;
        const dist = Math.hypot(centerX - explosionX, centerY - explosionY);
        if (dist < explosionRadius && w.destructible) {
            const damageFalloff = 1 - (dist / explosionRadius);
            const damage = explosionDamage * damageFalloff * 0.7;
            w.hp -= damage;
            if (w.hp <= 0) {
                createExplosion(centerX, centerY, '#555');
                score += 10;
                walls.splice(i, 1);
            }
        }
    }
    
    // Damage nearby crates
    for (let i = crates.length - 1; i >= 0; i--) {
        const c = crates[i];
        const centerX = c.x + c.w / 2;
        const centerY = c.y + c.h / 2;
        const dist = Math.hypot(centerX - explosionX, centerY - explosionY);
        if (dist < explosionRadius) {
            const damageFalloff = 1 - (dist / explosionRadius);
            const damage = explosionDamage * damageFalloff * 0.5;
            c.hp -= damage;
            if (c.hp <= 0) destroyCrate(c, i);
        }
    }
}

function killBoss() {
    // Multi-stage dramatic boss explosion
    for (let wave = 0; wave < 3; wave++) {
        setTimeout(() => {
            // Core explosion blast
            for (let i = 0; i < 60; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 8 + Math.random() * 10;
                particles.push({
                    x: boss.x + (Math.random() - 0.5) * 40,
                    y: boss.y + (Math.random() - 0.5) * 40,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 70 + Math.random() * 40,
                    color: i % 3 === 0 ? '#a855f7' : (i % 3 === 1 ? '#ff0000' : '#ffffff'),
                    size: Math.random() * 10 + 5,
                    gravity: wave * 0.04,
                    drag: 0.04
                });
            }
            
            // Massive shockwave
            particles.push({ 
                x: boss.x, 
                y: boss.y, 
                size: 120 + wave * 70, 
                life: 45, 
                color: 'rgba(168,85,247,0.5)', 
                type: 'wave' 
            });
        }, wave * 180);
    }
    
    // Heavy debris field
    for (let i = 0; i < 80; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 5 + Math.random() * 12;
        particles.push({
            x: boss.x,
            y: boss.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 4,
            life: 100 + Math.random() * 60,
            color: i % 2 === 0 ? '#888888' : '#666666',
            size: Math.random() * 12 + 4,
            gravity: 0.18,
            drag: 0.02
        });
    }
    
    for (let i = 0; i < 5; i++) spawnDrop(boss.x + (Math.random() - 0.5) * 100, boss.y + (Math.random() - 0.5) * 100, true);
    score += 2000;
    addFloatText('BOSS DEFEATED +2000', boss.x, boss.y - 80, '#a855f7');
    boss = null;
    bossActive = false;
}

// Boss spawn warns players via HUD element while picking a safe position away
// from the current chaos.
function startBossFight() {
    bossSpawned = true;
    bossActive = true;
    let pos = findSafeSpot(100, true);
    boss = { x: pos.x, y: pos.y, radius: 60, hp: 3000, maxHp: 3000, state: 'hover', timer: 120 };
    document.getElementById('boss-warning').style.opacity = 1;
    setTimeout(() => {
        document.getElementById('boss-warning').style.opacity = 0;
    }, 3000);
}

function takeDamage(dmg) {
    if (player.shieldTime > 0) return;
    
    // Armor reduces incoming damage by 50% and absorbs 50%
    if (player.armor > 0) {
        const damageReduction = 0.5; // Armor reduces 50% of damage
        const reducedDamage = dmg * damageReduction;
        const armorAbsorbed = Math.min(player.armor, reducedDamage);
        
        player.armor -= armorAbsorbed;
        
        // HP still takes reduced damage
        const hpDamage = dmg * damageReduction;
        player.hp -= hpDamage;
        
        // Sparkle particles when armor is active
        for (let i = 0; i < 5; i++) {
            particles.push({
                x: player.x + (Math.random() - 0.5) * 30,
                y: player.y + (Math.random() - 0.5) * 30,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 30,
                color: '#38bdf8',
                size: Math.random() * 3 + 2,
                gravity: 0.1,
                drag: 0.05
            });
        }
        
        screenShake = 6;
        addFloatText('-' + Math.ceil(hpDamage) + ' HP', player.x, player.y - 40, '#ef4444');
        addFloatText('-' + Math.ceil(armorAbsorbed) + ' AR', player.x, player.y - 55, '#38bdf8');
        return;
    }
    
    // No armor - full damage to HP
    player.hp -= dmg;
    screenShake = 8;
    addFloatText('-' + Math.ceil(dmg), player.x, player.y - 40, '#ef4444');
}

function addFloatText(t, x, y, c) {
    floatText.push({ text: t, x, y, color: c, life: 60, maxLife: 60 });
}
