// 짧은 재현 — **셋째 배지 자리에서 넷째 배지까지** (지시서 JOURNEY_BADGE345 §4.4)
//
//     node tools/e2e/_veil42.mjs [--headed] [--save=.audit/journey/probe-badge3.rpsave]
//                                [--budget=5400] [--leg=road|gym|warehouse|all]
//                                [--lead=34] [--bird=34] [--url=http://…]
//
// ⚠️ **판정이 아니라 탐침이다.** 대표 구간의 통과에 안 보탠다 — 여기서 재는 것은
// 「늘리기 전에 어디가 막히는가」뿐이고, 결과는 `shots/veil42/*/실행.json`에만 남는다.
//
//   road       209 게이트 라이벌전 → 209 → 신수(라이벌 장면) → 210남 → 215 → 장막(맥실러 장면)
//   gym        장막 체육관: 샌드백 열두 번 → 자두
//   warehouse  동행 상대 → 태그 배틀 → 창고 핸섬 → **바닥의 비전머신02**
//
// ⚠️ **읽기만 한다.** 변수도 플래그도 쓰지 않고, 사람을 옮기지도 않는다. 사탕만
// 가방에 넣는다(먹이는 것은 화면) — `RARE_CANDY_20260917`의 그 규칙이다
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'
import {
  hearthomeToVeilstone, ITEM, MAP, VEILSTONE, veilstoneKicks, veilstoneWarehouse,
} from './badges.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d
const HEADED = args.includes('--headed')
const SAVE = flag('save', '.audit/journey/probe-badge3.rpsave')
const BUDGET = Number(flag('budget', '5400')) * 1000
const LEG = flag('leg', 'all')
const URL = flag('url', null)
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/veil42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

/** 자두 앞 사탕 기준 (지시서 §7 — 탐침이 바꾼다) */
const LEAD_LEVEL = Number(flag('lead', '34'))
const STARAVIA = 397
const STARAVIA_LEVEL = Number(flag('bird', '34'))
const RARE_CANDY = 50
const MEDICINE_POCKET = 1
const SUPER_POTIONS = 6

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
/** 방마다의 장치 벽 — `badges.mjs`가 제품에게 물어 넘겨 준다 (journey와 같은 자리) */
const roomWalls = new Map()

