'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadBaseline, scanRepository } = require('./architecture-fitness.cjs');
const { findViolations: findQueueViolations } = require('./m3e4-queue-closure.cjs');
const { findViolations: findResourceCommitViolations } = require('./m3f1-resource-commit-fitness.cjs');
const { findViolations: findDnaCommandViolations } = require('./m3f2-dna-command-fitness.cjs');
const { findViolations: findLiveCutoverViolations } = require('./m3f3-dna-live-cutover-fitness.cjs');

const PRE_CUTOVER_ACTIONS_GLOBAL_BUDGET = 2667;
const CLOSED_ACTIONS_GLOBAL_BUDGET = 2664;
const REQUIRED_MAPPING_REMOVAL = 'M6B';
const REQUIRED_MAPPINGS = Object.freeze([
    Object.freeze({
        id: 'evolve.resource.rna_state',
        canonicalId: 'evolve:resource/rna',
    }),
    Object.freeze({
        id: 'evolve.resource.dna_state',
        canonicalId: 'evolve:resource/dna',
    }),
]);
const REQUIRED_ARCHITECTURE_COMMANDS = Object.freeze([
    'node tests/architecture/m3e4-queue-closure.cjs',
    'node tests/architecture/m3f1-resource-commit-fitness.cjs',
    'node tests/architecture/m3f2-dna-command-fitness.cjs',
    'node tests/architecture/m3f3-dna-live-cutover-fitness.cjs',
    'node tests/architecture/m3f4-cutover-closure.cjs',
]);
const REQUIRED_BROWSER_COMMANDS = Object.freeze([
    'node tests/browser/smoke.cjs',
    'node tests/browser/m3f4-dna-cutover-smoke.cjs',
    'node tests/browser/m2d4-wiki-smoke.cjs',
]);

function prefixed(label, violations){
    return (violations || []).map(violation => `M3F4 ${label}: ${violation}`);
}

function splitCommandChain(script){
    if (typeof script !== 'string') return null;
    const commands = script.split('&&').map(command => command.trim());
    return commands.length > 0 && commands.every(Boolean) ? commands : null;
}

function orderedCommandViolations(script, requiredCommands, label){
    const violations = [];
    const commands = splitCommandChain(script);
    if (!commands){
        return [`M3F4 ${label} must remain an inspectable &&-chained command sequence`];
    }

    let previousIndex = -1;
    for (const requiredCommand of requiredCommands){
        const positions = [];
        for (let index = 0; index < commands.length; index++){
            if (commands[index] === requiredCommand) positions.push(index);
        }
        if (positions.length !== 1){
            violations.push(
                `M3F4 ${label} must contain exactly one ${JSON.stringify(requiredCommand)} command; found ${positions.length}`
            );
            continue;
        }
        if (positions[0] <= previousIndex){
            violations.push(`M3F4 ${label} must preserve the reviewed cutover command order`);
        }
        previousIndex = positions[0];
    }
    return violations;
}

function legacyRatchetViolations(baseline, architectureViolations = []){
    const violations = [];
    if (architectureViolations.length > 0){
        violations.push(...prefixed('legacy architecture prerequisite', architectureViolations));
    }
    const actionsGlobal = baseline?.legacyModules?.['actions.js']?.global;
    if (!Number.isInteger(actionsGlobal)){
        violations.push('M3F4 legacy architecture baseline must contain an integer actions.js global budget');
    }
    else {
        if (actionsGlobal > CLOSED_ACTIONS_GLOBAL_BUDGET){
            violations.push(
                `M3F4 actions.js global budget must retain the live-cutover ratchet at ${CLOSED_ACTIONS_GLOBAL_BUDGET} or lower; got ${actionsGlobal}`
            );
        }
        if (actionsGlobal >= PRE_CUTOVER_ACTIONS_GLOBAL_BUDGET){
            violations.push(
                `M3F4 live cutover must retain a strict actions.js global-access reduction from the pre-cutover budget ${PRE_CUTOVER_ACTIONS_GLOBAL_BUDGET}`
            );
        }
    }
    return violations;
}

