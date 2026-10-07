'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const {
    assertOnlyExpectedStartupFailure,
    cleanupBrowserHarness,
    terminateProcessTree,
    trackServerConnections,
} = require('./smoke-harness.cjs');

const ROOT = process.cwd();
const DRIVER_HOST = '127.0.0.1';
const DRIVER_PORT = Number(process.env.CHROMEDRIVER_PORT || 9515);
const DRIVER_URL = `http://${DRIVER_HOST}:${DRIVER_PORT}`;
const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';
const DEFAULT_WAIT_MS = 12000;
const INJECT_STARTUP_FAILURE = process.env.M0E4_INJECT_STARTUP_FAILURE === '1';
const STARTUP_FAILURE_MARKER = 'M0E4_INJECTED_STARTUP_FAILURE';
const parsedHarnessTimeoutMs = Number(process.env.M0E4_BROWSER_SMOKE_TIMEOUT_MS || 90000);
const HARNESS_TIMEOUT_MS = Number.isFinite(parsedHarnessTimeoutMs) && parsedHarnessTimeoutMs > 0
    ? parsedHarnessTimeoutMs
    : 90000;

const optionalExternalHosts = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'www.googletagmanager.com',
    'www.google-analytics.com',
];

const harnessStartedAt = Date.now();
let currentPhase = 'bootstrap';
let activeServer;
let activeSockets;
let activeDriver;

function setPhase(phase){
    currentPhase = phase;
    const elapsed = Date.now() - harnessStartedAt;
    console.log(`[M0E4 browser smoke] phase=${phase} elapsed_ms=${elapsed}`);
}

function emergencyCleanup(){
    if (activeDriver && activeDriver.child) {
        terminateProcessTree(activeDriver.child, 'SIGKILL');
    }
    if (activeServer) {
        try {
            if (typeof activeServer.closeAllConnections === 'function') activeServer.closeAllConnections();
        }
        catch (_) {}
        if (activeSockets) {
            for (const socket of activeSockets) {
                try { socket.destroy(); }
                catch (_) {}
            }
        }
        try { activeServer.close(); }
        catch (_) {}
    }
}

const watchdog = setTimeout(() => {
    console.error(`[M0E4 browser smoke] watchdog timeout after ${HARNESS_TIMEOUT_MS} ms in phase=${currentPhase}`);
    emergencyCleanup();
    process.exit(124);
}, HARNESS_TIMEOUT_MS);
watchdog.unref();

function delay(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
}

function mimeType(file){
    switch (path.extname(file).toLowerCase()) {
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

        if (requestUrl.pathname === '/__m0e4_uncaught_probe.html') {
            res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
            });
            res.end('<!doctype html><title>M0E4 probe</title><script>throw new Error("M0E4_UNCAUGHT_PROBE");</script>');
            return;
        }

        let rel = decodeURIComponent(requestUrl.pathname);
        if (rel === '/') rel = '/index.html';
        rel = rel.replace(/^\/+/, '');

        const file = path.resolve(ROOT, rel);
        const rootPrefix = `${path.resolve(ROOT)}${path.sep}`;
        if (!file.startsWith(rootPrefix)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        fs.readFile(file, (error, data) => {
            if (error) {
                res.writeHead(error.code === 'ENOENT' ? 404 : 500);
                res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
                return;
            }
            let responseBody = data;
            if (INJECT_STARTUP_FAILURE && rel === 'index.html') {
                const html = data.toString('utf8');
                const mainScript = '<script src="evolve/main.js" type="module"></script>';
                if (!html.includes(mainScript)) {
                    res.writeHead(500);
                    res.end('Unable to inject the M0E4 startup-failure control before the main game module.');
                    return;
                }
                responseBody = Buffer.from(html.replace(
                    mainScript,
                    `<script>throw new Error("${STARTUP_FAILURE_MARKER}");</script>\n    ${mainScript}`
                ));
            }

            res.writeHead(200, {
                'Content-Type': mimeType(file),
                'Cache-Control': 'no-store',
            });
            res.end(responseBody);
        });
    });
    const sockets = trackServerConnections(server);

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, DRIVER_HOST, () => {
            const address = server.address();
            resolve({
                server,
                sockets,
                baseUrl: `http://${DRIVER_HOST}:${address.port}`,
            });
        });
    });
}

