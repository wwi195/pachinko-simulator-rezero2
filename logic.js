'use strict';

const SPIN_RATE_OPTIONS = [14, 16, 18, 20];
const DEFAULT_SPIN_RATE = 16;

function calcSpinCost(spinRate) {
  return 250 / spinRate;
}

// ---- 通常時 ----

const P_HIT = 1 / 349.9;

const NORMAL_HIT_TYPES = {
  rushEntry: { weight: 0.55, nominal: 3000, actual: 2800, entersRush: true },
  single:    { weight: 0.45, nominal: 1500, actual: 1400, entersRush: false },
};
const NORMAL_HIT_TYPE_ORDER = ['rushEntry', 'single'];

function rollWeighted(table, order) {
  const r = Math.random();
  let cumulative = 0;
  for (const key of order) {
    cumulative += table[key].weight;
    if (r < cumulative) return key;
  }
  return order[order.length - 1];
}

function rollNormalHitType() {
  return rollWeighted(NORMAL_HIT_TYPES, NORMAL_HIT_TYPE_ORDER);
}

// ---- 保留予告（色）----
// 色ごとに occurrence(全回転中でその色が出る割合)と confidence(その色が出た
// ときの当選率)を独立に持つ。まず occurrence の比率で色を確定し、その後
// confidence を使って当落を引くことで、色ごとの信頼度を厳密に再現する。
// white(予告なし)は残りの occurrence を占め、confidence は全体の当選率が
// ちょうど P_HIT になるよう逆算する。
const COLOR_PREVIEW_TIER_ORDER = ['purpleCrystal', 'purple', 'red', 'gold', 'rainbow'];
const COLOR_PREVIEW_TIERS = {
  purpleCrystal: { label: '紫結晶', occurrence: 0.003884,  confidence: 0.07 },
  purple:        { label: '紫',     occurrence: 0.001333,  confidence: 0.204 },
  red:           { label: '赤',     occurrence: 0.000541,  confidence: 0.503 },
  gold:          { label: '金',     occurrence: 0.000346,  confidence: 0.786 },
  rainbow:       { label: '鬼熱',   occurrence: 0.0002775, confidence: 0.98 },
};

const COLOR_OCCURRENCE_SUM = COLOR_PREVIEW_TIER_ORDER.reduce(
  (sum, key) => sum + COLOR_PREVIEW_TIERS[key].occurrence, 0
);
const COLOR_CONTRIBUTION_SUM = COLOR_PREVIEW_TIER_ORDER.reduce(
  (sum, key) => sum + COLOR_PREVIEW_TIERS[key].occurrence * COLOR_PREVIEW_TIERS[key].confidence, 0
);

const PREVIEW_TIER_ORDER = ['white', ...COLOR_PREVIEW_TIER_ORDER];
const PREVIEW_TIERS = {
  white: {
    label: '通常',
    occurrence: 1 - COLOR_OCCURRENCE_SUM,
    confidence: (P_HIT - COLOR_CONTRIBUTION_SUM) / (1 - COLOR_OCCURRENCE_SUM),
  },
  ...COLOR_PREVIEW_TIERS,
};

function rollPreviewColor() {
  const r = Math.random();
  let cumulative = 0;
  for (const key of PREVIEW_TIER_ORDER) {
    cumulative += PREVIEW_TIERS[key].occurrence;
    if (r < cumulative) return key;
  }
  return PREVIEW_TIER_ORDER[PREVIEW_TIER_ORDER.length - 1];
}

function spinNormal() {
  const color = rollPreviewColor();
  const isWin = Math.random() < PREVIEW_TIERS[color].confidence;
  return { color, isWin };
}

// ---- RUSH(ST)中 ----

const P_RUSH = 1 / 99.9;
const RUSH_ST_COUNT = 145;

function spinRush() {
  return Math.random() < P_RUSH ? 'hit' : 'miss';
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
    spinNormal,
    NORMAL_HIT_TYPES,
    NORMAL_HIT_TYPE_ORDER,
    rollNormalHitType,
    PREVIEW_TIERS,
    PREVIEW_TIER_ORDER,
    rollPreviewColor,
    P_RUSH,
    RUSH_ST_COUNT,
    spinRush,
    RUSH_HIT_TYPES,
    RUSH_HIT_TYPE_ORDER,
    rollRushHitType,
    createRushState,
    applyRushSpin,
  };
}
