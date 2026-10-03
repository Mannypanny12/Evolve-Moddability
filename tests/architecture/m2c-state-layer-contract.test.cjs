'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    SETTING_TARGET_POLICY,
    RUNTIME_TARGET_POLICY,
} = require('./m2c-state-classification.cjs');
const {
    STATE_LAYERS,
    LIFECYCLES,
    PERSISTENCE_MODES,
    SIMULATION_ROLES,
    MIGRATION_DISPOSITIONS,
    RESET_BEHAVIORS,
    LAYER_RULES,
    SETTING_STATE_CONTRACT,
    RUNTIME_STATE_CONTRACT,
    EXPECTED_FIXED_NESTED_KEYS,
    matchNestedSettingPath,
} = require('./m2c-state-layer-contract.cjs');

function sorted(values){
    return [...values].sort();
}

function sortedKeys(value){
    return Object.keys(value).sort();
}

let legacyApi;
function legacy(){
    if (!legacyApi){
        const bundlePath = process.env.EVOLVE_LEGACY_TEST_BUNDLE;
        assert.ok(bundlePath, 'EVOLVE_LEGACY_TEST_BUNDLE must be set by the test runner');
        require(bundlePath);
        legacyApi = globalThis.__EVOLVE_LEGACY_TEST_API__;
        assert.ok(legacyApi, 'legacy bundle must expose __EVOLVE_LEGACY_TEST_API__');
        assert.equal(typeof legacyApi.pristineLegacyState, 'function', 'legacy harness must expose pristineLegacyState()');
    }
    return legacyApi;
}

function initializedSettings(){
    const state = legacy().pristineLegacyState();
    assert.ok(state && state.settings && typeof state.settings === 'object');
    return state.settings;
}

function leafPaths(value, prefix){
    if (value === null || typeof value !== 'object' || Array.isArray(value)){
        return [prefix];
    }
    const keys = Object.keys(value);
    if (keys.length === 0){
        return [];
    }
    return keys.flatMap(key => leafPaths(value[key], `${prefix}.${key}`));
}

function assertContractValid(label, info){
    assert.ok(STATE_LAYERS.includes(info.targetLayer), `${label}: unknown target layer ${info.targetLayer}`);
    assert.ok(LIFECYCLES.includes(info.lifecycle), `${label}: unknown lifecycle ${info.lifecycle}`);
    assert.ok(PERSISTENCE_MODES.includes(info.persistence), `${label}: unknown persistence ${info.persistence}`);
    assert.ok(SIMULATION_ROLES.includes(info.simulationRole), `${label}: unknown simulation role ${info.simulationRole}`);
    assert.ok(MIGRATION_DISPOSITIONS.includes(info.migrationDisposition), `${label}: unknown migration disposition ${info.migrationDisposition}`);
    assert.ok(RESET_BEHAVIORS.includes(info.resetBehavior), `${label}: unknown reset behavior ${info.resetBehavior}`);
    assert.equal(typeof info.owner, 'string', `${label}: owner must be documented`);
    assert.ok(info.owner.length > 0, `${label}: owner must not be empty`);
    assert.equal(typeof info.reason, 'string', `${label}: reason must be documented`);
    assert.ok(info.reason.length > 0, `${label}: reason must not be empty`);

    const rule = LAYER_RULES[info.targetLayer];
    assert.ok(rule, `${label}: layer ${info.targetLayer} must have a permanent layer rule`);
    assert.ok(rule.lifecycles.includes(info.lifecycle), `${label}: ${info.lifecycle} is illegal for ${info.targetLayer}`);
    assert.ok(rule.persistence.includes(info.persistence), `${label}: ${info.persistence} is illegal for ${info.targetLayer}`);
    assert.ok(rule.simulationRoles.includes(info.simulationRole), `${label}: ${info.simulationRole} is illegal for ${info.targetLayer}`);
    assert.ok(rule.resetBehaviors.includes(info.resetBehavior), `${label}: ${info.resetBehavior} is illegal for ${info.targetLayer}`);
}

test('M2C2 permanent state layers are closed and exclude M2C1 migration-only pseudo-layers', () => {
    assert.deepEqual(sortedKeys(LAYER_RULES), sorted(STATE_LAYERS));
    assert.equal(STATE_LAYERS.includes('semantic-debt'), false);
    assert.equal(STATE_LAYERS.includes('legacy-mixed-container'), false);
    assert.equal(STATE_LAYERS.includes('game-state-candidate'), false);
});

