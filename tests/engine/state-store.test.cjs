'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const storePromise = import(pathToFileURL(path.join(root, 'src/engine/state/state-store.mjs')).href);
const commonPromise = import(pathToFileURL(path.join(root, 'src/engine/state/common.mjs')).href);
const gameStatePromise = import(pathToFileURL(path.join(root, 'src/engine/state/game-state.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [store, common, gameState, identity] = await Promise.all([
        storePromise,
        commonPromise,
        gameStatePromise,
        identityPromise,
    ]);
    return { ...store, ...common, ...gameState, ...identity };
}

function fixtureState(){
    return {
        schemaVersion: 1,
        alpha: {
            count: 1,
            'evolve:resource/food': { amount: 10 },
        },
        beta: { count: 2 },
        queue: ['a', 'b'],
    };
}

function createFixtureInfrastructure(createStateStore, canonicalizeStateValue, options = {}){
    return createStateStore({
        initialState: options.initialState ?? fixtureState(),
        validateState: options.validateState ?? (value => canonicalizeStateValue(value, 'fixtureState')),
        writableFields: options.writableFields ?? ['alpha', 'beta', 'queue'],
    });
}

function expectCode(fn, EngineContractError, code){
    assert.throws(
        fn,
        error => error instanceof EngineContractError && error.code === code,
        `expected EngineContractError ${code}`
    );
}

test('M2B store construction detaches, canonicalizes, deeply freezes state, and separates mutation authority', async () => {
    const { createStateStore, canonicalizeStateValue } = await modules();
    const input = fixtureState();
    const { store, mutationAuthority } = createFixtureInfrastructure(
        createStateStore,
        canonicalizeStateValue,
        { initialState: input }
    );
    const state = store.read();

    assert.notEqual(state, input);
    assert.notEqual(state.alpha, input.alpha);
    assert.equal(Object.isFrozen(state), true);
    assert.equal(Object.isFrozen(state.alpha), true);
    assert.equal(Object.isFrozen(state.queue), true);
    assert.equal(Object.isFrozen(store), true);
    assert.equal(Object.isFrozen(mutationAuthority), true);
    assert.equal(store.createMutationScope, undefined);
    assert.equal(typeof mutationAuthority.createMutationScope, 'function');

    input.alpha.count = 99;
    assert.equal(state.alpha.count, 1);
    assert.throws(() => {
        state.alpha.count = 50;
    }, TypeError);
    assert.equal(store.read().alpha.count, 1);
});

test('M2B selectors read frozen committed state synchronously and cannot open transactions or mint authority', async () => {
    const { createStateStore, canonicalizeStateValue, EngineContractError } = await modules();
    const { store, mutationAuthority } = createFixtureInfrastructure(createStateStore, canonicalizeStateValue);
    const alphaScope = mutationAuthority.createMutationScope({ id: 'alpha-owner', fields: ['alpha'] });

    assert.equal(store.select((state, extra) => state.alpha.count + extra, 4), 5);
    assert.throws(() => store.select(state => {
        state.alpha.count = 10;
    }), TypeError);

    expectCode(
        () => store.select(() => alphaScope.transaction('from-selector', draft => {
            draft.alpha.count = 3;
        })),
        EngineContractError,
        'STATE_ACCESS_REENTRANCY'
    );

    expectCode(
        () => store.select(() => mutationAuthority.createMutationScope({
            id: 'selector-created',
            fields: ['beta'],
        })),
        EngineContractError,
        'STATE_ACCESS_REENTRANCY'
    );

    let asyncSelectorCalled = false;
    expectCode(
        () => store.select(async state => {
            asyncSelectorCalled = true;
            return state.alpha.count;
        }),
        EngineContractError,
        'INVALID_STATE_SELECTOR'
    );
    assert.equal(asyncSelectorCalled, false);

    expectCode(
        () => store.select(() => ({ then(){} })),
        EngineContractError,
        'INVALID_STATE_SELECTOR'
    );
    assert.equal(store.getRevision(), 0);
});

