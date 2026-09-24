// 짧은 재현 — **다섯째 배지 뒤에서 일곱째 배지까지** (지시서 JOURNEY_BADGE67)
//
//     node tools/e2e/_b67.mjs [--headed] [--save=.audit/journey/probe-wake.rpsave]
//                             [--budget=7200] [--leg=a|b|c|d] [--url=http://…]
//
// ⚠️ **판정이 아니라 탐침이다.** 대표 구간의 통과에 안 보탠다 — 결과는
// `shots/b67/*/실행.json`에만 남는다.
//
//   wa 들판시티(`probe-pastoria.rpsave`)에서 맥실러를 이기고 곧바로 다리 a로 — 같은 판 안이라 물 높이가 산다
//   a  들판 체육관을 나서서 → 폭발 → 213 → 입지호수근처 → 210 고라파덕 → 봉신 → 태홍(비전머신03)
//   b  봉신 → 비전머신 둘 → 축복으로 날기 → 218 파도타기 → 운하 다리 라이벌
//   g6 운하 체육관 (판) → 동관
//   c  강철섬 → 도서관 → 새턴 → 마스
//   d  괴력 → 천관산 → 216·217 → 선단
//   g7 선단 체육관 (얼음) → 무청
//   여럿을 쉼표로 이어 준다 (`--leg=b,g6,c`). 다리마다 끝에 리포트를 남긴다
//
// ⚠️ **읽기만 한다.** 변수도 플래그도 쓰지 않는다. 사탕만 가방에 넣는다(먹이는 것은 화면)
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'
import { ITEM, MAP, PASTORIA, pastoriaClimb } from './badges.mjs'
import {
  BIDOOF_LINE, MOVE, canalaveGym, canalaveToLakes, celesticToCanalave, coronetToSnowpoint, keepAllButWeakest,
  pastoriaToCelestic, snowpointGym, teachTo,
} from './badges67.mjs'

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
      const legs = LEG.split(',')
      /** 사탕 — 가방에 넣는 것만 개발 모듈, 먹이는 것은 화면 (`RARE_CANDY_20260917`) */
      ctx.candyUp = async (slot, species, level) => {
        const family = species === null ? [] : [species].flat()
        const party = (await api.partyState()) ?? []
        const at = slot ?? party.findIndex((one) => family.includes(one.species))
        const mon = party[at]
        if (mon === undefined) return { ran: false, why: '먹일 마리가 없다' }
        const need = level - mon.level
        if (need <= 0) return { ran: false, why: `이미 L${String(mon.level)}` }
        const stocked = await page.evaluate(async ([n]) => {
          const m = await import('/src/state/saveStore.ts')
          return m.useSaveStore.getState().addItem(1, 50, n)
        }, [need]).catch((e) => String(e?.message ?? e))
        if (stocked !== true) return { ran: false, why: `사탕을 못 넣었다 (${String(stocked)})` }
        const fed = await api.feedCandy(at, level, Math.min(900_000, api.left()))
        return { ran: true, ...fed, from: `${String(mon.species)} L${String(mon.level)}` }
      }
      const end = async (what, file) => {
        note(`다리 ${what} 끝`, JSON.stringify({ ...await storyNow(page), vars: await api.storyVars() }).slice(0, 1500))
        await page.screenshot({ path: `${OUT}/${what}-끝.png` })
        const kept = await writeReport(page, file)
        note(`리포트 ${file}`, kept.ok ? String(kept.file) : String(kept.why))
        await api.settle()
      }
      if (legs.includes('wa')) {
        out.wake = { candy: [] }
        // ⚠️ 탐침 3판이 L47·43·43으로 졌다(1·2판은 이겼다) — 여기는 배지 5를 따는 것이 목적이 아니라
        // 그 뒤 다리를 재는 것이 목적이라 넉넉히 올리고 재도전한다
        out.wake.candy.push(await ctx.candyUp(0, null, 50))
        out.wake.candy.push(await ctx.candyUp(null, [397, 398], 46))
        out.wake.candy.push(await ctx.candyUp(2, null, 46))
        for (let round = 0; round < 3 && api.left() > 0; round++) {
          if ((await storyNow(page)).badges >= 5) break
          await api.healAt(MAP.pastoriaCenter, Math.min(300_000, api.left()))
          const inside = await api.goTo(PASTORIA.map, Math.min(600_000, api.left()))
          note(`들판 체육관 들어가기${round > 0 ? ` (재도전 ${String(round)})` : ''}`, inside)
          if (inside !== 'arrived') continue
          out.wake.climb = await pastoriaClimb(api, ctx)
          if (out.wake.climb.ok !== true) { note('물 높이', String(out.wake.climb.why)); continue }
          const said = await api.talkToNpc(PASTORIA.map, PASTORIA.script, Math.min(300_000, api.left()))
          await api.clearTalk(); await api.settle()
          note('맥실러', `${said ? '붙었다' : '못 걸었다'} · ${JSON.stringify(await storyNow(page)).slice(0, 300)}`)
        }
        void ITEM
      }
      if (legs.includes('a') || legs.includes('wa')) {
        out.a = await pastoriaToCelestic(api, ctx)
        await end('a', 'probe-celestic.rpsave')
      }
      if (legs.includes('b')) {
        out.b = await celesticToCanalave(api, ctx)
        await end('b', 'probe-canalave.rpsave')
      }
      /**
       * **진단 — 판 하나를 탈 때 무엇이 일어나나.** 첫 판까지 걸어가, 판에 오르는 걸음을
       * `--ride=hold`(옛 `stepKey`) 또는 `--ride=early`(`rideStep`)로 밟고, 3초 동안 50ms마다
       * 주인공 자리·높이·`riding`·판 움직임을 적는다
       */
      // 진단 — 괴력만 가르쳐 보고 화면 글을 그대로 적는다 (탐침 c4 「아무도 못 배웠다」)
      if (legs.includes('teach4')) {
        const party = (await api.partyState()) ?? []
        const keep = keepAllButWeakest(party, BIDOOF_LINE)
        const got = await teachTo(api, ITEM.hm04, MOVE.strength, BIDOOF_LINE, { keep })
        note('진단 괴력', JSON.stringify({ keep, ok: got.ok, why: got.why, lost: got.lost, before: got.movesBefore }))
        for (const line of got.said ?? []) note('  화면', line.slice(0, 240))
        return
      }
      if (legs.includes('dbg6')) {
        const how = flag('ride', 'hold')
        await api.healAt(MAP.canalaveCenter, Math.min(300_000, api.left()))
        note('운하 체육관 들어가기', await api.goTo(MAP.canalaveGym, Math.min(600_000, api.left())))
        const read = await api.canalavePlan({ x: 16, z: 4, floor: 3 })
        const steps = read?.plan?.steps ?? []
        const first = steps.findIndex((one) => one.ride !== null)
        for (const step of steps.slice(0, first)) {
          const at = await api.stepKey(step.key, step.want)
          if (at.scene !== 'overworld') { note('진단', `걸음 도중 ${String(at.scene)}`); break }
        }
        const ride = steps[first]
        const sample = () => page.evaluate(async () => {
          const st = await import('/src/state/worldState.ts')
          const sc = await import('/src/scene/canalaveGym.ts')
          const p = st.worldState.player
          return {
            x: +p.position.x.toFixed(2), y: +p.position.y.toFixed(2), z: +p.position.z.toFixed(2),
            vx: +p.velocity.x.toFixed(2), vz: +p.velocity.z.toFixed(2), riding: p.riding, busy: sc.canalaveBusy(),
          }
        })
        const trace = [{ t: 0, before: true, ...await sample() }]
        const t0 = Date.now()
        const job = how === 'early' ? api.rideStep(ride.key, ride.want) : api.stepKey(ride.key, ride.want)
        for (let i = 0; i < 60; i++) { trace.push({ t: Date.now() - t0, ...await sample() }); await page.waitForTimeout(50) }
        await job
        out.dbg6 = { how, ride, trace }
        note(`진단 ${how} — 판 #${String(ride.ride)} ${JSON.stringify(ride.want)} → 계획 ${JSON.stringify(ride.to)}`,
          trace.filter((_, i) => i % 3 === 0).map((r) => `${String(r.t)}ms (${String(r.x)},${String(r.y)},${String(r.z)}) v(${String(r.vx)},${String(r.vz)}) r${r.riding ? 1 : 0} b${r.busy ? 1 : 0}`).join(' | '))
      }
      if (legs.includes('g6')) {
        out.g6 = await canalaveGym(api, ctx)
        await end('g6', 'probe-badge6.rpsave')
      }
      /**
       * ⚠️ **다리가 못 닿았으면 다음 다리를 안 돈다.** 탐침 c2는 운하에서 막힌 채로 d·g7까지
       * 돌아 「천관산에서 괴력이 안 켜졌다」 같은 거짓 줄을 쌓았다. 못 닿은 자리의 리포트는
       * `-못닿음`을 붙여 따로 둔다 — 다음 판이 이어 받을 파일을 덮지 않는다
       */
      const leg = async (what, file, run, reached) => {
        out[what] = await run()
        const ok = await reached()
        await end(what, ok ? file : file.replace('.rpsave', '-못닿음.rpsave'))
        if (!ok) note(`다리 ${what}`, '못 닿았다 — 여기서 멈춘다')
        return ok
      }
      const v = async () => (await api.storyVars()) ?? {}
      if (legs.includes('c') && !await leg('c', 'probe-lakes.rpsave', () => canalaveToLakes(api, ctx),
        async () => (await v()).verityLeft === true)) return
      if (legs.includes('d') && !await leg('d', 'probe-snowpoint.rpsave', () => coronetToSnowpoint(api, ctx),
        async () => (await api.now()).map === MAP.snowpoint)) return
      if (legs.includes('g7')) {
        await leg('g7', 'probe-badge7.rpsave', () => snowpointGym(api, ctx), async () => (await v()).candiceTm === true)
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
