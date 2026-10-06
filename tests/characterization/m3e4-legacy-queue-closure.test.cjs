'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const actionsSource = fs.readFileSync(path.join(root, 'src/actions.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const functionsSource = fs.readFileSync(path.join(root, 'src/functions.js'), 'utf8');

function contains(source, pattern, message){
    assert.match(source, pattern, message);
}

test('M3E4 pins representative build queueability and grouped-slot evidence', () => {
    contains(
        actionsSource,
        /dna:\s*\{[\s\S]{0,2200}?queue_complete\(\)\{\s*return\s+0;\s*\}/,
        'evolution.dna must remain explicit nonqueueable evidence through queue_complete() = 0'
    );
    contains(
        actionsSource,
        /sexual_reproduction:\s*\{[\s\S]{0,2200}?queue_complete\(\)\{\s*return\s+global\.tech\[['"]evo['"]\][\s\S]{0,120}?\?\s*1\s*:\s*0;?\s*\}/,
        'sexual_reproduction must remain representative one-unit queueable evidence'
    );
    contains(
        actionsSource,
        /queue_size:\s*10,[\s\S]{0,180}?queue_complete\(\)\{\s*return\s+100\s*-\s*global\.starDock\.seeder\.count;\s*\}/,
        'legacy must retain real queue_size > 1 evidence for unitsPerSlot'
    );
});

test('M3E4 pins build admission quantity accounting separately from WorkQueue capacity', () => {
    contains(
        actionsSource,
        /let\s+buid_max\s*=\s*c_action\[['"]queue_complete['"]\]\s*\?\s*c_action\.queue_complete\(\)\s*:\s*Number\.MAX_SAFE_INTEGER/,
        'build admission must still derive a contextual queueable quantity limit'
    );
    contains(
        actionsSource,
        /if\s*\(global\.queue\.queue\[j\]\.id\s*===\s*c_action\.id\)\s*\{\s*buid_max\s*-=\s*global\.queue\.queue\[j\]\.q;/,
        'already queued matching quantity must still reduce the legacy admission allowance'
    );
    contains(
        actionsSource,
        /if\s*\(used\s*<\s*global\.queue\.max\s*&&\s*buid_max\s*>\s*0\)/,
        'legacy build admission must still combine slot capacity with command-specific quantity allowance'
    );
});

test('M3E4 pins research admission as no_queue plus capacity plus duplicate prevention', () => {
    contains(
        actionsSource,
        /!\(c_action\[['"]no_queue['"]\]\s*&&\s*c_action\[['"]no_queue['"]\]\(\)\)\s*&&\s*global\.tech\[['"]r_queue['"]\]/,
        'research queue admission must retain no_queue gating evidence'
    );
    contains(
        actionsSource,
        /global\.r_queue\.queue\.length\s*<\s*global\.r_queue\.max/,
        'research queue admission must retain explicit capacity evidence'
    );
    contains(
        actionsSource,
        /for\s*\(let\s+tech\s+in\s+global\.r_queue\.queue\)[\s\S]{0,220}?global\.r_queue\.queue\[tech\]\.id\s*===\s*c_action\.id[\s\S]{0,100}?queued\s*=\s*true/,
        'research queue admission must retain duplicate prevention evidence'
    );
});

test('M3E4 pins ordered versus first-ready legacy selection preferences', () => {
    contains(mainSource, /global\.settings\.qAny\b/, 'build qAny selection preference must remain characterized');
    contains(mainSource, /global\.settings\.qAny_res\b/, 'research qAny_res selection preference must remain characterized');
    contains(
        mainSource,
        /if\s*\(!global\.settings\.qAny\)\s*\{\s*stop\s*=\s*true;\s*\}/,
        'ordered build mode must retain first legitimate head-of-line blocking evidence'
    );
    contains(
        mainSource,
        /if\s*\(!global\.settings\.qAny_res\s*&&\s*reqMet\)\s*\{\s*stop\s*=\s*true;\s*\}/,
        'ordered research mode must retain prerequisite-aware head-of-line blocking evidence'
    );
});

test('M3E4 pins successful execution progress without moving it into pure WorkQueue operations', () => {
    contains(
        mainSource,
        /c_action\.action\(\{\s*isQueue:\s*true\s*\}\)\s*!==\s*false[\s\S]{0,420}?global\.queue\.queue\[idx\]\.q--/,
        'successful build execution must retain one-unit q decrement evidence'
    );
    contains(
        mainSource,
        /if\s*\(c_action\.action\(\{\s*isQueue:\s*true\s*\}\)\)[\s\S]{0,420}?global\.r_queue\.queue\.splice\(idx,1\)/,
        'successful research execution must retain whole-entry removal evidence'
    );
});

test('M3E4 pins research reconciliation as separate from readiness selection', () => {
    contains(
        mainSource,
        /if\s*\(global\.r_queue\.queue\.length\s*>\s*global\.r_queue\.max\)\s*\{\s*global\.r_queue\.queue\.splice\(global\.r_queue\.max\);/,
        'research capacity shrink must retain suffix truncation evidence'
    );
    contains(
        mainSource,
        /checkTechRequirements\(['"]club['"],q_techs\);[\s\S]{0,900}?remove\.push\(i\)/,
        'research queue must retain prerequisite-chain reconciliation evidence'
    );
    contains(
        actionsSource,
        /if\s*\(predList\s*&&\s*typeof\s+predList\s*===\s*['"]object['"][\s\S]{0,900}?return\s+isMet\s*\?\s*['"]ok['"]\s*:\s*['"]precog['"]/,
        'queued prerequisite prediction must remain explicit migration evidence'
    );
});

test('M3E4 pins legacy special queue branches as migration debt, not generic queue semantics', () => {
    contains(mainSource, /struct\.action\s*===\s*['"]arpa['"]/, 'ARPA special queue branch must remain characterized');
    contains(mainSource, /arpaTimeCheck\(/, 'ARPA prediction/progress helper must remain characterized');
    contains(mainSource, /struct\.action\s*===\s*['"]tp-ship['"]/, 'Truepath ship synthetic queue branch must remain characterized');
    contains(mainSource, /buildTPShipQueue\(/, 'Truepath ship executor must remain characterized');
    contains(mainSource, /struct\.action\s*===\s*['"]hell-mech['"]/, 'hell-mech synthetic queue branch must remain characterized');
    contains(mainSource, /buildMechQueue\(/, 'hell-mech executor must remain characterized');
    contains(
        mainSource,
        /let\s+deepScan\s*=\s*\[['"]space['"],['"]interstellar['"],['"]galaxy['"],['"]portal['"],['"]tauceti['"],['"]eden['"]\]/,
        'nested legacy action lookup must remain characterized as migration debt'
    );
});

test('M3E4 pins capacity calculation outside the generic queue package', () => {
    contains(functionsSource, /export function calcQueueMax\(\)/, 'build capacity remains a legacy gameplay calculation');
    contains(functionsSource, /export function calcRQueueMax\(\)/, 'research capacity remains a separate legacy gameplay calculation');
});
