// 진단 — **막아 둔 시설 넷의 문** (사용자 결정 2026-09-28 · 판정이 아니라 진단이다)
//
//     node tools/e2e/_frontierGate.mjs [--headed]
//
// 배틀프런티어(559)에서 문 앞에 서서 그쪽으로 민다. 막힌 시설이면 맵이 그대로고 안내가 뜬다. 팩토리는 들어가져야 한다.
// 읽는 것은 제품이 내보내는 값뿐이다 (`data-map` · `data-talk`). 안내는 롬 글이 아니라 우리 글이라 화면 글자에서 시설 이름을 읽는다
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const vite = await startVite(await freePort(), 'node_modules/.vite-pg')
const browser = await chromium.launch({ args: gpuArgs('gl'), headless: !args.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })
const results = []
const verdict = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name} — ${JSON.stringify(detail)}`) }

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
  await page.waitForTimeout(4000)
}
await settle()

/** 한 번 누른다 — 고정 틱이 읽을 만큼 쥐고 있는다 (`keyboard.press`는 한 틱 사이에 떼 버린다) */
const tap = async () => { await page.keyboard.down('KeyZ'); await page.waitForTimeout(120); await page.keyboard.up('KeyZ'); await page.waitForTimeout(500) }
const read = () => page.evaluate(() => ({
  map: Number(document.documentElement.dataset.map),
  talk: document.documentElement.dataset.talk === '1',
  text: /(배틀\S+?)[은는] 아직 준비 중/.exec(document.body.innerText)?.[1] ?? null,
}))
/** 그 칸에 그쪽을 보고 서서 민다 */
async function tryDoor(x, z, facing, key) {
  await page.evaluate(async ([tx, tz, f]) => {
    const { CHECKPOINTS } = await import('/src/engine/dev/checkpoints.ts')
    const { warpTo } = await import('/src/app/devWarp.ts')
    const cp = CHECKPOINTS.find((c) => c.id === 'frontier')
    await warpTo({ ...cp, id: `gate>${String(tx)},${String(tz)}`, spot: { kind: 'tile', x: tx, z: tz, facing: f } })
  }, [x, z, facing])
  await settle()
  await page.keyboard.down(key); await page.waitForTimeout(900); await page.keyboard.up(key)
  await page.waitForTimeout(2500)
  return read()
}

// 배틀타워 문 (48,17) — 아래 칸에서 북쪽으로
const tower = await tryDoor(48, 18, Math.PI, 'ArrowUp')
await page.screenshot({ path: resolve(ROOT, 'shots/frontier-gate-tower.png') })
verdict('배틀타워 — 문이 안 열리고 안내가 뜬다', tower.map === 559 && tower.talk && tower.text === '배틀타워', tower)
await tap(); await tap(); await page.waitForTimeout(500)
const after = await read()
verdict('안내를 넘기면 닫힌다', !after.talk && after.map === 559, after)

// 배틀스테이지 문 (19,34) — 동쪽 칸에서 서쪽으로
const hall = await tryDoor(20, 34, -Math.PI / 2, 'ArrowLeft')
verdict('배틀스테이지 — 막힌다', hall.map === 559 && hall.text === '배틀스테이지', hall)
await tap(); await tap(); await page.waitForTimeout(500)

// 배틀캐슬 문 (33,62) — 동쪽 칸에서 서쪽으로
const castle = await tryDoor(34, 62, -Math.PI / 2, 'ArrowLeft')
verdict('배틀캐슬 — 막힌다', castle.map === 559 && castle.text === '배틀캐슬', castle)
await tap(); await tap(); await page.waitForTimeout(500)

// 배틀룰렛 문 (64,62) — 서쪽 칸에서 동쪽으로
const arcade = await tryDoor(63, 62, Math.PI / 2, 'ArrowRight')
verdict('배틀룰렛 — 막힌다', arcade.map === 559 && arcade.text === '배틀룰렛', arcade)
await tap(); await tap(); await page.waitForTimeout(500)

// 배틀팩토리 문 (77,34) — 서쪽 칸에서 동쪽으로
const factory = await tryDoor(76, 34, Math.PI / 2, 'ArrowRight')
verdict('배틀팩토리 — 들어가진다', factory.map === 562, factory)

const bad = results.filter((r) => !r.ok)
console.log(`\n${String(results.length - bad.length)}/${String(results.length)}`)
await browser.close()
vite.child.kill()
process.exit(bad.length === 0 ? 0 : 1)
