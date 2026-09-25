// 배지 7 뒤 → 깨어진 세계 → 기라티나 → 송별의 샘 (지시서 JOURNEY_DISTORTION_20260924)
//
// 다리 넷이다 — ① 무청 뒤 → 비전머신08 → 예지호수 장면 ② 장막시티 → 창고 → 갤럭시단 아지트
// (갤럭시단의열쇠 · 태홍 → 마스터볼 · 새턴 → 호수 셋) ③ 천관산 → 창기둥 → 깨진 창기둥 ④ 깨어진
// 세계 → 기라티나(마스터볼) → 송별의 샘. 번호와 자리는 전부 롬에서 읽었다(지시서 §1~§3 — 근거는
// `raw/decomp`의 스크립트 줄 번호).
//
// ⚠️ **측정 규칙은 앞 다리들과 같다** — 방향키/A/B만, `vars`·`flags`·`bag`은 읽기만, 사탕은 가방에
// 넣는 것만 개발 모듈이고 먹이는 것은 화면이다(`journey-levels-by-candy`).
import { ITEM as ITEM_BASE, MAP as MAP_BASE, boardWarp } from './badges.mjs'
import {
  BIDOOF_LINE, MOVE, SNOWPOINT_ENTRY, STARLY_LINE, keepAllButWeakest, snowpointSlide, sprayBest, teachTo, via,
} from './badges67.mjs'

/** 맵 번호 (`generated/map_headers.txt` 줄 − 1) — 지시서 §2.3 */
export const MAP = {
  ...MAP_BASE,
  lakeAcuity: 318,
  hqB2F: 310, hqB1F: 309, hq1F: 305, hq2F: 306, hq3F: 307, hq4F: 308,
  hqHall: 569, hqLab: 497, hqControl: 494,
  coronet2F: 208, coronet3F: 209, coronetOutsideS: 211, coronet4F: 212, coronetOutsideN: 210,
  coronet4Fr3: 213, coronet5F: 214, coronet6F: 215,
  spearPillar: 220, spearDistorted: 221,
  dw1F: 573, dwB7F: 581, giratinaRoom: 582, sendoffSpring: 267,
}

/** 도구 번호 (`generated/items.txt` 줄 − 1) */
export const ITEM = {
  ...ITEM_BASE,
  masterBall: 1, hm08: 427, galacticKey: 440,
}

/** 고급상처약을 쓰기 시작하는 체력 비 — `journey`의 `POTION_FLOOR`와 같은 값 */
const POTION_FLOOR = 0.45

// ── 자리 (좌표는 `events_*.json` 그대로 · 지시서 §3) ─────────────────────────
/** 217번도로의 비전머신08 도구 볼 — `LOCALID_ITEM_HM08` */
const ROUTE217_HM08 = { x: 296, z: 305 }
/** 장막시티 창고열쇠 그런트 — 예지호수 장면이 깃발 547을 풀어 세운다 */
const STORAGE_GRUNT = { x: 721, z: 593 }
/** 창고 안 핸섬 좌표 장면 — (8,8)·(9,8) 폭 2, 창고 상태 3 */
const WAREHOUSE_LOOKER = { x: 8, z: 8 }
/** 아지트 B2F 갤럭시단의열쇠 도구 볼 */
const HQ_KEY = { x: 20, z: 5 }
/** B2F 열쇠 문 (14~15,8) — 열쇠 구역에서 창고 쪽(영역 0)으로 나가는 문. 그 앞에서 A · 「예」 */
const HQ_B2F_DOOR = { x: 14, z: 8 }
/** 아지트 정문 — 장막시티 워프 14 (714,589) → 1F 로비 (8,22). 워프 16은 막다른 칸이다 */
const HQ_FRONT_DOOR = { x: 714, z: 589 }
/** 1F 열쇠 문 (22~23,18) — 그 앞 칸에서 북으로 A */
const HQ_1F_DOOR = { x: 22, z: 18 }
/** 홀 연설 좌표 (20,12)·(20,13) · 서쪽 출구 (1,12) → 2F 낮잠방 (52,6) */
const HALL_SPEECH = { x: 20, z: 12 }
const HALL_WEST_EXIT = { x: 1, z: 12 }
/** 2F 낮잠방 침대 — 말 걸면 회복 (`GalacticHQ2F_Bed`) */
const HQ_BED = { x: 40, z: 5 }
/** 4F 열쇠 문 (8~9,14) · 그 너머 태홍 좌표 (8,11) 폭 2 */
const HQ_4F_DOOR = { x: 8, z: 14 }
const HQ_4F_CYRUS = { x: 8, z: 11 }
/** 제어실 새턴 (8,6) — 말 걸어 싸운다. 버튼 (8,5)은 새턴이 비킨 뒤 (8,6)에 서서 북으로 */
const CONTROL_SATURN = { x: 8, z: 6 }
/** 천관산 2F 괴력 바위 (14,45) — 남으로 민다 */
const CORONET_2F_BOULDER = { x: 14, z: 45 }
/** 창기둥 — 그런트 좌표 (31,48) · 마스·쥬피터 좌표 (30~32,32) */
const SPEAR_GRUNTS = { x: 31, z: 48 }
const SPEAR_MARS = { x: 31, z: 32 }
/** 기라티나 방 — 기라티나(진행 13)와 배틀 뒤 포털이 (15,13)에 선다. 남쪽 (15,14)에서 북으로 말 건다 */
const GIRATINA = { x: 15, z: 13 }

