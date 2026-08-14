// 대습초원 사파리 (PARITY §7.7) — `scrcmd.c`의 사파리 셋 + `battle_controller_player.c`
//
// 들판시티의 대습초원은 **볼 서른 개와 걸음 오백**으로 도는 놀이다. 시작할 때
// 깃발이 서고, 그 깃발이 서 있는 동안은 배틀이 딴 것으로 바뀐다 — 기술도 경험치도
// 특성도 없고 볼·먹이·진흙·도망 넷뿐이다 (`BATTLE_TYPE_SAFARI`).
//
// ⚠️ **먹이와 진흙이 서로 반대가 아니다.** 먹이는 잡히는 값을 **올리면서** 도망도
// 올리고, 진흙은 도망을 내리면서 잡히는 값도 내린다 — 둘 다 한쪽만 확실히 움직이고
// 다른 쪽은 10분의 9로 움직인다. 그래서 어느 쪽도 공짜가 아니다.
//
// ⚠️ **깃발은 하늘을날기·순간이동·탈출로프로도 내려간다** (`FieldSystem_SetFlyFlags`
// 등 셋). 놀이 중에 밖으로 나가면 그것으로 끝이다.

/** 시작할 때 받는 사파리볼 (`ScrCmd_StartEndSafariGame`) */
export const SAFARI_BALLS = 30

/** 이 걸음을 채우면 끝난다 (`Field_UpdateSafari`) */
export const SAFARI_STEPS = 500

/** `SAFARI_STAGE_MAX`. 잡힘·도망 둘 다 0~12다 */
export const SAFARI_STAGE_MAX = 12

/** 배틀이 시작할 때의 값 — 열세 칸의 **한가운데**다 (`battle_lib.c`) */
export const SAFARI_STAGE_START = 6

/**
 * 칸마다의 배수 (`sSafariCatchRate` · `sFleeRateMultipliers`).
 *
 * ⚠️ **두 표가 값이 같다.** 원작이 잡히는 값과 도망 값에 각각 적어 뒀는데 열세
 * 줄이 한 줄도 안 다르다 — 그래서 한 표로 둔다. 한가운데(6)가 1배고 아래로는
 * 10/15·10/20…으로 줄고 위로는 15/10·20/10…으로 는다
 */
export const SAFARI_RATE: readonly (readonly [number, number])[] = [
  [10, 40], [10, 35], [10, 30], [10, 25], [10, 20], [10, 15], [10, 10],
  [15, 10], [20, 10], [25, 10], [30, 10], [35, 10], [40, 10],
]

/** 한 판의 상태 (`battleCtx`의 두 칸). 배틀이 끝나면 버린다 */
export interface SafariBattle {
  /** 잡히는 값의 칸. 먹이를 주면 오른다 */
  catchStage: number
  /** 도망 값의 칸. 먹이를 주면 오르고 진흙을 던지면 내린다 */
  escapeStage: number
}

export function newSafariBattle(): SafariBattle {
  return { catchStage: SAFARI_STAGE_START, escapeStage: SAFARI_STAGE_START }
}

const clamp = (n: number): number => Math.min(SAFARI_STAGE_MAX, Math.max(0, n))

/**
 * 먹이를 던진다 (`BattleControllerPlayer_SafariBaitCommand`).
 *
 * ⚠️ **잡히는 값은 늘 오르고 도망은 10분의 9로 오른다.** 굴린 값이 0일 때만
 * 도망이 안 오르고, 그때 「먹느라 바쁘다」가 뜬다 — 그 문장이 곧 이득 본 판이다
 *
 * @param roll `BattleSystem_RandNext() % 10`
 */
export function throwBait(at: SafariBattle, roll: number): SafariBattle {
  return {
    catchStage: clamp(at.catchStage + 1),
    escapeStage: roll !== 0 ? clamp(at.escapeStage + 1) : at.escapeStage,
  }
}

/**
 * 진흙을 던진다 (`BattleControllerPlayer_SafariRockCommand`).
 *
 * ⚠️ **도망은 늘 내리고 잡히는 값은 10분의 9로 내린다.** 굴린 값이 0일 때만
 * 잡히는 값이 안 내리고, 그때 「몹시 화났다」가 뜬다 — 그쪽이 이득 본 판이다.
 *
 * ⚠️ **내리는 것은 0까지다.** 0에서 또 던져도 더 안 내려간다
 */
