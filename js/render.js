// Draws player/enemy tanks using layered rectangles so colors remain readable
// even without image assets. Recoil offset sells weapon punch.
// Player tank shows 20-step damage cracks that fade when healing
// Light theme: Bright colors with realistic shadows
function drawTank(x, y, angle, turretAngle, colorBody, colorTurret, isPlayer, recoil, hpRatio = 1, hitFlash = 0, seed = 0.5) {
    CTX.save();
    CTX.translate(x, y);
    
    // Draw body shadow (rotated with tank, with fixed offset for lighting)
    CTX.save();
    CTX.translate(3, 3); // Fixed offset for light source (bottom-right)
    CTX.rotate(angle);
    CTX.fillStyle = 'rgba(0, 0, 0, 0.3)';
    CTX.fillRect(-25, -21, 50, 42);
    CTX.restore();
    
    // Draw tank body
    CTX.save();
    CTX.rotate(angle);
    CTX.fillStyle = '#2c2c2c';
    CTX.fillRect(-25, -21, 50, 42);
    CTX.fillStyle = '#444';
    CTX.fillRect(-23, -19, 46, 38);
    CTX.fillStyle = hitFlash > 0 ? '#fff' : colorBody;
    CTX.fillRect(-18, -15, 36, 30);
    CTX.fillStyle = 'rgba(0,0,0,0.15)';
    CTX.fillRect(-10, -10, 20, 20);
    
    // Draw 20-step damage cracks on tank body (player AND enemy)
    if (hpRatio < 1) {
        drawTankCrack(-18, -15, 36, 30, hpRatio, seed);
    }
    CTX.restore();

    // Draw turret shadow (rotated with turret, with fixed offset)
    CTX.save();
    CTX.translate(2, 2); // Fixed offset for light source
    CTX.rotate(turretAngle);
    if (recoil) CTX.translate(-recoil, 0);
    CTX.fillStyle = 'rgba(0, 0, 0, 0.25)';
    CTX.fillRect(0, -7, 36, 14);
    CTX.restore();
    
    // Draw turret
    CTX.rotate(turretAngle);
    if (recoil) CTX.translate(-recoil, 0);
    
    CTX.fillStyle = hitFlash > 0 ? '#fff' : colorTurret;
    CTX.fillRect(0, -7, 36, 14);
    CTX.strokeStyle = '#222';
    CTX.lineWidth = 1;
    CTX.strokeRect(0, -7, 36, 14);
    CTX.fillStyle = hitFlash > 0 ? '#fff' : colorBody;
    CTX.beginPath();
    CTX.arc(0, 0, 13, 0, Math.PI * 2);
    CTX.fill();
    CTX.fillStyle = hitFlash > 0 ? '#fff' : colorTurret;
    CTX.beginPath();
    CTX.arc(0, 0, 7, 0, Math.PI * 2);
    CTX.fill();

    if (isPlayer && player.shieldTime > 0) {
        let shieldPulse = 0.3 + Math.sin(frame * 0.15) * 0.2;
        CTX.beginPath();
        CTX.strokeStyle = `rgba(0, 255, 255, ${shieldPulse})`;
        CTX.lineWidth = 3;
        CTX.arc(0, 0, 35, 0, Math.PI * 2);
        CTX.stroke();

        CTX.beginPath();
        CTX.strokeStyle = `rgba(0, 255, 255, ${shieldPulse * 0.5})`;
        CTX.lineWidth = 2;
        CTX.arc(0, 0, 40 + Math.sin(frame * 0.1) * 3, 0, Math.PI * 2);
        CTX.stroke();
    }
    if (isPlayer && player.armor > 0) {
        let armorPulse = 0.3 + Math.sin(frame * 0.15) * 0.2;
        CTX.beginPath();
        CTX.strokeStyle = `rgba(56, 189, 248, ${armorPulse})`;
        CTX.lineWidth = 2;
        CTX.arc(0, 0, 32, 0, Math.PI * 2);
        CTX.stroke();
    }
    if (isPlayer && player.isUlting && player.ultTimer <= 60 && !player.firedUlt) {
        CTX.globalCompositeOperation = 'screen';
        CTX.fillStyle = `rgba(0, 255, 255, ${Math.random() * 0.5 + 0.5})`;
        CTX.beginPath();
        CTX.moveTo(30, 0);
        CTX.lineTo(WORLD_W, 1000);
        CTX.lineTo(WORLD_W, -1000);
        CTX.fill();
        CTX.globalCompositeOperation = 'source-over';
    }
    
    // Draw overlay bars in screen space so they never rotate with the tank
    const needsEnemyHpBar = !isPlayer;
    const needsPlayerBars = isPlayer && (player.armor > 0 || player.shieldTime > 0);
    if (needsEnemyHpBar || needsPlayerBars) {
        const matrix = CTX.getTransform ? CTX.getTransform() : null;
        const screenX = matrix ? matrix.e : x;
        const screenY = matrix ? matrix.f : y;

        CTX.save();
        if (CTX.resetTransform) {
            CTX.resetTransform();
        } else {
            CTX.setTransform(1, 0, 0, 1, 0, 0);
        }

        if (needsEnemyHpBar) {
            CTX.fillStyle = 'rgba(0,0,0,0.6)';
            CTX.fillRect(screenX - 20, screenY - 42, 40, 5);
            CTX.fillStyle = '#0f0';
            CTX.fillRect(screenX - 20, screenY - 42, 40 * hpRatio, 5);
        }

        if (needsPlayerBars) {
            const shieldRatio = Math.min(1, Math.max(0, player.shieldTime / 900));
            const armorRatio = Math.min(1, Math.max(0, player.armor / (player.maxArmor || 1)));
            let nextBarY = screenY - 56;

            if (player.armor > 0) {
                CTX.fillStyle = 'rgba(0,0,0,0.7)';
                CTX.fillRect(screenX - 20, nextBarY, 40, 4);
                CTX.fillStyle = '#38bdf8';
                CTX.fillRect(screenX - 20, nextBarY, 40 * armorRatio, 4);
                nextBarY += 6;
            }

            if (player.shieldTime > 0) {
                CTX.fillStyle = 'rgba(0,0,0,0.7)';
                CTX.fillRect(screenX - 20, nextBarY, 40, 4);
                CTX.fillStyle = 'cyan';
                CTX.fillRect(screenX - 20, nextBarY, 40 * shieldRatio, 4);
            }
        }

        CTX.restore();
    }
    
    CTX.restore();
}

