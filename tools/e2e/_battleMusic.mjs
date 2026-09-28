// 진단 — **배틀 곡이 트레이너 분류로 갈리고 이긴 곡이 원작 자리에서 도는가** (PARITY §8.1 · `enc_effects.c`)
//
//     node tools/e2e/_battleMusic.mjs [--headed]
//
// 확인 지점 `gym1`에서 강석(트레이너 246)과 붙어 곡이 관장 곡(1117)인지, 풀숲 야생이면 야생 곡(1116)인지 잰다.
// 읽는 것: `music.playing`(제품이 내보내는 지금 곡) · 배틀 스토어의 분류
const { resolve } = await import('node:path')
const { chromium } = await import('playwright')
const { freePort, startVite } = await import('../devServer.mjs')
const { gpuArgs } = await import('../gpuFlags.mjs')

const args = process.argv.slice(2)
const vite = await startVite(await freePort(), 'node_modules/.vite-pg')
const browser = await chromium.launch({ args: gpuArgs('gl'), headless: !args.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 1024, height: 700 } })
const results = []
const verdict = (name, ok, detail) => { results.push(ok); console.log(`${ok ? '✓' : '✗'} ${name} — ${JSON.stringify(detail)}`) }
void resolve

await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
// 소리가 깨어나려면 누름이 한 번 있어야 한다 (자동 재생 규칙)
await page.mouse.click(5, 5)
await page.keyboard.press('Backquote')
await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
const row = page.locator('[data-checkpoint="gym1"]').first()
await row.hover(); await page.waitForTimeout(150); await row.click()
await page.waitForURL('**/play', { timeout: 400_000 })
await page.mouse.move(2, 2)
await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
  && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
await page.waitForTimeout(3000)

const song = async (kind) => {
  await page.waitForFunction(async () => {
    const { useBattleStore } = await import('/src/state/battleStore.ts')
    return useBattleStore.getState().sceneReady
  }, null, { timeout: 120_000, polling: 250 })
  await page.waitForTimeout(2500)
  return page.evaluate(async (k) => {
    const { music } = await import('/src/engine/audio/music.ts')
    const { useBattleStore } = await import('/src/state/battleStore.ts')
    const b = useBattleStore.getState()
    return { kind: k, playing: music.playing, trainerClass: b.trainerClass, foes: b.foes.map((f) => f.classId) }
  }, kind)
}

const battleOpened = await page.evaluate(async () => {
  const { useBattleStore } = await import('/src/state/battleStore.ts')
  const done = useBattleStore.getState().startTrainer(246)
  Object.assign(globalThis, { __bm: useBattleStore })
  void done
  return true
})
const gym = await song('trainer')
verdict('관장전 — 관장 곡 1117', battleOpened && gym.playing === 1117, gym)
await page.evaluate(async () => { globalThis.__bm.getState().close() })
await page.waitForTimeout(1500)
await page.evaluate(async () => {
  const { useBattleStore } = await import('/src/state/battleStore.ts')
  void useBattleStore.getState().startWild({ species: 399, level: 3 })
})
const wild = await song('wild')
verdict('야생 — 야생 곡 1116', wild.playing === 1116, wild)

console.log(`\n${String(results.filter(Boolean).length)}/${String(results.length)}`)
await browser.close()
vite.child.kill()
process.exit(results.every(Boolean) ? 0 : 1)
