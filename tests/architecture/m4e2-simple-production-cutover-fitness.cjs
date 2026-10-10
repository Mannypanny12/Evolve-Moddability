'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { maskNonCode } = require('./architecture-fitness.cjs');

const PROD = 'src/prod.js';
const SHARED_RUNTIME_IMPORT = "import { calculateProductionCalculation } from './application/evolve/production-calculation-runtime.mjs';";
const SIMPLE_IDS_IMPORT = "import { SIMPLE_PRODUCTION_CALCULATION_IDS } from './content/evolve/calculations/simple-production.mjs';";
const MIGRATED_CONSTANT_IDS = Object.freeze([
    'transmitter',
    'elerium_prospector',
    'neutron_miner',
    'bolognium_ship',
    'excavator',
    'water_freighter',
    'orichalcum_mine',
    'uranium_mine',
    'neutronium_mine',
    'elerium_mine',
    'whaling_station',
    'alien_outpost',
]);
const MIGRATED_VARIANTS = Object.freeze({
    harvester: Object.freeze(['helium', 'deuterium']),
    shadow_mine: Object.freeze(['elerium', 'infernite', 'vitreloy']),
});
const MIGRATED_FACT_CASES = Object.freeze({
    gas_mining: "return simpleProduction('gas_mining', { heliumUnlocked: Boolean(global.tech['helium']) });",
    oil_extractor: "return simpleProduction('oil_extractor', { oilTechLevel: global.tech['oil'] || 0 });",
    elerium_ship: "return simpleProduction('elerium_ship', { asteroidTechLevel: global.tech.asteroid || 0 });",
    iridium_ship: "return simpleProduction('iridium_ship', { asteroidTechLevel: global.tech.asteroid || 0 });",
    iron_ship: "return simpleProduction('iron_ship', { asteroidTechLevel: global.tech.asteroid || 0 });",
    lander: "return simpleProduction('lander', { crashedShipCount: global.space.crashed_ship.count });",
    shock_trooper: "return simpleProduction('shock_trooper', { digsiteCount: global.space.digsite.count });",
    tank: "return simpleProduction('tank', { digsiteCount: global.space.digsite.count });",
    ore_refinery: "return simpleProduction('ore_refinery', { tauOreMiningUnlocked: Boolean(global.tech['tau_ore_mining']) });",
});
const MIGRATED_ISOLATION_CASES = Object.freeze({
    tau_farm: "if (val !== 'food' && val !== 'lumber' && val !== 'water') return;\n            return simpleProduction('tau_farm', { variant: val, isolation: val === 'water' ? false : Boolean(global.tech['isolation']) });",
    refueling_station: "return simpleProduction('refueling_station', { isolation: Boolean(global.tech['isolation']) });",
    mining_ship_ore: "if (val !== 'iron' && val !== 'aluminium' && val !== 'iridium' && val !== 'neutronium' && val !== 'orichalcum' && val !== 'elerium') return;\n            return simpleProduction('mining_ship_ore', { variant: val, isolation: Boolean(global.tech['isolation']) });",
    whaling_ship_oil: "return simpleProduction('whaling_ship_oil', { isolation: Boolean(global.tech['isolation']) });",
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
    if (end < 0) return null;
    return tail.slice(0, end);
}

function normalizeCode(source){
    return maskNonCode(source).replace(/\s+/g, ' ').trim();
}

function analyzeHelper(source){
    const violations = [];
    if (!source.includes(SHARED_RUNTIME_IMPORT)){
        violations.push(`${PROD}: M4E2 cutover must import calculateProductionCalculation from the shared runtime`);
    }
    if (!source.includes(SIMPLE_IDS_IMPORT)){
        violations.push(`${PROD}: M4E2 cutover must import the canonical simple-production calculation ids`);
    }

    const helperStart = source.indexOf('function simpleProduction(id, inputs = {}){');
    const nextHelperStart = source.indexOf('function explicitStateProduction(id, inputs){', helperStart + 1);
    const productionStart = source.indexOf('export function production', helperStart + 1);
    if (helperStart < 0 || productionStart < 0){
        violations.push(`${PROD}: M4E2 compatibility helper simpleProduction(id, inputs) is missing`);
        return violations;
    }
    const helperEnd = nextHelperStart >= 0 && nextHelperStart < productionStart ? nextHelperStart : productionStart;
    const helper = source.slice(helperStart, helperEnd);
    const helperCode = maskNonCode(helper);
    if ((helperCode.match(/\bcalculateProductionCalculation\s*\(/g) || []).length !== 1){
        violations.push(`${PROD}: simpleProduction() must delegate exactly once to the shared production runtime`);
    }
    if (!helper.includes('id: SIMPLE_PRODUCTION_CALCULATION_IDS[id],') || !helper.includes('inputs,')){
        violations.push(`${PROD}: simpleProduction() must map the legacy id through the canonical id table and forward explicit inputs`);
    }
    if (/\b(?:global|p_on|traits|biomes|govActive|govEffect|production)\b/.test(helperCode)){
        violations.push(`${PROD}: simpleProduction() may not read gameplay state or legacy production helpers`);
    }
    return violations;
}

function analyzeMigratedCase(source, id, variantValues = null){
    const violations = [];
    const body = productionCaseBody(source, id);
    if (body === null){
        return [`${PROD}: migrated M4E2 case ${id} is missing or could not be isolated`];
    }
    const code = maskNonCode(body);
    if (/\bglobal\b|\bp_on\b|\btraits\b|\bbiomes\b|\bgovActive\b|\bgovEffect\b/.test(code)){
        violations.push(`${PROD}: migrated M4E2 case ${id} may not retain ambient gameplay-state reads`);
    }
    if (/\bcalculateProductionCalculation\s*\(|\bSIMPLE_PRODUCTION_CALCULATION_IDS\b/.test(code)){
        violations.push(`${PROD}: migrated M4E2 case ${id} must delegate through simpleProduction() rather than bypassing the compatibility helper`);
    }
    if (/\breturn\s+[-+]?(?:\d|\.\d)/.test(code)){
        violations.push(`${PROD}: migrated M4E2 case ${id} may not retain numeric production authority`);
    }

    if (variantValues === null){
        if (!body.includes(`return simpleProduction('${id}');`)){
            violations.push(`${PROD}: migrated M4E2 constant case ${id} must delegate to its canonical calculation`);
        }
        if (/\bswitch\s*\(\s*val\s*\)/.test(code)){
            violations.push(`${PROD}: migrated M4E2 constant case ${id} may not retain val routing`);
        }
        return violations;
    }

    const guard = variantValues.map(value => `val !== '${value}'`).join(' && ');
    if (!body.includes(`if (${guard}) return;`)){
        violations.push(`${PROD}: migrated M4E2 variant case ${id} must preserve legacy undefined for unknown or missing val`);
    }
    if (!body.includes(`return simpleProduction('${id}', { variant: val });`)){
        violations.push(`${PROD}: migrated M4E2 variant case ${id} must delegate the recognized variant to its canonical calculation`);
    }
    if (/\bswitch\s*\(\s*val\s*\)/.test(code)){
        violations.push(`${PROD}: migrated M4E2 variant case ${id} may not retain the legacy val switch`);
    }
    return violations;
}

function analyzeFactCase(source, id, expectedDelegate){
    const violations = [];
    const body = productionCaseBody(source, id);
    if (body === null){
        return [`${PROD}: migrated M4E2 fact-fed case ${id} is missing or could not be isolated`];
    }
    const code = maskNonCode(body);

    if (/\bcalculateProductionCalculation\s*\(|\bSIMPLE_PRODUCTION_CALCULATION_IDS\b/.test(code)){
        violations.push(`${PROD}: migrated M4E2 fact-fed case ${id} must delegate through simpleProduction() rather than bypassing the compatibility helper`);
    }
    if (/\breturn\s+[-+]?(?:\d|\.\d)/.test(code)){
        violations.push(`${PROD}: migrated M4E2 fact-fed case ${id} may not retain numeric production authority`);
    }
    if (/\b(?:if|switch)\s*\(|(?:===|!==|>=|<=|>|<)|\?/.test(code)){
        violations.push(`${PROD}: migrated M4E2 fact-fed case ${id} may not retain threshold or completion logic`);
    }

    const expectedBody = `{ ${expectedDelegate} }`;
    if (normalizeCode(body) !== normalizeCode(expectedBody)){
        violations.push(`${PROD}: migrated M4E2 fact-fed case ${id} must only snapshot its reviewed explicit fact and delegate to M4`);
    }
    return violations;
}

function analyzeIsolationCase(source, id, expectedDelegate){
    const violations = [];
    const body = productionCaseBody(source, id);
    if (body === null){
        return [`${PROD}: migrated M4E2 Isolation-fed case ${id} is missing or could not be isolated`];
    }
    const code = maskNonCode(body);
    if (/\bcalculateProductionCalculation\s*\(|\bSIMPLE_PRODUCTION_CALCULATION_IDS\b/.test(code)){
        violations.push(`${PROD}: migrated M4E2 Isolation-fed case ${id} must delegate through simpleProduction() rather than bypassing the compatibility helper`);
    }
    // The reviewed Isolation compatibility seam contains variants/booleans only. Any numeric literal here
    // means numeric production authority has leaked back out of the M4 calculation definition.
    if (/(?:\b\d+(?:\.\d*)?|\.\d+\b)/.test(code)){
        violations.push(`${PROD}: migrated M4E2 Isolation-fed case ${id} may not retain numeric production authority`);
    }
    if (/\bswitch\s*\(\s*val\s*\)/.test(code)){
        violations.push(`${PROD}: migrated M4E2 Isolation-fed case ${id} may not retain the legacy val switch`);
    }

    const expectedBody = `{ ${expectedDelegate} }`;
    if (normalizeCode(body) !== normalizeCode(expectedBody)){
        violations.push(`${PROD}: migrated M4E2 Isolation-fed case ${id} must preserve legacy variant/state-read compatibility, snapshot only the reviewed Isolation fact, and delegate to M4`);
    }
    return violations;
}

function analyzeProdSource(source){
    const violations = analyzeHelper(source);
    for (const id of MIGRATED_CONSTANT_IDS){
        violations.push(...analyzeMigratedCase(source, id));
    }
    for (const [id, variants] of Object.entries(MIGRATED_VARIANTS)){
        violations.push(...analyzeMigratedCase(source, id, variants));
    }
    for (const [id, expectedDelegate] of Object.entries(MIGRATED_FACT_CASES)){
        violations.push(...analyzeFactCase(source, id, expectedDelegate));
    }
    for (const [id, expectedDelegate] of Object.entries(MIGRATED_ISOLATION_CASES)){
        violations.push(...analyzeIsolationCase(source, id, expectedDelegate));
    }
    return [...new Set(violations)].sort();
}

function findViolations(root){
    const filename = path.join(root, ...PROD.split('/'));
    if (!fs.existsSync(filename)) return [`${PROD}: required production compatibility module is missing`];
    return analyzeProdSource(fs.readFileSync(filename, 'utf8'));
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length){
        console.error('M4E2 simple production cutover fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M4E2 simple production cutover fitness passed.');
}

module.exports = {
    PROD,
    MIGRATED_CONSTANT_IDS,
    MIGRATED_VARIANTS,
    MIGRATED_FACT_CASES,
    MIGRATED_ISOLATION_CASES,
    productionCaseBody,
    analyzeProdSource,
    findViolations,
};

if (require.main === module) main();
