const assert = require('assert').strict;
const fs = require('fs');
(async () => {
    const source = fs.readFileSync('recap.js', 'utf8');
    const { calculateRecap } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    const now = new Date(2026, 9, 6, 12);
    const elo = (Naam, ELO, Publish_Date) => ({ Naam, ELO, Publish_Date });
    const game = (Witspeler, Zwartspeler, Uitslag, Publish_Date) => ({ Witspeler, Zwartspeler, Uitslag, Publish_Date });
    const ratings = [
        elo('A', 500, '2026-09-22'), elo('A', 1000, '2026-09-23'), elo('A', 1050, '2026-10-06'),
        elo('A', 2000, '2026-10-07'), elo('B', 2000, '2026-09-23'), elo('B', 1950, '2026-10-06'),
        elo('C', 1200, '2026-09-23'), elo('C', 1250, '2026-10-06'),
        elo('D', 'Unrated', '2026-09-23'), elo('D', 1500, '2026-10-06'),
        elo('Old', 3000, '2026-09-22'), elo('Later', 4000, '2026-10-06')
    ];
    const matches = [
        game('A', 'B', '1-0 (Interne Beker)', '2026-09-23'),
        game('C', 'A', '½-½', '2026-09-24'),
        game('A', 'B', '1-0', '2026-10-01'),
        game('A', 'B', '0-1', '2026-10-02'),
        game('C', 'B', '1-0', '2026-10-03'),
        game('A', 'B', '1-0', '2026-10-05'),
        game('A', 'B', '1-0', '2026-10-06'),
        game('C', 'Old', '1-0', '2026-10-04'),
        game('C', 'Later', '1-0', '2026-10-05'),
        game('B', 'A', '1-0', '2026-10-07'),
        game('B', 'A', '1-0', '2026-09-22'),
        game('B', 'A', '*', '2026-10-06'),
        game('B', 'A', '1-0', 'Unknown')
    ];
    const recap = calculateRecap(matches, ratings, now);
    assert.equal(recap.from, '2026-09-23');
    assert.equal(recap.to, '2026-10-06');
    assert.deepEqual(recap.awards[0].names, ['A', 'C']);
    assert.equal(recap.awards[0].detail, '+50 Elo');
    assert.deepEqual(recap.awards[1].names, ['B']);
    assert.deepEqual(recap.awards[2].names, ['A', 'C']);
    assert.equal(recap.awards[2].detail, 'Defeated a 2000 Elo opponent');
    assert.deepEqual(recap.awards[3].names, ['A', 'B']);
    assert.equal(recap.awards[3].detail, '6 matches played');
    assert.deepEqual(recap.awards[4].names, ['C']);
    assert.equal(recap.awards[4].detail, '3 consecutive wins');
    const selected = calculateRecap(matches, ratings, now, ['A']);
    assert.equal(selected.scope, 'Selected players');
    assert.deepEqual(selected.awards.map(award => award.names), [['A'], [], ['A'], ['A'], ['A']]);
    assert.equal(selected.awards[2].detail, 'Defeated a 2000 Elo opponent');
    assert.equal(selected.awards[3].detail, '6 matches played');
    assert.equal(selected.awards[4].detail, '2 consecutive wins');
    const selectedB = calculateRecap(matches, ratings, now, ['B']);
    assert.deepEqual(selectedB.awards[1].names, ['B']);
    assert.equal(selectedB.awards[4].names.length, 0);
    assert(calculateRecap(matches, ratings, now, ['Missing']).awards.every(award => !award.names.length));
    assert.equal(recap.scope, 'Club-wide awards');
    assert(calculateRecap([], [], now).awards.every(award => award.names.length === 0));
    assert.equal(calculateRecap([], [], new Date(2026, 0, 5)).from, '2025-12-23');
    assert(calculateRecap([game('A', 'B', '1-0', '2026-02-30')], [], new Date(2026, 2, 2)).awards.every(award => !award.names.length));
    console.log('Recap tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
