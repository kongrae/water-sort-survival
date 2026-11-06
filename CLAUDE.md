# 보트리스: 물병 정렬 퍼즐 (water-sort-survival)

2026-11-06 작업 장소를 적으려고 만들었다. 게임 내용과 할 일은 `docs/ROADMAP.md`와 `docs/`의 문서에 있다.

## 작업 장소 (2026-11-06)

2026-11-06 사용자 결정으로 앞으로 이 게임의 모든 작업을 맥북에서 한다. 그전에는 Windows PC에서만 했다. Windows PC에서는 사용자가 그 PC에서 하라고 한 일만 한다.

- **브랜치:** `main`은 웹 게임(`water-sort-survival.html`, GitHub Pages)이다. Android 앱(`kr.hongrae.botris`)은 `android` 브랜치에 있고, Play 등록 기록은 그 브랜치의 `docs/ANDROID.md`에 있다. Windows PC에서는 `android`를 같은 저장소의 worktree(`C:\workspace\water-sort-survival-android`)로 열어 두었다. 맥에서도 `git worktree add ../water-sort-survival-android android`처럼 따로 연다.
- **Android:** 빌드 환경과 업로드 키 옮기기는 `android` 브랜치 `docs/ANDROID.md`의 '맥으로 옮기기'를 따른다.
- **Windows 전용 스크립트:** `deploy-pages.ps1`(Pages 배포)은 GitHub 인증을 `cmd.exe`로 읽어 Windows에서만 돈다. 맥에서는 PowerShell 7(`pwsh`)을 설치해 Windows 전용 부분을 고쳐 쓰거나, 같은 일을 하는 맥 스크립트를 만든다. Firestore 규칙 배포(`deploy-firestore.ps1`, `firebase.json`)는 아직 git에 없다(아래).
- **git에 없는 작업:** 2026-11-06 기준 Windows PC의 `main`에는 커밋 안 된 변경 7개(`.gitignore`, `docs/ROADMAP.md`, `uitest/` 5개)와 git에 한 번도 안 들어간 파일 3,331개가 있다. `research/`(약 716MB, `docs/ROADMAP.md`가 가리키는 보고서 포함), `route/`, `campaign/`, `delivery/README.md`, `deploy-firestore.ps1`, `firebase.json`, `assets/icons/`, `scripts/`·`uitest/`의 새 파일들이다. 맥에서 clone하면 이것들이 없다. 공개 저장소에 올릴지, 폴더를 직접 옮길지는 사용자가 정한다.
- **헤드리스 Chrome:** `uitest/`와 `scripts/`의 도구는 Chrome을 `$CHROME`, 없으면 Windows 경로에서 찾는다. 맥에서는 `CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`을 준다.
