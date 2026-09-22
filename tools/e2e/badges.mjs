// 셋째 배지 이후의 **다리들** — `journey.mjs`와 탐침(`_cut42` 따위)이 같은 걸음을 쓴다
// (`docs/orders/JOURNEY_BADGE345_20260922.md` §3).
//
// ⚠️ **여기서도 읽기만 한다.** 변수·플래그·가방에 아무것도 넣지 않는다 — 걸음은
// `api`(= `driveStory`가 `after`에 넘기는 그 손잡이)의 방향키·A·B와 화면 단추뿐이다.
// 사탕은 부르는 쪽이 `ctx.candyUp`으로 넘긴다(가방에 넣는 것만 개발 모듈,
// 먹이는 것은 화면 — `RARE_CANDY_20260917`).
//
// ⚠️ **한 다리가 실패해도 다음 다리를 조용히 건너뛰지 않는다.** 결말을 그대로
// 돌려주고, 판정은 부르는 쪽(`journey.mjs`의 줄들)이 한다.
import { gridOf, matrixOf, npcsOf, pathTo, trainersOn, triggersOn, warpsOf } from './route.mjs'

/** 도구 번호 (`raw/decomp/generated/items.txt`의 줄 번호 − 1) */
export const ITEM = {
  /** 비전머신01 — 난천이 갤럭시 빌딩 앞에서 준다 */
  hm01: 420,
  /** 비전머신02 — **창고 바닥의 도구 볼**이다. 핸섬은 말만 한다 (지시서 §4.1 ⑧′) */
  hm02: 421,
  /** 탐사세트 — 지하 아저씨. 없으면 자전거를 받은 뒤 영원시티를 못 나간다 */
  explorerKit: 428,
  /** 배틀서처 — 207번도로에서 동행 상대가 준다 */
  vsSeeker: 443,
  /** 자전거 — 사이클숍 */
  bicycle: 450,
  /** 벌레회피스프레이 */
  repel: 79,
  /** 좋은상처약 */
  superPotion: 26,
}
/** 베어가르기 기술 번호 */
export const CUT = 15

/** 맵 번호 (`raw/decomp/generated/map_headers.txt`의 줄 번호 − 1) */
export const MAP = {
  eterna: 65, eternaMart: 66, eternaGym: 67, eternaCenter: 69,
  cycleShop: 71, galactic1F: 72, galactic2F: 73, galactic3F: 74, galactic4F: 75,
  undergroundMan: 84, gate206North: 80, route206: 350, gate206South: 351,
  route207: 353, coronetSouth: 207, route208: 354, gate208: 109,
  hearthome: 86, hearthomeMart: 87, hearthomeCenter: 101,
  hearthomeGymEntrance: 88, hearthomeRoom1: 89, hearthomeRoom2: 90, hearthomeLeader: 91,
  // 넷째 배지 길 (지시서 §4.1)
  gate209: 110, route209: 356, solaceon: 433, solaceonMart: 434, solaceonCenter: 435,
  route210south: 362, route215: 382, gate215: 149,
  veilstone: 132, veilstoneGym: 133, veilstoneCenter: 134, warehouse: 143,
  // 다섯째 배지 길 (지시서 §5.1)
  gate214: 381, route214: 380, valorLakefront: 336, route213: 373, gate213: 374,
  pastoria: 120, pastoriaMart: 121, pastoriaGym: 122, pastoriaCenter: 123,
}

/**
 * 영원시티의 **좌표 이벤트 칸** (`events_eterna_city.json`).
 *
 * 태홍은 (303, 523~526) — 상태 0. 난천은 (304~306, 522)·(304, 523~525) — 상태 1.
 * 둘 다 갤럭시 빌딩 문 (305,519) 앞이라 한 걸음에 이어진다
 */
const ETERNA_CYRUS = { x: 303, z: 524 }
const ETERNA_CYNTHIA = { x: 305, z: 522 }
/**
 * 난천 상자 **밖**의 한 칸. 다시 밟으려면 먼저 여기로 나간다.
 *
 * 상자는 (304~306, 522)와 (304, 523~525)다 — (307,522)는 둘 다에서 벗어나 있고
 * 상자에 **동쪽에서** 곧장 들어설 수 있는 이웃이다 (`events_eterna_city.json`)
 */
const ETERNA_CYNTHIA_OFF = { x: 307, z: 522 }
/** 갤럭시 빌딩 4F의 쥬피터 — 그 맵의 스크립트 2 */
export const JUPITER = { map: 75, script: 2, what: '쥬피터' }
/** 사이클숍 주인 (script 1) · 지하 아저씨 (script 1) */
const CYCLE_OWNER = 1
const UNDERGROUND_MAN = 1
/** 207번도로 동행 상대 장면이 걸린 칸 (340, 712~714) */
const ROUTE_207_COUNTERPART = { x: 340, z: 713 }
/** 천관산 1F 남의 태홍 장면 (14,23) — 길에 없는 한 칸이라 일부러 밟는다 */
const CORONET_CYRUS = { x: 14, z: 23 }
/** 연고 체육관 관장 멜리사 — 관장 방(91)의 스크립트 1 */
export const FANTINA = { map: 91, script: 1, what: '관장 멜리사' }

/**
 * 연고 체육관 문 좌표 표 (`engine/world/hearthomeGym.ts`의 `HEARTHOME_DOORS`).
 * 문 번호 → 칸. 방 1은 0~2, 방 2는 3~7이다
 */
const HEARTHOME_DOORS = {
  89: { 0: { x: 4, z: 2 }, 1: { x: 8, z: 2 }, 2: { x: 12, z: 2 } },
  90: { 3: { x: 4, z: 2 }, 4: { x: 9, z: 2 }, 5: { x: 14, z: 2 }, 6: { x: 19, z: 2 }, 7: { x: 24, z: 2 } },
}

const ms = (t0) => `${String(Math.round((Date.now() - t0) / 1000))}초`

/**
 * **그 칸에 닿는 계단으로 들어간다** (지시서 §3.1 ④ · REPAIR §53의 다음 자리).
 *
 * ⚠️ **한 맵이 여러 구역으로 갈려 있다.** 갤럭시 빌딩 4F가 그렇다 — 계단 둘이
 * 같은 층으로 올라가는데, (8,3)으로 올라가면 **막다른 주머니**고 쥬피터(14,6)는
 * 반대편 구역에 있다. 실측(2026-09-22 다리 a 4판): 하네스가 3F의 (20,3) 계단을
 * 골라 그 주머니에 섰고, 결과는 「쥬피터 → **못 걸었다** · 지금 맵 75」였다 —
 * 져서가 아니라 **닿지 못해서**다.
 *
 * `goTo`는 「그 맵에 닿았나」까지만 보므로 이 갈림을 모른다. 여기서는 **올라선
 * 뒤에 그 사람 옆에 설 수 있는가**로 계단을 고른다: 계단마다 `anchor`가 가리키는
 * 도착 칸을 꺼내(`warpsOf(toMap)[anchor]`) 그 칸에서 목표 옆칸까지 길이 있는지
 * 우리 격자로 물어본다.
 *
 * ⚠️ **모르면 안 막는다.** 어느 계단도 답을 못 내면 그냥 `goTo`로 간다 — 잘못
 * 고르면 돌아 나오면 되지만, 아무 데도 안 가면 그 자리가 통째로 죽는다.
 * 잘못 올라섰으면 **되돌아 나가** 다른 계단을 쓴다(최대 세 번).
 *
 * @param spot 그 맵에서 닿아야 하는 칸 (사람이면 그 사람의 지금 칸)
 * @returns `'arrived'` 또는 못 간 까닭
 */
/** 옆칸에서 그 칸으로 미는 방향키 (`talkTo`와 같은 표) */
const PUSH_KEY = [
  ['ArrowUp', 0, 1], ['ArrowDown', 0, -1], ['ArrowRight', -1, 0], ['ArrowLeft', 1, 0],
]

/**
 * **그 워프 칸을 밟아 넘어간다.**
 *
 * ⚠️ **`stepOn`으로는 워프 칸에 못 선다.** 그 함수는 계획에서 **워프 칸을 통째로
 * 피한다**(`avoid`에 `doors.some(...)`이 들어 있다) — 문은 밟는 것이 아니라 미는
 * 것이고, 워프를 목표로 두면 「계획은 났는데 마지막 한 걸음이 늘 막힌다」가 되기
 * 때문이다. 그래서 계단도 목표로 못 준다: 실측(2026-09-22 다리 a 5판) 4F로 올라갈
 * 계단 (14,3)을 `stepOn`에 주었더니 세 판 내리 「(14,3)에 설 길이 없다 — 큐가
 * 말랐다」가 났다. 큐는 마르지 않았다. **그 칸을 스스로 지웠던 것이다.**
 *
 * 그래서 문과 같은 손을 쓴다 — **옆칸에 서서 그쪽으로 민다.**
 */
