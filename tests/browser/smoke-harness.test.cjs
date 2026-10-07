'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { test } = require('node:test');
const {
    assertOnlyExpectedStartupFailure,
    cleanupBrowserHarness,
    closeServerBounded,
    stopChildProcessTree,
    trackServerConnections,
} = require('./smoke-harness.cjs');

function listen(server){
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve(server.address()));
    });
}

test('closeServerBounded closes an idle server without forcing connections', async () => {
    const server = http.createServer((req, res) => res.end('ok'));
    const sockets = trackServerConnections(server);
    await listen(server);

    const result = await closeServerBounded(server, {
        sockets,
        graceMs: 100,
        forceMs: 100,
    });

    assert.deepEqual(result, { forced: false, timedOut: false });
    assert.equal(server.listening, false);
});

test('closeServerBounded force-closes an active response instead of hanging forever', async t => {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write('held-open');
    });
    const sockets = trackServerConnections(server);
    const address = await listen(server);
    let request;

    t.after(() => {
        if (request) request.destroy();
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        for (const socket of sockets) socket.destroy();
    });

    await new Promise((resolve, reject) => {
        request = http.get({
            host: '127.0.0.1',
            port: address.port,
            path: '/',
        }, response => {
            response.once('data', () => resolve());
            response.once('error', reject);
        });
        request.once('error', reject);
    });

    const result = await closeServerBounded(server, {
        sockets,
        graceMs: 20,
        forceMs: 250,
    });

    assert.equal(result.forced, true);
    assert.equal(result.timedOut, false);
    assert.equal(server.listening, false);
});

test('cleanupBrowserHarness continues teardown when WebDriver session deletion fails', async () => {
    const server = http.createServer((req, res) => res.end('ok'));
    const sockets = trackServerConnections(server);
    await listen(server);
    const phases = [];
    const warnings = [];

    const result = await cleanupBrowserHarness({
        sessionId: 'test-session',
        deleteSession: () => Promise.reject(new Error('simulated delete failure')),
        server,
        sockets,
        onPhase: phase => phases.push(phase),
        onWarning: warning => warnings.push(warning),
        sessionDeleteTimeoutMs: 20,
        serverGraceMs: 100,
        serverForceMs: 100,
    });

    assert.equal(result.sessionDeleteFailed, true);
    assert.deepEqual(phases, ['session-delete', 'driver-stop', 'server-close']);
    assert.equal(warnings.some(message => message.includes('simulated delete failure')), true);
    assert.equal(server.listening, false);
});

test('cleanupBrowserHarness bounds a WebDriver session deletion that never settles', async () => {
    const server = http.createServer((req, res) => res.end('ok'));
    const sockets = trackServerConnections(server);
    await listen(server);
    const warnings = [];
    const started = Date.now();

    const result = await cleanupBrowserHarness({
        sessionId: 'stuck-session',
        deleteSession: () => new Promise(() => {}),
        server,
        sockets,
        onWarning: warning => warnings.push(warning),
        sessionDeleteTimeoutMs: 20,
        serverGraceMs: 100,
        serverForceMs: 100,
    });

    assert.equal(result.sessionDeleteFailed, true);
    assert.equal(Date.now() - started < 500, true);
    assert.equal(warnings.some(message => message.includes('Timed out deleting WebDriver session')), true);
    assert.equal(server.listening, false);
});

test('assertOnlyExpectedStartupFailure accepts only the injected marker', () => {
    const logs = [{ level: 'SEVERE', message: 'Uncaught Error: EXPECTED_MARKER' }];
    const matched = assertOnlyExpectedStartupFailure({
        externalLogs: [],
        applicationLogs: logs,
        marker: 'EXPECTED_MARKER',
    });

    assert.equal(matched.length, 1);
});

test('assertOnlyExpectedStartupFailure rejects a missing marker', () => {
    assert.throws(() => assertOnlyExpectedStartupFailure({
        externalLogs: [],
        applicationLogs: [],
        marker: 'EXPECTED_MARKER',
    }), /did not observe expected startup marker/);
});

test('assertOnlyExpectedStartupFailure rejects unrelated application errors', () => {
    assert.throws(() => assertOnlyExpectedStartupFailure({
        externalLogs: [],
        applicationLogs: [
            { level: 'SEVERE', message: 'Uncaught Error: EXPECTED_MARKER' },
            { level: 'SEVERE', message: 'Uncaught Error: unrelated' },
        ],
        marker: 'EXPECTED_MARKER',
    }), /unrelated application\/browser errors/);
});

test('assertOnlyExpectedStartupFailure rejects external failures even when the marker is present', () => {
    assert.throws(() => assertOnlyExpectedStartupFailure({
        externalLogs: [{ level: 'SEVERE', message: 'cdn.example.test failed' }],
        applicationLogs: [{ level: 'SEVERE', message: 'Uncaught Error: EXPECTED_MARKER' }],
        marker: 'EXPECTED_MARKER',
    }), /critical external browser errors/);
});

test('stopChildProcessTree kills a stubborn detached process group on POSIX', {
    skip: process.platform === 'win32',
}, async t => {
    const descendantScript = 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);';
    const parentScript = [
        'const { spawn } = require("child_process");',
        `spawn(process.execPath, ["-e", ${JSON.stringify(descendantScript)}], { stdio: "ignore" });`,
        'process.on("SIGTERM", () => {});',
        'setInterval(() => {}, 1000);',
    ].join(' ');
    const child = spawn(process.execPath, ['-e', parentScript], {
        detached: true,
        stdio: 'ignore',
    });

    t.after(() => {
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch (_) {}
    });

    await new Promise(resolve => setTimeout(resolve, 75));
    const result = await stopChildProcessTree(child, {
        termMs: 25,
        killMs: 500,
    });

    assert.equal(result.forced, true);
    assert.equal(result.timedOut, false);
});
