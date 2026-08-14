// VS시커 (PARITY §7.9) — `src/overlay005/vs_seeker.c`
//
// **길에 서 있는 사람이 한 번 지면 그걸로 끝이었다.** 원작은 이 기계 하나로
// 신오의 트레이너 240명을 다시 세운다 — 이긴 사람 머리 위에 느낌표 둘이 뜨고,
// 말을 걸면 그때는 더 센 팀이 나온다.
//
// 계통은 셋으로 갈린다:
//
//   ① **배터리** — 걸으면 찬다(100걸음). 다 안 차면 못 쓴다
//   ② **훑기**   — 화면 안의 트레이너를 모아 절반씩 굴려 재대결을 세운다
//   ③ **재대결** — 그 사람에게 말을 걸면 표에서 지금 단계의 상대를 고른다
//
// ⚠️ **자리 표시가 세이브에 안 남는다.** 「지금 느낌표가 서 있는 사람」은
// 맵 객체의 이동 유형(`MOVEMENT_TYPE_VS_SEEKER_SPIN`) 하나로만 있고, 맵을
// 옮기면 통째로 사라진다 — 원작도 `field_map_change.c`가 맵을 갈 때마다
// `SystemVars_ResetVsSeeker`를 부른다. 배터리만 넘어간다.
import {
  DISGUISE_MOVEMENT_TYPES, MOVEMENT_TYPE_VS_SEEKER_SPIN, REMATCH_END, REMATCH_NONE,
  VS_SEEKER_MAX_ACTIVE_STEPS, VS_SEEKER_MAX_BATTERY, VS_SEEKER_MAX_REMATCHES,
  VS_SEEKER_REMATCH_CHANCE, VS_SEEKER_REMATCHES, VS_SEEKER_SEARCH,
} from './vsSeekerTable'

/** `TRAINER_NONE`. 스크립트가 이 값을 보고 「재대결 아님」으로 간다 */
export const TRAINER_NONE = 0

/** 훑기 결과 (`constants/vs_seeker.h`의 `VS_SEEKER_USE_RESULT_*`) */
export const VsSeekerResult = {
  ok: 0,
  noBattery: 1,
  noTrainers: 2,
  /** 화면에는 있었는데 아무도 안 응했다 */
  noneReady: 3,
} as const
export type VsSeekerResultValue = (typeof VsSeekerResult)[keyof typeof VsSeekerResult]

/**
 * 훑기가 보는 트레이너 하나.
 *
 * `trainerID`가 0이면 트레이너가 아니다 — 화면 안에 있어도 안 센다
 */
export interface SeekerTrainer {
  localID: number
  trainerID: number
  /** `generated/trainer_types.txt`. 1~8만 훑는다 */
  trainerType: number
  /** 지금 이 사람의 이동 유형. 변장 넷은 빠지고, 회전이면 이미 서 있는 것이다 */
  movementType: number
  x: number
  z: number
}

/**
 * 시야에 드는 유형 (`VsSeekerSystem_CollectViableNPCs`의 `switch`).
 *
 * ⚠️ **`TRAINER_TYPE_UNK_003`(3)이 빠져 있다.** 1·2·4~8만 든다 — 원작의
 * `switch`에 3번 딱 하나가 없다. 「1 이상 8 이하」로 적으면 그 하나가 새어 든다
 */
const VIEWED_TYPES: ReadonlySet<number> = new Set([1, 2, 4, 5, 6, 7, 8])

/** 변장한 사람은 안 훑는다 (`VsSeeker_IsMoveCodeHidden`) */
const DISGUISED: ReadonlySet<number> = new Set(DISGUISE_MOVEMENT_TYPES)

/**
 * 그 칸이 훑는 네모 안인가.
 *
 * ⚠️ **왼쪽·위가 0에서 잘린다** (`if (xMin < 0) xMin = 0`). 오른쪽·아래는 안
 * 자른다 — 맵 밖 좌표는 애초에 사람이 없으니 원작도 안 막는다. 0 근처에서
 * 서 있으면 그만큼 네모가 좁아진다
 */
