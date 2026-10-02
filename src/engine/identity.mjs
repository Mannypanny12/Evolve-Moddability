const NAMESPACE_PATTERN = /^[a-z][a-z0-9_-]*$/;
const CONTENT_TYPE_PATTERN = /^[a-z][a-z0-9_-]*$/;
const LOCAL_ID_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export class EngineContractError extends Error {
    constructor(code, message, details = undefined){
        super(message);
        this.name = 'EngineContractError';
        this.code = code;
        if (details !== undefined){
            this.details = Object.freeze({ ...details });
        }
    }
}

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

export function assertNamespace(namespace){
    if (typeof namespace !== 'string' || !NAMESPACE_PATTERN.test(namespace)){
        fail('INVALID_NAMESPACE', `Invalid content namespace: ${JSON.stringify(namespace)}.`, { namespace });
    }
    return namespace;
}

export function assertContentType(type){
    if (typeof type !== 'string' || !CONTENT_TYPE_PATTERN.test(type)){
        fail('INVALID_CONTENT_TYPE', `Invalid content type: ${JSON.stringify(type)}.`, { type });
    }
    return type;
}

export function assertLocalId(localId){
    if (typeof localId !== 'string' || localId.length === 0){
        fail('INVALID_LOCAL_ID', `Invalid local content ID: ${JSON.stringify(localId)}.`, { localId });
    }

    const segments = localId.split('/');
    if (segments.some(segment => !LOCAL_ID_SEGMENT_PATTERN.test(segment))){
        fail('INVALID_LOCAL_ID', `Invalid local content ID: ${JSON.stringify(localId)}.`, { localId });
    }
    return localId;
}

export function formatContentId({ namespace, type, localId } = {}){
    assertNamespace(namespace);
    assertContentType(type);
    assertLocalId(localId);
    return `${namespace}:${type}/${localId}`;
}

export function parseContentId(value){
    if (typeof value !== 'string'){
        fail('INVALID_CONTENT_ID', `Content ID must be a string, got ${typeof value}.`, { value });
    }

    const colon = value.indexOf(':');
    if (colon <= 0 || colon !== value.lastIndexOf(':')){
        fail('INVALID_CONTENT_ID', `Invalid content ID: ${JSON.stringify(value)}.`, { value });
    }

    const namespace = value.slice(0, colon);
    const remainder = value.slice(colon + 1);
    const slash = remainder.indexOf('/');
    if (slash <= 0 || slash === remainder.length - 1){
        fail('INVALID_CONTENT_ID', `Invalid content ID: ${JSON.stringify(value)}.`, { value });
    }

    const type = remainder.slice(0, slash);
    const localId = remainder.slice(slash + 1);
    assertNamespace(namespace);
    assertContentType(type);
    assertLocalId(localId);

    const canonical = formatContentId({ namespace, type, localId });
    if (canonical !== value){
        fail('INVALID_CONTENT_ID', `Content ID is not canonical: ${JSON.stringify(value)}.`, { value, canonical });
    }

    return Object.freeze({ canonical, namespace, type, localId });
}

export function isCanonicalContentId(value){
    try {
        parseContentId(value);
        return true;
    }
    catch (error){
        if (error instanceof EngineContractError){
            return false;
        }
        throw error;
    }
}
