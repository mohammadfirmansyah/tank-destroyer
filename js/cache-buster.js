/**
 * Cache Buster - Force fresh assets on every page load
 * This script clears all browser caches and ensures fresh content
 * 
 * v2.1.2 Update:
 * - Force hard refresh EVERY time application opens (not just per session)
 * - Clear all browser caches including HTTP cache
 * - Use fetch with cache: 'reload' for true cache bypass
 * - Improved Chrome Mobile handling
 */

(function() {
    'use strict';
    
    const CACHE_BUSTER_VERSION = 'v2.1.2';
    const CACHE_VERSION_KEY = 'tank_destroyer_version';
    const LAST_LOAD_KEY = 'tank_destroyer_last_load';
    
    /**
     * Detect if running on Chrome Mobile
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
     * Check if this is a fresh page load (not a reload from cache-buster)
     * We use a timestamp in URL to detect our own reloads
     */
    function isOurReload() {
        const url = new URL(window.location.href);
        return url.searchParams.has('_hardRefresh');
    }
    
    /**
     * Clear all caches including Cache API, Service Workers, and HTTP cache
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
        
        // 3. Clear sessionStorage completely (fresh start each time)
        try {
            sessionStorage.clear();
            console.log('[CacheBuster] SessionStorage cleared');
        } catch (err) {
            console.warn('[CacheBuster] SessionStorage clear failed:', err);
        }
        
        console.log('[CacheBuster] Cache clearing complete');
    }
    
    /**
     * Pre-fetch critical resources with cache bypass to ensure fresh copies
     * This forces the browser to download fresh versions
     */
    async function prefetchFreshResources() {
        const criticalResources = [
            'css/style.css',
            'js/config.js',
            'js/input.js',
            'js/gameplay.js',
            'js/render.js'
        ];
        
        console.log('[CacheBuster] Pre-fetching fresh resources...');
        
        const fetchPromises = criticalResources.map(async (resource) => {
            try {
                // Use cache: 'reload' to bypass browser cache and fetch fresh
                await fetch(resource, { 
                    cache: 'reload',
                    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
                });
                console.log(`[CacheBuster] Prefetched: ${resource}`);
            } catch (err) {
                console.warn(`[CacheBuster] Failed to prefetch ${resource}:`, err);
            }
        });
        
        await Promise.all(fetchPromises);
    }
    
    /**
     * Main initialization
     * Clears caches and performs hard reload on every fresh page load
     */
    async function init() {
        console.log(`[CacheBuster] Initializing ${CACHE_BUSTER_VERSION}`);
        
        // If this is already our reload (has _hardRefresh param), clean up and continue
        if (isOurReload()) {
            const url = new URL(window.location.href);
            url.searchParams.delete('_hardRefresh');
            window.history.replaceState({}, '', url.toString());
            console.log('[CacheBuster] Hard refresh completed - assets are fresh');
            
            // Update last load timestamp
            try {
                localStorage.setItem(LAST_LOAD_KEY, Date.now().toString());
                localStorage.setItem(CACHE_VERSION_KEY, CACHE_BUSTER_VERSION);
            } catch (e) {}
            
            return; // Continue loading the game normally
        }
        
        // Check if version changed
        const versionChanged = hasVersionChanged();
        if (versionChanged) {
            console.log(`[CacheBuster] Version changed to ${CACHE_BUSTER_VERSION} - deep cache clear`);
            try {
                // Clear any corrupt state from previous version (keep saves and highscores)
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('tank_') && !key.includes('_save') && !key.includes('highscore')) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(key => localStorage.removeItem(key));
            } catch (e) {
                console.warn('[CacheBuster] localStorage cleanup failed:', e);
            }
        }
        
        // Check if Chrome Mobile (needs extra care)
        const chromeMobile = isChromeMobile();
        if (chromeMobile) {
            console.log('[CacheBuster] Chrome Mobile detected - extra cache clearing');
        }
        
        // ALWAYS clear caches and perform hard refresh on fresh page load
        console.log('[CacheBuster] Fresh page load detected - performing hard refresh');
        
        // Clear all caches first
        await clearAllCaches();
        
        // Pre-fetch critical resources with cache bypass
        await prefetchFreshResources();
        
        // Perform hard reload with unique timestamp
        // This ensures browser fetches completely fresh HTML
        const url = new URL(window.location.href);
        url.searchParams.set('_hardRefresh', Date.now().toString());
        
        console.log('[CacheBuster] Redirecting to fresh URL...');
        
        // Use location.replace to prevent back-button loops
        window.location.replace(url.toString());
    }
    
    // Run immediately when script loads
    init();
    
    // Expose manual cache clearing function
    window.TankDestroyer = window.TankDestroyer || {};
    window.TankDestroyer.clearCache = async function() {
        localStorage.removeItem(CACHE_VERSION_KEY);
        localStorage.removeItem(LAST_LOAD_KEY);
        await clearAllCaches();
        window.location.reload();
    };
    
    // Expose version for debugging
    window.TankDestroyer.cacheVersion = CACHE_BUSTER_VERSION;
    
})();
