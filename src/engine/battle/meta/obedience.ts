// 말 안 듣기 (PARITY §2.18) — `BattleControllerPlayer_CheckObedience`.
//
// **남에게 받은 마리만 안 듣는다.** 내가 잡은 마리는 레벨이 아무리 높아도 늘
// 듣는다 — 원작이 `BattleSystem_TrainerIsOT`로 먼저 걸러 낸다. 그러니 이 규칙이
// 실제로 서는 자리는 인게임 교환으로 받은 마리와, 뱃지를 덜 딴 채로 남의 마리를
// 데리고 다니는 판이다.
//
// 뱃지 여덟이면 통째로 사라진다. 그 전에는 뱃지 수가 정한 문턱 위의 레벨이
// 위험하고, **레벨이 문턱보다 높을수록 더 안 듣는다.**
import type { Rng } from '../../pokemon/instance'

/**
 * 뱃지 수가 정하는 문턱 레벨.
 *
 * 뱃지 0·1 → 10, 2·3 → 30, 4·5 → 50, 6·7 → 70, 8 → 없음.
 *
 * ⚠️ **홀수 뱃지에서는 안 오른다.** 원작이 `>= 2`, `>= 4`, `>= 6`으로만 올린다 —
 * 뱃지마다 오른다고 두면 세 번째 관장을 이긴 순간 문턱이 40이 되어 버린다
 */
export function obeyCap(badges: number): number {
  if (badges >= 6) return 70
  if (badges >= 4) return 50
  if (badges >= 2) return 30
  return 10
}

/** 뱃지 비트마스크에서 개수를 센다 (`TrainerInfo_BadgeCount`) */
export function badgeCount(mask: number): number {
  let n = 0
  for (let bit = 0; bit < 8; bit++) if (mask & (1 << bit)) n++
  return n
}

/**
 * 명령을 안 들었을 때 무슨 일이 일어나는가.
 *
 * · `obey` 들었다
 * · `ignoredAsleep` 자면서 명령을 무시했다 (코골기·잠꼬대를 시켰을 때)
 * · `otherMove` 명령을 무시하고 **다른 기술**을 썼다
 * · `nap` 꾸벅꾸벅 졸기 시작했다 — 그 자리에서 잠든다
 * · `hitSelf` 명령을 안 듣고 **자기를 때렸다**
 * · `nothing` 빈둥거렸다 / 명령을 안 듣는다 / 외면했다 / 못 들은 척했다
 */
type ObeyResult = 'obey' | 'ignoredAsleep' | 'otherMove' | 'nap' | 'hitSelf' | 'nothing'

export interface ObeyContext {
  /** 명령을 받은 마리의 레벨 */
  level: number
  /** 뱃지 수 0~8 */
  badges: number
  /** 원래 트레이너가 나인가 (`origin.isOriginalTrainer`). 참이면 늘 듣는다 */
  isOwn: boolean
  /** 지금 상태이상. 잠들어 있으면 코골기·잠꼬대 갈래가 열린다 */
  status: string
  /** 고른 기술이 코골기·잠꼬대인가 */
  sleepMove: boolean
  /** 자기 최면·불면 특성인가 — 그러면 졸지 않는다 */
  cantSleep: boolean
  /** 바꿔 쓸 수 있는 다른 기술 칸 번호(1부터). 비어 있으면 바꿀 것이 없다 */
  otherSlots: readonly number[]
}

interface ObeyCheck {
  result: ObeyResult
  /** `otherMove`일 때 실제로 쓰는 기술 칸(1부터) */
  slot?: number
}

/** `BattleSystem_RandNext() & 0xFF` — 0~255 */
function byte(rng: Rng): number {
  return Math.floor(rng() * 256) & 0xff
}

/**
 * `((rand & 0xFF) * (레벨 + 문턱)) >> 8`이 문턱보다 작으면 듣는다.
 *
 * ⚠️ **레벨이 높을수록 더 안 듣는다.** 곱하는 값에 레벨이 들어 있어서 문턱을
 * 넘긴 폭만큼 통과 확률이 내려간다 — 그냥 `rand < 문턱`으로 두면 레벨 71이든
 * 100이든 똑같이 듣는다
 */
