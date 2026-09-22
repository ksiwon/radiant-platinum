// 짧은 재현 — **둘째 배지 자리에서 셋째 배지까지 걸어지는가** (지시서 JOURNEY_BADGE3 §4)
//
//     node tools/e2e/_cut42.mjs [--headed] [--save=.audit/journey/end.rpsave]
//                               [--budget=3600] [--leg=a|b|c|all] [--url=http://…]
//
// ⚠️ **판정이 아니라 탐침이다.** 대표 구간의 통과에 안 보탠다 — 여기서 재는 것은
// 「늘리기 전에 어디가 막히는가」뿐이고, 결과는 `shots/cut42/*/실행.json`에만 남는다.
//
//   a  영원시티: 태홍 → 난천(베어가르기) → 나무 → 빌딩 4층 쥬피터 → 자전거 → 탐사세트
//   b  자전거 타기 → 206 게이트 → 207 장면 → 천관산 태홍 → 208 → 연고시티
//   c  연고 체육관: 답을 읽어 문 둘 → 트레이너 여섯 → 멜리사
//
// 다리마다 끝에 리포트를 써 둔다 (`.audit/journey/probe-*.rpsave`) — 다음 다리를
// 그 자리에서 다시 시작하려고. 판정에는 안 쓴다.
//
// ⚠️ **읽기만 한다.** 변수도 플래그도 쓰지 않고, 사람을 옮기지도 않는다. 사탕만
// 가방에 넣는다(먹이는 것은 화면) — `RARE_CANDY_20260917`의 그 규칙이다
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'
import { eternaToBike, FANTINA, hearthomeDoors, ITEM, MAP, rideToHearthome } from './badges.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d
const HEADED = args.includes('--headed')
const SAVE = flag('save', '.audit/journey/end.rpsave')
const BUDGET = Number(flag('budget', '3600')) * 1000
const LEG = flag('leg', 'all')
const URL = flag('url', null)
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/cut42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

/** 사탕 기준 (지시서 §3.7 시작값 — 탐침이 정한다) */
const LEAD_LEVEL = Number(flag('lead', '30'))
const STARAVIA = 397
const STARAVIA_LEVEL = Number(flag('bird', '26'))
/** 쥬피터 앞 기준 (실측으로 정한다 — 멜리사 앞 값보다 낮게 둔다) */
const JUPITER_LEAD = Number(flag('jlead', '28'))
const JUPITER_BIRD = Number(flag('jbird', '24'))
const RARE_CANDY = 50
const MEDICINE_POCKET = 1

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

