// 아이템 그룹 — 브라우저에서 (DATA.md §2.12)
//
//   /itemtool/itemdata/pl_item_data.narc   446 × 34B  가격·주머니·회복량
//   /itemtool/itemdata/item_icon.narc      711칸      가방 그림과 팔레트
//
// 34는 `include/item.h`의 `ItemData`를 비트필드까지 세면 나오는 값이고, **파일
// 크기가 그 값이라는 것 자체가** 구조체를 제대로 읽었다는 증거다 (14 +
// `ItemPartyParam` 20).
//
// 아이템 열거형은 468개인데 파일은 446개다. 차이 22개는 전부 `ITEM_UNUSED_*`이고,
// 그것들은 NARC에 자리가 아예 없어서 **뒤 아이템의 파일 번호가 그만큼 당겨진다** —
// 그래서 이름표 순서를 따로 들고 다니며 세어 나간다 (`itemTable.ts`).
//
// ⚠️ **노드 쪽(`tools/extract/items.js`)과 한 줄씩 같아야 한다.**
import { narcCount, narcEntry } from './nds'
import { ITEM_TABLE, ITEM_ICON_COUNT, TM_MOVES } from './itemTable'
import { openBanks, type DataLocale } from './text'
import { breathe, check, json, type ConvertContext, type Produced } from './convertTypes'

const ITEM_DATA_SIZE = 34

/** 가방 주머니 여덟. 자료의 `pocket`이 이 배열의 자리를 가리킨다 */
const POCKETS = [
  'items', 'medicine', 'balls', 'tmhms', 'berries', 'mail', 'battleItems', 'keyItems',
]

/** 아이콘/팔레트 멤버가 진짜 그 종류인지 보는 자물쇠 (NCGR·NCLR의 뒤집힌 매직) */
const ICON_MAGIC = 'RGCN'
const PALETTE_MAGIC = 'RLCN'

interface ItemParam { [field: string]: number }

/**
 * `ItemPartyParam` 20B. 비트 하나짜리가 줄줄이라 자리를 세어 읽는다.
 *
 * 이 값들이 회복 아이템의 실제 동작이다 — 상처약이 20 회복이라는 것도 여기 있다
 */
export function parseParam(b: Uint8Array): ItemParam {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const bit = (byte: number, at: number, width = 1): number => (b[byte]! >> at) & ((1 << width) - 1)
  const s8 = (at: number): number => view.getInt8(at)
  return {
    healSleep: bit(0, 0), healPoison: bit(0, 1), healBurn: bit(0, 2), healFreeze: bit(0, 3),
    healParalysis: bit(0, 4), healConfusion: bit(0, 5), healAttract: bit(0, 6), guardSpec: bit(0, 7),
    revive: bit(1, 0), reviveAll: bit(1, 1), levelUp: bit(1, 2), evolve: bit(1, 3),
    atkStages: bit(1, 4, 4), defStages: bit(2, 0, 4), spatkStages: bit(2, 4, 4),
    spdefStages: bit(3, 0, 4), speedStages: bit(3, 4, 4),
    accStages: bit(4, 0, 4), critStages: bit(4, 4, 2), ppUp: bit(4, 6), ppMax: bit(4, 7),
    ppRestore: bit(5, 0), ppRestoreAll: bit(5, 1), hpRestore: bit(5, 2),
    giveHPEVs: bit(5, 3), giveAtkEVs: bit(5, 4), giveDefEVs: bit(5, 5),
    giveSpeedEVs: bit(5, 6), giveSpAtkEVs: bit(5, 7),
    giveSpDefEVs: bit(6, 0), giveFriendshipLow: bit(6, 1),
    giveFriendshipMed: bit(6, 2), giveFriendshipHigh: bit(6, 3),
    hpEVs: s8(7), atkEVs: s8(8), defEVs: s8(9), speedEVs: s8(10), spatkEVs: s8(11), spdefEVs: s8(12),
    hpRestored: b[13]!, ppRestored: b[14]!,
    friendshipLow: s8(15), friendshipMed: s8(16), friendshipHigh: s8(17),
  }
}

/**
 * 0인 항목을 턴다.
 *
 * 40칸을 그대로 실으면 파일이 435KB가 되는데, 실제로 값이 있는 칸은 아이템 하나에
 * 두세 개뿐이다. 읽는 쪽은 없는 칸을 0으로 본다
 */
export function trim(param: ItemParam): ItemParam | null {
  const out: ItemParam = {}
  for (const [k, v] of Object.entries(param)) if (v !== 0) out[k] = v
  return Object.keys(out).length ? out : null
}