const noteOf = (out, ctx) => (what, detail) => {
  out.steps.push({ what, detail })
  ctx.log(`  ${what} → ${detail}`)
}

/** 가방에 그 도구가 있나 */
const have = async (api, item) => ((await api.bagState())?.items ?? []).some((one) => one.item === item && one.count > 0)

/**
 * 회복 · 사탕 · 약 켜기 — 다리마다 싸움 앞에서 한 번.
 *
 * ⚠️ **약은 켜야 쓴다** (`api.usePotions`). 배지 6·7 다리는 고급상처약을 사기만 하고 안 켰다
 */
async function prepare(api, ctx, note, { center, levels, what }) {
  const heal = await api.healAt(center, Math.min(300_000, api.left()))
  note(`${what} 회복`, heal.ok ? '나았다' : String(heal.why))
  if (ctx.candyUp && levels) {
    const candy = [
      { what: '선두', ...await ctx.candyUp(0, null, levels.lead) },
      { what: '찌르호크', ...await ctx.candyUp(null, STARLY_LINE, levels.bird) },
      { what: '비버통', ...await ctx.candyUp(null, BIDOOF_LINE, levels.third) },
    ]
    note(`${what} 사탕`, JSON.stringify(candy.map((c) => `${c.what} ${c.ran ? `${String(c.fed)}알 → L${String(c.level)}` : String(c.why)}`)))
  }
  const bag = await api.bagState()
  const potions = (bag?.items ?? []).find((one) => one.item === ITEM.hyperPotion)?.count ?? 0
  if (potions > 0) api.usePotions(ITEM.hyperPotion, '고급상처약', POTION_FLOOR, potions)
}

// ── ① 무청 뒤 → 비전머신08 → 예지호수 (지시서 §3.1) ──────────────────────────

/**
 * **다리 E** — 선단 체육관을 미끄러져 나와 217번도로의 비전머신08을 줍고, 비버통에게 락클라임을
 * 가르쳐 예지호수근처의 벽을 올라 예지호수 장면(쥬피터·라이벌)을 본다. 이 장면이 장막시티의
 * 창고열쇠 그런트를 세운다 — 곧 필수다(롬 §D).
 */
