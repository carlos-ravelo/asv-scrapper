# KNSB dashboard

Open [knsb.html](../knsb.html) through the same web server as ASV Stats.

## First version · Klasse 4B, 2026–2027

- [x] Select any team in the group and share its URL.
- [x] Save multiple favorite teams in the browser.
- [x] See the next opponent, date, round and home/away status.
- [x] Follow the complete season calendar and open individual encounters.
- [x] Read the official standings and position history by round.
- [x] Sort teams by points, average rating, opposition strength or performance against rating expectations.
- [x] Compare any two teams, including their last published lineups by board.
- [x] See player names, ratings at each encounter, results and colors.
- [x] Identify frequent players, their average board and points scored.
- [x] See the sample size, source links and last update time.
- [x] Download public data periodically; retain previous data on failed updates.
- [x] Archive the previous dataset when published results change.

## Next iterations

- [ ] Add other ASV teams and their groups.
- [ ] Switch seasons and compare historical encounters.
- [ ] Show rating and lineup changes across rounds.
- [ ] Compare the difficulty of the remaining schedule.
- [ ] Export the calendar and add encounter reminders.
- [ ] Add verified venue and start-time information.
- [ ] Show corrections and changes since the previous visit.

## Refresh data

```bash
python3 -m pip install -r requirements.txt
python3 scripts/knsb_scraper.py
```

```bash
bash setup-cron.sh
```

Cron runs both scrapers at 10:00 and 22:00 in the system time zone, with one lock and timestamped output in `cron_execution.log`. KNSB data is published atomically to `data/knsb.json`; changed previous versions are saved under `data/history/`. Historical snapshots describe what was published at each download, not when the games were actually played.

The browser reads the saved JSON; it does not query Netstand on every visit. A failed or incomplete download leaves the last successful JSON available. The page flags data older than 36 hours.

## Checks

```bash
python3 -m unittest discover -s tests -p 'test_knsb*.py'
node tests/knsb.test.cjs
node tests/recap.test.cjs
NODE_PATH=/usr/share/nodejs node tests/knsb.browser.cjs
```

The browser check needs Google Chrome and the Node `ws` module. It uses a temporary browser profile and a local static server.
