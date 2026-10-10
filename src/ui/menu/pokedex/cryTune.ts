// 울음소리 쪽의 볼 판 셈 (`crysub.c`).
//
// 원작은 터치 화면의 몬스터볼을 끌어서 조절한다. 가로가 **스위치**가 고른 것 하나다:
//   코러스 — 볼의 가로 자리가 코러스 목소리의 음량 0~127 (`UpdateEchoVolume`)
//   팬     — 볼의 가로 자리가 좌우 −127~127 (`UpdatePan`)
// 세로는 두 자리뿐이다: 볼이 위쪽이면 높낮이 보통(0), 아래쪽이면 **두 옥타브 아래**(−1536 = −(64 × 12) × 2)다.
// 손을 떼면 값이 처음(`InitCrySoundValues`)으로 돌아간다 — 키보드에서는 볼 판을 나갈 때(Shift) 되돌린다.
import type { CryTune } from '../../../engine/audio/music'

export type CryMode = 'chorus' | 'pan'

/** 아래쪽 높낮이 (1/64반음) */
export const PITCH_LOW = -(64 * 12) * 2

/** 키 한 번의 가로 걸음 — 한 판을 여덟 걸음 안팎에 건넌다 */
const STEP = { chorus: 16, pan: 32 } as const

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/** 화살표 키. `dx`는 가로, `dy`는 세로(−1 위 · +1 아래) */
export function nudgeTune(t: CryTune, mode: CryMode, dx: number, dy: number): CryTune {
  const next = { ...t }
  if (dx !== 0) {
    if (mode === 'chorus') next.echo = clamp(t.echo + dx * STEP.chorus, 0, 127)
    else next.pan = clamp(t.pan + dx * STEP.pan, -127, 127)
  }
  if (dy < 0) next.pitch = 0
  if (dy > 0) next.pitch = PITCH_LOW
  return next
}

/** 볼 판의 한 점(0~1 · 왼쪽 위가 원점)을 조절값으로 */
export function pointTune(t: CryTune, mode: CryMode, x: number, y: number): CryTune {
  const cx = clamp(x, 0, 1)
  const next = { ...t, pitch: y >= 0.5 ? PITCH_LOW : 0 }
  if (mode === 'chorus') next.echo = Math.round(cx * 127)
  else next.pan = Math.round((cx * 2 - 1) * 127)
  return next
}

/** 조절값 → 볼의 자리 (0~1) */
export function markerOf(t: CryTune, mode: CryMode): { x: number, y: number } {
  return {
    x: mode === 'chorus' ? t.echo / 127 : (t.pan + 127) / 254,
    y: t.pitch < 0 ? 1 : 0,
  }
}

/**
 * 반복 (`LoopCry`): 소리가 끝나고 이만큼(60분의 1초 열 칸 = `CRY_COOLDOWN`) 지나면 다시 운다.
 * 시험이 이 값을 본다
 */
export const LOOP_COOLDOWN_MS = Math.round((10 / 60) * 1000)

/** Z (재생 단추)가 할 일 — `AdvancePlayButton`: 반복이 꺼져 있으면 늘 새로 울고, 켜져 있으면 울리는 중일 때 끊는다 */
export function playAction(loop: boolean, playing: boolean): 'play' | 'stop' {
  if (!loop) return 'play'
  return playing ? 'stop' : 'play'
}
