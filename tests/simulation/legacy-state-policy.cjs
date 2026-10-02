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
    settings:    { mode: 'mixed', category: 'mixed', reason: 'contains both simulation-affecting and presentation-only preferences' },
    special:     { mode: 'include', category: 'gameplay', reason: 'seasonal/special progression flags used by conditions and achievements' },
    custom:      { mode: 'include', category: 'gameplay', reason: 'custom/hybrid race definitions used by gameplay' },
    pillars:     { mode: 'include', category: 'meta', reason: 'pillar progression used by production/mastery calculations' },
    prestige:    { mode: 'include', category: 'meta', reason: 'prestige currencies and persistent progression' },
    govern:      { mode: 'include', category: 'gameplay', reason: 'governor/candidate/policy automation state' },

    lastMsg:     { mode: 'exclude', category: 'presentation', reason: 'message-log history only' },
    sim:         { mode: 'exclude', category: 'runtime', reason: 'temporary simulation/debug flag, not normal authoritative save state' },
    revision:    { mode: 'exclude', category: 'migration', reason: 'obsolete migration marker deleted at current version' },
    beta:        { mode: 'exclude', category: 'migration', reason: 'obsolete migration marker deleted at current version' }
});

const SIMULATION_SETTING_KEYS = Object.freeze([
    'pause',
    'at',
    'boring',
    'qAny'
]);

function assertKnownRootPolicy(state){
    const unknown = Object.keys(state || {}).filter(key => !ROOT_POLICY[key]);
    if (unknown.length){
        throw new Error(
            `Unclassified legacy top-level state root(s): ${unknown.sort().join(', ')}`
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
    SIMULATION_SETTING_KEYS,
    assertKnownRootPolicy,
    rootPolicyRows
};
