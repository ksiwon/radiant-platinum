// 진단 — **강좌 동안 진짜 키·마우스를 누르면 손이 어긋나는가** (`TutorialPilot` · `useMenuKeys`의 `pilotOnly`)
//
//     node tools/e2e/_tutorialMash.mjs [--only=a1,b1] [--limit=180] [--headed]
//
// `_tutorial.mjs`(입력 0)를 변형마다 새 컨텍스트로 돌린다. 읽는 것: 배틀 스토어 · `data-pilot-step` · `data-pilot-hand` · `data-pilot` 표적
//   base  입력 없음(기준 시간)
//   a1    journey 배틀 고리의 키만: Space 70ms 누름 + 60ms 쉼 반복 (drive.mjs `tap('Space')`)
//   a2    journey 배틀 고리 통째: 기술 칸(PP 꼴 버튼)이 보이면 진짜 마우스로 누르고, 아니면 Space (drive.mjs `pickMove` + `tap`)
//   b1    사람 연타: Space를 150ms마다
//   b2    사람 연타: Enter를 150ms마다
//   b3    사람 연타: Z를 150ms마다
//   c1    손이 뜰 때마다 Space 한 번
//   c2    명령 메뉴(표적 fight/bag)가 보이는 동안 X 한 번(단계당)
//   c3    가방(표적 pocket-2/item-0)이 보이는 동안 ArrowDown 한 번(단계당)
//   d1    기술 칸(move-0)이 처음 보일 때 진짜 마우스 클릭 한 번
//   d2    명령 칸(fight)이 처음 보일 때 진짜 마우스 클릭 한 번
//   d3    둘째 턴 명령 칸(bag)이 보일 때 진짜 마우스 클릭 한 번
const { mkdirSync } = await import('node:fs')
const { resolve } = await import('node:path')
const { chromium } = await import('playwright')
const { freePort, startVite } = await import('../devServer.mjs')
const { gpuArgs } = await import('../gpuFlags.mjs')

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'shots/tutorial-mash')
mkdirSync(OUT, { recursive: true })
const args = process.argv.slice(2)
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1]
const LIMIT = Number(opt('limit') ?? 180) * 1000
const ALL = ['base', 'a1', 'a2', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3', 'd1', 'd2', 'd3']
const ONLY = opt('only')?.split(',') ?? ALL
const vite = await startVite(await freePort(), 'node_modules/.vite-pg')
const browser = await chromium.launch({ args: gpuArgs('gl'), headless: !args.includes('--headed') })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 700 } })
  const page = await ctx.newPage()
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
  await page.evaluate(async () => {
    const { useBattleStore } = await import('/src/state/battleStore.ts')
    const { fieldScripts } = await import('/src/engine/script/field.ts')
    Object.assign(globalThis, { __tut: { battle: useBattleStore } })
    fieldScripts.services.startCatchingTutorial()
  })
  await page.waitForFunction(() => globalThis.__tut.battle.getState().phase === 'running', null, { timeout: 120_000 })
  return { ctx, page }
}

const read = (page) => page.evaluate(() => {
  const b = globalThis.__tut.battle.getState()
  return {
    step: document.documentElement.dataset.pilotStep ?? '0',
    hand: document.querySelector('[data-pilot-hand]') !== null,
    targets: [...document.querySelectorAll('[data-pilot]')].map((e) => e.getAttribute('data-pilot')),
    phase: b.phase, outcome: b.outcome,
  }
})

async function mash(page, ctl, code) {
  while (!ctl.stop) { await page.keyboard.press(code).catch(() => {}); ctl.n++; await sleep(150) }
}
async function oncePerStep(page, ctl, targets, act) {
  const done = new Set()
  while (!ctl.stop) {
    const s = await read(page).catch(() => null)
    const hit = s?.targets.find((t) => targets.includes(t))
    const key = `${s?.step}:${hit}`
    if (hit !== undefined && !done.has(key)) { done.add(key); await act(); ctl.n++ }
    await sleep(40)
  }
}
async function clickOnce(page, ctl, target) {
  while (!ctl.stop) {
    const loc = page.locator(`[data-pilot="${target}"]`).first()
    if (await loc.count().catch(() => 0) > 0) { await loc.click({ timeout: 3000 }).catch(() => {}); ctl.clicks++; return }
    await sleep(30)
  }
}

