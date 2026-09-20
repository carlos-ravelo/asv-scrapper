export const chartColors = ['#0056b3', '#dc3545', '#28a745', '#fd7e14', '#6f42c1'];

// ==========================================
//  DOM CACHE (runs just one time)
// ==========================================
const DOM = {
    topEloBody: document.getElementById('topEloBody'),
    tpl: {
        dirRow: document.getElementById('tpl-directory-row'),
        chip: document.getElementById('tpl-player-chip'),
        statsSingle: document.getElementById('tpl-stats-single'),
        statsH2h: document.getElementById('tpl-stats-h2h'),
        historyRow: document.getElementById('tpl-history-row')
    }
};

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
    if (!DOM.topEloBody || !DOM.tpl.dirRow) return; 
    
    DOM.topEloBody.innerHTML = '';
    sortedPlayers.forEach(([name, data], index) => {
        const clone = DOM.tpl.dirRow.content.cloneNode(true);
        const tds = clone.querySelectorAll('td');
        
        tds[0].textContent = index + 1;
        tds[2].textContent = data.elo;
        
        const link = clone.querySelector('.clickable-player');
        link.textContent = name;
        link.dataset.player = name;
        
        DOM.topEloBody.appendChild(clone);
    });
}

export function renderPlayerChips(container, selectedPlayers, eloData) {
    if (!container || !DOM.tpl.chip) return;
    
    container.innerHTML = '';
    selectedPlayers.forEach((player, idx) => {
        const playerHistory = eloData
            .filter(row => row.Naam === player && row.Publish_Date && row.Publish_Date !== 'Unknown')
            .sort((a, b) => a.Publish_Date.localeCompare(b.Publish_Date));
        const lastElo = playerHistory.length > 0 ? playerHistory[playerHistory.length - 1].ELO : 'N/A';
        
        const clone = DOM.tpl.chip.content.cloneNode(true);
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

export function renderStats(statsContainer, stats) {
    if (!statsContainer) return;
    statsContainer.innerHTML = '';
    
    if (!stats) {
        statsContainer.style.display = 'none';
        return;
    }

    if (stats.type === 'single') {
        if (!DOM.tpl.statsSingle) return;
        const clone = DOM.tpl.statsSingle.content.cloneNode(true);
        
        clone.querySelector('.stat-winrate').textContent = `${stats.winRate}% (${stats.wins}W - ${stats.draws}D - ${stats.losses}L)`;
        clone.querySelector('.stat-total').textContent = stats.totalGames;
        
        const rivalContainer = clone.querySelector('.stat-rival');
        if (stats.rivals.names.length > 0) {
            stats.rivals.names.forEach((name, idx) => {
                rivalContainer.appendChild(createPlayerLinkNode(name));
                if (idx < stats.rivals.names.length - 1) rivalContainer.appendChild(document.createTextNode(', '));
            });
            rivalContainer.appendChild(document.createTextNode(` (${stats.rivals.count}x)`));
        } else {
            rivalContainer.textContent = "N/A";
        }

        const bestWinContainer = clone.querySelector('.stat-bestwin');
        if (stats.bestWin) {
            bestWinContainer.appendChild(createPlayerLinkNode(stats.bestWin.opponent, ` (${stats.bestWin.elo})`));
        } else {
            bestWinContainer.textContent = "N/A";
        }

        statsContainer.style.display = 'flex';
        statsContainer.appendChild(clone);

    } else if (stats.type === 'h2h') {
        if (!DOM.tpl.statsH2h) return;
        const clone = DOM.tpl.statsH2h.content.cloneNode(true);
        
        clone.querySelector('.h2h-p1').textContent = stats.p1;
        clone.querySelector('.h2h-score').textContent = `${stats.p1Wins} - ${stats.p2Wins}`;
        clone.querySelector('.h2h-p2').textContent = stats.p2;
        clone.querySelector('.h2h-draws').textContent = `(${stats.draws} Draws)`;
        
        statsContainer.style.display = 'flex';
        statsContainer.appendChild(clone);
    }
}

export function renderHistoryTable(tbody, matchesToDisplay, selectedPlayers) {
    if (!tbody || !DOM.tpl.historyRow) return;
    tbody.innerHTML = "";
    
    matchesToDisplay.sort((a, b) => {
        const da = a.Publish_Date && a.Publish_Date !== 'Unknown' ? a.Publish_Date : '';
        const db = b.Publish_Date && b.Publish_Date !== 'Unknown' ? b.Publish_Date : '';
        return db.localeCompare(da);
    }).forEach(match => {
        const clone = DOM.tpl.historyRow.content.cloneNode(true);
        const tr = clone.querySelector('.history-row');
        const isWhite = selectedPlayers.includes(match.Witspeler);
        const isBlack = selectedPlayers.includes(match.Zwartspeler);

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