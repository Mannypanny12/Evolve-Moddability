'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    architectureTestCoverageViolations,
} = require('./architecture-test-coverage.cjs');

const root = path.resolve(__dirname, '..', '..');

function write(rootPath, relativePath, content){
    const target = path.join(rootPath, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
}

const executableGate = "'use strict';\nfunction main(){}\nif (require.main === module) main();\n";

test('every direct architecture command is independently covered by npm test', () => {
    assert.deepEqual(architectureTestCoverageViolations(root), []);
});

test('architecture coverage audit rejects missing wrappers, duplicates, stale gates, and command bypasses', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'architecture-test-coverage-'));
    try {
        write(temp, 'tests/architecture/alpha.cjs', executableGate);
        write(temp, 'tests/architecture/alpha.test.cjs', "'use strict';\n");
        write(temp, 'tests/architecture/beta.cjs', executableGate);
        write(temp, 'package.json', JSON.stringify({
            scripts: {
                'test:architecture': [
                    'node tests/architecture/alpha.cjs',
                    'node tests/architecture/beta.cjs',
                    'node tests/architecture/alpha.cjs',
                    'node tests/architecture/missing.cjs',
                    'node tests/architecture/bypass.cjs || true',
                ].join(' && '),
            },
        }));

        const violations = architectureTestCoverageViolations(temp).join('\n');
        assert.match(violations, /beta\.cjs: direct architecture gate is missing npm-test wrapper beta\.test\.cjs/);
        assert.match(violations, /alpha\.cjs: architecture gate must appear exactly once/);
        assert.match(violations, /missing\.cjs: architecture gate referenced by package\.json is missing/);
        assert.match(violations, /architecture command must be a direct node invocation/);
    }
    finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
});

test('architecture coverage audit treats every gate-wrapper pair as cumulative unless it is explicitly exempted', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'architecture-test-reverse-coverage-'));
    try {
        write(temp, 'tests/architecture/alpha.cjs', executableGate);
        write(temp, 'tests/architecture/alpha.test.cjs', "'use strict';\n");
        write(temp, 'tests/architecture/omitted.cjs', executableGate);
        write(temp, 'tests/architecture/omitted.test.cjs', "'use strict';\n");
        write(temp, 'tests/architecture/catalog.cjs', "'use strict';\nmodule.exports = { value: 1 };\n");
        write(temp, 'tests/architecture/catalog.test.cjs', "'use strict';\n");
        write(temp, 'tests/architecture/no-wrapper-catalog.cjs', "'use strict';\nmodule.exports = { value: 1 };\n");
        write(temp, 'tests/architecture/architecture-report.cjs', executableGate);
        write(temp, 'tests/architecture/architecture-report.test.cjs', "'use strict';\n");
        write(temp, 'package.json', JSON.stringify({
            scripts: {
                'test:architecture': 'node tests/architecture/alpha.cjs',
            },
        }));

        const violations = architectureTestCoverageViolations(temp).join('\n');
        assert.match(
            violations,
            /omitted\.cjs: architecture gate with npm-test wrapper is missing from scripts\.test:architecture/
        );
        assert.match(
            violations,
            /catalog\.cjs: cumulative architecture gate must use the canonical if \(require\.main === module\) direct-entrypoint convention/
        );
        assert.match(
            violations,
            /catalog\.cjs: architecture gate with npm-test wrapper is missing from scripts\.test:architecture/
        );
        assert.doesNotMatch(violations, /no-wrapper-catalog\.cjs/);
        assert.doesNotMatch(violations, /architecture-report\.cjs/);
    }
    finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
});

test('architecture coverage audit rejects alternate direct-entrypoint spellings instead of silently ignoring them', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'architecture-test-entrypoint-convention-'));
    try {
        write(temp, 'tests/architecture/alpha.cjs', executableGate);
        write(temp, 'tests/architecture/alpha.test.cjs', "'use strict';\n");
        write(
            temp,
            'tests/architecture/noncanonical.cjs',
            "'use strict';\nfunction main(){}\nif (module === require.main) main();\n"
        );
        write(temp, 'tests/architecture/noncanonical.test.cjs', "'use strict';\n");
        write(temp, 'package.json', JSON.stringify({
            scripts: {
                'test:architecture': 'node tests/architecture/alpha.cjs',
            },
        }));

        const violations = architectureTestCoverageViolations(temp).join('\n');
        assert.match(
            violations,
            /noncanonical\.cjs: cumulative architecture gate must use the canonical if \(require\.main === module\) direct-entrypoint convention/
        );
        assert.match(
            violations,
            /noncanonical\.cjs: architecture gate with npm-test wrapper is missing from scripts\.test:architecture/
        );
    }
    finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
});
