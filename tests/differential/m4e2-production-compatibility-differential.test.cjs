'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const proofPath = path.join(__dirname, 'm4e2-production-compatibility-proof.cjs');

test('M4E2 production compatibility proof completes in an isolated legacy-runtime process', () => {
    const childEnv = { ...process.env };
    delete childEnv.NODE_TEST_CONTEXT;

    const result = spawnSync(
        process.execPath,
        ['--test', '--test-force-exit', proofPath],
        {
            cwd: root,
            env: childEnv,
            encoding: 'utf8',
            timeout: 60000,
            maxBuffer: 10 * 1024 * 1024,
        }
    );

    if (result.error){
        throw result.error;
    }

    const diagnostics = [result.stdout, result.stderr].filter(Boolean).join('\n');
    assert.equal(result.signal, null, diagnostics);
    assert.equal(result.status, 0, diagnostics);
    assert.match(
        result.stdout,
        /M4E2 production seam preserves the frozen legacy matrix and a real fast-loop consumer/,
        diagnostics
    );
});
