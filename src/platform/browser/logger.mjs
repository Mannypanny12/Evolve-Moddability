import { createLogger } from '../../engine/runtime/logger.mjs';

const CONSOLE_METHODS = Object.freeze(['debug', 'info', 'warn', 'error']);

function assertOptionsObject(options, label){
    if (options === null || typeof options !== 'object' || Array.isArray(options)){
        throw new TypeError(`${label} options must be an object.`);
    }
}

function assertConsoleLike(consoleTarget){
    if (consoleTarget === null || (typeof consoleTarget !== 'object' && typeof consoleTarget !== 'function')){
        throw new TypeError('Browser console override must be console-compatible when provided.');
    }
    for (const methodName of CONSOLE_METHODS){
        if (typeof Reflect.get(consoleTarget, methodName) !== 'function'){
            throw new TypeError(`Browser console override must provide ${methodName}().`);
        }
    }
    return consoleTarget;
}

function callConsole(consoleTarget, methodName, args){
    const method = Reflect.get(consoleTarget, methodName);
    return Reflect.apply(method, consoleTarget, args);
}

export function createBrowserLoggerPort(options = {}){
    assertOptionsObject(options, 'Browser logger');
    const providedConsole = options.consoleLike;
    if (providedConsole !== undefined){
        assertConsoleLike(providedConsole);
    }

    const resolveConsole = () => providedConsole === undefined ? globalThis.console : providedConsole;
    return Object.freeze({
        debug(...args){ return callConsole(resolveConsole(), 'debug', args); },
        info(...args){ return callConsole(resolveConsole(), 'info', args); },
        warn(...args){ return callConsole(resolveConsole(), 'warn', args); },
        error(...args){ return callConsole(resolveConsole(), 'error', args); },
    });
}

export function createBrowserLogger(options = {}){
    return createLogger(createBrowserLoggerPort(options));
}