async function boardWarp(api, mapId, warp, budgetMs) {
  const grid = gridOf(matrixOf(mapId))
  const others = warpsOf(mapId)
  const sides = PUSH_KEY
    .map(([key, dx, dz]) => ({ key, at: { x: warp.x + dx, z: warp.z + dz } }))
    .filter((one) => !grid.blocked(one.at.x, one.at.z))
    // 옆칸이 또 워프면 그리로 가다 딴 데로 샌다
    .filter((one) => !others.some((w) => w.x === one.at.x && w.z === one.at.z))
  if (sides.length === 0) return `계단 (${String(warp.x)},${String(warp.z)}) 옆이 사방 벽이다`
  const till = Date.now() + budgetMs
  for (const side of sides) {
    if (Date.now() >= till) break
    const stood = await api.stepOn(mapId, side.at,
      Math.max(0, Math.min(300_000, till - Date.now())), { intoDoors: [warp] })
    if (stood !== 'arrived') continue
    for (let i = 0; i < 8; i++) {
      await api.tap(side.key, 260)
      const s = await api.settle()
      if (s.map !== mapId) return 'arrived'
    }
  }
  return `계단 (${String(warp.x)},${String(warp.z)})을 밀었는데 안 넘어갔다`
}

export async function enterToward(api, fromMap, toMap, spot, budgetMs, log = null) {
  const till = Date.now() + budgetMs
  const room = () => Math.max(0, Math.min(till - Date.now(), api.left()))
  const matrix = matrixOf(toMap)
  /** 그 칸에서 목표 **옆칸**까지 길이 있나. 사람은 그 칸에 서 있으므로 옆이다 */
  const reaches = (from) => from !== undefined && from !== null
    && pathTo(matrix, { x: from.x, z: from.z },
      (x, z) => Math.abs(x - spot.x) + Math.abs(z - spot.z) === 1) !== null
  const landings = warpsOf(toMap)

  for (let i = 0; i < 3 && room() > 0; i++) {
    const here = await api.now()
    if (here.map === toMap) {
      if (reaches({ x: here.x, z: here.z })) return 'arrived'
      // 이 구역에서는 못 닿는다 — 되돌아 나갈 계단을 찾는다
      const back = warpsOf(toMap).find((w) => w.to === fromMap
        && pathTo(matrix, { x: here.x, z: here.z }, (x, z) => x === w.x && z === w.z,
          { enterBlockedGoal: true }) !== null)
      if (back === undefined) return '못 닿는 구역인데 되돌아 나갈 길도 없다'
      log?.(`  ${String(toMap)}의 (${String(here.x)},${String(here.z)})에서는 못 닿는다`
        + ` — (${String(back.x)},${String(back.z)})로 되돌아 나간다`)
      await boardWarp(api, toMap, back, Math.min(300_000, room()))
      await api.settle()
      continue
    }
    if (here.map !== fromMap) {
      const go = await api.goTo(fromMap, Math.min(600_000, room()))
      if (go !== 'arrived') return go
    }
    const good = warpsOf(fromMap).filter((w) => w.to === toMap && reaches(landings[w.anchor]))
    log?.(`  ${String(toMap)}로 가는 계단 ${String(warpsOf(fromMap).filter((w) => w.to === toMap).length)}개 중`
      + ` 닿는 것 ${String(good.length)}개`
      + (good.length === 0 ? '' : ` — (${String(good[0].x)},${String(good[0].z)})로 오른다`))
    if (good.length === 0) return api.goTo(toMap, Math.min(600_000, room()))
    const boarded = await boardWarp(api, fromMap, good[0], Math.min(600_000, room()))
    if (boarded !== 'arrived') { log?.(`  ${boarded}`); return boarded }
    await api.settle()
  }
  const end = await api.now()
  return end.map === toMap ? (reaches({ x: end.x, z: end.z }) ? 'arrived' : '못 닿는 구역에 섰다') : '계단을 못 탔다'
}

/**
 * **센터에 들를 만큼 다쳤는가.**
 *
 * ⚠️ **`fullyHealed`로 재면 안 된다.** 그쪽은 HP·상태·**PP까지** 다 차야 참이라,
 * 배틀 한 번 뒤면 거의 늘 거짓이다 — 그 값으로 센터에 가면 층마다 왕복이라
 * 걷는 데만 예산을 태운다. 사람은 **위태로울 때** 들른다.
 *
 * 기준은 셋이다: 쓰러진 마리가 있다 · 선두가 절반 아래다 · 상태 이상이 있다.
 * 관측 불가면 **안 간다** — 못 읽는 것을 「다쳤다」로 접으면 없는 여정이 생긴다
 */
function hurt(party) {
  if (!Array.isArray(party) || party.length === 0) return false
  const alive = party.filter((p) => p.max !== null && p.max > 0)
  if (alive.length === 0) return false
  if (alive.some((p) => p.hp === 0)) return true
  const lead = alive[0]
  if (lead.hp / lead.max < 0.5) return true
  return alive.some((p) => p.status !== 'ok')
}

/**
 * **그 맵의 트레이너를 차례로 친다** — 눈이 마주치기를 기다리지 않는다.
 * 지면(맵이 바뀌면) 그 사실을 돌려준다
 */
async function fightTrainers(api, ctx, mapId, what) {
  const fought = []
  for (const t of trainersOn(mapId)) {
    if (api.left() <= 0) break
    const before = await api.now()
    if (before.map !== mapId) {
      const back = await api.goTo(mapId, Math.min(300_000, api.left()))
      if (back !== 'arrived') { fought.push({ x: t.x, z: t.z, said: false, why: `되돌아가지 못했다 (${back})` }); break }
    }
    const said = await api.talkTo(mapId, { x: t.x, z: t.z }, Math.min(180_000, api.left()))
    await api.settle()
    const after = await api.now()
    fought.push({ x: t.x, z: t.z, said, mapAfter: after.map })
    ctx.log(`  ${what} 트레이너 ${String(t.x)},${String(t.z)} → ${said ? '붙었다' : '못 걸었다'} · 지금 맵 ${String(after.map)}`)
    // 배틀 뒤 맵이 바뀌었으면 전멸이다 — 센터로 밀려났다
    if (after.map !== mapId) return { fought, blackedOut: true }
  }
  return { fought, blackedOut: false }
}

/**
 * **다리 A — 영원시티에서 자전거까지** (지시서 §1 ①~⑥).
 *
 * 태홍 → 난천(베어가르기) → 나무 → 빌딩 4층 → 쥬피터 → 자전거 → 탐사세트.
 * 끝나면 영원시티에 서 있다. 결말은 전부 **읽은 값**이다
 */
