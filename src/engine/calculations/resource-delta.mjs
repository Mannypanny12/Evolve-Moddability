import { EngineContractError } from '../identity.mjs';
import { readClosedCalculationObject } from './common.mjs';
import {
    assertResourceMagnitude,
    normalizeResourceCapacity,
    normalizeResourceDeltaOperations,
} from './resource-contract.mjs';

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

function finiteArithmetic(value, path, details = {}){
    if (!Number.isFinite(value)){
        fail('INVALID_RESOURCE_DELTA', `${path} exceeds the finite resource calculation range.`, {
            path,
            ...details,
        });
    }
    return Object.is(value, -0) ? 0 : value;
}

function signedRequestedDelta(kind, amount){
    return kind === 'credit' ? amount : -amount;
}

export function resolveResourceDelta(rawInputs){
    const fields = readClosedCalculationObject(rawInputs, {
        path: 'resourceDelta',
        allowed: ['startAmount', 'capacity', 'operations'],
        required: ['startAmount', 'capacity', 'operations'],
        code: 'INVALID_RESOURCE_DELTA',
    });
    const startAmount = assertResourceMagnitude(
        fields.get('startAmount'),
        'resourceDelta.startAmount',
        'INVALID_RESOURCE_DELTA'
    );
    const capacity = normalizeResourceCapacity(fields.get('capacity'), 'resourceDelta.capacity');
    const operations = normalizeResourceDeltaOperations(fields.get('operations'));

    const bounded = capacity.mode === 'bounded';
    let workingCapacity = null;
    if (bounded){
        workingCapacity = finiteArithmetic(
            capacity.value + startAmount,
            'resourceDelta.workingCapacity',
            { capacity: capacity.value, startAmount }
        );
    }

    let amount = startAmount;
    let requestedDelta = 0;
    let operationAppliedDelta = 0;
    let overflow = 0;
    let shortfall = 0;
    const steps = [];

    for (let index = 0; index < operations.length; index++){
        const operation = operations[index];
        const before = amount;
        const workingCapacityBefore = workingCapacity;
        requestedDelta = finiteArithmetic(
            requestedDelta + signedRequestedDelta(operation.kind, operation.amount),
            `resourceDelta.operations[${index}].requestedDelta`,
            { requestedDelta, amount: operation.amount, kind: operation.kind }
        );

        let stepOverflow = 0;
        let stepShortfall = 0;
        if (operation.kind === 'credit'){
            const tentative = finiteArithmetic(
                before + operation.amount,
                `resourceDelta.operations[${index}].credit`,
                { before, amount: operation.amount }
            );
            amount = bounded && tentative > workingCapacity ? workingCapacity : tentative;
            stepOverflow = finiteArithmetic(
                operation.amount - (amount - before),
                `resourceDelta.operations[${index}].overflow`
            );
            overflow = finiteArithmetic(overflow + stepOverflow, 'resourceDelta.overflow');
        }
        else {
            const tentative = finiteArithmetic(
                before - operation.amount,
                `resourceDelta.operations[${index}].debit`,
                { before, amount: operation.amount }
            );
            amount = tentative < 0 ? 0 : tentative;
            stepShortfall = finiteArithmetic(
                operation.amount - (before - amount),
                `resourceDelta.operations[${index}].shortfall`
            );
            shortfall = finiteArithmetic(shortfall + stepShortfall, 'resourceDelta.shortfall');
            if (bounded){
                workingCapacity = Math.max(0, finiteArithmetic(
                    workingCapacity - operation.amount,
                    `resourceDelta.operations[${index}].workingCapacity`,
                    { workingCapacity, amount: operation.amount }
                ));
            }
        }

        const appliedDelta = finiteArithmetic(
            amount - before,
            `resourceDelta.operations[${index}].appliedDelta`
        );
        operationAppliedDelta = finiteArithmetic(
            operationAppliedDelta + appliedDelta,
            'resourceDelta.operationAppliedDelta'
        );
        steps.push(Object.freeze({
            kind: operation.kind,
            requested: operation.amount,
            before,
            after: amount,
            appliedDelta,
            overflow: stepOverflow,
            shortfall: stepShortfall,
            workingCapacityBefore,
            workingCapacityAfter: workingCapacity,
        }));
    }

    const bufferedEndAmount = amount;
    const endAmount = bounded ? Math.min(bufferedEndAmount, capacity.value) : bufferedEndAmount;
    const finalCapacityDiscard = finiteArithmetic(
        bufferedEndAmount - endAmount,
        'resourceDelta.finalCapacityDiscard'
    );
    const netAppliedDelta = finiteArithmetic(endAmount - startAmount, 'resourceDelta.netAppliedDelta');

    return Object.freeze({
        startAmount,
        capacity,
        bufferedEndAmount,
        endAmount,
        requestedDelta,
        operationAppliedDelta,
        netAppliedDelta,
        overflow,
        shortfall,
        finalCapacityDiscard,
        steps: Object.freeze(steps),
    });
}