test('M2B snapshots are detached, deeply frozen, and deterministic', async () => {
    const { createStateStore, canonicalizeStateValue } = await modules();
    const left = fixtureState();
    const right = {
        queue: ['a', 'b'],
        beta: { count: 2 },
        alpha: {
            'evolve:resource/food': { amount: 10 },
            count: 1,
        },
        schemaVersion: 1,
    };

    const { store: leftStore } = createFixtureInfrastructure(
        createStateStore,
        canonicalizeStateValue,
        { initialState: left }
    );
    const { store: rightStore } = createFixtureInfrastructure(
        createStateStore,
        canonicalizeStateValue,
        { initialState: right }
    );
    const first = leftStore.snapshot();
    const second = leftStore.snapshot();

    assert.notEqual(first, leftStore.read());
    assert.notEqual(first, second);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.alpha), true);
    assert.equal(JSON.stringify(first), JSON.stringify(rightStore.snapshot()));
});

test('M2B scoped transactions commit atomically and produce deterministic change diagnostics', async () => {
    const { createStateStore, canonicalizeStateValue } = await modules();
    const { store, mutationAuthority } = createFixtureInfrastructure(createStateStore, canonicalizeStateValue);
    const scope = mutationAuthority.createMutationScope({ id: 'alpha-beta-owner', fields: ['beta', 'alpha'] });

    const diagnostic = scope.transaction('increment-both', draft => {
        draft.beta.count = 7;
        draft.alpha.count = 5;
        draft.alpha['evolve:resource/food'].amount = 12;
    });

    assert.equal(diagnostic.committed, true);
    assert.equal(diagnostic.revisionBefore, 0);
    assert.equal(diagnostic.revisionAfter, 1);
    assert.equal(store.getRevision(), 1);
    assert.equal(store.read().alpha.count, 5);
    assert.equal(store.read().beta.count, 7);
    assert.deepEqual(diagnostic.changes, [
        { path: '/alpha/count', kind: 'replace' },
        { path: '/alpha/evolve:resource~1food/amount', kind: 'replace' },
        { path: '/beta/count', kind: 'replace' },
    ]);
    assert.equal(Object.isFrozen(diagnostic), true);
    assert.equal(Object.isFrozen(diagnostic.changes), true);
    assert.equal(store.getLastChange(), diagnostic);
});

test('M2B diagnostics cover add/remove/replace, JSON Pointer escaping, and deterministic ordering', async () => {
    const { createStateStore, canonicalizeStateValue } = await modules();
    const initialState = fixtureState();
    initialState.alpha.removeMe = true;
    initialState.alpha['tilde~slash/key'] = 1;
    const { store, mutationAuthority } = createFixtureInfrastructure(
        createStateStore,
        canonicalizeStateValue,
        { initialState }
    );
    const scope = mutationAuthority.createMutationScope({ id: 'alpha-owner', fields: ['alpha'] });

    const diagnostic = scope.transaction('mixed-diff', draft => {
        draft.alpha.addMe = { value: 2 };
        delete draft.alpha.removeMe;
        draft.alpha.count = 3;
        draft.alpha['tilde~slash/key'] = 4;
    });

    assert.deepEqual(diagnostic.changes, [
        { path: '/alpha/addMe', kind: 'add' },
        { path: '/alpha/count', kind: 'replace' },
        { path: '/alpha/removeMe', kind: 'remove' },
        { path: '/alpha/tilde~0slash~1key', kind: 'replace' },
    ]);
    assert.equal(store.getRevision(), 1);
});

test('M2B no-op transactions do not advance revision or replace the last committed diagnostic', async () => {
    const { createStateStore, canonicalizeStateValue } = await modules();
    const { store, mutationAuthority } = createFixtureInfrastructure(createStateStore, canonicalizeStateValue);
    const scope = mutationAuthority.createMutationScope({ id: 'alpha-owner', fields: ['alpha'] });

    const committed = scope.transaction('change', draft => {
        draft.alpha.count = 3;
    });
    const noOp = scope.transaction('same-value', draft => {
        draft.alpha.count = 3;
    });

    assert.equal(noOp.committed, false);
    assert.equal(noOp.revisionBefore, 1);
    assert.equal(noOp.revisionAfter, 1);
    assert.deepEqual(noOp.changes, []);
    assert.equal(store.getRevision(), 1);
    assert.equal(store.getLastChange(), committed);
});

