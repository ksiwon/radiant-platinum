// 다섯째 배지 뒤의 **다리들** — 들판 → 봉신 → 운하(배지 6) → 호수 둘 → 천관산 → 선단(배지 7)
// (`docs/orders/JOURNEY_BADGE67_20260924.md`). `journey.mjs`와 탐침(`_b67.mjs`)이 같은 걸음을 쓴다.
//
// ⚠️ **여기서도 읽기만 한다.** 변수·플래그·가방에 아무것도 넣지 않는다 — 걸음은 `api`
// (= `driveStory`가 `after`에 넘기는 길잡이)의 방향키·A·B와 화면 단추뿐이다. 사탕은 부르는
// 쪽이 넘긴다(`ctx.candyUp`).
//
// ⚠️ **한 다리가 실패해도 다음 다리를 조용히 건너뛰지 않는다.** 결말을 그대로 돌려주고,
// 판정은 부르는 쪽이 한다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ITEM, MAP, PASTORIA, pastoriaClimb } from './badges.mjs'

/** 기술 위력 — 제품 자료를 **읽는다**(`public/data/moves.json`). 변화 기술은 0, 죽기살기는 1이다 */
let powerTable = null
function powerOf(move) {
  if (powerTable === null) {
    const file = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../public/data/moves.json'), 'utf8'))
    const list = Array.isArray(file) ? file : file.moves ?? Object.values(file)
    powerTable = new Map(list.map((one) => [one.id, one.power ?? 0]))
  }
  return powerTable.get(move) ?? 0
}

/** 기술 번호 (`moves.txt` 줄 − 1) — 비전기술 넷 */
export const MOVE = { cut: 15, fly: 19, surf: 57, strength: 70, rockSmash: 249 }
/** 비전기술 — 가르칠 때 잊으면 안 되는 것들 (원작은 못 잊게 막는다 · REPAIR §76) */
const HM_MOVES = [MOVE.cut, MOVE.fly, MOVE.surf, MOVE.strength, MOVE.rockSmash]

/** 비버니 → 비버통. 파도타기·괴력을 배울 마리 (JOURNEY_BADGE67 §7) */
export const BIDOOF_LINE = [399, 400]
/** 찌르꼬 → 찌르버드 → 찌르호크. 공중날기를 배울 마리 */
export const STARLY_LINE = [396, 397, 398]

// ── 자리 (좌표는 `events_*.json` 그대로 · 지시서 §3) ─────────────────────────
/** 들판시티 폭발 장면 칸 — `script 21 · pastoria == 4` (`CoordEvent_Bomb`) */
const PASTORIA_BOMB = { x: 610, z: 810 }
/** 폭발 뒤 동쪽으로 옮겨 서는 조무래기 */
const PASTORIA_GRUNT = { x: 637, z: 812 }
/** 213번도로 조무래기 — 첫 자리와 달아나 선 자리 */
const ROUTE213_GRUNT = [{ x: 654, z: 812 }, { x: 683, z: 833 }]
/** 입지호수근처 조무래기 — 첫 자리와 옮겨 선 자리(두 번째가 배틀이다) */
const VALOR_GRUNT = [{ x: 719, z: 790 }, { x: 723, z: 769 }]
/**
 * 210번도로 남 고라파덕 — (561,588)에서 북쪽을 보고 말을 건다.
 * ⚠️ 뒤 장면이 주인공 x가 560·561일 때만 난천을 세운다(`GetPlayerMapPos`)
 */
const PSYDUCK = { x: 561, z: 587 }
/** 봉신 동굴 문 앞 조무래기 */
const CELESTIC_GRUNT = { x: 463, z: 522 }
/** 봉신 동굴 벽화 — (9,3)에서 북쪽을 보고 A */
const CAVE_PAINTING_STAND = { x: 9, z: 3 }
/** 봉신 동굴의 태홍 — 벽화를 이미 본 뒤 다시 붙을 때는 이 사람에게 말을 건다 */
const CAVE_CYRUS_SCRIPT = 2

/**
 * **스프레이를 뿌린다** — 가진 것 가운데 가장 오래 가는 것부터(골드 → 실버 → 보통).
 * 실측(2026-09-24 배지 6·7 탐침 3판): 213번도로에서 마지막 한 통을 쓰고 뒤로는 못 뿌렸다 —
 * 그래서 다리 A가 들판 마트에서 골드스프레이를 사 둔다
 */
async function sprayBest(api) {
  const bag = (await api.bagState())?.items ?? []
  for (const item of [ITEM.maxRepel, ITEM.superRepel, ITEM.repel]) {
    if (!bag.some((one) => one.item === item && one.count > 0)) continue
    return api.useItem(item, Math.min(150_000, api.left()))
  }
  return { ok: false, why: '가방에 스프레이가 없다' }
}

/**
 * **경유 맵을 차례로 걷는다** — 지금 선 맵이 목록에 있으면 그 다음부터.
 *
 * ⚠️ **게이트를 빼먹지 않는다.** 맵 그래프는 오버월드에서 **맞닿은 구역**을 한 걸음으로
 * 보는데, 그 경계가 물가면 걸어서는 못 넘는다(물을 막은 뒤로 `unreachable`). 그러면
 * `goTo`가 가까운 건물을 드나드는 갈래로 빠진다 — 실측(2026-09-24 탐침 4판): 들판시티(120)
 * 에서 213번도로(373)로 가라 했더니 체육관·센터·관측소 게이트를 차례로 들락날락했다.
 * 들판 ↔ 213은 게이트(374)로만 이어진다. 배지 4·5 다리가 게이트를 하나씩 적는 까닭과 같다
 */
async function via(api, note, maps, what, budget = 900_000) {
  const here = (await api.now()).map
  let last = 'arrived'
  for (const m of maps.slice(maps.indexOf(here) + 1)) {
    last = await api.goTo(m, Math.min(budget, api.left()))
    note(`${what} — 맵 ${String(m)}`, last)
    if (last !== 'arrived') break
  }
  return last
}

const noteOf = (out, ctx) => (what, detail) => {
  out.steps.push({ what, detail })
  ctx.log(`  ${what} → ${detail}`)
}

/**
 * **다리 A — 들판 체육관을 나서서 봉신 동굴의 비전머신03까지** (지시서 §3.1·§3.2).
 *
 * @param stopAt 여기까지 가고 돌려준다 — `journey`의 자리마다 부른다
 */
