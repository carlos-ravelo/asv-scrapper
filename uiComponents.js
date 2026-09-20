import { escapeHtml } from './utils.js';

export const chartColors = ['#0056b3', '#dc3545', '#28a745', '#fd7e14', '#6f42c1'];

export function playerLink(name) {
    if (!name) return '';
    const safe = escapeHtml(name);
    return `<span class="player-link" data-player="${safe}">${safe}</span>`;
}

export function renderPlayerChips(containerId, selectedPlayers, eloData) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    selectedPlayers.forEach((player, idx) => {
        const color = chartColors[idx % chartColors.length]; 
        const playerHistory = eloData
            .filter(row => row.Naam === player && row.Publish_Date && row.Publish_Date !== 'Unknown')
            .sort((a, b) => a.Publish_Date.localeCompare(b.Publish_Date));
        const lastElo = playerHistory.length > 0 ? playerHistory[playerHistory.length - 1].ELO : 'N/A';
        
        const chip = document.createElement('div');
        chip.style.cssText = `
            background-color: ${color}1A; border: 1px solid ${color}; color: #333;
            padding: 4px 12px; border-radius: 16px; display: flex; align-items: center;
            gap: 8px; font-size: 14px; font-weight: 500;
        `;
        chip.innerHTML = `
            ${player} <span style="font-size: 12px; opacity: 0.8; font-weight: normal;">(${lastElo})</span>
            <span onclick="window.selectPlayer('${player.replace(/'/g, "\\'")}')" 
                  style="cursor: pointer; color: ${color}; font-weight: bold; font-size: 18px; line-height: 1;">&times;</span>
        `;
        container.appendChild(chip);
    });
}

export function highlightDirectoryRows(selectedPlayers) {
    document.querySelectorAll('.directory-row').forEach(row => {
        const rowName = row.cells[1].textContent.trim();
        row.style.backgroundColor = selectedPlayers.includes(rowName) ? '#e9ecef' : '';
    });
}

export function renderStats(statsContainer, matchesToDisplay, eloData, selectedPlayers) {
    if (!statsContainer) return;
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
            } else if (lost) {
                losses++;
            } else if (match.Uitslag === '½-½') draws++;
        });

        const totalGames = wins + draws + losses;
        const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
        
        let mostFreqText = "N/A";
        const sortedOpponents = Object.entries(oppCount).sort((a, b) => b[1] - a[1]);
        if (sortedOpponents.length > 0) {
            const maxGames = sortedOpponents[0][1];
            mostFreqText = sortedOpponents.filter(opp => opp[1] === maxGames).map(opp => 
                `<span onclick="window.selectPlayer('${opp[0].replace(/'/g, "\\'")}')" style="cursor: pointer; color: #0056b3; font-weight: 500; text-decoration: underline;">${opp[0]}</span>`
            ).join(', ') + ` (${maxGames}x)`;
        }

        let bestWinText = bestWinOpponent ? `<span onclick="window.selectPlayer('${bestWinOpponent.replace(/'/g, "\\'")}')" style="cursor: pointer; color: #0056b3; font-weight: 500; text-decoration: underline;">${bestWinOpponent}</span> (${highestEloBeaten})` : "N/A";

        statsContainer.style.display = 'flex';
        statsContainer.innerHTML = `
            <div style="flex: 1; min-width: 140px;"><strong>🏆 Win Rate:</strong> ${winRate}% (${wins}W - ${draws}D - ${losses}L)</div>
            <div style="flex: 1; min-width: 140px;"><strong>🔥 Best Win:</strong> ${bestWinText}</div>
            <div style="flex: 1; min-width: 140px;"><strong>⚔️ Rival:</strong> ${mostFreqText}</div>
            <div style="flex: 1; min-width: 100px;"><strong>♟️ Total Games:</strong> ${totalGames}</div>
        `;
    } else if (selectedPlayers.length === 2) {
        const [p1, p2] = selectedPlayers;
        let p1Wins = 0, p2Wins = 0, draws = 0;
        
        matchesToDisplay.forEach(match => {
            const p1IsWhite = match.Witspeler === p1;
            if (match.Uitslag === '1-0') p1IsWhite ? p1Wins++ : p2Wins++;
            else if (match.Uitslag === '0-1') p1IsWhite ? p2Wins++ : p1Wins++;
            else if (match.Uitslag === '½-½') draws++;
        });

        statsContainer.style.display = 'flex';
        statsContainer.innerHTML = `
            <div style="flex: 1; text-align: center; font-size: 16px;">
                <strong>⚔️ Head-to-Head:</strong> 
                <span style="font-weight: bold;">${p1}</span> ${p1Wins} - ${p2Wins} <span style="font-weight: bold;">${p2}</span> 
                <span style="color: #6c757d; font-size: 13px;">(${draws} Draws)</span>
            </div>
        `;
    }
}

export function renderHistoryTable(tbody, matchesToDisplay, selectedPlayers) {
    if (!tbody) return;
    tbody.innerHTML = "";
    
    matchesToDisplay.sort((a, b) => {
        const da = a.Publish_Date && a.Publish_Date !== 'Unknown' ? a.Publish_Date : '';
        const db = b.Publish_Date && b.Publish_Date !== 'Unknown' ? b.Publish_Date : '';
        return db.localeCompare(da);
    }).forEach(match => {
        const tr = document.createElement('tr');
        const isWhite = selectedPlayers.includes(match.Witspeler);
        const isBlack = selectedPlayers.includes(match.Zwartspeler);

        let whiteColor = "inherit", blackColor = "inherit", rowColor = "transparent";
        
        if (selectedPlayers.length === 2) {
            if (match.Uitslag === '1-0') { whiteColor = "#155724"; blackColor = "#721c24"; } 
            else if (match.Uitslag === '0-1') { whiteColor = "#721c24"; blackColor = "#155724"; }
        }

        if (selectedPlayers.length === 1) {
            const isPWhite = match.Witspeler === selectedPlayers[0];
            const won = (isPWhite && match.Uitslag === '1-0') || (!isPWhite && match.Uitslag === '0-1');
            const lost = (isPWhite && match.Uitslag === '0-1') || (!isPWhite && match.Uitslag === '1-0');
            if (won) rowColor = "#e6f4ea"; 
            else if (lost) rowColor = "#fce8e6"; 
            else if (match.Uitslag === '½-½') rowColor = "#f8f9fa"; 
        }

        tr.style.backgroundColor = rowColor;
        tr.innerHTML = `
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${match.Publish_Date || ''}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: ${isWhite ? 'bold' : 'normal'}; color: ${whiteColor};">${match.Witspeler || ''}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: ${isBlack ? 'bold' : 'normal'}; color: ${blackColor};">${match.Zwartspeler || ''}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${match.Uitslag || ''}</td>
        `;
        tbody.appendChild(tr);
    });
}
