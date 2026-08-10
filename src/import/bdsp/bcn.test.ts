// BC 디코더 — `texture2ddecoder`와 픽셀이 같은가
//
// ⚠️ **무작위 블록으로 잰다.** 진짜 텍스처만 쓰면 실제로 나오는 모드만 지나가고,
// BC7은 모드가 여덟 개라 그중 둘만 밟고도 "통과"가 된다. 128비트를 그냥 흔들면
// 여덟 모드가 다 나온다.
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { decodeBc, type BcKind } from './bcn'

const ROOT = resolve(__dirname, '../../..')

function oracle(kind: string, src: Uint8Array, w: number, h: number): Uint8Array | null {
  try {
    const out = execFileSync('py', ['-3.13', 'tools/spike/blockOracle.py', kind, String(w), String(h)], {
      cwd: ROOT, input: Buffer.from(src), maxBuffer: 1 << 28,
    })
    return new Uint8Array(out)
  } catch { return null }
}

/** 되풀이 가능한 난수 — 실패했을 때 같은 블록을 다시 만들 수 있어야 한다 */
function random(seed: number, n: number): Uint8Array {
  const out = new Uint8Array(n)
  let s = seed >>> 0
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    out[i] = (s >>> 24) & 0xff
  }
  return out
}

/**
 * BC3 색 블록을 **인코더가 내는 모양**으로 맞춘다 (c0 > c1).
 *
 * ⚠️ 규격상 BC3 안의 색 블록은 언제나 4색이고, 그래서 인코더가 c0 ≤ c1을 낼
 * 이유가 없다. 그런데 `texture2ddecoder`는 그 자리에서도 BC1의 3색 갈래를 타
 * 검정을 만든다. 아무 128비트나 흔들면 절반이 그 자리에 떨어져 "다르다"만 나오고,
 * 진짜 자산에서는 한 번도 안 나오는 차이다 (`bcn.test.ts`의 진짜 텍스처 묶음이
 * 그것을 잰다). 여기서는 인코더가 실제로 내는 범위만 흔든다
 */
function encoderColors(src: Uint8Array): void {
  const view = new DataView(src.buffer, src.byteOffset, src.byteLength)
  for (let at = 0; at + 16 <= src.byteLength; at += 16) {
    const c0 = view.getUint16(at + 8, true)
    const c1 = view.getUint16(at + 10, true)
    if (c0 > c1) continue
    view.setUint16(at + 8, c1, true)
    view.setUint16(at + 10, c0 === c1 ? Math.max(0, c0 - 1) : c0, true)
  }
}

const KINDS: { kind: BcKind, bytes: number }[] = [
  { kind: 'bc1', bytes: 8 },
  { kind: 'bc3', bytes: 16 },
  { kind: 'bc4', bytes: 8 },
  { kind: 'bc5', bytes: 16 },
  { kind: 'bc7', bytes: 16 },
]

describe('BC 디코더', () => {
  // 64×64 = 블록 256개. BC7 여덟 모드가 모두 여러 번 나온다
  const W = 64
  const H = 64
  const blocks = (W / 4) * (H / 4)

  for (const { kind, bytes } of KINDS) {
    it(`${kind}이 texture2ddecoder와 픽셀까지 같다`, () => {
      const src = random(0x9e3779b9 + bytes, blocks * bytes)
      if (kind === 'bc3') encoderColors(src)
      const want = oracle(kind, src, W, H)
      if (!want) {
        expect.soft(true, 'texture2ddecoder를 못 돌렸다 — 대조를 건너뛴다').toBe(true)
        return
      }
      const mine = decodeBc(kind, src, W, H)
      expect(mine.byteLength).toBe(want.byteLength)
      let diff = -1
      for (let i = 0; i < want.length; i++) {
        if (mine[i] !== want[i]) { diff = i; break }
      }
      expect(diff, diff < 0 ? '' : `픽셀 ${String(diff >> 2)} 채널 ${String(diff & 3)}: ${String(mine[diff])} ≠ ${String(want[diff])}`).toBe(-1)
    })
  }

  it('4의 배수가 아닌 크기는 삐져나온 픽셀을 버린다', () => {
    const src = random(7, 4 * 8)  // 2×2 블록
    const out = decodeBc('bc1', src, 5, 6)
    expect(out.byteLength).toBe(5 * 6 * 4)
  })

  it('자료가 모자라면 세운다 — 조용히 검은 칸을 만들지 않는다', () => {
    expect(() => decodeBc('bc7', new Uint8Array(16), 64, 64)).toThrow(/모자란다/)
  })
})
