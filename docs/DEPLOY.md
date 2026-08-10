# 배포

공개 서버에 무엇을 올리고, 올리기 전에 무엇을 통과해야 하는지.

기술적인 무전송·무배포 경계를 지키는 것이 이 문서의 범위다. **그것이 법적
면책을 뜻하지 않는다** — 남는 위험은 COPYRIGHT.md §3에 있다.

## 1. 지금은 못 올린다

미해결 release blocker가 있다. `pnpm release:check`가 실패한다.

정본은 [`tools/distribution/blockers.mjs`](../tools/distribution/blockers.mjs)고
**손으로 관리하는 목록이 아니다** — 하나하나가 `resolved()`로 직접 재고, 재서
풀렸으면 스스로 빠진다. 손으로 지우는 목록은 일이 끝나서가 아니라 잊혀서 비워진다.

| # | blocker | 지금 (2026-08-10) | 어디 |
|---|---|---|---|
| 1 | 번들에 제3자 정적 게임 데이터 | ⛔ 110개 모듈 · 8.5MB | §4 |
| 2 | CSP 응답 헤더를 실제 호스트에서 잰 적이 없다 | ⛔ 호스트 미정 | §3 |
| 3 | BDSP 변환이 없어 3D 에셋을 만들 수 없다 | ⛔ spike 막힌 자리 3곳 | IMPORT.md §12 |
| 4 | 배포물이 어느 커밋에서 나왔는지 말할 수 없다 | ✅ `0.1.0+f9b9c94` | §2 |
| 5 | `public/data/**`가 Git 히스토리에 남아 있다 | ⛔ 커밋 44개 | COPYRIGHT.md §9 |

④는 조건부다 — 깨끗한 나무에서 빌드하면 스스로 빠지고, 커밋 안 한 변경이
섞이거나 CI 밖에서 빌드하면 다시 선다. 그것이 자기가 재는 blocker의 모양이다.

blocker와 **위반**은 다르다. 위반은 지금 고칠 수 있는 것이라 `pnpm build`를
세운다. blocker는 아직 못 고친 것이라 빌드는 통과시키고 매번 숫자를 찍되,
`--release`에서 실패로 바꾼다. 개발이 멈추지 않으면서 공개는 막힌다.

## 2. 무엇이 올라가는가

`dist/`뿐이다. 그 안에 들어가는 것은 두 갈래고 각각 따로 심사한다.

| 갈래 | 무엇 | 심사 |
|---|---|---|
| 복사 | `public/`의 앱 셸 5개 | `appShell.mjs` 파일 단위 allowlist · docs/APP_SHELL.md |
| 컴파일 | `src/` + `node_modules/` → `assets/*.js` | `pnpm provenance` (§4) |

`public/data`(64MB)와 `public/models`(581MB)는 개발 기계에 그대로 있고
`dist/`에 **안 들어간다** — `copyPublicDir: false`이고 셸 목록에 없다.
빌드 뒤 `boundary:post`가 실제 `dist/`를 다시 훑어 그것을 확인한다.

⚠️ **`pnpm dev`는 배포 수단이 아니다.** 개발 서버는 `public/` 전체를 준다 —
645MB를 포함해서다. 공개 주소에 띄우면 안 된다. `vite preview`도 CSP 응답
헤더가 없으므로 공개 배포로 쓰지 않는다.

### `src/` 안의 자료 표

경로 규칙은 이것들을 하나도 못 봤다. `src/**/*.json`은 `public/data` 검사에
안 걸리고 이름도 `.json`이라 `dist` 규칙도 통과한다. 그런데 그 안에 롬에서
읽은 값이 있을 수 있다 — 실제로 있었다.

정본은 [`tools/distribution/dataTables.mjs`](../tools/distribution/dataTables.mjs)이고
**목록에 없으면 빌드가 선다.** `inBundle: false`는 주장이 아니라 검사 대상이다:
빌드 뒤에 표식 문자열을 `dist/`에서 실제로 찾아본다.

