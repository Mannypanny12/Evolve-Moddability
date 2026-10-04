import { EngineContractError } from '../identity.mjs';
import { canonicalizeStateValue } from './common.mjs';

const ACHIEVEMENT_MUTATION_SCOPE_ID = 'achievement-state';
const ACHIEVEMENT_MUTATION_ROOT = 'achievements';
const SERVICE_OPTION_FIELDS = Object.freeze(['mutationScope']);
const MUTATION_SCOPE_FIELDS = Object.freeze(['fields', 'id', 'transaction']);

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function assertPlainObject(value, path){
    if (value === null || typeof value !== 'object' || Array.isArray(value)){
        fail(
            'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY',
            `${path} must be a plain object.`,
            { path }
        );
    }

    let prototype;
    try {
        prototype = Object.getPrototypeOf(value);
    }
    catch {
        fail(
            'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY',
            `${path} could not be safely inspected.`,
            { path }
        );
    }

    if (prototype !== Object.prototype && prototype !== null){
        fail(
            'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY',
            `${path} must be a plain object.`,
            { path }
        );
    }

    return value;
}

function assertClosedDataObject(value, path, allowedFields){
    const object = assertPlainObject(value, path);
    let keys;
    try {
        keys = Reflect.ownKeys(object);
    }
    catch {
        fail(
            'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY',
            `${path} keys could not be safely inspected.`,
            { path }
        );
    }

    const allowed = new Set(allowedFields);
    for (const key of keys){
        if (typeof key !== 'string' || !allowed.has(key)){
            fail(
                'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY',
                `${path} contains an unsupported field.`,
                { path, field: typeof key === 'string' ? key : '[symbol]' }
            );
        }
    }

    return object;
}

function readDataField(object, field, path){
    let descriptor;
    try {
        descriptor = Object.getOwnPropertyDescriptor(object, field);
    }
    catch {
        fail(
            'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY',
            `${path}.${field} could not be safely inspected.`,
            { path: `${path}.${field}` }
        );
    }

    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable){
        fail(
            'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY',
            `${path}.${field} must be an enumerable data field.`,
            { path: `${path}.${field}` }
        );
    }

    return descriptor.value;
}

function assertMutationScope(value){
    const scope = assertClosedDataObject(
        value,
        'achievementStateService.mutationScope',
        MUTATION_SCOPE_FIELDS
    );
    const id = readDataField(scope, 'id', 'achievementStateService.mutationScope');
    const rawFields = readDataField(scope, 'fields', 'achievementStateService.mutationScope');
    const transaction = readDataField(scope, 'transaction', 'achievementStateService.mutationScope');

    if (id !== ACHIEVEMENT_MUTATION_SCOPE_ID){
        fail(
            'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY',
            `achievement mutation scope must use id ${JSON.stringify(ACHIEVEMENT_MUTATION_SCOPE_ID)}.`,
            { scopeId: id }
        );
    }

    let fields;
    try {
        fields = canonicalizeStateValue(rawFields, 'achievementStateService.mutationScope.fields');
    }
    catch (error){
        if (error instanceof EngineContractError){
            fail(
                'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY',
                'achievement mutation scope fields must be inert state data.',
                { causeCode: error.code }
            );
        }
        throw error;
    }

    if (
        !Array.isArray(fields)
        || fields.length !== 1
        || fields[0] !== ACHIEVEMENT_MUTATION_ROOT
    ){
        fail(
            'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY',
            `achievement mutation scope must own only ${JSON.stringify(ACHIEVEMENT_MUTATION_ROOT)}.`,
            { fields }
        );
    }

    if (typeof transaction !== 'function'){
        fail(
            'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY',
            'achievement mutation scope must provide a transaction function.',
            { transactionType: typeof transaction }
        );
    }

    return scope;
}

export function createAchievementStateService(rawOptions){
    const options = assertClosedDataObject(
        rawOptions,
        'achievementStateServiceOptions',
        SERVICE_OPTION_FIELDS
    );
    const mutationScope = readDataField(options, 'mutationScope', 'achievementStateServiceOptions');
    assertMutationScope(mutationScope);

    // M2D2b1 deliberately exposes no mutation operation yet. The scoped
    // capability is validated and consumed here so M2D2b2 can add only
    // achievement-specific operations without ever exposing the raw scope.
    return Object.freeze({});
}
