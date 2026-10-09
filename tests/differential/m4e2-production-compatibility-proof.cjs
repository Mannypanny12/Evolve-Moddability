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
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-m4e2-production-'));
    const bundlePath = path.join(tempDir, 'production-harness.cjs');

    esbuild.buildSync({
        stdin: {
            contents: `
                import './tests/legacy/legacy-api.js';
                import { production } from './src/prod.js';
                import { breakdown } from './src/vars.js';

                globalThis.__M4E2_PRODUCTION_TEST_API__ = {
                    legacy: globalThis.__EVOLVE_LEGACY_TEST_API__,
                    productionValue(id, val, wiki){
                        return production(id, val, wiki);
                    },
                    productionBreakdown(resource){
                        return structuredClone((breakdown.p && breakdown.p[resource]) || {});
                    }
                };
            `,
            resolveDir: root,
            sourcefile: 'm4e2-production-harness-entry.js',
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
    const api = globalThis.__M4E2_PRODUCTION_TEST_API__;
    if (!api || !api.legacy){
        throw new Error('M4E2 production test harness failed to initialize');
    }

    return {
        api,
        cleanup(){
            delete globalThis.__M4E2_PRODUCTION_TEST_API__;
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    };
}

function setTech(state, id, value){
    if (value === undefined){
        delete state.tech[id];
    }
    else {
        state.tech[id] = value;
    }
}

test('M4E2 production seam preserves the frozen legacy matrix and a real fast-loop consumer', async t => {
    const harness = buildProductionHarness();
    const { api } = harness;
    const legacy = api.legacy;

    try {
        legacy.installLegacyState(legacy.pristineLegacyState());
        const state = legacy.legacyState();
        state.tech = state.tech || {};
        state.space = state.space || {};

        await t.test('fixed scalar and variant seam behavior remains byte-for-byte compatible', () => {
            const constants = new Map([
                ['transmitter', 2.5],
                ['elerium_prospector', 0.014],
                ['neutron_miner', 0.055],
                ['bolognium_ship', 0.008],
                ['excavator', 0.2],
                ['water_freighter', 1.25],
                ['orichalcum_mine', 0.08],
                ['uranium_mine', 0.025],
                ['neutronium_mine', 0.04],
                ['elerium_mine', 0.009],
                ['whaling_station', 12],
                ['alien_outpost', 0.01],
            ]);
            for (const [id, expected] of constants){
                assert.equal(api.productionValue(id), expected, id);
            }

            assert.equal(api.productionValue('harvester', 'helium'), 0.85);
            assert.equal(api.productionValue('harvester', 'deuterium'), 0.15);
            assert.equal(api.productionValue('harvester'), undefined);
            assert.equal(api.productionValue('harvester', 'unknown'), undefined);

            const shadow = { elerium: 0.02, infernite: 0.015, vitreloy: 0.22 };
            for (const [variant, expected] of Object.entries(shadow)){
                assert.equal(api.productionValue('shadow_mine', variant, false), expected);
                assert.equal(api.productionValue('shadow_mine', variant, true), expected);
            }
            assert.equal(api.productionValue('shadow_mine'), undefined);
            assert.equal(api.productionValue('shadow_mine', 'unknown'), undefined);
            assert.equal(api.productionValue('__m4e2_unknown_production__'), undefined);
        });

        await t.test('technology thresholds and exact completion gates preserve legacy state extraction', () => {
            setTech(state, 'helium', undefined);
            assert.equal(api.productionValue('gas_mining'), 0.5);
            setTech(state, 'helium', 1);
            assert.equal(api.productionValue('gas_mining'), 0.65);

            const oilExpected = new Map([
                [0, 0.4],
                [3, 0.4],
                [4, 0.48],
                [5, 0.48 * 1.25],
                [6, 0.48 * 1.75],
                [7, 0.48 * 2],
                [8, 0.48 * 2],
            ]);
            for (const [level, expected] of oilExpected){
                setTech(state, 'oil', level);
                assert.equal(api.productionValue('oil_extractor'), expected, `oil ${level}`);
            }

            const asteroidCases = [
                [5, [0.005, 0.055, 2]],
                [6, [0.0075, 0.08, 3]],
                [7, [0.009, 0.1, 4]],
                [8, [0.009, 0.1, 4]],
            ];
            for (const [level, expected] of asteroidCases){
                setTech(state, 'asteroid', level);
                assert.equal(api.productionValue('elerium_ship'), expected[0], `elerium ${level}`);
                assert.equal(api.productionValue('iridium_ship'), expected[1], `iridium ${level}`);
                assert.equal(api.productionValue('iron_ship'), expected[2], `iron ${level}`);
            }

            setTech(state, 'tau_ore_mining', undefined);
            assert.equal(api.productionValue('ore_refinery'), 25);
            setTech(state, 'tau_ore_mining', 1);
            assert.equal(api.productionValue('ore_refinery'), 40);

            state.space.crashed_ship = { count: 99 };
            state.space.digsite = { count: 99 };
            for (const count of [99, 100, 101]){
                state.space.crashed_ship.count = count;
                state.space.digsite.count = count;
                assert.equal(api.productionValue('lander'), count === 100 ? 0.005 : 0, `lander ${count}`);
                assert.equal(api.productionValue('shock_trooper'), count === 100 ? 0.0018 : 0, `shock ${count}`);
                assert.equal(api.productionValue('tank'), count === 100 ? 0.0018 : 0, `tank ${count}`);
            }
        });

        await t.test('Isolation families preserve variants, undefined fallbacks, and the tau-water no-read quirk', () => {
            const miningByIsolation = {
                false: {
                    iron: 1.85,
                    aluminium: 1.85,
                    iridium: 0.35,
                    neutronium: 0.35,
                    orichalcum: 0.25,
                    elerium: 0.02,
                },
                true: {
                    iron: 2.22,
                    aluminium: 2.22,
                    iridium: 0.42,
                    neutronium: 0.42,
                    orichalcum: 0.3,
                    elerium: 0.024,
                }
            };

            for (const isolation of [false, true]){
                setTech(state, 'isolation', isolation ? 1 : undefined);
                assert.equal(api.productionValue('tau_farm', 'food'), isolation ? 15 : 9);
                assert.equal(api.productionValue('tau_farm', 'lumber'), isolation ? 12 : 5.5);
                assert.equal(api.productionValue('tau_farm', 'water'), 0.35);
                assert.equal(api.productionValue('refueling_station'), isolation ? 18.5 : 9.35);
                assert.equal(api.productionValue('whaling_ship_oil'), isolation ? 0.78 : 0.42);

                for (const [variant, expected] of Object.entries(miningByIsolation[String(isolation)])){
                    assert.equal(api.productionValue('mining_ship_ore', variant), expected, `${variant} isolation=${isolation}`);
                }
            }

            assert.equal(api.productionValue('tau_farm'), undefined);
            assert.equal(api.productionValue('tau_farm', 'unknown'), undefined);
            assert.equal(api.productionValue('mining_ship_ore'), undefined);
            assert.equal(api.productionValue('mining_ship_ore', 'unknown'), undefined);

            Object.defineProperty(state.tech, 'isolation', {
                configurable: true,
                enumerable: true,
                get(){
                    throw new Error('tau water must not read Isolation');
                }
            });
            assert.equal(api.productionValue('tau_farm', 'water'), 0.35);
            Object.defineProperty(state.tech, 'isolation', {
                configurable: true,
                enumerable: true,
                writable: true,
                value: 0,
            });
        });

        await t.test('gas-mining fast-loop contribution stays differential-compatible with the legacy formula', async () => {
            const definition = fixtures.loadFixtureById('early-space-human');
            const persisted = fixtures.materializePersistedFixture(definition, legacy);
            persisted.tech = persisted.tech || {};
            persisted.city = persisted.city || {};
            persisted.space = persisted.space || {};
            persisted.resource = persisted.resource || {};
            persisted.tech.space = Math.max(persisted.tech.space || 0, 5);
            persisted.tech.gas_giant = 1;
            delete persisted.tech.helium;
            persisted.space.gas_mining = { count: 2, on: 2 };

            // The legacy fast loop derives p_on from the real power allocator on every
            // tick. Give this focused consumer proof deterministic surplus generation
            // and make gas mining the first power priority instead of injecting p_on.
            persisted.city.coal_power = { count: 3, on: 3 };
            persisted.resource.Coal = persisted.resource.Coal || {};
            persisted.resource.Coal.amount = Math.max(persisted.resource.Coal.amount || 0, 1000);
            persisted.resource.Coal.max = Math.max(persisted.resource.Coal.max || 0, 1000);
            persisted.resource.Coal.display = true;
            persisted.power = ['spc_gas:gas_mining'];

            legacy.installLegacyState(persisted);
            await legacy.hydrateSimulationState();

            const runtime = legacy.legacyState();
            assert.ok(runtime.tech.space >= 5, 'gas-mining proof requires gas-giant-era space progression');
            assert.equal(runtime.tech.gas_giant, 1, 'gas-mining proof requires the gas-giant unlock');
            assert.equal(runtime.space.gas_mining.count, 2);
            assert.equal(runtime.space.gas_mining.on, 2);
            assert.equal(runtime.city.coal_power.on, 3);
            assert.equal(runtime.power[0], 'spc_gas:gas_mining');

            delete runtime.tech.helium;
            await legacy.runGameLoops(1);
            const lockedTransient = legacy.transientSimulationState();
            assert.equal(
                lockedTransient.p_on.gas_mining,
                2,
                `legacy power allocation did not keep both gas collectors online: ${JSON.stringify(lockedTransient.p_on.gas_mining)}`
            );
            const lockedValues = Object.values(api.productionBreakdown('Helium_3'));
            assert.ok(
                lockedValues.includes('1v'),
                `legacy gas-mining contribution 2 * 0.5 was not observed: ${JSON.stringify(lockedValues)}`
            );

            runtime.tech.helium = 1;
            await legacy.runGameLoops(1);
            const unlockedTransient = legacy.transientSimulationState();
            assert.equal(
                unlockedTransient.p_on.gas_mining,
                2,
                `legacy power allocation did not keep both upgraded gas collectors online: ${JSON.stringify(unlockedTransient.p_on.gas_mining)}`
            );
            const unlockedValues = Object.values(api.productionBreakdown('Helium_3'));
            assert.ok(
                unlockedValues.includes('1.3v'),
                `legacy gas-mining contribution 2 * 0.65 was not observed: ${JSON.stringify(unlockedValues)}`
            );
        });
    }
    finally {
        harness.cleanup();
    }
});
