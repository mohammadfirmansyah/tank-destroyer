const ACHIEVEMENTS = [
    {
        id: 'first_blood',
        title: 'Tank Hunter',
        description: 'Destroy enemy armor to climb from Scout to Executioner.',
        icon: '🩸',
        metric: (stats) => stats.kills || 0,
        tiers: [
            { threshold: 1, name: 'Scout' },
            { threshold: 25, name: 'Predator' },
            { threshold: 60, name: 'Executioner' }
        ]
    },
    {
        id: 'wave_survivor',
        title: 'Wave Survivor',
        description: 'Chain wave clears without falling to earn command ranks.',
        icon: '🌊',
        metric: (stats) => stats.waveStreak || 0,
        tiers: [
            { threshold: 5, name: 'Veteran' },
            { threshold: 10, name: 'Guardian' },
            { threshold: 20, name: 'Mythic' }
        ]
    },
    {
        id: 'sharpshooter',
        title: 'Sharpshooter',
        description: 'Maintain brutal kill streaks to prove absolute accuracy.',
        icon: '🎯',
        metric: (stats) => stats.maxStreak || 0,
        tiers: [
            { threshold: 20, name: 'Marksman' },
            { threshold: 40, name: 'Deadeye' },
            { threshold: 75, name: 'Mythic Shot' }
        ]
    },
    {
        id: 'tank_buster',
        title: 'Armored Blitz',
        description: 'Track lifetime tank kills across every deployment.',
        icon: '💥',
        metric: (stats) => stats.totalKills || 0,
        tiers: [
            { threshold: 100, name: 'Demolisher' },
            { threshold: 500, name: 'Siegebreaker' },
            { threshold: 1500, name: 'Armageddon' }
        ]
    },
    {
        id: 'untouchable',
        title: 'Untouchable',
        description: 'Finish waves without taking a scratch.',
        icon: '🛡️',
        metric: (stats) => stats.perfectWaveCount || (stats.perfectWave ? 1 : 0),
        tiers: [
            { threshold: 1, name: 'Pristine' },
            { threshold: 3, name: 'Immaculate' },
            { threshold: 7, name: 'Mythic Shell' }
        ]
    },
    {
        id: 'boss_slayer',
        title: 'Boss Slayer',
        description: 'Bring down the Mothership and end the siege.',
        icon: '☠️',
        metric: (stats) => (stats.bossKilled ? 1 : 0),
        tiers: [
            { threshold: 1, name: 'Mothership Down' }
        ]
    },
    {
        id: 'marathon',
        title: 'Marathon Runner',
        description: 'Stay in the fight for extended operations.',
        icon: '⏱️',
        metric: (stats) => stats.sessionTime || 0,
        tiers: [
            { threshold: 300, name: 'Endurance' },
            { threshold: 600, name: 'Iron Resolve' },
            { threshold: 1200, name: 'Everlasting' }
        ]
    },
    {
        id: 'millionaire',
        title: 'War Millionaire',
        description: 'Stack battlefield rewards into a war chest.',
        icon: '💰',
        metric: (stats) => stats.score || 0,
        tiers: [
            { threshold: 25000, name: 'Quartermaster' },
            { threshold: 50000, name: 'Tycoon' },
            { threshold: 100000, name: 'Legendary Financier' }
        ]
    }
];

const ACHIEVEMENT_MAP = ACHIEVEMENTS.reduce((map, entry) => {
    map[entry.id] = entry;
    return map;
}, {});

function getSafeStorage() {
    try {
        if (typeof localStorage !== 'undefined') return localStorage;
    } catch (err) {
        console.warn('Local storage unavailable, using in-memory fallback for achievements.', err);
    }
    const memory = new Map();
    return {
        getItem: (key) => (memory.has(key) ? memory.get(key) : null),
        setItem: (key, value) => memory.set(key, value),
        removeItem: (key) => memory.delete(key)
    };
}

function safeParseJSON(value, fallback) {
    if (!value) return fallback;
    try {
        const parsed = JSON.parse(value);
        return parsed ?? fallback;
    } catch (err) {
        console.warn('Failed to parse achievement storage payload.', err);
        return fallback;
    }
}

