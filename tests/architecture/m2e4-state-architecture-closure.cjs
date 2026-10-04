'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const {
    ARCHITECTURE_REPORT_VERSION,
    buildArchitectureReport,
} = require('./architecture-report.cjs');

const REQUIRED_REPORT_GATES = Object.freeze([
    'architecture',
    'platform',
    'bridge',
    'stateBoundary',
    'stateSyntax',
    'achievementMigration',
    'stateOwnership',
    'mutationBoundary',
    'mutationBoundaryReview',
    'capabilitySurface',
    'dynamicLoaders',
    'selectorDependencies',
    'selectorReview',
]);

const REQUIRED_ARCHITECTURE_SCRIPTS = Object.freeze([
    'architecture-fitness.cjs',
    'platform-fitness.cjs',
    'legacy-bridge-fitness.cjs',
    'm2c-boundary-fitness.cjs',
    'm2c-syntax-hardening.cjs',
    'm2d3-achievement-authority-fitness.cjs',
    'm2d4-achievement-reader-fitness.cjs',
    'm2e1-state-ownership-fitness.cjs',
    'm2e2-mutation-boundary-fitness.cjs',
    'm2e2-mutation-boundary-review-hardening.cjs',
    'm2e2-capability-surface-hardening.cjs',
    'm2e2-dynamic-loader-hardening.cjs',
    'm2e3-selector-state-dependencies-fitness.cjs',
    'm2e3-selector-review-hardening.cjs',
    'm2e4-state-architecture-closure.cjs',
]);

const REQUIRED_ARCHITECTURE_COMMANDS = Object.freeze(
    REQUIRED_ARCHITECTURE_SCRIPTS.map(script => `node tests/architecture/${script}`)
);
const EXPECTED_ARCHITECTURE_SCRIPT = REQUIRED_ARCHITECTURE_COMMANDS.join(' && ');
const EXPECTED_INSPECT_SCRIPT = 'node tests/architecture/architecture-report.cjs';
const CI_WORKFLOW_FILE = '.github/workflows/baseline-build.yml';
const REQUIRED_CI_RUN_COMMANDS = Object.freeze([
    'npm test',
    'npm run test:architecture',
    'npm run build',
    'npm run test:browser',
]);
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

function sortedStrings(values){
    return [...values].sort();
}

function domainRoots(summary){
    return Array.isArray(summary?.domains)
        ? summary.domains.map(entry => entry.root).sort()
        : [];
}

function mutationSurfaceRoots(summary){
    return Array.isArray(summary?.reviewedSurfaces)
        ? summary.reviewedSurfaces.map(entry => entry.root).sort()
        : [];
}

function hasJsonMappingShape(value){
    return value
        && typeof value === 'object'
        && !Array.isArray(value)
        && Number.isInteger(value.size)
        && value.size >= 0
        && Array.isArray(value.mappings)
        && value.byDomain
        && typeof value.byDomain === 'object'
        && !Array.isArray(value.byDomain)
        && value.size === value.mappings.length;
}

function requiredReportGateViolations(report){
    const violations = [];
    const gates = report?.gateViolations;
    if (!gates || typeof gates !== 'object' || Array.isArray(gates)){
        return ['M2E4 architecture report gateViolations must be an object'];
    }

    const missing = REQUIRED_REPORT_GATES.filter(name => !Object.prototype.hasOwnProperty.call(gates, name));
    if (missing.length){
        violations.push(`M2E4 architecture report is missing required M2 gates ${JSON.stringify(missing)}`);
    }

    for (const name of REQUIRED_REPORT_GATES){
        if (!Object.prototype.hasOwnProperty.call(gates, name)) continue;
        const gateViolations = gates[name];
        if (!Array.isArray(gateViolations)){
            violations.push(`M2E4 prerequisite gate ${name} violations must be an array`);
            continue;
        }
        for (const violation of gateViolations){
            if (typeof violation !== 'string'){
                violations.push(`M2E4 prerequisite gate ${name} emitted a non-string violation`);
            }
            else {
                violations.push(`M2E4 prerequisite gate violation: ${violation}`);
            }
        }
    }
    return violations;
}

function summaryCountViolation(label, actual, expected){
    return actual === expected
        ? null
        : `M2E4 ${label} must equal authoritative domain count ${expected}; got ${JSON.stringify(actual)}`;
}

