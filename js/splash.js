// Splash Screen Controller
// Handles splash screen animation and transitions with pagination

const splashScreen = document.getElementById('splash-screen');
let splashTimeout;
let currentPage = 1;
const totalPages = 3;

// Initialize splash screen
function initSplash() {
    // Auto-advance pages (no click required)
    splashTimeout = setTimeout(() => {
        nextPage();
    }, 2500);
}

// Navigate to next page
function nextPage() {
    if (!splashScreen || splashScreen.classList.contains('fade-out')) return;
    
    clearTimeout(splashTimeout);
    
    if (currentPage < totalPages) {
        // Move to next page
        const currentPageEl = document.querySelector(`.splash-page[data-page="${currentPage}"]`);
        const nextPageEl = document.querySelector(`.splash-page[data-page="${currentPage + 1}"]`);
        const currentDot = document.querySelector(`.dot[data-page="${currentPage}"]`);
        const nextDot = document.querySelector(`.dot[data-page="${currentPage + 1}"]`);
        
        if (currentPageEl && nextPageEl) {
            currentPageEl.classList.remove('active');
            currentPageEl.classList.add('prev');
            nextPageEl.classList.remove('next');
            nextPageEl.classList.add('active');
            
            if (currentDot) currentDot.classList.remove('active');
            if (nextDot) nextDot.classList.add('active');
            
            currentPage++;
            
            // Auto-advance to next page or dismiss
            splashTimeout = setTimeout(() => {
                nextPage();
            }, 3000);
        }
    } else {
        // Last page - dismiss splash
        dismissSplash();
    }
}

// Dismiss splash screen and show homepage
function dismissSplash() {
    // Prevent multiple calls
    if (!splashScreen || splashScreen.classList.contains('fade-out')) return;
    
    clearTimeout(splashTimeout);
    
    // Fade out splash
    splashScreen.classList.add('fade-out');
    
    // After fade animation, remove splash and show homepage
    setTimeout(() => {
        splashScreen.style.display = 'none';
        showHomepage();
    }, 800);
}

// Show homepage with demo battle background
function showHomepage() {
    // Show demo canvas
    const demoCanvas = document.getElementById('demoCanvas');
    if (demoCanvas) {
        demoCanvas.classList.add('active');
    }
    
    // Start demo battle
    if (typeof initDemo === 'function') {
        initDemo();
    }
    
    // Update score display
    if (typeof updateScoreDisplay === 'function') {
        updateScoreDisplay();
    }
    
    // Show overlay menu
    document.getElementById('overlay').classList.remove('hidden');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initSplash();
});
