import { global, setGlobal, tmp_vars } from '../../src/vars.js';
import '../../src/locale.js';
import '../../src/achieve.js';
import { modRes } from '../../src/functions.js';
import '../../src/races.js';
import '../../src/resources.js';
import '../../src/jobs.js';
import '../../src/industry.js';
import '../../src/civics.js';
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
import '../../src/events.js';
import '../../src/governor.js';
import '../../src/prod.js';
import '../../src/tech.js';
import '../../src/resets.js';
import '../../src/index.js';
import '../../src/seasons.js';
import '../../src/wiki/change.js';
import '../../src/debug.js';

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
    setGlobal(state);
    clearObject(tmp_vars);
    tmp_vars.resource = {};
}

function legacyState(){
    return global;
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

globalThis.__EVOLVE_LEGACY_TEST_API__ = {
    installLegacyState,
    legacyState,
    applyResourceDelta,
    canAfford,
    pay,
    technologyRequirements,
    technologyQualifies,
    technologyDefinition
};
