'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { maskNonCode } = require('./architecture-fitness.cjs');

const ARCHITECTURE_COMMAND_PATTERN = /^node\s+tests\/architecture\/([A-Za-z0-9._-]+\.cjs)$/;
const TEST_SUFFIX = '.test.cjs';
const DIRECT_GATE_ENTRYPOINT_PATTERN = /\brequire\s*\.\s*main\s*===\s*module\b/;
const DIRECT_GATE_REFERENCE_PATTERN = /\brequire\s*\.\s*main\b/;
const NON_CUMULATIVE_ARCHITECTURE_TARGETS = new Set([
    'architecture-report.cjs',
]);

function splitCommandChain(script){
    if (typeof script !== 'string' || script.trim().length === 0) return null;
    const commands = script.split('&&').map(command => command.trim());
    return commands.length > 0 && commands.every(Boolean) ? commands : null;
}

function lstatOrNull(filename){
    try {
        return fs.lstatSync(filename);
    }
    catch (error){
        if (error?.code === 'ENOENT') return null;
        throw error;
    }
}

function architectureSourceNames(architectureRoot){
    return fs.readdirSync(architectureRoot, { withFileTypes: true })
        .filter(entry => entry.isFile() || entry.isSymbolicLink())
        .map(entry => entry.name)
        .filter(filename => filename.endsWith('.cjs') && !filename.endsWith(TEST_SUFFIX))
        .filter(filename => !NON_CUMULATIVE_ARCHITECTURE_TARGETS.has(filename))
        .sort();
}

function wrapperPathFor(architectureRoot, filename){
    return path.join(architectureRoot, filename.replace(/\.cjs$/, TEST_SUFFIX));
}

function sourceDirectGateInfo(architectureRoot, filename){
    const gatePath = path.join(architectureRoot, filename);
    const gateStat = lstatOrNull(gatePath);
    if (gateStat === null || !gateStat.isFile()){
        return {
            gateStat,
            source: '',
            referencesDirectEntrypoint: false,
            hasCanonicalEntrypoint: false,
        };
    }
    const source = fs.readFileSync(gatePath, 'utf8');
    const code = maskNonCode(source);
    return {
        gateStat,
        source,
        referencesDirectEntrypoint: DIRECT_GATE_REFERENCE_PATTERN.test(code),
        hasCanonicalEntrypoint: DIRECT_GATE_ENTRYPOINT_PATTERN.test(code),
    };
}

function cumulativeArchitectureTargets(architectureRoot){
    return architectureSourceNames(architectureRoot)
        .filter(filename => {
            const info = sourceDirectGateInfo(architectureRoot, filename);
            if (!info.referencesDirectEntrypoint) return false;
            const wrapperStat = lstatOrNull(wrapperPathFor(architectureRoot, filename));
            return wrapperStat !== null && (wrapperStat.isFile() || wrapperStat.isSymbolicLink());
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

    const cumulativeTargets = cumulativeArchitectureTargets(architectureRoot);
    for (const filename of architectureSourceNames(architectureRoot)){
        const info = sourceDirectGateInfo(architectureRoot, filename);
        const wrapperPath = wrapperPathFor(architectureRoot, filename);
        const wrapperStat = lstatOrNull(wrapperPath);
        const hasWrapper = wrapperStat !== null && (wrapperStat.isFile() || wrapperStat.isSymbolicLink());

        if (info.gateStat?.isSymbolicLink()){
            violations.push(`tests/architecture/${filename}: architecture source may not be a symbolic link`);
            continue;
        }
        if (!info.referencesDirectEntrypoint) continue;

        if (!info.hasCanonicalEntrypoint){
            violations.push(`tests/architecture/${filename}: architecture gate must use the canonical if (require.main === module) direct-entrypoint convention`);
        }
        if (!hasWrapper){
            violations.push(`tests/architecture/${filename}: executable architecture gate is missing same-name npm-test wrapper ${filename.replace(/\.cjs$/, TEST_SUFFIX)}`);
        }
        else if (wrapperStat.isSymbolicLink()){
            violations.push(`tests/architecture/${path.basename(wrapperPath)}: npm-test wrapper may not be a symbolic link`);
        }
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
        const gateStat = lstatOrNull(gatePath);
        if (gateStat === null || (!gateStat.isFile() && !gateStat.isSymbolicLink())){
            violations.push(`tests/architecture/${filename}: architecture gate referenced by package.json is missing`);
            continue;
        }
        if (gateStat.isSymbolicLink()){
            violations.push(`tests/architecture/${filename}: architecture gate may not be a symbolic link`);
            continue;
        }

        const wrapper = filename.replace(/\.cjs$/, TEST_SUFFIX);
        const wrapperPath = path.join(architectureRoot, wrapper);
        const wrapperStat = lstatOrNull(wrapperPath);
        if (wrapperStat === null || (!wrapperStat.isFile() && !wrapperStat.isSymbolicLink())){
            violations.push(`tests/architecture/${filename}: direct architecture gate is missing npm-test wrapper ${wrapper}`);
            continue;
        }
        if (wrapperStat.isSymbolicLink()){
            violations.push(`tests/architecture/${wrapper}: npm-test wrapper may not be a symbolic link`);
        }
        const source = fs.readFileSync(gatePath, 'utf8');
        if (!DIRECT_GATE_ENTRYPOINT_PATTERN.test(maskNonCode(source))){
            violations.push(`tests/architecture/${filename}: direct architecture command must use the canonical if (require.main === module) entrypoint`);
        }
    }

    for (const [filename, count] of [...targetCounts.entries()].sort(([a], [b]) => a.localeCompare(b))){
        if (count !== 1){
            violations.push(`tests/architecture/${filename}: architecture gate must appear exactly once in scripts.test:architecture; found ${count}`);
        }
    }

    for (const filename of cumulativeTargets){
        if (!targetCounts.has(filename)){
            violations.push(`tests/architecture/${filename}: executable architecture gate with npm-test wrapper is missing from scripts.test:architecture`);
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
    DIRECT_GATE_ENTRYPOINT_PATTERN,
    DIRECT_GATE_REFERENCE_PATTERN,
    NON_CUMULATIVE_ARCHITECTURE_TARGETS,
    splitCommandChain,
    architectureSourceNames,
    sourceDirectGateInfo,
    cumulativeArchitectureTargets,
    architectureTestCoverageViolations,
};

if (require.main === module){
    main();
}
