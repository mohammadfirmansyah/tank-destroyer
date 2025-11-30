// Draws player/enemy tanks using layered rectangles so colors remain readable
// even without image assets. Recoil offset sells weapon punch.
// Player tank shows 20-step damage cracks that fade when healing
// Light theme: Bright colors with realistic shadows
// Visual turret recoil: turret physically shifts in firing direction for realistic feedback

// =============================================================================
// VIEWPORT CULLING SYSTEM - Only render objects visible on screen
// This significantly improves performance by skipping off-screen rendering
// =============================================================================

// Cached viewport bounds (updated each frame in draw())
let viewportLeft = 0;
let viewportRight = 0;
let viewportTop = 0;
let viewportBottom = 0;

// Update viewport bounds - call at start of draw()
function updateViewportBounds() {
    viewportLeft = camX;
    viewportRight = camX + CANVAS.width;
    viewportTop = camY;
    viewportBottom = camY + CANVAS.height;
}

// Check if a point is within the viewport (with optional margin for large objects)
// margin: extra padding around viewport to account for object size/effects
function isInViewport(x, y, margin = 50) {
    return x >= viewportLeft - margin &&
           x <= viewportRight + margin &&
           y >= viewportTop - margin &&
           y <= viewportBottom + margin;
}

// Check if a rectangle overlaps with the viewport
function isRectInViewport(x, y, width, height, margin = 0) {
    return x + width >= viewportLeft - margin &&
           x <= viewportRight + margin &&
           y + height >= viewportTop - margin &&
           y <= viewportBottom + margin;
}

// Check if a circle overlaps with the viewport
function isCircleInViewport(x, y, radius) {
    return x + radius >= viewportLeft &&
           x - radius <= viewportRight &&
           y + radius >= viewportTop &&
           y - radius <= viewportBottom;
}

// =============================================================================

// Helper function to darken hex color (used for body, not turret)
// Creates darker body color from bright turret color
function lightenColor(hex, factor) {
    // Convert hex to RGB
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    
    // Darken by factor (lower factor = darker result)
    const newR = Math.floor(r * factor);
    const newG = Math.floor(g * factor);
    const newB = Math.floor(b * factor);
    
    // Convert back to hex
    return '#' + [newR, newG, newB].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

// Helper function to convert hex color to RGB string for rgba() usage
// Returns "r, g, b" format suitable for template strings
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
        return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
    }
    return '136, 136, 136'; // Default gray fallback
}

// Draw Laser Sight Emitter device on turret barrel
// Coordinate system: x=0 is turret pivot, x+ toward muzzle, y=0 is barrel centerline
// The ENTIRE emitter sits at y=0 (centerline) so it's perfectly aligned with laser beam
// turretLength: reference for positioning along barrel
// yOffset: ignored now - emitter is always at centerline
function drawLaserSightEmitter(turretLength, yOffset = -8, hasLaser = true) {
    if (!hasLaser) return;
    
    // Emitter positioned near center of tank at barrel centerline (y=0)
    // Compact emitter design for cleaner look
    const boxX = 5; // Closer to tank center
    const boxWidth = 10; // Shorter emitter
    const boxHeight = 5; // Slightly smaller height
    const centerY = 0; // Centerline - same as laser beam
    const lensX = boxX + boxWidth;
    
    // Shadow offset - follows global shadow direction (bottom-right)
    const shadowOffsetX = 2;
    const shadowOffsetY = 2;
    
    // Draw emitter shadow with blur (global shadow direction)
    CTX.save();
    CTX.filter = 'blur(2px)';
    CTX.fillStyle = 'rgba(0, 0, 0, 0.35)';
    // Main box shadow
    CTX.fillRect(boxX + shadowOffsetX, centerY - boxHeight/2 + shadowOffsetY, boxWidth, boxHeight);
    // Lens housing shadow
    CTX.fillRect(lensX + shadowOffsetX, centerY - 2 + shadowOffsetY, 4, 4);
    CTX.filter = 'none';
    CTX.restore();
    
    // Main emitter housing - centered at y=0
    CTX.fillStyle = '#3a3a3a';
    CTX.fillRect(boxX, centerY - boxHeight/2, boxWidth, boxHeight);
    CTX.strokeStyle = '#222';
    CTX.lineWidth = 1;
    CTX.strokeRect(boxX, centerY - boxHeight/2, boxWidth, boxHeight);
    
    // Top detail ridge
    CTX.fillStyle = '#444';
    CTX.fillRect(boxX + 1, centerY - boxHeight/2 - 1, boxWidth - 2, 1.5);
    
    // Bottom detail ridge  
    CTX.fillRect(boxX + 1, centerY + boxHeight/2 - 0.5, boxWidth - 2, 1.5);
    
    // Front lens housing (smaller)
    CTX.fillStyle = '#2a2a2a';
    CTX.fillRect(lensX, centerY - 2, 4, 4);
    CTX.strokeRect(lensX, centerY - 2, 4, 4);
    
    // Red laser lens glow - perfectly at centerline y=0
    const glowIntensity = 0.6 + Math.sin(frame * 0.15) * 0.3;
    CTX.fillStyle = `rgba(255, 0, 0, ${glowIntensity})`;
    CTX.beginPath();
    CTX.arc(lensX + 4, centerY, 2, 0, Math.PI * 2);
    CTX.fill();
    
    // Bright center of lens
    CTX.fillStyle = `rgba(255, 200, 200, ${glowIntensity + 0.3})`;
    CTX.beginPath();
    CTX.arc(lensX + 4, centerY, 0.8, 0, Math.PI * 2);
    CTX.fill();
    
    // Small indicator LED on emitter box
    CTX.fillStyle = `rgba(255, 50, 50, ${0.8 + Math.sin(frame * 0.2) * 0.2})`;
    CTX.beginPath();
    CTX.arc(boxX + 3, centerY, 1, 0, Math.PI * 2);
    CTX.fill();
}

// Draw weapon-specific turret shape based on weapon type
// Each weapon has unique realistic military-style design
function drawWeaponTurret(weaponType, colorTurret, colorBody, hitFlash, recoil) {
    const flashColor = '#fff';
    const turretColor = hitFlash > 0 ? flashColor : colorTurret;
    const bodyColor = hitFlash > 0 ? flashColor : colorBody;
    
    // Derive darker and lighter shades for 3D effect
    const darkerShade = adjustColor(turretColor, -30);
    const lighterShade = adjustColor(turretColor, 30);
    
    CTX.strokeStyle = '#1a1a1a';
    CTX.lineWidth = 1.5;
    
    switch(weaponType) {
        case 'cannon': {
            // Heavy main battle tank cannon - thick with muzzle brake
            // Main barrel body - tapered design
            const barrelGrad = CTX.createLinearGradient(0, -8, 0, 8);
            barrelGrad.addColorStop(0, lighterShade);
            barrelGrad.addColorStop(0.3, turretColor);
            barrelGrad.addColorStop(0.7, turretColor);
            barrelGrad.addColorStop(1, darkerShade);
            
            CTX.fillStyle = barrelGrad;
            CTX.beginPath();
            CTX.moveTo(0, -7);
            CTX.lineTo(32, -6);
            CTX.lineTo(32, 6);
            CTX.lineTo(0, 7);
            CTX.closePath();
            CTX.fill();
            CTX.stroke();
            
            // Barrel reinforcement rings
            CTX.fillStyle = darkerShade;
            CTX.fillRect(8, -7.5, 3, 15);
            CTX.fillRect(20, -7, 3, 14);
            
            // Muzzle brake - characteristic T-shape
            CTX.fillStyle = turretColor;
            CTX.beginPath();
            CTX.moveTo(32, -6);
            CTX.lineTo(38, -9);
            CTX.lineTo(42, -9);
            CTX.lineTo(42, 9);
            CTX.lineTo(38, 9);
            CTX.lineTo(32, 6);
            CTX.closePath();
            CTX.fill();
            CTX.stroke();
            
            // Muzzle brake slots
            CTX.strokeStyle = '#333';
            CTX.lineWidth = 2;
            CTX.beginPath();
            CTX.moveTo(38, -7);
            CTX.lineTo(38, 7);
            CTX.moveTo(40, -7);
            CTX.lineTo(40, 7);
            CTX.stroke();
            CTX.strokeStyle = '#1a1a1a';
            CTX.lineWidth = 1.5;
            
            // Bore evacuator bulge
            CTX.fillStyle = turretColor;
            CTX.beginPath();
            CTX.ellipse(15, 0, 4, 8, 0, 0, Math.PI * 2);
            CTX.fill();
            CTX.stroke();
            break;
        }
            
        case 'twin': {
            // Dual barrel autocannon - parallel tubes with feed mechanism
            const twinGrad = CTX.createLinearGradient(0, -14, 0, 14);
            twinGrad.addColorStop(0, lighterShade);
            twinGrad.addColorStop(0.5, turretColor);
            twinGrad.addColorStop(1, darkerShade);
            
            CTX.fillStyle = twinGrad;
            
            // Top barrel
            CTX.beginPath();
            CTX.roundRect(0, -13, 36, 7, 2);
            CTX.fill();
            CTX.stroke();
            
            // Bottom barrel
            CTX.beginPath();
            CTX.roundRect(0, 6, 36, 7, 2);
            CTX.fill();
            CTX.stroke();
            
            // Central housing/receiver connecting both barrels
            CTX.fillStyle = darkerShade;
            CTX.beginPath();
            CTX.roundRect(-4, -6, 16, 12, 3);
            CTX.fill();
            CTX.stroke();
            
            // Ammunition feed ports
            CTX.fillStyle = '#222';
            CTX.fillRect(2, -4, 3, 8);
            CTX.fillRect(7, -4, 3, 8);
            
            // Barrel cooling fins
            CTX.strokeStyle = darkerShade;
            CTX.lineWidth = 1;
            for (let i = 0; i < 4; i++) {
                const x = 18 + i * 4;
                CTX.beginPath();
                CTX.moveTo(x, -12);
                CTX.lineTo(x, -14);
                CTX.moveTo(x, 12);
                CTX.lineTo(x, 14);
                CTX.stroke();
            }
            CTX.strokeStyle = '#1a1a1a';
            CTX.lineWidth = 1.5;
            
            // Muzzle tips
            CTX.fillStyle = '#333';
            CTX.fillRect(34, -12, 4, 5);
            CTX.fillRect(34, 7, 4, 5);
            break;
        }
            
        case 'shotgun': {
            // Wide bore scatter gun - drum-fed with wide barrel
            const shotgunGrad = CTX.createLinearGradient(0, -10, 0, 10);
            shotgunGrad.addColorStop(0, lighterShade);
            shotgunGrad.addColorStop(0.5, turretColor);
            shotgunGrad.addColorStop(1, darkerShade);
            
            CTX.fillStyle = shotgunGrad;
            
            // Wide barrel with flared muzzle
            CTX.beginPath();
            CTX.moveTo(0, -6);
            CTX.lineTo(24, -7);
            CTX.lineTo(28, -10);
            CTX.lineTo(38, -14);
            CTX.lineTo(38, 14);
            CTX.lineTo(28, 10);
            CTX.lineTo(24, 7);
            CTX.lineTo(0, 6);
            CTX.closePath();
            CTX.fill();
            CTX.stroke();
            
            // Drum magazine
            CTX.fillStyle = darkerShade;
            CTX.beginPath();
            CTX.arc(-2, 0, 10, 0, Math.PI * 2);
            CTX.fill();
            CTX.stroke();
            
            // Drum detail - shell chambers visible
            CTX.fillStyle = '#444';
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI * 2 / 6) * i;
                const cx = -2 + Math.cos(angle) * 5;
                const cy = Math.sin(angle) * 5;
                CTX.beginPath();
                CTX.arc(cx, cy, 2.5, 0, Math.PI * 2);
                CTX.fill();
            }
            
            // Barrel vents for heat dissipation
            CTX.strokeStyle = '#222';
            CTX.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                CTX.beginPath();
                CTX.moveTo(12 + i * 5, -5 - i * 0.5);
                CTX.lineTo(12 + i * 5, 5 + i * 0.5);
                CTX.stroke();
            }
            CTX.strokeStyle = '#1a1a1a';
            CTX.lineWidth = 1.5;
            break;
        }
            
        case 'sniper': {
            // Long precision rifle - slim profile with scope
            const sniperGrad = CTX.createLinearGradient(0, -6, 0, 6);
            sniperGrad.addColorStop(0, lighterShade);
            sniperGrad.addColorStop(0.5, turretColor);
            sniperGrad.addColorStop(1, darkerShade);
            
            CTX.fillStyle = sniperGrad;
            
            // Main long barrel - slim and precise
            CTX.beginPath();
            CTX.roundRect(0, -4, 52, 8, 2);
            CTX.fill();
            CTX.stroke();
            
            // Barrel shroud with cooling holes
            CTX.fillStyle = darkerShade;
            CTX.beginPath();
            CTX.roundRect(5, -5, 30, 10, 2);
            CTX.fill();
            CTX.stroke();
            
            // Cooling holes
            CTX.fillStyle = '#222';
            for (let i = 0; i < 5; i++) {
                CTX.beginPath();
                CTX.ellipse(10 + i * 5, 0, 1.5, 3, 0, 0, Math.PI * 2);
                CTX.fill();
            }
            
            // Muzzle brake - precision cut
            CTX.fillStyle = turretColor;
            CTX.fillRect(48, -5, 8, 10);
            CTX.strokeRect(48, -5, 8, 10);
            CTX.strokeStyle = '#333';
            CTX.lineWidth = 1;
            CTX.beginPath();
            CTX.moveTo(50, -4);
            CTX.lineTo(50, 4);
            CTX.moveTo(53, -4);
            CTX.lineTo(53, 4);
            CTX.stroke();
            CTX.strokeStyle = '#1a1a1a';
            CTX.lineWidth = 1.5;
            
            // Scope mount
            CTX.fillStyle = '#333';
            CTX.fillRect(14, -10, 14, 5);
            CTX.strokeRect(14, -10, 14, 5);
            
            // Scope lens
            CTX.fillStyle = '#00e5ff';
            CTX.globalAlpha = 0.7;
            CTX.beginPath();
            CTX.arc(21, -8, 3.5, 0, Math.PI * 2);
            CTX.fill();
            CTX.globalAlpha = 1;
            
            // Scope lens reflection
            CTX.fillStyle = '#fff';
            CTX.globalAlpha = 0.4;
            CTX.beginPath();
            CTX.arc(20, -9, 1.5, 0, Math.PI * 2);
            CTX.fill();
            CTX.globalAlpha = 1;
            
            // Laser Sight Emitter
            drawLaserSightEmitter(45, -12, true);
            break;
        }
            
        case 'burst': {
            // Triple-barrel burst rifle - triangular formation
            const burstGrad = CTX.createLinearGradient(0, -12, 0, 12);
            burstGrad.addColorStop(0, lighterShade);
            burstGrad.addColorStop(0.5, turretColor);
            burstGrad.addColorStop(1, darkerShade);
            
            CTX.fillStyle = burstGrad;
            
            // Three barrels in triangular formation
            // Top barrel
            CTX.beginPath();
            CTX.roundRect(4, -12, 32, 6, 1);
            CTX.fill();
            CTX.stroke();
            
            // Middle barrel (slightly forward)
            CTX.beginPath();
            CTX.roundRect(2, -3, 36, 6, 1);
            CTX.fill();
            CTX.stroke();
            
            // Bottom barrel
            CTX.beginPath();
            CTX.roundRect(4, 6, 32, 6, 1);
            CTX.fill();
            CTX.stroke();
            
            // Receiver housing - angular design
            CTX.fillStyle = darkerShade;
            CTX.beginPath();
            CTX.moveTo(-4, -10);
            CTX.lineTo(8, -10);
            CTX.lineTo(10, -2);
            CTX.lineTo(10, 2);
            CTX.lineTo(8, 10);
            CTX.lineTo(-4, 10);
            CTX.closePath();
            CTX.fill();
            CTX.stroke();
            
            // Ejection port
            CTX.fillStyle = '#222';
            CTX.fillRect(0, -8, 4, 6);
            
            // Barrel tips - flash hiders
            CTX.fillStyle = '#333';
            CTX.fillRect(34, -11, 4, 4);
            CTX.fillRect(36, -2, 4, 4);
            CTX.fillRect(34, 7, 4, 4);
            
            // Laser Sight Emitter
            drawLaserSightEmitter(42, -16, true);
            break;
        }
            
        case 'flak': {
            // Heavy flak cannon - chunky with large bore
            const flakGrad = CTX.createLinearGradient(0, -10, 0, 10);
            flakGrad.addColorStop(0, lighterShade);
            flakGrad.addColorStop(0.5, turretColor);
            flakGrad.addColorStop(1, darkerShade);
            
            CTX.fillStyle = flakGrad;
            
            // Main barrel - thick and sturdy
            CTX.beginPath();
            CTX.roundRect(0, -9, 34, 18, 3);
            CTX.fill();
            CTX.stroke();
            
            // Recoil spring housing on top
            CTX.fillStyle = darkerShade;
            CTX.beginPath();
            CTX.roundRect(4, -14, 22, 5, 2);
            CTX.fill();
            CTX.stroke();
            
            // Magazine drum
            CTX.fillStyle = darkerShade;
            CTX.beginPath();
            CTX.arc(-4, 0, 12, 0, Math.PI * 2);
            CTX.fill();
            CTX.stroke();
            
            // Drum hatch
            CTX.fillStyle = '#444';
            CTX.beginPath();
            CTX.arc(-4, 0, 6, 0, Math.PI * 2);
            CTX.fill();
            CTX.strokeStyle = '#333';
            CTX.stroke();
            CTX.strokeStyle = '#1a1a1a';
            
            // Muzzle - large bore with flash suppressor
            CTX.fillStyle = '#333';
            CTX.beginPath();
            CTX.arc(36, 0, 8, -Math.PI/2, Math.PI/2);
            CTX.lineTo(36, -8);
            CTX.closePath();
            CTX.fill();
            CTX.stroke();
            
            // Bore darkness
            CTX.fillStyle = '#111';
            CTX.beginPath();
            CTX.arc(36, 0, 5, 0, Math.PI * 2);
            CTX.fill();
            break;
        }
            
        case 'rocket': {
            // Rocket/missile launcher - tube design
            const rocketGrad = CTX.createLinearGradient(0, -12, 0, 12);
            rocketGrad.addColorStop(0, lighterShade);
            rocketGrad.addColorStop(0.5, turretColor);
            rocketGrad.addColorStop(1, darkerShade);
            
            CTX.fillStyle = rocketGrad;
            
            // Main launch tube - rounded
            CTX.beginPath();
            CTX.moveTo(-4, -11);
            CTX.lineTo(30, -11);
            CTX.quadraticCurveTo(38, -11, 38, 0);
            CTX.quadraticCurveTo(38, 11, 30, 11);
            CTX.lineTo(-4, 11);
            CTX.closePath();
            CTX.fill();
            CTX.stroke();
            
            // Tube opening (bore)
            CTX.fillStyle = '#111';
            CTX.beginPath();
            CTX.arc(35, 0, 7, 0, Math.PI * 2);
            CTX.fill();
            
            // Rocket visible inside
            CTX.fillStyle = '#666';
            CTX.beginPath();
            CTX.arc(32, 0, 5, 0, Math.PI * 2);
            CTX.fill();
            CTX.fillStyle = '#ff4444';
            CTX.beginPath();
            CTX.moveTo(32, -4);
            CTX.lineTo(38, 0);
            CTX.lineTo(32, 4);
            CTX.closePath();
            CTX.fill();
            
            // Warning markings
            CTX.fillStyle = '#ffcc00';
            CTX.globalAlpha = 0.7;
            CTX.fillRect(8, -10, 4, 20);
            CTX.fillRect(18, -10, 4, 20);
            CTX.globalAlpha = 1;
            
            // Side rail
            CTX.fillStyle = darkerShade;
            CTX.fillRect(0, -14, 24, 3);
            CTX.fillRect(0, 11, 24, 3);
            
            // Laser Sight Emitter
            drawLaserSightEmitter(42, -16, true);
            break;
        }
            
        case 'laser': {
            // Plasma beam emitter - sci-fi design
            const laserGrad = CTX.createLinearGradient(0, -7, 0, 7);
            laserGrad.addColorStop(0, lighterShade);
            laserGrad.addColorStop(0.5, turretColor);
            laserGrad.addColorStop(1, darkerShade);
            
            CTX.fillStyle = laserGrad;
            
            // Main housing
            CTX.beginPath();
            CTX.roundRect(0, -7, 38, 14, 4);
            CTX.fill();
            CTX.stroke();
            
            // Energy coils along barrel
            CTX.strokeStyle = '#00e5ff';
            CTX.lineWidth = 2.5;
            for (let i = 0; i < 3; i++) {
                const pulse = 0.5 + Math.sin(frame * 0.2 + i * 1.5) * 0.4;
                CTX.globalAlpha = pulse;
                CTX.beginPath();
                CTX.arc(10 + i * 10, 0, 5, 0, Math.PI * 2);
                CTX.stroke();
            }
            CTX.globalAlpha = 1;
            CTX.strokeStyle = '#1a1a1a';
            CTX.lineWidth = 1.5;
            
            // Emitter tip
            CTX.fillStyle = '#00e5ff';
            const tipPulse = 0.6 + Math.sin(frame * 0.15) * 0.3;
            CTX.globalAlpha = tipPulse;
            CTX.beginPath();
            CTX.arc(40, 0, 5, 0, Math.PI * 2);
            CTX.fill();
            CTX.globalAlpha = 1;
            
            // Emitter housing
            CTX.fillStyle = '#333';
            CTX.beginPath();
            CTX.arc(40, 0, 3, 0, Math.PI * 2);
            CTX.fill();
            
            // Capacitor bank on top
            CTX.fillStyle = darkerShade;
            CTX.fillRect(5, -12, 20, 5);
            CTX.strokeRect(5, -12, 20, 5);
            
            // Laser Sight Emitter
            drawLaserSightEmitter(42, -14, true);
            break;
        }
            
        case 'gauss': {
            // Electromagnetic rail gun - with visible rails
            const gaussGrad = CTX.createLinearGradient(0, -10, 0, 10);
            gaussGrad.addColorStop(0, lighterShade);
            gaussGrad.addColorStop(0.5, turretColor);
            gaussGrad.addColorStop(1, darkerShade);
            
            CTX.fillStyle = gaussGrad;
            
            // Main barrel housing
            CTX.beginPath();
            CTX.roundRect(0, -8, 46, 16, 3);
            CTX.fill();
            CTX.stroke();
            
            // Magnetic rails (top and bottom) - exposed
            CTX.fillStyle = '#8b5cf6';
            CTX.fillRect(6, -12, 36, 4);
            CTX.fillRect(6, 8, 36, 4);
            
            // Rail glow effect
            const railPulse = 0.4 + Math.sin(frame * 0.25) * 0.3;
            CTX.strokeStyle = '#c084fc';
            CTX.lineWidth = 2;
            CTX.globalAlpha = railPulse;
            CTX.beginPath();
            CTX.moveTo(8, -10);
            CTX.lineTo(40, -10);
            CTX.moveTo(8, 10);
            CTX.lineTo(40, 10);
            CTX.stroke();
            CTX.globalAlpha = 1;
            CTX.strokeStyle = '#1a1a1a';
            CTX.lineWidth = 1.5;
            
            // Capacitor coils
            CTX.fillStyle = darkerShade;
            for (let i = 0; i < 3; i++) {
                CTX.beginPath();
                CTX.arc(12 + i * 10, 0, 4, 0, Math.PI * 2);
                CTX.fill();
                CTX.stroke();
            }
            
            // Muzzle charge glow
            CTX.fillStyle = '#c084fc';
            CTX.globalAlpha = 0.6 + Math.sin(frame * 0.3) * 0.3;
            CTX.beginPath();
            CTX.arc(48, 0, 4, 0, Math.PI * 2);
            CTX.fill();
            CTX.globalAlpha = 1;
            
            // Laser Sight Emitter
            drawLaserSightEmitter(44, -16, true);
            break;
        }
            
        case 'ice': {
            // Frost cannon - crystalline barrel design
            const iceGrad = CTX.createLinearGradient(0, -8, 0, 8);
            iceGrad.addColorStop(0, '#bae6fd');
            iceGrad.addColorStop(0.5, turretColor);
            iceGrad.addColorStop(1, '#1e3a5f');
            
            CTX.fillStyle = iceGrad;
            
            // Main crystalline barrel - faceted shape
            CTX.beginPath();
            CTX.moveTo(0, -6);
            CTX.lineTo(10, -7);
            CTX.lineTo(24, -9);
            CTX.lineTo(34, -5);
            CTX.lineTo(40, 0);
            CTX.lineTo(34, 5);
            CTX.lineTo(24, 9);
            CTX.lineTo(10, 7);
            CTX.lineTo(0, 6);
            CTX.closePath();
            CTX.fill();
            CTX.stroke();
            
            // Ice crystal spikes
            CTX.fillStyle = '#93c5fd';
            CTX.globalAlpha = 0.7 + Math.sin(frame * 0.1) * 0.2;
            
            // Top spikes
            CTX.beginPath();
            CTX.moveTo(14, -9);
            CTX.lineTo(17, -17);
            CTX.lineTo(20, -9);
            CTX.closePath();
            CTX.fill();
            
            CTX.beginPath();
            CTX.moveTo(26, -8);
            CTX.lineTo(28, -14);
            CTX.lineTo(30, -8);
            CTX.closePath();
            CTX.fill();
            
            // Bottom spikes
            CTX.beginPath();
            CTX.moveTo(14, 9);
            CTX.lineTo(17, 17);
            CTX.lineTo(20, 9);
            CTX.closePath();
            CTX.fill();
            
            CTX.beginPath();
            CTX.moveTo(26, 8);
            CTX.lineTo(28, 14);
            CTX.lineTo(30, 8);
            CTX.closePath();
            CTX.fill();
            
            CTX.globalAlpha = 1;
            
            // Frost core glow at tip
            CTX.fillStyle = '#fff';
            CTX.globalAlpha = 0.6;
            CTX.beginPath();
            CTX.arc(38, 0, 3, 0, Math.PI * 2);
            CTX.fill();
            CTX.globalAlpha = 1;
            
            // Frost particles drifting
            CTX.fillStyle = '#e0f2fe';
            for (let i = 0; i < 4; i++) {
                const px = 32 + Math.sin(frame * 0.08 + i * 1.5) * 8;
                const py = Math.cos(frame * 0.1 + i * 1.5) * 10;
                CTX.globalAlpha = 0.4 + Math.random() * 0.3;
                CTX.fillRect(px, py - 1, 2, 2);
            }
            CTX.globalAlpha = 1;
            
            // Laser Sight Emitter
            drawLaserSightEmitter(42, -20, true);
            break;
        }
            
        case 'fire': {
            // Inferno gun - heat radiating barrel
            const fireGrad = CTX.createLinearGradient(0, -10, 0, 10);
            fireGrad.addColorStop(0, '#ff9500');
            fireGrad.addColorStop(0.5, turretColor);
            fireGrad.addColorStop(1, '#8b2500');
            
            CTX.fillStyle = fireGrad;
            
            // Main flamethrower barrel - chunky with nozzle
            CTX.beginPath();
            CTX.moveTo(0, -9);
            CTX.lineTo(26, -9);
            CTX.lineTo(30, -6);
            CTX.lineTo(38, -4);
            CTX.lineTo(38, 4);
            CTX.lineTo(30, 6);
            CTX.lineTo(26, 9);
            CTX.lineTo(0, 9);
            CTX.closePath();
            CTX.fill();
            CTX.stroke();
            
            // Heat vents - glowing
            const heatPulse = 0.5 + Math.sin(frame * 0.15) * 0.4;
            CTX.fillStyle = `rgba(255, 80, 0, ${heatPulse})`;
            for (let i = 0; i < 4; i++) {
                CTX.fillRect(6 + i * 6, -12, 3, 5);
                CTX.fillRect(6 + i * 6, 7, 3, 5);
            }
            
            // Heat distortion at tip (rising heat)
            CTX.strokeStyle = `rgba(255, 150, 50, ${heatPulse * 0.5})`;
            CTX.lineWidth = 1;
            for (let i = 0; i < 2; i++) {
                CTX.beginPath();
                const wave = frame * 0.2 + i * Math.PI;
                CTX.moveTo(36, -8 + i * 4);
                CTX.quadraticCurveTo(42 + Math.sin(wave) * 3, -6 + i * 4, 48, -10 + i * 4);
                CTX.stroke();
            }
            CTX.strokeStyle = '#1a1a1a';
            CTX.lineWidth = 1.5;
            
            // Pilot flame at muzzle
            CTX.fillStyle = '#ff6b35';
            CTX.globalAlpha = 0.7 + Math.random() * 0.3;
            CTX.beginPath();
            CTX.moveTo(38, -3);
            CTX.quadraticCurveTo(44, 0, 38, 3);
            CTX.quadraticCurveTo(48 + Math.random() * 6, 0, 38, -3);
            CTX.fill();
            
            // Inner flame
            CTX.fillStyle = '#ffcc00';
            CTX.beginPath();
            CTX.moveTo(38, -2);
            CTX.quadraticCurveTo(42, 0, 38, 2);
            CTX.quadraticCurveTo(44 + Math.random() * 4, 0, 38, -2);
            CTX.fill();
            CTX.globalAlpha = 1;
            
            // Fuel tank
            CTX.fillStyle = darkerShade;
            CTX.beginPath();
            CTX.ellipse(-2, 0, 6, 10, 0, 0, Math.PI * 2);
            CTX.fill();
            CTX.stroke();
            break;
        }
            
        case 'electric': {
            // Tesla coil rifle - with visible arcs
            const electricGrad = CTX.createLinearGradient(0, -7, 0, 7);
            electricGrad.addColorStop(0, '#c084fc');
            electricGrad.addColorStop(0.5, turretColor);
            electricGrad.addColorStop(1, '#5b21b6');
            
            CTX.fillStyle = electricGrad;
            
            // Main housing
            CTX.beginPath();
            CTX.roundRect(0, -7, 36, 14, 4);
            CTX.fill();
            CTX.stroke();
            
            // Tesla coil rings
            CTX.strokeStyle = '#a855f7';
            CTX.lineWidth = 3;
            for (let i = 0; i < 2; i++) {
                const pulse = 0.5 + Math.sin(frame * 0.2 + i * Math.PI) * 0.4;
                CTX.globalAlpha = pulse;
                CTX.beginPath();
                CTX.arc(10 + i * 14, 0, 7 - i * 2, 0, Math.PI * 2);
                CTX.stroke();
            }
            CTX.globalAlpha = 1;
            CTX.strokeStyle = '#1a1a1a';
            CTX.lineWidth = 1.5;
            
            // Capacitor coils
            CTX.fillStyle = '#6d28d9';
            CTX.beginPath();
            CTX.arc(10, 0, 3, 0, Math.PI * 2);
            CTX.fill();
            CTX.beginPath();
            CTX.arc(24, 0, 3, 0, Math.PI * 2);
            CTX.fill();
            
            // Electric arcs at tip
            CTX.strokeStyle = '#ffeb3b';
            CTX.lineWidth = 1.5;
            for (let i = 0; i < 3; i++) {
                CTX.globalAlpha = 0.4 + Math.random() * 0.5;
                CTX.beginPath();
                CTX.moveTo(36, 0);
                const endX = 44 + Math.random() * 10;
                const endY = (Math.random() - 0.5) * 18;
                const mid1X = 38 + Math.random() * 4;
                const mid1Y = endY * 0.3 + (Math.random() - 0.5) * 8;
                const mid2X = 42 + Math.random() * 4;
                const mid2Y = endY * 0.6 + (Math.random() - 0.5) * 6;
                CTX.lineTo(mid1X, mid1Y);
                CTX.lineTo(mid2X, mid2Y);
                CTX.lineTo(endX, endY);
                CTX.stroke();
            }
            CTX.globalAlpha = 1;
            CTX.strokeStyle = '#1a1a1a';
            CTX.lineWidth = 1.5;
            
            // Electrode tip
            CTX.fillStyle = '#e879f9';
            CTX.globalAlpha = 0.8;
            CTX.beginPath();
            CTX.arc(38, 0, 3, 0, Math.PI * 2);
            CTX.fill();
            CTX.globalAlpha = 1;
            
            // Laser Sight Emitter
            drawLaserSightEmitter(42, -12, true);
            break;
        }
            
        default: {
            // Default barrel - simple design
            CTX.fillStyle = turretColor;
            CTX.fillRect(0, -7, 36, 14);
            CTX.strokeRect(0, -7, 36, 14);
        }
    }
    
    // Draw turret base (common for all weapons)
    const baseGrad = CTX.createRadialGradient(0, 0, 0, 0, 0, 14);
    baseGrad.addColorStop(0, lighterShade);
    baseGrad.addColorStop(0.5, bodyColor);
    baseGrad.addColorStop(1, darkerShade);
    
    CTX.fillStyle = baseGrad;
    CTX.beginPath();
    CTX.arc(0, 0, 14, 0, Math.PI * 2);
    CTX.fill();
    CTX.stroke();
    
    // Inner ring
    CTX.fillStyle = turretColor;
    CTX.beginPath();
    CTX.arc(0, 0, 8, 0, Math.PI * 2);
    CTX.fill();
    CTX.stroke();
    
    // Center bolt
    CTX.fillStyle = darkerShade;
    CTX.beginPath();
    CTX.arc(0, 0, 3, 0, Math.PI * 2);
    CTX.fill();
}

// Helper function to adjust color brightness
function adjustColor(color, amount) {
    // Parse hex color
    let hex = color.replace('#', '');
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    
    r = Math.max(0, Math.min(255, r + amount));
    g = Math.max(0, Math.min(255, g + amount));
    b = Math.max(0, Math.min(255, b + amount));
    
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Draw turret shadow that matches exact weapon shape
// Shadow is drawn with offset but shape follows turret rotation
function drawWeaponTurretShadow(weaponType, recoil) {
    // All shadows use the same dark fill
    CTX.fillStyle = 'rgba(0, 0, 0, 0.25)';
    
    switch(weaponType) {
        case 'cannon':
            // Classic single barrel shadow
            CTX.fillRect(0, -7, 38 - (recoil || 0), 14);
            // Muzzle brake shadow
            CTX.fillRect(34 - (recoil || 0), -9, 6, 18);
            break;
            
        case 'twin':
            // Dual parallel barrels shadow
            CTX.fillRect(0, -12, 34 - (recoil || 0), 8);
            CTX.fillRect(0, 4, 34 - (recoil || 0), 8);
            // Connector shadow
            CTX.fillRect(0, -4, 12, 8);
            break;
            
        case 'shotgun':
            // Wide scatter barrel shadow
            CTX.beginPath();
            CTX.moveTo(0, -6);
            CTX.lineTo(26 - (recoil || 0), -6);
            CTX.lineTo(36 - (recoil || 0), -12);
            CTX.lineTo(36 - (recoil || 0), 12);
            CTX.lineTo(26 - (recoil || 0), 6);
            CTX.lineTo(0, 6);
            CTX.closePath();
            CTX.fill();
            break;
            
        case 'sniper':
            // Long sleek barrel shadow
            CTX.fillRect(0, -5, 48 - (recoil || 0), 10);
            // Muzzle extension shadow
            CTX.fillRect(44 - (recoil || 0), -3, 8, 6);
            // Scope mount shadow
            CTX.fillRect(10, -10, 12, 5);
            break;
            
        case 'burst':
            // Triple-stacked barrels shadow
            CTX.fillRect(0, -10, 30 - (recoil || 0), 5);
            CTX.fillRect(0, -2.5, 32 - (recoil || 0), 5);
            CTX.fillRect(0, 5, 30 - (recoil || 0), 5);
            break;
            
        case 'flak':
            // Chunky anti-air barrel shadow
            CTX.fillRect(0, -8, 32 - (recoil || 0), 16);
            // Flak drum magazine shadow
            CTX.beginPath();
            CTX.arc(-2, 0, 10, 0, Math.PI * 2);
            CTX.fill();
            break;
            
        case 'rocket':
            // Rocket tube launcher shadow
            CTX.beginPath();
            CTX.moveTo(-4, -10);
            CTX.lineTo(28 - (recoil || 0), -10);
            CTX.lineTo(34 - (recoil || 0), -6);
            CTX.lineTo(34 - (recoil || 0), 6);
            CTX.lineTo(28 - (recoil || 0), 10);
            CTX.lineTo(-4, 10);
            CTX.closePath();
            CTX.fill();
            break;
            
        case 'laser':
            // Plasma emitter shadow
            CTX.fillRect(0, -6, 36 - (recoil || 0), 12);
            break;
            
        case 'gauss':
            // Electromagnetic rail gun shadow
            CTX.fillRect(0, -8, 44 - (recoil || 0), 16);
            // Magnetic rails shadow (top and bottom)
            CTX.fillRect(4, -10, 36 - (recoil || 0), 3);
            CTX.fillRect(4, 7, 36 - (recoil || 0), 3);
            break;
            
        case 'ice':
            // Frost cannon crystalline shadow
            CTX.beginPath();
            CTX.moveTo(0, -6);
            CTX.lineTo(24 - (recoil || 0), -8);
            CTX.lineTo(34 - (recoil || 0), -4);
            CTX.lineTo(38 - (recoil || 0), 0);
            CTX.lineTo(34 - (recoil || 0), 4);
            CTX.lineTo(24 - (recoil || 0), 8);
            CTX.lineTo(0, 6);
            CTX.closePath();
            CTX.fill();
            // Crystal spikes shadow
            CTX.beginPath();
            CTX.moveTo(15, -8);
            CTX.lineTo(18, -14);
            CTX.lineTo(21, -8);
            CTX.moveTo(15, 8);
            CTX.lineTo(18, 14);
            CTX.lineTo(21, 8);
            CTX.closePath();
            CTX.fill();
            break;
            
        case 'fire':
            // Inferno gun shadow
            CTX.beginPath();
            CTX.moveTo(0, -8);
            CTX.lineTo(28 - (recoil || 0), -8);
            CTX.lineTo(36 - (recoil || 0), -4);
            CTX.lineTo(36 - (recoil || 0), 4);
            CTX.lineTo(28 - (recoil || 0), 8);
            CTX.lineTo(0, 8);
            CTX.closePath();
            CTX.fill();
            // Heat vents shadow
            for (let i = 0; i < 3; i++) {
                CTX.fillRect(8 + i * 8, -10, 3, 4);
                CTX.fillRect(8 + i * 8, 6, 3, 4);
            }
            break;
            
        case 'electric':
            // Tesla coil rifle shadow
            CTX.fillRect(0, -6, 34 - (recoil || 0), 12);
            break;
            
        default:
            // Default barrel shadow
            CTX.fillRect(0, -7, 36 - (recoil || 0), 14);
    }
    
    // Turret base shadow (common for all weapons)
    CTX.beginPath();
    CTX.arc(0, 0, 13, 0, Math.PI * 2);
    CTX.fill();
}

// ============================================================================
// BULLET RENDERING FUNCTIONS - Unique visual styles for each weapon type
// ============================================================================

// Global shadow constants - light comes from top-left, shadow points bottom-right
const BULLET_SHADOW_OFFSET_X = 4;
const BULLET_SHADOW_OFFSET_Y = 4;
const BULLET_SHADOW_ALPHA = 0.22;
// Global shadow angle - consistent 45 degrees (bottom-right)
const GLOBAL_SHADOW_ANGLE = Math.PI / 4;

// ============================================================================
// MAGIC EFFECT RENDERING SYSTEM
// Renders dramatic visual effects for enemy magical abilities
// ============================================================================

function renderMagicEffect(effect, frame) {
    if (!effect || !CTX) return;
    
    const progress = effect.time / effect.duration;
    const fadeOut = 1 - progress;
    
    switch (effect.type) {
        case 'magic_rune':
            renderMagicRune(effect, progress, fadeOut, frame);
            break;
        case 'shield_activate':
            renderShieldActivate(effect, progress, fadeOut, frame);
            break;
        case 'blink_charge':
            // Handled in enemy loop
            break;
        case 'blink_out':
            renderBlinkOut(effect, progress, fadeOut, frame);
            break;
        case 'blink_in':
            renderBlinkIn(effect, progress, fadeOut, frame);
            break;
        case 'ice_burst':
            renderIceBurst(effect, progress, fadeOut, frame);
            break;
        case 'fire_nova':
            renderFireNova(effect, progress, fadeOut, frame);
            break;
        case 'lightning_arc':
            renderLightningArc(effect, progress, fadeOut, frame);
            break;
    }
}

function renderMagicRune(effect, progress, fadeOut, frame) {
    CTX.save();
    
    // Follow enemy position if enemyRef exists and enemy is still alive
    let renderX = effect.x;
    let renderY = effect.y;
    if (effect.enemyRef && effect.enemyRef.hp > 0) {
        renderX = effect.enemyRef.x;
        renderY = effect.enemyRef.y;
    }
    
    CTX.translate(renderX, renderY);
    
    const runeSize = effect.radius * (0.5 + progress * 0.5);
    const runeAlpha = fadeOut * 0.7;
    
    // Magic type specific colors
    const colors = {
        shield: ['#a855f7', '#c084fc'],
        blink: ['#8b5cf6', '#a78bfa'],
        ice: ['#00bcd4', '#4dd0e1'],
        fire: ['#ff6b35', '#ff9500'],
        electric: ['#ffeb3b', '#ffc107']
    };
    const [color1, color2] = colors[effect.magicType] || ['#ffffff', '#cccccc'];
    
    // Rotating outer ring
    CTX.rotate(frame * 0.05);
    CTX.strokeStyle = color1;
    CTX.globalAlpha = runeAlpha;
    CTX.lineWidth = 3;
    CTX.beginPath();
    CTX.arc(0, 0, runeSize, 0, Math.PI * 2);
    CTX.stroke();
    
    // Inner rotating ring (opposite direction)
    CTX.rotate(-frame * 0.1);
    CTX.strokeStyle = color2;
    CTX.lineWidth = 2;
    CTX.beginPath();
    CTX.arc(0, 0, runeSize * 0.7, 0, Math.PI * 2);
    CTX.stroke();
    
    // Rune symbols
    for (let i = 0; i < 6; i++) {
        const symbolAngle = (Math.PI * 2 * i) / 6;
        const sx = Math.cos(symbolAngle) * runeSize * 0.85;
        const sy = Math.sin(symbolAngle) * runeSize * 0.85;
        
        CTX.fillStyle = color1;
        CTX.globalAlpha = runeAlpha * 0.8;
        CTX.beginPath();
        CTX.arc(sx, sy, 4, 0, Math.PI * 2);
        CTX.fill();
    }
    
    CTX.globalAlpha = 1;
    CTX.restore();
}

function renderShieldActivate(effect, progress, fadeOut, frame) {
    CTX.save();
    CTX.translate(effect.x, effect.y);
    
    const expandSize = 50 + progress * 30;
    
    // Expanding rings
    for (let i = 0; i < 3; i++) {
        const ringProgress = (progress + i * 0.15) % 1;
        const ringSize = 30 + ringProgress * 40;
        const ringAlpha = (1 - ringProgress) * fadeOut * 0.5;
        
        CTX.strokeStyle = '#a855f7';
        CTX.globalAlpha = ringAlpha;
        CTX.lineWidth = 3 * (1 - ringProgress);
        CTX.beginPath();
        CTX.arc(0, 0, ringSize, 0, Math.PI * 2);
        CTX.stroke();
    }
    
    CTX.globalAlpha = 1;
    CTX.restore();
}

function renderBlinkOut(effect, progress, fadeOut, frame) {
    CTX.save();
    CTX.translate(effect.x, effect.y);
    
    // === OUTER DIMENSIONAL RIFT ===
    const riftSize = 90 * fadeOut * (1 - progress * 0.3);
    const riftGrad = CTX.createRadialGradient(0, 0, 0, 0, 0, riftSize);
    riftGrad.addColorStop(0, `rgba(76, 29, 149, ${0.9 * fadeOut})`);
    riftGrad.addColorStop(0.3, `rgba(139, 92, 246, ${0.6 * fadeOut})`);
    riftGrad.addColorStop(0.7, `rgba(168, 85, 247, ${0.3 * fadeOut})`);
    riftGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
    CTX.fillStyle = riftGrad;
    CTX.beginPath();
    CTX.arc(0, 0, riftSize, 0, Math.PI * 2);
    CTX.fill();
    
    // === IMPLOSION CORE - gets smaller as progress increases ===
    const coreSize = 40 * fadeOut * (1 - progress * 0.8);
    const coreGrad = CTX.createRadialGradient(0, 0, 0, 0, 0, coreSize);
    coreGrad.addColorStop(0, `rgba(255, 255, 255, ${0.95 * fadeOut})`);
    coreGrad.addColorStop(0.4, `rgba(233, 213, 255, ${0.7 * fadeOut})`);
    coreGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
    CTX.fillStyle = coreGrad;
    CTX.beginPath();
    CTX.arc(0, 0, coreSize, 0, Math.PI * 2);
    CTX.fill();
    
    // === SPIRAL VORTEX LINES - rotate faster as time goes ===
    CTX.rotate(frame * 0.3 + progress * Math.PI * 2);
    for (let i = 0; i < 8; i++) {
        const lineAngle = (Math.PI * 2 * i) / 8;
        const spiralCurve = progress * 0.5;
        
        // Gradient line from outer to inner
        const lineGrad = CTX.createLinearGradient(
            Math.cos(lineAngle) * riftSize, Math.sin(lineAngle) * riftSize,
            0, 0
        );
        lineGrad.addColorStop(0, `rgba(192, 132, 252, 0)`);
        lineGrad.addColorStop(0.5, `rgba(192, 132, 252, ${0.7 * fadeOut})`);
        lineGrad.addColorStop(1, `rgba(255, 255, 255, ${0.9 * fadeOut})`);
        
        CTX.strokeStyle = lineGrad;
        CTX.lineWidth = 3 * (1 - progress * 0.5);
        CTX.beginPath();
        CTX.moveTo(Math.cos(lineAngle + spiralCurve) * riftSize * 0.9, Math.sin(lineAngle + spiralCurve) * riftSize * 0.9);
        
        // Curved spiral path
        const midDist = riftSize * 0.5;
        CTX.quadraticCurveTo(
            Math.cos(lineAngle + spiralCurve * 2) * midDist,
            Math.sin(lineAngle + spiralCurve * 2) * midDist,
            0, 0
        );
        CTX.stroke();
    }
    
    // === COLLAPSING RINGS ===
    for (let i = 0; i < 3; i++) {
        const ringProgress = Math.max(0, 1 - progress * 1.5 - i * 0.15);
        const ringSize = ringProgress * riftSize * 0.8;
        
        CTX.strokeStyle = `rgba(233, 213, 255, ${ringProgress * 0.5 * fadeOut})`;
        CTX.lineWidth = 2;
        CTX.beginPath();
        CTX.arc(0, 0, ringSize, 0, Math.PI * 2);
        CTX.stroke();
    }
    
    // === ENERGY SPARKS at edges ===
    for (let i = 0; i < 6; i++) {
        const sparkAngle = (Math.PI * 2 * i) / 6 + frame * 0.15;
        const sparkDist = riftSize * 0.7 * (1 - progress * 0.3);
        const sparkSize = 4 * fadeOut * (1 - progress);
        
        CTX.fillStyle = `rgba(255, 255, 255, ${0.8 * fadeOut})`;
        CTX.beginPath();
        CTX.arc(
            Math.cos(sparkAngle) * sparkDist,
            Math.sin(sparkAngle) * sparkDist,
            sparkSize, 0, Math.PI * 2
        );
        CTX.fill();
    }
    
    CTX.restore();
}

function renderBlinkIn(effect, progress, fadeOut, frame) {
    CTX.save();
    CTX.translate(effect.x, effect.y);
    
    // === DIMENSIONAL TEAR - expands then stabilizes ===
    const tearProgress = Math.min(1, progress * 2); // Fast initial expansion
    const tearSize = 30 + tearProgress * 70;
    const tearGrad = CTX.createRadialGradient(0, 0, 0, 0, 0, tearSize);
    tearGrad.addColorStop(0, `rgba(76, 29, 149, ${0.9 * fadeOut})`);
    tearGrad.addColorStop(0.4, `rgba(139, 92, 246, ${0.5 * fadeOut})`);
    tearGrad.addColorStop(0.8, `rgba(168, 85, 247, ${0.2 * fadeOut})`);
    tearGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
    CTX.fillStyle = tearGrad;
    CTX.beginPath();
    CTX.arc(0, 0, tearSize, 0, Math.PI * 2);
    CTX.fill();
    
    // === EMERGENCE CORE - bright flash that fades ===
    const coreAlpha = Math.max(0, 1 - progress * 1.5);
    const coreSize = 25 + progress * 15;
    const coreGrad = CTX.createRadialGradient(0, 0, 0, 0, 0, coreSize);
    coreGrad.addColorStop(0, `rgba(255, 255, 255, ${coreAlpha * fadeOut})`);
    coreGrad.addColorStop(0.5, `rgba(250, 245, 255, ${coreAlpha * 0.7 * fadeOut})`);
    coreGrad.addColorStop(1, 'rgba(233, 213, 255, 0)');
    CTX.fillStyle = coreGrad;
    CTX.beginPath();
    CTX.arc(0, 0, coreSize, 0, Math.PI * 2);
    CTX.fill();
    
    // === EXPANDING SHOCKWAVE RINGS ===
    for (let i = 0; i < 4; i++) {
        const ringDelay = i * 0.12;
        const ringProg = Math.max(0, (progress - ringDelay) * 1.5);
        if (ringProg <= 0 || ringProg >= 1) continue;
        
        const ringSize = ringProg * 100;
        const ringAlpha = (1 - ringProg) * 0.7;
        
        CTX.strokeStyle = `rgba(192, 132, 252, ${ringAlpha * fadeOut})`;
        CTX.lineWidth = 4 * (1 - ringProg);
        CTX.beginPath();
        CTX.arc(0, 0, ringSize, 0, Math.PI * 2);
        CTX.stroke();
    }
    
    // === ENERGY RAY BURST ===
    CTX.rotate(-frame * 0.1);
    const rayCount = 12;
    const rayProgress = Math.min(1, progress * 3);
    const rayFade = Math.max(0, 1 - progress * 2);
    
    for (let i = 0; i < rayCount; i++) {
        const rayAngle = (Math.PI * 2 * i) / rayCount;
        const rayLength = tearSize * 0.9 * rayProgress;
        const rayWidth = 6 * rayFade;
        
        if (rayWidth < 0.5) continue;
        
        const rayGrad = CTX.createLinearGradient(0, 0, Math.cos(rayAngle) * rayLength, Math.sin(rayAngle) * rayLength);
        rayGrad.addColorStop(0, `rgba(255, 255, 255, ${0.9 * rayFade * fadeOut})`);
        rayGrad.addColorStop(0.6, `rgba(192, 132, 252, ${0.5 * rayFade * fadeOut})`);
        rayGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
        
        CTX.strokeStyle = rayGrad;
        CTX.lineWidth = rayWidth;
        CTX.lineCap = 'round';
        CTX.beginPath();
        CTX.moveTo(0, 0);
        CTX.lineTo(Math.cos(rayAngle) * rayLength, Math.sin(rayAngle) * rayLength);
        CTX.stroke();
    }
    
    // === ORBITING ENERGY PARTICLES ===
    const orbitCount = 8;
    const orbitRadius = tearSize * 0.6;
    const orbitSpeed = frame * 0.2 + progress * Math.PI;
    
    for (let i = 0; i < orbitCount; i++) {
        const orbitAngle = (Math.PI * 2 * i) / orbitCount + orbitSpeed;
        const particleSize = 5 * fadeOut * (1 - progress * 0.5);
        
        if (particleSize < 1) continue;
        
        const px = Math.cos(orbitAngle) * orbitRadius;
        const py = Math.sin(orbitAngle) * orbitRadius;
        
        // Particle glow
        const particleGrad = CTX.createRadialGradient(px, py, 0, px, py, particleSize * 2);
        particleGrad.addColorStop(0, `rgba(255, 255, 255, ${0.9 * fadeOut})`);
        particleGrad.addColorStop(0.5, `rgba(192, 132, 252, ${0.5 * fadeOut})`);
        particleGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
        
        CTX.fillStyle = particleGrad;
        CTX.beginPath();
        CTX.arc(px, py, particleSize * 2, 0, Math.PI * 2);
        CTX.fill();
        
        // Particle core
        CTX.fillStyle = `rgba(255, 255, 255, ${fadeOut})`;
        CTX.beginPath();
        CTX.arc(px, py, particleSize * 0.5, 0, Math.PI * 2);
        CTX.fill();
    }
    
    CTX.restore();
}

function renderIceBurst(effect, progress, fadeOut, frame) {
    CTX.save();
    
    // Follow enemy if reference exists, otherwise use stored position
    const effectX = (effect.enemyRef && effect.enemyRef.hp > 0) ? effect.enemyRef.x : effect.x;
    const effectY = (effect.enemyRef && effect.enemyRef.hp > 0) ? effect.enemyRef.y : effect.y;
    CTX.translate(effectX, effectY);
    
    // Update stored position for smooth transition if enemy dies
    effect.x = effectX;
    effect.y = effectY;
    
    // Expanding ice ring
    const ringSize = progress * effect.radius;
    const iceGrad = CTX.createRadialGradient(0, 0, 0, 0, 0, ringSize);
    iceGrad.addColorStop(0, 'rgba(0, 188, 212, 0)');
    iceGrad.addColorStop(0.6, `rgba(0, 188, 212, ${0.3 * fadeOut})`);
    iceGrad.addColorStop(0.9, `rgba(77, 208, 225, ${0.5 * fadeOut})`);
    iceGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    CTX.fillStyle = iceGrad;
    CTX.beginPath();
    CTX.arc(0, 0, ringSize, 0, Math.PI * 2);
    CTX.fill();
    
    // Ice crystals around edge
    for (let i = 0; i < 12; i++) {
        const crystalAngle = (Math.PI * 2 * i) / 12 + frame * 0.02;
        const cx = Math.cos(crystalAngle) * ringSize * 0.9;
        const cy = Math.sin(crystalAngle) * ringSize * 0.9;
        
        CTX.fillStyle = `rgba(255, 255, 255, ${0.7 * fadeOut})`;
        CTX.save();
        CTX.translate(cx, cy);
        CTX.rotate(crystalAngle);
        CTX.beginPath();
        CTX.moveTo(0, -8);
        CTX.lineTo(4, 0);
        CTX.lineTo(0, 8);
        CTX.lineTo(-4, 0);
        CTX.closePath();
        CTX.fill();
        CTX.restore();
    }
    
    CTX.restore();
}

function renderFireNova(effect, progress, fadeOut, frame) {
    CTX.save();
    
    // Follow enemy if reference exists, otherwise use stored position
    const effectX = (effect.enemyRef && effect.enemyRef.hp > 0) ? effect.enemyRef.x : effect.x;
    const effectY = (effect.enemyRef && effect.enemyRef.hp > 0) ? effect.enemyRef.y : effect.y;
    CTX.translate(effectX, effectY);
    
    // Update stored position for smooth transition if enemy dies
    effect.x = effectX;
    effect.y = effectY;
    
    // Multiple expanding fire rings
    for (let ring = 0; ring < 3; ring++) {
        const ringProgress = (progress + ring * 0.15) % 1;
        const ringSize = ringProgress * effect.radius;
        
        const fireGrad = CTX.createRadialGradient(0, 0, ringSize * 0.5, 0, 0, ringSize);
        fireGrad.addColorStop(0, 'rgba(255, 107, 53, 0)');
        fireGrad.addColorStop(0.7, `rgba(255, 149, 0, ${0.4 * fadeOut * (1 - ringProgress)})`);
        fireGrad.addColorStop(1, `rgba(255, 204, 0, ${0.6 * fadeOut * (1 - ringProgress)})`);
        CTX.fillStyle = fireGrad;
        CTX.beginPath();
        CTX.arc(0, 0, ringSize, 0, Math.PI * 2);
        CTX.fill();
    }
    
    // Fire ring edge
    const mainRingSize = progress * effect.radius;
    CTX.strokeStyle = `rgba(255, 107, 53, ${0.8 * fadeOut})`;
    CTX.lineWidth = 4 * fadeOut;
    CTX.beginPath();
    CTX.arc(0, 0, mainRingSize, 0, Math.PI * 2);
    CTX.stroke();
    
    CTX.restore();
}

function renderLightningArc(effect, progress, fadeOut, frame) {
    // Draw lightning arc between two points
    const { x1, y1, x2, y2 } = effect;
    
    CTX.save();
    CTX.globalAlpha = fadeOut;
    
    // Flickering main arc
    if (frame % 3 < 2) {
        const dist = Math.hypot(x2 - x1, y2 - y1);
        const segments = Math.max(3, Math.ceil(dist / 30));
        const dx = (x2 - x1) / segments;
        const dy = (y2 - y1) / segments;
        
        CTX.strokeStyle = '#ffeb3b';
        CTX.lineWidth = 3;
        CTX.beginPath();
        CTX.moveTo(x1, y1);
        
        for (let i = 1; i < segments; i++) {
            const baseX = x1 + dx * i;
            const baseY = y1 + dy * i;
            const perpAngle = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
            const offset = (Math.random() - 0.5) * 30;
            CTX.lineTo(baseX + Math.cos(perpAngle) * offset, baseY + Math.sin(perpAngle) * offset);
        }
        
        CTX.lineTo(x2, y2);
        CTX.stroke();
        
        // Glow
        CTX.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        CTX.lineWidth = 1;
        CTX.stroke();
    }
    
    CTX.globalAlpha = 1;
    CTX.restore();
}

// ============================================================================

// Helper: Lighten a hex color for trail effects
// Returns a brighter version of the input color (for bullet trails)
function lightenColor(hexColor, percent = 30) {
    // Parse hex color
    let hex = hexColor.replace('#', '');
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // Lighten by blending toward white
    const factor = percent / 100;
    const newR = Math.min(255, Math.round(r + (255 - r) * factor));
    const newG = Math.min(255, Math.round(g + (255 - g) * factor));
    const newB = Math.min(255, Math.round(b + (255 - b) * factor));
    
    return '#' + [newR, newG, newB].map(x => x.toString(16).padStart(2, '0')).join('');
}

// Helper: Draw dramatic water-trail effect behind bullets
// Creates flowing, tapering tail effect like wake in water
// Trail color is automatically 25% brighter than the bullet color for better visibility
function drawBulletWaterTrail(b, color, length = 25, width = 6, fadeAlpha = 1) {
    // Validate bullet has valid position and velocity
    if (!b || typeof b.x !== 'number' || typeof b.y !== 'number') return;
    if (!isFinite(b.x) || !isFinite(b.y)) return;
    if (!b.vx && !b.vy) return; // No velocity, no trail
    
    const vx = b.vx || 0;
    const vy = b.vy || 0;
    const angle = Math.atan2(vy, vx);
    const speed = Math.hypot(vx, vy);
    
    // Skip if speed is too low or invalid
    if (!isFinite(speed) || speed < 0.1) return;
    
    // Trail length scales with speed, clamped to valid range
    const trailLen = Math.max(5, Math.min(100, length * Math.min(1.5, speed / 15)));
    
    // Validate trailLen is finite
    if (!isFinite(trailLen)) return;
    
    // Lighten the trail color by 25% for better visual distinction from bullet body
    const trailColor = lightenColor(color, 25);
    
    CTX.save();
    CTX.translate(b.x, b.y);
    CTX.rotate(angle);
    
    // Main water trail - gradient tapering tail with lightened color
    const trailGrad = CTX.createLinearGradient(-trailLen, 0, 0, 0);
    trailGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    trailGrad.addColorStop(0.3, trailColor + '40');
    trailGrad.addColorStop(0.7, trailColor + '80');
    trailGrad.addColorStop(1, trailColor + 'cc');
    
    CTX.globalAlpha = fadeAlpha * 0.7;
    CTX.fillStyle = trailGrad;
    CTX.beginPath();
    CTX.moveTo(0, -width * 0.5);
    CTX.quadraticCurveTo(-trailLen * 0.4, -width * 0.3, -trailLen, 0);
    CTX.quadraticCurveTo(-trailLen * 0.4, width * 0.3, 0, width * 0.5);
    CTX.closePath();
    CTX.fill();
    
    // Inner bright core trail
    const coreGrad = CTX.createLinearGradient(-trailLen * 0.6, 0, 0, 0);
    coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    coreGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
    coreGrad.addColorStop(1, 'rgba(255, 255, 255, 0.6)');
    
    CTX.globalAlpha = fadeAlpha * 0.5;
    CTX.fillStyle = coreGrad;
    CTX.beginPath();
    CTX.moveTo(0, -width * 0.2);
    CTX.quadraticCurveTo(-trailLen * 0.3, -width * 0.1, -trailLen * 0.6, 0);
    CTX.quadraticCurveTo(-trailLen * 0.3, width * 0.1, 0, width * 0.2);
    CTX.closePath();
    CTX.fill();
    
    // Sparkle particles along trail
    CTX.globalAlpha = fadeAlpha * 0.4;
    for (let i = 0; i < 3; i++) {
        const t = (i + 1) / 4;
        const px = -trailLen * t;
        const py = (Math.sin(b.trailClock * 0.3 + i * 2) * width * 0.3) * (1 - t);
        const size = 1.5 * (1 - t);
        CTX.fillStyle = '#ffffff';
        CTX.beginPath();
        CTX.arc(px, py, size, 0, Math.PI * 2);
        CTX.fill();
    }
    
    CTX.restore();
}

// Helper: Draw wind-cutting/air-split effect in FRONT of artillery shell
// Creates dynamic air compression waves and turbulent vortices
// Parameters:
//   tipX - X position of bullet tip (usually around 18-20)
//   color - base color for the effect
//   intensity - 0-1 multiplier for effect strength
//   trailClock - animation timer from bullet
//   fadeAlpha - transparency multiplier
function drawWindCuttingEffect(tipX, color, intensity, trailClock, fadeAlpha) {
    const time = trailClock * 0.15;
    
    // === AIR COMPRESSION WAVES in front of shell ===
    // Supersonic shockwave cone effect
    CTX.globalAlpha = fadeAlpha * 0.25 * intensity;
    for (let i = 0; i < 3; i++) {
        const waveOffset = tipX + 8 + i * 12;
        const wavePhase = (time + i * 0.5) % 1;
        const waveExpand = 1 + wavePhase * 0.5;
        const waveAlpha = (1 - wavePhase) * 0.4;
        
        // Conical shockwave lines
        CTX.strokeStyle = `rgba(255, 255, 255, ${waveAlpha})`;
        CTX.lineWidth = 1.5 - i * 0.3;
        CTX.beginPath();
        CTX.moveTo(waveOffset, -8 * waveExpand);
        CTX.lineTo(waveOffset + 6, -12 * waveExpand);
        CTX.moveTo(waveOffset, 8 * waveExpand);
        CTX.lineTo(waveOffset + 6, 12 * waveExpand);
        CTX.stroke();
    }
    
    // === TURBULENT VORTICES - spiral air displacement ===
    CTX.globalAlpha = fadeAlpha * 0.3 * intensity;
    for (let side = -1; side <= 1; side += 2) {
        const vortexX = tipX + 12;
        const vortexY = side * 6;
        const vortexPhase = (time * 2 + side * 0.5) % 1;
        const vortexSize = 3 + vortexPhase * 4;
        
        // Spinning vortex arc
        CTX.strokeStyle = `rgba(200, 220, 255, ${0.3 - vortexPhase * 0.25})`;
        CTX.lineWidth = 1;
        CTX.beginPath();
        CTX.arc(vortexX, vortexY, vortexSize, -Math.PI * 0.5 + vortexPhase * Math.PI, Math.PI * 0.5 + vortexPhase * Math.PI);
        CTX.stroke();
    }
    
    // === AIR DISPLACEMENT STREAKS ===
    CTX.globalAlpha = fadeAlpha * 0.35 * intensity;
    for (let i = 0; i < 4; i++) {
        const streakX = tipX + 5 + i * 6;
        const streakPhase = (time * 1.5 + i * 0.3) % 1;
        const streakY = (Math.sin(time * 3 + i * 1.2) * 5) * (1 - streakPhase);
        const streakLen = 8 * (1 - streakPhase);
        
        const streakGrad = CTX.createLinearGradient(streakX, streakY, streakX + streakLen, streakY);
        streakGrad.addColorStop(0, `rgba(255, 255, 255, ${0.4 - i * 0.08})`);
        streakGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        CTX.strokeStyle = streakGrad;
        CTX.lineWidth = 1.5 - streakPhase * 0.8;
        CTX.beginPath();
        CTX.moveTo(streakX, streakY);
        CTX.lineTo(streakX + streakLen, streakY * 1.5);
        CTX.stroke();
    }
    
    // === PRESSURE WAVE GLOW at tip ===
    const pressureGlow = CTX.createRadialGradient(tipX + 5, 0, 0, tipX + 5, 0, 12);
    pressureGlow.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    pressureGlow.addColorStop(0.4, 'rgba(200, 220, 255, 0.08)');
    pressureGlow.addColorStop(1, 'rgba(150, 180, 220, 0)');
    CTX.globalAlpha = fadeAlpha * 0.5 * intensity * (0.8 + Math.sin(time * 4) * 0.2);
    CTX.fillStyle = pressureGlow;
    CTX.beginPath();
    CTX.arc(tipX + 5, 0, 12, 0, Math.PI * 2);
    CTX.fill();
}

// ============================================================================
// Helper: Draw motion blur effect for fast-moving bullets
// Creates streaking ghost images behind the bullet for speed perception
// Parameters:
//   b - bullet object with x, y, vx, vy properties
//   color - base color for the blur trail (string hex or rgb)
//   fadeAlpha - transparency multiplier (from bullet lifecycle)
//   blurLength - how far back the blur extends (default based on speed)
//   blurIntensity - how visible the blur is (0-1, default 0.6)
// ============================================================================
function drawBulletMotionBlur(b, color, fadeAlpha, blurLength = null, blurIntensity = 0.6) {
    // Validate bullet has valid position and velocity
    if (!b || typeof b.x !== 'number' || typeof b.y !== 'number') return;
    if (!b.vx && !b.vy) return; // No velocity = no motion blur
    
    // === PERFORMANCE OPTIMIZATION: Check effect detail level ===
    const effectDetail = typeof getEffectDetail === 'function' ? getEffectDetail() : 1.0;
    if (effectDetail < 0.3) return; // Skip motion blur entirely in emergency mode
    
    // Validate color is a string, use default if not
    const colorStr = (typeof color === 'string') ? color : '#ffffff';
    
    const speed = Math.hypot(b.vx, b.vy);
    // Lower threshold to show blur on more bullets (was 3, now 1)
    if (speed < 1) return;
    
    // Calculate blur length based on speed if not provided
    // Increased multiplier for more visible trails
    const actualBlurLength = blurLength || Math.min(speed * 2.5, 80);
    const bulletAngle = Math.atan2(b.vy, b.vx);
    
    // === OPTIMIZED: Reduce ghost count based on effect detail ===
    // Full quality: 10 ghosts, Low quality: 3 ghosts, Emergency: 0 (skipped above)
    const maxGhosts = Math.ceil(10 * effectDetail);
    const ghostCount = Math.min(maxGhosts, Math.floor(actualBlurLength / 5) + 3);
    
    // Skip ghost rendering if too few (just draw streak instead)
    if (ghostCount < 2 || effectDetail < 0.5) {
        // SIMPLE MODE: Just draw a streak line (much faster)
        let r = 128, g = 128, bl = 128;
        if (colorStr.startsWith('#')) {
            const hex = colorStr.slice(1);
            if (hex.length === 6) {
                r = parseInt(hex.slice(0, 2), 16);
                g = parseInt(hex.slice(2, 4), 16);
                bl = parseInt(hex.slice(4, 6), 16);
            }
        }
        
        CTX.save();
        CTX.globalAlpha = fadeAlpha * blurIntensity * 0.5;
        CTX.strokeStyle = `rgb(${r}, ${g}, ${bl})`;
        CTX.lineWidth = (b.size || 5) * 0.8;
        CTX.lineCap = 'round';
        CTX.beginPath();
        CTX.moveTo(b.x - Math.cos(bulletAngle) * actualBlurLength * 0.6, b.y - Math.sin(bulletAngle) * actualBlurLength * 0.6);
        CTX.lineTo(b.x, b.y);
        CTX.stroke();
        CTX.restore();
        return;
    }
    
    CTX.save();
    
    // Parse color to get RGB components for gradient
    let r = 128, g = 128, bl = 128;
    if (colorStr.startsWith('#')) {
        const hex = colorStr.slice(1);
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            bl = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            bl = parseInt(hex.slice(4, 6), 16);
        }
    } else if (colorStr.startsWith('rgb')) {
        const match = colorStr.match(/\d+/g);
        if (match && match.length >= 3) {
            r = parseInt(match[0]);
            g = parseInt(match[1]);
            bl = parseInt(match[2]);
        }
    }
    
    // Draw ghost images from back to front (furthest = most transparent)
    for (let i = ghostCount - 1; i >= 0; i--) {
        const progress = i / ghostCount; // 0 = closest to bullet, 1 = furthest
        const distance = actualBlurLength * progress;
        
        // Position behind bullet
        const ghostX = b.x - Math.cos(bulletAngle) * distance;
        const ghostY = b.y - Math.sin(bulletAngle) * distance;
        
        // Alpha with smoother linear fade for better visibility
        const ghostAlpha = fadeAlpha * blurIntensity * (1 - progress * 0.8);
        
        // Size shrinks slightly towards back
        const sizeScale = 1 - progress * 0.3;
        const ghostSize = (b.size || 5) * sizeScale;
        
        CTX.globalAlpha = ghostAlpha;
        CTX.fillStyle = `rgba(${r}, ${g}, ${bl}, 1)`;
        
        // Draw ghost as ellipse stretched in direction of travel
        CTX.save();
        CTX.translate(ghostX, ghostY);
        CTX.rotate(bulletAngle);
        CTX.scale(1.5 + progress * 0.5, 1); // Stretch horizontally
        CTX.beginPath();
        CTX.arc(0, 0, ghostSize, 0, Math.PI * 2);
        CTX.fill();
        CTX.restore();
    }
    
    // Draw continuous blur streak for all moving bullets (lowered threshold)
    // Only draw streak at high quality
    if (speed > 5 && effectDetail >= 0.7) {
        const streakGrad = CTX.createLinearGradient(
            b.x - Math.cos(bulletAngle) * actualBlurLength,
            b.y - Math.sin(bulletAngle) * actualBlurLength,
            b.x, b.y
        );
        streakGrad.addColorStop(0, `rgba(${r}, ${g}, ${bl}, 0)`);
        streakGrad.addColorStop(0.6, `rgba(${r}, ${g}, ${bl}, ${fadeAlpha * blurIntensity * 0.3})`);
        streakGrad.addColorStop(1, `rgba(${r}, ${g}, ${bl}, ${fadeAlpha * blurIntensity * 0.5})`);
        
        CTX.globalAlpha = fadeAlpha * blurIntensity;
        CTX.strokeStyle = streakGrad;
        CTX.lineWidth = (b.size || 5) * 1.2;
        CTX.lineCap = 'round';
        CTX.beginPath();
        CTX.moveTo(b.x - Math.cos(bulletAngle) * actualBlurLength, b.y - Math.sin(bulletAngle) * actualBlurLength);
        CTX.lineTo(b.x, b.y);
        CTX.stroke();
    }
    
    CTX.restore();
}

// Helper: Draw bullet shadow that follows bullet shape but always points bottom-right
// Parameters:
//   x, y - position (usually 0,0 since we translate)
//   width - horizontal size of shadow (along bullet length)
//   height - vertical size of shadow (bullet thickness)
//   bulletAngle - the angle the bullet is traveling (used to stretch shadow properly)
//   fadeAlpha - transparency multiplier
//   shape - optional: 'ellipse' (default), 'shell' (artillery shell with ogive nose)
// Shadow is drawn as an ellipse that's always offset to bottom-right,
// stretched to match bullet shape but rotated to global shadow direction
function drawBulletShadow(x, y, width, height, bulletAngle, fadeAlpha, shape = 'ellipse') {
    // === PERFORMANCE OPTIMIZATION: Check shadow quality level ===
    const shadowQuality = typeof getShadowQuality === 'function' ? getShadowQuality() : 1.0;
    if (shadowQuality < 0.2) return; // Skip bullet shadows in low quality mode
    
    // Handle legacy calls with only size parameter (circular shadow)
    if (typeof height === 'undefined' || typeof bulletAngle === 'undefined') {
        // Legacy mode - width is actually 'size', height is 'fadeAlpha'
        const size = width;
        const alpha = height ?? 1;
        CTX.save();
        // OPTIMIZED: Only use blur filter at high quality
        if (shadowQuality >= 0.7) {
            CTX.filter = 'blur(2px)'; // Soft shadow blur for bullets
        }
        CTX.fillStyle = `rgba(0, 0, 0, ${BULLET_SHADOW_ALPHA * alpha * shadowQuality})`;
        CTX.beginPath();
        CTX.arc(x + BULLET_SHADOW_OFFSET_X, y + BULLET_SHADOW_OFFSET_Y, size, 0, Math.PI * 2);
        CTX.fill();
        if (shadowQuality >= 0.7) {
            CTX.filter = 'none';
        }
        CTX.restore();
        return;
    }
    
    // New mode - shaped shadow matching bullet form
    // Shadow position is always bottom-right regardless of bullet direction
    const shadowX = x + BULLET_SHADOW_OFFSET_X;
    const shadowY = y + BULLET_SHADOW_OFFSET_Y;
    
    CTX.save();
    // Apply blur based on shadow quality
    if (shadowQuality >= 0.7) {
        CTX.filter = 'blur(3px)';
    } else if (shadowQuality >= 0.4) {
        CTX.filter = 'blur(1px)';
    }
    CTX.fillStyle = `rgba(0, 0, 0, ${BULLET_SHADOW_ALPHA * fadeAlpha * shadowQuality})`;
    CTX.translate(shadowX, shadowY);
    // Shadow always faces global shadow direction (bottom-right, 45 degrees)
    CTX.rotate(GLOBAL_SHADOW_ANGLE);
    
    if (shape === 'shell') {
        // Artillery shell shadow - ogive nose + cylindrical body + tapered tail
        // This matches the actual artillery shell shape used in draw functions
        const noseLen = width * 0.4;       // Pointed nose section
        const bodyLen = width * 0.45;      // Main body cylinder
        const tailLen = width * 0.15;      // Tapered tail section
        const bodyRadius = height;         // Body thickness
        
        CTX.beginPath();
        
        // Start at tail tip (left side)
        CTX.moveTo(-width / 2, 0);
        
        // Tail taper (bottom curve to body)
        CTX.quadraticCurveTo(
            -width / 2 + tailLen * 0.3, bodyRadius * 0.6,
            -width / 2 + tailLen, bodyRadius
        );
        
        // Body bottom (straight section)
        CTX.lineTo(-width / 2 + tailLen + bodyLen, bodyRadius);
        
        // Ogive nose curve (bottom to tip)
        CTX.quadraticCurveTo(
            width / 2 - noseLen * 0.3, bodyRadius * 0.6,
            width / 2, 0  // Nose tip
        );
        
        // Ogive nose curve (tip to top)
        CTX.quadraticCurveTo(
            width / 2 - noseLen * 0.3, -bodyRadius * 0.6,
            -width / 2 + tailLen + bodyLen, -bodyRadius
        );
        
        // Body top (straight section)
        CTX.lineTo(-width / 2 + tailLen, -bodyRadius);
        
        // Tail taper (body to tip)
        CTX.quadraticCurveTo(
            -width / 2 + tailLen * 0.3, -bodyRadius * 0.6,
            -width / 2, 0
        );
        
        CTX.closePath();
        CTX.fill();
    } else {
        // Default ellipse shadow
        CTX.beginPath();
        CTX.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
        CTX.fill();
    }
    
    CTX.filter = 'none';
    CTX.restore();
}

// CANNON - Realistic artillery shell with dramatic trail and impact presence
// Color matches turret color for visual consistency
function drawCannonBullet(b, angle, fadeAlpha) {
    CTX.save();
    CTX.translate(b.x, b.y);
    
    // Get turret-matching color - steel gray with slight blue tint
    const shellColor = '#8fa0b0'; // Matches cannon turret aesthetic
    const shellColorDark = '#6b7a8c';
    const shellColorLight = '#b8c5d0';
    
    // Enhanced water droplet trail effect - teardrop particles following the shell
    drawBulletWaterTrail(b, shellColor, 45, 8, fadeAlpha);
    
    // Artillery shell shadow matching actual bullet shape
    drawBulletShadow(0, 0, 16, 7, angle, fadeAlpha, 'shell');
    
    CTX.rotate(angle);
    
    // === LAYER 1: Trailing water droplets / tail particles ===
    // Creates realistic "teardrop" wake effect behind the shell
    const time = typeof frame !== 'undefined' ? frame : Date.now() * 0.06;
    CTX.globalAlpha = fadeAlpha;
    
    for (let i = 1; i <= 12; i++) {
        const dropOffset = -8 * i - Math.sin(time * 0.1 + i) * 2;
        const dropSize = Math.max(1, 4 - i * 0.3);
        const dropAlpha = Math.max(0, 0.5 - i * 0.04);
        const dropY = Math.sin(time * 0.15 + i * 0.8) * (i * 0.4);
        
        // Water/vapor droplet - gradient for 3D effect
        const dropGrad = CTX.createRadialGradient(
            dropOffset, dropY, 0,
            dropOffset, dropY, dropSize
        );
        dropGrad.addColorStop(0, `rgba(143, 160, 176, ${dropAlpha})`);
        dropGrad.addColorStop(0.5, `rgba(107, 122, 140, ${dropAlpha * 0.7})`);
        dropGrad.addColorStop(1, `rgba(80, 95, 115, 0)`);
        
        CTX.fillStyle = dropGrad;
        CTX.beginPath();
        CTX.arc(dropOffset, dropY, dropSize, 0, Math.PI * 2);
        CTX.fill();
        
        // Secondary smaller droplet for depth
        if (i % 2 === 0) {
            const smallDrop = dropSize * 0.5;
            CTX.fillStyle = `rgba(184, 197, 208, ${dropAlpha * 0.6})`;
            CTX.beginPath();
            CTX.arc(dropOffset + 2, dropY + (i % 3 - 1) * 2, smallDrop, 0, Math.PI * 2);
            CTX.fill();
        }
    }
    
    // === LAYER 2: Smoke/heat trail ===
    CTX.globalAlpha = fadeAlpha * 0.45;
    for (let i = 1; i <= 8; i++) {
        const smokeSize = 5 - i * 0.5;
        const smokeOffset = -12 * i;
        const smokeY = Math.sin(time * 0.08 + i * 1.2) * 3;
        
        // Dark smoke core
        CTX.fillStyle = `rgba(70, 80, 95, ${0.35 - i * 0.04})`;
        CTX.beginPath();
        CTX.arc(smokeOffset, smokeY, smokeSize, 0, Math.PI * 2);
        CTX.fill();
        
        // Lighter smoke edge
        CTX.fillStyle = `rgba(110, 125, 145, ${0.2 - i * 0.025})`;
        CTX.beginPath();
        CTX.arc(smokeOffset - 2, smokeY * 0.8, smokeSize * 0.6, 0, Math.PI * 2);
        CTX.fill();
    }
    CTX.globalAlpha = fadeAlpha;
    
    // === LAYER 3: Outer aura glow ===
    const auraGlow = CTX.createRadialGradient(0, 0, 0, 0, 0, 18);
    auraGlow.addColorStop(0, 'rgba(143, 160, 176, 0.5)');
    auraGlow.addColorStop(0.4, 'rgba(107, 122, 140, 0.25)');
    auraGlow.addColorStop(0.7, 'rgba(80, 95, 115, 0.1)');
    auraGlow.addColorStop(1, 'rgba(60, 75, 95, 0)');
    CTX.fillStyle = auraGlow;
    CTX.beginPath();
    CTX.arc(0, 0, 18, 0, Math.PI * 2);
    CTX.fill();
    
    // === LAYER 4: Shell body - realistic artillery round shape ===
    // Main shell casing - cylindrical body with turret-matching color
    const bodyGrad = CTX.createLinearGradient(-10, -6, -10, 6);
    bodyGrad.addColorStop(0, shellColorLight);    // Bright top (light reflection)
    bodyGrad.addColorStop(0.2, '#a8b5c2');  // Light gray
    bodyGrad.addColorStop(0.5, shellColor);  // Main color
    bodyGrad.addColorStop(0.8, shellColorDark);  // Shadow
    bodyGrad.addColorStop(1, '#4b5563');    // Dark bottom
    
    CTX.fillStyle = bodyGrad;
    CTX.beginPath();
    // Rounded rectangle for shell body (more realistic than ellipse)
    CTX.moveTo(-8, -5);
    CTX.lineTo(4, -5);
    CTX.quadraticCurveTo(8, -5, 8, 0);
    CTX.quadraticCurveTo(8, 5, 4, 5);
    CTX.lineTo(-8, 5);
    CTX.quadraticCurveTo(-12, 5, -12, 0);
    CTX.quadraticCurveTo(-12, -5, -8, -5);
    CTX.closePath();
    CTX.fill();
    
    // Shell casing rim - harmonized with shell color (darker variant for contrast)
    const rimGrad = CTX.createLinearGradient(-10, -5, -10, 5);
    rimGrad.addColorStop(0, shellColorLight);
    rimGrad.addColorStop(0.3, shellColor);
    rimGrad.addColorStop(0.7, shellColorDark);
    rimGrad.addColorStop(1, lightenColor(shellColorDark, 0.6));
    CTX.fillStyle = rimGrad;
    CTX.beginPath();
    CTX.ellipse(-10, 0, 3, 5, 0, 0, Math.PI * 2);
    CTX.fill();
    // Rim accent ring for dramatic effect
    CTX.strokeStyle = shellColorDark;
    CTX.lineWidth = 0.8;
    CTX.stroke();
    
    // === LAYER 5: Ogive nose (pointed tip) - realistic shell profile ===
    const noseGrad = CTX.createLinearGradient(8, -4, 8, 4);
    noseGrad.addColorStop(0, shellColorDark);
    noseGrad.addColorStop(0.3, lightenColor(shellColorDark, 0.8));
    noseGrad.addColorStop(0.7, lightenColor(shellColorDark, 0.6));
    noseGrad.addColorStop(1, lightenColor(shellColorDark, 0.4));
    CTX.fillStyle = noseGrad;
    CTX.beginPath();
    // Smooth ogive curve (not sharp triangle)
    CTX.moveTo(8, -4.5);
    CTX.quadraticCurveTo(14, -2, 18, 0);
    CTX.quadraticCurveTo(14, 2, 8, 4.5);
    CTX.closePath();
    CTX.fill();
    
    // Nose tip highlight
    CTX.fillStyle = 'rgba(255, 255, 255, 0.4)';
    CTX.beginPath();
    CTX.ellipse(15, -1, 2, 1, 0.3, 0, Math.PI * 2);
    CTX.fill();
    
    // === LAYER 6: Driving band - harmonized with shell color ===
    const bandGrad = CTX.createLinearGradient(-2, -5, -2, 5);
    bandGrad.addColorStop(0, shellColorLight);
    bandGrad.addColorStop(0.5, shellColor);
    bandGrad.addColorStop(1, shellColorDark);
    CTX.fillStyle = bandGrad;
    CTX.beginPath();
    CTX.ellipse(-2, 0, 2.5, 5.2, 0, 0, Math.PI * 2);
    CTX.fill();
    // Band accent for definition
    CTX.strokeStyle = shellColorDark;
    CTX.lineWidth = 0.5;
    CTX.stroke();
    
    // === LAYER 7: Metallic shine highlights ===
    // Top shine on body
    CTX.fillStyle = 'rgba(255, 255, 255, 0.45)';
    CTX.beginPath();
    CTX.ellipse(-2, -3, 8, 1.5, -0.1, 0, Math.PI);
    CTX.fill();
    
    // Small specular highlight
    CTX.fillStyle = 'rgba(255, 255, 255, 0.7)';
    CTX.beginPath();
    CTX.ellipse(2, -2.5, 2, 0.8, 0, 0, Math.PI * 2);
    CTX.fill();
    
    // === LAYER 8: Speed/motion blur tip glow ===
    const tipGlow = CTX.createRadialGradient(17, 0, 0, 17, 0, 6);
    tipGlow.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
    tipGlow.addColorStop(0.3, 'rgba(220, 225, 235, 0.4)');
    tipGlow.addColorStop(0.6, 'rgba(180, 190, 210, 0.2)');
    tipGlow.addColorStop(1, 'rgba(150, 160, 180, 0)');
    CTX.fillStyle = tipGlow;
    CTX.beginPath();
    CTX.arc(17, 0, 6, 0, Math.PI * 2);
    CTX.fill();
    
    // === LAYER 9: WIND-CUTTING EFFECT - Air split in front of shell ===
    drawWindCuttingEffect(18, shellColor, 1.0, b.trailClock, fadeAlpha);
    
    // === LAYER 10: Trailing spark particles - matches shell color ===
    for (let i = 0; i < 4; i++) {
        const sparkX = -15 - i * 8 + Math.sin(time * 0.2 + i * 2) * 3;
        const sparkY = Math.sin(time * 0.3 + i * 1.5) * 4;
        const sparkSize = 1.5 - i * 0.3;
        const sparkAlpha = 0.6 - i * 0.15;
        
        // Use lightened shell color for spark particles (pastel version)
        CTX.fillStyle = `rgba(184, 200, 216, ${sparkAlpha * fadeAlpha})`; // Light steel gray
        CTX.beginPath();
        CTX.arc(sparkX, sparkY, sparkSize, 0, Math.PI * 2);
        CTX.fill();
    }
    
    CTX.restore();
}

// TWIN CANNON - Artillery shell style with dual tracer trail
// Unified bullet design matching enemy tank projectiles
function drawTwinBullet(b, angle, fadeAlpha) {
    CTX.save();
    CTX.translate(b.x, b.y);
    
    // Weapon-themed colors matching green turret
    const shellColor = '#059669';
    const shellColorDark = '#047857';
    const shellColorLight = '#10b981';
    
    // Enhanced water trail effect
    drawBulletWaterTrail(b, '#10b981', 35, 5, fadeAlpha);
    
    // Artillery shell shadow matching actual bullet shape
    drawBulletShadow(0, 0, 12, 5, angle, fadeAlpha, 'shell');
    
    CTX.rotate(angle);
    
    const time = typeof frame !== 'undefined' ? frame : Date.now() * 0.06;
    
    // === LAYER 1: Twin tracer trail effect (characteristic dual lines) ===
    CTX.globalAlpha = fadeAlpha * 0.6;
    for (let i = 1; i <= 6; i++) {
        const trailOffset = -8 * i;
        const trailWidth = 0.7 - i * 0.08;
        
        // Upper tracer line
        CTX.fillStyle = `rgba(16, 185, 129, ${trailWidth})`;
        CTX.beginPath();
        CTX.arc(trailOffset, -2, 2.5 - i * 0.3, 0, Math.PI * 2);
        CTX.fill();
        
        // Lower tracer line
        CTX.beginPath();
        CTX.arc(trailOffset, 2, 2.5 - i * 0.3, 0, Math.PI * 2);
        CTX.fill();
    }
    CTX.globalAlpha = fadeAlpha;
    
    // === LAYER 2: Outer aura glow ===
    const auraGlow = CTX.createRadialGradient(0, 0, 0, 0, 0, 16);
    auraGlow.addColorStop(0, 'rgba(52, 211, 153, 0.5)');
    auraGlow.addColorStop(0.4, 'rgba(16, 185, 129, 0.25)');
    auraGlow.addColorStop(0.7, 'rgba(5, 150, 105, 0.1)');
    auraGlow.addColorStop(1, 'rgba(4, 120, 87, 0)');
    CTX.fillStyle = auraGlow;
    CTX.beginPath();
    CTX.arc(0, 0, 16, 0, Math.PI * 2);
    CTX.fill();
    
    // === LAYER 3: Shell body - realistic artillery round shape ===
    const bodyGrad = CTX.createLinearGradient(-10, -5, -10, 5);
    bodyGrad.addColorStop(0, shellColorLight);
    bodyGrad.addColorStop(0.2, '#a7f3d0');
    bodyGrad.addColorStop(0.5, shellColor);
    bodyGrad.addColorStop(0.8, shellColorDark);
    bodyGrad.addColorStop(1, '#065f46');
    
    CTX.fillStyle = bodyGrad;
    CTX.beginPath();
    // Rounded rectangle for shell body
    CTX.moveTo(-7, -4.5);
    CTX.lineTo(4, -4.5);
    CTX.quadraticCurveTo(7, -4.5, 7, 0);
    CTX.quadraticCurveTo(7, 4.5, 4, 4.5);
    CTX.lineTo(-7, 4.5);
    CTX.quadraticCurveTo(-10, 4.5, -10, 0);
    CTX.quadraticCurveTo(-10, -4.5, -7, -4.5);
    CTX.closePath();
    CTX.fill();
    
    // Shell casing rim - harmonized with shell color
    const rimGrad = CTX.createLinearGradient(-9, -4.5, -9, 4.5);
    rimGrad.addColorStop(0, shellColorLight);
    rimGrad.addColorStop(0.3, shellColor);
    rimGrad.addColorStop(0.7, shellColorDark);
    rimGrad.addColorStop(1, '#065f46');
    CTX.fillStyle = rimGrad;
    CTX.beginPath();
    CTX.ellipse(-9, 0, 2.5, 4.5, 0, 0, Math.PI * 2);
    CTX.fill();
    CTX.strokeStyle = shellColorDark;
    CTX.lineWidth = 0.6;
    CTX.stroke();
    
    // === LAYER 4: Ogive nose (pointed tip) ===
    const noseGrad = CTX.createLinearGradient(7, -3.5, 7, 3.5);
    noseGrad.addColorStop(0, shellColorDark);
    noseGrad.addColorStop(0.3, '#065f46');
    noseGrad.addColorStop(0.7, '#064e3b');
    noseGrad.addColorStop(1, '#022c22');
    CTX.fillStyle = noseGrad;
    CTX.beginPath();
    CTX.moveTo(7, -4);
    CTX.quadraticCurveTo(12, -2, 15, 0);
    CTX.quadraticCurveTo(12, 2, 7, 4);
    CTX.closePath();
    CTX.fill();
    
    // Nose tip highlight
    CTX.fillStyle = 'rgba(255, 255, 255, 0.4)';
    CTX.beginPath();
    CTX.ellipse(13, -0.8, 1.8, 0.9, 0.3, 0, Math.PI * 2);
    CTX.fill();
    
    // === LAYER 5: Driving band - harmonized with shell color ===
    const bandGrad = CTX.createLinearGradient(-2, -4.5, -2, 4.5);
    bandGrad.addColorStop(0, shellColorLight);
    bandGrad.addColorStop(0.5, shellColor);
    bandGrad.addColorStop(1, shellColorDark);
    CTX.fillStyle = bandGrad;
    CTX.beginPath();
    CTX.ellipse(-2, 0, 2, 4.7, 0, 0, Math.PI * 2);
    CTX.fill();
    CTX.strokeStyle = shellColorDark;
    CTX.lineWidth = 0.5;
    CTX.stroke();
    
    // === LAYER 6: Metallic shine highlights ===
    CTX.fillStyle = 'rgba(255, 255, 255, 0.4)';
    CTX.beginPath();
    CTX.ellipse(-2, -2.5, 7, 1.2, -0.1, 0, Math.PI);
    CTX.fill();
    
    CTX.fillStyle = 'rgba(255, 255, 255, 0.6)';
    CTX.beginPath();
    CTX.ellipse(2, -2.2, 1.8, 0.7, 0, 0, Math.PI * 2);
    CTX.fill();
    
    // === LAYER 7: Speed/motion blur tip glow ===
    const tipGlow = CTX.createRadialGradient(14, 0, 0, 14, 0, 5);
    tipGlow.addColorStop(0, 'rgba(167, 243, 208, 0.7)');
    tipGlow.addColorStop(0.3, 'rgba(110, 231, 183, 0.4)');
    tipGlow.addColorStop(0.6, 'rgba(52, 211, 153, 0.2)');
    tipGlow.addColorStop(1, 'rgba(16, 185, 129, 0)');
    CTX.fillStyle = tipGlow;
    CTX.beginPath();
    CTX.arc(14, 0, 5, 0, Math.PI * 2);
    CTX.fill();
    
    // === LAYER 8: WIND-CUTTING EFFECT - Air split in front of shell ===
    drawWindCuttingEffect(15, shellColor, 0.9, b.trailClock, fadeAlpha);
    
    // === LAYER 9: Trailing spark particles ===
    for (let i = 0; i < 4; i++) {
        const sparkX = -14 - i * 7 + Math.sin(time * 0.2 + i * 2) * 2;
        const sparkY = Math.sin(time * 0.3 + i * 1.5) * 3;
        const sparkSize = 1.3 - i * 0.25;
        const sparkAlpha = 0.5 - i * 0.12;
        
        CTX.fillStyle = `rgba(167, 243, 208, ${sparkAlpha * fadeAlpha})`;
        CTX.beginPath();
        CTX.arc(sparkX, sparkY, sparkSize, 0, Math.PI * 2);
        CTX.fill();
    }
    
    CTX.restore();
}

// SHOTGUN - Artillery shell style with scattered pellet trail
// Unified bullet design matching enemy tank projectiles
function drawShotgunBullet(b, angle, fadeAlpha) {
    CTX.save();
    CTX.translate(b.x, b.y);
    
    // Weapon-themed colors matching magenta/pink turret
    const shellColor = '#d946ef';
    const shellColorDark = '#a21caf';
    const shellColorLight = '#f0abfc';
    
    // Water trail effect
    drawBulletWaterTrail(b, shellColor, 25, 6, fadeAlpha);
    
    // Artillery shell shadow matching actual bullet shape
    drawBulletShadow(0, 0, 12, 5, angle, fadeAlpha, 'shell');
    
    CTX.rotate(angle);
    
    const time = typeof frame !== 'undefined' ? frame : Date.now() * 0.06;
    
    // === LAYER 1: Scattered pellet trail (shotgun characteristic) ===
    CTX.globalAlpha = fadeAlpha * 0.6;
    for (let i = 1; i <= 8; i++) {
        const trailOffset = -6 * i;
        const spreadY = Math.sin(time * 0.2 + i * 1.3) * (i * 0.8);
        const pelletSize = Math.max(1.5, 3 - i * 0.25);
        const pelletAlpha = Math.max(0, 0.5 - i * 0.05);
        
        CTX.fillStyle = `rgba(217, 70, 239, ${pelletAlpha})`;
        CTX.beginPath();
        CTX.arc(trailOffset, spreadY, pelletSize, 0, Math.PI * 2);
        CTX.fill();
        
        // Secondary scatter
        CTX.fillStyle = `rgba(240, 171, 252, ${pelletAlpha * 0.5})`;
        CTX.beginPath();
        CTX.arc(trailOffset - 2, -spreadY * 0.7, pelletSize * 0.6, 0, Math.PI * 2);
        CTX.fill();
    }
    
    // === LAYER 2: Outer glow aura ===
    CTX.globalAlpha = fadeAlpha;
    const auraGlow = CTX.createRadialGradient(0, 0, 0, 0, 0, 14);
    auraGlow.addColorStop(0, 'rgba(217, 70, 239, 0.5)');
    auraGlow.addColorStop(0.5, 'rgba(162, 28, 175, 0.25)');
    auraGlow.addColorStop(1, 'rgba(134, 25, 143, 0)');
    CTX.fillStyle = auraGlow;
    CTX.beginPath();
    CTX.arc(0, 0, 14, 0, Math.PI * 2);
    CTX.fill();
    
    // === LAYER 3: Shell body - artillery style ===
    const bodyGrad = CTX.createLinearGradient(-8, -4, -8, 4);
    bodyGrad.addColorStop(0, shellColorLight);
    bodyGrad.addColorStop(0.3, shellColor);
    bodyGrad.addColorStop(0.7, shellColorDark);
    bodyGrad.addColorStop(1, '#701a75');
    
    CTX.fillStyle = bodyGrad;
    CTX.beginPath();
    CTX.moveTo(-6, -4);
    CTX.lineTo(3, -4);
    CTX.quadraticCurveTo(6, -4, 6, 0);
    CTX.quadraticCurveTo(6, 4, 3, 4);
    CTX.lineTo(-6, 4);
    CTX.quadraticCurveTo(-9, 4, -9, 0);
    CTX.quadraticCurveTo(-9, -4, -6, -4);
    CTX.closePath();
    CTX.fill();
    
    // === LAYER 4: Casing rim - harmonized with shell color ===
    const rimGrad = CTX.createLinearGradient(-8, -4, -8, 4);
    rimGrad.addColorStop(0, shellColorLight);
    rimGrad.addColorStop(0.5, shellColor);
    rimGrad.addColorStop(1, shellColorDark);
    CTX.fillStyle = rimGrad;
    CTX.beginPath();
    CTX.ellipse(-7, 0, 2, 4, 0, 0, Math.PI * 2);
    CTX.fill();
    CTX.strokeStyle = shellColorDark;
    CTX.lineWidth = 0.5;
    CTX.stroke();
    
    // === LAYER 5: Ogive nose ===
    const noseGrad = CTX.createLinearGradient(6, -3, 6, 3);
    noseGrad.addColorStop(0, shellColorDark);
    noseGrad.addColorStop(0.5, '#86198f');
    noseGrad.addColorStop(1, '#581c87');
    CTX.fillStyle = noseGrad;
    CTX.beginPath();
    CTX.moveTo(6, -3.5);
    CTX.quadraticCurveTo(11, -1.5, 14, 0);
    CTX.quadraticCurveTo(11, 1.5, 6, 3.5);
    CTX.closePath();
    CTX.fill();
    
    // === LAYER 6: Metallic highlights ===
    CTX.fillStyle = 'rgba(255, 255, 255, 0.5)';
    CTX.beginPath();
    CTX.ellipse(-1, -2.5, 5, 1, -0.1, 0, Math.PI);
    CTX.fill();
    
    CTX.fillStyle = 'rgba(255, 255, 255, 0.7)';
    CTX.beginPath();
    CTX.ellipse(2, -2, 1.5, 0.6, 0, 0, Math.PI * 2);
    CTX.fill();
    
    // === LAYER 7: Tip glow ===
    const tipGlow = CTX.createRadialGradient(13, 0, 0, 13, 0, 5);
    tipGlow.addColorStop(0, 'rgba(240, 171, 252, 0.6)');
    tipGlow.addColorStop(0.5, 'rgba(217, 70, 239, 0.3)');
    tipGlow.addColorStop(1, 'rgba(162, 28, 175, 0)');
    CTX.fillStyle = tipGlow;
    CTX.beginPath();
    CTX.arc(13, 0, 5, 0, Math.PI * 2);
    CTX.fill();
    
    // === LAYER 8: WIND-CUTTING EFFECT - Air split in front of shell ===
    drawWindCuttingEffect(14, shellColor, 0.85, b.trailClock, fadeAlpha);
    
    CTX.restore();
}

// SNIPER/RAILGUN - Hypersonic armor-piercing round with dramatic tungsten penetrator
function drawSniperBullet(b, angle, fadeAlpha, speed) {
    CTX.save();
    CTX.translate(b.x, b.y);
    
    const time = typeof frame !== 'undefined' ? frame : Date.now() * 0.06;
    
    // Sniper colors - sleek silver/tungsten
    const shellColor = '#c0c0c0';
    const shellColorDark = '#808080';
    const shellColorLight = '#e8e8e8';
    
    // Long dramatic water trail for high-speed bullet
    drawBulletWaterTrail(b, shellColor, 50, 4, fadeAlpha);
    
    // Very elongated tracer shadow - shaped like penetrator
    drawBulletShadow(0, 0, 18, 4, angle, fadeAlpha);
    
    CTX.rotate(angle);
    
    // Sonic boom rings - compressed air shockwaves
    CTX.globalAlpha = fadeAlpha * 0.25;
    CTX.strokeStyle = shellColorLight;
    CTX.lineWidth = 1.2;
    for (let i = 1; i <= 4; i++) {
        const ringX = -18 * i;
        const ringSize = 6 + i * 3;
        const ringAlpha = 0.4 - i * 0.08;
        CTX.globalAlpha = fadeAlpha * ringAlpha;
        CTX.beginPath();
        CTX.ellipse(ringX, 0, 3, ringSize, 0, 0, Math.PI * 2);
        CTX.stroke();
    }
    CTX.globalAlpha = fadeAlpha;
    
    // Energy trail - ionized air
    const trailGrad = CTX.createLinearGradient(-90, 0, 0, 0);
    trailGrad.addColorStop(0, 'rgba(200, 200, 200, 0)');
    trailGrad.addColorStop(0.4, 'rgba(220, 220, 220, 0.3)');
    trailGrad.addColorStop(0.7, 'rgba(240, 240, 255, 0.6)');
    trailGrad.addColorStop(1, 'rgba(255, 255, 255, 0.9)');
    CTX.strokeStyle = trailGrad;
    CTX.lineWidth = 3;
    CTX.beginPath();
    CTX.moveTo(-90, 0);
    CTX.lineTo(0, 0);
    CTX.stroke();
    
    // === LAYER: Main penetrator body - elongated tungsten dart ===
    const bodyGrad = CTX.createLinearGradient(-12, -3.5, -12, 3.5);
    bodyGrad.addColorStop(0, shellColorLight);
    bodyGrad.addColorStop(0.25, shellColor);
    bodyGrad.addColorStop(0.5, shellColorDark);
    bodyGrad.addColorStop(0.75, shellColor);
    bodyGrad.addColorStop(1, '#606060');
    
    CTX.fillStyle = bodyGrad;
    CTX.beginPath();
    // Sleek elongated penetrator shape
    CTX.moveTo(-12, -3);
    CTX.lineTo(8, -2.5);
    CTX.quadraticCurveTo(16, -1, 22, 0);
    CTX.quadraticCurveTo(16, 1, 8, 2.5);
    CTX.lineTo(-12, 3);
    CTX.quadraticCurveTo(-16, 3, -16, 0);
    CTX.quadraticCurveTo(-16, -3, -12, -3);
    CTX.closePath();
    CTX.fill();
    
    // Stabilizer fins at back - aerodynamic
    CTX.fillStyle = shellColorDark;
    // Top fin
    CTX.beginPath();
    CTX.moveTo(-14, -3);
    CTX.lineTo(-18, -7);
    CTX.lineTo(-10, -3);
    CTX.closePath();
    CTX.fill();
    // Bottom fin
    CTX.beginPath();
    CTX.moveTo(-14, 3);
    CTX.lineTo(-18, 7);
    CTX.lineTo(-10, 3);
    CTX.closePath();
    CTX.fill();
    
    // Penetrator tip - hardened point
    const tipGrad = CTX.createLinearGradient(18, -2, 18, 2);
    tipGrad.addColorStop(0, '#f5f5f5');
    tipGrad.addColorStop(0.5, '#00e5ff');
    tipGrad.addColorStop(1, '#d0d0d0');
    CTX.fillStyle = tipGrad;
    CTX.beginPath();
    CTX.moveTo(18, -2);
    CTX.lineTo(26, 0);
    CTX.lineTo(18, 2);
    CTX.closePath();
    CTX.fill();
    
    // Metallic shine highlight
    CTX.fillStyle = 'rgba(255, 255, 255, 0.6)';
    CTX.beginPath();
    CTX.ellipse(0, -2, 10, 1, -0.05, 0, Math.PI);
    CTX.fill();
    
    // Bright tip glow - heat from friction
    const tipGlow = CTX.createRadialGradient(24, 0, 0, 24, 0, 6);
    tipGlow.addColorStop(0, 'rgba(0, 229, 255, 0.9)');
    tipGlow.addColorStop(0.4, 'rgba(100, 240, 255, 0.5)');
    tipGlow.addColorStop(1, 'rgba(0, 229, 255, 0)');
    CTX.fillStyle = tipGlow;
    CTX.beginPath();
    CTX.arc(24, 0, 6, 0, Math.PI * 2);
    CTX.fill();
    
    // Heat distortion glow
    CTX.globalAlpha = fadeAlpha * 0.4;
    const heatGlow = CTX.createRadialGradient(0, 0, 0, 0, 0, 20);
    heatGlow.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
    heatGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    CTX.fillStyle = heatGlow;
    CTX.beginPath();
    CTX.arc(0, 0, 20, 0, Math.PI * 2);
    CTX.fill();
    
    CTX.restore();
}

// BURST RIFLE - Artillery shell style with plasma energy effects
// Unified bullet design matching enemy tank projectiles
function drawBurstBullet(b, angle, fadeAlpha) {
    CTX.save();
    CTX.translate(b.x, b.y);
    
    // Weapon-themed colors matching gold/yellow turret
    const shellColor = '#ffd700';
    const shellColorDark = '#b8860b';
    const shellColorLight = '#ffec8b';
    
    // Energy water trail
    drawBulletWaterTrail(b, shellColor, 30, 5, fadeAlpha);
    
    // Artillery shell shadow matching actual bullet shape
    drawBulletShadow(0, 0, 12, 4, angle, fadeAlpha, 'shell');
    
    CTX.rotate(angle);
    
    // Animated pulse phase for dynamic effects
    const time = typeof frame !== 'undefined' ? frame : Date.now() * 0.06;
    const pulsePhase = Math.sin((b.trailClock || 0) * 0.35);
    const flickerPhase = Math.sin((b.trailClock || 0) * 0.8);
    
    // === LAYER 1: Energy wake trail ===
    CTX.globalAlpha = fadeAlpha * 0.4;
    for (let i = 1; i <= 6; i++) {
        const wakeOffset = -7 * i;
        const wakeSize = 4 + i * 1.5;
        const wakeGrad = CTX.createRadialGradient(wakeOffset, 0, 0, wakeOffset, 0, wakeSize);
        wakeGrad.addColorStop(0, `rgba(255, 215, 0, ${0.4 - i * 0.06})`);
        wakeGrad.addColorStop(1, 'rgba(184, 134, 11, 0)');
        CTX.fillStyle = wakeGrad;
        CTX.beginPath();
        CTX.arc(wakeOffset, 0, wakeSize, 0, Math.PI * 2);
        CTX.fill();
    }
    
    // === LAYER 2: Electrical arcs (burst characteristic) ===
    CTX.globalAlpha = fadeAlpha * (0.5 + flickerPhase * 0.3);
    CTX.strokeStyle = '#ffff00';
    CTX.lineWidth = 1.2;
    CTX.lineCap = 'round';
    
    for (let i = 0; i < 2; i++) {
        const arcY = (i - 0.5) * 8;
        CTX.beginPath();
        CTX.moveTo(-8, arcY);
        let px = -8;
        for (let j = 0; j < 3; j++) {
            px += 6;
            const zigY = arcY + (Math.random() - 0.5) * 5;
            CTX.lineTo(px, zigY);
        }
        CTX.stroke();
    }
    
    // === LAYER 3: Outer glow aura ===
    CTX.globalAlpha = fadeAlpha;
    const auraGlow = CTX.createRadialGradient(0, 0, 0, 0, 0, 13);
    auraGlow.addColorStop(0, 'rgba(255, 236, 139, 0.6)');
    auraGlow.addColorStop(0.4, 'rgba(255, 215, 0, 0.35)');
    auraGlow.addColorStop(0.7, 'rgba(184, 134, 11, 0.15)');
    auraGlow.addColorStop(1, 'rgba(139, 69, 19, 0)');
    CTX.fillStyle = auraGlow;
    CTX.beginPath();
    CTX.arc(0, 0, 13, 0, Math.PI * 2);
    CTX.fill();
    
    // === LAYER 4: Shell body - artillery style ===
    const bodyGrad = CTX.createLinearGradient(-7, -3.5, -7, 3.5);
    bodyGrad.addColorStop(0, shellColorLight);
    bodyGrad.addColorStop(0.3, shellColor);
    bodyGrad.addColorStop(0.7, shellColorDark);
    bodyGrad.addColorStop(1, '#8b6914');
    
    CTX.fillStyle = bodyGrad;
    CTX.beginPath();
    CTX.moveTo(-5, -3.5);
    CTX.lineTo(3, -3.5);
    CTX.quadraticCurveTo(5.5, -3.5, 5.5, 0);
    CTX.quadraticCurveTo(5.5, 3.5, 3, 3.5);
    CTX.lineTo(-5, 3.5);
    CTX.quadraticCurveTo(-8, 3.5, -8, 0);
    CTX.quadraticCurveTo(-8, -3.5, -5, -3.5);
    CTX.closePath();
    CTX.fill();
    
    // === LAYER 5: Casing rim - harmonized with shell color ===
    const rimGrad = CTX.createLinearGradient(-7, -3.5, -7, 3.5);
    rimGrad.addColorStop(0, shellColorLight);
    rimGrad.addColorStop(0.5, shellColor);
    rimGrad.addColorStop(1, shellColorDark);
    CTX.fillStyle = rimGrad;
    CTX.beginPath();
    CTX.ellipse(-6, 0, 1.8, 3.5, 0, 0, Math.PI * 2);
    CTX.fill();
    CTX.strokeStyle = shellColorDark;
    CTX.lineWidth = 0.5;
    CTX.stroke();
    
    // === LAYER 6: Ogive nose ===
    const noseGrad = CTX.createLinearGradient(5.5, -3, 5.5, 3);
    noseGrad.addColorStop(0, shellColorDark);
    noseGrad.addColorStop(0.5, '#996515');
    noseGrad.addColorStop(1, '#6b4423');
    CTX.fillStyle = noseGrad;
    CTX.beginPath();
    CTX.moveTo(5.5, -3);
    CTX.quadraticCurveTo(10, -1.2, 13, 0);
    CTX.quadraticCurveTo(10, 1.2, 5.5, 3);
    CTX.closePath();
    CTX.fill();
    
    // === LAYER 7: Metallic highlights ===
    CTX.fillStyle = 'rgba(255, 255, 255, 0.55)';
    CTX.beginPath();
    CTX.ellipse(-1, -2.2, 5, 1, -0.1, 0, Math.PI);
    CTX.fill();
    
    CTX.fillStyle = 'rgba(255, 255, 255, 0.75)';
    CTX.beginPath();
    CTX.ellipse(2, -1.8, 1.3, 0.5, 0, 0, Math.PI * 2);
    CTX.fill();
    
    // === LAYER 8: Plasma tip glow ===
    const tipGlow = CTX.createRadialGradient(12, 0, 0, 12, 0, 5);
    tipGlow.addColorStop(0, 'rgba(255, 255, 200, 0.8)');
    tipGlow.addColorStop(0.4, 'rgba(255, 215, 0, 0.4)');
    tipGlow.addColorStop(1, 'rgba(184, 134, 11, 0)');
    CTX.fillStyle = tipGlow;
    CTX.beginPath();
    CTX.arc(12, 0, 5, 0, Math.PI * 2);
    CTX.fill();
    
    // === LAYER 9: Energy ring (pulse effect) ===
    const ringSize = 7 + pulsePhase * 1.5;
    CTX.strokeStyle = 'rgba(255, 215, 0, 0.5)';
    CTX.lineWidth = 1.5;
    CTX.beginPath();
    CTX.ellipse(0, 0, ringSize, ringSize * 0.35, (b.trailClock || 0) * 0.2, 0, Math.PI * 2);
    CTX.stroke();
    
    // === LAYER 10: WIND-CUTTING EFFECT - Air split in front of shell ===
    drawWindCuttingEffect(13, shellColor, 0.8, b.trailClock, fadeAlpha);
    
    CTX.restore();
}

// FLAK CANNON - Artillery shell style with explosive fuse
// Unified bullet design matching enemy tank projectiles
function drawFlakBullet(b, angle, fadeAlpha) {
    CTX.save();
    CTX.translate(b.x, b.y);
    
    // Weapon-themed colors matching brown/bronze turret
    const shellColor = '#a0522d';
    const shellColorDark = '#8B4513';
    const shellColorLight = '#cd853f';
    
    // Explosive water trail
    drawBulletWaterTrail(b, '#a0522d', 22, 6, fadeAlpha);
    
    // Artillery shell shadow matching actual bullet shape
    drawBulletShadow(0, 0, 12, 5, angle, fadeAlpha, 'shell');
    
    CTX.rotate(angle);
    
    const time = typeof frame !== 'undefined' ? frame : Date.now() * 0.06;
    
    // === LAYER 1: Smoke trail ===
    CTX.globalAlpha = fadeAlpha * 0.4;
    for (let i = 1; i <= 5; i++) {
        CTX.fillStyle = `rgba(100, 80, 60, ${0.4 - i * 0.07})`;
        CTX.beginPath();
        CTX.arc(-6 * i, (Math.sin(b.trailClock * 0.3 + i) * 3), 4 + i * 0.5, 0, Math.PI * 2);
        CTX.fill();
    }
    CTX.globalAlpha = fadeAlpha;
    
    // === LAYER 2: Outer aura glow ===
    const auraGlow = CTX.createRadialGradient(0, 0, 0, 0, 0, 16);
    auraGlow.addColorStop(0, 'rgba(205, 133, 63, 0.5)');
    auraGlow.addColorStop(0.4, 'rgba(160, 82, 45, 0.25)');
    auraGlow.addColorStop(0.7, 'rgba(139, 69, 19, 0.1)');
    auraGlow.addColorStop(1, 'rgba(101, 67, 33, 0)');
    CTX.fillStyle = auraGlow;
    CTX.beginPath();
    CTX.arc(0, 0, 16, 0, Math.PI * 2);
    CTX.fill();
    
    // === LAYER 3: Shell body - realistic artillery round shape ===
    const bodyGrad = CTX.createLinearGradient(-10, -5, -10, 5);
    bodyGrad.addColorStop(0, shellColorLight);
    bodyGrad.addColorStop(0.2, '#daa520');
    bodyGrad.addColorStop(0.5, shellColor);
    bodyGrad.addColorStop(0.8, shellColorDark);
    bodyGrad.addColorStop(1, '#654321');
    
    CTX.fillStyle = bodyGrad;
    CTX.beginPath();
    // Rounded rectangle for shell body
    CTX.moveTo(-7, -5);
    CTX.lineTo(3, -5);
    CTX.quadraticCurveTo(7, -5, 7, 0);
    CTX.quadraticCurveTo(7, 5, 3, 5);
    CTX.lineTo(-7, 5);
    CTX.quadraticCurveTo(-10, 5, -10, 0);
    CTX.quadraticCurveTo(-10, -5, -7, -5);
    CTX.closePath();
    CTX.fill();
    
    // Shell casing rim - harmonized with shell color
    const rimGrad = CTX.createLinearGradient(-9, -5, -9, 5);
    rimGrad.addColorStop(0, shellColorLight);
    rimGrad.addColorStop(0.3, shellColor);
    rimGrad.addColorStop(0.7, shellColorDark);
    rimGrad.addColorStop(1, '#654321');
    CTX.fillStyle = rimGrad;
    CTX.beginPath();
    CTX.ellipse(-9, 0, 2.5, 5, 0, 0, Math.PI * 2);
    CTX.fill();
    CTX.strokeStyle = shellColorDark;
    CTX.lineWidth = 0.6;
    CTX.stroke();
    
    // === LAYER 4: Fuse tip (glowing explosive nose) ===
    const fuseGlow = Math.sin(b.trailClock * 0.5) * 0.5 + 0.5;
    
    // Nose shape with glowing fuse
    const noseGrad = CTX.createLinearGradient(7, -4, 7, 4);
    noseGrad.addColorStop(0, `rgba(255, ${100 + fuseGlow * 100}, 0, 1)`);
    noseGrad.addColorStop(0.5, `rgba(255, ${150 + fuseGlow * 50}, 50, 1)`);
    noseGrad.addColorStop(1, '#ff4500');
    CTX.fillStyle = noseGrad;
    CTX.beginPath();
    CTX.moveTo(7, -4);
    CTX.quadraticCurveTo(11, -2, 14, 0);
    CTX.quadraticCurveTo(11, 2, 7, 4);
    CTX.closePath();
    CTX.fill();
    
    // Fuse spark glow
    const sparkGlow = CTX.createRadialGradient(13, 0, 0, 13, 0, 5);
    sparkGlow.addColorStop(0, `rgba(255, 255, 200, ${0.8 + fuseGlow * 0.2})`);
    sparkGlow.addColorStop(0.4, `rgba(255, ${180 + fuseGlow * 75}, 0, 0.6)`);
    sparkGlow.addColorStop(1, 'rgba(255, 100, 0, 0)');
    CTX.fillStyle = sparkGlow;
    CTX.beginPath();
    CTX.arc(13, 0, 5, 0, Math.PI * 2);
    CTX.fill();
    
    // White hot spark at tip
    CTX.fillStyle = `rgba(255, 255, 255, ${fuseGlow})`;
    CTX.beginPath();
    CTX.arc(14, 0, 2, 0, Math.PI * 2);
    CTX.fill();
    
    // === LAYER 5: Driving band - harmonized with shell color ===
    const bandGrad = CTX.createLinearGradient(-2, -5, -2, 5);
    bandGrad.addColorStop(0, shellColorLight);
    bandGrad.addColorStop(0.5, shellColor);
    bandGrad.addColorStop(1, shellColorDark);
    CTX.fillStyle = bandGrad;
    CTX.beginPath();
    CTX.ellipse(-2, 0, 2, 5.2, 0, 0, Math.PI * 2);
    CTX.fill();
    CTX.strokeStyle = shellColorDark;
    CTX.lineWidth = 0.5;
    CTX.stroke();
    
    // === LAYER 6: Metallic shine highlights ===
    CTX.fillStyle = 'rgba(255, 255, 255, 0.35)';
    CTX.beginPath();
    CTX.ellipse(-2, -2.8, 7, 1.2, -0.1, 0, Math.PI);
    CTX.fill();
    
    CTX.fillStyle = 'rgba(255, 255, 255, 0.5)';
    CTX.beginPath();
    CTX.ellipse(1, -2.5, 1.5, 0.6, 0, 0, Math.PI * 2);
    CTX.fill();
    
    // === LAYER 7: Band decoration mark ===
    CTX.strokeStyle = '#444';
    CTX.lineWidth = 1.5;
    CTX.beginPath();
    CTX.arc(0, 0, 4.5, Math.PI * 0.6, Math.PI * 1.4);
    CTX.stroke();
    
    // === LAYER 8: WIND-CUTTING EFFECT - Air split in front of shell ===
    drawWindCuttingEffect(14, shellColor, 0.9, b.trailClock, fadeAlpha);
    
    CTX.restore();
}

// ROCKET LAUNCHER - Missiles with exhaust flames
function drawRocketBullet(b, angle, fadeAlpha) {
    CTX.save();
    CTX.translate(b.x, b.y);
    
    // Rocket exhaust water trail
    drawBulletWaterTrail(b, '#ff1a1a', 35, 7, fadeAlpha);
    
    // Elongated missile shadow
    drawBulletShadow(0, 0, 14, 6, angle, fadeAlpha);
    
    CTX.rotate(angle);
    
    // Exhaust flame trail
    CTX.globalAlpha = fadeAlpha * 0.8;
    for (let i = 0; i < 6; i++) {
        const flameX = -12 - i * 8;
        const flameSize = 6 - i * 0.8;
        const flameY = Math.sin(b.trailClock * 0.5 + i) * 3;
        
        // Outer flame
        CTX.fillStyle = i < 2 ? '#ff6600' : (i < 4 ? '#ff4400' : '#ff2200');
        CTX.beginPath();
        CTX.ellipse(flameX, flameY, flameSize * 1.5, flameSize, 0, 0, Math.PI * 2);
        CTX.fill();
    }
    
    // Inner flame core
    CTX.fillStyle = '#ffcc00';
    CTX.beginPath();
    CTX.ellipse(-10, 0, 8, 4, 0, 0, Math.PI * 2);
    CTX.fill();
    CTX.fillStyle = '#fff';
    CTX.beginPath();
    CTX.ellipse(-8, 0, 4, 2, 0, 0, Math.PI * 2);
    CTX.fill();
    CTX.globalAlpha = fadeAlpha;
    
    // Rocket body
    const bodyGrad = CTX.createLinearGradient(0, -5, 0, 5);
    bodyGrad.addColorStop(0, '#cc2222');
    bodyGrad.addColorStop(0.5, '#ff1a1a');
    bodyGrad.addColorStop(1, '#aa1111');
    CTX.fillStyle = bodyGrad;
    CTX.beginPath();
    CTX.moveTo(-8, -5);
    CTX.lineTo(12, -3);
    CTX.lineTo(18, 0);
    CTX.lineTo(12, 3);
    CTX.lineTo(-8, 5);
    CTX.closePath();
    CTX.fill();
    
    // Fins
    CTX.fillStyle = '#880000';
    CTX.beginPath();
    CTX.moveTo(-8, -5);
    CTX.lineTo(-12, -10);
    CTX.lineTo(-4, -5);
    CTX.closePath();
    CTX.fill();
    CTX.beginPath();
    CTX.moveTo(-8, 5);
    CTX.lineTo(-12, 10);
    CTX.lineTo(-4, 5);
    CTX.closePath();
    CTX.fill();
    
    // Warning stripe
    CTX.fillStyle = '#ffcc00';
    CTX.fillRect(0, -4, 3, 8);
    
    // Warhead tip
    CTX.fillStyle = '#444';
    CTX.beginPath();
    CTX.moveTo(12, -3);
    CTX.lineTo(20, 0);
    CTX.lineTo(12, 3);
    CTX.closePath();
    CTX.fill();
    
    CTX.restore();
}

// PLASMA BEAM - Rapid plasma bolts with smooth gradient tip
function drawPlasmaBullet(b, angle, fadeAlpha) {
    CTX.save();
    CTX.translate(b.x, b.y);
    
    // Plasma water trail
    drawBulletWaterTrail(b, '#00e5ff', 28, 5, fadeAlpha);
    
    // Circular plasma orb shadow
    drawBulletShadow(0, 0, 10, 10, angle, fadeAlpha);
    
    CTX.rotate(angle);
    
    // === REAR TRAIL with smooth gradient opacity fade ===
    const trailLength = 45;
    const trailGrad = CTX.createLinearGradient(-trailLength, 0, 0, 0);
    trailGrad.addColorStop(0, 'rgba(0, 229, 255, 0)');      // Fully transparent at end
    trailGrad.addColorStop(0.2, 'rgba(0, 229, 255, 0.15)'); // Very subtle
    trailGrad.addColorStop(0.5, 'rgba(0, 229, 255, 0.4)');  // Mid opacity
    trailGrad.addColorStop(0.8, 'rgba(0, 229, 255, 0.7)');  // Building up
    trailGrad.addColorStop(1, 'rgba(0, 229, 255, 0.9)');    // Near core
    CTX.strokeStyle = trailGrad;
    CTX.lineWidth = 5;
    CTX.lineCap = 'round';
    CTX.beginPath();
    CTX.moveTo(-trailLength, 0);
    CTX.lineTo(0, 0);
    CTX.stroke();
    
    // === FRONT TIP with smooth gradient opacity fade ===
    const tipLength = 18;
    const tipGrad = CTX.createLinearGradient(0, 0, tipLength, 0);
    tipGrad.addColorStop(0, 'rgba(0, 229, 255, 0.9)');      // Bright at core
    tipGrad.addColorStop(0.3, 'rgba(0, 229, 255, 0.6)');    // Fading
    tipGrad.addColorStop(0.6, 'rgba(0, 229, 255, 0.3)');    // More fade
    tipGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');        // Fully transparent
    CTX.strokeStyle = tipGrad;
    CTX.lineWidth = 4;
    CTX.beginPath();
    CTX.moveTo(0, 0);
    CTX.lineTo(tipLength, 0);
    CTX.stroke();
    
    // Core plasma glow
    const plasmaGlow = CTX.createRadialGradient(0, 0, 0, 0, 0, 14);
    plasmaGlow.addColorStop(0, 'rgba(255, 255, 255, 1)');
    plasmaGlow.addColorStop(0.25, 'rgba(200, 255, 255, 0.95)');
    plasmaGlow.addColorStop(0.5, 'rgba(0, 229, 255, 0.7)');
    plasmaGlow.addColorStop(0.75, 'rgba(0, 180, 220, 0.35)');
    plasmaGlow.addColorStop(1, 'rgba(0, 229, 255, 0)');
    CTX.fillStyle = plasmaGlow;
    CTX.beginPath();
    CTX.arc(0, 0, 14, 0, Math.PI * 2);
    CTX.fill();
    
    // Electric rings
    CTX.strokeStyle = '#00e5ff';
    CTX.lineWidth = 1;
    const ringPhase = b.trailClock * 0.3;
    for (let i = 0; i < 3; i++) {
        const ringSize = 4 + (ringPhase + i * 2) % 8;
        CTX.globalAlpha = fadeAlpha * (1 - ringSize / 12);
        CTX.beginPath();
        CTX.arc(0, 0, ringSize, 0, Math.PI * 2);
        CTX.stroke();
    }
    CTX.globalAlpha = fadeAlpha;
    
    // Core
    CTX.fillStyle = '#fff';
    CTX.beginPath();
    CTX.arc(0, 0, 4, 0, Math.PI * 2);
    CTX.fill();
    
    CTX.restore();
}

// GAUSS RIFLE - Electromagnetic hypersonic penetrator with dramatic magnetic field
function drawGaussBullet(b, angle, fadeAlpha, speed) {
    CTX.save();
    CTX.translate(b.x, b.y);
    
    const time = typeof frame !== 'undefined' ? frame : Date.now() * 0.06;
    
    // Gauss colors - purple/violet electromagnetic
    const shellColor = '#8b5cf6';
    const shellColorDark = '#6d28d9';
    const shellColorLight = '#c4b5fd';
    
    // Magnetic field water trail
    drawBulletWaterTrail(b, shellColor, 50, 5, fadeAlpha);
    
    // Elongated magnetic slug shadow
    drawBulletShadow(0, 0, 18, 5, angle, fadeAlpha);
    
    CTX.rotate(angle);
    
    // Magnetic field distortion rings - electromagnetic coil effect
    CTX.lineWidth = 2;
    for (let i = 1; i <= 5; i++) {
        const distort = Math.sin(b.trailClock * 0.4 + i) * 2;
        const ringAlpha = 0.5 - i * 0.08;
        CTX.globalAlpha = fadeAlpha * ringAlpha;
        CTX.strokeStyle = i % 2 === 0 ? shellColorLight : shellColor;
        CTX.beginPath();
        CTX.ellipse(-14 * i, 0, 4, 9 + distort, 0, 0, Math.PI * 2);
        CTX.stroke();
    }
    CTX.globalAlpha = fadeAlpha;
    
    // Energy trail - ionized electromagnetic path
    const trailGrad = CTX.createLinearGradient(-70, 0, 0, 0);
    trailGrad.addColorStop(0, 'rgba(139, 92, 246, 0)');
    trailGrad.addColorStop(0.3, 'rgba(139, 92, 246, 0.3)');
    trailGrad.addColorStop(0.6, 'rgba(167, 139, 250, 0.6)');
    trailGrad.addColorStop(1, 'rgba(196, 181, 253, 0.9)');
    CTX.strokeStyle = trailGrad;
    CTX.lineWidth = 5;
    CTX.beginPath();
    CTX.moveTo(-70, 0);
    CTX.lineTo(0, 0);
    CTX.stroke();
    
    // === LAYER: Magnetic railgun projectile body ===
    const bodyGrad = CTX.createLinearGradient(-14, -4, -14, 4);
    bodyGrad.addColorStop(0, '#e0e0e0');
    bodyGrad.addColorStop(0.2, '#c0c0c0');
    bodyGrad.addColorStop(0.4, shellColor);
    bodyGrad.addColorStop(0.6, shellColorDark);
    bodyGrad.addColorStop(0.8, '#c0c0c0');
    bodyGrad.addColorStop(1, '#909090');
    
    CTX.fillStyle = bodyGrad;
    CTX.beginPath();
    // Sleek railgun slug shape
    CTX.moveTo(-14, -3.5);
    CTX.lineTo(6, -3);
    CTX.quadraticCurveTo(14, -1.5, 20, 0);
    CTX.quadraticCurveTo(14, 1.5, 6, 3);
    CTX.lineTo(-14, 3.5);
    CTX.quadraticCurveTo(-18, 3.5, -18, 0);
    CTX.quadraticCurveTo(-18, -3.5, -14, -3.5);
    CTX.closePath();
    CTX.fill();
    
    // Magnetic coil segments on slug body
    CTX.strokeStyle = shellColor;
    CTX.lineWidth = 1.5;
    CTX.globalAlpha = fadeAlpha * (0.6 + Math.sin(time * 0.3) * 0.2);
    for (let i = 0; i < 4; i++) {
        const coilX = -10 + i * 5;
        CTX.beginPath();
        CTX.ellipse(coilX, 0, 1.5, 3.5, 0, 0, Math.PI * 2);
        CTX.stroke();
    }
    CTX.globalAlpha = fadeAlpha;
    
    // Electromagnetic energy aura
    const auraGlow = CTX.createRadialGradient(0, 0, 0, 0, 0, 18);
    auraGlow.addColorStop(0, 'rgba(196, 181, 253, 0.5)');
    auraGlow.addColorStop(0.5, 'rgba(139, 92, 246, 0.25)');
    auraGlow.addColorStop(1, 'rgba(109, 40, 217, 0)');
    CTX.fillStyle = auraGlow;
    CTX.beginPath();
    CTX.arc(0, 0, 18, 0, Math.PI * 2);
    CTX.fill();
    
    // Tip with electromagnetic charge
    const tipGrad = CTX.createLinearGradient(16, -2, 16, 2);
    tipGrad.addColorStop(0, shellColorLight);
    tipGrad.addColorStop(0.5, '#ffffff');
    tipGrad.addColorStop(1, shellColor);
    CTX.fillStyle = tipGrad;
    CTX.beginPath();
    CTX.moveTo(16, -2.5);
    CTX.lineTo(24, 0);
    CTX.lineTo(16, 2.5);
    CTX.closePath();
    CTX.fill();
    
    // Metallic shine highlight
    CTX.fillStyle = 'rgba(255, 255, 255, 0.5)';
    CTX.beginPath();
    CTX.ellipse(-2, -2.2, 10, 1, -0.05, 0, Math.PI);
    CTX.fill();
    
    // Bright electromagnetic tip glow
    const tipGlow = CTX.createRadialGradient(22, 0, 0, 22, 0, 7);
    tipGlow.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    tipGlow.addColorStop(0.3, 'rgba(196, 181, 253, 0.7)');
    tipGlow.addColorStop(0.6, 'rgba(139, 92, 246, 0.4)');
    tipGlow.addColorStop(1, 'rgba(109, 40, 217, 0)');
    CTX.fillStyle = tipGlow;
    CTX.beginPath();
    CTX.arc(22, 0, 7, 0, Math.PI * 2);
    CTX.fill();
    
    // Electric arcs from slug (random lightning effect)
    CTX.strokeStyle = shellColorLight;
    CTX.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
        CTX.globalAlpha = fadeAlpha * (0.4 + Math.random() * 0.4);
        const arcAngle = (Math.random() - 0.5) * Math.PI;
        const arcLen = 8 + Math.random() * 6;
        CTX.beginPath();
        CTX.moveTo(0, 0);
        CTX.lineTo(
            Math.cos(arcAngle) * arcLen + (Math.random() - 0.5) * 4,
            Math.sin(arcAngle) * arcLen
        );
        CTX.stroke();
    }
    CTX.globalAlpha = fadeAlpha;
    
    CTX.restore();
}

// ICE/FROST CANNON - Ice shards with frost trail
function drawIceBullet(b, angle, fadeAlpha) {
    CTX.save();
    CTX.translate(b.x, b.y);
    
    // Frozen mist water trail
    drawBulletWaterTrail(b, '#3b82f6', 25, 6, fadeAlpha);
    
    // Diamond ice shard shadow
    drawBulletShadow(0, 0, 11, 7, angle, fadeAlpha);
    
    CTX.rotate(angle);
    
    // Frost particle trail
    if (b.trailClock % 2 === 0) {
        particles.push({
            x: b.x - Math.cos(angle) * 10,
            y: b.y - Math.sin(angle) * 10,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            life: 20 + Math.random() * 15,
            color: Math.random() > 0.5 ? '#3b82f6' : '#93c5fd',
            size: Math.random() * 3 + 1
        });
    }
    
    // Frost mist trail
    CTX.globalAlpha = fadeAlpha * 0.4;
    for (let i = 1; i <= 4; i++) {
        const mistGrad = CTX.createRadialGradient(-10 * i, 0, 0, -10 * i, 0, 8);
        mistGrad.addColorStop(0, 'rgba(147, 197, 253, 0.4)');
        mistGrad.addColorStop(1, 'rgba(59, 130, 246, 0)');
        CTX.fillStyle = mistGrad;
        CTX.beginPath();
        CTX.arc(-10 * i, Math.sin(b.trailClock * 0.3 + i) * 3, 8, 0, Math.PI * 2);
        CTX.fill();
    }
    CTX.globalAlpha = fadeAlpha;
    
    // Ice crystal glow
    const iceGlow = CTX.createRadialGradient(0, 0, 0, 0, 0, 15);
    iceGlow.addColorStop(0, 'rgba(147, 197, 253, 0.6)');
    iceGlow.addColorStop(1, 'rgba(59, 130, 246, 0)');
    CTX.fillStyle = iceGlow;
    CTX.beginPath();
    CTX.arc(0, 0, 15, 0, Math.PI * 2);
    CTX.fill();
    
    // Main ice shard - crystalline shape
    CTX.fillStyle = '#60a5fa';
    CTX.beginPath();
    CTX.moveTo(-8, 0);
    CTX.lineTo(-4, -6);
    CTX.lineTo(10, -3);
    CTX.lineTo(16, 0);
    CTX.lineTo(10, 3);
    CTX.lineTo(-4, 6);
    CTX.closePath();
    CTX.fill();
    
    // Inner crystal layer
    CTX.fillStyle = '#93c5fd';
    CTX.beginPath();
    CTX.moveTo(-4, 0);
    CTX.lineTo(0, -3);
    CTX.lineTo(8, -1);
    CTX.lineTo(12, 0);
    CTX.lineTo(8, 1);
    CTX.lineTo(0, 3);
    CTX.closePath();
    CTX.fill();
    
    // Core highlight
    CTX.fillStyle = 'rgba(255, 255, 255, 0.7)';
    CTX.beginPath();
    CTX.moveTo(0, 0);
    CTX.lineTo(2, -2);
    CTX.lineTo(6, 0);
    CTX.lineTo(2, 2);
    CTX.closePath();
    CTX.fill();
    
    // Sparkle effects
    CTX.fillStyle = '#fff';
    for (let i = 0; i < 3; i++) {
        const sparkX = Math.cos(b.trailClock * 0.2 + i * 2) * 10;
        const sparkY = Math.sin(b.trailClock * 0.2 + i * 2) * 6;
        CTX.globalAlpha = fadeAlpha * (0.5 + Math.sin(b.trailClock * 0.4 + i) * 0.3);
        CTX.beginPath();
        CTX.arc(sparkX, sparkY, 1.5, 0, Math.PI * 2);
        CTX.fill();
    }
    
    CTX.restore();
}

// FIRE/INFERNO GUN - Dramatic teardrop fireball with realistic flame tail
function drawFireBullet(b, angle, fadeAlpha) {
    CTX.save();
    CTX.translate(b.x, b.y);
    
    const time = typeof frame !== 'undefined' ? frame : Date.now() * 0.06;
    
    // Fire colors - enhanced gradients
    const fireColor = '#ff4500';
    const fireColorLight = '#ffcc00';
    const fireColorDark = '#cc3300';
    const fireColorWhite = '#fffef0';
    
    // Scale factor based on bullet size (if available)
    const scale = b.size ? b.size / 8 : 1;
    
    // Teardrop flame water trail
    drawBulletWaterTrail(b, fireColor, 40 * scale, 10 * scale, fadeAlpha);
    
    // Teardrop-shaped shadow
    drawBulletShadow(0, 0, 16 * scale, 12 * scale, angle, fadeAlpha);
    
    CTX.rotate(angle);
    
    // Ember particle trail - dramatic sparks
    if (b.trailClock % 2 === 0) {
        const sparkCount = Math.floor(2 + Math.random() * 2);
        for (let s = 0; s < sparkCount; s++) {
            const sparkOffset = (Math.random() - 0.5) * 8;
            particles.push({
                x: b.x - Math.cos(angle) * (12 + s * 5),
                y: b.y - Math.sin(angle) * (12 + s * 5) + sparkOffset,
                vx: (Math.random() - 0.5) * 4 - Math.cos(angle) * 2,
                vy: -Math.random() * 3 - 1,
                life: 18 + Math.random() * 12,
                maxLife: 30,
                color: s === 0 ? fireColorLight : (Math.random() > 0.5 ? fireColor : '#ff6b35'),
                size: Math.random() * 4 + 2,
                particleId: ++particleIdCounter
            });
        }
    }
    
    // === ENHANCED TEARDROP TAIL - Dramatic comet flame shape ===
    // Outer heat distortion/smoke trail
    CTX.globalAlpha = fadeAlpha * 0.4;
    for (let i = 1; i <= 7; i++) {
        const tailX = -9 * i * scale;
        const flicker = Math.sin(time * 0.25 + i * 0.8) * (i * 0.6);
        const tailY = flicker;
        const tailSize = (14 - i * 1.4) * scale;
        
        const smokeGrad = CTX.createRadialGradient(tailX, tailY, 0, tailX, tailY, tailSize);
        smokeGrad.addColorStop(0, 'rgba(120, 90, 50, 0.6)');
        smokeGrad.addColorStop(0.4, 'rgba(90, 60, 30, 0.35)');
        smokeGrad.addColorStop(0.7, 'rgba(60, 40, 20, 0.15)');
        smokeGrad.addColorStop(1, 'rgba(40, 30, 15, 0)');
        CTX.fillStyle = smokeGrad;
        CTX.beginPath();
        CTX.arc(tailX, tailY, tailSize, 0, Math.PI * 2);
        CTX.fill();
    }
    
    // Main fire teardrop body - beautiful bezier curves
    CTX.globalAlpha = fadeAlpha;
    const tailLen = 55 * scale;
    const headR = 12 * scale;
    
    // Outer flame gradient
    const teardropGrad = CTX.createLinearGradient(-tailLen, 0, headR, 0);
    teardropGrad.addColorStop(0, 'rgba(255, 69, 0, 0)');
    teardropGrad.addColorStop(0.15, 'rgba(255, 80, 0, 0.2)');
    teardropGrad.addColorStop(0.35, 'rgba(255, 120, 0, 0.5)');
    teardropGrad.addColorStop(0.55, 'rgba(255, 170, 0, 0.75)');
    teardropGrad.addColorStop(0.75, 'rgba(255, 220, 100, 0.9)');
    teardropGrad.addColorStop(0.9, 'rgba(255, 245, 180, 0.95)');
    teardropGrad.addColorStop(1, fireColorWhite);
    
    // Draw elegant teardrop with smooth bezier curves
    CTX.fillStyle = teardropGrad;
    CTX.beginPath();
    CTX.moveTo(-tailLen, 0); // Sharp tail point
    // Top curve - elegant sweep from tail to head
    CTX.bezierCurveTo(
        -tailLen * 0.6, -6 * scale,   // Control 1: gentle outward curve
        -headR * 2, -headR * 0.9,      // Control 2: approach head width
        -headR * 0.3, -headR * 0.95    // End: top of head
    );
    // Head arc
    CTX.arc(0, 0, headR, -Math.PI * 0.52, Math.PI * 0.52, false);
    // Bottom curve - mirror of top
    CTX.bezierCurveTo(
        -headR * 2, headR * 0.9,
        -tailLen * 0.6, 6 * scale,
        -tailLen, 0
    );
    CTX.closePath();
    CTX.fill();
    
    // Inner flame tongues - dancing fire effect
    for (let i = 1; i <= 5; i++) {
        const flickerX = (-12 - i * 7) * scale;
        const flickerY = Math.sin(time * 0.5 + i * 1.2) * (4 - i * 0.6) * scale;
        const flickerSize = (9 - i * 1.2) * scale;
        CTX.globalAlpha = fadeAlpha * (0.85 - i * 0.13);
        
        const flickerGrad = CTX.createRadialGradient(flickerX, flickerY, 0, flickerX, flickerY, flickerSize);
        flickerGrad.addColorStop(0, fireColorWhite);
        flickerGrad.addColorStop(0.25, fireColorLight);
        flickerGrad.addColorStop(0.5, '#ff8c00');
        flickerGrad.addColorStop(0.75, fireColor);
        flickerGrad.addColorStop(1, 'rgba(255, 69, 0, 0)');
        CTX.fillStyle = flickerGrad;
        CTX.beginPath();
        CTX.arc(flickerX, flickerY, flickerSize, 0, Math.PI * 2);
        CTX.fill();
    }
    CTX.globalAlpha = fadeAlpha;
    
    // Main fireball head - intense glow
    const fireGlow = CTX.createRadialGradient(0, 0, 0, 0, 0, 18 * scale);
    fireGlow.addColorStop(0, 'rgba(255, 255, 240, 0.98)');
    fireGlow.addColorStop(0.2, 'rgba(255, 230, 150, 0.9)');
    fireGlow.addColorStop(0.4, 'rgba(255, 180, 50, 0.75)');
    fireGlow.addColorStop(0.6, 'rgba(255, 120, 0, 0.5)');
    fireGlow.addColorStop(0.8, 'rgba(255, 69, 0, 0.25)');
    fireGlow.addColorStop(1, 'rgba(200, 50, 0, 0)');
    CTX.fillStyle = fireGlow;
    CTX.beginPath();
    CTX.arc(0, 0, 18 * scale, 0, Math.PI * 2);
    CTX.fill();
    
    // Dynamic flame tongues around core
    CTX.fillStyle = fireColor;
    CTX.beginPath();
    for (let i = 0; i < 10; i++) {
        const tongueAngle = (Math.PI * 2 / 10) * i + time * 0.08;
        const tongueLen = (8 + Math.sin(time * 0.3 + i * 2.5) * 3) * scale;
        const tx = Math.cos(tongueAngle) * tongueLen;
        const ty = Math.sin(tongueAngle) * tongueLen;
        if (i === 0) CTX.moveTo(tx, ty);
        else CTX.lineTo(tx, ty);
    }
    CTX.closePath();
    CTX.fill();
    
    // Hot white-yellow core
    const coreGrad = CTX.createRadialGradient(0, 0, 0, 0, 0, 6 * scale);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.3, fireColorWhite);
    coreGrad.addColorStop(0.6, fireColorLight);
    coreGrad.addColorStop(1, '#ff8c00');
    CTX.fillStyle = coreGrad;
    CTX.beginPath();
    CTX.arc(0, 0, 6 * scale, 0, Math.PI * 2);
    CTX.fill();
    
    CTX.restore();
}

// ELECTRIC/TESLA RIFLE - Dramatic plasma teardrop with lightning discharge
function drawElectricBullet(b, angle, fadeAlpha) {
    CTX.save();
    CTX.translate(b.x, b.y);
    
    const time = b.trailClock || 0;
    
    // Electric colors - vivid purple to yellow plasma spectrum
    const electricPurple = '#a855f7';
    const electricViolet = '#c084fc';
    const electricYellow = '#ffeb3b';
    const electricWhite = '#f5f0ff';
    const plasmaBlue = '#60a5fa';
    const plasmaCyan = '#22d3ee';
    
    // Scale factor based on bullet size
    const scale = b.size ? b.size / 8 : 1;
    
    // Teardrop dimensions - enhanced for dramatic effect
    const headRadius = 10 * scale;
    const tailLength = 48 * scale;
    const bodyLength = 24 * scale;
    
    // Plasma teardrop shadow - skip at low shadow quality
    const shadowQuality = getShadowQuality();
    if (shadowQuality >= 0.3) {
        CTX.save();
        CTX.rotate(angle);
        const shadowDist = 7;
        const shadowAngle = Math.PI / 4;
        CTX.translate(Math.cos(shadowAngle) * shadowDist, Math.sin(shadowAngle) * shadowDist);
        CTX.fillStyle = `rgba(0, 0, 0, ${0.4 * shadowQuality})`;
        if (shadowQuality >= 0.7) {
            CTX.filter = 'blur(4px)';
        } else if (shadowQuality >= 0.5) {
            CTX.filter = 'blur(2px)';
        }
        
        // Shadow teardrop shape - elegant curve
        CTX.beginPath();
        CTX.moveTo(-tailLength, 0);
        CTX.bezierCurveTo(
            -tailLength * 0.65, -5 * scale,
            -bodyLength, -headRadius * 0.85,
            -headRadius * 0.25, -headRadius * 0.92
        );
        CTX.arc(0, 0, headRadius, -Math.PI * 0.58, Math.PI * 0.58, false);
        CTX.bezierCurveTo(
            -headRadius * 0.25, headRadius * 0.92,
            -bodyLength, headRadius * 0.85,
            -tailLength, 0
        );
        CTX.closePath();
        CTX.fill();
        CTX.filter = 'none';
        CTX.restore();
    }
    
    CTX.rotate(angle);
    
    // Electric spark particle trail - more dramatic
    if (time % 2 === 0) {
        for (let i = 0; i < 4; i++) {
            const spawnDist = 18 + i * 8 + Math.random() * 10;
            const spawnX = b.x - Math.cos(angle) * spawnDist;
            const spawnY = b.y - Math.sin(angle) * spawnDist;
            particles.push({
                x: spawnX + (Math.random() - 0.5) * 10,
                y: spawnY + (Math.random() - 0.5) * 10,
                vx: (Math.random() - 0.5) * 5 - Math.cos(angle) * 1.5,
                vy: (Math.random() - 0.5) * 5,
                life: 10 + Math.random() * 12,
                maxLife: 22,
                color: i < 2 ? electricYellow : (Math.random() > 0.5 ? electricViolet : plasmaCyan),
                size: Math.random() * 3 + 1.5,
                particleId: ++particleIdCounter
            });
        }
    }
    
    // Outer electric field glow - pulsating
    const pulseGlow = 0.9 + Math.sin(time * 0.15) * 0.1;
    const fieldGlow = CTX.createRadialGradient(0, 0, 0, 0, 0, 34 * scale);
    fieldGlow.addColorStop(0, `rgba(168, 85, 247, ${0.45 * fadeAlpha * pulseGlow})`);
    fieldGlow.addColorStop(0.3, `rgba(96, 165, 250, ${0.3 * fadeAlpha * pulseGlow})`);
    fieldGlow.addColorStop(0.5, `rgba(34, 211, 238, ${0.2 * fadeAlpha * pulseGlow})`);
    fieldGlow.addColorStop(0.75, `rgba(255, 235, 59, ${0.1 * fadeAlpha})`);
    fieldGlow.addColorStop(1, 'rgba(168, 85, 247, 0)');
    CTX.fillStyle = fieldGlow;
    CTX.beginPath();
    CTX.arc(0, 0, 34 * scale, 0, Math.PI * 2);
    CTX.fill();
    
    // Lightning tendrils extending from tail - more dramatic zigzag
    CTX.globalAlpha = fadeAlpha * 0.85;
    for (let i = 0; i < 6; i++) {
        const startX = -tailLength + 8 + i * 6;
        const tendrilAngle = (Math.random() - 0.5) * Math.PI * 0.9;
        const tendrilLen = 10 + Math.random() * 12;
        
        // Alternate colors for visual interest
        CTX.strokeStyle = i % 2 === 0 ? electricYellow : plasmaCyan;
        CTX.lineWidth = 1.5 + Math.random() * 0.5;
        
        CTX.beginPath();
        CTX.moveTo(startX, 0);
        
        // Enhanced zigzag lightning path
        let cx = startX, cy = 0;
        const segs = 4;
        for (let s = 1; s <= segs; s++) {
            const t = s / segs;
            const nx = startX + Math.cos(tendrilAngle) * tendrilLen * t;
            const ny = Math.sin(tendrilAngle) * tendrilLen * t;
            cx += (nx - cx) * 0.6 + (Math.random() - 0.5) * 5;
            cy += (ny - cy) * 0.6 + (Math.random() - 0.5) * 5;
            CTX.lineTo(cx, cy);
        }
        CTX.stroke();
    }
    CTX.globalAlpha = fadeAlpha;
    
    // Main teardrop body - plasma envelope with elegant bezier
    const outerGrad = CTX.createLinearGradient(-tailLength, 0, headRadius, 0);
    outerGrad.addColorStop(0, 'rgba(168, 85, 247, 0)');
    outerGrad.addColorStop(0.2, 'rgba(168, 85, 247, 0.25)');
    outerGrad.addColorStop(0.4, 'rgba(96, 165, 250, 0.55)');
    outerGrad.addColorStop(0.6, electricPurple);
    outerGrad.addColorStop(0.8, electricViolet);
    outerGrad.addColorStop(1, electricWhite);
    
    CTX.fillStyle = outerGrad;
    CTX.beginPath();
    CTX.moveTo(-tailLength, 0); // Sharp tail point
    // Top curve - smooth elegant bezier
    CTX.bezierCurveTo(
        -tailLength * 0.65, -6 * scale,
        -bodyLength, -headRadius * 0.9,
        -headRadius * 0.25, -headRadius * 0.95
    );
    // Head arc
    CTX.arc(0, 0, headRadius, -Math.PI * 0.55, Math.PI * 0.55, false);
    // Bottom curve - mirror
    CTX.bezierCurveTo(
        -headRadius * 0.25, headRadius * 0.95,
        -bodyLength, headRadius * 0.9,
        -tailLength, 0
    );
    CTX.closePath();
    CTX.fill();
    
    // Animated plasma swirls inside teardrop
    CTX.save();
    CTX.beginPath();
    CTX.moveTo(-tailLength, 0);
    CTX.bezierCurveTo(-tailLength * 0.65, -6 * scale, -bodyLength, -headRadius * 0.9, -headRadius * 0.25, -headRadius * 0.95);
    CTX.arc(0, 0, headRadius, -Math.PI * 0.55, Math.PI * 0.55, false);
    CTX.bezierCurveTo(-headRadius * 0.25, headRadius * 0.95, -bodyLength, headRadius * 0.9, -tailLength, 0);
    CTX.closePath();
    CTX.clip();
    
    // Swirling plasma currents - more dynamic
    for (let i = 0; i < 5; i++) {
        const swirl = time * 0.12 + i * Math.PI * 0.4;
        const swirlX = Math.cos(swirl) * 6 - 8;
        const swirlY = Math.sin(swirl) * 5;
        
        CTX.strokeStyle = i % 2 === 0 ? electricYellow : (i % 3 === 0 ? plasmaCyan : plasmaBlue);
        CTX.lineWidth = 2.5;
        CTX.globalAlpha = fadeAlpha * (0.5 + Math.sin(time * 0.18 + i) * 0.25);
        
        CTX.beginPath();
        CTX.moveTo(swirlX - 10, swirlY);
        CTX.bezierCurveTo(
            swirlX - 4, swirlY + (i % 2 ? 5 : -5),
            swirlX + 4, swirlY + (i % 2 ? -4 : 4),
            swirlX + 10, swirlY
        );
        CTX.stroke();
    }
    CTX.globalAlpha = fadeAlpha;
    CTX.restore();
    
    // Inner plasma layer - brighter core trail
    const innerGrad = CTX.createLinearGradient(-tailLength * 0.55, 0, headRadius * 0.75, 0);
    innerGrad.addColorStop(0, 'rgba(96, 165, 250, 0.2)');
    innerGrad.addColorStop(0.3, 'rgba(34, 211, 238, 0.5)');
    innerGrad.addColorStop(0.5, plasmaBlue);
    innerGrad.addColorStop(0.7, electricViolet);
    innerGrad.addColorStop(1, electricWhite);
    
    CTX.fillStyle = innerGrad;
    CTX.beginPath();
    CTX.moveTo(-tailLength * 0.6, 0);
    CTX.bezierCurveTo(
        -tailLength * 0.4, -4 * scale,
        -bodyLength * 0.55, -headRadius * 0.6,
        -headRadius * 0.15, -headRadius * 0.7
    );
    CTX.arc(0, 0, headRadius * 0.75, -Math.PI * 0.52, Math.PI * 0.52, false);
    CTX.bezierCurveTo(
        -headRadius * 0.15, headRadius * 0.7,
        -bodyLength * 0.55, headRadius * 0.6,
        -tailLength * 0.6, 0
    );
    CTX.closePath();
    CTX.fill();
    
    // Pulsating energy rings around head
    const pulsePhase = time * 0.25;
    for (let ring = 0; ring < 3; ring++) {
        const ringPhase = pulsePhase + ring * Math.PI * 0.7;
        const ringSize = headRadius * (0.55 + ring * 0.15) + Math.sin(ringPhase) * 2;
        const ringAlpha = 0.65 - ring * 0.15 - Math.sin(ringPhase) * 0.2;
        
        CTX.strokeStyle = ring === 0 ? electricYellow : (ring === 1 ? plasmaCyan : electricViolet);
        CTX.lineWidth = 1.8 - ring * 0.3;
        CTX.globalAlpha = fadeAlpha * ringAlpha;
        CTX.beginPath();
        CTX.arc(0, 0, ringSize, 0, Math.PI * 2);
        CTX.stroke();
    }
    CTX.globalAlpha = fadeAlpha;
    
    // Hot plasma core - intense white center
    const coreGrad = CTX.createRadialGradient(0, 0, 0, 0, 0, headRadius * 0.55);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.25, electricWhite);
    coreGrad.addColorStop(0.5, electricYellow);
    coreGrad.addColorStop(0.75, plasmaCyan);
    coreGrad.addColorStop(1, electricViolet);
    
    CTX.fillStyle = coreGrad;
    CTX.beginPath();
    CTX.arc(0, 0, headRadius * 0.55, 0, Math.PI * 2);
    CTX.fill();
    
    // Electric arc discharges from head - more dramatic
    CTX.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
        const arcAngle = (Math.PI * 2 / 5) * i + time * 0.1 + Math.PI * 0.2;
        const arcLen = headRadius + 5 + Math.random() * 8;
        
        // Only draw arcs in forward-ish hemisphere for comet effect
        const normalizedAngle = ((arcAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        if (normalizedAngle < Math.PI * 0.4 || normalizedAngle > Math.PI * 1.6) {
            CTX.strokeStyle = i % 2 === 0 ? electricYellow : plasmaCyan;
            CTX.globalAlpha = fadeAlpha * (0.6 + Math.random() * 0.35);
            CTX.beginPath();
            
            const startX = Math.cos(arcAngle) * headRadius * 0.85;
            const startY = Math.sin(arcAngle) * headRadius * 0.85;
            CTX.moveTo(startX, startY);
            
            // Zigzag arc
            const midX = Math.cos(arcAngle) * arcLen * 0.6 + (Math.random() - 0.5) * 4;
            const midY = Math.sin(arcAngle) * arcLen * 0.6 + (Math.random() - 0.5) * 4;
            const endX = Math.cos(arcAngle) * arcLen + (Math.random() - 0.5) * 3;
            const endY = Math.sin(arcAngle) * arcLen + (Math.random() - 0.5) * 3;
            
            CTX.lineTo(midX, midY);
            CTX.lineTo(endX, endY);
            CTX.stroke();
        }
    }
    CTX.globalAlpha = fadeAlpha;
    
    // Central bright spark
    CTX.fillStyle = '#ffffff';
    CTX.beginPath();
    CTX.arc(0, 0, 3 * scale, 0, Math.PI * 2);
    CTX.fill();
    
    CTX.restore();
}

function drawTank(x, y, angle, turretAngle, colorBody, colorTurret, isPlayer, recoil, hpRatio = 1, hitFlash = 0, seed = 0.5, turretRecoilOffsetX = 0, turretRecoilOffsetY = 0, hitPositions = null, weaponType = 'cannon', wheelRotation = 0, shieldTime = 0, armorAmount = 0, tankType = null) {
    // CRITICAL: Validate all numeric parameters to prevent ghost tank bug
    // NaN or undefined values will cause canvas transforms to fail silently
    if (!Number.isFinite(x) || !Number.isFinite(y)) return; // Invalid position - don't draw
    if (!Number.isFinite(angle)) angle = 0;
    if (!Number.isFinite(turretAngle)) turretAngle = 0;
    if (!Number.isFinite(recoil)) recoil = 0;
    if (!Number.isFinite(hpRatio)) hpRatio = 1;
    if (!Number.isFinite(wheelRotation)) wheelRotation = 0;
    if (!Number.isFinite(turretRecoilOffsetX)) turretRecoilOffsetX = 0;
    if (!Number.isFinite(turretRecoilOffsetY)) turretRecoilOffsetY = 0;
    
    // Determine tank type for color scheme: 'player', 'enemy', or 'clone'
    // Clone tanks have bright cyan/teal colors distinct from player (green/black) and enemy (red)
    const isClone = tankType === 'clone' || (colorBody === '#22d3ee' || colorBody === '#86efac' || colorBody === '#4ade80');
    
    CTX.save();
    CTX.translate(x, y);
    
    // CONSISTENT LIGHT SOURCE: Light comes from top-left (angle = -3*PI/4)
    // This creates shadows pointing to bottom-right for all game objects
    const LIGHT_ANGLE = -Math.PI * 0.75; // -135 degrees (top-left)
    const shadowOffsetX = 5;
    const shadowOffsetY = 5;
    
    // Get shadow quality for performance optimization
    const shadowQuality = typeof getShadowQuality === 'function' ? getShadowQuality() : 1.0;
    
    // Draw body shadow with blur for soft edges (fixed direction) - skip at low quality
    if (shadowQuality > 0.2) {
        CTX.save();
        if (shadowQuality >= 0.7) {
            CTX.filter = 'blur(4px)';
        } else if (shadowQuality >= 0.4) {
            CTX.filter = 'blur(2px)';
        }
        CTX.translate(shadowOffsetX, shadowOffsetY);
        CTX.rotate(angle);
        CTX.fillStyle = `rgba(0, 0, 0, ${0.3 * shadowQuality})`;
        CTX.fillRect(-26, -22, 52, 44);
        CTX.filter = 'none';
        CTX.restore();
    }
    
    // Draw tank body with detailed treads/wheels
    CTX.save();
    CTX.rotate(angle);
    
    // Tank track assemblies (left and right sides)
    // Track housing (darker outer frame)
    CTX.fillStyle = '#111111';
    CTX.fillRect(-29, -25, 58, 10); // Top track frame
    CTX.fillRect(-29, 15, 58, 10);  // Bottom track frame
    
    // Inner track surface
    CTX.fillStyle = '#1a1a1a';
    CTX.fillRect(-28, -24, 56, 8); // Top track
    CTX.fillRect(-28, 16, 56, 8);  // Bottom track
    
    // IMPROVED TRACK TREAD ANIMATION - Smooth continuous movement
    // Normalize wheel rotation to prevent large number issues
    const normalizedRotation = ((wheelRotation || 0) % (Math.PI * 2));
    const treadSpacing = 7; // Distance between treads
    const treadWidth = 4.5;
    const trackLength = 56; // Total track length
    const treadCount = Math.ceil(trackLength / treadSpacing) + 2; // Extra for smooth wrap
    
    // Calculate smooth tread offset (converts rotation to linear movement)
    const linearOffset = normalizedRotation * 3.5; // Gear ratio for tread movement
    
    CTX.fillStyle = '#2a2a2a';
    for (let i = 0; i < treadCount; i++) {
        // Calculate position with smooth wrapping
        let xPos = -28 + (i * treadSpacing) + (linearOffset % treadSpacing);
        
        // Clamp to track bounds
        if (xPos >= -28 && xPos <= 26) {
            // Top track treads with subtle 3D effect
            CTX.fillStyle = '#2d2d2d';
            CTX.fillRect(xPos, -23, treadWidth, 6);
            CTX.fillStyle = '#3a3a3a';
            CTX.fillRect(xPos, -23, treadWidth, 1.5); // Highlight
            
            // Bottom track treads
            CTX.fillStyle = '#2d2d2d';
            CTX.fillRect(xPos, 17, treadWidth, 6);
            CTX.fillStyle = '#3a3a3a';
            CTX.fillRect(xPos, 17, treadWidth, 1.5); // Highlight
        }
    }
    
    // IMPROVED ROAD WHEELS - More detailed with rim, tire, and hub
    const wheelRadius = 6;
    const wheelPositions = [-18, -6, 6, 18]; // 4 wheel positions
    
    for (let i = 0; i < wheelPositions.length; i++) {
        const wheelX = wheelPositions[i];
        
        // TOP SIDE WHEEL
        CTX.save();
        CTX.translate(wheelX, -18);
        
        // Wheel shadow (subtle depth)
        CTX.fillStyle = 'rgba(0, 0, 0, 0.3)';
        CTX.beginPath();
        CTX.arc(1, 1, wheelRadius, 0, Math.PI * 2);
        CTX.fill();
        
        // Outer tire (rubber)
        CTX.fillStyle = '#252525';
        CTX.beginPath();
        CTX.arc(0, 0, wheelRadius, 0, Math.PI * 2);
        CTX.fill();
        
        // Inner rim
        CTX.fillStyle = '#3d3d3d';
        CTX.beginPath();
        CTX.arc(0, 0, wheelRadius - 1.5, 0, Math.PI * 2);
        CTX.fill();
        
        // Rotating wheel face with spokes
        CTX.save();
        CTX.rotate(normalizedRotation);
        
        // 6 spokes for smoother look
        CTX.strokeStyle = '#505050';
        CTX.lineWidth = 1.2;
        for (let s = 0; s < 6; s++) {
            const spokeAngle = (s * Math.PI) / 3;
            CTX.beginPath();
            CTX.moveTo(0, 0);
            CTX.lineTo(Math.cos(spokeAngle) * (wheelRadius - 2), Math.sin(spokeAngle) * (wheelRadius - 2));
            CTX.stroke();
        }
        
        // Center hub
        CTX.fillStyle = '#555';
        CTX.beginPath();
        CTX.arc(0, 0, 2, 0, Math.PI * 2);
        CTX.fill();
        
        // Hub bolt
        CTX.fillStyle = '#777';
        CTX.beginPath();
        CTX.arc(0, 0, 0.8, 0, Math.PI * 2);
        CTX.fill();
        
        CTX.restore(); // End rotation
        CTX.restore(); // End wheel position
        
        // BOTTOM SIDE WHEEL (mirror)
        CTX.save();
        CTX.translate(wheelX, 18);
        
        // Wheel shadow
        CTX.fillStyle = 'rgba(0, 0, 0, 0.3)';
        CTX.beginPath();
        CTX.arc(1, 1, wheelRadius, 0, Math.PI * 2);
        CTX.fill();
        
        // Outer tire
        CTX.fillStyle = '#252525';
        CTX.beginPath();
        CTX.arc(0, 0, wheelRadius, 0, Math.PI * 2);
        CTX.fill();
        
        // Inner rim
        CTX.fillStyle = '#3d3d3d';
        CTX.beginPath();
        CTX.arc(0, 0, wheelRadius - 1.5, 0, Math.PI * 2);
        CTX.fill();
        
        // Rotating wheel face
        CTX.save();
        CTX.rotate(normalizedRotation);
        
        // 6 spokes
        CTX.strokeStyle = '#505050';
        CTX.lineWidth = 1.2;
        for (let s = 0; s < 6; s++) {
            const spokeAngle = (s * Math.PI) / 3;
            CTX.beginPath();
            CTX.moveTo(0, 0);
            CTX.lineTo(Math.cos(spokeAngle) * (wheelRadius - 2), Math.sin(spokeAngle) * (wheelRadius - 2));
            CTX.stroke();
        }
        
        // Center hub
        CTX.fillStyle = '#555';
        CTX.beginPath();
        CTX.arc(0, 0, 2, 0, Math.PI * 2);
        CTX.fill();
        
        // Hub bolt
        CTX.fillStyle = '#777';
        CTX.beginPath();
        CTX.arc(0, 0, 0.8, 0, Math.PI * 2);
        CTX.fill();
        
        CTX.restore(); // End rotation
        CTX.restore(); // End wheel position
    }
    
    // Front and rear drive sprockets (larger wheels at tank ends)
    const sprocketRadius = 5;
    const sprocketPositions = [{ x: -24, y: -18 }, { x: 24, y: -18 }, { x: -24, y: 18 }, { x: 24, y: 18 }];
    
    for (const pos of sprocketPositions) {
        CTX.save();
        CTX.translate(pos.x, pos.y);
        
        // Sprocket body
        CTX.fillStyle = '#2a2a2a';
        CTX.beginPath();
        CTX.arc(0, 0, sprocketRadius, 0, Math.PI * 2);
        CTX.fill();
        
        // Rotating teeth
        CTX.save();
        CTX.rotate(normalizedRotation);
        CTX.strokeStyle = '#444';
        CTX.lineWidth = 1.5;
        for (let t = 0; t < 8; t++) {
            const toothAngle = (t * Math.PI) / 4;
            CTX.beginPath();
            CTX.moveTo(Math.cos(toothAngle) * 2, Math.sin(toothAngle) * 2);
            CTX.lineTo(Math.cos(toothAngle) * (sprocketRadius - 0.5), Math.sin(toothAngle) * (sprocketRadius - 0.5));
            CTX.stroke();
        }
        CTX.restore();
        
        // Center
        CTX.fillStyle = '#555';
        CTX.beginPath();
        CTX.arc(0, 0, 1.5, 0, Math.PI * 2);
        CTX.fill();
        
        CTX.restore();
    }
    
    // Tank hull (main body)
    CTX.fillStyle = '#2c2c2c';
    CTX.fillRect(-24, -16, 48, 32);
    
    // Hull armor plating
    CTX.fillStyle = '#3d3d3d';
    CTX.fillRect(-22, -14, 44, 28);
    
    // Main armor color
    CTX.fillStyle = hitFlash > 0 ? '#fff' : colorBody;
    CTX.fillRect(-18, -12, 36, 24);
    
    // Hull top highlight (3D effect) - different for player/enemy/clone
    let hullHighlight;
    if (isClone) {
        hullHighlight = 'rgba(100,255,255,0.20)'; // Cyan highlight for clone
    } else if (isPlayer) {
        hullHighlight = 'rgba(100,200,100,0.15)'; // Green highlight for player
    } else {
        hullHighlight = 'rgba(200,100,100,0.12)'; // Red highlight for enemy
    }
    CTX.fillStyle = hullHighlight;
    CTX.fillRect(-18, -12, 36, 8);
    
    // Hull bottom shadow (3D effect)
    CTX.fillStyle = 'rgba(0,0,0,0.15)';
    CTX.fillRect(-18, 4, 36, 8);
    
    // Hull detail lines (armor panel edges)
    CTX.strokeStyle = 'rgba(0,0,0,0.3)';
    CTX.lineWidth = 1;
    CTX.beginPath();
    CTX.moveTo(-18, -4);
    CTX.lineTo(18, -4);
    CTX.moveTo(-18, 4);
    CTX.lineTo(18, 4);
    CTX.stroke();
    
    // Side armor rivets/bolts for detail - different colors for player/enemy/clone
    let rivetColor;
    if (isClone) {
        rivetColor = '#0e7490'; // Dark cyan for clone rivets
    } else if (isPlayer) {
        rivetColor = '#1a5c30'; // Dark green for player rivets
    } else {
        rivetColor = '#5c1a1a'; // Dark red for enemy rivets
    }
    CTX.fillStyle = rivetColor;
    const rivetPositions = [-12, 0, 12];
    for (const rx of rivetPositions) {
        // Top row
        CTX.beginPath();
        CTX.arc(rx, -10, 1.2, 0, Math.PI * 2);
        CTX.fill();
        // Bottom row
        CTX.beginPath();
        CTX.arc(rx, 10, 1.2, 0, Math.PI * 2);
        CTX.fill();
    }
    
    // Tank marking/emblem (distinguishing feature)
    if (isClone) {
        // Clone tank: Diamond emblem (ally marker)
        CTX.fillStyle = 'rgba(100,255,255,0.4)';
        CTX.beginPath();
        CTX.moveTo(0, -5);
        CTX.lineTo(5, 0);
        CTX.lineTo(0, 5);
        CTX.lineTo(-5, 0);
        CTX.closePath();
        CTX.fill();
    } else if (isPlayer) {
        // Player tank: Star emblem
        CTX.fillStyle = 'rgba(255,255,100,0.3)';
        CTX.beginPath();
        const starX = 0, starY = 0, starR = 4;
        for (let i = 0; i < 5; i++) {
            const angle = (i * 4 * Math.PI / 5) - Math.PI / 2;
            const px = starX + Math.cos(angle) * starR;
            const py = starY + Math.sin(angle) * starR;
            if (i === 0) CTX.moveTo(px, py);
            else CTX.lineTo(px, py);
        }
        CTX.closePath();
        CTX.fill();
    } else {
        // Enemy tank: Cross/X marking
        CTX.strokeStyle = 'rgba(255,50,50,0.25)';
        CTX.lineWidth = 2;
        CTX.beginPath();
        CTX.moveTo(-4, -4);
        CTX.lineTo(4, 4);
        CTX.moveTo(4, -4);
        CTX.lineTo(-4, 4);
        CTX.stroke();
    }
    
    // === FRONT OF TANK (LEFT SIDE IN LOCAL COORDS - negative X) ===
    // Sloped glacis armor plate with dramatic angled effect
    // Clone: bright cyan, Player: dark green, Enemy: dark red
    let frontColor, frontHighlight, frontEdgeHighlight;
    if (isClone) {
        frontColor = hitFlash > 0 ? '#fff' : '#0891b2'; // Bright cyan front
        frontHighlight = 'rgba(100,255,255,0.30)';
        frontEdgeHighlight = 'rgba(150,255,255,0.35)';
    } else if (isPlayer) {
        frontColor = hitFlash > 0 ? '#fff' : '#166534'; // Dark green front
        frontHighlight = 'rgba(100,255,150,0.25)';
        frontEdgeHighlight = 'rgba(150,255,180,0.3)';
    } else {
        frontColor = hitFlash > 0 ? '#fff' : '#7f1d1d'; // Dark red front
        frontHighlight = 'rgba(255,100,100,0.2)';
        frontEdgeHighlight = 'rgba(255,150,150,0.25)';
    }
    CTX.fillStyle = frontColor;
    CTX.beginPath();
    CTX.moveTo(-18, -12);
    CTX.lineTo(-28, -6);
    CTX.lineTo(-28, 6);
    CTX.lineTo(-18, 12);
    CTX.closePath();
    CTX.fill();
    
    // Front glacis upper highlight (light reflection on angled armor)
    CTX.fillStyle = frontHighlight;
    CTX.beginPath();
    CTX.moveTo(-18, -12);
    CTX.lineTo(-28, -6);
    CTX.lineTo(-28, 0);
    CTX.lineTo(-18, -4);
    CTX.closePath();
    CTX.fill();
    
    // Front armor edge highlight
    CTX.strokeStyle = frontEdgeHighlight;
    CTX.lineWidth = 2;
    CTX.beginPath();
    CTX.moveTo(-28, -6);
    CTX.lineTo(-18, -12);
    CTX.stroke();
    
    // Front armor lower shadow for 3D depth
    CTX.fillStyle = 'rgba(0,0,0,0.25)';
    CTX.beginPath();
    CTX.moveTo(-18, 4);
    CTX.lineTo(-28, 2);
    CTX.lineTo(-28, 6);
    CTX.lineTo(-18, 12);
    CTX.closePath();
    CTX.fill();
    
    // Driver viewport housing (front visual indicator)
    CTX.fillStyle = '#1a1a1a';
    CTX.beginPath();
    CTX.roundRect(-22, -4, 5, 8, 1);
    CTX.fill();
    
    // Driver viewport glass with reflection
    let viewportGlow;
    if (isClone) {
        viewportGlow = 'rgba(100,255,255,0.7)'; // Bright cyan for clone
    } else if (isPlayer) {
        viewportGlow = 'rgba(80,200,255,0.6)'; // Blue-cyan for player
    } else {
        viewportGlow = 'rgba(255,100,80,0.5)'; // Red-orange for enemy
    }
    CTX.fillStyle = viewportGlow;
    CTX.beginPath();
    CTX.roundRect(-21, -3, 3, 6, 0.5);
    CTX.fill();
    
    // Viewport glass highlight
    CTX.fillStyle = 'rgba(255,255,255,0.4)';
    CTX.fillRect(-21, -3, 1.5, 2);
    
    // Front headlights with glow effect - different colors for player/enemy/clone
    let headlightColor, headlightGlow;
    if (isClone) {
        headlightColor = '#00ffff'; // Bright cyan headlights for clone
        headlightGlow = 'rgba(0,255,255,0.5)';
    } else if (isPlayer) {
        headlightColor = '#88ff88'; // Green headlights for player
        headlightGlow = 'rgba(100,255,100,0.4)';
    } else {
        headlightColor = '#ffdd44'; // Yellow-orange headlights for enemy
        headlightGlow = 'rgba(255,220,100,0.3)';
    }
    
    // Headlight glow aura
    CTX.fillStyle = headlightGlow;
    CTX.beginPath();
    CTX.arc(-26, -7, 4, 0, Math.PI * 2);
    CTX.fill();
    CTX.beginPath();
    CTX.arc(-26, 7, 4, 0, Math.PI * 2);
    CTX.fill();
    
    // Headlight housing
    CTX.fillStyle = '#333';
    CTX.beginPath();
    CTX.arc(-26, -7, 2.5, 0, Math.PI * 2);
    CTX.fill();
    CTX.beginPath();
    CTX.arc(-26, 7, 2.5, 0, Math.PI * 2);
    CTX.fill();
    
    // Headlight bulb
    CTX.fillStyle = headlightColor;
    CTX.globalAlpha = 0.9;
    CTX.beginPath();
    CTX.arc(-26, -7, 1.8, 0, Math.PI * 2);
    CTX.fill();
    CTX.beginPath();
    CTX.arc(-26, 7, 1.8, 0, Math.PI * 2);
    CTX.fill();
    
    // Headlight center bright spot
    CTX.fillStyle = '#ffffff';
    CTX.globalAlpha = 0.8;
    CTX.beginPath();
    CTX.arc(-26.5, -7.5, 0.6, 0, Math.PI * 2);
    CTX.fill();
    CTX.beginPath();
    CTX.arc(-26.5, 6.5, 0.6, 0, Math.PI * 2);
    CTX.fill();
    CTX.globalAlpha = 1.0;
    
    // Front tow hooks (detail)
    CTX.fillStyle = '#4a4a4a';
    CTX.fillRect(-28, -10, 2, 3);
    CTX.fillRect(-28, 7, 2, 3);
    
    // === REAR OF TANK (RIGHT SIDE IN LOCAL COORDS - positive X) ===
    // Engine deck with exhaust and distinctive rear design
    let rearColor, rearAccent;
    if (isClone) {
        rearColor = hitFlash > 0 ? '#fff' : '#0e7490'; // Dark cyan rear for clone
        rearAccent = '#064e3b'; // Darker teal accent
    } else if (isPlayer) {
        rearColor = hitFlash > 0 ? '#fff' : '#14532d'; // Dark green rear
        rearAccent = '#0d3320';
    } else {
        rearColor = hitFlash > 0 ? '#fff' : '#6b1c1c'; // Dark red rear
        rearAccent = '#4a1515';
    }
    
    // Engine compartment base
    CTX.fillStyle = rearColor;
    CTX.fillRect(14, -11, 10, 22);
    
    // Engine deck raised section
    CTX.fillStyle = rearAccent;
    CTX.fillRect(15, -9, 8, 18);
    
    // Engine vents (more detailed grille)
    CTX.fillStyle = 'rgba(0,0,0,0.5)';
    CTX.fillRect(16, -7, 6, 14);
    
    // Vent slats with 3D effect
    CTX.strokeStyle = '#1a1a1a';
    CTX.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
        const yPos = -5 + i * 3;
        // Vent shadow
        CTX.strokeStyle = 'rgba(0,0,0,0.8)';
        CTX.beginPath();
        CTX.moveTo(16, yPos);
        CTX.lineTo(21, yPos);
        CTX.stroke();
        // Vent highlight
        CTX.strokeStyle = 'rgba(80,80,80,0.5)';
        CTX.beginPath();
        CTX.moveTo(16, yPos + 1);
        CTX.lineTo(21, yPos + 1);
        CTX.stroke();
    }
    
    // Exhaust pipes with heat glow effect - different for player/enemy/clone
    let exhaustGlow;
    if (isClone) {
        exhaustGlow = 'rgba(0,255,255,0.4)'; // Cyan exhaust for clone
    } else if (isPlayer) {
        exhaustGlow = 'rgba(100,150,255,0.3)'; // Blue exhaust for player
    } else {
        exhaustGlow = 'rgba(255,100,50,0.4)'; // Orange-red exhaust for enemy
    }
    
    // Exhaust pipe housing
    CTX.fillStyle = '#2a2a2a';
    CTX.beginPath();
    CTX.arc(24, -6, 3.5, 0, Math.PI * 2);
    CTX.fill();
    CTX.beginPath();
    CTX.arc(24, 6, 3.5, 0, Math.PI * 2);
    CTX.fill();
    
    // Exhaust pipe outer ring
    CTX.strokeStyle = '#444';
    CTX.lineWidth = 1;
    CTX.beginPath();
    CTX.arc(24, -6, 3, 0, Math.PI * 2);
    CTX.stroke();
    CTX.beginPath();
    CTX.arc(24, 6, 3, 0, Math.PI * 2);
    CTX.stroke();
    
    // Exhaust heat glow
    CTX.fillStyle = exhaustGlow;
    CTX.beginPath();
    CTX.arc(24, -6, 2.5, 0, Math.PI * 2);
    CTX.fill();
    CTX.beginPath();
    CTX.arc(24, 6, 2.5, 0, Math.PI * 2);
    CTX.fill();
    
    // Exhaust pipe inner (dark core)
    CTX.fillStyle = '#0a0a0a';
    CTX.beginPath();
    CTX.arc(24, -6, 1.5, 0, Math.PI * 2);
    CTX.fill();
    CTX.beginPath();
    CTX.arc(24, 6, 1.5, 0, Math.PI * 2);
    CTX.fill();
    
    // Rear taillights with glow - different for player/enemy/clone
    let taillightColor, taillightGlow;
    if (isClone) {
        taillightColor = '#00ffff'; // Bright cyan taillights for clone
        taillightGlow = 'rgba(0,255,255,0.5)';
    } else if (isPlayer) {
        taillightColor = '#44ff44'; // Green taillights for player
        taillightGlow = 'rgba(80,255,80,0.4)';
    } else {
        taillightColor = '#ff3333'; // Red taillights for enemy
        taillightGlow = 'rgba(255,80,80,0.4)';
    }
    
    // Taillight glow aura
    CTX.fillStyle = taillightGlow;
    CTX.beginPath();
    CTX.arc(23, -10, 3, 0, Math.PI * 2);
    CTX.fill();
    CTX.beginPath();
    CTX.arc(23, 10, 3, 0, Math.PI * 2);
    CTX.fill();
    
    // Taillight housing
    CTX.fillStyle = '#222';
    CTX.beginPath();
    CTX.roundRect(21, -12, 4, 4, 1);
    CTX.fill();
    CTX.beginPath();
    CTX.roundRect(21, 8, 4, 4, 1);
    CTX.fill();
    
    // Taillight bulb
    CTX.fillStyle = taillightColor;
    CTX.globalAlpha = 0.9;
    CTX.beginPath();
    CTX.roundRect(22, -11, 2, 2, 0.5);
    CTX.fill();
    CTX.beginPath();
    CTX.roundRect(22, 9, 2, 2, 0.5);
    CTX.fill();
    CTX.globalAlpha = 1.0;
    
    // Rear mud flaps / guards
    CTX.fillStyle = '#1a1a1a';
    CTX.fillRect(22, -14, 3, 2);
    CTX.fillRect(22, 12, 3, 2);
    
    // Rear shadow for depth
    CTX.fillStyle = 'rgba(0,0,0,0.2)';
    CTX.fillRect(18, -12, 4, 24);
    
    // Turret ring base
    CTX.fillStyle = 'rgba(0,0,0,0.2)';
    CTX.beginPath();
    CTX.arc(0, 0, 14, 0, Math.PI * 2);
    CTX.fill();
    
    // Draw 20-step damage cracks on tank body (player AND enemy)
    if (hpRatio < 1) {
        drawTankCrack(-18, -12, 36, 24, hpRatio, seed, hitPositions);
    }
    CTX.restore();

    // DYNAMIC TURRET SHADOW - Follows turret rotation but shadow direction is CONSISTENT
    // Light source is at top-left (-135 degrees), so shadow always casts to bottom-right
    // But the turret shape itself rotates, creating a realistic shadow
    // Skip at low shadow quality for performance
    if (shadowQuality > 0.2) {
        CTX.save();
        
        // Shadow is offset from light direction (top-left to bottom-right)
        CTX.translate(shadowOffsetX, shadowOffsetY);
        CTX.fillStyle = `rgba(0, 0, 0, ${0.25 * shadowQuality})`;
        
        // Apply blur to turret shadow for soft realistic look - conditional on quality
        if (shadowQuality >= 0.7) {
            CTX.filter = isPlayer ? 'blur(4px)' : 'blur(3px)';
        } else if (shadowQuality >= 0.4) {
            CTX.filter = 'blur(2px)';
        }
        
        // Draw weapon-specific turret shadow matching exact turret shape
        CTX.save();
        CTX.rotate(turretAngle);
        drawWeaponTurretShadow(weaponType, recoil);
        CTX.restore();
        
        // Reset filter
        CTX.filter = 'none';
        CTX.restore();
    }
    
    // Draw turret with visual recoil offset
    // Apply visual turret recoil offset BEFORE rotation so turret shifts in firing direction
    CTX.translate(turretRecoilOffsetX, turretRecoilOffsetY);
    CTX.rotate(turretAngle);
    if (recoil) CTX.translate(-recoil, 0);
    
    // Draw weapon-specific turret
    drawWeaponTurret(weaponType, colorTurret, colorBody, hitFlash, recoil);

    // UNIFIED SHIELD EFFECT - drawn for any entity with active shield
    // Use shieldTime parameter (passed for player, clone, or enemy)
    const effectiveShieldTime = isPlayer ? player.shieldTime : shieldTime;
    if (effectiveShieldTime > 0) {
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
    
    // UNIFIED ARMOR EFFECT - drawn for any entity with armor
    // Use armorAmount parameter (passed for player, clone, or enemy)
    const effectiveArmor = isPlayer ? player.armor : armorAmount;
    if (effectiveArmor > 0) {
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
    // HP bar is now handled by drawUnifiedStatusPanel for consistent styling with status effects
    // This section only stores screen coordinates for use by status panel
    const needsStatusPanel = !isPlayer;
    if (needsStatusPanel) {
        const matrix = CTX.getTransform ? CTX.getTransform() : null;
        const screenX = matrix ? matrix.e : x;
        const screenY = matrix ? matrix.f : y;

        // Store screen coordinates on a global temp for status panel
        // The actual status panel will be drawn by the calling code
        CTX._lastTankScreenX = screenX;
        CTX._lastTankScreenY = screenY;
        CTX._lastTankHpRatio = hpRatio;
    }
    
    CTX.restore();
}

// Teleport-style spawn pulse used for player and enemy arrivals.
function drawSpawnPulse(x, y, progress, color, isPlayer) {
    const eased = Math.min(1, Math.max(0, progress));
    const outerRadius = 25 + eased * 90;
    const innerRadius = 12 + eased * 40;
    CTX.save();
    CTX.translate(x, y);
    CTX.globalAlpha = 0.55 * (1 - eased) + 0.2;
    CTX.strokeStyle = color;
    CTX.lineWidth = 3;
    CTX.beginPath();
    CTX.arc(0, 0, outerRadius, 0, Math.PI * 2);
    CTX.stroke();
    CTX.globalAlpha *= 0.65;
    CTX.lineWidth = 1.5;
    CTX.beginPath();
    CTX.arc(0, 0, innerRadius, 0, Math.PI * 2);
    CTX.stroke();
    if (isPlayer) {
        CTX.globalAlpha *= 0.8;
        CTX.fillStyle = 'rgba(34,197,94,0.35)';
        CTX.beginPath();
        CTX.arc(0, 0, innerRadius * 0.6, 0, Math.PI * 2);
        CTX.fill();
    }
    CTX.restore();
}

function drawTurboAfterburner(tank) {
    const ratio = Math.max(0, Math.min(1, (tank.turboTime || 0) / Math.max(tank.turboDuration || 1, 1)));
    const plumeLength = 70 + ratio * 60;
    const plumeWidth = 18 + ratio * 10;
    CTX.save();
    CTX.translate(tank.x, tank.y);
    CTX.rotate(tank.angle + Math.PI);
    CTX.globalCompositeOperation = 'screen';
    for (let side = -1; side <= 1; side += 2) {
        CTX.save();
        CTX.translate(0, 12 * side);
        const outerGradient = CTX.createLinearGradient(0, 0, plumeLength, 0);
        outerGradient.addColorStop(0, `rgba(14, 165, 233, ${0.35 + ratio * 0.3})`);
        outerGradient.addColorStop(0.5, `rgba(59, 130, 246, ${0.25 + ratio * 0.35})`);
        outerGradient.addColorStop(1, 'rgba(14, 116, 144, 0)');
        CTX.fillStyle = outerGradient;
        CTX.beginPath();
        CTX.moveTo(0, -plumeWidth);
        CTX.quadraticCurveTo(plumeLength * 0.45, -plumeWidth * 1.3, plumeLength, 0);
        CTX.quadraticCurveTo(plumeLength * 0.45, plumeWidth * 1.3, 0, plumeWidth);
        CTX.closePath();
        CTX.fill();

        const innerGradient = CTX.createLinearGradient(0, 0, plumeLength * 0.8, 0);
        innerGradient.addColorStop(0, `rgba(224, 242, 254, ${0.75 + ratio * 0.2})`);
        innerGradient.addColorStop(1, 'rgba(191, 219, 254, 0)');
        CTX.fillStyle = innerGradient;
        CTX.beginPath();
        CTX.moveTo(0, -plumeWidth * 0.45);
        CTX.quadraticCurveTo(plumeLength * 0.35, -plumeWidth * 0.7, plumeLength * 0.8, 0);
        CTX.quadraticCurveTo(plumeLength * 0.35, plumeWidth * 0.7, 0, plumeWidth * 0.45);
        CTX.closePath();
        CTX.fill();
        CTX.restore();
    }
    CTX.restore();
    CTX.globalCompositeOperation = 'source-over';
}

function traceTrackPath(sideOffset, halfWidth, halfLength, bend) {
    CTX.beginPath();
    CTX.moveTo(sideOffset - halfWidth, -halfLength);
    CTX.quadraticCurveTo(sideOffset - halfWidth + bend, 0, sideOffset - halfWidth, halfLength);
    CTX.lineTo(sideOffset + halfWidth, halfLength);
    CTX.quadraticCurveTo(sideOffset + halfWidth + bend, 0, sideOffset + halfWidth, -halfLength);
    CTX.closePath();
}

// Enhanced track segment drawing with realistic tread pattern
function drawTrackSegment(sideOffset, width, length, curvature, fillColor, grooveColor, spacing = 5, trackAge = 1) {
    const halfWidth = width / 2;
    const halfLength = length / 2;
    const bend = curvature * halfLength * 0.9;
    
    // Draw track base
    traceTrackPath(sideOffset, halfWidth, halfLength, bend);
    CTX.fillStyle = fillColor;
    CTX.fill();
    
    // Draw tread grooves
    if (grooveColor) {
        CTX.save();
        traceTrackPath(sideOffset, halfWidth, halfLength, bend);
        CTX.clip();
        CTX.strokeStyle = grooveColor;
        CTX.lineWidth = Math.max(0.6, width * 0.18);
        for (let y = -halfLength + spacing; y < halfLength; y += spacing) {
            CTX.beginPath();
            CTX.moveTo(sideOffset - halfWidth + 1, y);
            CTX.lineTo(sideOffset + halfWidth - 1, y);
            CTX.stroke();
        }
        CTX.restore();
    }
    
    // Add dirt displacement effect on edges (fresh tracks only)
    if (trackAge > 0.6) {
        CTX.save();
        CTX.strokeStyle = `rgba(60, 50, 35, ${0.15 * trackAge})`;
        CTX.lineWidth = 1.5;
        
        // Left edge dirt spray
        CTX.beginPath();
        for (let y = -halfLength; y < halfLength; y += spacing * 1.5) {
            const offsetX = (Math.random() - 0.5) * 3;
            CTX.moveTo(sideOffset - halfWidth - 1, y);
            CTX.lineTo(sideOffset - halfWidth - 2 - Math.random() * 2 + offsetX, y + Math.random() * 2);
        }
        CTX.stroke();
        
        // Right edge dirt spray
        CTX.beginPath();
        for (let y = -halfLength; y < halfLength; y += spacing * 1.5) {
            const offsetX = (Math.random() - 0.5) * 3;
            CTX.moveTo(sideOffset + halfWidth + 1, y);
            CTX.lineTo(sideOffset + halfWidth + 2 + Math.random() * 2 + offsetX, y + Math.random() * 2);
        }
        CTX.stroke();
        CTX.restore();
    }
}

// Enhanced track pair rendering with depth and realism
function renderTrackPair(track, options) {
    const offset = track.treadOffset ?? options.offset;
    const width = track.width ?? options.width;
    const length = track.length ?? options.length;
    const curvature = Math.max(-0.85, Math.min(0.85, (track.curve || 0)));
    const fillColor = options.color;
    const grooveColor = options.grooveColor;
    const spacing = options.spacing ?? 5;
    const trackAge = track.alpha / (track.baseAlpha || 0.35); // Freshness ratio
    
    if (!offset || !width || !length) return;
    
    // Draw track shadow for depth (subtle)
    if (trackAge > 0.5) {
        CTX.save();
        CTX.translate(0.5, 0.5);
        const shadowAlpha = 0.1 * trackAge;
        drawTrackSegment(-offset, width + 1, length + 1, curvature, `rgba(0, 0, 0, ${shadowAlpha})`, null, spacing, trackAge);
        drawTrackSegment(offset, width + 1, length + 1, curvature, `rgba(0, 0, 0, ${shadowAlpha})`, null, spacing, trackAge);
        CTX.restore();
    }
    
    // Draw main track pair
    drawTrackSegment(-offset, width, length, curvature, fillColor, grooveColor, spacing, trackAge);
    drawTrackSegment(offset, width, length, curvature, fillColor, grooveColor, spacing, trackAge);
    
    // Draw center depression between tracks (tank weight effect)
    if (trackAge > 0.7) {
        const depressAlpha = 0.08 * trackAge;
        CTX.fillStyle = `rgba(40, 35, 25, ${depressAlpha})`;
        CTX.beginPath();
        const depressWidth = (offset * 2) - width;
        CTX.ellipse(0, 0, depressWidth / 2 - 2, length / 3, 0, 0, Math.PI * 2);
        CTX.fill();
    }
}

// Draw realistic 20-step cracks on player tank that fade proportionally when healing
function drawTankCrack(x, y, w, h, hpRatio, seed, hitPositions = null) {
    // Note: This function draws cracks on the tank body
    // x,y are the top-left corner offset of the hull (e.g., -18, -12)
    // hitPositions.hitX/hitY are in local tank space (0,0 = tank center)
    // We need to convert hit positions to be relative to the hull rectangle
    
    CTX.save();
    const damage = 1 - hpRatio; // 0 = no damage, 1 = critical
    const maxCracks = 15; // Reduced for cleaner look with non-overlapping
    const activeCracks = Math.ceil(damage * maxCracks);
    
    if (activeCracks === 0) {
        CTX.restore();
        return;
    }
    
    // Seeded random function for consistent cracks - using ONLY seed for stability
    const rnd = (idx, offset = 0) => {
        let val = Math.sin(seed * 917 + idx * 131 + offset * 73 + 0.1) * 10000;
        return val - Math.floor(val);
    };
    
    // Track used positions to prevent overlap (grid-based)
    const gridSize = 8; // Minimum spacing between crack origins
    const usedGridCells = new Set();
    const getGridKey = (px, py) => `${Math.floor(px / gridSize)},${Math.floor(py / gridSize)}`;
    const isGridOccupied = (px, py) => {
        const key = getGridKey(px, py);
        // Also check adjacent cells for better spacing
        const gx = Math.floor(px / gridSize);
        const gy = Math.floor(py / gridSize);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (usedGridCells.has(`${gx + dx},${gy + dy}`)) return true;
            }
        }
        return false;
    };
    const markGridUsed = (px, py) => {
        usedGridCells.add(getGridKey(px, py));
    };
    
    // Hull bounds for clamping (relative to hull top-left at x,y)
    const halfW = w / 2;
    const halfH = h / 2;
    
    // Collect valid hit positions (non-overlapping)
    // Convert from tank center-relative to hull-relative coordinates
    const crackOrigins = [];
    if (hitPositions && hitPositions.hitX && hitPositions.hitY) {
        for (let i = 0; i < Math.min(hitPositions.hitX.length, activeCracks); i++) {
            const hx = hitPositions.hitX[i];
            const hy = hitPositions.hitY[i];
            if (hx !== undefined && hy !== undefined && !isNaN(hx) && !isNaN(hy)) {
                // Clamp to hull bounds (which is centered in local space)
                const clampedX = Math.max(-halfW + 2, Math.min(halfW - 2, hx));
                const clampedY = Math.max(-halfH + 2, Math.min(halfH - 2, hy));
                if (!isGridOccupied(clampedX, clampedY)) {
                    crackOrigins.push({ x: clampedX, y: clampedY, isHit: true });
                    markGridUsed(clampedX, clampedY);
                }
            }
        }
    }
    
    // Fill remaining cracks with procedural edge-based positions
    for (let i = crackOrigins.length; i < activeCracks; i++) {
        let attempts = 0;
        let placed = false;
        while (!placed && attempts < 10) {
            let startX, startY;
            const edge = Math.floor(rnd(i + attempts, 0) * 4);
            if (edge === 0) { startX = -w/2; startY = (rnd(i, 1 + attempts) - 0.5) * h; }
            else if (edge === 1) { startX = w/2; startY = (rnd(i, 2 + attempts) - 0.5) * h; }
            else if (edge === 2) { startX = (rnd(i, 3 + attempts) - 0.5) * w; startY = -h/2; }
            else { startX = (rnd(i, 4 + attempts) - 0.5) * w; startY = h/2; }
            
            if (!isGridOccupied(startX, startY)) {
                crackOrigins.push({ x: startX, y: startY, isHit: false });
                markGridUsed(startX, startY);
                placed = true;
            }
            attempts++;
        }
    }
    
    // Draw each crack with enhanced visual effects
    for (let i = 0; i < crackOrigins.length; i++) {
        const origin = crackOrigins[i];
        const crackIntensity = (i / maxCracks) * damage; // Older cracks fade
        
        // Draw impact crater/dent at hit position
        if (origin.isHit) {
            // Crater depth effect (dark center)
            const craterSize = 3 + damage * 2;
            const gradient = CTX.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, craterSize);
            gradient.addColorStop(0, `rgba(0, 0, 0, ${0.6 + crackIntensity * 0.3})`);
            gradient.addColorStop(0.5, `rgba(30, 30, 30, ${0.4 + crackIntensity * 0.2})`);
            gradient.addColorStop(1, 'rgba(50, 50, 50, 0)');
            CTX.fillStyle = gradient;
            CTX.beginPath();
            CTX.arc(origin.x, origin.y, craterSize, 0, Math.PI * 2);
            CTX.fill();
            
            // Metal stress ring around crater
            CTX.strokeStyle = `rgba(80, 80, 80, ${0.3 + crackIntensity * 0.2})`;
            CTX.lineWidth = 0.5;
            CTX.beginPath();
            CTX.arc(origin.x, origin.y, craterSize + 1, 0, Math.PI * 2);
            CTX.stroke();
        }
        
        // Main crack line - dark interior
        CTX.lineCap = 'round';
        CTX.lineJoin = 'round';
        
        // Draw crack shadow (creates depth)
        CTX.strokeStyle = `rgba(0, 0, 0, ${0.3 + damage * 0.4})`;
        CTX.lineWidth = 1.5 + damage * 0.8;
        drawCrackPath(origin.x, origin.y, i, rnd, w, h, damage, false);
        
        // Draw main crack (slightly offset for 3D effect)
        CTX.strokeStyle = `rgba(20, 20, 20, ${0.5 + damage * 0.4})`;
        CTX.lineWidth = 0.8 + damage * 0.5;
        drawCrackPath(origin.x - 0.3, origin.y - 0.3, i, rnd, w, h, damage, true);
        
        // Draw crack highlight (metal edge reflection)
        if (damage > 0.3) {
            CTX.strokeStyle = `rgba(150, 150, 150, ${0.15 + damage * 0.1})`;
            CTX.lineWidth = 0.4;
            drawCrackPath(origin.x + 0.5, origin.y + 0.5, i, rnd, w, h, damage, false);
        }
    }
    
    // Critical damage effects - sparks and exposed internals
    if (damage > 0.7) {
        // Exposed wiring/internals color
        const exposeCount = Math.floor((damage - 0.7) * 10);
        for (let i = 0; i < exposeCount && i < crackOrigins.length; i++) {
            const origin = crackOrigins[i];
            // Orange/red glow from internals
            const glowGrad = CTX.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, 4);
            glowGrad.addColorStop(0, `rgba(255, 100, 50, ${0.3 * damage})`);
            glowGrad.addColorStop(0.5, `rgba(255, 50, 0, ${0.15 * damage})`);
            glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            CTX.fillStyle = glowGrad;
            CTX.beginPath();
            CTX.arc(origin.x, origin.y, 5, 0, Math.PI * 2);
            CTX.fill();
        }
    }
    
    CTX.restore();
}

// Helper function to draw individual crack paths
function drawCrackPath(startX, startY, idx, rnd, w, h, damage, drawBranches) {
    const segments = 3 + Math.floor(rnd(idx, 5) * 3);
    let currX = startX, currY = startY;
    
    CTX.beginPath();
    CTX.moveTo(startX, startY);
    
    for (let j = 0; j < segments; j++) {
        // Direction with bias toward center for structural realism
        const angleToCenter = Math.atan2(-currY, -currX);
        const spread = 1.0 + damage * 0.5; // More chaotic when damaged
        const randomAngle = (rnd(idx, 10 + j * 7) - 0.5) * spread;
        const angle = angleToCenter + randomAngle;
        
        // Varying segment length for organic feel
        const baseLen = 5 + rnd(idx, 20 + j * 3) * 8;
        const len = baseLen * (0.8 + damage * 0.4);
        
        const nextX = currX + Math.cos(angle) * len;
        const nextY = currY + Math.sin(angle) * len;
        
        // Keep within tank bounds
        currX = Math.max(-w/2, Math.min(w/2, nextX));
        currY = Math.max(-h/2, Math.min(h/2, nextY));
        
        CTX.lineTo(currX, currY);
        
        // Draw branches for severe damage (fracture pattern)
        if (drawBranches && damage > 0.4 && rnd(idx, 30 + j) > 0.6) {
            const branchAngle = angle + (rnd(idx, 40 + j) - 0.5) * 1.5;
            const branchLen = len * (0.3 + rnd(idx, 50 + j) * 0.4);
            const bx = currX + Math.cos(branchAngle) * branchLen;
            const by = currY + Math.sin(branchAngle) * branchLen;
            
            // Sub-branch
            CTX.moveTo(currX, currY);
            CTX.lineTo(
                Math.max(-w/2, Math.min(w/2, bx)),
                Math.max(-h/2, Math.min(h/2, by))
            );
            CTX.moveTo(currX, currY);
            
            // Secondary sub-branch for very high damage
            if (damage > 0.6 && rnd(idx, 60 + j) > 0.7) {
                const subAngle = branchAngle + (rnd(idx, 70 + j) - 0.5) * 1.2;
                const subLen = branchLen * 0.5;
                const sx = bx + Math.cos(subAngle) * subLen;
                const sy = by + Math.sin(subAngle) * subLen;
                CTX.moveTo(bx, by);
                CTX.lineTo(
                    Math.max(-w/2, Math.min(w/2, sx)),
                    Math.max(-h/2, Math.min(h/2, sy))
                );
            }
        }
    }
    CTX.stroke();
}

// Procedural cracks visualize structure health with realistic 20-step system
// Reusing seeded RNG so damage stays stable frame-to-frame
function drawCrack(x, y, w, h, ratio, seed, hitPositions = null) {
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
            const crackOpacity = 0.25 + crackAge * 0.25; // Reduced from 0.4+0.4 for better transparency
            
            // Start from hit position if available, otherwise use edge
            let startX = 0, startY = 0;
            if (hitPositions && hitPositions.hitX && hitPositions.hitY && hitPositions.hitX[i] !== undefined) {
                // Use actual hit position for this crack
                startX = Math.max(0, Math.min(w, hitPositions.hitX[i]));
                startY = Math.max(0, Math.min(h, hitPositions.hitY[i]));
            } else {
                // Fallback to edge-based cracks
                const edgePick = rnd(i, 0) * 5;
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
    drawPath(1.2 + damage * 1.0, 0.35 + damage * 0.2); // Reduced from 0.6+0.3 for transparency
    
    // Add subtle glow effect for severe damage (gives depth)
    if (damage > 0.25) {
        CTX.globalAlpha = 0.2 + damage * 0.25; // Reduced from 0.3+0.4 for subtlety
        drawPath(0.8, 0.15, true); // Reduced from 0.2 for less glow
    }
    
    CTX.restore();
}

function drawCrate(c) {
    const shakeX = c.shakeX || 0;
    const shakeY = c.shakeY || 0;
    
    // Global shadow offset (same as tanks and other objects)
    const shadowOffsetX = 5;
    const shadowOffsetY = 5;
    
    // ==================== PREMIUM SUPPLY CRATE ====================
    // Military-grade supply crate with silver/gold finish
    
    // Shadow with blur - same size as crate, offset to bottom-right
    // Skip shadow at low quality for performance
    const shadowQuality = getShadowQuality();
    if (shadowQuality >= 0.3) {
        CTX.save();
        if (shadowQuality >= 0.7) {
            CTX.filter = 'blur(3px)';
        } else if (shadowQuality >= 0.5) {
            CTX.filter = 'blur(1px)';
        }
        CTX.fillStyle = `rgba(0, 0, 0, ${0.4 * shadowQuality})`;
        CTX.fillRect(c.x + shadowOffsetX + shakeX, c.y + shadowOffsetY + shakeY, c.w, c.h);
        CTX.filter = 'none';
        CTX.restore();
    }
    
    // Silver metallic base with gradient
    const silverGrad = CTX.createLinearGradient(c.x, c.y, c.x, c.y + c.h);
    silverGrad.addColorStop(0, '#E2E8F0');
    silverGrad.addColorStop(0.2, '#CBD5E0');
    silverGrad.addColorStop(0.5, '#A0AEC0');
    silverGrad.addColorStop(0.8, '#718096');
    silverGrad.addColorStop(1, '#4A5568');
    CTX.fillStyle = silverGrad;
    CTX.fillRect(c.x + shakeX, c.y + shakeY, c.w, c.h);
    
    // Gold trim/bands with gradient
    const goldGrad = CTX.createLinearGradient(c.x, c.y, c.x, c.y + c.h);
    goldGrad.addColorStop(0, '#F6E05E');
    goldGrad.addColorStop(0.3, '#ECC94B');
    goldGrad.addColorStop(0.5, '#D69E2E');
    goldGrad.addColorStop(0.7, '#B7791F');
    goldGrad.addColorStop(1, '#975A16');
    CTX.fillStyle = goldGrad;
    
    // Vertical gold stripes
    CTX.fillRect(c.x + 6 + shakeX, c.y + shakeY, 8, c.h);
    CTX.fillRect(c.x + c.w - 14 + shakeX, c.y + shakeY, 8, c.h);
    
    // Horizontal gold stripes (cross pattern)
    CTX.fillRect(c.x + shakeX, c.y + 6 + shakeY, c.w, 8);
    CTX.fillRect(c.x + shakeX, c.y + c.h - 14 + shakeY, c.w, 8);
    
    // Center medallion/emblem area
    const centerX = c.x + c.w / 2 + shakeX;
    const centerY = c.y + c.h / 2 + shakeY;
    
    // Gold medallion backing
    CTX.fillStyle = '#D69E2E';
    CTX.beginPath();
    CTX.arc(centerX, centerY, 12, 0, Math.PI * 2);
    CTX.fill();
    
    // Inner medallion
    CTX.fillStyle = '#F6E05E';
    CTX.beginPath();
    CTX.arc(centerX, centerY, 8, 0, Math.PI * 2);
    CTX.fill();
    
    // Star symbol in center
    CTX.fillStyle = '#B7791F';
    CTX.beginPath();
    for (let i = 0; i < 5; i++) {
        const angle = (i * 72 - 90) * Math.PI / 180;
        const outerX = centerX + Math.cos(angle) * 6;
        const outerY = centerY + Math.sin(angle) * 6;
        const innerAngle = angle + 36 * Math.PI / 180;
        const innerX = centerX + Math.cos(innerAngle) * 3;
        const innerY = centerY + Math.sin(innerAngle) * 3;
        if (i === 0) CTX.moveTo(outerX, outerY);
        else CTX.lineTo(outerX, outerY);
        CTX.lineTo(innerX, innerY);
    }
    CTX.closePath();
    CTX.fill();
    
    // Ornate corner brackets (gold)
    CTX.strokeStyle = '#D69E2E';
    CTX.lineWidth = 3;
    const bracketSize = 15;
    // Top-left
    CTX.beginPath();
    CTX.moveTo(c.x + shakeX, c.y + bracketSize + shakeY);
    CTX.lineTo(c.x + shakeX, c.y + shakeY);
    CTX.lineTo(c.x + bracketSize + shakeX, c.y + shakeY);
    CTX.stroke();
    // Top-right
    CTX.beginPath();
    CTX.moveTo(c.x + c.w - bracketSize + shakeX, c.y + shakeY);
    CTX.lineTo(c.x + c.w + shakeX, c.y + shakeY);
    CTX.lineTo(c.x + c.w + shakeX, c.y + bracketSize + shakeY);
    CTX.stroke();
    // Bottom-left
    CTX.beginPath();
    CTX.moveTo(c.x + shakeX, c.y + c.h - bracketSize + shakeY);
    CTX.lineTo(c.x + shakeX, c.y + c.h + shakeY);
    CTX.lineTo(c.x + bracketSize + shakeX, c.y + c.h + shakeY);
    CTX.stroke();
    // Bottom-right
    CTX.beginPath();
    CTX.moveTo(c.x + c.w - bracketSize + shakeX, c.y + c.h + shakeY);
    CTX.lineTo(c.x + c.w + shakeX, c.y + c.h + shakeY);
    CTX.lineTo(c.x + c.w + shakeX, c.y + c.h - bracketSize + shakeY);
    CTX.stroke();
    
    // Highlight reflections (metallic shine)
    CTX.fillStyle = 'rgba(255, 255, 255, 0.25)';
    CTX.fillRect(c.x + 2 + shakeX, c.y + 2 + shakeY, c.w - 4, 6);
    CTX.fillStyle = 'rgba(255, 255, 255, 0.15)';
    CTX.fillRect(c.x + 2 + shakeX, c.y + 2 + shakeY, 6, c.h - 4);
    
    // Rivets/studs at stripe intersections
    CTX.fillStyle = '#B7791F';
    const rivetPositions = [
        [c.x + 10, c.y + 10], [c.x + c.w - 10, c.y + 10],
        [c.x + 10, c.y + c.h - 10], [c.x + c.w - 10, c.y + c.h - 10]
    ];
    for (let [rx, ry] of rivetPositions) {
        CTX.beginPath();
        CTX.arc(rx + shakeX, ry + shakeY, 4, 0, Math.PI * 2);
        CTX.fill();
        // Rivet shine
        CTX.fillStyle = '#F6E05E';
        CTX.beginPath();
        CTX.arc(rx - 1 + shakeX, ry - 1 + shakeY, 1.5, 0, Math.PI * 2);
        CTX.fill();
        CTX.fillStyle = '#B7791F';
    }
    
    // Border frame
    CTX.strokeStyle = '#975A16';
    CTX.lineWidth = 3;
    CTX.strokeRect(c.x + shakeX, c.y + shakeY, c.w, c.h);

    // Draw damage cracks
    drawCrack(c.x + shakeX, c.y + shakeY, c.w, c.h, c.hp / c.maxHp, c.seed, { hitX: c.lastHitX, hitY: c.lastHitY });

    // HP bar with premium styling
    const hpRatio = c.hp / c.maxHp;
    CTX.fillStyle = 'rgba(0, 0, 0, 0.6)';
    CTX.fillRect(c.x + shakeX - 2, c.y - 14 + shakeY, c.w + 4, 8);
    
    // HP gradient based on health
    const hpGrad = CTX.createLinearGradient(c.x, c.y - 14, c.x, c.y - 6);
    if (hpRatio > 0.5) {
        hpGrad.addColorStop(0, '#E2E8F0');
        hpGrad.addColorStop(1, '#A0AEC0');
    } else if (hpRatio > 0.25) {
        hpGrad.addColorStop(0, '#F6E05E');
        hpGrad.addColorStop(1, '#D69E2E');
    } else {
        hpGrad.addColorStop(0, '#FC8181');
        hpGrad.addColorStop(1, '#E53E3E');
    }
    CTX.fillStyle = hpGrad;
    CTX.fillRect(c.x + shakeX, c.y - 12 + shakeY, c.w * hpRatio, 4);
}

// Core renderer paints background, props, actors, particles, UI overlays, and
// finally the minimap each frame. Ordering ensures alpha stacks correctly.
// Natural theme: Dirt and grass battlefield terrain
// GPU OPTIMIZED: Uses batching and minimal state changes for hardware acceleration
// VIEWPORT CULLING: Only renders objects visible on screen for performance
function draw() {
    // GPU Optimization: Reset transform state once at start to prevent transform accumulation
    CTX.setTransform(1, 0, 0, 1, 0, 0);
    
    // Sanitize camera position to prevent floating point glitches
    // Round to nearest pixel to avoid subpixel rendering artifacts
    if (isNaN(camX) || isNaN(camY)) {
        camX = 0;
        camY = 0;
    }
    // Clamp camera to world bounds to prevent visual artifacts
    camX = Math.round(camX);
    camY = Math.round(camY);
    
    // === VIEWPORT CULLING: Update bounds for this frame ===
    updateViewportBounds();
    
    // Random dirt/grass background (natural terrain)
    // Create seamless random terrain using noise-like pattern
    const tileSize = 40;
    const viewLeft = Math.floor(camX / tileSize) * tileSize;
    const viewTop = Math.floor(camY / tileSize) * tileSize;
    const viewRight = viewLeft + CANVAS.width + tileSize * 2;
    const viewBottom = viewTop + CANVAS.height + tileSize * 2;
    
    // Get terrain detail level from Smart Performance Optimizer
    const terrainDetail = typeof getTerrainDetail === 'function' ? getTerrainDetail() : 1.0;
    
    CTX.save();
    if (screenShake > 0) CTX.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
    CTX.translate(-camX, -camY);

    // Draw terrain tiles with seeded random for consistency
    // Enhanced battlefield terrain with BRIGHTER dirt, grass, and vibrant colors
    for (let tx = viewLeft; tx < viewRight; tx += tileSize) {
        for (let ty = viewTop; ty < viewBottom; ty += tileSize) {
            // Seeded random based on position for consistent terrain
            const seed = Math.sin((tx + terrainNoiseOffsetX) * 0.01) * Math.cos((ty + terrainNoiseOffsetY) * 0.01);
            const seed2 = Math.cos((tx + terrainNoiseOffsetX) * 0.013) * Math.sin((ty + terrainNoiseOffsetY) * 0.017);
            
            // Determine terrain type based on multiple seeds for natural variation
            const terrainValue = seed + seed2 * 0.5;
            
            // Base terrain colors - BRIGHTER and more vibrant palette
            let baseColor;
            if (terrainValue > 0.5) {
                // Sandy terrain (warm golden sand)
                baseColor = '#D4B896';
            } else if (terrainValue > 0.2) {
                // Light dirt (warm brown)
                baseColor = '#A89070';
            } else if (terrainValue > -0.1) {
                // Bright grass (vibrant green)
                baseColor = '#6B8E45';
            } else if (terrainValue > -0.3) {
                // Medium grass (fresh green)
                baseColor = '#5A7D42';
            } else {
                // Darker grass (still visible, not mud)
                baseColor = '#507339';
            }
            
            CTX.fillStyle = baseColor;
            CTX.fillRect(tx, ty, tileSize, tileSize);
            
            // === TERRAIN DETAIL (Controlled by Smart Performance Optimizer) ===
            // Skip detailed terrain rendering when performance is low
            if (terrainDetail < 0.3) continue; // Emergency mode: skip all details
            
            // Add terrain texture details
            const detailSeed = Math.abs(seed * 1000) % 10;
            
            // Grass blades for grass areas - brighter highlights (skip if detail < 0.7)
            if (terrainDetail >= 0.7 && terrainValue < 0.2 && terrainValue > -0.3) {
                CTX.fillStyle = 'rgba(100, 140, 60, 0.5)';
                const grassCount = Math.ceil(5 * terrainDetail);
                for (let i = 0; i < grassCount; i++) {
                    const gx = tx + ((seed * (i + 1) * 100) % tileSize);
                    const gy = ty + ((seed2 * (i + 2) * 100) % tileSize);
                    CTX.fillRect(gx, gy, 2, 4 + Math.abs(seed * 4));
                }
            }
            
            // Pebbles/rocks for dirt areas - lighter stones (skip if detail < 0.5)
            if (terrainDetail >= 0.5 && terrainValue > 0.2) {
                CTX.fillStyle = 'rgba(180, 160, 130, 0.4)';
                const pebbleCount = Math.ceil(3 * terrainDetail);
                for (let i = 0; i < pebbleCount; i++) {
                    const px = tx + ((seed * (i + 3) * 80) % (tileSize - 4));
                    const py = ty + ((seed2 * (i + 1) * 90) % (tileSize - 4));
                    CTX.beginPath();
                    CTX.arc(px + 2, py + 2, 2 + Math.abs(seed * 2), 0, Math.PI * 2);
                    CTX.fill();
                }
            }
            
            // Tire/track marks (subtle battle scars) - skip if detail < 0.8
            if (terrainDetail >= 0.8 && detailSeed > 7) {
                CTX.strokeStyle = 'rgba(80, 70, 55, 0.2)';
                CTX.lineWidth = 3;
                CTX.beginPath();
                CTX.moveTo(tx, ty + tileSize * 0.3);
                CTX.lineTo(tx + tileSize, ty + tileSize * 0.7);
                CTX.stroke();
            }
            
            // Subtle shadow for depth (lighter) - skip if detail < 0.6
            if (terrainDetail >= 0.6) {
                CTX.fillStyle = `rgba(0, 0, 0, ${Math.abs(seed) * 0.04})`;
                CTX.fillRect(tx, ty, tileSize, tileSize);
            }
            
            // Brighter highlights for sunlit effect - skip if detail < 0.9
            if (terrainDetail >= 0.9 && seed2 > 0.3) {
                CTX.fillStyle = `rgba(255, 255, 200, ${seed2 * 0.08})`;
                CTX.fillRect(tx, ty, tileSize / 2, tileSize / 2);
            }
        }
    }

    // === RIVER BORDER - Beautiful animated water surrounding the battlefield ===
    drawRiverBorder(frame);

    // Draw tank tracks (dirty trails) BEFORE walls/objects for realism
    // Only enemy tracks shown for better tracking of enemy movements
    // Get track quality from Smart Performance Optimizer
    const trackQuality = typeof getTrackQuality === 'function' ? getTrackQuality() : 1.0;
    
    // Skip track rendering entirely if quality is 0 (emergency mode)
    if (trackQuality > 0) {
    
    const trackViewLeft = camX - 100;
    const trackViewRight = camX + CANVAS.width + 100;
    const trackViewTop = camY - 100;
    const trackViewBottom = camY + CANVAS.height + 100;
    
    // Render tracks with GRADIENT OPACITY - older tracks (low index) more transparent,
    // newer tracks (high index) more solid. Creates smooth tail-to-head fade effect.
    CTX.save();
    
    const totalTracks = enemyTracks.length;
    
    // Render enemy tracks with sequential gradient opacity
    for (let i = 0; i < totalTracks; i++) {
        const track = enemyTracks[i];
        if (!track) continue;
        if (track.x < trackViewLeft || track.x > trackViewRight || track.y < trackViewTop || track.y > trackViewBottom) continue;
        
        // GRADIENT OPACITY based on position in array:
        // index 0 (oldest/tail) = most transparent
        // index max (newest/head) = most solid
        const positionRatio = totalTracks > 1 ? i / (totalTracks - 1) : 1; // 0 to 1
        
        // Also factor in life-based fade for smooth disappearance
        const baseAlpha = track.baseAlpha || 0.30;
        const lifeAlpha = track.alpha ?? baseAlpha;
        const lifeFreshness = Math.max(0, Math.min(1, lifeAlpha / baseAlpha));
        
        // Combine position gradient with life fade:
        // - Position gradient: older tracks more transparent (0.1 to 1.0)
        // - Life fade: dying tracks fade out smoothly
        const positionAlpha = 0.05 + positionRatio * 0.95; // Range: 0.05 (tail) to 1.0 (head)
        const combinedFreshness = positionAlpha * lifeFreshness;
        
        // Final alpha - very subtle to prevent overlap darkening
        const trackAlpha = Math.min(0.12, combinedFreshness * 0.12);
        
        // Skip nearly invisible tracks
        if (trackAlpha < 0.003) continue;
        
        const treadOffset = track.treadOffset || 20;
        const treadWidth = track.width || 10;
        
        // Color also fades with position - older tracks lighter/more faded
        const colorFade = Math.pow(combinedFreshness, 0.4);
        const dirtR = Math.round(140 - colorFade * 20);  // Lighter when faded
        const dirtG = Math.round(125 - colorFade * 15);
        const dirtB = Math.round(100 - colorFade * 10);
        
        // If we have previous position, draw continuous line from prev to current
        if (typeof track.prevX === 'number' && typeof track.prevY === 'number') {
            // Calculate wheel positions with smooth curve interpolation
            const cosAngle = Math.cos(track.angle);
            const sinAngle = Math.sin(track.angle);
            const prevAngle = track.prevAngle ?? track.angle;
            const cosPrevAngle = Math.cos(prevAngle);
            const sinPrevAngle = Math.sin(prevAngle);
            
            // LEFT track positions (perpendicular to tank facing direction)
            const leftCurrX = track.x + sinAngle * treadOffset;
            const leftCurrY = track.y - cosAngle * treadOffset;
            const leftPrevX = track.prevX + sinPrevAngle * treadOffset;
            const leftPrevY = track.prevY - cosPrevAngle * treadOffset;
            
            // RIGHT track positions
            const rightCurrX = track.x - sinAngle * treadOffset;
            const rightCurrY = track.y + cosAngle * treadOffset;
            const rightPrevX = track.prevX - sinPrevAngle * treadOffset;
            const rightPrevY = track.prevY + cosPrevAngle * treadOffset;
            
            // Calculate movement direction vector for better curve control
            const dx = track.x - track.prevX;
            const dy = track.y - track.prevY;
            const dist = Math.hypot(dx, dy);
            
            CTX.lineCap = 'round';
            CTX.lineJoin = 'round';
            
            // Single clean track stroke - no multiple layers to prevent darkening
            CTX.globalAlpha = trackAlpha;
            CTX.strokeStyle = `rgb(${dirtR}, ${dirtG}, ${dirtB})`;
            CTX.lineWidth = treadWidth;
            
            // === TRACK RENDERING QUALITY OPTIMIZATION ===
            // Use bezier curves only when quality >= 0.5, otherwise use simple lines
            if (trackQuality >= 0.5) {
                // Use tank facing direction for control points (more natural tank movement)
                // Tank tracks follow the direction the tank is facing, not movement direction
                const currDirX = Math.cos(track.angle);
                const currDirY = Math.sin(track.angle);
                const prevDirX = Math.cos(prevAngle);
                const prevDirY = Math.sin(prevAngle);
                
                // Adaptive tension based on angle change - stronger curves on sharp turns
                const angleDiff = Math.abs(track.angle - prevAngle);
                const normalizedAngle = Math.min(angleDiff, Math.PI * 2 - angleDiff);
                const turnFactor = 1 + normalizedAngle * 3; // Much stronger curves on sharp turns
                const curveTension = dist * 0.5 * turnFactor; // Increased base tension
                
                // Control points follow tank facing direction for natural track curves
                // First control point extends from prev position in tank's prev facing direction
                const leftCtrl1X = leftPrevX + prevDirX * curveTension;
                const leftCtrl1Y = leftPrevY + prevDirY * curveTension;
                // Second control point extends back from current position in reverse of current facing
                const leftCtrl2X = leftCurrX - currDirX * curveTension;
                const leftCtrl2Y = leftCurrY - currDirY * curveTension;
                
                const rightCtrl1X = rightPrevX + prevDirX * curveTension;
                const rightCtrl1Y = rightPrevY + prevDirY * curveTension;
                const rightCtrl2X = rightCurrX - currDirX * curveTension;
                const rightCtrl2Y = rightCurrY - currDirY * curveTension;
            
                // LEFT track with Bezier curve for smooth turns
                CTX.beginPath();
                CTX.moveTo(leftPrevX, leftPrevY);
                CTX.bezierCurveTo(leftCtrl1X, leftCtrl1Y, leftCtrl2X, leftCtrl2Y, leftCurrX, leftCurrY);
                CTX.stroke();
                
                // RIGHT track with Bezier curve
                CTX.beginPath();
                CTX.moveTo(rightPrevX, rightPrevY);
                CTX.bezierCurveTo(rightCtrl1X, rightCtrl1Y, rightCtrl2X, rightCtrl2Y, rightCurrX, rightCurrY);
                CTX.stroke();
                
                // Subtle inner line for depth (very light) - only on fresh tracks and high quality
                if (trackQuality >= 0.6 && combinedFreshness > 0.6) {
                    CTX.globalAlpha = trackAlpha * 0.5;
                    CTX.strokeStyle = `rgb(${dirtR - 15}, ${dirtG - 12}, ${dirtB - 10})`;
                    CTX.lineWidth = treadWidth * 0.35;
                    
                    CTX.beginPath();
                    CTX.moveTo(leftPrevX, leftPrevY);
                    CTX.bezierCurveTo(leftCtrl1X, leftCtrl1Y, leftCtrl2X, leftCtrl2Y, leftCurrX, leftCurrY);
                    CTX.stroke();
                    
                    CTX.beginPath();
                    CTX.moveTo(rightPrevX, rightPrevY);
                    CTX.bezierCurveTo(rightCtrl1X, rightCtrl1Y, rightCtrl2X, rightCtrl2Y, rightCurrX, rightCurrY);
                    CTX.stroke();
                }
            } else {
                // LOW QUALITY MODE: Use simple straight lines instead of bezier curves
                // Much faster rendering at the cost of less smooth track appearance
                
                // LEFT track - simple line
                CTX.beginPath();
                CTX.moveTo(leftPrevX, leftPrevY);
                CTX.lineTo(leftCurrX, leftCurrY);
                CTX.stroke();
                
                // RIGHT track - simple line
                CTX.beginPath();
                CTX.moveTo(rightPrevX, rightPrevY);
                CTX.lineTo(rightCurrX, rightCurrY);
                CTX.stroke();
            }
        }
    }
    
    CTX.globalAlpha = 1;
    CTX.restore();
    
    } // End of track rendering block (trackQuality > 0)
    
    // Get shadow quality from Smart Performance Optimizer
    const shadowQuality = typeof getShadowQuality === 'function' ? getShadowQuality() : 1.0;

    for (let w of walls) {
        if (w.x < camX + CANVAS.width && w.x + w.w > camX && w.y < camY + CANVAS.height && w.y + w.h > camY) {
            // Apply shake effect if exists
            const shakeX = w.shakeX || 0;
            const shakeY = w.shakeY || 0;
            
            // Dramatic wall shadow with blur for soft edges
            // OPTIMIZED: Use blur only when shadowQuality > 0
            if (shadowQuality > 0) {
                CTX.save();
                // Reduce blur radius based on quality (3px at full, 1px at low)
                const blurRadius = Math.max(1, Math.round(3 * shadowQuality));
                CTX.filter = `blur(${blurRadius}px)`;
                CTX.fillStyle = `rgba(0, 0, 0, ${0.35 * shadowQuality})`;
                CTX.fillRect(w.x + 6 + shakeX, w.y + 6 + shakeY, w.w, w.h);
                CTX.filter = 'none';
                CTX.restore();
            } else {
                // No blur - simple shadow for emergency mode
                CTX.fillStyle = 'rgba(0, 0, 0, 0.15)';
                CTX.fillRect(w.x + 4 + shakeX, w.y + 4 + shakeY, w.w, w.h);
            }
            
            // Determine wall type based on size: thin walls = sandbags/barriers, thick = shipping containers
            const isThick = w.w > 70 || w.h > 70;
            
            if (isThick) {
                // ==================== SHIPPING CONTAINER ====================
                // Rusty military container with battle damage
                
                // Container base (weathered steel)
                const gradient = CTX.createLinearGradient(w.x, w.y, w.x, w.y + w.h);
                gradient.addColorStop(0, '#5D6D7E');
                gradient.addColorStop(0.3, '#4A5568');
                gradient.addColorStop(0.7, '#3D4852');
                gradient.addColorStop(1, '#2D3748');
                CTX.fillStyle = gradient;
                CTX.fillRect(w.x + shakeX, w.y + shakeY, w.w, w.h);
                
                // Container frame (heavy steel edges)
                CTX.strokeStyle = '#1A202C';
                CTX.lineWidth = 5;
                CTX.strokeRect(w.x + shakeX, w.y + shakeY, w.w, w.h);
                
                // Corrugated ridges (horizontal)
                CTX.strokeStyle = '#2D3748';
                CTX.lineWidth = 2;
                const ridgeCount = Math.floor(w.h / 15);
                for (let i = 1; i < ridgeCount; i++) {
                    CTX.beginPath();
                    CTX.moveTo(w.x + 4 + shakeX, w.y + (w.h / ridgeCount) * i + shakeY);
                    CTX.lineTo(w.x + w.w - 4 + shakeX, w.y + (w.h / ridgeCount) * i + shakeY);
                    CTX.stroke();
                }
                
                // Rust stains and weathering
                CTX.fillStyle = 'rgba(139, 69, 19, 0.25)';
                CTX.fillRect(w.x + w.w * 0.65 + shakeX, w.y + 5 + shakeY, w.w * 0.25, w.h * 0.4);
                CTX.fillRect(w.x + 5 + shakeX, w.y + w.h * 0.6 + shakeY, w.w * 0.3, w.h * 0.35);
                
                // Paint peeling / battle damage marks
                CTX.fillStyle = 'rgba(80, 70, 60, 0.3)';
                CTX.fillRect(w.x + w.w * 0.2 + shakeX, w.y + w.h * 0.3 + shakeY, 15, 20);
                
                // Inner panel (recessed area)
                CTX.fillStyle = '#4A5568';
                CTX.fillRect(w.x + 10 + shakeX, w.y + 10 + shakeY, w.w - 20, w.h - 20);
                
                // Heavy corner bolts/rivets
                CTX.fillStyle = '#1A202C';
                const boltPositions = [
                    [w.x + 8, w.y + 8], [w.x + w.w - 8, w.y + 8],
                    [w.x + 8, w.y + w.h - 8], [w.x + w.w - 8, w.y + w.h - 8],
                    [w.x + w.w / 2, w.y + 8], [w.x + w.w / 2, w.y + w.h - 8]
                ];
                for (let [bx, by] of boltPositions) {
                    CTX.beginPath();
                    CTX.arc(bx + shakeX, by + shakeY, 5, 0, Math.PI * 2);
                    CTX.fill();
                    // Bolt highlight
                    CTX.fillStyle = '#718096';
                    CTX.beginPath();
                    CTX.arc(bx - 1 + shakeX, by - 1 + shakeY, 2, 0, Math.PI * 2);
                    CTX.fill();
                    CTX.fillStyle = '#1A202C';
                }
                
                // Warning stripes (hazard marking)
                CTX.fillStyle = '#D69E2E';
                CTX.fillRect(w.x + shakeX, w.y + w.h - 12 + shakeY, w.w, 4);
                CTX.fillStyle = '#1A202C';
                for (let i = 0; i < w.w / 12; i++) {
                    if (i % 2 === 0) {
                        CTX.fillRect(w.x + i * 12 + shakeX, w.y + w.h - 12 + shakeY, 6, 4);
                    }
                }
                
                // Container number/marking
                CTX.fillStyle = 'rgba(255, 255, 255, 0.15)';
                CTX.font = 'bold 10px monospace';
                CTX.fillText('MIL-' + Math.floor(w.x + w.y) % 999, w.x + 12 + shakeX, w.y + 22 + shakeY);
                
            } else {
                // ==================== CONCRETE BARRIER / SANDBAGS ====================
                // Military fortification barrier
                
                // Concrete base with gradient
                const concreteGrad = CTX.createLinearGradient(w.x, w.y, w.x, w.y + w.h);
                concreteGrad.addColorStop(0, '#A0AEC0');
                concreteGrad.addColorStop(0.5, '#8E9AAB');
                concreteGrad.addColorStop(1, '#718096');
                CTX.fillStyle = concreteGrad;
                CTX.fillRect(w.x + shakeX, w.y + shakeY, w.w, w.h);
                
                // Concrete texture (aggregate/stone spots)
                CTX.fillStyle = 'rgba(120, 120, 120, 0.4)';
                for (let i = 0; i < 12; i++) {
                    const spotX = w.x + ((w.x * 7 + i * 13) % (w.w - 6)) + 3;
                    const spotY = w.y + ((w.y * 11 + i * 17) % (w.h - 6)) + 3;
                    CTX.beginPath();
                    CTX.arc(spotX + shakeX, spotY + shakeY, 2 + (i % 3), 0, Math.PI * 2);
                    CTX.fill();
                }
                
                // Wear marks and stains
                CTX.fillStyle = 'rgba(70, 60, 50, 0.2)';
                CTX.fillRect(w.x + w.w * 0.1 + shakeX, w.y + w.h * 0.7 + shakeY, w.w * 0.4, w.h * 0.25);
                
                // Top highlight (beveled edge)
                CTX.fillStyle = 'rgba(255, 255, 255, 0.2)';
                CTX.fillRect(w.x + shakeX, w.y + shakeY, w.w, 4);
                CTX.fillRect(w.x + shakeX, w.y + shakeY, 4, w.h);
                
                // Bottom/right shadow (depth)
                CTX.fillStyle = 'rgba(0, 0, 0, 0.25)';
                CTX.fillRect(w.x + shakeX, w.y + w.h - 4 + shakeY, w.w, 4);
                CTX.fillRect(w.x + w.w - 4 + shakeX, w.y + shakeY, 4, w.h);
                
                // Border
                CTX.strokeStyle = '#4A5568';
                CTX.lineWidth = 2;
                CTX.strokeRect(w.x + shakeX, w.y + shakeY, w.w, w.h);
                
                // Cracks in concrete
                CTX.strokeStyle = 'rgba(60, 60, 60, 0.4)';
                CTX.lineWidth = 1;
                CTX.beginPath();
                CTX.moveTo(w.x + w.w * 0.3 + shakeX, w.y + shakeY);
                CTX.lineTo(w.x + w.w * 0.4 + shakeX, w.y + w.h * 0.4 + shakeY);
                CTX.lineTo(w.x + w.w * 0.35 + shakeX, w.y + w.h + shakeY);
                CTX.stroke();
            }
            
            if (w.destructible) drawCrack(w.x + shakeX, w.y + shakeY, w.w, w.h, w.hp / w.maxHp, w.seed, { hitX: w.lastHitX, hitY: w.lastHitY });
        }
    }
    for (let c of crates) {
        if (c.x < camX + CANVAS.width && c.x + c.w > camX && c.y < camY + CANVAS.height && c.y + c.h > camY) drawCrate(c);
    }
    
    // Type-specific visual effects for item drops
    // Creates unique particle/aura effects that represent each item type
    function drawDropTypeEffect(x, y, dropId, color) {
        const phase = frame * 0.05;
        
        switch (dropId) {
            case 'hp':
                // HP: Rising plus symbols (+) particles
                for (let i = 0; i < 3; i++) {
                    const plusPhase = (phase + i * 2) % 6.28;
                    const plusY = y - 15 - Math.abs(Math.sin(plusPhase)) * 20;
                    const plusX = x + Math.sin(plusPhase * 0.5 + i) * 8;
                    const plusAlpha = 0.3 + Math.sin(plusPhase) * 0.2;
                    
                    CTX.globalAlpha = plusAlpha;
                    CTX.strokeStyle = '#22c55e';
                    CTX.lineWidth = 2;
                    // Draw plus sign
                    CTX.beginPath();
                    CTX.moveTo(plusX - 4, plusY);
                    CTX.lineTo(plusX + 4, plusY);
                    CTX.moveTo(plusX, plusY - 4);
                    CTX.lineTo(plusX, plusY + 4);
                    CTX.stroke();
                }
                CTX.globalAlpha = 1;
                break;
                
            case 'en':
                // Energy: Electric zigzag lines
                CTX.globalAlpha = 0.5 + Math.sin(phase * 2) * 0.2;
                CTX.strokeStyle = '#06b6d4';
                CTX.lineWidth = 2;
                for (let i = 0; i < 2; i++) {
                    const startAngle = phase * 3 + i * Math.PI;
                    CTX.beginPath();
                    let bx = x + Math.cos(startAngle) * 12;
                    let by = y + Math.sin(startAngle) * 8;
                    CTX.moveTo(bx, by);
                    for (let s = 0; s < 4; s++) {
                        bx += (Math.random() - 0.5) * 6;
                        by -= 5;
                        CTX.lineTo(bx, by);
                    }
                    CTX.stroke();
                }
                CTX.globalAlpha = 1;
                break;
                
            case 'shield':
                // Shield: Hexagonal barrier aura
                CTX.globalAlpha = 0.3 + Math.sin(phase) * 0.15;
                CTX.strokeStyle = '#3b82f6';
                CTX.lineWidth = 2;
                const shieldRadius = 22 + Math.sin(phase * 2) * 3;
                CTX.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = (i * Math.PI * 2) / 6 - Math.PI / 2 + phase * 0.5;
                    const sx = x + Math.cos(angle) * shieldRadius;
                    const sy = y + Math.sin(angle) * shieldRadius * 0.7;
                    if (i === 0) CTX.moveTo(sx, sy);
                    else CTX.lineTo(sx, sy);
                }
                CTX.closePath();
                CTX.stroke();
                CTX.globalAlpha = 1;
                break;
                
            case 'armor':
                // Armor: Metal plate fragments orbiting
                for (let i = 0; i < 4; i++) {
                    const armorAngle = phase * 1.5 + (i * Math.PI / 2);
                    const armorR = 18 + Math.sin(phase + i) * 3;
                    const ax = x + Math.cos(armorAngle) * armorR;
                    const ay = y + Math.sin(armorAngle) * armorR * 0.6;
                    
                    CTX.globalAlpha = 0.6;
                    CTX.fillStyle = '#78716c';
                    CTX.beginPath();
                    CTX.rect(ax - 3, ay - 2, 6, 4);
                    CTX.fill();
                    CTX.strokeStyle = '#57534e';
                    CTX.lineWidth = 1;
                    CTX.stroke();
                }
                CTX.globalAlpha = 1;
                break;
                
            case 'autoaim':
                // Auto-aim: Crosshair targeting effect
                CTX.globalAlpha = 0.5 + Math.sin(phase * 3) * 0.3;
                CTX.strokeStyle = '#fef08a';
                CTX.lineWidth = 1.5;
                const aimSize = 20 + Math.sin(phase * 2) * 4;
                // Crosshair lines
                CTX.beginPath();
                CTX.moveTo(x - aimSize, y);
                CTX.lineTo(x - 8, y);
                CTX.moveTo(x + 8, y);
                CTX.lineTo(x + aimSize, y);
                CTX.moveTo(x, y - aimSize);
                CTX.lineTo(x, y - 8);
                CTX.moveTo(x, y + 8);
                CTX.lineTo(x, y + aimSize);
                CTX.stroke();
                // Corner brackets
                CTX.beginPath();
                CTX.arc(x, y, aimSize - 3, 0, Math.PI * 2);
                CTX.setLineDash([4, 8]);
                CTX.lineDashOffset = -frame * 0.5;
                CTX.stroke();
                CTX.setLineDash([]);
                CTX.globalAlpha = 1;
                break;
                
            case 'revive':
                // Revive: Heart pulse with sparkles
                const heartScale = 1 + Math.sin(phase * 4) * 0.15;
                CTX.globalAlpha = 0.6;
                CTX.fillStyle = '#ff69b4';
                CTX.beginPath();
                const hx = x, hy = y - 25;
                const hs = 6 * heartScale;
                CTX.moveTo(hx, hy + hs * 0.3);
                CTX.bezierCurveTo(hx - hs, hy - hs * 0.5, hx - hs * 1.5, hy + hs * 0.5, hx, hy + hs * 1.2);
                CTX.bezierCurveTo(hx + hs * 1.5, hy + hs * 0.5, hx + hs, hy - hs * 0.5, hx, hy + hs * 0.3);
                CTX.fill();
                // Sparkles around heart
                for (let i = 0; i < 4; i++) {
                    const sparkAngle = phase * 2 + i * 1.57;
                    const sparkR = 15 + Math.sin(phase + i) * 5;
                    CTX.fillStyle = '#fce7f3';
                    CTX.beginPath();
                    CTX.arc(x + Math.cos(sparkAngle) * sparkR, y - 20 + Math.sin(sparkAngle) * 8, 2, 0, Math.PI * 2);
                    CTX.fill();
                }
                CTX.globalAlpha = 1;
                break;
                
            case 'lifesteal':
                // Lifesteal: Blood droplets flowing inward
                for (let i = 0; i < 4; i++) {
                    const dropAngle = phase + i * 1.57;
                    const dropR = 22 - (Math.sin(phase + i) * 0.5 + 0.5) * 10;
                    const dx = x + Math.cos(dropAngle) * dropR;
                    const dy = y + Math.sin(dropAngle) * dropR;
                    
                    CTX.globalAlpha = 0.5 + Math.sin(phase + i) * 0.2;
                    CTX.fillStyle = '#fb7185';
                    // Teardrop shape
                    CTX.beginPath();
                    CTX.moveTo(dx, dy - 4);
                    CTX.bezierCurveTo(dx - 3, dy, dx - 3, dy + 3, dx, dy + 4);
                    CTX.bezierCurveTo(dx + 3, dy + 3, dx + 3, dy, dx, dy - 4);
                    CTX.fill();
                }
                CTX.globalAlpha = 1;
                break;
                
            case 'turbo':
                // Turbo: Speed lines radiating outward
                CTX.globalAlpha = 0.5;
                CTX.strokeStyle = '#fb923c';
                CTX.lineWidth = 2;
                for (let i = 0; i < 6; i++) {
                    const lineAngle = phase * 3 + i * 1.05;
                    const lineStart = 14;
                    const lineEnd = 24 + Math.sin(phase * 4 + i) * 6;
                    CTX.beginPath();
                    CTX.moveTo(x + Math.cos(lineAngle) * lineStart, y + Math.sin(lineAngle) * lineStart);
                    CTX.lineTo(x + Math.cos(lineAngle) * lineEnd, y + Math.sin(lineAngle) * lineEnd);
                    CTX.stroke();
                }
                CTX.globalAlpha = 1;
                break;
                
            case 'magnet':
                // Magnet: Magnetic field lines curving inward
                CTX.globalAlpha = 0.4;
                CTX.strokeStyle = '#22d3ee';
                CTX.lineWidth = 1.5;
                for (let i = 0; i < 4; i++) {
                    const fieldAngle = i * Math.PI / 2 + phase;
                    CTX.beginPath();
                    for (let t = 0; t <= 1; t += 0.1) {
                        const r = 30 - t * 20;
                        const a = fieldAngle + Math.sin(t * 3 + phase) * 0.5;
                        const fx = x + Math.cos(a) * r;
                        const fy = y + Math.sin(a) * r * 0.7;
                        if (t === 0) CTX.moveTo(fx, fy);
                        else CTX.lineTo(fx, fy);
                    }
                    CTX.stroke();
                }
                CTX.globalAlpha = 1;
                break;
                
            case 'stealth':
                // Stealth: Fading ghostly rings
                for (let i = 0; i < 3; i++) {
                    const ringR = 16 + i * 6 + Math.sin(phase + i) * 2;
                    CTX.globalAlpha = 0.3 - i * 0.08;
                    CTX.strokeStyle = '#c084fc';
                    CTX.lineWidth = 2 - i * 0.5;
                    CTX.setLineDash([2, 4 + i * 2]);
                    CTX.lineDashOffset = frame * 0.3 * (i % 2 === 0 ? 1 : -1);
                    CTX.beginPath();
                    CTX.arc(x, y, ringR, 0, Math.PI * 2);
                    CTX.stroke();
                }
                CTX.setLineDash([]);
                CTX.globalAlpha = 1;
                break;
                
            case 'hp_max':
                // MAX HP UP: Dramatic pulsing green cross with energy rings
                {
                    const maxHpPulse = 0.7 + Math.sin(phase * 3) * 0.3;
                    const ringExpand = (phase * 0.5) % 1;
                    
                    // Expanding energy rings
                    for (let ring = 0; ring < 3; ring++) {
                        const ringPhase = (ringExpand + ring * 0.33) % 1;
                        const ringRadius = 10 + ringPhase * 35;
                        const ringAlpha = (1 - ringPhase) * 0.4;
                        
                        CTX.globalAlpha = ringAlpha;
                        CTX.strokeStyle = '#22c55e';
                        CTX.lineWidth = 3 * (1 - ringPhase);
                        CTX.beginPath();
                        CTX.arc(x, y, ringRadius, 0, Math.PI * 2);
                        CTX.stroke();
                    }
                    
                    // Central glowing cross (larger than regular HP)
                    CTX.globalAlpha = maxHpPulse;
                    CTX.shadowColor = '#22c55e';
                    CTX.shadowBlur = 15;
                    CTX.strokeStyle = '#4ade80';
                    CTX.lineWidth = 4;
                    
                    // Thick cross
                    CTX.beginPath();
                    CTX.moveTo(x - 12, y);
                    CTX.lineTo(x + 12, y);
                    CTX.moveTo(x, y - 12);
                    CTX.lineTo(x, y + 12);
                    CTX.stroke();
                    
                    // Inner bright core
                    CTX.fillStyle = '#ffffff';
                    CTX.beginPath();
                    CTX.arc(x, y, 4, 0, Math.PI * 2);
                    CTX.fill();
                    
                    // Orbiting plus particles
                    for (let i = 0; i < 4; i++) {
                        const orbitAngle = phase * 2 + i * (Math.PI / 2);
                        const orbitDist = 20 + Math.sin(phase * 3 + i) * 4;
                        const px = x + Math.cos(orbitAngle) * orbitDist;
                        const py = y + Math.sin(orbitAngle) * orbitDist;
                        
                        CTX.globalAlpha = 0.5;
                        CTX.strokeStyle = '#86efac';
                        CTX.lineWidth = 2;
                        CTX.beginPath();
                        CTX.moveTo(px - 3, py);
                        CTX.lineTo(px + 3, py);
                        CTX.moveTo(px, py - 3);
                        CTX.lineTo(px, py + 3);
                        CTX.stroke();
                    }
                    
                    CTX.shadowBlur = 0;
                    CTX.globalAlpha = 1;
                }
                break;
                
            case 'en_max':
                // MAX ENERGY UP: Dramatic electric energy burst with lightning
                {
                    const maxEnPulse = 0.7 + Math.sin(phase * 4) * 0.3;
                    const burstPhase = (phase * 0.6) % 1;
                    
                    // Energy burst rings
                    for (let ring = 0; ring < 3; ring++) {
                        const ringPhase = (burstPhase + ring * 0.33) % 1;
                        const ringRadius = 8 + ringPhase * 40;
                        const ringAlpha = (1 - ringPhase) * 0.5;
                        
                        CTX.globalAlpha = ringAlpha;
                        CTX.strokeStyle = '#06b6d4';
                        CTX.lineWidth = 2.5 * (1 - ringPhase);
                        CTX.setLineDash([3, 6]);
                        CTX.lineDashOffset = -frame * 0.8;
                        CTX.beginPath();
                        CTX.arc(x, y, ringRadius, 0, Math.PI * 2);
                        CTX.stroke();
                        CTX.setLineDash([]);
                    }
                    
                    // Central energy core with glow
                    CTX.shadowColor = '#22d3ee';
                    CTX.shadowBlur = 20;
                    CTX.globalAlpha = maxEnPulse;
                    
                    // Energy bolt shape (lightning bolt)
                    CTX.fillStyle = '#67e8f9';
                    CTX.beginPath();
                    CTX.moveTo(x + 2, y - 14);
                    CTX.lineTo(x - 5, y - 2);
                    CTX.lineTo(x + 1, y - 2);
                    CTX.lineTo(x - 3, y + 14);
                    CTX.lineTo(x + 6, y + 2);
                    CTX.lineTo(x, y + 2);
                    CTX.closePath();
                    CTX.fill();
                    
                    // Electric sparks radiating out
                    for (let i = 0; i < 6; i++) {
                        const sparkAngle = phase * 3 + i * (Math.PI / 3);
                        const sparkDist = 22 + Math.sin(frame * 0.3 + i * 2) * 6;
                        
                        CTX.globalAlpha = 0.4 + Math.sin(frame * 0.5 + i) * 0.2;
                        CTX.strokeStyle = '#22d3ee';
                        CTX.lineWidth = 2;
                        CTX.beginPath();
                        
                        // Mini lightning bolt
                        let sx = x + Math.cos(sparkAngle) * 12;
                        let sy = y + Math.sin(sparkAngle) * 12;
                        CTX.moveTo(sx, sy);
                        for (let seg = 0; seg < 3; seg++) {
                            sx += Math.cos(sparkAngle) * 5 + (Math.random() - 0.5) * 4;
                            sy += Math.sin(sparkAngle) * 5 + (Math.random() - 0.5) * 4;
                            CTX.lineTo(sx, sy);
                        }
                        CTX.stroke();
                    }
                    
                    CTX.shadowBlur = 0;
                    CTX.globalAlpha = 1;
                }
                break;
                
            default:
                // Weapon-specific particle effects for weapon drops
                // Each weapon has unique animated particles matching its theme
                if (['cannon', 'shotgun', 'rocket', 'laser', 'twin', 'sniper', 'burst', 'flak', 'gauss', 'ice', 'fire', 'electric'].includes(dropId)) {
                    drawWeaponDropEffect(x, y, dropId, color, phase);
                }
                break;
        }
    }
    
    // Draw weapon-specific particle effects for weapon item drops
    // Effects now surround the item (360 degrees) for dramatic visibility
    function drawWeaponDropEffect(x, y, weaponId, color, phase) {
        switch(weaponId) {
            case 'cannon':
                // Explosive impact particles - orbiting smoke puffs around item
                for (let i = 0; i < 6; i++) {
                    const puffAngle = phase * 1.5 + i * (Math.PI / 3);
                    const puffDist = 22 + Math.sin(phase * 2 + i) * 5;
                    const px = x + Math.cos(puffAngle) * puffDist;
                    const py = y + Math.sin(puffAngle) * puffDist;
                    const puffSize = 4 + Math.sin(phase * 1.5 + i) * 2;
                    
                    CTX.globalAlpha = 0.35 + Math.sin(puffAngle) * 0.15;
                    CTX.fillStyle = '#777';
                    CTX.beginPath();
                    CTX.arc(px, py, puffSize, 0, Math.PI * 2);
                    CTX.fill();
                    
                    // Inner bright core
                    CTX.fillStyle = '#aaa';
                    CTX.beginPath();
                    CTX.arc(px, py, puffSize * 0.5, 0, Math.PI * 2);
                    CTX.fill();
                }
                // Falling shell casings (multiple around)
                for (let i = 0; i < 3; i++) {
                    const casingAngle = Math.PI * 0.3 + i * 0.8;
                    const shellProgress = ((phase * 2 + i * 0.5) % 1);
                    const shellY = y - 25 + shellProgress * 35;
                    const shellX = x + Math.cos(casingAngle) * 12;
                    const shellAlpha = shellProgress < 0.7 ? 0.5 : 0.5 * (1 - (shellProgress - 0.7) / 0.3);
                    
                    CTX.globalAlpha = shellAlpha;
                    CTX.fillStyle = '#d4a574';
                    CTX.save();
                    CTX.translate(shellX, shellY);
                    CTX.rotate(shellProgress * Math.PI);
                    CTX.fillRect(-2, -4, 4, 8);
                    CTX.restore();
                }
                CTX.globalAlpha = 1;
                break;
                
            case 'twin':
                // Dual bullet trails orbiting around
                for (let orbit = 0; orbit < 2; orbit++) {
                    const orbitAngle = phase * 3 + orbit * Math.PI;
                    const orbitDist = 20 + Math.sin(phase * 2) * 4;
                    
                    for (let i = 0; i < 4; i++) {
                        const trailAngle = orbitAngle - i * 0.3;
                        const trailDist = orbitDist - i * 2;
                        const tx = x + Math.cos(trailAngle) * trailDist;
                        const ty = y + Math.sin(trailAngle) * trailDist;
                        const alpha = 0.5 - i * 0.1;
                        
                        CTX.globalAlpha = alpha;
                        CTX.fillStyle = color;
                        CTX.beginPath();
                        CTX.arc(tx, ty, 2.5 - i * 0.4, 0, Math.PI * 2);
                        CTX.fill();
                    }
                }
                CTX.globalAlpha = 1;
                break;
                
            case 'shotgun':
                // Pellet spread pattern - burst outward in all directions
                for (let i = 0; i < 12; i++) {
                    const spreadAngle = i * (Math.PI * 2 / 12) + Math.sin(phase + i) * 0.15;
                    const pelletPhase = (phase * 2 + i * 0.1) % 1;
                    const pelletDist = 8 + pelletPhase * 22;
                    const px = x + Math.cos(spreadAngle) * pelletDist;
                    const py = y + Math.sin(spreadAngle) * pelletDist;
                    
                    CTX.globalAlpha = (1 - pelletPhase) * 0.6;
                    CTX.fillStyle = color;
                    CTX.beginPath();
                    CTX.arc(px, py, 2 * (1 - pelletPhase * 0.5), 0, Math.PI * 2);
                    CTX.fill();
                }
                // Central glow
                CTX.globalAlpha = 0.3 + Math.sin(phase * 3) * 0.15;
                const shotgunGlow = CTX.createRadialGradient(x, y, 0, x, y, 18);
                shotgunGlow.addColorStop(0, color);
                shotgunGlow.addColorStop(1, 'transparent');
                CTX.fillStyle = shotgunGlow;
                CTX.beginPath();
                CTX.arc(x, y, 18, 0, Math.PI * 2);
                CTX.fill();
                CTX.globalAlpha = 1;
                break;
                
            case 'sniper':
                // Precision tracer lines radiating outward
                CTX.globalAlpha = 0.35 + Math.sin(phase * 2) * 0.2;
                CTX.strokeStyle = '#00ffff';
                CTX.lineWidth = 1.5;
                
                for (let i = 0; i < 4; i++) {
                    const lineAngle = phase * 0.5 + i * (Math.PI / 2);
                    const lineStart = 10;
                    const lineEnd = 28 + Math.sin(phase * 2 + i) * 6;
                    
                    CTX.beginPath();
                    CTX.moveTo(x + Math.cos(lineAngle) * lineStart, y + Math.sin(lineAngle) * lineStart);
                    CTX.lineTo(x + Math.cos(lineAngle) * lineEnd, y + Math.sin(lineAngle) * lineEnd);
                    CTX.stroke();
                }
                
                // Scope glint (rotating)
                const glintAngle = phase * 1.5;
                const glintX = x + Math.cos(glintAngle) * 8;
                const glintY = y + Math.sin(glintAngle) * 8;
                CTX.globalAlpha = 0.5 + Math.sin(phase * 4) * 0.3;
                CTX.fillStyle = '#ffffff';
                CTX.beginPath();
                CTX.arc(glintX, glintY, 3, 0, Math.PI * 2);
                CTX.fill();
                CTX.globalAlpha = 1;
                break;
                
            case 'burst':
                // Triple burst pattern - orbiting energy bolts
                for (let b = 0; b < 3; b++) {
                    const burstAngle = phase * 3 + b * (Math.PI * 2 / 3);
                    const burstDist = 18 + Math.sin(phase * 4 + b) * 4;
                    const bx = x + Math.cos(burstAngle) * burstDist;
                    const by = y + Math.sin(burstAngle) * burstDist;
                    
                    // Energy trail behind each bolt
                    for (let t = 0; t < 3; t++) {
                        const trailAngle = burstAngle - t * 0.2;
                        const trailDist = burstDist - t * 3;
                        const tx = x + Math.cos(trailAngle) * trailDist;
                        const ty = y + Math.sin(trailAngle) * trailDist;
                        
                        CTX.globalAlpha = (0.4 - t * 0.1);
                        CTX.fillStyle = color;
                        CTX.beginPath();
                        CTX.arc(tx, ty, 2.5 - t * 0.5, 0, Math.PI * 2);
                        CTX.fill();
                    }
                    
                    // Main bolt
                    CTX.globalAlpha = 0.7;
                    CTX.fillStyle = '#ffffff';
                    CTX.beginPath();
                    CTX.arc(bx, by, 3, 0, Math.PI * 2);
                    CTX.fill();
                }
                // Central energy glow
                CTX.globalAlpha = 0.25 + Math.sin(phase * 4) * 0.1;
                const burstGlow = CTX.createRadialGradient(x, y, 0, x, y, 15);
                burstGlow.addColorStop(0, color);
                burstGlow.addColorStop(1, 'transparent');
                CTX.fillStyle = burstGlow;
                CTX.beginPath();
                CTX.arc(x, y, 15, 0, Math.PI * 2);
                CTX.fill();
                CTX.globalAlpha = 1;
                break;
                
            case 'flak':
                // Explosive shrapnel particles - orbiting explosion
                for (let i = 0; i < 8; i++) {
                    const shrapAngle = phase * 2 + i * (Math.PI / 4);
                    const shrapDist = 16 + Math.sin(phase * 3 + i) * 6;
                    const sx = x + Math.cos(shrapAngle) * shrapDist;
                    const sy = y + Math.sin(shrapAngle) * shrapDist;
                    
                    CTX.globalAlpha = 0.5 + Math.sin(phase * 2 + i) * 0.2;
                    CTX.fillStyle = '#fbbf24';
                    CTX.save();
                    CTX.translate(sx, sy);
                    CTX.rotate(shrapAngle + phase);
                    CTX.fillRect(-3, -1, 6, 2);
                    CTX.restore();
                }
                // Explosion glow
                CTX.globalAlpha = 0.3 + Math.sin(phase * 3) * 0.15;
                const flakGlow = CTX.createRadialGradient(x, y, 0, x, y, 20);
                flakGlow.addColorStop(0, '#ff6600');
                flakGlow.addColorStop(0.5, '#fbbf24');
                flakGlow.addColorStop(1, 'transparent');
                CTX.fillStyle = flakGlow;
                CTX.beginPath();
                CTX.arc(x, y, 20, 0, Math.PI * 2);
                CTX.fill();
                CTX.globalAlpha = 1;
                break;
                
            case 'rocket':
                // Rocket smoke trail and flame - surrounding effect
                // Orbiting smoke puffs
                for (let i = 0; i < 5; i++) {
                    const smokeAngle = phase * 1.2 + i * (Math.PI * 2 / 5);
                    const smokeDist = 20 + Math.sin(phase * 2 + i) * 5;
                    const smokeX = x + Math.cos(smokeAngle) * smokeDist;
                    const smokeY = y + Math.sin(smokeAngle) * smokeDist;
                    const smokeSize = 4 + Math.sin(phase + i) * 2;
                    
                    CTX.globalAlpha = 0.35 - Math.abs(Math.sin(phase + i)) * 0.1;
                    CTX.fillStyle = '#777';
                    CTX.beginPath();
                    CTX.arc(smokeX, smokeY, smokeSize, 0, Math.PI * 2);
                    CTX.fill();
                }
                // Rocket flame trails
                for (let f = 0; f < 3; f++) {
                    const flameAngle = phase * 2.5 + f * (Math.PI * 2 / 3);
                    const flameDist = 12;
                    CTX.globalAlpha = 0.6 + Math.random() * 0.2;
                    
                    const fx = x + Math.cos(flameAngle) * flameDist;
                    const fy = y + Math.sin(flameAngle) * flameDist;
                    const flameGrad = CTX.createRadialGradient(fx, fy, 0, fx, fy, 8);
                    flameGrad.addColorStop(0, '#ffcc00');
                    flameGrad.addColorStop(0.5, '#ff6b35');
                    flameGrad.addColorStop(1, 'transparent');
                    CTX.fillStyle = flameGrad;
                    CTX.beginPath();
                    CTX.arc(fx, fy, 8, 0, Math.PI * 2);
                    CTX.fill();
                }
                CTX.globalAlpha = 1;
                break;
                
            case 'laser':
                // Plasma beam energy particles - orbiting rings
                const beamPulse = 0.5 + Math.sin(phase * 4) * 0.3;
                
                // Orbiting energy particles
                for (let i = 0; i < 6; i++) {
                    const particleAngle = phase * 4 + i * (Math.PI / 3);
                    const particleDist = 18 + Math.sin(phase * 3 + i) * 4;
                    const px = x + Math.cos(particleAngle) * particleDist;
                    const py = y + Math.sin(particleAngle) * particleDist;
                    
                    CTX.globalAlpha = beamPulse * 0.6;
                    CTX.fillStyle = '#00e5ff';
                    CTX.beginPath();
                    CTX.arc(px, py, 2 + Math.sin(phase * 2 + i) * 0.5, 0, Math.PI * 2);
                    CTX.fill();
                }
                
                // Energy rings expanding
                for (let ring = 0; ring < 3; ring++) {
                    const ringPhase = (phase * 2 + ring * 0.33) % 1;
                    const ringRadius = 8 + ringPhase * 18;
                    
                    CTX.globalAlpha = (1 - ringPhase) * 0.4;
                    CTX.strokeStyle = '#67e8f9';
                    CTX.lineWidth = 1.5;
                    CTX.beginPath();
                    CTX.arc(x, y, ringRadius, 0, Math.PI * 2);
                    CTX.stroke();
                }
                
                // Central plasma glow
                CTX.globalAlpha = beamPulse * 0.4;
                const laserGlow = CTX.createRadialGradient(x, y, 0, x, y, 12);
                laserGlow.addColorStop(0, '#00e5ff');
                laserGlow.addColorStop(1, 'transparent');
                CTX.fillStyle = laserGlow;
                CTX.beginPath();
                CTX.arc(x, y, 12, 0, Math.PI * 2);
                CTX.fill();
                CTX.globalAlpha = 1;
                break;
                
            case 'gauss':
                // Electromagnetic rail sparks - orbiting around item
                // Orbiting magnetic particles
                for (let i = 0; i < 6; i++) {
                    const particleAngle = phase * 3 + i * (Math.PI / 3);
                    const particleDist = 18 + Math.sin(phase * 2 + i) * 4;
                    const px = x + Math.cos(particleAngle) * particleDist;
                    const py = y + Math.sin(particleAngle) * particleDist;
                    
                    CTX.globalAlpha = 0.5 + Math.sin(phase * 3 + i) * 0.2;
                    CTX.fillStyle = '#c084fc';
                    CTX.beginPath();
                    CTX.arc(px, py, 2, 0, Math.PI * 2);
                    CTX.fill();
                }
                
                // Electric arcs radiating outward
                CTX.strokeStyle = '#8b5cf6';
                CTX.lineWidth = 1.5;
                for (let i = 0; i < 4; i++) {
                    const arcAngle = phase * 2 + i * (Math.PI / 2);
                    CTX.globalAlpha = 0.4 + Math.random() * 0.3;
                    CTX.beginPath();
                    
                    let ax = x + Math.cos(arcAngle) * 8;
                    let ay = y + Math.sin(arcAngle) * 8;
                    CTX.moveTo(ax, ay);
                    
                    for (let seg = 0; seg < 3; seg++) {
                        ax += Math.cos(arcAngle) * 5 + (Math.random() - 0.5) * 4;
                        ay += Math.sin(arcAngle) * 5 + (Math.random() - 0.5) * 4;
                        CTX.lineTo(ax, ay);
                    }
                    CTX.stroke();
                }
                
                // Central magnetic glow
                CTX.globalAlpha = 0.3 + Math.sin(phase * 4) * 0.1;
                const gaussGlow = CTX.createRadialGradient(x, y, 0, x, y, 15);
                gaussGlow.addColorStop(0, '#a855f7');
                gaussGlow.addColorStop(1, 'transparent');
                CTX.fillStyle = gaussGlow;
                CTX.beginPath();
                CTX.arc(x, y, 15, 0, Math.PI * 2);
                CTX.fill();
                CTX.globalAlpha = 1;
                break;
                
            case 'ice':
                // Frost crystals and snowflakes - orbiting around item
                CTX.strokeStyle = '#60a5fa';
                CTX.lineWidth = 1.5;
                
                // Orbiting ice crystals
                for (let i = 0; i < 6; i++) {
                    const crystalAngle = phase * 0.8 + i * (Math.PI / 3);
                    const crystalDist = 18 + Math.sin(phase + i) * 4;
                    const cx = x + Math.cos(crystalAngle) * crystalDist;
                    const cy = y + Math.sin(crystalAngle) * crystalDist;
                    
                    CTX.globalAlpha = 0.5 + Math.sin(phase * 2 + i) * 0.2;
                    CTX.save();
                    CTX.translate(cx, cy);
                    CTX.rotate(crystalAngle + phase);
                    
                    // Six-pointed crystal
                    for (let arm = 0; arm < 6; arm++) {
                        const armAngle = arm * Math.PI / 3;
                        CTX.beginPath();
                        CTX.moveTo(0, 0);
                        CTX.lineTo(Math.cos(armAngle) * 4, Math.sin(armAngle) * 4);
                        CTX.stroke();
                    }
                    CTX.restore();
                }
                
                // Cold mist particles - all around
                CTX.fillStyle = '#93c5fd';
                for (let i = 0; i < 8; i++) {
                    const mistAngle = phase + i * (Math.PI / 4);
                    const mistPhase = (phase * 1.5 + i * 0.3) % 1;
                    const mistDist = 10 + mistPhase * 15;
                    const mistX = x + Math.cos(mistAngle) * mistDist;
                    const mistY = y + Math.sin(mistAngle) * mistDist - mistPhase * 8;
                    
                    CTX.globalAlpha = (1 - mistPhase) * 0.4;
                    CTX.beginPath();
                    CTX.arc(mistX, mistY, 2.5 * (1 - mistPhase * 0.5), 0, Math.PI * 2);
                    CTX.fill();
                }
                
                // Frost glow
                CTX.globalAlpha = 0.25 + Math.sin(phase * 2) * 0.1;
                const iceGlow = CTX.createRadialGradient(x, y, 0, x, y, 16);
                iceGlow.addColorStop(0, '#60a5fa');
                iceGlow.addColorStop(1, 'transparent');
                CTX.fillStyle = iceGlow;
                CTX.beginPath();
                CTX.arc(x, y, 16, 0, Math.PI * 2);
                CTX.fill();
                CTX.globalAlpha = 1;
                break;
                
            case 'fire':
                // Flame particles - rising all around item
                for (let i = 0; i < 8; i++) {
                    const flameAngle = i * (Math.PI / 4) + Math.sin(phase + i) * 0.2;
                    const flamePhase = (phase * 2.5 + i * 0.2) % 1;
                    const flameDist = 8 + flamePhase * 18;
                    const flameX = x + Math.cos(flameAngle) * flameDist * 0.7;
                    const flameY = y + Math.sin(flameAngle) * flameDist * 0.5 - flamePhase * 15;
                    const flameSize = 4 * (1 - flamePhase);
                    
                    // Flame gradient from orange to yellow
                    CTX.globalAlpha = (1 - flamePhase) * 0.7;
                    const flameColor = flamePhase < 0.4 ? '#ff4500' : (flamePhase < 0.7 ? '#ff6b35' : '#ffcc00');
                    CTX.fillStyle = flameColor;
                    CTX.beginPath();
                    CTX.arc(flameX, flameY, flameSize, 0, Math.PI * 2);
                    CTX.fill();
                }
                
                // Heat shimmer ring
                CTX.globalAlpha = 0.25 + Math.sin(phase * 3) * 0.1;
                const fireGlow = CTX.createRadialGradient(x, y, 5, x, y, 20);
                fireGlow.addColorStop(0, '#ff6b35');
                fireGlow.addColorStop(0.5, '#ff9500');
                fireGlow.addColorStop(1, 'transparent');
                CTX.fillStyle = fireGlow;
                CTX.beginPath();
                CTX.arc(x, y, 20, 0, Math.PI * 2);
                CTX.fill();
                
                // Embers
                CTX.fillStyle = '#ffcc00';
                for (let i = 0; i < 4; i++) {
                    const emberAngle = phase * 1.5 + i * (Math.PI / 2);
                    const emberDist = 15 + Math.sin(phase * 3 + i) * 5;
                    const ex = x + Math.cos(emberAngle) * emberDist;
                    const ey = y + Math.sin(emberAngle) * emberDist;
                    
                    CTX.globalAlpha = 0.5 + Math.sin(phase * 4 + i) * 0.3;
                    CTX.beginPath();
                    CTX.arc(ex, ey, 1.5, 0, Math.PI * 2);
                    CTX.fill();
                }
                CTX.globalAlpha = 1;
                break;
                
            case 'electric':
                // Lightning bolts and sparks - radiating outward
                CTX.strokeStyle = '#ffeb3b';
                CTX.lineWidth = 2;
                
                // Main lightning arcs from center
                for (let bolt = 0; bolt < 4; bolt++) {
                    const boltAngle = phase * 2.5 + bolt * (Math.PI / 2);
                    CTX.globalAlpha = 0.5 + Math.random() * 0.3;
                    CTX.beginPath();
                    
                    let bx = x + Math.cos(boltAngle) * 6;
                    let by = y + Math.sin(boltAngle) * 6;
                    CTX.moveTo(bx, by);
                    
                    for (let seg = 0; seg < 4; seg++) {
                        bx += Math.cos(boltAngle) * 5 + (Math.random() - 0.5) * 5;
                        by += Math.sin(boltAngle) * 5 + (Math.random() - 0.5) * 5;
                        CTX.lineTo(bx, by);
                    }
                    CTX.stroke();
                }
                
                // Orbiting electric sparks
                CTX.fillStyle = '#ffffff';
                for (let i = 0; i < 6; i++) {
                    const sparkAngle = phase * 4 + i * (Math.PI / 3);
                    const sparkDist = 16 + Math.sin(phase * 3 + i) * 4;
                    const sx = x + Math.cos(sparkAngle) * sparkDist;
                    const sy = y + Math.sin(sparkAngle) * sparkDist;
                    
                    CTX.globalAlpha = 0.6 + Math.sin(phase * 5 + i) * 0.3;
                    CTX.beginPath();
                    CTX.arc(sx, sy, 2, 0, Math.PI * 2);
                    CTX.fill();
                }
                
                // Electric glow
                CTX.globalAlpha = 0.3 + Math.sin(phase * 5) * 0.15;
                const electricGlow = CTX.createRadialGradient(x, y, 0, x, y, 14);
                electricGlow.addColorStop(0, '#a855f7');
                electricGlow.addColorStop(0.5, '#ffeb3b');
                electricGlow.addColorStop(1, 'transparent');
                CTX.fillStyle = electricGlow;
                CTX.beginPath();
                CTX.arc(x, y, 14, 0, Math.PI * 2);
                CTX.fill();
                CTX.globalAlpha = 1;
                break;
        }
    }
    
    // Draw mini weapon turret for weapon item drops
    // Turret is now positioned to integrate with hexagon shape
    function drawMiniWeaponTurret(x, y, weaponId, color) {
        // Enlarged scale for better visibility on hexagon
        const scale = 0.70;
        
        // Derive colors for 3D effect - matching drawWeaponTurret style
        const darkerShade = adjustColor(color, -30);
        const lighterShade = adjustColor(color, 30);
        
        CTX.save();
        // Position turret at the given y coordinate (caller calculates correct position)
        CTX.translate(x, y);
        CTX.rotate(-Math.PI / 2); // Point upward
        CTX.scale(scale, scale);
        
        // Subtle turret shadow
        CTX.fillStyle = 'rgba(0, 0, 0, 0.25)';
        CTX.beginPath();
        CTX.arc(2, 2, 10, 0, Math.PI * 2);
        CTX.fill();
        
        CTX.strokeStyle = '#1a1a1a';
        CTX.lineWidth = 1.2;
        
        switch(weaponId) {
            case 'cannon': {
                // Heavy main battle tank cannon - matching drawWeaponTurret
                const barrelGrad = CTX.createLinearGradient(0, -6, 0, 6);
                barrelGrad.addColorStop(0, lighterShade);
                barrelGrad.addColorStop(0.5, color);
                barrelGrad.addColorStop(1, darkerShade);
                
                CTX.fillStyle = barrelGrad;
                CTX.beginPath();
                CTX.moveTo(0, -6);
                CTX.lineTo(28, -5);
                CTX.lineTo(28, 5);
                CTX.lineTo(0, 6);
                CTX.closePath();
                CTX.fill();
                CTX.stroke();
                
                // Barrel reinforcement rings
                CTX.fillStyle = darkerShade;
                CTX.fillRect(7, -6.5, 3, 13);
                CTX.fillRect(18, -6, 3, 12);
                
                // Muzzle brake - T-shape
                CTX.fillStyle = color;
                CTX.beginPath();
                CTX.moveTo(28, -5);
                CTX.lineTo(33, -8);
                CTX.lineTo(36, -8);
                CTX.lineTo(36, 8);
                CTX.lineTo(33, 8);
                CTX.lineTo(28, 5);
                CTX.closePath();
                CTX.fill();
                CTX.stroke();
                
                // Bore evacuator bulge
                CTX.fillStyle = color;
                CTX.beginPath();
                CTX.ellipse(13, 0, 3, 7, 0, 0, Math.PI * 2);
                CTX.fill();
                CTX.stroke();
                break;
            }
                
            case 'twin': {
                // Dual barrel autocannon - matching drawWeaponTurret
                const twinGrad = CTX.createLinearGradient(0, -12, 0, 12);
                twinGrad.addColorStop(0, lighterShade);
                twinGrad.addColorStop(0.5, color);
                twinGrad.addColorStop(1, darkerShade);
                
                CTX.fillStyle = twinGrad;
                
                // Top barrel
                CTX.beginPath();
                CTX.roundRect(0, -11, 30, 6, 2);
                CTX.fill();
                CTX.stroke();
                
                // Bottom barrel
                CTX.beginPath();
                CTX.roundRect(0, 5, 30, 6, 2);
                CTX.fill();
                CTX.stroke();
                
                // Central housing connecting both barrels
                CTX.fillStyle = darkerShade;
                CTX.beginPath();
                CTX.roundRect(-3, -5, 14, 10, 2);
                CTX.fill();
                CTX.stroke();
                
                // Ammunition feed ports
                CTX.fillStyle = '#222';
                CTX.fillRect(2, -3, 2, 6);
                CTX.fillRect(6, -3, 2, 6);
                
                // Muzzle tips
                CTX.fillStyle = '#333';
                CTX.fillRect(28, -10, 4, 4);
                CTX.fillRect(28, 6, 4, 4);
                break;
            }
                
            case 'shotgun': {
                // Wide bore scatter gun with drum - matching drawWeaponTurret
                const shotgunGrad = CTX.createLinearGradient(0, -9, 0, 9);
                shotgunGrad.addColorStop(0, lighterShade);
                shotgunGrad.addColorStop(0.5, color);
                shotgunGrad.addColorStop(1, darkerShade);
                
                CTX.fillStyle = shotgunGrad;
                
                // Wide barrel with flared muzzle
                CTX.beginPath();
                CTX.moveTo(0, -5);
                CTX.lineTo(20, -6);
                CTX.lineTo(24, -9);
                CTX.lineTo(32, -12);
                CTX.lineTo(32, 12);
                CTX.lineTo(24, 9);
                CTX.lineTo(20, 6);
                CTX.lineTo(0, 5);
                CTX.closePath();
                CTX.fill();
                CTX.stroke();
                
                // Drum magazine
                CTX.fillStyle = darkerShade;
                CTX.beginPath();
                CTX.arc(-2, 0, 8, 0, Math.PI * 2);
                CTX.fill();
                CTX.stroke();
                
                // Drum detail - shell chambers
                CTX.fillStyle = '#444';
                for (let i = 0; i < 6; i++) {
                    const angle = (Math.PI * 2 / 6) * i;
                    const cx = -2 + Math.cos(angle) * 4;
                    const cy = Math.sin(angle) * 4;
                    CTX.beginPath();
                    CTX.arc(cx, cy, 2, 0, Math.PI * 2);
                    CTX.fill();
                }
                break;
            }
                
            case 'sniper': {
                // Long precision rifle with scope - matching drawWeaponTurret
                const sniperGrad = CTX.createLinearGradient(0, -5, 0, 5);
                sniperGrad.addColorStop(0, lighterShade);
                sniperGrad.addColorStop(0.5, color);
                sniperGrad.addColorStop(1, darkerShade);
                
                CTX.fillStyle = sniperGrad;
                
                // Main long barrel - slim
                CTX.beginPath();
                CTX.roundRect(0, -3, 44, 6, 2);
                CTX.fill();
                CTX.stroke();
                
                // Barrel shroud with cooling holes
                CTX.fillStyle = darkerShade;
                CTX.beginPath();
                CTX.roundRect(4, -4, 26, 8, 2);
                CTX.fill();
                CTX.stroke();
                
                // Cooling holes
                CTX.fillStyle = '#222';
                for (let i = 0; i < 4; i++) {
                    CTX.beginPath();
                    CTX.ellipse(8 + i * 5, 0, 1.2, 2.5, 0, 0, Math.PI * 2);
                    CTX.fill();
                }
                
                // Muzzle brake
                CTX.fillStyle = color;
                CTX.fillRect(40, -4, 6, 8);
                CTX.strokeRect(40, -4, 6, 8);
                
                // Scope mount
                CTX.fillStyle = '#333';
                CTX.fillRect(12, -9, 12, 4);
                CTX.strokeRect(12, -9, 12, 4);
                
                // Scope lens
                CTX.fillStyle = '#00e5ff';
                CTX.globalAlpha = 0.7;
                CTX.beginPath();
                CTX.arc(18, -7, 3, 0, Math.PI * 2);
                CTX.fill();
                CTX.globalAlpha = 1;
                
                // Scope lens reflection
                CTX.fillStyle = '#fff';
                CTX.globalAlpha = 0.4;
                CTX.beginPath();
                CTX.arc(17, -8, 1.2, 0, Math.PI * 2);
                CTX.fill();
                CTX.globalAlpha = 1;
                break;
            }
                
            case 'burst': {
                // Triple-barrel burst rifle - matching drawWeaponTurret
                const burstGrad = CTX.createLinearGradient(0, -10, 0, 10);
                burstGrad.addColorStop(0, lighterShade);
                burstGrad.addColorStop(0.5, color);
                burstGrad.addColorStop(1, darkerShade);
                
                CTX.fillStyle = burstGrad;
                
                // Three barrels in triangular formation
                CTX.beginPath();
                CTX.roundRect(3, -10, 27, 5, 1);
                CTX.fill();
                CTX.stroke();
                
                CTX.beginPath();
                CTX.roundRect(2, -2.5, 30, 5, 1);
                CTX.fill();
                CTX.stroke();
                
                CTX.beginPath();
                CTX.roundRect(3, 5, 27, 5, 1);
                CTX.fill();
                CTX.stroke();
                
                // Receiver housing - angular
                CTX.fillStyle = darkerShade;
                CTX.beginPath();
                CTX.moveTo(-3, -8);
                CTX.lineTo(6, -8);
                CTX.lineTo(8, -2);
                CTX.lineTo(8, 2);
                CTX.lineTo(6, 8);
                CTX.lineTo(-3, 8);
                CTX.closePath();
                CTX.fill();
                CTX.stroke();
                
                // Ejection port
                CTX.fillStyle = '#222';
                CTX.fillRect(0, -6, 3, 5);
                
                // Barrel tips - flash hiders
                CTX.fillStyle = '#333';
                CTX.fillRect(28, -9, 3, 3);
                CTX.fillRect(30, -1.5, 3, 3);
                CTX.fillRect(28, 6, 3, 3);
                break;
            }
                
            case 'flak': {
                // Heavy flak cannon - matching drawWeaponTurret
                const flakGrad = CTX.createLinearGradient(0, -8, 0, 8);
                flakGrad.addColorStop(0, lighterShade);
                flakGrad.addColorStop(0.5, color);
                flakGrad.addColorStop(1, darkerShade);
                
                CTX.fillStyle = flakGrad;
                
                // Main barrel - thick and sturdy
                CTX.beginPath();
                CTX.roundRect(0, -7, 28, 14, 3);
                CTX.fill();
                CTX.stroke();
                
                // Recoil spring housing on top
                CTX.fillStyle = darkerShade;
                CTX.beginPath();
                CTX.roundRect(3, -11, 18, 4, 2);
                CTX.fill();
                CTX.stroke();
                
                // Magazine drum
                CTX.fillStyle = darkerShade;
                CTX.beginPath();
                CTX.arc(-3, 0, 10, 0, Math.PI * 2);
                CTX.fill();
                CTX.stroke();
                
                // Drum hatch
                CTX.fillStyle = '#444';
                CTX.beginPath();
                CTX.arc(-3, 0, 5, 0, Math.PI * 2);
                CTX.fill();
                
                // Muzzle - large bore
                CTX.fillStyle = '#333';
                CTX.beginPath();
                CTX.arc(30, 0, 6, -Math.PI/2, Math.PI/2);
                CTX.lineTo(30, -6);
                CTX.closePath();
                CTX.fill();
                CTX.stroke();
                
                // Bore darkness
                CTX.fillStyle = '#111';
                CTX.beginPath();
                CTX.arc(30, 0, 4, 0, Math.PI * 2);
                CTX.fill();
                break;
            }
                
            case 'rocket': {
                // Rocket launcher tube - matching drawWeaponTurret
                const rocketGrad = CTX.createLinearGradient(0, -10, 0, 10);
                rocketGrad.addColorStop(0, lighterShade);
                rocketGrad.addColorStop(0.5, color);
                rocketGrad.addColorStop(1, darkerShade);
                
                CTX.fillStyle = rocketGrad;
                
                // Main launch tube - rounded
                CTX.beginPath();
                CTX.moveTo(-3, -9);
                CTX.lineTo(25, -9);
                CTX.quadraticCurveTo(32, -9, 32, 0);
                CTX.quadraticCurveTo(32, 9, 25, 9);
                CTX.lineTo(-3, 9);
                CTX.closePath();
                CTX.fill();
                CTX.stroke();
                
                // Tube opening (bore)
                CTX.fillStyle = '#111';
                CTX.beginPath();
                CTX.arc(29, 0, 6, 0, Math.PI * 2);
                CTX.fill();
                
                // Rocket visible inside
                CTX.fillStyle = '#666';
                CTX.beginPath();
                CTX.arc(26, 0, 4, 0, Math.PI * 2);
                CTX.fill();
                CTX.fillStyle = '#ff4444';
                CTX.beginPath();
                CTX.moveTo(26, -3);
                CTX.lineTo(32, 0);
                CTX.lineTo(26, 3);
                CTX.closePath();
                CTX.fill();
                
                // Warning markings
                CTX.fillStyle = '#ffcc00';
                CTX.globalAlpha = 0.7;
                CTX.fillRect(7, -8, 3, 16);
                CTX.fillRect(15, -8, 3, 16);
                CTX.globalAlpha = 1;
                
                // Side rails
                CTX.fillStyle = darkerShade;
                CTX.fillRect(0, -12, 20, 3);
                CTX.fillRect(0, 9, 20, 3);
                break;
            }
                
            case 'laser': {
                // Plasma beam emitter - matching drawWeaponTurret
                const laserGrad = CTX.createLinearGradient(0, -6, 0, 6);
                laserGrad.addColorStop(0, lighterShade);
                laserGrad.addColorStop(0.5, color);
                laserGrad.addColorStop(1, darkerShade);
                
                CTX.fillStyle = laserGrad;
                
                // Main housing
                CTX.beginPath();
                CTX.roundRect(0, -6, 32, 12, 4);
                CTX.fill();
                CTX.stroke();
                
                // Energy coils along barrel
                CTX.strokeStyle = '#00e5ff';
                CTX.lineWidth = 2;
                for (let i = 0; i < 3; i++) {
                    CTX.globalAlpha = 0.6;
                    CTX.beginPath();
                    CTX.arc(8 + i * 9, 0, 4, 0, Math.PI * 2);
                    CTX.stroke();
                }
                CTX.globalAlpha = 1;
                CTX.strokeStyle = '#1a1a1a';
                CTX.lineWidth = 1.2;
                
                // Emitter tip glow
                CTX.fillStyle = '#00e5ff';
                CTX.globalAlpha = 0.8;
                CTX.beginPath();
                CTX.arc(34, 0, 4, 0, Math.PI * 2);
                CTX.fill();
                CTX.globalAlpha = 1;
                
                // Emitter housing
                CTX.fillStyle = '#333';
                CTX.beginPath();
                CTX.arc(34, 0, 2.5, 0, Math.PI * 2);
                CTX.fill();
                
                // Capacitor bank on top
                CTX.fillStyle = darkerShade;
                CTX.fillRect(4, -10, 16, 4);
                CTX.strokeRect(4, -10, 16, 4);
                break;
            }
                
            case 'gauss': {
                // Electromagnetic rail gun - matching drawWeaponTurret
                const gaussGrad = CTX.createLinearGradient(0, -8, 0, 8);
                gaussGrad.addColorStop(0, lighterShade);
                gaussGrad.addColorStop(0.5, color);
                gaussGrad.addColorStop(1, darkerShade);
                
                CTX.fillStyle = gaussGrad;
                
                // Main barrel housing
                CTX.beginPath();
                CTX.roundRect(0, -7, 38, 14, 3);
                CTX.fill();
                CTX.stroke();
                
                // Magnetic rails (top and bottom) - exposed
                CTX.fillStyle = '#8b5cf6';
                CTX.fillRect(5, -10, 30, 3);
                CTX.fillRect(5, 7, 30, 3);
                
                // Rail glow effect
                CTX.strokeStyle = '#c084fc';
                CTX.lineWidth = 1.5;
                CTX.globalAlpha = 0.6;
                CTX.beginPath();
                CTX.moveTo(7, -8.5);
                CTX.lineTo(33, -8.5);
                CTX.moveTo(7, 8.5);
                CTX.lineTo(33, 8.5);
                CTX.stroke();
                CTX.globalAlpha = 1;
                CTX.strokeStyle = '#1a1a1a';
                CTX.lineWidth = 1.2;
                
                // Capacitor coils
                CTX.fillStyle = darkerShade;
                for (let i = 0; i < 3; i++) {
                    CTX.beginPath();
                    CTX.arc(10 + i * 9, 0, 3, 0, Math.PI * 2);
                    CTX.fill();
                    CTX.stroke();
                }
                
                // Muzzle charge glow
                CTX.fillStyle = '#c084fc';
                CTX.globalAlpha = 0.7;
                CTX.beginPath();
                CTX.arc(40, 0, 3, 0, Math.PI * 2);
                CTX.fill();
                CTX.globalAlpha = 1;
                break;
            }
                
            case 'ice': {
                // Frost cannon - crystalline barrel - matching drawWeaponTurret
                const iceGrad = CTX.createLinearGradient(0, -7, 0, 7);
                iceGrad.addColorStop(0, '#bae6fd');
                iceGrad.addColorStop(0.5, color);
                iceGrad.addColorStop(1, '#1e3a5f');
                
                CTX.fillStyle = iceGrad;
                
                // Main crystalline barrel - faceted shape
                CTX.beginPath();
                CTX.moveTo(0, -5);
                CTX.lineTo(8, -6);
                CTX.lineTo(20, -8);
                CTX.lineTo(28, -4);
                CTX.lineTo(33, 0);
                CTX.lineTo(28, 4);
                CTX.lineTo(20, 8);
                CTX.lineTo(8, 6);
                CTX.lineTo(0, 5);
                CTX.closePath();
                CTX.fill();
                CTX.stroke();
                
                // Ice crystal spikes - top
                CTX.fillStyle = '#93c5fd';
                CTX.globalAlpha = 0.8;
                CTX.beginPath();
                CTX.moveTo(12, -8);
                CTX.lineTo(14, -14);
                CTX.lineTo(16, -8);
                CTX.closePath();
                CTX.fill();
                
                CTX.beginPath();
                CTX.moveTo(22, -7);
                CTX.lineTo(24, -12);
                CTX.lineTo(26, -7);
                CTX.closePath();
                CTX.fill();
                
                // Ice crystal spikes - bottom
                CTX.beginPath();
                CTX.moveTo(12, 8);
                CTX.lineTo(14, 14);
                CTX.lineTo(16, 8);
                CTX.closePath();
                CTX.fill();
                
                CTX.beginPath();
                CTX.moveTo(22, 7);
                CTX.lineTo(24, 12);
                CTX.lineTo(26, 7);
                CTX.closePath();
                CTX.fill();
                
                CTX.globalAlpha = 1;
                
                // Frost core glow at tip
                CTX.fillStyle = '#fff';
                CTX.globalAlpha = 0.6;
                CTX.beginPath();
                CTX.arc(31, 0, 2.5, 0, Math.PI * 2);
                CTX.fill();
                CTX.globalAlpha = 1;
                break;
            }
                
            case 'fire': {
                // Inferno gun - heat radiating barrel - matching drawWeaponTurret
                const fireGrad = CTX.createLinearGradient(0, -8, 0, 8);
                fireGrad.addColorStop(0, '#ff9500');
                fireGrad.addColorStop(0.5, color);
                fireGrad.addColorStop(1, '#8b2500');
                
                CTX.fillStyle = fireGrad;
                
                // Main flamethrower barrel - chunky with nozzle
                CTX.beginPath();
                CTX.moveTo(0, -7);
                CTX.lineTo(22, -7);
                CTX.lineTo(25, -5);
                CTX.lineTo(32, -3);
                CTX.lineTo(32, 3);
                CTX.lineTo(25, 5);
                CTX.lineTo(22, 7);
                CTX.lineTo(0, 7);
                CTX.closePath();
                CTX.fill();
                CTX.stroke();
                
                // Heat vents - glowing
                CTX.fillStyle = 'rgba(255, 80, 0, 0.7)';
                for (let i = 0; i < 4; i++) {
                    CTX.fillRect(5 + i * 5, -10, 2.5, 4);
                    CTX.fillRect(5 + i * 5, 6, 2.5, 4);
                }
                
                // Pilot flame at muzzle
                CTX.fillStyle = '#ff6b35';
                CTX.globalAlpha = 0.8;
                CTX.beginPath();
                CTX.moveTo(32, -2);
                CTX.quadraticCurveTo(37, 0, 32, 2);
                CTX.quadraticCurveTo(40, 0, 32, -2);
                CTX.fill();
                
                // Inner flame
                CTX.fillStyle = '#ffcc00';
                CTX.beginPath();
                CTX.moveTo(32, -1);
                CTX.quadraticCurveTo(35, 0, 32, 1);
                CTX.quadraticCurveTo(37, 0, 32, -1);
                CTX.fill();
                CTX.globalAlpha = 1;
                
                // Fuel tank
                CTX.fillStyle = darkerShade;
                CTX.beginPath();
                CTX.ellipse(-2, 0, 5, 8, 0, 0, Math.PI * 2);
                CTX.fill();
                CTX.stroke();
                break;
            }
                
            case 'electric': {
                // Tesla coil rifle - matching drawWeaponTurret
                const electricGrad = CTX.createLinearGradient(0, -6, 0, 6);
                electricGrad.addColorStop(0, '#c084fc');
                electricGrad.addColorStop(0.5, color);
                electricGrad.addColorStop(1, '#5b21b6');
                
                CTX.fillStyle = electricGrad;
                
                // Main housing
                CTX.beginPath();
                CTX.roundRect(0, -6, 30, 12, 4);
                CTX.fill();
                CTX.stroke();
                
                // Tesla coil rings
                CTX.strokeStyle = '#a855f7';
                CTX.lineWidth = 2.5;
                for (let i = 0; i < 2; i++) {
                    CTX.globalAlpha = 0.6;
                    CTX.beginPath();
                    CTX.arc(9 + i * 12, 0, 6 - i * 2, 0, Math.PI * 2);
                    CTX.stroke();
                }
                CTX.globalAlpha = 1;
                CTX.strokeStyle = '#1a1a1a';
                CTX.lineWidth = 1.2;
                
                // Capacitor coils
                CTX.fillStyle = '#6d28d9';
                CTX.beginPath();
                CTX.arc(9, 0, 2.5, 0, Math.PI * 2);
                CTX.fill();
                CTX.beginPath();
                CTX.arc(21, 0, 2.5, 0, Math.PI * 2);
                CTX.fill();
                
                // Electric arcs at tip
                CTX.strokeStyle = '#ffeb3b';
                CTX.lineWidth = 1.2;
                CTX.globalAlpha = 0.7;
                for (let i = 0; i < 2; i++) {
                    CTX.beginPath();
                    CTX.moveTo(30, 0);
                    const endX = 36 + i * 4;
                    const endY = (i === 0 ? -6 : 6);
                    CTX.lineTo(33, endY * 0.4);
                    CTX.lineTo(endX, endY);
                    CTX.stroke();
                }
                CTX.globalAlpha = 1;
                CTX.strokeStyle = '#1a1a1a';
                CTX.lineWidth = 1.2;
                
                // Electrode tip
                CTX.fillStyle = '#e879f9';
                CTX.globalAlpha = 0.8;
                CTX.beginPath();
                CTX.arc(32, 0, 2.5, 0, Math.PI * 2);
                CTX.fill();
                CTX.globalAlpha = 1;
                break;
            }
                
            default: {
                // Default barrel - simple design
                CTX.fillStyle = color;
                CTX.fillRect(0, -6, 30, 12);
                CTX.strokeRect(0, -6, 30, 12);
            }
        }
        
        // Turret base - matching drawWeaponTurret style
        const baseGrad = CTX.createRadialGradient(0, 0, 0, 0, 0, 12);
        baseGrad.addColorStop(0, lighterShade);
        baseGrad.addColorStop(0.5, '#444');
        baseGrad.addColorStop(1, darkerShade);
        
        CTX.fillStyle = baseGrad;
        CTX.beginPath();
        CTX.arc(0, 0, 12, 0, Math.PI * 2);
        CTX.fill();
        CTX.stroke();
        
        // Inner ring
        CTX.fillStyle = color;
        CTX.beginPath();
        CTX.arc(0, 0, 7, 0, Math.PI * 2);
        CTX.fill();
        CTX.stroke();
        
        // Center bolt
        CTX.fillStyle = darkerShade;
        CTX.beginPath();
        CTX.arc(0, 0, 3, 0, Math.PI * 2);
        CTX.fill();
        
        CTX.restore();
    }

    // VIEWPORT CULLING: Only render pickups visible on screen
    const pickupMargin = 50; // Account for glow effects
    for (let p of pickups) {
        // Skip pickups outside viewport
        if (!isInViewport(p.x, p.y, pickupMargin)) continue;
        
        const py = p.y + (p.floatY || 0);
        const rarity = p.type.rarity || 'common';
        const dropId = p.type.id || '';
        
        // TYPE-SPECIFIC VISUAL EFFECTS - Unique effects per item type
        CTX.save();
        drawDropTypeEffect(p.x, py, dropId, p.type.c || '#888888');
        CTX.restore();
        
        // RARITY CONFIGURATION - Professional visual hierarchy
        const RARITY_CONFIG = {
            'common': { 
                glowSize: 0, ringCount: 0, sparkles: 0, 
                outerGlow: false, particles: false,
                borderWidth: 1.5, iconScale: 1.0
            },
            'uncommon': { 
                glowSize: 8, ringCount: 1, sparkles: 0, 
                outerGlow: true, particles: false,
                borderWidth: 2, iconScale: 1.0
            },
            'rare': { 
                glowSize: 15, ringCount: 2, sparkles: 3, 
                outerGlow: true, particles: true,
                borderWidth: 2.5, iconScale: 1.05
            },
            'epic': { 
                glowSize: 22, ringCount: 3, sparkles: 5, 
                outerGlow: true, particles: true,
                borderWidth: 3, iconScale: 1.1
            },
            'legendary': { 
                glowSize: 30, ringCount: 4, sparkles: 8, 
                outerGlow: true, particles: true,
                borderWidth: 3.5, iconScale: 1.15
            }
        };
        const config = RARITY_CONFIG[rarity] || RARITY_CONFIG.common;
        const baseColor = p.type.c || '#888888';
        
        CTX.save();
        
        // ==================== GROUND SHADOW ====================
        // Elliptical shadow with soft edges
        const shadowGrad = CTX.createRadialGradient(p.x, py + 16, 0, p.x, py + 16, 14);
        shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
        shadowGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.2)');
        shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        CTX.fillStyle = shadowGrad;
        CTX.beginPath();
        CTX.ellipse(p.x, py + 16, 14, 5, 0, 0, Math.PI * 2);
        CTX.fill();
        
        // ==================== OUTER AURA GLOW ====================
        if (config.outerGlow && config.glowSize > 0) {
            const pulsePhase = Math.sin(frame * 0.08) * 0.3;
            const glowRadius = config.glowSize + pulsePhase * 5;
            
            // Multi-layer soft glow
            for (let layer = 3; layer >= 1; layer--) {
                const layerRadius = 18 + glowRadius * (layer / 2);
                const layerAlpha = (0.15 / layer) + pulsePhase * 0.05;
                
                const glowGrad = CTX.createRadialGradient(p.x, py, 12, p.x, py, layerRadius);
                glowGrad.addColorStop(0, `rgba(${hexToRgb(baseColor)}, 0)`);
                glowGrad.addColorStop(0.5, `rgba(${hexToRgb(baseColor)}, ${layerAlpha})`);
                glowGrad.addColorStop(1, `rgba(${hexToRgb(baseColor)}, 0)`);
                
                CTX.fillStyle = glowGrad;
                CTX.beginPath();
                CTX.arc(p.x, py, layerRadius, 0, Math.PI * 2);
                CTX.fill();
            }
        }
        
        // ==================== ANIMATED ORBIT RINGS ====================
        if (config.ringCount > 0) {
            for (let r = 1; r <= config.ringCount; r++) {
                const ringPhase = frame * (0.03 + r * 0.01) + r * 1.5;
                const ringRadius = 20 + r * 6 + Math.sin(ringPhase) * 2;
                const ringAlpha = 0.4 / r + Math.sin(ringPhase) * 0.1;
                
                CTX.strokeStyle = baseColor;
                CTX.lineWidth = 1.5 / r;
                CTX.globalAlpha = ringAlpha;
                
                // Dashed ring effect
                CTX.setLineDash([4 + r * 2, 4 + r]);
                CTX.lineDashOffset = -frame * (0.5 + r * 0.2);
                
                CTX.beginPath();
                CTX.arc(p.x, py, ringRadius, 0, Math.PI * 2);
                CTX.stroke();
                
                CTX.setLineDash([]);
            }
        }
        CTX.globalAlpha = 1;
        
        // ==================== MAIN PICKUP BODY ====================
        // Hexagonal gem shape for premium look
        const gemSize = 16 * config.iconScale;
        const gemPoints = 6;
        
        // Gem base shadow (3D depth)
        CTX.fillStyle = 'rgba(0, 0, 0, 0.3)';
        CTX.beginPath();
        for (let i = 0; i < gemPoints; i++) {
            const angle = (i * Math.PI * 2) / gemPoints - Math.PI / 2;
            const gx = p.x + 2 + Math.cos(angle) * gemSize;
            const gy = py + 2 + Math.sin(angle) * gemSize;
            if (i === 0) CTX.moveTo(gx, gy);
            else CTX.lineTo(gx, gy);
        }
        CTX.closePath();
        CTX.fill();
        
        // Gem body with multi-stop gradient
        const gemGrad = CTX.createRadialGradient(p.x - gemSize * 0.3, py - gemSize * 0.3, 0, p.x, py, gemSize * 1.2);
        gemGrad.addColorStop(0, '#ffffff');
        gemGrad.addColorStop(0.2, lightenHexColor(baseColor, 40));
        gemGrad.addColorStop(0.5, baseColor);
        gemGrad.addColorStop(0.8, darkenHexColor(baseColor, 30));
        gemGrad.addColorStop(1, darkenHexColor(baseColor, 50));
        
        CTX.fillStyle = gemGrad;
        CTX.beginPath();
        for (let i = 0; i < gemPoints; i++) {
            const angle = (i * Math.PI * 2) / gemPoints - Math.PI / 2;
            const gx = p.x + Math.cos(angle) * gemSize;
            const gy = py + Math.sin(angle) * gemSize;
            if (i === 0) CTX.moveTo(gx, gy);
            else CTX.lineTo(gx, gy);
        }
        CTX.closePath();
        CTX.fill();
        
        // Gem facet lines (crystal cut effect)
        CTX.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        CTX.lineWidth = 1;
        for (let i = 0; i < gemPoints; i++) {
            const angle = (i * Math.PI * 2) / gemPoints - Math.PI / 2;
            CTX.beginPath();
            CTX.moveTo(p.x, py);
            CTX.lineTo(p.x + Math.cos(angle) * gemSize * 0.8, py + Math.sin(angle) * gemSize * 0.8);
            CTX.stroke();
        }
        
        // Gem border with glow
        CTX.strokeStyle = darkenHexColor(baseColor, 20);
        CTX.lineWidth = config.borderWidth;
        CTX.shadowColor = baseColor;
        CTX.shadowBlur = rarity === 'legendary' ? 12 : (rarity === 'epic' ? 8 : 4);
        CTX.beginPath();
        for (let i = 0; i < gemPoints; i++) {
            const angle = (i * Math.PI * 2) / gemPoints - Math.PI / 2;
            const gx = p.x + Math.cos(angle) * gemSize;
            const gy = py + Math.sin(angle) * gemSize;
            if (i === 0) CTX.moveTo(gx, gy);
            else CTX.lineTo(gx, gy);
        }
        CTX.closePath();
        CTX.stroke();
        CTX.shadowBlur = 0;
        
        // Inner shine highlight (top-left reflection)
        CTX.fillStyle = 'rgba(255, 255, 255, 0.6)';
        CTX.beginPath();
        CTX.ellipse(p.x - gemSize * 0.25, py - gemSize * 0.35, gemSize * 0.35, gemSize * 0.2, -0.5, 0, Math.PI * 2);
        CTX.fill();
        
        // Secondary small highlight
        CTX.fillStyle = 'rgba(255, 255, 255, 0.4)';
        CTX.beginPath();
        CTX.ellipse(p.x - gemSize * 0.1, py - gemSize * 0.5, gemSize * 0.15, gemSize * 0.08, -0.3, 0, Math.PI * 2);
        CTX.fill();
        
        // ==================== MINI WEAPON TURRET (weapon drops only) ====================
        // Draw turret FIRST so text appears on top of it
        const WEAPON_IDS = ['cannon', 'twin', 'shotgun', 'sniper', 'burst', 'flak', 'rocket', 'laser', 'gauss', 'ice', 'fire', 'electric'];
        const isWeaponDrop = WEAPON_IDS.includes(dropId);
        if (isWeaponDrop) {
            // Position turret above the hexagon
            // Hexagon top is at py - gemSize, place turret above it
            const turretY = py - gemSize - 8;
            drawMiniWeaponTurret(p.x, turretY, dropId, baseColor);
        }
        
        // ==================== ICON/TEXT with HIGH VISIBILITY ====================
        // Text always stays centered in hexagon (py is center)
        const textY = py;
        
        const fontSize = Math.floor(12 * config.iconScale);
        CTX.font = `bold ${fontSize}px Arial`;
        CTX.textAlign = 'center';
        CTX.textBaseline = 'middle';
        
        // Dark background pill for text (improves readability)
        const textWidth = CTX.measureText(p.type.short).width;
        const pillWidth = textWidth + 8;
        const pillHeight = fontSize + 4;
        CTX.fillStyle = 'rgba(0, 0, 0, 0.6)';
        CTX.beginPath();
        CTX.roundRect(p.x - pillWidth/2, textY - pillHeight/2, pillWidth, pillHeight, 4);
        CTX.fill();
        
        // Text outline (thick dark stroke for maximum contrast)
        CTX.strokeStyle = '#000000';
        CTX.lineWidth = 3;
        CTX.lineJoin = 'round';
        CTX.strokeText(p.type.short, p.x, textY);
        
        // Main text with glow
        CTX.shadowColor = '#ffffff';
        CTX.shadowBlur = 4;
        CTX.fillStyle = '#ffffff';
        CTX.fillText(p.type.short, p.x, textY);
        CTX.shadowBlur = 0;
        
        // ==================== SPARKLE PARTICLES ====================
        if (config.sparkles > 0) {
            for (let s = 0; s < config.sparkles; s++) {
                const sparkleSpeed = 0.06 + (s % 3) * 0.02;
                const sparkleAngle = (frame * sparkleSpeed) + (s * Math.PI * 2 / config.sparkles);
                const sparkleOrbit = 20 + (s % 3) * 4 + Math.sin(frame * 0.1 + s) * 3;
                const sx = p.x + Math.cos(sparkleAngle) * sparkleOrbit;
                const sy = py + Math.sin(sparkleAngle) * sparkleOrbit * 0.6; // Elliptical orbit
                
                const sparkleAlpha = 0.5 + Math.sin(frame * 0.15 + s * 0.8) * 0.4;
                const sparkleSize = 2 + Math.sin(frame * 0.2 + s) * 1;
                
                // Four-pointed star sparkle
                CTX.globalAlpha = sparkleAlpha;
                CTX.fillStyle = '#ffffff';
                CTX.beginPath();
                CTX.moveTo(sx, sy - sparkleSize * 1.5);
                CTX.lineTo(sx + sparkleSize * 0.4, sy - sparkleSize * 0.4);
                CTX.lineTo(sx + sparkleSize * 1.5, sy);
                CTX.lineTo(sx + sparkleSize * 0.4, sy + sparkleSize * 0.4);
                CTX.lineTo(sx, sy + sparkleSize * 1.5);
                CTX.lineTo(sx - sparkleSize * 0.4, sy + sparkleSize * 0.4);
                CTX.lineTo(sx - sparkleSize * 1.5, sy);
                CTX.lineTo(sx - sparkleSize * 0.4, sy - sparkleSize * 0.4);
                CTX.closePath();
                CTX.fill();
                
                // Colored core
                CTX.globalAlpha = sparkleAlpha * 0.7;
                CTX.fillStyle = baseColor;
                CTX.beginPath();
                CTX.arc(sx, sy, sparkleSize * 0.5, 0, Math.PI * 2);
                CTX.fill();
            }
        }
        
        // ==================== FLOATING PARTICLES (rare+) ====================
        if (config.particles) {
            const particleCount = rarity === 'legendary' ? 6 : (rarity === 'epic' ? 4 : 2);
            for (let i = 0; i < particleCount; i++) {
                const particlePhase = frame * 0.04 + i * 2;
                const particleY = py - 8 - Math.abs(Math.sin(particlePhase)) * 15;
                const particleX = p.x + Math.sin(particlePhase * 0.7 + i) * 12;
                const particleAlpha = 0.3 + Math.sin(particlePhase) * 0.2;
                const particleSize = 1.5 + Math.sin(particlePhase * 1.5) * 0.5;
                
                CTX.globalAlpha = particleAlpha;
                CTX.fillStyle = baseColor;
                CTX.beginPath();
                CTX.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
                CTX.fill();
            }
        }
        
        CTX.globalAlpha = 1;
        CTX.restore();
    }
    
    // Helper functions for color manipulation
    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
            return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
        }
        return '136, 136, 136';
    }
    
    function lightenHexColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, (num >> 16) + amt);
        const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
        const B = Math.min(255, (num & 0x0000FF) + amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }
    
    function darkenHexColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max(0, (num >> 16) - amt);
        const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
        const B = Math.max(0, (num & 0x0000FF) - amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }
    
    // Keep existing shadeColor for backward compatibility
    function shadeColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, Math.max(0, (num >> 16) + amt));
        const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amt));
        const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }

    // OPTIMIZATION: Pre-calculate enemy viewport margin for culling
    const enemyMargin = 150; // Large margin for auras and effects
    
    for (let e of enemies) {
        // Skip enemies that are dying (in death sequence during demo)
        if (e.isDying) continue;
        
        // Skip enemies that are invisible during blink delay
        if (e.blinkInvisible) continue;
        
        // Skip enemies outside viewport for performance
        if (typeof isInViewport === 'function' && !isInViewport(e.x, e.y, enemyMargin)) continue;
        
        // Draw magical aura effects for magical enemies
        if (ENEMY_TIERS[e.id]?.magical) {
            CTX.save();
            CTX.translate(e.x, e.y);
            
            const magicType = ENEMY_TIERS[e.id].magicType;
            const pulseSize = 45 + Math.sin(frame * 0.08) * 5;
            
            // Magical aura glow
            if (magicType === 'shield') {
                // Purple shield aura
                const gradient = CTX.createRadialGradient(0, 0, 25, 0, 0, pulseSize);
                gradient.addColorStop(0, 'rgba(168, 85, 247, 0)');
                gradient.addColorStop(0.7, 'rgba(168, 85, 247, 0.2)');
                gradient.addColorStop(1, 'rgba(168, 85, 247, 0)');
                CTX.fillStyle = gradient;
                CTX.beginPath();
                CTX.arc(0, 0, pulseSize, 0, Math.PI * 2);
                CTX.fill();
            } else if (magicType === 'blink') {
                // Purple blink rings
                for (let i = 0; i < 3; i++) {
                    const ringSize = pulseSize - i * 10;
                    CTX.strokeStyle = `rgba(168, 85, 247, ${0.4 - i * 0.1})`;
                    CTX.lineWidth = 2;
                    CTX.beginPath();
                    CTX.arc(0, 0, ringSize, 0, Math.PI * 2);
                    CTX.stroke();
                }
            } else if (magicType === 'ice') {
                // Ice blue crystalline aura
                const gradient = CTX.createRadialGradient(0, 0, 20, 0, 0, pulseSize);
                gradient.addColorStop(0, 'rgba(0, 188, 212, 0.1)');
                gradient.addColorStop(0.7, 'rgba(0, 188, 212, 0.3)');
                gradient.addColorStop(1, 'rgba(77, 208, 225, 0)');
                CTX.fillStyle = gradient;
                CTX.beginPath();
                CTX.arc(0, 0, pulseSize, 0, Math.PI * 2);
                CTX.fill();
                
                // Ice crystals orbiting
                for (let i = 0; i < 4; i++) {
                    const angle = (frame * 0.03) + (i * Math.PI / 2);
                    const cx = Math.cos(angle) * 35;
                    const cy = Math.sin(angle) * 35;
                    CTX.fillStyle = 'rgba(0, 188, 212, 0.6)';
                    CTX.save();
                    CTX.translate(cx, cy);
                    CTX.rotate(angle);
                    CTX.beginPath();
                    CTX.moveTo(0, -5);
                    CTX.lineTo(3, 0);
                    CTX.lineTo(0, 5);
                    CTX.lineTo(-3, 0);
                    CTX.closePath();
                    CTX.fill();
                    CTX.restore();
                }
            } else if (magicType === 'fire') {
                // Fire orange/red flame aura
                const gradient = CTX.createRadialGradient(0, 0, 15, 0, 0, pulseSize);
                gradient.addColorStop(0, 'rgba(255, 107, 53, 0.2)');
                gradient.addColorStop(0.5, 'rgba(255, 107, 53, 0.4)');
                gradient.addColorStop(1, 'rgba(232, 93, 4, 0)');
                CTX.fillStyle = gradient;
                CTX.beginPath();
                CTX.arc(0, 0, pulseSize, 0, Math.PI * 2);
                CTX.fill();
                
                // Flame particles
                for (let i = 0; i < 3; i++) {
                    const angle = (frame * 0.05) + (i * Math.PI * 2 / 3);
                    const radius = 30 + Math.sin(frame * 0.1 + i) * 5;
                    const fx = Math.cos(angle) * radius;
                    const fy = Math.sin(angle) * radius - 5;
                    CTX.fillStyle = i % 2 === 0 ? 'rgba(255, 107, 53, 0.7)' : 'rgba(255, 149, 0, 0.7)';
                    CTX.beginPath();
                    CTX.arc(fx, fy, 4, 0, Math.PI * 2);
                    CTX.fill();
                }
            } else if (magicType === 'electric') {
                // Electric yellow lightning aura
                const gradient = CTX.createRadialGradient(0, 0, 20, 0, 0, pulseSize);
                gradient.addColorStop(0, 'rgba(255, 235, 59, 0.2)');
                gradient.addColorStop(0.6, 'rgba(255, 235, 59, 0.3)');
                gradient.addColorStop(1, 'rgba(249, 168, 37, 0)');
                CTX.fillStyle = gradient;
                CTX.beginPath();
                CTX.arc(0, 0, pulseSize, 0, Math.PI * 2);
                CTX.fill();
                
                // Lightning bolts
                if (frame % 15 < 3) {
                    for (let i = 0; i < 4; i++) {
                        const angle = (i * Math.PI / 2) + (frame * 0.1);
                        const boltLength = 25 + Math.random() * 10;
                        CTX.strokeStyle = 'rgba(255, 235, 59, 0.8)';
                        CTX.lineWidth = 2;
                        CTX.beginPath();
                        CTX.moveTo(0, 0);
                        CTX.lineTo(Math.cos(angle) * boltLength, Math.sin(angle) * boltLength);
                        CTX.stroke();
                    }
                }
            }
            
            CTX.restore();
        }
        
        // STUNNED/ELECTRIC effects moved AFTER drawTank for proper z-order (rendered ON TOP of tank)
        
        // Draw ELECTRIC FLASH effect - tank turns white and flickers when hit by chain lightning
        if (e.electricFlash && e.electricFlash > 0) {
            CTX.save();
            CTX.translate(e.x, e.y);
            
            const flashProgress = Math.min(1, e.electricFlash / 25);
            const flickerOn = Math.floor(frame * 0.5) % 3 !== 0; // Rapid flickering
            
            if (flickerOn) {
                // Bright white flash overlay on entire tank
                CTX.rotate(e.angle);
                CTX.globalAlpha = 0.7 * flashProgress;
                CTX.fillStyle = '#ffffff';
                CTX.beginPath();
                CTX.roundRect(-26, -20, 52, 40, 5);
                CTX.fill();
                
                // Electric white glow around tank
                CTX.rotate(-e.angle); // Reset rotation for glow
                CTX.globalAlpha = 0.5 * flashProgress;
                const glowGradient = CTX.createRadialGradient(0, 0, 20, 0, 0, 55);
                glowGradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
                glowGradient.addColorStop(0.5, 'rgba(168, 85, 247, 0.3)');
                glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                CTX.fillStyle = glowGradient;
                CTX.beginPath();
                CTX.arc(0, 0, 55, 0, Math.PI * 2);
                CTX.fill();
            }
            
            // Electric sparks shooting out from tank during flash
            CTX.globalAlpha = flashProgress * 0.8;
            for (let i = 0; i < 6; i++) {
                const sparkAngle = (Math.PI * 2 / 6) * i + frame * 0.2;
                const sparkLength = 25 + Math.sin(frame * 0.4 + i) * 10;
                
                if ((frame + i * 3) % 5 < 3) {
                    CTX.strokeStyle = i % 2 === 0 ? '#ffffff' : '#ffeb3b';
                    CTX.lineWidth = 2;
                    CTX.beginPath();
                    CTX.moveTo(Math.cos(sparkAngle) * 25, Math.sin(sparkAngle) * 25);
                    
                    // Zigzag spark
                    const midX = Math.cos(sparkAngle) * (25 + sparkLength * 0.5) + (Math.random() - 0.5) * 10;
                    const midY = Math.sin(sparkAngle) * (25 + sparkLength * 0.5) + (Math.random() - 0.5) * 10;
                    CTX.lineTo(midX, midY);
                    CTX.lineTo(Math.cos(sparkAngle) * (25 + sparkLength), Math.sin(sparkAngle) * (25 + sparkLength));
                    CTX.stroke();
                }
            }
            
            // "SHOCKED!" text indicator
            if (e.electricFlash > 30) {
                CTX.globalAlpha = flashProgress;
                CTX.font = 'bold 12px Arial';
                CTX.textAlign = 'center';
                CTX.fillStyle = '#ffffff';
                CTX.strokeStyle = 'rgba(168, 85, 247, 0.9)';
                CTX.lineWidth = 3;
                CTX.strokeText('SHOCKED!', 0, -55);
                CTX.fillText('SHOCKED!', 0, -55);
            }
            
            CTX.globalAlpha = 1;
            CTX.restore();
        }
        
        // Targeting laser for high-tier enemies
        // Only show when enemy is about to fire (cooldown < 30)
        if (e.id >= 3 && e.cooldown < 30) {
            CTX.save();
            CTX.translate(e.x, e.y);
            CTX.rotate(e.turretAngle);
            
            // Laser starts from emitter position (x=43) matching turret emitter
            const laserStartX = 43;
            const laserAlpha = 0.1 + ((30 - e.cooldown) / 30) * 0.2;
            
            CTX.strokeStyle = `rgba(255, 0, 0, ${laserAlpha})`;
            CTX.lineWidth = 1;
            CTX.setLineDash([5, 5]);
            CTX.beginPath();
            CTX.moveTo(laserStartX, 0);
            CTX.lineTo(200, 0);
            CTX.stroke();
            CTX.setLineDash([]);
            CTX.restore();
        }
        // Apply shake offset from damage
        const exShake = (e.shakeX || 0);
        const eyShake = (e.shakeY || 0);
        
        // Enemy turret: bright weapon color, body: darker version
        // Define colors BEFORE using them in spawn pulse
        const enemyWeapon = ENEMY_TIERS[e.id]?.weapon || 'cannon';
        const enemyTurretColor = WEAPONS[enemyWeapon]?.color || '#ffffff';
        const enemyBodyColor = lightenColor(enemyTurretColor, 0.7); // Darker than turret
        
        if (e.spawnWarmup > 0) {
            const spawnProgress = 1 - (e.spawnWarmup / (e.spawnWarmupMax || SPAWN_WARMUP_FRAMES));
            
            // DRAMATIC BLINK SPAWN ANIMATION for enemies
            CTX.save();
            const beamAlpha = (1 - spawnProgress) * 0.8;
            
            // Vertical teleport beam from sky - red/orange enemy themed
            const beamGrad = CTX.createLinearGradient(e.x + exShake, e.y + eyShake - 200, e.x + exShake, e.y + eyShake + 20);
            beamGrad.addColorStop(0, 'rgba(239, 68, 68, 0)');
            beamGrad.addColorStop(0.3, `rgba(239, 68, 68, ${beamAlpha * 0.5})`);
            beamGrad.addColorStop(0.8, `rgba(255, 255, 255, ${beamAlpha})`);
            beamGrad.addColorStop(1, `rgba(239, 68, 68, ${beamAlpha * 0.3})`);
            
            CTX.fillStyle = beamGrad;
            CTX.fillRect(e.x + exShake - 25, e.y + eyShake - 200, 50, 220);
            
            // Ground impact ring - expanding circle
            const ringRadius = 30 + spawnProgress * 50;
            CTX.strokeStyle = `rgba(239, 68, 68, ${(1 - spawnProgress) * 0.7})`;
            CTX.lineWidth = 4 * (1 - spawnProgress);
            CTX.beginPath();
            CTX.arc(e.x + exShake, e.y + eyShake, ringRadius, 0, Math.PI * 2);
            CTX.stroke();
            
            // Inner bright ring
            CTX.strokeStyle = `rgba(255, 255, 255, ${(1 - spawnProgress) * 0.9})`;
            CTX.lineWidth = 2;
            CTX.beginPath();
            CTX.arc(e.x + exShake, e.y + eyShake, ringRadius * 0.6, 0, Math.PI * 2);
            CTX.stroke();
            
            // Electric sparks around spawn point
            for (let i = 0; i < 6; i++) {
                const sparkAngle = (Math.PI * 2 / 6) * i + frame * 0.2;
                const sparkDist = 25 + Math.sin(frame * 0.3 + i) * 10;
                const sparkX = e.x + exShake + Math.cos(sparkAngle) * sparkDist;
                const sparkY = e.y + eyShake + Math.sin(sparkAngle) * sparkDist;
                
                CTX.fillStyle = `rgba(255, 200, 150, ${beamAlpha})`;
                CTX.beginPath();
                CTX.arc(sparkX, sparkY, 3, 0, Math.PI * 2);
                CTX.fill();
            }
            
            // Portal effect above - red tinted
            CTX.strokeStyle = `rgba(239, 68, 68, ${beamAlpha * 0.7})`;
            CTX.lineWidth = 3;
            CTX.beginPath();
            CTX.ellipse(e.x + exShake, e.y + eyShake - 150, 30 + Math.sin(frame * 0.4) * 5, 12, 0, 0, Math.PI * 2);
            CTX.stroke();
            
            CTX.restore();
        }
        
        // Draw SLOWED effect - frost particles and icy mist around tank
        if (e.slowedTime && e.slowedTime > 0 && !(e.frozenTime && e.frozenTime > 0)) {
            CTX.save();
            CTX.translate(e.x + exShake, e.y + eyShake);
            
            const slowProgress = Math.min(1, e.slowedTime / 150); // Fade based on remaining time
            
            // Frosty mist aura around the tank
            const mistRadius = 45 + Math.sin(frame * 0.1) * 5;
            const mistGradient = CTX.createRadialGradient(0, 0, 20, 0, 0, mistRadius);
            mistGradient.addColorStop(0, `rgba(135, 206, 235, ${0.15 * slowProgress})`);
            mistGradient.addColorStop(0.5, `rgba(173, 216, 230, ${0.25 * slowProgress})`);
            mistGradient.addColorStop(1, 'rgba(135, 206, 235, 0)');
            CTX.fillStyle = mistGradient;
            CTX.beginPath();
            CTX.arc(0, 0, mistRadius, 0, Math.PI * 2);
            CTX.fill();
            
            // Swirling frost particles
            for (let i = 0; i < 8; i++) {
                const particleAngle = (frame * 0.04) + (i * Math.PI / 4);
                const particleRadius = 30 + Math.sin(frame * 0.08 + i) * 8;
                const px = Math.cos(particleAngle) * particleRadius;
                const py = Math.sin(particleAngle) * particleRadius;
                
                CTX.globalAlpha = slowProgress * (0.4 + Math.sin(frame * 0.1 + i) * 0.2);
                CTX.fillStyle = '#87ceeb';
                CTX.beginPath();
                CTX.arc(px, py, 3 + Math.sin(frame * 0.15 + i) * 1.5, 0, Math.PI * 2);
                CTX.fill();
                
                // Small trailing particles
                const trailAngle = particleAngle - 0.3;
                const trailX = Math.cos(trailAngle) * (particleRadius - 5);
                const trailY = Math.sin(trailAngle) * (particleRadius - 5);
                CTX.globalAlpha = slowProgress * 0.3;
                CTX.beginPath();
                CTX.arc(trailX, trailY, 2, 0, Math.PI * 2);
                CTX.fill();
            }
            
            // Snowflake symbols floating up
            CTX.font = '12px Arial';
            CTX.textAlign = 'center';
            CTX.textBaseline = 'middle';
            for (let i = 0; i < 3; i++) {
                const floatY = -25 - ((frame * 0.5 + i * 40) % 60);
                const floatX = Math.sin(frame * 0.05 + i * 2) * 15;
                CTX.globalAlpha = slowProgress * (0.6 - (floatY + 85) / 100);
                CTX.fillStyle = '#b0e0e6';
                CTX.fillText('❄', floatX, floatY);
            }
            
            CTX.globalAlpha = 1;
            CTX.restore();
        }
        
        // Draw FROZEN effect - ice encasing the entire tank
        if (e.frozenTime && e.frozenTime > 0) {
            CTX.save();
            CTX.translate(e.x + exShake, e.y + eyShake);
            
            const freezeProgress = Math.min(1, e.frozenTime / 75); // Full effect for first half
            
            // Ice block encasing - main crystalline structure
            const iceSize = 50;
            CTX.globalAlpha = 0.7 * freezeProgress;
            
            // Multiple layers of ice for depth effect
            // Outer ice glow
            const outerGlow = CTX.createRadialGradient(0, 0, 30, 0, 0, 60);
            outerGlow.addColorStop(0, 'rgba(0, 188, 212, 0.3)');
            outerGlow.addColorStop(0.5, 'rgba(77, 208, 225, 0.2)');
            outerGlow.addColorStop(1, 'rgba(0, 188, 212, 0)');
            CTX.fillStyle = outerGlow;
            CTX.beginPath();
            CTX.arc(0, 0, 60, 0, Math.PI * 2);
            CTX.fill();
            
            // Main ice block - hexagonal shape
            CTX.globalAlpha = 0.5 * freezeProgress;
            CTX.fillStyle = 'rgba(173, 216, 230, 0.6)';
            CTX.strokeStyle = 'rgba(0, 188, 212, 0.9)';
            CTX.lineWidth = 3;
            CTX.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI * 2 / 6) * i - Math.PI / 2;
                const px = Math.cos(angle) * iceSize;
                const py = Math.sin(angle) * iceSize;
                if (i === 0) CTX.moveTo(px, py);
                else CTX.lineTo(px, py);
            }
            CTX.closePath();
            CTX.fill();
            CTX.stroke();
            
            // Inner ice crystalline pattern
            CTX.globalAlpha = 0.6 * freezeProgress;
            CTX.strokeStyle = 'rgba(224, 255, 255, 0.8)';
            CTX.lineWidth = 1.5;
            
            // Draw ice crack patterns radiating from center
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI * 2 / 6) * i + (frame * 0.005);
                CTX.beginPath();
                CTX.moveTo(0, 0);
                
                // Main crack line
                const endX = Math.cos(angle) * 40;
                const endY = Math.sin(angle) * 40;
                CTX.lineTo(endX, endY);
                CTX.stroke();
                
                // Branch cracks
                const midX = endX * 0.6;
                const midY = endY * 0.6;
                const branchAngle1 = angle + 0.5;
                const branchAngle2 = angle - 0.5;
                
                CTX.beginPath();
                CTX.moveTo(midX, midY);
                CTX.lineTo(midX + Math.cos(branchAngle1) * 15, midY + Math.sin(branchAngle1) * 15);
                CTX.stroke();
                
                CTX.beginPath();
                CTX.moveTo(midX, midY);
                CTX.lineTo(midX + Math.cos(branchAngle2) * 15, midY + Math.sin(branchAngle2) * 15);
                CTX.stroke();
            }
            
            // Ice crystal spikes around the tank
            CTX.globalAlpha = 0.8 * freezeProgress;
            CTX.fillStyle = 'rgba(0, 191, 255, 0.7)';
            for (let i = 0; i < 8; i++) {
                const spikeAngle = (Math.PI * 2 / 8) * i;
                const spikeHeight = 18 + Math.sin(frame * 0.1 + i) * 4;
                
                CTX.save();
                CTX.translate(Math.cos(spikeAngle) * 42, Math.sin(spikeAngle) * 42);
                CTX.rotate(spikeAngle + Math.PI / 2);
                
                // Draw ice spike (triangle pointing outward)
                CTX.beginPath();
                CTX.moveTo(0, -spikeHeight);
                CTX.lineTo(-6, 5);
                CTX.lineTo(6, 5);
                CTX.closePath();
                CTX.fill();
                
                CTX.restore();
            }
            
            // Sparkle effects on ice surface
            for (let i = 0; i < 5; i++) {
                const sparkleX = Math.cos(frame * 0.02 + i * 1.5) * 30;
                const sparkleY = Math.sin(frame * 0.03 + i * 1.2) * 30;
                const sparkleSize = 2 + Math.sin(frame * 0.2 + i * 2) * 1;
                
                if ((frame + i * 10) % 30 < 15) {
                    CTX.globalAlpha = freezeProgress * (0.8 - ((frame + i * 10) % 30) / 30);
                    CTX.fillStyle = '#ffffff';
                    
                    // 4-pointed star sparkle
                    CTX.beginPath();
                    CTX.moveTo(sparkleX, sparkleY - sparkleSize * 2);
                    CTX.lineTo(sparkleX + sparkleSize * 0.5, sparkleY);
                    CTX.lineTo(sparkleX, sparkleY + sparkleSize * 2);
                    CTX.lineTo(sparkleX - sparkleSize * 0.5, sparkleY);
                    CTX.closePath();
                    CTX.fill();
                    
                    CTX.beginPath();
                    CTX.moveTo(sparkleX - sparkleSize * 2, sparkleY);
                    CTX.lineTo(sparkleX, sparkleY + sparkleSize * 0.5);
                    CTX.lineTo(sparkleX + sparkleSize * 2, sparkleY);
                    CTX.lineTo(sparkleX, sparkleY - sparkleSize * 0.5);
                    CTX.closePath();
                    CTX.fill();
                }
            }
            
            // Status text removed - shown only via floating text to avoid double display
            
            CTX.globalAlpha = 1;
            CTX.restore();
        }
        
        // Draw BURNING effect - dramatic fire engulfing the tank
        if (e.burningTime && e.burningTime > 0) {
            CTX.save();
            CTX.translate(e.x + exShake, e.y + eyShake);
            
            const burnProgress = Math.min(1, e.burningTime / 90); // Full effect intensity
            
            // Heat distortion aura (outer glow)
            const heatRadius = 55 + Math.sin(frame * 0.15) * 8;
            const heatGradient = CTX.createRadialGradient(0, 0, 25, 0, 0, heatRadius);
            heatGradient.addColorStop(0, `rgba(255, 69, 0, ${0.15 * burnProgress})`);
            heatGradient.addColorStop(0.4, `rgba(255, 140, 0, ${0.25 * burnProgress})`);
            heatGradient.addColorStop(0.7, `rgba(255, 69, 0, ${0.1 * burnProgress})`);
            heatGradient.addColorStop(1, 'rgba(255, 69, 0, 0)');
            CTX.fillStyle = heatGradient;
            CTX.beginPath();
            CTX.arc(0, 0, heatRadius, 0, Math.PI * 2);
            CTX.fill();
            
            // Rising flame tongues around the tank
            for (let i = 0; i < 12; i++) {
                const flameAngle = (Math.PI * 2 / 12) * i + Math.sin(frame * 0.1) * 0.2;
                const flameBaseX = Math.cos(flameAngle) * 28;
                const flameBaseY = Math.sin(flameAngle) * 28;
                const flameHeight = 20 + Math.sin(frame * 0.2 + i * 0.8) * 10;
                const flameWidth = 8 + Math.sin(frame * 0.15 + i) * 3;
                
                CTX.save();
                CTX.translate(flameBaseX, flameBaseY);
                CTX.rotate(flameAngle - Math.PI / 2);
                
                // Create flame gradient
                const flameGrad = CTX.createLinearGradient(0, 0, 0, -flameHeight);
                flameGrad.addColorStop(0, `rgba(255, 69, 0, ${0.9 * burnProgress})`);
                flameGrad.addColorStop(0.3, `rgba(255, 140, 0, ${0.8 * burnProgress})`);
                flameGrad.addColorStop(0.6, `rgba(255, 200, 0, ${0.6 * burnProgress})`);
                flameGrad.addColorStop(1, 'rgba(255, 255, 200, 0)');
                
                CTX.fillStyle = flameGrad;
                CTX.beginPath();
                CTX.moveTo(-flameWidth / 2, 0);
                CTX.quadraticCurveTo(-flameWidth / 4, -flameHeight * 0.5, 0, -flameHeight);
                CTX.quadraticCurveTo(flameWidth / 4, -flameHeight * 0.5, flameWidth / 2, 0);
                CTX.closePath();
                CTX.fill();
                
                CTX.restore();
            }
            
            // Central fire core on tank body
            for (let i = 0; i < 5; i++) {
                const coreX = (Math.random() - 0.5) * 30;
                const coreY = (Math.random() - 0.5) * 25;
                const coreSize = 12 + Math.sin(frame * 0.25 + i * 1.5) * 5;
                
                const coreGrad = CTX.createRadialGradient(coreX, coreY, 0, coreX, coreY, coreSize);
                coreGrad.addColorStop(0, `rgba(255, 255, 200, ${0.7 * burnProgress})`);
                coreGrad.addColorStop(0.3, `rgba(255, 200, 0, ${0.5 * burnProgress})`);
                coreGrad.addColorStop(0.6, `rgba(255, 100, 0, ${0.3 * burnProgress})`);
                coreGrad.addColorStop(1, 'rgba(255, 50, 0, 0)');
                
                CTX.fillStyle = coreGrad;
                CTX.beginPath();
                CTX.arc(coreX, coreY, coreSize, 0, Math.PI * 2);
                CTX.fill();
            }
            
            // Animated embers/sparks flying upward
            for (let i = 0; i < 8; i++) {
                const emberPhase = (frame * 0.08 + i * 0.7) % 1;
                const emberX = Math.sin(frame * 0.05 + i * 2) * (15 + i * 3);
                const emberY = -20 - emberPhase * 50;
                const emberSize = (1 - emberPhase) * (3 + Math.random() * 2);
                
                CTX.globalAlpha = burnProgress * (1 - emberPhase) * 0.9;
                CTX.fillStyle = Math.random() > 0.5 ? '#ffcc00' : '#ff6600';
                CTX.beginPath();
                CTX.arc(emberX, emberY, emberSize, 0, Math.PI * 2);
                CTX.fill();
                
                // Ember glow
                CTX.globalAlpha = burnProgress * (1 - emberPhase) * 0.4;
                CTX.fillStyle = '#ff9900';
                CTX.beginPath();
                CTX.arc(emberX, emberY, emberSize * 2, 0, Math.PI * 2);
                CTX.fill();
            }
            
            // Smoke wisps rising
            CTX.globalAlpha = burnProgress * 0.4;
            for (let i = 0; i < 4; i++) {
                const smokePhase = (frame * 0.03 + i * 0.5) % 1;
                const smokeX = Math.sin(frame * 0.02 + i * 1.5) * 20;
                const smokeY = -30 - smokePhase * 70;
                const smokeSize = 8 + smokePhase * 15;
                
                const smokeGrad = CTX.createRadialGradient(smokeX, smokeY, 0, smokeX, smokeY, smokeSize);
                smokeGrad.addColorStop(0, `rgba(80, 80, 80, ${0.3 * (1 - smokePhase)})`);
                smokeGrad.addColorStop(1, 'rgba(60, 60, 60, 0)');
                
                CTX.fillStyle = smokeGrad;
                CTX.beginPath();
                CTX.arc(smokeX, smokeY, smokeSize, 0, Math.PI * 2);
                CTX.fill();
            }
            
            // Status text removed - shown only via floating text to avoid double display
            
            CTX.globalAlpha = 1;
            CTX.restore();
        }
        
        // Smooth opacity animation during spawn - tank fades in as teleport effect fades out
        let enemySpawnOpacity = 1;
        if (e.spawnWarmup > 0) {
            const spawnProgress = 1 - (e.spawnWarmup / (e.spawnWarmupMax || SPAWN_WARMUP_FRAMES));
            // Smooth easeInOutCubic curve for natural fade-in
            enemySpawnOpacity = spawnProgress < 0.5 
                ? 4 * spawnProgress * spawnProgress * spawnProgress 
                : 1 - Math.pow(-2 * spawnProgress + 2, 3) / 2;
        }
        
        // Portal fade-out animation when enemy is being recalled by boss
        let teleportFadeOpacity = 1;
        if (e.teleportFadeOut && e.teleportFadeOut > 0 && e.teleportFadeStart) {
            teleportFadeOpacity = e.teleportFadeOut / e.teleportFadeStart;
            
            // Draw portal effect behind enemy during recall
            CTX.save();
            CTX.translate(e.x + exShake, e.y + eyShake);
            
            // Swirling purple portal
            const portalSize = 40 + (1 - teleportFadeOpacity) * 30;
            const portalGrad = CTX.createRadialGradient(0, 0, 0, 0, 0, portalSize);
            portalGrad.addColorStop(0, `rgba(147, 51, 234, ${0.6 * (1 - teleportFadeOpacity)})`);
            portalGrad.addColorStop(0.5, `rgba(168, 85, 247, ${0.4 * (1 - teleportFadeOpacity)})`);
            portalGrad.addColorStop(1, 'rgba(147, 51, 234, 0)');
            CTX.fillStyle = portalGrad;
            CTX.beginPath();
            CTX.arc(0, 0, portalSize, 0, Math.PI * 2);
            CTX.fill();
            
            // Rotating ring effect
            CTX.strokeStyle = `rgba(168, 85, 247, ${0.7 * (1 - teleportFadeOpacity)})`;
            CTX.lineWidth = 3;
            CTX.beginPath();
            CTX.arc(0, 0, 35, frame * 0.1, frame * 0.1 + Math.PI * 1.5);
            CTX.stroke();
            
            CTX.restore();
        }
        
        // Apply combined opacity (spawn + teleport fade)
        const finalOpacity = enemySpawnOpacity * teleportFadeOpacity;
        
        CTX.save();
        CTX.globalAlpha = finalOpacity;
        
        // Draw enemy tank with turret recoil offset (same as player for consistent kickback)
        const eTurretRecoilX = e.turretRecoilOffsetX || 0;
        const eTurretRecoilY = e.turretRecoilOffsetY || 0;
        // Pass shield and armor values for unified effects
        drawTank(e.x + exShake, e.y + eyShake, e.angle, e.turretAngle, enemyBodyColor, enemyTurretColor, false, e.recoil || 0, e.hp / e.maxHp, e.hitFlash, e.seed || 0.5, eTurretRecoilX, eTurretRecoilY, { hitX: e.lastHitX, hitY: e.lastHitY }, enemyWeapon, e.wheelRotation || 0, e.shieldTime || 0, e.armor || 0);
        
        CTX.restore();
        
        // Draw permanent laser sight for enemies with laser-equipped weapons
        // This matches player laser sight functionality - enemies with laser weapons get visible targeting
        const enemyWeaponStats = WEAPONS[enemyWeapon];
        if (enemyWeaponStats && enemyWeaponStats.laser && e.spawnWarmup <= 0) {
            CTX.save();
            CTX.translate(e.x + exShake, e.y + eyShake);
            CTX.rotate(e.turretAngle);
            
            // Laser Sight configuration - synced with emitter position (same as player)
            const laserStartX = 19; // Start from emitter lens tip
            const laserLength = 400; // Slightly shorter than player for balance
            const laserAlpha = 0.12 + Math.sin(frame * 0.15) * 0.08;
            
            // Enemy laser beam - red/orange hostile color
            const enemyLaserColor = enemyWeaponStats.color || '#ff4444';
            let gradient = CTX.createLinearGradient(laserStartX, 0, laserLength, 0);
            gradient.addColorStop(0, `rgba(255, 80, 80, ${laserAlpha + 0.08})`);
            gradient.addColorStop(0.1, `rgba(255, 50, 50, ${laserAlpha})`);
            gradient.addColorStop(1, 'rgba(255, 50, 50, 0)');
            CTX.fillStyle = gradient;
            CTX.fillRect(laserStartX, -1, laserLength - laserStartX, 2);
            
            // Pulsing dots along laser beam (enemy style - fewer dots)
            CTX.fillStyle = `rgba(255, 100, 100, ${laserAlpha + 0.15})`;
            for (let i = 0; i < laserLength - laserStartX; i += 60) {
                CTX.beginPath();
                CTX.arc(laserStartX + i, 0, 1.5, 0, Math.PI * 2);
                CTX.fill();
            }
            CTX.restore();
        }
        
        // Draw burning char marks and heat shimmer overlay on tank
        if (e.burningTime && e.burningTime > 0) {
            CTX.save();
            CTX.translate(e.x + exShake, e.y + eyShake);
            CTX.rotate(e.angle);
            
            const burnProgress = Math.min(1, e.burningTime / 90);
            
            // Heat shimmer/distortion overlay on tank body
            CTX.globalAlpha = 0.25 * burnProgress;
            CTX.fillStyle = '#ff4500';
            CTX.beginPath();
            CTX.roundRect(-24, -18, 48, 36, 4);
            CTX.fill();
            
            // Char/scorch marks on tank
            CTX.globalAlpha = 0.4 * burnProgress;
            CTX.fillStyle = '#333';
            for (let i = 0; i < 3; i++) {
                const charX = -10 + i * 10 + Math.sin(i * 2) * 5;
                const charY = -5 + Math.cos(i * 3) * 8;
                CTX.beginPath();
                CTX.ellipse(charX, charY, 6 + Math.random() * 4, 4 + Math.random() * 3, Math.random() * Math.PI, 0, Math.PI * 2);
                CTX.fill();
            }
            
            // Glowing hot spots on tank
            CTX.globalAlpha = 0.6 * burnProgress * (0.7 + Math.sin(frame * 0.2) * 0.3);
            for (let i = 0; i < 4; i++) {
                const hotX = -15 + i * 10;
                const hotY = -8 + (i % 2) * 10;
                const hotGrad = CTX.createRadialGradient(hotX, hotY, 0, hotX, hotY, 8);
                hotGrad.addColorStop(0, 'rgba(255, 200, 100, 0.8)');
                hotGrad.addColorStop(0.5, 'rgba(255, 100, 0, 0.4)');
                hotGrad.addColorStop(1, 'rgba(255, 50, 0, 0)');
                CTX.fillStyle = hotGrad;
                CTX.beginPath();
                CTX.arc(hotX, hotY, 8, 0, Math.PI * 2);
                CTX.fill();
            }
            
            CTX.globalAlpha = 1;
            CTX.restore();
        }
        
        // Draw ice tint overlay on top of tank when frozen
        if (e.frozenTime && e.frozenTime > 0) {
            CTX.save();
            CTX.translate(e.x + exShake, e.y + eyShake);
            CTX.rotate(e.angle);
            
            const freezeProgress = Math.min(1, e.frozenTime / 75);
            
            // Semi-transparent ice blue overlay on tank body
            CTX.globalAlpha = 0.35 * freezeProgress;
            CTX.fillStyle = '#87ceeb';
            CTX.beginPath();
            CTX.roundRect(-24, -18, 48, 36, 4);
            CTX.fill();
            
            // Frost pattern on tank surface
            CTX.globalAlpha = 0.5 * freezeProgress;
            CTX.strokeStyle = '#ffffff';
            CTX.lineWidth = 1;
            for (let i = 0; i < 4; i++) {
                const fx = -15 + i * 10;
                const fy = -10 + (i % 2) * 8;
                CTX.beginPath();
                CTX.moveTo(fx, fy);
                CTX.lineTo(fx + 5, fy - 5);
                CTX.moveTo(fx, fy);
                CTX.lineTo(fx + 5, fy + 5);
                CTX.moveTo(fx, fy);
                CTX.lineTo(fx - 5, fy);
                CTX.stroke();
            }
            
            CTX.globalAlpha = 1;
            CTX.restore();
        }
        
        // Draw slow trail effect when slowed (frost particles trailing behind)
        if (e.slowedTime && e.slowedTime > 0) {
            const slowProgress = Math.min(1, e.slowedTime / 150);
            CTX.globalAlpha = 0.4 * slowProgress;
            
            // Small frost trail particles
            for (let i = 0; i < 3; i++) {
                const trailOffset = 8 + i * 8;
                const trailX = e.x - Math.cos(e.angle) * trailOffset + (Math.random() - 0.5) * 10;
                const trailY = e.y - Math.sin(e.angle) * trailOffset + (Math.random() - 0.5) * 10;
                
                if ((frame + i * 5) % 10 < 5) {
                    CTX.fillStyle = '#b0e0e6';
                    CTX.beginPath();
                    CTX.arc(trailX, trailY, 2 + Math.random(), 0, Math.PI * 2);
                    CTX.fill();
                }
            }
            
            CTX.globalAlpha = 1;
        }
        
        // === STUNNED/ELECTRIC EFFECTS - Rendered ON TOP of tank for proper z-order ===
        // Draw dramatic STUNNED/ELECTRIC effect for stunned enemies
        if (e.dizzy && e.dizzy > 0) {
            CTX.save();
            CTX.translate(e.x, e.y);
            
            const stunProgress = e.dizzy / 60; // 60 = max dizzy time
            
            // Electric aura - pulsing energy field
            const auraRadius = 50 + Math.sin(frame * 0.2) * 8;
            const auraGradient = CTX.createRadialGradient(0, 0, 20, 0, 0, auraRadius);
            auraGradient.addColorStop(0, `rgba(255, 235, 59, ${0.15 * stunProgress})`);
            auraGradient.addColorStop(0.5, `rgba(168, 85, 247, ${0.2 * stunProgress})`);
            auraGradient.addColorStop(1, 'rgba(255, 235, 59, 0)');
            CTX.fillStyle = auraGradient;
            CTX.beginPath();
            CTX.arc(0, 0, auraRadius, 0, Math.PI * 2);
            CTX.fill();
            
            // Lightning bolts radiating from tank (8 bolts)
            for (let i = 0; i < 8; i++) {
                const boltAngle = (Math.PI * 2 / 8) * i + Math.sin(frame * 0.1) * 0.3;
                const boltLength = 35 + Math.sin(frame * 0.25 + i) * 10;
                
                // Only show some bolts at a time for flickering effect
                if ((frame + i * 7) % 12 < 8) {
                    CTX.strokeStyle = `rgba(255, 235, 59, ${0.8 * stunProgress})`;
                    CTX.lineWidth = 2;
                    CTX.beginPath();
                    CTX.moveTo(0, 0);
                    
                    // Zigzag lightning path
                    let prevX = 0, prevY = 0;
                    const segments = 4;
                    for (let s = 1; s <= segments; s++) {
                        const t = s / segments;
                        const baseX = Math.cos(boltAngle) * boltLength * t;
                        const baseY = Math.sin(boltAngle) * boltLength * t;
                        const perpAngle = boltAngle + Math.PI / 2;
                        const zigzag = (s < segments) ? (Math.random() - 0.5) * 15 : 0;
                        const px = baseX + Math.cos(perpAngle) * zigzag;
                        const py = baseY + Math.sin(perpAngle) * zigzag;
                        CTX.lineTo(px, py);
                        prevX = px;
                        prevY = py;
                    }
                    CTX.stroke();
                    
                    // Glow at bolt tip
                    CTX.fillStyle = `rgba(255, 255, 255, ${0.6 * stunProgress})`;
                    CTX.beginPath();
                    CTX.arc(prevX, prevY, 3, 0, Math.PI * 2);
                    CTX.fill();
                }
            }
            
            // Electric arcs crawling on tank surface
            CTX.strokeStyle = `rgba(168, 85, 247, ${0.7 * stunProgress})`;
            CTX.lineWidth = 1.5;
            for (let i = 0; i < 4; i++) {
                if ((frame + i * 5) % 8 < 5) {
                    const startX = (Math.random() - 0.5) * 40;
                    const startY = (Math.random() - 0.5) * 30;
                    const endX = startX + (Math.random() - 0.5) * 30;
                    const endY = startY + (Math.random() - 0.5) * 25;
                    const midX = (startX + endX) / 2 + (Math.random() - 0.5) * 15;
                    const midY = (startY + endY) / 2 + (Math.random() - 0.5) * 15;
                    
                    CTX.beginPath();
                    CTX.moveTo(startX, startY);
                    CTX.lineTo(midX, midY);
                    CTX.lineTo(endX, endY);
                    CTX.stroke();
                }
            }
            
            // Sparking particles orbiting
            for (let i = 0; i < 6; i++) {
                const sparkAngle = (frame * 0.12) + (i * Math.PI / 3);
                const sparkRadius = 30 + Math.sin(frame * 0.15 + i * 2) * 5;
                const sparkX = Math.cos(sparkAngle) * sparkRadius;
                const sparkY = Math.sin(sparkAngle) * sparkRadius;
                
                CTX.globalAlpha = stunProgress * (0.6 + Math.sin(frame * 0.3 + i) * 0.3);
                CTX.fillStyle = i % 2 === 0 ? '#ffeb3b' : '#a855f7';
                CTX.beginPath();
                CTX.arc(sparkX, sparkY, 3 + Math.sin(frame * 0.2 + i) * 1.5, 0, Math.PI * 2);
                CTX.fill();
                
                // Spark trail
                const trailAngle = sparkAngle - 0.4;
                const trailX = Math.cos(trailAngle) * (sparkRadius - 3);
                const trailY = Math.sin(trailAngle) * (sparkRadius - 3);
                CTX.globalAlpha = stunProgress * 0.3;
                CTX.beginPath();
                CTX.arc(trailX, trailY, 2, 0, Math.PI * 2);
                CTX.fill();
            }
            
            // Electric "shock wave" rings
            const ringPhase = (frame * 0.05) % 1;
            const ringRadius = 25 + ringPhase * 30;
            CTX.globalAlpha = stunProgress * (1 - ringPhase) * 0.5;
            CTX.strokeStyle = '#ffeb3b';
            CTX.lineWidth = 2;
            CTX.beginPath();
            CTX.arc(0, 0, ringRadius, 0, Math.PI * 2);
            CTX.stroke();
            
            CTX.globalAlpha = 1;
            CTX.restore();
        }
        
        // Draw DIZZY-only effect when stunned has worn off but dizzy remains
        if (e.dizzy && e.dizzy > 0 && !(e.stunnedTime && e.stunnedTime > 0)) {
            // This is a lighter version of the electric effect for dizzy-only state
            CTX.save();
            CTX.translate(e.x, e.y);
            
            const dizzyProgress = Math.min(1, e.dizzy / 75);
            
            // Lighter purple aura
            const auraRadius = 40 + Math.sin(frame * 0.15) * 5;
            const auraGradient = CTX.createRadialGradient(0, 0, 15, 0, 0, auraRadius);
            auraGradient.addColorStop(0, `rgba(168, 85, 247, ${0.1 * dizzyProgress})`);
            auraGradient.addColorStop(1, 'rgba(168, 85, 247, 0)');
            CTX.fillStyle = auraGradient;
            CTX.beginPath();
            CTX.arc(0, 0, auraRadius, 0, Math.PI * 2);
            CTX.fill();
            
            // Rotating stars (dizzy effect)
            for (let i = 0; i < 4; i++) {
                const starAngle = (frame * 0.1) + (i * Math.PI / 2);
                const starRadius = 32;
                const sx = Math.cos(starAngle) * starRadius;
                const sy = Math.sin(starAngle) * starRadius - 35;
                
                CTX.globalAlpha = dizzyProgress * 0.7;
                CTX.fillStyle = i % 2 === 0 ? '#a855f7' : '#c084fc';
                
                CTX.save();
                CTX.translate(sx, sy);
                CTX.rotate(starAngle * 2);
                
                // Small star shape
                CTX.beginPath();
                for (let j = 0; j < 5; j++) {
                    const angle = (j * Math.PI * 2) / 5 - Math.PI / 2;
                    const r = j % 2 === 0 ? 4 : 2;
                    if (j === 0) CTX.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
                    else CTX.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
                }
                CTX.closePath();
                CTX.fill();
                CTX.restore();
            }
            
            // Small occasional sparks
            if ((frame % 8) < 4) {
                for (let i = 0; i < 3; i++) {
                    const sparkX = (Math.random() - 0.5) * 35;
                    const sparkY = (Math.random() - 0.5) * 30;
                    CTX.globalAlpha = dizzyProgress * 0.5;
                    CTX.fillStyle = '#c084fc';
                    CTX.beginPath();
                    CTX.arc(sparkX, sparkY, 2, 0, Math.PI * 2);
                    CTX.fill();
                }
            }
            
            CTX.globalAlpha = 1;
            CTX.restore();
        }
        
        // Draw stun overlay on tank - visible on top of tank body
        if (e.stunnedTime && e.stunnedTime > 0) {
            CTX.save();
            CTX.translate(e.x, e.y);
            CTX.rotate(e.angle);
            
            const stunProgress = Math.min(1, e.stunnedTime / 30);
            
            // Electric tint overlay on tank
            CTX.globalAlpha = 0.2 * stunProgress * (0.7 + Math.sin(frame * 0.3) * 0.3);
            CTX.fillStyle = '#ffeb3b';
            CTX.beginPath();
            CTX.roundRect(-24, -18, 48, 36, 4);
            CTX.fill();
            
            // Flickering electric lines on tank surface
            if (frame % 4 < 2) {
                CTX.globalAlpha = 0.6 * stunProgress;
                CTX.strokeStyle = '#a855f7';
                CTX.lineWidth = 1;
                for (let i = 0; i < 3; i++) {
                    const lx = -15 + i * 15;
                    CTX.beginPath();
                    CTX.moveTo(lx, -12);
                    CTX.lineTo(lx + (Math.random() - 0.5) * 10, 0);
                    CTX.lineTo(lx, 12);
                    CTX.stroke();
                }
            }
            
            CTX.globalAlpha = 1;
            CTX.restore();
        }
        
        // === UNIFIED ENEMY STATUS PANEL ===
        // Use unified status panel system for consistent HP + status bar display
        // Get screen coordinates from drawTank (stored in CTX._lastTankScreenX/Y)
        const enemyScreenX = CTX._lastTankScreenX || (e.x + exShake);
        const enemyScreenY = CTX._lastTankScreenY || (e.y + eyShake);
        
        // Draw unified status panel with HP and all status effects
        CTX.save();
        if (CTX.resetTransform) {
            CTX.resetTransform();
        } else {
            CTX.setTransform(1, 0, 0, 1, 0, 0);
        }
        drawUnifiedStatusPanel(enemyScreenX, enemyScreenY, e, 'enemy', frame);
        CTX.restore();
        
        // === MAGIC SHIELD RENDERING ===
        // Draw active magic shield around enemy
        if (e.magicShieldActive && e.magicShieldHP > 0) {
            CTX.save();
            CTX.translate(e.x + exShake, e.y + eyShake);
            
            const shieldProgress = e.magicShieldHP / (e.magicShieldMaxHP || 1);
            const pulseSize = 55 + Math.sin(frame * 0.1) * 5;
            
            // Shield dome effect
            const shieldGrad = CTX.createRadialGradient(0, 0, 30, 0, 0, pulseSize);
            shieldGrad.addColorStop(0, 'rgba(168, 85, 247, 0)');
            shieldGrad.addColorStop(0.6, `rgba(168, 85, 247, ${0.2 * shieldProgress})`);
            shieldGrad.addColorStop(0.85, `rgba(192, 132, 252, ${0.4 * shieldProgress})`);
            shieldGrad.addColorStop(1, `rgba(168, 85, 247, ${0.1 * shieldProgress})`);
            CTX.fillStyle = shieldGrad;
            CTX.beginPath();
            CTX.arc(0, 0, pulseSize, 0, Math.PI * 2);
            CTX.fill();
            
            // Shield border rings
            CTX.strokeStyle = `rgba(192, 132, 252, ${0.6 * shieldProgress})`;
            CTX.lineWidth = 2;
            CTX.beginPath();
            CTX.arc(0, 0, pulseSize, 0, Math.PI * 2);
            CTX.stroke();
            
            // Inner ring
            CTX.strokeStyle = `rgba(232, 121, 249, ${0.4 * shieldProgress})`;
            CTX.lineWidth = 1;
            CTX.beginPath();
            CTX.arc(0, 0, pulseSize - 8, 0, Math.PI * 2);
            CTX.stroke();
            
            // Hexagonal pattern on shield
            for (let i = 0; i < 6; i++) {
                const hexAngle = (Math.PI * 2 * i) / 6 + frame * 0.02;
                const hexDist = pulseSize * 0.75;
                CTX.fillStyle = `rgba(255, 255, 255, ${0.3 * shieldProgress})`;
                CTX.beginPath();
                for (let j = 0; j < 6; j++) {
                    const pAngle = hexAngle + (Math.PI * 2 * j) / 6;
                    const px = Math.cos(pAngle) * 6 + Math.cos(hexAngle) * hexDist * 0.5;
                    const py = Math.sin(pAngle) * 6 + Math.sin(hexAngle) * hexDist * 0.5;
                    if (j === 0) CTX.moveTo(px, py);
                    else CTX.lineTo(px, py);
                }
                CTX.closePath();
                CTX.fill();
            }
            
            CTX.restore();
        }
        
        // === TELEPORT CHARGING EFFECT ===
        if (e.teleportCharging && e.teleportChargeTime > 0) {
            CTX.save();
            CTX.translate(e.x + exShake, e.y + eyShake);
            
            const chargeProgress = 1 - (e.teleportChargeTime / 45);
            
            // Spiral particles converging
            for (let i = 0; i < 12; i++) {
                const spiralAngle = (frame * 0.15) + (i * Math.PI / 6);
                const spiralDist = 80 * (1 - chargeProgress) + 20;
                const px = Math.cos(spiralAngle) * spiralDist;
                const py = Math.sin(spiralAngle) * spiralDist;
                
                CTX.globalAlpha = 0.6 + chargeProgress * 0.4;
                CTX.fillStyle = i % 2 === 0 ? '#a855f7' : '#c084fc';
                CTX.beginPath();
                CTX.arc(px, py, 4 * (1 - chargeProgress * 0.5), 0, Math.PI * 2);
                CTX.fill();
            }
            
            // Central vortex
            const vortexSize = 30 + chargeProgress * 20;
            const vortexGrad = CTX.createRadialGradient(0, 0, 0, 0, 0, vortexSize);
            vortexGrad.addColorStop(0, `rgba(168, 85, 247, ${0.8 * chargeProgress})`);
            vortexGrad.addColorStop(0.5, `rgba(139, 92, 246, ${0.4 * chargeProgress})`);
            vortexGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
            CTX.fillStyle = vortexGrad;
            CTX.beginPath();
            CTX.arc(0, 0, vortexSize, 0, Math.PI * 2);
            CTX.fill();
            
            CTX.globalAlpha = 1;
            CTX.restore();
        }
    }
    
    // === RENDER MAGIC SKILL VISUAL EFFECTS ===
    // Draw all active magic effects
    if (typeof magicEffects !== 'undefined' && magicEffects.length > 0) {
        for (const effect of magicEffects) {
            renderMagicEffect(effect, frame);
        }
    }
    // Render OMEGA DESTROYER boss with 7 unique weapon turrets
    if (boss) {
        // === METEOR SPAWN ANIMATION VISUAL ===
        if (boss.meteorSpawnActive) {
            const meteorScale = boss.meteorScale || 1;
            const meteorHeight = boss.meteorHeight || 0;
            
            CTX.save();
            CTX.translate(boss.x, boss.y - meteorHeight);
            
            // Impact shadow on ground (grows as boss approaches)
            if (meteorHeight > 0) {
                CTX.save();
                CTX.translate(0, meteorHeight); // Move shadow to ground level
                const shadowScale = 0.3 + meteorScale * 0.7;
                CTX.globalAlpha = 0.3 * meteorScale;
                CTX.fillStyle = '#000';
                CTX.beginPath();
                CTX.ellipse(0, 0, boss.radius * shadowScale * 1.5, boss.radius * shadowScale * 0.5, 0, 0, Math.PI * 2);
                CTX.fill();
                CTX.restore();
            }
            
            // Meteor fire trail - fades out as boss becomes visible
            const meteorFireOpacity = boss.meteorFireOpacity !== undefined ? boss.meteorFireOpacity : 1;
            if (boss.meteorSpawnPhase === 0 && meteorHeight > 20 && meteorFireOpacity > 0.05) {
                CTX.save();
                CTX.globalAlpha = meteorFireOpacity; // Apply fire opacity for smooth fade-out
                // Fire trail going upward (behind meteor)
                const trailLength = Math.min(meteorHeight * 1.5, 400);
                const fireGrad = CTX.createLinearGradient(0, 0, 0, -trailLength);
                fireGrad.addColorStop(0, 'rgba(255, 100, 0, 0.8)');
                fireGrad.addColorStop(0.3, 'rgba(255, 200, 0, 0.6)');
                fireGrad.addColorStop(0.6, 'rgba(255, 50, 0, 0.3)');
                fireGrad.addColorStop(1, 'rgba(255, 0, 0, 0)');
                
                CTX.fillStyle = fireGrad;
                CTX.beginPath();
                CTX.moveTo(-boss.radius * meteorScale * 0.5, 0);
                CTX.lineTo(-boss.radius * meteorScale * 0.2, -trailLength);
                CTX.lineTo(boss.radius * meteorScale * 0.2, -trailLength);
                CTX.lineTo(boss.radius * meteorScale * 0.5, 0);
                CTX.closePath();
                CTX.fill();
                CTX.restore();
            }
            
            // Scale boss during descent
            CTX.scale(meteorScale, meteorScale);
            
            // Apply opacity transition for smooth appearance
            const meteorOpacity = boss.meteorOpacity !== undefined ? boss.meteorOpacity : 1;
            CTX.globalAlpha = meteorOpacity;
            
            // Apply blur effect using shadow blur technique
            const meteorBlur = boss.meteorBlur !== undefined ? boss.meteorBlur : 0;
            if (meteorBlur > 0) {
                CTX.shadowColor = 'rgba(255, 150, 50, 0.8)';
                CTX.shadowBlur = meteorBlur * 2;
                CTX.shadowOffsetX = 0;
                CTX.shadowOffsetY = 0;
            }
            
            // Fiery glow around meteor - fades out as boss becomes visible
            const glowPulse = 0.8 + Math.sin(frame * 0.3) * 0.2;
            const blurGlowMultiplier = 1 + meteorBlur * 0.05; // Larger glow when blurred
            // Use meteorFireOpacity for glow so it fades with fire trail, not with boss body
            const glowIntensity = meteorFireOpacity * glowPulse;
            if (glowIntensity > 0.05) { // Only render if visible
                const meteorGlow = CTX.createRadialGradient(0, 0, boss.radius * 0.3, 0, 0, boss.radius * 1.8 * blurGlowMultiplier);
                meteorGlow.addColorStop(0, `rgba(255, 200, 100, ${0.7 * glowIntensity})`);
                meteorGlow.addColorStop(0.3, `rgba(255, 150, 0, ${0.5 * glowIntensity})`);
                meteorGlow.addColorStop(0.6, `rgba(255, 50, 0, ${0.3 * glowIntensity})`);
                meteorGlow.addColorStop(1, 'rgba(100, 0, 0, 0)');
                
                CTX.fillStyle = meteorGlow;
                CTX.beginPath();
                CTX.arc(0, 0, boss.radius * 1.8 * blurGlowMultiplier, 0, Math.PI * 2);
                CTX.fill();
            }
            
            // Draw boss body with blur effect simulation
            // When blurred, render multiple semi-transparent layers to simulate blur
            if (meteorBlur > 5) {
                // Heavy blur - render multiple expanding layers
                const blurLayers = Math.min(5, Math.ceil(meteorBlur / 5));
                for (let i = blurLayers; i >= 0; i--) {
                    const layerExpand = i * (meteorBlur / 10);
                    const layerAlpha = meteorOpacity / (i + 1);
                    
                    CTX.globalAlpha = layerAlpha;
                    CTX.fillStyle = '#1a1a2e';
                    CTX.beginPath();
                    CTX.arc(0, 0, boss.radius + layerExpand, 0, Math.PI * 2);
                    CTX.fill();
                    
                    CTX.strokeStyle = `rgba(255, 102, 0, ${layerAlpha})`;
                    CTX.lineWidth = 4;
                    CTX.stroke();
                }
                CTX.globalAlpha = meteorOpacity;
            } else {
                // Light or no blur - render normally
                CTX.globalAlpha = meteorOpacity;
                CTX.fillStyle = '#1a1a2e';
                CTX.beginPath();
                CTX.arc(0, 0, boss.radius, 0, Math.PI * 2);
                CTX.fill();
                
                CTX.strokeStyle = '#ff6600';
                CTX.lineWidth = 4;
                CTX.stroke();
            }
            
            // Reset shadow
            CTX.shadowBlur = 0;
            
            CTX.restore();
            
            // Skip normal boss rendering during meteor animation
        } else {
            // Normal boss rendering
            CTX.save();
            CTX.translate(boss.x, boss.y);
            
            // No fade-in needed - boss transitions directly from meteor at full opacity
        
            // === DARK FIRE AURA - Eternal cursed flame ring ===
            // Render BEFORE boss body so it appears behind
            // Spawns from below boss, starting small and growing dramatically
            if (boss.awakeningPhase >= 3 || boss.awakeningPhase === undefined) {
                const darkFireRadius = BOSS_CONFIG?.darkFireAuraRadius || 140;
                
                // Dramatic aura spawn animation from below
                // Track aura animation state on boss object
                if (boss.auraAnimationProgress === undefined) {
                    boss.auraAnimationProgress = 0;
                    boss.auraSpawnPhase = 0; // 0=initial glow, 1=rising, 2=expanding, 3=stable
                    boss.auraPulseIntensity = 0;
                }
                
                // Progress through spawn phases
                if (boss.auraAnimationProgress < 1) {
                    boss.auraAnimationProgress += 0.008; // Slower, more dramatic expansion
                    
                    // Update spawn phase
                    if (boss.auraAnimationProgress < 0.15) {
                        boss.auraSpawnPhase = 0; // Initial glow from ground
                    } else if (boss.auraAnimationProgress < 0.4) {
                        boss.auraSpawnPhase = 1; // Rising flames
                    } else if (boss.auraAnimationProgress < 0.7) {
                        boss.auraSpawnPhase = 2; // Expanding ring
                    } else {
                        boss.auraSpawnPhase = 3; // Stable with pulses
                    }
                }
                
                const auraScale = Math.min(1, boss.auraAnimationProgress);
                // Dramatic ease out with bounce effect
                const easedScale = auraScale < 0.4 ? 
                    Math.pow(auraScale / 0.4, 2) * 0.5 : // Slow start
                    0.5 + (1 - Math.pow(1 - (auraScale - 0.4) / 0.6, 3)) * 0.5; // Dramatic expansion
                
                const currentRadius = darkFireRadius * easedScale;
                const auraOuterRadius = boss.radius + currentRadius;
                
                // === PHASE 0: Initial ground glow spawning from below ===
                if (boss.auraSpawnPhase === 0 || boss.auraAnimationProgress < 0.2) {
                    const glowProgress = boss.auraAnimationProgress / 0.15;
                    const groundGlowRadius = 30 + glowProgress * 60;
                    
                    // Ground crack effect - dark energy seeping from below
                    CTX.save();
                    CTX.translate(0, boss.radius * 0.8); // Below boss
                    
                    // Pulsing ground glow
                    const groundGlow = CTX.createRadialGradient(0, 0, 0, 0, 0, groundGlowRadius);
                    groundGlow.addColorStop(0, `rgba(139, 0, 255, ${0.8 * glowProgress})`);
                    groundGlow.addColorStop(0.4, `rgba(75, 0, 130, ${0.5 * glowProgress})`);
                    groundGlow.addColorStop(0.7, `rgba(30, 0, 50, ${0.3 * glowProgress})`);
                    groundGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    
                    CTX.fillStyle = groundGlow;
                    CTX.beginPath();
                    CTX.arc(0, 0, groundGlowRadius, 0, Math.PI * 2);
                    CTX.fill();
                    
                    // Dark energy crack lines radiating out
                    CTX.strokeStyle = `rgba(139, 0, 255, ${0.7 * glowProgress})`;
                    CTX.lineWidth = 2 + glowProgress * 2;
                    for (let i = 0; i < 8; i++) {
                        const crackAngle = (Math.PI * 2 / 8) * i + frame * 0.02;
                        const crackLen = 20 + glowProgress * 40 + Math.sin(frame * 0.15 + i) * 10;
                        CTX.beginPath();
                        CTX.moveTo(0, 0);
                        // Jagged crack path
                        let cx = 0, cy = 0;
                        for (let j = 0; j < 4; j++) {
                            const segLen = crackLen / 4;
                            const jitter = (Math.sin(i * 7 + j * 3 + frame * 0.1) * 5);
                            cx += Math.cos(crackAngle + jitter * 0.1) * segLen;
                            cy += Math.sin(crackAngle + jitter * 0.1) * segLen;
                            CTX.lineTo(cx, cy);
                        }
                        CTX.stroke();
                    }
                    CTX.restore();
                }
                
                // === PHASE 1: Rising flames from below ===
                if (boss.auraSpawnPhase >= 1 && boss.auraAnimationProgress < 0.5) {
                    const riseProgress = (boss.auraAnimationProgress - 0.15) / 0.25;
                    const riseHeight = boss.radius * 2 * Math.min(1, riseProgress);
                    
                    // Rising dark flames
                    for (let i = 0; i < 16; i++) {
                        const flameAngle = (Math.PI * 2 / 16) * i;
                        const flameX = Math.cos(flameAngle) * (boss.radius * 0.5 + i * 3);
                        const baseY = boss.radius * 0.8;
                        const flameTopY = baseY - riseHeight * (0.7 + Math.sin(frame * 0.2 + i) * 0.3);
                        
                        // Individual rising flame
                        const flameGrad = CTX.createLinearGradient(flameX, baseY, flameX, flameTopY);
                        flameGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
                        flameGrad.addColorStop(0.3, `rgba(75, 0, 130, ${0.6 * riseProgress})`);
                        flameGrad.addColorStop(0.7, `rgba(139, 0, 255, ${0.8 * riseProgress})`);
                        flameGrad.addColorStop(1, `rgba(200, 100, 255, ${0.5 * riseProgress})`);
                        
                        CTX.fillStyle = flameGrad;
                        const flameWidth = 8 + Math.sin(frame * 0.15 + i * 2) * 3;
                        CTX.beginPath();
                        CTX.moveTo(flameX - flameWidth, baseY);
                        CTX.quadraticCurveTo(flameX - flameWidth * 0.5, (baseY + flameTopY) / 2, flameX, flameTopY);
                        CTX.quadraticCurveTo(flameX + flameWidth * 0.5, (baseY + flameTopY) / 2, flameX + flameWidth, baseY);
                        CTX.closePath();
                        CTX.fill();
                    }
                }
                
                // === PHASE 2 & 3: Main expanding aura ring ===
                if (boss.auraAnimationProgress > 0.25) {
                    // Dramatic entrance flash during expansion
                    if (boss.auraAnimationProgress > 0.35 && boss.auraAnimationProgress < 0.55) {
                        const flashIntensity = 1 - Math.abs(boss.auraAnimationProgress - 0.45) / 0.1;
                        CTX.fillStyle = `rgba(139, 0, 255, ${flashIntensity * 0.4})`;
                        CTX.beginPath();
                        CTX.arc(0, 0, boss.radius + 250 * flashIntensity, 0, Math.PI * 2);
                        CTX.fill();
                        
                        // Screen shake during peak expansion
                        if (boss.auraAnimationProgress > 0.42 && boss.auraAnimationProgress < 0.48) {
                            screenShake = Math.max(screenShake, 8);
                        }
                    }
                
                // Outer glow ring - ominous purple/black
                const auraGlow = CTX.createRadialGradient(0, 0, boss.radius, 0, 0, auraOuterRadius + 30);
                auraGlow.addColorStop(0, 'rgba(75, 0, 130, 0)');
                auraGlow.addColorStop(0.3, 'rgba(75, 0, 130, 0.15)');
                auraGlow.addColorStop(0.6, 'rgba(139, 0, 255, 0.2)');
                auraGlow.addColorStop(0.85, 'rgba(30, 0, 50, 0.3)');
                auraGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
                
                CTX.fillStyle = auraGlow;
                CTX.beginPath();
                CTX.arc(0, 0, auraOuterRadius + 30, 0, Math.PI * 2);
            CTX.fill();
            
            // Animated flame ring - multiple rotating layers (scale with aura animation)
            for (let layer = 0; layer < 3; layer++) {
                const layerRadius = boss.radius + (20 + layer * 30) * easedScale;
                const waveCount = 12 + layer * 4;
                const rotationSpeed = (layer % 2 === 0 ? 1 : -1) * 0.03;
                const layerPhase = frame * rotationSpeed + layer * Math.PI / 3;
                
                CTX.save();
                CTX.rotate(layerPhase);
                
                // Draw flame tongues
                for (let i = 0; i < waveCount; i++) {
                    const flameAngle = (Math.PI * 2 / waveCount) * i;
                    const flameHeight = (25 + Math.sin(frame * 0.1 + i * 0.5) * 15) * easedScale;
                    const flameWidth = (12 + Math.sin(frame * 0.15 + i) * 5) * easedScale;
                    
                    CTX.save();
                    CTX.rotate(flameAngle);
                    CTX.translate(layerRadius, 0);
                    
                    // Flame gradient - dark purple to black
                    const flameGrad = CTX.createLinearGradient(0, 0, flameHeight, 0);
                    flameGrad.addColorStop(0, layer === 0 ? 'rgba(139, 0, 255, 0.8)' : 'rgba(75, 0, 130, 0.6)');
                    flameGrad.addColorStop(0.5, 'rgba(50, 0, 80, 0.5)');
                    flameGrad.addColorStop(1, 'rgba(10, 0, 20, 0)');
                    
                    CTX.fillStyle = flameGrad;
                    CTX.beginPath();
                    CTX.moveTo(0, -flameWidth / 2);
                    CTX.quadraticCurveTo(flameHeight * 0.5, -flameWidth * 0.3, flameHeight, 0);
                    CTX.quadraticCurveTo(flameHeight * 0.5, flameWidth * 0.3, 0, flameWidth / 2);
                    CTX.closePath();
                    CTX.fill();
                    
                    CTX.restore();
                }
                CTX.restore();
            }
            
            // Inner flame ring - brighter edge (scales with animation)
            CTX.strokeStyle = `rgba(139, 0, 255, ${0.4 * easedScale})`;
            CTX.lineWidth = 3;
            CTX.setLineDash([5, 10]);
            CTX.beginPath();
            CTX.arc(0, 0, boss.radius + currentRadius * 0.5, 0, Math.PI * 2);
            CTX.stroke();
            CTX.setLineDash([]);
            
            // Occasional evil sparks in the aura (only when fully expanded)
            if (frame % 3 === 0 && easedScale > 0.7) {
                const sparkAngle = Math.random() * Math.PI * 2;
                const sparkDist = boss.radius + Math.random() * currentRadius;
                CTX.fillStyle = Math.random() < 0.5 ? '#ff00ff' : '#8b00ff';
                CTX.beginPath();
                CTX.arc(
                    Math.cos(sparkAngle) * sparkDist,
                    Math.sin(sparkAngle) * sparkDist,
                    2 + Math.random() * 3,
                    0, Math.PI * 2
                );
                CTX.fill();
            }
            } // Close if (boss.auraAnimationProgress > 0.25)
        }
        
        // Boss shadow with blur effect (global shadow direction: offset +4,+4)
        // Skip shadow at low quality for performance
        const bossBodyShadowQuality = getShadowQuality();
        if (bossBodyShadowQuality >= 0.3) {
            CTX.save();
            if (bossBodyShadowQuality >= 0.7) {
                CTX.filter = 'blur(8px)';
            } else if (bossBodyShadowQuality >= 0.5) {
                CTX.filter = 'blur(4px)';
            }
            CTX.fillStyle = `rgba(0,0,0,${0.5 * bossBodyShadowQuality})`;
            CTX.beginPath();
            CTX.arc(6, 6, boss.radius + 10, 0, Math.PI * 2);
            CTX.fill();
            CTX.filter = 'none';
            CTX.restore();
        }
        
        // Ultimate charging effect
        if (boss.ultimateState === 'charging') {
            const chargeProgress = boss.ultimateCharge / BOSS_CONFIG.ultimate.chargeTime;
            
            // Energy absorption particles flying toward boss
            for (let i = 0; i < 12; i++) {
                const angle = (frame * 0.08) + (Math.PI * 2 * i / 12);
                const radius = 200 - chargeProgress * 120;
                const px = Math.cos(angle) * radius;
                const py = Math.sin(angle) * radius;
                
                CTX.save();
                CTX.globalAlpha = 0.4 + chargeProgress * 0.4;
                CTX.fillStyle = BOSS_CONFIG.ultimate.chargeColor;
                CTX.beginPath();
                CTX.arc(px, py, 4 + chargeProgress * 3, 0, Math.PI * 2);
                CTX.fill();
                
                // Energy trail toward center
                CTX.strokeStyle = BOSS_CONFIG.ultimate.chargeColor;
                CTX.lineWidth = 2;
                CTX.globalAlpha = 0.3;
                CTX.beginPath();
                CTX.moveTo(px, py);
                CTX.lineTo(0, 0);
                CTX.stroke();
                CTX.restore();
            }
            
            // Central charging orb (Goku Spirit Bomb style)
            const chargeOrbRadius = 20 + chargeProgress * 50;
            const chargeGradient = CTX.createRadialGradient(0, 0, 0, 0, 0, chargeOrbRadius);
            chargeGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
            chargeGradient.addColorStop(0.3, BOSS_CONFIG.ultimate.chargeColor);
            chargeGradient.addColorStop(0.7, 'rgba(255, 200, 0, 0.6)');
            chargeGradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
            
            CTX.fillStyle = chargeGradient;
            CTX.beginPath();
            CTX.arc(0, 0, chargeOrbRadius, 0, Math.PI * 2);
            CTX.fill();
            
            // Pulsing rings
            for (let ring = 0; ring < 3; ring++) {
                const ringRadius = chargeOrbRadius + 15 + ring * 20;
                const ringPhase = Math.sin(frame * 0.15 + ring);
                CTX.strokeStyle = BOSS_CONFIG.ultimate.chargeColor;
                CTX.lineWidth = 3 - ring;
                CTX.globalAlpha = 0.5 - ring * 0.15 + ringPhase * 0.1;
                CTX.beginPath();
                CTX.arc(0, 0, ringRadius, 0, Math.PI * 2);
                CTX.stroke();
            }
            CTX.globalAlpha = 1;
        }
        
        // Ultimate OMEGA BEAM - 7 beams from each turret, rotating 360 degrees
        if (boss.ultimateState === 'firing') {
            const baseBeamAngle = boss.ultimateBeamAngle || 0;
            const beamWidth = BOSS_CONFIG.ultimate.beamWidth;
            const turretConfigs = BOSS_CONFIG.turrets;
            
            // Draw 7 beams, one from each turret
            for (let t = 0; t < turretConfigs.length; t++) {
                const turretConfig = turretConfigs[t];
                const beamAngle = baseBeamAngle + turretConfig.angleOffset;
                const beamLength = (boss.ultimateBeamLengths && boss.ultimateBeamLengths[t]) ? boss.ultimateBeamLengths[t] : 1500;
                
                // Calculate turret position
                const turretDist = boss.radius * 0.7;
                const turretX = Math.cos(turretConfig.angleOffset) * turretDist;
                const turretY = Math.sin(turretConfig.angleOffset) * turretDist;
                
                CTX.save();
                CTX.translate(turretX, turretY);
                CTX.rotate(beamAngle);
                
                // Beam core gradient using uniform OMEGA color (all 7 beams same color)
                const omegaBeamColor = BOSS_CONFIG.ultimate.beamColor || '#ff0000';
                const beamGradient = CTX.createLinearGradient(0, 0, beamLength, 0);
                beamGradient.addColorStop(0, '#ffffff');
                beamGradient.addColorStop(0.1, omegaBeamColor);
                beamGradient.addColorStop(0.7, omegaBeamColor + 'cc');
                beamGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
                
                CTX.fillStyle = beamGradient;
                CTX.beginPath();
                CTX.moveTo(0, -beamWidth * 0.25);
                CTX.lineTo(beamLength, -beamWidth * 0.12);
                CTX.lineTo(beamLength, beamWidth * 0.12);
                CTX.lineTo(0, beamWidth * 0.25);
                CTX.closePath();
                CTX.fill();
                
                // Beam outer glow (uniform OMEGA color)
                CTX.globalAlpha = 0.3;
                CTX.fillStyle = omegaBeamColor;
                CTX.beginPath();
                CTX.moveTo(0, -beamWidth * 0.7);
                CTX.lineTo(beamLength * 0.85, -beamWidth * 0.3);
                CTX.lineTo(beamLength * 0.85, beamWidth * 0.3);
                CTX.lineTo(0, beamWidth * 0.7);
                CTX.closePath();
                CTX.fill();
                
                // Energy particles along beam (reduced for performance with 7 beams)
                CTX.globalAlpha = 0.6;
                for (let i = 0; i < 8; i++) {
                    const particleDist = (i / 8) * beamLength;
                    const particleY = (Math.random() - 0.5) * beamWidth * 0.4;
                    const particleSize = 2 + Math.random() * 3;
                    
                    CTX.fillStyle = Math.random() > 0.5 ? '#ffffff' : omegaBeamColor;
                    CTX.beginPath();
                    CTX.arc(particleDist, particleY, particleSize, 0, Math.PI * 2);
                    CTX.fill();
                }
                
                CTX.restore();
            }
            CTX.globalAlpha = 1;
        }
        
        // Boss shadow with blur effect - skip at low quality
        const bossShadowQuality = getShadowQuality();
        if (bossShadowQuality >= 0.3) {
            CTX.save();
            if (bossShadowQuality >= 0.7) {
                CTX.filter = 'blur(6px)';
            } else if (bossShadowQuality >= 0.5) {
                CTX.filter = 'blur(3px)';
            }
            CTX.translate(8, 8); // Shadow offset
            CTX.fillStyle = `rgba(0, 0, 0, ${0.35 * bossShadowQuality})`;
            CTX.beginPath();
            CTX.arc(0, 0, boss.radius * 1.05, 0, Math.PI * 2);
            CTX.fill();
            CTX.filter = 'none';
            CTX.restore();
        }
        
        // Boss main body (OMEGA DESTROYER - massive dark core)
        CTX.save();
        CTX.rotate(boss.angle);
        
        // Outer armor plating
        const armorGradient = CTX.createRadialGradient(0, 0, boss.radius * 0.3, 0, 0, boss.radius);
        armorGradient.addColorStop(0, '#1a1a2e');
        armorGradient.addColorStop(0.5, '#0f0f1a');
        armorGradient.addColorStop(1, '#050508');
        
        CTX.fillStyle = armorGradient;
        CTX.beginPath();
        CTX.arc(0, 0, boss.radius, 0, Math.PI * 2);
        CTX.fill();
        
        // Glowing edge based on phase
        let phaseColor = '#a855f7'; // Purple default
        if (boss.phase === 2) phaseColor = '#f97316'; // Orange
        if (boss.phase === 3) phaseColor = '#ef4444'; // Red
        
        CTX.strokeStyle = phaseColor;
        CTX.lineWidth = 4;
        CTX.shadowColor = phaseColor;
        CTX.shadowBlur = 15;
        CTX.stroke();
        CTX.shadowBlur = 0;
        
        // Inner core pulse
        const corePulse = 0.8 + Math.sin(frame * 0.08) * 0.2;
        const coreGradient = CTX.createRadialGradient(0, 0, 0, 0, 0, boss.radius * 0.4 * corePulse);
        coreGradient.addColorStop(0, phaseColor);
        coreGradient.addColorStop(0.5, 'rgba(168, 85, 247, 0.3)');
        coreGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        CTX.fillStyle = coreGradient;
        CTX.beginPath();
        CTX.arc(0, 0, boss.radius * 0.4 * corePulse, 0, Math.PI * 2);
        CTX.fill();
        
        // 7 armor segments to match 7 turrets (positioned to align with turrets)
        for (let i = 0; i < 7; i++) {
            const segmentAngle = (Math.PI * 2 / 7) * i;
            CTX.save();
            CTX.rotate(segmentAngle);
            
            // Armor plate - shortened to avoid turret collision (turrets at radius - 25)
            CTX.fillStyle = '#1f1f2e';
            CTX.beginPath();
            CTX.moveTo(boss.radius * 0.45, -12);
            CTX.lineTo(boss.radius - 35, -8);
            CTX.lineTo(boss.radius - 35, 8);
            CTX.lineTo(boss.radius * 0.45, 12);
            CTX.closePath();
            CTX.fill();
            
            // Segment glow line
            CTX.strokeStyle = phaseColor;
            CTX.lineWidth = 2;
            CTX.globalAlpha = 0.6;
            CTX.beginPath();
            CTX.moveTo(boss.radius * 0.5, 0);
            CTX.lineTo(boss.radius - 40, 0);
            CTX.stroke();
            CTX.globalAlpha = 1;
            
            CTX.restore();
        }
        
        // Draw damage cracks on boss body - RADIAL ZIGZAG from center
        // Cracks emanate from RANDOM positions within boss tank, not sequential patterns
        const bossHpRatioCracks = Math.max(0, boss.hp / boss.maxHp);
        const bossDamage = 1 - bossHpRatioCracks; // 0 = no damage, 1 = destroyed
        
        if (bossDamage > 0.05) {
            // Calculate number of cracks based on damage (more damage = more cracks)
            const targetCrackCount = Math.min(24, Math.ceil(bossDamage * 24));
            
            // Initialize crack seeds array if needed
            if (!boss.crackSeeds) {
                boss.crackSeeds = [];
                // Initialize stable random generator for this boss instance
                boss.crackRngSeed = (boss.id || 1) * 17.31 + boss.maxHp * 0.73;
            }
            
            // Simple seeded random for deterministic but varied cracks
            const seededRandom = (idx, offset = 0) => {
                let seed = boss.crackRngSeed + idx * 127.31 + offset * 73.17;
                seed = Math.sin(seed * 9999) * 9999;
                return seed - Math.floor(seed);
            };
            
            // Add new crack seeds as damage increases (stable - only add, never remove)
            while (boss.crackSeeds.length < targetCrackCount) {
                // Generate TRULY random angle for this crack (not evenly distributed)
                const crackIndex = boss.crackSeeds.length;
                
                // Fully random angle using seeded random (0 to 2*PI)
                const randomAngle = seededRandom(crackIndex, 0) * Math.PI * 2;
                
                // Random starting distance from center (cracks can start anywhere)
                const startRadius = seededRandom(crackIndex, 1) * 0.2; // 0% to 20% from center
                
                boss.crackSeeds.push({
                    angle: randomAngle,
                    startRadius: startRadius,
                    seed: seededRandom(crackIndex, 2) * 1000 + 0.31, // Unique seed for zigzag pattern
                    lengthVar: 0.5 + seededRandom(crackIndex, 3) * 0.5, // 0.5 to 1.0 length variation
                    zigzagIntensity: 0.5 + seededRandom(crackIndex, 4) * 0.6 // Zigzag intensity variation
                });
            }
            
            // Function to draw a radial zigzag crack from center outward
            const drawRadialCrack = (crackData, intensity) => {
                const rnd = (idx, offset = 0) => {
                    let val = Math.sin(crackData.seed * 917 + idx * 131 + offset * 73 + 0.1) * 10000;
                    return val - Math.floor(val);
                };
                
                // Crack length varies based on damage and individual crack variation
                // At low damage, cracks are shorter; at high damage, they reach near the edge
                const baseCrackLength = boss.radius * 0.3; // Minimum 30% radius
                const maxCrackLength = boss.radius * 0.85; // Maximum 85% radius (not all the way to edge)
                const damageScaledLength = baseCrackLength + (maxCrackLength - baseCrackLength) * intensity;
                const crackLen = damageScaledLength * crackData.lengthVar;
                
                // Number of zigzag segments
                const segCount = Math.floor(6 + crackLen / boss.radius * 8);
                
                // Start position based on startRadius (random offset from center)
                const startOffset = 8 + (crackData.startRadius || 0) * boss.radius * 0.3 + rnd(crackData.seed, 100) * 5;
                let currX = Math.cos(crackData.angle) * startOffset;
                let currY = Math.sin(crackData.angle) * startOffset;
                
                CTX.beginPath();
                CTX.moveTo(currX, currY);
                
                for (let j = 0; j < segCount; j++) {
                    const progressRatio = (j + 1) / segCount;
                    
                    // ZIGZAG: Alternate direction with random intensity
                    const zigzagDir = (j % 2 === 0) ? 1 : -1;
                    const zigzagAmount = crackData.zigzagIntensity * (0.3 + rnd(crackData.seed, 200 + j) * 0.4);
                    const zigzagAngle = crackData.angle + zigzagDir * zigzagAmount * (1 - progressRatio * 0.5);
                    
                    // Segment length decreases slightly toward end (tapering effect)
                    const segLen = (crackLen / segCount) * (1.1 - progressRatio * 0.3) * (0.7 + rnd(crackData.seed, 300 + j) * 0.6);
                    
                    currX += Math.cos(zigzagAngle) * segLen;
                    currY += Math.sin(zigzagAngle) * segLen;
                    
                    CTX.lineTo(currX, currY);
                    
                    // Add occasional branch
                    if (j > 1 && j < segCount - 1 && rnd(crackData.seed, 400 + j) > 0.7) {
                        const branchLen = segLen * (0.3 + rnd(crackData.seed, 500 + j) * 0.4);
                        const branchAngle = zigzagAngle + (rnd(crackData.seed, 600 + j) > 0.5 ? 0.8 : -0.8);
                        const branchX = currX + Math.cos(branchAngle) * branchLen;
                        const branchY = currY + Math.sin(branchAngle) * branchLen;
                        
                        CTX.moveTo(currX, currY);
                        CTX.lineTo(branchX, branchY);
                        CTX.moveTo(currX, currY);
                    }
                }
                
                CTX.stroke();
            };
            
            // Draw white glowing cracks
            CTX.save();
            
            // Outer glow layer
            CTX.shadowColor = '#ffffff';
            CTX.shadowBlur = 10 + bossDamage * 12;
            CTX.strokeStyle = `rgba(255, 255, 255, ${0.4 + bossDamage * 0.4})`;
            CTX.lineWidth = 3 + bossDamage * 2;
            CTX.lineCap = 'round';
            CTX.lineJoin = 'round';
            
            for (let i = 0; i < targetCrackCount; i++) {
                drawRadialCrack(boss.crackSeeds[i], bossDamage);
            }
            
            // Inner bright white core
            CTX.shadowBlur = 0;
            CTX.strokeStyle = `rgba(255, 255, 255, ${0.7 + bossDamage * 0.3})`;
            CTX.lineWidth = 1.5 + bossDamage * 0.5;
            
            for (let i = 0; i < targetCrackCount; i++) {
                drawRadialCrack(boss.crackSeeds[i], bossDamage);
            }
            
            CTX.restore();
        }
        
        CTX.restore();
        
        // Draw 7 UNIQUE turrets around the boss (only active one glows)
        if (boss.turrets && BOSS_CONFIG.turrets) {
            const activeTurretIndex = boss.activeTurretIndex !== undefined ? boss.activeTurretIndex : 0;
            const isSwitching = boss.turretSwitchCooldown > 0;
            
            // First pass: Draw turret shadows with blur - skip at low quality
            const turretShadowQuality = getShadowQuality();
            if (turretShadowQuality >= 0.3) {
                boss.turrets.forEach((turret, index) => {
                    const turretConfig = BOSS_CONFIG.turrets[index];
                    if (!turretConfig) return;
                    
                    const turretWorldAngle = boss.angle + turret.angleOffset;
                    const turretDist = boss.radius - 25;
                    const turretX = Math.cos(turretWorldAngle) * turretDist;
                    const turretY = Math.sin(turretWorldAngle) * turretDist;
                    
                    // Shadow offset (consistent with global shadow direction)
                    const shadowOffset = 5;
                    
                    CTX.save();
                    CTX.translate(turretX + shadowOffset, turretY + shadowOffset);
                    
                    // Turret barrel rotation for shadow (world angle directly)
                    const barrelAngle = turret.turretAngle;
                    CTX.rotate(barrelAngle);
                    
                    // Apply blur to turret shadow based on quality
                    if (turretShadowQuality >= 0.7) {
                        CTX.filter = 'blur(4px)';
                    } else if (turretShadowQuality >= 0.5) {
                        CTX.filter = 'blur(2px)';
                    }
                    CTX.fillStyle = `rgba(0, 0, 0, ${0.25 * turretShadowQuality})`;
                    CTX.globalAlpha = 0.4 * turretShadowQuality;
                    
                    // Draw simplified turret shadow shape
                    // Mount shadow
                    CTX.beginPath();
                    CTX.arc(0, 0, 16, 0, Math.PI * 2);
                    CTX.fill();
                    
                    // Barrel shadow
                    CTX.fillRect(0, -5, 26, 10);
                    
                    CTX.filter = 'none';
                    CTX.globalAlpha = 1;
                    CTX.restore();
                });
            }
            
            // Second pass: Draw actual turrets
            boss.turrets.forEach((turret, index) => {
                const turretConfig = BOSS_CONFIG.turrets[index];
                if (!turretConfig) return;
                
                const isActive = index === activeTurretIndex && !isSwitching;
                const turretWorldAngle = boss.angle + turret.angleOffset;
                const turretDist = boss.radius - 25;
                const turretX = Math.cos(turretWorldAngle) * turretDist;
                const turretY = Math.sin(turretWorldAngle) * turretDist;
                
                CTX.save();
                CTX.translate(turretX, turretY);
                
                // Turret base with unique color
                const turretColor = turretConfig.color;
                const glowColor = turretConfig.glowColor;
                
                // Active turret has stronger glow and pulsing effect
                if (isActive) {
                    const pulse = 0.7 + Math.sin(frame * 0.15) * 0.3;
                    CTX.shadowColor = turretColor;
                    CTX.shadowBlur = 20 * pulse;
                    
                    // Active indicator ring
                    CTX.strokeStyle = turretColor;
                    CTX.lineWidth = 2;
                    CTX.globalAlpha = 0.6;
                    CTX.beginPath();
                    CTX.arc(0, 0, 24 + Math.sin(frame * 0.1) * 2, 0, Math.PI * 2);
                    CTX.stroke();
                    CTX.globalAlpha = 1;
                } else {
                    // Inactive turrets are dimmed
                    CTX.globalAlpha = 0.5;
                }
                
                // Turret mount
                CTX.fillStyle = isActive ? '#1a1a1a' : '#0a0a0a';
                CTX.beginPath();
                CTX.arc(0, 0, 18, 0, Math.PI * 2);
                CTX.fill();
                
                CTX.strokeStyle = isActive ? turretColor : '#333';
                CTX.lineWidth = isActive ? 3 : 2;
                CTX.stroke();
                CTX.shadowBlur = 0;
                
                // Turret barrel rotation (aims at player)
                // turret.turretAngle is WORLD angle where barrel points
                // After CTX.translate(), local right is still world right
                // So we rotate directly by the world angle to point barrel correctly
                const barrelAngle = turret.turretAngle;
                CTX.rotate(barrelAngle);
                
                // Apply kickback offset (recoil animation when turret fires)
                const kickbackOffset = turret.kickbackOffset || 0;
                if (kickbackOffset > 0) {
                    // Move barrel backward during kickback
                    CTX.translate(-kickbackOffset, 0);
                }
                
                // Check if turret recently fired for muzzle flash
                const recentlyFired = turret.lastFired && (frame - turret.lastFired) < 8;
                
                // Draw unique turret shape based on weapon type
                drawBossTurretShape(CTX, turretConfig.shape, isActive ? turretColor : '#444', glowColor, recentlyFired && isActive);
                
                CTX.globalAlpha = 1;
                CTX.restore();
            });
        }
        
        // === BOSS UNIFIED STATUS PANEL - Epic dramatic style ===
        const hpBarWidth = boss.radius * 2.5;
        const hpBarY = -boss.radius - 50;
        const BAR_HEIGHT = 10;
        const BAR_GAP = 5;
        
        // Collect boss status effects
        const bossStatusBars = [];
        
        // HP Bar (always first) - with smooth transition
        // Initialize displayHp if not exists
        if (boss.displayHp === undefined) {
            boss.displayHp = boss.hp;
        }
        
        // Smoothly interpolate displayHp towards actual hp
        // Use lerp factor 0.05 for very smooth transition (20 frames to reach 63% of target)
        const hpLerpSpeed = 0.05;
        if (boss.displayHp > boss.hp) {
            // HP decreased - smooth decrease animation
            boss.displayHp = boss.displayHp - (boss.displayHp - boss.hp) * hpLerpSpeed;
            // Snap to target if very close to prevent floating point issues
            if (Math.abs(boss.displayHp - boss.hp) < 1) {
                boss.displayHp = boss.hp;
            }
        } else if (boss.displayHp < boss.hp) {
            // HP increased (heal) - faster recovery animation
            boss.displayHp = boss.displayHp + (boss.hp - boss.displayHp) * 0.15;
            if (Math.abs(boss.displayHp - boss.hp) < 1) {
                boss.displayHp = boss.hp;
            }
        }
        
        const bossHpRatio = boss.displayHp / boss.maxHp;
        const hpConfig = {
            colors: {
                fill: boss.phase === 1 ? '#22c55e' : (boss.phase === 2 ? '#f97316' : '#ef4444'),
                bg: 'rgba(0, 0, 0, 0.7)',
                glow: boss.phase === 1 ? '#4ade80' : (boss.phase === 2 ? '#fb923c' : '#f87171'),
                border: '#ffffff'
            },
            particleColor: boss.phase === 1 ? '#86efac' : (boss.phase === 2 ? '#fed7aa' : '#fecaca')
        };
        bossStatusBars.push({
            config: hpConfig,
            progress: bossHpRatio,
            label: 'HP',
            value: Math.ceil(boss.hp) + '/' + Math.ceil(boss.maxHp) // Show actual HP, not display HP
        });
        
        // Shield bar
        if (boss.shieldTime && boss.shieldTime > 0) {
            bossStatusBars.push({
                config: STATUS_EFFECT_CONFIG.shield,
                progress: Math.min(1, boss.shieldTime / 600),
                label: 'SHIELD',
                value: Math.ceil(boss.shieldTime / 60) + 's'
            });
        }
        
        // Armor bar
        if (boss.armor && boss.armor > 0) {
            bossStatusBars.push({
                config: STATUS_EFFECT_CONFIG.armor,
                progress: Math.min(1, boss.armor / Math.max(1, boss.maxArmor || 200)),
                label: 'ARMOR',
                value: Math.ceil(boss.armor)
            });
        }
        
        // Note: Ultimate cooldown bar removed - boss ultimate now triggers based on damage threshold
        // The boss will use ultimate after receiving enough damage, not on a timer
        
        // Calculate panel dimensions - NO background box for boss either, just label
        const LABEL_HEIGHT = 14;
        const totalBarsHeight = bossStatusBars.length * (BAR_HEIGHT + BAR_GAP) - BAR_GAP;
        const panelStartY = hpBarY - totalBarsHeight - LABEL_HEIGHT;
        
        // Boss label at top - elegant dramatic styling (consistent with other entities)
        const bossPulse = 1 + Math.sin(frame * 0.08) * 0.5 * 0.3;
        
        CTX.font = 'bold 8px Arial';
        CTX.textAlign = 'center';
        CTX.textBaseline = 'middle';
        
        // Outer glow
        CTX.shadowColor = '#f59e0b';
        CTX.shadowBlur = 8 * bossPulse;
        CTX.fillStyle = '#fbbf24';
        CTX.fillText('BOSS', 0, panelStartY + 6);
        
        // Inner brighter text
        CTX.shadowBlur = 4;
        CTX.fillStyle = '#ffffff';
        CTX.globalAlpha = 0.7;
        CTX.fillText('BOSS', 0, panelStartY + 6);
        CTX.globalAlpha = 1;
        CTX.shadowBlur = 0;
        
        // Draw each status bar - HP at bottom (first drawn = bottom position)
        bossStatusBars.forEach((bar, index) => {
            // Draw from top to bottom, so HP (index 0) ends up at bottom visually
            const barY = panelStartY + LABEL_HEIGHT + (bossStatusBars.length - 1 - index) * (BAR_HEIGHT + BAR_GAP);
            drawStatusBarEnhanced(
                CTX,
                -hpBarWidth/2,
                barY,
                hpBarWidth,
                BAR_HEIGHT,
                bar.progress,
                bar.config,
                bar.label,
                bar.value,
                frame
            );
        });
        
        CTX.restore();
        } // Close else block for normal boss rendering
    }

// Helper function to draw unique turret shapes
function drawBossTurretShape(ctx, shape, color, glowColor, isFiring) {
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    
    // Firing flash effect
    if (isFiring) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
    }
    
    switch (shape) {
        case 'railgun':
            // Long barrel with energy coils
            ctx.fillRect(0, -4, 35, 8);
            ctx.strokeRect(0, -4, 35, 8);
            // Energy coils
            for (let i = 0; i < 3; i++) {
                ctx.strokeStyle = glowColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(10 + i * 8, 0, 6, 0, Math.PI * 2);
                ctx.stroke();
            }
            // Muzzle
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(35, 0, 3, 0, Math.PI * 2);
            ctx.fill();
            break;
            
        case 'crystalline':
            // Jagged ice crystal shape
            ctx.beginPath();
            ctx.moveTo(0, -3);
            ctx.lineTo(12, -6);
            ctx.lineTo(25, -3);
            ctx.lineTo(30, 0);
            ctx.lineTo(25, 3);
            ctx.lineTo(12, 6);
            ctx.lineTo(0, 3);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // Crystal tip
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(30, 0);
            ctx.lineTo(38, -2);
            ctx.lineTo(38, 2);
            ctx.closePath();
            ctx.fill();
            break;
            
        case 'flamethrower':
            // Wide nozzle
            ctx.beginPath();
            ctx.moveTo(0, -5);
            ctx.lineTo(20, -8);
            ctx.lineTo(28, -12);
            ctx.lineTo(28, 12);
            ctx.lineTo(20, 8);
            ctx.lineTo(0, 5);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // Inner flames when firing
            if (isFiring) {
                ctx.fillStyle = '#ffff00';
                ctx.beginPath();
                ctx.arc(28, 0, 5, 0, Math.PI * 2);
                ctx.fill();
            }
            break;
            
        case 'gatling':
            // Multi-barrel rotating gun
            ctx.fillStyle = '#333';
            ctx.fillRect(-5, -10, 10, 20);
            // Barrels
            for (let i = 0; i < 4; i++) {
                const barrelY = -6 + i * 4;
                ctx.fillStyle = color;
                ctx.fillRect(0, barrelY - 1.5, 30, 3);
            }
            // Rotating indicator
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(-2, 0, 7, 0, Math.PI * 2);
            ctx.stroke();
            break;
            
        case 'plasma':
            // Bulbous energy chamber
            ctx.beginPath();
            ctx.arc(12, 0, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Energy core
            const plasmaGlow = ctx.createRadialGradient(12, 0, 0, 12, 0, 10);
            plasmaGlow.addColorStop(0, '#ffffff');
            plasmaGlow.addColorStop(0.5, color);
            plasmaGlow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = plasmaGlow;
            ctx.beginPath();
            ctx.arc(12, 0, 8, 0, Math.PI * 2);
            ctx.fill();
            // Barrel
            ctx.fillStyle = color;
            ctx.fillRect(20, -3, 15, 6);
            break;
            
        case 'missile_pod':
            // Multiple missile tubes
            ctx.fillStyle = '#333';
            ctx.fillRect(-3, -12, 20, 24);
            // Missile tubes (2x3 grid)
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 2; col++) {
                    const tubeX = 2 + col * 8;
                    const tubeY = -8 + row * 8;
                    ctx.fillStyle = '#111';
                    ctx.beginPath();
                    ctx.arc(tubeX, tubeY, 3, 0, Math.PI * 2);
                    ctx.fill();
                    // Missile tip
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(tubeX + 5, tubeY, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            break;
            
        case 'heavy_cannon':
            // Massive double barrel
            ctx.fillStyle = '#222';
            ctx.fillRect(-5, -8, 15, 16);
            // Top barrel
            ctx.fillStyle = color;
            ctx.fillRect(8, -6, 28, 5);
            ctx.strokeRect(8, -6, 28, 5);
            // Bottom barrel
            ctx.fillRect(8, 1, 28, 5);
            ctx.strokeRect(8, 1, 28, 5);
            // Muzzle brake
            ctx.fillStyle = '#444';
            ctx.fillRect(32, -8, 5, 16);
            break;
            
        default:
            // Default barrel
            ctx.fillRect(0, -3, 25, 6);
            ctx.strokeRect(0, -3, 25, 6);
    }
    
    ctx.shadowBlur = 0;
}

    const turboActive = player.turboActive && player.turboTime > 0;
    if (player.spawnWarmup > 0) {
        const playerSpawnProgress = 1 - (player.spawnWarmup / (player.spawnWarmupMax || SPAWN_WARMUP_FRAMES));
        
        // Check if this is a revive spawn (phoenix theme) or normal spawn (green theme)
        const isReviveSpawn = player.isReviving === true;
        
        // Color scheme: Phoenix (pink/gold) for revive, Green for normal spawn
        const primaryColor = isReviveSpawn ? '255, 105, 180' : '34, 197, 94';  // Pink or Green
        const secondaryColor = isReviveSpawn ? '251, 191, 36' : '200, 255, 200'; // Gold or Light green
        const glowColor = isReviveSpawn ? '255, 215, 0' : '34, 197, 94';  // Gold or Green
        
        // DRAMATIC TELEPORT SPAWN ANIMATION for player
        CTX.save();
        const beamAlpha = (1 - playerSpawnProgress) * 0.8;
        
        // Vertical teleport beam from sky
        const beamGrad = CTX.createLinearGradient(player.x, player.y - 200, player.x, player.y + 20);
        beamGrad.addColorStop(0, `rgba(${primaryColor}, 0)`);
        beamGrad.addColorStop(0.3, `rgba(${primaryColor}, ${beamAlpha * 0.5})`);
        beamGrad.addColorStop(0.8, `rgba(255, 255, 255, ${beamAlpha})`);
        beamGrad.addColorStop(1, `rgba(${primaryColor}, ${beamAlpha * 0.3})`);
        
        CTX.fillStyle = beamGrad;
        CTX.fillRect(player.x - 25, player.y - 200, 50, 220);
        
        // Ground impact ring - expanding circle
        const ringRadius = 30 + playerSpawnProgress * 50;
        CTX.strokeStyle = `rgba(${primaryColor}, ${(1 - playerSpawnProgress) * 0.7})`;
        CTX.lineWidth = 4 * (1 - playerSpawnProgress);
        CTX.beginPath();
        CTX.arc(player.x, player.y, ringRadius, 0, Math.PI * 2);
        CTX.stroke();
        
        // Inner bright ring
        CTX.strokeStyle = `rgba(255, 255, 255, ${(1 - playerSpawnProgress) * 0.9})`;
        CTX.lineWidth = 2;
        CTX.beginPath();
        CTX.arc(player.x, player.y, ringRadius * 0.6, 0, Math.PI * 2);
        CTX.stroke();
        
        // Electric sparks around spawn point
        for (let i = 0; i < 6; i++) {
            const sparkAngle = (Math.PI * 2 / 6) * i + frame * 0.2;
            const sparkDist = 25 + Math.sin(frame * 0.3 + i) * 10;
            const sparkX = player.x + Math.cos(sparkAngle) * sparkDist;
            const sparkY = player.y + Math.sin(sparkAngle) * sparkDist;
            
            CTX.fillStyle = `rgba(${secondaryColor}, ${beamAlpha})`;
            CTX.beginPath();
            CTX.arc(sparkX, sparkY, 3, 0, Math.PI * 2);
            CTX.fill();
        }
        
        // Portal effect above
        CTX.strokeStyle = `rgba(${primaryColor}, ${beamAlpha * 0.7})`;
        CTX.lineWidth = 3;
        CTX.beginPath();
        CTX.ellipse(player.x, player.y - 150, 30 + Math.sin(frame * 0.4) * 5, 12, 0, 0, Math.PI * 2);
        CTX.stroke();
        
        // Inner glow circle
        CTX.fillStyle = `rgba(${glowColor}, ${beamAlpha * 0.35})`;
        CTX.beginPath();
        CTX.arc(player.x, player.y, 25 * (1 - playerSpawnProgress * 0.5), 0, Math.PI * 2);
        CTX.fill();
        
        // Phoenix wings effect for revive (extra visual flair)
        if (isReviveSpawn && playerSpawnProgress > 0.3) {
            const wingAlpha = Math.min((playerSpawnProgress - 0.3) * 1.5, 1) * beamAlpha;
            CTX.strokeStyle = `rgba(251, 191, 36, ${wingAlpha * 0.5})`;
            CTX.lineWidth = 2;
            
            // Left wing
            CTX.beginPath();
            CTX.moveTo(player.x - 10, player.y - 10);
            CTX.quadraticCurveTo(player.x - 60, player.y - 50, player.x - 80, player.y - 20);
            CTX.stroke();
            
            // Right wing
            CTX.beginPath();
            CTX.moveTo(player.x + 10, player.y - 10);
            CTX.quadraticCurveTo(player.x + 60, player.y - 50, player.x + 80, player.y - 20);
            CTX.stroke();
        }
        
        // Clear isReviving flag when spawn animation completes
        if (playerSpawnProgress >= 0.99) {
            player.isReviving = false;
        }
        
        CTX.restore();
    }
    if (turboActive) drawTurboAfterburner(player);
    
    // Lifesteal aura effect when active
    if (player.lifestealTime && player.lifestealTime > 0) {
        const lifestealProgress = player.lifestealTime / 600; // 600 = max duration
        const pulsePhase = Math.sin(frame * 0.15) * 0.3;
        const auraRadius = 35 + pulsePhase * 10;
        
        CTX.save();
        CTX.globalAlpha = 0.3 + pulsePhase * 0.15;
        
        // Create radial gradient for aura
        const auraGradient = CTX.createRadialGradient(player.x, player.y, 20, player.x, player.y, auraRadius);
        auraGradient.addColorStop(0, 'rgba(251, 113, 133, 0.6)'); // Pink center
        auraGradient.addColorStop(0.7, 'rgba(251, 113, 133, 0.3)');
        auraGradient.addColorStop(1, 'rgba(251, 113, 133, 0)');
        
        CTX.fillStyle = auraGradient;
        CTX.beginPath();
        CTX.arc(player.x, player.y, auraRadius, 0, Math.PI * 2);
        CTX.fill();
        
        // Rotating particles around player
        const particleCount = 8;
        for (let i = 0; i < particleCount; i++) {
            const angle = (frame * 0.05) + (Math.PI * 2 * i / particleCount);
            const px = player.x + Math.cos(angle) * (auraRadius - 5);
            const py = player.y + Math.sin(angle) * (auraRadius - 5);
            
            CTX.fillStyle = '#fb7185';
            CTX.beginPath();
            CTX.arc(px, py, 2, 0, Math.PI * 2);
            CTX.fill();
        }
        
        CTX.restore();
    }
    
    // Magnet aura effect when active
    if (player.magnetActive && player.magnetTime > 0) {
        const magnetProgress = player.magnetTime / 600; // 600 = max duration
        const pulsePhase = Math.sin(frame * 0.12) * 0.3;
        const magnetRadius = (player.magnetRange || 480) / 8; // Visual radius (scaled down for display)
        
        CTX.save();
        CTX.globalAlpha = 0.2 + pulsePhase * 0.1;
        
        // Create radial gradient for magnet field
        const magnetGradient = CTX.createRadialGradient(player.x, player.y, 25, player.x, player.y, magnetRadius);
        magnetGradient.addColorStop(0, 'rgba(34, 211, 238, 0.4)'); // Cyan center
        magnetGradient.addColorStop(0.7, 'rgba(34, 211, 238, 0.2)');
        magnetGradient.addColorStop(1, 'rgba(34, 211, 238, 0)');
        
        CTX.fillStyle = magnetGradient;
        CTX.beginPath();
        CTX.arc(player.x, player.y, magnetRadius, 0, Math.PI * 2);
        CTX.fill();
        
        // Rotating magnetic field lines
        CTX.strokeStyle = '#22d3ee';
        CTX.lineWidth = 2;
        CTX.globalAlpha = 0.3 + pulsePhase * 0.15;
        
        for (let i = 0; i < 6; i++) {
            const angle = (frame * 0.03) + (Math.PI * 2 * i / 6);
            const innerRadius = 30;
            const outerRadius = magnetRadius - 10;
            
            CTX.beginPath();
            CTX.moveTo(
                player.x + Math.cos(angle) * innerRadius,
                player.y + Math.sin(angle) * innerRadius
            );
            CTX.lineTo(
                player.x + Math.cos(angle) * outerRadius,
                player.y + Math.sin(angle) * outerRadius
            );
            CTX.stroke();
        }
        
        // Orbiting particles
        const particleCount = 12;
        CTX.globalAlpha = 0.6;
        for (let i = 0; i < particleCount; i++) {
            const angle = (frame * 0.04) + (Math.PI * 2 * i / particleCount);
            const radius = magnetRadius - 20;
            const px = player.x + Math.cos(angle) * radius;
            const py = player.y + Math.sin(angle) * radius;
            
            CTX.fillStyle = '#22d3ee';
            CTX.beginPath();
            CTX.arc(px, py, 3, 0, Math.PI * 2);
            CTX.fill();
        }
        
        CTX.restore();
    }
    
    // STEALTH EFFECT - Dramatic cloaking visual when invisible
    if (player.invisible && player.invisibleTime > 0) {
        const stealthProgress = player.invisibleTime / 600; // 600 = max duration
        const pulsePhase = Math.sin(frame * 0.1);
        const flickerPhase = Math.sin(frame * 0.35) * 0.3;
        
        CTX.save();
        
        // Cloaking ripple effect - expanding rings
        for (let i = 0; i < 3; i++) {
            const ringPhase = ((frame * 0.02) + i * 0.33) % 1;
            const ringRadius = 25 + ringPhase * 40;
            const ringAlpha = (1 - ringPhase) * 0.3 * stealthProgress;
            
            CTX.strokeStyle = `rgba(100, 200, 255, ${ringAlpha})`;
            CTX.lineWidth = 2 - ringPhase;
            CTX.beginPath();
            CTX.arc(player.x, player.y, ringRadius, 0, Math.PI * 2);
            CTX.stroke();
        }
        
        // Digital distortion effect - hex pattern
        CTX.globalAlpha = stealthProgress * 0.4;
        const hexRadius = 35;
        const hexCount = 8;
        for (let i = 0; i < hexCount; i++) {
            const hexAngle = (frame * 0.02) + (Math.PI * 2 / hexCount) * i;
            const hexX = player.x + Math.cos(hexAngle) * hexRadius;
            const hexY = player.y + Math.sin(hexAngle) * hexRadius;
            
            // Small hexagon shape
            CTX.strokeStyle = `rgba(150, 220, 255, ${0.5 + flickerPhase})`;
            CTX.lineWidth = 1;
            CTX.beginPath();
            for (let j = 0; j < 6; j++) {
                const a = (Math.PI * 2 / 6) * j;
                const hx = hexX + Math.cos(a) * 5;
                const hy = hexY + Math.sin(a) * 5;
                if (j === 0) CTX.moveTo(hx, hy);
                else CTX.lineTo(hx, hy);
            }
            CTX.closePath();
            CTX.stroke();
        }
        
        // Shimmer lines effect
        CTX.strokeStyle = `rgba(200, 240, 255, ${0.4 + pulsePhase * 0.2})`;
        CTX.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
            const lineAngle = (frame * 0.03) + i * 0.5;
            const startR = 20;
            const endR = 50;
            CTX.beginPath();
            CTX.moveTo(
                player.x + Math.cos(lineAngle) * startR,
                player.y + Math.sin(lineAngle) * startR
            );
            CTX.lineTo(
                player.x + Math.cos(lineAngle) * endR,
                player.y + Math.sin(lineAngle) * endR
            );
            CTX.stroke();
        }
        
        // Inner cloaking glow
        const cloakGrad = CTX.createRadialGradient(player.x, player.y, 15, player.x, player.y, 45);
        cloakGrad.addColorStop(0, `rgba(100, 180, 255, ${0.15 * stealthProgress})`);
        cloakGrad.addColorStop(0.5, `rgba(80, 160, 255, ${0.25 * stealthProgress * (0.7 + flickerPhase)})`);
        cloakGrad.addColorStop(1, 'rgba(60, 140, 255, 0)');
        CTX.fillStyle = cloakGrad;
        CTX.beginPath();
        CTX.arc(player.x, player.y, 45, 0, Math.PI * 2);
        CTX.fill();
        
        CTX.restore();
    }
    
    // Draw BURNING effect BEFORE player tank (same as enemy) - fire engulfing the tank
    if (player.burning && player.burning > 0) {
        CTX.save();
        CTX.translate(player.x, player.y);
        
        const burnProgress = Math.min(1, player.burning / 90);
        
        // Heat distortion aura (outer glow) - SAME AS ENEMY
        const heatRadius = 55 + Math.sin(frame * 0.15) * 8;
        const heatGradient = CTX.createRadialGradient(0, 0, 25, 0, 0, heatRadius);
        heatGradient.addColorStop(0, `rgba(255, 69, 0, ${0.15 * burnProgress})`);
        heatGradient.addColorStop(0.4, `rgba(255, 140, 0, ${0.25 * burnProgress})`);
        heatGradient.addColorStop(0.7, `rgba(255, 69, 0, ${0.1 * burnProgress})`);
        heatGradient.addColorStop(1, 'rgba(255, 69, 0, 0)');
        CTX.fillStyle = heatGradient;
        CTX.beginPath();
        CTX.arc(0, 0, heatRadius, 0, Math.PI * 2);
        CTX.fill();
        
        // Rising flame tongues around the tank - SAME AS ENEMY
        for (let i = 0; i < 12; i++) {
            const flameAngle = (Math.PI * 2 / 12) * i + Math.sin(frame * 0.1) * 0.2;
            const flameBaseX = Math.cos(flameAngle) * 28;
            const flameBaseY = Math.sin(flameAngle) * 28;
            const flameHeight = 20 + Math.sin(frame * 0.2 + i * 0.8) * 10;
            const flameWidth = 8 + Math.sin(frame * 0.15 + i) * 3;
            
            CTX.save();
            CTX.translate(flameBaseX, flameBaseY);
            CTX.rotate(flameAngle - Math.PI / 2);
            
            const flameGrad = CTX.createLinearGradient(0, 0, 0, -flameHeight);
            flameGrad.addColorStop(0, `rgba(255, 69, 0, ${0.9 * burnProgress})`);
            flameGrad.addColorStop(0.3, `rgba(255, 140, 0, ${0.8 * burnProgress})`);
            flameGrad.addColorStop(0.6, `rgba(255, 200, 0, ${0.6 * burnProgress})`);
            flameGrad.addColorStop(1, 'rgba(255, 255, 200, 0)');
            
            CTX.fillStyle = flameGrad;
            CTX.beginPath();
            CTX.moveTo(-flameWidth / 2, 0);
            CTX.quadraticCurveTo(-flameWidth / 4, -flameHeight * 0.5, 0, -flameHeight);
            CTX.quadraticCurveTo(flameWidth / 4, -flameHeight * 0.5, flameWidth / 2, 0);
            CTX.closePath();
            CTX.fill();
            
            CTX.restore();
        }
        
        // Central fire core on tank body - SAME AS ENEMY
        for (let i = 0; i < 5; i++) {
            const coreX = (Math.random() - 0.5) * 30;
            const coreY = (Math.random() - 0.5) * 25;
            const coreSize = 12 + Math.sin(frame * 0.25 + i * 1.5) * 5;
            
            const coreGrad = CTX.createRadialGradient(coreX, coreY, 0, coreX, coreY, coreSize);
            coreGrad.addColorStop(0, `rgba(255, 255, 200, ${0.7 * burnProgress})`);
            coreGrad.addColorStop(0.3, `rgba(255, 200, 0, ${0.5 * burnProgress})`);
            coreGrad.addColorStop(0.6, `rgba(255, 100, 0, ${0.3 * burnProgress})`);
            coreGrad.addColorStop(1, 'rgba(255, 50, 0, 0)');
            
            CTX.fillStyle = coreGrad;
            CTX.beginPath();
            CTX.arc(coreX, coreY, coreSize, 0, Math.PI * 2);
            CTX.fill();
        }
        
        // Animated embers/sparks flying upward - SAME AS ENEMY with ember glow
        for (let i = 0; i < 8; i++) {
            const emberPhase = (frame * 0.08 + i * 0.7) % 1;
            const emberX = Math.sin(frame * 0.05 + i * 2) * (15 + i * 3);
            const emberY = -20 - emberPhase * 50;
            const emberSize = (1 - emberPhase) * (3 + Math.random() * 2);
            
            CTX.globalAlpha = burnProgress * (1 - emberPhase) * 0.9;
            CTX.fillStyle = Math.random() > 0.5 ? '#ffcc00' : '#ff6600';
            CTX.beginPath();
            CTX.arc(emberX, emberY, emberSize, 0, Math.PI * 2);
            CTX.fill();
            
            // Ember glow - SAME AS ENEMY
            CTX.globalAlpha = burnProgress * (1 - emberPhase) * 0.4;
            CTX.fillStyle = '#ff9900';
            CTX.beginPath();
            CTX.arc(emberX, emberY, emberSize * 2, 0, Math.PI * 2);
            CTX.fill();
        }
        
        // Smoke wisps rising - SAME AS ENEMY
        CTX.globalAlpha = burnProgress * 0.4;
        for (let i = 0; i < 4; i++) {
            const smokePhase = (frame * 0.03 + i * 0.5) % 1;
            const smokeX = Math.sin(frame * 0.02 + i * 1.5) * 20;
            const smokeY = -30 - smokePhase * 70;
            const smokeSize = 8 + smokePhase * 15;
            
            const smokeGrad = CTX.createRadialGradient(smokeX, smokeY, 0, smokeX, smokeY, smokeSize);
            smokeGrad.addColorStop(0, `rgba(80, 80, 80, ${0.3 * (1 - smokePhase)})`);
            smokeGrad.addColorStop(1, 'rgba(60, 60, 60, 0)');
            
            CTX.fillStyle = smokeGrad;
            CTX.beginPath();
            CTX.arc(smokeX, smokeY, smokeSize, 0, Math.PI * 2);
            CTX.fill();
        }
        
        CTX.globalAlpha = 1;
        CTX.restore();
    }
    
    // =========================================================================
    // PLAYER CLONES - Draw ally tanks spawned from CLONE ultimate (ENHANCED)
    // =========================================================================
    if (typeof playerClones !== 'undefined' && playerClones.length > 0) {
        for (const clone of playerClones) {
            if (!clone || clone.hp <= 0) continue;
            
            // Skip if outside view
            if (clone.x < camX - 100 || clone.x > camX + CANVAS.width + 100 ||
                clone.y < camY - 100 || clone.y > camY + CANVAS.height + 100) continue;
            
            // Spawn animation - dramatic teleport effect matching warmup duration
            const cloneSpawnMax = clone.spawnAnimationMax || SPAWN_WARMUP_FRAMES;
            let scale = 1;
            if (clone.spawnAnimation > 0) {
                scale = 1 - (clone.spawnAnimation / cloneSpawnMax);
                
                // SPAWN TELEPORT EFFECT - top-down beam
                CTX.save();
                const spawnProgress = 1 - (clone.spawnAnimation / cloneSpawnMax);
                const beamAlpha = (1 - spawnProgress) * 0.8;
                
                // Vertical teleport beam from sky
                const beamGrad = CTX.createLinearGradient(clone.x, clone.y - 200, clone.x, clone.y + 20);
                beamGrad.addColorStop(0, 'rgba(134, 239, 172, 0)');
                beamGrad.addColorStop(0.3, `rgba(134, 239, 172, ${beamAlpha * 0.5})`);
                beamGrad.addColorStop(0.8, `rgba(255, 255, 255, ${beamAlpha})`);
                beamGrad.addColorStop(1, `rgba(134, 239, 172, ${beamAlpha * 0.3})`);
                
                CTX.fillStyle = beamGrad;
                CTX.fillRect(clone.x - 25, clone.y - 200, 50, 220);
                
                // Ground impact ring - expanding circle
                const ringRadius = 30 + spawnProgress * 50;
                CTX.strokeStyle = `rgba(134, 239, 172, ${(1 - spawnProgress) * 0.7})`;
                CTX.lineWidth = 4 * (1 - spawnProgress);
                CTX.beginPath();
                CTX.arc(clone.x, clone.y, ringRadius, 0, Math.PI * 2);
                CTX.stroke();
                
                // Inner bright ring
                CTX.strokeStyle = `rgba(255, 255, 255, ${(1 - spawnProgress) * 0.9})`;
                CTX.lineWidth = 2;
                CTX.beginPath();
                CTX.arc(clone.x, clone.y, ringRadius * 0.6, 0, Math.PI * 2);
                CTX.stroke();
                
                // Electric sparks around spawn point
                for (let i = 0; i < 6; i++) {
                    const sparkAngle = (Math.PI * 2 / 6) * i + frame * 0.2;
                    const sparkDist = 25 + Math.sin(frame * 0.3 + i) * 10;
                    const sparkX = clone.x + Math.cos(sparkAngle) * sparkDist;
                    const sparkY = clone.y + Math.sin(sparkAngle) * sparkDist;
                    
                    CTX.fillStyle = `rgba(255, 255, 255, ${beamAlpha})`;
                    CTX.beginPath();
                    CTX.arc(sparkX, sparkY, 3, 0, Math.PI * 2);
                    CTX.fill();
                }
                
                // Portal effect above
                CTX.strokeStyle = `rgba(134, 239, 172, ${beamAlpha * 0.7})`;
                CTX.lineWidth = 3;
                CTX.beginPath();
                CTX.ellipse(clone.x, clone.y - 150, 30 + Math.sin(frame * 0.4) * 5, 12, 0, 0, Math.PI * 2);
                CTX.stroke();
                
                CTX.restore();
            }
            
            // Clones are permanent - no despawn animation needed
            // Smooth opacity animation during spawn matching warmup duration
            let alpha = 1;
            if (clone.spawnAnimation > 0) {
                const spawnProgress = 1 - (clone.spawnAnimation / cloneSpawnMax);
                // Smooth easeInOutCubic curve for natural fade-in
                alpha = spawnProgress < 0.5 
                    ? 4 * spawnProgress * spawnProgress * spawnProgress 
                    : 1 - Math.pow(-2 * spawnProgress + 2, 3) / 2;
            }
            
            CTX.save();
            CTX.globalAlpha = alpha;
            CTX.translate(clone.x, clone.y);
            CTX.scale(scale, scale);
            CTX.translate(-clone.x, -clone.y);
            
            // Cyan energy aura around active clones (permanent gentle glow)
            if (clone.spawnAnimation <= 0) {
                const auraGrad = CTX.createRadialGradient(clone.x, clone.y, 20, clone.x, clone.y, 45);
                const auraPulse = 0.15 + Math.sin(frame * 0.1) * 0.05;
                auraGrad.addColorStop(0, `rgba(34, 211, 238, ${auraPulse})`); // Bright cyan
                auraGrad.addColorStop(0.7, `rgba(6, 182, 212, ${auraPulse * 0.5})`); // Darker cyan
                auraGrad.addColorStop(1, 'rgba(34, 211, 238, 0)');
                CTX.fillStyle = auraGrad;
                CTX.beginPath();
                CTX.arc(clone.x, clone.y, 45, 0, Math.PI * 2);
                CTX.fill();
            }
            
            // Draw clone with bright cyan body color (distinct from player/enemy)
            const cloneBodyColor = clone.color || '#22d3ee';
            const cloneWeaponColor = WEAPONS[clone.weapon]?.color || '#22d3ee';
            drawTank(
                clone.x, clone.y, 
                clone.angle, clone.turretAngle, 
                cloneBodyColor,              // Body color (white when blinking)
                cloneWeaponColor,            // Weapon color turret
                false,                       // Not player
                clone.recoil || 0,           // Recoil animation
                clone.hp / clone.maxHp,      // HP ratio
                clone.hitFlash || 0,         // Hit flash
                clone.seed || clone.x * 0.01, // Seed for crack patterns
                clone.turretRecoilOffsetX || 0, // Turret recoil X
                clone.turretRecoilOffsetY || 0, // Turret recoil Y
                null,                        // No hit positions
                clone.weapon,                // Weapon type for proper turret shape
                clone.wheelRotation || 0,    // Wheel rotation animation
                clone.shieldTime || 0,       // Shield time for unified shield effect
                clone.armor || 0,            // Armor amount for unified armor effect
                'clone'                      // Tank type for proper color scheme
            );
            
            // === UNIFIED CLONE STATUS PANEL ===
            // Use unified status panel system for consistent HP + status bar display
            // Get screen coordinates from drawTank (stored in CTX._lastTankScreenX/Y)
            const cloneScreenX = CTX._lastTankScreenX || clone.x;
            const cloneScreenY = CTX._lastTankScreenY || clone.y;
            
            // Draw unified status panel with HP and all status effects
            CTX.save();
            if (CTX.resetTransform) {
                CTX.resetTransform();
            } else {
                CTX.setTransform(1, 0, 0, 1, 0, 0);
            }
            drawUnifiedStatusPanel(cloneScreenX, cloneScreenY, clone, 'clone', frame);
            CTX.restore();
            
            CTX.restore();
        }
    }
    
    // =========================================================================
    // SHOCKWAVE EFFECT - Expanding ring from SHOCKWAVE ultimate (ENHANCED)
    // FIXED: Visual now persists during entire DOT duration, not just expansion
    // =========================================================================
    const shockwaveVisualActive = player.shockwaveActive || (player.shockwaveDOT && player.shockwaveDOT.duration > 0);
    if (shockwaveVisualActive) {
        CTX.save();
        
        // Calculate visual state based on whether expanding or holding at max
        const isExpanding = player.shockwaveActive && player.shockwaveRadius < player.shockwaveMaxRadius;
        const currentRadius = isExpanding ? player.shockwaveRadius : (player.shockwaveMaxRadius || 400);
        const maxRadius = player.shockwaveMaxRadius || 400;
        
        // During expansion: progress 0->1, during DOT hold: stay at 1
        const expansionProgress = Math.min(1, currentRadius / maxRadius);
        
        // Alpha based on DOT remaining duration (fade out as DOT ends)
        const dotDuration = player.shockwaveDOT ? player.shockwaveDOT.duration : 0;
        const maxDotDuration = 180; // 3 seconds from config
        const dotProgress = dotDuration / maxDotDuration;
        
        // Alpha: during expansion use expansion progress, during DOT hold use DOT remaining
        const alpha = isExpanding ? (1 - expansionProgress * 0.5) : (dotProgress * 0.6);
        const pulseIntensity = 1 + Math.sin(frame * 0.4) * 0.2;
        
        // OUTER GLOW RING - dramatic blue glow
        // FIXED: Ensure inner radius is never negative
        const innerGlowRadius = Math.max(0, currentRadius - 30);
        const outerGlowRadius = currentRadius + 40;
        const outerGrad = CTX.createRadialGradient(
            player.x, player.y, innerGlowRadius,
            player.x, player.y, outerGlowRadius
        );
        outerGrad.addColorStop(0, `rgba(59, 130, 246, 0)`);
        outerGrad.addColorStop(0.4, `rgba(59, 130, 246, ${alpha * 0.5})`);
        outerGrad.addColorStop(0.6, `rgba(147, 197, 253, ${alpha * 0.8})`);
        outerGrad.addColorStop(1, `rgba(59, 130, 246, 0)`);
        CTX.fillStyle = outerGrad;
        CTX.beginPath();
        CTX.arc(player.x, player.y, outerGlowRadius, 0, Math.PI * 2);
        CTX.arc(player.x, player.y, innerGlowRadius, 0, Math.PI * 2, true);
        CTX.fill();
        
        // Main shockwave ring - thicker and more visible (pulses during DOT)
        const ringPulse = isExpanding ? 1 : (0.7 + Math.sin(frame * 0.3) * 0.3);
        CTX.strokeStyle = `rgba(59, 130, 246, ${alpha * 0.9 * ringPulse})`;
        CTX.lineWidth = 20 * (1 - expansionProgress * 0.4) * pulseIntensity;
        CTX.shadowColor = '#3b82f6';
        CTX.shadowBlur = 30;
        CTX.beginPath();
        CTX.arc(player.x, player.y, currentRadius, 0, Math.PI * 2);
        CTX.stroke();
        
        // Inner white core ring
        const innerRingRadius = Math.max(0, currentRadius - 5);
        CTX.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.7})`;
        CTX.lineWidth = 4;
        CTX.shadowBlur = 15;
        CTX.shadowColor = '#ffffff';
        CTX.beginPath();
        CTX.arc(player.x, player.y, innerRingRadius, 0, Math.PI * 2);
        CTX.stroke();
        
        // Inner electric ring - dashed lightning effect (animated during DOT)
        CTX.strokeStyle = `rgba(147, 197, 253, ${alpha * 0.8})`;
        CTX.lineWidth = 8;
        CTX.setLineDash([15, 25]);
        CTX.lineDashOffset = -frame * 5; // Animated dash rotation
        CTX.shadowBlur = 20;
        CTX.beginPath();
        CTX.arc(player.x, player.y, currentRadius * 0.75, 0, Math.PI * 2);
        CTX.stroke();
        CTX.setLineDash([]);
        
        // Ground crack effect - dramatic lightning bolts (only during expansion or early DOT)
        if (isExpanding || dotProgress > 0.5) {
            for (let i = 0; i < 16; i++) {
                const angle = (Math.PI * 2 / 16) * i;
                const crackLength = currentRadius * 0.95;
                
                CTX.beginPath();
                CTX.moveTo(player.x, player.y);
                
                // Jagged lightning bolt pattern
                let cx = player.x;
                let cy = player.y;
                const segments = 6;
                for (let s = 1; s <= segments; s++) {
                    const segDist = (crackLength / segments) * s;
                    const jitterAmount = isExpanding ? (1 - expansionProgress) : dotProgress;
                    const jitter = (Math.random() - 0.5) * 20 * jitterAmount;
                    const perpAngle = angle + Math.PI / 2;
                    cx = player.x + Math.cos(angle) * segDist + Math.cos(perpAngle) * jitter;
                    cy = player.y + Math.sin(angle) * segDist + Math.sin(perpAngle) * jitter;
                    CTX.lineTo(cx, cy);
                }
                
                const crackAlpha = isExpanding ? (1 - expansionProgress) : dotProgress;
                CTX.lineWidth = 4 * crackAlpha;
                CTX.strokeStyle = `rgba(59, 130, 246, ${alpha * 0.7})`;
                CTX.shadowBlur = 10;
                CTX.shadowColor = '#60a5fa';
                CTX.stroke();
            }
        }
        
        // Center burst effect (more prominent during DOT hold)
        const centerSize = isExpanding ? 80 * (1 - expansionProgress) : 60 * (0.5 + dotProgress * 0.5);
        if (centerSize > 0) {
            const centerGrad = CTX.createRadialGradient(player.x, player.y, 0, player.x, player.y, centerSize);
            centerGrad.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.6})`);
            centerGrad.addColorStop(0.5, `rgba(147, 197, 253, ${alpha * 0.3})`);
            centerGrad.addColorStop(1, `rgba(59, 130, 246, 0)`);
            CTX.fillStyle = centerGrad;
            CTX.beginPath();
            CTX.arc(player.x, player.y, centerSize, 0, Math.PI * 2);
            CTX.fill();
        }
        
        CTX.shadowBlur = 0;
        CTX.restore();
    }
    
    // =========================================================================
    // BERSERKER AURA - Fire effect around player during BERSERKER ultimate (ENHANCED)
    // =========================================================================
    if (player.berserkerActive && player.berserkerTime > 0) {
        CTX.save();
        
        const pulsePhase = Math.sin(frame * 0.2) * 0.3 + 0.7;
        const rapidPulse = Math.sin(frame * 0.5) * 0.5 + 0.5;
        const timeRatio = player.berserkerTime / (PLAYER_ULTIMATES?.BERSERKER?.duration || 600);
        
        // Dramatic outer fire ring - multiple layers
        for (let ring = 0; ring < 3; ring++) {
            const ringRadius = 70 + ring * 20;
            const ringAlpha = (0.3 - ring * 0.08) * pulsePhase * timeRatio;
            const fireGrad = CTX.createRadialGradient(
                player.x, player.y, ringRadius - 15, 
                player.x, player.y, ringRadius + 15
            );
            fireGrad.addColorStop(0, `rgba(239, 68, 68, 0)`);
            fireGrad.addColorStop(0.5, `rgba(249, 115, 22, ${ringAlpha})`);
            fireGrad.addColorStop(1, `rgba(239, 68, 68, 0)`);
            CTX.fillStyle = fireGrad;
            CTX.beginPath();
            CTX.arc(player.x, player.y, ringRadius + 15, 0, Math.PI * 2);
            CTX.fill();
        }
        
        // Inner fire aura glow - more intense
        const fireGrad = CTX.createRadialGradient(player.x, player.y, 15, player.x, player.y, 65);
        fireGrad.addColorStop(0, `rgba(255, 200, 100, ${0.5 * pulsePhase})`);
        fireGrad.addColorStop(0.3, `rgba(239, 68, 68, ${0.4 * pulsePhase})`);
        fireGrad.addColorStop(0.7, `rgba(249, 115, 22, ${0.25 * pulsePhase})`);
        fireGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
        CTX.fillStyle = fireGrad;
        CTX.beginPath();
        CTX.arc(player.x, player.y, 65, 0, Math.PI * 2);
        CTX.fill();
        
        // Flame tendrils - animated fire wisps
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 / 8) * i + frame * 0.03;
            const flickerHeight = 25 + Math.sin(frame * 0.15 + i * 1.5) * 15;
            const baseX = player.x + Math.cos(angle) * 35;
            const baseY = player.y + Math.sin(angle) * 35;
            const tipX = player.x + Math.cos(angle) * (35 + flickerHeight);
            const tipY = player.y + Math.sin(angle) * (35 + flickerHeight) - flickerHeight * 0.3;
            
            const flameGrad = CTX.createLinearGradient(baseX, baseY, tipX, tipY);
            flameGrad.addColorStop(0, `rgba(255, 200, 100, ${0.6 * timeRatio})`);
            flameGrad.addColorStop(0.5, `rgba(249, 115, 22, ${0.4 * timeRatio})`);
            flameGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
            
            CTX.strokeStyle = flameGrad;
            CTX.lineWidth = 6;
            CTX.lineCap = 'round';
            CTX.beginPath();
            CTX.moveTo(baseX, baseY);
            // Curved flame path
            const midX = (baseX + tipX) / 2 + Math.sin(frame * 0.2 + i) * 8;
            const midY = (baseY + tipY) / 2;
            CTX.quadraticCurveTo(midX, midY, tipX, tipY);
            CTX.stroke();
        }
        
        // Screen edge vignette during berserker (red tint at corners)
        const vignetteSizeX = CANVAS.width * 0.15;
        const vignetteSizeY = CANVAS.height * 0.15;
        const vignetteAlpha = 0.15 * rapidPulse * timeRatio;
        
        // Corner vignettes
        [[0, 0], [CANVAS.width, 0], [0, CANVAS.height], [CANVAS.width, CANVAS.height]].forEach(([cx, cy]) => {
            const vignetteGrad = CTX.createRadialGradient(cx, cy, 0, cx, cy, Math.max(vignetteSizeX, vignetteSizeY) * 1.5);
            vignetteGrad.addColorStop(0, `rgba(200, 0, 0, ${vignetteAlpha})`);
            vignetteGrad.addColorStop(1, 'rgba(200, 0, 0, 0)');
            CTX.fillStyle = vignetteGrad;
            CTX.fillRect(0, 0, CANVAS.width, CANVAS.height);
        });
        
        // Rage indicator is now shown as status bar via drawPlayerStatusBars
        // No floating text needed - avoids collision with bars
        
        CTX.restore();
    }
    
    // Turret: bright weapon color (same variable as enemy)
    const playerTurretColor = WEAPONS[player.weapon].color;
    
    // === CURSED BURNED - Ground effect (rotating ring) BELOW tank ===
    // This renders the rotating dark flame ring UNDER the tank for depth
    if (player.cursedBurned) {
        CTX.save();
        CTX.translate(player.x, player.y);
        
        // Dark ominous aura on ground
        const curseAura = CTX.createRadialGradient(0, 0, 15, 0, 0, 55);
        curseAura.addColorStop(0, 'rgba(139, 0, 255, 0.2)');
        curseAura.addColorStop(0.5, 'rgba(75, 0, 130, 0.15)');
        curseAura.addColorStop(1, 'rgba(0, 0, 0, 0)');
        CTX.fillStyle = curseAura;
        CTX.beginPath();
        CTX.arc(0, 0, 55, 0, Math.PI * 2);
        CTX.fill();
        
        // Rotating dark flame ring - NOW UNDER THE TANK
        CTX.save();
        CTX.rotate(frame * 0.05);
        for (let i = 0; i < 8; i++) {
            const flameAngle = (Math.PI * 2 / 8) * i;
            const flameHeight = 18 + Math.sin(frame * 0.2 + i) * 10;
            
            CTX.save();
            CTX.rotate(flameAngle);
            CTX.translate(35, 0); // Larger radius to be visible around tank
            
            const flameGrad = CTX.createLinearGradient(0, 0, flameHeight, 0);
            flameGrad.addColorStop(0, 'rgba(139, 0, 255, 0.5)');
            flameGrad.addColorStop(0.6, 'rgba(75, 0, 130, 0.3)');
            flameGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            
            CTX.fillStyle = flameGrad;
            CTX.beginPath();
            CTX.moveTo(0, -5);
            CTX.quadraticCurveTo(flameHeight * 0.5, -3, flameHeight, 0);
            CTX.quadraticCurveTo(flameHeight * 0.5, 3, 0, 5);
            CTX.closePath();
            CTX.fill();
            
            CTX.restore();
        }
        CTX.restore();
        
        CTX.restore();
    }
    
    // ===================== VICTORY TELEPORT ANIMATION =====================
    // Dramatic teleport out effect when boss is defeated
    // Animation is frame-based to ensure completion before victory screen
    if (player.victoryTeleporting) {
        if (player.victoryTeleportPhase === undefined) player.victoryTeleportPhase = 0;
        // Phase increment: 0.007/frame at 60fps = ~2.4 seconds for phase 0->1
        // Tank disappears at phase 0.66 = ~1.6 seconds into animation
        player.victoryTeleportPhase += 0.007;
        
        const phase = Math.min(1, player.victoryTeleportPhase);
        
        // Screen shake and shockwave when tank disappears (at phase 0.66)
        if (player.victoryTeleportPhase >= 0.66 && !player.victoryTeleportFlashDone) {
            player.victoryTeleportFlashDone = true;
            screenShake = 15;
            if (typeof particles !== 'undefined') {
                particles.push({ 
                    x: player.x, 
                    y: player.y, 
                    size: 100, 
                    life: 25, 
                    color: 'rgba(255, 215, 0, 0.6)', 
                    type: 'wave' 
                });
            }
        }
        
        // Trigger victory screen when animation is fully complete (phase >= 1)
        // Plus a small delay (60 frames = 1 second) after tank fully disappears
        if (player.victoryTeleportPhase >= 1 && !player.victoryTeleportComplete) {
            player.victoryTeleportComplete = true;
            player.victoryDelayFrames = 60; // 1 second delay after animation complete
        }
        
        // Count down delay frames and show victory screen
        if (player.victoryTeleportComplete && player.victoryDelayFrames > 0) {
            player.victoryDelayFrames--;
            if (player.victoryDelayFrames <= 0) {
                player.victoryTeleporting = false;
                if (typeof showVictoryScreen === 'function') {
                    showVictoryScreen();
                }
            }
        }
        
        CTX.save();
        
        // Golden/white beam from above
        const beamAlpha = phase * 0.8;
        const beamWidth = 60 + phase * 40;
        
        const beamGrad = CTX.createLinearGradient(player.x, player.y - 400, player.x, player.y + 30);
        beamGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
        beamGrad.addColorStop(0.2, `rgba(255, 255, 255, ${beamAlpha * 0.3})`);
        beamGrad.addColorStop(0.6, `rgba(255, 215, 0, ${beamAlpha})`);
        beamGrad.addColorStop(0.9, `rgba(255, 255, 255, ${beamAlpha})`);
        beamGrad.addColorStop(1, `rgba(34, 197, 94, ${beamAlpha * 0.5})`);
        
        CTX.fillStyle = beamGrad;
        CTX.fillRect(player.x - beamWidth/2, player.y - 400, beamWidth, 430);
        
        // Expanding rings at base
        for (let r = 0; r < 3; r++) {
            const ringPhase = (frame * 0.05 + r * 0.3) % 1;
            const ringRadius = 30 + ringPhase * 100;
            const ringAlpha = (1 - ringPhase) * beamAlpha;
            
            CTX.strokeStyle = `rgba(255, 215, 0, ${ringAlpha})`;
            CTX.lineWidth = 3 * (1 - ringPhase);
            CTX.beginPath();
            CTX.arc(player.x, player.y, ringRadius, 0, Math.PI * 2);
            CTX.stroke();
        }
        
        // Inner glow around player
        const glowRadius = 50 + Math.sin(frame * 0.2) * 10;
        const glowGrad = CTX.createRadialGradient(player.x, player.y, 20, player.x, player.y, glowRadius);
        glowGrad.addColorStop(0, `rgba(255, 255, 255, ${beamAlpha * 0.5})`);
        glowGrad.addColorStop(0.5, `rgba(255, 215, 0, ${beamAlpha * 0.3})`);
        glowGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
        CTX.fillStyle = glowGrad;
        CTX.beginPath();
        CTX.arc(player.x, player.y, glowRadius, 0, Math.PI * 2);
        CTX.fill();
        
        // Vertical sparks
        for (let i = 0; i < 8; i++) {
            const sparkX = player.x + (Math.random() - 0.5) * beamWidth * 0.8;
            const sparkY = player.y - Math.random() * 300;
            const sparkSize = 2 + Math.random() * 3;
            CTX.fillStyle = `rgba(255, 255, 255, ${0.5 + Math.random() * 0.5})`;
            CTX.beginPath();
            CTX.arc(sparkX, sparkY, sparkSize, 0, Math.PI * 2);
            CTX.fill();
        }
        
        CTX.restore();
        
        // Fade out tank as teleport progresses
        CTX.save();
        CTX.globalAlpha = Math.max(0, 1 - phase * 1.5);
    }
    
    // Smooth opacity animation during spawn - player tank fades in as teleport effect fades out
    let playerSpawnOpacity = 1;
    if (player.spawnWarmup > 0) {
        const spawnProgress = 1 - (player.spawnWarmup / (player.spawnWarmupMax || SPAWN_WARMUP_FRAMES));
        // Smooth easeInOutCubic curve for natural fade-in
        playerSpawnOpacity = spawnProgress < 0.5 
            ? 4 * spawnProgress * spawnProgress * spawnProgress 
            : 1 - Math.pow(-2 * spawnProgress + 2, 3) / 2;
    }
    
    // Apply stealth transparency to player tank
    if (player.invisible && player.invisibleTime > 0) {
        const stealthAlpha = 0.25 + Math.sin(frame * 0.15) * 0.1; // Flickering semi-transparent
        CTX.save();
        CTX.globalAlpha = stealthAlpha * playerSpawnOpacity;
    } else if (player.spawnWarmup > 0) {
        CTX.save();
        CTX.globalAlpha = playerSpawnOpacity;
    }
    
    // Skip drawing tank if fully teleported out OR dying (demo death sequence)
    if (player.isDying) {
        // Player is in death animation - don't draw tank
        if (player.invisible && player.invisibleTime > 0) CTX.restore();
        if (player.spawnWarmup > 0 && !(player.invisible && player.invisibleTime > 0)) CTX.restore();
        if (player.victoryTeleporting) CTX.restore();
    } else if (player.victoryTeleporting && player.victoryTeleportPhase >= 0.66) {
        // Tank has teleported out - don't draw
        if (player.invisible && player.invisibleTime > 0) CTX.restore();
        if (player.spawnWarmup > 0 && !(player.invisible && player.invisibleTime > 0)) CTX.restore();
        if (player.victoryTeleporting) CTX.restore();
    } else {
        drawTank(player.x, player.y, player.angle, player.turretAngle, '#15803d', playerTurretColor, true, player.recoil, player.hp / player.maxHp, 0, player.seed || 0.5, player.turretRecoilOffsetX, player.turretRecoilOffsetY, { hitX: player.lastHitX, hitY: player.lastHitY }, player.weapon, player.wheelRotation || 0);
        
        // Restore spawn opacity context
        if (player.spawnWarmup > 0 && !(player.invisible && player.invisibleTime > 0)) CTX.restore();
        
        if (player.victoryTeleporting) CTX.restore();
    }
    
    // =========================================================================
    // PLAYER STATUS EFFECTS - Visual effects EXACTLY matching enemy status effects
    // =========================================================================
    
    // Draw char marks and heat shimmer overlay AFTER tank is drawn (same as enemy)
    if (player.burning && player.burning > 0) {
        CTX.save();
        CTX.translate(player.x, player.y);
        CTX.rotate(player.angle);
        
        const burnProgress = Math.min(1, player.burning / 90);
        
        // Heat shimmer/distortion overlay on tank body
        CTX.globalAlpha = 0.25 * burnProgress;
        CTX.fillStyle = '#ff4500';
        CTX.beginPath();
        CTX.roundRect(-24, -18, 48, 36, 4);
        CTX.fill();
        
        // Char/scorch marks on tank
        CTX.globalAlpha = 0.4 * burnProgress;
        CTX.fillStyle = '#333';
        for (let i = 0; i < 3; i++) {
            const charX = -10 + i * 10 + Math.sin(i * 2) * 5;
            const charY = -5 + Math.cos(i * 3) * 8;
            CTX.beginPath();
            CTX.ellipse(charX, charY, 6 + Math.random() * 4, 4 + Math.random() * 3, Math.random() * Math.PI, 0, Math.PI * 2);
            CTX.fill();
        }
        
        // Glowing hot spots on tank
        CTX.globalAlpha = 0.6 * burnProgress * (0.7 + Math.sin(frame * 0.2) * 0.3);
        for (let i = 0; i < 4; i++) {
            const hotX = -15 + i * 10;
            const hotY = -8 + (i % 2) * 10;
            const hotGrad = CTX.createRadialGradient(hotX, hotY, 0, hotX, hotY, 8);
            hotGrad.addColorStop(0, 'rgba(255, 200, 100, 0.8)');
            hotGrad.addColorStop(0.5, 'rgba(255, 100, 0, 0.4)');
            hotGrad.addColorStop(1, 'rgba(255, 50, 0, 0)');
            CTX.fillStyle = hotGrad;
            CTX.beginPath();
            CTX.arc(hotX, hotY, 8, 0, Math.PI * 2);
            CTX.fill();
        }
        
        CTX.globalAlpha = 1;
        CTX.restore();
    }
    
    // === CURSED BURNED - Eternal dark flame effect from boss touch ===
    if (player.cursedBurned) {
        CTX.save();
        CTX.translate(player.x, player.y);
        
        const pulse = 0.6 + Math.sin(frame * 0.15) * 0.4;
        
        // Initialize curse entrance animation if first time
        if (!player.cursedBurnedEntrance) {
            player.cursedBurnedEntrance = 60; // 1 second entrance animation
        }
        
        // Entrance animation - dramatic emergence
        if (player.cursedBurnedEntrance > 0) {
            player.cursedBurnedEntrance--;
            const entranceProgress = 1 - (player.cursedBurnedEntrance / 60);
            
            // Dark portal opening effect
            const portalSize = 80 * entranceProgress;
            const portalGrad = CTX.createRadialGradient(0, 0, 0, 0, 0, portalSize);
            portalGrad.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
            portalGrad.addColorStop(0.5, 'rgba(75, 0, 130, 0.5)');
            portalGrad.addColorStop(0.8, 'rgba(139, 0, 255, 0.3)');
            portalGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            CTX.fillStyle = portalGrad;
            CTX.beginPath();
            CTX.arc(0, 0, portalSize, 0, Math.PI * 2);
            CTX.fill();
            
            // Lightning bolts from portal
            if (player.cursedBurnedEntrance > 30) {
                for (let i = 0; i < 6; i++) {
                    const boltAngle = (Math.PI * 2 / 6) * i + frame * 0.1;
                    const boltLength = 50 * entranceProgress;
                    
                    CTX.strokeStyle = 'rgba(139, 0, 255, 0.8)';
                    CTX.lineWidth = 2;
                    CTX.beginPath();
                    CTX.moveTo(0, 0);
                    
                    let prevX = 0, prevY = 0;
                    for (let s = 1; s <= 3; s++) {
                        const t = s / 3;
                        const baseX = Math.cos(boltAngle) * boltLength * t;
                        const baseY = Math.sin(boltAngle) * boltLength * t;
                        const zigzag = (s < 3) ? (Math.random() - 0.5) * 20 : 0;
                        const perpAngle = boltAngle + Math.PI / 2;
                        const px = baseX + Math.cos(perpAngle) * zigzag;
                        const py = baseY + Math.sin(perpAngle) * zigzag;
                        CTX.lineTo(px, py);
                    }
                    CTX.stroke();
                }
            }
            
            // Evil screaming face emerging (simplified)
            if (player.cursedBurnedEntrance > 20 && player.cursedBurnedEntrance < 50) {
                CTX.globalAlpha = (1 - Math.abs(35 - player.cursedBurnedEntrance) / 15) * 0.7;
                CTX.font = 'bold 40px Arial';
                CTX.textAlign = 'center';
                CTX.textBaseline = 'middle';
                CTX.fillStyle = '#8b00ff';
                CTX.shadowColor = '#ff00ff';
                CTX.shadowBlur = 20;
                CTX.fillText('☠', 0, -10);
                CTX.shadowBlur = 0;
            }
        }
        
        CTX.globalAlpha = 1;
        
        // Curse symbol overlay on tank (above tank effects only)
        // Reuse 'pulse' variable declared earlier in this scope
        CTX.globalAlpha = 0.6 * pulse;
        CTX.font = 'bold 16px Arial';
        CTX.textAlign = 'center';
        CTX.textBaseline = 'middle';
        CTX.fillStyle = '#8b00ff';
        CTX.shadowColor = '#4a0080';
        CTX.shadowBlur = 8;
        CTX.fillText('X', 0, -35); // Simple X mark instead of emoji
        CTX.shadowBlur = 0;
        
        // Dark dripping effect from tank
        if (frame % 10 === 0) {
            for (let i = 0; i < 2; i++) {
                const dripX = (Math.random() - 0.5) * 30;
                const dripY = 15 + Math.random() * 10;
                CTX.fillStyle = 'rgba(75, 0, 130, 0.6)';
                CTX.beginPath();
                CTX.ellipse(dripX, dripY, 3, 5, 0, 0, Math.PI * 2);
                CTX.fill();
            }
        }
        
        CTX.globalAlpha = 1;
        CTX.restore();
    }
    
    // === KNOCKBACK FLASH - White impact flash when hit by boss ===
    if (player.knockbackFlash && player.knockbackFlash > 0) {
        CTX.save();
        CTX.translate(player.x, player.y);
        
        const flashProgress = player.knockbackFlash / 15;
        const flickerOn = Math.floor(frame * 0.5) % 2 === 0;
        
        if (flickerOn) {
            // White flash overlay
            CTX.globalAlpha = 0.8 * flashProgress;
            CTX.fillStyle = '#ffffff';
            CTX.beginPath();
            CTX.arc(0, 0, 40, 0, Math.PI * 2);
            CTX.fill();
            
            // Impact glow
            const glowGrad = CTX.createRadialGradient(0, 0, 20, 0, 0, 60);
            glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
            glowGrad.addColorStop(0.5, 'rgba(255, 100, 0, 0.3)');
            glowGrad.addColorStop(1, 'rgba(255, 0, 0, 0)');
            CTX.fillStyle = glowGrad;
            CTX.beginPath();
            CTX.arc(0, 0, 60, 0, Math.PI * 2);
            CTX.fill();
        }
        
        CTX.globalAlpha = 1;
        CTX.restore();
    }
    
    // Draw ice tint overlay on top of tank when frozen (same as enemy)
    if (player.frozen && player.frozen > 0) {
        CTX.save();
        CTX.translate(player.x, player.y);
        CTX.rotate(player.angle);
        
        const freezeProgress = Math.min(1, player.frozen / 75);
        
        // Semi-transparent ice blue overlay on tank body
        CTX.globalAlpha = 0.35 * freezeProgress;
        CTX.fillStyle = '#87ceeb';
        CTX.beginPath();
        CTX.roundRect(-24, -18, 48, 36, 4);
        CTX.fill();
        
        // Frost pattern on tank surface
        CTX.globalAlpha = 0.5 * freezeProgress;
        CTX.strokeStyle = '#ffffff';
        CTX.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
            const fx = -15 + i * 10;
            const fy = -10 + (i % 2) * 8;
            CTX.beginPath();
            CTX.moveTo(fx, fy);
            CTX.lineTo(fx + 5, fy - 3);
            CTX.lineTo(fx + 3, fy + 4);
            CTX.stroke();
        }
        
        CTX.globalAlpha = 1;
        CTX.restore();
    }
    
    // Draw stun overlay on tank (same as enemy)
    if (player.stunned && player.stunned > 0) {
        CTX.save();
        CTX.translate(player.x, player.y);
        CTX.rotate(player.angle);
        
        const stunProgress = Math.min(1, player.stunned / 30);
        
        // Electric tint overlay on tank
        CTX.globalAlpha = 0.2 * stunProgress * (0.7 + Math.sin(frame * 0.3) * 0.3);
        CTX.fillStyle = '#ffeb3b';
        CTX.beginPath();
        CTX.roundRect(-24, -18, 48, 36, 4);
        CTX.fill();
        
        // Flickering electric lines on tank surface
        if (frame % 4 < 2) {
            CTX.globalAlpha = 0.6 * stunProgress;
            CTX.strokeStyle = '#a855f7';
            CTX.lineWidth = 1;
            for (let i = 0; i < 3; i++) {
                const lx = -15 + i * 15;
                CTX.beginPath();
                CTX.moveTo(lx, -12);
                CTX.lineTo(lx + (Math.random() - 0.5) * 10, 0);
                CTX.lineTo(lx, 12);
                CTX.stroke();
            }
        }
        
        CTX.globalAlpha = 1;
        CTX.restore();
    }
    
    // Draw FROZEN effect on player - ice encasing the tank - SAME AS ENEMY
    if (player.frozen && player.frozen > 0) {
        CTX.save();
        CTX.translate(player.x, player.y);
        
        const freezeProgress = Math.min(1, player.frozen / 75);
        const iceSize = 50;
        
        // Outer ice glow - SAME AS ENEMY
        CTX.globalAlpha = 0.7 * freezeProgress;
        const outerGlow = CTX.createRadialGradient(0, 0, 30, 0, 0, 60);
        outerGlow.addColorStop(0, 'rgba(0, 188, 212, 0.3)');
        outerGlow.addColorStop(0.5, 'rgba(77, 208, 225, 0.2)');
        outerGlow.addColorStop(1, 'rgba(0, 188, 212, 0)');
        CTX.fillStyle = outerGlow;
        CTX.beginPath();
        CTX.arc(0, 0, 60, 0, Math.PI * 2);
        CTX.fill();
        
        // Main ice block - hexagonal shape - SAME AS ENEMY
        CTX.globalAlpha = 0.5 * freezeProgress;
        CTX.fillStyle = 'rgba(173, 216, 230, 0.6)';
        CTX.strokeStyle = 'rgba(0, 188, 212, 0.9)';
        CTX.lineWidth = 3;
        CTX.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI * 2 / 6) * i - Math.PI / 2;
            const px = Math.cos(angle) * iceSize;
            const py = Math.sin(angle) * iceSize;
            if (i === 0) CTX.moveTo(px, py);
            else CTX.lineTo(px, py);
        }
        CTX.closePath();
        CTX.fill();
        CTX.stroke();
        
        // Ice crack patterns with branch cracks - SAME AS ENEMY (was missing branches)
        CTX.globalAlpha = 0.6 * freezeProgress;
        CTX.strokeStyle = 'rgba(224, 255, 255, 0.8)';
        CTX.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI * 2 / 6) * i + (frame * 0.005);
            CTX.beginPath();
            CTX.moveTo(0, 0);
            
            // Main crack line
            const endX = Math.cos(angle) * 40;
            const endY = Math.sin(angle) * 40;
            CTX.lineTo(endX, endY);
            CTX.stroke();
            
            // Branch cracks - SAME AS ENEMY (was missing)
            const midX = endX * 0.6;
            const midY = endY * 0.6;
            const branchAngle1 = angle + 0.5;
            const branchAngle2 = angle - 0.5;
            
            CTX.beginPath();
            CTX.moveTo(midX, midY);
            CTX.lineTo(midX + Math.cos(branchAngle1) * 15, midY + Math.sin(branchAngle1) * 15);
            CTX.stroke();
            
            CTX.beginPath();
            CTX.moveTo(midX, midY);
            CTX.lineTo(midX + Math.cos(branchAngle2) * 15, midY + Math.sin(branchAngle2) * 15);
            CTX.stroke();
        }
        
        // Ice crystal spikes - SAME AS ENEMY
        CTX.globalAlpha = 0.8 * freezeProgress;
        CTX.fillStyle = 'rgba(0, 191, 255, 0.7)';
        for (let i = 0; i < 8; i++) {
            const spikeAngle = (Math.PI * 2 / 8) * i;
            const spikeHeight = 18 + Math.sin(frame * 0.1 + i) * 4;
            
            CTX.save();
            CTX.translate(Math.cos(spikeAngle) * 42, Math.sin(spikeAngle) * 42);
            CTX.rotate(spikeAngle + Math.PI / 2);
            
            CTX.beginPath();
            CTX.moveTo(0, -spikeHeight);
            CTX.lineTo(-6, 5);
            CTX.lineTo(6, 5);
            CTX.closePath();
            CTX.fill();
            
            CTX.restore();
        }
        
        // Sparkles on ice - full 4-pointed star - SAME AS ENEMY (was incomplete)
        for (let i = 0; i < 5; i++) {
            const sparkleX = Math.cos(frame * 0.02 + i * 1.5) * 30;
            const sparkleY = Math.sin(frame * 0.03 + i * 1.2) * 30;
            const sparkleSize = 2 + Math.sin(frame * 0.2 + i * 2) * 1;
            
            if ((frame + i * 10) % 30 < 15) {
                CTX.globalAlpha = freezeProgress * (0.8 - ((frame + i * 10) % 30) / 30);
                CTX.fillStyle = '#ffffff';
                
                // Full 4-pointed star sparkle - SAME AS ENEMY (was missing second diamond)
                CTX.beginPath();
                CTX.moveTo(sparkleX, sparkleY - sparkleSize * 2);
                CTX.lineTo(sparkleX + sparkleSize * 0.5, sparkleY);
                CTX.lineTo(sparkleX, sparkleY + sparkleSize * 2);
                CTX.lineTo(sparkleX - sparkleSize * 0.5, sparkleY);
                CTX.closePath();
                CTX.fill();
                
                CTX.beginPath();
                CTX.moveTo(sparkleX - sparkleSize * 2, sparkleY);
                CTX.lineTo(sparkleX, sparkleY + sparkleSize * 0.5);
                CTX.lineTo(sparkleX + sparkleSize * 2, sparkleY);
                CTX.lineTo(sparkleX, sparkleY - sparkleSize * 0.5);
                CTX.closePath();
                CTX.fill();
            }
        }
        
        CTX.globalAlpha = 1;
        CTX.restore();
    }
    
    // Draw SLOWED effect on player - frost particles and icy mist - SAME AS ENEMY
    if (player.slowed && player.slowed > 0 && !(player.frozen && player.frozen > 0)) {
        CTX.save();
        CTX.translate(player.x, player.y);
        
        const slowProgress = Math.min(1, player.slowed / 150);
        
        // Frosty mist aura - SAME AS ENEMY
        const mistRadius = 45 + Math.sin(frame * 0.1) * 5;
        const mistGradient = CTX.createRadialGradient(0, 0, 20, 0, 0, mistRadius);
        mistGradient.addColorStop(0, `rgba(135, 206, 235, ${0.15 * slowProgress})`);
        mistGradient.addColorStop(0.5, `rgba(173, 216, 230, ${0.25 * slowProgress})`);
        mistGradient.addColorStop(1, 'rgba(135, 206, 235, 0)');
        CTX.fillStyle = mistGradient;
        CTX.beginPath();
        CTX.arc(0, 0, mistRadius, 0, Math.PI * 2);
        CTX.fill();
        
        // Swirling frost particles with trailing particles - SAME AS ENEMY (was missing trail)
        for (let i = 0; i < 8; i++) {
            const particleAngle = (frame * 0.04) + (i * Math.PI / 4);
            const particleRadius = 30 + Math.sin(frame * 0.08 + i) * 8;
            const px = Math.cos(particleAngle) * particleRadius;
            const py = Math.sin(particleAngle) * particleRadius;
            
            CTX.globalAlpha = slowProgress * (0.4 + Math.sin(frame * 0.1 + i) * 0.2);
            CTX.fillStyle = '#87ceeb';
            CTX.beginPath();
            CTX.arc(px, py, 3 + Math.sin(frame * 0.15 + i) * 1.5, 0, Math.PI * 2);
            CTX.fill();
            
            // Small trailing particles - SAME AS ENEMY (was missing)
            const trailAngle = particleAngle - 0.3;
            const trailX = Math.cos(trailAngle) * (particleRadius - 5);
            const trailY = Math.sin(trailAngle) * (particleRadius - 5);
            CTX.globalAlpha = slowProgress * 0.3;
            CTX.beginPath();
            CTX.arc(trailX, trailY, 2, 0, Math.PI * 2);
            CTX.fill();
        }
        
        // Snowflake symbols floating up - SAME AS ENEMY
        CTX.font = '12px Arial';
        CTX.textAlign = 'center';
        CTX.textBaseline = 'middle';
        for (let i = 0; i < 3; i++) {
            const floatY = -25 - ((frame * 0.5 + i * 40) % 60);
            const floatX = Math.sin(frame * 0.05 + i * 2) * 15;
            CTX.globalAlpha = slowProgress * (0.6 - (floatY + 85) / 100);
            CTX.fillStyle = '#b0e0e6';
            CTX.fillText('❄', floatX, floatY);
        }
        
        CTX.globalAlpha = 1;
        CTX.restore();
    }
    
    // Draw STUNNED effect on player - electric sparks and dizzy effect
    if (player.stunned && player.stunned > 0) {
        CTX.save();
        CTX.translate(player.x, player.y);
        
        const stunProgress = Math.min(1, player.stunned / 60);
        
        // Electric aura
        const auraRadius = 50 + Math.sin(frame * 0.2) * 8;
        const auraGradient = CTX.createRadialGradient(0, 0, 20, 0, 0, auraRadius);
        auraGradient.addColorStop(0, `rgba(255, 235, 59, ${0.15 * stunProgress})`);
        auraGradient.addColorStop(0.5, `rgba(168, 85, 247, ${0.2 * stunProgress})`);
        auraGradient.addColorStop(1, 'rgba(255, 235, 59, 0)');
        CTX.fillStyle = auraGradient;
        CTX.beginPath();
        CTX.arc(0, 0, auraRadius, 0, Math.PI * 2);
        CTX.fill();
        
        // Lightning bolts
        for (let i = 0; i < 8; i++) {
            const boltAngle = (Math.PI * 2 / 8) * i + Math.sin(frame * 0.1) * 0.3;
            const boltLength = 35 + Math.sin(frame * 0.25 + i) * 10;
            
            if ((frame + i * 7) % 12 < 8) {
                CTX.strokeStyle = `rgba(255, 235, 59, ${0.8 * stunProgress})`;
                CTX.lineWidth = 2;
                CTX.beginPath();
                CTX.moveTo(0, 0);
                
                let prevX = 0, prevY = 0;
                const segments = 4;
                for (let s = 1; s <= segments; s++) {
                    const t = s / segments;
                    const baseX = Math.cos(boltAngle) * boltLength * t;
                    const baseY = Math.sin(boltAngle) * boltLength * t;
                    const perpAngle = boltAngle + Math.PI / 2;
                    const zigzag = (s < segments) ? (Math.random() - 0.5) * 15 : 0;
                    const px = baseX + Math.cos(perpAngle) * zigzag;
                    const py = baseY + Math.sin(perpAngle) * zigzag;
                    CTX.lineTo(px, py);
                    prevX = px;
                    prevY = py;
                }
                CTX.stroke();
                
                CTX.fillStyle = `rgba(255, 255, 255, ${0.6 * stunProgress})`;
                CTX.beginPath();
                CTX.arc(prevX, prevY, 3, 0, Math.PI * 2);
                CTX.fill();
            }
        }
        
        // Sparking particles orbiting
        for (let i = 0; i < 6; i++) {
            const sparkAngle = (frame * 0.12) + (i * Math.PI / 3);
            const sparkRadius = 30 + Math.sin(frame * 0.15 + i * 2) * 5;
            const sparkX = Math.cos(sparkAngle) * sparkRadius;
            const sparkY = Math.sin(sparkAngle) * sparkRadius;
            
            CTX.globalAlpha = stunProgress * (0.6 + Math.sin(frame * 0.3 + i) * 0.3);
            CTX.fillStyle = i % 2 === 0 ? '#ffeb3b' : '#a855f7';
            CTX.beginPath();
            CTX.arc(sparkX, sparkY, 3 + Math.sin(frame * 0.2 + i) * 1.5, 0, Math.PI * 2);
            CTX.fill();
        }
        
        // Electric shock wave rings
        const ringPhase = (frame * 0.05) % 1;
        const ringRadius = 25 + ringPhase * 30;
        CTX.globalAlpha = stunProgress * (1 - ringPhase) * 0.5;
        CTX.strokeStyle = '#ffeb3b';
        CTX.lineWidth = 2;
        CTX.beginPath();
        CTX.arc(0, 0, ringRadius, 0, Math.PI * 2);
        CTX.stroke();
        
        CTX.globalAlpha = 1;
        CTX.restore();
    }
    
    // =========================================================================
    // END PLAYER STATUS EFFECTS
    // =========================================================================
    
    // Restore alpha after drawing stealthed tank (stealth visual effect)
    if (player.invisible && player.invisibleTime > 0) {
        CTX.restore();
    }

    // =========================================================================
    // UNIFIED STATUS BARS ABOVE PLAYER TANK
    // All bars use same style and stack neatly without overlap
    // =========================================================================
    drawPlayerStatusBars(player, frame);

    if (WEAPONS[player.weapon].laser && !player.isUlting) {
        CTX.save();
        CTX.translate(player.x, player.y);
        CTX.rotate(player.turretAngle);
        
        // Laser Sight configuration - synced with emitter position
        // Emitter: boxX=5, boxWidth=10, lensWidth=4, lens glow at lensX+4=19
        // Laser beam starts exactly at lens glow position
        const laserStartX = 19; // Start from emitter lens tip (closer to tank center)
        const laserLength = 600;
        const laserAlpha = 0.15 + Math.sin(frame * 0.15) * 0.1;
        
        // Main laser beam - thin red line at y=0 (centerline, same as lens)
        let gradient = CTX.createLinearGradient(laserStartX, 0, laserLength, 0);
        gradient.addColorStop(0, `rgba(255, 0, 0, ${laserAlpha + 0.1})`);
        gradient.addColorStop(0.1, `rgba(255, 0, 0, ${laserAlpha})`);
        gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
        CTX.fillStyle = gradient;
        CTX.fillRect(laserStartX, -1, laserLength - laserStartX, 2);
        
        // Pulsing dots along laser beam
        CTX.fillStyle = `rgba(255, 0, 0, ${laserAlpha + 0.2})`;
        for (let i = 0; i < laserLength - laserStartX; i += 40) {
            CTX.beginPath();
            CTX.arc(laserStartX + i, 0, 2, 0, Math.PI * 2);
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

    // Draw bullets with unique weapon-specific styles
    // === COMPREHENSIVE BULLET RENDERING OPTIMIZATION ===
    // This is often a major performance bottleneck when many bullets are on screen
    const bulletMargin = 50; // Extra margin for bullet trails
    const bulletEffectDetail = typeof getEffectDetail === 'function' ? getEffectDetail() : 1.0;
    const bulletCount = bullets.length;
    
    // Calculate max bullets to render based on performance level
    // At full quality: render all, at low quality: render fewer with simpler effects
    const maxBulletsToRender = bulletEffectDetail >= 0.8 ? bulletCount 
                              : bulletEffectDetail >= 0.5 ? Math.min(bulletCount, 80)
                              : Math.min(bulletCount, 40);
    
    let bulletsRendered = 0;
    
    for (let b of bullets) {
        // Skip bullets outside viewport first (cheapest check)
        if (typeof isInViewport === 'function' && !isInViewport(b.x, b.y, bulletMargin)) continue;
        
        // Performance cap: skip bullets if we've rendered enough
        bulletsRendered++;
        if (bulletsRendered > maxBulletsToRender) {
            // In low quality mode, at least draw a simple dot for remaining bullets
            if (bulletEffectDetail < 0.5) {
                CTX.fillStyle = b.color || '#ffffff';
                CTX.globalAlpha = 0.7;
                CTX.beginPath();
                CTX.arc(b.x, b.y, 3, 0, Math.PI * 2);
                CTX.fill();
            }
            continue;
        }
        
        CTX.save();
        const fadeAlpha = b.life < 15 ? b.life / 15 : 1;
        CTX.globalAlpha = fadeAlpha;
        
        // Initialize trail clock for animation
        if (!b.trailClock) b.trailClock = 0;
        b.trailClock++;
        
        const bulletAngle = Math.atan2(b.vy, b.vx);
        const speed = Math.hypot(b.vx, b.vy);
        
        // Get weapon-specific motion blur color (pastel/lighter version of bullet color)
        // Only cannon, twin, shotgun, burst were fixed to match their bullet colors
        const blurColors = {
            'single': '#c8d0d8',    // Cannon - pastel gray (matches #9ca3af bullet)
            'twin': '#4ade80',      // Twin Cannon - pastel green (matches #10b981 bullet)
            'spread': '#e879f9',    // Shotgun - pastel pink (matches #d946ef bullet)
            'sniper': '#00ff88',    // Railgun - cyan energy (original)
            'burst': '#ffe066',     // Burst Rifle - pastel gold (matches #ffd700 bullet)
            'flak': '#ff6600',      // Flak - orange explosive (original)
            'aoe': '#ff4400',       // Rocket - red missile (original)
            'rapid': '#ff00ff',     // Plasma - magenta (original)
            'pierce': '#00ffff',    // Gauss - cyan magnetic (original)
            'ice': '#88ddff',       // Frost - ice blue (original)
            'fire': '#ff6600',      // Inferno - fire orange (original)
            'electric': '#ffff00'   // Tesla - yellow electric (original)
        };
        
        // Get bullet size for motion blur width
        const bulletSizes = {
            'single': 10, 'twin': 7, 'spread': 5, 'sniper': 6,
            'burst': 6, 'flak': 8, 'aoe': 12, 'rapid': 5,
            'pierce': 5, 'ice': 7, 'fire': 9, 'electric': 8
        };
        
        // Draw motion blur effect for all bullets (only at medium+ quality)
        // Motion blur is expensive - skip at low quality
        if (bulletEffectDetail >= 0.4) {
            const blurColor = blurColors[b.type] || b.color || '#ffffff';
            const blurLength = Math.min(speed * 5, 70) * bulletEffectDetail; // Scale blur length with quality
            drawBulletMotionBlur(b, blurColor, fadeAlpha, blurLength, 0.65 * bulletEffectDetail);
        }
        
        // Draw based on weapon/bullet type
        switch(b.type) {
            case 'single': // Cannon - classic shell
                drawCannonBullet(b, bulletAngle, fadeAlpha);
                break;
                
            case 'twin': // Twin Cannon - dual tracer rounds
                drawTwinBullet(b, bulletAngle, fadeAlpha);
                break;
                
            case 'spread': // Shotgun - pellets with scatter
                drawShotgunBullet(b, bulletAngle, fadeAlpha);
                break;
                
            case 'sniper': // Railgun - hypersonic tracer
                drawSniperBullet(b, bulletAngle, fadeAlpha, speed);
                break;
                
            case 'burst': // Burst Rifle - energy bolts
                drawBurstBullet(b, bulletAngle, fadeAlpha);
                break;
                
            case 'flak': // Flak Cannon - explosive shells
                drawFlakBullet(b, bulletAngle, fadeAlpha);
                break;
                
            case 'aoe': // Rocket Launcher - missiles
                drawRocketBullet(b, bulletAngle, fadeAlpha);
                break;
                
            case 'rapid': // Plasma Beam - plasma bolts
                drawPlasmaBullet(b, bulletAngle, fadeAlpha);
                break;
                
            case 'pierce': // Gauss Rifle - magnetic slug
                drawGaussBullet(b, bulletAngle, fadeAlpha, speed);
                break;
                
            case 'ice': // Frost Cannon - ice shards
                drawIceBullet(b, bulletAngle, fadeAlpha);
                break;
                
            case 'fire': // Inferno Gun - fireballs
                drawFireBullet(b, bulletAngle, fadeAlpha);
                break;
                
            case 'electric': // Tesla Rifle - lightning orbs
                drawElectricBullet(b, bulletAngle, fadeAlpha);
                break;
                
            default:
                // Default bullet (simple circle)
                CTX.fillStyle = 'rgba(0, 0, 0, 0.3)';
                CTX.beginPath();
                CTX.arc(b.x + 2, b.y + 2, 5, 0, Math.PI * 2);
                CTX.fill();
                CTX.fillStyle = b.color;
                CTX.beginPath();
                CTX.arc(b.x, b.y, 5, 0, Math.PI * 2);
                CTX.fill();
        }
        
        CTX.restore();
    }

    // Get adaptive quality for performance-based rendering
    const quality = (typeof getAdaptiveQuality === 'function') ? getAdaptiveQuality() : 1.0;
    
    // ANTI-FLICKER FIX: Use consistent particle skip based on particle hash, not render index
    // This ensures the same particles are always rendered, preventing flicker when quality changes
    const shouldSkipParticle = (p, qualityLevel) => {
        if (qualityLevel >= 0.9) return false; // Render all at high quality
        
        // CRITICAL FIX: Auto-assign particleId to particles that don't have one
        // This ensures all particles get consistent rendering behavior
        if (!p.particleId && typeof particleIdCounter !== 'undefined') {
            p.particleId = ++particleIdCounter;
        }
        
        // Use particle's STABLE unique properties to create a stable hash
        // CRITICAL: Do NOT use p.life in hash as it changes every frame causing flicker
        // Only use particleId which is assigned once and never changes
        const hash = p.particleId || 0;
        const skipThreshold = qualityLevel >= 0.6 ? 50 : 33; // Skip 50% or 66%
        
        // Use modulo to get consistent skip decision for this particle
        return (hash % 100) >= skipThreshold;
    };
    
    // OPTIMIZATION: Use viewport culling to skip off-screen particles
    const particleMargin = 30;
    for (let p of particles) {
        // Skip particles based on adaptive quality using consistent hash (prevents flicker)
        if (shouldSkipParticle(p, quality)) continue;
        
        // Skip particles outside viewport
        if (typeof isInViewport === 'function' && !isInViewport(p.x, p.y, particleMargin)) continue;
        
        CTX.save();
        if (p.style === 'turbo') {
            const ratio = Math.max(0, Math.min(1, (p.life || 0) / (p.maxLife || 1)));
            const len = (p.size || 6) * 3.2;
            const width = (p.size || 6) * (0.6 + ratio * 0.4);
            const angle = Math.atan2(p.vy || 0.0001, p.vx || -1);
            CTX.translate(p.x, p.y);
            CTX.rotate(angle);
            const gradient = CTX.createLinearGradient(0, 0, -len, 0);
            gradient.addColorStop(0, p.coreColor || 'rgba(224,242,254,0.9)');
            gradient.addColorStop(1, p.color || 'rgba(56,189,248,0)');
            CTX.fillStyle = gradient;
            CTX.globalAlpha = Math.pow(ratio, 0.4);
            CTX.beginPath();
            CTX.moveTo(0, -width * 0.4);
            CTX.lineTo(-len, -width);
            CTX.lineTo(-len * 1.05, width);
            CTX.lineTo(0, width * 0.4);
            CTX.closePath();
            CTX.fill();
        } else if (p.type === 'aoeRing') {
            // AOE DAMAGE RING INDICATOR - Expanding circle showing blast radius
            // This visual helps players understand AOE weapon effective range
            const ratio = Math.max(0, Math.min(1, p.life / (p.maxLife || 18)));
            
            // Ring expands from initial size to target size
            const progress = 1 - ratio; // 0 -> 1 as life decreases
            const currentSize = p.size + (p.targetSize - p.size) * progress;
            
            // Draw outer glow ring
            CTX.beginPath();
            CTX.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
            CTX.strokeStyle = p.color;
            // Alpha fades out as ring expands
            CTX.globalAlpha = ratio * 0.7;
            // Ring gets thinner as it expands
            CTX.lineWidth = Math.max(2, 6 * ratio);
            CTX.stroke();
            
            // Inner glow for extra visual punch
            CTX.beginPath();
            CTX.arc(p.x, p.y, currentSize * 0.9, 0, Math.PI * 2);
            CTX.globalAlpha = ratio * 0.3;
            CTX.lineWidth = Math.max(1, 3 * ratio);
            CTX.stroke();
        } else if (p.type === 'wave') {
            // Shockwave ring effect - expanding circle
            CTX.beginPath();
            CTX.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            CTX.strokeStyle = p.color;
            // Smooth fade-out based on life, clamped to prevent flickering
            const waveAlpha = Math.max(0, Math.min(1, p.life / (p.maxLife || 20)));
            CTX.globalAlpha = waveAlpha;
            CTX.lineWidth = Math.max(1, 3 * waveAlpha); // Thinner as it fades
            CTX.stroke();
        } else {
            // Standard particle rendering with SMOOTH fade (no flickering)
            CTX.fillStyle = p.color;
            
            // CRITICAL FIX: Set maxLife immediately if not set to prevent first-frame flicker
            // This ensures consistent alpha calculation from the first render frame
            if (!p.maxLife || p.maxLife <= 0) {
                p.maxLife = Math.max(p.life || 30, 1);
            }
            
            // Calculate smooth alpha based on remaining life
            const maxLife = p.maxLife;
            const lifeRatio = Math.max(0, Math.min(1, p.life / maxLife));
            
            // FADE-IN EFFECT: New particles fade in smoothly over first 20% of their life
            // This prevents the "pop-in" flicker when particles spawn
            const fadeInDuration = 0.15; // 15% of life for fade-in
            const lifeElapsed = 1 - lifeRatio;
            let fadeInAlpha = 1;
            if (lifeElapsed < fadeInDuration) {
                // Smooth ease-in during spawn (cubic for smooth entry)
                const fadeInProgress = lifeElapsed / fadeInDuration;
                fadeInAlpha = fadeInProgress * fadeInProgress * (3 - 2 * fadeInProgress); // smoothstep
            }
            
            // Smooth exponential fade-out (no sin() pulsing = no flicker)
            // Use easeOutQuad for natural looking fade
            const fadeOutAlpha = lifeRatio * lifeRatio;
            
            // Combine fade-in and fade-out for seamless lifecycle
            const smoothAlpha = fadeInAlpha * fadeOutAlpha;
            CTX.globalAlpha = smoothAlpha;
            
            // Size with smooth scale based on particle type
            let s = p.size || 3;
            
            // Only apply scale animation to non-explosion particles
            // Explosion particles (life > 30) should have stable size
            let scale = 1;
            if (p.life < 30 && !p.noScale) {
                // Gentle shrink as particle dies (no pulsing)
                scale = 0.5 + lifeRatio * 0.5;
            }
            
            CTX.translate(p.x + s / 2, p.y + s / 2);
            CTX.scale(scale, scale);
            CTX.fillRect(-s / 2, -s / 2, s, s);
        }
        CTX.restore();
    }

    // VIEWPORT CULLING: Only render float text visible on screen
    const floatTextMargin = 150; // Larger margin for enhanced effects
    for (let f of floatText) {
        // Skip float text outside viewport
        if (!isInViewport(f.x, f.y, floatTextMargin)) continue;
        
        CTX.save();
        
        // Calculate animation progress (0 = start, 1 = end)
        const progress = 1 - (f.life / f.maxLife);
        const fadeAlpha = Math.max(0, f.life / f.maxLife);
        
        // Determine text type for different animations
        const isDamage = f.text.startsWith('-') || f.text.startsWith('+');
        
        // Status effects from magic/elemental attacks - clean animation without spinning
        const isStatus = ['FROZEN', 'BURNING', 'STUNNED', 'DIZZY', 'SLOWED', 'SHOCKED'].some(s => f.text.includes(s));
        
        // Magic skill texts - dramatic elemental effects
        const isMagicSkill = ['MAGIC SHIELD', 'TELEPORT', 'ICE BURST', 'FIRE NOVA', 'CHAIN LIGHTNING', 'BLOCKED', 'BLINK'].some(s => f.text.includes(s));
        
        // Specific magic type detection for unique effects
        const isIceMagic = f.text.includes('ICE BURST') || f.text.includes('FROZEN');
        const isFireMagic = f.text.includes('FIRE NOVA') || f.text.includes('BURNING');
        const isLightningMagic = f.text.includes('CHAIN LIGHTNING') || f.text.includes('SHOCKED');
        const isShieldMagic = f.text.includes('MAGIC SHIELD') || f.text.includes('BLOCKED');
        const isBlinkMagic = f.text.includes('BLINK') || f.text.includes('TELEPORT');
        
        // Check for critical flag from object OR text content (but NOT for magic skills or status effects)
        const isCriticalHit = !isMagicSkill && !isStatus && (f.isCritical || f.text.includes('CRITICAL'));
        const isCritical = !isMagicSkill && !isStatus && (f.text.includes('BOSS') || f.text.includes('VICTORY') || f.text.includes('CRUSHED'));
        const isScore = f.text.match(/^\+\d+$/);
        
        // Player ultimate/skill texts - dramatic activation effects
        // Note: "DEVASTATOR!" with exclamation mark is player ultimate, "DEVASTATOR" alone is boss turret name
        const isPlayerUltimate = f.text === 'DEVASTATOR!' || f.text.includes('SHOCKWAVE!') || 
                                 f.text.includes('BERSERKER MODE') || f.text.includes('CLONE ARMY') ||
                                 f.text.includes('ULTIMATE UPGRADED') || f.text.includes('ALLIES DEPLOYED');
        
        // Boss effect texts - dramatic burning/cursed effects on player (NOT for magic skills or status)
        const isBossEffect = !isMagicSkill && !isStatus && (f.text.includes('CURSED') || f.text.includes('OMEGA') || 
                            f.text.includes('AWAKENED') || f.text.includes('BURN') ||
                            f.text.includes('IMPACT') || f.text.includes('ENRAGED') ||
                            f.text.includes('PHASE') || f.text.includes('ANNIHILATION'));
        
        // Animation parameters based on text type
        let scale = 1;
        let shake = 0;
        let bounce = 0;
        let fontSize = 16;
        let glowIntensity = 0;
        
        if (isPlayerUltimate) {
            // === PLAYER ULTIMATE SKILL ANIMATIONS ===
            const entrancePhase = Math.min(1, progress * 5);
            const pulsePhase = Math.sin(f.life * 0.3);
            const wavePhase = Math.sin(f.life * 0.2);
            
            if (f.text.includes('DEVASTATOR')) {
                // Devastator: Massive energy burst
                scale = 0.3 + entrancePhase * 1.5 + pulsePhase * 0.3;
                shake = (Math.random() - 0.5) * 12 * fadeAlpha;
                bounce = -entrancePhase * 40 + Math.sin(progress * Math.PI * 3) * 15;
                fontSize = 28;
                glowIntensity = 1.5 + pulsePhase * 0.5;
            } else if (f.text.includes('BERSERKER')) {
                // Berserker: Rage-fueled power
                scale = 0.4 + entrancePhase * 1.3 + Math.abs(pulsePhase) * 0.35;
                shake = (Math.random() - 0.5) * 15 * fadeAlpha;
                bounce = -entrancePhase * 35 + wavePhase * 12;
                fontSize = 26;
                glowIntensity = 1.3 + Math.abs(pulsePhase) * 0.6;
            } else if (f.text.includes('SHOCKWAVE')) {
                // Shockwave: Expanding force
                scale = 0.5 + entrancePhase * 1.2 + pulsePhase * 0.25;
                shake = Math.sin(f.life * 0.5) * 8 * fadeAlpha;
                bounce = -entrancePhase * 30 + Math.cos(progress * Math.PI * 4) * 10;
                fontSize = 24;
                glowIntensity = 1.2 + pulsePhase * 0.4;
            } else if (f.text.includes('CLONE ARMY') || f.text.includes('ALLIES')) {
                // Clone Army: Tactical deployment
                scale = 0.4 + entrancePhase * 1.0 + pulsePhase * 0.2;
                shake = Math.sin(f.life * 0.4) * 5 * fadeAlpha;
                bounce = -entrancePhase * 25 + wavePhase * 8;
                fontSize = f.text.includes('CLONE ARMY') ? 24 : 18;
                glowIntensity = 1.0 + pulsePhase * 0.4;
            } else {
                // Default ultimate animation
                scale = 0.5 + entrancePhase * 1.0 + pulsePhase * 0.2;
                shake = (Math.random() - 0.5) * 8 * fadeAlpha;
                bounce = -entrancePhase * 25;
                fontSize = 22;
                glowIntensity = 1.0 + pulsePhase * 0.3;
            }
            
        } else if (isMagicSkill) {
            // === DRAMATIC MAGIC SKILL ANIMATIONS ===
            const entrancePhase = Math.min(1, progress * 4);
            const pulsePhase = Math.sin(f.life * 0.25);
            const wavePhase = Math.sin(f.life * 0.15);
            
            if (isIceMagic) {
                // ICE BURST: Crystalline freeze effect
                scale = 0.4 + entrancePhase * 1.2 + wavePhase * 0.15;
                shake = Math.sin(f.life * 0.4) * 3 * fadeAlpha;
                bounce = -entrancePhase * 20 + Math.cos(progress * Math.PI * 3) * 8;
                fontSize = 20;
                glowIntensity = 0.9 + pulsePhase * 0.4;
            } else if (isFireMagic) {
                // FIRE NOVA: Explosive flame burst
                scale = 0.5 + entrancePhase * 1.0 + Math.abs(pulsePhase) * 0.2;
                shake = (Math.random() - 0.5) * 6 * fadeAlpha;
                bounce = -entrancePhase * 25 + Math.sin(progress * Math.PI * 4) * 10;
                fontSize = 20;
                glowIntensity = 1.0 + pulsePhase * 0.5;
            } else if (isLightningMagic) {
                // CHAIN LIGHTNING: Electric crackling effect
                scale = 0.6 + entrancePhase * 0.9 + Math.abs(Math.sin(f.life * 0.6)) * 0.25;
                shake = (Math.random() - 0.5) * 10 * fadeAlpha; // More erratic
                bounce = -entrancePhase * 15 + Math.random() * 8 - 4;
                fontSize = 19;
                glowIntensity = 0.8 + Math.abs(Math.sin(f.life * 0.8)) * 0.6;
            } else if (isShieldMagic) {
                // MAGIC SHIELD: Protective aura pulse
                scale = 0.5 + entrancePhase * 0.8 + pulsePhase * 0.2;
                shake = 0; // Stable, protective feeling
                bounce = -entrancePhase * 12 + Math.sin(progress * Math.PI * 2) * 5;
                fontSize = 18;
                glowIntensity = 0.7 + pulsePhase * 0.3;
            } else if (isBlinkMagic) {
                // BLINK: Dimensional shift effect
                const blinkPhase = Math.sin(f.life * 0.5);
                scale = 0.3 + entrancePhase * 1.2 + blinkPhase * 0.3;
                shake = Math.sin(f.life * 0.3) * 4 * (1 - progress);
                bounce = -entrancePhase * 30 + blinkPhase * 15;
                fontSize = 19;
                glowIntensity = 1.2 - progress * 0.5 + Math.abs(blinkPhase) * 0.4;
            } else {
                // Default magic animation
                scale = 0.6 + entrancePhase * 0.6 + pulsePhase * 0.1;
                shake = 0;
                bounce = -entrancePhase * 10;
                fontSize = 16;
                glowIntensity = 0.4 + pulsePhase * 0.2;
            }
            
        } else if (isBossEffect) {
            // BOSS EFFECT: Dramatic dark fire animation (reduced scale)
            const pulsePhase = Math.sin(f.life * 0.4);
            const entrancePhase = Math.min(1, progress * 3);
            
            // Start moderate size, shrink with pulsing fire effect
            scale = (1.6 - progress * 0.6) + pulsePhase * 0.15;
            
            // Moderate shake that pulses
            shake = (Math.sin(f.life * 0.8) * 4 + (Math.random() - 0.5) * 3) * fadeAlpha;
            
            // Dramatic rise from below
            bounce = -entrancePhase * 15 + Math.sin(progress * Math.PI * 2) * 5 * (1 - progress);
            
            fontSize = f.text.includes('AWAKENED') || f.text.includes('ANNIHILATION') ? 20 : 
                       f.text.includes('CURSED') ? 16 : 15;
            glowIntensity = 0.8 + pulsePhase * 0.3;
        } else if (isCriticalHit) {
            // === EXPLOSIVE CRITICAL HIT ANIMATION ===
            const explosionPhase = Math.min(1, progress * 6); // Even faster explosion
            const pulsePhase = Math.sin(f.life * 0.4);
            const shakeIntensity = Math.max(0, 1 - progress * 1.5);
            
            // Massive scale that shrinks dramatically
            scale = (f.scale || 2.5) * (1 - progress * 0.4) + pulsePhase * 0.3;
            
            // Intense violent shake that decreases
            shake = (Math.random() - 0.5) * 20 * shakeIntensity;
            
            // Dramatic upward jump with aftershock bounces
            const bounceDecay = Math.max(0, 1 - progress * 2);
            bounce = -Math.sin(explosionPhase * Math.PI) * 50 * bounceDecay + 
                     Math.sin(progress * Math.PI * 6) * 8 * bounceDecay;
            
            fontSize = f.text === 'CRITICAL!' ? 32 : 26;
            glowIntensity = 1.5 + pulsePhase * 0.5;
        } else if (isDamage) {
            // Damage numbers: pop in, slight shake, then float up
            const popPhase = Math.min(1, progress * 4); // Quick pop at start
            scale = 1 + Math.sin(popPhase * Math.PI) * 0.4;
            shake = Math.sin(f.life * 0.8) * 2 * (1 - progress);
            fontSize = f.text.startsWith('-') ? 18 : 17;
            
            // Red damage pulses
            if (f.text.startsWith('-')) {
                glowIntensity = 0.3 * (1 - progress);
            }
        } else if (isStatus) {
            // === ENHANCED STATUS EFFECT ANIMATIONS ===
            const entrancePhase = Math.min(1, progress * 3);
            const pulsePhase = Math.sin(f.life * 0.2);
            
            // Element-specific status animations
            if (f.text.includes('FROZEN')) {
                scale = 0.4 + entrancePhase * 1.0 + Math.abs(pulsePhase) * 0.2;
                shake = Math.sin(f.life * 0.5) * 4 * fadeAlpha;
                fontSize = 17;
                glowIntensity = 0.8 + pulsePhase * 0.4;
            } else if (f.text.includes('BURNING')) {
                scale = 0.5 + entrancePhase * 0.9 + Math.abs(pulsePhase) * 0.25;
                shake = (Math.random() - 0.5) * 5 * fadeAlpha;
                fontSize = 17;
                glowIntensity = 0.9 + pulsePhase * 0.5;
            } else if (f.text.includes('STUNNED') || f.text.includes('SHOCKED')) {
                scale = 0.5 + entrancePhase * 0.9 + Math.abs(Math.sin(f.life * 0.4)) * 0.2;
                shake = (Math.random() - 0.5) * 8 * fadeAlpha;
                fontSize = 17;
                glowIntensity = 0.7 + Math.abs(Math.sin(f.life * 0.6)) * 0.5;
            } else if (f.text.includes('DIZZY')) {
                scale = 0.5 + entrancePhase * 0.8 + pulsePhase * 0.15;
                shake = Math.sin(f.life * 0.3) * 6 * fadeAlpha;
                fontSize = 16;
                glowIntensity = 0.6 + pulsePhase * 0.3;
            } else if (f.text.includes('SLOWED')) {
                scale = 0.5 + entrancePhase * 0.7 + pulsePhase * 0.1;
                shake = Math.sin(f.life * 0.2) * 2 * fadeAlpha;
                fontSize = 16;
                glowIntensity = 0.5 + pulsePhase * 0.2;
            } else {
                scale = 0.5 + entrancePhase * 0.8 + Math.sin(f.life * 0.15) * 0.15;
                shake = Math.sin(f.life * 0.3) * 3 * fadeAlpha;
                fontSize = 16;
                glowIntensity = 0.5 + Math.sin(f.life * 0.2) * 0.3;
            }
        } else if (isCritical) {
            // Critical messages: big, shaking, pulsing
            const pulsePhase = Math.sin(f.life * 0.25);
            scale = 1.5 + pulsePhase * 0.3;
            shake = (Math.random() - 0.5) * 6 * fadeAlpha;
            fontSize = 22;
            glowIntensity = 0.8;
        } else if (isScore) {
            // Score numbers: bounce up with sparkle
            bounce = Math.sin(progress * Math.PI * 2) * 10 * (1 - progress);
            scale = 1 + Math.sin(progress * Math.PI) * 0.3;
            fontSize = 17;
            glowIntensity = 0.4 * fadeAlpha;
        } else {
            // Default: simple fade with slight bob
            bounce = Math.sin(f.life * 0.1) * 2;
            fontSize = 16;
        }
        
        // Apply transformations
        const drawX = f.x + shake;
        const drawY = f.y + bounce;
        
        CTX.translate(drawX, drawY);
        CTX.scale(scale, scale);
        CTX.translate(-drawX, -drawY);
        
        CTX.globalAlpha = fadeAlpha;
        CTX.font = `bold ${fontSize}px Arial`;
        CTX.textAlign = 'center';
        
        // Draw glow effect for special texts
        if (glowIntensity > 0) {
            CTX.shadowColor = f.color;
            CTX.shadowBlur = 10 * glowIntensity;
            CTX.fillStyle = f.color;
            CTX.fillText(f.text, drawX, drawY);
            CTX.shadowBlur = 0;
        }
        
        // Draw text stroke (outline) for better visibility
        CTX.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        CTX.lineWidth = 4;
        CTX.strokeText(f.text, drawX, drawY);
        
        // Draw main text
        CTX.fillStyle = f.color;
        CTX.fillText(f.text, drawX, drawY);
        
        // CRITICAL HIT explosive visual effects
        if (isCriticalHit && progress < 0.75) {
            // === ULTRA DRAMATIC CRITICAL HIT EFFECTS ===
            
            // Multiple explosive rings expanding outward
            for (let r = 0; r < 3; r++) {
                const ringDelay = r * 0.08;
                const ringProgress = Math.max(0, progress - ringDelay);
                if (ringProgress > 0 && ringProgress < 0.6) {
                    CTX.globalAlpha = fadeAlpha * 0.8 * (1 - ringProgress * 1.6);
                    const ringRadius = 15 + ringProgress * 100 + r * 20;
                    const ringColors = ['#ffffff', '#ff4444', '#ffaa00'];
                    CTX.strokeStyle = ringColors[r];
                    CTX.lineWidth = Math.max(1, 5 - ringProgress * 6 - r);
                    CTX.beginPath();
                    CTX.arc(drawX, drawY, ringRadius, 0, Math.PI * 2);
                    CTX.stroke();
                }
            }
            
            // Lightning bolts radiating outward
            if (progress < 0.4) {
                CTX.globalAlpha = fadeAlpha * 0.9 * (1 - progress * 2.5);
                const boltCount = f.text === 'CRITICAL!' ? 8 : 6;
                for (let i = 0; i < boltCount; i++) {
                    const boltAngle = (Math.PI * 2 / boltCount) * i + progress * Math.PI * 2;
                    const boltLength = 30 + progress * 70;
                    
                    // Draw zigzag lightning bolt
                    CTX.strokeStyle = i % 2 === 0 ? '#ffffff' : '#ffff00';
                    CTX.lineWidth = 3 - progress * 4;
                    CTX.beginPath();
                    
                    let x = drawX;
                    let y = drawY;
                    CTX.moveTo(x, y);
                    
                    const segments = 4;
                    for (let s = 1; s <= segments; s++) {
                        const segDist = (boltLength / segments) * s;
                        const segX = drawX + Math.cos(boltAngle) * segDist;
                        const segY = drawY + Math.sin(boltAngle) * segDist;
                        // Add zigzag offset perpendicular to bolt direction
                        const perpAngle = boltAngle + Math.PI / 2;
                        const zigzag = (s % 2 === 0 ? 1 : -1) * 8 * (1 - progress);
                        const finalX = segX + Math.cos(perpAngle) * zigzag;
                        const finalY = segY + Math.sin(perpAngle) * zigzag;
                        CTX.lineTo(finalX, finalY);
                    }
                    CTX.stroke();
                }
            }
            
            // Fire sparks radiating outward with trails
            CTX.globalAlpha = fadeAlpha * 0.9 * (1 - progress * 1.3);
            const sparkCount = f.text === 'CRITICAL!' ? 16 : 12;
            for (let i = 0; i < sparkCount; i++) {
                const sparkAngle = (Math.PI * 2 / sparkCount) * i + progress * Math.PI * 4;
                const sparkDist = 20 + progress * 80;
                const sparkX = drawX + Math.cos(sparkAngle) * sparkDist;
                const sparkY = drawY + Math.sin(sparkAngle) * sparkDist;
                
                // Fire color gradient: white -> yellow -> orange -> red
                const colorPhase = (i + progress * sparkCount) % 4;
                const sparkColors = ['#ffffff', '#ffff00', '#ff6600', '#ff0000'];
                CTX.fillStyle = sparkColors[Math.floor(colorPhase)];
                
                // Larger spark particles
                const sparkSize = Math.max(1, 5 - progress * 5);
                CTX.beginPath();
                CTX.arc(sparkX, sparkY, sparkSize, 0, Math.PI * 2);
                CTX.fill();
                
                // Longer trail lines
                const trailX = drawX + Math.cos(sparkAngle) * (sparkDist - 25);
                const trailY = drawY + Math.sin(sparkAngle) * (sparkDist - 25);
                CTX.strokeStyle = CTX.fillStyle;
                CTX.lineWidth = Math.max(1, 3 - progress * 3);
                CTX.beginPath();
                CTX.moveTo(trailX, trailY);
                CTX.lineTo(sparkX, sparkY);
                CTX.stroke();
            }
            
            // Intense central flash for CRITICAL! text
            if (f.text === 'CRITICAL!' && progress < 0.2) {
                // White hot core
                CTX.globalAlpha = (0.2 - progress) * 4;
                const gradient = CTX.createRadialGradient(drawX, drawY, 0, drawX, drawY, 60);
                gradient.addColorStop(0, '#ffffff');
                gradient.addColorStop(0.3, '#ffff00');
                gradient.addColorStop(0.6, '#ff6600');
                gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
                CTX.fillStyle = gradient;
                CTX.beginPath();
                CTX.arc(drawX, drawY, 60, 0, Math.PI * 2);
                CTX.fill();
            }
            
            // Screen-shake style jagged border effect
            if (progress < 0.3) {
                CTX.globalAlpha = fadeAlpha * 0.6 * (1 - progress * 3);
                CTX.strokeStyle = '#ff0000';
                CTX.lineWidth = 2;
                const jaggedCount = 20;
                CTX.beginPath();
                for (let i = 0; i <= jaggedCount; i++) {
                    const angle = (Math.PI * 2 / jaggedCount) * i;
                    const baseRadius = 50 + progress * 60;
                    const jag = (i % 2 === 0 ? 1 : 0.7) * baseRadius + Math.random() * 10;
                    const jx = drawX + Math.cos(angle) * jag;
                    const jy = drawY + Math.sin(angle) * jag;
                    if (i === 0) CTX.moveTo(jx, jy);
                    else CTX.lineTo(jx, jy);
                }
                CTX.closePath();
                CTX.stroke();
            }
        }
        
        // === DRAMATIC MAGIC SKILL VISUAL EFFECTS ===
        if (isMagicSkill && progress < 0.7) {
            
            // ICE BURST - Crystalline freeze explosion
            if (isIceMagic && progress < 0.6) {
                // Ice crystal ring expanding
                CTX.globalAlpha = fadeAlpha * 0.8 * (1 - progress * 1.5);
                const iceRadius = 20 + progress * 70;
                
                // Multiple ice rings
                for (let r = 0; r < 2; r++) {
                    const rRadius = Math.max(1, iceRadius - r * 15);
                    CTX.strokeStyle = r === 0 ? '#00ffff' : '#87ceeb';
                    CTX.lineWidth = Math.max(1, 4 - progress * 5 - r);
                    CTX.beginPath();
                    CTX.arc(drawX, drawY, rRadius, 0, Math.PI * 2);
                    CTX.stroke();
                }
                
                // Ice crystal shards radiating outward
                const shardCount = 12;
                for (let i = 0; i < shardCount; i++) {
                    const shardAngle = (Math.PI * 2 / shardCount) * i + progress * Math.PI;
                    const shardDist = 25 + progress * 60;
                    const shardX = drawX + Math.cos(shardAngle) * shardDist;
                    const shardY = drawY + Math.sin(shardAngle) * shardDist;
                    
                    // Draw diamond-shaped ice crystals
                    CTX.fillStyle = i % 2 === 0 ? '#ffffff' : '#00ffff';
                    CTX.save();
                    CTX.translate(shardX, shardY);
                    CTX.rotate(shardAngle + Math.PI / 4);
                    const crystalSize = Math.max(2, 6 - progress * 8);
                    CTX.fillRect(-crystalSize / 2, -crystalSize / 2, crystalSize, crystalSize);
                    CTX.restore();
                }
                
                // Frost particles floating
                CTX.globalAlpha = fadeAlpha * 0.6;
                for (let i = 0; i < 8; i++) {
                    const frostAngle = (Math.PI * 2 / 8) * i + f.life * 0.05;
                    const frostDist = 15 + Math.sin(f.life * 0.1 + i) * 20;
                    const frostX = drawX + Math.cos(frostAngle) * frostDist;
                    const frostY = drawY + Math.sin(frostAngle) * frostDist - progress * 30;
                    CTX.fillStyle = '#87ceeb';
                    CTX.beginPath();
                    CTX.arc(frostX, frostY, 2, 0, Math.PI * 2);
                    CTX.fill();
                }
            }
            
            // FIRE NOVA - Explosive flame burst
            if (isFireMagic && progress < 0.65) {
                // Fire explosion rings
                CTX.globalAlpha = fadeAlpha * 0.7 * (1 - progress * 1.4);
                
                for (let r = 0; r < 3; r++) {
                    const fireRadius = 15 + progress * 80 + r * 10;
                    const fireColors = ['#ff0000', '#ff6600', '#ffcc00'];
                    CTX.strokeStyle = fireColors[r];
                    CTX.lineWidth = Math.max(1, 4 - progress * 4 - r * 0.5);
                    CTX.beginPath();
                    CTX.arc(drawX, drawY, fireRadius, 0, Math.PI * 2);
                    CTX.stroke();
                }
                
                // Flame tongues shooting outward
                const flameCount = 10;
                for (let i = 0; i < flameCount; i++) {
                    const flameAngle = (Math.PI * 2 / flameCount) * i + progress * Math.PI * 3;
                    const flameDist = 20 + progress * 70 + Math.sin(f.life * 0.3 + i) * 10;
                    const flameX = drawX + Math.cos(flameAngle) * flameDist;
                    const flameY = drawY + Math.sin(flameAngle) * flameDist;
                    
                    // Flame color cycle
                    const colorPhase = (i + f.life * 0.1) % 3;
                    const flameColors = ['#ffcc00', '#ff6600', '#ff0000'];
                    CTX.fillStyle = flameColors[Math.floor(colorPhase)];
                    
                    // Teardrop flame shape
                    CTX.beginPath();
                    const flameSize = Math.max(2, 5 - progress * 6);
                    CTX.arc(flameX, flameY, flameSize, 0, Math.PI * 2);
                    CTX.fill();
                    
                    // Flame trail
                    const trailDist = flameDist - 20;
                    const trailX = drawX + Math.cos(flameAngle) * trailDist;
                    const trailY = drawY + Math.sin(flameAngle) * trailDist;
                    CTX.strokeStyle = CTX.fillStyle;
                    CTX.lineWidth = Math.max(1, 3 - progress * 3);
                    CTX.beginPath();
                    CTX.moveTo(trailX, trailY);
                    CTX.lineTo(flameX, flameY);
                    CTX.stroke();
                }
                
                // Central fire glow
                if (progress < 0.25) {
                    CTX.globalAlpha = (0.25 - progress) * 3;
                    const gradient = CTX.createRadialGradient(drawX, drawY, 0, drawX, drawY, 40);
                    gradient.addColorStop(0, '#ffffff');
                    gradient.addColorStop(0.3, '#ffcc00');
                    gradient.addColorStop(0.7, '#ff6600');
                    gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
                    CTX.fillStyle = gradient;
                    CTX.beginPath();
                    CTX.arc(drawX, drawY, 40, 0, Math.PI * 2);
                    CTX.fill();
                }
            }
            
            // CHAIN LIGHTNING - Electric crackling effect
            if (isLightningMagic && progress < 0.55) {
                // Electric pulse rings
                CTX.globalAlpha = fadeAlpha * 0.8 * (1 - progress * 1.8);
                const pulseRadius = 15 + progress * 60;
                CTX.strokeStyle = '#ffff00';
                CTX.lineWidth = Math.max(1, 3 - progress * 4);
                CTX.setLineDash([5, 5]);
                CTX.beginPath();
                CTX.arc(drawX, drawY, pulseRadius, 0, Math.PI * 2);
                CTX.stroke();
                CTX.setLineDash([]);
                
                // Lightning bolts in random directions
                const boltCount = 6;
                for (let i = 0; i < boltCount; i++) {
                    const boltAngle = (Math.PI * 2 / boltCount) * i + Math.random() * 0.5;
                    const boltLength = 30 + progress * 50 + Math.random() * 20;
                    
                    CTX.strokeStyle = Math.random() > 0.5 ? '#ffffff' : '#ffff00';
                    CTX.lineWidth = Math.max(1, 2.5 - progress * 3);
                    CTX.beginPath();
                    
                    let x = drawX;
                    let y = drawY;
                    CTX.moveTo(x, y);
                    
                    // Zigzag lightning
                    for (let s = 1; s <= 5; s++) {
                        const segDist = (boltLength / 5) * s;
                        x = drawX + Math.cos(boltAngle) * segDist;
                        y = drawY + Math.sin(boltAngle) * segDist;
                        const perpAngle = boltAngle + Math.PI / 2;
                        const zigzag = (Math.random() - 0.5) * 15 * (1 - progress);
                        CTX.lineTo(x + Math.cos(perpAngle) * zigzag, y + Math.sin(perpAngle) * zigzag);
                    }
                    CTX.stroke();
                }
                
                // Electric sparks
                for (let i = 0; i < 8; i++) {
                    const sparkX = drawX + (Math.random() - 0.5) * 60;
                    const sparkY = drawY + (Math.random() - 0.5) * 60 - progress * 20;
                    CTX.fillStyle = '#ffff00';
                    CTX.beginPath();
                    CTX.arc(sparkX, sparkY, Math.random() * 3 + 1, 0, Math.PI * 2);
                    CTX.fill();
                }
            }
            
            // MAGIC SHIELD - Protective aura
            if (isShieldMagic && progress < 0.6) {
                // Hexagonal shield pattern
                CTX.globalAlpha = fadeAlpha * 0.7 * (1 - progress * 1.5);
                const shieldRadius = 25 + progress * 40;
                
                // Draw hexagon shield
                CTX.strokeStyle = '#a855f7';
                CTX.lineWidth = Math.max(1, 3 - progress * 3);
                CTX.beginPath();
                for (let i = 0; i <= 6; i++) {
                    const angle = (Math.PI * 2 / 6) * i - Math.PI / 6;
                    const hx = drawX + Math.cos(angle) * shieldRadius;
                    const hy = drawY + Math.sin(angle) * shieldRadius;
                    if (i === 0) CTX.moveTo(hx, hy);
                    else CTX.lineTo(hx, hy);
                }
                CTX.stroke();
                
                // Inner hexagon
                const innerRadius = shieldRadius * 0.6;
                CTX.strokeStyle = '#c084fc';
                CTX.lineWidth = Math.max(1, 2 - progress * 2);
                CTX.beginPath();
                for (let i = 0; i <= 6; i++) {
                    const angle = (Math.PI * 2 / 6) * i;
                    const hx = drawX + Math.cos(angle) * innerRadius;
                    const hy = drawY + Math.sin(angle) * innerRadius;
                    if (i === 0) CTX.moveTo(hx, hy);
                    else CTX.lineTo(hx, hy);
                }
                CTX.stroke();
                
                // Shield runes floating
                CTX.globalAlpha = fadeAlpha * 0.5;
                const runeSymbols = ['✦', '◇', '⬡'];
                CTX.font = 'bold 12px Arial';
                CTX.fillStyle = '#a855f7';
                for (let i = 0; i < 3; i++) {
                    const runeAngle = (Math.PI * 2 / 3) * i + f.life * 0.03;
                    const runeDist = shieldRadius * 0.8;
                    const runeX = drawX + Math.cos(runeAngle) * runeDist;
                    const runeY = drawY + Math.sin(runeAngle) * runeDist;
                    CTX.fillText(runeSymbols[i], runeX - 6, runeY + 4);
                }
            }
            
            // BLINK/TELEPORT - Dimensional rift effect
            if (isBlinkMagic && progress < 0.5) {
                // Dimensional rift portal
                CTX.globalAlpha = fadeAlpha * 0.8 * (1 - progress * 2);
                
                // Outer rift ring
                const riftRadius = 20 + progress * 50;
                CTX.strokeStyle = '#a855f7';
                CTX.lineWidth = Math.max(1, 4 - progress * 6);
                CTX.beginPath();
                CTX.arc(drawX, drawY, riftRadius, 0, Math.PI * 2);
                CTX.stroke();
                
                // Inner swirl pattern
                CTX.globalAlpha = fadeAlpha * 0.6;
                for (let i = 0; i < 4; i++) {
                    const swirlAngle = (Math.PI * 2 / 4) * i + f.life * 0.1;
                    const swirlStart = riftRadius * 0.3;
                    const swirlEnd = riftRadius * 0.9;
                    
                    CTX.strokeStyle = i % 2 === 0 ? '#c084fc' : '#a855f7';
                    CTX.lineWidth = 2;
                    CTX.beginPath();
                    
                    // Spiral arm
                    for (let s = 0; s <= 10; s++) {
                        const t = s / 10;
                        const spiralR = swirlStart + (swirlEnd - swirlStart) * t;
                        const spiralAngle = swirlAngle + t * Math.PI * 1.5;
                        const sx = drawX + Math.cos(spiralAngle) * spiralR;
                        const sy = drawY + Math.sin(spiralAngle) * spiralR;
                        if (s === 0) CTX.moveTo(sx, sy);
                        else CTX.lineTo(sx, sy);
                    }
                    CTX.stroke();
                }
                
                // Dimensional particles
                for (let i = 0; i < 6; i++) {
                    const partAngle = Math.random() * Math.PI * 2;
                    const partDist = Math.random() * riftRadius;
                    const partX = drawX + Math.cos(partAngle) * partDist;
                    const partY = drawY + Math.sin(partAngle) * partDist;
                    CTX.fillStyle = Math.random() > 0.5 ? '#a855f7' : '#ffffff';
                    CTX.beginPath();
                    CTX.arc(partX, partY, 2, 0, Math.PI * 2);
                    CTX.fill();
                }
                
                // Central void flash
                if (progress < 0.15) {
                    CTX.globalAlpha = (0.15 - progress) * 5;
                    const gradient = CTX.createRadialGradient(drawX, drawY, 0, drawX, drawY, 30);
                    gradient.addColorStop(0, '#ffffff');
                    gradient.addColorStop(0.5, '#a855f7');
                    gradient.addColorStop(1, 'rgba(168, 85, 247, 0)');
                    CTX.fillStyle = gradient;
                    CTX.beginPath();
                    CTX.arc(drawX, drawY, 30, 0, Math.PI * 2);
                    CTX.fill();
                }
            }
        }
        
        // === ENHANCED STATUS EFFECT VISUAL EFFECTS ===
        if (isStatus && progress < 0.6) {
            
            // FROZEN status - ice crystals forming
            if (f.text.includes('FROZEN') && progress < 0.5) {
                CTX.globalAlpha = fadeAlpha * 0.7 * (1 - progress * 2);
                
                // Frost ring
                const frostRadius = 20 + progress * 40;
                CTX.strokeStyle = '#00ffff';
                CTX.lineWidth = 2;
                CTX.setLineDash([4, 4]);
                CTX.beginPath();
                CTX.arc(drawX, drawY, frostRadius, 0, Math.PI * 2);
                CTX.stroke();
                CTX.setLineDash([]);
                
                // Ice crystals
                for (let i = 0; i < 6; i++) {
                    const crystalAngle = (Math.PI * 2 / 6) * i + f.life * 0.02;
                    const crystalDist = frostRadius * 0.7;
                    const cx = drawX + Math.cos(crystalAngle) * crystalDist;
                    const cy = drawY + Math.sin(crystalAngle) * crystalDist;
                    
                    CTX.fillStyle = i % 2 === 0 ? '#ffffff' : '#87ceeb';
                    CTX.save();
                    CTX.translate(cx, cy);
                    CTX.rotate(crystalAngle);
                    CTX.fillRect(-3, -3, 6, 6);
                    CTX.restore();
                }
            }
            
            // BURNING status - flames dancing
            if (f.text.includes('BURNING') && progress < 0.5) {
                CTX.globalAlpha = fadeAlpha * 0.7 * (1 - progress * 2);
                
                // Fire sparks rising
                for (let i = 0; i < 8; i++) {
                    const fireAngle = (Math.PI * 2 / 8) * i + Math.sin(f.life * 0.2) * 0.5;
                    const fireDist = 15 + progress * 35 + Math.sin(f.life * 0.3 + i) * 8;
                    const fx = drawX + Math.cos(fireAngle) * fireDist;
                    const fy = drawY + Math.sin(fireAngle) * fireDist - progress * 20;
                    
                    const fireColors = ['#ffcc00', '#ff6600', '#ff0000'];
                    CTX.fillStyle = fireColors[i % 3];
                    CTX.beginPath();
                    CTX.arc(fx, fy, Math.max(1, 4 - progress * 6), 0, Math.PI * 2);
                    CTX.fill();
                }
            }
            
            // STUNNED status - electric sparks
            if ((f.text.includes('STUNNED') || f.text.includes('SHOCKED')) && progress < 0.5) {
                CTX.globalAlpha = fadeAlpha * 0.7 * (1 - progress * 2);
                
                // Lightning sparks around text
                for (let i = 0; i < 5; i++) {
                    const sparkX = drawX + (Math.random() - 0.5) * 50;
                    const sparkY = drawY + (Math.random() - 0.5) * 40;
                    
                    CTX.strokeStyle = '#ffff00';
                    CTX.lineWidth = 2;
                    CTX.beginPath();
                    CTX.moveTo(sparkX, sparkY);
                    CTX.lineTo(sparkX + (Math.random() - 0.5) * 15, sparkY + (Math.random() - 0.5) * 15);
                    CTX.stroke();
                    
                    CTX.fillStyle = '#ffffff';
                    CTX.beginPath();
                    CTX.arc(sparkX, sparkY, 2, 0, Math.PI * 2);
                    CTX.fill();
                }
            }
            
            // DIZZY status - swirling stars
            if (f.text.includes('DIZZY') && progress < 0.5) {
                CTX.globalAlpha = fadeAlpha * 0.6 * (1 - progress * 2);
                
                // Orbiting stars
                const starSymbols = ['★', '✦', '✧'];
                CTX.font = 'bold 10px Arial';
                for (let i = 0; i < 3; i++) {
                    const starAngle = (Math.PI * 2 / 3) * i + f.life * 0.1;
                    const starDist = 25 + Math.sin(f.life * 0.15 + i) * 5;
                    const sx = drawX + Math.cos(starAngle) * starDist;
                    const sy = drawY + Math.sin(starAngle) * starDist - 10;
                    
                    CTX.fillStyle = i === 0 ? '#c084fc' : (i === 1 ? '#a855f7' : '#ffffff');
                    CTX.fillText(starSymbols[i], sx - 5, sy + 3);
                }
            }
        }
        
        // === PLAYER ULTIMATE VISUAL EFFECTS ===
        if (isPlayerUltimate && progress < 0.7) {
            
            // DEVASTATOR - Massive energy beam effect
            if (f.text === 'DEVASTATOR!' && progress < 0.6) {
                CTX.globalAlpha = fadeAlpha * 0.9 * (1 - progress * 1.5);
                
                // Energy rings expanding rapidly
                for (let r = 0; r < 4; r++) {
                    const ringDelay = r * 0.05;
                    const ringProgress = Math.max(0, progress - ringDelay);
                    if (ringProgress > 0 && ringProgress < 0.5) {
                        const ringRadius = 20 + ringProgress * 120 + r * 15;
                        const ringColors = ['#00ffff', '#0088ff', '#0044ff', '#ffffff'];
                        CTX.strokeStyle = ringColors[r];
                        CTX.lineWidth = Math.max(1, 5 - ringProgress * 8 - r * 0.5);
                        CTX.beginPath();
                        CTX.arc(drawX, drawY, ringRadius, 0, Math.PI * 2);
                        CTX.stroke();
                    }
                }
                
                // Energy beams radiating outward
                const beamCount = 12;
                for (let i = 0; i < beamCount; i++) {
                    const beamAngle = (Math.PI * 2 / beamCount) * i + progress * Math.PI * 2;
                    const beamLength = 40 + progress * 100;
                    
                    // Gradient beam
                    const grad = CTX.createLinearGradient(
                        drawX, drawY,
                        drawX + Math.cos(beamAngle) * beamLength,
                        drawY + Math.sin(beamAngle) * beamLength
                    );
                    grad.addColorStop(0, '#ffffff');
                    grad.addColorStop(0.5, '#00ffff');
                    grad.addColorStop(1, 'rgba(0, 255, 255, 0)');
                    
                    CTX.strokeStyle = grad;
                    CTX.lineWidth = Math.max(1, 4 - progress * 5);
                    CTX.beginPath();
                    CTX.moveTo(drawX, drawY);
                    CTX.lineTo(
                        drawX + Math.cos(beamAngle) * beamLength,
                        drawY + Math.sin(beamAngle) * beamLength
                    );
                    CTX.stroke();
                }
                
                // Central energy core flash
                if (progress < 0.2) {
                    CTX.globalAlpha = (0.2 - progress) * 4;
                    const gradient = CTX.createRadialGradient(drawX, drawY, 0, drawX, drawY, 70);
                    gradient.addColorStop(0, '#ffffff');
                    gradient.addColorStop(0.3, '#00ffff');
                    gradient.addColorStop(0.6, '#0088ff');
                    gradient.addColorStop(1, 'rgba(0, 136, 255, 0)');
                    CTX.fillStyle = gradient;
                    CTX.beginPath();
                    CTX.arc(drawX, drawY, 70, 0, Math.PI * 2);
                    CTX.fill();
                }
            }
            
            // BERSERKER - Rage fire effect
            if (f.text.includes('BERSERKER') && progress < 0.65) {
                CTX.globalAlpha = fadeAlpha * 0.85 * (1 - progress * 1.4);
                
                // Rage aura expanding
                for (let r = 0; r < 3; r++) {
                    const rageRadius = 25 + progress * 80 + r * 12;
                    const rageColors = ['#ff0000', '#ff4400', '#ff8800'];
                    CTX.strokeStyle = rageColors[r];
                    CTX.lineWidth = Math.max(1, 4 - progress * 5 - r * 0.5);
                    CTX.beginPath();
                    CTX.arc(drawX, drawY, rageRadius, 0, Math.PI * 2);
                    CTX.stroke();
                }
                
                // Rage flames rising
                const flameCount = 14;
                for (let i = 0; i < flameCount; i++) {
                    const flameAngle = (Math.PI * 2 / flameCount) * i + progress * Math.PI * 5;
                    const flameDist = 30 + progress * 70 + Math.sin(f.life * 0.4 + i) * 15;
                    const flameX = drawX + Math.cos(flameAngle) * flameDist;
                    const flameY = drawY + Math.sin(flameAngle) * flameDist - progress * 30;
                    
                    const flameColors = ['#ffcc00', '#ff8800', '#ff4400', '#ff0000'];
                    CTX.fillStyle = flameColors[i % 4];
                    
                    // Flame particle
                    const flameSize = Math.max(2, 6 - progress * 7);
                    CTX.beginPath();
                    CTX.arc(flameX, flameY, flameSize, 0, Math.PI * 2);
                    CTX.fill();
                    
                    // Flame trail
                    const trailX = drawX + Math.cos(flameAngle) * (flameDist - 20);
                    const trailY = drawY + Math.sin(flameAngle) * (flameDist - 20) - progress * 15;
                    CTX.strokeStyle = CTX.fillStyle;
                    CTX.lineWidth = Math.max(1, 3 - progress * 3);
                    CTX.beginPath();
                    CTX.moveTo(trailX, trailY);
                    CTX.lineTo(flameX, flameY);
                    CTX.stroke();
                }
                
                // Central rage burst
                if (progress < 0.2) {
                    CTX.globalAlpha = (0.2 - progress) * 4;
                    const gradient = CTX.createRadialGradient(drawX, drawY, 0, drawX, drawY, 60);
                    gradient.addColorStop(0, '#ffffff');
                    gradient.addColorStop(0.3, '#ffcc00');
                    gradient.addColorStop(0.6, '#ff4400');
                    gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
                    CTX.fillStyle = gradient;
                    CTX.beginPath();
                    CTX.arc(drawX, drawY, 60, 0, Math.PI * 2);
                    CTX.fill();
                }
            }
            
            // SHOCKWAVE - Expanding force wave
            if (f.text.includes('SHOCKWAVE') && progress < 0.6) {
                CTX.globalAlpha = fadeAlpha * 0.8 * (1 - progress * 1.5);
                
                // Multiple shockwave rings
                for (let r = 0; r < 5; r++) {
                    const waveDelay = r * 0.04;
                    const waveProgress = Math.max(0, progress - waveDelay);
                    if (waveProgress > 0 && waveProgress < 0.5) {
                        const waveRadius = 15 + waveProgress * 140 + r * 8;
                        CTX.strokeStyle = r % 2 === 0 ? '#ffcc00' : '#ffffff';
                        CTX.lineWidth = Math.max(1, 4 - waveProgress * 6 - r * 0.3);
                        CTX.beginPath();
                        CTX.arc(drawX, drawY, waveRadius, 0, Math.PI * 2);
                        CTX.stroke();
                    }
                }
                
                // Force particles pushed outward
                const particleCount = 16;
                for (let i = 0; i < particleCount; i++) {
                    const partAngle = (Math.PI * 2 / particleCount) * i + progress * Math.PI;
                    const partDist = 25 + progress * 90;
                    const partX = drawX + Math.cos(partAngle) * partDist;
                    const partY = drawY + Math.sin(partAngle) * partDist;
                    
                    CTX.fillStyle = i % 3 === 0 ? '#ffffff' : (i % 3 === 1 ? '#ffcc00' : '#ff8800');
                    const partSize = Math.max(1, 4 - progress * 5);
                    CTX.beginPath();
                    CTX.arc(partX, partY, partSize, 0, Math.PI * 2);
                    CTX.fill();
                }
                
                // Ground crack pattern
                if (progress < 0.3) {
                    CTX.globalAlpha = fadeAlpha * 0.5 * (1 - progress * 3);
                    CTX.strokeStyle = '#ffcc00';
                    CTX.lineWidth = 2;
                    for (let i = 0; i < 8; i++) {
                        const crackAngle = (Math.PI * 2 / 8) * i;
                        const crackLength = 30 + progress * 50;
                        CTX.beginPath();
                        CTX.moveTo(drawX, drawY);
                        
                        // Zigzag crack
                        let cx = drawX, cy = drawY;
                        for (let s = 1; s <= 4; s++) {
                            const segDist = (crackLength / 4) * s;
                            cx = drawX + Math.cos(crackAngle) * segDist;
                            cy = drawY + Math.sin(crackAngle) * segDist;
                            const perpAngle = crackAngle + Math.PI / 2;
                            const zigzag = (s % 2 === 0 ? 1 : -1) * 6;
                            CTX.lineTo(cx + Math.cos(perpAngle) * zigzag, cy + Math.sin(perpAngle) * zigzag);
                        }
                        CTX.stroke();
                    }
                }
            }
            
            // CLONE ARMY - Tactical deployment effect
            if ((f.text.includes('CLONE ARMY') || f.text.includes('ALLIES')) && progress < 0.55) {
                CTX.globalAlpha = fadeAlpha * 0.75 * (1 - progress * 1.8);
                
                // Holographic deployment rings
                const deployRadius = 20 + progress * 60;
                CTX.strokeStyle = '#22d3ee';
                CTX.lineWidth = Math.max(1, 3 - progress * 4);
                CTX.setLineDash([8, 4]);
                CTX.beginPath();
                CTX.arc(drawX, drawY, deployRadius, 0, Math.PI * 2);
                CTX.stroke();
                CTX.setLineDash([]);
                
                // Clone silhouettes appearing
                const cloneCount = f.text.includes('CLONE ARMY') ? 6 : 4;
                for (let i = 0; i < cloneCount; i++) {
                    const cloneAngle = (Math.PI * 2 / cloneCount) * i + f.life * 0.02;
                    const cloneDist = deployRadius * 0.7;
                    const cx = drawX + Math.cos(cloneAngle) * cloneDist;
                    const cy = drawY + Math.sin(cloneAngle) * cloneDist;
                    
                    // Tank silhouette (simplified)
                    CTX.fillStyle = 'rgba(34, 211, 238, 0.6)';
                    CTX.fillRect(cx - 5, cy - 3, 10, 6);
                    CTX.fillRect(cx - 2, cy - 5, 7, 4);
                }
                
                // Data stream particles
                for (let i = 0; i < 8; i++) {
                    const dataAngle = (Math.PI * 2 / 8) * i + f.life * 0.05;
                    const dataDist = 10 + progress * 50 + Math.sin(f.life * 0.2 + i) * 10;
                    const dx = drawX + Math.cos(dataAngle) * dataDist;
                    const dy = drawY + Math.sin(dataAngle) * dataDist;
                    
                    CTX.fillStyle = i % 2 === 0 ? '#22d3ee' : '#ffffff';
                    CTX.fillRect(dx - 1, dy - 1, 2, 2);
                }
            }
        }
        
        // Extra effects for damage numbers
        if (isDamage && progress < 0.3) {
            // Small impact sparks around damage text
            CTX.globalAlpha = fadeAlpha * 0.6 * (1 - progress * 3);
            for (let i = 0; i < 3; i++) {
                const sparkAngle = (Math.PI * 2 / 3) * i + progress * Math.PI * 2;
                const sparkDist = 15 + progress * 20;
                const sparkX = drawX + Math.cos(sparkAngle) * sparkDist;
                const sparkY = drawY + Math.sin(sparkAngle) * sparkDist;
                CTX.fillStyle = f.text.startsWith('-') ? '#ff6666' : '#66ff66';
                CTX.beginPath();
                CTX.arc(sparkX, sparkY, 2 - progress * 2, 0, Math.PI * 2);
                CTX.fill();
            }
        }
        
        // BOSS EFFECT dramatic dark fire visual effects
        if (isBossEffect && progress < 0.7) {
            // Dark fire ring expanding
            CTX.globalAlpha = fadeAlpha * 0.6 * (1 - progress * 1.3);
            const ringRadius = 15 + progress * 80;
            
            // Multiple concentric rings with purple/orange gradient
            for (let r = 0; r < 3; r++) {
                const rOffset = r * 15;
                const actualRingRadius = Math.max(1, ringRadius - rOffset); // Ensure radius is always positive
                const ringColor = r === 0 ? '#a855f7' : (r === 1 ? '#ff6600' : '#8b0000');
                CTX.strokeStyle = ringColor;
                CTX.lineWidth = Math.max(0.5, 3 - progress * 2 - r * 0.5); // Ensure lineWidth is positive
                CTX.beginPath();
                CTX.arc(drawX, drawY, actualRingRadius, 0, Math.PI * 2);
                CTX.stroke();
            }
            
            // Dark fire sparks - purple and orange flames
            CTX.globalAlpha = fadeAlpha * 0.9 * (1 - progress * 1.2);
            const flameCount = f.text.includes('AWAKENED') ? 16 : (f.text.includes('CURSED') ? 12 : 8);
            for (let i = 0; i < flameCount; i++) {
                const flameAngle = (Math.PI * 2 / flameCount) * i + progress * Math.PI * 4;
                const flameDist = 30 + progress * 60 + Math.sin(f.life * 0.5 + i) * 10;
                const flameX = drawX + Math.cos(flameAngle) * flameDist;
                const flameY = drawY + Math.sin(flameAngle) * flameDist;
                
                // Alternating dark fire colors: purple, orange, dark red
                const colorIndex = i % 3;
                CTX.fillStyle = colorIndex === 0 ? '#a855f7' : (colorIndex === 1 ? '#ff6600' : '#8b0000');
                
                // Flame-shaped particles
                CTX.beginPath();
                const flameSize = Math.max(0.5, 4 - progress * 3); // Ensure size is always positive
                CTX.arc(flameX, flameY, flameSize, 0, Math.PI * 2);
                CTX.fill();
                
                // Flame trail
                const trailX = drawX + Math.cos(flameAngle) * (flameDist - 20);
                const trailY = drawY + Math.sin(flameAngle) * (flameDist - 20);
                CTX.strokeStyle = CTX.fillStyle;
                CTX.lineWidth = 2 - progress * 1.5;
                CTX.beginPath();
                CTX.moveTo(trailX, trailY);
                CTX.lineTo(flameX, flameY);
                CTX.stroke();
            }
            
            // Central dark flash for AWAKENED or ANNIHILATION
            if ((f.text.includes('AWAKENED') || f.text.includes('ANNIHILATION')) && progress < 0.2) {
                CTX.globalAlpha = (0.2 - progress) * 3;
                // Dark purple to red gradient flash
                const gradient = CTX.createRadialGradient(drawX, drawY, 0, drawX, drawY, 60 - progress * 150);
                gradient.addColorStop(0, '#ffffff');
                gradient.addColorStop(0.3, '#a855f7');
                gradient.addColorStop(0.6, '#ff0000');
                gradient.addColorStop(1, 'rgba(139, 0, 0, 0)');
                CTX.fillStyle = gradient;
                CTX.beginPath();
                CTX.arc(drawX, drawY, 60 - progress * 150, 0, Math.PI * 2);
                CTX.fill();
            }
            
            // Skull flash for CURSED text
            if (f.text.includes('CURSED') && progress < 0.25) {
                CTX.globalAlpha = (0.25 - progress) * 3 * fadeAlpha;
                CTX.font = 'bold 24px Arial';
                CTX.fillStyle = '#a855f7';
                CTX.fillText('💀', drawX - 12, drawY + 35);
            }
        }
        
        // Extra effects for score numbers
        if (isScore && progress < 0.5) {
            // Rising sparkles
            CTX.globalAlpha = fadeAlpha * 0.5 * (1 - progress * 2);
            for (let i = 0; i < 4; i++) {
                const sparkX = drawX + (Math.random() - 0.5) * 30;
                const sparkY = drawY - progress * 40 - i * 5;
                CTX.fillStyle = '#ffcc00';
                CTX.beginPath();
                CTX.arc(sparkX, sparkY, 1.5, 0, Math.PI * 2);
                CTX.fill();
            }
        }
        
        CTX.restore();
        
        // Update position - non-linear movement for interest
        const speedMultiplier = isCriticalHit ? (0.8 - progress * 0.3) : (isDamage ? (1.5 - progress * 0.5) : (isStatus ? 0.3 : 0.5));
        f.y -= speedMultiplier;
        f.life--;
    }

    CTX.restore();
    
    // Draw fog of war vignette effect
    drawFogOfWarVignette();
    
    drawMinimap();
    
    // Draw FPS counter HUD at the very end (on top of everything)
    // Only renders during active gameplay - canvas-based, not DOM
    if (typeof drawFPSCounterHUD === 'function') {
        drawFPSCounterHUD();
    }
}

// Draw fog of war effect - creates immersive battlefield atmosphere with animated fog
// Covers entire screen evenly with smooth rounded corners, dramatic and suspenseful
function drawFogOfWarVignette() {
    const w = CANVAS.width;
    const h = CANVAS.height;
    const time = typeof frame !== 'undefined' ? frame : Date.now() * 0.06;
    
    // Adaptive sizing for landscape/portrait
    const baseSize = Math.min(w, h);
    const maxSize = Math.max(w, h);
    const isLandscape = w > h;
    
    CTX.save();
    
    // === LAYER 1: Base fog coverage - entire screen with uniform density ===
    // Creates atmospheric haze across the whole battlefield
    CTX.globalAlpha = 0.12;
    CTX.fillStyle = 'rgb(15, 20, 35)';
    CTX.fillRect(0, 0, w, h);
    
    // === LAYER 2: Animated fog wisps - flowing across screen ===
    // Multiple fog layers moving at different speeds for depth
    const fogLayers = [
        { speed: 0.0003, scale: 0.8, alpha: 0.08, yOffset: 0 },
        { speed: 0.0005, scale: 1.2, alpha: 0.06, yOffset: h * 0.3 },
        { speed: 0.0004, scale: 1.0, alpha: 0.07, yOffset: h * 0.6 }
    ];
    
    fogLayers.forEach((fog, index) => {
        const xOffset = (time * fog.speed * w) % (w * 2) - w * 0.5;
        const waveY = Math.sin(time * 0.008 + index) * 20;
        
        // Create flowing fog gradient
        const fogGrad = CTX.createLinearGradient(
            xOffset, fog.yOffset + waveY,
            xOffset + w * fog.scale, fog.yOffset + h * 0.4 + waveY
        );
        fogGrad.addColorStop(0, 'rgba(20, 25, 40, 0)');
        fogGrad.addColorStop(0.3, `rgba(25, 30, 50, ${fog.alpha})`);
        fogGrad.addColorStop(0.5, `rgba(30, 35, 55, ${fog.alpha * 1.2})`);
        fogGrad.addColorStop(0.7, `rgba(25, 30, 50, ${fog.alpha})`);
        fogGrad.addColorStop(1, 'rgba(20, 25, 40, 0)');
        
        CTX.globalAlpha = 1;
        CTX.fillStyle = fogGrad;
        CTX.fillRect(0, 0, w, h);
    });
    
    // === LAYER 3: Fog density clouds - scattered across screen ===
    // Creates patches of denser fog for visual interest
    const cloudCount = isLandscape ? 8 : 6;
    for (let i = 0; i < cloudCount; i++) {
        const cloudX = (w * (i / cloudCount) + Math.sin(time * 0.005 + i * 2) * w * 0.1) % w;
        const cloudY = (h * ((i * 0.618) % 1) + Math.cos(time * 0.004 + i) * h * 0.08);
        const cloudSize = baseSize * (0.2 + Math.sin(time * 0.003 + i * 1.5) * 0.05);
        const cloudAlpha = 0.04 + Math.sin(time * 0.006 + i * 0.8) * 0.02;
        
        const cloudGrad = CTX.createRadialGradient(
            cloudX, cloudY, 0,
            cloudX, cloudY, cloudSize
        );
        cloudGrad.addColorStop(0, `rgba(25, 35, 55, ${cloudAlpha})`);
        cloudGrad.addColorStop(0.4, `rgba(20, 30, 50, ${cloudAlpha * 0.6})`);
        cloudGrad.addColorStop(0.7, `rgba(15, 25, 45, ${cloudAlpha * 0.3})`);
        cloudGrad.addColorStop(1, 'rgba(15, 25, 45, 0)');
        
        CTX.fillStyle = cloudGrad;
        CTX.fillRect(0, 0, w, h);
    }
    
    // === LAYER 4: Edge darkening with rounded corners ===
    // Smooth gradient from edges with consistent coverage, rounded at corners
    const edgeSize = baseSize * 0.25;
    const cornerRadius = baseSize * 0.15;
    
    // Create rounded rectangle path for soft edge masking
    CTX.globalCompositeOperation = 'source-over';
    
    // Top edge fog
    const topGrad = CTX.createLinearGradient(0, 0, 0, edgeSize);
    topGrad.addColorStop(0, 'rgba(10, 15, 30, 0.35)');
    topGrad.addColorStop(0.5, 'rgba(10, 15, 30, 0.15)');
    topGrad.addColorStop(1, 'rgba(10, 15, 30, 0)');
    CTX.fillStyle = topGrad;
    CTX.fillRect(0, 0, w, edgeSize);
    
    // Bottom edge fog
    const bottomGrad = CTX.createLinearGradient(0, h - edgeSize, 0, h);
    bottomGrad.addColorStop(0, 'rgba(10, 15, 30, 0)');
    bottomGrad.addColorStop(0.5, 'rgba(10, 15, 30, 0.15)');
    bottomGrad.addColorStop(1, 'rgba(10, 15, 30, 0.35)');
    CTX.fillStyle = bottomGrad;
    CTX.fillRect(0, h - edgeSize, w, edgeSize);
    
    // Left edge fog
    const leftGrad = CTX.createLinearGradient(0, 0, edgeSize, 0);
    leftGrad.addColorStop(0, 'rgba(10, 15, 30, 0.35)');
    leftGrad.addColorStop(0.5, 'rgba(10, 15, 30, 0.15)');
    leftGrad.addColorStop(1, 'rgba(10, 15, 30, 0)');
    CTX.fillStyle = leftGrad;
    CTX.fillRect(0, 0, edgeSize, h);
    
    // Right edge fog
    const rightGrad = CTX.createLinearGradient(w - edgeSize, 0, w, 0);
    rightGrad.addColorStop(0, 'rgba(10, 15, 30, 0)');
    rightGrad.addColorStop(0.5, 'rgba(10, 15, 30, 0.15)');
    rightGrad.addColorStop(1, 'rgba(10, 15, 30, 0.35)');
    CTX.fillStyle = rightGrad;
    CTX.fillRect(w - edgeSize, 0, edgeSize, h);
    
    // === LAYER 5: Rounded corner fog patches ===
    // Soft circular gradients at corners for rounded appearance
    const corners = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: 0, y: h },
        { x: w, y: h }
    ];
    
    corners.forEach(corner => {
        const cornerGrad = CTX.createRadialGradient(
            corner.x, corner.y, 0,
            corner.x, corner.y, cornerRadius * 2
        );
        cornerGrad.addColorStop(0, 'rgba(8, 12, 25, 0.4)');
        cornerGrad.addColorStop(0.4, 'rgba(10, 15, 30, 0.25)');
        cornerGrad.addColorStop(0.7, 'rgba(12, 18, 35, 0.1)');
        cornerGrad.addColorStop(1, 'rgba(15, 20, 40, 0)');
        
        CTX.fillStyle = cornerGrad;
        CTX.fillRect(0, 0, w, h);
    });
    
    // === LAYER 6: Subtle pulsing atmosphere ===
    // Adds tension with slow breathing effect
    const pulseAlpha = 0.02 + Math.sin(time * 0.015) * 0.015;
    CTX.globalAlpha = pulseAlpha;
    CTX.fillStyle = 'rgb(20, 25, 45)';
    CTX.fillRect(0, 0, w, h);
    
    // === LAYER 7: Particle dust motes floating in fog ===
    // Small animated particles for depth and atmosphere
    CTX.globalAlpha = 1;
    const particleCount = isLandscape ? 15 : 10;
    for (let i = 0; i < particleCount; i++) {
        const px = (w * ((i * 0.73 + time * 0.00005 * (i + 1)) % 1));
        const py = (h * ((i * 0.41 + Math.sin(time * 0.008 + i) * 0.1) % 1));
        const pSize = 1 + Math.sin(time * 0.01 + i * 2) * 0.5;
        const pAlpha = 0.15 + Math.sin(time * 0.012 + i * 1.5) * 0.1;
        
        CTX.beginPath();
        CTX.arc(px, py, pSize, 0, Math.PI * 2);
        CTX.fillStyle = `rgba(180, 190, 210, ${pAlpha})`;
        CTX.fill();
    }
    
    // === LAYER 8: Central visibility zone - subtle clear area ===
    // Player's immediate area has slightly better visibility
    const centerX = w / 2;
    const centerY = h / 2;
    const clearRadius = baseSize * 0.35;
    
    const clearGrad = CTX.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, clearRadius
    );
    clearGrad.addColorStop(0, 'rgba(255, 255, 250, 0.03)');
    clearGrad.addColorStop(0.4, 'rgba(255, 255, 250, 0.015)');
    clearGrad.addColorStop(0.7, 'rgba(255, 255, 250, 0.005)');
    clearGrad.addColorStop(1, 'rgba(255, 255, 250, 0)');
    
    CTX.fillStyle = clearGrad;
    CTX.fillRect(0, 0, w, h);
    
    CTX.restore();
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

    MINI_CTX.fillStyle = '#37474f'; // Dark blue-gray to match actual wall color
    for (let w of walls) if (w.x > -100) MINI_CTX.fillRect(w.x, w.y, w.w, w.h);
    MINI_CTX.fillStyle = '#c0c0c0'; // Silver to match crate visual
    for (let c of crates) MINI_CTX.fillRect(c.x, c.y, c.w, c.h);

    // === WEAPON PICKUPS ON MINIMAP ===
    // Show ONLY weapon drops with hexagon icons in weapon-specific colors
    // Weapons blink softly to attract attention - other items are NOT shown
    if (typeof pickups !== 'undefined' && pickups.length > 0) {
        for (const pickup of pickups) {
            if (!pickup || !pickup.type) continue;
            
            const dropId = pickup.type.id || '';
            const isWeapon = WEAPONS && WEAPONS[dropId];
            
            // Only show weapon drops on minimap, skip other items
            if (!isWeapon) continue;
            
            // Get color from weapon definition
            const dropColor = WEAPONS[dropId].color || pickup.type.c || '#ffffff';
            
            // Calculate pickup position
            const px = pickup.x;
            const py = pickup.y + (pickup.floatY || 0);
            
            // Soft blinking effect for weapons
            const blinkSpeed = 0.06;
            const blinkIntensity = 0.35;
            const blinkAlpha = 0.65 + Math.sin(frame * blinkSpeed) * blinkIntensity;
            
            MINI_CTX.save();
            MINI_CTX.translate(px, py);
            
            // Hexagon size for weapons
            const hexSize = 45;
            
            // Outer glow ring (pulsing) for weapon drops
            const glowPulse = 0.35 + Math.sin(frame * 0.08) * 0.2;
            
            MINI_CTX.strokeStyle = `rgba(${hexToRgb(dropColor)}, ${glowPulse})`;
            MINI_CTX.lineWidth = 10;
            MINI_CTX.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 2;
                const hx = Math.cos(angle) * (hexSize + 12);
                const hy = Math.sin(angle) * (hexSize + 12);
                if (i === 0) MINI_CTX.moveTo(hx, hy);
                else MINI_CTX.lineTo(hx, hy);
            }
            MINI_CTX.closePath();
            MINI_CTX.stroke();
            
            // Main hexagon body with blinking effect
            MINI_CTX.globalAlpha = blinkAlpha;
            MINI_CTX.fillStyle = dropColor;
            MINI_CTX.strokeStyle = lightenColor(dropColor, 0.3);
            MINI_CTX.lineWidth = 5;
            
            // Draw hexagon shape
            MINI_CTX.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 2;
                const hx = Math.cos(angle) * hexSize;
                const hy = Math.sin(angle) * hexSize;
                if (i === 0) MINI_CTX.moveTo(hx, hy);
                else MINI_CTX.lineTo(hx, hy);
            }
            MINI_CTX.closePath();
            MINI_CTX.fill();
            MINI_CTX.stroke();
            
            // Inner highlight for depth
            MINI_CTX.globalAlpha = blinkAlpha * 0.6;
            MINI_CTX.fillStyle = lightenColor(dropColor, 0.5);
            MINI_CTX.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 2;
                const hx = Math.cos(angle) * (hexSize * 0.5);
                const hy = Math.sin(angle) * (hexSize * 0.5);
                if (i === 0) MINI_CTX.moveTo(hx, hy);
                else MINI_CTX.lineTo(hx, hy);
            }
            MINI_CTX.closePath();
            MINI_CTX.fill();
            
            MINI_CTX.globalAlpha = 1;
            MINI_CTX.restore();
        }
    }

    for (let e of enemies) {
        // Skip enemies that are dying (in death sequence during demo)
        if (e.isDying) continue;
        
        if (e.spawnWarmup > 0) {
            const spawnProgress = 1 - (e.spawnWarmup / (e.spawnWarmupMax || SPAWN_WARMUP_FRAMES));
            MINI_CTX.save();
            MINI_CTX.strokeStyle = `rgba(255, 255, 255, ${0.2 + 0.4 * (1 - spawnProgress)})`;
            MINI_CTX.lineWidth = Math.max(0.5 / zoom, 0.5);
            MINI_CTX.beginPath();
            MINI_CTX.arc(e.x, e.y, 120 + spawnProgress * 160, 0, Math.PI * 2);
            MINI_CTX.stroke();
            MINI_CTX.restore();
        }
        // Use enemy body color (automatic from weapon color)
        const enemyWeapon = ENEMY_TIERS[e.id]?.weapon || 'cannon';
        const enemyTurretColor = WEAPONS[enemyWeapon]?.color || '#ffffff';
        const enemyBodyColor = lightenColor(enemyTurretColor, 0.7);
        MINI_CTX.fillStyle = enemyBodyColor;
        MINI_CTX.save();
        MINI_CTX.translate(e.x, e.y);
        MINI_CTX.rotate(Math.PI / 4);
        MINI_CTX.beginPath();
        MINI_CTX.rect(-35, -35, 70, 70);
        MINI_CTX.fill();
        MINI_CTX.restore();
    }

    // Draw player clones (ally tanks from CLONE ultimate) - green diamond indicators
    if (typeof playerClones !== 'undefined' && playerClones.length > 0) {
        for (const clone of playerClones) {
            if (!clone || clone.hp <= 0) continue;
            
            // Skip clones still in spawn animation (show faint ring instead)
            if (clone.spawnAnimation > 0) {
                const spawnProgress = 1 - (clone.spawnAnimation / 60);
                MINI_CTX.save();
                MINI_CTX.strokeStyle = `rgba(134, 239, 172, ${0.3 + 0.5 * spawnProgress})`;
                MINI_CTX.lineWidth = Math.max(0.8 / zoom, 0.8);
                MINI_CTX.beginPath();
                MINI_CTX.arc(clone.x, clone.y, 80 + spawnProgress * 60, 0, Math.PI * 2);
                MINI_CTX.stroke();
                MINI_CTX.restore();
                continue;
            }
            
            // Clone body - bright cyan diamond (ally color - distinct from player green and enemy red)
            MINI_CTX.save();
            MINI_CTX.translate(clone.x, clone.y);
            MINI_CTX.rotate(Math.PI / 4);
            
            // Outer glow ring (pulsing slightly) - cyan
            const pulseAlpha = 0.3 + Math.sin(frame * 0.1) * 0.15;
            MINI_CTX.strokeStyle = `rgba(34, 211, 238, ${pulseAlpha})`;
            MINI_CTX.lineWidth = 8;
            MINI_CTX.beginPath();
            MINI_CTX.rect(-40, -40, 80, 80);
            MINI_CTX.stroke();
            
            // Main body - solid cyan
            MINI_CTX.fillStyle = '#22d3ee';
            MINI_CTX.beginPath();
            MINI_CTX.rect(-32, -32, 64, 64);
            MINI_CTX.fill();
            
            // Inner darker core for depth - darker cyan
            MINI_CTX.fillStyle = '#0891b2';
            MINI_CTX.beginPath();
            MINI_CTX.rect(-18, -18, 36, 36);
            MINI_CTX.fill();
            
            // HP indicator - small arc around clone
            const hpRatio = clone.hp / clone.maxHp;
            const hpColor = hpRatio > 0.66 ? '#22c55e' : (hpRatio > 0.33 ? '#fbbf24' : '#ef4444');
            MINI_CTX.strokeStyle = hpColor;
            MINI_CTX.lineWidth = 4;
            MINI_CTX.beginPath();
            MINI_CTX.arc(0, 0, 50, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpRatio);
            MINI_CTX.stroke();
            
            MINI_CTX.restore();
        }
    }

    // Draw boss with dramatic pulsing skull/pentagon icon
    if (boss) {
        MINI_CTX.save();
        MINI_CTX.translate(boss.x, boss.y);
        
        // Pulsing effect
        const pulseScale = 1 + Math.sin(frame * 0.08) * 0.15;
        const bossSize = 90 * pulseScale;
        
        // Outer glow ring (pulsing)
        const glowAlpha = 0.3 + Math.sin(frame * 0.1) * 0.2;
        MINI_CTX.strokeStyle = `rgba(168, 85, 247, ${glowAlpha})`;
        MINI_CTX.lineWidth = 12;
        MINI_CTX.beginPath();
        MINI_CTX.arc(0, 0, bossSize + 20, 0, Math.PI * 2);
        MINI_CTX.stroke();
        
        // Pentagon shape (more dramatic than circle)
        MINI_CTX.fillStyle = '#1a0a2e';
        MINI_CTX.strokeStyle = '#a855f7';
        MINI_CTX.lineWidth = 6;
        MINI_CTX.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle = (Math.PI * 2 / 5) * i - Math.PI / 2 + boss.angle;
            const x = Math.cos(angle) * bossSize;
            const y = Math.sin(angle) * bossSize;
            if (i === 0) MINI_CTX.moveTo(x, y);
            else MINI_CTX.lineTo(x, y);
        }
        MINI_CTX.closePath();
        MINI_CTX.fill();
        MINI_CTX.stroke();
        
        // Inner skull/danger symbol
        MINI_CTX.fillStyle = '#ff3333';
        const skullSize = bossSize * 0.5;
        
        // Skull eyes
        MINI_CTX.beginPath();
        MINI_CTX.arc(-skullSize * 0.35, -skullSize * 0.1, skullSize * 0.22, 0, Math.PI * 2);
        MINI_CTX.arc(skullSize * 0.35, -skullSize * 0.1, skullSize * 0.22, 0, Math.PI * 2);
        MINI_CTX.fill();
        
        // Skull nose triangle
        MINI_CTX.beginPath();
        MINI_CTX.moveTo(0, skullSize * 0.1);
        MINI_CTX.lineTo(-skullSize * 0.12, skullSize * 0.35);
        MINI_CTX.lineTo(skullSize * 0.12, skullSize * 0.35);
        MINI_CTX.closePath();
        MINI_CTX.fill();
        
        // HP indicator ring
        const hpRatio = boss.hp / boss.maxHp;
        const hpColor = hpRatio > 0.66 ? '#22c55e' : (hpRatio > 0.33 ? '#f97316' : '#ef4444');
        MINI_CTX.strokeStyle = hpColor;
        MINI_CTX.lineWidth = 4;
        MINI_CTX.beginPath();
        MINI_CTX.arc(0, 0, bossSize - 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpRatio);
        MINI_CTX.stroke();
        
        MINI_CTX.restore();
    }

    MINI_CTX.restore();

    // Boss edge indicator - show arrow at minimap edge when boss is outside view
    if (boss) {
        const bossMinX = (boss.x - camX) * zoom + mapW / 2;
        const bossMinY = (boss.y - camY) * zoom + mapH / 2;
        
        // Check if boss is outside minimap view (with some margin)
        const margin = 15;
        const isOutside = bossMinX < margin || bossMinX > mapW - margin || 
                          bossMinY < margin || bossMinY > mapH - margin;
        
        if (isOutside) {
            // Clamp boss position to minimap edge
            const edgeX = Math.max(margin, Math.min(mapW - margin, bossMinX));
            const edgeY = Math.max(margin, Math.min(mapH - margin, bossMinY));
            
            // Calculate angle from center to boss for arrow direction
            const angleToBosse = Math.atan2(bossMinY - mapH / 2, bossMinX - mapW / 2);
            
            // Pulsing effect for visibility
            const pulse = 0.7 + Math.sin(frame * 0.15) * 0.3;
            const indicatorSize = 12 * pulse;
            
            MINI_CTX.save();
            MINI_CTX.translate(edgeX, edgeY);
            MINI_CTX.rotate(angleToBosse);
            
            // Outer glow
            MINI_CTX.shadowColor = '#a855f7';
            MINI_CTX.shadowBlur = 8;
            
            // Arrow pointing to boss direction
            MINI_CTX.fillStyle = `rgba(168, 85, 247, ${pulse})`;
            MINI_CTX.beginPath();
            MINI_CTX.moveTo(indicatorSize, 0);
            MINI_CTX.lineTo(-indicatorSize * 0.5, -indicatorSize * 0.6);
            MINI_CTX.lineTo(-indicatorSize * 0.3, 0);
            MINI_CTX.lineTo(-indicatorSize * 0.5, indicatorSize * 0.6);
            MINI_CTX.closePath();
            MINI_CTX.fill();
            
            // Removed ! symbol - just show the arrow
            // The arrow itself is distinctive enough
            
            MINI_CTX.shadowBlur = 0;
            MINI_CTX.restore();
        }
    }

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

// === RIVER BORDER RENDERING ===
// Beautiful animated river surrounding the battlefield that tanks cannot cross
function drawRiverBorder(frame) {
    const riverWidth = typeof RIVER_WIDTH !== 'undefined' ? RIVER_WIDTH : 80;
    
    // Only draw river sections visible on screen
    const margin = riverWidth + 50;
    const viewLeft = camX - margin;
    const viewRight = camX + CANVAS.width + margin;
    const viewTop = camY - margin;
    const viewBottom = camY + CANVAS.height + margin;
    
    // River water colors
    const time = frame * 0.02;
    const wavePulse = Math.sin(time) * 0.1;
    
    // Create water gradient
    const waterGradient = CTX.createLinearGradient(0, 0, riverWidth, 0);
    waterGradient.addColorStop(0, '#1a5f7a');
    waterGradient.addColorStop(0.3, '#2980b9');
    waterGradient.addColorStop(0.6, '#3498db');
    waterGradient.addColorStop(1, '#1a5f7a');
    
    CTX.save();
    
    // Base water color for all river areas
    const baseWaterColor = '#1a5f7a';
    
    // === BOTTOM RIVER ===
    if (viewBottom > WORLD_H - riverWidth) {
        // Deep water base - extend to edges for seamless corners
        const bottomGrad = CTX.createLinearGradient(0, WORLD_H - riverWidth, 0, WORLD_H + 200);
        bottomGrad.addColorStop(0, '#2980b9');
        bottomGrad.addColorStop(0.3, '#1a5f7a');
        bottomGrad.addColorStop(0.6, '#145369');
        bottomGrad.addColorStop(1, '#0d3b4c');
        CTX.fillStyle = bottomGrad;
        CTX.fillRect(-200, WORLD_H - riverWidth, WORLD_W + 400, riverWidth + 500);
        
        // Animated waves
        drawWaterWaves(Math.max(0, viewLeft), WORLD_H - riverWidth, Math.min(WORLD_W, viewRight) - Math.max(0, viewLeft), riverWidth, frame, 'horizontal');
        
        // Shore edge (grass/dirt meeting water) - only in playable area
        drawShoreEdge(riverWidth, WORLD_H - riverWidth - 8, WORLD_W - riverWidth * 2, 12, 'bottom');
    }
    
    // === TOP RIVER ===
    if (viewTop < riverWidth) {
        const topGrad = CTX.createLinearGradient(0, -200, 0, riverWidth);
        topGrad.addColorStop(0, '#0d3b4c');
        topGrad.addColorStop(0.4, '#145369');
        topGrad.addColorStop(0.7, '#1a5f7a');
        topGrad.addColorStop(1, '#2980b9');
        CTX.fillStyle = topGrad;
        CTX.fillRect(-200, -200, WORLD_W + 400, riverWidth + 200);
        
        drawWaterWaves(Math.max(0, viewLeft), 0, Math.min(WORLD_W, viewRight) - Math.max(0, viewLeft), riverWidth, frame, 'horizontal');
        drawShoreEdge(riverWidth, riverWidth - 4, WORLD_W - riverWidth * 2, 12, 'top');
    }
    
    // === LEFT RIVER ===
    if (viewLeft < riverWidth) {
        const leftGrad = CTX.createLinearGradient(-200, 0, riverWidth, 0);
        leftGrad.addColorStop(0, '#0d3b4c');
        leftGrad.addColorStop(0.4, '#145369');
        leftGrad.addColorStop(0.7, '#1a5f7a');
        leftGrad.addColorStop(1, '#2980b9');
        CTX.fillStyle = leftGrad;
        CTX.fillRect(-200, riverWidth, riverWidth + 200, WORLD_H - riverWidth * 2);
        
        drawWaterWaves(0, Math.max(riverWidth, viewTop), riverWidth, Math.min(WORLD_H - riverWidth, viewBottom) - Math.max(riverWidth, viewTop), frame, 'vertical');
        drawShoreEdge(riverWidth - 4, riverWidth, 12, WORLD_H - riverWidth * 2, 'left');
    }
    
    // === RIGHT RIVER ===
    if (viewRight > WORLD_W - riverWidth) {
        const rightGrad = CTX.createLinearGradient(WORLD_W - riverWidth, 0, WORLD_W + 200, 0);
        rightGrad.addColorStop(0, '#2980b9');
        rightGrad.addColorStop(0.3, '#1a5f7a');
        rightGrad.addColorStop(0.6, '#145369');
        rightGrad.addColorStop(1, '#0d3b4c');
        CTX.fillStyle = rightGrad;
        CTX.fillRect(WORLD_W - riverWidth, riverWidth, riverWidth + 500, WORLD_H - riverWidth * 2);
        
        drawWaterWaves(WORLD_W - riverWidth, Math.max(riverWidth, viewTop), riverWidth, Math.min(WORLD_H - riverWidth, viewBottom) - Math.max(riverWidth, viewTop), frame, 'vertical');
        drawShoreEdge(WORLD_W - riverWidth - 8, riverWidth, 12, WORLD_H - riverWidth * 2, 'right');
    }
    
    // Draw fog on far side of river (distant land visibility)
    drawRiverFog(riverWidth, viewLeft, viewRight, viewTop, viewBottom, time);
    
    CTX.restore();
}

// Draw animated water waves
function drawWaterWaves(x, y, width, height, frame, orientation) {
    const time = frame * 0.03;
    CTX.save();
    
    // Wave highlights (foam/light reflection)
    CTX.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    CTX.lineWidth = 2;
    
    if (orientation === 'horizontal') {
        // Horizontal waves for top/bottom rivers
        for (let wy = 0; wy < height; wy += 15) {
            CTX.beginPath();
            const waveOffset = Math.sin(time + wy * 0.1) * 20;
            for (let wx = 0; wx < width; wx += 30) {
                const waveY = y + wy + Math.sin(time + wx * 0.05 + wy * 0.1) * 3;
                if (wx === 0) CTX.moveTo(x + wx + waveOffset, waveY);
                else CTX.lineTo(x + wx + waveOffset, waveY);
            }
            CTX.stroke();
        }
    } else {
        // Vertical waves for left/right rivers
        for (let wx = 0; wx < width; wx += 15) {
            CTX.beginPath();
            const waveOffset = Math.sin(time + wx * 0.1) * 20;
            for (let wy = 0; wy < height; wy += 30) {
                const waveX = x + wx + Math.sin(time + wy * 0.05 + wx * 0.1) * 3;
                if (wy === 0) CTX.moveTo(waveX, y + wy + waveOffset);
                else CTX.lineTo(waveX, y + wy + waveOffset);
            }
            CTX.stroke();
        }
    }
    
    // Sparkle effects on water
    CTX.fillStyle = 'rgba(255, 255, 255, 0.6)';
    const sparkleCount = Math.floor((width * height) / 5000);
    for (let i = 0; i < sparkleCount; i++) {
        const sparklePhase = (time + i * 2.5) % 3;
        if (sparklePhase < 0.5) {
            const sx = x + (Math.sin(i * 12.34) * 0.5 + 0.5) * width;
            const sy = y + (Math.cos(i * 45.67) * 0.5 + 0.5) * height;
            const sparkleSize = 2 + sparklePhase * 4;
            CTX.beginPath();
            CTX.arc(sx, sy, sparkleSize, 0, Math.PI * 2);
            CTX.fill();
        }
    }
    
    // Ripple circles
    CTX.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    CTX.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
        const ripplePhase = ((time * 0.5 + i * 1.5) % 3) / 3;
        const rippleSize = ripplePhase * 40;
        const rippleAlpha = 1 - ripplePhase;
        if (rippleAlpha > 0.1) {
            CTX.globalAlpha = rippleAlpha * 0.3;
            const rx = x + width * (0.2 + i * 0.3);
            const ry = y + height * (0.3 + i * 0.2);
            CTX.beginPath();
            CTX.arc(rx, ry, rippleSize, 0, Math.PI * 2);
            CTX.stroke();
        }
    }
    CTX.globalAlpha = 1;
    
    CTX.restore();
}

// Draw fog effect on far side of river (distant land visibility)
function drawRiverFog(riverWidth, viewLeft, viewRight, viewTop, viewBottom, time) {
    const fogDepth = 60; // How deep the fog extends
    const fogAlpha = 0.6 + Math.sin(time * 0.5) * 0.1; // Subtle pulsing
    
    // Far land gradient color (darker, misty)
    const farLandColor = 'rgba(40, 60, 50, 0.8)';
    
    CTX.save();
    
    // Top fog (land beyond top river)
    if (viewTop < riverWidth) {
        const fogGrad = CTX.createLinearGradient(0, -fogDepth, 0, 10);
        fogGrad.addColorStop(0, 'rgba(60, 80, 70, 0.9)');
        fogGrad.addColorStop(0.3, 'rgba(50, 70, 60, 0.7)');
        fogGrad.addColorStop(0.6, 'rgba(40, 60, 50, 0.4)');
        fogGrad.addColorStop(1, 'rgba(30, 50, 45, 0)');
        CTX.fillStyle = fogGrad;
        CTX.fillRect(Math.max(-200, viewLeft), -200, Math.min(WORLD_W + 400, viewRight - viewLeft + 400), fogDepth + 200);
        
        // Distant trees/land silhouette
        CTX.fillStyle = 'rgba(30, 45, 35, 0.6)';
        for (let tx = Math.floor(viewLeft / 100) * 100; tx < viewRight; tx += 80 + Math.sin(tx * 0.01) * 30) {
            const treeH = 25 + Math.sin(tx * 0.05) * 15;
            const treeW = 20 + Math.cos(tx * 0.03) * 10;
            CTX.beginPath();
            CTX.moveTo(tx, -10);
            CTX.lineTo(tx - treeW / 2, -10 - treeH);
            CTX.lineTo(tx + treeW / 2, -10 - treeH);
            CTX.closePath();
            CTX.fill();
        }
    }
    
    // Bottom fog
    if (viewBottom > WORLD_H - riverWidth) {
        const fogGrad = CTX.createLinearGradient(0, WORLD_H - 10, 0, WORLD_H + fogDepth);
        fogGrad.addColorStop(0, 'rgba(30, 50, 45, 0)');
        fogGrad.addColorStop(0.4, 'rgba(40, 60, 50, 0.4)');
        fogGrad.addColorStop(0.7, 'rgba(50, 70, 60, 0.7)');
        fogGrad.addColorStop(1, 'rgba(60, 80, 70, 0.9)');
        CTX.fillStyle = fogGrad;
        CTX.fillRect(Math.max(-200, viewLeft), WORLD_H - 10, Math.min(WORLD_W + 400, viewRight - viewLeft + 400), fogDepth + 210);
        
        // Distant silhouette
        CTX.fillStyle = 'rgba(30, 45, 35, 0.6)';
        for (let tx = Math.floor(viewLeft / 100) * 100; tx < viewRight; tx += 80 + Math.sin(tx * 0.02) * 30) {
            const treeH = 25 + Math.cos(tx * 0.04) * 15;
            const treeW = 20 + Math.sin(tx * 0.02) * 10;
            CTX.beginPath();
            CTX.moveTo(tx, WORLD_H + 10);
            CTX.lineTo(tx - treeW / 2, WORLD_H + 10 + treeH);
            CTX.lineTo(tx + treeW / 2, WORLD_H + 10 + treeH);
            CTX.closePath();
            CTX.fill();
        }
    }
    
    // Left fog
    if (viewLeft < riverWidth) {
        const fogGrad = CTX.createLinearGradient(-fogDepth, 0, 10, 0);
        fogGrad.addColorStop(0, 'rgba(60, 80, 70, 0.9)');
        fogGrad.addColorStop(0.3, 'rgba(50, 70, 60, 0.7)');
        fogGrad.addColorStop(0.6, 'rgba(40, 60, 50, 0.4)');
        fogGrad.addColorStop(1, 'rgba(30, 50, 45, 0)');
        CTX.fillStyle = fogGrad;
        CTX.fillRect(-200, Math.max(-200, viewTop), fogDepth + 200, Math.min(WORLD_H + 400, viewBottom - viewTop + 400));
    }
    
    // Right fog
    if (viewRight > WORLD_W - riverWidth) {
        const fogGrad = CTX.createLinearGradient(WORLD_W - 10, 0, WORLD_W + fogDepth, 0);
        fogGrad.addColorStop(0, 'rgba(30, 50, 45, 0)');
        fogGrad.addColorStop(0.4, 'rgba(40, 60, 50, 0.4)');
        fogGrad.addColorStop(0.7, 'rgba(50, 70, 60, 0.7)');
        fogGrad.addColorStop(1, 'rgba(60, 80, 70, 0.9)');
        CTX.fillStyle = fogGrad;
        CTX.fillRect(WORLD_W - 10, Math.max(-200, viewTop), fogDepth + 210, Math.min(WORLD_H + 400, viewBottom - viewTop + 400));
    }
    
    CTX.restore();
}

// Draw shore edge where land meets water
function drawShoreEdge(x, y, width, height, side) {
    CTX.save();
    
    // Sandy/muddy shore edge
    const shoreGrad = CTX.createLinearGradient(
        side === 'left' ? x : x + width,
        side === 'top' ? y : y + height,
        side === 'right' ? x : x + width,
        side === 'bottom' ? y : y + height
    );
    shoreGrad.addColorStop(0, '#8B7355');
    shoreGrad.addColorStop(0.5, '#6B5344');
    shoreGrad.addColorStop(1, '#4A3728');
    
    CTX.fillStyle = shoreGrad;
    CTX.fillRect(x, y, width, height);
    
    // Add some shore debris/rocks
    CTX.fillStyle = '#5D4E37';
    if (side === 'top' || side === 'bottom') {
        for (let i = 0; i < width / 40; i++) {
            const rx = x + i * 40 + Math.sin(i * 7.89) * 15;
            const ry = y + (side === 'top' ? 2 : height - 5);
            CTX.beginPath();
            CTX.arc(rx, ry, 3 + Math.sin(i * 3.21) * 2, 0, Math.PI * 2);
            CTX.fill();
        }
    } else {
        for (let i = 0; i < height / 40; i++) {
            const rx = x + (side === 'left' ? width - 5 : 2);
            const ry = y + i * 40 + Math.sin(i * 7.89) * 15;
            CTX.beginPath();
            CTX.arc(rx, ry, 3 + Math.sin(i * 3.21) * 2, 0, Math.PI * 2);
            CTX.fill();
        }
    }
    
    CTX.restore();
}

// =============================================================================
// UNIFIED STATUS PANEL SYSTEM - Elegant, Dramatic Status Display
// All entities (player, enemy, clone, boss) use this for consistent styling
// Features: HP bar + status effects + particles + text labels + unified movement
// =============================================================================

// Status effect configurations with unique visual properties
const STATUS_EFFECT_CONFIG = {
    hp: {
        label: 'HP',
        colors: { fill: '#22c55e', bg: '#14532d', glow: '#4ade80', critical: '#ef4444' },
        particleColor: '#86efac',
        icon: '❤'
    },
    shield: {
        label: 'SHIELD',
        colors: { fill: '#00ffff', bg: '#0a4040', glow: '#40ffff', border: '#00cccc' },
        particleColor: '#a0ffff'
    },
    armor: {
        label: 'ARMOR',
        colors: { fill: '#6366f1', bg: '#1e1b4b', glow: '#818cf8', border: '#4f46e5' },
        particleColor: '#c7d2fe'
    },
    turbo: {
        label: 'TURBO',
        colors: { fill: '#ff6b00', bg: '#4a1c00', glow: '#ff9040', border: '#cc5500' },
        particleColor: '#ffccaa'
    },
    cloak: {
        label: 'CLOAK',
        colors: { fill: '#d946ef', bg: '#4a044e', glow: '#e879f9', border: '#c026d3' },
        particleColor: '#f5d0fe'
    },
    magnet: {
        label: 'MAGNET',
        colors: { fill: '#10b981', bg: '#064e3b', glow: '#34d399', border: '#059669' },
        particleColor: '#a7f3d0'
    },
    autoAim: {
        label: 'AUTO',
        colors: { fill: '#fbbf24', bg: '#78350f', glow: '#fcd34d', border: '#f59e0b' },
        particleColor: '#fef3c7'
    },
    rage: {
        label: 'RAGE',
        colors: { fill: '#ef4444', bg: '#450a0a', glow: '#f87171', border: '#dc2626' },
        particleColor: '#fecaca'
    },
    frozen: {
        label: 'FROZEN',
        colors: { fill: '#7dd3fc', bg: '#082f49', glow: '#bae6fd', border: '#38bdf8' },
        particleColor: '#e0f2fe'
    },
    burning: {
        label: 'BURN',
        colors: { fill: '#fb923c', bg: '#431407', glow: '#fdba74', border: '#f97316' },
        particleColor: '#ffedd5'
    },
    cursedBurn: {
        label: 'CURSED',
        colors: { fill: '#a855f7', bg: '#2e1065', glow: '#c084fc', border: '#9333ea' },
        particleColor: '#e9d5ff'
    },
    slowed: {
        label: 'SLOW',
        colors: { fill: '#2dd4bf', bg: '#134e4a', glow: '#5eead4', border: '#14b8a6' },
        particleColor: '#ccfbf1'
    },
    stunned: {
        label: 'STUN',
        colors: { fill: '#facc15', bg: '#422006', glow: '#fde047', border: '#eab308' },
        particleColor: '#fef9c3'
    },
    magicShield: {
        label: 'M.SHIELD',
        colors: { fill: '#a855f7', bg: '#3b0764', glow: '#c084fc', border: '#9333ea' },
        particleColor: '#e9d5ff'
    }
};

// Draw elegant status bar with particles and effects - NO EMOJI, larger text
function drawStatusBarEnhanced(ctx, x, y, width, height, progress, config, label, value, frame, isNegative = false) {
    const clampedProgress = Math.max(0, Math.min(1, progress));
    const fillWidth = width * clampedProgress;
    
    // Outer glow effect
    ctx.save();
    ctx.shadowColor = config.colors.glow;
    ctx.shadowBlur = 6 + Math.sin(frame * 0.1) * 2;
    
    // Background with rounded corners
    ctx.fillStyle = config.colors.bg;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Fill bar with gradient
    if (fillWidth > 0) {
        const grad = ctx.createLinearGradient(x, y, x + fillWidth, y);
        grad.addColorStop(0, config.colors.fill);
        grad.addColorStop(0.5, config.colors.glow);
        grad.addColorStop(1, config.colors.fill);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, fillWidth, height, 4);
        ctx.fill();
        
        // Shine effect on top
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.roundRect(x + 1, y + 1, Math.max(0, fillWidth - 2), height * 0.35, [3, 3, 0, 0]);
        ctx.fill();
        
        // Animated pulse at fill edge
        if (clampedProgress < 1 && clampedProgress > 0.05) {
            const pulseAlpha = 0.4 + Math.sin(frame * 0.2) * 0.2;
            ctx.fillStyle = `rgba(255, 255, 255, ${pulseAlpha})`;
            ctx.beginPath();
            ctx.arc(x + fillWidth - 2, y + height / 2, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    // Border
    ctx.strokeStyle = config.colors.border || config.colors.glow;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 4);
    ctx.stroke();
    
    ctx.restore();
    
    // No text labels - just clean bars
}

// Draw unified status panel for any entity
// screenX, screenY = screen coordinates (after camera transform)
// entity = object with hp, maxHp, shieldTime, armor, etc.
// entityType = 'player', 'enemy', 'clone', 'boss'
function drawUnifiedStatusPanel(screenX, screenY, entity, entityType, frame) {
    const PANEL_WIDTH = entityType === 'boss' ? 100 : 50;
    const BAR_HEIGHT = entityType === 'boss' ? 10 : 6;
    const BAR_GAP = entityType === 'boss' ? 5 : 4;
    
    // Collect all active status effects (NOT including HP for player)
    const statusBars = [];
    
    // HP Bar - only for enemy, clone, boss (NOT player in normal game)
    // In DEMO mode, player also shows HP bar above tank for visibility
    // Each entity type has distinct colors: enemy=red gradient, clone=green gradient, boss=purple gradient
    const showPlayerHpBar = entityType === 'player' && typeof demoActive !== 'undefined' && demoActive === true;
    if (entityType !== 'player' || showPlayerHpBar) {
        const hpRatio = entity.hp / Math.max(1, entity.maxHp);
        
        // Create entity-specific HP bar colors (NOT based on HP ratio)
        // This ensures visual distinction between different entity types
        let hpConfig;
        
        if (entityType === 'player') {
            // Player tank in demo: Green gradient - same as clone for friendly look
            hpConfig = {
                label: 'HP',
                colors: {
                    fill: hpRatio < 0.25 ? '#15803d' : '#22c55e',     // Green, darker when critical
                    bg: '#14532d',                                     // Dark green background
                    glow: hpRatio < 0.25 ? '#86efac' : '#4ade80',     // Green glow
                    border: '#16a34a'                                  // Green border
                },
                particleColor: '#bbf7d0',
                icon: '❤'
            };
        } else if (entityType === 'enemy') {
            // Enemy tanks: Red/Orange gradient - hostile aggressive look
            hpConfig = {
                label: 'HP',
                colors: {
                    fill: hpRatio < 0.25 ? '#dc2626' : '#ef4444',     // Bright red, darker when critical
                    bg: '#450a0a',                                     // Dark red background
                    glow: hpRatio < 0.25 ? '#fca5a5' : '#f87171',     // Red glow
                    border: '#b91c1c'                                  // Red border
                },
                particleColor: '#fecaca',
                icon: '❤'
            };
        } else if (entityType === 'clone') {
            // Clone tanks: Green/Teal gradient - ally friendly look
            hpConfig = {
                label: 'HP',
                colors: {
                    fill: hpRatio < 0.25 ? '#15803d' : '#22c55e',     // Green, darker when critical
                    bg: '#14532d',                                     // Dark green background
                    glow: hpRatio < 0.25 ? '#86efac' : '#4ade80',     // Green glow
                    border: '#16a34a'                                  // Green border
                },
                particleColor: '#bbf7d0',
                icon: '❤'
            };
        } else if (entityType === 'boss') {
            // Boss tanks: Purple/Magenta gradient - epic threatening look
            hpConfig = {
                label: 'HP',
                colors: {
                    fill: hpRatio < 0.25 ? '#7c3aed' : '#a855f7',     // Purple, deeper when critical
                    bg: '#2e1065',                                     // Dark purple background
                    glow: hpRatio < 0.25 ? '#c4b5fd' : '#c084fc',     // Purple glow
                    border: '#8b5cf6'                                  // Purple border
                },
                particleColor: '#e9d5ff',
                icon: '💀'
            };
        } else {
            // Fallback to default green
            hpConfig = {
                label: 'HP',
                colors: { 
                    fill: '#22c55e', 
                    bg: '#14532d', 
                    glow: '#4ade80', 
                    border: '#16a34a' 
                },
                particleColor: '#86efac',
                icon: '❤'
            };
        }
        
        statusBars.push({
            type: 'hp',
            config: hpConfig,
            progress: hpRatio,
            label: 'HP',
            value: Math.ceil(entity.hp) + '/' + Math.ceil(entity.maxHp)
        });
    }
    
    // Shield bar
    if (entity.shieldTime && entity.shieldTime > 0) {
        // Different max shield based on entity type
        // Player shield from pickup is 1200 frames (20s), from berserker ultimate is duration+60
        let maxShield = 1200; // Default for player (matches shield pickup duration)
        if (entityType === 'boss') maxShield = 600;
        else if (entityType === 'clone') maxShield = 1200; // Clone shield matches player (20 seconds)
        
        statusBars.push({
            type: 'shield',
            config: STATUS_EFFECT_CONFIG.shield,
            progress: Math.min(1, entity.shieldTime / maxShield),
            label: 'SHIELD',
            value: Math.ceil(entity.shieldTime / 60) + 's'
        });
    }
    
    // Armor bar
    if (entity.armor && entity.armor > 0) {
        statusBars.push({
            type: 'armor',
            config: STATUS_EFFECT_CONFIG.armor,
            progress: Math.min(1, entity.armor / Math.max(1, entity.maxArmor || 100)),
            label: 'ARMOR',
            value: Math.ceil(entity.armor)
        });
    }
    
    // Player-specific effects
    if (entityType === 'player') {
        // Turbo
        if (entity.turboActive && entity.turboTime > 0) {
            statusBars.push({
                type: 'turbo',
                config: STATUS_EFFECT_CONFIG.turbo,
                progress: entity.turboTime / Math.max(1, entity.turboDuration || 420),
                label: 'TURBO',
                value: Math.ceil(entity.turboTime / 60) + 's'
            });
        }
        
        // Cloak/Stealth
        if (entity.invisible && entity.invisibleTime > 0) {
            statusBars.push({
                type: 'cloak',
                config: STATUS_EFFECT_CONFIG.cloak,
                progress: entity.invisibleTime / 600,
                label: 'CLOAK',
                value: Math.ceil(entity.invisibleTime / 60) + 's'
            });
        }
        
        // Magnet
        if (entity.magnetActive && entity.magnetTime > 0) {
            statusBars.push({
                type: 'magnet',
                config: STATUS_EFFECT_CONFIG.magnet,
                progress: entity.magnetTime / 600,
                label: 'MAGNET',
                value: Math.ceil(entity.magnetTime / 60) + 's'
            });
        }
        
        // Auto-Aim
        if (entity.autoAim && entity.autoAimShots > 0) {
            statusBars.push({
                type: 'autoAim',
                config: STATUS_EFFECT_CONFIG.autoAim,
                progress: entity.autoAimShots / Math.max(1, entity.autoAimMaxShots || 10),
                label: 'AUTO',
                value: 'x' + entity.autoAimShots
            });
        }
        
        // Rage
        if (entity.rage && entity.rage > 0) {
            statusBars.push({
                type: 'rage',
                config: STATUS_EFFECT_CONFIG.rage,
                progress: Math.min(1, entity.rage / 100),
                label: 'RAGE',
                value: Math.ceil(entity.rage) + '%'
            });
        }
        
        // Note: Cursed Burn is a permanent effect and doesn't need a status bar
    }
    
    // Enemy/Clone debuff effects
    if (entityType === 'enemy' || entityType === 'clone') {
        // Frozen
        if (entity.frozenTime && entity.frozenTime > 0) {
            statusBars.push({
                type: 'frozen',
                config: STATUS_EFFECT_CONFIG.frozen,
                progress: Math.min(1, entity.frozenTime / 180),
                label: 'FROZEN',
                value: Math.ceil(entity.frozenTime / 60) + 's'
            });
        }
        
        // Burning
        if (entity.burningTime && entity.burningTime > 0) {
            statusBars.push({
                type: 'burning',
                config: STATUS_EFFECT_CONFIG.burning,
                progress: Math.min(1, entity.burningTime / 300),
                label: 'BURN',
                value: Math.ceil(entity.burningTime / 60) + 's'
            });
        }
        
        // Slowed
        if (entity.slowedTime && entity.slowedTime > 0) {
            statusBars.push({
                type: 'slowed',
                config: STATUS_EFFECT_CONFIG.slowed,
                progress: Math.min(1, entity.slowedTime / 180),
                label: 'SLOW',
                value: Math.ceil(entity.slowedTime / 60) + 's'
            });
        }
        
        // Stunned
        if (entity.stunnedTime && entity.stunnedTime > 0) {
            statusBars.push({
                type: 'stunned',
                config: STATUS_EFFECT_CONFIG.stunned,
                progress: Math.min(1, entity.stunnedTime / 120),
                label: 'STUN',
                value: Math.ceil(entity.stunnedTime / 60) + 's'
            });
        }
        
        // Magic Shield (enemy only) - shows when magic shield is active
        if (entity.magicShieldActive && entity.magicShieldHP > 0) {
            const shieldProgress = entity.magicShieldHP / Math.max(1, entity.magicShieldMaxHP || 1);
            statusBars.push({
                type: 'magicShield',
                config: STATUS_EFFECT_CONFIG.magicShield,
                progress: shieldProgress,
                label: 'M.SHIELD',
                value: Math.ceil(entity.magicShieldHP)
            });
        }
    }
    
    // If no status bars, still show entity label for player, then return
    if (statusBars.length === 0) {
        // Player always shows "YOURS" label even without bars
        if (entityType === 'player') {
            const LABEL_HEIGHT = 12;
            const labelY = screenY - 45 - LABEL_HEIGHT + 6;
            
            CTX.save();
            
            // Draw "YOURS" label with dramatic glow effect
            const pulse = 1 + Math.sin(frame * 0.08) * 0.3 * 0.3;
            
            CTX.font = 'bold 8px Arial';
            CTX.textAlign = 'center';
            CTX.textBaseline = 'middle';
            
            // Outer glow
            CTX.shadowColor = '#22c55e';
            CTX.shadowBlur = 8 * pulse;
            CTX.fillStyle = '#4ade80';
            CTX.fillText('YOURS', screenX, labelY);
            
            // Inner brighter text
            CTX.shadowBlur = 4;
            CTX.fillStyle = '#ffffff';
            CTX.globalAlpha = 0.7;
            CTX.fillText('YOURS', screenX, labelY);
            CTX.globalAlpha = 1;
            CTX.shadowBlur = 0;
            
            CTX.restore();
        }
        return;
    }
    
    // Reorder: HP always at bottom, other effects stack above
    // HP is already first in array, so we reverse the non-HP bars to stack upward
    const hpBar = statusBars.find(b => b.type === 'hp');
    const otherBars = statusBars.filter(b => b.type !== 'hp');
    const orderedBars = hpBar ? [hpBar, ...otherBars] : otherBars;
    
    // Calculate panel dimensions - NO background box
    const LABEL_HEIGHT = 12;
    const totalBarsHeight = orderedBars.length * (BAR_HEIGHT + BAR_GAP) - BAR_GAP;
    const panelX = screenX - PANEL_WIDTH / 2;
    const panelY = screenY - 45 - totalBarsHeight - LABEL_HEIGHT;
    
    CTX.save();
    
    // Entity type label at top - elegant and dramatic styling
    let entityLabel = '';
    let labelColor = '#ffffff';
    let glowColor = '#ffffff';
    let pulseIntensity = 0;
    
    if (entityType === 'player') {
        entityLabel = 'YOURS';
        labelColor = '#4ade80';
        glowColor = '#22c55e';
        pulseIntensity = 0.3;
    } else if (entityType === 'clone') {
        entityLabel = 'ALLY';
        labelColor = '#86efac';
        glowColor = '#4ade80';
        pulseIntensity = 0.2;
    } else if (entityType === 'enemy') {
        entityLabel = 'ENEMY';
        labelColor = '#f87171';
        glowColor = '#ef4444';
        pulseIntensity = 0.4;
    } else if (entityType === 'boss') {
        entityLabel = 'BOSS';
        labelColor = '#fbbf24';
        glowColor = '#f59e0b';
        pulseIntensity = 0.5;
    }
    
    // Draw entity label with dramatic glow effect
    const labelY = panelY + 6;
    const pulse = 1 + Math.sin(frame * 0.08) * pulseIntensity * 0.3;
    
    // Glow layers for dramatic effect
    CTX.font = 'bold 8px Arial';
    CTX.textAlign = 'center';
    CTX.textBaseline = 'middle';
    
    // Outer glow
    CTX.shadowColor = glowColor;
    CTX.shadowBlur = 8 * pulse;
    CTX.fillStyle = labelColor;
    CTX.fillText(entityLabel, screenX, labelY);
    
    // Inner brighter text
    CTX.shadowBlur = 4;
    CTX.fillStyle = '#ffffff';
    CTX.globalAlpha = 0.7;
    CTX.fillText(entityLabel, screenX, labelY);
    CTX.globalAlpha = 1;
    CTX.shadowBlur = 0;
    
    // Draw each status bar - HP at bottom (first in draw order = bottom position)
    orderedBars.forEach((bar, index) => {
        // Draw from top to bottom, so HP (index 0) ends up at bottom visually
        const barY = panelY + LABEL_HEIGHT + (orderedBars.length - 1 - index) * (BAR_HEIGHT + BAR_GAP);
        drawStatusBarEnhanced(
            CTX,
            panelX,
            barY,
            PANEL_WIDTH,
            BAR_HEIGHT,
            bar.progress,
            bar.config,
            bar.label,
            bar.value,
            frame,
            bar.type === 'cursedBurn' || bar.type === 'burning' || bar.type === 'frozen' || bar.type === 'slowed' || bar.type === 'stunned'
        );
    });
    
    CTX.restore();
}

// Legacy function maintained for compatibility - now uses unified panel
function drawStatusBar(x, y, width, height, progress, colors, label, borderColor, frame) {
    const config = {
        colors: {
            fill: colors[1] || colors[0],
            bg: 'rgba(0, 0, 0, 0.6)',
            glow: colors[0],
            border: borderColor || colors[2]
        },
        particleColor: colors[0],
        icon: ''
    };
    drawStatusBarEnhanced(CTX, x, y, width, height, progress, config, label, null, frame);
}

// =============================================================================
// UNIFIED PLAYER STATUS BARS SYSTEM
// All status bars above player tank use consistent styling and stack properly
// =============================================================================
function drawPlayerStatusBars(player, frame) {
    // Get screen position for player (matches HP bar positioning in drawTank)
    // Player status panel is drawn separately with screen coordinates
    const screenX = player.x;
    const screenY = player.y;
    
    // Use unified status panel system
    drawUnifiedStatusPanel(screenX, screenY, player, 'player', frame);
}
