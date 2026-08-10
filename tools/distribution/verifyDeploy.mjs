// 실제로 올라간 배포를 검사한다 (DEPLOY.md §3).
//
//     pnpm verify:deploy https://example.invalid/
//
// 재는 것 넷:
//   ① CSP **응답 헤더**가 정본과 같은가 (meta로는 못 대신한다 — `csp.mjs`)
//   ② 그 밖의 보안 헤더가 있는가
//   ③ 첫 화면이 자기 오리진 밖으로 요청하는가
//   ④ SPA fallback이 도는가 (`/play` 같은 경로가 index.html로 오는가)
//
// ③은 playwright가 있으면 실제로 브라우저를 띄워 잰다. 없으면 index.html과
// 그 안의 스크립트를 받아 바깥 오리진 문자열이 있는지만 본다 — 약한 검사라
// 그렇다고 찍는다. **약한 검사를 통과라고 쓰지 않는다.**
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compareHeader, cspHeader, EXTRA_HEADERS } from './csp.mjs'

const ROOT = resolve(import.meta.dirname, '../..')

const url = process.argv[2]
if (!url) {
  console.error('쓰기: pnpm verify:deploy <https://배포주소/>')
  console.error('  호스트가 아직 없으면 이 검사는 미완료다. 통과로 치지 않는다 (DEPLOY.md §3).')
  process.exit(2)
}
const base = url.endsWith('/') ? url : `${url}/`
const origin = new URL(base).origin

const problems = []
const notes = []

// ── ① CSP 응답 헤더 ──────────────────────────────────────────────────────────
const res = await fetch(base, { redirect: 'follow' })
if (!res.ok) {
  console.error(`${base} → HTTP ${res.status}`)
  process.exit(1)
}
const got = res.headers.get('content-security-policy')
if (!got) {
  problems.push('CSP 응답 헤더가 없다')
  if (/http-equiv=["']Content-Security-Policy/i.test(await res.clone().text())) {
    notes.push('meta CSP는 있다 — 하지만 frame-ancestors가 안 듣는다. 헤더가 필요하다')
  }
} else {
  const cmp = compareHeader(got)
  if (!cmp.ok) {
    for (const d of cmp.missing) problems.push(`CSP에 '${d}'가 없다`)
    for (const d of cmp.extra) problems.push(`CSP에 정본에 없는 '${d}'가 있다`)
    for (const d of cmp.differs) problems.push(`CSP '${d.directive}': ${d.got} ≠ ${d.want}`)
  }
  if (/report-(uri|to)/i.test(got)) problems.push('CSP에 바깥 report endpoint가 있다')
  if (/wasm-unsafe-eval/.test(got)) {
    problems.push("CSP에 'wasm-unsafe-eval'이 있다 — WASM이 필요하다는 증명이 먼저다")
  }
}

// ── ② 그 밖의 헤더 ──────────────────────────────────────────────────────────
// 정본은 `csp.mjs`의 `EXTRA_HEADERS` 하나다 — 여기 또 적으면 두 벌이 갈린다
const want = Object.fromEntries(
  Object.entries(EXTRA_HEADERS).map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]),
)
for (const [k, v] of Object.entries(want)) {
  const h = res.headers.get(k)
  if (h?.toLowerCase() !== v) problems.push(`${k}: ${h ?? '없음'} ≠ ${v}`)
}
if (new URL(base).protocol === 'https:' && !res.headers.get('strict-transport-security')) {
  problems.push('strict-transport-security가 없다')
}

// ── ③ 바깥 오리진 요청 ───────────────────────────────────────────────────────
let browserChecked = false
try {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const outside = []
  page.on('request', (r) => { if (!r.url().startsWith(origin) && !/^(data|blob):/.test(r.url())) outside.push(r.url()) })
  const failed = []
  page.on('requestfailed', (r) => failed.push(`${r.url()} — ${r.failure()?.errorText ?? ''}`))
  await page.goto(base, { waitUntil: 'networkidle', timeout: 60_000 })
  await browser.close()
  browserChecked = true
  for (const u of [...new Set(outside)]) problems.push(`바깥 오리진 요청: ${u}`)
  // 설치 없는 첫 화면이 원본 유래 자료를 부르면 안 된다 (§2.1)
  for (const u of failed) {
    if (/\/(data|models)\//.test(u)) problems.push(`설치 없이 원본 유래 경로 요청: ${u}`)
  }
} catch (e) {
  notes.push(`playwright로 못 열었다 (${e.message.split('\n')[0]}) — 요청 검사는 약한 갈래로 갔다`)
  const html = await (await fetch(base)).text()
  for (const m of html.matchAll(/(?:src|href)=["'](https?:\/\/[^"']+)/g)) {
    if (!m[1].startsWith(origin)) problems.push(`index.html이 바깥을 가리킨다: ${m[1]}`)
  }
}

// ── ④ SPA fallback ──────────────────────────────────────────────────────────
const deep = await fetch(new URL('play', base), { redirect: 'follow' })
if (!deep.ok) problems.push(`SPA fallback이 없다: /play → HTTP ${deep.status}`)
else if (!/<div id="root">/.test(await deep.text())) problems.push('/play가 index.html이 아니다')

// ── 결과 ────────────────────────────────────────────────────────────────────
console.log(`검사한 곳: ${base}`)
console.log(`정본 CSP: ${cspHeader()}\n`)
for (const n of notes) console.log(`  · ${n}`)
if (!browserChecked) console.log('  · ⚠️ 브라우저 검사를 못 했다. 이 결과로 "외부 요청 0"이라고 쓰지 않는다')

// 결과를 남긴다 — `blockers.mjs`가 이걸 읽어 CSP blocker가 풀렸는지 잰다.
// ⚠️ **약한 갈래로 간 검사는 `ok: false`다.** 브라우저를 못 띄웠으면 외부 요청을
// 실제로 세지 못한 것이고, 못 센 것을 통과로 기록하면 blocker가 거짓으로 풀린다
mkdirSync(resolve(ROOT, '.audit'), { recursive: true })
writeFileSync(resolve(ROOT, '.audit/deploy-verified.json'), `${JSON.stringify({
  url: base, ok: problems.length === 0 && browserChecked, browserChecked, problems,
}, null, 1)}\n`)

if (problems.length === 0) {
  console.log(browserChecked ? '\n배포 검사 통과' : '\n약한 검사만 통과 — 미완료')
  process.exit(browserChecked ? 0 : 1)
}
console.error(`\n배포 검사 실패 ${problems.length}건`)
for (const p of problems) console.error(`  ✗ ${p}`)
process.exit(1)
