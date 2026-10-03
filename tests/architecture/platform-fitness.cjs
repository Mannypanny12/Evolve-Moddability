'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
    buildImportGraph,
    extractModuleReferences,
    listEngineSourceFilesRecursive,
    maskNonCode,
    stronglyConnectedComponents,
} = require('./architecture-fitness.cjs');

function isInside(root, target){
    const relative = path.relative(path.resolve(root), path.resolve(target));
    return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function engineRuntimeDependencyViolations(source, filename){
    const code = maskNonCode(source);
    const violations = [];
    const rules = [
        ['legacy global symbol', /\bglobal\b/],
        ['direct console diagnostics', /\bconsole\s*(?:\.|\[)/],
        ['direct timer/scheduler API', /\b(?:setTimeout|clearTimeout|setInterval|clearInterval|setImmediate|clearImmediate|queueMicrotask|requestAnimationFrame|cancelAnimationFrame|requestIdleCallback|cancelIdleCallback)\s*\(/],
        ['direct crypto random source', /\bcrypto\s*\.\s*(?:getRandomValues|randomUUID)\s*\(/],
    ];

    for (const [label, pattern] of rules){
        if (pattern.test(code)){
            violations.push(filename + ': forbidden M1C engine dependency: ' + label);
        }
    }
    return violations;
}

function platformSourceViolations(source, filename, roots){
    const code = maskNonCode(source);
    const violations = [];

    if (/\bglobal\b/.test(code)){
        violations.push(filename + ': forbidden platform dependency: legacy global');
    }
    if (/\brequire\s*\(/.test(code)){
        violations.push(filename + ': forbidden platform dependency: CommonJS require()');
    }

    for (const reference of extractModuleReferences(source, filename)){
        const specifier = reference.specifier;
        if (!specifier.startsWith('.')) continue;

        const resolved = path.resolve(path.dirname(filename), specifier);
        if (isInside(roots.platformRoot, resolved) || isInside(roots.engineRoot, resolved)){
            continue;
        }

        const relative = path.relative(roots.srcRoot, resolved);
        const display = relative.startsWith('..') ? resolved : 'src/' + relative.split(path.sep).join('/');
        violations.push(
            filename + ': platform import escapes allowed platform/engine layers: ' + specifier + ' -> ' + display
        );
    }

    return violations;
}

function platformCycleViolations(platformFiles){
    const graph = buildImportGraph(platformFiles);
    const violations = [];

    for (const component of stronglyConnectedComponents(graph)){
        if (component.length > 1){
            violations.push('src/platform import cycle: ' + component.join(' -> '));
        }
        else if ((graph.get(component[0]) || []).includes(component[0])){
            violations.push('src/platform self-import cycle: ' + component[0]);
        }
    }
    return violations;
}

function scanPlatform(root){
    const srcRoot = path.join(root, 'src');
    const engineRoot = path.join(srcRoot, 'engine');
    const platformRoot = path.join(srcRoot, 'platform');
    const roots = { srcRoot, engineRoot, platformRoot };
    const engineFiles = listEngineSourceFilesRecursive(engineRoot);
    const platformFiles = listEngineSourceFilesRecursive(platformRoot);
    const violations = [];

    for (const file of engineFiles){
        const source = fs.readFileSync(file, 'utf8');
        violations.push(...engineRuntimeDependencyViolations(source, file));
    }

    for (const file of platformFiles){
        const source = fs.readFileSync(file, 'utf8');
        violations.push(...platformSourceViolations(source, file, roots));
    }
    violations.push(...platformCycleViolations(platformFiles));

    return {
        violations,
        summary: {
            engineFileCount: engineFiles.length,
            platformFileCount: platformFiles.length,
        },
    };
}

function runPlatformArchitectureCheck(root, logger = console){
    const result = scanPlatform(root);
    logger.log('M1C runtime/platform architecture fitness summary:');
    logger.log(JSON.stringify(result.summary, null, 2));

    if (result.violations.length > 0){
        logger.error('\nM1C runtime/platform architecture fitness violations:');
        for (const violation of result.violations){
            logger.error('- ' + violation);
        }
        return { exitCode: 1, result };
    }

    logger.log('\nM1C runtime/platform architecture fitness gate passed.');
    return { exitCode: 0, result };
}

function main(){
    const root = path.resolve(__dirname, '..', '..');
    const outcome = runPlatformArchitectureCheck(root);
    process.exitCode = outcome.exitCode;
}

module.exports = {
    isInside,
    engineRuntimeDependencyViolations,
    platformSourceViolations,
    platformCycleViolations,
    scanPlatform,
    runPlatformArchitectureCheck,
};

if (require.main === module){
    main();
}
