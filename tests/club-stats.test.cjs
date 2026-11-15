const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

(async () => {
    const source = fs.readFileSync(path.join(__dirname, '../assets/js/dataProcessor.js'), 'utf8');
    const { createRatingLookup, getPlayerStats } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    const elo = (Naam, ELO, Publish_Date) => ({ Naam, ELO, Publish_Date });
    const game = (Witspeler, Zwartspeler, Uitslag, Publish_Date = '2026-10-10') => ({ Witspeler, Zwartspeler, Uitslag, Publish_Date });
    const ratings = [
        elo('Winner', 2500, '2026-11-01'),
        elo('Winner', 1700, '2026-10-01'),
        elo('Strong', 2200, '2026-10-01'),
        elo('LostTo', 2600, '2026-10-01'),
        elo('Unknown', 'Unrated', '2026-10-01'),
        elo('UnknownDate', 2800, 'Unknown')
    ];
    const ratingAt = createRatingLookup(ratings);
    assert.equal(ratingAt('Winner', '2026-10-10'), 1700, 'Future ratings must not rewrite past results');
    assert.equal(ratingAt('Winner', '2026-10-01'), 1700);
    assert.equal(ratingAt('Winner', '2026-09-30'), null);
    assert.equal(ratingAt('Winner', 'Unknown'), null);
    assert.equal(ratingAt('Missing', '2026-10-10'), null);
    assert.equal(ratingAt('Unknown', '2026-10-10'), null);
    const games = [game('Me', 'Winner', '1-0'), game('Strong', 'Me', '½-½'), game('Me', 'LostTo', '0-1')];
    const stats = getPlayerStats(['Me'], games, ratings);
    assert.deepEqual(stats.bestResult, { opponent: 'Strong', elo: 2200, outcome: 'Draw' });
    assert.deepEqual([stats.wins, stats.draws, stats.losses], [1, 1, 1]);
    assert.equal(getPlayerStats(['Me'], [...games, game('Strong', 'Me', '0-1')], ratings).bestResult.outcome, 'Win', 'Wins beat draws against equally rated opponents');
    assert.equal(getPlayerStats(['Me'], [game('Me', 'Unknown', '1-0'), game('Me', 'UnknownDate', '½-½')], ratings).bestResult, null);
    assert.equal(getPlayerStats(['Me'], [game('Me', 'LostTo', '0-1')], ratings).bestResult, null);
    console.log('Club stats checks passed: historical ratings, stronger draws, losses excluded and equal-rating ties');
})().catch(error => { console.error(error); process.exitCode = 1; });
