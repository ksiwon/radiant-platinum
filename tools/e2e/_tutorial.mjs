// 진단 — **202번도로 포획 강좌가 원작대로 도는가** (`StartCatchingTutorial` · PARITY §2.x)
//
//     node tools/e2e/_tutorial.mjs [--headed]
//
// 확인 지점 `jubilife`(파트너를 받은 뒤)에서 강좌 배틀을 연다. 사람은 아무 키도 안 누른다 — 손이 「싸운다」 · 첫 기술 · 「가방」 ·
// 볼 주머니 · 첫 볼을 차례로 누르고, 볼이 늘 잡히고, 배틀이 스스로 닫혀야 한다. 리포트의 파티 · 가방 · 도감은
// 그대로여야 한다. 읽는 것: 배틀 스토어(제품이 내보내는 것) · 손(`data-pilot-hand`) · 세이브 스토어
const { mkdirSync } = await import('node:fs')
const { resolve } = await import('node:path')
const { chromium } = await import('playwright')
const { freePort, startVite } = await import('../devServer.mjs')
const { gpuArgs } = await import('../gpuFlags.mjs')

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'shots/tutorial')
mkdirSync(OUT, { recursive: true })
const args = process.argv.slice(2)
const vite = await startVite(await freePort(), 'node_modules/.vite-pg')
const browser = await chromium.launch({ args: gpuArgs('gl'), headless: !args.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 1024, height: 700 } })
const results = []
const verdict = (name, ok, detail) => { results.push(ok); console.log(`${ok ? '✓' : '✗'} ${name} — ${JSON.stringify(detail)}`) }

await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
await page.keyboard.press('Backquote')
await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
const row = page.locator('[data-checkpoint="jubilife"]').first()
await row.hover(); await page.waitForTimeout(150); await row.click()
await page.waitForURL('**/play', { timeout: 400_000 })
await page.mouse.move(2, 2)
await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
  && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
await page.waitForTimeout(3000)

const before = await page.evaluate(async () => {
  const { useSaveStore } = await import('/src/state/saveStore.ts')
  const { useBattleStore } = await import('/src/state/battleStore.ts')
  const { fieldScripts } = await import('/src/engine/script/field.ts')
  Object.assign(globalThis, { __tut: { save: useSaveStore, battle: useBattleStore, log: { steps: 0, outcome: null, victory: null, song: [] } } })
  // 걸음 · 결과 · 승리 곡을 페이지 안에서 적는다 — 캡처하는 사이 지나가 버리는 것을 놓치지 않게
  const log = globalThis.__tut.log
  const watch = () => {
    const step = Number(document.documentElement.dataset.pilotStep ?? 0)
    if (step > log.steps) log.steps = step
    const b = useBattleStore.getState()
    if (b.outcome !== null) log.outcome = b.outcome
    if (b.victorySong !== null) log.victory = b.victorySong
    requestAnimationFrame(watch)
  }
  watch()
  const s = useSaveStore.getState()
  const snap = JSON.stringify({ party: s.party, bag: s.bag, dex: s.pokedex })
  fieldScripts.services.startCatchingTutorial()
  return { snap, name: s.trainer.name, gender: s.trainer.gender }
})

await page.waitForFunction(() => globalThis.__tut.battle.getState().phase === 'running', null, { timeout: 120_000 })
const opened = await page.evaluate(() => {
  const b = globalThis.__tut.battle.getState()
  return { kind: b.kind, ally: b.ally, mine: b.truth?.active.p1a?.species ?? null, foe: b.truth?.active.p2a?.species ?? null, foeLevel: b.truth?.active.p2a?.level ?? null }
})
verdict('동료(롬 이름)가 제 파트너 Lv5로 서고 상대는 비버니 Lv2다', opened.ally !== null && opened.ally.gender !== before.gender
  && ['광휘', '빛나'].includes(opened.ally.name)
  && [387, 390, 393].includes(opened.mine) && opened.foe === 399 && opened.foeLevel === 2, opened)

/** 손이 떠서 누를 때까지 — 몇 번 떴는지 센다 */
const presses = []
const t0 = Date.now()
let seen = false
let lastStep = '0'
while (Date.now() - t0 < 120_000) {
  const now = await page.evaluate(() => ({
    hand: document.querySelector('[data-pilot-hand]') !== null,
    phase: globalThis.__tut.battle.getState().phase,
    step: document.documentElement.dataset.pilotStep ?? '0',
    outcome: globalThis.__tut.battle.getState().outcome,
  }))
  if (now.hand && !seen) { presses.push(Date.now() - t0); await page.screenshot({ path: resolve(OUT, `hand-${String(presses.length)}.png`) }) }
  if (!now.hand && seen) {
    await page.waitForTimeout(1500)
    const dbg = await page.evaluate(() => ({
      targets: [...document.querySelectorAll('[data-pilot]')].map((e) => e.getAttribute('data-pilot')),
      actions: globalThis.__tut.battle.getState().actions.length,
    }))
    console.log('  손이 걷힌 뒤', JSON.stringify(dbg))
    await page.screenshot({ path: resolve(OUT, `after-${String(presses.length)}.png`) })
  }
  seen = now.hand
  if (now.step !== lastStep) { console.log('  손', now.step, Date.now() - t0); lastStep = now.step; await page.screenshot({ path: resolve(OUT, `step-${now.step}.png`) }) }
  if (now.phase === 'off') break
  await page.waitForTimeout(60)
}
const log = await page.evaluate(() => globalThis.__tut.log)
verdict('손이 다섯 번 누른다 (싸운다 · 기술 · 가방 · 볼 주머니 · 볼) · 잡힌다 · 야생 승리 곡', log.steps === 5 && log.outcome === 'caught'
  && log.victory === 1127, log)
const after = await page.evaluate(() => {
  const s = globalThis.__tut.save.getState()
  return { snap: JSON.stringify({ party: s.party, bag: s.bag, dex: s.pokedex }), phase: globalThis.__tut.battle.getState().phase }
})
verdict('누르지 않아도 배틀이 닫힌다', after.phase === 'off', { phase: after.phase })
verdict('리포트의 파티 · 가방 · 도감이 그대로다', after.snap === before.snap, {})

console.log(`\n${String(results.filter(Boolean).length)}/${String(results.length)}`)
await browser.close()
vite.child.kill()
process.exit(results.every(Boolean) ? 0 : 1)
