import { EngineContractError } from '../../engine/identity.mjs';
import {
    assertSynchronousConditionFunction,
    isConditionPromiseLike,
    readClosedConditionObject,
} from '../../engine/conditions/common.mjs';
import { createEvolveLegacyMappingCatalog } from './evolve-mappings.mjs';

const MISSING = Symbol('missing-legacy-condition-state');
const SUPPORTED_TECHNOLOGY_MAPPING = 'evolve.technology.primitive_progression';

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function safeIsArray(value, path){
    try {
        return Array.isArray(value);
    }
    catch {
        fail('INVALID_LEGACY_CONDITION_STATE', `${path} could not be inspected.`, { path });
    }
}

function safePrototype(value, path){
    try {
        return Object.getPrototypeOf(value);
    }
    catch {
        fail('INVALID_LEGACY_CONDITION_STATE', `${path} could not be inspected.`, { path });
    }
}

function assertPlainRecord(value, path){
    if (value === null || typeof value !== 'object' || safeIsArray(value, path)){
        fail('INVALID_LEGACY_CONDITION_STATE', `${path} must be a plain object.`, { path });
    }
    const prototype = safePrototype(value, path);
    if (prototype !== Object.prototype && prototype !== null){
        fail('INVALID_LEGACY_CONDITION_STATE', `${path} must be a plain object.`, { path });
    }
    return value;
}

function readDataField(record, field, path, { required = false } = {}){
    let descriptor;
    try {
        descriptor = Object.getOwnPropertyDescriptor(record, field);
    }
    catch {
        fail('INVALID_LEGACY_CONDITION_STATE', `${path}.${field} could not be inspected.`, {
            path: `${path}.${field}`,
        });
    }
    if (!descriptor){
        if (required){
            fail('INVALID_LEGACY_CONDITION_STATE', `${path}.${field} is required.`, {
                path: `${path}.${field}`,
            });
        }
        return MISSING;
    }
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')){
        fail('INVALID_LEGACY_CONDITION_STATE', `${path}.${field} must be a data field.`, {
            path: `${path}.${field}`,
        });
    }
    return descriptor.value;
}

function pathSegments(legacyPath){
    return legacyPath.split('.').slice(1);
}

function readLegacyPath(root, legacyPath){
    let current = assertPlainRecord(root, 'legacyConditionRoot');
    const segments = pathSegments(legacyPath);
    let display = 'legacyConditionRoot';

    for (let index = 0; index < segments.length; index++){
        const segment = segments[index];
        const value = readDataField(current, segment, display);
        if (value === MISSING) return MISSING;
        if (index === segments.length - 1) return value;
        display += `.${segment}`;
        current = assertPlainRecord(value, display);
    }
    return current;
}

function assertFiniteNumber(value, path){
    if (typeof value !== 'number' || !Number.isFinite(value)){
        fail('INVALID_LEGACY_CONDITION_STATE', `${path} must be a finite number.`, {
            path,
            valueType: typeof value,
        });
    }
    return Object.is(value, -0) ? 0 : value;
}

function assertNonNegativeFinite(value, path){
    const number = assertFiniteNumber(value, path);
    if (number < 0){
        fail('INVALID_LEGACY_CONDITION_STATE', `${path} must be non-negative.`, { path, value: number });
    }
    return number;
}

function assertCount(value, path){
    if (!Number.isSafeInteger(value) || value < 0){
        fail('INVALID_LEGACY_CONDITION_STATE', `${path} must be a non-negative safe integer.`, {
            path,
            value,
        });
    }
    return Object.is(value, -0) ? 0 : value;
}

function mappingIndex(catalog){
    const index = new Map();
    for (const mapping of catalog.entries()){
        for (const canonicalId of mapping.canonicalIds){
            const key = `${mapping.family}:${canonicalId}`;
            if (index.has(key)){
                fail('DUPLICATE_LEGACY_CONDITION_SUBJECT', 'Legacy condition subject is mapped more than once.', {
                    family: mapping.family,
                    subjectId: canonicalId,
                });
            }
            index.set(key, mapping);
        }
    }
    return index;
}

function requireMapping(index, family, subjectId){
    const mapping = index.get(`${family}:${subjectId}`);
    if (!mapping){
        fail(
            'UNSUPPORTED_LEGACY_CONDITION_SUBJECT',
            `Legacy condition compatibility does not support ${family} subject ${subjectId}.`,
            { family, subjectId }
        );
    }
    return mapping;
}

function createRootReader(readLegacyRoot){
    return function currentRoot(){
        let root;
        try {
            root = Reflect.apply(readLegacyRoot, undefined, []);
        }
        catch {
            fail(
                'LEGACY_CONDITION_ROOT_READ_FAILURE',
                'Legacy condition root provider threw while reading current state.'
            );
        }
        if (isConditionPromiseLike(
            root,
            'evolveLegacyConditionAdapter.readLegacyRoot.result',
            'INVALID_LEGACY_CONDITION_ROOT_PROVIDER'
        )){
            fail(
                'INVALID_LEGACY_CONDITION_ROOT_PROVIDER',
                'Legacy condition root provider must be synchronous.'
            );
        }
        return assertPlainRecord(root, 'legacyConditionRoot');
    };
}

