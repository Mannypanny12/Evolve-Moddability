import { createCalculationEngine } from '../../engine/calculations/calculation-engine.mjs';
import {
    OIL_WELL_PRODUCTION_CALCULATION_ID,
    createOilWellProductionModifiers,
    createOilWellProductionRegistration,
} from '../../content/evolve/calculations/oil-well-production.mjs';

const oilWellProductionEngine = createCalculationEngine({
    registrations: [createOilWellProductionRegistration()],
    modifiers: createOilWellProductionModifiers(),
});

export function calculateOilWellProduction(inputs){
    return oilWellProductionEngine.calculate({
        id: OIL_WELL_PRODUCTION_CALCULATION_ID,
        inputs,
    }).value;
}
