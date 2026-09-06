// 확인 지점 세이브를 굽고 재는 두 도구가 같이 쓰는 것들.
//
// ⚠️ **하네스가 저마다 「기다리는 법」을 다시 적으면 안 된다.** 이야기 훑기가
// 실측으로 얻은 규칙이 둘 있는데(`tools/e2e/story.mjs`), 둘 다 여기서 같이 쓴다:
//
//   ① 붙는 것(삼각형)이 멎었다고 **화면이 도는 것은 아니다** — 실측으로 배틀파크·
//      배틀타워 둘 다 도착 뒤 12초 동안 초당 한 프레임이고 14초부터 60fps다
//      (`.audit/parkWhen.mjs`). 그 사이에 걸어 보면 시뮬이 한 번도 안 돌아
//      「네 방향 다 못 걸었다」가 된다
//   ② 확인 지점 표는 백틱 **토글**이라, 열렸는지 보고 누를지 정하면 그 틈에 걸린다
import { resolve } from 'node:path'

export const ROOT = resolve(import.meta.dirname, '../..')

/** 붙기를 기다리는 최대 시간 */
const SETTLE_MAX_MS = 30_000
/** 「화면이 돈다」로 볼 문턱 — 이 창 동안 이만큼은 돌아야 한다 */
const LIVE_WINDOW_MS = 400
const LIVE_FRAMES = 18

export function argOf(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit === undefined ? fallback : hit.slice(name.length + 3)
}

/** `<html>`에 적힌 표식 — 씬이 스스로 적는다 (`app/sceneMark`) */
export const marks = (page) => page.evaluate(() => {
  const d = document.documentElement.dataset
  return {
    boot: d.boot ?? null, scene: d.scene ?? null, map: Number(d.map ?? -1),
    menu: d.menu ?? null, talk: d.talk === '1', script: d.script === '1',
    battle: d.battle ?? null, tile: d.tile ?? '', path: location.pathname,
  }
})

export const perf = (page) => page.evaluate(async () => {
  try {
    const m = await import('/src/scene/sceneRefs.ts')
    return { ...m.perfSnapshot }
  } catch { return null }
})

/** 화면이 실제로 도는가. `perfSnapshot.fps`는 루프가 저를 센 것이라 못 믿는다 */
export const frameLoopLive = (page) => page.evaluate(async (ms) => {
  let n = 0
  await new Promise((done) => {
    const s = performance.now()
    const tick = (t) => { n++; if (t - s < ms) requestAnimationFrame(tick); else done() }
    requestAnimationFrame(tick)
  })
  return n
}, LIVE_WINDOW_MS).then((n) => ({ live: n >= LIVE_FRAMES, frames: n }))

/** 삼각형이 멎고 **화면이 돌기 시작할** 때까지 */
export async function settle(page) {
  const till = Date.now() + SETTLE_MAX_MS
  let last = -1
  let same = 0
  let seen = { live: false, frames: 0 }
  while (Date.now() < till) {
    const p = await perf(page)
    const tri = p?.triangles ?? 0
    same = tri === last ? same + 1 : 0
    last = tri
    if (same >= 3 && tri > 0) {
      seen = await frameLoopLive(page)
      if (seen.live) return { tri, draws: p?.drawCalls ?? 0 }
      continue
    }
    await page.waitForTimeout(250)
  }
  const p = await perf(page)
  return { tri: p?.triangles ?? 0, draws: p?.drawCalls ?? 0, slow: true, frames: seen.frames }
}

/** 타이틀이 열릴 때까지 */
export async function openTitle(page, url) {
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null,
    { timeout: 60_000 })
}

/** 확인 지점 표를 열고 그 줄을 누른다 */
export async function warpTo(page, cp) {
  const table = page.getByText('확인 지점').first()
  for (let tries = 0; ; tries++) {
    await page.keyboard.press('Backquote')
    try { await table.waitFor({ timeout: 15_000 }); break } catch {
      if (tries >= 2) throw new Error(`확인 지점 표가 안 열렸다 (${cp.id})`)
      // 토글이라 한 번은 닫는 데 쓰인다 — 닫힌 것을 보고 다시 누른다
      await table.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {})
    }
  }
  const row = page.locator(`[data-checkpoint="${cp.id}"]`).first()
  await row.hover()
  await page.waitForTimeout(150)
  await row.click()
  await page.waitForURL('**/play', { timeout: 60_000 })
  await page.waitForFunction(async (want) => {
    const m = await import('/src/engine/map/world.ts')
    return m.world.mapId === want
  }, cp.map, { timeout: 90_000 })
  await page.waitForSelector('canvas', { timeout: 120_000 })
}

/** 확인 지점 표를 페이지 안에서 읽는다 — 노드는 `.ts`를 못 읽는다 */
export const checkpointsOf = (page) => page.evaluate(async () => {
  const m = await import('/src/engine/dev/checkpoints.ts')
  return m.CHECKPOINTS.map((c) => ({
    id: c.id, label: c.label, map: c.map, env: c.env, try: c.try,
    battle: c.battle ?? null, hour: c.hour ?? null, stage: m.stageOf(c),
  }))
})