export async function eternaToBike(api, ctx, {
  phases = ['cut', 'floors', 'jupiter', 'bike'],
  /**
   * 쥬피터에게 붙기 **직전에 한 번** 부른다 — 사탕을 먹이는 자리다.
   *
   * ⚠️ **여기서 사탕을 안 만든다.** 가방에 넣는 것은 부르는 쪽의 개발 모듈이고
   * (`RARE_CANDY_20260917`), 이 파일은 그 걸음을 **부를 자리만** 연다.
   * 쥬피터는 배지가 아니지만 §0이 「관장급」으로 세는 상대다
   */
  beforeJupiter = null,
} = {}) {
  const t0 = Date.now()
  const out = { steps: [], phases }
  const note = (what, detail) => { out.steps.push({ what, detail }); ctx.log(`  ${what} → ${detail}`) }
  let v = await api.storyVars()

  if (phases.includes('cut')) {
  // ① 태홍 장면 — 상태 0 → 1
  const came = await api.goTo(MAP.eterna, Math.min(600_000, api.left()))
  if (came !== 'arrived') { out.why = `영원시티에 못 갔다 (${came})`; return out }
  v = await api.storyVars()
  if ((v?.eterna ?? 0) < 1) {
    const stood = await api.stepOn(MAP.eterna, ETERNA_CYRUS, Math.min(300_000, api.left()))
    await api.clearTalk(); await api.settle()
    v = await api.storyVars()
    note('태홍 장면 (303,524)', `${stood} · 영원 상태 ${String(v?.eterna)}`)
  } else note('태홍 장면', `이미 지났다 (상태 ${String(v.eterna)})`)
  out.cyrus = v?.eterna ?? null

  // ② 난천 — 상태 1 → 2 · 비전머신01
  if ((v?.eterna ?? 0) < 2) {
    /**
     * ⚠️ **한 번 밟는 것으로는 못 믿는다** (지시서 §1.2 · 실측 2026-09-22).
     * 문을 고친 뒤 `_cyn42` 3판 중 **하나에서** 이 좌표 이벤트가 안 돌았다 —
     * 주인공은 (305,522)에 서 있었고, 제품의 `triggerAt`은 그 칸에 script 1을
     * 준다고 답했고(`_cyn43` ①), 스크립트도 안 돌고 오류도 없었다. 원인은 아직
     * **못 밝혔다.**
     *
     * 트리거는 **칸에 들어설 때** 한 번 본다(`StepTrace`) — 그 칸에 선 채로는
     * 다시 안 본다. 그래서 사람이 할 걸음을 그대로 한다: **나갔다 다시 밟는다.**
     * 몇 번 만에 됐는지는 `tries`에 남겨 판마다 세다 — 그 수가 이 결함의 크기다
     */
    out.tries = []
    for (let t = 0; t < 4 && (v?.eterna ?? 0) < 2 && api.left() > 0; t++) {
      if (t > 0) {
        // 상자 밖으로 한 번 나간다 — 안 나가면 「들어섰다」가 다시 안 난다
        const off = await api.stepOn(MAP.eterna, ETERNA_CYNTHIA_OFF, Math.min(120_000, api.left()))
        note('난천 칸 다시 밟기 앞 — 상자 밖으로', off)
      }
      const stood = await api.stepOn(MAP.eterna, ETERNA_CYNTHIA, Math.min(300_000, api.left()))
      await api.clearTalk(); await api.settle()
      v = await api.storyVars()
      out.tries.push({ n: t + 1, stood, eterna: v?.eterna ?? null })
      note(`난천 (305,522)${t > 0 ? ` ${String(t + 1)}번째` : ''}`,
        `${stood} · 영원 상태 ${String(v?.eterna)}`)
    }
    const bag = await api.bagState()
    out.hm01 = (bag?.items ?? []).some((one) => one.item === ITEM.hm01 && one.count > 0)
    note('난천 결말', `${String(out.tries.length)}번 밟았다 · 영원 상태 ${String(v?.eterna)}`
      + ` · 비전머신01 ${out.hm01 ? '있다' : '없다'}`)
  } else {
    const bag = await api.bagState()
    out.hm01 = (bag?.items ?? []).some((one) => one.item === ITEM.hm01 && one.count > 0)
    note('난천', `이미 지났다 (상태 ${String(v.eterna)}) · 비전머신01 ${out.hm01 ? '있다' : '없다'}`)
  }
  out.cynthia = v?.eterna ?? null

  // ③ 베어가르기를 가르치고 나무를 벤다
  out.taught = await api.teachHm(ITEM.hm01, CUT, Math.min(300_000, api.left()))
  note('베어가르기 가르치기', out.taught.ok ? `${String(out.taught.slot)}번째가 배웠다` : String(out.taught.why))
  if (api.left() <= 0) return out
  out.cut = await api.clearWay(MAP.eterna, MAP.galactic1F, Math.min(600_000, api.left()), { sprite: 86, maxHits: 3 })
  note('나무를 베고 빌딩 1F로', out.cut.ok ? `들어갔다 (${String(out.cut.broke.length)}그루 건드렸다)` : String(out.cut.why))
  if (!out.cut.ok) { out.why = `나무를 못 벴다 — ${String(out.cut.why)}`; return out }
  }

  // ④ 층마다 그런트 → 4F 쥬피터 (지면 낫고 **한 번** 더)
  //
  // `journey`는 쥬피터를 제 `NPC_STOPS`·`LEADER_RETRY`로 만나므로 `floors`까지만 부른다 —
  // 그때는 4F에 서서 돌아온다. 탐침은 `jupiter`까지 한 번에 간다
  if (phases.includes('floors')) {
  out.floors = []
  for (let round = 0; round < (phases.includes('jupiter') ? 2 : 1); round++) {
    let lost = false
    for (const floor of [MAP.galactic1F, MAP.galactic2F, MAP.galactic3F, MAP.galactic4F]) {
      if (api.left() <= 0) break
      /**
       * **층에 들기 전에 다쳤으면 낫는다** — 사람이 하는 걸음이다.
       *
       * ⚠️ 실측(2026-09-22 다리 a 두 판): 빌딩은 그런트 여섯을 **한 번도 안 낫고**
       * 잇달아 치르는 자리라, 선두 하나로 버티면 2F에서 전멸했다. 약은 규칙대로
       * 관장에게만 쓰고(§3.3), 대신 **센터에 들른다**. 이미 다 나았으면 안 간다
       */
      const before = await api.partyState()
      if (hurt(before)) {
        const got = await api.healAt(MAP.eternaCenter, Math.min(300_000, api.left()))
        note(`빌딩 ${String(floor - MAP.galactic1F + 1)}F 앞 회복`, got.ok ? '나았다' : String(got.why))
      }
      /**
       * ⚠️ **4F는 계단을 골라 올라간다.** 그 층은 구역이 둘로 갈려 있고 계단
       * 하나는 막다른 주머니로 간다 — `enterToward`가 쥬피터에게 닿는 쪽을 고른다.
       * 쥬피터 자리는 **배치표에서 읽는다**(표를 여기 또 적지 않는다)
       */
      const jupiter = floor === MAP.galactic4F
        ? npcsOf(MAP.galactic4F).find((n) => n.script === JUPITER.script) : undefined
      const went = jupiter === undefined
        ? await api.goTo(floor, Math.min(600_000, api.left()))
        : await enterToward(api, MAP.galactic3F, floor, { x: jupiter.x, z: jupiter.z },
          Math.min(900_000, api.left()), (line) => { ctx.log(line) })
      if (went !== 'arrived') { out.floors.push({ floor, went }); lost = true; break }
      const f = await fightTrainers(api, ctx, floor, `빌딩 ${String(floor - MAP.galactic1F + 1)}F`)
      out.floors.push({ floor, went, ...f })
      if (f.blackedOut) { lost = true; break }
    }
    if (lost) {
      /**
       * ⚠️ **「전멸」과 「못 올라갔다」를 한 줄로 적지 않는다.** 한동안 이 줄이
       * 둘 다 「빌딩에서 전멸」이라고 했다 — 실측 5판에서 진짜 원인(4F 계단을
       * 못 탔다)이 그 말에 덮여 있었다
       */
      const why = out.floors.at(-1)?.went === 'arrived' ? '전멸했다' : String(out.floors.at(-1)?.went)
      const healed = await api.healAt(MAP.eternaCenter, Math.min(300_000, api.left()))
      note(`빌딩에서 멈췄다 (${why}) — 회복`, healed.ok ? '나았다' : String(healed.why))
      if (!phases.includes('jupiter')) { out.why = `빌딩에서 멈췄다 — ${why}`; return out }
      continue
    }
    if (!phases.includes('jupiter')) break
    if ((await api.now()).map !== MAP.galactic4F) break
    if (round === 0 && typeof beforeJupiter === 'function') {
      out.candy = await beforeJupiter()
      /**
       * ⚠️ **먹인 대사를 통째로 안 적는다.** `feedCandy`는 화면에 뜬 글을 다
       * 모아 오는데(레벨 하나에 세 줄) 한 판이면 수백 줄이다 — 로그가 그것으로
       * 덮이면 정작 읽어야 할 「어디서 막혔나」가 안 보인다. 셈만 적는다
       */
      note('쥬피터 앞 사탕', out.candy.map((c) => `${String(c.what)} `
        + (c.ran ? `${String(c.fed)}알 ${String(c.from)}→L${String(c.level)}` : `미실행(${String(c.why)})`)).join(' · '))
    }
    const said = await api.talkToNpc(MAP.galactic4F, JUPITER.script, Math.min(300_000, api.left()))
    await api.settle()
    v = await api.storyVars()
    const after = await api.now()
    out.jupiter = { said, eterna: v?.eterna ?? null, left: v?.galacticLeft ?? null, mapAfter: after.map, round }
    note(`쥬피터${round > 0 ? ' (재도전)' : ''}`, `${said ? '붙었다' : '못 걸었다'} · 영원 상태 ${String(v?.eterna)} · 떠났다 ${String(v?.galacticLeft)} · 지금 맵 ${String(after.map)}`)
    if (v?.galacticLeft === true) break
    if (api.left() > 600_000) {
      const healed = await api.healAt(MAP.eternaCenter, Math.min(300_000, api.left()))
      note('쥬피터에게 져서 회복', healed.ok ? '나았다' : String(healed.why))
    }
  }
  if (phases.includes('jupiter') && v?.galacticLeft !== true) { out.why = '쥬피터를 못 이겼다'; return out }
  }

  if (phases.includes('bike')) {
  v = await api.storyVars()
  if (v?.galacticLeft !== true) { out.why = `쥬피터를 아직 안 이겼다 (영원 상태 ${String(v?.eterna)})`; return out }
  // ⑤ 자전거 · ⑥ 탐사세트
  const shop = await api.goTo(MAP.cycleShop, Math.min(600_000, api.left()))
  const owner = shop === 'arrived' && await api.talkToNpc(MAP.cycleShop, CYCLE_OWNER, Math.min(180_000, api.left()))
  await api.clearTalk(); await api.settle()
  let bag = await api.bagState()
  out.bike = (bag?.items ?? []).some((one) => one.item === ITEM.bicycle && one.count > 0)
  note('사이클숍', `${shop} · 주인 ${owner ? '만났다' : '못 만났다'} · 자전거 ${out.bike ? '받았다' : '없다'}`)

  const house = await api.goTo(MAP.undergroundMan, Math.min(600_000, api.left()))
  const man = house === 'arrived' && await api.talkToNpc(MAP.undergroundMan, UNDERGROUND_MAN, Math.min(180_000, api.left()))
  await api.clearTalk(); await api.settle()
  bag = await api.bagState()
  out.kit = (bag?.items ?? []).some((one) => one.item === ITEM.explorerKit && one.count > 0)
  note('지하 아저씨', `${house} · ${man ? '만났다' : '못 만났다'} · 탐사세트 ${out.kit ? '받았다' : '없다'}`)

  // 밖으로 나와 출구 잠금이 풀렸는지 **읽는다** (OnTransition이 정한다)
  const back = await api.goTo(MAP.eterna, Math.min(300_000, api.left()))
  v = await api.storyVars()
  out.exits = v?.eternaExits ?? null
  note('영원시티로', `${back} · 출구 잠금 ${String(out.exits)} (0이어야 나간다)`)
  }
  out.ms = Date.now() - t0
  return out
}

