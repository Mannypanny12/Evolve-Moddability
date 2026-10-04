'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MIGRATION_GATES = Object.freeze({
    achievementAuthority: 'tests/architecture/m2d3-achievement-authority-fitness.cjs',
    achievementReaders: 'tests/architecture/m2d4-achievement-reader-fitness.cjs',
});

function scanScriptGate(root, relativePath){
    const script = path.join(root, ...relativePath.split('/'));
    const result = spawnSync(process.execPath, [script], {
        cwd: root,
        encoding: 'utf8',
        env: process.env,
    });
    const stdout = String(result.stdout || '').trim();
    const stderr = String(result.stderr || '').trim();
    const violations = [];
    if (result.error){
        violations.push(`${relativePath}: gate execution failed: ${result.error.message}`);
    }
    if (result.status !== 0){
        const detail = stderr || stdout || `exit status ${result.status}`;
        violations.push(`${relativePath}: ${detail}`);
    }
    return {
        summary: {
            script: relativePath,
            exitStatus: result.status,
            passed: violations.length === 0,
        },
        violations,
    };
}

function scanM2MigrationGates(root){
    const gates = {};
    const violations = [];
    for (const [name, script] of Object.entries(MIGRATION_GATES)){
        const result = scanScriptGate(root, script);
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
    scanScriptGate,
    scanM2MigrationGates,
};
