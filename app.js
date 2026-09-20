import { createEloChart } from './chartManager.js';
import { removeAccents } from './utils.js';
import { chartColors, renderPlayerChips, highlightDirectoryRows, renderStats, renderHistoryTable, renderDirectoryTable } from './uiComponents.js';
import { getSortedDirectory, getChartData, getFilteredMatches, getPlayerStats } from './dataProcessor.js';

// ==========================================
// 1. DOM CACHE (performance)
// ==========================================
const DOM = {
    chartContainer: document.getElementById('chartContainer'),
    historyContainer: document.getElementById('historyContainer'),
    emptyState: document.getElementById('emptyState'),
    statsContainer: document.getElementById('playerStatsContainer'),
    playerChips: document.getElementById('playerChipsContainer'),
    modalChips: document.getElementById('modalChipsContainer'),
    clearBtn: document.getElementById('clearSelectionBtn'),
    directorySearch: document.getElementById('directorySearch'),
    timeFilter: document.getElementById('timeFilter'),
    modalTimeFilter: document.getElementById('modalTimeFilter'),
    chartModal: document.getElementById('chartModal'),
    matchHistoryBody: document.getElementById('matchHistoryBody'),
    ctxChart: document.getElementById('eloChart').getContext('2d'),
    ctxModal: document.getElementById('modalEloChart').getContext('2d')
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
        if (newPlayers.length >= 5) { alert("Maximum 5 players for comparison."); return; }
        newPlayers.push(clean);
    }
    state.selectedPlayers = newPlayers;
}

function clearSelection() {
    state.selectedPlayers = [];
}

function filterDirectory() {
    const query = removeAccents(DOM.directorySearch.value.toLowerCase());
    document.querySelectorAll('.directory-row').forEach(row => {
        const playerName = removeAccents(row.querySelector('.clickable-player').textContent.toLowerCase());
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
        modalChartInstance = createEloChart(DOM.ctxModal, modalChartInstance, chartData, false);
    }
}

function openChartModal() {
    if (!eloChartInstance) return;
    if (DOM.modalTimeFilter) DOM.modalTimeFilter.value = state.timeFilter;
    if (DOM.chartModal) DOM.chartModal.style.display = 'flex';
    modalChartInstance = createEloChart(DOM.ctxModal, modalChartInstance, JSON.parse(JSON.stringify(eloChartInstance.data)), false);
}

function closeChartModal() {
    if (DOM.chartModal) DOM.chartModal.style.display = 'none';
    if (modalChartInstance) { modalChartInstance.destroy(); modalChartInstance = null; }
}

// ==========================================
// CENTRAL EVENT DELEGATION
// ==========================================
document.addEventListener('click', (e) => {
    const playerLink = e.target.closest('[data-action="select-player"]');
    if (playerLink && playerLink.dataset.player) {
        selectPlayer(playerLink.dataset.player);
        return;
    }
    if (e.target.closest('#clearSelectionBtn')) clearSelection();
    if (e.target.closest('#maximizeChartBtn')) openChartModal();
    if (e.target.closest('#closeModalBtn')) closeChartModal();
    if (e.target.closest('#sortNameBtn')) sortDirectory('name');
    if (e.target.closest('#sortEloBtn')) sortDirectory('elo');
});

document.addEventListener('change', (e) => {
    if (e.target.id === 'timeFilter' || e.target.id === 'modalTimeFilter') {
        state.timeFilter = e.target.value; 
        DOM.timeFilter.value = e.target.value;
        DOM.modalTimeFilter.value = e.target.value;
    }
});

document.addEventListener('input', (e) => {
    if (e.target.id === 'directorySearch') filterDirectory();
});