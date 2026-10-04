'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { maskNonCode } = require('./architecture-fitness.cjs');
const { RUNTIME_STATE_CONTRACT } = require('./m2c-state-layer-contract.cjs');

const SNAPSHOT_VERSION = 2;
const RUNTIME_NAMESPACE_KEY = '$namespace';
const NESTED_SETTING_DEPTHS = Object.freeze({
    arpa: 2,
    eden: 2,
    keyMap: 2,
    msgFilters: 3,
    portal: 2,
    resBar: 2,
    space: 2,
    tau: 2,
});
const PROHIBITED_GAME_STATE_ROOTS = Object.freeze([
    'settings', 'applicationSettings', 'appSettings',
    'preferences', 'applicationPreferences', 'userPreferences',
    'control', 'applicationControl',
    'ui', 'uiState', 'uiSession',
    'derived', 'derivedState',
    'cache', 'caches', 'transient', 'transients',
    'working', 'workingState', 'simulationWorking', 'applicationWorking',
    'runtime', 'runtimeState', 'runtimeServices',
    'platform', 'platformState', 'platformServices', 'services',
    'tmp', 'tmp_vars',
    'migration', 'migrationState',
    'debug', 'debugState',
]);
const PROHIBITED_GAME_STATE_ROOT_KEYS = new Set(PROHIBITED_GAME_STATE_ROOTS.map(normalizeRootName));

function normalizeRootName(value){
    return String(value).replace(/[-_\s]/g, '').toLowerCase();
}

function sortedObject(value){
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
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
    if (quote !== "'" && quote !== '"') return null;
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
        if (ch === quote){
            return { value, end: cursor + 1 };
        }
        value += ch;
        cursor++;
    }
    return null;
}

function findClosingBracket(masked, index){
    let depth = 0;
    for (let cursor = index; cursor < masked.length; cursor++){
        if (masked[cursor] === '[') depth++;
        else if (masked[cursor] === ']'){
            depth--;
            if (depth === 0) return cursor;
        }
    }
    return -1;
}

function readStaticBracketProperty(source, masked, index){
    let cursor = skipWhitespace(source, index + 1);
    const stringValue = readQuotedString(source, cursor);
    if (stringValue){
        cursor = skipWhitespace(source, stringValue.end);
        if (source[cursor] === ']'){
            return { dynamic: false, value: stringValue.value, end: cursor + 1 };
        }
    }

    const closing = findClosingBracket(masked, index);
    return { dynamic: true, end: closing === -1 ? index + 1 : closing + 1 };
}

function readProperty(source, masked, index){
    let cursor = skipWhitespace(masked, index);
    if (masked[cursor] === '.'){
        cursor = skipWhitespace(masked, cursor + 1);
        const identifier = readIdentifier(masked, cursor);
        return identifier ? { dynamic: false, value: identifier.value, end: identifier.end } : null;
    }
    if (masked[cursor] === '['){
        return readStaticBracketProperty(source, masked, cursor);
    }
    return null;
}

function readHasOwnPropertyKey(source, masked, index){
    let cursor = skipWhitespace(masked, index);
    if (masked[cursor] !== '(') return null;
    cursor = skipWhitespace(source, cursor + 1);
    const stringValue = readQuotedString(source, cursor);
    if (!stringValue) return { dynamic: true };
    return { dynamic: false, value: stringValue.value };
}

function incrementCount(counts, key){
    counts[key] = (Object.prototype.hasOwnProperty.call(counts, key) ? counts[key] : 0) + 1;
}

function forEachSettingsRoot(source, callback){
    const masked = maskNonCode(source);
    const globalPattern = /\bglobal\b/g;
    let match;
    while ((match = globalPattern.exec(masked)) !== null){
        const settingsProperty = readProperty(source, masked, match.index + match[0].length);
        if (!settingsProperty || settingsProperty.dynamic || settingsProperty.value !== 'settings') continue;
        callback({ source, masked, settingsEnd: settingsProperty.end });
    }
}

function analyzeSettingsAccesses(source){
    const counts = Object.create(null);
    forEachSettingsRoot(source, ({ source: raw, masked, settingsEnd }) => {
        const settingProperty = readProperty(raw, masked, settingsEnd);
        if (!settingProperty){
            incrementCount(counts, '$root');
            return;
        }
        if (settingProperty.dynamic){
            incrementCount(counts, '$dynamic');
            return;
        }
        if (settingProperty.value === 'hasOwnProperty'){
            const checkedKey = readHasOwnPropertyKey(raw, masked, settingProperty.end);
            if (checkedKey){
                incrementCount(counts, checkedKey.dynamic ? '$dynamic' : checkedKey.value);
                return;
            }
        }
        incrementCount(counts, settingProperty.value);
    });
    return sortedObject(counts);
}

