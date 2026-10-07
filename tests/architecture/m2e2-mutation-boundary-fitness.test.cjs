'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    GAME_STATE_FILE,
    parseStrictFrozenStringArray,
    parseScopeDeclarations,
    analyzeGameStateComposition,
    productionCapabilityConsumerViolations,
    scanMutationBoundary,
} = require('./m2e2-mutation-boundary-fitness.cjs');
const { readOwnershipContract } = require('./m2e1-state-ownership-fitness.cjs');

const root = path.resolve(__dirname, '..', '..');
const contract = readOwnershipContract(root);
const gameStateSource = fs.readFileSync(path.join(root, ...GAME_STATE_FILE.split('/')), 'utf8');

function violationsFor(source){
    return analyzeGameStateComposition(source, contract).violations.join('\n');
}

function replaceOrThrow(source, search, replacement){
    assert.equal(source.includes(search), true, `fixture source must contain ${JSON.stringify(search)}`);
    return source.replace(search, replacement);
}

function writeFile(rootDir, relative, content){
    const file = path.join(rootDir, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
}

function withTempSourceRepo(files, callback){
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-m2e2-'));
    try {
        for (const [relative, content] of Object.entries(files)) writeFile(temp, relative, content);
        return callback(temp);
    }
    finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

test('M2E2 strict writable-root parser accepts only one frozen literal string array', () => {
    assert.deepEqual(
        parseStrictFrozenStringArray("const ROOTS = Object.freeze(['a', 'b']);", 'ROOTS'),
        ['a', 'b']
    );
    for (const source of [
        "const ROOTS = ['a'];",
        "const ROOTS = Object.freeze([name]);",
        "const ROOTS = Object.freeze(['a', ...extra]);",
        "const ROOTS = Object.freeze(['a', 'a']);",
        "const ROOTS = Object.freeze(['a']); const ROOTS = Object.freeze(['a']);",
    ]){
        assert.equal(parseStrictFrozenStringArray(source, 'ROOTS'), null, source);
    }
});

test('M2E2 scope parser requires literal single-root capabilities and ignores comment decoys', () => {
    const body = [
        "// const fake = mutationAuthority.createMutationScope({ id: 'fake', fields: ['fake'] });",
        "const real = mutationAuthority.createMutationScope({ id: 'real-owner', fields: ['realRoot'] });",
    ].join('\n');
    assert.deepEqual(parseScopeDeclarations(body), [
        { variable: 'real', id: 'real-owner', field: 'realRoot' },
    ]);
    assert.equal(
        parseScopeDeclarations("const real = mutationAuthority.createMutationScope({ id: owner, fields: ['realRoot'] });"),
        null
    );
    assert.equal(
        parseScopeDeclarations("const real = mutationAuthority.createMutationScope({ id: 'real-owner', fields: ['realRoot', 'other'] });"),
        null
    );
});

test('current GameState composition satisfies the static M2E2 capability graph', () => {
    const result = analyzeGameStateComposition(gameStateSource, contract);
    assert.deepEqual(result.violations, [], result.violations.join('\n'));
    assert.deepEqual(result.summary.readOnlyRoots, []);
    assert.deepEqual(result.summary.runtimeRoots, ['achievements']);
    assert.deepEqual(result.summary.scopes, [{ id: 'achievement-state', field: 'achievements' }]);
});

test('M2E2 rejects writable-root widening, metadata writes, and read-only capability drift', () => {
    let source = replaceOrThrow(
        gameStateSource,
        "const GAME_STATE_READ_ONLY_WRITABLE_ROOT_FIELDS = Object.freeze([]);",
        "const GAME_STATE_READ_ONLY_WRITABLE_ROOT_FIELDS = Object.freeze(['achievements']);"
    );
    assert.match(violationsFor(source), /zero writable roots/);

    source = replaceOrThrow(
        gameStateSource,
        "const GAME_STATE_RUNTIME_WRITABLE_ROOT_FIELDS = Object.freeze([\n    'achievements',\n]);",
        "const GAME_STATE_RUNTIME_WRITABLE_ROOT_FIELDS = Object.freeze([\n    'achievements',\n    'schemaVersion',\n]);"
    );
    const violations = violationsFor(source);
    assert.match(violations, /runtime writable roots must exactly equal/);
    assert.match(violations, /metadata root schemaVersion may not be runtime writable/);
});

test('M2E2 rejects transformed writable fields and alternate infrastructure callers', () => {
    let source = replaceOrThrow(
        gameStateSource,
        '        writableFields,\n    });',
        '        writableFields: [...writableFields],\n    });'
    );
    assert.match(violationsFor(source), /exact writableFields capability directly/);

    source = gameStateSource + "\nfunction rogue(initialState){ return createGameStateInfrastructure(initialState, GAME_STATE_RUNTIME_WRITABLE_ROOT_FIELDS); }\n";
    assert.match(violationsFor(source), /exactly two callers/);
});

test('M2E2 rejects wrong, widened, dynamic, or duplicate scopes', () => {
    let source = replaceOrThrow(gameStateSource, "id: 'achievement-state'", "id: 'wrong-owner'");
    assert.match(violationsFor(source), /must receive exactly one scope/);

    source = replaceOrThrow(
        gameStateSource,
        "fields: ['achievements']",
        "fields: ['achievements', 'schemaVersion']"
    );
    assert.match(violationsFor(source), /inspectable literal/);

    source = replaceOrThrow(gameStateSource, "id: 'achievement-state'", 'id: scopeId');
    assert.match(violationsFor(source), /inspectable literal/);

    source = replaceOrThrow(
        gameStateSource,
        '    const achievements = createAchievementStateService({ mutationScope });',
        "    const secondScope = mutationAuthority.createMutationScope({ id: 'second-owner', fields: ['achievements'] });\n    const achievements = createAchievementStateService({ mutationScope });"
    );
    assert.match(violationsFor(source), /exactly one scope per writable domain/);
});

test('M2E2 rejects raw scope and raw authority escape routes', () => {
    let source = replaceOrThrow(
        gameStateSource,
        '    const achievements = createAchievementStateService({ mutationScope });',
        '    const leakedScope = mutationScope;\n    const achievements = createAchievementStateService({ mutationScope });'
    );
    assert.match(violationsFor(source), /raw scope mutationScope.*declared and passed once/);

    source = replaceOrThrow(
        gameStateSource,
        '        achievements,\n    });',
        '        achievements,\n        mutationAuthority,\n    });'
    );
    const violations = violationsFor(source);
    assert.match(violations, /raw mutationAuthority may only be captured once/);
    assert.match(violations, /runtime public surface must be exactly/);
});

test('M2E2 rejects service miswiring and raw scope reuse', () => {
    let source = replaceOrThrow(
        gameStateSource,
        '    const achievements = createAchievementStateService({ mutationScope });',
        '    const achievements = createAchievementStateService({ mutationScope: otherScope });'
    );
    assert.match(violationsFor(source), /scope must flow directly/);

    source = replaceOrThrow(
        gameStateSource,
        '        achievements,\n    });',
        '        achievements: store,\n    });'
    );
    assert.match(violationsFor(source), /runtime property achievements must expose only/);

    source = replaceOrThrow(
        gameStateSource,
        '    const achievements = createAchievementStateService({ mutationScope });',
        '    const achievements = createAchievementStateService({ mutationScope });\n    void mutationScope;'
    );
    assert.match(violationsFor(source), /raw scope mutationScope.*declared and passed once/);
});

test('M2E2 production scanner rejects alternate state-store and mutation-service consumers', () => {
    withTempSourceRepo({
        'src/engine/rogue-store.mjs': "import { createStateStore } from './state/bridge/../state-store.mjs';\n",
        'src/engine/rogue-service.mjs': "import { createAchievementStateService } from './state/achievement-state-service.mjs';\n",
        'src/engine/rogue-authority.mjs': 'const mutationAuthority = {};\nmutationAuthority.createMutationScope;\n',
    }, temp => {
        const violations = productionCapabilityConsumerViolations(temp, contract).join('\n');
        assert.match(violations, /only GameState composition may consume state-store\.mjs/);
        assert.match(violations, /only GameState composition may construct the achievements mutation service/);
        assert.match(violations, /raw capability identifier mutationAuthority/);
        assert.match(violations, /raw capability identifier createMutationScope/);
    });
});

test('current repository has no unreviewed production capability consumers', () => {
    assert.deepEqual(productionCapabilityConsumerViolations(root, contract), []);
});

test('current repository satisfies the complete M2E2 mutation-boundary gate', async () => {
    const result = await scanMutationBoundary(root, contract);
    assert.deepEqual(result.violations, [], result.violations.join('\n'));
    assert.deepEqual(result.summary.writableRoots, ['achievements']);
    assert.deepEqual(result.summary.scopes, [{ id: 'achievement-state', field: 'achievements' }]);
});
