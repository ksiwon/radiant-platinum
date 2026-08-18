// 크레딧 배경 세 장 — 브라우저에서 (DATA.md §2.26)
//
// 엔딩이 흐르는 동안 뒤에 서 있는 그림이다. 없으면 크레딧이 검은 판 위의
// 글자만 된다.
//
// graphic/ending.narc의 파일 셋이 배경 한 장이다 (`overlay099/ov99_021D1A54.c`):
//
//   팔레트 18+k   타일 9+k   배치 3+k     (위 화면)
//
// ⚠️ **위 화면 것만 쓴다.** 아래 화면(팔레트 21+k · 타일 12+k · 배치 6+k)에도
// 같은 하늘이 깔리는데, 그쪽은 **3D 장면이 그 위에 서는 판**이다
// (`gSystem.whichScreenIs3D = DS_SCREEN_SUB`). 두 장을 위아래로 이어 붙이면
// 하늘이 두 번 나오는 그림이 된다. 그 3D 장면 일곱은 아직 없다 (PARITY §8.12).
//
// ⚠️ **팔레트가 한 파일에 여럿이다.** 16색짜리 두세 벌이 들어 있고 어느 벌을
// 쓸지는 **배치 칸의 위 4비트**가 정한다 — 한 벌만 읽으면 그림 절반이 딴 색이 된다.
//
// ⚠️ **장마다 크기가 다르고 그래서 파일도 따로다.** 첫 장이 512×256이고 나머지
// 둘이 256×256인데, 화면(256×192)보다 큰 것은 **흐르라고** 그렇다 — 화면이 이
// 그림을 감아 돌려야 하므로(`background-repeat`) 한 장에 모아 두면 옆 장이
// 딸려 나온다.
//
// ⚠️ **노드 쪽(`tools/extract/credits.js`)과 픽셀로 같아야 한다.** PNG 바이트는
// deflate 구현이 달라 안 맞는다 (`png.ts` 머리말)
import { narcEntry } from './nds'
import { maybeLz77, palettes, chars, screen, drawTile, TILE } from './ntrgfx'
import { encodePng } from './png'
import {
  breathe, check, json, put, readRomFile, type ConvertContext, type Produced,
} from './convertTypes'

const NARC = '/graphic/ending.narc'

/** 장수. 일곱 장면이 이 셋을 돌려 쓴다 */
const COUNT = 3
/** 위 화면의 첫 파일 번호 — 팔레트·타일·배치 */
const TOP = { pal: 18, chr: 9, scr: 3 }
/** DS 화면 한 판 (`HW_LCD_WIDTH` × `HW_LCD_HEIGHT`) */
const SCREEN_W = 256
const SCREEN_H = 192

const member = (narc: Uint8Array, at: number): Uint8Array => {
  const buf = narcEntry(narc, at)
  if (!buf) throw new Error(`${NARC}에 ${String(at)}번 멤버가 없다`)
  return maybeLz77(buf)
}

export async function convertCredits(ctx: ConvertContext): Promise<Produced> {
  const narc = await readRomFile(ctx, NARC)
  const out: Produced = new Map()
  const scenes: { w: number, h: number }[] = []

  for (let k = 0; k < COUNT; k++) {
    const pals = palettes(member(narc, TOP.pal + k))
    const chr = chars(member(narc, TOP.chr + k))
    const scr = screen(member(narc, TOP.scr + k))
    const w = scr.width * TILE, h = scr.height * TILE
    if (w < SCREEN_W || h < SCREEN_H) {
      throw new Error(`${String(k)}장째가 ${String(w)}×${String(h)}픽셀이다 — 화면보다 작다`)
    }
    scenes.push({ w, h })

    const rgba = new Uint8Array(w * h * 4)
    for (let c = 0; c < scr.cells.length; c++) {
      const cell = scr.cells[c]!
      drawTile(
        rgba, w, (c % scr.width) * TILE, Math.floor(c / scr.width) * TILE,
        chr.data, cell & 0x3ff, pals[(cell >> 12) & 0xf] ?? [],
        { hflip: (cell & 0x400) !== 0, vflip: (cell & 0x800) !== 0 },
      )
    }
    put(ctx, out, `data/credits${String(k)}.png`, await encodePng(rgba, w, h))
    ctx.onProgress?.(k + 1, COUNT + 1)
    await breathe(ctx)
  }

  check(ctx)
  put(ctx, out, 'data/credits.json', json({ count: COUNT, scenes }))
  ctx.onProgress?.(COUNT + 1, COUNT + 1)
  return out
}
