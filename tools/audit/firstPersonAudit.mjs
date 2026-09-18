// 1인칭 개선 — **실제 게임의 1인칭 화면** 기준선·후보 촬영 (기획서 FIRST_PERSON §11.2~11.5)
//
//     node tools/audit/firstPersonAudit.mjs                         기본 장소 · WebGPU · 정지
//     node tools/audit/firstPersonAudit.mjs --gpu=gl                실제 WebGLBackend로
//     node tools/audit/firstPersonAudit.mjs --sites=twinleaf,forest --capture=all
//     node tools/audit/firstPersonAudit.mjs --mode=candidate --out=shots/first-person/fp02
//
// 하는 일 — 장소마다
// ① 확인 지점으로 뛰어든다 (`pnpm shot`과 같은 길: 백틱 → 줄 누르기 → 맵 번호 확인)
// ② **진짜 V키**로 1인칭에 들어가고, 설정값과 `worldState.camera.mode`가 둘 다
//    `first`인지 본다. 카메라만 옮긴 화면으로 대신하지 않는다 (§0 금지 목록)
// ③ `terrainReady()`가 `ok`일 때까지 기다린다 — 새 준비 타이머를 안 만든다
// ④ 방위 여덟(북 0°부터 45°씩) × 고개 셋(−25·0·+25)을 `pt.look`으로 돌려 찍는다
// ⑤ V로 3인칭에 갔다가 다시 1인칭으로 — 0→1→0→1 전환이 제자리로 오는지 본다
// ⑥ `--capture=walk|all`이면 앞으로 5초 걸으며 0.5초마다 찍는다 (깜빡임은 정지 화면으로 못 본다)
//
// 판정 — **성공으로 접지 않는다** (§11.4)
// - `BLOCKED_INFRA`  서버·페이지·확인 지점·장치가 못 섰다
// - `FAILED_VISUAL`  준비는 됐는데 화면이 한 색이거나 백엔드가 기대와 다르다
// - `CAPTURED`       찍혔다. **통과가 아니다** — 사람이 전후를 보고 정한다
//
// 쓰는 것 — `<out>/<site>/*.png`, `<out>/run.json`, 그리고 한 파일로 열리는
// `.audit/first-person/<run>.html` (그림을 안에 싣는다)
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs, wantBackend } from '../gpuFlags.mjs'
import { decodePng, looksFlat, statsOf } from '../shot/png.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit === undefined ? fallback : hit.slice(name.length + 3)
}

/**
 * 기본 장소 — §11.5 대표 세트에서 **확인 지점이 있는 것**만.
 * 열매밭은 확인 지점이 없어 뺐다(따로 세워야 한다 — 보고서에 미검수로 남긴다)
 */
const DEFAULT_SITES = [
  'room', 'twinleaf', 'forest', 'jubilife', 'sunyshore', 'canalave', 'route217',
  'center', 'mart', 'library', 'wayward', 'gym2', 'distortion',
]
const SITES = (flag('sites', '') || DEFAULT_SITES.join(',')).split(',').filter(Boolean)
const GPU = flag('gpu', 'webgpu')
const MODE = flag('mode', 'baseline')
const CAPTURE = flag('capture', 'static')
const RUN = flag('run', `${MODE}-${GPU}-${new Date().toISOString().replace(/[:.]/g, '-')}`)
const OUT = resolve(ROOT, flag('out', `shots/first-person/${RUN}`))
const YAWS = (flag('yaws', '0,45,90,135,180,225,270,315')).split(',').map(Number)
const PITCHES = (flag('pitches', '-25,0,25')).split(',').map(Number)
/** 시각을 못 박는다 — 하늘과 조명이 실제 시계를 따라가서 전후 비교가 흔들린다 */
const HOUR = Number(flag('hour', '12'))
const VIEWPORT = { width: 1280, height: 720 }
const WANT = wantBackend(GPU)

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms) })

/**
 * 한 장 찍고 재기. 거의 한 색이면 그린 그림이 아니다.
 *
 * 판정과 비교는 PNG 파일로 하고, 보고서에는 **JPEG 사본**을 싣는다 — 1280×720
 * PNG 수백 장을 한 파일에 실으면 수백 MB라 안 열린다
 */
