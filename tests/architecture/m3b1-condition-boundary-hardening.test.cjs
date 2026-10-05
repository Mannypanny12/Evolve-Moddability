'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { analyzeConditionModule } = require('./m3b1-condition-boundary-fitness.cjs');

test('M3B1 hardening rejects non-JavaScript sibling imports', () => {
    const violations = analyzeConditionModule(
        `import data from './hidden.json'; export function ok(){ return data; }`,
        'src/engine/conditions/example.mjs'
    );
    assert.equal(violations.some(item => item.includes('JavaScript condition source')), true);
});

test('M3B1 hardening rejects platform/runtime escape hatches', () => {
    const cases = [
        [`export function bad(){ return globalThis.foo; }`, 'legacy/global object'],
        [`export function bad(){ return document.body; }`, 'browser/UI object'],
        [`export function bad(){ return navigator.userAgent; }`, 'browser/UI object'],
        [`export function bad(){ return sessionStorage.getItem('x'); }`, 'browser storage'],
        [`export function bad(){ return fetch('/x'); }`, 'browser/network API'],
        [`export function bad(){ return process.env.NODE_ENV; }`, 'Node/platform global'],
        [`export function bad(){ return Date.now(); }`, 'runtime clock/random source'],
        [`export function bad(){ return Math.random(); }`, 'runtime clock/random source'],
        [`export function bad(){ return setTimeout(() => {}, 0); }`, 'timer or microtask scheduling'],
        [`export function bad(){ return Function('return 1')(); }`, 'dynamic code evaluation'],
        [`export function bad(){ return eval('1'); }`, 'dynamic code evaluation'],
    ];

    for (const [source, expected] of cases){
        const violations = analyzeConditionModule(source, 'src/engine/conditions/example.mjs');
        assert.equal(violations.some(item => item.includes(expected)), true, `${expected}: ${JSON.stringify(violations)}`);
    }
});

test('M3B1 hardening ignores forbidden names in comments, strings and regex literals', () => {
    const source = `
        // globalThis document setTimeout
        const text = 'window fetch process Date Math.random';
        const pattern = /globalThis|document|fetch/;
        export function ok(){ return { text, pattern }; }
    `;
    assert.deepEqual(analyzeConditionModule(source, 'src/engine/conditions/example.mjs'), []);
});
