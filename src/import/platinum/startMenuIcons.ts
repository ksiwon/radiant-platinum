// 시작 메뉴 아이콘 — 브라우저에서 (`start_menu.c` · `/graphic/menu_gra.narc`)
//
// ⚠️ **`tools/extract/startMenuIcons.js`와 한 줄씩 같아야 한다.** 머리말(칸 번호 · 칸 차례 · 컬러 · 회색 줄)은 그쪽에 있다
import { narcCount, narcEntry } from './nds'
import { cellBank, drawCell } from './ntrcell'
import { chars, maybeLz77, palettes } from './ntrgfx'
import { encodePng } from './png'
import { check, json, readRomFile, type ConvertContext, type Produced } from './convertTypes'

const MEMBERS = 11
const ANIMS = 3
const CELLS = 4
const PALETTE = 5
const TILES = 6
const ICONS = 10
const CELL = 32
const PITCH = 33
const GRAY_ROW = 0
const COLOR_ROW = 1
const ANIM_PER_ICON = 3
/** `StartMenuOption` 차례 (여자 가방이 마지막) */
const ORDER = ['pokedex', 'pokemon', 'bag', 'trainerCase', 'save', 'options', 'exit', 'chat', 'retire', 'bagFemale']

interface Srt {
  mode: number
  frames: [number, number, number][]
}

/** NANR의 SRT 순서 하나를 `[프레임 수, 배율, 도]` 열로. 자료 모양은 노드 쪽 머리말에 있다 */
function srtFrames(buf: Uint8Array, seq: number): Srt {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const k = 0x10
  const seqAt = k + 8 + v.getUint32(k + 12, true)
  const frameAt = k + 8 + v.getUint32(k + 16, true)
  const dataAt = k + 8 + v.getUint32(k + 20, true)
  const q = seqAt + seq * 16
  const n = v.getUint16(q, true)
  const elem = v.getUint16(q + 4, true)
  const mode = v.getUint16(q + 8, true)
  if (elem !== 1) throw new Error(`순서 ${String(seq)}가 SRT가 아니다 (요소 ${String(elem)})`)
  const arr = frameAt + v.getUint32(q + 12, true)
  const frames: [number, number, number][] = []
  for (let f = 0; f < n; f++) {
    const fo = arr + f * 8
    const d = dataAt + v.getUint32(fo, true)
    const time = v.getUint16(fo + 4, true)
    // 부호 있는 회전 — 65536이 한 바퀴라 반대로 도는 값은 위쪽 절반에 있다
    const rot = v.getInt16(d + 2, true)
    const sx = v.getInt32(d + 4, true), sy = v.getInt32(d + 8, true)
    if (sx !== sy) throw new Error(`순서 ${String(seq)}의 가로 · 세로 배율이 다르다`)
    if (v.getInt16(d + 12, true) !== 0 || v.getInt16(d + 14, true) !== 0) {
      throw new Error(`순서 ${String(seq)}가 옮긴다`)
    }
    frames.push([time, Math.round((sx / 4096) * 10000) / 10000, Math.round((rot / 65536) * 360 * 1000) / 1000])
  }
  return { mode, frames }
}

export async function convertStartMenuIcons(ctx: ConvertContext): Promise<Produced> {
  const narc = await readRomFile(ctx, '/graphic/menu_gra.narc')
  if (narcCount(narc) !== MEMBERS) {
    throw new Error(`menu_gra가 ${String(narcCount(narc))}칸이다 — ${String(MEMBERS)}칸이라야 한다`)
  }
  const take = (at: number): Uint8Array => {
    const b = narcEntry(narc, at)
    if (!b) throw new Error(`menu_gra에 ${String(at)}번 칸이 없다`)
    return b
  }
  const pal = palettes(take(PALETTE))
  const tiles = chars(maybeLz77(take(TILES))).data
  const { cells } = cellBank(take(CELLS))
  if (cells.length !== ICONS) throw new Error(`아이콘 셀이 ${String(cells.length)}개다 — ${String(ICONS)}개라야 한다`)

  const w = CELL * 2, h = PITCH * ICONS - (PITCH - CELL)
  const rgba = new Uint8Array(w * h * 4)
  cells.forEach((oams, i) => {
    // 셀 하나가 OAM 하나(32×32)이고 팔레트 줄은 0이다 — `plttIdx`가 거기에 1 · 0을 더해 컬러 · 회색이 갈린다
    if (oams.length !== 1 || oams[0]!.w !== CELL || oams[0]!.h !== CELL || oams[0]!.pal !== 0) {
      throw new Error(`아이콘 셀 ${String(i)}가 32×32 하나가 아니다`)
    }
    for (const [col, row] of [[0, COLOR_ROW], [1, GRAY_ROW]] as const) {
      const one = new Uint8Array(CELL * CELL * 4)
      if (drawCell(one, CELL, 0, 0, oams, tiles, [pal[row]!.slice()]) === 0) throw new Error(`아이콘 ${String(i)}가 비었다`)
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const s = (y * CELL + x) * 4, d = ((i * PITCH + y) * w + col * CELL + x) * 4
          rgba[d] = one[s]!; rgba[d + 1] = one[s + 1]!; rgba[d + 2] = one[s + 2]!; rgba[d + 3] = one[s + 3]!
        }
      }
    }
  })
  check(ctx)

  // 움직임 — 열 아이콘이 같은 값이어야 하나로 줄인다
  const anim = maybeLz77(take(ANIMS))
  const pick = (off: number): Srt[] =>
    Array.from({ length: ICONS }, (_, i) => srtFrames(anim, i * ANIM_PER_ICON + off))
  const same = (list: Srt[]): boolean => list.every((s) => JSON.stringify(s) === JSON.stringify(list[0]))
  const swell = pick(1), wiggle = pick(2)
  if (!same(swell) || !same(wiggle)) throw new Error('아이콘마다 움직임이 다르다 — 하나로 줄일 수 없다')
  return new Map([
    [`data/startMenuIcons.${ctx.locale}.png`, await encodePng(rgba, w, h)],
    ['data/startMenuIcons.json', json({
      cell: CELL, pitch: PITCH, order: ORDER, grayX: CELL,
      swell: { once: swell[0]!.mode === 1, frames: swell[0]!.frames },
      wiggle: { loop: wiggle[0]!.mode === 2, frames: wiggle[0]!.frames },
    })],
  ])
}
