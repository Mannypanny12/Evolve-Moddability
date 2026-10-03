'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    SIMULATION_SETTING_POLICY
} = require('../simulation/legacy-state-policy.cjs');
const {
    TARGET_LAYERS,
    PERSISTENCE_INTENTS,
    SETTING_TARGET_POLICY,
    RUNTIME_TARGET_POLICY
} = require('./m2c-state-classification.cjs');

const root = path.resolve(__dirname, '../..');

function sortedKeys(value){
    return Object.keys(value).sort();
}

function mutableVarExports(source){
    return [...source.matchAll(/^export\s+var\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=/gm)]
        .map(match => match[1])
        .sort();
}

test('M2C1 target policy classifies every known legacy setting exactly once', () => {
    assert.deepEqual(
        sortedKeys(SETTING_TARGET_POLICY),
        sortedKeys(SIMULATION_SETTING_POLICY)
    );

    for (const [key, legacy] of Object.entries(SIMULATION_SETTING_POLICY)){
        assert.equal(
            SETTING_TARGET_POLICY[key].legacyMode,
            legacy.mode,
            `settings.${key}: M2 target classification must preserve M0 observation semantics`
        );
    }
});

test('M2C1 classification entries are complete and use closed vocabulary', () => {
    const allowedLayers = new Set(TARGET_LAYERS);
    const allowedPersistence = new Set(PERSISTENCE_INTENTS);

    for (const [catalogName, catalog] of [
        ['settings', SETTING_TARGET_POLICY],
        ['runtime', RUNTIME_TARGET_POLICY]
    ]){
        for (const [key, info] of Object.entries(catalog)){
            assert.ok(allowedLayers.has(info.targetLayer), `${catalogName}.${key}: unknown target layer ${info.targetLayer}`);
            assert.ok(allowedPersistence.has(info.persistence), `${catalogName}.${key}: unknown persistence intent ${info.persistence}`);
            assert.equal(typeof info.owner, 'string', `${catalogName}.${key}: owner must be documented`);
            assert.ok(info.owner.length > 0, `${catalogName}.${key}: owner must not be empty`);
            assert.equal(typeof info.reason, 'string', `${catalogName}.${key}: reason must be documented`);
            assert.ok(info.reason.length > 0, `${catalogName}.${key}: reason must not be empty`);
            assert.equal(typeof info.directMigration, 'boolean', `${catalogName}.${key}: directMigration must be explicit`);
        }
    }
});

test('M2C1 does not equate M0 gameplay observation with future GameState ownership', () => {
    const expectedDirectGameStateCandidates = [
        'alwaysPower',
        'at',
        'boring',
        'lowPowerBalance',
        'mtorder',
        'pause'
    ].sort();

    const actualDirectGameStateCandidates = Object.entries(SETTING_TARGET_POLICY)
        .filter(([, info]) => info.targetLayer === 'game-state-candidate')
        .map(([key]) => key)
        .sort();

    assert.deepEqual(actualDirectGameStateCandidates, expectedDirectGameStateCandidates);

    for (const key of ['qAny', 'qAny_res', 'qKey', 'q_merge']){
        const info = SETTING_TARGET_POLICY[key];
        assert.equal(SIMULATION_SETTING_POLICY[key].mode, 'include');
        assert.equal(info.targetLayer, 'application-settings');
        assert.equal(info.directMigration, false);
    }

    assert.equal(SETTING_TARGET_POLICY.showCivic.targetLayer, 'semantic-debt');
    assert.equal(SETTING_TARGET_POLICY.showCivic.directMigration, false);
});

test('M2C1 prevents non-authoritative layers from claiming authoritative save persistence', () => {
    const forbiddenAuthoritativeLayers = new Set([
        'application-settings',
        'ui-state',
        'derived-transient',
        'runtime-working',
        'runtime-service',
        'platform-service',
        'migration-only',
        'debug-only',
        'legacy-mixed-container',
        'semantic-debt'
    ]);

    for (const [catalogName, catalog] of [
        ['settings', SETTING_TARGET_POLICY],
        ['runtime', RUNTIME_TARGET_POLICY]
    ]){
        for (const [key, info] of Object.entries(catalog)){
            if (forbiddenAuthoritativeLayers.has(info.targetLayer)){
                assert.notEqual(
                    info.persistence,
                    'authoritative-save',
                    `${catalogName}.${key}: ${info.targetLayer} must not be serialized as authoritative GameState`
                );
            }
        }
    }
});

test('M2C1 fail-closes exported mutable vars.js runtime buckets', () => {
    const source = fs.readFileSync(path.join(root, 'src', 'vars.js'), 'utf8');
    const sourceExports = mutableVarExports(source);

    assert.deepEqual(
        sortedKeys(RUNTIME_TARGET_POLICY),
        sourceExports,
        'every exported mutable var binding in vars.js must receive an explicit M2C target classification'
    );
});

test('M2C1 keeps executable and platform runtime machinery out of data-state layers', () => {
    assert.deepEqual(
        {
            callback_queue: RUNTIME_TARGET_POLICY.callback_queue.targetLayer,
            webWorker: RUNTIME_TARGET_POLICY.webWorker.targetLayer,
            intervals: RUNTIME_TARGET_POLICY.intervals.targetLayer,
            save: RUNTIME_TARGET_POLICY.save.targetLayer
        },
        {
            callback_queue: 'runtime-service',
            webWorker: 'runtime-service',
            intervals: 'runtime-service',
            save: 'platform-service'
        }
    );

    for (const key of ['callback_queue', 'webWorker', 'intervals', 'save']){
        assert.equal(RUNTIME_TARGET_POLICY[key].directMigration, false);
        assert.notEqual(RUNTIME_TARGET_POLICY[key].persistence, 'authoritative-save');
    }
});

test('M2C1 distinguishes reconstructible caches from deterministic runtime working state', () => {
    for (const key of [
        'breakdown',
        'power_generated',
        'quantum_level',
        'achieve_level',
        'universe_level',
        'hell_reports',
        'hell_graphs'
    ]){
        assert.equal(RUNTIME_TARGET_POLICY[key].targetLayer, 'derived-transient', key);
        assert.equal(RUNTIME_TARGET_POLICY[key].persistence, 'recompute', key);
    }

    for (const key of [
        'p_on',
        'support_on',
        'int_on',
        'gal_on',
        'spire_on',
        'atrack',
        'active_rituals',
        'keyMap'
    ]){
        assert.equal(RUNTIME_TARGET_POLICY[key].targetLayer, 'runtime-working', key);
        assert.equal(RUNTIME_TARGET_POLICY[key].persistence, 'runtime-only', key);
    }
});
