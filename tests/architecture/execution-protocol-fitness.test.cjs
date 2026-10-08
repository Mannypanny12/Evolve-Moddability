'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { REQUIRED_MARKERS, protocolViolations } = require('./execution-protocol-fitness.cjs');

const root = path.resolve(__dirname, '../..');
const protocol = fs.readFileSync(path.join(root, 'docs/modding/EXECUTION_PROTOCOL.md'), 'utf8');

test('execution protocol guard accepts the bounded CI observation rules', () => {
    assert.deepEqual(protocolViolations(protocol), []);
});

test('execution protocol guard rejects removal of any bounded CI observation rule', () => {
    for (const marker of REQUIRED_MARKERS){
        const mutated = protocol.replace(marker, 'removed-marker');
        const violations = protocolViolations(mutated);
        assert.ok(
            violations.some(value => value.includes(marker)),
            `expected missing marker to be reported: ${marker}`
        );
    }
});

test('execution protocol guard rejects duplicate bounded CI observation rules', () => {
    const marker = REQUIRED_MARKERS[0];
    const violations = protocolViolations(`${protocol}\n${marker}\n`);
    assert.ok(violations.some(value => value.includes('found 2')));
});
