from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}: {old[:80]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


def replace_between(path, start, end, replacement):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    start_index = text.find(start)
    if start_index < 0:
        raise SystemExit(f'{path}: start marker not found: {start!r}')
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise SystemExit(f'{path}: end marker not found: {end!r}')
    p.write_text(text[:start_index] + replacement + text[end_index:], encoding='utf-8')


# vars.js: legacy migrations finish first; only then hydrate GameState. setGlobal()
# becomes the live rebind seam used by the fixture harness and any future root swap.
replace_once(
    'src/vars.js',
    'export var save = window.localStorage;\n',
    "import { bindLegacyAchievementState } from './legacy/bridge/achievement-state-adapter.mjs';\n\nexport var save = window.localStorage;\n",
)
replace_once(
    'src/vars.js',
    "export function setGlobal(gameState) {\n    global = gameState;\n}\n",
    "export function setGlobal(gameState) {\n    global = gameState;\n    bindLegacyAchievementState(global);\n}\n",
)
replace_once(
    'src/vars.js',
    'setupStats();\n\nif (!global.race[\'seeded\']){',
    "setupStats();\n\n// M2D3 authority cutover: historical vars.js migrations and shape repair above\n// remain legacy-owned. Hydration starts only after that compatibility work.\nbindLegacyAchievementState(global);\n\nif (!global.race['seeded']){",
)


# achieve.js: preserve legacy control flow and UI/return semantics, but hand all
# persistent achievement mutations to the bridge backed by GameState.
replace_once(
    'src/achieve.js',
    "import { loc } from './locale.js'\n",
    "import { loc } from './locale.js'\nimport { advanceLegacyAchievement, removeLegacyAchievementUniverseRank } from './legacy/bridge/achievement-state-adapter.mjs';\n",
)

new_unlock = '''export function unlockAchieve(achievement,small,rank,universe){
    if (global.race.universe !== 'micro' && small === true){
        return false;
    }
    if (!global.settings.msgFilters.achievements.unlocked){
        global.settings.msgFilters.achievements.unlocked = true;
        global.settings.msgFilters.achievements.vis = true;
    }
    let a_level = alevel();
    let unlock = false;
    let redraw = false;
    if (typeof rank === "undefined" || rank > a_level){
        rank = a_level;
    }

    const advanceBase = (global.race.universe === 'micro' && small === true)
        || (global.race.universe !== 'micro' && small !== true);
    const targetAffix = universe === 'l' ? null : (universe || universeAffix());
    const mutation = advanceLegacyAchievement({
        achievement,
        rank,
        advanceBase,
        universeAffix: targetAffix,
    });

    if (mutation.baseRankChanged){
        global.settings.showAchieve = true;
        messageQueue(loc(mutation.recordExisted ? 'achieve_unlock_achieve_upgrade' : 'achieve_unlock_achieve', [achievements[achievement].name] ),'special',false,['achievements']);
        redraw = true;
        unlock = true;
    }
    if (mutation.legacyUniverseWrite){
        redraw = true;
        if (!unlock){
            messageQueue(loc(mutation.legacyUniverseUpgrade ? 'achieve_unlock_achieve_icon_upgrade' : 'achieve_unlock_achieve_icon', [achievements[achievement].name] ),'special',false,['achievements']);
        }
    }
    if (redraw){
        calc_mastery(true);
        drawPerks();
        drawAchieve();
    }
    return unlock;
}

'''
replace_between(
    'src/achieve.js',
    'export function unlockAchieve(achievement,small,rank,universe){',
    'export function unlockFeat(feat,small,rank){',
    new_unlock,
)

old_aggregate_clear = '''            if (global.race.universe !== 'standard'){
                switch (global.race.universe) {
                    case 'evil':
                        global.stats.achieve[name].e = undefined;
                        break;
                    case 'antimatter':
                        global.stats.achieve[name].a = undefined;
                        break;
                    case 'heavy':
                        global.stats.achieve[name].h = undefined;
                        break;
                    case 'micro':
                        global.stats.achieve[name].m = undefined;
                        break;
                    case 'magic':
                        global.stats.achieve[name].mg = undefined;
                        break;
                    default:
                        break;
                }
            }
'''
new_aggregate_clear = '''            if (global.race.universe !== 'standard'){
                const affix = universeAffix();
                if (affix !== 'l'){
                    removeLegacyAchievementUniverseRank(name, affix, { preserveUndefined: true });
                }
            }
'''
replace_once('src/achieve.js', old_aggregate_clear, new_aggregate_clear)


# Test harness: expose the authoritative snapshot and an explicit rebind helper
# so characterization setup can seed pre-cutover legacy state without teaching
# production code to trust mirror drift.
replace_once(
    'tests/legacy/legacy-api.js',
    "import '../../src/locale.js';\n",
    "import '../../src/locale.js';\nimport { achievementStateSnapshot } from '../../src/legacy/bridge/achievement-state-adapter.mjs';\n",
)
replace_once(
    'tests/legacy/legacy-api.js',
    '''function achievementRankCap(){
    return alevel();
}

''',
    '''function achievementRankCap(){
    return alevel();
}

function authoritativeAchievementState(){
    return achievementStateSnapshot();
}

function rebindAchievementState(){
    setGlobal(global);
    return global;
}

''',
)
replace_once(
    'tests/legacy/legacy-api.js',
    '''    achievementUniverseAffix,
    achievementRankCap,
    hydrateSimulationState,
''',
    '''    achievementUniverseAffix,
    achievementRankCap,
    authoritativeAchievementState,
    rebindAchievementState,
    hydrateSimulationState,
''',
)


# Existing M2D1 characterization setup wrote directly into the mirror. Rebind
# only in the few tests that need those seeded values to become authoritative.
replace_once(
    'tests/characterization/m2d-achievement-state.test.cjs',
    '''    ids.forEach(id => {
        state.stats.achieve[id] = { l: 1 };
        if (universeAffix){
            state.stats.achieve[id][universeAffix] = 1;
        }
    });
    return ids;
''',
    '''    ids.forEach(id => {
        state.stats.achieve[id] = { l: 1 };
        if (universeAffix){
            state.stats.achieve[id][universeAffix] = 1;
        }
    });
    legacy.rebindAchievementState();
    return ids;
''',
)
replace_once(
    'tests/characterization/m2d-achievement-state.test.cjs',
    '''    state.stats.achieve.trade = { l: 3, e: 1 };

    assert.equal(legacy.achievementRankCap(), 2);
''',
    '''    state.stats.achieve.trade = { l: 3, e: 1 };
    legacy.rebindAchievementState();

    assert.equal(legacy.achievementRankCap(), 2);
''',
)

# Authority-focused characterization coverage.
insert_marker = "test('historical vars.js achievement migrations remain ahead of the future GameState hydration seam', () => {"
new_tests = r'''test('M2D3 hydrates the complete legacy ledger into canonical authoritative GameState', () => {
    const state = freshState('evil');
    state.stats.achieve.trade = { l: 3, e: 2, h: 0, mg: undefined };
    state.stats.achieve.legacy_unknown_achievement = { l: 1, a: 0 };
    legacy.installLegacyState(state);

    assert.deepEqual(legacy.authoritativeAchievementState(), {
        schemaVersion: 2,
        achievements: {
            'evolve:achievement/legacy_unknown_achievement': {
                rank: 1,
                universeRanks: { antimatter: 0 }
            },
            'evolve:achievement/trade': {
                rank: 3,
                universeRanks: { evil: 2, heavy: 0 }
            }
        }
    });
    assert.deepEqual(legacy.legacyState().stats.achieve.trade, { l: 3, e: 2, h: 0 });
});

test('M2D3 treats legacy mirror drift as non-authoritative and repairs it on the next mutation', () => {
    const state = install('evil');
    state.race.no_plasmid = 1;

    assert.equal(legacy.unlockAchievement('trade', false, 2), true);
    assert.deepEqual(state.stats.achieve.trade, { l: 2, e: 2 });

    state.stats.achieve.trade.l = 99;
    state.stats.achieve.trade.e = 99;

    assert.equal(legacy.unlockAchievement('trade', false, 1), false);
    assert.deepEqual(state.stats.achieve.trade, { l: 2, e: 2 });
    assert.deepEqual(
        legacy.authoritativeAchievementState().achievements['evolve:achievement/trade'],
        { rank: 2, universeRanks: { evil: 2 } }
    );
});

test('M2D3 setGlobal rebinding hydrates the newly installed legacy root rather than retaining stale runtime state', () => {
    const first = freshState('standard');
    first.stats.achieve.trade = { l: 2 };
    legacy.installLegacyState(first);
    assert.equal(
        legacy.authoritativeAchievementState().achievements['evolve:achievement/trade'].rank,
        2
    );

    const second = freshState('heavy');
    second.stats.achieve.explorer = { l: 4, h: 3 };
    legacy.installLegacyState(second);
    const snapshot = legacy.authoritativeAchievementState();
    assert.equal(Object.prototype.hasOwnProperty.call(snapshot.achievements, 'evolve:achievement/trade'), false);
    assert.deepEqual(snapshot.achievements['evolve:achievement/explorer'], {
        rank: 4,
        universeRanks: { heavy: 3 }
    });
});

test('M2D3 aggregate clear keeps undefined only in the compatibility mirror, never in authoritative GameState', () => {
    const state = install('evil');
    seedAggregateChildren(state, 'extinct_', 25);

    legacy.checkAchievementProgress();

    assert.equal(Object.prototype.hasOwnProperty.call(state.stats.achieve.mass_extinction, 'e'), true);
    assert.equal(state.stats.achieve.mass_extinction.e, undefined);
    assert.deepEqual(
        legacy.authoritativeAchievementState().achievements['evolve:achievement/mass_extinction'],
        { rank: 1, universeRanks: {} }
    );
    const serialized = JSON.parse(JSON.stringify(state.stats.achieve));
    assert.deepEqual(serialized.mass_extinction, { l: 1 });
});

'''
replace_once(
    'tests/characterization/m2d-achievement-state.test.cjs',
    insert_marker,
    new_tests + insert_marker,
)

replace_once(
    'tests/characterization/m2d-achievement-state.test.cjs',
    "test('M2D1 source inventory confines direct achievement writes to migration and achievement modules', () => {",
    "test('M2D3 authority ratchet leaves historical migrations as the only direct global achievement writer', () => {",
)
replace_once(
    'tests/characterization/m2d-achievement-state.test.cjs',
    '''    assert.deepEqual(writerFiles, ['src/achieve.js', 'src/vars.js']);
    assert.ok(inventory['src/achieve.js'].writes >= 3, 'expected unlock plus aggregate achievement writes');
    assert.ok(inventory['src/vars.js'].writes >= 5, 'expected historical migration writes');
''',
    '''    assert.deepEqual(writerFiles, ['src/vars.js']);
    assert.ok(inventory['src/achieve.js'] && inventory['src/achieve.js'].reads > 0, 'expected legacy compatibility readers to remain until M2D4');
    assert.equal(inventory['src/achieve.js'].writes, 0, 'ordinary achievement progression must mutate through the M2D3 adapter');
    assert.ok(inventory['src/vars.js'].writes >= 5, 'expected historical migration writes to remain ahead of hydration');
''',
)

print('M2D3 source cutover patch applied successfully.')
