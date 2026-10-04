import { EngineContractError, formatContentId } from '../../engine/identity.mjs';
import { createGameStateRuntime, GAME_STATE_SCHEMA_VERSION } from '../../engine/state/game-state.mjs';

const EVOLVE_NAMESPACE = 'evolve';
const ACHIEVEMENT_TYPE = 'achievement';
const LEGACY_BASE_AFFIX = 'l';

const LEGACY_AFFIX_TO_UNIVERSE = Object.freeze({
    a: 'antimatter',
    e: 'evil',
    h: 'heavy',
    m: 'micro',
    mg: 'magic',
});

const UNIVERSE_TO_LEGACY_AFFIX = Object.freeze({
    antimatter: 'a',
    evil: 'e',
    heavy: 'h',
    micro: 'm',
    magic: 'mg',
});

const LEGACY_RECORD_FIELDS = Object.freeze([
    LEGACY_BASE_AFFIX,
    ...Object.keys(LEGACY_AFFIX_TO_UNIVERSE),
]);
const LEGACY_RECORD_FIELD_SET = new Set(LEGACY_RECORD_FIELDS);

let binding = null;

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function hasOwn(target, key){
    return Object.prototype.hasOwnProperty.call(target, key);
}

function defineDataField(target, key, value){
    Object.defineProperty(target, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
    });
}

function assertLegacyRoot(root){
    if (root === null || typeof root !== 'object' || Array.isArray(root)){
        fail(
            'INVALID_LEGACY_ACHIEVEMENT_ROOT',
            'legacy achievement binding requires the current legacy global object.',
            { valueType: root === null ? 'null' : typeof root }
        );
    }
    if (root.stats === null || typeof root.stats !== 'object' || Array.isArray(root.stats)){
        fail(
            'INVALID_LEGACY_ACHIEVEMENT_ROOT',
            'legacy achievement binding requires global.stats.',
            { path: 'global.stats' }
        );
    }
    if (root.stats.achieve === undefined){
        root.stats.achieve = {};
    }
    if (
        root.stats.achieve === null
        || typeof root.stats.achieve !== 'object'
        || Array.isArray(root.stats.achieve)
    ){
        fail(
            'INVALID_LEGACY_ACHIEVEMENT_STATE',
            'global.stats.achieve must be an object before GameState hydration.',
            { path: 'global.stats.achieve' }
        );
    }
    return root;
}

function assertLegacyId(value){
    if (typeof value !== 'string' || value.length === 0){
        fail(
            'INVALID_LEGACY_ACHIEVEMENT_ID',
            'legacy achievement IDs must be non-empty strings.',
            { valueType: typeof value }
        );
    }
    return value;
}

function canonicalAchievementId(legacyId){
    return formatContentId({
        namespace: EVOLVE_NAMESPACE,
        type: ACHIEVEMENT_TYPE,
        localId: assertLegacyId(legacyId),
    });
}

function legacyAchievementId(canonicalId){
    const prefix = `${EVOLVE_NAMESPACE}:${ACHIEVEMENT_TYPE}/`;
    if (typeof canonicalId !== 'string' || !canonicalId.startsWith(prefix)){
        fail(
            'INVALID_LEGACY_ACHIEVEMENT_PROJECTION',
            'legacy achievement projection can only represent evolve achievement IDs.',
            { achievementId: canonicalId }
        );
    }
    return canonicalId.slice(prefix.length);
}

function assertLegacyRank(value, path){
    if (!Number.isSafeInteger(value) || value < 0){
        fail(
            'INVALID_LEGACY_ACHIEVEMENT_RANK',
            `${path} must be a non-negative safe integer before GameState hydration.`,
            { path, value }
        );
    }
    return Object.is(value, -0) ? 0 : value;
}