function passes(rng: Rng, level: number, cap: number): boolean {
  return ((byte(rng) * (level + cap)) >> 8) < cap
}

/**
 * 이 명령을 들을 것인가 (`BattleControllerPlayer_CheckObedience`).
 *
 * ⚠️ **판정을 두 번 굴린다.** 첫 번째를 통과하면 그냥 듣고, 떨어지면 두 번째로
 * 「다른 기술을 쓴다」와 「아무것도 안 한다」를 가른다. 한 번으로 접으면 불복이
 * 통째로 다른 기술 쪽이나 아무것도 안 하는 쪽으로 쏠린다
 */
export function checkObedience(ctx: ObeyContext, rng: Rng): ObeyCheck {
  if (ctx.isOwn) return { result: 'obey' }
  if (ctx.badges >= 8) return { result: 'obey' }

  const cap = obeyCap(ctx.badges)
  if (ctx.level <= cap) return { result: 'obey' }
  if (passes(rng, ctx.level, cap)) return { result: 'obey' }

  // 자면서 코골기·잠꼬대를 시킨 자리. 여기만 따로 있는 것은 그 둘이 **자고
  // 있어야 나가는** 기술이라 다른 기술로 바꿀 수가 없어서다
  if (ctx.status === 'slp' && ctx.sleepMove) return { result: 'ignoredAsleep' }

  if (passes(rng, ctx.level, cap)) {
    // 쓸 수 있는 다른 기술이 하나도 없으면 아무것도 안 한다
    if (ctx.otherSlots.length === 0) return { result: 'nothing' }
    const at = ctx.otherSlots[Math.floor(rng() * ctx.otherSlots.length)]
    return at === undefined ? { result: 'nothing' } : { result: 'otherMove', slot: at }
  }

  // ⚠️ **문턱을 넘긴 폭이 여기서 확률이 된다.** 레벨 100이 뱃지 없이 나오면
  // 폭이 90이라 세 갈래 중 앞 둘에 거의 반드시 걸린다
  const over = ctx.level - cap
  let roll = byte(rng)
  if (roll < over && ctx.status === 'ok' && !ctx.cantSleep) return { result: 'nap' }
  roll -= over
  if (roll < over) return { result: 'hitSelf' }
  return { result: 'nothing' }
}

/**
 * 아무것도 안 했을 때 나오는 네 마디 중 하나 (`subscript_disobey_do_nothing`).
 *
 * 0 빈둥거린다 · 1 명령을 안 듣는다 · 2 외면했다 · 3 못 들은 척했다.
 * 원작이 `Random 3, 0`으로 뽑는데 그 명령이 **범위에 1을 더하므로** 넷이다
 */
export function idleFlavor(rng: Rng): number {
  return Math.floor(rng() * 4) & 3
}

/** 자기를 때리는 데미지의 위력 (`CALC_SELF_HIT(MOVE_POUND, 40)`) */
const SELF_HIT_POWER = 40

/**
 * 안 듣고 자기를 때렸을 때의 데미지 (흔들림 전).
 *
 * 혼란 자해와 **같은 계산**이다 — 위력 40, 자기 공격 대 자기 방어, 급소도
 * 타입 상성도 자속도 없다. 4세대 데미지 뼈대를 그대로 옮긴다:
 * `공격 × 위력 × (레벨×2/5 + 2) / 방어 / 50 + 2`, 매 칸이 버림이다
 */
export function selfHitDamage(level: number, atk: number, def: number): number {
  const step = Math.floor((level * 2) / 5) + 2
  return Math.floor(Math.floor((atk * SELF_HIT_POWER * step) / Math.max(1, def)) / 50) + 2
}

/**
 * 데미지 흔들림 (`BattleSystem_CalcDamageVariance`).
 *
 * ⚠️ **85~100%가 아니라 `100 − rand%16`이다.** 16칸이라 85도 100도 나온다 —
 * 흔한 「85~100 사이 균일」로 두면 상한이 한 칸 모자란다
 */
export function damageVariance(damage: number, rng: Rng): number {
  if (damage === 0) return 0
  return Math.max(1, Math.floor((damage * (100 - (Math.floor(rng() * 16) & 15))) / 100))
}