/**
 * **다리 B — 자전거길 · 207번도로 · 천관산 · 208번도로 · 연고시티** (지시서 §1 ⑦~⑫).
 *
 * @param stopAt 어느 맵까지 (기본 연고시티). `journey`는 다리를 자리마다 끊어 재므로 넘긴다
 */
export async function rideToHearthome(api, ctx, { stopAt = MAP.hearthome, repel = true } = {}) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = (what, detail) => { out.steps.push({ what, detail }); ctx.log(`  ${what} → ${detail}`) }
  const legs = [MAP.gate206North, MAP.route207, MAP.coronetSouth, MAP.route208, MAP.hearthome]
  /**
   * **이미 지난 다리는 다시 안 걷는다.** `journey`는 자리마다 이 함수를 다시 부르므로,
   * 지금 선 맵이 다리 목록에 있으면 그 다음 다리부터다 (영원시티(65)면 처음부터)
   */
  const here = (await api.now()).map
  const from = legs.indexOf(here) + 1
  const want = legs.slice(from, legs.indexOf(stopAt) + 1)
  out.want = want

  // 타고 게이트로 — 게이트 안 (5~8,8)의 좌표 이벤트가 걷는 사람을 되민다
  if (want.includes(MAP.gate206North)) {
    if (repel) {
      const sprayed = await api.useItem(ITEM.repel, Math.min(150_000, api.left()))
      note('벌레회피스프레이', sprayed.ok ? `뿌렸다 (남은 것 ${String(sprayed.left)})` : String(sprayed.why))
    }
    out.ride = await api.rideBike(Math.min(120_000, api.left()))
    note('자전거 타기', out.ride.ok ? (out.ride.already ? '이미 타고 있다' : '탔다') : String(out.ride.why))
    const gate = await api.goTo(MAP.gate206North, Math.min(600_000, api.left()))
    out.gate = { went: gate, riding: await api.riding() }
    note('206번도로 북쪽 게이트(80)', `${gate} · 타고 있나 ${String(out.gate.riding)}`)
    if (stopAt === MAP.gate206North) { out.ms = Date.now() - t0; return out }
  }

  if (want.includes(MAP.route207)) {
    const r207 = await api.goTo(MAP.route207, Math.min(1_200_000, api.left()))
    out.route207 = { went: r207, riding: await api.riding() }
    note('207번도로(353)', `${r207} · 타고 있나 ${String(out.route207.riding)}`)
    if (r207 === 'arrived') {
      let v = await api.storyVars()
      if ((v?.route207 ?? 0) === 0) {
        const stood = await api.stepOn(MAP.route207, ROUTE_207_COUNTERPART, Math.min(300_000, api.left()))
        await api.clearTalk(); await api.settle()
        v = await api.storyVars()
        const bag = await api.bagState()
        out.counterpart = {
          stood, state: v?.route207 ?? null,
          vsSeeker: (bag?.items ?? []).some((one) => one.item === ITEM.vsSeeker && one.count > 0),
        }
        note('동행 상대 장면 (340,713)', `${stood} · 상태 ${String(v?.route207)} · 배틀서처 ${out.counterpart.vsSeeker ? '받았다' : '없다'}`)
      } else note('동행 상대 장면', `이미 지났다 (상태 ${String(v.route207)})`)
    }
    if (stopAt === MAP.route207) { out.ms = Date.now() - t0; return out }
  }

  if (want.includes(MAP.coronetSouth)) {
    if (repel) {
      const sprayed = await api.useItem(ITEM.repel, Math.min(150_000, api.left()))
      note('벌레회피스프레이 (산 앞)', sprayed.ok ? `뿌렸다 (남은 것 ${String(sprayed.left)})` : String(sprayed.why))
    }
    const cave = await api.goTo(MAP.coronetSouth, Math.min(900_000, api.left()))
    out.coronet = { went: cave }
    note('천관산 1F 남(207)', cave)
    if (cave === 'arrived') {
      let v = await api.storyVars()
      if ((v?.coronet ?? 0) === 0) {
        const stood = await api.stepOn(MAP.coronetSouth, CORONET_CYRUS, Math.min(300_000, api.left()))
        await api.clearTalk(); await api.settle()
        v = await api.storyVars()
        out.coronet.cyrus = { stood, state: v?.coronet ?? null }
        note('태홍 장면 (14,23)', `${stood} · 상태 ${String(v?.coronet)}`)
      }
    }
    if (stopAt === MAP.coronetSouth) { out.ms = Date.now() - t0; return out }
  }

  if (want.includes(MAP.route208)) {
    const r208 = await api.goTo(MAP.route208, Math.min(900_000, api.left()))
    out.route208 = { went: r208 }
    note('208번도로(354)', r208)
    if (stopAt === MAP.route208) { out.ms = Date.now() - t0; return out }
  }

  if (want.includes(MAP.hearthome)) {
    const city = await api.goTo(MAP.hearthome, Math.min(1_200_000, api.left()))
    await api.clearTalk(); await api.settle()
    const v = await api.storyVars()
    out.hearthome = { went: city, state: v?.hearthome ?? null }
    note('연고시티(86)', `${city} · 키라 장면 상태 ${String(v?.hearthome)}`)
  }
  out.ms = Date.now() - t0
  return out
}

/**
 * **문으로 들어간다** — 문 아래 칸에 서서 위로 민다.
 *
 * 연고 체육관의 문 셋·다섯은 우리 표에서 **전부 다음 방으로** 적혀 있어서(제품이
 * 들어설 때 틀린 문의 목적지를 갈아 끼운다) `goTo`로는 어느 문을 고를지 못 정한다
 */
async function enterDoor(api, mapId, door, budgetMs) {
  // ⚠️ **이 문만 걸음 금지에서 뺀다** (`drive`의 `doorStepBan` · 지시서 §1.1).
  // 안 빼면 문 아래 칸에 **아래에서** 올라설 수 없어 어느 문도 못 고른다
  const stood = await api.stepOn(mapId, { x: door.x, z: door.z + 1 }, budgetMs,
    { intoDoors: [door] })
  if (stood !== 'arrived') return { ok: false, why: `문 앞에 못 섰다 (${stood})` }
  for (let i = 0; i < 6; i++) {
    await api.tap('ArrowUp', 260)
    const s = await api.settle()
    if (s.map !== mapId) return { ok: true, map: s.map }
  }
  return { ok: false, why: '문을 밀었는데 안 열렸다' }
}

/**
 * **다리 C — 연고 체육관** (지시서 §3.6).
 *
 * 문 답은 제품이 든 것을 **읽는다**(`api.hearthomeDoor`). 사람은 그 답을 볼 길이
 * 없으므로(힌트 그림 없음 — §5 ①) 이 다리의 통과는 「게임이 이어진다」지
 * 「사람이 할 수 있다」가 아니다 — 부르는 쪽이 그 사실을 줄에 적는다.
 *
 * @param stopAt `MAP.hearthomeLeader`면 관장 방에 서기까지(관장은 부르는 쪽이 만난다)
 */
