// 볼 연출 시간표 — 박자와 무대가 **같은 값**을 본다.
//
// 왜 엔진에 있나. 박자를 만드는 쪽(`playback`)은 동기로 길이를 알아야 한다 — 포획 결과 글이 볼 연출을 기다리고,
// 기절 · 내보내기 글이 몸이 다 진 · 선 뒤에 뜬다. 그런데 연출 자체는 BDSP 시퀀스(`data/fx/seq/*.json`)를
// 받아서 트는 것이라(`fx/ballPlans`) 박자를 짤 때 그 자료가 아직 없을 수 있다.
//
// 그래서 **시퀀스에서 잰 프레임을 상수로 든다.** 값마다 어느 시퀀스의 무엇인지 적고, `captureTiming.data.test`가
// 구운 시퀀스를 같은 규칙(`fx/ballPlans` · `seqLength`)으로 다시 펴서 이 상수와 맞대 본다 — 자료나 규칙이 바뀌면 시험이 붉어진다.
// 프레임은 시퀀스의 30fps다.
import { FRAME_SECONDS } from './presentationClock'

const SEQ = 30

/**
 * 포획 시퀀스의 길이(30fps 프레임, `seqLength`):
 *
 *   ee101  72    던지기(트레이너 몸짓 f0~8을 잘라 낸 뒤) · 열려 빨아들이고 닫힘 · 떨어져 두 번 튀어 멎음
 *   ee102  20    첫 흔들림 — `ee102_ball_anim`을 0.5초부터
 *   ee103  42.6  둘째 — f20에 `ee103_ball_anim`을 0.53초부터 틀고 그 클립(1.283초)이 끝날 때까지
 *   ee104  47.5  셋째 — `ee104_ball_anim`(1.583초)이 끝날 때까지
 *
 * ⚠️ **흔들림 한 번의 길이가 셋 다 다르다.** 시퀀스 길이는 롬에 없어서 「마지막 명령 · 그 전에 튼 볼 클립의 끝 중
 * 늦은 쪽」으로 잰다(`seqLength` 머리말)
 */
const THROW = 72
const WOBBLES = [20, 42.599, 47.499] as const

/** 성공(`ee105`) — 별이 f32~68에 뜨고 글(`MessageDispStd`)이 f87에 뜬다 */
const SUCCESS_MESSAGE = 87
/** 튀어나옴 — 흔들림 0 · 1 · 2 · 3번 뒤 `ee106` · `ee107` · `ee108` · `ee109`의 글 프레임과 길이 */
const BREAK_MESSAGE = [26, 24, 24, 26] as const
const BREAK_FRAMES = [74, 72, 70, 74] as const

/** 보이는 흔들림 수 — 잡히면 셋(`shakes` 4), 놓치면 `shakes`(0~3) */
function wobbles(shakes: number, caught: boolean): number {
  return caught ? 3 : Math.max(0, Math.min(3, shakes))
}

/** 흔들림이 다 끝나 결과 시퀀스가 서는 프레임 */
function resultFrame(shakes: number, caught: boolean): number {
  let f = THROW
  for (let i = 0; i < wobbles(shakes, caught); i++) f += WOBBLES[i]!
  return f
}

/**
 * **결과 글이 뜨는 시각(초).** 결과 시퀀스가 글을 띄우는 프레임이다(`ee105` f87 · `ee106` f26 …).
 *
 * 그 전에 띄우면 흔들리는 볼을 보면서 이미 답을 아는 꼴이 된다
 *
 * @param caught 안 주면 `shakes`가 4(잡힘)인지로 본다 (`events`의 `ball`)
 */
export function captureResolveAt(shakes: number, caught = shakes >= 4): number {
  const w = wobbles(shakes, caught)
  return (resultFrame(shakes, caught) + (caught ? SUCCESS_MESSAGE : BREAK_MESSAGE[w]!)) / SEQ
}

/**
 * 연출 한 벌이 다 서는 시각(초).
 *
 * 놓치면 튀어나온 몸이 서고 카메라가 돌아가는 데까지(`ee106~109`의 끝). 잡히면 글이 뜨는 그 자리다 —
 * `ee105`는 글 뒤로 팡파르를 기다리는 것뿐이라(f87~181) 그동안 배틀을 세워 둘 까닭이 없다(볼은 무대가 내려갈 때까지 땅에 남는다)
 */
