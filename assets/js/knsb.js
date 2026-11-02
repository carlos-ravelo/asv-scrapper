import { average, validRating, statsFor, nextMatch, teamMatches, teamSide, opposite, lastLineup, rankHistory } from './knsb-model.js?v=1';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const fmt = (value, digits = 0) => Number.isFinite(value) ? value.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
const deltaClass = value => value > 0 ? 'positive' : value < 0 ? 'negative' : '';
const date = value => new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const sourceURL = (kind, id) => /^\d+$/.test(String(id)) ? `https://knsb.netstand.nl/${kind}/view/${id}` : 'https://knsb.netstand.nl/';
const source = (kind, id, text) => `<a href="${sourceURL(kind, id)}" target="_blank" rel="noopener">${esc(text)} ↗</a>`;
const playerLink = player => /^\d+$/.test(String(player?.id)) ? `<button type="button" class="player-link" data-player="${esc(player.id)}">${esc(player.name)}</button>` : esc(player?.name || 'Unlisted player');
const resultText = scores => scores ? scores.map(value => fmt(value, value % 1 ? 1 : 0)).join(' – ') : 'Pending';
const form = values => `<div class="form" aria-label="Form: ${esc(values.join(', ') || 'no results')}">${values.map(value => `<span class="${value === 'W' ? 'win' : value === 'L' ? 'loss' : 'draw'}" title="${value === 'W' ? 'Win' : value === 'L' ? 'Loss' : 'Draw'}">${value}</span>`).join('')}</div>`;
let data, selected, compared, metrics, catalog;
let loadSequence = 0;
const groupCache = new Map();
let favorites = [];
let sorting = { key: 'position', direction: 1 };
try {
    const saved = JSON.parse(localStorage.getItem('asv-knsb-favorites') || '[]');
    if (Array.isArray(saved)) favorites = saved.filter(id => typeof id === 'string');
} catch { /* A blocked or full store does not prevent using the dashboard. */ }
const team = id => data.teams.find(item => item.id === id);
const teamName = id => team(id)?.name || 'Unknown team';
const empty = message => `<p class="empty">${esc(message)}</p>`;
const catalogTeam = id => catalog?.teams.find(item => item.id === id);

function setView(view, focus = false) {
    if (!['team', 'standings', 'compare'].includes(view)) view = 'team';
    document.querySelectorAll('[data-view]').forEach(tab => {
        const active = tab.dataset.view === view;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
        if (active && focus) tab.focus();
    });
    const url = new URL(location.href);
    if (view === 'team') url.searchParams.delete('view'); else url.searchParams.set('view', view);
    history.replaceState(null, '', url);
}

let activeOption = -1;
function setActiveOption(index) {
    const options = [...document.querySelectorAll('[data-team-option]')];
    activeOption = options.length ? Math.max(0, Math.min(index, options.length - 1)) : -1;
    options.forEach((option, i) => option.classList.toggle('is-active', i === activeOption));
    if (activeOption >= 0) {
        $('#teamSelect').setAttribute('aria-activedescendant', options[activeOption].id);
        options[activeOption].scrollIntoView({ block: 'nearest' });
    } else $('#teamSelect').removeAttribute('aria-activedescendant');
}

function closeTeamPicker(restore = true) {
    $('#teamPopup').hidden = true;
    $('#teamSelect').setAttribute('aria-expanded', 'false');
    $('#teamSelect').removeAttribute('aria-activedescendant');
    $('#teamPickerToggle').setAttribute('aria-label', 'Open team list');
    if (restore) $('#teamSelect').value = catalogTeam(selected)?.name || '';
}

