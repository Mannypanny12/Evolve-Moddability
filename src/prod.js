import { global, p_on } from './vars.js';
import { biomes, traits, fathomCheck } from './races.js';
import { govRelationFactor, govEffect } from './civics.js';
import { jobScale, teamsterCap } from './jobs.js';
import { hellSupression } from './portal.js';
import { flib } from './functions.js';
import { govActive } from './governor.js';
import { hasLegacyAchievement, legacyAchievementRank } from './legacy/bridge/achievement-state-reader.mjs';
import { calculateProductionCalculation } from './application/evolve/production-calculation-runtime.mjs';
import { OIL_WELL_PRODUCTION_CALCULATION_ID } from './content/evolve/calculations/oil-well-production.mjs';
import { SIMPLE_PRODUCTION_CALCULATION_IDS } from './content/evolve/calculations/simple-production.mjs';

export function highPopAdjust(v){
    if (global.race['high_pop']){
        v *= traits.high_pop.vars()[1] / 100;
    }
    return v;
}

export function teamster(v){
    if (global.race['gravity_well'] && global.race['teamster'] && global.race.teamster > 0){
        let cap = teamsterCap();
        if (cap < 1){ cap = 1; }
        let teamster = global.civic.teamster.workers > cap ? cap : global.civic.teamster.workers;
        v *= teamster / cap;
    }
    return v;
}

function simpleProduction(id, inputs = {}){
    return calculateProductionCalculation({
        id: SIMPLE_PRODUCTION_CALCULATION_IDS[id],
        inputs,
    });
}

