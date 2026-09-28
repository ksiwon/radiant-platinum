// 깨어진 세계의 하늘 — 브라우저에서 (DATA.md §2.22b · PARITY §8.6b)
//
// `/data/tw_arc_etc.narc` 하나에 다 들어 있다 (`ov9_02249960.c`의 `InitSkyBackground` · `InitSkyClouds`):
//
//   0 NCGR · 1 NCLR · 2 NSCR    하늘 배경(BG2) — 32×32칸 중 화면에 보이는 위 24줄(256×192). 팔레트 0 한 벌
//   3·6·…·0x15 NCER             구름 셀 일곱. 셀마다 한 칸이고 OAM이 한둘이다(좌우로 뒤집어 붙인 판)
//   4·7·…·0x16 NCGR             그 셀의 타일. 1D 매핑이라 OAM의 타일이 차례로 놓인다
//   5·8·…·0x17 NANR             애니 — **일곱 다 한 프레임**이다(셀 0에 멈춰 있다). 그래서 굽지 않는다
//   0x18 NCLR                   구름 팔레트. 다섯 벌을 싣는다 (`AddPaletteFrom(…, 5, …)`)
//
// 한 장(256 폭)에 하늘을 위에 놓고 구름 일곱을 그 아래에 줄지어 놓는다. 구름 칸마다 **셀 원점이 칸 안 어디인지**
// 적는다 — 원작은 셀 원점을 스프라이트 자리로 삼고 그 둘레로 돌리고 키운다.
//
// 색은 원작 5비트를 8비트로 편 값 그대로다(`color`) — 실행 중에 `>> 3`으로 되돌려 원작 식대로 어둡게 한다
// (`CalculateTintedColor` · `engine/world/distortionSky`). 구름의 0번 색은 뚫는다.
//
// ⚠️ **노드 쪽(`tools/extract/distortion.js`의 `extractSky`)과 한 줄씩 같아야 한다.**
import { narcEntry } from './nds'
import { encodePng } from './png'
import type { Rgb } from './nitrotex'
import { chars, palettes, screen, drawTile, TILE, TILE_BYTES } from './ntrgfx'

export const SKY_NARC = '/data/tw_arc_etc.narc'

/** 화면 한 장 */
const SCREEN_W = 256
const SCREEN_H = 192
/** 구름 자원 일곱의 멤버 번호 (`sSkyCloudsCellNARCIndexes` · `…CharNARCIndexes`) */
const CLOUD_CELLS = [0x3, 0x6, 0x9, 0xc, 0xf, 0x12, 0x15] as const
const CLOUD_CHARS = [0x4, 0x7, 0xa, 0xd, 0x10, 0x13, 0x16] as const
const CLOUD_PALETTE = 0x18
/** 싣는 벌 수 (`SKY_CLOUD_PALETTE_COUNT`) */
const CLOUD_PALETTES = 5

/** OAM 모양 × 크기 → 폭·높이 (정사각 · 가로 · 세로) */
const OBJ_SIZE: readonly (readonly (readonly [number, number])[])[] = [
  [[8, 8], [16, 16], [32, 32], [64, 64]],
  [[16, 8], [32, 8], [32, 16], [64, 32]],
  [[8, 16], [8, 32], [16, 32], [32, 64]],
]

interface Oam { x: number, y: number, w: number, h: number, tile: number, pal: number, hflip: boolean, vflip: boolean }

/** 9비트 · 8비트 부호 */
const s9 = (v: number): number => (v & 0x100 ? (v & 0x1ff) - 0x200 : v & 0x1ff)
const s8 = (v: number): number => (v & 0x80 ? (v & 0xff) - 0x100 : v & 0xff)

/** NCER — 셀 하나의 OAM들. 셀이 하나가 아니거나 확장 경계가 있으면 멎는다 */
function cellOams(buf: Uint8Array): Oam[] {
  const magic = String.fromCharCode(buf[0]!, buf[1]!, buf[2]!, buf[3]!)
  if (magic !== 'RECN') throw new Error('NCER이 아니다')
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const cells = v.getUint16(0x18, true)
  const bank = v.getUint16(0x1a, true)
  if (cells !== 1 || bank !== 0) throw new Error(`셀 ${String(cells)}개 · 갈래 ${String(bank)} — 한 칸짜리가 아니다`)
  const at = 0x18 + v.getUint32(0x1c, true)
  const count = v.getUint16(at, true)
  const oamAt = at + 8 + v.getUint32(at + 4, true)
  const out: Oam[] = []
  for (let k = 0; k < count; k++) {
    const a0 = v.getUint16(oamAt + k * 6, true)
    const a1 = v.getUint16(oamAt + k * 6 + 2, true)
    const a2 = v.getUint16(oamAt + k * 6 + 4, true)
    if (a0 & 0x2000) throw new Error('256색 OAM — 16색만 읽는다')
    const size = OBJ_SIZE[a0 >> 14]?.[a1 >> 14]
    if (size === undefined) throw new Error(`OAM 모양 ${String(a0 >> 14)}`)
    out.push({
      x: s9(a1), y: s8(a0), w: size[0], h: size[1],
      tile: a2 & 0x3ff, pal: a2 >> 12,
      hflip: (a1 & 0x1000) !== 0, vflip: (a1 & 0x2000) !== 0,
    })
  }
  return out
}

