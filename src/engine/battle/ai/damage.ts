// AI의 데미지 어림 (PLAN §7.7)
//
// **판정용이 아니다.** 실제로 얼마나 깎이는지는 @pkmn/sim이 정한다. 여기 있는 값은
// AI가 "어느 기술이 제일 세지", "이걸로 쓰러뜨릴 수 있나"를 스스로 재 볼 때만 쓴다.
//
// 그래서 정확도보다 **순서**가 중요하다. 절대값이 조금 어긋나도 네 기술의 크기
// 순서와 치사 여부만 맞으면 AI는 원작과 같은 수를 둔다.
//
// 원작(`TrainerAI_CalcDamage`)이 안 보는 것은 여기서도 안 본다: 급소, 명중률,
// 연속 기술의 횟수. 원작이 보는데 우리가 못 보는 것은 아래 `UNMODELLED`에 적었다.
import type { AiMon, AiMove } from './context'
import { boosted } from './context'
import { ALT_POWER, EFFECT, NO_DAMAGE_CALC } from './rom'
import { effectivenessOf, typeMultiplier, TYPE } from './typeChart'

/**
 * 아직 안 담은 보정.
 *
 * ⚠️ **원작 AI가 안 보는 것은 여기 안 적는다.** AI는 `BattleSystem_CalcMoveDamage`를
 * 그대로 부르므로, **그 함수 밖에서** 곱해지는 것은 AI의 어림에도 안 들어간다 —
 * 생명의구슬(`battle_script.c` 1346줄, 계산이 끝난 damage에 ×1.3)과
 * 달인의띠(`battle_lib.c` 2663줄, 효과가 굉장할 때 ×1.2)가 그렇다.
 * **우리가 안 담은 것이 아니라 원작 AI도 안 보는 것**이라 UNMODELLED가 아니다.
 */
export const UNMODELLED = [
  '급소·명중률·연속 기술 횟수 (원작 AI도 안 본다)',
  '아군이 둘일 때의 보정 (도우미·머드슬랩류)',
] as const

/**
 * 홀드 효과 번호 (`generated/item_hold_effects.txt`의 줄 차례).
 *
 * 실측으로 items.json과 맞다 — 구애머리띠 55 · 목탄 84 · 신비의물방울 78 ·
 * 힘의머리띠 94 · 지식안경 95 · 구애안경 125
 */
const HOLD = {
  choiceAtk: 55,
  choiceSpAtk: 125,
  powerUpPhysical: 94,
  powerUpSpecial: 95,
} as const

/**
 * 타입강화도구의 홀드 효과 → 그 타입 (`sTypeBoostingItems`).
 *
 * 번호가 한 줄로 이어져 있지 않다 — 벌레 57, 강철 68, 땅 72부터 노말 86까지가
 * 다른 효과들 사이에 흩어져 있어서 표로 적는다. 값은 `item_hold_effects.txt`의
 * 줄 차례이고 타입은 `typeChart`의 롬 번호다
 */
const STRENGTHEN: ReadonlyMap<number, number> = new Map([
  [57, TYPE.BUG], [68, TYPE.STEEL], [72, TYPE.GROUND], [73, TYPE.ROCK],
  [74, TYPE.GRASS], [75, TYPE.DARK], [76, TYPE.FIGHTING], [77, TYPE.ELECTRIC],
  [78, TYPE.WATER], [79, TYPE.FLYING], [80, TYPE.POISON], [81, TYPE.ICE],
  [82, TYPE.GHOST], [83, TYPE.PSYCHIC], [84, TYPE.FIRE], [85, TYPE.DRAGON],
  [86, TYPE.NORMAL],
])

/** 특성 번호 (`generated/abilities.txt`의 줄 차례) */
const ABILITY = {
  thickFat: 47,
  overgrow: 65,
  blaze: 66,
  torrent: 67,
  swarm: 68,
  technician: 101,
} as const

/** 심록·맹화·급류·벌레의알림이 각각 밀어 주는 타입 */
const PINCH: ReadonlyMap<number, number> = new Map([
  [ABILITY.overgrow, TYPE.GRASS], [ABILITY.blaze, TYPE.FIRE],
  [ABILITY.torrent, TYPE.WATER], [ABILITY.swarm, TYPE.BUG],
])

/**
 * 무게(헥토그램) → 위력 (`sWeightToPower`). 표를 넘으면 120이다.
 *
 * 안다리걸기·풀묶기가 쓴다. 원작 AI도 **같은 표**를 본다
 * (`trainer_ai.c` 3059줄)
 */
const WEIGHT_POWER: readonly (readonly [number, number])[] = [
  [100, 20], [250, 40], [500, 60], [1000, 80], [2000, 100],
]

function weightPower(weightHg: number): number {
  for (const [upTo, power] of WEIGHT_POWER) if (upTo >= weightHg) return power
  return 120
}

