'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const ADAPTER_RELATIVE_PATH = 'src/legacy/bridge/achievement-state-adapter.mjs';
const EXPECTED_ADAPTER_CONSUMERS = Object.freeze([
    'src/achieve.js',
    'src/legacy/bridge/achievement-state-reader.mjs',
    'src/vars.js',
]);
const EXPECTED_ADAPTER_EXPORTS = Object.freeze([
    'achievementStateSnapshot',
    'advanceLegacyAchievement',
    'bindLegacyAchievementState',
    'removeLegacyAchievementUniverseRank',
    'selectLegacyAchievementState',
].sort());

function listSourceFiles(directory){
    const files = [];
    if (!fs.existsSync(directory)) return files;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })){
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...listSourceFiles(target));
        else if (entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name)) files.push(target);
    }
    return files.sort();
}

function referenceTargetsAdapter(specifier, sourcefile, adapterPath){
    if (!specifier || !specifier.startsWith('.')) return false;
    const target = path.resolve(path.dirname(sourcefile), specifier);
    return target === adapterPath || target + '.mjs' === adapterPath;
}

function scanAchievementAuthority(root){
    const violations = [];
    const sourceRoot = path.join(root, 'src');
    const adapterPath = path.join(root, ...ADAPTER_RELATIVE_PATH.split('/'));

    function add(message){
        violations.push(message);
    }

    function read(relativePath){
        const file = path.join(root, ...relativePath.split('/'));
        try {
            return fs.readFileSync(file, 'utf8');
        }
        catch (error){
            add(`M2D3 could not read ${relativePath}: ${error.message}`);
            return '';
        }
    }

    function requireText(source, text, message){
        if (!source.includes(text)) add(message);
    }

    function forbidText(source, text, message){
        if (source.includes(text)) add(message);
    }

    function sourceReferencesAdapter(file){
        const source = fs.readFileSync(file, 'utf8');
        let references;
        try {
            references = extractModuleReferences(source, file);
        }
        catch (error){
            add(`M2D3 cannot inspect module references in ${path.relative(root, file)}: ${error.message}`);
            return false;
        }
        return references.some(reference => referenceTargetsAdapter(reference.specifier, file, adapterPath));
    }

    const detectorProbe = path.join(sourceRoot, 'm2d3-detector-probe.js');
    for (const source of [
        "import { advanceLegacyAchievement } from './legacy/bridge/achievement-state-adapter.mjs';",
        "import { advanceLegacyAchievement } from './legacy/bridge/../bridge/achievement-state-adapter.mjs';",
        "const adapter = import('./legacy/bridge/achievement-state-adapter.mjs');",
    ]){
        try {
            const references = extractModuleReferences(source, detectorProbe);
            if (!references.some(reference => referenceTargetsAdapter(reference.specifier, detectorProbe, adapterPath))){
                add(`M2D3 adapter-consumer detector missed reviewed module syntax: ${source}`);
            }
        }
        catch (error){
            add(`M2D3 adapter-consumer detector probe failed: ${error.message}`);
        }
    }

    const vars = read('src/vars.js');
    const achieve = read('src/achieve.js');
    const adapter = read(ADAPTER_RELATIVE_PATH);

    requireText(
        vars,
        "import { bindLegacyAchievementState } from './legacy/bridge/achievement-state-adapter.mjs';",
        'M2D3 requires vars.js to own the post-migration achievement hydration seam.'
    );

    const setGlobalStart = vars.indexOf('export function setGlobal(gameState) {');
    const setGlobalEnd = setGlobalStart < 0 ? -1 : vars.indexOf('\n}', setGlobalStart);
    if (setGlobalStart < 0 || setGlobalEnd < 0){
        add('M2D3 requires an inspectable setGlobal(gameState) function.');
    }
    else {
        const setGlobalBlock = vars.slice(setGlobalStart, setGlobalEnd);
        const bindIndex = setGlobalBlock.indexOf('bindLegacyAchievementState(gameState);');
        const publishIndex = setGlobalBlock.indexOf('global = gameState;');
        if (bindIndex < 0 || publishIndex < 0 || bindIndex >= publishIndex){
            add('setGlobal() must bind achievement authority successfully before publishing a replacement legacy root.');
        }
    }

    const migrationMarker = "global.stats.achieve[key] = { l: global.stats.achieve[key] };";
    const hydrationMarker = '// M2D3 authority cutover: historical vars.js migrations and shape repair above';
    const migrationIndex = vars.indexOf(migrationMarker);
    const hydrationIndex = vars.indexOf(hydrationMarker);
    if (migrationIndex < 0 || hydrationIndex < 0 || migrationIndex >= hydrationIndex){
        add('GameState achievement hydration must remain after historical vars.js achievement migrations.');
    }

    requireText(
        achieve,
        "import { advanceLegacyAchievement, removeLegacyAchievementUniverseRank } from './legacy/bridge/achievement-state-adapter.mjs';",
        'Legacy achievement orchestration must mutate through the M2D3 adapter.'
    );
    requireText(
        achieve,
        'const mutation = advanceLegacyAchievement({',
        'unlockAchieve() must delegate persistent achievement advancement to GameState authority.'
    );
    requireText(
        achieve,
        'removeLegacyAchievementUniverseRank(name, affix, { preserveUndefined: true });',
        'Aggregate achievement clearing must delegate to GameState while retaining the legacy undefined mirror quirk.'
    );

    forbidText(
        achieve,
        'global.stats.achieve[achievement] = { l: 0 };',
        'M2D3 forbids ordinary unlock record creation directly in global.stats.achieve.'
    );
    forbidText(
        achieve,
        'global.stats.achieve[achievement].l = rank;',
        'M2D3 forbids ordinary base-rank writes directly in global.stats.achieve.'
    );
    forbidText(
        achieve,
        'global.stats.achieve[achievement][u_affix] = rank;',
        'M2D3 forbids ordinary universe-rank writes directly in global.stats.achieve.'
    );
    forbidText(
        achieve,
        'global.stats.achieve[name].e = undefined;',
        'M2D3 forbids aggregate universe clears directly in global.stats.achieve.'
    );

    const adapterConsumers = listSourceFiles(sourceRoot)
        .filter(file => file !== adapterPath)
        .filter(sourceReferencesAdapter)
        .map(file => path.relative(root, file).split(path.sep).join('/'))
        .sort();
    if (JSON.stringify(adapterConsumers) !== JSON.stringify(EXPECTED_ADAPTER_CONSUMERS)){
        add(
            'M2D3 achievement authority bridge consumers changed: ' +
            JSON.stringify(adapterConsumers) +
            '; expected only ' + JSON.stringify(EXPECTED_ADAPTER_CONSUMERS)
        );
    }

    const adapterCode = maskNonCode(adapter);
    const exportedFunctions = [...adapterCode.matchAll(/\bexport\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g)]
        .map(match => match[1])
        .sort();
    const exportKeywordCount = [...adapterCode.matchAll(/\bexport\b/g)].length;
    if (exportKeywordCount !== exportedFunctions.length){
        add(
            'M2D3 achievement adapter may export only the reviewed named function surface; ' +
            `found ${exportKeywordCount} export declarations but ${exportedFunctions.length} reviewed function exports.`
        );
    }
    if (JSON.stringify(exportedFunctions) !== JSON.stringify(EXPECTED_ADAPTER_EXPORTS)){
        add(
            'M2D3 achievement adapter authority surface changed: ' +
            JSON.stringify(exportedFunctions) +
            '; expected ' + JSON.stringify(EXPECTED_ADAPTER_EXPORTS)
        );
    }

    requireText(
        adapter,
        'const runtime = createGameStateRuntime(hydrateLegacyState(ledger));',
        'The legacy achievement adapter must hydrate a real GameState runtime from the reviewed legacy ledger.'
    );
    requireText(
        adapter,
        'const projectionTarget = inspectProjectionTarget(current);',
        'The adapter must preflight compatibility projection before authoritative mutation.'
    );
    requireText(
        adapter,
        'const beforeSnapshot = current.runtime.store.snapshot();',
        'The adapter must retain rollback state before authoritative mutation.'
    );
    requireText(
        adapter,
        'const result = current.runtime.achievements.advance(command);',
        'The adapter must route advancement through the engine achievement mutation service.'
    );
    requireText(
        adapter,
        'const result = current.runtime.achievements.removeUniverseRank({',
        'The adapter must route aggregate clears through the engine achievement mutation service.'
    );
    requireText(
        adapter,
        'restoreRuntimeAfterProjectionFailure(current, snapshot);',
        'Projection failure must restore authoritative achievement state rather than leave split authority.'
    );
    requireText(
        adapter,
        'preserveUndefined ? { legacyId, affix } : null',
        'Legacy undefined compatibility state must remain a projection concern, not GameState data.'
    );

    return {
        summary: {
            adapter: ADAPTER_RELATIVE_PATH,
            consumerCount: adapterConsumers.length,
            consumers: adapterConsumers,
            exportCount: exportedFunctions.length,
            exports: exportedFunctions,
            passed: violations.length === 0,
        },
        violations: [...new Set(violations)].sort(),
    };
}

function runAchievementAuthorityCheck(root, logger = console){
    const result = scanAchievementAuthority(root);
    if (result.violations.length){
        logger.error('M2D3 achievement authority fitness violations:');
        for (const violation of result.violations) logger.error('- ' + violation);
        return { exitCode: 1, result };
    }
    logger.log('M2D3 achievement authority fitness checks passed.');
    return { exitCode: 0, result };
}

function main(){
    const root = path.resolve(__dirname, '..', '..');
    process.exitCode = runAchievementAuthorityCheck(root).exitCode;
}

module.exports = {
    ADAPTER_RELATIVE_PATH,
    EXPECTED_ADAPTER_CONSUMERS,
    EXPECTED_ADAPTER_EXPORTS,
    listSourceFiles,
    referenceTargetsAdapter,
    scanAchievementAuthority,
    runAchievementAuthorityCheck,
};

if (require.main === module){
    main();
}
