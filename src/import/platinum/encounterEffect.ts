// 조우 컷인의 그림 (`graphic/field_encounteffect.narc` · `overlay005/encounter_effect*.c` · DATA.md §2.21i)
//
// 멤버 차례는 `res/trainers/classes/field_encounteffect.order`(줄 번호 − 1)다. 굽는 것:
//
//   ballSmall · ballBig        트레이너 컷인의 몬스터볼 (2 · 4 / 5 · 7, 팔레트 0) — 큰 공은 윗반(셀 1) · 아랫반(셀 2)을 나눠 쓴다
//   vsSolid · vsOutline        VS 표 (52 · 53 셀 0 · 1, 팔레트 51)
//   galactic                   갤럭시 간부의 「G」 (8 · 10, 팔레트 1)
//   leaderN · leaderNBanner    관장 여덟 — 얼굴(96×64 · 55 + 4i …)과 띠(BG 배치 17 + 3i의 5~12줄 · 256×64)
//   eliteN · eliteNBanner      사천왕 넷 · 챔피언 — 얼굴(87 · 91 · 95 · 99 · 103)과 리그 띠(40 · 41 셀 23개 · 팔레트 39 · 43 · 44 · 45 · 46)
//   playerMale · playerFemale  사천왕전의 주인공 얼굴(147 · 151) — ⚠️ **원작은 얼굴 팔레트가 아니라 트레이너 앞모습 팔레트를 쓴다**
//                              (`EncounterEffect_BlendTrainerSpritePltt` → `trfgra.narc` 1 + 종류 × 5). 주인공은 둘이 달라서 그것으로 굽는다.
//                              어두울 때는 성별을 **뒤바꿔** 싣는다(원작 버그) — `…Swap`이 그것이다
//   eliteParticle1 · 2.spa     사천왕전의 입자 (107 `elite_particle_1` · 108 `elite_particle_2`) — 바이트 그대로, 읽는 것은
//                              실행 중에 `engine/battle/spl/resource`가 한다 (입자 묶음 `particles.ts`와 같은 방식)
//
// 셀 그림은 셀의 경계 상자 크기로 찍고 목차(`index.json`)가 경계 상자의 왼쪽 위(셀 원점 기준)를 든다 — 원작 스프라이트는 셀 원점에 선다.
//
// ⚠️ **굽는 쪽 둘이 이 함수 하나를 부른다** — 노드 쪽(`tools/extract/encounterEffect.mjs`)은 롬을 여는 자리만 다르다
import { narcEntry } from './nds'
import type { Rgb } from './nitrotex'
import { chars, drawTile, maybeLz77, palettes, screen, screenCell, TILE } from './ntrgfx'
import { cellBank, cellBox, drawCell } from './ntrcell'
import { encodePng } from './png'
import { check, json, readRomFile, type ConvertContext, type Produced } from './convertTypes'

const NARC = '/graphic/field_encounteffect.narc'
const TRFGRA = '/poketool/trgra/trfgra.narc'

/** 관장 여덟 (`sGymLeaderEncounterParams` · EC:2607) — 얼굴 팔레트 번호 · 띠 팔레트 번호 */
const LEADERS = [55, 59, 63, 67, 71, 75, 79, 83].map((mug, i) => ({ mug, banner: 15 + i * 3 }))
/** 사천왕 넷 · 챔피언 (`sEliteFourChampionEncounterParams` · EC:2730) */
const ELITES = [[87, 39], [91, 43], [95, 44], [99, 45], [103, 46]].map(([mug, banner]) => ({ mug: mug!, banner: banner! }))
/** 리그 띠의 타일 · 셀 */
const LEAGUE = { tiles: 40, cells: 41 }
/** 주인공 얼굴 — 남 · 여 (EC:3233-3241) */
const PLAYER_MUG = [147, 151] as const
/** 사천왕전의 입자 (`ov5_021DF0CC(narc, 107 · 108)`) */
const ELITE_PARTICLES = [107, 108] as const
/** 띠가 서는 BG 줄 — 배치 256×256의 5~12줄(y 40~103)만 차 있다 */
const BANNER_ROWS = [5, 13] as const

interface CellImage { file: string, x: number, y: number, w: number, h: number }

