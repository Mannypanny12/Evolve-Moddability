'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { collectBrowserLogsUntilMarker } = require('./log-collector.cjs');

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
