'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const CONDITION_ROOT = 'src/engine/conditions';
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

function analyzeConditionModule(source, relativePath){
    const violations = [];
    const code = maskNonCode(source);

    if (/\b(?:mutationAuthority|createMutationScope)\b/.test(code)){
        violations.push(`${relativePath}: M3B1 condition modules may not reference raw GameState mutation authority`);
    }
    if (/\b(?:global|document|window|localStorage|jQuery|Vue)\b/.test(code) || /\$\s*\(/.test(code)){
        violations.push(`${relativePath}: M3B1 condition modules may not access legacy globals or UI/platform objects`);
    }

    for (const reference of extractModuleReferences(source, relativePath)){
        if (reference.kind === 'dynamic-import'){
            violations.push(`${relativePath}: M3B1 condition modules may not use dynamic import`);
        }
        const specifier = reference.specifier;
        if (!specifier.startsWith('.')){
            violations.push(`${relativePath}: M3B1 condition modules may not import external packages: ${specifier}`);
            continue;
        }
        const target = resolveRelative(relativePath, specifier);
        if (target === IDENTITY_FILE) continue;
        if (target === 'src/engine/registry.mjs'){
            violations.push(`${relativePath}: condition evaluation may not depend on the inert definition Registry`);
            continue;
        }
        if (target.startsWith('src/engine/state/')){
            violations.push(`${relativePath}: condition kernel may not import GameState/state infrastructure: ${target}`);
            continue;
        }
        if (target.startsWith('src/engine/commands/')){
            violations.push(`${relativePath}: condition kernel may not depend on command execution modules: ${target}`);
            continue;
        }
        if (target.startsWith('src/legacy/') || target.startsWith('src/platform/')){
            violations.push(`${relativePath}: condition kernel may not depend on legacy/platform adapters: ${target}`);
            continue;
        }
        if (!target.startsWith(`${CONDITION_ROOT}/`)){
            violations.push(`${relativePath}: condition modules may import only identity.mjs or sibling condition modules: ${target}`);
        }
    }

    return violations;
}

function findViolations(root){
    const conditionDir = path.join(root, ...CONDITION_ROOT.split('/'));
    if (!fs.existsSync(conditionDir)){
        return ['M3B1 condition source directory is missing'];
    }
    const violations = [];
    for (const filename of listSourceFiles(conditionDir)){
        const relative = normalize(path.relative(root, filename));
        violations.push(...analyzeConditionModule(fs.readFileSync(filename, 'utf8'), relative));
    }
    return violations;
}

function main(){
    const root = path.resolve(__dirname, '../..');
    const violations = findViolations(root);
    if (violations.length > 0){
        console.error('M3B1 condition boundary fitness failed:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exitCode = 1;
        return;
    }
    console.log('M3B1 condition boundary fitness passed.');
}

module.exports = { analyzeConditionModule, findViolations };

if (require.main === module) main();
