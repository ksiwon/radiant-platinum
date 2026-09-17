// 짧은 재현 — **이상한사탕을 화면으로 먹이는가** (`docs/orders/RARE_CANDY_20260917.md`)
//
//     node tools/e2e/_candy42.mjs [--headed] [--save=…] [--to=16] [--forget=refuse,1]
//
// `--forget`은 **기술 칸이 찼을 때** 차례로 줄 답이다 — `refuse`는 거절(「포기하겠습니까?」
// 에 예), 숫자는 그 자리의 기술을 잊는다. 목록이 다하면 첫 칸이다
//
// ⚠️ **진단이다. 대표 구간의 판정에 안 쓴다.** 구간 세이브를 들여 가방에 사탕만
// 넣고(개발 모듈), 먹이는 것은 `drive.feedCandy` — 사람이 누르는 길이다.
//
// 재는 것 —
//
//   ① 찌르꼬의 레벨이 한 알에 **하나씩** 오르는가 (파티로 잰다)
//   ② 사탕이 **먹인 만큼** 줄었는가
//   ③ L9에서 날개치기(17)를 배우는가 · L14에서 찌르버드(397)가 되는가
//   ④ 화면에 레벨 글 · 능력치 창이 떴는가 — 차례마다 찍어 둔다
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const HEADED = args.includes('--headed')
const SAVE = args.find((a) => a.startsWith('--save='))?.slice(7) ?? '.audit/journey/seg-21.rpsave'
const TO = Number(args.find((a) => a.startsWith('--to='))?.slice(5) ?? '16')
const FORGET = (args.find((a) => a.startsWith('--forget='))?.slice(9) ?? '')
  .split(',').filter((one) => one !== '').map((one) => (one === 'refuse' ? 'refuse' : Number(one)))
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/candy42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

const CANDY = 50
const STARLY = 396
const out = { stamp: STAMP, save: SAVE, to: TO, steps: [], shots: [] }
const note = (what, detail) => {
  out.steps.push({ what, detail })
  console.log(`  · ${what} — ${detail}`)
}

const look = (p) => p.evaluate(async () => {
  const m = await import('/src/state/saveStore.ts')
  const s = m.useSaveStore.getState()
  return {
    party: s.party.map((one) => ({
      species: one.species, level: one.level, hp: one.hp, exp: one.exp,
      friendship: one.friendship, moves: one.moves.map((x) => x.move),
    })),
    candy: s.bag.flat().filter((one) => one.item === 50).reduce((n, one) => n + one.count, 0),
  }
})

let vite = null
let browser = null
let page = null
try {
  const port = await freePort()
  vite = await startVite(port)
  browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: !HEADED })
  page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })
  page.setDefaultNavigationTimeout(300_000)

  await page.goto(vite.url, { waitUntil: 'load', timeout: 300_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
  await page.setInputFiles('input[type=file]', resolve(ROOT, SAVE))
  const bring = page.getByRole('button', { name: '이 리포트로 이어하기' })
  await bring.waitFor({ timeout: 60_000 })
  await bring.click()
  await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live'
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(1500)

  const first = await look(page)
  const slot = first.party.findIndex((one) => one.species === STARLY)
  note('들인 파티', JSON.stringify(first.party.map((one) => `${String(one.species)}L${String(one.level)}`)))
  if (slot < 0) throw new Error('파티에 찌르꼬가 없다')
  const need = TO - first.party[slot].level
  // 넣는 것만 개발 모듈로 한다
  await page.evaluate(async ([item, n]) => {
    const m = await import('/src/state/saveStore.ts')
    m.useSaveStore.getState().addItem(1, item, n)
  }, [CANDY, need])
  const stocked = await look(page)
  note('넣은 사탕', `${String(need)} → 가방 ${String(stocked.candy)}`)

  // 화면을 차례마다 찍는다 — 레벨 글과 능력치 창이 떴는지 눈으로 본다
  let shotN = 0
  const shooter = setInterval(() => {
    void (async () => {
      const mark = await page.evaluate(() => ({
        menu: document.documentElement.dataset.menu ?? null,
        panel: document.querySelector('[data-level-panel]')?.getAttribute('data-level-panel') ?? null,
      })).catch(() => null)
      if (mark === null || mark.menu === null) return
      const key = `${mark.menu}-${mark.panel ?? '-'}`
      if (out.shots.at(-1)?.key === key) return
      const file = `${String(shotN++).padStart(2, '0')}-${key}.png`
      out.shots.push({ key, file })
      await page.screenshot({ path: `${OUT}/${file}` }).catch(() => {})
    })()
  }, 200)

  const result = await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    totalMs: 900_000,
    skipStory: true,
    after: async (api) => api.feedCandy(slot, TO, 900_000, { forget: FORGET }),
  })
  clearInterval(shooter)
  out.fed = result?.extra ?? result
  const last = await look(page)
  out.before = first.party[slot]
  out.after = last.party[slot]
  out.candyLeft = last.candy
  note('먹인 뒤', JSON.stringify(last.party[slot]))
  note('남은 사탕', String(last.candy))
  out.checks = {
    level: last.party[slot].level === TO,
    candySpent: stocked.candy - last.candy === TO - first.party[slot].level,
    wingAttack: last.party[slot].moves.includes(17),
    evolved: TO < 14 || last.party[slot].species === 397,
    // 진화도 늘어난 최대 체력만큼 체력을 더한다 — 가득이던 마리는 가득이다
    fullHp: last.party[slot].hp === (await page.evaluate(async (at) => {
      const m = await import('/src/state/saveStore.ts')
      const inst = await import('/src/engine/pokemon/instance.ts')
      const data = await import('/src/data/gameData.ts')
      const mon = m.useSaveStore.getState().party[at]
      return inst.maxHp(mon, (await data.loadSpecies()).of(mon))
    }, slot)),
    panelSeen: out.shots.some((one) => one.key === 'party-gain') && out.shots.some((one) => one.key === 'party-value'),
  }
  /**
   * **칸이 찼을 때의 갈래** — 거절하면 그 기술은 안 들어가고, 갈아 끼우면 그 자리의
   * 것이 사라진다. 물음마다 무엇으로 답했는지는 `fed.asks`에 있다
   */
  if (FORGET.length > 0) {
    out.moves = { before: first.party[slot].moves, after: last.party[slot].moves }
    out.asks = out.fed?.asks ?? []
    out.checks.asked = out.asks.length >= FORGET.length
    // 네 칸을 넘지 않는다 — 거절도 갈아 끼우기도 칸을 늘리지 않는다
    out.checks.fourMoves = last.party[slot].moves.length === 4
    // 롬의 두 글이 실제로 떴는가 — 「깨끗이 잊었다」(60) · 「배우지 않았다」
    const said = (out.fed?.said ?? []).join(' ')
    out.checks.forgotLine = !FORGET.includes('refuse') || said.includes('포기')
      || said.includes('배우지 않았다')
    out.checks.learnedLine = !FORGET.some((one) => typeof one === 'number') || said.includes('잊었다')
  }
  note('판정', JSON.stringify(out.checks))
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
