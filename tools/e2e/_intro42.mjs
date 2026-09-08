// 짧은 재현 — **오프닝이 왜 타이틀로 되돌아가나** (후속 지시 §3)
//
//     node tools/e2e/_intro42.mjs [--runs=5] [--headed]
//
// ⚠️ **Escape를 안 보냈다는 사실만으로는 아무 쪽도 못 지운다.** 타이틀로
// 보내는 자리는 셋이다 — `app/PlayRoute`의 Escape, `ui/menu/CreditsScreen`,
// `ui/screens/RestoreScreen`의 「타이틀로」. 어느 것이 눌렸는지는 **주소가
// 바뀐 그 순간의 호출 스택**에만 있다. 그래서 `history.pushState`를 감싸
// 스택째로 적고, 키·클릭·주소를 **한 시계 위에** 얹는다.
//
// ⚠️ **증거를 덮지 않는다.** 타이틀로 돌아가도 「시작」을 다시 누르지 않는다 —
// 다시 누르면 그 판의 자취가 새 판에 섞인다. 그 판은 거기서 실패로 적는다.
//
// ⚠️ **읽기만 한다.** 제품의 navigate도 resetSave도 바꾸지 않는다. 감싸는 것은
// 브라우저 API 하나뿐이고, 원래 함수를 그대로 부른다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { playOpening } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const HEADED = args.includes('--headed')
const RUNS = Number(args.find((a) => a.startsWith('--runs='))?.slice(7) ?? 5)
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/intro42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

/**
 * 주소·키·클릭을 한 시계 위에 적는다. 페이지가 서기 **전에** 걸어야 첫
 * navigate까지 잡는다 — `addInitScript`가 그 자리다
 */
const TRACE = `
  window.__trace = []
  const put = (kind, extra) => {
    window.__trace.push({ t: Math.round(performance.now()), kind, path: location.pathname, ...extra })
  }
  for (const name of ['pushState', 'replaceState']) {
    const orig = history[name].bind(history)
    history[name] = (...a) => {
      put('nav:' + name, {
        to: String(a[2] ?? ''),
        by: (new Error().stack ?? '').split('\\n').slice(1, 7).map((s) => s.trim()).join(' | '),
      })
      return orig(...a)
    }
  }
  window.addEventListener('popstate', () => { put('popstate', {}) })
  for (const ev of ['keydown', 'keyup']) {
    window.addEventListener(ev, (e) => { put(ev, { code: e.code, prevented: e.defaultPrevented }) }, true)
  }
  window.addEventListener('click', (e) => {
    put('click', { on: String(e.target?.textContent ?? '').replace(/\\s+/g, ' ').slice(0, 30) })
  }, true)
`

const out = { stamp: STAMP, runs: [] }

let vite = null
let browser = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-intro42')
  browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: !HEADED })

  for (let run = 0; run < RUNS; run++) {
    // ⚠️ **판마다 새 문맥이다.** 같은 문맥을 쓰면 앞 판의 저장·OPFS가 남아
    // 「새 게임」이 새 게임이 아니게 된다
    const context = await browser.newContext({ viewport: { width: 960, height: 640 } })
    await context.addInitScript(TRACE)
    const page = await context.newPage()
    const noise = []
    page.on('pageerror', (e) => { noise.push(`pageerror ${String(e.message).slice(0, 160)}`) })
    page.on('console', (m) => {
      if (m.type() === 'error') noise.push(`console ${m.text().slice(0, 160)}`)
    })
    const row = { run, noise }
    try {
      await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
      await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
      await page.getByRole('button', { name: '시작', exact: true }).click()
      row.opening = await playOpening(page)
      // ⚠️ **여기서 더 안 누른다.** 어디에 섰든 그대로 적는다
      row.path = await page.evaluate(() => location.pathname)
      row.marks = await page.evaluate(() => ({ ...document.documentElement.dataset }))
      row.verdict = row.path === '/play' ? 'PASS' : row.path === '/' ? '타이틀로 돌아갔다' : row.path
      await page.screenshot({ path: `${OUT}/${String(run)}-${row.verdict === 'PASS' ? 'ok' : 'no'}.png` })
    } catch (e) {
      row.verdict = `터졌다: ${String(e?.message ?? e).slice(0, 200)}`
    }
    row.trace = await page.evaluate(() => window.__trace ?? []).catch(() => [])
    // 주소가 바뀐 자리만 따로 뽑는다 — 여기 하나가 이 검사의 답이다
    row.navs = row.trace.filter((e) => e.kind.startsWith('nav:') || e.kind === 'popstate')
    // `/intro`를 벗어난 **뒤에** 보낸 입력. 있으면 하네스가 늦게 누른 것이다
    let leftIntro = null
    for (const e of row.trace) {
      if (e.kind.startsWith('nav:') && e.to !== '' && !e.to.endsWith('/intro') && e.path === '/intro') {
        leftIntro = e.t
        break
      }
    }
    row.lateKeys = leftIntro === null ? []
      : row.trace.filter((e) => e.t > leftIntro && (e.kind === 'keydown' || e.kind === 'click'))
        .map((e) => `${String(e.t)} ${e.kind} ${String(e.code ?? e.on ?? '')} @${e.path}`)
    console.log(`  ${String(run)}: ${row.verdict} · 주소 ${String(row.path)}`
      + ` · 주소전이 ${row.navs.map((e) => `${e.path}→${String(e.to)}`).join(' ')}`
      + ` · 늦은 입력 ${String(row.lateKeys.length)}건`)
    for (const e of row.navs) {
      if (String(e.to).endsWith('/') && e.path !== '/') console.log(`     타이틀로 보낸 자리 — ${String(e.by)}`)
    }
    out.runs.push(row)
    await context.close()
  }
} catch (e) {
  out.crash = String(e?.message ?? e).slice(0, 400)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await browser?.close()
  vite?.child.kill()
}

const good = out.runs.filter((r) => r.verdict === 'PASS').length
console.log(`\n  /play ${String(good)} / ${String(out.runs.length)}판`)
writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`  ${OUT}`)
process.exit(out.crash === undefined && good === out.runs.length && good > 0 ? 0 : 1)