function renderTeamOptions(query = '') {
    if (!catalog) return;
    const matches = catalog.teams.filter(t => t.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    const asv = matches.filter(t => t.is_asv).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
    const option = t => `<button type="button" role="option" tabindex="-1" id="team-option-${esc(t.id)}" data-team-option="${esc(t.id)}" data-asv="${t.is_asv}" aria-selected="${t.id === selected}"><span>${esc(t.name)}</span><small>${esc(catalog.groups.find(g => g.id === t.division_id)?.name)}</small></button>`;
    const group = (name, teams) => teams.length ? `<div role="group" aria-label="${esc(name)}"><div class="team-option-group" aria-hidden="true">${esc(name)}</div>${teams.map(option).join('')}</div>` : '';
    $('#teamOptions').innerHTML = group('ASV teams', asv) + catalog.groups.map(g => group(g.name, matches.filter(t => !t.is_asv && t.division_id === g.id))).join('');
    $('#searchStatus').textContent = matches.length ? `${matches.length} teams` : 'No teams found. Try a different name.';
    activeOption = -1;
    $('#teamSelect').removeAttribute('aria-activedescendant');
    if (!$('#teamPopup').hidden) setActiveOption(0);
}

function openTeamPicker() {
    if (!catalog) return;
    $('#teamSelect').value = '';
    $('#teamSelect').placeholder = 'Search teams…';
    $('#teamPopup').hidden = false;
    $('#teamSelect').setAttribute('aria-expanded', 'true');
    $('#teamPickerToggle').setAttribute('aria-label', 'Close team list');
    renderTeamOptions();
}

function chooseTeam(id) {
    if (!catalogTeam(id)) return;
    closeTeamPicker(false);
    $('#teamSelect').value = catalogTeam(id).name;
    selectTeam(id);
}

function renderFavorites() {
    const saved = favorites.includes(selected);
    $('#favoriteButton').textContent = saved ? '★ Saved team' : '☆ Save team';
    $('#favoriteButton').setAttribute('aria-pressed', String(saved));
    $('#favorites').innerHTML = favorites.filter(id => catalogTeam(id)).map(id => `<button type="button" data-team="${esc(id)}" aria-pressed="${id === selected}">★ ${esc(catalogTeam(id).name)}</button>`).join('');

}

function renderOverview() {
    const current = team(selected), stats = metrics.get(selected);
    $('#teamOverview').innerHTML = `<div class="team-brief"><dl class="brief-stats"><div><dt>Position</dt><dd>${current.position} of ${data.teams.length}</dd></div><div><dt>Match points</dt><dd>${fmt(current.match_points)}</dd></div><div><dt>Average rating</dt><dd>${fmt(stats.rating)}</dd></div></dl></div>`;
}

function renderStandings() {
    const history = rankHistory(data, selected);
    $('#positionHistory').innerHTML = history.length ? `<span>Position by round</span>${history.map(entry => `<span class="position-step">R${entry.round}: <b>${entry.position}</b></span>`).join('')}` : '';
    const rows = data.teams.map(item => ({ ...item, ...metrics.get(item.id) })).sort((a, b) => {
        const av = a[sorting.key], bv = b[sorting.key];
        if (av == null && bv == null) return a.position - b.position;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av - bv) * sorting.direction || a.position - b.position;
    });
    $('#standings tbody').innerHTML = rows.map(item => `<tr class="${item.id === selected ? 'selected-row' : item.id === compared ? 'compared-row' : ''}"><td>${item.position}</td><td><button type="button" class="team-link compare-team-choice" data-compare-team="${esc(item.id)}" ${item.id === selected ? 'disabled aria-label="Your selected team"' : `aria-pressed="${item.id === compared}" aria-label="Compare ${esc(item.name)} with ${esc(teamName(selected))}"`}>${favorites.includes(item.id) ? '★ ' : ''}${esc(item.name)}</button></td><td>${item.played}</td><td><b>${fmt(item.match_points)}</b></td><td>${fmt(item.board_points, 1)}</td><td>${fmt(item.rating)}</td><td>${fmt(item.opposition)}</td><td>${form(item.form)}</td></tr>`).join('');
    document.querySelectorAll('#standings th').forEach(th => {
        const button = th.querySelector('[data-sort]');
        th.removeAttribute('aria-sort');
        if (button?.dataset.sort === sorting.key) th.setAttribute('aria-sort', sorting.direction === 1 ? 'ascending' : 'descending');
    });
}