function mappingLifecycleViolations(inspection){
    const violations = [];
    const mappings = Array.isArray(inspection?.mappings) ? inspection.mappings : [];
    for (const required of REQUIRED_MAPPINGS){
        const matches = mappings.filter(mapping => mapping?.id === required.id);
        if (matches.length !== 1){
            violations.push(`M3F4 mapping ${required.id} must occur exactly once; found ${matches.length}`);
            continue;
        }
        const mapping = matches[0];
        if (!Array.isArray(mapping.canonicalIds)
            || mapping.canonicalIds.length !== 1
            || mapping.canonicalIds[0] !== required.canonicalId){
            violations.push(`M3F4 mapping ${required.id} must remain bound only to ${required.canonicalId}`);
        }
        if (mapping.removeBy !== REQUIRED_MAPPING_REMOVAL){
            violations.push(
                `M3F4 mapping ${required.id} must retain temporary removal milestone ${REQUIRED_MAPPING_REMOVAL}; got ${JSON.stringify(mapping.removeBy)}`
            );
        }
        const semantics = typeof mapping.stateSemantics === 'string'
            ? mapping.stateSemantics.toLowerCase()
            : '';
        if (!semantics.includes('condition') || !semantics.includes('settlement')){
            violations.push(
                `M3F4 mapping ${required.id} semantics must document both bounded condition reads and atomic resource settlement`
            );
        }
    }
    return violations;
}

function prerequisiteViolations({ queue = [], m3f1 = [], m3f2 = [], m3f3 = [] } = {}){
    return [
        ...prefixed('M3E4 queue prerequisite', queue),
        ...prefixed('M3F1 prerequisite', m3f1),
        ...prefixed('M3F2 prerequisite', m3f2),
        ...prefixed('M3F3 prerequisite', m3f3),
    ];
}

async function inspectMappings(root){
    const mappingModule = await import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-mappings.mjs')).href);
    const inspectorModule = await import(pathToFileURL(path.join(root, 'src/legacy/bridge/inspector.mjs')).href);
    return inspectorModule.inspectLegacyMappings(mappingModule.createEvolveLegacyMappingCatalog());
}

async function scanM3FCutoverClosure(root){
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const baseline = loadBaseline(root);
    const architecture = scanRepository(root, baseline);
    const mappingInspection = await inspectMappings(root);

    const prerequisites = {
        queue: findQueueViolations(root),
        m3f1: findResourceCommitViolations(root),
        m3f2: findDnaCommandViolations(root),
        m3f3: findLiveCutoverViolations(root),
    };

    const violations = [
        ...prerequisiteViolations(prerequisites),
        ...legacyRatchetViolations(baseline, architecture.violations),
        ...mappingLifecycleViolations(mappingInspection),
        ...orderedCommandViolations(
            packageJson.scripts?.['test:architecture'],
            REQUIRED_ARCHITECTURE_COMMANDS,
            'test:architecture'
        ),
        ...orderedCommandViolations(
            packageJson.scripts?.['test:browser'],
            REQUIRED_BROWSER_COMMANDS,
            'test:browser'
        ),
    ];

    return {
        summary: {
            actionsGlobalBudget: baseline.legacyModules?.['actions.js']?.global ?? null,
            preCutoverActionsGlobalBudget: PRE_CUTOVER_ACTIONS_GLOBAL_BUDGET,
            reviewedMappingIds: REQUIRED_MAPPINGS.map(mapping => mapping.id),
            mappingRemovalMilestone: REQUIRED_MAPPING_REMOVAL,
            prerequisiteViolationCount: Object.values(prerequisites).reduce((sum, values) => sum + values.length, 0),
            violationCount: violations.length,
        },
        violations: [...new Set(violations)].sort(),
    };
}

async function main(){
    const root = path.resolve(__dirname, '../..');
    const result = await scanM3FCutoverClosure(root);
    if (result.violations.length > 0){
        console.error('M3F4 cutover closure fitness failed:');
        for (const violation of result.violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3F4 cutover closure fitness passed.');
    console.log(JSON.stringify(result.summary, null, 2));
}

module.exports = {
    PRE_CUTOVER_ACTIONS_GLOBAL_BUDGET,
    CLOSED_ACTIONS_GLOBAL_BUDGET,
    REQUIRED_MAPPING_REMOVAL,
    REQUIRED_MAPPINGS,
    REQUIRED_ARCHITECTURE_COMMANDS,
    REQUIRED_BROWSER_COMMANDS,
    orderedCommandViolations,
    legacyRatchetViolations,
    mappingLifecycleViolations,
    prerequisiteViolations,
    scanM3FCutoverClosure,
};

if (require.main === module){
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