function closureViolations(report){
    const violations = [];
    if (!report || typeof report !== 'object') return ['M2E4 architecture report must be an object'];
    if (report.reportVersion !== ARCHITECTURE_REPORT_VERSION){
        violations.push(`M2E4 architecture reportVersion must be ${ARCHITECTURE_REPORT_VERSION}`);
    }

    violations.push(...requiredReportGateViolations(report));

    const state = report.stateArchitecture || {};
    const ownershipRoots = domainRoots(state.ownership);
    const mutationRoots = Array.isArray(state.mutation?.writableRoots)
        ? sortedStrings(state.mutation.writableRoots)
        : [];
    const mutationReviewRoots = mutationSurfaceRoots(state.mutationReview);
    const selectorRoots = domainRoots(state.selectors);
    if (!isDeepStrictEqual(mutationRoots, ownershipRoots)){
        violations.push(`M2E4 writable roots must exactly equal ownership domains ${JSON.stringify(ownershipRoots)}; got ${JSON.stringify(mutationRoots)}`);
    }
    if (!isDeepStrictEqual(mutationReviewRoots, ownershipRoots)){
        violations.push(`M2E4 reviewed mutation surfaces must exactly equal ownership domains ${JSON.stringify(ownershipRoots)}; got ${JSON.stringify(mutationReviewRoots)}`);
    }
    if (!isDeepStrictEqual(selectorRoots, ownershipRoots)){
        violations.push(`M2E4 selector domains must exactly equal ownership domains ${JSON.stringify(ownershipRoots)}; got ${JSON.stringify(selectorRoots)}`);
    }

    const authoritativeDomainCount = ownershipRoots.length;
    for (const [label, actual] of [
        ['ownership domainCount', state.ownership?.domainCount],
        ['mutation domainCount', state.mutation?.domainCount],
        ['mutation-review domainCount', state.mutationReview?.domainCount],
        ['selector domainCount', state.selectors?.domainCount],
    ]){
        const violation = summaryCountViolation(label, actual, authoritativeDomainCount);
        if (violation) violations.push(violation);
    }

    const metadataRoots = Array.isArray(state.ownership?.metadataRoots)
        ? sortedStrings(state.ownership.metadataRoots)
        : [];
    if (state.ownership?.metadataRootCount !== metadataRoots.length){
        violations.push(
            `M2E4 ownership metadataRootCount must equal metadata root list length ${metadataRoots.length}; ` +
            `got ${JSON.stringify(state.ownership?.metadataRootCount)}`
        );
    }
    if (state.ownership?.rootCount !== metadataRoots.length + authoritativeDomainCount){
        violations.push(
            `M2E4 ownership rootCount must equal metadata plus authoritative roots ` +
            `${metadataRoots.length + authoritativeDomainCount}; got ${JSON.stringify(state.ownership?.rootCount)}`
        );
    }

    for (const selectorDomain of state.selectors?.domains || []){
        if (!Number.isInteger(selectorDomain.selectorCount) || selectorDomain.selectorCount <= 0){
            violations.push(`M2E4 domain ${selectorDomain.root} must expose at least one reviewed semantic selector`);
        }
    }
    for (const surface of state.mutationReview?.reviewedSurfaces || []){
        if (!Array.isArray(surface.publicMethods) || surface.publicMethods.length === 0){
            violations.push(`M2E4 domain ${surface.root} must expose at least one reviewed semantic mutation method`);
        }
    }

    for (const rootName of metadataRoots){
        if (mutationRoots.includes(rootName)){
            violations.push(`M2E4 metadata root ${rootName} may not be runtime writable`);
        }
    }

    const owners = new Map();
    for (const entry of state.ownership?.domains || []){
        if (typeof entry.root !== 'string' || typeof entry.owner !== 'string' || entry.owner.length === 0){
            violations.push('M2E4 ownership domain summaries must contain non-empty string root/owner pairs');
            continue;
        }
        owners.set(entry.root, entry.owner);
    }

    const scopes = Array.isArray(state.mutation?.scopes) ? state.mutation.scopes : [];
    for (const rootName of ownershipRoots){
        const matching = scopes.filter(scope => scope.field === rootName && scope.id === owners.get(rootName));
        if (matching.length !== 1){
            violations.push(`M2E4 domain ${rootName} must have exactly one mutation scope owned by ${JSON.stringify(owners.get(rootName))}`);
        }
    }
    if (scopes.length !== ownershipRoots.length){
        violations.push(`M2E4 scope count must equal authoritative domain count ${ownershipRoots.length}; got ${scopes.length}`);
    }

    const migrationGates = state.migration?.gates || {};
    for (const name of ['achievementAuthority', 'achievementReaders']){
        if (migrationGates[name]?.passed !== true){
            violations.push(`M2E4 migration gate ${name} must be present and passing`);
        }
    }

    if (!hasJsonMappingShape(report.legacyMappings)){
        violations.push('M2E4 legacyMappings must preserve the reviewed JSON-safe { size, mappings, byDomain } inspector shape');
    }

    try {
        const serialized = JSON.stringify(report);
        const parsed = JSON.parse(serialized);
        if (!isDeepStrictEqual(parsed, report)){
            violations.push('M2E4 architecture report must survive a JSON round-trip without losing data');
        }
    }
    catch (error){
        violations.push(`M2E4 architecture report must be JSON serializable: ${error.message}`);
    }

    return [...new Set(violations)].sort();
}

