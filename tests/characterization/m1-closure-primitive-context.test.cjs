'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const techSource = fs.readFileSync(path.join(root, 'src', 'tech.js'), 'utf8');
const mappingsPromise = import(pathToFileURL(path.join(root, 'src/legacy/bridge/evolve-mappings.mjs')).href);

function definitionBlock(name, nextName){
    const startToken = `    ${name}: {`;
    const endToken = `    ${nextName}: {`;
    const start = techSource.indexOf(startToken);
    const end = techSource.indexOf(endToken, start + startToken.length);
    assert.notEqual(start, -1, `Missing legacy technology block ${name}`);
    assert.notEqual(end, -1, `Missing boundary technology block ${nextName}`);
    return techSource.slice(start, end).replace(/\s+/g, '');
}

test('M1 closure primitive progression context matches the actual legacy resolution conditions', async () => {
    const boneTools = definitionBlock('bone_tools', 'wooden_tools');
    const woodenTools = definitionBlock('wooden_tools', 'sundial');
    const sundial = definitionBlock('sundial', 'wheel');

    assert.match(boneTools, /condition\(\)\{returnglobal\.race\['soul_eater'\]&&!global\.race\['evil'\]\?false:true;\}/);
    assert.match(woodenTools, /condition\(\)\{returnglobal\.race\['soul_eater'\]&&!global\.race\['evil'\]\?true:false;\}/);
    assert.match(sundial, /condition\(\)\{return!global\.race\['gravity_well'\]\|\|\(global\.race\['gravity_well'\]&&global\.tech\['transport'\]\)\?true:false;\}/);

    const { createEvolveLegacyMappingCatalog } = await mappingsPromise;
    const mapping = createEvolveLegacyMappingCatalog().getRequired('evolve.technology.primitive_progression');
    assert.deepEqual(mapping.contextKeys, [
        'global.race.evil',
        'global.race.gravity_well',
        'global.race.soul_eater',
        'global.tech.transport',
    ]);
    assert.equal(mapping.contextKeys.includes('global.race.kindling_kindred'), false);
});
