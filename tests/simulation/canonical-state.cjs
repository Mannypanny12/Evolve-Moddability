'use strict';

const UNDEFINED_SENTINEL_KEY = '$evolve_test_type';
const UNDEFINED_SENTINEL_VALUE = 'undefined';
const NON_FINITE_SENTINEL_VALUE = 'non-finite-number';

function undefinedSentinel(){
    return { [UNDEFINED_SENTINEL_KEY]: UNDEFINED_SENTINEL_VALUE };
}

function nonFiniteSentinel(value){
    return {
        [UNDEFINED_SENTINEL_KEY]: NON_FINITE_SENTINEL_VALUE,
        value: Number.isNaN(value)
            ? 'NaN'
            : value === Infinity
                ? 'Infinity'
                : '-Infinity'
    };
}

function formatPath(parts){
    return parts.length ? parts.join('.') : '<root>';
}

function canonicalize(value, parts = [], options = {}){
    if (value === undefined){
        return undefinedSentinel();
    }

    if (typeof value === 'number'){
        if (!Number.isFinite(value)){
            if (options.allowNonFinite === true){
                return nonFiniteSentinel(value);
            }
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
        return value.map((item, index) => canonicalize(item, [...parts, String(index)], options));
    }

    if (typeof value === 'object'){
        const result = {};
        for (const key of Object.keys(value).sort()){
            result[key] = canonicalize(value[key], [...parts, key], options);
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
    NON_FINITE_SENTINEL_VALUE,
    canonicalize,
    canonicalStringify,
    cloneState
};
