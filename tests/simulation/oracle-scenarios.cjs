'use strict';

const { LEGACY_CADENCE } = require('./legacy-cadence.cjs');

const oracleScenarios = Object.freeze([
    { key: 'fresh-evolution-p20', fixture: 'fresh-evolution', periods: LEGACY_CADENCE.firstLongPeriods },

    { key: 'early-civilization-human-p1', fixture: 'early-civilization-human', periods: LEGACY_CADENCE.fastOnlyPeriods },
    { key: 'early-civilization-human-p3', fixture: 'early-civilization-human', periods: LEGACY_CADENCE.representativeCatchUpPeriods },
    { key: 'early-civilization-human-p4', fixture: 'early-civilization-human', periods: LEGACY_CADENCE.firstMidPeriods },
    { key: 'early-civilization-human-p20', fixture: 'early-civilization-human', periods: LEGACY_CADENCE.firstLongPeriods },

    { key: 'preindustrial-orc-p20', fixture: 'preindustrial-orc', periods: LEGACY_CADENCE.firstLongPeriods },
    { key: 'industrial-human-queues-p20', fixture: 'industrial-human-queues', periods: LEGACY_CADENCE.firstLongPeriods },
    { key: 'early-space-human-p20', fixture: 'early-space-human', periods: LEGACY_CADENCE.firstLongPeriods },
    { key: 'interstellar-human-p20', fixture: 'interstellar-human', periods: LEGACY_CADENCE.firstLongPeriods },
    { key: 'portal-hell-balorg-p20', fixture: 'portal-hell-balorg', periods: LEGACY_CADENCE.firstLongPeriods },
    { key: 'late-eden-human-p20', fixture: 'late-eden-human', periods: LEGACY_CADENCE.firstLongPeriods },
    { key: 'truepath-tauceti-human-p20', fixture: 'truepath-tauceti-human', periods: LEGACY_CADENCE.firstLongPeriods },
    { key: 'challenge-steelen-run-p20', fixture: 'challenge-steelen-run', periods: LEGACY_CADENCE.firstLongPeriods },
    { key: 'reset-ready-mad-p20', fixture: 'reset-ready-mad', periods: LEGACY_CADENCE.firstLongPeriods },
    { key: 'reset-ready-bioseed-p20', fixture: 'reset-ready-bioseed', periods: LEGACY_CADENCE.firstLongPeriods }
]);

module.exports = { oracleScenarios };
