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

// M2D2b1 enables the first real writable GameState domain internally. The
// normal GameState store remains a read-only facade; only the composition
// runtime below retains authority long enough to mint the dedicated scope.
const GAME_STATE_WRITABLE_ROOT_FIELDS = Object.freeze([
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

function createGameStateInfrastructure(initialState){
    return createStateStore({
        initialState,
        validateState: validateGameState,
        writableFields: GAME_STATE_WRITABLE_ROOT_FIELDS,
    });
}

export function createGameStateStore(initialState = createEmptyGameState()){
    const { store } = createGameStateInfrastructure(initialState);
    return store;
}

export function createGameStateRuntime(initialState = createEmptyGameState()){
    const { store, mutationAuthority } = createGameStateInfrastructure(initialState);
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
