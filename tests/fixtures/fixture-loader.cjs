'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {
    canonicalize,
    canonicalStringify,
    cloneState
} = require('../simulation/canonical-state.cjs');

const fixtureRoot = __dirname;
const scenarioRoot = path.join(fixtureRoot, 'scenarios');
const baseMetadata = JSON.parse(
    fs.readFileSync(path.join(fixtureRoot, 'legacy-base.json'), 'utf8')
);

function clone(value){
    return cloneState(value);
}

function isPlainObject(value){
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(target, patch){
    if (!isPlainObject(patch)){
        return clone(patch);
    }

    const result = isPlainObject(target) ? clone(target) : {};
    for (const [key, value] of Object.entries(patch)){
        result[key] = isPlainObject(value) ? deepMerge(result[key], value) : clone(value);
    }
    return result;
}

function fingerprint(value){
    return crypto.createHash('sha256').update(canonicalStringify(value)).digest('hex');
}

function getPath(object, dottedPath){
    const parts = dottedPath.split('.');
    let current = object;
    for (const part of parts){
        if (current === null || current === undefined || !Object.prototype.hasOwnProperty.call(current, part)){
            return { exists: false, value: undefined };
        }
        current = current[part];
    }
    return { exists: true, value: current };
}

function checkInvariant(state, invariant, fixtureId){
    const actual = getPath(state, invariant.path);
    const prefix = `fixture ${fixtureId} invariant ${invariant.path}`;

    if (Object.prototype.hasOwnProperty.call(invariant, 'exists')){
        assert.equal(actual.exists, invariant.exists, `${prefix}: existence`);
    }
    if (Object.prototype.hasOwnProperty.call(invariant, 'equals')){
        assert.equal(actual.exists, true, `${prefix}: missing path`);
        assert.deepEqual(actual.value, invariant.equals, `${prefix}: value`);
    }
    if (Object.prototype.hasOwnProperty.call(invariant, 'min')){
        assert.equal(actual.exists, true, `${prefix}: missing path`);
        assert.ok(actual.value >= invariant.min, `${prefix}: expected >= ${invariant.min}, got ${actual.value}`);
    }
    if (Object.prototype.hasOwnProperty.call(invariant, 'includes')){
        assert.equal(actual.exists, true, `${prefix}: missing path`);
        assert.ok(Array.isArray(actual.value), `${prefix}: expected array`);
        assert.ok(actual.value.includes(invariant.includes), `${prefix}: missing ${invariant.includes}`);
    }
    if (Object.prototype.hasOwnProperty.call(invariant, 'lengthMin')){
        assert.equal(actual.exists, true, `${prefix}: missing path`);
        assert.ok(actual.value != null && typeof actual.value.length === 'number', `${prefix}: value has no length`);
        assert.ok(actual.value.length >= invariant.lengthMin, `${prefix}: expected length >= ${invariant.lengthMin}, got ${actual.value.length}`);
    }
}

function listFixturePaths(){
    return fs.readdirSync(scenarioRoot)
        .filter(name => name.endsWith('.json'))
        .sort()
        .map(name => path.join(scenarioRoot, name));
}

function loadFixtureDefinition(filePath){
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listFixtureDefinitions(){
    return listFixturePaths().map(loadFixtureDefinition);
}

function loadFixtureById(id){
    const filePath = path.join(scenarioRoot, `${id}.json`);
    if (!fs.existsSync(filePath)){
        throw new Error(`Unknown fixture: ${id}`);
    }
    return loadFixtureDefinition(filePath);
}

function validateDefinition(definition, filePath){
    assert.equal(definition.schema, 1, `${filePath}: unsupported fixture schema`);
    assert.match(definition.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${filePath}: invalid fixture id`);
    assert.equal(definition.source.commit, baseMetadata.source.commit, `${definition.id}: source commit mismatch`);
    assert.equal(definition.source.version, baseMetadata.source.version, `${definition.id}: source version mismatch`);
    assert.equal(definition.origin, 'synthetic-overlay', `${definition.id}: origin must be synthetic-overlay`);
    assert.ok(typeof definition.purpose === 'string' && definition.purpose.length > 10, `${definition.id}: purpose required`);
    assert.ok(Array.isArray(definition.coverage) && definition.coverage.length > 0, `${definition.id}: coverage required`);
    assert.ok(isPlainObject(definition.patch), `${definition.id}: patch required`);
    assert.ok(Array.isArray(definition.invariants) && definition.invariants.length > 0, `${definition.id}: invariants required`);
}

function materializeFixture(definition, legacyApi){
    return deepMerge(legacyApi.pristineLegacyState(), definition.patch);
}

function assertFixture(definition, state){
    definition.invariants.forEach(invariant => checkInvariant(state, invariant, definition.id));
}

function assertBaseFingerprint(legacyApi){
    const actual = fingerprint(legacyApi.pristineLegacyState());
    assert.equal(actual, baseMetadata.sha256, `canonical legacy base fingerprint mismatch; actual=${actual}`);
    return actual;
}

module.exports = {
    baseMetadata,
    canonicalize,
    canonicalStringify,
    fingerprint,
    listFixtureDefinitions,
    loadFixtureById,
    validateDefinition,
    materializeFixture,
    assertFixture,
    assertBaseFingerprint
};