function normalizeUnlockPayload(payload) {
    if (!payload) return {};
    if (Array.isArray(payload)) {
        return payload.reduce((map, id) => {
            map[id] = 1;
            return map;
        }, {});
    }
    if (typeof payload === 'object') {
        const normalized = {};
        Object.entries(payload).forEach(([id, level]) => {
            const achievement = ACHIEVEMENT_MAP[id];
            if (!achievement) return;
            const tierCap = (achievement.tiers?.length) || 1;
            const numericLevel = Math.max(0, Math.floor(level));
            if (numericLevel > 0) normalized[id] = Math.min(numericLevel, tierCap);
        });
        return normalized;
    }
    return {};
}

const achievementStorage = getSafeStorage();
const persistedUnlocks = safeParseJSON(achievementStorage.getItem('tankAchievements'), {});
const persistedTotalKills = parseInt(achievementStorage.getItem('tankTotalKills') || '0', 10) || 0;

let achievementStats = {
    kills: 0,
    totalKills: persistedTotalKills,
    waves: 0,
    waveStreak: 0,
    maxStreak: 0,
    perfectWave: false,
    perfectWaveCount: 0,
    bossKilled: false,
    sessionTime: 0,
    score: 0
};
let achievementLevels = normalizeUnlockPayload(persistedUnlocks);

function persistTotalKills() {
    try {
        achievementStorage.setItem('tankTotalKills', String(achievementStats.totalKills));
    } catch (err) {
        console.warn('Unable to persist total kills progress.', err);
    }
}

function persistUnlocks() {
    try {
        achievementStorage.setItem('tankAchievements', JSON.stringify(achievementLevels));
    } catch (err) {
        console.warn('Unable to persist unlocked achievements.', err);
    }
}

function mergeAchievementStats(updates = {}) {
    if (typeof updates.kills === 'number') {
        achievementStats.kills = Math.max(achievementStats.kills, updates.kills);
    }
    if (typeof updates.killsAdded === 'number' && Number.isFinite(updates.killsAdded)) {
        achievementStats.totalKills += updates.killsAdded;
        persistTotalKills();
    }
    if (typeof updates.totalKills === 'number' && updates.totalKills > achievementStats.totalKills) {
        achievementStats.totalKills = updates.totalKills;
        persistTotalKills();
    }
    if (typeof updates.waves === 'number') {
        achievementStats.waves = Math.max(achievementStats.waves, updates.waves);
    }
    if ('waveStreak' in updates) {
        const streakValue = Math.max(0, updates.waveStreak || 0);
        achievementStats.waveStreak = streakValue;
    }
    if (typeof updates.maxStreak === 'number') {
        achievementStats.maxStreak = Math.max(achievementStats.maxStreak, updates.maxStreak);
    }
    if (typeof updates.streak === 'number') {
        achievementStats.maxStreak = Math.max(achievementStats.maxStreak, updates.streak);
    }
    if (typeof updates.perfectWaveCount === 'number') {
        achievementStats.perfectWaveCount = Math.max(achievementStats.perfectWaveCount, updates.perfectWaveCount);
    } else if (updates.perfectWave) {
        achievementStats.perfectWaveCount = (achievementStats.perfectWaveCount || 0) + 1;
    }
    if (updates.perfectWave) {
        achievementStats.perfectWave = true;
    }
    if (updates.bossKilled) {
        achievementStats.bossKilled = true;
    }
    if (typeof updates.sessionTime === 'number') {
        achievementStats.sessionTime = Math.max(achievementStats.sessionTime, updates.sessionTime);
    }
    if (typeof updates.score === 'number') {
        achievementStats.score = Math.max(achievementStats.score, updates.score);
    }
}

function getAchievementValue(achievement) {
    if (typeof achievement.metric !== 'function') return 0;
    try {
        const value = achievement.metric(achievementStats);
        return Number.isFinite(value) ? value : 0;
    } catch (err) {
        console.warn('Failed to evaluate achievement metric.', err);
        return 0;
    }
}

function checkAchievements(currentStats = {}) {
    if (typeof currentStats !== 'object' || currentStats === null) return;
    mergeAchievementStats(currentStats);

    ACHIEVEMENTS.forEach(ach => {
        const tiers = ach.tiers || [];
        if (!tiers.length) return;
        const value = getAchievementValue(ach);
        const currentLevel = achievementLevels[ach.id] || 0;
        let nextLevel = currentLevel;
        for (let idx = currentLevel; idx < tiers.length; idx++) {
            if (value >= tiers[idx].threshold) nextLevel = idx + 1;
        }
        if (nextLevel > currentLevel) {
            achievementLevels[ach.id] = nextLevel;
            persistUnlocks();
            for (let lvl = currentLevel + 1; lvl <= nextLevel; lvl++) {
                showAchievementPopup(ach, lvl, tiers.length);
            }
        }
    });

    renderAchievementsPage();
}