export async function candiceToAcuity(api, ctx, { levels = { lead: 64, bird: 62, third: 62 } } = {}) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = noteOf(out, ctx)
  const done = () => { out.ms = Date.now() - t0; return out }

  // 무청 옆에서 이어 받으면 얼음을 되짚어 입구로 (풀이는 같은 것 — 목표만 입구)
  if ((await api.now()).map === MAP.snowpointGym) {
    const back = await snowpointSlide(api, ctx, { goals: SNOWPOINT_ENTRY, what: '선단 체육관 입구' })
    note('선단 체육관 입구로', back.ok ? `미끄럼 ${String(back.moves.length)}번` : String(back.why))
  }
  await prepare(api, ctx, note, { center: MAP.snowpointCenter, levels, what: '선단' })

  // 비전머신08 — 217번도로 도구 볼 (비전기술 없이 닿는다 — 롬 §B)
  if (!(await have(api, ITEM.hm08))) {
    const sprayed = await sprayBest(api)
    note('스프레이 (217번도로)', sprayed.ok ? `뿌렸다 (남은 것 ${String(sprayed.left)})` : String(sprayed.why))
    // ⚠️ `talkTo`는 그 맵 밖(센터 안)에서 부르면 바로 못 걸었다를 낸다 — 먼저 217번도로로 (탐침 p1)
    const road = await api.goTo(MAP.route217, Math.min(1_500_000, api.left()))
    note('217번도로(385)', road)
    const took = await api.talkTo(MAP.route217, ROUTE217_HM08, Math.min(900_000, api.left()))
    await api.clearTalk(); await api.settle()
    note('비전머신08 (296,305)', `${took ? '말 걸었다' : '못 걸었다'} · 가방에 ${String(await have(api, ITEM.hm08))}`)
  }
  if (!(await have(api, ITEM.hm08))) return done()

  out.climb = await teachTo(api, ITEM.hm08, MOVE.rockClimb, BIDOOF_LINE,
    { keep: keepAllButWeakest((await api.partyState()) ?? [], BIDOOF_LINE) })
  note('비전머신08 락클라임 → 비버통', out.climb.ok ? `배웠다 · 잊은 것 ${JSON.stringify(out.climb.lost ?? [])}` : String(out.climb.why))
  if (!out.climb.ok) return done()
  api.setClimb(true)

  await via(api, note, [MAP.route217, MAP.acuityLakefront, MAP.lakeAcuity], '예지호수로 — 예지호수근처 벽을 올라')
  await api.clearTalk(); await api.settle()
  const v = (await api.storyVars()) ?? {}
  out.acuity = v.acuity ?? null
  note('예지호수 장면', `예지호수 상태 ${String(v.acuity)} · 장막 그런트 숨김 ${String(v.stashGrunt)}`)
  out.ok = (v.acuity ?? 0) >= 2
  return done()
}

// ── ② 장막시티 → 창고 → 갤럭시단 아지트 (지시서 §3.2) ─────────────────────────

/**
 * **다리 F** — 창고열쇠 그런트 → 핸섬 「예」 → 창고 문 → 아지트 B2F에서 패널 미로로 갤럭시단의열쇠 →
 * **밖으로 나가 정문으로 다시** → 홀 연설 → 낮잠방 침대 → 3F 패널 → 4F 문 → 태홍(마스터볼) → 연구소 →
 * 제어실 새턴 → 버튼(호수 셋 해방).
 *
 * ⚠️ **아지트 안에서는 4F로 못 간다** — 열쇠 문을 다 열어도 홀 입구는 정문 로비 쪽에서만 닿는다(롬 §G-8).
 * ⚠️ **마스터볼은 볼 주머니에 자리가 있을 때만 준다**(15칸) — 한 번뿐이다. 받았는지 가방으로 본다
 */
