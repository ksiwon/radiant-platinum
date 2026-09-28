// 페라페가 배운 말 (`chatot_cry.c` · `sound_chatot.c` · PARITY §1.8)
//
// 수다를 아는 페라페를 파티 화면에서 고르면 **1초를 녹음해** 세이브에 둔다(`SAVE_TABLE_ENTRY_CHATOT`).
// 그 뒤로 페라페의 울음소리는 거의 어디서나 그 녹음이다 — 필드 · 도감 · 요약 · 내 배틀. 원작 값:
//
//   · 2kHz 8비트로 받아 **1kHz 4비트 두 칸을 한 바이트**에 담는다 — 1000바이트 = 2000샘플 = 1초
//     (`ChatotCry_StoreAudio` · `ChatotCry_GetUpsampledAudio`: 낮은 니블이 먼저 · 샘플 ÷ 16 + 8)
//   · 틀 때마다 빠르기를 1.0~1.25배로 굴린다 (`WAVE_OUT_SPEED(1.0) + LCRNG % 8192`, 32768이 1배)
//   · 배틀의 수다가 혼란을 거는 확률이 **녹음의 16번째 바이트**로 정해진다
//     (`Sound_GetChatterActivationParameter` → `BtlCmd_CheckChatterActivation`)
//
// ⚠️ **마이크가 없어도 배운다** — 브라우저가 마이크를 못 주면(권한을 거절했거나 장치가 없거나)
// 게임 소리 자체를 1초 받아 그것을 배운다(`audio/chatotRecord`). 원작의 마이크도 DS 스피커에서
// 나는 곡을 같이 들었다 — 녹음 전에 곡을 끄지 않고 42로 줄이기만 한다(`FadeOutBGM 42, 10`)

/** 담긴 바이트 수 (`CHATOT_CRY_SIZE`) */
export const CHATOT_CRY_SIZE = 1000
/** 샘플 수 — 한 바이트에 둘 */
export const CHATOT_CRY_SAMPLES = CHATOT_CRY_SIZE * 2
/** 트는 빠르기의 기준 (`CHATOT_CRY_SAMPLING_RATE`) */
export const CHATOT_CRY_RATE = 2000
/** `SPECIES_CHATOT` */
export const SPECIES_CHATOT = 441
/** `MOVE_CHATTER` (`generated/moves.txt` 449줄) */
export const MOVE_CHATTER = 448

/**
 * 2kHz 8비트 → 담는 꼴 (`ChatotCry_StoreAudio`).
 *
 * ⚠️ **C의 나눗셈이다** — `-1 / 16`은 0이다(0 쪽으로 자른다). `Math.floor`로 쓰면 음수 샘플이 한 칸씩
 * 내려가 조용한 자리가 −1로 떨어진다
 */
export function storeChatotCry(samples: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(CHATOT_CRY_SIZE)
  for (let i = 0; i < CHATOT_CRY_SIZE; i++) {
    const lo = Math.trunc(s8(samples[i * 2] ?? 0) / 16) + 8
    const hi = Math.trunc(s8(samples[i * 2 + 1] ?? 0) / 16) + 8
    out[i] = (lo & 0xf) | ((hi & 0xf) << 4)
  }
  return out
}

/** 담은 꼴 → 2kHz 8비트 (`ChatotCry_GetUpsampledAudio`) */
export function upsampleChatotCry(raw: Uint8Array): Int8Array {
  const out = new Int8Array(CHATOT_CRY_SAMPLES)
  for (let i = 0; i < CHATOT_CRY_SIZE; i++) {
    const b = raw[i] ?? 0x88
    out[i * 2] = ((b & 0xf) - 8) * 16
    out[i * 2 + 1] = ((b >> 4) - 8) * 16
  }
  return out
}

/** 부호 있는 8비트로 가둔다 */
function s8(v: number): number {
  return Math.max(-128, Math.min(127, Math.round(v)))
}

/**
 * 수다가 혼란을 거는 갈래 (`Sound_GetChatterActivationParameter`).
 *
 * 녹음이 없으면 0 · 16번째 바이트(부호 있는 8비트)가 −30 밑이면 1 · 30 이상이면 2 · 그 사이면 0이다
 */
