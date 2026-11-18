'use strict';

const SPIN_RATE_OPTIONS = [14, 16, 18, 20];
const DEFAULT_SPIN_RATE = 16;

function calcSpinCost(spinRate) {
  return 250 / spinRate;
}

// ---- 通常時 ----

const P_HIT = 1 / 349.9;

const ENZOKU_CONFIDENCE = 40;

function falseEnzokuProbability() {
  return P_HIT * ((100 - ENZOKU_CONFIDENCE) / ENZOKU_CONFIDENCE);
}

// n回転目で当たった時の出現率
// 深いハマり: n回転以上かかる確率 = (1-p)^(n-1)
// 早い当たり: n回転以内に当たる確率 = 1-(1-p)^n
function hitIntervalProbability(n) {
  return {
    atLeast: Math.pow(1 - P_HIT, n - 1),
    within: 1 - Math.pow(1 - P_HIT, n),
  };
}

// 先バレがn回連続ではずれる確率 = (1 - 信頼度)^n
function enzokuMissStreakProbability(n) {
  return Math.pow(1 - ENZOKU_CONFIDENCE / 100, n);
}

// 先バレのみのシンプルな予告方式。本物の当たり(P_HIT)と、外れなのに先バレが
// 出る偽陽性(falseEnzokuProbability)の合算が「先バレ発生率」となり、その中で
// 本物が占める割合が信頼度(固定40%)と一致する。
function spinNormal() {
  if (Math.random() < P_HIT) return 'hit';
  if (Math.random() < falseEnzokuProbability()) return 'false_enzoku';
  return 'miss';
}

const NORMAL_HIT_NOMINAL = 1500;
const NORMAL_HIT_ACTUAL = 1400;

// 通常時の当たりは常に1500大当たり。RUSH突入するかどうかは、その1500ボーナス
// 中に別途ジャッジ(55%)で決まる。
const P_RUSH_ENTRY = 0.55;

function rollRushEntry() {
  return Math.random() < P_RUSH_ENTRY;
}

function rollWeighted(table, order) {
  const r = Math.random();
  let cumulative = 0;
  for (const key of order) {
    cumulative += table[key].weight;
    if (r < cumulative) return key;
  }
  return order[order.length - 1];
}

// ---- 上乗せチェーン ----
// bigヒット時、および初当たりでRUSH突入に成功した時の2ブロック目に続けて、
// 25%を引き続ける限り無限にADDON_ACTUALが上乗せされる仕組み。

const P_ADDON_CONTINUE = 0.25;
const ADDON_NOMINAL = 1500;
const ADDON_ACTUAL = 1400;

function rollAddOn() {
  return Math.random() < P_ADDON_CONTINUE;
}

// 上乗せをn回連続で引く確率 = 0.25^n
function addOnStreakProbability(n) {
  return Math.pow(P_ADDON_CONTINUE, n);
}

// 上乗せ当選時、カウントダウン(3→2→1→0)のどのタイミングで発生するかの振り分け
const ADDON_TIMING_WEIGHTS = {
  3: { weight: 0.05 },
  2: { weight: 0.15 },
  1: { weight: 0.30 },
  0: { weight: 0.50 },
};
const ADDON_TIMING_ORDER = [3, 2, 1, 0];

function rollAddOnTiming() {
  return rollWeighted(ADDON_TIMING_WEIGHTS, ADDON_TIMING_ORDER);
}

// ---- RUSH(ST)中 ----

const P_RUSH = 1 / 99.9;
const RUSH_ST_COUNT = 145;

function spinRush() {
  return Math.random() < P_RUSH ? 'hit' : 'miss';
}

// ST145回転中に1回以上当選する確率（約76.7%）
const P_ST_HIT = 1 - Math.pow(1 - P_RUSH, RUSH_ST_COUNT);

// RUSH中の当選回数(rushHits)に対する分布。
// exact: ちょうどその回数で終わる確率 = p^k × (1-p)
// atLeast: その回数以上に到達する確率 = p^k
function chainProbability(rushHits) {
  const atLeast = Math.pow(P_ST_HIT, rushHits);
  return { exact: atLeast * (1 - P_ST_HIT), atLeast };
}

const RUSH_HIT_TYPES = {
  big:   { weight: 0.25, nominal: 3000, actual: 2800 },
  mid:   { weight: 0.55, nominal: 1500, actual: 1400 },
  small: { weight: 0.20, nominal: 300,  actual: 280 },
};
const RUSH_HIT_TYPE_ORDER = ['big', 'mid', 'small'];

function rollRushHitType() {
  return rollWeighted(RUSH_HIT_TYPES, RUSH_HIT_TYPE_ORDER);
}

function createRushState() {
  return {
    stRemaining: RUSH_ST_COUNT,
    chainCount: 0,
    counts: { big: 0, mid: 0, small: 0 },
    actualBalls: 0,
    nominalBalls: 0,
  };
}

function applyRushSpin(rushState) {
  const result = spinRush();
  const stRemaining = rushState.stRemaining - 1;

  if (result === 'miss') {
    if (stRemaining <= 0) {
      return { rushState: { ...rushState, stRemaining: 0 }, outcome: 'st_end' };
    }
    return { rushState: { ...rushState, stRemaining }, outcome: 'miss' };
  }

  const hitType = rollRushHitType();
  const { nominal, actual } = RUSH_HIT_TYPES[hitType];

  const newState = {
    stRemaining: RUSH_ST_COUNT,
    chainCount: rushState.chainCount + 1,
    counts: { ...rushState.counts, [hitType]: rushState.counts[hitType] + 1 },
    actualBalls: rushState.actualBalls + actual,
    nominalBalls: rushState.nominalBalls + nominal,
  };

  return { rushState: newState, outcome: 'hit_' + hitType };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SPIN_RATE_OPTIONS,
    DEFAULT_SPIN_RATE,
    calcSpinCost,
    P_HIT,
    ENZOKU_CONFIDENCE,
    falseEnzokuProbability,
    hitIntervalProbability,
    enzokuMissStreakProbability,
    spinNormal,
    NORMAL_HIT_NOMINAL,
    NORMAL_HIT_ACTUAL,
    P_RUSH_ENTRY,
    rollRushEntry,
    P_ADDON_CONTINUE,
    ADDON_NOMINAL,
    ADDON_ACTUAL,
    rollAddOn,
    addOnStreakProbability,
    ADDON_TIMING_WEIGHTS,
    ADDON_TIMING_ORDER,
    rollAddOnTiming,
    P_RUSH,
    RUSH_ST_COUNT,
    spinRush,
    P_ST_HIT,
    chainProbability,
    RUSH_HIT_TYPES,
    RUSH_HIT_TYPE_ORDER,
    rollRushHitType,
    createRushState,
    applyRushSpin,
  };
}