/** 한 칸: 장 안의 자리 · 크기 · 셀 원점(칸 왼쪽 위에서) */
type SkyRect = [x: number, y: number, w: number, h: number]
type CloudRect = [x: number, y: number, w: number, h: number, ox: number, oy: number]

export interface SkySheet { width: number, height: number, sky: SkyRect, clouds: CloudRect[] }

export async function bakeDistortionSky(narc: Uint8Array): Promise<{ png: Uint8Array, sheet: SkySheet }> {
  const take = (i: number): Uint8Array => {
    const b = narcEntry(narc, i)
    if (!b) throw new Error(`${SKY_NARC} ${String(i)}번이 없다`)
    return b
  }

  // 하늘 — 팔레트 0 한 벌만 싣는다 (`Bg_LoadPalette(…, PALETTE_SIZE_BYTES, 0)`)
  const skyPal = palettes(take(1))[0]!
  const skyChr = chars(take(0))
  const skyScr = screen(take(2))
  if (skyScr.width < SCREEN_W / TILE || skyScr.height < SCREEN_H / TILE) throw new Error('하늘 배치가 화면보다 작다')

  // 구름 — 칸마다 OAM 경계를 재 둔다
  const cloudPals = palettes(take(CLOUD_PALETTE)).slice(0, CLOUD_PALETTES)
  const clouds = CLOUD_CELLS.map((c, i) => {
    const oams = cellOams(take(c))
    const data = chars(take(CLOUD_CHARS[i]!)).data
    const x0 = Math.min(...oams.map((o) => o.x)), y0 = Math.min(...oams.map((o) => o.y))
    const x1 = Math.max(...oams.map((o) => o.x + o.w)), y1 = Math.max(...oams.map((o) => o.y + o.h))
    return { oams, data, x0, y0, w: x1 - x0, h: y1 - y0 }
  })

  // 선반 쌓기 — 하늘 아래에 왼쪽부터 늘어놓고, 폭이 넘치면 다음 줄
  const rects: CloudRect[] = []
  let cx = 0, cy = SCREEN_H, row = 0
  for (const c of clouds) {
    if (cx + c.w > SCREEN_W) { cx = 0; cy += row; row = 0 }
    rects.push([cx, cy, c.w, c.h, -c.x0, -c.y0])
    cx += c.w
    row = Math.max(row, c.h)
  }
  const width = SCREEN_W, height = cy + row
  const rgba = new Uint8Array(width * height * 4)

  for (let ty = 0; ty < SCREEN_H / TILE; ty++) {
    for (let tx = 0; tx < SCREEN_W / TILE; tx++) {
      const cell = skyScr.cells[ty * skyScr.width + tx]!
      if (cell >> 12 !== 0) throw new Error(`하늘 칸 (${String(tx)},${String(ty)})이 팔레트 ${String(cell >> 12)}을 쓴다 — 0만 싣는다`)
      drawTile(rgba, width, tx * TILE, ty * TILE, skyChr.data, cell & 0x3ff, skyPal, {
        hflip: (cell & 0x400) !== 0, vflip: (cell & 0x800) !== 0,
      })
    }
  }

  for (const [i, c] of clouds.entries()) {
    const [rx, ry, , , ox, oy] = rects[i]!
    // ⚠️ **뒤 OAM부터 찍는다** — 겹치면 앞 번호가 위다 (1픽셀씩 겹치는 셀이 있다)
    for (const o of [...c.oams].reverse()) {
      const pal: readonly Rgb[] = cloudPals[o.pal] ?? []
      const across = o.w / TILE
      for (let t = 0; t < across * (o.h / TILE); t++) {
        const col = t % across, rowT = Math.floor(t / across)
        const px = o.hflip ? across - 1 - col : col
        const py = o.vflip ? o.h / TILE - 1 - rowT : rowT
        const tile = o.tile + t
        if ((tile + 1) * TILE_BYTES > c.data.length) throw new Error(`구름 ${String(i)}: 타일 ${String(tile)}이 없다`)
        drawTile(rgba, width, rx + ox + o.x + px * TILE, ry + oy + o.y + py * TILE, c.data, tile, pal, {
          hflip: o.hflip, vflip: o.vflip, alphaZero: true, skipZero: true,
        })
      }
    }
  }

  return {
    png: await encodePng(rgba, width, height),
    sheet: { width, height, sky: [0, 0, SCREEN_W, SCREEN_H], clouds: rects },
  }
}