/** 입력 하나 — `ctl.stop`이 서면 끝난다 */
const drivers = {
  base: async () => {},
  a1: async (page, ctl) => {
    while (!ctl.stop) { await page.keyboard.down('Space'); await sleep(70); await page.keyboard.up('Space'); await sleep(60); ctl.n++ }
  },
  a2: async (page, ctl) => {
    while (!ctl.stop) {
      const rows = page.locator('button').filter({ hasText: /\d+\s*\/\s*\d+/ })
      const n = await rows.count().catch(() => 0)
      if (n > 0) {
        const texts = []
        for (let i = 0; i < n; i++) texts.push((await rows.nth(i).innerText().catch(() => '')).replace(/\s+/g, ' '))
        let at = texts.findIndex((t) => t.includes('효과가 굉장함'))
        if (at < 0) at = texts.findIndex((t) => !t.includes('효과가 별로') && !t.includes('효과가 없다'))
        if (at < 0) at = 0
        await rows.nth(Math.min(at, n - 1)).click({ timeout: 3000 }).catch(() => {})
        ctl.clicks++
        await sleep(80)
        continue
      }
      const cards = page.locator('button').filter({ hasText: /Lv\.?\s*\d/ })
      if ((await cards.count().catch(() => 0)) > 0) {
        for (let i = 0; i < await cards.count(); i++) {
          if (await cards.nth(i).isDisabled().catch(() => true)) continue
          await cards.nth(i).click({ timeout: 3000 }).catch(() => {}); ctl.clicks++; break
        }
        continue
      }
      await page.keyboard.down('Space'); await sleep(70); await page.keyboard.up('Space'); await sleep(60); ctl.n++
    }
  },
  b1: (page, ctl) => mash(page, ctl, 'Space'),
  b2: (page, ctl) => mash(page, ctl, 'Enter'),
  b3: (page, ctl) => mash(page, ctl, 'KeyZ'),
  c1: async (page, ctl) => {
    let seen = false
    while (!ctl.stop) {
      const s = await read(page).catch(() => null)
      if (s?.hand && !seen) { await page.keyboard.press('Space'); ctl.n++ }
      seen = s?.hand ?? false
      await sleep(40)
    }
  },
  c2: (page, ctl) => oncePerStep(page, ctl, ['fight', 'bag'], async () => { await page.keyboard.press('KeyX') }),
  c3: (page, ctl) => oncePerStep(page, ctl, ['pocket-2', 'item-0'], async () => { await page.keyboard.press('ArrowDown') }),
  d1: (page, ctl) => clickOnce(page, ctl, 'move-0'),
  d2: (page, ctl) => clickOnce(page, ctl, 'fight'),
  d3: (page, ctl) => clickOnce(page, ctl, 'bag'),
}

const out = []
for (const name of ONLY) {
  console.log(`\n== ${name} ==`)
  const { ctx, page } = await open()
  const ctl = { stop: false, n: 0, clicks: 0 }
  const t0 = Date.now()
  const input = drivers[name](page, ctl).catch((e) => console.log('  입력 오류', String(e.message).slice(0, 120)))
  const steps = []
  let last = '0', res = 'stall', final = null
  while (Date.now() - t0 < LIMIT) {
    const s = await read(page).catch(() => null)
    if (s === null) { await sleep(60); continue }
    final = s
    if (s.step !== last) { steps.push({ step: s.step, ms: Date.now() - t0 }); last = s.step }
    if (s.phase === 'off') { res = 'close'; break }
    await sleep(60)
  }
  ctl.stop = true
  await input
  const ms = Date.now() - t0
  const info = await page.evaluate(() => {
    const b = globalThis.__tut.battle.getState()
    return { phase: b.phase, outcome: b.outcome }
  }).catch(() => ({ phase: '관측 불가', outcome: null }))
  let shot = null
  if (res === 'stall') {
    shot = resolve(OUT, `stall-${name}.png`)
    await page.screenshot({ path: shot }).catch(() => { shot = null })
  }
  const caught = info.outcome === 'caught' || final?.outcome === 'caught'
  const row = {
    name, result: res === 'close' && caught ? 'pass' : res === 'close' ? 'closed-not-caught' : 'stall', ms,
    outcome: info.outcome ?? final?.outcome ?? null, lastStep: last, steps, input: { keys: ctl.n, clicks: ctl.clicks }, final, shot,
  }
  out.push(row)
  console.log(JSON.stringify(row))
  await ctx.close()
}
console.log('\n요약')
for (const r of out) console.log(`${r.name}\t${r.result}\t${Math.round(r.ms / 1000)}s\tstep=${r.lastStep}\toutcome=${r.outcome}\tinput=${JSON.stringify(r.input)}\t${r.shot ?? ''}`)
await browser.close()
vite.child.kill()
process.exit(0)
