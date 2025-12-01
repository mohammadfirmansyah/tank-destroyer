// Splash Screen Controller
// Handles splash screen animation and transitions with dramatic effects

const splashScreen = document.getElementById('splash-screen');
let splashTimeout;
let currentPage = 1;
const totalPages = 3;
let assetsLoaded = false;

// Array of transition effects for variety
// All pages now use ethereal-fade for consistent blur + opacity ease-in-out transition
const transitionEffects = [
    'ethereal-fade',   // Page 1 to 2: soft mystical blur + opacity
    'ethereal-fade',   // Page 2 to 3: soft mystical blur + opacity
    'ethereal-fade'    // Page 3 dismiss: soft mystical disappearance
];

// Wait for all assets (fonts, images, stylesheets) to be loaded
function waitForAssets() {
    return new Promise((resolve) => {
        // Check if document is already complete
        if (document.readyState === 'complete') {
            // Wait for fonts to be ready
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(() => {
                    // Add a small buffer to ensure CSS transitions are ready
                    setTimeout(resolve, 100);
                });
            } else {
                setTimeout(resolve, 100);
            }
        } else {
            // Wait for window load event
            window.addEventListener('load', () => {
                if (document.fonts && document.fonts.ready) {
                    document.fonts.ready.then(() => {
                        setTimeout(resolve, 100);
                    });
                } else {
                    setTimeout(resolve, 100);
                }
            });
        }
    });
}

// Fade in body by adding loaded class
function revealPage() {
    return new Promise((resolve) => {
        document.body.classList.add('loaded');
        // Shorter wait - page entrance starts earlier for smoother experience
        setTimeout(resolve, 400);
    });
}

// Initialize splash screen with entrance animation
function initSplash() {
    // Wait for all assets to load first
    waitForAssets().then(() => {
        assetsLoaded = true;
        
        // === MOBILE GPU PRE-WARM ===
        // Pre-warm canvas BEFORE any game/demo starts
        // This prevents "first frame glitch" on mobile devices
        if (typeof preWarmCanvas === 'function') {
            preWarmCanvas();
        }
        
        // Create particles immediately - they appear with loading bar
        createSplashParticles();
        
        // Fade in body (from opacity 0 to 1)
        // Splash screen is visible immediately as body fades in
        // Start splash animations earlier for smoother, longer fade-in effect
        revealPage().then(() => {
            // Body is now fading in, start splash page animation concurrently
            // This creates an elegant, earlier appearance of page 1
            startSplashAnimations();
        });
    });
}

// Start the actual splash screen animations
function startSplashAnimations() {
    // Request opening music immediately - MusicManager will queue it
    // until user interacts with the page (browser autoplay policy)
    if (typeof MusicManager !== 'undefined') {
        MusicManager.play('opening');
    }
    
    // Add initial entrance effect to first page
    const firstPage = document.querySelector('.splash-page[data-page="1"]');
    const firstDot = document.querySelector('.dot[data-page="1"]');
    
    if (firstPage) {
        // Add active class to show page 1 and trigger entrance animation
        firstPage.classList.add('active', 'entrance');
        
        // Activate first pagination dot
        if (firstDot) {
            firstDot.classList.add('active');
        }
        
        // Remove entrance class after animation completes
        setTimeout(() => {
            firstPage.classList.remove('entrance');
        }, 1200);
    }
    
    // Auto-advance pages
    splashTimeout = setTimeout(() => {
        nextPage();
    }, 3000);
}

// Create floating particles for visual interest
function createSplashParticles() {
    // Add particles to splash-screen (not splash-content) so they can be behind content
    const splashScreenEl = document.getElementById('splash-screen');
    if (!splashScreenEl) return;
    
    // Remove existing particles
    const existingParticles = splashScreenEl.querySelectorAll('.splash-particle');
    existingParticles.forEach(p => p.remove());
    
    // Create new particles - positioned behind splash-content (z-index: 0)
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'splash-particle';
        particle.style.cssText = `
            position: absolute;
            width: ${Math.random() * 4 + 2}px;
            height: ${Math.random() * 4 + 2}px;
            background: rgba(139, 195, 74, ${Math.random() * 0.5 + 0.3});
            border-radius: 50%;
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            animation: floatParticle ${Math.random() * 3 + 2}s ease-in-out infinite;
            animation-delay: ${Math.random() * 2}s;
            pointer-events: none;
            z-index: 0;
        `;
        splashScreenEl.appendChild(particle);
    }
}

