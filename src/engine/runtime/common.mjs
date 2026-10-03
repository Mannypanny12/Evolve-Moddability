import { EngineContractError, describeContractValue } from '../identity.mjs';

export function runtimeFail(code, message, details = undefined){
    throw new EngineContractError(code, message, details);
}

export function assertRuntimePortObject(port, portName){
    if (port === null || (typeof port !== 'object' && typeof port !== 'function')){
        runtimeFail(
            'INVALID_RUNTIME_PORT',
            `${portName} port must be an object, got ${describeContractValue(port)}.`,
            { portName, port }
        );
    }
    return port;
}

export function bindRuntimePortMethod(port, portName, methodName){
    assertRuntimePortObject(port, portName);

    let method;
    try {
        method = Reflect.get(port, methodName);
    }
    catch {
        runtimeFail(
            'INVALID_RUNTIME_PORT_METHOD',
            `${portName}.${methodName} could not be inspected.`,
            { portName, methodName }
        );
    }

    if (typeof method !== 'function'){
        runtimeFail(
            'INVALID_RUNTIME_PORT_METHOD',
            `${portName}.${methodName} must be a function, got ${describeContractValue(method)}.`,
            { portName, methodName, value: method }
        );
    }

    return Object.freeze({ port, method });
}

export function callRuntimePortMethod(binding, args = []){
    return Reflect.apply(binding.method, binding.port, args);
}

export function readRuntimeEnvironmentField(environment, fieldName){
    if (environment === null || (typeof environment !== 'object' && typeof environment !== 'function')){
        runtimeFail(
            'INVALID_RUNTIME_ENVIRONMENT',
            `Runtime environment options must be an object, got ${describeContractValue(environment)}.`,
            { environment }
        );
    }

    try {
        return Reflect.get(environment, fieldName);
    }
    catch {
        runtimeFail(
            'INVALID_RUNTIME_ENVIRONMENT',
            `Runtime environment field ${fieldName} could not be inspected.`,
            { fieldName }
        );
    }
}
