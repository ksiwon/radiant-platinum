/**
 * **탐침 파트(P4 · P5)가 journey 파트(P1~P3)와 같은 깊이로 재는 것들**
 * (`docs/orders/JOURNEY_PARTS_20261008.md` §2 · §5).
 *
 * 다리마다 「닿았는가」만 적던 `_dw` · `_league`가 여기 것으로 더 잰다 —
 *   · 지형 컷: 다리 끝 자리마다 캔버스만 떼어 `terrainJudge`(계약 3)로 잰다
 *   · 콘솔: 판 내내 경고·오류를 모은다
 *   · 캔버스 수: 게임 캔버스가 하나인가
 *   · 이어하기: 저장한 그 자리 · 방향으로 다시 서는가
 *   · 끝 리포트: 끝 세이브가 파일로 남았는가
 *
 * ⚠️ **journey.mjs와 로직이 겹친다 — 일부러 복제했다.** journey의 동작을 바꾸지 않으려고
 * (봉투 · 출력이 그대로여야 한다) 이쪽에서만 쓴다. 문턱을 바꾸면 양쪽을 같이 본다.
 *
 * ⚠️ **못 잰 것은 BLOCKED다.** 관측 못 한 것을 PASS로 접지 않는다 — 판정(`fold`)이 그것을 지킨다.
 *
 * 위쪽은 순수 함수(단위 시험), 아래쪽은 페이지를 만지는 보조다.
 */
import { shootCanvas, WATCH_INIT } from './canvasShot.mjs'
import { cellStats, judgeTerrain } from './terrainJudge.mjs'
import { waitTerrain } from './stageProbe.mjs'

/** 파트 표의 `checks` 열쇠 — 이 순서로 결과 줄이 나온다 */
export const CHECK_KEYS = ['terrain', 'console', 'canvas', 'resume', 'report']

export const CHECK_WHAT = {
  terrain: '다리 끝 자리마다 3D 지형이 그려져 있다 (캔버스만 떼어 지형 칸으로 잰다)',
  console: '콘솔이 조용하다',
  canvas: '게임 캔버스가 하나다',
  resume: '앱을 다시 켜면 이어하기로 **저장한 그 자리**에 선다',
  report: '끝 자리에서 리포트를 쓰고 파일로 받는다',
}

/** 상태 접기 — 하나라도 FAIL이면 FAIL, 아니면 하나라도 BLOCKED면 BLOCKED, 비었으면 BLOCKED */
export function fold(statuses) {
  if (statuses.includes('FAIL')) return 'FAIL'
  if (statuses.length === 0 || statuses.includes('BLOCKED')) return 'BLOCKED'
  return 'PASS'
}

// ── 콘솔 ─────────────────────────────────────────────────────────────────

/** 우리 코드와 무관하다고 **알려진** 잡음 (journey의 BENIGN과 같다) */
export const BENIGN = [
  /Download the React DevTools/,
  /\[vite\]/,
  /powerPreference option is currently ignored/,
  /THREE\.Clock: This module has been deprecated/,
]
/** WebGPU를 일부러 끈 `gl` 판에서만 걸러지는 폴백 알림 */
export const BENIGN_GL = [/WebGPU is not available, running under WebGL2 backend/, /Device failed at creation/]

export const isBenign = (text, gl = true) => [...BENIGN, ...(gl ? BENIGN_GL : [])].some((re) => re.test(text))

/** 콘솔 줄 — `noise`는 `{ kind: 'error'|'warning'|'pageerror', text }` 목록 */
export function consoleRow(noise, { toTheEnd }) {
  if (noise.length > 0) {
    const errors = noise.filter((one) => one.kind !== 'warning')
    return {
      status: 'FAIL',
      detail: `오류 ${String(errors.length)} · 경고 ${String(noise.length - errors.length)} — `
        + [...new Set(noise.map((one) => String(one.text).slice(0, 110)))].slice(0, 3).join(' | '),
    }
  }
  return toTheEnd
    ? { status: 'PASS', detail: '오류·경고 0건' }
    : { status: 'BLOCKED', detail: '오류·경고 0건이지만 판이 끝까지 못 갔다 — 그 뒤를 못 봤다' }
}

// ── 하늘 기준 ────────────────────────────────────────────────────────────

const DARK_SKY = 24

/**
 * 올려다본 하늘 칸 색(`[r,g,b]` 목록)을 계약 3에 줄 수 있는가.
 * 못 찍었거나(null) 전부 어두우면(깨어진 세계의 빈 어둠) 기준이 못 된다 — 계약 2로 잰다
 */
