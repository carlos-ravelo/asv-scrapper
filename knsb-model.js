export const average = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export const expectedScore = (rating, opponent) => 1 / (1 + 10 ** ((opponent - rating) / 400));
export const validRating = value => Number.isFinite(value) && value > 0;
export const teamMatches = (data, id) => data.matches.filter(m => m.home === id || m.away === id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round);
export const teamSide = (match, id) => match.home === id ? 'home' : 'away';
export const opposite = side => side === 'home' ? 'away' : 'home';
export function nextMatch(data, id, today) {
    return teamMatches(data, id).find(m => m.status !== 'completed' && m.date >= today) || null;
}
export function statsFor(data, id) {
    const matches = teamMatches(data, id);
    const completed = matches.filter(m => m.status === 'completed');
    const ratings = [], opponents = [], players = new Map(), form = [];
    let actual = 0, expected = 0, ratedGames = 0, closeWins = 0;
    matches.forEach(match => {
        const side = teamSide(match, id), other = opposite(side), index = side === 'home' ? 0 : 1;
        if (match.status === 'completed' && match.score) {
            const margin = match.score[index] - match.score[1 - index];
            form.push(margin > 0 ? 'W' : margin < 0 ? 'L' : 'D');
            if (margin > 0 && margin <= 1) closeWins++;
        }
        match.boards.forEach(board => {
            const player = board[`${side}_player`], rating = board[`${side}_rating`], opponent = board[`${other}_rating`];
            const hasResult = board.score && board.score.every(v => Number.isFinite(v) && v >= 0 && v <= 1) && board.score[0] + board.score[1] === 1;
            const played = hasResult && !board.forfeit && player?.id && board[`${other}_player`]?.id;
            if (played && validRating(rating)) ratings.push(rating);
            if (played && validRating(opponent)) opponents.push(opponent);
            if (played && validRating(rating) && validRating(opponent)) {
                actual += board.score[index];
                expected += expectedScore(rating, opponent);
                ratedGames++;
            }
            if (!player?.id || !played) return;
            if (!players.has(player.id)) players.set(player.id, { ...player, games: 0, points: 0, boards: [], rating: null, lastDate: '' });
            const entry = players.get(player.id);
            entry.games++;
            entry.points += board.score[index];
            entry.boards.push(board.board);
            if (match.date >= entry.lastDate) { entry.rating = validRating(rating) ? rating : null; entry.lastDate = match.date; }
        });
    });
    return { played: completed.length, rating: average(ratings), opposition: average(opponents),
        actual, expected, delta: ratedGames ? actual - expected : null, ratedGames, closeWins, form,
        players: [...players.values()].sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)) };
}
export function lastLineup(data, id) {
    const match = teamMatches(data, id).filter(m => m.boards.length && m.status === 'completed').slice(-1)[0];
    if (!match) return null;
    const side = teamSide(match, id);
    return { match, players: match.boards.map(board => ({ board: board.board, ...board[`${side}_player`], rating: board[`${side}_rating`] })) };
}
export function rankHistory(data, id) {
    const rounds = [...new Set(data.matches.filter(m => m.status === 'completed').map(m => m.round))].sort((a, b) => a - b);
    return rounds.map(round => {
        const standings = data.teams.map(team => {
            let mp = 0, bp = 0;
            data.matches.filter(m => m.status === 'completed' && m.round <= round && (m.home === team.id || m.away === team.id)).forEach(m => {
                const i = m.home === team.id ? 0 : 1;
                bp += m.score[i];
                mp += m.score[i] > m.score[1 - i] ? 2 : m.score[i] === m.score[1 - i] ? 1 : 0;
            });
            return { id: team.id, mp, bp };
        }).sort((a, b) => b.mp - a.mp || b.bp - a.bp);
        const own = standings.find(t => t.id === id);
        return { round, position: standings.filter(t => t.mp > own.mp || (t.mp === own.mp && t.bp > own.bp)).length + 1 };
    });
}
