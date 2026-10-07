'use strict';

const fs = require('node:fs');
const path = require('node:path');

const COST_ROOT = 'src/engine/costs';
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

// These are first-party Evolve payment concepts, not generic cost-engine vocabulary.
// Generic D4 contracts may use terms such as prestige, special, pool, paymentId,
// resourceId, and source descriptors, but these concrete gameplay names must stay
// in first-party mapping/adaptation code outside src/engine/**.
const FIRST_PARTY_SPECIAL_PAYMENT_TERMS = [
    'Plasmid',
    'AntiPlasmid',
    'Supply',
    'Knowledge',
    'Species',
];

function normalize(value){
    return value.split(path.sep).join('/');
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

function termPattern(term){
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i');
}

function analyzeCostSource(source, relativePath = 'src/engine/costs/example.mjs'){
    const violations = [];
    for (const term of FIRST_PARTY_SPECIAL_PAYMENT_TERMS){
        if (termPattern(term).test(source)){
            violations.push(
                `${relativePath}: generic M3D cost source may not contain first-party special-payment term ${term}`
            );
        }
    }
    return violations;
}

function findViolations(root){
    const costDir = path.join(root, ...COST_ROOT.split('/'));
    if (!fs.existsSync(costDir)) return ['M3D cost source directory is missing'];

    const violations = [];
    for (const filename of listSourceFiles(costDir)){
        const relativePath = normalize(path.relative(root, filename));
        violations.push(...analyzeCostSource(fs.readFileSync(filename, 'utf8'), relativePath));
    }
    return violations;
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M3D4A special-payment boundary fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3D4A special-payment boundary fitness passed.');
}

module.exports = {
    FIRST_PARTY_SPECIAL_PAYMENT_TERMS,
    analyzeCostSource,
    findViolations,
};

if (require.main === module) main();