export function skyDecision(sky) {
  if (sky === null || sky === undefined) return { use: false, why: '하늘을 못 올려다봤다 (관측 불가) — 계약 2로 쟀다' }
  if (sky.length === 0) return { use: false, why: '하늘 칸이 하나도 없다 — 계약 2로 쟀다' }
  const bright = sky.filter((c) => (c[0] + c[1] + c[2]) / 3 >= DARK_SKY)
  if (bright.length === 0) return { use: false, why: '하늘 칸이 전부 어둡다 (빈 어둠 — 하늘이 없는 세계) — 계약 2로 쟀다' }
  return { use: true, why: null }
}

// ── 지형 · 캔버스 줄 ─────────────────────────────────────────────────────

/**
 * 지형 줄. `cuts`는 다리 끝에서 뜬 컷 목록, `expect`는 떠야 할 컷 이름이다.
 * 컷은 `{ name, canvas?: { drawn, steady, filled, roi, voids, flatOnly, colors }, readiness?, error?, skyWhy? }`
 *
 *   · 컷이 모자라면(앞 다리에서 멈췄다) **BLOCKED** — FAIL이 아니다
 *   · 준비 실패 · 빈 지형 · 흔들림이 있으면 FAIL, 재는 자가 못 물었으면 BLOCKED (journey ⑮와 같다)
 */
export function terrainRow(cuts, expect) {
  const got = new Set(cuts.map((c) => c.name))
  const short = expect.filter((n) => !got.has(n))
  const tooled = cuts.filter((c) => c.canvas === undefined)
  const world = cuts.filter((c) => c.canvas !== undefined)
  const probeBroke = world.filter((c) => c.readiness?.probeFailed === true)
  const notReady = world.filter((c) => c.readiness?.ok === false && c.readiness.probeFailed !== true)
  const judged = world.filter((c) => c.readiness?.ok !== false)
  const blank = judged.filter((c) => !landDrawn(c.canvas))
  const shook = judged.filter((c) => !c.canvas.steady)
  const bad = notReady.length > 0 || blank.length > 0 || shook.length > 0
  const skyNotes = world.filter((c) => c.skyWhy).map((c) => `${c.name}: ${c.skyWhy}`)
  const tail = skyNotes.length === 0 ? '' : ` ｜ 하늘 기준 — ${skyNotes.join(' · ')}`
  const cell = (c) => `${c.name} 지형칸 ${String(c.canvas.filled)}/${String(c.canvas.roi)}`
    + (c.canvas.level ? ` → 1인칭 수평 ${String(c.canvas.level.filled)}/${String(c.canvas.level.roi)}` : '')
  if (bad) {
    return {
      status: 'FAIL',
      detail: [
        notReady.length === 0 ? null : `준비 실패 ${String(notReady.length)}컷 — `
          + notReady.map((c) => `${c.name}: ${String(c.readiness.why)}`).join(' · '),
        blank.length === 0 ? null : `지형이 없다 ${String(blank.length)}/${String(judged.length)}컷 — `
          + blank.map((c) => `${cell(c)} · 검은칸 ${String(c.canvas.voids)} · ${String(c.canvas.landWhy ?? '')}`).join(' · '),
        shook.length === 0 ? null : `찍는 동안 흔들린 컷 ${String(shook.length)}개`,
      ].filter((l) => l !== null).join(' ｜ ') + tail,
    }
  }
  if (short.length > 0 || tooled.length > 0 || probeBroke.length > 0 || world.length === 0) {
    return {
      status: 'BLOCKED',
      detail: [
        short.length === 0 ? null : `${short.join(' · ')} 컷을 못 떴다 — 앞 줄을 본다`,
        tooled.length === 0 ? null : `캔버스를 못 뗐다 — ${tooled.map((c) => `${c.name}: ${String(c.error)}`).join(' · ')}`,
        probeBroke.length === 0 ? null : `재는 자가 못 물었다 (관측 실패) — ${probeBroke.map((c) => `${c.name}: ${String(c.readiness.why)}`).join(' · ')}`,
        world.length === 0 ? '잰 컷이 없다' : null,
      ].filter((l) => l !== null).join(' ｜ ') + tail,
    }
  }
  return { status: 'PASS', detail: world.map(cell).join(' · ') + tail }
}

