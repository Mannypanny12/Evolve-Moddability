import {
    EngineContractError,
    describeContractValue,
    parseContentId,
} from '../identity.mjs';
import {
    canonicalizeStateValue,
    readClosedStateObject,
} from './common.mjs';

export const ACHIEVEMENT_STANDARD_UNIVERSE = 'standard';
export const ACHIEVEMENT_UNIVERSE_RANK_FIELDS = Object.freeze([
    'antimatter',
    'evil',
    'heavy',
    'magic',
    'micro',
]);
export const ACHIEVEMENT_UNIVERSES = Object.freeze([
    ACHIEVEMENT_STANDARD_UNIVERSE,
    ...ACHIEVEMENT_UNIVERSE_RANK_FIELDS,
]);

const ACHIEVEMENT_RECORD_FIELDS = Object.freeze([
    'rank',
    'universeRanks',
]);

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function defineDataField(target, key, value){
    Object.defineProperty(target, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
    });
}

function assertStateObject(value, path){
    const canonical = canonicalizeStateValue(value, path);
    if (canonical === null || typeof canonical !== 'object' || Array.isArray(canonical)){
        fail(
            'INVALID_ACHIEVEMENT_STATE',
            `${path} must be a plain achievement state object, got ${describeContractValue(value)}.`,
            { path, value }
        );
    }
    return canonical;
}

export function assertAchievementStateId(value, path = 'achievementId'){
    let parsed;
    try {
        parsed = parseContentId(value);
    }
    catch (error){
        if (error instanceof EngineContractError){
            fail(
                'INVALID_ACHIEVEMENT_STATE_ID',
                `${path} must be a canonical achievement content ID, got ${describeContractValue(value)}.`,
                { path, value }
            );
        }
        throw error;
    }

    if (parsed.type !== 'achievement'){
        fail(
            'INVALID_ACHIEVEMENT_STATE_ID',
            `${path} must use content type "achievement", got ${describeContractValue(parsed.type)}.`,
            { path, value: parsed.canonical, contentType: parsed.type }
        );
    }
    return parsed.canonical;
}

export function assertAchievementUniverse(value, path = 'universe'){
    if (typeof value !== 'string' || !ACHIEVEMENT_UNIVERSES.includes(value)){
        fail(
            'INVALID_ACHIEVEMENT_UNIVERSE',
            `${path} must be one of ${ACHIEVEMENT_UNIVERSES.join(', ')}, got ${describeContractValue(value)}.`,
            { path, value }
        );
    }
    return value;
}

export function assertAchievementRank(value, path = 'rank'){
    if (!Number.isSafeInteger(value) || value < 0){
        fail(
            'INVALID_ACHIEVEMENT_STATE_RANK',
            `${path} must be a non-negative safe integer, got ${describeContractValue(value)}.`,
            { path, value }
        );
    }
    return value;
}

function validateUniverseRanks(value, path){
    const fields = readClosedStateObject(value, {
        path,
        allowed: ACHIEVEMENT_UNIVERSE_RANK_FIELDS,
        required: [],
    });
    const output = {};
    for (const universe of ACHIEVEMENT_UNIVERSE_RANK_FIELDS){
        if (!fields.has(universe)) continue;
        defineDataField(
            output,
            universe,
            assertAchievementRank(fields.get(universe), `${path}.${universe}`)
        );
    }
    return output;
}

function validateAchievementRecord(value, path){
    const fields = readClosedStateObject(value, {
        path,
        allowed: ACHIEVEMENT_RECORD_FIELDS,
    });
    return {
        rank: assertAchievementRank(fields.get('rank'), `${path}.rank`),
        universeRanks: validateUniverseRanks(fields.get('universeRanks'), `${path}.universeRanks`),
    };
}

export function validateAchievementState(value){
    const canonical = assertStateObject(value, 'gameState.achievements');
    const output = {};

    for (const achievementId of Object.keys(canonical)){
        const canonicalId = assertAchievementStateId(
            achievementId,
            `gameState.achievements[${JSON.stringify(achievementId)}]`
        );
        defineDataField(
            output,
            canonicalId,
            validateAchievementRecord(
                canonical[achievementId],
                `gameState.achievements[${JSON.stringify(canonicalId)}]`
            )
        );
    }

    return canonicalizeStateValue(output, 'gameState.achievements');
}