export function throwMud(at: SafariBattle, roll: number): SafariBattle {
  return {
    catchStage: roll !== 0 ? clamp(at.catchStage - 1) : at.catchStage,
    escapeStage: clamp(at.escapeStage - 1),
  }
}

/** 「먹느라 바쁘다」·「몹시 화났다」인가. 굴린 값 0이 그 판이다 */
export function safariRollBusy(roll: number): boolean {
  return roll === 0
}

/**
 * 지금 판의 포획값 (`BattleScript_CalcCaptureShakes`의 사파리 갈래).
 *
 * 종족의 포획값에 칸의 배수를 곱한다 — **버림 나눗셈**이라 낮은 칸에서는
 * 종족값이 큰 마리도 뚝 떨어진다
 */
export function safariCatchRate(speciesCatchRate: number, stage: number): number {
  const [num, den] = SAFARI_RATE[clamp(stage)] ?? [10, 10]
  return Math.floor((speciesCatchRate * num) / den)
}

/**
 * 이번 턴에 도망가는가 (`Task_SafariPokemonSetCommandSelection`).
 *
 * ⚠️ **종족마다 다른 「도망값」을 쓴다** (`safariFleeRate`) — 포획값과 다른 칸이다.
 *
 * ⚠️ **`<=`라서 도망값 0이어도 안 붙박이다.** 굴린 값이 도망값과 **같아도**
 * 도망가고 `%255`라 0~254이므로, 0인 종도 굴린 값이 0인 턴에는 달아난다 —
 * 255분의 1이다. 507종 중 474종이 0인데 「영영 안 간다」로 읽으면 그 한 칸을
 * 놓친다. 반대쪽 끝은 150이고, 도망값 255면 늘 도망가는 셈이다
 *
 * @param roll `BattleSystem_RandNext() % 255`
 */
export function safariFlees(speciesFleeRate: number, stage: number, roll: number): boolean {
  const [num, den] = SAFARI_RATE[clamp(stage)] ?? [10, 10]
  return roll <= Math.floor((speciesFleeRate * num) / den)
}

// ── 필드 쪽 ─────────────────────────────────────────────────────────────────

/** 리포트에 남는 사파리 상태 (`FieldOverworldState`의 두 칸 + 시스템 깃발) */
export interface SafariState {
  /** 놀이 중인가 (`SystemFlag_*SafariGameActive`) */
  active: boolean
  /** 남은 사파리볼 */
  balls: number
  /** 걸은 걸음 */
  steps: number
}

export function newSafari(): SafariState {
  return { active: false, balls: 0, steps: 0 }
}

/** `SAFARI_GAME_ACTIVE` — 시작한다. 볼 서른에 걸음 0이다 */
export function startSafari(): SafariState {
  return { active: true, balls: SAFARI_BALLS, steps: 0 }
}

/** `SAFARI_GAME_INACTIVE` — 끝난다. **볼도 걸음도 0으로 지운다** */
export function endSafari(): SafariState {
  return { active: false, balls: 0, steps: 0 }
}

/** 놀이 밖으로 나갔다 (하늘을날기·순간이동·탈출로프). 깃발만 내린다 */
export function leaveSafari(at: SafariState): SafariState {
  return at.active ? { ...at, active: false } : at
}

/** 한 걸음 뒤에 무슨 일이 일어나는가 (`Field_UpdateSafari`) */
export type SafariStep =
  | { kind: 'off' }
  | { kind: 'walk'; state: SafariState }
  /** 볼이 떨어졌다 — `SCRIPT_ID(SAFARI_GAME, 2)` */
  | { kind: 'noBalls' }
  /** 걸음을 다 썼다 — `SCRIPT_ID(SAFARI_GAME, 1)` */
  | { kind: 'noSteps'; state: SafariState }

/**
 * 한 걸음 (`Field_UpdateSafari`).
 *
 * ⚠️ **볼을 먼저 본다.** 볼이 0이면 걸음을 **안 세고** 그 자리에서 끝난다 —
 * 그래서 마지막 볼을 쓴 뒤의 걸음은 오백에 안 들어간다
 */