try {
  let url = URL
  if (url === null) {
    const port = await freePort()
    vite = await startVite(port, 'node_modules/.vite-veil42')
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
      const candyUp = async (slot, species, level) => {
        const party = (await api.partyState()) ?? []
        const at = slot ?? party.findIndex((one) => one.species === species)
        const mon = party[at]
        if (mon === undefined) return { ran: false, why: '먹일 마리가 없다' }
        const need = level - mon.level
        if (need <= 0) return { ran: false, why: `이미 L${String(mon.level)}` }
        const stocked = await page.evaluate(async ([pocket, item, n]) => {
          const m = await import('/src/state/saveStore.ts')
          return m.useSaveStore.getState().addItem(pocket, item, n)
        }, [MEDICINE_POCKET, RARE_CANDY, need]).catch((e) => String(e?.message ?? e))
        if (stocked !== true) return { ran: false, why: `사탕을 못 넣었다 (${String(stocked)})` }
        const fed = await api.feedCandy(at, level, Math.min(900_000, api.left()))
        return { ran: true, ...fed, from: `${String(mon.species)} L${String(mon.level)}` }
      }
      const heal = async (center, what) => {
        const party = await api.partyState()
        if (api.fullyHealed(party).ok) return
        const got = await api.healAt(center, Math.min(300_000, api.left()))
        note(`${what} 앞 회복 (센터 ${String(center)})`, got.ok ? '나았다' : String(got.why))
      }

      if (LEG === 'road' || LEG === 'all') {
        await heal(MAP.hearthomeCenter, '209번도로')
        out.road = await hearthomeToVeilstone(api, ctx)
        note('다리 D 끝', JSON.stringify({ ...await storyNow(page), vars: await api.storyVars() }))
        await page.screenshot({ path: `${OUT}/road-끝.png` })
        if (out.road.veilstone?.went !== 'arrived') { out.why = '장막시티에 못 닿았다'; return }
        const kept = await writeReport(page, 'probe-veilstone.rpsave')
        note('장막시티 리포트', kept.ok ? String(kept.file) : String(kept.why))
        await api.settle()
      }

      if (LEG === 'gym' || LEG === 'all') {
        out.gym = { candy: [] }
        out.gym.candy.push({ what: '선두', ...(await candyUp(0, null, LEAD_LEVEL)) })
        out.gym.candy.push({ what: '찌르버드', ...(await candyUp(null, STARAVIA, STARAVIA_LEVEL)) })
        note('사탕', JSON.stringify(out.gym.candy.map((c) => `${c.what} ${c.ran ? `${String(c.fed)}알 ${c.from}→L${String(c.level)}` : String(c.why)}`)))
        out.gym.potions = await api.buyAt(MAP.solaceonMart, ITEM.superPotion, SUPER_POTIONS, Math.min(300_000, api.left()))
        note(`신수 마트 좋은상처약 ${String(SUPER_POTIONS)}개`, out.gym.potions.ok ? `${String(out.gym.potions.bought)}개 샀다` : String(out.gym.potions.why))
        await heal(MAP.veilstoneCenter, '장막 체육관')
        const inside = await api.goTo(VEILSTONE.map, Math.min(600_000, api.left()))
        note('장막 체육관(133) 들어가기', inside)
        if (inside === 'arrived') {
          out.gym.kicks = await veilstoneKicks(api, ctx)
          note('샌드백', out.gym.kicks.ok === true
            ? `${String(out.gym.kicks.kicks.length)}번 차고 자두 앞에 섰다`
            : String(out.gym.kicks.why))
          if (out.gym.kicks.ok === true) {
            for (let round = 0; round < 2; round++) {
              if (round > 0) {
                await heal(MAP.veilstoneCenter, '자두 재도전')
                const back = await api.goTo(VEILSTONE.map, Math.min(600_000, api.left()))
                if (back !== 'arrived') { note('재도전', `체육관에 못 들어갔다 (${back})`); break }
                const again = await veilstoneKicks(api, ctx)
                note('재도전 샌드백', again.ok === true ? '자두 앞에 섰다' : String(again.why))
                if (again.ok !== true) break
              }
              if (out.gym.potions.ok) api.usePotions(ITEM.superPotion, '좋은상처약', 0.45, out.gym.potions.bought)
              const said = await api.talkToNpc(VEILSTONE.map, VEILSTONE.script, Math.min(300_000, api.left()))
              api.stopPotions()
              await api.settle()
              const s = await storyNow(page)
              note(`자두${round > 0 ? ' (재도전)' : ''}`, `${said ? '붙었다' : '못 걸었다'} · 배지 ${String(s.badges)} · 맵 ${String(s.map)}`
                + ` · 파티 ${JSON.stringify(s.party.map((m) => `${String(m.species)} L${String(m.level)} ${String(m.hp)}`))}`)
              if (s.badges >= 4) break
            }
          }
        }
        await page.screenshot({ path: `${OUT}/gym-끝.png` })
        const kept = await writeReport(page, 'probe-badge4.rpsave')
        note('배지 4 리포트', kept.ok ? String(kept.file) : String(kept.why))
        await api.settle()
      }

      if (LEG === 'warehouse' || LEG === 'all') {
        await heal(MAP.veilstoneCenter, '창고')
        out.warehouse = await veilstoneWarehouse(api, ctx)
        note('창고', JSON.stringify({ ...await storyNow(page), vars: await api.storyVars() }))
        await page.screenshot({ path: `${OUT}/warehouse-끝.png` })
        const kept = await writeReport(page, 'probe-warehouse.rpsave')
        note('창고 리포트', kept.ok ? String(kept.file) : String(kept.why))
      }
    },
  })
  out.trouble = drive?.trouble ?? null
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