export async function pastoriaToCelestic(api, ctx,
  { stopAt = MAP.celesticCave, repel = true } = {}) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = noteOf(out, ctx)
  const vars = async () => (await api.storyVars()) ?? {}
  const walk = async (mapId, what, budget = 1_200_000) => {
    const went = await api.goTo(mapId, Math.min(budget, api.left()))
    note(what, went)
    return went
  }
  const spray = async (what) => {
    if (!repel) return
    const sprayed = await sprayBest(api)
    note(`스프레이 (${what})`, sprayed.ok ? `뿌렸다 (남은 것 ${String(sprayed.left)})` : String(sprayed.why))
  }
  const done = () => { out.ms = Date.now() - t0; return out }

  /**
   * ⓪ **체육관 안에서 출발하면 물 높이부터 맞춘다.** 맥실러를 이긴 자리의 물로는 문까지
   * 길이 안 열릴 수 있다 — 들어올 때와 같은 풀이(`pastoriaClimb`)를 문 앞 칸으로 돌린다
   */
  if ((await api.now()).map === PASTORIA.map) {
    out.gymExit = await pastoriaClimb(api, ctx, { goal: PASTORIA.door, what: '들판 체육관 문 앞' })
    if (out.gymExit.ok !== true) {
      note('들판 체육관 나가기', `못 나갔다 — ${String(out.gymExit.why)} · ${JSON.stringify(out.gymExit.stuck ?? null).slice(0, 600)}`)
      return done()
    }
  }
  // ① 체육관을 나서면 라이벌·맥실러 장면(자동) → ② 폭발 칸 → ③ 조무래기
  let v = await vars()
  out.pastoria = { before: v.pastoria ?? null }
  if ((v.pastoria ?? 0) <= 4) {
    const outside = await walk(MAP.pastoria, '들판시티로 나선다 (체육관을 나선 장면)', 300_000)
    await api.clearTalk(); await api.settle()
    v = await vars()
    out.pastoria.exit = { went: outside, state: v.pastoria ?? null }
    if ((v.pastoria ?? 0) === 4) {
      const stood = await api.stepOn(MAP.pastoria, PASTORIA_BOMB, Math.min(300_000, api.left()))
      await api.clearTalk(); await api.settle()
      v = await vars()
      out.pastoria.bomb = { stood, state: v.pastoria ?? null, moved: v.gruntEast === true }
      note('대습초원 폭발 (610,810)', `${stood} · 들판 상태 ${String(v.pastoria)} · 조무래기 옮김 ${String(v.gruntEast)}`)
    }
  }
  /**
   * ⚠️ **(610,810)에 다시 서면 라이벌이 되민다** (`script 22 · pastoria == 5`,
   * `BlockGreatMarsh`). 길 계획이 그 칸을 피하게 한다 — 대습초원 게이트 앞이다
   */
  ctx.setWalls?.(MAP.pastoria, [`${String(PASTORIA_BOMB.x)},${String(PASTORIA_BOMB.z)}`])
  if ((v.pastoria ?? 0) >= 5 && v.gruntTalked !== true) {
    const said = await api.talkTo(MAP.pastoria, PASTORIA_GRUNT, Math.min(300_000, api.left()))
    await api.clearTalk(); await api.settle()
    v = await vars()
    out.pastoria.grunt = { said, talked: v.gruntTalked === true }
    note('들판 조무래기에게 말 걸기 (637,812)', `${said ? '말 걸었다' : '못 걸었다'} · 깃발 ${String(v.gruntTalked)}`)
  }
  // 스프레이 — 이 구간 끝(선단시티)까지 수풀·동굴이 길다. 들판 마트가 골드스프레이를 판다
  if (repel && (v.pastoria ?? 0) >= 5 && !(((await api.bagState())?.items ?? []).some((one) => one.item === ITEM.maxRepel && one.count >= 4))) {
    out.repels = await api.buyAt(MAP.pastoriaMart, ITEM.maxRepel, 8, Math.min(300_000, api.left()))
    note('들판 마트 골드스프레이 8개', out.repels.ok ? `${String(out.repels.bought)}개 샀다` : String(out.repels.why))
  }
  if (stopAt === MAP.pastoria) return done()

  // ④~⑥ 213번도로 조무래기 둘
  if ((await api.now()).map !== MAP.route213) {
    await spray('213번도로')
    out.route213 = { went: await via(api, note, [MAP.pastoria, MAP.gate213, MAP.route213], '213번도로로') }
  } else out.route213 = { went: 'arrived' }
  v = await vars()
  for (const [i, spot] of ROUTE213_GRUNT.entries()) {
    const flag = i === 0 ? 'grunt213' : 'grunt213Left'
    if (v[flag] === true) continue
    const said = await api.talkTo(MAP.route213, spot, Math.min(600_000, api.left()))
    await api.clearTalk(); await api.settle()
    v = await vars()
    out.route213[`grunt${String(i + 1)}`] = { said, flag: v[flag] === true }
    note(`213번도로 조무래기 ${String(i + 1)} (${String(spot.x)},${String(spot.z)})`,
      `${said ? '말 걸었다' : '못 걸었다'} · 깃발 ${String(v[flag])}`)
  }

  /**
   * ⑦~⑨ **로비를 먼저 지난다** — 입지호수근처 조무래기 두 번(두 번째가 배틀) → 난천 → 비전신약.
   *
   * ⚠️ 213번도로는 그랜드레이크 로비(376)를 사이에 두고 **남북 두 구역**이다. 남쪽 모래밭에서는
   * 입지호수근처로 걸어서 못 닿고(격자 unreachable), 로비의 남쪽 문으로 들어가 북쪽 문 (8,2)로
   * 나서야 213 북쪽 (706,812)에 선다. 맵 그래프는 그 갈림을 몰라서 `goTo(336)`이 213과 들판
   * 게이트(374) 사이를 12분 오갔다(2026-09-24 탐침 3판)
   */
  if ((await api.now()).map === MAP.route213) {
    out.lobby = await walk(MAP.grandLakeLobby, '그랜드레이크 로비(376) — 213 남쪽에서 북쪽으로', 900_000)
  }
  out.valor = { went: await walk(MAP.valorLakefront, '입지호수근처(336) — 로비 북쪽 문으로') }
  v = await vars()
  for (const [i, spot] of VALOR_GRUNT.entries()) {
    if (i === 0 && v.valorGrunt === true) continue
    if (i === 1 && (v.pastoria ?? 0) >= 6) continue
    const said = await api.talkTo(MAP.valorLakefront, spot, Math.min(600_000, api.left()))
    await api.clearTalk(); await api.settle()
    v = await vars()
    const at = await api.now()
    out.valor[`grunt${String(i + 1)}`] = { said, state: v.pastoria ?? null, map: at.map }
    note(`입지호수근처 조무래기 ${String(i + 1)} (${String(spot.x)},${String(spot.z)})`,
      `${said ? '말 걸었다' : '못 걸었다'} · 들판 상태 ${String(v.pastoria)} · 지금 맵 ${String(at.map)}`)
  }
  const bag = await api.bagState()
  out.valor.secretPotion = bag?.items.some((one) => one.item === ITEM.secretPotion) === true
  note('비전신약', out.valor.secretPotion ? '가방에 있다' : '없다')
  if (stopAt === MAP.valorLakefront) return done()

  // ⑩ 210번도로 남 — 고라파덕에게 비전신약 → 난천이 고대의부적
  v = await vars()
  if (v.psyduck !== true) {
    await spray('214·215번도로')
    out.psyduck = {
      went: await via(api, note, [MAP.valorLakefront, MAP.route214, MAP.gate214, MAP.veilstone, MAP.gate215,
        MAP.route215, MAP.route210south], '210번도로 남으로 — 214·장막·215를 거꾸로', 1_200_000),
    }
    if (out.psyduck.went === 'arrived') {
      const said = await api.talkTo(MAP.route210south, PSYDUCK, Math.min(600_000, api.left()))
      await api.clearTalk(); await api.settle()
      v = await vars()
      const bag2 = await api.bagState()
      out.psyduck.said = said
      out.psyduck.done = v.psyduck === true
      out.psyduck.charm = bag2?.items.some((one) => one.item === ITEM.oldCharm) === true
      note('고라파덕에게 비전신약 (561,587)', `${said ? '말 걸었다' : '못 걸었다'} · 깃발 ${String(v.psyduck)} · 고대의부적 ${String(out.psyduck.charm)}`)
    }
  }
  if (stopAt === MAP.route210south) return done()

  // ⑪ 210번도로 북 → 봉신마을 · 동굴 앞 조무래기(예 → 배틀)
  v = await vars()
  if (v.charm !== true) {
    out.celestic = {
      went: await via(api, note, [MAP.route210south, MAP.route210north, MAP.celestic], '봉신마을로 — 210번도로 북을 지나', 1_500_000),
    }
    if (out.celestic.went === 'arrived') {
      const said = await api.talkTo(MAP.celestic, CELESTIC_GRUNT, Math.min(600_000, api.left()))
      await api.clearTalk(); await api.settle()
      v = await vars()
      out.celestic.said = said
      out.celestic.charm = v.charm === true
      note('봉신 동굴 앞 조무래기 (463,522)', `${said ? '말 걸었다' : '못 걸었다'} · 부적 전함 ${String(v.charm)}`)
    }
  } else out.celestic = { went: 'arrived', charm: true }
  if (stopAt === MAP.celestic) return done()

  // ⑫ 봉신 동굴 — 벽화 → 태홍(예 → 배틀) → 비전머신03 → 나서면 난천 장면
  v = await vars()
  out.cave = {}
  if ((v.celestic ?? 0) < 1) {
    const heal = await api.healAt(MAP.celesticCenter, Math.min(300_000, api.left()))
    note('태홍 앞 회복 (봉신 센터 443)', heal.ok ? '나았다' : String(heal.why))
    out.cave.went = await walk(MAP.celesticCave, '봉신 동굴(449)', 600_000)
    for (let round = 0; round < 3 && (v.celestic ?? 0) < 1 && api.left() > 0; round++) {
      if (round > 0) {
        const back = await api.healAt(MAP.celesticCenter, Math.min(300_000, api.left()))
        note(`태홍 재도전 앞 회복 (${String(round)})`, back.ok ? '나았다' : String(back.why))
        await walk(MAP.celesticCave, '봉신 동굴(449) 다시', 600_000)
      }
      if (v.painting !== true) {
        const stood = await api.stepOn(MAP.celesticCave, CAVE_PAINTING_STAND, Math.min(300_000, api.left()))
        await api.tap('ArrowUp', 80)
        await api.settle()
        await api.tap('Space', 300)
        note('벽화 앞 (9,3)', stood)
      } else {
        // 벽화를 다시 보면 대사만 나온다 — 태홍 사람에게 말을 건다(`CelesticTownCave_Cyrus`)
        const said = await api.talkToNpc(MAP.celesticCave, CAVE_CYRUS_SCRIPT, Math.min(300_000, api.left()))
        note('태홍에게 말 걸기', said ? '붙었다' : '못 걸었다')
      }
      await api.clearTalk(); await api.settle()
      v = await vars()
      note(`태홍${round > 0 ? ` (재도전 ${String(round)})` : ''}`, `봉신 상태 ${String(v.celestic)} · 벽화 ${String(v.painting)}`)
    }
    const bag3 = await api.bagState()
    out.cave.hm03 = bag3?.items.some((one) => one.item === ITEM.hm03) === true
    note('비전머신03', out.cave.hm03 ? '가방에 있다' : '없다')
  }
  v = await vars()
  if ((v.celestic ?? 0) === 1) {
    const outside = await walk(MAP.celestic, '동굴을 나선다 (난천 장면)', 300_000)
    await api.clearTalk(); await api.settle()
    v = await vars()
    out.cave.exit = { went: outside, state: v.celestic ?? null, blockade: v.blockade218 === true }
    note('봉신 난천 장면', `봉신 상태 ${String(v.celestic)} · 218 봉쇄 풀림 ${String(v.blockade218)}`)
  }
  return done()
}

