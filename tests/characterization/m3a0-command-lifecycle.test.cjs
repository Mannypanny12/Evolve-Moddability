'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const actionsSource = fs.readFileSync(path.join(root, 'src/actions.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');

function contains(source, pattern, message){
    assert.match(source, pattern, message);
}

test('immediate execution overloads action return values with queue fallback control', () => {
    contains(
        actionsSource,
        /res\s*!==\s*0\s*&&\s*global\.tech\[['"]queue['"]\]/,
        'default runAction path must keep the legacy res !== 0 queue-suppression distinction characterized'
    );
    contains(
        actionsSource,
        /c_action\.action\(\{\s*isQueue:\s*false\s*\}\)/,
        'immediate action callbacks must continue to receive isQueue:false in the legacy path'
    );
});

test('queued execution uses a different return-value test than immediate queue fallback', () => {
    contains(
        mainSource,
        /c_action\.action\(\{\s*isQueue:\s*true\s*\}\)\s*!==\s*false/,
        'build queue execution must retain the legacy !== false success test as characterization evidence'
    );
    contains(
        mainSource,
        /if\s*\(c_action\.action\(\{\s*isQueue:\s*true\s*\}\)\)/,
        'research queue execution must retain its truthy success test as characterization evidence'
    );
});

test('legacy queue records still embed action lookup and presentation fields', () => {
    contains(
        actionsSource,
        /global\.queue\.queue\.push\(\{[^}]*id:\s*c_action\.id[^}]*action:\s*action[^}]*type:\s*type[^}]*label:/s,
        'build queue record shape must remain visible to M3E design work'
    );
    contains(
        actionsSource,
        /global\.r_queue\.queue\.push\(\{[^}]*id:\s*c_action\.id[^}]*action:\s*action[^}]*type:\s*type[^}]*label:/s,
        'research queue record shape must remain visible to M3E design work'
    );
});

test('queue behavior still reads application preferences directly in legacy code', () => {
    contains(actionsSource, /global\.settings\.q_merge\b/, 'q_merge legacy dependency must remain characterized');
    contains(mainSource, /global\.settings\.qAny\b/, 'qAny legacy dependency must remain characterized');
    contains(mainSource, /global\.settings\.qAny_res\b/, 'qAny_res legacy dependency must remain characterized');
});

test('postBuild still mixes progression mutation, runtime callbacks, and UI reactions', () => {
    contains(
        actionsSource,
        /export function postBuild[\s\S]*c_action\[['"]grant['"]\][\s\S]*global\.tech/s,
        'postBuild technology grant mutation must remain characterized'
    );
    contains(
        actionsSource,
        /export function postBuild[\s\S]*callback_queue\.set\(\[c_action,\s*['"]post['"]\]/s,
        'postBuild executable callback scheduling must remain characterized'
    );
    contains(
        actionsSource,
        /export function postBuild[\s\S]*(drawEvolution|drawCity)\(/s,
        'postBuild UI redraw coupling must remain characterized'
    );
});

test('legacy effect metadata is consumed by presentation code rather than defining mutation semantics', () => {
    contains(
        actionsSource,
        /if\s*\(c_action\.effect\)[\s\S]*desc\s*=\s*desc\s*\+\s*effect/s,
        'legacy effect field must remain characterized as action-description presentation input'
    );
});
