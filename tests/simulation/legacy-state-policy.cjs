'use strict';

const ROOT_POLICY = Object.freeze({
    seed:        { mode: 'include', category: 'rng', reason: 'authoritative seeded RNG state' },
    warseed:     { mode: 'include', category: 'rng', reason: 'authoritative combat RNG state' },
    resource:    { mode: 'include', category: 'gameplay', reason: 'resource amounts, capacities and economic metadata' },
    evolution:   { mode: 'include', category: 'gameplay', reason: 'pre-civilization progression state' },
    tech:        { mode: 'include', category: 'gameplay', reason: 'technology/progression state' },
    city:        { mode: 'include', category: 'gameplay', reason: 'civilization structures and world state' },
    space:       { mode: 'include', category: 'gameplay', reason: 'space structures and state' },
    interstellar:{ mode: 'include', category: 'gameplay', reason: 'interstellar structures and state' },
    galaxy:      { mode: 'include', category: 'gameplay', reason: 'galactic structures and state' },
    portal:      { mode: 'include', category: 'gameplay', reason: 'Portal/Hell structures and combat state' },
    eden:        { mode: 'include', category: 'gameplay', reason: 'Eden structures and state' },
    tauceti:     { mode: 'include', category: 'gameplay', reason: 'Tau Ceti structures and state' },
    starDock:    { mode: 'include', category: 'gameplay', reason: 'space exploration and reset-related state' },
    civic:       { mode: 'include', category: 'gameplay', reason: 'jobs, government and military state' },
    race:        { mode: 'include', category: 'gameplay', reason: 'active species, universe, challenge and trait state' },
    genes:       { mode: 'include', category: 'meta', reason: 'persistent gene upgrades' },
    blood:       { mode: 'include', category: 'meta', reason: 'persistent blood upgrades' },
    stats:       { mode: 'include', category: 'meta', reason: 'statistics and achievements; volatile clock fields excluded separately' },
    event:       { mode: 'include', category: 'gameplay', reason: 'normal event timer/state' },
    m_event:     { mode: 'include', category: 'gameplay', reason: 'major event timer/state' },
    version:     { mode: 'include', category: 'metadata', reason: 'save/schema source identity' },
    new:         { mode: 'include', category: 'metadata', reason: 'legacy new-run lifecycle flag' },
    queue:       { mode: 'include', category: 'gameplay', reason: 'build/project queue state' },
    r_queue:     { mode: 'include', category: 'gameplay', reason: 'research queue state' },
    power:       { mode: 'include', category: 'gameplay', reason: 'power priority ordering' },
    support:     { mode: 'include', category: 'gameplay', reason: 'support priority ordering' },
    arpa:        { mode: 'include', category: 'gameplay', reason: 'ARPA project progress and ranks' },
    settings:    { mode: 'mixed', category: 'mixed', reason: 'contains both simulation-affecting and presentation-only preferences; every known top-level setting is classified separately' },
    special:     { mode: 'include', category: 'gameplay', reason: 'seasonal/special progression flags used by conditions and achievements' },
    custom:      { mode: 'include', category: 'gameplay', reason: 'custom/hybrid race definitions used by gameplay' },
    pillars:     { mode: 'include', category: 'meta', reason: 'pillar progression used by production/mastery calculations' },
    prestige:    { mode: 'include', category: 'meta', reason: 'prestige currencies and persistent progression' },
    govern:      { mode: 'include', category: 'gameplay', reason: 'governor/candidate/policy automation state' },
    sim:         { mode: 'include', category: 'gameplay', reason: 'simulation-challenge snapshot changes evolution, unlocks, reset/save behavior, and restores meta state' },

    lastMsg:     { mode: 'exclude', category: 'presentation', reason: 'message-log history only' },
    revision:    { mode: 'exclude', category: 'migration', reason: 'obsolete migration marker deleted at current version' },
    beta:        { mode: 'exclude', category: 'migration', reason: 'current-version initialization deletes this legacy/dev marker' }
});