// Draw realistic 20-step cracks on player tank that fade proportionally when healing
function drawTankCrack(x, y, w, h, hpRatio, seed) {
    CTX.save();
    const damage = 1 - hpRatio; // 0 = no damage, 1 = critical
    const maxCracks = 20; // Always 20 step system
    const activeCracks = Math.ceil(damage * maxCracks); // Number of visible cracks (1-20)
    
    const rnd = (idx, offset = 0) => {
        let val = Math.sin(seed * 917 + idx * 131 + offset * 73 + 0.1) * 10000;
        return val - Math.floor(val);
    };
    
    CTX.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    CTX.lineCap = 'round';
    CTX.lineWidth = 0.8 + damage * 0.4; // Thicker cracks when more damaged
    
    for (let i = 0; i < activeCracks; i++) {
        const crackAge = i / maxCracks; // 0 = oldest, 1 = newest
        const opacity = 0.3 + crackAge * 0.5; // Newer cracks are darker
        CTX.strokeStyle = `rgba(0, 0, 0, ${opacity * (0.5 + damage * 0.5)})`;
        
        // Start from edge
        const edge = Math.floor(rnd(i, 0) * 4);
        let startX = x, startY = y;
        if (edge === 0) { // Left edge
            startX = x;
            startY = y + rnd(i, 1) * h;
        } else if (edge === 1) { // Right edge
            startX = x + w;
            startY = y + rnd(i, 2) * h;
        } else if (edge === 2) { // Top edge
            startX = x + rnd(i, 3) * w;
            startY = y;
        } else { // Bottom edge
            startX = x + rnd(i, 4) * w;
            startY = y + h;
        }
        
        CTX.beginPath();
        CTX.moveTo(startX, startY);
        
        // Draw crack path with 2-4 segments
        const segments = 2 + Math.floor(rnd(i, 5) * 3);
        let currX = startX, currY = startY;
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        
        for (let j = 0; j < segments; j++) {
            const angleToCenter = Math.atan2(centerY - currY, centerX - currX);
            const randomDeviation = (rnd(i, 10 + j) - 0.5) * 1.2;
            const angle = angleToCenter + randomDeviation;
            const len = (8 + rnd(i, 20 + j) * 6) * (1 + damage * 0.5);
            
            currX += Math.cos(angle) * len;
            currY += Math.sin(angle) * len;
            
            // Keep within tank bounds
            currX = Math.max(x, Math.min(x + w, currX));
            currY = Math.max(y, Math.min(y + h, currY));
            
            CTX.lineTo(currX, currY);
        }
        CTX.stroke();
    }
    CTX.restore();
}

