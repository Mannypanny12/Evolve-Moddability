import { EngineContractError, describeContractValue } from '../identity.mjs';
import { canonicalizeStateValue } from './common.mjs';

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function assertPlainOptions(value, path){
    if (value === null || typeof value !== 'object' || Array.isArray(value)){
        fail('INVALID_STATE_STORE_CONFIG', `${path} must be a plain options object.`, { path, value });
    }

    let prototype;
    try {
        prototype = Object.getPrototypeOf(value);
    }
    catch {
        fail('INVALID_STATE_STORE_CONFIG', `${path} could not be safely inspected.`, { path });
    }

    if (prototype !== Object.prototype && prototype !== null){
        fail('INVALID_STATE_STORE_CONFIG', `${path} must be a plain options object.`, { path, value });
    }
    return value;
}

function readOption(options, field, path){
    let descriptor;
    try {
        descriptor = Object.getOwnPropertyDescriptor(options, field);
    }
    catch {
        fail('INVALID_STATE_STORE_CONFIG', `${path}.${field} could not be safely inspected.`, { path: `${path}.${field}` });
    }

    if (!descriptor) return undefined;
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
        fail('INVALID_STATE_STORE_CONFIG', `${path}.${field} must be a data field.`, { path: `${path}.${field}` });
    }
    return descriptor.value;
}

function assertCallable(value, path, code = 'INVALID_STATE_STORE_CONFIG'){
    if (typeof value !== 'function'){
        fail(code, `${path} must be a function, got ${describeContractValue(value)}.`, { path, value });
    }
    return value;
}

function assertNonEmptyString(value, path, code){
    if (typeof value !== 'string' || value.trim().length === 0){
        fail(code, `${path} must be a non-empty string, got ${describeContractValue(value)}.`, { path, value });
    }
    return value;
}

function readStringArray(value, path, code){
    if (!Array.isArray(value)){
        fail(code, `${path} must be an array of unique non-empty strings.`, { path, value });
    }

    const seen = new Set();
    const result = [];
    for (let index = 0; index < value.length; index++){
        const item = assertNonEmptyString(value[index], `${path}[${index}]`, code);
        if (seen.has(item)){
            fail(code, `${path} contains duplicate field ${JSON.stringify(item)}.`, { path, field: item });
        }
        seen.add(item);
        result.push(item);
    }
    return Object.freeze(result.sort());
}

function assertStateRoot(value, path){
    const canonical = canonicalizeStateValue(value, path);
    if (canonical === null || typeof canonical !== 'object' || Array.isArray(canonical)){
        fail('INVALID_STATE_STORE_STATE', `${path} must canonicalize to a plain state object.`, { path });
    }
    return canonical;
}

function deepFreezeState(value){
    if (value === null || typeof value !== 'object') return value;
    for (const key of Object.keys(value)){
        deepFreezeState(value[key]);
    }
    return Object.freeze(value);
}

function canonicalCommittedState(validateState, value, path){
    const validated = validateState(value);
    return deepFreezeState(assertStateRoot(validated, path));
}

