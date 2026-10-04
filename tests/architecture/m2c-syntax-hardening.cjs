'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractModuleReferences, maskNonCode } = require('./architecture-fitness.cjs');

const LEGACY_SOURCE_EXTENSIONS = new Set(['.js']);
const REVIEWED_NAMED_VARS_IMPORT = /import\s*\{([\s\S]*?)\}\s*from\s*(['"])\.\/vars(?:\.js)?\2/g;

function listLegacyRootModules(root){
    const srcRoot = path.join(root, 'src');
    return fs.readdirSync(srcRoot, { withFileTypes: true })
        .filter(entry => entry.isFile() && LEGACY_SOURCE_EXTENSIONS.has(path.extname(entry.name)))
        .map(entry => path.join(srcRoot, entry.name))
        .sort();
}

function blankRange(value){
    return value.replace(/[^\n\r]/g, ' ');
}

function stripReviewedNamedVarsImports(source){
    return source.replace(REVIEWED_NAMED_VARS_IMPORT, blankRange);
}

function referenceTargetsVars(specifier, sourcefile, root){
    if (!specifier || !specifier.startsWith('.')) return false;
    const target = path.resolve(path.dirname(sourcefile), specifier);
    const varsFile = path.join(root, 'src', 'vars.js');
    return target === varsFile || target + '.js' === varsFile;
}

function unreviewedVarsReferenceViolations(source, sourcefile, root){
    const stripped = stripReviewedNamedVarsImports(source);
    let references;
    try {
        references = extractModuleReferences(stripped, sourcefile);
    }
    catch (error){
        return [`${path.basename(sourcefile)}: M2C syntax hardening cannot parse module references: ${error.message}`];
    }
    return references
        .filter(reference => referenceTargetsVars(reference.specifier, sourcefile, root))
        .map(reference => `${path.basename(sourcefile)}: M2C runtime vars access must use the reviewed named-import form; found ${reference.kind} ${reference.specifier}`);
}

function skipWhitespace(source, index){
    while (index < source.length && /\s/.test(source[index])) index++;
    return index;
}

function readIdentifier(source, index){
    const match = source.slice(index).match(/^[$A-Z_a-z][$\w]*/);
    return match ? { value: match[0], end: index + match[0].length } : null;
}

function readQuotedString(source, index){
    const quote = source[index];
    if (quote !== "'" && quote !== '"') return null;
    let cursor = index + 1;
    let value = '';
    while (cursor < source.length){
        const ch = source[cursor];
        if (ch === '\\'){
            if (cursor + 1 >= source.length) return null;
            value += source[cursor + 1];
            cursor += 2;
            continue;
        }
        if (ch === quote) return { value, end: cursor + 1 };
        value += ch;
        cursor++;
    }
    return null;
}

function findClosingBracket(masked, index){
    let depth = 0;
    for (let cursor = index; cursor < masked.length; cursor++){
        if (masked[cursor] === '[') depth++;
        else if (masked[cursor] === ']'){
            depth--;
            if (depth === 0) return cursor;
        }
    }
    return -1;
}

function readBracketProperty(source, masked, index){
    let cursor = skipWhitespace(source, index + 1);
    const stringValue = readQuotedString(source, cursor);
    if (stringValue){
        cursor = skipWhitespace(source, stringValue.end);
        if (source[cursor] === ']'){
            return { dynamic: false, value: stringValue.value, end: cursor + 1 };
        }
    }
    const closing = findClosingBracket(masked, index);
    return { dynamic: true, end: closing === -1 ? index + 1 : closing + 1 };
}

function readAccessProperty(source, masked, index){
    let cursor = skipWhitespace(masked, index);
    let optional = false;

    if (masked[cursor] === '?' && masked[cursor + 1] === '.'){
        optional = true;
        cursor = skipWhitespace(masked, cursor + 2);
        if (masked[cursor] === '['){
            return { ...readBracketProperty(source, masked, cursor), optional };
        }
        const identifier = readIdentifier(masked, cursor);
        return identifier ? { dynamic: false, value: identifier.value, end: identifier.end, optional } : null;
    }

    if (masked[cursor] === '.'){
        cursor = skipWhitespace(masked, cursor + 1);
        const identifier = readIdentifier(masked, cursor);
        return identifier ? { dynamic: false, value: identifier.value, end: identifier.end, optional } : null;
    }
    if (masked[cursor] === '['){
        return { ...readBracketProperty(source, masked, cursor), optional };
    }
    return null;
}

function hasOptionalSettingsAccess(source, masked){
    const globalPattern = /\bglobal\b/g;
    let match;
    while ((match = globalPattern.exec(masked)) !== null){
        const settings = readAccessProperty(source, masked, match.index + match[0].length);
        if (!settings || settings.dynamic || settings.value !== 'settings') continue;
        if (settings.optional) return true;

        let cursor = settings.end;
        let next;
        while ((next = readAccessProperty(source, masked, cursor)) !== null){
            if (next.optional) return true;
            cursor = next.end;
        }
    }
    return false;
}

function readSimpleTemplate(source, index){
    if (source[index] !== '`') return null;
    let cursor = index + 1;
    let value = '';
    while (cursor < source.length){
        const ch = source[cursor];
        if (ch === '`') return { value, end: cursor + 1 };
        if (ch === '\\' || (ch === '$' && source[cursor + 1] === '{')) return null;
        value += ch;
        cursor++;
    }
    return null;
}

function hasTemplateSettingsAccess(source, masked){
    const pattern = /\bglobal\b/g;
    let match;
    while ((match = pattern.exec(masked)) !== null){
        let cursor = skipWhitespace(source, match.index + match[0].length);
        if (source[cursor] !== '[') continue;
        cursor = skipWhitespace(source, cursor + 1);
        const template = readSimpleTemplate(source, cursor);
        if (!template || template.value !== 'settings') continue;
        cursor = skipWhitespace(source, template.end);
        if (source[cursor] === ']') return true;
    }
    return false;
}

function settingsSyntaxViolations(source, sourcefile){
    const masked = maskNonCode(source);
    const moduleName = path.basename(sourcefile);
    const violations = [];

    if (hasOptionalSettingsAccess(source, masked)){
        violations.push(`${moduleName}: M2C settings boundary forbids optional chaining inside direct global.settings access because it bypasses path-specific debt tracking`);
    }
    if (/\{[^}]*\bsettings\b[^}]*\}\s*=\s*global\b/.test(masked)){
        violations.push(`${moduleName}: M2C settings boundary forbids destructuring settings from legacy global; expose global.settings explicitly so $root capability debt is visible`);
    }
    if (hasTemplateSettingsAccess(source, masked)){
        violations.push(`${moduleName}: M2C settings boundary forbids template-literal access to global settings; use the reviewed static property syntax`);
    }

    return violations;
}

