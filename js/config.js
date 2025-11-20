// --- CONFIG ---
// Global configuration wires up canvas references plus world bounds so other
// modules can import them without re-querying the DOM every frame.
const WORLD_W = 10000; // Expanded Battlefield Size
const WORLD_H = 10000;
const CANVAS = document.getElementById('gameCanvas');
const CTX = CANVAS.getContext('2d', { alpha: false });
const MINI_CANVAS = document.getElementById('minimap');
const MINI_CTX = MINI_CANVAS.getContext('2d');
const ENEMY_WALL_PADDING = 14;

// --- STATE ---
// Runtime state keeps loose globals centralized so gameplay.js can drive the
// loop without juggling dozens of parameters.
let state = 'MENU';
let paused = false;
let frame = 0;
let score = 0;
let camX = 0;
let camY = 0;
let screenShake = 0;
let bossActive = false;
let bossSpawned = false;
let animationId = null;
let lastTime = 0;
let spawnDelay = 0;
let mouseAim = { active: false, x: 0, y: 0, down: false };
let deathSequence = { active: false, timer: 0, missionTriggered: false, stamp: 0 };

// Tank tracks (dirty trails)
const playerTracks = []; // Darker, more visible player tracks
const enemyTracks = [];  // Lighter enemy tracks

// --- INPUT STATE ---
const input = {
    move: { active: false, x: 0, y: 0, angle: 0, mag: 0 },
    aim: { active: false, x: 0, y: 0, angle: 0, mag: 0 }
};

// --- KEYBOARD ---
const keys = { w: false, a: false, s: false, d: false, up: false, down: false, left: false, right: false };

// --- ENEMY TIERS ---
// Enemy tiers describe color palette plus combat stats so spawners can scale
// difficulty as the score climbs.
const ENEMY_TIERS = [
    { id: 0, color: '#facc15', accent: '#ca8a04', hp: 120, speed: 1.8, err: 0.35, accuracy: 0.6, cd: 140, score: 50, weapon: 'cannon', aimSpeed: 0.08, intelligence: 1 },
    { id: 1, color: '#fb923c', accent: '#ea580c', hp: 180, speed: 2.2, err: 0.18, accuracy: 0.7, cd: 110, score: 100, weapon: 'twin', aimSpeed: 0.10, intelligence: 2 },
    { id: 2, color: '#f472b6', accent: '#db2777', hp: 250, speed: 2.6, err: 0.08, accuracy: 0.82, cd: 90, score: 200, weapon: 'shotgun', aimSpeed: 0.12, intelligence: 3 },
    { id: 3, color: '#ef4444', accent: '#b91c1c', hp: 400, speed: 3.0, err: 0.04, accuracy: 0.9, cd: 70, score: 350, weapon: 'burst', aimSpeed: 0.15, intelligence: 4 },
    { id: 4, color: '#a855f7', accent: '#7e22ce', hp: 650, speed: 3.2, err: 0.015, accuracy: 0.96, cd: 50, score: 600, weapon: 'laser', aimSpeed: 0.18, intelligence: 5 }
];

// --- PLAYER ---
// The player object doubles as a state machine for movement, resources, and
// super ability timers. Values are mutated directly for speed.
const player = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 22,
    angle: 0,
    turretAngle: 0,
    hp: 200,
    maxHp: 200,
    armor: 0,
    maxArmor: 100,
    revives: 1,
    maxRevives: 5,
    energy: 100,
    maxEnergy: 100,
    energyRegen: 1.2,
    energyRegenDelay: 0,
    energyRegenDelayMax: 90,
    overheated: false,
    killStreak: 0,
    maxStreak: 10,
    ultReady: false,
    isUlting: false,
    ultTimer: 0,
    firedUlt: false,
    ultBeamTime: 0,
    ultBeamAngle: 0,
    weapon: 'cannon',
    speedBase: 4.5,
    buffTime: 0,
    recoil: 0,
    shieldTime: 0
};

