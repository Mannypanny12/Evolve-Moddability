import {
    EngineContractError,
    assertContentType,
    assertNamespace,
    parseContentId,
} from '../../engine/identity.mjs';

const MAPPING_ID_PATTERN = /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)*$/;
const DOMAIN_PATTERN = /^[a-z][a-z0-9_-]*$/;
const LEGACY_PATH_PATTERN = /^global(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/;
const MILESTONE_PATTERN = /^M([0-9]+)([A-Z])?([0-9]+)?$/;
const MODES = new Set(['direct', 'contextual', 'composite']);
const BRIDGE_REMOVAL_BACKSTOP = Object.freeze({ value: 'M9C', major: 9, phase: 3, slice: 0 });

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function isPlainObject(value){
    if (value === null || typeof value !== 'object') return false;
    try {
        const prototype = Object.getPrototypeOf(value);
        return prototype === Object.prototype || prototype === null;
    }
    catch {
        return false;
    }
}

function readRecord(value, label){
    if (!isPlainObject(value)){
        fail('INVALID_LEGACY_MAPPING', `${label} must be a plain object.`, { label });
    }

    let keys;
    try {
        keys = Reflect.ownKeys(value);
    }
    catch {
        fail('INVALID_LEGACY_MAPPING', `${label} could not be inspected.`, { label });
    }

    const record = Object.create(null);
    for (const key of keys){
        if (typeof key !== 'string'){
            fail('INVALID_LEGACY_MAPPING', `${label} must not contain symbol fields.`, { label });
        }
        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(value, key);
        }
        catch {
            fail('INVALID_LEGACY_MAPPING', `${label}.${key} could not be inspected.`, { label, key });
        }
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable){
            fail('INVALID_LEGACY_MAPPING', `${label}.${key} must be an enumerable data field.`, { label, key });
        }
        record[key] = descriptor.value;
    }
    return record;
}

function assertExactFields(record, allowed, label){
    for (const key of Object.keys(record)){
        if (!allowed.has(key)){
            fail('UNKNOWN_LEGACY_MAPPING_FIELD', `Unknown ${label} field: ${key}.`, { label, field: key });
        }
    }
}

function assertTrimmedString(value, label){
    if (typeof value !== 'string' || value.length === 0 || value.trim() !== value){
        fail('INVALID_LEGACY_MAPPING_FIELD', `${label} must be a non-empty trimmed string.`, { label });
    }
    return value;
}

function assertMappingId(value){
    if (typeof value !== 'string' || !MAPPING_ID_PATTERN.test(value)){
        fail('INVALID_LEGACY_MAPPING_ID', 'Legacy mapping id must be a stable lowercase dotted identifier.', { id: value });
    }
    return value;
}

function validateOwner(value){
    const owner = readRecord(value, 'legacy mapping owner');
    assertExactFields(owner, new Set(['packageId', 'source']), 'legacy mapping owner');
    assertNamespace(owner.packageId);
    return Object.freeze({
        packageId: owner.packageId,
        source: assertTrimmedString(owner.source, 'legacy mapping owner.source'),
    });
}

function inspectDenseArray(value, label){
    let isArray;
    let keys;
    let lengthDescriptor;
    try {
        isArray = Array.isArray(value);
        if (isArray){
            keys = Reflect.ownKeys(value);
            lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
        }
    }
    catch {
        fail('INVALID_LEGACY_MAPPING_FIELD', `${label} could not be inspected.`, { label });
    }

    if (!isArray){
        fail('INVALID_LEGACY_MAPPING_FIELD', `${label} must be an array.`, { label });
    }
    if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
        !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0){
        fail('INVALID_LEGACY_MAPPING_FIELD', `${label} has an invalid length.`, { label });
    }

    const length = lengthDescriptor.value;
    for (const key of keys){
        if (typeof key !== 'string'){
            fail('INVALID_LEGACY_MAPPING_FIELD', `${label} must not contain symbol fields.`, { label });
        }
        if (key === 'length') continue;
        if (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length){
            fail('INVALID_LEGACY_MAPPING_FIELD', `${label} must not contain non-index fields.`, { label, field: key });
        }
    }

    const items = new Array(length);
    for (let index = 0; index < length; index++){
        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        }
        catch {
            fail('INVALID_LEGACY_MAPPING_FIELD', `${label}[${index}] could not be inspected.`, { label, index });
        }
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable){
            fail('INVALID_LEGACY_MAPPING_FIELD', `${label} must be dense and contain only data items.`, { label, index });
        }
        items[index] = descriptor.value;
    }
    return items;
}

