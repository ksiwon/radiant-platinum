// 짧은 재현 — **`door` 확인 지점이 왜 거의 한 색인가** (후속 지시 §5)
//
//     node tools/e2e/_door42.mjs [--headed]
//
// ⚠️ **두 가지가 같은 모양으로 보인다.** ① DOM 덮개(`ui/field/FadeOverlay`)가
// 아직 걷히지 않은 것과 ② 캔버스 자체가 비어 있는 것(야외 청크가 아직 안 붙음).
// 통째로 찍은 그림에서는 둘이 구별되지 않으므로 **셋을 나란히** 찍는다 —
// 통째로 · 캔버스만 · 덮개를 숨기고 통째로.
//
// ⚠️ **덮개를 숨기는 것은 진단에서만 한다.** 제품의 페이드는 그대로 두고,
// 하네스가 그 판의 `style.display`를 잠깐 만졌다 되돌린다. 촬영 직전
// `resetFade`를 부르거나 밝기를 올리거나 색 문턱을 낮추는 일은 하지 않는다 —
// 그건 검사를 통과시키는 것이지 고치는 것이 아니다.
//
// `door`는 문 **앞**에 세우는 자리라 한 걸음이 곧 워프다(`story.mjs`의 판정
// 주석). 그래서 걸음 전후를 촘촘히 잰다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { statsOf } from '../shot/png.mjs'
import { CANVAS } from './canvasShot.mjs'
import { playOpening } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const HEADED = process.argv.includes('--headed')
/**
 * 어느 길로 그 자리에 서는가.
 *
 * `title`이 `story.mjs`가 쓰는 길(타이틀 → 확인 지점 표 → `/play`가 처음 선다),
 * `play`가 이미 떠 있는 `/play`에서 `warpTo`만 부르는 길이다
 */
