'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const generatedDir = path.join(__dirname, 'generated');
const shimPath = path.join(__dirname, 'legacy', 'browser-shim.cjs');
const legacyEntry = path.join(__dirname, 'legacy', 'legacy-api.js');
const legacyBundle = path.join(generatedDir, 'legacy-api.cjs');

function collectTests(dir){
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()){
            if (entry.name !== 'generated'){
                files.push(...collectTests(full));
            }
        }
        else if (entry.name.endsWith('.test.cjs')){
            files.push(full);
        }
    }
    return files.sort();
}

function buildLegacyBundle(){
    fs.rmSync(generatedDir, { recursive: true, force: true });
    fs.mkdirSync(generatedDir, { recursive: true });

    esbuild.buildSync({
        entryPoints: [legacyEntry],
        outfile: legacyBundle,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node20',
        sourcemap: 'inline',
        logLevel: 'warning',
        banner: {
            js: `require(${JSON.stringify(shimPath)});`
        }
    });
}

function main(){
    const suite = process.argv[2] || 'all';
    const testRoot = suite === 'characterization'
        ? path.join(__dirname, 'characterization')
        : __dirname;

    buildLegacyBundle();

    const tests = collectTests(testRoot);
    if (tests.length === 0){
        throw new Error(`No tests found for suite: ${suite}`);
    }

    const result = spawnSync(process.execPath, ['--test', ...tests], {
        cwd: root,
        env: {
            ...process.env,
            EVOLVE_LEGACY_TEST_BUNDLE: legacyBundle
        },
        stdio: 'inherit'
    });

    fs.rmSync(generatedDir, { recursive: true, force: true });

    if (result.error){
        throw result.error;
    }
    process.exitCode = result.status ?? 1;
}

try {
    main();
}
catch (error){
    fs.rmSync(generatedDir, { recursive: true, force: true });
    console.error(error);
    process.exitCode = 1;
}
