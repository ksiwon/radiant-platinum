// 소리가 실제로 나는가 (DATA.md §2.18)
//
// 형식을 아는 것과 소리가 나는 것은 다르다. 명령표는 전곡을 걸어서 확인했지만
// 그건 "밟을 수 있다"는 뜻이지 "맞게 울린다"는 뜻이 아니다.
//
// 여기서 보는 것은 **곡이 실제로 소리를 내고, 그 소리가 터지지도 조용하지도
// 않다**는 것이다. 포락선이나 음정이 틀리면 셋 중 하나가 된다 — 무음, 클리핑
// 덩어리, 아니면 한 음만 계속 나는 것. 세 가지를 다 잰다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { renderSong, TICKS_PER_BEAT, FRAME_RATE, TICK_DIVISOR } from './render'
import { parseSwar } from './swar'
import { parseSbnk, noteFor } from './sbnk'

const DATA = resolve(__dirname, '../../../public/data/sound')
const present = existsSync(resolve(DATA, 'index.json'))
const maybe = present ? describe : describe.skip

interface Index {
  songs: ({ name: string | null; bank: number; volume: number } | null)[]
  banks: ({ wars: (number | null)[] } | null)[]
}

const bin = (rel: string): ArrayBuffer => {
  const b = readFileSync(resolve(DATA, rel))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

function load(song: number) {
  const index = JSON.parse(readFileSync(resolve(DATA, 'index.json'), 'utf8')) as Index
  const meta = index.songs[song]
  if (!meta) throw new Error(`곡 ${String(song)}이 없다`)
  const bank = index.banks[meta.bank]
  if (!bank) throw new Error(`악기표 ${String(meta.bank)}이 없다`)
  return {
    meta,
    seq: bin(`seq/${String(song)}.bin`),
    bnk: bin(`bnk/${String(meta.bank)}.bin`),
    wars: bank.wars.map((w) => (w === null ? null : bin(`war/${String(w)}.bin`))),
  }
}

const rms = (a: Float32Array): number => {
  let s = 0
  for (const v of a) s += v * v
  return Math.sqrt(s / a.length)
}
const peak = (a: Float32Array): number => {
  let m = 0
  for (const v of a) m = Math.max(m, Math.abs(v))
  return m
}

maybe('시간 단위', () => {
  it('프레임률은 틱 나눔수와 4분음표 틱에서 따라 나온다', () => {
    // 240 × 48/60 = 192. 둘 다 실측이라 이 값도 실측이다
    expect((TICK_DIVISOR * TICKS_PER_BEAT) / 60).toBe(FRAME_RATE)
  })
})

/**
 * 자기상관으로 기본 주파수를 잰다.
 *
 * 절대 음정은 표본이 원래 무슨 음인지 몰라서 못 재지만, **비율은 잴 수 있다** —
 * 한 옥타브 올린 음이 정확히 두 배가 되는지가 리샘플 계산의 증거다
 */
function fundamental(a: Float32Array, rate: number): number {
  const hi = Math.floor(rate / 50)
  const r = new Float64Array(hi + 1)
  for (let lag = 0; lag <= hi; lag++) {
    let sum = 0
    for (let i = 0; i + lag < a.length; i++) sum += a[i]! * a[i + lag]!
    r[lag] = sum
  }
  // **첫 골짜기를 지나서** 최고점을 찾는다. 그냥 최댓값을 쓰면 lag 0 언저리나
  // 배음 주기에 붙어서 엉뚱한 답이 나온다
  let lag = 1
  while (lag <= hi && r[lag]! > 0) lag++
  let best = lag, bestScore = -Infinity
  for (; lag <= hi; lag++) {
    if (r[lag]! > bestScore) { bestScore = r[lag]!; best = lag }
  }
  return rate / best
}

/** 음 하나만 있는 악보를 짓는다 */
function oneNote(program: number, key: number): ArrayBuffer {
  const body = [
    0xc7, 0,           // 음표가 스스로 기다리지 않게
    0x81, program,     // 악기
    key, 127, 0x60,    // 음표 (길이 96틱)
    0x80, 0x60,        // 쉼표
    0xff,
  ]
  const buf = new Uint8Array(0x1c + body.length)
  buf.set(body, 0x1c)
  return buf.buffer
}

/**
 * 음표가 스스로 기다리는 악보를 짓는다.
 *
 * 실제 곡은 거의 전부 `0xC7 0`을 켜고 쉼표로 시간을 재서 이쪽 길이 안 밟힌다.
 * 그래서 여기서 따로 만든다 — 쉼표와 똑같이 "길이 N은 정확히 N틱"이어야 한다
 */
function twoNotesThenLoop(program: number): ArrayBuffer {
  const body = [
    0xc7, 1,             // 음표가 길이만큼 기다린다
    0x81, program,
    60, 127, 0x60,       // 96틱
    60, 127, 0x60,       // 96틱
    0x94, 0x00, 0x00, 0x00, // 처음으로 되돌아간다
  ]
  const buf = new Uint8Array(0x1c + body.length)
  buf.set(body, 0x1c)
  return buf.buffer
}

maybe('음표가 스스로 기다릴 때도 길이가 정확하다', () => {
  const { bnk, wars } = load(1004)

  it('96틱짜리 음 둘이 정확히 192틱이다', () => {
    // 기본 템포 120에서 틱은 초당 `120 × 48 / 60 = 96`개다. 192틱 = 정확히 2초
    const out = renderSong(twoNotesThenLoop(0), bnk, wars, {
      sampleRate: 24000, maxSeconds: 20,
    })
    expect(out.loopStart).not.toBeNull()
    const frame = Math.ceil(24000 / 192)
    expect(Math.abs((out.loopStart ?? 0) - 2 * 24000)).toBeLessThanOrEqual(frame)
  })
})

maybe('음정 — 옥타브가 정확히 두 배인가', () => {
  const { bnk, wars } = load(1004)
  const bank = parseSbnk(bnk)
  // **음 하나짜리 악기여야 한다.** 드럼셋이나 음역 분할은 음 높이가 바뀌면
  // 표본 자체가 바뀌므로 옥타브 비를 볼 수 없다 — 리샘플이 아니라 다른 소리다.
  // 그리고 짧은 표본은 한 번 재생되고 끝나므로 도는 것만 고른다
  const program = bank.programs.findIndex((p) => {
    if (p?.type !== 'single' || p.note.kind !== 1) return false
    const swav = wars[p.note.war] === null ? null : parseSwar(wars[p.note.war]!)[p.note.wave]
    return swav?.loops === true && swav.data.length > 2000
  })

  it('표본 악기를 찾았다', () => {
    expect(program).toBeGreaterThanOrEqual(0)
  })

  it('60번 음과 72번 음의 주파수 비가 2다', () => {
    const at = (key: number) => {
      const out = renderSong(oneNote(program, key), bnk, wars, {
        sampleRate: 48000, maxSeconds: 1,
      })
      // 어택이 끝난 뒤를 본다
      return fundamental(out.left.subarray(4800, 24000), 48000)
    }
    const low = at(60), high = at(72)
    expect(low).toBeGreaterThan(0)
    // 반음의 1/4(약 1.5%) 안에 들어야 한다
    expect(high / low).toBeGreaterThan(2 / 1.015)
    expect(high / low).toBeLessThan(2 * 1.015)
  })
})

maybe('떡잎마을 낮 (SEQ_TOWN01_D)', () => {
  const { meta, seq, bnk, wars } = load(1004)
  const out = renderSong(seq, bnk, wars, { sampleRate: 48000, maxSeconds: 12 })

  it('이름이 맞다', () => {
    expect(meta.name).toBe('SEQ_TOWN01_D')
  })

  it('12초를 꽉 채운다 — 중간에 죽지 않는다', () => {
    // 트랙이 다 끝나면 렌더가 일찍 멈춘다. 도돌이표가 있으니 안 멈춰야 한다
    expect(out.left.length).toBe(48000 * 12)
  })

  it('소리가 난다 — 무음도 클리핑도 아니다', () => {
    const l = rms(out.left), r = rms(out.right)
    // 무음이면 0, 포락선이 안 걸리면 1에 붙는다
    expect(l).toBeGreaterThan(0.01)
    expect(r).toBeGreaterThan(0.01)
    expect(peak(out.left)).toBeLessThan(1.5)
    expect(peak(out.right)).toBeLessThan(1.5)
  })

  it('좌우가 다르다 — 팬이 걸려 있다', () => {
    let diff = 0
    for (let i = 0; i < out.left.length; i++) diff += Math.abs(out.left[i]! - out.right[i]!)
    expect(diff / out.left.length).toBeGreaterThan(0.001)
  })

  it('한 음만 나는 것이 아니다 — 소리가 시간에 따라 변한다', () => {
    // 1초 단위로 나눠 RMS를 재면 곡은 들쭉날쭉하고, 한 음이 늘어져 있으면 평평하다
    const step = 48000
    const parts: number[] = []
    for (let i = 0; i + step <= out.left.length; i += step) {
      parts.push(rms(out.left.subarray(i, i + step)))
    }
    const mean = parts.reduce((a, b) => a + b, 0) / parts.length
    const spread = Math.max(...parts) - Math.min(...parts)
    expect(parts.length).toBeGreaterThan(6)
    expect(spread).toBeGreaterThan(mean * 0.1)
  })

  it('악기끼리 안 어긋난다 — 트랙 여덟이 같은 자리에서 돈다', () => {
    // ⚠️ 이게 깨졌을 때 귀에 들린 증상이 "악기 타이밍이 조금씩 어긋난다"였다.
    //
    // 원인은 쉼표를 N+1틱으로 센 것이다. 명령을 읽는 것 자체는 시간을 안 먹는데
    // `wait = N`을 놓고 그 틱을 끝내 버렸다. 쉼표가 잦은 트랙일수록 더 밀리므로
    // 트랙끼리 벌어졌다 — 이 곡에서 한 바퀴가 4830~5085틱으로 갈라졌다.
    const long = renderSong(seq, bnk, wars, { sampleRate: 24000, maxSeconds: 200 })
    const at = long.trackLoopAt.filter((v): v is number => v !== null)
    expect(at.length).toBe(8)
    // 근사가 아니라 **똑같아야** 한다. 여덟이 우연히 한 표본에 모일 수는 없다
    expect(new Set(at).size).toBe(1)
  })

  it('한 바퀴가 정확히 75초 — 템포 80에서 4800틱이다', () => {
    // 4800틱 = 4분음표 100개. `4800 × 60 / (80 × 48) = 75`초다.
    // 쉼표를 N+1틱으로 세던 때는 트랙마다 4830~5085틱으로 갈라져서
    // 이 숫자가 아예 안 나왔다
    const long = renderSong(seq, bnk, wars, { sampleRate: 24000, maxSeconds: 200 })
    const loop = (long.loopEnd ?? 0) - (long.loopStart ?? 0)
    expect(loop).toBe(75 * 24000)
  })

  it('끝까지 가면 도돌이표를 만난다', () => {
    // 12초로는 안 돌아온다. 곡이 한 바퀴 도는 것을 확인하려면 끝까지 가야 한다
    const long = renderSong(seq, bnk, wars, { sampleRate: 24000, maxSeconds: 120 })
    expect(long.loopStart).not.toBeNull()
    expect(long.loopStart).toBeGreaterThan(24000 * 5)
  })
})

maybe('악기표와 파형 창고', () => {
  it('악기가 가리키는 표본이 전부 창고 안에 있다', () => {
    const index = JSON.parse(readFileSync(resolve(DATA, 'index.json'), 'utf8')) as Index
    let defs = 0, missing = 0, psg = 0
    for (let b = 0; b < index.banks.length; b++) {
      const meta = index.banks[b]
      if (!meta) continue
      const bank = parseSbnk(bin(`bnk/${String(b)}.bin`))
      const wars = meta.wars.map((w) => (w === null ? null : parseSwar(bin(`war/${String(w)}.bin`))))
      for (const p of bank.programs) {
        for (let key = 0; key < 128; key++) {
          const def = noteFor(p, key)
          if (!def) continue
          defs++
          if (def.kind !== 1) { psg++; continue }
          if (!wars[def.war]?.[def.wave]) missing++
        }
      }
    }
    // 하나라도 비면 창고 번호나 표본 번호를 잘못 읽은 것이다
    expect(defs).toBeGreaterThan(1000)
    expect(missing).toBe(0)
    expect(psg).toBeGreaterThan(0)
  })
})
