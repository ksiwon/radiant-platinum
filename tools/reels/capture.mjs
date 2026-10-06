// 쇼츠 · 릴스용 장면을 실제 게임에서 찍는다 (docs/orders/REELS_20261003.md)
//
//     node tools/reels/capture.mjs room twinleaf         장면 둘을 찍는다
//     node tools/reels/capture.mjs room --still          움직이기 전 한 장만 (자리 맞추기)
//     node tools/reels/capture.mjs --list                장면 목록
//
// 장면마다 `.audit/reels/take/<id>/`에 JPEG 프레임과 `frames.json`(프레임마다 시각)을 쓴다. 묶는 일은 `assemble.mjs`가 한다.
//
// ⚠️ **스크린샷을 이어 붙이지 않는다.** `page.screenshot()`은 한 장에 수십 ms라 30fps가 안 나온다. CDP `Page.startScreencast`는
// 브라우저가 그린 프레임을 그 시각과 함께 밀어 준다 — 시각이 있으니 묶을 때 고르게 다시 뽑을 수 있다.
//
// ⚠️ **화면 위 계기판 · 조작 안내를 숨긴다.** 둘 다 개발 서버에서만 붙는 것이라 영상에 나가면 안 된다. 클래스 이름이 해시라 글자로 찾는다
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer as netServer } from 'node:net'
import { chromium } from 'playwright'
import { startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { TAKES } from './takes.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
/** 본편은 가로 16:9(원본과 같다), 쇼츠 · 릴스는 세로 9:16 — `--aspect=9:16` */
const ASPECT = (args.find((a) => a.startsWith('--aspect=')) ?? '--aspect=16:9').slice(9)
const OUT = resolve(ROOT, '.audit/reels/take', ASPECT.replace(':', 'x'))
const VIEW = ASPECT === '9:16' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }
const ids = args.filter((a) => !a.startsWith('--'))
const still = args.includes('--still')
const HERO = (args.find((a) => a.startsWith('--hero=')) ?? '--hero=girl').slice(7)

function freePort() {
  return new Promise((done) => {
    const s = netServer()
    s.listen(0, () => { const { port } = s.address(); s.close(() => { done(port) }) })
  })
}

/** 개발용 덮개를 숨긴다 — 다시 그려져도 다시 숨기도록 지켜본다 */
async function hideDevChrome(page) {
  await page.evaluate(() => {
    const hide = () => {
      for (const el of document.querySelectorAll('div, button')) {
        const t = el.textContent ?? ''
        const fixed = getComputedStyle(el).position === 'fixed'
        if (fixed && (/^FPS/.test(t.trim()) || /^조작/.test(t.trim()))) el.style.visibility = 'hidden'
      }
    }
    hide()
    new MutationObserver(hide).observe(document.body, { childList: true, subtree: true })
  })
}

/**
 * 지형과 BDSP 층이 **섰다고 제품이 말할 때까지** 기다린다 (`terrainReady` · `bdspSettled`).
 * 시간(`settle`)만 두면 기계가 바쁠 때 DS 지형이나 흰 허공이 찍혔다 — 다른 프로젝트 테스트와 겹친 판에서 D1~D3이 그랬다.
 * 카메라 잔여만 남은 것은 선 것으로 본다(움직임 판은 카메라 시스템을 떼어 두어 잔여가 안 준다). 5분이 넘으면 이유를 적고 그대로 간다
 */
async function waitWorldStood(page, id) {
  const t0 = Date.now()
  let why = ''
  let passed = false
  while (Date.now() - t0 < 300_000) {
    why = await page.evaluate(async () => {
      const { terrainReady } = await import('/src/scene/terrainMark.ts')
      const { bdspSettled } = await import('/src/scene/bdspReady.ts')
      const t = terrainReady()
      const terrainOk = t.ok || /카메라/.test(t.why ?? '')
      if (!terrainOk) return `지형: ${t.why}`
      if (!bdspSettled()) return 'BDSP 층이 아직 안 섰다'
      return ''
    })
    // 둘레 지역 목록은 0.5초마다 다시 고른다(`BdspField`의 `near`) — 워프 직후엔 옛 자리 목록이라 비어 있어도 「섰다」다.
    // 1.5초 뒤에 한 번 더 서 있어야 선 것으로 본다
    if (why === '' && passed) return
    passed = why === ''
    await page.waitForTimeout(passed ? 1500 : 500)
  }
  console.log(`  ${id.padEnd(14)} 5분을 기다려도 안 섰다 — ${why}`)
}

