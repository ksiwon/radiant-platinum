// 주인공의 필드 동작 클립을 언제 돌릴 것인가 (PLAN §16.9 · 3D_GAP_AUDIT §3.2)
//
// 굽는 쪽은 클립을 **싣기만** 한다 (`HERO_FIELD_CLIPS`). 무엇을 언제 돌릴지는
// 여기가 정하고, 화면은 그 이름을 받아 돌리기만 한다 — 그래서 렌더러 없이
// 시험이 잰다.
//
// ⚠️ **절차형을 지우지 않는다.** 걷기·서기는 `actor/locomotion`이 뼈를 직접
// 돌려 만드는 것이고, 클립이 없는 판(설치본이 아직 낡은 판일 때, 몸을 못 구운
// 때)에는 그것이 그대로 그 자리를 맡는다. 여기서 `null`을 돌려주면 절차형이다.
import { HOOK_FRAMES, type FishingState } from './fishing'
import type { FieldActionFxKind } from '../../state/worldState'

/** `scene/flyTransition`의 `FlyPhase`와 같은 것. 넘길 때 타입이 맞물린다 */
export type HeroFlyPhase = 'off' | 'takeoff' | 'transit' | 'landing'

export interface HeroClipInput {
  /** 낚시 한 판 (`scene/fishingSystem`의 `fishing.state`). 안 낚는 중이면 `null` */
  fishing: FishingState | null
  /** 공중날기 */
  fly: HeroFlyPhase
  /** 필드 기술의 짧은 연출 (`worldState.player.fieldAction`) */
  action: { kind: FieldActionFxKind | null, elapsed: number, duration: number }
  /** 물뿌리개를 들고 있는가 (`scene/berryPatches`의 `wateringActive`) */
  watering: boolean
}

interface HeroClip {
  /** 돌릴 클립. `null`이면 절차형이 그 자리를 맡는다 */
  name: string | null
  /** 되풀이할 것인가. 아니면 한 번 돌고 마지막 자세에서 멈춘다 */
  loop: boolean
}

export interface HeroClipState extends HeroClip {
  /**
   * 상태가 이미 끝났는데 아직 돌 것이 남은 동작에 쓰는 시간.
   *
   * 물주기가 그 자리다 — 원작은 물뿌리개를 **놓는 동작**이 끝나기를 기다리는데
   * (`BerryPatches_EndWatering`), 우리 규칙 쪽은 그 순간 밭에서 손을 뗀다.
   * 규칙을 건드리지 않고 화면에서만 뒤를 이어 준다
   */
  tail: number
}

export const HERO_CLIP_NONE: HeroClipState = { name: null, loop: false, tail: 0 }

/**
 * 폭포오르기 한 번에 걸리는 시간.
 *
 * ⚠️ **원작 실측이다** (`ov5_021DFB54.c`). 목적지가 `현재 + 북쪽 2칸`으로
 * 못 박혀 있고(`MapObject_GetDxFromDir(DIR_NORTH) << 1`), 오르는 것이 두 단계다:
 *
 *   `SubTask_Waterfall_Ascend`        32프레임 — **y만** 오른다 (물벽을 탄다)
 *   `SubTask_Waterfall_FinishAscent`  64프레임 — y와 z가 함께 간다 (턱을 넘는다)
 *
 * 합쳐 96프레임이다.
 *
 * ⚠️ **규칙 쪽이 이 값을 쓴다** (`script/field`의 `runFieldMove`). 예전에는
 * 거기에 턱의 `HOP_TIME`(0.4초)이 들어가 있어서 **연출은 1.1초인데 몸은
 * 0.4초에 도착했다** — 꼭대기에 선 채로 0.7초를 더 기어오르는 그림이었다.
 * 한 자리에 두어야 다시 안 갈린다
 */
export const WATERFALL_SECONDS = 96 / 60

/**
 * 록클라임에 걸리는 시간. 오르는 칸 수를 탄다.
 *
 * ⚠️ **원작 실측이다** (`ov5_021DFB54.c`의 `sRockClimbTasks`). 벽에 붙는
 * `HopOn`과 벽에서 내리는 `LoopOrHopOff`가 `JUMP_NEAR_FAST`(한 칸 8프레임)고,
 * 그 사이를 `Move`가 `WALK_FAST`(한 칸 4프레임)로 **한 칸씩 되풀이한다** —
 * 다음 칸도 오를 수 있으면 `state = 5`로 돌아간다. 그래서 D칸이면
 * 8 + 4(D−2) + 8 = **8 + 4D** 프레임이다
 */
export function rockClimbSeconds(tiles: number): number {
  return (8 + 4 * Math.max(2, tiles)) / 60
}

/**
 * 폭포가 **물벽을 타는** 동안 (`waterfall_in_f`).
 *
 * ⚠️ **원작 실측이다** (`ov5_021DFB54.c`의 `SubTask_Waterfall_Ascend`) — 그
 * 32프레임 동안 원작은 **y만** 올린다. 앞으로 나가는 것은 그 뒤 64프레임
 * (`FinishAscent`)이라, 「물을 타고 오른다 → 턱을 넘는다」가 눈에 갈려 보인다.
 * 규칙 쪽도 같은 96프레임을 쓴다 — `script/field`가 위의 `WATERFALL_SECONDS`를
 * 그대로 가져다 쓴다
 */
