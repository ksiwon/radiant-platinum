// 포획 결과는 **공이 멎은 뒤에** 말한다 (지시서 2026-09-20 §4의 R2 줄).
//
//     pnpm capture                      기본: 몬스터볼 여러 번 + 마스터볼 한 번
//     pnpm capture --gpu=webgpu         사용자가 타는 길로
//     pnpm capture --throws=8           던지는 횟수
//
// ⚠️ **흔들린 횟수를 눈으로 세지 않는다.** 공은 3D 무대에 있어서 DOM에 안 적힌다.
// 대신 제품이 내놓는 두 값을 잰다: 뷰의 `lastBall`(몇 번 흔들렸고 잡혔는가)과
// **공통 연출 시계**(`presentationClock.battleClock`). 둘 사이의 시간이
// `captureResolveAt(shakes)`보다 짧으면 흔들리는 공을 보면서 답이 먼저 뜬 것이다.
//
// 0~3 흔들림은 **골라 만들 수 없다** — 확률이 정한다. 그래서 여러 번 던져
// 나온 만큼을 표로 남기고, 못 나온 칸은 **못 봤다**로 적는다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(ROOT, '.audit')
const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit === undefined ? fallback : hit.slice(name.length + 3)
}

const CHECKPOINT = flag('cp', 'center')
/** 몬스터볼(4). 잘 안 잡혀야 0~3 흔들림이 골고루 나온다 */
const POKE = 4
/** 마스터볼(1). 반드시 잡히는 쪽을 한 번은 봐야 한다 */
const MASTER = 1
const THROWS = Number(flag('throws', '8'))
/** 잡을 상대. 체력이 꽉 찬 야생이라 몬스터볼로는 잘 안 잡힌다 */
const FOE = (flag('foe', '396:12:0')).split(':').map(Number)

const tap = async (page, key, ms = 140) => {
  await page.keyboard.press(key)
  await page.waitForTimeout(ms)
}

/** 배틀 가방이 줄마다 적어 두는 읽기 전용 표시 (`ui/battle/BattleBag`) */
function readBag() {
  const list = document.querySelector('[data-battle-bag="items"]')
  if (list === null) return null
  return {
    pocket: Number(list.getAttribute('data-pocket')),
    cursor: Number(list.getAttribute('data-cursor')),
    total: Number(list.getAttribute('data-items')),
    rows: [...list.querySelectorAll('[data-item-id]')].map((el) => ({
      item: Number(el.getAttribute('data-item-id')),
      row: Number(el.getAttribute('data-item-row')),
      count: Number(el.getAttribute('data-item-count')),
      on: el.getAttribute('aria-selected') === 'true',
      label: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    })),
  }
}

/** 명령 단이 서 있는가 */
async function commandReady(page) {
  return page.evaluate(() => [...document.querySelectorAll('button, [role="button"]')]
    .some((el) => (el.textContent ?? '').trim().startsWith('싸운다')))
}

async function waitCommand(page, ms = 40_000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (await commandReady(page)) return true
    await tap(page, 'Space', 120)
  }
  return false
}

/**
 * 페이지 안에 녹음기를 건다.
 *
 * ⚠️ **노드에서 프레임마다 왕복하면 못 잰다.** 0.92초짜리 자리를 재는데 왕복
 * 하나가 그만큼 걸린다. 시계도 뷰도 제품이 export하는 것을 그대로 읽는다
 */
async function arm(page) {
  await page.evaluate(async () => {
    // ⚠️ **한 번만 건다.** 배틀마다 다시 걸면 그때까지 모은 던지기가 통째로
    // 사라진다 — 실측 2026-09-20에 여덟 번 던지고 마지막 배틀의 셋만 남았다.
    // 루프는 프레임마다 스토어를 다시 읽으므로 배틀이 바뀌어도 그대로 산다
    if (window.__ball) return
    const clock = (await import('/src/engine/battle/presentationClock.ts')).battleClock
    const store = (await import('/src/state/battleStore.ts')).useBattleStore
    const timing = await import('/src/engine/battle/captureTiming.ts')
    const g = { throws: [], done: false }
    window.__ball = g
    let seq = 0
    let open = null
    let line = ''
    const step = () => {
      requestAnimationFrame(step)
      const now = clock.now()
      const view = store.getState().view ?? null
      const ball = view?.lastBall ?? null
      const text = (document.querySelector('[class*="logText"]')?.textContent ?? '').trim()
      // 배틀이 바뀌면 `seq`가 1부터 다시 시작한다. 그래도 **다른 값**이므로
      // 새 던지기로 잡힌다
      if (ball && ball.seq !== seq) {
        seq = ball.seq
        // 공이 손을 떠난 **연출 시각**. 글이 바뀐 시각을 여기서부터 잰다
        open = {
          seq, ball: ball.ball, shakes: ball.shakes, caught: ball.caught,
          at: now, resolveAt: timing.captureResolveAt(ball.shakes),
          duration: timing.captureDuration(ball.shakes, ball.caught),
          said: null, saidAt: null,
        }
        g.throws.push(open)
        line = text
        return
      }
      if (open !== null && open.said === null && text !== '' && text !== line) {
        open.said = text.slice(0, 40)
        open.saidAt = now
        open.waited = now - open.at
      }
    }
    requestAnimationFrame(step)
  })
}

