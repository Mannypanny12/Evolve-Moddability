import {
    EngineContractError,
    assertContentType,
    assertNamespace,
    describeContractValue,
    isCanonicalContentId,
    parseContentId,
} from './identity.mjs';

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

function validateOwner(owner){
    if (!isPlainObject(owner)){
        fail('INVALID_OWNER', 'Registry entry owner must be a plain object.', { owner });
    }

    let packageId;
    let source;
    try {
        packageId = owner.packageId;
        source = owner.source;
    }
    catch {
        fail('INVALID_OWNER', 'Registry entry owner fields could not be read.', { owner });
    }

    try {
        assertNamespace(packageId);
    }
    catch (error){
        if (error instanceof EngineContractError){
            fail('INVALID_OWNER', `Invalid owner package ID: ${describeContractValue(packageId)}.`, { packageId, source });
        }
        throw error;
    }

    if (typeof source !== 'string' || source.length === 0 || source.trim() !== source){
        fail('INVALID_OWNER', `Invalid owner source: ${describeContractValue(source)}.`, { packageId, source });
    }

    return Object.freeze({ packageId, source });
}

function validateSchemaVersion(schemaVersion){
    if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1){
        fail('INVALID_SCHEMA_VERSION', `Schema version must be a positive safe integer, got ${describeContractValue(schemaVersion)}.`, { schemaVersion });
    }
    return schemaVersion;
}

function validateTags(tags = []){
    if (!Array.isArray(tags)){
        fail('INVALID_TAG', 'Registry entry tags must be an array.', { tags });
    }

    const seen = new Set();
    const copy = Array.from(tags, tag => {
        if (typeof tag !== 'string' || tag.length === 0 || tag.trim() !== tag){
            fail('INVALID_TAG', `Invalid registry tag: ${describeContractValue(tag)}.`, { tag });
        }
        if (seen.has(tag)){
            fail('INVALID_TAG', `Duplicate registry tag: ${describeContractValue(tag)}.`, { tag });
        }
        seen.add(tag);
        return tag;
    });
    return Object.freeze(copy);
}

function validateAliases(aliases = []){
    if (!Array.isArray(aliases)){
        fail('INVALID_LEGACY_ALIAS', 'Registry entry aliases must be an array.', { aliases });
    }

    const seen = new Set();
    const copy = Array.from(aliases, alias => {
        if (typeof alias !== 'string' || alias.length === 0 || alias.trim() !== alias){
            fail('INVALID_LEGACY_ALIAS', `Invalid legacy alias: ${describeContractValue(alias)}.`, { alias });
        }
        if (isCanonicalContentId(alias)){
            fail('INVALID_LEGACY_ALIAS', `Legacy alias must not be a canonical content ID: ${describeContractValue(alias)}.`, { alias });
        }
        if (seen.has(alias)){
            fail('DUPLICATE_LEGACY_ALIAS', `Duplicate legacy alias in one registration: ${describeContractValue(alias)}.`, { alias });
        }
        seen.add(alias);
        return alias;
    });
    return Object.freeze(copy);
}

function compareCanonicalIds(a, b){
    return a < b ? -1 : a > b ? 1 : 0;
}

function invalidCanonicalDefinition(path, value, reason = 'unsupported value'){
    fail(
        'INVALID_CANONICAL_DEFINITION',
        `Validated definition output at ${path} contains ${reason}: ${describeContractValue(value)}.`,
        { path, value }
    );
}

function canonicalizeArray(value, path, ancestors){
    let keys;
    let lengthDescriptor;
    try {
        keys = Reflect.ownKeys(value);
        lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    }
    catch {
        invalidCanonicalDefinition(path, value, 'an uninspectable array');
    }

    if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
        !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0){
        invalidCanonicalDefinition(path, value, 'an invalid array length');
    }

    const length = lengthDescriptor.value;
    for (const key of keys){
        if (typeof key !== 'string'){
            invalidCanonicalDefinition(path, value, 'a symbol-keyed array field');
        }
        if (key === 'length') continue;
        if (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length){
            invalidCanonicalDefinition(`${path}.${key}`, value, 'a non-index array field');
        }
    }

    const copy = new Array(length);
    for (let index = 0; index < length; index++){
        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        }
        catch {
            invalidCanonicalDefinition(`${path}[${index}]`, value, 'an uninspectable array item');
        }
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable){
            invalidCanonicalDefinition(`${path}[${index}]`, value, 'a sparse or accessor-backed array item');
        }
        copy[index] = canonicalizeValidatedDefinition(descriptor.value, `${path}[${index}]`, ancestors);
    }
    return Object.freeze(copy);
}

