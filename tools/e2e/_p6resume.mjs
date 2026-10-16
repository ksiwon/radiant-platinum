// 진단: 세이브를 이어하기로 열고 60초 동안 표식(map/script/talk/restoring/scene)과 대사를 적는다
import { chromium } from 'playwright'
const ROOT = process.argv[2]; const SAVE = process.argv[3]
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
process.chdir(ROOT)
const vite = await startVite(await freePort(), 'node_modules/.vite-journey-p6')
const browser = await chromium.launch({ args: [...gpuArgs('gl'), '--mute-audio'] })
const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
try {
  await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
  await page.setInputFiles('input[type=file]', SAVE)
  await page.getByRole('button', { name: '이 리포트로 이어하기' }).click()
  await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
  await page.evaluate(async () => {
    const { scriptSpy } = await import('/src/engine/script/spy.ts')
    window.__log = []
    scriptSpy.message = (id, t) => window.__log.push(`msg ${id}:${String(t).slice(0, 80)}`)
    scriptSpy.start = (i) => window.__log.push(`start ${JSON.stringify(i)}`)
    scriptSpy.end = (k) => window.__log.push(`end ${String(k)}`)
  })
  const evalAt = process.argv.find((a) => a.startsWith('--eval='))
  if (evalAt !== undefined) {
    await page.waitForFunction(() => document.documentElement.dataset.map !== undefined, null, { timeout: 120_000 })
    await page.waitForTimeout(3000)
    const fn = (await import('node:fs')).readFileSync(evalAt.slice(7), 'utf8')
    console.log(JSON.stringify(await page.evaluate(`(async () => { ${fn} })()`), null, 1))
  }
  let last = ''
  for (let i = 0; i < 120; i++) {
    const d = await page.evaluate(() => JSON.stringify((({ map, script, talk, restoring, scene, menu }) => ({ map, script, talk, restoring, scene, menu }))(document.documentElement.dataset)))
    if (d !== last) { console.log(`${(i / 2).toFixed(1)}s ${d}`); last = d }
    await page.waitForTimeout(500)
  }
  console.log((await page.evaluate(() => window.__log)).join('\n'))
  // 둘째 — 앱을 다시 켜고 타이틀 「이어하기」(OPFS 리포트)로 든다. journey ⑭와 같은 길
  if (process.argv.includes('--again')) {
    // 리포트를 쓰는 것은 게임 메뉴다 — 여기서는 가져온 리포트가 이미 슬롯에 있다
    await page.goto(vite.url, { waitUntil: 'load' })
    await page.getByRole('button', { name: '이어하기', exact: true }).click({ timeout: 120_000 })
    await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
    await page.evaluate(async () => {
      const { scriptSpy } = await import('/src/engine/script/spy.ts')
      window.__log = []
      scriptSpy.message = (id, t) => window.__log.push(`msg ${id}:${String(t).slice(0, 80)}`)
      scriptSpy.start = (i) => window.__log.push(`start ${JSON.stringify(i)}`)
      scriptSpy.end = (k) => window.__log.push(`end ${String(k)}`)
    })
    last = ''
    for (let i = 0; i < 120; i++) {
      const d = await page.evaluate(async () => {
        const w = (await import('/src/engine/map/world.ts')).world
        return JSON.stringify({ ...document.documentElement.dataset, grid: w.grid !== null && w.grid !== undefined, wmap: w.mapId })
      })
      if (d !== last) { console.log(`둘째 ${(i / 2).toFixed(1)}s ${d}`); last = d }
      await page.waitForTimeout(500)
    }
    console.log((await page.evaluate(() => window.__log)).join('\n'))
  }
  await page.screenshot({ path: ROOT + '/.audit/p6runs/resume-probe.png' })
} finally { await browser.close(); vite.child.kill() }