function showAchievementPopup(achievement, level = 1, maxLevel = 1) {
    const container = document.getElementById('achievement-popup-container');
    if (!container) return;

    const popup = document.createElement('div');
    popup.className = 'achievement-popup';
    const tierName = achievement.tiers?.[level - 1]?.name;
    popup.innerHTML = `
        <div class="ach-icon">${achievement.icon}</div>
        <div class="ach-text">
            <div class="ach-title">LEVEL ${level}${maxLevel ? ' / ' + maxLevel : ''}</div>
            <div class="ach-name">${achievement.title}${tierName ? ' – ' + tierName : ''}</div>
        </div>
    `;

    container.appendChild(popup);

    // Add body class to make HUD transparent during achievement popup
    document.body.classList.add('achievement-popup-showing');

    // Trigger animation
    requestAnimationFrame(() => {
        popup.classList.add('show');
    });

    // Remove after delay
    setTimeout(() => {
        popup.classList.remove('show');
        setTimeout(() => {
            popup.remove();
            // Remove body class when popup is removed (check if no more popups)
            if (container && container.children.length === 0) {
                document.body.classList.remove('achievement-popup-showing');
            }
        }, 500);
    }, 4000);
}

function renderAchievementsPage() {
    const list = document.getElementById('achievements-list');
    if (!list) return;

    list.innerHTML = '';
    
    ACHIEVEMENTS.forEach(ach => {
        const tiers = ach.tiers || [];
        const tierCount = tiers.length;
        const storedLevel = achievementLevels[ach.id] || 0;
        const currentLevel = Math.min(storedLevel, tierCount);
        const maxed = tierCount > 0 && currentLevel >= tierCount;
        const metricValue = getAchievementValue(ach);
        let progressMarkup = '';
        if (tierCount > 0) {
            if (maxed) {
                progressMarkup = `
                    <div class="ach-progress">
                        <div class="ach-progress-label">MAX LEVEL</div>
                        <div class="ach-progress-track">
                            <div class="ach-progress-bar" style="width: 100%;"></div>
                        </div>
                    </div>
                `;
            } else {
                const nextTier = tiers[currentLevel];
                const ratio = Math.max(0, Math.min(1, nextTier ? (metricValue / nextTier.threshold) : 0));
                progressMarkup = `
                    <div class="ach-progress">
                        <div class="ach-progress-label">${nextTier?.name || `Tier ${currentLevel + 1}`} · ${Math.min(metricValue, nextTier?.threshold || 0).toLocaleString()} / ${(nextTier?.threshold || 0).toLocaleString()}</div>
                        <div class="ach-progress-track">
                            <div class="ach-progress-bar" style="width: ${Math.round(ratio * 100)}%;"></div>
                        </div>
                    </div>
                `;
            }
        }
        const statusText = tierCount
            ? (maxed ? 'MAX LEVEL' : `LEVEL ${currentLevel} / ${tierCount}`)
            : (currentLevel > 0 ? 'UNLOCKED' : 'LOCKED');
        const icon = currentLevel > 0 ? ach.icon : '🔒';
        const item = document.createElement('div');
        // Add level-based class for distinct styling (level-0 through level-3+)
        // Add max-level class for holographic effect on maxed achievements
        const levelClass = currentLevel > 0 ? `level-${Math.min(currentLevel, 3)}` : 'level-0';
        const maxLevelClass = maxed ? 'max-level' : '';
        item.className = `achievement-item ${currentLevel > 0 ? 'unlocked' : 'locked'} ${levelClass} ${maxLevelClass}`.trim();
        item.innerHTML = `
            <div class="ach-item-icon">${icon}</div>
            <div class="ach-item-content">
                <div class="ach-item-title">${ach.title}</div>
                <div class="ach-item-desc">${ach.description}</div>
                ${progressMarkup}
            </div>
            <div class="ach-item-status">${statusText}</div>
        `;
        list.appendChild(item);
    });
}
