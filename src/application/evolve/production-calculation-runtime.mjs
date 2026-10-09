import { createCalculationEngine } from '../../engine/calculations/calculation-engine.mjs';
import {
    createOilWellProductionModifiers,
    createOilWellProductionRegistration,
} from '../../content/evolve/calculations/oil-well-production.mjs';

const productionCalculationEngine = createCalculationEngine({
    registrations: [
        createOilWellProductionRegistration(),
    ],
    modifiers: [
        ...createOilWellProductionModifiers(),
    ],
});

export function calculateProductionCalculation({ id, inputs }){
    return productionCalculationEngine.calculate({ id, inputs }).value;
}
