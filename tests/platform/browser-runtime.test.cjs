'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const importModule = relative => import(pathToFileURL(path.join(root, relative)).href);

const clockPromise = importModule('src/platform/browser/clock.mjs');
const rngPromise = importModule('src/platform/browser/rng.mjs');
const storagePromise = importModule('src/platform/browser/storage.mjs');
const loggerPromise = importModule('src/platform/browser/logger.mjs');
const runtimePromise = importModule('src/platform/browser/runtime.mjs');

async function modules(){
    const [clock, rng, storage, logger, runtime] = await Promise.all([
        clockPromise,
        rngPromise,
        storagePromise,
        loggerPromise,
        runtimePromise,
    ]);
    return { ...clock, ...rng, ...storage, ...logger, ...runtime };
}

function fakeWebStorage(){
    const data = new Map();
    return {
        getItem(key){ return data.has(String(key)) ? data.get(String(key)) : null; },
        setItem(key, value){ data.set(String(key), String(value)); },
        removeItem(key){ data.delete(String(key)); },
    };
}

function fakeConsole(){
    const entries = [];
    const target = { entries };
    for (const level of ['debug', 'info', 'warn', 'error']){
        target[level] = function(message, details){
            assert.equal(this, target, 'browser logger must preserve the console receiver');
            entries.push({ level, message, details });
        };
    }
    return target;
}

test('M1C browser adapters use injected browser primitives through engine port contracts', async () => {
    const { createBrowserClock, createBrowserRng, createBrowserStorage, createBrowserLogger } = await modules();
    const webStorage = fakeWebStorage();
    const consoleLike = fakeConsole();

    const clock = createBrowserClock({ now: () => 12345 });
    const rng = createBrowserRng({ random: () => 0.375 });
    const storage = createBrowserStorage({ storage: webStorage });
    const logger = createBrowserLogger({ consoleLike });

    assert.equal(clock.now(), 12345);
    assert.equal(rng.next(), 0.375);
    assert.equal(await storage.read('missing'), null);
    await storage.write('save', 'payload');
    assert.equal(await storage.read('save'), 'payload');
    await storage.remove('save');
    assert.equal(await storage.read('save'), null);

    logger.error('example failure', { code: 'EXAMPLE' });
    assert.deepEqual(consoleLike.entries, [
        { level: 'error', message: 'example failure', details: { code: 'EXAMPLE' } },
    ]);
});

test('M1C browser storage adapter is lazy and does not require localStorage merely to be created', async () => {
    const { createBrowserStorage } = await modules();
    assert.doesNotThrow(() => createBrowserStorage());
});

test('M1C browser runtime composes all four adapters without introducing a runtime singleton', async () => {
    const { createBrowserRuntime } = await modules();
    const firstStorage = fakeWebStorage();
    const secondStorage = fakeWebStorage();
    const firstConsole = fakeConsole();
    const secondConsole = fakeConsole();

    const first = createBrowserRuntime({
        now: () => 10,
        random: () => 0.1,
        storage: firstStorage,
        consoleLike: firstConsole,
    });
    const second = createBrowserRuntime({
        now: () => 20,
        random: () => 0.9,
        storage: secondStorage,
        consoleLike: secondConsole,
    });

    assert.equal(first.clock.now(), 10);
    assert.equal(second.clock.now(), 20);
    assert.equal(first.rng.next(), 0.1);
    assert.equal(second.rng.next(), 0.9);

    await first.storage.write('key', 'first');
    await second.storage.write('key', 'second');
    assert.equal(await first.storage.read('key'), 'first');
    assert.equal(await second.storage.read('key'), 'second');

    first.logger.info('first');
    second.logger.info('second');
    assert.deepEqual(firstConsole.entries.map(entry => entry.message), ['first']);
    assert.deepEqual(secondConsole.entries.map(entry => entry.message), ['second']);
});