const VIA = process.argv.find((a) => a.startsWith('--via='))?.slice(6) ?? 'title'
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/door42/${STAMP}-${VIA}`)
mkdirSync(OUT, { recursive: true })

const out = { stamp: STAMP, samples: [], shots: [] }

/** 지금 무엇이 덮여 있고 무엇이 도는가 — 그림 없이 싸게 잰다 */
const probe = (page) => page.evaluate(async () => {
  const fade = await import('/src/engine/script/fade.ts')
  const field = await import('/src/engine/script/field.ts')
  const w = await import('/src/engine/map/world.ts')
  const st = await import('/src/state/worldState.ts')
  const f = fade.screenFade.now
  const cover = document.querySelector('[aria-hidden][class*="cover"]')
  const cam = document.documentElement.dataset
  const ctx = field.fieldScripts.ctx
  const p = st.worldState.player.position
  return {
    t: Math.round(performance.now()),
    map: w.world.mapId,
    x: +p.x.toFixed(1), z: +p.z.toFixed(1),
    /** 게임 시계가 굴리는 값이다 (`FieldWorld.tick`의 `tickFade`) */
    fade: f === null ? null
      : { alpha: +fade.fadeAlpha().toFixed(3), from: f.from, to: f.to,
        elapsed: f.elapsed, frames: f.frames, color: f.color, done: fade.fadeDone() },
    /** 실제로 화면을 덮고 있는 판. 값과 그림이 어긋나는지 여기서 본다 */
    overlay: cover === null ? null
      : { display: getComputedStyle(cover).display, opacity: getComputedStyle(cover).opacity },
    restoring: st.worldState.restoring,
    running: ctx === null ? null : { file: ctx.file, pc: ctx.pointer },
    marks: { scene: cam.scene, map: cam.map, tile: cam.tile, renderer: cam.renderer, restoring: cam.restoring },
  }
})

/** 통째로 · 캔버스만 · 덮개를 숨기고 통째로 — 셋을 나란히 */
async function triple(page, name) {
  const whole = await page.screenshot()
  const canvas = await page.locator(CANVAS).screenshot()
  // 진단에서만 덮개를 숨긴다. 되돌려 놓는다
  const had = await page.evaluate(() => {
    const el = document.querySelector('[aria-hidden][class*="cover"]')
    if (el === null) return null
    const was = el.style.display
    el.style.display = 'none'
    return was
  })
  const bare = await page.screenshot()
  await page.evaluate((was) => {
    const el = document.querySelector('[aria-hidden][class*="cover"]')
    if (el !== null && was !== null) el.style.display = was
  }, had)
  for (const [tag, png] of [['통째로', whole], ['캔버스만', canvas], ['덮개없이', bare]]) {
    writeFileSync(`${OUT}/${name}-${tag}.png`, png)
  }
  const row = {
    name,
    whole: statsOf(whole), canvas: statsOf(canvas), bare: statsOf(bare),
    at: await probe(page),
  }
  out.shots.push(row)
  const s = (v) => `색 ${String(v.colors)} · 흩어짐 ${v.stdev.toFixed(1)}`
  console.log(`  [${name}] 통째로 ${s(row.whole)} | 캔버스만 ${s(row.canvas)} | 덮개없이 ${s(row.bare)}`)
  console.log(`         덮개 ${JSON.stringify(row.at.fade)} ${JSON.stringify(row.at.overlay)}`)
  return row
}

let vite = null
let browser = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-door42')
  browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: !HEADED })
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 140)}`) })

  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })

  if (VIA === 'title') {
    // ⚠️ **`story.mjs`가 쓰는 길이다** — 타이틀에서 백틱으로 확인 지점 표를 열고
    // 줄을 눌러 뛰어든다(`ui/dev/DevWarpScreen`의 `jump`). `/play`가 **그때
    // 처음 선다**. 이미 떠 있는 `/play`에서 `warpTo`만 부르는 것과 다른 길이고,
    // 실측(2026-09-08)으로 그 둘의 그림이 갈렸다
    await page.keyboard.press('Backquote')
    await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
    const row = page.locator('[data-checkpoint="door"]').first()
    await row.hover()
    await page.waitForTimeout(150)
    await row.click()
    await page.waitForURL('**/play', { timeout: 60_000 })
  } else {
    await page.getByRole('button', { name: '시작', exact: true }).click()
    await playOpening(page)
    await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live',
      null, { timeout: 180_000 })
    await page.evaluate(async () => {
      const cps = await import('/src/engine/dev/checkpoints.ts')
      const dw = await import('/src/app/devWarp.ts')
      const one = cps.CHECKPOINTS.find((c) => c.id === 'door')
      await dw.warpTo(one)
    })
  }
  await page.waitForFunction(() => document.documentElement.dataset.map === '414'
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(2000)
  await triple(page, '0-도착')

  // ⚠️ **여기서부터 `story.mjs`의 차례를 그대로 흉내 낸다.** 뛰어들자마자 도는
  // 컷신을 끝까지 밀고(`runScripts`), 네 방향으로 걸어 보고(`canWalk`), 그
  // **뒤에** 찍는다. 실측(2026-09-08)으로 뛰어들어 2초 기다린 그림은 색 1423에
  // 멀쩡했는데 `story`의 같은 자리는 색 50이었다 — 사이에 있는 것이 이 둘이다
  const tick = setInterval(() => {
    probe(page).then((s) => { out.samples.push(s) }, () => {})
  }, 120)
  const tap = async (key, hold = 70) => {
    await page.keyboard.down(key)
    await page.waitForTimeout(hold)
    await page.keyboard.up(key)
    await page.waitForTimeout(60)
  }
  const busy = () => page.evaluate(() => {
    const d = document.documentElement.dataset
    return d.script === '1' || d.talk === '1' || d.scene === 'menu'
  })
  let taps = 0
  for (; taps < 60; taps++) {
    if (!await busy()) break
    await tap('Space', 40)
  }
  console.log(`  컷신을 ${String(taps)}번 눌러 끝냈다`)
  await triple(page, '1-컷신뒤')

  // 네 방향으로 한 걸음씩 — `door`는 문 앞이라 한쪽이 곧 워프다
  for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']) {
    await page.keyboard.down(key)
    await page.waitForTimeout(420)
    await page.keyboard.up(key)
    await page.waitForTimeout(120)
  }
  await triple(page, '2-걸은뒤')
  await page.waitForTimeout(1500)
  await triple(page, '3-1.5초뒤')
  await page.waitForTimeout(6000)
  clearInterval(tick)
  await triple(page, '4-7.5초뒤')
} catch (e) {
  out.crash = String(e?.message ?? e).slice(0, 400)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await browser?.close()
  vite?.child.kill()
}
writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${OUT}`)
process.exit(out.crash === undefined ? 0 : 1)
