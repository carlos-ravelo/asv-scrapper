import { createEloChart } from './chartManager.js?v=6';
import { MAX_SELECTED_PLAYERS, SELECTORS } from './constants.js';
import { removeAccents } from './utils.js';
import { chartColors, renderPlayerChips, highlightDirectoryRows, renderStats, renderHistoryTable, renderDirectoryTable } from './uiComponents.js';
import { getSortedDirectory, getChartData, getFilteredMatches, getPlayerStats } from './dataProcessor.js';

// ==========================================
// 1. DOM CACHE
// ==========================================
const SAVED_VIEWS_STORAGE_KEY = 'asv_chess_saved_views';

const DOM = {
    chartContainer: document.getElementById(SELECTORS.CHART_CONTAINER),
    historyContainer: document.getElementById(SELECTORS.HISTORY_CONTAINER),
    emptyState: document.getElementById(SELECTORS.EMPTY_STATE),
    statsContainer: document.getElementById(SELECTORS.STATS_CONTAINER),
    playerChips: document.getElementById(SELECTORS.PLAYER_CHIPS),
    modalChips: document.getElementById(SELECTORS.MODAL_CHIPS),
    clearBtn: document.getElementById(SELECTORS.BTN_CLEAR.substring(1)),
    directorySearch: document.getElementById(SELECTORS.DIR_SEARCH),
    savedViewsList: document.getElementById(SELECTORS.SAVED_VIEWS_LIST),
    saveSavedViewButton: document.getElementById(SELECTORS.SAVED_VIEWS_SAVE),
    timeFilter: document.getElementById(SELECTORS.TIME_FILTER),
    modalTimeFilter: document.getElementById(SELECTORS.MODAL_TIME_FILTER),
    chartModal: document.getElementById(SELECTORS.CHART_MODAL),
    matchHistoryBody: document.getElementById(SELECTORS.MATCH_HISTORY_BODY),
    ctxChart: document.getElementById(SELECTORS.ELO_CHART).getContext('2d'),
    ctxModal: document.getElementById(SELECTORS.MODAL_ELO_CHART).getContext('2d'),
    modalStatsContainer: document.getElementById('modalStatsContainer'),
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
            renderSavedViews();
            highlightDirectoryRows(value);
            if (DOM.clearBtn) DOM.clearBtn.style.display = value.length ? 'inline-block' : 'none';
            updateDashboard();
        }
        
        if (property === 'timeFilter') updateDashboard();
        
        return true;
    }
});

let eloChartInstance = null, modalChartInstance = null;
let pageScrollPosition = 0;
let bodyStylesBeforeModal = null;

function lockBackgroundScroll() {
    if (bodyStylesBeforeModal) return;
    pageScrollPosition = window.scrollY;
    bodyStylesBeforeModal = {
        position: document.body.style.position,
        top: document.body.style.top,
        left: document.body.style.left,
        right: document.body.style.right,
        width: document.body.style.width,
        overflow: document.body.style.overflow
    };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${pageScrollPosition}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
}

function unlockBackgroundScroll() {
    if (!bodyStylesBeforeModal) return;

    Object.assign(document.body.style, bodyStylesBeforeModal);
    bodyStylesBeforeModal = null;
    window.scrollTo(0, pageScrollPosition);
}

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
    renderSavedViews();
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
        renderStats(DOM.modalStatsContainer, null); // Clean modal stats
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
    
    eloChartInstance = createEloChart(DOM.ctxChart, eloChartInstance, chartData, false);
    syncModalIfOpen(chartData);

    if (state.selectedPlayers.length <= 2) {
        if (DOM.historyContainer) DOM.historyContainer.style.display = 'block';
        const matchesToDisplay = getFilteredMatches(state.selectedPlayers, state.resultsData, cutoffDate);
        
        const statsData = getPlayerStats(state.selectedPlayers, matchesToDisplay, state.eloData);
        
        renderStats(DOM.statsContainer, statsData);
        renderStats(DOM.modalStatsContainer, statsData); // Update modal stats

        renderHistoryTable(DOM.matchHistoryBody, matchesToDisplay, state.selectedPlayers);
    } else {
        if (DOM.historyContainer) DOM.historyContainer.style.display = 'none';
        renderStats(DOM.statsContainer, null);
        renderStats(DOM.modalStatsContainer, null); // Clean modal stats
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
function readSavedViews() {
    try {
        const savedViews = JSON.parse(localStorage.getItem(SAVED_VIEWS_STORAGE_KEY) || '{}');
        if (!savedViews || Array.isArray(savedViews) || typeof savedViews !== 'object') return new Map();

        return new Map(Object.entries(savedViews).filter(([name, players]) =>
            name.trim().length > 0 &&
            Array.isArray(players) &&
            players.every(player => typeof player === 'string')
        ));
    } catch (error) {
        return new Map();
    }
}

function writeSavedViews(savedViews) {
    localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(Object.fromEntries(savedViews)));
}