function splitCommandChain(script){
    if (typeof script !== 'string') return null;
    const commands = script.split('&&').map(command => command.trim());
    return commands.length > 0 && commands.every(Boolean) ? commands : null;
}

function architectureScriptContractViolations(architectureScript, inspectScript){
    const violations = [];
    const commands = splitCommandChain(architectureScript);
    if (!commands){
        violations.push('M2E4 test:architecture must be an inspectable &&-chained command sequence');
    }
    else {
        let previousIndex = -1;
        for (const requiredCommand of REQUIRED_ARCHITECTURE_COMMANDS){
            const positions = [];
            for (let index = 0; index < commands.length; index++){
                if (commands[index] === requiredCommand) positions.push(index);
            }
            if (positions.length !== 1){
                violations.push(
                    `M2E4 required architecture command must appear exactly once: ${JSON.stringify(requiredCommand)}; ` +
                    `found ${positions.length}`
                );
                continue;
            }
            if (positions[0] <= previousIndex){
                violations.push('M2E4 required M0-M2 architecture commands must remain in their reviewed relative order');
            }
            previousIndex = positions[0];
        }
    }

    if (inspectScript !== EXPECTED_INSPECT_SCRIPT){
        violations.push('M2E4 inspect:architecture must execute the integrated architecture report exactly');
    }
    return violations;
}

function architectureScriptViolations(root){
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return architectureScriptContractViolations(
        packageJson.scripts?.['test:architecture'],
        packageJson.scripts?.['inspect:architecture']
    );
}

function ciWorkflowContractViolations(source){
    const violations = [];
    if (typeof source !== 'string') return ['M2E4 CI workflow must be readable text'];
    const lines = source.split(/\r?\n/);
    let previousLine = -1;

    for (const command of REQUIRED_CI_RUN_COMMANDS){
        const expectedLine = `run: ${command}`;
        const positions = [];
        for (let index = 0; index < lines.length; index++){
            if (lines[index].trim() === expectedLine) positions.push(index);
        }
        if (positions.length !== 1){
            violations.push(
                `M2E4 CI workflow must contain exactly one executable ${JSON.stringify(expectedLine)} line; ` +
                `found ${positions.length}`
            );
            continue;
        }
        if (positions[0] <= previousLine){
            violations.push('M2E4 CI workflow must keep test, architecture, build, and browser smoke commands in reviewed order');
        }
        previousLine = positions[0];
    }
    return violations;
}

function ciWorkflowViolations(root){
    const workflow = path.join(root, ...CI_WORKFLOW_FILE.split('/'));
    if (!fs.existsSync(workflow) || !fs.statSync(workflow).isFile()){
        return [`M2E4 CI workflow is missing: ${CI_WORKFLOW_FILE}`];
    }
    if (fs.lstatSync(workflow).isSymbolicLink()){
        return [`M2E4 CI workflow may not be a symbolic link: ${CI_WORKFLOW_FILE}`];
    }
    return ciWorkflowContractViolations(fs.readFileSync(workflow, 'utf8'));
}

