/**
 * **칸 연쇄 판정** — `pnpm parts:check` (`docs/orders/JOURNEY_CELLS_20261011.md` §2).
 *
 * 새 게임 한 판 대신 이것이 최종 판정이다. 통과는 다음이 다 맞을 때다 —
 *
 *   ① 칸마다: 결과 줄이 전부 PASS · 기대한 줄을 다 냈다 · 지름길 없음 · 경계에 닿았다 · 진단 판이 아니다
 *   ② 칸 N의 시작 세이브 다이제스트 = 칸 N-1 봉투의 끝 세이브 다이제스트
 *   ③ 열여섯 칸의 source · data 다이제스트가 같다
 *   ④ 하네스 다이제스트는 **적기만 한다** — 하네스만 고친 것은 연쇄를 안 끊는다 (사용자 10-11)
 *   ⑤ 칸 1은 새 게임에서 시작했다
 *
 * 결과는 화면과 `.audit/parts.html` 한 장이다. 아직 없는 칸은 **미실행**이지 통과가 아니다.
 * P6(전당 뒤)는 아직 칸이 없다 — 설계서 §1 밖이다
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CELLS, partEnvelope } from './parts.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CHAIN = Object.values(CELLS).map((c) => ({ n: c.n, what: c.what }))

const read = (n) => {
  const f = partEnvelope(n)
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null
}

const out = []
let prev = null
for (const p of CHAIN) {
  const env = p.pending ? null : read(p.n)
  const row = { ...p, env, problems: [], state: 'PASS' }
  if (env === null) {
    row.state = '미실행'
    row.problems.push(p.pending ?? '봉투가 없다')
  } else {
    const part = env.part ?? {}
    const results = env.results ?? []
    const bad = results.filter((r) => r.status !== 'PASS')
    if (bad.length > 0) row.problems.push(`PASS가 아닌 줄 ${bad.map((r) => `${r.id} ${r.status}`).join(' · ')}`)
    const executed = new Set(env.scope?.executedCases ?? [])
    const missing = (env.scope?.expectedCases ?? []).filter((id) => !executed.has(id))
    if (missing.length > 0) row.problems.push(`안 낸 줄 ${missing.join(' · ')}`)
    if ((env.scope?.shortcuts ?? []).length > 0) row.problems.push(`지름길 ${env.scope.shortcuts.join(',')}`)
    if (env.dataChangedDuringRun === true) row.problems.push('도는 동안 자료가 바뀌었다')
    if (part.ok !== true) row.problems.push(part.leg ? `다리 ${String(part.leg)}에 못 닿았다` : `경계에 못 닿았다 — 배지 ${String(part.badges)}/${String(part.wantBadges)} · 회복 ${part.healed ? '됨' : String(part.healWhy)}`)
    if (p.n === 1 && part.startSave !== null && part.startSave !== undefined) row.problems.push('칸 1이 새 게임에서 시작하지 않았다')
    if (p.n > 1) {
      if (prev?.env == null) row.problems.push(`앞 칸(${String(p.n - 1)}) 봉투가 없다`)
      else if (part.startSaveDigest !== prev.env.part?.endSaveDigest) {
        row.problems.push(`시작 세이브 ${String(part.startSaveDigest)} ≠ 칸 ${String(p.n - 1)} 끝 세이브 ${String(prev.env.part?.endSaveDigest)}`)
      }
    }
    if (part.startDiagnostic === true) row.problems.push(`진단 판 — ${(part.startWhy ?? []).join(' · ')}`)
    if (row.problems.length > 0) row.state = 'FAIL'
  }
  out.push(row)
  prev = row
}

// ③ source · data가 열여섯 칸에서 같은가 · ④ 하네스는 적기만 한다
const ran = out.filter((r) => r.env !== null)
const sources = [...new Set(ran.map((r) => r.env.sourceDigest))]
const datas = [...new Set(ran.map((r) => r.env.dataDigest))]
const chainProblems = []
if (sources.length > 1) chainProblems.push(`게임 소스가 칸마다 다르다 (${sources.map((s) => String(s).slice(0, 12)).join(' · ')})`)
if (datas.length > 1) chainProblems.push(`자료가 칸마다 다르다 (${datas.map((s) => String(s).slice(0, 12)).join(' · ')})`)
const harnesses = [...new Set(ran.map((r) => String(r.env.harnessDigest).slice(0, 12)))]
const chainNotes = harnesses.length > 1 ? [`하네스가 칸마다 다르다 (${harnesses.join(' · ')}) — 연쇄를 안 끊는다, 적기만 한다`] : []
const allPass = out.every((r) => r.state === 'PASS') && chainProblems.length === 0

console.log('\n칸 연쇄 판정\n')
for (const r of out) {
  console.log(`  ${r.state === 'PASS' ? '✓' : r.state === 'FAIL' ? '✗' : '·'} 칸 ${String(r.n)} ${r.what} — ${r.state}`
    + `${r.env ? ` · ${String(r.env.testedAt)} · source ${String(r.env.sourceDigest).slice(0, 12)}` : ''}`)
  for (const pr of r.problems) console.log(`        ${pr}`)
}
for (const pr of chainProblems) console.log(`  ✗ ${pr}`)
for (const pr of chainNotes) console.log(`  · ${pr}`)
console.log(`\n  ${allPass ? '연쇄 통과' : '연쇄 미통과'}\n`)

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>칸 연쇄 판정</title>
<style>
:root{--bg:#fafaf8;--fg:#1d1d1b;--mute:#6b6b66;--line:#e2e1dc;--ok:#1f7a4d;--bad:#b3261e;--wait:#8a6d1f;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#ecebe6;--mute:#a09f98;--line:#33322f;--ok:#5cc28f;--bad:#f2867e;--wait:#d9b860;--card:#1e1e1c}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,'Malgun Gothic',sans-serif}
main{max-width:860px;margin:0 auto;padding:32px 16px}
h1{font-size:22px;margin:0 0 4px}.sub{color:var(--mute);margin:0 0 24px}
.verdict{font-size:18px;font-weight:600;margin:0 0 24px}.verdict.ok{color:var(--ok)}.verdict.bad{color:var(--bad)}
ol{list-style:none;padding:0;margin:0;border-left:2px solid var(--line)}
li{position:relative;padding:0 0 20px 22px}
li::before{content:'';position:absolute;left:-7px;top:6px;width:12px;height:12px;border-radius:50%;background:var(--wait)}
li.PASS::before{background:var(--ok)}li.FAIL::before{background:var(--bad)}
.name{font-weight:600}.state{font-size:13px;margin-left:8px}.PASS .state{color:var(--ok)}.FAIL .state{color:var(--bad)}.미실행 .state{color:var(--wait)}
.meta{color:var(--mute);font-size:13px}.prob{font-size:14px;margin:4px 0 0}
code{font-size:12px}
</style></head><body><main>
<h1>칸 연쇄 판정</h1>
<p class="sub">${esc(new Date().toISOString())} · 기준: docs/orders/JOURNEY_CELLS_20261011.md §2</p>
<p class="verdict ${allPass ? 'ok' : 'bad'}">${allPass ? '연쇄 통과' : '연쇄 미통과'}</p>
${chainProblems.map((p) => `<p class="prob">✗ ${esc(p)}</p>`).join('')}${chainNotes.map((p) => `<p class="prob">· ${esc(p)}</p>`).join('')}
<ol>
${out.map((r) => `<li class="${r.state}"><span class="name">칸 ${String(r.n)} ${esc(r.what)}</span><span class="state">${r.state}</span>
${r.env ? `<div class="meta">${esc(r.env.testedAt)} · source <code>${esc(String(r.env.sourceDigest).slice(0, 12))}</code> · 시작 <code>${esc(String(r.env.part?.startSaveDigest))}</code> → 끝 <code>${esc(String(r.env.part?.endSaveDigest))}</code> · 줄 ${String((r.env.results ?? []).length)}개</div>` : ''}
${r.problems.map((p) => `<p class="prob">${esc(p)}</p>`).join('')}</li>`).join('\n')}
</ol>
</main></body></html>
`
writeFileSync(resolve(ROOT, '.audit/parts.html'), html)
console.log('  .audit/parts.html')
process.exit(allPass ? 0 : 1)