export const CLIMB_IN_SECONDS = 32 / 60

/**
 * 폭포에서 몸이 턱을 넘는 마지막 대목 (`waterfall_end_f`).
 *
 * ⚠️ **우리가 정한 값이다.** 원작은 `FinishAscent` 한 덩어리라 나눌 자리가
 * 없는데 우리는 클립이 셋이다 — 끝 클립이 보이게 뒤를 이만큼 뗀다
 */
export const CLIMB_EDGE_SECONDS = 0.35

/** 물뿌리개를 드는 동작의 길이. 클립 `watering_f`의 실측 길이다 */
export const WATERING_START_SECONDS = 0.33

/** 물뿌리개를 놓는 동작의 길이. 클립 `watering_end_f`의 실측 길이다 */
export const WATERING_TAIL_SECONDS = 0.83

/** 「!」가 뜬 뒤 몸이 채는 동작의 길이. 클립 `fishing_hit_f`의 실측 길이다 */
const HIT_SECONDS = 0.33

/** 낚시 단계 → 클립. 일곱을 다 쓴다 */
function fishingClip(s: FishingState): HeroClip | null {
  switch (s.phase) {
    // ⚠️ 클립이 1.33초인데 던지는 동작은 34프레임(0.567초)이다. **규칙이 임자다** —
    // 그 표가 원작의 프레임 표라(`CAST_FRAMES`) 클립이 잘리는 쪽이 맞다
    case 'cast': return { name: 'fishing_start_f', loop: false }
    case 'wait': return { name: 'fishing_loop_f', loop: true }
    case 'bite': {
      // 창이 낚싯대마다 0.25~0.75초다. 채는 동작이 끝나고도 창이 남으면
      // 그동안 버티는 동작으로 넘어간다 — 대단한 낚싯대는 여기까지 안 온다
      const past = (HOOK_FRAMES[s.rod] - s.frames) / 60
      return past < HIT_SECONDS
        ? { name: 'fishing_hit_f', loop: false }
        : { name: 'fishing_hit_loop_f', loop: true }
    }
    // 감기는 문 판만 온다 — `tickFishing`이 `reel` 뒤에 늘 `caught`를 준다
    case 'reel': return { name: 'fishing_finish_success_f', loop: false }
    case 'message':
      return s.result === 'caught'
        ? { name: 'fishing_finish_success_loop_f', loop: true }
        : { name: 'fishing_finish_f', loop: false }
    default: return null
  }
}

/** 필드 기술 연출 → 클립 */
function actionClip(
  kind: FieldActionFxKind | null, elapsed: number, duration: number,
): HeroClip | null {
  if (kind === 'waterfall') {
    if (elapsed < CLIMB_IN_SECONDS) return { name: 'waterfall_in_f', loop: false }
    if (elapsed < duration - CLIMB_EDGE_SECONDS) return { name: 'waterfall_loop_f', loop: true }
    return { name: 'waterfall_end_f', loop: false }
  }
  // ⚠️ **오르내림이 같은 자료다.** `climb_up_f`와 `climb_down_f`가 원작에서
  // 키 140개까지 바이트로 같다 — 방향은 몸이 도는 것으로 갈린다
  if (kind === 'rockClimb') return { name: 'climb_up_f', loop: false }
  return null
}

/**
 * 이번 프레임에 돌릴 클립.
 *
 * 겹칠 일이 없는 상태들이라 차례가 곧 우선순위다 — 낚시 · 공중날기 · 필드
 * 기술 · 물주기. 아무것도 아니면 `null`이고 그때 절차형이 돈다.
 */
export function tickHeroClip(
  prev: HeroClipState, input: HeroClipInput, dt: number,
): HeroClipState {
  const fishing = input.fishing ? fishingClip(input.fishing) : null
  if (fishing) return { ...fishing, tail: 0 }

  if (input.fly === 'takeoff' || input.fly === 'transit') {
    return { name: 'fly_on_f', loop: false, tail: 0 }
  }
  if (input.fly === 'landing') return { name: 'fly_off_f', loop: false, tail: 0 }

  const action = actionClip(input.action.kind, input.action.elapsed, input.action.duration)
  if (action) return { ...action, tail: 0 }

  if (input.watering) {
    const held = prev.name === 'watering_f' || prev.name === 'watering_loop_f'
    if (!held) return { name: 'watering_f', loop: false, tail: WATERING_START_SECONDS }
    // 드는 동작이 끝나면 주는 동작으로 넘어가 되풀이한다
    if (prev.name === 'watering_f' && prev.tail > dt) {
      return { name: 'watering_f', loop: false, tail: prev.tail - dt }
    }
    return { name: 'watering_loop_f', loop: true, tail: 0 }
  }
  // 물뿌리개를 놓는 뒤끝. 규칙은 이미 끝났고 화면만 이어 준다
  if (prev.name === 'watering_f' || prev.name === 'watering_loop_f') {
    return { name: 'watering_end_f', loop: false, tail: WATERING_TAIL_SECONDS }
  }
  if (prev.name === 'watering_end_f' && prev.tail > dt) {
    return { name: 'watering_end_f', loop: false, tail: prev.tail - dt }
  }
  return HERO_CLIP_NONE
}