// --- WEAPONS ---
// Weapon presets keep UI labels, energy cost, projectile type, and visuals
// together. Gameplay swaps weapon keys without needing conditional branches.
const WEAPONS = {
    cannon: { name: 'CANNON', short: 'CN', cost: 3, delay: 25, speed: 18, color: '#ffaa00', type: 'single', dmg: 9, laser: false, rarity: 1, playerAccuracy: 0.98, enemyAccuracy: 0.78, spread: 0.12, recoil: 8 },
    twin: { name: 'TWIN CANNON', short: 'TW', cost: 7, delay: 20, speed: 18, color: '#00ffaa', type: 'twin', dmg: 12, laser: false, rarity: 2, playerAccuracy: 0.96, enemyAccuracy: 0.82, spread: 0.1, recoil: 6 },
    shotgun: { name: 'SCATTER GUN', short: 'SG', cost: 14, delay: 40, speed: 14, color: '#ff00ff', type: 'spread', dmg: 11, laser: false, rarity: 2, playerAccuracy: 0.9, enemyAccuracy: 0.75, spread: 0.25, recoil: 11 },
    sniper: { name: 'RAILGUN', short: 'RG', cost: 22, delay: 50, speed: 45, color: '#ffffff', type: 'sniper', dmg: 95, laser: true, rarity: 3, playerAccuracy: 0.995, enemyAccuracy: 0.9, spread: 0.035, recoil: 15 },
    burst: { name: 'BURST RIFLE', short: 'BR', cost: 15, delay: 18, speed: 22, color: '#fbbf24', type: 'burst', dmg: 22, laser: true, rarity: 3, playerAccuracy: 0.96, enemyAccuracy: 0.85, spread: 0.09, recoil: 7 },
    flak: { name: 'FLAK CANNON', short: 'FK', cost: 15, delay: 35, speed: 16, color: '#fb923c', type: 'flak', dmg: 70, laser: false, rarity: 3, playerAccuracy: 0.9, enemyAccuracy: 0.78, spread: 0.2, recoil: 13 },
    rocket: { name: 'ROCKET LAUNCHER', short: 'RL', cost: 32, delay: 45, speed: 12, color: '#ff3333', type: 'aoe', dmg: 200, laser: true, rarity: 4, playerAccuracy: 0.93, enemyAccuracy: 0.82, spread: 0.15, recoil: 14 },
    laser: { name: 'PLASMA BEAM', short: 'PB', cost: 6, delay: 4, speed: 35, color: '#00ffff', type: 'rapid', dmg: 32, laser: true, rarity: 4, playerAccuracy: 0.99, enemyAccuracy: 0.9, spread: 0.05, recoil: 4 },
    gauss: { name: 'GAUSS RIFLE', short: 'GS', cost: 34, delay: 20, speed: 50, color: '#a78bfa', type: 'pierce', dmg: 220, laser: true, rarity: 5, playerAccuracy: 0.995, enemyAccuracy: 0.92, spread: 0.025, recoil: 18 }
};
let lastShot = 0;

// --- ENTITIES ---
// Collections track every dynamic entity in the arena. Having them here keeps
// reference sharing simple across modules.
let walls = [];
let enemies = [];
let boss = null;
let bullets = [];
let particles = [];
let pickups = [];
let crates = [];
let floatText = [];

// Shared helper applies per-weapon accuracy to both player and enemy shots so
// bullets always originate from the turret yet still have a chance to miss.
function applyWeaponAccuracy(baseAngle, weaponKey, isEnemy, tierAccuracy = 1) {
    const weapon = WEAPONS[weaponKey] || {};
    const weaponAccuracy = isEnemy ? (weapon.enemyAccuracy ?? weapon.playerAccuracy ?? 1) : (weapon.playerAccuracy ?? weapon.enemyAccuracy ?? 1);
    const finalAccuracy = Math.min(1, Math.max(0, weaponAccuracy * tierAccuracy));
    const missChance = 1 - finalAccuracy;
    if (missChance <= 0) return baseAngle;
    const shouldMiss = Math.random() < missChance;
    if (!shouldMiss) return baseAngle;
    const spread = weapon.spread ?? 0.1;
    const deviation = (Math.random() - 0.5) * spread * 2;
    return baseAngle + deviation;
}