/** 확인 지점으로 뛰어든다 — `pnpm shot`과 같은 길 */
async function jump(page, url, cp) {
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 60_000 })
  // 앱이 키를 받기 전에 누르면 안 열린다 — 몇 번 더 눌러 본다. 기계가 바쁘면 1분을 넘겨서(다른 프로젝트 테스트와 겹친 판) 3분까지 본다
  for (let i = 0; ; i++) {
    await page.keyboard.press('Backquote')
    try { await page.getByText('확인 지점').first().waitFor({ timeout: 15_000 }); break } catch (e) { if (i >= 11) throw e }
  }
  const row = page.locator(`[data-checkpoint="${cp}"]`).first()
  await row.hover()
  await page.waitForTimeout(200)
  await row.click()
  await page.waitForURL('**/play', { timeout: 60_000 })
  await page.waitForSelector('canvas', { timeout: 120_000 })
}

/** 장면의 준비 단계 하나 */
async function step(page, s, cp) {
  switch (s.do) {
    case 'hour':
      await page.evaluate(async (h) => {
        const w = await import('/src/state/worldState.ts')
        w.worldState.time.gameHour = h
      }, s.hour)
      return
    case 'warp':
      // `spot`을 주면 그 자리 종류로 선다(`grass` · `open` · `tile` — 확인 지점 표와 같은 꼴). 없으면 그 맵의 첫 워프
      await page.evaluate(async ([c, m, spot]) => {
        const { CHECKPOINTS } = await import('/src/engine/dev/checkpoints.ts')
        const { warpTo } = await import('/src/app/devWarp.ts')
        const base = CHECKPOINTS.find((x) => x.id === c)
        await warpTo({ ...base, id: `${c}>${String(m)}`, map: m, spot: spot ?? { kind: 'warp', index: 0 } })
      }, [cp, s.map, s.spot ?? null])
      await page.waitForFunction(async (w) => (await import('/src/engine/map/world.ts')).world.mapId === w, s.map, { timeout: 120_000 })
      await page.waitForTimeout(s.after ?? 8000)
      return
    case 'eval':
      console.log(`                 ${JSON.stringify(await page.evaluate(s.js))}`)
      return
    case 'map':
      await page.waitForFunction(async (m) => (await import('/src/engine/map/world.ts')).world.mapId === m, s.map, { timeout: 120_000 })
      await page.waitForTimeout(s.after ?? 8000)
      return
    case 'at':
      await page.evaluate(async ([x, z]) => {
        const w = await import('/src/state/worldState.ts')
        w.worldState.player.position.x = x + 0.5
        w.worldState.player.position.z = z + 0.5
        w.worldState.player.prevPosition.copy(w.worldState.player.position)
      }, [s.x, s.z])
      await page.waitForTimeout(s.after ?? 6000)
      return
    case 'first':
      await page.keyboard.press('KeyV')
      await page.waitForFunction(async () => (await import('/src/state/worldState.ts')).worldState.camera.mode === 'first',
        null, { timeout: 15_000 })
      return
    case 'look':
      await page.evaluate(([y, p]) => globalThis.pt.look(y, p), [s.yaw, s.pitch ?? 0])
      await page.waitForTimeout(1200)
      return
    case 'eye':
      await page.evaluate(async ([e, g]) => {
        const loop = (await import('/src/engine/loop/GameLoop.ts')).gameLoop
        const cams = (await import('/src/engine/actor/camera.ts')).cameraSystem
        loop.systems = loop.systems.filter((x) => x !== cams)
        const w = await import('/src/state/worldState.ts')
        w.worldState.camera.position.set(e[0], e[1], e[2])
        w.worldState.camera.target.set(g[0], g[1], g[2])
      }, [s.eye, s.gaze])
      await page.waitForTimeout(1500)
      return
    case 'wild':
      await page.evaluate(async ([sp, l]) => { await globalThis.pt.wild(sp, l, 0) }, [s.species, s.level ?? 10])
      await page.waitForTimeout(s.after ?? 6000)
      return
    case 'trainer':
      await page.evaluate(async (id) => { await globalThis.pt.trainer(id) }, s.id)
      await page.waitForTimeout(s.after ?? 6000)
      return
    case 'keys':
      for (const k of s.keys) {
        await page.keyboard.press(k.length === 1 ? `Key${k.toUpperCase()}` : k)
        await page.waitForTimeout(s.gap ?? 600)
      }
      return
    case 'walk':
      // 문 앞에서 몇 칸 걸어 나온다 — 확인 지점은 문간에 세우는데, 거기서 1인칭이 되면 눈이 문틀 속에 든다
      await page.keyboard.down(s.key)
      await page.waitForTimeout(s.ms ?? 1200)
      await page.keyboard.up(s.key)
      await page.waitForTimeout(600)
      return
    case 'click':
      await page.locator(s.selector).first().click({ timeout: 15_000 })
      await page.waitForTimeout(s.after ?? 600)
      return
    case 'menu':
      // 배틀 명령 메뉴가 뜰 때까지 — 등장 연출 길이를 어림하지 않는다
      // 「야생 꼬링크가 나타났다!」 같은 줄은 키를 기다린다 — 메뉴가 안 보이는 동안만 Z로 넘긴다
      // 기계가 바쁘면 75초(300번)로 모자랐다 — 다른 프로젝트 테스트와 겹친 판의 E1-c. 5분까지 본다
      // ⚠️ 메뉴가 막 뜬 순간에 Z가 들어가면 기술 목록으로 들어가 버린다 — 그러면 X로 되돌린다
      for (let i = 0; i < 1200; i++) {
        const seen = async (sel) => page.locator(sel).first().isVisible().catch(() => false)
        if (await seen('[data-pilot="fight"]')) break
        if (await seen('[data-pilot="move-0"]')) { await page.keyboard.press('KeyX'); await page.waitForTimeout(500); continue }
        if (i % 5 === 4) await page.keyboard.press('KeyZ')
        await page.waitForTimeout(250)
      }
      await page.waitForSelector('[data-pilot="fight"]', { timeout: 10_000 })
      await page.waitForTimeout(s.after ?? 300)
      return
    case 'hideText':
      // 대사창을 숨긴다 — 장면의 글은 영상에 안 싣는 자리(방의 TV 방송 등). CSS 모듈 이름이 `_frame_<해시>`라 앞머리로 잡는다
      await page.addStyleTag({ content: '[class*="_frame_"],[class*="_signFrame_"]{visibility:hidden!important}' })
      return
    case 'wait':
      await page.waitForTimeout(s.ms)
      return
    case 'until': {
      // 장면 대사를 넘긴다 — 조건(`js`)이 설 때까지 키를 누른다. 확인 지점이 첫 진입 장면을 그대로 트는 곳이 있다
      const end = Date.now() + (s.timeout ?? 180_000)
      while (!(await page.evaluate(s.js))) {
        if (Date.now() > end) throw new Error(`until: ${s.js}가 끝내 안 섰다`)
        await page.keyboard.press(s.key ?? 'KeyZ')
        await page.waitForTimeout(s.gap ?? 700)
      }
      await page.waitForTimeout(s.after ?? 1500)
      return
    }
    default:
      throw new Error(`모르는 단계: ${s.do}`)
  }
}

