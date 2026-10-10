// 송별의 샘 → 배지 8 → 챔피언로드 → 사천왕 → 챔피언 → 명예의 전당 (지시서 JOURNEY_LEAGUE_20260927)
//
// 다리 넷이다 — ① 연구소 → 물가시티(대엽 · 등대의 전진) → 톱니 체육관 → 배지 8 ② 비전머신07 → 기술삭제사 →
// 폭포오르기·바위깨기 → 223번도로 → 리그 남 ③ 챔피언로드 → 리그 북 센터(라이벌전) ④ 사천왕 넷 → 난천 →
// 명예의 전당 → 크레딧 → 타이틀. 번호와 자리는 전부 롬에서 읽었다(지시서 §1~§3 — 근거는 `raw/decomp`의
// 스크립트 줄 번호).
//
// ⚠️ **측정 규칙은 앞 다리들과 같다** — 방향키/A/B만, `vars`·`flags`·`bag`은 읽기만, 사탕은 가방에
// 넣는 것만 개발 모듈이고 먹이는 것은 화면이다(`journey-levels-by-candy`).
import { ITEM as ITEM_BASE, MAP as MAP_BASE, boardWarp } from './badges.mjs'
import {
  BIDOOF_LINE, MOVE, STARLY_LINE, faceAndTalk, keepAllButWeakest, sprayBest, teachTo, via,
} from './badges67.mjs'
import { gridOf, matrixOf, npcsOf, triggersOn } from './route.mjs'
import { solvePush } from './pushSolve.mjs'

/** 맵 번호 (`generated/map_headers.txt` 줄 − 1) — 지시서 §2 */
export const MAP = {
  ...MAP_BASE,
  sendoffSpring: 267, sandgem: 418, sandgemLab: 422,
  route222: 395, gate222: 398, sunyshore: 150, sunyshoreCenter: 151, sunyshoreMart: 153,
  lighthouse: 164, lighthouseLift: 516,
  sunyshoreGym1: 154, sunyshoreGym2: 155, sunyshoreGym3: 156,
  canalaveEastHouse: 42,
  route223: 468, league: 172, leagueSouthCenter: 173, leagueNorthCenter: 175,
  victory1F: 244, victory2F: 245, victoryB1F: 246,
  liftAaron: 176, aaron: 177, liftBertha: 178, bertha: 179, liftFlint: 180, flint: 181,
  liftLucian: 182, lucian: 183, liftChampion: 184, champion: 185, hallway: 186, hallOfFame: 187,
  playerHouse2F: 415,
}

/** 도구 번호 (`generated/items.txt` 줄 − 1) */
export const ITEM = { ...ITEM_BASE, hm06: 425, hm07: 426, tm57: 384 }

/** 고급상처약을 쓰기 시작하는 체력 비 — `journey`의 `POTION_FLOOR`와 같은 값 */
const POTION_FLOOR = 0.45

// ── 자리 (좌표는 `events_*.json` 그대로 · 지시서 §3) ─────────────────────────
/** 등대 꼭대기의 전진 (6,4) — 말 걸면 체육관으로 돌아간다 (`FLAG_VOLKNER_RETURNED_TO_GYM`) */
const LIGHTHOUSE_VOLKNER = { x: 6, z: 4 }
/** 등대 승강기 문 — 물가시티 (886,790) · 등대 (6,9). 둘 다 승강기 방 516으로 든다 */
const LIGHTHOUSE_DOOR = { x: 886, z: 790 }
const LIGHTHOUSE_STAIRS = { x: 6, z: 9 }
/** 체육관 문 앞을 막은 대엽 (845,748) — 전진이 돌아간 뒤 말 걸면 비킨다 */
const SUNYSHORE_FLINT = { x: 845, z: 748 }
/** 북쪽 바닷가 복도의 라이벌·귤 좌표 (853~857,743) — 상태 2(배지 8 뒤)에서 비전머신07 */
const SUNYSHORE_JASMINE = { x: 855, z: 743 }
/** 운하시티 동쪽 집의 기술삭제사 (2,6) — 앞 칸 (2,7)에서 북쪽을 보고 말 건다 */
const MOVE_DELETER_FRONT = { x: 2, z: 7 }
/** 전진 (11,3) — 셋째 방 (11,4)에서 북쪽을 보고 말을 건다 */
const VOLKNER = { x: 11, z: 3 }
const VOLKNER_FRONT = { x: 11, z: 4 }
/** 톱니 방마다의 목표 칸 — 다음 방 계단 · 전진 앞 */
const GEAR_GOAL = [[[8, 2]], [[9, 2]], [[VOLKNER_FRONT.x, VOLKNER_FRONT.z]]]
/** 방 입구 — 되돌아 나갈 때의 목표 (`SUNYSHORE_ENTRY`의 입구 z) */
const GEAR_ENTRY = [[[8, 14]], [[9, 21]], [[11, 25]]]
/**
 * 단추 스크립트 번호 → 단추 종류 (`scripts_sunyshore_city_gym_room_{1,2,3}.s`의 항목 차례 ·
 * `SUNYSHORE_BUTTON` 보통 0 · 거꾸로 1 · 두 배 2). 칸은 구운 좌표 이벤트에서 읽는다
 */
const GEAR_BUTTON_OF = [{ 2: 0 }, { 2: 0, 3: 1 }, { 2: 0, 3: 2 }]
const GEAR_MAPS = [154, 155, 156]

const noteOf = (out, ctx) => (what, detail) => {
  out.steps.push({ what, detail })
  ctx.log(`  ${what} → ${detail}`)
}

/** 가방에 그 도구가 있나 */
const have = async (api, item) => ((await api.bagState())?.items ?? []).some((one) => one.item === item && one.count > 0)

/** 맵이 `ok`를 만족할 때까지 기다린다 — 스크립트 워프가 격자를 받는 동안 */
/**
 * **장면이 끝나 이야기 값이 바뀔 때까지 대사를 넘기며 기다린다.** `ok(v)`가 참이면 그 값을, 끝내 아니면 마지막 값을 낸다.
 *
 * ⚠️ **들어선 순간·말 건 순간에는 장면이 아직 안 열렸을 수 있다** — 인물이 걸어 들어오는 동안은 대사도 스크립트도
 * 안 보여 `settle`이 곧바로 돌아온다. 실측(2026-10-10 P5 진단 · d595b69): 연구소에 들어서자마자 재서 「입지 막음 풀림
 * 0」으로 다리를 잃었고, 그 뒤에 「마박사: 돌아왔는가!」 창이 떴다. 예지호수(P4)에서도 같았다
 */