export async function hearthomeDoors(api, ctx, { stopAt = MAP.hearthomeLeader } = {}) {
  const t0 = Date.now()
  const out = { steps: [], rooms: [], bounced: 0 }
  const note = (what, detail) => { out.steps.push({ what, detail }); ctx.log(`  ${what} → ${detail}`) }

  const entrance = await api.goTo(MAP.hearthomeGymEntrance, Math.min(600_000, api.left()))
  note('연고 체육관 입구(88)', entrance)
  if (entrance !== 'arrived') { out.why = `입구에 못 갔다 (${entrance})`; return out }

  for (let attempt = 0; attempt < 8 && api.left() > 0; attempt++) {
    const s = await api.now()
    if (s.map === MAP.hearthomeLeader) break
    if (s.map === MAP.hearthomeGymEntrance) {
      // 입구 → 방 1은 문이 하나뿐이다 (4,2)
      const went = await api.goTo(MAP.hearthomeRoom1, Math.min(300_000, api.left()))
      note(`방 1(89)로${attempt > 0 ? ` (${String(attempt + 1)}번째)` : ''}`, went)
      if (went !== 'arrived') { out.why = `방 1에 못 들어갔다 (${went})`; break }
      continue
    }
    if (s.map !== MAP.hearthomeRoom1 && s.map !== MAP.hearthomeRoom2) {
      const back = await api.goTo(MAP.hearthomeGymEntrance, Math.min(300_000, api.left()))
      note('체육관 밖이다 — 입구로', back)
      if (back !== 'arrived') { out.why = `입구로 못 돌아갔다 (${back})`; break }
      continue
    }
    const room = s.map
    // 이 방의 트레이너를 먼저 다 친다 (방을 나가면 답이 다시 뽑히므로 **문은 마지막**이다)
    const f = await fightTrainers(api, ctx, room, `방 ${room === MAP.hearthomeRoom1 ? '1' : '2'}`)
    if (f.blackedOut) { out.why = '체육관에서 전멸했다'; out.rooms.push({ room, ...f }); break }
    const answer = await api.hearthomeDoor()
    const door = answer === null ? null : HEARTHOME_DOORS[room]?.[answer.door] ?? null
    out.rooms.push({ room, fought: f.fought, answer })
    if (door === null) {
      note(`방 ${String(room)} 문 답`, `못 읽었다 (${JSON.stringify(answer)}) — 첫 문으로 간다`)
    }
    const pick = door ?? Object.values(HEARTHOME_DOORS[room])[0]
    const went = await enterDoor(api, room, pick, Math.min(300_000, api.left()))
    const after = await api.now()
    const bounced = after.map === MAP.hearthomeGymEntrance
    if (bounced) out.bounced += 1
    note(`방 ${String(room)} 문 ${String(answer?.door ?? '?')} (${String(pick.x)},${String(pick.z)})`,
      `${went.ok ? `들어갔다 → 맵 ${String(after.map)}` : String(went.why)}${bounced ? ' · **입구로 되돌려졌다**' : ''}`)
    if (!went.ok) { out.why = went.why; break }
    if (after.map === stopAt) break
  }
  out.at = (await api.now()).map
  out.ok = out.at === stopAt
  out.ms = Date.now() - t0
  return out
}

// ── 넷째 배지 — 장막 체육관의 샌드백 ─────────────────────────────────────────

/** 장막 체육관 (지시서 §4.2). 문 위 칸에서 자두 아래 칸까지 */
export const VEILSTONE = {
  map: 133, script: 2, what: '관장 자두',
  door: { x: 12, z: 30 },
  front: { x: 12, z: 5 },
  /**
   * 훑을 네모 — **방만**이다 (실측: 걸을 수 있는 칸은 x 0~25 · z 0~31 안이고
   * 그 바깥은 타일 표가 없어 격자가 「안 막혔다」고 하는 빈 자리다. 25열이
   * 통째로 벽이라 방에서는 안 닿는다)
   */
  box: { x0: 0, z0: 0, x1: 25, z1: 31 },
}
/** 원작 방향 번호(북 0 · 남 1 · 서 2 · 동 3) → 방향키 */
const DIR_KEY = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']

/**
 * **샌드백을 차서 자두 앞에 선다** (지시서 §4.2).
 *
 * 풀이는 `gymSolve.mjs`가 하고, 그 풀이가 쓰는 표·규칙은 **전부 제품**에서 온다
 * (`veilstoneTravel`은 페이지 안, 지금 놓인 자리는 `api.veilstoneState()`).
 * 여기서 하는 일은 **손**이다 — 선 자리로 가서, 샌드백을 보고, A를 누르고,
 * 미끄러짐이 멎기를 기다리고, **계획한 끝 칸으로 갔는지 읽는다.**
 *
 * ⚠️ **찬 것은 못 되돌린다.** 그래서 차기마다 결과를 읽어 계획과 어긋나면 **거기서
 * 멈춘다** — 어긋난 채로 계속 차면 방을 영영 못 여는 자리로 갈 수 있다. 어긋났으면
 * 그 사실이 결과에 그대로 적히고, 다시 풀 기회는 **방을 나갔다 들어오는 것**이다
 * (제품이 들어설 때마다 샌드백을 처음 자리에 놓는다 — `initVeilstoneGym`).
 */
export async function veilstoneKicks(api, ctx) {
  const t0 = Date.now()
  const out = { kicks: [] }
  const note = (what, detail) => { ctx.log(`  ${what} → ${detail}`) }

  /**
   * ⚠️ **트레이너 넷은 장치 판정에 안 들어간다.** `featureWalls`는 격자와 장치
   * (샌드백·타이어)를 얹은 값이고 **사람은 안 센다** — 그런데 넷이 서 있는 칸은
   * 못 지나가고(이겨도 그 자리에 그대로 선다), 샌드백도 그 칸을 지나 미끄러지지
   * 않는다. 그래서 **풀이에도 길 찾기에도** 더한다 (지시서 §4.2).
   * 배치표 자리다 — 이 방의 넷은 순회형이 아니라 제자리에 선다
   */
  const guards = trainersOn(VEILSTONE.map).map((t) => `${String(t.x)},${String(t.z)}`)
  const withGuards = (walls) => [...new Set([...walls, ...guards])]

  const state = await api.veilstoneState()
  if (state === null) { out.why = '장막 체육관 상태를 못 읽었다 (관측 불가)'; return out }
  const walls = await api.featureWalls(VEILSTONE.box)
  if (walls === null) { out.why = '장막 체육관 벽을 못 읽었다 (관측 불가)'; return out }
  /**
   * ⚠️ **격자는 샌드백도 타이어도 모른다.** 길 찾기에 그대로 두면 계획이 그 위를
   * 지나고, 걸음은 벽에 부딪혀 「멈췄다」가 된다 (꽃시계와 같은 자리다). 그래서
   * 제품이 낸 **지금 벽**을 길 찾기에 얹어 준다 — 그리고 **찰 때마다 다시 얹는다**
   */
  ctx.setWalls?.(VEILSTONE.map, withGuards(walls))

  /**
   * ⚠️ **벽에서 샌드백·타이어를 빼야 한다.** `featureWalls`는 제품이 장치까지
   * 얹어 내는 값이라 **샌드백과 타이어가 이미 들어 있다.** 풀이는 그 둘을 스스로
   * 옮기며 세므로, 여기서 빼지 않으면 「처음 자리에 영영 있는 벽」이 된다
   */
  const moving = new Set([...state.stacks, ...state.bags.map(([x, z]) => `${String(x)},${String(z)}`)])
  const still = withGuards(walls.filter((k) => !moving.has(k)))
  /**
   * ⚠️ **탐색은 페이지 안에서 돈다** — 제품의 `veilstoneTravel`이 TS라 여기서 못
   * 부른다. 같은 `gymSolve.mjs`를 단위 시험도 그대로 부른다(굽는 쪽이 하나다)
   */
  const plan = await api.veilstonePlan({
    start: VEILSTONE.door, goal: VEILSTONE.front, wall: still, stacks: state.stacks,
  })
  if (plan === null) { out.why = '풀이를 못 돌렸다 (관측 불가)'; return out }
  out.plan = plan
  note('샌드백 풀이', plan.ok
    ? `${String(plan.kicks.length)}번 차면 열린다 (상태 ${String(plan.seen)} · ${String(plan.ms)}ms)`
    : `못 풀었다 — ${String(plan.why)}`)
  if (!plan.ok) { out.why = `풀이가 없다 — ${String(plan.why)}`; return out }

  for (const [n, kick] of plan.kicks.entries()) {
    if (api.left() <= 0) { out.why = '시간이 다 됐다'; return out }
    const stood = await api.stepOn(VEILSTONE.map, kick.stand, Math.min(300_000, api.left()))
    if (stood !== 'arrived') {
      out.why = `${String(n + 1)}번째 차기: 설 자리 (${String(kick.stand.x)},${String(kick.stand.z)})에 못 갔다 (${stood})`
      return out
    }
    // 샌드백 쪽으로 돌아선다 — 그 칸은 막혀 있으므로 짧게 누르면 **돌기만** 한다
    await api.tap(DIR_KEY[kick.dir], 40)
    await api.tap('Space', 120)
    // 미끄러지는 동안은 기다린다 (`veilstoneBusy`)
    let after = null
    for (let i = 0; i < 80; i++) {
      after = await api.veilstoneState()
      if (after !== null && after.busy !== true) break
      await api.settle()
    }
    // 샌드백이 옮겨 갔으니 벽이 달라졌다 — 다음 걸음 전에 갈아 끼운다
    const nowWalls = await api.featureWalls(VEILSTONE.box)
    if (nowWalls !== null) ctx.setWalls?.(VEILSTONE.map, withGuards(nowWalls))
    const landed = after !== null
      && after.bags.some(([x, z]) => x === kick.to.x && z === kick.to.z)
    out.kicks.push({ n: n + 1, ...kick, landed })
    note(`차기 ${String(n + 1)}/${String(plan.kicks.length)}`,
      `(${String(kick.bag.x)},${String(kick.bag.z)}) → (${String(kick.to.x)},${String(kick.to.z)})`
      + ` · ${landed ? '갔다' : '**계획과 다르다**'}`)
    if (!landed) {
      out.why = `${String(n + 1)}번째 차기가 계획한 칸으로 안 갔다`
      return out
    }
  }

  const front = await api.stepOn(VEILSTONE.map, VEILSTONE.front, Math.min(300_000, api.left()))
  out.at = front
  out.ok = front === 'arrived'
  out.ms = Date.now() - t0
  note('자두 앞', `${front} (${String(VEILSTONE.front.x)},${String(VEILSTONE.front.z)})`)
  return out
}

