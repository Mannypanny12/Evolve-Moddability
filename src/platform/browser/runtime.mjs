import { createRuntimeEnvironment } from '../../engine/runtime/environment.mjs';
import { createBrowserClock } from './clock.mjs';
import { createBrowserLogger } from './logger.mjs';
import { createBrowserRng } from './rng.mjs';
import { createBrowserStorage } from './storage.mjs';

export function createBrowserRuntime(options = {}){
    return createRuntimeEnvironment({
        clock: createBrowserClock({ now: options.now }),
        rng: createBrowserRng({ random: options.random }),
        storage: createBrowserStorage({ storage: options.storage }),
        logger: createBrowserLogger({ consoleLike: options.consoleLike }),
    });
}
