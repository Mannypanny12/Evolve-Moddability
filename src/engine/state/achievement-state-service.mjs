import { EngineContractError, describeContractValue } from '../identity.mjs';

const ACHIEVEMENT_MUTATION_SCOPE_ID = 'achievement-state';
const ACHIEVEMENT_MUTATION_ROOT = 'achievements';

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function assertMutationScope(value){
    if (value === null || typeof value !== 'object' || Array.isArray(value)){
        fail(
            'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY',
            `achievement mutation scope must be an object, got ${describeContractValue(value)}.`,
            { value }
        );
    }

    if (value.id !== ACHIEVEMENT_MUTATION_SCOPE_ID){
        fail(
            'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY',
            `achievement mutation scope must use id ${JSON.stringify(ACHIEVEMENT_MUTATION_SCOPE_ID)}.`,
            { scopeId: value.id }
        );
    }

    if (
        !Array.isArray(value.fields)
        || value.fields.length !== 1
        || value.fields[0] !== ACHIEVEMENT_MUTATION_ROOT
    ){
        fail(
            'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY',
            `achievement mutation scope must own only ${JSON.stringify(ACHIEVEMENT_MUTATION_ROOT)}.`,
            { fields: value.fields }
        );
    }

    if (typeof value.transaction !== 'function'){
        fail(
            'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY',
            'achievement mutation scope must provide a transaction function.',
            { transaction: value.transaction }
        );
    }

    return value;
}

export function createAchievementStateService({ mutationScope }){
    assertMutationScope(mutationScope);

    // M2D2b1 deliberately exposes no mutation operation yet. The scoped
    // capability is validated and consumed here so M2D2b2 can add only
    // achievement-specific operations without ever exposing the raw scope.
    return Object.freeze({});
}