export function safariStep(at: SafariState): SafariStep {
  if (!at.active) return { kind: 'off' }
  if (at.balls === 0) return { kind: 'noBalls' }
  const steps = at.steps + 1
  const state = { ...at, steps }
  return steps >= SAFARI_STEPS ? { kind: 'noSteps', state } : { kind: 'walk', state }
}

/** 사파리볼을 하나 쓴다 (`BattleControllerPlayer_SafariBallCommand`) */
export function useSafariBall(at: SafariState): SafariState {
  return { ...at, balls: Math.max(0, at.balls - 1) }
}

/** `SCRIPT_ID_OFFSET_SAFARI_GAME` */
export const SCRIPT_SAFARI_BASE = 8800
/** 걸음을 다 썼을 때 도는 스크립트 */
export const SCRIPT_SAFARI_OUT_OF_STEPS = SCRIPT_SAFARI_BASE + 1
/** 볼을 다 썼을 때 도는 스크립트 */
export const SCRIPT_SAFARI_OUT_OF_BALLS = SCRIPT_SAFARI_BASE + 2

// ── 습초원 열차 (`overlay006/great_marsh_tram.c`) ────────────────────────────

/** `GREAT_MARSH_TRAM_LOCATION_*`. 여섯 구역이 둘씩 묶여 셋이다 */
export const TRAM_STOP = { area12: 0, area34: 1, area56: 2 } as const

/**
 * 정거장의 z (타일). 원작이 `FX32_CONST(16) * (32*n + k)`로 적어 둔 것을
 * 타일로 되돌린 값이다 — 한 청크가 32칸이다
 */
export const TRAM_STOP_Z: readonly number[] = [32 * 1 + 8, 32 * 2 + 18, 32 * 3 + 12]

/**
 * 속도를 줄이기 시작하는 z (타일).
 *
 * 가운데 정거장만 둘이다 — 북쪽에서 올 때와 남쪽에서 올 때가 다르다
 */
export const TRAM_SLOW_Z = {
  area12: 32 * 1 + 14,
  area34North: 32 * 2 + 10,
  area34South: 32 * 2 + 24,
  area56: 32 * 3 + 4,
} as const

/** `GREAT_MARSH_TRAM_AT_LOCATION` · `_NOT_AT_LOCATION` */
export const TRAM_AT = 1
export const TRAM_NOT_AT = 0

/** 처음 세울 때의 자리 (`PersistedMapFeatures_InitForGreatMarsh`) — 5·6구역이다 */
export const TRAM_START = TRAM_STOP.area56

/**
 * 열차가 갈 자리와 속도를 줄일 자리 (`GreatMarshTram_MoveToLocation`).
 *
 * ⚠️ **가는 방향은 지금 자리가 정한다.** 1·2구역에 있으면 어디로 가든 남쪽이고,
 * 5·6구역이면 북쪽이다. 가운데에서만 목적지를 보고 갈린다
 */
export function tramMove(from: number, to: number): {
  destZ: number; slowZ: number; south: boolean
} {
  if (from === TRAM_STOP.area12) {
    return to === TRAM_STOP.area34
      ? { destZ: TRAM_STOP_Z[1]!, slowZ: TRAM_SLOW_Z.area34North, south: true }
      : { destZ: TRAM_STOP_Z[2]!, slowZ: TRAM_SLOW_Z.area56, south: true }
  }
  if (from === TRAM_STOP.area56) {
    return to === TRAM_STOP.area34
      ? { destZ: TRAM_STOP_Z[1]!, slowZ: TRAM_SLOW_Z.area34South, south: false }
      : { destZ: TRAM_STOP_Z[0]!, slowZ: TRAM_SLOW_Z.area12, south: false }
  }
  // 가운데에서는 목적지가 방향을 정한다
  return to === TRAM_STOP.area12
    ? { destZ: TRAM_STOP_Z[0]!, slowZ: TRAM_SLOW_Z.area12, south: false }
    : { destZ: TRAM_STOP_Z[2]!, slowZ: TRAM_SLOW_Z.area56, south: true }
}
