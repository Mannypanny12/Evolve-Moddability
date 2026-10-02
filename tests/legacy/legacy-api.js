import { global, setGlobal, tmp_vars } from '../../src/vars.js';
import { modRes } from '../../src/functions.js';
import {
    actions,
    checkCosts,
    payCosts,
    checkTechQualifications,
    checkTechRequirements
} from '../../src/actions.js';

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

export function installLegacyState(state){
    setGlobal(state);
    clearObject(tmp_vars);
    tmp_vars.resource = {};
}

export function legacyState(){
    return global;
}

export function applyResourceDelta(resource, amount, notrack = true){
    return modRes(resource, amount, notrack);
}

export function canAfford(costs){
    return checkCosts(numericCosts(costs));
}

export function pay(costs){
    return payCosts({}, numericCosts(costs));
}

export function technologyRequirements(id, predictionList){
    return checkTechRequirements(id, predictionList);
}

export function technologyQualifies(id){
    const definition = actions.tech[id];
    if (!definition){
        throw new Error(`Unknown legacy technology: ${id}`);
    }
    return checkTechQualifications(definition, 'tech');
}

export function technologyDefinition(id){
    return actions.tech[id];
}
