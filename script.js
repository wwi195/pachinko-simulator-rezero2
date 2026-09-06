'use strict';

const game = {
  state: 'normal_idle',
  mode: 'normal',
  spinRate: DEFAULT_SPIN_RATE,
  enzokuConfidence: DEFAULT_ENZOKU_CONFIDENCE,
  mochiDama: 0,
  toushi: 0,
  totalSpins: 0,
  currentSpins: 0,
  lastHitSpins: 0,
  normalHitCounts: { rushEntry: 0, single: 0 },
  totalRushHits: 0,
  allRushStats: { rushTotalSpins: 0, big: 0, mid: 0, small: 0 },
  rush: null,
  rushCycleSpins: 0,
  rushEntryBonus: null,
  pending: {},
  eigyoAlertShown: false,
  log: [],
};

function addLog(text, type = '') {
  game.log.unshift({ text, type });
  if (game.log.length > 50) game.log.pop();
  renderLog();
}

// ---- 球数・投資 ----

function consumeSpinCost() {
  const cost = calcSpinCost(game.spinRate);
  if (game.mochiDama >= cost) {
    game.mochiDama -= cost;
  } else {
    const shortfall = cost - game.mochiDama;
    game.mochiDama = 0;
    const units = Math.ceil(shortfall / 250);
    game.toushi   += units * 1000;
    game.mochiDama = units * 250 - shortfall;
  }
}

function addBalls(n) {
  game.mochiDama += n;
}

function handleSpinRateChange(value) {
  game.spinRate = Number(value);
  render();
}

function handleEnzokuConfidenceChange(value) {
  game.enzokuConfidence = Number(value);
  render();
}

// ---- 通常時ハンドラ ----

function checkEigyoAlert() {
  if (!game.eigyoAlertShown && game.totalSpins >= 2000) {
    game.eigyoAlertShown = true;
    setState('eigyo_alert');
    return true;
  }
  return false;
}

// 1回転処理。演出発生など画面遷移が起きたら true を返す
function runNormalSpin() {
  game.totalSpins++;
  game.currentSpins++;
  consumeSpinCost();
  const result = spinNormal(game.enzokuConfidence);
  const interval = game.totalSpins - game.lastHitSpins;

  if (result === 'hit' || result === 'false_enzoku') {
    game.pending = { type: result, interval };
    addLog(`${interval}回転で先バレ発生！`);
    setState('enzoku');
    return true;
  }
  return false;
}

function resolveNormalHit(interval) {
  game.currentSpins = 0;
  game.lastHitSpins = game.totalSpins;
  addBalls(NORMAL_HIT_ACTUAL);
  game.pending = { interval };
  addLog(`${interval}回転で${NORMAL_HIT_NOMINAL}大当たり ＋${NORMAL_HIT_ACTUAL}球`, 'win');
  setState('normal_hit_result');
}

function handleStart() {
  if (checkEigyoAlert()) return;
  if (!runNormalSpin()) {
    setState('lose_result');
  }
}

function autoSpin(count) {
  for (let i = 0; i < count; i++) {
    if (checkEigyoAlert()) return;
    if (runNormalSpin()) return;
  }
  setState('normal_idle');
}

function handleEnzokuJudge() {
  if (game.pending.type === 'hit') {
    resolveNormalHit(game.pending.interval);
  } else {
    addLog('はずれ');
    setState('lose_result');
  }
}

function backToNormal() {
  game.mode = 'normal';
  setState('normal_idle');
}

function handleNormalHitContinue() {
  setState('rush_entry_challenge');
}

function handleRushEntryJudge() {
  if (rollRushEntry()) {
    game.normalHitCounts.rushEntry++;
    enterRush({ label: '初当たり', nominal: NORMAL_HIT_NOMINAL, actual: NORMAL_HIT_ACTUAL });
    addLog('RUSH突入！', 'rush');
    setState('rush_entry_win');
  } else {
    game.normalHitCounts.single++;
    addLog('RUSH突入ならず…');
    setState('rush_entry_lose');
  }
}

function handleAfterRushEntry() {
  setState(game.mode === 'rush' ? 'rush_idle' : 'normal_idle');
}

function enterRush(entryBonus = null) {
  game.mode = 'rush';
  game.rush = createRushState();
  game.rushCycleSpins = 0;
  game.rushEntryBonus = entryBonus;
}

// ---- RUSH(ST)中ハンドラ ----

