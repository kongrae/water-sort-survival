# Android 앱과 Google Play 등록

2026-10-12 시작. 웹 게임(`water-sort-survival.html`)을 상어 SOS(`C:\workspace\bukang-sea`)와 같은 방식(Capacitor 8)으로 감싼 Android 앱이다. 게임 코드는 웹과 같고, 앱 빌드에서만 아래 두 가지가 다르다(`build-pages.js --app`).

- **클라우드 저장 없음**: Google은 앱 안 WebView에서 구글 로그인을 막는다. 그래서 `FIREBASE_CONFIG`를 `null`로 바꾸고 설정의 '저장' 칸을 숨긴다. 기록은 기기에만 남는다.
- **글꼴 내장**: Google Fonts 링크 대신 `assets/fonts/`의 글자 서브셋(Jua, IBM Plex Sans KR 400/500/700, SIL OFL)을 data URL로 넣는다. 오프라인에서도 같은 글꼴이 나오고 실행 중 외부 요청이 없다. 새 한글을 넣었는데 빌드가 경고하면 `node scripts/app-fonts.js`를 다시 실행한다.

## 명령

```bash
npm install                 # Capacitor 8 (Node 22 이상)
npm run build:app           # www/index.html (앱용 빌드)
npm run android:debug       # build:app + cap sync + 디버그 APK
npm run android:release     # build:app + cap sync + 서명된 AAB
node scripts/store-art.js   # 아이콘·스플래시 원본(assets/)과 스토어 아이콘·그래픽 이미지(store/)
node scripts/store-shots.js # 스토어 스크린샷 6장(store/screenshots/, 1080x1920). build:app 먼저
```

- 아이콘·스플래시를 바꾸면 `node scripts/store-art.js` 뒤에 `npx @capacitor/assets@3.0.5 generate --android --iconBackgroundColor "#0f171c" --iconBackgroundColorDark "#0f171c" --splashBackgroundColor "#0f171c" --splashBackgroundColorDark "#0f171c"`로 `android/` 리소스를 다시 만든다. 원본 그림은 `store/art/bottle.svg`(게임의 물 색 `--liq0~3`, 코르크 `--liq8`).
- JDK 21(`~/.jdks/jdk-21*`)과 Android SDK(`%LOCALAPPDATA%\Android\Sdk`)는 상어 SOS와 같이 쓴다. `scripts/android.js`가 그 JDK로 Gradle을 실행한다.
- 세로 고정, 진동 권한(`navigator.vibrate`), 상태바는 어두운 배경용(SystemBars DARK), Android 12 이상 시스템 스플래시 배경 `#0f171c`.
- 출시 빌드는 작업 중인 파일이 섞이지 않도록 커밋된 상태의 깨끗한 worktree에서 만든다.

## 앱 정보

- 패키지 이름 **`kr.hongrae.botris`**(2026-10-12 사용자 확정). 첫 업로드 후에는 바꿀 수 없다.
- 앱 이름: 홈 화면 `보트리스`, 스토어 제목 `보트리스: 물병 정렬 퍼즐`(`docs/STORE_LISTING_ko.md`).
- 버전: `android/app/build.gradle`의 `versionCode`/`versionName`. Play에 올릴 때마다 versionCode를 1씩 올린다. 첫 업로드는 1(`1.0`).
- **업로드 키**: `C:\Users\hongrae\.android-keys\botris-upload.jks`(PKCS12, alias `upload`, RSA 2048, 10000일). 비밀번호는 `android/keystore.properties`(gitignore)에만 있다. 두 파일을 함께 백업한다. Play App Signing(기본값)을 쓰므로 잃어버리면 Play Console에서 업로드 키 재설정을 요청할 수 있다(며칠 걸림). 상어 SOS 키와 따로 쓴다.

## 스토어 등록 자료

- 아이콘 `store/icon-512.png`, 그래픽 이미지 `store/feature-graphic.png`(1024x500), 휴대전화 스크린샷 `store/screenshots/1~6`(1080x1920, 실제 엔진으로 봇이 둔 판). 아이콘과 그래픽 이미지는 코드(SVG)로 그렸고 AI 생성물이 아니다.
- 개인정보처리방침: `store/privacy.html` → Pages `https://kongrae.github.io/water-sort-survival/privacy.html`(`build-pages.js`가 `dist/`에 복사).
- 제목·짧은 설명은 `docs/STORE_LISTING_ko.md`. 자세한 설명:

