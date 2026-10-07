'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = process.cwd();
const DRIVER_HOST = '127.0.0.1';
const DRIVER_PORT = Number(process.env.CHROMEDRIVER_PORT || 9515);
const DRIVER_URL = `http://${DRIVER_HOST}:${DRIVER_PORT}`;
const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';
const DEFAULT_WAIT_MS = 12000;

const optionalExternalHosts = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'www.googletagmanager.com',
    'www.google-analytics.com',
];

function delay(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function stopChildProcess(child){
    if (!child || child.exitCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    const stopped = await Promise.race([
        exited.then(() => true),
        delay(2000).then(() => false),
    ]);
    if (!stopped && child.exitCode === null){
        child.kill('SIGKILL');
        await Promise.race([exited, delay(1000)]);
    }
}

function mimeType(file){
    switch (path.extname(file).toLowerCase()){
        case '.html': return 'text/html; charset=utf-8';
        case '.js': return 'text/javascript; charset=utf-8';
        case '.css': return 'text/css; charset=utf-8';
        case '.json': return 'application/json; charset=utf-8';
        case '.ico': return 'image/x-icon';
        case '.png': return 'image/png';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.svg': return 'image/svg+xml';
        case '.woff': return 'font/woff';
        case '.woff2': return 'font/woff2';
        case '.ttf': return 'font/ttf';
        default: return 'application/octet-stream';
    }
}

function startStaticServer(){
    const server = http.createServer((req, res) => {
        const requestUrl = new URL(req.url, 'http://127.0.0.1');
        let relative = decodeURIComponent(requestUrl.pathname);
        if (relative === '/') relative = '/index.html';
        relative = relative.replace(/^\/+/, '');

        const file = path.resolve(ROOT, relative);
        const rootPrefix = `${path.resolve(ROOT)}${path.sep}`;
        if (!file.startsWith(rootPrefix)){
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        fs.readFile(file, (error, data) => {
            if (error){
                res.writeHead(error.code === 'ENOENT' ? 404 : 500);
                res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
                return;
            }
            res.writeHead(200, {
                'Content-Type': mimeType(file),
                'Cache-Control': 'no-store',
            });
            res.end(data);
        });
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, DRIVER_HOST, () => {
            resolve({ server, baseUrl: `http://${DRIVER_HOST}:${server.address().port}` });
        });
    });
}

function blockingExternalScripts(){
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const urls = [];
    const scriptRe = /<script\b([^>]*)\bsrc=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = scriptRe.exec(html)) !== null){
        const attrs = match[1] || '';
        const src = match[2];
        if (/^https?:\/\//i.test(src) && !/\basync\b/i.test(attrs) && !/\bdefer\b/i.test(attrs)){
            urls.push(src);
        }
    }
    return urls;
}

async function preflightExternalBootstrap(urls){
    await Promise.all(urls.map(async url => {
        let lastError;
        for (let attempt = 1; attempt <= 3; attempt++){
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    signal: AbortSignal.timeout(10000),
                    headers: { 'user-agent': 'Evolve-M3F4-browser-smoke' },
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                await response.arrayBuffer();
                return;
            }
            catch (error){
                lastError = error;
                if (attempt < 3) await delay(attempt * 500);
            }
        }
        throw new Error(`Critical external bootstrap dependency unavailable: ${url}\n${lastError.message}`);
    }));
}

function startChromeDriver(){
    const child = spawn(process.env.CHROMEDRIVER || 'chromedriver', [
        `--port=${DRIVER_PORT}`,
        '--allowed-origins=*',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk.toString(); });
    child.stderr.on('data', chunk => { output += chunk.toString(); });
    return { child, output: () => output };
}

