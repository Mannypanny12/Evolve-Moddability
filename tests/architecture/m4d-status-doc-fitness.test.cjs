'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
    IMPLEMENTATION_STATUS,
    ROADMAP_PENDING,
    BACKLOG_PENDING,
    CURRENT_M4_AUTHORITY,
    PREMATURE_ROADMAP_CLOSURE,
    statusDocViolations,
    findViolations,
} = require('./m4d-status-doc-fitness.cjs');

const root = path.resolve(__dirname, '../..');

function validSources(){
    return {
        roadmap: ROADMAP_PENDING,
        backlog: BACKLOG_PENDING,
        currentArchitecture: CURRENT_M4_AUTHORITY,
        authority: [
            '# M4D Oil Well production cutover',
            IMPLEMENTATION_STATUS,
            '`evolve:calculation/production/oil-well`',
            '`src/application/evolve/oil-well-production-runtime.mjs`',
            '`src/prod.js` remains the compatibility seam for this slice.',
            'The legacy multiplication order is preserved exactly:',
            'M4D does not migrate `oil_extractor`',
            'M4E is not started by this slice.',
            'The old embedded Oil-Well arithmetic has been removed from the live branch.',
            'ratchets `src/prod.js` direct `global` access from 113 to 109',
            'This document records the implementation candidate only. It does not declare M4D closed.',
            'The next lifecycle step is an independent review and hardening pass',
        ].join('\n'),
    };
}

test('M4D status-document guard accepts the implementation candidate without promoting closure', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M4D status-document guard rejects premature roadmap closure', () => {
    const sources = validSources();
    sources.roadmap = `${ROADMAP_PENDING}\n${PREMATURE_ROADMAP_CLOSURE}`;
    assert.equal(
        statusDocViolations(sources.roadmap, sources.backlog, sources.currentArchitecture, sources.authority)
            .some(value => value.includes('premature M4D closure')),
        true
    );
});

test('M4D status-document guard requires M4C to remain current authority during implementation phase', () => {
    const sources = validSources();
    assert.notDeepEqual(
        statusDocViolations(sources.roadmap, sources.backlog, 'M4D is current.', sources.authority),
        []
    );
});

test('M4D status-document guard requires the independent-review handoff and scope exclusions', () => {
    const sources = validSources();
    const missingReview = sources.authority.replace('The next lifecycle step is an independent review and hardening pass', 'Review later.');
    assert.notDeepEqual(
        statusDocViolations(sources.roadmap, sources.backlog, sources.currentArchitecture, missingReview),
        []
    );

    const widenedScope = sources.authority.replace('M4D does not migrate `oil_extractor`', 'M4D also migrates `oil_extractor`');
    assert.notDeepEqual(
        statusDocViolations(sources.roadmap, sources.backlog, sources.currentArchitecture, widenedScope),
        []
    );
});
