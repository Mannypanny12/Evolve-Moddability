'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { maskNonCode } = require('../architecture/architecture-fitness.cjs');
const {
    loadFixtureById,
    materializePersistedFixture
} = require('../fixtures/fixture-loader.cjs');

require(process.env.EVOLVE_LEGACY_TEST_BUNDLE);
const legacy = globalThis.__EVOLVE_LEGACY_TEST_API__;

if (!legacy){
    throw new Error('Legacy test API did not initialize');
}

const repoRoot = path.resolve(__dirname, '..', '..');
const fixture = loadFixtureById('early-civilization-human');

function freshState(universe = 'standard'){
    const state = materializePersistedFixture(fixture, legacy);
    state.race.universe = universe;
    state.stats.achieve = {};
    state.stats.feat = {};

    // Keep the real initialized settings object but make the achievement-message
    // state deterministic for unlockAchieve().
    state.settings.msgFilters.achievements.unlocked = false;
    state.settings.msgFilters.achievements.vis = false;
    state.settings.showAchieve = false;

    for (const flag of [
        'no_plasmid',
        'no_trade',
        'no_craft',
        'no_crispr',
        'weak_mastery',
        'nerfed',
        'badgenes'
    ]){
        delete state.race[flag];
    }

    return state;
}

function install(universe = 'standard'){
    legacy.installLegacyState(freshState(universe));
    return legacy.legacyState();
}

function seedAggregateChildren(state, prefix, count, universeAffix){
    const ids = legacy.achievementIds()
        .filter(id => id.startsWith(prefix))
        .slice(0, count);
    assert.equal(ids.length, count, `expected at least ${count} known ${prefix} achievements`);
    ids.forEach(id => {
        state.stats.achieve[id] = { l: 1 };
        if (universeAffix){
            state.stats.achieve[id][universeAffix] = 1;
        }
    });
    return ids;
}

function listSourceFiles(directory){
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })){
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()){
            files.push(...listSourceFiles(target));
        }
        else if (entry.isFile() && /\.(?:cjs|js|mjs)$/.test(entry.name)){
            files.push(target);
        }
    }
    return files.sort();
}

function skipWhitespace(source, index){
    while (index < source.length && /\s/.test(source[index])) index++;
    return index;
}

function readIdentifier(source, index){
    const match = source.slice(index).match(/^[$A-Z_a-z][$\w]*/);
    return match ? { value: match[0], end: index + match[0].length } : null;
}

function readQuotedString(source, index){
    const quote = source[index];
    if (quote !== "'" && quote !== '"') return null;
    let cursor = index + 1;
    let value = '';
    while (cursor < source.length){
        const ch = source[cursor];
        if (ch === '\\'){
            if (cursor + 1 >= source.length) return null;
            value += source[cursor + 1];
            cursor += 2;
            continue;
        }
        if (ch === quote){
            return { value, end: cursor + 1 };
        }
        value += ch;
        cursor++;
    }
    return null;
}

function readProperty(source, masked, index){
    let cursor = skipWhitespace(masked, index);
    if (masked[cursor] === '.'){
        cursor = skipWhitespace(masked, cursor + 1);
        const identifier = readIdentifier(masked, cursor);
        return identifier
            ? { dynamic: false, value: identifier.value, end: identifier.end }
            : null;
    }
    if (masked[cursor] !== '[') return null;

    const valueStart = skipWhitespace(source, cursor + 1);
    const stringValue = readQuotedString(source, valueStart);
    if (stringValue){
        const closing = skipWhitespace(source, stringValue.end);
        if (source[closing] === ']'){
            return { dynamic: false, value: stringValue.value, end: closing + 1 };
        }
    }

    let depth = 1;
    for (let i = cursor + 1; i < masked.length; i++){
        if (masked[i] === '[') depth++;
        else if (masked[i] === ']'){
            depth--;
            if (depth === 0){
                return { dynamic: true, value: '$dynamic', end: i + 1 };
            }
        }
    }
    return null;
}

function isAssignmentAt(masked, index){
    const tail = masked.slice(index);
    return /^(?:\+\+|--|\*\*=|&&=|\|\|=|\?\?=|<<=|>>>=|>>=|[+\-*/%&|^]=|=(?!=|>))/.test(tail);
}

function analyzeAchievementAccesses(source){
    const masked = maskNonCode(source);
    const accesses = [];
    const globalPattern = /\bglobal\b/g;
    let match;

    while ((match = globalPattern.exec(masked)) !== null){
        const statsProperty = readProperty(source, masked, match.index + match[0].length);
        if (!statsProperty || statsProperty.dynamic || statsProperty.value !== 'stats') continue;

        const achievementProperty = readProperty(source, masked, statsProperty.end);
        if (!achievementProperty || achievementProperty.dynamic || achievementProperty.value !== 'achieve') continue;

        let cursor = achievementProperty.end;
        let property;
        while ((property = readProperty(source, masked, cursor)) !== null){
            cursor = property.end;
        }
        cursor = skipWhitespace(masked, cursor);

        const prefix = masked.slice(Math.max(0, match.index - 24), match.index);
        const write = /\bdelete\s*$/.test(prefix) || isAssignmentAt(masked, cursor);
        accesses.push({ write });
    }

    return accesses;
}

