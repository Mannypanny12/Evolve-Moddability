import { describeContractValue } from '../identity.mjs';
import { bindRuntimePortMethod, callRuntimePortMethod, runtimeFail } from './common.mjs';

export function createRng(port){
    const nextBinding = bindRuntimePortMethod(port, 'Rng', 'next');

    return Object.freeze({
        next(){
            const value = callRuntimePortMethod(nextBinding);
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1){
                runtimeFail(
                    'INVALID_RNG_VALUE',
                    `Rng.next() must return a finite number in [0, 1), got ${describeContractValue(value)}.`,
                    { value }
                );
            }
            return value;
        },
    });
}
