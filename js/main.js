// Kick off initial resize plus leaderboard hydrate so menu shows latest data.
function initializeGame() {
    resize();
    loadHighScores();
    
    // Check for saved game and update continue button state
    updateContinueButtonState();
    
    // === MOBILE GPU PRE-WARM ===
    // Pre-render a frame to canvas BEFORE user starts game
    // This prevents "first frame glitch" on mobile devices where GPU shows
    // uninitialized buffer before first real frame is rendered
    preWarmCanvas();
}

// Pre-warm canvas to prevent first-frame glitch on mobile
// Mobile GPUs may show garbage/black frame if canvas was never drawn to
function preWarmCanvas() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    if (!canvas || !ctx) return;
    
    // Step 1: Ensure canvas has proper dimensions
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Step 2: Reset context state
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
    
    // Step 3: Fill with terrain color (what the game will show)
    ctx.fillStyle = '#8B9A6B';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Step 4: Draw a simple pattern to force GPU to initialize texture memory
    // This "wakes up" the GPU compositor for this canvas
    ctx.fillStyle = '#7A8A5B';
    for (let x = 0; x < canvas.width; x += 100) {
        for (let y = 0; y < canvas.height; y += 100) {
            ctx.fillRect(x, y, 50, 50);
        }
    }
    
    // Step 5: Clear and fill again with base color
    ctx.fillStyle = '#8B9A6B';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Step 6: Force GPU to process by reading a pixel (synchronous GPU flush)
    // This ensures the GPU has fully processed our pre-warm frame
    try {
        ctx.getImageData(0, 0, 1, 1);
    } catch (e) {
        // Ignore errors (CORS issues on some browsers)
    }
    
    console.log('[PreWarm] Main canvas GPU initialized (page load)');
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
// Also shows comprehensive benchmark HUD for performance monitoring
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
    
    // ===== DEMO BENCHMARK SYSTEM =====
    const benchmarkHud = document.getElementById('demo-benchmark-hud');
    const benchFps = document.getElementById('bench-fps');
    const benchAvg = document.getElementById('bench-avg');
    const benchMin = document.getElementById('bench-min');
    const benchMax = document.getElementById('bench-max');
    const benchMs = document.getElementById('bench-ms');
    const benchResolution = document.getElementById('bench-resolution');
    const benchQualityBadge = document.getElementById('bench-quality-badge');
    
    // Quality names mapping - matches GRAPHICS_QUALITY_LEVELS
    const QUALITY_NAMES = {
        0: { name: 'ULTRA', class: 'quality-ultra' },
        1: { name: 'HIGH', class: 'quality-high' },
        2: { name: 'MEDIUM', class: 'quality-medium' },
        3: { name: 'LOW', class: 'quality-low' },
        4: { name: 'VERY LOW', class: 'quality-verylow' },
        5: { name: 'LOWEST', class: 'quality-emergency' }
    };
    
    // Benchmark tracking variables
    let benchmarkActive = false;
    let benchFrameCount = 0;
    let benchLastTime = performance.now();
    let benchCurrentFps = 0;
    let benchFpsSamples = [];
    let benchMinFps = Infinity;
    let benchMaxFps = 0;
    let benchAnimationFrame = null;
    const BENCH_SAMPLE_SIZE = 120; // 2 seconds at 60fps
    const BENCH_UPDATE_INTERVAL = 200; // Update display every 200ms
    
    // Start benchmark monitoring
    function startBenchmark() {
        benchmarkActive = true;
        benchFrameCount = 0;
        benchLastTime = performance.now();
        benchFpsSamples = [];
        benchMinFps = Infinity;
        benchMaxFps = 0;
        
        // Show HUD with animation
        if (benchmarkHud) {
            benchmarkHud.classList.add('active');
        }
        
        // Start benchmark loop
        benchmarkLoop();
    }
    
    // Stop benchmark monitoring
    function stopBenchmark() {
        benchmarkActive = false;
        
        // Hide HUD with animation
        if (benchmarkHud) {
            benchmarkHud.classList.remove('active');
        }
        
        // Cancel animation frame
        if (benchAnimationFrame) {
            cancelAnimationFrame(benchAnimationFrame);
            benchAnimationFrame = null;
        }
    }
    
    // Benchmark update loop - runs independently of game loop
    function benchmarkLoop() {
        if (!benchmarkActive) return;
        
        benchAnimationFrame = requestAnimationFrame(benchmarkLoop);
        
        const now = performance.now();
        benchFrameCount++;
        
        const deltaTime = now - benchLastTime;
        
        // Update calculations at interval
        if (deltaTime >= BENCH_UPDATE_INTERVAL) {
            // Calculate current FPS
            benchCurrentFps = Math.round((benchFrameCount * 1000) / deltaTime);
            const frameTimeMs = (deltaTime / benchFrameCount).toFixed(1);
            
            // Add to samples
            benchFpsSamples.push(benchCurrentFps);
            if (benchFpsSamples.length > BENCH_SAMPLE_SIZE) {
                benchFpsSamples.shift();
            }
            
            // Calculate stats
            const avgFps = Math.round(benchFpsSamples.reduce((a, b) => a + b, 0) / benchFpsSamples.length);
            benchMinFps = Math.min(benchMinFps, benchCurrentFps);
            benchMaxFps = Math.max(benchMaxFps, benchCurrentFps);
            
            // Update HUD elements
            if (benchFps) {
                benchFps.textContent = benchCurrentFps;
                // Update color class
                benchFps.classList.remove('fps-caution', 'fps-warning', 'fps-critical');
                if (benchCurrentFps < 30) {
                    benchFps.classList.add('fps-critical');
                } else if (benchCurrentFps < 45) {
                    benchFps.classList.add('fps-warning');
                } else if (benchCurrentFps < 55) {
                    benchFps.classList.add('fps-caution');
                }
            }
            if (benchAvg) benchAvg.textContent = avgFps;
            if (benchMin) benchMin.textContent = benchMinFps === Infinity ? '--' : benchMinFps;
            if (benchMax) benchMax.textContent = benchMaxFps;
            if (benchMs) benchMs.textContent = frameTimeMs;
            
            // Update quality badge based on user's graphics settings
            const qualityLevel = (typeof graphicsQualityLevel !== 'undefined') ? graphicsQualityLevel : 5;
            const qualityInfo = QUALITY_NAMES[qualityLevel] || QUALITY_NAMES[5];
            
            if (benchQualityBadge) {
                benchQualityBadge.textContent = qualityInfo.name;
                // Remove all quality classes and add current one
                benchQualityBadge.classList.remove('quality-ultra', 'quality-high', 'quality-medium', 'quality-low', 'quality-verylow', 'quality-emergency');
                benchQualityBadge.classList.add(qualityInfo.class);
            }
            
            // Update resolution info - always 100% (no resolution scaling)
            if (benchResolution) {
                const dispW = (typeof displayWidth !== 'undefined') ? displayWidth : window.innerWidth;
                const dispH = (typeof displayHeight !== 'undefined') ? displayHeight : window.innerHeight;
                
                benchResolution.textContent = `${dispW} × ${dispH} (100%)`;
            }
            
            // Reset counters
            benchFrameCount = 0;
            benchLastTime = now;
        }
    }
    
    // Check if touch/click is on background (not on buttons/interactive elements)
    function isBackgroundClick(e) {
        const target = e.target;
        // Only trigger on overlay itself, not child elements like buttons
        return target === overlay || 
               target.classList.contains('title-text') ||
               target.classList.contains('opacity-80') ||
               target.classList.contains('score-list');
    }
    
    // Hide overlay content and start benchmark
    function hideContent() {
        if (overlay.classList.contains('hidden')) return;
        overlay.classList.add('content-hidden');
        isHolding = true;
        
        // Start benchmark monitoring
        startBenchmark();
    }
    
    // Show overlay content and stop benchmark
    function showContent() {
        overlay.classList.remove('content-hidden');
        isHolding = false;
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
        
        // Stop benchmark monitoring
        stopBenchmark();
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