function renderComparison() {
    $('#comparisonSelection').innerHTML = `<div class="comparison-chip reference-chip">${esc(teamName(selected))}<span>Your team</span></div>${compared ? `<div class="comparison-chip opponent-chip"><span>${esc(teamName(compared))}</span><button type="button" data-remove-comparison aria-label="Remove ${esc(teamName(compared))} from comparison">×</button></div>` : ''}`;
    if (!compared || !team(compared) || compared === selected) {
        $('#comparison').innerHTML = empty('Click a team name on the left to compare it with your team.');
        return;
    }
    $('#comparison').innerHTML = teamComparisonHTML(selected, compared);
}

function teamComparisonHTML(firstId, secondId, reference = false) {
    const a = metrics.get(firstId), b = metrics.get(secondId);
    const lineupA = lastLineup(data, firstId), lineupB = lastLineup(data, secondId);
    const metricsHTML = [['Average rating', fmt(a.rating), fmt(b.rating)], ['Opponents faced · avg. rating', fmt(a.opposition), fmt(b.opposition)]]
        .map(([label, av, bv]) => `<div class="metric"><h3>${esc(label)}</h3><div class="metric-pair"><strong>${av}</strong><span>/</span><span>${bv}</span></div></div>`).join('');
    let lineups = empty('Both teams need a completed encounter before their last lineups can be compared.');
    if (lineupA && lineupB) {
        const size = Math.max(lineupA.players.length, lineupB.players.length);
        lineups = `<h3>${reference ? 'Latest available lineups' : 'Last lineups, board by board'}</h3><p class="table-note">${esc(teamName(firstId))}: ${date(lineupA.match.date)} · ${esc(teamName(secondId))}: ${date(lineupB.match.date)}. ${reference ? 'From the latest completed encounters.' : 'Future lineups are not confirmed.'}</p><div class="table-scroll"><table class="lineup-table"><thead><tr><th>Board</th><th>${esc(teamName(firstId))}</th><th>Rating gap</th><th>${esc(teamName(secondId))}</th></tr></thead><tbody>${Array.from({ length: size }, (_, index) => {
            const left = lineupA.players[index], right = lineupB.players[index];
            const gap = left?.rating > 0 && right?.rating > 0 ? left.rating - right.rating : null;
            return `<tr><td>${index + 1}</td><td>${left ? playerLink(left) : '—'}<small>${fmt(left?.rating)} Elo</small></td><td class="${deltaClass(gap)}">${gap === null ? '—' : `${gap > 0 ? '+' : ''}${gap}`}<span class="rating-gap">left − right</span></td><td>${right ? playerLink(right) : '—'}<small>${fmt(right?.rating)} Elo</small></td></tr>`;
        }).join('')}</tbody></table></div>`;
    }
    const meetings = data.matches.filter(m => m.status === 'completed' && [m.home, m.away].includes(firstId) && [m.home, m.away].includes(secondId));
    return `<div class="comparison-metrics">${metricsHTML}</div><p class="insight">Based on ${a.played} and ${b.played} completed encounters, respectively.</p>${meetings.map(m => `<p>Head to head this season: <button type="button" class="team-link" data-match="${esc(m.id)}">${esc(teamName(m.home))} ${resultText(m.score)} ${esc(teamName(m.away))} ↗</button></p>`).join('')}${lineups}`;
}

function renderComparisonTeams() {
    $('#comparisonTeams').innerHTML = [...data.teams].sort((a, b) => a.position - b.position).filter(item => item.id !== selected)
        .map(item => `<button type="button" class="compare-team-choice" data-compare-team="${esc(item.id)}" aria-pressed="false"><span>${esc(item.name)}</span></button>`).join('');
}

function updateComparisonSelection() {
    document.querySelectorAll('[data-compare-team]').forEach(button => {
        const id = button.dataset.compareTeam;
        const active = id === compared;
        if (id !== selected) button.setAttribute('aria-pressed', String(active));
        button.closest('#standings tr')?.classList.toggle('compared-row', active);
    });
}

function chooseOpponent(id) {
    compared = team(id) && id !== selected ? id : null;
    const url = new URL(location.href);
    if (compared) url.searchParams.set('against', compared); else url.searchParams.delete('against');
    history.replaceState(null, '', url);
    renderComparison();
    updateComparisonSelection();
}

