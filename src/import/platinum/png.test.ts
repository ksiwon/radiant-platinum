// 우리가 구운 PNG를 우리가 도로 푼다.
//
// ⚠️ **「그럴듯한 그림이 나온다」로는 모자란다.** 거르개를 하나라도 틀리면 줄이
// 조금씩 밀린 그림이 나오는데 그건 눈으로 안 걸린다 — 그래서 **바이트로** 견준다.
// 굽는 쪽이 실제로 내놓는 파일(`public/data/tex` · `public/data/props`)도 함께 푼다.
import { expect, it, describe } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { decodePng, encodePng } from './png'

const ROOT = resolve(__dirname, '../../..')

/** 거르개가 다 나오도록 결이 있는 그림을 짓는다 */
function madeUp(w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = (y * w + x) * 4
      out[at] = (x * 7 + y * 3) & 0xff
      out[at + 1] = (x * x + y) & 0xff
      out[at + 2] = x < w / 2 ? 0x20 : 0xf0
      out[at + 3] = y === 0 ? 0 : 0xff
    }
  }
  return out
}

describe('decodePng', () => {
  it('우리가 구운 것을 바이트 그대로 돌려준다', async () => {
    for (const [w, h] of [[1, 1], [16, 16], [37, 5], [256, 224]] as const) {
      const rgba = madeUp(w, h)
      const png = await encodePng(rgba, w, h)
      const got = await decodePng(png)
      expect(got.width, `${String(w)}×${String(h)}`).toBe(w)
      expect(got.height).toBe(h)
      expect([...got.pixels], `${String(w)}×${String(h)}`).toEqual([...rgba])
    }
  })

  it('안 다루는 꼴은 조용히 넘기지 않고 던진다', async () => {
    const png = await encodePng(madeUp(4, 4), 4, 4)
    // 색유형을 팔레트(3)로 바꿔 둔다 — IHDR의 열째 바이트다
    const bad = png.slice()
    bad[25] = 3
    await expect(decodePng(bad)).rejects.toThrow('안 다루는 PNG 꼴')
    await expect(decodePng(new Uint8Array(16))).rejects.toThrow('PNG가 아니다')
  })

  it('굽는 쪽이 실제로 내놓은 그림을 푼다', async () => {
    const files = [
      'public/data/tex/5.png',
      'public/data/tex/0.png',
      'public/data/props/0.png',
    ].map((p) => resolve(ROOT, p)).filter((p) => existsSync(p))
    // 아직 안 구운 트리에서는 이 줄이 건너뛴다 — 그래도 위 둘이 형식을 잡는다
    if (files.length === 0) return
    for (const path of files) {
      const got = await decodePng(new Uint8Array(readFileSync(path)))
      expect(got.width, path).toBeGreaterThan(0)
      expect(got.pixels.length, path).toBe(got.width * got.height * 4)
      // 다 투명하거나 다 같은 색이면 거르개를 잘못 푼 것이다
      expect(new Set(got.pixels.slice(0, 4096)).size, path).toBeGreaterThan(3)
    }
  })
})
