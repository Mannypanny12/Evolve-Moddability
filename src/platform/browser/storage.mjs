import { createStorage } from '../../engine/runtime/storage.mjs';

const STORAGE_METHODS = Object.freeze(['getItem', 'setItem', 'removeItem']);

function assertOptionsObject(options, label){
    if (options === null || typeof options !== 'object' || Array.isArray(options)){
        throw new TypeError(`${label} options must be an object.`);
    }
}

function assertStorageLike(storage){
    if (storage === null || (typeof storage !== 'object' && typeof storage !== 'function')){
        throw new TypeError('Browser storage override must be Web-Storage-compatible when provided.');
    }
    for (const methodName of STORAGE_METHODS){
        if (typeof Reflect.get(storage, methodName) !== 'function'){
            throw new TypeError(`Browser storage override must provide ${methodName}().`);
        }
    }
    return storage;
}

function callStorage(storage, methodName, args){
    const method = Reflect.get(storage, methodName);
    return Reflect.apply(method, storage, args);
}

export function createBrowserStoragePort(options = {}){
    assertOptionsObject(options, 'Browser storage');
    const providedStorage = options.storage;
    if (providedStorage !== undefined){
        assertStorageLike(providedStorage);
    }

    const resolveStorage = () => providedStorage === undefined ? globalThis.localStorage : providedStorage;

    return Object.freeze({
        read(key){
            return callStorage(resolveStorage(), 'getItem', [key]);
        },
        write(key, value){
            return callStorage(resolveStorage(), 'setItem', [key, value]);
        },
        remove(key){
            return callStorage(resolveStorage(), 'removeItem', [key]);
        },
    });
}

export function createBrowserStorage(options = {}){
    return createStorage(createBrowserStoragePort(options));
}
