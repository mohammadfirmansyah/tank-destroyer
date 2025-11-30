// Kick off initial resize plus leaderboard hydrate so menu shows latest data.
function initializeGame() {
    resize();
    loadHighScores();
    
    // Check for saved game and update continue button state
    updateContinueButtonState();
}

// Update continue button state based on save availability
function updateContinueButtonState() {
    const resumeGameBtn = document.getElementById('resume-game-btn');
    if (resumeGameBtn) {
        if (typeof hasSaveGame === 'function' && hasSaveGame()) {
            resumeGameBtn.classList.remove('inactive');
        } else {
            resumeGameBtn.classList.add('inactive');
        }
    }
}

initializeGame();

// ===== HOMEPAGE HOLD-TO-HIDE FEATURE =====
// Allows users to hold on overlay background to hide UI and enjoy demo battle
(function initHomepageHoldToHide() {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    
    // Add hint text element for "Release to show" message
    const hintEl = document.createElement('div');
    hintEl.className = 'hold-hint';
    hintEl.textContent = 'RELEASE TO SHOW MENU';
    overlay.appendChild(hintEl);
    
    let holdTimer = null;
    let isHolding = false;
    const HOLD_DELAY = 300; // ms before triggering hide (prevents accidental triggers)
    
    // Check if touch/click is on background (not on buttons/interactive elements)
    function isBackgroundClick(e) {
        const target = e.target;
        // Only trigger on overlay itself, not child elements like buttons
        return target === overlay || 
               target.classList.contains('title-text') ||
               target.classList.contains('opacity-80') ||
               target.classList.contains('score-list');
    }
    
    // Hide overlay content
    function hideContent() {
        if (overlay.classList.contains('hidden')) return; // Don't hide if overlay is already hidden
        overlay.classList.add('content-hidden');
        isHolding = true;
    }
    
    // Show overlay content
    function showContent() {
        overlay.classList.remove('content-hidden');
        isHolding = false;
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
    }
    
    // Handle hold start (touch/mouse down)
    function handleHoldStart(e) {
        if (!isBackgroundClick(e)) return;
        if (overlay.classList.contains('hidden')) return;
        
        // Prevent default to avoid text selection on desktop
        if (e.type === 'mousedown') {
            e.preventDefault();
        }
        
        // Start delay timer before hiding
        holdTimer = setTimeout(() => {
            hideContent();
        }, HOLD_DELAY);
    }
    
    // Handle hold end (touch/mouse up)
    function handleHoldEnd(e) {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
        if (isHolding) {
            showContent();
        }
    }
    
    // Handle touch/mouse leave (cancel hold if pointer exits)
    function handleHoldCancel(e) {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
        if (isHolding) {
            showContent();
        }
    }
    
    // Touch events (mobile)
    overlay.addEventListener('touchstart', handleHoldStart, { passive: true });
    overlay.addEventListener('touchend', handleHoldEnd);
    overlay.addEventListener('touchcancel', handleHoldCancel);
    
    // Mouse events (desktop)
    overlay.addEventListener('mousedown', handleHoldStart);
    overlay.addEventListener('mouseup', handleHoldEnd);
    overlay.addEventListener('mouseleave', handleHoldCancel);
    
    // Prevent context menu from appearing on long press
    overlay.addEventListener('contextmenu', (e) => {
        if (isHolding) {
            e.preventDefault();
        }
    });
})();
