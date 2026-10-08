'use strict';

const { spawnSync } = require('child_process');

function delay(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
}

function trackServerConnections(server){
    const sockets = new Set();
    server.on('connection', socket => {
        sockets.add(socket);
        socket.once('close', () => sockets.delete(socket));
    });
    return sockets;
}

async function closeServerBounded(server, {
    sockets = new Set(),
    graceMs = 1500,
    forceMs = 1000,
} = {}){
    if (!server) {
        return { forced: false, timedOut: false };
    }

    let settled = false;
    const closePromise = new Promise(resolve => {
        const settle = error => {
            if (settled) return;
            settled = true;
            resolve(error || null);
        };
        try {
            server.close(settle);
        }
        catch (error) {
            settle(error);
        }
    });

    async function waitForClose(timeoutMs){
        return Promise.race([
            closePromise.then(error => ({ closed: true, error })),
            delay(timeoutMs).then(() => ({ closed: false, error: null })),
        ]);
    }

    let result = await waitForClose(graceMs);
    if (result.closed) {
        if (result.error && result.error.code !== 'ERR_SERVER_NOT_RUNNING') throw result.error;
        return { forced: false, timedOut: false };
    }

    if (typeof server.closeIdleConnections === 'function') {
        server.closeIdleConnections();
    }
    if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
    }
    for (const socket of sockets) {
        socket.destroy();
    }

    result = await waitForClose(forceMs);
    if (result.closed) {
        if (result.error && result.error.code !== 'ERR_SERVER_NOT_RUNNING') throw result.error;
        return { forced: true, timedOut: false };
    }

    for (const socket of sockets) {
        socket.destroy();
    }
    return { forced: true, timedOut: true };
}

function processTreeExists(child){
    if (!child || !child.pid) return false;
    if (process.platform === 'win32') return child.exitCode === null;

    try {
        process.kill(-child.pid, 0);
        return true;
    }
    catch (error) {
        return error && error.code === 'EPERM';
    }
}

async function waitForProcessTreeExit(child, timeoutMs){
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (!processTreeExists(child)) return true;
        await delay(Math.min(25, Math.max(1, deadline - Date.now())));
    }
    return !processTreeExists(child);
}

function terminateProcessTree(child, signal = 'SIGTERM'){
    if (!child || !child.pid) return false;

    if (process.platform === 'win32') {
        const args = ['/pid', String(child.pid), '/t'];
        if (signal === 'SIGKILL') args.push('/f');
        const result = spawnSync('taskkill', args, { stdio: 'ignore' });
        if (!result.error && result.status === 0) return true;
        try {
            return child.kill(signal === 'SIGKILL' ? 'SIGKILL' : 'SIGTERM');
        }
        catch (_) {
            return false;
        }
    }

    try {
        process.kill(-child.pid, signal);
        return true;
    }
    catch (error) {
        if (error && error.code === 'ESRCH') return false;
        try {
            return child.kill(signal);
        }
        catch (_) {
            return false;
        }
    }
}

async function stopChildProcessTree(child, {
    termMs = 2000,
    killMs = 1000,
} = {}){
    if (!child || !child.pid || !processTreeExists(child)) {
        return { forced: false, timedOut: false };
    }

    terminateProcessTree(child, 'SIGTERM');
    if (await waitForProcessTreeExit(child, termMs)) {
        return { forced: false, timedOut: false };
    }

    terminateProcessTree(child, 'SIGKILL');
    const stopped = await waitForProcessTreeExit(child, killMs);
    return { forced: true, timedOut: !stopped };
}

function formatLogs(logs){
    return logs.map(log => `[${log.level}] ${log.message}`).join('\n');
}

function assertOnlyExpectedStartupFailure({
    externalLogs = [],
    applicationLogs = [],
    marker,
}){
    if (externalLogs.length > 0) {
        throw new Error(`Negative control encountered critical external browser errors:\n${formatLogs(externalLogs)}`);
    }

    const expected = applicationLogs.filter(log => String(log.message || '').includes(marker));
    const unrelated = applicationLogs.filter(log => !String(log.message || '').includes(marker));

    if (expected.length === 0) {
        throw new Error(`Negative control did not observe expected startup marker ${marker}. Browser errors:\n${formatLogs(applicationLogs)}`);
    }
    if (unrelated.length > 0) {
        throw new Error(`Negative control observed unrelated application/browser errors in addition to ${marker}:\n${formatLogs(unrelated)}`);
    }

    return expected;
}

async function cleanupBrowserHarness({
    sessionId,
    deleteSession,
    child,
    server,
    sockets,
    onPhase = () => {},
    onWarning = () => {},
    sessionDeleteTimeoutMs = 6000,
    driverTermMs = 2000,
    driverKillMs = 1000,
    serverGraceMs = 1500,
    serverForceMs = 1000,
}){
    let sessionDeleteFailed = false;
    let driver = { forced: false, timedOut: false };
    let httpServer = { forced: false, timedOut: false };
    const fatalCleanupErrors = [];

    if (sessionId && deleteSession) {
        onPhase('session-delete');
        const deletion = Promise.resolve().then(deleteSession);
        deletion.catch(() => {});
        try {
            await Promise.race([
                deletion,
                delay(sessionDeleteTimeoutMs).then(() => {
                    throw new Error(`Timed out deleting WebDriver session after ${sessionDeleteTimeoutMs} ms.`);
                }),
            ]);
        }
        catch (error) {
            sessionDeleteFailed = true;
            onWarning(`WebDriver session deletion did not complete cleanly: ${error.message}`);
        }
    }

    onPhase('driver-stop');
    try {
        driver = await stopChildProcessTree(child, {
            termMs: driverTermMs,
            killMs: driverKillMs,
        });
        if (driver.forced) {
            onWarning('ChromeDriver/browser process tree required forced termination.');
        }
        if (driver.timedOut) {
            fatalCleanupErrors.push(new Error('ChromeDriver/browser process tree survived forced termination.'));
        }
    }
    catch (error) {
        fatalCleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
    }

    onPhase('server-close');
    try {
        httpServer = await closeServerBounded(server, {
            sockets,
            graceMs: serverGraceMs,
            forceMs: serverForceMs,
        });
        if (httpServer.forced) {
            onWarning('Browser smoke HTTP server required forced connection cleanup.');
        }
        if (httpServer.timedOut) {
            fatalCleanupErrors.push(new Error('Browser smoke HTTP server did not close after forced connection cleanup.'));
        }
    }
    catch (error) {
        fatalCleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
    }

    if (fatalCleanupErrors.length > 0) {
        const message = fatalCleanupErrors.map(error => error.message).join(' | ');
        throw new Error(`Browser smoke cleanup failed after attempting all teardown phases: ${message}`);
    }

    return {
        sessionDeleteFailed,
        driver,
        server: httpServer,
    };
}

module.exports = {
    assertOnlyExpectedStartupFailure,
    cleanupBrowserHarness,
    closeServerBounded,
    stopChildProcessTree,
    terminateProcessTree,
    trackServerConnections,
};