function validateStringArray(value, label, { allowEmpty = true, legacyPaths = false } = {}){
    const items = inspectDenseArray(value, label);
    if (!allowEmpty && items.length === 0){
        fail('INVALID_LEGACY_MAPPING_FIELD', `${label} must not be empty.`, { label });
    }

    const seen = new Set();
    const copy = new Array(items.length);
    for (let index = 0; index < items.length; index++){
        const item = assertTrimmedString(items[index], `${label}[${index}]`);
        if (legacyPaths && !LEGACY_PATH_PATTERN.test(item)){
            fail('INVALID_LEGACY_MAPPING_FIELD', `${label}[${index}] must be an explicit global state path.`, { label, item });
        }
        if (seen.has(item)){
            fail('INVALID_LEGACY_MAPPING_FIELD', `${label} contains a duplicate value: ${item}.`, { label, item });
        }
        seen.add(item);
        copy[index] = item;
    }
    return Object.freeze(copy);
}

function validateCanonicalIds(value, family){
    const ids = validateStringArray(value, 'legacy mapping canonicalIds', { allowEmpty: false });
    for (const id of ids){
        const parsed = parseContentId(id);
        if (parsed.type !== family){
            fail(
                'LEGACY_MAPPING_FAMILY_MISMATCH',
                `Legacy mapping family ${family} cannot target ${parsed.type} content ${id}.`,
                { family, id, contentType: parsed.type }
            );
        }
    }
    return ids;
}

function parseMilestone(value, label){
    if (typeof value !== 'string'){
        fail('INVALID_LEGACY_MAPPING_FIELD', `${label} must be a milestone ID such as M1D or M6B.`, { label, value });
    }
    const match = MILESTONE_PATTERN.exec(value);
    if (!match){
        fail('INVALID_LEGACY_MAPPING_FIELD', `${label} must be a milestone ID such as M1D or M6B.`, { label, value });
    }
    const major = Number(match[1]);
    const phase = match[2] ? match[2].charCodeAt(0) - 64 : 0;
    const slice = match[3] ? Number(match[3]) : 0;
    if (!Number.isSafeInteger(major) || !Number.isSafeInteger(slice)){
        fail('INVALID_LEGACY_MAPPING_FIELD', `${label} contains an unsupported milestone number.`, { label, value });
    }
    return Object.freeze({ value, major, phase, slice });
}

function compareMilestones(a, b){
    if (a.major !== b.major) return a.major - b.major;
    if (a.phase !== b.phase) return a.phase - b.phase;
    return a.slice - b.slice;
}

function validateLifecycle(introducedIn, removeBy){
    const introduced = parseMilestone(introducedIn, 'legacy mapping introducedIn');
    const removal = parseMilestone(removeBy, 'legacy mapping removeBy');
    if (compareMilestones(removal, introduced) <= 0){
        fail(
            'INVALID_LEGACY_MAPPING_LIFECYCLE',
            `Legacy mapping removeBy ${removeBy} must be later than introducedIn ${introducedIn}.`,
            { introducedIn, removeBy }
        );
    }
    if (compareMilestones(removal, BRIDGE_REMOVAL_BACKSTOP) > 0){
        fail(
            'INVALID_LEGACY_MAPPING_LIFECYCLE',
            `Legacy mapping removeBy ${removeBy} exceeds the M9C bridge-removal backstop.`,
            { introducedIn, removeBy, backstop: BRIDGE_REMOVAL_BACKSTOP.value }
        );
    }
    return Object.freeze({ introducedIn: introduced.value, removeBy: removal.value });
}

