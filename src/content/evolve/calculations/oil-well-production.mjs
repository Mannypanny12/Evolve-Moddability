import { EngineContractError } from '../../../engine/identity.mjs';
import { readClosedCalculationObject } from '../../../engine/calculations/common.mjs';
import { calculateProduction } from '../../../engine/calculations/resource-primitives.mjs';

export const OIL_WELL_PRODUCTION_CALCULATION_ID = 'evolve:calculation/production/oil-well';

const INPUT_FIELDS = Object.freeze([
    'oilTechLevel',
    'geologyBonus',
    'biomeOilMultiplier',
    'dirtyJobsPercent',
    'warlord',
    'pumpjackRank',
]);

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function finiteNumber(fields, field){
    const value = fields.get(field);
    if (typeof value !== 'number' || !Number.isFinite(value)){
        fail('INVALID_OIL_WELL_PRODUCTION_INPUTS', `oilWellProductionInputs.${field} must be a finite number.`, {
            path: `oilWellProductionInputs.${field}`,
            valueType: typeof value,
            value: typeof value === 'number' ? value : undefined,
        });
    }
    return Object.is(value, -0) ? 0 : value;
}

function finiteNumberOrNull(fields, field){
    const value = fields.get(field);
    return value === null ? null : finiteNumber(fields, field);
}

function validateInputs(rawInputs){
    const fields = readClosedCalculationObject(rawInputs, {
        path: 'oilWellProductionInputs',
        allowed: INPUT_FIELDS,
        required: INPUT_FIELDS,
        code: 'INVALID_OIL_WELL_PRODUCTION_INPUTS',
    });
    const warlord = fields.get('warlord');
    if (typeof warlord !== 'boolean'){
        fail('INVALID_OIL_WELL_PRODUCTION_INPUTS', 'oilWellProductionInputs.warlord must be a boolean.', {
            path: 'oilWellProductionInputs.warlord',
            valueType: typeof warlord,
        });
    }
    return {
        oilTechLevel: finiteNumber(fields, 'oilTechLevel'),
        geologyBonus: finiteNumber(fields, 'geologyBonus'),
        biomeOilMultiplier: finiteNumberOrNull(fields, 'biomeOilMultiplier'),
        dirtyJobsPercent: finiteNumber(fields, 'dirtyJobsPercent'),
        warlord,
        pumpjackRank: finiteNumber(fields, 'pumpjackRank'),
    };
}

function technologyMultiplier(inputs){
    if (inputs.oilTechLevel >= 7) return 2;
    if (inputs.oilTechLevel >= 6) return 1.75;
    if (inputs.oilTechLevel >= 5) return 1.25;
    return 1;
}

export function createOilWellProductionRegistration(){
    return Object.freeze({
        id: OIL_WELL_PRODUCTION_CALCULATION_ID,
        validateInputs,
        calculateBase(inputs){
            return calculateProduction({
                contributions: [inputs.oilTechLevel >= 4 ? 0.48 : 0.4],
            });
        },
    });
}

export function createOilWellProductionModifiers(){
    return Object.freeze([
        Object.freeze({
            id: 'evolve:modifier/production/oil-well/technology',
            calculationId: OIL_WELL_PRODUCTION_CALCULATION_ID,
            order: 100,
            operation: 'multiply',
            applies: inputs => inputs.oilTechLevel >= 5,
            operand: technologyMultiplier,
        }),
        Object.freeze({
            id: 'evolve:modifier/production/oil-well/geology',
            calculationId: OIL_WELL_PRODUCTION_CALCULATION_ID,
            order: 200,
            operation: 'multiply',
            applies: inputs => Boolean(inputs.geologyBonus),
            operand: inputs => inputs.geologyBonus + 1,
        }),
        Object.freeze({
            id: 'evolve:modifier/production/oil-well/biome',
            calculationId: OIL_WELL_PRODUCTION_CALCULATION_ID,
            order: 300,
            operation: 'multiply',
            applies: inputs => inputs.biomeOilMultiplier !== null,
            operand: inputs => inputs.biomeOilMultiplier,
        }),
        Object.freeze({
            id: 'evolve:modifier/production/oil-well/dirty-jobs',
            calculationId: OIL_WELL_PRODUCTION_CALCULATION_ID,
            order: 400,
            operation: 'multiply',
            applies: inputs => Boolean(inputs.dirtyJobsPercent),
            operand: inputs => 1 + (inputs.dirtyJobsPercent / 100),
        }),
        Object.freeze({
            id: 'evolve:modifier/production/oil-well/warlord',
            calculationId: OIL_WELL_PRODUCTION_CALCULATION_ID,
            order: 500,
            operation: 'multiply',
            applies: inputs => inputs.warlord,
            operand: inputs => 1 + (inputs.pumpjackRank || 1) * 0.24,
        }),
    ]);
}
