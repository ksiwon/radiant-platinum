// 걸음마다 도는 것들 (PARITY §1.1) — `Field_ProcessStep`
// (`src/overlay005/field_control.c`).
//
// **이 파일이 없어서 여섯 가지가 같이 막혀 있었다.** 원작은 한 칸 걸을 때마다
// 아래를 이 차례로 돌린다:
//
//   포켓치 만보계 → 독 → 사파리 → 육아방 → VS시커 → 레이더 → 리펠 → 친밀도
//   → 상호교류광장 걸음 수
//
// 여기 있는 것은 그중 **우리에게 계통이 있는 셋**이다: 독·리펠·친밀도. 나머지
// 넷은 그 계통이 붙는 날 이 차례 그대로 끼워 넣는다 — 순서가 자료다.
//
// ⚠️ **프레임이 아니라 걸음이다.** 60fps에서 프레임마다 돌리면 한 칸에 여덟
// 번씩 도는데, 그러면 독이 여덟 배로 깎이고 친밀도는 128걸음이 16걸음이 된다.
import type { PokemonInstance } from '../pokemon/instance'
import { clampFriendship, LUXURY_BALL, MAX_FRIENDSHIP } from '../pokemon/friendship'

/** `LOW_FRIENDSHIP_LIMIT` · `MED_FRIENDSHIP_LIMIT` */
const LOW_TIER = 100
const MED_TIER = 200

/**
 * `sFriendshipChangeTable[FRIENDSHIP_EVENT_WALK_CYCLE]`.
 *
 * 세 구간이 다 1이다 — 다른 사건과 달리 친해질수록 덜 오르지 않는다
 */
const WALK_CHANGE = [1, 1, 1] as const

/** `sFriendshipChangeTable[FRIENDSHIP_EVENT_POISON_SURVIVE]` */
const POISON_SURVIVE_CHANGE = [-5, -5, -10] as const

/** 친밀도 한 걸음 주기 (`Field_UpdateFriendship`) */
export const FRIENDSHIP_STEPS = 128

/** 독이 깎는 주기 (`Field_UpdatePoison`) */
export const POISON_STEPS = 4

/**
 * `VAR_FRIENDSHIP_INCREMENT_STEP_COUNTER`의 자리.
 *
 * `generated/vars_flags.txt`에서 `VAR_MAP_LOCAL_0x00`(= `VARS_START`)부터 센
 * 번째다. 새 칸을 만들지 않고 **원작이 쓰는 그 변수**를 쓴다 — 스크립트가
 * 같은 번호를 읽을 수 있어야 한다
 */
export const VAR_FRIENDSHIP_STEPS = 76

/** `VAR_AMITY_SQUARE_STEP_COUNT`. 상호교류광장이 붙으면 이 칸이 쓰인다 */
export const VAR_AMITY_STEPS = 60

/** 지금 친밀도가 몇 번째 구간인가 (0·1·2) */
function tierOf(friendship: number): number {
  return (friendship >= LOW_TIER ? 1 : 0) + (friendship >= MED_TIER ? 1 : 0)
}

/** 걸음 하나가 얹는 친밀도. 보정 셋까지 얹은 값이다 */
export function walkFriendship(
  mon: PokemonInstance, label: number, soothing: boolean,
): number {
  let change: number = WALK_CHANGE[tierOf(mon.friendship)] ?? 0
  if (change <= 0) return change
  if (mon.ball === LUXURY_BALL) change++
  // ⚠️ 견주는 것은 **알을 받은 자리**다 (`Pokemon_UpdateFriendship`). 잡은
  // 자리가 아니다 — 잡은 마리는 알 자리가 0이라 0번 지역명에서만 걸린다.
  // `label`은 맵 번호가 아니라 **지역명 번호**다
  if (mon.origin.egg.location === label) change++
  if (soothing) change = Math.trunc((change * 150) / 100)
  return change
}

/** 독으로 1까지 깎인 마리가 잃는 친밀도 (`FRIENDSHIP_EVENT_POISON_SURVIVE`) */
function poisonSurviveFriendship(mon: PokemonInstance): number {
  return POISON_SURVIVE_CHANGE[tierOf(mon.friendship)] ?? 0
}

export const Poison = {
  /** 아무도 안 중독됐다 */
  NONE: 0,
  /** 누군가 깎였다 */
  HURT: 1,
  /** 누군가 1까지 내려갔다 — 원작은 여기서 스크립트를 하나 건다 */
  FAINTED: 2,
} as const
type PoisonOutcome = (typeof Poison)[keyof typeof Poison]

