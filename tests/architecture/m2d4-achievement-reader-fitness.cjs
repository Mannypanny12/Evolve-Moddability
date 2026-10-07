'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const READER_RELATIVE_PATH = 'src/legacy/bridge/achievement-state-reader.mjs';
const ADAPTER_RELATIVE_PATH = 'src/legacy/bridge/achievement-state-adapter.mjs';
const EXPECTED_READER_EXPORTS = Object.freeze([
    'hasLegacyAchievement',
    'hasLegacyAchievementTrack',
    'legacyAchievementLevel',
    'legacyAchievementRank',
    'legacyAchievementTotalRank',
    'legacyAchievementUniverseLevel',
].sort());

function files(directory){
    const result = [];
    if (!fs.existsSync(directory)) return result;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })){
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) result.push(...files(target));
        else if (entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name)) result.push(target);
    }
    return result.sort();
}

function referenceTargetsAdapter(specifier, sourcefile, adapterPath){
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
        if (quote === '`' && ch === '$' && source[cursor + 1] === '{') return null;
        if (ch === quote) return { value, end: cursor + 1 };
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
        return identifier ? { dynamic: false, value: identifier.value, end: identifier.end } : null;
    }

    if (optional && masked[cursor] !== '['){
        const identifier = readIdentifier(masked, cursor);
        return identifier ? { dynamic: false, value: identifier.value, end: identifier.end } : null;
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
            if (depth === 0) return { dynamic: true, value: '$dynamic', end: i + 1 };
        }
    }
    return null;
}

function simpleGlobalAliases(masked){
    const aliases = new Set();
    for (const match of masked.matchAll(/\bglobal\s+as\s+([$A-Z_a-z][$\w]*)/g)) aliases.add(match[1]);
    for (const match of masked.matchAll(/\b(?:const|let|var)\s+([$A-Z_a-z][$\w]*)\s*=\s*\(*\s*global\s*\)*\s*(?=;|,|\n|\r|$)/g)){
        aliases.add(match[1]);
    }
    for (const match of masked.matchAll(/(?:^|[;{}\n])\s*([$A-Z_a-z][$\w]*)\s*=\s*\(*\s*global\s*\)*\s*(?=;|\n|\r|$)/gm)){
        aliases.add(match[1]);
    }
    return [...aliases].sort();
}

function achievementAccessesForRoot(source, masked, rootName){
    const accesses = [];
    const escaped = rootName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rootPattern = new RegExp(`\\b${escaped}\\b`, 'g');
    let match;
    while ((match = rootPattern.exec(masked)) !== null){
        const statsProperty = readProperty(source, masked, match.index + match[0].length);
        if (!statsProperty || statsProperty.dynamic || statsProperty.value !== 'stats') continue;
        const achievementProperty = readProperty(source, masked, statsProperty.end);
        if (!achievementProperty || achievementProperty.dynamic || achievementProperty.value !== 'achieve') continue;
        accesses.push(match.index);
    }
    return accesses;
}

function directAchievementAccesses(source){
    const masked = maskNonCode(source);
    const roots = ['global', ...simpleGlobalAliases(masked)];
    return roots.flatMap(rootName => achievementAccessesForRoot(source, masked, rootName));
}