| 표 | 무엇 | 배포물에 |
|---|---|---|
| `src/import/platinum/supported.json` | 지역판 지문 · ARM9 표 자리와 개수 | 들어간다 (§2 메타데이터) |
| `src/data/textBanks.json` | 뱅크 697개의 이름·상수·**복호화 키(u16)**·인덱스 | 안 들어간다 (측정) |

⚠️ **`textBanks.json`은 미해결이다.** `key`는 사용자 롬 뱅크 헤더 +2의 u16을
그대로 옮긴 값이라 "자리와 개수"가 아니다. 배포물에는 안 들어가지만 리포와
히스토리에는 있다. 지우려면 `tools/extract/textbanks.js`가 (키, 엔트리 수)
쌍으로 ko·ja 인덱스를 확정하는 근거와 `textBanks.test.ts`의 유일성 검사를
대신할 것이 있어야 한다.

### 이 배포물이 어디서 나왔는가

빌드가 `.audit/build.json`에 판과 신원을 적는다.

| | |
|---|---|
| `version` | `package.json`의 SemVer. **비교해도 되는 것은 이것뿐이다** |
| `buildId` | `dev` · `a1b2c3d` · `a1b2c3d-dirty` |

⚠️ **한 문자열로 두지 않는다.** SemVer에서 `+` 뒤는 빌드 메타데이터라
우선순위를 안 바꾼다 — `0.1.0+dev`와 `0.1.0+a1b2c3d`는 SemVer상 같은 판이다.
호환 판정에 그 문자열을 쓰면 "다르게 생겼으니 다른 판"으로 잘못 읽는다.
봉투에 적히는 `0.1.0+a1b2c3d`는 사람이 버그를 재현할 때 쓰는 표시다.

`-dirty`와 `dev`는 릴리스에서 막는다 (blocker 4). 커밋 안 한 나무에서 나온
배포물은 **재현이 안 된다** — 해시가 가리키는 소스가 실제로 돌아간 소스가 아니다.

### 첫 화면 예산

`boundary:post`가 `dist/index.html`이 적어 둔 것(진입 스크립트 ·
modulepreload · 스타일시트)을 gzip해서 잰다. 목록을 손으로 안 적는 이유는
코드 쪼개기가 바뀔 때마다 갈라지기 때문이다.

| | gzip |
|---|---:|
| 예산 (PLAN §10.4) — 넘으면 빌드가 선다 | 150.0kB |
| 내부 목표 — 넘으면 경고 | 135.0kB |
| 실측 (2026-08-10) | **142.3kB** |

목표를 예산보다 낮게 둔 것은 "통과했다"와 "간신히 통과했다"를 가르기 위해서다.
지금은 목표를 넘었고 예산까지 7.7kB 남았다 — 다음 화면 하나에 넘길 폭이다.

## 3. CSP — 응답 헤더가 필수다