/**
 * 이 걸음에서 독 연출(화면 일렁임 + `SEQ_SE_DP_DOKU2`)이 도는가.
 *
 * 깎이기만 했든 1까지 내려갔든 **둘 다** 돈다 — 원작 `Field_UpdatePoison`이
 * `FLDPSN_POISONED`·`FLDPSN_FAINTED` 두 갈래에서 같은 `Field_DoPoisonEffect`를 부른다
 * (`overlay005/field_control.c` 908-916)
 */
export const poisonShowsEffect = (outcome: PoisonOutcome): boolean => outcome !== Poison.NONE

/**
 * 이 걸음이 독 스크립트(`SCRIPT_ID(COMMON_SCRIPTS, 3)`)를 걸고 거기서 멈추는가.
 *
 * ⚠️ **1까지 내려간 걸음에서만이다.** 깎이기만 한 걸음은 원작이 연출만 내고 `FALSE`를
 * 돌려줘서 그 뒤(리펠 끝 알림 …)가 같은 걸음에 이어 돈다. 한때 깎일 때마다 걸어서
 * 독 든 마리를 데리고 다니면 네 걸음마다 `LockAll`에 발이 묶였다
 */
export const poisonRunsScript = (outcome: PoisonOutcome): boolean => outcome === Poison.FAINTED

/**
 * 독이 들 때 화면이 가로로 일렁이는 폭 — 원작 픽셀(256폭), 틱마다 하나 (`ov5_021EF4BC.c`).
 *
 * 원작 태스크(`ov5_021EF5A8`)가 0번 갈래에서 셈을 3으로 두고, 1번 갈래에서 세 틱 동안
 * `3 × (3 − 셈) / 3` = 1·2·3을, 2번 갈래에서 세 틱 동안 `3 × 셈 / 3` = 2·1·0을 쓴 뒤
 * 3번 갈래에서 걷는다. 첫 0은 0번 갈래의 틱이다 — 그때 표는 `memset`으로 0이다.
 *
 * ⚠️ **한 틱을 1/60초로 센다.** 원작 본 루프 한 바퀴는 1/30초지만 우리 연출은 다
 * 1/60초 규약이라(docs/orders/COMPLETION_20260928.md §0) 여기만 따로 늦추지 않는다.
 * 원작의 겹버퍼(`BufferManager`) 한 틱 늦음도 같은 까닭으로 접는다
 */
export const POISON_WOBBLE_PIXELS: readonly number[] = [0, 1, 2, 3, 2, 1, 0]

/** 한 틱 (ms) */
const POISON_WOBBLE_TICK_MS = 1000 / 60

/**
 * 같은 쪽으로 밀리는 주사선 묶음의 높이 — 열 줄마다 방향이 뒤집힌다 (`ov5_021EF66C`의 `v0 % 10`).
 *
 * 화면 192줄 중 0~9줄이 −, 10~19줄이 +다: 원작이 `v2 = 1`로 시작해 0번 줄에서 먼저
 * 뒤집기 때문이다. 표는 H블랭크에서 **다음 줄** 몫을 읽어 걸므로(`ov5_021EF634`의 `v1++`)
 * L번 줄에 서는 값이 곧 표의 L번 칸이다
 */
export const POISON_WOBBLE_BAND = 10

/**
 * 지금 도는 독 일렁임. 걸음 쪽(`scene/stepSystem`)이 세우고 후처리(`scene/fx/post`)가 읽는다.
 *
 * ⚠️ **틱을 세지 않고 시각을 적는다.** 원작 태스크는 필드가 멈춰도 제 길이만큼 돌고
 * 끝난다. 고정 스텝(`gameLoop`)에 매어 세면 메뉴나 창 내림으로 루프가 서는 순간
 * 화면이 3픽셀 밀린 채로 굳는다. 프레임마다 바뀌는 값이라 스토어가 아니라 읽기용
 * 싱글톤이다 (`battle/encounterCutIn`의 `cutInFrame`과 같은 이유다)
 */
export const fieldPoisonWobble: { since: number | null } = { since: null }

/** 독 일렁임을 처음부터 다시 건다. 도는 중이면 되감는다 — 네 걸음 사이에 다 끝나므로 겹칠 일은 없다 */
export function startPoisonWobble(now: number): void {
  fieldPoisonWobble.since = now
}

/** 그 시각의 일렁임 폭 (원작 픽셀). 안 돌면 0이고, 다 돌았으면 그 자리에서 놓는다 */
export function poisonWobblePixels(now: number): number {
  const since = fieldPoisonWobble.since
  if (since === null) return 0
  const tick = Math.floor((now - since) / POISON_WOBBLE_TICK_MS)
  const px = POISON_WOBBLE_PIXELS[Math.max(0, tick)]
  if (px === undefined) {
    fieldPoisonWobble.since = null
    return 0
  }
  return px
}

