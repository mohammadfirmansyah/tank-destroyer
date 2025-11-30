// INPUT HANDLING
const INPUT_MODE = { TOUCH: 'touch', DESKTOP: 'desktop' };
let activeInputMode = INPUT_MODE.TOUCH;
const touchJoystickMap = new Map();

// Centralized helper keeps visual joysticks in sync with the current control scheme.
function setInputMode(mode) {
    if (activeInputMode === mode) return;
    activeInputMode = mode;
    document.body.classList.toggle('touch-controls-hidden', mode === INPUT_MODE.DESKTOP);
    if (mode === INPUT_MODE.DESKTOP) resetVirtualJoysticks();
}

// When switching away from touch we clear joystick state so desktops do not
// inherit stale vectors that keep the tank sliding.
function releaseJoystick(side) {
    if (side === 'left') {
        input.move.active = false;
        input.move.x = 0;
        input.move.y = 0;
        input.move.angle = 0;
        input.move.mag = 0;
        const thumb = document.getElementById('thumb-l');
        if (thumb) thumb.style.transform = 'translate(-50%,-50%)';
    } else if (side === 'right') {
        input.aim.active = false;
        input.aim.x = 0;
        input.aim.y = 0;
        input.aim.angle = 0;
        input.aim.mag = 0;
        const thumb = document.getElementById('thumb-r');
        if (thumb) thumb.style.transform = 'translate(-50%,-50%)';
    }
}

function resetVirtualJoysticks() {
    releaseJoystick('left');
    releaseJoystick('right');
    touchJoystickMap.clear();
}

// Joysticks only react when touch mode is active to avoid conflicting signals.
function isTouchMode() {
    return activeInputMode === INPUT_MODE.TOUCH;
}

// Normalizes keyboard shortcuts so special keys (Space/Shift) mirror on-screen buttons.
function triggerAbilityShortcut(evt, ability) {
    if (evt) {
        if (typeof evt.preventDefault === 'function') evt.preventDefault();
        if (typeof evt.stopPropagation === 'function') evt.stopPropagation();
    }
    if (ability === 'ult') {
        activateUlt(evt);
    } else if (ability === 'turbo') {
        activateTurbo(evt);
    }
}

// Desktop listeners flip to keyboard mode immediately so joysticks stay hidden.
window.addEventListener('keydown', e => {
    setInputMode(INPUT_MODE.DESKTOP);
    const k = e.key.toLowerCase();
    const code = (e.code || '').toLowerCase();
    // NOTE: Removed clearAnalogAim() - we want mouse and keyboard aim to coexist
    // Arrow keys for aiming should work alongside mouse aim without conflict
    if (k === 'w') keys.w = true;
    if (k === 'a') keys.a = true;
    if (k === 's') keys.s = true;
    if (k === 'd') keys.d = true;
    if (k === 'arrowup') {
        keys.up = true;
    }
    if (k === 'arrowleft') {
        keys.left = true;
    }
    if (k === 'arrowdown') {
        keys.down = true;
    }
    if (k === 'arrowright') {
        keys.right = true;
    }
    const isSpace = k === ' ' || k === 'spacebar' || code === 'space';
    if (isSpace) triggerAbilityShortcut(e, 'ult');
    const isShift = k === 'shift' || code === 'shiftleft' || code === 'shiftright';
    if (isShift) triggerAbilityShortcut(e, 'turbo');
    if (k === 't') activateTurbo(e);
    if (k === 'escape' && state === 'GAME') togglePause();
});

window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === 'w') keys.w = false;
    if (k === 'a') keys.a = false;
    if (k === 's') keys.s = false;
    if (k === 'd') keys.d = false;
    if (k === 'arrowup') keys.up = false;
    if (k === 'arrowleft') keys.left = false;
    if (k === 'arrowdown') keys.down = false;
    if (k === 'arrowright') keys.right = false;
});

