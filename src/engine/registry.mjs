import {
    EngineContractError,
    assertContentType,
    assertNamespace,
    isCanonicalContentId,
    parseContentId,
} from './identity.mjs';

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function isPlainObject(value){
    if (value === null || typeof value !== 'object') return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function validateOwner(owner){
    if (!isPlainObject(owner)){
        fail('INVALID_OWNER', 'Registry entry owner must be an object.', { owner });
    }

    const { packageId, source } = owner;
    try {
        assertNamespace(packageId);
    }
    catch (error){
        if (error instanceof EngineContractError){
            fail('INVALID_OWNER', `Invalid owner package ID: ${JSON.stringify(packageId)}.`, { packageId, source });
        }
        throw error;
    }

    if (typeof source !== 'string' || source.length === 0 || source.trim() !== source){
        fail('INVALID_OWNER', `Invalid owner source: ${JSON.stringify(source)}.`, { packageId, source });
    }

    return Object.freeze({ packageId, source });
}

function validateSchemaVersion(schemaVersion){
    if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1){
        fail('INVALID_SCHEMA_VERSION', `Schema version must be a positive safe integer, got ${JSON.stringify(schemaVersion)}.`, { schemaVersion });
    }
    return schemaVersion;
}

function validateTags(tags = []){
    if (!Array.isArray(tags)){
        fail('INVALID_TAG', 'Registry entry tags must be an array.', { tags });
    }

    const seen = new Set();
    const copy = tags.map(tag => {
        if (typeof tag !== 'string' || tag.length === 0 || tag.trim() !== tag){
            fail('INVALID_TAG', `Invalid registry tag: ${JSON.stringify(tag)}.`, { tag });
        }
        if (seen.has(tag)){
            fail('INVALID_TAG', `Duplicate registry tag: ${JSON.stringify(tag)}.`, { tag });
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
    const copy = aliases.map(alias => {
        if (typeof alias !== 'string' || alias.length === 0 || alias.trim() !== alias){
            fail('INVALID_LEGACY_ALIAS', `Invalid legacy alias: ${JSON.stringify(alias)}.`, { alias });
        }
        if (isCanonicalContentId(alias)){
            fail('INVALID_LEGACY_ALIAS', `Legacy alias must not be a canonical content ID: ${JSON.stringify(alias)}.`, { alias });
        }
        if (seen.has(alias)){
            fail('DUPLICATE_LEGACY_ALIAS', `Duplicate legacy alias in one registration: ${JSON.stringify(alias)}.`, { alias });
        }
        seen.add(alias);
        return alias;
    });
    return Object.freeze(copy);
}

function compareCanonicalIds(a, b){
    return a < b ? -1 : a > b ? 1 : 0;
}

export class Registry {
    #type;
    #entries = new Map();
    #aliases = new Map();

    constructor({ type } = {}){
        this.#type = assertContentType(type);
    }

    get type(){
        return this.#type;
    }

    get size(){
        return this.#entries.size;
    }

    register(record){
        if (!isPlainObject(record)){
            fail('INVALID_REGISTRY_ENTRY', 'Registry entry must be an object.', { record });
        }

        const parsed = parseContentId(record.id);
        if (parsed.type !== this.#type){
            fail(
                'REGISTRY_TYPE_MISMATCH',
                `Registry type ${JSON.stringify(this.#type)} cannot register content type ${JSON.stringify(parsed.type)}.`,
                { registryType: this.#type, contentType: parsed.type, id: parsed.canonical }
            );
        }
        if (this.#entries.has(parsed.canonical)){
            fail('DUPLICATE_CONTENT_ID', `Duplicate content ID ${JSON.stringify(parsed.canonical)}.`, { id: parsed.canonical });
        }
        if (!Object.prototype.hasOwnProperty.call(record, 'definition')){
            fail('INVALID_REGISTRY_ENTRY', `Registry entry ${JSON.stringify(parsed.canonical)} is missing a definition.`, { id: parsed.canonical });
        }

        const owner = validateOwner(record.owner);
        const schemaVersion = validateSchemaVersion(record.schemaVersion);
        const tags = validateTags(record.tags);
        const aliases = validateAliases(record.aliases);

        for (const alias of aliases){
            const existing = this.#aliases.get(alias);
            if (existing !== undefined){
                fail(
                    'DUPLICATE_LEGACY_ALIAS',
                    `Legacy alias ${JSON.stringify(alias)} is already mapped to ${JSON.stringify(existing)}.`,
                    { alias, existingId: existing, requestedId: parsed.canonical }
                );
            }
        }

        const entry = Object.freeze({
            id: parsed.canonical,
            owner,
            schemaVersion,
            tags,
            aliases,
            definition: record.definition,
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
                `Registry type ${JSON.stringify(this.#type)} cannot access content type ${JSON.stringify(parsed.type)}.`,
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

    require(id){
        const canonical = this.#parseForThisRegistry(id);
        const entry = this.#entries.get(canonical);
        if (entry === undefined){
            fail('UNKNOWN_CONTENT_ID', `Unknown content ID ${JSON.stringify(canonical)}.`, { id: canonical });
        }
        return entry;
    }

    resolveAlias(alias){
        if (typeof alias !== 'string' || alias.length === 0 || alias.trim() !== alias || isCanonicalContentId(alias)){
            fail('INVALID_LEGACY_ALIAS', `Invalid legacy alias: ${JSON.stringify(alias)}.`, { alias });
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