function achievementAccessInventory(){
    const inventory = {};
    const sourceRoot = path.join(repoRoot, 'src');
    for (const file of listSourceFiles(sourceRoot)){
        const accesses = analyzeAchievementAccesses(fs.readFileSync(file, 'utf8'));
        if (accesses.length === 0) continue;
        const relative = path.relative(repoRoot, file).split(path.sep).join('/');
        inventory[relative] = {
            reads: accesses.filter(access => !access.write).length,
            writes: accesses.filter(access => access.write).length
        };
    }
    return inventory;
}

test('legacy universe affixes are a closed compact representation with standard as l', () => {
    assert.equal(legacy.achievementUniverseAffix('standard'), 'l');
    assert.equal(legacy.achievementUniverseAffix('evil'), 'e');
    assert.equal(legacy.achievementUniverseAffix('antimatter'), 'a');
    assert.equal(legacy.achievementUniverseAffix('heavy'), 'h');
    assert.equal(legacy.achievementUniverseAffix('micro'), 'm');
    assert.equal(legacy.achievementUniverseAffix('magic'), 'mg');

    // Unknown/future universe names currently fall through to the standard/base
    // affix rather than creating another stored achievement key.
    assert.equal(legacy.achievementUniverseAffix('bigbang'), 'l');
});

test('achievement rank cap starts at one, rises with challenge flags, and clamps at five', () => {
    const state = install();

    assert.equal(legacy.achievementRankCap(), 1);

    state.race.no_plasmid = 1;
    assert.equal(legacy.achievementRankCap(), 2);

    state.race.no_trade = 1;
    state.race.no_craft = 1;
    assert.equal(legacy.achievementRankCap(), 4);

    state.race.no_crispr = 1;
    assert.equal(legacy.achievementRankCap(), 5);

    state.race.weak_mastery = 1;
    state.race.nerfed = 1;
    state.race.badgenes = 1;
    assert.equal(legacy.achievementRankCap(), 5);
});

test('derived achievement levels clamp each stored rank to five without mutating legacy state', () => {
    const state = install('evil');
    state.stats.achieve.trade = { l: 7, e: 8 };
    state.stats.achieve.explorer = { l: 3, e: 2 };

    assert.deepEqual(legacy.achievementUniverseLevel('standard'), {
        aLvl: 8,
        uLvl: 8
    });
    assert.deepEqual(legacy.achievementUniverseLevel('evil'), {
        aLvl: 8,
        uLvl: 7
    });

    assert.deepEqual(state.stats.achieve, {
        trade: { l: 7, e: 8 },
        explorer: { l: 3, e: 2 }
    });
});

test('derived levels use the known achievement catalog and ignore unknown ledger keys', () => {
    const state = install('evil');
    state.stats.achieve.trade = { l: 2, e: 1 };
    state.stats.achieve.legacy_unknown_achievement = { l: 5, e: 5 };

    assert.equal(legacy.achievementIds().includes('legacy_unknown_achievement'), false);
    assert.deepEqual(legacy.achievementUniverseLevel(), {
        aLvl: 2,
        uLvl: 1
    });
});

test('missing and explicitly undefined universe ranks are equivalent to zero for derived level', () => {
    const state = install('evil');
    state.stats.achieve.trade = { l: 2, e: undefined };
    state.stats.achieve.explorer = { l: 1 };

    assert.deepEqual(legacy.achievementUniverseLevel('evil'), {
        aLvl: 3,
        uLvl: 0
    });
});

test('standard unlock creates a base rank and uses the current achievement rank cap by default', () => {
    const state = install('standard');
    state.race.no_plasmid = 1;
    state.race.no_trade = 1;

    assert.equal(legacy.achievementRankCap(), 3);
    assert.equal(legacy.unlockAchievement('trade'), true);
    assert.deepEqual(state.stats.achieve.trade, { l: 3 });
});

test('non-micro unlock writes both base and current-universe progress', () => {
    const state = install('evil');
    state.race.no_plasmid = 1;

    assert.equal(legacy.unlockAchievement('trade', false, 2), true);
    assert.deepEqual(state.stats.achieve.trade, { l: 2, e: 2 });
});

test('achievement ranks are monotonic and an attempted lower rank does not downgrade either track', () => {
    const state = install('heavy');
    state.race.no_plasmid = 1;
    state.race.no_trade = 1;
    state.race.no_craft = 1;

    assert.equal(legacy.unlockAchievement('explorer', false, 4), true);
    assert.deepEqual(state.stats.achieve.explorer, { l: 4, h: 4 });

    assert.equal(legacy.unlockAchievement('explorer', false, 2), false);
    assert.deepEqual(state.stats.achieve.explorer, { l: 4, h: 4 });
});

