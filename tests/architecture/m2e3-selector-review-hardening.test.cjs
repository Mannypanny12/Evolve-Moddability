'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    achievementBindingReturnViolations,
    achievementSnapshotEscapeViolations,
    compositionAliasViolations,
    exactRoleDependencyViolations,
    realpathDependencyViolations,
    scanM2E3ReviewHardening,
    unclassifiedStateModuleViolations,
    wholeStateFlowViolations,
} = require('./m2e3-selector-review-hardening.cjs');

const root = path.resolve(__dirname, '..', '..');

function write(file, content){
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
}

function createOwnership(){
    return {
        domains: {
            achievements: {
                schema: { module: 'src/engine/state/achievement-state.mjs' },
                selectors: { module: 'src/engine/state/achievement-selectors.mjs' },
                mutationService: { module: 'src/engine/state/achievement-service.mjs' },
            },
        },
    };
}

function createMinimalStateLayer(temp){
    const state = path.join(temp, 'src', 'engine', 'state');
    write(path.join(temp, 'src', 'engine', 'identity.mjs'), 'export const identity = true;\n');
    write(path.join(state, 'common.mjs'), "import '../identity.mjs';\n");
    write(path.join(state, 'state-store.mjs'), "import '../identity.mjs';\nimport './common.mjs';\n");
    write(path.join(state, 'achievement-state.mjs'), "import '../identity.mjs';\nimport './common.mjs';\n");
    write(path.join(state, 'achievement-selectors.mjs'), "import '../identity.mjs';\nimport './common.mjs';\nimport './achievement-state.mjs';\n");
    write(path.join(state, 'achievement-service.mjs'), "import '../identity.mjs';\nimport './common.mjs';\nimport './achievement-state.mjs';\n");
    write(path.join(state, 'game-state.mjs'), "import './common.mjs';\nimport './state-store.mjs';\nimport './achievement-state.mjs';\nimport './achievement-service.mjs';\n");
    return state;
}

test('M2E3 hardening permits direct owned-root reads and reviewed same-name helper forwarding', () => {
    const source = `
        function achievementRecord(gameState, id){
            return gameState.achievements[id];
        }
        export function achievementRank(gameState, id){
            const direct = gameState.achievements[id];
            return achievementRecord(gameState, id)?.rank ?? direct?.rank ?? 0;
        }
    `;
    assert.deepEqual(wholeStateFlowViolations(source, 'test selector'), []);
});

test('M2E3 hardening rejects whole-state forwarding through renamed helpers and other containers', () => {
    for (const source of [
        `function leak(state){ return state.resources; } export function rank(gameState){ return leak(gameState); }`,
        `export function rank(gameState){ return gameState; }`,
        `export function rank(gameState){ return { state: gameState }; }`,
        `export function rank(gameState){ const state = gameState; return state.achievements; }`,
        `export function rank(gameState){ return consume(1, gameState); }`,
        `const leak = state => state.resources; export function rank(gameState){ return leak(gameState); }`,
    ]){
        assert.notDeepEqual(wholeStateFlowViolations(source, 'test selector'), [], source);
    }
});

test('M2E3 hardening rejects dependencies outside the exact reviewed role allowlists', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'm2e3-exact-deps-'));
    try {
        const state = createMinimalStateLayer(temp);
        write(path.join(temp, 'src', 'engine', 'runtime', 'rng.mjs'), 'export const rng = true;\n');
        write(
            path.join(state, 'achievement-state.mjs'),
            "import '../identity.mjs';\nimport './common.mjs';\nimport '../runtime/rng.mjs';\n"
        );
        const violations = exactRoleDependencyViolations(temp, createOwnership()).join('\n');
        assert.match(violations, /achievement-state\.mjs .*unreviewed dependency .*runtime\/rng\.mjs/);
    }
    finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
});

test('M2E3 hardening fails closed on unclassified engine state modules', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'm2e3-unclassified-'));
    try {
        const state = createMinimalStateLayer(temp);
        write(path.join(state, 'hidden-state-helper.mjs'), 'export const hidden = true;\n');
        assert.match(
            unclassifiedStateModuleViolations(temp, createOwnership()).join('\n'),
            /unclassified engine state module: src\/engine\/state\/hidden-state-helper\.mjs/
        );
    }
    finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
});

test('M2E3 hardening resolves symlink-disguised forbidden state dependencies to their real role', t => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'm2e3-realpath-'));
    try {
        const state = createMinimalStateLayer(temp);
        const alias = path.join(state, 'selector-alias.mjs');
        try {
            fs.symlinkSync('achievement-selectors.mjs', alias);
        }
        catch (error){
            t.skip(`host cannot create symlinks: ${error.code || error.message}`);
            return;
        }
        write(path.join(state, 'game-state.mjs'), "import './selector-alias.mjs';\n");

        const violations = realpathDependencyViolations(temp, createOwnership()).join('\n');
        assert.match(violations, /game-state\.mjs .*achievement-selectors\.mjs .*forbidden/);
    }
    finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
});

test('M2E3 hardening catches raw GameState composition imported through a filesystem alias', t => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'm2e3-composition-alias-'));
    try {
        const state = path.join(temp, 'src', 'engine', 'state');
        write(path.join(state, 'game-state.mjs'), 'export function createGameStateRuntime(){}\n');
        const alias = path.join(state, 'game-state-alias.mjs');
        try {
            fs.symlinkSync('game-state.mjs', alias);
        }
        catch (error){
            t.skip(`host cannot create symlinks: ${error.code || error.message}`);
            return;
        }
        write(path.join(temp, 'src', 'sneaky.js'), "import { createGameStateRuntime } from './engine/state/game-state-alias.mjs';\n");
        assert.match(compositionAliasViolations(temp).join('\n'), /filesystem alias/);
    }
    finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
});

test('M2E3 hardening forbids production consumers from taking the raw achievement snapshot escape hatch', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'm2e3-snapshot-'));
    try {
        const adapter = path.join(temp, 'src', 'legacy', 'bridge', 'achievement-state-adapter.mjs');
        write(adapter, 'export function achievementStateSnapshot(){}\n');
        write(
            path.join(temp, 'src', 'achieve.js'),
            "import { achievementStateSnapshot } from './legacy/bridge/achievement-state-adapter.mjs';\nachievementStateSnapshot();\n"
        );
        assert.match(achievementSnapshotEscapeViolations(temp).join('\n'), /raw achievementStateSnapshot/);
    }
    finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
});

test('M2E3 hardening requires legacy hydration calls to ignore the bind snapshot return value', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'm2e3-bind-return-'));
    try {
        const vars = path.join(temp, 'src', 'vars.js');
        write(vars, 'bindLegacyAchievementState(global);\nbindLegacyAchievementState(gameState);\n');
        assert.deepEqual(achievementBindingReturnViolations(temp), []);

        write(vars, 'const rawState = bindLegacyAchievementState(global);\n');
        assert.match(achievementBindingReturnViolations(temp).join('\n'), /must ignore the compatibility bind snapshot result/);
    }
    finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
});

test('current repository passes complete M2E3 selector review hardening', () => {
    assert.deepEqual(scanM2E3ReviewHardening(root), []);
});
