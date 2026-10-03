'use strict';

const TARGET_LAYERS = Object.freeze([
    'game-state-candidate',
    'application-settings',
    'ui-state',
    'derived-transient',
    'runtime-working',
    'runtime-service',
    'platform-service',
    'migration-only',
    'debug-only',
    'legacy-mixed-container',
    'semantic-debt'
]);

const PERSISTENCE_INTENTS = Object.freeze([
    'authoritative-save',
    'application-preference',
    'ui-session-or-preference',
    'recompute',
    'runtime-only',
    'service-owned',
    'legacy-only',
    'deferred'
]);

function entry({ legacyMode, targetLayer, persistence, owner, directMigration = true, reason }){
    return Object.freeze({
        legacyMode,
        targetLayer,
        persistence,
        owner,
        directMigration,
        reason
    });
}

const SETTING_TARGET_POLICY = Object.freeze({
    // Legacy gameplay/simulation-affecting settings. M0 observation and M2 target
    // ownership are intentionally separate decisions.
    alwaysPower: entry({ legacyMode: 'include', targetLayer: 'game-state-candidate', persistence: 'authoritative-save', owner: 'future structure/power policy domain', reason: 'Changes automatic activation of newly completed powered structures, including autonomous/queued completion.' }),
    at: entry({ legacyMode: 'include', targetLayer: 'game-state-candidate', persistence: 'authoritative-save', owner: 'future simulation-time domain', reason: 'Represents accelerated-time budget consumed by simulation.' }),
    boring: entry({ legacyMode: 'include', targetLayer: 'game-state-candidate', persistence: 'authoritative-save', owner: 'future run/world rule domain', reason: 'Changes seasonal gameplay effects rather than presentation only.' }),
    lowPowerBalance: entry({ legacyMode: 'include', targetLayer: 'game-state-candidate', persistence: 'authoritative-save', owner: 'future power/support domain', reason: 'Changes deterministic power-shortage allocation during simulation.' }),
    mtorder: entry({ legacyMode: 'include', targetLayer: 'game-state-candidate', persistence: 'authoritative-save', owner: 'future evolution/trait domain', reason: 'Persisted ordering participates in evolution/minor-trait behavior.' }),
    pause: entry({ legacyMode: 'include', targetLayer: 'game-state-candidate', persistence: 'authoritative-save', owner: 'future simulation-control domain', reason: 'Stops/resumes gameplay and currently gates actions; target representation remains a simulation-control concern.' }),

    qAny: entry({ legacyMode: 'include', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'future command/UI application layer', directMigration: false, reason: 'Legacy preference changes how a build action is authored; target commands should receive the chosen behavior explicitly.' }),
    qAny_res: entry({ legacyMode: 'include', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'future command/UI application layer', directMigration: false, reason: 'Legacy preference changes how a research action is authored; it should not become hidden engine state.' }),
    qKey: entry({ legacyMode: 'include', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'future input/command application layer', directMigration: false, reason: 'Maps input intent to direct versus queued actions; the resulting command is authoritative, not the input preference itself.' }),
    q_merge: entry({ legacyMode: 'include', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'future queue-command application layer', directMigration: false, reason: 'Legacy queue merge policy should become an explicit command option rather than implicit GameState.' }),
    showCivic: entry({ legacyMode: 'include', targetLayer: 'semantic-debt', persistence: 'deferred', owner: 'future progression/unlock domain plus UI projection', directMigration: false, reason: 'A UI-looking visibility flag currently gates technology conditions. Migrate the underlying progression fact, then derive visibility.' }),

    // Stable user/application preferences.
    affix: entry({ legacyMode: 'exclude', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'application presentation settings', reason: 'Number formatting preference.' }),
    animated: entry({ legacyMode: 'exclude', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'application presentation settings', reason: 'Animation preference.' }),
    buildQueueHeight: entry({ legacyMode: 'exclude', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'application layout settings', reason: 'User-selected queue layout height.' }),
    cLabels: entry({ legacyMode: 'exclude', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'application presentation settings', reason: 'City label preference.' }),
    disableReset: entry({ legacyMode: 'exclude', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'application safety settings', reason: 'Controls reset UI affordance rather than simulation outcomes.' }),
    font: entry({ legacyMode: 'exclude', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'application presentation settings', reason: 'Font preference.' }),
    icon: entry({ legacyMode: 'exclude', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'application presentation settings', reason: 'Resource icon preference.' }),
    keyMap: entry({ legacyMode: 'exclude', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'application input settings', reason: 'Keyboard mapping preference.' }),
    locale: entry({ legacyMode: 'exclude', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'application localization settings', reason: 'Localization choice.' }),
    mKeys: entry({ legacyMode: 'exclude', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'application input settings', reason: 'Modifier-key preference.' }),
    msgFilters: entry({ legacyMode: 'exclude', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'application message settings', reason: 'Message visibility/filter preference.' }),
    msgQueueHeight: entry({ legacyMode: 'exclude', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'application layout settings', reason: 'User-selected message layout height.' }),
    q_resize: entry({ legacyMode: 'exclude', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'application layout settings', reason: 'Queue resizing preference.' }),
    queuestyle: entry({ legacyMode: 'exclude', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'application presentation settings', reason: 'Queue CSS/layout style preference.' }),
    resBar: entry({ legacyMode: 'exclude', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'application resource presentation settings', reason: 'Resource-bar visibility preferences.' }),
    sPackOn: entry({ legacyMode: 'exclude', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'application localization settings', reason: 'String-pack/localization toggle.' }),
    tabLoad: entry({ legacyMode: 'exclude', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'application navigation settings', reason: 'UI lazy-loading preference.' }),
    theme: entry({ legacyMode: 'exclude', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'application presentation settings', reason: 'CSS theme preference.' }),
    touch: entry({ legacyMode: 'exclude', targetLayer: 'application-settings', persistence: 'application-preference', owner: 'application input settings', reason: 'Touch UI preference.' }),

    // Current UI/navigation/session state. Some visibility flags may later be
    // derived from authoritative progression, but they must not be copied into
    // GameState merely because legacy saves them.
    arpa: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application ARPA navigation state', directMigration: false, reason: 'ARPA navigation/visibility state.' }),
    civTabs: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application navigation state', reason: 'Selected top-level civilization/settings tab.' }),
    eden: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application Eden navigation state', directMigration: false, reason: 'Eden navigation/visibility state.' }),
    govTabs: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application navigation state', reason: 'Selected government tab.' }),
    govTabs2: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application navigation state', reason: 'Selected secondary government tab.' }),
    hellTabs: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application navigation state', reason: 'Selected Hell tab.' }),
    marketTabs: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application navigation state', reason: 'Selected market/resource tab.' }),
    portal: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application Portal navigation state', directMigration: false, reason: 'Portal navigation/visibility state.' }),
    resTabs: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application navigation state', reason: 'Selected research sub-tab.' }),
    space: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application space navigation state', directMigration: false, reason: 'Space-region navigation/visibility state.' }),
    spaceTabs: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application navigation state', reason: 'Selected space UI tab.' }),
    statsTabs: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application navigation state', reason: 'Selected statistics/achievement tab.' }),
    tau: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application Tau Ceti navigation state', directMigration: false, reason: 'Tau Ceti navigation/visibility state.' }),

    showAchieve: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Achievement panel visibility.' }),
    showAlchemy: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Alchemy panel visibility.' }),
    showCargo: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Cargo panel visibility.' }),
    showCity: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'City panel visibility/navigation.' }),
    showCiv: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Civilization panel visibility.' }),
    showDeep: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Deep-space panel visibility.' }),
    showEden: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Eden panel visibility.' }),
    showEjector: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Ejector panel visibility.' }),
    showEvolve: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Evolution panel visibility.' }),
    showGalactic: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Galactic panel visibility.' }),
    showGenetics: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Genetics panel visibility.' }),
    showGovernor: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Governor panel visibility.' }),
    showIndustry: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Industry panel visibility.' }),
    showMarket: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Market panel visibility.' }),
    showMechLab: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Mech-lab panel visibility.' }),
    showMil: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Military panel visibility.' }),
    showOuter: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Outer-system panel visibility.' }),
    showPortal: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Portal panel visibility.' }),
    showPowerGrid: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Power-grid panel visibility.' }),
    showPsychic: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Psychic panel visibility.' }),
    showResearch: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Research panel visibility/unlock marker; authoritative technology state belongs elsewhere.' }),
    showResources: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Resource panel visibility.' }),
    showShipYard: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Shipyard panel visibility.' }),
    showSpace: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Space panel visibility.' }),
    showStorage: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Storage panel visibility.' }),
    showTau: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Tau Ceti panel visibility.' }),
    showWish: entry({ legacyMode: 'exclude', targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application UI projection', directMigration: false, reason: 'Wish panel visibility.' }),

    // Legacy-only, derived and diagnostic settings.
    expose: entry({ legacyMode: 'exclude', targetLayer: 'debug-only', persistence: 'application-preference', owner: 'developer/debug application layer', reason: 'Debug data exposure switch.' }),
    restoreCheck: entry({ legacyMode: 'exclude', targetLayer: 'migration-only', persistence: 'legacy-only', owner: 'legacy importer/migration', directMigration: false, reason: 'Obsolete restore/migration preference.' }),
    sPackMsg: entry({ legacyMode: 'exclude', targetLayer: 'derived-transient', persistence: 'recompute', owner: 'application localization projection', directMigration: false, reason: 'Localized string-pack status text derived from storage/localization.' }),
    tLabels: entry({ legacyMode: 'exclude', targetLayer: 'migration-only', persistence: 'legacy-only', owner: 'legacy importer/migration', directMigration: false, reason: 'Obsolete label preference removed by migration.' })
});