/**
 * **비전머신을 가르친다** — 그 계통의 마리에게, 비전기술은 안 잊게.
 *
 * 잊을 칸은 `keep`에 없는 첫 칸이다. 공격 기술까지 지키고 싶으면 부르는 쪽이 넘긴다
 */
export async function teachTo(api, item, move, line, { keep = [] } = {}) {
  const party = (await api.partyState()) ?? []
  const slot = party.findIndex((one) => line.includes(one.species))
  if (slot < 0) return { ok: false, why: `가르칠 마리가 없다 (${JSON.stringify(line)})` }
  return api.teachHm(item, move, Math.min(300_000, api.left()),
    { only: [slot], keep: [...HM_MOVES, ...keep] })
}

// ── 여섯째 배지 — 봉신 → 운하 (지시서 §3.3·§3.4) ────────────────────────────────

/** 운하 다리 라이벌전 칸 — `script 2 · x 47 · z 723~726 · canalave == 0` */
const CANALAVE_BRIDGE = { x: 47, z: 724 }
/** 운하 선원 (배 → 강철섬). 목록 첫 칸이 강철섬이다 */
const CANALAVE_SAILOR = { x: 45, z: 750 }
/** 강철섬 밖의 현이 (비전머신04) · 돌아가는 배의 선원 */
const IRON_RILEY = { x: 117, z: 490 }
const IRON_SAILOR = { x: 99, z: 502 }
/** 도서관 문 앞 라이벌 — 비전머신04가 있으면 문을 열고 들어간다 */
const LIBRARY_RIVAL = { x: 37, z: 719 }
/** 동관 (16, 높이 30, 3) — 4층 (16,4)에서 북쪽을 보고 말을 건다 */
export const CANALAVE_GOAL = { x: 16, z: 4, floor: 3 }
/** 운하 체육관 입구 — 문 (16,27) 바로 안쪽 칸, 0층 */
const CANALAVE_ENTRY = { x: 16, z: 26, floor: 0 }
const BYRON = { x: 16, z: 3 }
/** 새턴 · 마스 스크립트 번호 */
const SATURN_SCRIPT = 4
const MARS_SCRIPT = 6
/** 천관산 1F 북 방1의 큰바위 — (29,31)에서 북쪽으로 세 번 민다 */
const CORONET_BOULDER = { x: 29, z: 30 }
/** 무청 (11,3) — 옆 칸에 서서 마주 보고 말을 건다 */
const CANDICE = { x: 11, z: 3 }

