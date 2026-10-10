'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { maskNonCode } = require('./architecture-fitness.cjs');

const PROD = 'src/prod.js';
const RUNTIME = 'src/application/evolve/production-calculation-runtime.mjs';
const IDS_IMPORT = "import { EXPLICIT_STATE_PRODUCTION_CALCULATION_IDS } from './content/evolve/calculations/explicit-state-production.mjs';";
const MIGRATED_IDS = Object.freeze([
    'biodome',
    'g_factory',
    'vitreloy_plant',
    'infernite_mine',
    'titan_mine',
    'mining_pit',
    'womling_mine',
    'mining_ship',
    'whaling_ship',
    'asphodel_harvester',
]);

const FORBIDDEN_NUMERIC_AUTHORITY = Object.freeze({
    biodome: /\b0\.1\b|\b0\.25\b|\b1\.5\b|\breturn\s+2\b/,
    g_factory: /\b0\.05\b|\b1\.8\b|\b0\.6\b/,
    vitreloy_plant: /\b0\.18\b|\b1\.4\b|\b1\.3\b|\b1\.1\b/,
    infernite_mine: /\b0\.5\b/,
    titan_mine: /\b0\.02\b|\b0\.12\b/,
    mining_pit: /\b0\.12\b|\b0\.09\b|\b0\.0288\b|\b0\.0216\b|\b0\.8\b|\b0\.6\b|\b0\.448\b|\b0\.336\b|\b0\.58\b|\b0\.13\b|\b0\.74\b|\b0\.88\b|\b1\.44\b|\b1\.18\b/,
    womling_mine: /\b0\.0305\b|\b0\.047\b|\b0\.616\b|\b1\.191\b|\b1\.377\b|\b1\.544\b|\b0\.382\b|\b0\.535\b|\b0\.15\b|\b1\.1\b|\b1\.25\b/,
    mining_ship: /\b12\b|\b10\b|\b1\.4\b|\*\*/,
    whaling_ship: /\b8\b|\b1\.4\b|\*\*/,
    asphodel_harvester: /\b0\.075\b|\b0\.06\b/,
});

function productionCaseBody(source, id){
    const marker = `        case '${id}':`;
    const start = source.indexOf(marker);
    if (start < 0) return null;
    const bodyStart = start + marker.length;
    const tail = source.slice(bodyStart);
    const nextCase = /\n        case '[^']+':/.exec(tail);
    const productionEnd = tail.indexOf('\n    }\n}\n\nexport function factoryBonus');
    let end = -1;
    if (nextCase && (productionEnd < 0 || nextCase.index < productionEnd)) end = nextCase.index;
    else end = productionEnd;
    return end < 0 ? null : tail.slice(0, end);
}

