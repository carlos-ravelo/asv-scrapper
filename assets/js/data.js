const scope = new URL('../../', import.meta.url);

async function openDataCache() {
    try {
        return await caches.open(`asv-stats-data:${scope.pathname}:v1`);
    } catch {
        return null;
    }
}

export async function loadDataset(path, isValid) {
    const url = new URL(path, scope);
    const cache = await openDataCache();
    let response;
    try {
        response = await fetch(url, { cache: 'no-store' });
    } catch (networkError) {
        const saved = await cache?.match(url.href);
        if (!saved) throw networkError;
        const data = await saved.json();
        if (!isValid(data)) throw networkError;
        return { data, saved: true };
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const snapshot = cache ? response.clone() : null;
    const data = await response.json();
    if (!isValid(data)) throw new Error('Invalid data');
    if (snapshot) {
        try { await cache.put(url.href, snapshot); } catch { /* The live data is still usable. */ }
    }
    return { data, saved: false };
}