// Procedural cracks visualize structure health with realistic 20-step system
// Reusing seeded RNG so damage stays stable frame-to-frame
function drawCrack(x, y, w, h, ratio, seed) {
    CTX.save();
    CTX.translate(x, y);
    const damage = Math.min(1, Math.max(0, 1 - ratio)); // 0 = no damage, 1 = destroyed
    const maxCracks = 20; // Always 20 step system
    const activeCracks = Math.ceil(damage * maxCracks); // Number of visible cracks (0-20)
    
    if (activeCracks === 0) {
        CTX.restore();
        return;
    }
    
    const rnd = (idx, offset = 0) => {
        let val = Math.sin(seed * 917 + idx * 131 + offset * 73 + 0.1) * 10000;
        return val - Math.floor(val);
    };

    const drawPath = (weight, alpha, glow = false) => {
        CTX.lineCap = 'round';
        CTX.lineWidth = weight;
        CTX.strokeStyle = `rgba(${glow ? 255 : 15}, ${glow ? 255 : 15}, ${glow ? 255 : 15}, ${alpha})`;
        for (let i = 0; i < activeCracks; i++) {
            // Crack age determines visibility (newer = more visible)
            const crackAge = i / maxCracks;
            const crackOpacity = 0.4 + crackAge * 0.4;
            
            // Start from edge or corner
            const edgePick = rnd(i, 0) * 5;
            let startX = 0, startY = 0;
            if (edgePick < 1) { // Left edge
                startX = 0;
                startY = rnd(i, 20) * h;
            } else if (edgePick < 2) { // Right edge
                startX = w;
                startY = rnd(i, 40) * h;
            } else if (edgePick < 3) { // Top edge
                startX = rnd(i, 60) * w;
                startY = 0;
            } else if (edgePick < 4) { // Bottom edge
                startX = rnd(i, 80) * w;
                startY = h;
            } else { // Random interior point for impact cracks
                startX = rnd(i, 100) * w;
                startY = rnd(i, 120) * h;
            }

            CTX.beginPath();
            CTX.moveTo(startX, startY);
            
            // More segments for severe damage
            const segCount = 3 + Math.floor(rnd(i, 100) * (3 + damage * 4));
            let currX = startX;
            let currY = startY;
            const baseLen = Math.hypot(w, h) / (3 + rnd(i, 150) * 3);
            const lengthFactor = baseLen * (0.4 + damage * 0.8);
            
            for (let j = 0; j < segCount; j++) {
                // Random jagged direction with bias toward center
                const angleToCenter = Math.atan2(h / 2 - currY, w / 2 - currX);
                const randomness = (rnd(i * 13 + j, 0) - 0.5) * (1.4 + damage * 1.2);
                const baseAngle = angleToCenter + randomness;
                const segLen = (lengthFactor / segCount) * (0.7 + rnd(i, 200 + j) * 0.6);
                
                currX += Math.cos(baseAngle) * segLen;
                currY += Math.sin(baseAngle) * segLen;
                currX = Math.min(Math.max(currX, 0), w);
                currY = Math.min(Math.max(currY, 0), h);
                CTX.lineTo(currX, currY);

                // Add branches for more realistic cracks (only if severe damage)
                if (!glow && damage > 0.3 && rnd(i, 300 + j) > 0.7) {
                    const branchLen = segLen * (0.5 + rnd(i, 350 + j) * 0.4);
                    const branchAngle = baseAngle + (rnd(i, 400 + j) - 0.5) * 2.0;
                    const branchX = currX + Math.cos(branchAngle) * branchLen;
                    const branchY = currY + Math.sin(branchAngle) * branchLen;
                    
                    CTX.moveTo(currX, currY);
                    CTX.lineTo(
                        Math.min(Math.max(branchX, 0), w),
                        Math.min(Math.max(branchY, 0), h)
                    );
                    CTX.moveTo(currX, currY); // Return to main path
                }
            }
            CTX.stroke();
        }
    };

    // Main crack lines (darker and thicker as damage increases)
    drawPath(1.2 + damage * 1.0, 0.6 + damage * 0.3);
    
    // Add subtle glow effect for severe damage (gives depth)
    if (damage > 0.25) {
        CTX.globalAlpha = 0.3 + damage * 0.4;
        drawPath(0.8, 0.2, true);
    }
    
    CTX.restore();
}

