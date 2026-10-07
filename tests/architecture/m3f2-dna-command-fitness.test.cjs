'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { analyzeDnaSource } = require('./m3f2-dna-command-fitness.cjs');

const root = path.resolve(__dirname, '../..');
const dnaPath = path.join(root, 'src/content/evolve/commands/evolution-dna.mjs');

function productionSource(){
    return fs.readFileSync(dnaPath, 'utf8');
}

function includesViolation(violations, fragment){
    return violations.some(violation => violation.includes(fragment));
}

test('M3F2 DNA fitness accepts the reviewed production command', () => {
    assert.deepEqual(analyzeDnaSource(productionSource()), []);
});

test('M3F2 DNA fitness rejects current-affordability authorization drift', () => {
    const source = `${productionSource()}\nfunction forbiddenPaymentGate(){ return assessCurrentAffordability(); }\n`;
    const violations = analyzeDnaSource(source);
    assert.equal(includesViolation(violations, 'current-affordability authorization'), true);
});

test('M3F2 DNA fitness rejects presentation-backed resource availability drift', () => {
    const source = `${productionSource()}\nconst forbiddenAvailability = 'resource.available';\n`;
    const violations = analyzeDnaSource(source);
    assert.equal(includesViolation(violations, 'resource.available'), true);
});

test('M3F2 DNA fitness rejects removal of direct-handler payload revalidation', () => {
    const source = productionSource().replace('            validatePayload(payload);\n\n', '');
    const violations = analyzeDnaSource(source);
    assert.equal(includesViolation(violations, 'revalidate the closed DNA payload'), true);
});