function analyzeNestedSettingsAccesses(source){
    const counts = Object.create(null);
    forEachSettingsRoot(source, ({ source: raw, masked, settingsEnd }) => {
        const first = readProperty(raw, masked, settingsEnd);
        if (!first || first.dynamic || first.value === 'hasOwnProperty') return;
        const maxDepth = NESTED_SETTING_DEPTHS[first.value];
        if (!maxDepth) return;

        const segments = [first.value];
        let cursor = first.end;
        while (segments.length < maxDepth){
            const next = readProperty(raw, masked, cursor);
            if (!next){
                segments.push('$root');
                break;
            }
            if (next.dynamic){
                segments.push('$dynamic');
                cursor = next.end;
                continue;
            }
            if (next.value === 'hasOwnProperty'){
                const checkedKey = readHasOwnPropertyKey(raw, masked, next.end);
                if (checkedKey){
                    segments.push(checkedKey.dynamic ? '$dynamic' : checkedKey.value);
                }
                else {
                    segments.push('hasOwnProperty');
                }
                break;
            }
            segments.push(next.value);
            cursor = next.end;
        }
        incrementCount(counts, segments.join('.'));
    });
    return sortedObject(counts);
}

function stripImportComments(value){
    return value.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n\r]*/g, ' ');
}

