import { createClock } from '../../engine/runtime/clock.mjs';

export function createBrowserClock(options = {}){
    const now = options.now;

    return createClock({
        now(){
            return typeof now === 'function' ? now() : Date.now();
        },
    });
}
