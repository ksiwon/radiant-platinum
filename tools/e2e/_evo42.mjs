// 짧은 재현 — **배틀 뒤 진화도 체력을 옮기는가** (지시서 JOURNEY21_NEXT_DECISIONS §3)
//
//     node tools/e2e/_evo42.mjs [--headed] [--save=…] [--hurt=7]
//
// ⚠️ **진단이다. 대표 구간의 판정에 안 쓴다.** 사탕 진화(`_candy42`)가 됐다고
// 배틀 뒤 진화를 확인했다고 하지 않는다 — 그 길은 파티 화면이 아니라 배틀의
// 결산(`aftermath` → 진화 화면)이 연다.
//
// 재는 것 —
//
//   ① 야생 한 판을 이기면 **레벨이 오르고** 진화 화면이 열리는가
//   ② 진화 앞뒤로 종족 · 최대HP · 지금 HP가 어떻게 옮겨지는가
//      (`Pokemon_CalcStats`: 서 있는 마리는 **늘어난 최대만큼** 체력도 는다)
//   ③ 그 결과가 **리포트에 그대로 적히는가** — 쓰고 다시 들여 파티를 견준다
//
// 진화 문턱 바로 아래로 맞추는 것만 개발 모듈로 한다 (경험치·레벨·체력). 싸우는
// 것도 화면을 넘기는 것도 사람이 누르는 길 그대로다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const HEADED = args.includes('--headed')
const SAVE = args.find((a) => a.startsWith('--save='))?.slice(7) ?? '.audit/journey/seg-19.rpsave'
/** 체력을 이만큼 깎아 두고 시작한다 — 「가득」만 재면 옮기기가 안 드러난다 */
const HURT = Number(args.find((a) => a.startsWith('--hurt='))?.slice(7) ?? '7')
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/evo42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

const out = { stamp: STAMP, save: SAVE, hurt: HURT, steps: [], seen: [], verdict: 'BLOCKED_INFRA' }
const note = (what, how) => {
  out.steps.push({ what, how })
  console.log(`  ${what} → ${how}`)
}

/** 파티 한 자리의 값 — 종족 · 레벨 · 체력 · 그 종족의 최대 체력 */
const look = (page, slot) => page.evaluate(async (at) => {
  const save = await import('/src/state/saveStore.ts')
  const inst = await import('/src/engine/pokemon/instance.ts')
  const data = await import('/src/data/gameData.ts')
  const mon = save.useSaveStore.getState().party[at]
  if (!mon) return null
  const species = (await data.loadSpecies()).of(mon)
  return { species: mon.species, level: mon.level, hp: mon.hp, max: inst.maxHp(mon, species), exp: mon.exp }
}, slot)

