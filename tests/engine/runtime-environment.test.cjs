'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const importModule = relative => import(pathToFileURL(path.join(root, relative)).href);

const identityPromise = importModule('src/engine/identity.mjs');
const clockPromise = importModule('src/engine/runtime/clock.mjs');
const rngPromise = importModule('src/engine/runtime/rng.mjs');
const storagePromise = importModule('src/engine/runtime/storage.mjs');
const loggerPromise = importModule('src/engine/runtime/logger.mjs');
const environmentPromise = importModule('src/engine/runtime/environment.mjs');
const adaptersPromise = importModule('tests/support/runtime-adapters.mjs');

async function modules(){
    const [identity, clock, rng, storage, logger, environment, adapters] = await Promise.all([
        identityPromise,
        clockPromise,
        rngPromise,
        storagePromise,
        loggerPromise,
        environmentPromise,
        adaptersPromise,
    ]);
    return { ...identity, ...clock, ...rng, ...storage, ...logger, ...environment, ...adapters };
}

async function expectCode(fn, code){
    const { EngineContractError } = await modules();
    assert.throws(fn, error => error instanceof EngineContractError && error.code === code);
}

async function expectRejectedCode(promise, code){
    const { EngineContractError } = await modules();
    await assert.rejects(promise, error => error instanceof EngineContractError && error.code === code);
}

test('M1C runtime environment composes deterministic clock, RNG, storage, and logger ports', async () => {
    const {
        createRuntimeEnvironment,
        createTestClock,
        createSequenceRng,
        createMemoryStorage,
        createCaptureLogger,
    } = await modules();

    const testClock = createTestClock(1000);
    const testRng = createSequenceRng([0, 0.25, 0.999]);
    const memory = createMemoryStorage({ existing: 'value' });
    const capture = createCaptureLogger();
    const environment = createRuntimeEnvironment({
        clock: testClock.clock,
        rng: testRng.rng,
        storage: memory.storage,
        logger: capture.logger,
    });

    assert.equal(environment.clock.now(), 1000);
    testClock.advance(250);
    assert.equal(environment.clock.now(), 1250);

    assert.equal(environment.rng.next(), 0);
    assert.equal(environment.rng.next(), 0.25);
    assert.equal(testRng.consumed(), 2);
    assert.equal(testRng.remaining(), 1);

    assert.equal(await environment.storage.read('missing'), null);
    assert.equal(await environment.storage.read('existing'), 'value');
    await environment.storage.write('new', 'stored');
    await environment.storage.remove('existing');
    assert.deepEqual(memory.snapshot(), { new: 'stored' });

    const details = { subsystem: 'runtime-test' };
    environment.logger.info('runtime ready', details);
    assert.deepEqual(capture.entries(), [
        { level: 'info', message: 'runtime ready', details },
    ]);

    assert.equal(Object.isFrozen(environment), true);
    assert.equal(Object.isFrozen(environment.clock), true);
    assert.equal(Object.isFrozen(environment.rng), true);
    assert.equal(Object.isFrozen(environment.storage), true);
    assert.equal(Object.isFrozen(environment.logger), true);
});

test('M1C port facades preserve adapter method receivers without exposing mutable facade shape', async () => {
    const { createClock } = await modules();

    class SourceClock {
        constructor(value){ this.value = value; }
        now(){ return this.value; }
    }

    const source = new SourceClock(42);
    const clock = createClock(source);
    assert.equal(clock.now(), 42);
    source.value = 84;
    assert.equal(clock.now(), 84);
    assert.throws(() => { clock.extra = true; }, TypeError);
});

test('M1C rejects missing, malformed, and uninspectable runtime ports with structured errors', async () => {
    const { createClock, createRuntimeEnvironment } = await modules();

    await expectCode(() => createClock(null), 'INVALID_RUNTIME_PORT');
    await expectCode(() => createClock({}), 'INVALID_RUNTIME_PORT_METHOD');
    await expectCode(
        () => createClock(new Proxy({}, { get(){ throw new Error('hostile getter'); } })),
        'INVALID_RUNTIME_PORT_METHOD'
    );
    await expectCode(
        () => createRuntimeEnvironment(new Proxy({}, { get(){ throw new Error('hostile environment'); } })),
        'INVALID_RUNTIME_ENVIRONMENT'
    );
});