/**
 * `recEval` 한 줄을 돌린다 — **시간 상한이 있다.** 식이 안 끝나면(시계가 멈춘 가상 판에서 기다리는 식 · 멎은 페이지) 장면 하나가
 * 통째로 걸려 밤새 도는 판이 선다. 상한을 넘으면 적고 그대로 간다(식은 계속 돌 수 있다)
 */
const EVAL_CAP_MS = 5000
async function recEvalCapped(page, id, js) {
  let timer
  const cap = new Promise((done) => { timer = setTimeout(() => { done('timeout') }, EVAL_CAP_MS) })
  const ran = page.evaluate(js).then(() => 'ok', (e) => { console.log(`  ${id.padEnd(14)} recEval 식이 던졌다 — ${String(e.message ?? e).slice(0, 160)}`); return 'ok' })
  const r = await Promise.race([ran, cap])
  clearTimeout(timer)
  if (r === 'timeout') console.log(`  ${id.padEnd(14)} recEval 식이 ${String(EVAL_CAP_MS / 1000)}초 안에 안 끝났다 — 기다리지 않고 간다: ${String(js).slice(0, 80)}`)
}

/** `recKeys`의 키 이름 — 한 글자는 `Key?`, 나머지는 그대로 */
const keyName = (key) => (key.length === 1 ? `Key${key.toUpperCase()}` : key)

