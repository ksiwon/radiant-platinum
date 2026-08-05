// 최소 PNG 인코더 (DATA.md §3.1)
//
// 아이콘 아틀라스 하나 쓰려고 이미지 라이브러리를 물리고 싶지 않다. PNG는
// 청크 세 개(IHDR·IDAT·IEND)에 zlib만 있으면 되고 zlib은 노드에 들어 있다.
'use strict'
const zlib = require('node:zlib')

const CRC = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC[n] = c
}
function crc32(buf) {
  let c = -1
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, body) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, 'ascii')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
  return Buffer.concat([head, body, tail])
}

/**
 * RGBA8 픽셀 배열을 PNG로.
 *
 * 필터는 전부 0(None)이다. 아이콘 아틀라스는 어차피 색 수가 적어 zlib이 잘 줄인다 —
 * 필터를 골라 봐야 몇 KB 차이고 코드만 늘어난다.
 *
 * @param {Uint8Array} rgba 길이 width*height*4
 */
function encodePng(rgba, width, height) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8      // 비트 깊이
  ihdr[9] = 6      // 색 종류: 트루컬러 + 알파
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

module.exports = { encodePng }
