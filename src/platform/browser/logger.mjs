import { createLogger } from '../../engine/runtime/logger.mjs';

function callConsole(consoleTarget, methodName, args){
    const method = Reflect.get(consoleTarget, methodName);
    return Reflect.apply(method, consoleTarget, args);
}

export function createBrowserLogger(options = {}){
    const providedConsole = options.consoleLike;
    const resolveConsole = () => providedConsole ?? globalThis.console;

    return createLogger({
        debug(...args){ return callConsole(resolveConsole(), 'debug', args); },
        info(...args){ return callConsole(resolveConsole(), 'info', args); },
        warn(...args){ return callConsole(resolveConsole(), 'warn', args); },
        error(...args){ return callConsole(resolveConsole(), 'error', args); },
    });
}
