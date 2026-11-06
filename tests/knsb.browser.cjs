const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

(async () => {
    const root = path.resolve(__dirname, '..');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'asv-knsb-chrome-'));
    let failData = false, chrome, socket;
    const groupRequests = [];
    const errors = [];
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (/^\/data\/knsb\/divisions\/\d+\.json$/.test(pathname)) groupRequests.push(pathname);
        if (failData && pathname.startsWith('/data/knsb/divisions/')) { response.writeHead(503); response.end(); return; }
        const file = path.resolve(root, `.${decodeURIComponent(pathname)}`);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
        response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'text/html');
        response.end(fs.readFileSync(file));
    });
    try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const url = `http://127.0.0.1:${server.address().port}/knsb.html`;
        chrome = spawn(process.env.CHROME_BIN || '/usr/bin/google-chrome', ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
        const endpoint = await new Promise((resolve, reject) => {
            let stderr = '';
            const timeout = setTimeout(() => reject(new Error(`Chrome startup timed out: ${stderr.slice(-1000)}`)), 15000);
            chrome.on('error', reject);
            chrome.stderr.on('data', chunk => {
                stderr += chunk;
                const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
                if (match) { clearTimeout(timeout); resolve(match[1]); }
            });
        });
        socket = new WebSocket(endpoint);
        await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
        let sequence = 0, sessionId;
        const pending = new Map();
        socket.on('message', raw => {
            const message = JSON.parse(raw);
            if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description || ''));
            if (!message.id) return;
            const waiter = pending.get(message.id);
            if (!waiter) return;
            pending.delete(message.id);
            clearTimeout(waiter.timeout);
            if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
        });
        function send(method, params = {}, session = sessionId) {
            return new Promise((resolve, reject) => {
                const id = ++sequence;
                const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
                pending.set(id, { resolve, reject, timeout });
                socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }));
            });
        }
        async function evaluate(expression) {
            const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
            if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
            return result.result.value;
        }
        async function waitFor(expression) {
            const deadline = Date.now() + 10000;
            while (Date.now() < deadline) {
                if (await evaluate(expression)) return;
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            throw new Error(`Page condition timed out: ${expression}; ${JSON.stringify(await evaluate('({ url: location.href, status: document.querySelector("#loadStatus")?.textContent, title: document.title })'))}; ${errors.join('; ')}`);
        }
        const target = await send('Target.createTarget', { url: 'about:blank' }, null);
        sessionId = (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true }, null)).sessionId;
        await send('Runtime.enable');
        await send('Page.enable');
        await send('Emulation.setDeviceMetricsOverride', { width: 1365, height: 1000, deviceScaleFactor: 1, mobile: false });
        await send('Page.navigate', { url });
        const ready = '!document.querySelector("#groupContent").hidden';
        await waitFor(`document.querySelector('#dashboard') && ${ready}`);
        assert.equal(await evaluate('document.querySelectorAll("#standings tbody tr").length'), 10);
        assert.equal(await evaluate('document.querySelector("#teamSelect").dataset.team'), '7123');
        assert.equal(await evaluate('document.querySelectorAll("#calendar .fixture").length'), 9);
        assert.match(await evaluate('document.querySelector("#calendar .next-fixture").textContent'), /Almelo 2/);
        assert.deepEqual(groupRequests, ['/data/knsb/divisions/669.json'], 'Initial visit downloads only the selected group');
        async function clickWithMouse(selector) {
            const point = await evaluate(`(() => { const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: rect.left + Math.min(20, rect.width / 2), y: rect.top + rect.height / 2 }; })()`);
            await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
        }
        await clickWithMouse('#teamSelect');
        assert.equal(await evaluate('document.querySelector("#teamSelect").value'), '', 'Opening starts a fresh query without deleting the selected team');
        assert.equal(await evaluate('document.querySelectorAll("[data-team-option]").length'), 80);
        await send('Input.insertText', { text: 'Hoogland 1' });
        assert.equal(await evaluate('document.querySelectorAll("[data-team-option]").length'), 1, 'Typing immediately filters the complete list');
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Home', code: 'Home', windowsVirtualKeyCode: 36, nativeVirtualKeyCode: 36 });
        assert.equal(await evaluate('document.querySelector("#teamSelect").selectionStart'), 0, 'Text editing keys keep their native behavior');
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
        assert.equal(await evaluate('document.querySelector("#teamSelect").value'), 'ASV 4', 'Cancelling preserves the committed selection');
        await clickWithMouse('#teamPickerToggle');
        assert.equal(await evaluate('document.querySelectorAll("[data-team-option]").length'), 80);
        assert.equal(await evaluate('document.querySelector("#teamSelect").getAttribute("aria-expanded")'), 'true');
        await clickWithMouse('#teamPickerToggle');
        assert.equal(await evaluate('document.querySelector("#teamSelect").getAttribute("aria-expanded")'), 'false');
        assert.deepEqual(groupRequests, ['/data/knsb/divisions/669.json'], 'Browsing options does not change the team or download data');
        async function openView(view) {
            await evaluate(`document.querySelector('#tab-${view}').click()`);
            assert.equal(await evaluate(`document.querySelector('#view-${view}').hidden`), false);
            assert.equal(await evaluate('document.querySelectorAll("[role=tabpanel]:not([hidden])").length'), 1);
        }
        assert.equal(await evaluate('document.querySelector("#view-team").hidden'), false);
        assert.equal(await evaluate('document.querySelector("#calendarSection").tagName'), 'SECTION');
        assert.equal(await evaluate('document.querySelector("#calendarSection summary")'), null);
        assert(await evaluate('document.querySelector("#calendar .fixture").getBoundingClientRect().height > 0'));
        assert.equal(await evaluate('document.querySelectorAll("#teamOverview [data-kind], #teamOverview [data-match]").length'), 0);
        assert.equal(await evaluate('document.querySelector("#playersSection").open'), true);
        await evaluate('document.querySelector("#playersSection summary").click()');
        assert.equal(await evaluate('document.querySelector("#playersSection").open'), false);
        await evaluate('document.querySelector("#playersSection summary").click()');
        async function pickTeam(id) {
            await evaluate(`document.querySelector('#teamSelect').focus(); document.querySelector('#teamSelect').click(); document.querySelector('#teamSelect').value = ''; document.querySelector('#teamSelect').dispatchEvent(new Event('input')); document.querySelector('[data-team-option="${id}"]').click()`);
            await waitFor(`${ready} && document.querySelector('#teamSelect').dataset.team === '${id}'`);
        }
        await clickWithMouse('#teamSelect');
        assert.equal(await evaluate('document.querySelector("#teamSelect").getAttribute("aria-expanded")'), 'true');
        assert.equal(await evaluate(`document.querySelectorAll('[data-team-option][data-asv="true"]').length`), 9);
        await evaluate('document.querySelector("#teamSelect").value="ASV 1"; document.querySelector("#teamSelect").dispatchEvent(new Event("input"))');
        assert.equal(await evaluate('document.querySelectorAll("[data-team-option]").length'), 1);
        await evaluate('document.querySelector("#teamSelect").value="nothingmatches"; document.querySelector("#teamSelect").dispatchEvent(new Event("input"))');
        assert.equal(await evaluate('document.querySelectorAll("[data-team-option]").length'), 0);
        assert.match(await evaluate('document.querySelector("#searchStatus").textContent'), /No teams found/);
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
        assert.equal(await evaluate('document.querySelector("#teamSelect").value'), 'ASV 4');
        assert.equal(await evaluate('document.querySelector("#teamSelect").getAttribute("aria-expanded")'), 'false');
        await evaluate('document.querySelector("#teamSelect").click(); document.querySelector("#teamSelect").value="ASV 1"; document.querySelector("#teamSelect").dispatchEvent(new Event("input"))');
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown' });
        assert.equal(await evaluate('document.querySelector("#teamSelect").getAttribute("aria-activedescendant")'), 'team-option-7023');
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter' });
        await waitFor(`${ready} && document.querySelector('#teamSelect').dataset.team === '7023'`);
        assert.equal(await evaluate('document.querySelector("#teamPopup").hidden'), true);
        const playerCatalog = JSON.parse(fs.readFileSync(path.join(root, 'data/knsb/catalog.json')));
        const searchPlayer = playerCatalog.players.find(player => player.team_id === '7023');
        await openView('standings');
        await evaluate(`document.querySelector('#teamSelect').click(); document.querySelector('#teamSelect').value = ${JSON.stringify(searchPlayer.name)}; document.querySelector('#teamSelect').dispatchEvent(new Event('input'))`);
        assert(await evaluate(`!!document.querySelector('[data-search-player="${searchPlayer.id}"][data-team-option="7023"]')`));
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter' });
        await waitFor(`document.querySelector('#players .searched-player [data-player="${searchPlayer.id}"]') && ${ready}`);
        assert.equal(await evaluate('document.querySelector("#view-team").hidden'), false);
        assert.equal(await evaluate('document.activeElement.dataset.player'), searchPlayer.id);
        assert.equal(await evaluate('document.querySelector("#playerDialog").open'), false);
        await pickTeam('7123');
        assert.equal(await evaluate('document.querySelector(".searched-player")'), null);
        await evaluate('document.querySelector("#favoriteButton").click()');
        await send('Page.reload');
        await waitFor(`document.querySelector('#dashboard') && ${ready}`);
        assert.equal(await evaluate('document.querySelector("#favoriteButton").getAttribute("aria-pressed")'), 'true');
        await openView('standings');
        assert.equal(await evaluate('document.querySelector("#standings th:nth-child(6)").getBoundingClientRect().width'), 0);
        await send('Page.reload');
        await waitFor(`document.querySelector('#dashboard') && ${ready}`);
        assert.equal(await evaluate('document.querySelector("#view-standings").hidden'), false, 'Shared view survives reload');
        await evaluate('document.querySelector("#tab-standings").focus()');
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
        assert.equal(await evaluate('document.querySelector("#tab-team").getAttribute("aria-selected")'), 'true');
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft' });
        assert.equal(await evaluate('document.querySelector("#tab-standings").getAttribute("aria-selected")'), 'true');
        await evaluate('document.querySelector("#performanceToggle").click()');
        assert(await evaluate('document.querySelector("#standings th:nth-child(6)").getBoundingClientRect().width > 0'));
        await evaluate('document.querySelector("[data-sort=rating]").click()');
        assert.equal(await evaluate('document.querySelector("[data-sort=rating]").closest("th").getAttribute("aria-sort")'), 'descending');
        await evaluate('document.querySelector("#performanceToggle").click()');
        assert.equal(await evaluate('document.querySelector("[data-sort=rating]").closest("th").hasAttribute("aria-sort")'), false);
        assert.equal(await evaluate('document.querySelector("#tab-compare")'), null);
        assert.equal(await evaluate('document.querySelectorAll("[role=tab]").length'), 2);
        await evaluate(`window.standingsNode = document.querySelector('#standings tbody tr'); document.querySelector('#standings [data-compare-team="7126"]').click()`);
        assert.equal(await evaluate('document.querySelector("#teamSelect").dataset.team'), '7123', 'Opening an encounter keeps the reference team');
        assert.equal(await evaluate('document.querySelector("#view-standings").hidden'), false);
        assert.equal(await evaluate('document.querySelector("#matchDialog").open'), true);
        assert.equal(await evaluate('window.standingsNode === document.querySelector("#standings tbody tr")'), true, 'Encounter preview does not rebuild standings');
        assert.equal(await evaluate('document.querySelectorAll("#matchContent tbody tr").length'), 8);
        assert.match(await evaluate('document.querySelector("#matchContent").textContent'), /1,755/);
        assert.match(await evaluate('document.querySelector("#matchContent .table-note").textContent'), /ASV 4 \(1,895 Elo\) − Hoogland 1 \(1,954 Elo\)/);
        assert.match(await evaluate('document.querySelector("#matchContent thead").textContent'), /Rating gap/);
        assert.equal(await evaluate('document.querySelector("#matchContent tbody tr td:last-child").textContent'), '-72', 'Away team rating gap uses the selected team perspective');
        assert.match(await evaluate('document.querySelector("#matchContent th:last-child").title'), /ASV 4.*Hoogland 1/);
        assert.equal(await evaluate('document.querySelector("#matchContent .encounter-status")'), null, 'Played encounters show actual lineups');
        const encounterStyles = () => evaluate(`(() => {
            const selectors = ['#matchTitle', '#matchContent', '#matchContent .dialog-meta', '#matchContent .table-note', '.encounter-table th', '.encounter-table td', '.encounter-table .player-link', '.encounter-table small', '.encounter-result'];
            return selectors.map(selector => {
                const style = getComputedStyle(document.querySelector(selector));
                return [style.fontSize, style.lineHeight, style.padding, style.margin, style.gap];
            });
        })()`);
        const playedDesktopStyles = await encounterStyles();
        assert(await evaluate('document.querySelectorAll(".encounter-win, .encounter-loss").length > 0'), 'Played results keep their outcome styles');

        await evaluate('document.querySelector("#matchContent [data-player]").click()');
        assert.equal(await evaluate('document.querySelector("#playerDialog").open'), true);
        assert(await evaluate('document.querySelectorAll("#playerContent tbody tr").length > 0'));
        await evaluate('document.querySelector("#closePlayer").click(); document.querySelector("#closeMatch").click()');
        assert.equal(await evaluate('document.querySelector("#matchDialog").open'), false);
        await openView('team');
        const referenceBeforePreview = await evaluate('document.querySelector("#teamSelect").dataset.team');
        const opponentBeforePreview = await evaluate('new URL(location.href).searchParams.get("against")');
        assert.match(await evaluate('document.querySelector("#calendar .next-fixture .encounter-action").textContent'), /Compare/);
        await evaluate('document.querySelector("#calendar .next-fixture .encounter-action").click()');
        assert.equal(await evaluate('document.querySelector("#matchDialog").open'), true);
        assert.match(await evaluate('document.querySelector("#matchContent .encounter-status").textContent'), /reference lineups, not confirmed/);
        assert.equal(await evaluate('document.querySelectorAll("#matchContent .lineup-table tbody tr").length'), 8);
        assert.equal(await evaluate('document.querySelector("#matchContent .comparison-metrics")'), null);
        assert.match(await evaluate('document.querySelector("#matchContent .table-note").textContent'), /Rating gap: ASV 4 \(.* Elo\) − Almelo 2 \(.* Elo\)/);
        assert.match(await evaluate('document.querySelector("#matchContent thead").textContent'), /Board.*Result.*Rating gap/);
        assert.equal(await evaluate('document.querySelectorAll("#matchContent tbody strong").length'), 8);
        assert.deepEqual(await encounterStyles(), playedDesktopStyles, 'View and Compare share desktop typography and spacing');
        assert.equal(await evaluate('document.querySelectorAll(".encounter-win, .encounter-loss").length'), 0, 'Reference lineups have no outcome colors');


        assert.match(await evaluate('document.querySelector("#matchTitle").textContent'), /ASV 4.*Almelo 2/);
        assert.equal(await evaluate('document.querySelector("#teamSelect").dataset.team'), referenceBeforePreview);
        assert.equal(await evaluate('new URL(location.href).searchParams.get("against")'), opponentBeforePreview, 'Encounter preview does not replace comparison selections');
        assert.equal(await evaluate('document.querySelector("#view-team").hidden'), false, 'Preview leaves the calendar in place');
        await evaluate('document.querySelector("#closeMatch").click()');
        await evaluate('document.querySelector("#calendar .next-fixture .fixture-opponent [data-match]").click()');
        assert.equal(await evaluate('document.querySelector("#matchDialog").open'), true, 'Calendar names open the same encounter preview');
        assert.equal(await evaluate('document.querySelector("#view-team").hidden'), false);
        await evaluate('document.querySelector("#closeMatch").click()');
        assert.equal(await evaluate('document.querySelectorAll("[role=combobox]").length'), 1, 'Only the reference team has a combo');
        await evaluate('window.scrollTo(0,0)');
        const desktop = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync('/tmp/asv-knsb-desktop.png', Buffer.from(desktop.data, 'base64'));
        await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'Page must fit mobile width');
        await openView('team');
        await evaluate('document.querySelector("#calendar .next-fixture .encounter-action").click()');
        assert.equal(await evaluate('Math.round(document.querySelector("#matchDialog").getBoundingClientRect().width)'), 390, 'Encounter preview uses the full mobile screen');
        assert.equal(await evaluate('document.querySelector("#matchDialog").scrollWidth <= document.querySelector("#matchDialog").clientWidth'), true);
        const previewMobileStyles = await encounterStyles();
        await evaluate('document.querySelector("#closeMatch").click(); document.querySelector("#calendar .encounter-cue").closest("button").click()');
        assert.deepEqual(await encounterStyles(), previewMobileStyles, 'View and Compare share mobile typography and spacing');
        assert.equal(await evaluate('document.querySelector("#matchDialog").scrollWidth <= document.querySelector("#matchDialog").clientWidth'), true, 'Played encounters also fit mobile width');

        await evaluate('document.querySelector("#closeMatch").click()');
        await evaluate('document.querySelector("#favorites [data-team]").click()');
        const mobile = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync('/tmp/asv-knsb-mobile.png', Buffer.from(mobile.data, 'base64'));
        await pickTeam('7126');
        assert.equal(await evaluate('new URL(location.href).searchParams.get("team")'), '7126');
        const allAsv = JSON.parse(fs.readFileSync(path.join(root, 'data/knsb/catalog.json'))).teams.filter(team => team.is_asv);
        for (const entry of allAsv) {
            await pickTeam(entry.id);
            assert.equal(await evaluate('document.querySelector("#teamSelect").value'), entry.name);
        }
        await pickTeam('7023');
        await waitFor(`${ready} && document.querySelector('#teamSelect').dataset.team === '7023'`);
        await evaluate('document.querySelector("#favoriteButton").click()');
        await pickTeam('7123');
        await waitFor(`${ready} && document.querySelector('#teamSelect').dataset.team === '7123'`);
        assert.equal(await evaluate('document.querySelectorAll("#favorites button").length'), 2, 'Favorites span groups');
        const before = groupRequests.length;
        await evaluate(`document.querySelector('#favorites [data-team="7023"]').click()`);
        await waitFor(`${ready} && document.querySelector('#teamSelect').dataset.team === '7023'`);
        assert.equal(groupRequests.length, before, 'Previously visited groups are reused');
        await send('Page.reload');
        await waitFor(`document.querySelector('#groupContent') && ${ready}`);
        assert.equal(await evaluate('document.querySelector("#teamSelect").value'), 'ASV 1', 'Shared URL restores a different group');
        failData = true;
        await send('Page.reload');
        await waitFor('document.querySelector("#loadStatus button") !== null');
        assert.equal(await evaluate('document.querySelector("#groupContent").hidden'), true);
        failData = false;
        await evaluate('document.querySelector("#loadStatus button").click()');
        await waitFor(ready);
        await send('Page.addScriptToEvaluateOnNewDocument', { source: 'Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage unavailable"); } });' });
        await send('Page.reload');
        await waitFor(`document.querySelector('#dashboard') && ${ready}`);
        await evaluate('document.querySelector("#favoriteButton").click()');
        assert.deepEqual(errors, []);
        console.log('KNSB Chrome checks passed: favorites, sorting, comparison, encounters, mobile layout, shared URLs, retry and unavailable storage');
    } finally {
        if (socket) socket.close();
        if (chrome && chrome.exitCode === null) {
            const exited = new Promise(resolve => chrome.once('exit', resolve));
            chrome.kill();
            await exited;
        }
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(profile, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
