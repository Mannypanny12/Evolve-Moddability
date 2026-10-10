import { createCalculationEngine } from '../../engine/calculations/calculation-engine.mjs';
import {
    createOilWellProductionModifiers,
    createOilWellProductionRegistration,
} from '../../content/evolve/calculations/oil-well-production.mjs';
import { createSimpleProductionRegistrations } from '../../content/evolve/calculations/simple-production.mjs';
import { createExplicitStateProductionRegistrations } from '../../content/evolve/calculations/explicit-state-production.mjs';

const productionCalculationEngine = createCalculationEngine({
    registrations: [
        createOilWellProductionRegistration(),
        ...createSimpleProductionRegistrations(),
        ...createExplicitStateProductionRegistrations(),
    ],
    modifiers: [
        ...createOilWellProductionModifiers(),
    ],
});

export function calculateProductionCalculation({ id, inputs }){
    return productionCalculationEngine.calculate({ id, inputs }).value;
}
