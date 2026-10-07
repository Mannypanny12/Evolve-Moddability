'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    validateMutationSurfaceContract,
    readMutationSurfaceContract,
    parseExecutableFrozenStringArray,
    executableDeclarationViolations,
    resolveRealLocalImport,
    canonicalCapabilityConsumerViolations,
    inspectClosedDataSurface,
    scanMutationBoundaryReviewHardening,
} = require('./m2e2-mutation-boundary-review-hardening.cjs');
const {
    GAME_STATE_FILE,
    STATE_STORE_FILE,
} = require('./m2e2-mutation-boundary-fitness.cjs');
const { readOwnershipContract } = require('./m2e1-state-ownership-fitness.cjs');

const root = path.resolve(__dirname, '..', '..');
const ownershipContract = readOwnershipContract(root);
const surfaceContract = readMutationSurfaceContract(root);
const gameStateSource = fs.readFileSync(path.join(root, ...GAME_STATE_FILE.split('/')), 'utf8');

function clone(value){
    return JSON.parse(JSON.stringify(value));
}

function writeFile(rootDir, relative, content){
    const file = path.join(rootDir, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
}

function withTempRepo(files, callback){
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-m2e2-review-'));
    try {
        for (const [relative, content] of Object.entries(files)) writeFile(temp, relative, content);
        return callback(temp);
    }
    finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

test('M2E2 review surface contract is closed, exact, and tied to ownership domains', () => {
    assert.deepEqual(validateMutationSurfaceContract(surfaceContract, ownershipContract), []);

    const extraMethod = clone(surfaceContract);
    extraMethod.domains.achievements.publicMethods.push('unsafeWrite');
    assert.deepEqual(validateMutationSurfaceContract(extraMethod, ownershipContract), []);

    const missingDomain = clone(surfaceContract);
    delete missingDomain.domains.achievements;
    assert.match(validateMutationSurfaceContract(missingDomain, ownershipContract).join('\n'), /must exactly match ownership domains/);

    const duplicate = clone(surfaceContract);
    duplicate.domains.achievements.publicMethods.push('advance');
    assert.match(validateMutationSurfaceContract(duplicate, ownershipContract).join('\n'), /contains duplicate/);

    const extraField = clone(surfaceContract);
    extraField.domains.achievements.extra = true;
    assert.match(validateMutationSurfaceContract(extraField, ownershipContract).join('\n'), /fields must be exactly/);
});

test('M2E2 executable array parser cannot be satisfied by comment or string decoys', () => {
    assert.deepEqual(
        parseExecutableFrozenStringArray("const ROOTS = Object.freeze(['safe']);", 'ROOTS'),
        ['safe']
    );
    assert.equal(
        parseExecutableFrozenStringArray("const ROOTS = buildRoots();\n// const ROOTS = Object.freeze(['safe']);", 'ROOTS'),
        null
    );
    assert.equal(
        parseExecutableFrozenStringArray("const ROOTS = buildRoots();\nconst decoy = \"const ROOTS = Object.freeze(['safe']);\";", 'ROOTS'),
        null
    );
});

test('M2E2 hardening rejects writable-root comment decoys and infrastructure aliasing', () => {
    const commentDecoy = gameStateSource
        .replace(
            "const GAME_STATE_RUNTIME_WRITABLE_ROOT_FIELDS = Object.freeze([\n    'achievements',\n]);",
            "const GAME_STATE_RUNTIME_WRITABLE_ROOT_FIELDS = computeWritableRoots();\n// const GAME_STATE_RUNTIME_WRITABLE_ROOT_FIELDS = Object.freeze(['achievements']);"
        );
    assert.match(
        executableDeclarationViolations(commentDecoy, ownershipContract).join('\n'),
        /executable frozen literal runtime writable-root declaration/
    );

    const alias = gameStateSource + '\nconst hiddenInfrastructure = createGameStateInfrastructure;\n';
    assert.match(
        executableDeclarationViolations(alias, ownershipContract).join('\n'),
        /aliases are forbidden/
    );
});

test('M2E2 exact data-surface inspection rejects symbols, accessors, and extra methods', () => {
    const violations = [];
    const symbolSurface = { advance(){} };
    symbolSurface[Symbol('raw')] = () => undefined;
    inspectClosedDataSurface(symbolSurface, ['advance'], 'symbolSurface', violations, { functions: true });
    assert.match(violations.join('\n'), /symbol keys/);

    const accessorViolations = [];
    const accessorSurface = {};
    Object.defineProperty(accessorSurface, 'advance', {
        enumerable: true,
        get(){ return () => undefined; },
    });
    inspectClosedDataSurface(accessorSurface, ['advance'], 'accessorSurface', accessorViolations, { functions: true });
    assert.match(accessorViolations.join('\n'), /data field, not an accessor/);

    const extraViolations = [];
    inspectClosedDataSurface(
        { advance(){}, removeUniverseRank(){}, unsafeWrite(){} },
        ['advance', 'removeUniverseRank'],
        'service',
        extraViolations,
        { functions: true }
    );
    assert.match(extraViolations.join('\n'), /keys must be exactly/);
});

test('M2E2 canonical import resolution strips query/fragment spellings and resolves symlink aliases', () => {
    withTempRepo({
        [STATE_STORE_FILE]: 'export function createStateStore(){}\n',
        'src/engine/rogue.mjs': '',
    }, temp => {
        const rogue = path.join(temp, 'src/engine/rogue.mjs');
        const stateStore = path.join(temp, ...STATE_STORE_FILE.split('/'));
        assert.equal(resolveRealLocalImport(rogue, './state/state-store.mjs?probe'), fs.realpathSync(stateStore));
        assert.equal(resolveRealLocalImport(rogue, './state/state-store.mjs#probe'), fs.realpathSync(stateStore));

        const alias = path.join(temp, 'src/engine/state/store-alias.mjs');
        fs.symlinkSync('state-store.mjs', alias);
        assert.equal(resolveRealLocalImport(rogue, './state/store-alias.mjs'), fs.realpathSync(stateStore));
    });
});

test('M2E2 canonical production scan rejects query, fragment, and symlink-disguised capability imports', () => {
    withTempRepo({
        [GAME_STATE_FILE]: "import { createStateStore } from './state-store.mjs';\nimport { createAchievementStateService } from './achievement-state-service.mjs';\n",
        [STATE_STORE_FILE]: 'export function createStateStore(){}\n',
        'src/engine/state/achievement-state-service.mjs': 'export function createAchievementStateService(){}\n',
        'src/engine/rogue-query.mjs': "import { createStateStore } from './state/state-store.mjs?probe';\n",
        'src/engine/rogue-fragment.mjs': "import { createAchievementStateService } from './state/achievement-state-service.mjs#probe';\n",
        'src/engine/rogue-symlink.mjs': "import { createStateStore } from './state/store-alias.mjs';\n",
    }, temp => {
        fs.symlinkSync('state-store.mjs', path.join(temp, 'src/engine/state/store-alias.mjs'));
        const violations = canonicalCapabilityConsumerViolations(temp, ownershipContract).join('\n');
        assert.match(violations, /rogue-query\.mjs.*unreviewed state-store\.mjs consumer/);
        assert.match(violations, /rogue-fragment\.mjs.*unreviewed achievements mutation-service consumer/);
        assert.match(violations, /rogue-symlink\.mjs.*unreviewed state-store\.mjs consumer/);
    });
});

test('current repository passes the complete M2E2 review-hardening gate with exact reviewed service methods', async () => {
    const result = await scanMutationBoundaryReviewHardening(root, ownershipContract, surfaceContract);
    assert.deepEqual(result.violations, [], result.violations.join('\n'));
    assert.deepEqual(result.summary.reviewedSurfaces, [
        { root: 'achievements', publicMethods: ['advance', 'removeUniverseRank'] },
    ]);
});
