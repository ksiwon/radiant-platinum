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
import { creditsLocator, type CreditsSite } from './validate'
import { maybeLz77, palettes, chars, screen, drawTile, TILE } from './ntrgfx'
import { encodePng } from './png'
import {
  breathe, check, json, put, readRomFile, type ConvertContext, type Produced,
} from './convertTypes'

const NARC = '/graphic/ending.narc'

/** 배치표 한 줄 — `{줄번호 u16, 띠 위 y u16, 가운데정렬 u16}` */
const ROW_BYTES = 6

/**
 * 크레딧 두루마리의 **배치표**를 오버레이에서 읽는다 (PARITY §8.12).
 *
 * ⚠️ **지역판마다 다른 표다.** 한동안 미국 오버레이에서 구운 237줄을 뱅크 길이로
 * 잘라 썼는데, 그것으로는 두 판이 틀린다 — 일본판은 목록이 127번째 줄부터 아예
 * 갈려서 y 간격이 **열네 자리** 어긋나고, 한국판은 뱅크가 237칸이지만 뒤 28칸이
 * 비어 있어 아무것도 없는 화면이 28줄만큼 흐른다. 줄 수(237 · 209 · 184)도
 * 마지막 자리(7581 · 7530 · 7544)도 다르다.
 *
 * ⚠️ **자리를 그냥 믿지 않는다.** `supported.json`이 적어 준 자리에서 읽되
 * **표 자신의 모양으로 되짚는다** — 줄 번호가 0부터 하나씩 오르고, y가 뒤로
 * 가며 줄지 않고, 가운데 정렬 칸이 0이나 1이고, 적힌 줄 수에서 정확히 끊긴다.
 * 상금표가 0 패딩 위에서 검사를 통과했던 자리라(`supported.json`의 `prizeNote`)
 * 모양 검사를 표 자신에게서 받는다
 */
export function creditRows(
  overlay: Uint8Array, site: CreditsSite,
): { at: number; centered: boolean }[] {
  const view = new DataView(overlay.buffer, overlay.byteOffset, overlay.byteLength)
  const need = site.offset + (site.rows + 1) * ROW_BYTES
  if (site.offset < 0 || need > overlay.byteLength) {
    throw new Error(`크레딧 배치표가 오버레이 밖이다 (0x${site.offset.toString(16)} · ${String(site.rows)}줄)`)
  }

  const rows: { at: number; centered: boolean }[] = []
  let last = -1
  for (let i = 0; i < site.rows; i++) {
    const p = site.offset + i * ROW_BYTES
    const line = view.getUint16(p, true)
    const y = view.getUint16(p + 2, true)
    const centered = view.getUint16(p + 4, true)
    if (line !== i) throw new Error(`크레딧 배치표 ${String(i)}번째 줄 번호가 ${String(line)}이다`)
    if (y < last) throw new Error(`크레딧 배치표 ${String(i)}번째 자리 ${String(y)}가 앞보다 위다`)
    if (centered > 1) throw new Error(`크레딧 배치표 ${String(i)}번째 정렬 값이 ${String(centered)}이다`)
    last = y
    rows.push({ at: y, centered: centered !== 0 })
  }
  // ⚠️ **끊기는 자리까지 봐야 줄 수가 확정된다.** 여기를 안 보면 「앞 n줄이
  // 맞더라」만 확인한 것이라, 우리 표의 줄 수가 틀려도 조용히 지나간다
  const after = view.getUint16(site.offset + site.rows * ROW_BYTES, true)
  if (after === site.rows) {
    throw new Error(`크레딧 배치표가 ${String(site.rows)}줄에서 안 끝난다 — 더 이어진다`)
  }
  return rows
}

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

  // ⚠️ **배치표는 설치한 판 하나만 나온다.** 노드 쪽(`tools/extract/credits.js`)은
  // 롬 셋을 열어 세 벌을 굽지만 설치본에는 롬이 하나뿐이다 (`pokedex.ts`와 같다)
  const site = creditsLocator(ctx.release)
  const overlay = await ctx.fs.overlay(site.overlay)
  if (!overlay) throw new Error(`오버레이 ${String(site.overlay)}을 못 읽었다`)
  put(ctx, out, `data/credits.${ctx.locale}.json`, json({ rows: creditRows(overlay, site) }))

  ctx.onProgress?.(COUNT + 1, COUNT + 1)
  return out
}