// ── 다섯째 배지 — 들판 체육관의 물 높이 ──────────────────────────────────────

/**
 * 들판 체육관 (지시서 §5.2 · 단추 좌표는 `events_pastoria_city_gym.json` 실측).
 *
 * 물 높이 셋은 제품의 `PASTORIA_WATER`다 — 낮음 0 · 가운데 2 · 높음 4
 */
export const PASTORIA = {
  map: 122, script: 5, what: '관장 맥실러',
  door: { x: 13, z: 41 },
  front: { x: 13, z: 5 },
  /**
   * 훑을 네모 — **방만**이다 (실측: 걸을 수 있는 칸은 x 0~26 · z 0~43 안에 있고,
   * 그 바깥 x 27~31은 타일 표가 없어 격자가 「안 막혔다」고 하는 빈 자리다.
   * 26열이 통째로 벽이라 방에서는 닿지 않지만, 굳이 훑을 까닭도 없다)
   */
  box: { x0: 0, z0: 0, x1: 26, z1: 43 },
}

/**
 * 단추의 **스크립트 번호 → 물 높이** (`scripts_pastoria_city_gym.s`의 항목 차례).
 *
 * 항목 1 `BlueButton` → 스크립트 2 · 2 `GreenButton` → 3 · 3 `YellowButton` → 4.
 * 세 스크립트가 다 `PressPastoriaGymButton` 한 줄이고, 어느 단추인지는 **밟은
 * 자리의 소품 모델**로 제품이 정한다(`pastoriaButtonOf`) — 우리가 아는 것은
 * 「이 칸을 밟으면 물이 저기로 간다」뿐이면 된다.
 * 값은 제품의 `PASTORIA_WATER`(낮음 0 · 가운데 2 · 높음 4)와 같다
 */
const PASTORIA_BUTTON_SCRIPT = {
  2: { water: 4, what: '파랑(높음)' },
  3: { water: 2, what: '가운데(초록)' },
  4: { water: 0, what: '노랑(낮음)' },
}

/**
 * **들판 체육관의 단추 자리** — 구운 좌표 이벤트에서 읽는다.
 *
 * ⚠️ **표를 여기 적어 두지 않는다.** 손으로 옮긴 표는 언젠가 한쪽만 고쳐진다
 * (`two-bakers-must-match`). 자리는 `public/data/events.json`에 이미 있고,
 * 우리가 더하는 것은 **스크립트 번호가 어느 물 높이인가** 하나뿐이다
 */
export function pastoriaButtons() {
  return triggersOn(PASTORIA.map)
    .filter((t) => PASTORIA_BUTTON_SCRIPT[t.script] !== undefined)
    .map((t) => ({ x: t.x, z: t.z, ...PASTORIA_BUTTON_SCRIPT[t.script] }))
}

/** 막힌 칸 집합에서 `from`이 닿는 칸들 (네모 안에서만) */
function reachIn(blocked, from, box) {
  const seen = new Set([`${String(from.x)},${String(from.z)}`])
  const queue = [from]
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]
    for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = at.x + dx, nz = at.z + dz
      if (nx < box.x0 || nx > box.x1 || nz < box.z0 || nz > box.z1) continue
      const k = `${String(nx)},${String(nz)}`
      if (seen.has(k) || blocked.has(k)) continue
      seen.add(k)
      queue.push({ x: nx, z: nz })
    }
  }
  return seen
}

/**
 * **물 높이를 바꿔 가며 맥실러 앞에 선다** (지시서 §5.2의 설계 변경).
 *
 * ⚠️ **앞을 안 내다본다.** 장막의 샌드백과 달리 **단추는 되돌릴 수 있다** — 아무
 * 때나 다른 단추를 밟으면 그만이라 미리 차례를 짤 까닭이 없다. 그리고 물 높이를
 * **가정해서** 벽을 그리려면 높이판을 건드려야 하는데(`0x59`는 장치 표가 아니라
 * 「구운 높이 vs 높이판」으로 막힌다), 그것은 판 중에 게임 상태를 바꾸는 일이다.
 *
 * 그래서 **지금 벽을 제품에게 읽고**(`featureWalls` — 장치까지 얹은 그 답이다)
 * 맥실러 앞에 닿으면 가고, 못 닿으면 **닿는 단추 하나**를 밟고 다시 읽는다.
 * 밟은 (칸, 그때 물 높이) 짝을 기억해 같은 짝을 두 번 밟지 않는다 — 안 그러면
 * 두 단추 사이를 영영 오간다.
 *
 * @param ctx `log`과, 길 찾기에 벽을 넣어 줄 `setWalls(mapId, keys)`
 */
export async function pastoriaClimb(api, ctx, { rounds = 16 } = {}) {
  const t0 = Date.now()
  const out = { presses: [] }
  const note = (what, detail) => { ctx.log(`  ${what} → ${detail}`) }
  const tried = new Set()

  for (let i = 0; i < rounds && api.left() > 0; i++) {
    const read = await api.featureWalls(PASTORIA.box)
    if (read === null) { out.why = '들판 체육관 벽을 못 읽었다 (관측 불가)'; return out }
    /**
     * ⚠️ **사람은 장치 판정에 안 들어간다.** `featureWalls`는 격자와 물 높이를
     * 얹은 값이고 트레이너 여섯은 안 센다 — 그런데 그들이 선 칸은 못 지난다
     * (이겨도 그 자리에 그대로 선다). 장막과 같은 자리다 (지시서 §4.2)
     */
    const walls = [...new Set([...read,
      ...trainersOn(PASTORIA.map).map((t) => `${String(t.x)},${String(t.z)}`)])]
    ctx.setWalls?.(PASTORIA.map, walls)
    const state = await api.pastoriaState()
    if (state === null) { out.why = '들판 체육관 물 높이를 못 읽었다 (관측 불가)'; return out }
    const here = await api.now()
    if (here.map !== PASTORIA.map) { out.why = `체육관 밖이다 (맵 ${String(here.map)})`; return out }

    const blocked = new Set(walls)
    const spot = reachIn(blocked, { x: here.x, z: here.z }, PASTORIA.box)
    if (spot.has(`${String(PASTORIA.front.x)},${String(PASTORIA.front.z)}`)) {
      const went = await api.stepOn(PASTORIA.map, PASTORIA.front, Math.min(300_000, api.left()))
      out.at = went
      out.ok = went === 'arrived'
      out.water = state.water
      out.ms = Date.now() - t0
      note('맥실러 앞', `${went} · 물 ${String(state.water)} · 단추 ${String(out.presses.length)}번`)
      return out
    }

    // 닿는 단추 가운데 **이 물 높이에서 아직 안 밟은** 것. 가까운 것부터
    const options = pastoriaButtons()
      .filter((b) => spot.has(`${String(b.x)},${String(b.z)}`))
      .filter((b) => !tried.has(`${String(b.x)},${String(b.z)}@${String(state.water)}`))
      // 지금 높이로 다시 가는 단추는 아무 일도 안 한다
      .filter((b) => b.water !== state.water)
    if (options.length === 0) {
      out.why = `물 ${String(state.water)}에서 밟을 수 있는 새 단추가 없다`
      return out
    }
    options.sort((a, b) => (Math.abs(a.x - here.x) + Math.abs(a.z - here.z))
      - (Math.abs(b.x - here.x) + Math.abs(b.z - here.z)))
    const pick = options[0]
    tried.add(`${String(pick.x)},${String(pick.z)}@${String(state.water)}`)
    const stood = await api.stepOn(PASTORIA.map, { x: pick.x, z: pick.z }, Math.min(300_000, api.left()))
    // 물이 다 오르내릴 때까지 기다린다 (`pastoriaBusy`)
    let after = null
    for (let k = 0; k < 120; k++) {
      after = await api.pastoriaState()
      if (after !== null && after.busy !== true && after.water !== state.water) break
      await api.settle()
    }
    out.presses.push({
      ...pick, stood, from: state.water, to: after?.water ?? null,
      moved: after !== null && after.water !== state.water,
    })
    note(`단추 ${String(out.presses.length)} ${pick.what} (${String(pick.x)},${String(pick.z)})`,
      `${stood} · 물 ${String(state.water)} → ${String(after?.water)}`)
  }
  out.why = `${String(rounds)}바퀴 안에 맥실러 앞에 못 섰다`
  out.ms = Date.now() - t0
  return out
}