/** 방향 → 그 쪽으로 한 칸 */
const KEY_OF = { '0,-1': 'ArrowUp', '0,1': 'ArrowDown', '-1,0': 'ArrowLeft', '1,0': 'ArrowRight' }
const STEP_OF = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }

/**
 * **칸이 찼을 때 무엇을 지키나** — 비전기술이 아닌 것 가운데 **위력이 가장 낮은 하나**만
 * 내놓고 나머지를 다 지킨다. 칸이 비어 있으면 아무것도 안 잊는다.
 *
 * ⚠️ 공격 기술만 넷인 마리가 있다 — 찌르호크(인파이트 · 돌진 · 전광석화 · 날개치기).
 * 「공격 기술은 다 지킨다」로 두면 지킬 것만 남아 **공중날기를 못 배운다**(2026-09-24 탐침 5판)
 */
export function keepAllButWeakest(party, line) {
  const moves = (party.find((one) => line.includes(one.species))?.moves ?? []).map((m) => m.move)
  if (moves.length < 4) return moves
  const candidates = moves.filter((m) => !HM_MOVES.includes(m))
  if (candidates.length === 0) return moves
  const weakest = candidates.reduce((a, b) => (powerOf(b) < powerOf(a) ? b : a))
  return moves.filter((m) => m !== weakest)
}

/**
 * **다리 B — 봉신에서 운하시티 다리 라이벌까지** (지시서 §3.3·§3.4 ①).
 *
 * 비전머신 둘(파도타기 → 비버통 · 공중날기 → 찌르호크)을 가르치고, 축복시티로 날아
 * 218번도로를 파도타기로 건너 운하시티로 간다. 다리 라이벌전은 **반드시** 붙는다.
 *
 * @param ctx.candyUp 사탕을 먹이는 손잡이 (부르는 쪽이 준다) — `(slot, family, level)`
 * @param levels 동관 앞 사탕 값 `{ lead, bird, third }`
 */
export async function celesticToCanalave(api, ctx,
  { stopAt = MAP.canalave, levels = { lead: 52, bird: 50, third: 50 }, potions = 12 } = {}) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = noteOf(out, ctx)
  const vars = async () => (await api.storyVars()) ?? {}
  const done = () => { out.ms = Date.now() - t0; return out }
  const walk = async (mapId, what, budget = 1_200_000) => {
    const went = await api.goTo(mapId, Math.min(budget, api.left()))
    note(what, went)
    return went
  }

  // ① 비전머신 둘 — 비전기술과 공격 기술은 안 잊는다
  out.surf = await teachTo(api, ITEM.hm03, MOVE.surf, BIDOOF_LINE,
    { keep: keepAllButWeakest((await api.partyState()) ?? [], BIDOOF_LINE) })
  note('비전머신03 파도타기 → 비버통', out.surf.ok ? `배웠다 · 잊은 것 ${JSON.stringify(out.surf.lost ?? [])}`
    : `${String(out.surf.why)} · 화면 ${JSON.stringify(out.surf.said ?? []).slice(0, 500)}`)
  out.fly = await teachTo(api, ITEM.hm02, MOVE.fly, STARLY_LINE,
    { keep: keepAllButWeakest((await api.partyState()) ?? [], STARLY_LINE) })
  note('비전머신02 공중날기 → 찌르호크', out.fly.ok ? `배웠다 · 잊은 것 ${JSON.stringify(out.fly.lost ?? [])}`
    : `${String(out.fly.why)} · 화면 ${JSON.stringify(out.fly.said ?? []).slice(0, 500)}`)

  // ② 축복시티로 난다 → 218 게이트 → 218번도로를 파도타기로
  if ((await api.now()).map !== MAP.canalave) {
    out.flyJubilife = await api.flyTo(MAP.jubilife, Math.min(120_000, api.left()))
    note('공중날기 → 축복시티', out.flyJubilife.ok ? '닿았다' : String(out.flyJubilife.why))
    api.setSurf(true)
    out.route218 = {
      went: await via(api, note, [MAP.jubilife, MAP.gate218Jubilife, MAP.route218, MAP.gate218Canalave],
        '218번도로를 파도타기로 → 운하 쪽 게이트', 1_200_000),
    }
    api.setSurf(false)
    out.route218.surfs = api.surfLog.length
    await api.clearTalk(); await api.settle()
    const v = await vars()
    note('218 운하 쪽 게이트 연구원 장면', `상태 ${String(v.gate218)} · 파도타기 ${String(api.surfLog.length)}번`)
    out.canalave = { went: await walk(MAP.canalave, '운하시티(33)', 600_000) }
  }
  if (stopAt === MAP.gate218Canalave) return done()

  // ③ 운하 — 회복 · 사탕 · 고급상처약 → 다리 라이벌전
  const heal = await api.healAt(MAP.canalaveCenter, Math.min(300_000, api.left()))
  note('운하 센터(36) 회복', heal.ok ? '나았다' : String(heal.why))
  if (ctx.candyUp) {
    out.candy = [
      { what: '선두', ...await ctx.candyUp(0, null, levels.lead) },
      { what: '찌르호크', ...await ctx.candyUp(null, STARLY_LINE, levels.bird) },
      { what: '비버통', ...await ctx.candyUp(null, BIDOOF_LINE, levels.third) },
    ]
    note('동관 앞 사탕', JSON.stringify(out.candy.map((c) => `${c.what} ${c.ran ? `${String(c.fed)}알 → L${String(c.level)}` : String(c.why)}`)))
  }
  if (potions > 0) {
    out.potions = await api.buyAt(MAP.canalaveMart, ITEM.hyperPotion, potions, Math.min(300_000, api.left()))
    note(`운하 마트 고급상처약 ${String(potions)}개`, out.potions.ok ? `${String(out.potions.bought)}개 샀다` : String(out.potions.why))
  }
  let v = await vars()
  out.bridge = { tries: [] }
  for (let round = 0; round < 3 && (v.canalave ?? 0) < 1 && api.left() > 0; round++) {
    if (round > 0) {
      const again = await api.healAt(MAP.canalaveCenter, Math.min(300_000, api.left()))
      note(`다리 라이벌 재도전 앞 회복 (${String(round)})`, again.ok ? '나았다' : String(again.why))
    }
    // ⚠️ **먼저 밖으로 나선다.** `stepOn`은 맵이 바뀌면 거기서 돌려준다 — 센터·마트 안에서
    // 부르면 문을 나서는 순간 「warped」로 끝나고 다리 칸은 안 밟는다(탐침 5판에서 두 번)
    await api.goTo(MAP.canalave, Math.min(300_000, api.left()))
    const stood = await api.stepOn(MAP.canalave, CANALAVE_BRIDGE, Math.min(300_000, api.left()))
    await api.clearTalk(); await api.settle()
    v = await vars()
    const at = await api.now()
    out.bridge.tries.push({ stood, state: v.canalave ?? null, map: at.map })
    note(`운하 다리 라이벌 (47,724)${round > 0 ? ` 재도전 ${String(round)}` : ''}`, `${stood} · 운하 상태 ${String(v.canalave)} · 지금 맵 ${String(at.map)}`)
  }
  return done()
}

