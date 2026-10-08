'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    collectBrowserLogsForWindow,
    collectBrowserLogsUntilMarker,
} = require('./log-collector.cjs');

function delay(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
}

test('collectBrowserLogsUntilMarker accumulates drained batches and observes immediate post-marker errors', async () => {
    const batches = [
        [],
        [{ level: 'SEVERE', message: 'Uncaught Error: EXPECTED_MARKER' }],
        [{ level: 'SEVERE', message: 'Uncaught Error: unrelated failure' }],
    ];
    let reads = 0;

    const logs = await collectBrowserLogsUntilMarker({
        readLogs: async () => batches[reads++] || [],
        marker: 'EXPECTED_MARKER',
        timeoutMs: 100,
        pollMs: 1,
        settleAfterMarkerMs: 10,
    });

    assert.equal(logs.some(log => log.message.includes('EXPECTED_MARKER')), true);
    assert.equal(logs.some(log => log.message.includes('unrelated failure')), true);
    assert.equal(reads >= 3, true);
});

test('collectBrowserLogsUntilMarker gives a late marker its full post-marker settling window', async () => {
    let markerReturnedAt;
    let lateErrorReturned = false;

    const logs = await collectBrowserLogsUntilMarker({
        readLogs: async () => {
            if (markerReturnedAt === undefined) {
                await delay(20);
                markerReturnedAt = Date.now();
                return [{ level: 'SEVERE', message: 'Uncaught Error: EXPECTED_MARKER' }];
            }
            if (!lateErrorReturned && Date.now() - markerReturnedAt >= 15) {
                lateErrorReturned = true;
                return [{ level: 'SEVERE', message: 'Uncaught Error: late unrelated failure' }];
            }
            return [];
        },
        marker: 'EXPECTED_MARKER',
        timeoutMs: 25,
        pollMs: 5,
        settleAfterMarkerMs: 30,
    });

    assert.equal(logs.some(log => log.message.includes('EXPECTED_MARKER')), true);
    assert.equal(logs.some(log => log.message.includes('late unrelated failure')), true);
});

test('collectBrowserLogsUntilMarker stays bounded when the marker never arrives', async () => {
    const started = Date.now();
    let reads = 0;

    const logs = await collectBrowserLogsUntilMarker({
        readLogs: async () => {
            reads += 1;
            return [];
        },
        marker: 'MISSING_MARKER',
        timeoutMs: 30,
        pollMs: 5,
        settleAfterMarkerMs: 10,
    });

    assert.deepEqual(logs, []);
    assert.equal(reads > 0, true);
    assert.equal(Date.now() - started < 250, true);
});

test('collectBrowserLogsUntilMarker propagates browser-log read failures', async () => {
    await assert.rejects(
        collectBrowserLogsUntilMarker({
            readLogs: async () => {
                throw new Error('log endpoint failed');
            },
            marker: 'EXPECTED_MARKER',
            timeoutMs: 50,
            pollMs: 1,
            settleAfterMarkerMs: 1,
        }),
        /log endpoint failed/
    );
});

test('collectBrowserLogsUntilMarker rejects invalid log batches', async () => {
    await assert.rejects(
        collectBrowserLogsUntilMarker({
            readLogs: async () => ({ not: 'an array' }),
            marker: 'EXPECTED_MARKER',
            timeoutMs: 50,
        }),
        /must resolve to an array/
    );
});

test('collectBrowserLogsForWindow accumulates drained batches for the full observation window', async () => {
    const batches = [
        [],
        [{ level: 'SEVERE', message: 'late browser error' }],
        [],
    ];
    let reads = 0;

    const logs = await collectBrowserLogsForWindow({
        readLogs: async () => batches[reads++] || [],
        durationMs: 20,
        pollMs: 2,
    });

    assert.equal(logs.some(log => log.message.includes('late browser error')), true);
    assert.equal(reads >= 2, true);
});

test('collectBrowserLogsForWindow rejects reader failures and invalid timing', async () => {
    await assert.rejects(
        collectBrowserLogsForWindow({
            readLogs: async () => { throw new Error('window read failed'); },
            durationMs: 20,
        }),
        /window read failed/
    );
    await assert.rejects(
        collectBrowserLogsForWindow({
            readLogs: async () => [],
            durationMs: -1,
        }),
        /durationMs must be a finite non-negative number/
    );
});
