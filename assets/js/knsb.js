import { statsFor, nextMatch, teamMatches, teamSide, opposite, lastLineup, rankHistory } from './knsb-model.js?v=1';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const fmt = (value, digits = 0) => Number.isFinite(value) ? value.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
const signed = value => Number.isFinite(value) ? `${value >= 0 ? '+' : '−'}${fmt(Math.abs(value), 1)}` : '—';
const deltaClass = value => value > 0 ? 'positive' : value < 0 ? 'negative' : '';
const date = value => new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const sourceURL = (kind, id) => /^\d+$/.test(String(id)) ? `https://knsb.netstand.nl/${kind}/view/${id}` : 'https://knsb.netstand.nl/';
const source = (kind, id, text) => `<a href="${sourceURL(kind, id)}" target="_blank" rel="noopener">${esc(text)} ↗</a>`;
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
    $('#teamPopup').hidden = false;
    $('#teamSelect').setAttribute('aria-expanded', 'true');
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
    const current = team(selected), stats = metrics.get(selected), next = nextMatch(data, selected, today);
    const history = rankHistory(data, selected);
    $('#teamOverview').innerHTML = `<div class="overview"><div class="team-summary"><h2>${esc(current.name)}</h2><p>${esc(data.name)} · ${esc(data.season)}</p><div class="team-numbers"><div><strong>${current.position}<small> / ${data.teams.length}</small></strong><span>Official position</span></div><div><strong>${fmt(current.match_points)}</strong><span>Match points</span></div><div><strong>${fmt(stats.rating)}</strong><span>Average rating</span></div></div><div class="position-history"><span>Position by round</span>${history.map(entry => `<span class="position-step">R${entry.round}: <b>${entry.position}</b></span>`).join('') || 'No results yet'}</div></div><div class="next-match">${next ? `<span class="fixture-label">Next encounter · Round ${next.round}</span><h3>${esc(teamName(next[opposite(teamSide(next, selected))]))}</h3><p>${date(next.date)} ${next.date.slice(0, 4)} · ${next.home === selected ? 'Home' : 'Away'}<br>Time and venue: check with your team captain.</p><button class="primary-button" type="button" data-prepare="${esc(next[opposite(teamSide(next, selected))])}">Compare with next opponent</button>` : '<span class="fixture-label">Season calendar</span><h3>No upcoming encounter</h3><p>Check the calendar below for results and any outstanding encounters.</p>'}</div></div>`;
}

function renderStandings() {
    const rows = data.teams.map(item => ({ ...item, ...metrics.get(item.id) })).sort((a, b) => {
        const av = a[sorting.key], bv = b[sorting.key];
        if (av == null && bv == null) return a.position - b.position;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av - bv) * sorting.direction || a.position - b.position;
    });
    $('#standings tbody').innerHTML = rows.map(item => `<tr class="${item.id === selected ? 'selected-row' : ''}"><td>${item.position}</td><td><button type="button" class="team-link" data-team="${esc(item.id)}" aria-pressed="${item.id === selected}">${favorites.includes(item.id) ? '★ ' : ''}${esc(item.name)}</button></td><td>${item.played}</td><td><b>${fmt(item.match_points)}</b></td><td>${fmt(item.board_points, 1)}</td><td>${fmt(item.rating)}</td><td>${fmt(item.opposition)}</td><td class="${deltaClass(item.delta)}" title="${item.ratedGames} games with two rated players">${signed(item.delta)}</td><td>${form(item.form)}</td></tr>`).join('');
    document.querySelectorAll('#standings th').forEach(th => {
        const button = th.querySelector('[data-sort]');
        th.removeAttribute('aria-sort');
        if (button?.dataset.sort === sorting.key) th.setAttribute('aria-sort', sorting.direction === 1 ? 'ascending' : 'descending');
    });
}