/**
 * **운하 체육관 — 판을 타고 동관 앞으로** (지시서 §4.1).
 *
 * 풀이는 제품 표로 페이지 안에서 한다(`canalavePlan`). **다음 판 하나까지만** 밟고 다시
 * 푼다 — 트레이너가 시선으로 다가와 서면 막힌 칸이 바뀌기 때문이다.
 *
 * ⚠️ 이 방의 풀이는 **제품의 표로 계산했다 — 사람은 판을 보고 푼다.** 판정 줄에도 그렇게 적는다
 */
export async function canalaveClimb(api, ctx, { rounds = 60, goal = CANALAVE_GOAL, what = '동관 앞' } = {}) {
  const t0 = Date.now()
  const out = { rides: [], replans: 0 }
  const note = (what, detail) => { ctx.log(`  ${what} → ${detail}`) }
  for (let i = 0; i < rounds && api.left() > 0; i++) {
    const st = await api.canalaveState()
    if (st === null) { out.why = '운하 체육관 상태를 못 읽었다 (관측 불가)'; return out }
    if (st.x === goal.x && st.z === goal.z && st.floor === goal.floor) {
      out.ok = true
      out.ms = Date.now() - t0
      note(what, `판 ${String(out.rides.length)}번 · 다시 푼 것 ${String(out.replans)}번`)
      return out
    }
    const read = await api.canalavePlan(goal)
    if (read === null || read.plan === null) {
      out.why = read === null ? '운하 풀이를 못 돌렸다'
        : `(${String(st.x)},${String(st.z)}) ${String(st.floor)}층에서 ${what}으로 가는 판 차례가 없다`
      out.stuck = read?.start ?? st
      return out
    }
    out.replans++
    for (const step of read.plan.steps) {
      const at = await api.stepKey(step.key, step.want)
      if (at === null) break
      if (at.scene === 'battle') { await api.fightThrough(); await api.settle(); break }
      if (at.talk || at.scene !== 'overworld') { await api.clearTalk(); await api.settle(); break }
      if (step.ride === null && (at.x !== step.want.x || at.z !== step.want.z)) {
        note(`걸음 ${step.key} (${String(step.want.x)},${String(step.want.z)})`, `계획과 다른 칸 (${String(at.x)},${String(at.z)}) — 다시 푼다`)
        break
      }
      if (step.ride !== null) {
        /**
         * 판이 사람을 들고 가는지 **잰다** — 판에 오른 뒤 2.5초 동안 원시 자리·높이·`riding`.
         * 판정에는 안 쓰고 로그에 적는다(탐침 6판에서 판만 오르고 사람이 남는 일이 났다)
         */
        const trace = []
        const t0r = Date.now()
        for (let k = 0; k < 25; k++) {
          const now2 = await api.canalaveState()
          if (now2 !== null) trace.push(`${String(Date.now() - t0r)}:(${String(now2.px)},${String(now2.py)},${String(now2.pz)})${now2.busy ? 'b' : ''}${now2.riding ? 'r' : ''}`)
          await new Promise((r) => { setTimeout(r, 100) })
        }
        for (let k = 0; k < 80; k++) {
          const now2 = await api.canalaveState()
          if (now2 !== null && !now2.busy) break
          await api.settle()
        }
        note(`판 #${String(step.ride)} 추적`, trace.join(' '))
        await api.settle()
        const after = await api.canalaveState()
        out.rides.push({ ride: step.ride, want: step.to, got: after })
        note(`판 #${String(step.ride)} (${String(step.want.x)},${String(step.want.z)})`,
          `→ (${String(after?.x)},${String(after?.z)}) ${String(after?.floor)}층`
          + ` · 계획 (${String(step.to.x)},${String(step.to.z)}) ${String(step.to.floor)}층`)
        break
      }
    }
  }
  out.why = `${String(rounds)}바퀴 안에 ${what}에 못 섰다`
  out.ms = Date.now() - t0
  return out
}

/**
 * **관장 옆에서 말을 건다** — 설 칸에서 관장 쪽으로 돌아서 A. 배틀은 `settle`이 치른다
 */
async function faceAndTalk(api, from, to) {
  const key = KEY_OF[`${String(Math.sign(to.x - from.x))},${String(Math.sign(to.z - from.z))}`]
  if (key === undefined) return false
  await api.tap(key, 80)
  await api.settle()
  await api.tap('Space', 300)
  await api.clearTalk()
  await api.settle()
  return true
}

/**
 * **여섯째 배지** — 체육관에 들어가 판을 타고 동관에게. 지면 회복하고 처음부터 다시
 * (판은 들어설 때마다 처음 자리로 돌아간다 — 원작 `OnTransition`). 이겼는지는
 * `canalave` 2(배지와 함께 선다)로 본다
 */