function sourceSymlinkViolations(root){
    const violations = [];
    const sourceRoot = path.join(root, 'src');
    if (!fs.existsSync(sourceRoot)) return ['M2E4 production source root src/ is missing'];
    if (fs.lstatSync(sourceRoot).isSymbolicLink()){
        return ['M2E4 production source root src/ may not be a symbolic link'];
    }

    function visit(directory){
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })){
            const target = path.join(directory, entry.name);
            if (entry.isDirectory()){
                visit(target);
                continue;
            }
            if (!entry.isSymbolicLink()) continue;

            const relative = path.relative(root, target).split(path.sep).join('/');
            let stat;
            let realTarget;
            try {
                stat = fs.statSync(target);
                realTarget = fs.realpathSync(target);
            }
            catch (error){
                violations.push(`${relative}: M2E4 cannot inspect production source symlink: ${error.message}`);
                continue;
            }

            if (stat.isDirectory()){
                violations.push(`${relative}: M2E4 production source directory symlinks are forbidden because they can hide unreviewed modules`);
                continue;
            }
            if (!stat.isFile()) continue;

            const entryExtension = path.extname(entry.name);
            const targetExtension = path.extname(realTarget);
            if (SOURCE_EXTENSIONS.has(entryExtension) || SOURCE_EXTENSIONS.has(targetExtension)){
                violations.push(`${relative}: M2E4 production source module symlinks are forbidden because they can bypass canonical module enumeration`);
            }
        }
    }

    visit(sourceRoot);
    return violations.sort();
}

async function scanM2StateArchitectureClosure(root){
    const report = await buildArchitectureReport(root);
    const violations = [
        ...closureViolations(report),
        ...architectureScriptViolations(root),
        ...ciWorkflowViolations(root),
        ...sourceSymlinkViolations(root),
    ];
    return {
        summary: {
            reportVersion: report.reportVersion,
            authoritativeDomains: domainRoots(report.stateArchitecture?.ownership),
            metadataRoots: Array.isArray(report.stateArchitecture?.ownership?.metadataRoots)
                ? sortedStrings(report.stateArchitecture.ownership.metadataRoots)
                : [],
            cumulativeGateCount: Object.keys(report.gateViolations || {}).length,
            requiredM2GateCount: REQUIRED_REPORT_GATES.length,
            legacyMappingCount: hasJsonMappingShape(report.legacyMappings) ? report.legacyMappings.size : 0,
            sourceSymlinkViolationCount: sourceSymlinkViolations(root).length,
            violationCount: violations.length,
        },
        violations: [...new Set(violations)].sort(),
        report,
    };
}

async function runM2StateArchitectureClosure(root, logger = console){
    const result = await scanM2StateArchitectureClosure(root);
    logger.log('M2E4 state-architecture closure summary:');
    logger.log(JSON.stringify(result.summary, null, 2));
    if (result.violations.length){
        logger.error('\nM2E4 state-architecture closure violations:');
        for (const violation of result.violations) logger.error('- ' + violation);
        return { exitCode: 1, result };
    }
    logger.log('\nM2E4 state-architecture closure gate passed.');
    return { exitCode: 0, result };
}

async function main(){
    const root = path.resolve(__dirname, '..', '..');
    process.exitCode = (await runM2StateArchitectureClosure(root)).exitCode;
}

module.exports = {
    REQUIRED_REPORT_GATES,
    REQUIRED_ARCHITECTURE_SCRIPTS,
    REQUIRED_ARCHITECTURE_COMMANDS,
    EXPECTED_ARCHITECTURE_SCRIPT,
    EXPECTED_INSPECT_SCRIPT,
    CI_WORKFLOW_FILE,
    REQUIRED_CI_RUN_COMMANDS,
    domainRoots,
    mutationSurfaceRoots,
    hasJsonMappingShape,
    requiredReportGateViolations,
    closureViolations,
    splitCommandChain,
    architectureScriptContractViolations,
    architectureScriptViolations,
    ciWorkflowContractViolations,
    ciWorkflowViolations,
    sourceSymlinkViolations,
    scanM2StateArchitectureClosure,
    runM2StateArchitectureClosure,
};

if (require.main === module){
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
