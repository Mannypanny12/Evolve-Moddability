import { LegacyMappingCatalog } from './mapping-catalog.mjs';

function registerDirect(catalog, {
    id,
    domain,
    family,
    legacyPath,
    canonicalId,
    introducedIn,
    removeBy,
    stateSemantics,
    sourceLocations,
}){
    catalog.register({
        id,
        domain,
        family,
        mode: 'direct',
        legacyPath,
        canonicalIds: [canonicalId],
        contextKeys: [],
        owner: { packageId: 'evolve', source: 'legacy-bridge' },
        introducedIn,
        removeBy,
        stateSemantics,
        sourceLocations,
    });
}

export function createEvolveLegacyMappingCatalog(){
    const catalog = new LegacyMappingCatalog();

    registerDirect(catalog, {
        id: 'evolve.resource.food_state',
        domain: 'resources',
        family: 'resource',
        legacyPath: 'global.resource.Food',
        canonicalId: 'evolve:resource/food',
        introducedIn: 'M1D',
        removeBy: 'M6B',
        stateSemantics: 'Legacy runtime state bucket for the Food resource; identity itself remains the direct registry alias Food.',
        sourceLocations: ['src/resources.js', 'src/vars.js'],
    });

    registerDirect(catalog, {
        id: 'evolve.resource.dna_state',
        domain: 'resources',
        family: 'resource',
        legacyPath: 'global.resource.DNA',
        canonicalId: 'evolve:resource/dna',
        introducedIn: 'M3B3',
        removeBy: 'M6B',
        stateSemantics: 'Legacy runtime state bucket for DNA used by the bounded M3 condition compatibility bridge.',
        sourceLocations: ['src/actions.js', 'src/resources.js', 'src/vars.js'],
    });

    registerDirect(catalog, {
        id: 'evolve.resource.rna_state',
        domain: 'resources',
        family: 'resource',
        legacyPath: 'global.resource.RNA',
        canonicalId: 'evolve:resource/rna',
        introducedIn: 'M3B3',
        removeBy: 'M6B',
        stateSemantics: 'Legacy runtime state bucket for RNA used by the bounded M3 condition compatibility bridge.',
        sourceLocations: ['src/actions.js', 'src/resources.js', 'src/vars.js'],
    });

    registerDirect(catalog, {
        id: 'evolve.prestige.plasmid_state',
        domain: 'prestige',
        family: 'prestige',
        legacyPath: 'global.prestige.Plasmid',
        canonicalId: 'evolve:prestige/plasmid',
        introducedIn: 'M3D4B',
        removeBy: 'M6B',
        stateSemantics: 'Legacy Plasmid prestige holdings used by the bounded M3D4B payment compatibility bridge.',
        sourceLocations: ['src/actions.js', 'src/vars.js'],
    });

    registerDirect(catalog, {
        id: 'evolve.prestige.anti_plasmid_state',
        domain: 'prestige',
        family: 'prestige',
        legacyPath: 'global.prestige.AntiPlasmid',
        canonicalId: 'evolve:prestige/anti_plasmid',
        introducedIn: 'M3D4B',
        removeBy: 'M6B',
        stateSemantics: 'Legacy AntiPlasmid prestige holdings used as the resolved antimatter payment source for Plasmid costs.',
        sourceLocations: ['src/actions.js', 'src/vars.js'],
    });

    catalog.register({
        id: 'evolve.technology.primitive_progression',
        domain: 'technologies',
        family: 'technology',
        mode: 'contextual',
        legacyPath: 'global.tech.primitive',
        canonicalIds: [
            'evolve:technology/bone_tools',
            'evolve:technology/club',
            'evolve:technology/sundial',
            'evolve:technology/wooden_tools',
        ],
        contextKeys: [
            'global.race.evil',
            'global.race.gravity_well',
            'global.race.soul_eater',
            'global.tech.transport',
        ],
        owner: { packageId: 'evolve', source: 'legacy-bridge' },
        introducedIn: 'M1D',
        removeBy: 'M6E',
        stateSemantics: 'Shared legacy progression level written by multiple technology definitions; race context selects the level-2 source and gravity/transport context gates the level-3 source.',
        sourceLocations: ['src/tech.js', 'src/vars.js'],
    });

    registerDirect(catalog, {
        id: 'evolve.trait.gravity_well_state',
        domain: 'traits',
        family: 'trait',
        legacyPath: 'global.race.gravity_well',
        canonicalId: 'evolve:trait/gravity_well',
        introducedIn: 'M3B3',
        removeBy: 'M6D',
        stateSemantics: 'Legacy race trait presence used by representative M3B differential evidence.',
        sourceLocations: ['src/actions.js', 'src/races.js', 'src/tech.js'],
    });

    registerDirect(catalog, {
        id: 'evolve.trait.flier_state',
        domain: 'traits',
        family: 'trait',
        legacyPath: 'global.race.flier',
        canonicalId: 'evolve:trait/flier',
        introducedIn: 'M3B3',
        removeBy: 'M6D',
        stateSemantics: 'Legacy flier trait presence retained only for condition migration evidence and declarative bypass characterization.',
        sourceLocations: ['src/actions.js', 'src/races.js'],
    });

    registerDirect(catalog, {
        id: 'evolve.trait.warlord_state',
        domain: 'traits',
        family: 'trait',
        legacyPath: 'global.race.warlord',
        canonicalId: 'evolve:trait/warlord',
        introducedIn: 'M3B3',
        removeBy: 'M6D',
        stateSemantics: 'Legacy warlord trait presence used by negative-trait condition differential evidence.',
        sourceLocations: ['src/actions.js', 'src/races.js', 'src/tech.js'],
    });

    registerDirect(catalog, {
        id: 'evolve.structure.city_compost_state',
        domain: 'structures',
        family: 'structure',
        legacyPath: 'global.city.compost',
        canonicalId: 'evolve:structure/city/compost',
        introducedIn: 'M3B3',
        removeBy: 'M6F',
        stateSemantics: 'Representative switchable city structure state used to prove total-count and active-count compatibility semantics.',
        sourceLocations: ['src/actions.js', 'src/vars.js'],
    });

    return catalog;
}
