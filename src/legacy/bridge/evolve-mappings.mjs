import { LegacyMappingCatalog } from './mapping-catalog.mjs';

export function createEvolveLegacyMappingCatalog(){
    const catalog = new LegacyMappingCatalog();

    catalog.register({
        id: 'evolve.resource.food_state',
        domain: 'resources',
        family: 'resource',
        mode: 'direct',
        legacyPath: 'global.resource.Food',
        canonicalIds: ['evolve:resource/food'],
        contextKeys: [],
        owner: { packageId: 'evolve', source: 'legacy-bridge' },
        introducedIn: 'M1D',
        removeBy: 'M6B',
        stateSemantics: 'Legacy runtime state bucket for the Food resource; identity itself remains the direct registry alias Food.',
        sourceLocations: ['src/resources.js', 'src/vars.js'],
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

    return catalog;
}
