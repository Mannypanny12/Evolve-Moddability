'use strict';

const {
    SETTING_TARGET_POLICY,
    RUNTIME_TARGET_POLICY,
} = require('./m2c-state-classification.cjs');

const STATE_LAYERS = Object.freeze([
    'game-state',
    'application-preference',
    'application-control',
    'ui-session',
    'derived-state',
    'simulation-working',
    'application-working',
    'runtime-service',
    'platform-service',
    'migration',
    'debug',
]);

const LIFECYCLES = Object.freeze([
    'game-domain',
    'application-profile',
    'application-session',
    'operation',
    'process',
    'import',
    'debug-session',
]);

const PERSISTENCE_MODES = Object.freeze([
    'game-save',
    'application-preference',
    'application-session',
    'none',
    'service-owned',
    'import-only',
]);

const SIMULATION_ROLES = Object.freeze([
    'authoritative',
    'explicit-command-input',
    'scheduling-gate',
    'derived-read-only',
    'working-context',
    'orchestration-only',
    'platform-only',
    'none',
    'debug-only',
]);

const MIGRATION_DISPOSITIONS = Object.freeze([
    'direct',
    'translate',
    'derive',
    'reconstruct',
    'decompose',
    'discard',
    'replace-by-service',
]);

const RESET_BEHAVIORS = Object.freeze([
    'domain-defined',
    'survive-gameplay-reset',
    'session-defined',
    'reset-to-default',
    'recompute',
    'discard-after-operation',
    'recreate-runtime',
    'import-only',
    'debug-defined',
]);

function freezeList(values){
    return Object.freeze([...values]);
}

const LAYER_RULES = Object.freeze({
    'game-state': Object.freeze({
        lifecycles: freezeList(['game-domain']),
        persistence: freezeList(['game-save']),
        simulationRoles: freezeList(['authoritative']),
        migrationDispositions: freezeList(['direct', 'translate']),
        resetBehaviors: freezeList(['domain-defined']),
    }),
    'application-preference': Object.freeze({
        lifecycles: freezeList(['application-profile']),
        persistence: freezeList(['application-preference']),
        simulationRoles: freezeList(['none', 'explicit-command-input']),
        migrationDispositions: freezeList(['direct', 'translate']),
        resetBehaviors: freezeList(['survive-gameplay-reset']),
    }),
    'application-control': Object.freeze({
        lifecycles: freezeList(['application-session']),
        persistence: freezeList(['application-session', 'none']),
        simulationRoles: freezeList(['scheduling-gate']),
        migrationDispositions: freezeList(['direct', 'translate']),
        resetBehaviors: freezeList(['session-defined', 'reset-to-default']),
    }),
    'ui-session': Object.freeze({
        lifecycles: freezeList(['application-session']),
        persistence: freezeList(['application-session', 'none']),
        simulationRoles: freezeList(['none']),
        migrationDispositions: freezeList(['direct', 'translate']),
        resetBehaviors: freezeList(['session-defined', 'reset-to-default']),
    }),
    'derived-state': Object.freeze({
        lifecycles: freezeList(['application-session', 'operation', 'process']),
        persistence: freezeList(['none']),
        simulationRoles: freezeList(['derived-read-only']),
        migrationDispositions: freezeList(['derive', 'reconstruct']),
        resetBehaviors: freezeList(['recompute']),
    }),
    'simulation-working': Object.freeze({
        lifecycles: freezeList(['operation']),
        persistence: freezeList(['none']),
        simulationRoles: freezeList(['working-context']),
        migrationDispositions: freezeList(['reconstruct']),
        resetBehaviors: freezeList(['discard-after-operation']),
    }),
    'application-working': Object.freeze({
        lifecycles: freezeList(['application-session', 'process']),
        persistence: freezeList(['none']),
        simulationRoles: freezeList(['none']),
        migrationDispositions: freezeList(['reconstruct']),
        resetBehaviors: freezeList(['session-defined', 'recreate-runtime']),
    }),
    'runtime-service': Object.freeze({
        lifecycles: freezeList(['process']),
        persistence: freezeList(['service-owned']),
        simulationRoles: freezeList(['orchestration-only']),
        migrationDispositions: freezeList(['replace-by-service']),
        resetBehaviors: freezeList(['recreate-runtime']),
    }),
    'platform-service': Object.freeze({
        lifecycles: freezeList(['process']),
        persistence: freezeList(['service-owned']),
        simulationRoles: freezeList(['platform-only']),
        migrationDispositions: freezeList(['replace-by-service']),
        resetBehaviors: freezeList(['recreate-runtime']),
    }),
    migration: Object.freeze({
        lifecycles: freezeList(['import']),
        persistence: freezeList(['import-only']),
        simulationRoles: freezeList(['none']),
        migrationDispositions: freezeList(['decompose', 'discard']),
        resetBehaviors: freezeList(['import-only']),
    }),
    debug: Object.freeze({
        lifecycles: freezeList(['application-profile', 'debug-session']),
        persistence: freezeList(['application-preference', 'none']),
        simulationRoles: freezeList(['debug-only']),
        migrationDispositions: freezeList(['direct', 'discard']),
        resetBehaviors: freezeList(['debug-defined']),
    }),
});

