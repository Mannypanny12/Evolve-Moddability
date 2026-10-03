import {
    assertGameStateSchemaVersion,
    canonicalizeStateValue,
    readClosedStateObject,
} from './common.mjs';
import { createStateStore } from './state-store.mjs';

export const GAME_STATE_SCHEMA_VERSION = 1;

const GAME_STATE_ROOT_FIELDS = Object.freeze([
    'schemaVersion',
]);

const GAME_STATE_WRITABLE_ROOT_FIELDS = Object.freeze([]);

export function createEmptyGameState(){
    return {
        schemaVersion: GAME_STATE_SCHEMA_VERSION,
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

    return canonicalizeStateValue({ schemaVersion }, 'gameState');
}

export function createGameStateStore(initialState = createEmptyGameState()){
    const { store } = createStateStore({
        initialState,
        validateState: validateGameState,
        writableFields: GAME_STATE_WRITABLE_ROOT_FIELDS,
    });
    return store;
}
