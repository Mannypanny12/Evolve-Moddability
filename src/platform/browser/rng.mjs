import { createRng } from '../../engine/runtime/rng.mjs';

function readOptionalFunction(options, fieldName, label){
    if (options === null || typeof options !== 'object' || Array.isArray(options)){
        throw new TypeError(`${label} options must be an object.`);
    }

    const value = options[fieldName];
    if (value !== undefined && typeof value !== 'function'){
        throw new TypeError(`${label} ${fieldName} override must be a function when provided.`);
    }
    return value;
}

export function createBrowserRngPort(options = {}){
    const random = readOptionalFunction(options, 'random', 'Browser RNG');
    return Object.freeze({
        next(){
            return random === undefined ? Math.random() : random();
        },
    });
}

export function createBrowserRng(options = {}){
    return createRng(createBrowserRngPort(options));
}