let vite = null
let browser = null
try {
  const port = await freePort()
  vite = await startVite(port)
  browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: !HEADED })
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })
  page.setDefaultNavigationTimeout(300_000)

  const bring = async () => {
    await page.goto(vite.url, { waitUntil: 'load', timeout: 300_000 })
    await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
    await page.setInputFiles('input[type=file]', resolve(ROOT, SAVE))
    const go = page.getByRole('button', { name: '이 리포트로 이어하기' })
    await go.waitFor({ timeout: 60_000 })
    await go.click()
    await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
    await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live'
      && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
    await page.waitForTimeout(1500)
  }
  await bring()

  const first = await look(page, 0)
  if (first === null) throw new Error('파티가 비었다')
  note('들인 선두', JSON.stringify(first))

  /** 이 종족이 **레벨로** 진화하는 자리 — 표에게 묻는다 */
  const evo = await page.evaluate(async (species) => {
    const data = await import('/src/data/gameData.ts')
    const table = await data.loadSpecies()
    const one = table.get(species)
    const hit = one.evolutions.find((e) => e.method === 4) ?? null
    return hit === null ? null : { to: hit.to, level: hit.param }
  }, first.species)
  if (evo === null) throw new Error(`종족 ${String(first.species)}은 레벨로 진화하지 않는다`)
  note('진화 문턱', `L${String(evo.level)} → 종족 ${String(evo.to)}`)

  // 문턱 **바로 아래**로 맞춘다. 한 판만 이기면 오르도록 경험치도 끝까지 채운다
  const set = await page.evaluate(async ([slot, level, hurt]) => {
    const save = await import('/src/state/saveStore.ts')
    const exp = await import('/src/engine/pokemon/exp.ts')
    const inst = await import('/src/engine/pokemon/instance.ts')
    const data = await import('/src/data/gameData.ts')
    const table = await data.loadSpecies()
    const party = [...save.useSaveStore.getState().party]
    const was = party[slot]
    const species = table.of({ ...was, level })
    const grown = { ...was, level, exp: exp.expForLevel(species.growthRate, level + 1) - 1 }
    const max = inst.maxHp(grown, species)
    party[slot] = { ...grown, hp: Math.max(1, max - hurt) }
    save.useSaveStore.setState({ party })
    return true
  }, [0, evo.level - 1, HURT])
  if (set !== true) throw new Error('문턱 앞으로 못 맞췄다')
  const ready = await look(page, 0)
  note('문턱 앞', JSON.stringify(ready))

  // 파티가 어떻게 움직이는지를 **줄곧** 본다 — 진화 앞뒤 한 걸음이 여기 남는다
  const watcher = setInterval(() => {
    void (async () => {
      const one = await look(page, 0).catch(() => null)
      if (one === null) return
      const last = out.seen.at(-1)
      if (last && last.species === one.species && last.level === one.level
        && last.hp === one.hp && last.max === one.max) return
      out.seen.push({ ...one, at: Date.now() })
    })()
  }, 150)

  const where = await page.evaluate(() => Number(document.documentElement.dataset.map))
  const drive = await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    totalMs: 900_000,
    skipStory: true,
    shotDir: OUT,
    after: async (api) => {
      const fights = []
      for (let i = 0; i < 6; i++) {
        const got = await api.grindForWild(where, Math.min(240_000, api.left()))
        fights.push(got)
        await api.settle()
        const one = await look(page, 0)
        if (one !== null && one.species !== first.species) break
      }
      return { fights }
    },
  })
  clearInterval(watcher)
  out.drive = { fights: drive.extra?.fights ?? null, battles: drive.wild ?? drive.extra ?? null }
  await page.screenshot({ path: resolve(OUT, 'after.png') }).catch(() => {})

  const after = await look(page, 0)
  note('배틀 뒤', JSON.stringify(after))

  // 진화한 걸음 — 종족이 바뀐 자리. 그 **바로 앞** 표본과 견준다
  const at = out.seen.findIndex((one) => one.species === evo.to)
  const before = at > 0 ? out.seen[at - 1] : null
  const grown = at >= 0 ? out.seen[at] : null
  out.step = { before, grown }
  if (before !== null && grown !== null) {
    note('진화 앞뒤', `${String(before.species)} L${String(before.level)} ${String(before.hp)}/${String(before.max)}`
      + ` → ${String(grown.species)} L${String(grown.level)} ${String(grown.hp)}/${String(grown.max)}`)
  }

  // 리포트에 그대로 적히는가 — 쓰고 **다시 들여** 견준다
  const saveAs = resolve(OUT, 'after.rpsave')
  const wrote = await (async () => {
    const tap = async (key, hold = 80) => {
      await page.keyboard.down(key); await page.waitForTimeout(hold)
      await page.keyboard.up(key); await page.waitForTimeout(60)
    }
    await tap('KeyC')
    try {
      await page.waitForSelector('[role="radiogroup"] [role="radio"]', { timeout: 15_000 })
    } catch { return null }
    const items = () => page.evaluate(() => {
      const all = [...document.querySelectorAll('[role="radiogroup"] [role="radio"]')]
      return { n: all.length, at: all.findIndex((e) => e.getAttribute('aria-checked') === 'true') }
    })
    const first2 = await items()
    const want = first2.n - 3
    for (let i = 0; i < first2.n + 3; i++) {
      const now = await items()
      if (now.at === want) break
      await tap(now.at < want ? 'ArrowDown' : 'ArrowUp')
    }
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120_000 }).catch(() => null),
      (async () => {
        await tap('Space')
        await page.waitForTimeout(1500)
        for (let i = 0; i < 20; i++) await tap('Space')
      })(),
    ])
    if (download === null) return null
    await download.saveAs(saveAs)
    return saveAs
  })()
  note('리포트', wrote === null ? '못 썼다' : '썼다')

  let reloaded = null
  if (wrote !== null) {
    await page.goto(vite.url, { waitUntil: 'load', timeout: 300_000 })
    await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
    await page.setInputFiles('input[type=file]', saveAs)
    const go = page.getByRole('button', { name: '이 리포트로 이어하기' })
    await go.waitFor({ timeout: 60_000 })
    await go.click()
    await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
    await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live'
      && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
    await page.waitForTimeout(1500)
    reloaded = await look(page, 0)
    note('다시 들인 선두', JSON.stringify(reloaded))
  }
  out.reloaded = reloaded

  out.checks = {
    evolved: after?.species === evo.to,
    level: after?.level === evo.level,
    // 진화 한 걸음에서 **늘어난 최대만큼** 체력도 늘었다
    carried: before !== null && grown !== null
      && grown.hp - before.hp === grown.max - before.max && grown.max > before.max,
    alive: (after?.hp ?? 0) > 0,
    saved: reloaded !== null && after !== null
      && reloaded.species === after.species && reloaded.level === after.level
      && reloaded.hp === after.hp && reloaded.max === after.max,
  }
  out.verdict = Object.values(out.checks).every(Boolean) ? 'PASS' : 'FAILED_VISUAL'
  note('판정', JSON.stringify(out.checks))
} catch (e) {
  out.crash = String(e?.stack ?? e?.message ?? e).slice(0, 900)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await browser?.close().catch(() => {})
  vite?.child?.kill()
  await vite?.stop?.().catch(() => {})
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${out.verdict} · ${OUT}`)
process.exit(out.verdict === 'PASS' ? 0 : 1)
