// 스크립트 전수 점검 — 맵마다 **시작 자리를 전부 돌려** 멈춤 · 오류 · 미구현 명령 · 빈 대사를 센다
// (지시서 GAPS_20261011 「H. 스크립트 · 이벤트 전수」).
//
//     node tools/e2e/scriptsSweep.mjs --list                    목록 · 범위 밖 맵 · 선행 조건만 뽑는다 (브라우저 없음)
//     node tools/e2e/scriptsSweep.mjs --part=1/5 --state=late   그 조각을 돈다 → .audit/scripts-sweep/part-1.json
//     node tools/e2e/scriptsSweep.mjs --report                  part-*.json을 모아 .audit/scripts-sweep.html을 쓴다
//
//     --state=late|early   late는 전당등록 뒤 · 배지 8개(확인 지점 `frontier`), early는 떡잎마을(`twinleaf`). 기본 late
//     --url=http://…       이미 떠 있는 개발 서버를 쓴다. 없으면 이 작업트리 전용 서버를 **5401**에 띄운다
//     --resume             앞서 끝낸 맵은 건너뛴다
//     --maps=12,13         그 맵만
//     --gpu=gl             WebGPU 말고 WebGL2로 (기본 webgpu)
//
// ⚠️ **돌 때 `src`를 고치지 않는다.** 개발 서버가 HMR로 섞는다. 고친 소스에 대한 재측정은 새로 돈다.
// ⚠️ **한 서버에 브라우저 하나.** 서버가 다르면 병렬이 된다 (`--url`로 갈라 준다).
//
// 몰기 규칙 (`src/app/devScriptLog.ts`): 대사는 A로 넘기고, 메뉴는 1회차에 **첫째 칸** · 메뉴가 있었던 판만 2회차에 **둘째 칸**을
// 고른다. 배틀은 열지 않고 이긴 것으로 돌려준다. 시작 전에 숨김 플래그 · 좌표 사건 변수를 채우고, 끝나면 변수 · 소지품을 되돌린다.
// 맵마다 걷기 표본 둘(말 걸기 · 간판/숨은 도구 앞 A 또는 좌표 사건 걸어 들어가기)을 **진짜 입력**으로 잰다.
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { openTitle, warpTo, pushScripts, watchNoise } from '../saves/common.mjs'
import { buildList, partOf } from './scriptsSweepList.mjs'
import { buildReport } from './scriptsSweepReport.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, '.audit/scripts-sweep')
const PORT = 5401

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const opt = (name, fallback = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit === undefined ? fallback : hit.slice(name.length + 3)
}

mkdirSync(OUT, { recursive: true })

if (flag('report')) {
  const file = resolve(ROOT, '.audit/scripts-sweep.html')
  writeFileSync(file, buildReport(OUT))
  console.log(`보고 ${file}`)
  process.exit(0)
}

const list = buildList()
writeFileSync(resolve(OUT, 'list.json'), JSON.stringify(list))

if (flag('list')) {
  const c = list.counts
  console.log(`범위 안 맵 ${String(list.maps.length)} · 범위 밖 ${String(list.excluded.length)} · 시작 자리 ${String(list.totalSites)} · 서로 다른 (파일:진입점) ${String(list.keys)}`)
  console.log(`  NPC ${String(c.npc)} · 트레이너 ${String(c.trainer)} · 표지판 ${String(c.sign)} · 숨은 도구 ${String(c.hidden)} · 좌표 사건 ${String(c.trigger)} · 초기화 고정 ${String(c.initFixed)} · 매 프레임 ${String(c.initFrame)}`)
  const why = new Map()
  for (const e of list.excluded) why.set(e.why, [...(why.get(e.why) ?? []), `${String(e.map)}:${e.name}`])
  for (const [k, v] of why) console.log(`  범위 밖 · ${k} ${String(v.length)}맵: ${v.join(' ')}`)
  console.log(`  → ${resolve(OUT, 'list.json')}`)
  process.exit(0)
}

