function assertFiniteNumber(value, label){
    if (typeof value !== 'number' || !Number.isFinite(value)){
        throw new TypeError(`${label} must be a finite number.`);
    }
    return value;
}

function compareKeys(a, b){
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

export function createTestClock(initialNow = 0){
    let current = assertFiniteNumber(initialNow, 'initialNow');
    const clock = Object.freeze({
        now(){ return current; },
    });

    return Object.freeze({
        clock,
        set(value){ current = assertFiniteNumber(value, 'clock value'); },
        advance(delta){ current += assertFiniteNumber(delta, 'clock delta'); },
    });
}

export function createSequenceRng(values){
    if (!Array.isArray(values) || values.length === 0){
        throw new TypeError('Deterministic RNG sequence requires at least one value.');
    }
    const sequence = values.slice();
    for (const value of sequence){
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1){
            throw new RangeError('Deterministic RNG values must be finite numbers in [0, 1).');
        }
    }

    let index = 0;
    const rng = Object.freeze({
        next(){
            if (index >= sequence.length){
                throw new Error(`Deterministic RNG sequence exhausted after ${sequence.length} value(s).`);
            }
            return sequence[index++];
        },
    });

    return Object.freeze({
        rng,
        consumed(){ return index; },
        remaining(){ return sequence.length - index; },
    });
}

export function createMemoryStorage(initial = {}){
    if (initial === null || typeof initial !== 'object' || Array.isArray(initial)){
        throw new TypeError('Memory storage initial data must be an object.');
    }

    const data = new Map();
    for (const [key, value] of Object.entries(initial)){
        if (typeof value !== 'string'){
            throw new TypeError(`Memory storage value for ${key} must be a string.`);
        }
        data.set(key, value);
    }

    const storage = Object.freeze({
        read(key){ return data.has(key) ? data.get(key) : null; },
        write(key, value){ data.set(key, value); },
        remove(key){ data.delete(key); },
    });

    return Object.freeze({
        storage,
        snapshot(){
            return Object.freeze(Object.fromEntries([...data.entries()].sort(([a], [b]) => compareKeys(a, b))));
        },
    });
}

export function createCaptureLogger(){
    const captured = [];
    const sink = level => (message, details) => {
        captured.push(Object.freeze({ level, message, details }));
    };
    const logger = Object.freeze({
        debug: sink('debug'),
        info: sink('info'),
        warn: sink('warn'),
        error: sink('error'),
    });

    return Object.freeze({
        logger,
        entries(){ return Object.freeze(captured.slice()); },
    });
}
