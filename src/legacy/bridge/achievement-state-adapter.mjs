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
const ADVANCE_COMMAND_FIELDS = Object.freeze([
    'achievement',
    'rank',
    'advanceBase',
    'universeAffix',
]);
const REMOVE_OPTIONS_FIELDS = Object.freeze(['preserveUndefined']);

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

function safeIsArray(value, path, code){
    try {
        return Array.isArray(value);
    }
    catch {
        fail(code, `${path} could not be safely inspected.`, { path });
    }
}

function safePrototype(value, path, code){
    try {
        return Object.getPrototypeOf(value);
    }
    catch {
        fail(code, `${path} could not be safely inspected.`, { path });
    }
}

function safeOwnKeys(value, path, code){
    try {
        return Reflect.ownKeys(value);
    }
    catch {
        fail(code, `${path} keys could not be safely inspected.`, { path });
    }
}

function safeDescriptor(value, field, path, code){
    try {
        return Object.getOwnPropertyDescriptor(value, field);
    }
    catch {
        fail(code, `${path}.${String(field)} could not be safely inspected.`, {
            path: `${path}.${String(field)}`,
        });
    }
}

function safeIsExtensible(value, path, code){
    try {
        return Object.isExtensible(value);
    }
    catch {
        fail(code, `${path} extensibility could not be safely inspected.`, { path });
    }
}

function assertPlainObject(value, path, code){
    if (value === null || typeof value !== 'object' || safeIsArray(value, path, code)){
        fail(code, `${path} must be a plain object.`, {
            path,
            valueType: value === null ? 'null' : typeof value,
        });
    }

    const prototype = safePrototype(value, path, code);
    if (prototype !== Object.prototype && prototype !== null){
        fail(code, `${path} must be a plain object.`, { path });
    }
    return value;
}

function assertClosedDataObject(value, path, allowedFields, code){
    const object = assertPlainObject(value, path, code);
    const allowed = new Set(allowedFields);
    for (const key of safeOwnKeys(object, path, code)){
        if (typeof key !== 'string' || !allowed.has(key)){
            fail(code, `${path} contains an unsupported field.`, {
                path,
                field: typeof key === 'string' ? key : '[symbol]',
            });
        }
    }
    return object;
}

function readRequiredDataField(object, field, path, code){
    const descriptor = safeDescriptor(object, field, path, code);
    if (
        !descriptor
        || !hasOwn(descriptor, 'value')
        || !descriptor.enumerable
    ){
        fail(code, `${path}.${field} must be an enumerable data field.`, {
            path: `${path}.${field}`,
        });
    }
    return descriptor.value;
}

function readOptionalDataField(object, field, path, code){
    const descriptor = safeDescriptor(object, field, path, code);
    if (!descriptor){
        return Object.freeze({ present: false, value: undefined });
    }
    if (!hasOwn(descriptor, 'value') || !descriptor.enumerable){
        fail(code, `${path}.${field} must be an enumerable data field.`, {
            path: `${path}.${field}`,
        });
    }
    return Object.freeze({ present: true, value: descriptor.value });
}

function inspectHydrationRoot(rawRoot){
    const root = assertPlainObject(
        rawRoot,
        'legacyAchievementRoot',
        'INVALID_LEGACY_ACHIEVEMENT_ROOT'
    );
    const stats = assertPlainObject(
        readRequiredDataField(
            root,
            'stats',
            'legacyAchievementRoot',
            'INVALID_LEGACY_ACHIEVEMENT_ROOT'
        ),
        'legacyAchievementRoot.stats',
        'INVALID_LEGACY_ACHIEVEMENT_ROOT'
    );
    const ledger = assertPlainObject(
        readRequiredDataField(
            stats,
            'achieve',
            'legacyAchievementRoot.stats',
            'INVALID_LEGACY_ACHIEVEMENT_STATE'
        ),
        'legacyAchievementRoot.stats.achieve',
        'INVALID_LEGACY_ACHIEVEMENT_STATE'
    );
    return { root, stats, ledger };
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
    const record = assertClosedDataObject(
        rawRecord,
        path,
        LEGACY_RECORD_FIELDS,
        'INVALID_LEGACY_ACHIEVEMENT_STATE'
    );
    const baseField = readOptionalDataField(
        record,
        LEGACY_BASE_AFFIX,
        path,
        'INVALID_LEGACY_ACHIEVEMENT_STATE'
    );
    const rank = !baseField.present || baseField.value === undefined
        ? 0
        : assertLegacyRank(baseField.value, `${path}.${LEGACY_BASE_AFFIX}`);
    const universeRanks = {};

    for (const [affix, universe] of Object.entries(LEGACY_AFFIX_TO_UNIVERSE)){
        const field = readOptionalDataField(
            record,
            affix,
            path,
            'INVALID_LEGACY_ACHIEVEMENT_STATE'
        );
        if (!field.present || field.value === undefined) continue;
        defineDataField(
            universeRanks,
            universe,
            assertLegacyRank(field.value, `${path}.${affix}`)
        );
    }

    return { rank, universeRanks };
}