function validateMapping(record){
    const input = readRecord(record, 'legacy mapping');
    assertExactFields(input, new Set([
        'id',
        'domain',
        'family',
        'mode',
        'legacyPath',
        'canonicalIds',
        'contextKeys',
        'owner',
        'introducedIn',
        'removeBy',
        'stateSemantics',
        'sourceLocations',
    ]), 'legacy mapping');

    const id = assertMappingId(input.id);
    if (typeof input.domain !== 'string' || !DOMAIN_PATTERN.test(input.domain)){
        fail('INVALID_LEGACY_MAPPING_FIELD', 'Legacy mapping domain must be a lowercase token.', { domain: input.domain });
    }

    const family = assertContentType(input.family);
    if (!MODES.has(input.mode)){
        fail('INVALID_LEGACY_MAPPING_FIELD', 'Legacy mapping mode must be direct, contextual, or composite.', { mode: input.mode });
    }
    if (typeof input.legacyPath !== 'string' || !LEGACY_PATH_PATTERN.test(input.legacyPath)){
        fail('INVALID_LEGACY_MAPPING_FIELD', 'Legacy mapping legacyPath must be an explicit global state path.', { legacyPath: input.legacyPath });
    }

    const canonicalIds = validateCanonicalIds(input.canonicalIds, family);
    const contextKeys = validateStringArray(input.contextKeys ?? [], 'legacy mapping contextKeys', { legacyPaths: true });
    if (input.mode === 'direct'){
        if (canonicalIds.length !== 1){
            fail('INVALID_LEGACY_MAPPING_FIELD', 'Direct legacy mappings must target exactly one canonical ID.', { id });
        }
        if (contextKeys.length !== 0){
            fail('INVALID_LEGACY_MAPPING_FIELD', 'Direct legacy mappings must not declare contextual keys.', { id });
        }
    }
    else if (contextKeys.length === 0){
        fail('INVALID_LEGACY_MAPPING_FIELD', 'Contextual/composite mappings must declare contextKeys.', { id });
    }

    const lifecycle = validateLifecycle(input.introducedIn, input.removeBy);
    return Object.freeze({
        id,
        domain: input.domain,
        family,
        mode: input.mode,
        legacyPath: input.legacyPath,
        canonicalIds,
        contextKeys,
        owner: validateOwner(input.owner),
        introducedIn: lifecycle.introducedIn,
        removeBy: lifecycle.removeBy,
        stateSemantics: assertTrimmedString(input.stateSemantics, 'legacy mapping stateSemantics'),
        sourceLocations: validateStringArray(input.sourceLocations, 'legacy mapping sourceLocations', { allowEmpty: false }),
    });
}

export class LegacyMappingCatalog {
    #mappings = new Map();
    #legacyPaths = new Map();

    get size(){
        return this.#mappings.size;
    }

    register(record){
        const mapping = validateMapping(record);
        if (this.#mappings.has(mapping.id)){
            fail('DUPLICATE_LEGACY_MAPPING', `Duplicate legacy mapping id: ${mapping.id}.`, { id: mapping.id });
        }
        const existingPath = this.#legacyPaths.get(mapping.legacyPath);
        if (existingPath !== undefined){
            fail(
                'DUPLICATE_LEGACY_MAPPING_PATH',
                `Legacy path ${mapping.legacyPath} is already mapped by ${existingPath}.`,
                { legacyPath: mapping.legacyPath, existingId: existingPath, requestedId: mapping.id }
            );
        }

        this.#mappings.set(mapping.id, mapping);
        this.#legacyPaths.set(mapping.legacyPath, mapping.id);
        return mapping;
    }

    get(id){
        return this.#mappings.get(assertMappingId(id));
    }

    getRequired(id){
        const validatedId = assertMappingId(id);
        const mapping = this.#mappings.get(validatedId);
        if (mapping === undefined){
            fail('UNKNOWN_LEGACY_MAPPING', `Unknown legacy mapping id: ${validatedId}.`, { id: validatedId });
        }
        return mapping;
    }

    entries(){
        return [...this.#mappings.values()].sort((a, b) => a.id.localeCompare(b.id));
    }

    *[Symbol.iterator](){
        for (const mapping of this.entries()) yield mapping;
    }
}
