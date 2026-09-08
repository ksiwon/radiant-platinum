// 짧은 재현 — **도착한 자리의 3D가 끝내 안 그려지는가, 늦게 그려지는가**
//
//     node tools/e2e/_paint42.mjs [--headed] [--save=.audit/journey/seg-08.rpsave]
//
// ⚠️ **판정용 journey(2026-09-08)의 ⑮가 여기서 떨어졌다.** 축복시티(맵 3)에
// 서 있는 컷의 캔버스가 **하늘 한 장**이었고(색 16 · `calls 49 · tris 2.6k`),
// 무쇠탄광 앞(맵 198)은 **까만 원반 위에 주인공만** 떠 있었으며, 체육관(맵 47)은
// 바닥이 위쪽 한 줄만 그려져 있었다. 화면 전체로 재면 계기판과 포켓치가 색을
// 채워서 그 컷들이 통과한다 — 그래서 캔버스만 떼어 재는 자가 필요했다.
//
// ⚠️ **여기서 가르려는 것은 딱 하나다.** journey는 `goTo`가 `arrived`를 준
// **직후에** 찍는다. 그런데 같은 판의 계기판이 「맵 전환 최장 1815.4ms · 제일
// 나쁜 번 6527.8ms · 29번」이라고 적었다. 그러니 두 가지가 갈리지 않는다:
//
//   ① **하네스가 너무 일찍 찍었다** — 조금 더 기다리면 채워진다
//   ② **제품이 끝내 안 그린다** — 얼마를 기다려도 하늘뿐이다
//
// 그래서 **같은 자리에서 시간을 두고 여러 번 찍는다.** 채워지면 ①이고,
// 안 채워지면 ②다. 사람이 서서 기다리는 것과 같은 일이라 조작은 없다.
//
// ⚠️ **읽기만 한다.** 청크를 손으로 붙이거나 카메라를 옮기지 않는다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { shootCanvas, looksDrawn } from './canvasShot.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const HEADED = args.includes('--headed')
const SAVE = args.find((a) => a.startsWith('--save='))?.slice(7) ?? '.audit/journey/seg-08.rpsave'
/** 걸어서 맵을 드나든 **직후**도 재는가 (journey가 컷을 찍는 그 자리) */
const WALK = args.includes('--walk')
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/paint42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

/** 언제 찍는가 — 복원이 끝난 뒤로부터의 초 */
const WHEN = [1, 3, 6, 10, 15, 25, 40]

const out = { stamp: STAMP, save: SAVE, rows: [] }

/** 무대에 무엇이 올라가 있는가 — **읽기만 한다** */
const stage = (page) => page.evaluate(async () => {
  const w = await import('/src/engine/map/world.ts')
  const st = await import('/src/state/worldState.ts')
  const npcs = await import('/src/engine/actor/npcs.ts')
  const p = st.worldState.player
  const d = document.documentElement.dataset
  return {
    map: w.world.mapId,
    matrix: w.world.matrix,
    grid: w.world.grid !== null,
    pending: w.world.pending !== null,
    at: { x: +p.position.x.toFixed(2), z: +p.position.z.toFixed(2), y: +p.position.y.toFixed(2) },
    npcs: npcs.npcActors.list.length,
    restoring: st.worldState.restoring,
    marks: { scene: d.scene, map: d.map, tile: d.tile, renderer: d.renderer, restoring: d.restoring },
  }
})

let vite = null
let browser = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-paint42')
  browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: !HEADED })
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })

  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
  await page.setInputFiles('input[type=file]', resolve(ROOT, SAVE))
  const bring = page.getByRole('button', { name: '이 리포트로 이어하기' })
  await bring.waitFor({ timeout: 60_000 })
  await bring.click()
  await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live'
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  const t0 = Date.now()

  let last = 0
  for (const sec of WHEN) {
    const wait = sec * 1000 - (Date.now() - t0)
    if (wait > 0) await page.waitForTimeout(wait)
    const at = `${OUT}/${String(sec).padStart(2, '0')}초.png`
    const cut = await shootCanvas(page, { path: at })
    const row = {
      sec, colors: cut.stats.colors, stdev: Number(cut.stats.stdev.toFixed(1)),
      drawn: looksDrawn(cut.stats), steady: cut.steady, stage: await stage(page),
    }
    out.rows.push(row)
    console.log(`  ${String(sec).padStart(2)}초 — 색 ${String(row.colors)}`
      + ` · 흩어짐 ${row.stdev.toFixed(1)} · ${row.drawn ? '그려졌다' : '**거의 한 색**'}`
      + ` · 맵 ${String(row.stage.map)}/${String(row.stage.matrix)}`
      + ` 격자 ${String(row.stage.grid)} 사람 ${String(row.stage.npcs)}`)
    last = sec
  }
  out.last = last

  /**
   * **걸어 나갔다 걸어 들어온 직후**를 잰다 — journey가 컷을 찍는 그 자리다.
   *
   * 새로 들여온 판은 1초에 다 그려졌다. 그런데 판정용 판에서는 **걸어서**
   * 닿은 직후의 캔버스가 하늘 한 장이었다. 둘의 차이는 **맵 전환**이므로,
   * 여기서 그 전환을 한 번 태우고 같은 자로 시간을 두고 잰다
   */
  if (WALK) {
    out.walk = []
    await driveStory(page, {
      log: (l) => { console.log(`    ${l}`) },
      totalMs: 300_000,
      skipStory: true,
      after: async (api) => {
        const away = await api.goTo(342, Math.min(150_000, api.left()))
        console.log(`  201번도로(342)로 나갔다 — ${away}`)
        const back = await api.goTo(3, Math.min(150_000, api.left()))
        console.log(`  축복시티(3)로 돌아왔다 — ${back}`)
        const t = Date.now()
        for (const ms of [0, 500, 1500, 4000, 9000, 20_000]) {
          const wait = ms - (Date.now() - t)
          if (wait > 0) await page.waitForTimeout(wait)
          const c = await shootCanvas(page, { path: `${OUT}/걸어서-${String(ms)}ms.png` })
          const row = {
            ms, colors: c.stats.colors, stdev: Number(c.stats.stdev.toFixed(1)),
            drawn: looksDrawn(c.stats), stage: await stage(page),
          }
          out.walk.push(row)
          console.log(`  걸어서 +${String(ms)}ms — 색 ${String(row.colors)}`
            + ` · ${row.drawn ? '그려졌다' : '**거의 한 색**'}`
            + ` · 맵 ${String(row.stage.map)} 격자 ${String(row.stage.grid)}`
            + ` 사람 ${String(row.stage.npcs)}`)
        }
        return { away, back }
      },
    })
  }

  // 걸으면 붙는가 — 한 걸음이 스트리밍을 깨우는지 본다
  await page.keyboard.down('ArrowLeft')
  await page.waitForTimeout(600)
  await page.keyboard.up('ArrowLeft')
  await page.waitForTimeout(2500)
  const cut = await shootCanvas(page, { path: `${OUT}/걸은뒤.png` })
  out.afterWalk = {
    colors: cut.stats.colors, stdev: Number(cut.stats.stdev.toFixed(1)),
    drawn: looksDrawn(cut.stats), stage: await stage(page),
  }
  console.log(`  걸은 뒤 — 색 ${String(out.afterWalk.colors)}`
    + ` · ${out.afterWalk.drawn ? '그려졌다' : '**거의 한 색**'}`)
} catch (e) {
  out.crash = String(e?.stack ?? e?.message ?? e).slice(0, 800)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await browser?.close()
  vite?.child.kill()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${OUT}`)
process.exit(out.crash === undefined ? 0 : 1)
