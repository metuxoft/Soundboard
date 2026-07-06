const CACHE_NAME = 'soundboard-v0.5.5';

// ==========================================
// CACHE URLS
// IMPORTANT: Every time you add a new MP3 file to script.js, 
// you MUST also add the exact path to that new MP3 file here.
// This allows the Service Worker to cache it for offline play!
// ==========================================
const URLS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    // Predefined default sounds
    './audio/Play me.wav'
];

// Install Event
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache and caching predefined URLs');
                // Use Promise.allSettled to prevent one missing file from failing the entire cache
                return Promise.allSettled(
                    URLS_TO_CACHE.map(url => {
                        return fetch(url).then(response => {
                            if (!response.ok) {
                                throw new Error('Request failed for ' + url);
                            }
                            return cache.put(url, response);
                        }).catch(error => {
                            console.error('Failed to cache:', url, error);
                        });
                    })
                );
            })
    );
    self.skipWaiting();
});

// Fetch Event
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response
                if (response) {
                    return response;
                }

                // Keep cloning requests & responses since they are streams and can only be consumed once
                const fetchRequest = event.request.clone();

                return fetch(fetchRequest).then(
                    response => {
                        // Check if we received a valid response
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        const responseToCache = response.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => {
                                // Important: We only cache GET requests that are successful
                                if (event.request.method === 'GET') {
                                    cache.put(event.request, responseToCache);
                                }
                            });

                        return response;
                    }
                ).catch(() => {
                    // This block executes when network fails (offline)
                    console.warn(`Fetch completely failed for ${event.request.url} (Offline)`);
                });
            })
    );
});

// Activate Event - Clean up old caches if any
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
    self.clients.claim();
});
