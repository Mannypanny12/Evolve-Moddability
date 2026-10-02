'use strict';

const {
    canonicalize
} = require('./canonical-state.cjs');
const {
    SIMULATION_SETTING_KEYS,
    RESOURCE_FIELD_POLICY,
    assertKnownRootPolicy
} = require('./legacy-state-policy.cjs');

function normalizeValue(value, options = {}){
    const excluded = options.excluded ?? new Set();
    const parts = options.parts ?? [];

    if (
        value === undefined ||
        value === null ||
        typeof value === 'number' ||
        typeof value === 'string' ||
        typeof value === 'boolean'
    ){
        return canonicalize(value, parts);
    }

    if (Array.isArray(value)){
        return value.map((item, index) => normalizeValue(item, {
            excluded,
            parts: [...parts, String(index)]
        }));
    }

    if (typeof value === 'object'){
        const result = {};
        for (const key of Object.keys(value).sort()){
            if (excluded.has(key)){
                continue;
            }
            result[key] = normalizeValue(value[key], {
                excluded,
                parts: [...parts, key]
            });
        }
        return result;
    }

    throw new TypeError(
        `Unsupported authoritative state value at ${parts.length ? parts.join('.') : '<root>'}: ${typeof value}`
    );
}

function normalizeResources(resources){
    const result = {};

    for (const id of Object.keys(resources || {}).sort()){
        const source = resources[id];
        if (!source || typeof source !== 'object'){
            continue;
        }

        const entry = {};
        for (const field of Object.keys(source).sort()){
            const policy = RESOURCE_FIELD_POLICY[field];
            if (policy && policy.mode === 'exclude'){
                continue;
            }

            const value = source[field];
            const isKnownLegacyNonTradableValueNaN =
                field === 'value' &&
                Number.isNaN(value) &&
                !Object.prototype.hasOwnProperty.call(source, 'trade');

            if (isKnownLegacyNonTradableValueNaN){
                entry[field] = canonicalize(
                    value,
                    ['resource', id, field],
                    { allowNonFinite: true }
                );
            }
            else {
                entry[field] = normalizeValue(value, {
                    parts: ['resource', id, field]
                });
            }
        }

        if (Object.keys(entry).length > 0){
            result[id] = entry;
        }
    }

    return result;
}

function normalizeStats(stats){
    return normalizeValue(stats || {}, {
        excluded: new Set(['start', 'current']),
        parts: ['stats']
    });
}

function normalizeSimulationSettings(settings){
    const result = {};
    for (const key of SIMULATION_SETTING_KEYS){
        if (Object.prototype.hasOwnProperty.call(settings || {}, key)){
            result[key] = normalizeValue(settings[key], {
                parts: ['settings', key]
            });
        }
    }
    return result;
}

function normalizeSimulationState(state, transient = {}){
    assertKnownRootPolicy(state);

    return {
        metadata: {
            version: normalizeValue(state.version, { parts: ['version'] }),
            new: normalizeValue(state.new, { parts: ['new'] })
        },
        seeds: {
            seed: normalizeValue(state.seed, { parts: ['seed'] }),
            warseed: normalizeValue(state.warseed, { parts: ['warseed'] })
        },
        resources: normalizeResources(state.resource || {}),
        evolution: normalizeValue(state.evolution || {}, { parts: ['evolution'] }),
        populationAndCivics: normalizeValue(state.civic || {}, { parts: ['civic'] }),
        structures: {
            city: normalizeValue(state.city || {}, { parts: ['city'] }),
            space: normalizeValue(state.space || {}, { parts: ['space'] }),
            interstellar: normalizeValue(state.interstellar || {}, { parts: ['interstellar'] }),
            galaxy: normalizeValue(state.galaxy || {}, { parts: ['galaxy'] }),
            portal: normalizeValue(state.portal || {}, { parts: ['portal'] }),
            eden: normalizeValue(state.eden || {}, { parts: ['eden'] }),
            tauceti: normalizeValue(state.tauceti || {}, { parts: ['tauceti'] }),
            starDock: normalizeValue(state.starDock || {}, { parts: ['starDock'] })
        },
        technologies: normalizeValue(state.tech || {}, { parts: ['tech'] }),
        arpa: normalizeValue(state.arpa || {}, { parts: ['arpa'] }),
        race: normalizeValue(state.race || {}, { parts: ['race'] }),
        custom: normalizeValue(state.custom || {}, { parts: ['custom'] }),
        pillars: normalizeValue(state.pillars || {}, { parts: ['pillars'] }),
        governor: normalizeValue(state.govern || {}, { parts: ['govern'] }),
        special: normalizeValue(state.special || {}, { parts: ['special'] }),
        queues: {
            build: normalizeValue(state.queue || {}, { parts: ['queue'] }),
            research: normalizeValue(state.r_queue || {}, { parts: ['r_queue'] })
        },
        grids: {
            power: normalizeValue(state.power || [], { parts: ['power'] }),
            support: normalizeValue(state.support || {}, { parts: ['support'] })
        },
        statistics: normalizeStats(state.stats || {}),
        events: {
            normal: normalizeValue(state.event || {}, { parts: ['event'] }),
            major: normalizeValue(state.m_event || {}, { parts: ['m_event'] })
        },
        prestige: normalizeValue(state.prestige || {}, { parts: ['prestige'] }),
        genetics: {
            genes: normalizeValue(state.genes || {}, { parts: ['genes'] }),
            blood: normalizeValue(state.blood || {}, { parts: ['blood'] })
        },
        simulationSettings: normalizeSimulationSettings(state.settings || {}),
        transient: normalizeValue(transient, { parts: ['transient'] })
    };
}

module.exports = {
    normalizeValue,
    normalizeResources,
    normalizeSimulationSettings,
    normalizeSimulationState
};