/**
 * 컷 하나가 지형으로 인정되는가 — 기본 시점 판정, 그것이 떨어졌으면 **같은 자리 1인칭 수평 컷**의 판정.
 *
 * ⚠️ **눈 · 물 맵의 3인칭 컷은 멀쩡해도 떨어진다.** 실측(2026-10-10 · 예지호수 318 · probe-acuity): 내려다본 컷은
 * 눈밭과 호수만 들어 칸이 매끈하고 색이 하늘(맑은 파랑)에 가까워 5/8로 떨어졌다. 같은 자리 1인칭 수평 컷은 나무 줄 ·
 * 기슭이 들어 7/8이다. 눈으로 본 두 컷 다 멀쩡했다. 지형이 정말 비었으면 1인칭에도 하늘만 비쳐 같이 떨어진다 —
 * 그래서 이것은 문턱을 낮춘 것이 아니라 **같은 자리를 한 번 더 잰 것**이다. 첫 판정(`drawn`)은 덮어쓰지 않는다
 */
export const landDrawn = (canvas) => canvas.drawn === true || canvas.level?.drawn === true

/** 캔버스 수 줄 — 컷마다 `{ name, stage, total }`(게임 캔버스 수 · 문서의 캔버스 수). 게임 캔버스는 하나여야 한다 */
export function canvasRow(cuts) {
  const seen = cuts.filter((c) => typeof c.canvases?.stage === 'number')
  if (seen.length === 0) return { status: 'BLOCKED', detail: '캔버스를 센 컷이 없다' }
  const off = seen.filter((c) => c.canvases.stage !== 1)
  const detail = seen.map((c) => `${c.name} ${String(c.canvases.stage)}(문서 ${String(c.canvases.total)})`).join(' · ')
  return off.length > 0
    ? { status: 'FAIL', detail: `게임 캔버스가 하나가 아닌 컷 — ${off.map((c) => c.name).join(' · ')} ｜ ${detail}` }
    : { status: 'PASS', detail }
}

// ── 이어하기 ─────────────────────────────────────────────────────────────

export const RESUME_EPS = 0.01
export const RESUME_FACE_TOL = 0.01

/**
 * 이어하기 줄. `want`는 **저장해 둔 값**(`{ map, matrix, x, z, facing }`), `got`은 다시 켠 뒤의
 * 읽은 값(`{ world: { map, matrix, grid }, player: { x, z, facing } }`) — 못 읽었으면 null.
 * 기준은 DOM의 내림한 칸이 아니라 저장한 값이다 (journey ⑭와 같다)
 */
export function resumeRow({ want, got, stood, restoredOk }) {
  if (want === null || want === undefined) return { status: 'BLOCKED', detail: '저장한 자리를 못 읽었다' }
  const g = got ?? { world: { map: -1, matrix: -1, grid: false }, player: { x: NaN, z: NaN, facing: NaN } }
  const gap = {
    x: Math.abs(g.player.x - want.x), z: Math.abs(g.player.z - want.z),
    facing: Math.abs(Math.atan2(Math.sin(g.player.facing - want.facing), Math.cos(g.player.facing - want.facing))),
  }
  const sameMap = g.world.map === want.map && g.world.matrix === want.matrix
  const samePlace = gap.x <= RESUME_EPS && gap.z <= RESUME_EPS
  const sameFacing = gap.facing <= RESUME_FACE_TOL
  const ok = stood && g.world.grid && restoredOk && sameMap && samePlace && sameFacing
  const at = (m, mx) => `${String(m)}/${String(mx)}`
  return {
    status: ok ? 'PASS' : 'FAIL',
    detail: `저장한 자리 ${at(want.map, want.matrix)} ${Number(want.x).toFixed(2)},${Number(want.z).toFixed(2)}`
      + ` → 돌아온 자리 ${at(g.world.map, g.world.matrix)} ${g.player.x.toFixed(2)},${g.player.z.toFixed(2)}`
      + ` · 어긋남 x${gap.x.toFixed(2)} z${gap.z.toFixed(2)} 방향${gap.facing.toFixed(2)}`
      + (restoredOk ? '' : ' · **저장한 맵에 안 섰다**')
      + (stood ? '' : ' · 맵이 안 섰다')
      + (sameMap ? '' : ' · **다른 맵이다**')
      + (samePlace ? '' : ' · **같은 맵이라도 다른 자리다**')
      + (sameFacing ? '' : ' · 방향이 다르다'),
  }
}

/** 끝 리포트 줄 — `end`는 마지막 다리가 남긴 `{ file }`(못 닿았으면 null), `digest`는 파트 자리로 옮긴 파일의 지문 */
export function reportRow({ end, digest }) {
  if (end === null || end === undefined) return { status: 'BLOCKED', detail: '마지막 다리에 못 닿아 끝 리포트를 안 썼다' }
  return digest === null || digest === undefined
    ? { status: 'FAIL', detail: `끝 리포트 파일이 없다 (${String(end.file)})` }
    : { status: 'PASS', detail: `${String(end.file)} (${String(digest)})` }
}

