'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const planPromise = import(pathToFileURL(path.join(root, 'src/engine/effects/effect-plan.mjs')).href);
const corePromise = import(pathToFileURL(path.join(root, 'src/engine/effects/core-operations.mjs')).href);
const identityPromise = import(pathToFileURL(path.join(root, 'src/engine/identity.mjs')).href);

async function modules(){
    const [plan, core, identity] = await Promise.all([planPromise, corePromise, identityPromise]);
    return { ...plan, ...core, ...identity };
}

async function expectCode(create, code, pathValue){
    const { EngineContractError } = await modules();
    assert.throws(
        create,
        error => {
            assert.equal(error instanceof EngineContractError, true);
            assert.equal(error.code, code);
            if (pathValue !== undefined) assert.equal(error.details?.path, pathValue);
            return true;
        }
    );
}

test('M3C2 creates detached frozen resource grant and consume operations', async () => {
    const { createEffectPlan, CORE_EFFECT_OPERATION_KINDS } = await modules();
    assert.deepEqual(CORE_EFFECT_OPERATION_KINDS, ['resource.consume', 'resource.grant']);
    assert.equal(Object.isFrozen(CORE_EFFECT_OPERATION_KINDS), true);

    const grant = {
        kind: 'resource.grant',
        resourceId: 'evolve:resource/dna',
        amount: 1,
    };
    const consume = Object.assign(Object.create(null), {
        kind: 'resource.consume',
        resourceId: 'example:resource/dragon_blood',
        amount: 0.25,
    });
    const input = [grant, consume];
    const plan = createEffectPlan(input);

    assert.deepEqual(plan, {
        operations: [
            {
                kind: 'resource.grant',
                resourceId: 'evolve:resource/dna',
                amount: 1,
            },
            {
                kind: 'resource.consume',
                resourceId: 'example:resource/dragon_blood',
                amount: 0.25,
            },
        ],
    });
    assert.equal(Object.isFrozen(plan), true);
    assert.equal(Object.isFrozen(plan.operations), true);
    assert.equal(Object.isFrozen(plan.operations[0]), true);
    assert.equal(Object.isFrozen(plan.operations[1]), true);
    assert.notEqual(plan.operations, input);
    assert.notEqual(plan.operations[0], grant);
    assert.notEqual(plan.operations[1], consume);
    assert.equal(Object.getPrototypeOf(plan.operations[1]), Object.prototype);

    grant.amount = 99;
    consume.amount = 99;
    input.reverse();
    assert.equal(plan.operations[0].amount, 1);
    assert.equal(plan.operations[1].amount, 0.25);
    assert.equal(plan.operations[0].kind, 'resource.grant');
});

test('M3C2 preserves operation order, duplicates and opposite resource operations exactly', async () => {
    const { createEffectPlan } = await modules();
    const resourceId = 'evolve:resource/dna';
    const plan = createEffectPlan([
        { kind: 'resource.grant', resourceId, amount: 1 },
        { kind: 'resource.grant', resourceId, amount: 1 },
        { kind: 'resource.consume', resourceId, amount: 2 },
        { kind: 'resource.grant', resourceId, amount: 2 },
    ]);

    assert.deepEqual(plan.operations, [
        { kind: 'resource.grant', resourceId, amount: 1 },
        { kind: 'resource.grant', resourceId, amount: 1 },
        { kind: 'resource.consume', resourceId, amount: 2 },
        { kind: 'resource.grant', resourceId, amount: 2 },
    ]);
    assert.equal(plan.operations.length, 4);
});

test('M3C2 requires canonical typed resource IDs without consulting a registry', async () => {
    const { createEffectPlan } = await modules();
    for (const resourceId of [
        'DNA',
        'evolve:technology/dna',
        'evolve:resource/DNA',
        '1evolve:resource/dna',
        'evolve:resource/',
    ]){
        await expectCode(
            () => createEffectPlan([{ kind: 'resource.grant', resourceId, amount: 1 }]),
            'INVALID_EFFECT_RESOURCE_ID',
            'effectPlan.operations[0].resourceId'
        );
    }

    let trapCalls = 0;
    const hostileId = new Proxy({}, {
        getPrototypeOf(){ trapCalls++; throw new Error('must not inspect resource id object'); },
        ownKeys(){ trapCalls++; throw new Error('must not inspect resource id object'); },
        getOwnPropertyDescriptor(){ trapCalls++; throw new Error('must not inspect resource id object'); },
    });
    await expectCode(
        () => createEffectPlan([{
            kind: 'resource.grant',
            resourceId: hostileId,
            amount: 1,
        }]),
        'INVALID_EFFECT_RESOURCE_ID',
        'effectPlan.operations[0].resourceId'
    );
    assert.equal(trapCalls, 0);
});

