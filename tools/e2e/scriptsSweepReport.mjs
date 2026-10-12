// 스크립트 전수 점검 보고 — `.audit/scripts-sweep/part-*.json`을 모아 한 파일로 열리는 HTML 하나를 만든다
// (`tools/e2e/scriptsSweep.mjs --report`). 외부 자원을 안 쓴다.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { TRIAGE } from './scriptsSweepTriage.mjs'
import { resolve } from 'node:path'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** 범위 밖 명령으로 **짐작**되는 이름 — 보고의 묶음용일 뿐이고 판정이 아니다 */
const OUT_OF_SCOPE_NAME = /Comm|Wifi|WiFi|Union|Underground|Contest|Colosseum|Group|MysteryGift|GTS|Tower|Castle|Hall|Arcade|Roulette|BattleStage|BattleFrontier|Frontier|Record|Dummy|Noop/i

const STATUS_LABEL = {
  done: '끝까지', stall: '멈춤', timeout: '시간 초과', refused: '시작 거절', error: '하네스 오류', battle: '배틀이 안 닫힘',
}

const VERDICT = { done: '만들었다', noop: '원작도 효과 없음', out: '범위 밖', visual: '화면 확인 대기', todo: '남음' }
function triageCell(name) {
  const t = TRIAGE[name]
  if (t === undefined) return OUT_OF_SCOPE_NAME.test(name) ? '범위 밖 짐작' : '<b>미판정</b>'
  return `<b>${esc(VERDICT[t[0]] ?? t[0])}</b> <span class="dim">${esc(t[1])}</span>`
}