test('requested rank above the active challenge cap is clamped before base and universe writes', () => {
    const state = install('antimatter');
    state.race.no_plasmid = 1;

    assert.equal(legacy.achievementRankCap(), 2);
    assert.equal(legacy.unlockAchievement('mass_extinction', false, 5), true);
    assert.deepEqual(state.stats.achieve.mass_extinction, { l: 2, a: 2 });
});

test('explicit l target suppresses a non-standard universe-specific write', () => {
    const state = install('evil');
    state.race.no_plasmid = 1;

    assert.equal(legacy.unlockAchievement('trade', false, 2, 'l'), true);
    assert.deepEqual(state.stats.achieve.trade, { l: 2 });
});

test('explicit universe affix can target a universe other than the current run', () => {
    const state = install('evil');
    state.race.no_plasmid = 1;

    assert.equal(legacy.unlockAchievement('trade', false, 2, 'h'), true);
    assert.deepEqual(state.stats.achieve.trade, { l: 2, h: 2 });
});

test('micro normal unlock records only micro progress and returns false despite changing state', () => {
    const state = install('micro');
    state.race.no_plasmid = 1;

    assert.equal(legacy.unlockAchievement('trade', false, 2), false);
    assert.deepEqual(state.stats.achieve.trade, { l: 0, m: 2 });
});

test('micro small unlock records both base and micro progress', () => {
    const state = install('micro');
    state.race.no_plasmid = 1;

    assert.equal(legacy.unlockAchievement('trade', true, 2), true);
    assert.deepEqual(state.stats.achieve.trade, { l: 2, m: 2 });
});

test('small achievement request outside micro is rejected before creating achievement state', () => {
    const state = install('standard');

    assert.equal(legacy.unlockAchievement('trade', true, 1), false);
    assert.equal(Object.prototype.hasOwnProperty.call(state.stats.achieve, 'trade'), false);
});

test('rank zero preserves achievement-record presence even though no positive rank is earned', () => {
    const state = install('standard');

    assert.equal(legacy.unlockAchievement('trade', false, 0), false);
    assert.equal(Object.prototype.hasOwnProperty.call(state.stats.achieve, 'trade'), true);
    assert.deepEqual(state.stats.achieve.trade, { l: 0 });
});

test('aggregate base achievement progress removes the automatic non-standard universe rank', () => {
    const state = install('evil');
    seedAggregateChildren(state, 'extinct_', 25);

    legacy.checkAchievementProgress();

    assert.equal(state.stats.achieve.mass_extinction.l, 1);
    assert.equal(
        Object.prototype.hasOwnProperty.call(state.stats.achieve.mass_extinction, 'e'),
        true,
        'legacy aggregate calculation explicitly leaves an undefined universe property in memory'
    );
    assert.equal(state.stats.achieve.mass_extinction.e, undefined);
});

test('aggregate universe progress restores the universe rank only when enough children qualify there', () => {
    const state = install('evil');
    seedAggregateChildren(state, 'extinct_', 25, 'e');

    legacy.checkAchievementProgress();

    assert.deepEqual(state.stats.achieve.mass_extinction, { l: 1, e: 1 });
});

test('historical vars.js achievement migrations remain ahead of the future GameState hydration seam', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src', 'vars.js'), 'utf8');
    const requiredMarkers = [
        "global.stats.achieve[key] = 1;",
        "global.stats.achieve['biome_hellscape'] = global.stats.achieve['genus_demonic'];",
        "global.stats.achieve[key] = { l: global.stats.achieve[key] };",
        "global.stats.achieve['cross'] = { l: a_level, a: a_level };",
        "global.stats.achieve['blood_war'].e = undefined;",
        "global.stats.achieve['extinct_ogre'] = global.stats.achieve['extinct_orge'];",
        "delete global.stats.achieve['extinct_orge'];",
        "global.stats.achieve['genus_carnivore'] = global.stats.achieve.genus_animal;",
        "delete global.stats.achieve.genus_animal;",
        "delete global.stats.achieve['extinct_sludge'];"
    ];

    requiredMarkers.forEach(marker => {
        assert.ok(source.includes(marker), `missing reviewed achievement migration marker: ${marker}`);
    });
});

test('M2D1 source inventory confines direct achievement writes to migration and achievement modules', () => {
    const inventory = achievementAccessInventory();
    const writerFiles = Object.entries(inventory)
        .filter(([, counts]) => counts.writes > 0)
        .map(([file]) => file)
        .sort();

    assert.ok(inventory['src/main.js'] && inventory['src/main.js'].reads > 0, 'expected ordinary gameplay readers');
    assert.ok(inventory['src/resets.js'] && inventory['src/resets.js'].reads > 0, 'expected reset gameplay readers');
    assert.deepEqual(writerFiles, ['src/achieve.js', 'src/vars.js']);
    assert.ok(inventory['src/achieve.js'].writes >= 3, 'expected unlock plus aggregate achievement writes');
    assert.ok(inventory['src/vars.js'].writes >= 5, 'expected historical migration writes');
});
