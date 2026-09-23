// 짧은 재현 — **첫 배지 자리에서 둘째 배지까지 걸어지는가** (지시서 JOURNEY_BADGE2 §4)
//
//     node tools/e2e/_eter42.mjs [--headed] [--save=.audit/journey/end.rpsave]
//                                [--budget=3600] [--from=jubilife|eterna]
//
// ⚠️ **판정이 아니라 탐침이다.** 대표 구간의 통과에 안 보탠다 — 여기서 재는
// 것은 「늘리기 전에 어디가 막히는가」뿐이고, 결과는 `shots/eter42/*/실행.json`에만
// 남는다.
//
// 세 자리를 나눠서 잰다. 한 판이 한 시간 넘는 최종 판으로 이것을 찾지 않는다.
//
//   ① 축복시티 북쪽 (173~175, 743) — `JubilifeCity_CoordEvent_TeamGalactic`
//      (표 2의 script 4 · `VAR_JUBILIFE_CITY_STATE == 3`). 첫 배지가 그 값을
//      3으로 올려 두었고(`scripts_oreburgh_city_gym.s`), 장면이 끝나면 4다.
//      ⚠️ 태그 배틀은 우리 쪽에서 **1:1로 열린다** — 알려진 축소다
//      (`scene/fieldServices.startTagBattle`). 없는 것은 옆에 선 둘이다
//   ② 영원의 숲 — 입구 (28,85)에서 동행이 붙고(`…CHERYL_STATE == 0`),
//      북쪽 (82,34)에서 떨어진다. 붙은 뒤 남쪽 출구는 막힌다
//   ③ 영원 체육관 꽃시계 — 트레이너 셋을 **차례대로** 이겨야 길이 열린다.
//      ⚠️ **격자는 이 벽을 모른다.** 표로 미리 셈해 보면 상태 0에서 시계가
//      막는 160칸 중 **140칸을 격자는 걸을 수 있다고 한다.** 그래서 여기서는
//      제품의 `eternaBlockedAt`을 **읽어** 계획에 넘긴다(`driveStory`의 `obstacles`).
//      같은 셈으로 **뛰어넘기 없이도** 상태마다 다음 상대에게 닿는다 —
//      0→트①, 1→트②, 2→트③, 3→관장. 그 예상이 맞는지를 여기서 실측한다
//
// ⚠️ **읽기만 한다.** 변수도 플래그도 쓰지 않고, 사람을 옮기지도 않는다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const HEADED = args.includes('--headed')
const SAVE = args.find((a) => a.startsWith('--save='))?.slice(7) ?? '.audit/journey/end.rpsave'
const BUDGET = Number(args.find((a) => a.startsWith('--budget='))?.slice(9) ?? '3600') * 1000
const FROM = args.find((a) => a.startsWith('--from='))?.slice(7) ?? 'jubilife'
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/eter42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

/** 지나는 자리 */
const JUBILIFE = 3
const FLOAROMA = 426
const FOREST = 203
const ETERNA = 65
const GYM = 67
/**
 * 그 자리로 **떠나기 전에** 들를 포켓몬센터 1F.
 *
 * ⚠️ **목적지의 센터가 아니라 지금 있는 곳의 센터다.** 실측(2026-09-16):
 * 축복시티에서 꽃향기마을(426)로 떠나기 전에 **꽃향기 센터(428)**로 낫겠다고
 * 했더니, 그 센터가 목적지 안에 있어서 300초를 길에 쓰고도 못 닿았고 —
 * 그 300초는 꽃향기로 가는 걸음에서 그대로 빠졌다. 축복 센터는 6이다
 */
const CENTER = { [FLOAROMA]: 6, [FOREST]: 428, [ETERNA]: 428, [GYM]: 69 }
/** 갤럭시단 장면이 걸린 칸 (`events_jubilife_city.json` 표 2 · script 4) */
const GALACTIC = { x: 174, z: 743 }
/**
 * 체육관 사람들. **차례가 고정이다** — `VAR_ETERNA_GYM_TRAINERS_BEATEN`이
 * 1·2·3으로 올라야 다음 상대의 스크립트가 배틀로 간다
 */
const GYM_ORDER = [
  { script: 5, what: '트① 캐롤라인 (14,22)' },
  { script: 6, what: '트② 제나 (20,17)' },
  { script: 7, what: '트③ 앤젤라 (2,7)' },
  { script: 4, what: '관장 유채 (11,3)' },
]

