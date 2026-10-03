import { EngineContractError } from '../../engine/identity.mjs';
import { LegacyMappingCatalog } from './mapping-catalog.mjs';

export function inspectLegacyMappings(catalog){
    if (!(catalog instanceof LegacyMappingCatalog)){
        throw new EngineContractError(
            'INVALID_INSPECTION_TARGET',
            'Legacy mapping inspector requires a LegacyMappingCatalog instance.'
        );
    }

    const mappings = catalog.entries().map(mapping => Object.freeze({
        ...mapping,
        canonicalIds: Object.freeze([...mapping.canonicalIds]),
        contextKeys: Object.freeze([...mapping.contextKeys]),
        sourceLocations: Object.freeze([...mapping.sourceLocations]),
        owner: Object.freeze({ ...mapping.owner }),
    }));

    const byDomain = Object.create(null);
    for (const mapping of mappings){
        if (!byDomain[mapping.domain]) byDomain[mapping.domain] = [];
        byDomain[mapping.domain].push(mapping.id);
    }
    for (const domain of Object.keys(byDomain)){
        byDomain[domain] = Object.freeze(byDomain[domain].sort());
    }

    return Object.freeze({
        size: mappings.length,
        mappings: Object.freeze(mappings),
        byDomain: Object.freeze(byDomain),
    });
}
