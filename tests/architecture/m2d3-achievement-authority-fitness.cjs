'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const sourceRoot = path.join(root, 'src');
const adapterImport = 'legacy/bridge/achievement-state-adapter.mjs';

function read(relativePath){
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function requireText(source, text, message){
    if (!source.includes(text)){
        throw new Error(message);
    }
}

function forbidText(source, text, message){
    if (source.includes(text)){
        throw new Error(message);
    }
}

function listSourceFiles(directory){
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })){
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()){
            files.push(...listSourceFiles(target));
        }
        else if (entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name)){
            files.push(target);
        }
    }
    return files.sort();
}

const vars = read('src/vars.js');
const achieve = read('src/achieve.js');
const adapter = read('src/legacy/bridge/achievement-state-adapter.mjs');

requireText(
    vars,
    "import { bindLegacyAchievementState } from './legacy/bridge/achievement-state-adapter.mjs';",
    'M2D3 requires vars.js to own the post-migration achievement hydration seam.'
);

const setGlobalStart = vars.indexOf('export function setGlobal(gameState) {');
const setGlobalEnd = setGlobalStart < 0 ? -1 : vars.indexOf('\n}', setGlobalStart);
if (setGlobalStart < 0 || setGlobalEnd < 0){
    throw new Error('M2D3 requires an inspectable setGlobal(gameState) function.');
}
const setGlobalBlock = vars.slice(setGlobalStart, setGlobalEnd);
const bindIndex = setGlobalBlock.indexOf('bindLegacyAchievementState(gameState);');
const publishIndex = setGlobalBlock.indexOf('global = gameState;');
if (bindIndex < 0 || publishIndex < 0 || bindIndex >= publishIndex){
    throw new Error('setGlobal() must bind achievement authority successfully before publishing a replacement legacy root.');
}

const migrationMarker = "global.stats.achieve[key] = { l: global.stats.achieve[key] };";
const hydrationMarker = '// M2D3 authority cutover: historical vars.js migrations and shape repair above';
const migrationIndex = vars.indexOf(migrationMarker);
const hydrationIndex = vars.indexOf(hydrationMarker);
if (migrationIndex < 0 || hydrationIndex < 0 || migrationIndex >= hydrationIndex){
    throw new Error('GameState achievement hydration must remain after historical vars.js achievement migrations.');
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
    .filter(file => file !== path.join(sourceRoot, 'legacy', 'bridge', 'achievement-state-adapter.mjs'))
    .filter(file => fs.readFileSync(file, 'utf8').includes(adapterImport))
    .map(file => path.relative(root, file).split(path.sep).join('/'))
    .sort();

const expectedAdapterConsumers = ['src/achieve.js', 'src/vars.js'];
if (JSON.stringify(adapterConsumers) !== JSON.stringify(expectedAdapterConsumers)){
    throw new Error(
        'M2D3 achievement authority bridge consumers changed: ' +
        JSON.stringify(adapterConsumers) +
        '; expected only ' + JSON.stringify(expectedAdapterConsumers)
    );
}

const exportedFunctions = [...adapter.matchAll(/\bexport\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g)]
    .map(match => match[1])
    .sort();
const expectedExports = [
    'achievementStateSnapshot',
    'advanceLegacyAchievement',
    'bindLegacyAchievementState',
    'removeLegacyAchievementUniverseRank',
].sort();
if (JSON.stringify(exportedFunctions) !== JSON.stringify(expectedExports)){
    throw new Error(
        'M2D3 achievement adapter authority surface changed: ' +
        JSON.stringify(exportedFunctions) +
        '; expected ' + JSON.stringify(expectedExports)
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

console.log('M2D3 achievement authority fitness checks passed.');
