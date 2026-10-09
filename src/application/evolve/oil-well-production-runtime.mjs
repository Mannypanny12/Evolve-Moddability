import { OIL_WELL_PRODUCTION_CALCULATION_ID } from '../../content/evolve/calculations/oil-well-production.mjs';
import { calculateProductionCalculation } from './production-calculation-runtime.mjs';

export function calculateOilWellProduction(inputs){
    return calculateProductionCalculation({
        id: OIL_WELL_PRODUCTION_CALCULATION_ID,
        inputs,
    });
}
