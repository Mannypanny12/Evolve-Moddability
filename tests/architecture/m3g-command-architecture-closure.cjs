'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences } = require('./architecture-fitness.cjs');
const { findViolations: findCommandViolations } = require('./m3a1-command-boundary-fitness.cjs');
const { findM3B3Violations: findConditionViolations } = require('./m3b3-condition-closure.cjs');
const { findViolations: findEffectViolations } = require('./m3c3-effect-closure.cjs');
const { findViolations: findPaymentViolations } = require('./m3d4d-special-payment-closure.cjs');
const { findViolations: findQueueViolations } = require('./m3e4-queue-closure.cjs');
const { scanM3FCutoverClosure } = require('./m3f4-cutover-closure.cjs');

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const REVIEWED_COMMAND_ID = 'evolve:command/evolution/dna';
const REVIEWED_COMMAND = 'src/content/evolve/commands/evolution-dna.mjs';
const REVIEWED_RUNTIME = 'src/application/evolve/evolution-dna-command-runtime.mjs';
const REVIEWED_COMMAND_BUS = 'src/engine/commands/command-bus.mjs';
const REVIEWED_CONDITION_BOUNDARY = 'src/engine/conditions/condition-evaluator.mjs';
const REVIEWED_PAYMENT_BOUNDARY = 'src/engine/costs/payment-plan.mjs';
const REVIEWED_EFFECT_BOUNDARY = 'src/engine/effects/effect-plan.mjs';
const REVIEWED_QUEUE_MODEL = 'src/engine/queue/work-queue.mjs';
const REVIEWED_EXECUTION_AUTHORITY = 'src/engine/execution/resource-commit.mjs';
const REVIEWED_LEGACY_WRITE_CAPABILITY = 'src/legacy/bridge/evolve-resource-commit-adapter.mjs';
const LEGACY_WRITE_REMOVAL_TARGET = 'M6B';
const M3_ENGINE_ROOTS = Object.freeze([
    'src/engine/commands',
    'src/engine/conditions',
    'src/engine/costs',
    'src/engine/effects',
    'src/engine/execution',
    'src/engine/queue',
]);
const UPWARD_DEPENDENCY_ROOTS = Object.freeze([
    'src/application/',
    'src/content/',
    'src/legacy/',
    'src/platform/',
]);

function normalize(value){
    return value.split(path.sep).join('/');
}

function listSourceFiles(dir){
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...listSourceFiles(full));
        else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
    }
    return files.sort();
}

function resolveRelative(fromRelativePath, specifier){
    let target = path.posix.normalize(path.posix.join(path.posix.dirname(fromRelativePath), specifier));
    if (!path.posix.extname(target)) target += '.mjs';
    return target;
}

function prefixed(label, violations){
    return (violations || []).map(violation => `M3G ${label}: ${violation}`);
}

function analyzeGenericM3Dependency(source, relativePath){
    const violations = [];
    if (source.includes('evolve:')){
        violations.push(`${relativePath}: generic M3 engine packages may not embed first-party Evolve content IDs`);
    }
    for (const reference of extractModuleReferences(source, relativePath)){
        if (!reference.specifier.startsWith('.')) continue;
        const target = resolveRelative(relativePath, reference.specifier);
        if (UPWARD_DEPENDENCY_ROOTS.some(root => target.startsWith(root))){
            violations.push(`${relativePath}: generic M3 engine package may not depend upward on ${target}`);
        }
    }
    return violations;
}

function crossLayerOwnershipViolations(root){
    const violations = [];
    for (const relativeRoot of M3_ENGINE_ROOTS){
        const fullRoot = path.join(root, ...relativeRoot.split('/'));
        if (!fs.existsSync(fullRoot)){
            violations.push(`${relativeRoot}: reviewed M3 engine package is missing`);
            continue;
        }
        for (const filename of listSourceFiles(fullRoot)){
            const relative = normalize(path.relative(root, filename));
            violations.push(...analyzeGenericM3Dependency(fs.readFileSync(filename, 'utf8'), relative));
        }
    }
    for (const required of [
        REVIEWED_COMMAND,
        REVIEWED_RUNTIME,
        REVIEWED_COMMAND_BUS,
        REVIEWED_CONDITION_BOUNDARY,
        REVIEWED_PAYMENT_BOUNDARY,
        REVIEWED_EFFECT_BOUNDARY,
        REVIEWED_QUEUE_MODEL,
        REVIEWED_EXECUTION_AUTHORITY,
        REVIEWED_LEGACY_WRITE_CAPABILITY,
    ]){
        if (!fs.existsSync(path.join(root, ...required.split('/')))){
            violations.push(`${required}: reviewed M3 production seam is missing`);
        }
    }
    return violations;
}