function table(head, rows, cls = '') {
  if (rows.length === 0) return '<p class="none">없음</p>'
  return `<table class="${cls}"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
    rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}

export function buildReport(dir) {
  const list = JSON.parse(readFileSync(resolve(dir, 'list.json'), 'utf8'))
  const parts = readdirSync(dir).filter((f) => /^part-.*\.json$/.test(f)).sort()
    .map((f) => ({ file: f, ...JSON.parse(readFileSync(resolve(dir, f), 'utf8')) }))
  const mapRows = parts.flatMap((p) => p.maps.map((m) => ({ ...m, state: p.state })))
  const mapName = new Map(list.maps.map((m) => [m.map, m.name]))
  const keyInfo = new Map()
  for (const m of list.maps) for (const s of m.sites) if (!keyInfo.has(s.key)) keyInfo.set(s.key, { fileName: s.fileName, map: m.map })

  // 판 하나씩 펼친다 — (맵 · 자리 · 회차)
  const runs = []
  for (const m of mapRows) {
    for (const s of m.sites) for (const r of s.runs ?? []) runs.push({ m, s, r })
  }
  const status = {}
  for (const { r } of runs) status[r.status] = (status[r.status] ?? 0) + 1
  const withErrors = runs.filter(({ r }) => r.errors.length > 0)
  const withEmpty = runs.filter(({ r }) => r.empty.length > 0)
  const withUnimpl = runs.filter(({ r }) => r.unimpl.length > 0)
  const stalls = runs.filter(({ r }) => r.status === 'stall' || r.status === 'timeout' || r.status === 'battle')
  const refused = runs.filter(({ r }) => r.status === 'refused')
  const noEntry = mapRows.filter((m) => m.warp?.ok !== true)
  const walks = mapRows.flatMap((m) => m.walk.map((w) => ({ m, w })))
  const walkMiss = walks.filter(({ w }) => !w.matched)

  const where = ({ m, s, r }) => `${esc(m.map)} ${esc(m.name)} · ${esc(s.kind)} ${esc(r.key)} <span class="dim">${esc(s.fileName ?? keyInfo.get(r.key)?.fileName ?? '')}</span>`

  // 미구현 명령 묶음
  const unimpl = new Map()
  for (const m of mapRows) {
    const all = [...m.sites.flatMap((s) => (s.runs ?? []).map((r) => ({ s, r }))), ...(m.natural ? [{ s: { kind: 'natural' }, r: m.natural }] : [])]
    for (const { s, r } of all) {
      for (const u of r.unimpl) {
        const e = unimpl.get(u.name) ?? { count: 0, scripts: new Set(), where: [] }
        e.count += u.count
        if (!e.scripts.has(r.key)) { e.scripts.add(r.key); if (e.where.length < 6) e.where.push(`${m.map} ${m.name} · ${s.kind} ${r.key}`) }
        unimpl.set(u.name, e)
      }
    }
  }
  const unimplRows = [...unimpl].sort((a, b) => b[1].scripts.size - a[1].scripts.size)
    .map(([name, e]) => [
      `<code>${esc(name)}</code>`, String(e.scripts.size), String(e.count),
      triageCell(name),
      `<span class="dim">${e.where.map(esc).join('<br>')}</span>`,
    ])

  // 빈 대사 묶음 (파일 · 번호)
  const empties = new Map()
  for (const { m, s, r } of withEmpty) {
    for (const e of r.empty) {
      const k = `${String(e.file)}#${String(e.id)}`
      const at = empties.get(k) ?? { n: 0, bank: e.bank, where: `${m.map} ${m.name} · ${s.kind} ${r.key}` }
      at.n++
      empties.set(k, at)
    }
  }
  const emptyRows = [...empties].map(([k, e]) => [`<code>파일 ${esc(k)}</code>`, String(e.n), e.bank === 0 ? '뱅크가 안 왔다' : `뱅크 ${String(e.bank)}줄`, esc(e.where)])

  // 오류 묶음 (메시지 앞부분)
  const errGroups = new Map()
  for (const { m, s, r } of withErrors) {
    for (const e of r.errors) {
      const k = e.replace(/0x[0-9a-f]+/gi, '0x…').replace(/#\d+/g, '#N').slice(0, 140)
      const at = errGroups.get(k) ?? { n: 0, where: [] }
      at.n++
      if (at.where.length < 5) at.where.push(`${m.map} ${m.name} · ${s.kind} ${r.key}`)
      errGroups.set(k, at)
    }
  }
  const errRows = [...errGroups].sort((a, b) => b[1].n - a[1].n)
    .map(([k, e]) => [`<code>${esc(k)}</code>`, String(e.n), `<span class="dim">${e.where.map(esc).join('<br>')}</span>`])

  const consoleErr = mapRows.flatMap((m) => [...m.consoleErrors.map((c) => ({ m, c })), ...m.sites.flatMap((s) => (s.consoleErrors ?? []).map((c) => ({ m, c })))])
  const consoleGroups = new Map()
  for (const { m, c } of consoleErr) {
    const k = c.replace(/\d+/g, 'N').slice(0, 140)
    const at = consoleGroups.get(k) ?? { n: 0, where: m.map }
    at.n++
    consoleGroups.set(k, at)
  }

  // 브라우저 없는 반쪽(`scriptsSweepHeadless.test.mts`)의 결과 — 있으면 같이 싣는다
  const headlessFile = resolve(dir, 'headless.json')
  const headless = existsSync(headlessFile) ? JSON.parse(readFileSync(headlessFile, 'utf8')) : null
  let headlessHtml = '<p class="dim">아직 안 돌렸다 (<code>SCRIPT_SWEEP_HEADLESS=1 npx vitest run tools/e2e/scriptsSweepHeadless.test.mts</code>).</p>'
  if (headless !== null) {
    const sum = headless.summary
    const nat = new Map()
    const forced = new Map()
    const natStall = []
    const forcedStall = []
    const natErr = []
    const forcedErr = []
    for (const k of headless.keys) {
      for (const [list, bag, stalls, errs] of [[k.natural, nat, natStall, natErr], [k.forced, forced, forcedStall, forcedErr]]) {
        for (const r of list) {
          for (const name of Object.keys(r.unimpl)) { const s = bag.get(name) ?? new Set(); s.add(k.key); bag.set(name, s) }
          if (r.status === 'stall') stalls.push([k.key, k.fileName, r.variant, r.stalledAt])
          if (r.errors.length > 0) errs.push([k.key, k.fileName, r.variant, r.errors[0]])
        }
      }
    }
    const coverageRows = Object.values(headless.coverage).filter((c) => c.reachable - c.visited > 0)
      .sort((a, b) => (b.reachable - b.visited) - (a.reachable - a.visited)).slice(0, 15)
      .map((c) => [esc(c.name), String(c.reachable), String(c.visited), `${((c.visited / c.reachable) * 100).toFixed(1)}%`])
    headlessHtml = `<p>시작 자리 ${sum.sitesRun} · 판 ${sum.runs} (분기를 뒤집은 판 포함) · 정적으로 닿는 명령 ${sum.reachableCommands} 중 ${sum.visitedCommands}를 밟음(${((sum.visitedCommands / sum.reachableCommands) * 100).toFixed(1)}%) · 정적 미구현 자리 ${sum.staticUnimplSites}(${sum.staticUnimplKinds}종) · 빈 대사 ${sum.staticEmptyMessages} · 표에 없는 opcode ${sum.staticOffTable}.</p>
<p class="dim">바깥 일감은 전부 「끝났다」로 답하는 판이다 — 배틀 · 화면이 쥐는 자리는 브라우저 판이 잰다. 분기를 뒤집은 판은 현실에 없는 상태일 수 있어 오류 · 멈춤을 갈라 적는다.</p>
<p>자연 판: 멈춤 ${natStall.length} · 오류 ${natErr.length}. 뒤집은 판: 멈춤 ${forcedStall.length} · 오류 ${forcedErr.length}.</p>
${table(['스크립트', '파일', '판', '마지막 명령'], natStall.map((r) => [`<code>${esc(r[0])}</code>`, esc(r[1]), esc(r[2]), `<code>${esc(r[3] ?? '')}</code>`]))}
<h3>정적 미구현 명령</h3>
${table(['명령', '자리', '자연 판에서 닿은 스크립트', '뒤집은 판', '판정 · 근거', '파일'], headless.unimpl.map((u) => [`<code>${esc(u.name)}</code>`, String(u.sites), String((nat.get(u.name) ?? new Set()).size), String((forced.get(u.name) ?? new Set()).size), triageCell(u.name), `<span class="dim">${u.files.slice(0, 4).map(esc).join(', ')}</span>`]))}
<h3>덜 밟힌 파일 (정적으로 닿는데 안 밟힌 명령이 많은 차례)</h3>
${table(['파일', '닿음', '밟음', '덮음'], coverageRows)}`
  }

  const excluded = new Map()
  for (const e of list.excluded) excluded.set(e.why, [...(excluded.get(e.why) ?? []), `${String(e.map)} ${e.name}`])

  const msTotal = runs.reduce((n, { r }) => n + r.ms, 0)
  const keysRun = new Set(runs.map(({ r }) => r.key))
  const keysTotal = list.keys
  const menuRuns = runs.filter(({ r }) => r.round === 1).length

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>스크립트 전수 점검</title>
<style>
:root{--bg:#fff;--fg:#1c1f24;--dim:#6a7280;--line:#d9dde3;--bad:#b42318;--ok:#067647;--warn:#b54708;--card:#f6f7f9}
@media (prefers-color-scheme:dark){:root{--bg:#14161a;--fg:#e6e8eb;--dim:#9aa3af;--line:#2d333b;--bad:#ff7b72;--ok:#56d364;--warn:#e3b341;--card:#1c2026}}
body{background:var(--bg);color:var(--fg);font:14px/1.55 system-ui,'Malgun Gothic',sans-serif;margin:0;padding:24px 16px 80px}
main{max-width:1080px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:34px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}
.dim{color:var(--dim)}.none{color:var(--ok)}table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid var(--line);padding:4px 8px;text-align:left;vertical-align:top;font-size:13px}
th{background:var(--card)}code{font-family:ui-monospace,Consolas,monospace;font-size:12px}
.cards{display:flex;flex-wrap:wrap;gap:8px}.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 12px;min-width:120px}
.card b{display:block;font-size:20px}.bad b{color:var(--bad)}.ok b{color:var(--ok)}.warn b{color:var(--warn)}
</style></head><body><main>
<h1>스크립트 전수 점검</h1>
<p class="dim">조각 ${esc(parts.map((p) => `${p.file}(${p.state})`).join(' · '))} · 범위는 맵 헤더가 가리키는 스크립트 파일로 갈랐다(아래 「범위 밖」).</p>

<div class="cards">
<div class="card"><b>${list.maps.length}</b>범위 안 맵</div>
<div class="card"><b>${mapRows.length}</b>돈 맵</div>
<div class="card"><b>${runs.length}</b>돈 판 (2회차 ${menuRuns})</div>
<div class="card"><b>${keysRun.size} / ${keysTotal}</b>(파일:진입점) 돌림</div>
<div class="card ${stalls.length ? 'bad' : 'ok'}"><b>${stalls.length}</b>멈춤·시간초과·배틀</div>
<div class="card ${withErrors.length ? 'bad' : 'ok'}"><b>${withErrors.length}</b>오류 난 판</div>
<div class="card ${withUnimpl.length ? 'warn' : 'ok'}"><b>${withUnimpl.length}</b>미구현 명령을 밟은 판</div>
<div class="card ${withEmpty.length ? 'bad' : 'ok'}"><b>${withEmpty.length}</b>빈 대사가 뜬 판</div>
<div class="card ${refused.length ? 'warn' : 'ok'}"><b>${refused.length}</b>시작 거절</div>
<div class="card ${walkMiss.length ? 'warn' : 'ok'}"><b>${walks.length - walkMiss.length} / ${walks.length}</b>걷기 표본 일치</div>
<div class="card ${noEntry.length ? 'bad' : 'ok'}"><b>${noEntry.length}</b>못 들어간 맵</div>
</div>
<p class="dim">판 상태: ${Object.entries(status).map(([k, v]) => `${esc(STATUS_LABEL[k] ?? k)} ${v}`).join(' · ') || '없음'} · 몬 시간 합계 ${Math.round(msTotal / 1000)}초</p>

<h2>1. 멈춤 · 시간 초과 · 배틀이 안 닫힘</h2>
${table(['어디', '상태', '마지막 명령', '마지막 여덟'], stalls.map(({ m, s, r }) => [where({ m, s, r }), esc(STATUS_LABEL[r.status]), `<code>${esc(r.stalledAt ?? '')}</code>`, `<span class="dim">${esc(r.lastOps.join(' ')).slice(0, 160)}</span>`]))}

<h2>2. 스크립트 오류 (<code>noteScriptError</code>)</h2>
${table(['메시지', '수', '예'], errRows)}

<h2>3. 미구현 명령 (<code>skipper</code>가 건너뜀)</h2>
<p class="dim">「범위 밖 짐작」은 이름 모양으로만 묶은 것이다 — 판정이 아니다. 범위는 위 목록(맵)으로 갈랐고, 범위 안 맵의 스크립트가 부른 것이므로 이름과 상관없이 <b>자리마다 확인</b>한다.</p>
${table(['명령', '스크립트 수', '호출 수', '판정 · 근거', '예'], unimplRows)}

<h2>4. 빈 대사</h2>
${table(['글', '수', '뱅크', '예'], emptyRows)}

<h2>5. 걷기 표본이 어긋난 것 (${walkMiss.length} / ${walks.length})</h2>
<p class="dim">말을 건 뒤 걸린 스크립트가 기대(파일:진입점)와 다르거나 아예 안 걸렸다. 사람이 다른 사람에 가렸거나 시선 · 방향 규칙에 걸린 것일 수 있어 <b>후보</b>다.</p>
${table(['맵', '종류', '기대', '걸린 것', '메모'], walkMiss.map(({ m, w }) => [esc(`${m.map} ${m.name}`), esc(w.kind), `<code>${esc(w.expect ?? w.site ?? '')}</code>`, `<code>${esc((w.starts ?? []).join(' '))}</code>`, esc(w.stood === false ? (w.detail ?? '') : `${w.detail ?? ''} ${w.status ?? ''}`)]))}

<h2>6. 시작 거절 · 맵에 못 들어감</h2>
${table(['어디', '메모'], [...refused.map(({ m, s, r }) => [where({ m, s, r }), '<code>start()</code>가 거절(글 뱅크가 안 옴 · 스크립트 번호 해석 실패)']), ...noEntry.map((m) => [esc(`${m.map} ${m.name}`), esc(m.errors.join(' · ') || '못 들어감')])])}

<h2>7. 브라우저 콘솔 오류</h2>
${table(['메시지', '수', '처음 맵'], [...consoleGroups].map(([k, e]) => [`<code>${esc(k)}</code>`, String(e.n), String(e.where)]))}

<h2>8. 브라우저 없는 반쪽 — 정적 닿는 곳과 VM 몰기</h2>
${headlessHtml}

<h2>9. 범위 밖 맵 (${list.excluded.length})</h2>
<p class="dim">맵 헤더가 가리키는 스크립트 파일의 이름으로 갈랐다 — 이름 추정이 아니라 <code>maps.json</code>의 <code>scripts</code> 칸 → <code>scripts.json</code>의 파일 이름이다.</p>
${table(['까닭', '맵'], [...excluded].map(([k, v]) => [esc(k), `<span class="dim">${v.map(esc).join(' · ')}</span>`]))}

<h2>10. 안 돈 자리와 남은 의문</h2>
${table(['어디', '왜'], mapRows.flatMap((m) => m.sites.filter((s) => s.skipped).map((s) => [esc(`${m.map} ${m.name} · ${s.key}`), esc(s.skipped)])))}
<ul>
<li><b>파이트에리어(맵 188) 매 프레임 라이벌 장면의 빈 대사 4줄</b> — 공용 스크립트가 3줄짜리 뱅크로 읽는다. 맵 이동 · 첫 판 직후 틈은 하네스에서 가려냈지만(맵 번호 · 뱅크 번호 · 둘째 판 전 맵 확인) 이 한 자리는 안 가려졌다. 화면으로 확인할 자리다.</li>
<li><b>걷기 표본</b>은 <b>돌아다니는 사람(이동 유형 3 · 5 · 15 등)이 정한 칸에서 벗어난 것</b>이 대부분이라 제품 결함으로 못 읽는다. 가만히 선 사람은 225 중 220이 걸렸다. 안 걸린 둘(안농길 카운터 건너편 · 휴양지 마을 하나)은 확인 자리.</li>
<li><b>화면이 쥐는 자리</b>(상점 · 낱말 고르기 · 이름 짓기 · 저장 · 태그 배틀 뒤 걸음)는 하네스에 화면 손잡이가 없어 멈춤으로 적힌다 — 마지막 명령과 서비스 이름이 까닭이다.</li>
</ul>

<h2>11. 이 점검이 못 재는 것</h2>
<ul>
<li>스크립트 <b>안쪽 분기</b>의 완전한 덮음 — 선택지 첫째 · (메뉴가 있었던 판만) 둘째 두 회차와 시작 조건만 바꿨다. 앞 스크립트가 세우는 변수에 걸린 가지는 안 밟혔을 수 있다.</li>
<li>배틀은 열지 않고 이긴 것으로 돌렸다 — 배틀 화면 · 진 뒤 갈래는 <code>story</code> · <code>journey</code>의 몫.</li>
<li>화면 서비스(가방 · 파티 · 상점 · 이름 짓기 등)가 쥐는 자리는 B를 눌러 보고 안 풀리면 「멈춤」으로 적었다 — 진짜 멈춤인지 우리 화면 대기인지 마지막 명령 · 서비스 이름으로 가른다.</li>
<li>요일 · 시간 · 생일에 걸린 갈래는 시계를 안 바꿨다.</li>
</ul>
</main></body></html>`
  return html
}
