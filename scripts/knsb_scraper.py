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
ROOT = Path(__file__).resolve().parents[1]


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


def parse_asv_groups(html):
    content = BeautifulSoup(html, 'html.parser').select_one('#content')
    groups = []
    for heading in content.select('h1'):
        link = heading.select_one('a[href*="/divisions/view/"]')
        if not link:
            continue
        asv = [{'id': identity(a), 'name': a.get_text(' ', strip=True)}
               for a in heading.find_next('table').select('a[href*="/teams/view/"]')
               if re.fullmatch(r'ASV \d+', a.get_text(' ', strip=True))]
        if asv:
            groups.append({'id': identity(link), 'name': link.get_text(' ', strip=True), 'asv_teams': asv})
    if not groups:
        raise ValueError('No ASV teams found in competition')
    return groups


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
    table = next((t for t in content.select('table')
                  if [identity(a) for a in t.select('thead a[href*="/teams/view/"]')] == [match['home'], match['away']]), None)
    if table is None:
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
    round_pages = {}
    for round_info in division['rounds']:
        html = fetch(f'/rounds/view/{round_info["id"]}')
        round_pages[round_info['number']] = html
        matches.extend(parse_round(html, round_info, pairings))
    if len(matches) != len(pairings) or len({m['id'] for m in matches}) != len(matches):
        raise ValueError('Incomplete or duplicate schedule; retaining previous data')
    for match in matches:
        if match['raw_score'] and match['raw_score'] != '-':
            html = round_pages[match['round']]
            content = BeautifulSoup(html, 'html.parser')
            embedded = any([identity(a) for a in table.select('thead a[href*="/teams/view/"]')] == [match['home'], match['away']]
                           for table in content.select('table'))
            match['boards'] = parse_boards(html if embedded else fetch(match['source_url']), match)
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


def search_players(dataset):
    players = {}
    for match in dataset.get('matches', []):
        for board in match['boards']:
            result = board.get('score')
            if (not result or len(result) != 2 or
                    any(not isinstance(v, (int, float)) or not 0 <= v <= 1 for v in result) or
                    sum(result) != 1 or board.get('forfeit') or
                    not all((board.get(f'{side}_player') or {}).get('id') for side in ('home', 'away'))):
                continue
            for side in ('home', 'away'):
                player = board[f'{side}_player']
                players[(player['id'], match[side])] = {
                    'id': player['id'], 'name': player['name'], 'team_id': match[side]}
    return sorted(players.values(), key=lambda player: (player['name'].casefold(), player['team_id']))


def scrape_asv(competition_id, directory):
    response = requests.get(f'{BASE}/scores/index/{competition_id}', timeout=30,
                            headers={'User-Agent': 'ASV-Stats/1.0 (KNSB team dashboard)'})
    response.raise_for_status()
    groups = parse_asv_groups(response.text)
    catalog = {'schema_version': 1, 'competition_id': competition_id, 'groups': [], 'teams': [], 'players': []}
    failed = []
    for group in groups:
        output = directory / 'divisions' / f'{group["id"]}.json'
        try:
            scrape(group['id'], output)
        except Exception:
            logging.exception('Group %s failed; retaining last available data', group['id'])
            failed.append(group['id'])
        if not output.exists():
            continue
        dataset = json.loads(output.read_text())
        if not catalog.get('season'):
            catalog['season'] = dataset['season']
        if dataset['season'] != catalog['season']:
            raise ValueError('Mixed seasons in catalog; previous catalog retained')
        catalog['players'].extend(search_players(dataset))
        catalog['groups'].append({**group, 'updated_at': dataset['updated_at']})
        catalog['teams'].extend({'id': t['id'], 'name': t['name'], 'division_id': group['id'],
                                 'is_asv': bool(re.fullmatch(r'ASV \d+', t['name']))} for t in dataset['teams'])
    if not catalog['groups']:
        raise ValueError('No available ASV groups; previous catalog retained')
    catalog['updated_at'] = datetime.now(timezone.utc).isoformat()
    atomic_json(directory / 'catalog.json', catalog)
    logging.info('ASV catalog updated: %s groups, %s teams', len(catalog['groups']), len(catalog['teams']))
    if failed:
        raise RuntimeError(f'Groups could not be refreshed: {", ".join(failed)}')


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S %z')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--division', default='669', type=lambda value: str(int(value)))
    parser.add_argument('--output', type=Path, help='Override the output path for a single group')
    parser.add_argument('--all-asv', action='store_true', help='Refresh all groups containing ASV teams')
    parser.add_argument('--competition', default='69', type=lambda value: str(int(value)))
    parser.add_argument('--directory', type=Path, default=ROOT / 'data' / 'knsb')
    args = parser.parse_args()
    try:
        if args.all_asv:
            scrape_asv(args.competition, args.directory)
        else:
            scrape(args.division, args.output or args.directory / 'divisions' / f'{args.division}.json')
    except Exception:
        logging.exception('KNSB update failed; previous data retained')
        raise SystemExit(1)
