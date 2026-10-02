'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const {
    canonicalize,
    canonicalStringify
} = require('./canonical-state.cjs');
const {
    compareSnapshots
} = require('./differential-harness.cjs');

const snapshotRoot = path.join(__dirname, 'oracle-snapshots');

function serializeSnapshot(value){
    return JSON.stringify(canonicalize(value), null, 2) + '\n';
}

function fingerprintSnapshot(value){
    return crypto.createHash('sha256')
        .update(canonicalStringify(value))
        .digest('hex');
}

function resolveSnapshotPath(entry){
    if (!entry || typeof entry.snapshot !== 'string'){
        throw new Error('oracle manifest entry is missing snapshot path');
    }

    const resolved = path.resolve(__dirname, entry.snapshot);
    const relative = path.relative(snapshotRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)){
        throw new Error('oracle snapshot path escapes snapshot directory: ' + entry.snapshot);
    }
    return resolved;
}

function loadSnapshot(entry){
    return JSON.parse(fs.readFileSync(resolveSnapshotPath(entry), 'utf8'));
}

function exactSnapshotDiff(expected, actual, maxDiffs = 25){
    const found = compareSnapshots(expected, actual, {
        absTolerance: 0,
        relTolerance: 0,
        maxDiffs: maxDiffs + 1
    });

    return {
        diffs: found.slice(0, maxDiffs),
        truncated: found.length > maxDiffs
    };
}

function renderValue(value, maxLength = 400){
    const encoded = JSON.stringify(value);
    const rendered = encoded === undefined ? String(value) : encoded;
    if (rendered.length <= maxLength){
        return rendered;
    }
    return rendered.slice(0, maxLength) + '...<truncated>';
}

function formatFrozenDiffs(result){
    if (result.diffs.length === 0){
        return 'no differences';
    }

    const lines = result.diffs.map(diff => {
        const delta = Object.prototype.hasOwnProperty.call(diff, 'delta')
            ? ' delta=' + diff.delta
            : '';
        return diff.path +
            ': expected=' + renderValue(diff.expected) +
            ' actual=' + renderValue(diff.actual) +
            delta;
    });

    if (result.truncated){
        lines.push('Additional differences omitted.');
    }

    return lines.join('\n');
}

module.exports = {
    snapshotRoot,
    serializeSnapshot,
    fingerprintSnapshot,
    resolveSnapshotPath,
    loadSnapshot,
    exactSnapshotDiff,
    formatFrozenDiffs
};
