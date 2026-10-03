'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;
if (!legacy){
    throw new Error('Legacy test API did not initialize');
}

const root = path.resolve(__dirname, '../..');
const achievementPromise = import(pathToFileURL(path.join(root, 'src/engine/definitions/achievement.mjs')).href);
const resourcePromise = import(pathToFileURL(path.join(root, 'src/engine/definitions/resource.mjs')).href);
const technologyPromise = import(pathToFileURL(path.join(root, 'src/engine/definitions/technology.mjs')).href);

function readSource(relativePath){
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function registerRecord(registry, id, aliases, definition){
    return registry.register({
        id,
        owner: { packageId: 'evolve', source: 'legacy-characterization' },
        schemaVersion: 1,
        tags: ['vanilla-sample'],
        aliases,
        definition,
    });
}

function characterizeFood(source){
    const call = source.match(/loadResource\('Food',wiki,\s*250,\s*1,\s*(true|false),\s*(true|false)(?:,\s*'([^']+)')?\s*\);/);
    assert.ok(call, 'legacy Food loadResource call changed; review M1B resource sample');
    assert.match(source, /color\s*=\s*color\s*\|\|\s*'info'/, 'legacy resource default color changed');
    assert.match(source, /loc\(`resource_\$\{name\}_name`\)/, 'legacy ordinary resource localization convention changed');
    return {
        presentation: {
            nameKey: 'resource_Food_name',
            colorRole: call[3] || 'info',
        },
        properties: {
            tradable: call[1] === 'true',
            stackable: call[2] === 'true',
        },
    };
}

function characterizeMassExtinction(source){
    assert.match(source, /species:\s*\[[^\]]*'mass_extinction'/s, 'mass_extinction is no longer in the legacy species achievement group');
    assert.ok(source.includes('name: loc(`achieve_${achieve}_name`)'), 'legacy achievement name convention changed');
    assert.ok(source.includes('loc(`achieve_${achieve}_desc`)'), 'legacy achievement description convention changed');
    assert.ok(source.includes('loc(`achieve_${achieve}_flair`)'), 'legacy achievement flair convention changed');
    return {
        presentation: {
            nameKey: 'achieve_mass_extinction_name',
            descriptionKey: 'achieve_mass_extinction_desc',
            flairKey: 'achieve_mass_extinction_flair',
        },
        classification: { category: 'species' },
    };
}

function characterizeClub(source){
    const blockMatch = source.match(/\n\s*club:\s*\{([\s\S]*?)\n\s*\},\n\s*bone_tools:/);
    assert.ok(blockMatch, 'legacy club technology block changed; review M1B technology sample');
    const block = blockMatch[1];
    const id = block.match(/id:\s*'([^']+)'/);
    const title = block.match(/title:\s*loc\('([^']+)'\)/);
    const desc = block.match(/desc:\s*loc\('([^']+)'\)/);
    const category = block.match(/category:\s*'([^']+)'/);
    const era = block.match(/era:\s*'([^']+)'/);
    for (const match of [id, title, desc, category, era]){
        assert.ok(match, 'legacy club static metadata changed shape');
    }
    return {
        legacyId: id[1],
        definition: {
            presentation: { nameKey: title[1], descriptionKey: desc[1] },
            classification: { category: category[1], era: era[1] },
        },
    };
}

test('M1B vanilla sample definitions remain anchored to current legacy source metadata', async () => {
    const [{ createAchievementRegistry }, { createResourceRegistry }, { createTechnologyRegistry }] = await Promise.all([
        achievementPromise,
        resourcePromise,
        technologyPromise,
    ]);

    const achievementSource = readSource('src/achieve.js');
    const resourceSource = readSource('src/resources.js');
    const technologySource = readSource('src/tech.js');

    const achievement = registerRecord(
        createAchievementRegistry(),
        'evolve:achievement/mass_extinction',
        ['mass_extinction'],
        characterizeMassExtinction(achievementSource)
    );
    const resource = registerRecord(
        createResourceRegistry(),
        'evolve:resource/food',
        ['Food'],
        characterizeFood(resourceSource)
    );
    const club = characterizeClub(technologySource);
    const technology = registerRecord(
        createTechnologyRegistry(),
        'evolve:technology/club',
        ['club', club.legacyId],
        club.definition
    );

    const liveClub = legacy.technologyDefinition('club');
    assert.equal(liveClub.id, club.legacyId);
    assert.equal(liveClub.category, technology.definition.classification.category);
    assert.equal(liveClub.era, technology.definition.classification.era);

    assert.equal(achievement.definition.classification.category, 'species');
    assert.deepEqual(resource.definition.properties, { stackable: true, tradable: true });
    assert.equal(resource.definition.presentation.colorRole, 'info');
});
