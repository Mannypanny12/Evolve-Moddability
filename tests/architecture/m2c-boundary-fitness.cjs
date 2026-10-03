'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { maskNonCode } = require('./architecture-fitness.cjs');
const { RUNTIME_STATE_CONTRACT } = require('./m2c-state-layer-contract.cjs');

const SNAPSHOT_VERSION = 1;
const RUNTIME_NAMESPACE_KEY = '$namespace';
const PROHIBITED_GAME_STATE_ROOTS = Object.freeze([
    'settings', 'preferences', 'ui', 'uiState', 'cache', 'caches', 'transient', 'transients',
    'runtime', 'tmp', 'tmp_vars', 'migration', 'debug',
]);

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

function readStaticBracketProperty(source, masked, index){
    let cursor = skipWhitespace(source, index + 1);
    const stringValue = readQuotedString(source, cursor);
    if (!stringValue) return { dynamic: true, end: index + 1 };
    cursor = skipWhitespace(source, stringValue.end);
    if (source[cursor] !== ']') return { dynamic: true, end: cursor };
    return { dynamic: false, value: stringValue.value, end: cursor + 1 };
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

function analyzeSettingsAccesses(source){
    const masked = maskNonCode(source);
    const counts = Object.create(null);
    const globalPattern = /\bglobal\b/g;
    let match;

    while ((match = globalPattern.exec(masked)) !== null){
        const settingsProperty = readProperty(source, masked, match.index + match[0].length);
        if (!settingsProperty || settingsProperty.dynamic || settingsProperty.value !== 'settings') continue;

        const settingProperty = readProperty(source, masked, settingsProperty.end);
        if (!settingProperty){
            incrementCount(counts, '$root');
            continue;
        }
        if (settingProperty.dynamic){
            incrementCount(counts, '$dynamic');
            continue;
        }
        if (settingProperty.value === 'hasOwnProperty'){
            const checkedKey = readHasOwnPropertyKey(source, masked, settingProperty.end);
            if (checkedKey){
                if (checkedKey.dynamic){
                    incrementCount(counts, '$dynamic');
                }
                else {
                    incrementCount(counts, checkedKey.value);
                }
                continue;
            }
        }
        incrementCount(counts, settingProperty.value);
    }

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
    const runtimeConsumers = Object.fromEntries(
        [...managedRuntimeBindings(), RUNTIME_NAMESPACE_KEY].sort().map(name => [name, []])
    );

    for (const file of listLegacyRootModules(root)){
        const moduleName = path.basename(file);
        const source = fs.readFileSync(file, 'utf8');
        const settingCounts = analyzeSettingsAccesses(source);
        if (Object.keys(settingCounts).length > 0) settingsAccesses[moduleName] = settingCounts;

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
    const prohibited = fields.filter(field => PROHIBITED_GAME_STATE_ROOTS.includes(field));
    return prohibited.map(field => `M2C3 forbids generic non-authoritative GameState root: ${field}`);
}

function compareBoundarySnapshot(actual, expected){
    const violations = [];
    if (!expected || expected.snapshotVersion !== SNAPSHOT_VERSION){
        violations.push(`M2C boundary baseline snapshotVersion must be ${SNAPSHOT_VERSION}`);
        return violations;
    }
    compareCountMaps(actual.settingsAccesses, expected.settingsAccesses || {}, 'M2C settings-access', violations);
    compareRuntimeConsumers(actual.runtimeConsumers, expected.runtimeConsumers || {}, violations);
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
    const runtimeConsumerEdges = Object.values(snapshot.runtimeConsumers).reduce((sum, consumers) => sum + consumers.length, 0);
    return {
        settingsModuleCount: Object.keys(snapshot.settingsAccesses).length,
        settingsReferenceCount,
        dynamicSettingsSites,
        reviewedSettingKeys: [...settingKeys].sort(),
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
    PROHIBITED_GAME_STATE_ROOTS,
    analyzeSettingsAccesses,
    importedVarsBindings,
    buildBoundarySnapshot,
    compareBoundarySnapshot,
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