/**
 * 한 판이 모은 것으로 결과 줄 다섯을 만든다. 못 모은 것(null)은 BLOCKED다.
 * @returns `{ terrain, console, canvas, resume, report }` — 각각 `{ status, detail }`
 */
export function buildCheckRows({ cuts, expectCuts, noise, toTheEnd, resume, end, digest }) {
  return {
    terrain: terrainRow(cuts, expectCuts),
    console: consoleRow(noise, { toTheEnd }),
    canvas: canvasRow(cuts),
    resume: resume === null || resume === undefined
      ? { status: 'BLOCKED', detail: '마지막 다리에 못 닿아 이어하기를 안 쟀다' } : resumeRow(resume),
    report: reportRow({ end, digest }),
  }
}

// ── 페이지를 만지는 보조 ─────────────────────────────────────────────────

/** 캔버스 크기 감시를 심는다 — `goto` 앞에서 부른다 */
export const watchCanvas = (page) => page.addInitScript(WATCH_INIT)

/** 콘솔 · pageerror를 모은다. `noise`에 쌓이고 같은 배열을 돌려준다 */
export function collectConsole(page, { gl = true } = {}) {
  const noise = []
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return
    const text = m.text()
    if (isBenign(text, gl)) return
    const l = m.location()
    noise.push({
      kind: m.type(), text: text.slice(0, 300), when: Date.now(),
      at: l?.url ? `${String(l.url).split('/').pop()}:${String(l.lineNumber)}` : null,
    })
  })
  page.on('pageerror', (e) => {
    noise.push({ kind: 'pageerror', text: String(e.message).slice(0, 300), when: Date.now() })
  })
  return noise
}

const NOON = 12
/** 지형 컷은 한낮에 찍는다 — 판정 잣대가 낮 그림으로 세워졌다. 게임 시각은 찍는 순간에만 돌린다 */
export async function atNoon(page, shoot) {
  const was = await page.evaluate(async (h) => {
    const w = await import('/src/state/worldState.ts')
    const old = w.worldState.time.gameHour
    w.worldState.time.gameHour = h
    return old
  }, NOON).catch(() => null)
  if (was !== null) await page.waitForTimeout(600)
  try { return await shoot() } finally {
    if (was !== null) {
      await page.evaluate(async (h) => {
        const w = await import('/src/state/worldState.ts')
        w.worldState.time.gameHour = h
      }, was).catch(() => {})
    }
  }
}

/** 같은 자리에서 50° 올려다본 윗줄 네 칸의 색. 못 찍으면 null (판정은 계약 2가 된다) */
export async function skyRef(page) {
  const was = await page.evaluate(() => {
    const p = window.pt?.probe?.()
    if (!p) return null
    window.pt.view(1)
    return { view: p.view, yaw: p.yaw, pitch: p.pitch }
  }).catch(() => null)
  if (was === null) return null
  try {
    await page.evaluate((y) => window.pt.look((y * 180) / Math.PI, 50), was.yaw)
    await page.waitForTimeout(800)
    const up = await shootCanvas(page, {})
    return cellStats(up.png).filter((x) => x.r === 0).map((x) => x.rgb)
  } catch { return null } finally {
    await page.evaluate((w) => {
      window.pt.view(w.view === 'first' ? 1 : 0)
      window.pt.look((w.yaw * 180) / Math.PI, (w.pitch * 180) / Math.PI)
    }, was).catch(() => {})
    await page.waitForTimeout(400)
  }
}

/**
 * 같은 자리에서 1인칭 수평으로 한 장 더 찍어 잰다 (`landDrawn`). 시점 · 시선은 되돌린다.
 * 못 찍으면 `{ drawn: false, unobservable }` — 관측 못 한 것을 그려졌다로 접지 않는다
 */
export async function levelLook(page, sky, path) {
  const was = await page.evaluate(() => {
    const p = window.pt?.probe?.()
    if (!p) return null
    window.pt.view(1)
    return { view: p.view, yaw: p.yaw, pitch: p.pitch }
  }).catch(() => null)
  if (was === null) return { drawn: false, unobservable: '시점을 못 바꿨다' }
  try {
    await page.evaluate((y) => window.pt.look((y * 180) / Math.PI, 0), was.yaw)
    await page.waitForTimeout(900)
    const shot = await atNoon(page, () => shootCanvas(page, { path }))
    const land = judgeTerrain(shot.png, { sky })
    return { file: path, steady: shot.steady, drawn: land.drawn && shot.steady, filled: land.filled, roi: land.roi, skyGaps: land.skyGaps, why: land.why }
  } catch (e) {
    return { drawn: false, unobservable: String(e?.message ?? e).slice(0, 120) }
  } finally {
    await page.evaluate((w) => {
      window.pt.view(w.view === 'first' ? 1 : 0)
      window.pt.look((w.yaw * 180) / Math.PI, (w.pitch * 180) / Math.PI)
    }, was).catch(() => {})
    await page.waitForTimeout(400)
  }
}