function productionQueueConsumers(root){
    const queueRoot = 'src/engine/queue/';
    const consumers = [];
    for (const filename of listSourceFiles(path.join(root, 'src'))){
        const relative = normalize(path.relative(root, filename));
        if (relative.startsWith(queueRoot)) continue;
        const source = fs.readFileSync(filename, 'utf8');
        for (const reference of extractModuleReferences(source, relative)){
            if (!reference.specifier.startsWith('.')) continue;
            if (resolveRelative(relative, reference.specifier).startsWith(queueRoot)){
                consumers.push(relative);
                break;
            }
        }
    }
    return [...new Set(consumers)].sort();
}

function queueAuthorityViolations(consumers){
    return consumers.map(
        consumer => `M3G queue authority: ${consumer}: production code may not consume WorkQueue before its reviewed later cutover`
    );
}

function prerequisiteViolations(prerequisites){
    return [
        ...prefixed('M3A command prerequisite', prerequisites.command),
        ...prefixed('M3B condition prerequisite', prerequisites.condition),
        ...prefixed('M3C effect prerequisite', prerequisites.effect),
        ...prefixed('M3D payment prerequisite', prerequisites.payment),
        ...prefixed('M3E queue prerequisite', prerequisites.queue),
        ...prefixed('M3F cutover prerequisite', prerequisites.cutover),
    ];
}

async function scanM3GCommandArchitecture(root){
    const cutover = await scanM3FCutoverClosure(root);
    const prerequisites = {
        command: findCommandViolations(root),
        condition: findConditionViolations(root),
        effect: findEffectViolations(root),
        payment: findPaymentViolations(root),
        queue: findQueueViolations(root),
        cutover: cutover.violations,
    };
    const crossLayer = crossLayerOwnershipViolations(root);
    const queueConsumers = productionQueueConsumers(root);
    const queueAuthority = queueAuthorityViolations(queueConsumers);
    const violations = [
        ...prerequisiteViolations(prerequisites),
        ...prefixed('cross-layer ownership', crossLayer),
        ...queueAuthority,
    ];

    return {
        summary: {
            reviewedLiveCommandIds: [REVIEWED_COMMAND_ID],
            reviewedCommandModules: [REVIEWED_COMMAND],
            productionRuntimes: [REVIEWED_RUNTIME],
            semanticBoundaries: {
                commandBus: REVIEWED_COMMAND_BUS,
                conditions: REVIEWED_CONDITION_BOUNDARY,
                payments: REVIEWED_PAYMENT_BOUNDARY,
                effects: REVIEWED_EFFECT_BOUNDARY,
                queueModel: REVIEWED_QUEUE_MODEL,
                settlement: REVIEWED_EXECUTION_AUTHORITY,
            },
            executionAuthorities: [REVIEWED_EXECUTION_AUTHORITY],
            legacyWriteCapabilities: [REVIEWED_LEGACY_WRITE_CAPABILITY],
            legacyCompatibilityDebt: [{
                capability: REVIEWED_LEGACY_WRITE_CAPABILITY,
                removalTarget: LEGACY_WRITE_REMOVAL_TARGET,
            }],
            genericPackageRoots: [...M3_ENGINE_ROOTS],
            queueAuthority: queueConsumers.length === 0
                ? 'inert-no-production-consumers'
                : 'production-consumers-present',
            queueProductionConsumers: queueConsumers,
            queueProductionConsumerCount: queueConsumers.length,
            queueAuthorityViolationCount: queueAuthority.length,
            prerequisiteViolationCounts: {
                command: prerequisites.command.length,
                condition: prerequisites.condition.length,
                effect: prerequisites.effect.length,
                payment: prerequisites.payment.length,
                queue: prerequisites.queue.length,
                cutover: prerequisites.cutover.length,
            },
            crossLayerViolationCount: crossLayer.length,
            violationCount: violations.length,
        },
        violations: [...new Set(violations)].sort(),
    };
}

async function main(){
    const root = path.resolve(__dirname, '../..');
    const result = await scanM3GCommandArchitecture(root);
    if (result.violations.length > 0){
        console.error('M3G whole-M3 command architecture closure failed:');
        for (const violation of result.violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3G whole-M3 command architecture closure passed.');
    console.log(JSON.stringify(result.summary, null, 2));
}

module.exports = {
    REVIEWED_COMMAND_ID,
    REVIEWED_COMMAND,
    REVIEWED_RUNTIME,
    REVIEWED_COMMAND_BUS,
    REVIEWED_CONDITION_BOUNDARY,
    REVIEWED_PAYMENT_BOUNDARY,
    REVIEWED_EFFECT_BOUNDARY,
    REVIEWED_QUEUE_MODEL,
    REVIEWED_EXECUTION_AUTHORITY,
    REVIEWED_LEGACY_WRITE_CAPABILITY,
    LEGACY_WRITE_REMOVAL_TARGET,
    M3_ENGINE_ROOTS,
    analyzeGenericM3Dependency,
    crossLayerOwnershipViolations,
    productionQueueConsumers,
    queueAuthorityViolations,
    prerequisiteViolations,
    scanM3GCommandArchitecture,
};

if (require.main === module){
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