/** 날씨가 그 타입에 주는 배수(10분의 1 단위). 없으면 10 */
function weatherFactor(weather: string | null, moveType: number): number {
  if (weather === 'RainDance') {
    if (moveType === TYPE.WATER) return 15
    if (moveType === TYPE.FIRE) return 5
  }
  if (weather === 'SunnyDay') {
    if (moveType === TYPE.FIRE) return 15
    if (moveType === TYPE.WATER) return 5
  }
  return 10
}

/**
 * 위력이 상황따라 정해지는 기술의 위력.
 *
 * 고정 데미지 기술은 위력이 아니라 데미지 자체를 돌려주므로 `flat`로 구분한다
 */
function altPower(move: AiMove, self: AiMon, foe: AiMon): { power: number; flat: number } | null {
  switch (move.effect) {
    // 소닉붐·용의분노·지구던지기·나이트헤드·사이코웨이브는 능력치를 안 본다
    case 130:
      return { power: 0, flat: 20 }
    case 41:
      return { power: 0, flat: 40 }
    case 87:
      return { power: 0, flat: self.level }
    case 88:
      // 레벨의 50~150%. 어림이므로 기대값인 레벨 그대로 쓴다
      return { power: 0, flat: self.level }
    // 잠재파워는 개체값으로 30~70이 나온다. 4세대 트레이너는 개체값이 여섯 칸
    // 모두 같으므로 실제로는 늘 한 값에 몰린다 — 중간값으로 둔다
    case 135:
      return { power: 50, flat: 0 }
    // 자이로볼: 25 × 상대 스피드 / 내 스피드, 150에서 자른다
    case 219: {
      const mine = Math.max(1, boosted(self.stats.spe, self.boosts.spe))
      const theirs = Math.max(1, boosted(foe.stats.spe, foe.boosts.spe))
      return { power: Math.min(150, Math.floor((25 * theirs) / mine)), flat: 0 }
    }
    // 은혜갚기·화풀이는 친밀도 × 2/5. 트레이너 개체는 종족 기본 친밀도라 대개 70대다
    case 121:
      return { power: 28, flat: 0 }
    case 123:
      return { power: 74, flat: 0 }
    // 안다리걸기·풀묶기 — **상대의 무게**가 위력이다 (`sWeightToPower`)
    case 196:
      return { power: weightPower(foe.weightHg), flat: 0 }
    // 자연의은혜 — 지닌 **열매**가 위력과 타입을 준다. 열매가 없으면 안 나간다
    // (원작 AI도 위력 0이면 노말로 두고 그대로 잰다)
    case EFFECT.NATURAL_GIFT:
      return { power: self.naturalGiftPower, flat: 0 }
    case 268:
      return { power: 100, flat: 0 }
    default:
      return null
  }
}

/**
 * 이 기술이 데미지 계산 대상인가.
 *
 * 원작과 같은 판정이다: 위력이 상황따라 정해지는 효과면 무조건 대상이고, 아니면
 * "위력 2 이상이면서 계산 제외 효과가 아닐 것"이어야 한다.
 *
 * `false`인 기술은 **비교에서 0으로 취급된다** — 자폭이나 기합구슬이 다른 기술을
 * 밀어내지 않는 이유가 이것이다
 */
export function isDamageScored(move: AiMove): boolean {
  if (ALT_POWER.has(move.effect)) return true
  return move.power > 1 && !NO_DAMAGE_CALC.has(move.effect)
}

/**
 * 이 기술이 상대에게 줄 데미지.
 *
 * `variance`는 85~100이다. 원작은 기술 칸마다 한 번 굴린 값을 배틀 내내 쓰고
 * (`moveDamageRolls`), 최대 데미지를 볼 때는 100을 쓴다
 */
