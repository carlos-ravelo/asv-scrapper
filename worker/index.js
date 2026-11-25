// Runs only for requests that match no static file (see wrangler.jsonc).
// Serves index.html at "/" while keeping the .html URLs the app and its service worker use.
export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname === '/') {
			url.pathname = '/index.html';
			return env.ASSETS.fetch(new Request(url, request));
		}
		return new Response('Not found', { status: 404 });
	},
};
