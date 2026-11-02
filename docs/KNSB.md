# KNSB dashboard

Open [knsb.html](../knsb.html) through the same web server as ASV Stats.

## ASV teams · 2026–2027

- [x] Search among teams in every group containing ASV 1–9 and share a team URL.
- [x] Download only the selected group; reuse it when switching between its teams.
- [x] Switch directly between ASV teams and save favorites across groups.
- [x] Save multiple favorite teams in the browser.
- [x] Choose My team, Standings or Compare, with a shareable view URL.
- [x] Keep the season calendar always visible; expand players when needed.
- [x] Reveal performance metrics separately from the basic standings.
- [x] See the next opponent, date, round and home/away status.
- [x] Follow the complete season calendar and open individual encounters.
- [x] Open played encounters with actual lineups, ratings, rating gaps and board results.
- [x] Open upcoming encounters with a team comparison and clearly marked, unconfirmed reference lineups.
- [x] Read the official standings and position history by round.
- [x] Sort teams by points, average rating or opposition strength.
- [x] Compare any two teams, including their last published lineups by board.
- [x] Click opponent names in standings or the calendar to open comparison; switch opponents in a stable list with visible selection marks.
- [x] Change or remove the compared opponent and share the comparison URL.
- [x] Open a player’s results inside the dashboard from any lineup or player list.
- [x] See player names, ratings at each encounter, results and colors.
- [x] Identify frequent players, their average board and points scored.
- [x] See the sample size, source links and last update time.
- [x] Download public data periodically; retain previous data on failed updates.
- [x] Archive the previous dataset when published results change.

## Next iterations

- [ ] Switch seasons and compare historical encounters.
- [ ] Show rating and lineup changes across rounds.
- [ ] Compare the difficulty of the remaining schedule.
- [ ] Export the calendar and add encounter reminders.
- [ ] Add verified venue and start-time information.
- [ ] Show corrections and changes since the previous visit.

## Refresh data

```bash
python3 -m pip install -r requirements.txt
python3 scripts/knsb_scraper.py --all-asv
```

```bash
bash setup-cron.sh
```

Cron runs both scrapers at 10:00 and 22:00 in the system time zone, with one lock and timestamped output in `cron_execution.log`. KNSB data is published atomically per group to `data/knsb/divisions/<id>.json`; changed previous versions are saved under `data/knsb/divisions/history/`. The lightweight `data/knsb/catalog.json` lists the covered teams and groups. Historical snapshots describe what was published at each download, not when the games were actually played.

The browser first reads the small team catalog, then downloads only the selected group. Groups are reused during a visit; Netstand is queried only by the scraper. Discovery uses the configured competition (currently 69) and includes each group containing an ASV team once. To refresh one group, use `python3 scripts/knsb_scraper.py --division 669`. A failed or incomplete download leaves the last successful JSON available. The page flags data older than 36 hours.

## Checks

```bash
python3 -m unittest discover -s tests -p 'test_knsb*.py'
node tests/knsb.test.cjs
node tests/recap.test.cjs
NODE_PATH=/usr/share/nodejs node tests/knsb.browser.cjs
```

The browser check needs Google Chrome and the Node `ws` module. It uses a temporary browser profile and a local static server.