const RUNTIME_TARGET_POLICY = Object.freeze({
    save: entry({ targetLayer: 'platform-service', persistence: 'service-owned', owner: 'runtime Storage port/browser adapter', directMigration: false, reason: 'Direct localStorage handle is an environmental dependency, not state.' }),
    global: entry({ targetLayer: 'legacy-mixed-container', persistence: 'legacy-only', owner: 'temporary legacy runtime', directMigration: false, reason: 'Legacy implementation object mixes authoritative state, settings, metadata and presentation state; it must be decomposed by domain.' }),
    tmp_vars: entry({ targetLayer: 'derived-transient', persistence: 'recompute', owner: 'future calculation/system-local context', directMigration: false, reason: 'Generic legacy scratch data must not become a new global transient bucket.' }),
    breakdown: entry({ targetLayer: 'derived-transient', persistence: 'recompute', owner: 'future calculation trace/projection', directMigration: false, reason: 'Production/consumption breakdown data is derived reporting information.' }),
    power_generated: entry({ targetLayer: 'derived-transient', persistence: 'recompute', owner: 'future power calculation trace/projection', directMigration: false, reason: 'Derived power-generation reporting keyed partly by presentation labels.' }),
    p_on: entry({ targetLayer: 'runtime-working', persistence: 'runtime-only', owner: 'future power reconciliation system', directMigration: false, reason: 'Rebuilt from authoritative structure state and mutated as deterministic per-step power working state.' }),
    support_on: entry({ targetLayer: 'runtime-working', persistence: 'runtime-only', owner: 'future support reconciliation system', directMigration: false, reason: 'Rebuilt/used as per-step support working state.' }),
    int_on: entry({ targetLayer: 'runtime-working', persistence: 'runtime-only', owner: 'future interstellar/power reconciliation system', directMigration: false, reason: 'Per-step activation working state, not standalone save authority.' }),
    gal_on: entry({ targetLayer: 'runtime-working', persistence: 'runtime-only', owner: 'future galactic/power reconciliation system', directMigration: false, reason: 'Per-step activation working state, not standalone save authority.' }),
    spire_on: entry({ targetLayer: 'runtime-working', persistence: 'runtime-only', owner: 'future spire/support reconciliation system', directMigration: false, reason: 'Per-step activation working state, not standalone save authority.' }),
    quantum_level: entry({ targetLayer: 'derived-transient', persistence: 'recompute', owner: 'future calculation/selector', directMigration: false, reason: 'Cached derived quantum level.' }),
    achieve_level: entry({ targetLayer: 'derived-transient', persistence: 'recompute', owner: 'future achievement calculation/selector', directMigration: false, reason: 'Cached derived achievement level.' }),
    universe_level: entry({ targetLayer: 'derived-transient', persistence: 'recompute', owner: 'future universe calculation/selector', directMigration: false, reason: 'Cached derived universe level.' }),
    atrack: entry({ targetLayer: 'runtime-working', persistence: 'runtime-only', owner: 'future accelerated-time simulation system', directMigration: false, reason: 'Mutable accelerated-time process tracker observed by M0 but distinct from authoritative accelerated-time budget.' }),
    hell_reports: entry({ targetLayer: 'derived-transient', persistence: 'recompute', owner: 'future Hell report projection', directMigration: false, reason: 'Runtime report/projection cache.' }),
    hell_graphs: entry({ targetLayer: 'derived-transient', persistence: 'recompute', owner: 'future Hell graph projection', directMigration: false, reason: 'Runtime graph/projection cache.' }),
    message_logs: entry({ targetLayer: 'ui-state', persistence: 'ui-session-or-preference', owner: 'application message UI', directMigration: false, reason: 'Current message-log view state.' }),
    callback_queue: entry({ targetLayer: 'runtime-service', persistence: 'service-owned', owner: 'future command/event/runtime orchestration', directMigration: false, reason: 'Contains executable callback references and cannot be state data.' }),
    active_rituals: entry({ targetLayer: 'runtime-working', persistence: 'runtime-only', owner: 'future ritual simulation system', directMigration: false, reason: 'Runtime ritual working set must be characterized before any authoritative representation is introduced.' }),
    keyMap: entry({ targetLayer: 'runtime-working', persistence: 'runtime-only', owner: 'application input runtime', directMigration: false, reason: 'Current pressed-key state is ephemeral input working state.' }),
    webWorker: entry({ targetLayer: 'runtime-service', persistence: 'service-owned', owner: 'platform scheduler/timing boundary', directMigration: false, reason: 'Worker handle/timing configuration is runtime orchestration, not gameplay state.' }),
    intervals: entry({ targetLayer: 'runtime-service', persistence: 'service-owned', owner: 'platform scheduler/timing boundary', directMigration: false, reason: 'Runtime interval handles must never enter persisted state.' })
});

module.exports = {
    TARGET_LAYERS,
    PERSISTENCE_INTENTS,
    SETTING_TARGET_POLICY,
    RUNTIME_TARGET_POLICY
};
