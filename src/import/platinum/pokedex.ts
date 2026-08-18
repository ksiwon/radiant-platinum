// 도감의 정렬 목록과 서식지 지도 — 브라우저에서 (PARITY §5 `pokedex`)
//
// 원작 도감은 순서를 **계산하지 않는다.** `zukan_data.narc`에 정렬된 목록
// 마흔여섯 벌이 통째로 구워져 있고, 화면은 그것과 「본 적 있는 종」의 교집합만
// 낸다 (`pokedex_sort.c`의 `PokedexFromNARC` → `IntersectPokedexes`).
// 「어디에 사는가」도 마찬가지로 `zukan_enc_platinum.narc`에 미리 구워져 있다.
//
// 우리가 무게·키로 다시 정렬하면 **같은 값끼리의 차례가 달라진다** — 493종
// 중에 몸무게가 같은 짝이 여럿이고, 원작 목록은 그 동률까지 정해 두었다.
//
// ⚠️ **설치본은 자기 판 하나만 굽는다.** 노드 쪽(`tools/extract/pokedexSort.js`)은
// 롬 셋을 열어 en·ko·ja 세 벌을 굽지만, 설치본에는 롬이 하나뿐이고 화면이 고를
// 수 있는 언어도 그 하나다 (`installer.ts`의 `availableLocales: [locale]`).
// 그래서 여기서 나오는 것은 `pokedexSort.<그 판>.json` **하나**이고, 없는 두
// 벌을 「빠졌다」로 세면 안 된다.
import { narcCount, narcEntry } from './nds'
import {
  BREATH, breathe, check, json, readRomFile, type ConvertContext, type Produced,
} from './convertTypes'

const SORT_NARC = '/application/zukanlist/zkn_data/zukan_data.narc'
const HABITAT_NARC = '/application/zukanlist/zkn_data/zukan_enc_platinum.narc'

/** `pokedex_sort.c`의 `NUMSTATFILES` — 앞쪽 열한 칸은 키·몸무게 표다 */
const NUMSTATFILES = 11

/**
 * `enum PokedexDataSortIndex` 그대로. 자리가 곧 NARC 멤버 번호 − 11이다.
 *
 * ⚠️ **이름 거르기 아홉 칸의 이름은 미국판 기준이다.** 한국 롬에서는 같은
 * 자리가 가·나·다… 뭉치를 가리킨다 — 뜻이 아니라 **자리**가 규약이라 그대로 둔다
 */
export const SORTS = [
  'national', 'sinnoh',
  'alphabetical', 'heaviest', 'lightest', 'tallest', 'smallest',
  'nameAbc', 'nameDef', 'nameGhi', 'nameJkl', 'nameMno',
  'namePqr', 'nameStu', 'nameVwx', 'nameYz',
  'typeNormal', 'typeFighting', 'typeFlying', 'typePoison', 'typeGround',
  'typeRock', 'typeBug', 'typeGhost', 'typeSteel', 'typeFire',
  'typeWater', 'typeGrass', 'typeElectric', 'typePsychic', 'typeIce',
  'typeDragon', 'typeDark',
  'shapeQuadruped', 'shapeBipedalTailless', 'shapeBipedalTailed', 'shapeSerpentine',
  'shapeMultiWinged', 'shapeWinged', 'shapeInsectoid', 'shapeHeadBase',
  'shapeHeadArms', 'shapeHeadLegs', 'shapeTentacles', 'shapeFins',
  'shapeHead', 'shapeMultiBody',
] as const

/** 몸 모양 열넷. 거르기 목록의 자리와 짝이 맞는다 */
const SHAPE_FIRST = SORTS.indexOf('shapeQuadruped')
export const SHAPE_COUNT = 14

/** 종족 493 + 0번 칸 (`shapeOf`가 494칸을 낸다) */
const SHAPE_SLOTS = 494

/** `pokedex_enc_data.c`의 `MAX_SPECIES` — 493종 + 0번 + 한 칸 */
const MAX_SPECIES = 495
/** `enum PokedexEncFileIndex` — 종마다의 목록이 시작하는 자리 */
const HABITAT_FIRST = 4
const LAST_SPECIES = 493

/** `enum PokedexEncFileCatgegory` 차례 그대로 */
export const CATEGORIES = [
  'dungeonMorning', 'dungeonDay', 'dungeonNight', 'dungeonSpecial', 'dungeonSpecialNational',
  'fieldMorning', 'fieldDay', 'fieldNight', 'fieldSpecial', 'fieldSpecialNational',
] as const

const u16 = (b: Uint8Array, at: number): number => b[at]! | (b[at + 1]! << 8)

function readLists(narc: Uint8Array): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  for (const [i, name] of SORTS.entries()) {
    const buf = narcEntry(narc, NUMSTATFILES + i)
    if (!buf) throw new Error(`${SORT_NARC}에 ${String(NUMSTATFILES + i)}번 멤버가 없다`)
    out[name] = Array.from({ length: buf.length / 2 }, (_, k) => u16(buf, k * 2))
  }
  return out
}

/**
 * 종족 → 몸 모양 (0~13).
 *
 * 원작은 이 표를 안 갖고 목록 열넷을 그냥 쓰지만, 우리 화면은 고른 종의
 * 모양을 되물을 일이 있어서 역표를 같이 낸다. 두 벌이 어긋나지 않게
 * **목록에서 만들어 낸다**
 */
