// Minimal service worker so browsers treat the site as an installable app.
// It deliberately caches nothing: every request goes straight to the network,
// so a new deploy is always what people see (no stale copies).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
