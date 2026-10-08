// Counts the real (non-simulated) places / pours / flips the repo bots make, then prices every turn under
// several touch-control schemes: taps, drags, actions and finger travel per turn.
//
//   node research/controls/count-actions.js [--geom <path to geom.json>]
//
// Node built-ins only. Uses the engine through harness.js / bot2.js without changing them; writes only under
// research/controls/ (out/actions-greedy.json, out/actions-bot2.json, REPORT.md).
//
// Counting: E.newState is wrapped so every state it returns goes into a WeakSet; applyPlace / applyPour /
// applyFlip are wrapped and a call is recorded only when its state is in that set AND the original call returned
// a truthy value. Bots also call these on JSON clones of the real state; a WeakSet (never a marker property,
// which the clone would copy) keeps those simulated calls out.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(__dirname, 'out');
const REPORT_FILE = path.join(__dirname, 'REPORT.md');
const SEEDS = 200, FIRST = 50, MAX_TURNS = 300, SEED_PREFIX = 'ctl-';
const VIEW = '390x844', GEOM_RULES = 'default';
const BOTS = ['greedy', 'bot2'];

// Measured earlier on ctl-0..49 with the same rules and turn cap.
const BASELINE = {
  greedy: { avgTurns: 44.4, poursPerTurn: 0.70, zeroPourTurnShare: 0.532, sameSourcePourShare: 0.133 },
  bot2: { avgTurns: 121.8, poursPerTurn: 1.30, zeroPourTurnShare: 0.336, sameSourcePourShare: 0.193 },
};

function argValue(name) {
  const i = process.argv.indexOf(name);
  if (i < 0) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith('--')) { console.error(`${name} needs a value`); process.exit(2); }
  return v;
}
const GEOM_FILE = path.resolve(argValue('--geom') || path.join(OUT_DIR, 'geom.json'));

// ---- engine + bots, with counting wrappers ----
const H = require(path.join(ROOT, 'harness.js'));
const { runBot2 } = require(path.join(ROOT, 'bot2.js'));
const E = H.E;

const realStates = new WeakSet();
let rec = null; // action tokens of the run in progress: 'p<t>' place, '<s>><t>' pour, 'f' flip
const orig = { newState: E.newState, applyPlace: E.applyPlace, applyPour: E.applyPour, applyFlip: E.applyFlip };
E.newState = function () {
  const S = orig.newState.apply(this, arguments);
  if (S && typeof S === 'object') realStates.add(S);
  return S;
};
E.applyPlace = function (S, t) {
  const r = orig.applyPlace.apply(this, arguments);
  if (r && rec && realStates.has(S)) rec.push('p' + t);
  return r;
};
E.applyPour = function (S, s, t) {
  const r = orig.applyPour.apply(this, arguments);
  if (r && rec && realStates.has(S)) rec.push(s + '>' + t);
  return r;
};
E.applyFlip = function (S) {
  const r = orig.applyFlip.apply(this, arguments);
  if (r && rec && realStates.has(S)) rec.push('f');
  return r;
};

function parseTok(tok) {
  if (tok === 'f') return { k: 'f' };
  if (tok[0] === 'p') return { k: 'p', t: +tok.slice(1) };
  const i = tok.indexOf('>');
  return { k: 'm', s: +tok.slice(0, i), t: +tok.slice(i + 1) };
}

// Turn = the actions up to and including one place. Pours after the last place (run ended mid-turn) are tailPours.
function moveStats(actions) {
  const st = { places: 0, pours: 0, flips: 0, zeroPourTurns: 0, sameSource: 0, sourceWasPrevTarget: 0, poursHist: [0, 0, 0, 0, 0, 0, 0], tailPours: 0 };
  let turnPours = 0, lastS = null, lastT = null;
  for (const tok of actions) {
    const a = parseTok(tok);
    if (a.k === 'm') {
      st.pours++; turnPours++;
      if (lastS === a.s) st.sameSource++;
      if (lastT === a.s) st.sourceWasPrevTarget++;
      lastS = a.s; lastT = a.t;
    } else if (a.k === 'f') st.flips++;
    else {
      st.places++; st.poursHist[Math.min(turnPours, 6)]++;
      if (!turnPours) st.zeroPourTurns++;
      turnPours = 0; lastS = lastT = null;
    }
  }
  st.tailPours = turnPours;
  return st;
}

