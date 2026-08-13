// Platinum 브라우저 변환 (IMPORT.md §6 · §13-5)
//
// 노드 추출기 스물다섯 개가 하는 일을 브라우저로 옮기는 자리다. 한꺼번에 다
// 옮기지 않는다 — **한 그룹을 끝까지 옮겨 parity를 세워 놓고** 그 자리를 넓힌다.
// 순서를 뒤집으면(전부 반쯤 옮긴 상태) 어느 것이 맞는지 아무도 모른다.
//
// 그룹 하나하나는 자기 파일에 산다. 여기 있는 것은 **표**다 — 무엇이 옮겨졌고
// 무엇이 안 옮겨졌는지, 그리고 안 옮겨진 것은 왜인지.
//
// ⚠️ **안 옮긴 것을 숨기지 않는다.** 표가 곧 남은 일이고, Import 화면이 이걸
// 그대로 읽어 "이 판은 아직 여기까지"라고 말한다 (IMPORT.md §13-5)
import { narcCount, narcEntry } from './nds'
import { readMarts } from './marts'
import { martLocator } from './validate'
import { convertText, TEXT_OUTPUTS, openBanks, nameList, type DataLocale } from './text'
import { convertSpecies } from './species'
import { convertMaps } from './maps'
import { convertPokegra } from './pokegra'
import { convertChunks } from './chunks'
import { convertScripts } from './scripts'
import { convertSound } from './sound'
import { convertEncounters } from './encounters'
import { convertItems } from './items'
import { convertNpcSprites } from './npcSprites'
import { convertItemIcons, convertPokeIcons } from './icons'
import { convertBoxWallpapers } from './boxWallpapers'
import { convertSignposts } from './signposts'
import { convertStarterScene } from './starterScene'
import { convertTrainers } from './trainers'
import { convertTrainerSprites } from './trainerSprites'
import { convertSpawns } from './spawns'
import {
  breathe, check, json, BREATH,
  type ConvertContext, type GroupSpec, type Produced,
} from './convertTypes'

export { Cancelled } from './convertTypes'
export type { BdspSource, ConvertContext, GroupSpec, Produced } from './convertTypes'

// ── moves ────────────────────────────────────────────────────────────────────

const MOVE_SIZE = 16
/** 0 = 필중(명중 판정을 하지 않는다). 471개 중 127개가 여기 해당한다 */
const ALWAYS_HITS = 0
export const CATEGORY = ['physical', 'special', 'status'] as const

/** 4세대 접촉·방어 플래그 (b11) */
const FLAG_CONTACT = 0x01
const FLAG_PROTECT = 0x02

export interface MoveRow {
  id: number
  effect: number
  category: string
  power: number
  type: number
  accuracy: number
  alwaysHits: boolean
  pp: number
  effectChance: number
  target: number
  priority: number
  flags: number
  contact: boolean
  protectable: boolean
}

/**
 * 기술 하나 (16B).
 *
 * ⚠️ **노드 쪽(`tools/extract/moves.js`)과 한 줄씩 같아야 한다.** 여기가 갈리면
 * 개발판과 공개판의 배틀 계산이 달라지고, 그 차이는 배틀 한복판에서만 보인다.
 * `convert.test.ts`가 471개를 통째로 대조한다
 */
export function parseMove(b: Uint8Array, id: number): MoveRow {
  if (b.byteLength !== MOVE_SIZE) throw new Error(`waza 크기 ${String(b.byteLength)} ≠ 16`)
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (view.getUint16(14, true) !== 0) {
    throw new Error('waza 꼬리 2B가 0이 아니다 — 배치 가정이 깨졌다')
  }
  const cat = b[2]!
  if (cat > 2) throw new Error(`분류값 ${String(cat)}가 범위를 벗어난다`)
  const flags = b[11]!
  return {
    id,
    effect: view.getUint16(0, true),
    category: CATEGORY[cat]!,
    power: b[3]!,
    type: b[4]!,
    accuracy: b[5]!,
    alwaysHits: b[5] === ALWAYS_HITS,
    pp: b[6]!,
    effectChance: b[7]!,
    target: view.getUint16(8, true),
    priority: view.getInt8(10),
    flags,
    contact: (flags & FLAG_CONTACT) !== 0,
    protectable: (flags & FLAG_PROTECT) !== 0,
  }
}

async function convertMoves(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read('/poketool/waza/pl_waza_tbl.narc')
  if (!narc) throw new Error('pl_waza_tbl.narc을 못 읽었다')

  const moves: MoveRow[] = []
  for (let id = 0; ; id++) {
    const entry = narcEntry(narc, id)
    if (!entry) break
    moves.push(parseMove(entry, id))
    // 471개라 열 개마다면 진행이 눈에 보이고 메시지가 안 넘친다
    if (id % 10 === 0) { check(ctx); ctx.onProgress?.(id, 471) }
    // 취소 메시지가 들어올 틈. 마이크로태스크로는 안 온다 (`breathe` 참조)
    if (id % BREATH === 0) await breathe(ctx)
  }

  // 기술 이름은 표 길이에 맞춰 자른다 — 뱅크가 더 길어도 471칸이 곧 기술 수다
  const banks = await openBanks(ctx)
  const loc = ctx.locale as DataLocale
  ctx.onProgress?.(moves.length, moves.length)

  return new Map([
    ['data/moves.json', json({ count: moves.length, moves })],
    [`data/names/moves.${loc}.json`, json(nameList(banks.require('move_names'), moves.length))],
  ])
}