// 1回転処理。画面遷移が起きたら true を返す
function runRushSpin(opts = {}) {
  game.allRushStats.rushTotalSpins++;
  game.rushCycleSpins++;
  const { rushState, outcome } = applyRushSpin(game.rush);
  game.rush = rushState;

  if (outcome === 'miss') {
    if (!opts.silent) {
      addLog(`ST残り${rushState.stRemaining}回`);
      setState('rush_miss');
      return true;
    }
    return false;
  }

  if (outcome === 'st_end') {
    addLog('ST終了 → RUSHリザルトへ');
    setState('rush_result');
    return true;
  }

  const hitType = outcome.replace('hit_', '');
  const { nominal, actual } = RUSH_HIT_TYPES[hitType];
  game.totalRushHits++;
  game.allRushStats[hitType]++;
  addBalls(actual);
  game.pending = { hitType, nominal, actual, spinsThisCycle: game.rushCycleSpins };
  game.rushCycleSpins = 0;
  addLog(`${nominal}個！ ＋${actual}球 (${rushState.chainCount}連)`, 'rush');
  setState('rush_hit_result');
  return true;
}

function handleRushSpin() {
  runRushSpin();
}

function handleRushSpin10() {
  for (let i = 0; i < 10; i++) {
    if (runRushSpin({ silent: true })) return;
  }
  setState('rush_idle');
}

function handleRushSkip() {
  for (;;) {
    if (runRushSpin({ silent: true })) return;
    if (game.rush.stRemaining <= 10) {
      setState('rush_idle');
      return;
    }
  }
}

function handleRushHitContinue() {
  setState('rush_idle');
}

function handleRushMissContinue() {
  setState('rush_idle');
}

function handleRushResultEnd() {
  addLog('RUSH終了 → 通常時へ');
  game.mode = 'normal';
  game.rush = null;
  game.rushCycleSpins = 0;
  game.rushEntryBonus = null;
  setState('normal_idle');
}

// ---- 営業終了・退店 ----

function handleEigyoHai() {
  setState(game.mode === 'rush' ? 'rush_idle' : 'normal_idle');
}

function handleEigyoIie() {
  setState('taiten_result');
}

function handleTaiten() {
  setState('taiten_result');
}

function resetGame() {
  game.state           = 'normal_idle';
  game.mode            = 'normal';
  game.spinRate        = DEFAULT_SPIN_RATE;
  game.enzokuConfidence = DEFAULT_ENZOKU_CONFIDENCE;
  game.mochiDama       = 0;
  game.toushi          = 0;
  game.totalSpins      = 0;
  game.currentSpins    = 0;
  game.lastHitSpins    = 0;
  game.normalHitCounts = { rushEntry: 0, single: 0 };
  game.totalRushHits   = 0;
  game.allRushStats    = { rushTotalSpins: 0, big: 0, mid: 0, small: 0 };
  game.rush            = null;
  game.rushCycleSpins  = 0;
  game.rushEntryBonus  = null;
  game.pending         = {};
  game.eigyoAlertShown = false;
  game.log             = [];
  render();
}

// ---- 状態セット & レンダリング ----

function setState(state) {
  game.state = state;
  render();
}

function render() {
  renderHeader();
  renderModeBadge();
  renderMainScreen();
  renderRushStats();
}

function renderHeader() {
  const mochiInt = Math.floor(game.mochiDama);
  document.getElementById('mochi-dama').textContent   = mochiInt.toLocaleString();
  document.getElementById('toushi-value').textContent = game.toushi.toLocaleString();

  const shuushi   = mochiInt * 4 - game.toushi;
  const shuushiEl = document.getElementById('shuushi-value');
  shuushiEl.textContent = (shuushi >= 0 ? '+' : '') + shuushi.toLocaleString();
  shuushiEl.className   = 'money-value ' + (shuushi >= 0 ? 'green' : 'red');
  document.getElementById('current-spins').textContent = game.currentSpins.toLocaleString();
  document.getElementById('total-spins-disp').textContent = game.totalSpins.toLocaleString();

  const rushCountEl = document.getElementById('rush-count');
  rushCountEl.textContent = game.mode === 'rush' ? `${game.rush.stRemaining}回` : '－';

  const rushEntries = game.normalHitCounts.rushEntry;
  const singles     = game.normalHitCounts.single;
  const normalHits  = rushEntries + singles;

  document.getElementById('rush-entry-count').textContent = rushEntries + '回';
  document.getElementById('rush-entry-rate').textContent =
    normalHits > 0 ? `(突入率${Math.round((rushEntries / normalHits) * 100)}%)` : '(突入率―%)';
  document.getElementById('single-count').textContent = singles + '回';

  const grandTotal = normalHits + game.totalRushHits;
  document.getElementById('total-hit-count').textContent = grandTotal + '回';

  document.getElementById('normal-first-hit').textContent  = normalHits + '回';
  document.getElementById('normal-first-prob').textContent = normalHits > 0 && game.totalSpins > 0
    ? '1/' + Math.round(game.totalSpins / normalHits).toLocaleString()
    : '1/―';

  document.getElementById('fee-block').textContent = `${game.spinRate}回転/千円`;
}

