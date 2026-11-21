if (window.isSecureContext && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url), { updateViaCache: 'none' })
        .catch(error => console.warn('Could not enable offline access for ASV Stats.', error));
}
