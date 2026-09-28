// NDS 2D 판(NCLR · NCGR · NSCR)과 셀(NCER) · 셀 애니(NANR) — 노드에서 (DATA.md §2.34)
//
// ⚠️ **`src/import/platinum/ntrgfx.ts` · `ntrcell.ts`와 한 줄씩 같아야 한다.** 머리말은 그쪽에 있다
'use strict'

const TILE = 8
const TILE_BYTES = 32

function lz77(src) {
  if (src[0] !== 0x10) return src
  const size = src[1] | (src[2] << 8) | (src[3] << 16)
  const out = Buffer.alloc(size)
  let o = 0, p = 4
  while (o < size) {
    const flags = src[p++]
    for (let i = 0; i < 8 && o < size; i++) {
      if (flags & (0x80 >> i)) {
        const b1 = src[p++], b2 = src[p++]
        const len = (b1 >> 4) + 3
        let s = o - (((b1 & 0xf) << 8) | b2) - 1
        for (let j = 0; j < len; j++) out[o++] = out[s++]
      } else {
        out[o++] = src[p++]
      }
    }
  }
  return out
}

function color(v) {
  const r = v & 0x1f, g = (v >> 5) & 0x1f, b = (v >> 10) & 0x1f
  return [(r << 3) | (r >> 2), (g << 3) | (g >> 2), (b << 3) | (b >> 2)]
}

function palettes(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RLCN') throw new Error('NCLR이 아니다')
  const count = Math.max(1, Math.floor(buf.readUInt32LE(0x20) / 32))
  const out = []
  for (let p = 0; p < count; p++) {
    const one = []
    for (let i = 0; i < 16; i++) one.push(color(buf.readUInt16LE(0x28 + (p * 16 + i) * 2)))
    out.push(one)
  }
  return out
}

function chars(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RGCN') throw new Error('NCGR이 아니다')
  const size = buf.readUInt32LE(0x28)
  return buf.subarray(0x30, 0x30 + size)
}

function screen(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RCSN') throw new Error('NSCR이 아니다')
  const width = buf.readUInt16LE(0x18) / TILE
  const height = buf.readUInt16LE(0x1a) / TILE
  const cells = []
  for (let i = 0; i < width * height; i++) cells.push(buf.readUInt16LE(0x24 + i * 2))
  return { width, height, cells }
}

/** 화면 블록 차례로 읽는다 (`ntrgfx.ts`의 `screenCell`) */
function screenCell(scr, cx, cy) {
  const across = Math.ceil(scr.width / 32)
  const block = Math.floor(cx / 32) + Math.floor(cy / 32) * across
  const bw = Math.min(32, scr.width)
  return scr.cells[block * 32 * Math.min(32, scr.height) + (cy % 32) * bw + (cx % 32)] ?? 0
}

const OBJ_SIZE = [
  [[8, 8], [16, 16], [32, 32], [64, 64]],
  [[16, 8], [32, 8], [32, 16], [64, 32]],
  [[8, 16], [8, 32], [16, 32], [32, 64]],
]
const s8 = (v) => ((v & 0xff) >= 0x80 ? (v & 0xff) - 0x100 : v & 0xff)
const s9 = (v) => ((v & 0x1ff) >= 0x100 ? (v & 0x1ff) - 0x200 : v & 0x1ff)

