import { EngineContractError } from '../identity.mjs';
import {
    ACHIEVEMENT_STANDARD_UNIVERSE,
    ACHIEVEMENT_UNIVERSE_RANK_FIELDS,
    assertAchievementRank,
    assertAchievementStateId,
    assertAchievementUniverse,
} from './achievement-state.mjs';
import { canonicalizeStateValue } from './common.mjs';

const ACHIEVEMENT_MUTATION_SCOPE_ID = 'achievement-state';
const ACHIEVEMENT_MUTATION_ROOT = 'achievements';
const SERVICE_OPTION_FIELDS = Object.freeze(['mutationScope']);
const MUTATION_SCOPE_FIELDS = Object.freeze(['fields', 'id', 'transaction']);
const ADVANCE_FIELDS = Object.freeze([
    'achievementId',
    'advanceBase',
    'rank',
    'universe',
]);
const REMOVE_UNIVERSE_RANK_FIELDS = Object.freeze([
    'achievementId',
    'universe',
]);

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function assertPlainObject(value, path, code = 'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY'){
    let array;
    try {
        array = Array.isArray(value);
    }
    catch {
        fail(code, `${path} could not be safely inspected.`, { path });
    }

    if (value === null || typeof value !== 'object' || array){
        fail(code, `${path} must be a plain object.`, { path });
    }

    let prototype;
    try {
        prototype = Object.getPrototypeOf(value);
    }
    catch {
        fail(code, `${path} could not be safely inspected.`, { path });
    }

    if (prototype !== Object.prototype && prototype !== null){
        fail(code, `${path} must be a plain object.`, { path });
    }

    return value;
}

function assertClosedDataObject(
    value,
    path,
    allowedFields,
    code = 'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY'
){
    const object = assertPlainObject(value, path, code);
    let keys;
    try {
        keys = Reflect.ownKeys(object);
    }
    catch {
        fail(code, `${path} keys could not be safely inspected.`, { path });
    }

    const allowed = new Set(allowedFields);
    for (const key of keys){
        if (typeof key !== 'string' || !allowed.has(key)){
            fail(
                code,
                `${path} contains an unsupported field.`,
                { path, field: typeof key === 'string' ? key : '[symbol]' }
            );
        }
    }

    return object;
}

function readDataField(
    object,
    field,
    path,
    code = 'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY'
){
    let descriptor;
    try {
        descriptor = Object.getOwnPropertyDescriptor(object, field);
    }
    catch {
        fail(code, `${path}.${field} could not be safely inspected.`, { path: `${path}.${field}` });
    }

    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable){
        fail(code, `${path}.${field} must be an enumerable data field.`, { path: `${path}.${field}` });
    }

    return descriptor.value;
}

function readOptionalDataField(
    object,
    field,
    path,
    code = 'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY'
){
    let descriptor;
    try {
        descriptor = Object.getOwnPropertyDescriptor(object, field);
    }
    catch {
        fail(code, `${path}.${field} could not be safely inspected.`, { path: `${path}.${field}` });
    }

    if (!descriptor){
        return Object.freeze({ present: false, value: undefined });
    }
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable){
        fail(code, `${path}.${field} must be an enumerable data field.`, { path: `${path}.${field}` });
    }

    return Object.freeze({ present: true, value: descriptor.value });
}

function assertMutationScope(value){
    const scope = assertClosedDataObject(
        value,
        'achievementStateService.mutationScope',
        MUTATION_SCOPE_FIELDS
    );
    const id = readDataField(scope, 'id', 'achievementStateService.mutationScope');
    const rawFields = readDataField(scope, 'fields', 'achievementStateService.mutationScope');
    const transaction = readDataField(scope, 'transaction', 'achievementStateService.mutationScope');

    if (id !== ACHIEVEMENT_MUTATION_SCOPE_ID){
        fail(
            'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY',
            `achievement mutation scope must use id ${JSON.stringify(ACHIEVEMENT_MUTATION_SCOPE_ID)}.`,
            { scopeId: id }
        );
    }

    let fields;
    try {
        fields = canonicalizeStateValue(rawFields, 'achievementStateService.mutationScope.fields');
    }
    catch (error){
        if (error instanceof EngineContractError){
            fail(
                'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY',
                'achievement mutation scope fields must be inert state data.',
                { causeCode: error.code }
            );
        }
        throw error;
    }

    if (
        !Array.isArray(fields)
        || fields.length !== 1
        || fields[0] !== ACHIEVEMENT_MUTATION_ROOT
    ){
        fail(
            'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY',
            `achievement mutation scope must own only ${JSON.stringify(ACHIEVEMENT_MUTATION_ROOT)}.`,
            { fields }
        );
    }

    if (typeof transaction !== 'function'){
        fail(
            'INVALID_ACHIEVEMENT_STATE_SERVICE_CAPABILITY',
            'achievement mutation scope must provide a transaction function.',
            { transactionType: typeof transaction }
        );
    }

    return Object.freeze({ transaction });
}

