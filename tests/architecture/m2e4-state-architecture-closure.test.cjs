'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    EXPECTED_ARCHITECTURE_SCRIPT,
    EXPECTED_INSPECT_SCRIPT,
    REQUIRED_CI_RUN_COMMANDS,
    closureViolations,
    architectureScriptContractViolations,
    architectureScriptViolations,
    ciWorkflowContractViolations,
    ciWorkflowViolations,
    sourceSymlinkViolations,
    scanM2StateArchitectureClosure,
} = require('./m2e4-state-architecture-closure.cjs');

const root = path.resolve(__dirname, '..', '..');
let closurePromise;

function actualClosure(){
    if (!closurePromise) closurePromise = scanM2StateArchitectureClosure(root);
    return closurePromise;
}

function clone(value){
    return JSON.parse(JSON.stringify(value));
}

async function clonedReport(){
    return clone((await actualClosure()).report);
}

test('M2E4 closure accepts the actual integrated M2 architecture', async () => {
    const result = await actualClosure();
    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.summary.authoritativeDomains, ['achievements']);
    assert.deepEqual(result.summary.metadataRoots, ['schemaVersion']);
    assert.equal(result.summary.requiredM2GateCount, 13);
    assert.equal(result.summary.cumulativeGateCount >= result.summary.requiredM2GateCount, true);
    assert.equal(result.summary.legacyMappingCount, 2);
    assert.equal(result.summary.sourceSymlinkViolationCount, 0);
});

test('M2E4 closure fails if a required M2 report gate disappears', async () => {
    const report = await clonedReport();
    delete report.gateViolations.selectorReview;
    assert.match(closureViolations(report).join('\n'), /missing required M2 gates/);
});

test('M2E4 closure remains valid when later milestones extend the architecture report', async () => {
    const report = await clonedReport();
    report.gateViolations.m3aCommandBus = [];
    assert.deepEqual(closureViolations(report), []);
});

test('M2E4 closure fails if writable roots drift from authoritative ownership', async () => {
    const report = await clonedReport();
    report.stateArchitecture.mutation.writableRoots = [];
    assert.match(closureViolations(report).join('\n'), /writable roots must exactly equal ownership domains/);
});

test('M2E4 closure fails if reviewed mutation surfaces drift from authoritative ownership', async () => {
    const report = await clonedReport();
    report.stateArchitecture.mutationReview.reviewedSurfaces = [];
    assert.match(closureViolations(report).join('\n'), /reviewed mutation surfaces must exactly equal ownership domains/);
});

test('M2E4 closure fails if selector domains drift from authoritative ownership', async () => {
    const report = await clonedReport();
    report.stateArchitecture.selectors.domains = [];
    assert.match(closureViolations(report).join('\n'), /selector domains must exactly equal ownership domains/);
});

test('M2E4 closure cross-checks summary counts against the authoritative domain set', async () => {
    const report = await clonedReport();
    report.stateArchitecture.mutation.domainCount = 99;
    report.stateArchitecture.ownership.rootCount = 99;
    const violations = closureViolations(report).join('\n');
    assert.match(violations, /mutation domainCount must equal authoritative domain count/);
    assert.match(violations, /ownership rootCount must equal metadata plus authoritative roots/);
});

test('M2E4 closure requires non-empty reviewed read and mutation surfaces', async () => {
    const report = await clonedReport();
    report.stateArchitecture.selectors.domains[0].selectorCount = 0;
    report.stateArchitecture.mutationReview.reviewedSurfaces[0].publicMethods = [];
    const violations = closureViolations(report).join('\n');
    assert.match(violations, /must expose at least one reviewed semantic selector/);
    assert.match(violations, /must expose at least one reviewed semantic mutation method/);
});

test('M2E4 closure fails if mutation scope ownership no longer matches domain ownership', async () => {
    const report = await clonedReport();
    report.stateArchitecture.mutation.scopes[0].id = 'wrong-owner';
    assert.match(closureViolations(report).join('\n'), /must have exactly one mutation scope owned by/);
});

test('M2E4 closure fails if GameState metadata becomes writable', async () => {
    const report = await clonedReport();
    report.stateArchitecture.mutation.writableRoots.push('schemaVersion');
    assert.match(closureViolations(report).join('\n'), /metadata root schemaVersion may not be runtime writable/);
});

