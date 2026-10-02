'use strict';

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..', '..');
const generatedDir = path.join(root, 'tests', 'generated');
const shimPath = path.join(root, 'tests', 'legacy', 'browser-shim.cjs');
const legacyEntry = path.join(root, 'tests', 'legacy', 'legacy-api.js');
const legacyBundle = path.join(generatedDir, 'legacy-api.cjs');
const manifestPath = path.join(__dirname, 'oracle-baselines.json');

const { oracleScenarios } = require('./oracle-scenarios.cjs');
const {
    snapshotRoot,
    serializeSnapshot,
    fingerprintSnapshot,
    resolveSnapshotPath,
    loadSnapshot,
    exactSnapshotDiff,
    formatFrozenDiffs
} = require('./oracle-goldens.cjs');

function buildLegacyBundle(){
    fs.rmSync(generatedDir, { recursive: true, force: true });
    fs.mkdirSync(generatedDir, { recursive: true });

    esbuild.buildSync({
        entryPoints: [legacyEntry],
        outfile: legacyBundle,
        bundle: true,
        platform: 'browser',
        format: 'iife',
        target: ['es2020'],
        sourcemap: 'inline',
        logLevel: 'warning',
        banner: {
            js: 'require(' + JSON.stringify(shimPath) + ');'
        }
    });

    process.env.EVOLVE_LEGACY_TEST_BUNDLE = legacyBundle;
}

function selectedScenarios(args){
    if (args.includes('--all')){
        return oracleScenarios;
    }

    const requested = args.filter(arg => !arg.startsWith('--'));
    if (requested.length === 0){
        throw new Error('Choose an oracle scenario key, or pass --all');
    }

    return requested.map(key => {
        const scenario = oracleScenarios.find(item => item.key === key);
        if (!scenario){
            throw new Error('Unknown oracle scenario: ' + key);
        }
        return scenario;
    });
}

function validateManifestEntry(manifest, scenario){
    const entry = manifest.scenarios[scenario.key];
    if (!entry){
        throw new Error('Missing manifest entry for ' + scenario.key);
    }
    if (entry.fixture !== scenario.fixture || entry.periods !== scenario.periods){
        throw new Error('Manifest scenario metadata mismatch for ' + scenario.key);
    }
    return entry;
}

function runRepeatableScenario(runLegacyScenario, scenario){
    const first = runLegacyScenario(scenario);
    const second = runLegacyScenario(scenario);
    const firstHash = fingerprintSnapshot(first.after);
    const secondHash = fingerprintSnapshot(second.after);

    if (firstHash !== secondHash){
        const differences = exactSnapshotDiff(first.after, second.after);
        throw new Error(
            scenario.key + ': independent simulation runs disagree; ' +
            'first SHA-256=' + firstHash + ' second SHA-256=' + secondHash + '\n' +
            formatFrozenDiffs(differences)
        );
    }

    return {
        after: first.after,
        sha256: firstHash
    };
}

function main(){
    const args = process.argv.slice(2);
    const accept = args.includes('--accept');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const nextManifest = structuredClone(manifest);
    const scenarios = selectedScenarios(args);

    if (manifest.schema !== 2){
        throw new Error('Unsupported oracle manifest schema: ' + manifest.schema);
    }

    buildLegacyBundle();
    const { runLegacyScenario } = require('./differential-harness.cjs');

    const pending = [];

    for (const scenario of scenarios){
        const entry = validateManifestEntry(manifest, scenario);
        const result = runRepeatableScenario(runLegacyScenario, scenario);
        const destination = resolveSnapshotPath(entry);
        const previous = fs.existsSync(destination)
            ? loadSnapshot(entry)
            : null;

        if (result.sha256 !== entry.sha256 && !accept){
            const differences = previous === null
                ? null
                : exactSnapshotDiff(previous, result.after);
            const detail = differences === null
                ? 'No committed snapshot exists to produce a structural diff.'
                : formatFrozenDiffs(differences);

            throw new Error(
                scenario.key + ': current simulation SHA-256 ' + result.sha256 +
                ' does not match frozen ' + entry.sha256 + '.\n' +
                detail + '\n' +
                'Use --accept only after reviewing and intentionally approving the behavior change.'
            );
        }

        const differences = accept && previous !== null
            ? exactSnapshotDiff(previous, result.after)
            : null;

        pending.push({
            scenario,
            destination,
            content: serializeSnapshot(result.after),
            sha256: result.sha256,
            differences
        });
    }

    // Nothing is written until every selected scenario has completed and passed
    // determinism/manifest validation.
    for (const item of pending){
        if (item.differences && item.differences.diffs.length > 0){
            process.stdout.write(
                '\n' + item.scenario.key + ' intentional golden change:\n' +
                formatFrozenDiffs(item.differences) + '\n'
            );
        }
    }

    fs.mkdirSync(snapshotRoot, { recursive: true });

    for (const item of pending){
        fs.writeFileSync(item.destination, item.content, 'utf8');
        if (accept){
            nextManifest.scenarios[item.scenario.key].sha256 = item.sha256;
        }
        process.stdout.write(
            item.scenario.key + ': wrote ' + path.relative(root, item.destination) +
            ' (' + item.sha256 + ')\n'
        );
    }

    if (accept){
        fs.writeFileSync(
            manifestPath,
            JSON.stringify(nextManifest, null, 2) + '\n',
            'utf8'
        );
        process.stdout.write(
            'Updated oracle manifest fingerprints because --accept was supplied.\n'
        );
    }
}

try {
    main();
}
finally {
    fs.rmSync(generatedDir, { recursive: true, force: true });
}