/** 가방 → 볼 주머니에서 그 볼을 골라 던진다 */
async function throwBall(page, ball) {
  await tap(page, 'ArrowDown', 120)   // 싸운다 → 가방
  await tap(page, 'Space', 420)
  // 회복 → 상태 → 볼. 주머니는 넷이고 순서는 `BattleBag`의 CATEGORY 그대로다
  for (let i = 0; i < 2; i++) await tap(page, 'ArrowRight', 220)
  let seen = null
  for (let i = 0; i < 40; i++) {
    seen = await page.evaluate(readBag)
    if (seen !== null && seen.pocket === 2) break
    await page.waitForTimeout(150)
  }
  if (seen === null || seen.pocket !== 2) return '볼 주머니를 못 열었다'
  /**
   * 목표 줄까지 커서를 옮긴다.
   *
   * ⚠️ **한 방향으로만 걸으면 못 찾는다.** 커서는 주머니를 바꿔도 자리를
   * 기억하고 목록 끝에서는 **안 감긴다** — 실측 2026-09-20에 마지막 줄
   * (마스터볼)에 선 채로 아래로 밀다가 거기서 멈췄다. 끝에 닿으면 반대로 돈다
   */
  let stood = seen.rows.find((r) => r.on) ?? null
  const span = Number.isFinite(seen.total) ? seen.total : 40
  for (const key of ['ArrowDown', 'ArrowUp']) {
    let where = seen.cursor
    for (let i = 0; i <= span; i++) {
      if (stood !== null && stood.item === ball) break
      await tap(page, key, 90)
      const next = await page.evaluate(readBag)
      if (next === null) { stood = null; break }
      stood = next.rows.find((r) => r.on) ?? null
      if (next.cursor === where) break
      where = next.cursor
    }
    if (stood !== null && stood.item === ball) break
  }
  if (stood === null || stood.item !== ball) {
    for (let i = 0; i < 6 && !(await commandReady(page)); i++) await tap(page, 'KeyX', 150)
    return `커서가 볼 줄에 안 섰다 (${JSON.stringify(stood?.label ?? null)})`
  }
  // 볼은 대상을 안 묻는다 — 고르면 곧바로 던진다 (`BattleBag`의 머리말)
  await tap(page, 'Space', 400)
  return null
}

