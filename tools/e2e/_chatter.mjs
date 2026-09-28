// 진단 — **수다로 페라페에게 말을 가르친다** (PARITY §1.8 · 판정이 아니라 진단이다)
//
//     node tools/e2e/_chatter.mjs [--mic=fake|none] [--headed]
//
//   fake  크로미움의 가짜 마이크(`--use-fake-device-for-media-stream` — 삐 소리)로 받는다
//   none  마이크가 없다 — 권한을 안 주고 가짜 장치도 없다. 그러면 **게임 소리**를 받아야 한다
//
// 파티 첫 자리를 수다를 아는 페라페로 두고(개발 모듈), 파티 화면 → 수다 → 녹음 스크립트(8900)를 끝까지 탄다.
// 두 번째는 이미 배운 말이 있으니 「잊어도 되나」에 예로 답하고 다시 배운다.
//
// 읽는 것은 제품이 내보내는 값뿐이다: 세이브의 `chatotCry` · 받는 곳(`chatotRecordingSource`) · 미리보기 창의
// 컷(`data-preview-cut`) · 울음소리 칸(`music.isCryPlaying`) · 대사(`data-talk`)
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const args = process.argv.slice(2)
const flag = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d
const MIC = flag('mic', 'fake')
const ROOT = resolve(import.meta.dirname, '../..')