export function captureDuration(shakes: number, caught: boolean): number {
  if (caught) return captureResolveAt(shakes, true)
  return (resultFrame(shakes, false) + BREAK_FRAMES[wobbles(shakes, false)]!) / SEQ
}

/** 박자가 쉬는 프레임 수 (60fps). ⚠️ 글자 수로 재지 않는다 — 기다리는 것은 글이 아니라 **연출**이다 */
export function captureFrames(shakes: number, caught = shakes >= 4): number {
  return Math.ceil(captureResolveAt(shakes, caught) / FRAME_SECONDS)
}

/** 결과 글을 찍은 **뒤에** 연출이 다 서기를 기다리는 프레임 수 (60fps) */
export function captureTailFrames(shakes: number, caught: boolean): number {
  return Math.max(0, Math.ceil((captureDuration(shakes, caught) - captureResolveAt(shakes, caught)) / FRAME_SECONDS))
}

/**
 * 내보내기(`ee400` · `ee406`, 손을 떠나기 `THROW_FRAMES` 앞부터) — 몸이 나타나는 프레임(`PokemonIntroMotion`).
 * 두 시퀀스가 같은 27이다
 */
export const SEND_OUT_INTRO = 27
/** 나타난 몸이 땅에 닿기까지 (`fx/sequence`의 `INTRO_FALL` — 몸을 따라 내려가는 카메라 f45~85) */
const SEND_OUT_FALL = 40
/**
 * 착지 동작(`ba01_landC`)을 기다리는 프레임 — **우리 값.** 클립 길이가 종마다 다르고(피카츄 0.667초) 박자는 종을
 * 모르므로 그 한 값을 둔다. 떠 있는 종(착지 클립이 없다)은 그만큼 일찍 서 있을 뿐이다
 */
const SEND_OUT_LAND = 20

/** 내보낸 몸이 **나타나는** 시각(초) — 시퀀스 시작부터 */
export function sendOutAppearAt(): number {
  return SEND_OUT_INTRO / SEQ
}

/** 내보낸 몸이 땅에 서서 착지를 마치는 시각(초) */
export function sendOutSettledAt(): number {
  return (SEND_OUT_INTRO + SEND_OUT_FALL + SEND_OUT_LAND) / SEQ
}

/**
 * 거두기(`ee610`) — 앞 몸이 볼 빛에 줄어 사라지는 프레임(`PokemonVisible visible=0` f24). 다음 마리의 볼이 그 뒤에 온다
 */
export const RECALL_VANISH = 24

/** 거두기가 끝나 다음 볼이 날아오기 시작하는 시각(초) */
export function recallSeconds(): number {
  return RECALL_VANISH / SEQ
}

/**
 * 기절 — 몸이 사라지는 프레임과 카메라가 다 서는 프레임. 트레이너의 포켓몬 `ee620`(볼로 돌아간다: f40 · 카메라 f56) ·
 * 야생 `ee621`(f43 · 카메라 f44)
 */
const FAINT = { trainer: { vanish: 40, camera: 56 }, wild: { vanish: 43, camera: 44 } } as const

/** 기절 연출을 기다리는 시각(초) — 몸이 사라지고 카메라가 다 선 뒤에 「쓰러졌다!」가 뜬다 */
export function faintSeconds(wild: boolean): number {
  const f = wild ? FAINT.wild : FAINT.trainer
  return Math.max(f.vanish, f.camera) / SEQ
}

/** 몸이 사라지는 시각(초) */
export function faintVanishAt(wild: boolean): number {
  return (wild ? FAINT.wild : FAINT.trainer).vanish / SEQ
}

/** 시험이 시퀀스와 맞대 보는 값 */
export const CAPTURE_SEQ_FRAMES = { THROW, WOBBLES, SUCCESS_MESSAGE, BREAK_MESSAGE, BREAK_FRAMES, FAINT, RECALL_VANISH, SEND_OUT_INTRO } as const
