// PNG 디코더 — 우리가 구운 시트를 오프라인에서 다시 읽는다.
//
// `extract/png.js`가 굽고 이것이 읽는다. 브라우저를 안 띄우고 화면을 확인하려면
// 산출물을 그대로 되읽을 수 있어야 한다 — 롬에서 다시 뽑으면 파이프라인 뒷단
// (팩킹·자르기)이 검증 밖으로 빠진다.
//
// 우리 인코더는 필터 0만 쓰지만 여기서는 5종을 다 받는다. 나중에 인코더를
// 바꿔도 이 쪽이 먼저 안 깨진다.
'use strict'
const fs = require('fs')
const zlib = require('zlib')

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** @returns {{width:number,height:number,pixels:Uint8Array}} RGBA8 */
function decodePng(file) {
  return decodePngBytes(fs.readFileSync(file), file)
}

/** 같은 것을 바이트로. 파일로 안 떨군 산출물을 그 자리에서 견주려면 이쪽이다 */
function decodePngBytes(bytes, where = '<메모리>') {
  const buf = Buffer.from(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.byteLength ?? bytes.length)
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) throw new Error(`PNG가 아니다: ${where}`)

  let at = 8
  let width = 0, height = 0, depth = 0, colorType = 0
  const idat = []
  while (at + 8 <= buf.length) {
    const len = buf.readUInt32BE(at)
    const type = buf.toString('ascii', at + 4, at + 8)
    const body = buf.subarray(at + 8, at + 8 + len)
    at += 12 + len
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      depth = body[8]
      colorType = body[9]
    } else if (type === 'IDAT') idat.push(body)
    else if (type === 'IEND') break
  }
  if (depth !== 8 || colorType !== 6) {
    throw new Error(`8비트 RGBA만 읽는다 (depth ${depth}, type ${colorType})`)
  }

  const raw = zlib.inflateSync(Buffer.concat(idat))
  const bpp = 4
  const stride = width * bpp
  const out = new Uint8Array(width * height * bpp)
  let p = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[p++]
    const row = y * stride
    const prev = row - stride
    for (let i = 0; i < stride; i++) {
      const x = raw[p + i]
      const a = i >= bpp ? out[row + i - bpp] : 0
      const b = y > 0 ? out[prev + i] : 0
      const c = y > 0 && i >= bpp ? out[prev + i - bpp] : 0
      let value
      switch (filter) {
        case 0: value = x; break
        case 1: value = x + a; break
        case 2: value = x + b; break
        case 3: value = x + ((a + b) >> 1); break
        case 4: value = x + paeth(a, b, c); break
        default: throw new Error(`모르는 필터 ${filter}`)
      }
      out[row + i] = value & 0xff
    }
    p += stride
  }
  return { width, height, pixels: out }
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

module.exports = { decodePng, decodePngBytes }