```
물 정렬과 콤보의 만남! 보트리스는 끝없이 들어오는 물 조각을 병에 넣고, 병끼리 부어 한 색으로 채우는 무한 워터 소트 퍼즐입니다.

■ 이렇게 플레이해요
• 조각 넣기: 아래에 나온 조각을 빈칸이 충분한 병에 넣어요.
• 붓기: 병을 누르고 다른 병을 누르면 맨 위 색이 옮겨가요.
• 완성: 한 색으로 가득 찬 병은 비워지고 점수를 얻어요.
• 콤보: 완성을 이어 가면 콤보 배수가 올라가요.
• 게임 오버: 조각을 넣을 자리를 만들 수 없으면 끝나요.

■ 점점 넓어지는 판
점수가 오르면 새 색이 도착하고 빈병이 하나씩 생겨요. 조각 뒤집기, 보관(홀드), 3칸 조각, 색상 도전이 차례로 열리며 판이 점점 깊어집니다.

■ 오늘의 도전
매일 모두가 같은 조각 순서로 플레이해요. 결과를 복사해 친구와 점수를 비교해 보세요.

■ 테마
별을 모아 실험실·카페·보석·심해 테마를 열어 보세요.

■ 이런 분께 추천해요
• 물 정렬 퍼즐을 좋아하지만 정해진 스테이지가 아쉬웠던 분
• 짧게 한 판, 길게는 최고 기록에 도전하고 싶은 분

회원가입 없이 바로 플레이할 수 있고, 기록은 기기에만 저장됩니다. 한국어·영어·일본어 등 9개 언어를 지원합니다.
```

## Play Console 설문 답변

- 앱 또는 게임: 게임 / 무료 / 카테고리: 퍼즐
- 앱 액세스: 모든 기능을 제한 없이 사용 가능(로그인 없음)
- 광고: 없음. 현재 빌드의 '광고 보고 이어하기'·'보상형 광고 자리'는 광고 SDK 없이 자리만 보여 주는 화면이다. AdMob을 넣으면 광고 답변·데이터 보안·개인정보처리방침·타겟층을 함께 바꾼다.
- 콘텐츠 등급(IARC): 폭력·성적 콘텐츠·욕설·약물·도박·사용자 간 상호작용·위치 공유·디지털 상품 구매 모두 아니요 → 전체이용가 예상
- 타겟층: 13세 이상(나중에 광고를 넣을 때 가족 정책 부담이 없음)
- 데이터 보안: 수집·공유하는 데이터 없음(앱은 외부 통신이 없다. 웹의 구글 로그인은 앱에 없음)
- 광고 ID: 사용 안 함 / 정부 앱·금융 기능·건강: 해당 없음
- 연락처 이메일: 상어 SOS와 같은 개발자 계정 연락처(`sky7700sky@naver.com`, 개인정보처리방침 7항)

## 진행 상태

### 2026-10-12