/** 엔진의 날것의 자리와 세이브가 적어 둔 자리 */
export const whereNow = (page) => page.evaluate(async () => {
  const w = await import('/src/engine/map/world.ts')
  const s = await import('/src/state/worldState.ts')
  const v = await import('/src/state/saveStore.ts')
  const p = s.worldState.player
  const save = v.useSaveStore.getState()
  return {
    world: { map: w.world.mapId, matrix: w.world.matrix, grid: w.world.grid !== null },
    player: { x: p.position.x, z: p.position.z, facing: p.facing },
    save: { ...save.position, loaded: save.loaded },
  }
})

/**
 * 컷 하나 — 지형이 서기를 기다리고, 한낮에 캔버스만 찍고, 하늘을 올려다보고, 판정한다.
 * 못 뗐으면 `{ name, error }`. 어느 쪽이든 던지지 않는다
 */
export async function takeCut(page, name, { file }) {
  const cut = { name, file }
  try {
    cut.readiness = await waitTerrain(page, 20_000)
  } catch (e) {
    cut.readiness = { ok: false, probeFailed: true, why: String(e?.message ?? e).slice(0, 120), waitedMs: 0 }
  }
  try {
    cut.canvases = await page.evaluate(() => ({
      stage: document.querySelectorAll('#stage-wrap canvas').length,
      total: document.querySelectorAll('canvas').length,
    }))
    cut.state = await whereNow(page).catch(() => null)
    const shot = await atNoon(page, () => shootCanvas(page, { path: file }))
    const sky = await atNoon(page, () => skyRef(page))
    const dec = skyDecision(sky)
    cut.skyWhy = dec.use ? null : dec.why
    const land = judgeTerrain(shot.png, { sky: dec.use ? sky : null })
    cut.canvas = {
      colors: shot.stats.colors, steady: shot.steady, contract: land.contract,
      drawn: land.drawn, filled: land.filled, roi: land.roi, voids: land.voids, ratio: land.ratio,
      landWhy: land.why, skyOnly: land.skyOnly, skyGaps: land.skyGaps, skyUsed: dec.use,
    }
    if (!land.drawn) cut.canvas.level = await levelLook(page, dec.use ? sky : null, file.replace(/\.png$/, '-1인칭.png'))
  } catch (e) {
    cut.error = String(e?.message ?? e).slice(0, 160)
  }
  return cut
}

/** 저장한 값과 되켠 뒤의 자리를 견주는 이어하기 — journey ⑭와 같은 순서 */
export async function resumeCheck(page, url) {
  const before = await whereNow(page)
  let stood = false
  try {
    await page.goto(url, { waitUntil: 'load' })
    const cont = page.getByRole('button', { name: '이어하기', exact: true })
    await cont.waitFor({ timeout: 120_000 })
    await cont.click()
    await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
    await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live', null, { timeout: 120_000 })
    stood = await page.waitForFunction(
      () => (document.documentElement.dataset.map ?? '') !== '', null, { timeout: 60_000 },
    ).then(() => true).catch(() => false)
  } catch {
    // 이어하기 단추가 안 뜨거나 /play로 못 갔다 — 사용자가 이어하지 못한다는 뜻이라 FAIL로 읽힌다 (got 없음)
    return { want: before.save, got: null, stood: false, restoredOk: false }
  }
  const want = before.save
  const t0 = Date.now()
  let last = null
  let still = null
  let restored = { ok: false, at: null }
  while (Date.now() - t0 < 45_000) {
    const m = await page.evaluate(() => ({ ...document.documentElement.dataset }))
    const w = await whereNow(page)
    last = w
    const ready = m.restoring === undefined && w.world.map === want.map && w.world.matrix === want.matrix
      && w.world.grid && m.scene === 'overworld' && m.script === undefined && m.talk === undefined
    const here = `${String(w.player.x)},${String(w.player.z)}`
    if (ready && still === here) { restored = { ok: true, at: w }; break }
    still = ready ? here : null
    await page.waitForTimeout(250)
  }
  if (!restored.ok) restored.at = last
  return { want, got: restored.at, stood, restoredOk: restored.ok }
}