async function sceneUntil(api, ok, ms = 30_000) {
  let v = {}
  for (const till = Date.now() + ms; ;) {
    await api.clearTalk(); await api.settle()
    v = (await api.storyVars()) ?? {}
    if (ok(v) || Date.now() >= till) return v
    await new Promise((r) => { setTimeout(r, 1000) })
  }
}

async function untilMap(api, ok, ms) {
  const till = Date.now() + ms
  while (Date.now() < till) {
    if (ok((await api.now()).map)) return true
    await new Promise((r) => { setTimeout(r, 500) })
  }
  return false
}

/**
 * 회복 · 사탕 · 약 켜기 — 다리마다 싸움 앞에서 한 번 (`badgesDW`의 `prepare`와 같다).
 */
async function prepare(api, ctx, note, { center, nurse = 1, levels, what }) {
  const heal = await api.healAt(center, Math.min(300_000, api.left()), nurse)
  note(`${what} 회복`, heal.ok ? '나았다' : String(heal.why))
  if (ctx.candyUp && levels) {
    const candy = [
      { what: '선두', ...await ctx.candyUp(0, null, levels.lead) },
      { what: '찌르호크', ...await ctx.candyUp(null, STARLY_LINE, levels.bird) },
      { what: '비버통', ...await ctx.candyUp(null, BIDOOF_LINE, levels.third) },
    ]
    note(`${what} 사탕`, JSON.stringify(candy.map((c) => `${c.what} ${c.ran ? `${String(c.fed)}알 → ${c.to ?? `L${String(c.level)}`}` : String(c.why)}`)))
  }
  const bag = await api.bagState()
  const potions = (bag?.items ?? []).find((one) => one.item === ITEM.hyperPotion)?.count ?? 0
  if (potions > 0) api.usePotions(ITEM.hyperPotion, '고급상처약', POTION_FLOOR, potions)
}

// ── 톱니 체육관 (지시서 §3.1 ⑥) ─────────────────────────────────────────────

/** 그 방의 단추 — 구운 좌표 이벤트 칸 + 스크립트 번호로 고른 단추 종류 */
function gearButtons(room) {
  return triggersOn(GEAR_MAPS[room])
    .filter((t) => GEAR_BUTTON_OF[room][t.script] !== undefined)
    .map((t) => ({ x: t.x, z: t.z, button: GEAR_BUTTON_OF[room][t.script] }))
}

/**
 * **톱니 방 하나를 건넌다** — 제품 표로 푼 계획(`sunyshorePlan`)을 한 칸씩 밟고, 단추를 밟으면 톱니가
 * 다 돌 때까지 기다린다. 트레이너가 붙으면 싸우고 다시 푼다(사람 자리가 바뀐다).
 *
 * @param goals 방마다의 목표 칸 — 앞으로 가면 `GEAR_GOAL`, 되돌아 나가면 `GEAR_ENTRY`
 */
export async function gearClimb(api, ctx, { rounds = 40, goals = GEAR_GOAL, until = 2 } = {}) {
  const t0 = Date.now()
  const out = { rooms: [], replans: 0, presses: 0 }
  const note = (what, detail) => { ctx.log(`  ${what} → ${detail}`) }
  for (let i = 0; i < rounds && api.left() > 0; i++) {
    const here = await api.now()
    const room = GEAR_MAPS.indexOf(here.map)
    if (room < 0) { out.why = `체육관 밖이다 (맵 ${String(here.map)})`; break }
    const goal = goals[room]
    if (room === until && goal.some(([x, z]) => x === here.x && z === here.z)) {
      out.ok = true
      break
    }
    const read = await api.sunyshorePlan({ goal, buttons: gearButtons(room) })
    if (read === null || read.plan === null) {
      out.why = read === null ? '물가 풀이를 못 돌렸다'
        : `${String(room + 1)}번 방 (${String(here.x)},${String(here.z)}) 상태 ${String(read.state)}에서 목표로 가는 길이 없다`
      out.stuck = read
      break
    }
    out.replans++
    for (const step of read.plan.steps) {
      const at = await api.stepKey(step.key, step.want)
      if (at === null) break
      if (at.scene === 'battle') { await api.fightThrough(); await api.settle(); break }
      if (at.map !== here.map) { out.rooms.push({ room, to: at.map }); note(`톱니 ${String(room + 1)}번 방`, `→ 맵 ${String(at.map)}`); break }
      if (at.talk || at.scene !== 'overworld') { await api.clearTalk(); await api.settle(); break }
      if (at.x !== step.want.x || at.z !== step.want.z) {
        note(`걸음 ${step.key} (${String(step.want.x)},${String(step.want.z)})`, `계획과 다른 칸 (${String(at.x)},${String(at.z)}) — 다시 푼다`)
        break
      }
      if (step.press !== null) {
        // 톱니가 다 돌 때까지 — 도는 동안은 스크립트가 주인공을 묶는다
        let st = null
        for (let k = 0; k < 60; k++) {
          await api.settle()
          st = await api.sunyshoreState()
          if (st !== null && st.busy !== true) break
        }
        out.presses++
        note(`단추 (${String(step.want.x)},${String(step.want.z)})`, `회전 상태 → ${String(st?.state)} (계획 ${String(step.state)})`)
        if (st?.state !== step.state) break
      }
    }
  }
  if (out.ok !== true && out.why === undefined) out.why = `${String(rounds)}바퀴 안에 못 건넜다`
  out.ms = Date.now() - t0
  return out
}

/**
 * **여덟째 배지** — 톱니 셋을 건너 전진에게. 지면 회복하고 처음부터 다시(방은 입구로 들면 0에서 시작한다).
 * 이겼는지는 `sunyshore` 2(배지와 함께 선다)로 본다
 */
export async function sunyshoreGym(api, ctx, { tries = 3 } = {}) {
  const out = { rounds: [] }
  const note = (what, detail) => { ctx.log(`  ${what} → ${detail}`) }
  for (let round = 0; round < tries && api.left() > 0; round++) {
    if (GEAR_MAPS.includes((await api.now()).map)) {
      const back = await gearClimb(api, ctx, { goals: GEAR_ENTRY, until: 0 })
      note('물가 체육관 입구로', back.ok === true ? '나왔다' : String(back.why))
    }
    await prepare(api, ctx, note, { center: MAP.sunyshoreCenter, levels: null, what: `물가 체육관${round > 0 ? ` 재도전 ${String(round)}` : ''} 앞` })
    const inside = await api.goTo(MAP.sunyshoreGym1, Math.min(600_000, api.left()))
    note('물가 체육관(154) 들어가기', inside)
    if (inside !== 'arrived') { out.rounds.push({ inside }); continue }
    const climb = await gearClimb(api, ctx)
    if (climb.ok !== true) { out.rounds.push({ climb }); note('톱니', String(climb.why)); continue }
    await faceAndTalk(api, VOLKNER_FRONT, VOLKNER)
    const party = await api.partyState()
    const state = (await api.storyVars())?.sunyshore ?? null
    out.rounds.push({ climb: { presses: climb.presses, replans: climb.replans }, sunyshore: state,
      party: party?.map((m) => `${String(m.species)} L${String(m.level)} ${String(m.hp)}`) })
    note(`전진${round > 0 ? ' (재도전)' : ''}`, `물가 상태 ${String(state)}`)
    if ((state ?? 0) >= 2) { out.ok = true; return out }
  }
  return out
}