function drawCrate(c) {
    // Gold crate shadow
    CTX.fillStyle = 'rgba(0, 0, 0, 0.3)';
    CTX.fillRect(c.x + 4, c.y + 4, c.w, c.h);
    
    // Gold crate body
    CTX.fillStyle = '#fbbf24';
    CTX.fillRect(c.x, c.y, c.w, c.h);
    CTX.strokeStyle = '#d97706';
    CTX.lineWidth = 4;
    CTX.strokeRect(c.x, c.y, c.w, c.h);
    
    // Gold highlights
    CTX.fillStyle = '#fcd34d';
    CTX.fillRect(c.x + 3, c.y + 3, c.w - 6, 6);
    
    // Diagonal cross pattern
    CTX.strokeStyle = '#b45309';
    CTX.lineWidth = 3;
    CTX.beginPath();
    CTX.moveTo(c.x, c.y);
    CTX.lineTo(c.x + c.w, c.y + c.h);
    CTX.moveTo(c.x + c.w, c.y);
    CTX.lineTo(c.x, c.y + c.h);
    CTX.stroke();

    drawCrack(c.x, c.y, c.w, c.h, c.hp / c.maxHp, c.seed);

    CTX.fillStyle = 'rgba(0,0,0,0.4)';
    CTX.fillRect(c.x, c.y - 10, c.w, 4);
    CTX.fillStyle = '#fbbf24';
    CTX.fillRect(c.x, c.y - 10, c.w * (c.hp / c.maxHp), 4);
}

