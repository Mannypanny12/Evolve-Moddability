'use strict';

const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const shimPath = path.join(root, 'tests/legacy/browser-shim.cjs');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm4d-oil-well-live-'));
const bundlePath = path.join(tempDir, 'm4d-oil-well-live.cjs');

esbuild.buildSync({
    stdin: {
        contents: `
            import './tests/legacy/legacy-api.js';
            import { production } from './src/prod.js';
            globalThis.__EVOLVE_M4D_PRODUCTION_TEST_API__ = {
                oilWellProduction(){ return production('oil_well'); }
            };
        `,
        resolveDir: root,
        sourcefile: 'm4d-oil-well-live-entry.js',
    },
    outfile: bundlePath,
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: ['es2020'],
    sourcemap: 'inline',
    logLevel: 'warning',
    banner: {
        js: `require(${JSON.stringify(shimPath)});`,
    },
});

require(bundlePath);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;
const live = globalThis.__EVOLVE_M4D_PRODUCTION_TEST_API__;

if (!legacy || !live){
    throw new Error('M4D live Oil Well test bundle did not initialize');
}

function oilWellFromLiveSeam({
    oilTechLevel = 0,
    geologyBonus = 0,
    biome = 'grassland',
    rejuvenated = false,
    dirtyJobs = false,
    enhancedGovernor = false,
    warlord = false,
    pumpjackRank = 0,
} = {}){
    const state = legacy.pristineLegacyState();
    state.tech.oil = oilTechLevel;
    state.city.geology = state.city.geology || {};
    state.city.geology.Oil = geologyBonus;
    state.city.biome = biome;

    if (rejuvenated) state.race.rejuvenated = 1;
    else delete state.race.rejuvenated;

    if (dirtyJobs){
        state.race.governor = { g: { bg: 'bluecollar' } };
        if (enhancedGovernor) state.genes.governor = 3;
        else delete state.genes.governor;
    }
    else {
        delete state.race.governor;
        delete state.genes.governor;
    }

    if (warlord) state.race.warlord = 1;
    else delete state.race.warlord;
    state.portal.pumpjack = { ...(state.portal.pumpjack || {}), rank: pumpjackRank };

    legacy.installLegacyState(state);
    return live.oilWellProduction();
}

test.after(() => {
    delete globalThis.__EVOLVE_M4D_PRODUCTION_TEST_API__;
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('M4D live prod.js seam resolves every Oil Well biome variant through races.js', () => {
    const cases = [
        { biome: 'grassland', rejuvenated: false, multiplier: 1 },
        { biome: 'grassland', rejuvenated: true, multiplier: 1 },
        { biome: 'desert', rejuvenated: false, multiplier: 1.1 },
        { biome: 'desert', rejuvenated: true, multiplier: 1.18 },
        { biome: 'tundra', rejuvenated: false, multiplier: 0.9 },
        { biome: 'tundra', rejuvenated: true, multiplier: 0.8 },
        { biome: 'taiga', rejuvenated: false, multiplier: 0.92 },
        { biome: 'taiga', rejuvenated: true, multiplier: 0.88 },
    ];

    for (const entry of cases){
        assert.equal(
            oilWellFromLiveSeam(entry),
            0.4 * entry.multiplier,
            `${entry.biome} rejuvenated=${entry.rejuvenated}`
        );
    }
});

test('M4D live prod.js seam resolves Dirty Jobs through the real governor helper', () => {
    assert.equal(oilWellFromLiveSeam({ dirtyJobs: false }), 0.4);
    assert.equal(oilWellFromLiveSeam({ dirtyJobs: true }), 0.4 * 1.14);
    assert.equal(
        oilWellFromLiveSeam({ dirtyJobs: true, enhancedGovernor: true }),
        0.4 * 1.18
    );
});

test('M4D live prod.js seam preserves Warlord pumpjack rank-zero fallback', () => {
    assert.equal(
        oilWellFromLiveSeam({ warlord: true, pumpjackRank: 0 }),
        0.4 * 1.24
    );
    assert.equal(
        oilWellFromLiveSeam({ warlord: true, pumpjackRank: 3 }),
        0.4 * 1.72
    );
});

test('M4D live prod.js seam preserves the complete legacy modifier order', () => {
    assert.equal(
        oilWellFromLiveSeam({
            oilTechLevel: 6,
            geologyBonus: 0.25,
            biome: 'desert',
            rejuvenated: true,
            dirtyJobs: true,
            enhancedGovernor: true,
            warlord: true,
            pumpjackRank: 3,
        }),
        0.48 * 1.75 * 1.25 * 1.18 * 1.18 * 1.72
    );
});