// ── ① 송별의 샘 → 배지 8 (지시서 §3.1) ───────────────────────────────────────

/**
 * **다리 J** — 모래시티 연구소(입지호수근처 막음을 푼다) → 장막시티로 날아 214번도로 → 입지호수근처 →
 * 222번도로 → 물가시티(대엽 장면) → 길잡이등대의 전진 → 대엽이 문에서 비킨다 → 톱니 체육관 → 배지 8.
 *
 * ⚠️ **연구소를 안 들르면 222번도로가 영영 막힌다** — 막음을 푸는 줄이 롬 전체에 그 장면 하나다(지시서 §2)
 */
export async function sendoffToBeacon(api, ctx, { levels = null, potions = 20 } = {}) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = noteOf(out, ctx)
  const done = () => { out.ms = Date.now() - t0; return out }
  const vars = async () => (await api.storyVars()) ?? {}

  let v = await vars()
  if ((v.sandgemLab ?? 0) < 3) {
    const fly = await api.flyTo(MAP.sandgem, Math.min(120_000, api.left()))
    note('공중날기 → 모래시티', fly.ok ? '닿았다' : String(fly.why))
    const lab = await api.goTo(MAP.sandgemLab, Math.min(600_000, api.left()))
    v = await sceneUntil(api, (x) => (x.valorOpen ?? 0) >= 1, 60_000)
    note('연구소(422) — 마박사 장면', `${lab} · 연구소 상태 ${String(v.sandgemLab)} · 입지 막음 풀림 ${String(v.valorOpen)}`)
    if ((v.valorOpen ?? 0) < 1) return done()
  }

  if ((v.sunyshore ?? 0) < 1) {
    const fly = await api.flyTo(MAP.veilstone, Math.min(120_000, api.left()))
    note('공중날기 → 장막시티', fly.ok ? '닿았다' : String(fly.why))
    const sprayed = await sprayBest(api)
    note('스프레이 (214번도로)', sprayed.ok ? `뿌렸다 (남은 것 ${String(sprayed.left)})` : String(sprayed.why))
    await via(api, note, [MAP.veilstone, MAP.gate214, MAP.route214, MAP.valorLakefront, MAP.route222, MAP.gate222, MAP.sunyshore],
      '물가시티로 — 214번도로 · 입지호수근처 · 222번도로', 1_500_000)
    v = await sceneUntil(api, (x) => (x.sunyshore ?? 0) >= 1, 60_000)
    note('물가시티 대엽 장면', `물가 상태 ${String(v.sunyshore)}`)
    if ((v.sunyshore ?? 0) < 1) return done()
  }

  if ((v.sunyshore ?? 0) < 2 && !v.volknerBack) {
    /**
     * ⚠️ **승강기는 스크립트 워프다** — 516에는 문이 없고 프레임 장면이 164로 옮긴다(`scripts_vista_lighthouse_elevator.s`).
     * 맵 길잡이는 그 이음을 몰라 150 → 164를 「길이 없다」로 낸다(탐침 p1). 승강기에 들고 기다린다
     */
    // ⚠️ **`goTo(516)`로 부르지 않는다** — 516에 닿는 순간 장면이 164로 옮기므로, 길잡이가 「516이 아니다」로 되돌아
    // 걸어 들어가 오르내리기를 되풀이했다(탐침 p3). 물가시티 문 (886,790)을 한 번 밀고 기다린다
    const lift = await boardWarp(api, MAP.sunyshore, LIGHTHOUSE_DOOR, Math.min(900_000, api.left()))
    const up = await untilMap(api, (m) => m === MAP.lighthouse, 60_000)
    await api.clearTalk(); await api.settle()
    note('길잡이등대(164) — 승강기(516)', `${lift} · 올라왔다 ${String(up)}`)
    const said = await api.talkTo(MAP.lighthouse, LIGHTHOUSE_VOLKNER, Math.min(300_000, api.left()))
    v = await sceneUntil(api, (x) => x.volknerBack === true)
    note('등대의 전진 (6,4)', `${said ? '말 걸었다' : '못 걸었다'} · 체육관으로 ${String(v.volknerBack)}`)
    if (!v.volknerBack) return done()
  }
  if ((v.sunyshore ?? 0) < 2 && !v.flintAway) {
    if ((await api.now()).map === MAP.lighthouse) {
      const lift = await boardWarp(api, MAP.lighthouse, LIGHTHOUSE_STAIRS, Math.min(300_000, api.left()))
      const down = await untilMap(api, (m) => m === MAP.sunyshore, 60_000)
      await api.clearTalk(); await api.settle()
      note('물가시티로 내려온다 — 승강기(516)', `${lift} · 내려왔다 ${String(down)}`)
    }
    const said = await api.talkTo(MAP.sunyshore, SUNYSHORE_FLINT, Math.min(300_000, api.left()))
    v = await sceneUntil(api, (x) => x.flintAway === true)
    note('체육관 앞 대엽 (845,748)', `${said ? '말 걸었다' : '못 걸었다'} · 비켰다 ${String(v.flintAway)}`)
    if (!v.flintAway) return done()
  }

  if ((v.sunyshore ?? 0) < 2) {
    const bought = await api.buyAt(MAP.sunyshoreMart, ITEM.hyperPotion, potions, Math.min(300_000, api.left()))
    note(`물가 마트 고급상처약 ${String(potions)}개`, bought.ok ? `${String(bought.bought)}개 샀다` : String(bought.why))
    if (levels !== null) await prepare(api, ctx, note, { center: MAP.sunyshoreCenter, levels, what: '물가' })
    out.gym = await sunyshoreGym(api, ctx)
    v = await vars()
  }
  out.ok = (v.sunyshore ?? 0) >= 2
  note('배지 8', `물가 상태 ${String(v.sunyshore)}`)
  return done()
}

// ── ② 비전머신07 → 기술삭제사 → 폭포 · 바위깨기 → 리그 남 (지시서 §3.2) ─────