test('M2B failed and invalid transactions roll back state, revision, and diagnostics', async () => {
    const { createStateStore, canonicalizeStateValue, EngineContractError } = await modules();
    const { store, mutationAuthority } = createFixtureInfrastructure(createStateStore, canonicalizeStateValue);
    const scope = mutationAuthority.createMutationScope({ id: 'alpha-owner', fields: ['alpha'] });
    const before = store.read();

    assert.throws(() => scope.transaction('throws', draft => {
        draft.alpha.count = 8;
        throw new Error('boom');
    }), /boom/);
    assert.equal(store.read(), before);
    assert.equal(store.getRevision(), 0);
    assert.equal(store.getLastChange(), null);

    expectCode(
        () => scope.transaction('invalid-number', draft => {
            draft.alpha.count = NaN;
        }),
        EngineContractError,
        'INVALID_STATE_VALUE'
    );
    assert.equal(store.read(), before);
    assert.equal(store.getRevision(), 0);
    assert.equal(store.getLastChange(), null);
});

test('M2B committed state is detached from retained transaction drafts', async () => {
    const { createStateStore, canonicalizeStateValue } = await modules();
    const { store, mutationAuthority } = createFixtureInfrastructure(createStateStore, canonicalizeStateValue);
    const scope = mutationAuthority.createMutationScope({ id: 'alpha-owner', fields: ['alpha'] });
    let leakedDraft;

    scope.transaction('leak-attempt', draft => {
        leakedDraft = draft;
        draft.alpha.count = 4;
    });

    leakedDraft.alpha.count = 999;
    assert.equal(store.read().alpha.count, 4);
    assert.equal(store.getRevision(), 1);
});

test('M2B rejects nested and async transaction mutators without committing partial work', async () => {
    const { createStateStore, canonicalizeStateValue, EngineContractError } = await modules();
    const { store, mutationAuthority } = createFixtureInfrastructure(createStateStore, canonicalizeStateValue);
    const scope = mutationAuthority.createMutationScope({ id: 'alpha-owner', fields: ['alpha'] });
    const before = store.read();

    expectCode(
        () => scope.transaction('outer', draft => {
            draft.alpha.count = 4;
            scope.transaction('inner', innerDraft => {
                innerDraft.alpha.count = 5;
            });
        }),
        EngineContractError,
        'STATE_ACCESS_REENTRANCY'
    );
    assert.equal(store.read(), before);

    let asyncMutatorCalled = false;
    expectCode(
        () => scope.transaction('async', async draft => {
            asyncMutatorCalled = true;
            draft.alpha.count = 6;
        }),
        EngineContractError,
        'INVALID_STATE_TRANSACTION'
    );
    assert.equal(asyncMutatorCalled, false);

    expectCode(
        () => scope.transaction('promise-return', () => Promise.resolve()),
        EngineContractError,
        'INVALID_STATE_TRANSACTION'
    );
    assert.equal(store.read(), before);
    assert.equal(store.getRevision(), 0);
});

test('M2B mutation scopes are explicit, unique, and cannot write undeclared roots', async () => {
    const { createStateStore, canonicalizeStateValue, EngineContractError } = await modules();
    const { mutationAuthority } = createFixtureInfrastructure(createStateStore, canonicalizeStateValue);
    mutationAuthority.createMutationScope({ id: 'alpha-owner', fields: ['alpha'] });

    expectCode(
        () => mutationAuthority.createMutationScope({ id: 'alpha-owner', fields: ['beta'] }),
        EngineContractError,
        'INVALID_STATE_MUTATION_SCOPE'
    );
    expectCode(
        () => mutationAuthority.createMutationScope({ id: 'schema-owner', fields: ['schemaVersion'] }),
        EngineContractError,
        'STATE_MUTATION_FORBIDDEN'
    );
    expectCode(
        () => mutationAuthority.createMutationScope({ id: 'unknown-owner', fields: ['unknown'] }),
        EngineContractError,
        'STATE_MUTATION_FORBIDDEN'
    );
});

