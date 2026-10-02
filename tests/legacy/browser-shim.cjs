'use strict';

class MemoryStorage {
    constructor(){
        this.clear();
    }

    get length(){
        return this._data.size;
    }

    clear(){
        this._data = new Map();
    }

    getItem(key){
        key = String(key);
        return this._data.has(key) ? this._data.get(key) : null;
    }

    key(index){
        return Array.from(this._data.keys())[index] ?? null;
    }

    removeItem(key){
        this._data.delete(String(key));
    }

    setItem(key, value){
        this._data.set(String(key), String(value));
    }
}

function makeClassList(){
    const values = new Set();
    return {
        add(...names){ names.forEach(name => values.add(name)); },
        remove(...names){ names.forEach(name => values.delete(name)); },
        contains(name){ return values.has(name); },
        toggle(name, force){
            if (force === true){ values.add(name); return true; }
            if (force === false){ values.delete(name); return false; }
            if (values.has(name)){ values.delete(name); return false; }
            values.add(name); return true;
        }
    };
}

function makeElement(){
    return {
        style: {},
        dataset: {},
        classList: makeClassList(),
        children: [],
        innerHTML: '',
        textContent: '',
        value: '',
        checked: false,
        disabled: false,
        appendChild(child){ this.children.push(child); return child; },
        removeChild(child){ this.children = this.children.filter(item => item !== child); return child; },
        remove(){},
        click(){},
        focus(){},
        select(){},
        setAttribute(){},
        removeAttribute(){},
        getAttribute(){ return null; },
        addEventListener(){},
        removeEventListener(){},
        querySelector(){ return null; },
        querySelectorAll(){ return []; },
        getBoundingClientRect(){ return { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }; }
    };
}

function makeJQueryChain(){
    let chain;
    const target = function(){ return chain; };
    chain = new Proxy(target, {
        get(_target, prop){
            if (prop === 'length'){ return 0; }
            if (prop === '0'){ return undefined; }
            if (prop === Symbol.iterator){ return function* emptyIterator(){}; }
            if (prop === 'outerHeight' || prop === 'outerWidth'){ return () => 0; }
            if (prop === 'width'){ return () => 1920; }
            if (prop === 'height'){ return () => 1080; }
            if (prop === 'val'){ return (...args) => args.length ? chain : ''; }
            if (prop === 'data'){ return () => undefined; }
            if (prop === 'attr'){ return (...args) => args.length > 1 ? chain : undefined; }
            if (prop === 'prop'){ return (...args) => args.length > 1 ? chain : undefined; }
            if (prop === 'hasClass' || prop === 'is'){ return () => false; }
            if (prop === 'each'){ return () => chain; }
            if (prop === 'get'){ return () => undefined; }
            if (prop === 'toArray'){ return () => []; }
            return () => chain;
        },
        apply(){
            return chain;
        }
    });
    return chain;
}

const OriginalDate = globalThis.Date;
const originalRandom = Math.random;
let frozenNow = Date.UTC(2026, 0, 1, 12, 0, 0);
let randomSequence = null;
let randomIndex = 0;

const runtime = {
    clock: {
        set(timestamp){
            frozenNow = Number(timestamp);
            globalThis.Date = class FrozenDate extends OriginalDate {
                constructor(...args){
                    super(...(args.length ? args : [frozenNow]));
                }
                static now(){
                    return frozenNow;
                }
            };
        },
        reset(){
            globalThis.Date = OriginalDate;
        },
        now(){
            return frozenNow;
        }
    },
    rng: {
        sequence(values){
            if (!Array.isArray(values) || values.length === 0){
                throw new Error('RNG sequence requires at least one value');
            }
            values.forEach(value => {
                if (!(value >= 0 && value < 1)){
                    throw new Error('RNG values must be in [0, 1)');
                }
            });
            randomSequence = values.slice();
            randomIndex = 0;
            Math.random = () => {
                const value = randomSequence[randomIndex % randomSequence.length];
                randomIndex++;
                return value;
            };
        },
        seed(seed){
            let state = Number(seed) >>> 0;
            Math.random = () => {
                state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
                return state / 0x100000000;
            };
            randomSequence = null;
            randomIndex = 0;
        },
        reset(){
            Math.random = originalRandom;
            randomSequence = null;
            randomIndex = 0;
        }
    }
};

runtime.clock.set(frozenNow);
runtime.rng.seed(1);

const storage = new MemoryStorage();
const documentStub = {
    body: makeElement(),
    documentElement: makeElement(),
    readyState: 'complete',
    cookie: '',
    createElement: makeElement,
    createTextNode(text){ return { textContent: String(text) }; },
    getElementById(){ return null; },
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    addEventListener(){},
    removeEventListener(){},
    execCommand(){ return true; }
};

Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: globalThis
});
Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: documentStub
});
Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: storage
});
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: { language: 'en-US', userAgent: 'evolve-characterization-tests' }
});

globalThis.location = { href: '', reload(){} };
globalThis.screen = { width: 1920, height: 1080 };
globalThis.Worker = undefined;
globalThis.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
globalThis.gtag = () => {};
globalThis.alert = () => {};
globalThis.confirm = () => true;
globalThis.prompt = () => null;

const $ = function(){ return makeJQueryChain(); };
$.ajaxSetup = () => {};
$.getJSON = (_path, callback) => {
    if (typeof callback === 'function'){
        callback({});
    }
    return makeJQueryChain();
};
$.each = (value, callback) => {
    if (Array.isArray(value)){
        value.forEach((entry, index) => callback(index, entry));
    }
    else if (value && typeof value === 'object'){
        Object.keys(value).forEach(key => callback(key, value[key]));
    }
};
$.extend = Object.assign;
$.isEmptyObject = value => !value || Object.keys(value).length === 0;

globalThis.$ = $;
globalThis.jQuery = $;

class VueStub {
    constructor(options = {}){
        this.$options = options;
        Object.assign(this, options.data || {});
    }
    static use(){}
    static component(){}
    static filter(){}
}
VueStub.config = {};
globalThis.Vue = VueStub;
globalThis.Buefy = {};
globalThis.Popper = class {
    destroy(){}
};

globalThis.LZString = {
    compressToUTF16(value){ return String(value); },
    decompressFromUTF16(value){ return String(value); },
    compressToBase64(value){ return Buffer.from(String(value), 'utf8').toString('base64'); },
    decompressFromBase64(value){ return Buffer.from(String(value), 'base64').toString('utf8'); }
};

globalThis.__EVOLVE_TEST_RUNTIME__ = runtime;

globalThis.CryptoJS = {
    SHA256(value){
        return { toString(){ return String(value); } };
    }
};

module.exports = {
    MemoryStorage,
    storage,
    resetStorage(){
        storage.clear();
    },
    runtime
};