test('M2C2 normalizes every M2C1 setting and runtime entry exactly once', () => {
    assert.deepEqual(sortedKeys(SETTING_STATE_CONTRACT), sortedKeys(SETTING_TARGET_POLICY));
    assert.deepEqual(sortedKeys(RUNTIME_STATE_CONTRACT), sortedKeys(RUNTIME_TARGET_POLICY));

    for (const [name, info] of Object.entries(SETTING_STATE_CONTRACT)){
        assertContractValid(`settings.${name}`, info);
    }
    for (const [name, info] of Object.entries(RUNTIME_STATE_CONTRACT)){
        assertContractValid(`runtime.${name}`, info);
    }
});

test('M2C2 reserves authoritative persistence exclusively for GameState', () => {
    const all = [...Object.entries(SETTING_STATE_CONTRACT), ...Object.entries(RUNTIME_STATE_CONTRACT)];
    for (const [name, info] of all){
        if (info.persistence === 'game-save' || info.simulationRole === 'authoritative'){
            assert.equal(info.targetLayer, 'game-state', name);
        }
        if (info.targetLayer !== 'game-state'){
            assert.notEqual(info.persistence, 'game-save', name);
            assert.notEqual(info.simulationRole, 'authoritative', name);
        }
    }
});

test('M2C2 makes behavior-affecting application preferences explicit command inputs, not implicit engine state', () => {
    for (const name of ['qAny', 'qAny_res', 'qKey', 'q_merge']){
        const info = SETTING_STATE_CONTRACT[name];
        assert.equal(info.targetLayer, 'application-preference', name);
        assert.equal(info.simulationRole, 'explicit-command-input', name);
        assert.equal(info.persistence, 'application-preference', name);
        assert.equal(info.resetBehavior, 'survive-gameplay-reset', name);
    }
});

test('M2C2 classifies pause as application scheduling control rather than authoritative GameState', () => {
    const info = SETTING_STATE_CONTRACT.pause;
    assert.equal(info.targetLayer, 'application-control');
    assert.equal(info.simulationRole, 'scheduling-gate');
    assert.equal(info.persistence, 'application-preference');
    assert.equal(info.migrationDisposition, 'translate');
    assert.notEqual(info.targetLayer, 'game-state');
});

test('M2C2 converts legacy show flags and region containers into derived progression projections', () => {
    for (const [name, info] of Object.entries(SETTING_STATE_CONTRACT)){
        if (name.startsWith('show') || ['space', 'portal', 'eden', 'tau'].includes(name)){
            assert.equal(info.targetLayer, 'derived-state', name);
            assert.equal(info.persistence, 'none', name);
            assert.equal(info.simulationRole, 'derived-read-only', name);
            assert.equal(info.migrationDisposition, 'derive', name);
            assert.equal(info.resetBehavior, 'recompute', name);
        }
    }
});

test('M2C2 decomposes legacy mixed nested containers instead of assigning one permanent owner', () => {
    for (const name of ['arpa', 'msgFilters']){
        const info = SETTING_STATE_CONTRACT[name];
        assert.equal(info.targetLayer, 'migration', name);
        assert.equal(info.migrationDisposition, 'decompose', name);
        assert.equal(info.persistence, 'import-only', name);
    }
});

test('M2C2 keeps runtime working state ephemeral and reconstructible', () => {
    for (const name of ['p_on', 'support_on', 'int_on', 'gal_on', 'spire_on', 'atrack', 'active_rituals']){
        const info = RUNTIME_STATE_CONTRACT[name];
        assert.equal(info.targetLayer, 'simulation-working', name);
        assert.equal(info.lifecycle, 'operation', name);
        assert.equal(info.persistence, 'none', name);
        assert.equal(info.simulationRole, 'working-context', name);
        assert.equal(info.migrationDisposition, 'reconstruct', name);
        assert.equal(info.resetBehavior, 'discard-after-operation', name);
    }

    assert.equal(RUNTIME_STATE_CONTRACT.keyMap.targetLayer, 'application-working');
    assert.equal(RUNTIME_STATE_CONTRACT.keyMap.persistence, 'none');
    assert.equal(RUNTIME_STATE_CONTRACT.keyMap.migrationDisposition, 'reconstruct');
});

