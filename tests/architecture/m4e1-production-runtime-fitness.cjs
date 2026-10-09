'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');
const {
    CONTENT,
    RUNTIME: OIL_WELL_ADAPTER,
    PROD,
} = require('./m4d-oil-well-production-fitness.cjs');
const {
    REVIEWED_PRODUCTION_CALCULATION_CONSUMERS,
    productionCalculationConsumers,
} = require('./m4a-calculation-boundary-fitness.cjs');

const SHARED_RUNTIME = 'src/application/evolve/production-calculation-runtime.mjs';
const MANIFEST = 'docs/modding/M4E_PRODUCTION_MIGRATION.md';
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const ALLOWED_RUNTIME_IMPORTS = new Set([
    'src/engine/calculations/calculation-engine.mjs',
    CONTENT,
]);
const PRODUCTION_IDS = Object.freeze([
    'transmitter',
    'oil_well',
    'iridium_mine',
    'helium_mine',
    'red_mine',
    'biodome',
    'gas_mining',
    'outpost',
    'oil_extractor',
    'elerium_ship',
    'iridium_ship',
    'iron_ship',
    'g_factory',
    'harvester',
    'elerium_prospector',
    'neutron_miner',
    'bolognium_ship',
    'excavator',
    'vitreloy_plant',
    'infernite_mine',
    'water_freighter',
    'titan_mine',
    'lander',
    'orichalcum_mine',
    'uranium_mine',
    'neutronium_mine',
    'elerium_mine',
    'shock_trooper',
    'tank',
    'mining_pit',
    'tau_farm',
    'womling_mine',
    'refueling_station',
    'ore_refinery',
    'whaling_station',
    'mining_ship',
    'mining_ship_ore',
    'whaling_ship',
    'whaling_ship_oil',
    'alien_outpost',
    'psychic_boost',
    'psychic_cash',
    'asphodel_harvester',
    'shadow_mine',
]);

function normalize(value){ return value.split(path.sep).join('/'); }

function resolveRelative(fromRelativePath, specifier){
    let target = path.posix.normalize(path.posix.join(path.posix.dirname(fromRelativePath), specifier));
    if (!path.posix.extname(target)) target += '.mjs';
    return target;
}

function resolveRuntimeReference(fromRelativePath, specifier){
    if (specifier.startsWith('.')) return resolveRelative(fromRelativePath, specifier);
    if (specifier.startsWith('/')) return path.posix.normalize(specifier.slice(1));
    if (specifier.startsWith('src/')) return path.posix.normalize(specifier);
    return null;
}

function listSourceFiles(dir){
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...listSourceFiles(full));
        else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
    }
    return files.sort();
}

function importViolations(source){
    const violations = [];
    for (const reference of extractModuleReferences(source, SHARED_RUNTIME)){
        if (reference.kind !== 'import-statement'){
            violations.push(`${SHARED_RUNTIME}: only static ESM imports are allowed`);
            continue;
        }
        if (!reference.specifier.startsWith('.')){
            violations.push(`${SHARED_RUNTIME}: external or root-style import is forbidden: ${reference.specifier}`);
            continue;
        }
        const target = resolveRelative(SHARED_RUNTIME, reference.specifier);
        if (!ALLOWED_RUNTIME_IMPORTS.has(target)){
            violations.push(`${SHARED_RUNTIME}: unsupported M4E1 dependency ${target}`);
        }
    }
    return violations;
}

