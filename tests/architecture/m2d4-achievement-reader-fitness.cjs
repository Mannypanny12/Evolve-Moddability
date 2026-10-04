'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const root = path.resolve(__dirname, '..', '..');
const sourceRoot = path.join(root, 'src');
const readerPath = path.join(sourceRoot, 'legacy', 'bridge', 'achievement-state-reader.mjs');
const adapterPath = path.join(sourceRoot, 'legacy', 'bridge', 'achievement-state-adapter.mjs');

function files(directory){
    const result = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })){
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) result.push(...files(target));
        else if (entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name)) result.push(target);
    }
    return result.sort();
}

function referenceTargetsAdapter(specifier, sourcefile){
    if (!specifier || !specifier.startsWith('.')) return false;
    const target = path.resolve(path.dirname(sourcefile), specifier);
    return target === adapterPath || target + '.mjs' === adapterPath;
}

function skipWhitespace(source, index){
    while (index < source.length && /\s/.test(source[index])) index++;
    return index;
}

function readIdentifier(source, index){
    const match = source.slice(index).match(/^[$A-Z_a-z][$\w]*/);
    return match ? { value: match[0], end: index + match[0].length } : null;
}

function readQuotedString(source, index){
    const quote = source[index];
    if (quote !== "'" && quote !== '"' && quote !== '`') return null;
    let cursor = index + 1;
    let value = '';
    while (cursor < source.length){
        const ch = source[cursor];
        if (ch === '\\'){
            if (cursor + 1 >= source.length) return null;
            value += source[cursor + 1];
            cursor += 2;
            continue;
        }
        if (quote === '`' && ch === '$' && source[cursor + 1] === '{'){
            return null;
        }
        if (ch === quote){
            return { value, end: cursor + 1 };
        }
        value += ch;
        cursor++;
    }
    return null;
}

function readProperty(source, masked, index){
    let cursor = skipWhitespace(masked, index);
    let optional = false;
    if (masked[cursor] === '?' && masked[cursor + 1] === '.'){
        optional = true;
        cursor = skipWhitespace(masked, cursor + 2);
    }

    if (!optional && masked[cursor] === '.'){
        cursor = skipWhitespace(masked, cursor + 1);
        const identifier = readIdentifier(masked, cursor);
        return identifier
            ? { dynamic: false, value: identifier.value, end: identifier.end }
            : null;
    }

    if (optional && masked[cursor] !== '['){
        const identifier = readIdentifier(masked, cursor);
        return identifier
            ? { dynamic: false, value: identifier.value, end: identifier.end }
            : null;
    }

    if (masked[cursor] !== '[') return null;
    const valueStart = skipWhitespace(source, cursor + 1);
    const stringValue = readQuotedString(source, valueStart);
    if (stringValue){
        const closing = skipWhitespace(source, stringValue.end);
        if (source[closing] === ']'){
            return { dynamic: false, value: stringValue.value, end: closing + 1 };
        }
    }

    let depth = 1;
    for (let i = cursor + 1; i < masked.length; i++){
        if (masked[i] === '[') depth++;
        else if (masked[i] === ']'){
            depth--;
            if (depth === 0){
                return { dynamic: true, value: '$dynamic', end: i + 1 };
            }
        }
    }
    return null;
}

function directAchievementAccesses(source){
    const masked = maskNonCode(source);
    const accesses = [];
    const globalPattern = /\bglobal\b/g;
    let match;

    while ((match = globalPattern.exec(masked)) !== null){
        const statsProperty = readProperty(source, masked, match.index + match[0].length);
        if (!statsProperty || statsProperty.dynamic || statsProperty.value !== 'stats') continue;
        const achievementProperty = readProperty(source, masked, statsProperty.end);
        if (!achievementProperty || achievementProperty.dynamic || achievementProperty.value !== 'achieve') continue;
        accesses.push(match.index);
    }
    return accesses;
}

for (const source of [
    'global.stats.achieve',
    "global [ 'stats' ] [ \"achieve\" ]",
    'global?.stats?.achieve',
    "global?.['stats']?.[\"achieve\"]",
    'global[`stats`][`achieve`]',
]){
    if (directAchievementAccesses(source).length !== 1){
        throw new Error(`M2D4 direct-reader detector missed reviewed syntax: ${source}`);
    }
}
for (const source of [
    "'global.stats.achieve'",
    '// global[\'stats\'][\'achieve\']',
    'global.stats.other',
]){
    if (directAchievementAccesses(source).length !== 0){
        throw new Error(`M2D4 direct-reader detector produced a false positive: ${source}`);
    }
}