function assertMutationAchievementId(value, path){
    if (typeof value !== 'string'){
        fail(
            'INVALID_ACHIEVEMENT_STATE_ID',
            `${path} must be a canonical achievement content ID string.`,
            { path, valueType: typeof value }
        );
    }
    return assertAchievementStateId(value, path);
}

function assertMutationUniverse(value, path){
    if (typeof value !== 'string'){
        fail(
            'INVALID_ACHIEVEMENT_UNIVERSE',
            `${path} must name a non-standard achievement universe track.`,
            { path, valueType: typeof value }
        );
    }

    const universe = assertAchievementUniverse(value, path);
    if (universe === ACHIEVEMENT_STANDARD_UNIVERSE){
        fail(
            'INVALID_ACHIEVEMENT_UNIVERSE',
            `${path} must name a non-standard achievement universe track.`,
            { path, value }
        );
    }
    if (!ACHIEVEMENT_UNIVERSE_RANK_FIELDS.includes(universe)){
        fail(
            'INVALID_ACHIEVEMENT_UNIVERSE',
            `${path} must name a supported achievement universe track.`,
            { path, value }
        );
    }
    return universe;
}

function assertBoolean(value, path){
    if (typeof value !== 'boolean'){
        fail(
            'INVALID_ACHIEVEMENT_STATE_MUTATION',
            `${path} must be a boolean.`,
            { path, valueType: typeof value }
        );
    }
    return value;
}

function normalizeRank(value, path){
    if (typeof value !== 'number'){
        fail(
            'INVALID_ACHIEVEMENT_STATE_RANK',
            `${path} must be a non-negative safe integer.`,
            { path, valueType: typeof value }
        );
    }
    const rank = assertAchievementRank(value, path);
    return Object.is(rank, -0) ? 0 : rank;
}

function validateAdvanceCommand(value){
    const path = 'achievementStateService.advance';
    const command = assertClosedDataObject(
        value,
        path,
        ADVANCE_FIELDS,
        'INVALID_ACHIEVEMENT_STATE_MUTATION'
    );
    const achievementId = assertMutationAchievementId(
        readDataField(command, 'achievementId', path, 'INVALID_ACHIEVEMENT_STATE_MUTATION'),
        `${path}.achievementId`
    );
    const rank = normalizeRank(
        readDataField(command, 'rank', path, 'INVALID_ACHIEVEMENT_STATE_MUTATION'),
        `${path}.rank`
    );
    const advanceBase = assertBoolean(
        readDataField(command, 'advanceBase', path, 'INVALID_ACHIEVEMENT_STATE_MUTATION'),
        `${path}.advanceBase`
    );
    const universeField = readOptionalDataField(
        command,
        'universe',
        path,
        'INVALID_ACHIEVEMENT_STATE_MUTATION'
    );
    const universe = universeField.present
        ? assertMutationUniverse(universeField.value, `${path}.universe`)
        : null;

    if (!advanceBase && universe === null){
        fail(
            'INVALID_ACHIEVEMENT_STATE_MUTATION',
            'achievement advancement must target the base rank, a universe rank, or both.',
            { path }
        );
    }

    return Object.freeze({ achievementId, rank, advanceBase, universe });
}

function validateRemoveUniverseRankCommand(value){
    const path = 'achievementStateService.removeUniverseRank';
    const command = assertClosedDataObject(
        value,
        path,
        REMOVE_UNIVERSE_RANK_FIELDS,
        'INVALID_ACHIEVEMENT_STATE_MUTATION'
    );
    return Object.freeze({
        achievementId: assertMutationAchievementId(
            readDataField(command, 'achievementId', path, 'INVALID_ACHIEVEMENT_STATE_MUTATION'),
            `${path}.achievementId`
        ),
        universe: assertMutationUniverse(
            readDataField(command, 'universe', path, 'INVALID_ACHIEVEMENT_STATE_MUTATION'),
            `${path}.universe`
        ),
    });
}