try {
  let url = URL
  if (url === null) {
    const port = await freePort()
    vite = await startVite(port, 'node_modules/.vite-cut42')
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
    after: async (api) => {
      const ctx = { log: (l) => { console.log(`    ${l}`) } }
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

      if (LEG === 'a' || LEG === 'all') {
        await heal(MAP.eternaCenter, '영원시티')
        /**
         * **쥬피터 앞 사탕** — 붙기 직전에 한 번.
         *
         * ⚠️ 실측(2026-09-22 다리 a 3판): 배지 2에서 이어받은 파티
         * (수풀부기 L26 · 찌르버드 L16 · 비버니 L4)로는 **쥬피터에게 진다.**
         * 주뱃은 독/비행이라 풀이 ¼이고 스컹탱크는 독/악이라 풀 ½·물기 ½다 —
         * 선두의 주력이 둘 다 안 박힌다. 실제로 박히는 것은 찌르버드의 비행인데
         * L16이라 L21·L23을 못 버틴다.
         *
         * 값은 `--jlead`·`--jbird`로 바꾼다. 멜리사 앞 값(§7의 L30·L26)보다
         * **낮게** 둔다 — 여기서 넘겨 버리면 그 표가 뜻을 잃는다
         */
        out.a = await eternaToBike(api, ctx, {
          beforeJupiter: async () => [
            { what: '선두', ...(await candyUp(0, null, JUPITER_LEAD)) },
            { what: '찌르버드', ...(await candyUp(null, STARAVIA, JUPITER_BIRD)) },
          ],
        })
        note('다리 A 끝', JSON.stringify({ ...await storyNow(page), why: out.a.why ?? null }))
        await page.screenshot({ path: `${OUT}/a-끝.png` })
        if (out.a.why || out.a.bike !== true || out.a.kit !== true) { out.a.why = out.a.why ?? '자전거·탐사세트가 없다'; return }
        // 떠나기 전에 스프레이를 더 산다 (영원 마트 66) — 뒤의 세 바깥 길에 뿌린다
        out.a.repels = await api.buyAt(MAP.eternaMart, ITEM.repel, 4, Math.min(300_000, api.left()))
        note('영원 마트 스프레이 4개', out.a.repels.ok ? `${String(out.a.repels.bought)}개 샀다` : String(out.a.repels.why))
        const kept = await writeReport(page, 'probe-bike.rpsave')
        note('자전거 자리 리포트', kept.ok ? String(kept.file) : String(kept.why))
        await api.settle()
      }
      if (LEG === 'b' || LEG === 'all') {
        await heal(MAP.eternaCenter, '자전거길')
        out.b = await rideToHearthome(api, ctx)
        note('다리 B 끝', JSON.stringify(await storyNow(page)))
        await page.screenshot({ path: `${OUT}/b-끝.png` })
        if (out.b.hearthome?.went !== 'arrived') return
        const kept = await writeReport(page, 'probe-hearthome.rpsave')
        note('연고시티 리포트', kept.ok ? String(kept.file) : String(kept.why))
        await api.settle()
      }
      if (LEG === 'c' || LEG === 'all') {
        await heal(MAP.hearthomeCenter, '연고 체육관')
        out.c = { candy: [] }
        out.c.candy.push({ what: '선두', ...(await candyUp(0, null, LEAD_LEVEL)) })
        out.c.candy.push({ what: '찌르버드', ...(await candyUp(null, STARAVIA, STARAVIA_LEVEL)) })
        note('사탕', JSON.stringify(out.c.candy.map((c) => `${c.what} ${c.ran ? `${String(c.fed)}알 ${c.from}→L${String(c.level)}` : String(c.why)}`)))
        out.c.potions = await api.buyAt(MAP.hearthomeMart, ITEM.superPotion, 4, Math.min(300_000, api.left()))
        note('연고 마트 좋은상처약 4개', out.c.potions.ok ? `${String(out.c.potions.bought)}개 샀다` : String(out.c.potions.why))
        await heal(MAP.hearthomeCenter, '체육관 문')
        out.c.doors = await hearthomeDoors(api, ctx)
        note('문 고르기', JSON.stringify({ at: out.c.doors.at, bounced: out.c.doors.bounced, why: out.c.doors.why ?? null }))
        if (out.c.doors.ok) {
          for (let round = 0; round < 2; round++) {
            if (round > 0) {
              await heal(MAP.hearthomeCenter, '멜리사 재도전')
              const again = await hearthomeDoors(api, ctx)
              note('재도전 문 고르기', JSON.stringify({ at: again.at, bounced: again.bounced }))
              if (!again.ok) break
            }
            if (out.c.potions.ok) api.usePotions(ITEM.superPotion, '좋은상처약', 0.45, out.c.potions.bought)
            const said = await api.talkToNpc(FANTINA.map, FANTINA.script, Math.min(300_000, api.left()))
            api.stopPotions()
            await api.settle()
            const s = await storyNow(page)
            note(`멜리사${round > 0 ? ' (재도전)' : ''}`, `${said ? '붙었다' : '못 걸었다'} · 배지 ${String(s.badges)} · 파티 ${JSON.stringify(s.party.map((m) => `${String(m.species)} L${String(m.level)} ${String(m.hp)}`))} · 맵 ${String(s.map)}`)
            if (s.badges >= 3) break
          }
        }
        await page.screenshot({ path: `${OUT}/c-끝.png` })
        const kept = await writeReport(page, 'probe-badge3.rpsave')
        note('배지 3 리포트', kept.ok ? String(kept.file) : String(kept.why))
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