function directRecord(currentRoot, mapping, label){
    const value = readLegacyPath(currentRoot(), mapping.legacyPath);
    if (value === MISSING) return MISSING;
    return assertPlainRecord(value, label);
}

function resourceRecord(currentRoot, mapping){
    return directRecord(currentRoot, mapping, `legacy resource ${mapping.canonicalIds[0]}`);
}

function primitiveRank(currentRoot, mapping){
    const value = readLegacyPath(currentRoot(), mapping.legacyPath);
    if (value === MISSING) return 0;
    return assertCount(value, mapping.legacyPath);
}

function truthyPath(root, legacyPath){
    const value = readLegacyPath(root, legacyPath);
    return value === MISSING ? false : Boolean(value);
}

function primitiveTechnologyHas(currentRoot, mapping, technologyId){
    if (mapping.id !== SUPPORTED_TECHNOLOGY_MAPPING){
        fail('UNSUPPORTED_LEGACY_CONDITION_MAPPING', 'Unsupported contextual technology mapping.', {
            mappingId: mapping.id,
            technologyId,
        });
    }

    const root = currentRoot();
    const rankValue = readLegacyPath(root, mapping.legacyPath);
    const rank = rankValue === MISSING ? 0 : assertCount(rankValue, mapping.legacyPath);

    if (technologyId === 'evolve:technology/club') return rank >= 1;
    if (technologyId === 'evolve:technology/sundial') return rank >= 3;

    const soulEater = truthyPath(root, 'global.race.soul_eater');
    const evil = truthyPath(root, 'global.race.evil');
    if (technologyId === 'evolve:technology/bone_tools'){
        return rank >= 2 && !(soulEater && !evil);
    }
    if (technologyId === 'evolve:technology/wooden_tools'){
        return rank >= 2 && soulEater && !evil;
    }

    fail('UNSUPPORTED_LEGACY_CONDITION_SUBJECT', 'Unsupported primitive technology subject.', {
        family: 'technology',
        subjectId: technologyId,
        mappingId: mapping.id,
    });
}

export function createEvolveLegacyConditionReadProvider(rawOptions){
    const options = readClosedConditionObject(rawOptions, {
        path: 'evolveLegacyConditionAdapterOptions',
        allowed: ['readLegacyRoot'],
        required: ['readLegacyRoot'],
        code: 'INVALID_LEGACY_CONDITION_ADAPTER_CONFIG',
    });
    const readLegacyRoot = assertSynchronousConditionFunction(
        options.get('readLegacyRoot'),
        'evolveLegacyConditionAdapterOptions.readLegacyRoot',
        'INVALID_LEGACY_CONDITION_ROOT_PROVIDER'
    );
    const currentRoot = createRootReader(readLegacyRoot);
    const catalog = createEvolveLegacyMappingCatalog();
    const index = mappingIndex(catalog);

    const technology = Object.freeze({
        has(technologyId){
            const mapping = requireMapping(index, 'technology', technologyId);
            return primitiveTechnologyHas(currentRoot, mapping, technologyId);
        },
    });

    const resource = Object.freeze({
        amount(resourceId){
            const mapping = requireMapping(index, 'resource', resourceId);
            const record = resourceRecord(currentRoot, mapping);
            if (record === MISSING) return 0;
            return assertFiniteNumber(
                readDataField(record, 'amount', `legacy resource ${resourceId}`, { required: true }),
                `${mapping.legacyPath}.amount`
            );
        },
        available(resourceId){
            const mapping = requireMapping(index, 'resource', resourceId);
            const record = resourceRecord(currentRoot, mapping);
            if (record === MISSING) return false;
            const display = readDataField(record, 'display', `legacy resource ${resourceId}`);
            return display === MISSING ? false : Boolean(display);
        },
        capacity(resourceId){
            const mapping = requireMapping(index, 'resource', resourceId);
            const record = resourceRecord(currentRoot, mapping);
            if (record === MISSING) return 0;
            return assertNonNegativeFinite(
                readDataField(record, 'max', `legacy resource ${resourceId}`, { required: true }),
                `${mapping.legacyPath}.max`
            );
        },
    });

    const structure = Object.freeze({
        count(structureId){
            const mapping = requireMapping(index, 'structure', structureId);
            const record = directRecord(currentRoot, mapping, `legacy structure ${structureId}`);
            if (record === MISSING) return 0;
            return assertCount(
                readDataField(record, 'count', `legacy structure ${structureId}`, { required: true }),
                `${mapping.legacyPath}.count`
            );
        },
        activeCount(structureId){
            const mapping = requireMapping(index, 'structure', structureId);
            const record = directRecord(currentRoot, mapping, `legacy structure ${structureId}`);
            if (record === MISSING) return 0;
            return assertCount(
                readDataField(record, 'on', `legacy structure ${structureId}`, { required: true }),
                `${mapping.legacyPath}.on`
            );
        },
    });

    const trait = Object.freeze({
        has(traitId){
            const mapping = requireMapping(index, 'trait', traitId);
            const value = readLegacyPath(currentRoot(), mapping.legacyPath);
            return value === MISSING ? false : Boolean(value);
        },
    });

    return Object.freeze({ technology, resource, structure, trait });
}