function shapeOf(lists: Record<string, number[]>): number[] {
  const out = new Array<number>(SHAPE_SLOTS).fill(-1)
  for (let s = 0; s < SHAPE_COUNT; s++) {
    for (const species of lists[SORTS[SHAPE_FIRST + s]!]!) out[species] = s
  }
  return out
}

/** `DungeonCoordinates` — 4바이트 */
function readDungeons(buf: Uint8Array): { x: number, y: number, mtCoronet: boolean }[] {
  const out = []
  for (let at = 0; at + 4 <= buf.length; at += 4) {
    out.push({ x: buf[at]!, y: buf[at + 1]!, mtCoronet: buf[at + 2] !== 0 })
  }
  return out
}

/** `FieldCoordinates` — 4바이트 + 8×4 비트 무늬 32바이트 */
function readFields(buf: Uint8Array): {
  y: number, x: number, height: number, width: number, cells: number[],
}[] {
  const out = []
  for (let at = 0; at + 36 <= buf.length; at += 36) {
    out.push({
      y: buf[at]!, x: buf[at + 1]!, height: buf[at + 2]!, width: buf[at + 3]!,
      cells: Array.from({ length: 32 }, (_, i) => buf[at + 4 + i]!),
    })
  }
  return out
}

/**
 * 종 하나의 자리 목록. **끝 표시 한 칸을 뗀다**.
 *
 * ⚠️ 원작이 `numLocations - 1`까지만 쓴다 — 그대로 다 쓰면 없는 자리에 점이
 * 하나 더 찍힌다
 */
function readList(buf: Uint8Array): number[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const n = Math.floor(buf.length / 4)
  const out: number[] = []
  for (let i = 0; i < n - 1; i++) out.push(view.getInt32(i * 4, true))
  return out
}

export async function convertPokedex(ctx: ConvertContext): Promise<Produced> {
  const STEPS = 2 + LAST_SPECIES
  const out: Produced = new Map()

  // ── 정렬 목록 마흔여섯 벌 ──
  const sortNarc = await readRomFile(ctx, SORT_NARC)
  const lists = readLists(sortNarc)
  // 몸 모양은 언어와 무관하다 — 세 롬이 같은 값을 낸다
  const shapes = shapeOf(lists)
  // 국가도감이 493, 신오가 210이 아니면 멤버 번호가 밀린 것이다
  if (lists.national!.length !== LAST_SPECIES) {
    throw new Error(`전국도감 목록이 ${String(lists.national!.length)}칸이다`)
  }
  if (lists.sinnoh!.length !== 210) {
    throw new Error(`신오도감 목록이 ${String(lists.sinnoh!.length)}칸이다`)
  }
  const unshaped = shapes.slice(1, LAST_SPECIES + 1).filter((v) => v < 0).length
  if (unshaped) throw new Error(`몸 모양이 없는 종이 ${String(unshaped)}개다`)
  out.set(`data/pokedexSort.${ctx.locale}.json`, json({ lists, shapes }))
  ctx.onProgress?.(1, STEPS)
  await breathe(ctx)

  // ── 서식지 ──
  const habitatNarc = await readRomFile(ctx, HABITAT_NARC)
  const want = HABITAT_FIRST + MAX_SPECIES * CATEGORIES.length
  const have = narcCount(habitatNarc) ?? 0
  if (have < want) {
    throw new Error(`${HABITAT_NARC}에 멤버가 ${String(have)}개뿐이다 — ${String(want)}개가 있어야 한다`)
  }
  const dungeons = readDungeons(narcEntry(habitatNarc, 0)!)
  const fields = readFields(narcEntry(habitatNarc, 2)!)
  ctx.onProgress?.(2, STEPS)

  /** 종족 → 갈래 → 자리 번호들. 빈 갈래는 아예 안 담는다 */
  const species: Record<number, Record<string, number[]>> = {}
  for (let id = 1; id <= LAST_SPECIES; id++) {
    const entry: Record<string, number[]> = {}
    for (const [c, name] of CATEGORIES.entries()) {
      const buf = narcEntry(habitatNarc, HABITAT_FIRST + MAX_SPECIES * c + id)
      if (!buf) throw new Error(`${HABITAT_NARC}에 ${String(id)}번 ${name} 멤버가 없다`)
      const list = readList(buf)
      if (list.length) {
        // 자리 번호가 표를 벗어나면 지도에 엉뚱한 점이 찍힌다
        const max = name.startsWith('dungeon') ? dungeons.length : fields.length
        for (const at of list) {
          if (at < 0 || at >= max) {
            throw new Error(`${String(id)}번 ${name}의 자리 ${String(at)}가 표 밖이다`)
          }
        }
        entry[name] = list
      }
    }
    if (Object.keys(entry).length) species[id] = entry
    if (id % BREATH === 0) { ctx.onProgress?.(2 + id, STEPS); await breathe(ctx) }
  }

  check(ctx)
  out.set('data/pokedexHabitat.json', json({ dungeons, fields, species }))
  ctx.onProgress?.(STEPS, STEPS)
  return out
}
