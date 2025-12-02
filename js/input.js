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

// Mouse motion provides turret aim based on mouse position relative to player (world coords)
// This allows aiming in any direction regardless of where mouse is on screen
window.addEventListener('mousemove', e => {
    if (state !== 'GAME' || paused) return;
    setInputMode(INPUT_MODE.DESKTOP);
    
    // Store raw screen coordinates for crosshair rendering
    mouseAim.screenX = e.clientX;
    mouseAim.screenY = e.clientY;
    
    // Convert screen position to world position for accurate aiming
    // Camera offset + screen position = world position
    if (typeof camX !== 'undefined' && typeof camY !== 'undefined' && typeof player !== 'undefined') {
        // Get screen (CSS) dimensions and buffer dimensions for proper coordinate conversion
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        // displayWidth/displayHeight are the reference buffer dimensions (without resScale)
        // They represent the virtual viewport size in world units
        const bufferW = (typeof displayWidth !== 'undefined') ? displayWidth : screenWidth;
        const bufferH = (typeof displayHeight !== 'undefined') ? displayHeight : screenHeight;
        
        // Screen to world conversion:
        // 1. Convert screen pixels to buffer pixels: screen * (buffer/screen)
        // 2. Buffer pixels directly map to world units (camera is in world space)
        // Result: worldPos = camera + screenPos * (bufferSize / screenSize)
        const worldMouseX = camX + (e.clientX * bufferW / screenWidth);
        const worldMouseY = camY + (e.clientY * bufferH / screenHeight);
        
        // Calculate angle from player to mouse position in world space
        const dx = worldMouseX - player.x;
        const dy = worldMouseY - player.y;
        mouseAim.angle = Math.atan2(dy, dx);
        mouseAim.active = true;
        
        // Store world coordinates for movement direction
        mouseAim.worldX = worldMouseX;
        mouseAim.worldY = worldMouseY;
    }
});

