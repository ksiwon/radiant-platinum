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
  // 스크립트 점검 훅은 부른 판에서만 달린다 (`src/app/App.tsx`)
  await page.addInitScript(() => { globalThis.__wantScriptSweep = true })
  page.setDefaultNavigationTimeout(300_000)
  page.setDefaultTimeout(120_000)
  noise = watchNoise(page)
  if (flag('verbose')) page.on('console', (c) => { if (c.type() !== 'debug') console.log(`    CONSOLE ${c.type()} ${c.text().slice(0, 220)}`) })
  if (flag('verbose')) page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log(`    NAV ${f.url()}`) })
  console.log('  boot: 타이틀을 연다')
  await openTitle(page, base)
  console.log('  boot: 타이틀 열림 — 리포트를 비운다')
  await page.evaluate(async () => {
    const m = await import('/src/state/saveStore.ts')
    await m.useSaveStore.getState().resetSave({ backup: false })
  })
  await page.waitForFunction(() => 'pt' in globalThis && '__scriptSweep' in globalThis, null, { timeout: 120_000 })
  console.log('  boot: 확인 지점으로 뛴다')
  await warpTo(page, BASE_CHECKPOINT)
  console.log('  boot: 도착 장면을 민다')
  await pushScripts(page, 120_000)
  await page.waitForTimeout(1500)
  console.log('  boot: 준비 끝')
}

/**
 * 페이지 안 함수를 부른다. ⚠️ **시한이 있다** — 페이지가 영영 안 돌아오면(실측: 맵 150에서 14분) 하네스가 같이 선다.
 * 시한을 넘기면 던지고, 위쪽이 판을 새로 띄운다
 */
const CALL_LIMIT_MS = 420_000
const call = (fn, ...args) => Promise.race([
  page.evaluate(({ fn: f, args: a }) => globalThis.__scriptSweep[f](...a), { fn, args }),
  new Promise((_, no) => { setTimeout(() => { no(new Error(`${fn}이 ${String(CALL_LIMIT_MS / 1000)}초 안에 안 돌아왔다`)) }, CALL_LIMIT_MS) }),
])

const SPOTS = [
  { kind: 'open' }, { kind: 'atWarp', index: 0 }, { kind: 'warp', index: 0 }, { kind: 'grass' },
]

/**
 * 도착 장면이 **정해진 칸에서 걷기 시작하는** 맵은 그 칸에서 서야 한다 — 다른 칸에서 시작하면 원작 이동 값이 문 칸을 지나 맵이 바뀌고
 * 그 뒤 대사를 새 맵의 글 뱅크로 읽어 빈 대사가 된다 (맵 188을 「열린 칸」에서 시작하면 대사 4줄이 비었고 · 아래 칸에서 시작하면 0이다).
 * 칸은 장면의 이동표에서 거꾸로 센 것이다 — 파이트에리어 라이벌(`FightArea_OnFrame_Rival`): 라이벌 (628,434) 서쪽 네 칸에서 동 4 → 동 18·북 2·동 9·북 6으로
 * 볼크너·플린트 앞 (655,426)에 닿는다
 */
const START_TILES = new Map([[188, { kind: 'tile', x: 624, z: 434, facing: -Math.PI / 2 }]])

async function enterMap(m, prep) {
  for (const spot of [...(START_TILES.has(m.map) ? [START_TILES.get(m.map)] : []), ...SPOTS]) {
    if (flag('verbose')) console.log(`    gotoMap ${String(m.map)} ${spot.kind}`)
    const r = await call('gotoMap', m.map, spot, prep)
    if (flag('verbose')) console.log(`    → ok=${String(r.ok)} ${String(Math.round(r.ms))}ms bank=${JSON.stringify(await call('bankInfo'))}`)
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

/** 돌면 페이지가 게임을 떠나는 스크립트 (파일:진입점) — 명예의 전당 `ClearGame` */
const SKIP_KEYS = new Map([
  ['198:0', '게임을 끝내는 스크립트(ClearGame) — 크레딧으로 넘어간다'],
])
const OPTS = { timeoutMs: 120_000, stallMs: 15_000, stopAtEnd: true }
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

  for (const s of flag('walk-only') ? [] : m.sites) {
    if (s.auto === true) continue
    if (seenKeys.has(s.key)) { row.sites.push({ key: s.key, kind: s.kind, dup: true }); continue }
    // 게임을 끝내는 스크립트는 안 돈다 — 명예의 전당 → 크레딧으로 페이지가 떠난다 (`ClearGame`)
    if (SKIP_KEYS.has(s.key)) {
      row.sites.push({ key: s.key, kind: s.kind, fileName: s.fileName, skipped: SKIP_KEYS.get(s.key) })
      continue
    }
    // ⚠️ **도착 장면이 주인공을 다른 맵으로 내보냈을 수 있다** (스타크마운틴 · 되돌림동굴) — 그 채로 돌면 앞 맵의 글 뱅크로 읽는다
    for (let tries = 0; tries < 2 && await call('currentMap') !== m.map; tries++) await enterMap(m, prep)
    // 장면 스크립트는 그 칸에서 시작해야 한다 — 앞 판이 주인공을 장면 끝 칸에 세워 두었다
    if (s.kind === 'frame' && START_TILES.has(m.map)) await enterMap(m, prep)
    seenKeys.add(s.key)
    if (flag('verbose')) console.log(`    run ${s.key} ${s.kind} bank=${JSON.stringify(await call('bankInfo'))}`)
    const site = { key: s.key, kind: s.kind, script: s.script, mapFile: m.mapFile, local: s.local ?? 0, pre: s.pre }
    const n0 = noise.ours.length
    const runs = [await call('runSite', site, { round: 0, ...OPTS })]
    if (runs[0].menus > 0 && runs[0].status === 'done') {
      // ⚠️ 첫 판이 맵을 옮겼으면 돌아온 뒤에 둘째 판을 돈다 — 안 그러면 도착 맵의 글 뱅크로 읽어 **빈 대사**로 나온다
      if (await call('currentMap') !== m.map || (s.kind === 'frame' && START_TILES.has(m.map))) await enterMap(m, prep)
      runs.push(await call('runSite', site, { round: 1, ...OPTS }))
    }
    row.sites.push({
      key: s.key, kind: s.kind, script: s.script, at: s.at ?? null, local: s.local ?? null, node: s.node,
      fileName: s.fileName, runs, consoleErrors: noise.ours.slice(n0),
    })
    // 진짜 배틀이 열려 버렸으면(감싸기를 빠져나간 길) 그 판은 못 쓴다 — 새로 띄워 그 맵부터 다시 선다
    if (runs.some((r) => r.status === 'battle')) {
      row.errors.push(`진짜 배틀이 열렸다 (${s.key}) — 다시 띄웠다`)
      await boot()
      const again = await enterMap(m, prep)
      if (!again.ok) break
      continue
    }
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
// ⚠️ `--walk-only`는 이미 돈 맵의 걷기 표본만 다시 잰다 — 자리는 안 건드린다
const todo = flag('walk-only') ? maps.filter((m) => finished.has(m.map)) : maps.filter((m) => !finished.has(m.map))
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
  if (flag('walk-only')) {
    const old = done.maps.find((x) => x.map === row.map)
    if (old !== undefined) { old.walk = row.walk; old.walkAt = new Date().toISOString() }
  } else done.maps.push(row)
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
