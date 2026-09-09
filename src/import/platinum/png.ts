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

/**
 * PNG → RGBA 픽셀. **GPU를 안 거친다.**
 *
 * ⚠️ **`createImageBitmap`은 GPU 프로세스에서 푼다.** 그 결과는 GPU에 얹혀 있어서
 * 캔버스로 옮겨 `getImageData`로 읽으면 그리는 중인 GPU와 동기를 맞추며 기다린다.
 * 맵을 한 번 넘을 때 소품·영역 시트 스물넷이 그 길로 가고, 실측으로 그 디코딩이
 * **3.29초**였다 — 256×480 아래짜리 그림들인데도 한 장에 최대 380ms다
 * (`.audit/probe/warpGpu.mjs`). 여기서는 바이트를 그대로 풀어 CPU에만 둔다.
 *
 * ⚠️ **우리가 굽는 PNG만 받는다.** 굽는 쪽이 8비트 RGBA·인터레이스 없음 한 꼴로만
 * 쓰므로(`tools/extract/png.js`·`encodePng`) 그 꼴만 푼다 — 팔레트나 16비트가
 * 오면 던진다. 조용히 다른 그림을 내놓는 것보다 낫다
 */
export async function decodePng(bytes: Uint8Array): Promise<{
  width: number
  height: number
  pixels: Uint8ClampedArray
}> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0) !== 0x89504e47) throw new Error('PNG가 아니다')

  let width = 0
  let height = 0
  const parts: Uint8Array[] = []
  // 8바이트 서명 뒤로 「길이(4) · 종류(4) · 몸통 · CRC(4)」가 이어진다
  for (let at = 8; at + 8 <= bytes.byteLength;) {
    const size = view.getUint32(at)
    const type = String.fromCharCode(
      bytes[at + 4]!, bytes[at + 5]!, bytes[at + 6]!, bytes[at + 7]!)
    const body = at + 8
    if (type === 'IHDR') {
      width = view.getUint32(body)
      height = view.getUint32(body + 4)
      const depth = bytes[body + 8]
      const color = bytes[body + 9]
      const interlace = bytes[body + 12]
      if (depth !== 8 || color !== 6 || interlace !== 0) {
        throw new Error(`안 다루는 PNG 꼴 — 비트 ${String(depth)} 색유형 ${String(color)} 인터레이스 ${String(interlace)}`)
      }
    } else if (type === 'IDAT') {
      parts.push(bytes.subarray(body, body + size))
    } else if (type === 'IEND') {
      break
    }
    at = body + size + 4
  }
  if (width === 0 || height === 0) throw new Error('IHDR이 없다')

  const zlib = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0))
  let put = 0
  for (const p of parts) {
    zlib.set(p, put)
    put += p.byteLength
  }
  const raw = new Uint8Array(await new Response(
    new Blob([zlib as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate')),
  ).arrayBuffer())

  // ⚠️ **줄마다 앞에 거르개 한 바이트가 붙는다.** 그걸 빼고 앞줄·왼쪽 화소를
  // 되더해야 원래 값이다 (PNG 명세 9장). RGBA 8비트라 왼쪽 화소는 4바이트 앞이다
  const stride = width * 4
  const out = new Uint8ClampedArray(height * stride)
  for (let y = 0; y < height; y++) {
    const from = y * (stride + 1)
    const filter = raw[from]
    const line = y * stride
    const up = line - stride
    for (let x = 0; x < stride; x++) {
      const value = raw[from + 1 + x] ?? 0
      const a = x >= 4 ? out[line + x - 4]! : 0
      const b = y > 0 ? out[up + x]! : 0
      const c = x >= 4 && y > 0 ? out[up + x - 4]! : 0
      let add = 0
      if (filter === 1) add = a
      else if (filter === 2) add = b
      else if (filter === 3) add = (a + b) >> 1
      else if (filter === 4) {
        // Paeth — 셋 중 예측값에 제일 가까운 것
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filter !== 0) {
        throw new Error(`모르는 거르개 ${String(filter)}`)
      }
      out[line + x] = (value + add) & 0xff
    }
  }
  return { width, height, pixels: out }
}
