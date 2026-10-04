import {
    assertGameStateSchemaVersion,
    canonicalizeStateValue,
    readClosedStateObject,
} from './common.mjs';
import { validateAchievementState } from './achievement-state.mjs';
import { createStateStore } from './state-store.mjs';

export const GAME_STATE_SCHEMA_VERSION = 2;

const GAME_STATE_ROOT_FIELDS = Object.freeze([
    'achievements',
    'schemaVersion',
]);

// M2D2a adds the first real gameplay domain shape, but authority remains
// deliberately unavailable until M2D2b composes its dedicated mutation service.
const GAME_STATE_WRITABLE_ROOT_FIELDS = Object.freeze([]);

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

export function createGameStateStore(initialState = createEmptyGameState()){
    const { store } = createStateStore({
        initialState,
        validateState: validateGameState,
        writableFields: GAME_STATE_WRITABLE_ROOT_FIELDS,
    });
    return store;
}