const vite = await startVite(await freePort(), 'node_modules/.vite-pg')
const launchArgs = [...gpuArgs('gl'), '--autoplay-policy=no-user-gesture-required']
if (MIC === 'fake') launchArgs.push('--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream')
const browser = await chromium.launch({ args: launchArgs, headless: !args.includes('--headed') })
const context = await browser.newContext({ viewport: { width: 960, height: 640 } })
if (MIC === 'fake') await context.grantPermissions(['microphone'], { origin: vite.url })
const page = await context.newPage()
page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })
page.on('console', (m) => { if (m.type() === 'error') console.error(`  console ${m.text().slice(0, 200)}`) })
const results = []
const verdict = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name} — ${JSON.stringify(detail)}`) }
const tap = async (key, ms = 150, hold = 70) => {
  await page.keyboard.down(key); await page.waitForTimeout(hold); await page.keyboard.up(key); await page.waitForTimeout(ms)
}
const state = () => page.evaluate(async () => {
  const f = await import('/src/engine/script/field.ts')
  const rec = await import('/src/engine/audio/chatotRecord.ts')
  const { music } = await import('/src/engine/audio/music.ts')
  const save = (await import('/src/state/saveStore.ts')).useSaveStore.getState()
  const box = document.querySelector('[data-preview]')
  return {
    talk: document.documentElement.dataset.talk === '1',
    script: document.documentElement.dataset.script === '1',
    menu: document.documentElement.dataset.menu ?? null,
    choice: f.fieldScripts.world?.menu != null,
    text: (document.querySelector('[data-dialog]') ?? document.querySelector('[data-talk-text]'))?.textContent?.slice(0, 60) ?? null,
    source: rec.chatotRecordingSource(),
    cry: save.chatotCry,
    preview: box === null ? null : Number(box.getAttribute('data-preview')),
    cut: box === null ? null : Number(box.getAttribute('data-preview-cut')),
    crying: music.isCryPlaying(),
    awake: music.awake,
  }
})

await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
await page.keyboard.press('Backquote')
await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
const row = page.locator('[data-checkpoint="siwon"]').first()
await row.hover(); await page.waitForTimeout(150); await row.click()
await page.waitForURL('**/play', { timeout: 400_000 })
await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
  && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
await page.mouse.move(2, 2)
await page.waitForTimeout(4000)
// 창의 컷은 폴링으로는 놓친다(8프레임 = 133ms) — 페이지 안에서 바뀔 때마다 적는다
await page.evaluate(() => {
  const cuts = new Set()
  globalThis.__chatterCuts = cuts
  new MutationObserver(() => {
    const box = document.querySelector('[data-preview]')
    if (box) cuts.add(Number(box.getAttribute('data-preview-cut')))
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-preview-cut'] })
})

// 파티 첫 자리를 페라페로 — 수다를 맨 위에
const party = await page.evaluate(async () => {
  const save = (await import('/src/state/saveStore.ts')).useSaveStore
  const list = [...save.getState().party]
  const mon = list[0]
  list[0] = { ...mon, species: 441, form: 0, nickname: null, isEgg: false, moves: [{ move: 448, pp: 20, ppUps: 0 }, ...mon.moves.slice(0, 3)] }
  save.setState({ party: list, chatotCry: null })
  return list.map((p) => p.species)
})
console.log(`  마이크: ${MIC} · 파티 ${JSON.stringify(party)}`)

/** 파티 화면 → 첫 자리 → 둘째 줄(수다) */
async function chooseChatter() {
  await page.evaluate(async () => { (await import('/src/state/menuStore.ts')).useMenuStore.getState().open('party') })
  await page.waitForTimeout(1200)
  await tap('KeyZ', 500)
  await tap('ArrowDown', 300)
  await tap('KeyZ', 600)
}

/** 스크립트가 끝날 때까지 대사를 넘기며 값을 뜬다. 예/아니오에는 `answer`로 답한다 */
async function ride(answer) {
  const seen = { sources: new Set(), cuts: new Set(), preview: null, crying: false, texts: [], choices: 0 }
  const t0 = Date.now()
  let idle = 0
  while (Date.now() - t0 < 40_000) {
    const s = await state()
    if (s.source) seen.sources.add(s.source)
    if (s.cut !== null) seen.cuts.add(s.cut)
    if (s.preview !== null && seen.preview === null) await page.screenshot({ path: resolve(ROOT, 'shots/chatter-preview.png') })
    if (s.preview !== null) seen.preview = s.preview
    if (s.crying) seen.crying = true
    if (s.text && seen.texts.at(-1) !== s.text) seen.texts.push(s.text)
    if (s.choice) {
      seen.choices++
      if (answer === 'no') await tap('ArrowDown', 200)
      await tap('KeyZ', 400)
      continue
    }
    if (!s.script && !s.talk && s.menu === null) { if (++idle > 6) break } else idle = 0
    // 녹음이 도는 동안(받는 곳이 서 있는 동안)은 안 누른다 — 0.67초를 그대로 둔다
    if (s.talk && !s.source) await tap('Space', 250)
    else await page.waitForTimeout(60)
  }
  const observed = await page.evaluate(() => [...globalThis.__chatterCuts])
  const take = await page.evaluate(async () => (await import('/src/engine/audio/chatotRecord.ts')).lastChatotTake())
  return { ...seen, sources: [...seen.sources], cuts: [...new Set([...seen.cuts, ...observed])], take }
}

/** 담긴 녹음을 풀어 조용하지 않은 샘플 수 · 가장 큰 값 */
const heard = () => page.evaluate(async () => {
  const c = await import('/src/engine/pokemon/chatotCry.ts')
  const save = (await import('/src/state/saveStore.ts')).useSaveStore.getState()
  const raw = c.decodeChatotCry(save.chatotCry)
  if (raw === null) return null
  const pcm = c.upsampleChatotCry(raw)
  let loud = 0, peak = 0
  for (const v of pcm) { if (v !== 0) loud++; peak = Math.max(peak, Math.abs(v)) }
  return { loud, peak, activation: c.chatterActivation(raw), chance: c.chatterChance(c.chatterActivation(raw)) }
})

await chooseChatter()
const first = await ride('yes')
const got1 = await heard()
console.log('  첫째', JSON.stringify(first), JSON.stringify(got1))
verdict('배웠다 — 세이브에 1000바이트', got1 !== null, got1)
verdict(`받은 곳이 ${MIC === 'fake' ? '마이크' : '게임 소리'}다`, first.sources.includes(MIC === 'fake' ? 'mic' : 'game'), first.sources)
verdict('받은 길이가 원작의 0.67초 안팎이고 무엇이든 들었다', first.take !== null && first.take.seconds > 0.5 && first.take.seconds <= 1 && first.take.peak > 0, first.take)
verdict('미리보기 창에 페라페 · 두 컷을 번갈아', first.preview === 441 && first.cuts.includes(1), { preview: first.preview, cuts: first.cuts })
verdict('배운 말로 운다 (울음소리 칸이 섰다)', first.crying, first.crying)

const before = await page.evaluate(async () => (await import('/src/state/saveStore.ts')).useSaveStore.getState().chatotCry)
await chooseChatter()
const second = await ride('yes')
const after = await page.evaluate(async () => (await import('/src/state/saveStore.ts')).useSaveStore.getState().chatotCry)
verdict('두 번째는 「잊어도 되나」를 묻고 예면 다시 배운다', second.choices >= 1 && after !== null && after !== before, { choices: second.choices, changed: after !== before })

const bad = results.filter((r) => !r.ok)
console.log(`\n${results.length - bad.length}/${results.length}`)
await browser.close()
vite.child.kill()
process.exit(bad.length === 0 ? 0 : 1)