정본은 [`tools/distribution/csp.mjs`](../tools/distribution/csp.mjs)의 `CSP`다.

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
media-src 'self' blob:;
connect-src 'self' blob:;
worker-src 'self';
font-src 'self';
manifest-src 'self';
frame-src 'none';
object-src 'none';
base-uri 'none';
form-action 'none';
frame-ancestors 'none'
```

`connect-src 'self' blob:`가 무전송 경계다 — 바깥 오리진이 없으니 사용자가
고른 롬 바이트가 나갈 곳이 없다.

### meta로 대신할 수 없다

빌드가 `<meta http-equiv="Content-Security-Policy">`도 넣지만 **그것으로 CSP가
있다고 세지 않는다.** 셋이 다르다:

- `frame-ancestors`는 meta에서 **무시된다.** 클릭재킹을 막는 것은 헤더뿐이다
- meta는 그 태그를 파싱하기 **전에** 시작된 요청을 못 막는다
- meta는 `report-uri`/`report-to`를 못 쓴다

meta를 넣는 이유는 헤더가 잘못 설정된 채 올라갔을 때 아무 방어도 없는 것보다는
낫기 때문이지, 헤더를 대신하기 때문이 아니다.

### 안 넣는 것

- `wasm-unsafe-eval` — BDSP 변환에 WASM이 실제로 필요하다고 증명되기 전에는
  필요 없는 완화다 (IMPORT.md §12). 필요해지면 그때 근거와 함께 넣는다
- `unsafe-eval` — 아래 참조
- 바깥 report endpoint — 그 자체가 바깥 전송이다

### ⚠️ 번들에 `eval`이 하나 있다

`@pkmn/sim`의 `sim/battle-stream.mjs:162`가 직접 `eval(message)`를 부른다.
빌드가 매번 경고를 낸다. `script-src 'self'`에는 `'unsafe-eval'`이 없으므로
**그 줄이 실행되면 `EvalError`로 죽는다.**

지금은 안 죽는다 — 그 경로는 입력 줄이 `>eval …`로 시작할 때만 도는 디버그
기능이고 우리는 그런 줄을 보내지 않는다. CSP는 파싱이 아니라 **호출**을 막으므로
번들에 있는 것만으로는 아무 일도 안 일어난다.

`'unsafe-eval'`을 넣어 무마하지 않는다. 디버그 기능 하나 때문에 페이지 전체의
스크립트 정책을 여는 것은 맞바꿈이 안 맞는다. §4의 리팩터링에서 `@pkmn/sim`
의존이 정리되면 이 줄도 함께 사라진다.

### 그 밖의 헤더

| 헤더 | 값 |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `Strict-Transport-Security` | `max-age=31536000` (https일 때) |
| `Cross-Origin-Opener-Policy` | `same-origin` |

`Cross-Origin-Embedder-Policy`는 **안 켠다.** `SharedArrayBuffer`를 안 쓰고,
켜면 blob:/data: 로딩 규칙이 까다로워져 OPFS 경로가 흔들린다. 필요해지는
날 다시 본다.

### 호스트는 아직 안 정했다

Vercel·Cloudflare·Netlify 중 무엇을 쓸지 정해진 바 없으므로 이 저장소에
그중 하나의 설정 파일을 넣지 않는다. **조건은 하나다: 위 응답 헤더를 실제로
붙일 수 있어야 하고, SPA fallback이 돌아야 한다.**

주소가 생기면:

```
pnpm verify:deploy https://<주소>/
```

그 검사를 통과한 적이 없으면 blocker 2번은 그대로다. **통과로 위장하지 않는다.**

## 4. 번들 출처 — 미해결 blocker

`pnpm build`가 `.audit/bundle-provenance.json`을 남기고 `pnpm provenance`가
사람이 읽게 찍는다. `dist/`에는 안 넣는다 — 배포물이 아니라 감사 기록이고,
모듈 경로에 개발 기계의 절대 경로가 들어간다.

### 실측 (2026-08-10)

`dist/assets/battle-sim-*.js` = 6,547,238바이트 (gzip 1,034kB). 그 안:

| 갈래 | minify 전 |
|---|---:|
| `@pkmn/sim` **정적 게임 데이터** (110개 모듈) | 8,673kB |
| 엔진 코드 | 483kB |

18:1이다. 큰 것부터: `data/learnsets.mjs` 4,228kB · `data/pokedex.mjs` 562kB ·
`data/text/moves.mjs` 522kB · `data/mods/gen8bdsp/learnsets.mjs` 503kB ·
`data/moves.mjs` 469kB · `data/legality.mjs` 404kB.

### 왜 blocker인가

`@pkmn/sim`은 MIT다. 그러나 **패키지의 라이선스와 그 패키지에 담긴 게임
데이터를 우리가 배포할 권리는 다른 질문이다.** 종족값·습득기술·기술 위력은
Pokémon Showdown이 원작에서 정리해 넣은 표고, MIT가 그것에 대한 권리를
자동으로 해결해 주지 않는다. 경로·확장자 검사는 이것을 전혀 못 봤다 —
파일 이름이 `battle-sim-*.js`라 모든 규칙을 통과했다.

"원본 유래 데이터 0"이라고 보고하면서 이걸 안 세는 것은 허용하지 않는다.

### 영향도

우리가 실제로 쓰는 표면은 셋뿐이다.

| 우리 코드 | 쓰는 것 |
|---|---|
| `engine/battle/sim/bridge.ts` | `Dex` (`@pkmn/sim`) |
| `engine/battle/sim/session.ts` | `BattleStreams`, `Teams` (`@pkmn/sim`) |
| `engine/battle/sim/protocol.ts` | `Protocol` (`@pkmn/protocol`, 데이터 없음) |

작은 표면인데 데이터가 딸려 오는 이유는 `Dex`가 데이터 접근자 그 자체라
`data/*.mjs`를 정적으로 물기 때문이다. `BattleStreams`도 내부에서 `Dex`를 쓴다.

### 선택지

1. **엔진만 남기고 데이터를 주입한다.** `Dex`를 우리 롬 산출물로 채운 대체
   구현으로 갈아 끼운다. `@pkmn/sim`의 `Dex`는 그렇게 꽂을 수 있게 안 돼 있어서
   ModdedDex 층을 직접 만들어야 한다. 배틀 정확도 회귀 위험이 제일 크다
2. **자체 일반 엔진으로 교체한다.** 가장 크고 가장 확실하다
3. **blocker로 둔다.** ← 지금

성급히 의존성을 지워 배틀을 깨뜨리지 않는다. `pnpm test`의 배틀 시험이
오라클 노릇을 하므로, 1번을 하더라도 그 시험이 초록인 채로 단계적으로 옮긴다.

`@pkmn/data`는 시험에서만 쓰고 번들에 안 들어간다 — 실측으로 확인하고
devDependency로 옮겼다.

## 5. 브라우저에서 실제로 잰 것

```
pnpm e2e
```

⚠️ **시험 개수는 이 중 하나도 증명 못 한다.** "무엇을 요청했는가 · 어느 갈래로
떴는가 · 캐시에 무엇이 남았는가"는 노드에서 함수를 부르는 것으로는 안 닿는다.
그래서 `dist/`를 §3의 정본 헤더로 띄우고 크로미움을 붙인다.

실측 (2026-08-10) — **PASS 14 · FAIL 0 · BLOCKED 2**:

| # | 무엇 | 결과 |
|---|---|---|
| 1 | 미설치 production에서 `/data`·`/models` 요청 0건 | PASS — 요청 18건 전부 앱 셸 |
| 2 | 외부 origin 요청 0건 | PASS |
| 3 | service worker가 앱 셸만 캐시 | PASS — 6개 전부 셸 |
| 4 | 정본 CSP 아래에서 앱이 뜬다 | PASS — 지시자 14개 일치 · 위반 0건 |
| 5 | `partial` 상태에서 게임 시작 차단 | PASS — `install:partial` |
| 6 | reload 후 `ready` 복구 · HTTP로 안 되돌아간다 | PASS — `play:opfs` · 콘텐츠 요청 0건 |
| 7 | 손상된 파일을 완료로 안 센다 (길이 · 해시) | PASS |
| 8 | `ready`가 되면 **reload 없이** OPFS로 전환 | PASS |
| 9 | 진짜 롬으로 변환해 OPFS에 설치 | PASS — 노드 산출물과 해시 일치 · 요청 0건 |
| 10 | 손상된 파일을 **다시 만든다** (진짜 설치기) | PASS |
| 11 | 취소가 진짜 Worker에서 먹고 `.part`가 안 남는다 | PASS |
| 12 | `.rpsave` 새 프로필 왕복 | PASS (개발 서버) |
| 13 | 다운로드 차단 시 내부 세이브 유지 | PASS (개발 서버) |
| 14 | 큰 파일 한 벌 쓰는 동안 힙이 몇 배가 되는가 | PASS — 96MB에 +31MB |
| 15 | 실제 설치 **완주** 후 전환 | ⛔ blocker 3 |
| 16 | 실제 호스트의 CSP 응답 헤더 | ⛔ blocker 2 |

무엇을 안 재는지도 적어 둔다:

- **⑤~⑧은 설치 기록을 손으로 심는다.** 실제 설치는 필수 12개 중 2개만 만들 수
  있어 `ready`에 못 간다 (blocker 3). 재는 것은 부팅 갈래와 요청이지 변환
  정확도가 아니다 — 정확도는 ⑨가 노드 산출물과 바이트로 견준다
- **⑫⑬은 개발 서버다.** 공개 빌드에서는 타이틀 화면에 못 닿는다 (설치본이
  없으면 설치 화면이고, 합성 설치본으로는 게임이 안 그려진다). 리포트 왕복은
  배포 경계가 아니라 앱 동작이라 그쪽에서 잰다
- **④의 서버는 우리가 띄운 것이다.** 정본 CSP 아래에서 앱이 도는 것은
  증명되지만 호스트가 그 헤더를 붙인다는 증명이 아니다. blocker 2는 그대로다

### ⑭ 큰 파일 하나에 힙이 몇 배가 되는가

BDSP 모델이 붙으면 그룹 하나가 수백 MB다. `.part`에 쓰고 → 되읽고 → 해시하고
→ 제자리로 옮기는 길에서 **같은 바이트가 몇 벌 살아 있는가**를 96MB로 쟀다.

| | 전 | 후 |
|---|---:|---:|
| 쓰는 동안 (`packStore.write`) | +126MB | **+31MB** |
| 해시하는 동안 (`sha256`) | +97MB | **+0MB** |

전자는 되읽기가 `.arrayBuffer()`라 JS 힙에 한 벌을 더 만들고 있었다 —
길이만 필요하므로 `File.size`를 보고, 복사는 `File`(Blob) 그대로 넘겨
브라우저에 맡긴다. 후자는 `new Uint8Array(bytes).buffer`로 잘라 넘기던 것이
전체 복사였다 — `digest`는 뷰를 그대로 받고 `byteOffset`·`byteLength`만 본다.

⑭가 `+0.5배`를 넘으면 실패한다. 옛 코드로 되돌려 실제로 걸리는 것을 확인했다.

## 6. 공개 전 점검

```
pnpm check                    타입 · lint · 시험 (자료 있는 기계)
pnpm build                    경계 앞뒤 검사 포함
pnpm e2e                      브라우저 실측 (§5)
pnpm provenance               번들에 무엇이 들어갔는가
pnpm release:check            blocker가 하나라도 있으면 실패
pnpm verify:deploy <url>      실제 호스트의 CSP · 외부 요청 · SPA fallback
```

첫 공개 remote를 만들기 **전에** 해야 하는 것이 하나 더 있다: Git 히스토리에서
`public/data/**`와 `assets-manifest.json`을 지우는 것. 파괴적 작업이라 사용자
승인이 따로 필요하다 — 대상 목록과 절차는 COPYRIGHT.md §9.

### 아직 못 하는 말

이 문서가 재는 것은 **서버가 무엇을 내보내는가**뿐이다. 지금 잰 것으로 할 수
있는 말은 여기까지다:

- 이 리포의 `raw/`·`public/data/`·`public/models/` 산출물은 `dist/`에 **없다**
  (`boundary:post`가 실제 `dist/`를 훑고, 브라우저가 요청 0건을 확인했다)
- **그런데 "게임 유래 데이터 0"은 아직 아니다.** `@pkmn/sim`의 제3자 게임
  데이터 8.5MB가 배포 JS에 남아 있다 (§4). `src/data/textBanks.json`의
  롬 헤더 키 697개도 미해결이다 (§2) — 배포물에는 안 들어가지만 리포에 있다

법적 안전에 대한 판단은 이 문서의 범위가 아니다 — 남는 위험은 COPYRIGHT.md §3.
