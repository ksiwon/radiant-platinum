// 진단 — **꽃향기마을 꽃집이 나무열매를 받고 장식을 주는가** (PARITY §7.16 · `ScrCmd_ShowAccessoryShop`)
//
//     node tools/e2e/_accessoryShop.mjs [--headed]
//
// 꽃집(맵 430)의 누나(14,4) 앞에서 A. 체리열매 셋을 쥐여 주고 빨강꽃(50)을 바꾼 뒤 B로 나간다.
// 읽는 것: 대사창 글(`innerText`) · 목록의 설명 칸 · 세이브의 장식 케이스와 가방(제품 스토어)
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'shots/accessoryShop')
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
const row = page.locator('[data-checkpoint="floaroma"]').first()
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
  const { useSaveStore } = await import('/src/state/saveStore.ts')
  const { fieldScripts } = await import('/src/engine/script/field.ts')
  Object.assign(globalThis, { __shop: { save: useSaveStore, field: fieldScripts } })
  const cp = CHECKPOINTS.find((c) => c.id === 'floaroma')
  await warpTo({ ...cp, id: 'flower-shop', map: 430, spot: { kind: 'tile', x: 14, z: 5, facing: Math.PI } })
})
await settle()
const before = await page.evaluate(() => {
  const { save, field } = globalThis.__shop
  field.services.bag.add(149, 3)
  return { cheri: field.services.bag.quantity(149), red: field.services.fashionCase.canFit(50, 9) }
})
/** 글이 `re`에 맞을 때까지 `key`를 누른다 (최대 `most`번) — 몇 번 눌렀는지 돌려준다 */
const pressUntil = async (re, key = 'KeyZ', most = 6) => {
  for (let i = 0; i < most; i++) {
    if (re.test(await text())) return i
    await tap(key)
  }
  return re.test(await text()) ? most : -1
}
verdict('A로 말을 걸면 인사한다 (뱅크 572의 4)', await pressUntil(/안녕하세요/) >= 0, { cheri: before.cheri })
verdict('두 쪽째 — 교환합시다', await pressUntil(/교환합시다/) >= 0, {})
verdict('목록 — 어느 액세서리를', await pressUntil(/어느 액세서리를/) >= 0, {})
await page.waitForTimeout(400)
const menu = await page.evaluate(() => [...document.querySelectorAll('[role="menuitemradio"], [aria-checked]')].map((e) => e.textContent).join('|'))
const list = await text()
await page.screenshot({ path: resolve(OUT, 'list.png') })
verdict('설명 칸 — 1개랑 교환 · 3개 갖고 있음 · 목록 스물셋', /1개랑 교환/.test(list) && /3개 갖고 있음/.test(list)
  && menu.split('|').length === 23, { menu: menu.slice(0, 80), n: menu.split('|').length })
await tap() // 빨강꽃
verdict('고르면 교환할지 묻는다 (7)', await pressUntil(/교환하겠습니까/, 'KeyZ', 0) >= 0, {})
await page.screenshot({ path: resolve(OUT, 'ask.png') })
await tap() // 예
verdict('고맙습니다 (8)', await pressUntil(/고맙습니다/, 'KeyZ', 0) >= 0, {})
verdict('받았다 (12)', await pressUntil(/받았다/) >= 0, {})
verdict('다시 목록', await pressUntil(/어느 액세서리를/) >= 0, {})
await page.waitForTimeout(400)
verdict('설명 칸이 2개로 줄었다', /2개 갖고 있음/.test(await text()), {})
await tap('KeyX')
verdict('B로 나가면 또 오세요 (11)', await pressUntil(/또 오세요/, 'KeyZ', 0) >= 0, {})
await tap()
await page.waitForTimeout(800)
const after = await page.evaluate(() => {
  const { field } = globalThis.__shop
  return { cheri: field.services.bag.quantity(149), fitMore: field.services.fashionCase.canFit(50, 9), talk: document.documentElement.dataset.talk ?? null }
})
verdict('체리열매가 하나 줄고 빨강꽃이 하나 들어왔다', after.cheri === before.cheri - 1 && before.red && !after.fitMore, after)

console.log(`\n${String(results.filter(Boolean).length)}/${String(results.length)}`)
await browser.close()
vite.child.kill()
process.exit(results.every(Boolean) ? 0 : 1)