export async function veilstoneHQ(api, ctx, { levels = { lead: 64, bird: 62, third: 62 } } = {}) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = noteOf(out, ctx)
  const done = () => { out.ms = Date.now() - t0; return out }
  const vars = async () => (await api.storyVars()) ?? {}
  const walk = async (mapId, what, budget = 900_000) => {
    const went = await api.goTo(mapId, Math.min(budget, api.left()))
    note(what, went)
    return went
  }

  let v = await vars()
  if ((v.warehouse ?? 0) < 3) {
    if ((await api.now()).map !== MAP.veilstone) {
      const fly = await api.flyTo(MAP.veilstone, Math.min(120_000, api.left()))
      note('공중날기 → 장막시티', fly.ok ? '닿았다' : String(fly.why))
    }
    await prepare(api, ctx, note, { center: MAP.veilstoneCenter, levels, what: '장막' })
    if ((await api.now()).map !== MAP.veilstone) await walk(MAP.veilstone, '장막시티로 나선다', 300_000)
    // 그런트 → 퇴장 → 핸섬 「아지트에 들어가겠나?」 — `clearTalk`가 첫 칸(예)을 고른다
    const said = await api.talkTo(MAP.veilstone, STORAGE_GRUNT, Math.min(600_000, api.left()))
    await api.clearTalk(); await api.settle()
    v = await vars()
    note('창고열쇠 그런트 (721,593) → 핸섬', `${said ? '말 걸었다' : '못 걸었다'} · 창고 상태 ${String(v.warehouse)}`)
    if ((v.warehouse ?? 0) < 3) return done()
  }
  if ((v.warehouse ?? 0) < 4) {
    await walk(MAP.warehouse, '갤럭시 창고(143)', 600_000)
    const stood = await api.stepOn(MAP.warehouse, WAREHOUSE_LOOKER, Math.min(300_000, api.left()))
    await api.clearTalk(); await api.settle()
    v = await vars()
    note('창고 핸섬 장면 (8,8)', `${stood} · 창고 상태 ${String(v.warehouse)}`)
    if ((v.warehouse ?? 0) < 4) return done()
  }

  // 갤럭시단의열쇠 — B2F → B1F → 1F(패널 둘) → 2F(패널) → 1F → B2F 둘째 구역 (롬 §G 1~7)
  if (!(await have(api, ITEM.galacticKey))) {
    await via(api, note, [MAP.warehouse, MAP.hqB2F, MAP.hqB1F, MAP.hq1F, MAP.hq2F], '아지트 2F로 — B2F · B1F · 1F 패널')
    // 2F에서 1F로 돌아가는 계단은 **워프 1 (24,3)** — 워프 0은 올라온 계단이다
    const down = await boardWarp(api, MAP.hq2F, { x: 24, z: 3 }, Math.min(600_000, api.left()))
    note('2F 계단 (24,3) → 1F (27,3)', down)
    const b2 = await boardWarp(api, MAP.hq1F, { x: 11, z: 3 }, Math.min(600_000, api.left()))
    note('1F 계단 (11,3) → B2F 둘째 구역', b2)
    const took = await api.talkTo(MAP.hqB2F, HQ_KEY, Math.min(600_000, api.left()))
    await api.clearTalk(); await api.settle()
    note('갤럭시단의열쇠 (20,5)', `${took ? '말 걸었다' : '못 걸었다'} · 가방에 ${String(await have(api, ITEM.galacticKey))}`)
    if (!(await have(api, ITEM.galacticKey))) return done()
  }

  // 밖으로 → 정문으로 다시 (롬 §G-8·9)
  v = await vars()
  if ((v.hq4f ?? 0) < 1) {
    /**
     * ⚠️ **B2F 열쇠 문을 열고 창고로 나간다** (롬 §G-8). 길 계획은 문 객체를 몰라 1F로 되올라가서
     * 로비를 찾는데, 로비는 1F 열쇠 문 너머라 「길을 못 찾았다」로 섰다(탐침 p2)
     */
    // 1F·2F·B1F에 있으면(되짚어 올라간 판) 먼저 B2F 열쇠 구역으로 내려온다 — 1F 계단 (11,3)이 그리 간다
    if ([MAP.hq1F, MAP.hq2F, MAP.hqB1F].includes((await api.now()).map)) await walk(MAP.hqB2F, 'B2F 열쇠 구역으로', 600_000)
    const here = await api.now()
    if (here.map === MAP.hqB2F) {
      const opened = await api.talkTo(MAP.hqB2F, HQ_B2F_DOOR, Math.min(300_000, api.left()))
      await api.clearTalk(); await api.settle()
      note('B2F 열쇠 문 (14,8)', opened ? '열었다' : '못 걸었다')
      await via(api, note, [MAP.hqB2F, MAP.warehouse, MAP.veilstone], '창고로 — 장막시티')
    }
    if ((await api.now()).map !== MAP.veilstone) await walk(MAP.veilstone, '아지트를 나선다 (장막시티로)', 1_200_000)
    await prepare(api, ctx, note, { center: MAP.veilstoneCenter, levels: null, what: '아지트 앞' })
    if ((await api.now()).map !== MAP.veilstone) await walk(MAP.veilstone, '장막시티로 나선다', 300_000)
    const inside = await boardWarp(api, MAP.veilstone, HQ_FRONT_DOOR, Math.min(600_000, api.left()))
    note('아지트 정문 (714,589)', inside)
    // 1F 열쇠 문 — 문 앞 칸에서 북으로 A · 「예」
    const door = await api.talkTo(MAP.hq1F, HQ_1F_DOOR, Math.min(600_000, api.left()))
    await api.clearTalk(); await api.settle()
    note('1F 열쇠 문 (22,18)', door ? '열었다' : '못 걸었다')
    await via(api, note, [MAP.hq1F, MAP.hq2F, MAP.hqHall], '홀로 — 1F 계단 (19,14) · 2F')
    /**
     * ⚠️ **연설 칸 (20,12)을 밟는다** — 홀 좌표 (20,12)·(20,13)은 서쪽 출구 (1,12)로 가는 유일한 길이다(롬 §G-11).
     * 그냥 `goTo(2F)`를 부르면 들어온 문 (24,6)으로 되돌아 나가 연설도 낮잠방도 안 지난다(탐침 p3 — 홀 상태 0)
     */
    const speech = await api.stepOn(MAP.hqHall, HALL_SPEECH, Math.min(300_000, api.left()))
    await api.clearTalk(); await api.settle()
    v = await vars()
    note('홀 연설 (20,12)', `${speech} · 홀 상태 ${String(v.hall)}`)
    const nap = await boardWarp(api, MAP.hqHall, HALL_WEST_EXIT, Math.min(300_000, api.left()))
    note('홀 서쪽 출구 (1,12) → 2F 낮잠방', nap)
    const bed = await api.talkTo(MAP.hq2F, HQ_BED, Math.min(300_000, api.left()))
    await api.clearTalk(); await api.settle()
    note('낮잠방 침대 (40,5)', bed ? '쉬었다' : '못 걸었다')
    await via(api, note, [MAP.hq2F, MAP.hq3F, MAP.hq4F], '4F로 — 3F 패널')
    const door4 = await api.talkTo(MAP.hq4F, HQ_4F_DOOR, Math.min(300_000, api.left()))
    await api.clearTalk(); await api.settle()
    note('4F 열쇠 문 (8,14)', door4 ? '열었다' : '못 걸었다')
    const cyrus = await api.stepOn(MAP.hq4F, HQ_4F_CYRUS, Math.min(300_000, api.left()))
    await api.clearTalk(); await api.settle()
    v = await vars()
    out.masterBall = await have(api, ITEM.masterBall)
    note('4F 태홍', `${cyrus} · 4F 상태 ${String(v.hq4f)} · 마스터볼 ${String(out.masterBall)}`)
    if ((v.hq4f ?? 0) < 1) return done()
  }

  // 연구소 → 제어실 → 새턴 → 버튼
  v = await vars()
  if (!v.freed) {
    await via(api, note, [MAP.hq4F, MAP.hqLab, MAP.hqControl], '제어실로 — 연구소')
    const saturn = await api.talkTo(MAP.hqControl, CONTROL_SATURN, Math.min(300_000, api.left()))
    await api.clearTalk(); await api.settle()
    v = await vars()
    note('새턴 (8,6)', `${saturn ? '붙었다' : '못 걸었다'} · 이겼다 ${String(v.hqSaturn)}`)
    // 새턴이 비키면 (8,6)에 서서 북으로 버튼 (8,5)
    const stood = await api.stepOn(MAP.hqControl, CONTROL_SATURN, Math.min(120_000, api.left()))
    await api.tap('ArrowUp', 80); await api.settle()
    await api.tap('Space', 300)
    await api.clearTalk(); await api.settle()
    v = await vars()
    note('버튼 (8,5)', `${stood} · 호수 셋 ${String(v.freed)} · 천관산 2F 상태 ${String(v.coronet2f)}`)
  }
  out.masterBall = await have(api, ITEM.masterBall)
  out.ok = v.freed === true && out.masterBall
  return done()
}

