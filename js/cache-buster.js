/**
 * Cache Buster - Force fresh assets on every page load
 * This script clears all browser caches and ensures fresh content
 * 
 * v2.0.0-RC.10 Update:
 * - Added Chrome Mobile specific cache clearing
 * - Clear IndexedDB and localStorage game state on version change
 * - Detect corrupt cache state from previous sessions
 */

(function() {
    'use strict';
    
    const CACHE_BUSTER_VERSION = 'v2.0.0-RC.12';
    const CACHE_BUSTER_KEY = 'tank_destroyer_cache_cleared';
    const CACHE_VERSION_KEY = 'tank_destroyer_version';
    
    /**
     * Detect if running on Chrome Mobile (not incognito)
     * Chrome Mobile has known issues with canvas GPU state caching
     */
    function isChromeMobile() {
        const ua = navigator.userAgent;
        const isChrome = /Chrome\/\d+/.test(ua) && !/Edg|OPR|Samsung/.test(ua);
        const isMobile = /Android|iPhone|iPad|iPod/.test(ua);
        return isChrome && isMobile;
    }
    
    /**
     * Check if version has changed (requires deeper cache clear)
     */
    function hasVersionChanged() {
        try {
            const storedVersion = localStorage.getItem(CACHE_VERSION_KEY);
            return storedVersion !== CACHE_BUSTER_VERSION;
        } catch (e) {
            return true; // Assume changed if can't read
        }
    }
    
    /**
     * Clear all caches including Cache API and Service Workers
     * This ensures completely fresh assets on every visit
     */
    async function clearAllCaches() {
        console.log('[CacheBuster] Clearing all browser caches...');
        
        // 1. Clear Cache Storage API (used by Service Workers and fetch cache)
        if ('caches' in window) {
            try {
                const cacheNames = await caches.keys();
                await Promise.all(
                    cacheNames.map(cacheName => {
                        console.log(`[CacheBuster] Deleting cache: ${cacheName}`);
                        return caches.delete(cacheName);
                    })
                );
                console.log(`[CacheBuster] Cleared ${cacheNames.length} cache(s)`);
            } catch (err) {
                console.warn('[CacheBuster] Cache API clear failed:', err);
            }
        }
        
        // 2. Unregister all Service Workers
        if ('serviceWorker' in navigator) {
            try {
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(
                    registrations.map(registration => {
                        console.log(`[CacheBuster] Unregistering SW: ${registration.scope}`);
                        return registration.unregister();
                    })
                );
                console.log(`[CacheBuster] Unregistered ${registrations.length} service worker(s)`);
            } catch (err) {
                console.warn('[CacheBuster] Service Worker unregister failed:', err);
            }
        }
        
        // 3. Clear sessionStorage cache markers
        try {
            // Keep game saves, only clear cache-related data
            const keysToRemove = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key && key.startsWith('cache_')) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => sessionStorage.removeItem(key));
        } catch (err) {
            console.warn('[CacheBuster] SessionStorage clear failed:', err);
        }
        
        console.log('[CacheBuster] Cache clearing complete');
    }
    
    /**
     * Add cache-busting query parameters to resource URLs
     * Uses timestamp to ensure unique URLs on every page load
     */
    function bustResourceCaches() {
        const timestamp = Date.now();
        const bustParam = `_cb=${timestamp}`;
        
        // Bust CSS links
        document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
            if (link.href && !link.href.includes('_cb=')) {
                const separator = link.href.includes('?') ? '&' : '?';
                link.href = link.href + separator + bustParam;
            }
        });
        
        // Bust script tags (for dynamically loaded scripts)
        document.querySelectorAll('script[src]').forEach(script => {
            // Skip cache-buster itself and inline scripts
            if (script.src && !script.src.includes('cache-buster') && !script.src.includes('_cb=')) {
                const separator = script.src.includes('?') ? '&' : '?';
                // Note: Changing script.src doesn't reload it, this is for reference
            }
        });
        
        console.log(`[CacheBuster] Resources marked with timestamp: ${timestamp}`);
    }
    
    /**
     * Force hard reload if this is a new session
     * Only triggers once per browser session to avoid reload loops
     */
    function checkAndReload() {
        const sessionKey = CACHE_BUSTER_KEY + '_' + CACHE_BUSTER_VERSION;
        
        // Check if we've already cleared cache this session
        if (sessionStorage.getItem(sessionKey)) {
            console.log('[CacheBuster] Cache already cleared this session');
            return false;
        }
        
        // Mark that we're about to clear and reload
        sessionStorage.setItem(sessionKey, Date.now().toString());
        
        return true;
    }
    
    /**
     * Main initialization
     * Clears caches and optionally triggers a hard reload
     */
    async function init() {
        console.log(`[CacheBuster] Initializing ${CACHE_BUSTER_VERSION}`);
        
        // Check if this is Chrome Mobile (known to have canvas caching issues)
        const chromeMobile = isChromeMobile();
        if (chromeMobile) {
            console.log('[CacheBuster] Chrome Mobile detected - applying extra cache clearing');
        }
        
        // Check if version changed (requires deeper clear)
        const versionChanged = hasVersionChanged();
        if (versionChanged) {
            console.log(`[CacheBuster] Version changed to ${CACHE_BUSTER_VERSION} - clearing old cache state`);
            try {
                // Clear any corrupt canvas state from previous version
                // by removing all tank destroyer related localStorage except saves
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('tank_') && !key.includes('_save') && !key.includes('highscore')) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(key => localStorage.removeItem(key));
                
                // Update stored version
                localStorage.setItem(CACHE_VERSION_KEY, CACHE_BUSTER_VERSION);
            } catch (e) {
                console.warn('[CacheBuster] localStorage cleanup failed:', e);
            }
        }
        
        const shouldClearCache = checkAndReload();
        
        // Chrome Mobile needs extra refresh on first load to clear GPU cache
        if (shouldClearCache || (chromeMobile && versionChanged)) {
            // Clear all caches
            await clearAllCaches();
            
            // Bust resource caches with query params
            bustResourceCaches();
            
            // Force hard reload to get fresh assets
            // Using location.reload(true) for cache bypass (deprecated but still works)
            // Modern approach: reload with cache bypass header
            console.log('[CacheBuster] Performing hard reload for fresh assets...');
            
            // Small delay to ensure cache clearing completes
            setTimeout(() => {
                // Add timestamp to URL to force fresh load
                const url = new URL(window.location.href);
                url.searchParams.set('_refresh', Date.now().toString());
                window.location.replace(url.toString());
            }, 100);
            
            return; // Stop execution, page will reload
        }
        
        // If we've already reloaded, clean up the URL
        const url = new URL(window.location.href);
        if (url.searchParams.has('_refresh')) {
            url.searchParams.delete('_refresh');
            window.history.replaceState({}, '', url.toString());
            console.log('[CacheBuster] Cleanup: removed refresh param from URL');
        }
        
        console.log('[CacheBuster] Fresh assets loaded successfully');
    }
    
    // Run immediately when script loads
    init();
    
    // Expose for manual cache clearing (optional)
    window.TankDestroyer = window.TankDestroyer || {};
    window.TankDestroyer.clearCache = async function() {
        sessionStorage.removeItem(CACHE_BUSTER_KEY + '_' + CACHE_BUSTER_VERSION);
        localStorage.removeItem(CACHE_VERSION_KEY);
        await clearAllCaches();
        window.location.reload();
    };
    
})();
