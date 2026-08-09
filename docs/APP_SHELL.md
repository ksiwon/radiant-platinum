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
| `assets/radiant-platinum-favicon.png` | 자체 | 파비콘 |
| `assets/radiant-platinum-icon.png` | 자체 | 앱 아이콘 |
| `assets/radiant-platinum-intro.png` | 자체 | 타이틀 배경 |

세 PNG는 이 저장소를 위해 만든 그림이다. 원작 스프라이트·로고·배경을 자르거나
따라 그린 것이 아니다.

`public/assets`에 목록에 없는 파일이 있으면 `pnpm boundary:pre`가 선다. 새 파일을
넣으려면 `PUBLIC_SHELL`에 경로·출처를 적고 위 표에도 줄을 더한다.

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

⚠️ 현재 `@pkmn/sim`의 종족·기술·룰 데이터가 번들에 들어간다. 미해결
release blocker다. `docs/DEPLOY.md` §4에 크기와 다음 선택지를 적어 뒀다.

## 4. 개발 서버는 배포 수단이 아니다

`pnpm dev`는 `public/` 전체를 준다 — `public/data`(64MB)와
`public/models`(581MB)를 포함해서다. **공개 주소에 띄우면 안 된다.**
`vite preview`도 `dist/`만 주기는 하지만 CSP 응답 헤더가 없어 공개 배포로
쓰지 않는다. 공개 배포 조건은 `docs/DEPLOY.md`에 있다.