// ---- geometry ----
// Repo-relative path when the file is inside the repo, else absolute; forward slashes either way.
function showPath(f) {
  const r = path.relative(ROOT, f);
  return (r && !r.startsWith('..') && !path.isAbsolute(r) ? r : f).split(path.sep).join('/');
}
// layouts (prefs.tray): piece tray on top, tray below the bottles, tray on top with the bottles low
const TRAY_ORDER = { top: 0, bottom: 1, low: 2 };
const okPt = p => !!p && Number.isFinite(p.cx) && Number.isFinite(p.cy);
const pt = p => ({ cx: +p.cx, cy: +p.cy });
// Top-tray constants measured at 390x844: 6 bottles 51.3 wide, gap 10, row centred in the 390 page (16 px side padding).
function fallbackGeom(n) {
  const W = 390, pad = 16, bw = 51.3, gap = 10, cy = 437.8;
  const x0 = pad + (W - 2 * pad - (n * bw + (n - 1) * gap)) / 2;
  return {
    tray: 'top', source: 'fallback', file: null,
    cup: { cx: 53, cy: 201.5 }, flip: { cx: 107, cy: 209 }, spare: null,
    bottles: Array.from({ length: n }, (_, i) => ({ cx: +(x0 + bw / 2 + i * (bw + gap)).toFixed(2), cy })),
  };
}
function loadGeometry(file, nBottles) {
  const warnings = [], geoms = [];
  let list = null;
  if (!fs.existsSync(file)) warnings.push(`geometry file not found: ${showPath(file)}`);
  else {
    try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { warnings.push(`geometry file unreadable (${e.message}): ${showPath(file)}`); }
    if (list && !Array.isArray(list)) { warnings.push(`geometry file is not an array: ${showPath(file)}`); list = null; }
  }
  for (const e of list || []) {
    if (!e || e.size !== VIEW || e.rules !== GEOM_RULES) continue;
    const tag = `${e.size}/${e.tray}/${e.rules}`;
    let err = null;
    if (!Object.prototype.hasOwnProperty.call(TRAY_ORDER, e.tray)) err = `unknown tray "${e.tray}"`;
    else if (geoms.some(g => g.tray === e.tray)) err = 'duplicate entry, first one kept';
    else if (!okPt(e.cup)) err = 'cup missing';
    else if (!Array.isArray(e.bottles) || e.bottles.length !== nBottles || !e.bottles.every(okPt)) err = `needs exactly ${nBottles} bottle centres`;
    else if (e.flip != null && !okPt(e.flip)) err = 'bad flip';
    else if (e.spare != null && !okPt(e.spare)) err = 'bad spare';
    if (err) { warnings.push(`geometry entry ${tag} skipped: ${err}`); continue; }
    geoms.push({ tray: e.tray, source: 'file', file, cup: pt(e.cup), flip: e.flip ? pt(e.flip) : null, spare: e.spare ? pt(e.spare) : null, bottles: e.bottles.map(pt) });
  }
  if (list && !geoms.length) warnings.push(`no usable ${VIEW} / rules=${GEOM_RULES} entry in ${showPath(file)}`);
  if (!geoms.length) { geoms.push(fallbackGeom(nBottles)); warnings.push('FALLBACK geometry used (top tray constants for 390x844)'); }
  geoms.sort((a, b) => TRAY_ORDER[a.tray] - TRAY_ORDER[b.tray]);
  return { geoms, warnings };
}