/**
 * **기술 하나를 잊게 한다** — 운하시티 동쪽 집의 기술삭제사. 「잊게 할 기술이 있나?」 예 → 파티 화면에서
 * 그 마리 → 요약 화면에서 그 기술 → 「잊어도 되나?」 예. 잊었는지는 파티로 본다.
 *
 * ⚠️ **비전기술은 가르칠 때 못 잊는다**(REPAIR §76) — 삭제사가 원작이 둔 유일한 길이다
 */
export async function deleteMove(api, ctx, { species, move }) {
  const note = (what, detail) => { ctx.log(`  ${what} → ${detail}`) }
  const moves = async () => ((await api.partyState()) ?? []).map((one) => ({ species: one.species, moves: one.moves.map((m) => m.move) }))
  const knows = async () => {
    const party = await moves()
    const slot = party.findIndex((one) => species.includes(one.species))
    return { slot, at: slot < 0 ? -1 : party[slot].moves.indexOf(move) }
  }
  const first = await knows()
  if (first.slot < 0) return { ok: false, why: '그 마리가 없다' }
  if (first.at < 0) return { ok: true, already: true }
  const before = await moves()
  const inside = await api.goTo(MAP.canalaveEastHouse, Math.min(900_000, api.left()))
  note('운하 동쪽 집(42)', inside)
  /**
   * ⚠️ **`talkTo`로 말 걸지 않는다** — 그 손은 A 뒤에 `settle`까지 가서 대화를 **스스로 끝낸다**: 「예」 · 첫 마리 · 첫 기술.
   * 탐침 p5·p6이 그래서 토대부기의 지진을 지웠다(그 뒤 이 고리가 비버통의 풀베기를 또 지웠다). 앞 칸에 서서 북쪽을 보고 A만 누른다
   */
  const stood = await api.stepOn(MAP.canalaveEastHouse, MOVE_DELETER_FRONT, Math.min(300_000, api.left()))
  if (stood !== 'arrived') return { ok: false, why: `삭제사 앞 칸에 못 섰다 (${stood})` }
  await api.tap('ArrowUp', 60)
  await api.tap('Space', 400)
  /** 화면 글·메뉴 상태 — 부르는 쪽(`ctx.screen` · `ctx.menuState`)이 페이지에서 읽어 준다 */
  const screen = async () => (ctx.screen ? ctx.screen() : '')
  const menuState = async () => (ctx.menuState ? ctx.menuState() : null)
  const wait = (ms) => new Promise((r) => { setTimeout(r, ms) })
  const trail = []
  let idle = 0
  for (let i = 0; i < 80 && api.left() > 0; i++) {
    const got = await knows()
    if (got.at < 0) break
    const at = await api.now()
    const menu = at.menu
    trail.push(menu ?? (at.talk ? 'talk' : 'field'))
    if (menu === 'party') {
      // 화면이 뜨는 동안 누른 키는 먹힌다 — 뜬 뒤에 한 칸씩
      await wait(700)
      for (let k = 0; k < got.slot; k++) await api.tap('ArrowRight', 250)
      await api.tap('Space', 900)
      continue
    }
    if (menu === 'summary') {
      /**
       * ⚠️ **요약 화면이 어느 마리인지 읽고서야 고른다.** 탐침 p5가 파티 화면에서 누른 방향키가 먹혀 토대부기의 요약이 열린
       * 채로 첫 칸을 골라 **지진을 잊게 했다**(비버통의 풀베기도 같은 판에 지워졌다 — 대화가 두 번 돌았다). 틀린 마리면 B로
       * 물러난다 — 원작 스크립트가 「어느 포켓몬?」으로 되돌린다
       */
      const ms = await menuState()
      if (ms === null || ms.summarySlot !== got.slot) {
        trail.push(`틀린마리${String(ms?.summarySlot)}`)
        await api.tap('KeyX', 900)
        continue
      }
      await wait(500)
      for (let k = 0; k < got.at; k++) await api.tap('ArrowDown', 250)
      await api.tap('Space', 900)
      continue
    }
    if (menu === undefined && !at.talk) {
      // ⚠️ **필드에서는 A를 안 누른다** — 누르면 삭제사에게 한 번 더 말을 건다
      if (++idle > 8) break
      await wait(500)
      continue
    }
    idle = 0
    const text = await screen()
    if (text.includes('아니오') || text.includes('아니요')) { await api.tap('Space', 500); continue }
    await api.tap('Space', 400)
  }
  // 대화가 되돌아가 있으면 고르지 말고 물러난다 — `clearTalk`는 첫 칸(예·첫 마리)을 고른다
  for (let i = 0; i < 20; i++) {
    const at = await api.now()
    if (at.menu === undefined && !at.talk) break
    const text = await screen()
    if (at.menu !== undefined) await api.tap('KeyX', 500)
    else if (text.includes('아니오') || text.includes('아니요')) { await api.tap('ArrowDown', 200); await api.tap('Space', 500) } else await api.tap('Space', 400)
  }
  await api.settle()
  const after = await moves()
  const lost = before.flatMap((was, i) => was.moves.filter((m) => !(after[i]?.moves ?? []).includes(m)).map((m) => ({ slot: i, species: was.species, move: m })))
  const only = lost.length === 1 && species.includes(lost[0].species) && lost[0].move === move
  note('기술삭제사', `${only ? '잊었다' : `잘못 잊었다 ${JSON.stringify(lost)}`} · 거친 화면 ${trail.slice(0, 24).join('>')}`)
  return { ok: only, lost, trail }
}

/**
 * **다리 K** — 북쪽 바닷가 복도에서 라이벌·귤(비전머신07) → 운하시티 기술삭제사(비버통의 풀베기) →
 * 폭포오르기 → 비버통 · 바위깨기 → 기라티나 → 물가시티로 날아 223번도로를 파도타기 · 폭포오르기로 →
 * 리그 남 센터. 끝나면 챔피언로드 문 앞이다.
 *
 * ⚠️ **비버통 한 마리가 파도타기·괴력·락클라임·폭포오르기를 다 든다** — 풀베기를 지워 칸을 낸다.
 * 챔피언로드에 풀베기 나무는 없다(지시서 §2 — 필요한 비전기술 다섯에 없다)
 */
