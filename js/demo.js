// Demo Battle System - Animated background for homepage
// Displays AI-controlled tanks (player-like, enemies, boss) fighting autonomously

const DEMO_CANVAS = document.getElementById('demoCanvas');
const DEMO_CTX = DEMO_CANVAS.getContext('2d');

let demoActive = false;
let demoAnimationFrame = null;

// Demo world state
let demoTanks = [];
let demoBullets = [];
let demoParticles = [];
let demoFrame = 0;

// Initialize demo battle scene
function initDemo() {
    DEMO_CANVAS.width = window.innerWidth;
    DEMO_CANVAS.height = window.innerHeight;
    
    // Create demo tanks (1 player + enemies matching gameplay tiers)
    demoTanks = [
        // Player-like tank (green) - Random weapon for variety
        {
            x: DEMO_CANVAS.width * 0.2,
            y: DEMO_CANVAS.height * 0.5,
            angle: 0,
            turretAngle: 0,
            color: '#15803d',
            type: 'player',
            speed: 1.5,
            hp: 100,
            maxHp: 100,
            targetIndex: 1,
            seed: Math.random(),
            hitFlash: 0,
            weapon: ['cannon', 'twin', 'burst', 'sniper', 'laser'][Math.floor(Math.random() * 5)],
            fireDelay: 25,
            lastShot: 0,
            accuracy: 0.75,
            recoil: 0,
            spawnSlot: 2, // Middle left
            shieldTime: 0, // Shield after respawn
            lastTargetChange: 0,
            playerFocusFrame: 0
        },
        // Enemy Tier 1 (yellow) - Cannon (matches gameplay tier 0)
        {
            x: DEMO_CANVAS.width * 0.8,
            y: DEMO_CANVAS.height * 0.25,
            angle: Math.PI,
            turretAngle: Math.PI,
            color: '#facc15',
            accent: '#ca8a04',
            type: 'enemy',
            speed: 1.2,
            hp: 100,
            maxHp: 100,
            targetIndex: 0,
            seed: Math.random(),
            hitFlash: 0,
            weapon: 'cannon',
            fireDelay: 25,
            lastShot: 0,
            accuracy: 0.60,
            recoil: 0,
            spawnSlot: 0, // Top right
            playerFocusFrame: 0
        },
        // Enemy Tier 2 (orange) - Twin Cannon (matches gameplay tier 1)
        {
            x: DEMO_CANVAS.width * 0.8,
            y: DEMO_CANVAS.height * 0.5,
            angle: Math.PI,
            turretAngle: Math.PI,
            color: '#fb923c',
            accent: '#ea580c',
            type: 'enemy',
            speed: 1.3,
            hp: 120,
            maxHp: 120,
            targetIndex: 0,
            seed: Math.random(),
            hitFlash: 0,
            weapon: 'twin',
            fireDelay: 20,
            lastShot: 0,
            accuracy: 0.70,
            recoil: 0,
            spawnSlot: 2,
            playerFocusFrame: 0
        },
        // Enemy Tier 3 (pink/magenta) - Shotgun (matches gameplay tier 2)
        {
            x: DEMO_CANVAS.width * 0.8,
            y: DEMO_CANVAS.height * 0.75,
            angle: Math.PI,
            turretAngle: Math.PI,
            color: '#f472b6',
            accent: '#db2777',
            type: 'enemy',
            speed: 1.1,
            hp: 150,
            maxHp: 150,
            targetIndex: 0,
            seed: Math.random(),
            hitFlash: 0,
            weapon: 'shotgun',
            fireDelay: 40,
            lastShot: 0,
            accuracy: 0.82,
            recoil: 0,
            spawnSlot: 4,
            playerFocusFrame: 0
        },
        // Boss Tier 4 (red) - Burst (matches gameplay tier 3)
        {
            x: DEMO_CANVAS.width * 0.85,
            y: DEMO_CANVAS.height * 0.4,
            angle: Math.PI,
            turretAngle: Math.PI,
            color: '#ef4444',
            accent: '#b91c1c',
            type: 'boss',
            speed: 0.8,
            hp: 200,
            maxHp: 200,
            size: 1.5,
            targetIndex: 0,
            seed: Math.random(),
            hitFlash: 0,
            weapon: 'burst',
            fireDelay: 18,
            lastShot: 0,
            accuracy: 0.90,
            recoil: 0,
            spawnSlot: 1,
            playerFocusFrame: 0
        }
    ];
    
    // Set fire delays based on weapon types
    const fireDelays = { cannon: 25, twin: 20, shotgun: 40, burst: 18, sniper: 50, laser: 4 };
    demoTanks.forEach(tank => {
        tank.fireDelay = fireDelays[tank.weapon] || 25;
    });
    
    // Define spawn positions (5 slots distributed evenly)
    window.demoSpawnSlots = [
        { x: 0.8, y: 0.20 },  // Slot 0: Top right
        { x: 0.85, y: 0.40 }, // Slot 1: Top-mid right
        { x: 0.8, y: 0.50 },  // Slot 2: Middle right
        { x: 0.85, y: 0.65 }, // Slot 3: Bottom-mid right
        { x: 0.8, y: 0.80 }   // Slot 4: Bottom right
    ];
    
    demoBullets = [];
    demoParticles = [];
    demoActive = true;
    demoFrame = 0;
    
    // Start animation loop
    if (demoAnimationFrame) {
        cancelAnimationFrame(demoAnimationFrame);
    }
    
    // Add class to body to hide UI during demo
    document.body.classList.add('demo-active');
    
    demoBattleLoop();
}

