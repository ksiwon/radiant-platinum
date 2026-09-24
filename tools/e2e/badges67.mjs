// 다섯째 배지 뒤의 **다리들** — 들판 → 봉신 → 운하(배지 6) → 호수 둘 → 천관산 → 선단(배지 7)
// (`docs/orders/JOURNEY_BADGE67_20260924.md`). `journey.mjs`와 탐침(`_b67.mjs`)이 같은 걸음을 쓴다.
//
// ⚠️ **여기서도 읽기만 한다.** 변수·플래그·가방에 아무것도 넣지 않는다 — 걸음은 `api`
// (= `driveStory`가 `after`에 넘기는 길잡이)의 방향키·A·B와 화면 단추뿐이다. 사탕은 부르는
// 쪽이 넘긴다(`ctx.candyUp`).
//
// ⚠️ **한 다리가 실패해도 다음 다리를 조용히 건너뛰지 않는다.** 결말을 그대로 돌려주고,
// 판정은 부르는 쪽이 한다.
import { ITEM, MAP, PASTORIA, pastoriaClimb } from './badges.mjs'

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
    const sprayed = await api.useItem(ITEM.superRepel, Math.min(150_000, api.left()))
      .then((r) => (r.ok ? r : api.useItem(ITEM.repel, Math.min(150_000, api.left()))))
    note(`스프레이 (${what})`, sprayed.ok ? `뿌렸다 (남은 것 ${String(sprayed.left)})` : String(sprayed.why))
  }
  const done = () => { out.ms = Date.now() - t0; return out }

  /**
   * ⓪ **체육관 안에서 출발하면 물 높이부터 맞춘다.** 맥실러를 이긴 자리의 물로는 문까지
   * 길이 안 열릴 수 있다 — 들어올 때와 같은 풀이(`pastoriaClimb`)를 문 앞 칸으로 돌린다
   */
  if ((await api.now()).map === PASTORIA.map) {
    out.gymExit = await pastoriaClimb(api, ctx, { goal: PASTORIA.door, what: '들판 체육관 문 앞' })
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
  if (stopAt === MAP.pastoria) return done()

  // ④~⑥ 213번도로 조무래기 둘
  if ((await api.now()).map !== MAP.route213) {
    await spray('213번도로')
    out.route213 = { went: await walk(MAP.route213, '213번도로(373)') }
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

  // ⑦~⑨ 로비를 지나 입지호수근처 — 조무래기 두 번(두 번째가 배틀) → 난천 → 비전신약
  out.valor = { went: await walk(MAP.valorLakefront, '입지호수근처(336) — 그랜드레이크 로비를 지나') }
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
    out.psyduck = { went: await walk(MAP.route210south, '210번도로 남(362) — 214·장막·215를 거꾸로', 2_400_000) }
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
    out.celestic = { went: await walk(MAP.celestic, '봉신마을(442) — 210번도로 북을 지나', 2_400_000) }
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