function renderModeBadge() {
  const el = document.getElementById('mode-badge');
  if (game.mode === 'rush') {
    el.textContent = 'RUSH中';
    el.className = 'rush';
  } else {
    el.textContent = '通常時';
    el.className = '';
  }
}

function renderMainScreen() {
  document.getElementById('main-screen').innerHTML = buildScreen(game.state);
}

function spinRateOptionsHtml() {
  return SPIN_RATE_OPTIONS.map(rate =>
    `<option value="${rate}" ${rate === game.spinRate ? 'selected' : ''}>${rate}回転</option>`
  ).join('');
}

function tenThousandYenSpins() {
  return game.spinRate * 10;
}

function enzokuConfidenceOptionsHtml() {
  return ENZOKU_CONFIDENCE_OPTIONS.map(pct =>
    `<option value="${pct}" ${pct === game.enzokuConfidence ? 'selected' : ''}>${pct}%</option>`
  ).join('');
}

function buildNormalIdleScreen(interactive) {
  const startAttr  = interactive ? ' onclick="handleStart()"' : '';
  const confAttr   = interactive ? ' onchange="handleEnzokuConfidenceChange(this.value)"' : '';
  const rateAttr   = interactive ? ' onchange="handleSpinRateChange(this.value)"' : '';
  const spinAttr   = interactive ? ` onclick="autoSpin(${tenThousandYenSpins()})"` : '';
  const taitenAttr = interactive ? ' onclick="handleTaiten()"' : '';
  return `<div class="screen">
    <button class="btn-start"${startAttr}>START</button>
    <p class="prob-hint">大当たり確率 1/349.9</p>
    <div class="spin-rate-block">
      <span class="spin-rate-label">先バレ信頼度</span>
      <select class="spin-rate-select"${confAttr}>
        ${enzokuConfidenceOptionsHtml()}
      </select>
    </div>
    <div class="spin-rate-block">
      <span class="spin-rate-label">1000円あたりの回転数</span>
      <select class="spin-rate-select"${rateAttr}>
        ${spinRateOptionsHtml()}
      </select>
    </div>
    <div class="auto-spin-btns">
      <div class="auto-spin-wrap">
        <button class="btn-auto"${spinAttr}>1万円分回す</button>
        <p class="spin-cost-hint">約${tenThousandYenSpins()}回転分</p>
      </div>
    </div>
    <button class="btn-taiten"${taitenAttr}>退店する</button>
  </div>`;
}

