'use strict';

function delay(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
}

function markerPresent(logs, marker){
    return logs.some(log => String(log && log.message || '').includes(marker));
}

async function collectBrowserLogsUntilMarker({
    readLogs,
    marker,
    timeoutMs = 3000,
    pollMs = 100,
    settleAfterMarkerMs = 300,
}){
    if (typeof readLogs !== 'function') {
        throw new TypeError('readLogs must be a function.');
    }
    if (typeof marker !== 'string' || marker.length === 0) {
        throw new TypeError('marker must be a non-empty string.');
    }
    for (const [name, value] of Object.entries({ timeoutMs, pollMs, settleAfterMarkerMs })) {
        if (!Number.isFinite(value) || value < 0) {
            throw new TypeError(`${name} must be a finite non-negative number.`);
        }
    }
    if (timeoutMs === 0) return [];

    const deadline = Date.now() + timeoutMs;
    const collected = [];
    let markerSeenAt;

    while (Date.now() < deadline) {
        const remainingMs = Math.max(1, deadline - Date.now());
        const read = Promise.resolve()
            .then(() => readLogs(remainingMs))
            .then(
                logs => ({ type: 'logs', logs }),
                error => ({ type: 'error', error })
            );
        const outcome = await Promise.race([
            read,
            delay(remainingMs).then(() => ({ type: 'timeout' })),
        ]);

        if (outcome.type === 'timeout') break;
        if (outcome.type === 'error') throw outcome.error;
        if (!Array.isArray(outcome.logs)) {
            throw new TypeError('readLogs must resolve to an array.');
        }

        collected.push(...outcome.logs);
        if (markerSeenAt === undefined && markerPresent(outcome.logs, marker)) {
            markerSeenAt = Date.now();
        }

        const now = Date.now();
        if (markerSeenAt !== undefined && now - markerSeenAt >= settleAfterMarkerMs) {
            break;
        }

        const remainingTotalMs = deadline - now;
        if (remainingTotalMs <= 0) break;

        let waitMs = Math.min(pollMs, remainingTotalMs);
        if (markerSeenAt !== undefined) {
            const settleRemainingMs = Math.max(0, settleAfterMarkerMs - (now - markerSeenAt));
            waitMs = Math.min(waitMs, settleRemainingMs);
        }
        if (waitMs > 0) await delay(waitMs);
    }

    return collected;
}

module.exports = {
    collectBrowserLogsUntilMarker,
};