// ---- control schemes ----
// Each touch is a point; a drag contributes its start and end point. Travel = sum of straight segments between
// consecutive points (drag paths included). The finger starts each run at the cup. Flip = 1 tap on the flip button.
const SCHEMES = [
  { id: 'classic-taptap', place: 'cup tap + bottle tap (2 taps)', pour: 'source tap + target tap (2 taps)',
    doPlace: (f, g, t) => { f.tap(g.cup); f.tap(f.slot(t)); }, doPour: (f, s, t) => { f.tap(f.slot(s)); f.tap(f.slot(t)); } },
  { id: 'classic-drag', place: 'drag cup -> bottle (1 drag)', pour: 'source tap + target tap (2 taps)',
    doPlace: (f, g, t) => f.drag(g.cup, f.slot(t)), doPour: (f, s, t) => { f.tap(f.slot(s)); f.tap(f.slot(t)); } },
  { id: 'tapPlace-drag', place: 'bottle tap (1 tap)', pour: 'drag source -> target (1 drag)',
    doPlace: (f, g, t) => f.tap(f.slot(t)), doPour: (f, s, t) => f.drag(f.slot(s), f.slot(t)) },
  { id: 'tapPlace-hold', place: 'bottle tap (1 tap)', pour: 'long-press source + target tap (2 actions)',
    doPlace: (f, g, t) => f.tap(f.slot(t)), doPour: (f, s, t) => { f.hold(f.slot(s)); f.tap(f.slot(t)); } },
  { id: 'armed', armed: true, place: 'piece pre-selected each turn; bottle tap (1 tap)', pour: '2 taps; each pour run +1 cup tap before (disarm) and +1 cup tap after (re-arm)',
    doPlace: (f, g, t) => f.tap(f.slot(t)), doPour: (f, s, t) => { f.tap(f.slot(s)); f.tap(f.slot(t)); } },
];

function costRun(actions, g, scheme, nBottles, warn) {
  const c = { taps: 0, holds: 0, drags: 0, travel: 0 };
  let pos = g.cup;
  const move = p => { c.travel += Math.hypot(p.cx - pos.cx, p.cy - pos.cy); pos = p; };
  const f = {
    tap: p => { move(p); c.taps++; },
    hold: p => { move(p); c.taps++; c.holds++; }, // a long-press counts as a tap; holds is the subset
    drag: (a, b) => { move(a); move(b); c.drags++; },
    slot: i => {
      if (i < nBottles) return g.bottles[i];
      if (i === nBottles && g.spare) return g.spare;
      throw new Error(`slot ${i} has no coordinates (tray ${g.tray})`);
    },
  };
  let disarmed = false;
  for (const tok of actions) {
    const a = parseTok(tok);
    if (a.k === 'm') {
      if (scheme.armed && !disarmed) { f.tap(g.cup); disarmed = true; }
      scheme.doPour(f, a.s, a.t);
      continue;
    }
    // End of a pour run: re-arm before the next flip / place (a run that ends the game is never re-armed).
    if (disarmed) { f.tap(g.cup); disarmed = false; }
    if (a.k === 'f') {
      if (g.flip) f.tap(g.flip);
      else { c.taps++; warn(`flip button has no coordinates (tray ${g.tray}); flip taps counted without travel`); }
    } else scheme.doPlace(f, g, a.t);
  }
  c.travel = +c.travel.toFixed(1);
  return c;
}

// ---- simulation ----
function simulate(bot) {
  const run = bot === 'bot2' ? runBot2 : H.runBot;
  const t0 = Date.now(), seeds = [];
  for (let i = 0; i < SEEDS; i++) {
    const seed = SEED_PREFIX + i;
    const rules = E.sanitizeRules(E.DEFAULT_RULES);
    rec = [];
    const S = run(rules, seed, MAX_TURNS, {});
    const actions = rec; rec = null;
    const st = moveStats(actions);
    if (st.places !== S.turn) throw new Error(`${bot} ${seed}: counted ${st.places} places but S.turn = ${S.turn} (wrapper not reached?)`);
    seeds.push({ seed, turns: S.turn, alive: !S.over, overReason: S.overReason || null, score: S.score, ...st, actions });
  }
  return { secs: (Date.now() - t0) / 1000, seeds };
}

