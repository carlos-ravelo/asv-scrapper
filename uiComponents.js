export const chartColors = ['#0056b3', '#dc3545', '#28a745', '#fd7e14', '#6f42c1'];

// Small helper to avoid repeating the creation of dynamic player links
function createPlayerLinkNode(name, additionalText = '') {
    const span = document.createElement('span');
    span.className = 'clickable-player link-style';
    span.dataset.action = 'select-player';
    span.dataset.player = name;
    span.textContent = name;
    
    if (additionalText) {
        const container = document.createDocumentFragment();
        container.appendChild(span);
        container.appendChild(document.createTextNode(additionalText));
        return container;
    }
    return span;
}

export function renderDirectoryTable(sortedPlayers) {
    const tbody = document.getElementById('topEloBody');
    const tpl = document.getElementById('tpl-directory-row');
    if (!tbody || !tpl) return; 
    
    tbody.innerHTML = '';
    sortedPlayers.forEach(([name, data], index) => {
        const clone = tpl.content.cloneNode(true);
        const tds = clone.querySelectorAll('td');
        
        tds[0].textContent = index + 1;
        tds[2].textContent = data.elo;
        
        const link = clone.querySelector('.clickable-player');
        link.textContent = name;
        link.dataset.player = name;
        
        tbody.appendChild(clone);
    });
}

export function renderPlayerChips(containerId, selectedPlayers, eloData) {
    const container = document.getElementById(containerId);
    const tpl = document.getElementById('tpl-player-chip');
    if (!container || !tpl) return;
    container.innerHTML = '';
    selectedPlayers.forEach((player, idx) => {
        const playerHistory = eloData
            .filter(row => row.Naam === player && row.Publish_Date && row.Publish_Date !== 'Unknown')
            .sort((a, b) => a.Publish_Date.localeCompare(b.Publish_Date));
        const lastElo = playerHistory.length > 0 ? playerHistory[playerHistory.length - 1].ELO : 'N/A';
        const clone = tpl.content.cloneNode(true);
        const chip = clone.querySelector('.player-chip');        
        chip.style.setProperty('--theme-color', chartColors[idx % chartColors.length]);       
        clone.querySelector('.chip-name').textContent = player;
        clone.querySelector('.chip-elo').textContent = `(${lastElo})`;
        clone.querySelector('.chip-close').dataset.player = player;
        
        container.appendChild(clone);
    });
}

export function highlightDirectoryRows(selectedPlayers) {
    document.querySelectorAll('.directory-row').forEach(row => {
        const link = row.querySelector('.clickable-player');
        if (!link) return;
        const rowName = link.textContent.trim();
        row.style.backgroundColor = selectedPlayers.includes(rowName) ? '#e9ecef' : '';
    });
}