// ── marts ───────────────────────────────────────────────────────────────────

async function convertMarts(ctx: ConvertContext): Promise<Produced> {
  ctx.onProgress?.(0, 2)
  await breathe(ctx)
  // 아이템 표 엔트리 수를 먼저 센다 — 읽어 낸 번호가 그 안에 드는지 보려는 것이다.
  // 못 세면 그 검사만 건너뛴다. 상점을 못 읽는 이유가 되지는 않는다
  const items = await ctx.fs.read('/itemtool/itemdata/pl_item_data.narc')
  const itemCount = items ? narcCount(items) ?? undefined : undefined
  check(ctx)
  ctx.onProgress?.(1, 2)
  // 자리를 이 롬의 헤더와 맞춰 본다. 표가 어긋나 있으면 여기서 던진다
  const at = martLocator(ctx.release, ctx.fs.header.arm9RomOffset)
  const table = await readMarts(ctx.fs, at, itemCount)
  ctx.onProgress?.(2, 2)
  return new Map([['data/marts.json', json(table)]])
}

// ── 그룹 표 ──────────────────────────────────────────────────────────────────

export const GROUPS: readonly GroupSpec[] = [
  {
    name: 'text',
    outputs: TEXT_OUTPUTS,
    converter: 1,
    convert: convertText,
  },
  {
    name: 'species',
    outputs: ['data/species.json', 'data/names/species.*.json'],
    converter: 1,
    convert: convertSpecies,
  },
  {
    name: 'moves',
    outputs: ['data/moves.json', 'data/names/moves.*.json'],
    converter: 2,
    convert: convertMoves,
  },
  { name: 'marts', outputs: ['data/marts.json'], converter: 1, convert: convertMarts },
  {
    name: 'items',
    outputs: [
      'data/items.json', 'data/names/items.*.json', 'data/names/itemDescriptions.*.json',
    ],
    converter: 1,
    convert: convertItems,
  },
  {
    name: 'maps',
    outputs: [
      'data/maps.json',
      'data/matrices/0.bin', 'data/matrices/0.json',
      'data/matrices/interiors.bin', 'data/matrices/interiors.json',
      'data/bdhc.bin', 'data/bdhc.json',
    ],
    converter: 1,
    convert: convertMaps,
  },
  {
    name: 'chunks',
    outputs: [
      'data/chunks/{번호}.bin', 'data/chunks/index.json',
      'data/tex/{묶음}.png', 'data/tex/index.json',
      'data/props/{번호}.bin', 'data/props/{번호}.png', 'data/props/index.json',
    ],
    converter: 1,
    convert: convertChunks,
  },
  {
    name: 'scripts',
    outputs: ['data/scripts.bin', 'data/scripts.json', 'data/events.json'],
    converter: 1,
    convert: convertScripts,
  },
  {
    name: 'sound',
    outputs: [
      'data/sound/seq/N.bin', 'data/sound/bnk/N.bin', 'data/sound/war/N.bin',
      'data/sound/index.json',
    ],
    converter: 1,
    convert: convertSound,
  },
  {
    name: 'encounters',
    outputs: ['data/encounters.json', 'data/encountersEx.json'],
    converter: 1,
    convert: convertEncounters,
  },
  {
    name: 'trainers',
    outputs: [
      'data/trainers.json', 'data/names/trainers.*.json', 'data/names/trainerClasses.*.json',
    ],
    converter: 1,
    convert: convertTrainers,
  },
  {
    name: 'spawns',
    outputs: ['data/spawns.json'],
    converter: 1,
    convert: convertSpawns,
  },
  {
    name: 'npcSprites',
    outputs: ['data/npc/{그림번호}.png', 'data/npc/disguise.png', 'data/npcSprites.json'],
    converter: 1,
    convert: convertNpcSprites,
  },
  {
    name: 'itemIcons',
    outputs: ['data/itemIcons.png', 'data/itemIcons.json'],
    converter: 1,
    convert: convertItemIcons,
  },
  {
    name: 'pokeIcons',
    outputs: ['data/pokeIcons.png', 'data/pokeIcons.json'],
    converter: 1,
    convert: convertPokeIcons,
  },
  {
    name: 'boxWallpapers',
    outputs: ['data/boxWallpapers.png', 'data/boxWallpapers.json'],
    converter: 1,
    convert: convertBoxWallpapers,
  },
  {
    name: 'signposts',
    outputs: ['data/signposts.png', 'data/signposts.json'],
    converter: 1,
    convert: convertSignposts,
  },
  {
    name: 'starterScene',
    outputs: ['data/starter/{번호}.bin', 'data/starter/{번호}.png', 'data/starter/index.json'],
    converter: 1,
    convert: convertStarterScene,
  },
  {
    name: 'pokegra',
    outputs: ['data/pokemon/{종족}_{front,back}.png', 'data/pokemon/index.json'],
    converter: 1,
    convert: convertPokegra,
  },
  {
    name: 'trainerSprites',
    outputs: ['data/trainers/{갈래}.png', 'data/trainers/index.json'],
    converter: 1,
    convert: convertTrainerSprites,
  },
]