// Prevent context menu on right-click during gameplay
window.addEventListener('contextmenu', e => {
    if (state === 'GAME' && !paused) {
        e.preventDefault();
    }
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
                
                // Play achievement music
                if (typeof MusicManager !== 'undefined') {
                    MusicManager.play('achievement');
                }
            });
        });
    }

    const achBackBtn = document.getElementById('ach-back-btn');
    if (achBackBtn) {
        achBackBtn.addEventListener('click', () => {
            handleButtonWithDelay(achBackBtn, () => {
                const achScreen = document.getElementById('achievements-screen');
                
                // Add closing animation
                achScreen.classList.add('closing');
                
                // Wait for animation to complete, then hide
                setTimeout(() => {
                    achScreen.classList.remove('closing');
                    achScreen.classList.add('hidden');
                    document.getElementById('overlay').classList.remove('hidden');
                    document.body.classList.remove('achievements-open');
                    
                    // Return to home music
                    if (typeof MusicManager !== 'undefined') {
                        MusicManager.play('home');
                    }
                }, 300); // Match CSS animation duration
            });
        });
    }

    // Music toggle button - toggles music on/off with localStorage persistence
    const musicToggleBtn = document.getElementById('music-toggle');
    const musicIconEl = document.getElementById('music-icon');
    const musicStartHint = document.getElementById('music-start-hint');
    
    if (musicToggleBtn && musicIconEl) {
        console.log('[Input] Music toggle button found, attaching handler');
        
        // Function to update icon based on state
        const updateMusicIcon = (isEnabled) => {
            musicIconEl.textContent = isEnabled ? '🔊' : '🔇';
            musicToggleBtn.classList.toggle('disabled', !isEnabled);
        };
        
        // Function to update music start hint visibility
        // Show hint when: music not muted AND user hasn't interacted yet
        const updateMusicStartHint = () => {
            if (!musicStartHint) return;
            
            const hasInteracted = MusicManager.hasUserInteracted();
            const isMusicEnabled = MusicManager.isEnabled();
            
            // Show hint only when music is enabled (not muted) but user hasn't interacted
            const shouldShow = isMusicEnabled && !hasInteracted;
            
            if (shouldShow) {
                musicStartHint.classList.remove('hidden');
            } else {
                musicStartHint.classList.add('hidden');
            }
        };
        
        // Click handler with push-in animation
        const handleMusicToggle = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('[Input] Music toggle clicked');
            
            // Add push-in animation class
            musicToggleBtn.classList.add('pushed');
            
            // Remove class after animation
            setTimeout(() => {
                musicToggleBtn.classList.remove('pushed');
            }, 150);
            
            if (typeof MusicManager === 'undefined') {
                console.warn('[Input] MusicManager not available');
                return;
            }
            
            // Ensure user interaction is registered
            MusicManager.onUserInteraction();
            
            // Toggle music and update icon
            const isEnabled = MusicManager.toggle();
            updateMusicIcon(isEnabled);
            
            // Update hint visibility after toggle
            updateMusicStartHint();
            
            console.log('[Input] Music toggled, enabled:', isEnabled);
        };
        
        // Attach click event
        musicToggleBtn.addEventListener('click', handleMusicToggle);
        
        // Also attach touchend for mobile (prevents double-tap issues)
        musicToggleBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            handleMusicToggle(e);
        }, { passive: false });
        
        // Initialize icon state and hint after MusicManager is ready
        setTimeout(() => {
            if (typeof MusicManager !== 'undefined') {
                const isEnabled = MusicManager.isEnabled();
                updateMusicIcon(isEnabled);
                updateMusicStartHint();
                console.log('[Input] Music icon initialized, enabled:', isEnabled);
            }
        }, 300);
        
        // Listen for user interaction to hide hint
        // This catches any click/touch that triggers music playback
        const hideHintOnInteraction = () => {
            setTimeout(() => {
                updateMusicStartHint();
            }, 100);
        };
        
        document.addEventListener('click', hideHintOnInteraction);
        document.addEventListener('touchstart', hideHintOnInteraction);
        document.addEventListener('keydown', hideHintOnInteraction);
    } else {
        console.warn('[Input] Music toggle button or icon not found');
    }

    // ==========================================================================
    // SETTINGS SCREEN HANDLERS
    // ==========================================================================
    const settingsBtn = document.getElementById('settings-btn');
    const settingsScreen = document.getElementById('settings-screen');
    const settingsBackBtn = document.getElementById('settings-back-btn');
    const presetBtns = document.querySelectorAll('.preset-btn');
    
    // Setting value display elements
    const settingParticles = document.getElementById('setting-particles');
    const settingShadows = document.getElementById('setting-shadows');
    const settingTerrain = document.getElementById('setting-terrain');
    const settingEffects = document.getElementById('setting-effects');
    const settingTracks = document.getElementById('setting-tracks');
    const settingFloatText = document.getElementById('setting-floattext');
    const settingAI = document.getElementById('setting-ai');
    
    // Update settings display based on quality level
    function updateSettingsDisplay(level) {
        if (typeof GRAPHICS_QUALITY_LEVELS === 'undefined') return;
        
        const settings = GRAPHICS_QUALITY_LEVELS[level];
        if (!settings) return;
        
        // Update each setting value
        if (settingParticles) {
            settingParticles.textContent = Math.round(settings.particleMultiplier * 100) + '%';
        }
        if (settingShadows) {
            settingShadows.textContent = settings.shadowQuality === 0 ? 'Off' : 
                                         settings.shadowQuality < 0.3 ? 'Minimal' :
                                         settings.shadowQuality < 0.6 ? 'Low' :
                                         settings.shadowQuality < 0.9 ? 'Medium' : 'Full';
        }
        if (settingTerrain) {
            settingTerrain.textContent = Math.round(settings.terrainDetail * 100) + '%';
        }
        if (settingEffects) {
            settingEffects.textContent = Math.round(settings.effectDetail * 100) + '%';
        }
        if (settingTracks) {
            settingTracks.textContent = settings.trackQuality === 0 ? 'Off' :
                                        settings.trackQuality < 0.5 ? 'Simple' : 'Full';
        }
        if (settingFloatText) {
            settingFloatText.textContent = settings.floatTextMax + ' max';
        }
        if (settingAI) {
            const rate = settings.aiUpdateRate;
            settingAI.textContent = rate === 1 ? 'Every frame' : `Every ${rate} frames`;
        }
        
        // Update active preset button
        presetBtns.forEach(btn => {
            const btnLevel = parseInt(btn.getAttribute('data-quality'), 10);
            btn.classList.toggle('active', btnLevel === level);
        });
    }
    
    // Open settings screen with button animation delay
    function openSettings() {
        if (!settingsScreen) return;
        
        // Hide overlay (home screen) when settings opens
        const overlay = document.getElementById('overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
        
        settingsScreen.classList.remove('hidden');
        
        // Update display with current quality level
        const currentLevel = typeof getGraphicsQuality === 'function' ? getGraphicsQuality() : 5;
        updateSettingsDisplay(currentLevel);
        
        console.log('[Settings] Opened, current level:', currentLevel);
    }
    
    // Close settings screen with animation
    function closeSettings() {
        if (!settingsScreen) return;
        
        // Add closing animation class
        settingsScreen.classList.add('closing');
        
        // Wait for animation to complete, then hide and show overlay
        setTimeout(() => {
            settingsScreen.classList.remove('closing');
            settingsScreen.classList.add('hidden');
            
            // Show overlay (home screen) with animation
            const overlay = document.getElementById('overlay');
            if (overlay) {
                // Force reflow to ensure animation plays
                overlay.style.animation = 'none';
                overlay.offsetHeight; // Trigger reflow
                overlay.style.animation = '';
                overlay.classList.remove('hidden');
            }
            
            console.log('[Settings] Closed');
        }, 300); // Match CSS animation duration
    }
    
    // Handle preset button click
    function handlePresetClick(e) {
        const btn = e.currentTarget;
        const level = parseInt(btn.getAttribute('data-quality'), 10);
        
        if (isNaN(level) || level < 0 || level > 5) return;
        
        // Apply quality setting
        if (typeof setGraphicsQuality === 'function') {
            setGraphicsQuality(level);
        }
        
        // Update display
        updateSettingsDisplay(level);
        
        console.log('[Settings] Quality set to level:', level);
    }
    
    // Settings button click handler with push animation delay
    if (settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Add pushed class for animation
            settingsBtn.classList.add('pushed');
            
            // Delay opening to allow push animation to complete
            setTimeout(() => {
                settingsBtn.classList.remove('pushed');
                openSettings();
            }, 150);
        });
        
        settingsBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Add pushed class for animation
            settingsBtn.classList.add('pushed');
            
            // Delay opening to allow push animation to complete
            setTimeout(() => {
                settingsBtn.classList.remove('pushed');
                openSettings();
            }, 150);
        }, { passive: false });
    }
    
    // Settings back button click handler
    if (settingsBackBtn) {
        settingsBackBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeSettings();
        });
    }
    
    // Preset button click handlers
    presetBtns.forEach(btn => {
        btn.addEventListener('click', handlePresetClick);
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            handlePresetClick(e);
        }, { passive: false });
    });
    
    // Initialize settings on load
    setTimeout(() => {
        if (typeof initGraphicsSettings === 'function') {
            initGraphicsSettings();
        }
        const currentLevel = typeof getGraphicsQuality === 'function' ? getGraphicsQuality() : 5;
        updateSettingsDisplay(currentLevel);
        console.log('[Settings] Initialized with level:', currentLevel);
    }, 100);

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

