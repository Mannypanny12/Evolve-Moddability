import { createClock } from '../../engine/runtime/clock.mjs';

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

export function createBrowserClockPort(options = {}){
    const now = readOptionalFunction(options, 'now', 'Browser clock');
    return Object.freeze({
        now(){
            return now === undefined ? Date.now() : now();
        },
    });
}

export function createBrowserClock(options = {}){
    return createClock(createBrowserClockPort(options));
}