- 빌드: 커밋 3d94e85(13색·12병 확장) 위의 `android` 브랜치에서 versionCode 1(`1.0`) AAB를 만들었다. 업로드용 파일 `android/app/build/outputs/bundle/release/botris-v1-1.0.aab`(업로드 키 서명·내장 웹 빌드·매니페스트 확인). 에뮬레이터(`launchpad` AVD)에서 디버그 빌드 실행·조각 넣기 확인 후 디버그 앱은 지웠다.
- 개인정보처리방침을 gh-pages에 추가했다(게임 페이지는 그대로). `https://kongrae.github.io/water-sort-survival/privacy.html`
- Play Console: 앱 `보트리스: 물병 정렬 퍼즐`(앱 ID 4972256028439046801, 기본 언어 한국어, 게임·무료, 자동 보호 기본값 사용) 생성. 개인정보처리방침 URL, 로그인 세부정보(제한 없음), 광고(없음), 콘텐츠 등급(IARC 전부 아니요 → 한국 전체이용가·PEGI 3), 타겟층(13세 이상), 데이터 보안(수집·공유 없음), 광고 ID(미사용), 정부 앱·금융 기능·건강(해당 없음), 스토어 설정(게임/퍼즐, 연락처 `sky7700sky@naver.com`) 저장. 기본 스토어 등록정보는 짧은 설명·자세한 설명만 임시 저장(아이콘·그래픽 이미지·스크린샷 업로드 전). 비공개 테스트 'Alpha' 트랙(ID 4700786012860136707): 국가 178개, 테스터 목록 `보트리스 테스터`(새 목록, 개발자 계정 1명), 의견 이메일 `sky7700sky@naver.com`. 앱 내 브라우저는 PC 파일을 직접 고르지 못해, 이미지·AAB는 사용자 승인 후 Chrome 확장(파일 업로드 도구)으로 올렸다. Chrome 기본 계정은 회사 계정이라 Play Console 주소에 `?authuser=ghdfo918@gmail.com`을 붙여 `/u/1/`로 연다(그냥 열면 '개발자 계정 만들기'로 간다). 아이콘·그래픽 이미지·스크린샷 1~6(순서대로, AI 애셋 라벨 지정 안 함)을 기본 스토어 등록정보에 저장하고, Alpha 트랙에 출시 `1 (1.0)`(출시 노트 한국어, 경고는 난독화 매핑 파일 없음뿐, 설치 크기 3.31MB, API 24 이상·타겟 36)을 저장했다. 게시 개요의 변경사항 16개를 사용자 확인 후 2026-10-12 Google 검토로 제출했다(관리형 게시 꺼짐이라 승인 즉시 비공개 테스트로 게시). 같은 날 승인돼 Alpha 트랙이 활성(최신 1 (1.0), 178개 국가)이 됐다. 참여 링크: 웹 `https://play.google.com/apps/testing/kr.hongrae.botris`, Android `https://play.google.com/store/apps/details?id=kr.hongrae.botris`.
- 스몰뎁: 앱 등록(앱 ID `9359221c-c728-4c88-a981-fc6033ac0b07`, 비공개 테스트, 출시 국가 110개=전체, 아이콘 없음). 테스트 품앗이 요청은 Play 비공개 테스트 승인 뒤 올린다. 참여자에게는 등록 알림 1일·설치 2일 기한이 있어, 승인 전 모집하면 상대가 설치할 수 없기 때문이다. 요청 양식: 테스트 설명(필수), 모집 인원(기본 30, 상어 SOS는 20), 시작 후 계속 모집·전체 알림(기본 켬), 모집 방법 '링크로 초대'.
- 새 아이콘(사용자 제작, 이미지 생성 프롬프트는 `assets/icons/botris-icon-v1.prompt.txt`): `assets/icons/botris-icon-v1-1024.png`에서 `node scripts/store-art.js`로 런처·적응형(@capacitor/assets가 레이어를 16.7% 안쪽에 넣으므로 원본 정사각형=보이는 영역)·스플래시 원본을 다시 만들고, versionCode 2(`1.1`) AAB를 빌드했다(설치 크기 5.04MB, 지원 기기 변화 없음). Play 스토어 아이콘은 사용자가 만든 `assets/icons/botris-icon-v1-playstore-512.png`(601KB)를 쓰고 'AI로 생성 또는 수정한 애셋' 라벨을 아이콘에만 지정했다(그래픽 이미지는 코드 SVG, 스크린샷은 실제 화면이라 지정 안 함). 파일 선택은 앱 내 브라우저의 파일 창에서 사용자가 했다(이 PC에서만 작업, Chrome 확장 미사용). Alpha `2 (1.1)`(출시 노트 '앱 아이콘을 새 디자인으로 바꿨습니다.')과 스토어 아이콘 변경 2개를 사용자 확인 후 검토로 제출했다. 다음 versionCode는 3.
- 스몰뎁 테스트 품앗이 등록은 실패했다. 웹(POST `/api/devfeedback/tests` → 500 '테스트 요청 생성에 실패했습니다.', 2회)과 에뮬레이터 스몰뎁 앱(요청이 생성되지 않음) 모두 같았다. 원인은 서버가 알려 주지 않는다. 게시판에 '크레딧이 없어 등록이 안 된다'는 다른 이용자 글이 있고, 이 계정 신뢰도는 1점이다. 운영자 문의 초안만 작성했다. 에뮬레이터 스몰뎁 앱의 'Device ID 변경' 질문은 '아니오'로 두었다. 앱 양식은 2단계다(설명·전체 알림·시작 후 모집·애널리틱스 → 모집 방식 이메일/구글 그룹스/프로모션 코드, 최대 인원). 한글은 PC 클립보드 → 에뮬레이터 붙여넣기로 넣는다.
