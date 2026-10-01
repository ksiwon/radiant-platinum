import type { SlotId } from '../../engine/battle/events'
import { CAMERA, PAIR_DIR, pairOffset, SLOT } from '../../engine/battle/shots'
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

/** 볼이 손을 떠나는 높이(m) */
const HAND = 1.65

/**
 * 트레이너가 **물러난 뒤에** 볼이 날아오는 자리 — 화면 밖이다.
 *
 * 원작은 첫 볼을 던진 트레이너를 화면 밖으로 미끄러뜨려 지운다 (`trainerStandAt`). 그 뒤의
 * 교체와 포획 볼은 사람 없이 화면 가장자리에서 들어온다 — 이 자리가 그 출발점이다.
 * 고정 카메라(`shots.CAMERA`)에서 우리 쪽은 왼쪽 앞, 상대 쪽은 오른쪽 뒤의 바깥이다
 */
export function trainerThrowOrigin(slot: SlotId): Point3 {
  return slot.startsWith('p1') ? [-4.4, HAND, 6.2] : [4.6, HAND, -6.4]
}

/**
 * 트레이너가 서는 깊이(z, m).
 *
 * 상대는 **BDSP 값 그대로**다 (`BattleDefaultPlacementData`의 트레이너 −5.8 — 발판 −2.2의
 * 3.6m 뒤). 우리 쪽 +5.8은 BDSP가 제 등장 카메라로 비추는 자리라 우리 고정 카메라(z 5.0)의
 * **뒤**다 — 그래서 우리 값을 따로 둔다: 발판(2.2)보다 무대 안쪽 0.8.
 *
 * ⚠️ **0.8은 잰 값이다.** 사람 키(1.65m)가 화면 위로 안 잘리는 데까지 물렸다. 카메라가 제일
 * 다가서는 실내 무대(`arena.cameraFit` — 반지름 6에서 0.88)에서 머리가 NDC y 0.95다 — 발판
 * 자리 그대로 세우면 1.09로 머리가 잘렸다. 더 물리면 상대 발판(−2.2)과 겹치기 시작한다
 */
const TRAINER_Z: Readonly<Record<'p1' | 'p2', number>> = { p1: 0.8, p2: -5.8 }

/**
 * 그 자리의 트레이너가 등장 장면에 서는 곳 (PARITY §2.2b · REPAIR §123) — **화면 안이다.**
 *
 * ⚠️ **원작 트레이너는 제 포켓몬과 같은 화면 x에 선다.** 그림이 `gEncounterCoords[side]`에서
 * 나와 `gBattlerEncounterX[side][0]`로 미끄러지는데 (`battle_display.c` 525~539 ·
 * `Task_SetTrainerEncounter`), 그 표가 포켓몬 자리 표와 같은 표다 (`ov12_022380BC.c` 16·25 —
 * 싱글 상대 192px · 우리 64px). `side`는 2vs2와 태그 배틀의 상대 쪽에서만 전투원 자리
 * (`battlerType`)고 그 밖에는 싱글 줄(`battlerType & 1`)이다 — 누가 짝을 서는지는 부르는
 * 쪽(`BattleTrainers`)이 편이 있을 때만 우리 쪽을, 상대가 둘일 때만 상대 쪽을 `paired`로 준다.
 *
 * 그대로 옮긴다: 카메라에서 **제 발판으로 가는 땅 위의 반직선**이 `TRAINER_Z`와 만나는 점이다.
 * 같은 반직선 위의 점은 화면 x가 같다. 짝이면 그 자리의 발판(`shots.pairOffset`)으로 간다.
 *
 * ⚠️ 예전에는 이 자리가 `trainerThrowOrigin`(볼 출발점)이었고 그것이 고정 카메라 시야 밖이라
 * 트레이너전에 상대도 주인공도 한 번도 화면에 안 섰다 (상대 NDC x 1.79 · 우리 −6.2).
 * 원작은 등장 장면에 둘 다 서고, 첫 볼을 던지면 화면 밖으로 미끄러져 나간다 (`trainerSlide`)
 */
