import { createClock } from './clock.mjs';
import { createLogger } from './logger.mjs';
import { createRng } from './rng.mjs';
import { createStorage } from './storage.mjs';
import { readRuntimeEnvironmentField } from './common.mjs';

export function createRuntimeEnvironment(environment){
    return Object.freeze({
        clock: createClock(readRuntimeEnvironmentField(environment, 'clock')),
        rng: createRng(readRuntimeEnvironmentField(environment, 'rng')),
        storage: createStorage(readRuntimeEnvironmentField(environment, 'storage')),
        logger: createLogger(readRuntimeEnvironmentField(environment, 'logger')),
    });
}
