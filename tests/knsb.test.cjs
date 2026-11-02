const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

(async () => {
    const root = path.resolve(__dirname, '..');
    const source = fs.readFileSync(path.join(root, 'assets/js/knsb-model.js'), 'utf8');
    const { statsFor, nextMatch, expectedScore, lastLineup, rankHistory } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const data = JSON.parse(fs.readFileSync(path.join(root, 'data/knsb/divisions/669.json')));
    assert.equal(data.matches.length, 45);
    assert.equal(data.matches.filter(m => m.status === 'completed').length, 15);
    const asv = statsFor(data, '7123');
    assert.equal(asv.played, 3);
    assert.deepEqual(asv.form, ['W', 'W', 'L']);
    assert.equal(asv.ratedGames, 23);
    assert.equal(nextMatch(data, '7123', '2026-11-02').away, '7124');
    assert.equal(nextMatch(data, '7123', '2028-01-01'), null);
    assert.equal(lastLineup(data, '7123').players[6].rating, 1755);
    assert.equal(rankHistory(data, '7123').slice(-1)[0].position, 5);
    assert.equal(expectedScore(1800, 1800), 0.5);
    assert(Math.abs(expectedScore(1800, 2200) + expectedScore(2200, 1800) - 1) < 1e-10);
    for (const team of data.teams) {
        const games = data.matches.filter(m => m.status === 'completed' && [m.home, m.away].includes(team.id));
        let bp = 0, mp = 0;
        for (const match of games) {
            const i = match.home === team.id ? 0 : 1;
            bp += match.score[i];
            mp += match.score[i] > match.score[1 - i] ? 2 : match.score[i] === match.score[1 - i] ? 1 : 0;
            assert.equal(match.boards.length, 8);
            assert.equal(match.boards.reduce((sum, board) => sum + board.score[i], 0), match.score[i]);
        }
        assert.equal(bp, team.board_points);
        assert.equal(mp, team.match_points);
    }
    assert(Math.abs(data.teams.reduce((sum, team) => sum + statsFor(data, team.id).delta, 0)) < 1e-10);
    const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/knsb/catalog.json')));
    const asvTeams = catalog.teams.filter(team => team.is_asv).map(team => team.name).sort();
    assert.deepEqual(asvTeams, Array.from({ length: 9 }, (_, index) => `ASV ${index + 1}`));
    assert.equal(new Set(catalog.groups.map(group => group.id)).size, catalog.groups.length);
    assert.equal(new Set(catalog.teams.map(team => team.id)).size, catalog.teams.length);
    for (const group of catalog.groups) {
        const dataset = JSON.parse(fs.readFileSync(path.join(root, `data/knsb/divisions/${group.id}.json`)));
        assert.equal(dataset.division_id, group.id);
        assert.equal(dataset.season, catalog.season);
        assert.equal(dataset.matches.length, dataset.teams.length * (dataset.teams.length - 1) / 2);
        assert.equal(new Set(dataset.matches.map(match => match.id)).size, dataset.matches.length);
        assert.deepEqual(catalog.teams.filter(team => team.division_id === group.id).map(team => team.id).sort(), dataset.teams.map(team => team.id).sort());
        for (const entry of dataset.teams) {
            const completed = dataset.matches.filter(match => match.status === 'completed' && [match.home, match.away].includes(entry.id));
            let boardPoints = 0, matchPoints = 0;
            completed.forEach(match => {
                const side = match.home === entry.id ? 0 : 1;
                boardPoints += match.score[side];
                matchPoints += match.score[side] > match.score[1 - side] ? 2 : match.score[side] === match.score[1 - side] ? 1 : 0;
                if (match.boards.every(board => board.score)) assert.equal(match.boards.reduce((sum, board) => sum + board.score[side], 0), match.score[side]);
            });
            assert.equal(boardPoints, entry.board_points, `${entry.name} board points`);
            assert.equal(matchPoints, entry.match_points, `${entry.name} match points`);
            assert(Number.isFinite(statsFor(dataset, entry.id).played));
        }
        assert(Math.abs(dataset.teams.reduce((sum, team) => sum + (statsFor(dataset, team.id).delta || 0), 0)) < 1e-10);
    }
    const sample = { teams: [{ id: 'a' }, { id: 'b' }], matches: [{ id: '1', home: 'a', away: 'b', date: '2026-01-01', round: 1, status: 'completed', score: [1, 0], boards: [{ board: 1, home_player: { id: 'p', name: 'Player' }, away_player: { id: null, name: 'Absent' }, home_rating: 1800, away_rating: 1800, score: [1, 0] }] }] };
    assert.equal(statsFor(sample, 'a').ratedGames, 0);
    assert.equal(statsFor(sample, 'a').delta, null);
    sample.matches[0].boards[0].away_player.id = 'q';
    sample.matches[0].boards[0].away_rating = 0;
    assert.equal(statsFor(sample, 'a').ratedGames, 0);
    sample.matches[0].boards[0].away_rating = 1800;
    assert.equal(statsFor(sample, 'a').delta, 0.5);
    sample.matches[0].score = [0.5, 0.5];
    assert.deepEqual(rankHistory(sample, 'a'), [{ round: 1, position: 1 }]);
    assert.deepEqual(rankHistory(sample, 'b'), [{ round: 1, position: 1 }]);
    console.log('KNSB data consistency and statistics checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
