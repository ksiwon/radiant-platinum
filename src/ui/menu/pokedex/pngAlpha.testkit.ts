// 시험용 PNG 알파 읽개 — 8비트 RGBA · 비인터레이스(우리가 굽는 그림이 이 꼴이다)만 푼다. 크기 비교 시험이 실제 그림의
// 발 줄과 가로 둘레를 잰다.
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { alphaBox, type ContentBox } from './sizeMath'

interface PngRgba { w: number, h: number, rgba: Uint8Array }

export function decodePng(file: string): PngRgba {
  const b = readFileSync(file)
  let p = 8
  let w = 0, h = 0, ct = -1
  const idat: Buffer[] = []
  while (p < b.length) {
    const len = b.readUInt32BE(p)
    const type = b.toString('ascii', p + 4, p + 8)
    const d = b.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]! }
    else if (type === 'IDAT') idat.push(d)
    p += 12 + len
  }
  if (ct !== 6) throw new Error(`${file}: RGBA(6)가 아니다 (${String(ct)})`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * 4
  const out = new Uint8Array(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[y * stride + x - 4]! : 0
      const u = y > 0 ? out[(y - 1) * stride + x]! : 0
      const c = x >= 4 && y > 0 ? out[(y - 1) * stride + x - 4]! : 0
      let v = raw[y * (stride + 1) + 1 + x]!
      if (f === 1) v += a
      else if (f === 2) v += u
      else if (f === 3) v += (a + u) >> 1
      else if (f === 4) {
        const pa = Math.abs(u - c), pb = Math.abs(a - c), pc = Math.abs(a + u - 2 * c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c
      }
      out[y * stride + x] = v & 255
    }
  }
  return { w, h, rgba: out }
}

/** 그림 한 장의 알파 둘레 */
export function pngBox(file: string): ContentBox | null {
  const { w, h, rgba } = decodePng(file)
  return alphaBox(rgba, w, h)
}
