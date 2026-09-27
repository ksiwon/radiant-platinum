// 진단 — **명예의 전당 → 크레딧 → 타이틀 → 이어하기** 한 벌에서 자리가 어디로 가나
//
//     node tools/e2e/_hof42.mjs [--save=.audit/journey/probe-league.rpsave] [--headed]
//
// ⚠️ **판정이 아니라 진단이다.** 전당은 `ClearGame`이 당기는 그 손잡이(`hallOfFame.clear()`)로 연다 —
// `story.mjs` ③과 같다. 걸어서 닿는 길은 `_league.mjs --leg=m`이 잰다
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d
const SAVE = flag('save', '.audit/journey/probe-league.rpsave')

const port = await freePort()
const vite = await startVite(port, 'node_modules/.vite-hof')
const browser = await chromium.launch({ args: gpuArgs('gl'), headless: !args.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })
const log = (what, v) => { console.log(`  ${what} — ${typeof v === 'string' ? v : JSON.stringify(v)}`) }
const marks = () => page.evaluate(() => ({ ...document.documentElement.dataset, path: location.pathname }))
const state = () => page.evaluate(async () => {
  const s = (await import('/src/state/saveStore.ts')).useSaveStore.getState()
  const w = (await import('/src/engine/map/world.ts')).world
  const st = (await import('/src/state/worldState.ts')).worldState
  const r = await import('/src/state/report.ts')
  const disk = await r.readReportDetailed(s.version).catch((e) => ({ kind: String(e) }))
  const v = (await import('/src/engine/script/field.ts')).fieldScripts.vars
  const flags = { completed: v.checkFlag(2404) === true, housePostgame: v.get(16655) }
  return {
    save: { map: s.position.map, x: s.position.x, z: s.position.z, loaded: s.loaded, playtimeMs: s.trainer.playtimeMs, hof: s.hallOfFame?.total },
    world: { map: w.mapId, x: +st.player.position.x.toFixed(2), z: +st.player.position.z.toFixed(2) },
    flags,
    disk: disk.kind === 'ok' ? { map: disk.save.position.map, x: disk.save.position.x, z: disk.save.position.z, hof: disk.save.hallOfFame?.total, completed: ((disk.save.flags?.[2404 >> 3] ?? 0) >> (2404 & 7) & 1) === 1 } : disk.kind,
  }
})

try {
  await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
  await page.setInputFiles('input[type=file]', resolve(ROOT, SAVE))
  await page.getByRole('button', { name: '이 리포트로 이어하기' }).click()
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live' && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(3000)
  log('들인 뒤', await state())
  // 바깥 세계가 붙을 때까지
  await page.waitForFunction(async () => Object.keys((await import('/src/engine/script/field.ts')).fieldScripts.services).length > 0, null, { timeout: 60_000 })
  await page.evaluate(async () => { (await import('/src/engine/script/field.ts')).fieldScripts.services.hallOfFame.clear() })
  await page.waitForFunction(() => document.documentElement.dataset.menu === 'hallOfFame', null, { timeout: 30_000 })
  log('전당 열림', await state())
  // 색종이 장면은 A를 기다린다(원작도) — 40초 뒤부터 4초마다 한 번 누른다. 저장이 끝나면 「Z 계속」
  for (let i = 0; i < 120; i++) {
    const text = await page.evaluate(() => document.body.innerText)
    if (text.includes('Z 계속')) { log(`저장 뒤 (${String(i)}초)`, await state()); break }
    if (i >= 40 && i % 4 === 0) await page.keyboard.press('KeyZ')
    if (i % 6 === 3) await page.screenshot({ path: resolve(ROOT, `shots/hof42-hof-${String(i).padStart(2, '0')}.png`) })
    await page.waitForTimeout(1000)
  }
  await page.screenshot({ path: resolve(ROOT, 'shots/hof42-saved.png') })
  await page.keyboard.press('KeyZ')
  await page.waitForFunction(() => document.documentElement.dataset.menu === 'credits', null, { timeout: 30_000 })
  const skippable = await page.evaluate(() => document.body.innerText.includes('넘기기'))
  log('크레딧', { skippable })
  // 처음 깬 판은 못 넘긴다 — 다 흐를 때까지 기다린다. 장면마다 한 장씩 찍는다. 끝나면 통째로 다시 켜진다
  let prev = 0
  for (const at of [4, 30, 60, 75, 100, 125]) {
    await page.waitForTimeout((at - prev) * 1000)
    prev = at
    await page.screenshot({ path: resolve(ROOT, `shots/hof42-credits-${String(at).padStart(3, '0')}s.png`) }).catch(() => {})
  }
  await page.waitForFunction(() => location.pathname === '/', null, { timeout: 300_000 })
  await page.getByRole('button', { name: '이어하기', exact: true }).waitFor({ timeout: 300_000 })
  await page.waitForTimeout(2000)
  log('타이틀', { ...(await state()), marks: await marks() })
  await page.getByRole('button', { name: '이어하기', exact: true }).click()
  await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 60_000 })
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live' && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  for (const t of [1000, 4000]) {
    await page.waitForTimeout(t)
    log(`이어하기 뒤 +${String(t)}ms`, { ...(await state()), marks: await marks() })
  }
  await page.screenshot({ path: resolve(ROOT, 'shots/hof42-continue.png') })
} catch (e) {
  console.error(`  터졌다 — ${String(e?.stack ?? e).slice(0, 600)}`)
} finally {
  await browser.close()
  vite.child.kill()
}
