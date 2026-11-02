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
            throw new Error(`Page condition timed out: ${expression}`);
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
        assert.match(await evaluate(`document.querySelector('[data-kind="next"]').textContent`), /Almelo 2/);
        assert.deepEqual(groupRequests, ['/data/knsb/divisions/669.json'], 'Initial visit downloads only the selected group');
        async function openView(view) {
            await evaluate(`document.querySelector('#tab-${view}').click()`);
            assert.equal(await evaluate(`document.querySelector('#view-${view}').hidden`), false);
            assert.equal(await evaluate('document.querySelectorAll("[role=tabpanel]:not([hidden])").length'), 1);
        }
        assert.equal(await evaluate('document.querySelector("#view-team").hidden'), false);
        assert.equal(await evaluate('document.querySelector("#calendarSection").open'), false);
        assert.equal(await evaluate('document.querySelector("#playersSection").open'), false);
        await evaluate('document.querySelector("#calendarSection summary").click()');
        assert.equal(await evaluate('document.querySelector("#calendarSection").open'), true);
        await evaluate('document.querySelector("#playersSection summary").click()');
        assert.equal(await evaluate('document.querySelector("#playersSection").open'), true);
        await evaluate('document.querySelector("#calendarSection summary").click(); document.querySelector("#playersSection summary").click()');
        async function pickTeam(id) {
            await evaluate(`document.querySelector('#teamSelect').focus(); document.querySelector('#teamSelect').click(); document.querySelector('#teamSelect').value = ''; document.querySelector('#teamSelect').dispatchEvent(new Event('input')); document.querySelector('[data-team-option="${id}"]').click()`);
            await waitFor(`${ready} && document.querySelector('#teamSelect').dataset.team === '${id}'`);
        }
        await evaluate('document.querySelector("#teamSelect").focus()');
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
        await pickTeam('7123');
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
        assert.equal(await evaluate('document.querySelector("#tab-compare").getAttribute("aria-selected")'), 'true');
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft' });
        assert.equal(await evaluate('document.querySelector("#tab-standings").getAttribute("aria-selected")'), 'true');
        await evaluate('document.querySelector("#performanceToggle").click()');
        assert(await evaluate('document.querySelector("#standings th:nth-child(6)").getBoundingClientRect().width > 0'));
        await evaluate('document.querySelector("[data-sort=rating]").click()');
        assert.equal(await evaluate('document.querySelector("[data-sort=rating]").closest("th").getAttribute("aria-sort")'), 'descending');
        await evaluate('document.querySelector("#performanceToggle").click()');
        assert.equal(await evaluate('document.querySelector("[data-sort=rating]").closest("th").hasAttribute("aria-sort")'), false);
        await openView('compare');
        await evaluate('document.querySelector("#compareSelect").value="7126"; document.querySelector("#compareSelect").dispatchEvent(new Event("change"))');
        assert.equal(await evaluate('document.querySelectorAll("#comparison .lineup-table tbody tr").length'), 8);
        assert.match(await evaluate('document.querySelector("#comparison").textContent'), /Hoogland 1/);
        await evaluate(`document.querySelector('#comparison [data-match="23350"]').click()`);
        assert.equal(await evaluate('document.querySelector("#matchDialog").open'), true);
        assert.equal(await evaluate('document.querySelectorAll("#matchContent tbody tr").length'), 8);
        assert.match(await evaluate('document.querySelector("#matchContent").textContent'), /1,755/);
        await evaluate('document.querySelector("#closeMatch").click()');
        assert.equal(await evaluate('document.querySelector("#matchDialog").open'), false);
        await openView('team');
        await evaluate('document.querySelector("[data-prepare]").click()');
        assert.equal(await evaluate('document.querySelector("#compareSelect").value'), '7124');
        assert.equal(await evaluate('document.querySelector("#view-compare").hidden'), false, 'Prepare encounter opens comparison');
        assert.equal(await evaluate('document.querySelector("#view-team").hidden'), true);
        await evaluate('window.scrollTo(0,0)');
        const desktop = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync('/tmp/asv-knsb-desktop.png', Buffer.from(desktop.data, 'base64'));
        await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'Page must fit mobile width');
        await openView('team');
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
