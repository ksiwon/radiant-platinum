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

// ⚠️ **던지기 뒤의 박자는 BDSP 볼 클립이다** (`ob0204_00`의 애니메이션 · 시퀀스 `ee101`~`ee104`).
// 볼 프리팹을 클립째 꺼내(`tools/extract/bdspGlb.py … ob0204_00`) `Waist`의 자리 · 회전 곡선을 읽었다:
//
//   ee101_ball_anim  볼이 열려(시퀀스 f28) 빨아들이고 f46에 닫힌다 — 0.6초.
//                    클립 1.483초에 볼이 쉬는 높이보다 0.50m 위에서 떨어져 1.733초에 땅에 닿고,
//                    0.105m · 0.039m로 두 번 튀어 2.25초에 멎는다
//   ee102~104        흔들림 한 번이 클립 하나다(1.15 · 1.283 · 1.583초) — 앞 0.8초는 가만히 있고
//                    끝 0.35초 남짓에 좌우로 두 번 기운다(최대 약 0.25rad)
//
// 던지는 길(0.52초)만 우리 값이다 — BDSP는 트레이너가 던지는 몸짓까지 28프레임인데 배틀에 사람이 안 선다.

/** 던진 볼이 상대 앞에 닿아 열리는 시각(초) */
export const CAPTURE_THROW_TIME = 0.52
/** 상대가 볼 안으로 다 들어가 볼이 닫히는 시각 — 열린 뒤 18프레임(30fps) */
export const CAPTURE_SEAL_TIME = CAPTURE_THROW_TIME + 18 / 30
/** 떠 있던 볼이 떨어지기 시작하는 시각 — `ee101_ball_anim` 1.483초 */
export const CAPTURE_DROP_TIME = CAPTURE_THROW_TIME + 1.483
/** 두 번 튀고 땅에 멎는 시각 — 같은 클립 2.25초. 첫 흔들림이 여기서 시작한다 */
export const CAPTURE_SHAKE_START = CAPTURE_THROW_TIME + 2.25
/** 흔들림 한 번의 길이 — `ee102_ball_anim` 1.15초 */
export const CAPTURE_SHAKE_STEP = 1.15
/** 튀어나온 상대가 제 크기로 돌아오는 데 걸리는 시간 — `ee106` `PokemonScale` 4~15프레임 */
export const CAPTURE_RELEASE_TIME = 11 / 30

/**
 * **결과가 확정되는 시각(초).** 흔들림이 다 끝나는 자리다.
 *
 * 결과 글은 이 시각 **뒤에만** 뜬다 — 그 전에 띄우면 흔들리는 볼을 보면서
 * 이미 답을 아는 꼴이 된다
 */
export function captureResolveAt(shakes: number): number {
  return CAPTURE_SHAKE_START + Math.max(0, shakes) * CAPTURE_SHAKE_STEP
}

/**
 * 연출 한 벌이 완전히 끝나는 시각(초).
 *
 * 잡히면 성공 반짝임(`ee105_01_sucsess` f32~68)이 다 뜰 때까지다. 놓치면 튀어나온 몸이 제 크기로
 * 서는 데(`ee106` f4~15)에 빛이 사그라질 틈을 조금 더 둔 36프레임 — `ee106_01_error`는 f64까지
 * 뿜지만 그동안 배틀을 세워 둘 까닭이 없다(우리 값)
 */
export function captureDuration(shakes: number, caught: boolean): number {
  return captureResolveAt(shakes) + (caught ? 68 / 30 : 36 / 30)
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
