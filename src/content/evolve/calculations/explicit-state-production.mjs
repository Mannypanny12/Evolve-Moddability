import { EngineContractError } from '../../../engine/identity.mjs';
import { readClosedCalculationObject } from '../../../engine/calculations/common.mjs';
import { calculateProduction } from '../../../engine/calculations/resource-primitives.mjs';

const PREFIX = 'evolve:calculation/production/';

export const EXPLICIT_STATE_PRODUCTION_CALCULATION_IDS = Object.freeze({
    biodome: `${PREFIX}biodome`,
    g_factory: `${PREFIX}g-factory`,
    vitreloy_plant: `${PREFIX}vitreloy-plant`,
    infernite_mine: `${PREFIX}infernite-mine`,
    titan_mine: `${PREFIX}titan-mine`,
    mining_pit: `${PREFIX}mining-pit`,
    womling_mine: `${PREFIX}womling-mine`,
    mining_ship: `${PREFIX}mining-ship`,
    whaling_ship: `${PREFIX}whaling-ship`,
    asphodel_harvester: `${PREFIX}asphodel-harvester`,
});

const BIODOME_VARIANTS = Object.freeze(['food', 'cat_food', 'lumber']);
const TITAN_MINE_VARIANTS = Object.freeze(['adamantite', 'aluminium']);
const MINING_PIT_VARIANTS = Object.freeze([
    'materials', 'bolognium', 'stone', 'adamantite', 'copper',
    'coal', 'iron', 'aluminium', 'chrysotile', 'other',
]);
const WOMLING_MINE_VARIANTS = Object.freeze([
    'unobtainium', 'uranium', 'titanium', 'copper',
    'iron', 'aluminium', 'neutronium', 'iridium',
]);
const GOVERNMENT_TYPES = Object.freeze(['corpocracy', 'socialist', 'other']);

function fail(message, details){
    throw new EngineContractError('INVALID_EXPLICIT_STATE_PRODUCTION_INPUTS', message, details);
}

function readInputs(rawInputs, path, allowed){
    return readClosedCalculationObject(rawInputs, {
        path,
        allowed,
        required: allowed,
        code: 'INVALID_EXPLICIT_STATE_PRODUCTION_INPUTS',
    });
}