interface ItemData {
  price: number
  holdEffect: number
  effectParam: number
  pluckEffect: number
  flingEffect: number
  flingPower: number
  naturalGiftPower: number
  naturalGiftType: number
  preventToss: number
  canRegister: number
  pocket: number
  battlePocket: number
  fieldUseFunc: number
  battleUseFunc: number
  partyUse: number
  param: ItemParam | null
}

/**
 * `ItemData` 34B.
 *
 * 비트필드 하나(+8, u16)에 여섯 개가 들어간다. 순서는 선언 순서 그대로 하위부터다 —
 * 뒤집으면 주머니가 통째로 어긋나서 가방이 엉뚱하게 나뉜다
 */
export function parseItem(buf: Uint8Array): ItemData {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const bits = view.getUint16(8, true)
  return {
    price: view.getUint16(0, true),
    holdEffect: buf[2]!,
    effectParam: buf[3]!,
    pluckEffect: buf[4]!,
    flingEffect: buf[5]!,
    flingPower: buf[6]!,
    naturalGiftPower: buf[7]!,
    naturalGiftType: bits & 0x1f,
    preventToss: (bits >> 5) & 1,
    canRegister: (bits >> 6) & 1,
    pocket: (bits >> 7) & 0xf,
    battlePocket: (bits >> 11) & 0x1f,
    fieldUseFunc: buf[10]!,
    battleUseFunc: buf[11]!,
    partyUse: buf[12]!,
    param: trim(parseParam(buf.subarray(14))),
  }
}

/** 네 바이트 매직을 ASCII로 */
const magic = (b: Uint8Array): string => String.fromCharCode(...b.subarray(0, 4))

export async function convertItems(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read('/itemtool/itemdata/pl_item_data.narc')
  const iconNarc = await ctx.fs.read('/itemtool/itemdata/item_icon.narc')
  if (!narc || !iconNarc) throw new Error('pl_item_data/item_icon NARC을 못 읽었다')

  const count = narcCount(narc)
  const icons = narcCount(iconNarc)
  const withData = ITEM_TABLE.filter((r) => r[1] !== null).length
  // ⚠️ **자리가 하나만 밀려도 전부 다른 아이템이 된다.** 개수 두 짝을 먼저 맞춘다
  if (count !== withData) {
    throw new Error(`아이템 자료 ${String(count)}개 ≠ 이름표에서 센 ${String(withData)}개`)
  }
  if (icons !== ITEM_ICON_COUNT) {
    throw new Error(`아이콘 아카이브 ${String(icons)}칸 ≠ 순서 파일 ${String(ITEM_ICON_COUNT)}줄`)
  }

  const total = ITEM_TABLE.length
  const items: unknown[] = []
  let dataID = 0
  for (const [constant, icon, palette] of ITEM_TABLE) {
    const name = constant.slice('ITEM_'.length).toLowerCase()
    if (icon === null || palette === null) { items.push({ name, constant, data: null }); continue }

    const buf = narcEntry(narc, dataID)
    if (!buf) throw new Error(`${constant}: NARC 멤버 ${String(dataID)}이 없다`)
    if (buf.byteLength !== ITEM_DATA_SIZE) {
      throw new Error(`${constant}: ${String(buf.byteLength)}바이트 ≠ ${String(ITEM_DATA_SIZE)}`)
    }
    // 아이콘 번호가 밀리면 가방 그림이 통째로 어긋난다. 자원 종류로 확인한다 —
    // 롬만으로 되는 검사라 디컴프 없이도 표가 맞는지 여기서 잡힌다
    const sprite = narcEntry(iconNarc, icon)
    const pal = narcEntry(iconNarc, palette)
    if (!sprite || magic(sprite) !== ICON_MAGIC) {
      throw new Error(`${constant}: 아이콘 #${String(icon)}이 ${ICON_MAGIC}가 아니다`)
    }
    if (!pal || magic(pal) !== PALETTE_MAGIC) {
      throw new Error(`${constant}: 팔레트 #${String(palette)}이 ${PALETTE_MAGIC}가 아니다`)
    }

    items.push({ name, constant, icon, palette, dataID, ...parseItem(buf) })
    dataID++
    if (dataID % 64 === 0) { check(ctx); ctx.onProgress?.(items.length, total); await breathe(ctx) }
  }

  const banks = await openBanks(ctx)
  const loc = ctx.locale as DataLocale
  const names = banks.require('item_names')
  if (names.length !== total) {
    throw new Error(`이름 ${String(names.length)}개 ≠ 아이템 ${String(total)}개`)
  }
  ctx.onProgress?.(total, total)

  return new Map([
    ['data/items.json', json({ pockets: POCKETS, items, tmMoves: TM_MOVES })],
    [`data/names/items.${loc}.json`, json(names)],
    [`data/names/itemDescriptions.${loc}.json`, json(banks.require('item_descriptions'))],
  ])
}