export async function beaconToVictory(api, ctx, { potions = 25 } = {}) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = noteOf(out, ctx)
  const done = () => { out.ms = Date.now() - t0; return out }
  const vars = async () => (await api.storyVars()) ?? {}

  let v = await vars()
  /**
   * ⚠️ **체육관 안이면 톱니를 거꾸로 건너 나온다** — 길잡이는 톱니 벽을 몰라 셋째 방에서 곧장 물가시티로 가려다
   * 첫째 방 (8,8)에서 섰다(탐침 p4). 입구 칸 (8,14)을 밟는 걸음이 곧 문이다
   */
  if (GEAR_MAPS.includes((await api.now()).map)) {
    await gearClimb(api, ctx, { goals: GEAR_ENTRY, until: 0 })
    note('물가 체육관을 나온다', `지금 맵 ${String((await api.now()).map)}`)
  }
  if (!v.hm07) {
    if ((await api.now()).map !== MAP.sunyshore) {
      const out2 = await api.goTo(MAP.sunyshore, Math.min(900_000, api.left()))
      note('물가시티로', out2)
    }
    const stood = await api.stepOn(MAP.sunyshore, SUNYSHORE_JASMINE, Math.min(600_000, api.left()))
    v = await sceneUntil(api, (x) => x.hm07 === true)
    note('북쪽 복도 라이벌·귤 (855,743)', `${stood} · 물가 상태 ${String(v.sunyshore)} · 비전머신07 ${String(v.hm07)}`)
    if (!v.hm07) return done()
  }

  const party = async () => (await api.partyState()) ?? []
  const knowsMove = async (move) => (await party()).some((one) => one.moves.some((m) => m.move === move))

  if (!await knowsMove(MOVE.waterfall)) {
    const bibarel = (await party()).find((one) => BIDOOF_LINE.includes(one.species))
    /**
     * 폭포오르기는 이 파티에서 비버통만 배운다 — 칸이 차 있으면 삭제사에게 간다. 풀베기가 먼저고, 없으면
     * 바위깨기다(아래에서 기라티나가 다시 배운다). 락클라임이 다른 마리에게 갔으면(`teachTo` 대체) 칸 사정이 판마다 다르다
     */
    const drop = bibarel === undefined || bibarel.moves.length < 4 ? null
      : [MOVE.cut, MOVE.rockSmash].find((mv) => bibarel.moves.some((m) => m.move === mv)) ?? null
    if (drop !== null) {
      const fly = await api.flyTo(MAP.canalave, Math.min(120_000, api.left()))
      note('공중날기 → 운하시티', fly.ok ? '닿았다' : String(fly.why))
      out.deleted = await deleteMove(api, ctx, { species: BIDOOF_LINE, move: drop })
      note(`비버통 ${drop === MOVE.cut ? '풀베기' : '바위깨기'} 지우기`, out.deleted.ok ? '지웠다' : String(out.deleted.why ?? '못 지웠다'))
      if (!out.deleted.ok) return done()
    }
    out.waterfall = await teachTo(api, ITEM.hm07, MOVE.waterfall, BIDOOF_LINE)
    note('비전머신07 폭포오르기', out.waterfall.ok ? `${String(out.waterfall.learner ?? '?')}번이 배웠다${out.waterfall.fallback ? ' (대신)' : ''} · 잊은 것 ${JSON.stringify(out.waterfall.lost ?? [])}` : String(out.waterfall.why))
    if (!out.waterfall.ok) return done()
  }
  if (!await knowsMove(MOVE.rockSmash)) {
    const GIRATINA = [487]
    out.smash = await teachTo(api, ITEM.hm06, MOVE.rockSmash, GIRATINA,
      { keep: keepAllButWeakest(await party(), GIRATINA) })
    note('비전머신06 바위깨기', out.smash.ok ? `${String(out.smash.learner ?? '?')}번이 배웠다${out.smash.fallback ? ' (대신)' : ''} · 잊은 것 ${JSON.stringify(out.smash.lost ?? [])}` : String(out.smash.why))
    if (!out.smash.ok) return done()
  }

  if ((await api.now()).map !== MAP.leagueSouthCenter) {
    const fly = await api.flyTo(MAP.sunyshore, Math.min(120_000, api.left()))
    note('공중날기 → 물가시티', fly.ok ? '닿았다' : String(fly.why))
    const bought = await api.buyAt(MAP.sunyshoreMart, ITEM.hyperPotion, potions, Math.min(300_000, api.left()))
    note(`물가 마트 고급상처약 ${String(potions)}개`, bought.ok ? `${String(bought.bought)}개 샀다` : String(bought.why))
    // ⚠️ **스프레이가 떨어졌다** — 탐침 p1이 214번도로에서 「가방에 없다」로 못 뿌렸다. 223번도로 · 챔피언로드는 물과 동굴이 길다
    const repels = await api.buyAt(MAP.sunyshoreMart, ITEM.maxRepel, 10, Math.min(300_000, api.left()))
    note('물가 마트 골드스프레이 10개', repels.ok ? `${String(repels.bought)}개 샀다` : String(repels.why))
    await prepare(api, ctx, note, { center: MAP.sunyshoreCenter, levels: null, what: '물가' })
    api.setSurf(true); api.setWaterfall(true); api.setClimb(true)
    const sprayed = await sprayBest(api)
    note('스프레이 (223번도로)', sprayed.ok ? `뿌렸다 (남은 것 ${String(sprayed.left)})` : String(sprayed.why))
    const went = await api.goTo(MAP.leagueSouthCenter, Math.min(1_800_000, api.left()))
    note('리그 남 센터(173) — 223번도로 · 폭포', went)
  }
  const at = await api.now()
  out.map = at.map
  out.ok = at.map === MAP.leagueSouthCenter
  return done()
}

// ── ③ 챔피언로드 → 리그 북 센터 (지시서 §3.3) ─────────────────────────────────

/** 턱 거동 → 뛰는 방향 (`map/zone.ts`의 `LEDGE_*`) */
const LEDGE = { 0x38: [1, 0], 0x39: [-1, 0], 0x3a: [0, -1], 0x3b: [0, 1] }
/** 챔피언로드 문 — 1F (4,37) → 2F (20,16) · 2F (23,26) → 1F (7,47) · 1F (42,41) → B1F (4,39) · B1F (3,22) → 1F (41,24) · 1F (34,5) → 리그 */
const VR = {
  up2F: { x: 4, z: 37 }, from2F: { x: 23, z: 26 }, downB1F: { x: 42, z: 41 }, fromB1F: { x: 3, z: 22 }, exit: { x: 34, z: 5 },
}
/** 북 센터 라이벌 좌표 (10~12,4) — `VAR_RIVAL_BEAT_SUNYSHORE_GYM` 0 · 문지기 (11,3) */
const LEAGUE_RIVAL = { x: 11, z: 4 }
const LEAGUE_GUARD = { x: 11, z: 3 }
/** 북 센터 간호사 · 상점 스크립트 (`scripts_pokemon_league_north_pokecenter_1f.s`의 항목 차례 — 1은 문지기다) */
const LEAGUE_NURSE = 8
const LEAGUE_CLERK = 2