/** 주사선 L(0~191, 위가 0)이 밀리는 방향 — +1이면 그림이 왼쪽으로 간다 (`G3X_SetHOffset`) */
export function poisonWobbleSign(line: number): 1 | -1 {
  return Math.floor(line / POISON_WOBBLE_BAND) % 2 === 0 ? -1 : 1
}

interface PoisonResult {
  party: PokemonInstance[]
  outcome: PoisonOutcome
}

/**
 * 독 한 번 (`Pokemon_DoPoisonDamage`).
 *
 * ⚠️ **0으로 안 떨어진다.** 4세대부터 필드 독은 1에서 멈추고, 그 마리가 대신
 * 친밀도를 잃는다. 그래서 "독으로 전멸"이 없다 — 원작의 `FLDPSN_FAINTED`라는
 * 이름은 남았지만 실제로 쓰러지지는 않는다
 */
export function poisonStep(party: readonly PokemonInstance[]): PoisonResult {
  let hurt = 0
  let bottomed = 0
  const next = party.map((mon) => {
    if (mon.hp <= 0) return mon
    if (mon.status !== 'psn' && mon.status !== 'tox') return mon
    const hp = mon.hp > 1 ? mon.hp - 1 : mon.hp
    hurt++
    if (hp !== 1) return { ...mon, hp }
    bottomed++
    return {
      ...mon, hp,
      friendship: clampFriendship(mon.friendship + poisonSurviveFriendship(mon)),
    }
  })
  const outcome: PoisonOutcome = bottomed > 0 ? Poison.FAINTED
    : hurt > 0 ? Poison.HURT : Poison.NONE
  return { party: outcome === Poison.NONE ? [...party] : next, outcome }
}

/** 걸음 하나가 바깥에서 필요로 하는 것 */
export interface StepWorld {
  party: readonly PokemonInstance[]
  /** 지금 맵의 **지역명 번호** (`MapHeader_GetMapLabelTextID`). 맵 번호가 아니다 */
  label: number
  /** 독 걸음 (0~3) */
  poisonSteps: number
  /** 남은 리펠 걸음 */
  repelSteps: number
  /** 친밀도 걸음 (`VAR_FRIENDSHIP_INCREMENT_STEP_COUNTER`) */
  friendshipSteps: number
  /** 그 마리가 평온의방울 부류를 들었는가 */
  soothing: (mon: PokemonInstance) => boolean
  /** 원작의 `LCRNG_Next() & 1` — 친밀도는 **절반만** 오른다 */
  coin: () => boolean
}

interface StepResult {
  party: PokemonInstance[]
  poisonSteps: number
  repelSteps: number
  friendshipSteps: number
  poison: PoisonOutcome
  /** 리펠이 이번 걸음에 끝났는가 — "○○의 효과가 없어졌다!" */
  repelExpired: boolean
}

/**
 * 한 칸 걸었다.
 *
 * **차례가 원작 그대로다.** 독이 먼저고 친밀도가 나중이라, 독으로 1이 된 마리는
 * 같은 걸음에서 친밀도를 잃고 나서 다시 조금 얻을 수 있다 — 원작이 그렇다.
 */
export function step(world: StepWorld): StepResult {
  // ① 독. 4걸음마다
  const poisonSteps = (world.poisonSteps + 1) % POISON_STEPS
  const hit = poisonSteps === 0
  const poisoned = hit ? poisonStep(world.party) : { party: [...world.party], outcome: Poison.NONE }

  // ② 리펠
  let repelSteps = world.repelSteps
  let repelExpired = false
  if (repelSteps > 0) {
    repelSteps--
    repelExpired = repelSteps === 0
  }

  // ③ 친밀도. 128걸음마다 파티 전원에게 한 번씩
  const friendshipSteps = (world.friendshipSteps + 1) % FRIENDSHIP_STEPS
  let party = poisoned.party
  if (friendshipSteps === 0) {
    party = party.map((mon) => {
      // 동전 던지기는 **마리마다** 한 번씩이다 — 원작이 개체마다 부른다
      if (world.coin()) return mon
      const delta = walkFriendship(mon, world.label, world.soothing(mon))
      if (delta === 0 || mon.friendship >= MAX_FRIENDSHIP) return mon
      return { ...mon, friendship: clampFriendship(mon.friendship + delta) }
    })
  }

  return {
    party, poisonSteps, repelSteps, friendshipSteps,
    poison: poisoned.outcome, repelExpired,
  }
}
