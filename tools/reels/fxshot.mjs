// BDSP 이펙트 시험대(`/fxlab`)를 시각마다 찍는다 — 실행기를 눈으로 맞출 때 쓴다
//
//   node tools/reels/fxshot.mjs eb001_capture [eb001_ballout …] [--t=0.2,0.5,1] [--scale=0.5] [--zoom=1]
//
// 한 이펙트를 시각마다 한 장씩 찍어 가로로 이어 붙인 한 장(`.audit/fxshot/<이름>.png`)을 남긴다.
// 시험대가 제 시계를 쓰므로(`__fxlab.seek`) 같은 시각은 늘 같은 그림이다
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer as netServer } from 'node:net'
import { chromium } from 'playwright'
import { startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, '.audit/fxshot')
const args = process.argv.slice(2)
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).slice(k.length + 3)
const names = args.filter((a) => !a.startsWith('--'))
const times = opt('t', '0.1,0.3,0.6,1.0').split(',').map(Number)
const scale = opt('scale', '1')
const zoom = opt('zoom', '1')
const VIEW = { width: 640, height: 400 }

const freePort = () => new Promise((ok) => {
  const s = netServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)) })
})

mkdirSync(OUT, { recursive: true })
const vite = await startVite(await freePort())
const browser = await chromium.launch({ args: gpuArgs('webgpu') })
try {
  for (const name of names) {
    const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 })
    page.setDefaultNavigationTimeout(240_000)
    const logs = []
    page.on('console', (m) => { if (m.type() === 'error' || m.text().includes('[fx]')) logs.push(m.text()) })
    await page.goto(`${vite.url}/fxlab?fx=${name}&t=0&scale=${scale}&zoom=${zoom}`, { waitUntil: 'load' })
    await page.waitForFunction(() => (globalThis.__fxlab?.state?.().steps ?? 0) > 0, null, { timeout: 120_000 })
      .catch(() => page.waitForTimeout(8000))
    const shots = []
    for (const t of times) {
      await page.evaluate((s) => globalThis.__fxlab.seek(s), t)
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      shots.push(await page.screenshot())
    }
    // 가로로 이어 붙인다 — 캔버스에 그려서 PNG 한 장으로
    const strip = await page.evaluate(async ([imgs, w, h]) => {
      const c = document.createElement('canvas')
      c.width = w * imgs.length; c.height = h
      const g = c.getContext('2d')
      for (const [i, b64] of imgs.entries()) {
        const im = new Image(); im.src = `data:image/png;base64,${b64}`
        await im.decode(); g.drawImage(im, i * w, 0)
      }
      return c.toDataURL('image/png').slice(22)
    }, [shots.map((b) => b.toString('base64')), VIEW.width, VIEW.height])
    const file = resolve(OUT, `${name}.png`)
    const { writeFileSync } = await import('node:fs')
    writeFileSync(file, Buffer.from(strip, 'base64'))
    console.log(`  ${name.padEnd(24)} ${times.join(' · ')}초  ${file}`)
    for (const l of [...new Set(logs)].slice(0, 8)) console.log(`      ${l.slice(0, 200)}`)
    await page.close()
  }
} finally {
  await browser.close()
  vite.stop?.()
  vite.child?.kill?.()
}