/**
 * **챔피언로드 2F** — 바위를 밀고 깨서 1F로 내려가는 문 (23,26)까지. 풀이(`pushSolve`)는 구운 격자와
 * 처음 바위 자리로 푼다 — 맵에 들어설 때마다 바위가 제자리로 돌아간다(맵 지역 표식 · REPAIR §126).
 * 민 것·깬 것만 차례로 하고, 그 사이 걸음은 길 찾기(`stepOn`)에 맡긴다
 */
export async function victory2F(api, ctx) {
  const note = (what, detail) => { ctx.log(`  ${what} → ${detail}`) }
  const g = gridOf(matrixOf(MAP.victory2F))
  const npcs = npcsOf(MAP.victory2F)
  const people = new Set(npcs.filter((n) => n.sprite !== 84 && n.sprite !== 85).map((n) => `${n.x},${n.z}`))
  const here = await api.now()
  const plan = solvePush({
    start: { x: here.x, z: here.z },
    wall: (x, z) => x < 0 || z < 0 || x >= g.w || z >= g.h || g.blocked(x, z) || people.has(`${x},${z}`),
    ledge: (x, z) => LEDGE[g.at(x, z) & 0x7fff] ?? null,
    boulders: npcs.filter((n) => n.sprite === 84).map((n) => [n.x, n.z]),
    rocks: npcs.filter((n) => n.sprite === 85).map((n) => [n.x, n.z]),
    goal: (x, z) => Math.abs(x - VR.from2F.x) + Math.abs(z - VR.from2F.z) === 1,
  })
  if (plan === null) return { ok: false, why: `(${String(here.x)},${String(here.z)})에서 2F 풀이가 없다` }
  const acts = plan.moves.filter((m) => m.kind === 'push' || m.kind === 'smash')
  note('챔피언로드 2F 풀이', `밀기 ${String(plan.pushes)} · 깨기 ${String(plan.smashes)} — ${acts.map((m) => `${m.kind === 'push' ? '밀기' : '깨기'} (${String(m.at.x)},${String(m.at.z)})${m.key}`).join(' ')}`)
  const done = []
  for (const m of acts) {
    if (m.kind === 'push') {
      const r = await api.strengthPush(MAP.victory2F, m.at, m.key, 1, Math.min(300_000, api.left()))
      done.push({ ...m, ok: r.ok })
      if (!r.ok) return { ok: false, why: `(${String(m.at.x)},${String(m.at.z)}) 바위를 못 밀었다 — ${String(r.why)}`, done }
    } else {
      const r = await api.smashRock(MAP.victory2F, m.at, Math.min(300_000, api.left()))
      done.push({ ...m, ok: r.ok })
      if (!r.ok) return { ok: false, why: `(${String(m.at.x)},${String(m.at.z)}) 바위를 못 깼다`, done }
    }
  }
  const down = await boardWarp(api, MAP.victory2F, VR.from2F, Math.min(600_000, api.left()))
  return { ok: down === 'arrived', why: down, done }
}

/**
 * **다리 L** — 리그 남 센터 → 챔피언로드 1F(락클라임 · 다리) → 2F(바위) → 1F → B1F(파도타기 · 폭포) → 1F
 * → 출구 → 리그 둘째 폭포 → 북 센터. 들어서면 라이벌전이 걸린다(스타팅에 맞춘 여섯 마리)
 */
export async function victoryRoad(api, ctx) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = noteOf(out, ctx)
  const done = () => { out.ms = Date.now() - t0; return out }
  const vars = async () => (await api.storyVars()) ?? {}
  const at = async () => (await api.now()).map
  api.setSurf(true); api.setWaterfall(true); api.setClimb(true)
  /**
   * **층마다 문을 민다** — 스프레이를 다시 뿌리고, 못 넘어가면 네 번까지 다시 간다.
   *
   * ⚠️ 탐침 p7이 B1F에서 야생 서른다섯에 붙들려 `boardWarp`의 옆칸 예산(칸마다 5분)을 다 쓰고 「못 넘어갔다」로 섰다 —
   * 223번도로에서 뿌린 골드스프레이가 챔피언로드 한복판에서 떨어졌다
   */
  const door = async (map, warp, what) => {
    let last = ''
    for (let i = 0; i < 4 && (await at()) === map && api.left() > 0; i++) {
      const sprayed = await sprayBest(api)
      if (sprayed.ok) note(`스프레이 (${what})`, `뿌렸다 (남은 것 ${String(sprayed.left)})`)
      last = await boardWarp(api, map, warp, Math.min(1_200_000, api.left()))
      note(`${what}${i > 0 ? ` 다시 ${String(i)}` : ''}`, last)
      if (last === 'arrived') break
    }
    return last
  }

  if ([MAP.leagueSouthCenter, MAP.league].includes(await at())) {
    if ((await at()) === MAP.leagueSouthCenter) await prepare(api, ctx, note, { center: MAP.leagueSouthCenter, levels: null, what: '리그 남' })
    const sprayed = await sprayBest(api)
    note('스프레이 (챔피언로드)', sprayed.ok ? `뿌렸다 (남은 것 ${String(sprayed.left)})` : String(sprayed.why))
    const went = await api.goTo(MAP.victory1F, Math.min(900_000, api.left()))
    note('챔피언로드 1F(244)', went)
  }
  if ((await at()) === MAP.victory1F && (await api.now()).z > 40) {
    await door(MAP.victory1F, VR.up2F, '1F (4,37) → 2F')
  }
  if ((await at()) === MAP.victory2F) {
    out.floor2 = await victory2F(api, ctx)
    note('챔피언로드 2F', out.floor2.ok ? '1F로 내려왔다' : String(out.floor2.why))
    if (!out.floor2.ok) return done()
  }
  if ((await at()) === MAP.victory1F && (await api.now()).z > 40) {
    await door(MAP.victory1F, VR.downB1F, '1F (42,41) → B1F')
  }
  if ((await at()) === MAP.victoryB1F) {
    await door(MAP.victoryB1F, VR.fromB1F, 'B1F 파도타기 · 폭포 → (3,22) → 1F')
  }
  if ((await at()) === MAP.victory1F) {
    await door(MAP.victory1F, VR.exit, '1F 출구 (34,5) → 리그')
  }
  if ((await at()) === MAP.league) {
    const north = await api.goTo(MAP.leagueNorthCenter, Math.min(900_000, api.left()))
    note('리그 북 센터(175) — 둘째 폭포', north)
  }
  let v = await vars()
  if ((await at()) === MAP.leagueNorthCenter && (v.rivalLeague ?? 0) < 1) {
    await prepare(api, ctx, note, { center: MAP.leagueNorthCenter, nurse: LEAGUE_NURSE, levels: null, what: '리그 북' })
    for (let i = 0; i < 3 && (v.rivalLeague ?? 0) < 1; i++) {
      const stood = await api.stepOn(MAP.leagueNorthCenter, LEAGUE_RIVAL, Math.min(300_000, api.left()))
      v = await sceneUntil(api, (x) => (x.rivalLeague ?? 0) >= 1)
      note(`북 센터 라이벌전 (11,4)${i > 0 ? ` 재도전 ${String(i)}` : ''}`, `${stood} · 라이벌 ${String(v.rivalLeague)}`)
      if ((v.rivalLeague ?? 0) < 1) await prepare(api, ctx, note, { center: MAP.leagueNorthCenter, nurse: LEAGUE_NURSE, levels: null, what: '라이벌전 뒤' })
    }
  }
  out.map = await at()
  out.ok = out.map === MAP.leagueNorthCenter && (v.rivalLeague ?? 0) >= 1
  return done()
}

