// 짧은 재현 — **첫 화면이 왜 안 뜨나** (대표 구간이 두 판 연속 여기서 떨어졌다)
//
//     node tools/e2e/_title42.mjs [--gpu=gl]
//
// ⚠️ 진단이다. 판정에 안 쓴다. 대표 구간이 여는 그 길 그대로 열고,
// 「시작」 단추를 기다리면서 **콘솔과 화면을 적는다** — 안 뜨는 것이
// 게임인지, 기계인지, 재는 자인지를 가른다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, knock, startVite } from '../devServer.mjs'
import { gpuArgs, probeGpu } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const GPU = args.find((a) => a.startsWith('--gpu='))?.slice(6) ?? 'gl'
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/title42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

const out = { stamp: STAMP, gpu: GPU, console: [], errors: [] }
let vite = null
let browser = null
try {
  const t0 = Date.now()
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-journey')
  out.viteMs = Date.now() - t0
  out.knock = await knock(vite.url)
  console.log(`  개발 서버 ${String(Math.round(out.viteMs / 1000))}초 · 문 두드리기 ${JSON.stringify(out.knock)}`)

  browser = await chromium.launch({ args: gpuArgs(GPU) })
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.on('console', (m) => { out.console.push(`${m.type()} ${m.text().slice(0, 200)}`) })
  page.on('pageerror', (e) => { out.errors.push(String(e.message).slice(0, 300)) })

  const t1 = Date.now()
  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  out.gotoMs = Date.now() - t1
  out.gpuNow = await probeGpu(page)
  console.log(`  goto ${String(Math.round(out.gotoMs / 1000))}초 · ${JSON.stringify(out.gpuNow).slice(0, 200)}`)

  const t2 = Date.now()
  let seen = false
  for (let i = 0; i < 24; i++) {
    const n = await page.getByRole('button', { name: '시작', exact: true }).count()
    if (n > 0) { seen = true; break }
    await page.waitForTimeout(5000)
    const body = await page.evaluate(() => ({
      text: (document.body.innerText ?? '').replace(/\s+/g, ' ').slice(0, 200),
      buttons: [...document.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim()).slice(0, 8),
      marks: { ...document.documentElement.dataset },
    }))
    console.log(`  +${String((i + 1) * 5)}초 — 단추 ${JSON.stringify(body.buttons)} · 표식 ${JSON.stringify(body.marks)}`)
    console.log(`         글 ${body.text.slice(0, 120)}`)
  }
  out.titleMs = Date.now() - t2
  out.seen = seen
  await page.screenshot({ path: `${OUT}/첫화면.png` })
  console.log(`  「시작」 ${seen ? `떴다 — ${String(Math.round(out.titleMs / 1000))}초` : '끝내 안 떴다'}`)
  console.log(`  콘솔 ${String(out.console.length)}줄 · 오류 ${String(out.errors.length)}건`)
  for (const e of out.errors.slice(0, 5)) console.log(`    오류 ${e}`)
} catch (e) {
  out.crash = String(e?.stack ?? e?.message ?? e).slice(0, 900)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await browser?.close()
  vite?.child.kill()
}
writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${OUT}`)
process.exit(out.crash === undefined && out.seen === true ? 0 : 1)