export function renderStats(statsContainer, matchesToDisplay, eloData, selectedPlayers) {
    if (!statsContainer) return;
    statsContainer.innerHTML = ''; // Clean container
    
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
        
        const tpl = document.getElementById('tpl-stats-single');
        const clone = tpl.content.cloneNode(true);
        
        clone.querySelector('.stat-winrate').textContent = `${winRate}% (${wins}W - ${draws}D - ${losses}L)`;
        clone.querySelector('.stat-total').textContent = totalGames;
        
        // Procesar oponente más frecuente
        const sortedOpponents = Object.entries(oppCount).sort((a, b) => b[1] - a[1]);
        const rivalContainer = clone.querySelector('.stat-rival');
        if (sortedOpponents.length > 0) {
            const maxGames = sortedOpponents[0][1];
            const topRivals = sortedOpponents.filter(opp => opp[1] === maxGames);
            topRivals.forEach((opp, idx) => {
                rivalContainer.appendChild(createPlayerLinkNode(opp[0]));
                if (idx < topRivals.length - 1) rivalContainer.appendChild(document.createTextNode(', '));
            });
            rivalContainer.appendChild(document.createTextNode(` (${maxGames}x)`));
        } else {
            rivalContainer.textContent = "N/A";
        }

        // Process best win
        const bestWinContainer = clone.querySelector('.stat-bestwin');
        if (bestWinOpponent) {
            bestWinContainer.appendChild(createPlayerLinkNode(bestWinOpponent, ` (${highestEloBeaten})`));
        } else {
            bestWinContainer.textContent = "N/A";
        }

        statsContainer.style.display = 'flex';
        statsContainer.appendChild(clone);

    } else if (selectedPlayers.length === 2) {
        const [p1, p2] = selectedPlayers;
        let p1Wins = 0, p2Wins = 0, draws = 0;
        
        matchesToDisplay.forEach(match => {
            const p1IsWhite = match.Witspeler === p1;
            if (match.Uitslag === '1-0') p1IsWhite ? p1Wins++ : p2Wins++;
            else if (match.Uitslag === '0-1') p1IsWhite ? p2Wins++ : p1Wins++;
            else if (match.Uitslag === '½-½') draws++;
        });

        const tpl = document.getElementById('tpl-stats-h2h');
        const clone = tpl.content.cloneNode(true);
        
        clone.querySelector('.h2h-p1').textContent = p1;
        clone.querySelector('.h2h-score').textContent = `${p1Wins} - ${p2Wins}`;
        clone.querySelector('.h2h-p2').textContent = p2;
        clone.querySelector('.h2h-draws').textContent = `(${draws} Draws)`;
        
        statsContainer.style.display = 'flex';
        statsContainer.appendChild(clone);
    }
}

export function renderHistoryTable(tbody, matchesToDisplay, selectedPlayers) {
    const tpl = document.getElementById('tpl-history-row');
    if (!tbody || !tpl) return;
    tbody.innerHTML = "";
    
    matchesToDisplay.sort((a, b) => {
        const da = a.Publish_Date && a.Publish_Date !== 'Unknown' ? a.Publish_Date : '';
        const db = b.Publish_Date && b.Publish_Date !== 'Unknown' ? b.Publish_Date : '';
        return db.localeCompare(da);
    }).forEach(match => {
        const clone = tpl.content.cloneNode(true);
        const tr = clone.querySelector('.history-row');
        const isWhite = selectedPlayers.includes(match.Witspeler);
        const isBlack = selectedPlayers.includes(match.Zwartspeler);

        // Dynamic color classes
        const whiteSpan = clone.querySelector('.col-white .clickable-player');
        const blackSpan = clone.querySelector('.col-black .clickable-player');
        
        if (selectedPlayers.length === 2) {
            if (match.Uitslag === '1-0') { whiteSpan.classList.add('text-win'); blackSpan.classList.add('text-loss'); } 
            else if (match.Uitslag === '0-1') { whiteSpan.classList.add('text-loss'); blackSpan.classList.add('text-win'); }
        }

        if (selectedPlayers.length === 1) {
            const isPWhite = match.Witspeler === selectedPlayers[0];
            const won = (isPWhite && match.Uitslag === '1-0') || (!isPWhite && match.Uitslag === '0-1');
            const lost = (isPWhite && match.Uitslag === '0-1') || (!isPWhite && match.Uitslag === '1-0');
            if (won) tr.classList.add('row-win'); 
            else if (lost) tr.classList.add('row-loss'); 
            else if (match.Uitslag === '½-½') tr.classList.add('row-draw'); 
        }

        // Safe data assignment
        clone.querySelector('.col-date').textContent = match.Publish_Date || '';
        whiteSpan.textContent = match.Witspeler || '';
        whiteSpan.dataset.player = match.Witspeler;
        if (isWhite) whiteSpan.classList.add('text-bold');
        
        blackSpan.textContent = match.Zwartspeler || '';
        blackSpan.dataset.player = match.Zwartspeler;
        if (isBlack) blackSpan.classList.add('text-bold');
        
        clone.querySelector('.col-result').textContent = match.Uitslag || '';
        
        tbody.appendChild(clone);
    });
}