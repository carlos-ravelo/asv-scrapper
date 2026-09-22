export function getSortedDirectory(eloData, directorySort) {
    const lastEloMap = new Map();
    eloData.forEach(row => {
        if (row.Publish_Date && row.Publish_Date !== 'Unknown') {
            const current = lastEloMap.get(row.Naam);
            if (!current || row.Publish_Date.localeCompare(current.date) > 0) {
                lastEloMap.set(row.Naam, { elo: row.ELO, date: row.Publish_Date });
            }
        }
    });

    const playersArray = Array.from(lastEloMap.entries());
    
    playersArray.sort((a, b) => {
        if (directorySort.key === 'elo') {
            const eloA = a[1].elo === 'Unrated' ? -1 : parseInt(a[1].elo);
            const eloB = b[1].elo === 'Unrated' ? -1 : parseInt(b[1].elo);
            return directorySort.asc ? eloA - eloB : eloB - eloA;
        } else {
            return directorySort.asc ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0]);
        }
    });
    
    return playersArray;
}

export function getChartData(selectedPlayers, eloData, cutoffDate, chartColors) {
    let allDates = new Set();
    
    const playerDatasets = selectedPlayers.map((player, idx) => {
        const playerHistory = eloData
            .filter(row => row.Naam === player && row.Publish_Date && row.Publish_Date !== 'Unknown')
            .filter(row => !cutoffDate || row.Publish_Date >= cutoffDate)
            .sort((a, b) => a.Publish_Date.localeCompare(b.Publish_Date));

        // Filtro para eliminar puntos redundantes intermedios (optimización)
        const cleanHistory = playerHistory.filter((row, i, arr) => {
            if (i === 0 || i === arr.length - 1) return true;
            return row.ELO !== arr[i - 1].ELO || row.ELO !== arr[i + 1].ELO; 
        });

        // Recolectar las fechas de este jugador para el eje X global
        cleanHistory.forEach(row => allDates.add(row.Publish_Date));

        const color = chartColors[idx % chartColors.length];

        return {
            label: player,
            dataRaw: cleanHistory, // Guardamos temporalmente para mapear después
            borderColor: color,
            backgroundColor: color,
            fill: false,
            tension: 0.1,
            pointRadius: 3,
            pointHoverRadius: 6,
            spanGaps: true // Evita que la línea se rompa si el jugador no jugó en una fecha
        };
    });

    // Ordenar todas las fechas cronológicamente de forma global
    const sortedDates = Array.from(allDates).sort();

    // Alinear los datos de cada jugador a las fechas globales
    playerDatasets.forEach(dataset => {
        dataset.data = sortedDates.map(date => {
            const match = dataset.dataRaw.find(d => d.Publish_Date === date);
            return match ? match.ELO : null;
        });
        delete dataset.dataRaw; // Limpiamos la propiedad temporal
    });

    return { labels: sortedDates, datasets: playerDatasets };
}

export function getFilteredMatches(selectedPlayers, resultsData, cutoffDate) {
    return resultsData.filter(match => {
        if (cutoffDate && match.Publish_Date < cutoffDate) return false;
        if (selectedPlayers.length === 1) {
            return match.Witspeler === selectedPlayers[0] || match.Zwartspeler === selectedPlayers[0];
        } else if (selectedPlayers.length === 2) {
            return (match.Witspeler === selectedPlayers[0] && match.Zwartspeler === selectedPlayers[1]) ||
                   (match.Witspeler === selectedPlayers[1] && match.Zwartspeler === selectedPlayers[0]);
        }
        return false;
    });
}

function calculateStreak(player, matches) {
    const sortedMatches = [...matches].sort((a, b) => {
        const da = a.Publish_Date && a.Publish_Date !== 'Unknown' ? a.Publish_Date : '';
        const db = b.Publish_Date && b.Publish_Date !== 'Unknown' ? b.Publish_Date : '';
        return db.localeCompare(da);
    });

    const recent5 = sortedMatches.slice(0, 5);
    return recent5.map(match => {
        const isWhite = match.Witspeler === player;
        if (match.Uitslag === '1-0') return isWhite ? 'W' : 'L';
        if (match.Uitslag === '0-1') return isWhite ? 'L' : 'W';
        if (match.Uitslag === '½-½') return 'D';
        return '?';
    });
}

function getLatestElo(playerName, eloData) {
    const history = eloData
        .filter(r => r.Naam === playerName && r.Publish_Date && r.Publish_Date !== 'Unknown')
        .sort((a, b) => a.Publish_Date.localeCompare(b.Publish_Date));
    return history.length > 0 ? history[history.length - 1].ELO : 'N/A';
}

export function getPlayerStats(selectedPlayers, matches, eloData) {
    if (selectedPlayers.length === 1) {
        const player = selectedPlayers[0];
        let wins = 0, losses = 0, draws = 0;
        const rivalCounts = {};
        let bestWin = null;
        let bestWinElo = -1;

        matches.forEach(match => {
            const isWhite = match.Witspeler === player;
            const opponent = isWhite ? match.Zwartspeler : match.Witspeler;
            
            rivalCounts[opponent] = (rivalCounts[opponent] || 0) + 1;

            const won = (isWhite && match.Uitslag === '1-0') || (!isWhite && match.Uitslag === '0-1');
            const lost = (isWhite && match.Uitslag === '0-1') || (!isWhite && match.Uitslag === '1-0');

            if (won) {
                wins++;
                const oppEloStr = getLatestElo(opponent, eloData);
                const oppElo = parseInt(oppEloStr) || 0;
                if (oppElo > bestWinElo) {
                    bestWinElo = oppElo;
                    bestWin = { opponent, elo: oppEloStr };
                }
            } else if (lost) {
                losses++;
            } else if (match.Uitslag === '½-½') {
                draws++;
            }
        });

        const total = wins + losses + draws;
        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
        
        let mostFrequentRivals = [];
        let maxRivalGames = 0;
        for (const opp in rivalCounts) {
            if (rivalCounts[opp] > maxRivalGames) {
                maxRivalGames = rivalCounts[opp];
                mostFrequentRivals = [opp];
            } else if (rivalCounts[opp] === maxRivalGames) {
                mostFrequentRivals.push(opp);
            }
        }

        const streak = calculateStreak(player, matches);

        return {
            type: 'single',
            wins, losses, draws,
            totalGames: total,
            winRate,
            bestWin,
            rivals: { names: mostFrequentRivals, count: maxRivalGames },
            streak
        };

    } else if (selectedPlayers.length === 2) {
        const p1 = selectedPlayers[0];
        const p2 = selectedPlayers[1];
        let p1Wins = 0, p2Wins = 0, draws = 0;

        matches.forEach(match => {
            if (match.Uitslag === '1-0') {
                if (match.Witspeler === p1) p1Wins++; else p2Wins++;
            } else if (match.Uitslag === '0-1') {
                if (match.Zwartspeler === p1) p1Wins++; else p2Wins++;
            } else if (match.Uitslag === '½-½') {
                draws++;
            }
        });
        
        const p1Streak = calculateStreak(p1, matches);
        const p2Streak = calculateStreak(p2, matches);

        return {
            type: 'h2h',
            p1, p2, p1Wins, p2Wins, draws,
            p1Streak, p2Streak
        };
    }
    return null;
}