function importedVarsBindings(source){
    const imported = new Set();
    const namedPattern = /import\s*\{([\s\S]*?)\}\s*from\s*['"]\.\/vars(?:\.js)?['"]/g;
    let match;
    while ((match = namedPattern.exec(source)) !== null){
        const clause = stripImportComments(match[1]);
        for (const part of clause.split(',')){
            const token = part.trim();
            if (!token) continue;
            const original = token.split(/\s+as\s+/)[0].trim();
            if (original) imported.add(original);
        }
    }
    if (/import\s*\*\s*as\s+[$A-Z_a-z][$\w]*\s*from\s*['"]\.\/vars(?:\.js)?['"]/.test(source)){
        imported.add(RUNTIME_NAMESPACE_KEY);
    }
    if (/import\s+[$A-Z_a-z][$\w]*\s+from\s*['"]\.\/vars(?:\.js)?['"]/.test(source)){
        imported.add(RUNTIME_NAMESPACE_KEY);
    }
    if (/\brequire\s*\(\s*['"]\.\/vars(?:\.js)?['"]\s*\)/.test(source)){
        imported.add(RUNTIME_NAMESPACE_KEY);
    }
    if (/\bimport\s*\(\s*['"]\.\/vars(?:\.js)?['"]\s*\)/.test(source)){
        imported.add(RUNTIME_NAMESPACE_KEY);
    }
    return [...imported].sort();
}

function listLegacyRootModules(root){
    const srcRoot = path.join(root, 'src');
    return fs.readdirSync(srcRoot, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
        .map(entry => path.join(srcRoot, entry.name))
        .sort();
}

function managedRuntimeBindings(){
    return Object.keys(RUNTIME_STATE_CONTRACT).filter(name => name !== 'global').sort();
}

function buildBoundarySnapshot(root){
    const settingsAccesses = {};
    const nestedSettingsAccesses = {};
    const runtimeConsumers = Object.fromEntries(
        [...managedRuntimeBindings(), RUNTIME_NAMESPACE_KEY].sort().map(name => [name, []])
    );

    for (const file of listLegacyRootModules(root)){
        const moduleName = path.basename(file);
        const source = fs.readFileSync(file, 'utf8');
        const settingCounts = analyzeSettingsAccesses(source);
        if (Object.keys(settingCounts).length > 0) settingsAccesses[moduleName] = settingCounts;
        const nestedCounts = analyzeNestedSettingsAccesses(source);
        if (Object.keys(nestedCounts).length > 0) nestedSettingsAccesses[moduleName] = nestedCounts;

        for (const binding of importedVarsBindings(source)){
            if (Object.prototype.hasOwnProperty.call(runtimeConsumers, binding)){
                runtimeConsumers[binding].push(moduleName);
            }
        }
    }

    for (const consumers of Object.values(runtimeConsumers)) consumers.sort();

    return {
        snapshotVersion: SNAPSHOT_VERSION,
        settingsAccesses: sortedObject(settingsAccesses),
        nestedSettingsAccesses: sortedObject(nestedSettingsAccesses),
        runtimeConsumers: sortedObject(runtimeConsumers),
    };
}

function compareCountMaps(actual, expected, label, violations){
    const modules = new Set([...Object.keys(actual), ...Object.keys(expected)]);
    for (const moduleName of [...modules].sort()){
        const actualCounts = actual[moduleName] || {};
        const expectedCounts = expected[moduleName] || {};
        const keys = new Set([...Object.keys(actualCounts), ...Object.keys(expectedCounts)]);
        for (const key of [...keys].sort()){
            const actualValue = actualCounts[key] || 0;
            const expectedValue = expectedCounts[key] || 0;
            if (actualValue > expectedValue){
                violations.push(`${label} debt increased: ${moduleName} ${key} ${actualValue} > ${expectedValue}`);
            }
            else if (actualValue < expectedValue){
                violations.push(`${label} baseline must ratchet downward: ${moduleName} ${key} is now ${actualValue} < ${expectedValue}`);
            }
        }
    }
}

function compareRuntimeConsumers(actual, expected, violations){
    const actualBindings = Object.keys(actual).sort();
    const expectedBindings = Object.keys(expected).sort();
    if (JSON.stringify(actualBindings) !== JSON.stringify(expectedBindings)){
        const added = actualBindings.filter(name => !expectedBindings.includes(name));
        const removed = expectedBindings.filter(name => !actualBindings.includes(name));
        if (added.length) violations.push('M2C runtime baseline missing reviewed bindings: ' + added.join(', '));
        if (removed.length) violations.push('M2C runtime baseline contains stale bindings: ' + removed.join(', '));
    }

    for (const binding of actualBindings.filter(name => expectedBindings.includes(name))){
        const actualSet = new Set(actual[binding]);
        const expectedSet = new Set(expected[binding]);
        const addedConsumers = [...actualSet].filter(name => !expectedSet.has(name)).sort();
        const removedConsumers = [...expectedSet].filter(name => !actualSet.has(name)).sort();
        if (addedConsumers.length){
            violations.push(`M2C runtime consumer debt increased: ${binding} gained ${addedConsumers.join(', ')}`);
        }
        if (removedConsumers.length){
            violations.push(`M2C runtime consumer baseline must ratchet downward: ${binding} no longer used by ${removedConsumers.join(', ')}`);
        }
    }
}

function validateCountMap(value, label, violations){
    if (!value || typeof value !== 'object' || Array.isArray(value)){
        violations.push(`${label} must be an object`);
        return;
    }
    for (const [moduleName, counts] of Object.entries(value)){
        if (!counts || typeof counts !== 'object' || Array.isArray(counts)){
            violations.push(`${label}.${moduleName} must be an object`);
            continue;
        }
        for (const [key, count] of Object.entries(counts)){
            if (!Number.isSafeInteger(count) || count < 0){
                violations.push(`${label}.${moduleName}.${key} must be a non-negative safe integer`);
            }
        }
    }
}

function validateBoundaryBaseline(expected){
    const violations = [];
    if (!expected || typeof expected !== 'object' || Array.isArray(expected)){
        return ['M2C boundary baseline must be an object'];
    }
    if (expected.snapshotVersion !== SNAPSHOT_VERSION){
        violations.push(`M2C boundary baseline snapshotVersion must be ${SNAPSHOT_VERSION}`);
        return violations;
    }
    validateCountMap(expected.settingsAccesses, 'M2C baseline settingsAccesses', violations);
    validateCountMap(expected.nestedSettingsAccesses, 'M2C baseline nestedSettingsAccesses', violations);
    if (!expected.runtimeConsumers || typeof expected.runtimeConsumers !== 'object' || Array.isArray(expected.runtimeConsumers)){
        violations.push('M2C baseline runtimeConsumers must be an object');
    }
    else {
        for (const [binding, consumers] of Object.entries(expected.runtimeConsumers)){
            if (!Array.isArray(consumers) || consumers.some(name => typeof name !== 'string')){
                violations.push(`M2C baseline runtimeConsumers.${binding} must be an array of module names`);
                continue;
            }
            if (new Set(consumers).size !== consumers.length){
                violations.push(`M2C baseline runtimeConsumers.${binding} must not contain duplicates`);
            }
        }
    }
    return violations;
}

function parseGameStateRootFields(source){
    const match = source.match(/const\s+GAME_STATE_ROOT_FIELDS\s*=\s*Object\.freeze\s*\(\s*\[([\s\S]*?)\]\s*\)\s*;/);
    if (!match) return null;
    return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map(item => item[1]);
}

function gameStateRootViolations(root){
    const file = path.join(root, 'src', 'engine', 'state', 'game-state.mjs');
    const source = fs.readFileSync(file, 'utf8');
    const fields = parseGameStateRootFields(source);
    if (!fields) return ['M2C3 cannot inspect GAME_STATE_ROOT_FIELDS; schema boundary changed and requires review'];
    const prohibited = fields.filter(field => PROHIBITED_GAME_STATE_ROOT_KEYS.has(normalizeRootName(field)));
    return prohibited.map(field => `M2C3 forbids generic non-authoritative GameState root: ${field}`);
}

function compareBoundarySnapshot(actual, expected){
    const violations = validateBoundaryBaseline(expected);
    if (violations.length) return violations;
    compareCountMaps(actual.settingsAccesses, expected.settingsAccesses, 'M2C settings-access', violations);
    compareCountMaps(actual.nestedSettingsAccesses, expected.nestedSettingsAccesses, 'M2C nested-settings-access', violations);
    compareRuntimeConsumers(actual.runtimeConsumers, expected.runtimeConsumers, violations);
    return violations;
}

function summarizeSnapshot(snapshot){
    let settingsReferenceCount = 0;
    let dynamicSettingsSites = 0;
    const settingKeys = new Set();
    for (const counts of Object.values(snapshot.settingsAccesses)){
        for (const [key, count] of Object.entries(counts)){
            settingsReferenceCount += count;
            if (key === '$dynamic') dynamicSettingsSites += count;
            else settingKeys.add(key);
        }
    }
    let nestedSettingsReferenceCount = 0;
    const nestedSettingPaths = new Set();
    for (const counts of Object.values(snapshot.nestedSettingsAccesses)){
        for (const [key, count] of Object.entries(counts)){
            nestedSettingsReferenceCount += count;
            nestedSettingPaths.add(key);
        }
    }
    const runtimeConsumerEdges = Object.values(snapshot.runtimeConsumers).reduce((sum, consumers) => sum + consumers.length, 0);
    return {
        settingsModuleCount: Object.keys(snapshot.settingsAccesses).length,
        settingsReferenceCount,
        dynamicSettingsSites,
        reviewedSettingKeys: [...settingKeys].sort(),
        nestedSettingsModuleCount: Object.keys(snapshot.nestedSettingsAccesses).length,
        nestedSettingsReferenceCount,
        reviewedNestedSettingPaths: [...nestedSettingPaths].sort(),
        runtimeBindingCount: Object.keys(snapshot.runtimeConsumers).length - 1,
        runtimeConsumerEdges,
    };
}

function loadBoundaryBaseline(root){
    return JSON.parse(fs.readFileSync(path.join(root, 'tests', 'architecture', 'm2c-boundary-baseline.json'), 'utf8'));
}

function scanM2CBoundary(root, baseline = loadBoundaryBaseline(root)){
    const snapshot = buildBoundarySnapshot(root);
    const violations = [
        ...compareBoundarySnapshot(snapshot, baseline),
        ...gameStateRootViolations(root),
    ];
    return { snapshot, violations, summary: summarizeSnapshot(snapshot) };
}

function runM2CBoundaryCheck(root, baseline = loadBoundaryBaseline(root), logger = console){
    const result = scanM2CBoundary(root, baseline);
    logger.log('M2C3 state-boundary fitness summary:');
    logger.log(JSON.stringify(result.summary, null, 2));
    if (result.violations.length){
        logger.error('\nM2C3 state-boundary violations:');
        for (const violation of result.violations) logger.error('- ' + violation);
        logger.error('\nCurrent M2C3 baseline snapshot:');
        logger.error(JSON.stringify(result.snapshot, null, 2));
        return { exitCode: 1, result };
    }
    logger.log('\nM2C3 state-boundary fitness gate passed.');
    return { exitCode: 0, result };
}

function main(){
    const root = path.resolve(__dirname, '..', '..');
    process.exitCode = runM2CBoundaryCheck(root).exitCode;
}

module.exports = {
    SNAPSHOT_VERSION,
    RUNTIME_NAMESPACE_KEY,
    NESTED_SETTING_DEPTHS,
    PROHIBITED_GAME_STATE_ROOTS,
    analyzeSettingsAccesses,
    analyzeNestedSettingsAccesses,
    importedVarsBindings,
    buildBoundarySnapshot,
    compareBoundarySnapshot,
    validateBoundaryBaseline,
    parseGameStateRootFields,
    gameStateRootViolations,
    summarizeSnapshot,
    loadBoundaryBaseline,
    scanM2CBoundary,
    runM2CBoundaryCheck,
};

if (require.main === module){
    main();
}
