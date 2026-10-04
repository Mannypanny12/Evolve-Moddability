from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_once(
    'src/vars.js',
    "export function setGlobal(gameState) {\n    global = gameState;\n    bindLegacyAchievementState(global);\n}\n",
    "export function setGlobal(gameState) {\n    // Rebinding must succeed before the live legacy root changes. Otherwise a\n    // malformed replacement could leave global and GameState authority split.\n    bindLegacyAchievementState(gameState);\n    global = gameState;\n}\n",
)

replace_once(
    'tests/characterization/m2d-achievement-state.test.cjs',
    '        accesses.push({ write });\n',
    '        accesses.push({ write, index: match.index });\n',
)

replace_once(
    'tests/characterization/m2d-achievement-state.test.cjs',
    '''    requiredMarkers.forEach(marker => {\n        assert.ok(source.includes(marker), `missing reviewed achievement migration marker: ${marker}`);\n    });\n});\n''',
    '''    requiredMarkers.forEach(marker => {\n        assert.ok(source.includes(marker), `missing reviewed achievement migration marker: ${marker}`);\n    });\n\n    const hydrationMarker = '// M2D3 authority cutover: historical vars.js migrations and shape repair above';\n    const hydrationIndex = source.indexOf(hydrationMarker);\n    assert.ok(hydrationIndex >= 0, 'missing M2D3 achievement hydration marker');\n\n    const writesAfterHydration = analyzeAchievementAccesses(source)\n        .filter(access => access.write && access.index > hydrationIndex);\n    assert.deepEqual(\n        writesAfterHydration,\n        [],\n        'vars.js must not directly mutate global.stats.achieve after GameState hydration'\n    );\n});\n''',
)

print('M2D3 review hardening source patch applied.')