const out = { stamp: STAMP, save: SAVE, from: FROM, steps: [], gym: [] }
const note = (what, detail) => {
  out.steps.push({ what, detail })
  console.log(`  · ${what} — ${detail}`)
}

const marks = (p) => p.evaluate(() => ({ ...document.documentElement.dataset }))

/**
 * 지금의 이야기 상태 — **제품이 내놓는 것만 읽는다**.
 *
 * 변수 번호는 `generated/vars_flags.txt`를 열거형으로 세어 낸 값이다 (줄 번호로
 * 세면 별명 줄에서 밀린다 — `engine/script/vars.ts`가 같은 자리를 적어 두었다).
 * `VAR_ETERNA_GYM_FLOWER_CLOCK_STATE = 16459` · `VAR_JUBILIFE_CITY_STATE = 16503` ·
 * `VAR_SUNYSHORE_CITY_STATE = 0x407e` 셋으로 맞춰 봤고 다 맞는다
 */
const storyNow = (p) => p.evaluate(async () => {
  const f = await import('/src/engine/script/field.ts')
  const w = await import('/src/engine/map/world.ts')
  const st = await import('/src/state/worldState.ts')
  const save = await import('/src/state/saveStore.ts')
  const v = f.fieldScripts.vars
  const pos = st.worldState.player.position
  const s = save.useSaveStore.getState()
  let badges = 0
  for (let i = 0; i < 8; i++) if ((s.badges >> i) & 1) badges += 1
  return {
    map: w.world.mapId,
    tile: { x: Math.floor(pos.x), z: Math.floor(pos.z) },
    badges,
    party: (s.party ?? []).map((m) => ({ species: m.species, level: m.level, hp: m.hp })),
    money: s.money ?? null,
    /** `VAR_JUBILIFE_CITY_STATE` — 배지 하나면 3, 갤럭시 장면이 끝나면 4 */
    jubilife: v.get(16503),
    /** `VAR_ETERNA_FOREST_FOLLOWER_CHERYL_STATE` — 0 붙기 전 · 1 동행 중 · 2 헤어짐 */
    cheryl: v.get(16561),
    /** `VAR_ETERNA_GYM_FLOWER_CLOCK_STATE` */
    clock: v.get(16459),
    /** `VAR_ETERNA_GYM_TRAINERS_BEATEN` */
    beaten: v.get(16558),
  }
})

/**
 * **제품이 지금 막고 있는 칸**을 그대로 받아 온다 (`scene/eternaGym.eternaBlockedAt`).
 *
 * ⚠️ **표를 하네스가 다시 세지 않는다.** 두 벌이 되면 언젠가 한쪽만 고쳐지고,
 * 그때 이 검사는 **게임이 아니라 제 사본**을 재게 된다
 */
const clockWalls = (p) => p.evaluate(async () => {
  const g = await import('/src/scene/eternaGym.ts')
  const list = []
  for (let z = 0; z < 32; z++) {
    for (let x = 0; x < 32; x++) if (g.eternaBlockedAt(x, z) === true) list.push(`${x},${z}`)
  }
  return list
})

/**
 * **멎은 순간의 배틀**을 그대로 적는다.
 *
 * ⚠️ **밖에서 보이는 것은 「씬이 battle이다」뿐이다.** 그 한 줄로는 「배틀이
 * 안 끝난다」와 「화면이 명령을 안 받는다」를 못 가른다 — 단계·결말·이긴 쪽·
 * 지금 화면에 뜬 단추가 있어야 갈린다
 */
const battleNow = (p) => p.evaluate(async () => {
  const b = await import('/src/state/battleStore.ts')
  const s = b.useBattleStore.getState()
  const buttons = [...document.querySelectorAll('button')]
    .map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter((t) => t !== '')
    .slice(0, 24)
  return {
    phase: s.phase, kind: s.kind, outcome: s.outcome, error: s.error ?? null,
    sceneReady: s.sceneReady, trainerId: s.trainerId,
    foeName: s.foeName, foeTrainer: s.foeTrainer,
    waitingLines: s.lines?.length ?? null,
    active: s.truth === null ? null : Object.fromEntries(
      Object.entries(s.truth.active ?? {}).map(([k, v]) => [k, v === null ? null : {
        species: v.species ?? null, hp: v.hp ?? null, fainted: v.fainted ?? null,
      }])),
    buttons,
    marks: { ...document.documentElement.dataset },
  }
})