export function estimateDamage(
  move: AiMove,
  self: AiMon,
  foe: AiMon,
  weather: string | null,
  variance = 100,
): number {
  if (!isDamageScored(move)) return 0

  const alt = altPower(move, self, foe)
  // 고정 데미지는 타입 무효만 본다 — 나이트헤드가 노말 타입에게 안 통하는 것이 그것이다
  if (alt && alt.flat > 0) {
    return effectivenessOf(move.type, foe.types) === 0 ? 0 : alt.flat
  }
  // 자연의은혜는 **열매의 타입**으로 나간다. 위력이 0이면 열매가 없는 것이다
  const moveType = move.effect === EFFECT.NATURAL_GIFT && self.naturalGiftPower > 0
    ? self.naturalGiftType
    : move.type

  let power = alt ? alt.power : move.power
  if (power <= 0) return 0

  const physical = move.category === 'physical'

  // ── 위력·능력치 보정 ──────────────────────────────────────────────────────
  //
  // ⚠️ **차례가 원작 그대로여야 한다** (`BattleSystem_CalcMoveDamage`). 버림이
  // 단마다 나므로 순서를 바꾸면 값이 1씩 어긋나고, AI는 네 기술의 **순서**로
  // 수를 두므로 그 1이 다른 기술을 고르게 만든다.
  //
  // ⚠️ **특성과 도구가 번갈아 온다** — 「특성 다 → 도구 다」가 아니다.
  // 테크니션(특성) → 타입강화도구 → 구애(도구) → 힘의머리띠류(도구) →
  // 두꺼운지방(특성) → 심록류(특성)이 원문 차례다.

  // 테크니션 — 위력 60 이하를 1.5배로 (몸부림은 뺀다)
  if (self.ability === ABILITY.technician && power <= 60) {
    power = Math.floor((power * 15) / 10)
  }

  // 타입강화도구 — 목탄·신비의물방울 열일곱. 값은 도구가 들고 있다(대개 20 = 1.2배)
  if (STRENGTHEN.get(self.itemEffect) === moveType) {
    power = Math.floor((power * (100 + self.itemParam)) / 100)
  }

  const atkStat = physical ? self.stats.atk : self.stats.spa
  const defStat = physical ? foe.stats.def : foe.stats.spd
  const atkBoost = physical ? self.boosts.atk : self.boosts.spa
  const defBoost = physical ? foe.boosts.def : foe.boosts.spd

  let atk = boosted(atkStat, atkBoost)
  // 구애머리띠·구애안경 — 쓰는 쪽의 능력치를 1.5배로. **위력이 아니다**
  if (physical ? self.itemEffect === HOLD.choiceAtk : self.itemEffect === HOLD.choiceSpAtk) {
    atk = Math.floor((atk * 150) / 100)
  }
  // 힘의머리띠·지식안경 — 분류가 맞으면 위력을 올린다 (대개 10 = 1.1배)
  const powerUp = physical ? HOLD.powerUpPhysical : HOLD.powerUpSpecial
  if (self.itemEffect === powerUp) {
    power = Math.floor((power * (100 + self.itemParam)) / 100)
  }
  // 두꺼운지방 — 맞는 쪽 특성이 불꽃·얼음의 **위력을 반**으로 (`Battler_IgnorableAbility`)
  if (foe.ability === ABILITY.thickFat && (moveType === TYPE.FIRE || moveType === TYPE.ICE)) {
    power = Math.floor(power / 2)
  }
  // 심록·맹화·급류·벌레의알림 — HP가 3분의 1 이하일 때 그 타입을 1.5배로
  if (PINCH.get(self.ability) === moveType && self.hp <= Math.floor(self.maxHp / 3)) {
    power = Math.floor((power * 150) / 100)
  }
  if (power <= 0) return 0
  // 화상은 물리 공격을 반으로 깎는다. 근성이면 반대로 안 깎인다(1.5배는 여기서 안 본다)
  if (physical && self.status === 'brn') atk = Math.floor(atk / 2)
  const def = Math.max(1, boosted(defStat, defBoost))

  let dmg = Math.floor(
    Math.floor((Math.floor((2 * self.level) / 5 + 2) * power * Math.max(1, atk)) / 50) / def,
  ) + 2

  // 리플렉터·빛의장막. 싱글에서는 반이다
  const screen = physical ? 'reflect' : 'lightscreen'
  if (foe.side.has(screen)) dmg = Math.floor(dmg / 2)

  dmg = Math.floor((dmg * weatherFactor(weather, moveType)) / 10)
  dmg = Math.floor((dmg * variance) / 100)

  // 자속. 타입 칸 둘 중 하나만 맞으면 된다
  if (self.types.includes(moveType)) dmg = Math.floor((dmg * 3) / 2)

  // 상성은 타입마다 따로 곱하고 매번 버린다 — 한 번에 곱하면 0.25배에서 1 어긋난다
  const seen = new Set<number>()
  for (const t of foe.types) {
    if (seen.has(t)) continue
    seen.add(t)
    const m = typeMultiplier(moveType, t)
    if (m === 0) return 0
    dmg = m === 2 ? dmg * 2 : m === 0.5 ? Math.floor(dmg / 2) : dmg
  }

  return Math.max(0, dmg)
}

/** 네 기술의 데미지. 계산 대상이 아닌 칸은 0이다 */
export function allDamage(
  moves: readonly AiMove[],
  self: AiMon,
  foe: AiMon,
  weather: string | null,
  variance = 100,
): number[] {
  return moves.map((m) => estimateDamage(m, self, foe, weather, variance))
}

/** 이 기술로 상대가 쓰러지는가. 원작과 같이 **최대 데미지**로 본다 */
export function killsWithMaxRoll(
  move: AiMove,
  self: AiMon,
  foe: AiMon,
  weather: string | null,
): boolean {
  if (!isDamageScored(move)) return false
  return foe.hp <= estimateDamage(move, self, foe, weather, 100)
}
