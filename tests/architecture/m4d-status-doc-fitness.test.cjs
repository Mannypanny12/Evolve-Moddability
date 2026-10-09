'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
    CLOSURE_STATUS,
    ROADMAP_COMPLETE,
    ROADMAP_NEXT,
    BACKLOG_COMPLETE,
    BACKLOG_NEXT,
    CURRENT_M4_AUTHORITY,
    STALE_IMPLEMENTATION_STATUS,
    STALE_ROADMAP_PENDING,
    STALE_M4C_AUTHORITY,
    statusDocViolations,
    findViolations,
} = require('./m4d-status-doc-fitness.cjs');

const root = path.resolve(__dirname, '../..');

function validSources(){
    return {
        roadmap: `${ROADMAP_COMPLETE}\n${ROADMAP_NEXT}`,
        backlog: `${BACKLOG_COMPLETE}\n${BACKLOG_NEXT}`,
        currentArchitecture: CURRENT_M4_AUTHORITY,
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

test('M4D status-document guard accepts the reviewed closure state', () => {
    assert.deepEqual(findViolations(root), []);
});

test('M4D status-document guard rejects stale implementation-phase lifecycle markers', () => {
    const sources = validSources();
    sources.roadmap += `\n${STALE_ROADMAP_PENDING}`;
    sources.currentArchitecture += `\n${STALE_M4C_AUTHORITY}`;
    sources.authority += `\n${STALE_IMPLEMENTATION_STATUS}`;
    const violations = statusDocViolations(
        sources.roadmap,
        sources.backlog,
        sources.currentArchitecture,
        sources.authority
    );
    assert.equal(violations.filter(value => value.includes('stale M4D lifecycle marker')).length, 3);
});

test('M4D status-document guard requires M4E to become the next roadmap and backlog slice', () => {
    const sources = validSources();
    assert.notDeepEqual(
        statusDocViolations(
            sources.roadmap.replace(ROADMAP_NEXT, '### M4E Expand later'),
            sources.backlog.replace(BACKLOG_NEXT, 'M4E later'),
            sources.currentArchitecture,
            sources.authority
        ),
        []
    );
});

test('M4D status-document guard requires the hardening findings and exact code-bearing proof', () => {
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