// ── ④ 사천왕 → 챔피언 → 명예의 전당 (지시서 §3.4) ──────────────────────────────

/** 사천왕 방 — 승강기 맵 · 방 맵 · 깃발 이름 · 사천왕 칸 (8,5) · 출구 (8,2) */
const ELITE = [
  { lift: 176, room: 177, flag: 'aaron', what: '충호' },
  { lift: 178, room: 179, flag: 'bertha', what: '들국화' },
  { lift: 180, room: 181, flag: 'flint', what: '대엽' },
  { lift: 182, room: 183, flag: 'lucian', what: '오엽' },
]
const ELITE_SPOT = { x: 8, z: 5 }
const ELITE_EXIT = { x: 8, z: 2 }
/** 승강기 발판 — 사천왕 넷은 (4,11) · 챔피언은 (4,19) */
const LIFT_PAD = { 176: { x: 4, z: 11 }, 178: { x: 4, z: 11 }, 180: { x: 4, z: 11 }, 182: { x: 4, z: 11 }, 184: { x: 4, z: 19 } }

/**
 * 승강기를 탄다 — 발판을 밟으면 올라가고, **걸어서** 위 문 (4,2)로 방에 든다. 승강기 스크립트에는 워프가 없다
 * (`scripts_pokemon_league_elevator_to_*_room.s` — `TriggerPlatformLift` 뒤 끝). 방의 프레임 스크립트가 주인공을
 * 걸려 들이고 뒤 문을 닫는다
 */
async function rideLift(api, ctx, lift, room) {
  const stood = await api.stepOn(lift, LIFT_PAD[lift], Math.min(300_000, api.left()))
  await api.settle()
  // 발판이 다 오를 때까지 — 오르는 동안은 조작이 묶인다
  const inRoom = await untilMap(api, (m) => m === room, 8_000)
  if (!inRoom && (await api.now()).map === lift) {
    const up = await boardWarp(api, lift, { x: 4, z: 2 }, Math.min(300_000, api.left()))
    ctx.log(`    승강기 위 문 (4,2) → ${up}`)
  }
  await api.clearTalk(); await api.settle()
  return { stood, map: (await api.now()).map }
}

/**
 * **명예의 전당을 끝까지 본다** — 전당 장면 → 크레딧 → 타이틀. Z가 다음 장으로 넘긴다(`story.mjs` ③과 같은 손)
 */
async function watchEnding(api, ctx, page) {
  const marks = () => page.evaluate(() => ({ ...document.documentElement.dataset, pathname: location.pathname }))
  const out = { hof: false, credits: false, title: false }
  const t0 = Date.now()
  for (let i = 0; i < 600 && !out.hof; i++) {
    const m = await marks()
    if (m.menu === 'hallOfFame') out.hof = true
    else if (m.menu === 'credits') { out.hof = true; out.credits = true }
    else { await page.keyboard.press('Space'); await page.waitForTimeout(300) }
  }
  out.hofMs = Date.now() - t0
  if (out.hof && ctx.out) await page.screenshot({ path: `${ctx.out}/전당.png` }).catch(() => {})
  // 색종이 장면과 「Z 계속」만 A를 기다린다 — 3초마다 한 번 누른다(연타하면 리포트 쓰기를 못 본다)
  for (let i = 0; i < 120 && !out.credits; i++) {
    if ((await marks()).menu === 'credits') { out.credits = true; break }
    await page.keyboard.press('KeyZ'); await page.waitForTimeout(3000)
  }
  out.creditsMs = Date.now() - t0
  if (out.credits && ctx.out) await page.screenshot({ path: `${ctx.out}/크레딧.png` }).catch(() => {})
  // 처음 깬 판에서도 Z 한 번에 만든 사람 화면으로, 한 번 더에 타이틀로 (PARITY §8.12). 타이틀은 통째로 다시 켜진다
  const part = () => page.evaluate(() => document.querySelector('[data-credits]')?.getAttribute('data-credits') ?? null).catch(() => null)
  const titleBy = Date.now() + 120_000
  while (!out.title && Date.now() < titleBy) {
    const m = await marks().catch(() => ({}))
    if (m.pathname === '/' || m.scene === 'title') { out.title = true; break }
    const p = await part()
    if (p === 'maker' && !out.maker) {
      out.maker = true
      if (ctx.out) await page.screenshot({ path: `${ctx.out}/만든사람.png` }).catch(() => {})
    }
    if (p !== null) await page.keyboard.press('KeyZ')
    await page.waitForTimeout(1500)
  }
  out.titleMs = Date.now() - t0
  return out
}

/**
 * **다리 M** — 북 센터에서 회복 → 문지기 → 승강기 → 충호 · 들국화 · 대엽 · 오엽 → 챔피언 승강기 → 난천 →
 * 복도(난천 · 마박사) → 명예의 전당 → 크레딧 → 타이틀. 사천왕은 북 센터에 들 때마다 되살아나므로(지시서 §2)
 * **한 판에** 다 이겨야 한다 — 회복은 약뿐이다.
 *
 * @param page 전당·크레딧은 필드 밖 화면이라 페이지를 직접 본다
 */
