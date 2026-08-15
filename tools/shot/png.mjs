// 찍은 그림을 펴고 재는 것 — `shot.mjs`와 `story.mjs`가 같이 쓴다.
//
// ⚠️ **재는 자를 둘 두지 않는다.** 「까만 화면인가」를 두 도구가 각자 세면
// 문턱이 조용히 갈리고, 한쪽에서 통과한 것이 다른 쪽에서 떨어진다. 자는 하나다.
import { inflateSync } from 'node:zlib'

/** 8비트 PNG를 편다. 필터 다섯 가지를 다 푼다 */
export function decodePng(buf) {
  let at = 8, w = 0, h = 0, depth = 0, kind = 0
  const idat = []
  while (at < buf.length) {
    const len = buf.readUInt32BE(at)
    const type = buf.subarray(at + 4, at + 8).toString('latin1')
    const data = buf.subarray(at + 8, at + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; kind = data[9]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    at += 12 + len
  }
  const bpp = kind === 6 ? 4 : kind === 2 ? 3 : 0
  if (depth !== 8 || bpp === 0) throw new Error(`못 읽는 PNG (depth ${depth} · type ${kind})`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * bpp
  const out = Buffer.alloc(h * stride)
  let p = 0
  for (let y = 0; y < h; y++) {
    const filter = raw[p++]
    for (let x = 0; x < stride; x++) {
      const cur = raw[p + x]
      const a = x >= bpp ? out[y * stride + x - bpp] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0
      let v
      switch (filter) {
        case 0: v = cur; break
        case 1: v = cur + a; break
        case 2: v = cur + b; break
        case 3: v = cur + ((a + b) >> 1); break
        default: {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
          v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
        }
      }
      out[y * stride + x] = v & 0xff
    }
    p += stride
  }
  return { w, h, bpp, pixels: out }
}

/**
 * 찍힌 그림이 정말 그려진 것인가.
 *
 * ⚠️ **캔버스를 `drawImage`로 읽으면 안 된다.** three는
 * `preserveDrawingBuffer: false`라 프레임이 끝나면 버퍼가 비고, 그 캔버스를
 * 2D로 옮기면 **까맣게 나온다.** 실제로 화면이 멀쩡한데 통계만 "색 1 · 밝기 0"이
 * 나왔다 — 하마터면 그린 화면을 못 그렸다고 적을 뻔했다.
 *
 * 그래서 **찍은 PNG를 편다.** 플레이라이트의 스크린샷은 합성기가 뜨는 것이라
 * 그 문제가 없다
 */
export function statsOf(png) {
  const { w, h, bpp, pixels } = decodePng(png)
  const colors = new Set()
  let sum = 0, sum2 = 0
  const n = w * h
  for (let i = 0; i < n; i++) {
    const o = i * bpp
    const r = pixels[o], g = pixels[o + 1], b = pixels[o + 2]
    const l = (r * 299 + g * 587 + b * 114) / 1000
    sum += l; sum2 += l * l
    colors.add((r >> 3 << 10) | (g >> 3 << 5) | (b >> 3))
  }
  const mean = sum / n
  return { colors: colors.size, mean, stdev: Math.sqrt(sum2 / n - mean * mean) }
}

/**
 * 그린 화면인가, 한 색으로 덮인 판인가.
 *
 * ⚠️ **헤드리스에서 제일 흔한 실패가 까만 그림이 성공으로 찍히는 것이다.**
 * 색 수와 밝기 흩어짐을 같이 본다 — 색만 보면 노이즈가 낀 검정이 통과하고,
 * 밝기만 보면 단색 하늘이 떨어진다.
 *
 * 문턱 둘은 실측이다: 제대로 그린 장면은 색이 수천이고 흩어짐이 20을 넘는다.
 * 반대로 못 그린 프레임은 색 1~4에 흩어짐 0이었다
 */
export function looksFlat(stats) {
  return stats.colors < 64 || stats.stdev < 3
}
