import { EngineContractError } from '../../../engine/identity.mjs';
import { readClosedCalculationObject } from '../../../engine/calculations/common.mjs';
import { calculateProduction } from '../../../engine/calculations/resource-primitives.mjs';

const PREFIX = 'evolve:calculation/production/';

export const SIMPLE_PRODUCTION_CALCULATION_IDS = Object.freeze({
    transmitter: `${PREFIX}transmitter`,
    gas_mining: `${PREFIX}gas-mining`,
    oil_extractor: `${PREFIX}oil-extractor`,
    elerium_ship: `${PREFIX}elerium-ship`,
    iridium_ship: `${PREFIX}iridium-ship`,
    iron_ship: `${PREFIX}iron-ship`,
    harvester: `${PREFIX}harvester`,
    elerium_prospector: `${PREFIX}elerium-prospector`,
    neutron_miner: `${PREFIX}neutron-miner`,
    bolognium_ship: `${PREFIX}bolognium-ship`,
    excavator: `${PREFIX}excavator`,
    water_freighter: `${PREFIX}water-freighter`,
    lander: `${PREFIX}lander`,
    orichalcum_mine: `${PREFIX}orichalcum-mine`,
    uranium_mine: `${PREFIX}uranium-mine`,
    neutronium_mine: `${PREFIX}neutronium-mine`,
    elerium_mine: `${PREFIX}elerium-mine`,
    shock_trooper: `${PREFIX}shock-trooper`,
    tank: `${PREFIX}tank`,
    tau_farm: `${PREFIX}tau-farm`,
    refueling_station: `${PREFIX}refueling-station`,
    ore_refinery: `${PREFIX}ore-refinery`,
    whaling_station: `${PREFIX}whaling-station`,
    mining_ship_ore: `${PREFIX}mining-ship-ore`,
    whaling_ship_oil: `${PREFIX}whaling-ship-oil`,
    alien_outpost: `${PREFIX}alien-outpost`,
    shadow_mine: `${PREFIX}shadow-mine`,
});

const EMPTY_FIELDS = Object.freeze([]);
const HARVESTER_VARIANTS = Object.freeze(['helium', 'deuterium']);
const TAU_FARM_VARIANTS = Object.freeze(['food', 'lumber', 'water']);
const MINING_SHIP_ORE_VARIANTS = Object.freeze(['iron', 'aluminium', 'iridium', 'neutronium', 'orichalcum', 'elerium']);
const SHADOW_MINE_VARIANTS = Object.freeze(['elerium', 'infernite', 'vitreloy']);

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function readInputs(rawInputs, path, allowed){
    return readClosedCalculationObject(rawInputs, {
        path,
        allowed,
        required: allowed,
        code: 'INVALID_SIMPLE_PRODUCTION_INPUTS',
    });
}

function validateEmptyInputs(rawInputs, path){
    readInputs(rawInputs, path, EMPTY_FIELDS);
    return Object.freeze({});
}

function finiteNumber(fields, field, path){
    const value = fields.get(field);
    if (typeof value !== 'number' || !Number.isFinite(value)){
        fail('INVALID_SIMPLE_PRODUCTION_INPUTS', `${path}.${field} must be a finite number.`, {
            path: `${path}.${field}`,
            valueType: typeof value,
            value: typeof value === 'number' ? value : undefined,
        });
    }
    return Object.is(value, -0) ? 0 : value;
}

function booleanValue(fields, field, path){
    const value = fields.get(field);
    if (typeof value !== 'boolean'){
        fail('INVALID_SIMPLE_PRODUCTION_INPUTS', `${path}.${field} must be a boolean.`, {
            path: `${path}.${field}`,
            valueType: typeof value,
        });
    }
    return value;
}

function variantValue(fields, field, path, allowed){
    const value = fields.get(field);
    if (typeof value !== 'string' || !allowed.includes(value)){
        fail('INVALID_SIMPLE_PRODUCTION_INPUTS', `${path}.${field} must be one of ${allowed.map(entry => JSON.stringify(entry)).join(', ')}.`, {
            path: `${path}.${field}`,
            value,
        });
    }
    return value;
}

function production(value){
    return calculateProduction({ contributions: [value] });
}

function constantRegistration(productionId, value){
    const id = SIMPLE_PRODUCTION_CALCULATION_IDS[productionId];
    return Object.freeze({
        id,
        validateInputs(rawInputs){
            return validateEmptyInputs(rawInputs, `${productionId}ProductionInputs`);
        },
        calculateBase(){
            return production(value);
        },
    });
}

function singleNumberRegistration(productionId, field, calculateValue){
    const id = SIMPLE_PRODUCTION_CALCULATION_IDS[productionId];
    const path = `${productionId}ProductionInputs`;
    return Object.freeze({
        id,
        validateInputs(rawInputs){
            const fields = readInputs(rawInputs, path, [field]);
            return Object.freeze({ [field]: finiteNumber(fields, field, path) });
        },
        calculateBase(inputs){
            return production(calculateValue(inputs[field]));
        },
    });
}

function singleBooleanRegistration(productionId, field, calculateValue){
    const id = SIMPLE_PRODUCTION_CALCULATION_IDS[productionId];
    const path = `${productionId}ProductionInputs`;
    return Object.freeze({
        id,
        validateInputs(rawInputs){
            const fields = readInputs(rawInputs, path, [field]);
            return Object.freeze({ [field]: booleanValue(fields, field, path) });
        },
        calculateBase(inputs){
            return production(calculateValue(inputs[field]));
        },
    });
}

