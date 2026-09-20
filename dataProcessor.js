export function getSortedDirectory(eloData, sortConfig) {
    const latestElo = new Map();
    eloData.forEach(row => {
        if (!row.Naam || row.ELO == null) return;
        const key = String(row.Naam).trim();
        const date = row.Publish_Date && row.Publish_Date !== 'Unknown' ? row.Publish_Date : '';
        const prev = latestElo.get(key);
        if (!prev || date.localeCompare(prev.date) > 0) {
            latestElo.set(key, { elo: Number(row.ELO), date });
        }
    });

    return Array.from(latestElo.entries()).sort((a, b) => {
        if (sortConfig.key === 'elo') {
            return sortConfig.asc ? a[1].elo - b[1].elo : b[1].elo - a[1].elo;
        } else {
            return sortConfig.asc ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0]);
        }
    });
}

export function getChartData(selectedPlayers, eloData, cutoffDate, chartColors) {
    let allDates = new Set();
    const playerDatasets = selectedPlayers.map((player, idx) => {
        let rawHistory = eloData
            .filter(row => row.Naam === player && row.Publish_Date && row.Publish_Date !== 'Unknown')
            .sort((a, b) => a.Publish_Date.localeCompare(b.Publish_Date));
        
        if (cutoffDate) rawHistory = rawHistory.filter(row => row.Publish_Date >= cutoffDate);

        const history = rawHistory.filter((row, i, arr) => {
            if (i === 0 || i === arr.length - 1) return true;
            return row.ELO !== arr[i - 1].ELO || row.ELO !== arr[i + 1].ELO;
        });
        
        history.forEach(row => allDates.add(row.Publish_Date));
        const color = chartColors[idx % chartColors.length];
        
        return {
            label: player, dataRaw: history, borderColor: color, backgroundColor: color + '33',
            borderWidth: 2, fill: false, tension: 0.1, spanGaps: true,
            pointRadius: 2, hitRadius: 25, pointHoverRadius: 6, pointBackgroundColor: color
        };
    });

    const sortedDates = Array.from(allDates).sort();
    playerDatasets.forEach(dataset => {
        dataset.data = sortedDates.map(date => {
            const match = dataset.dataRaw.find(d => d.Publish_Date === date);
            return match ? match.ELO : null;
        });
    });

    return { labels: sortedDates, datasets: playerDatasets };
}

export function getFilteredMatches(selectedPlayers, resultsData, cutoffDate) {
    let matches = [];
    if (selectedPlayers.length === 1) {
        matches = resultsData.filter(row => row.Witspeler === selectedPlayers[0] || row.Zwartspeler === selectedPlayers[0]);
    } else if (selectedPlayers.length === 2) {
        const [p1, p2] = selectedPlayers;
        matches = resultsData.filter(row => (row.Witspeler === p1 && row.Zwartspeler === p2) || (row.Witspeler === p2 && row.Zwartspeler === p1));
    }
    if (cutoffDate) matches = matches.filter(row => row.Publish_Date && row.Publish_Date >= cutoffDate);
    return matches;
}

export function getPlayerStats(selectedPlayers, matchesToDisplay, eloData) {
    if (selectedPlayers.length === 1) {
        const p = selectedPlayers[0];
        let wins = 0, draws = 0, losses = 0;
        const oppCount = {};
        let bestWinOpponent = null, highestEloBeaten = 0;
        const maxElos = {};

        eloData.forEach(row => {
            if (!maxElos[row.Naam] || row.ELO > maxElos[row.Naam]) maxElos[row.Naam] = row.ELO;
        });

        matchesToDisplay.forEach(match => {
            const isWhite = match.Witspeler === p;
            const opp = isWhite ? match.Zwartspeler : match.Witspeler;
            if (opp) oppCount[opp] = (oppCount[opp] || 0) + 1;

            const won = (isWhite && match.Uitslag === '1-0') || (!isWhite && match.Uitslag === '0-1');
            const lost = (isWhite && match.Uitslag === '0-1') || (!isWhite && match.Uitslag === '1-0');

            if (won) {
                wins++;
                if (maxElos[opp] && maxElos[opp] > highestEloBeaten) {
                    highestEloBeaten = maxElos[opp];
                    bestWinOpponent = opp;
                }
            } else if (lost) losses++;
            else if (match.Uitslag === '½-½') draws++;
        });

        const totalGames = wins + draws + losses;
        const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

        const sortedOpponents = Object.entries(oppCount).sort((a, b) => b[1] - a[1]);
        const maxGames = sortedOpponents.length > 0 ? sortedOpponents[0][1] : 0;
        const topRivals = sortedOpponents.filter(opp => opp[1] === maxGames).map(opp => opp[0]);

        return {
            type: 'single',
            winRate, wins, draws, losses, totalGames,
            bestWin: bestWinOpponent ? { opponent: bestWinOpponent, elo: highestEloBeaten } : null,
            rivals: { names: topRivals, count: maxGames }
        };

    } else if (selectedPlayers.length === 2) {
        const [p1, p2] = selectedPlayers;
        let p1Wins = 0, p2Wins = 0, draws = 0;

        matchesToDisplay.forEach(match => {
            const p1IsWhite = match.Witspeler === p1;
            if (match.Uitslag === '1-0') p1IsWhite ? p1Wins++ : p2Wins++;
            else if (match.Uitslag === '0-1') p1IsWhite ? p2Wins++ : p1Wins++;
            else if (match.Uitslag === '½-½') draws++;
        });

        return { type: 'h2h', p1, p2, p1Wins, p2Wins, draws };
    }
    return null;
}