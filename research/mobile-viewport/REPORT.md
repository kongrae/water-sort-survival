# 모바일 기본 테마와 페이지 스크롤 수정

2026-10-09, 보트리스: 물병 정렬 퍼즐.

휴대폰 OS가 밝은 모드여도 기본 게임 화면과 네 가지 병 스킨은 블랙 테마로 시작한다. 게임 화면의 터치·휠 스크롤은 차단하고, 설정·규칙 창 내부의 스크롤과 닫기 버튼은 유지한다. 이전 작업의 병 높이 복원·물줄기·완성·콤보 연출도 이번 배포에 포함한다.

## 원인과 변경

- 색상은 밝은 팔레트가 기본이고 prefers-color-scheme: dark에서만 어두운 팔레트를 적용했다. 기본 팔레트를 OS와 무관하게 어둡게 적용하고 명시적인 light 검증 화면은 유지했다. Pages의 초기 color-scheme과 주소창 theme-color도 어둡게 지정했다.
- 페이지의 overflow와 overscroll을 제한하지 않았으며 touch-action: none은 병과 조각에만 적용됐다. HTML의 스크롤을 차단하고 body를 고정된 100dvh 화면으로 만든 뒤, 게임 영역에서는 세로 팬을 차단했다. 화면 확대를 위한 pinch-zoom은 유지한다.
- safe-area 여백이 HTML에 있었는데 body가 높이 100%를 사용했다. 여백을 body 안으로 옮겨 중복 높이를 제거하고, 병 크기를 계산할 때 실제 body·시각 뷰포트·위아래 안전 여백을 함께 반영했다.
- 짧은 화면에서는 여백·점수·현재 조각을 먼저 조정하고 필요한 경우 액체 칸 높이를 10px까지 줄인다. 기본 확장형의 병 조작 너비는 44px 이상이고 하단 버튼은 44px를 유지한다. 오늘의 도전·기존 커스텀 판에도 한 줄과 각 용량에 맞는 높이 계산을 적용했다.
- 설정·규칙 창은 별도의 overflow: auto, pan-y, overscroll containment를 사용한다. 닫기 버튼은 기존 sticky 헤더를 유지한다.

## 검증

| 검사 | 결과 |
|---|---|
| node uitest/mobile-viewport.js | 68/68: OS 밝음/어두움·4스킨, 네이티브 터치·휠, 9언어, 안전 여백과 뷰포트 축소, 오늘의 도전 배치·터치, 설정 창 스크롤·닫기, 첫 실행 규칙 |
| node uitest/uiux.js | 110/110: 기본 화면·성장·위/아래 트레이·다이얼로그·키보드·폰트 장애 |
| node uitest/fx-polish.js | 122/122: 효과·빠른 입력·정리·예산·다국어 성장 안내 |
| node uitest/real.js | 131/131: 기존 두 조작 방식의 실제 Chrome 터치·마우스·드래그·길게 누르기 |
| node research/uiux/baseline.js | 엔진 SHA-256 동일 |
| node build-pages.js | 345개 메시지·9언어 빌드 |
| git diff --check | 통과 |

| CSS 뷰포트 | 안전 여백 위/아래 | 하단 버튼 끝 | 결과 |
|---|---:|---:|---|
| 360×640 | 0/0 | 632px | 화면 내부 |
| 360×600 | 24/24 | 576px | 안전 여백 내부 |
| 390×844 | 47/34 | 810px | 안전 여백 내부 |
| 390×724 | 47/34 | 690px | 안전 여백 내부 |
| 412×915 | 24/24 | 887px | 안전 여백 내부 |

엔진 해시: 1797179475c5812719a0f3555fb5fb654e3f31770a401b3db2025876dc22b832. 게임 규칙과 wsurv.* 저장 계약은 수정하지 않았다.

## Pages 배포 검증과 재실행

배포 대상은 https://kongrae.github.io/water-sort-survival/ 이며 기존 deploy-pages.ps1을 사용한다. 원래 공개 주소의 index.html SHA-256을 실제 gh-pages 커밋의 파일과 비교하고, version.json의 sourceCommit이 현재 소스 커밋과 같은지 확인한다. HTTP 200만으로 최신 배포라고 판단하지 않는다.

```powershell
node research/mobile-viewport/verify-public.js
node uitest/mobile-viewport.js --public-only --url=https://kongrae.github.io/water-sort-survival/
```

배포 확인 결과는 outputs/mobile-viewport/deployment.json, 공개 페이지의 OS 밝은 모드·네이티브 스크롤 검사 결과는 published.json, 화면은 published-dark.png에 기록한다. 로컬 68개 결과와 화면은 checks.json, mobile-dark.png에 기록한다. outputs는 Git에서 제외된다.

## 검증 범위

격리된 Chrome에서 실제 터치·휠 이벤트를 보냈다. 현재 Chrome에는 native safe-area emulation이 없어 검증 문서의 env 값을 CSS 변수로 치환했다. 실제 기기의 노치·홈 바·주소창 동작이나 Safari 실기기 검증은 수행하지 않았다. 회전 후 세로 화면 복귀와 게임 상태 보존을 확인했으며 가로 화면의 전체 배치 적합성을 검증한 것은 아니다.