// Navigate to next page with dramatic transition
function nextPage() {
    if (!splashScreen || splashScreen.classList.contains('fade-out')) return;
    
    clearTimeout(splashTimeout);
    
    if (currentPage < totalPages) {
        // Get pages and effect type
        const currentPageEl = document.querySelector(`.splash-page[data-page="${currentPage}"]`);
        const nextPageEl = document.querySelector(`.splash-page[data-page="${currentPage + 1}"]`);
        const currentDot = document.querySelector(`.dot[data-page="${currentPage}"]`);
        const nextDot = document.querySelector(`.dot[data-page="${currentPage + 1}"]`);
        
        if (currentPageEl && nextPageEl) {
            // Apply transition effect
            const effectIndex = currentPage - 1;
            const effect = transitionEffects[effectIndex] || 'slide-left';
            
            // Add transition classes
            currentPageEl.classList.add(`exit-${effect}`);
            nextPageEl.classList.add(`enter-${effect}`);
            
            // Delay class changes to allow exit animation to be visible
            // Wait for 60% of animation (1.1s) before switching pages
            setTimeout(() => {
                currentPageEl.classList.remove('active');
                currentPageEl.classList.add('prev');
                nextPageEl.classList.remove('next');
                nextPageEl.classList.add('active');
                
                // Update dots with pulse effect
                if (currentDot) {
                    currentDot.classList.remove('active');
                    currentDot.classList.add('pulse-out');
                }
                if (nextDot) {
                    nextDot.classList.add('active', 'pulse-in');
                }
            }, 700);
            
            // Clean up transition classes after animation completes (1.2s duration + buffer)
            setTimeout(() => {
                currentPageEl.classList.remove(`exit-${effect}`);
                nextPageEl.classList.remove(`enter-${effect}`);
                if (currentDot) currentDot.classList.remove('pulse-out');
                if (nextDot) nextDot.classList.remove('pulse-in');
            }, 1400);
            
            currentPage++;
            
            // Auto-advance to next page or dismiss
            splashTimeout = setTimeout(() => {
                nextPage();
            }, 3500);
        }
    } else {
        // Last page - dismiss splash with dramatic effect
        dismissSplash();
    }
}

// Dismiss splash screen with ethereal fade animation
function dismissSplash() {
    // Prevent multiple calls
    if (!splashScreen || splashScreen.classList.contains('fade-out')) return;
    
    clearTimeout(splashTimeout);
    
    // Apply ethereal fade to the last page
    const lastPage = document.querySelector(`.splash-page[data-page="${totalPages}"]`);
    if (lastPage) {
        lastPage.classList.add('exit-ethereal-fade');
    }
    
    // Add dramatic exit animation to container
    splashScreen.classList.add('dramatic-exit');
    
    // IMPROVEMENT: Start demo early (behind splash) for seamless transition
    // This ensures the demo background is already rendering when splash fades
    if (typeof initDemo === 'function') {
        initDemo();
        console.log('[Splash] Demo started early for smooth transition');
    }
    
    // After initial effect, start fade out
    setTimeout(() => {
        splashScreen.classList.add('fade-out');
    }, 600); // Reduced from 800ms for snappier feel
    
    // After fade animation, remove splash and show homepage UI
    setTimeout(() => {
        splashScreen.style.display = 'none';
        showHomepage();
    }, 1400); // Reduced from 1800ms (600 + 800 animation)
}

// Show homepage with demo battle background
function showHomepage() {
    // Switch to home music when homepage shows
    if (typeof MusicManager !== 'undefined') {
        MusicManager.play('home');
    }
    
    // NOTE: Demo is now started early in dismissSplash() for smooth transition
    // No need to call initDemo() here - it's already running behind the splash
    
    // Update score display
    if (typeof updateScoreDisplay === 'function') {
        updateScoreDisplay();
    }
    
    // Show overlay menu with smooth entrance animation
    const overlay = document.getElementById('overlay');
    if (overlay) {
        // Ensure overlay starts invisible for smooth fade-in
        overlay.style.opacity = '0';
        overlay.classList.remove('hidden');
        
        // Trigger reflow to ensure transition works
        void overlay.offsetWidth;
        
        // Smooth fade in with transform
        overlay.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
        overlay.style.opacity = '1';
        overlay.classList.add('menu-entrance');
        
        setTimeout(() => {
            overlay.classList.remove('menu-entrance');
            // Clean up inline styles after animation
            overlay.style.transition = '';
        }, 600);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initSplash();
    
    // Add click/tap listener to advance splash and trigger music
    const splashEl = document.getElementById('splash-screen');
    if (splashEl) {
        const advanceSplash = (e) => {
            // Notify MusicManager of user interaction
            if (typeof MusicManager !== 'undefined') {
                MusicManager.onUserInteraction();
            }
            nextPage();
        };
        splashEl.addEventListener('click', advanceSplash);
        splashEl.addEventListener('touchstart', advanceSplash, { passive: true });
    }
});
