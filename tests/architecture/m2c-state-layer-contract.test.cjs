'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
    SETTING_TARGET_POLICY,
    RUNTIME_TARGET_POLICY,
} = require('./m2c-state-classification.cjs');
const {
    NO_TARGET_LAYER,
    STATE_LAYERS,
    LIFECYCLES,
    PERSISTENCE_MODES,
    SIMULATION_ROLES,
    MIGRATION_DISPOSITIONS,
    RESET_BEHAVIORS,
    LAYER_RULES,
    SHOW_PROJECTION_SETTINGS,
    REGION_REPLACEMENT_PATHS,
    REGION_REPLACEMENT_MAP,
    SETTING_STATE_CONTRACT,
    RUNTIME_STATE_CONTRACT,
    EXPECTED_FIXED_NESTED_KEYS,
    EXPECTED_MESSAGE_LOG_FILTERS,
    matchNestedSettingPath,
    matchNestedRuntimePath,
} = require('./m2c-state-layer-contract.cjs');

function sorted(values){
    return [...values].sort();
}

function sortedKeys(value){
    return Object.keys(value).sort();
}

function sourceFile(relativePath){
    return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

function sourceSection(source, signature, nextSignatures = ['\nexport function ', '\nfunction ']){
    const start = source.indexOf(signature);
    assert.notEqual(start, -1, `source must contain ${signature}`);
    const candidates = nextSignatures
        .map(nextSignature => source.indexOf(nextSignature, start + signature.length))
        .filter(index => index !== -1);
    const end = candidates.length > 0 ? Math.min(...candidates) : source.length;
    return source.slice(start, end);
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
    assert.ok(LIFECYCLES.includes(info.lifecycle), `${label}: unknown lifecycle ${info.lifecycle}`);
    assert.ok(PERSISTENCE_MODES.includes(info.persistence), `${label}: unknown persistence ${info.persistence}`);
    assert.ok(SIMULATION_ROLES.includes(info.simulationRole), `${label}: unknown simulation role ${info.simulationRole}`);
    assert.ok(MIGRATION_DISPOSITIONS.includes(info.migrationDisposition), `${label}: unknown migration disposition ${info.migrationDisposition}`);
    assert.ok(RESET_BEHAVIORS.includes(info.resetBehavior), `${label}: unknown reset behavior ${info.resetBehavior}`);
    assert.equal(typeof info.owner, 'string', `${label}: owner must be documented`);
    assert.ok(info.owner.length > 0, `${label}: owner must not be empty`);
    assert.equal(typeof info.reason, 'string', `${label}: reason must be documented`);
    assert.ok(info.reason.length > 0, `${label}: reason must not be empty`);

    if (info.targetLayer === NO_TARGET_LAYER){
        assert.equal(info.lifecycle, 'import', `${label}: no-target decomposition source must be import-scoped`);
        assert.equal(info.persistence, 'import-only', `${label}: no-target decomposition source must be import-only`);
        assert.equal(info.simulationRole, 'none', `${label}: no-target decomposition source cannot influence simulation`);
        assert.equal(info.migrationDisposition, 'decompose', `${label}: no-target source must decompose`);
        assert.equal(info.resetBehavior, 'import-only', `${label}: no-target source is importer-only`);
        return;
    }

    assert.ok(STATE_LAYERS.includes(info.targetLayer), `${label}: unknown target layer ${info.targetLayer}`);
    const rule = LAYER_RULES[info.targetLayer];
    assert.ok(rule, `${label}: layer ${info.targetLayer} must have a layer rule`);
    assert.ok(rule.lifecycles.includes(info.lifecycle), `${label}: ${info.lifecycle} is illegal for ${info.targetLayer}`);
    assert.ok(rule.persistence.includes(info.persistence), `${label}: ${info.persistence} is illegal for ${info.targetLayer}`);
    assert.ok(rule.simulationRoles.includes(info.simulationRole), `${label}: ${info.simulationRole} is illegal for ${info.targetLayer}`);
    assert.ok(rule.migrationDispositions.includes(info.migrationDisposition), `${label}: ${info.migrationDisposition} is illegal for ${info.targetLayer}`);
    assert.ok(rule.resetBehaviors.includes(info.resetBehavior), `${label}: ${info.resetBehavior} is illegal for ${info.targetLayer}`);
}

test('M2C2 permanent target layers are closed and no-target is not a fake layer', () => {
    assert.deepEqual(sortedKeys(LAYER_RULES), sorted(STATE_LAYERS));
    assert.equal(NO_TARGET_LAYER, null);
    assert.equal(STATE_LAYERS.includes(NO_TARGET_LAYER), false);
    assert.equal(STATE_LAYERS.includes('semantic-debt'), false);
    assert.equal(STATE_LAYERS.includes('legacy-mixed-container'), false);
    assert.equal(STATE_LAYERS.includes('game-state-candidate'), false);
    for (const rule of Object.values(LAYER_RULES)){
        assert.ok(Array.isArray(rule.migrationDispositions));
        assert.ok(rule.migrationDispositions.length > 0);
    }
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

test('mixed legacy parents are decomposition sources, not migration target state', () => {
    for (const name of ['arpa', 'msgFilters', 'space', 'portal', 'eden', 'tau']){
        const info = SETTING_STATE_CONTRACT[name];
        assert.equal(info.targetLayer, NO_TARGET_LAYER, name);
        assert.equal(info.migrationDisposition, 'decompose', name);
    }
    for (const name of ['global', 'message_logs', 'tmp_vars']){
        const info = RUNTIME_STATE_CONTRACT[name];
        assert.equal(info.targetLayer, NO_TARGET_LAYER, name);
        assert.equal(info.migrationDisposition, 'decompose', name);
    }
    for (const name of ['restoreCheck', 'tLabels']){
        assert.equal(SETTING_STATE_CONTRACT[name].targetLayer, 'migration', name);
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

test('behavior-affecting application preferences become explicit command inputs', () => {
    for (const name of ['qAny', 'qAny_res', 'qKey', 'q_merge']){
        const info = SETTING_STATE_CONTRACT[name];
        assert.equal(info.targetLayer, 'application-preference', name);
        assert.equal(info.simulationRole, 'explicit-command-input', name);
        assert.equal(info.persistence, 'application-preference', name);
        assert.equal(info.resetBehavior, 'survive-gameplay-reset', name);
    }
});

test('pause and disableReset have source-backed reset-to-default semantics', () => {
    const pause = SETTING_STATE_CONTRACT.pause;
    assert.equal(pause.targetLayer, 'application-control');
    assert.equal(pause.lifecycle, 'application-session');
    assert.equal(pause.simulationRole, 'scheduling-gate');
    assert.equal(pause.resetBehavior, 'reset-to-default');

    const disableReset = SETTING_STATE_CONTRACT.disableReset;
    assert.equal(disableReset.targetLayer, 'ui-session');
    assert.equal(disableReset.persistence, 'none');
    assert.equal(disableReset.resetBehavior, 'reset-to-default');

    const varsSource = sourceFile('../../src/vars.js');
    const clearStates = sourceSection(varsSource, 'export function clearStates(){');
    assert.match(clearStates, /global\.settings\.disableReset\s*=\s*false;/);
    assert.match(clearStates, /global\.settings\.pause\s*=\s*false;/);
});

test('show projection set is explicit and fail-closed', () => {
    const actualShowSettings = Object.keys(SETTING_TARGET_POLICY).filter(name => name.startsWith('show'));
    assert.deepEqual(sorted(actualShowSettings), sorted(SHOW_PROJECTION_SETTINGS));
    for (const name of SHOW_PROJECTION_SETTINGS){
        const info = SETTING_STATE_CONTRACT[name];
        assert.equal(info.targetLayer, 'derived-state', name);
        assert.equal(info.persistence, 'none', name);
        assert.equal(info.simulationRole, 'derived-read-only', name);
        assert.equal(info.migrationDisposition, 'derive', name);
    }
});

test('region replacement map covers every reviewed legacy region flag exactly once', () => {
    const expected = ['space', 'portal', 'eden', 'tau'].flatMap(container =>
        EXPECTED_FIXED_NESTED_KEYS[container].map(key => `${container}.${key}`)
    );
    assert.deepEqual(sorted(REGION_REPLACEMENT_PATHS), sorted(expected));
    assert.deepEqual(sortedKeys(REGION_REPLACEMENT_MAP), sorted(expected));

    for (const regionPath of expected){
        const replacement = REGION_REPLACEMENT_MAP[regionPath];
        assert.equal(replacement.legacyPath, regionPath);
        assert.equal(replacement.targetLayer, 'game-state');
        assert.equal(replacement.authorityOwner, 'world/progression domain');
        assert.equal(replacement.migrationDisposition, 'translate');
        assert.equal(replacement.uiProjection, 'derived-state');

        const matches = matchNestedSettingPath(regionPath);
        assert.equal(matches.length, 1, `${regionPath}: expected exactly one nested rule`);
        const info = matches[0].classification;
        assert.equal(info.targetLayer, 'game-state', regionPath);
        assert.equal(info.persistence, 'game-save', regionPath);
        assert.equal(info.simulationRole, 'authoritative', regionPath);
        assert.equal(info.migrationDisposition, 'translate', regionPath);
        assertContractValid(`settings.${regionPath}`, info);
    }
});

test('legacy source proves region flags are persisted migration evidence rather than globally recomputed UI cache', () => {
    const varsSource = sourceFile('../../src/vars.js');
    const regionStateSection = sourceSection(varsSource, 'function setRegionStates(reset){');
    assert.match(regionStateSection, /if \(!global\.settings\[r\]\.hasOwnProperty\(v\) \|\| reset\)/);
    assert.match(regionStateSection, /global\.settings\[r\]\[v\]\s*=\s*false;/);

    assert.match(varsSource, /global\.settings\.space\.belt\)\{\s*global\.space\['space_station'\]/);

    const spaceSource = sourceFile('../../src/space.js');
    assert.match(spaceSource, /global\.settings\.space\.belt\s*=\s*true;/);

    const edenSource = sourceFile('../../src/edenic.js');
    assert.match(edenSource, /global\.settings\.eden\.isle\s*=\s*true;/);
});

test('fixed nested settings keys are ratcheted against pristine legacy state', () => {
    const settings = initializedSettings();
    for (const [container, expectedKeys] of Object.entries(EXPECTED_FIXED_NESTED_KEYS)){
        assert.ok(settings[container] && typeof settings[container] === 'object' && !Array.isArray(settings[container]), `${container} must be an object`);
        assert.deepEqual(sortedKeys(settings[container]), sorted(expectedKeys), `${container} nested keys changed and require M2C2 review`);
    }
});

test('every current nested settings leaf has exactly one legal target contract', () => {
    const settings = initializedSettings();
    const containers = ['arpa', 'eden', 'keyMap', 'msgFilters', 'portal', 'resBar', 'space', 'tau'];
    const paths = containers.flatMap(container => leafPaths(settings[container], container));
    assert.ok(paths.length > 0, 'nested settings inventory must not be empty');
    for (const nestedPath of paths){
        const matches = matchNestedSettingPath(nestedPath);
        assert.equal(matches.length, 1, `${nestedPath}: expected exactly one nested M2C2 rule, got ${matches.map(match => match.id).join(', ') || 'none'}`);
        assertContractValid(`settings.${nestedPath}`, matches[0].classification);
    }
});

test('ARPA navigation is split from progression-driven availability', () => {
    const selectedTab = matchNestedSettingPath('arpa.arpaTabs')[0].classification;
    assert.equal(selectedTab.targetLayer, 'ui-session');
    assert.equal(selectedTab.simulationRole, 'none');
    for (const key of ['physics', 'genetics', 'crispr', 'blood']){
        const info = matchNestedSettingPath(`arpa.${key}`)[0].classification;
        assert.equal(info.targetLayer, 'derived-state', key);
        assert.equal(info.migrationDisposition, 'derive', key);
    }
});

test('message-filter capability is split from user filter preferences', () => {
    const settings = initializedSettings();
    for (const [filter, value] of Object.entries(settings.msgFilters)){
        assert.deepEqual(sortedKeys(value), ['max', 'save', 'unlocked', 'vis'], `${filter}: message-filter shape changed`);
        const unlocked = matchNestedSettingPath(`msgFilters.${filter}.unlocked`)[0].classification;
        assert.equal(unlocked.targetLayer, 'derived-state', filter);
        for (const field of ['vis', 'max', 'save']){
            const pref = matchNestedSettingPath(`msgFilters.${filter}.${field}`)[0].classification;
            assert.equal(pref.targetLayer, 'application-preference', `${filter}.${field}`);
            assert.equal(pref.resetBehavior, 'survive-gameplay-reset', `${filter}.${field}`);
        }
    }
});

test('keyboard mappings and resource-bar visibility stay on the application side', () => {
    const settings = initializedSettings();
    for (const key of Object.keys(settings.keyMap)){
        const info = matchNestedSettingPath(`keyMap.${key}`)[0].classification;
        assert.equal(info.targetLayer, 'application-preference', key);
        assert.equal(info.simulationRole, 'none', key);
    }
    for (const key of Object.keys(settings.resBar)){
        const info = matchNestedSettingPath(`resBar.${key}`)[0].classification;
        assert.equal(info.targetLayer, 'application-preference', key);
        assert.equal(info.persistence, 'application-preference', key);
    }
});

test('runtime working state stays ephemeral and reconstructible', () => {
    for (const name of ['p_on', 'support_on', 'int_on', 'gal_on', 'spire_on', 'atrack', 'active_rituals']){
        const info = RUNTIME_STATE_CONTRACT[name];
        assert.equal(info.targetLayer, 'simulation-working', name);
        assert.equal(info.lifecycle, 'operation', name);
        assert.equal(info.persistence, 'none', name);
        assert.equal(info.simulationRole, 'working-context', name);
        assert.equal(info.migrationDisposition, 'reconstruct', name);
    }
    assert.equal(RUNTIME_STATE_CONTRACT.keyMap.targetLayer, 'application-working');
});

test('executable and platform legacy objects become services rather than state', () => {
    for (const name of ['callback_queue', 'webWorker', 'intervals']){
        const info = RUNTIME_STATE_CONTRACT[name];
        assert.equal(info.targetLayer, 'runtime-service', name);
        assert.equal(info.migrationDisposition, 'replace-by-service', name);
    }
    const storage = RUNTIME_STATE_CONTRACT.save;
    assert.equal(storage.targetLayer, 'platform-service');
    assert.equal(storage.migrationDisposition, 'replace-by-service');
});

test('message_logs selected view is split from reconstructed per-filter buffers', () => {
    const varsSource = sourceFile('../../src/vars.js');
    const sourceMatch = varsSource.match(/export const message_filters\s*=\s*\[([^\]]+)\]/);
    assert.ok(sourceMatch, 'vars.js must expose the reviewed message_filters constant');
    const sourceFilters = [...sourceMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
    assert.deepEqual(sourceFilters, EXPECTED_MESSAGE_LOG_FILTERS, 'message filter list changed and requires M2C2 review');

    const viewMatches = matchNestedRuntimePath('message_logs.view');
    assert.equal(viewMatches.length, 1);
    assert.equal(viewMatches[0].classification.targetLayer, 'ui-session');
    assertContractValid('runtime.message_logs.view', viewMatches[0].classification);

    for (const filter of sourceFilters){
        const matches = matchNestedRuntimePath(`message_logs.${filter}`);
        assert.equal(matches.length, 1, `message_logs.${filter} must have exactly one owner`);
        const info = matches[0].classification;
        assert.equal(info.targetLayer, 'application-working', filter);
        assert.equal(info.persistence, 'none', filter);
        assert.equal(info.migrationDisposition, 'reconstruct', filter);
        assertContractValid(`runtime.message_logs.${filter}`, info);
    }
});