// Mouse motion provides turret aim using screen center as reference point.
window.addEventListener('mousemove', e => {
    if (state !== 'GAME' || paused) return;
    setInputMode(INPUT_MODE.DESKTOP);
    let cx = window.innerWidth / 2;
    let cy = window.innerHeight / 2;
    mouseAim.active = true;
    mouseAim.angle = Math.atan2(e.clientY - cy, e.clientX - cx);
});

// Helper function to delay button action until push animation completes
// This gives visual feedback before executing the action
const BUTTON_ANIMATION_DELAY = 120; // ms - matches CSS transition duration

function handleButtonWithDelay(button, action) {
    if (!button || button.dataset.animating === 'true') return;
    button.dataset.animating = 'true';
    setTimeout(() => {
        button.dataset.animating = 'false';
        if (typeof action === 'function') action();
    }, BUTTON_ANIMATION_DELAY);
}

// UI Button Listeners
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            handleButtonWithDelay(startBtn, () => {
                // Check if there's a saved game - show confirmation popup
                if (typeof hasSaveGame === 'function' && hasSaveGame()) {
                    showDeployConfirmation();
                } else {
                    startGame();
                }
            });
        });
    }

    const resumeGameBtn = document.getElementById('resume-game-btn');
    if (resumeGameBtn) {
        resumeGameBtn.addEventListener('click', () => {
            handleButtonWithDelay(resumeGameBtn, () => {
                if (typeof hasSaveGame === 'function' && hasSaveGame()) {
                    if (typeof loadGame === 'function') {
                        resumeGame();
                    }
                }
            });
        });
    }

    const achievementsBtn = document.getElementById('achievements-btn');
    if (achievementsBtn) {
        achievementsBtn.addEventListener('click', () => {
            handleButtonWithDelay(achievementsBtn, () => {
                document.getElementById('overlay').classList.add('hidden');
                document.getElementById('achievements-screen').classList.remove('hidden');
                document.body.classList.add('achievements-open');
                if (typeof renderAchievementsPage === 'function') renderAchievementsPage();
            });
        });
    }

    const achBackBtn = document.getElementById('ach-back-btn');
    if (achBackBtn) {
        achBackBtn.addEventListener('click', () => {
            handleButtonWithDelay(achBackBtn, () => {
                document.getElementById('achievements-screen').classList.add('hidden');
                document.getElementById('overlay').classList.remove('hidden');
                document.body.classList.remove('achievements-open');
            });
        });
    }

    // Pause button - with delay for push-in animation
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            handleButtonWithDelay(pauseBtn, togglePause);
        });
    }

    // Resume button - with delay for push-in animation
    const resumeBtn = document.getElementById('resume-btn');
    if (resumeBtn) {
        resumeBtn.addEventListener('click', () => {
            handleButtonWithDelay(resumeBtn, togglePause);
        });
    }

    // Restart from pause - with delay for push-in animation
    const restartPauseBtn = document.getElementById('restart-pause-btn');
    if (restartPauseBtn) {
        restartPauseBtn.addEventListener('click', () => {
            handleButtonWithDelay(restartPauseBtn, () => {
                togglePause();
                startGame();
            });
        });
    }

    // Home button from pause - with delay for push-in animation
    const homeBtn = document.getElementById('home-btn');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            handleButtonWithDelay(homeBtn, returnHome);
        });
    }

    const ultBtn = document.getElementById('ult-btn');
    if (ultBtn) {
        ultBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            activateUlt(e);
        });
        ultBtn.addEventListener('mousedown', (e) => {
            activateUlt(e);
        });
    }

    const turboBtn = document.getElementById('turbo-btn');
    if (turboBtn) {
        const igniteTurbo = (evt) => {
            if (evt) evt.preventDefault();
            activateTurbo(evt);
        };
        turboBtn.addEventListener('touchstart', igniteTurbo);
        turboBtn.addEventListener('mousedown', igniteTurbo);
    }
});

