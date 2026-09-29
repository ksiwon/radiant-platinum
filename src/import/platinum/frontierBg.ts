// 배틀팩토리의 복도와 배틀룸 — 판 그림 (DATA.md §2.21g · `overlay104/frontier_scenes.c` · `frontier_graphics.c`)
//
// 시설 장면은 3D가 아니라 **2D 판 둘**이다 (`FRONTIER_SCENE_FACTORY_CORRIDOR` · `…_BATTLE_ROOM`). 아카이브는
// `frontier_bg.narc` 하나 — 0 타일(8비트 · 256×256 한 장) · 1 배틀룸 · 2 복도 · 3 복도 바닥(모두 NSCR) · 129 팔레트다.
// 팔레트는 256색 **다섯 벌**이고(확장 팔레트 3번 칸에 싣는다) 배치는 모두 0번 벌을 쓴다.
//
//   복도   BG3 = 복도(우선 2) · BG2 = 바닥(우선 3, 뒤) — 512×512 아핀 확장 판. 카메라가 (0,0)에 서서 왼쪽 위 256×192만 보인다.
//          바닥은 틱마다 y가 1씩 오르고 256에서 0으로 돈다(`BF_FUNC_UNK_31` — 컨베이어).
//   배틀룸 BG3 한 장(256×256). 불이 켜질 때 (3,10)부터 26×11칸을 팔레트 n으로 다시 칠한다(`BF_FUNC_UNK_30 n` · 0→4)
//
// 굽는 것: 복도 256×192(0번 색은 뚫는다 — 바닥이 비친다) · 바닥 256×512(끝까지 — 돌아가는 것을 이어 붙이려고) ·
// 배틀룸 256×192 다섯 장(팔레트 0~4). 바탕은 검정이다(`frontier_graphics.c` 686).
//
// 발밑 그림자도 여기서 굽는다 — 장면의 사람마다 `wifi2dchar.narc` 0 · 1 · 2(셀 · 애니 · 타일)로 그림자 스프라이트를 하나 더 세운다
// (`ov63_0222AE60.c` · `ov63_0222B7E8`). 팔레트는 **처음 실린 사람의 것**이라(`0x200 + v3`) 주인공 남 · 여(13 · 15번)로 두 장이다.
// 16×8이고 셀 원점이 (8, 5)다 — 사람 스프라이트 자리 + (8, 14)에 선다(`ov63_0222B238`)
//
// ⚠️ **아핀 확장 판은 한 줄로 이어 읽는다.** 글 BG(32×32칸 블록 · `ntrgfx.screenCell`)와 다르다 — 하드웨어가 폭 64칸이면
// 64칸씩 한 줄로 읽는다. 256폭 판은 두 읽기가 같다.
//
// ⚠️ **굽는 쪽 둘이 이 함수 하나를 부른다** — 노드 쪽(`tools/extract/frontierBg.mjs`)은 롬을 여는 자리만 다르다
import { narcEntry } from './nds'
import type { Rgb } from './nitrotex'
import { chars, maybeLz77, palettes, screen, TILE } from './ntrgfx'
import { cellBank, cellBox, drawCell } from './ntrcell'
import { encodePng } from './png'
import { check, readRomFile, type ConvertContext, type Produced } from './convertTypes'

const WIFI2DCHAR = '/graphic/wifi2dchar.narc'
const NARC = '/frontier/graphic/frontier_bg.narc'
/** `frontier_backgrounds.order`의 차례 */
const MEMBER = { tiles: 0, room: 1, corridor: 2, floor: 3, palette: 129 } as const
/** 팔레트 벌 수 (`meson.build` — `battle_factory_0.pal … 5`) */
const FACTORY_PALETTES = 5
const W = 256

/** 판 한 장을 찍는다 — 아핀 확장 판(8비트 · 한 줄 읽기). `palette`가 있으면 그 벌로 억지로 칠한다 */
function draw(
  rows: number, tiles: Uint8Array, scr: ReturnType<typeof screen>, pals: readonly Rgb[],
  transparent: boolean, palette?: number,
): Uint8Array {
  const rgba = new Uint8Array(W * rows * 4)
  for (let cy = 0; cy < rows / TILE; cy++) {
    for (let cx = 0; cx < W / TILE; cx++) {
      const cell = scr.cells[cy * scr.width + cx] ?? 0
      const tile = cell & 0x3ff, hflip = (cell & 0x400) !== 0, vflip = (cell & 0x800) !== 0
      const bank = palette ?? cell >> 12
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const sx = hflip ? TILE - 1 - x : x, sy = vflip ? TILE - 1 - y : y
          const idx = tiles[tile * 64 + sy * 8 + sx] ?? 0
          const o = ((cy * TILE + y) * W + cx * TILE + x) * 4
          if (idx === 0) {
            if (transparent) continue
            rgba[o + 3] = 255
            continue
          }
          const c = pals[bank * 256 + idx] ?? [0, 0, 0]
          rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255
        }
      }
    }
  }
  return rgba
}

export async function convertFrontierBg(ctx: ConvertContext): Promise<Produced> {
  const narc = await readRomFile(ctx, NARC)
  const take = (at: number): Uint8Array => {
    const b = narcEntry(narc, at)
    if (!b) throw new Error(`frontier_bg ${String(at)}번이 없다`)
    return maybeLz77(b)
  }
  const pals = palettes(take(MEMBER.palette)).flat()
  if (pals.length < 256 * FACTORY_PALETTES) {
    throw new Error(`battle_factory 팔레트가 ${String(pals.length)}색이다 — 256×${String(FACTORY_PALETTES)}라야 한다`)
  }
  const tiles = chars(take(MEMBER.tiles)).data
  const out: Produced = new Map()
  const corridor = screen(take(MEMBER.corridor))
  const floor = screen(take(MEMBER.floor))
  const room = screen(take(MEMBER.room))
  out.set('data/frontier/factoryCorridor.png', await encodePng(draw(192, tiles, corridor, pals, true), W, 192))
  out.set('data/frontier/factoryFloor.png', await encodePng(draw(floor.height * TILE, tiles, floor, pals, false), W, floor.height * TILE))
  for (let p = 0; p < FACTORY_PALETTES; p++) {
    out.set(`data/frontier/factoryRoom${String(p)}.png`, await encodePng(draw(192, tiles, room, pals, false, p), W, 192))
    check(ctx)
  }
  // 발밑 그림자 — 셀 0 · 타일 2 · 주인공 팔레트 (남 13 · 여 15)
  const chars2d = await readRomFile(ctx, WIFI2DCHAR)
  const take2d = (at: number): Uint8Array => {
    const b = narcEntry(chars2d, at)
    if (!b) throw new Error(`wifi2dchar ${String(at)}번이 없다`)
    return maybeLz77(b)
  }
  const shadow = cellBank(take2d(0)).cells[0]!
  const [, , sw, sh] = cellBox(shadow)
  for (const [name, pal] of [['shadowMale', 13], ['shadowFemale', 15]] as const) {
    const rgba = new Uint8Array(sw * sh * 4)
    drawCell(rgba, sw, 0, 0, shadow, chars(take2d(2)).data, palettes(take2d(pal)))
    out.set(`data/frontier/${name}.png`, await encodePng(rgba, sw, sh))
  }
  return out
}
