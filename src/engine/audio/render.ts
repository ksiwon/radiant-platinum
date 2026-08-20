// 악보를 소리로 (DATA.md §2.18)
//
// 실시간 스케줄러를 두지 않고 **한 번에 렌더한다.** Web Audio 노드를 음표마다
// 만들면 곡 하나에 수천 개가 되고, 포락선을 `GainNode`로 흉내 내면 원작 곡선이
// 아니라 대충 비슷한 곡선이 된다. 여기서는 드라이버가 하던 것을 그대로 한다 —
// 1/192초마다 트랙을 밟고 포락선을 한 칸 굴리고, 그 사이를 채운다.
//
// 시간 단위 둘이 다르다:
//   · 드라이버 프레임 192Hz — 포락선이 여기서 움직인다
//   · 악보 틱 = `템포 × 48 / 60` Hz — 4분음표가 48틱이다
//
// **48틱이라는 것은 실측이다.** 곡 1013개의 음표 길이를 세면 11·23·47·95가
// 1·2·3·5위인데 전부 12·24·48·96에서 하나 뺀 값이다(음이 서로 안 붙게 한 틱
// 짧게 쓴다). 점음표 71·35와 셋잇단 31·15도 같은 자리에 선다. 그리고 드라이버가
// 틱 카운터를 240과 비교하므로(ARM7 0x2385360) 프레임률은 `240 × 48/60 = 192`다.
import { parseSbnk, noteFor, type Bank, type NoteDef } from './sbnk'
import { parseSwar, type Swav } from './swar'
import { commandWidth } from './sseq'
import { sinIdx } from './tables'
import {
  ENV_FLOOR, RELEASE, envDone, gainOf, knobDecibel, releaseEnv, startEnv, stepEnv, type Env,
} from './envelope'

/** 드라이버가 도는 빠르기 (Hz) */
export const FRAME_RATE = 192
/** 드라이버가 틱 카운터를 견주는 값 (ARM7 0x2385360) */
export const TICK_DIVISOR = 240
/** 4분음표 한 개의 틱 수 */
export const TICKS_PER_BEAT = 48
/** 악보가 시작하는 자리 */
const SEQ_BASE = 0x1c
/** 하드웨어 채널 수. 넘으면 제일 오래된 것을 뺏는다 */
const CHANNELS = 16
/** 트랙 수 */
const TRACKS = 16

interface Track {
  /** 악보 안 자리. `null`이면 끝난 트랙 */
  at: number | null
  /** 이 트랙이 도돌이표를 밟은 횟수 */
  loops: number
  /** 처음 도돌이표를 밟은 자리 (표본 수) */
  loopAt: number | null
  /** 부르기가 쌓이는 곳 */
  stack: number[]
  /** 쉬는 동안 남은 틱 */
  wait: number
  program: number
  volume: number
  expression: number
  pan: number
  transpose: number
  /** 반음 단위 벤드 폭 */
  bendRange: number
  /** −128~127 */
  bend: number
  /** 음표가 길이만큼 기다리는가 (0xc7). 기본은 기다린다 */
  noteWait: boolean
  /** 악기표가 준 값을 덮어쓴 ADSR. `-1`이면 안 덮었다 */
  attack: number
  decay: number
  sustain: number
  release: number
  /**
   * 비브라토 (0xCA 깊이 · 0xCB 속도 · 0xCD 폭).
   *
   * ⚠️ **종류(0xCC)와 지연(0xE0)은 안 싣는다.** 전곡 1013개를 훑으면 그 둘이
   * **한 번도 안 나온다** — 종류는 늘 0(음 높이)이고 지연은 늘 0이다. 포르타멘토
   * (0xC9·0xCE·0xCF)도 0회라 아예 없다.
   *
   * ⚠️ **속도 16과 폭 1은 우리 값이다.** 드라이버가 채널을 처음 세울 때 넣는
   * 값을 ARM7에서 못 찾았다. 깊이를 쓰는 곡 363개 중 폭을 안 정하는 곡이 161개 ·
   * 속도를 안 정하는 곡이 143개라 이 둘이 실제로 쓰인다. 폭을 0으로 두면
   * 깊이만 준 곡의 비브라토가 통째로 사라지므로 1이 최소값이다
   */
  modDepth: number
  modSpeed: number
  modRange: number
}