window.addEventListener('mousedown', e => {
    if (e.target.tagName === 'CANVAS') mouseAim.down = true;
    setInputMode(INPUT_MODE.DESKTOP);
});

window.addEventListener('mouseup', () => {
    mouseAim.down = false;
});

// Reset all input states when window loses focus or becomes hidden
// This prevents shooting bug when app goes idle
function resetAllInputStates() {
    keys.w = false;
    keys.a = false;
    keys.s = false;
    keys.d = false;
    keys.up = false;
    keys.down = false;
    keys.left = false;
    keys.right = false;
    mouseAim.down = false;
    // NOTE: Don't reset mouseAim.active here - it should persist
    // The angle is still valid, only the firing state (down) should reset
    input.aim.active = false;
    input.move.active = false;
    resetVirtualJoysticks();
}

// Handle visibility change (tab switch, minimize)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        resetAllInputStates();
    }
});

// Handle window blur (click outside browser, alt-tab)
window.addEventListener('blur', () => {
    resetAllInputStates();
});

// Handle window focus restoration
window.addEventListener('focus', () => {
    // Don't reset all input states on focus - this was causing aim/fire bugs
    // Only reset stuck keys that might have been held during blur
    // The blur handler already clears states, focus should allow fresh input
});

// Show deploy confirmation popup with dramatic animation
function showDeployConfirmation() {
    const popup = document.getElementById('deploy-confirm-popup');
    if (!popup) return;
    
    // Get saved game info
    try {
        const savedData = localStorage.getItem('tankDestroyerSave');
        if (savedData) {
            const save = JSON.parse(savedData);
            const waveNum = document.getElementById('saved-wave-num');
            const scoreNum = document.getElementById('saved-score-num');
            // Wave is stored in save.player.currentWave, not save.currentWave
            const savedWave = save.player?.currentWave || save.currentWave || 1;
            if (waveNum) waveNum.textContent = savedWave;
            if (scoreNum) scoreNum.textContent = (save.score || 0).toLocaleString();
        }
    } catch (e) {}
    
    // Remove hidden class and trigger animation
    popup.classList.remove('hidden');
    // Force reflow for animation
    void popup.offsetWidth;
    popup.classList.add('active');
}

// Hide deploy confirmation popup with exit animation
function hideDeployConfirmation() {
    const popup = document.getElementById('deploy-confirm-popup');
    if (!popup) return;
    
    // Remove active to trigger exit animation
    popup.classList.remove('active');
    
    // Wait for animation to finish before hiding completely
    setTimeout(() => {
        popup.classList.add('hidden');
    }, 400);
}

// Confirm deploy button - start new game and clear save
document.addEventListener('DOMContentLoaded', () => {
    const confirmDeployBtn = document.getElementById('confirm-deploy-btn');
    if (confirmDeployBtn) {
        confirmDeployBtn.addEventListener('click', () => {
            handleButtonWithDelay(confirmDeployBtn, () => {
                // Clear saved game
                if (typeof clearSaveGame === 'function') clearSaveGame();
                hideDeployConfirmation();
                startGame();
            });
        });
    }
    
    const cancelDeployBtn = document.getElementById('cancel-deploy-btn');
    if (cancelDeployBtn) {
        cancelDeployBtn.addEventListener('click', () => {
            handleButtonWithDelay(cancelDeployBtn, hideDeployConfirmation);
        });
    }
});

// Note: start-btn listener is already defined in DOMContentLoaded above with save game check
// Do not add duplicate listener here

// Restart button on game over screen - with delay for push-in animation
const restartBtnGO = document.getElementById('restart-btn');
if (restartBtnGO) {
    restartBtnGO.addEventListener('click', e => {
        e.stopPropagation();
        handleButtonWithDelay(restartBtnGO, startGame);
    });
}

// Note: pause-btn, resume-btn, restart-pause-btn, home-btn are handled in DOMContentLoaded
// Do NOT add duplicate listeners here to avoid double-toggle issues