export function inSearchRange(px: number, pz: number, tx: number, tz: number): boolean {
  const xMin = Math.max(0, px - VS_SEEKER_SEARCH.left)
  const zMin = Math.max(0, pz - VS_SEEKER_SEARCH.up)
  return tx >= xMin && tx <= px + VS_SEEKER_SEARCH.right
    && tz >= zMin && tz <= pz + VS_SEEKER_SEARCH.down
}

/** 이 사람이 훑기에 드는가 (`VsSeekerSystem_CollectViableNPCs` 한 줄) */
export function isViable(t: SeekerTrainer, px: number, pz: number): boolean {
  return VIEWED_TYPES.has(t.trainerType)
    && inSearchRange(px, pz, t.x, t.z)
    && !DISGUISED.has(t.movementType)
}

/** 지금 화면 안에 선 트레이너들. 자리 차례가 원작의 맵 객체 차례다 */
export function viableTrainers(
  all: readonly SeekerTrainer[], px: number, pz: number,
): SeekerTrainer[] {
  return all.filter((t) => isViable(t, px, pz))
}

/**
 * 지금 쓸 수 있는가 (`VsSeekerSystem_CheckUsability`).
 *
 * ⚠️ **배터리가 「가득」이어야 한다 — 크거나 같음이 아니라 같음이다.** 원작이
 * `== VS_SEEKER_MAX_BATTERY`로 본다
 */
export function vsSeekerUsable(battery: number, visible: number): VsSeekerResultValue {
  if (battery !== VS_SEEKER_MAX_BATTERY) return VsSeekerResult.noBattery
  if (visible === 0) return VsSeekerResult.noTrainers
  return VsSeekerResult.ok
}

/** 배터리가 얼마나 남았는가. 대사창이 이 수를 그대로 읽는다 */
export function batteryMissing(battery: number): number {
  return VS_SEEKER_MAX_BATTERY - battery
}

/** 머리 위에 뜨는 표시 */
export type SeekerMark =
  /** 느낌표 하나 — **아직 안 싸운 사람**이다. 재대결이 아니다 */
  | 'single'
  /** 느낌표 둘 — 재대결에 응했다 */
  | 'double'

export interface SeekerPick {
  /** 머리 위에 띄울 표시 */
  marks: { localID: number; mark: SeekerMark }[]
  /** 이동 유형을 회전으로 갈아 끼울 사람들 */
  spin: number[]
  /** 하나라도 떴는가 (`anyAvailable`) */
  any: boolean
}

export interface PickInput {
  /** 훑기에 든 사람들 (`viableTrainers`) */
  visible: readonly SeekerTrainer[]
  /** 그 트레이너를 이미 이겼는가 (`Script_IsTrainerDefeated`) */
  defeated: (trainerID: number) => boolean
  /** 그 트레이너가 더블인가 (`Script_IsTrainerDoubleBattle`) */
  isDouble: (trainerID: number) => boolean
  /** 맵 위의 **모든** 객체. 더블의 짝을 여기서 찾는다 */
  all: readonly SeekerTrainer[]
  /** `LCRNG_Next() % 100` */
  roll: () => number
}

/**
 * 재대결을 세운다 (`VsSeekerSystem_PickRematchTrainers`).
 *
 * ⚠️ **느낌표 하나는 재대결이 아니다.** 아직 안 싸운 사람에게 붙는 표시이고,
 * 그 사람의 이동 유형은 안 바뀐다 — 「저기 아직 안 싸운 사람이 있다」는 안내다.
 * 그런데도 `any`를 세우므로, 안 싸운 사람이 하나라도 있으면 "아무도 준비가 안
 * 됐다" 대사가 안 나온다.
 *
 * ⚠️ **주사위는 이미 서 있는 사람에게도 굴린다.** 조건이
 * `굴림 < 50 && 회전중이 아님` 차례라 C의 단락 평가가 굴림을 먼저 쓴다 —
 * 순서를 바꾸면 난수 소비가 달라진다.
 */
