const scope = new URL(self.registration.scope);
const prefix = `asv-stats-shell:${scope.pathname}:`;
const cacheName = `${prefix}v2`;
const assets = [
    'index.html', 'knsb.html', 'manifest.json',
    'assets/css/encounter.css', 'assets/css/knsb.css', 'assets/css/navigation.css',
    'assets/css/player-links.css', 'assets/css/style.css',
    'assets/img/asv-192.png', 'assets/img/asv-512.png', 'assets/img/fide-logo.png',
    'assets/js/app.js', 'assets/js/chartManager.js', 'assets/js/constants.js', 'assets/js/data.js',
    'assets/js/dataProcessor.js', 'assets/js/fide-search.js', 'assets/js/knsb-model.js', 'assets/js/knsb.js',
    'assets/js/pwa.js', 'assets/js/recap.js', 'assets/js/uiComponents.js', 'assets/js/utils.js',
    'assets/vendor/alpine.esm.js', 'assets/vendor/chart.umd.js', 'assets/vendor/chartjs-plugin-zoom.min.js',
    'assets/vendor/hammer.min.js', 'assets/vendor/html2canvas.min.js',
].map(path => new URL(path, scope));
const cachedPaths = new Map(assets.map(url => [url.pathname, url.href]));
const index = new URL('index.html', scope);
const knsb = new URL('knsb.html', scope);

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(cacheName);
        await cache.addAll(assets.map(url => new Request(url, { cache: 'reload' })));
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== scope.origin) return;

    let cachedUrl;
    if (request.mode === 'navigate') {
        if (url.pathname === scope.pathname || url.pathname === index.pathname) cachedUrl = index.href;
        if (url.pathname === knsb.pathname) cachedUrl = knsb.href;
    } else {
        cachedUrl = cachedPaths.get(url.pathname);
    }
    if (!cachedUrl) return;

    event.respondWith(fetch(request).catch(async () => {
        const cached = await caches.match(cachedUrl, { cacheName });
        return cached ?? Response.error();
    }));
});
