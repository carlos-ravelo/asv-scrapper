// Publication dates have day precision: today plus the preceding 13 local dates.
export function calculateRecap(resultsData, eloData, now = new Date(), selectedPlayers = []) {
    const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - 13);
    const from = dateKey(start), to = dateKey(now);
    const inWindow = row => {
        const date = row.Publish_Date;
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
        const parsed = new Date(`${date}T00:00:00Z`);
        return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date && date >= from && date <= to;
    };
    const ratings = new Map();
    eloData.filter(inWindow).sort((a, b) => a.Publish_Date.localeCompare(b.Publish_Date)).forEach(row => {
        if (!row.Naam || row.ELO == null || String(row.ELO).trim() === '' || !Number.isFinite(Number(row.ELO))) return;
        if (!ratings.has(row.Naam)) ratings.set(row.Naam, []);
        ratings.get(row.Naam).push({ date: row.Publish_Date, elo: Number(row.ELO) });
    });
    const gains = new Map(), drops = new Map(), games = new Map(), streaks = new Map(), slayers = new Map();
    ratings.forEach((history, name) => {
        if (history[0].date === history[history.length - 1].date) return;
        const delta = history[history.length - 1].elo - history[0].elo;
        if (delta > 0) gains.set(name, delta);
        if (delta < 0) drops.set(name, -delta);
    });
    const matches = resultsData.filter(inWindow).sort((a, b) => a.Publish_Date.localeCompare(b.Publish_Date));
    matches.forEach(match => {
        const result = String(match.Uitslag || '').trim().match(/^(1-0|0-1|½-½|1\/2-1\/2|0\.5-0\.5)(?=\s|$)/)?.[1];
        const white = match.Witspeler, black = match.Zwartspeler;
        if (!result || !white || !black || white === black) return;
        const winner = result === '1-0' ? white : result === '0-1' ? black : null;
        [white, black].forEach(player => {
            games.set(player, (games.get(player) || 0) + 1);
            streaks.set(player, winner === player ? (streaks.get(player) || 0) + 1 : 0);
        });
        if (!winner) return;
        const opponent = winner === white ? black : white;
        const history = ratings.get(opponent) || [];
        const rating = history.filter(row => row.date <= match.Publish_Date).pop();
        if (rating && rating.elo > (slayers.get(winner) ?? -Infinity)) slayers.set(winner, rating.elo);
    });
    const selection = new Set(selectedPlayers);
    const award = (title, scores, format, empty) => {
        const eligible = [...scores].filter(([name]) => !selection.size || selection.has(name));
        const best = Math.max(0, ...eligible.map(([, score]) => score));
        const names = best > 0 ? eligible.filter(([, score]) => score === best).map(([name]) => name).sort((a, b) => a.localeCompare(b)) : [];
        return { title, names, detail: names.length ? format(best) : empty };
    };
    return { from, to, scope: selection.size ? 'Selected players' : 'Club-wide awards', awards: [
        award('🚀 The Rocket', gains, n => `+${n} Elo`, 'No Elo gains'),
        award('📉 The Tilt', drops, n => `−${n} Elo`, 'No Elo drops'),
        award('🗡️ Giant Slayer', slayers, n => `Defeated a ${n} Elo opponent`, 'No rated wins'),
        award('🛡️ Gladiator', games, n => `${n} matches played`, 'No completed matches'),
        award('🔥 On Fire', streaks, n => `${n} consecutive wins`, 'No active win streak')
    ] };
}

export function renderRecap(container, recap) {
    container.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = 'Biweekly Recap';
    const description = document.createElement('p');
    description.textContent = `${recap.from} – ${recap.to} · ${recap.scope} · Elo: first to last rating within this period`;
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
    note.textContent = 'Ties share awards. Opponent Elo uses the latest in-period rating published by match date. Same-day games follow source order. Streaks count only this period.';
    container.append(heading, description, cards, note);
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
    link.download = `asv-recap-${recap.from}-${recap.to}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}