function cellBank(raw) {
  const buf = lz77(raw)
  if (buf.subarray(0, 4).toString('ascii') !== 'RECN') throw new Error('NCER이 아니다')
  const k = 0x10
  const count = buf.readUInt16LE(k + 8)
  const attr = buf.readUInt16LE(k + 10)
  const at = k + 8 + buf.readUInt32LE(k + 12)
  const mapping = buf.readUInt32LE(k + 16)
  const stride = attr & 1 ? 16 : 8
  const oamBase = at + count * stride
  const cells = []
  for (let i = 0; i < count; i++) {
    const c = at + i * stride
    const n = buf.readUInt16LE(c)
    const first = buf.readUInt32LE(c + 4)
    const oams = []
    for (let j = 0; j < n; j++) {
      const o = oamBase + first + j * 6
      const a0 = buf.readUInt16LE(o), a1 = buf.readUInt16LE(o + 2), a2 = buf.readUInt16LE(o + 4)
      if (a0 & 0x2000) throw new Error('256색 OAM — 16색만 읽는다')
      const size = OBJ_SIZE[a0 >> 14]?.[a1 >> 14]
      if (size === undefined) throw new Error(`OAM 모양 ${a0 >> 14}`)
      const affine = (a0 & 0x100) !== 0
      oams.push({
        x: s9(a1), y: s8(a0), w: size[0], h: size[1],
        tile: (a2 & 0x3ff) << mapping, pal: a2 >> 12,
        hflip: !affine && (a1 & 0x1000) !== 0, vflip: !affine && (a1 & 0x2000) !== 0,
      })
    }
    cells.push(oams)
  }
  return { mapping, cells }
}

function cellAnims(raw) {
  const buf = lz77(raw)
  if (buf.subarray(0, 4).toString('ascii') !== 'RNAN') throw new Error('NANR이 아니다')
  const k = 0x10
  const count = buf.readUInt16LE(k + 8)
  const seqAt = k + 8 + buf.readUInt32LE(k + 12)
  const frameAt = k + 8 + buf.readUInt32LE(k + 16)
  const dataAt = k + 8 + buf.readUInt32LE(k + 20)
  const out = []
  for (let s = 0; s < count; s++) {
    const q = seqAt + s * 16
    const n = buf.readUInt16LE(q)
    const loop = buf.readUInt16LE(q + 2)
    const elem = buf.readUInt16LE(q + 4)
    const mode = buf.readUInt16LE(q + 8)
    const arr = frameAt + buf.readUInt32LE(q + 12)
    const frames = []
    for (let f = 0; f < n; f++) {
      const fo = arr + f * 8
      const d = dataAt + buf.readUInt32LE(fo)
      const time = buf.readUInt16LE(fo + 4)
      const cell = buf.readUInt16LE(d)
      const moved = elem === 2
      frames.push([cell, time, moved ? buf.readInt16LE(d + 4) : 0, moved ? buf.readInt16LE(d + 6) : 0])
    }
    out.push({ loop, mode, frames })
  }
  return out
}

function cellBox(oams) {
  if (oams.length === 0) return [0, 0, 1, 1]
  const x0 = Math.min(...oams.map((o) => o.x)), y0 = Math.min(...oams.map((o) => o.y))
  const x1 = Math.max(...oams.map((o) => o.x + o.w)), y1 = Math.max(...oams.map((o) => o.y + o.h))
  return [x0, y0, x1 - x0, y1 - y0]
}

function drawCell(rgba, sheetW, dx, dy, oams, tiles, pals) {
  const [x0, y0] = cellBox(oams)
  let solid = 0
  for (const o of [...oams].reverse()) {
    const across = o.w / TILE
    const pal = pals[o.pal] ?? []
    for (let ty = 0; ty < o.h / TILE; ty++) {
      for (let tx = 0; tx < across; tx++) {
        const t = o.tile + ty * across + tx
        for (let y = 0; y < TILE; y++) {
          for (let x = 0; x < TILE; x++) {
            const byte = tiles[t * TILE_BYTES + y * 4 + (x >> 1)]
            if (byte === undefined) continue
            const idx = x & 1 ? byte >> 4 : byte & 0xf
            if (idx === 0) continue
            const c = pal[idx]
            if (!c) continue
            let px = tx * TILE + x, py = ty * TILE + y
            if (o.hflip) px = o.w - 1 - px
            if (o.vflip) py = o.h - 1 - py
            const at = ((dy + o.y - y0 + py) * sheetW + dx + o.x - x0 + px) * 4
            rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]; rgba[at + 3] = 255
            solid++
          }
        }
      }
    }
  }
  return solid
}

module.exports = {
  TILE, TILE_BYTES, lz77, color, palettes, chars, screen, screenCell, cellBank, cellAnims, cellBox, drawCell,
}