/** 파일 이름 — 이야기 순서가 그대로 보이게 번호를 앞에 둔다 */
export function saveName(index, id) {
  return `${String(index + 1).padStart(2, '0')}-${id}.rpsave`
}

/**
 * 우리 것이 아니라 못 고치는 소리 — 훑기와 **같은 목록**이다
 * (`tools/e2e/story.mjs`). 갈라 두면 한쪽만 조용해진다
 */
const NOISE_OK = [
  /ResizeObserver/,
  /Download the React DevTools/,
  /\[vite\]/,
  /Failed to load resource: net::ERR_ABORTED/,
  /THREE\.Clock: This module has been deprecated/,
  /powerPreference option is currently ignored/,
  /WebGPU is not available, running under WebGL2 backend/,
  /Device failed at creation/,
]

/** 이 화면이 내는 소리를 모은다. 걸러진 것도 세어서 같이 돌려준다 */
export function watchNoise(page) {
  const ours = []
  const known = new Map()
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return
    const text = m.text()
    if (NOISE_OK.some((re) => re.test(text))) {
      known.set(text.slice(0, 60), (known.get(text.slice(0, 60)) ?? 0) + 1)
      return
    }
    ours.push(`${m.type()}: ${text.slice(0, 160)}`)
  })
  page.on('pageerror', (e) => { ours.push(`pageerror: ${String(e.message).slice(0, 160)}`) })
  return { ours, known }
}

/** 지금 무슨 스크립트가 어디까지 갔나 — 「안 끝난다」와 「도는 중」을 가른다 */
const beat = (page) => page.evaluate(async () => {
  try {
    const f = await import('/src/engine/script/field.ts')
    const d = document.documentElement.dataset
    return `${String(f.fieldScripts.world?.scriptID ?? '')}|`
      + `${String(f.fieldScripts.ctx?.pointer ?? '')}|${d.tile ?? ''}|${d.talk ?? ''}`
  } catch { return '' }
})

/**
 * 도착하면서 걸린 장면을 **끝까지 민다**.
 *
 * ⚠️ **밀지 않고 재면 안 된다.** 맵에 들어서면 매 프레임 표가 스크립트를 거는
 * 자리가 있고(`InitScriptEntry_OnFrameTable`), 그동안 주인공은 묶여 있다 —
 * 실측으로 깨어진 세계 1F가 `data-script=1`인 채로 서서 방향키를 눌러도
 * `worldState.input.move`가 0이었다. 그 자리를 「못 걸었다」로 적으면 임자가
 * 틀린다.
 *
 * ⚠️ **세이브는 도는 스크립트를 못 담는다.** 그러니 굽기 전에도 밀어서 끝내야
 * 한다 — 안 그러면 그 장면이 세울 값이 빠진 채로 파일이 나온다.
 *
 * ⚠️ **시간으로 안 끊는다.** 지문이 안 바뀐 채로 `FREEZE_MS`가 지나야 얼었다고
 * 한다 — 원작 그대로 긴 장면이 있다 (`tools/e2e/story.mjs`와 같은 규칙)
 */
export async function pushScripts(page, budgetMs = 120_000) {
  const till = Date.now() + budgetMs
  let seen = await beat(page)
  let changed = Date.now()
  let taps = 0
  while (Date.now() < till) {
    const at = await marks(page)
    // 배틀이 열렸으면 여기서 안 민다 — 부르는 쪽이 무엇을 할지 정한다
    if (at.scene === 'battle') return { done: false, battle: true, taps }
    if (!at.talk && !at.script) return { done: true, taps }
    // ⚠️ **키를 붙잡아야 한다.** `press()`는 눌렀다 떼는 것이 한 프레임 안에
    // 끝나서 **게임이 못 본다** — 입력을 프레임마다 읽으므로 그렇다. 실측으로
    // 은하단 아지트가 401번 눌러도 지문이 안 넘어갔다. 훑기와 같은 70ms다
    await page.keyboard.down('Space')
    await page.waitForTimeout(70)
    await page.keyboard.up('Space')
    await page.waitForTimeout(50)
    taps++
    const now = await beat(page)
    if (now !== seen) { seen = now; changed = Date.now() }
    else if (Date.now() - changed > 20_000) return { done: false, frozen: true, taps, at: seen }
  }
  return { done: false, taps, at: seen }
}

/** 네 방향 중 하나로라도 한 칸 가는가 */
export async function canWalk(page) {
  const before = (await marks(page)).tile
  for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']) {
    await page.keyboard.down(key)
    let saw = null
    for (let i = 0; i < 9; i++) {
      await page.waitForTimeout(70)
      const now = await marks(page)
      if (now.scene === 'battle') { saw = '배틀'; break }
      if (now.tile !== before && now.tile !== '') { saw = now.tile; break }
    }
    await page.keyboard.up(key)
    await page.waitForTimeout(100)
    if (saw !== null) return { moved: true, from: before, to: saw }
  }
  return { moved: false, from: before }
}
