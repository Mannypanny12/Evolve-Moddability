import { createRng } from '../../engine/runtime/rng.mjs';

export function createBrowserRng(options = {}){
    const random = options.random;

    return createRng({
        next(){
            return typeof random === 'function' ? random() : Math.random();
        },
    });
}