const r4 = x => Math.round(x * 1e4) / 1e4;
function aggregate(seeds, geoms) {
  const n = seeds.length, sum = k => seeds.reduce((a, s) => a + s[k], 0);
  const P = sum('places'), R = sum('pours'), F = sum('flips');
  const hist = [0, 0, 0, 0, 0, 0, 0];
  for (const s of seeds) s.poursHist.forEach((v, j) => { hist[j] += v; });
  const schemes = {};
  for (const g of geoms) {
    schemes[g.tray] = {};
    for (const sc of SCHEMES) {
      let taps = 0, holds = 0, drags = 0, travel = 0;
      for (const s of seeds) { const c = s.schemes[g.tray][sc.id]; taps += c.taps; holds += c.holds; drags += c.drags; travel += c.travel; }
      schemes[g.tray][sc.id] = { tapsPerTurn: r4(taps / P), holdsPerTurn: r4(holds / P), dragsPerTurn: r4(drags / P), actionsPerTurn: r4((taps + drags) / P), travelPxPerTurn: r4(travel / P) };
    }
  }
  return {
    seeds: n, avgTurns: r4(sum('turns') / n), aliveAtCap: seeds.filter(s => s.alive).length,
    places: P, pours: R, flips: F, tailPours: sum('tailPours'),
    poursPerTurn: r4(R / P), flipsPerTurn: r4(F / P), zeroPourTurnShare: r4(sum('zeroPourTurns') / P),
    sameSourcePourShare: R ? r4(sum('sameSource') / R) : 0, sourceWasPrevTargetShare: R ? r4(sum('sourceWasPrevTarget') / R) : 0,
    poursPerTurnHist_0_to_6plus: hist.map(v => r4(v / P)),
    schemes,
  };
}
function baselineCheck(bot, a) {
  const b = BASELINE[bot], rows = [];
  const add = (label, exp, got, fmt) => rows.push({ label, expected: fmt(exp), measured: fmt(got), match: fmt(exp) === fmt(got) });
  add('avg turns', b.avgTurns, a.avgTurns, x => x.toFixed(1));
  add('pours/turn', b.poursPerTurn, a.poursPerTurn, x => x.toFixed(2));
  add('zero-pour turns', b.zeroPourTurnShare, a.zeroPourTurnShare, x => (x * 100).toFixed(1) + '%');
  add('same-source consecutive pours', b.sameSourcePourShare, a.sameSourcePourShare, x => (x * 100).toFixed(1) + '%');
  return rows;
}

