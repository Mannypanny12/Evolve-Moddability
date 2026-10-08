'use strict';

function delay(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
}

function markerPresent(logs, marker){
    return logs.some(log => String(log && log.message || '').includes(marker));
}

function validateReader(readLogs){
    if (typeof readLogs !== 'function') {
        throw new TypeError('readLogs must be a function.');
    }
}

function validateTiming(values){
    for (const [name, value] of Object.entries(values)) {
        if (!Number.isFinite(value) || value < 0) {
            throw new TypeError(`${name} must be a finite non-negative number.`);
        }
    }
}

async function readLogsBounded(readLogs, remainingMs){
    const read = Promise.resolve()
        .then(() => readLogs(remainingMs))
        .then(
            logs => ({ type: 'logs', logs }),
            error => ({ type: 'error', error })
        );
    let timeoutId;
    const timeout = new Promise(resolve => {
        timeoutId = setTimeout(() => resolve({ type: 'timeout' }), remainingMs);
    });

    let outcome;
    try {
        outcome = await Promise.race([read, timeout]);
    }
    finally {
        clearTimeout(timeoutId);
    }

    if (outcome.type === 'timeout') return null;
    if (outcome.type === 'error') throw outcome.error;
    if (!Array.isArray(outcome.logs)) {
        throw new TypeError('readLogs must resolve to an array.');
    }
    return outcome.logs;
}

async function collectBrowserLogsUntilMarker({
    readLogs,
    marker,
    timeoutMs = 3000,
    pollMs = 100,
    settleAfterMarkerMs = 300,
}){
    validateReader(readLogs);
    if (typeof marker !== 'string' || marker.length === 0) {
        throw new TypeError('marker must be a non-empty string.');
    }
    validateTiming({ timeoutMs, pollMs, settleAfterMarkerMs });
    if (timeoutMs === 0) return [];

    let deadline = Date.now() + timeoutMs;
    const collected = [];
    let markerSeenAt;

    while (Date.now() < deadline) {
        const remainingMs = Math.max(1, deadline - Date.now());
        const logs = await readLogsBounded(readLogs, remainingMs);
        if (logs === null) break;

        collected.push(...logs);
        const now = Date.now();
        if (markerSeenAt === undefined && markerPresent(logs, marker)) {
            markerSeenAt = now;
            deadline = markerSeenAt + settleAfterMarkerMs;
        }

        if (markerSeenAt !== undefined && now - markerSeenAt >= settleAfterMarkerMs) {
            break;
        }

        const remainingTotalMs = deadline - now;
        if (remainingTotalMs <= 0) break;
        const waitMs = Math.min(pollMs, remainingTotalMs);
        if (waitMs > 0) await delay(waitMs);
    }

    return collected;
}

async function collectBrowserLogsForWindow({
    readLogs,
    durationMs = 500,
    pollMs = 100,
}){
    validateReader(readLogs);
    validateTiming({ durationMs, pollMs });
    if (durationMs === 0) return [];

    const deadline = Date.now() + durationMs;
    const collected = [];

    while (Date.now() < deadline) {
        const remainingMs = Math.max(1, deadline - Date.now());
        const logs = await readLogsBounded(readLogs, remainingMs);
        if (logs === null) break;
        collected.push(...logs);

        const remainingTotalMs = deadline - Date.now();
        if (remainingTotalMs <= 0) break;
        const waitMs = Math.min(pollMs, remainingTotalMs);
        if (waitMs > 0) await delay(waitMs);
    }

    return collected;
}

module.exports = {
    collectBrowserLogsForWindow,
    collectBrowserLogsUntilMarker,
};