// Mouse button controls during gameplay
// Left-click (button 0) = Shoot toward mouse direction
// Right-click (button 2) = Move tank toward mouse direction
window.addEventListener('mousedown', e => {
    // Skip if not in game state or paused
    if (state !== 'GAME' || paused) return;
    
    // Allow canvas clicks OR clicks anywhere when game is active
    // This fixes the bug where shooting stops working after idle/screen switch
    setInputMode(INPUT_MODE.DESKTOP);
    
    if (e.button === 0) {
        // Left-click = shoot
        mouseAim.leftDown = true;
        mouseAim.down = true; // Legacy compatibility
        mouseAim.active = true; // Ensure mouseAim is active
    } else if (e.button === 2) {
        // Right-click = move
        mouseAim.rightDown = true;
        mouseAim.active = true;
    }
});

window.addEventListener('mouseup', e => {
    if (e.button === 0) {
        mouseAim.leftDown = false;
    } else if (e.button === 2) {
        mouseAim.rightDown = false;
    }
    // Legacy: down is false only when both buttons released
    mouseAim.down = mouseAim.leftDown || mouseAim.rightDown;
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
    mouseAim.leftDown = false;
    mouseAim.rightDown = false;
    // Reset mouseAim.active to ensure fresh state
    // It will be re-enabled on next mousemove event
    mouseAim.active = false;
    input.aim.active = false;
    input.move.active = false;
    resetVirtualJoysticks();
}

// Complete reset for mouseAim - call when switching screens or starting game
function resetMouseAimState() {
    mouseAim.active = false;
    mouseAim.down = false;
    mouseAim.leftDown = false;
    mouseAim.rightDown = false;
    mouseAim.x = 0;
    mouseAim.y = 0;
    mouseAim.angle = 0;
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
    // Reset mouse button states on focus to ensure clean state
    // This fixes the bug where shooting doesn't work after returning from idle
    mouseAim.leftDown = false;
    mouseAim.rightDown = false;
    mouseAim.down = false;
    // Note: Don't reset mouseAim.active - let mousemove re-enable it
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
