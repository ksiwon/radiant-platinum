// 짧은 재현 — **계획한 길이 왜 안 걸어지는가** (다음 구간 §4)
//
//     node tools/e2e/_stairs42.mjs [--headed] [--save=.audit/journey/start.rpsave]
//
// journey가 실패 열 건을 전부 같은 말로 적었다: **「경로 found 후 이동 실패」**.
// 첫 자리가 라이벌 집 1층(412)이고, 우리 격자로는 (6,8)에서 북으로 한 칸이
// 비어 있는데 실제로는 안 갔다.
//
// ⚠️ **먼저 가를 것은 「자료가 다른가」다.** 드라이버는 `public/data`에서 만든
// 격자로 계획하고, 게임은 제 `world.grid`로 막는다. 둘이 같은지 **한 칸씩
// 견주면** 「자료가 어긋났다」와 「자료는 같은데 못 걷는다」가 갈린다.
// 갈리기 전에는 이동 코드를 고치지 않는다.
//
// ⚠️ **읽기만 한다.** 격자도 좌표도 여기서 쓰지 않는다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'
import { gridOf, matrixOf } from './route.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const HEADED = args.includes('--headed')
const SAVE = args.find((a) => a.startsWith('--save='))?.slice(7) ?? '.audit/journey/start.rpsave'
const TARGET = Number(args.find((a) => a.startsWith('--map='))?.slice(6) ?? '412')
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/stairs42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

const out = { stamp: STAMP, save: SAVE, target: TARGET, steps: [] }
const note = (what, detail) => { out.steps.push({ what, detail }); console.log(`  · ${what} — ${detail}`) }

/** 게임 제 격자를 한 칸씩 읽는다 — **제품이 export하는 것만 읽는다** */
const gameGrid = (page, w, h) => page.evaluate(async ([W, H]) => {
  const m = await import('/src/engine/map/world.ts')
  const g = m.world.grid
  if (!g) return { grid: null, why: 'world.grid가 아직 없다' }
  const rows = []
  for (let z = 0; z < H; z++) {
    let row = ''
    for (let x = 0; x < W; x++) row += g.isBlocked(x, z) ? '#' : '.'
    rows.push(row)
  }
  return { grid: rows, mapId: m.world.mapId, matrix: g.meta?.id ?? null }
}, [w, h])

/** 그 맵에 실제로 선 사람들 — 사람이 막는가를 가르려면 자리가 필요하다 */
const actors = (page) => page.evaluate(async () => {
  const m = await import('/src/engine/actor/npcs.ts')
  return m.npcActors.list.map((a) => ({
    script: a.info?.script ?? null, x: Math.round(a.x), z: Math.round(a.z), visible: a.visible !== false,
  }))
})

let vite = null
let browser = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-stairs42')
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
  await page.waitForTimeout(1500)

  // ⚠️ **4FPS가 줄곧인지 한때인지 모르면 무엇을 고칠지도 못 정한다.**
  // 실행 내내 계기판을 훔쳐본다 — 재는 것이지 바꾸는 것이 아니다
  const fps = []
  const sampler = setInterval(() => {
    page.evaluate(async () => {
      const m = await import('/src/scene/sceneRefs.ts')
      const d = document.documentElement.dataset
      return { fps: m.perfSnapshot?.fps ?? null, map: d.map ?? null, scene: d.scene ?? null }
    }).then((r) => { if (r?.fps !== null) fps.push({ t: Date.now(), ...r }) }).catch(() => {})
  }, 500)

  await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    verbose: true,
    totalMs: 600_000,
    skipStory: true,
    after: async (api) => {
      const came = await api.goTo(TARGET, 240_000)
      note(`맵 ${String(TARGET)}로`, String(came))
      const at = await api.now()
      out.at = at
      if (at.map !== TARGET) { note('그 맵에 못 섰다', JSON.stringify(at)); return { came } }

      const here = matrixOf(TARGET)
      const ours = gridOf(here)
      const W = 12, H = 14
      const mine = []
      for (let z = 0; z < H; z++) {
        let row = ''
        for (let x = 0; x < W; x++) row += ours.blocked(x, z) ? '#' : '.'
        mine.push(row)
      }
      const theirs = await gameGrid(page, W, H)
      out.ourGrid = mine
      out.gameGrid = theirs
      out.actors = await actors(page)

      console.log(`\n  우리 격자 (route.mjs · 행렬 ${String(here)})      게임 격자 (world.grid)`)
      const diff = []
      for (let z = 0; z < H; z++) {
        const a = mine[z]; const b = theirs.grid?.[z] ?? '?'.repeat(W)
        let mark = ''
        for (let x = 0; x < W; x++) if (a[x] !== b[x]) { diff.push({ x, z, ours: a[x], game: b[x] }); mark = '  ← 다르다' }
        console.log(`  ${String(z).padStart(2)} ${a}   ${b}${mark}`)
      }
      out.diff = diff
      note('격자 차이', diff.length === 0
        ? '**없다** — 같은 자료로 계획하고 같은 자료로 막는다'
        : `**${String(diff.length)}칸** ${JSON.stringify(diff.slice(0, 8))}`)
      note('그 맵의 사람', JSON.stringify(out.actors))
      await page.screenshot({ path: `${OUT}/끝.png` })
      return { came, diff: diff.length }
    },
  })
  clearInterval(sampler)
  out.fps = fps
  if (fps.length > 0) {
    const v = fps.map((r) => r.fps).sort((a, b) => a - b)
    const q = (p) => v[Math.min(v.length - 1, Math.floor(v.length * p))]
    out.fpsSummary = {
      n: v.length, min: v[0], p10: q(0.1), 중앙: q(0.5), p90: q(0.9), max: v[v.length - 1],
      '10미만인 비율': Number((v.filter((x) => x < 10).length / v.length).toFixed(3)),
      '30미만인 비율': Number((v.filter((x) => x < 30).length / v.length).toFixed(3)),
    }
    const byMap = {}
    for (const r of fps) {
      const k = String(r.map)
      byMap[k] ??= []
      byMap[k].push(r.fps)
    }
    out.fpsByMap = Object.fromEntries(Object.entries(byMap).map(([k, a]) => {
      const t = [...a].sort((x, y) => x - y)
      return [k, { n: t.length, min: t[0], 중앙: t[Math.floor(t.length / 2)], max: t[t.length - 1] }]
    }))
    console.log(`
  계기판 ${String(v.length)}번 — ${JSON.stringify(out.fpsSummary)}`)
    console.log(`  맵별 — ${JSON.stringify(out.fpsByMap)}`)
  }
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
