import { createStorage } from '../../engine/runtime/storage.mjs';

function callStorage(storage, methodName, args){
    const method = Reflect.get(storage, methodName);
    return Reflect.apply(method, storage, args);
}

export function createBrowserStorage(options = {}){
    const providedStorage = options.storage;
    const resolveStorage = () => providedStorage ?? globalThis.localStorage;

    return createStorage({
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
