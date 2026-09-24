// 짧은 재현 — **다섯째 배지 뒤에서 일곱째 배지까지** (지시서 JOURNEY_BADGE67)
//
//     node tools/e2e/_b67.mjs [--headed] [--save=.audit/journey/probe-wake.rpsave]
//                             [--budget=7200] [--leg=a|b|c|d] [--url=http://…]
//
// ⚠️ **판정이 아니라 탐침이다.** 대표 구간의 통과에 안 보탠다 — 결과는
// `shots/b67/*/실행.json`에만 남는다.
//
//   a  들판 체육관을 나서서 → 폭발 → 213 → 입지호수근처 → 210 고라파덕 → 봉신 → 태홍(비전머신03)
//
// ⚠️ **읽기만 한다.** 변수도 플래그도 쓰지 않는다. 사탕만 가방에 넣는다(먹이는 것은 화면)
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'
import { MAP } from './badges.mjs'
import { pastoriaToCelestic } from './badges67.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d
const HEADED = args.includes('--headed')
const SAVE = flag('save', '.audit/journey/probe-wake.rpsave')
const BUDGET = Number(flag('budget', '7200')) * 1000
const LEG = flag('leg', 'all')
const URL = flag('url', null)
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/b67/${STAMP}`)
mkdirSync(OUT, { recursive: true })


const out = { stamp: STAMP, save: SAVE, leg: LEG, steps: [] }
const note = (what, detail) => {
  out.steps.push({ what, detail })
  console.log(`  · ${what} — ${detail}`)
}
const marks = (p) => p.evaluate(() => ({ ...document.documentElement.dataset }))

const storyNow = (p) => p.evaluate(async () => {
  const w = await import('/src/engine/map/world.ts')
  const st = await import('/src/state/worldState.ts')
  const save = await import('/src/state/saveStore.ts')
  const pos = st.worldState.player.position
  const s = save.useSaveStore.getState()
  let badges = 0
  for (let i = 0; i < 8; i++) if ((s.badges >> i) & 1) badges += 1
  return {
    map: w.world.mapId, tile: { x: Math.floor(pos.x), z: Math.floor(pos.z) }, badges,
    party: (s.party ?? []).map((m) => ({ species: m.species, level: m.level, hp: m.hp, moves: m.moves.map((one) => one.move) })),
    money: s.money ?? null,
  }
})

async function writeReport(page, saveAs) {
  const tap = async (key, ms2 = 120) => { await page.keyboard.press(key); await page.waitForTimeout(ms2) }
  await tap('KeyC')
  try {
    await page.waitForSelector('[role="radiogroup"] [role="radio"]', { timeout: 15_000 })
  } catch { return { ok: false, why: '시작 메뉴가 안 열렸다' } }
  const items = () => page.evaluate(() => {
    const all = [...document.querySelectorAll('[role="radiogroup"] [role="radio"]')]
    return { n: all.length, at: all.findIndex((e) => e.getAttribute('aria-checked') === 'true') }
  })
  const first = await items()
  const want = first.n - 3
  if (want < 0) return { ok: false, why: `시작 메뉴 칸이 ${String(first.n)}개뿐이다` }
  for (let i = 0; i < first.n + 3; i++) {
    const at = await items()
    if (at.at === want) break
    await tap(at.at < want ? 'ArrowDown' : 'ArrowUp')
  }
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120_000 }).catch(() => null),
    (async () => {
      await tap('Space')
      for (let i = 0; i < 30; i++) {
        if ((await marks(page)).menu === 'save') break
        await page.waitForTimeout(200)
      }
      for (let i = 0; i < 20; i++) await tap('Space')
    })(),
  ])
  if (download === null) return { ok: false, why: '백업 파일이 안 내려왔다' }
  await download.saveAs(resolve(ROOT, `.audit/journey/${saveAs}`))
  for (let i = 0; i < 8 && (await marks(page)).menu !== undefined; i++) await tap('KeyX')
  return { ok: true, file: `.audit/journey/${saveAs}` }
}

let vite = null
let browser = null
let page = null
/** 방마다의 장치 벽 — 들판은 물 높이가 바뀔 때마다 갈아 끼운다 */
const roomWalls = new Map()

try {
  let url = URL
  if (url === null) {
    const port = await freePort()
    vite = await startVite(port, 'node_modules/.vite-b67')
    url = vite.url
  }
  browser = await chromium.launch({ args: gpuArgs('gl'), headless: !HEADED })
  page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })

  await page.goto(url, { waitUntil: 'load', timeout: 600_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
  await page.setInputFiles('input[type=file]', resolve(ROOT, SAVE))
  const bring = page.getByRole('button', { name: '이 리포트로 이어하기' })
  await bring.waitFor({ timeout: 60_000 })
  await bring.click()
  await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live'
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(1500)
  out.atLoad = await storyNow(page)
  note('들인 자리', JSON.stringify(out.atLoad))

  const drive = await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    totalMs: BUDGET,
    skipStory: true,
    obstacles: (mapId, x, z) => roomWalls.get(mapId)?.has(`${String(x)},${String(z)}`) === true,
    after: async (api) => {
      const ctx = {
        log: (l) => { console.log(`    ${l}`) },
        setWalls: (mapId, keys) => { roomWalls.set(mapId, new Set(keys)) },
      }
      if (LEG === 'a') {
        out.a = await pastoriaToCelestic(api, ctx)
        note('다리 a 끝', JSON.stringify({ ...await storyNow(page), vars: await api.storyVars() }))
        await page.screenshot({ path: `${OUT}/a-끝.png` })
        const kept = await writeReport(page, 'probe-celestic.rpsave')
        note('봉신 리포트', kept.ok ? String(kept.file) : String(kept.why))
      }
    },
  })
  out.trouble = drive?.trouble ?? null
  // ⚠️ 약을 썼는지 안 적으면 다음 판에서 짐작하게 된다 (`probe-must-be-verified-too`)
  out.potions = drive?.potions ?? null
  out.battles = drive?.wild === undefined ? null : { wild: drive.wild, trainer: drive.trainer }
  out.end = await storyNow(page)
  if (out.trouble !== null && out.trouble.length > 0) note('걸린 것', JSON.stringify(out.trouble))
} catch (e) {
  out.crash = String(e?.stack ?? e?.message ?? e).slice(0, 900)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await browser?.close()
  vite?.child.kill()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${OUT}`)
console.log(`  배지 ${String(out.end?.badges ?? out.atLoad?.badges ?? '?')}`)
process.exit(out.crash === undefined ? 0 : 1)