// ── 넷째 배지 — 연고 → 장막 (지시서 §4.1) ────────────────────────────────────

/**
 * 209번도로 게이트 안의 **라이벌전** 칸 (5, 5~9 · `events_route_209_gate_to_hearthome_city.json`).
 *
 * `gate209 == 1`(배지 3이 세운다)일 때만 선다. 세로 다섯 칸이라 한가운데를 밟는다 —
 * 게이트를 지나가기만 해도 걸리지만, **일부러 밟아** 「걸렸다/안 걸렸다」를 읽는다
 */
const GATE_209_RIVAL = { x: 5, z: 7 }
/** 신수마을 라이벌 장면 (557~563, 669) — `solaceon == 0`. 배틀은 없다 */
const SOLACEON_RIVAL = { x: 560, z: 669 }
/**
 * 장막시티의 **맥실러 장면** (681~684, 616) — `wake == 0`.
 *
 * 맥실러(`LOCALID_CRASHER_WAKE`)는 배치표에 체육관 문 칸 (684,611)으로 적혀 있지만
 * **숨어 있다**(`FLAG_HIDE_VEILSTONE_CRASHER_WAKE`). 이 장면이 문을 열어 그를 꺼내고
 * (`AddObject`), 말을 마치면 **다시 치운다**(`RemoveObject`) — 그리고 `wake`를 1로
 * 세운다. 곧 이 칸을 안 밟아도 체육관 문은 열려 있다.
 *
 * ⚠️ **그래도 일부러 밟는다.** 이 장면은 `GetPlayerMapPos`로 주인공의 x(681~684)를
 * 읽어 네 갈래로 나뉜다 — REPAIR §52가 고친 바로 그 명령이다. 밟아서 `wake`가 1이
 * 되는 것을 읽는 것이 그 고침을 **길에서** 다시 재는 자리다
 */
const VEILSTONE_WAKE = { x: 684, z: 616 }
/** 동행 상대 (`LOCALID_COUNTERPART`) — 장막시티의 **스크립트 16**. 말을 걸고 **예**라야 열린다 */
const VEILSTONE_COUNTERPART = 16
/** 창고 바닥의 비전머신02 (13,8) — 핸섬이 주는 것이 아니다 (지시서 §4.1 ⑧′) */
const WAREHOUSE_HM02 = { x: 13, z: 8 }
/** 들판 체육관 문 앞의 **한 칸** (589,828) — 라이벌전이 걸린 자리 (`pastoria == 1`) */
const PASTORIA_RIVAL = { x: 589, z: 828 }

/**
 * **다리 D — 연고시티에서 장막시티까지** (지시서 §4.1 ①~④).
 *
 * 209 게이트(라이벌전) → 209번도로 → 신수마을(라이벌 장면) → 210번도로 남 →
 * 215번도로 → 장막시티(맥실러 장면). 끝나면 체육관 문 앞에 설 수 있다.
 *
 * ⚠️ **좌표 이벤트는 일부러 밟는다.** 지나가다 걸리기도 하지만, 밟아서 읽어야
 * 「안 걸렸다」와 「이미 지났다」를 가를 수 있다 — 그 둘을 섞으면 거짓 PASS가 난다
 *
 * @param stopAt 어느 맵까지 (기본 장막시티). `journey`는 자리마다 끊어 재므로 넘긴다
 */
export async function hearthomeToVeilstone(api, ctx, { stopAt = MAP.veilstone, repel = true } = {}) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = (what, detail) => { out.steps.push({ what, detail }); ctx.log(`  ${what} → ${detail}`) }
  const legs = [MAP.gate209, MAP.route209, MAP.solaceon, MAP.route210south, MAP.route215, MAP.veilstone]
  const here = (await api.now()).map
  const want = legs.slice(legs.indexOf(here) + 1, legs.indexOf(stopAt) + 1)
  out.want = want

  if (want.includes(MAP.gate209)) {
    const gate = await api.goTo(MAP.gate209, Math.min(900_000, api.left()))
    out.gate209 = { went: gate }
    note('209번도로 게이트(110)', gate)
    if (gate === 'arrived') {
      let v = await api.storyVars()
      out.gate209.before = v?.gate209 ?? null
      if ((v?.gate209 ?? 0) === 1) {
        const stood = await api.stepOn(MAP.gate209, GATE_209_RIVAL, Math.min(300_000, api.left()))
        await api.clearTalk(); await api.settle()
        v = await api.storyVars()
        const at = await api.now()
        out.gate209.rival = { stood, state: v?.gate209 ?? null, mapAfter: at.map }
        note('게이트 안 라이벌전 (5,7)', `${stood} · 상태 ${String(v?.gate209)} · 지금 맵 ${String(at.map)}`)
      } else note('게이트 안 라이벌전', `안 선다 (상태 ${String(out.gate209.before)})`)
    }
    if (stopAt === MAP.gate209) { out.ms = Date.now() - t0; return out }
  }

  if (want.includes(MAP.route209)) {
    if (repel) {
      const sprayed = await api.useItem(ITEM.repel, Math.min(150_000, api.left()))
      note('벌레회피스프레이 (209번도로)', sprayed.ok ? `뿌렸다 (남은 것 ${String(sprayed.left)})` : String(sprayed.why))
    }
    const r209 = await api.goTo(MAP.route209, Math.min(1_200_000, api.left()))
    out.route209 = { went: r209 }
    note('209번도로(356)', r209)
    if (stopAt === MAP.route209) { out.ms = Date.now() - t0; return out }
  }

  if (want.includes(MAP.solaceon)) {
    const town = await api.goTo(MAP.solaceon, Math.min(1_200_000, api.left()))
    out.solaceon = { went: town }
    note('신수마을(433)', town)
    if (town === 'arrived') {
      let v = await api.storyVars()
      if ((v?.solaceon ?? 0) === 0) {
        const stood = await api.stepOn(MAP.solaceon, SOLACEON_RIVAL, Math.min(300_000, api.left()))
        await api.clearTalk(); await api.settle()
        v = await api.storyVars()
        out.solaceon.rival = { stood, state: v?.solaceon ?? null }
        note('신수 라이벌 장면 (560,669)', `${stood} · 상태 ${String(v?.solaceon)}`)
      } else note('신수 라이벌 장면', `이미 지났다 (상태 ${String(v?.solaceon)})`)
    }
    if (stopAt === MAP.solaceon) { out.ms = Date.now() - t0; return out }
  }

  if (want.includes(MAP.route210south)) {
    if (repel) {
      const sprayed = await api.useItem(ITEM.repel, Math.min(150_000, api.left()))
      note('벌레회피스프레이 (210번도로 남)', sprayed.ok ? `뿌렸다 (남은 것 ${String(sprayed.left)})` : String(sprayed.why))
    }
    const r210 = await api.goTo(MAP.route210south, Math.min(1_200_000, api.left()))
    out.route210south = { went: r210 }
    note('210번도로 남(362)', r210)
    if (stopAt === MAP.route210south) { out.ms = Date.now() - t0; return out }
  }

  if (want.includes(MAP.route215)) {
    if (repel) {
      const sprayed = await api.useItem(ITEM.repel, Math.min(150_000, api.left()))
      note('벌레회피스프레이 (215번도로)', sprayed.ok ? `뿌렸다 (남은 것 ${String(sprayed.left)})` : String(sprayed.why))
    }
    const r215 = await api.goTo(MAP.route215, Math.min(1_200_000, api.left()))
    out.route215 = { went: r215 }
    note('215번도로(382)', r215)
    if (stopAt === MAP.route215) { out.ms = Date.now() - t0; return out }
  }

  if (want.includes(MAP.veilstone)) {
    const city = await api.goTo(MAP.veilstone, Math.min(1_200_000, api.left()))
    out.veilstone = { went: city }
    note('장막시티(132)', city)
    if (city === 'arrived') {
      let v = await api.storyVars()
      if ((v?.wake ?? 0) === 0) {
        const stood = await api.stepOn(MAP.veilstone, VEILSTONE_WAKE, Math.min(300_000, api.left()))
        await api.clearTalk(); await api.settle()
        v = await api.storyVars()
        out.veilstone.wake = { stood, state: v?.wake ?? null }
        note('맥실러 장면 (684,616)', `${stood} · 상태 ${String(v?.wake)}`)
      } else note('맥실러 장면', `이미 지났다 (상태 ${String(v?.wake)})`)
    }
  }
  out.ms = Date.now() - t0
  return out
}

