'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const servicePromise = import(pathToFileURL(path.join(root, 'src/engine/state/achievement-state-service.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [service, identity] = await Promise.all([servicePromise, identityPromise]);
    return { ...service, ...identity };
}

async function expectCapabilityError(fn){
    const { EngineContractError } = await modules();
    assert.throws(
        fn,
        error => error instanceof EngineContractError &&
            error.code === 'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY'
    );
}

function validScope(transaction = () => undefined){
    return {
        id: 'achievement-state',
        fields: ['achievements'],
        transaction,
    };
}

test('M2D2b1 service options fail closed instead of destructuring hostile or malformed inputs', async () => {
    const { createAchievementStateService } = await modules();

    for (const value of [undefined, null, [], 'scope', 4]){
        await expectCapabilityError(() => createAchievementStateService(value));
    }

    class ExoticOptions {}
    const exotic = new ExoticOptions();
    exotic.mutationScope = validScope();
    await expectCapabilityError(() => createAchievementStateService(exotic));

    await expectCapabilityError(() => createAchievementStateService({
        mutationScope: validScope(),
        extra: true,
    }));

    const withSymbol = { mutationScope: validScope() };
    withSymbol[Symbol('hidden')] = true;
    await expectCapabilityError(() => createAchievementStateService(withSymbol));
});

test('M2D2b1 service option and scope accessors are rejected without invoking getters', async () => {
    const { createAchievementStateService } = await modules();
    let optionGetterCalls = 0;
    const accessorOptions = {};
    Object.defineProperty(accessorOptions, 'mutationScope', {
        enumerable: true,
        get(){
            optionGetterCalls++;
            return validScope();
        },
    });

    await expectCapabilityError(() => createAchievementStateService(accessorOptions));
    assert.equal(optionGetterCalls, 0);

    for (const field of ['id', 'fields', 'transaction']){
        let getterCalls = 0;
        const scope = validScope();
        Object.defineProperty(scope, field, {
            enumerable: true,
            configurable: true,
            get(){
                getterCalls++;
                return field === 'id'
                    ? 'achievement-state'
                    : field === 'fields'
                        ? ['achievements']
                        : () => undefined;
            },
        });

        await expectCapabilityError(() => createAchievementStateService({ mutationScope: scope }));
        assert.equal(getterCalls, 0, `${field} getter must not execute`);
    }
});

test('M2D2b1 scope validation is closed against extra fields, symbols, and exotic prototypes', async () => {
    const { createAchievementStateService } = await modules();

    await expectCapabilityError(() => createAchievementStateService({
        mutationScope: {
            ...validScope(),
            mutationAuthority: {},
        },
    }));

    const symbolScope = validScope();
    symbolScope[Symbol('authority')] = true;
    await expectCapabilityError(() => createAchievementStateService({ mutationScope: symbolScope }));

    const exoticScope = Object.create({ inherited: true });
    Object.assign(exoticScope, validScope());
    await expectCapabilityError(() => createAchievementStateService({ mutationScope: exoticScope }));
});

test('M2D2b1 scope field-list validation inherits inert state-data rules', async () => {
    const { createAchievementStateService } = await modules();
    let getterCalls = 0;
    const accessorFields = [];
    accessorFields.length = 1;
    Object.defineProperty(accessorFields, '0', {
        enumerable: true,
        configurable: true,
        get(){
            getterCalls++;
            return 'achievements';
        },
    });

    await expectCapabilityError(() => createAchievementStateService({
        mutationScope: {
            id: 'achievement-state',
            fields: accessorFields,
            transaction: () => undefined,
        },
    }));
    assert.equal(getterCalls, 0);

    const extraFields = ['achievements'];
    extraFields.extra = true;
    await expectCapabilityError(() => createAchievementStateService({
        mutationScope: {
            id: 'achievement-state',
            fields: extraFields,
            transaction: () => undefined,
        },
    }));
});

test('M2D2b1 capability validation never probes authority by executing the transaction function', async () => {
    const { createAchievementStateService } = await modules();
    let transactionCalls = 0;
    const service = createAchievementStateService({
        mutationScope: validScope(() => {
            transactionCalls++;
            throw new Error('must not execute during construction');
        }),
    });

    assert.equal(transactionCalls, 0);
    assert.equal(Object.isFrozen(service), true);
    assert.deepEqual(Object.keys(service), []);
});

test('M2D2b1 throwing proxy inspection fails with the domain capability error', async () => {
    const { createAchievementStateService } = await modules();
    const hostileScope = new Proxy({}, {
        getPrototypeOf(){
            throw new Error('blocked');
        },
    });

    await expectCapabilityError(() => createAchievementStateService({
        mutationScope: hostileScope,
    }));
});
