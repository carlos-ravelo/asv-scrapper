import { createEloChart } from './chartManager.js';
import { removeAccents } from './utils.js';
import { chartColors, renderPlayerChips, highlightDirectoryRows, renderStats, renderHistoryTable, renderDirectoryTable } from './uiComponents.js';
import { getSortedDirectory, getChartData, getFilteredMatches, getPlayerStats } from './dataProcessor.js';

// ==========================================
// 1. REACTIVE STATE (ES6 Proxy)
// ==========================================
const state = new Proxy({
    resultsData: [],
    eloData: [],
    selectedPlayers: [],
    directorySort: { key: 'elo', asc: false },
    timeFilter: 'all'
}, {
    // every time we change a variable, the Proxy detects what was modified and what needs to be re-rendered
    set(target, property, value) {
        target[property] = value;
        
        if (property === 'directorySort') {
            renderLanding();
        }
        
        if (property === 'selectedPlayers') {
            highlightDirectoryRows(value);
            const clearBtn = document.getElementById('clearSelectionBtn');
            if (clearBtn) clearBtn.style.display = value.length ? 'inline-block' : 'none';
            updateDashboard(); // Only triggered if selectedPlayers changes
        }
        
        if (property === 'timeFilter') {
            updateDashboard(); // Only triggered if the timeFilter changes
        }
        
        return true;
    }
});

let eloChartInstance = null, modalChartInstance = null;

// ==========================================
// 2. INITIALIZATION
// ==========================================
Promise.all([
    fetch('asv_results.json').then(res => res.json()),
    fetch('asv_elo.json').then(res => res.json())
]).then(([results, elo]) => {
    // The proxy does not intercept these if we don't set them in the set, but we initialize them anyway
    state.resultsData = results;
    state.eloData = elo;
    renderLanding();
}).catch(error => console.error("Error loading JSON data:", error));

// ==========================================
// 3. UI ORCHESTRATION
// ==========================================
function renderLanding() {
    const sortedPlayers = getSortedDirectory(state.eloData, state.directorySort);
    renderDirectoryTable(sortedPlayers);
    highlightDirectoryRows(state.selectedPlayers);
}

function updateDashboard() {
    const chartContainer = document.getElementById('chartContainer');
    const historyContainer = document.getElementById('historyContainer');
    const emptyState = document.getElementById('emptyState');
    const statsContainer = document.getElementById('playerStatsContainer');

    // Empty state
    if (state.selectedPlayers.length === 0) {
        if (chartContainer) chartContainer.style.display = 'none';
        if (historyContainer) historyContainer.style.display = 'none';
        if (emptyState) emptyState.style.display = 'flex';
        renderStats(statsContainer, null);
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (chartContainer) chartContainer.style.display = 'block';

    // 1. Chips
    renderPlayerChips('playerChipsContainer', state.selectedPlayers, state.eloData);
    renderPlayerChips('modalChipsContainer', state.selectedPlayers, state.eloData);

    // 2. Gráfica
    const cutoffDate = getCutoffDate();
    const chartData = getChartData(state.selectedPlayers, state.eloData, cutoffDate, chartColors);
    
    const ctx = document.getElementById('eloChart').getContext('2d');
    eloChartInstance = createEloChart(ctx, eloChartInstance, chartData, true);
    syncModalIfOpen(chartData);

    // 3. Match History & Stats 
    if (state.selectedPlayers.length <= 2) {
        if (historyContainer) historyContainer.style.display = 'block';
        const matchesToDisplay = getFilteredMatches(state.selectedPlayers, state.resultsData, cutoffDate);       
        const statsData = getPlayerStats(state.selectedPlayers, matchesToDisplay, state.eloData);
        renderStats(statsContainer, statsData);
        
        renderHistoryTable(document.getElementById('matchHistoryBody'), matchesToDisplay, state.selectedPlayers);
    } else {
        if (historyContainer) historyContainer.style.display = 'none';
        renderStats(statsContainer, null);
    }
}

// ==========================================
// 4. PURE ACTIONS (Ahora solo modifican el Estado, no el DOM)
// ==========================================
function sortDirectory(key) {
    // When mutating the object, we create a new one so that the Proxy detects it
    const isSameKey = state.directorySort.key === key;
    state.directorySort = {
        key: key,
        asc: isSameKey ? !state.directorySort.asc : (key === 'name')
    };
}

function selectPlayer(name) {
    const clean = String(name).trim();
    let newPlayers = [...state.selectedPlayers]; // We work with a copy
    const index = newPlayers.indexOf(clean);
    
    if (index > -1) {
        newPlayers.splice(index, 1);
    } else {
        if (newPlayers.length >= 5) { alert("Maximum 5 players for comparison."); return; }
        newPlayers.push(clean);
    }    
    // When reassigning, the Proxy "set" magically triggers and updates the UI
    state.selectedPlayers = newPlayers;
}

function clearSelection() {
    state.selectedPlayers = []; // The proxy detects this and clears everything
}

function filterDirectory() {
    const query = removeAccents(document.getElementById('directorySearch').value.toLowerCase());
    document.querySelectorAll('.directory-row').forEach(row => {
        const playerName = removeAccents(row.querySelector('.clickable-player').textContent.toLowerCase());
        row.style.display = playerName.includes(query) ? '' : 'none';
    });
}

// ==========================================
// 5. HELPERS & MODALS
// ==========================================
function getCutoffDate() {
    if (state.timeFilter === 'all') return null;
    const d = new Date();
    d.setMonth(d.getMonth() - parseInt(state.timeFilter));
    return d.toISOString().split('T')[0];
}

function syncModalIfOpen(chartData) {
    const modal = document.getElementById('chartModal');
    if (modal && modal.style.display === 'flex') {
        const mCtx = document.getElementById('modalEloChart').getContext('2d');
        modalChartInstance = createEloChart(mCtx, modalChartInstance, chartData, false);
    }
}

function openChartModal() {
    if (!eloChartInstance) return;
    const modal = document.getElementById('chartModal');
    const modalFilter = document.getElementById('modalTimeFilter');
    if (modalFilter) modalFilter.value = state.timeFilter;
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
        // Muta el estado, el Proxy se encarga de re-renderizar
        state.timeFilter = e.target.value; 
        
        // Sincroniza visualmente ambos selects
        document.getElementById('timeFilter').value = e.target.value;
        document.getElementById('modalTimeFilter').value = e.target.value;
    }
});

document.addEventListener('input', (e) => {
    if (e.target.id === 'directorySearch') filterDirectory();
});