'use strict';

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const METRIC_KEYS = ['global', 'browser', 'storage', 'clock', 'random'];
const ENGINE_SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const FORBIDDEN_ENGINE_PACKAGE_PREFIXES = ['jquery', 'vue', '@vue/', 'buefy'];

function countMatches(code, pattern){
    const matches = code.match(pattern);
    return matches ? matches.length : 0;
}

function measureLegacySource(source){
    const code = maskNonCode(source, { maskRegex: false });
    return {
        global: countMatches(code, /\bglobal\s*(?:\.|\[)/g),
        browser:
            countMatches(code, /\$\s*\(/g) +
            countMatches(code, /\bjQuery\b/g) +
            countMatches(code, /\bdocument\b/g) +
            countMatches(code, /\bwindow\b/g) +
            countMatches(code, /\bVue\b/g) +
            countMatches(code, /\bnavigator\b/g),
        storage:
            countMatches(code, /\blocalStorage\b/g) +
            countMatches(code, /\bsave\s*\.\s*(?:getItem|setItem|removeItem|clear)\s*\(/g),
        clock:
            countMatches(code, /\bDate\s*\.\s*now\s*\(/g) +
            countMatches(code, /\bnew\s+Date\s*\(/g),
        random:
            countMatches(code, /\bMath\s*\.\s*random\s*\(/g) +
            countMatches(code, /\bMath\s*\.\s*rand\s*\(/g),
    };
}

function isLikelyRegexStart(source, index){
    let cursor = index - 1;
    while (cursor >= 0 && /\s/.test(source[cursor])) cursor--;
    if (cursor < 0) return true;

    const previous = source[cursor];
    if ('([{:;,=!?&|+-*%^|<>'.includes(previous)) return true;
    if (previous === '>' && source[cursor - 1] === '=') return true;

    const end = cursor + 1;
    while (cursor >= 0 && /[A-Za-z_$]/.test(source[cursor])) cursor--;
    const word = source.slice(cursor + 1, end);
    return ['return', 'throw', 'case', 'delete', 'void', 'typeof', 'instanceof', 'in', 'of', 'yield', 'await'].includes(word);
}

function maskNonCode(source, { maskRegex = true } = {}){
    const out = source.split('');
    let mode = 'code';
    const interpolationDepth = [];
    let regexClass = false;

    const mask = index => {
        if (source[index] !== '\n' && source[index] !== '\r') out[index] = ' ';
    };

    for (let i = 0; i < source.length; i++){
        const ch = source[i];
        const next = source[i + 1];

        if (mode === 'line-comment'){
            mask(i);
            if (ch === '\n') mode = 'code';
            continue;
        }

        if (mode === 'block-comment'){
            mask(i);
            if (ch === '*' && next === '/'){
                mask(i + 1);
                i++;
                mode = 'code';
            }
            continue;
        }

        if (mode === 'single' || mode === 'double'){
            mask(i);
            const quote = mode === 'single' ? "'" : '"';
            if (ch === '\\'){
                if (i + 1 < source.length){
                    mask(i + 1);
                    i++;
                }
            }
            else if (ch === quote){
                mode = 'code';
            }
            continue;
        }

        if (mode === 'template'){
            mask(i);
            if (ch === '\\'){
                if (i + 1 < source.length){
                    mask(i + 1);
                    i++;
                }
            }
            else if (ch === '`'){
                mode = 'code';
            }
            else if (ch === '$' && next === '{'){
                mask(i + 1);
                i++;
                interpolationDepth.push(1);
                mode = 'code';
            }
            continue;
        }

        if (mode === 'regex'){
            mask(i);
            if (ch === '\\'){
                if (i + 1 < source.length){
                    mask(i + 1);
                    i++;
                }
                continue;
            }
            if (ch === '['){
                regexClass = true;
                continue;
            }
            if (ch === ']' && regexClass){
                regexClass = false;
                continue;
            }
            if (ch === '/' && !regexClass){
                while (i + 1 < source.length && /[A-Za-z]/.test(source[i + 1])){
                    mask(i + 1);
                    i++;
                }
                mode = 'code';
            }
            continue;
        }

        if (ch === '/' && next === '/'){
            mask(i);
            mask(i + 1);
            i++;
            mode = 'line-comment';
            continue;
        }
        if (ch === '/' && next === '*'){
            mask(i);
            mask(i + 1);
            i++;
            mode = 'block-comment';
            continue;
        }
        if (maskRegex && ch === '/' && isLikelyRegexStart(source, i)){
            mask(i);
            regexClass = false;
            mode = 'regex';
            continue;
        }
        if (ch === "'"){
            mask(i);
            mode = 'single';
            continue;
        }
        if (ch === '"'){
            mask(i);
            mode = 'double';
            continue;
        }
        if (ch === '`'){
            mask(i);
            mode = 'template';
            continue;
        }

        if (interpolationDepth.length > 0){
            const top = interpolationDepth.length - 1;
            if (ch === '{'){
                interpolationDepth[top]++;
            }
            else if (ch === '}'){
                interpolationDepth[top]--;
                if (interpolationDepth[top] === 0){
                    interpolationDepth.pop();
                    mask(i);
                    mode = 'template';
                }
            }
        }
    }

    return out.join('');
}

function extractModuleReferences(source, sourcefile = 'architecture-source.js'){
    const result = esbuild.buildSync({
        stdin: {
            contents: source,
            sourcefile,
            resolveDir: path.dirname(path.resolve(sourcefile)),
            loader: 'js',
        },
        bundle: true,
        external: ['*'],
        platform: 'neutral',
        format: 'esm',
        write: false,
        metafile: true,
        logLevel: 'silent',
    });

    const references = [];
    for (const input of Object.values(result.metafile.inputs)){
        for (const imported of input.imports || []){
            references.push({
                specifier: imported.original || imported.path,
                kind: imported.kind,
            });
        }
    }
    return references;
}

function extractImportSpecifiers(source, sourcefile){
    return extractModuleReferences(source, sourcefile).map(reference => reference.specifier);
}

function isForbiddenEnginePackage(specifier){
    return FORBIDDEN_ENGINE_PACKAGE_PREFIXES.some(prefix =>
        prefix.endsWith('/')
            ? specifier.startsWith(prefix)
            : specifier === prefix || specifier.startsWith(prefix + '/')
    );
}

function listEngineSourceFilesRecursive(dir){
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()){
            files.push(...listEngineSourceFilesRecursive(full));
        }
        else if (entry.isFile() && ENGINE_SOURCE_EXTENSIONS.has(path.extname(entry.name))){
            files.push(full);
        }
    }
    return files.sort();
}

function resolveLocalImport(fromFile, specifier, fileSet){
    if (!specifier.startsWith('.')) return null;

    const base = path.resolve(path.dirname(fromFile), specifier);
    const candidates = [
        base,
        ...[...ENGINE_SOURCE_EXTENSIONS].map(extension => base + extension),
        ...[...ENGINE_SOURCE_EXTENSIONS].map(extension => path.join(base, 'index' + extension)),
    ];

    for (const candidate of candidates){
        if (fileSet.has(candidate)) return candidate;
    }
    return base;
}

function engineSourceViolations(source, filename, engineRoot){
    const code = maskNonCode(source);
    const violations = [];
    const rules = [
        ['legacy global', /\bglobal\s*(?:\.|\[)/],
        ['browser window', /\bwindow\b/],
        ['DOM document', /\bdocument\b/],
        ['browser navigator', /\bnavigator\b/],
        ['platform globalThis', /\bglobalThis\b/],
        ['jQuery', /\bjQuery\b|\$\s*\(/],
        ['Vue', /\bVue\b/],
        ['localStorage', /\blocalStorage\b/],
        ['legacy save storage', /\bsave\s*\.\s*(?:getItem|setItem|removeItem|clear)\s*\(/],
        ['wall clock Date.now', /\bDate\s*\.\s*now\s*\(/],
        ['wall clock new Date', /\bnew\s+Date\s*\(/],
        ['wall clock Date()', /\bDate\s*\(/],
        ['wall clock performance.now', /\bperformance\s*\.\s*now\s*\(/],
        ['direct random source', /\bMath\s*\.\s*(?:random|rand)\s*\(/],
        ['direct crypto random source', /\bcrypto\s*\.\s*getRandomValues\s*\(/],
        ['CommonJS require()', /\brequire\s*\(/],
    ];

    for (const [label, pattern] of rules){
        if (pattern.test(code)){
            violations.push(filename + ': forbidden engine dependency: ' + label);
        }
    }

    for (const reference of extractModuleReferences(source, filename)){
        const specifier = reference.specifier;
        if (isForbiddenEnginePackage(specifier)){
            violations.push(filename + ': forbidden engine package import: ' + specifier);
        }
        if (!specifier.startsWith('.')) continue;
        const resolved = path.resolve(path.dirname(filename), specifier);
        const relative = path.relative(engineRoot, resolved);
        if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)){
            violations.push(filename + ': engine import escapes src/engine: ' + specifier);
        }
    }

    return violations;
}

function stronglyConnectedComponents(graph){
    let nextIndex = 0;
    const indices = new Map();
    const lowLinks = new Map();
    const stack = [];
    const onStack = new Set();
    const components = [];

    function visit(node){
        indices.set(node, nextIndex);
        lowLinks.set(node, nextIndex);
        nextIndex++;
        stack.push(node);
        onStack.add(node);

        for (const target of graph.get(node) || []){
            if (!indices.has(target)){
                visit(target);
                lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(target)));
            }
            else if (onStack.has(target)){
                lowLinks.set(node, Math.min(lowLinks.get(node), indices.get(target)));
            }
        }

        if (lowLinks.get(node) === indices.get(node)){
            const component = [];
            let popped;
            do {
                popped = stack.pop();
                onStack.delete(popped);
                component.push(popped);
            } while (popped !== node);
            components.push(component.sort());
        }
    }

    for (const node of [...graph.keys()].sort()){
        if (!indices.has(node)) visit(node);
    }

    return components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

function buildImportGraph(files){
    const fileSet = new Set(files.map(file => path.resolve(file)));
    const graph = new Map();

    for (const file of files){
        const resolvedFile = path.resolve(file);
        const targets = [];
        const source = fs.readFileSync(resolvedFile, 'utf8');

        for (const specifier of extractImportSpecifiers(source, resolvedFile)){
            const target = resolveLocalImport(resolvedFile, specifier, fileSet);
            if (target && fileSet.has(target)) targets.push(target);
        }

        graph.set(resolvedFile, [...new Set(targets)].sort());
    }

    return graph;
}

function engineCycleViolations(engineFiles){
    const graph = buildImportGraph(engineFiles);
    const violations = [];

    for (const component of stronglyConnectedComponents(graph)){
        if (component.length > 1){
            violations.push('src/engine import cycle: ' + component.join(' -> '));
        }
        else if ((graph.get(component[0]) || []).includes(component[0])){
            violations.push('src/engine self-import cycle: ' + component[0]);
        }
    }

    return violations;
}

function scanRepository(root, baseline){
    const violations = [];
    const srcRoot = path.join(root, 'src');
    const engineRoot = path.join(srcRoot, 'engine');

    const legacyFiles = fs.readdirSync(srcRoot, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
        .map(entry => path.join(srcRoot, entry.name))
        .sort();

    const actualNames = new Set(legacyFiles.map(file => path.basename(file)));
    const baselineNames = new Set(Object.keys(baseline.legacyModules));

    for (const name of [...actualNames].sort()){
        if (!baselineNames.has(name)){
            violations.push('Unbaselined legacy root module: src/' + name + '. New architecture should live outside the legacy root.');
        }
    }

    for (const name of [...baselineNames].sort()){
        const file = path.join(srcRoot, name);
        if (!fs.existsSync(file)){
            violations.push('Legacy baseline is stale: src/' + name + ' was removed. Remove its baseline entry to ratchet downward.');
            continue;
        }

        const actual = measureLegacySource(fs.readFileSync(file, 'utf8'));
        const expected = baseline.legacyModules[name];

        for (const key of METRIC_KEYS){
            if (actual[key] > expected[key]){
                violations.push('Legacy architecture budget increased: src/' + name + ' ' + key + ' ' + actual[key] + ' > ' + expected[key]);
            }
            else if (actual[key] < expected[key]){
                violations.push('Legacy architecture baseline must ratchet downward: src/' + name + ' ' + key + ' is now ' + actual[key] + ' < ' + expected[key]);
            }
        }
    }

    const legacyGraph = buildImportGraph(legacyFiles);
    const legacyComponents = stronglyConnectedComponents(legacyGraph);
    const cyclicComponents = legacyComponents.filter(component =>
        component.length > 1 || (legacyGraph.get(component[0]) || []).includes(component[0])
    );
    const largestLegacySccSize = cyclicComponents.length > 0 ? cyclicComponents[0].length : 0;
    const cyclicMembers = [...new Set(cyclicComponents.flat().map(file => path.basename(file)))].sort();
    const allowedMembers = [...baseline.allowedLegacyCycleMembers].sort();
    const allowedSet = new Set(allowedMembers);

    for (const member of cyclicMembers){
        if (!allowedSet.has(member)){
            violations.push('Legacy dependency cycle gained a new member: src/' + member);
        }
    }

    if (largestLegacySccSize > baseline.largestLegacySccSize){
        violations.push('Largest legacy SCC grew: ' + largestLegacySccSize + ' > ' + baseline.largestLegacySccSize);
    }
    else if (largestLegacySccSize < baseline.largestLegacySccSize){
        violations.push('Legacy SCC baseline must ratchet downward: largest SCC is now ' + largestLegacySccSize + ' < ' + baseline.largestLegacySccSize);
    }

    if (cyclicMembers.length < allowedMembers.length){
        const removed = allowedMembers.filter(member => !cyclicMembers.includes(member));
        violations.push('Legacy cycle-member baseline must ratchet downward; these modules are no longer cyclic: ' + removed.join(', '));
    }

    const engineFiles = listEngineSourceFilesRecursive(engineRoot);
    for (const file of engineFiles){
        const source = fs.readFileSync(file, 'utf8');
        violations.push(...engineSourceViolations(source, file, engineRoot));
    }
    violations.push(...engineCycleViolations(engineFiles));

    const totals = {};
    for (const key of METRIC_KEYS){
        totals[key] = legacyFiles.reduce((sum, file) => {
            const metrics = measureLegacySource(fs.readFileSync(file, 'utf8'));
            return sum + metrics[key];
        }, 0);
    }

    return {
        violations,
        summary: {
            legacyModuleCount: legacyFiles.length,
            legacyTotals: totals,
            largestLegacySccSize,
            cyclicMembers,
            engineFileCount: engineFiles.length,
        },
    };
}

function loadBaseline(root){
    const baselinePath = path.join(root, 'tests', 'architecture', 'legacy-architecture-baseline.json');
    return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
}

function runArchitectureCheck(root, baseline, logger = console){
    const result = scanRepository(root, baseline);

    logger.log('Architecture fitness summary:');
    logger.log(JSON.stringify(result.summary, null, 2));

    if (result.violations.length > 0){
        logger.error('\nArchitecture fitness violations:');
        for (const violation of result.violations){
            logger.error('- ' + violation);
        }
        return { exitCode: 1, result };
    }

    logger.log('\nM0E5 architecture fitness gate passed.');
    return { exitCode: 0, result };
}

function main(){
    const root = path.resolve(__dirname, '..', '..');
    const baseline = loadBaseline(root);
    const outcome = runArchitectureCheck(root, baseline);
    process.exitCode = outcome.exitCode;
}

module.exports = {
    METRIC_KEYS,
    measureLegacySource,
    maskNonCode,
    extractModuleReferences,
    extractImportSpecifiers,
    isForbiddenEnginePackage,
    listEngineSourceFilesRecursive,
    engineSourceViolations,
    stronglyConnectedComponents,
    buildImportGraph,
    engineCycleViolations,
    scanRepository,
    loadBaseline,
    runArchitectureCheck,
};

if (require.main === module){
    main();
}
