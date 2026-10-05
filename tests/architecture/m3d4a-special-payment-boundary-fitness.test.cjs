'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
    FIRST_PARTY_SPECIAL_PAYMENT_TERMS,
    analyzeCostSource,
    findViolations,
} = require('./m3d4a-special-payment-boundary-fitness.cjs');

test('M3D4A ratchet rejects first-party special-payment knowledge anywhere in generic cost source', () => {
    for (const term of FIRST_PARTY_SPECIAL_PAYMENT_TERMS){
        const direct = analyzeCostSource(`const source = '${term}';`);
        assert.equal(direct.length, 1, `expected ${term} literal to be rejected`);

        const comment = analyzeCostSource(`// ${term} must be handled here`);
        assert.equal(comment.length, 1, `expected ${term} comment knowledge to be rejected`);
    }
});

test('M3D4A ratchet permits generic prestige/special/pool vocabulary', () => {
    const source = `
        const kinds = ['resource', 'prestige', 'special'];
        const sourceKinds = ['resource', 'pool'];
        function resolve(paymentId, source){ return { paymentId, source }; }
    `;
    assert.deepEqual(analyzeCostSource(source), []);
});

test('current generic M3D cost source contains no first-party special-payment knowledge', () => {
    const root = path.resolve(__dirname, '../..');
    assert.deepEqual(findViolations(root), []);
});