export async function canalaveGym(api, ctx, { tries = 3 } = {}) {
  const out = { rounds: [] }
  const note = (what, detail) => { ctx.log(`  ${what} → ${detail}`) }
  for (let round = 0; round < tries && api.left() > 0; round++) {
    /**
     * ⚠️ **체육관 안이면 판을 타고 입구로 내려간 뒤에 나간다.** 길 계획은 이 방의 층을 몰라
     * 위층에서 센터로 가라 하면 헤맨다(탐침 5판). 입구 칸은 (16,26) 0층이다
     */
    if ((await api.now()).map === MAP.canalaveGym) {
      const down = await canalaveClimb(api, ctx, { goal: CANALAVE_ENTRY, what: '운하 체육관 입구' })
      note('운하 체육관 입구로 내려가기', down.ok === true ? '내려왔다' : String(down.why))
    }
    const heal = await api.healAt(MAP.canalaveCenter, Math.min(300_000, api.left()))
    note(`운하 체육관${round > 0 ? ` 재도전 ${String(round)}` : ''} 앞 회복`, heal.ok ? '나았다' : String(heal.why))
    const inside = await api.goTo(MAP.canalaveGym, Math.min(600_000, api.left()))
    note('운하 체육관(35) 들어가기', inside)
    if (inside !== 'arrived') { out.rounds.push({ inside }); continue }
    const climb = await canalaveClimb(api, ctx)
    if (climb.ok !== true) { out.rounds.push({ climb }); note('판', String(climb.why)); continue }
    await faceAndTalk(api, CANALAVE_GOAL, BYRON)
    const party = await api.partyState()
    const state = (await api.storyVars())?.canalave ?? null
    out.rounds.push({ climb, canalave: state, party: party?.map((m) => `${String(m.species)} L${String(m.level)} ${String(m.hp)}`) })
    note(`동관${round > 0 ? ' (재도전)' : ''}`, `운하 상태 ${String(state)}`)
    if ((state ?? 0) >= 2) { out.ok = true; return out }
  }
  return out
}

// ── 강철섬 · 도서관 · 호수 둘 (지시서 §3.4 ③~⑨ · §3.5) ────────────────────────

export async function canalaveToLakes(api, ctx, { stopAt = MAP.lakeVerity } = {}) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = noteOf(out, ctx)
  const vars = async () => (await api.storyVars()) ?? {}
  const done = () => { out.ms = Date.now() - t0; return out }
  const walk = async (mapId, what, budget = 1_200_000) => {
    const went = await api.goTo(mapId, Math.min(budget, api.left()))
    note(what, went)
    return went
  }
  const have = async (item) => ((await api.bagState())?.items ?? []).some((one) => one.item === item)

  // ③ 체육관을 나서면 라이벌 장면
  /**
   * ⚠️ **동관 앞(3층)에서 이어 받으면 판을 타고 입구로 내려간 뒤에 나간다.** 길 계획은 이 방의
   * 층을 몰라 3층에서 `goTo(운하)`를 부르면 방 안을 헤맨다(탐침 c1 — 10분 동안 맵 35).
   * 동관전에서 둘이 쓰러진 채이니 나가서 먼저 센터에 들른다(탐침 c1 — 입지호수에서 전멸)
   */
  if ((await api.now()).map === MAP.canalaveGym) {
    const down = await canalaveClimb(api, ctx, { goal: CANALAVE_ENTRY, what: '운하 체육관 입구' })
    note('운하 체육관 입구로 내려가기', down.ok === true ? '내려왔다' : String(down.why))
  }
  let v = await vars()
  if ((v.canalave ?? 0) === 2) {
    await walk(MAP.canalave, '운하시티로 나선다 (라이벌 장면)', 300_000)
    await api.clearTalk(); await api.settle()
    v = await vars()
    note('체육관 앞 라이벌', `운하 상태 ${String(v.canalave)} · 도서관 ${String(v.library)}`)
  }
  {
    const heal = await api.healAt(MAP.canalaveCenter, Math.min(300_000, api.left()))
    note('운하 센터(36) 회복', heal.ok ? '나았다' : String(heal.why))
  }
  // ④~⑥ 강철섬 — 현이가 바로 비전머신04를 준다
  if (!(await have(ITEM.hm04))) {
    // ⚠️ `talkTo`는 그 맵 밖(센터 안)에서 부르면 바로 못 걸었다를 낸다 — 먼저 거리로 (탐침 c3)
    if ((await api.now()).map !== MAP.canalave) await walk(MAP.canalave, '운하시티로 나선다', 300_000)
    const said = await api.talkTo(MAP.canalave, CANALAVE_SAILOR, Math.min(600_000, api.left()))
    await api.clearTalk(); await api.settle()
    let at = await api.now()
    note('운하 선원 (45,750) → 강철섬', `${said ? '말 걸었다' : '못 걸었다'} · 지금 맵 ${String(at.map)}`)
    if (at.map === MAP.ironIsland) {
      const riley = await api.talkTo(MAP.ironIsland, IRON_RILEY, Math.min(300_000, api.left()))
      await api.clearTalk(); await api.settle()
      note('현이 (117,490)', `${riley ? '말 걸었다' : '못 걸었다'} · 비전머신04 ${String(await have(ITEM.hm04))}`)
      const back = await api.talkTo(MAP.ironIsland, IRON_SAILOR, Math.min(300_000, api.left()))
      await api.clearTalk(); await api.settle()
      at = await api.now()
      note('강철섬 선원 → 운하', `${back ? '말 걸었다' : '못 걸었다'} · 지금 맵 ${String(at.map)}`)
    }
  }
  out.hm04 = await have(ITEM.hm04)
  if (stopAt === MAP.ironIsland || !out.hm04) return done()

  // ⑦~⑨ 도서관 — 문 앞 라이벌 → 3F 폭발 장면 → 나서면 마박사 장면
  v = await vars()
  if ((v.library ?? 0) < 2) {
    if ((await api.now()).map !== MAP.canalave) await walk(MAP.canalave, '운하시티로 나선다', 300_000)
    const rival = await api.talkTo(MAP.canalave, LIBRARY_RIVAL, Math.min(300_000, api.left()))
    await api.clearTalk(); await api.settle()
    note('도서관 앞 라이벌 (37,719)', rival ? '말 걸었다' : '못 걸었다')
    await walk(MAP.library3F, '운하도서관 3F(40)', 600_000)
    await api.clearTalk(); await api.settle()
    v = await vars()
    note('입지호수 폭발 장면', `도서관 ${String(v.library)} · 운하 ${String(v.canalave)} · 폭발 ${String(v.valorExploded)}`)
  }
  if ((v.canalave ?? 0) === 4) {
    await walk(MAP.canalave, '도서관을 나선다 (마박사 장면)', 600_000)
    await api.clearTalk(); await api.settle()
    v = await vars()
    note('도서관 앞 장면', `운하 상태 ${String(v.canalave)}`)
  }
  if (stopAt === MAP.canalave || (v.canalave ?? 0) < 5) return done()

  // 호수 ① — 장막으로 날아 입지호수 동굴의 새턴
  v = await vars()
  if (v.saturn !== true) {
    const fly = await api.flyTo(MAP.veilstone, Math.min(120_000, api.left()))
    note('공중날기 → 장막시티', fly.ok ? '닿았다' : String(fly.why))
    const heal = await api.healAt(MAP.veilstoneCenter, Math.min(300_000, api.left()))
    note('새턴 앞 회복 (장막 센터)', heal.ok ? '나았다' : String(heal.why))
    await via(api, note, [MAP.veilstone, MAP.gate214, MAP.route214, MAP.valorLakefront, MAP.lakeValorDrained,
      MAP.valorCavern], '입지호수 동굴로 — 214 · 입지호수근처 · 물 빠진 입지호수')
    for (let round = 0; round < 3 && v.saturn !== true && api.left() > 0; round++) {
      if (round > 0) {
        const heal = await api.healAt(MAP.veilstoneCenter, Math.min(300_000, api.left()))
        note(`새턴 재도전 앞 회복 (${String(round)})`, heal.ok ? '나았다' : String(heal.why))
        await via(api, note, [MAP.veilstone, MAP.gate214, MAP.route214, MAP.valorLakefront, MAP.lakeValorDrained,
          MAP.valorCavern], '입지호수 동굴로 다시')
      }
      const said = await api.talkToNpc(MAP.valorCavern, SATURN_SCRIPT, Math.min(300_000, api.left()))
      await api.clearTalk(); await api.settle()
      v = await vars()
      note(`새턴${round > 0 ? ' (재도전)' : ''}`, `${said ? '붙었다' : '못 걸었다'} · 이겼다 ${String(v.saturn)}`)
    }
  }
  if (stopAt === MAP.valorCavern) return done()

  // 호수 ② — 떡잎으로 날아 진실호수의 마스
  v = await vars()
  if (v.verityLeft !== true) {
    const fly = await api.flyTo(MAP.twinleaf, Math.min(120_000, api.left()))
    note('공중날기 → 떡잎마을', fly.ok ? '닿았다' : String(fly.why))
    const heal = await api.healAt(MAP.sandgemCenter, Math.min(600_000, api.left()))
    note('마스 앞 회복 (잔모래 센터)', heal.ok ? '나았다' : String(heal.why))
    await via(api, note, [MAP.sandgemCenter, MAP.twinleaf, MAP.route201, MAP.verityLakefront, MAP.lakeVerity], '진실호수로 — 201 · 진실호수근처')
    await api.clearTalk(); await api.settle()
    for (let round = 0; round < 3 && v.verityLeft !== true && api.left() > 0; round++) {
      if (round > 0) {
        const heal = await api.healAt(MAP.sandgemCenter, Math.min(600_000, api.left()))
        note(`마스 재도전 앞 회복 (${String(round)})`, heal.ok ? '나았다' : String(heal.why))
        await via(api, note, [MAP.sandgemCenter, MAP.twinleaf, MAP.route201, MAP.verityLakefront, MAP.lakeVerity], '진실호수로 다시')
      }
      const said = await api.talkToNpc(MAP.lakeVerity, MARS_SCRIPT, Math.min(300_000, api.left()))
      await api.clearTalk(); await api.settle()
      v = await vars()
      note(`마스${round > 0 ? ' (재도전)' : ''}`, `${said ? '붙었다' : '못 걸었다'} · 이겼다 ${String(v.verityLeft)} · 천관산 열림 ${String(v.coronetOpen)}`)
    }
  }
  return done()
}

