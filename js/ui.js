// Game over swaps to overlay, records score, and shows summary text.
function getDynamicFontSize(text, basePx = 26, minPx = 14) {
    if (!text) return basePx + 'px';
    const sanitized = text.replace(/\s+/g, '');
    const charCount = Math.max(1, sanitized.length);
    let viewportWidth = 1280;
    let viewportHeight = 720;
    let portraitMode = false;

    if (typeof window !== 'undefined') {
        viewportWidth = window.innerWidth || viewportWidth;
        viewportHeight = window.innerHeight || viewportHeight;
        portraitMode = window.matchMedia
            ? window.matchMedia('(orientation: portrait)').matches
            : viewportHeight > viewportWidth;
    }

    const widthFactor = Math.min(1, viewportWidth / 1280);
    const baseMultiplier = portraitMode ? 0.88 : 1;
    let adjustedBase = basePx * baseMultiplier * (0.9 + widthFactor * 0.1);

    let dropRate = portraitMode ? 2.6 : 1.9;
    if (charCount > 8) dropRate += 0.5;
    if (charCount > 12) dropRate += 0.3;

    const penalty = Math.max(0, charCount - 4) * dropRate;
    adjustedBase -= penalty;

    if (charCount >= 10 && widthFactor < 0.85) {
        adjustedBase -= 2;
    }

    return Math.max(minPx, Math.round(adjustedBase)) + 'px';
}

function endGame(withMissionAnimation = false) {
    state = 'GAMEOVER';
    saveScore(score);
    const screen = document.getElementById('gameover-screen');
    screen.classList.remove('hidden');
    screen.classList.remove('mission-failed-enter');
    document.getElementById('go-score').innerText = 'SCORE: ' + score;
    if (withMissionAnimation) {
        // Force reflow so animation can replay even after multiple deaths.
        void screen.offsetWidth;
        screen.classList.add('mission-failed-enter');
    }
}

