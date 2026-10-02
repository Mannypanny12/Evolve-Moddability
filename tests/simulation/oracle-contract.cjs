'use strict';

const legacyBase = require('../fixtures/legacy-base.json');

const ORACLE_RESULT_SCHEMA = 1;
const ORACLE_MANIFEST_SCHEMA = 2;

const ORACLE_SOURCE = Object.freeze({
    repository: legacyBase.source.repository,
    commit: legacyBase.source.commit,
    version: legacyBase.source.version
});

const ORACLE_ENVIRONMENT = Object.freeze({
    wallClock: legacyBase.harness.clock,
    randomSeed: legacyBase.harness.rngSeed
});

function sameRecord(actual, expected){
    if (!actual || typeof actual !== 'object'){
        return false;
    }
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (actualKeys.length !== expectedKeys.length){
        return false;
    }
    return expectedKeys.every(key => Object.is(actual[key], expected[key]));
}

function validateOracleManifest(manifest){
    if (!manifest || typeof manifest !== 'object'){
        throw new Error('oracle manifest must be an object');
    }
    if (manifest.schema !== ORACLE_MANIFEST_SCHEMA){
        throw new Error(
            'unsupported oracle manifest schema: ' + String(manifest.schema)
        );
    }
    if (!sameRecord(manifest.source, ORACLE_SOURCE)){
        throw new Error(
            'oracle manifest source provenance does not match canonical legacy base'
        );
    }
    if (!sameRecord(manifest.environment, ORACLE_ENVIRONMENT)){
        throw new Error(
            'oracle manifest environment does not match canonical legacy base harness'
        );
    }
}

function validateOracleResult(result, scenario){
    if (!result || typeof result !== 'object'){
        throw new Error('legacy simulation result must be an object');
    }
    if (result.schema !== ORACLE_RESULT_SCHEMA){
        throw new Error(
            'legacy simulation result schema mismatch: expected ' +
            ORACLE_RESULT_SCHEMA + ' actual ' + String(result.schema)
        );
    }
    if (result.fixture !== scenario.fixture){
        throw new Error(
            'legacy simulation fixture mismatch: expected ' +
            scenario.fixture + ' actual ' + String(result.fixture)
        );
    }
    if (result.periods !== scenario.periods){
        throw new Error(
            'legacy simulation period mismatch: expected ' +
            scenario.periods + ' actual ' + String(result.periods)
        );
    }
    if (!sameRecord(result.environment, ORACLE_ENVIRONMENT)){
        throw new Error(
            'legacy simulation environment does not match frozen oracle contract'
        );
    }
    if (!Object.prototype.hasOwnProperty.call(result, 'before')){
        throw new Error('legacy simulation result is missing before state');
    }
    if (!Object.prototype.hasOwnProperty.call(result, 'after')){
        throw new Error('legacy simulation result is missing after state');
    }

    return result;
}

module.exports = {
    ORACLE_RESULT_SCHEMA,
    ORACLE_MANIFEST_SCHEMA,
    ORACLE_SOURCE,
    ORACLE_ENVIRONMENT,
    validateOracleManifest,
    validateOracleResult
};
