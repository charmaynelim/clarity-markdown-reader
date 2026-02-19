// sw.js — Service Worker for Clarity PWA
// Cache-first for app shell, network-first for GitHub API

const CACHE_VERSION = 'clarity-v5';
const APP_SHELL = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/app.js',
    '/js/auth.js',
    '/js/github.js',
    '/js/library.js',
    '/js/filemanager.js',
    '/js/reader.js',
    '/js/settings.js',
    '/manifest.json',
    '/icons/icon-192.svg',
    '/icons/icon-512.svg',
    '/icons/icon-180.svg'
];

const API_CACHE = 'clarity-api-v1';

// ---------------------------------------------------------------------------
// Install — cache app shell
// ---------------------------------------------------------------------------

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

// ---------------------------------------------------------------------------
// Activate — clean old caches
// ---------------------------------------------------------------------------

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_VERSION && key !== API_CACHE)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// ---------------------------------------------------------------------------
// Fetch — routing strategy
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // GitHub API calls — network-first with cache fallback
    if (url.hostname === 'api.github.com') {
        event.respondWith(networkFirstWithCache(event.request, API_CACHE));
        return;
    }

    // External resources (fonts, CDN) — cache-first
    if (url.origin !== self.location.origin) {
        event.respondWith(cacheFirstWithNetwork(event.request, CACHE_VERSION));
        return;
    }

    // App shell — cache-first
    event.respondWith(cacheFirstWithNetwork(event.request, CACHE_VERSION));
});

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

async function cacheFirstWithNetwork(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        // Offline fallback for navigation requests
        if (request.mode === 'navigate') {
            return caches.match('/index.html');
        }
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    }
}

async function networkFirstWithCache(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({ message: 'Offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