function renderCalendar() {
    $('#calendarCount').textContent = `${teamMatches(data, selected).length} encounters`;
    const upcoming = nextMatch(data, selected, today);
    $('#calendar').innerHTML = `<table class="calendar-table"><caption class="sr-only">Season schedule. Click an opponent to compare or a result to view the encounter.</caption><thead><tr><th scope="col">Round</th><th scope="col">Date</th><th scope="col">Opponent</th><th scope="col">Venue</th><th scope="col">Encounter</th></tr></thead><tbody>${teamMatches(data, selected).map(match => {
        const side = teamSide(match, selected), index = side === 'home' ? 0 : 1;
        const scores = match.score ? [match.score[index], match.score[1 - index]] : null;
        const css = scores ? scores[0] > scores[1] ? 'positive' : scores[0] < scores[1] ? 'negative' : '' : '';
        const pending = match.status !== 'completed' && match.date < today;
        const dateLabel = `${date(match.date)}${match.date.slice(0, 4) !== today.slice(0, 4) ? ` ${match.date.slice(0, 4)}` : ''}`;
        return `<tr class="fixture ${match.id === upcoming?.id ? 'next-fixture' : ''}"><td>${match.round}</td><td>${dateLabel}</td><td class="fixture-opponent"><button type="button" class="team-link" data-compare-team="${esc(match[opposite(side)])}" aria-pressed="${match[opposite(side)] === compared}">${esc(teamName(match[opposite(side)]))}</button>${match.id === upcoming?.id ? '<span class="next-label">Next</span>' : ''}</td><td>${side === 'home' ? 'Home' : 'Away'}</td><td><button type="button" class="encounter-action" data-match="${esc(match.id)}" aria-label="${esc(`${scores ? 'View result and board comparison' : 'Compare teams'}: round ${match.round}, ${teamName(match[opposite(side)])}, ${scores ? resultText(scores) : pending ? 'result pending' : 'not played'}`)}">${scores ? `<span class="${css}">${resultText(scores)}</span><span class="encounter-cue">View ↗</span>` : '<span>Compare ↗</span>'}</button></td></tr>`;
    }).join('')}</tbody></table>`;
}

function renderPlayers() {
    const players = metrics.get(selected).players;
    $('#playersCount').textContent = `${players.length} players`;
    $('#players').innerHTML = players.length ? `<div class="table-scroll"><table class="players-table"><thead><tr><th>Player</th><th>Rating¹</th><th>Games</th><th>Points</th><th>Avg. board</th></tr></thead><tbody>${players.map(player => `<tr><td>${playerLink(player)}</td><td>${fmt(player.rating)}</td><td>${player.games}</td><td>${fmt(player.points, 1)}</td><td>${fmt(player.boards.reduce((sum, board) => sum + board, 0) / player.boards.length, 1)}</td></tr>`).join('')}</tbody></table></div><p class="table-note">¹ Latest rating recorded in this player’s encounters. Ordered by appearances. Walkovers are excluded.</p>` : empty('Players will appear here once individual results are published.');
}

function applyTeam(id) {
    selected = id;
    const next = nextMatch(data, selected, today);
    const requested = new URLSearchParams(location.search).get('against');
    compared = requested !== selected && team(requested) ? requested : next ? next[opposite(teamSide(next, selected))] : data.teams.find(t => t.id !== selected)?.id;
    $('#teamSelect').value = catalogTeam(id).name;
    $('#teamSelect').dataset.team = id;
    closeTeamPicker();
    $('#teamSource').href = sourceURL('teams', selected);
    const url = new URL(location.href);
    url.searchParams.set('team', selected);
    if (requested && requested !== compared) url.searchParams.delete('against');
    history.replaceState(null, '', url);
    renderFavorites(); renderOverview(); renderStandings(); renderComparisonTeams(); renderComparison(); renderCalendar(); renderPlayers(); updateComparisonSelection();
}

function loadError(message, retryAction) {
    $('#loadStatus').hidden = false;
    $('#loadStatus').replaceChildren(document.createTextNode(`${message} `));
    const retry = document.createElement('button');
    retry.textContent = 'Try again';
    retry.addEventListener('click', retryAction);
    $('#loadStatus').append(retry);
}

