import { EngineContractError } from '../identity.mjs';
import {
    readClosedCalculationObject,
    readDenseCalculationArray,
} from './common.mjs';
import { assertResourceMagnitude } from './resource-contract.mjs';

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function addFiniteMagnitude(total, value, path, code){
    const next = total + value;
    if (!Number.isFinite(next)){
        fail(code, `${path} exceeds the finite resource calculation range.`, {
            path,
            total,
            value,
        });
    }
    return Object.is(next, -0) ? 0 : next;
}

function sumContributions(rawContributions, path, code){
    const contributions = readDenseCalculationArray(rawContributions, path, code);
    let total = 0;
    for (let index = 0; index < contributions.length; index++){
        const contributionPath = `${path}[${index}]`;
        const value = assertResourceMagnitude(contributions[index], contributionPath, code);
        total = addFiniteMagnitude(total, value, contributionPath, code);
    }
    return total;
}

export function calculateProduction(rawInputs){
    const fields = readClosedCalculationObject(rawInputs, {
        path: 'productionInputs',
        allowed: ['contributions'],
        required: ['contributions'],
        code: 'INVALID_RESOURCE_PRODUCTION',
    });
    return sumContributions(fields.get('contributions'), 'productionInputs.contributions', 'INVALID_RESOURCE_PRODUCTION');
}

export function calculateConsumption(rawInputs){
    const fields = readClosedCalculationObject(rawInputs, {
        path: 'consumptionInputs',
        allowed: ['contributions'],
        required: ['contributions'],
        code: 'INVALID_RESOURCE_CONSUMPTION',
    });
    return sumContributions(fields.get('contributions'), 'consumptionInputs.contributions', 'INVALID_RESOURCE_CONSUMPTION');
}

export function calculateCapacity(rawInputs){
    const fields = readClosedCalculationObject(rawInputs, {
        path: 'capacityInputs',
        allowed: ['baseCapacity', 'additions'],
        required: ['baseCapacity', 'additions'],
        code: 'INVALID_RESOURCE_CAPACITY_CALCULATION',
    });
    let total = assertResourceMagnitude(
        fields.get('baseCapacity'),
        'capacityInputs.baseCapacity',
        'INVALID_RESOURCE_CAPACITY_CALCULATION'
    );
    const additions = readDenseCalculationArray(
        fields.get('additions'),
        'capacityInputs.additions',
        'INVALID_RESOURCE_CAPACITY_CALCULATION'
    );
    for (let index = 0; index < additions.length; index++){
        const path = `capacityInputs.additions[${index}]`;
        const value = assertResourceMagnitude(additions[index], path, 'INVALID_RESOURCE_CAPACITY_CALCULATION');
        total = addFiniteMagnitude(total, value, path, 'INVALID_RESOURCE_CAPACITY_CALCULATION');
    }
    return total;
}

export function calculateStorageCapacity(rawInputs){
    const fields = readClosedCalculationObject(rawInputs, {
        path: 'storageInputs',
        allowed: ['quantity', 'capacityPerUnit'],
        required: ['quantity', 'capacityPerUnit'],
        code: 'INVALID_RESOURCE_STORAGE_CALCULATION',
    });
    const quantity = assertResourceMagnitude(
        fields.get('quantity'),
        'storageInputs.quantity',
        'INVALID_RESOURCE_STORAGE_CALCULATION'
    );
    const capacityPerUnit = assertResourceMagnitude(
        fields.get('capacityPerUnit'),
        'storageInputs.capacityPerUnit',
        'INVALID_RESOURCE_STORAGE_CALCULATION'
    );
    const capacity = quantity * capacityPerUnit;
    if (!Number.isFinite(capacity)){
        fail('INVALID_RESOURCE_STORAGE_CALCULATION', 'storageInputs exceeds the finite resource calculation range.', {
            path: 'storageInputs',
            quantity,
            capacityPerUnit,
        });
    }
    return Object.is(capacity, -0) ? 0 : capacity;
}
