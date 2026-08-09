// 아이템 468종 (DATA.md §2.12)
//
// itemtool/itemdata/pl_item_data.narc — 파일 하나가 아이템 하나고 전부 34바이트다.
// 34는 include/item.h의 ItemData를 비트필드까지 세면 나오는 값이고, 파일 크기가
// 그 값이라는 것 자체가 구조체를 제대로 읽었다는 증거다 (14 + ItemPartyParam 20).
//
// 파일은 446개인데 아이템 열거형은 468개다. 차이 22개는 전부 ITEM_UNUSED_* 로,
// 디컴프의 has_data()가 그것만 걸러낸다. 446 = 468 - 22가 정확히 맞아떨어진다.
//
// 아이콘은 별도 아카이브(item_icon.narc, 711개)에 있고 res/items/item_icon.order가
// 파일 순서를 못 박는다. 아이템 JSON의 icon.sprite/palette가 그 이름을 가리킨다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, openText, writeJson, ROOT, LOCALES } = require('./rom')

// 자리는 어댑터가 정한다 (`tools/raw/sources`) — raw를 정리해도 여기가 안 바뀐다
const DECOMP = require('../raw/sources.cjs').requireDir('references.decomp')
const ITEM_DATA_SIZE = 34

const POCKETS = [
  'items', 'medicine', 'balls', 'tmhms', 'berries', 'mail', 'battleItems', 'keyItems',
]

/** `generated/*.txt` 한 줄에 이름 하나. 값은 줄 번호다 */
function readEnum(name) {
  const file = path.join(DECOMP, 'generated', `${name}.txt`)
  const out = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const text = line.trim()
    if (text && !text.startsWith('//')) out.push(text)
  }
  return out
}

/** `constants/*.h`의 `#define PREFIX_NAME 값` */
function readDefines(relPath, prefix) {
  const src = fs.readFileSync(path.join(DECOMP, relPath), 'utf8')
  const map = new Map()
  const re = new RegExp(`^#define\\s+(${prefix}_\\w+)\\s+(\\d+)\\s*$`, 'gm')
  for (const m of src.matchAll(re)) map.set(m[1], Number(m[2]))
  return map
}

/**
 * ItemData 34바이트.
 *
 * 비트필드 하나(+8, u16)에 여섯 개가 들어간다. 순서는 선언 순서 그대로 하위부터다 —
 * 뒤집으면 주머니가 통째로 어긋나서 가방이 엉뚱하게 나뉜다.
 */
function parseItem(buf) {
  const bits = buf.readUInt16LE(8)
  return {
    price: buf.readUInt16LE(0),
    holdEffect: buf[2],
    effectParam: buf[3],
    pluckEffect: buf[4],
    flingEffect: buf[5],
    flingPower: buf[6],
    naturalGiftPower: buf[7],
    naturalGiftType: bits & 0x1f,
    preventToss: (bits >> 5) & 1,
    canRegister: (bits >> 6) & 1,
    pocket: (bits >> 7) & 0xf,
    battlePocket: (bits >> 11) & 0x1f,
    fieldUseFunc: buf[10],
    battleUseFunc: buf[11],
    partyUse: buf[12],
    param: trim(parseParam(buf.subarray(14))),
  }
}

/**
 * ItemPartyParam 20바이트. 비트 하나짜리가 줄줄이라 자리를 세어 읽는다.
 *
 * 이 값들이 회복 아이템의 실제 동작이다 — 상처약이 20 회복이라는 것도 여기 있다.
 */
function parseParam(b) {
  const bit = (byte, at, width = 1) => (b[byte] >> at) & ((1 << width) - 1)
  const s8 = (at) => b.readInt8(at)
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
    hpRestored: b[13], ppRestored: b[14],
    friendshipLow: s8(15), friendshipMed: s8(16), friendshipHigh: s8(17),
  }
}

/**
 * 0인 항목을 턴다.
 *
 * 40칸을 그대로 실으면 파일이 435KB가 되는데, 실제로 값이 있는 칸은 아이템 하나에
 * 두세 개뿐이다. 읽는 쪽은 없는 칸을 0으로 본다
 */
function trim(param) {
  const out = {}
  for (const [k, v] of Object.entries(param)) if (v !== 0) out[k] = v
  return Object.keys(out).length ? out : null
}