export function production(id,val,wiki){
    switch (id){
        case 'transmitter':
        {
            return simpleProduction('transmitter');
        }
        case 'oil_well':
        {
            let biomeOilMultiplier = null;
            if (global.city.biome === 'desert'){
                biomeOilMultiplier = biomes.desert.vars()[1];
            }
            else if (global.city.biome === 'tundra'){
                biomeOilMultiplier = biomes.tundra.vars()[1];
            }
            else if (global.city.biome === 'taiga'){
                biomeOilMultiplier = biomes.taiga.vars()[2];
            }
            return calculateProductionCalculation({
                id: OIL_WELL_PRODUCTION_CALCULATION_ID,
                inputs: {
                    oilTechLevel: global.tech['oil'] || 0,
                    geologyBonus: global.city.geology['Oil'] || 0,
                    biomeOilMultiplier,
                    dirtyJobsPercent: govActive('dirty_jobs',2) || 0,
                    warlord: Boolean(global.race['warlord']),
                    pumpjackRank: global.portal?.pumpjack?.rank || 0,
                },
            });
        }
        case 'iridium_mine':
        {
            switch (val){
                case 'iridium':
                {
                    let iridium = 0.035;
                    if (global.city.geology['Iridium']){
                        iridium *= global.city.geology['Iridium'] + 1;
                    }
                    let base = iridium;
                    let gov = govRelationFactor(3);
                    return {
                        b: base,
                        g: gov - 1,
                        f: base * gov
                    };
                }
                case 'coal':
                    return 0.55;
            }
        }
        case 'helium_mine':
        {
            let base = global.race['warlord'] ? 0.3 + (global.portal?.pumpjack?.rank || 1) * 0.08 : 0.18;
            let gov = govRelationFactor(3);
            return {
                b: base,
                g: gov - 1,
                f: base * gov
            };
        }
        case 'red_mine':
        {
            switch (val){
                case 'copper':
                {
                    let base = highPopAdjust(0.25);
                    let gov = govRelationFactor(3);
                    return {
                        b: base,
                        g: gov - 1,
                        f: base * gov
                    };
                }
                case 'titanium':
                {
                    let base = highPopAdjust(0.02);
                    let gov = govRelationFactor(3);
                    return {
                        b: base,
                        g: gov - 1,
                        f: base * gov
                    };
                }
                case 'stone':
                    return highPopAdjust(0.75);
                case 'asbestos':
                    return highPopAdjust(1.25);
                case 'aluminium':
                    return highPopAdjust(0.066);
            }
        }
        case 'biodome':
        {
            switch (val){
                case 'food':
                    return highPopAdjust(global.race.universe === 'evil' ? 0.1 : 0.25);
                case 'cat_food':
                    return 2;
                case 'lumber':
                    return highPopAdjust(1.5);
            }
        }
        case 'gas_mining':
        {
            return simpleProduction('gas_mining', { heliumUnlocked: Boolean(global.tech['helium']) });
        }
        case 'outpost':
        {
            let vals = {
                b: 0.025,
                d: 0,
                n: 0
            };
            if (global.tech['drone']){
                let rate = hasLegacyAchievement('iron_will') && legacyAchievementRank('iron_will') >= 3 ? 0.12 : 0.06;
                vals.d = global.space.drone.count * rate;
                vals.n = vals.b * (1 + (vals.d));
            }
            else {
                vals.n = vals.b;
            }

            return vals;
        }
        case 'oil_extractor':
        {
            return simpleProduction('oil_extractor', { oilTechLevel: global.tech['oil'] || 0 });
        }
        case 'elerium_ship':
        {
            return simpleProduction('elerium_ship', { asteroidTechLevel: global.tech.asteroid || 0 });
        }
        case 'iridium_ship':
        {
            return simpleProduction('iridium_ship', { asteroidTechLevel: global.tech.asteroid || 0 });
        }
        case 'iron_ship':
        {
            return simpleProduction('iron_ship', { asteroidTechLevel: global.tech.asteroid || 0 });
        }
        case 'g_factory':
        {
            if (global.race['truepath']){
                if (global.tech['isolation']){
                    return 1.8;
                }
                else {
                    let titan_colonists = p_on['ai_colonist'] ? global.civic.titan_colonist.workers + jobScale(p_on['ai_colonist']) : global.civic.titan_colonist.workers;
                    let gain = 0.05 * titan_colonists;
                    if (global.race['high_pop']){
                        gain = highPopAdjust(gain);
                    }
                    return gain;
                }
            }
            else {
                return 0.6;
            }
        }
        case 'harvester':
        {
            if (val !== 'helium' && val !== 'deuterium') return;
            return simpleProduction('harvester', { variant: val });
        }
        case 'elerium_prospector':
        {
            return simpleProduction('elerium_prospector');
        }
        case 'neutron_miner':
        {
            return simpleProduction('neutron_miner');
        }
        case 'bolognium_ship':
        {
            return simpleProduction('bolognium_ship');
        }
        case 'excavator':
        {
            return simpleProduction('excavator');
        }
        case 'vitreloy_plant':
        {
            let vitreloy = 0.18;
            if (global.civic.govern.type === 'corpocracy'){
                vitreloy *= global.tech['high_tech'] && global.tech['high_tech'] >= 16 ? 1.4 : 1.3;
            }
            if (global.civic.govern.type === 'socialist'){
                vitreloy *= 1.1;
            }
            return vitreloy;
        }
        case 'infernite_mine':
        {
            let sup = hellSupression('gate', 0, wiki);
            return 0.5 * sup.supress;
        }
        case 'water_freighter':
        {
            return simpleProduction('water_freighter');
        }
        case 'titan_mine':
        {
            switch (val){
                case 'adamantite':
                {
                    let base = highPopAdjust(0.02);
                    return base * (global.space['titan_mine'] ? global.space.titan_mine.ratio : 50) / 100;
                }
                case 'aluminium':
                {
                    let base = highPopAdjust(0.12);
                    return base * (100 - (global.space['titan_mine'] ? global.space.titan_mine.ratio : 50)) / 100;
                }
            }
        }
        case 'lander':
        {
            return simpleProduction('lander', { crashedShipCount: global.space.crashed_ship.count });
        }
        case 'orichalcum_mine':
        {
            return simpleProduction('orichalcum_mine');
        }
        case 'uranium_mine':
        {
            return simpleProduction('uranium_mine');
        }
        case 'neutronium_mine':
        {
            return simpleProduction('neutronium_mine');
        }
        case 'elerium_mine':
        {
            return simpleProduction('elerium_mine');
        }
        case 'shock_trooper':
        {
            return simpleProduction('shock_trooper', { digsiteCount: global.space.digsite.count });
        }
        case 'tank':
        {
            return simpleProduction('tank', { digsiteCount: global.space.digsite.count });
        }
        case 'mining_pit':
        {
            let mats = 0;
            switch (val){
                case 'materials':
                {
                    mats = global.tech['isolation'] ? 0.12 : 0.09;
                    break;
                }
                case 'bolognium':
                {
                    mats = global.tech['isolation'] ? 0.0288 : 0.0216;
                    break;
                }
                case 'stone':
                {
                    mats = global.tech['isolation'] ? 0.8 : 0.6;
                    break;
                }
                case 'adamantite':
                {
                    mats = global.tech['isolation'] ? 0.448 : 0.336;
                    break;
                }
                case 'copper':
                {
                    mats = 0.58;
                    break;
                }
                case 'coal':
                {
                    mats = 0.13;
                    break;
                }
                case 'iron':
                {
                    mats = 0.74;
                    break;
                }
                case 'aluminium':
                {
                    mats = 0.88;
                    break;
                }
                case 'chrysotile':
                {
                    mats = 1.44;
                    break;
                }
            }
            if (global.race['tough']){
                mats *= 1 + (traits.tough.vars()[0] / 100);
            }
            let fathom = fathomCheck('ogre');
            if (fathom > 0){
                mats *= 1 + (traits.tough.vars(1)[0] / 100 * fathom);
            }
            if (global.tech['tau_pit_mining']){
                mats *= 1.18;
            }
            return mats;
        }
        case 'tau_farm':
        {
            if (val !== 'food' && val !== 'lumber' && val !== 'water') return;
            return simpleProduction('tau_farm', { variant: val, isolation: val === 'water' ? false : Boolean(global.tech['isolation']) });
        }
        case 'womling_mine':
        {
            let boost = 1;
            if (global.tech['womling_mining']){
                boost += global.tech.womling_mining * 0.15;
            }
            if (hasLegacyAchievement('overlord') && legacyAchievementRank('overlord') >= 5){
                boost *= 1.1;
            }
            if (global.tech['womling_gene']){
                boost *= 1.25;
            }

            switch (val){
                case 'unobtainium':
                {
                    return 0.0305 * boost;
                }
                case 'uranium':
                {
                    return 0.047 * boost;
                }
                case 'titanium':
                {
                    return 0.616 * boost;
                }
                case 'copper':
                {
                    return 1.191 * boost;
                }
                case 'iron':
                {
                    return 1.377 * boost;
                }
                case 'aluminium':
                {
                    return 1.544 * boost;
                }
                case 'neutronium':
                {
                    return 0.382 * boost;
                }
                case 'iridium':
                {
                    return 0.535 * boost;
                }
            }
        }
        case 'refueling_station':
        {
            return simpleProduction('refueling_station', { isolation: Boolean(global.tech['isolation']) });
        }
        case 'ore_refinery':
        {
            return simpleProduction('ore_refinery', { tauOreMiningUnlocked: Boolean(global.tech['tau_ore_mining']) });
        }
        case 'whaling_station':
        {
            return simpleProduction('whaling_station');
        }
        case 'mining_ship':
        {
            if (global.tauceti['patrol_ship']){
                let patrol = 1;
                if (global.tauceti.patrol_ship.support > global.tauceti.patrol_ship.s_max){
                    patrol = flib('curve',global.tauceti.patrol_ship.s_max / global.tauceti.patrol_ship.support,1.4);
                }
                return (global.tech['tau_ore_mining'] && global.tech.tau_ore_mining >= 2 ? 12 : 10) * patrol;
            }
            return 0;
        }
        case 'mining_ship_ore':
        {
            if (val !== 'iron' && val !== 'aluminium' && val !== 'iridium' && val !== 'neutronium' && val !== 'orichalcum' && val !== 'elerium') return;
            return simpleProduction('mining_ship_ore', { variant: val, isolation: Boolean(global.tech['isolation']) });
        }
        case 'whaling_ship':
        {
            if (global.tauceti['patrol_ship']){
                let patrol = 1;
                if (global.tauceti.patrol_ship.support > global.tauceti.patrol_ship.s_max){
                    patrol = flib('curve',global.tauceti.patrol_ship.s_max / global.tauceti.patrol_ship.support,1.4);
                }
                return 8 * patrol;
            }
            return 0;
        }
        case 'whaling_ship_oil':
        {
            return simpleProduction('whaling_ship_oil', { isolation: Boolean(global.tech['isolation']) });
        }
        case 'alien_outpost':
        {
            return simpleProduction('alien_outpost');
        }
        case 'psychic_boost':
        {
            if (global.tech['psychic'] && global.race['psychic'] && global.race['psychicPowers'] && global.race.psychicPowers.boost.r === val && global.race.psychicPowers.hasOwnProperty('boostTime')){
                let boost = 0;
                if (global.race.psychicPowers.boostTime > 0){
                    boost += traits.psychic.vars()[3] / 100;
                }
                if (global.tech.psychic >= 4 && global.race.psychicPowers['channel']){
                    let rank = hasLegacyAchievement('nightmare') && legacyAchievementRank('nightmare', 'mg') ? legacyAchievementRank('nightmare', 'mg') : 0;
                    boost += +(traits.psychic.vars()[3] / 50000 * rank * global.race.psychicPowers.channel.boost).toFixed(3);
                }
                return 1 + boost;
            }
            return 1;
        }
        case 'psychic_cash':
        {
            if (global.tech['psychic'] && global.race['psychic'] && global.race['psychicPowers'] && global.race.psychicPowers.hasOwnProperty('cash')){
                let boost = 0;
                if (global.race.psychicPowers.cash > 0){
                    boost += traits.psychic.vars()[3] / 100;
                }
                if (global.tech.psychic >= 4 && global.race.psychicPowers['channel']){
                    let rank = hasLegacyAchievement('nightmare') && legacyAchievementRank('nightmare', 'mg') ? legacyAchievementRank('nightmare', 'mg') : 0;
                    boost += +(traits.psychic.vars()[3] / 50000 * rank * global.race.psychicPowers.channel.cash).toFixed(3);
                }
                return 1 + boost;
            }
            return 1;
        }
        case 'asphodel_harvester':
        {
            let base = 0.075;
            if (global.tech['hell_lake'] && global.tech.hell_lake >= 7 && global.tech['railway']){
                base *= 1 + (global.tech.railway / 100);
            }
            if (global.race['warlord'] && global.eden['corruptor']){
                base = 1 + (p_on['corruptor'] || 0) * 0.06;
            }
            return base;
        }
        case 'shadow_mine':
        {
            if (val !== 'elerium' && val !== 'infernite' && val !== 'vitreloy') return;
            return simpleProduction('shadow_mine', { variant: val });
        }
    }
}

export function factoryBonus(factory){
    if (global.race['toxic']){
        factory *= 1 + (traits.toxic.vars()[0] / 100);
    }
    if (global.race['artisan']){
        factory *= 1 + (traits.artisan.vars()[1] / 100);
    }
    let fathom = fathomCheck('shroomi');
    if (fathom > 0){
        factory *= 1 + (traits.toxic.vars(1)[0] / 100 * fathom);
    }
    if (global.civic.govern.type === 'corpocracy'){
        factory *= 1 + (govEffect.corpocracy()[4] / 100);
    }
    if (global.civic.govern.type === 'socialist'){
        factory *= 1 + (govEffect.socialist()[1] / 100);
    }
    if (hasLegacyAchievement('iron_will') && legacyAchievementRank('iron_will') >= 2){
        factory *= 1.1;
    }
    if (global.race['elemental'] && traits.elemental.vars()[0] === 'acid'){
        factory *= 1 + highPopAdjust(traits.elemental.vars()[2] * global.resource[global.race.species].amount / 100);
    }
    return factory;
}