function buildScreen(state) {
  switch (state) {

    case 'normal_idle':
      return buildNormalIdleScreen(true);

    case 'enzoku':
      return `<div class="screen">
        <p class="enzoku-label">${game.pending.interval}回転　先バレ発生！</p>
        <p class="shinraido">信頼度 ${game.enzokuConfidence}%</p>
        <button class="btn-action" onclick="handleEnzokuJudge()">▶ 判定に進む</button>
      </div>`;

    case 'lose_result':
      return `<div class="screen">
        <p class="result-main lose">はずれ</p>
        <button class="btn-sub" onclick="backToNormal()" style="margin-top:8px;">続ける</button>
      </div>`;

    case 'normal_hit_result':
      return `<div class="screen">
        <div class="vibun-box">
          <p class="bonus-main standard">${NORMAL_HIT_NOMINAL}大当たり</p>
          <p class="bonus-sub">＋${NORMAL_HIT_ACTUAL.toLocaleString()}球獲得</p>
        </div>
        <button class="btn-action" onclick="handleNormalHitContinue()">▶ RUSH突入ジャッジへ</button>
      </div>`;

    case 'rush_entry_challenge':
      return `<div class="screen">
        <p class="add-rush-title">RUSH突入ジャッジ！</p>
        <p class="result-sub">成功率 ${Math.round(P_RUSH_ENTRY * 100)}%</p>
        <button class="btn-action" onclick="handleRushEntryJudge()">▶ 判定</button>
      </div>`;

    case 'rush_entry_win':
      return `<div class="screen">
        <p class="add-rush-title">RUSH突入！</p>
        <p class="rush-sub">ST${RUSH_ST_COUNT}回スタート</p>
        <button class="btn-action" onclick="handleAfterRushEntry()">▶ RUSHへ</button>
      </div>`;

    case 'rush_entry_lose':
      return `<div class="screen">
        <p class="result-main lose" style="font-size:26px;">RUSH突入ならず…</p>
        <button class="btn-sub" onclick="handleAfterRushEntry()" style="margin-top:12px;">続ける</button>
      </div>`;

    case 'rush_idle': {
      const skipDisabled = game.rush.stRemaining <= 10;
      return `<div class="screen">
        <p class="chain-label">${game.rush.chainCount}連チャン中</p>
        <p class="rush-title">Re:ゼロ RUSH</p>
        <p class="rush-sub">ST残り <span>${game.rush.stRemaining}</span> 回</p>
        <div class="rush-spin-btns">
          <button class="btn-rush-spin" onclick="handleRushSpin()">1回転</button>
          <button class="btn-rush-spin" onclick="handleRushSpin10()">10回転</button>
          <button class="btn-rush-spin skip" ${skipDisabled ? 'disabled' : 'onclick="handleRushSkip()"'}>スキップ</button>
        </div>
        <p class="prob-hint">大当たり確率 1/99.9</p>
        <button class="btn-taiten" onclick="handleTaiten()">退店する</button>
      </div>`;
    }

    case 'rush_hit_result': {
      const { hitType, nominal, actual, spinsThisCycle } = game.pending;
      const rankClass = hitType === 'big' ? 'premium' : hitType === 'mid' ? 'standard' : 'small';
      return `<div class="screen">
        <p class="result-sub">${spinsThisCycle}回転で当選</p>
        <p class="chain-label">${game.rush.chainCount}連チャン中</p>
        <div class="vibun-box rush-box">
          <p class="bonus-main ${rankClass}">${nominal}個${hitType === 'big' ? '+α' : ''}</p>
          <p class="bonus-sub">＋${actual.toLocaleString()}球獲得</p>
        </div>
        <button class="btn-action" onclick="handleRushHitContinue()" style="margin-top:16px;">
          ▶ RUSH継続へ
        </button>
      </div>`;
    }

    case 'rush_miss':
      return `<div class="screen">
        <p class="result-main lose">外れ</p>
        <p style="color:#7c4dff; font-size:18px; margin-top:4px;">ST残り ${game.rush.stRemaining}回</p>
        <button class="btn-sub" onclick="handleRushMissContinue()" style="margin-top:12px;">続ける</button>
      </div>`;

    case 'rush_result': {
      const s = game.rush;
      const bonus = game.rushEntryBonus;
      const lines = [];
      if (bonus) {
        lines.push(`<div class="result-row">
          <span class="rr-label">初当たり${bonus.nominal}</span>
          <span class="rr-val">×1回</span>
        </div>`);
      }
      if (s.counts.big > 0) {
        lines.push(`<div class="result-row">
          <span class="rr-label">3000+α</span>
          <span class="rr-val">×${s.counts.big}回</span>
        </div>`);
      }
      if (s.counts.mid > 0) {
        lines.push(`<div class="result-row">
          <span class="rr-label">1500</span>
          <span class="rr-val">×${s.counts.mid}回</span>
        </div>`);
      }
      if (s.counts.small > 0) {
        lines.push(`<div class="result-row">
          <span class="rr-label">300</span>
          <span class="rr-val">×${s.counts.small}回</span>
        </div>`);
      }
      if (lines.length === 0) lines.push(`<p style="color:#555; font-size:13px;">大当たりなし</p>`);

      const totalActual  = s.actualBalls  + (bonus ? bonus.actual  : 0);
      const totalNominal = s.nominalBalls + (bonus ? bonus.nominal : 0);
      const totalHits    = s.chainCount + (bonus ? 1 : 0);

      return `<div class="screen">
        <p class="rush-result-title">RUSH リザルト</p>
        <div class="rush-result-box">
          <div class="result-row highlight">
            <span class="rr-label">連チャン数</span>
            <span class="rr-val gold">${totalHits}連チャン</span>
          </div>
          <div class="result-row">
            <span class="rr-label">獲得出玉</span>
            <span class="rr-val gold">${totalActual.toLocaleString()}球</span>
          </div>
          <div class="result-row">
            <span class="rr-label">表示出玉</span>
            <span class="rr-val">${totalNominal.toLocaleString()}個</span>
          </div>
          <hr class="result-hr">
          <p class="rr-section">ボーナス内訳</p>
          ${lines.join('')}
        </div>
        <button class="btn-action" onclick="handleRushResultEnd()" style="margin-top:16px;">▶ 通常へ戻る</button>
      </div>`;
    }

    case 'eigyo_alert':
      return `<div class="screen">
        <p style="font-size:22px; font-weight:bold; color:#7c4dff; text-align:center; line-height:1.6;">
          営業時間終了になりました
        </p>
        <p style="font-size:16px; color:#666; text-align:center;">このまま居座り続けますか？</p>
        <div style="display:flex; gap:16px; margin-top:8px;">
          <button class="btn-action" style="flex:1;" onclick="handleEigyoHai()">はい</button>
          <button class="btn-action" style="flex:1; background:linear-gradient(135deg,#999,#666); border-color:#ccc;"
            onclick="handleEigyoIie()">いいえ</button>
        </div>
      </div>`;

    case 'taiten_result': {
      const mochi    = Math.floor(game.mochiDama);
      const mochiYen = mochi * 4;
      const shuushi  = mochiYen - game.toushi;
      const shuushiColor = shuushi >= 0 ? '#2e9e5b' : '#d24141';
      const shuushiSign  = shuushi >= 0 ? '＋' : '';
      return `<div class="screen">
        <p style="font-size:24px; font-weight:bold; color:#666;">退店します</p>
        <div class="rush-result-box" style="max-width:320px;">
          <p class="rr-section" style="margin-bottom:8px;">収支発表</p>
          <div class="result-row">
            <span class="rr-label">総回転数</span>
            <span class="rr-val">${game.totalSpins.toLocaleString()}回</span>
          </div>
          <div class="result-row">
            <span class="rr-label">投資金額</span>
            <span class="rr-val" style="color:#d24141;">${game.toushi.toLocaleString()}円</span>
          </div>
          <div class="result-row">
            <span class="rr-label">持ち球換算</span>
            <span class="rr-val">${mochiYen.toLocaleString()}円</span>
          </div>
          <hr class="result-hr">
          <div class="result-row highlight">
            <span class="rr-label" style="font-weight:bold;">収支</span>
            <span class="rr-val" style="color:${shuushiColor}; font-size:22px;">
              ${shuushiSign}${shuushi.toLocaleString()}円
            </span>
          </div>
          <hr class="result-hr">
          <div class="result-row">
            <span class="rr-label">RUSH突入</span>
            <span class="rr-val">${game.normalHitCounts.rushEntry}回</span>
          </div>
          <div class="result-row">
            <span class="rr-label">単発</span>
            <span class="rr-val">${game.normalHitCounts.single}回</span>
          </div>
          <div class="result-row">
            <span class="rr-label">RUSH大当たり</span>
            <span class="rr-val">${game.totalRushHits}回</span>
          </div>
        </div>
        <button class="btn-action" onclick="resetGame()" style="margin-top:8px;">▶ 最初の画面に戻る</button>
      </div>`;
    }

    default:
      return `<div class="screen"><p>...</p></div>`;
  }
}

function renderRushStats() {
  const a     = game.allRushStats;
  const hits  = game.totalRushHits;
  const spins = a.rushTotalSpins;
  const prob  = hits > 0 && spins > 0
    ? '1/' + (spins / hits).toFixed(1)
    : '1/―';
  document.getElementById('rs-chain').textContent = hits + '回';
  document.getElementById('rs-prob').textContent  = prob;
  document.getElementById('rs-spins').textContent = spins + '回';
  document.getElementById('rs-big').textContent   = a.big + '回';
  document.getElementById('rs-mid').textContent   = a.mid + '回';
  document.getElementById('rs-small').textContent = a.small + '回';
}

function renderLog() {
  const el = document.getElementById('log-list');
  el.innerHTML = game.log.map(item =>
    `<div class="log-item ${item.type}">${item.text}</div>`
  ).join('');
}

render();