/** 찍는 도중의 키 하나 — `act`가 'down' · 'up'이면 누르고 있다가 뗀다, 없으면 한 번 누른다 */
async function pressRecKey(page, k) {
  const name = keyName(k.key)
  if (k.act === 'down') await page.keyboard.down(name)
  else if (k.act === 'up') await page.keyboard.up(name)
  else await page.keyboard.press(name)
}

/**
 * 찍는 동안의 움직임을 **페이지 안에서** 돌린다 — 노드에서 한 번씩 밀면 왕복 지연만큼 끊긴다.
 * `dolly`는 눈 · 시선을 곧게 옮기고, `yaw`는 1인칭 고개를 돌린다. 둘 다 부드럽게 들고 놓는다(smoothstep)
 */
async function startMove(page, move, seconds) {
  if (!move) return
  await page.evaluate(async ([m, sec]) => {
    const ease = (t) => t * t * (3 - 2 * t)
    const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
    const w = await import('/src/state/worldState.ts')
    if (m.type === 'dolly') {
      const loop = (await import('/src/engine/loop/GameLoop.ts')).gameLoop
      const cams = (await import('/src/engine/actor/camera.ts')).cameraSystem
      loop.systems = loop.systems.filter((x) => x !== cams)
    }
    // `rel`이면 눈 · 시선이 주인공 자리에서의 차이다 — 확인 지점마다 좌표를 따로 잴 필요가 없다
    if (m.rel) {
      const p = w.worldState.player.position
      const add = (v) => [v[0] + p.x, v[1] + p.y, v[2] + p.z]
      m = { ...m, from: { eye: add(m.from.eye), gaze: add(m.from.gaze) }, to: { eye: add(m.to.eye), gaze: add(m.to.gaze) } }
    }
    // `at`초 뒤에 시작한다 — 시점 전환(V) 다음에 고개를 돌리는 컷
    const t0 = performance.now() + (m.at ?? 0) * 1000
    const tick = () => {
      if (performance.now() < t0) { requestAnimationFrame(tick); return }
      const t = Math.min(1, (performance.now() - t0) / (sec * 1000))
      const k = ease(t)
      if (m.type === 'dolly') {
        const e = lerp(m.from.eye, m.to.eye, k)
        const g = lerp(m.from.gaze, m.to.gaze, k)
        w.worldState.camera.position.set(e[0], e[1], e[2])
        w.worldState.camera.target.set(g[0], g[1], g[2])
      } else if (m.type === 'yaw') {
        globalThis.pt.look(m.from + (m.to - m.from) * k, m.pitch ?? 0)
      }
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [move, seconds])
}

/**
 * **가상 시계로 찍는다** (기본) — 무거운 장면은 실제로 20fps밖에 안 나와서 화면 녹화로는 끊긴다.
 * 페이지의 `performance.now` · `Date.now` · `requestAnimationFrame`을 쥐고, 한 프레임(1/30초)씩 시간을 밀고 → 앱의
 * 프레임 콜백을 그 시각으로 한 번 돌리고 → GPU가 그린 것을 CDP로 받는다. 한 장에 얼마가 걸리든 영상 속 시간은 정확히 1/30초씩 간다.
 * 키(`hold` · `recKeys`)도 실제 시간이 아니라 **프레임 번호**로 누른다. `--realtime`이면 예전처럼 화면 녹화(CDP screencast)로 찍는다
 */
const FPS = 30
async function recordVirtual(page, dir, take) {
  const cdp = await page.context().newCDPSession(page)
  // ⚠️ **받는 중에는 시계를 안 민다.** 배틀은 녹화 도중에 포켓몬 · 무대 glb를 받는데, 기계가 바쁘면 받기가 프레임을 못 따라가
  // 포켓몬 없는 빈 무대가 몇 초씩 찍혔다(다른 프로젝트 테스트와 겹친 판). 가상 시계라 기다린 실제 시간은 영상에 안 남는다
  const pending = new Map()
  const onReq = (r) => pending.set(r, Date.now())
  const onDone = (r) => pending.delete(r)
  page.on('request', onReq); page.on('requestfinished', onDone); page.on('requestfailed', onDone)
  const settleLoads = async () => {
    const t0 = Date.now()
    let waited = false
    for (;;) {
      // 20초 넘게 안 끝나는 요청(스트림 등)은 기다림에서 뺀다
      const live = [...pending.values()].filter((at) => Date.now() - at < 20_000).length
      if (live === 0 || Date.now() - t0 > 30_000) break
      waited = true
      await page.waitForTimeout(50)
    }
    // 받은 뒤 해석(glb · 텍스처 올리기)까지 — 실제 시간으로 잠깐
    if (waited) await page.waitForTimeout(250)
  }
  await page.evaluate((fps) => {
    const realRaf = window.requestAnimationFrame.bind(window)
    const realNow = performance.now.bind(performance)
    const realDate = Date.now
    const base = realNow()
    const dateBase = realDate()
    let vt = base
    let queue = new Map()
    let id = 0
    performance.now = () => vt
    Date.now = () => dateBase + (vt - base)
    window.requestAnimationFrame = (cb) => { id += 1; queue.set(id, cb); return id }
    window.cancelAnimationFrame = (n) => { queue.delete(n) }
    window.__reelStep = () => new Promise((done) => {
      vt += 1000 / fps
      const cbs = [...queue.values()]
      queue = new Map()
      for (const cb of cbs) { try { cb(vt) } catch (e) { console.error(e) } }
      // 그린 것이 화면에 오를 때까지 — 진짜 rAF 두 번
      realRaf(() => { realRaf(() => { done() }) })
    })
  }, FPS)
  const frames = []
  const total = Math.round(take.seconds * FPS)
  const keys = (take.recKeys ?? []).map((k) => ({ ...k, frame: Math.round(k.at * FPS) }))
  // 찍는 도중에 부르는 것(`recEval`) — 기다리지 않는 식이어야 한다. 시계가 멈춰 있어 기다리면 영영 안 끝난다
  const evals = (take.recEval ?? []).map((k) => ({ ...k, frame: Math.round(k.at * FPS) }))
  // 화면 위 HTML(대사창 · HP 상자 · 명령 메뉴)을 숨긴다 — 원본 영상은 글 없는 화면이다. 찍기 직전에 건다: 준비 단계(`menu`)는
  // 메뉴가 보이는지로 판정하므로 그 전에 숨기면 Z를 끝없이 누른다. `keepUI`면 그대로 둔다
  if (!take.keepUI) await page.addStyleTag({ content: 'body *:not(canvas):not(:has(canvas)){visibility:hidden!important}' })
  // `overlays`면 화면 전환 막(조우 섬광 · 아이리스 `CutInOverlay` · 배틀이 서는 흰/검은 막 `openVeil` · `wipeHold`)은 다시 보인다 —
  // 그 막이 배틀 무대가 서는 동안의 빈 바닥 · 검은 화면을 덮는다. 다 숨기면 그 사이가 그대로 찍혔다(2026-10-06 기라티나)
  if (!take.keepUI && take.overlays) {
    await page.addStyleTag({ content: '[class*="_cover_"],[class*="_iris_"],[class*="_tint_"],[class*="_openVeil_"],[class*="_wipeHold_"]{visibility:visible!important}' })
  }
  // 몇 프레임 먼저 돌린다 — 시계를 쥔 첫 프레임은 쥐기 전에 멈춰 있던 그림(먼 데의 DS 지형)이 남아 있다
  for (let i = 0; i < 16; i++) { await settleLoads(); await page.evaluate(() => window.__reelStep()) }
  await startMove(page, take.move, take.move?.seconds ?? take.seconds)
  if (take.hold) await page.keyboard.down(take.hold)
  // `holdFor`초에 키를 뗀다 — 풀숲 속에서 멈춰 서는 컷(계속 걸으면 숲 벽에 박힌다)
  const release = take.holdFor === undefined ? -1 : Math.round(take.holdFor * FPS)
  const probes = []
  for (let i = 0; i < total; i++) {
    if (i === release && take.hold) await page.keyboard.up(take.hold)
    // `act`가 'down' · 'up'이면 누르고 있다가 뗀다 — 한 장면에서 두 번 걷는 컷(1인칭으로 걷고 3인칭으로 또 걷는다)
    for (const k of keys) if (k.frame === i) await pressRecKey(page, k)
    for (const k of evals) if (k.frame === i) await recEvalCapped(page, take.id, k.js)
    await settleLoads()
    await page.evaluate(() => window.__reelStep())
    const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95 })
    const name = `f-${String(i + 1).padStart(5, '0')}.jpg`
    writeFileSync(resolve(dir, name), Buffer.from(shot.data, 'base64'))
    frames.push({ name, t: i / FPS })
    // `probe` — 진단용. 프레임마다 그 식의 값을 `probe.json`에 적는다(찍은 그림과 같은 프레임의 상태)
    if (take.probe) probes.push([i, await page.evaluate(take.probe).catch((e) => `오류 ${String(e.message ?? e)}`)])
  }
  if (take.hold) await page.keyboard.up(take.hold)
  page.off('request', onReq); page.off('requestfinished', onDone); page.off('requestfailed', onDone)
  if (take.probe) writeFileSync(resolve(dir, 'probe.json'), JSON.stringify(probes))
  writeFileSync(resolve(dir, 'frames.json'), JSON.stringify({ seconds: take.seconds, virtual: true, frames }, null, 1))
  return frames.length
}

