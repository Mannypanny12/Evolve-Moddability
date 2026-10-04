'use strict';

const {
    scanAchievementAuthority,
} = require('./m2d3-achievement-authority-fitness.cjs');
const {
    scanAchievementReaders,
} = require('./m2d4-achievement-reader-fitness.cjs');

const MIGRATION_GATES = Object.freeze({
    achievementAuthority: 'tests/architecture/m2d3-achievement-authority-fitness.cjs',
    achievementReaders: 'tests/architecture/m2d4-achievement-reader-fitness.cjs',
});

function normalizeGate(script, result){
    return {
        summary: {
            script,
            passed: result.violations.length === 0,
            details: result.summary,
        },
        violations: result.violations,
    };
}

function scanM2MigrationGates(root){
    const results = {
        achievementAuthority: normalizeGate(
            MIGRATION_GATES.achievementAuthority,
            scanAchievementAuthority(root)
        ),
        achievementReaders: normalizeGate(
            MIGRATION_GATES.achievementReaders,
            scanAchievementReaders(root)
        ),
    };

    const gates = {};
    const violations = [];
    for (const [name, result] of Object.entries(results)){
        gates[name] = result.summary;
        violations.push(...result.violations.map(value => `${name}: ${value}`));
    }

    return {
        summary: {
            gateCount: Object.keys(MIGRATION_GATES).length,
            gates,
        },
        violations: violations.sort(),
    };
}

module.exports = {
    MIGRATION_GATES,
    normalizeGate,
    scanM2MigrationGates,
};
