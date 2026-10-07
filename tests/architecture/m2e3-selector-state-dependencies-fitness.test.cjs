'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    exportedFunctions,
    normalizeLocalTarget,
    scanSelectorStateDependencies,
    selectorRootViolations,
    stateLayerDependencyViolations,
    staticNamedImportsFromTarget,
    validateSelectorContractShape,
} = require('./m2e3-selector-state-dependencies-fitness.cjs');

const root = path.resolve(__dirname, '..', '..');

function ownershipDomains(names){
    return Object.fromEntries(names.map(name => [name, {
        owner: `${name}-state`,
        schema: { module: `src/engine/state/${name}-state.mjs` },
        selectors: { module: `src/engine/state/${name}-selectors.mjs` },
        mutationService: { module: `src/engine/state/${name}-service.mjs` },
    }]));
}

test('M2E3 selector contract is closed and exactly covers authoritative domains', () => {
    const ownership = { domains: ownershipDomains(['achievements', 'resources']) };
    assert.deepEqual(validateSelectorContractShape({
        contractVersion: 1,
        domains: {
            achievements: { selectors: ['achievementRank'] },
            resources: { selectors: ['resourceAmount'] },
        },
    }, ownership), []);

    assert.match(validateSelectorContractShape({
        contractVersion: 1,
        domains: {
            achievements: { selectors: ['achievementRank'] },
        },
    }, ownership).join('\n'), /exactly equal M2E authoritative domains/);

    assert.match(validateSelectorContractShape({
        contractVersion: 1,
        domains: {
            achievements: { selectors: ['zeta', 'alpha'] },
            resources: { selectors: ['resourceAmount'] },
        },
    }, ownership).join('\n'), /deterministic sorted order/);
});

test('M2E3 selector root checks allow owned property reads and reject metadata, cross-domain, dynamic, and whole-state aliases', () => {
    const roots = ['achievements', 'resources', 'schemaVersion'];
    const clean = `
        export function rank(gameState, id){
            const record = gameState.achievements[id];
            return record?.rank ?? 0;
        }
        function helper(gameState, id){
            return gameState?.['achievements']?.[id];
        }
    `;
    assert.deepEqual(selectorRootViolations(clean, 'achievements', roots), []);

    for (const source of [
        `export function bad(gameState){ return gameState.resources; }`,
        `export function bad(gameState){ return gameState?.['schemaVersion']; }`,
        `export function bad(gameState, root){ return gameState[root]; }`,
        `export function bad(gameState){ const state = gameState; return state.achievements; }`,
        `export function bad(gameState){ const state = (gameState); return state.achievements; }`,
        `export function bad(gameState){ const { achievements } = gameState; return achievements; }`,
    ]){
        assert.notDeepEqual(selectorRootViolations(source, 'achievements', roots), [], source);
    }

    assert.deepEqual(selectorRootViolations(`
        // gameState.resources
        export function rank(gameState){ return 'gameState.resources'; }
    `, 'achievements', roots), []);
});

test('M2E3 named-import parser cannot swallow an earlier unrelated import', () => {
    const source = `
        import { EngineContractError, formatContentId } from '../../engine/identity.mjs';
        import {
            createGameStateRuntime,
            GAME_STATE_SCHEMA_VERSION,
        } from '../../engine/state/game-state.mjs';
    `;
    const imports = staticNamedImportsFromTarget(
        source,
        'src/legacy/bridge/achievement-state-adapter.mjs',
        'src/engine/state/game-state.mjs'
    );
    assert.equal(imports.length, 1);
    assert.deepEqual(imports[0].bindings, [
        { imported: 'createGameStateRuntime', local: 'createGameStateRuntime' },
        { imported: 'GAME_STATE_SCHEMA_VERSION', local: 'GAME_STATE_SCHEMA_VERSION' },
    ]);
});

test('M2E3 canonical target normalization recognizes query and fragment disguises', () => {
    assert.equal(
        normalizeLocalTarget('src/engine/state/achievement-selectors.mjs', './achievement-state.mjs?raw'),
        'src/engine/state/achievement-state.mjs'
    );
    assert.equal(
        normalizeLocalTarget('src/legacy/bridge/example.mjs', '../../engine/state/game-state.mjs#alias'),
        'src/engine/state/game-state.mjs'
    );
});

test('M2E3 selector export inspection sees only named function exports as reviewed selectors', () => {
    assert.deepEqual(exportedFunctions(`
        export function beta(gameState){}
        export function alpha(gameState){}
        function helper(){}
    `), ['alpha', 'beta']);
});

test('M2E3 state dependency DAG rejects cross-domain selector and mutation-service dependencies', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'm2e3-deps-'));
    try {
        const stateRoot = path.join(temp, 'src', 'engine', 'state');
        fs.mkdirSync(stateRoot, { recursive: true });
        fs.writeFileSync(path.join(stateRoot, 'common.mjs'), 'export const common = true;\n');
        fs.writeFileSync(path.join(stateRoot, 'state-store.mjs'), "import './common.mjs';\n");
        fs.writeFileSync(path.join(stateRoot, 'game-state.mjs'), "import './achievement-state.mjs';\n");
        fs.writeFileSync(path.join(stateRoot, 'achievement-state.mjs'), "import './common.mjs';\n");
        fs.writeFileSync(path.join(stateRoot, 'achievement-service.mjs'), "import './achievement-state.mjs';\n");
        fs.writeFileSync(path.join(stateRoot, 'resource-state.mjs'), "import './common.mjs';\n");
        fs.writeFileSync(path.join(stateRoot, 'resource-service.mjs'), "import './resource-state.mjs';\n");
        fs.writeFileSync(path.join(stateRoot, 'achievement-selectors.mjs'), "import './resource-state.mjs';\n");
        fs.writeFileSync(path.join(stateRoot, 'resource-selectors.mjs'), "import './resource-service.mjs';\n");

        const ownership = {
            domains: {
                achievements: {
                    schema: { module: 'src/engine/state/achievement-state.mjs' },
                    selectors: { module: 'src/engine/state/achievement-selectors.mjs' },
                    mutationService: { module: 'src/engine/state/achievement-service.mjs' },
                },
                resources: {
                    schema: { module: 'src/engine/state/resource-state.mjs' },
                    selectors: { module: 'src/engine/state/resource-selectors.mjs' },
                    mutationService: { module: 'src/engine/state/resource-service.mjs' },
                },
            },
        };
        const violations = stateLayerDependencyViolations(temp, ownership).join('\n');
        assert.match(violations, /achievement-selectors\.mjs .*resource-state\.mjs/);
        assert.match(violations, /resource-selectors\.mjs .*resource-service\.mjs/);
    }
    finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
});

test('current repository passes the complete M2E3 selector/state dependency gate', () => {
    const result = scanSelectorStateDependencies(root);
    assert.deepEqual(result.violations, [], result.violations.join('\n'));
});