function skipTrivia(source, index){
    let cursor = index;
    while (cursor < source.length){
        if (/\s/.test(source[cursor])){
            cursor++;
            continue;
        }
        if (source[cursor] === '/' && source[cursor + 1] === '/'){
            cursor += 2;
            while (cursor < source.length && source[cursor] !== '\n' && source[cursor] !== '\r') cursor++;
            continue;
        }
        if (source[cursor] === '/' && source[cursor + 1] === '*'){
            const closing = source.indexOf('*/', cursor + 2);
            if (closing === -1) return source.length;
            cursor = closing + 2;
            continue;
        }
        break;
    }
    return cursor;
}

function readStrictQuotedString(source, index){
    const quote = source[index];
    if (quote !== "'" && quote !== '"') return null;
    let cursor = index + 1;
    let value = '';
    while (cursor < source.length){
        const ch = source[cursor];
        if (ch === '\\') return null;
        if (ch === quote) return { value, end: cursor + 1 };
        value += ch;
        cursor++;
    }
    return null;
}

function parseStrictStringArrayBody(source){
    const values = [];
    let cursor = skipTrivia(source, 0);
    if (cursor >= source.length) return values;

    while (cursor < source.length){
        const value = readStrictQuotedString(source, cursor);
        if (!value) return null;
        values.push(value.value);
        cursor = skipTrivia(source, value.end);
        if (cursor >= source.length) return values;
        if (source[cursor] !== ',') return null;
        cursor = skipTrivia(source, cursor + 1);
        if (cursor >= source.length) return values;
    }
    return values;
}

function parseStrictGameStateRootFields(source){
    const match = source.match(/const\s+GAME_STATE_ROOT_FIELDS\s*=\s*Object\.freeze\s*\(\s*\[([\s\S]*?)\]\s*\)\s*;/);
    if (!match) return null;
    return parseStrictStringArrayBody(match[1]);
}

function gameStateLiteralViolations(root){
    const file = path.join(root, 'src', 'engine', 'state', 'game-state.mjs');
    const source = fs.readFileSync(file, 'utf8');
    if (parseStrictGameStateRootFields(source) === null){
        return ['M2C syntax hardening requires GAME_STATE_ROOT_FIELDS to remain an inspectable array of plain string literals'];
    }
    return [];
}

function scanM2CSyntaxHardening(root){
    const violations = [];
    const modules = listLegacyRootModules(root);
    for (const file of modules){
        const source = fs.readFileSync(file, 'utf8');
        violations.push(...unreviewedVarsReferenceViolations(source, file, root));
        violations.push(...settingsSyntaxViolations(source, file));
    }
    violations.push(...gameStateLiteralViolations(root));
    return {
        summary: {
            legacyModuleCount: modules.length,
            violationCount: violations.length,
        },
        violations: violations.sort(),
    };
}

function runM2CSyntaxHardening(root, logger = console){
    const result = scanM2CSyntaxHardening(root);
    logger.log('M2C syntax-hardening summary:');
    logger.log(JSON.stringify(result.summary, null, 2));
    if (result.violations.length){
        logger.error('\nM2C syntax-hardening violations:');
        for (const violation of result.violations) logger.error('- ' + violation);
        return { exitCode: 1, result };
    }
    logger.log('\nM2C syntax-hardening gate passed.');
    return { exitCode: 0, result };
}

function main(){
    const root = path.resolve(__dirname, '..', '..');
    process.exitCode = runM2CSyntaxHardening(root).exitCode;
}

module.exports = {
    stripReviewedNamedVarsImports,
    referenceTargetsVars,
    unreviewedVarsReferenceViolations,
    hasOptionalSettingsAccess,
    settingsSyntaxViolations,
    parseStrictStringArrayBody,
    parseStrictGameStateRootFields,
    gameStateLiteralViolations,
    scanM2CSyntaxHardening,
    runM2CSyntaxHardening,
};

if (require.main === module){
    main();
}
