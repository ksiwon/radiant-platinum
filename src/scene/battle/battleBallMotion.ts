import type { SlotId } from '../../engine/battle/events'
import { PAIR_DIR, pairOffset, SLOT, viewDepth } from '../../engine/battle/shots'
// ⚠️ **시간표는 엔진이 든다.** 박자를 만드는 쪽(`engine/battle/playback`)이 같은
// 값을 봐야 포획 결과 글이 볼 연출을 기다린다 — 예전에는 이 초가 여기에만 있어서
// 결과가 던지기와 같은 프레임에 떴다
import {
  CAPTURE_RELEASE_TIME,
  CAPTURE_SEAL_TIME,
  CAPTURE_SHAKE_START,
  CAPTURE_SHAKE_STEP,
  CAPTURE_THROW_TIME,
  captureDuration,
  captureResolveAt,
} from '../../engine/battle/captureTiming'

export type Point3 = readonly [number, number, number]

export {
  CAPTURE_SEAL_TIME,
  CAPTURE_SHAKE_START,
  CAPTURE_THROW_TIME,
  captureDuration,
  captureResolveAt,
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount
}

export function throwArc(
  from: Point3,
  to: Point3,
  progress: number,
  height = 2.2,
): [number, number, number] {
  const t = clamp01(progress)
  if (t === 0) return [...from]
  if (t === 1) return [...to]
  return [
    mix(from[0], to[0], t),
    mix(from[1], to[1], t) + Math.sin(t * Math.PI) * height,
    mix(from[2], to[2], t),
  ]
}

export function trainerThrowOrigin(slot: SlotId): Point3 {
  return slot.startsWith('p1') ? [-4.4, 1.65, 6.2] : [4.6, 1.65, -6.4]
}

/**
 * 그 자리의 트레이너가 서는 곳 (PARITY §2.2b · REPAIR §123). 한 쪽에 한 사람이면
 * `trainerThrowOrigin`과 같다.
 *
 * ⚠️ **원작에는 트레이너만의 더블 좌표가 없다.** 트레이너 그림은 **제 포켓몬의 자리 줄을
 * 그대로 쓴다** — `gEncounterCoords[side]`에서 나와 `gBattlerEncounterX[side][0]`로 미끄러지는데
 * (`battle_display.c` 525~538), `side`가 2vs2와 태그 배틀의 상대 쪽에서만 전투원 자리
 * (`battlerType`)고 그 밖에는 싱글 줄(`battlerType & 1`)이다. 그 표가 포켓몬 자리 표와
 * 같은 표다(`ov12_022380BC.c` 16·25 — 상대 216·176px · 우리 40·80px). 그래서 원작
 * 화면에서 트레이너는 늘 **제 포켓몬과 같은 화면 x**에 선다.
 *
 * 그대로 옮긴다: 트레이너를 제 발판과 **같은 화면 x**가 되도록 `PAIR_DIR`로 민다. 같은
 * 화면 x는 카메라 깊이에 비례하므로, 발판의 벌어짐(`shots.pairOffset`)에 **트레이너 깊이 ÷
 * 발판 깊이**를 곱한다(`shots.viewDepth`). 누가 짝을 서는지는 원작의 `side` 갈래와 같다 —
 * 부르는 쪽(`BattleTrainers`)이 편이 있을 때만 우리 쪽을, 상대가 둘일 때만 상대 쪽을
 * `paired`로 준다
 */
export function trainerStandAt(slot: SlotId, paired: boolean): Point3 {
  const base = trainerThrowOrigin(slot)
  if (!paired) return base
  const side = slot.startsWith('p1') ? 'p1' : 'p2'
  const pad: Point3 = [SLOT[side].x, 0, SLOT[side].z]
  const off = pairOffset(slot as `${'p1' | 'p2'}${'a' | 'b'}`) * (viewDepth(base) / viewDepth(pad))
  return [base[0] + PAIR_DIR[0] * off, base[1], base[2] + PAIR_DIR[2] * off]
}

export function ballShakeAngle(elapsed: number, shakes: number): number {
  const local = elapsed - CAPTURE_SHAKE_START
  if (local < 0 || shakes <= 0) return 0
  const cycle = Math.floor(local / CAPTURE_SHAKE_STEP)
  if (cycle >= shakes) return 0
  const phase = (local - cycle * CAPTURE_SHAKE_STEP) / CAPTURE_SHAKE_STEP
  return Math.sin(phase * Math.PI * 2) * Math.sin(phase * Math.PI) * 0.42
}

export function captureBodyScale(elapsed: number, shakes: number, caught: boolean): number {
  if (elapsed <= CAPTURE_THROW_TIME) return 1
  if (elapsed < CAPTURE_SEAL_TIME) {
    return 1 - clamp01((elapsed - CAPTURE_THROW_TIME) / (CAPTURE_SEAL_TIME - CAPTURE_THROW_TIME))
  }
  const resolve = captureResolveAt(shakes)
  if (elapsed < resolve || caught) return 0
  return clamp01((elapsed - resolve) / CAPTURE_RELEASE_TIME)
}

interface BallPalette {
  top: string
  bottom: string
  accent: string
}

const BALL_TOP = [
  '#ec4b59',
  '#7d4db4',
  '#e1bd39',
  '#3375bf',
  '#ec4b59',
  '#5d9569',
  '#3486ba',
  '#6ca843',
  '#d45a3c',
  '#d6d8dc',
  '#202327',
  '#313840',
  '#f0eee9',
  '#254736',
  '#efa9c8',
  '#6aa8dc',
  '#d94845',
]

const BALL_ACCENT = [
  '#f5f1de',
  '#e78af3',
  '#22252a',
  '#df4a51',
  '#ffffff',
  '#d8e9c2',
  '#e7d955',
  '#efdc69',
  '#f4ca50',
  '#c3523b',
  '#d7b64b',
  '#ddba4d',
  '#dc3234',
  '#77bd66',
  '#f5d7e6',
  '#f0cd45',
  '#dce8f0',
]

export function ballPalette(ball: number): BallPalette {
  const id = Number.isInteger(ball) && ball >= 1 && ball <= 16 ? ball : 4
  return {
    top: BALL_TOP[id]!,
    bottom: id === 13 ? '#16191a' : '#f0f0eb',
    accent: BALL_ACCENT[id]!,
  }
}