function escapePointerSegment(value){
    return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

function childPointer(path, key){
    return `${path}/${escapePointerSegment(key)}`;
}

function isStateObject(value){
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stateValuesEqual(left, right){
    if (Object.is(left, right)) return true;
    if (typeof left !== typeof right || left === null || right === null) return false;

    if (Array.isArray(left) || Array.isArray(right)){
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
        for (let index = 0; index < left.length; index++){
            if (!stateValuesEqual(left[index], right[index])) return false;
        }
        return true;
    }

    if (!isStateObject(left) || !isStateObject(right)) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    for (let index = 0; index < leftKeys.length; index++){
        if (leftKeys[index] !== rightKeys[index]) return false;
        if (!stateValuesEqual(left[leftKeys[index]], right[rightKeys[index]])) return false;
    }
    return true;
}

function changedTopLevelFields(previous, next){
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    const changed = [];
    for (const key of [...keys].sort()){
        const previousHas = Object.prototype.hasOwnProperty.call(previous, key);
        const nextHas = Object.prototype.hasOwnProperty.call(next, key);
        if (previousHas !== nextHas || !stateValuesEqual(previous[key], next[key])){
            changed.push(key);
        }
    }
    return changed;
}

function collectChanges(previous, next, path = ''){
    if (stateValuesEqual(previous, next)) return [];

    if (Array.isArray(previous) && Array.isArray(next)){
        const changes = [];
        const sharedLength = Math.min(previous.length, next.length);
        for (let index = 0; index < sharedLength; index++){
            changes.push(...collectChanges(previous[index], next[index], childPointer(path, index)));
        }
        for (let index = sharedLength; index < previous.length; index++){
            changes.push(Object.freeze({ path: childPointer(path, index), kind: 'remove' }));
        }
        for (let index = sharedLength; index < next.length; index++){
            changes.push(Object.freeze({ path: childPointer(path, index), kind: 'add' }));
        }
        return changes;
    }

    if (isStateObject(previous) && isStateObject(next)){
        const changes = [];
        const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
        for (const key of [...keys].sort()){
            const previousHas = Object.prototype.hasOwnProperty.call(previous, key);
            const nextHas = Object.prototype.hasOwnProperty.call(next, key);
            const pointer = childPointer(path, key);
            if (!previousHas){
                changes.push(Object.freeze({ path: pointer, kind: 'add' }));
            }
            else if (!nextHas){
                changes.push(Object.freeze({ path: pointer, kind: 'remove' }));
            }
            else {
                changes.push(...collectChanges(previous[key], next[key], pointer));
            }
        }
        return changes;
    }

    return [Object.freeze({ path: path || '/', kind: 'replace' })];
}

function freezeDiagnostic(record){
    return Object.freeze({
        ...record,
        changes: Object.freeze(record.changes),
    });
}

function isDeclaredAsyncFunction(value){
    try {
        return /^\s*async\b/.test(Function.prototype.toString.call(value));
    }
    catch {
        return false;
    }
}

function isPromiseLike(value, code, path){
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
    try {
        return typeof value.then === 'function';
    }
    catch {
        fail(code, `${path} returned a value whose thenable state could not be safely inspected.`, { path });
    }
}

export function createStateStore(rawOptions){
    const options = assertPlainOptions(rawOptions, 'stateStoreOptions');
    const initialState = readOption(options, 'initialState', 'stateStoreOptions');
    const validateState = assertCallable(
        readOption(options, 'validateState', 'stateStoreOptions'),
        'stateStoreOptions.validateState'
    );
    const writableFields = readStringArray(
        readOption(options, 'writableFields', 'stateStoreOptions') ?? [],
        'stateStoreOptions.writableFields',
        'INVALID_STATE_STORE_CONFIG'
    );
    const writableFieldSet = new Set(writableFields);

    let committedState = canonicalCommittedState(validateState, initialState, 'stateStore.state');
    let revision = 0;
    let lastChange = null;
    let transactionActive = false;
    let selectionDepth = 0;
    const scopeIds = new Set();

    function read(){
        return committedState;
    }

    function select(selector, ...args){
        assertCallable(selector, 'selector', 'INVALID_STATE_SELECTOR');
        if (isDeclaredAsyncFunction(selector)){
            fail('INVALID_STATE_SELECTOR', 'State selectors must be synchronous.', { operation: 'select' });
        }
        if (transactionActive){
            fail(
                'STATE_ACCESS_REENTRANCY',
                'Selectors may not run while a state transaction is active.',
                { operation: 'select' }
            );
        }

        selectionDepth++;
        try {
            const result = selector(committedState, ...args);
            if (isPromiseLike(result, 'INVALID_STATE_SELECTOR', 'selector')){
                fail('INVALID_STATE_SELECTOR', 'State selectors must not return a Promise or thenable.', { operation: 'select' });
            }
            return result;
        }
        finally {
            selectionDepth--;
        }
    }

    function snapshot(){
        return deepFreezeState(canonicalizeStateValue(committedState, 'stateStore.snapshot'));
    }

    function getRevision(){
        return revision;
    }

    function getLastChange(){
        return lastChange;
    }

    function createMutationScope(rawScopeOptions){
        if (transactionActive || selectionDepth > 0){
            fail(
                'STATE_ACCESS_REENTRANCY',
                'Mutation scopes may not be created while a selector or state transaction is active.',
                { operation: 'createMutationScope' }
            );
        }

        const scopeOptions = assertPlainOptions(rawScopeOptions, 'mutationScopeOptions');
        const id = assertNonEmptyString(
            readOption(scopeOptions, 'id', 'mutationScopeOptions'),
            'mutationScopeOptions.id',
            'INVALID_STATE_MUTATION_SCOPE'
        );
        const fields = readStringArray(
            readOption(scopeOptions, 'fields', 'mutationScopeOptions'),
            'mutationScopeOptions.fields',
            'INVALID_STATE_MUTATION_SCOPE'
        );

        if (fields.length === 0){
            fail('INVALID_STATE_MUTATION_SCOPE', `Mutation scope ${JSON.stringify(id)} must own at least one field.`, { id });
        }
        if (scopeIds.has(id)){
            fail('INVALID_STATE_MUTATION_SCOPE', `Mutation scope ${JSON.stringify(id)} already exists.`, { id });
        }
        for (const field of fields){
            if (!writableFieldSet.has(field)){
                fail(
                    'STATE_MUTATION_FORBIDDEN',
                    `Mutation scope ${JSON.stringify(id)} may not write top-level field ${JSON.stringify(field)}.`,
                    { id, field }
                );
            }
        }
        scopeIds.add(id);
        const fieldSet = new Set(fields);

        function transaction(labelValue, mutatorValue){
            const label = assertNonEmptyString(
                labelValue,
                'transaction.label',
                'INVALID_STATE_TRANSACTION'
            );
            const mutator = assertCallable(
                mutatorValue,
                'transaction.mutator',
                'INVALID_STATE_TRANSACTION'
            );
            if (isDeclaredAsyncFunction(mutator)){
                fail(
                    'INVALID_STATE_TRANSACTION',
                    'State transaction mutators must be synchronous.',
                    { scopeId: id, label }
                );
            }

            if (transactionActive || selectionDepth > 0){
                fail(
                    'STATE_ACCESS_REENTRANCY',
                    'State transactions may not be nested or started from a selector.',
                    { operation: 'transaction', scopeId: id, label }
                );
            }

            transactionActive = true;
            try {
                const candidate = canonicalizeStateValue(committedState, 'stateStore.transaction');
                const scopeDraft = Object.create(null);
                const initiallyPresent = new Set();

                for (const field of fields){
                    if (Object.prototype.hasOwnProperty.call(candidate, field)){
                        initiallyPresent.add(field);
                    }
                    Object.defineProperty(scopeDraft, field, {
                        value: candidate[field],
                        enumerable: true,
                        writable: true,
                        configurable: false,
                    });
                }
                Object.seal(scopeDraft);

                const mutatorResult = mutator(scopeDraft);
                if (mutatorResult !== undefined){
                    fail(
                        'INVALID_STATE_TRANSACTION',
                        'State transaction mutators must return undefined and must not return a Promise or thenable.',
                        { scopeId: id, label }
                    );
                }

                for (const field of fields){
                    const value = scopeDraft[field];
                    if (!initiallyPresent.has(field) && value === undefined) continue;
                    Object.defineProperty(candidate, field, {
                        value,
                        enumerable: true,
                        writable: true,
                        configurable: true,
                    });
                }

                const nextState = canonicalCommittedState(validateState, candidate, 'stateStore.state');
                const changedFields = changedTopLevelFields(committedState, nextState);
                for (const field of changedFields){
                    if (!fieldSet.has(field)){
                        fail(
                            'STATE_TRANSACTION_SCOPE_VIOLATION',
                            `Transaction ${JSON.stringify(label)} in scope ${JSON.stringify(id)} changed unowned top-level field ${JSON.stringify(field)}.`,
                            { scopeId: id, label, field }
                        );
                    }
                }

                const changes = collectChanges(committedState, nextState);
                if (changes.length === 0){
                    return freezeDiagnostic({
                        committed: false,
                        revisionBefore: revision,
                        revisionAfter: revision,
                        scopeId: id,
                        label,
                        changes,
                    });
                }

                if (revision >= Number.MAX_SAFE_INTEGER){
                    fail('STATE_REVISION_OVERFLOW', 'State revision can no longer be incremented safely.', { revision });
                }

                const revisionBefore = revision;
                const revisionAfter = revision + 1;
                const diagnostic = freezeDiagnostic({
                    committed: true,
                    revisionBefore,
                    revisionAfter,
                    scopeId: id,
                    label,
                    changes,
                });

                committedState = nextState;
                revision = revisionAfter;
                lastChange = diagnostic;
                return diagnostic;
            }
            finally {
                transactionActive = false;
            }
        }

        return Object.freeze({
            id,
            fields,
            transaction,
        });
    }

    const store = Object.freeze({
        read,
        select,
        snapshot,
        getRevision,
        getLastChange,
    });
    const mutationAuthority = Object.freeze({
        createMutationScope,
    });

    return Object.freeze({
        store,
        mutationAuthority,
    });
}
