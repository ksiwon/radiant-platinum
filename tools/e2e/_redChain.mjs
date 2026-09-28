// 진단 — **창기둥의 붉은 사슬과 맥동** (`ScrCmd_20D` 0 · 1 · `ov6_0223E140.c`)
//
//     node tools/e2e/_redChain.mjs [--headed]
//
// 창기둥 확인 지점에서 서비스로 0을 부르고 1이 참이 될 때까지 잰다. 맥동 동안 빨강 한 겹의 진하기를 틱마다
// 적고 두 번 찍는다. 읽는 것: `screenTint`(제품) · `fadeAlpha` · `spearPillarLive`
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'shots/redChain')
mkdirSync(OUT, { recursive: true })
const args = process.argv.slice(2)
const vite = await startVite(await freePort(), 'node_modules/.vite-pg')
const browser = await chromium.launch({ args: gpuArgs('gl'), headless: !args.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 960, height: 720 } })
page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })
const results = []
const verdict = (name, ok, detail) => { results.push(ok); console.log(`${ok ? '✓' : '✗'} ${name} — ${JSON.stringify(detail)}`) }

await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
await page.keyboard.press('Backquote')
await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
const row = page.locator('[data-checkpoint="spear"]').first()
await row.hover(); await page.waitForTimeout(150); await row.click()
await page.waitForURL('**/play', { timeout: 400_000 })
await page.mouse.move(2, 2)
await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
  && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
await page.waitForTimeout(4000)

const who = await page.evaluate(async () => {
  const mesh = await import('/src/scene/chunkMesh.ts')
  await Promise.all([mesh.loadDemoMesh('redChain'), mesh.loadDemoSheet('redChain'), mesh.loadDemoAnims('redChain')])
  const fx = await import('/src/scene/spearPillarFx.ts')
  const fade = await import('/src/engine/script/fade.ts')
  const { npcActors } = await import('/src/engine/actor/npcs.ts')
  const { fieldScripts } = await import('/src/engine/script/field.ts')
  Object.assign(globalThis, { __rc: { fx, fade, svc: fieldScripts.services } })
  const cyrus = npcActors.byLocalID.get(1)
  fieldScripts.services.spearPillarFx(0)
  // 1을 매 프레임 묻는다 — 스크립트의 되돌아 도는 고리와 같다
  globalThis.__rc.samples = []
  globalThis.__rc.t0 = performance.now()
  const poll = () => {
    const done = fieldScripts.services.spearPillarFx(1) === 1
    globalThis.__rc.samples.push(+fade.screenTint.alpha.toFixed(3))
    if (done) { globalThis.__rc.doneAt = performance.now() - globalThis.__rc.t0; globalThis.__rc.cover = fade.fadeAlpha() } else requestAnimationFrame(poll)
  }
  requestAnimationFrame(poll)
  return cyrus ? { x: cyrus.x, z: cyrus.z, at: fx.spearPillarLive.at } : null
})
verdict('사슬이 아카기(지역 번호 1) 자리에 선다', who !== null && who.at !== null, who)
await page.waitForTimeout(1300)
await page.screenshot({ path: resolve(OUT, 'pulse.png') })
await page.waitForFunction(() => globalThis.__rc.doneAt !== undefined, null, { timeout: 20_000, polling: 50 })
const res = await page.evaluate(() => ({ ms: Math.round(globalThis.__rc.doneAt), cover: globalThis.__rc.cover, peak: Math.max(...globalThis.__rc.samples), tint: globalThis.__rc.fx && globalThis.__rc.samples.at(-1) }))
await page.screenshot({ path: resolve(OUT, 'end.png') })
// 211틱 = 3.52초 (1/60초 틱)
verdict('맥동 — 빨강이 절반까지 오른다 (8,8) · 211틱쯤에 끝난다', res.peak === 0.5 && res.ms > 3200 && res.ms < 4300, res)
verdict('끝에는 검게 덮이고 빨강이 걷힌다', res.cover === 1 && res.tint === 0, res)

console.log(`\n${String(results.filter(Boolean).length)}/${String(results.length)}`)
await browser.close()
vite.child.kill()
process.exit(results.every(Boolean) ? 0 : 1)
