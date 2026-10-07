'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { maskNonCode, extractModuleReferences } = require('./architecture-fitness.cjs');
const { scanLegacyBridge } = require('./legacy-bridge-fitness.cjs');
const { findViolations: findConditionViolations } = require('./m3b1-condition-boundary-fitness.cjs');

const ADAPTER = 'src/legacy/bridge/evolve-condition-read-adapter.mjs';
const ALLOWED_IMPORTS = new Set([
    '../../engine/identity.mjs',
    '../../engine/conditions/common.mjs',
    './evolve-mappings.mjs',
    './reviewed-reactive-resource-field.mjs',
]);

function normalize(relativePath){
    return relativePath.split(path.sep).join('/');
}

function findM3B3Violations(root){
    const violations = [];
    const adapterPath = path.join(root, ...ADAPTER.split('/'));
    if (!fs.existsSync(adapterPath)){
        return ['M3B3 legacy condition adapter is missing'];
    }

    const bridge = scanLegacyBridge(root);
    violations.push(...bridge.violations.map(item => `M3B3 closure inherits bridge violation: ${item}`));
    violations.push(...findConditionViolations(root).map(item => `M3B3 closure inherits condition violation: ${item}`));

    const source = fs.readFileSync(adapterPath, 'utf8');
    const code = maskNonCode(source);
    const forbidden = [
        ['legacy root singleton', /\b(?:global|globalThis)\b/],
        ['legacy state module', /\b(?:setGlobal|vars\.js)\b/],
        ['legacy action execution', /\b(?:actions\.js|payCosts|modRes|runAction|postBuild)\b/],
        ['mutation authority', /\b(?:mutationAuthority|createMutationScope)\b/],
        ['dynamic code', /\b(?:eval|Function)\s*\(/],
    ];
    for (const [label, pattern] of forbidden){
        if (pattern.test(code)){
            violations.push(`${ADAPTER}: forbidden M3B3 compatibility dependency: ${label}`);
        }
    }

    for (const reference of extractModuleReferences(source, ADAPTER)){
        if (reference.kind === 'dynamic-import'){
            violations.push(`${ADAPTER}: dynamic imports are forbidden`);
        }
        if (!ALLOWED_IMPORTS.has(reference.specifier)){
            violations.push(`${ADAPTER}: unsupported import ${reference.specifier}`);
        }
    }

    const conditionsRoot = path.join(root, 'src', 'engine', 'conditions');
    for (const entry of fs.readdirSync(conditionsRoot, { withFileTypes: true })){
        if (!entry.isFile() || !/\.(?:mjs|js|cjs)$/.test(entry.name)) continue;
        const filename = path.join(conditionsRoot, entry.name);
        const conditionSource = fs.readFileSync(filename, 'utf8');
        for (const reference of extractModuleReferences(conditionSource, normalize(path.relative(root, filename)))){
            if (reference.specifier.includes('legacy/bridge')){
                violations.push(`${normalize(path.relative(root, filename))}: engine condition code may not import the M3B3 legacy bridge`);
            }
        }
    }

    return violations;
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findM3B3Violations(root);
    if (violations.length > 0){
        console.error('M3B3 condition closure fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3B3 condition closure fitness passed.');
}

module.exports = { findM3B3Violations };

if (require.main === module) main();