// ---- markdown ----
const f2 = x => x.toFixed(2), f0 = x => x.toFixed(0), pct = x => (x * 100).toFixed(1) + '%';
const dPct = (x, base) => (x >= base ? '+' : '') + ((x / base - 1) * 100).toFixed(0) + '%';
function table(head, rows, nText = 1) {
  return ['| ' + head.join(' | ') + ' |', '|' + head.map((h, i) => (i < nText ? ' --- ' : ' ---: ')).join('|') + '|']
    .concat(rows.map(r => '| ' + r.join(' | ') + ' |')).join('\n');
}
const trayLabel = g => g.source === 'fallback' ? `${g.tray} [FALLBACK]` : g.tray;
function schemeTable(results, geoms, part) {
  const rows = [];
  for (const bot of BOTS) for (const g of geoms) {
    const S = results[bot].aggregate[part].schemes[g.tray], base = S['classic-taptap'];
    for (const sc of SCHEMES) {
      const x = S[sc.id];
      rows.push([bot, trayLabel(g), sc.id, f2(x.tapsPerTurn), f2(x.holdsPerTurn), f2(x.dragsPerTurn), f2(x.actionsPerTurn),
        sc.id === 'classic-taptap' ? '-' : dPct(x.actionsPerTurn, base.actionsPerTurn), f0(x.travelPxPerTurn),
        sc.id === 'classic-taptap' ? '-' : dPct(x.travelPxPerTurn, base.travelPxPerTurn)]);
    }
  }
  return table(['bot', 'tray', 'scheme', 'taps/turn', '(long-press)', 'drags/turn', 'actions/turn', 'actions vs taptap', 'travel px/turn', 'travel vs taptap'], rows, 3);
}
function statsTable(results, part) {
  return table(['bot', 'seeds', 'avg turns', 'alive@300', 'pours/turn', 'flips/turn', 'zero-pour turns', 'same-source pours', 'pours after last place', 'time (s)'],
    BOTS.map(bot => {
      const a = results[bot].aggregate[part];
      return [bot, String(a.seeds), a.avgTurns.toFixed(1), String(a.aliveAtCap), f2(a.poursPerTurn), f2(a.flipsPerTurn), pct(a.zeroPourTurnShare), pct(a.sameSourcePourShare), String(a.tailPours),
        part === 'all' ? results[bot].secs.toFixed(1) : '-'];
    }));
}
function baselineTable(results) {
  const rows = [];
  for (const bot of BOTS) for (const r of results[bot].baseline) rows.push([bot, r.label, r.expected, r.measured, r.match ? '일치' : '불일치']);
  return table(['bot', '지표', '기준 (이전 측정)', '이번 측정', '결과'], rows, 2);
}
function histTable(results) {
  return table(['bot', 'pour 0', '1', '2', '3', '4', '5', '6+'], BOTS.map(bot => [bot, ...results[bot].aggregate.all.poursPerTurnHist_0_to_6plus.map(pct)]));
}
function geomLines(geoms, warnings) {
  const lines = geoms.map(g => `- ${trayLabel(g)}: source=${g.source === 'file' ? showPath(g.file) : 'fallback 상수'}; ` +
    `cup (${g.cup.cx}, ${g.cup.cy}); flip ${g.flip ? `(${g.flip.cx}, ${g.flip.cy})` : '없음'}; spare ${g.spare ? `(${g.spare.cx}, ${g.spare.cy})` : '없음'}; ` +
    `bottles x = [${g.bottles.map(b => +b.cx.toFixed(1)).join(', ')}], y = [${[...new Set(g.bottles.map(b => +b.cy.toFixed(1)))].join(', ')}]`);
  return lines.concat(warnings.map(w => `- 경고: ${w}`)).join('\n');
}
function observations(results, geoms) {
  const out = [];
  // Schemes that tie at the extreme (same displayed value) are all listed, joined by '='.
  const ext = (S, key, fmt, pick) => {
    const v = pick(...SCHEMES.map(sc => S[sc.id][key]));
    return `${SCHEMES.filter(sc => fmt(S[sc.id][key]) === fmt(v)).map(sc => sc.id).join(' = ')} (${fmt(v)})`;
  };
  for (const bot of BOTS) for (const g of geoms) {
    const S = results[bot].aggregate.all.schemes[g.tray];
    out.push(`- ${bot} / ${trayLabel(g)}: actions/turn 최소 ${ext(S, 'actionsPerTurn', f2, Math.min)}, 최대 ${ext(S, 'actionsPerTurn', f2, Math.max)}; ` +
      `travel px/turn 최소 ${ext(S, 'travelPxPerTurn', f0, Math.min)}, 최대 ${ext(S, 'travelPxPerTurn', f0, Math.max)}`);
  }
  return out.join('\n');
}

