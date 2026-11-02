import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import knsb_scraper as scraper

FIXTURES = Path(__file__).parent / 'fixtures' / 'knsb'


class NetstandParsing(unittest.TestCase):
    def test_division_and_round_schedule(self):
        division, pairs = scraper.parse_division((FIXTURES / 'division.html').read_text())
        self.assertEqual(len(division['teams']), 10)
        self.assertEqual(len(pairs), 45)
        self.assertEqual(len(division['rounds']), 9)
        self.assertEqual(division['rounds'][3]['date'], '2026-11-21')
        asv = next(team for team in division['teams'] if team['name'] == 'ASV 4')
        self.assertEqual(asv['position'], 5)
        self.assertEqual(asv['board_points'], 13.5)
        matches = scraper.parse_round((FIXTURES / 'round.html').read_text(), division['rounds'][0], pairs)
        self.assertEqual(len(matches), 5)
        self.assertEqual(matches[0]['score'], [6, 2])
        self.assertEqual(matches[-1]['score'], [6.5, 1.5])

    def test_match_ratings_are_encounter_specific(self):
        match = {'id': '23350', 'home': '7126', 'away': '7123'}
        boards = scraper.parse_boards((FIXTURES / 'match.html').read_text(), match)
        self.assertEqual(len(boards), 8)
        self.assertEqual(boards[0]['home_rating'], 2051)
        self.assertEqual(boards[0]['home_color'], 'black')
        self.assertEqual(boards[1]['home_color'], 'white')
        self.assertEqual(boards[6]['away_rating'], 1755)
        self.assertEqual(boards[6]['score'], [0.5, 0.5])
        self.assertEqual(sum(board['score'][0] for board in boards), 5)
        self.assertEqual(sum(board['score'][1] for board in boards), 3)
        walkover_html = (FIXTURES / 'match.html').read_text().replace('½ - ½', '1R - 0R', 1)
        walkover = scraper.parse_boards(walkover_html, match)[0]
        self.assertTrue(walkover['forfeit'])
        self.assertEqual(walkover['score'], [1, 0])
        with self.assertRaises(ValueError):
            scraper.parse_boards((FIXTURES / 'match.html').read_text(), {**match, 'home': '7123'})

    def test_score_formats(self):
        self.assertEqual(scraper.score('5½ - 2½'), [5.5, 2.5])
        self.assertEqual(scraper.score('½ – ½'), [0.5, 0.5])
        for value in ('', '-', '*', '1R - 0R'):
            self.assertIsNone(scraper.score(value))
        self.assertIsNone(scraper.number('unrated'))

    def test_failed_download_keeps_previous_data(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'knsb.json'
            output.write_text('{"sentinel": true}')
            with patch.object(scraper.requests.Session, 'get', side_effect=RuntimeError('offline')), patch.object(scraper.time, 'sleep'):
                with self.assertRaises(RuntimeError):
                    scraper.scrape('669', output)
            self.assertEqual(json.loads(output.read_text()), {'sentinel': True})

    def test_archive_only_when_data_changes(self):
        division = {'name': 'Test', 'season': '2026', 'teams': [{'id': 'a'}, {'id': 'b'}], 'rounds': [{'id': '1', 'number': 1}]}
        fixture = [{'id': 'm', 'round': 1, 'date': '2026-11-21', 'home': 'a', 'away': 'b', 'score': None, 'raw_score': '', 'boards': []}]
        with tempfile.TemporaryDirectory() as folder, patch.object(scraper.requests.Session, 'get') as get, patch.object(scraper.time, 'sleep'), patch.object(scraper, 'parse_division', return_value=(division, {'a:b': 'm'})), patch.object(scraper, 'parse_round', side_effect=lambda *_: copy.deepcopy(fixture)):
            get.return_value.text = ''
            output = Path(folder) / 'knsb.json'
            scraper.scrape('669', output)
            first = json.loads(output.read_text())
            scraper.scrape('669', output)
            self.assertFalse((output.parent / 'history').exists())
            division['name'] = 'Corrected'
            scraper.scrape('669', output)
            archives = list((output.parent / 'history').glob('*.json'))
            self.assertEqual(len(archives), 1)
            self.assertEqual(json.loads(archives[0].read_text())['name'], first['name'])
            self.assertEqual(json.loads(output.read_text())['name'], 'Corrected')


if __name__ == '__main__':
    unittest.main()
