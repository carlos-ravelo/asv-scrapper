let resultsData = [];
let eloData = [];
let eloChartInstance = null;
let selectedPlayers = [];
const chartColors = ['#0056b3', '#dc3545', '#28a745', '#fd7e14', '#6f42c1'];

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function playerLink(name) {
    if (!name) return '';
    const safe = escapeHtml(name);
    return `<span class="player-link" data-player="${safe}">${safe}</span>`;
}

Promise.all([
    fetch('asv_results.json').then(res => res.json()),
    fetch('asv_elo.json').then(res => res.json())
]).then(([results, elo]) => {
    resultsData = results;
    eloData = elo;
    populateDropdown();
    renderLanding();
}).catch(error => console.error("Error loading JSON data:", error));

let allPlayers = [];

function populateDropdown() {
    const playerSet = new Set();

    eloData.forEach(row => {
        if (row.Naam) playerSet.add(String(row.Naam).trim());
    });

    resultsData.forEach(row => {
        if (row.Witspeler) playerSet.add(String(row.Witspeler).trim());
        if (row.Zwartspeler) playerSet.add(String(row.Zwartspeler).trim());
    });

    allPlayers = Array.from(playerSet).sort();
}

function renderLanding() {
    // Directory: latest known ELO per player
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

    // Ordenar de mayor a menor ELO
    const sortedPlayers = Array.from(latestElo.entries())
        .sort((a, b) => b[1].elo - a[1].elo);

    const topEloBody = document.getElementById('topEloBody');
    if (!topEloBody) return; // Prevención de errores si el DOM no ha cargado

    topEloBody.innerHTML = '';
    
    sortedPlayers.forEach(([name, data], index) => {
        const tr = document.createElement('tr');
        tr.className = 'directory-row';
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${playerLink(name)}</td>
            <td>${data.elo}</td>
        `;
        topEloBody.appendChild(tr);
    });
}

function filterDirectory() {
    const query = document.getElementById('directorySearch').value.toLowerCase();
    const rows = document.querySelectorAll('.directory-row');
    
    rows.forEach(row => {
        const playerName = row.cells[1].textContent.toLowerCase();
        row.style.display = playerName.includes(query) ? '' : 'none';
    });
}
document.addEventListener('click', (e) => {
    const link = e.target.closest('.player-link');
    if (link && link.dataset.player) {
        selectPlayer(link.dataset.player);
    }
});

function selectPlayer(name) {
    const clean = String(name).trim();
    const index = selectedPlayers.indexOf(clean);
    if (index > -1) {
        selectedPlayers.splice(index, 1);
    } else {
        if (selectedPlayers.length >= 10) {
            alert("Maximum 5 players for comparison.");
            return;
        }
        selectedPlayers.push(clean);
    }

    document.querySelectorAll('.directory-row').forEach(row => {
        const rowName = row.cells[1].textContent.trim();
        row.style.backgroundColor = selectedPlayers.includes(rowName) ? '#e9ecef' : '';
    });

    const clearBtn = document.getElementById('clearSelectionBtn');
    if (clearBtn) clearBtn.style.display = selectedPlayers.length ? 'inline-block' : 'none';

    updateDashboard();
}

function clearSelection() {
    selectedPlayers = [];
    document.querySelectorAll('.directory-row').forEach(row => {
        row.style.backgroundColor = '';
    });
    const clearBtn = document.getElementById('clearSelectionBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    updateDashboard();
}

function updateDashboard() {
    const chartContainer = document.getElementById('chartContainer');
    const historyContainer = document.getElementById('historyContainer');
    const emptyState = document.getElementById('emptyState');
    const title = document.getElementById('playerNameDisplay');

    if (selectedPlayers.length === 0) {
        if (chartContainer) chartContainer.style.display = 'none';
        if (historyContainer) historyContainer.style.display = 'none';
        if (emptyState) emptyState.style.display = 'flex';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (chartContainer) chartContainer.style.display = 'block';
    if (title) title.style.display = 'none';

    // --- 1. RENDER CHIPS ---
    const chipsContainer = document.getElementById('playerChipsContainer');
    if (chipsContainer) {
        chipsContainer.innerHTML = '';
        selectedPlayers.forEach((player, idx) => {
            const color = chartColors[idx % chartColors.length]; 
            
            const playerHistory = eloData
                .filter(row => row.Naam === player && row.Publish_Date && row.Publish_Date !== 'Unknown')
                .sort((a, b) => a.Publish_Date.localeCompare(b.Publish_Date));
            const lastElo = playerHistory.length > 0 ? playerHistory[playerHistory.length - 1].ELO : 'N/A';
            
            const chip = document.createElement('div');
            chip.style.cssText = `
                background-color: ${color}1A; 
                border: 1px solid ${color};
                color: #333;
                padding: 4px 12px;
                border-radius: 16px;
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
                font-weight: 500;
            `;
            
            chip.innerHTML = `
                ${player} <span style="font-size: 12px; opacity: 0.8; font-weight: normal;">(${lastElo})</span>
                <span onclick="selectPlayer('${player.replace(/'/g, "\\'")}')" 
                      style="cursor: pointer; color: ${color}; font-weight: bold; font-size: 18px; line-height: 1;">&times;</span>
            `;
            chipsContainer.appendChild(chip);
        });
    }

    // --- 2. CALCULATE DATE CUTOFF ---
    const timeFilter = document.getElementById('timeFilter')?.value || 'all';
    let cutoffDate = null;
    if (timeFilter !== 'all') {
        const d = new Date();
        d.setMonth(d.getMonth() - parseInt(timeFilter));
        cutoffDate = d.toISOString().split('T')[0];
    }

    // --- 3. MULTILINE CHART WITH FILTER ---
    let allDates = new Set();
    const playerDatasets = selectedPlayers.map((player, idx) => {
        let rawHistory = eloData
            .filter(row => row.Naam === player && row.Publish_Date && row.Publish_Date !== 'Unknown')
            .sort((a, b) => a.Publish_Date.localeCompare(b.Publish_Date));
        
        if (cutoffDate) {
            rawHistory = rawHistory.filter(row => row.Publish_Date >= cutoffDate);
        }

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
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            spanGaps: true,
            pointRadius: 2,
            pointHoverRadius: 6,
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

    renderChart(sortedDates, playerDatasets);

    // --- 4. MATCH HISTORY & PLAYER STATS ---
    const tbody = document.getElementById('matchHistoryBody');
    if(tbody) tbody.innerHTML = "";

    const statsContainer = document.getElementById('playerStatsContainer');
    if (statsContainer) statsContainer.style.display = 'none';

    if (selectedPlayers.length > 2) {
        if (historyContainer) historyContainer.style.display = 'none'; 
        return;
    }

    if (historyContainer) historyContainer.style.display = 'block';
    let matchesToDisplay = [];

    if (selectedPlayers.length === 1) {
        const p = selectedPlayers[0];
        matchesToDisplay = resultsData.filter(row => row.Witspeler === p || row.Zwartspeler === p);
        
        // Calculate Advanced Stats for single player
        if (statsContainer) {
            let wins = 0, draws = 0, losses = 0;
            const oppCount = {};
            let bestWinOpponent = null;
            let highestEloBeaten = 0;

            // Pre-calculate max ELO for each player to find "Best Win"
            const maxElos = {};
            eloData.forEach(row => { 
                if (!maxElos[row.Naam] || row.ELO > maxElos[row.Naam]) {
                    maxElos[row.Naam] = row.ELO;
                }
            });

            matchesToDisplay.forEach(match => {
                const isWhite = match.Witspeler === p;
                const opp = isWhite ? match.Zwartspeler : match.Witspeler;
                
                // Track most frequent
                if (opp) oppCount[opp] = (oppCount[opp] || 0) + 1;

                const won = (isWhite && match.Uitslag === '1-0') || (!isWhite && match.Uitslag === '0-1');
                const lost = (isWhite && match.Uitslag === '0-1') || (!isWhite && match.Uitslag === '1-0');
                
                if (won) {
                    wins++;
                    // Check if this is the highest ELO beaten
                    if (maxElos[opp] && maxElos[opp] > highestEloBeaten) {
                        highestEloBeaten = maxElos[opp];
                        bestWinOpponent = opp;
                    }
                } else if (lost) {
                    losses++;
                } else if (match.Uitslag === '½-½') {
                    draws++;
                }
            });

            const totalGames = wins + draws + losses;
            const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
            
            let mostFreqText = "N/A";
            const sortedOpponents = Object.entries(oppCount).sort((a, b) => b[1] - a[1]);
            if (sortedOpponents.length > 0) {
                mostFreqText = `${sortedOpponents[0][0]} (${sortedOpponents[0][1]}x)`;
            }

            let bestWinText = bestWinOpponent ? `${bestWinOpponent} (${highestEloBeaten})` : "N/A";

            statsContainer.style.display = 'flex';
            statsContainer.innerHTML = `
                <div style="flex: 1; min-width: 140px;"><strong>🏆 Win Rate:</strong> ${winRate}% (${wins}W - ${draws}D - ${losses}L)</div>
                <div style="flex: 1; min-width: 140px;"><strong>🔥 Best Win:</strong> ${bestWinText}</div>
                <div style="flex: 1; min-width: 140px;"><strong>⚔️ Rival:</strong> ${mostFreqText}</div>
                <div style="flex: 1; min-width: 100px;"><strong>♟️ Total Games:</strong> ${totalGames}</div>
            `;
        }
    } else if (selectedPlayers.length === 2) {
        const [p1, p2] = selectedPlayers;
        matchesToDisplay = resultsData.filter(row => 
            (row.Witspeler === p1 && row.Zwartspeler === p2) || 
            (row.Witspeler === p2 && row.Zwartspeler === p1)
        );
    }

    if (cutoffDate) {
        matchesToDisplay = matchesToDisplay.filter(row => row.Publish_Date && row.Publish_Date >= cutoffDate);
    }

    matchesToDisplay
        .sort((a, b) => {
            const da = a.Publish_Date && a.Publish_Date !== 'Unknown' ? a.Publish_Date : '';
            const db = b.Publish_Date && b.Publish_Date !== 'Unknown' ? b.Publish_Date : '';
            return db.localeCompare(da);
        })
        .forEach(match => {
            const tr = document.createElement('tr');
            const isWhite = selectedPlayers.includes(match.Witspeler);
            const isBlack = selectedPlayers.includes(match.Zwartspeler);

            // Table row background color logic
            let rowColor = "transparent";
            if (selectedPlayers.length === 1) {
                const p = selectedPlayers[0];
                const isPWhite = match.Witspeler === p;
                const won = (isPWhite && match.Uitslag === '1-0') || (!isPWhite && match.Uitslag === '0-1');
                const lost = (isPWhite && match.Uitslag === '0-1') || (!isPWhite && match.Uitslag === '1-0');
                const draw = match.Uitslag === '½-½';
                
                if (won) rowColor = "#e6f4ea"; // Light green
                else if (lost) rowColor = "#fce8e6"; // Light red
                else if (draw) rowColor = "#f8f9fa"; // Light gray
            }

            tr.style.backgroundColor = rowColor;
            tr.innerHTML = `
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${match.Publish_Date || ''}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: ${isWhite ? 'bold' : 'normal'}">${match.Witspeler || ''}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: ${isBlack ? 'bold' : 'normal'}">${match.Zwartspeler || ''}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${match.Uitslag || ''}</td>
            `;
            tbody.appendChild(tr);
        });
}

function renderChart(labels, datasets) {
    const ctx = document.getElementById('eloChart').getContext('2d');
    
    if (eloChartInstance) {
        eloChartInstance.destroy();
    }

    eloChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: false
                }
            }
        }
    });
}

let modalChartInstance = null;

function syncModalFilter(value) {
    const mainFilter = document.getElementById('timeFilter');
    if (mainFilter) {
        mainFilter.value = value; // Update the main dashboard filter
        updateDashboard();        // Recalculate main chart and tables
        openChartModal();         // Refresh the modal chart with new data
    }
}

function openChartModal() {
    if (!eloChartInstance) return;

    const modal = document.getElementById('chartModal');
    const modalChips = document.getElementById('modalChipsContainer');
    const sourceChips = document.getElementById('playerChipsContainer');
    
    // Sync the dropdown value from the main dashboard to the modal
    const mainFilter = document.getElementById('timeFilter');
    const modalFilter = document.getElementById('modalTimeFilter');
    if (mainFilter && modalFilter) {
        modalFilter.value = mainFilter.value;
    }

    if (modalChips && sourceChips) {
        modalChips.innerHTML = sourceChips.innerHTML;
    }

    modal.style.display = 'flex';

    const ctx = document.getElementById('modalEloChart').getContext('2d');
    if (modalChartInstance) {
        modalChartInstance.destroy();
    }

    modalChartInstance = new Chart(ctx, {
        type: 'line',
        data: JSON.parse(JSON.stringify(eloChartInstance.data)),
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: false }
            }
        }
    });
}

function closeChartModal() {
    const modal = document.getElementById('chartModal');
    if (modal) modal.style.display = 'none';
    if (modalChartInstance) {
        modalChartInstance.destroy();
        modalChartInstance = null;
    }
}