const RERUN = 'node research/controls/count-actions.js';
function buildReport(results, geo) {
  const fb = geo.geoms.some(g => g.source === 'fallback');
  const schemeRows = SCHEMES.map(s => [s.id, s.place, s.pour]);
  return `# 조작 방식별 입력 비용 추정 (봇 행동 로그 기반)

> 이 파일은 \`research/controls/count-actions.js\`가 생성한다. 손으로 고치면 재실행 시 덮어쓴다.
${fb ? '\n> **좌표: FALLBACK 사용.** `out/geom.json`에 390x844 / rules=default 항목이 없어 측정해 둔 top 트레이 상수로 계산했다. bottom 트레이 결과는 없다.\n' : ''}
## 방법

- 엔진: \`water-sort-survival.html\`의 engine 스크립트 (\`harness.js\`의 \`E\`). 규칙 \`E.sanitizeRules(E.DEFAULT_RULES)\` (spare=false, flip on, flipLimit=2).
- 봇: greedy = \`harness.js\` \`runBot\`, bot2 = \`bot2.js\` \`runBot2\` (2-ply). opts \`{}\` (spare 광고·부활 없음).
- 시드 \`${SEED_PREFIX}0\`..\`${SEED_PREFIX}${SEEDS - 1}\` (${SEEDS}개), 최대 ${MAX_TURNS}턴. 앞 ${FIRST}개(\`${SEED_PREFIX}0..${FIRST - 1}\`)는 이전 기준선과 비교하려고 따로 집계.
- 실제 행동만 세기: \`E.newState\`를 감싸 반환된 상태 객체를 \`WeakSet\`에 등록하고, \`applyPlace\` / \`applyPour\` / \`applyFlip\`은 상태가 그 집합에 있고 원래 반환값이 truthy인 호출만 기록한다. 봇이 \`JSON.parse(JSON.stringify(S))\` 클론에서 하는 시뮬레이션 호출은 클론이 집합에 없어서 빠진다 (속성 표시는 클론에 복사되므로 쓰지 않음). 검증: 시드마다 기록된 place 수 = \`S.turn\`.
- 행동 순서를 그대로 저장 (\`p<t>\` = 병 t에 놓기, \`<s>><t>\` = s에서 t로 붓기, \`f\` = 뒤집기). JSON의 \`perSeed[].actions\`.
- 턴 = place 1회로 끝나는 행동 묶음 (그 턴의 pour, flip 포함). 모든 \`/turn\` 값은 (전체 합) / (전체 place 수). 게임오버 직전 place 없이 끝난 pour(표의 "pours after last place")는 분자에만 들어간다.
- 손가락 이동거리: 터치 지점을 순서대로 이은 직선 거리의 합. 탭은 한 점, 드래그는 시작점과 끝점 (드래그 경로 포함). 매 판 컵에서 시작. 병은 중심 좌표를 누른다고 가정. 단위 CSS px.

### 조작 방식

${table(['scheme', 'place', 'pour'], schemeRows, 3)}

- 공통: flip = flip 버튼 1탭. 봇은 flip을 항상 그 턴의 pour 다음, place 직전에 한다.
- armed: 연속된 pour 묶음마다 앞에 컵 1탭(선택 해제), 묶음이 끝나면 다음 flip/place 전에 컵 1탭(재선택). 게임이 pour 도중 끝나면 재선택 탭은 없다.
- tapPlace-hold: long-press는 taps에 포함하고 \`(long-press)\` 열에 따로 표시. actions = taps + drags.

### 좌표 (${VIEW}, rules=${GEOM_RULES})

${geomLines(geo.geoms, geo.warnings)}

## 기준선 비교 (${SEED_PREFIX}0..${FIRST - 1})

${baselineTable(results)}

## 결과: ${SEEDS} 시드

${statsTable(results, 'all')}

턴당 pour 수 분포:

${histTable(results)}

${schemeTable(results, geo.geoms, 'all')}

## 결과: ${SEED_PREFIX}0..${FIRST - 1}

${statsTable(results, 'first50')}

${schemeTable(results, geo.geoms, 'first50')}

## 관찰 (${SEEDS} 시드)

${observations(results, geo.geoms)}

## 주의

- 봇은 실수, 탐색용 pour, 되돌리기(undo)를 하지 않는다. 잘못 누른 탭, 선택 취소, 다시 고르기도 없다. 실제 사람의 입력 수와 이동거리는 이 값보다 크다 (하한으로 읽을 것).
- greedy는 일찍 죽고 pour가 적다 (초보 쪽), bot2는 오래 살고 pour가 많다 (숙련자 쪽). 사람은 그 사이 어딘가이며 방식 간 순위는 pour 비율에 따라 달라진다.
- 탭, 드래그, long-press를 모두 1 action으로 센다. 드래그 시간, long-press 대기 시간, 정확도 차이는 반영하지 않았다.
- 이동거리는 한 손가락, 직선 이동 가정. 엄지 두 개 사용이나 손가락을 떼고 쉬는 시간은 반영하지 않았다.
- 기본 규칙은 spare=false라 spare 컵 pour는 나오지 않는다.

## 재실행

\`\`\`
cd ${ROOT.replace(/\\/g, '/')}
${RERUN}
${RERUN} --geom <다른 geom.json 경로>
\`\`\`

산출물: \`research/controls/out/actions-greedy.json\`, \`research/controls/out/actions-bot2.json\`, 이 파일.
`;
}