export function chatterActivation(raw: Uint8Array | null): 0 | 1 | 2 {
  if (raw === null) return 0
  const b = raw[15] ?? 0
  const v = b >= 128 ? b - 256 : b
  if (v < -30) return 1
  if (v >= 30) return 2
  return 0
}

/**
 * 수다가 혼란을 거는 **실제 확률(%)** (`BtlCmd_CheckChatterActivation`).
 *
 * 갈래가 0 · 10 · 30을 주는데, 원작이 `rand % 100 > chance`일 때 **건너뛰므로** 같을 때도 건다 —
 * 그래서 하나씩 더 크다: **1 · 11 · 31**. 녹음이 없는 페라페도 1%로 건다
 */
export function chatterChance(activation: 0 | 1 | 2): number {
  return [0, 10, 30][activation]! + 1
}

/**
 * 틀 때의 빠르기 (`Sound_Impl_PlayChatotCry`) — `WAVE_OUT_SPEED(1.0) + LCRNG_Next() % 8192`.
 *
 * @param roll 0 이상 1 미만의 난수
 */
export function chatotCrySpeed(roll: number): number {
  return (32768 + Math.floor(roll * 8192)) / 32768
}

/** 세이브에 둘 글자 (base64). 브라우저와 노드 둘 다에서 돈다 */
export function encodeChatotCry(raw: Uint8Array): string {
  let bin = ''
  for (const b of raw) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** 세이브의 글자 → 담은 꼴. 길이가 안 맞으면 null이다(배운 말이 없는 것으로 친다) */
export function decodeChatotCry(text: string | null): Uint8Array | null {
  if (text === null) return null
  try {
    const bin = atob(text)
    if (bin.length !== CHATOT_CRY_SIZE) return null
    const out = new Uint8Array(CHATOT_CRY_SIZE)
    for (let i = 0; i < CHATOT_CRY_SIZE; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

/**
 * 받은 소리(아무 빠르기의 −1~1) → 2kHz 8비트 2000샘플.
 *
 * 한 칸마다 그 사이의 샘플을 평균한다(상자 필터) — 2kHz로 내려 받으면 1kHz 위가 접혀 들어와 쇳소리가
 * 난다. 짧으면 뒤를 0(조용함)으로 채운다: 원작도 녹음을 40프레임(0.67초)에서 끊는다
 * (`WaitTime 30` · `WaitTime 10` 뒤 `StopRecordingChatotCry`)
 *
 * @param gain 곱할 크기. 원작 마이크는 DS가 키워 받는데 노트북 마이크·게임 소리는 작아서, 4비트로
 *   담으면 거의 다 0이 된다 — 부르는 쪽이 `chatotGain`으로 맞춘다
 */
export function toChatotSamples(input: Float32Array, rate: number, gain = 1): Int8Array {
  const out = new Int8Array(CHATOT_CRY_SAMPLES)
  const step = rate / CHATOT_CRY_RATE
  for (let i = 0; i < CHATOT_CRY_SAMPLES; i++) {
    const a = Math.floor(i * step), b = Math.floor((i + 1) * step)
    if (a >= input.length) break
    let sum = 0, n = 0
    for (let k = a; k < Math.min(b, input.length); k++) { sum += input[k]!; n++ }
    const v = n === 0 ? 0 : (sum / n) * gain
    out[i] = Math.max(-128, Math.min(127, Math.round(v * 127)))
  }
  return out
}

/** 크게 키워도 이것까지 — 조용한 방의 잡음을 말로 키우지 않는다 */
const MAX_GAIN = 8
/** 가장 큰 샘플을 여기까지 올린다 */
const PEAK = 0.9

/** 받은 소리를 4비트에 담을 만큼 키우는 배율 (가장 큰 샘플을 0.9로 · 8배까지) */
export function chatotGain(input: Float32Array): number {
  let peak = 0
  for (const v of input) if (Math.abs(v) > peak) peak = Math.abs(v)
  if (peak < 1e-6) return 1
  return Math.min(MAX_GAIN, Math.max(1, PEAK / peak))
}
