// Summarises bench-out/*.json (from bench-v2.js) and checks the v2 balance gates (spec 7-6, 7-7).
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'bench-out');
const L = id => JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf8'));
const C = {}; for (const id of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'R']) C[id] = L(id);
const BOTS = ['greedy', 'bot2'];
const q = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const pct = (n, d) => d ? (100 * n / d).toFixed(1) + '%' : '-';
const out = [];
const log = s => { out.push(s); console.log(s); };
const gates = [];
const gate = (name, pass, detail) => { gates.push({ name, pass, detail }); };

// v1 combo breaks at x3+ from a turn log (v1 rule: a placement that closes a segment without completions resets the streak)
function v1Breaks3(turnLog) { let run = 0, br = 0; for (let k = 0; k < turnLog.length - 1; k++) { if (turnLog[k] > 0) run++; else { if (run >= 3) br++; run = 0; } } return br; }

log('## 기본 지표 (200판, 최대 300턴)');
log('| 설정 | 봇 | 턴 p10/p50/p90 | 평균 | 점수 p50 | 300턴 생존 |');
log('|---|---|---|---|---|---|');
for (const id of Object.keys(C)) for (const bot of BOTS) {
  const r = C[id][bot], t = r.map(x => x.turns);
  log(`| ${id} | ${bot} | ${q(t, .1)}/${q(t, .5)}/${q(t, .9)} | ${mean(t).toFixed(1)} | ${q(r.map(x => x.score), .5)} | ${r.filter(x => !x.over).length}/200 |`);
}

// B = A
let bdiff = 0;
for (const bot of BOTS) C.A[bot].forEach((a, i) => { const b = C.B[bot][i]; if (a.turns !== b.turns || a.score !== b.score || a.clears !== b.clears || a.board !== b.board) bdiff++; });
gate('B = A (턴·점수·완성·보드)', bdiff === 0, `불일치 ${bdiff}판`);

// C: combo
log('\n## C (넣기 완성 콤보) vs A');
for (const bot of BOTS) {
  let tdiff = 0, up = 0, down = 0;
  C.A[bot].forEach((a, i) => { const c = C.C[bot][i]; if (a.turns !== c.turns) tdiff++; if (c.score > a.score) up++; if (c.score < a.score) down++; });
  const ms = C.C[bot].map(x => x.maxStreak), msA = C.A[bot].map(x => x.maxStreak);
  const brC = mean(C.C[bot].map(x => x.breaks3)), brA = mean(C.A[bot].map(x => v1Breaks3(x.turnLog)));
  log(`- ${bot}: 턴 다른 판 ${tdiff}, 점수 상승 ${up} / 하락 ${down}, 최대 콤보 p50/p90 ${q(ms, .5)}/${q(ms, .9)} (A ${q(msA, .5)}/${q(msA, .9)}), 판당 ×3 이상 끊김 ${brC.toFixed(2)} (A ${brA.toFixed(2)})`);
  gate(`C ${bot}: 턴 동일·하락 0`, tdiff === 0 && down === 0, `턴 다른 판 ${tdiff}, 하락 ${down}, 상승 ${up}`);
}

// flips
log('\n## 판당 뒤집기 (flipsPlaced 평균)');
for (const id of ['D', 'F', 'G']) log(`- ${id}: ` + BOTS.map(b => `${b} ${mean(C[id][b].map(x => x.flipsPlaced)).toFixed(2)}`).join(', '));

// zones
log('\n## 구역 (E·F)');
for (const id of ['E', 'F']) for (const bot of BOTS) {
  const r = C[id][bot];
  const share = r.filter(x => x.score > 0).map(x => x.zoneBonusTotal / x.score);
  let exits = 0, s2 = 0, s3 = 0;
  for (const x of r) for (const s of x.stars) { const exited = x.zoneLog.some(e => e.zone === s.zone + 1); if (!exited) continue; exits++; if (s.empty2) s2++; if (s.clean) s3++; }
  const tw = r.reduce((a, x) => a + x.twins, 0), twe = r.reduce((a, x) => a + x.twinIntoEmpty, 0);
  const p50 = q(share, .5), p90 = q(share, .9);
  log(`- ${id} ${bot}: 보너스 비중 p50/p90 ${(100 * p50).toFixed(1)}%/${(100 * p90).toFixed(1)}%, ★2 ${pct(s2, exits)}, ★3 ${pct(s3, exits)} (돌파 ${exits}회), 쌍둥이→빈 병 ${pct(twe, tw)} (${twe}/${tw})`);
  gate(`${id} ${bot}: 보너스 비중 p50 ≤ 20%, p90 ≤ 25%`, p50 <= 0.20 && p90 <= 0.25, `${(100 * p50).toFixed(1)}% / ${(100 * p90).toFixed(1)}%`);
}

// zone-start 2-turn deaths
log('\n## 구역 시작 후 2턴 안 사망 비율 (사망 턴 − 구역 시작 턴 ∈ [0,2]) ÷ 그 턴 도달 판');
log('| 설정 | 봇 | 20턴 | 40턴 | 60턴 | 80턴 | 100턴 |');
log('|---|---|---|---|---|---|---|');
const zoneDeath = {};
for (const id of ['A', 'E', 'F']) for (const bot of BOTS) {
  const cells = [];
  for (const T of [20, 40, 60, 80, 100]) {
    const reached = C[id][bot].filter(x => x.turns >= T).length;
    const died = C[id][bot].filter(x => x.over && x.turns - T >= 0 && x.turns - T <= 2).length;
    zoneDeath[`${id}${bot}${T}`] = reached ? died / reached : 0;
    cells.push(`${pct(died, reached)} (${died}/${reached})`);
  }
  log(`| ${id} | ${bot} | ${cells.join(' | ')} |`);
}
for (const bot of BOTS) {
  const dE = zoneDeath[`E${bot}20`] - zoneDeath[`A${bot}20`];
  log(`- 판단 보조 ${bot}: E의 20턴 경계 2턴 안 사망률 − A = ${(100 * dE).toFixed(1)}%p` + (dE > 0.01 ? ' → 조정 후보 "첫 경계만 쌍둥이 1칸"' : ''));
}