test('M2C2 replaces executable/platform legacy objects with services rather than state', () => {
    for (const name of ['callback_queue', 'webWorker', 'intervals']){
        const info = RUNTIME_STATE_CONTRACT[name];
        assert.equal(info.targetLayer, 'runtime-service', name);
        assert.equal(info.persistence, 'service-owned', name);
        assert.equal(info.simulationRole, 'orchestration-only', name);
        assert.equal(info.migrationDisposition, 'replace-by-service', name);
    }

    const storage = RUNTIME_STATE_CONTRACT.save;
    assert.equal(storage.targetLayer, 'platform-service');
    assert.equal(storage.persistence, 'service-owned');
    assert.equal(storage.simulationRole, 'platform-only');
    assert.equal(storage.migrationDisposition, 'replace-by-service');
});

test('M2C2 ratchets fixed nested settings keys against pristine legacy state', () => {
    const settings = initializedSettings();
    for (const [container, expectedKeys] of Object.entries(EXPECTED_FIXED_NESTED_KEYS)){
        assert.ok(settings[container] && typeof settings[container] === 'object' && !Array.isArray(settings[container]), `${container} must be an object`);
        assert.deepEqual(sortedKeys(settings[container]), sorted(expectedKeys), `${container} nested keys changed and require M2C2 review`);
    }
});

test('M2C2 gives every current nested settings leaf exactly one target contract', () => {
    const settings = initializedSettings();
    const containers = ['arpa', 'eden', 'keyMap', 'msgFilters', 'portal', 'resBar', 'space', 'tau'];
    const paths = containers.flatMap(container => leafPaths(settings[container], container));

    assert.ok(paths.length > 0, 'nested settings inventory must not be empty');
    for (const path of paths){
        const matches = matchNestedSettingPath(path);
        assert.equal(matches.length, 1, `${path}: expected exactly one nested M2C2 rule, got ${matches.map(match => match.id).join(', ') || 'none'}`);
        assertContractValid(`settings.${path}`, matches[0].classification);
    }
});

test('M2C2 splits ARPA navigation from progression-driven section availability', () => {
    const selectedTab = matchNestedSettingPath('arpa.arpaTabs')[0].classification;
    assert.equal(selectedTab.targetLayer, 'ui-session');
    assert.equal(selectedTab.simulationRole, 'none');

    for (const key of ['physics', 'genetics', 'crispr', 'blood']){
        const info = matchNestedSettingPath(`arpa.${key}`)[0].classification;
        assert.equal(info.targetLayer, 'derived-state', key);
        assert.equal(info.migrationDisposition, 'derive', key);
    }
});

test('M2C2 splits message-filter unlock capability from user filter preferences', () => {
    const settings = initializedSettings();
    assert.ok(settings.msgFilters && typeof settings.msgFilters === 'object');

    for (const [filter, value] of Object.entries(settings.msgFilters)){
        assert.deepEqual(sortedKeys(value), ['max', 'save', 'unlocked', 'vis'], `${filter}: message-filter shape changed`);

        const unlocked = matchNestedSettingPath(`msgFilters.${filter}.unlocked`)[0].classification;
        assert.equal(unlocked.targetLayer, 'derived-state', filter);
        assert.equal(unlocked.migrationDisposition, 'derive', filter);

        for (const field of ['vis', 'max', 'save']){
            const pref = matchNestedSettingPath(`msgFilters.${filter}.${field}`)[0].classification;
            assert.equal(pref.targetLayer, 'application-preference', `${filter}.${field}`);
            assert.equal(pref.resetBehavior, 'survive-gameplay-reset', `${filter}.${field}`);
        }
    }
});

test('M2C2 keeps keyboard mappings and resource-bar visibility on the application side', () => {
    const settings = initializedSettings();

    for (const key of Object.keys(settings.keyMap)){
        const info = matchNestedSettingPath(`keyMap.${key}`)[0].classification;
        assert.equal(info.targetLayer, 'application-preference', key);
        assert.equal(info.simulationRole, 'none', key);
    }

    for (const key of Object.keys(settings.resBar)){
        const info = matchNestedSettingPath(`resBar.${key}`)[0].classification;
        assert.equal(info.targetLayer, 'application-preference', key);
        assert.equal(info.simulationRole, 'none', key);
        assert.equal(info.persistence, 'application-preference', key);
    }
});
