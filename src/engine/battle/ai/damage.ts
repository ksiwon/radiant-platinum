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
 * 전부 "있으면 데미지가 달라지는데 우리가 데이터를 아직 안 뽑은 것"이다. 도구
 * 데이터(`res/items`)가 들어오면 첫 두 개가 풀린다 — 그때까지는 없는 셈 친다
 */
export const UNMODELLED = [
  '소지 도구 (구애머리띠·생명의구슬·타입강화도구)',
  '특성 보정 (심록·맹화·테크니션·두꺼운지방)',
  '기술 무게·지닌 열매 (안다리걸기·자연의은혜)',
] as const

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
    // 무게·지닌 열매를 아직 모른다(UNMODELLED). 중간 위력으로 둔다
    case 196:
      return { power: 60, flat: 0 }
    case EFFECT.NATURAL_GIFT:
      return { power: 60, flat: 0 }
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
  const power = alt ? alt.power : move.power
  if (power <= 0) return 0

  const physical = move.category === 'physical'
  const atkStat = physical ? self.stats.atk : self.stats.spa
  const defStat = physical ? foe.stats.def : foe.stats.spd
  const atkBoost = physical ? self.boosts.atk : self.boosts.spa
  const defBoost = physical ? foe.boosts.def : foe.boosts.spd

  let atk = boosted(atkStat, atkBoost)
  // 화상은 물리 공격을 반으로 깎는다. 근성이면 반대로 안 깎인다(1.5배는 여기서 안 본다)
  if (physical && self.status === 'brn') atk = Math.floor(atk / 2)
  const def = Math.max(1, boosted(defStat, defBoost))

  let dmg = Math.floor(
    Math.floor((Math.floor((2 * self.level) / 5 + 2) * power * Math.max(1, atk)) / 50) / def,
  ) + 2

  // 리플렉터·빛의장막. 싱글에서는 반이다
  const screen = physical ? 'reflect' : 'lightscreen'
  if (foe.side.has(screen)) dmg = Math.floor(dmg / 2)

  dmg = Math.floor((dmg * weatherFactor(weather, move.type)) / 10)
  dmg = Math.floor((dmg * variance) / 100)

  // 자속. 타입 칸 둘 중 하나만 맞으면 된다
  if (self.types.includes(move.type)) dmg = Math.floor((dmg * 3) / 2)

  // 상성은 타입마다 따로 곱하고 매번 버린다 — 한 번에 곱하면 0.25배에서 1 어긋난다
  const seen = new Set<number>()
  for (const t of foe.types) {
    if (seen.has(t)) continue
    seen.add(t)
    const m = typeMultiplier(move.type, t)
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
