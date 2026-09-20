import { createEloChart } from './chartManager.js';
import { removeAccents } from './utils.js';
import { chartColors, playerLink, renderPlayerChips, highlightDirectoryRows, renderStats, renderHistoryTable } from './uiComponents.js';

let resultsData = [];
let eloData = [];
let eloChartInstance = null;
let modalChartInstance = null;
let selectedPlayers = [];
let directorySort = { key: 'elo', asc: false }; // Configuración de ordenamiento

Promise.all([
    fetch('asv_results.json').then(res => res.json()),
    fetch('asv_elo.json').then(res => res.json())
]).then(([results, elo]) => {
    resultsData = results;
    eloData = elo;
    renderLanding();
}).catch(error => console.error("Error loading JSON data:", error));

function sortDirectory(key) {
    if (directorySort.key === key) {
        directorySort.asc = !directorySort.asc;
    } else {
        directorySort.key = key;
        directorySort.asc = (key === 'name') ? true : false;
    }
    renderLanding();
}

function renderLanding() {
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

    const sortedPlayers = Array.from(latestElo.entries()).sort((a, b) => {
        if (directorySort.key === 'elo') {
            return directorySort.asc ? a[1].elo - b[1].elo : b[1].elo - a[1].elo;
        } else {
            return directorySort.asc ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0]);
        }
    });

    const topEloBody = document.getElementById('topEloBody');
    if (!topEloBody) return; 

    topEloBody.innerHTML = '';
    sortedPlayers.forEach(([name, data], index) => {
        const tr = document.createElement('tr');
        tr.className = 'directory-row';
        tr.innerHTML = `<td>${index + 1}</td><td>${playerLink(name)}</td><td>${data.elo}</td>`;
        topEloBody.appendChild(tr);
    });
    
    highlightDirectoryRows(selectedPlayers);
}

function filterDirectory() {
    const query = removeAccents(document.getElementById('directorySearch').value.toLowerCase());
    document.querySelectorAll('.directory-row').forEach(row => {
        const playerName = removeAccents(row.cells[1].textContent.toLowerCase());
        row.style.display = playerName.includes(query) ? '' : 'none';
    });
}

document.addEventListener('click', (e) => {
    const link = e.target.closest('.player-link');
    if (link && link.dataset.player) selectPlayer(link.dataset.player);
});

function selectPlayer(name) {
    const clean = String(name).trim();
    const index = selectedPlayers.indexOf(clean);
    
    if (index > -1) selectedPlayers.splice(index, 1);
    else {
        if (selectedPlayers.length >= 5) { alert("Maximum 5 players for comparison."); return; }
        selectedPlayers.push(clean);
    }

    highlightDirectoryRows(selectedPlayers);
    const clearBtn = document.getElementById('clearSelectionBtn');
    if (clearBtn) clearBtn.style.display = selectedPlayers.length ? 'inline-block' : 'none';
    updateDashboard();
}

function clearSelection() {
    selectedPlayers = [];
    highlightDirectoryRows(selectedPlayers);
    const clearBtn = document.getElementById('clearSelectionBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    updateDashboard();
}

function updateDashboard() {
    const chartContainer = document.getElementById('chartContainer');
    const historyContainer = document.getElementById('historyContainer');
    const emptyState = document.getElementById('emptyState');
    const title = document.getElementById('playerNameDisplay');
    const statsContainer = document.getElementById('playerStatsContainer');
    const tbody = document.getElementById('matchHistoryBody');

    if (statsContainer) statsContainer.style.display = 'none';

    if (selectedPlayers.length === 0) {
        if (chartContainer) chartContainer.style.display = 'none';
        if (historyContainer) historyContainer.style.display = 'none';
        if (emptyState) emptyState.style.display = 'flex';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (chartContainer) chartContainer.style.display = 'block';
    if (title) title.style.display = 'none';

    // ¡La solución al bug del modal! Re-renderizamos dinámicamente ambos contenedores
    renderPlayerChips('playerChipsContainer', selectedPlayers, eloData);
    renderPlayerChips('modalChipsContainer', selectedPlayers, eloData);

    const timeFilter = document.getElementById('timeFilter')?.value || 'all';
    let cutoffDate = null;
    if (timeFilter !== 'all') {
        const d = new Date();
        d.setMonth(d.getMonth() - parseInt(timeFilter));
        cutoffDate = d.toISOString().split('T')[0];
    }

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
        
        return {
            label: player,
            dataRaw: history,
            borderColor: chartColors[idx % chartColors.length],
            backgroundColor: chartColors[idx % chartColors.length] + '33',
            borderWidth: 2, fill: false, tension: 0.1, spanGaps: true,
            pointRadius: 2, hitRadius: 25, pointHoverRadius: 6,
            pointBackgroundColor: chartColors[idx % chartColors.length]
        };
    });

    const sortedDates = Array.from(allDates).sort();
    playerDatasets.forEach(dataset => {
        dataset.data = sortedDates.map(date => {
            const match = dataset.dataRaw.find(d => d.Publish_Date === date);
            return match ? match.ELO : null;
        });
    });

    const ctx = document.getElementById('eloChart').getContext('2d');
    eloChartInstance = createEloChart(ctx, eloChartInstance, { labels: sortedDates, datasets: playerDatasets }, true);

    // Sync modal chart instantly if modal is currently open
    const modal = document.getElementById('chartModal');
    if (modal && modal.style.display === 'flex') {
        const mCtx = document.getElementById('modalEloChart').getContext('2d');
        modalChartInstance = createEloChart(mCtx, modalChartInstance, { labels: sortedDates, datasets: playerDatasets }, false);
    }

    if (selectedPlayers.length > 2) {
        if (historyContainer) historyContainer.style.display = 'none'; 
        return;
    }

    if (historyContainer) historyContainer.style.display = 'block';
    
    let matchesToDisplay = [];
    if (selectedPlayers.length === 1) {
        matchesToDisplay = resultsData.filter(row => row.Witspeler === selectedPlayers[0] || row.Zwartspeler === selectedPlayers[0]);
    } else if (selectedPlayers.length === 2) {
        const [p1, p2] = selectedPlayers;
        matchesToDisplay = resultsData.filter(row => (row.Witspeler === p1 && row.Zwartspeler === p2) || (row.Witspeler === p2 && row.Zwartspeler === p1));
    }

    if (cutoffDate) matchesToDisplay = matchesToDisplay.filter(row => row.Publish_Date && row.Publish_Date >= cutoffDate);

    renderStats(statsContainer, matchesToDisplay, eloData, selectedPlayers);
    renderHistoryTable(tbody, matchesToDisplay, selectedPlayers);
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

// Exports al global
window.filterDirectory = filterDirectory;
window.selectPlayer = selectPlayer;
window.clearSelection = clearSelection;
window.updateDashboard = updateDashboard;
window.syncModalFilter = syncModalFilter;
window.openChartModal = openChartModal;
window.closeChartModal = closeChartModal;
window.sortDirectory = sortDirectory;