import { describe, expect, it } from 'vitest'
import {
  CHATOT_CRY_SAMPLES, CHATOT_CRY_SIZE, chatotCrySpeed, chatotGain, chatterActivation, chatterChance,
  decodeChatotCry, encodeChatotCry, storeChatotCry, toChatotSamples, upsampleChatotCry,
} from './chatotCry'

describe('chatotCry', () => {
  it('담고 풀면 4비트로 깎인 값이 된다 — 낮은 니블이 먼저', () => {
    const samples = new Int8Array(CHATOT_CRY_SAMPLES)
    samples[0] = 127; samples[1] = -128; samples[2] = 33; samples[3] = -33
    const raw = storeChatotCry(samples)
    expect(raw.length).toBe(CHATOT_CRY_SIZE)
    // 127/16 = 7 → 15 · −128/16 = −8 → 0
    expect(raw[0]).toBe(0x0f)
    // 33/16 = 2 → 10 · −33/16 = −2(0 쪽으로 자른다) → 6
    expect(raw[1]).toBe(0x6a)
    const back = upsampleChatotCry(raw)
    expect([...back.slice(0, 4)]).toEqual([112, -128, 32, -32])
  })

  it('조용한 샘플은 조용한 채로 남는다 — −1은 −1/16 = 0이다', () => {
    const samples = new Int8Array(CHATOT_CRY_SAMPLES).fill(-1)
    const raw = storeChatotCry(samples)
    expect(raw.every((b) => b === 0x88)).toBe(true)
    expect(upsampleChatotCry(raw).every((v) => v === 0)).toBe(true)
  })

  it('혼란 갈래는 16번째 바이트가 정한다', () => {
    const raw = new Uint8Array(CHATOT_CRY_SIZE).fill(0x88)
    expect(chatterActivation(null)).toBe(0)
    raw[15] = 0x88 // −120
    expect(chatterActivation(raw)).toBe(1)
    raw[15] = 0x1e // 30
    expect(chatterActivation(raw)).toBe(2)
    raw[15] = 0xe2 // −30
    expect(chatterActivation(raw)).toBe(0)
    raw[15] = 0xe1 // −31
    expect(chatterActivation(raw)).toBe(1)
  })

  it('확률은 하나씩 크다 — rand % 100 > chance일 때만 건너뛴다', () => {
    expect([chatterChance(0), chatterChance(1), chatterChance(2)]).toEqual([1, 11, 31])
  })

  it('빠르기는 1.0~1.25배', () => {
    expect(chatotCrySpeed(0)).toBe(1)
    expect(chatotCrySpeed(0.999999)).toBeCloseTo(1 + 8191 / 32768, 9)
  })

  it('세이브 글자로 오가도 같다 · 길이가 틀리면 없는 것이다', () => {
    const raw = new Uint8Array(CHATOT_CRY_SIZE).map((_, i) => (i * 37) & 0xff)
    expect(decodeChatotCry(encodeChatotCry(raw))).toEqual(raw)
    expect(decodeChatotCry(null)).toBeNull()
    expect(decodeChatotCry(btoa('abc'))).toBeNull()
    expect(decodeChatotCry('%%%')).toBeNull()
  })

  it('48kHz 0.5초 → 2000칸 중 앞 1000칸이 차고 뒤는 조용하다', () => {
    const input = new Float32Array(24000).fill(0.5)
    const out = toChatotSamples(input, 48000)
    expect(out.length).toBe(CHATOT_CRY_SAMPLES)
    expect(out[0]).toBe(64)
    expect(out[999]).toBe(64)
    expect(out[1000]).toBe(0)
    expect(out[1999]).toBe(0)
  })

  it('키우는 배율 — 가장 큰 샘플을 0.9로, 8배까지', () => {
    expect(chatotGain(new Float32Array([0.45, -0.1]))).toBeCloseTo(2, 6)
    expect(chatotGain(new Float32Array([0.01]))).toBe(8)
    expect(chatotGain(new Float32Array([1]))).toBe(1)
    expect(chatotGain(new Float32Array(10))).toBe(1)
  })
})
