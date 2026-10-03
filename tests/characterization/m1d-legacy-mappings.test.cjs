'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const evolveMappingsPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-mappings.mjs')).href);

function techBlock(source, key, nextKey){
    const pattern = new RegExp(`\\n\\s*${key}:\\s*\\{([\\s\\S]*?)\\n\\s*\\},\\n\\s*${nextKey}:`);
    const match = source.match(pattern);
    assert.ok(match, `legacy technology block ${key} changed shape`);
    return match[1];
}

function assertGrant(block, key, level){
    const compact = block.replace(/\s+/g, '');
    assert.ok(
        compact.includes(`grant:['${key}',${level}]`),
        `expected legacy grant ${key}=${level}`
    );
}

test('M1D primitive progression mapping remains anchored to the real legacy technology grants', async () => {
    const { createEvolveLegacyMappingCatalog } = await evolveMappingsPromise;
    const source = fs.readFileSync(path.join(root, 'src/tech.js'), 'utf8');

    assertGrant(techBlock(source, 'club', 'bone_tools'), 'primitive', 1);
    assertGrant(techBlock(source, 'bone_tools', 'wooden_tools'), 'primitive', 2);
    assertGrant(techBlock(source, 'wooden_tools', 'sundial'), 'primitive', 2);
    assertGrant(techBlock(source, 'sundial', 'wheel'), 'primitive', 3);

    const mapping = createEvolveLegacyMappingCatalog().getRequired('evolve.technology.primitive_progression');
    assert.equal(mapping.mode, 'contextual');
    assert.equal(mapping.legacyPath, 'global.tech.primitive');
    assert.deepEqual(mapping.canonicalIds, [
        'evolve:technology/bone_tools',
        'evolve:technology/club',
        'evolve:technology/sundial',
        'evolve:technology/wooden_tools',
    ]);
    assert.equal(mapping.removeBy, 'M6E');
});