async function selectTeam(id) {
    const entry = catalogTeam(id);
    if (!entry || !/^\d+$/.test(entry.division_id)) return;
    const sequence = ++loadSequence;
    $('#groupContent').hidden = true;
    $('#groupContent').setAttribute('aria-busy', 'true');
    $('#favoriteButton').disabled = true;
    $('#competitionLabel').textContent = catalog.groups.find(group => group.id === entry.division_id)?.name || '';
    $('#updatedAt').textContent = '';
    $('#loadStatus').hidden = false;
    $('#loadStatus').textContent = `Loading ${entry.name}…`;
    try {
        let dataset = groupCache.get(entry.division_id);
        if (!dataset) {
            const response = await fetch(`./data/knsb/divisions/${entry.division_id}.json`, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            dataset = await response.json();
            if (dataset.schema_version !== 1 || dataset.division_id !== entry.division_id || !dataset.teams?.some(t => t.id === id) || !Array.isArray(dataset.matches)) throw new Error('Invalid competition data');
            groupCache.set(entry.division_id, dataset);
        }
        if (sequence !== loadSequence) return;
        data = dataset;
        metrics = new Map(data.teams.map(t => [t.id, statsFor(data, t.id)]));
        $('#competitionLabel').textContent = `${data.name} · ${data.season}`;
        $('#divisionSource').href = sourceURL('divisions', data.division_id);
        const updated = new Date(data.updated_at);
        const stale = Date.now() - updated.getTime() > 36 * 60 * 60 * 1000;
        $('#updatedAt').textContent = `${stale ? 'Data may be outdated · ' : ''}Updated ${updated.toLocaleString('en-GB', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} (Amsterdam)`;
        $('#updatedAt').classList.toggle('stale', stale);
        applyTeam(id);
        $('#favoriteButton').disabled = false;
        $('#loadStatus').hidden = true;
        $('#groupContent').hidden = false;
        $('#groupContent').setAttribute('aria-busy', 'false');
    } catch {
        if (sequence !== loadSequence) return;
        $('#groupContent').setAttribute('aria-busy', 'false');
        loadError(`Could not load ${entry.name}. Choose another team or try again.`, () => selectTeam(id));
    }
}

function showMatch(id) {
    const match = data.matches.find(m => m.id === id);
    if (!match) return;
    $('#matchTitle').textContent = `${teamName(match.home)} ${match.score ? resultText(match.score) : 'vs'} ${teamName(match.away)}`;
    const metadata = `<p class="dialog-meta">Round ${match.round} · ${date(match.date)} ${match.date.slice(0, 4)} · ${source('pairings', match.id, 'Official encounter')}</p>`;
    let content;
    if (match.boards.length) {
        const homeRating = average(match.boards.map(board => board.home_rating).filter(validRating));
        const awayRating = average(match.boards.map(board => board.away_rating).filter(validRating));
        content = `<div class="encounter-averages"><span>Lineup average rating</span><strong>${fmt(homeRating)}</strong><span>vs</span><strong>${fmt(awayRating)}</strong></div>${!match.score ? '<p class="encounter-status">Published boards · results incomplete</p>' : ''}<div class="table-scroll"><table class="lineup-table encounter-table"><thead><tr><th>Board</th><th>${esc(teamName(match.home))}</th><th>Result</th><th>${esc(teamName(match.away))}</th><th title="Home rating minus away rating">Rating gap</th></tr></thead><tbody>${match.boards.map(board => {
            const gap = validRating(board.home_rating) && validRating(board.away_rating) ? board.home_rating - board.away_rating : null;
            return `<tr><td>${board.board}</td><td>${playerLink(board.home_player)}<small>${board.home_color === 'black' ? 'Black · ' : board.home_color === 'white' ? 'White · ' : ''}${fmt(board.home_rating)} Elo</small></td><td>${esc(board.raw_score || 'Pending')}</td><td>${playerLink(board.away_player)}<small>${board.home_color === 'black' ? 'White · ' : board.home_color === 'white' ? 'Black · ' : ''}${fmt(board.away_rating)} Elo</small></td><td class="${deltaClass(gap)}">${gap === null ? '—' : `${gap > 0 ? '+' : ''}${gap}`}</td></tr>`;
        }).join('')}</tbody></table></div>`;
    } else if (match.score) {
        content = empty('The team result is published; individual board results are not available yet.');
    } else {
        content = `<p class="encounter-status">${match.date < today ? 'Result not published' : 'Not played'} · reference lineups, not confirmed</p>${teamComparisonHTML(match.home, match.away, true)}`;
    }
    $('#matchContent').innerHTML = metadata + content;
    if ($('#matchDialog').open) $('#matchDialog').close();
    $('#matchDialog').showModal();
}

function showPlayer(id) {
    const games = [];
    let player;
    [...data.matches].sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round).forEach(match => {
        match.boards.forEach(board => {
            const side = board.home_player.id === id ? 'home' : board.away_player.id === id ? 'away' : null;
            if (!side) return;
            player = board[`${side}_player`];
            const other = opposite(side), index = side === 'home' ? 0 : 1;
            const color = !board.home_color ? '—' : side === 'home' ? board.home_color : board.home_color === 'white' ? 'black' : 'white';
            games.push({ match, board, color, opponent: board[`${other}_player`],
                opponentTeam: match[other], rating: board[`${side}_rating`], opponentRating: board[`${other}_rating`],
                result: board.score ? resultText([board.score[index], board.score[1 - index]]) : board.raw_score || 'Pending' });
        });
    });
    if (!player) return;
    $('#playerTitle').textContent = player.name;
    $('#playerContent').innerHTML = `<p class="dialog-meta">${esc(data.name)} · ${esc(data.season)} · ${games.length} recorded games</p><div class="table-scroll"><table class="player-games"><thead><tr><th>Date</th><th>Board</th><th>Color</th><th>Opponent</th><th>Rating</th><th>Opponent rating</th><th>Result</th></tr></thead><tbody>${games.map(game => `<tr><td>${date(game.match.date)}<small>Round ${game.match.round}</small></td><td>${game.board.board}</td><td>${game.color === '—' ? '—' : game.color === 'white' ? 'White' : 'Black'}</td><td>${playerLink(game.opponent)}<small>${esc(teamName(game.opponentTeam))}</small></td><td>${fmt(game.rating)}</td><td>${fmt(game.opponentRating)}</td><td><button type="button" class="team-link" data-match="${esc(game.match.id)}">${esc(game.result)}${game.board.forfeit ? ' (forfeit)' : ''} ↗</button></td></tr>`).join('')}</tbody></table></div><p class="table-note">Results are shown from this player’s side. ${source('players', player.id, 'Official player page')}</p>`;
    if ($('#playerDialog').open) $('#playerDialog').close();
    $('#playerDialog').showModal();
}

