# 조작 방식별 입력 비용 추정 (봇 행동 로그 기반)

> 이 파일은 `research/controls/count-actions.js`가 생성한다. 손으로 고치면 재실행 시 덮어쓴다.

## 방법

- 엔진: `water-sort-survival.html`의 engine 스크립트 (`harness.js`의 `E`). 규칙 `E.sanitizeRules(E.DEFAULT_RULES)` (spare=false, flip on, flipLimit=2).
- 봇: greedy = `harness.js` `runBot`, bot2 = `bot2.js` `runBot2` (2-ply). opts `{}` (spare 광고·부활 없음).
- 시드 `ctl-0`..`ctl-199` (200개), 최대 300턴. 앞 50개(`ctl-0..49`)는 이전 기준선과 비교하려고 따로 집계.
- 실제 행동만 세기: `E.newState`를 감싸 반환된 상태 객체를 `WeakSet`에 등록하고, `applyPlace` / `applyPour` / `applyFlip`은 상태가 그 집합에 있고 원래 반환값이 truthy인 호출만 기록한다. 봇이 `JSON.parse(JSON.stringify(S))` 클론에서 하는 시뮬레이션 호출은 클론이 집합에 없어서 빠진다 (속성 표시는 클론에 복사되므로 쓰지 않음). 검증: 시드마다 기록된 place 수 = `S.turn`.
- 행동 순서를 그대로 저장 (`p<t>` = 병 t에 놓기, `<s>><t>` = s에서 t로 붓기, `f` = 뒤집기). JSON의 `perSeed[].actions`.
- 턴 = place 1회로 끝나는 행동 묶음 (그 턴의 pour, flip 포함). 모든 `/turn` 값은 (전체 합) / (전체 place 수). 게임오버 직전 place 없이 끝난 pour(표의 "pours after last place")는 분자에만 들어간다.
- 손가락 이동거리: 터치 지점을 순서대로 이은 직선 거리의 합. 탭은 한 점, 드래그는 시작점과 끝점 (드래그 경로 포함). 매 판 컵에서 시작. 병은 중심 좌표를 누른다고 가정. 단위 CSS px.

### 조작 방식

| scheme | place | pour |
| --- | --- | --- |
| classic-taptap | cup tap + bottle tap (2 taps) | source tap + target tap (2 taps) |
| classic-drag | drag cup -> bottle (1 drag) | source tap + target tap (2 taps) |
| tapPlace-drag | bottle tap (1 tap) | drag source -> target (1 drag) |
| tapPlace-hold | bottle tap (1 tap) | long-press source + target tap (2 actions) |
| armed | piece pre-selected each turn; bottle tap (1 tap) | 2 taps; each pour run +1 cup tap before (disarm) and +1 cup tap after (re-arm) |

- 공통: flip = flip 버튼 1탭. 봇은 flip을 항상 그 턴의 pour 다음, place 직전에 한다.
- armed: 연속된 pour 묶음마다 앞에 컵 1탭(선택 해제), 묶음이 끝나면 다음 flip/place 전에 컵 1탭(재선택). 게임이 pour 도중 끝나면 재선택 탭은 없다.
- tapPlace-hold: long-press는 taps에 포함하고 `(long-press)` 열에 따로 표시. actions = taps + drags.

### 좌표 (390x844, rules=default)

- top: source=research/controls/out/geom-reduce.json; cup (53, 201.5); flip (107, 209); spare (335.625, 215); bottles x = [41.7, 103, 164.3, 225.6, 287, 348.3], y = [437.8]
- low: source=research/controls/out/geom-reduce.json; cup (53, 201.5); flip (107, 209); spare (335.625, 215); bottles x = [41.7, 103, 164.3, 225.6, 287, 348.3], y = [622.3]

## 기준선 비교 (ctl-0..49)

| bot | 지표 | 기준 (이전 측정) | 이번 측정 | 결과 |
| --- | --- | ---: | ---: | ---: |
| greedy | avg turns | 44.4 | 44.4 | 일치 |
| greedy | pours/turn | 0.70 | 0.70 | 일치 |
| greedy | zero-pour turns | 53.2% | 53.2% | 일치 |
| greedy | same-source consecutive pours | 13.3% | 13.3% | 일치 |
| bot2 | avg turns | 121.8 | 121.8 | 일치 |
| bot2 | pours/turn | 1.30 | 1.30 | 일치 |
| bot2 | zero-pour turns | 33.6% | 33.6% | 일치 |
| bot2 | same-source consecutive pours | 19.3% | 19.3% | 일치 |

