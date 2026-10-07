'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
let observerDepId = 5000;

function accessorRecord(values){
    const record = {};
    for (const [field, initial] of Object.entries(values)){
        let value = initial;
        Object.defineProperty(record, field, {
            enumerable: true,
            configurable: true,
            get(){ return value; },
            set(next){ value = next; },
        });
    }
    return record;
}

function observedRecord(values){
    const record = accessorRecord(values);
    const observer = {
        value: record,
        dep: { id: observerDepId++ },
        vmCount: 0,
    };
    Object.defineProperty(record, '__ob__', {
        value: observer,
        writable: true,
        configurable: true,
        enumerable: false,
    });
    return record;
}

async function loadHelper(){
    return import(pathToFileURL(path.join(
        root,
        'src/legacy/bridge/reviewed-reactive-resource-field.mjs'
    )).href);
}

test('M3F4 reviewed reactive helper accepts only the reviewed Vue resource fields', async () => {
    const { readReviewedReactiveResourceField } = await loadHelper();
    const record = observedRecord({ amount: 2, max: 100, display: true, bonus: 7 });

    assert.deepEqual(readReviewedReactiveResourceField(record, 'amount'), {
        value: 2,
        writable: true,
    });
    assert.deepEqual(readReviewedReactiveResourceField(record, 'max'), {
        value: 100,
        writable: true,
    });
    assert.deepEqual(readReviewedReactiveResourceField(record, 'display'), {
        value: true,
        writable: true,
    });
    assert.equal(readReviewedReactiveResourceField(record, 'bonus'), null);
});

test('M3F4 reviewed reactive helper rejects a forged or weakened observer marker', async () => {
    const { readReviewedReactiveResourceField } = await loadHelper();
    const record = observedRecord({ amount: 2 });
    const observer = record.__ob__;

    Object.defineProperty(record, '__ob__', {
        value: observer,
        writable: false,
        configurable: true,
        enumerable: false,
    });
    assert.equal(readReviewedReactiveResourceField(record, 'amount'), null);
});

test('M3F4 reviewed reactive helper rejects observer internals that do not match Vue data descriptors', async () => {
    const { readReviewedReactiveResourceField } = await loadHelper();
    const record = observedRecord({ amount: 2 });
    const observer = record.__ob__;
    const dep = observer.dep;

    Object.defineProperty(dep, 'id', {
        value: dep.id,
        writable: false,
        configurable: true,
        enumerable: true,
    });
    assert.equal(readReviewedReactiveResourceField(record, 'amount'), null);
});
