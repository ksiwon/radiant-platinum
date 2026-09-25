// 네 자리의 빠른 차례 (PLAN §7.7 · `AICmd_LoadBattlerSpeedRank`)
//
// TAG_STRATEGY의 트릭룸·미래예지·도우미 갈래가 「내가 몇 번째로 움직이나」를 묻는다.
// 원작은 그때마다 전투원 번호 [0, 1, 2, 3]을 거품 정렬로 세운다
// (`trainer_ai.c` 2056) — 비교는 턴 차례를 정하는 그 함수다
// (`BattleSystem_CompareBattlerSpeed(…, ignoreQuickClaw = TRUE)` · `battle_lib.c` 1188).
//
// ⚠️ **`ignoreQuickClaw = TRUE`라서 기술 우선도는 안 본다** — 우선도를 읽는 줄이 그
// 인자 안쪽에 있다(1374). 선제의 발톱·이바열매·느림보꼬리·마이페이스(`STALL`)·
// 트릭룸은 그대로 본다.
//
// ⚠️ **안 옮긴 것 하나: 짐 덜기(Unburden)** — 도구를 잃은 뒤에만 켜지는 깃발
// (`moveEffectsData.canUnburden`)인데 sim이 그것을 프로토콜로 알리지 않는다. 우리가
// 볼 수 없는 값을 지어 채우지 않는다
import { ABILITY } from './rom'

/** 거품 정렬이 보는 한 자리. 전부 **진짜 값**이다 — 원작도 `battleMons`를 그대로 본다 */
export interface SpeedMon {
  /** 랭크 보정 전 스피드 실능력치 (`battleMons.speed`) */
  speed: number
  /** 스피드 랭크 (−6~+6) */
  stage: number
  ability: number
  itemEffect: number
  itemParam: number
  species: number
  status: 'ok' | string
  hp: number
  maxHp: number
  /** 그 쪽 진영에 순풍이 부는가 */
  tailwind: boolean
  /** 슬로스타트가 아직 안 풀렸는가 (나온 지 5턴 미만) */
  slowStart: boolean
  /**
   * 서투름·금제로 도구 효과가 꺼졌는가 (`Battler_HeldItemEffect`가 없음을 낸다).
   * 반으로 깎는 도구 여덟만은 도구 표를 직접 읽어서 꺼지지 않는다
   */
  itemNegated: boolean
}

/** 판 전체의 조건 */
interface SpeedField {
  weather: string | null
  trickRoom: boolean
}

// 홀드 효과 번호 (`generated/item_hold_effects.txt`의 줄 차례 −1)
const HOLD_EVS_UP_SPEED_DOWN = 50 // 교정깁스
const HOLD_SPEED_DOWN_GROUNDED = 106 // 검은철구
/** 파워 시리즈 여섯 (`HOLD_EFFECT_LVLUP_*_EV_UP` · 117~122) */
const HOLD_POWER_ITEMS = new Set([117, 118, 119, 120, 121, 122])
const HOLD_CHOICE_SPEED = 115 // 구애스카프
const HOLD_DITTO_SPEED_UP = 102 // 스피드파우더
const HOLD_SOMETIMES_PRIORITY = 52 // 선제의발톱
const HOLD_PINCH_PRIORITY = 45 // 이바열매
const HOLD_PRIORITY_DOWN = 107 // 느림보꼬리·만복향로

const SPECIES_DITTO = 132

/** 랭크 배수표 (`sStatStageBoosts` · `battle_lib.c` 6550). 정수로 곱하고 나눈다 */
const STAGE: readonly (readonly [number, number])[] = [
  [10, 40], [10, 35], [10, 30], [10, 25], [10, 20], [10, 15], [10, 10],
  [15, 10], [20, 10], [25, 10], [30, 10], [35, 10], [40, 10],
]

