import { SELECTORS } from './app.js';
export const chartColors = ['#0056b3', '#dc3545', '#28a745', '#fd7e14', '#6f42c1'];

export const UI_CLASSES = Object.freeze({
    CHIP: '.player-chip',
    CHIP_NAME: '.chip-name',
    CHIP_ELO: '.chip-elo',
    CHIP_CLOSE: '.chip-close',
    STAT_WINRATE: '.stat-winrate',
    STAT_TOTAL: '.stat-total',
    STAT_RIVAL: '.stat-rival',
    STAT_BESTWIN: '.stat-bestwin',
    H2H_P1: '.h2h-p1',
    H2H_SCORE: '.h2h-score',
    H2H_P2: '.h2h-p2',
    H2H_DRAWS: '.h2h-draws',
    HISTORY_ROW: '.history-row',
    COL_DATE: '.col-date',
    COL_WHITE: '.col-white',
    COL_BLACK: '.col-black',
    COL_RESULT: '.col-result',
    TEXT_WIN: 'text-win',
    TEXT_LOSS: 'text-loss',
    ROW_WIN: 'row-win',
    ROW_LOSS: 'row-loss',
    ROW_DRAW: 'row-draw',
    TEXT_BOLD: 'text-bold'
});

// ==========================================
// CACHÉ DEL DOM (Se ejecuta 1 sola vez)
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
        
        const link = clone.querySelector(SELECTORS.CLICKABLE_PLAYER);
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
        const chip = clone.querySelector(UI_CLASSES.CHIP);
        
        chip.style.setProperty('--theme-color', chartColors[idx % chartColors.length]);
        
        clone.querySelector(UI_CLASSES.CHIP_NAME).textContent = player;
        clone.querySelector(UI_CLASSES.CHIP_ELO).textContent = `(${lastElo})`;
        clone.querySelector(UI_CLASSES.CHIP_CLOSE).dataset.player = player;
        
        container.appendChild(clone);
    });
}

export function highlightDirectoryRows(selectedPlayers) {
    document.querySelectorAll(SELECTORS.DIRECTORY_ROW).forEach(row => {
        const link = row.querySelector(SELECTORS.CLICKABLE_PLAYER);
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
        
        clone.querySelector(UI_CLASSES.STAT_WINRATE).textContent = `${stats.winRate}% (${stats.wins}W - ${stats.draws}D - ${stats.losses}L)`;
        clone.querySelector(UI_CLASSES.STAT_TOTAL).textContent = stats.totalGames;
        
        const rivalContainer = clone.querySelector(UI_CLASSES.STAT_RIVAL);
        if (stats.rivals.names.length > 0) {
            stats.rivals.names.forEach((name, idx) => {
                rivalContainer.appendChild(createPlayerLinkNode(name));
                if (idx < stats.rivals.names.length - 1) rivalContainer.appendChild(document.createTextNode(', '));
            });
            rivalContainer.appendChild(document.createTextNode(` (${stats.rivals.count}x)`));
        } else {
            rivalContainer.textContent = "N/A";
        }

        const bestWinContainer = clone.querySelector(UI_CLASSES.STAT_BESTWIN);
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
        
        clone.querySelector(UI_CLASSES.H2H_P1).textContent = stats.p1;
        clone.querySelector(UI_CLASSES.H2H_SCORE).textContent = `${stats.p1Wins} - ${stats.p2Wins}`;
        clone.querySelector(UI_CLASSES.H2H_P2).textContent = stats.p2;
        clone.querySelector(UI_CLASSES.H2H_DRAWS).textContent = `(${stats.draws} Draws)`;
        
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
        const tr = clone.querySelector(UI_CLASSES.HISTORY_ROW);
        const isWhite = selectedPlayers.includes(match.Witspeler);
        const isBlack = selectedPlayers.includes(match.Zwartspeler);

        const whiteSpan = clone.querySelector(`${UI_CLASSES.COL_WHITE} ${SELECTORS.CLICKABLE_PLAYER}`);
        const blackSpan = clone.querySelector(`${UI_CLASSES.COL_BLACK} ${SELECTORS.CLICKABLE_PLAYER}`);
        
        if (selectedPlayers.length === 2) {
            if (match.Uitslag === '1-0') { whiteSpan.classList.add(UI_CLASSES.TEXT_WIN); blackSpan.classList.add(UI_CLASSES.TEXT_LOSS); } 
            else if (match.Uitslag === '0-1') { whiteSpan.classList.add(UI_CLASSES.TEXT_LOSS); blackSpan.classList.add(UI_CLASSES.TEXT_WIN); }
        }

        if (selectedPlayers.length === 1) {
            const isPWhite = match.Witspeler === selectedPlayers[0];
            const won = (isPWhite && match.Uitslag === '1-0') || (!isPWhite && match.Uitslag === '0-1');
            const lost = (isPWhite && match.Uitslag === '0-1') || (!isPWhite && match.Uitslag === '1-0');
            if (won) tr.classList.add(UI_CLASSES.ROW_WIN); 
            else if (lost) tr.classList.add(UI_CLASSES.ROW_LOSS); 
            else if (match.Uitslag === '½-½') tr.classList.add(UI_CLASSES.ROW_DRAW); 
        }

        clone.querySelector(UI_CLASSES.COL_DATE).textContent = match.Publish_Date || '';
        whiteSpan.textContent = match.Witspeler || '';
        whiteSpan.dataset.player = match.Witspeler;
        if (isWhite) whiteSpan.classList.add(UI_CLASSES.TEXT_BOLD);
        
        blackSpan.textContent = match.Zwartspeler || '';
        blackSpan.dataset.player = match.Zwartspeler;
        if (isBlack) blackSpan.classList.add(UI_CLASSES.TEXT_BOLD);
        
        clone.querySelector(UI_CLASSES.COL_RESULT).textContent = match.Uitslag || '';
        
        tbody.appendChild(clone);
    });
}