// HUD bars are driven via flex widths so we simply update percentages here.
function updateUI() {
    // Hide HUD during player spawn animation or death sequence (revive animation)
    const hudTop = document.querySelector('.hud-top');
    const controlsArea = document.querySelector('.controls-area');
    const isSpawning = player.spawnWarmup > 0;
    const isReviving = typeof deathSequence !== 'undefined' && deathSequence.active;
    const hideHUD = isSpawning || isReviving;
    
    if (hudTop) {
        hudTop.style.opacity = hideHUD ? '0' : '1';
        hudTop.style.pointerEvents = hideHUD ? 'none' : 'auto';
        hudTop.style.transition = 'opacity 0.3s ease';
    }
    if (controlsArea) {
        controlsArea.style.opacity = hideHUD ? '0' : '1';
        controlsArea.style.pointerEvents = hideHUD ? 'none' : 'auto';
        controlsArea.style.transition = 'opacity 0.3s ease';
    }
    
    // Initialize display values for smooth interpolation (if not already set)
    if (player.displayHp === undefined) player.displayHp = player.hp;
    if (player.displayEnergy === undefined) player.displayEnergy = player.energy;
    if (player.displayKillStreak === undefined) player.displayKillStreak = player.killStreak || 0;
    
    // Smooth interpolation for display values (lerp toward actual values)
    const lerpSpeed = 0.12; // Adjust for smoother/faster transitions
    const fastLerpSpeed = 0.18; // For energy which changes more frequently
    
    // HP smooth interpolation
    if (Math.abs(player.displayHp - player.hp) > 0.5) {
        player.displayHp += (player.hp - player.displayHp) * lerpSpeed;
    } else {
        player.displayHp = player.hp;
    }
    
    // Energy smooth interpolation
    if (Math.abs(player.displayEnergy - player.energy) > 0.5) {
        player.displayEnergy += (player.energy - player.displayEnergy) * fastLerpSpeed;
    } else {
        player.displayEnergy = player.energy;
    }
    
    // Kill streak smooth interpolation (instant increase, gradual decrease)
    const targetStreak = player.killStreak || 0;
    if (player.displayKillStreak < targetStreak) {
        player.displayKillStreak = targetStreak; // Instant increase
    } else if (player.displayKillStreak > targetStreak) {
        player.displayKillStreak += (targetStreak - player.displayKillStreak) * lerpSpeed;
        if (Math.abs(player.displayKillStreak - targetStreak) < 0.1) {
            player.displayKillStreak = targetStreak;
        }
    }
    
    // HP Bar - use display value for smooth text, CSS handles bar transition
    document.getElementById('hp-fill').style.width = Math.max(0, (player.hp / player.maxHp) * 100) + '%';
    document.getElementById('hp-text').innerText = Math.max(0, Math.ceil(player.displayHp)) + '/' + player.maxHp;
    
    // REMOVED: Armor bar from top-left UI
    // Armor is now ONLY shown in the status bar above the player tank (via drawUnifiedStatusPanel)
    // This prevents duplication and keeps the HUD cleaner
    const armorBarGroup = document.getElementById('armor-bar-group');
    if (armorBarGroup) {
        // Always hide the top-left armor bar - armor is shown above tank instead
        armorBarGroup.classList.remove('bar-visible');
        armorBarGroup.classList.add('bar-hidden');
        armorBarGroup.style.display = 'none'; // Completely hide from layout
    }
    
    // Revive indicator - always show
    const reviveEl = document.getElementById('revive-indicator');
    reviveEl.innerText = '❤️ ' + player.revives + 'x';
    
    // Temperature indicator - show temperature with color coding (no emoji)
    const tempEl = document.getElementById('temp-indicator');
    const temp = Math.round(player.temperature);
    let tempColor = '#00ff00'; // Green (cool)
    
    if (temp > 90) {
        tempColor = '#ff0000'; // Red (danger)
    } else if (temp > 80) {
        tempColor = '#ff3300'; // Dark orange (very hot)
    } else if (temp > 70) {
        tempColor = '#ff6600'; // Orange (hot)
    } else if (temp > 60) {
        tempColor = '#ff9500'; // Light orange (warm)
    } else if (temp > 50) {
        tempColor = '#ffeb3b'; // Yellow (getting warm)
    } else if (temp > 40) {
        tempColor = '#8bc34a'; // Light green (comfortable)
    }
    
    tempEl.innerHTML = `
        <span style="color: ${tempColor}; font-weight: 900;">${temp}°C</span>
    `;
    
    // Add blinking effect when temperature is at critical level (100%)
    if (temp >= 100) {
        tempEl.classList.add('temp-critical');
    } else {
        tempEl.classList.remove('temp-critical');
    }
    
    // Energy bar - use actual value for bar width (CSS handles transition), display value for text
    let enPct = (player.energy / player.maxEnergy) * 100;
    document.getElementById('en-fill').style.width = enPct + '%';
    document.getElementById('en-text').innerText = Math.ceil(player.displayEnergy) + '%';
    document.getElementById('en-fill').style.background = player.overheated ? '#ef4444' : 'linear-gradient(90deg, #0891b2, #22d3ee)';
    
    // Kill streak bar - use actual value for bar, display value smooths the visual
    const streakFillRatio = Math.min(player.killStreak || 0, player.maxStreak) / player.maxStreak;
    document.getElementById('ks-fill').style.width = Math.max(0, Math.min(1, streakFillRatio)) * 100 + '%';
    
    const wName = WEAPONS[player.weapon].name;
    const wEl = document.getElementById('weapon-name');
    if (wEl.innerText !== wName) {
        wEl.innerText = wName;
        wEl.style.color = WEAPONS[player.weapon].color;
    }
    wEl.style.fontSize = getDynamicFontSize(wName, 24, 13);
    wEl.style.lineHeight = '1';
    
    // Update passive item indicators (dmgmult, critical, etc.)
    updatePassiveIndicators();
    
    const ultBtn = document.getElementById('ult-btn');
    if (ultBtn) {
        const ready = !!player.ultReady && !player.isUlting && player.ultBeamTime <= 0;
        const channeling = player.isUlting && player.ultTimer > 60 && !player.firedUlt;
        const beamPhase = player.ultBeamTime > 0 || (player.isUlting && player.firedUlt);
        
        // Get current ultimate type info
        const ultType = player.ultType || 'BEAM';
        const ultConfig = typeof PLAYER_ULTIMATES !== 'undefined' ? PLAYER_ULTIMATES[ultType] : null;
        const ultColor = ultConfig?.color || '#22c55e';
        
        // Determine sub label - always show ultimate type short name
        let subLabel = ultType; // Always show type name (BEAM, BERSERK, etc.)
        const isActive = player.isUlting || player.ultBeamTime > 0 || (player.berserkerActive && player.berserkerTime > 0);
        
        if (isActive) {
            // Show countdown when active
            if (player.isUlting && player.ultTimer > 0) {
                subLabel = Math.max(1, Math.ceil(player.ultTimer / 60)) + 's';
            } else if (player.ultBeamTime > 0) {
                subLabel = Math.max(1, Math.ceil(player.ultBeamTime / 60)) + 's';
            } else if (player.berserkerActive && player.berserkerTime > 0) {
                subLabel = Math.max(1, Math.ceil(player.berserkerTime / 60)) + 's';
            }
        } else if (ready) {
            subLabel = 'READY';
        }
        // Otherwise keep subLabel as ultType (e.g., BEAM, BERSERK, NOVA)
        
        ultBtn.innerHTML = `
            <span class="ability-main">ULTIMATE</span>
            <span class="ability-sub">${subLabel}</span>
        `;
        ultBtn.style.borderColor = ready ? ultColor : '';
        ultBtn.classList.toggle('ult-ready', ready);
        ultBtn.classList.toggle('ult-active', player.isUlting || (player.berserkerActive && player.berserkerTime > 0));
        ultBtn.classList.toggle('ult-channel', channeling);
        ultBtn.classList.toggle('ult-beam', beamPhase);
        ultBtn.classList.toggle('ult-disabled', !ready && !player.isUlting && !beamPhase && !(player.berserkerActive && player.berserkerTime > 0));
        ultBtn.classList.toggle('active-state', ready);
    }

    const turboBtn = document.getElementById('turbo-btn');
    if (turboBtn) {
        const charges = Math.max(0, player.turboCharges || 0);
        const cooldownFrames = Math.max(0, player.turboCooldown || 0);
        const turboActive = player.turboActive && player.turboTime > 0;
        const turboReady = !turboActive && charges > 0 && cooldownFrames <= 0;
        let subLabel = 'EMPTY';
        if (turboActive) subLabel = Math.max(1, Math.ceil((player.turboTime || 0) / 60)) + 's';
        else if (cooldownFrames > 0) subLabel = Math.max(1, Math.ceil(cooldownFrames / 60)) + 's';
        else if (charges > 0) subLabel = 'x' + charges;
        turboBtn.innerHTML = `
            <span class="ability-main">${turboActive ? 'BOOST' : 'TURBO'}</span>
            <span class="ability-sub">${subLabel}</span>
        `;
        turboBtn.classList.toggle('turbo-active', turboActive);
        turboBtn.classList.toggle('turbo-ready', turboReady);
        turboBtn.classList.toggle('turbo-disabled', !turboActive && !turboReady);
        turboBtn.classList.toggle('active-state', turboReady);
    }
    
    // Lifesteal timer display - REMOVED, lifesteal now shows in passive indicators only
    // The passive indicator in HUD bottom-left shows current lifesteal level
    const lifestealTimerEl = document.getElementById('lifesteal-timer');
    if (lifestealTimerEl) {
        lifestealTimerEl.style.display = 'none';
    }
    
    // Magnet timer - now displayed as bar above player tank (see render.js drawPlayerStatusBars)
    // Hide any existing popup timer
    const magnetTimerEl = document.getElementById('magnet-timer');
    if (magnetTimerEl) {
        magnetTimerEl.style.display = 'none';
    }
    
    // Wave transition timer display
    const waveTimerEl = document.getElementById('wave-timer');
    if (waveTimerEl) {
        if (typeof waveTransition !== 'undefined' && waveTransition && waveTransitionTimer > 0) {
            const secondsLeft = Math.ceil(waveTransitionTimer / 60);
            const intermissionRatio = Math.max(0, Math.min(1, 1 - (waveTransitionTimer / (WAVE_INTERMISSION_FRAMES || 600))));
            const nextWave = (player.currentWave || 1) + 1;
            const summary = (typeof waveRewardSummary !== 'undefined') ? waveRewardSummary : null;
            let rewardBlock = '';
            if (summary) {
                // Build reward items list
                let rewardItems = [];
                
                // HP and Energy restore REMOVED from wave rewards
                // Players must use item drops to heal - more strategic gameplay
                
                // Max HP bonus (EVERY wave now)
                if (summary.maxHpBonus > 0) {
                    rewardItems.push(`
                        <div class="reward-item reward-special">
                            <span class="reward-icon maxhp-icon">💪</span>
                            <span class="reward-label">Max HP</span>
                            <span class="reward-value reward-highlight">+${Math.floor(summary.maxHpBonus)}</span>
                        </div>
                    `);
                }
                
                // Max Energy bonus (EVERY wave now)
                if (summary.maxEnergyBonus > 0) {
                    rewardItems.push(`
                        <div class="reward-item reward-special">
                            <span class="reward-icon maxenergy-icon">🔋</span>
                            <span class="reward-label">Max Energy</span>
                            <span class="reward-value reward-highlight">+${Math.floor(summary.maxEnergyBonus)}</span>
                        </div>
                    `);
                }
                
                // Cooling Efficiency bonus (EVERY wave - guaranteed)
                // Higher cooling efficiency = slower heat buildup when shooting/taking damage
                if (summary.coolingBonus > 0) {
                    const coolingPercent = Math.round(summary.coolingBonus * 100);
                    rewardItems.push(`
                        <div class="reward-item reward-special">
                            <span class="reward-icon cooling-icon">❄️</span>
                            <span class="reward-label">Thermal Efficiency</span>
                            <span class="reward-value reward-highlight">+${coolingPercent}%</span>
                        </div>
                    `);
                }
                
                // Random item drop (ALWAYS 1 per wave)
                // On milestone waves (3, 6, 9), the drop IS revive
                // On other waves, it's a random item from the pool
                if (summary.rareDropName) {
                    const dropColor = summary.rareDropColor || '#fbbf24';
                    // Special handling for revive as the random drop on milestone waves
                    const isReviveDrop = summary.rareDropType === 'revive';
                    const dropIcon = isReviveDrop ? '💫' : '🎁';
                    const dropClass = isReviveDrop ? 'reward-revive' : 'reward-rare';
                    
                    rewardItems.push(`
                        <div class="reward-item ${dropClass}">
                            <span class="reward-icon drop-icon" style="color: ${dropColor};">${dropIcon}</span>
                            <span class="reward-label" style="color: ${dropColor};">${summary.rareDropName}</span>
                            <span class="reward-value" style="color: ${dropColor};">✓</span>
                        </div>
                    `);
                }
                
                rewardBlock = `
                    <div class="wave-reward-container">
                        <div class="reward-title">WAVE ${summary.waveNumber} REWARDS</div>
                        <div class="reward-list">
                            ${rewardItems.join('')}
                        </div>
                        ${summary.scoreBonus ? `<div class="reward-score">+${Number(summary.scoreBonus).toLocaleString()} pts</div>` : ''}
                        ${summary.perfectWave ? '<div class="reward-perfect">⭐ PERFECT WAVE!</div>' : ''}
                    </div>
                `;
            }
            waveTimerEl.style.display = 'block';
            waveTimerEl.innerHTML = `
                <div class="wave-intermission-title">INTERMISSION</div>
                <div class="wave-intermission-count">${secondsLeft}s</div>
                <div class="wave-intermission-subtitle">WAVE ${nextWave} INCOMING</div>
                <div class="wave-progress">
                    <div class="wave-progress-track">
                        <div class="wave-progress-fill" style="width: ${Math.round(intermissionRatio * 100)}%;"></div>
                    </div>
                </div>
                ${rewardBlock}
            `;
        } else {
            waveTimerEl.style.display = 'none';
        }
    }
    
    // Wave indicator with unique, challenging information
    const waveIndicatorEl = document.getElementById('wave-indicator');
    if (waveIndicatorEl) {
        const isBossActive = !!(typeof bossActive !== 'undefined' && bossActive && boss);
        waveIndicatorEl.classList.toggle('boss-indicator', isBossActive);
        if (isBossActive) {
            const hpRatio = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
            const hpPercent = Math.round(hpRatio * 100);
            const escortCount = enemies.reduce((sum, enemy) => sum + (enemy.isFinalEscort ? 1 : 0), 0);
            const bossPhase = boss.phase || 1;
            const bossState = boss.state ? boss.state.toUpperCase() : 'HOVER';
            
            // HP bar color based on phase
            let hpBarColor = '#22c55e'; // Green
            if (bossPhase === 2) hpBarColor = '#f97316'; // Orange
            if (bossPhase === 3) hpBarColor = '#ef4444'; // Red
            
            // Ultimate status
            let ultimateStatus = '';
            let ultimateColor = '#888';
            if (boss.ultimateState === 'charging') {
                const chargePercent = Math.round((boss.ultimateCharge / (typeof BOSS_CONFIG !== 'undefined' ? BOSS_CONFIG.ultimate.chargeTime : 180)) * 100);
                ultimateStatus = `CHARGING ${chargePercent}%`;
                ultimateColor = '#facc15'; // Yellow warning
            } else if (boss.ultimateState === 'firing') {
                ultimateStatus = '⚠ OMEGA BEAM ⚠';
                ultimateColor = '#ef4444'; // Red danger
            } else if (boss.ultimateCooldown > 0) {
                const cooldownSec = Math.ceil(boss.ultimateCooldown / 60);
                ultimateStatus = `COOLDOWN ${cooldownSec}s`;
                ultimateColor = '#666';
            } else {
                ultimateStatus = '⚠ READY ⚠';
                ultimateColor = '#ef4444';
            }
            
            // Active turret info (sequential system)
            const activeTurretIndex = boss.activeTurretIndex !== undefined ? boss.activeTurretIndex : 0;
            const activeTurret = boss.turrets && boss.turrets[activeTurretIndex] ? boss.turrets[activeTurretIndex] : null;
            const turretConfig = typeof BOSS_CONFIG !== 'undefined' && BOSS_CONFIG.turrets ? BOSS_CONFIG.turrets[activeTurretIndex] : null;
            const weaponLabel = activeTurret ? activeTurret.name : 'VOID LANCE';
            const weaponColor = activeTurret ? activeTurret.color : '#9333ea';
            
            // Turret energy display - use active turret's individual energy
            const turretEnergy = activeTurret ? activeTurret.energy : (boss.turretEnergy !== undefined ? boss.turretEnergy : 100);
            const turretMaxEnergy = activeTurret ? activeTurret.maxEnergy : (boss.turretMaxEnergy || BOSS_CONFIG.turretEnergy || 100);
            const energyPercent = Math.round((turretEnergy / turretMaxEnergy) * 100);
            const energyBarColor = energyPercent > 50 ? weaponColor : (energyPercent > 25 ? '#f97316' : '#ef4444');
            
            // Switch cooldown status
            const isSwitching = boss.turretSwitchCooldown > 0;
            const switchStatus = isSwitching ? 'SWITCHING...' : `${activeTurretIndex + 1}/7`;
            
            waveIndicatorEl.style.setProperty('--wave-progress', `${hpPercent}%`);
            waveIndicatorEl.innerHTML = `
                <div class="wave-title boss-title">OMEGA DESTROYER</div>
                <div class="boss-hp-track">
                    <div class="boss-hp-fill" style="width: ${hpPercent}%; background: linear-gradient(90deg, ${hpBarColor}, ${hpBarColor}dd);"></div>
                    <div class="boss-hp-text">${hpPercent}% · ${Math.max(0, Math.ceil(boss.hp)).toLocaleString()} HP</div>
                </div>
                <div class="boss-stat-row">
                    <div class="boss-stat">
                        <span class="stat-label">PHASE</span>
                        <span class="stat-number" style="color: ${hpBarColor};">${bossPhase}/3</span>
                    </div>
                    <div class="boss-stat">
                        <span class="stat-label">MODE</span>
                        <span class="stat-number">${bossState}</span>
                    </div>
                </div>
                <div class="boss-turret-row" style="background: rgba(0,0,0,0.4); border-radius: 4px; padding: 6px 8px; margin-top: 2px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span class="stat-label" style="color: ${weaponColor}; font-size: 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 85px;">▶ ${weaponLabel}</span>
                        <span style="font-size: 7px; color: ${isSwitching ? '#f97316' : '#888'};">${switchStatus}</span>
                    </div>
                    <div class="boss-energy-track" style="width: 100%; height: 8px; background: rgba(20,18,16,0.9); border-radius: 4px; overflow: hidden; border: 1px solid rgba(100,100,100,0.3);">
                        <div class="boss-energy-fill" style="width: ${energyPercent}%; height: 100%; background: linear-gradient(90deg, ${energyBarColor}, ${energyBarColor}cc); transition: width 0.15s ease;"></div>
                    </div>
                    <div style="font-size: 7px; color: #aaa; text-align: right; margin-top: 2px;">ENERGY ${energyPercent}%</div>
                </div>
                <div class="boss-ultimate-row" style="background: rgba(0,0,0,0.4); border-radius: 4px; padding: 4px 8px; margin-top: 2px; display: flex; justify-content: space-between; align-items: center;">
                    <span class="stat-label" style="font-size: 7px; text-transform: uppercase; letter-spacing: 0.5px;">ULTIMATE</span>
                    <span style="color: ${ultimateColor}; font-weight: bold; font-size: 8px; white-space: nowrap;">${ultimateStatus}</span>
                </div>
                <div class="boss-footer">
                    <span>${escortCount}x ESCORTS</span>
                    <span>${Math.max(0, player.killStreak || 0)}x STREAK</span>
                </div>
            `;
        } else {
            const currentWave = player.currentWave || 1;
            const enemiesPerWave = Math.max(1, player.enemiesPerWave || 15);
            const totalKilled = Math.max(0, (player.totalEnemiesInWave || 0) - enemies.length);
            const enemiesRemaining = Math.max(0, enemiesPerWave - totalKilled);
            const progress = Math.min(100, Math.max(0, (totalKilled / enemiesPerWave) * 100));
            const progressPercent = Math.round(progress);
            
            const difficultyMultiplier = (1 + (currentWave - 1) * 0.15).toFixed(1);
            let threatLevel = 'LOW';
            let threatColor = '#8bc34a';
            if (enemiesRemaining > enemiesPerWave * 0.7) {
                threatLevel = 'HIGH';
                threatColor = '#ff6600';
            } else if (enemiesRemaining > enemiesPerWave * 0.4) {
                threatLevel = 'MODERATE';
                threatColor = '#fbbf24';
            }
            
            const hpPercent = (player.hp / player.maxHp) * 100;
            let survivalRating = 'EXCELLENT';
            if (hpPercent < 30) survivalRating = 'CRITICAL';
            else if (hpPercent < 60) survivalRating = 'CAUTION';
            else if (hpPercent < 85) survivalRating = 'GOOD';
            
            let progressColor = '#8bc34a';
            let numberColor = '#d4c5b0';
            if (progress < 30) {
                progressColor = '#ef4444';
                numberColor = '#fca5a5';
            } else if (progress < 70) {
                progressColor = '#fb923c';
                numberColor = '#fed7aa';
            }
            
            waveIndicatorEl.style.setProperty('--wave-progress', `${progress}%`);
            waveIndicatorEl.style.setProperty('--wave-progress-color', progressColor);
            waveIndicatorEl.style.setProperty('--wave-accent', numberColor);
            
            const streakLabel = `${Math.max(0, player.killStreak || 0)}x STREAK`;
            
            waveIndicatorEl.innerHTML = `
                <div class="wave-title">WAVE ${currentWave}</div>
                <div class="wave-stat-row">
                    <div class="wave-stat">
                        <span class="stat-number">${enemiesRemaining}</span>
                        <span class="stat-label">HOSTILES</span>
                    </div>
                    <div class="wave-stat">
                        <span class="stat-number" style="color: ${threatColor};">${threatLevel}</span>
                        <span class="stat-label">THREAT</span>
                    </div>
                </div>
                <div class="wave-progress">
                    <div class="wave-progress-track">
                        <div class="wave-progress-bar"></div>
                    </div>
                    <div class="wave-progress-text">${progressPercent}% ELIMINATED</div>
                </div>
                <div class="wave-footer">
                    <span>${survivalRating} ${streakLabel}</span>
                    <span>x${difficultyMultiplier} DMG</span>
                </div>
            `;
        }

        // Wave indicator height is always fit to content (no min-height sync)
        waveIndicatorEl.style.minHeight = '';
        waveIndicatorEl.style.height = 'auto';
    }

    // Fade HUD when player is underneath it to maintain visibility
    const hudTopEl = document.querySelector('.hud-top');
    if (hudTopEl && typeof camX === 'number' && typeof camY === 'number' && CANVAS) {
        const canvasRect = CANVAS.getBoundingClientRect();
        if (canvasRect.width > 0 && canvasRect.height > 0 && CANVAS.width > 0 && CANVAS.height > 0) {
            const getScreenPosition = (worldX, worldY) => ({
                x: canvasRect.left + ((worldX - camX) / CANVAS.width) * canvasRect.width,
                y: canvasRect.top + ((worldY - camY) / CANVAS.height) * canvasRect.height
            });

            const overlapTargets = [getScreenPosition(player.x, player.y)];
            if (Array.isArray(enemies) && enemies.length) {
                const viewPadding = 60;
                const viewLeft = camX - viewPadding;
                const viewRight = camX + CANVAS.width + viewPadding;
                const viewTop = camY - viewPadding;
                const viewBottom = camY + CANVAS.height + viewPadding;

                for (const enemy of enemies) {
                    if (!enemy || typeof enemy.x !== 'number' || typeof enemy.y !== 'number') continue;
                    if (enemy.hp !== undefined && enemy.hp <= 0) continue;
                    if (enemy.x < viewLeft || enemy.x > viewRight || enemy.y < viewTop || enemy.y > viewBottom) continue;
                    overlapTargets.push(getScreenPosition(enemy.x, enemy.y));
                }
            }

            const isPortrait = window.matchMedia ? window.matchMedia('(orientation: portrait)').matches : window.innerHeight > window.innerWidth;
            const cameraTopClamped = camY <= 2;
            const cameraBottomClamped = camY >= Math.max(0, WORLD_H - CANVAS.height - 2);

            const checkOverlap = (el, targets) => {
                if (!el || !targets.length) return false;
                const rect = el.getBoundingClientRect();
                const buffer = 15;
                return targets.some(({ x, y }) => (
                    y >= rect.top - buffer &&
                    y <= rect.bottom + buffer &&
                    x >= rect.left - buffer &&
                    x <= rect.right + buffer
                ));
            };

            const statsPanel = document.querySelector('.stats-panel');
            const topRight = document.querySelector('.top-right');

            let ghostStats = checkOverlap(statsPanel, overlapTargets);
            let ghostTopRight = checkOverlap(topRight, overlapTargets);

            if (cameraTopClamped && overlapTargets.length) {
                const topEdgeBuffer = 20;
                if (statsPanel) {
                    const rect = statsPanel.getBoundingClientRect();
                    if (overlapTargets.some(({ x, y }) => y <= rect.bottom + topEdgeBuffer && x <= rect.right + topEdgeBuffer)) {
                        ghostStats = true;
                    }
                }
                if (topRight) {
                    const rect = topRight.getBoundingClientRect();
                    if (overlapTargets.some(({ x, y }) => y <= rect.bottom + topEdgeBuffer && x >= rect.left - topEdgeBuffer)) {
                        ghostTopRight = true;
                    }
                }
            }

            if (statsPanel) statsPanel.classList.toggle('hud-ghost', ghostStats);
            if (topRight) topRight.classList.toggle('hud-ghost', ghostTopRight);
			
            hudTopEl.classList.remove('hud-ghost');
        }
    }
}