async function record(page, dir, take) {
  const cdp = await page.context().newCDPSession(page)
  const frames = []
  let n = 0
  cdp.on('Page.screencastFrame', (f) => {
    n += 1
    const name = `f-${String(n).padStart(5, '0')}.jpg`
    writeFileSync(resolve(dir, name), Buffer.from(f.data, 'base64'))
    frames.push({ name, t: f.metadata.timestamp })
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', {
    format: 'jpeg', quality: 95, maxWidth: VIEW.width, maxHeight: VIEW.height, everyNthFrame: 1,
  })
  await startMove(page, take.move, take.move?.seconds ?? take.seconds)
  if (take.hold) await page.keyboard.down(take.hold)
  // 키 · 식 · `holdFor`로 떼기를 한 시간표로 놓고 실제 시계로 기다리며 돌린다 (가상판과 같은 뜻 — 순서가 같으면 키가 먼저)
  const timeline = [
    ...(take.recKeys ?? []).map((k) => ({ at: k.at, run: () => pressRecKey(page, k) })),
    ...(take.recEval ?? []).map((k) => ({ at: k.at, run: () => recEvalCapped(page, take.id, k.js) })),
    ...(take.hold && take.holdFor !== undefined ? [{ at: take.holdFor, run: () => page.keyboard.up(take.hold) }] : []),
  ].sort((a, b) => a.at - b.at)
  const t0 = Date.now()
  for (const ev of timeline) {
    await page.waitForTimeout(Math.max(0, ev.at * 1000 - (Date.now() - t0)))
    await ev.run()
  }
  await page.waitForTimeout(Math.max(0, take.seconds * 1000 - (Date.now() - t0)))
  if (take.hold) await page.keyboard.up(take.hold)
  await cdp.send('Page.stopScreencast')
  await page.waitForTimeout(300)
  writeFileSync(resolve(dir, 'frames.json'), JSON.stringify({ seconds: take.seconds, frames }, null, 1))
  return frames.length
}