// ---- main ----
function main() {
  const nBottles = E.sanitizeRules(E.DEFAULT_RULES).bottles;
  const geo = loadGeometry(GEOM_FILE, nBottles);
  const runWarnings = new Set();
  const warn = m => runWarnings.add(m);
  const results = {};
  for (const bot of BOTS) {
    const sim = simulate(bot);
    for (const s of sim.seeds) {
      s.schemes = {};
      for (const g of geo.geoms) {
        s.schemes[g.tray] = {};
        for (const sc of SCHEMES) s.schemes[g.tray][sc.id] = costRun(s.actions, g, sc, nBottles, warn);
      }
    }
    const agg = { all: aggregate(sim.seeds, geo.geoms), first50: aggregate(sim.seeds.slice(0, FIRST), geo.geoms) };
    results[bot] = { secs: sim.secs, aggregate: agg, baseline: baselineCheck(bot, agg.first50), seeds: sim.seeds };
    console.error(`${bot}: ${SEEDS} seeds x ${MAX_TURNS} turns in ${sim.secs.toFixed(1)}s`);
  }
  const warnings = geo.warnings.concat([...runWarnings]);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const bot of BOTS) {
    const r = results[bot];
    const json = {
      bot, generatedAt: new Date().toISOString(), script: 'research/controls/count-actions.js',
      rules: E.sanitizeRules(E.DEFAULT_RULES), seedPrefix: SEED_PREFIX, seeds: SEEDS, firstSubset: FIRST, maxTurns: MAX_TURNS, secs: r.secs,
      geometry: geo.geoms.map(g => ({ ...g, file: g.file ? showPath(g.file) : null })), warnings,
      actionEncoding: "space-separated, in order: 'p<t>' place into bottle t; '<s>><t>' pour slot s into slot t (slot = bottle count is the spare cup); 'f' flip",
      schemes: SCHEMES.map(s => ({ id: s.id, place: s.place, pour: s.pour, flip: 'flip button tap (1 tap)' })),
      perTurnNote: 'all */turn values are totals divided by total places (= total turns); pours after the last place count in totals only',
      baseline: { subset: `${SEED_PREFIX}0..${FIRST - 1}`, rows: r.baseline },
      aggregate: r.aggregate,
      perSeed: r.seeds.map(s => ({ ...s, actions: s.actions.join(' ') })),
    };
    fs.writeFileSync(path.join(OUT_DIR, `actions-${bot}.json`), JSON.stringify(json, null, 1) + '\n');
  }
  fs.writeFileSync(REPORT_FILE, buildReport(results, { geoms: geo.geoms, warnings }));

  console.log(`## Geometry (${VIEW}, rules=${GEOM_RULES})\n\n${geomLines(geo.geoms, warnings)}\n`);
  console.log(`## Baseline check (${SEED_PREFIX}0..${FIRST - 1})\n\n${baselineTable(results)}\n`);
  console.log(`## ${SEEDS} seeds\n\n${statsTable(results, 'all')}\n\n${schemeTable(results, geo.geoms, 'all')}\n`);
  console.log(`## ${SEED_PREFIX}0..${FIRST - 1}\n\n${statsTable(results, 'first50')}\n\n${schemeTable(results, geo.geoms, 'first50')}\n`);
  console.log(`Wrote ${showPath(OUT_DIR)}/actions-{${BOTS.join(',')}}.json and ${showPath(REPORT_FILE)}`);
}
main();
