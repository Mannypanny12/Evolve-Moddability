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
        // Legacy resetResBuffer() adds the starting amount only when max > 0.
        // A real zero bound therefore keeps a zero temporary ceiling.
        workingCapacity = capacity.value > 0
            ? finiteArithmetic(
                capacity.value + startAmount,
                'resourceDelta.workingCapacity',
                { capacity: capacity.value, startAmount }
            )
            : 0;
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
        const requestedSigned = signedRequestedDelta(operation.kind, operation.amount);
        requestedDelta = finiteArithmetic(
            requestedDelta + requestedSigned,
            `resourceDelta.operations[${index}].requestedDelta`,
            { requestedDelta, amount: operation.amount, kind: operation.kind }
        );

        const tentative = finiteArithmetic(
            before + requestedSigned,
            `resourceDelta.operations[${index}].${operation.kind}`,
            { before, amount: operation.amount }
        );
        const clippedByUpperBound = bounded && tentative > workingCapacity;
        const clippedByZeroFloor = tentative < 0;

        // Legacy modRes() applies the temporary upper bound before its zero floor for
        // every delta, not only for positive deltas. The distinction is observable
        // when a bounded-zero resource starts with a pre-existing positive amount.
        if (clippedByUpperBound){
            amount = workingCapacity;
        }
        else if (clippedByZeroFloor){
            amount = 0;
        }
        else {
            amount = tentative;
        }

        let stepOverflow = 0;
        let stepShortfall = 0;
        if (operation.kind === 'credit'){
            stepOverflow = clippedByUpperBound
                ? finiteArithmetic(
                    tentative - workingCapacityBefore,
                    `resourceDelta.operations[${index}].overflow`
                )
                : 0;
            overflow = finiteArithmetic(overflow + stepOverflow, 'resourceDelta.overflow');
        }
        else {
            stepShortfall = clippedByZeroFloor
                ? finiteArithmetic(-tentative, `resourceDelta.operations[${index}].shortfall`)
                : 0;
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
