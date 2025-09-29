// Service Worker for Tower Defense Game
const CACHE_NAME = 'tower-defense-v1.0.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/src/main.js',
  '/src/systems/Game.js',
  '/src/systems/Difficulty.js',
  '/src/units/Enemy.js',
  '/src/units/Tower.js',
  '/src/units/OptimizedProjectile.js',
  '/src/audio/SoundManager.js',
  '/src/utils/ObjectPool.js',
  '/src/utils/PerformanceMonitor.js',
  '/src/utils/SpatialGrid.js',
  '/src/world/map.js',
  '/manifest.json'
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.log('Cache install failed:', error);
      })
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
      .catch(() => {
        // If both cache and network fail, return offline page
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