function saveScore(s) {
    try {
        // Save last score
        localStorage.setItem('tankLastScore', s);
        
        // Update highest score
        let highestScore = parseInt(localStorage.getItem('tankHighestScore')) || 0;
        if (s > highestScore) {
            localStorage.setItem('tankHighestScore', s);
        }
        
        // Update display immediately
        if (typeof updateScoreDisplay === 'function') {
            updateScoreDisplay();
        } else if (typeof loadHighScores === 'function') {
            loadHighScores();
        }
    } catch (e) {}
}

function loadHighScores() {
    // Use the styled display from gameplay.js if available
    if (typeof updateScoreDisplay === 'function') {
        updateScoreDisplay();
        return;
    }

    try {
        const highestScore = parseInt(localStorage.getItem('tankHighestScore')) || 0;
        const lastScore = parseInt(localStorage.getItem('tankLastScore')) || 0;
        
        // Calculate digit class for dynamic font sizing
        // Different tiers ensure visible size differences across all score ranges
        const getDigitClass = (score) => {
            const digits = score.toString().length;
            if (digits >= 10) return 'digits-xlarge';  // 10+ digits: smallest
            if (digits >= 8) return 'digits-large';    // 8-9 digits
            if (digits >= 5) return 'digits-medium';   // 5-7 digits
            if (digits >= 3) return 'digits-normal';   // 3-4 digits
            return 'digits-small';                     // 1-2 digits: largest
        };
        
        const highDigitClass = getDigitClass(highestScore);
        const lastDigitClass = getDigitClass(lastScore);
        
        const highScoresDiv = document.getElementById('high-scores-list');
        if (highScoresDiv) {
            highScoresDiv.innerHTML = `
                <div class="score-card score-card-high" style="background: rgba(139, 195, 74, 0.15); border: 2px solid rgba(139, 195, 74, 0.4);">
                    <span class="score-label">High Score</span>
                    <span class="score-number score-number-high ${highDigitClass}" style="color: #8bc34a; text-shadow: 0 0 18px rgba(139, 195, 74, 0.9), 2px 2px 8px rgba(0, 0, 0, 0.9);">${highestScore.toLocaleString()}</span>
                </div>
                <div class="score-divider"></div>
                <div class="score-card score-card-last" style="background: rgba(212, 197, 176, 0.12); border: 2px solid rgba(212, 197, 176, 0.3);">
                    <span class="score-label">Last Score</span>
                    <span class="score-number score-number-last ${lastDigitClass}" style="color: #d4c5b0; text-shadow: 0 0 15px rgba(212, 197, 176, 0.6), 2px 2px 8px rgba(0, 0, 0, 0.9);">${lastScore.toLocaleString()}</span>
                </div>
            `;
        }
    } catch (e) {}
}

