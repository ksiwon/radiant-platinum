// 나무열매 자료 64종 (PARITY §5 `berry_tag` · §4.6 나무열매 밭)
//
// `nuts_data.narc`에 열매마다 12바이트가 들어 있다 (`BerryData`) — 크기·단단함·
// 수확량·자라는 시간·마르는 속도, 그리고 맛 다섯과 매끄러움.
//
// 도구 번호와의 관계는 뺄셈 하나다: `BerryData_LoadDataByItemID`가
// `itemID - FIRST_BERRY_IDX`로 찾는다.
'use strict'
const { openRom, writeJson } = require('./rom')

const NARC = '/itemtool/itemdata/nuts_data.narc'
/** `FIRST_BERRY_IDX` = `ITEM_CHERI_BERRY` — 도구표 149번이다 */
const FIRST_BERRY_ITEM = 149

/**
 * 단단함 다섯 (`FIRMNESS_*`).
 *
 * ⚠️ **1부터 센다.** 0은 값이 아니다 — 표를 0부터로 읽으면 마지막 갈래가
 * 범위를 벗어난다. 이름은 `berry_tags` 뱅크 11~15줄이 준다
 */
const FIRMNESS_MIN = 1
const FIRMNESS_MAX = 5

function readBerry(buf) {
  return {
    size: buf.readUInt16LE(0),
    firmness: buf[2],
    baseYield: buf[3],
    stageDuration: buf[4],
    moistureDrain: buf[5],
    // 맛 다섯 — 포핀과 콘테스트가 이 값을 본다 (§7.1)
    spicy: buf[6],
    dry: buf[7],
    sweet: buf[8],
    bitter: buf[9],
    sour: buf[10],
    smoothness: buf[11],
  }
}

function extract(rom) {
  const narc = rom.narc(NARC)
  return narc.map(readBerry)
}

function main() {
  const rom = openRom()
  const berries = extract(rom)
  if (!berries.length) throw new Error('나무열매 표가 비었다')
  for (const b of berries) {
    if (b.firmness < FIRMNESS_MIN || b.firmness > FIRMNESS_MAX) {
      throw new Error(`단단함 ${String(b.firmness)}은 표 밖이다`)
    }
  }
  const out = writeJson('berries.json', {
    count: berries.length, firstItem: FIRST_BERRY_ITEM, berries,
  })
  console.log(`나무열매 ${berries.length}종 → ${out.rel} (${out.kb}KB)`)
  const first = berries[0]
  console.log(`  1번(체리열매): 크기 ${first.size} · 단단함 ${first.firmness} · `
    + `맛 ${[first.spicy, first.dry, first.sweet, first.bitter, first.sour].join('/')}`)
}

if (require.main === module) main()
module.exports = { extract, FIRST_BERRY_ITEM, FIRMNESS_MIN, FIRMNESS_MAX }
