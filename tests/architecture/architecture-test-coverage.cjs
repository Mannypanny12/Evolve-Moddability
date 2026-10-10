'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ARCHITECTURE_COMMAND_PATTERN = /^node\s+tests\/architecture\/([A-Za-z0-9._-]+\.cjs)$/;
const TEST_SUFFIX = '.test.cjs';
const NON_CUMULATIVE_ARCHITECTURE_TARGETS = new Set([
    'architecture-report.cjs',
]);

function splitCommandChain(script){
    if (typeof script !== 'string' || script.trim().length === 0) return null;
    const commands = script.split('&&').map(command => command.trim());
    return commands.length > 0 && commands.every(Boolean) ? commands : null;
}

function cumulativeArchitectureTargets(architectureRoot){
    return fs.readdirSync(architectureRoot, { withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => entry.name)
        .filter(filename => filename.endsWith('.cjs') && !filename.endsWith(TEST_SUFFIX))
        .filter(filename => !NON_CUMULATIVE_ARCHITECTURE_TARGETS.has(filename))
        .filter(filename => {
            const wrapper = filename.replace(/\.cjs$/, TEST_SUFFIX);
            const wrapperPath = path.join(architectureRoot, wrapper);
            return fs.existsSync(wrapperPath) && fs.statSync(wrapperPath).isFile();
        })
        .sort();
}

function architectureTestCoverageViolations(root){
    const violations = [];
    const packagePath = path.join(root, 'package.json');
    const architectureRoot = path.join(root, 'tests', 'architecture');

    if (!fs.existsSync(packagePath) || !fs.statSync(packagePath).isFile()){
        return ['package.json: package manifest is missing'];
    }
    if (!fs.existsSync(architectureRoot) || !fs.statSync(architectureRoot).isDirectory()){
        return ['tests/architecture: architecture test directory is missing'];
    }

    let packageJson;
    try {
        packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    }
    catch (error){
        return [`package.json: package manifest could not be parsed: ${error.message}`];
    }

    const commands = splitCommandChain(packageJson.scripts?.['test:architecture']);
    if (!commands){
        return ['package.json: scripts.test:architecture must be a non-empty inspectable &&-chained command sequence'];
    }

    const targetCounts = new Map();
    for (const command of commands){
        const match = ARCHITECTURE_COMMAND_PATTERN.exec(command);
        if (!match){
            violations.push(`package.json: architecture command must be a direct node invocation under tests/architecture: ${JSON.stringify(command)}`);
            continue;
        }

        const filename = match[1];
        targetCounts.set(filename, (targetCounts.get(filename) || 0) + 1);

        const gatePath = path.join(architectureRoot, filename);
        if (!fs.existsSync(gatePath) || !fs.statSync(gatePath).isFile()){
            violations.push(`tests/architecture/${filename}: architecture gate referenced by package.json is missing`);
            continue;
        }
        if (fs.lstatSync(gatePath).isSymbolicLink()){
            violations.push(`tests/architecture/${filename}: architecture gate may not be a symbolic link`);
        }

        const wrapper = filename.replace(/\.cjs$/, TEST_SUFFIX);
        const wrapperPath = path.join(architectureRoot, wrapper);
        if (!fs.existsSync(wrapperPath) || !fs.statSync(wrapperPath).isFile()){
            violations.push(`tests/architecture/${filename}: direct architecture gate is missing npm-test wrapper ${wrapper}`);
            continue;
        }
        if (fs.lstatSync(wrapperPath).isSymbolicLink()){
            violations.push(`tests/architecture/${wrapper}: npm-test wrapper may not be a symbolic link`);
        }
    }

    for (const [filename, count] of [...targetCounts.entries()].sort(([a], [b]) => a.localeCompare(b))){
        if (count !== 1){
            violations.push(`tests/architecture/${filename}: architecture gate must appear exactly once in scripts.test:architecture; found ${count}`);
        }
    }

    for (const filename of cumulativeArchitectureTargets(architectureRoot)){
        if (!targetCounts.has(filename)){
            violations.push(`tests/architecture/${filename}: cumulative architecture gate with npm-test wrapper is missing from scripts.test:architecture`);
        }
    }

    return [...new Set(violations)].sort();
}

function main(){
    const root = path.resolve(__dirname, '..', '..');
    const violations = architectureTestCoverageViolations(root);
    if (violations.length){
        console.error('Architecture npm-test coverage violations:');
        for (const violation of violations) console.error('- ' + violation);
        process.exitCode = 1;
        return;
    }
    console.log('Architecture npm-test coverage checks passed.');
}

module.exports = {
    ARCHITECTURE_COMMAND_PATTERN,
    NON_CUMULATIVE_ARCHITECTURE_TARGETS,
    splitCommandChain,
    cumulativeArchitectureTargets,
    architectureTestCoverageViolations,
};

if (require.main === module){
    main();
}