export function trainerStandAt(slot: SlotId, paired: boolean): Point3 {
  const side = slot.startsWith('p1') ? 'p1' : 'p2'
  const off = paired ? pairOffset(slot as `${'p1' | 'p2'}${'a' | 'b'}`) : 0
  const padX = SLOT[side].x + PAIR_DIR[0] * off
  const padZ = SLOT[side].z + PAIR_DIR[2] * off
  const [cx, , cz] = CAMERA.position
  const z = TRAINER_Z[side]
  const t = (z - cz) / (padZ - cz)
  return [cx + (padX - cx) * t, HAND, z]
}

/**
 * 그 자리의 볼을 **누가** 던지는가 — 던지는 트레이너의 자리.
 *
 * 한 쪽에 트레이너가 한 사람이면 둘째 마리도 `a`가 던지고 (`BtlCmd_ThrowPokeball`이 더블을
 * 한 번에 부른다), 둘이면 제 자리의 주인이 던진다 (PARITY §2.2b)
 */
export function throwerOf(slot: SlotId, paired: boolean): SlotId {
  if (paired) return slot
  return slot.startsWith('p1') ? 'p1a' : 'p2a'
}

/**
 * 원작 화면의 반폭(px). 256px 화면의 가운데가 128이다
 */
const DS_HALF = 128

/**
 * 트레이너 그림이 미끄러지는 빠르기 (NDC/초).
 *
 * 원작은 **프레임마다 5px**이다 — 던지며 나갈 때(`Task_ThrowTrainerBall` 1·2), 물러날 때
 * (`Task_SlideTrainerOut`), 다시 들어올 때(`Task_SlideTrainerIn`) 다 같다. 60프레임
 */
export const TRAINER_SLIDE_SPEED = (5 / DS_HALF) * 60

/**
 * 다 물러난 자리 (NDC). 상대는 오른쪽 `256 + 40`, 우리는 왼쪽 `−40`px에서 그림을 지운다 —
 * 그림 가운데가 화면 밖 40px, 반폭 40px이 다 나간 자리다. 쪽마다 부호만 다르다
 */
export const TRAINER_GONE_AT = (256 + 40 - DS_HALF) / DS_HALF

/**
 * 트레이너가 `from`에서 `to`로 미끄러지는 중의 화면 x (NDC). `TRAINER_SLIDE_SPEED`로 곧게
 * 가고 닿으면 선다. 물러날 때는 선 자리 → `±TRAINER_GONE_AT`, 돌아올 때는 그 거꾸로다.
 *
 * ⚠️ **NDC로 잰다.** 원작이 화면 픽셀로 미는 것이라, 무대 미터로 옮기면 카메라가 다가선
 * 실내 무대에서 같은 걸음이 화면을 더 빨리 건넌다 — 부르는 쪽이 지금 카메라로 미터로 바꾼다
 */
export function trainerSlide(from: number, to: number, elapsed: number): { at: number; done: boolean } {
  const span = Math.abs(to - from)
  const went = Math.max(0, elapsed) * TRAINER_SLIDE_SPEED
  if (went >= span) return { at: to, done: true }
  return { at: from + Math.sign(to - from) * went, done: false }
}

/**
 * 자리의 마리가 바뀔 때 **앞 몸을 볼로 거두는가** (`RecallPokemon`).
 *
 * 서 있던 **다른 마리**로 바뀔 때만이다. ⚠️ **열쇠(`key`)로 가른다 — 종으로 가르지 않는다.**
 * 변신(`transform`)과 폼 변화는 같은 마리라 열쇠가 그대로고 종만 바뀐다 (`engine/battle/view`)
 * — 종을 보면 변신에 거두는 빔이 쏜다. 쓰러진 뒤의 교체는 몸이 이미 졌으므로 거두지 않는다 —
 * 원작도 쓰러진 마리는 거두지 않는다. 무대의 몸(`BattleStage`)과 빔(`BattleBallEffects`)이
 * 이 한 함수를 본다
 */
export function recallsBody(before: { key: string | null; alive: boolean }, next: string | null): boolean {
  return before.key !== null && before.alive && before.key !== next
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
