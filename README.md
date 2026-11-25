# ASV Stats

Static dashboards for ASV club players and the KNSB team competition.

| Path | Contents |
| --- | --- |
| `index.html` | Club player dashboard |
| `knsb.html` | KNSB team dashboard |
| `assets/js/` | Browser modules for both dashboards |
| `assets/css/` | Dashboard stylesheets |
| `scripts/` | Python scrapers |
| `data/` | Published JSON and source CSV datasets |
| `data/knsb/catalog.json` | Searchable catalog of ASV teams and their opponents |
| `data/knsb/divisions/` | One dataset per covered group, with changes under `history/` |
| `docs/` | Feature lists and operational notes |
| `tests/` | Statistics, scraper and browser checks |
| `tests/fixtures/` | Saved public HTML for offline parser checks |

The site is this directory, served as static files. Production runs on Cloudflare Workers static assets (`wrangler.jsonc`); `.assetsignore` keeps scripts, tests and docs out of the published site, and `worker/index.js` only serves `index.html` at `/`. Cloudflare deploys every push to `main`; the Worker is also reachable at `https://asv-stats.cr-cravelo.workers.dev/`.

Preview locally (Node 22 in Docker, nothing installed on the host):

```bash
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/app -w /app -p 127.0.0.1:8787:8787 \
  node:22-bookworm-slim npx -y wrangler@4.45.0 dev --ip 0.0.0.0 --port 8787
```

## Install ASV Stats

Open [ASV Stats](https://asv-stats.carlos-ravelo.nl/) and install it from the browser menu. After a successful online visit, the app can reopen both screens offline. Club statistics and KNSB team groups become available offline after their data has loaded successfully. Saved data is labeled, and reloading with a connection requests the latest datasets.

The PWA uses local copies of its browser libraries. Increase the shell cache version in `sw.js` when changing the interface or those libraries. Scraper updates do not require a cache version change.

## Update data

```bash
python3 -m pip install -r requirements.txt
bash run-scrapers.sh
```

Run either scraper separately:

```bash
python3 scripts/scrapper.py
python3 scripts/knsb_scraper.py --all-asv
```

Both scrapers resolve their data paths relative to the repository, regardless of the shell's current directory.

## Scheduled updates

GitHub Actions runs [`update-data.yml`](.github/workflows/update-data.yml) at 09:00 and 21:00 UTC and on demand (**Actions → Update data → Run workflow**). It checks the parsers against the saved HTML, runs `run-scrapers.sh`, validates the JSON and commits `data/` when it changed. It then calls the Cloudflare Deploy Hook stored in the `CLOUDFLARE_DEPLOY_HOOK` secret, so the deployment does not depend on Cloudflare receiving the push. If a scraper fails, the data that did update is still published and the run is marked as failed, so GitHub sends a notification.

`setup-cron.sh` remains as a fallback to run the same job from any machine with cron.

## Checks

```bash
python3 -m unittest discover -s tests -p 'test_knsb*.py'
node tests/knsb.test.cjs
node tests/recap.test.cjs
NODE_PATH=/usr/share/nodejs node tests/knsb.browser.cjs
```

The browser check requires Google Chrome and the Node `ws` module. See [KNSB features and data notes](docs/KNSB.md).