/** 날씨·특성·도구·상태를 다 먹인 스피드와 선제·느림보 표식 */
function effective(mon: SpeedMon, field: SpeedField, cloudNine: boolean, random: () => number): {
  speed: number
  quick: boolean
  lagging: boolean
} {
  let stage = mon.stage
  // 단순 — 랭크를 두 배로 (`CompareSpeed_ApplySimple`)
  if (mon.ability === ABILITY.SIMPLE) stage = Math.max(-6, Math.min(6, stage * 2))
  const [num, den] = STAGE[stage + 6]!
  let speed = Math.floor((mon.speed * num) / den)

  if (!cloudNine) {
    if ((mon.ability === ABILITY.SWIFT_SWIM && field.weather === 'RainDance')
      || (mon.ability === ABILITY.CHLOROPHYLL && field.weather === 'SunnyDay')) {
      speed *= 2
    }
  }
  // 반으로 깎는 도구 여덟은 **특성·금제로도 안 풀린다** — 원작이 도구 표를 직접 읽는다
  if (mon.itemEffect === HOLD_EVS_UP_SPEED_DOWN || mon.itemEffect === HOLD_SPEED_DOWN_GROUNDED
    || HOLD_POWER_ITEMS.has(mon.itemEffect)) {
    speed = Math.floor(speed / 2)
  }
  const held = mon.itemNegated ? 0 : mon.itemEffect
  if (held === HOLD_CHOICE_SPEED) speed = Math.floor((speed * 15) / 10)
  if (held === HOLD_DITTO_SPEED_UP && mon.species === SPECIES_DITTO) speed *= 2
  if (mon.ability === ABILITY.QUICK_FEET && mon.status !== 'ok') {
    speed = Math.floor((speed * 15) / 10)
  } else if (mon.status === 'par') {
    speed = Math.floor(speed / 4)
  }
  if (mon.ability === ABILITY.SLOW_START && mon.slowStart) speed = Math.floor(speed / 2)
  if (mon.tailwind) speed *= 2

  // 선제의발톱은 **그 턴의 난수**를 본다 (`speedRand[battler] % (100 / 값) == 0`).
  // 그 난수는 우리가 못 보므로 같은 확률로 새로 굴린다
  let quick = false
  if (held === HOLD_SOMETIMES_PRIORITY && mon.itemParam > 0) {
    quick = Math.floor(random() * 65536) % Math.floor(100 / mon.itemParam) === 0
  }
  if (held === HOLD_PINCH_PRIORITY && mon.itemParam > 0) {
    const param = mon.ability === ABILITY.GLUTTONY ? Math.floor(mon.itemParam / 2) : mon.itemParam
    if (param > 0 && mon.hp <= Math.floor(mon.maxHp / param)) quick = true
  }
  return { speed, quick, lagging: held === HOLD_PRIORITY_DOWN }
}

/**
 * 1이 2보다 늦으면 참 — 원작 함수가 0이 아닌 값을 내는 자리다 (늦다 · 같아서 동전).
 *
 * 비교의 차례가 원문 그대로다: 쓰러진 쪽 → 선제 → 느림보 → 마이페이스 → 트릭룸 → 속도
 */
function swaps(
  a: SpeedMon | null, b: SpeedMon | null, field: SpeedField, cloudNine: boolean,
  random: () => number,
): boolean {
  const aHp = a?.hp ?? 0
  const bHp = b?.hp ?? 0
  if (aHp === 0 && bHp > 0) return true
  if (aHp > 0 && bHp === 0) return false
  const x = a ? effective(a, field, cloudNine, random) : { speed: 0, quick: false, lagging: false }
  const y = b ? effective(b, field, cloudNine, random) : { speed: 0, quick: false, lagging: false }
  const tie = () => (Math.floor(random() * 65536) & 1) === 1
  const slower = (p: number, q: number) => p < q || (p === q && tie())
  const faster = (p: number, q: number) => p > q || (p === q && tie())
  if (x.quick && y.quick) return slower(x.speed, y.speed)
  if (!x.quick && y.quick) return true
  if (x.quick && !y.quick) return false
  if (x.lagging && y.lagging) return faster(x.speed, y.speed)
  if (x.lagging && !y.lagging) return true
  if (!x.lagging && y.lagging) return false
  const aStall = a?.ability === ABILITY.STALL
  const bStall = b?.ability === ABILITY.STALL
  if (aStall && bStall) return faster(x.speed, y.speed)
  if (aStall && !bStall) return true
  if (!aStall && bStall) return false
  if (field.trickRoom) return faster(x.speed, y.speed)
  return slower(x.speed, y.speed)
}

/**
 * 전투원 번호 `battler`(0 내 첫 자리 · 1 상대 첫 자리 · 2 내 둘째 · 3 상대 둘째)의 순위.
 *
 * `mons`는 번호 차례의 네 자리다. 빈 자리는 null이고 쓰러진 것과 같이 맨 뒤로 간다
 */
export function speedRank(
  mons: readonly (SpeedMon | null)[], battler: number, field: SpeedField, random: () => number,
): number {
  const cloudNine = mons.some((m) => m !== null && m.hp > 0
    && (m.ability === ABILITY.CLOUD_NINE || m.ability === ABILITY.AIR_LOCK))
  const order = mons.map((_, i) => i)
  for (let i = 0; i < order.length - 1; i++) {
    for (let j = i + 1; j < order.length; j++) {
      const p = order[i]!
      const q = order[j]!
      if (swaps(mons[p] ?? null, mons[q] ?? null, field, cloudNine, random)) {
        order[i] = q
        order[j] = p
      }
    }
  }
  return order.indexOf(battler)
}
