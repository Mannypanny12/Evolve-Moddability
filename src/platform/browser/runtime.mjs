import { createRuntimeEnvironment } from '../../engine/runtime/environment.mjs';
import { createBrowserClockPort } from './clock.mjs';
import { createBrowserLoggerPort } from './logger.mjs';
import { createBrowserRngPort } from './rng.mjs';
import { createBrowserStoragePort } from './storage.mjs';

export function createBrowserRuntime(options = {}){
    if (options === null || typeof options !== 'object' || Array.isArray(options)){
        throw new TypeError('Browser runtime options must be an object.');
    }

    return createRuntimeEnvironment({
        clock: createBrowserClockPort({ now: options.now }),
        rng: createBrowserRngPort({ random: options.random }),
        storage: createBrowserStoragePort({ storage: options.storage }),
        logger: createBrowserLoggerPort({ consoleLike: options.consoleLike }),
    });
}
