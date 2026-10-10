'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    PROD,
    RUNTIME,
    MIGRATED_IDS,
    analyzeProdSource,
    analyzeRuntimeSource,
    findViolations,
} = require('./m4e3-explicit-state-production-cutover-fitness.cjs');

const root = path.resolve(__dirname, '../..');

function read(relative){
    return fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8');
}

test('M4E3 cutover keeps all ten reviewed cases behind explicit-state delegation', () => {
    assert.deepEqual(findViolations(root), []);
    assert.equal(MIGRATED_IDS.length, 10);
});

test('M4E3 cutover guard rejects numerical authority returning to prod.js', () => {
    const source = read(PROD).replace(
        "return explicitStateProduction('infernite_mine', { suppression });",
        'return 0.5 * suppression;'
    );
    assert.match(analyzeProdSource(source).join('\n'), /infernite_mine retains numerical production authority/);
});

test('M4E3 cutover guard rejects a missing canonical delegation', () => {
    const source = read(PROD).replace(
        "return explicitStateProduction('whaling_ship', {",
        "return explicitStateProduction('mining_ship', {"
    );
    assert.match(analyzeProdSource(source).join('\n'), /whaling_ship must delegate to its canonical explicit-state calculation/);
});

test('M4E3 cutover guard rejects loss of shared-runtime composition', () => {
    const source = read(RUNTIME).replace('        ...createExplicitStateProductionRegistrations(),\n', '');
    assert.match(analyzeRuntimeSource(source).join('\n'), /registration family must be composed/);
});