/**
 * **창고 — 동행 상대 · 태그 배틀 · 비전머신02** (지시서 §4.1 ⑥~⑧′).
 *
 * 체육관에서 자두를 이기고 **나서면** `OnFrame_CounterpartNeedsHelp`가 돌아
 * (`help` 1 → 2) 동행 상대가 창고 앞에 선다. 그 사람에게 말을 걸고 **예**라고
 * 답하면 태그 배틀(우리 판에서는 1:1)이 붙고, 이기면 장면이 스스로
 * `Warp`으로 창고 안에 데려간다 — **창고 문으로 걸어갈 일이 없다.**
 *
 * ⚠️ **비전머신02는 핸섬이 주는 것이 아니다.** `OnFrame_EnterWithLooker`에는
 * `GiveItem`이 한 줄도 없고 「이 비전머신은 하늘을 나는 것이다」라고 말만 한다.
 * 진짜 비전머신02는 창고 바닥 (13,8)의 도구 볼(`LOCALID_ITEM_HM02`)이라
 * **주우러 가는 걸음이 따로** 있어야 한다 (지시서 §4.1 ⑧′)
 */
export async function veilstoneWarehouse(api, ctx) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = (what, detail) => { out.steps.push({ what, detail }); ctx.log(`  ${what} → ${detail}`) }

  // 체육관 밖으로 — 나서는 그 순간 `help` 1 → 2 장면이 돈다
  const city = await api.goTo(MAP.veilstone, Math.min(600_000, api.left()))
  await api.clearTalk(); await api.settle()
  let v = await api.storyVars()
  out.help = v?.help ?? null
  note('체육관에서 시내로', `${city} · 도움 상태 ${String(out.help)}`)
  if (city !== 'arrived') { out.why = `시내로 못 나왔다 (${city})`; out.ms = Date.now() - t0; return out }

  // 동행 상대 — 말을 걸면 예/아니오가 뜨고, `clearTalk`이 둘짜리에서 **예**를 못 박는다
  const said = await api.talkToNpc(MAP.veilstone, VEILSTONE_COUNTERPART, Math.min(600_000, api.left()))
  await api.clearTalk(); await api.settle()
  const at = await api.now()
  v = await api.storyVars()
  out.counterpart = { said, help: v?.help ?? null, mapAfter: at.map }
  note('동행 상대 (script 16)', `${said === true ? '붙었다' : String(said)} · 도움 ${String(v?.help)} · 지금 맵 ${String(at.map)}`)

  // 태그 배틀을 이기면 장면이 스스로 창고 (8,11)로 `Warp` 한다
  out.warpedIn = at.map === MAP.warehouse
  if (!out.warpedIn) {
    // 아직 시내면 한 번 더 기다려 본다 — 배틀이 늦게 끝났을 수 있다
    await api.settle()
    const again = await api.now()
    out.warpedIn = again.map === MAP.warehouse
    out.counterpart.mapAfter = again.map
  }
  if (!out.warpedIn) {
    out.why = `태그 배틀 뒤 창고로 안 옮겨졌다 (맵 ${String(out.counterpart.mapAfter)})`
    out.ms = Date.now() - t0
    return out
  }

  // 핸섬 장면 (`OnFrame_EnterWithLooker`) — `warehouse` 1 → 2 · `pastoria` 0 → 1
  await api.clearTalk(); await api.settle()
  v = await api.storyVars()
  out.looker = { warehouse: v?.warehouse ?? null, pastoria: v?.pastoria ?? null }
  note('핸섬 장면', `창고 ${String(v?.warehouse)} · 들판 ${String(v?.pastoria)}`)

  // 바닥의 비전머신02 — 도구 볼이라 말을 걸어 줍는다
  const took = await api.talkTo(MAP.warehouse, WAREHOUSE_HM02, Math.min(300_000, api.left()))
  await api.clearTalk(); await api.settle()
  const bag = await api.bagState()
  out.hm02 = {
    took,
    inBag: (bag?.items ?? []).some((one) => one.item === ITEM.hm02 && one.count > 0),
  }
  note('비전머신02 (13,8)', `${took ? '주웠다' : '못 걸었다'} · 가방에 ${out.hm02.inBag ? '있다' : '없다'}`)
  out.ok = out.warpedIn === true && out.hm02.inBag === true
  out.ms = Date.now() - t0
  return out
}

// ── 다섯째 배지 — 장막 → 들판 (지시서 §5.1) ─────────────────────────────────

/**
 * **다리 E — 장막시티에서 들판시티까지** (지시서 §5.1 ①~②).
 *
 * 214 게이트 → 214번도로 → 진실호수 호숫가 → 213번도로 → 213 게이트 → 들판시티,
 * 그리고 체육관 문 앞 **한 칸** (589,828)의 라이벌전.
 *
 * ⚠️ **라이벌전은 `pastoria == 1`일 때만 선다** — 창고를 안 했으면 상태 0이라
 * 아무 일도 안 난다. 그때는 「미실행」으로 적고 **PASS로 접지 않는다**
 */
export async function veilstoneToPastoria(api, ctx, { stopAt = MAP.pastoria, repel = true } = {}) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = (what, detail) => { out.steps.push({ what, detail }); ctx.log(`  ${what} → ${detail}`) }
  const legs = [MAP.gate214, MAP.route214, MAP.valorLakefront, MAP.route213, MAP.gate213, MAP.pastoria]
  const here = (await api.now()).map
  const want = legs.slice(legs.indexOf(here) + 1, legs.indexOf(stopAt) + 1)
  out.want = want

  const walk = async (mapId, what, budget = 1_200_000) => {
    const went = await api.goTo(mapId, Math.min(budget, api.left()))
    note(what, went)
    return went
  }
  const spray = async (what) => {
    if (!repel) return
    const sprayed = await api.useItem(ITEM.repel, Math.min(150_000, api.left()))
    note(`벌레회피스프레이 (${what})`, sprayed.ok ? `뿌렸다 (남은 것 ${String(sprayed.left)})` : String(sprayed.why))
  }

  if (want.includes(MAP.gate214)) {
    out.gate214 = { went: await walk(MAP.gate214, '214번도로 게이트(381)', 600_000) }
    if (stopAt === MAP.gate214) { out.ms = Date.now() - t0; return out }
  }
  if (want.includes(MAP.route214)) {
    await spray('214번도로')
    out.route214 = { went: await walk(MAP.route214, '214번도로(380)') }
    if (stopAt === MAP.route214) { out.ms = Date.now() - t0; return out }
  }
  if (want.includes(MAP.valorLakefront)) {
    out.valorLakefront = { went: await walk(MAP.valorLakefront, '진실호수 호숫가(336)') }
    if (stopAt === MAP.valorLakefront) { out.ms = Date.now() - t0; return out }
  }
  if (want.includes(MAP.route213)) {
    await spray('213번도로')
    out.route213 = { went: await walk(MAP.route213, '213번도로(373)') }
    if (stopAt === MAP.route213) { out.ms = Date.now() - t0; return out }
  }
  if (want.includes(MAP.gate213)) {
    out.gate213 = { went: await walk(MAP.gate213, '213번도로 게이트(374)', 600_000) }
    if (stopAt === MAP.gate213) { out.ms = Date.now() - t0; return out }
  }
  if (want.includes(MAP.pastoria)) {
    out.pastoria = { went: await walk(MAP.pastoria, '들판시티(120)') }
    if (out.pastoria.went === 'arrived') {
      let v = await api.storyVars()
      out.pastoria.before = v?.pastoria ?? null
      if ((v?.pastoria ?? 0) === 1) {
        const stood = await api.stepOn(MAP.pastoria, PASTORIA_RIVAL, Math.min(300_000, api.left()))
        await api.clearTalk(); await api.settle()
        v = await api.storyVars()
        const at = await api.now()
        out.pastoria.rival = { stood, state: v?.pastoria ?? null, mapAfter: at.map }
        note('체육관 앞 라이벌전 (589,828)', `${stood} · 상태 ${String(v?.pastoria)} · 지금 맵 ${String(at.map)}`)
      } else {
        out.pastoria.rival = { stood: null, state: out.pastoria.before, why: '창고를 안 했다 (상태 1이 아니다)' }
        note('체육관 앞 라이벌전', `미실행 — 들판 상태 ${String(out.pastoria.before)}`)
      }
    }
  }
  out.ms = Date.now() - t0
  return out
}