function finiteNumber(fields, field, path){
    const value = fields.get(field);
    if (typeof value !== 'number' || !Number.isFinite(value)){
        fail(`${path}.${field} must be a finite number.`, {
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
        fail(`${path}.${field} must be a boolean.`, {
            path: `${path}.${field}`,
            valueType: typeof value,
        });
    }
    return value;
}

function enumValue(fields, field, path, allowed){
    const value = fields.get(field);
    if (typeof value !== 'string' || !allowed.includes(value)){
        fail(`${path}.${field} must be one of ${allowed.map(entry => JSON.stringify(entry)).join(', ')}.`, {
            path: `${path}.${field}`,
            value,
        });
    }
    return value;
}

function production(value){
    return calculateProduction({ contributions: [value] });
}

function registration(productionId, fields, validate, calculateValue){
    const id = EXPLICIT_STATE_PRODUCTION_CALCULATION_IDS[productionId];
    const path = `${productionId}ProductionInputs`;
    return Object.freeze({
        id,
        validateInputs(rawInputs){
            const values = readInputs(rawInputs, path, fields);
            return Object.freeze(validate(values, path));
        },
        calculateBase(inputs){
            return production(calculateValue(inputs));
        },
    });
}

function biodomeRegistration(){
    return registration(
        'biodome',
        ['variant', 'evilUniverse', 'highPopMultiplier'],
        (fields, path) => ({
            variant: enumValue(fields, 'variant', path, BIODOME_VARIANTS),
            evilUniverse: booleanValue(fields, 'evilUniverse', path),
            highPopMultiplier: finiteNumber(fields, 'highPopMultiplier', path),
        }),
        inputs => {
            switch (inputs.variant){
                case 'food':
                    return (inputs.evilUniverse ? 0.1 : 0.25) * inputs.highPopMultiplier;
                case 'cat_food':
                    return 2;
                case 'lumber':
                    return 1.5 * inputs.highPopMultiplier;
            }
        }
    );
}

function gFactoryRegistration(){
    return registration(
        'g_factory',
        ['truepath', 'isolation', 'titanColonistWorkers', 'aiColonistContribution', 'highPopProductionMultiplier'],
        (fields, path) => ({
            truepath: booleanValue(fields, 'truepath', path),
            isolation: booleanValue(fields, 'isolation', path),
            titanColonistWorkers: finiteNumber(fields, 'titanColonistWorkers', path),
            aiColonistContribution: finiteNumber(fields, 'aiColonistContribution', path),
            highPopProductionMultiplier: finiteNumber(fields, 'highPopProductionMultiplier', path),
        }),
        inputs => {
            if (!inputs.truepath) return 0.6;
            if (inputs.isolation) return 1.8;
            let gain = 0.05 * (inputs.titanColonistWorkers + inputs.aiColonistContribution);
            gain *= inputs.highPopProductionMultiplier;
            return gain;
        }
    );
}

function vitreloyPlantRegistration(){
    return registration(
        'vitreloy_plant',
        ['governmentType', 'highTechLevel'],
        (fields, path) => ({
            governmentType: enumValue(fields, 'governmentType', path, GOVERNMENT_TYPES),
            highTechLevel: finiteNumber(fields, 'highTechLevel', path),
        }),
        inputs => {
            let vitreloy = 0.18;
            if (inputs.governmentType === 'corpocracy'){
                vitreloy *= inputs.highTechLevel >= 16 ? 1.4 : 1.3;
            }
            if (inputs.governmentType === 'socialist'){
                vitreloy *= 1.1;
            }
            return vitreloy;
        }
    );
}

function inferniteMineRegistration(){
    return registration(
        'infernite_mine',
        ['suppression'],
        (fields, path) => ({
            suppression: finiteNumber(fields, 'suppression', path),
        }),
        inputs => 0.5 * inputs.suppression
    );
}

function titanMineRegistration(){
    return registration(
        'titan_mine',
        ['variant', 'ratio', 'highPopMultiplier'],
        (fields, path) => ({
            variant: enumValue(fields, 'variant', path, TITAN_MINE_VARIANTS),
            ratio: finiteNumber(fields, 'ratio', path),
            highPopMultiplier: finiteNumber(fields, 'highPopMultiplier', path),
        }),
        inputs => {
            switch (inputs.variant){
                case 'adamantite': {
                    const base = 0.02 * inputs.highPopMultiplier;
                    return base * inputs.ratio / 100;
                }
                case 'aluminium': {
                    const base = 0.12 * inputs.highPopMultiplier;
                    return base * (100 - inputs.ratio) / 100;
                }
            }
        }
    );
}

function miningPitBase(variant, isolation){
    switch (variant){
        case 'materials': return isolation ? 0.12 : 0.09;
        case 'bolognium': return isolation ? 0.0288 : 0.0216;
        case 'stone': return isolation ? 0.8 : 0.6;
        case 'adamantite': return isolation ? 0.448 : 0.336;
        case 'copper': return 0.58;
        case 'coal': return 0.13;
        case 'iron': return 0.74;
        case 'aluminium': return 0.88;
        case 'chrysotile': return 1.44;
        case 'other': return 0;
    }
}

function miningPitRegistration(){
    return registration(
        'mining_pit',
        ['variant', 'isolation', 'toughPercent', 'ogreFathom', 'fathomedToughPercent', 'tauPitMining'],
        (fields, path) => ({
            variant: enumValue(fields, 'variant', path, MINING_PIT_VARIANTS),
            isolation: booleanValue(fields, 'isolation', path),
            toughPercent: finiteNumber(fields, 'toughPercent', path),
            ogreFathom: finiteNumber(fields, 'ogreFathom', path),
            fathomedToughPercent: finiteNumber(fields, 'fathomedToughPercent', path),
            tauPitMining: booleanValue(fields, 'tauPitMining', path),
        }),
        inputs => {
            let mats = miningPitBase(inputs.variant, inputs.isolation);
            if (inputs.toughPercent !== 0){
                mats *= 1 + (inputs.toughPercent / 100);
            }
            if (inputs.ogreFathom > 0){
                mats *= 1 + (inputs.fathomedToughPercent / 100 * inputs.ogreFathom);
            }
            if (inputs.tauPitMining){
                mats *= 1.18;
            }
            return mats;
        }
    );
}

function womlingMineRegistration(){
    return registration(
        'womling_mine',
        ['variant', 'womlingMiningLevel', 'overlordRankFive', 'womlingGene'],
        (fields, path) => ({
            variant: enumValue(fields, 'variant', path, WOMLING_MINE_VARIANTS),
            womlingMiningLevel: finiteNumber(fields, 'womlingMiningLevel', path),
            overlordRankFive: booleanValue(fields, 'overlordRankFive', path),
            womlingGene: booleanValue(fields, 'womlingGene', path),
        }),
        inputs => {
            let boost = 1;
            if (inputs.womlingMiningLevel){
                boost += inputs.womlingMiningLevel * 0.15;
            }
            if (inputs.overlordRankFive){
                boost *= 1.1;
            }
            if (inputs.womlingGene){
                boost *= 1.25;
            }
            const base = {
                unobtainium: 0.0305,
                uranium: 0.047,
                titanium: 0.616,
                copper: 1.191,
                iron: 1.377,
                aluminium: 1.544,
                neutronium: 0.382,
                iridium: 0.535,
            }[inputs.variant];
            return base * boost;
        }
    );
}

function patrolMultiplier(support, maxSupport){
    let patrol = 1;
    if (support > maxSupport){
        patrol = 1 - ((1 - (maxSupport / support)) ** 1.4);
    }
    return patrol;
}

function miningShipRegistration(){
    return registration(
        'mining_ship',
        ['patrolExists', 'support', 'maxSupport', 'tauOreMiningLevel'],
        (fields, path) => ({
            patrolExists: booleanValue(fields, 'patrolExists', path),
            support: finiteNumber(fields, 'support', path),
            maxSupport: finiteNumber(fields, 'maxSupport', path),
            tauOreMiningLevel: finiteNumber(fields, 'tauOreMiningLevel', path),
        }),
        inputs => {
            if (!inputs.patrolExists) return 0;
            const base = inputs.tauOreMiningLevel >= 2 ? 12 : 10;
            return base * patrolMultiplier(inputs.support, inputs.maxSupport);
        }
    );
}

function whalingShipRegistration(){
    return registration(
        'whaling_ship',
        ['patrolExists', 'support', 'maxSupport'],
        (fields, path) => ({
            patrolExists: booleanValue(fields, 'patrolExists', path),
            support: finiteNumber(fields, 'support', path),
            maxSupport: finiteNumber(fields, 'maxSupport', path),
        }),
        inputs => inputs.patrolExists
            ? 8 * patrolMultiplier(inputs.support, inputs.maxSupport)
            : 0
    );
}

function asphodelHarvesterRegistration(){
    return registration(
        'asphodel_harvester',
        ['hellLakeLevel', 'railwayLevel', 'warlord', 'corruptorExists', 'corruptorOn'],
        (fields, path) => ({
            hellLakeLevel: finiteNumber(fields, 'hellLakeLevel', path),
            railwayLevel: finiteNumber(fields, 'railwayLevel', path),
            warlord: booleanValue(fields, 'warlord', path),
            corruptorExists: booleanValue(fields, 'corruptorExists', path),
            corruptorOn: finiteNumber(fields, 'corruptorOn', path),
        }),
        inputs => {
            let base = 0.075;
            if (inputs.hellLakeLevel && inputs.hellLakeLevel >= 7 && inputs.railwayLevel){
                base *= 1 + (inputs.railwayLevel / 100);
            }
            if (inputs.warlord && inputs.corruptorExists){
                base = 1 + inputs.corruptorOn * 0.06;
            }
            return base;
        }
    );
}

export function createExplicitStateProductionRegistrations(){
    return Object.freeze([
        biodomeRegistration(),
        gFactoryRegistration(),
        vitreloyPlantRegistration(),
        inferniteMineRegistration(),
        titanMineRegistration(),
        miningPitRegistration(),
        womlingMineRegistration(),
        miningShipRegistration(),
        whalingShipRegistration(),
        asphodelHarvesterRegistration(),
    ]);
}