const thumbs = new Map()
/**
 * 개발 도구의 성능 패널만 가린다 — 사용자 화면에는 없는 것이 왼쪽 위를 덮는다.
 * 찍는 순간에만 걸리는 CSS라 게임은 안 바뀐다
 */
const HIDE_DEV = 'div:has(> button[aria-expanded] > span + span){visibility:hidden !important}'
/**
 * 못 찾은 그림(`ChunkModels`의 `MISSING`, #ff00ff)이 몇 픽셀인가.
 *
 * ⚠️ **보이면 무조건 결함이다.** 실측(2026-09-17): 214번도로에서 장막시티 쪽을
 * 보면 3인칭 한 장에 1,705픽셀이 나왔다 — 이웃 지역 청크를 현재 묶음으로 그린 탓
 * (`scene/chunkSheets`). 조명·안개가 섞여 정확히 #ff00ff가 아니므로 문턱으로 잰다
 */
function magentaPixels(buf) {
  const { w, h, bpp, pixels } = decodePng(buf)
  let n = 0
  for (let i = 0; i < w * h; i++) {
    const o = i * bpp
    if (pixels[o] > 200 && pixels[o + 1] < 60 && pixels[o + 2] > 200) n += 1
  }
  return n
}

/**
 * 새까만 픽셀이 몇인가 (0~255 채널 셋 다 8 미만).
 *
 * 판정이 아니라 **전후를 견주는 잣대**다 — 밤·굴 안은 원래 어둡다. 정점색이 0인
 * 판에서 내려온 턱 옆면(장막백화점 2층 검은 기둥)이 이 수로 드러난다
 */
function blackPixels(buf) {
  const { w, h, bpp, pixels } = decodePng(buf)
  let n = 0
  for (let i = 0; i < w * h; i++) {
    const o = i * bpp
    if (pixels[o] < 8 && pixels[o + 1] < 8 && pixels[o + 2] < 8) n += 1
  }
  return n
}

async function snap(page, file) {
  const buf = await page.screenshot({ path: file, style: HIDE_DEV })
  const stats = statsOf(buf)
  stats.magenta = magentaPixels(buf)
  stats.black = blackPixels(buf)
  const jpg = await page.screenshot({ type: 'jpeg', quality: 45, style: HIDE_DEV })
  thumbs.set(file, `data:image/jpeg;base64,${jpg.toString('base64')}`)
  return { file, flat: looksFlat(stats), stats }
}

/** 게임 쪽 상태 — 읽기만 한다 */
const probe = (page) => page.evaluate(async () => {
  const { worldState } = await import('/src/state/worldState.ts')
  const { useOptionsStore } = await import('/src/state/optionsStore.ts')
  const { terrainReady } = await import('/src/scene/terrainMark.ts')
  const { world } = await import('/src/engine/map/world.ts')
  const ready = terrainReady()
  const p = worldState.player.position
  return {
    map: world.mapId,
    at: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
    option: useOptionsStore.getState().view,
    mode: worldState.camera.mode,
    yaw: +worldState.camera.yaw.toFixed(3),
    pitch: +worldState.camera.pitch.toFixed(3),
    ready: ready.ok,
    why: ready.ok ? null : ready.why,
    backend: document.documentElement.dataset.backend ?? null,
  }
})

async function waitFor(page, test, ms, label) {
  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < ms) {
    last = await probe(page)
    if (test(last)) return { ok: true, last, ms: Date.now() - t0 }
    await sleep(250)
  }
  return { ok: false, last, ms: Date.now() - t0, label }
}

/**
 * 열린 대사·스크립트를 넘긴다 — 사람이 하는 그대로 스페이스.
 *
 * ⚠️ **대사가 열려 있으면 못 걷는다.** 실측(2026-09-17 WebGL 기준선): 주인공 방의
 * 확인 지점에서 TV 방송 대사가 떠 있어서 걷기가 0칸이었다. 못 닫으면 false
 */
async function clearTalk(page) {
  for (let i = 0; i < 40; i++) {
    const open = await page.evaluate(() => {
      const d = document.documentElement.dataset
      return d.talk === '1' || d.script === '1'
    })
    if (!open) return true
    // 게임이 입력을 프레임마다 읽는다 — 한 프레임 안에 눌렀다 떼면 놓친다 (`drive.tap`의 70ms)
    await page.keyboard.press('Space', { delay: 80 })
    await sleep(350)
  }
  return false
}