// ── 조각 고르기 ─────────────────────────────────────────────────────────────
const [partN, partM] = (opt('part', '1/1')).split('/').map(Number)
const state = opt('state', 'late')
const only = opt('maps')?.split(',').map(Number) ?? null
let maps = partOf(list, partN, partM)
if (only !== null) maps = list.maps.filter((m) => only.includes(m.map))
const partFile = resolve(OUT, `part-${String(partN)}${state === 'late' ? '' : `-${state}`}.json`)

const done = existsSync(partFile) && flag('resume')
  ? JSON.parse(readFileSync(partFile, 'utf8'))
  : { state, part: [partN, partM], startedAt: new Date().toISOString(), finishedAt: null, maps: [] }
const finished = new Set(done.maps.map((m) => m.map))
const save = () => {
  const tmp = `${partFile}.tmp`
  writeFileSync(tmp, JSON.stringify(done))
  renameSync(tmp, partFile)
}

// ── 브라우저 ────────────────────────────────────────────────────────────────
const url = opt('url') ?? null
const vite = url === null ? await startVite(PORT, 'node_modules/.vite-scripts') : null
const base = url ?? vite.url
const browser = await chromium.launch({ args: gpuArgs(opt('gpu', 'webgpu')), headless: true })
const BASE_CHECKPOINT = state === 'late' ? { id: 'frontier', map: null } : { id: 'twinleaf', map: null }

let page = null
let noise = null

async function boot() {
  if (page !== null) await page.close().catch(() => {})
  page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.setDefaultNavigationTimeout(300_000)
  page.setDefaultTimeout(120_000)
  noise = watchNoise(page)
  await openTitle(page, base)
  await page.evaluate(async () => {
    const m = await import('/src/state/saveStore.ts')
    await m.useSaveStore.getState().resetSave({ backup: false })
  })
  await page.waitForFunction(() => 'pt' in globalThis && '__scriptSweep' in globalThis, null, { timeout: 120_000 })
  await warpTo(page, BASE_CHECKPOINT)
  await pushScripts(page, 120_000)
  await page.waitForTimeout(1500)
}

const call = (fn, ...args) => page.evaluate(({ fn: f, args: a }) => globalThis.__scriptSweep[f](...a), { fn, args })

const SPOTS = [
  { kind: 'open' }, { kind: 'atWarp', index: 0 }, { kind: 'warp', index: 0 }, { kind: 'grass' },
]

async function enterMap(m, prep) {
  for (const spot of SPOTS) {
    const r = await call('gotoMap', m.map, spot, prep)
    if (r.ok) return { ...r, spot: spot.kind, natural: await call('naturalTrace') }
  }
  return { ok: false, ms: 0, spot: null, natural: null }
}

/** 걷기 표본 두 개를 고른다 — 사람 하나, 그다음 간판·숨은 도구 또는 좌표 사건 */
function pickSamples(m) {
  const npc = m.sites.find((s) => s.kind === 'npc' && s.trainer !== 9 && s.x !== undefined)
  const sign = m.sites.find((s) => (s.kind === 'sign' || s.kind === 'hidden') && s.x !== undefined)
  const trig = m.sites.find((s) => s.kind === 'trigger' && s.x !== undefined)
  const first = npc ?? sign ?? trig ?? null
  const second = [sign, trig, npc].find((s) => s !== undefined && s !== first) ?? null
  return [first, second].filter((s) => s !== null)
}

const OPTS = { timeoutMs: 120_000, stallMs: 15_000 }
const seenKeys = new Set()
for (const e of done.maps) for (const s of e.sites) seenKeys.add(s.key)

