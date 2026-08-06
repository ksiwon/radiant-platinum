// 파형 창고 (DATA.md §2.18)
//
// SWAR 하나가 표본 여럿을 들고 있다. 표본은 PCM8 아니면 IMA-ADPCM이고 PCM16은
// 이 롬에 없다.
//
// **자리가 맞는지는 표본이 스스로 말한다.** 머리 12바이트의
// `(loopOffset + nonLoopLength) × 4`가 다음 표본까지의 거리와 같아야 하고,
// 874개 전부에서 그렇다. 한 칸이라도 밀리면 874개가 동시에 어긋난다 —
// 그래서 이 항등식이 자리의 증거가 된다.
//
// ⚠️ 지난번엔 이 자리를 잘못 짚어 길이가 터무니없이 나왔다. 그때 그럴듯한 값이
// 나오지 않아서 다행이었다 — 형식을 잘못 읽으면 대개는 **그럴듯한 쓰레기**가 나온다.

/** 표본 하나 */
export interface Swav {
  /** 0 = PCM8 · 1 = PCM16 · 2 = IMA-ADPCM */
  kind: number
  loops: boolean
  /** 원본 표본율 (Hz) */
  sampleRate: number
  /** 되돌아갈 자리 (표본 수) */
  loopStart: number
  /** −1~1로 편 것 */
  data: Float32Array
}

/** 머리 크기. `kind·loops·rate·time·loopOffset·nonLoopLength` */
const HEAD = 12

/** IMA-ADPCM 단계표 89칸. 표준이고 롬에 따로 있지 않다 */
const STEP = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
  50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230,
  253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963,
  1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327,
  3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442,
  11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794,
  32767,
]
const INDEX = [-1, -1, -1, -1, 2, 4, 6, 8]

/** s16 하나를 −1~1로 */
const norm = 1 / 32768

/**
 * IMA-ADPCM 한 덩이.
 *
 * 앞 4바이트가 초기 상태다 — s16 예측값과 u16 단계 색인. 그 뒤로 니블 하나가
 * 표본 하나이고 **아래 니블이 먼저**다
 */
export function decodeAdpcm(raw: Uint8Array): Float32Array {
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  let sample = view.getInt16(0, true)
  let index = view.getUint16(2, true) & 0x7f
  const out = new Float32Array((raw.length - 4) * 2)
  let n = 0
  for (let i = 4; i < raw.length; i++) {
    for (let half = 0; half < 2; half++) {
      const nib = half === 0 ? raw[i]! & 0xf : raw[i]! >> 4
      const step = STEP[index]!
      // 원작 계산 그대로 — 나눗셈이 아니라 시프트라 버림 방향이 다르다
      let diff = step >> 3
      if (nib & 1) diff += step >> 2
      if (nib & 2) diff += step >> 1
      if (nib & 4) diff += step
      sample = nib & 8 ? sample - diff : sample + diff
      if (sample < -32768) sample = -32768
      else if (sample > 32767) sample = 32767
      index += INDEX[nib & 7]!
      if (index < 0) index = 0
      else if (index > 88) index = 88
      out[n++] = sample * norm
    }
  }
  return out
}

/** 부호 있는 8비트 */
export function decodePcm8(raw: Uint8Array): Float32Array {
  const out = new Float32Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = ((raw[i]! << 24) >> 24) / 128
  return out
}

/** 부호 있는 16비트. 이 롬엔 없지만 형식에는 있다 */
export function decodePcm16(raw: Uint8Array): Float32Array {
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  const out = new Float32Array(raw.length >> 1)
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) * norm
  return out
}

/**
 * 창고 하나를 푼다.
 *
 * 표본 개수는 0x38, 자리표는 0x3c에 있다 — 그 앞 32바이트는 전부 0인 예약 영역이다
 */
export function parseSwar(buf: ArrayBuffer): Swav[] {
  const raw = new Uint8Array(buf)
  const view = new DataView(buf)
  if (view.getUint32(0, false) !== 0x53574152) throw new Error('SWAR가 아니다')
  const count = view.getUint32(0x38, true)
  const table: number[] = []
  for (let i = 0; i < count; i++) table.push(view.getUint32(0x3c + i * 4, true))

  const out: Swav[] = []
  for (let i = 0; i < count; i++) {
    const at = table[i]!
    const end = i + 1 < count ? table[i + 1]! : raw.length
    const kind = raw[at]!
    const loops = raw[at + 1] !== 0
    const sampleRate = view.getUint16(at + 2, true)
    const loopOffset = view.getUint16(at + 6, true)
    const nonLoop = view.getUint32(at + 8, true)
    const declared = (loopOffset + nonLoop) * 4
    const body = raw.subarray(at + HEAD, at + HEAD + declared)
    if (at + HEAD + declared > end) throw new Error(`표본 ${String(i)}이 자리를 넘는다`)

    // 되돌아갈 자리는 바이트가 아니라 **워드**로 적혀 있다. 부호화마다 워드
    // 하나가 담는 표본 수가 달라서 여기서 갈린다
    let data: Float32Array
    let loopStart: number
    if (kind === 0) { data = decodePcm8(body); loopStart = loopOffset * 4 }
    else if (kind === 1) { data = decodePcm16(body); loopStart = loopOffset * 2 }
    else {
      data = decodeAdpcm(body)
      // 앞 4바이트가 상태라 표본이 아니다
      loopStart = Math.max(0, loopOffset * 8 - 8)
    }
    out.push({ kind, loops, sampleRate, loopStart, data })
  }
  return out
}
