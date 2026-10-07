'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
    readOwnershipContract,
} = require('./m2e1-state-ownership-fitness.cjs');
const {
    GAME_STATE_FILE,
    STATE_STORE_FILE,
    expectedWritableRoots,
} = require('./m2e2-mutation-boundary-fitness.cjs');
const {
    readMutationSurfaceContract,
} = require('./m2e2-mutation-boundary-review-hardening.cjs');

const STANDARD_FUNCTION_OWN_KEYS = new Set([
    'arguments',
    'caller',
    'length',
    'name',
    'prototype',
]);

function inspectPlainCapabilityObject(value, label, violations){
    if (value === null || typeof value !== 'object'){
        violations.push(`${label} must be an object`);
        return false;
    }
    let prototype;
    try {
        prototype = Object.getPrototypeOf(value);
    }
    catch (error){
        violations.push(`${label} prototype could not be inspected: ${error.message}`);
        return false;
    }
    if (prototype !== Object.prototype && prototype !== null){
        violations.push(`${label} must have a plain or null prototype so capabilities cannot hide on the prototype chain`);
        return false;
    }
    return true;
}

function inspectMethodCarrier(fn, rawTransaction, label, violations){
    if (typeof fn !== 'function'){
        violations.push(`${label} must be a function`);
        return;
    }
    let keys;
    try {
        keys = Reflect.ownKeys(fn);
    }
    catch (error){
        violations.push(`${label} function keys could not be inspected: ${error.message}`);
        return;
    }
    for (const key of keys){
        if (typeof key === 'symbol'){
            violations.push(`${label} may not carry capability data on symbol properties`);
            continue;
        }
        if (!STANDARD_FUNCTION_OWN_KEYS.has(key)){
            violations.push(`${label} may not carry custom function property ${JSON.stringify(key)}`);
            continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(fn, key);
        if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') && descriptor.value === rawTransaction){
            violations.push(`${label} may not carry the raw transaction closure on function metadata`);
        }
    }

    const prototypeDescriptor = Object.getOwnPropertyDescriptor(fn, 'prototype');
    if (prototypeDescriptor && Object.prototype.hasOwnProperty.call(prototypeDescriptor, 'value')){
        const methodPrototype = prototypeDescriptor.value;
        if (methodPrototype && typeof methodPrototype === 'object'){
            const prototypeKeys = Reflect.ownKeys(methodPrototype);
            if (
                prototypeKeys.length !== 1
                || prototypeKeys[0] !== 'constructor'
                || methodPrototype.constructor !== fn
            ){
                violations.push(`${label}.prototype may not carry additional capability data`);
            }
        }
    }
}

async function importModule(root, relativePath){
    return import(pathToFileURL(path.join(root, ...relativePath.split('/'))).href);
}

async function capabilitySurfaceHardeningViolations(
    root,
    ownershipContract = readOwnershipContract(root),
    surfaceContract = readMutationSurfaceContract(root)
){
    const violations = [];
    let storeModule;
    let gameStateModule;
    try {
        [storeModule, gameStateModule] = await Promise.all([
            importModule(root, STATE_STORE_FILE),
            importModule(root, GAME_STATE_FILE),
        ]);
    }
    catch (error){
        return [`M2E2 capability-surface hardening could not import state modules: ${error.message}`];
    }

    try {
        const infrastructure = storeModule.createStateStore({
            initialState: { alpha: {} },
            validateState: value => value,
            writableFields: ['alpha'],
        });
        inspectPlainCapabilityObject(infrastructure, 'M2E2 state-store infrastructure', violations);
        inspectPlainCapabilityObject(infrastructure.store, 'M2E2 read store', violations);
        inspectPlainCapabilityObject(infrastructure.mutationAuthority, 'M2E2 mutationAuthority', violations);
        const scope = infrastructure.mutationAuthority.createMutationScope({
            id: 'm2e2-surface-probe',
            fields: ['alpha'],
        });
        inspectPlainCapabilityObject(scope, 'M2E2 mutation scope', violations);
    }
    catch (error){
        violations.push(`M2E2 low-level capability-surface probe failed: ${error.message}`);
    }

    let runtime;
    try {
        runtime = gameStateModule.createGameStateRuntime();
        inspectPlainCapabilityObject(runtime, 'M2E2 GameState runtime', violations);
        for (const rootName of expectedWritableRoots(ownershipContract)){
            if (runtime[rootName]) inspectPlainCapabilityObject(runtime[rootName], `M2E2 runtime.${rootName}`, violations);
        }
    }
    catch (error){
        violations.push(`M2E2 runtime capability-surface probe failed: ${error.message}`);
    }

    for (const [rootName, domain] of Object.entries(ownershipContract.domains)){
        let module;
        try {
            module = await importModule(root, domain.mutationService.module);
        }
        catch (error){
            violations.push(`M2E2 ${rootName} surface module import failed: ${error.message}`);
            continue;
        }
        const factory = module[domain.mutationService.factory];
        if (typeof factory !== 'function'){
            violations.push(`M2E2 ${rootName} surface factory is not callable`);
            continue;
        }

        const rawTransaction = () => {
            throw new Error('raw transaction must remain private');
        };
        let service;
        try {
            service = factory({
                mutationScope: Object.freeze({
                    id: domain.owner,
                    fields: Object.freeze([rootName]),
                    transaction: rawTransaction,
                }),
            });
        }
        catch (error){
            violations.push(`M2E2 ${rootName} surface probe could not construct service: ${error.message}`);
            continue;
        }
        inspectPlainCapabilityObject(service, `M2E2 ${rootName} semantic service`, violations);
        for (const method of surfaceContract.domains[rootName].publicMethods){
            inspectMethodCarrier(service[method], rawTransaction, `M2E2 ${rootName}.${method}`, violations);
        }
    }

    return violations;
}

async function runCapabilitySurfaceHardening(root, logger = console){
    const violations = (await capabilitySurfaceHardeningViolations(root)).sort();
    const summary = {
        domainCount: Object.keys(readOwnershipContract(root).domains).length,
        violationCount: violations.length,
    };
    logger.log('M2E2 capability-surface hardening summary:');
    logger.log(JSON.stringify(summary, null, 2));
    if (violations.length){
        logger.error('\nM2E2 capability-surface hardening violations:');
        for (const violation of violations) logger.error('- ' + violation);
        return { exitCode: 1, result: { summary, violations } };
    }
    logger.log('\nM2E2 capability-surface hardening gate passed.');
    return { exitCode: 0, result: { summary, violations } };
}

async function main(){
    const root = path.resolve(__dirname, '..', '..');
    process.exitCode = (await runCapabilitySurfaceHardening(root)).exitCode;
}

module.exports = {
    STANDARD_FUNCTION_OWN_KEYS,
    inspectPlainCapabilityObject,
    inspectMethodCarrier,
    capabilitySurfaceHardeningViolations,
    runCapabilitySurfaceHardening,
};

if (require.main === module){
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