function hydrateLegacyRecord(rawRecord, legacyId){
    const path = `global.stats.achieve[${JSON.stringify(legacyId)}]`;
    if (rawRecord === null || typeof rawRecord !== 'object' || Array.isArray(rawRecord)){
        fail(
            'INVALID_LEGACY_ACHIEVEMENT_STATE',
            `${path} must be an achievement record after legacy migrations.`,
            { path }
        );
    }

    for (const key of Reflect.ownKeys(rawRecord)){
        if (typeof key !== 'string' || !LEGACY_RECORD_FIELD_SET.has(key)){
            fail(
                'INVALID_LEGACY_ACHIEVEMENT_STATE',
                `${path} contains an unsupported legacy achievement field.`,
                { path, field: typeof key === 'string' ? key : '[symbol]' }
            );
        }
    }

    const rank = hasOwn(rawRecord, LEGACY_BASE_AFFIX) && rawRecord[LEGACY_BASE_AFFIX] !== undefined
        ? assertLegacyRank(rawRecord[LEGACY_BASE_AFFIX], `${path}.${LEGACY_BASE_AFFIX}`)
        : 0;
    const universeRanks = {};

    for (const [affix, universe] of Object.entries(LEGACY_AFFIX_TO_UNIVERSE)){
        if (!hasOwn(rawRecord, affix) || rawRecord[affix] === undefined) continue;
        defineDataField(
            universeRanks,
            universe,
            assertLegacyRank(rawRecord[affix], `${path}.${affix}`)
        );
    }

    return { rank, universeRanks };
}

function hydrateLegacyState(root){
    const achievements = {};
    for (const legacyId of Object.keys(root.stats.achieve)){
        defineDataField(
            achievements,
            canonicalAchievementId(legacyId),
            hydrateLegacyRecord(root.stats.achieve[legacyId], legacyId)
        );
    }
    return {
        schemaVersion: GAME_STATE_SCHEMA_VERSION,
        achievements,
    };
}

function requireBinding(){
    if (!binding){
        fail(
            'LEGACY_ACHIEVEMENT_STATE_UNBOUND',
            'legacy achievement state must be bound after vars.js migrations before it can be used.'
        );
    }
    return binding;
}

function projectBinding(undefinedProjection = null){
    const current = requireBinding();
    const root = current.root;
    const state = current.runtime.store.read();
    let ledger = root.stats.achieve;

    if (ledger === null || typeof ledger !== 'object' || Array.isArray(ledger)){
        ledger = {};
        root.stats.achieve = ledger;
    }

    for (const key of Reflect.ownKeys(ledger)){
        if (typeof key === 'string'){
            delete ledger[key];
        }
    }

    for (const [achievementId, record] of Object.entries(state.achievements)){
        const legacyId = legacyAchievementId(achievementId);
        const legacyRecord = { l: record.rank };
        for (const [universe, rank] of Object.entries(record.universeRanks)){
            const affix = UNIVERSE_TO_LEGACY_AFFIX[universe];
            if (!affix){
                fail(
                    'INVALID_LEGACY_ACHIEVEMENT_PROJECTION',
                    'GameState contains an achievement universe that cannot be projected to legacy state.',
                    { achievementId, universe }
                );
            }
            defineDataField(legacyRecord, affix, rank);
        }
        defineDataField(ledger, legacyId, legacyRecord);
    }

    if (undefinedProjection){
        const record = ledger[undefinedProjection.legacyId];
        if (record){
            defineDataField(record, undefinedProjection.affix, undefined);
        }
    }
}

function normalizeLegacyUniverseAffix(value){
    if (value === null) return null;
    if (value === LEGACY_BASE_AFFIX) return LEGACY_BASE_AFFIX;
    if (typeof value !== 'string' || !hasOwn(LEGACY_AFFIX_TO_UNIVERSE, value)){
        fail(
            'INVALID_LEGACY_ACHIEVEMENT_UNIVERSE',
            'legacy achievement universe target must be l, e, a, h, m, mg, or null.',
            { value }
        );
    }
    return value;
}

function readAuthoritativeRecord(current, achievementId){
    const state = current.runtime.store.read();
    return hasOwn(state.achievements, achievementId)
        ? state.achievements[achievementId]
        : null;
}

export function bindLegacyAchievementState(rawRoot){
    const root = assertLegacyRoot(rawRoot);
    const runtime = createGameStateRuntime(hydrateLegacyState(root));
    binding = { root, runtime };
    projectBinding();
    return runtime.store.snapshot();
}

