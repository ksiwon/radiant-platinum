# 앱 셸 — 배포물에 실리는 것과 그 출처

공개 서버가 내보내는 바이트 전부의 목록이다. 여기 없는 파일은 배포물에 없다.

정본은 문서가 아니라 [`tools/distribution/appShell.mjs`](../tools/distribution/appShell.mjs)의
`PUBLIC_SHELL`이다. 이 문서는 그 목록의 **근거**를 적는다 — 목록만 있으면 왜
나가도 되는지 아무 데도 안 남는다.

## 1. `public/`에서 나가는 것

파일 단위로 적는다. 폴더 단위로 적으면 그 아래에 무엇이 생기든 심사 없이 실린다.

| 경로 | 출처 | 무엇 |
|---|---|---|
| `manifest.webmanifest` | 자체 | PWA 매니페스트. 손으로 쓴 JSON |
| `sw.js` | 자체 | 앱 셸 전용 service worker. 손으로 쓴 JS |
| `assets/radiant-platinum-favicon.svg` | 자체 | 파비콘 31KB. 아이콘을 128px 무손실로 담은 SVG |
| `assets/radiant-platinum-favicon.png` | 자체 | 파비콘 64px 7.4KB — SVG 파비콘을 안 받는 브라우저용 |
| `assets/radiant-platinum-icon.png` | 자체 | 앱 아이콘 512px 254KB · apple-touch-icon |
| `assets/radiant-platinum-intro.webp` | 자체 | 타이틀·설치 화면 배경 403KB |
| `fonts/Galmuri11.woff2` | Galmuri11 (SIL OFL 1.1) | 대사창 픽셀 글꼴 493KB |
| `fonts/Pretendard-Regular.subset.woff2` | Pretendard (SIL OFL 1.1) | UI 본문 261KB |
| `fonts/Pretendard-Bold.subset.woff2` | Pretendard (SIL OFL 1.1) | UI 굵은 글씨 264KB |
| `fonts/NotoSansJP-Regular.subset.woff2` | Noto Sans JP (SIL OFL 1.1) | 일본어 UI 33KB |
| `fonts/NotoSansJP-Bold.subset.woff2` | Noto Sans JP (SIL OFL 1.1) | 일본어 UI 굵은 글씨 33KB |
| `fonts/Galmuri-OFL.txt` | 자체 | Galmuri 허가문 |
| `fonts/Pretendard-OFL.txt` | 자체 | Pretendard 허가문 |
| `fonts/NotoSansJP-OFL.txt` | 자체 | Noto Sans JP 허가문 |

**일본어 글꼴 둘은 `pnpm gen:jpFont`이 굽는다** (`tools/fonts/jpSubset.py`).
가나·전각기호만 남긴 서브셋이고 `@font-face`에 `unicode-range`가 걸려 있어서
한국어·영어로 노는 사람은 안 받는다. 왜 한자를 안 넣었는지는 DESIGN.md §4에 있다.

⚠️ **그 범위에 Pretendard가 이미 가진 글자를 넣으면 「안 받는다」가 거짓이 된다.**
한때 `U+2026`과 `U+3008-300F`(… 〈〉《》「」『』)가 들어 있어서, 타이틀 화면의
한국어 안내문에 쓰인 낫표 두 쌍 때문에 **모든 첫 방문이 33.8kB를 받아 갔다**
(`.audit/probe/wire.mjs` 실측 · DEPLOY.md §3).

⚠️ Noto Sans JP의 예약 이름은 **'Source'**지 'Noto Sans JP'가 아니다
(Source Han Sans에서 왔다). 그래서 서브셋을 만들고도 이름을 그대로 쓸 수 있다.

**그림 넷은 `art/`의 마스터에서 굽는다** — `pnpm assets:art`. 마스터(PNG 3.5MB)는
저장소에 있고 배포물에는 안 들어간다. 굽는 값과 그 근거는 `tools/assets/shellArt.py`
머리말에 있다.

넷 다 이 저장소를 위해 만든 그림이다. 원작 스프라이트·로고·배경을 자르거나
따라 그린 것이 아니다. **그렇다고 공개해도 되는 것은 아니다** — 아래 §3-1.

파비콘 SVG는 선으로 따라 그린 벡터가 아니라 아이콘 원본 픽셀을 담은 것이다.
금빛 기울기를 벡터로 추적하면 색 띠가 생기고, 색을 256단계로 눌러 담아도
픽셀당 최대 60/255 어긋난다 — 실측하고 무손실로 뒀다.

