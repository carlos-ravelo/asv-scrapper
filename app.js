import { createEloChart } from './chartManager.js';
import { MAX_SELECTED_PLAYERS, SELECTORS } from './constants.js';
import { removeAccents } from './utils.js';
import { chartColors, renderPlayerChips, highlightDirectoryRows, renderStats, renderHistoryTable, renderDirectoryTable } from './uiComponents.js';
import { getSortedDirectory, getChartData, getFilteredMatches, getPlayerStats } from './dataProcessor.js';

// ==========================================
// 1. DOM CACHE
// ==========================================
const DOM = {
    chartContainer: document.getElementById(SELECTORS.CHART_CONTAINER),
    historyContainer: document.getElementById(SELECTORS.HISTORY_CONTAINER),
    emptyState: document.getElementById(SELECTORS.EMPTY_STATE),
    statsContainer: document.getElementById(SELECTORS.STATS_CONTAINER),
    playerChips: document.getElementById(SELECTORS.PLAYER_CHIPS),
    modalChips: document.getElementById(SELECTORS.MODAL_CHIPS),
    clearBtn: document.getElementById(SELECTORS.BTN_CLEAR.substring(1)),
    directorySearch: document.getElementById(SELECTORS.DIR_SEARCH),
    timeFilter: document.getElementById(SELECTORS.TIME_FILTER),
    modalTimeFilter: document.getElementById(SELECTORS.MODAL_TIME_FILTER),
    chartModal: document.getElementById(SELECTORS.CHART_MODAL),
    matchHistoryBody: document.getElementById(SELECTORS.MATCH_HISTORY_BODY),
    ctxChart: document.getElementById(SELECTORS.ELO_CHART).getContext('2d'),
    ctxModal: document.getElementById(SELECTORS.MODAL_ELO_CHART).getContext('2d')
};

// ==========================================
// 2. REACTIVE STATE (ES6 Proxy)
// ==========================================
const state = new Proxy({
    resultsData: [],
    eloData: [],
    selectedPlayers: [],
    directorySort: { key: 'elo', asc: false },
    timeFilter: 'all'
}, {
    set(target, property, value) {
        target[property] = value;
        
        if (property === 'directorySort') renderLanding();
        
        if (property === 'selectedPlayers') {
            saveFavorites(value);
            syncUrlWithPlayers(value);
            highlightDirectoryRows(value);
            if (DOM.clearBtn) DOM.clearBtn.style.display = value.length ? 'inline-block' : 'none';
            updateDashboard();
        }
        
        if (property === 'timeFilter') updateDashboard();
        
        return true;
    }
});

let eloChartInstance = null, modalChartInstance = null;

// ==========================================
// 3. INITIALIZATION
// ==========================================
Promise.all([
    fetch('asv_results.json').then(res => res.json()),
    fetch('asv_elo.json').then(res => res.json())
]).then(([results, elo]) => {
    state.resultsData = results;
    state.eloData = elo;
    renderLanding();
    loadStateFromStorageOrUrl();
}).catch(error => console.error("Error loading JSON data:", error));

// ==========================================
// 4. UI ORCHESTRATION
// ==========================================
function renderLanding() {
    const sortedPlayers = getSortedDirectory(state.eloData, state.directorySort);
    renderDirectoryTable(sortedPlayers);
    highlightDirectoryRows(state.selectedPlayers);
}

function updateDashboard() {
    if (state.selectedPlayers.length === 0) {
        if (DOM.chartContainer) DOM.chartContainer.style.display = 'none';
        if (DOM.historyContainer) DOM.historyContainer.style.display = 'none';
        if (DOM.emptyState) DOM.emptyState.style.display = 'flex';
        renderStats(DOM.statsContainer, null);
        return;
    }

    if (DOM.emptyState) DOM.emptyState.style.display = 'none';
    if (DOM.chartContainer) DOM.chartContainer.style.display = 'block';

    renderPlayerChips(DOM.playerChips, state.selectedPlayers, state.eloData);
    renderPlayerChips(DOM.modalChips, state.selectedPlayers, state.eloData);

    const cutoffDate = getCutoffDate();
    const chartData = getChartData(state.selectedPlayers, state.eloData, cutoffDate, chartColors);
    
    // Safely destroy the main chart instance.
    if (eloChartInstance) {
        eloChartInstance.destroy();
        eloChartInstance = null;
    }
    
    eloChartInstance = createEloChart(DOM.ctxChart, eloChartInstance, chartData, true);
    syncModalIfOpen(chartData);

    if (state.selectedPlayers.length <= 2) {
        if (DOM.historyContainer) DOM.historyContainer.style.display = 'block';
        const matchesToDisplay = getFilteredMatches(state.selectedPlayers, state.resultsData, cutoffDate);
        
        const statsData = getPlayerStats(state.selectedPlayers, matchesToDisplay, state.eloData);
        renderStats(DOM.statsContainer, statsData);
        
        renderHistoryTable(DOM.matchHistoryBody, matchesToDisplay, state.selectedPlayers);
    } else {
        if (DOM.historyContainer) DOM.historyContainer.style.display = 'none';
        renderStats(DOM.statsContainer, null);
    }
}

