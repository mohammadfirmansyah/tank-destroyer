// =============================================================================
// MUSIC MANAGER - Streaming Audio System with Fade Effects
// Handles background music for all game screens with smooth transitions
// =============================================================================

const MusicManager = (function() {
    // Audio elements for each screen (created on-demand for streaming)
    const tracks = {};
    
    // Track file paths
    const trackPaths = {
        opening: 'music/opening.mp3',
        home: 'music/home.mp3',
        achievement: 'music/achievement.mp3',
        game: 'music/game.mp3',
        pause: 'music/pause.mp3',
        failed: 'music/failed.mp3',
        victory: 'music/victory.mp3'
    };
    
    // Current state
    let currentTrack = null;
    let currentTrackName = null;
    let pausedTrack = null;
    let pausedTrackTime = 0;
    let isMusicEnabled = true;
    let isMuted = false;         // Mute state (music still plays but volume = 0)
    let masterVolume = 0.15;     // 15% volume as requested
    let fadeInterval = null;
    
    // User interaction state - required for browser autoplay policy
    let userHasInteracted = false;
    let pendingTrack = null;     // Track waiting to play after user interaction
    
    // Request ID to prevent race conditions when switching screens quickly
    let currentRequestId = 0;
    
    // Fade configuration
    const FADE_DURATION = 800;
    const FADE_STEPS = 20;
    
    // Load music preference from localStorage
    function loadPreference() {
        try {
            const savedEnabled = localStorage.getItem('tankDestroyer_musicEnabled');
            if (savedEnabled !== null) {
                isMusicEnabled = savedEnabled === 'true';
            }
            const savedMuted = localStorage.getItem('tankDestroyer_musicMuted');
            if (savedMuted !== null) {
                isMuted = savedMuted === 'true';
            }
        } catch (e) {
            console.warn('[Music] Could not load preference:', e);
        }
    }
    
    // Save music preference to localStorage
    function savePreference() {
        try {
            localStorage.setItem('tankDestroyer_musicEnabled', isMusicEnabled.toString());
            localStorage.setItem('tankDestroyer_musicMuted', isMuted.toString());
        } catch (e) {
            console.warn('[Music] Could not save preference:', e);
        }
    }
    
    // Create audio element on-demand
    function createTrack(name) {
        if (tracks[name]) return tracks[name];
        
        const audio = new Audio();
        audio.src = trackPaths[name];
        audio.loop = true;
        audio.volume = 0;
        audio.preload = 'none';
        
        tracks[name] = audio;
        return audio;
    }
    
    // Clear any existing fade interval
    function clearFade() {
        if (fadeInterval) {
            clearInterval(fadeInterval);
            fadeInterval = null;
        }
    }
    
    // Fade in audio from 0 to target volume
    function fadeIn(audio, targetVolume, duration) {
        return new Promise((resolve) => {
            if (!audio) { resolve(); return; }
            
            clearFade();
            
            // If muted, set volume to 0 but still "fade" for timing
            const actualTarget = isMuted ? 0 : targetVolume;
            const stepTime = duration / FADE_STEPS;
            const volumeStep = actualTarget / FADE_STEPS;
            let currentStep = 0;
            
            audio.volume = 0;
            
            fadeInterval = setInterval(() => {
                currentStep++;
                const newVolume = Math.min(actualTarget, volumeStep * currentStep);
                audio.volume = newVolume;
                
                if (currentStep >= FADE_STEPS) {
                    clearFade();
                    audio.volume = actualTarget;
                    resolve();
                }
            }, stepTime);
        });
    }
    
    // Fade out audio from current volume to 0
    function fadeOut(audio, duration = FADE_DURATION) {
        return new Promise((resolve) => {
            if (!audio || audio.paused) { resolve(); return; }
            
            clearFade();
            const startVolume = audio.volume;
            const stepTime = duration / FADE_STEPS;
            const volumeStep = startVolume / FADE_STEPS;
            let currentStep = 0;
            
            fadeInterval = setInterval(() => {
                currentStep++;
                const newVolume = Math.max(0, startVolume - (volumeStep * currentStep));
                audio.volume = newVolume;
                
                if (currentStep >= FADE_STEPS) {
                    clearFade();
                    audio.volume = 0;
                    audio.pause();
                    resolve();
                }
            }, stepTime);
        });
    }
    
    // Actually play a track (internal - assumes user has interacted)
    // Music plays even when muted (volume = 0) so it stays in sync
    async function playTrackInternal(trackName, forceRestart = false) {
        if (!trackPaths[trackName]) return;
        
        // Increment request ID - this invalidates any older pending requests
        const thisRequestId = ++currentRequestId;
        
        // If same track is already playing (not paused) and not forcing restart, just skip
        if (!forceRestart && currentTrackName === trackName && currentTrack && !currentTrack.paused) {
            return;
        }
        
        // If same track exists but is paused (and not forcing restart), resume it
        if (!forceRestart && currentTrackName === trackName && currentTrack && currentTrack.paused) {
            try {
                await currentTrack.play();
                await fadeIn(currentTrack, masterVolume, FADE_DURATION);
                console.log('[Music] Resumed:', trackName, 'muted:', isMuted);
                return;
            } catch (e) {
                console.warn('[Music] Failed to resume, will create new track');
                // Fall through to create new track
            }
        }
        
        // IMMEDIATELY stop all other tracks (no waiting for fade)
        // This prevents race conditions when switching screens quickly
        for (const [name, track] of Object.entries(tracks)) {
            if (track && !track.paused && name !== trackName) {
                track.volume = 0;
                track.pause();
                track.currentTime = 0;
                console.log('[Music] Stopped:', name);
            }
        }
        
        // Also stop current track if it's different or forcing restart
        if (currentTrack && (currentTrackName !== trackName || forceRestart) && !currentTrack.paused) {
            currentTrack.volume = 0;
            currentTrack.pause();
            if (forceRestart) {
                currentTrack.currentTime = 0;
            }
        }
        
        // Check if a newer request came in during the stops
        if (thisRequestId !== currentRequestId) {
            console.log('[Music] Newer request detected, aborting this one');
            return;
        }
        
        // Create and play new track
        const newTrack = createTrack(trackName);
        if (!newTrack) return;
        
        // Reset track to beginning for fresh start
        newTrack.currentTime = 0;
        
        currentTrack = newTrack;
        currentTrackName = trackName;
        
        try {
            await newTrack.play();
            // Check if newer request came in - if so, stop this track and let newer one handle it
            if (thisRequestId !== currentRequestId) {
                newTrack.pause();
                newTrack.currentTime = 0;
                console.log('[Music] Newer request during play, stopping this track');
                return;
            }
            await fadeIn(newTrack, masterVolume, FADE_DURATION);
            console.log('[Music] Now playing:', trackName, 'muted:', isMuted);
        } catch (e) {
            // If play fails, retry once after short delay
            // Browser sometimes needs a moment after user interaction
            console.warn('[Music] Play failed, retrying...', trackName);
            pendingTrack = trackName;
            
            // Retry after 100ms - don't reset userHasInteracted
            const retryRequestId = thisRequestId;
            setTimeout(async () => {
                // Only retry if this request is still valid
                if (retryRequestId !== currentRequestId) return;
                try {
                    await newTrack.play();
                    if (retryRequestId !== currentRequestId) {
                        newTrack.pause();
                        return;
                    }
                    await fadeIn(newTrack, masterVolume, FADE_DURATION);
                    console.log('[Music] Retry successful:', trackName);
                    pendingTrack = null;
                } catch (retryError) {
                    console.warn('[Music] Retry also failed, waiting for next interaction');
                }
            }, 100);
        }
    }
    
    // Public play function - handles user interaction requirement
    async function play(trackName, forceRestart = false) {
        // Always update pending track to latest request
        pendingTrack = trackName;
        
        if (userHasInteracted) {
            await playTrackInternal(trackName, forceRestart);
        } else {
            console.log('[Music] Queued track (waiting for interaction):', trackName);
        }
    }
    
    // Restart game music from beginning (for deploy/restart)
    async function restartGameMusic() {
        if (userHasInteracted) {
            await playTrackInternal('game', true); // Force restart
        } else {
            pendingTrack = 'game';
        }
    }
    
    // Called when user interacts with page - enables audio playback
    function onUserInteraction() {
        const wasInteracted = userHasInteracted;
        userHasInteracted = true;
        
        // Always try to play pending track on interaction (helps with browser timing)
        if (pendingTrack) {
            if (!wasInteracted) {
                console.log('[Music] First interaction detected, playing:', pendingTrack);
            } else {
                console.log('[Music] Re-trying pending track:', pendingTrack);
            }
            const trackToPlay = pendingTrack;
            pendingTrack = null;
            playTrackInternal(trackToPlay);
        }
    }
    
    // Stop current track with fade out
    async function stop() {
        if (currentTrack) {
            await fadeOut(currentTrack);
            currentTrack.currentTime = 0;
            currentTrack = null;
            currentTrackName = null;
        }
        pendingTrack = null;
    }
    
    // Pause game music and play pause music
    async function pauseGameMusic() {
        if (currentTrackName === 'game' && currentTrack) {
            pausedTrack = currentTrack;
            pausedTrackTime = currentTrack.currentTime;
            await fadeOut(currentTrack, FADE_DURATION / 2);
            currentTrack = null;
            currentTrackName = null;
        }
        await play('pause');
    }
    
    // Resume game music from where it was paused
    async function resumeGameMusic() {
        // Fade out pause music
        if (currentTrackName === 'pause' && currentTrack) {
            await fadeOut(currentTrack, FADE_DURATION / 2);
            currentTrack.currentTime = 0;
        }
        
        // Resume game music if it was paused
        if (pausedTrack && isMusicEnabled && userHasInteracted) {
            currentTrack = pausedTrack;
            currentTrackName = 'game';
            currentTrack.currentTime = pausedTrackTime;
            
            try {
                await currentTrack.play();
                await fadeIn(currentTrack, masterVolume, FADE_DURATION);
            } catch (e) {
                console.warn('[Music] Could not resume game music:', e);
            }
            
            pausedTrack = null;
            pausedTrackTime = 0;
        }
    }
    
    // Toggle mute on/off (music continues playing but volume = 0)
    function toggle() {
        isMuted = !isMuted;
        savePreference();
        console.log('[Music] Mute toggled, muted:', isMuted);
        
        // Mark user interaction (clicking toggle button is a user gesture)
        userHasInteracted = true;
        
        // Clear any ongoing fade to ensure immediate volume change
        clearFade();
        
        if (isMuted) {
            // Muting - set volume to 0 immediately
            if (currentTrack) {
                currentTrack.volume = 0;
                console.log('[Music] Muted, volume set to 0');
            }
        } else {
            // Unmuting - restore volume or start music if not playing
            if (currentTrack && !currentTrack.paused) {
                // Track is playing, just restore volume immediately
                currentTrack.volume = masterVolume;
                console.log('[Music] Unmuted, volume restored to:', masterVolume);
            } else {
                // No track playing or track is paused - determine which track to play
                // Priority: currentTrackName > pendingTrack > game state > default
                let trackToPlay = 'home'; // Default to home
                
                // First, use currentTrackName if we have one (most accurate)
                if (currentTrackName) {
                    trackToPlay = currentTrackName;
                }
                // Then check pending track
                else if (pendingTrack) {
                    trackToPlay = pendingTrack;
                }
                // Finally, check game state
                else if (typeof state !== 'undefined') {
                    if (state === 'PLAYING') {
                        trackToPlay = 'game';
                    } else if (state === 'PAUSED') {
                        trackToPlay = 'pause';
                    } else if (state === 'GAMEOVER') {
                        trackToPlay = 'failed';
                    } else if (state === 'VICTORY') {
                        trackToPlay = 'victory';
                    }
                }
                
                console.log('[Music] Unmuted, starting track:', trackToPlay);
                playTrackInternal(trackToPlay);
            }
        }
        
        // Return true if music is ON (not muted)
        return !isMuted;
    }
    
    // Check if music is enabled (not muted)
    function isEnabled() {
        return !isMuted;
    }
    
    // Check if user has interacted
    function hasUserInteracted() {
        return userHasInteracted;
    }
    
    // Set master volume (0.0 - 1.0)
    function setVolume(volume) {
        masterVolume = Math.max(0, Math.min(1, volume));
        if (currentTrack && isMusicEnabled) {
            currentTrack.volume = masterVolume;
        }
    }
    
    // Get current track time (for saving)
    function getCurrentTime(trackName) {
        if (trackName) {
            const track = tracks[trackName];
            return track ? track.currentTime : 0;
        }
        return currentTrack ? currentTrack.currentTime : 0;
    }
    
    // Get current track name
    function getCurrentTrackName() {
        return currentTrackName;
    }
    
    // Play track at specific time (for loading saved game)
    async function playAtTime(trackName, time) {
        if (!trackPaths[trackName]) return;
        
        // Increment request ID
        const thisRequestId = ++currentRequestId;
        
        // IMPORTANT: Stop ALL other tracks immediately
        for (const [name, track] of Object.entries(tracks)) {
            if (track && !track.paused) {
                clearFade();
                track.volume = 0;
                track.pause();
                console.log('[Music] Force stopped:', name);
            }
        }
        
        // Create and play new track
        const newTrack = createTrack(trackName);
        if (!newTrack) return;
        
        // Set to saved time
        newTrack.currentTime = time || 0;
        
        currentTrack = newTrack;
        currentTrackName = trackName;
        
        if (!userHasInteracted) {
            pendingTrack = trackName;
            console.log('[Music] Queued track at time (waiting for interaction):', trackName, time);
            return;
        }
        
        try {
            await newTrack.play();
            if (thisRequestId !== currentRequestId) {
                newTrack.pause();
                return;
            }
            await fadeIn(newTrack, masterVolume, FADE_DURATION);
            console.log('[Music] Now playing at time:', trackName, 'time:', time, 'muted:', isMuted);
        } catch (e) {
            console.warn('[Music] Play at time failed:', e);
            pendingTrack = trackName;
        }
    }
    
    // Initialize
    function init() {
        loadPreference();
        
        // Listen for ANY user interaction to unlock audio
        const unlockAudio = () => {
            onUserInteraction();
        };
        
        // Multiple events to catch first interaction
        document.addEventListener('click', unlockAudio, { once: false });
        document.addEventListener('touchstart', unlockAudio, { once: false });
        document.addEventListener('keydown', unlockAudio, { once: false });
        
        console.log('[Music] Initialized, enabled:', isMusicEnabled, 'volume:', masterVolume);
    }
    
    // Public API
    return {
        init,
        play,
        stop,
        toggle,
        isEnabled,
        hasUserInteracted,
        setVolume,
        pauseGameMusic,
        resumeGameMusic,
        restartGameMusic,
        onUserInteraction,
        getCurrentTime,
        getCurrentTrackName,
        playAtTime,
        TRACKS: {
            OPENING: 'opening',
            HOME: 'home',
            ACHIEVEMENT: 'achievement',
            GAME: 'game',
            PAUSE: 'pause',
            FAILED: 'failed',
            VICTORY: 'victory'
        }
    };
})();

// Initialize music manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    MusicManager.init();
});
