import { describeContractValue } from '../identity.mjs';
import { bindRuntimePortMethod, callRuntimePortMethod, runtimeFail } from './common.mjs';

function assertStorageKey(key){
    if (typeof key !== 'string' || key.length === 0){
        runtimeFail(
            'INVALID_STORAGE_KEY',
            `Storage key must be a non-empty string, got ${describeContractValue(key)}.`,
            { key }
        );
    }
    return key;
}

function assertStorageWriteValue(value){
    if (typeof value !== 'string'){
        runtimeFail(
            'INVALID_STORAGE_VALUE',
            `Storage.write() values must be strings, got ${describeContractValue(value)}.`,
            { value }
        );
    }
    return value;
}

export function createStorage(port){
    const readBinding = bindRuntimePortMethod(port, 'Storage', 'read');
    const writeBinding = bindRuntimePortMethod(port, 'Storage', 'write');
    const removeBinding = bindRuntimePortMethod(port, 'Storage', 'remove');

    return Object.freeze({
        async read(key){
            assertStorageKey(key);
            const value = await callRuntimePortMethod(readBinding, [key]);
            if (value !== null && typeof value !== 'string'){
                runtimeFail(
                    'INVALID_STORAGE_VALUE',
                    `Storage.read() must resolve to a string or null, got ${describeContractValue(value)}.`,
                    { key, value }
                );
            }
            return value;
        },

        async write(key, value){
            assertStorageKey(key);
            assertStorageWriteValue(value);
            await callRuntimePortMethod(writeBinding, [key, value]);
        },

        async remove(key){
            assertStorageKey(key);
            await callRuntimePortMethod(removeBinding, [key]);
        },
    });
}
