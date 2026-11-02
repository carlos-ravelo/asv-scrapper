// Publication dates have day precision; time scopes include today.
export function calculateRecap(resultsData, eloData, now = new Date(), selectedPlayers = [], chosenScope = '30') {
    const matchScope = chosenScope === 'matches15';
    const days = chosenScope === '90' ? 90 : 30;
    const selection = new Set(selectedPlayers);
    const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const validDate = row => {
        const date = row.Publish_Date;
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
        const parsed = new Date(`${date}T00:00:00Z`);
        return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
    };
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - days + 1);
    let from = dateKey(start), to = dateKey(now);
    const inWindow = row => validDate(row) && row.Publish_Date >= from && row.Publish_Date <= to;
    let matches = matchScope
        ? resultsData.filter(row => validDate(row) && (selection.has(row.Witspeler) || selection.has(row.Zwartspeler)))
            .sort((a, b) => b.Publish_Date.localeCompare(a.Publish_Date)).slice(0, 15)
        : resultsData.filter(inWindow);
    matches = matches.sort((a, b) => a.Publish_Date.localeCompare(b.Publish_Date));
    if (matchScope) {
        from = matches[0]?.Publish_Date || dateKey(now);
        to = matches[matches.length - 1]?.Publish_Date || dateKey(now);
    }
    const ratingHistory = new Map();
    eloData.filter(row => matchScope ? validDate(row) : inWindow(row))
        .sort((a, b) => a.Publish_Date.localeCompare(b.Publish_Date)).forEach(row => {
            if (!row.Naam || row.ELO == null || String(row.ELO).trim() === '' || !Number.isFinite(Number(row.ELO))) return;
            if (!ratingHistory.has(row.Naam)) ratingHistory.set(row.Naam, []);
            ratingHistory.get(row.Naam).push({ date: row.Publish_Date, elo: Number(row.ELO) });
        });
    const ratingAt = (name, date) => (ratingHistory.get(name) || []).filter(row => row.date <= date).pop();
    const ratings = matchScope ? new Map() : ratingHistory;
    if (matchScope) {
        // Only rating snapshots for participants on dates in the selected slice contribute to Elo awards.
        matches.forEach(match => {
            [match.Witspeler, match.Zwartspeler].forEach(name => {
                const rating = ratingAt(name, match.Publish_Date);
                if (!rating) return;
                if (!ratings.has(name)) ratings.set(name, []);
                ratings.get(name).push(rating);
            });
        });
    }
    const gains = new Map(), drops = new Map(), games = new Map(), streaks = new Map(), longestStreaks = new Map(), slayers = new Map();
    ratings.forEach((history, name) => {
        if (history[0].date === history[history.length - 1].date) return;
        const delta = history[history.length - 1].elo - history[0].elo;
        if (delta > 0) gains.set(name, delta);
        if (delta < 0) drops.set(name, -delta);
    });
    matches.forEach(match => {
        const result = String(match.Uitslag || '').trim().match(/^(1-0|0-1|½-½|1\/2-1\/2|0\.5-0\.5)(?=\s|$)/)?.[1];
        const white = match.Witspeler, black = match.Zwartspeler;
        if (!result || !white || !black || white === black) return;
        const winner = result === '1-0' ? white : result === '0-1' ? black : null;
        [white, black].forEach(player => {
            games.set(player, (games.get(player) || 0) + 1);
            const streak = winner === player ? (streaks.get(player) || 0) + 1 : 0;
            streaks.set(player, streak);
            longestStreaks.set(player, Math.max(longestStreaks.get(player) || 0, streak));
        });
        if (!winner) return;
        const opponent = winner === white ? black : white;
        const rating = ratingAt(opponent, match.Publish_Date);
        if (rating && rating.elo > (slayers.get(winner) ?? -Infinity)) slayers.set(winner, rating.elo);
    });
    const award = (title, scores, format, empty) => {
        const eligible = [...scores].filter(([name]) => !selection.size || selection.has(name));
        const best = Math.max(0, ...eligible.map(([, score]) => score));
        const names = best > 0 ? eligible.filter(([, score]) => score === best).map(([name]) => name).sort((a, b) => a.localeCompare(b)) : [];
        return { title, names, detail: names.length ? format(best) : empty };
    };
    return { from, to, chosenScope, scopeLabel: matchScope ? 'Last 15 Matches' : `Last ${days} Days · ${from} – ${to}`, eloLabel: matchScope ? 'Elo: first to last rating at sampled matches' : 'Elo: first to last rating within this period', scope: selection.size ? 'Selected players' : 'Club-wide awards', awards: [
        award('🚀 Most Elo Gained', gains, n => `+${n} Elo`, 'No Elo gains'),
        award('📉 Most Elo Lost', drops, n => `−${n} Elo`, 'No Elo drops'),
        award('🗡️ Highest Rated Win', slayers, n => `Defeated a ${n} Elo opponent`, 'No rated wins'),
        award('🛡️ Most Active player', games, n => `${n} matches played`, 'No completed matches'),
        award('🔥 Longest Win Streak', longestStreaks, n => `${n} consecutive wins`, 'No wins in this scope')
    ] };
}

export function renderRecap(container, recap) {
    container.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = 'Player Recap';
    const header = document.createElement('div');
    header.className = 'recap-header';
    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'btn-outline recap-download';
    download.setAttribute('aria-label', 'Download recap PNG');
    download.title = 'Download recap PNG';
    download.setAttribute('x-bind:disabled', 'exporting');
    download.setAttribute('data-html2canvas-ignore', '');
    download.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5"/></svg>';
    header.append(heading, download);
    const description = document.createElement('p');
    description.textContent = `${recap.scopeLabel} · ${recap.scope} · ${recap.eloLabel}`;
    const cards = document.createElement('div');
    cards.className = 'recap-awards';
    recap.awards.forEach(award => {
        const card = document.createElement('article');
        card.className = 'recap-award';
        const title = document.createElement('h4');
        title.textContent = award.title;
        const names = document.createElement('strong');
        names.textContent = award.names.join(' · ') || '—';
        const detail = document.createElement('p');
        detail.textContent = award.detail;
        card.append(title, names, detail);
        cards.append(card);
    });
    const note = document.createElement('p');
    note.className = 'recap-note';
    note.textContent = 'Ties share awards. Opponent Elo uses the latest available rating in this scope by match date. Same-day games follow source order. Awards count only the selected scope.';
    container.append(header, description, cards, note);
    container.hidden = false;
}

let captureLibrary;
function loadCaptureLibrary() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (!captureLibrary) captureLibrary = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
        const timer = setTimeout(() => fail(), 15000);
        function fail() {
            clearTimeout(timer);
            script.remove();
            captureLibrary = null;
            reject(new Error('Image export could not load. Check your connection and try again.'));
        }
        script.onload = () => {
            clearTimeout(timer);
            if (window.html2canvas) resolve(window.html2canvas);
            else fail();
        };
        script.onerror = fail;
        document.head.append(script);
    });
    return captureLibrary;
}

export async function downloadRecap(container, chart, recap) {
    const capture = await loadCaptureLibrary();
    await document.fonts.ready;
    chart.update('none');
    const canvas = await capture(container, {
        backgroundColor: '#ffffff', scale: 2, logging: false,
        onclone(doc) {
            const clone = doc.getElementById(container.id);
            clone.style.padding = '20px';
            clone.style.boxSizing = 'content-box';
        }
    });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Image export failed. Please try again.');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `asv-recap-${recap.chosenScope}-${recap.from}-${recap.to}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}