### 1.1 글꼴 — 유일한 남의 바이트

**글꼴 셋만 우리 것이 아니다.** 둘 다 SIL Open Font License 1.1이고, OFL은
글꼴 파일을 그대로 재배포하는 것을 허용한다. 조건은 하나 — **허가문을 같이
싣는 것**이다. 그래서 `.txt` 둘이 같은 목록에 있고, `check.mjs` ①-c가
「출처가 `자체`가 아니면 `license`가 배포물에 같이 나가는지」를 잰다.
허가문을 목록에서 빼면 빌드가 선다.

원작(롬·BDSP) 유래는 이 길로도 못 나간다. 그건 목록이 아니라 내용 검사가
잡는다 (§2 마지막 문단).

⚠️ **`public/fonts`가 목록에 없던 동안 배포물에서 통째로 빠졌다.**
`copyPublicDir: false`라 개발 서버에서는 멀쩡히 보이고 **빌드에서만**
`@font-face`가 404였다 — 그러면 화면이 시스템 글꼴로 조용히 폴백해서,
글꼴을 실은 것과 안 실은 것이 개발 기계에서는 구분이 안 된다.
`public/`에 새 폴더를 만들었으면 이 목록을 먼저 본다.

`public/assets`·`public/fonts`에 목록에 없는 파일이 있으면 `pnpm boundary:pre`가
선다. 새 파일을 넣으려면 `PUBLIC_SHELL`에 경로·출처를 적고 위 표에도 줄을 더한다.

## 2. `public/data`와 `public/models`

배포물에 **안 나간다.** 개발 기계에는 그대로 있고 개발 서버는 그대로 준다
(COPYRIGHT.md §5). 갈리는 것은 빌드뿐이다 — `copyPublicDir: false`라서 Vite가
`public/`을 통째로 복사하지 않고, 위 목록만 `emitFile`로 옮긴다.

빌드가 끝나면 `pnpm boundary:post`가 실제 `dist/`를 다시 훑어 원본 유래 경로·
확장자가 하나도 없는지 센다. 목록이 맞다는 주장과 실제로 나온 파일은 다른
것이라 둘 다 본다.

## 3. 번들에 들어가는 것 (`dist/assets/*.js`)

위 표는 `public/`에서 **복사**되는 것이고, 번들은 `src/`와 `node_modules/`에서
**컴파일**되어 나온다. 그쪽 출처는 `pnpm provenance`가 청크별로 뽑는다 —
`docs/DEPLOY.md` §4.

⚠️ `@pkmn/sim`의 게임 데이터가 8,881kB 들어가던 것을 빌드에서 **0으로**
줄였다 (`tools/distribution/pkmnDiet.mjs`). 0이 아니므로 release blocker는
그대로다 — 무엇을 뺐고 무엇이 왜 남았는지는 `docs/DEPLOY.md` §4.

배포물 JS에 `eval(`은 **0건**이다. 매 빌드 `boundary:post`가 다시 잰다.
소스맵도 0개다 — 있으면 뺀 것이 원문으로 되돌아온다.

## 3-1. 셸 그림에 무엇이 그려져 있는가

⚠️ **바이트 검사가 절대 못 잡는 자리다.** 위 그림 넷은 전부 우리가 만든 것이라
출처 검사도 매직바이트도 히스토리 감사도 다 통과한다. 그런데 화면을 열어 보면
(`node tools/shot/title.mjs`) 타이틀 배경에 금속 질감의 `POKEMON` 워드마크가
그려져 있고, 아이콘의 주인공은 원작 캐릭터로 보이는 형상이다.

그래서 그림마다 **무엇을 그렸는지** 적는다
([`tools/distribution/shellArt.mjs`](../tools/distribution/shellArt.mjs)).
목록에 없는 그림이 셸에 들어오면 빌드가 서고, 워드마크나 캐릭터가 적혀 있으면
공개 배포가 막힌다 (`brand-art` blocker). 자세한 것은 `COPYRIGHT.md` §11.

## 4. 개발 서버는 배포 수단이 아니다

`pnpm dev`는 `public/` 전체를 준다 — `public/data`(64MB)와
`public/models`(581MB)를 포함해서다. **공개 주소에 띄우면 안 된다.**
`vite preview`도 `dist/`만 주기는 하지만 CSP 응답 헤더가 없어 공개 배포로
쓰지 않는다. 공개 배포 조건은 `docs/DEPLOY.md`에 있다.
