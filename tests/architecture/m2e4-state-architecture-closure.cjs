'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const {
    ARCHITECTURE_REPORT_VERSION,
    buildArchitectureReport,
    reportViolations,
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

function sortedStrings(values){
    return [...values].sort();
}

function domainRoots(summary){
    return (summary?.domains || []).map(entry => entry.root).sort();
}

function hasJsonMappingShape(value){
    return value
        && typeof value === 'object'
        && Number.isInteger(value.size)
        && Array.isArray(value.mappings)
        && value.byDomain
        && typeof value.byDomain === 'object'
        && value.size === value.mappings.length;
}

function closureViolations(report){
    const violations = [];
    if (!report || typeof report !== 'object') return ['M2E4 architecture report must be an object'];
    if (report.reportVersion !== ARCHITECTURE_REPORT_VERSION){
        violations.push(`M2E4 architecture reportVersion must be ${ARCHITECTURE_REPORT_VERSION}`);
    }

    const gateKeys = Object.keys(report.gateViolations || {}).sort();
    if (!isDeepStrictEqual(gateKeys, sortedStrings(REQUIRED_REPORT_GATES))){
        violations.push(
            `M2E4 architecture report gates must be exactly ${JSON.stringify(sortedStrings(REQUIRED_REPORT_GATES))}; ` +
            `got ${JSON.stringify(gateKeys)}`
        );
    }
    for (const violation of reportViolations(report)) violations.push(`M2E4 prerequisite gate violation: ${violation}`);

    const state = report.stateArchitecture || {};
    const ownershipRoots = domainRoots(state.ownership);
    const mutationRoots = sortedStrings(state.mutation?.writableRoots || []);
    const selectorRoots = domainRoots(state.selectors);
    if (!isDeepStrictEqual(mutationRoots, ownershipRoots)){
        violations.push(`M2E4 writable roots must exactly equal ownership domains ${JSON.stringify(ownershipRoots)}; got ${JSON.stringify(mutationRoots)}`);
    }
    if (!isDeepStrictEqual(selectorRoots, ownershipRoots)){
        violations.push(`M2E4 selector domains must exactly equal ownership domains ${JSON.stringify(ownershipRoots)}; got ${JSON.stringify(selectorRoots)}`);
    }

    const metadataRoots = sortedStrings(state.ownership?.metadataRoots || []);
    for (const rootName of metadataRoots){
        if (mutationRoots.includes(rootName)){
            violations.push(`M2E4 metadata root ${rootName} may not be runtime writable`);
        }
    }

    const owners = new Map((state.ownership?.domains || []).map(entry => [entry.root, entry.owner]));
    const scopes = state.mutation?.scopes || [];
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

function architectureScriptViolations(root){
    const violations = [];
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const architectureScript = packageJson.scripts?.['test:architecture'];
    if (typeof architectureScript !== 'string'){
        return ['M2E4 package.json must define test:architecture'];
    }
    for (const script of REQUIRED_ARCHITECTURE_SCRIPTS){
        if (!architectureScript.includes(`tests/architecture/${script}`)){
            violations.push(`M2E4 test:architecture is missing required cumulative gate ${script}`);
        }
    }
    if (packageJson.scripts?.['inspect:architecture'] !== 'node tests/architecture/architecture-report.cjs'){
        violations.push('M2E4 inspect:architecture must execute the integrated architecture report');
    }
    return violations;
}

async function scanM2StateArchitectureClosure(root){
    const report = await buildArchitectureReport(root);
    const violations = [
        ...closureViolations(report),
        ...architectureScriptViolations(root),
    ];
    return {
        summary: {
            reportVersion: report.reportVersion,
            authoritativeDomains: domainRoots(report.stateArchitecture?.ownership),
            metadataRoots: sortedStrings(report.stateArchitecture?.ownership?.metadataRoots || []),
            cumulativeGateCount: Object.keys(report.gateViolations || {}).length,
            legacyMappingCount: hasJsonMappingShape(report.legacyMappings) ? report.legacyMappings.size : 0,
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
    domainRoots,
    hasJsonMappingShape,
    closureViolations,
    architectureScriptViolations,
    scanM2StateArchitectureClosure,
    runM2StateArchitectureClosure,
};

if (require.main === module){
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