function renderComparison() {
    const a = metrics.get(selected), b = metrics.get(compared);
    const lineupA = lastLineup(data, selected), lineupB = lastLineup(data, compared);
    const metricsHTML = [['Average rating', fmt(a.rating), fmt(b.rating)], ['Opponents faced · avg. rating', fmt(a.opposition), fmt(b.opposition)], ['Points above expected', signed(a.delta), signed(b.delta)], ['Wins by one board point', fmt(a.closeWins), fmt(b.closeWins)]]
        .map(([label, av, bv]) => `<div class="metric"><h3>${esc(label)}</h3><div class="metric-pair"><strong>${av}</strong><span>/</span><span>${bv}</span></div></div>`).join('');
    let lineups = empty('Both teams need a completed encounter before their last lineups can be compared.');
    if (lineupA && lineupB) {
        const size = Math.max(lineupA.players.length, lineupB.players.length);
        lineups = `<h3>Last lineups, board by board</h3><p class="table-note">${esc(teamName(selected))}: ${date(lineupA.match.date)} · ${esc(teamName(compared))}: ${date(lineupB.match.date)}. Future lineups are not confirmed.</p><div class="table-scroll"><table class="lineup-table"><thead><tr><th>Board</th><th>${esc(teamName(selected))}</th><th>Rating gap</th><th>${esc(teamName(compared))}</th></tr></thead><tbody>${Array.from({ length: size }, (_, index) => {
            const left = lineupA.players[index], right = lineupB.players[index];
            const gap = left?.rating > 0 && right?.rating > 0 ? left.rating - right.rating : null;
            return `<tr><td>${index + 1}</td><td>${left ? source('players', left.id, left.name) : '—'}<small>${fmt(left?.rating)} Elo</small></td><td class="${deltaClass(gap)}">${gap === null ? '—' : `${gap > 0 ? '+' : ''}${gap}`}<span class="rating-gap">left − right</span></td><td>${right ? source('players', right.id, right.name) : '—'}<small>${fmt(right?.rating)} Elo</small></td></tr>`;
        }).join('')}</tbody></table></div>`;
    }
    const meetings = data.matches.filter(m => m.status === 'completed' && [m.home, m.away].includes(selected) && [m.home, m.away].includes(compared));
    $('#comparison').innerHTML = `<div class="compare-legend"><span>${esc(teamName(selected))}</span><span>${esc(teamName(compared))}</span></div><div class="comparison-metrics">${metricsHTML}</div><p class="insight">Based on ${a.played} and ${b.played} completed encounters; ${a.ratedGames} and ${b.ratedGames} rated games enter the expected-points comparison. A small sample can change quickly.</p>${meetings.map(m => `<p>Head to head this season: <button type="button" class="team-link" data-match="${esc(m.id)}">${esc(teamName(m.home))} ${resultText(m.score)} ${esc(teamName(m.away))} ↗</button></p>`).join('')}${lineups}`;
}

function renderCalendar() {
    const upcoming = nextMatch(data, selected, today);
    $('#calendar').innerHTML = teamMatches(data, selected).map(match => {
        const side = teamSide(match, selected), index = side === 'home' ? 0 : 1;
        const scores = match.score ? [match.score[index], match.score[1 - index]] : null;
        const css = scores ? scores[0] > scores[1] ? 'positive' : scores[0] < scores[1] ? 'negative' : '' : '';
        return `<div class="fixture ${match.id === upcoming?.id ? 'next-fixture' : ''}"><div class="fixture-date">${date(match.date)}<small>Round ${match.round}</small></div><div class="fixture-opponent">${esc(teamName(match[opposite(side)]))}<small>${side === 'home' ? 'Home' : 'Away'}${match.id === upcoming?.id ? ' · Up next' : ''}${match.status !== 'completed' && match.date < today ? ' · Result pending' : ''}</small></div><button type="button" data-match="${esc(match.id)}" aria-label="${esc(`Round ${match.round}, ${teamName(match[opposite(side)])}, ${resultText(scores)}; view encounter`)}"><span class="${css}">${scores ? resultText(scores) : 'Details'}</span></button></div>`;
    }).join('');
}

function renderPlayers() {
    const players = metrics.get(selected).players;
    $('#players').innerHTML = players.length ? `<div class="table-scroll"><table class="players-table"><thead><tr><th>Player</th><th>Rating¹</th><th>Games</th><th>Points</th><th>Avg. board</th></tr></thead><tbody>${players.map(player => `<tr><td>${source('players', player.id, player.name)}</td><td>${fmt(player.rating)}</td><td>${player.games}</td><td>${fmt(player.points, 1)}</td><td>${fmt(player.boards.reduce((sum, board) => sum + board, 0) / player.boards.length, 1)}</td></tr>`).join('')}</tbody></table></div><p class="table-note">¹ Latest rating recorded in this player’s encounters. Ordered by appearances. Walkovers are excluded.</p>` : empty('Players will appear here once individual results are published.');
}