function analyzeHelper(source){
    const violations = [];
    if (!source.includes(IDS_IMPORT)){
        violations.push(`${PROD}: M4E3 cutover must import canonical explicit-state production ids`);
    }
    const helperStart = source.indexOf('function explicitStateProduction(id, inputs){');
    const productionStart = source.indexOf('export function production', helperStart + 1);
    if (helperStart < 0 || productionStart < 0){
        violations.push(`${PROD}: explicitStateProduction(id, inputs) compatibility helper is missing`);
        return violations;
    }
    const helper = source.slice(helperStart, productionStart);
    const code = maskNonCode(helper);
    if ((code.match(/\bcalculateProductionCalculation\s*\(/g) || []).length !== 1){
        violations.push(`${PROD}: explicitStateProduction() must delegate exactly once to the shared runtime`);
    }
    if (!helper.includes('id: EXPLICIT_STATE_PRODUCTION_CALCULATION_IDS[id],') || !helper.includes('inputs,')){
        violations.push(`${PROD}: explicitStateProduction() must map canonical ids and forward explicit inputs`);
    }
    if (/\b(?:global|p_on|traits|fathomCheck|hellSupression|flib|jobScale)\b/.test(code)){
        violations.push(`${PROD}: explicitStateProduction() may not read gameplay state or legacy helpers`);
    }
    return violations;
}

function analyzeMigratedCase(source, id){
    const body = productionCaseBody(source, id);
    if (body === null){
        return [`${PROD}: migrated M4E3 case ${id} is missing or could not be isolated`];
    }
    const violations = [];
    const code = maskNonCode(body);
    if (!body.includes(`explicitStateProduction('${id}'`)){
        violations.push(`${PROD}: migrated M4E3 case ${id} must delegate to its canonical explicit-state calculation`);
    }
    if (/\bcalculateProductionCalculation\s*\(|\bEXPLICIT_STATE_PRODUCTION_CALCULATION_IDS\b/.test(code)){
        violations.push(`${PROD}: migrated M4E3 case ${id} must delegate through explicitStateProduction()`);
    }
    if (FORBIDDEN_NUMERIC_AUTHORITY[id].test(code)){
        violations.push(`${PROD}: migrated M4E3 case ${id} retains numerical production authority`);
    }
    return violations;
}

function analyzeProdSource(source){
    const violations = analyzeHelper(source);
    if (/import\s*\{\s*flib\s*\}\s*from\s*['"]\.\/functions\.js['"]/.test(source)){
        violations.push(`${PROD}: M4E3 ship curve must no longer depend on legacy flib`);
    }
    for (const id of MIGRATED_IDS){
        violations.push(...analyzeMigratedCase(source, id));
    }
    const requiredMarkers = [
        "if (val !== 'food' && val !== 'cat_food' && val !== 'lumber') return;",
        "if (val !== 'adamantite' && val !== 'aluminium') return;",
        "variant: MINING_PIT_VARIANTS.has(val) ? val : 'other'",
        "if (!WOMLING_MINE_VARIANTS.has(val)) return;",
        "const suppression = hellSupression('gate', 0, wiki).supress;",
        "aiColonistContribution = jobScale(p_on['ai_colonist']);",
        "corruptorOn: warlord && corruptorExists ? (p_on['corruptor'] || 0) : 0,",
    ];
    for (const marker of requiredMarkers){
        if (!source.includes(marker)){
            violations.push(`${PROD}: reviewed M4E3 compatibility marker is missing: ${marker}`);
        }
    }
    return [...new Set(violations)].sort();
}

function analyzeRuntimeSource(source){
    const violations = [];
    if (!source.includes("import { createExplicitStateProductionRegistrations } from '../../content/evolve/calculations/explicit-state-production.mjs';")){
        violations.push(`${RUNTIME}: M4E3 registration import is missing`);
    }
    if (!source.includes('...createExplicitStateProductionRegistrations(),')){
        violations.push(`${RUNTIME}: M4E3 registration family must be composed into the shared engine`);
    }
    return violations;
}

function findViolations(root){
    const violations = [];
    const prodPath = path.join(root, ...PROD.split('/'));
    const runtimePath = path.join(root, ...RUNTIME.split('/'));
    if (!fs.existsSync(prodPath)) violations.push(`${PROD}: required compatibility module is missing`);
    else violations.push(...analyzeProdSource(fs.readFileSync(prodPath, 'utf8')));
    if (!fs.existsSync(runtimePath)) violations.push(`${RUNTIME}: required shared runtime is missing`);
    else violations.push(...analyzeRuntimeSource(fs.readFileSync(runtimePath, 'utf8')));
    return [...new Set(violations)].sort();
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length){
        console.error('M4E3 explicit-state production cutover fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M4E3 explicit-state production cutover fitness passed.');
}

module.exports = {
    PROD,
    RUNTIME,
    MIGRATED_IDS,
    productionCaseBody,
    analyzeHelper,
    analyzeMigratedCase,
    analyzeProdSource,
    analyzeRuntimeSource,
    findViolations,
};

if (require.main === module) main();
