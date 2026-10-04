import {
    assertGameStateSchemaVersion,
    canonicalizeStateValue,
    readClosedStateObject,
} from './common.mjs';
import { validateAchievementState } from './achievement-state.mjs';
import { createAchievementStateService } from './achievement-state-service.mjs';
import { createStateStore } from './state-store.mjs';

export const GAME_STATE_SCHEMA_VERSION = 2;

const GAME_STATE_ROOT_FIELDS = Object.freeze([
    'achievements',
    'schemaVersion',
]);

// The compatibility read facade remains backed by infrastructure that cannot
// mint a writable gameplay scope at all. Only createGameStateRuntime() opts in
// to the first writable domain root.
const GAME_STATE_READ_ONLY_WRITABLE_ROOT_FIELDS = Object.freeze([]);
const GAME_STATE_RUNTIME_WRITABLE_ROOT_FIELDS = Object.freeze([
    'achievements',
]);

export function createEmptyGameState(){
    return {
        schemaVersion: GAME_STATE_SCHEMA_VERSION,
        achievements: {},
    };
}

export function validateGameState(gameState){
    const root = readClosedStateObject(gameState, {
        path: 'gameState',
        allowed: GAME_STATE_ROOT_FIELDS,
    });

    const schemaVersion = assertGameStateSchemaVersion(
        root.get('schemaVersion'),
        GAME_STATE_SCHEMA_VERSION
    );
    const achievements = validateAchievementState(root.get('achievements'));

    return canonicalizeStateValue({ schemaVersion, achievements }, 'gameState');
}

function createGameStateInfrastructure(initialState, writableFields){
    return createStateStore({
        initialState,
        validateState: validateGameState,
        writableFields,
    });
}

export function createGameStateStore(initialState = createEmptyGameState()){
    const { store } = createGameStateInfrastructure(
        initialState,
        GAME_STATE_READ_ONLY_WRITABLE_ROOT_FIELDS
    );
    return store;
}

export function createGameStateRuntime(initialState = createEmptyGameState()){
    const { store, mutationAuthority } = createGameStateInfrastructure(
        initialState,
        GAME_STATE_RUNTIME_WRITABLE_ROOT_FIELDS
    );
    const mutationScope = mutationAuthority.createMutationScope({
        id: 'achievement-state',
        fields: ['achievements'],
    });
    const achievements = createAchievementStateService({ mutationScope });

    return Object.freeze({
        store,
        achievements,
    });
}