interface Voice {
  env: Env
  def: NoteDef
  swav: Swav | null
  key: number
  velocity: number
  track: Track
  /** 표본 안 자리 (소수) */
  phase: number
  /** 남은 게이트 틱. 0이 되면 놓는다 */
  gate: number
  /** 뺏을 때 쓰는 나이 */
  born: number
  /** PSG 사각파 위상 */
  psg: number
  /** 잡음 LFSR */
  lfsr: number
  /**
   * 비브라토 위상 (u16). 상위 바이트가 사인표의 색인이다.
   *
   * **음마다 따로 돈다.** 원작도 채널 구조체가 들고 있어서, 같은 트랙의 새 음이
   * 시작하면 0에서 다시 시작한다
   */
  modCounter: number
  /**
   * 표본이 다 떨어졌다.
   *
   * 도돌이표가 없는 표본은 하드웨어가 끝에서 채널을 **스스로 놓는다.** 이걸
   * 안 하면 게이트가 0인 음(울음소리가 그렇다)이 영영 채널을 붙들고 있어서
   * 16칸이 말라붙는다
   */
  dead: boolean
}

function newTrack(): Track {
  return {
    at: null, loops: 0, loopAt: null, stack: [], wait: 0, program: 0,
    volume: 127, expression: 127, pan: 64, transpose: 0,
    bendRange: 2, bend: 0, noteWait: true,
    attack: -1, decay: -1, sustain: -1, release: -1,
    modDepth: 0, modSpeed: 16, modRange: 1,
  }
}

/**
 * 지금 이 음에 걸리는 비브라토 (1/64 반음).
 *
 * ARM7 두 함수를 그대로 옮긴 것이다:
 *
 *   `0x23851b4`  깊이가 0이면 0. 아니면 `사인(위상 >> 8) × 깊이 × 폭`
 *   `0x23848bc`  종류 0(음 높이)이면 `(그 값 << 6) >> 14`
 *
 * 단위가 1/64 반음인 것은 `SND_CalcTimer`(0x238404c)가 **한 옥타브를 0x300**
 * 으로 접는 데서 나온다 — 0x300 = 768 = 64 × 12다.
 *
 * ⚠️ **음량·팬 모듈레이션은 안 만든다.** 종류 명령(0xCC)이 전곡에 0회라
 * 언제나 음 높이다. 만들어 두면 밟히지 않는 코드가 된다
 */
export function modPitch(counter: number, depth: number, range: number): number {
  if (depth === 0) return 0
  return ((sinIdx(counter >> 8) * depth * range) << 6) >> 14
}

/**
 * 비브라토 위상을 한 프레임 민다 (ARM7 `0x2385154`).
 *
 * `위상 += 속도 << 6`을 하고 **상위 바이트만** 0x80으로 접는다. 그래서 한 바퀴가
 * `0x80 × 256 ÷ (속도 × 64) = 512 ÷ 속도` 프레임이고, 192프레임/초이므로
 * 떨림이 **속도 × 0.375Hz**다 — 제일 많이 쓰이는 속도 18이 6.75Hz다
 */
export function modStep(counter: number, speed: number): number {
  const next = (counter + (speed << 6)) & 0xffff
  let high = next >> 8
  while (high >= 0x80) high -= 0x80
  return (next & 0xff) | (high << 8)
}

function vibrato(v: Voice): number {
  return modPitch(v.modCounter, v.track.modDepth, v.track.modRange)
}

/** 가변 길이 정수 */
function varLen(d: Uint8Array, at: number): [number, number] {
  let v = 0, n = 0
  for (;;) {
    const b = d[at + n]!
    n++
    v = (v << 7) | (b & 0x7f)
    if (!(b & 0x80) || n >= 4) break
  }
  return [v, n]
}

export interface RenderOptions {
  sampleRate: number
  /** 최대 길이 (초). 곡이 도돌이표로 돌아 무한하므로 잘라야 한다 */
  maxSeconds: number
  /** 곡 전체 음량 (0~127) */
  volume?: number
  /**
   * 반음 단위로 통째로 옮긴다.
   *
   * 울음소리가 이걸 쓴다 — 원작은 기절할 때 `SOUND_SEMITONES(-3.5)`를 건다
   * (`sound_playback.c`의 `POKECRY_FAINT`)
   */
  transpose?: number
}

