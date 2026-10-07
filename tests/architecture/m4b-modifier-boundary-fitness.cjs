'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { productionCalculationConsumers } = require('./m4a-calculation-boundary-fitness.cjs');

const REQUIRED_FILES = Object.freeze([
    'src/engine/calculations/modifier-contract.mjs',
    'src/engine/calculations/modifier-pipeline.mjs',
]);

function findViolations(root){
    const violations = [];
    for (const relative of REQUIRED_FILES){
        if (!fs.existsSync(path.join(root, relative))){
            violations.push(`${relative}: required M4B modifier pipeline file is missing`);
        }
    }

    const enginePath = path.join(root, 'src/engine/calculations/calculation-engine.mjs');
    if (!fs.existsSync(enginePath)){
        violations.push('src/engine/calculations/calculation-engine.mjs: M4B calculation engine is missing');
    }
    else {
        const engineSource = fs.readFileSync(enginePath, 'utf8');
        if (!engineSource.includes("import { createModifierPipeline } from './modifier-pipeline.mjs';")){
            violations.push('calculation-engine.mjs: M4B must compose the modifier pipeline through the existing calculation runner');
        }
        if (!engineSource.includes("allowed: ['registrations', 'modifiers']")){
            violations.push('calculation-engine.mjs: M4B modifiers must be fixed engine-construction registrations');
        }
        if (/\b(?:registerModifier|unregisterModifier|addModifier|removeModifier)\b/.test(engineSource)){
            violations.push('calculation-engine.mjs: M4B must not expose dynamic modifier registration authority');
        }
    }

    const production = productionCalculationConsumers(root);
    for (const consumer of production.consumers){
        violations.push(`${consumer}: M4B must retain zero production calculation consumers before reviewed M4D cutover`);
    }

    return [...new Set(violations)].sort();
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M4B modifier boundary fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M4B modifier boundary fitness passed.');
}

module.exports = { REQUIRED_FILES, findViolations };

if (require.main === module) main();