function getAvailablePlayerNames() {
    if (Array.isArray(state.eloData)) {
        return new Set(state.eloData.map(row => row.Naam).filter(name => typeof name === 'string'));
    }
    if (state.eloData && typeof state.eloData === 'object') {
        return new Set(Object.keys(state.eloData));
    }
    return new Set();
}

function renderSavedViews() {
    if (!DOM.savedViewsList) return;

    const savedViews = readSavedViews();
    DOM.savedViewsList.replaceChildren();
    if (DOM.saveSavedViewButton) {
        DOM.saveSavedViewButton.disabled = state.selectedPlayers.length === 0;
    }

    if (savedViews.size === 0) {
        const emptyLabel = document.createElement('span');
        emptyLabel.className = 'saved-views-empty';
        emptyLabel.textContent = 'No saved views';
        DOM.savedViewsList.appendChild(emptyLabel);
        return;
    }

    savedViews.forEach((players, name) => {
        const item = document.createElement('div');
        item.className = 'saved-view-item';

        const loadButton = document.createElement('button');
        loadButton.type = 'button';
        loadButton.className = 'saved-view-load';
        loadButton.textContent = name;
        loadButton.title = name;
        loadButton.dataset.action = 'load-saved-view';
        loadButton.dataset.viewName = name;
        const isActive = players.length === state.selectedPlayers.length &&
            players.every((player, index) => player === state.selectedPlayers[index]);
        item.classList.toggle('is-active', isActive);
        loadButton.classList.toggle('is-active', isActive);
        loadButton.setAttribute('aria-pressed', String(isActive));

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'saved-view-delete';
        deleteButton.textContent = '×';
        deleteButton.title = `Delete ${name}`;
        deleteButton.setAttribute('aria-label', `Delete saved view ${name}`);
        deleteButton.dataset.action = 'delete-saved-view';
        deleteButton.dataset.viewName = name;

        item.append(loadButton, deleteButton);
        DOM.savedViewsList.appendChild(item);
    });
}

function saveCurrentView() {
    if (state.selectedPlayers.length === 0) return;

    const name = window.prompt('Name this saved view:')?.trim();
    if (!name) return;

    const savedViews = readSavedViews();
    if (savedViews.has(name) && !window.confirm(`Replace the saved view “${name}”?`)) return;

    savedViews.set(name, [...state.selectedPlayers]);
    writeSavedViews(savedViews);
    renderSavedViews();
}

function loadSavedView(name) {
    const players = readSavedViews().get(name);
    if (!players) return;

    const availablePlayers = getAvailablePlayerNames();
    state.selectedPlayers = players
        .filter(player => availablePlayers.has(player))
        .slice(0, MAX_SELECTED_PLAYERS);
}

function deleteSavedView(name) {
    const savedViews = readSavedViews();
    if (!savedViews.delete(name)) return;

    writeSavedViews(savedViews);
    renderSavedViews();
}

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
        modalChartInstance = createEloChart(DOM.ctxModal, modalChartInstance, chartData, false, true);
    }
}

function openChartModal() {
    if (!eloChartInstance) return;
    if (DOM.modalTimeFilter) DOM.modalTimeFilter.value = state.timeFilter;
    lockBackgroundScroll();
    if (DOM.chartModal) {
        DOM.chartModal.style.display = 'flex';
    }
    
    // Destroy the modal chart instance before recreating it.
    if (modalChartInstance) {
        modalChartInstance.destroy();
        modalChartInstance = null;
    }
    modalChartInstance = createEloChart(DOM.ctxModal, modalChartInstance, JSON.parse(JSON.stringify(eloChartInstance.data)), false, true);
}

function closeChartModal() {
    if (DOM.chartModal) DOM.chartModal.style.display = 'none';
    if (modalChartInstance) { modalChartInstance.destroy(); modalChartInstance = null; }
    unlockBackgroundScroll();
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
    const deleteSavedViewButton = e.target.closest('[data-action="delete-saved-view"]');
    if (deleteSavedViewButton) {
        deleteSavedView(deleteSavedViewButton.dataset.viewName);
        return;
    }

    const loadSavedViewButton = e.target.closest('[data-action="load-saved-view"]');
    if (loadSavedViewButton) {
        loadSavedView(loadSavedViewButton.dataset.viewName);
        return;
    }

    if (e.target.closest('[data-action="save-view"]')) {
        saveCurrentView();
        return;
    }
    const playerLink = e.target.closest(SELECTORS.ACTION_SELECT_PLAYER);
    if (playerLink && playerLink.dataset.player) {
        selectPlayer(playerLink.dataset.player);
        return;
    }
    if (e.target.closest(SELECTORS.BTN_CLEAR)) clearSelection();
    if (e.target.closest(SELECTORS.BTN_MAXIMIZE)) openChartModal();
    if (e.target.closest(SELECTORS.BTN_CLOSE_MODAL)) closeChartModal();
    if (e.target.closest('#resetModalZoomBtn')) modalChartInstance?.resetZoom();
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