async function webdriver(method, endpoint, body){
    const response = await fetch(`${DRIVER_URL}${endpoint}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json().catch(() => ({}));
    const value = payload.value;
    if (!response.ok || (value && value.error)){
        const message = value && value.message ? value.message : `${response.status} ${response.statusText}`;
        throw new Error(`WebDriver ${method} ${endpoint}: ${message}`);
    }
    return value;
}

async function waitForDriver(processInfo){
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline){
        if (processInfo.child.exitCode !== null){
            throw new Error(`ChromeDriver exited before becoming ready.\n${processInfo.output()}`);
        }
        try {
            const status = await webdriver('GET', '/status');
            if (status && status.ready !== false) return;
        }
        catch (_) {}
        await delay(150);
    }
    throw new Error(`Timed out waiting for ChromeDriver.\n${processInfo.output()}`);
}

async function createSession(){
    const value = await webdriver('POST', '/session', {
        capabilities: {
            alwaysMatch: {
                browserName: 'chrome',
                pageLoadStrategy: 'eager',
                'goog:chromeOptions': {
                    args: [
                        '--headless=new',
                        '--no-sandbox',
                        '--disable-dev-shm-usage',
                        '--window-size=1280,900',
                    ],
                },
                'goog:loggingPrefs': { browser: 'ALL' },
            },
        },
    });
    return value.sessionId;
}

async function cdp(sessionId, cmd, params = {}){
    return webdriver('POST', `/session/${sessionId}/goog/cdp/execute`, { cmd, params });
}

async function setUrl(sessionId, url){
    await webdriver('POST', `/session/${sessionId}/url`, { url });
}

async function findElement(sessionId, selector){
    const value = await webdriver('POST', `/session/${sessionId}/element`, {
        using: 'css selector',
        value: selector,
    });
    return value[ELEMENT_KEY];
}

async function findElements(sessionId, selector){
    const value = await webdriver('POST', `/session/${sessionId}/elements`, {
        using: 'css selector',
        value: selector,
    });
    return value.map(item => item[ELEMENT_KEY]);
}

async function isDisplayed(sessionId, elementId){
    return webdriver('GET', `/session/${sessionId}/element/${elementId}/displayed`);
}

async function waitForDisplayed(sessionId, selector, timeoutMs = DEFAULT_WAIT_MS){
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline){
        try {
            const elementId = await findElement(sessionId, selector);
            if (await isDisplayed(sessionId, elementId)) return elementId;
        }
        catch (error){
            lastError = error;
        }
        await delay(100);
    }
    const suffix = lastError ? ` Last WebDriver error: ${lastError.message}` : '';
    throw new Error(`Timed out waiting for visible selector: ${selector}.${suffix}`);
}

async function click(sessionId, selector){
    const elementId = await waitForDisplayed(sessionId, selector);
    await webdriver('POST', `/session/${sessionId}/element/${elementId}/click`, {});
}

async function elementText(sessionId, selector){
    const elementId = await findElement(sessionId, selector);
    return webdriver('GET', `/session/${sessionId}/element/${elementId}/text`);
}

function parseResourceAmount(text, selector){
    const match = String(text).trim().match(/^(-?\d+(?:\.\d+)?)/);
    if (!match) throw new Error(`Unable to parse resource amount from ${selector}: ${JSON.stringify(text)}`);
    return Number(match[1]);
}

async function waitForResourceAmount(sessionId, selector, expected, timeoutMs = DEFAULT_WAIT_MS){
    const deadline = Date.now() + timeoutMs;
    let lastText = '';
    while (Date.now() < deadline){
        try {
            lastText = await elementText(sessionId, selector);
            if (parseResourceAmount(lastText, selector) === expected) return;
        }
        catch (_) {}
        await delay(100);
    }
    throw new Error(`Timed out waiting for ${selector} amount ${expected}; last text=${JSON.stringify(lastText)}`);
}

async function browserLogs(sessionId){
    try {
        return await webdriver('POST', `/session/${sessionId}/se/log`, { type: 'browser' });
    }
    catch (firstError){
        try {
            return await webdriver('POST', `/session/${sessionId}/log`, { type: 'browser' });
        }
        catch (_) {
            throw firstError;
        }
    }
}

function isOptionalExternalLog(log){
    const message = String(log.message || '');
    return optionalExternalHosts.some(host => message.includes(host));
}

function formatLogs(logs){
    return logs.map(log => `[${log.level}] ${log.message}`).join('\n');
}

async function run(){
    for (const required of ['index.html', 'evolve/main.js', 'evolve/evolve.css']){
        if (!fs.existsSync(path.join(ROOT, required))){
            throw new Error(`Missing built artifact ${required}. Run npm run build before npm run test:browser.`);
        }
    }

    const criticalExternalUrls = blockingExternalScripts();
    if (criticalExternalUrls.length === 0){
        throw new Error('Expected at least one blocking external bootstrap script in index.html.');
    }
    await preflightExternalBootstrap(criticalExternalUrls);

    const { server, baseUrl } = await startStaticServer();
    const driver = startChromeDriver();
    let sessionId;

    try {
        await waitForDriver(driver);
        sessionId = await createSession();
        await cdp(sessionId, 'Network.enable');
        await cdp(sessionId, 'Network.setBlockedURLs', {
            urls: optionalExternalHosts.flatMap(host => [`*://${host}/*`]),
        });

        await setUrl(sessionId, `${baseUrl}/`);
        await waitForDisplayed(sessionId, '#mainColumn');
        await waitForDisplayed(sessionId, '#evolution-rna a.button');

        const initialDna = await findElements(sessionId, '#evolution-dna a.button');
        if (initialDna.length !== 0){
            throw new Error('Fresh browser profile unexpectedly started with the DNA evolution action already unlocked.');
        }

        await click(sessionId, '#evolution-rna a.button');
        await click(sessionId, '#evolution-rna a.button');
        await waitForDisplayed(sessionId, '#evolution-dna a.button');
        await waitForDisplayed(sessionId, '#cntRNA');
        await waitForDisplayed(sessionId, '#cntDNA');
        await waitForResourceAmount(sessionId, '#cntRNA', 2);
        await waitForResourceAmount(sessionId, '#cntDNA', 0);

        await click(sessionId, '#evolution-dna a.button');
        await waitForResourceAmount(sessionId, '#cntRNA', 0);
        await waitForResourceAmount(sessionId, '#cntDNA', 1);

        const logs = await browserLogs(sessionId);
        const severe = logs.filter(log => String(log.level).toUpperCase() === 'SEVERE' && !isOptionalExternalLog(log));
        if (severe.length > 0){
            throw new Error(`Application/browser failure after the live DNA cutover:\n${formatLogs(severe)}`);
        }

        console.log('M3F4 browser cutover proof passed: real Chrome executed DNA through the built game and observed RNA 2 -> 0, DNA 0 -> 1.');
    }
    finally {
        if (sessionId){
            await webdriver('DELETE', `/session/${sessionId}`).catch(() => {});
        }
        await stopChildProcess(driver.child);
        await new Promise(resolve => server.close(resolve));
    }
}

run().catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
});