async function main() {
  if (args.includes('--list')) {
    for (const t of TAKES) console.log(`${t.id.padEnd(14)} ${t.what}`)
    return
  }
  const picked = ids.length === 0 ? TAKES : ids.map((id) => {
    const t = TAKES.find((x) => x.id === id)
    if (!t) throw new Error(`모르는 장면: ${id}`)
    return t
  })
  // ⚠️ **나란히 찍을 때는 판마다 변환 캐시를 따로 준다** (`--lane=2` → `node_modules/.vite-harness-2`). 같은 캐시를 두 vite가
  // 같이 쓰면 의존성 묶기가 서로를 지운다. 첫 판은 그 캐시를 새로 묶느라 몇 분 더 걸린다
  const lane = args.find((a) => a.startsWith('--lane='))?.slice(7)
  const vite = await startVite(await freePort(), lane ? `node_modules/.vite-harness-${lane}` : undefined)
  // ⚠️ **장면마다 브라우저를 새로 띄운다.** 한 브라우저로 무거운 장면을 열댓 개 이어 찍으니 뒤의 것들이 땅 없이 파란 허공에
  // 캡슐만 나왔다(GPU 메모리가 차는 것으로 본다). 다 찍은 뒤 가운데 프레임이 거의 한 빛(JPEG가 작다)이면 한 번 더 찍는다
  const queue = picked.map((take) => ({ take, tries: 0, stalls: 0 }))
  try {
    while (queue.length > 0) {
      const { take, tries, stalls } = queue.shift()
      const browser = await chromium.launch({ args: gpuArgs('webgpu') })
      const dir = resolve(OUT, take.id)
      rmSync(dir, { recursive: true, force: true })
      mkdirSync(dir, { recursive: true })
      const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 })
      page.setDefaultNavigationTimeout(600_000)
      try {
        await jump(page, vite.url, take.cp)
        // 주인공을 빛나로 — 트레일러 카드가 「빛나의 실제 크기로, 빛나의 눈으로」다 (`--hero=boy`면 광휘)
        await page.evaluate(async (g) => {
          const { useSaveStore } = await import('/src/state/saveStore.ts')
          const s = useSaveStore.getState()
          useSaveStore.setState({ trainer: { ...s.trainer, gender: g } })
        }, HERO)
        await hideDevChrome(page)
        for (const s of take.steps ?? []) await step(page, s, take.cp)
        // 카메라를 먼저 움직임의 첫 자리에 세워 둔다 — 그 둘레가 기다리는 동안 들어온다(안 그러면 해변시티 첫 1초가 하얗게 비었다)
        if (take.move?.type === 'dolly') {
          await page.evaluate(async (m) => {
            const loop = (await import('/src/engine/loop/GameLoop.ts')).gameLoop
            const cams = (await import('/src/engine/actor/camera.ts')).cameraSystem
            loop.systems = loop.systems.filter((x) => x !== cams)
            const w = (await import('/src/state/worldState.ts')).worldState
            const p = m.rel ? w.player.position : { x: 0, y: 0, z: 0 }
            w.camera.position.set(m.from.eye[0] + p.x, m.from.eye[1] + p.y, m.from.eye[2] + p.z)
            w.camera.target.set(m.from.gaze[0] + p.x, m.from.gaze[1] + p.y, m.from.gaze[2] + p.z)
          }, take.move)
        }
        // 야외는 BDSP 필드 glb가 다 들어올 때까지 기다린다 — 4초에 찍으면 DS 지형이 그대로 보인다
        // 배틀 판은 빼고 — 배틀은 steps에서 이미 열려 실제 시간으로 흐르므로, 여기서 기다리면 등장 연출을 놓친다
        if (!(take.steps ?? []).some((x) => x.do === 'wild' || x.do === 'trainer')) await waitWorldStood(page, take.id)
        await page.waitForTimeout(take.settle ?? 15_000)
        // 자리 맞추기 한 장은 움직임의 **첫 자리**에서 찍는다 — 0초로 한 번 돌려 둔다
        if (still && take.move) { await startMove(page, { ...take.move }, 0.001); await page.waitForTimeout(800) }
        if (still) {
          writeFileSync(resolve(dir, 'still.png'), await page.screenshot())
          // 자리를 맞추려면 좌표가 있어야 한다 — 주인공 · 카메라 눈 · 시선
          const where = await page.evaluate(async () => {
            const w = (await import('/src/state/worldState.ts')).worldState
            const r = (v) => [v.x, v.y, v.z].map((n) => Math.round(n * 100) / 100)
            return { player: r(w.player.position), eye: r(w.camera.position), gaze: r(w.camera.target), mode: w.camera.mode }
          })
          writeFileSync(resolve(dir, 'where.json'), JSON.stringify(where))
          console.log(`                 ${JSON.stringify(where)}`)
          console.log(`  ${take.id.padEnd(14)} 한 장  ${resolve(dir, 'still.png')}`)
        } else {
          const n = args.includes('--realtime') ? await record(page, dir, take) : await recordVirtual(page, dir, take)
          // 다섯 자리 중 가장 큰 것 — 가운데 한 장만 보면 라이벌전의 흰 전환처럼 원래 한 빛인 프레임을 빈 화면으로 잘못 본다
          // 한 장도 못 썼으면(n = 0) 재 볼 파일이 없다 — 0kB로 치고 빈 화면과 같이 다시 찍는다
          const sizeAt = (q) => { try { return statSync(resolve(dir, `f-${String(Math.max(1, Math.round(n * q))).padStart(5, '0')}.jpg`)).size } catch { return 0 } }
          const mid = n === 0 ? 0 : Math.max(...[0.1, 0.3, 0.5, 0.7, 0.9].map(sizeAt))
          if (mid < 80_000 && tries < 2) {
            console.log(`  ${take.id.padEnd(14)} ${n === 0 ? '프레임이 한 장도 안 써졌다' : `프레임이 모두 ${String(Math.round(mid / 1000))}kB 이하`} — 빈 화면으로 보고 다시 찍는다`)
            queue.push({ take, tries: tries + 1, stalls })
          } else console.log(`  ${take.id.padEnd(14)} ${String(n)}장 · ${String(take.seconds)}초 · 최대 ${String(Math.round(mid / 1000))}kB`)
        }
      } catch (e) {
        // 확인 지점으로 뛰어들기(`jump`) · 대사 넘기기(`until`) · 기다림의 시간 초과는 기계가 바쁜 탓인 때가 많다 — 한 번 더 찍는다
        const stalled = e?.name === 'TimeoutError' || /^until:/.test(String(e?.message ?? e))
        if (stalled && stalls < 1) {
          console.log(`  ${take.id.padEnd(14)} 시간 초과 — 한 번 더 찍는다: ${String(e.message ?? e).split('\n')[0].slice(0, 160)}`)
          queue.push({ take, tries, stalls: stalls + 1 })
        } else console.error(`  ${take.id} 못 찍었다 — ${String(e.message ?? e).slice(0, 300)}`)
      } finally {
        await page.close()
        await browser.close()
      }
    }
  } finally {
    vite.child.kill()
  }
}

await main()
