// 포획 연출 시간표 — 박자와 무대가 **같은 값**을 본다.
//
// 왜 엔진에 있나. 예전에는 이 초가 씬(`scene/battle/battleBallMotion`)에만
// 있었고, 박자를 만드는 쪽(`playback`)은 볼 연출을 아예 몰랐다. 그래서
// `ball` 사건이 `show([e], 0)`으로 떨어지고 포획 결과 글이 **같은 프레임에**
// 이어 붙었다 — 던지고·봉하고·흔드는 동안 「잡았다!」가 이미 떠 있었다.
//
// 값 자체는 무대의 연출 길이다. 엔진이 씬 함수를 부르지 않도록 여기로 옮기고
// 씬이 여기서 읽어 간다 — 의존 방향이 엔진 → 씬이 되면 지연 로딩 경계가 깨진다.
import { FRAME_SECONDS } from './presentationClock'

/** 던진 볼이 상대에 닿는 시각(초) */
export const CAPTURE_THROW_TIME = 0.52
/** 상대가 볼 안으로 다 들어가는 시각 */
export const CAPTURE_SEAL_TIME = 0.74
/** 땅에 놓인 볼이 첫 번째로 흔들리기 시작하는 시각 */
export const CAPTURE_SHAKE_START = 0.92
/** 흔들림 한 번의 길이 */
export const CAPTURE_SHAKE_STEP = 0.46
/** 튀어나온 상대가 제 크기로 돌아오는 데 걸리는 시간 */
export const CAPTURE_RELEASE_TIME = 0.28

/**
 * **결과가 확정되는 시각(초).** 흔들림이 다 끝나는 자리다.
 *
 * 결과 글은 이 시각 **뒤에만** 뜬다 — 그 전에 띄우면 흔들리는 볼을 보면서
 * 이미 답을 아는 꼴이 된다
 */
export function captureResolveAt(shakes: number): number {
  return CAPTURE_SHAKE_START + Math.max(0, shakes) * CAPTURE_SHAKE_STEP
}

/** 연출 한 벌이 완전히 끝나는 시각(초). 잡히면 반짝임이 조금 더 길다 */
export function captureDuration(shakes: number, caught: boolean): number {
  return captureResolveAt(shakes) + (caught ? 0.72 : 0.62)
}

/**
 * 박자가 쉬는 프레임 수.
 *
 * ⚠️ **글자 수로 재지 않는다.** 결과 문구가 길든 짧든 볼이 흔들리는 시간은
 * 같다 — 기다리는 것은 글이 아니라 **연출**이다
 */
export function captureFrames(shakes: number): number {
  return Math.ceil(captureResolveAt(shakes) / FRAME_SECONDS)
}

/**
 * 결과 글을 찍은 **뒤에** 연출이 사그라지기를 기다리는 프레임 수.
 *
 * 잡혔으면 배틀이 여기서 끝난다. 이 시간을 안 두면 마지막 반짝임이 뜨기 전에
 * 무대가 통째로 내려간다
 */
export function captureTailFrames(shakes: number, caught: boolean): number {
  return Math.ceil((captureDuration(shakes, caught) - captureResolveAt(shakes)) / FRAME_SECONDS)
}