function stateContract({
    targetLayer,
    lifecycle,
    persistence,
    simulationRole,
    migrationDisposition,
    resetBehavior,
    owner,
    reason,
}){
    return Object.freeze({
        targetLayer,
        lifecycle,
        persistence,
        simulationRole,
        migrationDisposition,
        resetBehavior,
        owner,
        reason,
    });
}

const SHOW_PROJECTION_SETTINGS = Object.freeze([
    'showAchieve',
    'showAlchemy',
    'showCargo',
    'showCity',
    'showCiv',
    'showCivic',
    'showDeep',
    'showEden',
    'showEjector',
    'showEvolve',
    'showGalactic',
    'showGenetics',
    'showGovernor',
    'showIndustry',
    'showMarket',
    'showMechLab',
    'showMil',
    'showOuter',
    'showPortal',
    'showPowerGrid',
    'showPsychic',
    'showResearch',
    'showResources',
    'showShipYard',
    'showSpace',
    'showStorage',
    'showTau',
    'showWish',
]);
const SHOW_PROJECTION_SET = new Set(SHOW_PROJECTION_SETTINGS);

function settingContract(name, info){
    if (name === 'pause'){
        return stateContract({
            targetLayer: 'application-control',
            lifecycle: 'application-session',
            persistence: 'application-session',
            simulationRole: 'scheduling-gate',
            migrationDisposition: 'translate',
            resetBehavior: 'reset-to-default',
            owner: 'application scheduler/command-dispatch control',
            reason: 'Pause gates scheduling and dispatch, but legacy gameplay resets explicitly clear it. It is session control rather than authoritative simulation state or a durable profile preference.',
        });
    }

    if (name === 'disableReset'){
        return stateContract({
            targetLayer: 'ui-session',
            lifecycle: 'application-session',
            persistence: 'none',
            simulationRole: 'none',
            migrationDisposition: 'translate',
            resetBehavior: 'reset-to-default',
            owner: 'application destructive-action safety UI',
            reason: 'disableReset is a temporary confirmation/safety latch for reset controls. Legacy reset handling explicitly clears it, so it must not become a persistent application-profile preference.',
        });
    }

    if (name === 'arpa' || name === 'msgFilters'){
        return stateContract({
            targetLayer: 'migration',
            lifecycle: 'import',
            persistence: 'import-only',
            simulationRole: 'none',
            migrationDisposition: 'decompose',
            resetBehavior: 'import-only',
            owner: 'legacy settings importer plus nested target owners',
            reason: `${name} is a mixed legacy container whose nested members have different target owners and must be decomposed.`,
        });
    }

    if (['space', 'portal', 'eden', 'tau'].includes(name) || SHOW_PROJECTION_SET.has(name)){
        return stateContract({
            targetLayer: 'derived-state',
            lifecycle: 'application-session',
            persistence: 'none',
            simulationRole: 'derived-read-only',
            migrationDisposition: 'derive',
            resetBehavior: 'recompute',
            owner: name === 'showCivic'
                ? 'progression/unlock selectors plus UI projection'
                : 'progression/world selectors plus UI projection',
            reason: 'Legacy visibility/unlock mirrors should be derived from authoritative progression/world facts instead of becoming independent saved UI authority.',
        });
    }

    switch (info.targetLayer){
        case 'game-state-candidate':
            return stateContract({
                targetLayer: 'game-state', lifecycle: 'game-domain', persistence: 'game-save', simulationRole: 'authoritative',
                migrationDisposition: info.directMigration ? 'direct' : 'translate', resetBehavior: 'domain-defined', owner: info.owner, reason: info.reason,
            });
        case 'application-settings':
            return stateContract({
                targetLayer: 'application-preference', lifecycle: 'application-profile', persistence: 'application-preference',
                simulationRole: info.legacyMode === 'include' ? 'explicit-command-input' : 'none',
                migrationDisposition: info.directMigration ? 'direct' : 'translate', resetBehavior: 'survive-gameplay-reset', owner: info.owner, reason: info.reason,
            });
        case 'ui-state':
            return stateContract({
                targetLayer: 'ui-session', lifecycle: 'application-session', persistence: 'application-session', simulationRole: 'none',
                migrationDisposition: info.directMigration ? 'direct' : 'translate', resetBehavior: 'session-defined', owner: info.owner, reason: info.reason,
            });
        case 'derived-transient':
            return stateContract({
                targetLayer: 'derived-state', lifecycle: 'application-session', persistence: 'none', simulationRole: 'derived-read-only',
                migrationDisposition: 'reconstruct', resetBehavior: 'recompute', owner: info.owner, reason: info.reason,
            });
        case 'migration-only':
            return stateContract({
                targetLayer: 'migration', lifecycle: 'import', persistence: 'import-only', simulationRole: 'none',
                migrationDisposition: 'discard', resetBehavior: 'import-only', owner: info.owner, reason: info.reason,
            });
        case 'debug-only':
            return stateContract({
                targetLayer: 'debug', lifecycle: 'application-profile', persistence: 'application-preference', simulationRole: 'debug-only',
                migrationDisposition: info.directMigration ? 'direct' : 'discard', resetBehavior: 'debug-defined', owner: info.owner, reason: info.reason,
            });
        case 'semantic-debt':
            return stateContract({
                targetLayer: 'derived-state', lifecycle: 'application-session', persistence: 'none', simulationRole: 'derived-read-only',
                migrationDisposition: 'derive', resetBehavior: 'recompute', owner: info.owner, reason: info.reason,
            });
        default:
            throw new Error(`Unmapped legacy setting layer ${info.targetLayer} for ${name}`);
    }
}

