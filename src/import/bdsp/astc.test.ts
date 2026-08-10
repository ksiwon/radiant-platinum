// ASTC 디코더 — `texture2ddecoder`와 픽셀이 같은가
//
// ⚠️ **무작위 128비트를 그냥 흔들면 안 된다.** 열에 여덟이 규격에 없는 블록이라
// 오류색끼리 비교하게 되고, 디코더마다 오류색이 달라서 "통과"도 "실패"도 뜻이
// 없다. 여기서는 **유효한 블록만 지어** 흔든다 — 블록 모드·부분 수·끝점 모드를
// 규격 안에서 고르고 나머지 자리에 난수를 채운다.
//
// ⚠️ HDR 끝점 모드는 짓지 않는다. BDSP는 `ASTC_RGB_*`(LDR)뿐이고 우리는 HDR을
// 안 푼다 (`decodeAstcBlock`이 `info.hdr`를 세운다).
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  decodeAstc, decodeAstcBlock, decodeBlockMode, fitQuant, iseBitCount, iseMax, partitionOf,
  quintsOf, tritsOf, unquantTable,
} from './astc'
import { bdspDir, withLocal } from '../../data/romData.testkit'

const ROOT = resolve(__dirname, '../../..')

function oracle(src: Uint8Array, w: number, h: number, bw: number, bh: number): Uint8Array | null {
  try {
    const out = execFileSync('py', [
      '-3.13', 'tools/spike/blockOracle.py', 'astc', String(w), String(h), String(bw), String(bh),
    ], { cwd: ROOT, input: Buffer.from(src), maxBuffer: 1 << 28 })
    return new Uint8Array(out)
  } catch { return null }
}

// ── 유효한 블록 짓기 ─────────────────────────────────────────────────────────

const LDR_CEM = [0, 1, 4, 5, 6, 8, 9, 10, 12, 13]

function setBits(b: Uint8Array, at: number, n: number, v: number): void {
  for (let i = 0; i < n; i++) {
    const bit = (v >>> i) & 1
    if (bit) b[(at + i) >> 3]! |= 1 << ((at + i) & 7)
    else b[(at + i) >> 3]! &= ~(1 << ((at + i) & 7))
  }
}

/** 그 블록 크기에서 쓸 수 있는 모드 */
function validModes(bw: number, bh: number): number[] {
  const out: number[] = []
  for (let m = 0; m < 2048; m++) {
    if ((m & 0x1ff) === 0x1fc) continue
    const bm = decodeBlockMode(m)
    if (!bm || bm.weightsX > bw || bm.weightsY > bh) continue
    const count = bm.weightsX * bm.weightsY * (bm.dualPlane ? 2 : 1)
    if (count > 64) continue
    const bits = iseBitCount(count, bm.quant)
    if (bits < 24 || bits > 96) continue
    out.push(m)
  }
  return out
}

function makeBlocks(bw: number, bh: number, n: number, seed: number): Uint8Array {
  let s = seed >>> 0
  const rnd = (): number => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s >>> 8 }
  const modes = validModes(bw, bh)
  const out = new Uint8Array(n * 16)
  let made = 0
  let guard = 0
  while (made < n && guard++ < n * 500) {
    const mode = modes[rnd() % modes.length]!
    const bm = decodeBlockMode(mode)!
    const weightBits = iseBitCount(bm.weightsX * bm.weightsY * (bm.dualPlane ? 2 : 1), bm.quant)
    const parts = 1 + (rnd() % 4)
    const cem = LDR_CEM[rnd() % LDR_CEM.length]!
    const values = parts * (((cem >> 2) + 1) * 2)
    if (values > 18) continue
    const config = parts === 1 ? 17 : 29
    const colorBits = 128 - weightBits - config - (bm.dualPlane ? 2 : 0)
    // 끝점을 담을 단계가 없으면 규격에 없는 블록이다. 그런 것은 짓지 않는다
    if (colorBits < 1 || fitQuant(values, colorBits) < 0) continue
    const b = new Uint8Array(16)
    setBits(b, 0, 11, mode)
    setBits(b, 11, 2, parts - 1)
    if (parts === 1) setBits(b, 13, 4, cem)
    else { setBits(b, 13, 10, rnd() % 1024); setBits(b, 23, 6, cem << 2) }
    for (let i = 0; i < colorBits; i++) setBits(b, config + i, 1, rnd() & 1)
    if (bm.dualPlane) setBits(b, 128 - weightBits - 2, 2, rnd() % 4)
    // 가중치는 위에서부터 거꾸로 적힌다
    for (let i = 0; i < weightBits; i++) {
      const at = 127 - i
      if (rnd() & 1) b[at >> 3]! |= 1 << (at & 7)
      else b[at >> 3]! &= ~(1 << (at & 7))
    }
    out.set(b, made * 16)
    made++
  }
  expect(made, '유효한 블록을 못 지었다').toBe(n)
  return out
}

