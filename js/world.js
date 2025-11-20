// --- SETUP ---
// Canvas is responsive so recalculating dimensions here keeps the arena view
// matched to the browser window.
function resize() {
    CANVAS.width = window.innerWidth;
    CANVAS.height = window.innerHeight;
}

window.addEventListener('resize', resize);

// --- INIT WORLD ---
// Procedurally place walls and crates to form light cover so each run feels
// slightly different while still respecting a protected spawn zone.
function initWorld() {
    walls = [];
    crates = [];
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
    player.killStreak = 0;
    player.ultReady = false;
    player.isUlting = false;
    player.shieldTime = 0;
    player.weapon = 'cannon';
    player.vx = 0;
    player.vy = 0;
    player.seed = Math.random(); // Unique seed for consistent crack rendering
    resize();
    camX = player.x - CANVAS.width / 2;
    camY = player.y - CANVAS.height / 2;
}

// Enemy spawns scale tier selection with score so difficulty ramps over time.
function spawnEnemy() {
    let tierIdx = 0;
    if (score > 500) tierIdx = Math.floor(Math.random() * 2);
    if (score > 1500) tierIdx = Math.floor(Math.random() * 3);
    if (score > 3000) tierIdx = Math.floor(Math.random() * 4);
    if (score > 5000) tierIdx = Math.floor(Math.random() * 5);

    let tier = ENEMY_TIERS[tierIdx];
    let pos = findPlayerRingSpawn(30) || findSafeSpot(30, true);
    const guardPoint = getNearestCrateCenter(pos.x, pos.y);

    enemies.push({
        x: pos.x,
        y: pos.y,
        hp: tier.hp,
        maxHp: tier.hp,
        radius: 25,
        speed: tier.speed,
        angle: 0,
        turretAngle: 0,
        cooldown: 100,
        maxCooldown: tier.cd,
        err: tier.err,
        color: tier.color,
        accent: tier.accent,
        hitFlash: 0,
        weapon: tier.weapon,
        id: tier.id,
        stuckTimer: 0,
        home: { x: pos.x, y: pos.y },
        guardPoint,
        patrolPoint: createPatrolWaypoint(guardPoint),
        patrolCooldown: 0,
        seed: Math.random() // Unique seed for consistent crack rendering
    });
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
