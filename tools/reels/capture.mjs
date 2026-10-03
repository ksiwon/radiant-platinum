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
const OUT = resolve(ROOT, '.audit/reels/take', (process.argv.find((a) => a.startsWith('--aspect=')) ?? '--aspect=16:9').slice(9).replace(':', 'x'))
const args = process.argv.slice(2)
/** 본편은 가로 16:9(원본과 같다), 쇼츠 · 릴스는 세로 9:16 — `--aspect=9:16` */
const ASPECT = (args.find((a) => a.startsWith('--aspect=')) ?? '--aspect=16:9').slice(9)
const VIEW = ASPECT === '9:16' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }
const ids = args.filter((a) => !a.startsWith('--'))
const still = args.includes('--still')

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

/** 확인 지점으로 뛰어든다 — `pnpm shot`과 같은 길 */
async function jump(page, url, cp) {
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 60_000 })
  // 앱이 키를 받기 전에 누르면 안 열린다 — 몇 번 더 눌러 본다
  for (let i = 0; ; i++) {
    await page.keyboard.press('Backquote')
    try { await page.getByText('확인 지점').first().waitFor({ timeout: 15_000 }); break } catch (e) { if (i >= 3) throw e }
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
      await page.evaluate(async ([c, m]) => {
        const { CHECKPOINTS } = await import('/src/engine/dev/checkpoints.ts')
        const { warpTo } = await import('/src/app/devWarp.ts')
        const base = CHECKPOINTS.find((x) => x.id === c)
        await warpTo({ ...base, id: `${c}>${String(m)}`, map: m, spot: { kind: 'warp', index: 0 } })
      }, [cp, s.map])
      await page.waitForFunction(async (w) => (await import('/src/engine/map/world.ts')).world.mapId === w, s.map, { timeout: 120_000 })
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
      // ⚠️ 메뉴가 막 뜬 순간에 Z가 들어가면 기술 목록으로 들어가 버린다 — 그러면 X로 되돌린다
      for (let i = 0; i < 300; i++) {
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
    default:
      throw new Error(`모르는 단계: ${s.do}`)
  }
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
  // 화면 위 HTML(대사창 · HP 상자 · 명령 메뉴)을 숨긴다 — 원본 영상은 글 없는 화면이다. 찍기 직전에 건다: 준비 단계(`menu`)는
  // 메뉴가 보이는지로 판정하므로 그 전에 숨기면 Z를 끝없이 누른다. `keepUI`면 그대로 둔다
  if (!take.keepUI) await page.addStyleTag({ content: 'body *:not(canvas):not(:has(canvas)){visibility:hidden!important}' })
  // 몇 프레임 먼저 돌린다 — 시계를 쥔 첫 프레임은 쥐기 전에 멈춰 있던 그림(먼 데의 DS 지형)이 남아 있다
  for (let i = 0; i < 8; i++) await page.evaluate(() => window.__reelStep())
  await startMove(page, take.move, take.move?.seconds ?? take.seconds)
  if (take.hold) await page.keyboard.down(take.hold)
  // `holdFor`초에 키를 뗀다 — 풀숲 속에서 멈춰 서는 컷(계속 걸으면 숲 벽에 박힌다)
  const release = take.holdFor === undefined ? -1 : Math.round(take.holdFor * FPS)
  for (let i = 0; i < total; i++) {
    if (i === release && take.hold) await page.keyboard.up(take.hold)
    for (const k of keys) if (k.frame === i) await page.keyboard.press(k.key.length === 1 ? `Key${k.key.toUpperCase()}` : k.key)
    await page.evaluate(() => window.__reelStep())
    const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95 })
    const name = `f-${String(i + 1).padStart(5, '0')}.jpg`
    writeFileSync(resolve(dir, name), Buffer.from(shot.data, 'base64'))
    frames.push({ name, t: i / FPS })
  }
  if (take.hold) await page.keyboard.up(take.hold)
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
  const keys = take.recKeys ?? []
  const t0 = Date.now()
  for (const k of keys) {
    await page.waitForTimeout(Math.max(0, k.at * 1000 - (Date.now() - t0)))
    await page.keyboard.press(k.key.length === 1 ? `Key${k.key.toUpperCase()}` : k.key)
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
  const vite = await startVite(await freePort())
  // ⚠️ **장면마다 브라우저를 새로 띄운다.** 한 브라우저로 무거운 장면을 열댓 개 이어 찍으니 뒤의 것들이 땅 없이 파란 허공에
  // 캡슐만 나왔다(GPU 메모리가 차는 것으로 본다). 다 찍은 뒤 가운데 프레임이 거의 한 빛(JPEG가 작다)이면 한 번 더 찍는다
  const queue = picked.map((take) => ({ take, tries: 0 }))
  try {
    while (queue.length > 0) {
      const { take, tries } = queue.shift()
      const browser = await chromium.launch({ args: gpuArgs('webgpu') })
      const dir = resolve(OUT, take.id)
      rmSync(dir, { recursive: true, force: true })
      mkdirSync(dir, { recursive: true })
      const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 })
      page.setDefaultNavigationTimeout(240_000)
      try {
        await jump(page, vite.url, take.cp)
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
          const mid = Math.max(...[0.1, 0.3, 0.5, 0.7, 0.9].map((q) => statSync(resolve(dir, `f-${String(Math.max(1, Math.round(n * q))).padStart(5, '0')}.jpg`)).size))
          if (mid < 80_000 && tries < 2) {
            console.log(`  ${take.id.padEnd(14)} 프레임이 모두 ${String(Math.round(mid / 1000))}kB 이하 — 빈 화면으로 보고 다시 찍는다`)
            queue.push({ take, tries: tries + 1 })
          } else console.log(`  ${take.id.padEnd(14)} ${String(n)}장 · ${String(take.seconds)}초 · 최대 ${String(Math.round(mid / 1000))}kB`)
        }
      } catch (e) {
        console.error(`  ${take.id} 못 찍었다 — ${String(e.message ?? e).slice(0, 300)}`)
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