/** V를 누르고 그 모드가 될 때까지. 누른 것이 먹었는지 본다 */
async function pressView(page, want) {
  await page.keyboard.press('KeyV')
  return waitFor(page, (s) => s.option === (want === 'first' ? 1 : 0) && s.mode === want, 10_000, `V → ${want}`)
}

async function enterCheckpoint(page, url, id) {
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 300_000 })
  const map = await page.evaluate(async (want) => {
    const m = await import('/src/engine/dev/checkpoints.ts')
    return m.CHECKPOINTS.find((c) => c.id === want)?.map ?? null
  }, id)
  if (map === null) throw new Error(`모르는 확인 지점 ${id}`)
  await page.keyboard.press('Backquote')
  await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
  const row = page.locator(`[data-checkpoint="${id}"]`).first()
  await row.hover()
  await page.waitForTimeout(200)
  await row.click()
  await page.waitForURL('**/play', { timeout: 60_000 })
  await page.waitForFunction(async (want) => {
    const m = await import('/src/engine/map/world.ts')
    return m.world.mapId === want
  }, map, { timeout: 120_000 })
  await page.waitForSelector('canvas', { timeout: 120_000 })
  await page.evaluate(async (h) => {
    const w = await import('/src/state/worldState.ts')
    w.worldState.time.gameHour = h
  }, HOUR)
  return map
}

