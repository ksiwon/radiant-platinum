// 포락선 (DATA.md §2.18)
//
// **전부 롬에서 읽은 것이다.** 소리 드라이버는 디컴프에 없어서(Nitro SDK가 ARM7에
// 넣는 코드다) 표와 식을 ARM7 바이너리에서 직접 찾아 디스어셈블했다. 기억으로
// 적었던 초안은 두 군데가 틀렸다 — 어택이 `÷255 후 −1`이 아니라 `>>8`이고,
// `x<50`일 때 감쇠율이 `0x1E00/(2x+1)`이 아니라 그냥 `2x+1`이다.
//
// 자리:
//   `CalcDecayRate`  ARM7 0x2385204
//   어택률 변환      ARM7 0x2384c74
//   포락선 상태기계  ARM7 0x2384bf4
//   시작값 −92544    ARM7 0x2385258 (= −723 << 7)
//
// 표가 맞다는 증거가 하나 더 있다. 상태기계가 데시벨제곱표를 0x03806668로 잡고
// 어택률 변환이 어택표를 0x0380687c로 잡는데, **그 간격 0x214가 정적
// 바이너리에서 두 표 사이 간격과 똑같다**. 서로 다른 함수 둘이 같은 답을 준다.
import { ATTACK_RATE, DECIBEL_SQUARE, DECIBEL_FLOOR } from './tables'

export const ATTACK = 0
export const DECAY = 1
export const SUSTAIN = 2
export const RELEASE = 3

/** 감쇠값의 소수부 비트 수. 드라이버는 `env >> 7`로 0.1dB를 낸다 */
export const ENV_SHIFT = 7
/** 시작이자 바닥. `−723 << 7` */
export const ENV_FLOOR = DECIBEL_FLOOR << ENV_SHIFT

/** 어택 세기 → 매 프레임 곱할 비율 (ARM7 0x2384c74 그대로) */
export function attackRate(attack: number): number {
  return attack < 109 ? 255 - attack : ATTACK_RATE[127 - attack] ?? 0
}

/**
 * 감쇠·릴리스 세기 → 매 프레임 뺄 값 (ARM7 0x2385204 그대로).
 *
 * `x < 50`에서 `2x+1`인 것이 요점이다. 기억으로는 여기도 나눗셈인 줄 알았는데
 * 코드는 `MOVLT r0, r0, LSL #1` + `ADDLT r0, r0, #1`이다
 */
export function decayRate(x: number): number {
  if (x === 127) return 0xffff
  if (x === 126) return 0x3c00
  if (x < 50) return (x * 2 + 1) & 0xffff
  return Math.floor(0x1e00 / (126 - x)) & 0xffff
}

/** 서스테인 세기 → 머무를 감쇠값 */
export function sustainLevel(sustain: number): number {
  return (DECIBEL_SQUARE[sustain] ?? DECIBEL_FLOOR) << ENV_SHIFT
}

export interface Env {
  state: number
  /** 감쇠. 0이 최대 음량이고 `ENV_FLOOR`가 무음이다 */
  value: number
  attack: number
  decay: number
  sustain: number
  release: number
}

export function startEnv(attack: number, decay: number, sustain: number, release: number): Env {
  return {
    state: ATTACK,
    value: ENV_FLOOR,
    attack: attackRate(attack),
    decay: decayRate(decay),
    sustain: sustainLevel(sustain),
    release: decayRate(release),
  }
}

/**
 * 드라이버 한 프레임(1/192초)만큼 나아간다. ARM7 0x2384bf4의 분기 넷 그대로.
 *
 * 돌려주는 것은 0.1dB 단위 감쇠다 — 다른 손잡이(볼륨·세기·표현)의 데시벨과
 * **더해서** 쓴다. 곱이 아니라 합인 것은 원작이 전부 데시벨로 다루기 때문이다
 */
export function stepEnv(env: Env): number {
  switch (env.state) {
    case ATTACK:
      // env는 음수다. `-((-env * rate) >> 8)`이라 rate가 0이면 즉시 0이 된다
      // 마지막 `| 0`은 −0을 0으로 만든다. 안 하면 꼭대기에 닿았을 때 값이 −0이 된다
      env.value = -((-env.value * env.attack) >> 8) | 0
      if (env.value === 0) env.state = DECAY
      break
    case DECAY:
      env.value -= env.decay
      if (env.value <= env.sustain) { env.value = env.sustain; env.state = SUSTAIN }
      break
    case RELEASE:
      env.value -= env.release
      break
    default:
      break
  }
  return env.value >> ENV_SHIFT
}

/** 소리를 놓는다 */
export function releaseEnv(env: Env): void {
  env.state = RELEASE
}

/** 릴리스가 바닥에 닿았나 — 그러면 채널을 놓아 준다 */
export function envDone(env: Env): boolean {
  return env.state === RELEASE && env.value <= ENV_FLOOR
}

/**
 * 0.1dB 감쇠 → 진폭.
 *
 * 표가 `round(200·log10(진폭))`과 한 칸도 안 어긋나므로 역은 `10^(db/200)`이다.
 * 이것을 추출기가 매번 다시 확인한다(`tools/extract/sndTables.js`)
 */
export function gainOf(decibel: number): number {
  if (decibel <= DECIBEL_FLOOR) return 0
  return 10 ** (Math.min(0, decibel) / 200)
}

/** 볼륨 손잡이(0~127) → 0.1dB */
export function knobDecibel(v: number): number {
  return DECIBEL_SQUARE[Math.max(0, Math.min(127, v | 0))] ?? DECIBEL_FLOOR
}
