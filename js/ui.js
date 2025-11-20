// Game over swaps to overlay, records score, and shows summary text.
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
    document.getElementById('hp-fill').style.width = Math.max(0, (player.hp / player.maxHp) * 100) + '%';
    document.getElementById('hp-text').innerText = Math.max(0, Math.ceil(player.hp)) + '/' + player.maxHp;
    
    // Revive indicator - always show
    const reviveEl = document.getElementById('revive-indicator');
    reviveEl.innerText = '❤️ ' + player.revives + 'x';
    
    let enPct = (player.energy / player.maxEnergy) * 100;
    document.getElementById('en-fill').style.width = enPct + '%';
    document.getElementById('en-text').innerText = Math.ceil(player.energy) + '%';
    document.getElementById('en-fill').style.background = player.overheated ? '#ef4444' : 'linear-gradient(90deg, #0891b2, #22d3ee)';
    document.getElementById('ks-fill').style.width = (player.killStreak / player.maxStreak) * 100 + '%';
    const wName = WEAPONS[player.weapon].name;
    const wEl = document.getElementById('weapon-name');
    if (wEl.innerText !== wName) {
        wEl.innerText = wName;
        wEl.style.color = WEAPONS[player.weapon].color;
    }
    if (player.ultReady) document.getElementById('ult-btn').classList.add('ult-active');
    else document.getElementById('ult-btn').classList.remove('ult-active');
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
        
        const highScoresDiv = document.getElementById('high-scores-list');
        if (highScoresDiv) {
            highScoresDiv.innerHTML = `
                <div class="score-card" style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 10px; background: rgba(139, 195, 74, 0.15); border-radius: 8px; border: 2px solid rgba(139, 195, 74, 0.4); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);">
                    <span style="color: #a89070; font-size: 10px; letter-spacing: 2px; font-weight: 700; text-transform: uppercase; opacity: 0.85;">High Score</span>
                    <span style="color: #8bc34a; font-weight: 900; font-size: 26px; font-family: 'Black Ops One', monospace; text-shadow: 0 0 18px rgba(139, 195, 74, 0.9), 2px 2px 8px rgba(0, 0, 0, 0.9); line-height: 1;">${highestScore.toLocaleString()}</span>
                </div>
                <div class="score-divider" style="width: 2px; height: 2px; background: linear-gradient(to bottom, transparent, rgba(139, 115, 85, 0.6), transparent); margin: 2px 0;"></div>
                <div class="score-card" style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 10px; background: rgba(212, 197, 176, 0.12); border-radius: 8px; border: 2px solid rgba(212, 197, 176, 0.3); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);">
                    <span style="color: #a89070; font-size: 10px; letter-spacing: 2px; font-weight: 700; text-transform: uppercase; opacity: 0.85;">Last Score</span>
                    <span style="color: #d4c5b0; font-weight: 900; font-size: 26px; font-family: 'Black Ops One', monospace; text-shadow: 0 0 15px rgba(212, 197, 176, 0.6), 2px 2px 8px rgba(0, 0, 0, 0.9); line-height: 1;">${lastScore.toLocaleString()}</span>
                </div>
            `;
        }
    } catch (e) {}
}
