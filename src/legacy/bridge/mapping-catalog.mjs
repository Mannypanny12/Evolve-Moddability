import {
    EngineContractError,
    assertContentType,
    assertNamespace,
    parseContentId,
} from '../../engine/identity.mjs';

const MAPPING_ID_PATTERN = /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)*$/;
const DOMAIN_PATTERN = /^[a-z][a-z0-9_-]*$/;
const LEGACY_PATH_PATTERN = /^global(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/;
const MILESTONE_PATTERN = /^M[0-9]+[A-Z]?(?:[0-9]+)?$/;
const MODES = new Set(['direct', 'contextual', 'composite']);

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

    const record = {};
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

function validateOwner(value){
    const owner = readRecord(value, 'legacy mapping owner');
    assertExactFields(owner, new Set(['packageId', 'source']), 'legacy mapping owner');
    assertNamespace(owner.packageId);
    return Object.freeze({
        packageId: owner.packageId,
        source: assertTrimmedString(owner.source, 'legacy mapping owner.source'),
    });
}

function validateStringArray(value, label, { allowEmpty = true } = {}){
    if (!Array.isArray(value)){
        fail('INVALID_LEGACY_MAPPING_FIELD', `${label} must be an array.`, { label });
    }
    if (!allowEmpty && value.length === 0){
        fail('INVALID_LEGACY_MAPPING_FIELD', `${label} must not be empty.`, { label });
    }

    const seen = new Set();
    const copy = new Array(value.length);
    for (let index = 0; index < value.length; index++){
        if (!Object.prototype.hasOwnProperty.call(value, index)){
            fail('INVALID_LEGACY_MAPPING_FIELD', `${label} must not be sparse.`, { label, index });
        }
        const item = assertTrimmedString(value[index], `${label}[${index}]`);
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

function validateMilestone(value, label){
    if (typeof value !== 'string' || !MILESTONE_PATTERN.test(value)){
        fail('INVALID_LEGACY_MAPPING_FIELD', `${label} must be a milestone ID such as M1D or M6B.`, { label, value });
    }
    return value;
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

    if (typeof input.id !== 'string' || !MAPPING_ID_PATTERN.test(input.id)){
        fail('INVALID_LEGACY_MAPPING_ID', 'Legacy mapping id must be a stable lowercase dotted identifier.', { id: input.id });
    }
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
    const contextKeys = validateStringArray(input.contextKeys ?? [], 'legacy mapping contextKeys');
    if (input.mode === 'direct' && canonicalIds.length !== 1){
        fail('INVALID_LEGACY_MAPPING_FIELD', 'Direct legacy mappings must target exactly one canonical ID.', { id: input.id });
    }
    if (input.mode !== 'direct' && contextKeys.length === 0){
        fail('INVALID_LEGACY_MAPPING_FIELD', 'Contextual/composite mappings must declare contextKeys.', { id: input.id });
    }

    return Object.freeze({
        id: input.id,
        domain: input.domain,
        family,
        mode: input.mode,
        legacyPath: input.legacyPath,
        canonicalIds,
        contextKeys,
        owner: validateOwner(input.owner),
        introducedIn: validateMilestone(input.introducedIn, 'legacy mapping introducedIn'),
        removeBy: validateMilestone(input.removeBy, 'legacy mapping removeBy'),
        stateSemantics: assertTrimmedString(input.stateSemantics, 'legacy mapping stateSemantics'),
        sourceLocations: validateStringArray(input.sourceLocations, 'legacy mapping sourceLocations', { allowEmpty: false }),
    });
}

export class LegacyMappingCatalog {
    #mappings = new Map();

    get size(){
        return this.#mappings.size;
    }

    register(record){
        const mapping = validateMapping(record);
        if (this.#mappings.has(mapping.id)){
            fail('DUPLICATE_LEGACY_MAPPING', `Duplicate legacy mapping id: ${mapping.id}.`, { id: mapping.id });
        }
        this.#mappings.set(mapping.id, mapping);
        return mapping;
    }

    get(id){
        return this.#mappings.get(id);
    }

    getRequired(id){
        const mapping = this.get(id);
        if (mapping === undefined){
            fail('UNKNOWN_LEGACY_MAPPING', `Unknown legacy mapping id: ${id}.`, { id });
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