function analyzeSharedRuntimeSource(source){
    const violations = importViolations(source);
    const code = maskNonCode(source);
    const exportCount = (code.match(/\bexport\b/g) || []).length;
    if (exportCount !== 1 || !/\bexport\s+function\s+calculateProductionCalculation\s*\(\s*\{\s*id\s*,\s*inputs\s*\}\s*\)/.test(code)){
        violations.push(`${SHARED_RUNTIME}: public surface must export only calculateProductionCalculation({ id, inputs })`);
    }
    for (const [label, pattern] of [
        ['legacy/global runtime state', /\b(?:global|globalThis|self)\b/],
        ['legacy gameplay helpers', /\b(?:biomes|govActive|govEffect|traits|fathomCheck|production)\b/],
        ['browser/UI capability', /\b(?:window|document|navigator|jQuery|Vue)\b|\$\s*\(/],
        ['browser storage', /\b(?:localStorage|sessionStorage|indexedDB)\b/],
        ['browser/network API', /\b(?:fetch|XMLHttpRequest|WebSocket)\b/],
        ['Node/platform global', /\b(?:process|Buffer)\b/],
        ['clock/random capability', /\b(?:Date|performance|crypto)\b|\bMath\s*\.\s*(?:random|rand)\s*\(/],
        ['timer or microtask scheduling', /\b(?:setTimeout|setInterval|setImmediate|queueMicrotask|requestAnimationFrame|cancelAnimationFrame)\s*\(/],
        ['dynamic code capability', /\be[v]al\s*\(|\bnew\s+F[u]nction\b|\bWebA[s]sembly\b/],
        ['mutation authority', /\b(?:mutationAuthority|createMutationScope|beginTransaction|commitTransaction|rollbackTransaction|modRes|setGlobal)\b/],
        ['async/Promise/dynamic loading', /\b(?:async|await|Promise)\b|\bimport\s*\(|\brequire\s*\(/],
    ]){
        if (pattern.test(code)) violations.push(`${SHARED_RUNTIME}: shared production runtime may not access ${label}`);
    }
    if ((code.match(/\bcreateCalculationEngine\s*\(/g) || []).length !== 1){
        violations.push(`${SHARED_RUNTIME}: production calculation engine must be constructed exactly once`);
    }
    if ((code.match(/\bproductionCalculationEngine\s*\.\s*calculate\s*\(/g) || []).length !== 1){
        violations.push(`${SHARED_RUNTIME}: public calculation function must forward exactly one engine calculation`);
    }
    for (const marker of [
        'createOilWellProductionRegistration()',
        '...createOilWellProductionModifiers()',
        'registrations: [',
        'modifiers: [',
        'productionCalculationEngine.calculate({ id, inputs }).value',
    ]){
        if (!source.includes(marker)) violations.push(`${SHARED_RUNTIME}: reviewed M4E1 composition marker is missing: ${marker}`);
    }
    return violations;
}

function sharedRuntimeConsumers(root){
    const consumers = [];
    for (const filename of listSourceFiles(path.join(root, 'src'))){
        const relative = normalize(path.relative(root, filename));
        if (relative === SHARED_RUNTIME) continue;
        const source = fs.readFileSync(filename, 'utf8');
        for (const reference of extractModuleReferences(source, relative)){
            if (resolveRuntimeReference(relative, reference.specifier) === SHARED_RUNTIME){
                consumers.push(relative);
                break;
            }
        }
    }
    return [...new Set(consumers)].sort();
}

function productionIdsFromProd(source){
    return [...source.matchAll(/^        case '([^']+)':/gm)].map(match => match[1]);
}

function occurrences(source, needle){
    return source.split(needle).length - 1;
}

function findViolations(root){
    const violations = [];
    for (const relative of [SHARED_RUNTIME, OIL_WELL_ADAPTER, CONTENT, PROD, MANIFEST]){
        const filename = path.join(root, ...relative.split('/'));
        if (!fs.existsSync(filename)) violations.push(`${relative}: required M4E1 file is missing`);
    }

    const sharedPath = path.join(root, ...SHARED_RUNTIME.split('/'));
    if (fs.existsSync(sharedPath)){
        violations.push(...analyzeSharedRuntimeSource(fs.readFileSync(sharedPath, 'utf8')));
    }

    const consumers = sharedRuntimeConsumers(root);
    if (JSON.stringify(consumers) !== JSON.stringify([OIL_WELL_ADAPTER])){
        violations.push(`${SHARED_RUNTIME}: M4E1 consumer set must be exactly ${OIL_WELL_ADAPTER}; found ${consumers.join(', ') || '<none>'}`);
    }

    const prodPath = path.join(root, ...PROD.split('/'));
    if (fs.existsSync(prodPath)){
        const actualIds = productionIdsFromProd(fs.readFileSync(prodPath, 'utf8'));
        if (JSON.stringify(actualIds) !== JSON.stringify(PRODUCTION_IDS)){
            violations.push(`${PROD}: frozen M4E1 production inventory changed; expected ${PRODUCTION_IDS.length} ids, found ${actualIds.length}`);
        }
    }

    const manifestPath = path.join(root, ...MANIFEST.split('/'));
    if (fs.existsSync(manifestPath)){
        const manifest = fs.readFileSync(manifestPath, 'utf8');
        for (const marker of [
            'Status: M4E1 implementation and checkpoint review complete; exact-head CI is the closure authority. M4E remains in progress.',
            '## M4E1 review and hardening',
            '`evolve:calculation/production/<production-source>`',
        ]){
            if (!manifest.includes(marker)) violations.push(`${MANIFEST}: reviewed M4E1 marker is missing: ${marker}`);
        }
        for (const id of PRODUCTION_IDS){
            const row = `| \`${id}\` |`;
            const count = occurrences(manifest, row);
            if (count !== 1){
                violations.push(`${MANIFEST}: frozen production id must appear exactly once: ${id}; found ${count}`);
            }
        }
    }

    const calculationConsumers = productionCalculationConsumers(root).consumers;
    if (JSON.stringify(calculationConsumers) !== JSON.stringify(REVIEWED_PRODUCTION_CALCULATION_CONSUMERS)){
        violations.push(`M4E1 calculation-package consumers must remain exactly ${REVIEWED_PRODUCTION_CALCULATION_CONSUMERS.join(', ')}; found ${calculationConsumers.join(', ') || '<none>'}`);
    }

    return [...new Set(violations)].sort();
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length){
        console.error('M4E1 production runtime fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M4E1 production runtime fitness passed.');
}

module.exports = {
    SHARED_RUNTIME,
    MANIFEST,
    PRODUCTION_IDS,
    analyzeSharedRuntimeSource,
    sharedRuntimeConsumers,
    productionIdsFromProd,
    findViolations,
};

if (require.main === module) main();
