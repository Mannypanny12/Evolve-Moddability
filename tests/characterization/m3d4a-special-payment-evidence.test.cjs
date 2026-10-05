'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;

if (!legacy){
    throw new Error('Legacy test API did not initialize');
}

const root = path.resolve(__dirname, '../..');
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

function installState(mutator){
    const state = legacy.pristineLegacyState();
    state.civic.govern = state.civic.govern || { type: 'none' };
    mutator(state);
    legacy.installLegacyState(state);
    return legacy.legacyState();
}

test('antimatter Plasmid affordability resolves to AntiPlasmid for current and max checks', () => {
    const state = installState(state => {
        state.prestige.Plasmid = { count: 100 };
        state.prestige.AntiPlasmid = { count: 2 };
        state.race.universe = 'antimatter';
    });

    assert.equal(legacy.canAfford({ Plasmid: 3 }), false);
    assert.equal(legacy.canAffordMax({ Plasmid: 3 }), false);

    state.prestige.Plasmid.count = 0;
    state.prestige.AntiPlasmid.count = 3;
    assert.equal(legacy.canAfford({ Plasmid: 3 }), true);
    assert.equal(legacy.canAffordMax({ Plasmid: 3 }), true);
});

test('legacy independently checks prestige keys that converge on AntiPlasmid and can overdraw the resolved source', () => {
    const state = installState(state => {
        state.prestige.Plasmid = { count: 100 };
        state.prestige.AntiPlasmid = { count: 5 };
        state.race.universe = 'antimatter';
    });

    const costs = { Plasmid: 4, AntiPlasmid: 4 };
    assert.equal(legacy.canAfford(costs), true);
    assert.equal(legacy.canAffordMax(costs), true);
    assert.equal(legacy.pay(costs), true);

    assert.equal(state.prestige.Plasmid.count, 100);
    assert.equal(state.prestige.AntiPlasmid.count, -3);
});

test('Supply affordability fails closed when the purifier source does not exist', () => {
    installState(state => {
        delete state.portal.purifier;
    });

    assert.equal(legacy.canAfford({ Supply: 1 }), false);
    assert.equal(legacy.canAffordMax({ Supply: 1 }), false);
});

test('Species affordability resolves to the current species resource and keeps current vs queue semantics distinct', () => {
    const state = installState(state => {
        state.race.species = 'human';
        state.resource.human = {
            ...(state.resource.human || {}),
            amount: 2,
            max: 10,
            delta: 0,
            display: true,
        };
    });

    assert.equal(legacy.canAfford({ Species: 3 }), false);
    assert.equal(legacy.canAffordMax({ Species: 3 }), true);

    state.resource.human.amount = 3;
    state.resource.human.display = false;
    assert.equal(legacy.canAfford({ Species: 3 }), true);
    assert.equal(legacy.canAffordMax({ Species: 3 }), false);
});

test('Species payment floors default-job workers at zero while consuming population', () => {
    const state = installState(state => {
        state.race.species = 'human';
        state.resource.human = {
            ...(state.resource.human || {}),
            amount: 10,
            max: 100,
            delta: 0,
            display: true,
        };
        state.civic.d_job = 'unemployed';
        state.civic.unemployed = { workers: 2 };
    });

    assert.equal(legacy.pay({ Species: 5 }), true);
    assert.equal(state.resource.human.amount, 5);
    assert.equal(state.civic.unemployed.workers, 0);
});

test('Knowledge payment adds to existing cumulative spending rather than replacing it', () => {
    const state = installState(state => {
        state.resource.Knowledge = {
            ...(state.resource.Knowledge || {}),
            amount: 100,
            max: 1000,
            delta: 0,
            display: true,
        };
        state.stats.know = 7;
    });

    assert.equal(legacy.pay({ Knowledge: 25 }), true);
    assert.equal(state.resource.Knowledge.amount, 75);
    assert.equal(state.stats.know, 32);
});

test('vanilla species keys are safe canonical resource local IDs and legacy resource setup uses the exact species key', async () => {
    const { parseContentId } = await identityPromise;
    const racesSource = fs.readFileSync(path.join(root, 'src/races.js'), 'utf8');
    const resourcesSource = fs.readFileSync(path.join(root, 'src/resources.js'), 'utf8');

    const startToken = 'export const races = {';
    const start = racesSource.indexOf(startToken);
    assert.notEqual(start, -1, 'races export must exist');
    const end = racesSource.indexOf('\n};', start + startToken.length);
    assert.notEqual(end, -1, 'races export must have a top-level closing brace');

    const racesBlock = racesSource.slice(start + startToken.length, end);
    const speciesKeys = [...racesBlock.matchAll(/^    ([^:\n]+):\s*\{/gm)]
        .map(match => match[1].trim());

    assert.ok(speciesKeys.length > 20, 'expected a representative vanilla race catalog');
    assert.ok(speciesKeys.includes('protoplasm'));
    assert.ok(speciesKeys.includes('human'));

    for (const speciesKey of speciesKeys){
        assert.match(speciesKey, /^[a-z0-9][a-z0-9_-]*$/, `unsafe vanilla species key: ${speciesKey}`);
        const parsed = parseContentId(`evolve:resource/${speciesKey}`);
        assert.equal(parsed.type, 'resource');
        assert.equal(parsed.localId, speciesKey);
    }

    assert.match(
        resourcesSource,
        /loadResource\(global\.race\.species\s*,\s*wiki\s*,/,
        'legacy resource setup must create the population resource under the exact species key'
    );
});
