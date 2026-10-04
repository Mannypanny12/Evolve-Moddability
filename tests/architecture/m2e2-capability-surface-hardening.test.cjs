'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
    inspectPlainCapabilityObject,
    inspectMethodCarrier,
    capabilitySurfaceHardeningViolations,
} = require('./m2e2-capability-surface-hardening.cjs');

const root = path.resolve(__dirname, '..', '..');

test('M2E2 capability objects may not hide authority on prototype chains', () => {
    const violations = [];
    const exotic = Object.create({ rawWrite(){} });
    exotic.advance = () => undefined;
    inspectPlainCapabilityObject(exotic, 'service', violations);
    assert.match(violations.join('\n'), /plain or null prototype/);

    const clean = [];
    inspectPlainCapabilityObject({ advance(){} }, 'service', clean);
    assert.deepEqual(clean, []);
});

test('M2E2 semantic methods may not carry custom, symbol, or prototype capability payloads', () => {
    const rawTransaction = () => undefined;

    function clean(){}
    const cleanViolations = [];
    inspectMethodCarrier(clean, rawTransaction, 'clean', cleanViolations);
    assert.deepEqual(cleanViolations, []);

    function custom(){}
    custom.raw = rawTransaction;
    const customViolations = [];
    inspectMethodCarrier(custom, rawTransaction, 'custom', customViolations);
    assert.match(customViolations.join('\n'), /custom function property "raw"/);

    function symbol(){}
    symbol[Symbol('raw')] = rawTransaction;
    const symbolViolations = [];
    inspectMethodCarrier(symbol, rawTransaction, 'symbol', symbolViolations);
    assert.match(symbolViolations.join('\n'), /symbol properties/);

    function prototypeCarrier(){}
    prototypeCarrier.prototype.raw = rawTransaction;
    const prototypeViolations = [];
    inspectMethodCarrier(prototypeCarrier, rawTransaction, 'prototypeCarrier', prototypeViolations);
    assert.match(prototypeViolations.join('\n'), /prototype may not carry additional capability data/);
});

test('current repository passes M2E2 capability-object hardening', async () => {
    const violations = await capabilitySurfaceHardeningViolations(root);
    assert.deepEqual(violations, [], violations.join('\n'));
});