// Find random spawn position that doesn't collide with existing tanks
function findSafeSpawnPosition(existingTanks, minDistance = 150) {
    const maxAttempts = 50;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const x = DEMO_CANVAS.width * (0.15 + Math.random() * 0.7);
        const y = DEMO_CANVAS.height * (0.2 + Math.random() * 0.6);
        
        // Check distance from all existing tanks
        let isSafe = true;
        for (const tank of existingTanks) {
            if (tank.hp > 0) {
                const dist = Math.hypot(x - tank.x, y - tank.y);
                if (dist < minDistance) {
                    isSafe = false;
                    break;
                }
            }
        }
        
        if (isSafe) {
            return { x, y };
        }
    }
    
    // Fallback if no safe position found
    return {
        x: DEMO_CANVAS.width * (0.3 + Math.random() * 0.4),
        y: DEMO_CANVAS.height * (0.3 + Math.random() * 0.4)
    };
}

// Create dramatic respawn animation with expanding rings and particles
function createRespawnAnimation(x, y, isPlayer) {
    const color = isPlayer ? '#4ade80' : '#00ffff';
    const particleColor = isPlayer ? '#22c55e' : '#06b6d4';
    
    // Create expanding energy rings
    for (let ring = 0; ring < 3; ring++) {
        setTimeout(() => {
            for (let p = 0; p < 24; p++) {
                const angle = (Math.PI * 2 * p) / 24;
                const speed = 3 + Math.random() * 2;
                demoParticles.push({
                    x: x,
                    y: y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    color: particleColor,
                    size: 4 + Math.random() * 3,
                    life: 50 - ring * 10
                });
            }
        }, ring * 150);
    }
    
    // Create upward burst particles
    for (let p = 0; p < 15; p++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
        const speed = 4 + Math.random() * 3;
        demoParticles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: color,
            size: 5 + Math.random() * 4,
            life: 60
        });
    }
    
    // Create ground impact particles
    for (let p = 0; p < 20; p++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 2;
        demoParticles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed * 0.5,
            vy: Math.sin(angle) * speed * 0.5,
            color: '#fbbf24',
            size: 2 + Math.random() * 2,
            life: 40
        });
    }
}

