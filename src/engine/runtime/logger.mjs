import { describeContractValue } from '../identity.mjs';
import { bindRuntimePortMethod, callRuntimePortMethod, runtimeFail } from './common.mjs';

const LEVELS = Object.freeze(['debug', 'info', 'warn', 'error']);

function assertLogMessage(message){
    if (typeof message !== 'string' || message.length === 0){
        runtimeFail(
            'INVALID_LOG_MESSAGE',
            `Logger message must be a non-empty string, got ${describeContractValue(message)}.`,
            { message }
        );
    }
    return message;
}

export function createLogger(port){
    const bindings = Object.fromEntries(
        LEVELS.map(level => [level, bindRuntimePortMethod(port, 'Logger', level)])
    );

    return Object.freeze(Object.fromEntries(
        LEVELS.map(level => [level, (message, details = undefined) => {
            assertLogMessage(message);
            callRuntimePortMethod(bindings[level], [message, details]);
        }])
    ));
}
