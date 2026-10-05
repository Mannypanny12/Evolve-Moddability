'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const COMMAND_ROOT = 'src/engine/commands';
const IDENTITY_FILE = 'src/engine/identity.mjs';

function normalize(relativePath){
    return relativePath.split(path.sep).join('/');
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

function resolveRelative(fromRelativePath, specifier){
    let target = path.posix.normalize(path.posix.join(path.posix.dirname(fromRelativePath), specifier));
    if (!path.posix.extname(target)) target += '.mjs';
    return target;
}

function analyzeCommandModule(source, relativePath){
    const violations = [];
    const code = maskNonCode(source);

    if (/\b(?:mutationAuthority|createMutationScope)\b/.test(code)){
        violations.push(`${relativePath}: M3A1 command modules may not reference raw GameState mutation authority`);
    }

    for (const reference of extractModuleReferences(source, relativePath)){
        if (reference.kind === 'dynamic-import'){
            violations.push(`${relativePath}: M3A1 command modules may not use dynamic import`);
        }
        const specifier = reference.specifier;
        if (!specifier.startsWith('.')){
            violations.push(`${relativePath}: M3A1 command modules may not import external packages: ${specifier}`);
            continue;
        }
        const target = resolveRelative(relativePath, specifier);
        if (target === IDENTITY_FILE) continue;
        if (target === 'src/engine/registry.mjs'){
            violations.push(`${relativePath}: executable command handlers may not use the inert definition Registry`);
            continue;
        }
        if (target.startsWith('src/engine/state/')){
            violations.push(`${relativePath}: command bus layer may not import GameState/state infrastructure: ${target}`);
            continue;
        }
        if (!target.startsWith(`${COMMAND_ROOT}/`)){
            violations.push(`${relativePath}: command modules may import only identity.mjs or sibling command modules: ${target}`);
        }
    }

    return violations;
}

function findViolations(root){
    const commandDir = path.join(root, ...COMMAND_ROOT.split('/'));
    if (!fs.existsSync(commandDir)){
        return ['M3A1 command source directory is missing'];
    }
    const violations = [];
    for (const filename of listSourceFiles(commandDir)){
        const relative = normalize(path.relative(root, filename));
        violations.push(...analyzeCommandModule(fs.readFileSync(filename, 'utf8'), relative));
    }
    return violations;
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M3A1 command boundary fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3A1 command boundary fitness passed.');
}

module.exports = { analyzeCommandModule, findViolations };

if (require.main === module) main();
