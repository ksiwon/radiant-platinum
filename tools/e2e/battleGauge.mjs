// 체력 게이지를 **화면에서** 잰다 — 지시서 2026-09-20 §2·§3의 브라우저 조건.
//
//     pnpm gauge                    연타 판과 안 누른 판을 잰다
//     pnpm gauge --gpu=webgpu       사용자가 타는 길로
//     pnpm gauge --stall=1000       중간에 프레임을 그만큼 묶어 본다
//
// ⚠️ **사건 배열이 아니라 픽셀을 본다.** 단위 시험은 박자가 접힌 시각을 재지만,
// 화면의 체력바는 그때 CSS 전환(벽시계) 위에 있었다. 여기서 재는 것은
// **체력바의 실제 폭**과 **「쓰러졌다!」가 뜬 시각**이다 — 둘의 순서가 곧
// 「체력이 다 닳기 전에 다음 사건이 왔는가」다.
//
// ⚠️ 화면을 실제로 몰기 때문에 느리다. 기본 소프트웨어 래스터라이저에서
// 한 판에 2~3분이 든다.
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

/** 뛰어들 확인 지점. 야생전을 여는 데는 맵이 어디든 상관없다 */
const CHECKPOINT = flag('cp', 'center')
/** 우리 쪽은 한 방에 끝내야 게이지가 20→0 한 줄로 내려간다 */
const MINE = (flag('mine', '392:60:0')).split(':').map(Number)
/** 상대. 약할수록 한 방이다 */
const FOE = (flag('foe', '10:2:0')).split(':').map(Number)

/**
 * 화면을 **페이지 안에서** 매 프레임 훑는다.
 *
 * ⚠️ **노드에서 프레임마다 왕복하지 않는다.** `page.evaluate` + `keyboard.press`를
 * 한 바퀴씩 돌면 소프트웨어 래스터라이저에서 초당 대여섯 번밖에 못 재고,
 * 그러면 800ms짜리 게이지 이동이 표본 사이로 빠진다 — 실측 2026-09-20에 연타
 * 판의 중간 표본이 0개였다. 재는 것도 누르는 것도 `requestAnimationFrame` 안에
 * 둔다. 그래야 「**매 걸음** advance 입력」이라는 조건과도 맞는다.
 *
 * ⚠️ 키는 진짜 `KeyboardEvent`로 쏜다 — 제품이 `window`의 캡처 단계에서 듣는다
 * (`ui/menu/useMenuKeys`)
 */
function record({ stall }) {
  // ⚠️ **연타는 기술을 고른 뒤에 켠다.** 무대가 아직 안 선 동안에는 명령 메뉴가
  // 「가랏! 모부기!」 위에 같이 떠 있어서(`sceneReady`가 거짓이면 박자가 비고
  // `caughtUp`이 참이다), 그때부터 Z를 쏘면 배틀이 준비도 되기 전에 끝난다 —
  // 실측 2026-09-20에 표본이 34ms 만에 끊겼다. 재야 할 것은 **재생 중의 입력**이다
  const g = { rows: [], misses: [], stalled: false, done: false, press: false, frame: 0 }
  window.__gauge = g
  const started = performance.now()
  let told = 0
  const step = () => {
    const foe = document.querySelector('[class*="cardFoe"] [class*="barFill"]')
    const track = foe?.parentElement
    const log = document.querySelector('[class*="logText"]')
    // ⚠️ **못 찾은 것을 조용히 넘기지 않는다.** 배틀 화면이 왜 없는지를 적어야
    // 「안 일어났다」와 「못 쟀다」가 갈린다
    if ((!foe || !track) && performance.now() - told > 500) {
      told = performance.now()
      g.misses.push({ t: Math.round(performance.now()), text: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 90) })
    }
    if (foe && track) {
      const tw = track.getBoundingClientRect().width
      const r = tw > 0 ? foe.getBoundingClientRect().width / tw : 1
      g.rows.push({ t: performance.now(), r, text: (log?.textContent ?? '').trim() })
      if (stall > 0 && !g.stalled && r > 0.05 && r < 0.9) {
        g.stalled = true
        const until = performance.now() + stall
        while (performance.now() < until) { /* 프레임 하나를 통째로 묶는다 */ }
      }
    }
    // ⚠️ 매 프레임(60Hz)으로 쏘면 명령 메뉴가 열리고 닫히는 사이에 걸려 턴이
    // 아예 안 선다 — 실측으로 로그가 「가랏! 모부기!」에서 멈췄다. 사람이 낼 수
    // 있는 제일 빠른 연타(약 20Hz)로 쏜다
    g.frame++
    if (g.press && g.frame % 3 === 0) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'z', bubbles: true }))
    }
    if (performance.now() - started > 120_000) { g.done = true; return }
    const zero = g.rows.some((x) => x.r <= 0.001)
    const faint = g.rows.some((x) => x.text.includes('쓰러졌'))
    if (zero && faint) { g.done = true; return }
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

