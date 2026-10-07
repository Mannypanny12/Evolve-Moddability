import { global } from '../../vars.js';
import { createCommandBus } from '../../engine/commands/command-bus.mjs';
import { createConditionEvaluator } from '../../engine/conditions/condition-evaluator.mjs';
import { createCoreRequirementRegistrations } from '../../engine/conditions/core-requirements.mjs';
import { createResourceCommitExecutor } from '../../engine/execution/resource-commit.mjs';
import { createEvolutionDnaCommandRegistration } from '../../content/evolve/commands/evolution-dna.mjs';
import { createEvolveLegacyConditionReadProvider } from '../../legacy/bridge/evolve-condition-read-adapter.mjs';
import { createEvolveLegacyResourceCommitCapability } from '../../legacy/bridge/evolve-resource-commit-adapter.mjs';

const DNA_COMMAND = Object.freeze({
    id: 'evolve:command/evolution/dna',
    payload: Object.freeze({}),
});

const readLegacyRoot = () => global;
const conditionReads = createEvolveLegacyConditionReadProvider({ readLegacyRoot });
const conditionEvaluator = createConditionEvaluator({
    registrations: createCoreRequirementRegistrations(conditionReads),
});
const resourceCommitCapability = createEvolveLegacyResourceCommitCapability({ readLegacyRoot });
const resourceCommitExecutor = createResourceCommitExecutor({
    commitResourceChanges: changes => resourceCommitCapability.commitResourceChanges(changes),
});
const dnaRegistration = createEvolutionDnaCommandRegistration({
    evaluateCondition: condition => conditionEvaluator.evaluate(condition),
    commitResourcePlans: (paymentPlan, effectPlan) => resourceCommitExecutor.commit(paymentPlan, effectPlan),
});
const commandBus = createCommandBus({ registrations: [dnaRegistration] });

export function dispatchEvolutionDnaCommand(){
    return commandBus.dispatch(DNA_COMMAND);
}