function variantRegistration(productionId, variants, calculateValue){
    const id = SIMPLE_PRODUCTION_CALCULATION_IDS[productionId];
    const path = `${productionId}ProductionInputs`;
    return Object.freeze({
        id,
        validateInputs(rawInputs){
            const fields = readInputs(rawInputs, path, ['variant']);
            return Object.freeze({
                variant: variantValue(fields, 'variant', path, variants),
            });
        },
        calculateBase(inputs){
            return production(calculateValue(inputs.variant));
        },
    });
}

function isolatedVariantRegistration(productionId, variants, calculateValue){
    const id = SIMPLE_PRODUCTION_CALCULATION_IDS[productionId];
    const path = `${productionId}ProductionInputs`;
    return Object.freeze({
        id,
        validateInputs(rawInputs){
            const fields = readInputs(rawInputs, path, ['variant', 'isolation']);
            return Object.freeze({
                variant: variantValue(fields, 'variant', path, variants),
                isolation: booleanValue(fields, 'isolation', path),
            });
        },
        calculateBase(inputs){
            return production(calculateValue(inputs.variant, inputs.isolation));
        },
    });
}

function oilExtractorValue(oilTechLevel){
    let oil = oilTechLevel >= 4 ? 0.48 : 0.4;
    if (oilTechLevel >= 7){
        oil *= 2;
    }
    else if (oilTechLevel >= 5){
        oil *= oilTechLevel >= 6 ? 1.75 : 1.25;
    }
    return oil;
}

function asteroidValue(asteroidTechLevel, base, tier6, tier7){
    return asteroidTechLevel >= 6 ? (asteroidTechLevel >= 7 ? tier7 : tier6) : base;
}

function harvesterValue(variant){
    return variant === 'helium' ? 0.85 : 0.15;
}

function tauFarmValue(variant, isolation){
    switch (variant){
        case 'food': return isolation ? 15 : 9;
        case 'lumber': return isolation ? 12 : 5.5;
        case 'water': return 0.35;
    }
}

function miningShipOreValue(variant, isolation){
    switch (variant){
        case 'iron':
        case 'aluminium':
            return isolation ? 2.22 : 1.85;
        case 'iridium':
        case 'neutronium':
            return isolation ? 0.42 : 0.35;
        case 'orichalcum':
            return isolation ? 0.3 : 0.25;
        case 'elerium':
            return isolation ? 0.024 : 0.02;
    }
}

function shadowMineValue(variant){
    switch (variant){
        case 'elerium': return 0.02;
        case 'infernite': return 0.015;
        case 'vitreloy': return 0.22;
    }
}

export function createSimpleProductionRegistrations(){
    return Object.freeze([
        constantRegistration('transmitter', 2.5),
        singleBooleanRegistration('gas_mining', 'heliumUnlocked', heliumUnlocked => heliumUnlocked ? 0.65 : 0.5),
        singleNumberRegistration('oil_extractor', 'oilTechLevel', oilExtractorValue),
        singleNumberRegistration('elerium_ship', 'asteroidTechLevel', level => asteroidValue(level, 0.005, 0.0075, 0.009)),
        singleNumberRegistration('iridium_ship', 'asteroidTechLevel', level => asteroidValue(level, 0.055, 0.08, 0.1)),
        singleNumberRegistration('iron_ship', 'asteroidTechLevel', level => asteroidValue(level, 2, 3, 4)),
        variantRegistration('harvester', HARVESTER_VARIANTS, harvesterValue),
        constantRegistration('elerium_prospector', 0.014),
        constantRegistration('neutron_miner', 0.055),
        constantRegistration('bolognium_ship', 0.008),
        constantRegistration('excavator', 0.2),
        constantRegistration('water_freighter', 1.25),
        singleNumberRegistration('lander', 'crashedShipCount', count => count === 100 ? 0.005 : 0),
        constantRegistration('orichalcum_mine', 0.08),
        constantRegistration('uranium_mine', 0.025),
        constantRegistration('neutronium_mine', 0.04),
        constantRegistration('elerium_mine', 0.009),
        singleNumberRegistration('shock_trooper', 'digsiteCount', count => count === 100 ? 0.0018 : 0),
        singleNumberRegistration('tank', 'digsiteCount', count => count === 100 ? 0.0018 : 0),
        isolatedVariantRegistration('tau_farm', TAU_FARM_VARIANTS, tauFarmValue),
        singleBooleanRegistration('refueling_station', 'isolation', isolation => isolation ? 18.5 : 9.35),
        singleBooleanRegistration('ore_refinery', 'tauOreMiningUnlocked', unlocked => unlocked ? 40 : 25),
        constantRegistration('whaling_station', 12),
        isolatedVariantRegistration('mining_ship_ore', MINING_SHIP_ORE_VARIANTS, miningShipOreValue),
        singleBooleanRegistration('whaling_ship_oil', 'isolation', isolation => isolation ? 0.78 : 0.42),
        constantRegistration('alien_outpost', 0.01),
        variantRegistration('shadow_mine', SHADOW_MINE_VARIANTS, shadowMineValue),
    ]);
}