// ==========================================
// 5. PURE ACTIONS
// ==========================================
function sortDirectory(key) {
    const isSameKey = state.directorySort.key === key;
    state.directorySort = { key: key, asc: isSameKey ? !state.directorySort.asc : (key === 'name') };
}

function selectPlayer(name) {
    const clean = String(name).trim();
    let newPlayers = [...state.selectedPlayers];
    const index = newPlayers.indexOf(clean);
    
    if (index > -1) {
        newPlayers.splice(index, 1);
    } else {
        if (newPlayers.length >= MAX_SELECTED_PLAYERS) {
            alert("Maximum " + MAX_SELECTED_PLAYERS + " players for comparison.");
            return;
        }
        newPlayers.push(clean);
    }
    state.selectedPlayers = newPlayers;
}

function clearSelection() {
    state.selectedPlayers = [];
}

function filterDirectory() {
    const query = removeAccents(DOM.directorySearch.value.toLowerCase());
    document.querySelectorAll(SELECTORS.DIRECTORY_ROW).forEach(row => {
        const playerName = removeAccents(row.querySelector(SELECTORS.CLICKABLE_PLAYER).textContent.toLowerCase());
        row.style.display = playerName.includes(query) ? '' : 'none';
    });
}

// ==========================================
// 6. HELPERS & MODALS
// ==========================================
function getCutoffDate() {
    if (state.timeFilter === 'all') return null;
    const d = new Date();
    d.setMonth(d.getMonth() - parseInt(state.timeFilter));
    return d.toISOString().split('T')[0];
}

function syncModalIfOpen(chartData) {
    if (DOM.chartModal && DOM.chartModal.style.display === 'flex') {
        // Destroy the modal chart instance if one exists.
        if (modalChartInstance) {
            modalChartInstance.destroy();
            modalChartInstance = null;
        }
        modalChartInstance = createEloChart(DOM.ctxModal, modalChartInstance, chartData, false);
    }
}

function openChartModal() {
    if (!eloChartInstance) return;
    if (DOM.modalTimeFilter) DOM.modalTimeFilter.value = state.timeFilter;
    if (DOM.chartModal) DOM.chartModal.style.display = 'flex';
    
    // Destroy the modal chart instance before recreating it.
    if (modalChartInstance) {
        modalChartInstance.destroy();
        modalChartInstance = null;
    }
    modalChartInstance = createEloChart(DOM.ctxModal, modalChartInstance, JSON.parse(JSON.stringify(eloChartInstance.data)), false);
}

function closeChartModal() {
    if (DOM.chartModal) DOM.chartModal.style.display = 'none';
    if (modalChartInstance) { modalChartInstance.destroy(); modalChartInstance = null; }
}

function saveFavorites(players) {
    localStorage.setItem('asv_chess_favorites', JSON.stringify(players));
}

function syncUrlWithPlayers(players) {
    const url = new URL(window.location);
    if (players.length > 0) {
        url.searchParams.set('p', players.join(','));
    } else {
        url.searchParams.delete('p');
    }
    window.history.replaceState({}, '', url);
}

function loadStateFromStorageOrUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const pParam = urlParams.get('p');
    
    if (pParam) {
        const playersFromUrl = pParam.split(',').map(p => p.trim()).filter(Boolean);
        if (playersFromUrl.length > 0) {
            state.selectedPlayers = playersFromUrl.slice(0, MAX_SELECTED_PLAYERS);
            return; 
        }
    }
    
    const savedPlayers = localStorage.getItem('asv_chess_favorites');
    if (!savedPlayers) return;

    try {
        const parsedPlayers = JSON.parse(savedPlayers);
        if (Array.isArray(parsedPlayers) && parsedPlayers.length > 0) {
            state.selectedPlayers = parsedPlayers.slice(0, MAX_SELECTED_PLAYERS);
        }
    } catch (e) {
        console.error("Failed to parse saved players from localStorage", e);
    }
}

// ==========================================
// CENTRAL EVENT DELEGATION
// ==========================================
document.addEventListener('click', (e) => {
    const playerLink = e.target.closest(SELECTORS.ACTION_SELECT_PLAYER);
    if (playerLink && playerLink.dataset.player) {
        selectPlayer(playerLink.dataset.player);
        return;
    }
    if (e.target.closest(SELECTORS.BTN_CLEAR)) clearSelection();
    if (e.target.closest(SELECTORS.BTN_MAXIMIZE)) openChartModal();
    if (e.target.closest(SELECTORS.BTN_CLOSE_MODAL)) closeChartModal();
    if (e.target.closest(SELECTORS.SORT_NAME)) sortDirectory('name');
    if (e.target.closest(SELECTORS.SORT_ELO)) sortDirectory('elo');
});

document.addEventListener('change', (e) => {
    if (e.target.id === SELECTORS.TIME_FILTER || e.target.id === SELECTORS.MODAL_TIME_FILTER) {
        state.timeFilter = e.target.value; 
        DOM.timeFilter.value = e.target.value;
        DOM.modalTimeFilter.value = e.target.value;
    }
});

document.addEventListener('input', (e) => {
    if (e.target.id === SELECTORS.DIR_SEARCH) filterDirectory();
});