function defineDataField(target, key, value){
    Object.defineProperty(target, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
    });
}

function hasOwn(target, key){
    return Object.prototype.hasOwnProperty.call(target, key);
}

function freezeMutationResult(record){
    return Object.freeze(record);
}

export function createAchievementStateService(rawOptions){
    const options = assertClosedDataObject(
        rawOptions,
        'achievementStateServiceOptions',
        SERVICE_OPTION_FIELDS
    );
    const mutationScope = readDataField(options, 'mutationScope', 'achievementStateServiceOptions');
    const { transaction } = assertMutationScope(mutationScope);

    function advance(rawCommand){
        const { achievementId, rank, advanceBase, universe } = validateAdvanceCommand(rawCommand);
        let recordCreated = false;
        let baseRankChanged = false;
        let universeTrackCreated = false;
        let universeRankChanged = false;
        let previousBaseRank = 0;
        let newBaseRank = 0;
        let previousUniverseTrackPresent = universe === null ? null : false;
        let newUniverseTrackPresent = universe === null ? null : false;
        let previousUniverseRank = universe === null ? null : 0;
        let newUniverseRank = universe === null ? null : 0;

        const diagnostic = transaction('achievement.advance', draft => {
            const achievements = draft.achievements;
            let record = achievements[achievementId];
            if (!hasOwn(achievements, achievementId)){
                record = { rank: 0, universeRanks: {} };
                defineDataField(achievements, achievementId, record);
                recordCreated = true;
            }

            previousBaseRank = record.rank;
            if (advanceBase && rank > record.rank){
                record.rank = rank;
                baseRankChanged = true;
            }
            newBaseRank = record.rank;

            if (universe !== null){
                previousUniverseTrackPresent = hasOwn(record.universeRanks, universe);
                previousUniverseRank = previousUniverseTrackPresent
                    ? record.universeRanks[universe]
                    : 0;

                if (!previousUniverseTrackPresent){
                    defineDataField(record.universeRanks, universe, rank);
                    universeTrackCreated = true;
                    universeRankChanged = rank > 0;
                }
                else if (rank > record.universeRanks[universe]){
                    record.universeRanks[universe] = rank;
                    universeRankChanged = true;
                }

                newUniverseTrackPresent = true;
                newUniverseRank = record.universeRanks[universe];
            }
        });

        return freezeMutationResult({
            operation: 'advance',
            achievementId,
            universe,
            changed: diagnostic.committed,
            recordCreated,
            baseRankChanged,
            universeTrackCreated,
            universeRankChanged,
            universeRankRemoved: false,
            previousBaseRank,
            newBaseRank,
            previousUniverseTrackPresent,
            newUniverseTrackPresent,
            previousUniverseRank,
            newUniverseRank,
            diagnostic,
        });
    }

    function removeUniverseRank(rawCommand){
        const { achievementId, universe } = validateRemoveUniverseRankCommand(rawCommand);
        let universeRankChanged = false;
        let universeRankRemoved = false;
        let previousBaseRank = 0;
        let newBaseRank = 0;
        let previousUniverseTrackPresent = false;
        let newUniverseTrackPresent = false;
        let previousUniverseRank = 0;
        let newUniverseRank = 0;

        const diagnostic = transaction('achievement.removeUniverseRank', draft => {
            const achievements = draft.achievements;
            if (!hasOwn(achievements, achievementId)) return;

            const record = achievements[achievementId];
            previousBaseRank = record.rank;
            newBaseRank = record.rank;
            previousUniverseTrackPresent = hasOwn(record.universeRanks, universe);
            if (!previousUniverseTrackPresent) return;

            previousUniverseRank = record.universeRanks[universe];
            universeRankChanged = previousUniverseRank > 0;
            universeRankRemoved = true;
            delete record.universeRanks[universe];
        });

        return freezeMutationResult({
            operation: 'removeUniverseRank',
            achievementId,
            universe,
            changed: diagnostic.committed,
            recordCreated: false,
            baseRankChanged: false,
            universeTrackCreated: false,
            universeRankChanged,
            universeRankRemoved,
            previousBaseRank,
            newBaseRank,
            previousUniverseTrackPresent,
            newUniverseTrackPresent,
            previousUniverseRank,
            newUniverseRank,
            diagnostic,
        });
    }

    return Object.freeze({
        advance,
        removeUniverseRank,
    });
}