function canonicalizeObject(value, path, ancestors){
    let prototype;
    let keys;
    try {
        prototype = Object.getPrototypeOf(value);
        keys = Reflect.ownKeys(value);
    }
    catch {
        invalidCanonicalDefinition(path, value, 'an uninspectable object');
    }

    if (prototype !== Object.prototype && prototype !== null){
        invalidCanonicalDefinition(path, value, 'a non-plain object');
    }

    const stringKeys = [];
    for (const key of keys){
        if (typeof key !== 'string'){
            invalidCanonicalDefinition(path, value, 'a symbol-keyed object field');
        }
        stringKeys.push(key);
    }
    stringKeys.sort(compareCanonicalIds);

    const copy = {};
    for (const key of stringKeys){
        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(value, key);
        }
        catch {
            invalidCanonicalDefinition(`${path}.${key}`, value, 'an uninspectable object field');
        }
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable){
            invalidCanonicalDefinition(`${path}.${key}`, value, 'a non-enumerable or accessor-backed object field');
        }
        Object.defineProperty(copy, key, {
            value: canonicalizeValidatedDefinition(descriptor.value, `${path}.${key}`, ancestors),
            enumerable: true,
            writable: true,
            configurable: true,
        });
    }
    return Object.freeze(copy);
}

function canonicalizeValidatedDefinition(value, path = 'definition', ancestors = new Set()){
    if (value === null) return null;

    switch (typeof value){
        case 'string':
        case 'boolean':
            return value;
        case 'number':
            if (!Number.isFinite(value)){
                invalidCanonicalDefinition(path, value, 'a non-finite number');
            }
            return value;
        case 'object':
            break;
        default:
            invalidCanonicalDefinition(path, value);
    }

    let array;
    try {
        array = Array.isArray(value);
    }
    catch {
        invalidCanonicalDefinition(path, value, 'an uninspectable object');
    }

    if (ancestors.has(value)){
        invalidCanonicalDefinition(path, value, 'a cyclic reference');
    }
    ancestors.add(value);
    try {
        return array
            ? canonicalizeArray(value, path, ancestors)
            : canonicalizeObject(value, path, ancestors);
    }
    finally {
        ancestors.delete(value);
    }
}

function describeThrownValue(value){
    try {
        if (value && typeof value === 'object' && typeof value.message === 'string'){
            const name = typeof value.name === 'string' ? value.name : 'Error';
            return `${name}: ${value.message}`;
        }
    }
    catch {
        // Fall back to the fail-safe value formatter below.
    }
    return describeContractValue(value);
}

function enrichDefinitionError(error, context){
    const definitionDetails = {
        definitionId: context.id,
        definitionOwnerPackageId: context.owner.packageId,
        definitionSchemaVersion: context.schemaVersion,
    };

    if (error instanceof EngineContractError){
        throw new EngineContractError(
            error.code,
            `${error.message} [${context.id}]`,
            { ...(error.details || {}), ...definitionDetails }
        );
    }

    fail(
        'DEFINITION_VALIDATOR_FAILURE',
        `Definition validator failed for ${describeContractValue(context.id)}: ${describeThrownValue(error)}.`,
        { ...definitionDetails }
    );
}

function validateDefinition(validator, definition, context){
    try {
        const validated = validator(definition, context);
        return canonicalizeValidatedDefinition(validated);
    }
    catch (error){
        enrichDefinitionError(error, context);
    }
}

export class Registry {
    #type;
    #definitionValidator;
    #entries = new Map();
    #aliases = new Map();

    constructor(options = {}){
        if (!isPlainObject(options)){
            fail('INVALID_REGISTRY_OPTIONS', 'Registry options must be a plain object.', { options });
        }
        this.#type = assertContentType(options.type);
        if (options.definitionValidator !== undefined && typeof options.definitionValidator !== 'function'){
            fail(
                'INVALID_DEFINITION_VALIDATOR',
                'Registry definitionValidator must be a function when provided.',
                { definitionValidator: options.definitionValidator }
            );
        }
        this.#definitionValidator = options.definitionValidator;
    }