// Update passive item indicators in HUD (dmgmult, critical, etc.)
// Shows 2-letter icons matching item drop style with percentage values
function updatePassiveIndicators() {
    const container = document.getElementById('passive-indicators');
    if (!container) return;
    
    let indicators = [];
    
    // Damage Amplifier indicator (only show if > 1.0)
    // Icon: DA (Damage Amplifier) - matches item drop 2-letter style
    const dmgMult = player.baseDamageMultiplier || 1.0;
    if (dmgMult > 1.0) {
        const dmgPercent = Math.round((dmgMult - 1) * 100);
        indicators.push(`
            <div class="passive-indicator dmgmult" title="Damage Amplifier">
                <span class="passive-icon-text">DA</span>
                <span class="passive-percent">+${dmgPercent}%</span>
            </div>
        `);
    }
    
    // Critical Chance indicator (only show if > 0)
    // Icon: CR (Critical) - matches item drop 2-letter style
    const critChance = player.criticalChance || 0;
    if (critChance > 0) {
        const critPercent = Math.round(critChance * 100);
        indicators.push(`
            <div class="passive-indicator critical" title="Critical Chance">
                <span class="passive-icon-text">CR</span>
                <span class="passive-percent">${critPercent}%</span>
            </div>
        `);
    }
    
    // Thermal Efficiency indicator (only show if > 1.0)
    // Icon: TE (Thermal Efficiency) - matches item drop 2-letter style
    const coolEff = player.coolingEfficiency || 1.0;
    if (coolEff > 1.0) {
        // Display with max 2 decimal places
        const coolPercent = ((coolEff - 1) * 100).toFixed(2).replace(/\.?0+$/, '');
        indicators.push(`
            <div class="passive-indicator cooling" title="Thermal Efficiency">
                <span class="passive-icon-text">TE</span>
                <span class="passive-percent">+${coolPercent}%</span>
            </div>
        `);
    }
    
    // Lifesteal indicator (show if level > 0 OR lifesteal > 0)
    // Icon: LS (Lifesteal) - matches item drop 2-letter style
    const lifestealLevel = player.lifestealLevel || 0;
    const lifestealValue = player.lifesteal || 0;
    if (lifestealLevel > 0 || lifestealValue > 0) {
        // Use level-based percentage if level exists, otherwise calculate from lifesteal value
        const lifestealPercent = lifestealLevel > 0 
            ? lifestealLevel * 5 
            : Math.round(lifestealValue * 100);
        indicators.push(`
            <div class="passive-indicator lifesteal" title="Lifesteal">
                <span class="passive-icon-text">LS</span>
                <span class="passive-percent">${lifestealPercent}%</span>
            </div>
        `);
    }
    
    container.innerHTML = indicators.join('');
}
