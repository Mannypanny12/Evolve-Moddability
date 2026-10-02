'use strict';

function normalizeValue(value, excluded = new Set()){
    if (Array.isArray(value)){
        return value.map(item => normalizeValue(item, excluded));
    }
    if (value && typeof value === 'object'){
        const result = {};
        for (const key of Object.keys(value).sort()){
            if (excluded.has(key)){
                continue;
            }
            const nested = value[key];
            if (typeof nested === 'function' || nested === undefined){
                continue;
            }
            result[key] = normalizeValue(nested, excluded);
        }
        return result;
    }
    if (typeof value === 'number' && Object.is(value, -0)){
        return 0;
    }
    return value;
}

function normalizeResources(resources){
    const fields = [
        'amount','max','diff','delta','rate','display',
        'crates','containers','trade','stackable'
    ];
    const result = {};

    for (const id of Object.keys(resources || {}).sort()){
        const source = resources[id];
        if (!source || typeof source !== 'object'){
            continue;
        }
        const entry = {};
        for (const field of fields){
            if (Object.prototype.hasOwnProperty.call(source, field)){
                entry[field] = normalizeValue(source[field]);
            }
        }
        if (Object.keys(entry).length > 0){
            result[id] = entry;
        }
    }
    return result;
}

function normalizeStats(stats){
    return normalizeValue(stats || {}, new Set(['start','current']));
}

function normalizeSimulationState(state, transient = {}){
    return {
        seeds: { seed: state.seed, warseed: state.warseed },
        resources: normalizeResources(state.resource || {}),
        populationAndCivics: normalizeValue(state.civic || {}),
        structures: {
            city: normalizeValue(state.city || {}),
            space: normalizeValue(state.space || {}),
            interstellar: normalizeValue(state.interstellar || {}),
            galaxy: normalizeValue(state.galaxy || {}),
            portal: normalizeValue(state.portal || {}),
            eden: normalizeValue(state.eden || {}),
            tauceti: normalizeValue(state.tauceti || {}),
            starDock: normalizeValue(state.starDock || {})
        },
        technologies: normalizeValue(state.tech || {}),
        race: normalizeValue(state.race || {}),
        queues: {
            build: normalizeValue(state.queue || {}),
            research: normalizeValue(state.r_queue || {})
        },
        grids: {
            power: normalizeValue(state.power || []),
            support: normalizeValue(state.support || {})
        },
        statistics: normalizeStats(state.stats || {}),
        events: {
            normal: normalizeValue(state.event || {}),
            major: normalizeValue(state.m_event || {})
        },
        prestige: normalizeValue(state.prestige || {}),
        genetics: {
            genes: normalizeValue(state.genes || {}),
            blood: normalizeValue(state.blood || {})
        },
        simulationSettings: {
            pause: state.settings ? state.settings.pause : undefined,
            acceleratedTime: state.settings ? state.settings.at : undefined
        },
        transient: normalizeValue(transient)
    };
}

module.exports = { normalizeSimulationState };
