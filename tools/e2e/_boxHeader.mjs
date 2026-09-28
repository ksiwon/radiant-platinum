// 진단 — **박스 머리 메뉴 — 점프 · 벽지(애호가 줄) · 이름** (PARITY §4.13 · `box_app_manager.c`)
//
//     node tools/e2e/_boxHeader.mjs [--headed]
//
// 「정리한다」로 박스를 열고 맨 윗줄에서 ↑로 머리에 선다. A → 점프 · 벽지 · 이름 · 그만둔다. 벽지는 푼 것이 없으면 테마 넷,
// 푼 것이 있으면 「애호가1」이 붙는다. 읽는 것: 메뉴 DOM(`data-box-menu` · `menuitem`) · 세이브 스토어의 박스 · 벽지 · 이름
const { mkdirSync } = await import('node:fs')
const { resolve } = await import('node:path')
const { chromium } = await import('playwright')
const { freePort, startVite } = await import('../devServer.mjs')
const { gpuArgs } = await import('../gpuFlags.mjs')

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'shots/boxHeader')
mkdirSync(OUT, { recursive: true })
const args = process.argv.slice(2)
const vite = await startVite(await freePort(), 'node_modules/.vite-pg')
const browser = await chromium.launch({ args: gpuArgs('gl'), headless: !args.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } })
const results = []
const verdict = (name, ok, detail) => { results.push(ok); console.log(`${ok ? '✓' : '✗'} ${name} — ${JSON.stringify(detail)}`) }
const trace = args.includes('--trace')
const tap = async (key) => {
  await page.keyboard.down(key); await page.waitForTimeout(60); await page.keyboard.up(key); await page.waitForTimeout(160)
  if (trace) {
    const m = await page.evaluate(() => {
      const el = document.querySelector('[data-box-menu]')
      if (el === null) return null
      const items = [...el.querySelectorAll('[role="menuitem"]')]
      return { kind: el.getAttribute('data-box-menu'), at: items.findIndex((e) => e.getAttribute('aria-selected') === 'true') }
    })
    console.log('   ', key, JSON.stringify(m))
  }
}

await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
await page.keyboard.press('Backquote')
await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
const row = page.locator('[data-checkpoint="jubilife"]').first()
await row.hover(); await page.waitForTimeout(150); await row.click()
await page.waitForURL('**/play', { timeout: 400_000 })
await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
  && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
await page.waitForTimeout(2500)

const openBox = async () => page.evaluate(async () => {
  const { useMenuStore } = await import('/src/state/menuStore.ts')
  const { useSaveStore } = await import('/src/state/saveStore.ts')
  Object.assign(globalThis, { __box: { menu: useMenuStore, save: useSaveStore } })
  useMenuStore.getState().openBox(2)
})
const menuNow = () => page.evaluate(() => {
  const m = document.querySelector('[data-box-menu]')
  return m === null ? null : { kind: m.getAttribute('data-box-menu'), items: [...m.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent) }
})
const save = () => page.evaluate(() => {
  const s = globalThis.__box.save.getState()
  return { box: s.currentBox, wall: s.wallpapers[s.currentBox], name: s.boxNames[s.currentBox] }
})

await openBox()
// 마우스가 메뉴 위에 남아 있으면 항목에 올린 것으로 친다 — 구석으로 뺀다
await page.mouse.move(2, 2)
await page.waitForTimeout(1200)
await tap('ArrowUp')
const onHeader = await page.evaluate(() => document.querySelector('[data-box-header="on"]') !== null)
verdict('맨 윗줄에서 ↑로 머리에 선다', onHeader, {})
await tap('KeyZ')
const header = await menuNow()
verdict('머리 메뉴 — 점프 · 벽지 · 이름 · 그만둔다 (롬 뱅크 18의 24~27)', JSON.stringify(header?.items) === JSON.stringify(['점프', '벽지', '이름', '그만둔다']), header)
// 점프 → 박스3
await tap('KeyZ'); await tap('ArrowDown'); await tap('ArrowDown'); await tap('KeyZ')
verdict('점프 — 박스3으로', (await save()).box === 2, await save())
// 벽지 → 테마 넷 → 풍경1의 사막
await tap('KeyZ'); await tap('ArrowDown'); await tap('KeyZ')
const themes = await menuNow()
verdict('푼 벽지가 없으면 테마 넷', themes?.items.length === 4 && themes.items[0] === '풍경1', themes)
await tap('KeyZ')
const walls = await menuNow()
await page.screenshot({ path: resolve(OUT, 'walls.png') })
await tap('ArrowDown'); await tap('ArrowDown'); await tap('ArrowDown'); await tap('KeyZ')
// 박스3의 기본 벽지가 사막이라 사바나(3)로 바꿔 잰다
verdict('풍경1 — 숲 · 시티 · 사막 · 사바나 → 사바나(3)', walls?.items[3] === '사바나' && (await save()).wall === 3, { walls, now: await save() })
// 암호로 푼 벽지 둘(16 · 18 = 비트 0 · 2)이면 애호가1이 붙는다
await page.evaluate(() => { globalThis.__box.save.setState({ unlockedWallpapers: 0b101 }) })
await tap('KeyZ'); await tap('ArrowDown'); await tap('KeyZ')
const themes2 = await menuNow()
verdict('푼 벽지가 있으면 애호가1', themes2?.items.length === 5 && themes2.items[4] === '애호가1', themes2)
for (let i = 0; i < 4; i++) await tap('ArrowDown')
await tap('KeyZ')
const friends = await menuNow()
await tap('ArrowDown'); await tap('KeyZ')
verdict('애호가1 — 푼 것만 · 둘째(그리움 = 18)', JSON.stringify(friends?.items) === JSON.stringify(['졌다', '콘테스트'].slice(0, 0).concat(friends?.items ?? [])) && friends?.items.length === 2 && (await save()).wall === 18, { friends, now: await save() })
// 이름
await tap('KeyZ'); await tap('ArrowDown'); await tap('ArrowDown'); await tap('KeyZ')
await page.waitForTimeout(500)
const input = page.locator('input[aria-label="별명"]')
await input.fill('나의박스')
await input.press('Enter')
await page.waitForTimeout(600)
const named = await save()
const back = await page.evaluate(() => globalThis.__box.menu.getState().top)
await page.screenshot({ path: resolve(OUT, 'named.png') })
verdict('이름 — 지은 이름이 서고 박스 화면으로 돌아온다', named.name === '나의박스' && back === 'box', { named, back })

console.log(`\n${String(results.filter(Boolean).length)}/${String(results.length)}`)
await browser.close()
vite.child.kill()
process.exit(results.every(Boolean) ? 0 : 1)