function main() {
  const rom = openRom()
  const narc = rom.narc('/itemtool/itemdata/pl_item_data.narc')
  const icons = rom.narc('/itemtool/itemdata/item_icon.narc')

  // 마지막 줄 MAX_ITEMS는 개수를 세는 표지다. 디컴프의 has_data()도 접두사로 걸러낸다
  const names = readEnum('items').filter((n) => n.startsWith('ITEM_'))
  const order = fs.readFileSync(path.join(DECOMP, 'res/items/item_icon.order'), 'utf8')
    .split('\n').map((s) => s.trim()).filter(Boolean)
  if (order.length !== icons.length) {
    throw new Error(`아이콘 아카이브 ${icons.length}개 ≠ 순서 파일 ${order.length}줄`)
  }
  // `potion_NCGR` ← `potion.NCGR`
  const iconIndex = new Map(order.map((f, i) => [f.replace(/\./g, '_'), i]))

  const hasData = (name) => !name.startsWith('ITEM_UNUSED_')
  const withData = names.filter(hasData)
  if (withData.length !== narc.length) {
    throw new Error(`자료 있는 아이템 ${withData.length}개 ≠ 아카이브 파일 ${narc.length}개`)
  }

  const items = []
  let dataID = 0
  for (const constant of names) {
    const stem = constant.slice('ITEM_'.length).toLowerCase()
    if (!hasData(constant)) { items.push({ name: stem, constant, data: null }); continue }

    const buf = narc[dataID]
    if (buf.length !== ITEM_DATA_SIZE) {
      throw new Error(`${constant}: ${buf.length}바이트 ≠ ${ITEM_DATA_SIZE}`)
    }
    const src = JSON.parse(fs.readFileSync(path.join(DECOMP, `res/items/data/${stem}.json`), 'utf8'))
    const icon = iconIndex.get(src.icon.sprite)
    const palette = iconIndex.get(src.icon.palette)
    if (icon === undefined || palette === undefined) {
      throw new Error(`${constant}: 아이콘 ${src.icon.sprite}/${src.icon.palette}이 순서 파일에 없다`)
    }
    items.push({ name: stem, constant, icon, palette, dataID, ...parseItem(buf) })
    dataID++
  }

  verify(items, icons)

  const text = { names: {}, descriptions: {} }
  const t = openText()
  for (const loc of LOCALES) {
    text.names[loc] = t.bank('item_names', loc)
    text.descriptions[loc] = t.bank('item_descriptions', loc)
    if (text.names[loc].length !== names.length) {
      throw new Error(`${loc} 이름 ${text.names[loc].length}개 ≠ 아이템 ${names.length}개`)
    }
  }

  const out = writeJson('items.json', { pockets: POCKETS, items })
  console.log(`아이템 ${items.length}종 (자료 ${dataID}개) → ${out.rel} (${out.kb}KB)`)
  for (const loc of LOCALES) {
    const n = writeJson(`names/items.${loc}.json`, text.names[loc])
    const d = writeJson(`names/itemDescriptions.${loc}.json`, text.descriptions[loc])
    console.log(`  이름/${loc}: ${n.kb}KB · 설명: ${d.kb}KB`)
  }

  const ko = text.names.ko
  for (const id of [1, 17, 135, 447]) {
    const it = items[id]
    console.log(
      `  검증 #${id} ${ko[id]}: ${POCKETS[it.pocket]} ${it.price}엔 ` +
      `회복 ${it.param?.hpRestored ?? 0} 아이콘 #${it.icon}`,
    )
  }
}

/** 디컴프 JSON 446개와 필드별로 맞대 본다. 하나라도 어긋나면 구조체를 잘못 읽은 것이다 */
function verify(items, icons) {
  const pocket = readDefines('include/constants/items.h', 'POCKET')
  const battlePocket = readDefines('include/constants/items.h', 'BATTLE_POCKET_MASK')
  const pluck = readDefines('include/constants/items.h', 'PLUCK_EFFECT')
  const fling = readDefines('include/constants/items.h', 'FLING_EFFECT')
  const useFunc = readDefines('include/constants/items.h', 'ITEM_USE_FUNC')
  const hold = new Map(readEnum('item_hold_effects').map((n, i) => [n, i]))
  const types = new Map(readEnum('pokemon_types').map((n, i) => [n, i]))

  let checked = 0
  const clash = []
  const note = (name, field, got, want) => clash.push(`${name}.${field}: 롬 ${got} ≠ 디컴프 ${want}`)

  for (const it of items) {
    if (it.data === null) continue
    const src = JSON.parse(fs.readFileSync(path.join(DECOMP, `res/items/data/${it.name}.json`), 'utf8'))
    checked++

    const want = {
      price: src.price,
      effectParam: src.effectParam,
      holdEffect: hold.get(src.holdEffect),
      pluckEffect: pluck.get(src.pluckEffect),
      flingEffect: fling.get(src.flingEffect),
      flingPower: src.flingPower,
      naturalGiftPower: src.naturalGiftPower,
      // null은 5비트를 전부 세운 값이다 (~0 & 0x1f)
      naturalGiftType: src.naturalGiftType === null ? 0x1f : types.get(src.naturalGiftType),
      preventToss: src.preventToss ? 1 : 0,
      canRegister: src.canRegister ? 1 : 0,
      pocket: pocket.get(src.fieldPocket),
      battlePocket: battlePocket.get(src.battlePocket),
      fieldUseFunc: useFunc.get(src.fieldUseFunc),
      battleUseFunc: src.battleUseFunc,
    }
    for (const [field, value] of Object.entries(want)) {
      if (value === undefined) { note(it.name, field, it[field], `"${src[field]}" 열거형에 없다`); continue }
      if (it[field] !== value) note(it.name, field, it[field], value)
    }

    // 아이콘 번호가 밀리면 가방 그림이 통째로 어긋난다. 자원 종류로 확인한다
    const magic = (buf) => buf.subarray(0, 4).toString('ascii')
    if (magic(icons[it.icon]) !== 'RGCN') note(it.name, 'icon', magic(icons[it.icon]), 'RGCN')
    if (magic(icons[it.palette]) !== 'RLCN') note(it.name, 'palette', magic(icons[it.palette]), 'RLCN')
  }

  console.log(`디컴프 아이템 ${checked}개와 대조 / 불일치 ${clash.length}개`)
  for (const c of clash.slice(0, 20)) console.log(`  ! ${c}`)
  if (clash.length) throw new Error('구조체를 잘못 읽었다')
}

main()
