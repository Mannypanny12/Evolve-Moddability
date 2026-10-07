import { EngineContractError, describeContractValue } from '../identity.mjs';
import { canonicalizeStateValue } from './common.mjs';
import {
    ACHIEVEMENT_STANDARD_UNIVERSE,
    assertAchievementStateId,
    assertAchievementUniverse,
} from './achievement-state.mjs';

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function achievementRecord(gameState, achievementId){
    const id = assertAchievementStateId(achievementId);
    return gameState.achievements[id];
}

function recognizedIds(value){
    const canonical = canonicalizeStateValue(value, 'recognizedAchievementIds');
    if (!Array.isArray(canonical)){
        fail(
            'INVALID_ACHIEVEMENT_RECOGNIZED_IDS',
            `recognizedAchievementIds must be an array, got ${describeContractValue(value)}.`,
            { value }
        );
    }

    const seen = new Set();
    const ids = [];
    for (let index = 0; index < canonical.length; index++){
        const id = assertAchievementStateId(
            canonical[index],
            `recognizedAchievementIds[${index}]`
        );
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
    }
    return ids;
}

function cappedContribution(value){
    return Math.min(value, 5);
}

export function hasAchievement(gameState, achievementId){
    const id = assertAchievementStateId(achievementId);
    return Object.prototype.hasOwnProperty.call(gameState.achievements, id);
}

export function achievementRank(gameState, achievementId){
    return achievementRecord(gameState, achievementId)?.rank ?? 0;
}

export function achievementUniverseRank(gameState, achievementId, universe){
    const normalizedUniverse = assertAchievementUniverse(universe);
    const record = achievementRecord(gameState, achievementId);
    if (!record) return 0;
    if (normalizedUniverse === ACHIEVEMENT_STANDARD_UNIVERSE){
        return record.rank;
    }
    return record.universeRanks[normalizedUniverse] ?? 0;
}

export function hasAchievementUniverseRank(gameState, achievementId, universe){
    const normalizedUniverse = assertAchievementUniverse(universe);
    const record = achievementRecord(gameState, achievementId);
    if (!record) return false;
    if (normalizedUniverse === ACHIEVEMENT_STANDARD_UNIVERSE){
        return true;
    }
    return Object.prototype.hasOwnProperty.call(record.universeRanks, normalizedUniverse);
}

export function achievementTotalRank(gameState, achievementId){
    const record = achievementRecord(gameState, achievementId);
    if (!record) return 0;
    let total = record.rank;
    for (const rank of Object.values(record.universeRanks)){
        total += rank;
    }
    return total;
}


export function achievementLevel(gameState, recognizedAchievementIds){
    let total = 0;
    for (const id of recognizedIds(recognizedAchievementIds)){
        const record = gameState.achievements[id];
        if (!record) continue;
        total += cappedContribution(record.rank);
    }
    return total;
}

export function achievementUniverseLevel(gameState, universe, recognizedAchievementIds){
    const normalizedUniverse = assertAchievementUniverse(universe);
    let total = 0;

    for (const id of recognizedIds(recognizedAchievementIds)){
        const record = gameState.achievements[id];
        if (!record) continue;
        const rank = normalizedUniverse === ACHIEVEMENT_STANDARD_UNIVERSE
            ? record.rank
            : (record.universeRanks[normalizedUniverse] ?? 0);
        total += cappedContribution(rank);
    }
    return total;
}
