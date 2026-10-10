'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const fixtures = require('../fixtures/fixture-loader.cjs');

const root = path.resolve(__dirname, '../..');
const shimPath = path.join(root, 'tests/legacy/browser-shim.cjs');

function buildProductionHarness(){
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-m4e3-production-'));
    const bundlePath = path.join(tempDir, 'production-harness.cjs');

    esbuild.buildSync({
        stdin: {
            contents: `
                import './tests/legacy/legacy-api.js';
                import { production } from './src/prod.js';
                import { hellSupression } from './src/portal.js';
                import { p_on } from './src/vars.js';

                globalThis.__M4E3_PRODUCTION_TEST_API__ = {
                    legacy: globalThis.__EVOLVE_LEGACY_TEST_API__,
                    productionValue(id, val, wiki){
                        return production(id, val, wiki);
                    },
                    gateSuppression(wiki){
                        return hellSupression('gate', 0, wiki).supress;
                    },
                    setPowered(id, value){
                        p_on[id] = value;
                    },
                    clearPowered(id){
                        delete p_on[id];
                    },
                };
            `,
            resolveDir: root,
            sourcefile: 'm4e3-production-harness-entry.js',
            loader: 'js',
        },
        outfile: bundlePath,
        bundle: true,
        platform: 'browser',
        format: 'iife',
        target: ['es2020'],
        sourcemap: false,
        logLevel: 'warning',
        banner: {
            js: `require(${JSON.stringify(shimPath)});`
        }
    });

    require(bundlePath);
    const api = globalThis.__M4E3_PRODUCTION_TEST_API__;
    if (!api || !api.legacy){
        throw new Error('M4E3 production test harness failed to initialize');
    }

    function diagnoseBundledError(error){
        const stack = String(error?.stack || error);
        const match = /production-harness\.cjs:(\d+):(\d+)/.exec(stack);
        if (!match) return stack;
        const line = Number(match[1]);
        const lines = fs.readFileSync(bundlePath, 'utf8').split('\n');
        const start = Math.max(0, line - 5);
        const end = Math.min(lines.length, line + 4);
        const excerpt = lines.slice(start, end)
            .map((text, index) => `${start + index + 1}: ${text}`)
            .join('\n');
        return `${stack}\nGenerated bundle excerpt:\n${excerpt}`;
    }

    return {
        api,
        diagnoseBundledError,
        cleanup(){
            delete globalThis.__M4E3_PRODUCTION_TEST_API__;
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    };
}

test('M4E3 production seam preserves the reviewed explicit-state legacy matrix and a real fast-loop consumer', async () => {
    const harness = buildProductionHarness();
    const { api } = harness;
    const legacy = api.legacy;

    try {
        legacy.installLegacyState(legacy.pristineLegacyState());
        const state = legacy.legacyState();
        state.tech = state.tech || {};
        state.race = state.race || {};
        state.space = state.space || {};
        state.tauceti = state.tauceti || {};
        state.eden = state.eden || {};
        state.portal = state.portal || {};
        state.civic = state.civic || {};
        state.civic.govern = state.civic.govern || { type: 'anarchy' };

        state.race.universe = 'standard';
        delete state.race.high_pop;
        assert.equal(api.productionValue('biodome', 'food'), 0.25);
        state.race.universe = 'evil';
        assert.equal(api.productionValue('biodome', 'food'), 0.1);
        assert.equal(api.productionValue('biodome', 'cat_food'), 2);
        assert.equal(api.productionValue('biodome', 'lumber'), 1.5);
        assert.equal(api.productionValue('biodome', 'unknown'), undefined);

        delete state.race.truepath;
        assert.equal(api.productionValue('g_factory'), 0.6);
        state.race.truepath = 1;
        state.tech.isolation = 1;
        assert.equal(api.productionValue('g_factory'), 1.8);
        delete state.tech.isolation;
        state.civic.titan_colonist = { workers: 20 };
        api.clearPowered('ai_colonist');
        assert.equal(api.productionValue('g_factory'), 1);
        api.setPowered('ai_colonist', 4);
        assert.equal(api.productionValue('g_factory'), 0.05 * (20 + 4));

        state.civic.govern.type = 'anarchy';
        assert.equal(api.productionValue('vitreloy_plant'), 0.18);
        state.civic.govern.type = 'corpocracy';
        state.tech.high_tech = 15;
        assert.equal(api.productionValue('vitreloy_plant'), 0.18 * 1.3);
        state.tech.high_tech = 16;
        assert.equal(api.productionValue('vitreloy_plant'), 0.18 * 1.4);
        state.civic.govern.type = 'socialist';
        assert.equal(api.productionValue('vitreloy_plant'), 0.18 * 1.1);

        state.race.warlord = 1;
        assert.equal(api.productionValue('infernite_mine'), 0.5 * api.gateSuppression(false));
        delete state.race.warlord;

        state.space.titan_mine = { ratio: 90 };
        assert.equal(api.productionValue('titan_mine', 'adamantite'), 0.02 * 90 / 100);
        assert.equal(api.productionValue('titan_mine', 'aluminium'), 0.12 * (100 - 90) / 100);
        assert.equal(api.productionValue('titan_mine', 'other'), undefined);

        delete state.race.tough;
        delete state.tech.tau_pit_mining;
        delete state.tech.isolation;
        assert.equal(api.productionValue('mining_pit', 'materials'), 0.09);
        assert.equal(api.productionValue('mining_pit', 'iron'), 0.74);
        assert.equal(api.productionValue('mining_pit', 'unknown'), 0);
        state.tech.isolation = 1;
        assert.equal(api.productionValue('mining_pit', 'materials'), 0.12);

        delete state.tech.womling_mining;
        delete state.tech.womling_gene;
        assert.equal(api.productionValue('womling_mine', 'iron'), 1.377);
        state.tech.womling_mining = 2;
        state.tech.womling_gene = 1;
        assert.equal(api.productionValue('womling_mine', 'iron'), 1.377 * 1.3 * 1.25);
        assert.equal(api.productionValue('womling_mine', 'unknown'), undefined);

        delete state.tauceti.patrol_ship;
        assert.equal(api.productionValue('mining_ship'), 0);
        assert.equal(api.productionValue('whaling_ship'), 0);
        state.tauceti.patrol_ship = { support: 50, s_max: 50 };
        delete state.tech.tau_ore_mining;
        assert.equal(api.productionValue('mining_ship'), 10);
        assert.equal(api.productionValue('whaling_ship'), 8);
        state.tech.tau_ore_mining = 2;
        assert.equal(api.productionValue('mining_ship'), 12);
        state.tauceti.patrol_ship = { support: 100, s_max: 50 };
        const patrol = 1 - ((1 - 0.5) ** 1.4);
        assert.equal(api.productionValue('mining_ship'), 12 * patrol);
        assert.equal(api.productionValue('whaling_ship'), 8 * patrol);

        state.tech.hell_lake = 7;
        state.tech.railway = 20;
        delete state.race.warlord;
        delete state.eden.corruptor;
        assert.equal(api.productionValue('asphodel_harvester'), 0.075 * 1.2);
        state.race.warlord = 1;
        state.eden.corruptor = { count: 5, on: 5 };
        api.setPowered('corruptor', 5);
        assert.equal(api.productionValue('asphodel_harvester'), 1 + 5 * 0.06);

        const definition = fixtures.loadFixtureById('truepath-tauceti-human');
        const persisted = fixtures.materializePersistedFixture(definition, legacy);
        persisted.tech = persisted.tech || {};
        persisted.tauceti = persisted.tauceti || {};
        persisted.tech.tau_roid = Math.max(persisted.tech.tau_roid || 0, 4);
        persisted.tech.tau_ore_mining = 1;
        persisted.tauceti.mining_ship = {
            ...(persisted.tauceti.mining_ship || {}),
            count: 3,
            on: 3,
        };
        persisted.tauceti.patrol_ship = {
            ...(persisted.tauceti.patrol_ship || {}),
            count: 5,
            on: 5,
        };
        persisted.tauceti.ore_refinery = {
            ...(persisted.tauceti.ore_refinery || {}),
            count: 1,
            on: 0,
            fill: 0,
            max: 1000,
        };

        legacy.installLegacyState(persisted);
        await legacy.hydrateSimulationState();
        const runtime = legacy.legacyState();
        runtime.tauceti.ore_refinery.fill = 0;
        runtime.tauceti.ore_refinery.on = 0;
        runtime.tech.tau_ore_mining = 1;

        await legacy.runGameLoops(1);
        const transient = legacy.transientSimulationState();
        const miningSupport = transient.support_on.mining_ship || 0;
        assert.ok(miningSupport > 0, `real Tau support allocation did not keep a mining ship online: ${JSON.stringify(transient.support_on)}`);
        assert.ok(Number.isFinite(runtime.tauceti.patrol_ship.support));
        assert.ok(Number.isFinite(runtime.tauceti.patrol_ship.s_max));
        const miningRate = api.productionValue('mining_ship');
        assert.equal(
            runtime.tauceti.ore_refinery.fill,
            miningSupport * miningRate * 0.25,
            'real fastLoop mining-ship consumer must add the migrated rate to refinery fill'
        );
    }
    catch (error){
        throw new Error(harness.diagnoseBundledError(error));
    }
    finally {
        harness.cleanup();
    }
});