function scanAchievementReaders(root){
    const violations = [];
    const sourceRoot = path.join(root, 'src');
    const readerPath = path.join(root, ...READER_RELATIVE_PATH.split('/'));
    const adapterPath = path.join(root, ...ADAPTER_RELATIVE_PATH.split('/'));

    function add(message){
        violations.push(message);
    }

    for (const source of [
        'global.stats.achieve',
        "global [ 'stats' ] [ \"achieve\" ]",
        'global?.stats?.achieve',
        "global?.['stats']?.[\"achieve\"]",
        'global[`stats`][`achieve`]',
        'const legacyRoot = global; legacyRoot.stats.achieve',
        "import { global as legacyRoot } from './../vars.js'; legacyRoot?.stats?.achieve",
    ]){
        if (directAchievementAccesses(source).length !== 1){
            add(`M2D4 direct-reader detector missed reviewed syntax: ${source}`);
        }
    }
    for (const source of [
        "'global.stats.achieve'",
        '// global[\'stats\'][\'achieve\']',
        'global.stats.other',
        'const legacyRoot = global.tech; legacyRoot.stats.achieve',
    ]){
        if (directAchievementAccesses(source).length !== 0){
            add(`M2D4 direct-reader detector produced a false positive: ${source}`);
        }
    }

    const directReaders = [];
    const selectBypasses = [];
    for (const file of files(sourceRoot)){
        const source = fs.readFileSync(file, 'utf8');
        if (file !== path.join(sourceRoot, 'vars.js') && directAchievementAccesses(source).length){
            directReaders.push(path.relative(root, file).split(path.sep).join('/'));
        }
        if (file !== readerPath && file !== adapterPath && /\bselectLegacyAchievementState\b/.test(maskNonCode(source))){
            selectBypasses.push(path.relative(root, file).split(path.sep).join('/'));
        }
    }
    if (directReaders.length){
        add('M2D4 forbids ordinary direct global.stats.achieve readers outside vars.js: ' + JSON.stringify(directReaders));
    }
    if (selectBypasses.length){
        add(
            'M2D4 ordinary source must not bypass the achievement reader facade through selectLegacyAchievementState: ' +
            JSON.stringify(selectBypasses)
        );
    }

    let reader = '';
    try {
        reader = fs.readFileSync(readerPath, 'utf8');
    }
    catch (error){
        add(`M2D4 could not read ${READER_RELATIVE_PATH}: ${error.message}`);
    }
    const readerCode = maskNonCode(reader);
    let readerModuleReferences = [];
    try {
        readerModuleReferences = extractModuleReferences(reader, readerPath);
    }
    catch (error){
        add(`M2D4 cannot inspect reader module references: ${error.message}`);
    }
    const readerAdapterReferences = readerModuleReferences.filter(reference =>
        referenceTargetsAdapter(reference.specifier, readerPath, adapterPath)
    );
    if (
        readerAdapterReferences.length !== 1
        || readerAdapterReferences[0].specifier !== './achievement-state-adapter.mjs'
    ){
        add(
            'M2D4 reader must have exactly one canonical reference to the achievement adapter; found ' +
            JSON.stringify(readerAdapterReferences)
        );
    }

    const adapterImports = [...reader.matchAll(/\bimport\s+([^;]+?)\s+from\s+['"]\.\/achievement-state-adapter\.mjs['"]\s*;/g)]
        .map(match => match[1].replace(/\s+/g, ' ').trim());
    if (adapterImports.length !== 1 || adapterImports[0] !== '{ selectLegacyAchievementState }'){
        add('M2D4 reader may import only selectLegacyAchievementState from the achievement adapter.');
    }

    for (const forbidden of [
        'achievementStateSnapshot',
        'advanceLegacyAchievement',
        'bindLegacyAchievementState',
        'removeLegacyAchievementUniverseRank',
    ]){
        if (new RegExp(`\\b${forbidden}\\b`).test(readerCode)){
            add(`M2D4 reader facade must remain read-only and may not reference ${forbidden}.`);
        }
    }

    const readerExports = [...readerCode.matchAll(/\bexport\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g)]
        .map(match => match[1])
        .sort();
    const readerExportKeywordCount = [...readerCode.matchAll(/\bexport\b/g)].length;
    if (readerExportKeywordCount !== readerExports.length){
        add(
            'M2D4 reader may export only the reviewed named function facade; ' +
            `found ${readerExportKeywordCount} export declarations but ${readerExports.length} reviewed function exports.`
        );
    }
    if (JSON.stringify(readerExports) !== JSON.stringify(EXPECTED_READER_EXPORTS)){
        add(
            'M2D4 reader facade surface changed: ' + JSON.stringify(readerExports) +
            '; expected only ' + JSON.stringify(EXPECTED_READER_EXPORTS)
        );
    }

    let adapter = '';
    try {
        adapter = fs.readFileSync(adapterPath, 'utf8');
    }
    catch (error){
        add(`M2D4 could not read ${ADAPTER_RELATIVE_PATH}: ${error.message}`);
    }
    if (!adapter.includes('return requireBinding().runtime.store.select(selector, ...args);')){
        add('M2D4 adapter read seam must delegate directly to store.select().');
    }

    const selectorPath = path.join(sourceRoot, 'engine', 'state', 'achievement-selectors.mjs');
    let selectors = '';
    try {
        selectors = fs.readFileSync(selectorPath, 'utf8');
    }
    catch (error){
        add(`M2D4 could not read achievement selectors: ${error.message}`);
    }
    if (!selectors.includes('export function hasAchievementUniverseRank')){
        add('M2D4 requires explicit universe-track presence semantics.');
    }

    return {
        summary: {
            reader: READER_RELATIVE_PATH,
            readerExports,
            readerExportCount: readerExports.length,
            directReaderCount: directReaders.length,
            selectBypassCount: selectBypasses.length,
            passed: violations.length === 0,
        },
        violations: [...new Set(violations)].sort(),
    };
}

function runAchievementReaderCheck(root, logger = console){
    const result = scanAchievementReaders(root);
    if (result.violations.length){
        logger.error('M2D4 achievement reader fitness violations:');
        for (const violation of result.violations) logger.error('- ' + violation);
        return { exitCode: 1, result };
    }
    logger.log('M2D4 achievement reader fitness checks passed.');
    return { exitCode: 0, result };
}

function main(){
    const root = path.resolve(__dirname, '..', '..');
    process.exitCode = runAchievementReaderCheck(root).exitCode;
}

module.exports = {
    READER_RELATIVE_PATH,
    ADAPTER_RELATIVE_PATH,
    EXPECTED_READER_EXPORTS,
    files,
    directAchievementAccesses,
    referenceTargetsAdapter,
    scanAchievementReaders,
    runAchievementReaderCheck,
};

if (require.main === module){
    main();
}