const results = []
let vite = null
let browser = null
try {
  mkdirSync(OUT, { recursive: true })
  const port = await freePort()
  vite = await startVite(port)
  browser = await chromium.launch({ args: gpuArgs(GPU) })
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 })
  page.setDefaultNavigationTimeout(300_000)
  // 표현 레시피 모드 — 페이지가 뜨기 전에 적는다 (`scene/visual/recipes.recipeMode`).
  // baseline은 기본(verified), candidate는 초안까지 켠다
  const visualMode = MODE === 'candidate' ? 'candidate' : MODE === 'legacy' ? 'legacy' : null
  if (visualMode !== null) {
    await page.addInitScript((m) => { sessionStorage.setItem('pt.visualMode', m) }, visualMode)
  }
  const noise = []
  page.on('console', (m) => { if (m.type() === 'error') noise.push(`error: ${m.text().slice(0, 300)}`) })
  page.on('pageerror', (e) => { noise.push(`pageerror: ${String(e.message).slice(0, 300)}`) })

  for (const spec of SITES) {
    // `forest@120:540` — 확인 지점에 들어간 뒤 그 칸으로 옮겨 선다 (`pnpm shot --at`과 같다)
    //
    // `elite>357@9:11` — 확인 지점의 진행 상태 그대로 **맵 357의 워프 0번**에 선다.
    // 확인 지점이 없는 맵(혼잡한 탑·천관산 층)을 보려고 둔다 (`devWarp.warpTo`)
    const [head, atText] = spec.split('@')
    const [cp, mapText] = head.split('>')
    const site = spec.replace(/[@:>]/g, '_')
    const row = { site, checkpoint: cp, at: atText ?? null, status: 'CAPTURED', shots: [], walk: [], toggles: [], notes: [], noise: [] }
    results.push(row)
    const dir = resolve(OUT, site)
    mkdirSync(dir, { recursive: true })
    const noiseAt = noise.length
    try {
      try {
        row.map = await enterCheckpoint(page, vite.url, cp)
        if (mapText !== undefined) {
          const first = await waitFor(page, (st) => st.ready, 90_000, '출발 자리 준비')
          if (!first.ok) throw new Error(`출발 자리 지형이 안 섰다 — ${String(first.last?.why)}`)
          const want = Number(mapText)
          await page.evaluate(async ([id, m]) => {
            const { CHECKPOINTS } = await import('/src/engine/dev/checkpoints.ts')
            const { warpTo } = await import('/src/app/devWarp.ts')
            const base = CHECKPOINTS.find((c) => c.id === id)
            await warpTo({ ...base, id: `${id}>${String(m)}`, map: m, spot: { kind: 'warp', index: 0 } })
          }, [cp, want])
          await page.waitForFunction(async (w) => {
            const m = await import('/src/engine/map/world.ts')
            return m.world.mapId === w
          }, want, { timeout: 120_000 })
          await page.evaluate(async (h) => {
            const w = await import('/src/state/worldState.ts')
            w.worldState.time.gameHour = h
          }, HOUR)
          row.map = want
        }
        if (atText !== undefined) {
          // ⚠️ **출발 자리가 다 선 뒤에 옮긴다.** 들어서자마자 옮기면 확인 지점의
          // 배치가 늦게 와서 덮는다 (실측: 575로 옮겼는데 531.5에 서 있었다)
          const first = await waitFor(page, (st) => st.ready, 90_000, '출발 자리 준비')
          if (!first.ok) throw new Error(`출발 자리 지형이 안 섰다 — ${String(first.last?.why)}`)
          const [x, z] = atText.split(':').map(Number)
          await page.evaluate(async ([tx, tz]) => {
            const w = await import('/src/state/worldState.ts')
            w.worldState.player.position.x = tx + 0.5
            w.worldState.player.position.z = tz + 0.5
            w.worldState.player.prevPosition.copy(w.worldState.player.position)
          }, [x, z])
          await sleep(1500)
          row.moved = await page.evaluate(async () => {
            const w = await import('/src/state/worldState.ts')
            const { cameraSystem } = await import('/src/engine/actor/camera.ts')
            const p = w.worldState.player.position, c = w.worldState.camera.position
            return { player: [p.x, p.y, p.z], camera: [c.x, c.y, c.z], drift: cameraSystem.drift }
          })
          // ⚠️ **막힌 칸에 세우면 벽 속에서 찍힌다.** 사람이 못 서는 자리이므로
          // 결함으로 적지 않고 「기하 진단」으로 가른다 (§11.5)
          row.walkable = await page.evaluate(async ([tx, tz]) => {
            const { world } = await import('/src/engine/map/world.ts')
            return world.grid === null ? null : !world.grid.isBlocked(tx, tz)
          }, [x, z])
          const [px, , pz] = row.moved.player
          if (Math.abs(px - (x + 0.5)) > 1 || Math.abs(pz - (z + 0.5)) > 1) {
            throw new Error(`옮긴 자리가 안 남았다 — 원한 곳 ${String(x)},${String(z)} · 선 곳 ${String(px)},${String(pz)}`)
          }
        }
      } catch (e) {
        row.status = 'BLOCKED_INFRA'
        row.notes.push(`확인 지점에 못 들어갔다 — ${String(e.message).slice(0, 200)}`)
        continue
      }
      if (!(await clearTalk(page))) row.notes.push('들어선 뒤 대사·스크립트를 못 닫았다')
      // 3인칭에서 시작한다 — 이전 장소의 설정이 남아 있을 수 있다
      const start = await probe(page)
      if (start.option !== 0) await pressView(page, 'third')
      const settled3 = await waitFor(page, (s) => s.ready, 60_000, '3인칭 준비')
      if (!settled3.ok) {
        row.status = 'BLOCKED_INFRA'
        row.notes.push(`3인칭 지형 준비가 안 됐다 — ${String(settled3.last?.why)}`)
        continue
      }
      row.third = await snap(page, resolve(dir, 'third.png'))
      if (row.third.stats.magenta > 0) {
        row.status = 'FAILED_VISUAL'
        row.notes.push(`3인칭에서 못 찾은 그림(자홍) ${String(row.third.stats.magenta)}픽셀`)
      }

      const on = await pressView(page, 'first')
      row.toggles.push({ to: 'first', ok: on.ok, ms: on.ms })
      if (!on.ok) {
        row.status = 'FAILED_VISUAL'
        row.notes.push(`V를 눌러도 1인칭이 안 됐다 — ${JSON.stringify(on.last)}`)
        continue
      }
      const ready = await waitFor(page, (s) => s.ready && s.mode === 'first', 60_000, '1인칭 준비')
      row.state = ready.last
      if (!ready.ok) {
        row.status = 'BLOCKED_INFRA'
        row.notes.push(`1인칭 지형 준비가 안 됐다 — ${String(ready.last?.why)}`)
        continue
      }
      if (WANT !== null && ready.last.backend !== WANT) {
        row.status = 'FAILED_VISUAL'
        row.notes.push(`백엔드가 ${String(ready.last.backend)}다 (기대 ${WANT}) — 이 판의 그림은 그 백엔드 몫이 아니다`)
      }

      for (const pitch of PITCHES) {
        for (const yaw of YAWS) {
          await page.evaluate(([y, p]) => globalThis.pt.look(y, p), [yaw, pitch])
          await sleep(450)
          const s = await snap(page, resolve(dir, `y${String(yaw).padStart(3, '0')}_p${pitch < 0 ? 'm' : 'p'}${Math.abs(pitch)}.png`))
          const st = await probe(page)
          row.shots.push({ yaw, pitch, file: s.file, flat: s.flat, magenta: s.stats.magenta, black: s.stats.black, mode: st.mode, ready: st.ready })
          if (s.stats.magenta > 0) {
            row.status = 'FAILED_VISUAL'
            row.notes.push(`못 찾은 그림(자홍) ${String(s.stats.magenta)}픽셀 — yaw ${String(yaw)} pitch ${String(pitch)}`)
          }
          // 자(`looksFlat`)는 `shot`·`story`와 같은 것을 쓴다 — 여기서 문턱을 안 바꾼다.
          // 문짝에 코를 댄 장면도 색이 적어 걸리므로, 사람이 가르게 수치를 같이 적는다
          const why = `색 ${String(s.stats.colors)} · 흩어짐 ${s.stats.stdev.toFixed(1)}`
          if (s.flat && row.walkable === false) {
            row.notes.push(`한 색 화면 — yaw ${String(yaw)} (막힌 칸이라 기하 진단 · ${why})`)
          } else if (s.flat) {
            row.status = 'FAILED_VISUAL'
            row.notes.push(`한 색 화면 — yaw ${String(yaw)} pitch ${String(pitch)} (${why})`)
          }
          if (st.mode !== 'first') {
            row.status = 'FAILED_VISUAL'
            row.notes.push(`찍는 중에 1인칭이 풀렸다 — yaw ${String(yaw)}`)
          }
        }
      }

      // 0→1→0→1 — 되돌아가도 같은 자리에서 같은 쪽을 보는가
      await page.evaluate(() => globalThis.pt.look(0, 0))
      const off = await pressView(page, 'third')
      row.toggles.push({ to: 'third', ok: off.ok, ms: off.ms })
      await sleep(600)
      row.thirdAgain = await snap(page, resolve(dir, 'third-again.png'))
      const back = await pressView(page, 'first')
      row.toggles.push({ to: 'first', ok: back.ok, ms: back.ms, yaw: back.last?.yaw })
      await sleep(600)
      row.firstAgain = await snap(page, resolve(dir, 'first-again.png'))
      if (!off.ok || !back.ok) {
        row.status = 'FAILED_VISUAL'
        row.notes.push('시점 전환이 제자리로 안 온다')
      }

      if (CAPTURE === 'walk' || CAPTURE === 'all') {
        /**
         * ⚠️ **아무 쪽으로나 걸으면 안 된다.** 처음에는 늘 북쪽으로 걸었는데, 확인
         * 지점이 문 앞이라 첫 0.5초에 **건물로 들어가 버렸고**(찍힌 것은 실내다),
         * 앞이 막힌 자리에서는 한 칸도 안 움직였다. 막힘도 워프도 없는 칸이 가장
         * 길게 이어지는 방위를 골라 그쪽을 보고 걷는다 (1인칭은 ↑가 보는 쪽이다)
         */
        const lane = await page.evaluate(async () => {
          const { world, warpsOf } = await import('/src/engine/map/world.ts')
          const { worldState } = await import('/src/state/worldState.ts')
          const grid = world.grid
          if (grid === null) return null
          const tx = Math.floor(worldState.player.position.x), tz = Math.floor(worldState.player.position.z)
          const warps = new Set(warpsOf(world.mapId ?? -1).map((w) => `${String(w.x)},${String(w.z)}`))
          let best = { yaw: 0, steps: 0 }
          for (const [dx, dz, yaw] of [[0, -1, 0], [1, 0, 90], [0, 1, 180], [-1, 0, 270]]) {
            let k = 0
            while (k < 8) {
              const x = tx + dx * (k + 1), z = tz + dz * (k + 1)
              if (grid.isBlocked(x, z) || warps.has(`${String(x)},${String(z)}`)) break
              k += 1
            }
            if (k > best.steps) best = { yaw, steps: k }
          }
          return { ...best, map: world.mapId }
        })
        row.walkLane = lane
        if (!(await clearTalk(page))) row.notes.push('걷기 전에 대사·스크립트를 못 닫았다')
        if (lane === null || lane.steps < 2) {
          row.notes.push(`걸을 길이 없다 — 네 방위 모두 두 칸 안에 막힘·워프 (${JSON.stringify(lane)})`)
        } else {
          await page.evaluate((y) => globalThis.pt.look(y, 0), lane.yaw)
          await sleep(300)
          const origin = (await probe(page)).at
          await page.keyboard.down('ArrowUp')
          try {
            for (let i = 0; i < 10; i++) {
              await sleep(500)
              const s = await snap(page, resolve(dir, `walk-${String(i).padStart(2, '0')}.png`))
              const st = await probe(page)
              row.walk.push({ t: (i + 1) * 0.5, file: s.file, flat: s.flat, magenta: s.stats.magenta, at: st.at, map: st.map, mode: st.mode })
              if (s.stats.magenta > 0) {
                row.status = 'FAILED_VISUAL'
                row.notes.push(`걷는 중 못 찾은 그림(자홍) ${String(s.stats.magenta)}픽셀 — ${String((i + 1) * 0.5)}초`)
              }
              if (st.map !== lane.map) {
                row.notes.push(`걷다가 맵이 바뀌었다 (${String(lane.map)} → ${String(st.map)}) — 뒤 그림은 다른 맵이다`)
                break
              }
            }
          } finally {
            await page.keyboard.up('ArrowUp')
          }
          // 출발 자리부터 잰다 — 첫 그림은 이미 0.5초 걸은 뒤다
          const a = origin, b = row.walk[row.walk.length - 1]?.at
          const moved = a && b ? Math.hypot(b[0] - a[0], b[2] - a[2]) : 0
          row.walkMoved = +moved.toFixed(2)
          if (moved < 1) row.notes.push(`걷기가 거의 안 움직였다 (${moved.toFixed(2)}칸) — 걷기 증거가 아니다`)
        }
      }
    } catch (e) {
      row.status = 'BLOCKED_INFRA'
      row.notes.push(`터졌다 — ${String(e?.message ?? e).slice(0, 300)}`)
    } finally {
      row.noise = noise.slice(noiseAt, noiseAt + 20)
      // 다음 장소는 3인칭에서 시작하게 되돌려 둔다 (다시 들어갈 때 설정이 남는다)
      try { await page.evaluate(() => globalThis.pt?.view(0)) } catch { /* 페이지가 죽었으면 다음 goto가 새로 연다 */ }
      console.log(`  ${site.padEnd(12)} ${row.status}  찍음 ${String(row.shots.length)}${row.walk.length ? ` · 걷기 ${String(row.walk.length)}` : ''}${row.notes.length ? ` · ${row.notes[0]}` : ''}`)
    }
  }
} catch (e) {
  results.push({ site: '(도구)', status: 'BLOCKED_INFRA', notes: [String(e?.stack ?? e).slice(0, 600)] })
  console.error(`  도구가 섰다 — ${String(e?.message ?? e)}`)
} finally {
  await browser?.close()
  vite?.child.kill()
}

