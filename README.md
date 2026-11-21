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

Serve this directory through a static web server. The existing local server exposes the dashboards at `http://localhost:5000/` and `http://localhost:5000/knsb.html`.

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

```bash
bash setup-cron.sh
```

The root-level shell scripts are the stable entry points for cron. They use `.venv/bin/python` when available, otherwise `/usr/bin/python3`. The installed job runs at 10:00 and 22:00 in the system time zone, prevents overlapping runs and appends output to `cron_execution.log`.

## Checks

```bash
python3 -m unittest discover -s tests -p 'test_knsb*.py'
node tests/knsb.test.cjs
node tests/recap.test.cjs
NODE_PATH=/usr/share/nodejs node tests/knsb.browser.cjs
```

The browser check requires Google Chrome and the Node `ws` module. See [KNSB features and data notes](docs/KNSB.md).
