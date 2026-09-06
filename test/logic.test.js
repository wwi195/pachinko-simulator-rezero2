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

test('ENZOKU_CONFIDENCE_OPTIONS lists 40%/90% with 40% as default', () => {
  assert.deepEqual(logic.ENZOKU_CONFIDENCE_OPTIONS, [40, 90]);
  assert.equal(logic.DEFAULT_ENZOKU_CONFIDENCE, 40);
});

test('falseEnzokuProbability matches the confidence ratio against P_HIT', () => {
  assert.equal(logic.falseEnzokuProbability(40), logic.P_HIT * (60 / 40));
  assert.equal(logic.falseEnzokuProbability(90), logic.P_HIT * (10 / 90));
});

test('spinNormal returns hit when the first draw beats P_HIT', () => {
  const result = withMockRandom([0], () => logic.spinNormal(40));
  assert.equal(result, 'hit');
});

test('spinNormal returns false_enzoku when only the second draw beats falseEnzokuProbability', () => {
  const result = withMockRandom([0.999, 0], () => logic.spinNormal(40));
  assert.equal(result, 'false_enzoku');
});

test('spinNormal returns miss when every draw is at the high end', () => {
  const result = withMockRandom([0.999, 0.999], () => logic.spinNormal(40));
  assert.equal(result, 'miss');
});

test('spinNormal at 90% confidence needs a much smaller second-draw threshold', () => {
  // false_enzoku probability at 90% confidence is P_HIT/9, far below 0.05
  const result = withMockRandom([0.999, 0.05], () => logic.spinNormal(90));
  assert.equal(result, 'miss');
});

test('NORMAL_HIT_NOMINAL/ACTUAL are 1500/1400', () => {
  assert.equal(logic.NORMAL_HIT_NOMINAL, 1500);
  assert.equal(logic.NORMAL_HIT_ACTUAL, 1400);
});

test('P_RUSH_ENTRY is 55%', () => {
  assert.equal(logic.P_RUSH_ENTRY, 0.55);
});

test('rollRushEntry is true only under P_RUSH_ENTRY (55%)', () => {
  assert.equal(withMockRandom([0], () => logic.rollRushEntry()), true);
  assert.equal(withMockRandom([0.6], () => logic.rollRushEntry()), false);
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
