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

function bridgeSourceViolations(source, filename, roots){
    const code = maskNonCode(source);
    const violations = [];
    const rules = [
        ['direct legacy global access', /\bglobal\b/],
        ['browser window', /\bwindow\b/],
        ['DOM document', /\bdocument\b/],
        ['browser navigator', /\bnavigator\b/],
        ['platform globalThis', /\bglobalThis\b/],
        ['jQuery', /\bjQuery\b|\$\s*\(/],
        ['Vue', /\bVue\b/],
        ['direct storage', /\blocalStorage\b|\bsave\s*\.\s*(?:getItem|setItem|removeItem|clear)\s*\(/],
        ['direct wall clock', /\bDate\s*(?:\.\s*now\s*\(|\()|\bnew\s+Date\s*\(|\bperformance\s*\.\s*now\s*\(/],
        ['direct random source', /\bMath\s*\.\s*(?:random|rand)\s*\(|\bcrypto\s*\.\s*(?:getRandomValues|randomUUID)\s*\(/],
        ['direct console diagnostics', /\bconsole\s*(?:\.|\[)/],
        ['direct timer/scheduler API', /\b(?:setTimeout|clearTimeout|setInterval|clearInterval|setImmediate|clearImmediate|queueMicrotask|requestAnimationFrame|cancelAnimationFrame|requestIdleCallback|cancelIdleCallback)\s*\(/],
        ['CommonJS require()', /\brequire\s*\(/],
    ];

    for (const [label, pattern] of rules){
        if (pattern.test(code)) violations.push(filename + ': forbidden legacy bridge dependency: ' + label);
    }

    for (const reference of extractModuleReferences(source, filename)){
        const specifier = reference.specifier;
        if (!specifier.startsWith('.')){
            violations.push(filename + ': legacy bridge bare/package import is forbidden: ' + specifier);
            continue;
        }
        const resolved = path.resolve(path.dirname(filename), specifier);
        if (isInside(roots.bridgeRoot, resolved) || isInside(roots.engineRoot, resolved)) continue;
        const relative = path.relative(roots.srcRoot, resolved);
        const display = relative.startsWith('..') ? resolved : 'src/' + relative.split(path.sep).join('/');
        violations.push(filename + ': legacy bridge import escapes bridge/engine layers: ' + specifier + ' -> ' + display);
    }

    return violations;
}

function bridgeCycleViolations(files){
    const graph = buildImportGraph(files);
    const violations = [];
    for (const component of stronglyConnectedComponents(graph)){
        if (component.length > 1){
            violations.push('src/legacy/bridge import cycle: ' + component.join(' -> '));
        }
        else if ((graph.get(component[0]) || []).includes(component[0])){
            violations.push('src/legacy/bridge self-import cycle: ' + component[0]);
        }
    }
    return violations;
}

function scanLegacyBridge(root){
    const srcRoot = path.join(root, 'src');
    const engineRoot = path.join(srcRoot, 'engine');
    const bridgeRoot = path.join(srcRoot, 'legacy', 'bridge');
    const roots = { srcRoot, engineRoot, bridgeRoot };
    const bridgeFiles = listEngineSourceFilesRecursive(bridgeRoot);
    const violations = [];

    for (const file of bridgeFiles){
        const source = fs.readFileSync(file, 'utf8');
        violations.push(...bridgeSourceViolations(source, file, roots));
    }
    violations.push(...bridgeCycleViolations(bridgeFiles));

    return {
        violations,
        summary: { bridgeFileCount: bridgeFiles.length },
    };
}

function runLegacyBridgeArchitectureCheck(root, logger = console){
    const result = scanLegacyBridge(root);
    logger.log('M1D legacy bridge architecture fitness summary:');
    logger.log(JSON.stringify(result.summary, null, 2));

    if (result.violations.length > 0){
        logger.error('\nM1D legacy bridge architecture fitness violations:');
        for (const violation of result.violations) logger.error('- ' + violation);
        return { exitCode: 1, result };
    }

    logger.log('\nM1D legacy bridge architecture fitness gate passed.');
    return { exitCode: 0, result };
}

function main(){
    const root = path.resolve(__dirname, '..', '..');
    const outcome = runLegacyBridgeArchitectureCheck(root);
    process.exitCode = outcome.exitCode;
}

module.exports = {
    isInside,
    bridgeSourceViolations,
    bridgeCycleViolations,
    scanLegacyBridge,
    runLegacyBridgeArchitectureCheck,
};

if (require.main === module) main();