interface Rendered {
  left: Float32Array
  right: Float32Array
  sampleRate: number
  /** 돌아갈 자리 (표본 수). 뛰기를 만나지 않았으면 `null` */
  loopStart: number | null
  /**
   * 한 바퀴가 끝나는 자리.
   *
   * 같은 트랙이 **두 번째로** 뛰는 순간이다. `loopStart`~`loopEnd`가 곡의 한
   * 바퀴이므로 그 구간을 반복하면 이어 붙은 자리가 안 들린다
   */
  loopEnd: number | null
  /** 채널이 모자라 뺏은 횟수 */
  stolen: number
  /**
   * 트랙마다 **처음 도돌이표를 밟은 자리** (표본 수). 안 밟았으면 `null`.
   *
   * 곡은 트랙 전체가 같이 돈다. 그래서 이 값들이 서로 다르면 **악기끼리
   * 어긋나고 있다는 뜻**이고, 그것이 곧 귀에 들린다
   */
  trackLoopAt: (number | null)[]
}

/**
 * 곡 하나를 통째로 편다.
 *
 * `wars`는 악기표가 고를 수 있는 파형 창고 넷이다 — 정의의 `war` 칸이 그중
 * 몇 번째인지를 가리킨다
 */
export function renderSong(
  seq: ArrayBuffer, bnk: ArrayBuffer, wars: (ArrayBuffer | null)[], opts: RenderOptions,
): Rendered {
  const bank: Bank = parseSbnk(bnk)
  const banks = wars.map((w) => (w ? parseSwar(w) : null))
  const data = new Uint8Array(seq)
  const rate = opts.sampleRate
  const masterDb = knobDecibel(opts.volume ?? 127)
  const transpose = opts.transpose ?? 0

  const total = Math.ceil(opts.maxSeconds * rate)
  const left = new Float32Array(total)
  const right = new Float32Array(total)

  const tracks: Track[] = Array.from({ length: TRACKS }, newTrack)
  const voices: Voice[] = []
  let stolen = 0
  let born = 0

  // 첫 트랙 자리. 0xfe로 시작하면 여러 트랙이고 뒤따르는 0x93이 자리를 준다
  let head = SEQ_BASE
  if (data[head] === 0xfe) {
    head += 3
    while (data[head] === 0x93) {
      const n = data[head + 1]!
      tracks[n]!.at = SEQ_BASE + (data[head + 2]! | (data[head + 3]! << 8) | (data[head + 4]! << 16))
      head += 5
    }
  }
  tracks[0]!.at = head

  let tempo = 120
  let counter = 0
  let loopStart: number | null = null
  let loopEnd: number | null = null
  /** 도돌이표를 처음 밟은 트랙. 한 바퀴는 그 트랙을 기준으로 잰다 */
  let loopTrack: Track | null = null
  let written = 0
  /** 프레임 하나가 내는 표본 수. 정수가 아니라 모아서 쓴다 */
  const perFrame = rate / FRAME_RATE
  let carry = 0

  const swavFor = (def: NoteDef): Swav | null => {
    if (def.kind !== 1) return null
    return banks[def.war]?.[def.wave] ?? null
  }

  /** 음 하나를 올린다 */
  const noteOn = (t: Track, key: number, velocity: number, gate: number) => {
    const def = noteFor(bank.programs[t.program] ?? null, key)
    if (!def) return
    if (voices.length >= CHANNELS) {
      // **제일 조용한 것을 뺏는다.** 제일 오래된 것을 뺏으면 길게 끄는 저음이
      // 먼저 잘려서 제일 잘 들린다 — 하드웨어도 놓인 채널과 작은 소리를 먼저 고른다.
      // 16채널이 모자라는 것 자체는 정상이다: 트랙 여덟이 초당 서른 몇 음을
      // 내는데 릴리스 꼬리가 0.6초쯤이라 겹치는 수가 열아홉쯤 된다
      let worst = 0, worstScore = Infinity
      for (let i = 0; i < voices.length; i++) {
        const v = voices[i]!
        const loud = v.env.value + (knobDecibel(v.velocity) + knobDecibel(v.track.volume)) * 128
        const score = (v.env.state === RELEASE ? 0 : 1 << 24) + loud
        if (score < worstScore) { worstScore = score; worst = i }
      }
      voices.splice(worst, 1)
      stolen++
    }
    voices.push({
      env: startEnv(
        t.attack < 0 ? def.attack : t.attack,
        t.decay < 0 ? def.decay : t.decay,
        t.sustain < 0 ? def.sustain : t.sustain,
        t.release < 0 ? def.release : t.release,
      ),
      def, swav: swavFor(def), key, velocity, track: t,
      phase: 0, gate, born: born++, psg: 0, lfsr: 0x7fff, dead: false, modCounter: 0,
    })
  }

  /**
   * 트랙 하나를 한 틱 밟는다.
   *
   * ⚠️ **쉼표 N은 정확히 N틱이다.** 명령을 읽는 것 자체는 시간을 안 먹는다.
   * 예전에는 `wait = N`을 놓고 그대로 이 틱을 끝내서 N+1틱이 됐는데, 쉼표가
   * 잦은 트랙일수록 더 밀리므로 **악기끼리 서로 어긋났다.** 떡잎마을 곡에서
   * 트랙 여덟이 한 바퀴에 4830~5085틱으로 갈라졌다(255틱 = 4분음표 5개).
   * 기다림을 놓자마자 이 틱을 소비하면 여덟이 전부 4800틱으로 모인다
   */
  const stepTrack = (t: Track) => {
    if (t.at === null) return
    if (t.wait > 0) { t.wait--; return }
    for (let guard = 0; guard < 4096; guard++) {
      if (t.at === null || t.at >= data.length) { t.at = null; return }
      const op = data[t.at]!
      const w = commandWidth(op)
      if (w === null) { t.at = null; return }

      if (w === 'note') {
        const velocity = data[t.at + 1]!
        const [dur, n] = varLen(data, t.at + 2)
        t.at += 2 + n
        noteOn(t, op + t.transpose, velocity, dur)
        // 길이 0은 기다릴 것이 없다 — 다음 명령을 같은 틱에 이어서 읽는다
        if (t.noteWait && dur > 0) { t.wait = dur - 1; return }
        continue
      }
      if (w === 'var') {
        const [v, n] = varLen(data, t.at + 1)
        t.at += 1 + n
        if (op === 0x80) {
          // 이 틱이 곧 기다림의 첫 틱이다. 그래서 하나 뺀다
          if (v > 0) { t.wait = v - 1; return }
          continue
        }
        t.program = v & 0x7f
        continue
      }
      if (w === 'track') { t.at += 5; continue }
      if (w === 'u24') {
        // 형을 적어 준다 — `t.at`에 다시 넣으므로 추론이 자기를 참조한다
        const to: number = SEQ_BASE
          + (data[t.at + 1]! | (data[t.at + 2]! << 8) | (data[t.at + 3]! << 16))
        if (op === 0x95) { t.stack.push(t.at + 4); t.at = to; continue }
        // 뛰기. 여기가 곡이 도는 자리다
        t.loops++
        if (t.loopAt === null) t.loopAt = written
        if (loopStart === null) { loopStart = written; loopTrack = t }
        else if (t === loopTrack && loopEnd === null) loopEnd = written
        t.at = to
        continue
      }
      // 값을 다른 데서 가져오는 접두사들. 전곡에 다섯 번뿐이라 값은 최솟값으로
      // 고정한다 — 렌더가 결정적이어야 시험이 붙든다
      if (w === 'random') { t.at += 6; continue }
      if (w === 'fromVar') { t.at += 3; continue }
      if (w === 'if') { t.at += 1; continue }

      const v = w === 0 ? 0 : data[t.at + 1]!
      switch (op) {
        case 0xc0: t.pan = v; break
        case 0xc1: t.volume = v; break
        case 0xc3: t.transpose = (v << 24) >> 24; break
        case 0xc4: t.bend = (v << 24) >> 24; break
        case 0xc5: t.bendRange = v; break
        case 0xc7: t.noteWait = v !== 0; break
        case 0xd0: t.attack = v; break
        case 0xd1: t.decay = v; break
        case 0xd2: t.sustain = v; break
        case 0xd3: t.release = v; break
        case 0xca: t.modDepth = v; break
        case 0xcb: t.modSpeed = v; break
        case 0xcd: t.modRange = v; break
        case 0xd5: t.expression = v; break
        case 0xe1: tempo = data[t.at + 1]! | (data[t.at + 2]! << 8); break
        case 0xfd: t.at = t.stack.pop() ?? null; continue
        case 0xff: t.at = null; return
        default: break
      }
      if (typeof w === 'number') t.at += 1 + w
      else { t.at = null; return }
    }
  }

  while (written < total && loopEnd === null) {
    // ── 악보를 밟는다 ──
    counter += tempo
    while (counter >= TICK_DIVISOR) {
      counter -= TICK_DIVISOR
      for (const t of tracks) stepTrack(t)
      for (const v of voices) {
        if (v.gate > 0 && --v.gate === 0) releaseEnv(v.env)
      }
    }

    // ── 포락선 한 칸 ──
    for (let i = voices.length - 1; i >= 0; i--) {
      const v = voices[i]!
      stepEnv(v.env)
      // 비브라토 위상도 한 칸 (`0x2385154`). 상위 바이트를 0x80으로 접는다 —
      // 사인표가 한 주기를 0~0x7f로 받기 때문이다
      if (v.track.modDepth > 0) v.modCounter = modStep(v.modCounter, v.track.modSpeed)
      if (v.dead || envDone(v.env)) voices.splice(i, 1)
    }
    if (voices.length === 0 && tracks.every((t) => t.at === null)) break

    // ── 그 사이를 채운다 ──
    carry += perFrame
    const n = Math.min(Math.floor(carry), total - written)
    carry -= n
    for (const v of voices) {
      const db = v.env.value >> 7
      const gain = gainOf(
        db + knobDecibel(v.velocity) + knobDecibel(v.track.volume)
        + knobDecibel(v.track.expression) + masterDb,
      )
      if (gain <= 0) continue
      const pan = Math.max(0, Math.min(127, v.track.pan))
      const gl = gain * ((128 - pan) / 128)
      const gr = gain * (pan / 128)
      const semis = v.key - v.def.baseNote + (v.track.bend * v.track.bendRange) / 128
        + vibrato(v) / 64 + transpose
      const ratio = 2 ** (semis / 12)

      if (v.swav) {
        const step = (v.swav.sampleRate * ratio) / rate
        const src = v.swav.data
        const end = src.length
        for (let i = 0; i < n; i++) {
          let p = v.phase
          if (p >= end) {
            // 도돌이표가 없으면 여기서 끝이다. 하드웨어도 채널을 놓는다
            if (!v.swav.loops) { v.dead = true; break }
            const span = end - v.swav.loopStart
            p = v.swav.loopStart + ((p - v.swav.loopStart) % span)
            v.phase = p
          }
          const i0 = p | 0
          const frac = p - i0
          const a = src[i0] ?? 0
          const b = src[i0 + 1] ?? (v.swav.loops ? src[v.swav.loopStart] ?? 0 : 0)
          const s = a + (b - a) * frac
          left[written + i]! += s * gl
          right[written + i]! += s * gr
          v.phase = p + step
        }
      } else if (v.def.kind === 2) {
        // PSG 사각파. 듀티는 정의의 `wave` 칸이 준다 (0~7)
        const freq = 440 * 2 ** ((v.key + (v.track.bend * v.track.bendRange) / 128
          + vibrato(v) / 64 + transpose - 69) / 12)
        const step = freq / rate
        const duty = (v.def.wave + 1) / 8
        for (let i = 0; i < n; i++) {
          v.psg += step
          if (v.psg >= 1) v.psg -= 1
          const s = v.psg < duty ? -0.5 : 0.5
          left[written + i]! += s * gl
          right[written + i]! += s * gr
        }
      } else if (v.def.kind === 3) {
        // 잡음. 15비트 LFSR을 음 높이만큼 빠르게 돌린다
        const freq = 440 * 2 ** ((v.key + transpose - 69) / 12) * 8
        const step = freq / rate
        for (let i = 0; i < n; i++) {
          v.psg += step
          while (v.psg >= 1) {
            v.psg -= 1
            const bit = v.lfsr & 1
            v.lfsr >>= 1
            if (bit) v.lfsr ^= 0x6000
          }
          const s = (v.lfsr & 1) ? 0.4 : -0.4
          left[written + i]! += s * gl
          right[written + i]! += s * gr
        }
      }
    }
    written += n
    if (n === 0 && carry < 1) carry += perFrame
  }

  return {
    left: left.subarray(0, written), right: right.subarray(0, written),
    sampleRate: rate, loopStart, loopEnd, stolen,
    trackLoopAt: tracks.map((t) => t.loopAt),
  }
}

/** 포락선 바닥. 시험이 쓴다 */
export { ENV_FLOOR }
