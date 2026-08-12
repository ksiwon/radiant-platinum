// 도감의 서식지 지도 (PARITY §5 `pokedex`)
//
// 「어디에 사는가」를 원작은 조우표에서 계산하지 않는다. `zukan_enc_platinum.narc`에
// **종마다 열 벌의 자리 목록**이 미리 구워져 있다 (`pokedex_enc_data.c`):
//
//   던전 아침·낮·밤·특별·특별(전국)   다섯
//   들판 아침·낮·밤·특별·특별(전국)   다섯
//
// 목록에 든 수는 좌표가 아니라 **좌표표의 자리 번호**다. 던전은 점 하나(x·y),
// 들판은 칸 뭉치(x·y·너비·높이 + 8×4 비트 무늬)다.
//
// ⚠️ **마지막 한 칸은 끝 표시다.** 원작이 `numLocations - 1`까지만 쓴다 —
// 그대로 다 쓰면 없는 자리에 점이 하나 더 찍힌다.
'use strict'
const { openRom, writeJson } = require('./rom')

const NARC = '/application/zukanlist/zkn_data/zukan_enc_platinum.narc'

/** `pokedex_enc_data.c`의 `MAX_SPECIES` — 493종 + 0번 + 한 칸 */
const MAX_SPECIES = 495
/** `enum PokedexEncFileIndex` — 종마다의 목록이 시작하는 자리 */
const FIRST = 4

/** `enum PokedexEncFileCatgegory` 차례 그대로 */
const CATEGORIES = [
  'dungeonMorning', 'dungeonDay', 'dungeonNight', 'dungeonSpecial', 'dungeonSpecialNational',
  'fieldMorning', 'fieldDay', 'fieldNight', 'fieldSpecial', 'fieldSpecialNational',
]

/** `DungeonCoordinates` — 4바이트 */
function readDungeons(buf) {
  const out = []
  for (let at = 0; at + 4 <= buf.length; at += 4) {
    out.push({ x: buf[at], y: buf[at + 1], mtCoronet: buf[at + 2] !== 0 })
  }
  return out
}

/** `FieldCoordinates` — 4바이트 + 8×4 비트 무늬 32바이트 */
function readFields(buf) {
  const out = []
  for (let at = 0; at + 36 <= buf.length; at += 36) {
    out.push({
      y: buf[at], x: buf[at + 1], height: buf[at + 2], width: buf[at + 3],
      cells: Array.from({ length: 32 }, (_, i) => buf[at + 4 + i]),
    })
  }
  return out
}

/** 종 하나의 자리 목록. **끝 표시 한 칸을 뗀다** */
function readList(buf) {
  const n = Math.floor(buf.length / 4)
  const out = []
  for (let i = 0; i < n - 1; i++) out.push(buf.readInt32LE(i * 4))
  return out
}

function extract(rom) {
  const narc = rom.narc(NARC)
  const want = FIRST + MAX_SPECIES * CATEGORIES.length
  if (narc.length < want) {
    throw new Error(`${NARC}에 멤버가 ${String(narc.length)}개뿐이다 — ${String(want)}개가 있어야 한다`)
  }

  const dungeons = readDungeons(narc[0])
  const fields = readFields(narc[2])

  /** 종족 → 갈래 → 자리 번호들. 빈 갈래는 아예 안 담는다 */
  const species = {}
  for (let id = 1; id <= 493; id++) {
    const entry = {}
    for (const [c, name] of CATEGORIES.entries()) {
      const list = readList(narc[FIRST + MAX_SPECIES * c + id])
      if (list.length) entry[name] = list
    }
    if (Object.keys(entry).length) species[id] = entry
  }

  return { dungeons, fields, species }
}

function main() {
  const rom = openRom()
  const data = extract(rom)

  // 자리 번호가 표를 벗어나면 지도에 엉뚱한 점이 찍힌다
  for (const [id, entry] of Object.entries(data.species)) {
    for (const [name, list] of Object.entries(entry)) {
      const max = name.startsWith('dungeon') ? data.dungeons.length : data.fields.length
      for (const at of list) {
        if (at < 0 || at >= max) throw new Error(`${id}번 ${name}의 자리 ${String(at)}가 표 밖이다`)
      }
    }
  }

  const out = writeJson('pokedexHabitat.json', data)
  const listed = Object.keys(data.species).length
  console.log(`서식지: 던전 ${data.dungeons.length} · 들판 ${data.fields.length} · `
    + `자리가 있는 종 ${listed}종 → ${out.rel} (${out.kb}KB)`)
}

if (require.main === module) main()
module.exports = { extract, CATEGORIES }