async function load() {
    try {
        const response = await fetch('./data/knsb/catalog.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        catalog = await response.json();
        if (catalog.schema_version !== 1 || !catalog.teams?.length || !catalog.groups?.length) throw new Error('Invalid catalog');
        const requested = new URLSearchParams(location.search).get('team');
        const initial = [requested, ...favorites, catalog.teams.find(t => t.name === 'ASV 4')?.id, catalog.teams[0].id].find(id => catalogTeam(id));
        renderTeamOptions();
        renderFavorites();
        $('#dashboard').hidden = false;
        await selectTeam(initial);
    } catch {
        $('#dashboard').hidden = true;
        loadError('Competition data could not be loaded.', load);
    }
}

$('#teamSelect').addEventListener('focus', () => {
    if ($('#teamPopup').hidden) openTeamPicker();
});
$('#teamSelect').addEventListener('click', () => { if ($('#teamPopup').hidden) openTeamPicker(); });
$('#teamPickerToggle').addEventListener('pointerdown', event => event.preventDefault());
$('#teamPickerToggle').addEventListener('click', () => {
    if (!$('#teamPopup').hidden) closeTeamPicker();
    else {
        openTeamPicker();
        $('#teamSelect').focus({ preventScroll: true });
    }
});
$('#teamSelect').addEventListener('input', event => {
    $('#teamPopup').hidden = false;
    $('#teamSelect').setAttribute('aria-expanded', 'true');
    renderTeamOptions(event.target.value);
});
$('#teamSelect').addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); closeTeamPicker(); }
    if (event.key === 'Tab') closeTeamPicker();
    if (event.altKey && event.key === 'ArrowUp') { event.preventDefault(); closeTeamPicker(); return; }
    if (event.altKey && event.key === 'ArrowDown') { event.preventDefault(); openTeamPicker(); return; }
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        const wasClosed = $('#teamPopup').hidden;
        if (wasClosed) openTeamPicker();
        const count = document.querySelectorAll('[data-team-option]').length;
        setActiveOption(wasClosed ? (event.key === 'ArrowUp' ? count - 1 : 0) : activeOption + (event.key === 'ArrowDown' ? 1 : -1));
    }
    if (event.key === 'Enter' && !$('#teamPopup').hidden) {
        event.preventDefault();
        const option = document.querySelectorAll('[data-team-option]')[activeOption];
        if (option) chooseTeam(option.dataset.teamOption);
    }
});
$('#teamSelect').addEventListener('blur', () => closeTeamPicker());
$('#teamOptions').addEventListener('pointerdown', event => { if (event.target.closest('[data-team-option]')) event.preventDefault(); });
$('#teamOptions').addEventListener('click', event => {
    const option = event.target.closest('[data-team-option]');
    if (option) chooseTeam(option.dataset.teamOption);
});
$('#performanceToggle').addEventListener('change', event => {
    $('#standings').classList.toggle('show-performance', event.target.checked);
    $('#performanceExplanation').hidden = !event.target.checked;
    if (!event.target.checked && ['rating', 'opposition'].includes(sorting.key)) {
        sorting = { key: 'position', direction: 1 };
        renderStandings();
    }
});
document.querySelectorAll('[data-view]').forEach(tab => tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll('[data-view]')];
    const index = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    setView(tabs[next].dataset.view, true);
}));
$('#favoriteButton').addEventListener('click', () => {
    favorites = favorites.includes(selected) ? favorites.filter(id => id !== selected) : [...favorites, selected];
    try { localStorage.setItem('asv-knsb-favorites', JSON.stringify(favorites)); } catch { /* Session favorites still work. */ }
    renderFavorites(); renderStandings();
});
document.addEventListener('click', event => {
    if (!event.target.closest('.team-picker')) closeTeamPicker();
    const view = event.target.closest('[data-view]');
    if (view) setView(view.dataset.view);
    const compareTeam = event.target.closest('[data-compare-team]');
    if (compareTeam && compareTeam.dataset.compareTeam !== selected) {
        const id = compareTeam.dataset.compareTeam;
        const alreadyInComparison = Boolean(compareTeam.closest('#view-compare'));
        chooseOpponent(compared === id && alreadyInComparison ? null : id);
        if (!alreadyInComparison) {
            setView('compare');
            $('#comparisonTitle').focus({ preventScroll: true });
            $('#tab-compare').scrollIntoView({ block: 'nearest' });
        }
    }
    if (event.target.closest('[data-remove-comparison]')) {
        chooseOpponent(null);
        $('#comparisonTeams button')?.focus({ preventScroll: true });
    }
    const player = event.target.closest('[data-player]');
    if (player) showPlayer(player.dataset.player);
    const teamButton = event.target.closest('button[data-team]');
    if (teamButton) selectTeam(teamButton.dataset.team);
    const sort = event.target.closest('[data-sort]');
    if (sort) { sorting = { key: sort.dataset.sort, direction: sorting.key === sort.dataset.sort ? -sorting.direction : -1 }; renderStandings(); }
    const match = event.target.closest('[data-match]');
    if (match) showMatch(match.dataset.match);
});
$('#closePlayer').addEventListener('click', () => $('#playerDialog').close());
$('#playerDialog').addEventListener('click', event => { if (event.target === $('#playerDialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
$('#closeMatch').addEventListener('click', () => $('#matchDialog').close());
$('#matchDialog').addEventListener('click', event => { if (event.target === $('#matchDialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
setView(new URLSearchParams(location.search).get('view'));
load();
