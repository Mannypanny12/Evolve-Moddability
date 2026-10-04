'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { maskNonCode } = require('./architecture-fitness.cjs');

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

function listEngineSources(dir){
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...listEngineSources(full));
        else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
    }
    return files.sort();
}

function dynamicLoaderViolationsForSource(source, label){
    const code = maskNonCode(source);
    const violations = [];
    if (/\bimport\s*\(/.test(code)){
        violations.push(`${label}: M2E2 engine code may not use dynamic import(); state-capability module loading must remain statically reviewable`);
    }
    if (/\brequire\s*\(/.test(code)){
        violations.push(`${label}: M2E2 engine code may not use runtime require(); state-capability module loading must remain statically reviewable`);
    }
    return violations;
}

function scanDynamicEngineLoaders(root){
    const violations = [];
    const engineRoot = path.join(root, 'src', 'engine');
    for (const file of listEngineSources(engineRoot)){
        const label = path.relative(root, file).split(path.sep).join('/');
        violations.push(...dynamicLoaderViolationsForSource(fs.readFileSync(file, 'utf8'), label));
    }
    return violations.sort();
}

function runDynamicLoaderHardening(root, logger = console){
    const violations = scanDynamicEngineLoaders(root);
    const summary = { violationCount: violations.length };
    logger.log('M2E2 dynamic-loader hardening summary:');
    logger.log(JSON.stringify(summary, null, 2));
    if (violations.length){
        logger.error('\nM2E2 dynamic-loader hardening violations:');
        for (const violation of violations) logger.error('- ' + violation);
        return { exitCode: 1, result: { summary, violations } };
    }
    logger.log('\nM2E2 dynamic-loader hardening gate passed.');
    return { exitCode: 0, result: { summary, violations } };
}

function main(){
    const root = path.resolve(__dirname, '..', '..');
    process.exitCode = runDynamicLoaderHardening(root).exitCode;
}

module.exports = {
    dynamicLoaderViolationsForSource,
    scanDynamicEngineLoaders,
    runDynamicLoaderHardening,
};

if (require.main === module) main();
