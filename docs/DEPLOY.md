# 배포

공개 서버에 무엇을 올리고, 올리기 전에 무엇을 통과해야 하는지.

기술적인 무전송·무배포 경계를 지키는 것이 이 문서의 범위다. **그것이 법적
면책을 뜻하지 않는다** — 남는 위험은 COPYRIGHT.md §3에 있다.

## 1. 지금은 못 올린다

미해결 release blocker가 있다. `pnpm release:check`가 실패한다.

| # | blocker | 어디 |
|---|---|---|
| 1 | 번들에 제3자 정적 게임 데이터 8.5MB | §4 |
| 2 | CSP 응답 헤더를 실제 호스트에서 잰 적이 없다 | §3 |
| 3 | BDSP 변환이 없어 3D 에셋을 만들 수 없다 | IMPORT.md §12 |
| 4 | `public/data/**`가 Git 히스토리에 남아 있다 | COPYRIGHT.md §9 |

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

## 5. 공개 전 점검

```
pnpm check                    타입 · lint · 시험 (자료 있는 기계)
pnpm build                    경계 앞뒤 검사 포함
pnpm provenance               번들에 무엇이 들어갔는가
pnpm release:check            blocker가 하나라도 있으면 실패
pnpm verify:deploy <url>      실제 호스트의 CSP · 외부 요청 · SPA fallback
```

첫 공개 remote를 만들기 **전에** 해야 하는 것이 하나 더 있다: Git 히스토리에서
`public/data/**`와 `assets-manifest.json`을 지우는 것. 파괴적 작업이라 사용자
승인이 따로 필요하다 — 대상 목록과 절차는 COPYRIGHT.md §9.
