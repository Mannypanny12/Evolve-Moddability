'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
    CLOSED_ACTIONS_GLOBAL_BUDGET,
    PRE_CUTOVER_ACTIONS_GLOBAL_BUDGET,
    REQUIRED_MAPPING_REMOVAL,
    REQUIRED_MAPPINGS,
    REQUIRED_ARCHITECTURE_COMMANDS,
    REQUIRED_BROWSER_COMMANDS,
    orderedCommandViolations,
    legacyRatchetViolations,
    mappingLifecycleViolations,
    prerequisiteViolations,
    scanM3FCutoverClosure,
} = require('./m3f4-cutover-closure.cjs');

const root = path.resolve(__dirname, '../..');

function chain(commands){
    return commands.join(' && ');
}

function mappingInspection(overrides = {}){
    return {
        mappings: REQUIRED_MAPPINGS.map(required => ({
            id: required.id,
            canonicalIds: [required.canonicalId],
            removeBy: REQUIRED_MAPPING_REMOVAL,
            stateSemantics: 'Bounded condition reads and atomic resource settlement for the reviewed M3F vertical.',
            ...overrides[required.id],
        })),
    };
}

test('M3F4 complete DNA cutover passes the cumulative closure gate', async () => {
    const result = await scanM3FCutoverClosure(root);
    assert.deepEqual(result.violations, []);
    assert.equal(result.summary.actionsGlobalBudget <= CLOSED_ACTIONS_GLOBAL_BUDGET, true);
    assert.equal(result.summary.preCutoverActionsGlobalBudget, PRE_CUTOVER_ACTIONS_GLOBAL_BUDGET);
    assert.equal(result.summary.mappingRemovalMilestone, 'M6B');
});

test('M3F4 closure rejects loss or reordering of reviewed architecture gates', () => {
    const missing = orderedCommandViolations(
        chain(REQUIRED_ARCHITECTURE_COMMANDS.filter(command => !command.includes('m3f2-dna-command'))),
        REQUIRED_ARCHITECTURE_COMMANDS,
        'test:architecture'
    );
    assert.ok(missing.some(violation => violation.includes('m3f2-dna-command-fitness.cjs')));

    const reorderedCommands = [...REQUIRED_ARCHITECTURE_COMMANDS];
    [reorderedCommands[1], reorderedCommands[2]] = [reorderedCommands[2], reorderedCommands[1]];
    const reordered = orderedCommandViolations(
        chain(reorderedCommands),
        REQUIRED_ARCHITECTURE_COMMANDS,
        'test:architecture'
    );
    assert.ok(reordered.some(violation => violation.includes('reviewed cutover command order')));
});

test('M3F4 closure rejects removal of the real-browser DNA proof', () => {
    const violations = orderedCommandViolations(
        chain(REQUIRED_BROWSER_COMMANDS.filter(command => !command.includes('m3f4-dna-cutover-smoke.cjs'))),
        REQUIRED_BROWSER_COMMANDS,
        'test:browser'
    );
    assert.ok(violations.some(violation => violation.includes('m3f4-dna-cutover-smoke.cjs')));
});

test('M3F4 closure locks in the downward actions.js global-access ratchet', () => {
    const stale = {
        legacyModules: {
            'actions.js': { global: PRE_CUTOVER_ACTIONS_GLOBAL_BUDGET },
        },
    };
    const violations = legacyRatchetViolations(stale, []);
    assert.ok(violations.some(violation => violation.includes('2664 or lower')));
    assert.ok(violations.some(violation => violation.includes('strict actions.js global-access reduction')));
});

test('M3F4 closure rejects legacy RNA/DNA mappings that lose their M6B expiry or settlement role', () => {
    const wrongRemoval = mappingInspection({
        'evolve.resource.rna_state': { removeBy: 'M9C' },
    });
    const removalViolations = mappingLifecycleViolations(wrongRemoval);
    assert.ok(removalViolations.some(violation => violation.includes('evolve.resource.rna_state') && violation.includes('M6B')));

    const staleSemantics = mappingInspection({
        'evolve.resource.dna_state': { stateSemantics: 'Bounded condition compatibility only.' },
    });
    const semanticViolations = mappingLifecycleViolations(staleSemantics);
    assert.ok(semanticViolations.some(violation => violation.includes('evolve.resource.dna_state') && violation.includes('settlement')));
});

test('M3F4 closure fails if any reviewed prerequisite gate regresses', () => {
    const violations = prerequisiteViolations({
        m3f1: ['synthetic resource-commit regression'],
        m3f2: ['synthetic command regression'],
    });
    assert.equal(violations.length, 2);
    assert.ok(violations[0].includes('M3F1 prerequisite'));
    assert.ok(violations[1].includes('M3F2 prerequisite'));
});
