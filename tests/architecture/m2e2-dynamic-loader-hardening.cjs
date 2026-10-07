'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { maskNonCode } = require('./architecture-fitness.cjs');
const { GAME_STATE_FILE } = require('./m2e2-mutation-boundary-fitness.cjs');

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

function listEngineSources(dir){
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()){
            files.push(...listEngineSources(full));
            continue;
        }
        if (entry.isSymbolicLink()){
            try {
                if (fs.statSync(full).isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
            }
            catch {
                // Canonical capability scanning reports broken production symlinks.
            }
            continue;
        }
        if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
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

function countCodeIdentifier(source, identifier){
    const matches = maskNonCode(source).match(new RegExp(`\\b${identifier}\\b`, 'g'));
    return matches ? matches.length : 0;
}

function gameStatePrimitiveAliasViolations(source){
    const violations = [];
    if (countCodeIdentifier(source, 'createStateStore') !== 2){
        violations.push('M2E2 GameState may reference createStateStore only in its static import and the single reviewed direct infrastructure call; aliases or extra uses are forbidden');
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
    const gameStateFile = path.join(root, ...GAME_STATE_FILE.split('/'));
    if (fs.existsSync(gameStateFile)){
        violations.push(...gameStatePrimitiveAliasViolations(fs.readFileSync(gameStateFile, 'utf8')));
    }
    return violations.sort();
}

function runDynamicLoaderHardening(root, logger = console){
    const violations = scanDynamicEngineLoaders(root);
    const summary = { violationCount: violations.length };
    logger.log('M2E2 dynamic-loader and primitive-alias hardening summary:');
    logger.log(JSON.stringify(summary, null, 2));
    if (violations.length){
        logger.error('\nM2E2 dynamic-loader and primitive-alias hardening violations:');
        for (const violation of violations) logger.error('- ' + violation);
        return { exitCode: 1, result: { summary, violations } };
    }
    logger.log('\nM2E2 dynamic-loader and primitive-alias hardening gate passed.');
    return { exitCode: 0, result: { summary, violations } };
}

function main(){
    const root = path.resolve(__dirname, '..', '..');
    process.exitCode = runDynamicLoaderHardening(root).exitCode;
}

module.exports = {
    dynamicLoaderViolationsForSource,
    countCodeIdentifier,
    gameStatePrimitiveAliasViolations,
    scanDynamicEngineLoaders,
    runDynamicLoaderHardening,
};

if (require.main === module) main();
