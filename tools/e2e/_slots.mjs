// 진단 — **게임코너 슬롯머신** (PARITY §7.6 · 판정이 아니라 진단이다)
//
//     node tools/e2e/_slots.mjs [--headed] [--spins=40]
//
// 게임코너(맵 136)의 기계 0 앞 (11,6)에서 동쪽으로 A. 코인케이스와 코인 500개를 넣어 두고, 그날 씨앗을 16으로 둔다
// (기계 0이 설정 5가 되는 날 — 진단만 하는 조작이다). 사람처럼 넣고 · 당기고 · 왼 · 가운데 · 오른 차례로 멈추기를
// 되풀이하고, 레버를 기다릴 때 Esc로 일어난다.
// 읽는 것: 문서 표식(`data-menu` · `data-slot` · `data-slot-coins` · `data-slot-bonus` · `data-script`)과 리포트의 코인
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'shots/slots')
mkdirSync(OUT, { recursive: true })
const args = process.argv.slice(2)
const SPINS = Number(args.find((a) => a.startsWith('--spins='))?.slice(8) ?? 40)
const vite = await startVite(await freePort(), 'node_modules/.vite-pg')
const browser = await chromium.launch({ args: gpuArgs('gl'), headless: !args.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const noise = []
page.on('pageerror', (e) => { noise.push(String(e.message).slice(0, 200)) })
page.on('console', (m) => { if (m.type() === 'error') noise.push(m.text().slice(0, 200)) })
const results = []
const verdict = (name, ok, detail) => { results.push(ok); console.log(`${ok ? '✓' : '✗'} ${name} — ${JSON.stringify(detail)}`) }
const tap = async (key, ms = 70) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(ms) }
const marks = () => page.evaluate(() => {
  const d = document.documentElement.dataset
  return {
    menu: d.menu ?? null, slot: d.slot === undefined ? null : Number(d.slot), coins: d.slotCoins === undefined ? null : Number(d.slotCoins),
    bonus: d.slotBonus === undefined ? 0 : Number(d.slotBonus), script: d.script === '1', talk: d.talk === '1', map: Number(d.map),
  }
})
const waitFor = async (ok, cap = 400) => {
  for (let i = 0; i < cap; i++) { const m = await marks(); if (ok(m)) return m; await page.waitForTimeout(50) }
  return marks()
}

await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
await page.keyboard.press('Backquote')
await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
const row = page.locator('[data-checkpoint="frontier"]').first()
await row.hover(); await page.waitForTimeout(150); await row.click()
await page.waitForURL('**/play', { timeout: 400_000 })
await page.mouse.move(2, 2)
const settle = async () => {
  await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(3000)
}
await settle()
await page.evaluate(async () => {
  const { CHECKPOINTS } = await import('/src/engine/dev/checkpoints.ts')
  const { warpTo } = await import('/src/app/devWarp.ts')
  const cp = CHECKPOINTS.find((c) => c.id === 'frontier')
  await warpTo({ ...cp, id: 'slot-0', map: 136, spot: { kind: 'tile', x: 11, z: 6, facing: Math.PI / 2 } })
})
await settle()
await page.evaluate(async () => {
  const s = await import('/src/state/saveStore.ts')
  const st = s.useSaveStore.getState()
  st.addItem(7, 444, 1)
  s.useSaveStore.setState({ coins: 500, daily: { ...st.daily, rand: 16 } })
})

// 앉는다 — 코인케이스가 있으면 곧바로 기계다
const opened = await (async () => {
  for (let i = 0; i < 30; i++) {
    const m = await marks()
    if (m.menu === 'slots' && m.slot !== null) return m
    await tap('KeyZ', 90)
    await page.waitForTimeout(300)
  }
  return marks()
})()
verdict('기계 앞에서 A — 슬롯 화면이 뜬다 · CREDIT 500', opened.menu === 'slots' && opened.coins === 500, opened)
await page.waitForTimeout(1500)
await page.screenshot({ path: resolve(OUT, '01-seated.png') })

let spins = 0, bonusSeen = 0, preBonusSeen = false, lowest = 500, highest = 500
for (; spins < SPINS; spins++) {
  const m0 = await waitFor((m) => [1, 26, 44].includes(m.slot ?? -1) || m.slot === 62 || m.menu !== 'slots', 600)
  if (m0.menu !== 'slots') break
  if (m0.slot === 62) { await tap('KeyZ'); continue }
  if (m0.slot === 26) preBonusSeen = true
  if (m0.slot === 44) bonusSeen = Math.max(bonusSeen, m0.bonus)
  await tap('KeyC')
  await tap('KeyS')
  await page.waitForTimeout(260)
  if (spins === 0) await page.screenshot({ path: resolve(OUT, '02-spinning.png') })
  for (const k of ['KeyF', 'KeyX', 'Space']) { await tap(k); await page.waitForTimeout(90) }
  const m1 = await marks()
  lowest = Math.min(lowest, m1.coins ?? lowest); highest = Math.max(highest, m1.coins ?? highest)
  if (spins === 0) { await page.waitForTimeout(400); await page.screenshot({ path: resolve(OUT, '03-stopped.png') }) }
  if ((preBonusSeen || bonusSeen > 0) && bonusSeen < 2) await page.screenshot({ path: resolve(OUT, `04-bonus-${String(spins).padStart(2, '0')}.png`) })
}
const before = await waitFor((m) => [1, 26, 44].includes(m.slot ?? -1) || m.menu !== 'slots', 800)
verdict(`${String(spins)}판을 쳤다 — 코인이 오갔다`, spins > 0 && (lowest < 500 || highest > 500), { spins, lowest, highest, preBonusSeen, bonusSeen, slot: before.slot })
await page.screenshot({ path: resolve(OUT, '05-last.png') })

// 일어난다 — Esc(START)
const coinsAtExit = before.coins
for (let i = 0; i < 5; i++) {
  const m = await marks()
  if (m.menu !== 'slots') break
  if (m.slot === 62) await tap('KeyZ'); else await tap('Escape')
  await page.waitForTimeout(400)
}
const after = await waitFor((m) => m.menu !== 'slots' && !m.script && !m.talk, 400)
const saved = await page.evaluate(async () => (await import('/src/state/saveStore.ts')).useSaveStore.getState().coins)
verdict('Esc로 일어나면 화면이 닫히고 스크립트가 끝난다 · 코인이 리포트로 옮겨진다',
  after.menu !== 'slots' && !after.script && saved === coinsAtExit, { menu: after.menu, script: after.script, saved, coinsAtExit })

console.log(`  잡음 ${String(noise.length)}건${noise.length > 0 ? ` — ${noise.slice(0, 3).join(' | ')}` : ''}`)
console.log(`\n${String(results.filter(Boolean).length)}/${String(results.length)}`)
await browser.close()
vite.child.kill()
process.exit(results.every(Boolean) ? 0 : 1)
