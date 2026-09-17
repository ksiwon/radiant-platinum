// 짧은 재현 — **배틀 가방에서 볼이 나가는가** (지시서 JOURNEY_BADGE2 §3.3 (나))
//
//     node tools/e2e/_bag42.mjs [--headed]
//
// 실측(`_catch42` 3판): 볼을 **다섯 번 던졌다고 세었는데** 가방의 몬스터볼은
// **여섯 그대로**였다. 즉 누르기는 눌렀는데 볼이 안 나갔다. 어느 키가 무엇을
// 여는지 모르고 세고 있었다는 뜻이다.
//
// 그래서 여기서는 **키를 하나씩 누르고 그때마다 화면을 적는다** — 무엇이 열리고
// 무엇이 골라지는지가 눈이 아니라 목록으로 남는다. 고치지 않고 재기만 한다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const HEADED = args.includes('--headed')
const SAVE = args.find((a) => a.startsWith('--save='))?.slice(7)
  ?? '.audit/journey/probe-jubilife.rpsave'
const MAP = Number(args.find((a) => a.startsWith('--map='))?.slice(6) ?? '345')
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/bag42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

const out = { stamp: STAMP, save: SAVE, map: MAP, steps: [], trace: [] }
const note = (what, detail) => {
  out.steps.push({ what, detail })
  console.log(`  · ${what} — ${detail}`)
}

/** 화면의 칸들과 가방 속 볼 개수 */
const look = (p) => p.evaluate(async () => {
  const m = await import('/src/state/saveStore.ts')
  const s = m.useSaveStore.getState()
  return {
    balls: s.bag.flat().filter((one) => one.item <= 16).map((b) => `${b.item}×${b.count}`),
    buttons: [...document.querySelectorAll('button')]
      .map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((t) => t !== '' && !t.startsWith('FPS')),
    /** 커서가 어디 있는지 — 고른 칸에만 붙는 표시가 있으면 여기 보인다 */
    marked: [...document.querySelectorAll('[aria-checked="true"],[data-on="true"]')]
      .map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()).slice(0, 4),
    text: (document.body.innerText ?? '').replace(/\s+/g, ' ').slice(0, 200),
  }
})

let vite = null
let browser = null
let page = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-bag42')
  browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: !HEADED })
  page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })

  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
  await page.setInputFiles('input[type=file]', resolve(ROOT, SAVE))
  const bring = page.getByRole('button', { name: '이 리포트로 이어하기' })
  await bring.waitFor({ timeout: 60_000 })
  await bring.click()
  await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live'
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(1500)
  note('들인 자리', JSON.stringify((await look(page)).balls))

  await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    totalMs: 900_000,
    skipStory: true,
    after: async (api) => {
      const came = await api.goTo(MAP, Math.min(300_000, api.left()))
      note(`${String(MAP)}번 맵으로`, String(came))
      if (came !== 'arrived') return out

      await api.grindForWild(MAP, Math.min(300_000, api.left()), async () => {
        note('배틀이 열렸다', '이제 키를 하나씩 누르며 적는다')
        /** 명령 단이 뜰 때까지 넘긴다 */
        for (let i = 0; i < 40; i++) {
          const b = await look(page)
          if (b.buttons.some((t) => t.startsWith('가방'))) break
          await api.tap('Space', 100)
        }
        const keys = ['(시작)', 'ArrowDown', 'Space', 'ArrowRight', 'ArrowRight', 'Space', 'Space']
        for (const [i, key] of keys.entries()) {
          if (key !== '(시작)') await api.tap(key, 250)
          const b = await look(page)
          out.trace.push({ i, key, ...b })
          console.log(`    [${String(i)}] ${key}`)
          console.log(`        볼 ${JSON.stringify(b.balls)}`)
          console.log(`        칸 ${JSON.stringify(b.buttons.slice(0, 8))}`)
          console.log(`        글 ${b.text.slice(0, 120)}`)
          await page.screenshot({ path: `${OUT}/${String(i)}-${key}.png` })
        }
        out.after = await look(page)
        note('마친 뒤 볼', JSON.stringify(out.after.balls))
      })
      return out
    },
  })
} catch (e) {
  out.crash = String(e?.stack ?? e?.message ?? e).slice(0, 900)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await browser?.close()
  vite?.child.kill()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${OUT}`)
process.exit(out.crash === undefined ? 0 : 1)