const SIMULATION_SETTING_POLICY = Object.freeze({
    // Gameplay/action behavior.
    alwaysPower:     { mode: 'include', category: 'gameplay', reason: 'changes automatic activation of newly completed powered structures' },
    at:              { mode: 'include', category: 'simulation', reason: 'accelerated-time budget' },
    boring:          { mode: 'include', category: 'gameplay', reason: 'suppresses seasonal gameplay effects' },
    lowPowerBalance: { mode: 'include', category: 'gameplay', reason: 'changes power-shortage allocation between active structures' },
    mtorder:         { mode: 'include', category: 'gameplay', reason: 'controls persisted minor-trait ordering used during evolution' },
    pause:           { mode: 'include', category: 'simulation', reason: 'stops/resumes gameplay and gates actions' },
    qAny:            { mode: 'include', category: 'gameplay', reason: 'changes build queue resource/time selection behavior' },
    qAny_res:        { mode: 'include', category: 'gameplay', reason: 'changes research queue resource/time selection behavior' },
    qKey:            { mode: 'include', category: 'gameplay', reason: 'changes direct action versus queue behavior for input actions' },
    q_merge:         { mode: 'include', category: 'gameplay', reason: 'changes authoritative build-queue merge behavior' },
    showCivic:       { mode: 'include', category: 'gameplay', reason: 'directly gates multiple technology conditions' },

    // Presentation/navigation/input/localization settings. These are intentionally
    // classified so future settings cannot silently enter the mixed root.
    affix:            { mode: 'exclude', category: 'presentation', reason: 'number formatting only' },
    animated:         { mode: 'exclude', category: 'presentation', reason: 'animation preference only' },
    arpa:             { mode: 'exclude', category: 'presentation', reason: 'ARPA tab/visibility state; authoritative project progress lives under arpa' },
    buildQueueHeight: { mode: 'exclude', category: 'presentation', reason: 'layout height only' },
    cLabels:          { mode: 'exclude', category: 'presentation', reason: 'city label preference only' },
    civTabs:          { mode: 'exclude', category: 'presentation', reason: 'selected UI tab' },
    disableReset:     { mode: 'exclude', category: 'presentation', reason: 'UI reset control state; no production gameplay read outside initialization' },
    eden:             { mode: 'exclude', category: 'presentation', reason: 'Eden navigation/visibility state' },
    expose:           { mode: 'exclude', category: 'debug', reason: 'debug data exposure only' },
    font:             { mode: 'exclude', category: 'presentation', reason: 'font preference only' },
    govTabs:          { mode: 'exclude', category: 'presentation', reason: 'selected government UI tab' },
    hellTabs:         { mode: 'exclude', category: 'presentation', reason: 'selected Hell UI tab' },
    icon:             { mode: 'exclude', category: 'presentation', reason: 'resource icon preference only' },
    keyMap:           { mode: 'exclude', category: 'input', reason: 'keyboard mapping; action behavior is covered by authoritative action state and qKey' },
    locale:           { mode: 'exclude', category: 'presentation', reason: 'localization choice only' },
    mKeys:            { mode: 'exclude', category: 'input', reason: 'modifier-key preference only' },
    marketTabs:       { mode: 'exclude', category: 'presentation', reason: 'selected market UI tab' },
    msgFilters:       { mode: 'exclude', category: 'presentation', reason: 'message visibility/history preferences only' },
    msgQueueHeight:   { mode: 'exclude', category: 'presentation', reason: 'layout height only' },
    portal:           { mode: 'exclude', category: 'presentation', reason: 'Portal navigation/visibility state; authoritative structures live under portal' },
    q_resize:         { mode: 'exclude', category: 'presentation', reason: 'queue layout resizing preference only' },
    queuestyle:       { mode: 'exclude', category: 'presentation', reason: 'queue CSS style only' },
    resBar:           { mode: 'exclude', category: 'presentation', reason: 'resource-bar visibility preferences only' },
    restoreCheck:     { mode: 'exclude', category: 'migration', reason: 'obsolete restore/migration preference' },
    sPackMsg:         { mode: 'exclude', category: 'presentation', reason: 'localized string-pack status text' },
    sPackOn:          { mode: 'exclude', category: 'presentation', reason: 'string-pack/localization toggle' },
    showAchieve:      { mode: 'exclude', category: 'presentation', reason: 'achievement panel visibility only' },
    showAlchemy:      { mode: 'exclude', category: 'presentation', reason: 'alchemy panel visibility only' },
    showCargo:        { mode: 'exclude', category: 'presentation', reason: 'cargo panel visibility only' },
    showCity:         { mode: 'exclude', category: 'presentation', reason: 'city panel visibility/navigation only' },
    showCiv:          { mode: 'exclude', category: 'presentation', reason: 'civilization panel visibility only' },
    showDeep:         { mode: 'exclude', category: 'presentation', reason: 'deep-space panel visibility only' },
    showEden:         { mode: 'exclude', category: 'presentation', reason: 'Eden panel visibility only' },
    showEjector:      { mode: 'exclude', category: 'presentation', reason: 'ejector panel visibility only' },
    showEvolve:       { mode: 'exclude', category: 'presentation', reason: 'evolution panel visibility only' },
    showGalactic:     { mode: 'exclude', category: 'presentation', reason: 'galactic panel visibility only' },
    showGenetics:     { mode: 'exclude', category: 'presentation', reason: 'genetics panel visibility only' },
    showGovernor:     { mode: 'exclude', category: 'presentation', reason: 'governor panel visibility only' },
    showIndustry:     { mode: 'exclude', category: 'presentation', reason: 'industry panel visibility only' },
    showMarket:       { mode: 'exclude', category: 'presentation', reason: 'market panel visibility only' },
    showMechLab:      { mode: 'exclude', category: 'presentation', reason: 'mech-lab panel visibility only' },
    showMil:          { mode: 'exclude', category: 'presentation', reason: 'military panel visibility only' },
    showOuter:        { mode: 'exclude', category: 'presentation', reason: 'outer-system panel visibility only' },
    showPortal:       { mode: 'exclude', category: 'presentation', reason: 'Portal panel visibility only' },
    showPowerGrid:    { mode: 'exclude', category: 'presentation', reason: 'power-grid panel visibility only' },
    showPsychic:      { mode: 'exclude', category: 'presentation', reason: 'psychic panel visibility only' },
    showResearch:     { mode: 'exclude', category: 'presentation', reason: 'research panel visibility/unlock marker; technology state is authoritative elsewhere' },
    showResources:    { mode: 'exclude', category: 'presentation', reason: 'resource panel visibility only' },
    showShipYard:     { mode: 'exclude', category: 'presentation', reason: 'shipyard panel visibility only' },
    showSpace:        { mode: 'exclude', category: 'presentation', reason: 'space panel visibility only' },
    showStorage:      { mode: 'exclude', category: 'presentation', reason: 'storage panel visibility only' },
    showTau:          { mode: 'exclude', category: 'presentation', reason: 'Tau Ceti panel visibility only' },
    showWish:         { mode: 'exclude', category: 'presentation', reason: 'wish panel visibility only' },
    space:            { mode: 'exclude', category: 'presentation', reason: 'space-region navigation/visibility state; authoritative structures live under space/interstellar/galaxy' },
    spaceTabs:        { mode: 'exclude', category: 'presentation', reason: 'selected space UI tab' },
    tLabels:          { mode: 'exclude', category: 'migration', reason: 'obsolete label preference removed by migration' },
    tabLoad:          { mode: 'exclude', category: 'presentation', reason: 'UI lazy-load preference' },
    tau:              { mode: 'exclude', category: 'presentation', reason: 'Tau Ceti navigation/visibility state; authoritative structures live under tauceti' },
    theme:            { mode: 'exclude', category: 'presentation', reason: 'CSS theme only' },
    touch:            { mode: 'exclude', category: 'input', reason: 'touch UI preference only' }
});

