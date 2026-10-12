const fs=require('fs'),path=require('path'),{E}=require('../../harness'),{ROOT,OUT,metadata}=require('./common');
const read=n=>JSON.parse(fs.readFileSync(path.join(OUT,n+'.json'))),fmt=n=>n==null?'—':Number(n).toFixed(2),pct=(n,d)=>d?(100*n/d).toFixed(1)+'%':'—';
const selection=read('selection'),label=selection.label,final=read('final'),holdout=read('holdout'),tune=read('tune'),verification=read('verification');
const extra=selection.additionalCandidates?read('tune-'+selection.extraLabel):null,conditional=fs.existsSync(path.join(OUT,'conditional.json'))?read('conditional'):null;
const rows=(study)=>study.results.map(r=>{const s=r.summary;return`| ${study.stage} | ${r.label} | ${s.n} | ${s.capped}/${s.n} (${pct(s.capped,s.n)}) | ${s.scoreP50} | ${s.unlocks.bottle12.reached}/${s.n} | ${s.reasons['engine-no-legal-room']||0} | ${s.reasons['bot-search-limited']||0} | ${s.unknown} |`;}).join('\n');
const chosen=final.results.find(r=>r.label===label),hold=holdout.results.find(r=>r.label===label),late=chosen.summary.unlocks.bottle12;
const commandNames=['engine','expansionEngine','holdEngine','lateEngine','pressureEngine','goalEngine','hud','hold','fx','mobile','i18n','real','presentation','feel'];
const warning=chosen.summary.capped/chosen.summary.n>=.5||chosen.summary.capped>=final.results.find(r=>r.label==='baseline').summary.capped;
const commandRows=commandNames.map(n=>{const d=read('after-'+n+'-command');return`| ${n} | ${d.exitCode} | ${d.testSha256} |`;}).join('\n');
const median=a=>a.length?a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)]:null;
const milestoneRows=[final,holdout].flatMap(d=>d.results.flatMap(r=>[10000,12000,18000,25000,30000,40000,55000,70000,85000,100000].map(score=>{const s=r.summary.milestones[score],reached=r.rows.filter(row=>row.score>=score);return`| ${d.stage}/${r.label} | ${score.toLocaleString('ko-KR')} | ${s?s.reached:reached.length}/${d.n} | ${s?(s.firstTurnP50??'—'):'미수집'} | ${s?s.censored:reached.filter(row=>!row.over).length} |`;}))).join('\n');
const unlockRows=[final,holdout].flatMap(d=>{const r=d.results.find(r=>r.label===label);return['color11','bottle10','color12','bottle11','color13','bottle12'].map(k=>{const u=r.summary.unlocks[k];return`| ${d.stage} | ${k} | ${u.reached}/${d.n} | ${u.firstTurnP50??'—'} | ${median(r.rows.filter(row=>row.unlocks[k]).map(row=>row.unlocks[k].score))??'—'} | ${u.observedAfterP50??'—'} | ${u.censored} |`;});}).join('\n');
const recoveryRows=['bottle10','bottle11','bottle12'].map(k=>{const u=chosen.summary.unlocks[k];return`| ${k} | ${['before','after','10','50','100'].map(p=>`${u[p].n} / ${fmt(u[p].free)}`).join(' | ')} |`;}).join('\n');
let doc=`# 보트리스 12병 확장 구현·밸런스 검증

검증일: 2026-10-12. 로컬 구현이며 원격 커밋·푸시·Pages 배포는 하지 않았다.

최종 규칙은 ${label}안이다. ${selection.reason} 기능 구현과 자동 난도 선별을 완료했지만, 봇 결과는 사람의 재미·재도전이나 출시 적정성을 입증하지 않는다.

## 적용한 규칙

최대 13색·일반 병 12개·병당 4칸이다. 아래 6병과 위 6병을 사용하며 기존 병·물 층 높이와 터치 너비를 유지했다. 최초 성장 점수는 유지했다. 기존 0~18,000점 성장, 30,000점 이전 생성·압박·행동 계약은 그대로다.

최종 성장 점수는 명세의 최초 후보에서 변경하지 않았다. 후반 압박은 B의 14/17/20%, 추가 후보 C의 16/22/28%를 실제 비교했지만 정체를 줄이지 못했다. 최종 실험용 표준은 그 강화를 제거한 A의 기존 12% 상한으로 되돌렸다. 허용된 추가 후보를 소진한 뒤 성장 간격까지 함께 바꿔 원인을 섞거나 새 시드로 계속 튜닝하지 않았다.

| 점수 | 색 | 병 |
|---:|---:|---:|
${E.ENDLESS_RULES.growthTable.map(r=>`| ${r.score.toLocaleString('ko-KR')} | ${r.colors} | ${r.bottles} |`).join('\n')}

| 점수 | 3칸 확률 | 3칸 중 단색 |
|---:|---:|---:|
${E.ENDLESS_RULES.pressureTable.map(r=>`| ${r.score.toLocaleString('ko-KR')} | ${r.triplePct}% | ${r.tripleMonoPct}% |`).join('\n')}

행 사이에는 선형 보간을 적용한다. 선택한 A는 기존 표 그대로이며 25,000점 이후 12%/10%가 유지된다. B/C 비교에서는 30,000점의 12%/10% 고정점을 추가해 이전 생성열을 보존했다. 실제 9색부터 일반 1/2칸은 10%/90%, HOLD는 7병, 3칸은 8병부터다. 색상 목표는 실제 9색·8병의 10,000점부터이며 12회 배치·5,000점 간격·병당 150점·최대 300점을 유지했다.

색은 성공 배치당 한 종, 병은 점수를 얻은 행동의 막힘 판정 전에 지급한다. 공개 조각·큐·HOLD를 다시 추첨하지 않는다. 같은 행동에서 클리어와 병 지급이 함께 일어날 수 있으므로 해금 직전/직후 빈칸 차이를 병 4칸 추가만의 효과로 해석하지 않는다.

기존 10색·9병은 LATE_GROWTH_V1_RULES와 lateGrowthVersion 1로 보존했다. 새 정책은 버전 2이며 다음 표준 새 판에 적용한다. 이전 이어하기·명시적 커스텀은 기존 규칙을 유지하고 이전 기록 키·별 자격도 보존한다. 버전 없는 9색·8병과 더 오래된 정책의 정제·서명·실행 동치를 검사했다. 손상/미지원 저장은 원본 복구 보호 경로를 따른다.

두 자리 색 인덱스를 구분하기 위해 탐색의 액체 키를 수정했다. [1,0]과 [10], [1,1]과 [11], [1,2]와 [12]가 충돌하지 않는다. 기존 한 자리 색 키는 그대로 유지한다. 붓기 탐색과 공개 물량 목표 증명이 같은 수정된 키를 사용한다.

## 난도 비교와 선택

시드·수량·선별 기준은 config.js에 고정했다. 생존 평가·깊이 2 붓기·HOLD/뒤집기 정책은 보존한 before-bots.js를 사용하며 목표를 의도적으로 쫓지 않는다. 추가 후보는 ${selection.additionalCandidates}개다. 최종/독립 시드는 선택에 사용하지 않았고 독립 결과로 다시 튜닝하지 않았다.

| 구분 | 규칙 | 판 | 1,500배치 생존 관측 중단 | 점수 관측 중앙값 | 실제 12병 해금 | 엔진 종료 | 봇 탐색 포기 | unknown 관측 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
${[tune,...(extra?[extra]:[]),final,holdout].map(rows).join('\n')}

관측 중단은 실패도 무한 생존의 입증도 아니다. 엔진 종료와 봇의 give-up을 구분했다. 점수·생존 중앙값은 관측 값이며 검열된 판이 많으면 실제 생존 중앙값을 알 수 없다. CLI 작업은 독립 판을 병렬 실행하지만 각 판의 정책·탐색 상한·시드·성공 배치 한도는 동일하다. 실행 시간은 난도 선별 지표로 사용하지 않았다.

| 비교/규칙 | 점수 기준 | 실제 도달 / 전체 | 첫 도달 배치 중앙값 | 도달 후 검열 |
|---|---:|---:|---:|---:|
${milestoneRows}

기준선의 40,000점 이후 행은 성장 기준이 아니어서 최초 도달 턴을 수집하지 않았다. 해당 도달 수와 검열 수는 되돌리기 없이 단조 증가하는 실제 최종 점수로 확인한 값이며, 최초 턴은 미수집으로 남겼다. 기록이 없다는 이유로 0판 도달로 표시하지 않는다.

점수 기준 도달과 실제 색/병 해금을 구분했다. 아래는 선택한 후보의 실제 해금 행동이다.

| 비교 | 해금 | 실제 도달 / 전체 | 해금 배치 중앙값 | 실제 해금 점수 중앙값 | 해금 이후 관측 배치 중앙값 | 검열 |
|---|---|---:|---:|---:|---:|---:|
${unlockRows}

${selection.analysis}

최종 새 판의 12병 도달은 ${late.reached}/40, 해금 이후 관측 배치 중앙값은 ${late.observedAfterP50??'표본 없음'}회, 이 중 ${late.censored}판은 검열됐다. 독립 시드에서는 ${hold.summary.unlocks.bottle12.reached}/20이 12병에 도달했다. 선별 가설은 관측 중단 10~40%, 도달 20% 이상, 새 색 이후 50배치 내 실제 종료 30% 미만이다. 모든 숫자는 자동 선별용 가설이고 출시 합격선이 아니다.

최종 관측 중단은 ${chosen.summary.capped}/${chosen.summary.n}, 독립 시드는 ${hold.summary.capped}/${hold.summary.n}이다. ${warning?'최종 비교에도 후반 정체 경고가 남았다. 12병 확장의 기능은 완료했지만 출시 밸런스는 성립하지 않았다.':'최종 관측값만으로 사람의 난도 체감이나 재도전이 개선됐다고 확정하지 않는다.'} 관측 한도까지 생존한 판이 많으므로 12병 이후 실제 생존 중앙값을 확정할 수 없다.

독립 시드의 기준선은 ${holdout.results.find(r=>r.label==='baseline').summary.capped}/20이다. 최종 비교에서는 기준선보다 A의 생존이 많았지만 독립 비교에서는 반대였다. 상대적인 난도 효과 방향은 이 표본에서 안정적이지 않으며, A가 두 별도 비교 모두 85% 관측 중단이라는 정체 경고는 남는다. 유리한 시드만 골라 결론을 바꾸지 않았다.

| 새 색 | 도달 판 | 50배치 이내 엔진 종료 | 도달 판 중 비율 | 해금 후 검열 |
|---|---:|---:|---:|---:|
${['color11','color12','color13'].map(k=>{const u=chosen.summary.unlocks[k];return`| ${k} | ${u.reached} | ${u.deathWithin50} | ${pct(u.deathWithin50,u.reached)} | ${u.censored} |`;}).join('\n')}

| 최종 단계 | 판 / 배치 | 빈칸 배치 가중 / 판별 평균 | 즉시 배치 병 수 배치 가중 / 판별 평균 | 순수 병 | 보드 색 수 / 색 경계 | HOLD / 구제 | 목표 성공 / 실패 | 목표 보너스 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${['11c-9b','11c-10b','12c-10b','12c-11b','13c-11b','13c-12b'].map(k=>{const s=chosen.summary.stages[k];return s?`| ${k} | ${s.runs} / ${s.placements} | ${fmt(s.freeMean)} / ${fmt(s.freeRunMean)} | ${fmt(s.targetsMean)} / ${fmt(s.targetsRunMean)} | ${fmt(s.pureMean)} | ${fmt(s.distinctMean)} / ${fmt(s.breaksMean)} | ${s.holds} / ${s.holdRescues||0} | ${s.completed} / ${s.missed} | ${s.bonus||0} |`:`| ${k} | 0 / 0 | — | — | — | — | — | — | — |`;}).join('\n')}

도달하지 못한 판을 후반 평균에 0으로 넣지 않았다. 표의 색 경계는 병 안에서 인접 색이 달라지는 지점 수다. 단계별·점수 구간별 원자료, 10k/12k/18k/30k와 후속 해금 턴·점수, 해금 행동 직전/직후와 +10/+50/+100배치 스냅샷, HOLD와 목표 관측은 각 JSON에 있다.

| 병 지급 | 직전 표본 / 빈칸 | 직후 표본 / 빈칸 | +10배치 표본 / 빈칸 | +50배치 표본 / 빈칸 | +100배치 표본 / 빈칸 |
|---|---:|---:|---:|---:|---:|
${recoveryRows}

표본은 해당 시점까지 실제 관측된 판만 센다. 병 지급과 같은 행동에서 클리어·점수 정산도 가능하므로 직후 차이는 순수한 4칸 지급 효과와 같지 않다.

${conditional?`조건부 보조 비교는 최종 기준선의 30,000점 직전 마지막 유효 상태 ${conditional.n}개를 모두 사용했다. 같은 보드·점수·공개 큐·HOLD·원래 seed를 보존하고 정책만 교체하여 추가 1,000배치까지 진행했다. 강제로 점수나 병/색을 채운 밸런스 판이 아니다.\n\n| 조건부 규칙 | 체크포인트 | 추가 한도 생존 | 12병 해금 | 엔진 종료 | 봇 포기 |\n|---|---:|---:|---:|---:|---:|\n${conditional.results.map(r=>`| ${r.label} | ${r.summary.n} | ${r.summary.capped} | ${r.summary.unlocks.bottle12.reached} | ${r.summary.reasons['engine-no-legal-room']||0} | ${r.summary.reasons['bot-search-limited']||0} |`).join('\n')}\n\n새 판 도달률과 이 조건부 생존을 섞지 않았다. 마지막 성장 표본이 적으면 이 자료로도 적정성을 확정하지 않는다.`:'조건부 보조 비교는 실행하지 않았다. 신선한 판의 마지막 성장 표본과 검열 여부는 위 표에 그대로 남겼다.'}

## 화면·입력·호환성

엔진 계약 ${read('engine-test').checks.length}개 그룹, 새 전체 보드 CDP ${read('browser').checks.length}개 검사, 실제 제공 체험 ${read('demo-browser').checks.length}개 검사를 통과했다. 360×640·390×724·1280×900, 상하 트레이, 6~12병을 작업 전과 직접 비교했다. 기존 병 위치·유리 높이·터치 너비 44px 이상을 유지하며 페이지 스크롤이나 병 겹침은 없다. 마지막 세 병의 실제 터치/마우스 좌표와 이후 상태는 browser.json의 inputs에 보존했다.

위 줄 인덱스 6~11은 열 3/4/5/6/2/1에 대응한다. 11~12병의 콤보·안내는 기존 최고 기록/콤보 줄을 잠시 사용한다. 최고 기록은 안내 중 잠깐 교체되고 원래 값으로 돌아온다. 현재 점수·활성 목표·현재/다음·HOLD·버튼은 가리지 않는다. 12병은 간결한 숫자 버스트를 사용하고 큰 버스트의 보조 감탄사는 줄였다. 콤보가 끊기는 숫자도 이 줄 안에서 페이드해 목표 영역으로 떨어지지 않는다. 상하 트레이에서 실제 숫자 좌표를 검사했다. HUD 높이를 추가하거나 병을 줄이지 않았다.

라임·남색·살구와 고유 기호를 기존 10색 뒤에 추가했다. 9언어의 이름·도움말·성장표를 messages.tsv에서 삽입했다. 4스킨의 다크와 실제 root data-theme=light, 기본/강화·모션 줄이기·음소거, 폰트 폴백·안전 여백·큰 점수·목표 성공/실패·게임 종료를 검사했다. 테마 초기화에서 prefs.theme만 설정하면 다크가 남는 검사 오류를 바로잡고 실제 라이트 화면을 확인했다.

전체 보드의 폰트 준비 관측 ${read('browser').fonts.length}건 중 ${read('browser').fonts.filter(f=>f.loaded===false).length}건은 2,500ms 안에 끝나지 않았다. 기준선·수정본의 상단 트레이 각각 한 건이며 폴백을 포함한 좌표·기호 검사는 통과했다. 힌디어 큰 점수·설정과 새 3색의 다크/라이트 캡처도 눈으로 확인했다. 원격 폰트의 항상 빠른 로드는 보장하지 않는다.

원래 전체 모션 300/312의 실패 12개를 새 기준선으로 재현했다. 공통 배너 크기·배치와 짧은 상단 버스트를 고쳐 최종 전체 324/324, 줄이기 230/230을 통과했다. 버스트가 생겨 추가 12개 좌표 검사도 실행됐으며 검사를 삭제하거나 허용 오차를 넓히지 않았다. 첫 새 CDP 검사에서는 tapPlace의 붓기를 짧은 탭으로 실행한 오류, 애니메이션 중간의 변형 폭을 스크롤 폭과 비교한 오류, 붓기 후 버스트를 너무 일찍 재는 오류를 수정했다. 실제 조작법의 550ms 길게 누르기, clientWidth와 scrollWidth, 연출 등장 이후 측정을 사용한다.

추가 콤보 종료 검사 두 항목은 첫 턴에 콤보가 끊기지 않는 기존 계약을 무시한 테스트 조건 때문에 처음 실패했다. 실제 배치를 한 번 수행한 다음 종료 가능한 상태에서 검사하도록 바로잡았다. 콤보가 0으로 바뀌는 실제 행동과 종료 숫자의 영역 경계를 함께 확인하며 원래 실패 자료도 보존했다.

순수 엔진 회귀는 최종 엔진 해시와 일치하고 화면 회귀는 마지막 연출 수정까지 포함한 최종 전체 소스 해시와 일치한다. 각 명령·stdout·stderr·코드·검사 해시는 after-*-command.json에 있다. 첫 병렬 회귀의 FX 한 항목은 실제 관측 시각이 390→779ms로 지연돼 파동을 놓쳤다. 해당 실행을 진단으로 보존하고 비교/다른 UI 작업이 끝난 뒤 FX를 별도로 다시 검사했다. 최종 통과 증거는 아래 개별 명령의 결과이며, 실패가 포함된 이전 묶음 실행을 성공으로 바꾸지 않았다.

중간 묶음의 HUD 래퍼 종료 코드 1도 regressions-engine.json에 남겼다. 당시 저장된 1,316개 체크는 모두 성공이었지만 개별 stderr가 남지 않아 래퍼 오류 원인은 단정할 수 없다. 당시 자료는 diagnostic-hud-wrapper-output.json으로 보존했고 메타데이터가 덮인 과거 HUD 보고서는 기존 체크·좌표 내용이 동일함을 확인하여 원래 메타데이터로 복구했다. 마지막 소스에서는 HUD 1,316항목과 래퍼를 다시 실행해 종료 코드 0을 확인했으며, 새 전체 보드 검사는 별도로 모든 성장 단계의 좌표를 측정했다.

| 검사 | 종료 코드 | 검사 SHA256 |
|---|---:|---|
${commandRows}

## 성능

6회 예열 후 붓기 40·배치 10·큰 콤보 5, 같은 seed와 입력 절차다. 작업 전 10색·9병과 세 최종 성장 상태를 각각 기본/강화·1배/4배 CPU로 측정했다. 다른 봇·UI 작업과 병렬 실행하지 않았다. 수치는 입력 처리·연출 시작 비용이며 모바일 FPS가 아니다.

작업 초반의 기준선 측정도 diagnostic-initial-before-perf/에 보존했다. 그 실행에서는 기본 4배 CPU 조건에 65ms 긴 작업 1건이 있었다. 아래 비교 표의 기준선은 최종 측정 도구와 같은 해시로 다시 실행한 결과이며, 한 차례 측정의 변동으로 항상 부드럽다고 결론 내리지 않는다.

| 상태 | 연출/CPU | 입력 | 전체 p50 / p90 / 최대 ms | 붓기 / 배치 / 큰 콤보 p90 | 긴 작업 / 최대 ms | 효과 노드 최대 |
|---|---|---:|---:|---:|---:|---:|
${['before','probe-11c10b','probe-12c11b','probe-13c12b'].flatMap(p=>Object.entries(read(p+'-perf-perf')).map(([k,r])=>`| ${p} | ${k} | ${r.made}/${r.all.n} | ${r.all.p50} / ${r.all.p90} / ${r.all.max} | ${r.pour.p90} / ${r.place.p90} / ${r.clear.p90} | ${r.longTasks} / ${r.longest} | ${r.maxFx} |`)).join('\n')}

| 목표 탐색 상태 | 표본 | p50 / p90 / 최대 ms | 제안 / 합법 재생 | 최대 탐색 | 공개 물량 부족 / 물량 있어도 미제안 |
|---|---:|---:|---:|---:|---:|
${read('planner-perf').results.map(r=>`| ${r.label} | ${r.n} | ${r.p50} / ${r.p90} / ${r.max} | ${r.found} / ${r.replays} | ${r.examinedMax} | ${r.noVisibleTargetMaterial} / ${r.nullWithMaterial} |`).join('\n')}

목표 탐색은 각각 30회 예열·400개 유효 강제 상태이며 768개 탐색·빔 12·깊이 20을 유지한다. 모든 반환 증명을 실제 합법 행동으로 재생했다. 강제 상태의 제안 비율은 실제 플레이 목표 성공률이 아니고 12병 UI/성능 강제 상태도 밸런스 플레이 자료와 구분한다. 원시 시간·유효 입력·JS 오류·노드 수는 해당 JSON에 남겼다.

공개 물량 부족은 보드·현재·공개 큐·HOLD를 모두 합쳐도 어느 색도 4칸에 못 미치는 경우다. 물량이 있어도 미제안한 경우에는 순서·공간·지정 색 우선 제약이나 제한된 탐색이 포함되며, 전부 탐색 결함이라고 단정하지 않는다.

12병 탐색 p90은 4.678→6.625ms로 약 1.95ms 늘었고 최대 8.585ms였다. 기존의 턴별 재검사 차단과 seen/proofs 중복 제거를 확인했으며 매 프레임 탐색이나 탐색 상한 확대는 추가하지 않았다. 12병의 제안 수는 315→338로 줄지 않았다. 한편 12색·11병 강제 상태의 128/400 제안은 낮은 값으로 남는다. 충분한 물량만으로 합법 완성 경로가 입증되는 것은 아니며, 배치 조건과 보수적인 탐색 제한을 분리하려면 추가 진단이 필요하다. 실제 최종 봇의 해당 단계는 종료된 목표 105개 중 75개 성공(71.4%)이었지만, 성공률은 제안율과 다른 분모이므로 이 값으로 미제안 위험이 해소됐다고 보고하지 않는다.

## 재현과 증거

시드: full-board-tune-20261011-0~19, full-board-final-20261011-0~39, full-board-holdout-20261011-0~19. 실제 검증일은 12일이며 시드 이름은 사전 명세 그대로다.

최종 소스 SHA256: ${metadata().sourceSha256}

최종 엔진 SHA256: ${metadata().engineSha256}

보존 봇 SHA256: ${metadata().botSha256}

빌드 SHA256: ${verification.buildSha256}

전체 규칙·서명은 selection.json과 verification.json, 기준선 소스·하네스·봇 스냅샷은 out/baseline/에 있다. 그 파일들은 체크섬으로 검사하며 없거나 불일치하면 실패한다. 기준선은 커밋되지 않은 10색·9병으로 HEAD를 대용하지 않는다. 중간 튜닝 엔진과 원래 입력 해시는 별도로 보존하고 최종/독립 비교와 제품 규칙의 일치를 검사한다.

명령: node research/full-board/compare.js --stage=tune --labels=baseline,color,A,B --n=20 --cap=1500; ${selection.additionalCandidates?`node research/full-board/compare.js --stage=tune --labels=${selection.extraLabel} --n=20 --cap=1500; `:''}node research/full-board/compare.js --stage=final --labels=baseline,${label} --n=40 --cap=1500 --workers=8; node research/full-board/compare.js --stage=holdout --labels=baseline,${label} --n=20 --cap=1500 --workers=8. 모두 종료 코드 0이다.${conditional?` 보조 명령은 node research/full-board/compare.js --stage=conditional --labels=baseline,${label} --cap=1000 --workers=8 이며 종료 코드 0이다.`:''}

최종 확인: node build-pages.js; node research/full-board/engine-test.js; node uitest/full-board.js; node uitest/full-board.js --demo-only; node research/full-board/regressions.js engine expansionEngine holdEngine lateEngine pressureEngine goalEngine hud hold mobile i18n real presentation feel; 이후 화면 소스 변경 때문에 node research/full-board/regressions.js hud hold mobile i18n real; node research/full-board/regressions.js fx; node research/full-board/planner-perf.js; node research/full-board/verify-evidence.js. 성능: node research/bottle-quality/run-check.js before perf --task=full-board --late-expansion --source=outputs/full-board/before-source.html; probe-11c10b/probe-12c11b/probe-13c12b 단계에서 perf --full-board=10/11/12. 실행 코드와 로그는 out/에 있으며 진단 실패 자료는 최종 통과 자료와 분리했다.

일반 플레이: http://127.0.0.1:8154/ . 이전 이어하기는 기존 정책이므로 새 판에서 새 기본을 확인한다. 체험: http://127.0.0.1:8161/ , 모바일 전체 화면: http://127.0.0.1:8161/game?score=100000 . 체험 저장은 메모리이며 Firebase를 비활성화해 실제 플레이 기록을 오염시키지 않는다. 제공 HTML의 HTTP 바이트와 최종 dist/index.html의 일치도 확인했다.

실제 휴대폰·Safari·스피커·진동·사람의 색 구분·원어민 번역·재도전 동기는 이 자동 검사로 입증하지 않았다. GitHub Pages는 이번 작업에서 배포하지 않았다.
`;
fs.writeFileSync(path.join(ROOT,'research/full-board/REPORT.md'),doc);console.log('Wrote full-board report');
