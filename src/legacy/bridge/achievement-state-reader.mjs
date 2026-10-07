import { formatContentId } from '../../engine/identity.mjs';
import {
    achievementLevel,
    achievementRank,
    achievementTotalRank,
    achievementUniverseLevel,
    achievementUniverseRank,
    hasAchievement,
    hasAchievementUniverseRank,
} from '../../engine/state/achievement-selectors.mjs';
import { selectLegacyAchievementState } from './achievement-state-adapter.mjs';

const LEGACY_AFFIX_TO_UNIVERSE = Object.freeze({
    l: 'standard',
    e: 'evil',
    a: 'antimatter',
    h: 'heavy',
    m: 'micro',
    mg: 'magic',
});
const CANONICAL_UNIVERSES = new Set(Object.values(LEGACY_AFFIX_TO_UNIVERSE));

function canonicalAchievementId(legacyId){
    if (typeof legacyId !== 'string' || legacyId.length === 0){
        return null;
    }
    return formatContentId({
        namespace: 'evolve',
        type: 'achievement',
        localId: legacyId,
    });
}

function normalizeTrack(value){
    if (typeof value !== 'string') return null;
    if (Object.prototype.hasOwnProperty.call(LEGACY_AFFIX_TO_UNIVERSE, value)){
        return LEGACY_AFFIX_TO_UNIVERSE[value];
    }
    if (CANONICAL_UNIVERSES.has(value)){
        return value;
    }
    return null;
}

function canonicalIds(legacyIds){
    if (!Array.isArray(legacyIds)) return [];
    return legacyIds.map(canonicalAchievementId).filter(Boolean);
}

export function hasLegacyAchievement(legacyId){
    const achievementId = canonicalAchievementId(legacyId);
    return achievementId
        ? selectLegacyAchievementState(hasAchievement, achievementId)
        : false;
}

export function hasLegacyAchievementTrack(legacyId, legacyAffix = 'l'){
    const achievementId = canonicalAchievementId(legacyId);
    const universe = normalizeTrack(legacyAffix);
    if (!achievementId || !universe) return false;
    if (universe === 'standard'){
        return selectLegacyAchievementState(hasAchievement, achievementId);
    }
    return selectLegacyAchievementState(hasAchievementUniverseRank, achievementId, universe);
}

export function legacyAchievementRank(legacyId, legacyAffix = 'l'){
    const achievementId = canonicalAchievementId(legacyId);
    const universe = normalizeTrack(legacyAffix);
    if (!achievementId || !universe) return undefined;
    return selectLegacyAchievementState((state, id, targetUniverse) => {
        if (!hasAchievement(state, id)) return undefined;
        if (targetUniverse === 'standard'){
            return achievementRank(state, id);
        }
        if (!hasAchievementUniverseRank(state, id, targetUniverse)){
            return undefined;
        }
        return achievementUniverseRank(state, id, targetUniverse);
    }, achievementId, universe);
}

export function legacyAchievementTotalRank(legacyId){
    const achievementId = canonicalAchievementId(legacyId);
    return achievementId
        ? selectLegacyAchievementState(achievementTotalRank, achievementId)
        : 0;
}

export function legacyAchievementLevel(legacyIds){
    return selectLegacyAchievementState(achievementLevel, canonicalIds(legacyIds));
}

export function legacyAchievementUniverseLevel(universe, legacyIds){
    // universeAffix() historically falls back to Standard for unknown names.
    const normalized = normalizeTrack(universe) || 'standard';
    return selectLegacyAchievementState(
        achievementUniverseLevel,
        normalized,
        canonicalIds(legacyIds)
    );
}