async function sweep(page, opts) {
  const startedAt = await page.evaluate(() => performance.now())
  // ⚠️ **연타는 명령 메뉴부터 시작한다.** 노드가 먼저 기술을 고르고 그다음에
  // 녹음을 붙이면, 60fps에서는 그 사이에 한 턴이 통째로 지나가 표본이 두 개만
  // 남는다 (실측 2026-09-20 WebGPU 판). 녹음이 먼저고, 메뉴도 그 연타가 넘긴다
  await page.screenshot({ path: resolve(OUT, `battle-gauge-${opts.name}-start.png`) })
  await page.evaluate(record, { stall: opts.stall })
  // 두 판 모두 여기서 턴을 세운다 — **재는 구간 앞은 똑같아야** 견줄 수 있다.
  // ⚠️ 고정 박자로 두 번 누르는 것으로는 모자란다. 명령 메뉴가 뜨는 시각이
  // 기계 사정에 따라 흔들려서, 실측으로 한 판은 70초 내내 등판 글에 서 있었다
  await startTurn(page)
  // 그 뒤부터 갈린다. 연타 판은 **재생이 도는 동안** Z를 쏜다.
  // ⚠️ 기술 줄이 뜰 때까지 기다린다 — 등판 글 위에서 누르면 명령 메뉴를 다시
  // 여닫을 뿐이라 「재생 중의 입력」이 아니다
  if (opts.press) await page.evaluate(() => { window.__gauge.press = true })
  const started = Date.now()
  let shot = false
  while (Date.now() - started < 70_000) {
    const now = await page.evaluate(() => {
      const g = window.__gauge
      return { done: g?.done === true, last: g?.rows[g.rows.length - 1]?.r ?? null }
    })
    // ⚠️ **게이지가 내려오는 중의 화면을 남긴다.** 끝난 뒤의 그림은 「닳는 동안」을
    // 못 보여 준다 — 지시서가 요구하는 것은 그 사이의 화면이다
    if (!shot && now.last !== null && now.last > 0.02 && now.last < 0.98) {
      shot = true
      await page.screenshot({ path: resolve(OUT, `battle-gauge-${opts.name}.png`) })
    }
    if (now.done) break
    await page.waitForTimeout(100)
  }
  const rows = await page.evaluate(() => window.__gauge?.rows ?? [])
  const misses = await page.evaluate(() => window.__gauge?.misses ?? [])
  let zeroAt = null
  let faintAt = null
  for (const row of rows) {
    if (zeroAt === null && row.r <= 0.001) zeroAt = row.t
    if (faintAt === null && row.text.includes('쓰러졌')) faintAt = row.t
  }
  return { rows, misses, zeroAt, faintAt, startedAt, drain: drainSpan(rows) }
}