test('M1C validates clock output at the engine boundary', async () => {
    const { createClock } = await modules();

    for (const value of [NaN, Infinity, -Infinity, '1000', undefined]){
        await expectCode(() => createClock({ now(){ return value; } }).now(), 'INVALID_CLOCK_VALUE');
    }
    assert.equal(createClock({ now(){ return 0; } }).now(), 0);
});

test('M1C validates RNG output as a finite number in the half-open unit interval', async () => {
    const { createRng } = await modules();

    assert.equal(createRng({ next(){ return 0; } }).next(), 0);
    assert.equal(createRng({ next(){ return 0.999999; } }).next(), 0.999999);

    for (const value of [-0.001, 1, NaN, Infinity, '0.5']){
        await expectCode(() => createRng({ next(){ return value; } }).next(), 'INVALID_RNG_VALUE');
    }
});

test('M1C deterministic sequence RNG fails closed when code consumes unexpected randomness', async () => {
    const { createSequenceRng } = await modules();
    const sequence = createSequenceRng([0.1, 0.2]);

    assert.equal(sequence.rng.next(), 0.1);
    assert.equal(sequence.rng.next(), 0.2);
    assert.throws(
        () => sequence.rng.next(),
        /Deterministic RNG sequence exhausted after 2 value\(s\)\./
    );
});

test('M1C storage is async, string-only, isolated, and preserves adapter failures', async () => {
    const { createStorage, createMemoryStorage } = await modules();
    const memoryA = createMemoryStorage();
    const memoryB = createMemoryStorage();
    const storageA = createStorage(memoryA.storage);
    const storageB = createStorage(memoryB.storage);

    await storageA.write('key', 'A');
    await storageB.write('key', 'B');
    assert.equal(await storageA.read('key'), 'A');
    assert.equal(await storageB.read('key'), 'B');

    await expectRejectedCode(storageA.read(''), 'INVALID_STORAGE_KEY');
    await expectRejectedCode(storageA.write('key', 123), 'INVALID_STORAGE_VALUE');

    const badRead = createStorage({
        read(){ return 123; },
        write(){},
        remove(){},
    });
    await expectRejectedCode(badRead.read('key'), 'INVALID_STORAGE_VALUE');

    const sentinel = new Error('storage unavailable');
    const failing = createStorage({
        read(){ throw sentinel; },
        write(){ throw sentinel; },
        remove(){ throw sentinel; },
    });
    await assert.rejects(failing.read('key'), error => error === sentinel);
    await assert.rejects(failing.write('key', 'value'), error => error === sentinel);
    await assert.rejects(failing.remove('key'), error => error === sentinel);
});

test('M1C logger validates messages, preserves details, and does not invent timestamps', async () => {
    const { createLogger, createCaptureLogger } = await modules();
    const capture = createCaptureLogger();
    const logger = createLogger(capture.logger);
    const details = { count: 3 };

    logger.debug('debug message', details);
    logger.warn('warning');

    assert.deepEqual(capture.entries(), [
        { level: 'debug', message: 'debug message', details },
        { level: 'warn', message: 'warning', details: undefined },
    ]);
    assert.equal('timestamp' in capture.entries()[0], false);
    await expectCode(() => logger.error(''), 'INVALID_LOG_MESSAGE');
});

test('M1C deterministic adapter snapshots use locale-independent key ordering', async () => {
    const { createMemoryStorage } = await modules();
    const memory = createMemoryStorage({ z: 'last', A: 'upper', a: 'lower' });
    assert.deepEqual(Object.keys(memory.snapshot()), ['A', 'a', 'z']);
});

test('M1C runtime environments have no shared singleton state', async () => {
    const {
        createRuntimeEnvironment,
        createTestClock,
        createSequenceRng,
        createMemoryStorage,
        createCaptureLogger,
    } = await modules();

    function makeEnvironment(now, randomValue){
        return createRuntimeEnvironment({
            clock: createTestClock(now).clock,
            rng: createSequenceRng([randomValue]).rng,
            storage: createMemoryStorage().storage,
            logger: createCaptureLogger().logger,
        });
    }

    const first = makeEnvironment(10, 0.1);
    const second = makeEnvironment(20, 0.9);
    assert.equal(first.clock.now(), 10);
    assert.equal(second.clock.now(), 20);
    assert.equal(first.rng.next(), 0.1);
    assert.equal(second.rng.next(), 0.9);
});