// Home button on game over screen - with delay for push-in animation
const homeGameoverBtn = document.getElementById('home-gameover-btn');
if (homeGameoverBtn) {
    homeGameoverBtn.addEventListener('click', () => {
        handleButtonWithDelay(homeGameoverBtn, returnHome);
    });
}

// Victory screen home button - with delay for push-in animation
const homeVictoryBtn = document.getElementById('home-victory-btn');
if (homeVictoryBtn) {
    homeVictoryBtn.addEventListener('click', () => {
        handleButtonWithDelay(homeVictoryBtn, () => {
            // Hide victory screen
            document.getElementById('victory-screen').classList.add('hidden');
            // Return to home/menu
            returnHome();
        });
    });
}

function activateUlt(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (player.ultReady && !player.isUlting) {
        player.isUlting = true;
        player.ultTimer = 150;
        addFloatText('CHARGING...', player.x, player.y - 50, 'cyan');
    }
}

function activateTurbo(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (state !== 'GAME' || paused) return;
    if (player.turboActive || (player.turboCharges || 0) <= 0) return;
    if ((player.turboCooldown || 0) > 0) return;
    if (typeof getActiveRareEffectCount === 'function' && typeof rareItemTracker !== 'undefined') {
        const activeCount = getActiveRareEffectCount();
        if (activeCount >= rareItemTracker.maxRareItems) {
            addFloatText('POWER LIMIT REACHED', player.x, player.y - 60, '#f97316');
            return;
        }
    }
    player.turboActive = true;
    player.turboTime = player.turboDuration || 420;
    // DEBUG_UNLIMITED_TURBO: Don't consume charges in debug mode
    if (!DEBUG_UNLIMITED_TURBO) {
        player.turboCharges = Math.max(0, (player.turboCharges || 0) - 1);
    }
    player.turboCooldown = player.turboCooldownMax || 240;
    addFloatText('TURBO ONLINE', player.x, player.y - 70, '#fb923c');
    if (typeof getActiveRareEffectCount === 'function') {
        rareItemTracker.activeRareItems = getActiveRareEffectCount();
    }
}

// Virtual joystick handler mirrors mobile twin-stick shooters.
function handleJoy(identifier, tx, ty, type, phase) {
    if (!isTouchMode()) return;

    const assignSide = () => (tx < window.innerWidth / 2 ? 'left' : 'right');
    let resolvedType = type;
    if (type === 'auto') {
        if (identifier !== null && identifier !== undefined && touchJoystickMap.has(identifier)) {
            resolvedType = touchJoystickMap.get(identifier);
        } else {
            resolvedType = assignSide();
            if (identifier !== null && identifier !== undefined) {
                touchJoystickMap.set(identifier, resolvedType);
            }
        }
    }

    if (phase === 'end') {
        if (identifier !== null && identifier !== undefined) touchJoystickMap.delete(identifier);
        if (resolvedType === 'left' || resolvedType === 'right') releaseJoystick(resolvedType);
        else resetVirtualJoysticks();
        return;
    }

    if (state !== 'GAME' || paused) {
        resetVirtualJoysticks();
        return;
    }

    // Get fresh joystick positions (important after orientation change)
    const stickL = document.getElementById('stick-l');
    const stickR = document.getElementById('stick-r');
    
    // Safety check: ensure joystick elements exist
    if (!stickL || !stickR) {
        console.warn('Joystick elements not found');
        return;
    }
    
    const rL = stickL.getBoundingClientRect();
    const rR = stickR.getBoundingClientRect();
    
    // Validate positions (ensure they're not all zeros which happens during orientation change)
    if (rL.width === 0 || rR.width === 0) {
        console.warn('Joystick dimensions invalid, skipping frame');
        return;
    }
    
    const cL = { x: rL.left + rL.width / 2, y: rL.top + rL.height / 2 };
    const cR = { x: rR.left + rR.width / 2, y: rR.top + rR.height / 2 };

    if (resolvedType === 'left') {
        input.move.active = true;
        const dx = tx - cL.x;
        const dy = ty - cL.y;
        const ang = Math.atan2(dy, dx);
        const dist = Math.min(Math.hypot(dx, dy), 40);
        const ratio = dist / 40;
        input.move.x = Math.cos(ang) * ratio;
        input.move.y = Math.sin(ang) * ratio;
        input.move.angle = ang;
        input.move.mag = ratio;
        const thumbL = document.getElementById('thumb-l');
        if (thumbL) {
            thumbL.style.transform = `translate(calc(-50% + ${input.move.x * 40}px), calc(-50% + ${input.move.y * 40}px))`;
        }
    } else if (resolvedType === 'right') {
        input.aim.active = true;
        const dx = tx - cR.x;
        const dy = ty - cR.y;
        const ang = Math.atan2(dy, dx);
        const dist = Math.min(Math.hypot(dx, dy), 40);
        const ratio = dist / 40;
        input.aim.x = Math.cos(ang) * ratio;
        input.aim.y = Math.sin(ang) * ratio;
        input.aim.angle = ang;
        input.aim.mag = ratio;
        const thumbR = document.getElementById('thumb-r');
        if (thumbR) {
            thumbR.style.transform = `translate(calc(-50% + ${input.aim.x * 40}px), calc(-50% + ${input.aim.y * 40}px))`;
        }
    }
}

