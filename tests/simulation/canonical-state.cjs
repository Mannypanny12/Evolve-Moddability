'use strict';

const UNDEFINED_SENTINEL_KEY = '$evolve_test_type';
const UNDEFINED_SENTINEL_VALUE = 'undefined';

function undefinedSentinel(){
    return { [UNDEFINED_SENTINEL_KEY]: UNDEFINED_SENTINEL_VALUE };
}

function formatPath(parts){
    return parts.length ? parts.join('.') : '<root>';
}

function canonicalize(value, parts = []){
    if (value === undefined){
        return undefinedSentinel();
    }

    if (typeof value === 'number'){
        if (!Number.isFinite(value)){
            throw new TypeError(
                `Non-finite number at ${formatPath(parts)}: ${String(value)}`
            );
        }
        return Object.is(value, -0) ? 0 : value;
    }

    if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean'
    ){
        return value;
    }

    if (Array.isArray(value)){
        return value.map((item, index) => canonicalize(item, [...parts, String(index)]));
    }

    if (typeof value === 'object'){
        const result = {};
        for (const key of Object.keys(value).sort()){
            result[key] = canonicalize(value[key], [...parts, key]);
        }
        return result;
    }

    throw new TypeError(
        `Unsupported value type at ${formatPath(parts)}: ${typeof value}`
    );
}

function canonicalStringify(value){
    return JSON.stringify(canonicalize(value));
}

function cloneState(value){
    return structuredClone(value);
}

module.exports = {
    UNDEFINED_SENTINEL_KEY,
    UNDEFINED_SENTINEL_VALUE,
    canonicalize,
    canonicalStringify,
    cloneState
};