function hydrateLegacyState(ledger){
    const achievements = {};
    const path = 'global.stats.achieve';
    for (const legacyId of safeOwnKeys(ledger, path, 'INVALID_LEGACY_ACHIEVEMENT_STATE')){
        if (typeof legacyId !== 'string'){
            fail(
                'INVALID_LEGACY_ACHIEVEMENT_STATE',
                `${path} contains a symbol achievement key.`,
                { path, field: '[symbol]' }
            );
        }
        const rawRecord = readRequiredDataField(
            ledger,
            legacyId,
            path,
            'INVALID_LEGACY_ACHIEVEMENT_STATE'
        );
        defineDataField(
            achievements,
            canonicalAchievementId(legacyId),
            hydrateLegacyRecord(rawRecord, legacyId)
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

function buildLegacyProjection(state, undefinedProjection = null){
    const ledger = {};
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
    return ledger;
}

function readBoundStats(current){
    const stats = readRequiredDataField(
        current.root,
        'stats',
        'legacyAchievementRoot',
        'INVALID_LEGACY_ACHIEVEMENT_PROJECTION'
    );
    if (stats !== current.stats){
        fail(
            'LEGACY_ACHIEVEMENT_REBIND_REQUIRED',
            'global.stats was replaced after achievement authority was bound; replace the legacy root through setGlobal().',
            { path: 'global.stats' }
        );
    }
    return assertPlainObject(
        stats,
        'legacyAchievementRoot.stats',
        'INVALID_LEGACY_ACHIEVEMENT_PROJECTION'
    );
}

function inspectMutableLedger(value){
    if (value === null || typeof value !== 'object') return false;
    try {
        if (Array.isArray(value)) return false;
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) return false;
        if (!Object.isExtensible(value)) return false;
        for (const key of Reflect.ownKeys(value)){
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (!descriptor || !descriptor.configurable) return false;
        }
        return true;
    }
    catch {
        return false;
    }
}

function inspectProjectionTarget(current){
    const stats = readBoundStats(current);
    const descriptor = safeDescriptor(
        stats,
        'achieve',
        'legacyAchievementRoot.stats',
        'INVALID_LEGACY_ACHIEVEMENT_PROJECTION'
    );

    if (!descriptor){
        if (!safeIsExtensible(
            stats,
            'legacyAchievementRoot.stats',
            'INVALID_LEGACY_ACHIEVEMENT_PROJECTION'
        )){
            fail(
                'INVALID_LEGACY_ACHIEVEMENT_PROJECTION',
                'global.stats.achieve is missing and global.stats cannot accept a replacement projection.',
                { path: 'global.stats.achieve' }
            );
        }
        return Object.freeze({ stats, ledger: null, canMutate: false, canReplace: true, descriptor: null });
    }

    const dataDescriptor = hasOwn(descriptor, 'value');
    const ledger = dataDescriptor ? descriptor.value : null;
    const canMutate = dataDescriptor && inspectMutableLedger(ledger);
    const canReplace = descriptor.configurable
        || (dataDescriptor && descriptor.writable && descriptor.enumerable);

    if (!canMutate && !canReplace){
        fail(
            'INVALID_LEGACY_ACHIEVEMENT_PROJECTION',
            'global.stats.achieve cannot be safely updated with the authoritative achievement projection.',
            { path: 'global.stats.achieve' }
        );
    }

    return Object.freeze({ stats, ledger, canMutate, canReplace, descriptor });
}

function replaceLedgerField(target, nextLedger){
    try {
        if (!target.descriptor || target.descriptor.configurable){
            defineDataField(target.stats, 'achieve', nextLedger);
        }
        else {
            target.stats.achieve = nextLedger;
        }
    }
    catch {
        fail(
            'INVALID_LEGACY_ACHIEVEMENT_PROJECTION',
            'global.stats.achieve replacement failed while applying the authoritative projection.',
            { path: 'global.stats.achieve' }
        );
    }
}

function commitProjection(target, nextLedger){
    if (target.canMutate){
        try {
            for (const key of Reflect.ownKeys(target.ledger)){
                delete target.ledger[key];
            }
            for (const key of Reflect.ownKeys(nextLedger)){
                defineDataField(target.ledger, key, nextLedger[key]);
            }
            return;
        }
        catch {
            if (!target.canReplace){
                fail(
                    'INVALID_LEGACY_ACHIEVEMENT_PROJECTION',
                    'global.stats.achieve could not be synchronized with authoritative achievement state.',
                    { path: 'global.stats.achieve' }
                );
            }
        }
    }

    replaceLedgerField(target, nextLedger);
}

function restoreRuntimeAfterProjectionFailure(current, snapshot){
    current.runtime = createGameStateRuntime(snapshot);
    try {
        const target = inspectProjectionTarget(current);
        commitProjection(target, buildLegacyProjection(current.runtime.store.read()));
    }
    catch {
        // The original projection error is more actionable. Authority is still
        // restored even if a hostile compatibility mirror cannot be repaired.
    }
}

function projectCommittedMutation(current, target, snapshot, undefinedProjection = null){
    try {
        commitProjection(
            target,
            buildLegacyProjection(current.runtime.store.read(), undefinedProjection)
        );
    }
    catch (error){
        restoreRuntimeAfterProjectionFailure(current, snapshot);
        throw error;
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

function validateAdvanceCommand(rawCommand){
    const path = 'advanceLegacyAchievement';
    const command = assertClosedDataObject(
        rawCommand,
        path,
        ADVANCE_COMMAND_FIELDS,
        'INVALID_LEGACY_ACHIEVEMENT_MUTATION'
    );
    const achievement = readRequiredDataField(
        command,
        'achievement',
        path,
        'INVALID_LEGACY_ACHIEVEMENT_MUTATION'
    );
    const rank = readRequiredDataField(
        command,
        'rank',
        path,
        'INVALID_LEGACY_ACHIEVEMENT_MUTATION'
    );
    const advanceBase = readRequiredDataField(
        command,
        'advanceBase',
        path,
        'INVALID_LEGACY_ACHIEVEMENT_MUTATION'
    );
    const universeField = readOptionalDataField(
        command,
        'universeAffix',
        path,
        'INVALID_LEGACY_ACHIEVEMENT_MUTATION'
    );

    const legacyId = assertLegacyId(achievement);
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

    const rawUniverseAffix = !universeField.present || universeField.value === undefined
        ? null
        : universeField.value;
    return Object.freeze({
        legacyId,
        rank: Object.is(rank, -0) ? 0 : rank,
        advanceBase,
        targetAffix: normalizeLegacyUniverseAffix(rawUniverseAffix),
    });
}

function validateRemoveOptions(rawOptions){
    if (rawOptions === undefined){
        return Object.freeze({ preserveUndefined: false });
    }
    const path = 'removeLegacyAchievementUniverseRank.options';
    const options = assertClosedDataObject(
        rawOptions,
        path,
        REMOVE_OPTIONS_FIELDS,
        'INVALID_LEGACY_ACHIEVEMENT_MUTATION'
    );
    const field = readOptionalDataField(
        options,
        'preserveUndefined',
        path,
        'INVALID_LEGACY_ACHIEVEMENT_MUTATION'
    );
    if (!field.present || field.value === undefined){
        return Object.freeze({ preserveUndefined: false });
    }
    if (typeof field.value !== 'boolean'){
        fail(
            'INVALID_LEGACY_ACHIEVEMENT_MUTATION',
            `${path}.preserveUndefined must be a boolean.`,
            { path: `${path}.preserveUndefined`, valueType: typeof field.value }
        );
    }
    return Object.freeze({ preserveUndefined: field.value });
}

function readAuthoritativeRecord(current, achievementId){
    const state = current.runtime.store.read();
    return hasOwn(state.achievements, achievementId)
        ? state.achievements[achievementId]
        : null;
}

export function bindLegacyAchievementState(rawRoot){
    const { root, stats, ledger } = inspectHydrationRoot(rawRoot);
    const runtime = createGameStateRuntime(hydrateLegacyState(ledger));
    const candidate = { root, stats, runtime };
    const target = inspectProjectionTarget(candidate);
    commitProjection(target, buildLegacyProjection(runtime.store.read()));
    binding = candidate;
    return runtime.store.snapshot();
}

export function achievementStateSnapshot(){
    return requireBinding().runtime.store.snapshot();
}

export function advanceLegacyAchievement(rawCommand){
    const current = requireBinding();
    const { legacyId, rank, advanceBase, targetAffix } = validateAdvanceCommand(rawCommand);
    const achievementId = canonicalAchievementId(legacyId);
    const beforeRecord = readAuthoritativeRecord(current, achievementId);
    const recordExisted = beforeRecord !== null;
    let targetUniverse = null;
    let previousUniverseRank = 0;

    if (targetAffix && targetAffix !== LEGACY_BASE_AFFIX){
        targetUniverse = LEGACY_AFFIX_TO_UNIVERSE[targetAffix];
        previousUniverseRank = beforeRecord && hasOwn(beforeRecord.universeRanks, targetUniverse)
            ? beforeRecord.universeRanks[targetUniverse]
            : 0;
    }

    const structuralEnsureOnly = !advanceBase && targetUniverse === null;
    const command = {
        achievementId,
        rank: structuralEnsureOnly ? 0 : rank,
        advanceBase: structuralEnsureOnly ? true : advanceBase,
    };
    if (targetUniverse !== null){
        command.universe = targetUniverse;
    }

    // Preflight the compatibility projection before granting authoritative
    // mutation. A locked or replaced stats root therefore cannot create a
    // split-brain state where GameState committed but the legacy mirror did not.
    const projectionTarget = inspectProjectionTarget(current);
    const beforeSnapshot = current.runtime.store.snapshot();
    const result = current.runtime.achievements.advance(command);

    const valueBeforeUniverseBranch = targetAffix === LEGACY_BASE_AFFIX
        ? result.newBaseRank
        : previousUniverseRank;
    const legacyUniverseWrite = targetAffix !== null
        && (!valueBeforeUniverseBranch || valueBeforeUniverseBranch < rank);
    const legacyUniverseUpgrade = legacyUniverseWrite && Boolean(valueBeforeUniverseBranch);

    projectCommittedMutation(current, projectionTarget, beforeSnapshot);

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

export function removeLegacyAchievementUniverseRank(achievement, universeAffix, rawOptions){
    const current = requireBinding();
    const legacyId = assertLegacyId(achievement);
    const achievementId = canonicalAchievementId(legacyId);
    const affix = normalizeLegacyUniverseAffix(universeAffix);
    const { preserveUndefined } = validateRemoveOptions(rawOptions);

    if (affix === null || affix === LEGACY_BASE_AFFIX){
        fail(
            'INVALID_LEGACY_ACHIEVEMENT_UNIVERSE',
            'legacy aggregate clearing requires a named non-standard universe affix.',
            { achievement: legacyId, universeAffix: affix }
        );
    }

    const projectionTarget = inspectProjectionTarget(current);
    const beforeSnapshot = current.runtime.store.snapshot();
    const result = current.runtime.achievements.removeUniverseRank({
        achievementId,
        universe: LEGACY_AFFIX_TO_UNIVERSE[affix],
    });

    projectCommittedMutation(
        current,
        projectionTarget,
        beforeSnapshot,
        preserveUndefined ? { legacyId, affix } : null
    );
    return result;
}