document.addEventListener(
    'touchstart',
    e => {
        // Allow scrolling in achievement screen and other scrollable UI elements
        const targetEl = e.target;
        const scrollableParent = targetEl.closest('#achievements-screen, #settings-screen, .scrollable');
        if (scrollableParent) return; // Don't intercept - allow native scroll
        
        setInputMode(INPUT_MODE.TOUCH);
        let handled = false;
        for (let t of e.changedTouches) {
            const pointEl = document.elementFromPoint(t.clientX, t.clientY);
            const blockingEl = pointEl ? pointEl.closest('[id]') : null;
            if (blockingEl && blockingEl.id && blockingEl.id.includes('btn')) continue;
            handleJoy(t.identifier, t.clientX, t.clientY, 'auto', 'start');
            handled = true;
        }
        if (handled) e.preventDefault();
    },
    { passive: false }
);

document.addEventListener(
    'touchmove',
    e => {
        // Allow scrolling in achievement screen and other scrollable UI elements
        const targetEl = e.target;
        const scrollableParent = targetEl.closest('#achievements-screen, #settings-screen, .scrollable');
        if (scrollableParent) return; // Don't intercept - allow native scroll
        
        let handled = false;
        for (let t of e.changedTouches) {
            if (!touchJoystickMap.has(t.identifier)) continue;
            handleJoy(t.identifier, t.clientX, t.clientY, 'auto', 'move');
            handled = true;
        }
        if (handled) e.preventDefault();
    },
    { passive: false }
);

const handleTouchEnd = e => {
    let handled = false;
    for (let t of e.changedTouches) {
        if (!touchJoystickMap.has(t.identifier)) continue;
        handleJoy(t.identifier, t.clientX, t.clientY, 'auto', 'end');
        handled = true;
    }
    if (handled) e.preventDefault();
};

document.addEventListener('touchend', handleTouchEnd);
document.addEventListener('touchcancel', handleTouchEnd);

let md = false;
document.addEventListener('mousedown', e => {
    if (!isTouchMode()) return;
    if (e.target.id.includes('btn')) return;
    md = true;
    handleJoy(null, e.clientX, e.clientY, 'auto', 'start');
});

document.addEventListener('mousemove', e => {
    if (!isTouchMode()) return;
    if (md) handleJoy(null, e.clientX, e.clientY, 'auto', 'move');
});

document.addEventListener('mouseup', e => {
    if (!isTouchMode()) return;
    md = false;
    handleJoy(null, e.clientX, e.clientY, 'left', 'end');
    handleJoy(null, e.clientX, e.clientY, 'right', 'end');
});