// ── ③ 천관산 → 창기둥 → 깨진 창기둥 (지시서 §3.3) ─────────────────────────────

/**
 * **다리 G** — 축복시티로 날아 208번도로 → 천관산 1F 남(파도타기·락클라임) → 2F(괴력 바위 · 핸섬 ·
 * 벽화 구멍) → 3F → 바깥 남 → 4F → 바깥 북 → 4F 방3 → 5F → 6F → 창기둥. 그런트 둘 · 마스·쥬피터를
 * 이기면 컷신이 깨진 창기둥으로 옮기고, 난천 「준비됐니?」 예 → 깨어진 세계 1F.
 *
 * ⚠️ **천관산 3F부터 창기둥까지 회복이 없다**(롬 §6). 축복시티에서 채우고 간다
 */
export async function coronetToSpear(api, ctx,
  { levels = { lead: 68, bird: 66, third: 66 }, potions = 20 } = {}) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = noteOf(out, ctx)
  const done = () => { out.ms = Date.now() - t0; return out }
  const vars = async () => (await api.storyVars()) ?? {}

  let v = await vars()
  if ((v.spear ?? 0) < 1 && (await api.now()).map !== MAP.spearPillar) {
    /**
     * ⚠️ **아지트 안에서는 공중날기가 안 된다** — 원작이 맵 헤더로 막는다(`field_move_tasks.c`의 공중날기 검사 ·
     * `maps.json`의 fly 0). 제어실에서 걸어 나온다: 연구소 → 4F → 3F 패널 → 2F 낮잠방 → 홀 → 2F → 1F 로비 → 정문
     */
    const HQ = [MAP.hqControl, MAP.hqLab, MAP.hq4F, MAP.hq3F, MAP.hq2F, MAP.hqHall, MAP.hq1F]
    if (HQ.includes((await api.now()).map)) {
      const out = await api.goTo(MAP.veilstone, Math.min(1_800_000, api.left()))
      note('아지트를 걸어 나온다 (장막시티로)', out)
    }
    const fly = await api.flyTo(MAP.hearthome, Math.min(120_000, api.left()))
    note('공중날기 → 축복시티', fly.ok ? '닿았다' : String(fly.why))
    const bought = await api.buyAt(MAP.hearthomeMart, ITEM.hyperPotion, potions, Math.min(300_000, api.left()))
    note(`축복 마트 고급상처약 ${String(potions)}개`, bought.ok ? `${String(bought.bought)}개 샀다` : String(bought.why))
    await prepare(api, ctx, note, { center: MAP.hearthomeCenter, levels, what: '축복' })
    api.setSurf(true)
    api.setClimb(true)
    const sprayed = await sprayBest(api)
    note('스프레이 (천관산)', sprayed.ok ? `뿌렸다 (남은 것 ${String(sprayed.left)})` : String(sprayed.why))
    await via(api, note, [MAP.hearthome, MAP.route208, MAP.coronetSouth, MAP.coronet2F], '천관산 2F로 — 208번도로 · 1F 남')
    /**
     * ⚠️ **다섯 번 민다** — (14,45)에서 (14,50)까지. 바위가 선 x=14 줄은 폭 한 칸 통로(z 40~51)라, (14,47)까지는 막고
     * (14,50)에 가야 (13,49)로 빠지는 길이 열린다(격자를 바위 자리마다 칠해 본 값 — 45·46·47이면 72칸, 50이면 451칸).
     * 한 번만 밀고 지나간 예전 판들은 맵 지역 표식이 안 풀려 바위가 아예 없던 판이다(REPAIR §126)
     */
    const push = await api.strengthPush(MAP.coronet2F, CORONET_2F_BOULDER, 'ArrowDown', 5, Math.min(600_000, api.left()))
    note('2F 괴력 바위 (14,45)', push.ok ? `${String(push.pushed)}번 밀었다` : String(push.why))
    /**
     * ⚠️ **4F 방1·2(212)는 경유 목록에 안 적는다** — 목적지를 212로 주면 앞 내다보기가 「212 안의 다음 문」을
     * 모르고 아무 문으로나 든다. 동쪽 문으로 들면 폭포(0x13 — 폭포오르기·배지 8)로 막힌 주머니다(탐침 p6 (32,24)).
     * 바깥 남(211)에서 곧장 바깥 북(210)을 노리면 212를 지나는 문을 서쪽 (7,25)로 고른다
     */
    await via(api, note, [MAP.coronet2F, MAP.coronet3F, MAP.coronetOutsideS, MAP.coronetOutsideN,
      MAP.coronet4Fr3, MAP.coronet5F, MAP.coronet6F, MAP.spearPillar], '창기둥으로 — 3F · 바깥 · 4F · 5F · 6F')
    api.setSurf(false)
  }
  v = await vars()
  if ((v.spear ?? 0) < 1) {
    const grunts = await api.stepOn(MAP.spearPillar, SPEAR_GRUNTS, Math.min(300_000, api.left()))
    await api.clearTalk(); await api.settle()
    v = await vars()
    note('창기둥 그런트 (31,48)', `${grunts} · 창기둥 상태 ${String(v.spear)}`)
  }
  if ((v.spear ?? 0) >= 1 && (v.spear ?? 0) < 3) {
    const mars = await api.stepOn(MAP.spearPillar, SPEAR_MARS, Math.min(300_000, api.left()))
    await api.clearTalk(); await api.settle()
    /**
     * ⚠️ **컷신 끝의 `Warp`는 맵을 갈아 끼우는 데 몇 초가 걸린다** — 스크립트가 끝난 직후에 맵을 읽으면 아직 220이다.
     * 실측(탐침 p7): 여기서 곧장 읽어 「깨진 창기둥이 아니다」로 난천 장면을 건너뛰고 다리를 잃었다. 그 뒤에 쓴
     * 리포트는 221에 서 있었다
     */
    await untilMap(api, (m) => m !== MAP.spearPillar, 60_000)
    v = await vars()
    note('마스·쥬피터 (31,32) → 컷신', `${mars} · 창기둥 상태 ${String(v.spear)} · 지금 맵 ${String((await api.now()).map)}`)
  }
  // 깨진 창기둥 — 난천 「준비됐니?」 예 → 깨어진 세계 1F
  if ((await api.now()).map === MAP.spearDistorted) {
    // 난천 「준비됐니?」에 예 — 프레임 스크립트가 서기까지, 끝의 워프가 1F를 세우기까지 기다린다
    for (let i = 0; i < 6 && (await api.now()).map === MAP.spearDistorted; i++) {
      await api.clearTalk(); await api.settle()
      if (await untilMap(api, (m) => m !== MAP.spearDistorted, 15_000)) break
      /**
       * ⚠️ **장면이 이미 한 번 돌았으면 난천에게 말을 건다** — 프레임 표는 `VAR_SPEAR_PILLAR_DISTORTED_STATE`==1일 때만
       * 돌고 곧 2로 바꾼다. 「아니오」로 끝났거나 장면 도중에 쓴 리포트를 이어하면 2라서, 원작도 난천(script 2
       * `SpearPillarDistorted_Cynthia`)에게 말을 걸어 같은 물음을 다시 듣는다(`scripts_spear_pillar_distorted.s:120-135`)
       */
      const vv = await vars()
      if ((vv.spearDistorted ?? 0) >= 2) {
        const said = await api.talkToNpc(MAP.spearDistorted, 2, Math.min(120_000, api.left()))
        note('깨진 창기둥 난천에게 말 건다', String(said))
      }
    }
  }
  const at = await api.now()
  out.map = at.map
  out.ok = at.map === MAP.dw1F
  note('깨어진 세계 1F', `지금 맵 ${String(at.map)} · 창기둥 상태 ${String(v.spear)}`)
  return done()
}