## 결과: 200 시드

| bot | seeds | avg turns | alive@300 | pours/turn | flips/turn | zero-pour turns | same-source pours | pours after last place | time (s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| greedy | 200 | 47.0 | 0 | 0.71 | 0.04 | 52.9% | 12.9% | 0 | 19.2 |
| bot2 | 200 | 125.9 | 0 | 1.30 | 0.01 | 33.2% | 19.0% | 0 | 10.1 |

턴당 pour 수 분포:

| bot | pour 0 | 1 | 2 | 3 | 4 | 5 | 6+ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| greedy | 52.9% | 29.9% | 12.2% | 3.7% | 1.0% | 0.3% | 0.0% |
| bot2 | 33.2% | 28.0% | 23.9% | 8.6% | 4.5% | 1.1% | 0.7% |

| bot | tray | scheme | taps/turn | (long-press) | drags/turn | actions/turn | actions vs taptap | travel px/turn | travel vs taptap |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| greedy | top | classic-taptap | 3.46 | 0.00 | 0.00 | 3.46 | - | 692 | - |
| greedy | top | classic-drag | 1.46 | 0.00 | 1.00 | 2.46 | -29% | 692 | +0% |
| greedy | top | tapPlace-drag | 1.04 | 0.00 | 0.71 | 1.75 | -49% | 274 | -60% |
| greedy | top | tapPlace-hold | 2.46 | 0.71 | 0.00 | 2.46 | -29% | 274 | -60% |
| greedy | top | armed | 3.40 | 0.00 | 0.00 | 3.40 | -2% | 681 | -2% |
| greedy | low | classic-taptap | 3.46 | 0.00 | 0.00 | 3.46 | - | 1035 | - |
| greedy | low | classic-drag | 1.46 | 0.00 | 1.00 | 2.46 | -29% | 1035 | +0% |
| greedy | low | tapPlace-drag | 1.04 | 0.00 | 0.71 | 1.75 | -49% | 292 | -72% |
| greedy | low | tapPlace-hold | 2.46 | 0.71 | 0.00 | 2.46 | -29% | 292 | -72% |
| greedy | low | armed | 3.40 | 0.00 | 0.00 | 3.40 | -2% | 1016 | -2% |
| bot2 | top | classic-taptap | 4.61 | 0.00 | 0.00 | 4.61 | - | 812 | - |
| bot2 | top | classic-drag | 2.61 | 0.00 | 1.00 | 3.61 | -22% | 812 | +0% |
| bot2 | top | tapPlace-drag | 1.01 | 0.00 | 1.30 | 2.31 | -50% | 400 | -51% |
| bot2 | top | tapPlace-hold | 3.61 | 1.30 | 0.00 | 3.61 | -22% | 400 | -51% |
| bot2 | top | armed | 4.94 | 0.00 | 0.00 | 4.94 | +7% | 979 | +20% |
| bot2 | low | classic-taptap | 4.61 | 0.00 | 0.00 | 4.61 | - | 1160 | - |
| bot2 | low | classic-drag | 2.61 | 0.00 | 1.00 | 3.61 | -22% | 1160 | +0% |
| bot2 | low | tapPlace-drag | 1.01 | 0.00 | 1.30 | 2.31 | -50% | 407 | -65% |
| bot2 | low | tapPlace-hold | 3.61 | 1.30 | 0.00 | 3.61 | -22% | 407 | -65% |
| bot2 | low | armed | 4.94 | 0.00 | 0.00 | 4.94 | +7% | 1450 | +25% |

## 결과: ctl-0..49

| bot | seeds | avg turns | alive@300 | pours/turn | flips/turn | zero-pour turns | same-source pours | pours after last place | time (s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| greedy | 50 | 44.4 | 0 | 0.70 | 0.04 | 53.2% | 13.3% | 0 | - |
| bot2 | 50 | 121.8 | 0 | 1.30 | 0.01 | 33.6% | 19.3% | 0 | - |

| bot | tray | scheme | taps/turn | (long-press) | drags/turn | actions/turn | actions vs taptap | travel px/turn | travel vs taptap |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| greedy | top | classic-taptap | 3.44 | 0.00 | 0.00 | 3.44 | - | 692 | - |
| greedy | top | classic-drag | 1.44 | 0.00 | 1.00 | 2.44 | -29% | 692 | +0% |
| greedy | top | tapPlace-drag | 1.04 | 0.00 | 0.70 | 1.74 | -49% | 275 | -60% |
| greedy | top | tapPlace-hold | 2.44 | 0.70 | 0.00 | 2.44 | -29% | 275 | -60% |
| greedy | top | armed | 3.38 | 0.00 | 0.00 | 3.38 | -2% | 680 | -2% |
| greedy | low | classic-taptap | 3.44 | 0.00 | 0.00 | 3.44 | - | 1033 | - |
| greedy | low | classic-drag | 1.44 | 0.00 | 1.00 | 2.44 | -29% | 1033 | +0% |
| greedy | low | tapPlace-drag | 1.04 | 0.00 | 0.70 | 1.74 | -49% | 294 | -72% |
| greedy | low | tapPlace-hold | 2.44 | 0.70 | 0.00 | 2.44 | -29% | 294 | -72% |
| greedy | low | armed | 3.38 | 0.00 | 0.00 | 3.38 | -2% | 1013 | -2% |
| bot2 | top | classic-taptap | 4.61 | 0.00 | 0.00 | 4.61 | - | 814 | - |
| bot2 | top | classic-drag | 2.61 | 0.00 | 1.00 | 3.61 | -22% | 814 | +0% |
| bot2 | top | tapPlace-drag | 1.01 | 0.00 | 1.30 | 2.31 | -50% | 402 | -51% |
| bot2 | top | tapPlace-hold | 3.61 | 1.30 | 0.00 | 3.61 | -22% | 402 | -51% |
| bot2 | top | armed | 4.94 | 0.00 | 0.00 | 4.94 | +7% | 977 | +20% |
| bot2 | low | classic-taptap | 4.61 | 0.00 | 0.00 | 4.61 | - | 1162 | - |
| bot2 | low | classic-drag | 2.61 | 0.00 | 1.00 | 3.61 | -22% | 1162 | +0% |
| bot2 | low | tapPlace-drag | 1.01 | 0.00 | 1.30 | 2.31 | -50% | 408 | -65% |
| bot2 | low | tapPlace-hold | 3.61 | 1.30 | 0.00 | 3.61 | -22% | 408 | -65% |
| bot2 | low | armed | 4.94 | 0.00 | 0.00 | 4.94 | +7% | 1446 | +24% |

## 관찰 (200 시드)

- greedy / top: actions/turn 최소 tapPlace-drag (1.75), 최대 classic-taptap (3.46); travel px/turn 최소 tapPlace-drag = tapPlace-hold (274), 최대 classic-taptap = classic-drag (692)
- greedy / low: actions/turn 최소 tapPlace-drag (1.75), 최대 classic-taptap (3.46); travel px/turn 최소 tapPlace-drag = tapPlace-hold (292), 최대 classic-taptap = classic-drag (1035)
- bot2 / top: actions/turn 최소 tapPlace-drag (2.31), 최대 armed (4.94); travel px/turn 최소 tapPlace-drag = tapPlace-hold (400), 최대 armed (979)
- bot2 / low: actions/turn 최소 tapPlace-drag (2.31), 최대 armed (4.94); travel px/turn 최소 tapPlace-drag = tapPlace-hold (407), 최대 armed (1450)

## 주의

- 봇은 실수, 탐색용 pour, 되돌리기(undo)를 하지 않는다. 잘못 누른 탭, 선택 취소, 다시 고르기도 없다. 실제 사람의 입력 수와 이동거리는 이 값보다 크다 (하한으로 읽을 것).
- greedy는 일찍 죽고 pour가 적다 (초보 쪽), bot2는 오래 살고 pour가 많다 (숙련자 쪽). 사람은 그 사이 어딘가이며 방식 간 순위는 pour 비율에 따라 달라진다.
- 탭, 드래그, long-press를 모두 1 action으로 센다. 드래그 시간, long-press 대기 시간, 정확도 차이는 반영하지 않았다.
- 이동거리는 한 손가락, 직선 이동 가정. 엄지 두 개 사용이나 손가락을 떼고 쉬는 시간은 반영하지 않았다.
- 기본 규칙은 spare=false라 spare 컵 pour는 나오지 않는다.

## 재실행

```
cd C:/workspace/water-sort-survival
node research/controls/count-actions.js
node research/controls/count-actions.js --geom <다른 geom.json 경로>
```

산출물: `research/controls/out/actions-greedy.json`, `research/controls/out/actions-bot2.json`, 이 파일.