export async function eliteFour(api, ctx, page, {
  potions = 30, tries = 3, levels = { lead: 88, bird: 85, third: 85, giratina: 75 },
} = {}) {
  const t0 = Date.now()
  const out = { steps: [], rooms: [], rounds: 0 }
  const note = noteOf(out, ctx)
  const done = () => { out.ms = Date.now() - t0; return out }
  const vars = async () => (await api.storyVars()) ?? {}
  let v = await vars()

  for (let round = 0; round < tries && api.left() > 0 && !v.cynthia; round++) {
    out.rounds = round + 1
    if ((await api.now()).map === MAP.leagueNorthCenter) {
      /**
       * ⚠️ **북 센터는 간호사가 8 · 상점이 2다** — 첫 항목이 문지기라 1로 부르면 문지기에게 말을 건다(탐침 p8 「HP가 0이다」 ·
       * 「가게가 안 열렸다」). 사천왕은 들 때마다 되살아나고 사이에 회복이 없다 — 사탕으로 레벨을 맞춘다(탐침 p8: 라이벌 L51에게
       * 토대부기·찌르호크가 쓰러졌다. 대엽은 불꽃이라 토대부기에 상성 우위다 · `journey-levels-by-candy`)
       */
      const bought = await api.buyAt(MAP.leagueNorthCenter, ITEM.hyperPotion, potions, Math.min(300_000, api.left()), LEAGUE_CLERK)
      note(`북 센터 상점 고급상처약 ${String(potions)}개`, bought.ok ? `${String(bought.bought)}개 샀다` : String(bought.why))
      await prepare(api, ctx, note, { center: MAP.leagueNorthCenter, nurse: LEAGUE_NURSE, levels, what: `사천왕 앞${round > 0 ? ` 재도전 ${String(round)}` : ''}` })
      if (ctx.candyUp && levels.giratina) {
        const g = await ctx.candyUp(null, [487], levels.giratina)
        note('기라티나 사탕', g.ran ? `${String(g.fed)}알 → L${String(g.level)}` : String(g.why))
      }
      v = await vars()
      if (!v.guardMoved) {
        const said = await api.talkTo(MAP.leagueNorthCenter, LEAGUE_GUARD, Math.min(300_000, api.left()))
        v = await sceneUntil(api, (x) => x.guardMoved === true)
        note('문지기 (11,3)', `${said ? '말 걸었다' : '못 걸었다'} · 비켰다 ${String(v.guardMoved)}`)
        if (!v.guardMoved) return done()
      }
      const lift = await boardWarp(api, MAP.leagueNorthCenter, { x: 11, z: 2 }, Math.min(300_000, api.left()))
      note('승강기 문 (11,2)', lift)
    }

    let lost = false
    for (const e of ELITE) {
      v = await vars()
      if (v[e.flag]) continue
      if ((await api.now()).map === e.lift) {
        const r = await rideLift(api, ctx, e.lift, e.room)
        note(`승강기 ${String(e.lift)} → ${e.what}의 방`, `맵 ${String(r.map)}`)
      }
      if ((await api.now()).map !== e.room) { note(e.what, `방에 못 들었다 (맵 ${String((await api.now()).map)})`); return done() }
      const said = await api.talkTo(e.room, ELITE_SPOT, Math.min(900_000, api.left()))
      await api.clearTalk(); await api.settle()
      v = await vars()
      const party = await api.partyState()
      out.rooms.push({ round, who: e.what, won: v[e.flag] === true, party: party?.map((m) => `${String(m.species)} L${String(m.level)} ${String(m.hp)}`) })
      note(`사천왕 ${e.what}`, `${said ? '붙었다' : '못 걸었다'} · 이겼다 ${String(v[e.flag])} · 파티 ${JSON.stringify(out.rooms.at(-1).party)}`)
      // 지면 전멸로 북 센터에 돌아간다 — 사천왕 깃발이 지워지고 처음부터다
      if (!v[e.flag]) { lost = true; break }
      const next = await boardWarp(api, e.room, ELITE_EXIT, Math.min(300_000, api.left()))
      note(`${e.what}의 방 출구 (8,2)`, next)
    }
    if (lost) { await untilMap(api, (m) => m === MAP.leagueNorthCenter, 60_000); await api.clearTalk(); await api.settle(); continue }

    v = await vars()
    if (!v.cynthia && (await api.now()).map === MAP.liftChampion) {
      const r = await rideLift(api, ctx, MAP.liftChampion, MAP.champion)
      note('챔피언 승강기 → 난천', `맵 ${String(r.map)}`)
    }
    // 난천전은 방의 프레임 스크립트가 연다 — `settle`이 치르고, 이기면 복도 → 전당으로 스크립트가 옮긴다
    /**
     * ⚠️ **대사를 넘기다 전당 · 크레딧까지 넘겨 타이틀로 나갈 수 있다** — 크레딧 끝은 `location.assign`으로 앱을 다시 켠다
     * (`CreditsScreen`의 `leave`). 실측(2026-10-10 P5 진단 · 12b961a): 난천을 이긴 뒤 `settle`이 전당과 크레딧을 넘겨
     * 「Execution context was destroyed」로 판이 터졌다. 그 이동은 엔딩을 다 지난 것이다 — 타이틀에서 이어 잰다
     */
    let navigated = false
    const leftApp = (e) => /Execution context was destroyed|navigation|Target page, context or browser has been closed/i.test(String(e?.message ?? e))
    /**
     * 던지지 않고 넘어가기도 한다 — 다시 켜진 타이틀에서 읽으면 맵이 NaN이고 이야기 값이 비어 「졌다」로 읽힌다
     * (실측 f9d7809: 「이겼다 false · 지금 맵 NaN」). 주소가 `/play`를 떠났으면 같은 일로 본다. 이겼는지는
     * 이어하기 뒤 게임 클리어 깃발 · 전당 기록으로 따로 잰다(`_league` 다리 m)
     */
    const offPlay = async () => (await page.evaluate(() => location.pathname).catch(() => '/')) !== '/play'
    try {
      for (let i = 0; i < 20 && !(await vars()).cynthia; i++) {
        if (await offPlay()) { navigated = true; break }
        if ((await api.now()).map === MAP.leagueNorthCenter) break
        await api.clearTalk(); await api.settle()
      }
      if (!navigated && await offPlay()) navigated = true
    } catch (e) {
      if (!leftApp(e)) throw e
      navigated = true
    }
    if (navigated) {
      await page.waitForLoadState('load').catch(() => {})
      note('챔피언 난천', '이긴 뒤 엔딩을 지나 앱이 다시 켜졌다 (타이틀에서 이어 잰다)')
      out.rooms.push({ round, who: '난천', won: true, party: null, via: 'navigated' })
      out.navigated = true
      break
    }
    v = await vars()
    const party = await api.partyState()
    out.rooms.push({ round, who: '난천', won: v.cynthia === true, party: party?.map((m) => `${String(m.species)} L${String(m.level)} ${String(m.hp)}`) })
    note('챔피언 난천', `이겼다 ${String(v.cynthia)} · 지금 맵 ${String((await api.now()).map)}`)
    if (!v.cynthia) { await untilMap(api, (m) => m === MAP.leagueNorthCenter, 60_000); await api.clearTalk(); await api.settle() }
  }
  if (!v.cynthia && !out.navigated) return done()
  out.ending = await watchEnding(api, ctx, page)
  note('명예의 전당 → 크레딧 → 타이틀', JSON.stringify(out.ending))
  out.ok = out.ending.title === true
  return done()
}

export { untilMap }