/** 맵이 `ok`를 만족할 때까지 기다린다 — 스크립트 워프가 격자를 받는 동안 */
async function untilMap(api, ok, ms) {
  const till = Date.now() + ms
  while (Date.now() < till) {
    if (ok((await api.now()).map)) return true
    await new Promise((r) => { setTimeout(r, 500) })
  }
  return false
}

// ── ④ 깨어진 세계 (지시서 §3.4 · `tools/e2e/DISTORTION_HARNESS.md`) ──────────────

/** 기라티나 방에 기라티나가 섰다 — 진행 13 (`VAR_DISTORTION_WORLD_PROGRESS`) */
const giratinaHere = (st) => st.map === MAP.giratinaRoom && (st.progress ?? 0) >= 13

/**
 * **다리 H** — 1F에서 기라티나 방까지 판 위 계획(`distortionSolve.mjs`)으로 걷는다. 다리 하나를 밟고
 * 다시 세우고, 어긋나면 그 자리에서 다시 세운다. **기라티나가 서면 멈춘다** — A는 다리 I가 누른다.
 *
 * @param escape 1F 도착이 벽 속이면(제품 틈 §6-1) 안전망으로 걸어 나오는 걸음을 먼저 준다
 */
export async function walkDistortion(api, ctx, { escape = false, budget = 5_400_000, onFloor = null } = {}) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = noteOf(out, ctx)
  const walked = await api.distortionWalk(Math.min(budget, api.left()), { escape, stopWhen: giratinaHere, onFloor })
  const st = await api.distortionState()
  const v = (await api.storyVars()) ?? {}
  out.walk = walked
  note('깨어진 세계', `${walked.ok ? '닿았다' : '못 닿았다'} (${String(walked.why)}) · 맵 ${String(st?.map)} · 진행 ${String(v.distortion)}`)
  out.ok = st !== null && giratinaHere(st)
  out.ms = Date.now() - t0
  return out
}