test('M3C2 accepts positive finite fractional amounts and rejects zero, negative and poison values', async () => {
    const { createEffectPlan } = await modules();
    for (const amount of [0.001, 0.5, 1, 2.75, Number.MAX_VALUE]){
        const plan = createEffectPlan([{
            kind: 'resource.consume',
            resourceId: 'evolve:resource/rna',
            amount,
        }]);
        assert.equal(plan.operations[0].amount, amount);
    }

    for (const amount of [0, -0, -1, NaN, Infinity, -Infinity, '2', 2n, null, {}]){
        await expectCode(
            () => createEffectPlan([{
                kind: 'resource.consume',
                resourceId: 'evolve:resource/rna',
                amount,
            }]),
            'INVALID_EFFECT_AMOUNT',
            'effectPlan.operations[0].amount'
        );
    }
});

test('M3C2 resource operation schemas are closed and all fields are required', async () => {
    const { createEffectPlan } = await modules();
    for (const operation of [
        { kind: 'resource.grant', amount: 1 },
        { kind: 'resource.grant', resourceId: 'evolve:resource/dna' },
    ]){
        await expectCode(
            () => createEffectPlan([operation]),
            'INVALID_EFFECT_OPERATION'
        );
    }

    await expectCode(
        () => createEffectPlan([{
            kind: 'resource.grant',
            resourceId: 'evolve:resource/dna',
            amount: 1,
            allowOverflow: true,
        }]),
        'INVALID_EFFECT_OPERATION',
        'effectPlan.operations[0].allowOverflow'
    );

    await expectCode(
        () => createEffectPlan([{
            kind: 'resource.consume',
            resourceId: 'evolve:resource/rna',
            amount: 2,
            reason: 'cost',
        }]),
        'INVALID_EFFECT_OPERATION',
        'effectPlan.operations[0].reason'
    );
});

test('M3C2 distinguishes malformed operation kinds from unsupported well-formed kinds', async () => {
    const { createEffectPlan } = await modules();
    await expectCode(
        () => createEffectPlan([{}]),
        'INVALID_EFFECT_OPERATION',
        'effectPlan.operations[0].kind'
    );
    await expectCode(
        () => createEffectPlan([{ kind: 'Bad Kind' }]),
        'INVALID_EFFECT_OPERATION_KIND',
        'effectPlan.operations[0].kind'
    );
    await expectCode(
        () => createEffectPlan([{
            kind: 'technology.grant',
            technologyId: 'evolve:technology/club',
        }]),
        'UNSUPPORTED_EFFECT_OPERATION_KIND',
        'effectPlan.operations[0].kind'
    );
});

test('M3C2 operation discovery captures hostile input fields once without invoking accessors', async () => {
    const { createEffectPlan } = await modules();

    let getterCalls = 0;
    const accessor = {
        kind: 'resource.grant',
        amount: 1,
    };
    Object.defineProperty(accessor, 'resourceId', {
        enumerable: true,
        get(){ getterCalls++; return 'evolve:resource/dna'; },
    });
    await expectCode(
        () => createEffectPlan([accessor]),
        'INVALID_EFFECT_OPERATION',
        'effectPlan.operations[0].resourceId'
    );
    assert.equal(getterCalls, 0);

    const descriptorCalls = new Map();
    const target = {
        kind: 'resource.grant',
        resourceId: 'evolve:resource/dna',
        amount: 1,
    };
    const snapshotProxy = new Proxy(target, {
        getOwnPropertyDescriptor(object, key){
            const count = (descriptorCalls.get(key) || 0) + 1;
            descriptorCalls.set(key, count);
            if (count > 1) throw new Error(`field ${String(key)} was inspected more than once`);
            return Reflect.getOwnPropertyDescriptor(object, key);
        },
    });

    const plan = createEffectPlan([snapshotProxy]);
    assert.deepEqual(plan.operations[0], target);
    assert.equal(descriptorCalls.get('kind'), 1);
    assert.equal(descriptorCalls.get('resourceId'), 1);
    assert.equal(descriptorCalls.get('amount'), 1);
});