/**
 * **게이지가 한 번 내려오는 데 걸린 시간.**
 *
 * ⚠️ 기절까지 안 가도 잴 수 있어야 한다. 한 방에 쓰러뜨리는 판을 만들려고 종과
 * 레벨을 맞추면 기술·명중·급소에 기대게 되는데, 그러면 하네스가 **못 재는 날**이
 * 생긴다. 재는 것은 「닳는 동안 다음 것이 안 왔는가」라서 기절이 필수가 아니다.
 *
 * 처음 값에서 0.02 넘게 내려간 표본을 시작으로 잡고, 값이 멎을 때까지다
 */
function drainSpan(rows) {
  if (rows.length < 3) return null
  const top = rows[0].r
  const from = rows.findIndex((x) => x.r < top - 0.02)
  if (from < 1) return null
  let to = from
  while (to + 1 < rows.length && Math.abs(rows[to + 1].r - rows[to].r) > 0.001) to++
  if (to === from) return null
  return {
    // 내려오기 **직전** 표본부터가 실제로 흐른 시간이다
    ms: rows[to].t - rows[from - 1].t,
    from: Number(rows[from - 1].r.toFixed(4)),
    to: Number(rows[to].r.toFixed(4)),
    samples: to - from + 1,
    /**
     * 한 표본 사이에 게이지가 **제일 크게** 움직인 양.
     *
     * ⚠️ 여기가 `--stall`의 본론이다. 프레임 하나를 1초 묶어도 공통 시계는
     * `MAX_STEP_MS`(100ms)만 전진하므로, 400ms짜리 이동이면 한 칸이 0.25를
     * 못 넘는다. 벽시계(CSS 전환)였다면 그 한 프레임에 통째로 끝난다
     */
    biggestStep: Number(Math.max(
      ...rows.slice(from - 1, to + 1).map((x, i, a) => (i === 0 ? 0 : Math.abs(a[i - 1].r - x.r))),
    ).toFixed(4)),
  }
}

/** 글창에 지금 떠 있는 줄 */
async function logLine(page) {
  return page.evaluate(() => document.querySelector('[class*="logText"]')?.textContent ?? '')
}

/** 등판 글에서 벗어났는가 — 기술 줄이 뜨면 재생이 도는 중이다 */
function playing(line) {
  return line !== '' && !line.includes('가랏') && !line.includes('나와라')
}

/**
 * 「싸운다 → 첫 기술」을 눌러 턴을 세운다.
 *
 * 눌러 보고 글이 바뀌었는지 **확인하고** 다음을 누른다. 화면이 도는 속도가
 * 기계마다 달라서 고정 박자로는 못 맞춘다
 */
async function startTurn(page) {
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('KeyZ')
    await page.waitForTimeout(300)
    if (playing(await logLine(page))) return true
  }
  return false
}