function runtimeContract(name, info){
    if (name === 'message_logs' || name === 'tmp_vars'){
        return stateContract({
            targetLayer: 'migration',
            lifecycle: 'import',
            persistence: 'import-only',
            simulationRole: 'none',
            migrationDisposition: 'decompose',
            resetBehavior: 'import-only',
            owner: name === 'message_logs'
                ? 'legacy message presentation container plus nested application owners'
                : 'legacy scratch container plus capability-local future owners',
            reason: `${name} is a mixed legacy runtime container and must be decomposed rather than recreated as one permanent target bucket.`,
        });
    }

    switch (info.targetLayer){
        case 'legacy-mixed-container':
            return stateContract({
                targetLayer: 'migration', lifecycle: 'import', persistence: 'import-only', simulationRole: 'none',
                migrationDisposition: 'decompose', resetBehavior: 'import-only', owner: info.owner, reason: info.reason,
            });
        case 'derived-transient':
            return stateContract({
                targetLayer: 'derived-state', lifecycle: 'process', persistence: 'none', simulationRole: 'derived-read-only',
                migrationDisposition: 'reconstruct', resetBehavior: 'recompute', owner: info.owner, reason: info.reason,
            });
        case 'runtime-working':
            if (name === 'keyMap'){
                return stateContract({
                    targetLayer: 'application-working', lifecycle: 'process', persistence: 'none', simulationRole: 'none',
                    migrationDisposition: 'reconstruct', resetBehavior: 'recreate-runtime', owner: info.owner, reason: info.reason,
                });
            }
            return stateContract({
                targetLayer: 'simulation-working', lifecycle: 'operation', persistence: 'none', simulationRole: 'working-context',
                migrationDisposition: 'reconstruct', resetBehavior: 'discard-after-operation', owner: info.owner, reason: info.reason,
            });
        case 'runtime-service':
            return stateContract({
                targetLayer: 'runtime-service', lifecycle: 'process', persistence: 'service-owned', simulationRole: 'orchestration-only',
                migrationDisposition: 'replace-by-service', resetBehavior: 'recreate-runtime', owner: info.owner, reason: info.reason,
            });
        case 'platform-service':
            return stateContract({
                targetLayer: 'platform-service', lifecycle: 'process', persistence: 'service-owned', simulationRole: 'platform-only',
                migrationDisposition: 'replace-by-service', resetBehavior: 'recreate-runtime', owner: info.owner, reason: info.reason,
            });
        case 'ui-state':
            return stateContract({
                targetLayer: 'ui-session', lifecycle: 'application-session', persistence: 'application-session', simulationRole: 'none',
                migrationDisposition: 'translate', resetBehavior: 'session-defined', owner: info.owner, reason: info.reason,
            });
        default:
            throw new Error(`Unmapped legacy runtime layer ${info.targetLayer} for ${name}`);
    }
}

