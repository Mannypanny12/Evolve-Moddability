'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    validateOwnershipContractShape,
    validateModulePath,
    compareGameStateRoots,
    parseOwnershipContractText,
    readOwnershipContract,
    readGameStateRoots,
    scanStateOwnership,
} = require('./m2e1-state-ownership-fitness.cjs');

const root = path.resolve(__dirname, '..', '..');

function clone(value){
    return JSON.parse(JSON.stringify(value));
}

function baseContract(){
    return {
        contractVersion: 1,
        metadataRoots: {
            schemaVersion: { owner: 'game-state-schema' },
        },
        domains: {
            achievements: {
                owner: 'achievement-state',
                schema: {
                    module: 'src/engine/state/achievement-state.mjs',
                    validator: 'validateAchievementState',
                    emptyFactory: 'createEmptyAchievementState',
                },
                selectors: {
                    module: 'src/engine/state/achievement-selectors.mjs',
                },
                mutationService: {
                    module: 'src/engine/state/achievement-state-service.mjs',
                    factory: 'createAchievementStateService',
                },
            },
        },
    };
}

function writeFile(rootDir, relative, content){
    const file = path.join(rootDir, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
}

function defaultGameStateSource(){
    return [
        "import { createEmptyAchievementState, validateAchievementState } from './achievement-state.mjs';",
        "import { createAchievementStateService } from './achievement-state-service.mjs';",
        "const GAME_STATE_ROOT_FIELDS = Object.freeze(['achievements', 'schemaVersion']);",
        'export function createEmptyGameState(){',
        '  return { schemaVersion: 2, achievements: createEmptyAchievementState() };',
        '}',
        'export function validateGameState(gameState){',
        "  if (!gameState || typeof gameState !== 'object' || Array.isArray(gameState)) throw new Error('invalid root');",
        "  if (gameState.schemaVersion !== 2) throw new Error('invalid schema version');",
        '  return { schemaVersion: 2, achievements: validateAchievementState(gameState.achievements) };',
        '}',
        'export function createGameStateRuntime(){',
        '  const achievements = createAchievementStateService();',
        '  return { achievements };',
        '}',
    ].join('\n');
}

async function withTempOwnershipRepo(options, callback){
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-m2e1-'));
    try {
        writeFile(temp, 'src/engine/state/game-state.mjs', options.gameState ?? defaultGameStateSource());
        writeFile(temp, 'src/engine/state/achievement-state.mjs', options.schema ?? [
            'export function createEmptyAchievementState(){ return {}; }',
            'export function validateAchievementState(value){',
            "  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length) throw new Error('invalid');",
            '  return {};',
            '}',
        ].join('\n'));
        writeFile(temp, 'src/engine/state/achievement-selectors.mjs', options.selectors ??
            'export function hasAchievement(){ return false; }\n');
        writeFile(temp, 'src/engine/state/achievement-state-service.mjs', options.service ??
            'export function createAchievementStateService(){ return {}; }\n');
        for (const [relative, content] of Object.entries(options.extraFiles || {})){
            writeFile(temp, relative, content);
        }
        return await callback(temp);
    }
    finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

test('M2E1 ownership contract is closed, versioned, and reserves schemaVersion as root metadata', () => {
    assert.deepEqual(validateOwnershipContractShape(baseContract()), []);

    const extra = baseContract();
    extra.unreviewed = true;
    assert.match(validateOwnershipContractShape(extra).join('\n'), /fields must be exactly/);

    const wrongVersion = baseContract();
    wrongVersion.contractVersion = 2;
    assert.match(validateOwnershipContractShape(wrongVersion).join('\n'), /contractVersion must be 1/);

    const missingMetadata = baseContract();
    delete missingMetadata.metadataRoots.schemaVersion;
    assert.match(validateOwnershipContractShape(missingMetadata).join('\n'), /schemaVersion must be explicitly classified/);

    const wrongMetadataOwner = baseContract();
    wrongMetadataOwner.metadataRoots.schemaVersion.owner = 'achievement-state';
    assert.match(validateOwnershipContractShape(wrongMetadataOwner).join('\n'), /owned by game-state-schema/);

    const gameplaySchemaVersion = baseContract();
    gameplaySchemaVersion.domains.schemaVersion = clone(gameplaySchemaVersion.domains.achievements);
    assert.match(validateOwnershipContractShape(gameplaySchemaVersion).join('\n'), /may not be declared as an authoritative domain/);
});

test('M2E1 strict JSON parsing rejects duplicate semantic keys before JSON.parse can overwrite them', () => {
    assert.throws(
        () => parseOwnershipContractText('{"owner":1,"owner":2}'),
        /duplicate JSON object key "owner"/
    );
    assert.throws(
        () => parseOwnershipContractText('{"owner":1,"\\u006fwner":2}'),
        /duplicate JSON object key "owner"/
    );
    assert.deepEqual(parseOwnershipContractText('{"owner":1}'), { owner: 1 });
});

test('M2E1 validates stable owner IDs and closed domain declarations', () => {
    const badOwner = baseContract();
    badOwner.domains.achievements.owner = 'Achievement State';
    assert.match(validateOwnershipContractShape(badOwner).join('\n'), /stable lowercase owner id/);

    const extraDomainField = baseContract();
    extraDomainField.domains.achievements.writeRoots = ['achievements'];
    assert.match(validateOwnershipContractShape(extraDomainField).join('\n'), /domain achievements fields must be exactly/);

    const duplicateModules = baseContract();
    duplicateModules.domains.achievements.selectors.module = duplicateModules.domains.achievements.schema.module;
    assert.match(validateOwnershipContractShape(duplicateModules).join('\n'), /modules must be distinct/);
});

test('M2E1 module paths are canonical and confined to engine state', () => {
    for (const invalid of [
        '../src/engine/state/achievement-state.mjs',
        'src/engine/state/../state/achievement-state.mjs',
        'src\\engine\\state\\achievement-state.mjs',
        '/src/engine/state/achievement-state.mjs',
        'src/legacy/bridge/achievement-state-adapter.mjs',
        'src/engine/state/achievement-state.js',
    ]){
        const violations = [];
        assert.equal(validateModulePath(invalid, 'module', violations), false, invalid);
        assert.equal(violations.length > 0, true, invalid);
    }
    const violations = [];
    assert.equal(validateModulePath('src/engine/state/achievement-state.mjs', 'module', violations), true);
    assert.deepEqual(violations, []);
});

test('M2E1 root classification is exact rather than subset based', () => {
    const contract = baseContract();
    assert.deepEqual(compareGameStateRoots(['achievements', 'schemaVersion'], contract), []);
    assert.match(
        compareGameStateRoots(['achievements', 'resources', 'schemaVersion'], contract).join('\n'),
        /root "resources" has no reviewed ownership classification/
    );
    assert.match(
        compareGameStateRoots(['schemaVersion'], contract).join('\n'),
        /stale root "achievements"/
    );
    assert.match(
        compareGameStateRoots(['achievements', 'achievements', 'schemaVersion'], contract).join('\n'),
        /must not contain duplicate roots/
    );
    assert.match(
        compareGameStateRoots(null, contract).join('\n'),
        /cannot inspect GAME_STATE_ROOT_FIELDS/
    );
});

test('M2E1 full implementation inspection accepts a coherent owned domain', async () => {
    await withTempOwnershipRepo({}, async temp => {
        const result = await scanStateOwnership(temp, baseContract());
        assert.deepEqual(result.violations, [], result.violations.join('\n'));
        assert.equal(result.summary.domainCount, 1);
        assert.deepEqual(result.summary.domains, [{ root: 'achievements', owner: 'achievement-state' }]);
    });
});

test('M2E1 ownership declarations must be wired into GameState composition, not merely exist as decoy modules', async () => {
    await withTempOwnershipRepo({
        extraFiles: {
            'src/engine/state/decoy-achievement-state.mjs': [
                'export function createEmptyAchievementState(){ return {}; }',
                'export function validateAchievementState(value){ return value; }',
            ].join('\n'),
        },
    }, async temp => {
        const contract = baseContract();
        contract.domains.achievements.schema.module = 'src/engine/state/decoy-achievement-state.mjs';
        const result = await scanStateOwnership(temp, contract);
        const violations = result.violations.join('\n');
        assert.match(violations, /must statically reference declared domain module .*decoy-achievement-state\.mjs/);
        assert.match(violations, /must statically import createEmptyAchievementState from .*decoy-achievement-state\.mjs/);
        assert.match(violations, /must statically import validateAchievementState from .*decoy-achievement-state\.mjs/);
    });
});

test('M2E1 requires GameState to compose the domain-owned empty factory rather than duplicate its current value', async () => {
    const hardcoded = defaultGameStateSource().replace(
        'return { schemaVersion: 2, achievements: createEmptyAchievementState() };',
        'return { schemaVersion: 2, achievements: {} };'
    );
    await withTempOwnershipRepo({ gameState: hardcoded }, async temp => {
        const result = await scanStateOwnership(temp, baseContract());
        assert.match(
            result.violations.join('\n'),
            /createEmptyGameState\(\) must initialize achievements directly through createEmptyAchievementState\(\)/
        );
    });
});

test('M2E1 fails closed on missing modules and missing declared exports', async () => {
    await withTempOwnershipRepo({}, async temp => {
        const missingModule = baseContract();
        missingModule.domains.achievements.selectors.module = 'src/engine/state/missing-selectors.mjs';
        let result = await scanStateOwnership(temp, missingModule);
        assert.match(result.violations.join('\n'), /does not exist/);

        const missingExport = baseContract();
        missingExport.domains.achievements.schema.validator = 'missingValidator';
        result = await scanStateOwnership(temp, missingExport);
        assert.match(result.violations.join('\n'), /must export function missingValidator/);
        assert.match(result.violations.join('\n'), /must statically import missingValidator/);
    });
});

test('M2E1 requires a real selector surface and mutation-service factory', async () => {
    await withTempOwnershipRepo({
        selectors: 'export const label = "not a selector";\n',
        service: 'export const createAchievementStateService = 3;\n',
    }, async temp => {
        const result = await scanStateOwnership(temp, baseContract());
        const violations = result.violations.join('\n');
        assert.match(violations, /selector module must export at least one named selector function/);
        assert.match(violations, /must export function createAchievementStateService/);
    });
});

test('M2E1 rejects null GameState defaults and validates the complete root including metadata', async () => {
    const nullDefault = defaultGameStateSource().replace(
        'return { schemaVersion: 2, achievements: createEmptyAchievementState() };',
        'return null;'
    );
    await withTempOwnershipRepo({ gameState: nullDefault }, async temp => {
        const result = await scanStateOwnership(temp, baseContract());
        assert.match(result.violations.join('\n'), /must return a plain root object/);
    });

    const wrongVersion = defaultGameStateSource().replace(
        'return { schemaVersion: 2, achievements: createEmptyAchievementState() };',
        'return { schemaVersion: 99, achievements: createEmptyAchievementState() };'
    );
    await withTempOwnershipRepo({ gameState: wrongVersion }, async temp => {
        const result = await scanStateOwnership(temp, baseContract());
        assert.match(result.violations.join('\n'), /empty state fails validateGameState\(\): invalid schema version/);
    });
});

test('M2E1 never skips undefined domain defaults or undefined validator results', async () => {
    await withTempOwnershipRepo({
        schema: [
            'export function createEmptyAchievementState(){ return undefined; }',
            'export function validateAchievementState(){ return {}; }',
        ].join('\n'),
    }, async temp => {
        const result = await scanStateOwnership(temp, baseContract());
        assert.match(result.violations.join('\n'), /empty factory must already return the validator's canonical empty representation/);
    });

    await withTempOwnershipRepo({
        schema: [
            'export function createEmptyAchievementState(){ return {}; }',
            'export function validateAchievementState(){ return undefined; }',
        ].join('\n'),
    }, async temp => {
        const result = await scanStateOwnership(temp, baseContract());
        assert.match(result.violations.join('\n'), /validator returned undefined for its empty state/);
    });
});

test('M2E1 proves owner defaults validate and GameState composes that exact default', async () => {
    await withTempOwnershipRepo({
        schema: [
            'export function createEmptyAchievementState(){ return { bad: true }; }',
            "export function validateAchievementState(){ throw new Error('domain invariant failed'); }",
        ].join('\n'),
        gameState: defaultGameStateSource(),
    }, async temp => {
        const result = await scanStateOwnership(temp, baseContract());
        const violations = result.violations.join('\n');
        assert.match(violations, /empty state fails its declared validator: domain invariant failed/);
        assert.match(violations, /GameState empty state fails validateGameState\(\): domain invariant failed/);
    });
});

test('M2E1 catches GameState empty-root drift independently of the ownership manifest', async () => {
    const missingRoot = defaultGameStateSource().replace(
        'return { schemaVersion: 2, achievements: createEmptyAchievementState() };',
        'return { schemaVersion: 2 };'
    );
    await withTempOwnershipRepo({ gameState: missingRoot }, async temp => {
        const result = await scanStateOwnership(temp, baseContract());
        assert.match(result.violations.join('\n'), /empty factory roots .* do not match GAME_STATE_ROOT_FIELDS/);
    });
});

test('M2E1 owned module paths may not hide behind symbolic links', async t => {
    await withTempOwnershipRepo({}, async temp => {
        const selector = path.join(temp, 'src', 'engine', 'state', 'achievement-selectors.mjs');
        const outside = path.join(temp, 'src', 'engine', 'outside-selectors.mjs');
        fs.writeFileSync(outside, 'export function hiddenSelector(){ return false; }\n');
        fs.unlinkSync(selector);
        try {
            fs.symlinkSync('../outside-selectors.mjs', selector);
        }
        catch (error){
            t.skip(`symlink creation unavailable on this host: ${error.message}`);
            return;
        }
        const result = await scanStateOwnership(temp, baseContract());
        assert.match(result.violations.join('\n'), /may not traverse symbolic links/);
    });
});

test('current repository ownership contract exactly covers the inspectable GameState root', () => {
    const contract = readOwnershipContract(root);
    const roots = readGameStateRoots(root);
    assert.deepEqual(validateOwnershipContractShape(contract), []);
    assert.deepEqual(compareGameStateRoots(roots, contract), []);
});

test('current repository satisfies the complete M2E1 state-domain ownership gate', async () => {
    const result = await scanStateOwnership(root);
    assert.deepEqual(result.violations, [], result.violations.join('\n'));
    assert.equal(result.summary.contractVersion, 1);
    assert.deepEqual(result.summary.metadataRoots, ['schemaVersion']);
    assert.deepEqual(result.summary.domains, [{ root: 'achievements', owner: 'achievement-state' }]);
});