// Core renderer paints background, props, actors, particles, UI overlays, and
// finally the minimap each frame. Ordering ensures alpha stacks correctly.
// Natural theme: Dirt and grass battlefield terrain
function draw() {
    // Random dirt/grass background (natural terrain)
    // Create seamless random terrain using noise-like pattern
    const tileSize = 40;
    const viewLeft = Math.floor(camX / tileSize) * tileSize;
    const viewTop = Math.floor(camY / tileSize) * tileSize;
    const viewRight = viewLeft + CANVAS.width + tileSize * 2;
    const viewBottom = viewTop + CANVAS.height + tileSize * 2;
    
    if (isNaN(camX) || isNaN(camY)) {
        camX = 0;
        camY = 0;
    }
    CTX.save();
    if (screenShake > 0) CTX.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
    CTX.translate(-camX, -camY);

    // Draw terrain tiles with seeded random for consistency
    for (let tx = viewLeft; tx < viewRight; tx += tileSize) {
        for (let ty = viewTop; ty < viewBottom; ty += tileSize) {
            // Seeded random based on position for consistent terrain
            const seed = Math.sin(tx * 0.01) * Math.cos(ty * 0.01);
            const isDirt = seed > 0.3;
            
            if (isDirt) {
                // Dirt patches (brown tones)
                CTX.fillStyle = seed > 0.6 ? '#6b5d4f' : '#7d6e5d';
            } else {
                // Grass areas (green tones)
                CTX.fillStyle = seed > 0 ? '#4a6741' : '#5a7a50';
            }
            CTX.fillRect(tx, ty, tileSize, tileSize);
            
            // Add subtle texture variation
            CTX.fillStyle = `rgba(0, 0, 0, ${Math.abs(seed) * 0.05})`;
            CTX.fillRect(tx, ty, tileSize, tileSize);
        }
    }

    // Draw tank tracks (dirty trails) BEFORE walls/objects for realism
    // Only render tracks within viewport for performance
    const trackViewLeft = camX - 100;
    const trackViewRight = camX + CANVAS.width + 100;
    const trackViewTop = camY - 100;
    const trackViewBottom = camY + CANVAS.height + 100;
    
    for (let track of playerTracks) {
        if (track.x < trackViewLeft || track.x > trackViewRight || track.y < trackViewTop || track.y > trackViewBottom) continue;
        CTX.fillStyle = `rgba(60, 50, 40, ${track.alpha})`; // Dark brown (more visible)
        CTX.save();
        CTX.translate(track.x, track.y);
        CTX.rotate(track.angle);
        // Left and right treads
        CTX.fillRect(-3, -10, 6, 8);  // Left tread
        CTX.fillRect(-3, 10, 6, 8);   // Right tread
        CTX.restore();
    }
    
    for (let track of enemyTracks) {
        if (track.x < trackViewLeft || track.x > trackViewRight || track.y < trackViewTop || track.y > trackViewBottom) continue;
        CTX.fillStyle = `rgba(100, 90, 80, ${track.alpha})`; // Light brown (less visible)
        CTX.save();
        CTX.translate(track.x, track.y);
        CTX.rotate(track.angle);
        // Smaller enemy tracks
        CTX.fillRect(-2, -9, 4, 7);   // Left tread
        CTX.fillRect(-2, 9, 4, 7);    // Right tread
        CTX.restore();
    }

    for (let w of walls) {
        if (w.x < camX + CANVAS.width && w.x + w.w > camX && w.y < camY + CANVAS.height && w.y + w.h > camY) {
            // Wall shadow
            CTX.fillStyle = 'rgba(0, 0, 0, 0.3)';
            CTX.fillRect(w.x + 4, w.y + 4, w.w, w.h);
            
            // Determine wall type based on size: thin walls = concrete, thick = metal container
            const isThick = w.w > 70 || w.h > 70;
            
            if (isThick) {
                // Metal shipping container (steel blue with rust)
                CTX.fillStyle = '#546e7a';
                CTX.fillRect(w.x, w.y, w.w, w.h);
                CTX.strokeStyle = '#37474f';
                CTX.lineWidth = 4;
                CTX.strokeRect(w.x, w.y, w.w, w.h);
                
                // Container horizontal ridges
                CTX.strokeStyle = '#455a64';
                CTX.lineWidth = 3;
                CTX.beginPath();
                for (let i = 1; i < 3; i++) {
                    CTX.moveTo(w.x, w.y + (w.h / 3) * i);
                    CTX.lineTo(w.x + w.w, w.y + (w.h / 3) * i);
                }
                CTX.stroke();
                
                // Rust stains
                CTX.fillStyle = 'rgba(139, 69, 19, 0.2)';
                CTX.fillRect(w.x + w.w * 0.7, w.y + w.h * 0.1, w.w * 0.2, w.h * 0.3);
                
                // Inner panel with bolts
                CTX.fillStyle = '#607d8b';
                CTX.fillRect(w.x + 8, w.y + 8, w.w - 16, w.h - 16);
                
                // Corner bolts
                CTX.fillStyle = '#37474f';
                const boltSize = 6;
                [w.x + 12, w.x + w.w - 12].forEach(bx => {
                    [w.y + 12, w.y + w.h - 12].forEach(by => {
                        CTX.beginPath();
                        CTX.arc(bx, by, boltSize, 0, Math.PI * 2);
                        CTX.fill();
                    });
                });
            } else {
                // Concrete barrier (gray with texture)
                const concreteBase = '#9e9e9e';
                CTX.fillStyle = concreteBase;
                CTX.fillRect(w.x, w.y, w.w, w.h);
                
                // Concrete texture (random spots)
                for (let i = 0; i < 8; i++) {
                    const spotX = w.x + Math.random() * w.w;
                    const spotY = w.y + Math.random() * w.h;
                    CTX.fillStyle = `rgba(${120 + Math.random() * 40}, ${120 + Math.random() * 40}, ${120 + Math.random() * 40}, 0.3)`;
                    CTX.fillRect(spotX, spotY, 8 + Math.random() * 12, 8 + Math.random() * 12);
                }
                
                // Concrete edge highlighting
                CTX.strokeStyle = '#bdbdbd';
                CTX.lineWidth = 2;
                CTX.strokeRect(w.x, w.y, w.w, w.h);
                
                // Dark edges for depth
                CTX.strokeStyle = '#616161';
                CTX.lineWidth = 1;
                CTX.beginPath();
                CTX.moveTo(w.x, w.y + w.h);
                CTX.lineTo(w.x + w.w, w.y + w.h);
                CTX.lineTo(w.x + w.w, w.y);
                CTX.stroke();
            }
            
            if (w.destructible) drawCrack(w.x, w.y, w.w, w.h, w.hp / w.maxHp, w.seed);
        }
    }
    for (let c of crates) {
        if (c.x < camX + CANVAS.width && c.x + c.w > camX && c.y < camY + CANVAS.height && c.y + c.h > camY) drawCrate(c);
    }

    for (let p of pickups) {
        let py = p.y + (p.floatY || 0);
        let glowIntensity = 0;
        if (p.type.rarity === 'legendary') glowIntensity = 25;
        else if (p.type.rarity === 'epic') glowIntensity = 18;
        else if (p.type.rarity === 'rare') glowIntensity = 12;
        else if (p.type.rarity === 'uncommon') glowIntensity = 8;
        else glowIntensity = 5;

        if (glowIntensity > 5) {
            CTX.beginPath();
            CTX.arc(p.x, py, 20 + Math.sin(frame * 0.15) * glowIntensity * 0.4, 0, Math.PI * 2);
            CTX.strokeStyle = p.type.c;
            CTX.lineWidth = 3;
            CTX.globalAlpha = 0.3 + Math.sin(frame * 0.1) * 0.2;
            CTX.stroke();
        }

        CTX.globalAlpha = 0.6;
        CTX.beginPath();
        CTX.arc(p.x, py, 18 + Math.sin(frame * 0.1) * 2, 0, Math.PI * 2);
        CTX.strokeStyle = p.type.c;
        CTX.lineWidth = 2;
        CTX.stroke();

        CTX.globalAlpha = 1;
        CTX.fillStyle = p.type.c;
        CTX.beginPath();
        CTX.arc(p.x, py, 12, 0, Math.PI * 2);
        CTX.fill();

        CTX.font = 'bold 10px Arial';
        CTX.textAlign = 'center';
        CTX.textBaseline = 'middle';
        
        // Draw text stroke for better visibility
        CTX.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        CTX.lineWidth = 3;
        CTX.strokeText(p.type.short, p.x, py);
        
        CTX.fillStyle = 'white';
        CTX.fillText(p.type.short, p.x, py);

        CTX.globalAlpha = 1;
    }

    for (let e of enemies) {
        if (e.id >= 3 && e.cooldown < 30) {
            CTX.save();
            CTX.translate(e.x, e.y);
            CTX.rotate(e.turretAngle);
            CTX.strokeStyle = `rgba(255, 0, 0, ${0.1 + ((30 - e.cooldown) / 30) * 0.2})`;
            CTX.lineWidth = 1;
            CTX.setLineDash([5, 5]);
            CTX.beginPath();
            CTX.moveTo(36, 0);
            CTX.lineTo(200, 0);
            CTX.stroke();
            CTX.setLineDash([]);
            CTX.restore();
        }
        drawTank(e.x, e.y, e.angle, e.turretAngle, e.color, e.accent, false, e.recoil || 0, e.hp / e.maxHp, e.hitFlash, e.seed || 0.5);
    }

    if (boss) {
        CTX.save();
        CTX.translate(boss.x, boss.y);
        CTX.fillStyle = 'rgba(0,0,0,0.5)';
        CTX.beginPath();
        CTX.arc(10, 10, 65, 0, Math.PI * 2);
        CTX.fill();
        CTX.fillStyle = '#4c1d95';
        CTX.beginPath();
        CTX.arc(0, 0, 60, 0, Math.PI * 2);
        CTX.fill();
        CTX.strokeStyle = '#a78bfa';
        CTX.lineWidth = 4;
        CTX.stroke();
        CTX.fillStyle = 'red';
        CTX.fillRect(-60, -90, 120, 10);
        CTX.fillStyle = '#0f0';
        CTX.fillRect(-60, -90, 120 * (boss.hp / boss.maxHp), 10);
        CTX.restore();
    }

    drawTank(player.x, player.y, player.angle, player.turretAngle, '#15803d', WEAPONS[player.weapon].color, true, player.recoil, player.hp / player.maxHp, 0, player.seed || 0.5);

    if (WEAPONS[player.weapon].laser && !player.isUlting) {
        CTX.save();
        CTX.translate(player.x, player.y);
        CTX.rotate(player.turretAngle);
        let laserLength = 600;
        let laserAlpha = 0.15 + Math.sin(frame * 0.15) * 0.1;
        let gradient = CTX.createLinearGradient(40, 0, laserLength, 0);
        gradient.addColorStop(0, `rgba(255, 0, 0, ${laserAlpha})`);
        gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
        CTX.fillStyle = gradient;
        CTX.fillRect(40, -1, laserLength, 2);
        CTX.fillStyle = `rgba(255, 0, 0, ${laserAlpha + 0.2})`;
        for (let i = 0; i < laserLength; i += 40) {
            CTX.beginPath();
            CTX.arc(40 + i, 0, 2, 0, Math.PI * 2);
            CTX.fill();
        }
        CTX.restore();
    }

    if (player.ultBeamTime > 0) {
        const beamLifeRatio = player.ultBeamTime / 120;
        const beamLength = Math.max(WORLD_W, WORLD_H) * 1.5;
        const beamWidth = 90 + Math.sin(frame * 0.25) * 25;
        CTX.save();
        CTX.translate(player.x, player.y);
        CTX.rotate(player.ultBeamAngle);
        CTX.globalCompositeOperation = 'lighter';

        const outerGradient = CTX.createLinearGradient(40, 0, beamLength, 0);
        outerGradient.addColorStop(0, `rgba(0, 255, 255, ${0.45 * beamLifeRatio})`);
        outerGradient.addColorStop(0.5, `rgba(0, 200, 255, ${0.25 * beamLifeRatio})`);
        outerGradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
        CTX.fillStyle = outerGradient;
        CTX.fillRect(40, -beamWidth / 2, beamLength, beamWidth);

        const coreWidth = 18 + Math.sin(frame * 0.4) * 6;
        CTX.fillStyle = `rgba(255, 255, 255, ${0.4 + 0.4 * beamLifeRatio})`;
        CTX.fillRect(40, -coreWidth / 2, beamLength, coreWidth);

        CTX.strokeStyle = `rgba(0, 255, 255, ${0.7 * beamLifeRatio})`;
        CTX.lineWidth = 4;
        CTX.setLineDash([20, 12]);
        CTX.beginPath();
        CTX.moveTo(40, 0);
        CTX.lineTo(beamLength, 0);
        CTX.stroke();

        CTX.setLineDash([]);
        for (let i = 80; i < beamLength; i += 160) {
            const pulseSize = 40 + Math.sin(frame * 0.6 + i * 0.02) * 10;
            CTX.globalAlpha = 0.25 + 0.25 * beamLifeRatio;
            CTX.beginPath();
            CTX.arc(40 + i, 0, pulseSize, 0, Math.PI * 2);
            CTX.stroke();
        }

        CTX.restore();
        CTX.globalCompositeOperation = 'source-over';
        CTX.globalAlpha = 1;
    }

    for (let b of bullets) {
        CTX.save();
        CTX.globalAlpha = b.life < 15 ? b.life / 15 : 1;
        
        // Bullet shadow (consistent bottom-right offset)
        CTX.fillStyle = 'rgba(0, 0, 0, 0.3)';
        CTX.beginPath();
        CTX.arc(b.x + 2, b.y + 2, 5, 0, Math.PI * 2);
        CTX.fill();
        
        if (!b.isEnemy) {
            CTX.strokeStyle = b.color;
            CTX.lineWidth = 3;
            CTX.globalAlpha = (b.life < 15 ? b.life / 15 : 1) * 0.3;
            CTX.beginPath();
            CTX.moveTo(b.x - b.vx * 2, b.y - b.vy * 2);
            CTX.lineTo(b.x, b.y);
            CTX.stroke();
            CTX.globalAlpha = b.life < 15 ? b.life / 15 : 1;
        }

        CTX.fillStyle = b.color;
        CTX.beginPath();
        CTX.arc(b.x, b.y, 5, 0, Math.PI * 2);
        CTX.fill();

        if (b.type === 'pierce' || b.type === 'aoe') {
            CTX.strokeStyle = b.color;
            CTX.lineWidth = 2;
            CTX.globalAlpha = (b.life < 15 ? b.life / 15 : 1) * 0.5;
            CTX.beginPath();
            CTX.arc(b.x, b.y, 8, 0, Math.PI * 2);
            CTX.stroke();
        }

        CTX.restore();
    }

    for (let p of particles) {
        CTX.save();
        if (p.type === 'wave') {
            CTX.beginPath();
            CTX.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            CTX.strokeStyle = p.color;
            CTX.globalAlpha = p.life / 20;
            CTX.lineWidth = 2;
            CTX.stroke();
        } else {
            CTX.fillStyle = p.color;
            CTX.globalAlpha = p.life / 50;
            let s = p.size || 3;
            let scale = 1 + Math.sin(p.life * 0.2) * 0.3;
            CTX.translate(p.x + s / 2, p.y + s / 2);
            CTX.scale(scale, scale);
            CTX.fillRect(-s / 2, -s / 2, s, s);
        }
        CTX.restore();
    }

    for (let f of floatText) {
        CTX.save();
        CTX.globalAlpha = Math.max(0, f.life / f.maxLife);
        CTX.font = 'bold 16px Arial';
        CTX.textAlign = 'center';
        
        // Draw text stroke for better visibility
        CTX.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        CTX.lineWidth = 4;
        CTX.strokeText(f.text, f.x, f.y);
        
        CTX.fillStyle = f.color;
        CTX.fillText(f.text, f.x, f.y);
        CTX.restore();
        f.y -= 0.5;
        f.life--;
    }

    CTX.restore();
    drawMinimap();
}

