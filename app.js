import { createEloChart } from './chartManager.js';
import { removeAccents } from './utils.js';
import { chartColors, renderPlayerChips, highlightDirectoryRows, renderStats, renderHistoryTable, renderDirectoryTable } from './uiComponents.js';
import { getSortedDirectory, getChartData, getFilteredMatches } from './dataProcessor.js';

// ==========================================
// 1. STATE
// ==========================================
let resultsData = [], eloData = [];
let eloChartInstance = null, modalChartInstance = null;
let selectedPlayers = [];
let directorySort = { key: 'elo', asc: false };

// ==========================================
// 2. INITIALIZATION
// ==========================================
Promise.all([
    fetch('asv_results.json').then(res => res.json()),
    fetch('asv_elo.json').then(res => res.json())
]).then(([results, elo]) => {
    resultsData = results;
    eloData = elo;
    renderLanding();
}).catch(error => console.error("Error loading JSON data:", error));

// ==========================================
// 3. UI ORCHESTRATION
// ==========================================
function renderLanding() {
    const sortedPlayers = getSortedDirectory(eloData, directorySort);
    renderDirectoryTable(sortedPlayers);
    highlightDirectoryRows(selectedPlayers);
}

function updateDashboard() {
    const chartContainer = document.getElementById('chartContainer');
    const historyContainer = document.getElementById('historyContainer');
    const emptyState = document.getElementById('emptyState');
    const statsContainer = document.getElementById('playerStatsContainer');
    
    if (statsContainer) statsContainer.style.display = 'none';

    // Handle visibility if no players are selected
    if (selectedPlayers.length === 0) {
        if (chartContainer) chartContainer.style.display = 'none';
        if (historyContainer) historyContainer.style.display = 'none';
        if (emptyState) emptyState.style.display = 'flex';
        return;
    }

    // Active dashboard visibility
    if (emptyState) emptyState.style.display = 'none';
    if (chartContainer) chartContainer.style.display = 'block';

    // 1. Render player chips
    renderPlayerChips('playerChipsContainer', selectedPlayers, eloData);
    renderPlayerChips('modalChipsContainer', selectedPlayers, eloData);

    // 2. Calculate dates and prepare chart data
    const cutoffDate = getCutoffDate();
    const chartData = getChartData(selectedPlayers, eloData, cutoffDate, chartColors);
    
    const ctx = document.getElementById('eloChart').getContext('2d');
    eloChartInstance = createEloChart(ctx, eloChartInstance, chartData, true);
    syncModalIfOpen(chartData);

    // 3. Prepare stats and tables (1 or 2 players only)
    if (selectedPlayers.length <= 2) {
        if (historyContainer) historyContainer.style.display = 'block';
        const matchesToDisplay = getFilteredMatches(selectedPlayers, resultsData, cutoffDate);
        renderStats(statsContainer, matchesToDisplay, eloData, selectedPlayers);
        renderHistoryTable(document.getElementById('matchHistoryBody'), matchesToDisplay, selectedPlayers);
    } else {
        if (historyContainer) historyContainer.style.display = 'none';
    }
}

// ==========================================
// 4. USER ACTIONS
// ==========================================
function sortDirectory(key) {
    if (directorySort.key === key) {
        directorySort.asc = !directorySort.asc;
    } else {
        directorySort.key = key;
        directorySort.asc = (key === 'name') ? true : false;
    }
    renderLanding();
}

function selectPlayer(name) {
    const clean = String(name).trim();
    const index = selectedPlayers.indexOf(clean);
    
    if (index > -1) {
        selectedPlayers.splice(index, 1);
    } else {
        if (selectedPlayers.length >= 5) { alert("Maximum 5 players for comparison."); return; }
        selectedPlayers.push(clean);
    }

    highlightDirectoryRows(selectedPlayers);
    const clearBtn = document.getElementById('clearSelectionBtn');
    if (clearBtn) clearBtn.style.display = selectedPlayers.length ? 'inline-block' : 'none';
    updateDashboard();
}

function filterDirectory() {
    const query = removeAccents(document.getElementById('directorySearch').value.toLowerCase());
    document.querySelectorAll('.directory-row').forEach(row => {
        const playerName = removeAccents(row.cells[1].textContent.toLowerCase());
        row.style.display = playerName.includes(query) ? '' : 'none';
    });
}

function clearSelection() {
    selectedPlayers = [];
    highlightDirectoryRows(selectedPlayers);
    const clearBtn = document.getElementById('clearSelectionBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    updateDashboard();
}

// ==========================================
// 5. HELPERS & MODALS
// ==========================================
function getCutoffDate() {
    const timeFilter = document.getElementById('timeFilter')?.value || 'all';
    if (timeFilter === 'all') return null;
    const d = new Date();
    d.setMonth(d.getMonth() - parseInt(timeFilter));
    return d.toISOString().split('T')[0];
}

function syncModalIfOpen(chartData) {
    const modal = document.getElementById('chartModal');
    if (modal && modal.style.display === 'flex') {
        const mCtx = document.getElementById('modalEloChart').getContext('2d');
        modalChartInstance = createEloChart(mCtx, modalChartInstance, chartData, false);
    }
}

function syncModalFilter(value) {
    const mainFilter = document.getElementById('timeFilter');
    if (mainFilter) {
        mainFilter.value = value; 
        updateDashboard();        
    }
}

function openChartModal() {
    if (!eloChartInstance) return;
    const modal = document.getElementById('chartModal');
    const mainFilter = document.getElementById('timeFilter');
    const modalFilter = document.getElementById('modalTimeFilter');
    
    if (mainFilter && modalFilter) modalFilter.value = mainFilter.value;
    modal.style.display = 'flex';
    
    const ctx = document.getElementById('modalEloChart').getContext('2d');
    modalChartInstance = createEloChart(ctx, modalChartInstance, JSON.parse(JSON.stringify(eloChartInstance.data)), false);
}

function closeChartModal() {
    const modal = document.getElementById('chartModal');
    if (modal) modal.style.display = 'none';
    if (modalChartInstance) { modalChartInstance.destroy(); modalChartInstance = null; }
}

// ==========================================
// CENTRAL EVENT DELEGATION
// ==========================================

// 1. Click Events
document.addEventListener('click', (e) => {
    // Select player from directory links
    const playerLink = e.target.closest('.player-link');
    if (playerLink && playerLink.dataset.player) {
        selectPlayer(playerLink.dataset.player);
        return;
    }

    // Select player from chips, stats or history table
    const dynamicSelect = e.target.closest('[data-action="select-player"]');
    if (dynamicSelect && dynamicSelect.dataset.player) {
        selectPlayer(dynamicSelect.dataset.player);
        return;
    }

    // Static Buttons & Table Headers
    if (e.target.closest('#clearSelectionBtn')) clearSelection();
    if (e.target.closest('#maximizeChartBtn')) openChartModal();
    if (e.target.closest('#closeModalBtn')) closeChartModal();
    if (e.target.closest('#sortNameBtn')) sortDirectory('name');
    if (e.target.closest('#sortEloBtn')) sortDirectory('elo');
});

// 2. Change Events (Dropdowns)
document.addEventListener('change', (e) => {
    if (e.target.id === 'timeFilter') updateDashboard();
    if (e.target.id === 'modalTimeFilter') syncModalFilter(e.target.value);
});

// 3. Input Events (Search typing)
document.addEventListener('input', (e) => {
    if (e.target.id === 'directorySearch') filterDirectory();
});