export function pickRematchTrainers(input: PickInput): SeekerPick {
  const { visible, defeated, isDouble, all, roll } = input
  const marks: { localID: number; mark: SeekerMark }[] = []
  const spin: number[] = []
  let any = false

  for (const t of visible) {
    if (!defeated(t.trainerID)) {
      marks.push({ localID: t.localID, mark: 'single' })
      any = true
      continue
    }
    const lucky = roll() < VS_SEEKER_REMATCH_CHANCE
    if (!lucky || t.movementType === MOVEMENT_TYPE_VS_SEEKER_SPIN || spin.includes(t.localID)) continue
    spin.push(t.localID)
    marks.push({ localID: t.localID, mark: 'double' })
    const second = secondDoubleTrainer(t, all, isDouble, spin)
    if (second !== null) {
      spin.push(second.localID)
      marks.push({ localID: second.localID, mark: 'double' })
    }
    any = true
  }
  return { marks, spin, any }
}

/**
 * 더블 배틀의 **다른 한 사람** (`VsSeeker_GetSecondDoubleBattleTrainer`).
 *
 * ⚠️ **같은 트레이너 번호를 쓰는 다른 객체**다. 더블은 사람이 둘인데 팀은
 * 하나라, 배치표에서 스크립트 번호만 다르고 트레이너 번호가 같다. 이걸 안
 * 찾으면 짝 중 하나만 돌아서 재대결이 반쪽으로 선다
 */
function secondDoubleTrainer(
  first: SeekerTrainer,
  all: readonly SeekerTrainer[],
  isDouble: (trainerID: number) => boolean,
  spinning: readonly number[],
): SeekerTrainer | null {
  if (!isDouble(first.trainerID)) return null
  for (const other of all) {
    // 이미 도는 사람은 건너뛴다 (`..._MODE_REMATCH_ANIM_CHECK`)
    if (other.movementType === MOVEMENT_TYPE_VS_SEEKER_SPIN || spinning.includes(other.localID)) continue
    if (!VIEWED_TYPES.has(other.trainerType)) continue
    if (other.localID !== first.localID && other.trainerID === first.trainerID) return other
  }
  return null
}

// ── 걸음 ─────────────────────────────────────────────────────────────────────

export interface SeekerStepResult {
  battery: number
  steps: number
  /** 이번 걸음에 느낌표가 다 꺼졌는가. 회전하던 사람을 되돌린다 */
  expired: boolean
}

/**
 * 한 칸 걸었다 (`VsSeeker_UpdateStepCount`).
 *
 * ⚠️ **가방에 있어야 찬다.** 안 가진 동안 걸은 걸음은 안 쌓인다 —
 * 원작이 `Bag_CanRemoveItem(…, ITEM_VS_SEEKER, 1, …)`을 먼저 본다.
 *
 * ⚠️ **느낌표 걸음은 배터리와 따로 돈다.** 배터리가 차는 것과 상관없이,
 * 「썼다」 깃발이 서 있는 동안만 100까지 세고 거기서 통째로 꺼진다
 */
export function vsSeekerStep(
  battery: number, steps: number, used: boolean, hasSeeker: boolean,
): SeekerStepResult {
  const next = hasSeeker && battery < VS_SEEKER_MAX_BATTERY ? battery + 1 : battery
  if (!used) return { battery: next, steps, expired: false }
  const walked = steps < VS_SEEKER_MAX_ACTIVE_STEPS ? steps + 1 : steps
  if (walked === VS_SEEKER_MAX_ACTIVE_STEPS) return { battery: next, steps: 0, expired: true }
  return { battery: next, steps: walked, expired: false }
}

