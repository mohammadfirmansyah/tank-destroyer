const MAX_SIMULTANEOUS_ATTACKERS = 5; // Increased from 3 - more enemies can attack simultaneously
const ENEMY_AGGRO_RADIUS = Infinity; // No hard cap on chase distance
const ENEMY_STANDOFF_RADIUS = 360;
const MIN_ATTACK_SPACING = 140; // Increased for better spread formations
const ENEMY_SOFT_SEPARATION = 140; // Increased - enemies spread out more to surround player
const ENEMY_HARD_SEPARATION = 100; // Increased - stronger push when too close
const ENEMY_MIN_DISTANCE = 85; // Minimum distance tanks should maintain - actively push apart
const ENEMY_REPULSION_STRENGTH = 1.2; // Increased - faster push apart when too close
const BULLET_DODGE_RADIUS = 200; // Detection range for incoming bullets
const BULLET_DODGE_ANGLE = Math.PI / 4; // Max angle considered "heading toward"
const LOW_HP_RETREAT_THRESHOLD = 0.35;
const CRITICAL_HP_THRESHOLD = 0.2; // Below this, emergency retreat
const ENEMY_FORMATION_RADIUS_STEP = 14;
const ENEMY_ARC_STRAFE_WEIGHT = 0.15; // Reduced from 0.4 to prevent zigzag strafing
const ENEMY_SEPARATION_WEIGHT = 0.45; // Increased for better separation in steering
const ENEMY_COVER_RECALC = 180;
const ENEMY_COVER_BUFFER = 80;
const ENEMY_RETREAT_SPEED = 1.3;
const ENEMY_RETREAT_MAX_DISTANCE = 350; // Reduced from 450 to prevent wall-hugging
const ENEMY_RETREAT_MIN_DISTANCE = 220; // Reduced from 280 for tighter engagement
const ENEMY_ARC_VARIANCE = 0.6;
const ENEMY_DETOUR_DISTANCE = 280; // Reduced from 320 for more reachable waypoints
const ENEMY_DETOUR_VARIANCE = 100; // Reduced from 140
const ENEMY_DETOUR_TIMEOUT = 600; // Increased from 480 for longer detour time
const ENEMY_PATH_FAIL_THRESHOLD = 25; // Reduced from 30 for faster detour creation
const ENEMY_WALL_DANGER_DISTANCE = 45; // Reduced to allow tanks to navigate narrow passages
const ENEMY_QUEUE_BREAK_TIME = 120; // Reduced from 240 for faster queue break
const ENEMY_QUEUE_DISTANCE_BREAK = (typeof WORLD_W === 'number' && typeof WORLD_H === 'number')
    ? Math.max(WORLD_W, WORLD_H) * 0.3 // Reduced: enemies pursue when player is 30% of map away
    : 3600;
const ENEMY_CHASE_DISTANCE_THRESHOLD = 500; // Distance at which ALL enemies should pursue player
const ENEMY_AVOID_LOCK_FRAMES = 120; // Increased from 60 to prevent zigzag from rapid direction changes

// === PATROL/ALERT AI STATE SYSTEM ===
// Enemies start in patrol mode with reduced speed, only becoming aggressive when:
// 1. Turret faces player within vision cone AND player is close AND no obstacle between
// 2. Enemy takes damage from player
// 3. 50% or more of wave enemies are destroyed (global alert)
const PATROL_SPEED_MULT = 0.25;           // Patrol at 25% speed (slower patrol)
const ALERT_VISION_RANGE = 400;           // Must be within this distance to spot player
const ALERT_VISION_ANGLE = Math.PI / 4;   // Turret must face player within 45 degrees
const GLOBAL_ALERT_THRESHOLD = 0.5;       // Alert all when 50% enemies killed
let waveStartEnemyCount = 0;              // Track initial enemy count for each wave

// Find open directions (roads/corridors) for patrol turret scanning
// Returns array of angles representing open paths enemy should watch
// ONLY returns directions with clear line of sight (no walls)
// Prioritizes directions toward lastKnownPlayerPos (suspected player location)
function findPatrolScanPoints(enemy) {
    const scanDist = 200; // Distance to check for open paths
    const numRays = 16;   // Check 16 directions for better coverage
    
    // Calculate angle toward suspected player location
    let suspectedAngle = enemy.angle; // Default to facing direction
    if (enemy.lastKnownPlayerPos) {
        suspectedAngle = Math.atan2(
            enemy.lastKnownPlayerPos.y - enemy.y,
            enemy.lastKnownPlayerPos.x - enemy.x
        );
    }
    
    // First pass: Find ALL open paths (directions without walls)
    const openPaths = [];
    for (let i = 0; i < numRays; i++) {
        const angle = (i / numRays) * Math.PI * 2;
        const testX = enemy.x + Math.cos(angle) * scanDist;
        const testY = enemy.y + Math.sin(angle) * scanDist;
        
        // Check if this direction has line of sight (is a corridor/road, not wall)
        if (typeof checkLineOfSight === 'function' && checkLineOfSight(enemy.x, enemy.y, testX, testY)) {
            // Calculate how close this direction is to suspected player direction
            let angleDiff = Math.abs(angle - suspectedAngle);
            while (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
            
            // Priority score: lower = more important (closer to suspected direction)
            const priority = angleDiff / Math.PI;
            
            openPaths.push({
                angle: angle,
                priority: priority
            });
        }
    }
    
    // If no open paths found, do a finer search in suspected direction
    if (openPaths.length === 0) {
        // Try smaller angles around suspected direction
        for (let offset = -Math.PI; offset <= Math.PI; offset += Math.PI / 8) {
            const testAngle = suspectedAngle + offset;
            const testX = enemy.x + Math.cos(testAngle) * (scanDist * 0.5);
            const testY = enemy.y + Math.sin(testAngle) * (scanDist * 0.5);
            
            if (typeof checkLineOfSight === 'function' && checkLineOfSight(enemy.x, enemy.y, testX, testY)) {
                let angleDiff = Math.abs(offset);
                openPaths.push({
                    angle: testAngle,
                    priority: angleDiff / Math.PI
                });
            }
        }
    }
    
    // If still no open paths, just return current facing direction
    if (openPaths.length === 0) {
        return [{
            angle: enemy.angle,
            priority: 1
        }];
    }
    
    // Sort by priority - paths toward suspected player location come first
    openPaths.sort((a, b) => a.priority - b.priority);
    
    // Return only the best paths (toward suspected player direction)
    // Filter to only include paths within 90 degrees of suspected direction if possible
    const goodPaths = openPaths.filter(p => p.priority < 0.5);
    if (goodPaths.length > 0) {
        return goodPaths;
    }
    
    // If no paths toward player, return all open paths
    return openPaths;
}

// Check if enemy can see player (turret facing + close + no walls blocking)
function canEnemySpotPlayer(enemy) {
    if (!player || player.hp <= 0) return false;
    
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    
    // Must be within vision range
    if (dist > (enemy.visionAlertRange || ALERT_VISION_RANGE)) return false;
    
    // Check if turret is facing player (within vision angle)
    const angleToPlayer = Math.atan2(dy, dx);
    let angleDiff = angleToPlayer - enemy.turretAngle;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    
    const visionAngle = enemy.visionAlertAngle || ALERT_VISION_ANGLE;
    if (Math.abs(angleDiff) > visionAngle) return false;
    
    // Check line of sight (no walls/crates blocking)
    if (typeof checkLineOfSight === 'function' && !checkLineOfSight(enemy.x, enemy.y, player.x, player.y)) {
        return false;
    }
    
    return true;
}

// Radius for alerting nearby enemies when one enemy spots player
const ALERT_NEARBY_RADIUS = 180; // Very close proximity for info sharing
const ALERT_SHOOT_DELAY = 60;    // Frames delay before enemy can shoot after being alerted (1 second)

// Alert an enemy (switch from patrol to aggressive)
function alertEnemy(enemy, reason, alertNearby = true) {
    if (!enemy || enemy.aiState === 'alerted') return;
    enemy.aiState = 'alerted';
    enemy.alertedReason = reason;
    // Visual feedback - animated (!) indicator above status bar
    // 120 frames = 2 seconds of indicator visibility
    enemy.alertIndicator = 120;
    
    // Set delay before enemy can shoot - gives player time to react
    enemy.alertShootDelay = ALERT_SHOOT_DELAY;
    
    // Set target turret angle toward player - will smoothly rotate in update loop
    // Do NOT snap instantly - let the turret rotation system handle it smoothly
    if (player && player.hp > 0) {
        enemy.targetTurretAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        enemy.alertTurretTransition = true; // Flag for smooth transition
    }
    
    // Alert nearby enemies within close radius (info sharing)
    if (alertNearby && reason === 'vision') {
        for (const other of enemies) {
            if (other === enemy || other.hp <= 0 || other.aiState === 'alerted') continue;
            const dist = Math.hypot(other.x - enemy.x, other.y - enemy.y);
            if (dist <= ALERT_NEARBY_RADIUS) {
                // Alert nearby enemy but don't chain further alerts
                alertEnemy(other, 'ally_spotted', false);
            }
        }
    }
}

// Check if global alert should trigger (50% enemies killed)
function shouldGlobalAlert() {
    if (waveStartEnemyCount <= 0) return false;
    const aliveCount = enemies.filter(e => e.hp > 0).length;
    return aliveCount <= waveStartEnemyCount * GLOBAL_ALERT_THRESHOLD;
}

// Alert all remaining enemies (called when 50% threshold reached)
function alertAllEnemies(reason) {
    for (const enemy of enemies) {
        if (enemy.hp > 0 && enemy.aiState === 'patrol') {
            alertEnemy(enemy, reason);
        }
    }
}

// === LIFESTEAL ACCUMULATOR SYSTEM ===
// Accumulates lifesteal heals within a single frame to display as one combined floating text
// This prevents multiple overlapping "+X HP" texts when hitting many enemies at once
let lifestealAccumulator = 0;
let lifestealAccumulatorTimer = 0;
const LIFESTEAL_ACCUMULATOR_DELAY = 3; // Frames to wait before displaying accumulated heal

// Call this each frame to process accumulated lifesteal
function processLifestealAccumulator() {
    if (lifestealAccumulator > 0) {
        lifestealAccumulatorTimer++;
        if (lifestealAccumulatorTimer >= LIFESTEAL_ACCUMULATOR_DELAY) {
            // Display accumulated heal as single floating text
            if (lifestealAccumulator >= 0.5) {
                addFloatText('+' + Math.round(lifestealAccumulator) + ' HP', player.x, player.y - 40, '#22c55e', false);
            }
            // Reset accumulator
            lifestealAccumulator = 0;
            lifestealAccumulatorTimer = 0;
        }
    }
}

// Add heal amount to accumulator instead of displaying immediately
function accumulateLifestealHeal(amount) {
    lifestealAccumulator += amount;
    lifestealAccumulatorTimer = 0; // Reset timer on new heal
}

// === FORCE CHASE SYSTEM ===
// When enemies are too far from player, force them to aggressively chase with maximum intelligence
// This prevents enemies from getting "lost" or stuck in distant parts of the map
const ENEMY_FORCE_CHASE_DISTANCE = 900; // Distance beyond which enemy enters "force chase" mode
const ENEMY_FORCE_CHASE_SPEED_MULT = 1.8; // Speed multiplier during force chase (very fast)
const ENEMY_FORCE_CHASE_TURN_SPEED = 0.25; // Turn speed during force chase (very responsive)
const ENEMY_FORCE_CHASE_DETOUR_TIMEOUT = 180; // Shorter detour timeout during force chase

// === PLAYER STATIONARY DETECTION ===
// Detect when player is stationary to trigger aggressive encirclement
const PLAYER_STATIONARY_THRESHOLD = 15; // Player speed below this = stationary
const PLAYER_STATIONARY_TIME = 60; // Frames player must be still to trigger encircle
let playerLastX = 0;
let playerLastY = 0;
let playerStationaryFrames = 0;

function isPlayerStationary() {
    if (!player) return false;
    const dx = player.x - playerLastX;
    const dy = player.y - playerLastY;
    const speed = Math.hypot(dx, dy);
    
    if (speed < PLAYER_STATIONARY_THRESHOLD) {
        playerStationaryFrames++;
    } else {
        playerStationaryFrames = 0;
    }
    
    playerLastX = player.x;
    playerLastY = player.y;
    
    return playerStationaryFrames > PLAYER_STATIONARY_TIME;
}

// === SURROUND STRATEGY SYSTEM ===
// Divides the area around player into sectors to ensure enemies attack from all directions
const SURROUND_SECTOR_COUNT = 12; // 12 sectors for better spread (30 degrees each)
const SURROUND_SECTOR_ANGLE = (Math.PI * 2) / SURROUND_SECTOR_COUNT; // 30 degrees per sector
const SURROUND_REBALANCE_INTERVAL = 60; // Rebalance every 60 frames (1 second)
let surroundRebalanceTimer = 0;

// Assigns each enemy a fixed sector to attack from, ensuring balanced encirclement
// IMPROVED: Force reassignment if current sector is too crowded
function assignSurroundSector(enemy, forceReassign = false) {
    // Count enemies in each sector
    const sectorCounts = new Array(SURROUND_SECTOR_COUNT).fill(0);
    const sectorDistances = new Array(SURROUND_SECTOR_COUNT).fill(Infinity);
    
    for (const e of enemies) {
        if (e !== enemy && e.hp > 0 && e.surroundSector !== undefined) {
            sectorCounts[e.surroundSector]++;
            // Track closest enemy distance in each sector for better spreading
            if (player) {
                const dist = Math.hypot(e.x - player.x, e.y - player.y);
                sectorDistances[e.surroundSector] = Math.min(sectorDistances[e.surroundSector], dist);
            }
        }
    }
    
    // Check if current sector is overcrowded (more than fair share)
    const aliveCount = enemies.filter(e => e.hp > 0).length;
    const fairShare = Math.ceil(aliveCount / SURROUND_SECTOR_COUNT);
    
    if (!forceReassign && enemy.surroundSector !== undefined) {
        // Check if current sector is acceptable (not too crowded)
        if (sectorCounts[enemy.surroundSector] <= fairShare) {
            return; // Keep current sector
        }
        // Current sector overcrowded - force reassignment
        forceReassign = true;
    }
    
    // Find best sector - prioritize empty sectors, then least crowded
    let bestSector = 0;
    let bestScore = -Infinity;
    
    for (let i = 0; i < SURROUND_SECTOR_COUNT; i++) {
        // Score: prefer empty sectors, then least crowded
        // Also consider distance - prefer sectors where enemies are farther from player
        let score = (fairShare - sectorCounts[i]) * 100; // Prefer less crowded
        
        // Bonus for completely empty sectors
        if (sectorCounts[i] === 0) score += 500;
        
        // Bonus for sectors where existing enemies are far (we'll be closer)
        if (sectorDistances[i] > 300) score += 50;
        
        if (score > bestScore) {
            bestScore = score;
            bestSector = i;
        }
    }
    
    // If enemy's natural direction sector is nearly as good, prefer it for smoother movement
    if (player && !forceReassign) {
        const angleToPlayer = Math.atan2(enemy.y - player.y, enemy.x - player.x);
        const naturalSector = Math.floor(((angleToPlayer + Math.PI) / SURROUND_SECTOR_ANGLE + SURROUND_SECTOR_COUNT) % SURROUND_SECTOR_COUNT);
        
        // Use natural sector if it's not overcrowded
        if (sectorCounts[naturalSector] < fairShare) {
            bestSector = naturalSector;
        }
    }
    
    enemy.surroundSector = bestSector;
    enemy.sectorOffset = (Math.random() - 0.5) * SURROUND_SECTOR_ANGLE * 0.5; // Offset within sector
}

// Gets the target angle for an enemy based on their assigned sector
function getSurroundTargetAngle(enemy) {
    if (enemy.surroundSector === undefined) {
        assignSurroundSector(enemy);
    }
    
    // Base angle for this sector (center of sector)
    const baseAngle = enemy.surroundSector * SURROUND_SECTOR_ANGLE;
    
    // Add small offset for variety within sector
    const offset = enemy.sectorOffset || 0;
    
    // Slowly drift within sector for dynamic movement
    enemy.sectorOffset = (enemy.sectorOffset || 0) + (Math.random() - 0.5) * 0.001;
    enemy.sectorOffset = Math.max(-SURROUND_SECTOR_ANGLE * 0.4, Math.min(SURROUND_SECTOR_ANGLE * 0.4, enemy.sectorOffset));
    
    return baseAngle + offset;
}

// Rebalances sectors when enemies die or clustering is detected
// IMPROVED: More aggressive rebalancing to prevent clustering
function rebalanceSurroundSectors() {
    const aliveEnemies = enemies.filter(e => e.hp > 0);
    if (aliveEnemies.length === 0) return;
    
    // Count enemies per sector and track distances
    const sectorCounts = new Array(SURROUND_SECTOR_COUNT).fill(0);
    const sectorEnemies = new Array(SURROUND_SECTOR_COUNT).fill(null).map(() => []);
    
    for (const e of aliveEnemies) {
        if (e.surroundSector !== undefined) {
            sectorCounts[e.surroundSector]++;
            sectorEnemies[e.surroundSector].push(e);
        } else {
            // Assign sector to enemies without one
            assignSurroundSector(e);
            if (e.surroundSector !== undefined) {
                sectorCounts[e.surroundSector]++;
                sectorEnemies[e.surroundSector].push(e);
            }
        }
    }
    
    // Calculate fair distribution
    const fairShare = Math.ceil(aliveEnemies.length / SURROUND_SECTOR_COUNT);
    
    // Multiple passes to balance all sectors
    for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < SURROUND_SECTOR_COUNT; i++) {
            // If a sector is empty or underpopulated and another is overcrowded, reassign
            if (sectorCounts[i] < fairShare) {
                // Find most crowded sector with more than fair share
                let maxSector = -1;
                let maxCount = fairShare;
                for (let j = 0; j < SURROUND_SECTOR_COUNT; j++) {
                    if (sectorCounts[j] > maxCount) {
                        maxCount = sectorCounts[j];
                        maxSector = j;
                    }
                }
                
                // Move one enemy from crowded to this sector
                if (maxSector >= 0 && sectorEnemies[maxSector].length > fairShare) {
                    // Pick the enemy that's farthest from its ideal sector position
                    // This creates more natural movement
                    let bestCandidate = null;
                    let bestCandidateIdx = -1;
                    let bestScore = -Infinity;
                    
                    for (let k = 0; k < sectorEnemies[maxSector].length; k++) {
                        const candidate = sectorEnemies[maxSector][k];
                        if (!candidate || !player) continue;
                        
                        // Score based on how far enemy is from current sector's ideal position
                        const currentIdealAngle = maxSector * SURROUND_SECTOR_ANGLE;
                        const newIdealAngle = i * SURROUND_SECTOR_ANGLE;
                        const currentIdealX = player.x + Math.cos(currentIdealAngle) * 250;
                        const currentIdealY = player.y + Math.sin(currentIdealAngle) * 250;
                        const newIdealX = player.x + Math.cos(newIdealAngle) * 250;
                        const newIdealY = player.y + Math.sin(newIdealAngle) * 250;
                        
                        const distToCurrent = Math.hypot(candidate.x - currentIdealX, candidate.y - currentIdealY);
                        const distToNew = Math.hypot(candidate.x - newIdealX, candidate.y - newIdealY);
                        
                        // Prefer moving enemies that are closer to the new sector anyway
                        const score = distToCurrent - distToNew;
                        if (score > bestScore) {
                            bestScore = score;
                            bestCandidate = candidate;
                            bestCandidateIdx = k;
                        }
                    }
                    
                    if (bestCandidate) {
                        sectorEnemies[maxSector].splice(bestCandidateIdx, 1);
                        bestCandidate.surroundSector = i;
                        bestCandidate.sectorOffset = (Math.random() - 0.5) * SURROUND_SECTOR_ANGLE * 0.5;
                        sectorCounts[maxSector]--;
                        sectorCounts[i]++;
                        sectorEnemies[i].push(bestCandidate);
                    }
                }
            }
        }
    }
}

// Called periodically to check and fix clustering
function updateSurroundRebalance(dt) {
    surroundRebalanceTimer += dt;
    if (surroundRebalanceTimer >= SURROUND_REBALANCE_INTERVAL) {
        surroundRebalanceTimer = 0;
        rebalanceSurroundSectors();
    }
}

// === FORCE CHASE AI SYSTEM ===
// When an enemy is too far from the player, activate maximum intelligence pathfinding
// This ensures enemies don't get "lost" and always aggressively pursue the player

// Check if enemy should be in force chase mode
function shouldForceChase(enemy, distanceToPlayer) {
    return distanceToPlayer > ENEMY_FORCE_CHASE_DISTANCE;
}

// Get force chase movement - uses maximum intelligence pathfinding
// IMPROVED: Uses multi-level pathfinding including BFS waypoint search
function getForceChaseMovement(enemy, dt) {
    if (!player) return null;
    
    const targetX = player.x;
    const targetY = player.y;
    const directAngle = Math.atan2(targetY - enemy.y, targetX - enemy.x);
    
    // Check direct line of sight first
    const hasDirectPath = checkLineOfSight(enemy.x, enemy.y, targetX, targetY);
    
    if (hasDirectPath) {
        // Clear path - go directly
        enemy.forceChaseDetour = null;
        enemy.forceChaseStuckTime = 0;
        enemy.forceChaseBFSWaypoint = null;
        return {
            angle: directAngle,
            speedMult: ENEMY_FORCE_CHASE_SPEED_MULT,
            turnSpeed: ENEMY_FORCE_CHASE_TURN_SPEED
        };
    }
    
    // Path blocked - use intelligent detour system
    // Track stuck time
    if (!enemy.forceChaseStuckTime) enemy.forceChaseStuckTime = 0;
    enemy.forceChaseStuckTime += dt;
    
    // If we have an active BFS waypoint, follow it first (priority over simple detour)
    if (enemy.forceChaseBFSWaypoint && enemy.forceChaseBFSWaypoint.ttl > 0) {
        const bfsDist = Math.hypot(enemy.forceChaseBFSWaypoint.x - enemy.x, enemy.forceChaseBFSWaypoint.y - enemy.y);
        
        if (bfsDist < 60) {
            // Reached BFS waypoint - clear and reassess
            enemy.forceChaseBFSWaypoint = null;
        } else {
            enemy.forceChaseBFSWaypoint.ttl -= dt;
            const bfsAngle = Math.atan2(enemy.forceChaseBFSWaypoint.y - enemy.y, enemy.forceChaseBFSWaypoint.x - enemy.x);
            
            // Check if path to waypoint is still valid
            if (!pathBlockedToPoint(enemy, enemy.forceChaseBFSWaypoint.x, enemy.forceChaseBFSWaypoint.y)) {
                return {
                    angle: bfsAngle,
                    speedMult: ENEMY_FORCE_CHASE_SPEED_MULT * 0.9,
                    turnSpeed: ENEMY_FORCE_CHASE_TURN_SPEED
                };
            } else {
                // Path became blocked - clear waypoint
                enemy.forceChaseBFSWaypoint = null;
            }
        }
    }
    
    // If we have an active simple detour, follow it
    if (enemy.forceChaseDetour && enemy.forceChaseDetour.ttl > 0) {
        const detourDist = Math.hypot(enemy.forceChaseDetour.x - enemy.x, enemy.forceChaseDetour.y - enemy.y);
        
        if (detourDist < 50) {
            // Reached detour waypoint - clear it and find next path
            enemy.forceChaseDetour = null;
        } else {
            enemy.forceChaseDetour.ttl -= dt;
            return {
                angle: Math.atan2(enemy.forceChaseDetour.y - enemy.y, enemy.forceChaseDetour.x - enemy.x),
                speedMult: ENEMY_FORCE_CHASE_SPEED_MULT * 0.9,
                turnSpeed: ENEMY_FORCE_CHASE_TURN_SPEED
            };
        }
    }
    
    // Consistent side preference for pathfinding
    const preferredSide = enemy.stableArcSide || enemy.arcSide || 1;
    
    // Level 1: Try simple detour angles - scan more angles than before
    const detourAngles = [];
    for (let i = 1; i <= 8; i++) {
        // Alternate between preferred and opposite side, increasing angle
        detourAngles.push(directAngle + (preferredSide * Math.PI * i / 8));
        detourAngles.push(directAngle - (preferredSide * Math.PI * i / 8));
    }
    
    let bestDetourAngle = directAngle;
    let bestDetourScore = -Infinity;
    let bestDetourPoint = null;
    
    for (const testAngle of detourAngles) {
        // Test multiple distances
        for (const dist of [120, 200, 300, 400]) {
            const testX = enemy.x + Math.cos(testAngle) * dist;
            const testY = enemy.y + Math.sin(testAngle) * dist;
            
            // Skip if out of bounds
            if (testX < 80 || testX > WORLD_W - 80 || testY < 80 || testY > WORLD_H - 80) continue;
            
            // Check if we can reach this point
            const canReach = checkLineOfSight(enemy.x, enemy.y, testX, testY);
            if (!canReach) continue;
            
            // Check if this point brings us closer to player
            const newDistToPlayer = Math.hypot(testX - targetX, testY - targetY);
            const currentDist = Math.hypot(enemy.x - targetX, enemy.y - targetY);
            
            // Bonus if waypoint has LOS to player
            const hasLOSToPlayer = checkLineOfSight(testX, testY, targetX, targetY);
            const losBonus = hasLOSToPlayer ? 80 : 0;
            
            // Score: prefer points that bring us closer to player
            const score = (currentDist - newDistToPlayer) * 2.5 + losBonus - dist * 0.15;
            
            if (score > bestDetourScore) {
                bestDetourScore = score;
                bestDetourAngle = testAngle;
                bestDetourPoint = { x: testX, y: testY };
            }
        }
    }
    
    // Level 2: If simple detour failed or score is low, use BFS waypoint search
    if (bestDetourScore < 20 && enemy.forceChaseStuckTime > 30) {
        const bfsResult = findBFSWaypoint(enemy, directAngle);
        if (bfsResult) {
            enemy.forceChaseBFSWaypoint = {
                x: bfsResult.x,
                y: bfsResult.y,
                ttl: 240 // 4 seconds
            };
            
            return {
                angle: Math.atan2(bfsResult.y - enemy.y, bfsResult.x - enemy.x),
                speedMult: ENEMY_FORCE_CHASE_SPEED_MULT * 0.85,
                turnSpeed: ENEMY_FORCE_CHASE_TURN_SPEED
            };
        }
    }
    
    // Use best detour if found
    if (bestDetourPoint) {
        enemy.forceChaseDetour = {
            x: bestDetourPoint.x,
            y: bestDetourPoint.y,
            ttl: ENEMY_FORCE_CHASE_DETOUR_TIMEOUT
        };
    }
    
    // Level 3: If still no path found, use exploration mode
    if (bestDetourScore < 0 && enemy.forceChaseStuckTime > 60) {
        // Enter exploration mode - move in expanding circles
        if (!enemy.forceChaseExploration) {
            enemy.forceChaseExploration = {
                angle: directAngle + (preferredSide * Math.PI * 0.5),
                startTime: frame
            };
        }
        
        // Slowly rotate exploration angle
        enemy.forceChaseExploration.angle += preferredSide * 0.04;
        
        // Reset after full rotation
        if (frame - enemy.forceChaseExploration.startTime > 180) {
            enemy.forceChaseExploration = null;
            enemy.forceChaseStuckTime = 0;
        }
        
        // Only use exploration angle if exploration is still active
        if (enemy.forceChaseExploration) {
            bestDetourAngle = enemy.forceChaseExploration.angle;
        }
    }
    
    return {
        angle: enemy.forceChaseDetour 
            ? Math.atan2(enemy.forceChaseDetour.y - enemy.y, enemy.forceChaseDetour.x - enemy.x) 
            : bestDetourAngle,
        speedMult: ENEMY_FORCE_CHASE_SPEED_MULT * 0.85,
        turnSpeed: ENEMY_FORCE_CHASE_TURN_SPEED
    };
}

const ALLY_COVER_RANGE = 150; // Range to look for ally to hide behind
const WALL_SAFETY_MARGIN = 50; // Distance to check for walls before shooting

// Advanced AI: Detect incoming player bullets and calculate dodge vector
function detectIncomingBullets(enemy, intelligence) {
    if (!bullets || bullets.length === 0) return null;
    
    let closestThreat = null;
    let closestDist = BULLET_DODGE_RADIUS;
    let bestDodgeAngle = null;
    
    for (let b of bullets) {
        // Only dodge player bullets (not enemy bullets)
        if (b.isEnemy) continue;
        
        // Calculate distance to enemy
        const dist = Math.hypot(b.x - enemy.x, b.y - enemy.y);
        if (dist > BULLET_DODGE_RADIUS) continue;
        
        // Calculate bullet trajectory angle
        const bulletAngle = Math.atan2(b.vy, b.vx);
        
        // Calculate angle from bullet to enemy
        const toEnemyAngle = Math.atan2(enemy.y - b.y, enemy.x - b.x);
        
        // Check if bullet is heading toward enemy
        let angleDiff = bulletAngle - toEnemyAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        // Bullet is threat if heading roughly toward enemy
        if (Math.abs(angleDiff) < BULLET_DODGE_ANGLE) {
            // Calculate time to impact (rough estimate)
            const bulletSpeed = Math.hypot(b.vx, b.vy);
            const timeToImpact = dist / bulletSpeed;
            
            // Prioritize closer/faster threats
            const threatLevel = dist - timeToImpact * 20;
            
            if (threatLevel < closestDist) {
                closestDist = threatLevel;
                closestThreat = b;
                
                // Calculate perpendicular dodge direction
                // Choose direction that moves away from other threats
                const dodgeLeft = bulletAngle + Math.PI / 2;
                const dodgeRight = bulletAngle - Math.PI / 2;
                
                // Prefer dodge direction away from player
                const playerAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
                const leftDiff = Math.abs(playerAngle - dodgeLeft);
                const rightDiff = Math.abs(playerAngle - dodgeRight);
                
                bestDodgeAngle = leftDiff > rightDiff ? dodgeLeft : dodgeRight;
            }
        }
    }
    
    if (!closestThreat) return null;
    
    // Scale dodge response based on intelligence (higher tier = better reflexes)
    const dodgeStrength = 0.5 + (intelligence * 0.1);
    
    return {
        angle: bestDodgeAngle,
        strength: Math.min(1.5, dodgeStrength),
        threat: closestThreat
    };
}

// Advanced AI: Find ally tank to hide behind (relative to player)
function findAllyForCover(enemy, intelligence) {
    if (!enemies || enemies.length < 2) return null;
    
    // Only higher tier enemies use this strategy
    if (intelligence < 4) return null;
    
    const playerDist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    const angleToPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    
    let bestAlly = null;
    let bestScore = -Infinity;
    
    for (let ally of enemies) {
        if (ally === enemy) continue;
        if (ally.hp <= 0) continue;
        
        const allyDist = Math.hypot(ally.x - enemy.x, ally.y - enemy.y);
        if (allyDist > ALLY_COVER_RANGE || allyDist < 30) continue;
        
        // Check if ally is between enemy and player
        const angleToAlly = Math.atan2(ally.y - enemy.y, ally.x - enemy.x);
        let angleDiff = angleToAlly - angleToPlayer;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        // Ally should be roughly in direction of player (within 60 degrees)
        if (Math.abs(angleDiff) > Math.PI / 3) continue;
        
        // Prefer allies that are healthier and closer to player
        const allyHpRatio = ally.hp / (ally.maxHp || ally.hp);
        const allyPlayerDist = Math.hypot(ally.x - player.x, ally.y - player.y);
        
        // Score: prefer healthy allies that are closer to player (better shield)
        const score = allyHpRatio * 100 - allyPlayerDist * 0.1 - allyDist * 0.5;
        
        if (score > bestScore) {
            bestScore = score;
            bestAlly = ally;
        }
    }
    
    if (!bestAlly) return null;
    
    // Calculate position behind ally (opposite from player)
    const allyPlayerAngle = Math.atan2(player.y - bestAlly.y, player.x - bestAlly.x);
    const hideDistance = 40 + Math.random() * 20;
    
    return {
        x: bestAlly.x - Math.cos(allyPlayerAngle) * hideDistance,
        y: bestAlly.y - Math.sin(allyPlayerAngle) * hideDistance,
        ally: bestAlly
    };
}

// Advanced AI: Check if shot would hit a wall before reaching player
function canShootWithoutHittingWall(enemy) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    
    // Use multiple sample points along the trajectory
    const steps = Math.ceil(dist / WALL_SAFETY_MARGIN);
    const stepX = dx / steps;
    const stepY = dy / steps;
    
    for (let i = 1; i < steps; i++) {
        const checkX = enemy.x + stepX * i;
        const checkY = enemy.y + stepY * i;
        
        // Check if point is inside any wall
        for (let w of walls) {
            if (checkX >= w.x - 5 && checkX <= w.x + w.w + 5 &&
                checkY >= w.y - 5 && checkY <= w.y + w.h + 5) {
                return false; // Wall in the way
            }
        }
    }
    
    return true; // Clear shot
}

// Advanced AI: Find a better position/angle to shoot from when blocked
function findBetterShootingAngle(enemy) {
    const playerAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    
    // Try angles to the left and right of player direction
    const testAngles = [
        playerAngle + Math.PI / 6,   // 30 degrees right
        playerAngle - Math.PI / 6,   // 30 degrees left
        playerAngle + Math.PI / 4,   // 45 degrees right
        playerAngle - Math.PI / 4,   // 45 degrees left
        playerAngle + Math.PI / 3,   // 60 degrees right
        playerAngle - Math.PI / 3    // 60 degrees left
    ];
    
    for (let testAngle of testAngles) {
        // Check if moving in this direction would give clear shot
        const testX = enemy.x + Math.cos(testAngle) * 80;
        const testY = enemy.y + Math.sin(testAngle) * 80;
        
        // Verify position is valid
        if (!canEnemyOccupyPosition(enemy, testX, testY)) continue;
        
        // Check if there's LOS from new position
        if (checkLineOfSight(testX, testY, player.x, player.y)) {
            return testAngle;
        }
    }
    
    return null; // No better angle found
}

// Blend two angles with weighted interpolation
function blendAngles(angle1, angle2, weight) {
    let diff = angle2 - angle1;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return angle1 + diff * weight;
}

function resolveWeaponStats(weaponKey) {
    if (!weaponKey) {
        return { name: 'UNKNOWN', speed: 18, dmg: 25, color: '#fbbf24', type: 'single' };
    }
    const stats = WEAPONS[weaponKey] || BOSS_WEAPONS[weaponKey];
    if (stats) return stats;
    return { name: weaponKey.toString().toUpperCase(), speed: 18, dmg: 25, color: '#fbbf24', type: 'single' };
}

function captureBossWeaponTelemetry(weaponKey, stats) {
    if (!boss) return;
    boss.lastWeaponKey = weaponKey;
    boss.lastWeaponColor = (stats && stats.color) || '#fbbf24';
    boss.lastWeaponName = (stats && stats.name) || (weaponKey ? weaponKey.toString().toUpperCase() : 'UNKNOWN');
}

function enemyHasSpawnShield(enemy) {
    return !!(enemy && enemy.spawnWarmup > 0);
}

function getAngleDelta(current, previous) {
    let diff = current - previous;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
}

// Wall and crate regeneration constants
const WALL_HEAL_PERCENT_PER_SECOND = 0.02; // 2% HP per second
const CRATE_HEAL_PERCENT_PER_SECOND = 0.01; // 1% HP per second
const HEAL_DELAY_AFTER_DAMAGE = 300; // 5 seconds delay after taking damage (60fps)

// ========== SPATIAL HASH GRID FOR COLLISION OPTIMIZATION ==========
// Grid-based spatial partitioning for O(1) average collision queries
const SPATIAL_CELL_SIZE = 150; // Cell size in pixels (adjust based on typical entity sizes)
let spatialGridWalls = {};
let spatialGridCrates = {};
let spatialGridEnemies = {};
let spatialGridDirty = true; // Flag to rebuild grid when entities change

// Convert world position to grid cell key
function getCellKey(x, y) {
    const cx = Math.floor(x / SPATIAL_CELL_SIZE);
    const cy = Math.floor(y / SPATIAL_CELL_SIZE);
    return `${cx},${cy}`;
}

// Get all cells that a rectangle overlaps
function getOverlappingCells(x, y, w, h) {
    const cells = [];
    const minCx = Math.floor(x / SPATIAL_CELL_SIZE);
    const maxCx = Math.floor((x + w) / SPATIAL_CELL_SIZE);
    const minCy = Math.floor(y / SPATIAL_CELL_SIZE);
    const maxCy = Math.floor((y + h) / SPATIAL_CELL_SIZE);
    
    for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cy = minCy; cy <= maxCy; cy++) {
            cells.push(`${cx},${cy}`);
        }
    }
    return cells;
}

// Rebuild spatial grid for walls (called when walls change)
function rebuildWallGrid() {
    spatialGridWalls = {};
    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        const cells = getOverlappingCells(w.x, w.y, w.w, w.h);
        for (const key of cells) {
            if (!spatialGridWalls[key]) spatialGridWalls[key] = [];
            spatialGridWalls[key].push(i);
        }
    }
}

// Rebuild spatial grid for crates
function rebuildCrateGrid() {
    spatialGridCrates = {};
    for (let i = 0; i < crates.length; i++) {
        const c = crates[i];
        const cells = getOverlappingCells(c.x, c.y, c.w, c.h);
        for (const key of cells) {
            if (!spatialGridCrates[key]) spatialGridCrates[key] = [];
            spatialGridCrates[key].push(i);
        }
    }
}

// Rebuild spatial grid for enemies (called each frame since enemies move)
function rebuildEnemyGrid() {
    spatialGridEnemies = {};
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        const r = e.radius || 20;
        const cells = getOverlappingCells(e.x - r, e.y - r, r * 2, r * 2);
        for (const key of cells) {
            if (!spatialGridEnemies[key]) spatialGridEnemies[key] = [];
            spatialGridEnemies[key].push(i);
        }
    }
}

// Get nearby wall indices for collision check
function getNearbyWalls(x, y, radius) {
    const cells = getOverlappingCells(x - radius, y - radius, radius * 2, radius * 2);
    const indices = new Set();
    for (const key of cells) {
        if (spatialGridWalls[key]) {
            for (const idx of spatialGridWalls[key]) {
                indices.add(idx);
            }
        }
    }
    return Array.from(indices);
}

// Get nearby crate indices for collision check
function getNearbyCrates(x, y, radius) {
    const cells = getOverlappingCells(x - radius, y - radius, radius * 2, radius * 2);
    const indices = new Set();
    for (const key of cells) {
        if (spatialGridCrates[key]) {
            for (const idx of spatialGridCrates[key]) {
                indices.add(idx);
            }
        }
    }
    return Array.from(indices);
}

// Get nearby enemy indices for collision check
function getNearbyEnemies(x, y, radius) {
    const cells = getOverlappingCells(x - radius, y - radius, radius * 2, radius * 2);
    const indices = new Set();
    for (const key of cells) {
        if (spatialGridEnemies[key]) {
            for (const idx of spatialGridEnemies[key]) {
                indices.add(idx);
            }
        }
    }
    return Array.from(indices);
}

// Mark spatial grid as needing rebuild (call when walls/crates destroyed)
function markSpatialGridDirty() {
    spatialGridDirty = true;
}

// ========== END SPATIAL HASH GRID ==========

// ========== CLONE DAMAGE HELPER ==========
// Helper function to apply damage to clone with proper shield/armor handling
// This ensures magic skills respect clone's defensive stats just like bullet damage
function applyDamageToClone(clone, damage, damageType = 'magic') {
    if (!clone || clone.hp <= 0) return 0;
    
    let actualDamage = damage;
    
    // Shield protection - blocks all damage while active (timer-only system)
    if (clone.shieldTime > 0) {
        // Shield blocks damage completely - only timer reduces shield
        clone.hitFlash = 3;
        addFloatText('BLOCKED!', clone.x, clone.y - 40, '#60a5fa');
        return 0; // No damage dealt
    }
    
    // Armor protection - reduces damage
    if (clone.armor > 0) {
        const armorReduction = Math.min(clone.armor, actualDamage * 0.6);
        clone.armor -= armorReduction * 0.5; // Armor degrades
        actualDamage -= armorReduction;
    }
    
    // Apply final damage (minimum 1)
    actualDamage = Math.max(1, actualDamage);
    clone.hp -= actualDamage;
    clone.hitFlash = 5;
    
    return actualDamage;
}
// ========== END CLONE DAMAGE HELPER ==========

// ========== ENEMY MAGICAL SKILL SYSTEM ==========
// Strategic AI system for magical enemy abilities
// Each magic type has unique skills with dramatic visual effects

// Magic skill cooldowns and state tracking
const MAGIC_SKILL_COOLDOWNS = {
    shield: 600,      // 10 seconds between shield activations
    blink: 420,       // 7 seconds between blinks
    ice: 300,         // 5 seconds between ice burst
    fire: 240,        // 4 seconds between fire nova
    electric: 180     // 3 seconds between chain lightning
};

// Magic skill visual effect arrays (for render.js to use)
let magicEffects = [];

// Initialize enemy magic skill state
function initEnemyMagicSkills(enemy) {
    if (!ENEMY_TIERS[enemy.id]?.magical) return;
    
    const magicType = ENEMY_TIERS[enemy.id].magicType;
    enemy.magicCooldown = 0;
    enemy.magicActive = false;
    enemy.magicActiveTime = 0;
    enemy.magicType = magicType;
    
    // Type-specific initialization
    if (magicType === 'shield') {
        enemy.magicShieldHP = 0;
        enemy.magicShieldMaxHP = enemy.maxHp * 0.5; // Shield = 50% of max HP
    } else if (magicType === 'blink') {
        enemy.blinkCharging = false;
        enemy.blinkChargeTime = 0;
    }
}

// Strategic decision making for magic skill usage
function shouldUseMagicSkill(enemy, distanceToPlayer) {
    if (!enemy.magicType) return false;
    if (enemy.magicCooldown > 0) return false;
    if (enemy.frozenTime > 0 || enemy.stunnedTime > 0) return false;
    
    const hpRatio = enemy.hp / (enemy.maxHp || enemy.hp);
    const intelligence = ENEMY_TIERS[enemy.id]?.intelligence || 1;
    
    switch (enemy.magicType) {
        case 'shield':
            // Use shield when taking damage or HP is low
            return hpRatio < 0.6 || enemy.hitFlash > 0;
            
        case 'blink':
            // Blink when: low HP and being chased, or to flank player
            const shouldEscape = hpRatio < 0.3 && distanceToPlayer < 200;
            const shouldFlank = distanceToPlayer > 400 && Math.random() < 0.02;
            return shouldEscape || shouldFlank;
            
        case 'ice':
            // FIXED: Ice burst only activates when player is within ACTUAL effect range (180)
            // No more wasted skill activation when player is too far
            const ICE_BURST_RANGE = 180;
            if (distanceToPlayer > ICE_BURST_RANGE) return false; // STRICT range check
            
            // Higher chance when closer for more aggressive behavior
            if (distanceToPlayer < 100) {
                return Math.random() < 0.12 * intelligence;
            } else if (distanceToPlayer < 150) {
                return Math.random() < 0.08 * intelligence;
            } else {
                return Math.random() < 0.04 * intelligence;
            }
            
        case 'fire':
            // FIXED: Fire nova only activates when player is within ACTUAL effect range (150)
            // No more wasted skill activation when player is too far
            const FIRE_NOVA_RANGE = 150;
            if (distanceToPlayer > FIRE_NOVA_RANGE) return false; // STRICT range check
            
            // Higher chance when very close for maximum damage
            if (distanceToPlayer < 80) {
                return Math.random() < 0.15 * intelligence;
            } else if (distanceToPlayer < 120) {
                return Math.random() < 0.10 * intelligence;
            } else {
                return Math.random() < 0.05 * intelligence;
            }
            
        case 'electric':
            // Use chain lightning when player is in medium range - tactical
            return distanceToPlayer > 150 && distanceToPlayer < 350 && Math.random() < 0.035 * intelligence;
            
        default:
            return false;
    }
}

// Execute magic skill with dramatic effects
function executeMagicSkill(enemy) {
    if (!enemy.magicType) return;
    
    const magicType = enemy.magicType;
    enemy.magicCooldown = MAGIC_SKILL_COOLDOWNS[magicType] || 300;
    enemy.magicActive = true;
    enemy.magicActiveTime = 0;
    
    // Create dramatic activation effect
    createMagicActivationEffect(enemy, magicType);
    
    switch (magicType) {
        case 'shield':
            activateMagicShield(enemy);
            break;
        case 'blink':
            startBlinkCharge(enemy);
            break;
        case 'ice':
            castIceBurst(enemy);
            break;
        case 'fire':
            castFireNova(enemy);
            break;
        case 'electric':
            castChainLightning(enemy);
            break;
    }
}

// === SHIELD MAGIC ===
function activateMagicShield(enemy) {
    enemy.magicShieldHP = enemy.magicShieldMaxHP;
    enemy.magicShieldActive = true;
    enemy.magicActiveTime = 600; // 10 second duration (extended for strategic gameplay)
    
    // Dramatic shield activation particles
    for (let i = 0; i < 30; i++) {
        const angle = (Math.PI * 2 * i) / 30;
        const dist = 35 + Math.random() * 15;
        particles.push({
            x: enemy.x + Math.cos(angle) * dist,
            y: enemy.y + Math.sin(angle) * dist,
            vx: Math.cos(angle) * 3,
            vy: Math.sin(angle) * 3,
            life: 40 + Math.random() * 20,
            color: i % 2 === 0 ? '#a855f7' : '#c084fc',
            size: Math.random() * 4 + 2,
            gravity: 0,
            drag: 0.05
        });
    }
    
    // Add magic effect for render
    magicEffects.push({
        type: 'shield_activate',
        x: enemy.x,
        y: enemy.y,
        enemyRef: enemy,
        time: 0,
        duration: 60,
        radius: 50
    });
    
    addFloatText('MAGIC SHIELD!', enemy.x, enemy.y - 50, '#a855f7', true);
}

// === BLINK MAGIC ===
function startBlinkCharge(enemy) {
    enemy.blinkCharging = true;
    enemy.blinkChargeTime = 45; // 0.75 second charge
    enemy.magicActiveTime = 120; // Extended for delay effect
    
    // Charge particles spiraling inward
    magicEffects.push({
        type: 'blink_charge',
        x: enemy.x,
        y: enemy.y,
        enemyRef: enemy,
        time: 0,
        duration: 45
    });
}

function executeBlink(enemy) {
    // Find strategic blink destination
    const blinkDest = findBlinkDestination(enemy);
    
    if (!blinkDest) {
        enemy.blinkCharging = false;
        return;
    }
    
    // Create disappear effect at old position
    createBlinkDisappearEffect(enemy.x, enemy.y);
    
    // Store old position for floating text
    const oldX = enemy.x;
    const oldY = enemy.y;
    
    // Show floating text at ORIGINAL position (before blink)
    addFloatText('BLINK!', oldX, oldY - 50, '#a855f7', true);
    
    // Store destination and set delay state
    // Enemy will be invisible during delay, then appear at new position
    enemy.blinkDelayActive = true;
    enemy.blinkDelayTime = 20; // ~0.33 second delay between disappear and appear
    enemy.blinkDestX = blinkDest.x;
    enemy.blinkDestY = blinkDest.y;
    enemy.blinkOldX = oldX;
    enemy.blinkOldY = oldY;
    enemy.blinkInvisible = true;
    
    // Reset charging state
    enemy.blinkCharging = false;
}

// Process blink delay - called from updateEnemyMagicSkills
function processBlinkDelay(enemy, dt) {
    if (!enemy.blinkDelayActive) return;
    
    enemy.blinkDelayTime -= dt;
    
    if (enemy.blinkDelayTime <= 0) {
        // Move enemy to destination
        enemy.x = enemy.blinkDestX;
        enemy.y = enemy.blinkDestY;
        
        // Create appear effect at new position
        createBlinkAppearEffect(enemy.x, enemy.y);
        
        // Reset blink states
        enemy.blinkDelayActive = false;
        enemy.blinkInvisible = false;
        enemy.blinkDestX = undefined;
        enemy.blinkDestY = undefined;
    }
}

function findBlinkDestination(enemy) {
    const hpRatio = enemy.hp / (enemy.maxHp || enemy.hp);
    const distToPlayer = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    
    // If low HP, blink to safety (away from player)
    if (hpRatio < 0.3) {
        const escapeAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
        const escapeDistance = 300 + Math.random() * 150;
        
        // Try multiple positions
        for (let attempt = 0; attempt < 8; attempt++) {
            const angleOffset = (attempt - 4) * 0.3;
            const testX = enemy.x + Math.cos(escapeAngle + angleOffset) * escapeDistance;
            const testY = enemy.y + Math.sin(escapeAngle + angleOffset) * escapeDistance;
            
            if (isValidBlinkPosition(testX, testY)) {
                return { x: testX, y: testY };
            }
        }
    } else {
        // Flank blink - appear behind or to the side of player
        const flankAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x) + (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
        const flankDistance = 180 + Math.random() * 100;
        
        for (let attempt = 0; attempt < 8; attempt++) {
            const angleOffset = (Math.random() - 0.5) * Math.PI * 0.5;
            const testX = player.x + Math.cos(flankAngle + angleOffset) * flankDistance;
            const testY = player.y + Math.sin(flankAngle + angleOffset) * flankDistance;
            
            if (isValidBlinkPosition(testX, testY)) {
                return { x: testX, y: testY };
            }
        }
    }
    
    return null;
}

function isValidBlinkPosition(x, y) {
    // Check bounds
    if (x < 80 || x > WORLD_W - 80 || y < 80 || y > WORLD_H - 80) return false;
    
    // Check wall collision
    for (const w of walls) {
        if (x > w.x - 30 && x < w.x + w.w + 30 && y > w.y - 30 && y < w.y + w.h + 30) {
            return false;
        }
    }
    
    // Check crate collision
    for (const c of crates) {
        if (x > c.x - 30 && x < c.x + c.w + 30 && y > c.y - 30 && y < c.y + c.h + 30) {
            return false;
        }
    }
    
    // Check river collision
    if (typeof riverTiles !== 'undefined') {
        for (const r of riverTiles) {
            if (x > r.x - 30 && x < r.x + r.w + 30 && y > r.y - 30 && y < r.y + r.h + 30) {
                return false;
            }
        }
    }
    
    return true;
}

// === ICE MAGIC ===
function castIceBurst(enemy) {
    enemy.magicActiveTime = 60;
    
    // Freeze player if in range
    const distToPlayer = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (distToPlayer < 180) {
        // Check if player was already slowed before applying effect
        const wasSlowed = player.slowed && player.slowed > 60;
        
        // Apply slow effect to player (use player.slowed to match gameplay.js and render.js)
        player.slowed = Math.max(player.slowed || 0, 120); // 2 second slow
        
        // Show SLOWED text if not already slowed (prevent spam)
        if (!wasSlowed) {
            addFloatText('SLOWED!', player.x, player.y - 50, '#87ceeb', true);
        }
        
        // Ice particles toward player
        const angleToPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        for (let i = 0; i < 20; i++) {
            const spreadAngle = angleToPlayer + (Math.random() - 0.5) * 0.8;
            const speed = 8 + Math.random() * 6;
            particles.push({
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(spreadAngle) * speed,
                vy: Math.sin(spreadAngle) * speed,
                life: 35 + Math.random() * 15,
                color: Math.random() < 0.5 ? '#00bcd4' : '#4dd0e1',
                size: Math.random() * 5 + 3,
                gravity: 0,
                drag: 0.03
            });
        }
    }
    
    // Also freeze clones in range with proper shield/armor handling
    if (typeof playerClones !== 'undefined') {
        for (const clone of playerClones) {
            if (!clone || clone.hp <= 0) continue;
            const distToClone = Math.hypot(enemy.x - clone.x, enemy.y - clone.y);
            if (distToClone < 180) {
                // Shield blocks freeze effect
                if (clone.shieldTime > 0) {
                    addFloatText('BLOCKED!', clone.x, clone.y - 40, '#60a5fa');
                } else {
                    // Check if clone was already slowed
                    const wasSlowed = clone.slowed && clone.slowed > 60;
                    clone.slowed = Math.max(clone.slowed || 0, 120);
                    if (!wasSlowed) {
                        addFloatText('SLOWED!', clone.x, clone.y - 50, '#87ceeb');
                    }
                }
            }
        }
    }
    
    // 360-degree ice burst effect
    for (let i = 0; i < 40; i++) {
        const angle = (Math.PI * 2 * i) / 40;
        const speed = 4 + Math.random() * 4;
        particles.push({
            x: enemy.x,
            y: enemy.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 50 + Math.random() * 25,
            color: i % 3 === 0 ? '#ffffff' : (i % 3 === 1 ? '#00bcd4' : '#4dd0e1'),
            size: Math.random() * 6 + 2,
            gravity: 0.02,
            drag: 0.02
        });
    }
    
    // Add magic effect for render (follows enemy)
    magicEffects.push({
        type: 'ice_burst',
        x: enemy.x,
        y: enemy.y,
        enemyRef: enemy, // Store reference to follow enemy
        time: 0,
        duration: 45,
        radius: 180
    });
    
    addFloatText('ICE BURST!', enemy.x, enemy.y - 50, '#00bcd4', true);
}

// === FIRE MAGIC ===
function castFireNova(enemy) {
    enemy.magicActiveTime = 60;
    
    // Damage and burn player if in range
    const distToPlayer = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (distToPlayer < 150) {
        // Apply burn damage - respect DEBUG_UNLIMITED_HP
        const burnDamage = 15 + ENEMY_TIERS[enemy.id].intelligence * 3;
        if (!DEBUG_UNLIMITED_HP) {
            player.hp -= burnDamage;
        }
        
        // Apply burning DOT
        if (!player.burningTime) player.burningTime = 0;
        player.burningTime = Math.max(player.burningTime, 180); // 3 second burn
        
        addFloatText('-' + burnDamage, player.x, player.y - 30, '#ff6b35');
        addFloatText('BURNING!', player.x, player.y - 50, '#ff6b35', true);
    }
    
    // Also burn clones in range with proper shield/armor handling
    if (typeof playerClones !== 'undefined') {
        for (const clone of playerClones) {
            if (!clone || clone.hp <= 0) continue;
            const distToClone = Math.hypot(enemy.x - clone.x, enemy.y - clone.y);
            if (distToClone < 150) {
                // Apply damage with shield/armor check
                const burnDamage = 15 + ENEMY_TIERS[enemy.id].intelligence * 3;
                const actualDamage = applyDamageToClone(clone, burnDamage, 'fire');
                
                if (actualDamage > 0) {
                    // Apply burning DOT to clone
                    if (!clone.burningTime) clone.burningTime = 0;
                    clone.burningTime = Math.max(clone.burningTime, 180);
                    
                    addFloatText('-' + actualDamage, clone.x, clone.y - 30, '#ff6b35');
                    addFloatText('BURNING!', clone.x, clone.y - 50, '#ff6b35');
                }
            }
        }
    }
    
    // Expanding fire ring effect
    for (let ring = 0; ring < 3; ring++) {
        const ringDelay = ring * 8;
        const particleCount = 25 + ring * 10;
        
        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount + ring * 0.2;
            const baseSpeed = 5 + ring * 2;
            const speed = baseSpeed + Math.random() * 3;
            
            particles.push({
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 40 + Math.random() * 20 - ringDelay,
                color: Math.random() < 0.4 ? '#ff6b35' : (Math.random() < 0.6 ? '#ff9500' : '#ffcc00'),
                size: Math.random() * 7 + 3,
                gravity: -0.03,
                drag: 0.02
            });
        }
    }
    
    // Add magic effect for render (follows enemy)
    magicEffects.push({
        type: 'fire_nova',
        x: enemy.x,
        y: enemy.y,
        enemyRef: enemy, // Store reference to follow enemy
        time: 0,
        duration: 50,
        radius: 150
    });
    
    addFloatText('FIRE NOVA!', enemy.x, enemy.y - 50, '#ff6b35', true);
}

// === ELECTRIC MAGIC ===
function castChainLightning(enemy) {
    enemy.magicActiveTime = 45;
    
    // Find targets - player and clones
    const targets = [];
    const distToPlayer = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    
    if (distToPlayer < 350) {
        targets.push({ x: player.x, y: player.y, isPlayer: true });
    }
    
    // Also target clones
    if (typeof playerClones !== 'undefined') {
        for (const clone of playerClones) {
            if (!clone || clone.hp <= 0) continue;
            const distToClone = Math.hypot(enemy.x - clone.x, enemy.y - clone.y);
            if (distToClone < 350) {
                targets.push({ x: clone.x, y: clone.y, isClone: true, clone: clone });
            }
        }
    }
    
    if (targets.length === 0) return;
    
    // Hit all targets in range
    for (const target of targets) {
        // Create lightning arc to target
        createLightningArc(enemy.x, enemy.y, target.x, target.y);
        
        if (target.isPlayer) {
            // Check if player has active shield - block stun and damage
            if (player.shieldTime > 0 || (player.shieldActive && player.shieldHp > 0)) {
                // Shield blocks the stun effect
                addFloatText('BLOCKED!', player.x, player.y - 50, '#60a5fa');
                
                // Shield absorbs some damage
                if (player.shieldHp > 0) {
                    const stunDamage = 20 + ENEMY_TIERS[enemy.id].intelligence * 4;
                    const absorbed = Math.min(player.shieldHp, stunDamage);
                    player.shieldHp -= absorbed;
                    if (player.shieldHp <= 0) {
                        player.shieldActive = false;
                        addFloatText('SHIELD BROKEN!', player.x, player.y - 30, '#ef4444');
                    }
                }
            } else {
                // No shield - apply stun and damage
                const stunDamage = 20 + ENEMY_TIERS[enemy.id].intelligence * 4;
                
                // Respect DEBUG_UNLIMITED_HP
                if (!DEBUG_UNLIMITED_HP) {
                    player.hp -= stunDamage;
                }
                
                // Apply stun (capped duration to prevent permanent stun)
                if (!player.stunnedTime) player.stunnedTime = 0;
                player.stunnedTime = Math.min(Math.max(player.stunnedTime, 45), 90); // Max 1.5 second stun
                
                addFloatText('-' + stunDamage, player.x, player.y - 30, '#ffeb3b');
                addFloatText('STUNNED!', player.x, player.y - 50, '#ffeb3b'); // No isCritical flag - clean animation
            }
        } else if (target.isClone && target.clone) {
            // Damage clone with proper shield/armor handling
            const clone = target.clone;
            const lightningDamage = 20 + ENEMY_TIERS[enemy.id].intelligence * 4;
            const actualDamage = applyDamageToClone(clone, lightningDamage, 'electric');
            
            if (actualDamage > 0) {
                addFloatText('-' + actualDamage, clone.x, clone.y - 30, '#ffeb3b');
                addFloatText('STUNNED!', clone.x, clone.y - 50, '#ffeb3b');
                
                // Apply stun to clone (capped duration)
                if (!clone.stunnedTime) clone.stunnedTime = 0;
                clone.stunnedTime = Math.min(Math.max(clone.stunnedTime, 45), 90);
            }
        }
    }
    
    // Electric discharge particles at enemy
    for (let i = 0; i < 25; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 5;
        particles.push({
            x: enemy.x + (Math.random() - 0.5) * 30,
            y: enemy.y + (Math.random() - 0.5) * 30,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 20 + Math.random() * 15,
            color: Math.random() < 0.5 ? '#ffeb3b' : '#ffffff',
            size: Math.random() * 4 + 2,
            gravity: 0,
            drag: 0.08
        });
    }
    
    addFloatText('CHAIN LIGHTNING!', enemy.x, enemy.y - 50, '#ffeb3b', true);
}

function createLightningArc(x1, y1, x2, y2) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const segments = Math.ceil(dist / 30);
    const dx = (x2 - x1) / segments;
    const dy = (y2 - y1) / segments;
    
    let prevX = x1;
    let prevY = y1;
    
    for (let i = 1; i <= segments; i++) {
        const baseX = x1 + dx * i;
        const baseY = y1 + dy * i;
        
        // Add zigzag offset (except for endpoints)
        const offsetMag = (i < segments) ? (Math.random() - 0.5) * 40 : 0;
        const perpAngle = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
        const curX = baseX + Math.cos(perpAngle) * offsetMag;
        const curY = baseY + Math.sin(perpAngle) * offsetMag;
        
        // Create particles along segment
        const segDist = Math.hypot(curX - prevX, curY - prevY);
        const particleCount = Math.ceil(segDist / 8);
        
        for (let p = 0; p < particleCount; p++) {
            const t = p / particleCount;
            particles.push({
                x: prevX + (curX - prevX) * t + (Math.random() - 0.5) * 8,
                y: prevY + (curY - prevY) * t + (Math.random() - 0.5) * 8,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                life: 15 + Math.random() * 10,
                color: p % 2 === 0 ? '#ffeb3b' : '#ffffff',
                size: Math.random() * 3 + 2,
                gravity: 0,
                drag: 0.1
            });
        }
        
        prevX = curX;
        prevY = curY;
    }
    
    // Add to magic effects for continued rendering
    magicEffects.push({
        type: 'lightning_arc',
        x1: x1, y1: y1,
        x2: x2, y2: y2,
        time: 0,
        duration: 15
    });
}

// Create dramatic magic activation effect
function createMagicActivationEffect(enemy, magicType) {
    const colors = {
        shield: ['#a855f7', '#c084fc', '#e879f9'],
        blink: ['#a855f7', '#8b5cf6', '#7c3aed'],
        ice: ['#00bcd4', '#4dd0e1', '#ffffff'],
        fire: ['#ff6b35', '#ff9500', '#ffcc00'],
        electric: ['#ffeb3b', '#ffc107', '#ffffff']
    };
    
    const magicColors = colors[magicType] || ['#ffffff'];
    
    // Spiral activation particles
    for (let i = 0; i < 35; i++) {
        const angle = (Math.PI * 2 * i) / 15 + (i * 0.3);
        const dist = 20 + i * 1.5;
        const speed = 2 + Math.random() * 2;
        
        particles.push({
            x: enemy.x + Math.cos(angle) * dist * 0.3,
            y: enemy.y + Math.sin(angle) * dist * 0.3,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 35 + Math.random() * 20,
            color: magicColors[i % magicColors.length],
            size: Math.random() * 5 + 2,
            gravity: 0,
            drag: 0.04
        });
    }
    
    // Ground rune effect - store enemyRef so effect follows enemy movement
    magicEffects.push({
        type: 'magic_rune',
        x: enemy.x,
        y: enemy.y,
        magicType: magicType,
        time: 0,
        duration: 40,
        radius: 45,
        enemyRef: enemy
    });
}

// Blink visual effects
function createBlinkDisappearEffect(x, y) {
    // === LAYER 1: Outer imploding ring particles ===
    for (let i = 0; i < 50; i++) {
        const angle = (Math.PI * 2 * i) / 50;
        const dist = 80 + Math.random() * 40;
        
        particles.push({
            x: x + Math.cos(angle) * dist,
            y: y + Math.sin(angle) * dist,
            vx: -Math.cos(angle) * 8,
            vy: -Math.sin(angle) * 8,
            life: 30,
            color: i % 3 === 0 ? '#a855f7' : (i % 3 === 1 ? '#c084fc' : '#e9d5ff'),
            size: Math.random() * 6 + 3,
            gravity: 0,
            drag: 0.03
        });
    }
    
    // === LAYER 2: Spiral energy streaks ===
    for (let i = 0; i < 16; i++) {
        const angle = (Math.PI * 2 * i) / 16;
        const dist = 50 + Math.random() * 20;
        const spiralOffset = Math.random() * 0.5;
        
        particles.push({
            x: x + Math.cos(angle) * dist,
            y: y + Math.sin(angle) * dist,
            vx: -Math.cos(angle + spiralOffset) * 12,
            vy: -Math.sin(angle + spiralOffset) * 12,
            life: 20,
            color: '#ffffff',
            size: Math.random() * 4 + 2,
            gravity: 0,
            drag: 0.08
        });
    }
    
    // === LAYER 3: Core implosion flash ===
    for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * (1 + Math.random() * 2),
            vy: Math.sin(angle) * (1 + Math.random() * 2),
            life: 15,
            color: '#f5d0fe',
            size: 8 + Math.random() * 6,
            gravity: 0,
            drag: 0.15
        });
    }
    
    // === LAYER 4: Dimensional rift particles (dark) ===
    for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 * i) / 12;
        const dist = 30 + Math.random() * 20;
        
        particles.push({
            x: x + Math.cos(angle) * dist,
            y: y + Math.sin(angle) * dist,
            vx: -Math.cos(angle) * 15,
            vy: -Math.sin(angle) * 15,
            life: 12,
            color: '#4c1d95',
            size: Math.random() * 8 + 4,
            gravity: 0,
            drag: 0.1
        });
    }
    
    // Portal effect with longer duration
    magicEffects.push({
        type: 'blink_out',
        x: x,
        y: y,
        time: 0,
        duration: 40
    });
}

function createBlinkAppearEffect(x, y) {
    // === LAYER 1: Primary explosion burst ===
    for (let i = 0; i < 60; i++) {
        const angle = (Math.PI * 2 * i) / 60;
        const speed = 6 + Math.random() * 8;
        
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 40 + Math.random() * 20,
            color: i % 4 === 0 ? '#ffffff' : (i % 4 === 1 ? '#a855f7' : (i % 4 === 2 ? '#c084fc' : '#e9d5ff')),
            size: Math.random() * 7 + 3,
            gravity: 0,
            drag: 0.03
        });
    }
    
    // === LAYER 2: Electric arcs radiating outward ===
    for (let i = 0; i < 20; i++) {
        const angle = (Math.PI * 2 * i) / 20;
        const speed = 10 + Math.random() * 5;
        
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 18,
            color: '#ffffff',
            size: Math.random() * 3 + 2,
            gravity: 0,
            drag: 0.06
        });
    }
    
    // === LAYER 3: Core emergence flash ===
    for (let i = 0; i < 15; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 3;
        
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 25,
            color: '#faf5ff',
            size: 10 + Math.random() * 8,
            gravity: 0,
            drag: 0.1
        });
    }
    
    // === LAYER 4: Dimensional tear sparks ===
    for (let i = 0; i < 25; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 20;
        const speed = 3 + Math.random() * 4;
        
        particles.push({
            x: x + Math.cos(angle) * dist,
            y: y + Math.sin(angle) * dist,
            vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 2,
            vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 2,
            life: 30 + Math.random() * 15,
            color: '#7c3aed',
            size: Math.random() * 5 + 2,
            gravity: 0.05,
            drag: 0.02
        });
    }
    
    // === LAYER 5: Rising ethereal mist ===
    for (let i = 0; i < 8; i++) {
        particles.push({
            x: x + (Math.random() - 0.5) * 40,
            y: y + (Math.random() - 0.5) * 40,
            vx: (Math.random() - 0.5) * 1,
            vy: -1 - Math.random() * 2,
            life: 50 + Math.random() * 20,
            color: '#ddd6fe',
            size: 12 + Math.random() * 8,
            gravity: -0.03,
            drag: 0.01
        });
    }
    
    // Portal effect with longer duration for dramatic emergence
    magicEffects.push({
        type: 'blink_in',
        x: x,
        y: y,
        time: 0,
        duration: 50
    });
}

// Update magic effects and cooldowns
function updateEnemyMagicSkills(enemy, dt, distanceToPlayer) {
    // Initialize if needed
    if (enemy.magicCooldown === undefined && ENEMY_TIERS[enemy.id]?.magical) {
        initEnemyMagicSkills(enemy);
    }
    
    if (!enemy.magicType) return;
    
    // Decrement cooldown
    if (enemy.magicCooldown > 0) {
        enemy.magicCooldown -= dt;
    }
    
    // Process blink delay (enemy is invisible during this time)
    if (enemy.magicType === 'blink') {
        processBlinkDelay(enemy, dt);
    }
    
    // Update active magic time
    if (enemy.magicActiveTime > 0) {
        enemy.magicActiveTime -= dt;
        
        // Handle magic-specific updates
        if (enemy.magicType === 'blink' && enemy.blinkCharging) {
            enemy.blinkChargeTime -= dt;
            if (enemy.blinkChargeTime <= 0) {
                executeBlink(enemy);
            }
        }
        
        // Deactivate shield when time runs out
        if (enemy.magicType === 'shield' && enemy.magicActiveTime <= 0) {
            enemy.magicShieldActive = false;
            enemy.magicShieldHP = 0;
        }
    }
    
    // Check if should use magic skill
    if (shouldUseMagicSkill(enemy, distanceToPlayer)) {
        executeMagicSkill(enemy);
    }
}

// Update all magic visual effects
function updateMagicEffects(dt) {
    for (let i = magicEffects.length - 1; i >= 0; i--) {
        const effect = magicEffects[i];
        effect.time += dt;
        
        if (effect.time >= effect.duration) {
            magicEffects.splice(i, 1);
        }
    }
}

// Handle magic shield damage absorption
function handleMagicShieldDamage(enemy, damage) {
    if (!enemy.magicShieldActive || enemy.magicShieldHP <= 0) {
        return damage; // No shield, return full damage
    }
    
    // Shield absorbs damage
    const absorbed = Math.min(damage, enemy.magicShieldHP);
    enemy.magicShieldHP -= absorbed;
    
    // Shield break particles
    if (enemy.magicShieldHP <= 0) {
        enemy.magicShieldActive = false;
        
        // Shield break effect
        for (let i = 0; i < 25; i++) {
            const angle = (Math.PI * 2 * i) / 25;
            particles.push({
                x: enemy.x + Math.cos(angle) * 40,
                y: enemy.y + Math.sin(angle) * 40,
                vx: Math.cos(angle) * 5,
                vy: Math.sin(angle) * 5,
                life: 30,
                color: '#a855f7',
                size: Math.random() * 4 + 2,
                gravity: 0.02,
                drag: 0.03
            });
        }
        
        addFloatText('SHIELD BROKEN!', enemy.x, enemy.y - 40, '#a855f7');
    } else {
        // Shield hit particles
        for (let i = 0; i < 8; i++) {
            particles.push({
                x: enemy.x + (Math.random() - 0.5) * 50,
                y: enemy.y + (Math.random() - 0.5) * 50,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 15,
                color: '#c084fc',
                size: Math.random() * 3 + 1
            });
        }
    }
    
    return damage - absorbed; // Return remaining damage
}

// ========== END ENEMY MAGICAL SKILL SYSTEM ==========

// Projectiles handle terrain destruction, enemy hits, and boss interactions in
// one sweep to guarantee deterministic behavior regardless of spawn order.
function updateBullets(dt) {
    // Rebuild spatial grids if dirty (walls/crates changed)
    if (spatialGridDirty) {
        rebuildWallGrid();
        rebuildCrateGrid();
        spatialGridDirty = false;
    }
    // Always rebuild enemy grid since enemies move
    rebuildEnemyGrid();
    
    // Decay shake effects and handle regeneration for walls
    for (let w of walls) {
        // Decay wall shake effects
        if (w.shakeX) {
            w.shakeX *= 0.82;
            if (Math.abs(w.shakeX) < 0.2) w.shakeX = 0;
        }
        if (w.shakeY) {
            w.shakeY *= 0.82;
            if (Math.abs(w.shakeY) < 0.2) w.shakeY = 0;
        }
        
        // Wall HP regeneration system
        if (w.destructible && w.hp > 0 && w.hp < w.maxHp) {
            // Initialize last damage time if not set
            if (w.lastDamageFrame === undefined) w.lastDamageFrame = 0;
            
            // Only heal if enough time has passed since last damage
            const timeSinceDamage = frame - w.lastDamageFrame;
            if (timeSinceDamage >= HEAL_DELAY_AFTER_DAMAGE) {
                // Heal percentage per frame (60fps)
                const healPerFrame = (w.maxHp * WALL_HEAL_PERCENT_PER_SECOND) / 60 * dt;
                w.hp = Math.min(w.maxHp, w.hp + healPerFrame);
                
                // Visual heal effect (occasional particle)
                if (frame % 30 === 0 && Math.random() < 0.3) {
                    particles.push({
                        x: w.x + Math.random() * w.w,
                        y: w.y + Math.random() * w.h,
                        vx: 0,
                        vy: -1,
                        life: 20,
                        color: '#4ade80',
                        size: 2
                    });
                }
            }
        }
    }
    // Decay shake effects and handle regeneration for crates
    for (let c of crates) {
        // Decay crate shake effects
        if (c.shakeX) {
            c.shakeX *= 0.82;
            if (Math.abs(c.shakeX) < 0.2) c.shakeX = 0;
        }
        if (c.shakeY) {
            c.shakeY *= 0.82;
            if (Math.abs(c.shakeY) < 0.2) c.shakeY = 0;
        }
        
        // Crate HP regeneration system (slower than walls)
        if (c.hp > 0 && c.hp < c.maxHp) {
            if (c.lastDamageFrame === undefined) c.lastDamageFrame = 0;
            
            const timeSinceDamage = frame - c.lastDamageFrame;
            if (timeSinceDamage >= HEAL_DELAY_AFTER_DAMAGE) {
                const healPerFrame = (c.maxHp * CRATE_HEAL_PERCENT_PER_SECOND) / 60 * dt;
                c.hp = Math.min(c.maxHp, c.hp + healPerFrame);
            }
        }
    }
    
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        const startX = b.prevX ?? b.x;
        const startY = b.prevY ?? b.y;
        const targetX = b.x + b.vx * dt;
        const targetY = b.y + b.vy * dt;
        // OPTIMIZATION: Use fastDistSq when available (avoids sqrt)
        const dx = targetX - startX;
        const dy = targetY - startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
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
        
        // Handle bullet removal with despawn effects
        if (hit) {
            bullets.splice(i, 1);
        } else if (b.life <= 0) {
            // Bullet despawned at max range - create smaller impact effect
            createBulletDespawnEffect(b.x, b.y, b.type, b.color);
            bullets.splice(i, 1);
        }
    }
}

function handleBulletCollision(b) {
    // Check collision with ALL walls directly (bypass spatial grid for reliability)
    for (let wIdx = 0; wIdx < walls.length; wIdx++) {
        let w = walls[wIdx];
        if (!w) continue;
        if (b.x > w.x && b.x < w.x + w.w && b.y > w.y && b.y < w.y + w.h) {
            // Create weapon-specific wall impact effect with directional debris
            const bulletAngle = Math.atan2(b.vy, b.vx);
            createBulletImpact(b.x, b.y, b.type, b.color, b.dmg * 0.5, bulletAngle);
            if (w.destructible) {
                w.hp -= b.dmg;
                w.lastDamageFrame = frame; // Track damage time for heal delay
                // Store hit position for crack rendering
                if (!w.lastHitX) w.lastHitX = [];
                if (!w.lastHitY) w.lastHitY = [];
                w.lastHitX.push(b.x - w.x); // Relative to wall position
                w.lastHitY.push(b.y - w.y);
                // Moderate wall shake based on damage
                const shakeIntensity = Math.min(10, b.dmg * 0.15);
                if (!w.shakeX) w.shakeX = 0;
                if (!w.shakeY) w.shakeY = 0;
                w.shakeX += (Math.random() - 0.5) * shakeIntensity;
                w.shakeY += (Math.random() - 0.5) * shakeIntensity;
                if (w.hp <= 0) {
                    createExplosion(w.x + w.w / 2, w.y + w.h / 2, '#555');
                    score += 10;
                    walls.splice(wIdx, 1);
                    markSpatialGridDirty(); // Rebuild grid next frame
                }
            }
            return true;
        }
    }

    // Check collision with ALL crates directly (bypass spatial grid for reliability)
    for (let k = 0; k < crates.length; k++) {
        let c = crates[k];
        if (!c) continue;
        if (b.x > c.x && b.x < c.x + c.w && b.y > c.y && b.y < c.y + c.h) {
            // Create weapon-specific crate impact effect (wood splinters) with direction
            const bulletAngle = Math.atan2(b.vy, b.vx);
            createBulletImpact(b.x, b.y, b.type, '#d97706', b.dmg * 0.4, bulletAngle);
            let dmg = b.isEnemy ? b.dmg * 0.1 : b.dmg;
            c.hp -= dmg;
            c.lastDamageFrame = frame; // Track damage time for heal delay
            // Store hit position for crack rendering
            if (!c.lastHitX) c.lastHitX = [];
            if (!c.lastHitY) c.lastHitY = [];
            c.lastHitX.push(b.x - c.x); // Relative to crate position
            c.lastHitY.push(b.y - c.y);
            // Moderate crate shake based on damage
            const shakeIntensity = Math.min(12, dmg * 0.18);
            if (!c.shakeX) c.shakeX = 0;
            if (!c.shakeY) c.shakeY = 0;
            c.shakeX += (Math.random() - 0.5) * shakeIntensity;
            c.shakeY += (Math.random() - 0.5) * shakeIntensity;
            if (c.hp <= 0) destroyCrate(c, k);
            return true;
        }
    }

    // Enemy bullets damage player clones
    if (b.isEnemy && typeof playerClones !== 'undefined' && playerClones.length > 0) {
        for (let ci = playerClones.length - 1; ci >= 0; ci--) {
            const clone = playerClones[ci];
            if (Math.hypot(b.x - clone.x, b.y - clone.y) < clone.radius + 5) {
                let damage = b.dmg;
                const bulletAngle = Math.atan2(b.vy, b.vx);
                
                // Shield protection - blocks all damage while active (timer-only system)
                if (clone.shieldTime > 0) {
                    // CRITICAL FIX: Create impact effect for shield block
                    createBulletImpact(b.x, b.y, b.type || 'single', '#60a5fa', b.dmg * 0.3, bulletAngle);
                    // Shield blocks damage but does NOT decrease - only timer reduces shield
                    clone.hitFlash = 3;
                    return true;
                }
                
                // Armor protection - reduces damage
                if (clone.armor > 0) {
                    const armorReduction = Math.min(clone.armor, damage * 0.6);
                    clone.armor -= armorReduction * 0.5; // Armor degrades
                    damage -= armorReduction;
                }
                
                // CRITICAL FIX: Create weapon-specific impact effect for clone hit
                createBulletImpact(b.x, b.y, b.type || 'single', b.color || '#86efac', damage, bulletAngle);
                
                clone.hp -= Math.max(1, damage); // Minimum 1 damage
                clone.hitFlash = 5;
                if (clone.hp <= 0) {
                    // Clone death handled in updatePlayerClones
                }
                return true;
            }
        }
    }

    if (b.isEnemy && Math.hypot(b.x - player.x, b.y - player.y) < player.radius) {
        // Calculate bullet angle for impact direction
        const bulletAngle = Math.atan2(b.vy, b.vx);
        
        if (player.spawnWarmup > 0) {
            // CRITICAL FIX: Still create impact even during spawn shield
            createBulletImpact(b.x, b.y, b.type || 'single', b.color || '#666', b.dmg * 0.3, bulletAngle);
            return true;
        }
        if (player.shieldTime > 0) {
            // Shield blocks damage but still shows impact
            createBulletImpact(b.x, b.y, b.type || 'single', '#60a5fa', b.dmg * 0.5, bulletAngle);
            // Show blocked text for boss bullets
            if (b.isBoss) {
                addFloatText('BLOCKED!', player.x, player.y - 40, '#60a5fa');
            }
        } else {
            // CRITICAL FIX: Create weapon-specific impact effect for enemy bullets hitting player
            createBulletImpact(b.x, b.y, b.type || 'single', b.color || '#ef4444', b.dmg, bulletAngle);
            
            // Store hit position for crack rendering on player tank
            // Use local coordinates relative to tank center (rotated)
            if (!player.lastHitX) player.lastHitX = [];
            if (!player.lastHitY) player.lastHitY = [];
            const dx = b.x - player.x;
            const dy = b.y - player.y;
            // Rotate to tank's local space
            const localX = Math.cos(-player.angle) * dx - Math.sin(-player.angle) * dy;
            const localY = Math.sin(-player.angle) * dx + Math.cos(-player.angle) * dy;
            player.lastHitX.push(localX);
            player.lastHitY.push(localY);
            
            takeDamage(b.dmg);
            
            // ENEMY BULLET HEAT SYSTEM: Getting hit increases player's weapon temperature
            // Different weapon types cause different heat effects
            // Ice/freeze bullets COOL the weapon, others heat it up
            if (!DEBUG_NO_TEMPERATURE) {
                let heatChange = 0;
                const bulletType = b.type || b.weapon || 'cannon';
                
                // Heat values based on weapon type (simulates system stress from impacts)
                switch (bulletType) {
                    case 'ice':
                    case 'freeze':
                        // ICE bullets COOL the weapon (negative heat)
                        heatChange = -8;
                        break;
                    case 'fire':
                    case 'flame':
                        // Fire causes significant heat increase
                        heatChange = 15;
                        break;
                    case 'laser':
                    case 'gauss':
                        // Energy weapons cause high heat
                        heatChange = 12;
                        break;
                    case 'electric':
                        // Electric causes moderate heat
                        heatChange = 8;
                        break;
                    case 'rocket':
                    case 'explosive':
                        // Explosives cause high heat from impact shock
                        heatChange = 14;
                        break;
                    case 'shotgun':
                    case 'flak':
                        // Spread weapons cause moderate heat
                        heatChange = 6;
                        break;
                    case 'sniper':
                        // High penetration causes moderate heat
                        heatChange = 7;
                        break;
                    default:
                        // Standard bullets (cannon, twin, burst)
                        heatChange = 5;
                        break;
                }
                
                // Boss bullets cause 1.5x heat
                if (b.isBoss) {
                    heatChange = Math.floor(heatChange * 1.5);
                }
                
                // Apply heat change
                player.temperature = Math.max(player.baseTemperature, 
                    Math.min(100, player.temperature + heatChange));
            }
            
            // Show damage floating text for boss bullets (dramatic feedback)
            if (b.isBoss) {
                const dmgText = '-' + Math.ceil(b.dmg);
                const dmgColor = b.element === 'fire' ? '#ff6b35' : 
                                 b.element === 'ice' ? '#00bcd4' : 
                                 b.element === 'electric' ? '#ffeb3b' : '#ef4444';
                addFloatText(dmgText, player.x, player.y - 40, dmgColor);
            }
            
            // Apply elemental status effects from enemy bullets
            // BALANCED: Same mechanics as player ice weapon - 50% freeze, 100% slow
            if (b.element) {
                if (b.element === 'fire') {
                    player.burning = 180; // 3 seconds of burning at 60fps
                    addFloatText('BURNING!', player.x, player.y - 60, '#ff6b35');
                } else if (b.element === 'ice') {
                    // Balanced ice effect: 50% chance to freeze (same as player -> enemy)
                    // Always apply slow (100% chance)
                    const wasFrozen = player.frozen > 0;
                    const wasSlowed = player.slowed > 60;
                    
                    if (Math.random() < 0.5) {
                        player.frozen = 120; // 2 seconds frozen
                        player.temperature = 0; // Freeze drops temperature to 0°C
                        if (!wasFrozen) addFloatText('FROZEN!', player.x, player.y - 60, '#00bcd4');
                    } else if (!wasSlowed && !wasFrozen) {
                        addFloatText('SLOWED!', player.x, player.y - 60, '#87ceeb');
                    }
                    player.slowed = Math.max(player.slowed || 0, 240); // 4 seconds slowed
                } else if (b.element === 'electric') {
                    player.stunned = 90; // 1.5 seconds stunned
                    addFloatText('STUNNED!', player.x, player.y - 60, '#ffeb3b');
                }
            }
        }
        return true;
    }

    // Clone bullets damage enemies (treated like player bullets but simpler)
    if (b.owner === 'clone') {
        for (let j = enemies.length - 1; j >= 0; j--) {
            if (Math.hypot(b.x - enemies[j].x, b.y - enemies[j].y) < enemies[j].radius + 10) {
                // Calculate bullet angle for directional impact
                const bulletAngle = Math.atan2(b.vy, b.vx);
                
                if (enemyHasSpawnShield(enemies[j])) {
                    // CRITICAL FIX: Use createBulletImpact for consistent visual feedback
                    createBulletImpact(b.x, b.y, b.type || 'twin', '#8df7ff', 5, bulletAngle);
                    return true;
                }
                
                const cloneDamage = isNaN(b.dmg) ? 10 : b.dmg;
                enemies[j].hp = Math.max(0, (enemies[j].hp || 0) - cloneDamage);
                enemies[j].hitFlash = 5;
                // CRITICAL FIX: Use createBulletImpact for consistent visual feedback
                createBulletImpact(b.x, b.y, b.type || 'twin', '#86efac', cloneDamage, bulletAngle);
                
                // Clone kills contribute to player score but not kill streak
                if (isNaN(enemies[j].hp) || enemies[j].hp <= 0) {
                    // In DEMO mode, don't remove enemies - they respawn via checkDemoRespawns()
                    if (typeof demoActive === 'undefined' || !demoActive) {
                        score += 50;
                        createExplosion(enemies[j].x, enemies[j].y, enemies[j].color || '#dc2626');
                        enemies.splice(j, 1);
                    }
                }
                return true;
            }
        }
        
        // Clone bullets damage boss
        if (typeof boss !== 'undefined' && boss && boss.hp > 0) {
            if (Math.hypot(b.x - boss.x, b.y - boss.y) < boss.radius + 10) {
                const cloneBossDmg = isNaN(b.dmg) ? 10 : b.dmg;
                boss.hp = Math.max(0, (boss.hp || 0) - cloneBossDmg);
                // Create weapon-specific impact effect with bullet direction
                const bulletAngle = Math.atan2(b.vy, b.vx);
                createBulletImpact(b.x, b.y, b.type, '#86efac', cloneBossDmg, bulletAngle);
                if (boss.recentDamage) {
                    boss.recentDamage.push({ amount: b.dmg, frame: frame });
                }
                // Wake up sleeping boss
                if (boss.isSleeping && boss.accumulatedDamage !== undefined) {
                    boss.accumulatedDamage += b.dmg;
                }
                // CRITICAL: Check if boss dies from clone damage
                if (boss.hp <= 0) killBoss();
                return true;
            }
        }
        return false; // Clone bullets don't hit walls/crates (for simplicity)
    }

    if (!b.isEnemy) {
        // === NEAR-MISS BULLET DETECTION ===
        // Alert patrolling enemies when player bullets pass very close to them
        // This makes AI more realistic - they notice danger even when not directly hit
        const NEAR_MISS_RADIUS = 60; // Detection radius for near-miss
        const nearbyForDetection = getNearbyEnemies(b.x, b.y, NEAR_MISS_RADIUS + 30);
        for (let j of nearbyForDetection) {
            const enemy = enemies[j];
            if (!enemy || enemy.hp <= 0) continue;
            if (enemy.aiState !== 'patrol') continue; // Only affect patrolling enemies
            if (enemyHasSpawnShield(enemy)) continue; // Skip spawn-protected
            
            const distToEnemy = Math.hypot(b.x - enemy.x, b.y - enemy.y);
            // Near-miss: bullet is close but not hitting (between radius+10 and NEAR_MISS_RADIUS)
            if (distToEnemy > enemy.radius + 10 && distToEnemy < NEAR_MISS_RADIUS) {
                // Check if bullet is heading roughly toward or past the enemy
                const bulletAngle = Math.atan2(b.vy, b.vx);
                const toEnemyAngle = Math.atan2(enemy.y - b.y, enemy.x - b.x);
                let angleDiff = bulletAngle - toEnemyAngle;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                
                // Bullet passing within 45 degrees of enemy direction
                if (Math.abs(angleDiff) < Math.PI / 4) {
                    // Alert enemy - detected incoming fire!
                    alertEnemy(enemy, 'near_miss', true);
                    
                    // Visual indicator - subtle particle showing bullet whizz
                    if (Math.random() < 0.5) {
                        particles.push({
                            x: enemy.x + (Math.random() - 0.5) * 30,
                            y: enemy.y - 40,
                            vx: 0,
                            vy: -1,
                            life: 15,
                            color: '#fbbf24',
                            size: 2
                        });
                    }
                }
            }
        }
        
        // Use spatial grid to get only nearby enemies (O(1) average instead of O(n))
        const nearbyEnemyIndices = getNearbyEnemies(b.x, b.y, 50);
        for (let j of nearbyEnemyIndices) {
            const enemy = enemies[j];
            if (!enemy) continue; // Safety check
            if (Math.hypot(b.x - enemy.x, b.y - enemy.y) < enemy.radius + 10) {
                // Calculate bullet angle for impact effects
                const bulletAngle = Math.atan2(b.vy, b.vx);
                
                if (enemyHasSpawnShield(enemy)) {
                    // CRITICAL FIX: Create smaller impact for spawn-shielded enemies
                    createBulletImpact(b.x, b.y, b.type, '#8df7ff', b.dmg * 0.2, bulletAngle);
                    return true;
                }
                
                // Calculate final damage with multipliers and critical hits
                let finalDamage = b.dmg;
                let isCritical = false;
                
                // Apply base damage multiplier (permanent from dmgmult drops)
                const baseMult = player.baseDamageMultiplier || 1.0;
                
                // Apply temporary damage multiplier (from damage boost)
                const tempMult = (player.damageBoostTime > 0) ? (player.damageMultiplier || 1.0) : 1.0;
                
                finalDamage *= baseMult * tempMult;
                
                // Critical hit check
                if (player.criticalChance > 0 && Math.random() < player.criticalChance) {
                    isCritical = true;
                    finalDamage *= (player.criticalDamage || 2.5);
                }
                
                // Store the damage BEFORE magic shield absorbs it (for critical display)
                const damageBeforeShield = finalDamage;
                
                // Check magic shield first - absorbs damage before HP
                finalDamage = handleMagicShieldDamage(enemy, finalDamage);
                
                // Apply remaining damage to HP
                enemy.hp -= finalDamage;
                
                // ALERT ENEMY WHEN DAMAGED - switch from patrol to aggressive
                if (finalDamage > 0 && enemy.aiState === 'patrol') {
                    alertEnemy(enemy, 'damaged');
                }
                
                // Show critical hit with dramatic effect, OR regular damage floating text
                // FIX: Only show critical/damage if there was actual damage dealt
                // Use damageBeforeShield for critical display (total damage, including shielded)
                if (isCritical && damageBeforeShield > 0) {
                    // If shield absorbed some damage, show the original critical damage
                    // but also indicate shield absorption if all damage was blocked
                    if (finalDamage > 0) {
                        createCriticalHitEffect(enemy.x, enemy.y, damageBeforeShield);
                    } else {
                        // All damage absorbed by shield - show shield absorbed critical
                        addFloatText('SHIELDED!', enemy.x, enemy.y - 40, '#a855f7');
                    }
                } else if (finalDamage > 0) {
                    // Regular damage floating text - dramatic but less than critical
                    createEnemyDamageFloatText(enemy.x, enemy.y, finalDamage);
                }
                
                // Store hit position for crack rendering on tank
                // Use local coordinates relative to tank center (rotated)
                if (!enemy.lastHitX) enemy.lastHitX = [];
                if (!enemy.lastHitY) enemy.lastHitY = [];
                const dx = b.x - enemy.x;
                const dy = b.y - enemy.y;
                // Rotate to tank's local space
                const localX = Math.cos(-enemy.angle) * dx - Math.sin(-enemy.angle) * dy;
                const localY = Math.sin(-enemy.angle) * dx + Math.cos(-enemy.angle) * dy;
                enemy.lastHitX.push(localX);
                enemy.lastHitY.push(localY);
                // Moderate shake effect based on damage
                const shakeIntensity = Math.min(8, b.dmg * 0.12);
                if (!enemy.shakeX) enemy.shakeX = 0;
                if (!enemy.shakeY) enemy.shakeY = 0;
                enemy.shakeX += (Math.random() - 0.5) * shakeIntensity;
                enemy.shakeY += (Math.random() - 0.5) * shakeIntensity;
                
                // LIFESTEAL: Heal on hit based on FINAL damage (after multipliers and critical)
                // Each level adds 5% lifesteal (max level 5 = 25%)
                if (player.lifesteal > 0 && player.lifestealLevel > 0) {
                    const heal = finalDamage * player.lifesteal; // Use finalDamage, not b.dmg
                    if (heal > 0) {
                        player.hp = Math.min(player.maxHp, player.hp + heal);
                        // Create dramatic lifesteal heal effect
                        createLifestealHealEffect(enemy.x, enemy.y, player.x, player.y, heal, player.lifestealLevel);
                    }
                }
                enemy.hitFlash = 5;
                
                // Create weapon-specific impact effects with directional debris
                // Note: bulletAngle already defined at start of this collision check
                createBulletImpact(b.x, b.y, b.type, b.color, b.dmg, bulletAngle);
                
                // === AOE DAMAGE FOR ROCKET AND FLAK ===
                // Apply area damage to nearby enemies when rocket or flak bullet hits target
                if (b.type === 'aoe' || b.type === 'flak') {
                    const impactX = b.x;
                    const impactY = b.y;
                    // Rocket has larger explosion radius than flak
                    const aoeRadius = b.type === 'aoe' ? 120 : 80;
                    // Rocket does 50% AOE damage, flak does 35%
                    const aoeDamagePercent = b.type === 'aoe' ? 0.50 : 0.35;
                    
                    // === CREATE VISUAL AOE RING INDICATOR ===
                    // This shows players the actual AOE damage radius
                    const ringColor = b.type === 'aoe' ? '#ff4400' : '#ff8800';
                    const ringColor2 = b.type === 'aoe' ? '#ff6600' : '#a0522d';
                    // Outer expanding ring (shows max radius)
                    particles.push({
                        x: impactX, y: impactY, vx: 0, vy: 0,
                        life: 18, maxLife: 18,
                        color: ringColor,
                        size: aoeRadius * 0.6,
                        targetSize: aoeRadius,
                        type: 'aoeRing'
                    });
                    // Inner ring for visual depth
                    particles.push({
                        x: impactX, y: impactY, vx: 0, vy: 0,
                        life: 12, maxLife: 12,
                        color: ringColor2,
                        size: aoeRadius * 0.3,
                        targetSize: aoeRadius * 0.7,
                        type: 'aoeRing'
                    });
                    
                    // Screen shake for explosion
                    screenShake = Math.max(screenShake, b.type === 'aoe' ? 12 : 8);
                    
                    // Apply damage to all nearby enemies (except the one we just hit)
                    for (let k = 0; k < enemies.length; k++) {
                        const nearbyEnemy = enemies[k];
                        if (!nearbyEnemy || nearbyEnemy === enemy) continue; // Skip primary target
                        
                        const dist = Math.hypot(nearbyEnemy.x - impactX, nearbyEnemy.y - impactY);
                        if (dist < aoeRadius && dist > 0) {
                            // Skip enemies with spawn shield
                            if (enemyHasSpawnShield(nearbyEnemy)) continue;
                            
                            // Damage falloff based on distance
                            const damageFalloff = 1 - (dist / aoeRadius);
                            let aoeDamage = b.dmg * aoeDamagePercent * damageFalloff;
                            
                            // Apply player damage multipliers to AOE damage
                            const baseMult = player.baseDamageMultiplier || 1.0;
                            const tempMult = (player.damageBoostTime > 0) ? (player.damageMultiplier || 1.0) : 1.0;
                            aoeDamage *= baseMult * tempMult;
                            
                            // Check magic shield first
                            aoeDamage = handleMagicShieldDamage(nearbyEnemy, aoeDamage);
                            
                            // Apply damage
                            nearbyEnemy.hp -= aoeDamage;
                            nearbyEnemy.hitFlash = 6;
                            
                            // LIFESTEAL: Apply to AOE damage too
                            if (player.lifesteal > 0 && player.lifestealLevel > 0 && aoeDamage > 0) {
                                const aoeHeal = aoeDamage * player.lifesteal;
                                if (aoeHeal > 0) {
                                    player.hp = Math.min(player.maxHp, player.hp + aoeHeal);
                                    createLifestealHealEffect(nearbyEnemy.x, nearbyEnemy.y, player.x, player.y, aoeHeal, player.lifestealLevel);
                                }
                            }
                            
                            // Push enemy away from explosion
                            const pushAngle = Math.atan2(nearbyEnemy.y - impactY, nearbyEnemy.x - impactX);
                            const pushForce = 15 * damageFalloff;
                            nearbyEnemy.x += Math.cos(pushAngle) * pushForce;
                            nearbyEnemy.y += Math.sin(pushAngle) * pushForce;
                            
                            // Show AOE damage floating text
                            if (aoeDamage > 0) {
                                addFloatText('-' + Math.ceil(aoeDamage), nearbyEnemy.x, nearbyEnemy.y - 30, b.type === 'aoe' ? '#ff4400' : '#a0522d');
                            }
                            
                            // Kill enemy if HP depleted
                            if (nearbyEnemy.hp <= 0) {
                                const killIdx = enemies.indexOf(nearbyEnemy);
                                if (killIdx >= 0) killEnemy(killIdx);
                            }
                        }
                    }
                    
                    // Also damage nearby destructible walls
                    for (let wi = walls.length - 1; wi >= 0; wi--) {
                        const w = walls[wi];
                        if (!w || !w.destructible) continue;
                        const wallCenterX = w.x + w.w / 2;
                        const wallCenterY = w.y + w.h / 2;
                        const dist = Math.hypot(wallCenterX - impactX, wallCenterY - impactY);
                        if (dist < aoeRadius) {
                            const damageFalloff = 1 - (dist / aoeRadius);
                            const wallDamage = b.dmg * aoeDamagePercent * damageFalloff;
                            w.hp -= wallDamage;
                            w.lastDamageFrame = frame;
                            if (w.hp <= 0) {
                                createExplosion(wallCenterX, wallCenterY, '#555');
                                score += 10;
                                walls.splice(wi, 1);
                                markSpatialGridDirty();
                            }
                        }
                    }
                    
                    // Also damage nearby crates
                    for (let ci = crates.length - 1; ci >= 0; ci--) {
                        const c = crates[ci];
                        if (!c) continue;
                        const crateCenterX = c.x + c.w / 2;
                        const crateCenterY = c.y + c.h / 2;
                        const dist = Math.hypot(crateCenterX - impactX, crateCenterY - impactY);
                        if (dist < aoeRadius) {
                            const damageFalloff = 1 - (dist / aoeRadius);
                            const crateDamage = b.dmg * aoeDamagePercent * damageFalloff;
                            c.hp -= crateDamage;
                            c.lastDamageFrame = frame;
                            if (c.hp <= 0) destroyCrate(c, ci);
                        }
                    }
                }
                
                // Resolve elemental attachment even if bullet metadata is missing
                // Check b.element first, then b.type, then bullet color, then player.weapon as fallback
                let bulletElement = b.element;
                if (!bulletElement) {
                    if (b.type === 'ice' || b.color === '#3b82f6') bulletElement = 'ice';
                    else if (b.type === 'fire' || b.color === '#ff4500') bulletElement = 'fire';
                    else if (b.type === 'electric' || b.color === '#a855f7') bulletElement = 'electric';
                    // Also check player's current weapon as final fallback for player bullets
                    else if (!b.isEnemy && player.weapon) {
                        if (player.weapon === 'ice') bulletElement = 'ice';
                        else if (player.weapon === 'fire') bulletElement = 'fire';
                        else if (player.weapon === 'electric') bulletElement = 'electric';
                    }
                }
                
                // Apply elemental status effects to enemies (use bulletElement, not player.weapon)
                if (bulletElement === 'ice') {
                    // Ice weapon: Freeze enemy (50% chance) or slow (100% chance)
                    if (!enemy.frozenTime) enemy.frozenTime = 0;
                    if (!enemy.slowedTime) enemy.slowedTime = 0;
                    
                    const wasFrozen = enemy.frozenTime > 0;
                    const wasSlowed = enemy.slowedTime > 60; // Consider already slowed if > 1 second remaining
                    
                    if (Math.random() < 0.5) {
                        enemy.frozenTime = 150; // 2.5 seconds frozen (buffed from 1.5s)
                        if (!wasFrozen) addFloatText('FROZEN', enemy.x, enemy.y - 30, '#00bcd4');
                    } else if (!wasSlowed && !wasFrozen) {
                        // Show SLOWED text only when not already affected
                        addFloatText('SLOWED', enemy.x, enemy.y - 30, '#87ceeb');
                    }
                    enemy.slowedTime = Math.max(enemy.slowedTime, 300); // 5 seconds slowed (buffed from 3s)
                    
                } else if (bulletElement === 'fire') {
                    // Fire weapon: Burning damage over time
                    const wasBurning = enemy.burningTime && enemy.burningTime > 60;
                    if (!enemy.burningTime) enemy.burningTime = 0;
                    enemy.burningTime = 180; // 3 seconds burning (deals 1 dmg per second)
                    if (!wasBurning) addFloatText('BURNING', enemy.x, enemy.y - 30, '#ff6b35');
                    
                } else if (bulletElement === 'electric') {
                    // Electric weapon: Stun (disables shooting) + knockback + dizzy effect
                    const wasStunned = enemy.stunnedTime && enemy.stunnedTime > 30;
                    if (!enemy.stunnedTime) enemy.stunnedTime = 0;
                    enemy.stunnedTime = 90; // 1.5 seconds stunned (can't shoot)
                    if (!wasStunned) addFloatText('STUNNED', enemy.x, enemy.y - 30, '#ffeb3b');
                    
                    // Knockback effect - push enemy back
                    const knockbackForce = 150;
                    const knockbackAngle = Math.atan2(enemy.y - b.y, enemy.x - b.x);
                    enemy.vx = Math.cos(knockbackAngle) * knockbackForce;
                    enemy.vy = Math.sin(knockbackAngle) * knockbackForce;
                    
                    // Dizzy effect - lasts longer than stun, reduces accuracy
                    const wasDizzy = enemy.dizzy && enemy.dizzy > 60;
                    if (!enemy.dizzy) enemy.dizzy = 0;
                    enemy.dizzy = 240; // 4 seconds dizzy (much longer than stun)
                    enemy.dizzyGeneration = 0; // Direct hit - can spread to others
                    if (!wasDizzy) addFloatText('DIZZY!', enemy.x, enemy.y - 50, '#a855f7');
                    
                    // Initial impact - dramatic electric explosion burst
                    for (let p = 0; p < 25; p++) {
                        const elecAngle = (Math.PI * 2 * p) / 25;
                        const speed = 3 + Math.random() * 5;
                        particles.push({
                            x: enemy.x,
                            y: enemy.y,
                            vx: Math.cos(elecAngle) * speed,
                            vy: Math.sin(elecAngle) * speed,
                            life: 25 + Math.random() * 10,
                            color: p % 3 === 0 ? '#ffffff' : (p % 3 === 1 ? '#ffeb3b' : '#a855f7'),
                            size: Math.random() * 5 + 2
                        });
                    }
                    
                    // Electric arc lines shooting outward
                    for (let arc = 0; arc < 6; arc++) {
                        const arcAngle = (Math.PI * 2 / 6) * arc + Math.random() * 0.5;
                        const arcLength = 30 + Math.random() * 20;
                        const segments = 5;
                        for (let s = 0; s < segments; s++) {
                            const t = s / segments;
                            const zigzag = (Math.random() - 0.5) * 12;
                            const perpAngle = arcAngle + Math.PI / 2;
                            particles.push({
                                x: enemy.x + Math.cos(arcAngle) * arcLength * t + Math.cos(perpAngle) * zigzag,
                                y: enemy.y + Math.sin(arcAngle) * arcLength * t + Math.sin(perpAngle) * zigzag,
                                vx: Math.cos(arcAngle) * 2,
                                vy: Math.sin(arcAngle) * 2,
                                life: 15 + Math.random() * 8,
                                color: s % 2 === 0 ? '#ffeb3b' : '#a855f7',
                                size: 3 + Math.random() * 2
                            });
                        }
                    }
                    
                    // Schedule chain lightning effect with delay (more dramatic)
                    // Store enemy reference for setTimeout closure
                    const hitEnemyX = enemy.x;
                    const hitEnemyY = enemy.y;
                    const hitEnemyIdx = j;
                    const chainRange = WEAPONS.electric?.chainRange || 200;
                    setTimeout(() => {
                        // Find nearby enemies for chain lightning
                        const chainTargets = [];
                        for (let k = 0; k < enemies.length; k++) {
                            if (k !== hitEnemyIdx && enemies[k]) {
                                const chainDist = Math.hypot(enemies[k].x - hitEnemyX, enemies[k].y - hitEnemyY);
                                if (chainDist < chainRange && !enemyHasSpawnShield(enemies[k])) {
                                    chainTargets.push(k);
                                }
                            }
                        }
                        
                        // Apply chain lightning to up to 3 nearest targets
                        chainTargets.sort((a, b) => {
                            const distA = Math.hypot(enemies[a].x - hitEnemyX, enemies[a].y - hitEnemyY);
                            const distB = Math.hypot(enemies[b].x - hitEnemyX, enemies[b].y - hitEnemyY);
                            return distA - distB;
                        });
                        
                        for (let idx = 0; idx < Math.min(3, chainTargets.length); idx++) {
                            const k = chainTargets[idx];
                            if (!enemies[k]) continue;
                            
                            // Delay each chain slightly for dramatic effect
                            setTimeout(() => {
                                if (!enemies[k]) return;
                                
                                const chainDamage = b.dmg * 0.5; // 50% damage to chained targets
                                enemies[k].hp -= chainDamage;
                                enemies[k].hitFlash = 10;
                                
                                // LIFESTEAL: Apply lifesteal to chain lightning damage
                                if (player.lifesteal > 0 && player.lifestealLevel > 0 && chainDamage > 0) {
                                    const chainHeal = chainDamage * player.lifesteal;
                                    if (chainHeal > 0) {
                                        player.hp = Math.min(player.maxHp, player.hp + chainHeal);
                                        // Electric-themed heal effect
                                        createLifestealHealEffect(enemies[k].x, enemies[k].y, player.x, player.y, chainHeal, player.lifestealLevel);
                                    }
                                }
                                
                                // Electric flash effect - tank turns white and flickers
                                enemies[k].electricFlash = 45; // 0.75 second electric flash animation
                                
                                // Apply stun to chained targets too
                                if (!enemies[k].stunnedTime) enemies[k].stunnedTime = 0;
                                enemies[k].stunnedTime = Math.max(enemies[k].stunnedTime, 45); // 0.75 second stun
                                const wasChainDizzy = enemies[k].dizzy && enemies[k].dizzy > 30;
                                if (!enemies[k].dizzy) enemies[k].dizzy = 0;
                                enemies[k].dizzy = Math.max(enemies[k].dizzy, 150); // 2.5 second dizzy (chain hit - less than direct)
                                enemies[k].dizzyGeneration = 1; // Chain target - weaker spread than direct hit
                                if (!wasChainDizzy) addFloatText('DIZZY!', enemies[k].x, enemies[k].y - 50, '#c084fc');
                                
                                // Dramatic forked lightning bolt animation
                                // Use stored hit position since original enemy may be dead
                                const sourceX = hitEnemyX;
                                const sourceY = hitEnemyY;
                                const targetX = enemies[k].x;
                                const targetY = enemies[k].y;
                                const boltAngle = Math.atan2(targetY - sourceY, targetX - sourceX);
                                const boltDist = Math.hypot(targetX - sourceX, targetY - sourceY);
                                
                                // Main lightning bolt with zigzag
                                const mainSegments = 12;
                                for (let s = 0; s <= mainSegments; s++) {
                                    const t = s / mainSegments;
                                    const zigzagAmp = (s > 0 && s < mainSegments) ? 20 : 0;
                                    const zigzag = (Math.random() - 0.5) * zigzagAmp;
                                    const perpAngle = boltAngle + Math.PI / 2;
                                    
                                    const px = sourceX + (targetX - sourceX) * t + Math.cos(perpAngle) * zigzag;
                                    const py = sourceY + (targetY - sourceY) * t + Math.sin(perpAngle) * zigzag;
                                    
                                    // Main bolt particles
                                    particles.push({
                                        x: px,
                                        y: py,
                                        vx: (Math.random() - 0.5) * 1.5,
                                        vy: (Math.random() - 0.5) * 1.5,
                                        life: 18 + Math.random() * 8,
                                        color: s % 2 === 0 ? '#ffeb3b' : '#ffffff',
                                        size: 4 + Math.random() * 3
                                    });
                                    
                                    // Glow particles around main bolt
                                    if (s % 2 === 0) {
                                        particles.push({
                                            x: px + (Math.random() - 0.5) * 8,
                                            y: py + (Math.random() - 0.5) * 8,
                                            vx: (Math.random() - 0.5) * 3,
                                            vy: (Math.random() - 0.5) * 3,
                                            life: 12,
                                            color: '#a855f7',
                                            size: 2 + Math.random() * 2
                                        });
                                    }
                                    
                                    // Fork branches at random points
                                    if (s > 2 && s < mainSegments - 2 && Math.random() < 0.3) {
                                        const forkAngle = boltAngle + (Math.random() > 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.4);
                                        const forkLength = 20 + Math.random() * 15;
                                        for (let f = 0; f < 4; f++) {
                                            const ft = f / 4;
                                            const forkZigzag = (Math.random() - 0.5) * 8;
                                            particles.push({
                                                x: px + Math.cos(forkAngle) * forkLength * ft + Math.cos(forkAngle + Math.PI/2) * forkZigzag,
                                                y: py + Math.sin(forkAngle) * forkLength * ft + Math.sin(forkAngle + Math.PI/2) * forkZigzag,
                                                vx: Math.cos(forkAngle) * 2,
                                                vy: Math.sin(forkAngle) * 2,
                                                life: 10 + Math.random() * 5,
                                                color: '#a855f7',
                                                size: 2 + Math.random() * 2
                                            });
                                        }
                                    }
                                }
                                
                                // Electric impact burst at target
                                for (let p = 0; p < 20; p++) {
                                    const angle = (Math.PI * 2 * p) / 20;
                                    const speed = 2 + Math.random() * 4;
                                    particles.push({
                                        x: enemies[k].x,
                                        y: enemies[k].y,
                                        vx: Math.cos(angle) * speed,
                                        vy: Math.sin(angle) * speed,
                                        life: 20 + Math.random() * 10,
                                        color: p % 2 === 0 ? '#ffeb3b' : '#a855f7',
                                        size: Math.random() * 4 + 2
                                    });
                                }
                                
                                addFloatText('CHAIN -' + Math.ceil(b.dmg * 0.5), enemies[k].x, enemies[k].y - 30, '#a855f7');
                                
                                if (enemies[k].hp <= 0) killEnemy(k);
                            }, idx * 200); // 200ms delay between each chain (increased)
                        }
                    }, 300); // 300ms initial delay for dramatic effect (increased)
                }
                
                if (enemy.hp <= 0) {
                    // Find current index in enemies array (may have changed due to other kills)
                    const currentIdx = enemies.indexOf(enemy);
                    if (currentIdx >= 0) killEnemy(currentIdx);
                }
                return true;
            }
        }
        if (boss && Math.hypot(b.x - boss.x, b.y - boss.y) < boss.radius) {
            // Calculate final boss damage with multipliers and critical hits (same as enemy)
            let bossDmg = isNaN(b.dmg) ? 10 : b.dmg;
            let isBossCrit = false;
            
            // Apply damage multipliers
            const baseMult = player.baseDamageMultiplier || 1.0;
            const tempMult = (player.damageBoostTime > 0) ? (player.damageMultiplier || 1.0) : 1.0;
            bossDmg *= baseMult * tempMult;
            
            // Critical hit check
            if (player.criticalChance > 0 && Math.random() < player.criticalChance) {
                isBossCrit = true;
                bossDmg *= (player.criticalDamage || 2.5);
            }
            
            boss.hp = Math.max(0, (boss.hp || 0) - bossDmg);
            
            // Show critical hit effect on boss
            if (isBossCrit) {
                createCriticalHitEffect(boss.x, boss.y, bossDmg);
            }
            
            // LIFESTEAL on boss hit - heal based on FINAL damage
            if (player.lifesteal > 0 && player.lifestealLevel > 0) {
                const heal = bossDmg * player.lifesteal; // Use final bossDmg
                if (heal > 0) {
                    player.hp = Math.min(player.maxHp, player.hp + heal);
                    createLifestealHealEffect(boss.x, boss.y, player.x, player.y, heal, player.lifestealLevel);
                }
            }
            
            // Track damage for ultimate trigger (cracks now auto-generated based on HP%)
            if (boss.recentDamage) {
                boss.recentDamage.push({ amount: bossDmg, frame: frame });
            }
            // Track accumulated damage for sleeping boss
            if (boss.isSleeping && boss.accumulatedDamage !== undefined) {
                boss.accumulatedDamage += b.dmg;
            }
            // Create weapon-specific impact effect on boss (extra dramatic) with directional debris
            const bulletAngle = Math.atan2(b.vy, b.vx);
            createBulletImpact(b.x, b.y, b.type, b.color, bossDmg, bulletAngle);
            
            // === AOE DAMAGE FOR ROCKET AND FLAK HITTING BOSS ===
            // When AOE weapons hit boss, also damage nearby enemies
            if (b.type === 'aoe' || b.type === 'flak') {
                const impactX = b.x;
                const impactY = b.y;
                const aoeRadius = b.type === 'aoe' ? 120 : 80;
                const aoeDamagePercent = b.type === 'aoe' ? 0.50 : 0.35;
                
                // === CREATE VISUAL AOE RING INDICATOR FOR BOSS HIT ===
                const ringColor = b.type === 'aoe' ? '#ff4400' : '#ff8800';
                const ringColor2 = b.type === 'aoe' ? '#ff6600' : '#a0522d';
                particles.push({
                    x: impactX, y: impactY, vx: 0, vy: 0,
                    life: 18, maxLife: 18,
                    color: ringColor,
                    size: aoeRadius * 0.6,
                    targetSize: aoeRadius,
                    type: 'aoeRing'
                });
                particles.push({
                    x: impactX, y: impactY, vx: 0, vy: 0,
                    life: 12, maxLife: 12,
                    color: ringColor2,
                    size: aoeRadius * 0.3,
                    targetSize: aoeRadius * 0.7,
                    type: 'aoeRing'
                });
                
                screenShake = Math.max(screenShake, b.type === 'aoe' ? 15 : 10);
                
                // Damage nearby enemies from boss explosion
                for (let k = 0; k < enemies.length; k++) {
                    const nearbyEnemy = enemies[k];
                    if (!nearbyEnemy) continue;
                    
                    const dist = Math.hypot(nearbyEnemy.x - impactX, nearbyEnemy.y - impactY);
                    if (dist < aoeRadius && dist > 0) {
                        if (enemyHasSpawnShield(nearbyEnemy)) continue;
                        
                        const damageFalloff = 1 - (dist / aoeRadius);
                        let aoeDamage = b.dmg * aoeDamagePercent * damageFalloff;
                        aoeDamage *= baseMult * tempMult; // Apply multipliers
                        aoeDamage = handleMagicShieldDamage(nearbyEnemy, aoeDamage);
                        
                        nearbyEnemy.hp -= aoeDamage;
                        nearbyEnemy.hitFlash = 6;
                        
                        if (player.lifesteal > 0 && player.lifestealLevel > 0 && aoeDamage > 0) {
                            const aoeHeal = aoeDamage * player.lifesteal;
                            if (aoeHeal > 0) {
                                player.hp = Math.min(player.maxHp, player.hp + aoeHeal);
                                createLifestealHealEffect(nearbyEnemy.x, nearbyEnemy.y, player.x, player.y, aoeHeal, player.lifestealLevel);
                            }
                        }
                        
                        const pushAngle = Math.atan2(nearbyEnemy.y - impactY, nearbyEnemy.x - impactX);
                        nearbyEnemy.x += Math.cos(pushAngle) * 15 * damageFalloff;
                        nearbyEnemy.y += Math.sin(pushAngle) * 15 * damageFalloff;
                        
                        if (aoeDamage > 0) {
                            addFloatText('-' + Math.ceil(aoeDamage), nearbyEnemy.x, nearbyEnemy.y - 30, b.type === 'aoe' ? '#ff4400' : '#a0522d');
                        }
                        
                        if (nearbyEnemy.hp <= 0) {
                            const killIdx = enemies.indexOf(nearbyEnemy);
                            if (killIdx >= 0) killEnemy(killIdx);
                        }
                    }
                }
            }
            
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
    const invisActive = player.invisible && player.invisibleTime > 0;
    const invisRevealDistance = 220;
    
    // Periodically rebalance surround sectors to prevent clustering
    updateSurroundRebalance(dt);
    
    // CRITICAL FIX: When only few enemies remain, force ALL to pursue player
    // This prevents enemies from hiding/orbiting when they should be attacking
    const fewEnemiesRemaining = enemies.length <= 3;
    const forceAllPursuit = fewEnemiesRemaining || (player.totalEnemiesInWave > 0 && enemies.length <= Math.ceil(player.totalEnemiesInWave * 0.15));
    
    // OPTIMIZATION: Pre-compute distances using squared values to avoid sqrt when possible
    let distances = enemies.map((e, idx) => {
        const dx = e.x - player.x;
        const dy = e.y - player.y;
        return {
            enemy: e,
            index: idx,
            distSq: dx * dx + dy * dy, // Squared distance for comparisons
            distance: Math.sqrt(dx * dx + dy * dy) // Actual distance when needed
        };
    });
    distances.sort((a, b) => a.distSq - b.distSq); // Sort by squared distance (same order)
    
    // When few enemies remain, ALL become attackers regardless of distance
    if (forceAllPursuit) {
        for (let entry of distances) {
            if (invisActive && entry.distance > invisRevealDistance) continue;
            attackers.push(entry.enemy);
        }
    } else {
        for (let entry of distances) {
            if (entry.distance > ENEMY_AGGRO_RADIUS) break;
            if (invisActive && entry.distance > invisRevealDistance) continue;
            attackers.push(entry.enemy);
            if (attackers.length >= MAX_SIMULTANEOUS_ATTACKERS) break;
        }
    }
    const rankMap = new Map();
    distances.forEach((entry, idx) => rankMap.set(entry.enemy, idx));

    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        ensureGuardData(e);
        resolveEnemyWallPenetration(e);
        if (e.detour && typeof e.detour.ttl === 'number') {
            e.detour.ttl -= dt;
            if (e.detour.ttl <= 0) e.detour = null;
        }
        if (!e.maxHp) e.maxHp = ENEMY_TIERS[e.id]?.hp || e.hp;
        const hpRatio = Math.max(0, e.hp / (e.maxHp || 1));
        const intelligence = ENEMY_TIERS[e.id]?.intelligence || 1;
        
        // Smart retreat system based on HP and tier
        if (hpRatio < LOW_HP_RETREAT_THRESHOLD && !e.retreatTimer) {
            // Higher tier enemies retreat longer and more strategically
            e.retreatTimer = 180 + (intelligence * 60);
            e.isRetreating = true;
        }
        
        if (e.retreatTimer && e.retreatTimer > 0) {
            e.retreatTimer = Math.max(0, e.retreatTimer - dt);
            e.needsBackup = e.retreatTimer > 0;
            
            // If retreated far enough, can re-engage
            const distToPlayer = Math.hypot(e.x - player.x, e.y - player.y);
            if (distToPlayer > ENEMY_RETREAT_MAX_DISTANCE) {
                e.retreatTimer = Math.max(0, e.retreatTimer - dt * 3); // Faster timer decay when far
            }
        } else {
            e.needsBackup = false;
            e.isRetreating = false;
        }
        if (e.hitFlash > 0) e.hitFlash -= dt;
        // Decrement alert indicator timer (animated (!) above status bar)
        if (e.alertIndicator > 0) e.alertIndicator -= dt;
        // Decrement chain explosion immunity timer
        if (e.chainExplosionImmune > 0) e.chainExplosionImmune -= dt;
        if (e.recoil === undefined) e.recoil = 0;
        else if (e.recoil > 0) {
            e.recoil *= Math.pow(0.85, dt);
            if (e.recoil < 0.05) e.recoil = 0;
        }
        
        // Visual turret recoil decay - recoil follows turret angle for accurate visual feedback
        if (e.turretRecoilOffsetX !== undefined && (e.turretRecoilOffsetX !== 0 || e.turretRecoilOffsetY !== 0)) {
            const decay = e.turretRecoilDecay || 0.70;
            // Calculate current recoil magnitude
            const recoilMagnitude = Math.hypot(e.turretRecoilOffsetX, e.turretRecoilOffsetY);
            const newMagnitude = recoilMagnitude * Math.pow(decay, dt);
            
            if (newMagnitude < 0.01) {
                // Snap to zero when very small
                e.turretRecoilOffsetX = 0;
                e.turretRecoilOffsetY = 0;
            } else {
                // Recalculate offset based on CURRENT turret angle (backward direction)
                // This keeps recoil visual aligned with turret even as it rotates
                const kickAngle = e.turretAngle - Math.PI;
                e.turretRecoilOffsetX = Math.cos(kickAngle) * newMagnitude;
                e.turretRecoilOffsetY = Math.sin(kickAngle) * newMagnitude;
            }
        }
        
        // Decay electric flash effect (from chain lightning)
        if (e.electricFlash && e.electricFlash > 0) {
            e.electricFlash -= dt;
        }
        
        // Decay shake effects
        if (e.shakeX) {
            e.shakeX *= 0.82;
            if (Math.abs(e.shakeX) < 0.15) e.shakeX = 0;
        }
        if (e.shakeY) {
            e.shakeY *= 0.82;
            if (Math.abs(e.shakeY) < 0.15) e.shakeY = 0;
        }
        
        // Dramatic damage smoke for damaged enemies
        const enemyHpRatio = e.hp / (e.maxHp || e.hp);
        if (enemyHpRatio < 0.6 && !(e.frozenTime && e.frozenTime > 0)) {
            // Smoke intensity based on damage level
            const smokeChance = (0.6 - enemyHpRatio) * 0.25 * dt;
            if (Math.random() < smokeChance) {
                // Smoke from engine area (rear of tank)
                const smokeOffsetX = Math.cos(e.angle + Math.PI) * 18;
                const smokeOffsetY = Math.sin(e.angle + Math.PI) * 18;
                particles.push({
                    x: e.x + smokeOffsetX + (Math.random() - 0.5) * 12,
                    y: e.y + smokeOffsetY + (Math.random() - 0.5) * 12,
                    vx: (Math.random() - 0.5) * 1.2,
                    vy: -1.8 - Math.random() * 1.5,
                    life: 45 + Math.random() * 25,
                    color: enemyHpRatio < 0.25 ? '#1a1a1a' : '#444444',
                    size: Math.random() * (enemyHpRatio < 0.25 ? 9 : 6) + 3,
                    gravity: -0.025,
                    drag: 0.02
                });
            }
            
            // Fire/sparks when critically damaged
            if (enemyHpRatio < 0.25 && Math.random() < 0.12 * dt) {
                particles.push({
                    x: e.x + (Math.random() - 0.5) * 25,
                    y: e.y + (Math.random() - 0.5) * 25,
                    vx: (Math.random() - 0.5) * 5,
                    vy: -2.5 - Math.random() * 3,
                    life: 12 + Math.random() * 12,
                    color: Math.random() < 0.4 ? '#ff4400' : '#ffaa00',
                    size: Math.random() * 2.5 + 1,
                    gravity: 0.12,
                    drag: 0.02
                });
            }
        }
        
        // Process enemy status effects
        if (e.burningTime && e.burningTime > 0) {
            e.burningTime -= dt;
            let burnDamage = 1.0 * dt; // 1 damage per second
            // Check magic shield first - absorbs burn damage
            burnDamage = handleMagicShieldDamage(e, burnDamage);
            e.hp -= burnDamage;
            
            // LIFESTEAL: Apply lifesteal to burn DOT damage
            if (player.lifesteal > 0 && player.lifestealLevel > 0 && burnDamage > 0) {
                const burnHeal = burnDamage * player.lifesteal;
                if (burnHeal > 0) {
                    player.hp = Math.min(player.maxHp, player.hp + burnHeal);
                    // Subtle heal particles for DOT (less dramatic than direct hit)
                    if (Math.random() < 0.1 * dt) {
                        particles.push({
                            x: player.x + (Math.random() - 0.5) * 15,
                            y: player.y + (Math.random() - 0.5) * 15,
                            vx: (Math.random() - 0.5) * 1.5,
                            vy: -1.5 - Math.random(),
                            life: 15,
                            color: '#22c55e',
                            size: 3,
                            gravity: -0.03
                        });
                    }
                }
            }
            
            // Burning particles
            if (Math.random() < 0.3 * dt) {
                particles.push({
                    x: e.x + (Math.random() - 0.5) * 40,
                    y: e.y + (Math.random() - 0.5) * 40,
                    vx: (Math.random() - 0.5) * 2,
                    vy: -2 - Math.random(),
                    life: 20 + Math.random() * 15,
                    color: Math.random() < 0.5 ? '#ff6b35' : '#ff9500',
                    size: Math.random() * 5 + 2,
                    gravity: -0.02
                });
            }
            if (e.hp <= 0) { killEnemy(i); continue; }
        }
        
        if (e.frozenTime && e.frozenTime > 0) {
            e.frozenTime -= dt;
            // Frozen enemies cannot move
            e.vx = 0;
            e.vy = 0;
            
            // Frozen damage: deal up to 10% max HP over the freeze duration as damage/second
            // Freeze duration is typically 120 frames (2 seconds), so damage per frame = 10% HP / 120
            const frozenDamagePercent = 0.10; // 10% max HP total
            const freezeDuration = 120; // Standard freeze duration
            const damagePerFrame = (e.maxHp || e.hp) * frozenDamagePercent / freezeDuration;
            let frozenDamage = damagePerFrame * dt;
            // Check magic shield first - absorbs frozen damage
            frozenDamage = handleMagicShieldDamage(e, frozenDamage);
            e.hp -= frozenDamage;
            
            // LIFESTEAL: Apply lifesteal to frozen DOT damage
            if (player.lifesteal > 0 && player.lifestealLevel > 0 && frozenDamage > 0) {
                const frozenHeal = frozenDamage * player.lifesteal;
                if (frozenHeal > 0) {
                    player.hp = Math.min(player.maxHp, player.hp + frozenHeal);
                    // Subtle heal particles for DOT (ice-themed)
                    if (Math.random() < 0.08 * dt) {
                        particles.push({
                            x: player.x + (Math.random() - 0.5) * 15,
                            y: player.y + (Math.random() - 0.5) * 15,
                            vx: (Math.random() - 0.5) * 1.5,
                            vy: -1.5 - Math.random(),
                            life: 15,
                            color: '#4ade80',
                            size: 3,
                            gravity: -0.03
                        });
                    }
                }
            }
            
            // Show frozen damage indicator occasionally
            if (Math.random() < 0.05 * dt) {
                addFloatText('-' + Math.ceil(damagePerFrame * 10), e.x + (Math.random() - 0.5) * 20, e.y - 20, '#00bcd4');
            }
            
            // Ice particles
            if (Math.random() < 0.2 * dt) {
                particles.push({
                    x: e.x + (Math.random() - 0.5) * 40,
                    y: e.y + (Math.random() - 0.5) * 40,
                    vx: (Math.random() - 0.5) * 2,
                    vy: -1 - Math.random() * 0.5,
                    life: 30 + Math.random() * 20,
                    color: Math.random() < 0.5 ? '#00bcd4' : '#4dd0e1',
                    size: Math.random() * 4 + 2,
                    gravity: 0.01
                });
            }
            
            // Check if enemy dies from freeze damage
            if (e.hp <= 0) { killEnemy(i); continue; }
        }
        
        if (e.stunnedTime && e.stunnedTime > 0) {
            e.stunnedTime -= dt;
            // Stunned enemies cannot shoot (handled in shooting logic)
            // Electric spark particles
            if (Math.random() < 0.4 * dt) {
                particles.push({
                    x: e.x + (Math.random() - 0.5) * 50,
                    y: e.y + (Math.random() - 0.5) * 50,
                    vx: (Math.random() - 0.5) * 3,
                    vy: (Math.random() - 0.5) * 3,
                    life: 10 + Math.random() * 10,
                    color: '#ffeb3b',
                    size: Math.random() * 3 + 1
                });
            }
        }
        
        // Dizzy effect - continues after stun wears off
        if (e.dizzy && e.dizzy > 0) {
            e.dizzy -= dt;
            // Dizzy causes slight movement wobble
            if (!e.stunnedTime || e.stunnedTime <= 0) {
                e.vx += (Math.random() - 0.5) * 2 * dt;
                e.vy += (Math.random() - 0.5) * 2 * dt;
            }
            // Occasional dizzy spark particles (less frequent than stun)
            if (Math.random() < 0.15 * dt) {
                particles.push({
                    x: e.x + (Math.random() - 0.5) * 40,
                    y: e.y - 30 + (Math.random() - 0.5) * 20,
                    vx: (Math.random() - 0.5) * 2,
                    vy: -1 - Math.random(),
                    life: 15,
                    color: '#a855f7',
                    size: Math.random() * 2 + 1
                });
            }
            
            // Dizzy spreading - infect nearby enemies with reduced effect
            // The spread amount is always LESS than the spreader's current dizzy
            const DIZZY_SPREAD_RANGE = 80; // Range to spread dizzy
            const DIZZY_SPREAD_CHANCE = 0.02 * dt; // Chance per frame to spread
            const DIZZY_SPREAD_DECAY = 0.5; // Spread only 50% of current dizzy
            const DIZZY_MIN_TO_SPREAD = 45; // Need at least 0.75s dizzy to spread
            const DIZZY_MIN_SPREAD_AMOUNT = 20; // Minimum amount that can be spread
            
            // Track dizzy generation to prevent infinite chains
            if (!e.dizzyGeneration) e.dizzyGeneration = 0;
            const maxGenerations = 3; // Max chain depth
            
            if (e.dizzy > DIZZY_MIN_TO_SPREAD && e.dizzyGeneration < maxGenerations && Math.random() < DIZZY_SPREAD_CHANCE) {
                for (let j = 0; j < enemies.length; j++) {
                    if (i === j) continue;
                    const other = enemies[j];
                    if (!other) continue;
                    if (enemyHasSpawnShield(other)) continue; // Skip spawn-protected
                    
                    // Calculate spread amount - always less than spreader
                    const spreadAmount = Math.floor(e.dizzy * DIZZY_SPREAD_DECAY);
                    
                    // Skip if spread amount is too small or target already has more dizzy
                    if (spreadAmount < DIZZY_MIN_SPREAD_AMOUNT) continue;
                    if (other.dizzy && other.dizzy >= spreadAmount) continue;
                    
                    const dist = Math.hypot(other.x - e.x, other.y - e.y);
                    if (dist < DIZZY_SPREAD_RANGE) {
                        // Spread dizzy to nearby enemy (always less than spreader)
                        if (!other.dizzy) other.dizzy = 0;
                        other.dizzy = spreadAmount;
                        other.dizzyGeneration = (e.dizzyGeneration || 0) + 1; // Increment generation
                        
                        // Visual feedback - electric arc between tanks (weaker visual for weaker spread)
                        const arcAngle = Math.atan2(other.y - e.y, other.x - e.x);
                        const particleCount = Math.max(3, 6 - other.dizzyGeneration); // Fewer particles for later generations
                        for (let p = 0; p < particleCount; p++) {
                            const t = p / particleCount;
                            const zigzag = (Math.random() - 0.5) * 12;
                            const perpAngle = arcAngle + Math.PI / 2;
                            particles.push({
                                x: e.x + (other.x - e.x) * t + Math.cos(perpAngle) * zigzag,
                                y: e.y + (other.y - e.y) * t + Math.sin(perpAngle) * zigzag,
                                vx: (Math.random() - 0.5) * 2,
                                vy: (Math.random() - 0.5) * 2,
                                life: 10,
                                color: p % 2 === 0 ? '#a855f7' : '#c084fc',
                                size: 2
                            });
                        }
                        
                        // Spark burst at infected target (smaller for weaker spread)
                        const burstCount = Math.max(4, 8 - other.dizzyGeneration * 2);
                        for (let p = 0; p < burstCount; p++) {
                            const angle = (Math.PI * 2 * p) / burstCount;
                            particles.push({
                                x: other.x,
                                y: other.y,
                                vx: Math.cos(angle) * 2.5,
                                vy: Math.sin(angle) * 2.5,
                                life: 8,
                                color: '#c084fc',
                                size: 1.5
                            });
                        }
                        
                        // Show spread amount in floating text
                        const spreadSeconds = (spreadAmount / 60).toFixed(1);
                        addFloatText('DIZZY ' + spreadSeconds + 's', other.x, other.y - 30, '#c084fc');
                        break; // Only spread to one enemy per frame
                    }
                }
            }
        }
        
        if (e.slowedTime && e.slowedTime > 0) {
            e.slowedTime -= dt;
            // Slow effect handled in movement calculation below
        }

        e.queueAngle = e.queueAngle ?? Math.random() * Math.PI * 2;
        if (typeof e.spawnWarmup !== 'number') e.spawnWarmup = 0;
        if (!e.spawnWarmupMax) e.spawnWarmupMax = SPAWN_WARMUP_FRAMES;
        if (typeof e.queueHangTime !== 'number') e.queueHangTime = 0;

        // FIXED: Initialize spawnHoldoff for auto-aim targeting delay
        // This gives a grace period after spawn completes before auto-aim targets the enemy
        if (e.spawnHoldoff === undefined) {
            e.spawnHoldoff = e.spawnWarmup > 0 ? 90 : 0; // 1.5 seconds holdoff after spawn
        }

        if (e.spawnWarmup > 0) {
            e.spawnWarmup = Math.max(0, e.spawnWarmup - dt);
            e.vx = 0;
            e.vy = 0;
            e.cooldown = Math.max(e.cooldown || 0, 20);
            continue;
        }
        
        // Decrement holdoff timer after spawn is complete
        if (e.spawnHoldoff > 0) {
            e.spawnHoldoff = Math.max(0, e.spawnHoldoff - dt);
        }

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

        // ===== ENEMY MAGIC SKILL AI UPDATE =====
        // Update magic skills before targeting/movement for strategic decision making
        const distToPlayerForMagic = Math.hypot(e.x - player.x, e.y - player.y);
        updateEnemyMagicSkills(e, dt, distToPlayerForMagic);

        // ===== ENHANCED TARGETING: Consider player AND clones =====
        // Enemy will target whichever is closest (player or clone)
        let targetX = player.x;
        let targetY = player.y;
        let d = Math.hypot(e.x - player.x, e.y - player.y);
        let targetIsClone = false;
        let targetClone = null;
        
        // Check if any clone is closer than player
        if (typeof playerClones !== 'undefined' && playerClones.length > 0) {
            for (const clone of playerClones) {
                if (!clone || clone.hp <= 0 || clone.spawnAnimation > 0) continue;
                
                const cloneDist = Math.hypot(e.x - clone.x, e.y - clone.y);
                if (cloneDist < d) {
                    d = cloneDist;
                    targetX = clone.x;
                    targetY = clone.y;
                    targetIsClone = true;
                    targetClone = clone;
                }
            }
        }
        
        let targetAngle = Math.atan2(targetY - e.y, targetX - e.x);
        let hasLOS = checkLineOfSight(e.x, e.y, targetX, targetY);
            
            // ===== BOSS ESCORT SPECIAL AI =====
            // When boss is active, ALL enemies (escort or not) should protect boss
            // by positioning themselves between player and boss
            let bossProtectMode = false;
            if (boss && boss.awakeningPhase >= 3 && boss.hp > 0) {
                bossProtectMode = true;
                
                // Calculate intercept position between player and boss
                const playerToBossAngle = Math.atan2(boss.y - player.y, boss.x - player.x);
                const distPlayerToBoss = Math.hypot(boss.x - player.x, boss.y - player.y);
                
                // Escort formation - position around boss facing player
                const escortRadius = boss.radius + 60 + (e.bossEscort ? 0 : 40); // Non-escorts slightly further
                const myEscortIndex = enemies.indexOf(e);
                const totalEscorts = enemies.length;
                
                // Spread escorts in an arc facing the player
                const arcSpread = Math.PI * 0.6; // 108 degree arc
                const arcOffset = ((myEscortIndex / Math.max(1, totalEscorts - 1)) - 0.5) * arcSpread;
                const escortAngle = playerToBossAngle + Math.PI + arcOffset; // Face away from player (toward player direction)
                
                // Calculate ideal intercept position
                let interceptX = boss.x + Math.cos(escortAngle) * escortRadius;
                let interceptY = boss.y + Math.sin(escortAngle) * escortRadius;
                
                // Clamp to world bounds
                interceptX = Math.max(80, Math.min(WORLD_W - 80, interceptX));
                interceptY = Math.max(80, Math.min(WORLD_H - 80, interceptY));
                
                // Update guard point to follow boss
                e.guardPoint = { x: boss.x, y: boss.y };
                
                // Store intercept target for movement
                e.bossInterceptX = interceptX;
                e.bossInterceptY = interceptY;
                
                // Override LOS and targeting when protecting boss
                // Check if enemy is between player and boss (blocking line of fire)
                const angleToIntercept = Math.atan2(interceptY - e.y, interceptX - e.x);
                const distToIntercept = Math.hypot(interceptX - e.x, interceptY - e.y);
                
                // If far from intercept position, prioritize getting there
                if (distToIntercept > 50) {
                    targetAngle = angleToIntercept;
                    hasLOS = true; // Force movement toward intercept
                }
            }
            if (invisActive && d > invisRevealDistance) hasLOS = false;
            
            // CRITICAL: When player is invisible/cloaked, enemies CANNOT see or track them
            // Even if they're technically in LOS, cloaked player is undetectable
            const playerIsCloaked = player.invisible && player.invisibleTime > 0;
            if (playerIsCloaked && !targetIsClone) {
                // Player is cloaked - can only target clones, not the player
                hasLOS = false;
            }

            // Intelligence system: track last known player position
            if (hasLOS) {
                e.lastKnownPlayerX = player.x;
                e.lastKnownPlayerY = player.y;
                e.timeSinceLastSeen = 0;
            } else {
                if (!e.timeSinceLastSeen) e.timeSinceLastSeen = 0;
                e.timeSinceLastSeen += dt;
            }

            // === SMOOTH ENEMY TURRET ROTATION ===
            // FROZEN enemies cannot rotate turret - complete immobilization (same as player)
            const isFrozenForTurret = e.frozenTime && e.frozenTime > 0;
            
            // === PATROL MODE: Smart turret scanning - look toward nearby roads/corridors ===
            // Enemies in patrol mode should NOT aim at player - they're unaware
            const isInPatrolMode = (e.aiState === 'patrol');
            
            // === RECOIL RECOVERY: Slow turret tracking after firing ===
            let turretRotationMultiplier = 1.0;
            if (e.recoilRecoveryTime > 0) {
                e.recoilRecoveryTime -= dt;
                // Exponential recovery - slower at start, gradually speeds up
                const recoveryProgress = Math.max(0, e.recoilRecoveryTime / 18);
                turretRotationMultiplier = 0.03 + (1 - recoveryProgress) * 0.12;
            }
            
            // === PATROL TURRET SCANNING: Look toward nearby open paths ===
            if (isInPatrolMode && !isFrozenForTurret) {
                // Initialize patrol scan state
                if (!e.patrolScanState) {
                    e.patrolScanState = {
                        currentIndex: 0,
                        scanTimer: 0,
                        scanDelay: 120 + Math.random() * 60, // 2-3 seconds between scan points
                        lastUpdatePos: { x: e.x, y: e.y }
                    };
                }
                
                // Recalculate scan points if enemy has moved significantly
                // This ensures turret always points toward correct directions
                const movedDist = Math.hypot(e.x - e.patrolScanState.lastUpdatePos.x, e.y - e.patrolScanState.lastUpdatePos.y);
                if (!e.patrolScanState.scanPoints || e.patrolScanState.scanPoints.length === 0 || movedDist > 50) {
                    e.patrolScanState.scanPoints = findPatrolScanPoints(e);
                    e.patrolScanState.lastUpdatePos = { x: e.x, y: e.y };
                }
                
                // Update scan timer
                e.patrolScanState.scanTimer += dt;
                
                // Switch to next scan point periodically
                if (e.patrolScanState.scanTimer >= e.patrolScanState.scanDelay) {
                    e.patrolScanState.scanTimer = 0;
                    e.patrolScanState.currentIndex = (e.patrolScanState.currentIndex + 1) % Math.max(1, e.patrolScanState.scanPoints.length);
                    e.patrolScanState.scanDelay = 90 + Math.random() * 90; // Vary timing
                }
                
                // Get target angle to current scan point
                // Calculate angle directly toward the scan direction from enemy's current position
                let patrolTargetAngle = e.angle; // Default: face movement direction
                if (e.patrolScanState.scanPoints.length > 0) {
                    const scanPoint = e.patrolScanState.scanPoints[e.patrolScanState.currentIndex];
                    if (scanPoint) {
                        // Use the stored angle directly (already calculated relative to suspected player)
                        patrolTargetAngle = scanPoint.angle;
                    }
                }
                
                // Smoothly rotate turret toward scan point
                let diff = patrolTargetAngle - e.turretAngle;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                const maxRotation = 0.03 * dt; // Slower scan rotation for natural feel
                e.turretAngle += Math.sign(diff) * Math.min(Math.abs(diff), Math.max(maxRotation, Math.abs(diff) * 0.05 * dt));
            }
            // Only aim turret at player if:
            // 1. NOT in patrol mode (enemy must be alerted first)
            // 2. Has line of sight to player
            // 3. Player is not cloaked
            // 4. Not frozen
            else if (!isInPatrolMode && hasLOS && !playerIsCloaked && !isFrozenForTurret) {
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

                // IMPROVED: Smooth rotation with max speed limit to prevent instant snapping
                let aimSpeed = (ENEMY_TIERS[e.id].aimSpeed || 0.1) * turretRotationMultiplier;
                const maxRotation = 0.08 * dt * turretRotationMultiplier; // Max rotation per frame for smooth movement
                const rotationAmount = Math.sign(diff) * Math.min(Math.abs(diff), Math.max(maxRotation, Math.abs(diff) * aimSpeed * dt));
                e.turretAngle += rotationAmount;
            } else if (!isFrozenForTurret) {
                // No LOS - turret points forward while searching for player (only if not frozen)
                let diff = e.angle - e.turretAngle;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                // IMPROVED: Smooth rotation back to forward position
                const maxRotation = 0.05 * dt;
                e.turretAngle += Math.sign(diff) * Math.min(Math.abs(diff), Math.max(maxRotation, Math.abs(diff) * 0.08 * dt));
            }
            // If frozen, turret stays in current position (no rotation)

            let isAggro = attackers.includes(e) && !(invisActive && d > invisRevealDistance);
            const rank = rankMap.get(e) ?? enemies.length;
            const queuedAttacker = !isAggro && rank >= attackers.length;
            if (queuedAttacker) e.queueHangTime = Math.min(e.queueHangTime + dt, ENEMY_QUEUE_BREAK_TIME * 2);
            else e.queueHangTime = 0;
            
            // FIXED: Force all enemies to pursue when player is far away
            // This prevents enemies from staying still when player runs away
            const playerIsFar = d > ENEMY_CHASE_DISTANCE_THRESHOLD;
            const queueBored = queuedAttacker && (
                e.queueHangTime >= ENEMY_QUEUE_BREAK_TIME || 
                d > ENEMY_QUEUE_DISTANCE_BREAK ||
                playerIsFar // NEW: All enemies pursue when player is far
            );
            
            // ===== ICE/FIRE MAGIC TANK SMART APPROACH SYSTEM =====
            // Ice and Fire magic tanks actively approach player to cast their skills
            // then retreat to safe distance after skill execution
            let magicApproachMode = false;
            let magicRetreatMode = false;
            let magicCastingMode = false; // New: prevent retreat during casting
            const MAGIC_CAST_RANGE = 150;        // Optimal range to cast skill
            const MAGIC_SKILL_MAX_RANGE = 220;   // Max effective range for skill
            const MAGIC_RETREAT_DISTANCE = 400;  // Distance to retreat after skill
            const MAGIC_APPROACH_COOLDOWN = 90;  // Frames before next approach
            
            if (e.magicType === 'ice' || e.magicType === 'fire') {
                // Initialize magic approach state
                if (e.magicApproachState === undefined) {
                    e.magicApproachState = 'approaching'; // Start approaching immediately
                    e.magicApproachCooldown = 0;
                    e.magicCastingTimer = 0;
                }
                
                // Decrement cooldowns
                if (e.magicApproachCooldown > 0) e.magicApproachCooldown -= dt;
                if (e.magicCastingTimer > 0) e.magicCastingTimer -= dt;
                
                // Check skill status - use broader threshold for approach decision
                const skillAlmostReady = e.magicCooldown <= 120; // Within 2 seconds of ready
                const skillReady = e.magicCooldown <= 30; // Within 0.5 second of ready
                const skillOnCooldown = e.magicCooldown > 180; // Over 3 seconds on cooldown
                const isCurrentlyCasting = e.magicActive && e.magicActiveTime > 0 && e.magicActiveTime < 60;
                
                // State machine for intelligent magic tank behavior
                if (isCurrentlyCasting) {
                    // Currently casting skill - stay still and focus
                    e.magicApproachState = 'casting';
                    magicCastingMode = true;
                    speedMult = 0.1; // Nearly stopped during cast
                    
                } else if (e.magicApproachState === 'casting' && !isCurrentlyCasting) {
                    // Just finished casting - start retreat
                    e.magicApproachState = 'retreating';
                    e.magicRetreatTimer = 240; // Retreat for 4 seconds
                    e.magicApproachCooldown = MAGIC_APPROACH_COOLDOWN;
                    
                } else if (e.magicApproachState === 'retreating') {
                    // Retreating after skill use
                    if (e.magicRetreatTimer > 0) {
                        e.magicRetreatTimer -= dt;
                        magicRetreatMode = true;
                        
                        // Move away from player to safe distance
                        if (d < MAGIC_RETREAT_DISTANCE) {
                            moveAngle = Math.atan2(e.y - player.y, e.x - player.x);
                            speedMult = 1.6; // Fast retreat
                            
                            // Zigzag evasion while retreating
                            const strafeOffset = Math.sin(frame * 0.08) * 0.4;
                            moveAngle += strafeOffset;
                        } else {
                            speedMult = 0.5;
                        }
                    } else {
                        // Retreat complete - back to approaching
                        e.magicApproachState = 'approaching';
                    }
                    
                } else if (skillReady && d <= MAGIC_CAST_RANGE) {
                    // In optimal range with skill ready - prepare to cast
                    e.magicApproachState = 'casting';
                    magicCastingMode = true;
                    speedMult = 0.2; // Slow down to cast
                    
                    // Face player directly for casting
                    const angleToPlayer = Math.atan2(player.y - e.y, player.x - e.x);
                    e.targetAngle = angleToPlayer;
                    
                } else if (d > MAGIC_CAST_RANGE && (skillAlmostReady || !skillOnCooldown)) {
                    // IMPROVED: Approach aggressively whenever skill is almost ready OR not on heavy cooldown
                    // This makes ice/fire tanks actively pursue player to get in range
                    e.magicApproachState = 'approaching';
                    magicApproachMode = true;
                    
                    // Move directly toward player with urgency
                    moveAngle = targetAngle;
                    
                    // Calculate speed based on how close skill is to being ready
                    const cooldownRatio = Math.max(0, e.magicCooldown) / (MAGIC_SKILL_COOLDOWNS[e.magicType] || 300);
                    const urgencyBonus = (1 - cooldownRatio) * 0.5; // More speed as skill gets ready
                    
                    // Aggressive speed based on magic type
                    if (e.magicType === 'fire') {
                        // Fire tanks are reckless - very fast approach
                        speedMult = 1.6 + (intelligence * 0.2) + urgencyBonus;
                    } else {
                        // Ice tanks are calculated - fast but controlled
                        speedMult = 1.4 + (intelligence * 0.15) + urgencyBonus;
                    }
                    
                    // Visual indicator - charged particle trail (more intense as skill becomes ready)
                    const particleChance = skillAlmostReady ? 0.3 : 0.15;
                    if (Math.random() < particleChance) {
                        const particleColor = e.magicType === 'fire' ? '#ff4500' : '#3b82f6';
                        const secondaryColor = e.magicType === 'fire' ? '#ff9500' : '#00bcd4';
                        particles.push({
                            x: e.x - Math.cos(e.angle) * 25 + (Math.random() - 0.5) * 15,
                            y: e.y - Math.sin(e.angle) * 25 + (Math.random() - 0.5) * 15,
                            vx: -Math.cos(e.angle) * 3 + (Math.random() - 0.5) * 2,
                            vy: -Math.sin(e.angle) * 3 + (Math.random() - 0.5) * 2,
                            life: 20,
                            color: Math.random() > 0.5 ? particleColor : secondaryColor,
                            size: 3 + Math.random() * 3
                        });
                    }
                    
                } else if (skillOnCooldown && d <= MAGIC_CAST_RANGE) {
                    // In range but skill on cooldown - strafe and wait
                    e.magicApproachState = 'hunting';
                    
                    // Strafe at optimal range
                    const strafeDir = e.strafeDir || (Math.random() > 0.5 ? 1 : -1);
                    e.strafeDir = strafeDir;
                    moveAngle = targetAngle + (Math.PI * 0.5 * strafeDir);
                    speedMult = 0.7;
                    
                } else if (skillOnCooldown) {
                    // Skill on heavy cooldown and far - move closer while waiting
                    e.magicApproachState = 'approaching';
                    magicApproachMode = true;
                    
                    // Approach at moderate speed
                    moveAngle = targetAngle;
                    speedMult = 1.0 + (intelligence * 0.1);
                    
                } else {
                    // Default: approach player
                    e.magicApproachState = 'approaching';
                    magicApproachMode = true;
                    moveAngle = targetAngle;
                    speedMult = 1.2;
                }
            }
            
            // Initialize movement variables (only if not already set by magic approach)
            if (!magicApproachMode && !magicRetreatMode && !magicCastingMode) {
                moveAngle = e.angle;
                speedMult = 1.0;
            }
            
            // === PATROL/ALERT AI STATE SYSTEM ===
            // Check if enemy should become alerted (transition from patrol to aggressive)
            if (!e.aiState) e.aiState = 'patrol'; // Initialize state for existing enemies
            
            // Check for global alert (50% enemies killed)
            if (e.aiState === 'patrol' && shouldGlobalAlert()) {
                alertEnemy(e, 'allies_low');
            }
            
            // Check if turret can see player (vision-based alert)
            if (e.aiState === 'patrol' && canEnemySpotPlayer(e)) {
                alertEnemy(e, 'vision');
            }
            
            // Patrol mode: slow patrol around spawn area
            let isPatrolling = (e.aiState === 'patrol');
            if (isPatrolling) {
                // Patrol at reduced speed around guard point
                speedMult *= (e.patrolSpeedMult || PATROL_SPEED_MULT);
                
                // Initialize unique patrol zone if not set
                // Each enemy gets their own patrol center - AWAY from suspected player location
                if (!e.patrolZoneCenter) {
                    // Use spawn position as base, NOT guard point (to prevent moving toward player)
                    const baseX = e.home.x;
                    const baseY = e.home.y;
                    
                    // Calculate direction AWAY from suspected player location
                    let awayAngle = Math.random() * Math.PI * 2; // Random if no player info
                    if (e.lastKnownPlayerPos) {
                        // Point away from suspected player
                        awayAngle = Math.atan2(
                            baseY - e.lastKnownPlayerPos.y,
                            baseX - e.lastKnownPlayerPos.x
                        );
                        // Add some variance to spread out
                        awayAngle += (Math.random() - 0.5) * Math.PI * 0.5;
                    }
                    
                    // Patrol zone is offset in the direction AWAY from player
                    const offsetDist = 80 + Math.random() * 100;
                    let zoneX = baseX + Math.cos(awayAngle) * offsetDist;
                    let zoneY = baseY + Math.sin(awayAngle) * offsetDist;
                    
                    // Clamp to world bounds
                    zoneX = Math.max(100, Math.min(WORLD_W - 100, zoneX));
                    zoneY = Math.max(100, Math.min(WORLD_H - 100, zoneY));
                    
                    e.patrolZoneCenter = { x: zoneX, y: zoneY };
                }
                
                // Move toward patrol point within own patrol zone (small radius)
                if (!e.patrolPoint) e.patrolPoint = createPatrolWaypoint(e.patrolZoneCenter, 80);
                const distToPatrol = Math.hypot(e.patrolPoint.x - e.x, e.patrolPoint.y - e.y);
                
                if (distToPatrol < 50) {
                    // Reached patrol point - pick new one within own zone
                    e.patrolPoint = createPatrolWaypoint(e.patrolZoneCenter, 80);
                }
                
                moveAngle = Math.atan2(e.patrolPoint.y - e.y, e.patrolPoint.x - e.x);
                
                // === PATROL BOUNDARY: Don't move toward suspected player location ===
                // If movement would bring us closer to lastKnownPlayerPos, reduce speed or reverse
                if (e.lastKnownPlayerPos) {
                    const currentDistToSuspected = Math.hypot(e.x - e.lastKnownPlayerPos.x, e.y - e.lastKnownPlayerPos.y);
                    const nextX = e.x + Math.cos(moveAngle) * 10;
                    const nextY = e.y + Math.sin(moveAngle) * 10;
                    const nextDistToSuspected = Math.hypot(nextX - e.lastKnownPlayerPos.x, nextY - e.lastKnownPlayerPos.y);
                    
                    // If moving closer to suspected location, pick opposite direction
                    if (nextDistToSuspected < currentDistToSuspected - 5) {
                        moveAngle += Math.PI; // Reverse direction
                        // Get new patrol point away from player
                        e.patrolPoint = createPatrolWaypoint(e.patrolZoneCenter, 80);
                    }
                }
                
                // === PATROL SEPARATION: Push away from other patrolling enemies ===
                // This prevents patrol tanks from clustering together
                const PATROL_SEPARATION_DIST = 180; // Distance at which patrol tanks repel
                const PATROL_SEPARATION_STRENGTH = 0.4;
                
                let sepX = 0, sepY = 0;
                for (const other of enemies) {
                    if (other === e || other.hp <= 0 || other.aiState !== 'patrol') continue;
                    const dx = e.x - other.x;
                    const dy = e.y - other.y;
                    const d = Math.hypot(dx, dy);
                    if (d < PATROL_SEPARATION_DIST && d > 0) {
                        const pushStrength = (PATROL_SEPARATION_DIST - d) / PATROL_SEPARATION_DIST;
                        sepX += (dx / d) * pushStrength;
                        sepY += (dy / d) * pushStrength;
                    }
                }
                
                // Apply separation to move angle
                if (sepX !== 0 || sepY !== 0) {
                    const sepAngle = Math.atan2(sepY, sepX);
                    const sepMag = Math.hypot(sepX, sepY);
                    
                    // Blend separation with patrol movement
                    const blendWeight = Math.min(1, sepMag * PATROL_SEPARATION_STRENGTH);
                    let angleDiff = sepAngle - moveAngle;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    moveAngle += angleDiff * blendWeight;
                }
            }
            
            const unstuckOverride = consumeUnstuckVector(e, dt);
            let usingCover = false;
            let pursuingDetour = false;
            
            // ===== BOSS PROTECT MODE MOVEMENT =====
            // When boss is active, override normal movement to protect boss
            if (bossProtectMode && e.bossInterceptX !== undefined) {
                const distToIntercept = Math.hypot(e.bossInterceptX - e.x, e.bossInterceptY - e.y);
                const angleToIntercept = Math.atan2(e.bossInterceptY - e.y, e.bossInterceptX - e.x);
                
                if (distToIntercept > 30) {
                    // Move toward intercept position to block player shots
                    moveAngle = angleToIntercept;
                    speedMult = 1.3; // Move quickly to intercept position
                    
                    // Skip other movement logic when in boss protect mode
                    // Apply avoidance and separation
                    moveAngle = applySquadSeparation(e, moveAngle);
                    moveAngle += findAvoidanceAngle(e, moveAngle);
                    
                    // Apply movement
                    let diffMove = moveAngle - e.angle;
                    while (diffMove < -Math.PI) diffMove += Math.PI * 2;
                    while (diffMove > Math.PI) diffMove -= Math.PI * 2;
                    
                    let baseTurnSpeed = 0.12;
                    e.angle += diffMove * baseTurnSpeed * dt;
                    
                    let travelSpeed = e.speed * speedMult;
                    if (e.frozenTime && e.frozenTime > 0) travelSpeed = 0;
                    else if (e.slowedTime && e.slowedTime > 0) travelSpeed *= 0.4;
                    
                    if (travelSpeed > 0) {
                        moveEnemyWithAvoidance(e, e.angle, travelSpeed, dt);
                    }
                    
                    // Update wheel rotation
                    if (travelSpeed > 0.05) {
                        e.wheelRotation = (e.wheelRotation || 0) + travelSpeed * 0.35 * dt;
                        if (e.wheelRotation > Math.PI * 2) e.wheelRotation -= Math.PI * 2;
                    }
                    
                    continue; // Skip rest of movement logic
                } else {
                    // At intercept position - strafe to maintain blocking position
                    const playerAngle = Math.atan2(player.y - e.y, player.x - e.x);
                    const strafeDir = e.arcSide || 1;
                    moveAngle = playerAngle + (Math.PI * 0.5 * strafeDir);
                    speedMult = 0.5; // Slow strafe while blocking
                }
            }
            
            if (e.needsBackup && e.isRetreating && !bossProtectMode) {
                const distToPlayer = Math.hypot(e.x - player.x, e.y - player.y);
                
                // WALL-AWARE RETREAT: Don't retreat into walls
                const nearWall = isNearWall(e, ENEMY_WALL_DANGER_DISTANCE);
                
                // Smart retreat: maintain safe distance but don't run too far
                if (distToPlayer < ENEMY_RETREAT_MIN_DISTANCE && !nearWall) {
                    // Too close - retreat urgently (but only if not near wall)
                    e.coverRecalc -= dt;
                    if (e.coverRecalc <= 0 || !e.coverPoint) {
                        e.coverPoint = findCoverRetreatPoint(e);
                        e.coverRecalc = ENEMY_COVER_RECALC;
                    }
                    if (e.coverPoint) {
                        // Validate cover point is not near wall
                        const coverNearWall = (e.coverPoint.x < 80 || e.coverPoint.x > WORLD_W - 80 ||
                                               e.coverPoint.y < 80 || e.coverPoint.y > WORLD_H - 80);
                        if (!coverNearWall) {
                            usingCover = true;
                            const distToCover = Math.hypot(e.coverPoint.x - e.x, e.coverPoint.y - e.y);
                            if (distToCover > 35) {
                                moveAngle = Math.atan2(e.coverPoint.y - e.y, e.coverPoint.x - e.x);
                                // Higher tier = faster retreat with better evasion
                                speedMult = ENEMY_RETREAT_SPEED + (intelligence * 0.15);
                            } else {
                                // At cover - strafe and return fire
                                moveAngle = Math.atan2(e.y - player.y, e.x - player.x);
                                speedMult = 0.6;
                            }
                        } else {
                            // Cover point too close to wall - strafe instead
                            e.coverPoint = null;
                        }
                    }
                } else if (distToPlayer > ENEMY_RETREAT_MAX_DISTANCE || nearWall) {
                    // Too far OR near wall - re-engage to get away from wall
                    moveAngle = targetAngle;
                    speedMult = nearWall ? 1.0 : 0.7; // Faster if escaping wall
                    e.retreatTimer = Math.max(0, e.retreatTimer - dt * (nearWall ? 4 : 2)); // Speed up timer if near wall
                } else {
                    // At safe distance - maintain distance with evasive movement
                    // Strafe perpendicular to player while maintaining distance
                    // FIXED: Use stableArcSide for consistent strafe direction (prevents zigzag)
                    if (!e.strafeDirection) e.strafeDirection = e.stableArcSide || e.arcSide || 1;
                    const strafeAngle = targetAngle + (Math.PI / 2) * e.strafeDirection;
                    moveAngle = strafeAngle;
                    speedMult = 0.9 + (intelligence * 0.1); // Higher tier strafes faster
                    
                    // Periodically adjust to maintain optimal distance (no random flip)
                    if (!e.strafeTimer) e.strafeTimer = 0;
                    e.strafeTimer += dt;
                    if (e.strafeTimer > 120) {
                        e.strafeTimer = 0;
                        // FIXED: Removed random direction flip to prevent zigzag
                        // Only change direction when blocked by obstacles (handled elsewhere)
                        // Check if need to move closer or further
                        if (distToPlayer < ENEMY_RETREAT_MIN_DISTANCE + 50) {
                            moveAngle = Math.atan2(e.y - player.y, e.x - player.x); // Move away
                        } else if (distToPlayer > ENEMY_RETREAT_MAX_DISTANCE - 50) {
                            moveAngle = targetAngle; // Move closer
                        }
                    }
                }
            } else {
                e.coverPoint = null;
                e.coverRecalc = 0;
                e.strafeTimer = 0;
            }
            
            // ADVANCED AI: Critical HP emergency retreat
            if (hpRatio < CRITICAL_HP_THRESHOLD && !e.isRetreating) {
                // Emergency retreat - find ally to hide behind or run to cover
                const allyCover = findAllyForCover(e, intelligence);
                if (allyCover) {
                    moveAngle = Math.atan2(allyCover.y - e.y, allyCover.x - e.x);
                    speedMult = 1.5; // Run fast to ally
                    e.hidingBehindAlly = true;
                } else {
                    // No ally, just run away
                    moveAngle = Math.atan2(e.y - player.y, e.x - player.x);
                    speedMult = 1.3;
                }
            } else {
                e.hidingBehindAlly = false;
            }
            
            // ADVANCED AI: Dodge incoming player bullets
            // All tiers can dodge, but higher tier = better reflexes and tighter dodges
            // Lower tiers react slower and dodge less effectively
            let isDodging = false;
            if (!e.frozenTime && !e.stunnedTime) {
                // Calculate effective dodge intelligence (minimum 1 for all enemies)
                const dodgeIntel = Math.max(1, intelligence);
                
                // Dodge check frequency based on tier (lower tier = less frequent checks)
                // Tier 0-2: 50% chance to check dodge each frame
                // Tier 3+: 100% chance to check dodge
                const shouldCheckDodge = intelligence >= 3 || Math.random() < (0.3 + intelligence * 0.1);
                
                if (shouldCheckDodge) {
                    const dodgeResult = detectIncomingBullets(e, dodgeIntel);
                    if (dodgeResult) {
                        // Apply dodge maneuver
                        isDodging = true;
                        
                        // Blend dodge with current movement (don't completely override)
                        // Lower tiers have weaker dodge commitment (0.4-0.55), higher tiers (0.6-0.85)
                        const baseDodgeWeight = intelligence >= 3 ? 0.6 : 0.35;
                        const dodgeWeight = baseDodgeWeight + (dodgeIntel * 0.05);
                        moveAngle = blendAngles(moveAngle, dodgeResult.angle, dodgeWeight);
                        speedMult = Math.max(speedMult, dodgeResult.strength * (0.7 + intelligence * 0.1));
                        
                        // Visual feedback for dodge (occasional spark)
                        if (Math.random() < 0.1) {
                            particles.push({
                                x: e.x + (Math.random() - 0.5) * 20,
                                y: e.y + (Math.random() - 0.5) * 20,
                                vx: Math.cos(dodgeResult.angle) * 2,
                                vy: Math.sin(dodgeResult.angle) * 2,
                                life: 10,
                                color: '#fbbf24',
                                size: 2
                            });
                        }
                    }
                }
            }

            if (!usingCover && !isDodging && e.detour) {
                const distToDetour = Math.hypot(e.detour.x - e.x, e.detour.y - e.y);
                if (distToDetour > 50 && (!e.detour.ttl || e.detour.ttl > 0)) {
                    moveAngle = Math.atan2(e.detour.y - e.y, e.detour.x - e.x);
                    speedMult = Math.max(speedMult, 1.0);
                    pursuingDetour = true;
                } else {
                    e.detour = null;
                }
            }
            
            // Pursuit mechanic: Higher tier enemies chase player more aggressively
            // intelligence already declared at line 421
            // No hard stop on pursuit range so enemies follow anywhere on the map
            const pursuitRadius = Infinity; 
            // Increased speed bonus - Tier 4 gets +1.0 speed bonus when chasing
            const aggressivenessBonus = intelligence * 0.25; 
            // Pursuit overrides queue behavior for more aggressive chase
            const canTrackInvisible = !invisActive || d <= invisRevealDistance;
            const isPursuing = canTrackInvisible && d < pursuitRadius;
            
            // FIXED: Force pursuit when player is far - don't let queued attackers stay still
            const shouldChase = isPursuing && (playerIsFar || !queuedAttacker);
            
            // === FORCE CHASE MODE ===
            // When enemy is VERY far from player, activate maximum intelligence pathfinding
            // This ensures enemies don't get lost or stuck in distant parts of the map
            const isVeryFarFromPlayer = shouldForceChase(e, d);
            let forceChaseActive = false;
            
            if (isVeryFarFromPlayer && !bossProtectMode && !e.isRetreating) {
                // Activate force chase mode - maximum speed and intelligence
                const forceChaseMov = getForceChaseMovement(e, dt);
                if (forceChaseMov) {
                    forceChaseActive = true;
                    moveAngle = forceChaseMov.angle;
                    speedMult = forceChaseMov.speedMult;
                    
                    // Override turn speed for faster response
                    e.forceChaseTurnSpeed = forceChaseMov.turnSpeed;
                    
                    // Visual indicator for force chase (subtle particle trail)
                    if (Math.random() < 0.15) {
                        particles.push({
                            x: e.x - Math.cos(e.angle) * 25 + (Math.random() - 0.5) * 15,
                            y: e.y - Math.sin(e.angle) * 25 + (Math.random() - 0.5) * 15,
                            vx: -Math.cos(e.angle) * 1.5 + (Math.random() - 0.5),
                            vy: -Math.sin(e.angle) * 1.5 + (Math.random() - 0.5),
                            life: 15 + Math.random() * 10,
                            color: '#fbbf24',
                            size: 2 + Math.random() * 2,
                            gravity: 0.02
                        });
                    }
                }
            } else {
                // Clear force chase state when close enough
                e.forceChaseDetour = null;
                e.forceChaseStuckTime = 0;
                e.forceChaseTurnSpeed = null;
            }

            if (unstuckOverride !== null) {
                // Forced steering prevents AI from vibrating against walls for too
                // long. Biasing speed encourages decisive exits.
                moveAngle = unstuckOverride;
                speedMult = 1.1;
            } else if (forceChaseActive) {
                // Force chase mode is active - skip other movement logic
                // moveAngle and speedMult already set by getForceChaseMovement
            } else if (!usingCover && !isDodging && pursuingDetour) {
                speedMult = Math.max(speedMult, 0.95);
            } else if (!usingCover && !isDodging && (isAggro || queueBored || shouldChase)) {
                // Advanced AI: Use hunting strategy based on intelligence level
                // Pursuit mode activates for enemies within range who aren't queued
                // FIXED: Also activates when player is far away (playerIsFar)
                
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
                if (queueBored) speedMult = Math.max(speedMult, 1.1 + aggressivenessBonus * 0.5);
            } else if (!usingCover && queuedAttacker && !playerIsFar) {
                // IMPROVED QUEUE BEHAVIOR - Queued attackers also spread and surround
                // Check if player is stationary - if so, break queue to surround
                const playerStationary = isPlayerStationary();
                
                if (playerStationary) {
                    // Player is stationary - break queue and join encirclement
                    assignSurroundSector(e);
                    const sectorAngle = getSurroundTargetAngle(e);
                    const surroundRadius = 220 + Math.min(150, rank * 25);
                    let surroundX = player.x + Math.cos(sectorAngle) * surroundRadius;
                    let surroundY = player.y + Math.sin(sectorAngle) * surroundRadius;
                    surroundX = clamp(surroundX, 100, WORLD_W - 100);
                    surroundY = clamp(surroundY, 100, WORLD_H - 100);
                    moveAngle = Math.atan2(surroundY - e.y, surroundX - e.x);
                    speedMult = 1.0; // Move decisively to surround position
                } else {
                    // Normal queue behavior with wider spread
                    e.queueAngle += 0.003 * dt;
                    const queueRadius = 320 + Math.min(400, (rank - attackers.length + 1) * 45); // Wider spread
                    let anchorX = player.x + Math.cos(e.queueAngle) * queueRadius;
                    let anchorY = player.y + Math.sin(e.queueAngle) * queueRadius;
                    
                    // Clamp anchor to world bounds to prevent tanks from trying to go outside
                    anchorX = clamp(anchorX, 80, WORLD_W - 80);
                    anchorY = clamp(anchorY, 80, WORLD_H - 80);
                    
                    const distToAnchor = Math.hypot(anchorX - e.x, anchorY - e.y);
                    
                    // Check if anchor position is reachable
                    const canReachAnchor = canEnemyOccupyPosition(e, anchorX, anchorY);
                    
                    // Check if tank is near a wall - if so, prioritize moving toward player instead
                    if (isNearWall(e, ENEMY_WALL_DANGER_DISTANCE)) {
                        // Near wall - move toward center/player instead of orbiting
                        const wallEscapeAngle = getAngleAwayFromWall(e);
                        if (wallEscapeAngle !== null) {
                            // Blend escape angle with player direction for more natural movement
                            const playerAngle = Math.atan2(player.y - e.y, player.x - e.x);
                            moveAngle = blendAngles(wallEscapeAngle, playerAngle, 0.4);
                            speedMult = 1.2; // Move faster to escape wall
                        } else {
                            moveAngle = Math.atan2(player.y - e.y, player.x - e.x);
                            speedMult = 1.0;
                        }
                        e.anchorStuckTime = 0;
                    } else if (!canReachAnchor) {
                        // Anchor position blocked - go directly toward player
                        moveAngle = Math.atan2(player.y - e.y, player.x - e.x);
                        speedMult = 0.9;
                        e.queueAngle += Math.PI * 0.1; // Try different orbit position
                        e.anchorStuckTime = 0;
                    } else if (distToAnchor > 30) {
                        // Move toward anchor position
                        moveAngle = Math.atan2(anchorY - e.y, anchorX - e.x);
                        speedMult = 0.9;
                        e.anchorStuckTime = 0;
                    } else {
                        // At anchor - slowly approach player (don't stop completely)
                        moveAngle = Math.atan2(player.y - e.y, player.x - e.x);
                        speedMult = 0.3; // Slow approach while queued
                        
                        // If stuck at anchor too long, shift orbit position
                        if (!e.anchorStuckTime) e.anchorStuckTime = 0;
                        e.anchorStuckTime += dt;
                        if (e.anchorStuckTime > 120) {
                            e.queueAngle += Math.PI * 0.25;
                            e.anchorStuckTime = 0;
                        }
                    }
                    
                    const comfortableGap = queueRadius * 0.7;
                    if (d < comfortableGap || d < ENEMY_STANDOFF_RADIUS) {
                        moveAngle = Math.atan2(e.y - player.y, e.x - player.x);
                        speedMult = 1.05;
                    }
                } // End of else block for normal queue behavior
            } else if (!usingCover && !isPatrolling) {
                // ALERTED MODE - Aggressive approach with surround tactics
                // Only executes when enemy is alerted (not patrolling)
                
                // Check if player is stationary - trigger aggressive encirclement
                const playerStationary = isPlayerStationary();
                
                if (playerIsFar) {
                    // Player is far - all enemies chase directly
                    moveAngle = targetAngle;
                    speedMult = 1.1 + (intelligence * 0.15); // Aggressive chase speed
                    e.surroundHoldTime = 0;
                    // Clear sector when far - will reassign when close
                    e.surroundSector = undefined;
                } else {
                    // Player is close enough - use SECTOR-BASED surround tactics
                    // This ensures enemies attack from ALL directions, not clustering
                    
                    // Assign this enemy to a sector (force reassign if overcrowded)
                    assignSurroundSector(e);
                    
                    // Get the target angle for this enemy's sector
                    const sectorAngle = getSurroundTargetAngle(e);
                    
                    // Calculate surround radius based on rank and player status
                    const aliveCount = enemies.filter(en => en.hp > 0 && en !== e).length;
                    // Tighter encirclement for better surrounding
                    let baseSurroundRadius = playerStationary ? 180 : 250;
                    // Add variation based on sector for layered formation
                    const layerVariation = (e.surroundSector % 2) * 40;
                    const surroundRadius = baseSurroundRadius + layerVariation + Math.min(100, rank * 20);
                    
                    // Target position based on assigned sector
                    let surroundX = player.x + Math.cos(sectorAngle) * surroundRadius;
                    let surroundY = player.y + Math.sin(sectorAngle) * surroundRadius;
                    
                    // Clamp to world bounds
                    surroundX = clamp(surroundX, 100, WORLD_W - 100);
                    surroundY = clamp(surroundY, 100, WORLD_H - 100);
                    
                    const distToSurround = Math.hypot(surroundX - e.x, surroundY - e.y);
                    
                    // Check if enemy is actually in their assigned sector region
                    const currentAngleFromPlayer = Math.atan2(e.y - player.y, e.x - player.x);
                    let angleDiffToSector = sectorAngle - currentAngleFromPlayer;
                    while (angleDiffToSector < -Math.PI) angleDiffToSector += Math.PI * 2;
                    while (angleDiffToSector > Math.PI) angleDiffToSector -= Math.PI * 2;
                    const inWrongSector = Math.abs(angleDiffToSector) > SURROUND_SECTOR_ANGLE * 1.5;
                    
                    // FIXED: Always move toward player or surround position, never stop
                    // Check if surround position is reachable
                    const canReachSurround = canEnemyOccupyPosition(e, surroundX, surroundY);
                    
                    // Speed bonus when out of position
                    const repositionBonus = inWrongSector ? 0.4 : 0;
                    const surroundSpeedBonus = (playerStationary ? 0.3 : 0) + repositionBonus;
                    
                    if (!canReachSurround) {
                        // Surround position blocked - try adjacent sector or go directly toward player
                        // Try shifting to adjacent sector temporarily
                        const altSectorAngle = sectorAngle + (Math.random() > 0.5 ? 1 : -1) * SURROUND_SECTOR_ANGLE * 0.5;
                        const altX = player.x + Math.cos(altSectorAngle) * surroundRadius;
                        const altY = player.y + Math.sin(altSectorAngle) * surroundRadius;
                        
                        if (canEnemyOccupyPosition(e, altX, altY)) {
                            moveAngle = Math.atan2(altY - e.y, altX - e.x);
                        } else {
                            moveAngle = targetAngle; // Go directly toward player
                        }
                        speedMult = 0.9 + surroundSpeedBonus;
                        e.surroundHoldTime = 0;
                    } else if (distToSurround > 50) {
                        // Move toward surround position
                        moveAngle = Math.atan2(surroundY - e.y, surroundX - e.x);
                        speedMult = 0.9 + surroundSpeedBonus; // Faster when player stationary
                        e.surroundHoldTime = 0; // Reset hold time while moving
                    } else {
                        // At surround position - approach player (faster when stationary)
                        moveAngle = targetAngle;
                        speedMult = playerStationary ? 0.7 : 0.4; // More aggressive when player stationary
                    }
                    
                    // Slowly rotate surround angle for dynamic movement
                    // IMPROVED: Rotate faster when player is stationary for dynamic encirclement
                    const rotateSpeed = playerStationary ? 0.004 : 0.002;
                    e.queueAngle = (e.queueAngle || 0) + rotateSpeed * dt;
                    
                    // Emergency: If too close to player, back off slightly
                    // IMPROVED: Tighter formation when player stationary
                    const minDistance = playerStationary ? ENEMY_STANDOFF_RADIUS * 0.5 : ENEMY_STANDOFF_RADIUS * 0.7;
                    if (d < minDistance) {
                        moveAngle = Math.atan2(e.y - player.y, e.x - player.x);
                        speedMult = 0.8;
                    }
                    
                    // If few enemies left, become more aggressive
                    if (aliveCount <= 2) {
                        moveAngle = targetAngle;
                        speedMult = 1.0 + (intelligence * 0.1);
                    }
                }
            }
            
            // GLOBAL WALL AVOIDANCE - Check after all movement decisions
            // This ensures tanks always escape walls regardless of their current behavior
            if (isNearWall(e, ENEMY_WALL_DANGER_DISTANCE * 0.8)) {
                const escapeAngle = getAngleAwayFromWall(e);
                if (escapeAngle !== null) {
                    // Strong blend toward escape when very close to wall
                    moveAngle = blendAngles(moveAngle, escapeAngle, 0.6);
                    speedMult = Math.max(speedMult, 1.0); // Ensure some speed to escape
                }
            }
            
            const desiredArcRadius = ENEMY_STANDOFF_RADIUS + Math.min(220, rank * ENEMY_FORMATION_RADIUS_STEP);
            if (!usingCover && (isAggro || queueBored || isPursuing)) {
                moveAngle = maintainFormationSpacing(e, moveAngle, d, desiredArcRadius);
            }
            moveAngle = applySquadSeparation(e, moveAngle);

            moveAngle += findAvoidanceAngle(e, moveAngle);
            
            // FIXED: Smooth the target angle to prevent abrupt changes causing zigzag
            // Use exponential moving average for smoother transitions
            if (e.smoothedMoveAngle === undefined) e.smoothedMoveAngle = moveAngle;
            
            // Smooth the target angle with exponential decay
            let angleDiff = moveAngle - e.smoothedMoveAngle;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            
            // IMPROVED: Tier-based smoothing - higher tier = smoother, more predictable movement
            // Lower smoothing factor = smoother movement but slower response
            // Tier 0-2: 0.18 (more responsive, slightly less smooth)
            // Tier 3-5: 0.12 (balanced)
            // Tier 6+: 0.08 (very smooth, strategic movement)
            let smoothingFactor = 0.18;
            if (intelligence >= 5) {
                smoothingFactor = 0.08; // Very smooth for highest tiers
            } else if (intelligence >= 3) {
                smoothingFactor = 0.12; // Balanced for mid tiers
            }
            
            e.smoothedMoveAngle += angleDiff * smoothingFactor;
            
            // Normalize smoothed angle
            while (e.smoothedMoveAngle < -Math.PI) e.smoothedMoveAngle += Math.PI * 2;
            while (e.smoothedMoveAngle > Math.PI) e.smoothedMoveAngle -= Math.PI * 2;

            let diffMove = e.smoothedMoveAngle - e.angle;
            while (diffMove < -Math.PI) diffMove += Math.PI * 2;
            while (diffMove > Math.PI) diffMove -= Math.PI * 2;
            
            // Adaptive turn speed based on angle difference and intelligence
            // IMPROVED: Lower base turn speed for higher tiers = more stable, less erratic
            // Tier 0-2: Higher turn speed (0.06-0.09) for quicker but acceptable response
            // Tier 3-5: Medium turn speed (0.05-0.075) for stable tactical movement
            // Tier 6+: Lower turn speed (0.04-0.06) for smooth strategic movement
            let baseTurnSpeed;
            if (intelligence >= 6) {
                baseTurnSpeed = 0.04 + (intelligence * 0.01); // Very smooth turning
            } else if (intelligence >= 3) {
                baseTurnSpeed = 0.05 + (intelligence * 0.012); // Balanced turning
            } else {
                baseTurnSpeed = 0.06 + (intelligence * 0.015); // Quick but controlled
            }
            let adaptiveTurnSpeed = baseTurnSpeed;
            
            // FORCE CHASE: Override turn speed when in force chase mode
            // This makes enemies much more responsive when far from player
            if (forceChaseActive && e.forceChaseTurnSpeed) {
                adaptiveTurnSpeed = e.forceChaseTurnSpeed;
            }
            
            // Enhanced evasion during retreat - smooth movement without zigzag
            if (e.isRetreating && !forceChaseActive) {
                // NO random noise - smooth retreat path
                adaptiveTurnSpeed *= 1.1; // Slightly faster turning during retreat
            }
            
            // IMPROVED: Stronger oscillation prevention with exponential damping
            // Dead zone: almost no turning for very small differences
            // SKIP oscillation damping during force chase for faster response
            if (!forceChaseActive) {
                if (Math.abs(diffMove) < 0.05) {
                    adaptiveTurnSpeed *= 0.05; // Almost no movement for tiny corrections
                } else if (Math.abs(diffMove) < 0.15) {
                    adaptiveTurnSpeed *= 0.15; // Very slow for micro corrections
                } else if (Math.abs(diffMove) < 0.3) {
                    adaptiveTurnSpeed *= 0.3; // Slower for small corrections
                } else if (Math.abs(diffMove) < 0.5) {
                    adaptiveTurnSpeed *= 0.5; // Moderate for medium corrections
                } else if (Math.abs(diffMove) < 0.8) {
                    adaptiveTurnSpeed *= 0.7; // Slightly reduced for larger corrections
                }
            }
            
            // Apply smoothed angle change
            e.angle += diffMove * adaptiveTurnSpeed * dt;

            let travelSpeed = Math.max(0, e.speed * speedMult);
            
            // Apply status effect speed modifiers
            if (e.frozenTime && e.frozenTime > 0) {
                travelSpeed = 0; // Cannot move when frozen
            } else if (e.slowedTime && e.slowedTime > 0) {
                travelSpeed *= 0.4; // 60% speed reduction when slowed
            }
            
            // Only attempt movement if there's significant speed or angle change
            let movementSucceeded = false;
            if (travelSpeed > 0.5 || Math.abs(diffMove) > 0.1) {
                let moved = moveEnemyWithAvoidance(e, e.angle, travelSpeed, dt);
                if (!moved && travelSpeed > 0) {
                    moved = moveEnemyWithAvoidance(e, e.angle + 0.5, travelSpeed * 0.6, dt);
                }
                movementSucceeded = moved;
            }
            if (travelSpeed <= 0 && d < 220) {
                const retreatMoved = moveEnemyWithAvoidance(e, e.angle + Math.PI, e.speed * 0.4, dt);
                movementSucceeded = movementSucceeded || retreatMoved;
            }
            
            // Update wheel rotation based on movement
            // Must update ALWAYS when moving, not just when movementSucceeded
            // Lower threshold (0.05) ensures wheels rotate even at slow speeds
            // Higher multiplier (0.35) makes rotation more visible
            if (travelSpeed > 0.05) {
                e.wheelRotation = (e.wheelRotation || 0) + travelSpeed * 0.35 * dt;
                if (e.wheelRotation > Math.PI * 2) e.wheelRotation -= Math.PI * 2;
            }

            if (!movementSucceeded) e.pathBlockedTime = (e.pathBlockedTime || 0) + dt;
            else e.pathBlockedTime = 0;

            if (!usingCover && !pursuingDetour && (!e.detour || e.detour.ttl <= 0) && (e.pathBlockedTime || 0) > ENEMY_PATH_FAIL_THRESHOLD) {
                const referenceAngle = hasLOS ? targetAngle : Math.atan2(player.y - e.y, player.x - e.x);
                e.detour = createDetourWaypoint(e, referenceAngle);
                e.pathBlockedTime = 0;
            }

            // Only fire if we have clear line of sight to target (no obstacles blocking)
            // and not stunned by electric weapon
            // MINIMUM FIRING DISTANCE: Enemies must be at least 150 units away to shoot
            // This ensures proper engagement range and prevents point-blank combat
            const MINIMUM_FIRING_DISTANCE = 150;
            const canFireAtDistance = d >= MINIMUM_FIRING_DISTANCE;
            
            // FIXED: Force retreat if too close to player (below minimum safe distance)
            const MINIMUM_SAFE_DISTANCE = 120;
            if (d < MINIMUM_SAFE_DISTANCE && !e.isRetreating) {
                // Back away from player to maintain proper combat distance
                moveAngle = Math.atan2(e.y - player.y, e.x - player.x); // Move away
                speedMult = 1.2; // Quick retreat
            }
            
            // Frozen enemies cannot fire - complete immobilization (same as player frozen effect)
            const isFrozen = e.frozenTime && e.frozenTime > 0;
            
            // Decrement alert shoot delay - enemy needs time to aim after being alerted
            if (e.alertShootDelay && e.alertShootDelay > 0) {
                e.alertShootDelay -= dt;
            }
            const canShootAfterAlert = !e.alertShootDelay || e.alertShootDelay <= 0;
            
            // Patrol mode enemies cannot shoot - they're unaware of player
            const canEngagePlayer = (e.aiState !== 'patrol') && (isAggro || d < 400);
            if (e.cooldown <= 0 && hasLOS && canEngagePlayer && canShootAfterAlert && !(e.stunnedTime && e.stunnedTime > 0) && !isFrozen && canFireAtDistance) {
                // Double-check LOS before firing to prevent shooting through obstacles
                const finalLOS = checkLineOfSight(e.x, e.y, targetX, targetY);
                
                // ADVANCED AI: Higher tier enemies check if shot would hit wall first
                const clearShot = intelligence >= 4 ? canShootWithoutHittingWall(e) : true;
                
                if (!finalLOS || !clearShot) {
                    e.cooldown = 15; // Short cooldown before rechecking
                    
                    // Smart repositioning: if wall blocks shot, try to find better angle
                    if (intelligence >= 5 && !clearShot) {
                        const betterAngle = findBetterShootingAngle(e);
                        if (betterAngle !== null) {
                            moveAngle = betterAngle;
                            speedMult = 0.8;
                        }
                    }
                } else {
                // Apply accuracy to turret angle BEFORE firing
                let tierAccuracy = ENEMY_TIERS[e.id]?.accuracy ?? 1;
                
                // Dizzy effect reduces accuracy by 50%
                if (e.dizzy && e.dizzy > 0) {
                    tierAccuracy *= 0.5;
                }
                
                const accurateAngle = applyWeaponAccuracy(e.turretAngle, e.weapon || 'cannon', true, tierAccuracy);
                e.turretAngle = accurateAngle;
                
                // Set recoil recovery time - slows turret tracking to show accuracy error visually
                e.recoilRecoveryTime = 18; // Same as player (~0.3 sec)
                
                // Apply recoil
                const recoilKick = (WEAPONS[e.weapon || 'cannon']?.recoil ?? 7) * 0.8;
                e.recoil = recoilKick;
                
                // PER-WEAPON KICKBACK PROFILES - Same as player for consistency
                // Each weapon creates unique recoil pattern
                const enemyKickbackProfiles = {
                    'cannon': { multiplier: 1.6, verticalBias: 0.15, decay: 0.70 },
                    'twin': { multiplier: 1.2, verticalBias: 0.08, decay: 0.65 },
                    'shotgun': { multiplier: 2.8, verticalBias: 0.25, decay: 0.60 },
                    'sniper': { multiplier: 3.5, verticalBias: 0.35, decay: 0.55 },
                    'burst': { multiplier: 1.4, verticalBias: 0.12, decay: 0.68 },
                    'flak': { multiplier: 2.4, verticalBias: 0.22, decay: 0.62 },
                    'rocket': { multiplier: 3.8, verticalBias: 0.40, decay: 0.50 },
                    'laser': { multiplier: 0.6, verticalBias: 0.02, decay: 0.85 },
                    'gauss': { multiplier: 4.2, verticalBias: 0.45, decay: 0.48 },
                    'ice': { multiplier: 1.8, verticalBias: 0.10, decay: 0.72 },
                    'fire': { multiplier: 2.0, verticalBias: 0.18, decay: 0.65 },
                    'electric': { multiplier: 2.2, verticalBias: 0.08, decay: 0.70 }
                };
                
                const kickProfile = enemyKickbackProfiles[e.weapon || 'cannon'] || enemyKickbackProfiles['cannon'];
                
                // DRAMATIC VISUAL TURRET RECOIL - weapon-specific kickback
                const recoilStrength = e.recoil * kickProfile.multiplier;
                const kickAngle = accurateAngle - Math.PI; // Backward direction
                const verticalKick = kickProfile.verticalBias * recoilStrength;
                
                e.turretRecoilOffsetX = Math.cos(kickAngle) * recoilStrength;
                e.turretRecoilOffsetY = Math.sin(kickAngle) * recoilStrength - verticalKick;
                e.turretRecoilDecay = kickProfile.decay; // Weapon-specific decay rate
                
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
                const bulletType = wStats.type || 'single'; // Store weapon type for bullet rendering

                if (wStats.type === 'spread' || wStats.type === 'shotgun') {
                    // Shotgun spread for enemy
                    for (let k = -1; k <= 1; k++) bullets.push({ x: bx, y: by, prevX: originX, prevY: originY, vx: Math.cos(shotAng + k * 0.2) * 9, vy: Math.sin(shotAng + k * 0.2) * 9, life: 60, color: weaponColor, dmg: dmg, isEnemy: true, type: 'spread' });
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
                    bullets.push({ x: bx + ox, y: by + oy, prevX: originX, prevY: originY, vx: Math.cos(shotAng) * 10, vy: Math.sin(shotAng) * 10, life: 80, color: weaponColor, dmg: dmg, isEnemy: true, type: 'twin' });
                    bullets.push({ x: bx - ox, y: by - oy, prevX: originX, prevY: originY, vx: Math.cos(shotAng) * 10, vy: Math.sin(shotAng) * 10, life: 80, color: weaponColor, dmg: dmg, isEnemy: true, type: 'twin' });
                    // Twin muzzle flash - dramatic dual plasma burst
                    for (let side of [1, -1]) {
                        const sideX = bx + ox * side;
                        const sideY = by + oy * side;
                        // Primary plasma burst from each barrel
                        for (let i = 0; i < 10; i++) {
                            const spreadAngle = shotAng + (Math.random() - 0.5) * 0.6;
                            particles.push({
                                x: sideX,
                                y: sideY,
                                vx: Math.cos(spreadAngle) * (8 + Math.random() * 5) + (Math.random() - 0.5) * 1.5,
                                vy: Math.sin(spreadAngle) * (8 + Math.random() * 5) + (Math.random() - 0.5) * 1.5,
                                life: 14 + Math.random() * 10,
                                color: Math.random() > 0.5 ? '#34d399' : '#10b981',
                                size: Math.random() * 5 + 2,
                                gravity: 0,
                                drag: 0.1
                            });
                        }
                        // Bright core flash
                        particles.push({
                            x: sideX + Math.cos(shotAng) * 5,
                            y: sideY + Math.sin(shotAng) * 5,
                            vx: Math.cos(shotAng) * 2,
                            vy: Math.sin(shotAng) * 2,
                            life: 6,
                            color: '#a7f3d0',
                            size: 8,
                            type: 'wave'
                        });
                        // Fast spark streaks
                        for (let i = 0; i < 4; i++) {
                            const sparkAngle = shotAng + (Math.random() - 0.5) * 0.4;
                            particles.push({
                                x: sideX,
                                y: sideY,
                                vx: Math.cos(sparkAngle) * (12 + Math.random() * 6),
                                vy: Math.sin(sparkAngle) * (12 + Math.random() * 6),
                                life: 6 + Math.random() * 4,
                                color: '#d1fae5',
                                size: 1.5,
                                gravity: 0,
                                drag: 0.05
                            });
                        }
                    }
                } else if (wStats.type === 'burst') {
                    // Burst fire - 3 shots like player burst weapon
                    // Store values for delayed shots
                    const burstAngle = shotAng;
                    const burstOriginX = originX;
                    const burstOriginY = originY;
                    const burstMuzzle = muzzle;
                    const burstColor = weaponColor;
                    const burstDmg = dmg;
                    const burstEnemy = e;
                    const burstKickProfile = kickProfile;
                    const burstRecoilBase = e.recoil;
                    
                    // Barrel offsets: center, right, left (same as player)
                    const barrelOffsets = [0, 9, -9];
                    const perpAngle = burstAngle + Math.PI / 2;
                    
                    for (let bi = 0; bi < 3; bi++) {
                        setTimeout(() => {
                            const barrelOffset = barrelOffsets[bi];
                            const barrelOriginX = burstOriginX + Math.cos(perpAngle) * barrelOffset;
                            const barrelOriginY = burstOriginY + Math.sin(perpAngle) * barrelOffset;
                            
                            let bbx = barrelOriginX + Math.cos(burstAngle) * burstMuzzle;
                            let bby = barrelOriginY + Math.sin(burstAngle) * burstMuzzle;
                            
                            bullets.push({ x: bbx, y: bby, prevX: barrelOriginX, prevY: barrelOriginY, vx: Math.cos(burstAngle) * 8, vy: Math.sin(burstAngle) * 8, life: 80, color: burstColor, dmg: burstDmg, isEnemy: true, type: 'burst' });
                            
                            // Apply kickback per burst shot
                            const burstRecoilStrength = burstRecoilBase * burstKickProfile.multiplier * 0.5;
                            const burstKickAngle = burstEnemy.turretAngle - Math.PI;
                            burstEnemy.turretRecoilOffsetX += Math.cos(burstKickAngle) * burstRecoilStrength;
                            burstEnemy.turretRecoilOffsetY += Math.sin(burstKickAngle) * burstRecoilStrength;
                            burstEnemy.recoil = Math.min(burstEnemy.recoil + burstRecoilBase * 0.4, burstRecoilBase * 2);
                            
                            // Burst muzzle flash per shot
                            for (let j = 0; j < 10; j++) {
                                particles.push({
                                    x: bbx,
                                    y: bby,
                                    vx: Math.cos(burstAngle) * (7 + Math.random() * 5) + (Math.random() - 0.5) * 2,
                                    vy: Math.sin(burstAngle) * (7 + Math.random() * 5) + (Math.random() - 0.5) * 2,
                                    life: 10 + Math.random() * 8,
                                    color: burstColor,
                                    size: Math.random() * 4 + 2,
                                    gravity: 0,
                                    drag: 0.15
                                });
                            }
                        }, bi * 100);
                    }
                } else if (wStats.type === 'aoe' || wStats.type === 'rocket') {
                    // Rocket with backblast
                    bullets.push({ x: bx, y: by, prevX: originX, prevY: originY, vx: Math.cos(shotAng) * 6, vy: Math.sin(shotAng) * 6, life: 120, color: weaponColor, dmg: 25, isEnemy: true, type: 'aoe' });
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
                } else if (wStats.type === 'laser' || wStats.type === 'rapid') {
                    // Laser/Plasma beam
                    bullets.push({ x: bx, y: by, prevX: originX, prevY: originY, vx: Math.cos(shotAng) * 15, vy: Math.sin(shotAng) * 15, life: 60, color: weaponColor, dmg: 5, isEnemy: true, type: 'rapid' });
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
                    bullets.push({ x: bx, y: by, prevX: originX, prevY: originY, vx: Math.cos(shotAng) * 8, vy: Math.sin(shotAng) * 8, life: 100, color: weaponColor, dmg: dmg, isEnemy: true, type: 'flak' });
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
                    bullets.push({ x: bx, y: by, prevX: originX, prevY: originY, vx: Math.cos(shotAng) * 12, vy: Math.sin(shotAng) * 12, life: 80, color: weaponColor, dmg: dmg, isEnemy: true, type: 'pierce' });
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
                } else if (wStats.type === 'sniper') {
                    // Sniper/Railgun
                    bullets.push({ x: bx, y: by, prevX: originX, prevY: originY, vx: Math.cos(shotAng) * 20, vy: Math.sin(shotAng) * 20, life: 60, color: weaponColor, dmg: dmg, isEnemy: true, type: 'sniper' });
                    // Railgun shockwave
                    for (let i = 0; i < 20; i++) {
                        particles.push({
                            x: bx,
                            y: by,
                            vx: Math.cos(shotAng + (Math.random() - 0.5) * 0.2) * (15 + Math.random() * 10),
                            vy: Math.sin(shotAng + (Math.random() - 0.5) * 0.2) * (15 + Math.random() * 10),
                            life: 10 + Math.random() * 8,
                            color: i % 2 === 0 ? weaponColor : '#ffffff',
                            size: Math.random() * 3 + 2,
                            gravity: 0,
                            drag: 0.15
                        });
                    }
                } else {
                    // Standard cannon or magical weapons (ice, fire, electric)
                    // Determine element type for magical weapons
                    let elementType = null;
                    let actualType = 'single'; // Default cannon type
                    if (e.weapon === 'ice' || wStats.type === 'ice') {
                        elementType = 'ice';
                        actualType = 'ice';
                    } else if (e.weapon === 'fire' || wStats.type === 'fire') {
                        elementType = 'fire';
                        actualType = 'fire';
                    } else if (e.weapon === 'electric' || wStats.type === 'electric') {
                        elementType = 'electric';
                        actualType = 'electric';
                    }
                    
                    bullets.push({ 
                        x: bx, 
                        y: by, 
                        prevX: originX, 
                        prevY: originY, 
                        vx: Math.cos(shotAng) * 8, 
                        vy: Math.sin(shotAng) * 8, 
                        life: 100, 
                        color: weaponColor, 
                        dmg: dmg, 
                        isEnemy: true,
                        type: actualType, // Add bullet type for rendering
                        element: elementType,  // Add element for magical weapons
                        trailClock: 0  // For elemental trail effects
                    });
                    // Cannon muzzle flash - enhanced steel artillery blast
                    const cannonColors = actualType === 'single' ? ['#d1d5db', '#9ca3af', '#6b7280', '#ffffff'] : [weaponColor];
                    // Primary blast cone
                    for (let i = 0; i < 18; i++) {
                        const spreadAngle = shotAng + (Math.random() - 0.5) * 0.6;
                        particles.push({
                            x: bx,
                            y: by,
                            vx: Math.cos(spreadAngle) * (9 + Math.random() * 7),
                            vy: Math.sin(spreadAngle) * (9 + Math.random() * 7),
                            life: 18 + Math.random() * 12,
                            color: cannonColors[Math.floor(Math.random() * cannonColors.length)],
                            size: Math.random() * 6 + 3,
                            gravity: 0,
                            drag: 0.12
                        });
                    }
                    // Smoke puffs for cannon
                    if (actualType === 'single') {
                        for (let i = 0; i < 5; i++) {
                            particles.push({
                                x: bx + (Math.random() - 0.5) * 8,
                                y: by + (Math.random() - 0.5) * 8,
                                vx: Math.cos(shotAng) * (2 + Math.random() * 2),
                                vy: Math.sin(shotAng) * (2 + Math.random() * 2) - Math.random(),
                                life: 25 + Math.random() * 15,
                                color: '#6b7280',
                                size: 8 + Math.random() * 5,
                                gravity: 0,
                                drag: 0.08
                            });
                        }
                        // Bright core flash
                        particles.push({
                            x: bx + Math.cos(shotAng) * 8,
                            y: by + Math.sin(shotAng) * 8,
                            vx: Math.cos(shotAng) * 4,
                            vy: Math.sin(shotAng) * 4,
                            life: 10,
                            color: '#ffffff',
                            size: 14,
                            gravity: 0,
                            drag: 0.25
                        });
                    }
                }
                e.cooldown = e.maxCooldown + Math.random() * 30;
                }
            }
            e.cooldown -= dt;
    }
    
    // Apply soft repulsion to keep enemies from clumping together
    // This runs after all movement to gradually push apart tanks that are too close
    applyEnemySoftRepulsion(dt);
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
    if (enemy.arcSide === undefined) enemy.arcSide = Math.random() > 0.5 ? 1 : -1;
    // FIXED: Initialize stableArcSide for consistent movement direction (prevents zigzag)
    if (enemy.stableArcSide === undefined) enemy.stableArcSide = enemy.arcSide;
    if (enemy.arcOffset === undefined) enemy.arcOffset = (Math.random() - 0.5) * ENEMY_ARC_VARIANCE;
    if (enemy.coverRecalc === undefined) enemy.coverRecalc = 0;
    if (enemy.detour === undefined) enemy.detour = null;
    if (enemy.pathBlockedTime === undefined) enemy.pathBlockedTime = 0;
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
// FIXED: Use consistent offsets based on arcSide to prevent zigzag
function getAvoidanceOffsets(enemy) {
    // Use stable arc side for consistent avoidance direction
    const preferredSide = enemy.stableArcSide || enemy.arcSide || 1;
    
    // Return ordered offsets that prefer one direction to prevent zigzag
    if (preferredSide > 0) {
        return [0.3, 0.6, 1.0, 1.5, -0.3, -0.6, -1.0, -1.5, 2.0, -2.0];
    } else {
        return [-0.3, -0.6, -1.0, -1.5, 0.3, 0.6, 1.0, 1.5, -2.0, 2.0];
    }
}

function getLaneOffsets(enemy) {
    // FIXED: Use consistent lane offsets based on arcSide to prevent zigzag
    const preferredSide = enemy.stableArcSide || enemy.arcSide || 1;
    
    // Return ordered offsets that prefer one direction
    if (preferredSide > 0) {
        return [0, 0.4, 0.8, 1.2, 1.6, -0.4, -0.8, -1.2, -1.6, Math.PI * 0.5, -Math.PI * 0.5];
    } else {
        return [0, -0.4, -0.8, -1.2, -1.6, 0.4, 0.8, 1.2, 1.6, -Math.PI * 0.5, Math.PI * 0.5];
    }
}

function findAvoidanceAngle(enemy, desiredAngle) {
    // SMOOTH: If path is clear, gradually release obstacle lock instead of instant release
    if (!pathBlocked(enemy, desiredAngle)) {
        if (enemy.obstacleLock && enemy.obstacleLock.ttl > 0) {
            enemy.obstacleLock.ttl -= 2; // Gradual release
            if (enemy.obstacleLock.ttl > 0) {
                // Still transitioning - use reduced offset
                return enemy.obstacleLock.offset * (enemy.obstacleLock.ttl / ENEMY_AVOID_LOCK_FRAMES);
            }
        }
        enemy.obstacleLock = null;
        return 0;
    }

    // STABLE: Keep using same avoidance direction if still valid
    if (enemy.obstacleLock && enemy.obstacleLock.ttl > 0) {
        enemy.obstacleLock.ttl -= 1;
        if (!pathBlocked(enemy, desiredAngle + enemy.obstacleLock.offset)) {
            return enemy.obstacleLock.offset;
        }
        // Current lock invalid - but don't immediately change, try nearby angles first
        const nearbyOffset = enemy.obstacleLock.offset * 0.8;
        if (!pathBlocked(enemy, desiredAngle + nearbyOffset)) {
            enemy.obstacleLock.offset = nearbyOffset;
            return nearbyOffset;
        }
        enemy.obstacleLock = null;
    }

    const offsets = getAvoidanceOffsets(enemy);
    for (let offset of offsets) {
        if (!pathBlocked(enemy, desiredAngle + offset)) {
            enemy.obstacleLock = { offset, ttl: ENEMY_AVOID_LOCK_FRAMES };
            return offset;
        }
    }

    // Emergency: Use stable side for consistent avoidance
    const emergencyOffset = (enemy.stableArcSide || enemy.arcSide || 1) * Math.PI * 0.5;
    enemy.obstacleLock = { offset: emergencyOffset, ttl: ENEMY_AVOID_LOCK_FRAMES };
    return emergencyOffset;
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

// Check if enemy is dangerously close to any wall (used to prevent wall-hugging)
// OPTIMIZED: Use spatial grid to only check nearby walls instead of all walls
function isNearWall(enemy, threshold = ENEMY_WALL_DANGER_DISTANCE) {
    // Check world boundaries
    if (enemy.x < threshold || enemy.x > WORLD_W - threshold) return true;
    if (enemy.y < threshold || enemy.y > WORLD_H - threshold) return true;
    
    // Use spatial grid to get only nearby walls
    const nearbyIndices = getNearbyWalls(enemy.x, enemy.y, threshold);
    
    for (let idx of nearbyIndices) {
        const w = walls[idx];
        if (!w) continue;
        // Distance to wall edges
        const closestX = Math.max(w.x, Math.min(enemy.x, w.x + w.w));
        const closestY = Math.max(w.y, Math.min(enemy.y, w.y + w.h));
        const dx = enemy.x - closestX;
        const dy = enemy.y - closestY;
        const distSq = dx * dx + dy * dy;
        if (distSq < threshold * threshold) return true;
    }
    return false;
}

// Get angle away from nearest wall (for wall avoidance)
// OPTIMIZED: Use spatial grid to only check nearby walls
// FIXED: Use smoother escape with consistent direction to prevent zigzag
function getAngleAwayFromWall(enemy) {
    let awayX = 0, awayY = 0;
    let closestWallDist = Infinity;
    
    // Push away from world boundaries - use smaller margin for tighter spaces
    const margin = ENEMY_WALL_DANGER_DISTANCE * 0.8; // Reduced margin
    const boundaryPush = 0.5; // Gentler boundary push
    
    if (enemy.x < margin) {
        const strength = (margin - enemy.x) / margin;
        awayX += boundaryPush * strength;
    }
    if (enemy.x > WORLD_W - margin) {
        const strength = (enemy.x - (WORLD_W - margin)) / margin;
        awayX -= boundaryPush * strength;
    }
    if (enemy.y < margin) {
        const strength = (margin - enemy.y) / margin;
        awayY += boundaryPush * strength;
    }
    if (enemy.y > WORLD_H - margin) {
        const strength = (enemy.y - (WORLD_H - margin)) / margin;
        awayY -= boundaryPush * strength;
    }
    
    // Use spatial grid to get only nearby walls
    const nearbyIndices = getNearbyWalls(enemy.x, enemy.y, margin);
    
    for (let idx of nearbyIndices) {
        const w = walls[idx];
        if (!w) continue;
        const closestX = Math.max(w.x, Math.min(enemy.x, w.x + w.w));
        const closestY = Math.max(w.y, Math.min(enemy.y, w.y + w.h));
        const dx = enemy.x - closestX;
        const dy = enemy.y - closestY;
        const distSq = dx * dx + dy * dy;
        
        if (distSq > 0) {
            const dist = Math.sqrt(distSq);
            if (dist < closestWallDist) closestWallDist = dist;
            
            if (dist < margin) {
                // FIXED: Use cubic falloff for smoother escape - no sudden changes
                const normalizedDist = dist / margin;
                const strength = Math.pow(1 - normalizedDist, 2) * 0.8; // Quadratic, gentler
                awayX += (dx / dist) * strength;
                awayY += (dy / dist) * strength;
            }
        }
    }
    
    if (awayX === 0 && awayY === 0) return null;
    
    // FIXED: Smooth the wall escape direction to prevent zigzag
    if (enemy.lastWallEscapeX === undefined) enemy.lastWallEscapeX = awayX;
    if (enemy.lastWallEscapeY === undefined) enemy.lastWallEscapeY = awayY;
    
    const wallSmoothing = 0.2; // Heavy smoothing for wall avoidance
    awayX = enemy.lastWallEscapeX + (awayX - enemy.lastWallEscapeX) * wallSmoothing;
    awayY = enemy.lastWallEscapeY + (awayY - enemy.lastWallEscapeY) * wallSmoothing;
    enemy.lastWallEscapeX = awayX;
    enemy.lastWallEscapeY = awayY;
    
    return Math.atan2(awayY, awayX);
}

// ==================== ADVANCED PATHFINDING SYSTEM ====================
// When direct path is blocked, AI uses multi-level pathfinding:
// Level 1: Quick angle scanning (getLaneOffsets)
// Level 2: Wide arc scanning with distance checks
// Level 3: BFS-style waypoint search for longer detours
// Level 4: Persistent exploration mode when truly stuck

// Advanced pathfinding - finds route around obstacles with progressive scanning
// If simple scanning fails, escalates to wide search and BFS-style exploration
function findPathAroundObstacle(enemy, targetAngle) {
    // Level 1: Quick scan using standard lane offsets
    const scanAngles = getLaneOffsets(enemy);
    for (let angleOffset of scanAngles) {
        const testAngle = targetAngle + angleOffset;
        if (!pathBlocked(enemy, testAngle)) {
            return testAngle;
        }
    }
    
    // Level 2: Wide arc scanning - scan full 360 degrees in small increments
    // This catches angles that might be missed by the standard offsets
    const preferredSide = enemy.stableArcSide || enemy.arcSide || 1;
    for (let i = 1; i <= 12; i++) {
        // Alternate between left and right, gradually increasing angle
        const angleStep = (Math.PI / 6) * i; // 30 degree increments up to 360
        
        // Try preferred side first
        const preferredAngle = targetAngle + (preferredSide * angleStep);
        if (!pathBlocked(enemy, preferredAngle)) {
            return preferredAngle;
        }
        
        // Try opposite side
        const oppositeAngle = targetAngle - (preferredSide * angleStep);
        if (!pathBlocked(enemy, oppositeAngle)) {
            return oppositeAngle;
        }
    }
    
    // Level 3: BFS-style waypoint search - find intermediate point that has clear path to both enemy and target
    const waypointResult = findBFSWaypoint(enemy, targetAngle);
    if (waypointResult) {
        // Store waypoint for multi-step navigation
        enemy.bfsWaypoint = waypointResult;
        return waypointResult.angle;
    }
    
    // Level 4: If still stuck, enter exploration mode
    // Move in gradually expanding circles until a path opens up
    if (!enemy.explorationMode) {
        enemy.explorationMode = {
            startTime: frame,
            angle: targetAngle + (preferredSide * Math.PI * 0.5),
            radius: 0
        };
    }
    
    // Slowly rotate exploration angle
    enemy.explorationMode.angle += preferredSide * 0.05;
    enemy.explorationMode.radius += 0.3;
    
    // If explored for too long, reset and try opposite direction
    if (frame - enemy.explorationMode.startTime > 120) {
        enemy.explorationMode.startTime = frame;
        enemy.explorationMode.angle = targetAngle - (preferredSide * Math.PI * 0.5);
    }
    
    return enemy.explorationMode.angle;
}

// BFS-style waypoint search - finds intermediate navigation point
// Scans multiple potential waypoints to find one that creates a valid two-leg path
function findBFSWaypoint(enemy, targetAngle) {
    const targetX = player.x;
    const targetY = player.y;
    const searchRadius = [150, 250, 350, 450]; // Multiple search distances
    const angleSteps = 16; // Scan 16 directions (22.5 degrees each)
    
    let bestWaypoint = null;
    let bestScore = -Infinity;
    
    for (const radius of searchRadius) {
        for (let i = 0; i < angleSteps; i++) {
            const scanAngle = (Math.PI * 2 / angleSteps) * i;
            const waypointX = enemy.x + Math.cos(scanAngle) * radius;
            const waypointY = enemy.y + Math.sin(scanAngle) * radius;
            
            // Skip if waypoint is out of bounds
            if (waypointX < 100 || waypointX > WORLD_W - 100 || 
                waypointY < 100 || waypointY > WORLD_H - 100) continue;
            
            // Check if we can reach this waypoint
            const canReachWaypoint = !pathBlockedToPoint(enemy, waypointX, waypointY);
            if (!canReachWaypoint) continue;
            
            // Check if waypoint can see the target (or at least gets us closer)
            const waypointDistToTarget = Math.hypot(waypointX - targetX, waypointY - targetY);
            const currentDistToTarget = Math.hypot(enemy.x - targetX, enemy.y - targetY);
            
            // Score based on: 
            // 1. Gets us closer to target (major factor)
            // 2. Not too far out of the way (penalty for longer routes)
            // 3. Bonus for waypoints that have clear line to target
            const closerFactor = (currentDistToTarget - waypointDistToTarget);
            const routeLengthPenalty = radius * 0.2;
            const hasTargetLOS = checkLineOfSight(waypointX, waypointY, targetX, targetY);
            const losBonuse = hasTargetLOS ? 100 : 0;
            
            const score = closerFactor * 3 - routeLengthPenalty + losBonuse;
            
            if (score > bestScore && score > 0) {
                bestScore = score;
                bestWaypoint = {
                    x: waypointX,
                    y: waypointY,
                    angle: scanAngle,
                    ttl: 180
                };
            }
        }
        
        // If we found a good waypoint at this radius, use it
        if (bestWaypoint && bestScore > 50) break;
    }
    
    return bestWaypoint;
}

// Check if path to a specific point is blocked (for BFS waypoint validation)
function pathBlockedToPoint(enemy, targetX, targetY) {
    const dist = Math.hypot(targetX - enemy.x, targetY - enemy.y);
    const angle = Math.atan2(targetY - enemy.y, targetX - enemy.x);
    const steps = Math.ceil(dist / 50);
    
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const checkX = enemy.x + (targetX - enemy.x) * t;
        const checkY = enemy.y + (targetY - enemy.y) * t;
        
        if (!canEnemyOccupyPosition(enemy, checkX, checkY, ENEMY_WALL_PADDING)) {
            return true;
        }
    }
    return false;
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
        // FIXED: Use stableArcSide for consistent flanking direction (prevents zigzag)
        if (!enemy.flankingPhase) enemy.flankingPhase = enemy.stableArcSide || enemy.arcSide || 1;
        
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
            // FIXED: Use stableArcSide for consistent flank direction (prevents zigzag)
            if (!enemy.flankDirection) {
                const side = enemy.stableArcSide || enemy.arcSide || 1;
                enemy.flankDirection = side * Math.PI * 0.4;
            }
            
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
            // FIXED: Initialize search angle based on approach direction, not random
            if (!enemy.searchAngle) enemy.searchAngle = angleToLastKnown;
            const searchSide = enemy.stableArcSide || enemy.arcSide || 1;
            enemy.searchAngle += 0.02 * dt * searchSide;
            
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
        // FIXED: Use fixed offset based on arcSide instead of random (prevents zigzag)
        const side = enemy.stableArcSide || enemy.arcSide || 1;
        const pursuitOffset = side * 0.15; // Slight consistent offset instead of random
        const pursuitAngle = angleToLastKnown + pursuitOffset;
        
        return { angle: pursuitAngle, speedMult: 0.9 };
    } else {
        // Novice AI (Tier 0): Direct approach to last known position
        // Most predictable behavior
        if (timeSinceSeen > 180) {
            // Lost player for too long - give up and patrol
            // FIXED: Use consistent turn direction instead of random
            const side = enemy.stableArcSide || enemy.arcSide || 1;
            return { angle: enemy.angle + side * 0.25, speedMult: 0.7 };
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
            stampEnemyTrack(enemy);
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
            stampEnemyTrack(enemy);
            return true;
        }
    }
    return false;
}

function stampEnemyTrack(enemy) {
    if (!enemy || !enemyTracks) return;
    
    // Store previous position for continuous track drawing
    if (typeof enemy.lastTrackX !== 'number') {
        enemy.lastTrackX = enemy.x;
        enemy.lastTrackY = enemy.y;
        enemy.lastTrackAngle = enemy.angle;
        return;
    }
    
    // Continuous tracking - stamp very frequently for ultra-smooth curves
    const spacing = 5; // Very small spacing for silky smooth curves on turns
    const dist = Math.hypot(enemy.x - enemy.lastTrackX, enemy.y - enemy.lastTrackY);
    if (dist < spacing) return; // Only distance check, no frame skip for continuity
    
    const previousAngle = enemy.lastTrackAngle;
    const angleDelta = getAngleDelta(enemy.angle, previousAngle);
    const curve = Math.max(-1, Math.min(1, angleDelta / (Math.PI / 5)));
    const maxLife = 2500 + Math.random() * 500; // Extra long life for extended trails
    const treadOffset = 20; // Distance from center to each track (matches tank wheel Y positions: -18 to +18)
    const treadWidth = 10; // Width of each track mark
    
    // Store for continuous line drawing
    const prevX = enemy.lastTrackX;
    const prevY = enemy.lastTrackY;
    const prevAngle = enemy.lastTrackAngle;
    
    // Update last position
    enemy.lastTrackX = enemy.x;
    enemy.lastTrackY = enemy.y;
    enemy.lastTrackAngle = enemy.angle;
    
    // Store timestamp for sequential gradient effect
    enemyTracks.push({
        x: enemy.x,
        y: enemy.y,
        angle: enemy.angle,
        prevX: prevX,
        prevY: prevY,
        prevAngle: prevAngle,
        alpha: 0.30,
        baseAlpha: 0.30,
        life: maxLife,
        maxLife,
        decayRate: 0.25, // Very slow decay for smooth gradient transition
        curve,
        treadOffset,
        width: treadWidth,
        birthTime: performance.now() // Track creation time for ordering
    });
    if (enemyTracks.length > 800) enemyTracks.shift(); // More tracks for longer trails
}

// === SOFT REPULSION SYSTEM ===
// Gradually pushes enemy tanks apart when they get too close to each other
// This runs every frame to ensure tanks maintain minimum distance
// Different from applySquadSeparation which only affects steering angle
function applyEnemySoftRepulsion(dt) {
    if (!enemies || enemies.length < 2) return;
    
    const minDist = ENEMY_MIN_DISTANCE;
    const repelStrength = ENEMY_REPULSION_STRENGTH;
    
    // Use spatial grid if available for O(n) instead of O(n²)
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e) continue;
        
        // Skip if spawning or frozen solid
        if (e.spawnWarmup > 0) continue;
        if (e.frozenTime && e.frozenTime > 0) continue;
        
        let pushX = 0;
        let pushY = 0;
        let pushCount = 0;
        
        // Get nearby enemies using spatial grid for efficiency
        const nearbyIndices = typeof getNearbyEnemies === 'function' 
            ? getNearbyEnemies(e.x, e.y, ENEMY_SOFT_SEPARATION * 1.5)
            : enemies.map((_, idx) => idx); // Fallback to all enemies
        
        for (let idx of nearbyIndices) {
            const other = enemies[idx];
            if (!other || other === e) continue;
            if (other.spawnWarmup > 0) continue;
            
            const dx = e.x - other.x;
            const dy = e.y - other.y;
            const dist = Math.hypot(dx, dy);
            
            // Only repel when closer than minimum distance
            if (dist > 0 && dist < minDist) {
                // Calculate repulsion strength based on overlap
                // Stronger push when very close, gentler at edge of min distance
                const overlap = minDist - dist;
                const strength = (overlap / minDist) * repelStrength;
                
                // Normalize direction and apply strength
                const nx = dx / dist;
                const ny = dy / dist;
                pushX += nx * strength;
                pushY += ny * strength;
                pushCount++;
            }
        }
        
        // Apply accumulated push if any
        if (pushCount > 0 && (pushX !== 0 || pushY !== 0)) {
            // Scale push by dt for frame-rate independence
            const scaledPushX = pushX * dt;
            const scaledPushY = pushY * dt;
            
            // Try to move to new position
            const newX = e.x + scaledPushX;
            const newY = e.y + scaledPushY;
            
            // Check if new position is valid (not in wall/river)
            if (typeof canEnemyOccupyPosition === 'function' && canEnemyOccupyPosition(e, newX, newY, 0)) {
                e.x = newX;
                e.y = newY;
            } else {
                // Try X only
                if (scaledPushX !== 0 && canEnemyOccupyPosition(e, e.x + scaledPushX, e.y, 0)) {
                    e.x += scaledPushX;
                }
                // Try Y only
                if (scaledPushY !== 0 && canEnemyOccupyPosition(e, e.x, e.y + scaledPushY, 0)) {
                    e.y += scaledPushY;
                }
            }
        }
    }
}

function canEnemyOccupyPosition(enemy, x, y, padding = ENEMY_WALL_PADDING) {
    const radius = (enemy.radius || player.radius) + padding;
    // Check river boundary - enemies cannot cross the river
    const riverBoundary = typeof RIVER_BOUNDARY !== 'undefined' ? RIVER_BOUNDARY : 120;
    if (x - radius < riverBoundary || x + radius > WORLD_W - riverBoundary ||
        y - radius < riverBoundary || y + radius > WORLD_H - riverBoundary) {
        return false;
    }
    return !checkWall(x, y, radius) && !checkCrate(x, y, radius);
}

function checkEnemyCollision(currentEnemy, x, y) {
    // FIXED: Use smaller hard collision radius to allow tanks to pass through narrow spaces
    // Soft separation is handled by applySquadSeparation instead of blocking movement
    const hardCollisionRadius = ENEMY_HARD_SEPARATION;
    for (let other of enemies) {
        if (other === currentEnemy) continue;
        const dist = Math.hypot(x - other.x, y - other.y);
        if (dist < hardCollisionRadius) return true;
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

// Forces squads to fan out and maintain distance without excessive strafing
// FIXED: Reduced strafe tendency to prevent zigzag movement
function maintainFormationSpacing(enemy, angle, distanceToPlayer, desiredRadius) {
    if (!player) return angle;
    const towardPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    
    // Too close - back away directly (no strafing)
    if (distanceToPlayer < desiredRadius - 25) {
        const pullBack = towardPlayer + Math.PI;
        return blendAngles(angle, pullBack, 0.6);
    }
    
    // Too far - move directly toward player (prioritize approach over strafing)
    if (distanceToPlayer > desiredRadius + 100) {
        return blendAngles(angle, towardPlayer, 0.85);
    }
    
    // At optimal range - only slight strafe, mostly hold position
    // Use a stable strafe direction based on arcSide (no random changes)
    if (!enemy.stableArcSide) {
        enemy.stableArcSide = enemy.arcSide || (Math.random() > 0.5 ? 1 : -1);
    }
    const strafeAngle = towardPlayer + enemy.stableArcSide * (Math.PI / 2);
    // Very low weight for strafe to prevent zigzag
    return blendAngles(angle, strafeAngle, ENEMY_ARC_STRAFE_WEIGHT * 0.5);
}

// Local separation steering keeps tanks from occupying the same tile.
// OPTIMIZED: Use spatial grid to only check nearby enemies instead of all enemies (O(n) instead of O(n²))
// FIXED: Smoother separation with gradual force that prevents zigzag
function applySquadSeparation(enemy, angle) {
    let sepX = 0;
    let sepY = 0;
    let closestDist = Infinity;
    
    // Use spatial grid to get only nearby enemies
    const nearbyIndices = getNearbyEnemies(enemy.x, enemy.y, ENEMY_SOFT_SEPARATION * 2);
    
    for (let idx of nearbyIndices) {
        const other = enemies[idx];
        if (!other || other === enemy) continue;
        const dx = enemy.x - other.x;
        const dy = enemy.y - other.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist < closestDist) closestDist = dist;
        
        if (dist > 0 && dist < ENEMY_SOFT_SEPARATION) {
            // FIXED: Use smooth cubic falloff for very gentle separation
            // Stronger when very close, gentle when near edge
            const normalizedDist = dist / ENEMY_SOFT_SEPARATION;
            const strength = Math.pow(1 - normalizedDist, 3); // Cubic falloff - very smooth
            const dirX = dx / dist;
            const dirY = dy / dist;
            sepX += dirX * strength;
            sepY += dirY * strength;
        }
    }
    
    if (sepX === 0 && sepY === 0) return angle;
    
    // FIXED: Heavy smoothing to prevent any rapid direction changes
    if (enemy.lastSepX === undefined) enemy.lastSepX = 0;
    if (enemy.lastSepY === undefined) enemy.lastSepY = 0;
    
    // Very smooth exponential decay - prevents zigzag
    const sepSmoothing = 0.2; // Slightly higher for faster separation response
    sepX = enemy.lastSepX + (sepX - enemy.lastSepX) * sepSmoothing;
    sepY = enemy.lastSepY + (sepY - enemy.lastSepY) * sepSmoothing;
    enemy.lastSepX = sepX;
    enemy.lastSepY = sepY;
    
    const repelAngle = Math.atan2(sepY, sepX);
    
    // IMPROVED: Stronger separation weights for better spread
    let weight = 0;
    if (closestDist < ENEMY_HARD_SEPARATION) {
        // Very close - strong separation to prevent overlap
        weight = 0.75; // Increased from 0.6
    } else if (closestDist < ENEMY_SOFT_SEPARATION) {
        // Soft zone - moderate separation for better spread
        const ratio = (ENEMY_SOFT_SEPARATION - closestDist) / (ENEMY_SOFT_SEPARATION - ENEMY_HARD_SEPARATION);
        weight = ratio * 0.45; // Increased from 0.3 for better spread
    }
    
    return blendAngles(angle, repelAngle, weight);
}

function blendAngles(current, target, weight) {
    let diff = target - current;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return current + diff * weight;
}

// Pulls a point behind the nearest crate so low HP enemies can heal/reload.
function findCoverRetreatPoint(enemy) {
    if (typeof getNearestCrateCenter !== 'function') return null;
    const cover = getNearestCrateCenter(enemy.x, enemy.y);
    if (!cover) return null;
    const toPlayerX = player.x - cover.x;
    const toPlayerY = player.y - cover.y;
    const len = Math.hypot(toPlayerX, toPlayerY) || 1;
    const offset = ENEMY_COVER_BUFFER + Math.random() * 40;
    const coverX = cover.x - (toPlayerX / len) * offset;
    const coverY = cover.y - (toPlayerY / len) * offset;
    return {
        x: clamp(coverX, 40, WORLD_W - 40),
        y: clamp(coverY, 40, WORLD_H - 40)
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function createDetourWaypoint(enemy, referenceAngle) {
    // IMPROVED: Try multiple angles and distances to find a valid waypoint
    const baseOffsets = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, Math.PI * 0.5, -Math.PI * 0.5, Math.PI];
    const preferredSide = enemy.stableArcSide || enemy.arcSide || 1;
    
    // Sort offsets to prefer one side (prevents zigzag)
    const offsets = preferredSide > 0 
        ? baseOffsets.filter(o => o >= 0).concat(baseOffsets.filter(o => o < 0))
        : baseOffsets.filter(o => o <= 0).concat(baseOffsets.filter(o => o > 0));
    
    // Try multiple distances (shorter distances are more achievable)
    const distances = [
        ENEMY_DETOUR_DISTANCE * 0.5,
        ENEMY_DETOUR_DISTANCE * 0.75,
        ENEMY_DETOUR_DISTANCE,
        ENEMY_DETOUR_DISTANCE * 1.25
    ];
    
    for (let dist of distances) {
        for (let offset of offsets) {
            const detourAngle = referenceAngle + offset;
            const travel = dist + Math.random() * (ENEMY_DETOUR_VARIANCE * 0.5);
            let tx = enemy.x + Math.cos(detourAngle) * travel;
            let ty = enemy.y + Math.sin(detourAngle) * travel;
            tx = clamp(tx, 60, WORLD_W - 60);
            ty = clamp(ty, 60, WORLD_H - 60);
            if (canEnemyOccupyPosition(enemy, tx, ty)) {
                return { x: tx, y: ty, ttl: ENEMY_DETOUR_TIMEOUT };
            }
        }
    }
    
    // FALLBACK: If no waypoint found, create one toward player
    // This ensures tanks always have somewhere to go
    const playerAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const fallbackDist = 100;
    let fx = enemy.x + Math.cos(playerAngle) * fallbackDist;
    let fy = enemy.y + Math.sin(playerAngle) * fallbackDist;
    fx = clamp(fx, 60, WORLD_W - 60);
    fy = clamp(fy, 60, WORLD_H - 60);
    return { x: fx, y: fy, ttl: ENEMY_DETOUR_TIMEOUT * 0.5 };
}

// When an enemy fails to move we steer it using a temporary vector rather than teleporting.
// This keeps motion smooth, eliminating the visible "blink" during corrections.
// IMPROVED: Multi-level unstuck system with progressive escalation
// Level 1: Try standard angles toward player
// Level 2: Wide 360-degree scan
// Level 3: BFS waypoint search for alternate routes
// Level 4: Persistent exploration mode
function forceEnemyUnstuck(enemy) {
    enemy.stuckTimer = 0;
    
    // Track how many times we've been stuck recently (for escalation)
    if (!enemy.stuckEscalation) enemy.stuckEscalation = 0;
    if (!enemy.lastStuckTime) enemy.lastStuckTime = 0;
    
    // Reset escalation if we've been unstuck for a while
    if (frame - enemy.lastStuckTime > 300) {
        enemy.stuckEscalation = 0;
    }
    enemy.stuckEscalation++;
    enemy.lastStuckTime = frame;
    
    // Primary goal: Move toward player
    const playerAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const preferredSide = enemy.stableArcSide || enemy.arcSide || 1;
    
    let bestAngle = playerAngle;
    let foundPath = false;
    
    // Level 1: Standard angle offsets (quick check)
    if (enemy.stuckEscalation <= 2) {
        const offsets = [0, preferredSide * 0.5, preferredSide * 1.0, preferredSide * 1.5, -preferredSide * 0.5, -preferredSide * 1.0];
        for (let offset of offsets) {
            const testAngle = playerAngle + offset;
            if (!pathBlocked(enemy, testAngle)) {
                bestAngle = testAngle;
                foundPath = true;
                break;
            }
        }
    }
    
    // Level 2: Full 360-degree scan (when stuck multiple times)
    if (!foundPath && enemy.stuckEscalation >= 2) {
        for (let i = 0; i < 24; i++) {
            // Scan in alternating directions from player angle
            const scanOffset = (Math.PI / 12) * Math.ceil(i / 2) * (i % 2 === 0 ? preferredSide : -preferredSide);
            const testAngle = playerAngle + scanOffset;
            if (!pathBlocked(enemy, testAngle)) {
                bestAngle = testAngle;
                foundPath = true;
                break;
            }
        }
    }
    
    // Level 3: BFS waypoint search (when really stuck)
    if (!foundPath && enemy.stuckEscalation >= 3) {
        const waypoint = findBFSWaypoint(enemy, playerAngle);
        if (waypoint) {
            enemy.bfsWaypoint = waypoint;
            bestAngle = waypoint.angle;
            foundPath = true;
        }
    }
    
    // Level 4: Exploration mode - move in expanding spiral until path opens
    if (!foundPath && enemy.stuckEscalation >= 4) {
        // Enter persistent exploration mode
        if (!enemy.explorationMode || enemy.explorationMode.startTime < frame - 300) {
            enemy.explorationMode = {
                startTime: frame,
                angle: playerAngle + (preferredSide * Math.PI * 0.5),
                spiralRadius: 0
            };
        }
        
        // Spiral outward while rotating
        enemy.explorationMode.angle += preferredSide * 0.1;
        enemy.explorationMode.spiralRadius += 0.5;
        
        // Use exploration angle
        bestAngle = enemy.explorationMode.angle;
        
        // After a full rotation, reset escalation to try again
        if (enemy.explorationMode.spiralRadius > 100) {
            enemy.stuckEscalation = 1;
            enemy.explorationMode = null;
        }
    }
    
    // Check if near wall and blend with escape angle (but less aggressive)
    const wallEscapeAngle = getAngleAwayFromWall(enemy);
    if (wallEscapeAngle !== null && !foundPath) {
        // Only blend if we didn't find a good path
        bestAngle = blendAngles(bestAngle, wallEscapeAngle, 0.3);
    }
    
    // Longer unstuck duration for higher escalation levels
    const unstuckDuration = 180 + (enemy.stuckEscalation * 60);
    
    enemy.unstuck = {
        angle: bestAngle,
        ttl: Math.min(unstuckDuration, 360) // Cap at 6 seconds
    };
    
    // Clear any existing navigation state that might be causing issues
    enemy.detour = null;
    enemy.pathBlockedTime = 0;
    enemy.obstacleLock = null;
    
    // Reset patrol and queue state with variation
    enemy.patrolPoint = createPatrolWaypoint(enemy.guardPoint);
    enemy.patrolCooldown = 60;
    enemy.queueAngle = (enemy.queueAngle || 0) + (Math.PI * 0.25 * enemy.stuckEscalation); // Shift more each time
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
    
    // CRITICAL: Always check if boss should be dead
    // This catches edge cases where damage didn't trigger killBoss() properly
    if (boss.hp <= 0) {
        killBoss();
        return;
    }
    
    // === METEOR SPAWN ANIMATION ===
    // Boss descends from sky like a meteor before becoming active
    // FIXED: Boss fades in FIRST (longer fade), then meteor fades out
    if (boss.meteorSpawnActive) {
        boss.meteorSpawnTimer -= dt;
        const totalDuration = 240; // Extended duration for smoother boss reveal (4 seconds)
        const progress = 1 - (boss.meteorSpawnTimer / totalDuration);
        
        if (progress < 0.4) {
            // Phase 0: Descending from sky (40% of duration)
            // Height goes from 500 to 0, then boss continues fade-in at ground level
            boss.meteorSpawnPhase = 0;
            // Ease-in cubic for accelerating descent
            const descendProgress = progress / 0.4; // 0 to 1 over 40% of duration
            const easeIn = descendProgress * descendProgress * descendProgress;
            boss.meteorScale = 0.1 + easeIn * 0.9;
            boss.meteorHeight = 500 * (1 - easeIn);
            
            // SMOOTH FADE-IN with ease-in-out curve for opacity and blur
            // Opacity starts at 0.3 and goes to 0.7 during descent (not full opacity yet)
            const easeInOut = descendProgress < 0.5 
                ? 2 * descendProgress * descendProgress 
                : 1 - Math.pow(-2 * descendProgress + 2, 2) / 2;
            
            // Opacity: 0.2 -> 0.8 during descent (partial fade-in)
            boss.meteorOpacity = 0.2 + easeInOut * 0.6;
            
            // Blur: 25 -> 5 during descent (still some blur)
            boss.meteorBlur = 25 - easeInOut * 20;
            
            // Meteor fire fades as boss descends
            boss.meteorFireOpacity = 1 - easeInOut * 0.7;
            
            // Screen shake increases as meteor approaches
            screenShake = Math.floor(easeIn * 15);
            
            // Trail particles (fire trail) - less intense as boss fades in
            if (frame % 2 === 0 && boss.meteorFireOpacity > 0.3) {
                const particleCount = Math.floor(5 * boss.meteorFireOpacity);
                for (let i = 0; i < particleCount; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = boss.radius * boss.meteorScale * 0.5;
                    particles.push({
                        x: boss.x + Math.cos(angle) * dist,
                        y: boss.y + Math.sin(angle) * dist - boss.meteorHeight,
                        vx: (Math.random() - 0.5) * 4,
                        vy: 5 + Math.random() * 8,
                        life: 30 + Math.random() * 20,
                        color: i % 3 === 0 ? '#ff6600' : (i % 2 === 0 ? '#ff0000' : '#ffcc00'),
                        size: 8 + Math.random() * 12
                    });
                }
            }
        } else if (progress < 0.55) {
            // Phase 0.5: Landing fade-in - boss at ground, finishing opacity transition
            boss.meteorSpawnPhase = 0;
            boss.meteorHeight = 0; // At ground level
            boss.meteorScale = 1;
            
            // Continue fade-in from 0.8 to 1.0 (landing transition)
            const landingProgress = (progress - 0.4) / 0.15; // 0 to 1 over 15% duration
            const easeOut = 1 - Math.pow(1 - landingProgress, 2);
            
            boss.meteorOpacity = 0.8 + easeOut * 0.2; // 0.8 -> 1.0
            boss.meteorBlur = 5 * (1 - easeOut); // 5 -> 0
            boss.meteorFireOpacity = 0.3 * (1 - easeOut); // 0.3 -> 0
            
            // Light screen shake
            screenShake = Math.floor(5 + landingProgress * 10);
            
        } else if (progress < 0.65) {
            // Phase 1: Impact! Boss is now fully visible
            if (boss.meteorSpawnPhase !== 1) {
                boss.meteorSpawnPhase = 1;
                boss.meteorScale = 1;
                boss.meteorHeight = 0;
                boss.meteorOpacity = 1.0; // Boss is fully visible at impact
                boss.meteorBlur = 0; // No blur at impact
                boss.meteorFireOpacity = 0; // Meteor fire completely gone
                
                // EARTHQUAKE EFFECT - massive screen shake
                screenShake = 60;
                
                // Impact explosion
                for (let i = 0; i < 100; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 10 + Math.random() * 20;
                    particles.push({
                        x: boss.x + (Math.random() - 0.5) * 60,
                        y: boss.y + (Math.random() - 0.5) * 60,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        life: 40 + Math.random() * 30,
                        color: i % 4 === 0 ? '#ffffff' : (i % 3 === 0 ? '#ff6600' : (i % 2 === 0 ? '#996633' : '#333333')),
                        size: 6 + Math.random() * 10
                    });
                }
                
                // Shockwave rings
                for (let ring = 0; ring < 3; ring++) {
                    setTimeout(() => {
                        particles.push({
                            x: boss.x,
                            y: boss.y,
                            size: 50,
                            life: 40,
                            color: ring === 0 ? 'rgba(255, 200, 100, 0.5)' : (ring === 1 ? 'rgba(255, 150, 50, 0.4)' : 'rgba(200, 100, 0, 0.3)'),
                            type: 'wave'
                        });
                    }, ring * 100);
                }
                
                // Dust cloud
                for (let i = 0; i < 40; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = boss.radius * 0.8;
                    particles.push({
                        x: boss.x + Math.cos(angle) * dist,
                        y: boss.y + Math.sin(angle) * dist,
                        vx: Math.cos(angle) * (3 + Math.random() * 5),
                        vy: -Math.random() * 3 - 1,
                        life: 60 + Math.random() * 40,
                        color: '#8B7355',
                        size: 10 + Math.random() * 15,
                        gravity: 0.05
                    });
                }
                
                addFloatText('IMPACT!', boss.x, boss.y - 100, '#ff6600');
            }
        } else {
            // Phase 2: Settling dust - boss already fully visible, just dust settling
            boss.meteorSpawnPhase = 2;
            const settleProgress = (progress - 0.65) / 0.35; // 35% of duration for settling
            screenShake = Math.max(0, 15 * (1 - settleProgress));
            
            // Boss stays fully visible during dust settling phase
            boss.meteorOpacity = 1.0;
            boss.meteorBlur = 0;
            
            // Scale eases to final size (very subtle)
            const easedSettle = 1 - Math.pow(1 - settleProgress, 4);
            boss.meteorScale = 0.98 + easedSettle * 0.02;
            
            // Check if animation complete
            if (boss.meteorSpawnTimer <= 0) {
                boss.meteorSpawnActive = false;
                boss.meteorScale = 1;
                boss.meteorHeight = 0;
                boss.meteorOpacity = 1; // Fully visible - no additional fade needed
                boss.meteorBlur = 0; // No blur
                screenShake = 0;
            }
        }
        
        // Don't process normal boss logic during meteor spawn
        return;
    }
    
    // Don't attack if player is teleporting/spawning
    const playerIsTeleporting = player.spawnWarmup > 0;
    
    boss.timer -= dt;
    
    // Boss can target player OR nearest clone (whichever is closer)
    let bossTargetX = player.x;
    let bossTargetY = player.y;
    let distToPlayer = Math.hypot(player.x - boss.x, player.y - boss.y);
    let bossTargetIsClone = false;
    
    // Check if any clone is closer than player
    if (typeof playerClones !== 'undefined' && playerClones.length > 0) {
        for (const clone of playerClones) {
            if (!clone || clone.hp <= 0 || clone.spawnAnimation > 0) continue;
            
            const cloneDist = Math.hypot(clone.x - boss.x, clone.y - boss.y);
            if (cloneDist < distToPlayer) {
                distToPlayer = cloneDist;
                bossTargetX = clone.x;
                bossTargetY = clone.y;
                bossTargetIsClone = true;
            }
        }
    }
    
    const angleToPlayer = Math.atan2(bossTargetY - boss.y, bossTargetX - boss.x);
    
    // === SLEEP STATE HANDLING ===
    if (boss.isSleeping) {
        // Boss is dormant - only wake up after taking enough damage
        // Visual: slow pulse, darker appearance
        boss.angle += boss.rotationSpeed * 0.1 * dt; // Very slow rotation while sleeping
        
        // Check if accumulated damage exceeds threshold
        if (boss.accumulatedDamage >= boss.sleepDamageThreshold) {
            // Wake up! Start dramatic awakening sequence
            boss.isSleeping = false;
            boss.awakeningPhase = 1; // Start awakening animation
            boss.awakeningTimer = BOSS_CONFIG.awakeningDuration || 180;
            
            // Dramatic awakening effects
            screenShake = 40;
            addFloatText('AWAKENING', boss.x, boss.y - 120, '#ff0000');
            
            // Massive particle explosion
            for (let i = 0; i < 60; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 8 + Math.random() * 15;
                particles.push({
                    x: boss.x,
                    y: boss.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 80 + Math.random() * 40,
                    color: i % 4 === 0 ? '#ff0000' : (i % 3 === 0 ? '#a855f7' : (i % 2 === 0 ? '#ff6600' : '#ffffff')),
                    size: 6 + Math.random() * 10
                });
            }
            
            // Multiple shockwaves
            for (let w = 0; w < 3; w++) {
                setTimeout(() => {
                    if (boss) {
                        particles.push({
                            x: boss.x,
                            y: boss.y,
                            size: 100 + w * 80,
                            life: 50,
                            color: `rgba(255, ${50 + w * 50}, 0, 0.7)`,
                            type: 'wave'
                        });
                        screenShake = Math.max(screenShake, 25 - w * 5);
                    }
                }, w * 200);
            }
        }
        return; // Don't do anything else while sleeping
    }
    
    // === AWAKENING ANIMATION PHASE ===
    if (boss.awakeningPhase === 1) {
        boss.awakeningTimer -= dt;
        
        // Dramatic shaking and effects during awakening
        const awakeProgress = 1 - (boss.awakeningTimer / (BOSS_CONFIG.awakeningDuration || 180));
        
        // Continuous screen shake, increasing intensity
        screenShake = Math.max(screenShake, 10 + awakeProgress * 20);
        
        // Boss vibrates violently
        boss.x += (Math.random() - 0.5) * awakeProgress * 8;
        boss.y += (Math.random() - 0.5) * awakeProgress * 8;
        
        // Faster rotation as awakening progresses
        boss.angle += boss.rotationSpeed * (1 + awakeProgress * 5) * dt;
        
        // Continuous particle emission
        if (frame % 2 === 0) {
            for (let i = 0; i < 5; i++) {
                const angle = Math.random() * Math.PI * 2;
                particles.push({
                    x: boss.x + Math.cos(angle) * boss.radius * Math.random(),
                    y: boss.y + Math.sin(angle) * boss.radius * Math.random(),
                    vx: Math.cos(angle) * (3 + Math.random() * 5),
                    vy: Math.sin(angle) * (3 + Math.random() * 5),
                    life: 30 + Math.random() * 20,
                    color: Math.random() > 0.5 ? '#ff3333' : '#a855f7',
                    size: 3 + Math.random() * 5
                });
            }
        }
        
        // Eye glow particles (menacing red eyes)
        if (frame % 4 === 0) {
            for (let eye = -1; eye <= 1; eye += 2) {
                particles.push({
                    x: boss.x + eye * boss.radius * 0.3,
                    y: boss.y - boss.radius * 0.1,
                    vx: 0,
                    vy: -2,
                    life: 20,
                    color: '#ff0000',
                    size: 8 + awakeProgress * 6
                });
            }
        }
        
        // Awakening complete - trigger first ultimate!
        if (boss.awakeningTimer <= 0) {
            boss.awakeningPhase = 2; // Move to ultimate phase
            boss.state = 'hover';
            
            // Final explosion
            screenShake = 50;
            addFloatText('OMEGA DESTROYER AWAKENED', boss.x, boss.y - 250, '#ff0000');
            
            for (let i = 0; i < 80; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 10 + Math.random() * 20;
                particles.push({
                    x: boss.x,
                    y: boss.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 100 + Math.random() * 50,
                    color: i % 5 === 0 ? '#ffffff' : (i % 4 === 0 ? '#ff0000' : (i % 3 === 0 ? '#a855f7' : '#ff6600')),
                    size: 8 + Math.random() * 12
                });
            }
            
            // Immediately start ultimate as first attack!
            startBossUltimate();
        }
        return;
    }
    
    // === FIRST ULTIMATE AFTER AWAKENING ===
    if (boss.awakeningPhase === 2) {
        // Wait for ultimate to finish, then transition to normal combat
        if (boss.ultimateState === 'ready' && boss.ultimateCooldown > 0) {
            boss.awakeningPhase = 3; // Fully awake, normal combat
            addFloatText('COMBAT MODE', boss.x, boss.y - 100, '#f97316');
        }
        // Process ultimate
        updateBossUltimate(dt, angleToPlayer, distToPlayer);
        boss.angle += boss.rotationSpeed * dt;
        return;
    }
    
    // === NORMAL COMBAT (awakeningPhase === 3 or undefined for backward compat) ===
    
    // Initialize damage tracking for ultimate trigger
    if (boss.recentDamage === undefined) {
        boss.recentDamage = [];
        boss.escortSpawnTimer = BOSS_CONFIG.escortRespawnDelay;
    }
    
    // Clean up old damage records (outside 5 second window)
    const damageWindow = BOSS_CONFIG.ultimateDamageWindow || 300;
    boss.recentDamage = boss.recentDamage.filter(d => (frame - d.frame) < damageWindow);
    
    // Calculate total recent damage
    const totalRecentDamage = boss.recentDamage.reduce((sum, d) => sum + d.amount, 0);
    
    // Update boss phase based on HP
    if (boss.hp / boss.maxHp <= 0.33 && boss.phase < 3) {
        boss.phase = 3;
        addFloatText('BOSS ENRAGED!', boss.x, boss.y - 100, '#ff0000');
        boss.rotationSpeed = 0.015; // Faster rotation in phase 3
        screenShake = 15;
    } else if (boss.hp / boss.maxHp <= 0.66 && boss.phase < 2) {
        boss.phase = 2;
        addFloatText('BOSS PHASE 2', boss.x, boss.y - 100, '#ff6600');
        boss.rotationSpeed = 0.012; // Medium rotation in phase 2
    }
    
    // Initialize ultimate state if not present
    if (boss.ultimateState === undefined) {
        boss.ultimateState = 'ready';
        boss.ultimateCooldown = BOSS_CONFIG.ultimate.cooldown;
        boss.ultimateCharge = 0;
        boss.ultimateBeamAngle = 0;
        boss.ultimateBeamTimer = 0;
    }
    
    // Initialize HP threshold tracking for ultimate triggers
    if (boss.ultimateHPThresholdsTriggered === undefined) {
        boss.ultimateHPThresholdsTriggered = []; // Track which HP thresholds have triggered
    }
    
    // Check HP-based ultimate triggers (multiple thresholds)
    // Ultimate triggers when boss HP drops below specific percentages
    const hpThresholds = BOSS_CONFIG.ultimateHPThresholds || [0.75, 0.50, 0.25];
    const currentHPPercent = boss.hp / boss.maxHp;
    
    let shouldTriggerHPUltimate = false;
    for (const threshold of hpThresholds) {
        // Check if HP dropped below threshold AND hasn't been triggered yet
        if (currentHPPercent <= threshold && !boss.ultimateHPThresholdsTriggered.includes(threshold)) {
            boss.ultimateHPThresholdsTriggered.push(threshold);
            shouldTriggerHPUltimate = true;
            addFloatText(`⚠ HP ${Math.round(threshold * 100)}% - OMEGA BEAM! ⚠`, boss.x, boss.y - 120, '#ff0000', true);
            break; // Only trigger one threshold at a time
        }
    }
    
    // Check if ultimate should trigger based on HP threshold OR damage threshold
    // Don't trigger ultimate if player is teleporting
    const damageThreshold = BOSS_CONFIG.ultimateDamageThreshold || 1500;
    const canTriggerByDamage = boss.ultimateState === 'ready' && boss.ultimateCooldown <= 0 && totalRecentDamage >= damageThreshold;
    const canTriggerByHP = shouldTriggerHPUltimate && boss.ultimateState === 'ready';
    
    if (!playerIsTeleporting && (canTriggerByHP || canTriggerByDamage)) {
        // HP threshold triggers bypass cooldown for more dramatic effect
        if (canTriggerByHP) {
            boss.ultimateCooldown = 0; // Reset cooldown for HP triggers
        }
        startBossUltimate();
        boss.recentDamage = []; // Clear damage tracker after triggering
    }
    
    // Initialize sequential turret system if not present
    if (boss.activeTurretIndex === undefined) {
        boss.activeTurretIndex = 0;
        boss.turretEnergy = BOSS_CONFIG.turretEnergy;
        boss.turretMaxEnergy = BOSS_CONFIG.turretEnergy;
        boss.turretSwitchCooldown = 0;
        boss.turretFireCooldown = 0;
    }
    
    // OMEGA BEAM ULTIMATE SYSTEM (pause if player teleporting)
    if (!playerIsTeleporting) {
        updateBossUltimate(dt, angleToPlayer, distToPlayer);
    }
    
    // If charging or firing ultimate, skip normal behavior but apply area damage
    if (boss.ultimateState === 'charging' || boss.ultimateState === 'firing') {
        // Apply area damage during ultimate (only if player not teleporting)
        const areaRange = BOSS_CONFIG.ultimateAreaRange || 350;
        const areaDamage = BOSS_CONFIG.ultimateAreaDamage || 8;
        if (!playerIsTeleporting && distToPlayer < areaRange && frame % 60 === 0) {
            if (player.shieldTime <= 0 && player.spawnWarmup <= 0) {
                takeDamage(areaDamage);
                addFloatText('OMEGA BURN', player.x, player.y - 30, '#ff6600');
            }
        }
        // Boss body still rotates slowly
        boss.angle += boss.rotationSpeed * 0.3 * dt;
        return;
    }
    
    // Boss body rotation (continuous spin)
    boss.angle += boss.rotationSpeed * dt;
    if (boss.angle > Math.PI * 2) boss.angle -= Math.PI * 2;
    
    // === HEADBUTT ATTACK - When player is too close ===
    if (!playerIsTeleporting) {
        // Initialize headbutt cooldown if not present
        if (boss.headbuttCooldown === undefined) boss.headbuttCooldown = 0;
        if (boss.headbuttCooldown > 0) boss.headbuttCooldown -= dt;
        
        const headbuttRange = BOSS_CONFIG.headbuttRange || 120;
        
        // Check if player is within headbutt range
        if (distToPlayer < boss.radius + headbuttRange && boss.headbuttCooldown <= 0) {
            // Execute headbutt with dramatic knockback animation!
            const knockbackForce = BOSS_CONFIG.headbuttKnockback || 400;
            const stunDuration = BOSS_CONFIG.headbuttStunDuration || 120;
            const headbuttDamage = BOSS_CONFIG.headbuttDamage || 50;
            
            // Calculate knockback direction (away from boss)
            const knockbackAngle = Math.atan2(player.y - boss.y, player.x - boss.x);
            
            // Initialize knockback animation state for dramatic bounce effect
            player.knockbackActive = true;
            player.knockbackTime = 45; // Duration of knockback animation (0.75s)
            player.knockbackAngle = knockbackAngle;
            player.knockbackForce = knockbackForce;
            player.knockbackPhase = 0; // 0=launch, 1=peak, 2=land
            player.knockbackStartX = player.x;
            player.knockbackStartY = player.y;
            
            // Calculate initial knockback target
            let targetX = player.x + Math.cos(knockbackAngle) * knockbackForce * 0.8;
            let targetY = player.y + Math.sin(knockbackAngle) * knockbackForce * 0.8;
            
            // Clamp target to river boundary to prevent going out of map
            const riverBoundary = typeof RIVER_BOUNDARY !== 'undefined' ? RIVER_BOUNDARY : 120;
            targetX = Math.max(riverBoundary, Math.min(WORLD_W - riverBoundary, targetX));
            targetY = Math.max(riverBoundary, Math.min(WORLD_H - riverBoundary, targetY));
            
            // Check for wall/crate collisions along knockback path and stop at collision point
            // Use ray-casting to find first obstacle hit
            const playerRadius = player.radius || 22;
            const knockbackDist = Math.hypot(targetX - player.x, targetY - player.y);
            const steps = Math.ceil(knockbackDist / 10); // Check every 10 pixels
            
            let finalTargetX = targetX;
            let finalTargetY = targetY;
            let hitObstacle = false;
            
            for (let s = 1; s <= steps && !hitObstacle; s++) {
                const t = s / steps;
                const checkX = player.x + (targetX - player.x) * t;
                const checkY = player.y + (targetY - player.y) * t;
                
                // Check walls
                for (const wall of walls) {
                    if (wall.hp <= 0) continue;
                    const closestX = Math.max(wall.x, Math.min(wall.x + wall.w, checkX));
                    const closestY = Math.max(wall.y, Math.min(wall.y + wall.h, checkY));
                    const distToWall = Math.hypot(checkX - closestX, checkY - closestY);
                    
                    if (distToWall < playerRadius + 5) {
                        // Stop just before wall with padding
                        const prevT = (s - 1) / steps;
                        finalTargetX = player.x + (targetX - player.x) * prevT;
                        finalTargetY = player.y + (targetY - player.y) * prevT;
                        hitObstacle = true;
                        break;
                    }
                }
                
                // Check crates
                if (!hitObstacle) {
                    for (const crate of crates) {
                        if (crate.hp <= 0) continue;
                        const closestX = Math.max(crate.x, Math.min(crate.x + crate.w, checkX));
                        const closestY = Math.max(crate.y, Math.min(crate.y + crate.h, checkY));
                        const distToCrate = Math.hypot(checkX - closestX, checkY - closestY);
                        
                        if (distToCrate < playerRadius + 5) {
                            const prevT = (s - 1) / steps;
                            finalTargetX = player.x + (targetX - player.x) * prevT;
                            finalTargetY = player.y + (targetY - player.y) * prevT;
                            hitObstacle = true;
                            break;
                        }
                    }
                }
            }
            
            // Apply final safe knockback target
            player.knockbackTargetX = finalTargetX;
            player.knockbackTargetY = finalTargetY;
            
            // Apply stun effect (crushed) using existing stun system
            player.stunned = stunDuration;
            
            // Deal damage
            if (player.shieldTime <= 0) {
                takeDamage(headbuttDamage);
            }
            
            // Set cooldown
            boss.headbuttCooldown = BOSS_CONFIG.headbuttCooldown || 300;
            
            // Visual effects - dramatic screen shake
            screenShake = 35;
            addFloatText('CRUSHED!', player.x, player.y - 50, '#ff0000');
            
            // Dramatic impact flash
            player.knockbackFlash = 15;
            
            // Impact particles - explosion at hit point
            for (let i = 0; i < 40; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 8 + Math.random() * 15;
                particles.push({
                    x: player.x,
                    y: player.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 35 + Math.random() * 25,
                    color: i % 4 === 0 ? '#ffffff' : (i % 3 === 0 ? '#ff0000' : (i % 2 === 0 ? '#ff6600' : '#ffcc00')),
                    size: 5 + Math.random() * 8
                });
            }
            
            // Directional debris in knockback direction
            for (let i = 0; i < 15; i++) {
                const spreadAngle = knockbackAngle + (Math.random() - 0.5) * 0.8;
                const speed = 10 + Math.random() * 20;
                particles.push({
                    x: player.x,
                    y: player.y,
                    vx: Math.cos(spreadAngle) * speed,
                    vy: Math.sin(spreadAngle) * speed,
                    life: 40 + Math.random() * 30,
                    color: '#ffaa00',
                    size: 3 + Math.random() * 5,
                    gravity: 0.3
                });
            }
            
            // Shockwave at impact point - multiple expanding rings
            for (let ring = 0; ring < 3; ring++) {
                setTimeout(() => {
                    if (player) {
                        particles.push({
                            x: player.knockbackStartX || player.x,
                            y: player.knockbackStartY || player.y,
                            size: 60 + ring * 30,
                            life: 25,
                            color: ring === 0 ? 'rgba(255, 100, 0, 0.7)' : (ring === 1 ? 'rgba(255, 50, 0, 0.5)' : 'rgba(200, 0, 0, 0.3)'),
                            type: 'wave'
                        });
                    }
                }, ring * 50);
            }
            
            // Apply CURSED BURNED from headbutt - eternal dark flame
            // ONLY when boss is fully awake (awakeningPhase >= 3)
            if (boss.awakeningPhase >= 3 && !player.cursedBurned) {
                player.cursedBurned = true;
                player.cursedBurnedEntrance = 60; // Reset entrance animation
                addFloatText('CURSED BURNED!', player.x, player.y - 80, '#4a0080');
            }
        }
    }
    
    // === DARK FIRE AURA - Eternal cursed flame ring protecting boss ===
    // Check if player enters dark fire aura
    // ONLY active when boss is fully awake (awakeningPhase >= 3) AND aura spawn animation complete
    const darkFireRadius = BOSS_CONFIG.darkFireAuraRadius || 140;
    const bossFullyAwake = boss.awakeningPhase >= 3;
    // Aura must be fully spawned (animation complete) before it can deal damage
    const auraFullySpawned = boss.auraAnimationProgress === undefined || boss.auraAnimationProgress >= 1;
    if (bossFullyAwake && auraFullySpawned && !playerIsTeleporting && distToPlayer < boss.radius + darkFireRadius) {
        // Player is inside the dark fire aura (only when fully formed)
        if (player.shieldTime <= 0) {
            // Apply cursed burned if not already affected
            if (!player.cursedBurned) {
                player.cursedBurned = true;
                player.cursedBurnedEntrance = 60; // Trigger entrance animation
                screenShake = 10;
                addFloatText('CURSED BURNED!', player.x, player.y - 50, '#4a0080');
                
                // Dark flame touch particles
                for (let i = 0; i < 20; i++) {
                    particles.push({
                        x: player.x + (Math.random() - 0.5) * 40,
                        y: player.y + (Math.random() - 0.5) * 40,
                        vx: (Math.random() - 0.5) * 6,
                        vy: -Math.random() * 8 - 2,
                        life: 40,
                        color: i % 3 === 0 ? '#4a0080' : (i % 2 === 0 ? '#8b00ff' : '#1a0030'),
                        size: 4 + Math.random() * 5
                    });
                }
            }
        }
    }
    
    // Generate dark fire aura particles around boss (always active when awake)
    if (boss.awakeningPhase >= 3 || boss.awakeningPhase === undefined) {
        const particleRate = BOSS_CONFIG.darkFireAuraParticleRate || 8;
        for (let i = 0; i < particleRate; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = boss.radius + Math.random() * darkFireRadius * 0.8;
            particles.push({
                x: boss.x + Math.cos(angle) * dist,
                y: boss.y + Math.sin(angle) * dist,
                vx: Math.cos(angle + Math.PI/2) * 1.5 + (Math.random() - 0.5) * 2,
                vy: -Math.random() * 4 - 2, // Rise upward
                life: 30 + Math.random() * 20,
                color: Math.random() < 0.3 ? '#8b00ff' : (Math.random() < 0.5 ? '#4a0080' : '#1a0030'),
                size: 4 + Math.random() * 6,
                darkFlame: true // Special marker for render
            });
        }
    }
    
    // Turret switching is handled in updateBossSequentialTurret based on energy only
    // No smart turret selection - turrets only switch when current one's energy is depleted
    
    // Update turret active states for rendering
    boss.turrets.forEach((turret, index) => {
        turret.isActive = (index === boss.activeTurretIndex && boss.turretSwitchCooldown <= 0);
    });
    
    // SEQUENTIAL TURRET FIRING SYSTEM - only when in attack range and player not teleporting
    const attackRange = BOSS_CONFIG.attackRange || 500;
    if (!playerIsTeleporting && distToPlayer <= attackRange) {
        updateBossSequentialTurret(dt, angleToPlayer);
    }
    
    // Smart AI movement with obstacle detection and destruction
    updateBossSmartMovement(dt, distToPlayer, angleToPlayer);
    
    // Spawn escort guards from boss
    updateBossEscortSpawn(dt);
}

// Smart turret selection - select turret closest to player direction
// DEPRECATED: Smart turret selection removed - turrets now only switch when energy depletes
// This ensures consistent turret behavior where each turret fully depletes before switching
// The active turret becomes the "face" of the boss and always aims at the player
// function updateBossSmartTurretSelection() { ... }

// Normalize angle to -PI to PI range
function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

// Smart AI movement - intelligent pathfinding with obstacle destruction
function updateBossSmartMovement(dt, distToPlayer, angleToPlayer) {
    if (!boss) return;
    
    const attackRange = BOSS_CONFIG.attackRange || 500;
    const moveSpeed = BOSS_CONFIG.speed * dt;
    const destructionRange = BOSS_CONFIG.obstacleDestructionRange || 200;
    
    // Check for obstacles in path and destroy them
    destroyObstaclesInPath(angleToPlayer, destructionRange);
    
    // Boss movement based on state with high intelligence
    if (boss.state === 'hover') {
        // Intelligent positioning - stay at optimal attack range
        const idealDistance = attackRange * 0.8; // Stay at 80% of attack range
        const distError = distToPlayer - idealDistance;
        
        // Predictive movement - anticipate player direction
        const playerVelMag = Math.hypot(player.vx || 0, player.vy || 0);
        let predictedX = player.x;
        let predictedY = player.y;
        if (playerVelMag > 0.5) {
            predictedX += (player.vx || 0) * 30; // Predict 0.5 seconds ahead
            predictedY += (player.vy || 0) * 30;
        }
        const angleToPredicted = Math.atan2(predictedY - boss.y, predictedX - boss.x);
        
        if (Math.abs(distError) > 80) {
            // Move toward or away to maintain ideal distance
            if (distError > 0) {
                // Too far, move closer with prediction
                boss.x += Math.cos(angleToPredicted) * moveSpeed * 1.2;
                boss.y += Math.sin(angleToPredicted) * moveSpeed * 1.2;
            } else {
                // Too close, back away
                boss.x -= Math.cos(angleToPlayer) * moveSpeed * 1.8;
                boss.y -= Math.sin(angleToPlayer) * moveSpeed * 1.8;
            }
        } else {
            // At optimal range - intelligent strafing with direction changes
            const strafeDir = (Math.sin(frame * 0.01) > 0) ? 1 : -1;
            const strafeAngle = angleToPlayer + (Math.PI / 2) * strafeDir;
            boss.x += Math.cos(strafeAngle) * moveSpeed * 0.9;
            boss.y += Math.sin(strafeAngle) * moveSpeed * 0.9;
        }
        
        // State transitions
        if (boss.timer <= 0) {
            const rand = Math.random();
            if (rand < 0.25 && distToPlayer < attackRange) {
                boss.state = 'charge';
                boss.timer = 90;
            } else {
                boss.state = 'hover';
                boss.timer = 100 + Math.random() * 60;
            }
        }
        
    } else if (boss.state === 'charge') {
        // Intelligent charge - predict player movement
        const chargeSpeed = 6.0 * dt;
        const predictedAngle = Math.atan2(
            player.y + (player.vy || 0) * 15 - boss.y,
            player.x + (player.vx || 0) * 15 - boss.x
        );
        
        boss.x += Math.cos(predictedAngle) * chargeSpeed;
        boss.y += Math.sin(predictedAngle) * chargeSpeed;
        
        // Dramatic charge particles
        if (frame % 2 === 0) {
            createParticle(boss.x + (Math.random() - 0.5) * 120, boss.y + (Math.random() - 0.5) * 120, '#a855f7', 4);
            createParticle(boss.x + (Math.random() - 0.5) * 80, boss.y + (Math.random() - 0.5) * 80, '#ff00ff', 3);
        }
        
        // Destroy obstacles during charge
        destroyObstaclesInPath(predictedAngle, boss.radius + 50);
        
        // Collision with player
        if (distToPlayer < boss.radius + player.radius) {
            if (player.shieldTime <= 0 && player.spawnWarmup <= 0) {
                const chargeDamage = 60 * (BOSS_CONFIG.damageMultiplier || 2.5) * 0.5;
                takeDamage(chargeDamage);
                addFloatText('CRUSHED!', player.x, player.y, '#ff0000');
                player.energy = Math.max(0, player.energy - 40);
            } else {
                addFloatText('BLOCKED', player.x, player.y, 'cyan');
            }
            screenShake = 25;
            boss.state = 'hover';
            boss.timer = 100;
        }
        
        if (boss.timer <= 0) {
            boss.state = 'hover';
            boss.timer = 120;
        }
    }
    
    // Keep boss within world bounds (respecting river boundary)
    const riverBoundary = typeof RIVER_BOUNDARY !== 'undefined' ? RIVER_BOUNDARY : 120;
    const bossMinBound = riverBoundary + boss.radius;
    const bossMaxBoundX = WORLD_W - riverBoundary - boss.radius;
    const bossMaxBoundY = WORLD_H - riverBoundary - boss.radius;
    boss.x = Math.max(bossMinBound, Math.min(bossMaxBoundX, boss.x));
    boss.y = Math.max(bossMinBound, Math.min(bossMaxBoundY, boss.y));
}

// Destroy walls and crates in boss path
function destroyObstaclesInPath(angle, range) {
    if (!boss) return;
    
    const checkX = boss.x + Math.cos(angle) * range;
    const checkY = boss.y + Math.sin(angle) * range;
    
    // Destroy walls in path (only destructible ones)
    for (let i = walls.length - 1; i >= 0; i--) {
        const wall = walls[i];
        if (wall.indestructible) continue;
        
        // Check if wall is in path
        const wallCenterX = wall.x + wall.w / 2;
        const wallCenterY = wall.y + wall.h / 2;
        const distToWall = Math.hypot(wallCenterX - boss.x, wallCenterY - boss.y);
        
        if (distToWall < range + Math.max(wall.w, wall.h) / 2) {
            // Destroy wall with dramatic effect
            for (let j = 0; j < 15; j++) {
                particles.push({
                    x: wallCenterX + (Math.random() - 0.5) * wall.w,
                    y: wallCenterY + (Math.random() - 0.5) * wall.h,
                    vx: (Math.random() - 0.5) * 8,
                    vy: (Math.random() - 0.5) * 8,
                    life: 40,
                    color: '#666666',
                    size: 4 + Math.random() * 6
                });
            }
            walls.splice(i, 1);
            screenShake = Math.max(screenShake, 8);
        }
    }
    
    // Destroy crates in path
    for (let i = crates.length - 1; i >= 0; i--) {
        const crate = crates[i];
        const crateCenterX = crate.x + crate.w / 2;
        const crateCenterY = crate.y + crate.h / 2;
        const distToCrate = Math.hypot(crateCenterX - boss.x, crateCenterY - boss.y);
        
        if (distToCrate < range + Math.max(crate.w, crate.h) / 2) {
            destroyCrate(crate, i);
        }
    }
}

// Spawn escort guards from inside boss
function updateBossEscortSpawn(dt) {
    if (!boss || !BOSS_CONFIG.escortSpawnFromBoss) return;
    
    // Enforce total enemy limit when boss is active
    // Mark excess non-escort enemies for teleportation removal (don't kill instantly)
    const maxTotalEnemies = BOSS_CONFIG.escortMaxCount || 5;
    if (enemies.length > maxTotalEnemies) {
        // Only start removing enemies after boss is fully awakened (phase 3)
        // This prevents enemies from dying during boss awakening animation
        if (boss.awakeningPhase !== undefined && boss.awakeningPhase < 3) {
            return; // Wait until boss fully awakens before culling enemies
        }
        
        // Remove non-escort enemies first (oldest ones) with teleport fade effect
        const nonEscorts = enemies.filter(e => !e.bossEscort && !e.teleportFadeOut);
        const excessCount = enemies.length - maxTotalEnemies;
        
        for (let i = 0; i < Math.min(excessCount, nonEscorts.length); i++) {
            const enemy = nonEscorts[i];
            if (enemy) {
                // Mark enemy for teleport fade-out instead of instant death
                // This gives a visual cue that enemies are being "recalled" by the boss
                enemy.teleportFadeOut = 60; // 1 second fade
                enemy.teleportFadeStart = 60;
                
                // Show visual feedback
                addFloatText('RECALLED', enemy.x, enemy.y - 30, '#a855f7');
                
                // Initial teleport particles
                for (let p = 0; p < 12; p++) {
                    const angle = Math.random() * Math.PI * 2;
                    particles.push({
                        x: enemy.x,
                        y: enemy.y,
                        vx: Math.cos(angle) * (1 + Math.random() * 2),
                        vy: Math.sin(angle) * (1 + Math.random() * 2),
                        life: 40,
                        color: '#a855f7',
                        size: 3 + Math.random() * 3
                    });
                }
            }
        }
    }
    
    // Update teleport fade-out for marked enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (e.teleportFadeOut && e.teleportFadeOut > 0) {
            e.teleportFadeOut -= dt;
            
            // Disable enemy actions during fade-out
            e.vx = 0;
            e.vy = 0;
            e.fireDelay = 999;
            
            // Teleport swirl particles
            if (frame % 4 === 0) {
                const angle = (frame * 0.1) + (i * Math.PI / 3);
                particles.push({
                    x: e.x + Math.cos(angle) * 25,
                    y: e.y + Math.sin(angle) * 25,
                    vx: -Math.cos(angle) * 2,
                    vy: -Math.sin(angle) * 2,
                    life: 20,
                    color: '#a855f7',
                    size: 2 + Math.random() * 2
                });
            }
            
            // Remove when fade complete
            if (e.teleportFadeOut <= 0) {
                // Final teleport burst
                for (let p = 0; p < 15; p++) {
                    const angle = Math.random() * Math.PI * 2;
                    particles.push({
                        x: e.x,
                        y: e.y,
                        vx: Math.cos(angle) * (3 + Math.random() * 4),
                        vy: Math.sin(angle) * (3 + Math.random() * 4),
                        life: 35,
                        color: Math.random() > 0.5 ? '#a855f7' : '#9333ea',
                        size: 4 + Math.random() * 3
                    });
                }
                // In DEMO mode, don't remove enemies - they respawn via checkDemoRespawns()
                if (typeof demoActive === 'undefined' || !demoActive) {
                    enemies.splice(i, 1);
                } else {
                    e.hp = 0; // Mark as dead for demo respawn system
                    e.teleportFadeOut = 0; // Clear fade flag
                }
                continue;
            }
        }
    }
    
    boss.escortSpawnTimer -= dt;
    
    if (boss.escortSpawnTimer <= 0) {
        // Count current boss escorts - limit to maxEscorts
        const currentEscorts = enemies.filter(e => e.bossEscort).length;
        const maxEscorts = BOSS_CONFIG.escortMaxCount || 5;
        
        // Only spawn if we have room (total enemies < 5)
        const availableSlots = maxTotalEnemies - enemies.length;
        
        if (currentEscorts < maxEscorts && availableSlots > 0) {
            const spawnCount = Math.min(BOSS_CONFIG.escortSpawnCount || 3, maxEscorts - currentEscorts, availableSlots);
            
            for (let i = 0; i < spawnCount; i++) {
                // Spawn from inside boss with outward movement
                const spawnAngle = (Math.PI * 2 / spawnCount) * i + boss.angle;
                const spawnX = boss.x + Math.cos(spawnAngle) * (boss.radius * 0.3);
                const spawnY = boss.y + Math.sin(spawnAngle) * (boss.radius * 0.3);
                
                // Create escort enemy - ALWAYS highest tier during boss fight
                // This ensures boss escorts are formidable elite guards
                const escortTier = FINAL_ENEMY_TIER; // Always tier 7 (Electric elemental)
                const tierData = ENEMY_TIERS[escortTier];
                
                // Derive turret color from weapon for consistent visuals
                const enemyAccent = typeof deriveTurretColor === 'function' 
                    ? deriveTurretColor(tierData.weapon, tierData.accent) 
                    : tierData.accent || '#a855f7';
                
                const escort = {
                    x: spawnX,
                    y: spawnY,
                    radius: 25, // Standard enemy radius
                    hp: tierData.hp * 0.7,
                    maxHp: tierData.hp * 0.7,
                    vx: Math.cos(spawnAngle) * 3, // Outward velocity
                    vy: Math.sin(spawnAngle) * 3,
                    id: tierData.id,
                    tierId: escortTier,
                    angle: spawnAngle,
                    turretAngle: spawnAngle,
                    cooldown: tierData.cd,
                    maxCooldown: tierData.cd,
                    err: tierData.err,
                    speed: tierData.speed * 1.2,
                    baseSpeed: tierData.speed,
                    score: Math.floor(tierData.score * 0.5),
                    // Weapon and visual properties
                    weapon: tierData.weapon,
                    color: tierData.color,
                    accent: enemyAccent,
                    hitFlash: 0,
                    // Magical properties from tier 7 (Electric elemental)
                    magical: tierData.magical || false,
                    magicType: tierData.magicType,
                    element: tierData.element,
                    // AI properties
                    aimSpeed: tierData.aimSpeed || 0.18,
                    intelligence: tierData.intelligence || 6,
                    // Spawn animation
                    spawnWarmup: 30, // Quick spawn
                    spawnWarmupMax: 30,
                    // Boss escort flags
                    bossEscort: true,
                    isFinalEscort: true, // Mark as final wave escort for proper handling
                    guardPoint: { x: boss.x, y: boss.y },
                    patrolPoint: { x: boss.x, y: boss.y },
                    patrolCooldown: 0,
                    // Visual properties
                    seed: Math.random(),
                    lastTrackAngle: 0,
                    wheelRotation: 0,
                    turretRecoilOffsetX: 0,
                    turretRecoilOffsetY: 0,
                    turretRecoilDecay: 0.70,
                    recoilRecoveryTime: 0,
                    stuckTimer: 0,
                    home: { x: spawnX, y: spawnY },
                    queueHangTime: 0,
                    waveSpawned: currentWave,
                    damageMult: 1.0
                };
                
                enemies.push(escort);
                
                // Spawn particles from boss
                for (let p = 0; p < 8; p++) {
                    particles.push({
                        x: spawnX,
                        y: spawnY,
                        vx: Math.cos(spawnAngle) * (2 + Math.random() * 3),
                        vy: Math.sin(spawnAngle) * (2 + Math.random() * 3),
                        life: 30,
                        color: '#a855f7',
                        size: 3 + Math.random() * 4
                    });
                }
            }
            
            addFloatText('ESCORTS DEPLOYED', boss.x, boss.y - 140, '#a855f7');
        }
        
        boss.escortSpawnTimer = BOSS_CONFIG.escortRespawnDelay || 420;
    }
}

// Sequential turret system - only one turret fires at a time until energy depleted
// Each turret has its own energy that recharges when inactive
function updateBossSequentialTurret(dt, angleToPlayer) {
    if (!boss || !boss.turrets) return;
    
    // MINIMUM FIRING DISTANCE: Boss must be at least 150 units away to shoot
    const BOSS_MINIMUM_FIRING_DISTANCE = 150;
    const distToPlayer = Math.hypot(boss.x - player.x, boss.y - player.y);
    if (distToPlayer < BOSS_MINIMUM_FIRING_DISTANCE) return; // Too close to fire
    
    // Recharge inactive turrets' energy AND reset their angle to default
    for (let i = 0; i < boss.turrets.length; i++) {
        const turret = boss.turrets[i];
        if (i !== boss.activeTurretIndex) {
            // Recharge energy for inactive turrets
            if (turret.energy < turret.maxEnergy) {
                turret.energy = Math.min(turret.maxEnergy, turret.energy + turret.rechargeRate * dt);
                turret.isRecharging = true;
            } else {
                turret.isRecharging = false;
            }
            
            // Reset inactive turret angle to forward position (points outward from boss center)
            // World angle where this turret position is on the boss body
            const defaultWorldAngle = boss.angle + turret.angleOffset;
            let resetDiff = defaultWorldAngle - turret.turretAngle;
            while (resetDiff > Math.PI) resetDiff -= Math.PI * 2;
            while (resetDiff < -Math.PI) resetDiff += Math.PI * 2;
            // Slowly rotate back to default position (pointing outward)
            if (Math.abs(resetDiff) > 0.02) {
                turret.turretAngle += Math.sign(resetDiff) * Math.min(Math.abs(resetDiff), 0.03);
            }
        }
    }
    
    // Handle turret switch cooldown - CRITICAL: No firing during switch
    if (boss.turretSwitchCooldown > 0) {
        boss.turretSwitchCooldown -= dt;
        return; // Can't fire during switch cooldown
    }
    
    // Handle fire cooldown
    if (boss.turretFireCooldown > 0) {
        boss.turretFireCooldown -= dt;
    }
    
    const activeTurret = boss.turrets[boss.activeTurretIndex];
    const turretConfig = BOSS_CONFIG.turrets[boss.activeTurretIndex];
    if (!activeTurret || !turretConfig) return;
    
    // CRITICAL: Only fire if turret is marked active
    if (!activeTurret.isActive) return;
    
    // --- SMOOTH TURRET ROTATION TO FACE PLAYER ---
    // Calculate target angle for the active turret barrel
    const turretWorldAngle = boss.angle + activeTurret.angleOffset;
    const turretDist = boss.radius - 25;
    const turretX = boss.x + Math.cos(turretWorldAngle) * turretDist;
    const turretY = boss.y + Math.sin(turretWorldAngle) * turretDist;
    const targetAimAngle = Math.atan2(player.y - turretY, player.x - turretX);
    
    // Store target angle for smooth rotation
    activeTurret.targetTurretAngle = targetAimAngle;
    
    // IMPROVED: Smooth rotation of turret barrel toward target with NO snapping
    let turretAngleDiff = targetAimAngle - activeTurret.turretAngle;
    while (turretAngleDiff > Math.PI) turretAngleDiff -= Math.PI * 2;
    while (turretAngleDiff < -Math.PI) turretAngleDiff += Math.PI * 2;
    
    // Max rotation speed based on boss phase (faster in higher phases)
    const maxTurretRotSpeed = 0.06 * boss.phase; // Max radians per frame
    // Always use smooth rotation, never snap
    const turretRotAmount = Math.sign(turretAngleDiff) * Math.min(Math.abs(turretAngleDiff), maxTurretRotSpeed);
    activeTurret.turretAngle += turretRotAmount;
    
    // --- BOSS BODY ROTATION TO FACE PLAYER WITH ACTIVE TURRET ---
    // The boss rotates its entire body so the active turret faces the player
    // This makes the active turret effectively the "face" of the boss
    const targetBossAngle = angleToPlayer - turretConfig.angleOffset;
    
    // IMPROVED: Smooth rotation towards target - always use interpolation, never snap
    let angleDiff = targetBossAngle - boss.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    
    // Max rotation speed scales with boss phase (faster tracking in higher phases)
    const maxBossRotSpeed = 0.04 * boss.phase; // Max radians per frame
    // Always smooth rotation, no snapping threshold
    const bossRotAmount = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxBossRotSpeed);
    boss.angle += bossRotAmount;
    
    // Check if active turret's energy depleted - switch to NEXT turret in sequence
    // Pattern: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 1 (sequential cycling)
    if (activeTurret.energy <= 0) {
        const previousIndex = boss.activeTurretIndex;
        const turretCount = boss.turrets.length;
        
        // Try to find next turret in sequence with enough energy
        let nextIndex = -1;
        let checkedCount = 0;
        let searchIndex = (previousIndex + 1) % turretCount;
        
        // Search sequentially starting from next turret
        while (checkedCount < turretCount - 1) {
            if (boss.turrets[searchIndex].energy >= 10) {
                // Found next turret with enough energy
                nextIndex = searchIndex;
                break;
            }
            searchIndex = (searchIndex + 1) % turretCount;
            checkedCount++;
        }
        
        // If no turret has enough energy, wait for recharge
        if (nextIndex === -1) {
            // All turrets low on energy - set short cooldown and wait
            boss.turretSwitchCooldown = 30; // Short wait for recharge
            return;
        }
        
        // Switch to next sequential turret
        boss.activeTurretIndex = nextIndex;
        boss.turretSwitchCooldown = turretConfig.switchCooldown / boss.phase;
        boss.turretFireCooldown = 0;
        
        // Update active states - deactivate previous, activate new
        boss.turrets[previousIndex].isActive = false;
        boss.turrets[previousIndex].isRecharging = true;
        boss.turrets[boss.activeTurretIndex].isActive = true;
        boss.turrets[boss.activeTurretIndex].isRecharging = false;
        
        // Announce turret switch with weapon number
        const newTurret = boss.turrets[boss.activeTurretIndex];
        const weaponNumber = boss.activeTurretIndex + 1;
        addFloatText(`${weaponNumber}. ${newTurret.name}`, boss.x, boss.y - 130, newTurret.color);
        
        return;
    }
    
    // Fire the active turret (only when turret is aimed at player)
    const aimError = Math.abs(turretAngleDiff);
    if (boss.turretFireCooldown <= 0 && aimError < 0.3) {
        
        // Pre-calculate recoil direction for ALL shots in this burst
        // This ensures turret aims at final recoil direction BEFORE firing
        const predictX = player.x + (player.vx || 0) * 10;
        const predictY = player.y + (player.vy || 0) * 10;
        const baseAimAngle = Math.atan2(predictY - turretY, predictX - turretX);
        
        // Calculate final recoil angle for this burst (determined BEFORE firing)
        // Higher phases = more accurate (less error) and more aggressive
        const recoilSpread = turretConfig.recoilSpread || 0.15;
        const baseAccuracy = BOSS_CONFIG.accuracy || 0.45;
        // Phase scaling: Phase 1 = base, Phase 2 = +15%, Phase 3 = +30%, Phase 4 = +45%
        const phaseAccuracyBonus = (boss.phase - 1) * 0.15;
        const bossAccuracy = Math.min(0.92, baseAccuracy + phaseAccuracyBonus);
        // Reduce recoil spread in higher phases for tighter accuracy
        const phaseSpreadReduction = 1 - (boss.phase - 1) * 0.2; // 20% less spread per phase
        const effectiveSpread = recoilSpread * Math.max(0.4, phaseSpreadReduction);
        // Pre-calculate the recoil offset that will be used
        const recoilOffset = (Math.random() - 0.5) * effectiveSpread * 2 * (1 - bossAccuracy);
        const finalAimAngle = baseAimAngle + recoilOffset;
        
        // Set turret angle to match where shots will go (BEFORE firing)
        // Store as world angle for bullet calculation, but also update local angle for rendering
        const currentTurretWorldAnglePreFire = boss.angle + activeTurret.angleOffset;
        activeTurret.turretAngle = currentTurretWorldAnglePreFire + (finalAimAngle - currentTurretWorldAnglePreFire);
        
        // Apply kickback effect
        const kickback = turretConfig.kickback || 5;
        activeTurret.kickbackOffset = kickback;
        
        // Get barrel configuration for multi-barrel turrets
        const barrelOffsets = turretConfig.barrelOffsets || null;
        const barrelLength = turretConfig.barrelLength || 28;
        const numBarrels = Array.isArray(barrelOffsets) ? barrelOffsets.length : 1;
        
        // Special handling for shotgun with multi-barrel: fire from ALL barrels simultaneously
        const isShotgunMultiBarrel = turretConfig.weapon === 'shotgun' && barrelOffsets && numBarrels > 1;
        
        // Fire burst shots - all shots follow the pre-calculated recoil direction
        for (let b = 0; b < activeTurret.burst; b++) {
            setTimeout(() => {
                if (!boss) return;
                
                // Small additional spread within burst, but centered on pre-calculated angle
                const burstSpread = (Math.random() - 0.5) * 0.1 * (b + 1);
                const shotAngle = finalAimAngle + burstSpread;
                
                // IMPORTANT: Update turret visual angle to match shot direction
                // turretAngle is world angle, render will subtract turretWorldAngle
                activeTurret.turretAngle = shotAngle;
                
                // Update turret position based on current boss position
                const currentTurretWorldAngle = boss.angle + activeTurret.angleOffset;
                const currentTurretX = boss.x + Math.cos(currentTurretWorldAngle) * turretDist;
                const currentTurretY = boss.y + Math.sin(currentTurretWorldAngle) * turretDist;
                
                // Damage multiplier
                const dmgMult = (BOSS_CONFIG.damageMultiplier || 2.5) * (1.0 + (boss.phase - 1) * 0.2);
                
                // For shotgun with multi-barrel, fire from ALL barrels at once
                if (isShotgunMultiBarrel) {
                    for (let barrelIdx = 0; barrelIdx < numBarrels; barrelIdx++) {
                        const offset = barrelOffsets[barrelIdx];
                        const perpAngle = shotAngle + Math.PI / 2;
                        const bulletSpawnX = currentTurretX + 
                            Math.cos(shotAngle) * barrelLength + 
                            Math.cos(perpAngle) * offset;
                        const bulletSpawnY = currentTurretY + 
                            Math.sin(shotAngle) * barrelLength + 
                            Math.sin(perpAngle) * offset;
                        fireBossTurret(bulletSpawnX, bulletSpawnY, shotAngle, turretConfig.weapon, dmgMult);
                    }
                } else {
                    // Calculate bullet spawn position based on barrel configuration
                    let bulletSpawnX, bulletSpawnY;
                    
                    if (barrelOffsets && numBarrels > 0) {
                        // Multi-barrel turret: cycle through barrels for each shot
                        const barrelIndex = b % numBarrels;
                        const offset = barrelOffsets[barrelIndex];
                        
                        if (typeof offset === 'object') {
                            // Complex barrel offset with x and y (missile_pod style)
                            // x is forward offset, y is perpendicular offset
                            const perpAngle = shotAngle + Math.PI / 2;
                            bulletSpawnX = currentTurretX + 
                                Math.cos(shotAngle) * (offset.x + barrelLength) + 
                                Math.cos(perpAngle) * offset.y;
                            bulletSpawnY = currentTurretY + 
                                Math.sin(shotAngle) * (offset.x + barrelLength) + 
                                Math.sin(perpAngle) * offset.y;
                        } else {
                            // Simple y-offset barrel (gatling, heavy_cannon style)
                            // Offset is perpendicular to shot direction
                            const perpAngle = shotAngle + Math.PI / 2;
                            bulletSpawnX = currentTurretX + 
                                Math.cos(shotAngle) * barrelLength + 
                                Math.cos(perpAngle) * offset;
                            bulletSpawnY = currentTurretY + 
                                Math.sin(shotAngle) * barrelLength + 
                                Math.sin(perpAngle) * offset;
                        }
                    } else {
                        // Single barrel turret: spawn from center
                        bulletSpawnX = currentTurretX + Math.cos(shotAngle) * barrelLength;
                        bulletSpawnY = currentTurretY + Math.sin(shotAngle) * barrelLength;
                    }
                    
                    fireBossTurret(bulletSpawnX, bulletSpawnY, shotAngle, turretConfig.weapon, dmgMult);
                }
                
                // Add small kickback per shot in burst
                if (activeTurret.kickbackOffset < kickback * 1.5) {
                    activeTurret.kickbackOffset += kickback * 0.2;
                }
            }, b * 80);
        }
        
        // Consume energy from active turret and set cooldown
        activeTurret.energy -= turretConfig.energyCost;
        boss.turretFireCooldown = activeTurret.fireInterval / boss.phase;
        
        // Mark turret as recently fired for visual effect
        activeTurret.lastFired = frame;
    }
    
    // Decay kickback over time for ALL turrets (smooth recovery)
    // This ensures turrets that were firing before switch also recover
    for (let i = 0; i < boss.turrets.length; i++) {
        const turret = boss.turrets[i];
        if (turret.kickbackOffset > 0) {
            turret.kickbackOffset *= 0.9; // Gradual recovery
            if (turret.kickbackOffset < 0.5) turret.kickbackOffset = 0;
        }
    }
}

// Helper function to fire boss turret with proper weapon type
function fireBossTurret(x, y, angle, weaponType, damageMultiplier) {
    const weaponStats = resolveWeaponStats(weaponType);
    
    // Determine element based on weapon
    let element = null;
    if (weaponType === 'ice') element = 'ice';
    else if (weaponType === 'fire') element = 'fire';
    else if (weaponType === 'electric') element = 'electric';
    
    // Map weapon to bullet visual type for realistic rendering
    // Boss bullets should look dramatic and distinct per weapon
    const bulletType = weaponStats.type || weaponType;
    
    bullets.push({
        x: x,
        y: y,
        prevX: x,
        prevY: y,
        vx: Math.cos(angle) * weaponStats.speed,
        vy: Math.sin(angle) * weaponStats.speed,
        life: 120,
        color: weaponStats.color,
        dmg: weaponStats.dmg * damageMultiplier,
        isEnemy: true,
        element: element,
        type: bulletType,
        isBoss: true // Flag for extra dramatic effects
    });
    
    captureBossWeaponTelemetry(weaponType, weaponStats);
}

// Start boss ultimate - OMEGA ANNIHILATION
function startBossUltimate() {
    if (!boss) return;
    
    boss.ultimateState = 'charging';
    boss.ultimateCharge = 0;
    boss.state = 'ultimate'; // Override normal state
    
    // Warning to player - positioned higher to avoid overlap with other boss texts
    addFloatText('⚠ OMEGA BEAM CHARGING ⚠', boss.x, boss.y - 220, '#ff0000');
    screenShake = 10;
    
    // Audio cue (if available)
    // playSound('boss_charge');
}

// Update boss ultimate ability
function updateBossUltimate(dt, angleToPlayer) {
    if (!boss) return;
    
    // Update cooldown if not using ultimate
    if (boss.ultimateState === 'ready' && boss.ultimateCooldown > 0) {
        boss.ultimateCooldown -= dt;
    }
    
    // CHARGING PHASE - Energy gathering like Goku's Spirit Bomb
    if (boss.ultimateState === 'charging') {
        boss.ultimateCharge += dt;
        
        // Energy gathering particles
        if (frame % 3 === 0) {
            const particleAngle = Math.random() * Math.PI * 2;
            const particleDist = 150 + Math.random() * 100;
            particles.push({
                x: boss.x + Math.cos(particleAngle) * particleDist,
                y: boss.y + Math.sin(particleAngle) * particleDist,
                vx: -Math.cos(particleAngle) * 4,
                vy: -Math.sin(particleAngle) * 4,
                life: 40,
                color: BOSS_CONFIG.ultimate.chargeColor,
                size: 3 + Math.random() * 4
            });
        }
        
        // Screen shake intensifies as charge progresses
        const chargeProgress = boss.ultimateCharge / BOSS_CONFIG.ultimate.chargeTime;
        if (frame % 10 === 0 && chargeProgress > 0.5) {
            screenShake = Math.max(screenShake, chargeProgress * 8);
        }
        
        // Charging complete - start firing
        if (boss.ultimateCharge >= BOSS_CONFIG.ultimate.chargeTime) {
            boss.ultimateState = 'firing';
            boss.ultimateBeamAngle = 0; // Start at angle 0 for full 360 rotation
            boss.ultimateBeamTimer = BOSS_CONFIG.ultimate.beamDuration;
            boss.ultimateBeamLength = 1500; // Max beam length
            
            // Initialize 7 beam lengths (one per turret)
            boss.ultimateBeamLengths = [];
            for (let i = 0; i < 7; i++) {
                boss.ultimateBeamLengths.push(1500);
            }
            
            addFloatText('OMEGA ANNIHILATION!', boss.x, boss.y - 150, '#ff0000');
            screenShake = 25;
        }
    }
    
    // FIRING PHASE - 7 beams from each turret, rotating 360 degrees together
    if (boss.ultimateState === 'firing') {
        boss.ultimateBeamTimer -= dt;
        
        // Rotate all beams together (360 degree sweep)
        boss.ultimateBeamAngle += BOSS_CONFIG.ultimate.rotationSpeed;
        if (boss.ultimateBeamAngle > Math.PI * 2) {
            boss.ultimateBeamAngle -= Math.PI * 2;
        }
        
        // Process each turret beam (7 beams total)
        const turretConfigs = BOSS_CONFIG.turrets;
        for (let i = 0; i < turretConfigs.length; i++) {
            const turretConfig = turretConfigs[i];
            // Calculate this beam's angle based on turret position + rotation
            const beamAngle = boss.ultimateBeamAngle + turretConfig.angleOffset;
            
            // Calculate turret position on boss body
            const turretDist = boss.radius * 0.7; // Turrets at 70% of boss radius
            const turretX = boss.x + Math.cos(turretConfig.angleOffset) * turretDist;
            const turretY = boss.y + Math.sin(turretConfig.angleOffset) * turretDist;
            
            // Calculate beam length - STOPS at walls/crates but doesn't damage them
            boss.ultimateBeamLengths[i] = calculateBeamLengthNoDamage(turretX, turretY, beamAngle, 1500);
            
            // Check beam collision with player only
            checkBeamDamageToPlayer(
                turretX, turretY,
                beamAngle,
                boss.ultimateBeamLengths[i],
                BOSS_CONFIG.ultimate.beamWidth,
                BOSS_CONFIG.ultimate.damage
            );
            
            // Beam particles for each turret beam
            if (frame % 3 === 0) {
                const beamEndX = turretX + Math.cos(beamAngle) * boss.ultimateBeamLengths[i];
                const beamEndY = turretY + Math.sin(beamAngle) * boss.ultimateBeamLengths[i];
                
                // Particles along beam
                for (let j = 0; j < 3; j++) {
                    const t = Math.random();
                    const px = turretX + (beamEndX - turretX) * t;
                    const py = turretY + (beamEndY - turretY) * t;
                    
                    particles.push({
                        x: px + (Math.random() - 0.5) * 15,
                        y: py + (Math.random() - 0.5) * 15,
                        vx: (Math.random() - 0.5) * 2,
                        vy: (Math.random() - 0.5) * 2,
                        life: 12 + Math.random() * 8,
                        color: turretConfig.color || '#ff0000',
                        size: 2 + Math.random() * 2
                    });
                }
            }
        }
        
        // Continuous screen shake during beam
        screenShake = Math.max(screenShake, 5);
        
        // Beam finished
        if (boss.ultimateBeamTimer <= 0) {
            boss.ultimateState = 'ready';
            boss.ultimateCooldown = BOSS_CONFIG.ultimate.cooldown;
            boss.state = 'hover';
            boss.timer = 60;
            boss.ultimateBeamLengths = []; // Clear beam lengths
        }
    }
}

// Calculate beam length (stops at walls/crates)
function calculateBeamLength(startX, startY, angle, maxLength) {
    const steps = 50; // Check collision at 50 points along the beam
    const stepLength = maxLength / steps;
    
    for (let i = 1; i <= steps; i++) {
        const checkX = startX + Math.cos(angle) * stepLength * i;
        const checkY = startY + Math.sin(angle) * stepLength * i;
        
        // Check collision with walls
        for (const wall of walls) {
            if (checkX >= wall.x && checkX <= wall.x + wall.w &&
                checkY >= wall.y && checkY <= wall.y + wall.h) {
                // Hit wall - return this distance
                return stepLength * i;
            }
        }
        
        // Check collision with crates
        for (const crate of crates) {
            if (checkX >= crate.x && checkX <= crate.x + crate.w &&
                checkY >= crate.y && checkY <= crate.y + crate.h) {
                // Hit crate - damage the crate and return this distance
                crate.hp -= BOSS_CONFIG.ultimate.damage * 0.5;
                if (crate.hp <= 0) {
                    // Crate destroyed by beam
                    const crateIndex = crates.indexOf(crate);
                    if (crateIndex > -1) {
                        destroyCrate(crate, crateIndex);
                    }
                }
                return stepLength * i;
            }
        }
    }
    
    return maxLength;
}

// Calculate beam length that STOPS at walls/crates but does NOT damage them
// This allows walls/crates to act as cover for the player
function calculateBeamLengthNoDamage(startX, startY, angle, maxLength) {
    const steps = 50;
    const stepLength = maxLength / steps;
    
    for (let i = 1; i <= steps; i++) {
        const checkX = startX + Math.cos(angle) * stepLength * i;
        const checkY = startY + Math.sin(angle) * stepLength * i;
        
        // Check collision with walls - STOP but don't damage
        for (const wall of walls) {
            if (checkX >= wall.x && checkX <= wall.x + wall.w &&
                checkY >= wall.y && checkY <= wall.y + wall.h) {
                return stepLength * i; // Stop at wall, no damage
            }
        }
        
        // Check collision with crates - STOP but don't damage
        for (const crate of crates) {
            if (checkX >= crate.x && checkX <= crate.x + crate.w &&
                checkY >= crate.y && checkY <= crate.y + crate.h) {
                return stepLength * i; // Stop at crate, no damage
            }
        }
    }
    
    return maxLength;
}

// Check if beam hits player
function checkBeamDamageToPlayer(startX, startY, angle, length, width, damage) {
    // Calculate perpendicular distance from player to beam line
    const beamDirX = Math.cos(angle);
    const beamDirY = Math.sin(angle);
    
    // Vector from beam start to player
    const toPlayerX = player.x - startX;
    const toPlayerY = player.y - startY;
    
    // Project player position onto beam
    const projectionLength = toPlayerX * beamDirX + toPlayerY * beamDirY;
    
    // Player must be in front of beam (not behind boss)
    if (projectionLength < 0 || projectionLength > length) {
        return; // Player not in beam path
    }
    
    // Calculate closest point on beam to player
    const closestX = startX + beamDirX * projectionLength;
    const closestY = startY + beamDirY * projectionLength;
    
    // Distance from player to closest point on beam
    const distToBeam = Math.hypot(player.x - closestX, player.y - closestY);
    
    // Check if player is within beam width
    if (distToBeam < width + player.radius) {
        // Player hit by beam! Apply 8% of max HP damage per second
        // At 60fps, damage every 5 frames = 12 ticks per second
        // 8% / 12 ticks = 0.667% per tick
        if (frame % 5 === 0) {
            if (player.shieldTime <= 0 && player.spawnWarmup <= 0) {
                // Calculate 8% max HP per second damage (0.667% per tick at 12 ticks/sec)
                const percentDamagePerTick = 0.08 / 12; // 8% per second / 12 ticks
                const beamDamage = Math.max(1, Math.ceil(player.maxHp * percentDamagePerTick));
                takeDamage(beamDamage);
                
                // Push player away from beam
                const pushAngle = Math.atan2(player.y - closestY, player.x - closestX);
                player.x += Math.cos(pushAngle) * 8;
                player.y += Math.sin(pushAngle) * 8;
                
                // Hit particles
                for (let i = 0; i < 5; i++) {
                    particles.push({
                        x: player.x,
                        y: player.y,
                        vx: (Math.random() - 0.5) * 10,
                        vy: (Math.random() - 0.5) * 10,
                        life: 20,
                        color: '#ff0000',
                        size: 4
                    });
                }
            }
        }
    }
}

// Reusable explosion helper spawns mixed particle sets for extra punch.
// Now with proper maxLife tracking for smooth fade-out (no flickering)
function createExplosion(x, y, c) {
    // DRAMATIC EXPLOSION REWORK - More particles, better effects
    // All particles now have maxLife set for smooth alpha fade
    
    // Initial blinding flash - white hot center
    for (let i = 0; i < 18; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 8;
        const life = 15 + Math.random() * 10;
        particles.push({ 
            x, y, 
            vx: Math.cos(angle) * speed, 
            vy: Math.sin(angle) * speed, 
            life: life,
            maxLife: life, // Track for smooth fade
            color: '#ffffff', 
            size: Math.random() * 12 + 8,
            gravity: 0,
            drag: 0.2,
            noScale: true // Prevent shrinking for flash particles
        });
    }
    
    // Secondary flash - yellow/orange core
    for (let i = 0; i < 15; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 4;
        const life = 25 + Math.random() * 15;
        particles.push({ 
            x, y, 
            vx: Math.cos(angle) * speed, 
            vy: Math.sin(angle) * speed, 
            life: life,
            maxLife: life,
            color: '#ffdd00', 
            size: Math.random() * 10 + 6,
            gravity: 0,
            drag: 0.12,
            noScale: true
        });
    }
    
    // Fire ball - expanding flames
    for (let i = 0; i < 35; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 5 + Math.random() * 8;
        const colorIdx = i % 4;
        const colors = ['#ff6600', '#ff4400', '#ff8800', '#f59e0b'];
        const life = 45 + Math.random() * 30;
        particles.push({ 
            x, y, 
            vx: Math.cos(angle) * speed, 
            vy: Math.sin(angle) * speed - 1, 
            life: life,
            maxLife: life,
            color: colors[colorIdx], 
            size: Math.random() * 8 + 4,
            gravity: -0.08,
            drag: 0.05,
            noScale: true
        });
    }
    
    // Thick black smoke plumes - rising dramatically
    for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 3;
        const life = 80 + Math.random() * 40;
        particles.push({ 
            x: x + Math.cos(angle) * (Math.random() * 15), 
            y: y + Math.sin(angle) * (Math.random() * 15), 
            vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 2, 
            vy: Math.sin(angle) * speed - 2 - Math.random() * 2, 
            life: life,
            maxLife: life,
            color: i % 3 === 0 ? '#222222' : (i % 3 === 1 ? '#333333' : '#444444'), 
            size: Math.random() * 14 + 8,
            gravity: -0.04,
            drag: 0.03,
            noScale: true
        });
    }
    
    // Metal debris - tumbling tank fragments
    for (let i = 0; i < 40; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 8 + Math.random() * 14;
        const colorIdx = i % 4;
        const colors = [c, '#888888', '#666666', '#555555'];
        const life = 90 + Math.random() * 40;
        particles.push({ 
            x, y, 
            vx: Math.cos(angle) * speed, 
            vy: Math.sin(angle) * speed - 4, 
            life: life,
            maxLife: life,
            color: colors[colorIdx], 
            size: Math.random() * 6 + 2,
            gravity: 0.18,
            drag: 0.02,
            spin: (Math.random() - 0.5) * 0.3
        });
    }
    
    // Hot sparks - flying embers
    for (let i = 0; i < 25; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 10 + Math.random() * 12;
        const life = 50 + Math.random() * 30;
        particles.push({ 
            x, y, 
            vx: Math.cos(angle) * speed, 
            vy: Math.sin(angle) * speed - 3, 
            life: life,
            maxLife: life,
            color: i % 2 === 0 ? '#ffaa00' : '#ff6600', 
            size: Math.random() * 3 + 1,
            gravity: 0.1,
            drag: 0.01
        });
    }
    
    // Fast shrapnel ring - metal fragments
    for (let i = 0; i < 20; i++) {
        let a = (Math.PI * 2 / 20) * i + (Math.random() - 0.5) * 0.3;
        particles.push({ 
            x, y, 
            vx: Math.cos(a) * 18, 
            vy: Math.sin(a) * 18 - 2, 
            life: 35,
            maxLife: 35,
            color: '#cccccc', 
            size: 2,
            gravity: 0.1,
            drag: 0.02
        });
    }
    
    // Primary shockwave - large orange ring
    particles.push({ 
        x, y, 
        size: 60, 
        life: 30,
        maxLife: 30,
        color: 'rgba(255,100,0,0.7)', 
        type: 'wave' 
    });
    
    // Secondary shockwave - smoke ring (delayed)
    setTimeout(() => {
        particles.push({ 
            x, y, 
            size: 40, 
            life: 40,
            maxLife: 40,
            color: 'rgba(100,100,100,0.4)', 
            type: 'wave' 
        });
    }, 50);
}

// Track first kill of each wave for guaranteed weapon drop
let waveFirstKillTracker = { wave: 0, hadFirstKill: false };

// Loot table mirrors arcade shooters: common energy packs, rarer weapons, and
// legendary streak boosts. Guaranteed drops are used for crates/bosses.
// Higher tier enemies have better drop rates for rare items.
// Progressive weapon system: only spawn weapons slightly better than current weapon
// FIXED: Each weapon type can only drop ONCE - no duplicate weapon pickups on ground
// FEATURE: First kill of each wave guarantees weapon drop if player needs upgrade
function spawnDrop(x, y, guaranteed = false, enemyTier = 0) {
    const currentWave = player.currentWave || 1;
    const currentWeaponRarity = WEAPONS[player.weapon]?.rarity || 1;
    const sequentialTier = typeof getWeaponTier === 'function' ? getWeaponTier(player.weapon) : null;
    const playerTier = sequentialTier !== null ? sequentialTier : currentWeaponRarity;
    
    // Get maximum weapon tier from WEAPON_TIER_ORDER (gauss = tier 12)
    const maxWeaponTier = typeof WEAPON_TIER_ORDER !== 'undefined' ? WEAPON_TIER_ORDER.length : 12;
    
    // Check if player already has max tier weapon - no more weapon upgrades possible
    const playerAtMaxTier = playerTier >= maxWeaponTier;
    
    // === FIRST KILL GUARANTEED WEAPON DROP SYSTEM ===
    // Reset tracker when entering new wave
    if (waveFirstKillTracker.wave !== currentWave) {
        waveFirstKillTracker = { wave: currentWave, hadFirstKill: false };
    }
    
    // Check if this is first kill of wave and player needs weapon upgrade
    // Player needs upgrade if their tier is less than wave's max tier (wave + 1)
    // Example: Wave 1 allows up to tier 2, so player with tier 1 should get upgrade
    const targetTierForWave = currentWave + 1;
    const playerNeedsUpgrade = !playerAtMaxTier && playerTier < targetTierForWave;
    const isFirstKill = !waveFirstKillTracker.hadFirstKill;
    const shouldGuaranteeWeapon = isFirstKill && playerNeedsUpgrade;
    
    // Mark first kill as done
    if (isFirstKill) {
        waveFirstKillTracker.hadFirstKill = true;
    }
    
    // Skip no-drop chance if this is guaranteed or first kill needs weapon
    const noDropChance = Math.max(0.15, 0.35 - (enemyTier * 0.05));
    if (!guaranteed && !shouldGuaranteeWeapon && Math.random() < noDropChance) return;
    
    // FIXED: Track weapons already on ground to prevent duplicates
    // Each weapon type can only exist ONCE as a pickup at any time
    const weaponsOnGround = new Set();
    const rarePowersOnGround = new Set();
    for (const pickup of pickups) {
        if (pickup.type && pickup.type.id) {
            // Track weapons
            if (WEAPONS[pickup.type.id]) {
                weaponsOnGround.add(pickup.type.id);
            }
            // Track rare power items (stealth, lifesteal, turbo, magnet)
            if (pickup.type.isRarePower) {
                rarePowersOnGround.add(pickup.type.id);
            }
        }
    }

    const tierBonus = {
        common: Math.max(0.40, 0.70 - (enemyTier * 0.06)),
        uncommon: Math.max(0.08, 0.12 - (enemyTier * 0.01)),
        rare: Math.min(0.20, 0.05 + (enemyTier * 0.0375)),
        epic: Math.min(0.10, 0.03 + (enemyTier * 0.0175)),
        legendary: Math.min(0.06, 0.02 + (enemyTier * 0.01)),
        mythic: Math.min(0.03, 0.01 + (enemyTier * 0.005))
    };

    const selectFromPool = (pool, fallback) => {
        if (!pool || pool.length === 0) return { ...fallback };
        return { ...pool[Math.floor(Math.random() * pool.length)] };
    };

    const filterPool = (pool) => pool.filter(item => {
        if ((item.minWave ?? 1) > currentWave) return false;
        
        // FIXED: Skip rare power items that already exist on ground (prevent duplicates)
        if (item.isRarePower && rarePowersOnGround.has(item.id)) return false;
        
        // Non-weapon items always pass filter (unless blocked above)
        if (!WEAPONS[item.id]) return true;
        
        // If player at max tier, block ALL weapon drops
        if (playerAtMaxTier) return false;
        
        // Same weapon = skip
        if (item.id === player.weapon) return false;
        
        // FIXED: Skip weapons that already exist on ground (prevent duplicates)
        if (weaponsOnGround.has(item.id)) return false;
        
        // FIXED: Always use tier system for weapon filtering
        // This ensures debug weapons properly block lower tier spawns
        const itemTier = (typeof getWeaponTier === 'function' ? getWeaponTier(item.id) : null) 
            ?? WEAPONS[item.id]?.tier 
            ?? WEAPONS[item.id]?.rarity 
            ?? 1;
        
        // BALANCED WEAPON DISTRIBUTION for waves 1-11:
        // Ensures player can reach tier 12 (gauss) by wave 11 with even progression
        // Maximum tier allowed = wave + 1 (wave 1 → tier 2, wave 11 → tier 12)
        const maxTierForWave = currentWave + 1;
        if (itemTier > maxTierForWave) return false;
        
        // Only allow weapons with tier strictly higher than player's current tier
        // and at most 1 tier above (progressive upgrade system)
        if (itemTier <= playerTier) return false;
        if (itemTier > playerTier + 1) return false;
        return true;
    });

    let rand = Math.random();
    let type;

    const commonThreshold = tierBonus.common;
    const uncommonThreshold = commonThreshold + tierBonus.uncommon;
    const rareThreshold = uncommonThreshold + tierBonus.rare;
    const epicThreshold = rareThreshold + tierBonus.epic;
    const legendaryThreshold = epicThreshold + tierBonus.legendary;

    const hpPack = { id: 'hp', t: 'HEALTH REPAIR', short: 'HP', c: '#22c55e', rarity: 1 };
    const energyPack = { id: 'en', t: 'ENERGY CHARGE', short: 'EN', c: '#06b6d4', rarity: 1 };
    const shieldPack = { id: 'shield', t: 'SHIELD GUARD', short: 'SH', c: '#3b82f6', rarity: 1 };
    const armorPack = { id: 'armor', t: 'ARMOR PLATING', short: 'AR', c: '#78716c', rarity: 1 };

    // === GUARANTEED WEAPON DROP FOR FIRST KILL ===
    // If player needs upgrade and this is first kill, force weapon drop
    if (shouldGuaranteeWeapon) {
        // Build weapon pool based on player's current tier (next tier weapon)
        const nextTier = playerTier + 1;
        const allWeapons = [
            { id: 'twin', t: 'TWIN CANNON', short: 'TW', c: '#00ffaa', rarity: 2 },
            { id: 'shotgun', t: 'SCATTER GUN', short: 'SG', c: '#d946ef', rarity: 3 },
            { id: 'sniper', t: 'RAILGUN', short: 'RG', c: '#ffffff', rarity: 4 },
            { id: 'burst', t: 'BURST RIFLE', short: 'BR', c: '#fbbf24', rarity: 5 },
            { id: 'ice', t: 'FROST CANNON', short: 'FC', c: '#38bdf8', rarity: 6 },
            { id: 'fire', t: 'INFERNO GUN', short: 'IF', c: '#f97316', rarity: 7 },
            { id: 'flak', t: 'FLAK CANNON', short: 'FK', c: '#fb923c', rarity: 8 },
            { id: 'rocket', t: 'ROCKET LAUNCHER', short: 'RL', c: '#f43f5e', rarity: 9 },
            { id: 'electric', t: 'TESLA RIFLE', short: 'TR', c: '#facc15', rarity: 10 },
            { id: 'laser', t: 'PLASMA BEAM', short: 'PB', c: '#38bdf8', rarity: 11 },
            { id: 'gauss', t: 'GAUSS RIFLE', short: 'GS', c: '#a78bfa', rarity: 12 }
        ];
        
        // Find the weapon for next tier that's not already on ground
        let guaranteedWeapon = allWeapons.find(w => {
            const weaponTier = (typeof getWeaponTier === 'function' ? getWeaponTier(w.id) : null) ?? w.rarity;
            return weaponTier === nextTier && !weaponsOnGround.has(w.id);
        });
        
        if (guaranteedWeapon) {
            type = { ...guaranteedWeapon };
            pickups.push({ x, y, type: { ...type }, life: 1000, floatY: 0 });
            return; // Exit early - weapon guaranteed
        }
        // If no weapon found (e.g., already on ground), fall through to normal drop
    }

    if (rand < commonThreshold) {
        const pool = [
            hpPack, 
            energyPack, 
            shieldPack, 
            armorPack,
            { id: 'autoaim', t: 'AUTO-AIM', short: 'AA', c: '#fef08a', rarity: 1, shots: 15, isAutoAim: true }
        ];
        const roll = Math.random();
        if (roll < 0.35) type = hpPack;
        else if (roll < 0.60) type = energyPack;
        else if (roll < 0.75) type = shieldPack;
        else if (roll < 0.88) type = armorPack;
        else type = pool[4]; // Auto-aim ~12% chance in common pool
    } else if (rand < uncommonThreshold) {
        // Tier 2-3 weapons (twin, shotgun) - available from wave 1
        let pool = [
            { id: 'twin', t: 'TWIN CANNON', short: 'TW', c: '#00ffaa', rarity: 2, minWave: 1 },
            { id: 'shotgun', t: 'SCATTER GUN', short: 'SG', c: '#d946ef', rarity: 3, minWave: 2 }
        ];
        pool = filterPool(pool);
        type = selectFromPool(pool, energyPack);
    } else if (rand < rareThreshold) {
        // Tier 4-7 weapons - distributed across waves 3-6
        let pool = [
            { id: 'sniper', t: 'RAILGUN', short: 'RG', c: '#ffffff', rarity: 4, minWave: 3 },
            { id: 'burst', t: 'BURST RIFLE', short: 'BR', c: '#fbbf24', rarity: 5, minWave: 4 },
            { id: 'ice', t: 'FROST CANNON', short: 'FC', c: '#38bdf8', rarity: 6, minWave: 5 },
            { id: 'fire', t: 'INFERNO GUN', short: 'IF', c: '#f97316', rarity: 7, minWave: 6 },
            { id: 'stealth', t: 'STEALTH FIELD', short: 'ST', c: '#c084fc', rarity: 3, duration: 720, isRarePower: true, minWave: 2 },
            { id: 'lifesteal', t: 'LIFESTEAL CORE', short: 'LS', c: '#fb7185', rarity: 3, duration: 600, lifesteal: 0.15, isRarePower: true, minWave: 3 }
        ];
        pool = filterPool(pool);
        type = selectFromPool(pool, shieldPack);
    } else if (rand < epicThreshold) {
        // Tier 8-10 weapons - distributed across waves 7-9
        let pool = [
            { id: 'flak', t: 'FLAK CANNON', short: 'FK', c: '#fb923c', rarity: 8, minWave: 7 },
            { id: 'rocket', t: 'ROCKET LAUNCHER', short: 'RL', c: '#f43f5e', rarity: 9, minWave: 8 },
            { id: 'electric', t: 'TESLA RIFLE', short: 'TR', c: '#facc15', rarity: 10, minWave: 9 },
            { id: 'hp_max', t: 'MAX HP UP', short: 'HP+', c: '#166534', rarity: 4 },
            { id: 'en_max', t: 'MAX ENERGY UP', short: 'EN+', c: '#155e75', rarity: 4 },
            { id: 'turbo', t: 'TURBO DRIVE', short: 'TD', c: '#fb923c', rarity: 4, duration: 480, speedBoost: 9, charges: 1, isRarePower: true, minWave: 4 },
            { id: 'magnet', t: 'MAGNET CORE', short: 'MA', c: '#22d3ee', rarity: 4, duration: 600, magnetRange: 480, isRarePower: true, minWave: 4 }
        ];
        pool = filterPool(pool);
        type = selectFromPool(pool, armorPack);
    } else if (rand < legendaryThreshold) {
        // Tier 11-12 weapons - available from wave 10-11
        let pool = [
            { id: 'laser', t: 'PLASMA BEAM', short: 'PB', c: '#38bdf8', rarity: 11, minWave: 10 },
            { id: 'gauss', t: 'GAUSS RIFLE', short: 'GS', c: '#a78bfa', rarity: 12, minWave: 11 },
            { id: 'streak', t: 'ULTIMATE CHARGE', short: 'UC', c: '#fbbf24', rarity: 5 }
        ];
        pool = filterPool(pool);
        type = selectFromPool(pool, hpPack);
    } else {
        const reviveChance = typeof getReviveDropChance === 'function'
            ? getReviveDropChance(player.currentWave || 1, player.revives || 0)
            : 0.008;
        if ((player.revives || 0) < player.maxRevives && Math.random() < reviveChance) {
            type = { id: 'revive', t: 'REVIVE', short: 'RV', c: '#ff69b4', rarity: 6 };
        } else {
            type = hpPack;
        }
    }

    pickups.push({ x, y, type: { ...type }, life: 1000, floatY: 0 });
}

// Pickups float and glow to make them easy to notice even during chaos.
function updatePickups(dt = 1) {
    for (let i = pickups.length - 1; i >= 0; i--) {
        let p = pickups[i];
        p.floatY = Math.sin((frame + i) * 0.1) * 5;

        if (player.magnetActive && player.magnetTime > 0) {
            const dx = player.x - p.x;
            const dy = player.y - p.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 1 && dist < player.magnetRange) {
                const pull = ((player.magnetRange - dist) / player.magnetRange) * 12 * dt;
                p.x += (dx / dist) * pull;
                p.y += (dy / dist) * pull;
            }
        }
        if (Math.hypot(player.x - p.x, player.y - p.y) < 40) {
            // Check if pickup is a weapon and compare rarity
            const isWeapon = ['shotgun', 'rocket', 'laser', 'twin', 'sniper', 'burst', 'flak', 'gauss', 'ice', 'fire', 'electric'].includes(p.type.id);
            let showText = p.type.t;
            let textColor = p.type.c;
            let shouldPickup = true;
            
            if (isWeapon) {
                // FIXED: Use tier system for proper weapon comparison
                // This ensures debug weapons properly reject lower tier pickups
                const currentTier = (typeof getWeaponTier === 'function' ? getWeaponTier(player.weapon) : null) 
                    ?? WEAPONS[player.weapon]?.tier 
                    ?? WEAPONS[player.weapon]?.rarity 
                    ?? 0;
                const newTier = (typeof getWeaponTier === 'function' ? getWeaponTier(p.type.id) : null) 
                    ?? WEAPONS[p.type.id]?.tier 
                    ?? WEAPONS[p.type.id]?.rarity 
                    ?? 0;
                
                // Check if it's the same weapon
                if (p.type.id === player.weapon) {
                    showText = 'ALREADY EQUIPPED';
                    textColor = '#94a3b8'; // Gray color
                    shouldPickup = false;
                } else if (newTier <= currentTier) {
                    // Weapon is same or lower tier - show rejection message
                    showText = 'ALREADY HAVE BETTER WEAPON';
                    textColor = '#94a3b8'; // Gray color
                    shouldPickup = false;
                }
            }

            if (isRareEffectPickup(p.type.id)) {
                const result = applyRareEffectPickup(p.type);
                if (result && result.message) {
                    showText = result.message;
                    textColor = result.color || textColor;
                }
                if (result && result.applied === false) shouldPickup = false;
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

            if (p.type.id === 'hp') {
                // Heal 25% of max HP instead of fixed 50
                const healAmount = Math.ceil(player.maxHp * 0.25);
                player.hp = Math.min(player.hp + healAmount, player.maxHp);
            }
            if (p.type.id === 'en') {
                // Restore 30% of max energy instead of fixed 50
                const restoreAmount = Math.ceil(player.maxEnergy * 0.30);
                player.energy = Math.min(player.energy + restoreAmount, player.maxEnergy);
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
                player.killStreak = Math.max(player.killStreak || 0, player.maxStreak);
                player.bestKillStreak = Math.max(player.bestKillStreak || 0, player.killStreak);
                player.ultReady = true;
            }
            if (p.type.id === 'shield') player.shieldTime = 1200; // Extended shield duration (20 seconds at 60fps)
            if (p.type.id === 'armor') {
                // ARMOR SYSTEM: 15% of max HP per drop, stackable to 75% of max HP
                const armorPerDrop = Math.ceil(player.maxHp * 0.15); // 15% of max HP per armor drop
                const maxArmorCap = Math.ceil(player.maxHp * 0.75); // Cap at 75% of max HP
                player.armor = Math.min((player.armor || 0) + armorPerDrop, maxArmorCap);
                // Update maxArmor dynamically based on current maxHP
                player.maxArmor = maxArmorCap;
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
                    // Sync weapon to all active clones so they use the same weapon
                    if (typeof playerClones !== 'undefined') {
                        playerClones.forEach(clone => {
                            if (clone && clone.hp > 0) {
                                clone.weapon = p.type.id;
                            }
                        });
                    }
                }
            }
            pickups.splice(i, 1);
        }
    }
}

function isRareEffectPickup(id) {
    return ['stealth', 'lifesteal', 'turbo', 'magnet', 'autoaim'].includes(id);
}

function getActiveRareEffectCount() {
    let count = 0;
    if (player.invisible && player.invisibleTime > 0) count++;
    if (player.turboActive && player.turboTime > 0) count++;
    // Lifesteal is now permanent passive (level-based), not time-based
    if (player.lifesteal > 0 && player.lifestealLevel > 0) count++;
    if (player.autoAim && player.autoAimTime > 0) count++;
    if (player.magnetActive && player.magnetTime > 0) count++;
    rareItemTracker.activeRareItems = count;
    return count;
}

function isRareEffectActive(effectId) {
    switch (effectId) {
        case 'stealth':
            return player.invisible && player.invisibleTime > 0;
        case 'turbo':
            return player.turboActive && player.turboTime > 0;
        case 'lifesteal':
            // Lifesteal is permanent passive (level-based)
            return player.lifesteal > 0 && player.lifestealLevel > 0;
        case 'magnet':
            return player.magnetActive && player.magnetTime > 0;
        case 'autoaim':
            return player.autoAim && player.autoAimTime > 0;
        default:
            return false;
    }
}

function tryActivateRareEffect(effectId, applyFn) {
    const alreadyActive = isRareEffectActive(effectId);
    if (!alreadyActive && getActiveRareEffectCount() >= rareItemTracker.maxRareItems) {
        player.energy = Math.min(player.maxEnergy, player.energy + 25);
        return false;
    }
    if (typeof applyFn === 'function') applyFn();
    rareItemTracker.activeRareItems = getActiveRareEffectCount();
    return true;
}

function grantTurboChargePickup(pickupType) {
    const cap = Math.max(1, player.turboChargeCap || 2);
    const current = Math.max(0, player.turboCharges || 0);
    if (current >= cap) {
        return { applied: false, message: 'TURBO CHARGES FULL', color: '#f87171' };
    }
    const granted = Math.max(1, pickupType?.charges || 1);
    player.turboCharges = Math.min(cap, current + granted);
    const durationBoost = pickupType?.duration || player.turboDuration || 420;
    player.turboDuration = Math.max(player.turboDuration || 0, durationBoost);
    if (pickupType?.speedBoost) player.turboSpeed = Math.max(player.turboSpeed || 0, pickupType.speedBoost);
    if (pickupType?.cooldown) player.turboCooldownMax = pickupType.cooldown;
    
    // DRAMATIC TURBO PICKUP EFFECT - Fiery boost particles
    for (let i = 0; i < 30; i++) {
        const angle = (Math.PI * 2 * i) / 30;
        const speed = 4 + Math.random() * 6;
        particles.push({
            x: player.x,
            y: player.y,
            vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 3,
            vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 3,
            life: 35 + Math.random() * 20,
            color: i % 3 === 0 ? '#ff6600' : (i % 3 === 1 ? '#ffaa00' : '#ffcc00'),
            size: 4 + Math.random() * 4,
            gravity: -0.08,
            drag: 0.03
        });
    }
    
    // Fire ring burst
    for (let i = 0; i < 16; i++) {
        const ringAngle = (Math.PI * 2 * i) / 16;
        particles.push({
            x: player.x + Math.cos(ringAngle) * 30,
            y: player.y + Math.sin(ringAngle) * 30,
            vx: Math.cos(ringAngle) * 8,
            vy: Math.sin(ringAngle) * 8,
            life: 25,
            color: '#fb923c',
            size: 6,
            drag: 0.08
        });
    }
    
    return { applied: true, message: 'TURBO CHARGE +' + granted, color: '#fb923c' };
}

function applyRareEffectPickup(pickupType) {
    if (!pickupType) return null;
    if (pickupType.id === 'turbo') {
        return grantTurboChargePickup(pickupType);
    }
    let applied = false;
    const success = tryActivateRareEffect(pickupType.id, () => {
        const duration = pickupType.duration ?? 600;
        switch (pickupType.id) {
            case 'stealth':
                player.invisible = true;
                player.invisibleTime = duration;
                
                // DRAMATIC STEALTH ACTIVATION - Cloaking effect particles
                addFloatText('CLOAK ENGAGED', player.x, player.y - 70, '#64b5f6');
                
                // Imploding particles (sucked toward player)
                for (let i = 0; i < 36; i++) {
                    const angle = (Math.PI * 2 * i) / 36;
                    const startDist = 60 + Math.random() * 30;
                    particles.push({
                        x: player.x + Math.cos(angle) * startDist,
                        y: player.y + Math.sin(angle) * startDist,
                        vx: -Math.cos(angle) * (6 + Math.random() * 4),
                        vy: -Math.sin(angle) * (6 + Math.random() * 4),
                        life: 30 + Math.random() * 15,
                        color: i % 2 === 0 ? '#90caf9' : '#64b5f6',
                        size: 3 + Math.random() * 3,
                        drag: 0.02
                    });
                }
                
                // Digital distortion sparks
                for (let i = 0; i < 20; i++) {
                    particles.push({
                        x: player.x + (Math.random() - 0.5) * 50,
                        y: player.y + (Math.random() - 0.5) * 50,
                        vx: (Math.random() - 0.5) * 8,
                        vy: (Math.random() - 0.5) * 8 - 2,
                        life: 20 + Math.random() * 20,
                        color: '#e3f2fd',
                        size: 2 + Math.random() * 2,
                        gravity: -0.05
                    });
                }
                
                // Blue shimmer ring
                for (let i = 0; i < 12; i++) {
                    const ringAngle = (Math.PI * 2 * i) / 12;
                    particles.push({
                        x: player.x + Math.cos(ringAngle) * 35,
                        y: player.y + Math.sin(ringAngle) * 35,
                        vx: Math.cos(ringAngle) * 3,
                        vy: Math.sin(ringAngle) * 3,
                        life: 25,
                        color: '#42a5f5',
                        size: 5,
                        drag: 0.05
                    });
                }
                break;
            case 'turbo':
                player.turboActive = true;
                player.turboTime = duration;
                if (pickupType.speedBoost) player.turboSpeed = pickupType.speedBoost;
                break;
            case 'lifesteal':
                // Permanent lifesteal passive (levels 1-5, each level adds 5%)
                // Level 1: 5%, Level 2: 10%, Level 3: 15%, Level 4: 20%, Level 5: 25%
                player.lifestealLevel = Math.min(5, (player.lifestealLevel || 0) + 1);
                player.lifesteal = player.lifestealLevel * 0.05; // 5% per level
                addFloatText('LIFESTEAL LV' + player.lifestealLevel, player.x, player.y - 70, '#fb7185');
                // Blood aura particles
                for (let i = 0; i < 20; i++) {
                    const angle = (Math.PI * 2 * i) / 20;
                    particles.push({
                        x: player.x + Math.cos(angle) * 35,
                        y: player.y + Math.sin(angle) * 35,
                        vx: Math.cos(angle) * 2,
                        vy: Math.sin(angle) * 2 - 1,
                        life: 30,
                        color: Math.random() < 0.5 ? '#fb7185' : '#f43f5e',
                        size: 4 + Math.random() * 2,
                        gravity: -0.05
                    });
                }
                break;
            case 'magnet':
                player.magnetActive = true;
                player.magnetTime = duration;
                if (pickupType.magnetRange) player.magnetRange = pickupType.magnetRange;
                addFloatText('MAGNET ACTIVE', player.x, player.y - 70, '#22d3ee');
                // Magnet aura particles
                for (let i = 0; i < 24; i++) {
                    const angle = (Math.PI * 2 * i) / 24;
                    particles.push({
                        x: player.x + Math.cos(angle) * 40,
                        y: player.y + Math.sin(angle) * 40,
                        vx: Math.cos(angle) * 3,
                        vy: Math.sin(angle) * 3,
                        life: 30,
                        color: '#22d3ee',
                        size: 5
                    });
                }
                break;
            case 'autoaim':
                // Shots-based auto-aim system (15 shots per pickup, max 75)
                const newShots = pickupType.shots || 15;
                player.autoAim = true;
                player.autoAimShots = Math.min(75, player.autoAimShots + newShots); // Stack shots, cap at 75
                player.autoAimMaxShots = 75; // Fixed max at 75 shots
                addFloatText('AUTO-AIM +' + newShots, player.x, player.y - 70, '#fef08a');
                // Special claim effect - golden targeting particles
                for (let i = 0; i < 32; i++) {
                    const angle = (Math.PI * 2 * i) / 32;
                    const speed = 4 + Math.random() * 3;
                    particles.push({
                        x: player.x + Math.cos(angle) * 25,
                        y: player.y + Math.sin(angle) * 25,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        life: 40,
                        color: '#fef08a',
                        size: 4 + Math.random() * 3
                    });
                }
                // Inner spiral particles
                for (let i = 0; i < 16; i++) {
                    const angle = (Math.PI * 2 * i) / 16 + Math.PI / 8;
                    particles.push({
                        x: player.x,
                        y: player.y,
                        vx: Math.cos(angle) * 2,
                        vy: Math.sin(angle) * 2,
                        life: 30,
                        color: '#ffffff',
                        size: 3
                    });
                }
                // Screen flash effect (handled by screenFlash system if available)
                if (typeof screenFlash !== 'undefined') {
                    screenFlash.active = true;
                    screenFlash.alpha = 0.3;
                    screenFlash.color = '#fef08a';
                }
                break;
        }
        applied = true;
    });

    if (!success) {
        return { applied: false, message: 'POWER LIMIT REACHED', color: '#f87171' };
    }

    return { applied };
}

// ============================================================================
// PERFORMANCE OPTIMIZATIONS - Particle System
// ============================================================================

// Maximum particles to render (prevents GPU overload)
const MAX_PARTICLES = 1200; // Increased from 800 for consistent impact effects
const PARTICLE_CULL_THRESHOLD = 1000;

// FRUSTUM CULLING: Track visible particles count for accurate impact throttling
// Updated each frame during updateParticles() with proper viewport bounds
let visibleParticleCount = 0;
let lastViewportUpdateFrame = -1;

// Get current viewport bounds (works for portrait, landscape, and desktop)
// Returns cached values that are updated each frame in render.js updateViewportBounds()
function getViewportBounds() {
    // Use globals from render.js if available, otherwise estimate from canvas
    if (typeof viewportLeft !== 'undefined') {
        return {
            left: viewportLeft,
            right: viewportRight,
            top: viewportTop,
            bottom: viewportBottom
        };
    }
    // Fallback: estimate from camera and canvas (works in all orientations)
    const canvasW = typeof CANVAS !== 'undefined' ? CANVAS.width : 1920;
    const canvasH = typeof CANVAS !== 'undefined' ? CANVAS.height : 1080;
    const cx = typeof camX !== 'undefined' ? camX : 0;
    const cy = typeof camY !== 'undefined' ? camY : 0;
    return {
        left: cx,
        right: cx + canvasW,
        top: cy,
        bottom: cy + canvasH
    };
}

// Check if a particle is within the visible viewport (with margin for particles near edges)
function isParticleInViewport(p, margin = 30) {
    const vp = getViewportBounds();
    return p.x >= vp.left - margin &&
           p.x <= vp.right + margin &&
           p.y >= vp.top - margin &&
           p.y <= vp.bottom + margin;
}

// Get count of visible particles (used for impact effect throttling)
// This ensures MAX_PARTICLES limit only counts what's actually being rendered
function getVisibleParticleCount() {
    return visibleParticleCount;
}

// Object pool for particle reuse - reduces garbage collection
const PARTICLE_POOL_SIZE = 200;
const particlePool = [];
let particlePoolIndex = 0;

// Pre-allocate particle pool objects
function initParticlePool() {
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
        particlePool.push({
            x: 0, y: 0, vx: 0, vy: 0,
            life: 0, maxLife: 0, color: '#fff',
            size: 3, gravity: 0, drag: 0,
            type: null, style: null, noScale: false,
            spin: 0, seekStrength: 0, targetPlayer: false,
            radialGravity: false, coreColor: null, inUse: false
        });
    }
}

// Get particle from pool or create new one
function getPooledParticle() {
    // Try to find unused particle in pool
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
        const idx = (particlePoolIndex + i) % PARTICLE_POOL_SIZE;
        if (!particlePool[idx].inUse) {
            particlePoolIndex = (idx + 1) % PARTICLE_POOL_SIZE;
            particlePool[idx].inUse = true;
            return particlePool[idx];
        }
    }
    // Pool exhausted, create new particle (fallback)
    return { inUse: true };
}

// Return particle to pool
function recycleParticle(p) {
    if (p.inUse !== undefined) {
        p.inUse = false;
        // Reset optional properties
        p.type = null;
        p.style = null;
        p.noScale = false;
        p.targetPlayer = false;
        p.radialGravity = false;
    }
}

// Initialize pool on first load
initParticlePool();

function updateParticles(dt) {
    // FRUSTUM CULLING: Count visible particles for accurate impact throttling
    // This ensures we only count particles that are actually being rendered
    let visibleCount = 0;
    const vp = getViewportBounds();
    const cullMargin = 30; // Same margin as render.js uses
    
    // Performance: Cull excess particles to prevent lag
    // ANTI-FLICKER: Instead of immediate cull, mark particles for fast fade-out
    // Use visible count instead of total count for smarter culling
    if (particles.length > PARTICLE_CULL_THRESHOLD) {
        const cullCount = particles.length - MAX_PARTICLES;
        // Mark oldest particles for rapid fade-out instead of instant removal
        for (let i = 0; i < cullCount; i++) {
            if (particles[i] && particles[i].life > 3) {
                particles[i].life = 3; // Force rapid fade-out over 3 frames
                particles[i].maxLife = Math.max(particles[i].maxLife || 3, 3);
            }
        }
    }
    
    // Performance: Cache array length, iterate backwards for safe removal
    const len = particles.length;
    for (let i = len - 1; i >= 0; i--) {
        const p = particles[i];
        
        // CRITICAL: Set maxLife on first frame to ensure smooth alpha calculation
        // This prevents flicker from undefined maxLife during first render
        if (!p.maxLife || p.maxLife <= 0) {
            p.maxLife = Math.max(p.life || 30, 1);
        }
        
        // ANTI-FLICKER: Assign unique particleId if not set (for consistent skip decisions)
        if (!p.particleId) {
            p.particleId = ++particleIdCounter;
        }
        
        // Apply gravity
        if (p.gravity) {
            p.vy += p.gravity * dt;
        }
        
        // Radial gravity pulls toward player center
        if (p.radialGravity && p.targetPlayer) {
            const dx = player.x - p.x;
            const dy = player.y - p.y;
            const distSq = dx * dx + dy * dy;
            
            if (distSq > 25) {
                const dist = Math.sqrt(distSq);
                const pullStrength = (p.seekStrength || 0.12) * (1 + (400 / Math.max(50, dist)));
                const invDist = 1 / dist;
                p.vx += dx * invDist * pullStrength * dt;
                p.vy += dy * invDist * pullStrength * dt;
            }
        } else if (p.targetPlayer) {
            // Simple linear seek
            const a = Math.atan2(player.y - 10 - p.y, player.x - p.x);
            const steer = (p.seekStrength || 0.08) * dt;
            p.vx += Math.cos(a) * steer;
            p.vy += Math.sin(a) * steer;
        }
        
        // Apply drag
        if (p.drag) {
            const dragFactor = Math.max(0, 1 - p.drag * dt);
            p.vx *= dragFactor;
            p.vy *= dragFactor;
        }
        
        // Update position
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        
        // FRUSTUM CULLING: Count this particle if visible in viewport
        // Works correctly for portrait, landscape, and desktop orientations
        if (p.x >= vp.left - cullMargin && p.x <= vp.right + cullMargin &&
            p.y >= vp.top - cullMargin && p.y <= vp.bottom + cullMargin) {
            visibleCount++;
        }
        
        // Update life and remove if expired
        p.life -= dt;
        if (p.life <= 0) {
            recycleParticle(p);
            particles.splice(i, 1);
        }
    }
    
    // Update global visible particle count for impact effect throttling
    // This ensures createBulletImpact only counts particles actually being rendered
    visibleParticleCount = visibleCount;
}

// Global particle ID counter for consistent rendering (prevents flicker)
let particleIdCounter = 0;

// Optimized particle creation with maxLife for smooth fade
function createParticle(x, y, c, n) {
    // FRUSTUM CULLING: Use visible particle count for smarter throttling
    // This allows more particles when many are off-screen
    const currentVisible = getVisibleParticleCount();
    const actualCount = Math.min(n, Math.max(0, MAX_PARTICLES - currentVisible));
    const life = 30;
    for (let i = 0; i < actualCount; i++) {
        particles.push({ 
            x, y, 
            vx: (Math.random() - 0.5) * 10, 
            vy: (Math.random() - 0.5) * 10, 
            life: life, 
            maxLife: life, 
            color: c, 
            size: 3,
            particleId: ++particleIdCounter // Unique ID for consistent skip decisions
        });
    }
}

// Create dramatic floating damage text for regular (non-critical) enemy hits
function createEnemyDamageFloatText(x, y, damage) {
    // Only show for significant damage (avoid spam from small hits)
    if (damage < 5) return;
    
    // Throttle damage text to prevent visual overload during rapid fire
    // Use a simple frame-based throttle via enemy position hash
    const posHash = Math.floor(x / 50) * 1000 + Math.floor(y / 50);
    if (!createEnemyDamageFloatText.lastFrame) createEnemyDamageFloatText.lastFrame = {};
    if (createEnemyDamageFloatText.lastFrame[posHash] && 
        frame - createEnemyDamageFloatText.lastFrame[posHash] < 8) {
        return; // Skip if same area had damage text within 8 frames
    }
    createEnemyDamageFloatText.lastFrame[posHash] = frame;
    
    // Choose color based on damage amount for visual feedback
    let textColor = '#fbbf24'; // Default amber/gold
    if (damage >= 40) textColor = '#ef4444'; // Red for high damage
    else if (damage >= 25) textColor = '#f97316'; // Orange for medium-high damage
    else if (damage >= 15) textColor = '#facc15'; // Yellow for medium damage
    
    // Random offset to prevent overlapping
    const offsetX = (Math.random() - 0.5) * 30;
    const offsetY = (Math.random() - 0.5) * 20;
    
    // Dramatic damage text
    addFloatText(Math.round(damage).toString(), x + offsetX, y - 25 + offsetY, textColor, false);
    
    // Small impact sparks for visual flair (only for higher damage)
    if (damage >= 15) {
        const sparkCount = Math.min(6, Math.floor(damage / 10));
        for (let i = 0; i < sparkCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 3;
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1,
                life: 15 + Math.random() * 10,
                color: textColor,
                size: 2 + Math.random() * 2
            });
        }
    }
}

// Create dramatic lifesteal heal effect - blood drain from enemy to player
function createLifestealHealEffect(enemyX, enemyY, playerX, playerY, healAmount, lifestealLevel) {
    const angle = Math.atan2(playerY - enemyY, playerX - enemyX);
    const distance = Math.hypot(playerX - enemyX, playerY - enemyY);
    
    // Calculate particle count based on lifesteal level (more dramatic at higher levels)
    const baseParticles = 4 + lifestealLevel * 2;
    
    // BLOOD DRAIN STREAM - multiple particles flowing from enemy to player
    for (let i = 0; i < baseParticles; i++) {
        const spreadAngle = angle + (Math.random() - 0.5) * 0.6;
        const speed = 6 + Math.random() * 4 + lifestealLevel;
        const delay = i * 2; // Stagger particles
        
        // Blood droplet particles
        particles.push({
            x: enemyX + (Math.random() - 0.5) * 20,
            y: enemyY + (Math.random() - 0.5) * 20,
            vx: Math.cos(spreadAngle) * speed,
            vy: Math.sin(spreadAngle) * speed,
            life: 30 + Math.random() * 15,
            color: Math.random() < 0.3 ? '#ff0000' : (Math.random() < 0.5 ? '#dc2626' : '#b91c1c'),
            size: 4 + lifestealLevel * 0.7 + Math.random() * 2,
            gravity: 0,
            drag: 0.02,
            isLifesteal: true
        });
    }
    
    // ENEMY BLOOD SPLATTER - at enemy position
    for (let i = 0; i < 6; i++) {
        const splatAngle = Math.random() * Math.PI * 2;
        const splatSpeed = 2 + Math.random() * 3;
        particles.push({
            x: enemyX + (Math.random() - 0.5) * 15,
            y: enemyY + (Math.random() - 0.5) * 15,
            vx: Math.cos(splatAngle) * splatSpeed,
            vy: Math.sin(splatAngle) * splatSpeed,
            life: 20 + Math.random() * 10,
            color: '#7f1d1d',
            size: 3 + Math.random() * 2,
            gravity: 0.1,
            drag: 0.05
        });
    }
    
    // HEALING AURA at player - green glow particles rising
    const healParticles = 6 + lifestealLevel * 2;
    for (let i = 0; i < healParticles; i++) {
        const ringAngle = (Math.PI * 2 / healParticles) * i + Math.random() * 0.3;
        const radius = 20 + Math.random() * 15;
        particles.push({
            x: playerX + Math.cos(ringAngle) * radius,
            y: playerY + Math.sin(ringAngle) * radius,
            vx: Math.cos(ringAngle) * 0.5,
            vy: -2 - Math.random() * 2,
            life: 25 + Math.random() * 15,
            color: Math.random() < 0.4 ? '#22c55e' : (Math.random() < 0.5 ? '#4ade80' : '#86efac'),
            size: 4 + lifestealLevel * 0.5,
            gravity: -0.05, // Float upward
            drag: 0.02
        });
    }
    
    // HEAL BURST CENTER - bright green flash at player
    for (let i = 0; i < 8; i++) {
        particles.push({
            x: playerX + (Math.random() - 0.5) * 20,
            y: playerY + (Math.random() - 0.5) * 20,
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 0.5) * 3,
            life: 15,
            color: '#bbf7d0',
            size: 6 + Math.random() * 3,
            gravity: 0,
            drag: 0.1
        });
    }
    
    // HEAL TEXT - accumulate heal amount instead of showing immediately
    // This prevents multiple overlapping "+X HP" texts when hitting many enemies at once
    if (healAmount >= 0.5) {
        accumulateLifestealHeal(healAmount);
    }
    
    // BLOOD TRAIL EFFECT - connecting line particles from enemy to player
    const trailCount = Math.floor(distance / 30);
    for (let i = 0; i < trailCount; i++) {
        const t = i / trailCount;
        const trailX = enemyX + (playerX - enemyX) * t;
        const trailY = enemyY + (playerY - enemyY) * t;
        const delayFactor = i * 3;
        
        particles.push({
            x: trailX + (Math.random() - 0.5) * 10,
            y: trailY + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 1.5,
            vy: (Math.random() - 0.5) * 1.5,
            life: 12 + Math.random() * 8,
            color: Math.random() < 0.5 ? '#ef4444' : '#22c55e',
            size: 3 + Math.random() * 2,
            gravity: 0,
            drag: 0.08
        });
    }
    
    // VAMPIRE AURA RING at player (at higher levels)
    if (lifestealLevel >= 2) {
        const ringParticles = 12;
        for (let i = 0; i < ringParticles; i++) {
            const ringAngle = (Math.PI * 2 / ringParticles) * i;
            particles.push({
                x: playerX + Math.cos(ringAngle) * 35,
                y: playerY + Math.sin(ringAngle) * 35,
                vx: Math.cos(ringAngle) * 6,
                vy: Math.sin(ringAngle) * 6,
                life: 10,
                color: '#f87171',
                size: 3,
                gravity: 0,
                drag: 0.15
            });
        }
    }
}

// Create dramatic critical hit effect with explosion and floating text
function createCriticalHitEffect(x, y, damage) {
    // Screen shake for impact
    if (typeof screenShake !== 'undefined') {
        screenShake = Math.max(screenShake || 0, 8);
    }
    
    // Combined CRITICAL + damage in SINGLE text to prevent overlap
    // Format: "CRITICAL! XXX DAMAGE" with RED color for high visibility
    const critDmgText = 'CRITICAL! ' + Math.round(damage) + ' DAMAGE';
    
    // Single combined floating text - RED color for critical hits
    addFloatText(critDmgText, x, y - 40, '#ff0000', true); // true for critical style
    
    // EXPLOSION RING - expanding circle
    for (let ring = 0; ring < 3; ring++) {
        const ringDelay = ring * 3;
        for (let i = 0; i < 24; i++) {
            const angle = (Math.PI * 2 * i) / 24 + ring * 0.2;
            const speed = 8 + ring * 3;
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 25 - ring * 5,
                color: ring === 0 ? '#ff0000' : (ring === 1 ? '#ff6600' : '#ffcc00'),
                size: 6 - ring,
                gravity: 0,
                drag: 0.08
            });
        }
    }
    
    // FIRE BURST - fiery sparks
    for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 8;
        particles.push({
            x: x + (Math.random() - 0.5) * 15,
            y: y + (Math.random() - 0.5) * 15,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2,
            life: 30 + Math.random() * 20,
            color: Math.random() < 0.3 ? '#ffffff' : (Math.random() < 0.5 ? '#ff4444' : '#ffaa00'),
            size: 3 + Math.random() * 4,
            gravity: 0.15,
            drag: 0.05
        });
    }
    
    // SHOCKWAVE DEBRIS - chunks flying outward
    for (let i = 0; i < 12; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 4;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 3,
            life: 40 + Math.random() * 20,
            color: '#333333',
            size: 4 + Math.random() * 3,
            gravity: 0.2,
            drag: 0.02
        });
    }
    
    // GLOW CENTER - bright flash
    for (let i = 0; i < 8; i++) {
        particles.push({
            x: x + (Math.random() - 0.5) * 10,
            y: y + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            life: 15,
            color: '#ffffff',
            size: 8 + Math.random() * 4,
            gravity: 0,
            drag: 0.1
        });
    }
    
    // Sound effect indicator (visual spark ring)
    for (let i = 0; i < 16; i++) {
        const angle = (Math.PI * 2 * i) / 16;
        particles.push({
            x: x + Math.cos(angle) * 20,
            y: y + Math.sin(angle) * 20,
            vx: Math.cos(angle) * 12,
            vy: Math.sin(angle) * 12,
            life: 8,
            color: '#ffff00',
            size: 3,
            gravity: 0,
            drag: 0.15
        });
    }
}

// Create weapon-specific bullet impact effects
// All particles have maxLife and particleId for smooth alpha fade-out and anti-flicker
function createBulletImpact(x, y, bulletType, color, damage, impactAngle) {
    // FRUSTUM CULLING: Use visible particle count instead of total particles
    // This ensures we only throttle based on what's actually being rendered
    // Works correctly for portrait, landscape, and desktop screen orientations
    const currentVisibleParticles = getVisibleParticleCount();
    
    // CRITICAL FIX: Always create at least minimal impact effect for visual feedback
    // Check if we need reduced effects due to visible particle count
    const useReducedEffects = currentVisibleParticles >= MAX_PARTICLES - 100;
    const useMinimalEffects = currentVisibleParticles >= MAX_PARTICLES - 30;
    
    // ENHANCED: Multiplier for longer-lasting particle effects
    const lifeMult = 1.5; // Make particles last 50% longer
    
    // Helper to add particle with unique ID and apply lifeMult automatically
    // MOVED UP: Define before any usage to avoid ReferenceError
    const pushParticle = (props) => {
        if (props.life) props.life = Math.floor(props.life * lifeMult);
        if (props.maxLife) props.maxLife = Math.floor(props.maxLife * lifeMult);
        particles.push({
            ...props,
            particleId: ++particleIdCounter
        });
    };
    
    // Alias for backward compatibility
    const addImpactParticle = pushParticle;
    
    // If at absolute limit of visible particles, create single flash particle instead of nothing
    if (currentVisibleParticles >= MAX_PARTICLES - 5) {
        // Always show SOMETHING - a single flash particle
        const flashLife = 15;
        pushParticle({
            x, y, vx: 0, vy: 0,
            life: flashLife, maxLife: flashLife,
            color: color || '#fff',
            size: 14,
            type: 'wave',
            particleId: ++particleIdCounter
        });
        return;
    }
    
    const intensity = Math.min(1.5, damage / 50); // Scale effects by damage
    // Use provided angle or default to random upward
    const angle = impactAngle !== undefined ? impactAngle : Math.random() * Math.PI * 2;
    // Ricochet angle (opposite + spread)
    const ricochetAngle = angle + Math.PI;
    
    // Scale particle counts based on available capacity
    const getScaledCount = (baseCount) => {
        if (useMinimalEffects) return Math.max(2, Math.floor(baseCount * 0.25));
        if (useReducedEffects) return Math.max(3, Math.floor(baseCount * 0.5));
        return baseCount;
    };
    
    // Helper: Create directional debris spray from impact
    // CRITICAL FIX: Add particleId for consistent anti-flicker rendering
    const createDebrisSpray = (count, baseSpeed, spread, colors, sizes) => {
        const scaledCount = getScaledCount(count);
        for (let i = 0; i < scaledCount; i++) {
            // Spray in ricochet direction with spread
            const spreadAngle = ricochetAngle + (Math.random() - 0.5) * spread;
            const speed = baseSpeed * (0.5 + Math.random() * 0.5);
            const life = 15 + Math.random() * 15;
            addImpactParticle({
                x: x + (Math.random() - 0.5) * 6,
                y: y + (Math.random() - 0.5) * 6,
                vx: Math.cos(spreadAngle) * speed,
                vy: Math.sin(spreadAngle) * speed,
                life: life,
                maxLife: life,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: sizes[0] + Math.random() * (sizes[1] - sizes[0]),
                gravity: 0.08
            });
        }
    };
    
    // Helper: Create directional spark shower
    // CRITICAL FIX: Add particleId for consistent anti-flicker rendering
    const createSparkShower = (count, speed, colors) => {
        const scaledCount = getScaledCount(count);
        for (let i = 0; i < scaledCount; i++) {
            // Sparks spray in semi-cone from ricochet
            const sparkAngle = ricochetAngle + (Math.random() - 0.5) * 1.2;
            const sparkSpeed = speed * (0.7 + Math.random() * 0.6);
            const life = 8 + Math.random() * 10;
            addImpactParticle({
                x, y,
                vx: Math.cos(sparkAngle) * sparkSpeed,
                vy: Math.sin(sparkAngle) * sparkSpeed,
                life: life,
                maxLife: life,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: 1 + Math.random() * 2
            });
        }
    };
    
    switch(bulletType) {
        case 'single': // Cannon - heavy artillery impact with steel-colored debris
            // Steel/silver spark shower matching turret color
            createSparkShower(12, 10, ['#d1d5db', '#9ca3af', '#6b7280', '#fff']);
            // Metal debris spray - larger chunks for heavy shell
            createDebrisSpray(8, 6, 2, ['#9ca3af', '#6b7280', '#4b5563', '#d1d5db'], [3, 5]);
            // Impact shockwave ring - silver
            for (let ring = 0; ring < 2; ring++) {
                const ringLife = 18 - ring * 6;
                magicEffects.push({
                    type: 'shockwave',
                    x, y,
                    radius: 8 + ring * 4,
                    maxRadius: 35 + ring * 10,
                    life: ringLife, maxLife: ringLife,
                    color: ring === 0 ? '#9ca3af' : '#d1d5db',
                    lineWidth: 3 - ring
                });
            }
            // Heavy smoke puff at impact
            for (let i = 0; i < 5; i++) {
                const life = 25 + Math.random() * 15;
                pushParticle({
                    x: x + (Math.random() - 0.5) * 10,
                    y: y + (Math.random() - 0.5) * 10,
                    vx: Math.cos(ricochetAngle) * 2 + (Math.random() - 0.5) * 2,
                    vy: Math.sin(ricochetAngle) * 2 - Math.random() * 2,
                    life: life, maxLife: life,
                    color: i < 2 ? '#6b7280' : '#9ca3af',
                    size: 6 + Math.random() * 4,
                    noScale: true
                });
            }
            // Brass casing fragment particles
            for (let i = 0; i < 3; i++) {
                const fragAngle = ricochetAngle + (Math.random() - 0.5) * 2;
                const fragSpeed = 3 + Math.random() * 2;
                const life = 15 + Math.random() * 10;
                pushParticle({
                    x, y,
                    vx: Math.cos(fragAngle) * fragSpeed,
                    vy: Math.sin(fragAngle) * fragSpeed,
                    life: life, maxLife: life,
                    color: '#c9a567',
                    size: 2 + Math.random() * 2,
                    drag: 0.03
                });
            }
            break;
            
        case 'twin': // Twin Cannon - dramatic plasma burst with energy dissipation
            // Primary plasma burst - directional cone spray
            for (let i = 0; i < 12; i++) {
                const spreadAngle = ricochetAngle + (Math.random() - 0.5) * 1.4;
                const speed = 5 + Math.random() * 4;
                const life = 20 + Math.random() * 12;
                pushParticle({
                    x: x + (Math.random() - 0.5) * 4,
                    y: y + (Math.random() - 0.5) * 4,
                    vx: Math.cos(spreadAngle) * speed,
                    vy: Math.sin(spreadAngle) * speed,
                    life: life, maxLife: life,
                    color: Math.random() > 0.6 ? '#34d399' : (Math.random() > 0.5 ? '#10b981' : '#6ee7b7'),
                    size: 3 + Math.random() * 3,
                    drag: 0.02
                });
            }
            // Fast spark streaks - bright tracer lines
            for (let i = 0; i < 6; i++) {
                const sparkAngle = ricochetAngle + (Math.random() - 0.5) * 1.0;
                const sparkSpeed = 8 + Math.random() * 5;
                const life = 8 + Math.random() * 6;
                pushParticle({
                    x, y,
                    vx: Math.cos(sparkAngle) * sparkSpeed,
                    vy: Math.sin(sparkAngle) * sparkSpeed,
                    life: life, maxLife: life,
                    color: '#a7f3d0',
                    size: 1.5 + Math.random()
                });
            }
            // Side splatter particles - wider spread
            for (let i = 0; i < 6; i++) {
                const sideAngle = ricochetAngle + (i < 3 ? Math.PI/2.5 : -Math.PI/2.5) + (Math.random() - 0.5) * 0.5;
                const life = 15 + Math.random() * 8;
                pushParticle({
                    x, y,
                    vx: Math.cos(sideAngle) * (3 + Math.random() * 2),
                    vy: Math.sin(sideAngle) * (3 + Math.random() * 2),
                    life: life, maxLife: life,
                    color: '#6ee7b7',
                    size: 2 + Math.random()
                });
            }
            // Central energy shockwave
            pushParticle({
                x, y, vx: 0, vy: 0,
                life: 10, maxLife: 10, color: '#34d399', size: 14,
                type: 'wave'
            });
            // Secondary inner wave
            pushParticle({
                x, y, vx: 0, vy: 0,
                life: 6, maxLife: 6, color: '#a7f3d0', size: 8,
                type: 'wave'
            });
            // Smoke puff - subtle
            for (let i = 0; i < 3; i++) {
                const smokeAngle = ricochetAngle + (Math.random() - 0.5) * 0.8;
                const life = 25 + Math.random() * 15;
                pushParticle({
                    x: x + (Math.random() - 0.5) * 6,
                    y: y + (Math.random() - 0.5) * 6,
                    vx: Math.cos(smokeAngle) * 1.5 + (Math.random() - 0.5),
                    vy: Math.sin(smokeAngle) * 1.5 - Math.random() * 0.5,
                    life: life, maxLife: life,
                    color: 'rgba(110, 231, 183, 0.4)',
                    size: 5 + Math.random() * 4,
                    noScale: true
                });
            }
            break;
            
        case 'spread': // Shotgun - directional pellet spray pattern
            // Pellets scatter in cone from impact
            for (let i = 0; i < 10; i++) {
                const spreadAngle = ricochetAngle + (Math.random() - 0.5) * 1.8;
                const speed = 3 + Math.random() * 4;
                const dist = Math.random() * 10;
                const life = 12 + Math.random() * 8;
                pushParticle({
                    x: x + Math.cos(spreadAngle) * dist * 0.5,
                    y: y + Math.sin(spreadAngle) * dist * 0.5,
                    vx: Math.cos(spreadAngle) * speed,
                    vy: Math.sin(spreadAngle) * speed,
                    life: life, maxLife: life,
                    color: Math.random() > 0.5 ? '#d946ef' : '#f0abfc',
                    size: 2 + Math.random() * 1.5,
                    gravity: 0.05
                });
            }
            // Small puff marks
            for (let i = 0; i < 4; i++) {
                const life = 15 + Math.random() * 8;
                pushParticle({
                    x: x + (Math.random() - 0.5) * 12,
                    y: y + (Math.random() - 0.5) * 12,
                    vx: Math.cos(ricochetAngle) * 0.5,
                    vy: Math.sin(ricochetAngle) * 0.5,
                    life: life, maxLife: life,
                    color: '#888', size: 3,
                    noScale: true
                });
            }
            break;
            
        case 'sniper': // Railgun - directional sonic penetration effect
            // Penetration line effect along bullet path
            for (let i = 0; i < 6; i++) {
                const dist = (i + 1) * 8;
                const life = 10 + i * 2;
                pushParticle({
                    x: x - Math.cos(angle) * dist,
                    y: y - Math.sin(angle) * dist,
                    vx: Math.cos(ricochetAngle) * 2,
                    vy: Math.sin(ricochetAngle) * 2,
                    life: life, maxLife: life,
                    color: '#00e5ff', size: 4 - i * 0.4,
                    type: 'wave'
                });
            }
            // Sonic shockwave cone in ricochet direction
            for (let i = 0; i < 12; i++) {
                const spreadAngle = ricochetAngle + (Math.random() - 0.5) * 0.8;
                const speed = 10 + Math.random() * 8;
                const life = 8 + Math.random() * 6;
                pushParticle({
                    x, y,
                    vx: Math.cos(spreadAngle) * speed,
                    vy: Math.sin(spreadAngle) * speed,
                    life: life, maxLife: life,
                    color: '#fff', size: 2 + Math.random()
                });
            }
            // Central flash
            pushParticle({
                x, y, vx: 0, vy: 0,
                life: 6, maxLife: 6, color: '#00e5ff', size: 20,
                type: 'wave'
            });
            break;
            
        case 'burst': // Burst Rifle - directional golden burst
            // Golden sparks spray in ricochet direction
            for (let i = 0; i < 10; i++) {
                const spreadAngle = ricochetAngle + (Math.random() - 0.5) * 1.4;
                const speed = 5 + Math.random() * 4;
                const life = 14 + Math.random() * 8;
                pushParticle({
                    x, y,
                    vx: Math.cos(spreadAngle) * speed,
                    vy: Math.sin(spreadAngle) * speed,
                    life: life, maxLife: life,
                    color: Math.random() > 0.5 ? '#ffd700' : '#ffeb3b',
                    size: 3 + Math.random() * 2
                });
            }
            // Side flare particles
            createSparkShower(4, 4, ['#fbbf24', '#fcd34d']);
            // Central glow
            pushParticle({
                x, y, vx: 0, vy: 0,
                life: 10, maxLife: 10, color: '#ffd700', size: 12,
                type: 'wave'
            });
            break;
            
        case 'flak': // Flak - explosive fragmentation
            // Main explosion
            for (let i = 0; i < 20; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 4 + Math.random() * 8;
                const life = 20 + Math.random() * 15;
                pushParticle({
                    x, y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: life,
                    maxLife: life,
                    color: Math.random() > 0.6 ? '#ff6600' : (Math.random() > 0.5 ? '#a0522d' : '#444'),
                    size: 3 + Math.random() * 4,
                    noScale: true
                });
            }
            // Shrapnel
            for (let i = 0; i < 8; i++) {
                const angle = Math.random() * Math.PI * 2;
                pushParticle({
                    x, y,
                    vx: Math.cos(angle) * (6 + Math.random() * 4),
                    vy: Math.sin(angle) * (6 + Math.random() * 4),
                    life: 25,
                    maxLife: 25,
                    color: '#666',
                    size: 2
                });
            }
            // Smoke cloud
            for (let i = 0; i < 6; i++) {
                const life = 35 + Math.random() * 20;
                pushParticle({
                    x: x + (Math.random() - 0.5) * 20,
                    y: y + (Math.random() - 0.5) * 20,
                    vx: (Math.random() - 0.5) * 3,
                    vy: -2 - Math.random() * 2,
                    life: life,
                    maxLife: life,
                    color: '#555',
                    size: 8 + Math.random() * 6,
                    noScale: true
                });
            }
            break;
            
        case 'aoe': // Rocket - massive explosion with fire
            // Explosion core
            for (let i = 0; i < 30; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 3 + Math.random() * 12;
                const life = 25 + Math.random() * 20;
                pushParticle({
                    x, y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: life,
                    maxLife: life,
                    color: Math.random() > 0.4 ? '#ff4400' : (Math.random() > 0.5 ? '#ffcc00' : '#ff6600'),
                    size: 4 + Math.random() * 6,
                    noScale: true
                });
            }
            // Fireball rings
            for (let ring = 0; ring < 4; ring++) {
                const life = 20 + ring * 8;
                pushParticle({
                    x, y, vx: 0, vy: 0,
                    life: life,
                    maxLife: life,
                    color: ring < 2 ? '#ff4400' : '#ff8800',
                    size: 30 + ring * 20,
                    type: 'wave'
                });
            }
            // Thick smoke
            for (let i = 0; i < 10; i++) {
                const life = 45 + Math.random() * 30;
                pushParticle({
                    x: x + (Math.random() - 0.5) * 40,
                    y: y + (Math.random() - 0.5) * 40,
                    vx: (Math.random() - 0.5) * 4,
                    vy: -3 - Math.random() * 3,
                    life: life,
                    maxLife: life,
                    color: '#333',
                    size: 10 + Math.random() * 10,
                    noScale: true
                });
            }
            // Screen shake intensity for rocket
            screenShake = Math.max(screenShake, 12);
            break;
            
        case 'rapid': // Plasma Beam - plasma splash
            // Plasma splatter
            for (let i = 0; i < 8; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 3 + Math.random() * 4;
                const life = 12 + Math.random() * 8;
                pushParticle({
                    x, y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: life,
                    maxLife: life,
                    color: Math.random() > 0.5 ? '#00e5ff' : '#0099cc',
                    size: 3 + Math.random() * 2
                });
            }
            // Plasma ripple
            pushParticle({
                x, y, vx: 0, vy: 0,
                life: 10, maxLife: 10, color: '#00e5ff', size: 12,
                type: 'wave'
            });
            break;
            
        case 'pierce': // Gauss - electromagnetic discharge
            // Magnetic field discharge
            for (let i = 0; i < 12; i++) {
                const angle = (Math.PI * 2 / 12) * i;
                const speed = 6 + Math.random() * 5;
                const life = 18 + Math.random() * 10;
                pushParticle({
                    x, y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: life,
                    maxLife: life,
                    color: Math.random() > 0.5 ? '#8b5cf6' : '#c084fc',
                    size: 3 + Math.random() * 2
                });
            }
            // Electric arcs
            for (let i = 0; i < 4; i++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 15 + Math.random() * 20;
                pushParticle({
                    x: x + Math.cos(angle) * dist * 0.5,
                    y: y + Math.sin(angle) * dist * 0.5,
                    vx: Math.cos(angle) * 8,
                    vy: Math.sin(angle) * 8,
                    life: 6,
                    maxLife: 6,
                    color: '#fff',
                    size: 2
                });
            }
            // EM pulse ring
            pushParticle({
                x, y, vx: 0, vy: 0,
                life: 15, maxLife: 15, color: '#8b5cf6', size: 25,
                type: 'wave'
            });
            break;
            
        case 'ice': // Frost - ice shatter and frost spread
            // Ice shards exploding
            for (let i = 0; i < 12; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 4 + Math.random() * 4;
                const life = 20 + Math.random() * 15;
                pushParticle({
                    x, y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: life,
                    maxLife: life,
                    color: Math.random() > 0.5 ? '#3b82f6' : '#93c5fd',
                    size: 3 + Math.random() * 3
                });
            }
            // Frost mist
            for (let i = 0; i < 6; i++) {
                const life = 30 + Math.random() * 20;
                pushParticle({
                    x: x + (Math.random() - 0.5) * 30,
                    y: y + (Math.random() - 0.5) * 30,
                    vx: (Math.random() - 0.5) * 2,
                    vy: (Math.random() - 0.5) * 2,
                    life: life,
                    maxLife: life,
                    color: '#b0e0e6',
                    size: 6 + Math.random() * 4,
                    noScale: true
                });
            }
            // Crystalline sparkles
            for (let i = 0; i < 8; i++) {
                const life = 25 + Math.random() * 15;
                pushParticle({
                    x: x + (Math.random() - 0.5) * 25,
                    y: y + (Math.random() - 0.5) * 25,
                    vx: 0, vy: -0.5,
                    life: life,
                    maxLife: life,
                    color: '#fff',
                    size: 2
                });
            }
            // Frost ring
            pushParticle({
                x, y, vx: 0, vy: 0,
                life: 20, maxLife: 20, color: '#60a5fa', size: 20,
                type: 'wave'
            });
            break;
            
        case 'fire': // Inferno - fire explosion with embers
            // Fire burst
            for (let i = 0; i < 20; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 3 + Math.random() * 6;
                const life = 20 + Math.random() * 15;
                pushParticle({
                    x, y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 1,
                    life: life,
                    maxLife: life,
                    color: Math.random() > 0.6 ? '#ff4500' : (Math.random() > 0.5 ? '#ff6b35' : '#ffcc00'),
                    size: 4 + Math.random() * 4,
                    noScale: true
                });
            }
            // Rising embers
            for (let i = 0; i < 10; i++) {
                const life = 30 + Math.random() * 20;
                pushParticle({
                    x: x + (Math.random() - 0.5) * 20,
                    y: y + (Math.random() - 0.5) * 20,
                    vx: (Math.random() - 0.5) * 3,
                    vy: -2 - Math.random() * 4,
                    life: life,
                    maxLife: life,
                    color: Math.random() > 0.5 ? '#ff9900' : '#ffcc00',
                    size: 2 + Math.random() * 2
                });
            }
            // Smoke
            for (let i = 0; i < 5; i++) {
                const life = 35 + Math.random() * 20;
                pushParticle({
                    x: x + (Math.random() - 0.5) * 15,
                    y: y + (Math.random() - 0.5) * 15,
                    vx: (Math.random() - 0.5) * 2,
                    vy: -1 - Math.random() * 2,
                    life: life,
                    maxLife: life,
                    color: '#444',
                    size: 7 + Math.random() * 5,
                    noScale: true
                });
            }
            // Fire ring
            pushParticle({
                x, y, vx: 0, vy: 0,
                life: 15, maxLife: 15, color: '#ff4500', size: 18,
                type: 'wave'
            });
            break;
            
        case 'electric': // Tesla - lightning discharge
            // Electric sparks exploding outward
            for (let i = 0; i < 15; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 5 + Math.random() * 7;
                const life = 12 + Math.random() * 10;
                pushParticle({
                    x, y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: life,
                    maxLife: life,
                    color: Math.random() > 0.5 ? '#a855f7' : '#ffeb3b',
                    size: 2 + Math.random() * 3
                });
            }
            // Lightning bolt fragments
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI * 2 / 6) * i;
                const len = 20 + Math.random() * 15;
                // Create zigzag effect with multiple particles
                for (let j = 0; j < 4; j++) {
                    const t = j / 4;
                    const zigX = Math.cos(angle) * len * t + (Math.random() - 0.5) * 8;
                    const zigY = Math.sin(angle) * len * t + (Math.random() - 0.5) * 8;
                    const life = 8 + Math.random() * 6;
                    pushParticle({
                        x: x + zigX,
                        y: y + zigY,
                        vx: Math.cos(angle) * 3,
                        vy: Math.sin(angle) * 3,
                        life: life,
                        maxLife: life,
                        color: j % 2 === 0 ? '#ffeb3b' : '#a855f7',
                        size: 3 - j * 0.5
                    });
                }
            }
            // Electric pulse ring
            pushParticle({
                x, y, vx: 0, vy: 0,
                life: 12, maxLife: 12, color: '#a855f7', size: 22,
                type: 'wave'
            });
            // Bright flash center
            pushParticle({
                x, y, vx: 0, vy: 0,
                life: 8, maxLife: 8, color: '#fff', size: 15,
                type: 'wave'
            });
            break;
            
        default:
            // Default impact - simple particle burst
            for (let i = 0; i < 6; i++) {
                const life = 20 + Math.random() * 10;
                pushParticle({
                    x, y,
                    vx: (Math.random() - 0.5) * 8,
                    vy: (Math.random() - 0.5) * 8,
                    life: life,
                    maxLife: life,
                    color: color,
                    size: 3
                });
            }
    }
}

// Create smaller despawn effect when bullet reaches max range without hitting anything
// Each weapon type has a distinct visual fizzle/dissipation effect
function createBulletDespawnEffect(x, y, bulletType, color) {
    // Smaller effects than impact - bullet just fizzles out
    const baseCount = 4;
    
    // Helper function to add particles with unique ID
    const addParticle = (props) => {
        particles.push({
            ...props,
            particleId: ++particleIdCounter
        });
    };
    
    switch(bulletType) {
        case 'single': // Cannon - small spark fizzle
            for (let i = 0; i < baseCount; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 1 + Math.random() * 2;
                const life = 10 + Math.random() * 8;
                addParticle({
                    x, y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: life,
                    maxLife: life,
                    color: '#888',
                    size: 2
                });
            }
            break;
            
        case 'twin': // Twin Cannon - green energy dissipate
            for (let i = 0; i < baseCount; i++) {
                const angle = Math.random() * Math.PI * 2;
                const life = 12 + Math.random() * 6;
                addParticle({
                    x, y,
                    vx: Math.cos(angle) * 2,
                    vy: Math.sin(angle) * 2,
                    life: life,
                    maxLife: life,
                    color: '#34d399',
                    size: 3
                });
            }
            // Small energy pop
            addParticle({
                x, y, vx: 0, vy: 0,
                life: 8, maxLife: 8, color: '#10b981', size: 8,
                type: 'wave'
            });
            break;
            
        case 'spread': // Shotgun - pellet scatter dust
            for (let i = 0; i < 6; i++) {
                const angle = Math.random() * Math.PI * 2;
                const life = 8 + Math.random() * 5;
                addParticle({
                    x: x + (Math.random() - 0.5) * 8,
                    y: y + (Math.random() - 0.5) * 8,
                    vx: Math.cos(angle) * 1.5,
                    vy: Math.sin(angle) * 1.5,
                    life: life,
                    maxLife: life,
                    color: '#d946ef',
                    size: 1.5
                });
            }
            break;
            
        case 'sniper': // Railgun - sonic boom dissipate
            // Fading shockwave
            addParticle({
                x, y, vx: 0, vy: 0,
                life: 10, maxLife: 10, color: '#ccc', size: 12,
                type: 'wave'
            });
            // Trailing sparks
            for (let i = 0; i < 3; i++) {
                const life = 6 + Math.random() * 4;
                addParticle({
                    x, y,
                    vx: (Math.random() - 0.5) * 4,
                    vy: (Math.random() - 0.5) * 4,
                    life: life,
                    maxLife: life,
                    color: '#fff',
                    size: 2
                });
            }
            break;
            
        case 'burst': // Burst Rifle - golden energy fade
            for (let i = 0; i < 5; i++) {
                const angle = (Math.PI * 2 / 5) * i;
                const life = 10 + Math.random() * 5;
                addParticle({
                    x, y,
                    vx: Math.cos(angle) * 2,
                    vy: Math.sin(angle) * 2,
                    life: life,
                    maxLife: life,
                    color: '#ffd700',
                    size: 2
                });
            }
            break;
            
        case 'flak': // Flak - air burst smoke
            for (let i = 0; i < 6; i++) {
                const angle = Math.random() * Math.PI * 2;
                const life = 15 + Math.random() * 10;
                addParticle({
                    x, y,
                    vx: Math.cos(angle) * 2.5,
                    vy: Math.sin(angle) * 2.5 - 0.5,
                    life: life,
                    maxLife: life,
                    color: Math.random() > 0.5 ? '#555' : '#ff6600',
                    size: 3
                });
            }
            break;
            
        case 'aoe': // Rocket - small explosion puff
            // Mini explosion
            for (let i = 0; i < 8; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 2 + Math.random() * 3;
                const life = 12 + Math.random() * 8;
                addParticle({
                    x, y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: life,
                    maxLife: life,
                    color: Math.random() > 0.5 ? '#ff4400' : '#ffcc00',
                    size: 3
                });
            }
            // Small shockwave
            addParticle({
                x, y, vx: 0, vy: 0,
                life: 12, maxLife: 12, color: '#ff6600', size: 15,
                type: 'wave'
            });
            break;
            
        case 'rapid': // Plasma Beam - plasma fizzle
            for (let i = 0; i < baseCount; i++) {
                const life = 8 + Math.random() * 5;
                addParticle({
                    x, y,
                    vx: (Math.random() - 0.5) * 3,
                    vy: (Math.random() - 0.5) * 3,
                    life: life,
                    maxLife: life,
                    color: '#00e5ff',
                    size: 2.5
                });
            }
            break;
            
        case 'pierce': // Gauss - electromagnetic discharge
            for (let i = 0; i < 5; i++) {
                const angle = (Math.PI * 2 / 5) * i;
                const life = 10 + Math.random() * 6;
                addParticle({
                    x, y,
                    vx: Math.cos(angle) * 3,
                    vy: Math.sin(angle) * 3,
                    life: life,
                    maxLife: life,
                    color: Math.random() > 0.5 ? '#8b5cf6' : '#c084fc',
                    size: 2
                });
            }
            break;
            
        case 'ice': // Frost - ice crystal dissipate
            for (let i = 0; i < 5; i++) {
                const angle = Math.random() * Math.PI * 2;
                const life = 12 + Math.random() * 8;
                addParticle({
                    x, y,
                    vx: Math.cos(angle) * 2,
                    vy: Math.sin(angle) * 2 - 0.5,
                    life: life,
                    maxLife: life,
                    color: Math.random() > 0.5 ? '#3b82f6' : '#93c5fd',
                    size: 2.5
                });
            }
            // Frost mist
            addParticle({
                x, y, vx: 0, vy: 0,
                life: 10, maxLife: 10, color: '#b0e0e6', size: 10,
                type: 'wave'
            });
            break;
            
        case 'fire': // Inferno - flame fizzle
            for (let i = 0; i < 6; i++) {
                const angle = Math.random() * Math.PI * 2;
                const life = 10 + Math.random() * 8;
                addParticle({
                    x, y,
                    vx: Math.cos(angle) * 2,
                    vy: Math.sin(angle) * 2 - 1,
                    life: life,
                    maxLife: life,
                    color: Math.random() > 0.5 ? '#ff4500' : '#ffcc00',
                    size: 2.5
                });
            }
            break;
            
        case 'electric': // Tesla - spark fizzle
            for (let i = 0; i < 5; i++) {
                const angle = Math.random() * Math.PI * 2;
                const life = 8 + Math.random() * 5;
                addParticle({
                    x, y,
                    vx: Math.cos(angle) * 3,
                    vy: Math.sin(angle) * 3,
                    life: life,
                    maxLife: life,
                    color: Math.random() > 0.5 ? '#a855f7' : '#ffeb3b',
                    size: 2
                });
            }
            // Small electric pop
            addParticle({
                x, y, vx: 0, vy: 0,
                life: 6, maxLife: 6, color: '#fff', size: 8,
                type: 'wave'
            });
            break;
            
        default:
            // Default fizzle - small puff
            for (let i = 0; i < 3; i++) {
                const life = 10 + Math.random() * 5;
                addParticle({
                    x, y,
                    vx: (Math.random() - 0.5) * 3,
                    vy: (Math.random() - 0.5) * 3,
                    life: life,
                    maxLife: life,
                    color: color || '#888',
                    size: 2
                });
            }
    }
}

// Crates always reward the player to motivate environmental destruction.
// FIXED: Crates only drop consumables (HP, energy, shield, armor) - NO weapons
function destroyCrate(c, index) {
    createExplosion(c.x + c.w / 2, c.y + c.h / 2, '#d97706');
    spawnCrateDrop(c.x + c.w / 2, c.y + c.h / 2); // Use crate-specific drop function
    score += 25;
    addFloatText('+25', c.x + c.w / 2, c.y + c.h / 2, '#fbbf24');
    crates.splice(index, 1);
    markSpatialGridDirty(); // Rebuild spatial grid after crate destruction
}

// Crate-specific drop function - only consumables, NO weapons
function spawnCrateDrop(x, y) {
    const consumables = [
        { id: 'hp', t: 'HEALTH REPAIR', short: 'HP', c: '#22c55e', rarity: 1 },
        { id: 'en', t: 'ENERGY CHARGE', short: 'EN', c: '#06b6d4', rarity: 1 },
        { id: 'shield', t: 'SHIELD GUARD', short: 'SH', c: '#3b82f6', rarity: 1 },
        { id: 'armor', t: 'ARMOR PLATING', short: 'AR', c: '#78716c', rarity: 1 }
    ];
    
    // Weighted selection - HP and Energy more common
    const roll = Math.random();
    let type;
    if (roll < 0.35) type = consumables[0];      // HP 35%
    else if (roll < 0.65) type = consumables[1]; // Energy 30%
    else if (roll < 0.85) type = consumables[2]; // Shield 20%
    else type = consumables[3];                   // Armor 15%
    
    pickups.push({ x, y, type: { ...type }, life: 1000, floatY: 0 });
}

function killEnemy(index) {
    let e = enemies[index];
    const explosionX = e.x;
    const explosionY = e.y;
    const explosionRadius = 80; // Smaller radius for less splash damage
    const explosionDamagePercent = 0.05; // 5% of target's max HP (very small)
    
    // In DEMO mode, enemies should NOT be removed - they respawn via checkDemoRespawns()
    // Skip scoring, drops, and removal - just create explosion effect
    if (typeof demoActive !== 'undefined' && demoActive === true) {
        // Skip if already in death sequence (isDying flag set by demo.js)
        if (e.isDying) return;
        
        // Mark as dying so demo respawn system handles it
        e.isDying = true;
        e.hp = 0;
        return; // Skip normal kill processing - demo handles respawn
    }
    
    createExplosion(e.x, e.y, e.color);
    
    spawnDrop(e.x, e.y, false, e.id); // Pass enemy tier for better loot
    score += ENEMY_TIERS[e.id].score;
    player.killStreak = (player.killStreak || 0) + 1;
    player.bestKillStreak = Math.max(player.bestKillStreak || 0, player.killStreak);
    addFloatText('+' + ENEMY_TIERS[e.id].score, e.x, e.y - 30, '#fbbf24');
    
    // Track total kills for wave/boss system
    if (!player.totalKills) player.totalKills = 0;
    player.totalKills++;
    player.kills = (player.kills || 0) + 1;
    
    if (typeof checkAchievements === 'function') {
        checkAchievements({
            kills: player.kills,
            killsAdded: 1,
            totalKills: player.totalKills,
            maxStreak: player.bestKillStreak || player.killStreak,
            streak: player.killStreak,
            score
        });
    }
    
    enemies.splice(index, 1);
    
    // Rebalance surround sectors when an enemy dies
    // This ensures remaining enemies redistribute to cover all directions
    rebalanceSurroundSectors();
    
    // Apply explosion damage to nearby entities (5% of target max HP)
    // Damage nearby enemies with percentage-based damage
    enemies.forEach(enemy => {
        const dist = Math.hypot(enemy.x - explosionX, enemy.y - explosionY);
        if (dist < explosionRadius && dist > 0) {
            if (enemyHasSpawnShield(enemy)) return;
            // Chain explosion immunity - don't damage enemies that were recently hit by explosion
            if (enemy.chainExplosionImmune && enemy.chainExplosionImmune > 0) return;
            
            const damageFalloff = 1 - (dist / explosionRadius);
            // Calculate 5% of target's max HP as damage
            const targetMaxHp = enemy.maxHp || ENEMY_TIERS[enemy.id]?.hp || 100;
            let damage = targetMaxHp * explosionDamagePercent * damageFalloff;
            // Check magic shield first - absorbs explosion damage
            damage = handleMagicShieldDamage(enemy, damage);
            enemy.hp -= damage;
            enemy.hitFlash = 8;
            // Grant brief immunity to prevent chain kills
            enemy.chainExplosionImmune = 30; // 0.5 second immunity
            // Push enemies away from explosion
            const pushAngle = Math.atan2(enemy.y - explosionY, enemy.x - explosionX);
            enemy.x += Math.cos(pushAngle) * 10 * damageFalloff;
            enemy.y += Math.sin(pushAngle) * 10 * damageFalloff;
        }
    });
    
    // Damage nearby walls (also percentage-based, ~5% of wall HP)
    for (let i = walls.length - 1; i >= 0; i--) {
        const w = walls[i];
        const centerX = w.x + w.w / 2;
        const centerY = w.y + w.h / 2;
        const dist = Math.hypot(centerX - explosionX, centerY - explosionY);
        if (dist < explosionRadius && w.destructible) {
            const damageFalloff = 1 - (dist / explosionRadius);
            const wallMaxHp = w.maxHp || 100;
            const damage = wallMaxHp * explosionDamagePercent * damageFalloff;
            w.hp -= damage;
            if (w.hp <= 0) {
                createExplosion(centerX, centerY, '#555');
                score += 10;
                walls.splice(i, 1);
            }
        }
    }
    
    // Damage nearby crates (also percentage-based, ~5% of crate HP)
    for (let i = crates.length - 1; i >= 0; i--) {
        const c = crates[i];
        const centerX = c.x + c.w / 2;
        const centerY = c.y + c.h / 2;
        const dist = Math.hypot(centerX - explosionX, centerY - explosionY);
        if (dist < explosionRadius) {
            const damageFalloff = 1 - (dist / explosionRadius);
            const crateMaxHp = c.maxHp || 50;
            const damage = crateMaxHp * explosionDamagePercent * damageFalloff;
            c.hp -= damage;
            if (c.hp <= 0) destroyCrate(c, i);
        }
    }
}

function killBoss() {
    if (!boss) return;
    
    const bossX = boss.x;
    const bossY = boss.y;
    const bossRadius = boss.radius;
    
    // EPIC 5-stage boss death sequence
    
    // Stage 1: Internal meltdown - core destabilization
    for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * bossRadius * 0.5;
        particles.push({
            x: bossX + Math.cos(angle) * dist,
            y: bossY + Math.sin(angle) * dist,
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 0.5) * 3,
            life: 40 + Math.random() * 20,
            color: '#ffffff',
            size: 8 + Math.random() * 6,
            particleId: ++particleIdCounter
        });
    }
    
    // Stage 2-4: Multi-wave explosions (delayed)
    for (let wave = 0; wave < 4; wave++) {
        setTimeout(() => {
            // Core explosion blast
            for (let i = 0; i < 80; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 6 + Math.random() * 12;
                const colors = ['#a855f7', '#ef4444', '#f97316', '#ffffff', '#facc15'];
                particles.push({
                    x: bossX + (Math.random() - 0.5) * 60,
                    y: bossY + (Math.random() - 0.5) * 60,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 80 + Math.random() * 50,
                    color: colors[i % colors.length],
                    size: Math.random() * 12 + 6,
                    gravity: wave * 0.03,
                    drag: 0.03,
                    particleId: ++particleIdCounter
                });
            }
            
            // Massive shockwave per wave
            particles.push({ 
                x: bossX, 
                y: bossY, 
                size: 150 + wave * 80, 
                life: 50, 
                color: wave % 2 === 0 ? 'rgba(168,85,247,0.6)' : 'rgba(239,68,68,0.5)', 
                type: 'wave',
                particleId: ++particleIdCounter
            });
            
            screenShake = Math.max(screenShake, 20 + wave * 5);
        }, wave * 200);
    }
    
    // Stage 5: Final cataclysmic explosion (delayed)
    setTimeout(() => {
        // Turret debris flying off
        for (let i = 0; i < 7; i++) {
            const turretAngle = (Math.PI * 2 / 7) * i;
            const turretColor = BOSS_CONFIG.turrets[i]?.color || '#666';
            
            for (let j = 0; j < 15; j++) {
                const spreadAngle = turretAngle + (Math.random() - 0.5) * 0.8;
                const speed = 10 + Math.random() * 8;
                particles.push({
                    x: bossX + Math.cos(turretAngle) * bossRadius * 0.8,
                    y: bossY + Math.sin(turretAngle) * bossRadius * 0.8,
                    vx: Math.cos(spreadAngle) * speed,
                    vy: Math.sin(spreadAngle) * speed - 3,
                    life: 120 + Math.random() * 60,
                    color: j % 2 === 0 ? turretColor : '#333',
                    size: 4 + Math.random() * 6,
                    gravity: 0.15,
                    drag: 0.02,
                    particleId: ++particleIdCounter
                });
            }
        }
        
        // Final white flash
        for (let i = 0; i < 50; i++) {
            const angle = Math.random() * Math.PI * 2;
            particles.push({
                x: bossX,
                y: bossY,
                vx: Math.cos(angle) * 15,
                vy: Math.sin(angle) * 15,
                life: 30,
                color: '#ffffff',
                size: 10 + Math.random() * 8,
                particleId: ++particleIdCounter
            });
        }
        
        screenShake = 40;
    }, 800);
    
    // Heavy debris field - metal chunks
    for (let i = 0; i < 100; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 14;
        particles.push({
            x: bossX,
            y: bossY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 5,
            life: 150 + Math.random() * 80,
            color: i % 3 === 0 ? '#1a1a1a' : (i % 3 === 1 ? '#444444' : '#666666'),
            size: Math.random() * 10 + 3,
            gravity: 0.2,
            drag: 0.015,
            particleId: ++particleIdCounter
        });
    }
    
    // Boss loot: guaranteed 8-12 high-tier drops
    setTimeout(() => {
        const lootCount = 8 + Math.floor(Math.random() * 5);
        for (let i = 0; i < lootCount; i++) {
            const dropAngle = Math.random() * Math.PI * 2;
            const dropDist = 50 + Math.random() * 100;
            spawnDrop(
                bossX + Math.cos(dropAngle) * dropDist, 
                bossY + Math.sin(dropAngle) * dropDist, 
                true // High tier
            );
        }
    }, 500);
    
    // OMEGA DESTROYER massive score reward
    const bossReward = BOSS_CONFIG.score || 10000;
    score += bossReward;
    
    // Delayed victory messages
    setTimeout(() => {
        addFloatText('OMEGA DESTROYED!', bossX, bossY - 60, '#a855f7');
    }, 300);
    
    setTimeout(() => {
        addFloatText('+' + bossReward + ' POINTS', bossX, bossY - 100, '#facc15');
    }, 600);
    
    if (typeof checkAchievements === 'function') {
        checkAchievements({ bossKilled: true, score });
    }
    
    boss = null;
    bossActive = false;
    bossSpawned = false;
    bossDefeated = true;
    finalWaveTriggered = false;
    finalWaveEscortTimer = 0;
    screenShake = 35;
    
    // DESTROY ALL REMAINING ENEMIES when boss is defeated
    // Each enemy explodes with particles for dramatic effect
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        
        // Create explosion for each enemy
        for (let j = 0; j < 20; j++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 6;
            particles.push({
                x: e.x,
                y: e.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 40 + Math.random() * 30,
                color: j % 3 === 0 ? '#ff6b35' : (j % 3 === 1 ? '#f7931e' : '#ffcc00'),
                size: 4 + Math.random() * 6,
                gravity: 0.1,
                drag: 0.02,
                particleId: ++particleIdCounter
            });
        }
        
        // Add shockwave for each enemy
        particles.push({ 
            x: e.x, 
            y: e.y, 
            size: 60, 
            life: 25, 
            color: 'rgba(255, 150, 0, 0.5)', 
            type: 'wave',
            particleId: ++particleIdCounter
        });
        
        // Add score for each killed enemy
        const tierScore = (e.id + 1) * 50;
        score += tierScore;
        addFloatText('+' + tierScore, e.x, e.y - 30, '#facc15');
    }
    
    // Clear all enemies
    enemies = [];
    
    // Victory message
    setTimeout(() => {
        addFloatText('🏆 VICTORY! 🏆', player.x, player.y - 100, '#ffff00');
        addFloatText('You have conquered all waves!', player.x, player.y - 60, '#22c55e');
    }, 1500);
    
    // ===================== VICTORY TELEPORT ANIMATION =====================
    // Player teleports out with dramatic beam effect before victory screen
    // Timeline: Boss dies -> 2000ms wait -> Start teleport -> Animation completes (frame-based) -> Delay -> Victory screen
    setTimeout(() => {
        // Start teleport out animation
        player.victoryTeleporting = true;
        player.victoryTeleportPhase = 0;
        player.victoryTeleportComplete = false; // Flag to track when animation is fully done
        
        // Dramatic teleport particles - gathering energy
        for (let i = 0; i < 40; i++) {
            const angle = (Math.PI * 2 / 40) * i;
            const dist = 100 + Math.random() * 50;
            setTimeout(() => {
                if (typeof particles !== 'undefined') {
                    particles.push({
                        id: particleIdCounter++,
                        x: player.x + Math.cos(angle) * dist,
                        y: player.y + Math.sin(angle) * dist,
                        vx: -Math.cos(angle) * (8 + Math.random() * 4),
                        vy: -Math.sin(angle) * (8 + Math.random() * 4),
                        life: 40,
                        color: i % 3 === 0 ? '#ffd700' : (i % 2 === 0 ? '#ffffff' : '#22c55e'),
                        size: 4 + Math.random() * 4
                    });
                }
            }, i * 20);
        }
        
        // Rising beam particles
        setTimeout(() => {
            for (let i = 0; i < 60; i++) {
                setTimeout(() => {
                    if (typeof particles !== 'undefined') {
                        particles.push({
                            id: particleIdCounter++,
                            x: player.x + (Math.random() - 0.5) * 30,
                            y: player.y + 20,
                            vx: (Math.random() - 0.5) * 2,
                            vy: -15 - Math.random() * 10,
                            life: 60,
                            color: i % 3 === 0 ? '#ffffff' : (i % 2 === 0 ? '#ffd700' : '#22c55e'),
                            size: 3 + Math.random() * 4
                        });
                    }
                }, i * 15);
            }
        }, 500);
    }, 2000);
    
    // NOTE: Victory screen is now triggered from gameplay.js when victoryTeleportPhase >= 1
    // This ensures the animation is actually complete before showing the screen
}

// Show victory screen when boss is defeated
function showVictoryScreen() {
    // Stop the game loop
    state = 'VICTORY';
    
    // CRITICAL: Save score to localStorage BEFORE clearing save game
    // This ensures victory score appears on homepage
    localStorage.setItem('tankLastScore', score.toString());
    const highScore = parseInt(localStorage.getItem('tankHighestScore') || '0');
    const isNewHighScore = score > highScore;
    if (isNewHighScore) {
        localStorage.setItem('tankHighestScore', score.toString());
    }
    
    // Clear save game since the game is won
    if (typeof clearSaveGame === 'function') {
        clearSaveGame();
    }
    
    // Update victory screen with final stats
    const victoryScoreEl = document.getElementById('victory-score');
    const victoryTimeEl = document.getElementById('victory-time');
    const victoryHighScoreEl = document.getElementById('victory-highscore');
    
    if (victoryScoreEl) {
        victoryScoreEl.textContent = score.toLocaleString();
        // Add new high score indicator
        if (isNewHighScore) {
            victoryScoreEl.innerHTML = score.toLocaleString() + ' <span style="color:#ffd700;font-size:0.7em;display:block;">★ NEW RECORD!</span>';
        }
    }
    
    if (victoryTimeEl) {
        // gameTime is stored in seconds (incremented by dt/60 per frame)
        const totalSeconds = Math.floor(gameTime);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        victoryTimeEl.textContent = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    }
    
    // Show high score comparison if element exists
    if (victoryHighScoreEl) {
        victoryHighScoreEl.textContent = 'HIGH SCORE: ' + Math.max(score, highScore).toLocaleString();
    }
    
    // Hide game UI elements
    document.getElementById('gameCanvas').classList.remove('active');
    document.getElementById('ui-layer').classList.remove('active');
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    
    // Play victory music
    if (typeof MusicManager !== 'undefined') {
        MusicManager.play('victory');
    }
    
    // Show victory screen with dramatic entrance
    const victoryScreen = document.getElementById('victory-screen');
    victoryScreen.classList.remove('hidden');
    victoryScreen.classList.remove('exit-to-home');
    
    console.log('Victory screen displayed! Final score:', score, isNewHighScore ? '(NEW HIGH SCORE!)' : '');
}

// Boss spawn warns players via HUD element while picking a position near player
function startBossFight(options = {}) {
    const { finalWave = false } = options || {};
    bossSpawned = true;
    bossActive = true;
    if (finalWave) {
        finalWaveTriggered = true;
    }
    
    // Spawn boss CLOSE to player (200-300 distance) for dramatic encounter
    // But ensure boss doesn't spawn inside walls or crates
    const spawnDistance = 200 + Math.random() * 100;
    let pos = null;
    let attempts = 0;
    const maxAttempts = 30;
    
    while (!pos && attempts < maxAttempts) {
        attempts++;
        const spawnAngle = Math.random() * Math.PI * 2;
        const testX = Math.max(200, Math.min(WORLD_W - 200, player.x + Math.cos(spawnAngle) * spawnDistance));
        const testY = Math.max(200, Math.min(WORLD_H - 200, player.y + Math.sin(spawnAngle) * spawnDistance));
        
        // Check if position is valid (not inside wall or crate)
        let blocked = false;
        const bossRadius = BOSS_CONFIG.radius || 80;
        
        for (const w of walls) {
            if (testX > w.x - bossRadius && testX < w.x + w.w + bossRadius &&
                testY > w.y - bossRadius && testY < w.y + w.h + bossRadius) {
                blocked = true;
                break;
            }
        }
        
        if (!blocked) {
            for (const c of crates) {
                if (testX > c.x - bossRadius && testX < c.x + c.w + bossRadius &&
                    testY > c.y - bossRadius && testY < c.y + c.h + bossRadius) {
                    blocked = true;
                    break;
                }
            }
        }
        
        if (!blocked) {
            pos = { x: testX, y: testY };
        }
    }
    
    // Fallback to center of map if no valid position found
    if (!pos) {
        pos = { x: WORLD_W / 2, y: WORLD_H / 2 };
    }
    
    // Create OMEGA DESTROYER boss with sequential turret system
    boss = {
        x: pos.x,
        y: pos.y,
        radius: BOSS_CONFIG.radius,
        hp: BOSS_CONFIG.hp,
        maxHp: BOSS_CONFIG.maxHp,
        speed: BOSS_CONFIG.speed,
        state: 'sleeping', // Boss starts sleeping!
        timer: 120,
        angle: 0, // Body rotation angle
        rotationSpeed: BOSS_CONFIG.rotationSpeed,
        turrets: [],
        // NEW: Radial crack system - cracks emanate from center
        // No longer uses hit positions - cracks are generated based on damage percentage
        crackCount: 0, // Number of cracks to display (based on damage)
        crackSeeds: [], // Stable random seeds for each crack
        maxCracks: 24, // Maximum number of radial cracks
        // METEOR SPAWN ANIMATION - Boss descends from sky like meteor
        // FIXED: Extended duration (4 seconds) and boss fades in FIRST before meteor fades
        meteorSpawnActive: true,
        meteorSpawnTimer: 240, // 4 second animation for longer boss reveal
        meteorSpawnPhase: 0, // 0=descending, 1=impact, 2=settling
        meteorScale: 0.1, // Start small (coming from sky)
        meteorHeight: 500, // Visual height offset
        meteorOpacity: 0, // Start fully transparent for smooth fade-in
        meteorBlur: 25, // Start with heavy blur, ease to 0
        meteorFireOpacity: 1, // Meteor fire effect opacity (fades as boss appears)
        phase: 1, // Boss has 3 phases based on HP
        // Damage tracking for ultimate trigger
        recentDamage: [],
        escortSpawnTimer: BOSS_CONFIG.escortRespawnDelay || 420,
        // Sequential turret system - only one turret active at a time
        activeTurretIndex: 0, // Current active turret (0-6)
        turretEnergy: BOSS_CONFIG.turretEnergy, // Energy for current turret
        turretMaxEnergy: BOSS_CONFIG.turretEnergy,
        turretSwitchCooldown: 0, // Cooldown when switching turrets
        turretFireCooldown: 0, // Cooldown between shots
        // Ultimate ability state
        ultimateState: 'ready',
        ultimateCooldown: BOSS_CONFIG.ultimate.cooldown || 1200, // Start with full cooldown - ultimate must recharge first
        ultimateCharge: 0,
        ultimateBeamAngle: 0,
        ultimateBeamTimer: 0,
        ultimateBeamLength: 0,
        // Sleep state
        isSleeping: true,
        sleepDamageThreshold: BOSS_CONFIG.sleepWakeThreshold || 500, // Damage needed to wake up
        accumulatedDamage: 0, // Damage taken while sleeping
        awakeningPhase: 0, // 0=sleeping, 1=awakening animation, 2=ultimate first, 3=awake
        awakeningTimer: 0
    };
    
    // Initialize 7 unique turrets around the boss with individual energy
    for (let i = 0; i < BOSS_CONFIG.turretCount; i++) {
        const turretConfig = BOSS_CONFIG.turrets[i];
        const maxEnergy = BOSS_CONFIG.turretEnergy || 100;
        // Initial turret angle is boss angle + offset (world angle for proper aiming)
        const initialWorldAngle = boss.angle + turretConfig.angleOffset;
        boss.turrets.push({
            name: turretConfig.name,
            angleOffset: turretConfig.angleOffset,
            weapon: turretConfig.weapon,
            turretAngle: initialWorldAngle, // Initial turret direction (world angle)
            targetTurretAngle: initialWorldAngle, // Target angle for smooth rotation
            fireInterval: turretConfig.fireInterval,
            burst: turretConfig.burst,
            energyCost: turretConfig.energyCost,
            switchCooldown: turretConfig.switchCooldown,
            shape: turretConfig.shape,
            color: turretConfig.color,
            glowColor: turretConfig.glowColor,
            isActive: i === 0, // First turret starts active
            // Individual energy system per turret
            energy: maxEnergy,
            maxEnergy: maxEnergy,
            rechargeRate: 0.3, // Energy recharged per frame when inactive
            isRecharging: false,
            // Visual recoil/kickback system
            kickbackOffset: 0, // Current kickback amount (decays over time)
            lastFired: 0 // Frame when turret last fired
        });
    }
    
    // Dramatic boss entrance effects (sleeping appearance)
    screenShake = 15; // Less shake for sleeping boss
    
    // Dark entrance particles (sleeping boss)
    for (let i = 0; i < 25; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 5;
        particles.push({
            x: pos.x,
            y: pos.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 60 + Math.random() * 30,
            color: i % 2 === 0 ? '#1a1a2e' : '#2d1f4e',
            size: 5 + Math.random() * 8,
            particleId: ++particleIdCounter
        });
    }
    
    // Dark aura wave (sleeping)
    particles.push({
        x: pos.x,
        y: pos.y,
        size: 150,
        life: 50,
        color: 'rgba(30, 20, 50, 0.7)',
        type: 'wave',
        particleId: ++particleIdCounter
    });
    
    // Boss warning UI (sleeping message) - dramatic entrance with smooth continuous blinking
    const bossWarning = document.getElementById('boss-warning');
    
    // Clear any previous animations and reset state
    bossWarning.classList.remove('active');
    bossWarning.style.setProperty('opacity', '0', 'important');
    
    // Force reflow to reset animation state
    void bossWarning.offsetWidth;
    
    // Add active class for pulse effect
    bossWarning.classList.add('active');
    
    // Smooth continuous blinking animation using sine wave
    // Total duration: 4 seconds (fade in + blink + fade out)
    const totalDuration = 4000; // 4 seconds total
    const startTime = performance.now();
    let animationRunning = true;
    
    function animateBossWarning(timestamp) {
        if (!animationRunning) return;
        
        const elapsed = timestamp - startTime;
        const progress = elapsed / totalDuration;
        
        if (progress >= 1) {
            // Animation complete
            bossWarning.classList.remove('active');
            bossWarning.style.setProperty('opacity', '0', 'important');
            animationRunning = false;
            return;
        }
        
        // Calculate envelope (fade in at start, fade out at end)
        let envelope;
        if (progress < 0.15) {
            // Fade in (first 15%)
            envelope = progress / 0.15;
        } else if (progress > 0.85) {
            // Fade out (last 15%)
            envelope = (1 - progress) / 0.15;
        } else {
            // Full visibility
            envelope = 1;
        }
        
        // Smooth blinking using sine wave (blinks faster in middle)
        const blinkSpeed = 6; // Number of full blink cycles
        const blinkWave = 0.5 + 0.5 * Math.sin(progress * blinkSpeed * Math.PI * 2);
        
        // Combine envelope with blink (blink between 0.4 and 1.0 opacity)
        const baseOpacity = 0.4 + blinkWave * 0.6;
        const finalOpacity = envelope * baseOpacity;
        
        bossWarning.style.setProperty('opacity', String(finalOpacity), 'important');
        requestAnimationFrame(animateBossWarning);
    }
    
    requestAnimationFrame(animateBossWarning);
    
    // Float text announcement (sleeping)
    addFloatText('OMEGA DESTROYER', pos.x, pos.y - 150, '#4a3670');
    addFloatText('DORMANT...', pos.x, pos.y - 100, '#6b5b95');
}

function takeDamage(dmg) {
    // DEBUG MODE: Skip all damage when unlimited HP is enabled
    if (DEBUG_UNLIMITED_HP) {
        return; // God mode - no damage taken
    }
    
    if (player.spawnWarmup > 0) {
        return;
    }
    if (player.shieldTime > 0) return;
    player.tookDamageThisWave = true;
    
    // Taking damage increases temperature (impact heating)
    // Higher damage = more heat (simulates system stress from damage)
    const heatFromDamage = Math.min(dmg * 0.5, 15); // 8-15°C depending on damage
    // Skip temperature increase if debug mode is active
    if (!DEBUG_NO_TEMPERATURE) {
        player.temperature = Math.min(100, player.temperature + heatFromDamage);
    }
    
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
                id: particleIdCounter++,
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

function addFloatText(t, x, y, c, isCritical = false) {
    // === PERFORMANCE: Enforce floating text limit based on graphics settings ===
    // Get maximum allowed floating texts from graphics settings
    const maxFloatTexts = typeof getFloatTextMax === 'function' ? getFloatTextMax() : 50;
    
    // === PERFORMANCE: First pass - remove any dead texts to make room ===
    // This is more efficient than splice in a loop
    if (floatText.length >= maxFloatTexts) {
        let writeIdx = 0;
        for (let readIdx = 0; readIdx < floatText.length; readIdx++) {
            if (floatText[readIdx].life > 0) {
                if (writeIdx !== readIdx) {
                    floatText[writeIdx] = floatText[readIdx];
                }
                writeIdx++;
            }
        }
        floatText.length = writeIdx;
    }
    
    // If still at limit after cleanup, remove oldest non-critical text
    if (floatText.length >= maxFloatTexts) {
        // Find oldest non-critical text to remove
        let oldestIdx = -1;
        let lowestLife = Infinity;
        
        for (let i = 0; i < floatText.length; i++) {
            // Skip critical texts if possible
            if (!floatText[i].isCritical && floatText[i].life < lowestLife) {
                lowestLife = floatText[i].life;
                oldestIdx = i;
            }
        }
        
        // If all are critical, remove the oldest one anyway
        if (oldestIdx === -1) {
            oldestIdx = 0;
            for (let i = 1; i < floatText.length; i++) {
                if (floatText[i].life < floatText[oldestIdx].life) {
                    oldestIdx = i;
                }
            }
        }
        
        // Use efficient removal by swapping with last element
        if (oldestIdx !== -1 && oldestIdx < floatText.length) {
            floatText[oldestIdx] = floatText[floatText.length - 1];
            floatText.length--;
        }
    }
    
    // Check for exact duplicate text nearby - prevent double display
    // But allow different texts at same location (stacking)
    for (let f of floatText) {
        if (f.text === t && f.life > 60) { // Same text still active
            const dx = f.x - x;
            const dy = f.initialY - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 80) { // Within 80px range - same exact text
                return; // Don't add duplicate of same text
            }
        }
    }
    
    // === SMART AUTO-STACKING SYSTEM ===
    // Intelligently positions texts to NEVER overlap
    // Checks all existing active texts and finds optimal position
    let offsetY = 0;
    const stackRadius = 100; // Larger radius for better overlap detection
    const stackSpacing = 24; // Vertical spacing between stacked texts
    const textHeight = isCritical ? 20 : 16; // Estimated text height
    
    // Collect all nearby active texts and their Y positions
    const nearbyTexts = [];
    for (let f of floatText) {
        const dx = f.x - x;
        const dist = Math.abs(dx);
        
        // Check if horizontally close enough to potentially overlap
        if (dist < stackRadius && f.life > 20) {
            nearbyTexts.push({
                y: f.y,
                initialY: f.initialY,
                height: f.isCritical ? 20 : 16
            });
        }
    }
    
    // Find optimal Y position that doesn't overlap any existing text
    let targetY = y;
    let foundClear = false;
    const maxAttempts = 10;
    
    for (let attempt = 0; attempt < maxAttempts && !foundClear; attempt++) {
        foundClear = true;
        const testY = y - (attempt * stackSpacing);
        
        for (const existing of nearbyTexts) {
            // Check if this position would overlap with existing text
            const vertDist = Math.abs(testY - existing.y);
            if (vertDist < stackSpacing) {
                foundClear = false;
                break;
            }
        }
        
        if (foundClear) {
            targetY = testY;
            offsetY = testY - y;
        }
    }
    
    // If still overlapping after max attempts, use stack count method
    if (!foundClear) {
        offsetY = -nearbyTexts.length * stackSpacing;
    }
    
    // Determine text lifetime and scale based on type
    const isBossEffect = t.includes('CURSED') || t.includes('OMEGA') || t.includes('BURNED');
    const isMagicSkill = ['MAGIC SHIELD', 'ICE BURST', 'FIRE NOVA', 'CHAIN LIGHTNING', 'BLINK'].some(s => t.includes(s));
    // Note: Use exact match or with ! suffix to distinguish player ultimate from boss turret names
    const isPlayerUltimate = t === 'DEVASTATOR!' || t.includes('SHOCKWAVE!') || 
                             t.includes('BERSERKER MODE') || t.includes('CLONE ARMY') || 
                             t.includes('ULTIMATE UPGRADED') || t.includes('ALLIES DEPLOYED');
    
    // Enhanced lifetimes for dramatic effects
    let textLife = 80; // Default
    if (isCritical) textLife = 140; // Critical hits last longer
    else if (isPlayerUltimate) textLife = 130; // Ultimate skills
    else if (isMagicSkill) textLife = 110; // Magic skills
    else if (isBossEffect) textLife = 120; // Boss effects
    
    // Enhanced scale for dramatic effects
    let textScale = 1.0;
    if (isCritical) textScale = 1.5; // Critical is BIG
    else if (isPlayerUltimate) textScale = 1.4; // Ultimate is impressive
    else if (isMagicSkill) textScale = 1.2; // Magic skills noticeable
    else if (isBossEffect) textScale = 1.1; // Boss effects threatening
    
    floatText.push({ 
        text: t, 
        x: x + (Math.random() - 0.5) * 6, // Slight horizontal spread
        y: y + offsetY, 
        initialY: y, // Store original Y for stacking calculations
        color: c, 
        life: textLife,
        maxLife: textLife,
        isCritical: isCritical, // Flag for special rendering
        scale: textScale
    });
}
