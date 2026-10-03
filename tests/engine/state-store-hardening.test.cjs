'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const storePromise = import(pathToFileURL(path.join(root, 'src/engine/state/state-store.mjs')).href);
const commonPromise = import(pathToFileURL(path.join(root, 'src/engine/state/common.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [store, common, identity] = await Promise.all([
        storePromise,
        commonPromise,
        identityPromise,
    ]);
    return { ...store, ...common, ...identity };
}

function createFixture(createStateStore, canonicalizeStateValue){
    return createStateStore({
        initialState: {
            schemaVersion: 1,
            alpha: { count: 1 },
            queue: ['a', 'b'],
        },
        validateState: value => canonicalizeStateValue(value, 'fixtureState'),
        writableFields: ['alpha', 'queue'],
    });
}

function expectInvalidTransaction(scope, store, EngineContractError, label, mutate){
    const before = store.read();
    const beforeRevision = store.getRevision();
    const beforeLastChange = store.getLastChange();

    assert.throws(
        () => scope.transaction(label, mutate),
        error => error instanceof EngineContractError && error.code === 'INVALID_STATE_VALUE',
        `expected ${label} to fail with INVALID_STATE_VALUE`
    );
    assert.equal(store.read(), before, `${label} must retain the exact committed state object`);
    assert.equal(store.getRevision(), beforeRevision, `${label} must not advance revision`);
    assert.equal(store.getLastChange(), beforeLastChange, `${label} must not alter lastChange`);
}

test('M2B transaction validation rejects hostile M2A state shapes without partial commit', async () => {
    const { createStateStore, canonicalizeStateValue, EngineContractError } = await modules();
    const { store, mutationAuthority } = createFixture(createStateStore, canonicalizeStateValue);
    const scope = mutationAuthority.createMutationScope({ id: 'alpha-owner', fields: ['alpha'] });

    expectInvalidTransaction(scope, store, EngineContractError, 'cycle', draft => {
        draft.alpha.self = draft.alpha;
    });

    expectInvalidTransaction(scope, store, EngineContractError, 'shared-reference', draft => {
        const shared = { value: 1 };
        draft.alpha.left = shared;
        draft.alpha.right = shared;
    });

    let getterCalls = 0;
    expectInvalidTransaction(scope, store, EngineContractError, 'accessor', draft => {
        Object.defineProperty(draft.alpha, 'danger', {
            enumerable: true,
            configurable: true,
            get(){
                getterCalls++;
                return 1;
            },
        });
    });
    assert.equal(getterCalls, 0);

    expectInvalidTransaction(scope, store, EngineContractError, 'exotic-object', draft => {
        draft.alpha.bad = new Date(0);
    });

    expectInvalidTransaction(scope, store, EngineContractError, 'sparse-array', draft => {
        const sparse = new Array(2);
        sparse[1] = 'present';
        draft.alpha.bad = sparse;
    });

    expectInvalidTransaction(scope, store, EngineContractError, 'extra-array-property', draft => {
        const extra = [1];
        extra.extra = true;
        draft.alpha.bad = extra;
    });

    expectInvalidTransaction(scope, store, EngineContractError, 'hostile-proxy', draft => {
        draft.alpha.bad = new Proxy({}, {
            ownKeys(){
                throw new Error('boom');
            },
        });
    });

    expectInvalidTransaction(scope, store, EngineContractError, 'non-finite', draft => {
        draft.alpha.count = Infinity;
    });
});

test('M2B transaction validation preserves the M2A nesting-depth limit', async () => {
    const {
        createStateStore,
        canonicalizeStateValue,
        EngineContractError,
        MAX_GAME_STATE_NESTING_DEPTH,
    } = await modules();
    const { store, mutationAuthority } = createFixture(createStateStore, canonicalizeStateValue);
    const scope = mutationAuthority.createMutationScope({ id: 'alpha-owner', fields: ['alpha'] });
    const before = store.read();

    assert.throws(
        () => scope.transaction('over-depth', draft => {
            let cursor = draft.alpha;
            for (let depth = 0; depth <= MAX_GAME_STATE_NESTING_DEPTH; depth++){
                cursor.child = {};
                cursor = cursor.child;
            }
        }),
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_STATE_VALUE' &&
            error.details?.maxDepth === MAX_GAME_STATE_NESTING_DEPTH
    );
    assert.equal(store.read(), before);
    assert.equal(store.getRevision(), 0);
    assert.equal(store.getLastChange(), null);
});

test('M2B array diagnostics are deterministic observations rather than replay semantics', async () => {
    const { createStateStore, canonicalizeStateValue } = await modules();
    const { store, mutationAuthority } = createFixture(createStateStore, canonicalizeStateValue);
    const scope = mutationAuthority.createMutationScope({ id: 'queue-owner', fields: ['queue'] });

    const grow = scope.transaction('grow-queue', draft => {
        draft.queue[1] = 'c';
        draft.queue.push('d');
    });
    assert.deepEqual(grow.changes, [
        { path: '/queue/1', kind: 'replace' },
        { path: '/queue/2', kind: 'add' },
    ]);

    const shrink = scope.transaction('shrink-queue', draft => {
        draft.queue.pop();
    });
    assert.deepEqual(shrink.changes, [
        { path: '/queue/2', kind: 'remove' },
    ]);
    assert.equal(store.getRevision(), 2);
});