async function main() {
  let vite = null
  let url = flag('url')
  if (!url) {
    const port = await freePort()
    vite = await startVite(port)
    url = vite.url
  }
  const gpu = flag('gpu', 'software')
  const browser = await chromium.launch({ args: gpuArgs(gpu) })
  const page = await browser.newPage({ viewport: { width: 640, height: 428 }, deviceScaleFactor: 1 })
  page.setDefaultNavigationTimeout(240_000)
  const noise = []
  page.on('console', (m) => { if (m.type() === 'error') noise.push(m.text()) })
  page.on('pageerror', (e) => { noise.push(`pageerror: ${e.message}`) })

  const out = { gpu, checkpoint: CHECKPOINT, foe: FOE, noise, throws: [], notes: [] }
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 60_000 })
  await page.keyboard.press('Backquote')
  await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
  const row = page.locator(`[data-checkpoint="${CHECKPOINT}"]`).first()
  await row.hover()
  await page.waitForTimeout(200)
  await row.click()
  await page.waitForURL('**/play', { timeout: 60_000 })
  await page.waitForSelector('canvas', { timeout: 120_000 })
  await page.waitForTimeout(6000)
  await page.evaluate(async () => { await globalThis.pt.heal() })
  await page.evaluate(async (i) => { await globalThis.pt.item(i, 60) }, POKE)
  await page.waitForTimeout(500)
  await page.evaluate(async (i) => { await globalThis.pt.item(i, 5) }, MASTER)
  await page.waitForTimeout(500)

  let shot = 0
  for (let t = 0; t < THROWS; t++) {
    // 마지막 한 번은 마스터볼 — **잡히는 쪽**도 봐야 한다
    const ball = t === THROWS - 1 ? MASTER : POKE
    const live = await page.evaluate(() => document.querySelector('[class*="cardFoe"]') !== null)
    if (!live) {
      await page.evaluate(async (f) => { await globalThis.pt.wild(f[0], f[1], f[2]) }, FOE)
      await page.waitForTimeout(9000)
    }
    await arm(page)
    // ⚠️ **한 번 어긋났다고 나머지를 버리지 않는다.** 잡아서 배틀이 끝난 직후에는
    // 필드 스크립트가 도느라 명령 단이 늦게 선다 — 실측 2026-09-20에 열한 번째가
    // 거기서 멈췄다. 새 배틀을 열어 다시 시도한다
    if (!(await waitCommand(page))) {
      out.notes.push(`${String(t + 1)}번째: 명령 단이 안 서서 배틀을 다시 열었다`)
      await page.evaluate(async (f) => { await globalThis.pt.wild(f[0], f[1], f[2]) }, FOE)
      await page.waitForTimeout(9000)
      if (!(await waitCommand(page))) { out.notes.push(`${String(t + 1)}번째: 그래도 안 섰다`); break }
    }
    const why = await throwBall(page, ball)
    if (why !== null) { out.notes.push(`${String(t + 1)}번째: ${why}`); continue }
    // 결과 글이 뜰 때까지 **안 누르고** 기다린다 — 연출을 건너뛰면 재는 뜻이 없다
    const until = Date.now() + 25_000
    while (Date.now() < until) {
      const done = await page.evaluate(() => {
        const g = window.__ball
        const last = g?.throws[g.throws.length - 1]
        return last?.said !== null && last?.said !== undefined
      })
      if (done) break
      await page.waitForTimeout(120)
    }
    if (shot < 2) {
      shot++
      await page.screenshot({ path: resolve(OUT, `capture-${String(shot)}.png`) })
    }
    // 잡혔으면 배틀이 끝난다. 남은 글을 넘겨 필드로 돌아간다
    for (let i = 0; i < 40; i++) {
      if (await commandReady(page)) break
      const live2 = await page.evaluate(() => document.querySelector('[class*="cardFoe"]') !== null)
      if (!live2) break
      await tap(page, 'Space', 140)
    }
  }
  out.throws = await page.evaluate(() => window.__ball?.throws ?? [])
  // ⚠️ **깃발을 줬다고 믿지 않는다.** 실제로 그린 길은 제품이 내놓는 값으로 읽는다
  out.backend = await page.evaluate(() => globalThis.pt?.perf?.().backend ?? null).catch(() => null)
  await browser.close()
  vite?.child.kill()

  mkdirSync(OUT, { recursive: true })
  writeFileSync(resolve(OUT, 'capture-ball.json'), JSON.stringify(out, null, 2))
  let bad = 0
  const seen = new Map()
  for (const [i, t] of out.throws.entries()) {
    if (t.said === null) { console.log(`  ⛔ ${String(i + 1)}번째 결과 글을 못 봤다`); bad++; continue }
    // 결과는 흔들림이 다 끝난 **뒤에만** 뜬다. 한 프레임(16.7ms)은 준다
    const ok = t.waited >= t.resolveAt - 0.017
    if (!ok) bad++
    const key = `${String(t.shakes)}${t.caught ? '·잡힘' : ''}`
    seen.set(key, (seen.get(key) ?? 0) + 1)
    console.log(`  ${ok ? '✓' : '✗'} ${String(i + 1)}번째  볼 ${String(t.ball)} · `
      + `흔들림 ${String(t.shakes)}${t.caught ? ' · 잡혔다' : ''} · `
      + `글까지 ${t.waited.toFixed(3)}초 (계약 ${t.resolveAt.toFixed(2)}초) · ${String(t.said)}`)
  }
  const buckets = [0, 1, 2, 3]
  const missing = buckets.filter((n) => ![...seen.keys()].some((k) => k.startsWith(String(n))))
  console.log(`  본 갈래: ${[...seen.entries()].map(([k, v]) => `${k}×${String(v)}`).join(' · ')}`)
  if (missing.length > 0) console.log(`  · 못 본 흔들림 수: ${missing.join(', ')} (확률이 정한다 — 미실행)`)
  if (![...seen.keys()].some((k) => k.includes('잡힘'))) {
    console.log('  · 잡히는 판을 못 봤다')
    bad++
  }
  for (const n of out.notes) console.log(`  · ${n}`)
  console.log('  .audit/capture-ball.json')
  process.exit(bad === 0 ? 0 : 1)
}

await main()
