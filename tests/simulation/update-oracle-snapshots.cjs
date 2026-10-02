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

function main(){
    const args = process.argv.slice(2);
    const accept = args.includes('--accept');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const scenarios = selectedScenarios(args);

    if (manifest.schema !== 2){
        throw new Error('Unsupported oracle manifest schema: ' + manifest.schema);
    }

    buildLegacyBundle();
    const { runLegacyScenario } = require('./differential-harness.cjs');
    fs.mkdirSync(snapshotRoot, { recursive: true });

    for (const scenario of scenarios){
        const entry = manifest.scenarios[scenario.key];
        if (!entry){
            throw new Error('Missing manifest entry for ' + scenario.key);
        }
        if (entry.fixture !== scenario.fixture || entry.periods !== scenario.periods){
            throw new Error('Manifest scenario metadata mismatch for ' + scenario.key);
        }

        const run = runLegacyScenario(scenario);
        const actualHash = fingerprintSnapshot(run.after);
        const destination = resolveSnapshotPath(entry);

        if (actualHash !== entry.sha256 && !accept){
            throw new Error(
                scenario.key + ': current simulation SHA-256 ' + actualHash +
                ' does not match frozen ' + entry.sha256 + '. ' +
                'Use --accept only after reviewing and intentionally approving the behavior change.'
            );
        }

        if (accept && fs.existsSync(destination)){
            const previous = loadSnapshot(entry);
            const differences = exactSnapshotDiff(previous, run.after);
            if (differences.diffs.length > 0){
                process.stdout.write(
                    '\n' + scenario.key + ' intentional golden change:\n' +
                    formatFrozenDiffs(differences) + '\n'
                );
            }
        }

        fs.writeFileSync(destination, serializeSnapshot(run.after), 'utf8');
        if (accept){
            entry.sha256 = actualHash;
        }
        process.stdout.write(
            scenario.key + ': wrote ' + path.relative(root, destination) +
            ' (' + actualHash + ')\n'
        );
    }

    if (accept){
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
        process.stdout.write('Updated oracle manifest fingerprints because --accept was supplied.\n');
    }
}

try {
    main();
}
finally {
    fs.rmSync(generatedDir, { recursive: true, force: true });
}
