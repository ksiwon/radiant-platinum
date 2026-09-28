// 승강기 층수판 불빛 (`overlay006/elevator_animation.c` · PARITY §7.12)
//
// 소품 498(`elevator_lights`)은 **저절로 안 돈다** — 목차가 미룬 적재(flags & 1)로 세워 두고, 스크립트가
// `PlayElevatorAnimation dir, loopCount`로 부를 때만 한 번짜리 애니(`MapPropOneShotAnimationManager`)로 올린다:
//
//   LOAD                 클립 둘(35 오름 · 36 내림, BTA0 · 31프레임)을 `loopCount`번짜리로 싣는다
//   PLAY_WITH_SOUND      `PlayAnimation(tag, direction)` — **방향이 곧 클립 자리다** · `SEQ_SE_DP_ELEBETA2`
//   WAIT_FOR_ANIMATION   `IsAnimationLoopFinished` — 마지막 바퀴의 마지막 프레임에서 멎는다. 그때 소리를 끊고
//                        `SEQ_SE_DP_PINPON`을 울리고 애니를 **내린다** (그림이 제자리로 돌아간다)
//   WAIT_FOR_END_SOUND   「띵동」이 끝나야 문이 열린다
//
// 한 틱에 한 프레임이다 (`MapPropAnimation_AdvanceFrame` · `propAnim`의 `FRAME_MS`)
import { FRAME_MS, loadPropAnimSet, type PropAnimSet } from './propAnim'

/** `elevator_lights_nsbmd` */
export const ELEVATOR_LIGHTS_MODEL = 498

interface LightPlay {
  /** 클립 자리 — 0 오름 · 1 내림 (`ELEVATOR_DIR_UP` · `_DOWN`) */
  slot: number
  loops: number
  since: number
}

let play: LightPlay | null = null
let set: PropAnimSet | null = null

/** 클립 한 바퀴의 프레임. 표를 아직 못 받았으면 null */
function framesOf(slot: number): number | null {
  const id = set?.table.props[String(ELEVATOR_LIGHTS_MODEL)]?.[slot]
  return id === undefined ? null : set?.clip(id)?.frames ?? null
}

/** 튼다. 표는 여기서 받아 둔다 — 소품이 그려져 있으면 이미 받아 둔 표다 */
export function startElevatorLight(dir: number, loops: number): void {
  void loadPropAnimSet().then((s) => { set = s }).catch(() => { /* 불빛만 안 돈다 */ })
  play = { slot: dir === 1 ? 1 : 0, loops: Math.max(1, loops), since: performance.now() }
}

/**
 * 다 돌았는가 (`IsAnimationLoopFinished`). 표를 못 받았으면 **길이를 모르므로** null — 부르는 쪽이 소리로 잰다
 */
export function elevatorLightDone(): boolean | null {
  if (play === null) return true
  const frames = framesOf(play.slot)
  if (frames === null) return null
  return (performance.now() - play.since) / FRAME_MS >= frames * play.loops - 1
}

/** 끝났다 — 애니를 내린다 (`UnloadAnimation`) */
export function stopElevatorLight(): void {
  play = null
}

/**
 * 그리는 쪽이 묻는다 — 지금 이 클립 자리의 몇 프레임인가. 안 돌고 있으면 null(제자리 그림)
 */
export function elevatorLightFrame(slot: number, frames: number): number | null {
  if (play === null || play.slot !== slot) return null
  const since = (performance.now() - play.since) / FRAME_MS
  return Math.min(frames * play.loops - 1, since) % frames
}

/** 지금 도는 클립 자리. 안 돌면 null */
export function elevatorLightSlot(): number | null {
  return play?.slot ?? null
}