async function sweepMap(m) {
  const row = { map: m.map, name: m.name, warp: null, natural: null, sites: [], walk: [], errors: [], consoleErrors: [] }
  const prep = [...new Set(m.sites.filter((s) => s.kind === 'npc').flatMap((s) => s.pre.map((p) => p.clearFlag)).filter((f) => f > 0))]
  const noise0 = noise.ours.length
  const enter = await enterMap(m, prep)
  row.warp = { ok: enter.ok, ms: Math.round(enter.ms), spot: enter.spot }
  row.natural = enter.natural
  if (!enter.ok) { row.errors.push('맵에 못 들어갔다'); return row }

  for (const s of m.sites) {
    if (s.auto === true) continue
    if (seenKeys.has(s.key)) { row.sites.push({ key: s.key, kind: s.kind, dup: true }); continue }
    seenKeys.add(s.key)
    const site = { key: s.key, kind: s.kind, script: s.script, mapFile: m.mapFile, local: s.local ?? 0, pre: s.pre }
    const n0 = noise.ours.length
    const runs = [await call('runSite', site, { round: 0, ...OPTS })]
    if (runs[0].menus > 0 && runs[0].status === 'done') runs.push(await call('runSite', site, { round: 1, ...OPTS }))
    row.sites.push({
      key: s.key, kind: s.kind, script: s.script, at: s.at ?? null, local: s.local ?? null, node: s.node,
      fileName: s.fileName, runs, consoleErrors: noise.ours.slice(n0),
    })
    // 스크립트가 맵을 옮겼으면 돌아온다
    if (await call('currentMap') !== m.map) {
      const back = await enterMap(m, prep)
      if (!back.ok) { row.errors.push(`돌아오지 못했다 (${s.key})`); break }
    }
  }

  // 걷기 표본
  for (const s of pickSamples(m)) {
    const kind = s.kind === 'npc' ? 'npc' : s.kind === 'trigger' ? 'trigger' : 'sign'
    try {
      row.walk.push({
        site: s.key, ...await call('walkSample', m.map, kind, s.x, s.z, s.key, OPTS, s.pre),
      })
    } catch (e) {
      row.walk.push({ site: s.key, kind, detail: `하네스: ${String(e.message ?? e).slice(0, 200)}` })
    }
    if (await call('currentMap') !== m.map) await enterMap(m, prep)
  }
  row.consoleErrors = noise.ours.slice(noise0).slice(0, 30)
  return row
}

let restarts = 0
await boot()
const t0 = Date.now()
const todo = maps.filter((m) => !finished.has(m.map))
console.log(`조각 ${String(partN)}/${String(partM)} · 상태 ${state} · 맵 ${String(todo.length)}개 · 시작 자리 ${String(todo.reduce((n, m) => n + m.sites.length, 0))}`)
for (const [i, m] of todo.entries()) {
  let row
  try {
    row = await sweepMap(m)
  } catch (e) {
    const why = String(e.message ?? e).slice(0, 300)
    console.log(`  ! 맵 ${String(m.map)} ${m.name} — ${why}`)
    if (++restarts > 6) { console.log('다시 띄움 한도(6)를 넘겼다 — 여기서 멈춘다'); break }
    row = { map: m.map, name: m.name, warp: null, natural: null, sites: [], walk: [], errors: [`하네스: ${why}`], consoleErrors: [] }
    await boot().catch((e2) => { console.log(`  ! 다시 못 띄웠다 ${String(e2.message ?? e2).slice(0, 200)}`) })
  }
  done.maps.push(row)
  save()
  const runs = row.sites.flatMap((s) => s.runs ?? [])
  const bad = runs.filter((r) => r.status !== 'done' || r.errors.length > 0 || r.unimpl.length > 0 || r.empty.length > 0)
  console.log(`[${String(i + 1)}/${String(todo.length)}] 맵 ${String(m.map)} ${m.name} · ${String(row.sites.length)}자리 · 돈 판 ${String(runs.length)} · 문제 ${String(bad.length)} · 걷기 ${row.walk.map((w) => (w.matched ? 'O' : w.started ? '△' : 'X')).join('')} · ${String(Math.round((Date.now() - t0) / 1000))}s`)
}
done.finishedAt = new Date().toISOString()
save()
console.log(`끝 → ${partFile}`)
await browser.close()
vite?.child.kill()
process.exit(0)