    get type(){
        return this.#type;
    }

    get size(){
        return this.#entries.size;
    }

    register(record){
        if (!isPlainObject(record)){
            fail('INVALID_REGISTRY_ENTRY', 'Registry entry must be a plain object.', { record });
        }

        const parsed = parseContentId(record.id);
        if (parsed.type !== this.#type){
            fail(
                'REGISTRY_TYPE_MISMATCH',
                `Registry type ${describeContractValue(this.#type)} cannot register content type ${describeContractValue(parsed.type)}.`,
                { registryType: this.#type, contentType: parsed.type, id: parsed.canonical }
            );
        }
        if (this.#entries.has(parsed.canonical)){
            fail('DUPLICATE_CONTENT_ID', `Duplicate content ID ${describeContractValue(parsed.canonical)}.`, { id: parsed.canonical });
        }
        if (!Object.prototype.hasOwnProperty.call(record, 'definition')){
            fail('INVALID_REGISTRY_ENTRY', `Registry entry ${describeContractValue(parsed.canonical)} is missing a definition.`, { id: parsed.canonical });
        }

        const owner = validateOwner(record.owner);
        if (parsed.namespace !== owner.packageId){
            fail(
                'CONTENT_NAMESPACE_OWNER_MISMATCH',
                `Content namespace ${describeContractValue(parsed.namespace)} must match owner package ${describeContractValue(owner.packageId)}.`,
                { id: parsed.canonical, namespace: parsed.namespace, ownerPackageId: owner.packageId }
            );
        }
        const schemaVersion = validateSchemaVersion(record.schemaVersion);
        const tags = validateTags(record.tags);
        const aliases = validateAliases(record.aliases);

        for (const alias of aliases){
            const existing = this.#aliases.get(alias);
            if (existing !== undefined){
                fail(
                    'DUPLICATE_LEGACY_ALIAS',
                    `Legacy alias ${describeContractValue(alias)} is already mapped to ${describeContractValue(existing)}.`,
                    { alias, existingId: existing, requestedId: parsed.canonical }
                );
            }
        }

        const context = Object.freeze({
            id: parsed.canonical,
            namespace: parsed.namespace,
            type: parsed.type,
            localId: parsed.localId,
            owner,
            schemaVersion,
            tags,
            aliases,
        });
        const definition = this.#definitionValidator
            ? validateDefinition(this.#definitionValidator, record.definition, context)
            : record.definition;

        const entry = Object.freeze({
            id: parsed.canonical,
            owner,
            schemaVersion,
            tags,
            aliases,
            definition,
        });

        this.#entries.set(parsed.canonical, entry);
        for (const alias of aliases){
            this.#aliases.set(alias, parsed.canonical);
        }
        return entry;
    }

    #parseForThisRegistry(id){
        const parsed = parseContentId(id);
        if (parsed.type !== this.#type){
            fail(
                'REGISTRY_TYPE_MISMATCH',
                `Registry type ${describeContractValue(this.#type)} cannot access content type ${describeContractValue(parsed.type)}.`,
                { registryType: this.#type, contentType: parsed.type, id: parsed.canonical }
            );
        }
        return parsed.canonical;
    }

    get(id){
        return this.#entries.get(this.#parseForThisRegistry(id));
    }

    has(id){
        return this.#entries.has(this.#parseForThisRegistry(id));
    }

    getRequired(id){
        const canonical = this.#parseForThisRegistry(id);
        const entry = this.#entries.get(canonical);
        if (entry === undefined){
            fail('UNKNOWN_CONTENT_ID', `Unknown content ID ${describeContractValue(canonical)}.`, { id: canonical });
        }
        return entry;
    }

    resolveAlias(alias){
        if (typeof alias !== 'string' || alias.length === 0 || alias.trim() !== alias || isCanonicalContentId(alias)){
            fail('INVALID_LEGACY_ALIAS', `Invalid legacy alias: ${describeContractValue(alias)}.`, { alias });
        }
        return this.#aliases.get(alias);
    }

    hasAlias(alias){
        return this.resolveAlias(alias) !== undefined;
    }

    ids(){
        return [...this.#entries.keys()].sort(compareCanonicalIds);
    }

    entries(){
        return this.ids().map(id => this.#entries.get(id));
    }

    *[Symbol.iterator](){
        for (const entry of this.entries()){
            yield entry;
        }
    }
}
