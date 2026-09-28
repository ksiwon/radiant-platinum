// NDS 셀(NCER)과 셀 애니(NANR) — 브라우저에서 (DATA.md §2.34)
//
// 화면에 붙는 스프라이트는 **셀** 하나가 OAM 여럿을 모은 것이고, 애니는 셀 번호와 머무는 프레임의 차례다.
// 여기서는 셀을 그 경계 상자만 한 그림으로 찍고, 애니는 [셀 · 프레임 수 · 옮김]으로 편다 — 화면 쪽이 원작
// `CellActor`처럼 그 차례로 셀을 갈아 끼운다.
//
// ⚠️ **`tools/extract/ntrcell.js`와 한 줄씩 같아야 한다.**
import type { Rgb } from './nitrotex'
import { maybeLz77, TILE, TILE_BYTES } from './ntrgfx'

/** OAM 모양 × 크기 → 폭·높이 (정사각 · 가로 · 세로) */
const OBJ_SIZE: readonly (readonly (readonly [number, number])[])[] = [
  [[8, 8], [16, 16], [32, 32], [64, 64]],
  [[16, 8], [32, 8], [32, 16], [64, 32]],
  [[8, 16], [8, 32], [16, 32], [32, 64]],
]

export interface Oam {
  x: number
  y: number
  w: number
  h: number
  /** 32바이트 타일 번호 — 매핑 단위를 곱해 둔 값이다 */
  tile: number
  pal: number
  hflip: boolean
  vflip: boolean
}

interface CellBank {
  /** 1D 매핑 단위 (0 32K · 1 64K · 2 128K · 3 256K) */
  mapping: number
  cells: Oam[][]
}

const magic = (b: Uint8Array): string => String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!)
const s8 = (v: number): number => (v & 0xff) >= 0x80 ? (v & 0xff) - 0x100 : v & 0xff
const s9 = (v: number): number => (v & 0x1ff) >= 0x100 ? (v & 0x1ff) - 0x200 : v & 0x1ff

/** NCER — 셀마다 OAM들. 256색 OAM이 있으면 멎는다(이 게임의 2D 화면은 다 16색이다) */
export function cellBank(raw: Uint8Array): CellBank {
  const buf = maybeLz77(raw)
  if (magic(buf) !== 'RECN') throw new Error('NCER이 아니다')
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const k = 0x10
  const count = v.getUint16(k + 8, true)
  const attr = v.getUint16(k + 10, true)
  const at = k + 8 + v.getUint32(k + 12, true)
  const mapping = v.getUint32(k + 16, true)
  const stride = attr & 1 ? 16 : 8
  const oamBase = at + count * stride
  const cells: Oam[][] = []
  for (let i = 0; i < count; i++) {
    const c = at + i * stride
    const n = v.getUint16(c, true)
    const first = v.getUint32(c + 4, true)
    const oams: Oam[] = []
    for (let j = 0; j < n; j++) {
      const o = oamBase + first + j * 6
      const a0 = v.getUint16(o, true), a1 = v.getUint16(o + 2, true), a2 = v.getUint16(o + 4, true)
      if (a0 & 0x2000) throw new Error('256색 OAM — 16색만 읽는다')
      const size = OBJ_SIZE[a0 >> 14]?.[a1 >> 14]
      if (size === undefined) throw new Error(`OAM 모양 ${String(a0 >> 14)}`)
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

/** 애니 한 프레임 — [셀 · 머무는 프레임 · 옮김 x · y] */
type AnimFrame = [number, number, number, number]

interface CellAnim {
  /** 되감을 자리 (`loopStartFrame`) */
  loop: number
  /** 재생 방식 (`NNSG2dAnimationPlayMode` — 1 한 번 · 2 되풀이 · 3 왕복 한 번 · 4 왕복 되풀이) */
  mode: number
  frames: AnimFrame[]
}

/** NANR — 셀 애니들 (`ABNK`). 셀 번호 말고 회전 · 크기는 이 게임의 슬롯에 없어서 옮김만 읽는다 */
export function cellAnims(raw: Uint8Array): CellAnim[] {
  const buf = maybeLz77(raw)
  if (magic(buf) !== 'RNAN') throw new Error('NANR이 아니다')
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const k = 0x10
  const count = v.getUint16(k + 8, true)
  const seqAt = k + 8 + v.getUint32(k + 12, true)
  const frameAt = k + 8 + v.getUint32(k + 16, true)
  const dataAt = k + 8 + v.getUint32(k + 20, true)
  const out: CellAnim[] = []
  for (let s = 0; s < count; s++) {
    const q = seqAt + s * 16
    const n = v.getUint16(q, true)
    const loop = v.getUint16(q + 2, true)
    const elem = v.getUint16(q + 4, true)
    const mode = v.getUint16(q + 8, true)
    const arr = frameAt + v.getUint32(q + 12, true)
    const frames: AnimFrame[] = []
    for (let f = 0; f < n; f++) {
      const fo = arr + f * 8
      const d = dataAt + v.getUint32(fo, true)
      const time = v.getUint16(fo + 4, true)
      const cell = v.getUint16(d, true)
      const moved = elem === 2
      frames.push([cell, time, moved ? v.getInt16(d + 4, true) : 0, moved ? v.getInt16(d + 6, true) : 0])
    }
    out.push({ loop, mode, frames })
  }
  return out
}

/** 셀의 경계 상자 — [왼쪽 · 위 · 폭 · 높이]. OAM이 없으면 1×1 */
export function cellBox(oams: readonly Oam[]): [number, number, number, number] {
  if (oams.length === 0) return [0, 0, 1, 1]
  const x0 = Math.min(...oams.map((o) => o.x)), y0 = Math.min(...oams.map((o) => o.y))
  const x1 = Math.max(...oams.map((o) => o.x + o.w)), y1 = Math.max(...oams.map((o) => o.y + o.h))
  return [x0, y0, x1 - x0, y1 - y0]
}

/**
 * 셀 하나를 그림판의 `(dx, dy)`에 찍는다 — `dx`가 경계 상자의 왼쪽 위다.
 * ⚠️ **뒤 OAM부터 찍는다** — 겹치면 앞 번호가 위다. 0번 색은 뚫는다
 */
export function drawCell(
  rgba: Uint8Array, sheetW: number, dx: number, dy: number,
  oams: readonly Oam[], tiles: Uint8Array, pals: readonly (readonly Rgb[])[],
): number {
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
