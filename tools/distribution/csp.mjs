// 콘텐츠 보안 정책 — 정본 (DEPLOY.md §3)
//
// ⚠️ **CSP는 응답 헤더가 필수다.** `<meta http-equiv>`는 개발·방어용 보조
// 수단일 뿐이다. 둘의 차이는 취향이 아니라 기능이다:
//
//   - `frame-ancestors`는 meta에서 **무시된다**. 클릭재킹을 막는 것은 헤더뿐이다
//   - meta는 그 태그를 파싱하기 **전에** 시작된 요청을 못 막는다
//   - meta는 `report-uri`/`report-to`를 못 쓴다
//
// 그래서 meta로 넣었다고 "CSP 있음"으로 세지 않는다. 실제 호스트 응답 헤더를
// `verifyDeploy.mjs`가 재고, 그 검사를 통과하기 전에는 release blocker다.
//
// 지시자 하나하나의 근거:
//
//   default-src 'self'      아래에 안 적힌 것은 전부 자기 오리진만
//   script-src  'self'      인라인 스크립트도 eval도 없다. Vite가 전부 파일로 뺀다
//   style-src   … 'unsafe-inline'
//                           vanilla-extract는 파일로 나가지만, R3F/three가
//                           canvas 옆에 인라인 style을 붙이고 index.html도
//                           인라인 <style>을 쓴다. nonce를 쓰려면 정적 호스팅이
//                           아니라 응답을 만드는 서버가 필요하다
//   img-src     'self' data: blob:
//                           OPFS에서 꺼낸 텍스처가 blob:, 작은 아이콘이 data:
//   media-src   'self' blob:  롬에서 뽑은 음악도 OPFS → blob:
//   connect-src 'self' blob: https://api.emailjs.com
//                           ⚠️ **여기가 전송 경계다.** 바깥 오리진이 **하나**뿐이고
//                           그 하나는 버그 제보가 쓴다 (`BugReport`). blob:은
//                           Worker가 자기 결과를 되읽을 때 쓴다.
//
//                           ⚠️ **한때 바깥 오리진이 0이었고, 그것이 「무전송 경계」
//                           였다.** 2026-09-04에 버그 제보를 넣으며 하나를 열었다.
//                           그래서 이 자리의 약속은 **등급이 내려갔다**:
//
//                             전: 구조적 — 나갈 곳이 아예 없다
//                             후: 정책적 — 사람이 적고 사람이 누를 때만 나간다
//
//                           **여전히 참인 것**: 롬 바이트도, 변환 결과도, 리포트도
//                           안 나간다. 제보 창은 OPFS를 안 읽는다 — 보내는 것은
//                           사람이 친 제목·내용과 판·브라우저 종류뿐이다.
//                           분석·telemetry·광고 SDK는 여전히 하나도 없다.
//
//                           ⚠️ **여기에 오리진을 더 늘리지 않는다.** 하나가 둘이
//                           되는 순간 「무엇이 어디로 가는가」를 이 파일만 보고는
//                           말할 수 없게 된다 (COPYRIGHT.md §11 · DEPLOY.md §3)
//   worker-src  'self'      Import Worker는 번들에서 나온 모듈 파일이다
//   font-src    'self'      웹폰트를 바깥에서 안 받는다
//   manifest-src 'self'
//   frame-src   'none'      iframe을 안 쓴다
//   object-src  'none'      <object>/<embed>를 안 쓴다
//   base-uri    'none'      <base> 주입으로 상대 경로를 돌리는 것을 막는다
//   form-action 'none'      폼 제출이 없다. 있으면 그게 곧 전송이다
//   frame-ancestors 'none'  남의 페이지에 끼워 넣지 못하게. **헤더에서만 듣는다**
//
// ⚠️ `wasm-unsafe-eval`은 **안 넣는다.** BDSP 변환에 WASM이 실제로 필요하다고
// 증명되기 전에는 필요 없는 완화다 (§3 spike). 필요해지면 그때 근거와 함께 넣는다.
// 바깥 report endpoint도 안 넣는다 — 그 자체가 바깥 전송이다.

/** 지시자 → 값. 순서가 곧 출력 순서다 */
export const CSP = {
  'default-src': "'self'",
  'script-src': "'self'",
  'style-src': "'self' 'unsafe-inline'",
  'img-src': "'self' data: blob:",
  'media-src': "'self' blob:",
  'connect-src': "'self' blob: https://api.emailjs.com",
  'worker-src': "'self'",
  'font-src': "'self'",
  'manifest-src': "'self'",
  'frame-src': "'none'",
  'object-src': "'none'",
  'base-uri': "'none'",
  'form-action': "'none'",
  'frame-ancestors': "'none'",
}

/** meta 태그에서는 듣지 않는 지시자. 넣어도 브라우저가 버린다 */
export const HEADER_ONLY = ['frame-ancestors']

/**
 * CSP 말고 같이 붙는 응답 헤더 (DEPLOY.md §3 끝).
 *
 * `Strict-Transport-Security`는 https일 때만 뜻이 있어서 여기 없다 —
 * `verifyDeploy.mjs`가 프로토콜을 보고 따로 요구한다.
 *
 * `Cross-Origin-Embedder-Policy`는 **안 켠다.** `SharedArrayBuffer`를 안 쓰고,
 * 켜면 blob:/data: 규칙이 까다로워져 OPFS 경로가 흔들린다
 */
export const EXTRA_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

/** 한 줄짜리 헤더 값 */
export function cspHeader() {
  return Object.entries(CSP).map(([k, v]) => `${k} ${v}`).join('; ')
}

/**
 * `<meta http-equiv>`에 넣을 값.
 *
 * 헤더 전용 지시자를 빼고 만든다 — 넣어 봐야 무시되면서 "적었으니 됐다"는
 * 착각만 남긴다
 */
export function cspMeta() {
  return Object.entries(CSP)
    .filter(([k]) => !HEADER_ONLY.includes(k))
    .map(([k, v]) => `${k} ${v}`)
    .join('; ')
}

/** 응답 헤더 문자열을 정본과 견준다. `{ ok, missing, extra, differs }` */
export function compareHeader(got) {
  const parse = (s) => new Map((s ?? '').split(';')
    .map((p) => p.trim()).filter(Boolean)
    .map((p) => { const [k, ...v] = p.split(/\s+/); return [k.toLowerCase(), v.join(' ')] }))
  const want = parse(cspHeader())
  const have = parse(got)
  const missing = [...want.keys()].filter((k) => !have.has(k))
  const extra = [...have.keys()].filter((k) => !want.has(k))
  const differs = [...want.entries()]
    .filter(([k, v]) => have.has(k) && have.get(k) !== v)
    .map(([k, v]) => ({ directive: k, want: v, got: have.get(k) }))
  return { ok: !missing.length && !extra.length && !differs.length, missing, extra, differs }
}
