// 진단 — 포켓몬 몸의 키(`tall`)와 Box3 크기를 같은 단위로 재 본다 (명예의 전당 폭 자르기)
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
const vite = await startVite(await freePort(), 'node_modules/.vite-box')
const browser = await chromium.launch({ args: gpuArgs('gl'), headless: true })
const page = await browser.newPage()
try {
  await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
  const out = await page.evaluate(async () => {
    const m = await import('/src/scene/battle/monModel.ts')
    const rows = []
    for (const sp of [487, 389, 398, 400]) {
      const loaded = await m.loadMonModel(sp, 0, {})
      if (!loaded) { rows.push({ sp, none: true }); continue }
      const body = m.makeBody(loaded)
      body.root.updateMatrixWorld(true)
      let geo = null
      body.root.traverse((o) => { if (!geo && o.geometry) geo = o.geometry })
      geo.computeBoundingBox()
      const Box3 = geo.boundingBox.constructor
      const Vector3 = geo.boundingBox.min.constructor
      const a = new Box3().setFromObject(body.root).getSize(new Vector3())
      const b = new Box3().setFromObject(body.root, true).getSize(new Vector3())
      rows.push({ sp, tall: body.tall, rootScale: body.root.scale.x, box: [a.x, a.y, a.z].map((v) => +v.toFixed(3)), precise: [b.x, b.y, b.z].map((v) => +v.toFixed(3)) })
    }
    return rows
  })
  console.log(JSON.stringify(out, null, 1))
} finally { await browser.close(); vite.child.kill() }
