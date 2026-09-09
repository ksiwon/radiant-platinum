// 집계는 **원시 봉투에서만** 만든다 (후속 지시 §7의 6)
//
//     node tools/e2e/_tally42.mjs
//
// ⚠️ **손으로 센 숫자를 보고서에 옮기지 않는다.** 실측(2026-09-08): 보고서에
// 「journey 12 PASS · 5 FAIL」이라 적혔는데 `.audit/probe/out/journey.json`의 results는
// **9 PASS · 8 FAIL**이었다 — 로그의 ✓ 표를 눈으로 센 값이 그대로 굳은 것이다.
// 그래서 세는 일을 도구로 옮긴다. 숫자가 마음에 안 들면 검사를 다시 돌리는
// 것이지, 여기를 고치는 것이 아니다.
//
// ⚠️ **「안 돈 것」을 「통과」로 삼키지 않는다.** 각 봉투의 `scope`가
// `expectedCases`와 `executedCases`를 들고 있으므로, 그 차이가 곧 미실행이다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, '.audit/overnight-20260908')

/** 봉투 하나 = 검사 한 벌. 이름은 실행 명령 그대로다 */
const SUITES = [
  { id: 'render:first', file: '.audit/probe/out/renderFirst.json' },
  { id: 'gpu:loss', file: '.audit/probe/out/gpuLoss.json' },
  { id: 'journey', file: '.audit/probe/out/journey.json' },
  { id: 'e2e', file: '.audit/probe/out/e2e.json' },
  { id: 'story', file: '.audit/probe/out/story.json' },
]

const rows = []
for (const s of SUITES) {
  const path = resolve(ROOT, s.file)
  if (!existsSync(path)) { rows.push({ ...s, missing: true }); continue }
  const env = JSON.parse(readFileSync(path, 'utf8'))
  const results = Array.isArray(env.results) ? env.results : []
  const by = {}
  for (const r of results) by[r.status] = (by[r.status] ?? 0) + 1
  const want = env.scope?.expectedCases ?? []
  const ran = new Set(env.scope?.executedCases ?? results.map((r) => r.id))
  const notRun = want.filter((id) => !ran.has(id))
  rows.push({
    id: s.id,
    file: s.file,
    testedAt: env.testedAt ?? null,
    buildId: env.buildId ?? null,
    selection: env.scope?.selection ?? null,
    sourceDigest: typeof env.sourceDigest === 'string' ? env.sourceDigest.slice(0, 12) : null,
    harnessDigest: typeof env.harnessDigest === 'string' ? env.harnessDigest.slice(0, 12) : null,
    rows: results.length,
    pass: by.PASS ?? 0,
    fail: by.FAIL ?? 0,
    blocked: by.BLOCKED ?? 0,
    other: Object.entries(by).filter(([k]) => !['PASS', 'FAIL', 'BLOCKED'].includes(k))
      .map(([k, n]) => `${k} ${String(n)}`),
    notRun,
    failed: results.filter((r) => r.status !== 'PASS')
      .map((r) => `${String(r.id)} ${String(r.what)} — ${String(r.detail ?? '').slice(0, 120)}`),
  })
}

console.log('| 검사 | 선택 | PASS | FAIL | BLOCKED | 미실행 | 잰 때 | 소스 |')
console.log('| --- | --- | ---: | ---: | ---: | ---: | --- | --- |')
for (const r of rows) {
  if (r.missing) { console.log(`| \`${r.id}\` | — | — | — | — | — | 봉투 없음 (${r.file}) | — |`); continue }
  console.log(`| \`${r.id}\` | ${String(r.selection ?? '?')} | ${String(r.pass)} | ${String(r.fail)}`
    + ` | ${String(r.blocked)} | ${String(r.notRun.length)} | ${String(r.testedAt)}`
    + ` | ${String(r.sourceDigest)} |`)
}
for (const r of rows) {
  if (r.missing || r.failed.length === 0) continue
  console.log(`\n${r.id} — PASS가 아닌 줄`)
  for (const line of r.failed) console.log(`  ${line}`)
  if (r.notRun.length > 0) console.log(`  미실행: ${r.notRun.join(' ')}`)
}

writeFileSync(resolve(OUT, 'tally42.json'), `${JSON.stringify({ at: new Date().toISOString(), rows }, null, 1)}\n`)
console.log(`\n  ${resolve(OUT, 'tally42.json')}`)
// ⚠️ **여기서 판정하지 않는다.** 세는 것이 이 도구의 일이다