const SETTING_STATE_CONTRACT = Object.freeze(Object.fromEntries(
    Object.entries(SETTING_TARGET_POLICY).map(([name, info]) => [name, settingContract(name, info)])
));

const RUNTIME_STATE_CONTRACT = Object.freeze(Object.fromEntries(
    Object.entries(RUNTIME_TARGET_POLICY).map(([name, info]) => [name, runtimeContract(name, info)])
));

function nestedRule({ id, pattern, classification }){
    return Object.freeze({ id, pattern, classification });
}

const NESTED_SETTING_RULES = Object.freeze([
    nestedRule({
        id: 'arpa-selected-tab', pattern: /^arpa\.arpaTabs$/,
        classification: stateContract({
            targetLayer: 'ui-session', lifecycle: 'application-session', persistence: 'application-session', simulationRole: 'none',
            migrationDisposition: 'direct', resetBehavior: 'session-defined', owner: 'application ARPA navigation',
            reason: 'Selected ARPA tab is navigation state, not progression authority.',
        }),
    }),
    nestedRule({
        id: 'arpa-availability', pattern: /^arpa\.(physics|genetics|crispr|blood)$/,
        classification: stateContract({
            targetLayer: 'derived-state', lifecycle: 'application-session', persistence: 'none', simulationRole: 'derived-read-only',
            migrationDisposition: 'derive', resetBehavior: 'recompute', owner: 'progression selectors plus ARPA UI projection',
            reason: 'ARPA section availability is driven by progression and should be derived from authoritative facts.',
        }),
    }),
    nestedRule({
        id: 'world-region-availability', pattern: /^(space|portal|eden|tau)\.[^.]+$/,
        classification: stateContract({
            targetLayer: 'derived-state', lifecycle: 'application-session', persistence: 'none', simulationRole: 'derived-read-only',
            migrationDisposition: 'derive', resetBehavior: 'recompute', owner: 'progression/world selectors plus UI projection',
            reason: 'Region availability mirrors gameplay progression and should be projected from authoritative world/progression state.',
        }),
    }),
    nestedRule({
        id: 'keyboard-mapping', pattern: /^keyMap\.[^.]+$/,
        classification: stateContract({
            targetLayer: 'application-preference', lifecycle: 'application-profile', persistence: 'application-preference', simulationRole: 'none',
            migrationDisposition: 'direct', resetBehavior: 'survive-gameplay-reset', owner: 'application input settings',
            reason: 'Keyboard mappings are user preferences.',
        }),
    }),
    nestedRule({
        id: 'message-filter-availability', pattern: /^msgFilters\.[^.]+\.unlocked$/,
        classification: stateContract({
            targetLayer: 'derived-state', lifecycle: 'application-session', persistence: 'none', simulationRole: 'derived-read-only',
            migrationDisposition: 'derive', resetBehavior: 'recompute', owner: 'progression/message-capability selector',
            reason: 'Whether a message category is available is a progression/capability projection, not a user preference.',
        }),
    }),
    nestedRule({
        id: 'message-filter-preference', pattern: /^msgFilters\.[^.]+\.(vis|max|save)$/,
        classification: stateContract({
            targetLayer: 'application-preference', lifecycle: 'application-profile', persistence: 'application-preference', simulationRole: 'none',
            migrationDisposition: 'direct', resetBehavior: 'survive-gameplay-reset', owner: 'application message settings',
            reason: 'Message visibility, display limit and retention limit are user preferences.',
        }),
    }),
    nestedRule({
        id: 'resource-bar-preference', pattern: /^resBar\.[^.]+$/,
        classification: stateContract({
            targetLayer: 'application-preference', lifecycle: 'application-profile', persistence: 'application-preference', simulationRole: 'none',
            migrationDisposition: 'translate', resetBehavior: 'survive-gameplay-reset', owner: 'application resource presentation settings',
            reason: 'Per-resource bar visibility is a user preference and should later use canonical resource IDs.',
        }),
    }),
]);

