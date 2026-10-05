import { EngineContractError } from '../identity.mjs';
import {
    assertCommandId,
    assertSynchronousFunction,
    canonicalizeCommandPayload,
    isPromiseLike,
    readClosedCommandObject,
    readDenseCommandArray,
} from './common.mjs';
import { normalizeCommandOutcome } from './result.mjs';

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function readErrorField(error, field){
    try {
        return Reflect.get(error, field);
    }
    catch {
        return undefined;
    }
}

function readDiagnosticDetail(details, field){
    if (details === null || typeof details !== 'object') return undefined;
    let descriptor;
    try {
        descriptor = Object.getOwnPropertyDescriptor(details, field);
    }
    catch {
        return undefined;
    }
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
        ? descriptor.value
        : undefined;
}

function copyDiagnosticDetails(details, reserved){
    const output = {};
    if (details === null || typeof details !== 'object') return output;

    let keys;
    try {
        keys = Reflect.ownKeys(details);
    }
    catch {
        return { causeDetails: '<uninspectable>' };
    }

    for (const key of keys){
        if (typeof key !== 'string' || reserved.has(key)) continue;
        let descriptor;
        try {
            descriptor = Object.getOwnPropertyDescriptor(details, key);
        }
        catch {
            return { causeDetails: '<uninspectable>' };
        }
        if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
        Object.defineProperty(output, key, {
            value: descriptor.value,
            enumerable: true,
            writable: true,
            configurable: true,
        });
    }
    return output;
}

function enrichError(error, commandId, phase){
    if (error instanceof EngineContractError){
        const causeCode = readErrorField(error, 'code');
        const message = readErrorField(error, 'message') || 'Command contract failed.';
        const causeDetails = readErrorField(error, 'details');
        const details = copyDiagnosticDetails(
            causeDetails,
            new Set(['commandId', 'phase', 'causeCode', 'causePhase', 'causeCommandId'])
        );
        const causePhase = readDiagnosticDetail(causeDetails, 'phase');
        const causeCommandId = readDiagnosticDetail(causeDetails, 'commandId');
        if (causePhase !== undefined && causePhase !== phase) details.causePhase = causePhase;
        if (causeCommandId !== undefined && causeCommandId !== commandId) details.causeCommandId = causeCommandId;
        details.commandId = commandId;
        details.phase = phase;
        details.causeCode = causeCode || null;

        return new EngineContractError(
            causeCode || 'COMMAND_CONTRACT_FAILURE',
            `${String(message)} [${commandId || '<unresolved>'} @ ${phase}]`,
            details
        );
    }
    return new EngineContractError(
        phase === 'validate' ? 'COMMAND_PAYLOAD_VALIDATOR_FAILURE' : 'COMMAND_HANDLER_FAILURE',
        `Command ${phase} phase threw unexpectedly. [${commandId || '<unresolved>'}]`,
        { commandId, phase }
    );
}

function validateRegistration(rawRegistration, index){
    const path = `commandBus.registrations[${index}]`;
    const fields = readClosedCommandObject(rawRegistration, {
        path,
        allowed: ['id', 'validatePayload', 'execute'],
        code: 'INVALID_COMMAND_REGISTRATION',
    });
    return Object.freeze({
        id: assertCommandId(fields.get('id'), `${path}.id`),
        validatePayload: assertSynchronousFunction(
            fields.get('validatePayload'),
            `${path}.validatePayload`
        ),
        execute: assertSynchronousFunction(
            fields.get('execute'),
            `${path}.execute`
        ),
    });
}

export function createCommandBus(rawOptions){
    const options = readClosedCommandObject(rawOptions, {
        path: 'commandBusOptions',
        allowed: ['registrations'],
        code: 'INVALID_COMMAND_BUS_CONFIG',
    });
    const registrations = readDenseCommandArray(
        options.get('registrations'),
        'commandBusOptions.registrations',
        'INVALID_COMMAND_BUS_CONFIG'
    );

    const handlers = new Map();
    for (let index = 0; index < registrations.length; index++){
        const registration = validateRegistration(registrations[index], index);
        if (handlers.has(registration.id)){
            fail('DUPLICATE_COMMAND_ID', `Duplicate command registration ${JSON.stringify(registration.id)}.`, { commandId: registration.id });
        }
        handlers.set(registration.id, registration);
    }

    let dispatchActive = false;

    function ids(){
        return Object.freeze([...handlers.keys()].sort());
    }

    function has(id){
        return handlers.has(assertCommandId(id, 'commandBus.has.id'));
    }

    function dispatch(rawCommand){
        if (dispatchActive){
            fail('COMMAND_DISPATCH_REENTRANCY', 'Command dispatch may not be nested.', { phase: 'dispatch' });
        }

        dispatchActive = true;
        let commandId = null;
        let phase = 'envelope';
        try {
            const command = readClosedCommandObject(rawCommand, {
                path: 'command',
                allowed: ['id', 'payload'],
                code: 'INVALID_COMMAND',
            });
            commandId = assertCommandId(command.get('id'), 'command.id');

            phase = 'resolve';
            const registration = handlers.get(commandId);
            if (!registration){
                fail('UNKNOWN_COMMAND_ID', `Unknown command ID ${JSON.stringify(commandId)}.`, { commandId });
            }

            phase = 'payload';
            const detachedPayload = canonicalizeCommandPayload(command.get('payload'), 'command.payload');

            phase = 'validate';
            let validatedPayload;
            try {
                validatedPayload = Reflect.apply(registration.validatePayload, undefined, [detachedPayload]);
            }
            catch (error){
                throw enrichError(error, commandId, phase);
            }
            if (isPromiseLike(validatedPayload, 'command.validatePayload', 'INVALID_COMMAND_PAYLOAD')){
                fail('INVALID_COMMAND_PAYLOAD', 'Command payload validators must not return a Promise or thenable.', { commandId, phase });
            }
            const payload = canonicalizeCommandPayload(validatedPayload, 'command.validatedPayload');

            phase = 'execute';
            let rawOutcome;
            try {
                rawOutcome = Reflect.apply(registration.execute, undefined, [payload]);
            }
            catch (error){
                throw enrichError(error, commandId, phase);
            }
            if (isPromiseLike(rawOutcome, 'command.execute', 'INVALID_COMMAND_RESULT')){
                fail('INVALID_COMMAND_RESULT', 'Command handlers must not return a Promise or thenable.', { commandId, phase });
            }

            phase = 'result';
            return normalizeCommandOutcome(commandId, rawOutcome);
        }
        catch (error){
            if (error instanceof EngineContractError){
                const errorPhase = readDiagnosticDetail(readErrorField(error, 'details'), 'phase');
                if (errorPhase === phase) throw error;
                throw enrichError(error, commandId, phase);
            }
            throw enrichError(error, commandId, phase);
        }
        finally {
            dispatchActive = false;
        }
    }

    return Object.freeze({ dispatch, has, ids });
}