function applyTeam(id) {
    selected = id;
    const next = nextMatch(data, selected, today);
    compared = next ? next[opposite(teamSide(next, selected))] : data.teams.find(t => t.id !== selected)?.id;
    $('#teamSelect').value = catalogTeam(id).name;
    $('#teamSelect').dataset.team = id;
    closeTeamPicker();
    $('#compareSelect').innerHTML = data.teams.filter(t => t.id !== selected).map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
    $('#compareSelect').value = compared;
    $('#teamSource').href = sourceURL('teams', selected);
    const url = new URL(location.href);
    url.searchParams.set('team', selected);
    history.replaceState(null, '', url);
    renderFavorites(); renderOverview(); renderStandings(); renderComparison(); renderCalendar(); renderPlayers();
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
    $('#matchContent').innerHTML = `<p class="dialog-meta">Round ${match.round} · ${date(match.date)} ${match.date.slice(0, 4)} · ${source('pairings', match.id, 'Official encounter')}</p>${match.boards.length ? `<div class="table-scroll"><table class="lineup-table"><thead><tr><th>Board</th><th>${esc(teamName(match.home))}</th><th>Result</th><th>${esc(teamName(match.away))}</th></tr></thead><tbody>${match.boards.map(board => `<tr><td>${board.board}</td><td>${esc(board.home_player.name)}<small>${board.home_color === 'black' ? 'Black · ' : board.home_color === 'white' ? 'White · ' : ''}${fmt(board.home_rating)} Elo</small></td><td>${esc(board.raw_score || 'Pending')}</td><td>${esc(board.away_player.name)}<small>${board.home_color === 'black' ? 'White · ' : board.home_color === 'white' ? 'Black · ' : ''}${fmt(board.away_rating)} Elo</small></td></tr>`).join('')}</tbody></table></div>` : empty('Individual results are not published yet. Lineups, start time and venue should be confirmed with the team captain.')}`;
    $('#matchDialog').showModal();
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
    openTeamPicker();
    $('#teamSelect').select();
});
$('#teamSelect').addEventListener('click', () => { if ($('#teamPopup').hidden) openTeamPicker(); });
$('#teamSelect').addEventListener('input', event => {
    $('#teamPopup').hidden = false;
    $('#teamSelect').setAttribute('aria-expanded', 'true');
    renderTeamOptions(event.target.value);
});
$('#teamSelect').addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); closeTeamPicker(); }
    if (event.key === 'Tab') closeTeamPicker();
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        if (['Home', 'End'].includes(event.key) && $('#teamPopup').hidden) return;
        event.preventDefault();
        const wasClosed = $('#teamPopup').hidden;
        if (wasClosed) openTeamPicker();
        const count = document.querySelectorAll('[data-team-option]').length;
        setActiveOption(event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : wasClosed ? (event.key === 'ArrowUp' ? count - 1 : 0) : activeOption + (event.key === 'ArrowDown' ? 1 : -1));
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
$('#compareSelect').addEventListener('change', event => { compared = event.target.value; renderComparison(); });
$('#favoriteButton').addEventListener('click', () => {
    favorites = favorites.includes(selected) ? favorites.filter(id => id !== selected) : [...favorites, selected];
    try { localStorage.setItem('asv-knsb-favorites', JSON.stringify(favorites)); } catch { /* Session favorites still work. */ }
    renderFavorites(); renderStandings();
});
document.addEventListener('click', event => {
    if (!event.target.closest('.team-picker')) closeTeamPicker();
    const teamButton = event.target.closest('[data-team]');
    if (teamButton) selectTeam(teamButton.dataset.team);
    const prepare = event.target.closest('[data-prepare]');
    if (prepare) {
        compared = prepare.dataset.prepare;
        $('#compareSelect').value = compared;
        renderComparison();
        $('#comparisonTitle').scrollIntoView({ behavior: 'instant', block: 'start' });
        $('#compareSelect').focus({ preventScroll: true });
    }
    const sort = event.target.closest('[data-sort]');
    if (sort) { sorting = { key: sort.dataset.sort, direction: sorting.key === sort.dataset.sort ? -sorting.direction : -1 }; renderStandings(); }
    const match = event.target.closest('[data-match]');
    if (match) showMatch(match.dataset.match);
});
$('#closeMatch').addEventListener('click', () => $('#matchDialog').close());
$('#matchDialog').addEventListener('click', event => { if (event.target === $('#matchDialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
load();
