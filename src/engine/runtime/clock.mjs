import { describeContractValue } from '../identity.mjs';
import { bindRuntimePortMethod, callRuntimePortMethod, runtimeFail } from './common.mjs';

export function createClock(port){
    const nowBinding = bindRuntimePortMethod(port, 'Clock', 'now');

    return Object.freeze({
        now(){
            const value = callRuntimePortMethod(nowBinding);
            if (typeof value !== 'number' || !Number.isFinite(value)){
                runtimeFail(
                    'INVALID_CLOCK_VALUE',
                    `Clock.now() must return a finite number of epoch milliseconds, got ${describeContractValue(value)}.`,
                    { value }
                );
            }
            return value;
        },
    });
}