describe('ASTC 블록', () => {
  // 블록 크기 세 가지. BDSP는 6x6과 8x8을 쓰고, 4x4는 "작은 블록" 갈래를 밟는다
  for (const [bw, bh, seed] of [[6, 6, 1], [8, 8, 5], [4, 4, 9]] as const) {
    it(`${bw}x${bh} 유효 블록 1024개가 texture2ddecoder와 픽셀까지 같다`, () => {
      const n = 1024
      const src = makeBlocks(bw, bh, n, seed)
      const width = n * bw
      const want = oracle(src, width, bh, bw, bh)
      if (!want) {
        expect.soft(true, 'texture2ddecoder를 못 돌렸다 — 대조를 건너뛴다').toBe(true)
        return
      }
      const block = new Uint32Array(bw * bh)
      let bad = 0
      let first = ''
      for (let i = 0; i < n; i++) {
        decodeAstcBlock(src, i * 16, bw, bh, block)
        for (let y = 0; y < bh; y++) {
          for (let x = 0; x < bw; x++) {
            const p = (y * width + i * bw + x) * 4
            const w = ((want[p + 3]! << 24) | (want[p + 2]! << 16) | (want[p + 1]! << 8) | want[p]!) >>> 0
            if (block[y * bw + x] !== w) {
              bad++
              first ||= `블록 ${String(i)} (${String(x)},${String(y)})`
            }
          }
        }
      }
      expect(bad, first).toBe(0)
    })
  }
})

describe('정수열과 역양자화', () => {
  it('3진수 표 256칸이 다 0..2다', () => {
    for (let t = 0; t < 256; t++) for (const v of tritsOf(t)) expect(v).toBeLessThanOrEqual(2)
  })

  it('5진수 표 128칸이 다 0..4고, 4가 든 갈래가 실제로 나온다', () => {
    let withFour = 0
    for (let q = 0; q < 128; q++) {
      const s = quintsOf(q)
      for (const v of s) expect(v).toBeLessThanOrEqual(4)
      if (s.includes(4)) withFour++
    }
    // 4는 낮은 조각으로 못 담아 따로 부호를 쓴다. 그 갈래가 죽어 있으면 안 된다
    expect(withFour).toBeGreaterThan(30)
  })

  it('⚠️ 역양자화 사다리는 0과 255를 다 밟는다 — 뒤섞여 있어도 양 끝은 있다', () => {
    for (let level = 0; level <= 20; level++) {
      const t = unquantTable(level)
      expect(t.length, `단계 ${String(level)}`).toBe(iseMax(level) + 1)
      expect([...t], `단계 ${String(level)}`).toContain(0)
      expect([...t], `단계 ${String(level)}`).toContain(255)
      expect(new Set(t).size, `단계 ${String(level)}에 겹치는 값이 있다`).toBe(t.length)
    }
  })

  it('블록 모드가 없는 자리는 null이다 — 짐작으로 격자를 만들지 않는다', () => {
    // `(mode & 3) === 0`이고 위 두 비트도 0이면 규격에 없는 자리다
    expect(decodeBlockMode(0)).toBeNull()
  })
})

describe('나눔 무늬', () => {
  it('부분 수만큼만 돌려준다', () => {
    for (const parts of [2, 3, 4]) {
      const seen = new Set<number>()
      for (let seed = 0; seed < 64; seed++) {
        for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) seen.add(partitionOf(seed, x, y, parts, false))
      }
      expect(Math.max(...seen)).toBeLessThan(parts)
    }
  })
})

describe('안 푸는 것', () => {
  it('HDR 끝점이 나오면 알린다 — 조용히 색을 지어내지 않는다', () => {
    // 부분 하나 · 끝점 모드 2(HDR 밝기). 모드는 아무 유효한 것이나 쓴다
    const mode = validModes(6, 6)[0]!
    const b = new Uint8Array(16)
    setBits(b, 0, 11, mode)
    setBits(b, 13, 4, 2)
    const out = new Uint32Array(36)
    const info = { hdr: false }
    decodeAstcBlock(b, 0, 6, 6, out, info)
    expect(info.hdr).toBe(true)
  })

  it('자료가 모자라면 세운다', () => {
    expect(() => decodeAstc(new Uint8Array(16), 64, 64, 6, 6)).toThrow(/모자란다/)
  })
})

// ── 진짜 텍스처 ──────────────────────────────────────────────────────────────
//
// 지어낸 블록은 갈래를 넓게 밟고, 진짜 텍스처는 **실제로 나오는 조합**을 밟는다.
// 둘 다 필요하다 — 지어낸 것만으로는 "실제 자산에서 되는가"를 못 말한다.

const CHARACTERS = bdspDir('characters')
const withReal = withLocal('BDSP Characters (raw/AssetAssistant/Characters)', CHARACTERS)

withReal('진짜 BDSP 텍스처', () => {
  it('⚠️ UnityPy가 푼 것과 픽셀이 같다', () => {
    const dir = resolve(ROOT, 'raw/work/astcParity')
    if (!existsSync(resolve(dir, 'meta.json'))) {
      // 대조 자료는 `tools/spike/bdspTexDump.py`가 만든다 (커밋하지 않는다)
      expect.soft(true, '대조 자료가 없다 — pnpm spike:texDump로 만든다').toBe(true)
      return
    }
    const meta = JSON.parse(readFileSync(resolve(dir, 'meta.json'), 'utf8')) as {
      i: number, kind: string, bw: number, bh: number, w: number, h: number,
    }[]
    let pixels = 0
    let bad = 0
    for (const m of meta) {
      if (m.kind !== 'astc') continue
      const raw = new Uint8Array(readFileSync(resolve(dir, `${String(m.i)}.raw`)))
      const want = new Uint8Array(readFileSync(resolve(dir, `${String(m.i)}.rgba`)))
      const mine = decodeAstc(raw, m.w, m.h, m.bw, m.bh).pixels
      for (let i = 0; i < mine.length; i += 4) {
        pixels++
        if (mine[i] !== want[i] || mine[i + 1] !== want[i + 1]
          || mine[i + 2] !== want[i + 2] || mine[i + 3] !== want[i + 3]) bad++
      }
    }
    expect(pixels, '대조할 ASTC 텍스처가 없다').toBeGreaterThan(0)
    expect(bad).toBe(0)
  })
})
