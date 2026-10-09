'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
    CLOSURE_STATUS,
    ROADMAP_COMPLETE,
    ROADMAP_IN_PROGRESS,
    BACKLOG_COMPLETE,
    BACKLOG_IN_PROGRESS,
    CURRENT_M4_AUTHORITY,
    CURRENT_M4E1_ROOT,
    STALE_IMPLEMENTATION_STATUS,
    STALE_ROADMAP_PENDING,
    STALE_ROADMAP_NEXT,
    STALE_BACKLOG_NEXT,
    STALE_M4C_AUTHORITY,
    STALE_M4D_AUTHORITY,
    statusDocViolations,
    findViolations,
} = require('./m4d-status-doc-fitness.cjs');

const root = path.resolve(__dirname, '../..');

function validSources(){
    return {
        roadmap: `${ROADMAP_COMPLETE}\n${ROADMAP_IN_PROGRESS}`,
        backlog: `${BACKLOG_COMPLETE}\n${BACKLOG_IN_PROGRESS}`,
        currentArchitecture: `${CURRENT_M4_AUTHORITY}\n${CURRENT_M4E1_ROOT}`,
        authority: [
            '# M4D Oil Well production cutover',
            CLOSURE_STATUS,
            '`evolve:calculation/production/oil-well`',
            '`src/application/evolve/oil-well-production-runtime.mjs`',
            '`src/prod.js` remains the compatibility seam for this slice.',
            'The legacy multiplication order is preserved exactly:',
            'M4D does not migrate `oil_extractor`',
            'The old embedded Oil-Well arithmetic has been removed from the live branch.',
            'ratchets `src/prod.js` direct `global` access from 113 to 109',
            '## Independent review and hardening',
            '**Biome absence became explicit.**',
            '**Runtime-consumer enforcement was closed against alternate import spellings.**',
            '**The real legacy composition seam is now executed.**',
            '**Exact floating-point proof was tightened.**',
            '**Hidden runtime capability bypasses are now blocked.**',
            '19b361962adb437f9d4662a24d4545890b893321',
            'workflow run 1330',
            'M4D is complete.',
            'M4E is next.',
        ].join('\n'),
    };
}

test('M4D/M4E status-document guard accepts M4D closure with M4E in progress', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M4D/M4E status-document guard rejects stale lifecycle and current-authority markers', () => {
    const sources = validSources();
    sources.roadmap += `\n${STALE_ROADMAP_PENDING}\n${STALE_ROADMAP_NEXT}`;
    sources.backlog += `\n${STALE_BACKLOG_NEXT}`;
    sources.currentArchitecture += `\n${STALE_M4C_AUTHORITY}\n${STALE_M4D_AUTHORITY}`;
    sources.authority += `\n${STALE_IMPLEMENTATION_STATUS}`;
    const violations = statusDocViolations(
        sources.roadmap,
        sources.backlog,
        sources.currentArchitecture,
        sources.authority
    );
    assert.equal(violations.filter(value => value.includes('stale M4 lifecycle marker')).length, 6);
});

test('M4D/M4E status-document guard requires M4E to be in progress and the shared runtime to be current authority', () => {
    const sources = validSources();
    assert.notDeepEqual(
        statusDocViolations(
            sources.roadmap.replace(ROADMAP_IN_PROGRESS, '### M4E Expand later'),
            sources.backlog.replace(BACKLOG_IN_PROGRESS, 'M4E later'),
            sources.currentArchitecture.replace(CURRENT_M4E1_ROOT, 'shared runtime omitted'),
            sources.authority
        ),
        []
    );
});

test('M4D status-document guard still requires its historical hardening findings and exact code-bearing proof', () => {
    const sources = validSources();
    const missingHardening = sources.authority.replace('**Hidden runtime capability bypasses are now blocked.**', 'Ambient capability guard omitted.');
    assert.notDeepEqual(
        statusDocViolations(sources.roadmap, sources.backlog, sources.currentArchitecture, missingHardening),
        []
    );

    const missingProof = sources.authority.replace('workflow run 1330', 'workflow proof pending');
    assert.notDeepEqual(
        statusDocViolations(sources.roadmap, sources.backlog, sources.currentArchitecture, missingProof),
        []
    );
});