// Main demo battle loop
function demoBattleLoop() {
    if (!demoActive) return;
    
    demoFrame++;
    
    // Clear canvas with terrain-like background
    drawDemoBackground();
    
    // Update and draw all entities
    updateDemoTanks();
    updateDemoBullets();
    updateDemoParticles();
    
    drawDemoTanks();
    drawDemoBullets();
    drawDemoParticles();
    
    demoAnimationFrame = requestAnimationFrame(demoBattleLoop);
}

// Draw natural terrain background
function drawDemoBackground() {
    const tileSize = 50;
    for (let x = 0; x < DEMO_CANVAS.width; x += tileSize) {
        for (let y = 0; y < DEMO_CANVAS.height; y += tileSize) {
            const seed = Math.sin(x * 0.01) * Math.cos(y * 0.01);
            const isDirt = seed > 0.3;
            DEMO_CTX.fillStyle = isDirt ? '#6b5d4f' : '#4a6741';
            DEMO_CTX.fillRect(x, y, tileSize, tileSize);
        }
    }
}

// Update demo tank AI and movement
function updateDemoTanks() {
    demoTanks.forEach((tank, i) => {
        if (tank.hp <= 0) return;
        
        // Decay recoil effect
        if (tank.recoil > 0) tank.recoil *= 0.7;
        
        // Decay shield time for player
        if (tank.shieldTime > 0) tank.shieldTime--;
        
        // Find target (only target different team - no friendly fire)
        let target = demoTanks[tank.targetIndex];
        const focusExpired = tank.type === 'player' && tank.lastTargetChange !== undefined && (demoFrame - (tank.lastTargetChange || 0) > 240);
        if (!target || target.hp <= 0 || target.type === tank.type || focusExpired) {
            // Find new target from different team
            if (tank.type === 'player') {
                // Player prioritizes enemies that haven't been focused recently
                const candidates = [];
                demoTanks.forEach((t, idx) => {
                    if (idx !== i && t.hp > 0 && (t.type === 'enemy' || t.type === 'boss')) {
                        candidates.push({
                            idx,
                            lastFocus: t.playerFocusFrame || 0,
                            dist: Math.hypot(t.x - tank.x, t.y - tank.y)
                        });
                    }
                });
                if (candidates.length) {
                    candidates.sort((a, b) => {
                        if (a.lastFocus === b.lastFocus) {
                            return a.dist - b.dist;
                        }
                        return a.lastFocus - b.lastFocus;
                    });
                    const chosen = candidates[0];
                    tank.targetIndex = chosen.idx;
                    tank.lastTargetChange = demoFrame;
                    demoTanks[chosen.idx].playerFocusFrame = demoFrame;
                } else {
                    tank.targetIndex = -1;
                }
            } else {
                // Enemies and boss target player
                tank.targetIndex = demoTanks.findIndex((t, idx) => idx !== i && t.hp > 0 && t.type === 'player');
            }
            target = demoTanks[tank.targetIndex];
        }
        
        if (target && target.hp > 0) {
            // Aim turret at target
            const dx = target.x - tank.x;
            const dy = target.y - tank.y;
            const targetAngle = Math.atan2(dy, dx);
            tank.turretAngle = targetAngle;
            
            // Move towards/away from target
            const dist = Math.sqrt(dx * dx + dy * dy);
            const optimalDist = tank.type === 'boss' ? 300 : 250;
            
            if (dist > optimalDist + 50) {
                // Move closer
                tank.angle = targetAngle;
                tank.x += Math.cos(tank.angle) * tank.speed;
                tank.y += Math.sin(tank.angle) * tank.speed;
            } else if (dist < optimalDist - 50) {
                // Move away
                tank.angle = targetAngle + Math.PI;
                tank.x += Math.cos(tank.angle) * tank.speed * 0.5;
                tank.y += Math.sin(tank.angle) * tank.speed * 0.5;
            }
            
            // Keep in bounds
            tank.x = Math.max(50, Math.min(DEMO_CANVAS.width - 50, tank.x));
            tank.y = Math.max(50, Math.min(DEMO_CANVAS.height - 50, tank.y));
            
            // Prevent enemy tanks from overlapping (separation behavior)
            if (tank.type !== 'player') {
                demoTanks.forEach((otherTank, j) => {
                    if (j !== i && otherTank.hp > 0 && otherTank.type !== 'player') {
                        const dx = tank.x - otherTank.x;
                        const dy = tank.y - otherTank.y;
                        const dist = Math.hypot(dx, dy);
                        const minDist = 80; // Minimum distance between enemies
                        
                        if (dist < minDist && dist > 0) {
                            // Push away from each other
                            const pushForce = (minDist - dist) / minDist;
                            tank.x += (dx / dist) * pushForce * 2;
                            tank.y += (dy / dist) * pushForce * 2;
                        }
                    }
                });
            }
            
            // Fire bullets based on weapon type and fire rate
            if (demoFrame - tank.lastShot >= tank.fireDelay) {
                tank.lastShot = demoFrame;
                
                const weaponData = {
                    cannon: { speed: 6, color: '#ffaa00', dmg: 15, count: 1, spread: 0.12 },
                    twin: { speed: 6, color: '#00ffaa', dmg: 12, count: 2, spread: 0.1 },
                    shotgun: { speed: 5, color: '#ff00ff', dmg: 11, count: 5, spread: 0.25 },
                    burst: { speed: 7, color: '#fbbf24', dmg: 18, count: 3, spread: 0.09 },
                    sniper: { speed: 12, color: '#ffffff', dmg: 40, count: 1, spread: 0.035 },
                    laser: { speed: 10, color: '#00ffff', dmg: 10, count: 1, spread: 0.05 }
                };
                
                const weapon = weaponData[tank.weapon] || weaponData.cannon;
                
                // Apply recoil effect based on weapon type
                const recoilValues = { cannon: 8, twin: 6, shotgun: 11, burst: 7, sniper: 15, laser: 4 };
                tank.recoil = recoilValues[tank.weapon] || 8;
                
                // Calculate accuracy-based spread
                const baseSpread = weapon.spread;
                const accuracySpread = (1 - tank.accuracy) * 0.3; // Miss shots based on accuracy
                const totalSpread = baseSpread + accuracySpread;
                
                // Fire bullets based on weapon type
                for (let b = 0; b < weapon.count; b++) {
                    // Apply accuracy - chance to miss based on accuracy stat
                    const missAngle = (Math.random() - 0.5) * totalSpread;
                    const spreadAngle = tank.turretAngle + missAngle;
                    const offsetY = weapon.count > 1 ? (b - (weapon.count - 1) / 2) * 8 : 0;
                    
                    demoBullets.push({
                        x: tank.x + Math.cos(tank.turretAngle) * 30 + Math.cos(tank.turretAngle + Math.PI / 2) * offsetY,
                        y: tank.y + Math.sin(tank.turretAngle) * 30 + Math.sin(tank.turretAngle + Math.PI / 2) * offsetY,
                        vx: Math.cos(spreadAngle) * weapon.speed,
                        vy: Math.sin(spreadAngle) * weapon.speed,
                        color: weapon.color,
                        owner: i,
                        ownerType: tank.type,
                        damage: weapon.dmg,
                        life: 120
                    });
                }
            }
        }
    });
}