const violations = [];
const selectBypasses = [];
for (const file of files(sourceRoot)){
    const source = fs.readFileSync(file, 'utf8');
    if (file !== path.join(sourceRoot, 'vars.js') && directAchievementAccesses(source).length){
        violations.push(path.relative(root, file).split(path.sep).join('/'));
    }
    if (file !== readerPath && file !== adapterPath && /\bselectLegacyAchievementState\b/.test(maskNonCode(source))){
        selectBypasses.push(path.relative(root, file).split(path.sep).join('/'));
    }
}
if (violations.length){
    throw new Error('M2D4 forbids ordinary direct global.stats.achieve readers outside vars.js: ' + JSON.stringify(violations));
}
if (selectBypasses.length){
    throw new Error('M2D4 ordinary source must not bypass the achievement reader facade through selectLegacyAchievementState: ' + JSON.stringify(selectBypasses));
}

const reader = fs.readFileSync(readerPath, 'utf8');
const readerCode = maskNonCode(reader);
let readerModuleReferences;
try {
    readerModuleReferences = extractModuleReferences(reader, readerPath);
}
catch (error){
    throw new Error(`M2D4 cannot inspect reader module references: ${error.message}`);
}
const readerAdapterReferences = readerModuleReferences.filter(reference =>
    referenceTargetsAdapter(reference.specifier, readerPath)
);
if (
    readerAdapterReferences.length !== 1
    || readerAdapterReferences[0].specifier !== './achievement-state-adapter.mjs'
){
    throw new Error(
        'M2D4 reader must have exactly one canonical reference to the achievement adapter; found ' +
        JSON.stringify(readerAdapterReferences)
    );
}
const adapterImports = [...reader.matchAll(/\bimport\s+([^;]+?)\s+from\s+['"]\.\/achievement-state-adapter\.mjs['"]\s*;/g)]
    .map(match => match[1].replace(/\s+/g, ' ').trim());
if (adapterImports.length !== 1 || adapterImports[0] !== '{ selectLegacyAchievementState }'){
    throw new Error('M2D4 reader may import only selectLegacyAchievementState from the achievement adapter.');
}
for (const forbidden of [
    'achievementStateSnapshot',
    'advanceLegacyAchievement',
    'bindLegacyAchievementState',
    'removeLegacyAchievementUniverseRank',
]){
    if (new RegExp(`\\b${forbidden}\\b`).test(readerCode)){
        throw new Error(`M2D4 reader facade must remain read-only and may not reference ${forbidden}.`);
    }
}
const readerExports = [...readerCode.matchAll(/\bexport\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g)]
    .map(match => match[1])
    .sort();
const readerExportKeywordCount = [...readerCode.matchAll(/\bexport\b/g)].length;
if (readerExportKeywordCount !== readerExports.length){
    throw new Error(
        'M2D4 reader may export only the reviewed named function facade; ' +
        `found ${readerExportKeywordCount} export declarations but ${readerExports.length} reviewed function exports.`
    );
}
const expectedReaderExports = [
    'hasLegacyAchievement',
    'hasLegacyAchievementTrack',
    'legacyAchievementLevel',
    'legacyAchievementRank',
    'legacyAchievementTotalRank',
    'legacyAchievementUniverseLevel',
].sort();
if (JSON.stringify(readerExports) !== JSON.stringify(expectedReaderExports)){
    throw new Error(
        'M2D4 reader facade surface changed: ' + JSON.stringify(readerExports) +
        '; expected only ' + JSON.stringify(expectedReaderExports)
    );
}

const adapter = fs.readFileSync(adapterPath, 'utf8');
if (!adapter.includes('return requireBinding().runtime.store.select(selector, ...args);')){
    throw new Error('M2D4 adapter read seam must delegate directly to store.select().');
}
const selectors = fs.readFileSync(path.join(sourceRoot, 'engine', 'state', 'achievement-selectors.mjs'), 'utf8');
if (!selectors.includes('export function hasAchievementUniverseRank')){
    throw new Error('M2D4 requires explicit universe-track presence semantics.');
}

console.log('M2D4 achievement reader fitness checks passed.');
