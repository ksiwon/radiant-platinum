// 짧은 재현 — **송별의 샘에서 명예의 전당까지** (지시서 JOURNEY_LEAGUE_20260927)
//
//     node tools/e2e/_league.mjs [--headed] [--save=.audit/journey/probe-sendoff.rpsave]
//                                [--budget=7200] [--leg=j,k,l,m] [--url=http://…]
//
// ⚠️ **판정이 아니라 탐침이다.** 결과는 `shots/league/*/실행.json`에만 남는다.
//
//   j  송별의 샘 → 모래 연구소 → 222번도로 → 물가시티(대엽 · 등대의 전진) → 톱니 체육관 → 배지 8
//   k  비전머신07 → 기술삭제사 → 폭포오르기·바위깨기 → 223번도로 → 리그 남 센터
//   l  챔피언로드 → 리그 북 센터 (라이벌전)
//   m  사천왕 넷 → 난천 → 명예의 전당 → 크레딧 → 타이틀 → 이어하기(떡잎마을 침실)
//   여럿을 쉼표로 이어 준다. 다리마다 끝에 리포트를 남기고, 못 닿으면 거기서 멈춘다
//
// ⚠️ **읽기만 한다.** 변수도 플래그도 쓰지 않는다. 사탕만 가방에 넣는다(먹이는 것은 화면)
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'
import { probePartStart, sealProbePart } from './partProbe.mjs'
import { collectConsole, resumeCheck, takeCut, watchCanvas } from './partChecks.mjs'
import { MAP, beaconToVictory, eliteFour, sendoffToBeacon, victoryRoad } from './badgesLeague.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d
const HEADED = args.includes('--headed')
/**
 * `--part=5` — **파트 5로 돈다** (`docs/orders/JOURNEY_PARTS_20261008.md` §5). 시작 세이브는 앞 파트의 끝 세이브,
 * 다리는 전부, 사탕은 파트 표의 값이다. `--save`를 같이 주면 그 세이브에서 시작하는 진단이다
 */
