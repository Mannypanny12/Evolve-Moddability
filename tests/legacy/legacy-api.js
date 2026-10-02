import {
    global,
    setGlobal,
    tmp_vars,
    breakdown,
    power_generated,
    p_on,
    support_on,
    int_on,
    gal_on,
    spire_on,
    atrack,
    callback_queue,
    active_rituals,
    webWorker,
    intervals
} from '../../src/vars.js';
import '../../src/locale.js';
import '../../src/achieve.js';
import { modRes, loopTimers } from '../../src/functions.js';
import '../../src/races.js';
import '../../src/resources.js';
import '../../src/jobs.js';
import '../../src/industry.js';
import { defineGovernment, commisionGarrison } from '../../src/civics.js';
import {
    actions,
    checkCosts,
    payCosts,
    checkTechQualifications,
    checkTechRequirements
} from '../../src/actions.js';
import '../../src/space.js';
import '../../src/portal.js';
import '../../src/edenic.js';
import '../../src/truepath.js';
import '../../src/arpa.js';
import { events } from '../../src/events.js';
import '../../src/governor.js';
import '../../src/prod.js';
import '../../src/tech.js';
import '../../src/resets.js';
import '../../src/index.js';
import '../../src/seasons.js';
import '../../src/wiki/change.js';
import '../../src/debug.js';

const PRISTINE_LEGACY_STATE = structuredClone(global);

function clone(value){
    return structuredClone(value);
}

function numericCosts(costs){
    const result = {};
    Object.keys(costs).forEach(resource => {
        const value = costs[resource];
        result[resource] = typeof value === 'function' ? value : () => value;
    });
    return result;
}

function clearObject(object){
    Object.keys(object).forEach(key => delete object[key]);
}

function installLegacyState(state){
    const runtimeState = clone(state);
    setGlobal(runtimeState);

    clearObject(tmp_vars);
    tmp_vars.resource = {};

    clearObject(breakdown);
    breakdown.c = {};
    breakdown.p = {};

    [power_generated, p_on, support_on, int_on, gal_on, spire_on, active_rituals, intervals]
        .forEach(clearObject);

    callback_queue.clear();
    atrack.t = 0;

    webWorker.w = false;
    webWorker.s = false;
    webWorker.mt = 250;
    webWorker.midRatio = 4;
    webWorker.longRatio = 20;

    const runtime = globalThis.__EVOLVE_TEST_RUNTIME__;
    if (runtime && runtime.storage){
        runtime.storage.clear();
    }

    return runtimeState;
}

function legacyState(){
    return global;
}

function pristineLegacyState(){
    return clone(PRISTINE_LEGACY_STATE);
}

function applyResourceDelta(resource, amount, notrack = true){
    return modRes(resource, amount, notrack);
}

function canAfford(costs){
    return checkCosts(numericCosts(costs));
}

function pay(costs){
    return payCosts({}, numericCosts(costs));
}

function technologyRequirements(id, predictionList){
    return checkTechRequirements(id, predictionList);
}

function technologyQualifies(id){
    const definition = actions.tech[id];
    if (!definition){
        throw new Error(`Unknown legacy technology: ${id}`);
    }
    return checkTechQualifications(definition, 'tech');
}

function technologyDefinition(id){
    return actions.tech[id];
}

function actionCondition(group, id){
    const definition = actions[group] && actions[group][id];
    if (!definition){
        throw new Error(`Unknown legacy action: ${group}.${id}`);
    }
    return definition.condition ? definition.condition() : true;
}

function eventEffect(id){
    if (!events[id]){
        throw new Error(`Unknown legacy event: ${id}`);
    }
    return events[id].effect();
}

let simulationModule = null;

function hydrateGarrisonDefaults(){
    const persisted = global.civic.garrison
        ? clone(global.civic.garrison)
        : null;

    if (persisted){
        delete global.civic.garrison;
    }

    commisionGarrison();

    if (persisted){
        Object.assign(global.civic.garrison, persisted);
    }
}

async function hydrateSimulationState(){
    if (!simulationModule){
        if (global.race.species !== 'protoplasm'){
            defineGovernment(true);
            hydrateGarrisonDefaults();
        }
        simulationModule = await import('../../src/main.js');
    }
    return simulationModule;
}

async function runGameLoops(periods){
    if (!simulationModule){
        throw new Error('Legacy simulation state must be hydrated before running game loops');
    }
    webWorker.s = true;
    simulationModule.execGameLoops(periods);
}

function transientSimulationState(){
    return clone({
        power_generated,
        p_on,
        support_on,
        int_on,
        gal_on,
        spire_on,
        atrack
    });
}

function loopTiming(){
    return loopTimers();
}

function setWallClock(timestamp){
    globalThis.__EVOLVE_TEST_RUNTIME__.clock.set(timestamp);
}

function resetWallClock(){
    globalThis.__EVOLVE_TEST_RUNTIME__.clock.reset();
}

function setRandomSequence(values){
    globalThis.__EVOLVE_TEST_RUNTIME__.rng.sequence(values);
}

function seedRandom(seed){
    globalThis.__EVOLVE_TEST_RUNTIME__.rng.seed(seed);
}

function resetRandom(){
    globalThis.__EVOLVE_TEST_RUNTIME__.rng.reset();
}

globalThis.__EVOLVE_LEGACY_TEST_API__ = {
    installLegacyState,
    legacyState,
    pristineLegacyState,
    applyResourceDelta,
    canAfford,
    pay,
    technologyRequirements,
    technologyQualifies,
    technologyDefinition,
    actionCondition,
    eventEffect,
    hydrateSimulationState,
    runGameLoops,
    transientSimulationState,
    loopTiming,
    setWallClock,
    resetWallClock,
    setRandomSequence,
    seedRandom,
    resetRandom
};
