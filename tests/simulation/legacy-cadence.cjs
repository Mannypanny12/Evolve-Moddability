'use strict';

const legacyBase = require('../fixtures/legacy-base.json');

const frozen = legacyBase.harness.cadence;
const representativeCatchUpJitterMs = 500;

const LEGACY_CADENCE = Object.freeze({
    mainPeriodMs: frozen.mainMs,
    midRatio: frozen.midRatio,
    longRatio: frozen.longRatio,
    fastOnlyPeriods: 1,
    representativeCatchUpJitterMs,
    representativeCatchUpPeriods:
        1 + Math.floor(representativeCatchUpJitterMs / frozen.mainMs),
    firstMidPeriods: frozen.midRatio,
    firstLongPeriods: frozen.longRatio
});

module.exports = { LEGACY_CADENCE };
