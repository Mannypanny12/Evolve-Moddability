'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');
const {
    REVIEWED_PRODUCTION_CALCULATION_CONSUMERS,
    productionCalculationConsumers,
} = require('./m4a-calculation-boundary-fitness.cjs');

const CONTENT = 'src/content/evolve/calculations/oil-well-production.mjs';
const RUNTIME = 'src/application/evolve/oil-well-production-runtime.mjs';
const PROD = 'src/prod.js';
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const ALLOWED_CONTENT_IMPORTS = new Set([
    'src/engine/identity.mjs',
    'src/engine/calculations/common.mjs',
    'src/engine/calculations/resource-primitives.mjs',
]);
const ALLOWED_RUNTIME_IMPORTS = new Set([
    'src/engine/calculations/calculation-engine.mjs',
    CONTENT,
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

function importViolations(source, relative, allowed){
    const violations = [];
    for (const reference of extractModuleReferences(source, relative)){
        if (reference.kind !== 'import-statement'){
            violations.push(`${relative}: only static ESM imports are allowed`);
            continue;
        }
        if (!reference.specifier.startsWith('.')){
            violations.push(`${relative}: external or root-style import is forbidden: ${reference.specifier}`);
            continue;
        }
        const target = resolveRelative(relative, reference.specifier);
        if (!allowed.has(target)){
            violations.push(`${relative}: unsupported M4D dependency ${target}`);
        }
    }
    return violations;
}

function analyzeContentSource(source){
    const violations = [];
    const code = maskNonCode(source);
    for (const [label, pattern] of [
        ['legacy global state', /\bglobal\b/],
        ['legacy production module', /\bproduction\s*\(|\bprod\.js\b/],
        ['legacy biome/governor helpers', /\b(?:biomes|govActive)\b/],
        ['browser/UI capability', /\b(?:window|document|navigator|jQuery|Vue)\b|\$\s*\(/],
        ['mutation authority', /\b(?:modRes|setGlobal|mutationAuthority|createMutationScope|beginTransaction)\b/],
        ['clock/random capability', /\b(?:Date|performance|crypto)\b|\bMath\s*\.\s*(?:random|rand)\s*\(/],
        ['async/dynamic loading', /\b(?:async|await)\b|\bimport\s*\(|\brequire\s*\(/],
    ]){
        if (pattern.test(code)) violations.push(`${CONTENT}: first-party calculation may not access ${label}`);
    }
    violations.push(...importViolations(source, CONTENT, ALLOWED_CONTENT_IMPORTS));

    for (const marker of [
        "'evolve:calculation/production/oil-well'",
        "'evolve:modifier/production/oil-well/technology'",
        "'evolve:modifier/production/oil-well/geology'",
        "'evolve:modifier/production/oil-well/biome'",
        "'evolve:modifier/production/oil-well/dirty-jobs'",
        "'evolve:modifier/production/oil-well/warlord'",
        'order: 100',
        'order: 200',
        'order: 300',
        'order: 400',
        'order: 500',
        'calculateProduction({',
        'inputs.biomeOilMultiplier !== null',
    ]){
        if (!source.includes(marker)) violations.push(`${CONTENT}: reviewed M4D marker is missing: ${marker}`);
    }
    return violations;
}

function analyzeRuntimeSource(source){
    const violations = [];
    const code = maskNonCode(source);
    violations.push(...importViolations(source, RUNTIME, ALLOWED_RUNTIME_IMPORTS));
    const exportCount = (code.match(/\bexport\b/g) || []).length;
    if (exportCount !== 1 || !/\bexport\s+function\s+calculateOilWellProduction\s*\(/.test(code)){
        violations.push(`${RUNTIME}: public surface must export only calculateOilWellProduction()`);
    }
    for (const [label, pattern] of [
        ['legacy/global state', /\bglobal\b/],
        ['browser/UI capability', /\b(?:window|document|navigator|jQuery|Vue)\b|\$\s*\(/],
        ['mutation authority', /\b(?:modRes|setGlobal|mutationAuthority|createMutationScope|beginTransaction)\b/],
        ['legacy gameplay helpers', /\b(?:biomes|govActive|production)\b/],
        ['async/dynamic loading', /\b(?:async|await)\b|\bimport\s*\(|\brequire\s*\(/],
    ]){
        if (pattern.test(code)) violations.push(`${RUNTIME}: composition runtime may not access ${label}`);
    }
    if ((code.match(/\bcreateCalculationEngine\s*\(/g) || []).length !== 1){
        violations.push(`${RUNTIME}: reviewed calculation engine must be constructed exactly once`);
    }
    if ((code.match(/\boilWellProductionEngine\s*\.\s*calculate\s*\(/g) || []).length !== 1){
        violations.push(`${RUNTIME}: calculateOilWellProduction() must forward exactly one engine calculation`);
    }
    return violations;
}

function oilWellCaseBody(source){
    const start = source.indexOf("case 'oil_well':");
    const end = source.indexOf("case 'iridium_mine':", start + 1);
    if (start < 0 || end < 0 || end <= start) return null;
    return source.slice(start, end);
}

function analyzeProdSource(source){
    const violations = [];
    const importPattern = /import\s*\{\s*calculateOilWellProduction\s*\}\s*from\s*['"]\.\/application\/evolve\/oil-well-production-runtime\.mjs['"]\s*;/;
    if (!importPattern.test(source)){
        violations.push(`${PROD}: Oil Well compatibility seam must import only calculateOilWellProduction from the reviewed runtime`);
    }
    const body = oilWellCaseBody(source);
    if (body === null){
        violations.push(`${PROD}: production('oil_well') case could not be located unambiguously`);
        return violations;
    }
    for (const marker of [
        'let biomeOilMultiplier = null;',
        'biomes.desert.vars()[1]',
        'biomes.tundra.vars()[1]',
        'biomes.taiga.vars()[2]',
        "oilTechLevel: global.tech['oil'] || 0",
        "geologyBonus: global.city.geology['Oil'] || 0",
        "dirtyJobsPercent: govActive('dirty_jobs',2) || 0",
        "warlord: Boolean(global.race['warlord'])",
        'pumpjackRank: global.portal?.pumpjack?.rank || 0',
        'return calculateOilWellProduction({',
    ]){
        if (!body.includes(marker)) violations.push(`${PROD}: reviewed Oil Well compatibility marker is missing: ${marker}`);
    }
    if ((body.match(/\bcalculateOilWellProduction\s*\(/g) || []).length !== 1){
        violations.push(`${PROD}: Oil Well compatibility case must delegate exactly once`);
    }
    for (const [label, pattern] of [
        ['embedded base production arithmetic', /\blet\s+oil\s*=|\boil\s*\*=/],
        ['embedded technology thresholds', /global\.tech\[['"]oil['"]\]\s*>=\s*[4567]/],
        ['embedded Warlord production multiplication', /pumpjack\?\.rank\s*\|\|\s*1/],
    ]){
        if (pattern.test(body)) violations.push(`${PROD}: Oil Well shim may not retain ${label}`);
    }
    return violations;
}

function runtimeConsumers(root){
    const consumers = [];
    for (const filename of listSourceFiles(path.join(root, 'src'))){
        const relative = normalize(path.relative(root, filename));
        if (relative === RUNTIME) continue;
        const source = fs.readFileSync(filename, 'utf8');
        for (const reference of extractModuleReferences(source, relative)){
            const target = resolveRuntimeReference(relative, reference.specifier);
            if (target === RUNTIME){
                consumers.push(relative);
                break;
            }
        }
    }
    return [...new Set(consumers)].sort();
}

function findViolations(root){
    const violations = [];
    for (const relative of [CONTENT, RUNTIME, PROD]){
        const filename = path.join(root, ...relative.split('/'));
        if (!fs.existsSync(filename)){
            violations.push(`${relative}: required M4D source is missing`);
        }
    }
    const contentPath = path.join(root, ...CONTENT.split('/'));
    const runtimePath = path.join(root, ...RUNTIME.split('/'));
    const prodPath = path.join(root, ...PROD.split('/'));
    if (fs.existsSync(contentPath)) violations.push(...analyzeContentSource(fs.readFileSync(contentPath, 'utf8')));
    if (fs.existsSync(runtimePath)) violations.push(...analyzeRuntimeSource(fs.readFileSync(runtimePath, 'utf8')));
    if (fs.existsSync(prodPath)) violations.push(...analyzeProdSource(fs.readFileSync(prodPath, 'utf8')));

    const consumers = runtimeConsumers(root);
    if (consumers.length !== 1 || consumers[0] !== PROD){
        violations.push(`${RUNTIME}: reviewed runtime consumer set must be exactly ${PROD}; found ${consumers.join(', ') || '<none>'}`);
    }

    const calculationConsumers = productionCalculationConsumers(root).consumers;
    if (JSON.stringify(calculationConsumers) !== JSON.stringify(REVIEWED_PRODUCTION_CALCULATION_CONSUMERS)){
        violations.push(`M4D calculation-package consumers must remain exactly ${REVIEWED_PRODUCTION_CALCULATION_CONSUMERS.join(', ')}; found ${calculationConsumers.join(', ') || '<none>'}`);
    }
    return [...new Set(violations)].sort();
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length){
        console.error('M4D Oil Well production fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M4D Oil Well production fitness passed.');
}

module.exports = {
    CONTENT,
    RUNTIME,
    PROD,
    analyzeContentSource,
    analyzeRuntimeSource,
    analyzeProdSource,
    runtimeConsumers,
    findViolations,
};

if (require.main === module) main();
