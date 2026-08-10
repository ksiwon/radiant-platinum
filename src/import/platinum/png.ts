// 최소 PNG 인코더 — 브라우저에서 (DATA.md §3.1)
//
// `tools/extract/png.js`가 노드 `zlib`으로 하던 것을 `CompressionStream`으로 한다.
// 청크 셋(IHDR·IDAT·IEND)에 zlib 스트림 하나면 PNG다.
//
// ⚠️ **노드 산출물과 바이트로 같지 않다.** deflate는 같은 픽셀에서 여러 정답을
// 낸다 — 노드의 `level: 9`와 브라우저의 `CompressionStream`이 고르는 부호가 다르다.
// 그래서 그림은 **바이트가 아니라 픽셀로** 대조한다 (`pokegra.test.ts`). 압축을
// 맞추려고 우리 deflate를 손으로 쓰는 것은 얻는 것보다 잃는 것이 많다.

const CRC = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC[n] = c
}

function crc32(buf: Uint8Array): number {
  let c = -1
  for (const b of buf) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

const ASCII = (s: string): Uint8Array => Uint8Array.from(s, (ch) => ch.charCodeAt(0))

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.byteLength)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.byteLength)
  out.set(ASCII(type), 4)
  out.set(body, 8)
  view.setUint32(8 + body.byteLength, crc32(out.subarray(4, 8 + body.byteLength)))
  return out
}

/** zlib 스트림. `deflate` 형식이 곧 zlib 래퍼라 IDAT에 그대로 들어간다 */
async function deflate(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * RGBA8 픽셀 배열을 PNG로.
 *
 * 필터는 전부 0(None)이다. 색 수가 적은 그림이라 deflate가 알아서 줄인다 —
 * 필터를 골라 봐야 몇 KB 차이고 코드만 늘어난다
 */
export async function encodePng(rgba: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const stride = width * 4
  if (rgba.byteLength < stride * height) {
    throw new Error(`픽셀이 ${String(rgba.byteLength)}B뿐이다 — ${String(stride * height)}B가 필요하다`)
  }
  const raw = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }
  const ihdr = new Uint8Array(13)
  const iv = new DataView(ihdr.buffer)
  iv.setUint32(0, width)
  iv.setUint32(4, height)
  ihdr[8] = 8      // 비트 깊이
  ihdr[9] = 6      // 색 종류: 트루컬러 + 알파

  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', await deflate(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]
  const total = parts.reduce((n, p) => n + p.byteLength, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.byteLength }
  return out
}