// ── 일곱째 배지 — 천관산 → 선단 (지시서 §3.6 · §4.2) ─────────────────────────

export async function coronetToSnowpoint(api, ctx,
  { stopAt = MAP.snowpoint, levels = { lead: 58, bird: 56, third: 56 }, potions = 12 } = {}) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = noteOf(out, ctx)
  const done = () => { out.ms = Date.now() - t0; return out }
  const walk = async (mapId, what, budget = 1_200_000) => {
    const went = await api.goTo(mapId, Math.min(budget, api.left()))
    note(what, went)
    return went
  }
  const spray = async (what) => {
    const sprayed = await sprayBest(api)
    note(`스프레이 (${what})`, sprayed.ok ? `뿌렸다 (남은 것 ${String(sprayed.left)})` : String(sprayed.why))
  }

  // ① 괴력 → 비버통 (비전기술만 지킨다 — 물대포 자리를 준다)
  /**
   * ⚠️ **마스 장면 바로 뒤에서 가르치면 한 번 헛돈다** (탐침 c4 「아무도 못 배웠다」 — 같은 자리의
   * 리포트를 이어서 가르치면 배운다). 글·장면을 걷고 한 번 더 해 본다
   */
  for (let round = 0; round < 2; round++) {
    await api.clearTalk(); await api.settle()
    out.strength = await teachTo(api, ITEM.hm04, MOVE.strength, BIDOOF_LINE,
      { keep: keepAllButWeakest((await api.partyState()) ?? [], BIDOOF_LINE) })
    if (out.strength.ok) break
    note('비전머신04 괴력 (헛돈 판의 화면)', JSON.stringify((out.strength.said ?? []).map((one) => one.slice(0, 120))))
  }
  note('비전머신04 괴력 → 비버통', out.strength.ok ? `배웠다 · 잊은 것 ${JSON.stringify(out.strength.lost ?? [])}` : String(out.strength.why))

  // ② 봉신으로 날아 211번도로 동 → 천관산 1F 북 방1 — 큰바위를 민다
  if ((await api.now()).map !== MAP.coronetNorth1) {
    const fly = await api.flyTo(MAP.celestic, Math.min(120_000, api.left()))
    note('공중날기 → 봉신마을', fly.ok ? '닿았다' : String(fly.why))
    // 마스전에서 둘이 쓰러진 채로 온다 (탐침 c4) — 천관산 야생 앞에서 먼저 센터에
    const heal = await api.healAt(MAP.celesticCenter, Math.min(300_000, api.left()))
    note('천관산 앞 회복 (봉신 센터)', heal.ok ? '나았다' : String(heal.why))
    await via(api, note, [MAP.celesticCenter, MAP.celestic, MAP.route211east, MAP.coronetNorth1], '천관산 1F 북 방1로 — 211번도로 동을 지나')
  }
  out.push = await api.strengthPush(MAP.coronetNorth1, CORONET_BOULDER, 'ArrowUp', 3, Math.min(300_000, api.left()))
  note('큰바위 (29,30) 괴력', out.push.ok ? `${String(out.push.pushed)}번 밀었다` : String(out.push.why))
  await walk(MAP.coronetB1F, '천관산 B1F(219)', 900_000)
  await walk(MAP.coronetNorth2, '천관산 1F 북 방2(217)', 600_000)
  await spray('216·217번도로')
  await walk(MAP.route216, '216번도로(383)', 900_000)
  await walk(MAP.route217, '217번도로(385)', 1_500_000)
  await api.clearTalk(); await api.settle()
  await spray('217번도로·예지호수근처')
  await walk(MAP.acuityLakefront, '예지호수근처(340)', 900_000)
  await api.clearTalk(); await api.settle()
  await walk(MAP.snowpoint, '선단시티(165)', 900_000)
  if (stopAt === MAP.snowpoint || (await api.now()).map !== MAP.snowpoint) return done()

  // ③ 선단 — 회복 · 사탕 · 약
  const heal = await api.healAt(MAP.snowpointCenter, Math.min(300_000, api.left()))
  note('선단 센터(168) 회복', heal.ok ? '나았다' : String(heal.why))
  if (ctx.candyUp) {
    out.candy = [
      { what: '선두', ...await ctx.candyUp(0, null, levels.lead) },
      { what: '찌르호크', ...await ctx.candyUp(null, STARLY_LINE, levels.bird) },
      { what: '비버통', ...await ctx.candyUp(null, BIDOOF_LINE, levels.third) },
    ]
    note('무청 앞 사탕', JSON.stringify(out.candy.map((c) => `${c.what} ${c.ran ? `${String(c.fed)}알 → L${String(c.level)}` : String(c.why)}`)))
  }
  if (potions > 0) {
    out.potions = await api.buyAt(MAP.snowpointMart, ITEM.hyperPotion, potions, Math.min(300_000, api.left()))
    note(`선단 마트 고급상처약 ${String(potions)}개`, out.potions.ok ? `${String(out.potions.bought)}개 샀다` : String(out.potions.why))
  }
  return done()
}