// ── ⑤ 기라티나 방 → 마스터볼 → 송별의 샘 (지시서 §3.5) ─────────────────────────

/**
 * **다리 I** — 기라티나 방에 들어서 그림자 셋(진행 11·12·13)을 지나 기라티나에게 말을 걸고,
 * 첫 명령에서 **마스터볼**을 던진다. 배틀 뒤 난천·태홍 장면 → 포털 「예」 → 송별의 샘.
 *
 * ⚠️ **절대 싸우지 않는다.** `fightThrough`가 돌면 기라티나를 쓰러뜨려 「쓰러뜨림」 갈래로 간다 —
 * 이야기는 이어지지만 잡은 것이 아니다(롬 §N). 배틀은 이 다리가 직접 연다: `settle`에 맡기지 않는다
 */
export async function catchGiratina(api, ctx) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = noteOf(out, ctx)
  const done = () => { out.ms = Date.now() - t0; return out }
  const vars = async () => (await api.storyVars()) ?? {}

  let v = await vars()
  out.masterBall = await have(api, ITEM.masterBall)
  if (!out.masterBall && !v.giratinaCaught) { note('마스터볼', '가방에 없다 — 던질 것이 없다'); return done() }
  if (!v.giratinaCaught && (v.distortion ?? 0) < 14) {
    // 그림자 칸 셋((15,24) · (15,17) · (15,14))은 두 칸 뛰기라 판 위 계획으로 간다 — 기라티나가 서면 멈춘다
    if ((v.distortion ?? 0) < 13) {
      const walked = await walkDistortion(api, ctx)
      v = await vars()
      note('기라티나 앞', `${walked.ok ? '섰다' : '못 섰다'} · 진행 ${String(v.distortion)}`)
      if (!walked.ok) return done()
    }
    // 기라티나 쪽으로 돌아서 A — 배틀이 열리면 곧장 마스터볼
    await api.tap('ArrowUp', 80)
    await api.tap('Space', 300)
    for (let i = 0; i < 40 && (await api.now()).scene !== 'battle'; i++) await api.tap('Space', 250)
    if ((await api.now()).scene === 'battle') {
      out.thrown = await api.throwBalls(Math.min(180_000, api.left()), 1, { ball: ITEM.masterBall })
      note('마스터볼', JSON.stringify({ caught: out.thrown.caught, thrown: out.thrown.thrown, why: out.thrown.why ?? '' }))
    } else {
      note('기라티나 배틀', '안 열렸다')
    }
    await api.clearTalk(); await api.settle()
    v = await vars()
    note('배틀 뒤', `진행 ${String(v.distortion)} · 잡았다 ${String(v.giratinaCaught)}`)
  }
  // 포털 — (15,13)의 보이지 않는 객체에 말을 걸고 「예」
  if ((await api.now()).map === MAP.giratinaRoom) {
    const portal = await api.talkTo(MAP.giratinaRoom, GIRATINA, Math.min(300_000, api.left()))
    await api.clearTalk(); await api.settle()
    note('포털 (15,13)', portal ? '말 걸었다' : '못 걸었다')
  }
  await api.clearTalk(); await api.settle()
  v = await vars()
  const at = await api.now()
  out.map = at.map
  out.caught = v.giratinaCaught === true
  out.exited = v.exitedDistortion ?? null
  note('송별의 샘', `지금 맵 ${String(at.map)} · 나온 상태 ${String(v.exitedDistortion)} · 잡았다 ${String(v.giratinaCaught)}`)
  out.ok = at.map === MAP.sendoffSpring && (v.exitedDistortion ?? 0) >= 2 && out.caught
  return done()
}