const PART = flag('part', null) === null ? null : probePartStart(Number(flag('part', null)), flag('save', null))
const PART_N = PART === null ? null : Number(flag('part', null))
/** 다리마다 닿았는가 — 파트 봉투의 결과 줄이 된다 */
const legsRun = {}
/** 마지막 다리가 남긴 끝 — `{ file, memory, at }` */
let partEnd = null
/** 끝 점검이 모으는 것 — 지형 컷 · 콘솔 · 이어하기 (`partChecks.mjs`). 위 `legsRun`과 함께 봉투의 결과 줄이 된다 */
const cuts = []
let noise = []
let resume = null
let toTheEnd = false
const SAVE = PART !== null ? PART.start.save : flag('save', '.audit/journey/probe-sendoff.rpsave')
const BUDGET = Number(flag('budget', '7200')) * 1000
// 파트 판은 다리 전부다. 손으로 준 세이브(진단)에서만 `--leg`로 고를 수 있다 — 빠진 다리의 줄은 BLOCKED로 남는다
const LEG = PART !== null && !PART.start.diagnostic ? 'all' : flag('leg', 'all')
const URL = flag('url', null)
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/league/${STAMP}`)
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
      /**
       * ⚠️ **리포트 화면이 닫히면 더 안 누른다** — 남은 A가 필드로 새면 앞 사람에게 말을 건다. 실측(탐침 p23): 기라티나 앞
       * (진행 13)에서 쓴 뒤 남은 A가 기라티나에게 말을 걸어 배틀이 열렸고, 자동 배틀이 쓰러뜨려 마스터볼을 못 던졌다
       */
      for (let i = 0; i < 20; i++) {
        if ((await marks(page)).menu !== 'save') break
        await tap('Space')
      }
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
    vite = await startVite(port, 'node_modules/.vite-league')
    url = vite.url
  }
  browser = await chromium.launch({ args: gpuArgs('gl'), headless: !HEADED })
  // 영상은 납품물이다 (journey와 같다) — 걷고 싸우는 것은 정지 화면으로 못 보인다. 맥락이 닫힐 때 파일이 쓰인다
  page = await browser.newPage({ viewport: { width: 960, height: 640 }, recordVideo: { dir: OUT, size: { width: 960, height: 640 } } })
  page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })
  if (PART !== null) {
    await watchCanvas(page)
    noise = collectConsole(page, { gl: true })
  }
  /** 지금 자리에서 지형 컷 하나 — 파트로 돌 때만 (다리 끝마다 · 처음 들인 자리) */
  const cutHere = async (name) => {
    if (PART === null) return
    const cut = await takeCut(page, name, { file: resolve(OUT, `컷-${name}.png`) })
    cuts.push(cut)
    console.log(`    컷 ${name} — ${cut.error ? `못 뗐다: ${cut.error}` : `지형칸 ${String(cut.canvas.filled)}/${String(cut.canvas.roi)} ${cut.canvas.drawn ? '그려졌다' : '비었다'}${cut.canvas.level ? ` → 1인칭 수평 ${cut.canvas.level.unobservable ?? `${String(cut.canvas.level.filled)}/${String(cut.canvas.level.roi)} ${cut.canvas.level.drawn ? '그려졌다' : '비었다'}`}` : ''}${cut.skyWhy ? ` (${cut.skyWhy})` : ''}`}`)
  }

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
  await cutHere('start')

  const drive = await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    totalMs: BUDGET,
    verbose: process.env.DW_VERBOSE === '1',
    skipStory: true,
    obstacles: (mapId, x, z) => roomWalls.get(mapId)?.has(`${String(x)},${String(z)}`) === true,
    after: async (api) => {
      const ctx = {
        log: (l) => { console.log(`    ${l}`) },
        setWalls: (mapId, keys) => { roomWalls.set(mapId, new Set(keys)) },
      }
      // ⚠️ 「all」은 다리 전부다 — 예전에는 `'all'.split(',')`이 어느 다리도 안 골라 빈 판으로 끝났다
      const legs = LEG === 'all' ? ['j', 'k', 'l', 'm'] : LEG.split(',')
      if (PART?.start.memory) {
        console.log(`    하네스 기억을 읽었다 — 치운 장애물 ${String(PART.start.memory.clearedObstacles?.length ?? 0)}개`)
        api.loadHarnessMemory(PART.start.memory)
      }
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
      /** 다리 하나 — 못 닿았으면 `-못닿음` 리포트를 따로 두고 멈춘다 (`_b67`과 같다) */
      const leg = async (what, file, run, reached) => {
        out[what] = await run()
        const ok = await reached()
        legsRun[what] = { reached: ok, detail: JSON.stringify({ ...await storyNow(page), ok }).slice(0, 600) }
        await cutHere(what)
        // 파트의 마지막 다리는 끝 세이브를 `part-N.rpsave`로 쓰고, 그 앞에 하네스 기억을 뜬다
        if (PART !== null && ok && what === 'm') {
          const at = await storyNow(page)
          partEnd = { file: `.audit/journey/part-${String(PART_N)}.rpsave`, memory: api.harnessMemory(), at: { ...at, badges: at.badges } }
          file = `part-${String(PART_N)}.rpsave`
        }
        await end(what, ok ? file : file.replace('.rpsave', '-못닿음.rpsave'))
        if (!ok) note(`다리 ${what}`, '못 닿았다 — 여기서 멈춘다')
        return ok
      }
      const v = async () => (await api.storyVars()) ?? {}
      ctx.screen = () => page.evaluate(() => (document.body.innerText ?? '').replace(/\s+/g, ' ')).catch(() => '')
      ctx.menuState = () => page.evaluate(async () => {
        const m = await import('/src/state/menuStore.ts')
        const st = m.useMenuStore.getState()
        return { top: st.top, summarySlot: st.summarySlot, choosingMon: st.choosingMon }
      }).catch(() => null)
      /** `--candy=80,78,78` — 다리 앞에서 가방에 사탕을 넣고 **화면으로** 먹인다 */
      const candy = flag('candy', PART !== null ? PART.def.candy : null)
      if (candy !== null) {
        const levels = candy.split(',').map(Number)
        for (let slot = 0; slot < levels.length; slot++) {
          note(`사탕 ${String(slot)}`, JSON.stringify(await ctx.candyUp(slot, null, levels[slot])))
        }
      }
      if (legs.includes('j') && !await leg('j', 'probe-badge8.rpsave', () => sendoffToBeacon(api, ctx),
        async () => ((await v()).sunyshore ?? 0) >= 2)) return
      if (legs.includes('k') && !await leg('k', 'probe-victory.rpsave', () => beaconToVictory(api, ctx),
        async () => (await api.now()).map === MAP.leagueSouthCenter)) return
      if (legs.includes('l') && !await leg('l', 'probe-league.rpsave', () => victoryRoad(api, ctx),
        async () => (await api.now()).map === MAP.leagueNorthCenter && ((await v()).rivalLeague ?? 0) >= 1)) return
      if (legs.includes('m')) {
        ctx.out = OUT
        out.m = await eliteFour(api, ctx, page)
        note('다리 m', JSON.stringify({ ok: out.m.ok, rooms: out.m.rooms, ending: out.m.ending }).slice(0, 1500))
        if (out.m.ok !== true) {
          legsRun.m = { reached: false, detail: JSON.stringify({ rooms: out.m.rooms, ending: out.m.ending }).slice(0, 600) }
          await cutHere('m')
          await end('m', 'probe-elite-못닿음.rpsave')
          return
        }
        /**
         * ⚠️ **타이틀에서 「이어하기」로 다시 든다** — 원작은 전당 뒤 리포트를 쓰고 자리를 떡잎마을 침실로 적는다
         * (`clear_game.c` · `SetPlayerStartLocation`). 들어선 자리와 깃발 2404로 그것을 잰다
         */
        const cont = page.getByRole('button', { name: '이어하기', exact: true })
        await cont.waitFor({ timeout: 120_000 })
        await cont.click()
        await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
        await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live'
          && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
        await page.waitForTimeout(2000)
        const after = await storyNow(page)
        const vv = await v()
        out.cleared = { map: after.map, tile: after.tile, gameCompleted: vv.gameCompleted, housePostgame: vv.housePostgame,
          hallOfFame: await page.evaluate(async () => {
            const m = await import('/src/state/saveStore.ts')
            const h = m.useSaveStore.getState().hallOfFame
            return h === undefined || h === null ? null : { total: h.total ?? h.entries?.length, entries: h.entries?.length, last: h.entries?.at(-1)?.pokemon?.map((p) => `${String(p.species)} L${String(p.level)}`) }
          }).catch((e) => String(e)) }
        note('이어하기 — 엔딩 뒤', JSON.stringify(out.cleared))
        /**
         * **전당에 올랐는가**를 이어하기 뒤의 자리로 잰다 — 원작은 전당 뒤 자리를 떡잎마을 침실로 적고
         * 게임 클리어 깃발을 세운다. 둘 다 맞아야 이 다리가 닿은 것이다
         */
        const cleared = out.cleared.gameCompleted === true && out.cleared.hallOfFame !== null
          && typeof out.cleared.hallOfFame === 'object'
        legsRun.m = { reached: cleared, detail: JSON.stringify(out.cleared).slice(0, 600) }
        await cutHere('m')
        if (PART !== null && cleared) {
          partEnd = { file: `.audit/journey/part-${String(PART_N)}.rpsave`, memory: api.harnessMemory(), at: after }
          await end('m', `part-${String(PART_N)}.rpsave`)
        } else await end('m', cleared ? 'probe-cleared.rpsave' : 'probe-cleared-못닿음.rpsave')
      }
    },
  })
  out.trouble = drive?.trouble ?? null
  // ⚠️ 약을 썼는지 안 적으면 다음 판에서 짐작하게 된다 (`probe-must-be-verified-too`)
  out.potions = drive?.potions ?? null
  out.battles = drive?.wild === undefined ? null : { wild: drive.wild, trainer: drive.trainer }
  out.end = await storyNow(page)
  // 끝 점검 — 마지막 다리까지 닿았으면 앱을 다시 켜 이어하기로 같은 자리에 서는지 잰다 (journey ⑭와 같다)
  if (PART !== null && legsRun.m?.reached === true) {
    resume = await resumeCheck(page, url)
    note('이어하기', JSON.stringify({ want: resume.want, got: resume.got?.player, map: resume.got?.world?.map, restoredOk: resume.restoredOk }))
  }
  toTheEnd = true
  if (out.trouble !== null && out.trouble.length > 0) note('걸린 것', JSON.stringify(out.trouble))
} catch (e) {
  out.crash = String(e?.stack ?? e?.message ?? e).slice(0, 900)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  const clip = page?.video() ?? null
  await browser?.close()
  if (clip !== null) out.video = await clip.path().catch(() => null)
  vite?.child.kill()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
if (PART !== null) {
  process.exit(sealProbePart(PART_N, PART, { legsRun, end: partEnd, crash: out.crash ?? null,
    checks: { cuts, expectCuts: ['start', ...['j', 'k', 'l', 'm']], noise, toTheEnd, resume },
    extra: { cuts, noise, probe: OUT, video: out.video ?? null, trouble: out.trouble ?? null, battles: out.battles ?? null, cleared: out.cleared ?? null } }))
}
console.log(`\n  ${OUT}`)
console.log(`  배지 ${String(out.end?.badges ?? out.atLoad?.badges ?? '?')}`)
process.exit(out.crash === undefined ? 0 : 1)