/**
 * **선단 체육관 — 얼음을 미끄러져 무청 옆으로** (지시서 §4.2).
 *
 * 한 수 = 한 방향을 **한 번 눌러** 미끄러지는 것이다. 수마다 멈출 때까지 기다리고, 계획한
 * 칸이 아니면(트레이너 배틀 · 제품 거동이 풀이와 다름) 그 자리에서 다시 푼다.
 *
 * ⚠️ 풀이는 **제품의 얼음 규칙으로 계산했다 — 사람은 판을 보고 푼다.**
 */
export async function snowpointSlide(api, ctx, { rounds = 80 } = {}) {
  const t0 = Date.now()
  const out = { moves: [], replans: 0, broke: 0, off: 0 }
  const note = (what, detail) => { ctx.log(`  ${what} → ${detail}`) }
  const goals = [[CANDICE.x, CANDICE.z + 1], [CANDICE.x - 1, CANDICE.z], [CANDICE.x + 1, CANDICE.z]]
  for (let i = 0; i < rounds && api.left() > 0; i++) {
    const here = await api.now()
    const hit = goals.find(([x, z]) => x === here.x && z === here.z)
    if (hit) {
      out.ok = true
      out.stand = { x: hit[0], z: hit[1] }
      out.ms = Date.now() - t0
      note('무청 옆', `(${String(hit[0])},${String(hit[1])}) · 미끄럼 ${String(out.moves.length)}번 · 깬 눈덩이 ${String(out.broke)} · 계획과 다른 수 ${String(out.off)}`)
      return out
    }
    const read = await api.snowpointPlan(goals)
    if (read === null || read.plan === null) {
      out.why = read === null ? '선단 풀이를 못 돌렸다'
        : `(${String(here.x)},${String(here.z)})에서 무청 옆으로 가는 미끄럼 차례가 없다`
      out.stuck = { at: read?.start ?? here, balls: read?.balls ?? null }
      return out
    }
    out.replans++
    for (const move of read.plan.moves) {
      const [dx, dz] = STEP_OF[move.key]
      const first = { x: move.from.x + dx, z: move.from.z + dz }
      const at = await api.stepKey(move.key, first)
      if (at === null) break
      for (let k = 0; k < 100; k++) {
        const ice = await api.iceState()
        if (ice !== null && !ice.sliding) break
        await api.settle()
      }
      await api.settle()
      const now2 = await api.now()
      if (now2.scene === 'battle') { await api.fightThrough(); await api.settle(); break }
      out.moves.push({ ...move, got: { x: now2.x, z: now2.z } })
      if (move.broke > 0) out.broke += move.broke
      if (now2.x !== move.to.x || now2.z !== move.to.z) {
        out.off++
        note(`미끄럼 ${move.key} (${String(move.from.x)},${String(move.from.z)})`,
          `계획 (${String(move.to.x)},${String(move.to.z)}) · 실제 (${String(now2.x)},${String(now2.z)}) — 다시 푼다`)
        break
      }
    }
  }
  out.why = `${String(rounds)}바퀴 안에 무청 옆에 못 섰다`
  out.ms = Date.now() - t0
  return out
}

/**
 * **일곱째 배지** — 체육관에 들어가 미끄러져 무청에게. 지면 회복하고 처음부터.
 * 이겼는지는 기술머신72 깃발(배지와 함께 받는다 · `candiceTm`)로 본다
 */
export async function snowpointGym(api, ctx, { tries = 3 } = {}) {
  const out = { rounds: [] }
  const note = (what, detail) => { ctx.log(`  ${what} → ${detail}`) }
  for (let round = 0; round < tries && api.left() > 0; round++) {
    const heal = await api.healAt(MAP.snowpointCenter, Math.min(300_000, api.left()))
    note(`선단 체육관${round > 0 ? ` 재도전 ${String(round)}` : ''} 앞 회복`, heal.ok ? '나았다' : String(heal.why))
    const inside = await api.goTo(MAP.snowpointGym, Math.min(600_000, api.left()))
    note('선단 체육관(167) 들어가기', inside)
    if (inside !== 'arrived') { out.rounds.push({ inside }); continue }
    const slide = await snowpointSlide(api, ctx)
    if (slide.ok !== true) { out.rounds.push({ slide }); note('얼음', String(slide.why)); continue }
    await faceAndTalk(api, slide.stand, CANDICE)
    const party = await api.partyState()
    const won = (await api.storyVars())?.candiceTm === true
    out.rounds.push({ slide, won, party: party?.map((m) => `${String(m.species)} L${String(m.level)} ${String(m.hp)}`) })
    note(`무청${round > 0 ? ' (재도전)' : ''}`, won ? '이겼다 (기술머신72를 받았다)' : '못 이겼다')
    if (won) { out.ok = true; return out }
  }
  return out
}
