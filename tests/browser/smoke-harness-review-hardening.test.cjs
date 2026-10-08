'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const {
    cleanupBrowserHarness,
    trackServerConnections,
} = require('./smoke-harness.cjs');

function listen(server){
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve(server.address()));
    });
}

test('browser cleanup still closes the HTTP server when driver cleanup itself throws', async () => {
    const server = http.createServer((req, res) => res.end('ok'));
    const sockets = trackServerConnections(server);
    await listen(server);
    const phases = [];
    const hostileChild = {};
    Object.defineProperty(hostileChild, 'pid', {
        get(){ throw new Error('simulated driver cleanup failure'); },
    });

    await assert.rejects(
        cleanupBrowserHarness({
            child: hostileChild,
            server,
            sockets,
            onPhase: phase => phases.push(phase),
            serverGraceMs: 100,
            serverForceMs: 100,
        }),
        /Browser smoke cleanup failed.*simulated driver cleanup failure/
    );

    assert.deepEqual(phases, ['driver-stop', 'server-close']);
    assert.equal(server.listening, false);
});