const tap = async (key, ms = 120) => {
  await page.keyboard.press(key === 'Space' ? 'Space' : key)
  await page.waitForTimeout(ms)
}

/**
 * **화면의 그 길로** 리포트를 쓴다 — 시작 메뉴 → 리포트 → 「예」.
 *
 * 탐침을 다시 돌릴 때 무쇠에서부터 다시 걷지 않으려고 적어 둔다. 판정에는
 * 안 쓴다 — `journey.mjs`의 구간 저장과 달리 신원을 안 묶는다
 */
async function writeReport(saveAs) {
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
/** 지금 막힌 칸. 시계가 돌 때마다 갈아 끼운다 */
let walls = new Set()
const obstacles = (mapId, x, z) => mapId === GYM && walls.has(`${String(x)},${String(z)}`)

try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-eter42')
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

  out.atLoad = await storyNow(page)
  note('들인 자리', JSON.stringify(out.atLoad))

  const drive = await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    totalMs: BUDGET,
    skipStory: true,
    obstacles,
    after: async (api) => {
      /** 그 자리 앞에서 낫는다. 사람도 그렇게 한다 */
      const healBefore = async (where) => {
        const center = CENTER[where]
        if (center === undefined || api.left() <= 0) return
        const before = await api.partyState()
        if (api.fullyHealed(before).ok) return
        const got = await api.healAt(center, Math.min(300_000, api.left()))
        note(`회복 (센터 ${String(center)})`, got.ok ? '나았다' : String(got.why))
      }

      // ── ① 축복시티 북쪽 · 갤럭시단 ──────────────────────────────────────
      if (FROM === 'jubilife') {
        const came = await api.goTo(JUBILIFE, Math.min(900_000, api.left()))
        note('축복시티(3)로', `${came} · ${JSON.stringify(await marks(page))}`)
        if (came === 'arrived') {
          // 다시 돌릴 때 무쇠에서부터 걷지 않으려고 여기서 한 번 적어 둔다
          const kept = await writeReport('probe-jubilife.rpsave')
          note('축복시티에서 리포트', kept.ok ? String(kept.file) : String(kept.why))
          await api.settle()
          const before = await storyNow(page)
          const stood = await api.stepOn(JUBILIFE, GALACTIC, Math.min(300_000, api.left()))
          await api.clearTalk()
          await api.settle()
          const after = await storyNow(page)
          const fight = await battleNow(page)
          out.galactic = {
            stood, before: before.jubilife, after: after.jubilife, at: after.tile, fight,
          }
          note('(174,743)을 밟는다',
            `${stood} · 도시단계 ${String(before.jubilife)} → ${String(after.jubilife)}`
            + ` · 선 칸 ${JSON.stringify(after.tile)} · 배지 ${String(after.badges)}`)
          note('밟은 뒤 배틀', JSON.stringify(fight))
          await page.screenshot({ path: `${OUT}/갤럭시.png` })
        }

        // ── 꽃향기마을 ────────────────────────────────────────────────────
        await healBefore(FLOAROMA)
        const toFlo = await api.goTo(FLOAROMA, api.left())
        note('꽃향기마을(426)로', `${toFlo} · 지금 맵 ${String((await storyNow(page)).map)}`)
        out.floaroma = { verdict: toFlo }
        if (toFlo === 'arrived') {
          const kept = await writeReport('probe-floaroma.rpsave')
          note('꽃향기에서 리포트', kept.ok ? String(kept.file) : String(kept.why))
          await api.settle()
        }
        await healBefore(FOREST)

        // ── 영원의 숲 · 동행 ──────────────────────────────────────────────
        const beforeForest = await storyNow(page)
        const toForest = await api.goTo(FOREST, api.left())
        await api.settle()
        const inForest = await storyNow(page)
        out.forest = {
          verdict: toForest, cheryl: [beforeForest.cheryl, inForest.cheryl], at: inForest.tile,
        }
        note('영원의 숲(203)으로',
          `${toForest} · 동행 ${String(beforeForest.cheryl)} → ${String(inForest.cheryl)}`
          + ` · 칸 ${JSON.stringify(inForest.tile)}`)

        // ── 영원시티 ──────────────────────────────────────────────────────
        const toEterna = await api.goTo(ETERNA, api.left())
        await api.settle()
        const atEterna = await storyNow(page)
        out.eterna = { verdict: toEterna, cheryl: atEterna.cheryl, party: atEterna.party }
        note('영원시티(65)로', `${toEterna} · 동행 ${String(atEterna.cheryl)}`
          + ` · 파티 ${JSON.stringify(atEterna.party)} · 돈 ${String(atEterna.money)}`)
        await page.screenshot({ path: `${OUT}/영원시티.png` })
        if (toEterna !== 'arrived') { out.end = atEterna; return out }
        const kept = await writeReport('probe-eterna.rpsave')
        note('영원시티에서 리포트', kept.ok ? String(kept.file) : String(kept.why))
        await api.settle()
      }

      // ── ③ 영원 체육관 · 꽃시계 ──────────────────────────────────────────
      await healBefore(GYM)
      const toGym = await api.goTo(GYM, Math.min(600_000, api.left()))
      note('영원 체육관(67)으로', `${toGym}`)
      if (toGym !== 'arrived') {
        out.gymEntry = toGym
        out.end = await storyNow(page)
        return out
      }
      await page.screenshot({ path: `${OUT}/체육관.png` })

      for (const who of GYM_ORDER) {
        if (api.left() <= 0) { note(who.what, '시간이 다 됐다'); break }
        // **시계가 돌았으므로 벽을 다시 읽는다.** 이긴 뒤마다 표가 바뀐다
        const list = await clockWalls(page)
        walls = new Set(list)
        const before = await storyNow(page)
        note(`${who.what} 앞`,
          `시계 ${String(before.clock)} · 이긴 수 ${String(before.beaten)}`
          + ` · 막힌 칸 ${String(list.length)} · 파티 ${JSON.stringify(before.party)}`)
        const said = await api.talkToNpc(GYM, who.script, Math.min(420_000, api.left()))
        await api.clearTalk()
        await api.settle()
        const after = await storyNow(page)
        out.gym.push({
          who: who.what, said, walls: list.length,
          clock: [before.clock, after.clock], beaten: [before.beaten, after.beaten],
          badges: after.badges, party: after.party, at: after.tile,
        })
        note(`${who.what} → ${said ? '만났다' : '못 만났다'}`,
          `시계 ${String(before.clock)}→${String(after.clock)}`
          + ` · 이긴 수 ${String(before.beaten)}→${String(after.beaten)}`
          + ` · 배지 ${String(after.badges)} · 칸 ${JSON.stringify(after.tile)}`)
        await page.screenshot({ path: `${OUT}/체육관-${String(who.script)}.png` })
        if (after.badges >= 2) break
      }
      /**
       * ④ **이기고 나서 체육관을 나갈 수 있는가.**
       *
       * ⚠️ **대표 구간이 여기서 끝났다** (2026-09-23): 배지 2를 딴 뒤 맵 67의
       * (10,13)에서 90바퀴를 한 칸도 못 갔고, 그 뒤 항목이 전부 무너졌다.
       * 우리 벽 모형으로는 그 칸에서 문(11,27)까지 **닿는다** — 그러니 막은
       * 것은 우리가 모르는 무엇이다. 게임 자신에게 네 이웃을 되묻는다
       */
      const leave = await api.goTo(ETERNA, Math.min(300_000, api.left()))
      out.leave = { went: leave }
      if (leave !== 'arrived') {
        const at = await api.now().then((w) => ({ map: w.map, x: w.x, z: w.z })).catch(() => null)
        const around = []
        if (at !== null && at.x !== null) {
          for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const x = at.x + dx, z = at.z + dz
            around.push({
              at: [x, z],
              game: await api.gameBlocked?.(x, z).catch(() => null) ?? null,
              solid: await api.gameSolid?.(x + 0.5, z + 0.5).catch(() => null) ?? null,
            })
          }
        }
        out.leave = {
          went: leave, at, around,
          facing: await api.facing().catch(() => null),
          walls: (await api.eternaWalls?.().catch(() => null)) ?? null,
        }
        note('체육관에서 나가기', `${leave} · 선 자리 ${JSON.stringify(at)}`)
        note('  둘레', JSON.stringify(around))
      } else note('체육관에서 나가기', '나왔다')
      out.end = await storyNow(page)
      return out
    },
  })
  out.trouble = drive?.trouble ?? null
  out.fights = drive?.fights ?? null
  out.battles = drive?.wild === undefined ? null : { wild: drive.wild, trainer: drive.trainer }
  if (out.trouble !== null) note('걸린 것', JSON.stringify(out.trouble))
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