// spare (G)
log('\n## 임시 잔 (G: 즉시 수락)');
for (const bot of BOTS) {
  const r = C.G[bot];
  const armed = r.filter(x => x.spareArmTurn >= 0), used = r.filter(x => x.spareUsed);
  const within3 = used.filter(x => x.over && x.turns - x.spareTurn <= 3).length;
  log(`- ${bot}: 발동 ${pct(armed.length, r.length)}, 첫 발동 턴 p50 ${armed.length ? q(armed.map(x => x.spareArmTurn), .5) : '-'}, 받은 뒤 3턴 안 사망 ${pct(within3, used.length)} (${within3}/${used.length})`);
  gate(`G ${bot}: 받은 뒤 3턴 안 사망 ≤ 15%`, used.length ? within3 / used.length <= 0.15 : true, pct(within3, used.length));
}

// F and M against A
log('\n## 합격선: F(v2 규칙)·M(혼합) vs A');
function wq(samplesW, p) { const a = samplesW.slice().sort((x, y) => x[0] - y[0]); const tot = a.reduce((s, x) => s + x[1], 0); let acc = 0; for (const [v, w] of a) { acc += w; if (acc >= p * tot) return v; } return a[a.length - 1][0]; }
for (const bot of BOTS) {
  const a50 = q(C.A[bot].map(x => x.turns), .5), f50 = q(C.F[bot].map(x => x.turns), .5);
  const fs300 = C.F[bot].filter(x => !x.over).length;
  const hi = bot === 'bot2' ? 1.15 : 1.12;
  gate(`F ${bot}: p50 A×0.95~${hi}, 300턴 생존 ≤ 2`, f50 >= 0.95 * a50 && f50 <= hi * a50 && fs300 <= 2, `A ${a50} → F ${f50} (×${(f50 / a50).toFixed(3)}), 생존 ${fs300}/200`);
  const mix = C.F[bot].map(x => [x.turns, 0.75]).concat(C.G[bot].map(x => [x.turns, 0.25]));
  const m50 = wq(mix, 0.5);
  const ms300 = 0.75 * fs300 + 0.25 * C.G[bot].filter(x => !x.over).length;
  if (bot === 'bot2') gate('M bot2: p50 ≤ A×1.15, 가중 300턴 생존 ≤ 2', m50 <= 1.15 * a50 && ms300 <= 2, `A ${a50} → M ${m50} (×${(m50 / a50).toFixed(3)}), 가중 생존 ${ms300.toFixed(2)}/200`);
  log(`- ${bot}: A p50 ${a50}, F p50 ${f50} (×${(f50 / a50).toFixed(3)}), M p50 ${m50} (×${(m50 / a50).toFixed(3)}), M 가중 300턴 생존 ${ms300.toFixed(2)}/200`);
}

// near miss (F)
log('\n## 니어미스 (F, 자리 없음으로 끝난 판)');
for (const bot of BOTS) {
  const d = C.F[bot].filter(x => x.death && x.death.reason === 'noroom').map(x => x.death.near);
  log(`- ${bot}: ${d.length}판 중 딱 1칸 부족 ${pct(d.filter(n => n.short === 1).length, d.length)}, 완성 직전 병 있음 ${pct(d.filter(n => n.almost.length).length, d.length)}, 맨 위 흩어진 색 있음 ${pct(d.filter(n => n.scattered.length).length, d.length)}`);
}

// R: revive copy
log('\n## R (부활 문구 검증): 기준 최고 점수 = 같은 봇 F의 이전 시드 점수');
for (const bot of BOTS) {
  const F = C.F[bot], Rr = C.R[bot];
  const res = { x12: { show: 0, hit: 0 }, p30: { show: 0, hit: 0 } };
  let eligible = 0, zoneMsg = 0;
  Rr.forEach((r, i) => {
    const best = F[(i + 199) % 200].score;
    const d = r.death; if (!d) return;
    if (d.zoneLeft != null && d.zoneLeft <= 3) zoneMsg++;
    const gap = best - d.score;
    if (!(best > 0) || gap <= 0) return;
    eligible++;
    const perTurn = d.turn ? d.score / d.turn : 0;
    const hit = r.score > best;
    if (gap <= perTurn * 12) { res.x12.show++; if (hit) res.x12.hit++; }
    if (gap <= 0.3 * best) { res.p30.show++; if (hit) res.p30.hit++; }
  });
  log(`- ${bot}: 대상 ${eligible}판 | ×12 기준 노출 ${pct(res.x12.show, eligible)}, 달성 ${pct(res.x12.hit, res.x12.show)} | 30% 기준 노출 ${pct(res.p30.show, eligible)}, 달성 ${pct(res.p30.hit, res.p30.show)} | 다음 구역 3턴 이내 사망 ${pct(zoneMsg, Rr.length)}`);
}

log('\n## 합격선 판정');
for (const g of gates) log(`- ${g.pass ? '통과' : '미달'} · ${g.name}: ${g.detail}`);
const allPass = gates.every(g => g.pass);
log(`\n전체: ${allPass ? '모두 통과' : '미달 항목 있음'}`);
fs.writeFileSync(path.join(__dirname, 'bench-out', 'REPORT.md'), out.join('\n'));