// Update demo bullets
function updateDemoBullets() {
    demoBullets = demoBullets.filter(b => {
        b.x += b.vx;
        b.y += b.vy;
        b.life--;
        
        // Check collisions with tanks (no friendly fire)
        demoTanks.forEach((tank, i) => {
            if (i === b.owner || tank.hp <= 0) return;
            
            // Prevent friendly fire - only damage different teams
            if (b.ownerType === tank.type) return;
            if (b.ownerType === 'enemy' && tank.type === 'boss') return; // Enemies don't attack boss
            if (b.ownerType === 'boss' && tank.type === 'enemy') return; // Boss doesn't attack enemies
            
            const dx = tank.x - b.x;
            const dy = tank.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 30) {
                // Check if player has shield
                if (tank.type === 'player' && tank.shieldTime > 0) {
                    // Shield blocks damage - just destroy bullet
                    b.life = 0;
                    // Create shield impact particles
                    for (let j = 0; j < 5; j++) {
                        demoParticles.push({
                            x: b.x,
                            y: b.y,
                            vx: (Math.random() - 0.5) * 3,
                            vy: (Math.random() - 0.5) * 3,
                            color: '#00ffff',
                            size: 2 + Math.random() * 2,
                            life: 20
                        });
                    }
                    return;
                }
                
                tank.hp -= b.damage;
                tank.hitFlash = 5;
                b.life = 0;
                // Create explosion particles
                for (let j = 0; j < 8; j++) {
                    demoParticles.push({
                        x: b.x,
                        y: b.y,
                        vx: (Math.random() - 0.5) * 4,
                        vy: (Math.random() - 0.5) * 4,
                        color: '#ff6b35',
                        size: 3 + Math.random() * 4,
                        life: 30
                    });
                }
            }
        });
        
        return b.life > 0 && b.x > 0 && b.x < DEMO_CANVAS.width && b.y > 0 && b.y < DEMO_CANVAS.height;
    });
}

