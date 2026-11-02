"""Download one Netstand division, its schedule and published board results."""
import argparse
import json
import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE = 'https://knsb.netstand.nl'
ROOT = Path(__file__).resolve().parent


def number(value):
    value = value.strip().replace(',', '.').replace('½', '.5')
    return float(value) if re.fullmatch(r'\d*(?:\.\d+)?', value) and value else None


def score(value):
    parts = re.split(r'\s*[-–]\s*', value.strip())
    if len(parts) != 2:
        return None
    values = [number(part) for part in parts]
    return values if all(item is not None for item in values) else None


def identity(link):
    return link['href'].rstrip('/').split('/')[-1]


def cells(row):
    return row.find_all(['td', 'th'], recursive=False)


def parse_division(html):
    content = BeautifulSoup(html, 'html.parser').select_one('#content')
    if not content or not content.select_one('h1'):
        raise ValueError('Division content missing')
    teams, rounds, pairings = [], [], {}
    table = content.select_one('table')
    for row in table.select('tr'):
        columns = cells(row)
        link = row.select_one('a[href*="/teams/view/"]')
        if not link:
            continue
        teams.append({'id': identity(link), 'name': link.get_text(' ', strip=True),
                      'position': len(teams) + 1, 'match_points': number(columns[1].get_text()),
                      'board_points': number(columns[2].get_text()),
                      'source_url': urljoin(BASE, link['href'])})
    for row, team in zip([r for r in table.select('tr') if r.select_one('a[href*="/teams/view/"]')], teams):
        for opponent, column in zip(teams, cells(row)[3:]):
            link = column.select_one('a[href*="/pairings/view/"]')
            if link:
                pairings[':'.join(sorted([team['id'], opponent['id']]))] = identity(link)
    for table in content.select('table'):
        for row in table.select('tr'):
            link = row.select_one('a[href*="/rounds/view/"]')
            if link and len(cells(row)) == 2:
                rounds.append({'id': identity(link), 'number': int(re.search(r'\d+', link.get_text()).group()),
                               'date': datetime.strptime(cells(row)[1].get_text(strip=True), '%d-%m-%Y').date().isoformat()})
    season = content.select_one('a[href*="/scores/index/"]')
    if not teams or not rounds or len(pairings) != len(teams) * (len(teams) - 1) // 2:
        raise ValueError('Incomplete division or unsupported schedule format')
    return {'name': content.h1.get_text(strip=True), 'season': season.get_text(' ', strip=True),
            'teams': teams, 'rounds': rounds}, pairings


def parse_round(html, round_info, pairings):
    content = BeautifulSoup(html, 'html.parser').select_one('#content')
    matches = []
    for table in content.select('table'):
        headers = [c.get_text(' ', strip=True) for c in table.select('tr')[0].select('th')]
        if headers[:3] != ['Datum', 'Thuis', 'Uit']:
            continue
        for row in table.select('tr')[1:]:
            columns = cells(row)
            links = row.select('a[href*="/teams/view/"]')
            if len(links) != 2:
                continue
            home, away = [identity(link) for link in links]
            match_id = pairings[':'.join(sorted([home, away]))]
            raw_score = columns[-1].get_text(' ', strip=True)
            matches.append({'id': match_id, 'round': round_info['number'],
                            'date': datetime.strptime(columns[0].get_text(strip=True), '%d-%m-%Y').date().isoformat(),
                            'home': home, 'away': away, 'score': score(raw_score), 'raw_score': raw_score,
                            'source_url': f'{BASE}/pairings/view/{match_id}', 'boards': []})
    if not matches:
        raise ValueError(f'No schedule in round {round_info["number"]}')
    return matches


def parse_boards(html, match):
    content = BeautifulSoup(html, 'html.parser').select_one('#content')
    table = content.select_one('table')
    if [identity(a) for a in table.select('thead a[href*="/teams/view/"]')] != [match['home'], match['away']]:
        raise ValueError(f'Team mismatch in match {match["id"]}')
    boards = []
    for row in table.select('tbody tr'):
        columns = cells(row)
        if len(columns) != 7:
            raise ValueError('Unexpected board layout')
        players = [columns[i].select_one('a[href*="/players/view/"]') for i in (1, 4)]
        if not all(players):
            # A walkover can have an empty player cell; preserve the published result.
            players = [({'id': identity(p), 'name': p.get_text(' ', strip=True)} if p else
                        {'id': None, 'name': columns[i].get_text(' ', strip=True) or 'Unlisted player'})
                       for p, i in zip(players, (1, 4))]
        else:
            players = [{'id': identity(p), 'name': p.get_text(' ', strip=True)} for p in players]
        result = columns[6].get_text(' ', strip=True)
        icon = columns[0].select_one('i')
        classes = icon.get('class', []) if icon else []
        forfeit = bool(re.search(r'\dR', result, re.IGNORECASE))
        boards.append({'board': len(boards) + 1, 'home_player': players[0], 'away_player': players[1],
                       'home_rating': number(columns[2].get_text()), 'away_rating': number(columns[5].get_text()),
                       'home_color': 'black' if 'fas' in classes else 'white' if 'fal' in classes else None,
                       'score': score(re.sub(r'(?<=\d)R', '', result, flags=re.IGNORECASE)),
                       'forfeit': forfeit, 'raw_score': result})
    return boards


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def scrape(division_id, output):
    session = requests.Session()
    session.headers['User-Agent'] = 'ASV-Stats/1.0 (KNSB team dashboard)'
    session.mount('https://', HTTPAdapter(max_retries=Retry(total=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504])))

    def fetch(path):
        time.sleep(0.4)
        response = session.get(urljoin(BASE, path), timeout=30)
        response.raise_for_status()
        return response.text

    logging.info('KNSB update started: division %s', division_id)
    division, pairings = parse_division(fetch(f'/divisions/view/{division_id}'))
    matches = []
    for round_info in division['rounds']:
        matches.extend(parse_round(fetch(f'/rounds/view/{round_info["id"]}'), round_info, pairings))
    if len(matches) != len(pairings) or len({m['id'] for m in matches}) != len(matches):
        raise ValueError('Incomplete or duplicate schedule; retaining previous data')
    for match in matches:
        if match['raw_score'] and match['raw_score'] != '-':
            match['boards'] = parse_boards(fetch(match['source_url']), match)
            if not match['boards']:
                raise ValueError(f'Published result without boards: {match["id"]}')
        match['status'] = 'completed' if match['score'] is not None else 'partial' if match['boards'] else 'scheduled'
        logging.info('Round %s: %s (%s)', match['round'], match['id'], match['status'])
    payload = {'schema_version': 1, 'division_id': division_id,
               'source_url': f'{BASE}/divisions/view/{division_id}', **division, 'matches': matches}
    previous = json.loads(output.read_text()) if output.exists() else None
    if previous:
        old = {key: value for key, value in previous.items() if key != 'updated_at'}
        if old != payload:
            stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
            atomic_json(output.parent / 'history' / f'knsb-{division_id}-{stamp}.json', previous)
    payload['updated_at'] = datetime.now(timezone.utc).isoformat()
    atomic_json(output, payload)
    logging.info('KNSB update complete: %s teams, %s matches', len(division['teams']), len(matches))


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S %z')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--division', default='669', type=lambda value: str(int(value)))
    parser.add_argument('--output', type=Path, default=ROOT / 'data' / 'knsb.json')
    args = parser.parse_args()
    try:
        scrape(args.division, args.output)
    except Exception:
        logging.exception('KNSB update failed; previous data retained')
        raise SystemExit(1)