test('M2B scope creation is blocked during transactions and does not leak reserved scope IDs', async () => {
    const { createStateStore, canonicalizeStateValue, EngineContractError } = await modules();
    const { store, mutationAuthority } = createFixtureInfrastructure(createStateStore, canonicalizeStateValue);
    const alphaScope = mutationAuthority.createMutationScope({ id: 'alpha-owner', fields: ['alpha'] });
    const before = store.read();

    expectCode(
        () => alphaScope.transaction('scope-mint-attempt', draft => {
            draft.alpha.count = 4;
            mutationAuthority.createMutationScope({ id: 'beta-owner', fields: ['beta'] });
        }),
        EngineContractError,
        'STATE_ACCESS_REENTRANCY'
    );
    assert.equal(store.read(), before);
    assert.equal(store.getRevision(), 0);

    const betaScope = mutationAuthority.createMutationScope({ id: 'beta-owner', fields: ['beta'] });
    assert.equal(betaScope.id, 'beta-owner');
});

test('M2B rejects validator side effects that escape a transaction scope', async () => {
    const { createStateStore, canonicalizeStateValue, EngineContractError } = await modules();
    const { store, mutationAuthority } = createFixtureInfrastructure(createStateStore, canonicalizeStateValue, {
        validateState(value){
            const output = canonicalizeStateValue(value, 'fixtureState');
            if (output.alpha.count > 1){
                output.beta.count = 99;
            }
            return output;
        },
    });
    const scope = mutationAuthority.createMutationScope({ id: 'alpha-owner', fields: ['alpha'] });
    const before = store.read();

    expectCode(
        () => scope.transaction('scope-escape', draft => {
            draft.alpha.count = 2;
        }),
        EngineContractError,
        'STATE_TRANSACTION_SCOPE_VIOLATION'
    );
    assert.equal(store.read(), before);
    assert.equal(store.getRevision(), 0);
});

test('M2B bookkeeping safely handles prototype-shaped writable field names', async () => {
    const { createStateStore, canonicalizeStateValue } = await modules();
    const input = Object.create(null);
    Object.defineProperty(input, 'schemaVersion', {
        value: 1,
        enumerable: true,
        writable: true,
        configurable: true,
    });
    Object.defineProperty(input, '__proto__', {
        value: { count: 1 },
        enumerable: true,
        writable: true,
        configurable: true,
    });

    const { store, mutationAuthority } = createStateStore({
        initialState: input,
        validateState: value => canonicalizeStateValue(value, 'prototypeState'),
        writableFields: ['__proto__'],
    });
    const scope = mutationAuthority.createMutationScope({ id: 'prototype-owner', fields: ['__proto__'] });
    const diagnostic = scope.transaction('prototype-field', draft => {
        draft.__proto__.count = 2;
    });

    assert.equal(store.read().__proto__.count, 2);
    assert.deepEqual(diagnostic.changes, [{ path: '/__proto__/count', kind: 'replace' }]);
    assert.equal(Object.getPrototypeOf(store.read()), Object.prototype);
});

test('M2B GameState integration exposes immutable reads without exposing authority creation', async () => {
    const { createGameStateStore } = await modules();
    const store = createGameStateStore();

    assert.deepEqual(store.read(), { schemaVersion: 1 });
    assert.equal(Object.isFrozen(store.read()), true);
    assert.deepEqual(store.snapshot(), { schemaVersion: 1 });
    assert.equal(store.getRevision(), 0);
    assert.equal(store.createMutationScope, undefined);
    assert.deepEqual(Object.keys(store).sort(), [
        'getLastChange',
        'getRevision',
        'read',
        'select',
        'snapshot',
    ]);
});