// Update demo particles
function updateDemoParticles() {
    demoParticles = demoParticles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.life--;
        return p.life > 0;
    });
}

// Get turret color based on weapon type (matches WEAPONS config colors)
function getTurretColorFromWeapon(weaponType) {
    const weaponColors = {
        cannon: '#ffaa00',
        twin: '#00ffaa',
        shotgun: '#ff00ff',
        burst: '#fbbf24',
        sniper: '#ffffff',
        laser: '#00ffff',
        flak: '#fb923c',
        rocket: '#ff3333',
        gauss: '#a78bfa'
    };
    return weaponColors[weaponType] || '#ffaa00'; // Default to cannon color
}

// Draw demo tanks using exact game rendering
function drawDemoTanks() {
    demoTanks.forEach((tank, idx) => {
        // Respawn dead tanks with dramatic animation
        if (tank.hp <= 0) {
            // Create death explosion particles
            for (let p = 0; p < 25; p++) {
                const angle = (Math.PI * 2 * p) / 25;
                const speed = 3 + Math.random() * 4;
                demoParticles.push({
                    x: tank.x,
                    y: tank.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    color: tank.type === 'player' ? '#ef4444' : '#f59e0b',
                    size: 4 + Math.random() * 4,
                    life: 45
                });
            }
            
            // Reset tank stats
            tank.hp = tank.type === 'boss' ? 200 : (tank.maxHp || 100);
            tank.maxHp = tank.hp;
            tank.seed = Math.random();
            tank.lastShot = 0;
            tank.playerFocusFrame = 0;
            tank.lastTargetChange = 0;
            
            // Randomize player weapon on respawn
            if (tank.type === 'player') {
                tank.weapon = ['cannon', 'twin', 'burst', 'sniper', 'laser'][Math.floor(Math.random() * 5)];
                const fireDelays = { cannon: 25, twin: 20, shotgun: 40, burst: 18, sniper: 50, laser: 4 };
                tank.fireDelay = fireDelays[tank.weapon] || 25;
                tank.shieldTime = 180; // 3 seconds shield at 60fps
            }
            
            // Find random spawn position without collision
            const otherTanks = demoTanks.filter((_, otherIdx) => otherIdx !== idx);
            const spawnPos = findSafeSpawnPosition(otherTanks, tank.type === 'player' ? 200 : 150);
            
            tank.x = spawnPos.x;
            tank.y = spawnPos.y;
            
            // Set initial angle based on position
            if (tank.type === 'player') {
                // Player faces right
                tank.angle = 0;
                tank.turretAngle = 0;
            } else {
                // Enemies face toward center
                const centerX = DEMO_CANVAS.width / 2;
                const centerY = DEMO_CANVAS.height / 2;
                tank.angle = Math.atan2(centerY - tank.y, centerX - tank.x);
                tank.turretAngle = tank.angle;
            }
            
            // Create dramatic respawn animation
            createRespawnAnimation(tank.x, tank.y, tank.type === 'player');
            
            return;
        }
        
        DEMO_CTX.save();
        DEMO_CTX.translate(tank.x, tank.y);
        
        // Draw body shadow (rotated with tank, with fixed offset for lighting)
        DEMO_CTX.save();
        DEMO_CTX.translate(3, 3); // Fixed offset for light source (bottom-right)
        DEMO_CTX.rotate(tank.angle);
        DEMO_CTX.fillStyle = 'rgba(0, 0, 0, 0.3)';
        DEMO_CTX.fillRect(-25, -21, 50, 42);
        DEMO_CTX.restore();
        
        // Tank body with exact game rendering
        DEMO_CTX.save();
        DEMO_CTX.rotate(tank.angle);
        
        // Chassis layers (exact game dimensions)
        DEMO_CTX.fillStyle = '#2c2c2c';
        DEMO_CTX.fillRect(-25, -21, 50, 42);
        DEMO_CTX.fillStyle = '#444';
        DEMO_CTX.fillRect(-23, -19, 46, 38);
        DEMO_CTX.fillStyle = tank.hitFlash > 0 ? '#fff' : tank.color;
        DEMO_CTX.fillRect(-18, -15, 36, 30);
        
        // Internal shading
        DEMO_CTX.fillStyle = 'rgba(0,0,0,0.15)';
        DEMO_CTX.fillRect(-10, -10, 20, 20);
        
        // Draw 20-step damage cracks on tank body
        const hpRatio = tank.hp / (tank.maxHp || tank.hp);
        if (hpRatio < 1) {
            drawDemoCracks(hpRatio, tank.seed || 0.5);
        }
        
        DEMO_CTX.restore();
        
        // Draw turret shadow (rotated with turret, with fixed offset)
        DEMO_CTX.save();
        DEMO_CTX.translate(2, 2); // Fixed offset for light source
        DEMO_CTX.rotate(tank.turretAngle);
        DEMO_CTX.fillStyle = 'rgba(0, 0, 0, 0.25)';
        DEMO_CTX.fillRect(0, -7, 36, 14);
        DEMO_CTX.restore();
        
        // Turret rendering
        DEMO_CTX.rotate(tank.turretAngle);
        if (tank.recoil > 0) DEMO_CTX.translate(-tank.recoil, 0); // Apply recoil offset
        
        // Determine turret color based on tank type and weapon
        const turretColor = tank.hitFlash > 0 ? '#fff' : 
            (tank.type === 'player' ? getTurretColorFromWeapon(tank.weapon) : 
            (tank.accent || tank.color));
        
        // Turret barrel
        DEMO_CTX.fillStyle = turretColor;
        DEMO_CTX.fillRect(0, -7, 36, 14);
        DEMO_CTX.strokeStyle = '#222';
        DEMO_CTX.lineWidth = 1;
        DEMO_CTX.strokeRect(0, -7, 36, 14);
        
        // Turret base (matching game exactly)
        DEMO_CTX.fillStyle = tank.hitFlash > 0 ? '#fff' : tank.color;
        DEMO_CTX.beginPath();
        DEMO_CTX.arc(0, 0, 13, 0, Math.PI * 2);
        DEMO_CTX.fill();
        
        // Turret center with weapon color
        DEMO_CTX.fillStyle = turretColor;
        DEMO_CTX.beginPath();
        DEMO_CTX.arc(0, 0, 7, 0, Math.PI * 2);
        DEMO_CTX.fill();
        
        // Draw shield for player if active
        if (tank.type === 'player' && tank.shieldTime > 0) {
            const shieldPulse = 0.3 + Math.sin(demoFrame * 0.15) * 0.2;
            DEMO_CTX.beginPath();
            DEMO_CTX.strokeStyle = `rgba(0, 255, 255, ${shieldPulse})`;
            DEMO_CTX.lineWidth = 3;
            DEMO_CTX.arc(0, 0, 35, 0, Math.PI * 2);
            DEMO_CTX.stroke();
            
            DEMO_CTX.beginPath();
            DEMO_CTX.strokeStyle = `rgba(0, 255, 255, ${shieldPulse * 0.5})`;
            DEMO_CTX.lineWidth = 2;
            DEMO_CTX.arc(0, 0, 40 + Math.sin(demoFrame * 0.1) * 3, 0, Math.PI * 2);
            DEMO_CTX.stroke();
        }
        
        DEMO_CTX.restore();
        
        // Draw HP bar AFTER all rotations (always horizontal above tank)
        if (tank.type !== 'player') {
            DEMO_CTX.fillStyle = 'rgba(0,0,0,0.5)';
            DEMO_CTX.fillRect(-20, -40, 40, 5);
            DEMO_CTX.fillStyle = '#0f0';
            DEMO_CTX.fillRect(-20, -40, 40 * hpRatio, 5);
        }
        
        // Reset hit flash
        if (tank.hitFlash > 0) tank.hitFlash--;
    });
}