async function once(page, url, opts) {
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
  // ⚠️ 확인 지점의 선두가 **다친 채**일 수 있다 — 그러면 연타 판이 전멸로 끝나
  // 게이지를 못 잰다. 재는 것과 무관한 변수라 먼저 지운다
  await page.evaluate(async () => { await globalThis.pt.heal() })
  await page.waitForTimeout(800)
  await page.evaluate(async (m) => { await globalThis.pt.give(m[0], m[1], m[2]) }, MINE)
  await page.waitForTimeout(1500)
  await page.evaluate(async (f) => { await globalThis.pt.wild(f[0], f[1], f[2]) }, FOE)
  await page.waitForTimeout(9000)
  // 명령이 뜰 때까지 기다린다. ⚠️ 「그대로 싸운다」(도망 확인)와 안 헷갈리게
  // **정확히** 그 글자인 줄을 고른다
  await page.getByText('싸운다', { exact: true }).first().waitFor({ timeout: 60_000 })
  return sweep(page, opts)
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

  const stall = Number(flag('stall', '0'))
  const runs = {}
  for (const press of [false, true]) {
    const name = press ? '연타' : '가만히'
    runs[name] = await once(page, url, { press, stall, name })
  }
  // ⚠️ **깃발을 줬다고 믿지 않는다.** 실제로 어느 길로 그렸는지는 제품이
  // 내놓는 값으로 읽는다 (`pt.perf().backend`)
  const backend = await page.evaluate(() => globalThis.pt?.perf?.().backend ?? null).catch(() => null)
  await browser.close()
  vite?.child.kill()

  mkdirSync(OUT, { recursive: true })
  const out = { gpu, backend, stall, checkpoint: CHECKPOINT, mine: MINE, foe: FOE, noise, runs: {} }
  let bad = 0
  for (const [name, r] of Object.entries(runs)) {
    const drain = r.rows.map((x) => x.r)
    const mid = drain.filter((v) => v > 0.02 && v < 0.98).length
    // 중간 표본이 0이면 게이지가 **안 움직였거나 못 쟀다**. 통과로 안 친다
    const ok = r.drain !== null && mid > 0
      && (r.faintAt === null || r.zeroAt === null || r.zeroAt <= r.faintAt)
    out.runs[name] = {
      samples: r.rows.length,
      firstAt: r.rows[0]?.t ?? null,
      lastAt: r.rows[r.rows.length - 1]?.t ?? null,
      startedAt: r.startedAt,
      zeroAt: r.zeroAt,
      faintAt: r.faintAt,
      gap: r.zeroAt !== null && r.faintAt !== null ? r.faintAt - r.zeroAt : null,
      // 중간 값이 몇 개나 잡혔는가. 0과 1뿐이면 게이지가 **안 움직인** 것이다
      mid,
      drain: r.drain,
      misses: r.misses.slice(0, 40),
      // 끝난 자리의 글. 「왜 끝났는가」는 여기에 적혀 있다
      tail: r.rows.slice(-15).map((x) => [Math.round(x.t), Number(x.r.toFixed(4)), x.text.slice(0, 44)]),
      // 내려오는 동안의 실제 자취 (시각 ms · 비율)
      trace: r.rows.filter((x) => x.r < 0.999).slice(0, 60).map((x) => [Math.round(x.t), Number(x.r.toFixed(4))]),
      ok,
    }
    if (!ok) bad++
    console.log(
      `  ${ok ? '✓' : '✗'} ${name}  게이지 ${String(r.drain?.ms.toFixed(0) ?? '못 잼')}ms ` +
      `(${String(r.drain?.from ?? '-')}→${String(r.drain?.to ?? '-')}, 표본 ${String(r.drain?.samples ?? 0)}) · ` +
      `0 도달 ${String(r.zeroAt?.toFixed(0) ?? '못 잼')}ms · ` +
      `「쓰러졌다」 ${String(r.faintAt?.toFixed(0) ?? '못 잼')}ms · ` +
      `중간 표본 ${String(out.runs[name].mid)}개 / ${String(r.rows.length)}`,
    )
  }
  // ⚠️ **두 판을 견주는 것이 이 도구의 본론이다.** 연타가 게이지를 줄이면
  // 지시서 §2의 결함이 화면에 남아 있는 것이다
  const a = out.runs['연타']?.drain
  const b = out.runs['가만히']?.drain
  if (a && b) {
    const shorter = b.ms - a.ms
    // 한 프레임을 넉넉히 준다 — 이 기계의 무대는 6~20fps다
    const tol = Math.max(200, b.ms * 0.25)
    out.hammerShortens = { 연타: a.ms, 가만히: b.ms, 차: shorter, 허용: tol }
    const same = shorter <= tol
    if (!same) bad++
    console.log(`  ${same ? '✓' : '✗'} 연타가 게이지를 줄이지 않는다 — ` +
      `${a.ms.toFixed(0)}ms vs ${b.ms.toFixed(0)}ms (차 ${shorter.toFixed(0)}ms · 허용 ${tol.toFixed(0)}ms)`)
  } else {
    console.log('  ⛔ 두 판 중 하나가 게이지를 못 쟀다 — 견줄 수 없다')
    bad++
  }
  writeFileSync(resolve(OUT, 'battle-gauge.json'), JSON.stringify(out, null, 2))
  console.log(`  .audit/battle-gauge.json`)
  process.exit(bad === 0 ? 0 : 1)
}

await main()
