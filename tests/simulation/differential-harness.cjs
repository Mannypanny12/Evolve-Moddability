'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const childPath = path.join(__dirname, 'simulation-child.cjs');
const marker = '__EVOLVE_SIM_RESULT__';

function runLegacyScenario({ fixture, periods }){
    const result = spawnSync(process.execPath, [childPath, fixture, String(periods)], {
        cwd: path.resolve(__dirname, '..', '..'),
        env: { ...process.env },
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024
    });

    if (result.error){
        throw result.error;
    }
    if (result.status !== 0){
        throw new Error(
            `legacy simulation failed for ${fixture} / ${periods} periods\n` +
            `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
        );
    }

    const line = result.stdout.split(/\r?\n/)
        .find(entry => entry.startsWith(marker));

    if (!line){
        throw new Error(
            `legacy simulation did not emit a result marker for ${fixture}\n` +
            `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
        );
    }

    return JSON.parse(
        Buffer.from(line.slice(marker.length), 'base64').toString('utf8')
    );
}

function numberEqual(expected, actual, absTolerance, relTolerance){
    if (Object.is(expected, actual)){
        return true;
    }
    if (!Number.isFinite(expected) || !Number.isFinite(actual)){
        return false;
    }
    const delta = Math.abs(expected - actual);
    if (delta <= absTolerance){
        return true;
    }
    const scale = Math.max(Math.abs(expected), Math.abs(actual), 1);
    return delta <= relTolerance * scale;
}

function compareSnapshots(expected, actual, options = {}){
    const absTolerance = options.absTolerance ?? 1e-10;
    const relTolerance = options.relTolerance ?? 1e-10;
    const maxDiffs = options.maxDiffs ?? 100;
    const diffs = [];

    function visit(exp, act, parts){
        if (diffs.length >= maxDiffs){
            return;
        }

        const currentPath = parts.length ? parts.join('.') : '<root>';

        if (typeof exp === 'number' && typeof act === 'number'){
            if (!numberEqual(exp, act, absTolerance, relTolerance)){
                diffs.push({
                    path: currentPath,
                    expected: exp,
                    actual: act,
                    delta: act - exp,
                    reason: 'number'
                });
            }
            return;
        }

        if (Array.isArray(exp) || Array.isArray(act)){
            if (!Array.isArray(exp) || !Array.isArray(act)){
                diffs.push({ path: currentPath, expected: exp, actual: act, reason: 'type' });
                return;
            }
            if (exp.length !== act.length){
                diffs.push({
                    path: currentPath,
                    expected: `length ${exp.length}`,
                    actual: `length ${act.length}`,
                    reason: 'array-length'
                });
            }
            const max = Math.max(exp.length, act.length);
            for (let i = 0; i < max; i++){
                visit(exp[i], act[i], [...parts, String(i)]);
            }
            return;
        }

        const expObject = exp !== null && typeof exp === 'object';
        const actObject = act !== null && typeof act === 'object';

        if (expObject || actObject){
            if (!expObject || !actObject){
                diffs.push({ path: currentPath, expected: exp, actual: act, reason: 'type' });
                return;
            }

            const keys = new Set([...Object.keys(exp), ...Object.keys(act)]);
            for (const key of Array.from(keys).sort()){
                const nextPath = [...parts, key].join('.');
                if (!Object.prototype.hasOwnProperty.call(exp, key)){
                    diffs.push({ path: nextPath, expected: '<missing>', actual: act[key], reason: 'added' });
                    continue;
                }
                if (!Object.prototype.hasOwnProperty.call(act, key)){
                    diffs.push({ path: nextPath, expected: exp[key], actual: '<missing>', reason: 'removed' });
                    continue;
                }
                visit(exp[key], act[key], [...parts, key]);
            }
            return;
        }

        if (!Object.is(exp, act)){
            diffs.push({ path: currentPath, expected: exp, actual: act, reason: 'value' });
        }
    }

    visit(expected, actual, []);
    return diffs;
}

function formatDiffs(diffs){
    if (diffs.length === 0){
        return 'no differences';
    }
    return diffs.map(diff => {
        const delta = Object.prototype.hasOwnProperty.call(diff, 'delta')
            ? ` delta=${diff.delta}`
            : '';
        return `${diff.path}: expected=${JSON.stringify(diff.expected)} actual=${JSON.stringify(diff.actual)}${delta}`;
    }).join('\n');
}

function compareImplementations(referenceRunner, candidateRunner, scenario, options){
    const reference = referenceRunner(scenario);
    const candidate = candidateRunner(scenario);
    const diffs = compareSnapshots(reference.after, candidate.after, options);
    return { scenario: { ...scenario }, reference, candidate, diffs };
}

module.exports = {
    runLegacyScenario,
    compareSnapshots,
    compareImplementations,
    formatDiffs
};
