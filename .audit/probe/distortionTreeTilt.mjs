// **깨어진 세계의 나무 판이 원본 각도 그대로 그려지는가** (REPAIR §15)
//
//     node .audit/probe/distortionTreeTilt.mjs
//
// 원작 나무(`tree_sbt01`)는 판때기다. 원작 렌즈(8.09° · −59.05°)에 맞춰 눕혀 둔 것이라 그 세계에서는
// 세우면 안 된다(`ChunkModels`의 `keepFoliage`). 그런데 `standCutouts`는 **오려 낸 판을 따로 세운다** —
// 잎이 그 길에 걸리면 이름표로는 「안 세웠다」인데 기하는 세워져 있다. 원본과 구운 뒤의 면 기울기를
// 판마다 나란히 센다 (`ghostHang.mjs`와 같은 잣대: 법선의 |y| → 0°가 서 있다 · 90°가 깔렸다)
import { chromium } from 'playwright'
import { freePort, startVite } from '../../tools/devServer.mjs'

const SPOTS = (process.env.CP ?? 'distortion,distortion-b4f').split(',')
const vite = await startVite(await freePort())
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu'] })

for (const spot of SPOTS) {
  const page = await (await browser.newContext({ viewport: { width: 480, height: 320 } })).newPage()
  await page.goto(`${vite.url}/`, { waitUntil: 'load', timeout: 240_000 })
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 60_000 })
  await page.keyboard.press('Backquote')
  await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
  const row = page.locator(`[data-checkpoint="${spot}"]`).first()
  await row.hover(); await page.waitForTimeout(200); await row.click()
  await page.waitForURL('**/play', { timeout: 60_000 })
  await page.waitForSelector('canvas', { timeout: 120_000 })
  await page.waitForTimeout(8000)

  const got = await page.evaluate(async () => {
    const cm = await import('/src/scene/chunkMesh.ts')
    const plates = await import('/src/scene/plates.ts')
    const { world, mapById } = await import('/src/engine/map/world.ts')
    const { isDistortionFloor } = await import('/src/scene/distortionCore.ts')
    const texSet = world.areas?.[mapById(world.mapId ?? -1)?.area ?? 0]?.tex ?? 0
    const sheet = await cm.loadTexSheet(texSet).catch(() => null)
    const keep = isDistortionFloor(world.mapId ?? -1)
    const tilt = (p, a, b, d) => {
      const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2]
      const vx = p[d * 3] - p[a * 3], vy = p[d * 3 + 1] - p[a * 3 + 1], vz = p[d * 3 + 2] - p[a * 3 + 2]
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const len = Math.hypot(nx, ny, nz)
      return len < 1e-9 ? null : +((Math.asin(Math.min(1, Math.abs(ny) / len)) * 180) / Math.PI).toFixed(1)
    }
    const raw = {}, cooked = {}
    let quads = 0, moved = 0
    for (const c of world.grid.meta.chunks) {
      const mesh = await cm.loadChunkMesh(c.land)
      const cut = plates.cutoutGroups(mesh, sheet)
      const rp = mesh.geometry.getAttribute('position').array
      const ri = mesh.geometry.getIndex().array
      const lumps = plates.plateLumps(mesh, sheet, cut, rp)
      const split = plates.splitFoliage(mesh, cut, lumps, keep)
      const cp = split.geometry.getAttribute('position').array
      mesh.groups.forEach(([, start, count], group) => {
        const tex = mesh.materials[group]?.tex ?? ''
        if (!/tree/.test(tex)) return
        for (let t = start; t + 3 <= start + count; t += 3) {
          const a = ri[t], b = ri[t + 1], d = ri[t + 2]
          const r = tilt(rp, a, b, d), k = tilt(cp, a, b, d)
          raw[`${tex} ${r}°`] = (raw[`${tex} ${r}°`] ?? 0) + 1
          cooked[`${tex} ${k}°`] = (cooked[`${tex} ${k}°`] ?? 0) + 1
          quads++
          if (r !== k) moved++
        }
      })
    }
    return { map: world.mapId, keep, triangles: quads, moved, raw, cooked }
  })
  console.log(spot.padEnd(16), JSON.stringify(got, null, 1))
  await page.close()
}
await browser.close()
vite.child.kill()
