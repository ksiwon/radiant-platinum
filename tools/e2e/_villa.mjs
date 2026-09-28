// 진단 — **별장 — 산 가구가 서고 칸을 막고, 선반 앞 A가 음악상자를 튼다** (PARITY §7.17 · `villa_furniture.c`)
//
//     node tools/e2e/_villa.mjs [--headed]
//
// 리조트 확인 지점에서 가구 일곱 갈래(탁자 · 책장 · 선반 · 화분 넷 · 음악상자 · 피아노 · 샹들리에)의 깃발을 세우고 별장(464)의
// 선반 아래(18,4)에 북쪽을 보고 선다. 읽는 것: 장치 갈래(`mapFeature`) · 그려진 가구 수(`villaFurnitureDrawn`) ·
// 통행 판정(`mapFeatureBridge.blocked`) · 가로챈 곡(`fieldBgm.override`) · 대사창 글
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'shots/villa')
mkdirSync(OUT, { recursive: true })
const args = process.argv.slice(2)
const vite = await startVite(await freePort(), 'node_modules/.vite-pg')
const browser = await chromium.launch({ args: gpuArgs('gl'), headless: !args.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
const results = []
const verdict = (name, ok, detail) => { results.push(ok); console.log(`${ok ? '✓' : '✗'} ${name} — ${JSON.stringify(detail)}`) }
const tap = async (key = 'KeyZ') => { await page.keyboard.down(key); await page.waitForTimeout(120); await page.keyboard.up(key); await page.waitForTimeout(450) }
const text = () => page.evaluate(() => document.body.innerText)

await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
await page.keyboard.press('Backquote')
await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
const row = page.locator('[data-checkpoint="resort"]').first()
await row.hover(); await page.waitForTimeout(150); await row.click()
await page.waitForURL('**/play', { timeout: 400_000 })
await page.mouse.move(2, 2)
const settle = async () => {
  await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(3500)
}
await settle()
// 탁자 0 · 책장 7 · 선반 8 · 화분 9 · 음악상자 11 · 피아노 14 · 샹들리에 19
const OWNED = [0, 7, 8, 9, 11, 14, 19]
await page.evaluate(async (owned) => {
  const { CHECKPOINTS } = await import('/src/engine/dev/checkpoints.ts')
  const { warpTo } = await import('/src/app/devWarp.ts')
  const { fieldScripts } = await import('/src/engine/script/field.ts')
  const features = await import('/src/engine/world/mapFeatures.ts')
  const { fieldBgm } = await import('/src/engine/audio/songs.ts')
  const { villaFurnitureDrawn } = await import('/src/scene/VillaFurniture.tsx')
  Object.assign(globalThis, { __villa: { field: fieldScripts, features, fieldBgm, drawn: villaFurnitureDrawn } })
  // 처음 들어설 때의 주문 장면(`Villa_OnFrame_FirstEntry`)은 건너뛴다
  fieldScripts.vars.set(16545, 1)
  for (const t of owned) fieldScripts.vars.setFlag(2455 + t)
  const cp = CHECKPOINTS.find((c) => c.id === 'resort')
  await warpTo({ ...cp, id: 'villa', map: 464, spot: { kind: 'tile', x: 18, z: 4, facing: Math.PI } })
}, OWNED)
await settle()
const state = await page.evaluate(() => {
  const { features, drawn } = globalThis.__villa
  const b = features.mapFeatureBridge.blocked
  return {
    feature: features.mapFeature(), drawn: drawn(),
    table: b === null ? 'none' : b(12, 6, 0), beside: b === null ? 'none' : b(10, 6, 0), sofa: b === null ? 'none' : b(14, 6, 0),
  }
})
verdict('맵 스크립트가 별장 갈래(10)를 세운다', state.feature === 10, state)
// 탁자 · 책장 · 선반 · 화분 넷 · 음악상자 · 피아노 · 샹들리에 = 자리 열
verdict('산 것만 선다 — 자리 열', state.drawn === 10, state)
verdict('탁자 칸은 막고 · 옆 칸과 안 산 소파 칸은 격자로 내려간다', state.table === true && state.beside === null && state.sofa === null, state)
await page.screenshot({ path: resolve(OUT, 'room.png') })

await tap()
await page.waitForTimeout(300)
const playing = await page.evaluate(() => ({ bgm: globalThis.__villa.fieldBgm.override, text: document.body.innerText.slice(-200) }))
verdict('선반 앞 A — 음악상자가 SEQ_PL_TOWN02(1218)를 튼다', playing.bgm === 1218, playing)
await page.waitForTimeout(1500)
const still = await page.evaluate(() => globalThis.__villa.fieldBgm.override)
verdict('누르고 있던 A로 바로 안 꺼진다 — 1.5초 뒤에도 울린다', still === 1218, { still })
await page.screenshot({ path: resolve(OUT, 'musicBox.png') })
await tap()
await page.waitForTimeout(600)
const after = await page.evaluate(() => ({ bgm: globalThis.__villa.fieldBgm.override, talk: document.documentElement.dataset.talk ?? null }))
verdict('A를 다시 누르면 필드 곡으로 돌아간다 (SetFieldScene)', after.bgm === null, after)

// 주문서 — 탁자 앞(12,9)에서 북쪽. 피아노는 전당 열 번이 차야 목록에 선다 (`CheckMetFurnitureRequirements`)
const orderList = async () => {
  await page.evaluate(async () => {
    const { CHECKPOINTS } = await import('/src/engine/dev/checkpoints.ts')
    const { warpTo } = await import('/src/app/devWarp.ts')
    const cp = CHECKPOINTS.find((c) => c.id === 'resort')
    await warpTo({ ...cp, id: 'villa', map: 464, spot: { kind: 'tile', x: 12, z: 9, facing: Math.PI } })
  })
  await settle()
  // 확인 지점 워프가 세이브를 되돌린다 — 돈은 선 뒤에 넣는다
  await page.evaluate(() => { globalThis.__villa.save.setState({ money: 500000 }) })
  for (let i = 0; i < 4; i++) {
    const n = await page.evaluate(() => document.querySelectorAll('[role="menuitemradio"], [aria-checked]').length)
    if (n > 0) break
    await tap()
  }
  await page.waitForTimeout(400)
  return page.evaluate(() => [...document.querySelectorAll('[role="menuitemradio"], [aria-checked]')].map((e) => e.textContent.trim()))
}
await page.evaluate(async () => {
  const { useSaveStore } = await import('/src/state/saveStore.ts')
  globalThis.__villa.save = useSaveStore
})
const first = await orderList()
await page.screenshot({ path: resolve(OUT, 'orderForm.png') })
await tap('KeyX'); await page.waitForTimeout(400); await tap(); await page.waitForTimeout(400)
await page.evaluate(() => {
  const { save } = globalThis.__villa
  save.setState((s) => ({ records: s.records.map((v, i) => (i === 73 ? 10 : v)) }))
})
const second = await orderList()
verdict('값 칸 — 이름과 값이 따로 서고 제어 부호가 안 보인다', first.every((t) => !t.includes('{')) && first.some((t) => /120000|120,000/.test(t)), first.slice(0, 3))
verdict('전당 열 번이 차면 목록에 한 줄(피아노)이 더 선다', second.length === first.length + 1, { first: first.length, second: second.length, extra: second.filter((t) => !first.includes(t)) })
// 큰 소파(둘째 줄)를 산다 — 예 → 돈이 빠지고 깃발이 서고 배달 뒤 소파가 선다
const money0 = await page.evaluate(() => globalThis.__villa.save.getState().money)
await tap('ArrowDown'); await tap()
for (let i = 0; i < 3 && !/예/.test(await text()); i++) await tap()
await tap() // 예
for (let i = 0; i < 12; i++) {
  const done = await page.evaluate(() => globalThis.__villa.field.vars.checkFlag(2456) && document.documentElement.dataset.talk === undefined)
  if (done) break
  await tap()
  await page.waitForTimeout(500)
}
await settle()
const bought = await page.evaluate(() => {
  const { save, field, drawn, features } = globalThis.__villa
  return { spent: save.getState().money, flag: field.vars.checkFlag(2456), drawn: drawn(), sofa: features.mapFeatureBridge.blocked?.(14, 6, 0) ?? null }
})
await page.screenshot({ path: resolve(OUT, 'bought.png') })
verdict('큰 소파 — 120,000원이 빠지고 서서 칸을 막는다', money0 - bought.spent === 120000 && bought.flag && bought.drawn === 11 && bought.sofa === true, { money0, ...bought })

console.log(`\n${String(results.filter(Boolean).length)}/${String(results.length)}`)
await browser.close()
vite.child.kill()
process.exit(results.every(Boolean) ? 0 : 1)