export function achievementStateSnapshot(){
    return requireBinding().runtime.store.snapshot();
}

export function advanceLegacyAchievement({
    achievement,
    rank,
    advanceBase,
    universeAffix = null,
}){
    const current = requireBinding();
    const legacyId = assertLegacyId(achievement);
    const achievementId = canonicalAchievementId(legacyId);
    const targetAffix = normalizeLegacyUniverseAffix(universeAffix);

    if (!Number.isSafeInteger(rank) || rank < 0){
        fail(
            'INVALID_LEGACY_ACHIEVEMENT_RANK',
            'legacy achievement advancement rank must be a non-negative safe integer.',
            { achievement: legacyId, rank }
        );
    }
    if (typeof advanceBase !== 'boolean'){
        fail(
            'INVALID_LEGACY_ACHIEVEMENT_MUTATION',
            'legacy achievement advancement must state whether base rank advancement is enabled.',
            { achievement: legacyId, advanceBaseType: typeof advanceBase }
        );
    }

    const beforeRecord = readAuthoritativeRecord(current, achievementId);
    const recordExisted = beforeRecord !== null;
    const previousBaseRank = beforeRecord ? beforeRecord.rank : 0;
    let targetUniverse = null;
    let previousUniverseRank = 0;

    if (targetAffix && targetAffix !== LEGACY_BASE_AFFIX){
        targetUniverse = LEGACY_AFFIX_TO_UNIVERSE[targetAffix];
        previousUniverseRank = beforeRecord && hasOwn(beforeRecord.universeRanks, targetUniverse)
            ? beforeRecord.universeRanks[targetUniverse]
            : 0;
    }

    // D2b2 intentionally requires at least one semantic target. The legacy
    // function can still create a structural rank-zero record in the unusual
    // case where neither base nor universe progression is enabled, so model
    // that one case as a rank-zero base ensure rather than introducing a third
    // public engine mutation primitive.
    const structuralEnsureOnly = !advanceBase && targetUniverse === null;
    const command = {
        achievementId,
        rank: structuralEnsureOnly ? 0 : rank,
        advanceBase: structuralEnsureOnly ? true : advanceBase,
    };
    if (targetUniverse !== null){
        command.universe = targetUniverse;
    }

    const result = current.runtime.achievements.advance(command);

    const baseRankBeforeUniverseBranch = result.newBaseRank;
    const valueBeforeUniverseBranch = targetAffix === LEGACY_BASE_AFFIX
        ? baseRankBeforeUniverseBranch
        : previousUniverseRank;
    const legacyUniverseWrite = targetAffix !== null
        && (!valueBeforeUniverseBranch || valueBeforeUniverseBranch < rank);
    const legacyUniverseUpgrade = legacyUniverseWrite && Boolean(valueBeforeUniverseBranch);

    projectBinding();

    return Object.freeze({
        achievementId,
        legacyId,
        recordExisted,
        baseRankChanged: result.baseRankChanged,
        legacyUniverseWrite,
        legacyUniverseUpgrade,
        engineChanged: result.changed,
        mutation: result,
    });
}

export function removeLegacyAchievementUniverseRank(achievement, universeAffix, options = {}){
    const current = requireBinding();
    const legacyId = assertLegacyId(achievement);
    const achievementId = canonicalAchievementId(legacyId);
    const affix = normalizeLegacyUniverseAffix(universeAffix);
    const preserveUndefined = options.preserveUndefined === true;

    if (affix === null || affix === LEGACY_BASE_AFFIX){
        fail(
            'INVALID_LEGACY_ACHIEVEMENT_UNIVERSE',
            'legacy aggregate clearing requires a named non-standard universe affix.',
            { achievement: legacyId, universeAffix: affix }
        );
    }

    const result = current.runtime.achievements.removeUniverseRank({
        achievementId,
        universe: LEGACY_AFFIX_TO_UNIVERSE[affix],
    });

    projectBinding(preserveUndefined ? { legacyId, affix } : null);
    return result;
}