function blockingExternalScripts(){
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const urls = [];
    const scriptRe = /<script\b([^>]*)\bsrc=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = scriptRe.exec(html)) !== null) {
        const attrs = match[1] || '';
        const src = match[2];
        if (/^https?:\/\//i.test(src) && !/\basync\b/i.test(attrs) && !/\bdefer\b/i.test(attrs)) {
            urls.push(src);
        }
    }
    return urls;
}

async function preflightExternalBootstrap(urls){
    await Promise.all(urls.map(async url => {
        let lastError;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    signal: AbortSignal.timeout(10000),
                    headers: { 'user-agent': 'Evolve-M0E4-browser-smoke' },
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                await response.arrayBuffer();
                return;
            }
            catch (error) {
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
    ], {
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', chunk => { output += chunk.toString(); });
    child.stderr.on('data', chunk => { output += chunk.toString(); });

    return { child, output: () => output };
}

async function webdriver(method, endpoint, body, timeoutMs = 15000){
    const response = await fetch(`${DRIVER_URL}${endpoint}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json().catch(() => ({}));
    const value = payload.value;
    if (!response.ok || (value && value.error)) {
        const message = value && value.message ? value.message : `${response.status} ${response.statusText}`;
        const error = new Error(`WebDriver ${method} ${endpoint}: ${message}`);
        error.webdriver = value;
        throw error;
    }
    return value;
}

async function waitForDriver(processInfo){
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        if (processInfo.child.exitCode !== null) {
            throw new Error(`ChromeDriver exited before becoming ready.\n${processInfo.output()}`);
        }
        try {
            const status = await webdriver('GET', '/status');
            if (status && status.ready !== false) return;
        }
        catch (_) {
            // Driver is still starting.
        }
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
                'goog:loggingPrefs': {
                    browser: 'ALL',
                },
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
    while (Date.now() < deadline) {
        try {
            const elementId = await findElement(sessionId, selector);
            if (await isDisplayed(sessionId, elementId)) return elementId;
        }
        catch (error) {
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

async function browserLogs(sessionId){
    try {
        return await webdriver('POST', `/session/${sessionId}/se/log`, { type: 'browser' });
    }
    catch (firstError) {
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

function classifySevereLogs(logs, criticalExternalUrls){
    const severe = logs.filter(log => String(log.level).toUpperCase() === 'SEVERE');
    const ignored = severe.filter(isOptionalExternalLog);
    const relevant = severe.filter(log => !isOptionalExternalLog(log));
    const external = relevant.filter(log => criticalExternalUrls.some(url => String(log.message || '').includes(new URL(url).host)));
    const application = relevant.filter(log => !external.includes(log));
    return { ignored, external, application };
}

function formatLogs(logs){
    return logs.map(log => `[${log.level}] ${log.message}`).join('\n');
}

async function verifyUncaughtExceptionDetection(sessionId, baseUrl, criticalExternalUrls){
    await setUrl(sessionId, `${baseUrl}/__m0e4_uncaught_probe.html`);
    await delay(250);
    const logs = await browserLogs(sessionId);
    const { application } = classifySevereLogs(logs, criticalExternalUrls);
    const sawProbe = application.some(log => String(log.message || '').includes('M0E4_UNCAUGHT_PROBE'));
    if (!sawProbe) {
        throw new Error(`Browser smoke harness did not detect the deliberate uncaught startup exception. Browser logs:\n${formatLogs(logs)}`);
    }
}

async function run(){
    setPhase('artifact-check');
    for (const required of ['index.html', 'evolve/main.js', 'evolve/evolve.css']) {
        if (!fs.existsSync(path.join(ROOT, required))) {
            throw new Error(`Missing built artifact ${required}. Run npm run build before npm run test:browser.`);
        }
    }

    const criticalExternalUrls = blockingExternalScripts();
    if (criticalExternalUrls.length === 0) {
        throw new Error('Expected at least one blocking external bootstrap script in index.html; update the M0E4 smoke assumptions.');
    }

    setPhase('external-preflight');
    await preflightExternalBootstrap(criticalExternalUrls);

    setPhase('static-server-start');
    const { server, sockets, baseUrl } = await startStaticServer();
    activeServer = server;
    activeSockets = sockets;

    setPhase('driver-start');
    const driver = startChromeDriver();
    activeDriver = driver;
    let sessionId;

    try {
        setPhase('driver-ready');
        await waitForDriver(driver);

        setPhase('session-create');
        sessionId = await createSession();

        setPhase('network-config');
        await cdp(sessionId, 'Network.enable');
        await cdp(sessionId, 'Network.setBlockedURLs', {
            urls: optionalExternalHosts.flatMap(host => [`*://${host}/*`]),
        });

        setPhase('uncaught-probe');
        await verifyUncaughtExceptionDetection(sessionId, baseUrl, criticalExternalUrls);

        setPhase('game-navigation');
        await setUrl(sessionId, `${baseUrl}/`);

        if (INJECT_STARTUP_FAILURE) {
            setPhase('negative-control-observation');
            await delay(250);
            const logs = await browserLogs(sessionId);
            const { external, application } = classifySevereLogs(logs, criticalExternalUrls);
            assertOnlyExpectedStartupFailure({
                externalLogs: external,
                applicationLogs: application,
                marker: STARTUP_FAILURE_MARKER,
            });
            const error = new Error(`M0E4_NEGATIVE_CONTROL_CONFIRMED: detected ${STARTUP_FAILURE_MARKER} with no unrelated severe browser errors.`);
            error.negativeControlConfirmed = true;
            throw error;
        }

        setPhase('ui-smoke');
        await waitForDisplayed(sessionId, '#mainColumn');
        await waitForDisplayed(sessionId, '#mainTabs');
        await waitForDisplayed(sessionId, '#evolution-rna a.button');

        const initialDna = await findElements(sessionId, '#evolution-dna a.button');
        if (initialDna.length !== 0) {
            throw new Error('Fresh browser profile unexpectedly started with the DNA evolution action already unlocked.');
        }

        await click(sessionId, '#evolution-rna a.button');
        await click(sessionId, '#evolution-rna a.button');
        await waitForDisplayed(sessionId, '#evolution-dna a.button');
        await delay(300);

        setPhase('browser-log-check');
        const logs = await browserLogs(sessionId);
        const { external, application } = classifySevereLogs(logs, criticalExternalUrls);

        if (external.length > 0) {
            throw new Error(`Critical external bootstrap failure in the real browser:\n${formatLogs(external)}`);
        }
        if (application.length > 0) {
            throw new Error(`Application/browser failure in the real browser:\n${formatLogs(application)}`);
        }

        console.log('M0E4 browser smoke passed: real Chrome booted the built game, rendered fresh evolution UI, and RNA interaction unlocked DNA.');
    }
    catch (error) {
        if (error && error.negativeControlConfirmed) {
            throw error;
        }
        if (sessionId) {
            setPhase('failure-diagnostics');
            const logs = await browserLogs(sessionId).catch(() => []);
            const { external, application } = classifySevereLogs(logs, criticalExternalUrls);
            const diagnostics = [];
            if (external.length > 0) diagnostics.push(`Critical external browser errors:\n${formatLogs(external)}`);
            if (application.length > 0) diagnostics.push(`Application/browser errors:\n${formatLogs(application)}`);
            if (diagnostics.length > 0) {
                throw new Error(`${error.message}\n\n${diagnostics.join('\n\n')}`);
            }
        }
        throw error;
    }
    finally {
        await cleanupBrowserHarness({
            sessionId,
            deleteSession: sessionId
                ? () => webdriver('DELETE', `/session/${sessionId}`, undefined, 5000)
                : undefined,
            child: driver.child,
            server,
            sockets,
            onPhase: setPhase,
            onWarning: message => console.warn(`[M0E4 browser smoke] ${message}`),
        });
        activeDriver = undefined;
        activeServer = undefined;
        activeSockets = undefined;
        setPhase('cleanup-complete');
    }
}

run()
    .catch(error => {
        console.error(error && error.stack ? error.stack : error);
        process.exitCode = 1;
    })
    .finally(() => clearTimeout(watchdog));