// Minimap keeps bearings by reusing world coordinates, scaled and centered on
// the player to mimic radar pings.
function drawMinimap() {
    const mapW = MINI_CANVAS.width;
    const mapH = MINI_CANVAS.height;
    MINI_CTX.clearRect(0, 0, mapW, mapH);
    const zoom = (mapW / WORLD_W) * 6.0;

    // Calculate view dimensions in world units
    const viewW = mapW / zoom;
    const viewH = mapH / zoom;

    // Clamp camera position to keep view within world bounds
    // This ensures the minimap doesn't show empty space outside the map
    let camX = Math.max(viewW / 2, Math.min(player.x, WORLD_W - viewW / 2));
    let camY = Math.max(viewH / 2, Math.min(player.y, WORLD_H - viewH / 2));

    MINI_CTX.save();
    MINI_CTX.translate(mapW / 2, mapH / 2);
    MINI_CTX.scale(zoom, zoom);
    MINI_CTX.translate(-camX, -camY);

    MINI_CTX.fillStyle = '#555';
    for (let w of walls) if (w.x > -100) MINI_CTX.fillRect(w.x, w.y, w.w, w.h);
    MINI_CTX.fillStyle = '#d97706';
    for (let c of crates) MINI_CTX.fillRect(c.x, c.y, c.w, c.h);

    for (let e of enemies) {
        MINI_CTX.fillStyle = e.color;
        MINI_CTX.save();
        MINI_CTX.translate(e.x, e.y);
        MINI_CTX.rotate(Math.PI / 4);
        MINI_CTX.beginPath();
        MINI_CTX.rect(-35, -35, 70, 70);
        MINI_CTX.fill();
        MINI_CTX.restore();
    }

    if (boss) {
        MINI_CTX.fillStyle = '#a855f7';
        MINI_CTX.beginPath();
        MINI_CTX.arc(boss.x, boss.y, 100, 0, Math.PI * 2);
        MINI_CTX.fill();
    }

    MINI_CTX.restore();

    // Calculate player position on minimap relative to the clamped camera
    const playerMiniX = (player.x - camX) * zoom + mapW / 2;
    const playerMiniY = (player.y - camY) * zoom + mapH / 2;

    MINI_CTX.save();
    MINI_CTX.translate(playerMiniX, playerMiniY);
    MINI_CTX.rotate(player.angle + Math.PI / 2);
    MINI_CTX.fillStyle = '#22c55e';
    MINI_CTX.beginPath();
    MINI_CTX.moveTo(0, -8);
    MINI_CTX.lineTo(6, 6);
    MINI_CTX.lineTo(0, 3);
    MINI_CTX.lineTo(-6, 6);
    MINI_CTX.closePath();
    MINI_CTX.fill();
    MINI_CTX.restore();
}