const NESTED_RUNTIME_RULES = Object.freeze([
    nestedRule({
        id: 'message-log-selected-view', pattern: /^message_logs\.view$/,
        classification: stateContract({
            targetLayer: 'ui-session', lifecycle: 'application-session', persistence: 'application-session', simulationRole: 'none',
            migrationDisposition: 'direct', resetBehavior: 'session-defined', owner: 'application message-view navigation',
            reason: 'The selected message category is UI-session state.',
        }),
    }),
    nestedRule({
        id: 'message-log-buffer', pattern: /^message_logs\.[^.]+$/,
        classification: stateContract({
            targetLayer: 'application-working', lifecycle: 'process', persistence: 'none', simulationRole: 'none',
            migrationDisposition: 'reconstruct', resetBehavior: 'recreate-runtime', owner: 'application message presentation buffers',
            reason: 'Per-category rendered message buffers are rebuilt at startup from the persisted legacy message history and are not independently authoritative.',
        }),
    }),
]);

const EXPECTED_FIXED_NESTED_KEYS = Object.freeze({
    arpa: freezeList(['arpaTabs', 'physics', 'genetics', 'crispr', 'blood']),
    space: freezeList(['home', 'moon', 'red', 'hell', 'sun', 'gas', 'gas_moon', 'belt', 'dwarf', 'alpha', 'proxima', 'nebula', 'neutron', 'blackhole', 'sirius', 'stargate', 'gateway', 'gorddon', 'alien1', 'alien2', 'chthonian', 'titan', 'enceladus', 'triton', 'eris', 'kuiper']),
    portal: freezeList(['fortress', 'badlands', 'pit', 'ruins', 'gate', 'lake', 'spire', 'wasteland']),
    eden: freezeList(['asphodel', 'elysium', 'isle', 'palace']),
    tau: freezeList(['home', 'red', 'roid', 'gas', 'gas2', 'star']),
    keyMap: freezeList(['x10', 'x25', 'x100', 'q', 'showCiv', 'showCivic', 'showResearch', 'showResources', 'showGenetics', 'showAchieve', 'settings']),
});

const EXPECTED_MESSAGE_LOG_FILTERS = Object.freeze([
    'all', 'progress', 'queue', 'building_queue', 'research_queue', 'combat', 'spy', 'events', 'major_events', 'minor_events', 'achievements', 'hell',
]);

function matchNestedSettingPath(path){
    return NESTED_SETTING_RULES.filter(rule => rule.pattern.test(path));
}

function matchNestedRuntimePath(path){
    return NESTED_RUNTIME_RULES.filter(rule => rule.pattern.test(path));
}

module.exports = {
    STATE_LAYERS,
    LIFECYCLES,
    PERSISTENCE_MODES,
    SIMULATION_ROLES,
    MIGRATION_DISPOSITIONS,
    RESET_BEHAVIORS,
    LAYER_RULES,
    SHOW_PROJECTION_SETTINGS,
    SETTING_STATE_CONTRACT,
    RUNTIME_STATE_CONTRACT,
    NESTED_SETTING_RULES,
    NESTED_RUNTIME_RULES,
    EXPECTED_FIXED_NESTED_KEYS,
    EXPECTED_MESSAGE_LOG_FILTERS,
    matchNestedSettingPath,
    matchNestedRuntimePath,
};