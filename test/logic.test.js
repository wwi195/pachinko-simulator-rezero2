'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../logic.js');

function withMockRandom(values, fn) {
  const original = Math.random;
  let i = 0;
  Math.random = () => values[Math.min(i++, values.length - 1)];
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

test('SPIN_RATE_OPTIONS lists the four selectable rates with 16 as default', () => {
  assert.deepEqual(logic.SPIN_RATE_OPTIONS, [14, 16, 18, 20]);
  assert.equal(logic.DEFAULT_SPIN_RATE, 16);
});

test('calcSpinCost returns balls-per-spin for a given spins-per-1000-yen rate', () => {
  assert.equal(logic.calcSpinCost(16), 250 / 16);
  assert.equal(logic.calcSpinCost(14), 250 / 14);
});

test('P_HIT is 1/349.9', () => {
  assert.equal(logic.P_HIT, 1 / 349.9);
});

test('spinNormal picks a preview color first, then rolls that color\'s own confidence for the win', () => {
  // draw 0 picks the first tier in PREVIEW_TIER_ORDER (white); draw 0 on the
  // second roll beats any confidence, so it is a win
  const result = withMockRandom([0, 0], () => logic.spinNormal());
  assert.equal(result.color, 'white');
  assert.equal(result.isWin, true);
});

test('spinNormal reports a miss when the second draw exceeds the picked color\'s confidence', () => {
  const result = withMockRandom([0, 0.999], () => logic.spinNormal());
  assert.equal(result.color, 'white');
  assert.equal(result.isWin, false);
});

test('NORMAL_HIT_TYPES defines rushEntry (55%, 3000/2800, entersRush) and single (45%, 1500/1400)', () => {
  assert.deepEqual(logic.NORMAL_HIT_TYPES.rushEntry, { weight: 0.55, nominal: 3000, actual: 2800, entersRush: true });
  assert.deepEqual(logic.NORMAL_HIT_TYPES.single, { weight: 0.45, nominal: 1500, actual: 1400, entersRush: false });
});

test('rollNormalHitType returns rushEntry when draw is under 0.55, single otherwise', () => {
  assert.equal(withMockRandom([0], () => logic.rollNormalHitType()), 'rushEntry');
  assert.equal(withMockRandom([0.999], () => logic.rollNormalHitType()), 'single');
});

test('P_RUSH is 1/99.9 and RUSH_ST_COUNT is 145', () => {
  assert.equal(logic.P_RUSH, 1 / 99.9);
  assert.equal(logic.RUSH_ST_COUNT, 145);
});

test('spinRush returns hit when the draw beats P_RUSH, miss otherwise', () => {
  assert.equal(withMockRandom([0], () => logic.spinRush()), 'hit');
  assert.equal(withMockRandom([0.5], () => logic.spinRush()), 'miss');
});

test('RUSH_HIT_TYPES defines big(25%,3000/2800) mid(55%,1500/1400) small(20%,300/280)', () => {
  assert.deepEqual(logic.RUSH_HIT_TYPES.big,   { weight: 0.25, nominal: 3000, actual: 2800 });
  assert.deepEqual(logic.RUSH_HIT_TYPES.mid,   { weight: 0.55, nominal: 1500, actual: 1400 });
  assert.deepEqual(logic.RUSH_HIT_TYPES.small, { weight: 0.20, nominal: 300,  actual: 280  });
});

test('rollRushHitType picks big/mid/small by cumulative weight order', () => {
  assert.equal(withMockRandom([0],     () => logic.rollRushHitType()), 'big');
  assert.equal(withMockRandom([0.30],  () => logic.rollRushHitType()), 'mid');
  assert.equal(withMockRandom([0.999], () => logic.rollRushHitType()), 'small');
});

test('createRushState starts with 145 ST and zeroed counters', () => {
  assert.deepEqual(logic.createRushState(), {
    stRemaining: 145,
    chainCount: 0,
    counts: { big: 0, mid: 0, small: 0 },
    actualBalls: 0,
    nominalBalls: 0,
  });
});

test('applyRushSpin on a miss decrements stRemaining and reports miss', () => {
  const state = logic.createRushState();
  const { rushState, outcome } = withMockRandom([0.5], () => logic.applyRushSpin(state));
  assert.equal(outcome, 'miss');
  assert.equal(rushState.stRemaining, 144);
});

test('applyRushSpin on the last ST spin with a miss reports st_end', () => {
  const state = { ...logic.createRushState(), stRemaining: 1 };
  const { rushState, outcome } = withMockRandom([0.5], () => logic.applyRushSpin(state));
  assert.equal(outcome, 'st_end');
  assert.equal(rushState.stRemaining, 0);
});

test('applyRushSpin on a hit resets ST to 145, increments chainCount and the matching counter', () => {
  const state = logic.createRushState();
  const { rushState, outcome } = withMockRandom([0, 0], () => logic.applyRushSpin(state));
  assert.equal(outcome, 'hit_big');
  assert.equal(rushState.stRemaining, 145);
  assert.equal(rushState.chainCount, 1);
  assert.equal(rushState.counts.big, 1);
  assert.equal(rushState.actualBalls, 2800);
  assert.equal(rushState.nominalBalls, 3000);
});

test('applyRushSpin on a mid hit adds 1400 actual / 1500 nominal', () => {
  const state = logic.createRushState();
  const { rushState, outcome } = withMockRandom([0, 0.30], () => logic.applyRushSpin(state));
  assert.equal(outcome, 'hit_mid');
  assert.equal(rushState.actualBalls, 1400);
  assert.equal(rushState.nominalBalls, 1500);
});

test('applyRushSpin on a small hit adds 280 actual / 300 nominal', () => {
  const state = logic.createRushState();
  const { rushState, outcome } = withMockRandom([0, 0.999], () => logic.applyRushSpin(state));
  assert.equal(outcome, 'hit_small');
  assert.equal(rushState.actualBalls, 280);
  assert.equal(rushState.nominalBalls, 300);
});

test('PREVIEW_TIER_ORDER lists white, purpleCrystal, purple, red, gold, rainbow with occurrence/confidence', () => {
  assert.deepEqual(logic.PREVIEW_TIER_ORDER, ['white', 'purpleCrystal', 'purple', 'red', 'gold', 'rainbow']);
  assert.equal(logic.PREVIEW_TIERS.rainbow.confidence, 0.98);
  assert.equal(logic.PREVIEW_TIERS.gold.confidence, 0.786);
  assert.equal(logic.PREVIEW_TIERS.red.confidence, 0.503);
  assert.equal(logic.PREVIEW_TIERS.purple.confidence, 0.204);
  assert.equal(logic.PREVIEW_TIERS.purpleCrystal.confidence, 0.07);
});

test('white tier occurrence/confidence are derived so the overall weighted win rate equals P_HIT exactly', () => {
  const total = logic.PREVIEW_TIER_ORDER.reduce(
    (sum, k) => sum + logic.PREVIEW_TIERS[k].occurrence * logic.PREVIEW_TIERS[k].confidence, 0
  );
  assert.ok(Math.abs(total - logic.P_HIT) < 1e-12);
  const occSum = logic.PREVIEW_TIER_ORDER.reduce((sum, k) => sum + logic.PREVIEW_TIERS[k].occurrence, 0);
  assert.ok(Math.abs(occSum - 1) < 1e-12);
});

test('rollPreviewColor picks the first tier whose cumulative occurrence share the draw falls under', () => {
  assert.equal(withMockRandom([0], () => logic.rollPreviewColor()), 'white');
  const afterWhite = logic.PREVIEW_TIERS.white.occurrence + 0.0000001;
  assert.equal(withMockRandom([afterWhite], () => logic.rollPreviewColor()), 'purpleCrystal');
  assert.equal(withMockRandom([0.9999999999], () => logic.rollPreviewColor()), 'rainbow');
});
