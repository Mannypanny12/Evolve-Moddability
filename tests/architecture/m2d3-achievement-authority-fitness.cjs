'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

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

const vars = read('src/vars.js');
const achieve = read('src/achieve.js');
const adapter = read('src/legacy/bridge/achievement-state-adapter.mjs');

requireText(
    vars,
    "import { bindLegacyAchievementState } from './legacy/bridge/achievement-state-adapter.mjs';",
    'M2D3 requires vars.js to own the post-migration achievement hydration seam.'
);
requireText(
    vars,
    'export function setGlobal(gameState) {\n    global = gameState;\n    bindLegacyAchievementState(global);\n}',
    'setGlobal() must rebind achievement authority when the legacy root is replaced.'
);

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

requireText(
    adapter,
    'const runtime = createGameStateRuntime(hydrateLegacyState(root));',
    'The legacy achievement adapter must hydrate a real GameState runtime.'
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
    'projectBinding(preserveUndefined ? { legacyId, affix } : null);',
    'Legacy undefined compatibility state must remain a projection concern, not GameState data.'
);

console.log('M2D3 achievement authority fitness checks passed.');