// Draw damage cracks matching game's 20-step system
function drawDemoCracks(hpRatio, seed) {
    const crackSteps = 20;
    const damage = 1 - hpRatio;
    const activeSteps = Math.floor(damage * crackSteps);
    
    if (activeSteps <= 0) return;
    
    DEMO_CTX.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    DEMO_CTX.lineWidth = 1.5;
    
    for (let i = 0; i < activeSteps; i++) {
        const offset = (seed + i * 0.37) % 1;
        const startX = -18 + (offset * 36);
        const startY = -15 + ((i / crackSteps) * 30);
        const length = 8 + (offset * 10);
        const angle = (offset * Math.PI) - Math.PI / 2;
        
        DEMO_CTX.beginPath();
        DEMO_CTX.moveTo(startX, startY);
        DEMO_CTX.lineTo(startX + Math.cos(angle) * length, startY + Math.sin(angle) * length);
        DEMO_CTX.stroke();
    }
}

// Draw demo bullets
function drawDemoBullets() {
    demoBullets.forEach(b => {
        DEMO_CTX.fillStyle = b.color;
        DEMO_CTX.beginPath();
        DEMO_CTX.arc(b.x, b.y, 4, 0, Math.PI * 2);
        DEMO_CTX.fill();
    });
}

// Draw demo particles
function drawDemoParticles() {
    demoParticles.forEach(p => {
        DEMO_CTX.globalAlpha = p.life / 30;
        DEMO_CTX.fillStyle = p.color;
        DEMO_CTX.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
        DEMO_CTX.globalAlpha = 1;
    });
}

// Stop demo battle
function stopDemo() {
    demoActive = false;
    if (demoAnimationFrame) {
        cancelAnimationFrame(demoAnimationFrame);
    }
    // Remove demo-active class to restore UI visibility
    document.body.classList.remove('demo-active');
    DEMO_CANVAS.classList.remove('active');
}

// Resize handler
window.addEventListener('resize', () => {
    if (demoActive) {
        DEMO_CANVAS.width = window.innerWidth;
        DEMO_CANVAS.height = window.innerHeight;
    }
});