const run = {
  run: RUN, mode: MODE, gpu: GPU, wantBackend: WANT, capture: CAPTURE, hour: HOUR,
  viewport: VIEWPORT, yaws: YAWS, pitches: PITCHES, sites: results,
  meaning: 'CAPTURED는 찍혔다는 뜻이지 통과가 아니다 — 사람이 그림을 보고 정한다',
}
writeFileSync(resolve(OUT, 'run.json'), `${JSON.stringify(run, null, 1)}\n`)

// ── 한 파일 보고서 ───────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch])
const inline = (file) => thumbs.get(file) ?? ''
const section = (r) => {
  const grid = PITCHES.map((p) => `<div class="row"><span class="lab">고개 ${p}°</span>${
    YAWS.map((y) => {
      const s = r.shots?.find((x) => x.yaw === y && x.pitch === p)
      return s ? `<figure><img loading="lazy" src="${inline(s.file)}" alt="${esc(r.site)} ${y}° ${p}°"><figcaption>${y}°${s.flat ? ' · 한 색' : ''}${s.magenta ? ` · 자홍 ${s.magenta}` : ''}${s.black ? ` · 검정 ${s.black}` : ''}</figcaption></figure>` : ''
    }).join('')}</div>`).join('')
  const pair = [['3인칭', r.third], ['3인칭 (다시)', r.thirdAgain], ['1인칭 (다시)', r.firstAgain]]
    .filter(([, s]) => s).map(([t, s]) => `<figure><img loading="lazy" src="${inline(s.file)}" alt="${esc(t)}"><figcaption>${esc(t)}</figcaption></figure>`).join('')
  const walk = (r.walk ?? []).map((w) => `<figure><img loading="lazy" src="${inline(w.file)}" alt="걷기 ${w.t}s"><figcaption>${w.t}s · ${esc(w.at?.join(','))}</figcaption></figure>`).join('')
  return `<section id="${esc(r.site)}">
<h2>${esc(r.site)} <span class="st st-${esc(r.status)}">${esc(r.status)}</span></h2>
<p class="meta">${r.walkable === false ? '<strong>기하 진단 — 사람이 못 서는 칸</strong> · ' : ''}맵 ${esc(r.map)} · 자리 ${esc(r.state?.at?.join(', '))} · 백엔드 ${esc(r.state?.backend)} · 전환 ${esc((r.toggles ?? []).map((t) => `${t.to}${t.ok ? '' : '✗'}`).join('→'))}</p>
${(r.notes ?? []).length ? `<ul class="notes">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
${(r.noise ?? []).length ? `<details><summary>콘솔 ${r.noise.length}줄</summary><pre>${esc(r.noise.join('\n'))}</pre></details>` : ''}
<div class="row">${pair}</div>
${grid}
${walk ? `<h3>걷기 — ${esc(r.walkLane?.yaw)}° 쪽으로 ${esc(r.walkMoved)}칸</h3><div class="row">${walk}</div>` : ''}
</section>`
}
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>1인칭 기준선 화면</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--bg:#f6f5f1;--fg:#1d1d1b;--muted:#6b6a64;--line:#dedbd2;--bad:#b3261e;--ok:#2e6b3a;--warn:#8a5a00}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#171716;--fg:#ecebe6;--muted:#a09e96;--line:#3a3935;--bad:#f2b8b5;--ok:#9fd4a8;--warn:#f0c674}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}
header,section{max-width:1400px;margin:auto;padding:16px}
h1{font-size:22px;margin:0 0 6px}h2{font-size:18px;margin:24px 0 4px}
.meta,.lead{color:var(--muted);margin:0 0 8px}
.row{display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;align-items:flex-start}
.lab{flex:0 0 64px;color:var(--muted);font-size:12px;padding-top:4px}
figure{margin:0;flex:0 0 auto}
img{width:240px;height:auto;display:block;border:1px solid var(--line)}
figcaption{font-size:11px;color:var(--muted)}
.st{font-size:12px;padding:1px 6px;border-radius:3px;border:1px solid currentColor}
.st-CAPTURED{color:var(--ok)}.st-FAILED_VISUAL{color:var(--bad)}.st-BLOCKED_INFRA{color:var(--warn)}
.notes{color:var(--bad);margin:4px 0}
nav{display:flex;gap:8px;flex-wrap:wrap}nav a{color:inherit}
pre{white-space:pre-wrap;font-size:11px}
</style></head><body>
<header>
<h1>1인칭 화면 — ${esc(MODE)} · ${esc(GPU)}</h1>
<p class="lead">${esc(RUN)} · ${VIEWPORT.width}×${VIEWPORT.height} DPR1 · 게임 시각 ${HOUR}시 · 방위 ${YAWS.join('/')}° · 고개 ${PITCHES.join('/')}°. <strong>CAPTURED는 찍혔다는 뜻이지 통과가 아닙니다.</strong></p>
<nav>${results.map((r) => `<a href="#${esc(r.site)}">${esc(r.site)} (${esc(r.status)})</a>`).join('')}</nav>
</header>
${results.map(section).join('\n')}
</body></html>`
mkdirSync(resolve(ROOT, '.audit/first-person'), { recursive: true })
const report = resolve(ROOT, `.audit/first-person/${RUN}.html`)
writeFileSync(report, html)
console.log(`\n  보고서 ${report}\n  그림 ${OUT}`)
const bad = results.filter((r) => r.status !== 'CAPTURED').length
process.exit(bad === 0 ? 0 : 1)