export async function convertEncounterEffect(ctx: ConvertContext): Promise<Produced> {
  const narc = await readRomFile(ctx, NARC)
  const trfgra = await readRomFile(ctx, TRFGRA)
  const take = (at: number, from = narc): Uint8Array => {
    const b = narcEntry(from, at)
    if (!b) throw new Error(`field_encounteffect ${String(at)}번이 없다`)
    return maybeLz77(b)
  }
  const out: Produced = new Map()
  const index: Record<string, CellImage | CellImage[]> = {}

  /** 셀 하나를 제 경계 상자로 찍는다 */
  const cellPng = async (name: string, tiles: number, cells: number, cell: number, pals: readonly (readonly Rgb[])[]): Promise<CellImage> => {
    const bank = cellBank(take(cells))
    const oams = bank.cells[cell]
    if (!oams) throw new Error(`${name}: 셀 ${String(cell)}이 없다`)
    const [x, y, w, h] = cellBox(oams)
    const rgba = new Uint8Array(w * h * 4)
    drawCell(rgba, w, 0, 0, oams, chars(take(tiles)).data, pals)
    const file = `data/encounterEffect/${name}.png`
    out.set(file, await encodePng(rgba, w, h))
    return { file, x, y, w, h }
  }

  const trainerPal = palettes(take(0))
  index.ballSmall = await cellPng('ballSmall', 2, 4, 0, trainerPal)
  index.ballBig = await cellPng('ballBig', 5, 7, 0, trainerPal)
  const vsPal = palettes(take(51))
  index.vsSolid = await cellPng('vsSolid', 52, 53, 0, vsPal)
  index.vsOutline = await cellPng('vsOutline', 52, 53, 1, vsPal)
  index.galactic = await cellPng('galactic', 8, 10, 0, palettes(take(1)))
  check(ctx)

  for (const [i, l] of LEADERS.entries()) {
    index[`leader${String(i)}`] = await cellPng(`leader${String(i)}`, l.mug + 1, l.mug + 2, 0, palettes(take(l.mug)))
    // 띠 — 팔레트를 0번으로 다시 매기고(`ov5_021DE3D0`) 타일 0은 비운다
    const pal = palettes(take(l.banner))[0]!
    const data = chars(take(l.banner + 1)).data
    const scr = screen(take(l.banner + 2))
    const rows = BANNER_ROWS[1] - BANNER_ROWS[0]
    const rgba = new Uint8Array(256 * rows * TILE * 4)
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < 32; cx++) {
        const cell = screenCell(scr, cx, cy + BANNER_ROWS[0])
        const tile = cell & 0x3ff
        if (tile === 0) continue
        drawTile(rgba, 256, cx * TILE, cy * TILE, data, tile, pal, {
          hflip: (cell & 0x400) !== 0, vflip: (cell & 0x800) !== 0, alphaZero: true,
        })
      }
    }
    const file = `data/encounterEffect/leader${String(i)}Banner.png`
    out.set(file, await encodePng(rgba, 256, rows * TILE))
    index[`leader${String(i)}Banner`] = { file, x: 0, y: BANNER_ROWS[0] * TILE, w: 256, h: rows * TILE }
    check(ctx)
  }

  for (const [i, e] of ELITES.entries()) {
    index[`elite${String(i)}`] = await cellPng(`elite${String(i)}`, e.mug + 1, e.mug + 2, 0, palettes(take(e.mug)))
    // 리그 띠 — 셀 23개를 한 장에 세로로 (셀 i가 팔레트 i · 12~22는 180° 돈 것)
    const pals = palettes(take(e.banner))
    const bank = cellBank(take(LEAGUE.cells))
    const tiles = chars(take(LEAGUE.tiles)).data
    const [x, y, w, h] = cellBox(bank.cells[0]!)
    const rgba = new Uint8Array(w * h * bank.cells.length * 4)
    for (const [k, oams] of bank.cells.entries()) drawCell(rgba, w, 0, k * h, oams, tiles, pals)
    const file = `data/encounterEffect/elite${String(i)}Banner.png`
    out.set(file, await encodePng(rgba, w, h * bank.cells.length))
    index[`elite${String(i)}Banner`] = { file, x, y, w, h }
    check(ctx)
  }

  // 주인공 얼굴 — 트레이너 앞모습 팔레트 (종류 0 남 · 1 여 → `trfgra` 1 · 6)
  const front = [palettes(take(1, trfgra)), palettes(take(6, trfgra))]
  for (const [g, mug] of PLAYER_MUG.entries()) {
    const name = g === 0 ? 'playerMale' : 'playerFemale'
    index[name] = await cellPng(name, mug + 1, mug + 2, 0, front[g]!)
    index[`${name}Swap`] = await cellPng(`${name}Swap`, mug + 1, mug + 2, 0, front[1 - g]!)
  }
  // 사천왕전의 입자 두 벌
  for (const [k, at] of ELITE_PARTICLES.entries()) out.set(`data/encounterEffect/eliteParticle${String(k + 1)}.spa`, take(at))
  out.set('data/encounterEffect/index.json', json(index))
  return out
}