test('M2E4 closure fails if either achievement authority migration gate is absent or failing', async () => {
    const report = await clonedReport();
    report.stateArchitecture.migration.gates.achievementReaders.passed = false;
    assert.match(closureViolations(report).join('\n'), /migration gate achievementReaders must be present and passing/);
});

test('M2E4 closure fails if the legacy mapping inspector shape becomes opaque or incomplete', async () => {
    const report = await clonedReport();
    report.legacyMappings = {};
    assert.match(closureViolations(report).join('\n'), /legacyMappings must preserve the reviewed JSON-safe/);
});

test('M2E4 package architecture chain preserves every M0-M2 gate exactly once and in order', () => {
    assert.deepEqual(architectureScriptViolations(root), []);
    assert.deepEqual(architectureScriptContractViolations(EXPECTED_ARCHITECTURE_SCRIPT, EXPECTED_INSPECT_SCRIPT), []);

    const futureExtended = [
        'node tests/architecture/future-precheck.cjs',
        EXPECTED_ARCHITECTURE_SCRIPT,
        'node tests/architecture/m3a-command-bus-fitness.cjs',
    ].join(' && ');
    assert.deepEqual(
        architectureScriptContractViolations(futureExtended, EXPECTED_INSPECT_SCRIPT),
        [],
        'later milestone gates may extend the cumulative architecture chain without reopening M2'
    );

    assert.match(
        architectureScriptContractViolations(
            `${EXPECTED_ARCHITECTURE_SCRIPT} && node tests/architecture/architecture-fitness.cjs`,
            EXPECTED_INSPECT_SCRIPT
        ).join('\n'),
        /must appear exactly once/
    );

    const reordered = EXPECTED_ARCHITECTURE_SCRIPT.replace(
        'node tests/architecture/architecture-fitness.cjs && node tests/architecture/platform-fitness.cjs',
        'node tests/architecture/platform-fitness.cjs && node tests/architecture/architecture-fitness.cjs'
    );
    assert.match(
        architectureScriptContractViolations(reordered, EXPECTED_INSPECT_SCRIPT).join('\n'),
        /must remain in their reviewed relative order/
    );

    const bypassed = EXPECTED_ARCHITECTURE_SCRIPT.replace(
        'node tests/architecture/m2e4-state-architecture-closure.cjs',
        'node tests/architecture/m2e4-state-architecture-closure.cjs || true'
    );
    assert.match(
        architectureScriptContractViolations(bypassed, EXPECTED_INSPECT_SCRIPT).join('\n'),
        /must appear exactly once/
    );

    assert.match(
        architectureScriptContractViolations(EXPECTED_ARCHITECTURE_SCRIPT, 'node other-report.cjs').join('\n'),
        /integrated architecture report exactly/
    );
});

test('M2E4 closure pins the CI workflow to the tested architecture/build/browser path', () => {
    assert.deepEqual(ciWorkflowViolations(root), []);

    const reviewed = REQUIRED_CI_RUN_COMMANDS.map(command => `      - name: ${command}\n        run: ${command}`).join('\n');
    assert.deepEqual(ciWorkflowContractViolations(reviewed), []);

    assert.match(
        ciWorkflowContractViolations(reviewed.replace('run: npm run test:architecture', 'run: echo skipped')).join('\n'),
        /npm run test:architecture/
    );

    const reordered = reviewed.replace(
        'run: npm test',
        'run: __TEMP__'
    ).replace(
        'run: npm run build',
        'run: npm test'
    ).replace(
        'run: __TEMP__',
        'run: npm run build'
    );
    assert.match(ciWorkflowContractViolations(reordered).join('\n'), /reviewed order/);
});

test('M2E4 closure rejects source symlinks that could escape production-module enumeration', t => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'm2e4-source-symlink-'));
    try {
        const src = path.join(temp, 'src');
        fs.mkdirSync(src, { recursive: true });
        const real = path.join(src, 'real.mjs');
        fs.writeFileSync(real, 'export const value = true;\n');
        try {
            fs.symlinkSync('real.mjs', path.join(src, 'alias.mjs'));
        }
        catch (error){
            t.skip(`host cannot create symlinks: ${error.code || error.message}`);
            return;
        }

        assert.match(
            sourceSymlinkViolations(temp).join('\n'),
            /production source module symlinks are forbidden/
        );
    }
    finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
});