const SIMULATION_SETTING_KEYS = Object.freeze(
    Object.entries(SIMULATION_SETTING_POLICY)
        .filter(([, info]) => info.mode === 'include')
        .map(([key]) => key)
        .sort()
);

const RESOURCE_FIELD_POLICY = Object.freeze({
    name: {
        mode: 'exclude',
        category: 'presentation',
        reason: 'localized display label; not authoritative resource mechanics'
    },
    bar: {
        mode: 'exclude',
        category: 'presentation',
        reason: 'resource-bar display preference; source preference lives under settings.resBar'
    }
});

function assertKnownRootPolicy(state){
    const unknown = Object.keys(state || {}).filter(key => !ROOT_POLICY[key]);
    if (unknown.length){
        throw new Error(
            `Unclassified legacy top-level state root(s): ${unknown.sort().join(', ')}`
        );
    }
}

function assertKnownSimulationSettingPolicy(settings){
    const unknown = Object.keys(settings || {}).filter(key => !SIMULATION_SETTING_POLICY[key]);
    if (unknown.length){
        throw new Error(
            `Unclassified legacy top-level setting(s): ${unknown.sort().join(', ')}`
        );
    }
}

function rootPolicyRows(){
    return Object.entries(ROOT_POLICY)
        .map(([root, info]) => ({ root, ...info }))
        .sort((a, b) => a.root.localeCompare(b.root));
}

module.exports = {
    ROOT_POLICY,
    SIMULATION_SETTING_POLICY,
    SIMULATION_SETTING_KEYS,
    RESOURCE_FIELD_POLICY,
    assertKnownRootPolicy,
    assertKnownSimulationSettingPolicy,
    rootPolicyRows
};