// ── 재대결 상대 고르기 ───────────────────────────────────────────────────────

/**
 * 표에서 이 트레이너의 줄 번호 (`VsSeeker_GetRematchDataIndexForTrainer`).
 *
 * 0번 칸으로만 찾는다 — 재대결 상대의 번호로는 안 걸린다
 */
export function rematchIndexOf(trainerID: number): number | null {
  const at = VS_SEEKER_REMATCHES.findIndex((row) => row[0] === trainerID)
  return at < 0 ? null : at
}

/**
 * 지금 몇 단계인가 (`VsSeeker_GetCurrentLevelForRematchData`).
 *
 * 1단계부터 훑어 **아직 안 이긴 첫 상대**의 단계를 돌려준다. `REMATCH_END`를
 * 만나면 그 앞이 마지막이고, 끝까지 다 이겼으면 마지막 단계에서 멈춘다 —
 * 그래서 다 이긴 뒤에도 제일 센 팀과 계속 다시 싸울 수 있다
 */
export function currentRematchLevel(
  index: number, defeated: (trainerID: number) => boolean,
): number {
  const row = VS_SEEKER_REMATCHES[index]
  if (!row) return 0
  let level = 1
  for (; level < VS_SEEKER_MAX_REMATCHES; level++) {
    const id = row[level] ?? REMATCH_END
    if (id === REMATCH_END) return level - 1
    if (id !== REMATCH_NONE && !defeated(id)) return level
  }
  return level - 1
}

/**
 * 이야기가 아직 거기까지 안 갔으면 한 단계 내린다 (`VsSeeker_AdjustRematchLevel`).
 *
 * 단계 다섯이 이야기에 매여 있다 — 1은 207번 도로, 2는 영원시티(신오전설),
 * 3은 창순령, 4는 명예의 전당, 5는 스타크산이다.
 *
 * ⚠️ **한 번만 내린다.** 내려간 자리가 또 안 열려 있어도 다시 안 본다 —
 * 원작이 그렇다. 플래그가 차례대로 서므로 실제로는 문제가 안 되지만,
 * 「안전하게」 되풀이로 고치면 원작과 다른 팀이 나온다
 */
export function adjustRematchLevel(
  index: number, level: number, unlocked: (level: number) => boolean,
): number {
  if (level === 0 || unlocked(level)) return level
  const row = VS_SEEKER_REMATCHES[index]
  if (!row) return 0
  for (let i = level - 1; i > 0; i--) {
    if (row[i] !== REMATCH_NONE) return i
  }
  return 0
}

export interface RematchInput {
  /** 이 사람이 지금 회전하고 있는가 (`VsSeeker_IsTrainerDoingRematchAnimation`) */
  spinning: boolean
  /** 배치표가 들고 있는 트레이너 번호 */
  trainerID: number
  defeated: (trainerID: number) => boolean
  /** 그 단계가 열려 있는가 (`SystemFlag_CheckUnlockedVsSeekerLevel`) */
  unlocked: (level: number) => boolean
}

/**
 * 말을 건 사람과 지금 싸울 트레이너 번호 (`VsSeeker_GetRematchTrainerID`).
 *
 * ⚠️ **회전하고 있어야 한다.** 느낌표가 안 뜬 사람에게 말을 걸면 `TRAINER_NONE`이고,
 * 스크립트는 그걸 보고 「이미 이긴 사람」 대사로 간다 — 이 한 줄이 재대결의 문이다
 */
export function rematchTrainerID(input: RematchInput): number {
  if (!input.spinning) return TRAINER_NONE
  const index = rematchIndexOf(input.trainerID)
  if (index === null) return TRAINER_NONE
  const level = adjustRematchLevel(
    index, currentRematchLevel(index, input.defeated), input.unlocked,
  )
  return VS_SEEKER_REMATCHES[index]?.[level] ?? TRAINER_NONE
}
