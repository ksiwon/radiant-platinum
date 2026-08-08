// 기술 데이터 추출 (DATA.md §2.5 / §4.2-1)
//
//   /poketool/waza/pl_waza_tbl.narc  471 × 16B
//
// 바이트 배치는 우선도가 알려진 기술로 핀을 박아 확정했다:
//   전광석화 +1, 신속 +1(4세대), 방어 +3, 페인트 +1, 울부짖기 -6 — b10과 전부 일치.
//   b10은 443개가 0이고 범위가 -7~+5라 우선도 분포 그 자체다.
//   b13은 값이 정확히 5종(0~4)뿐 — 콘테스트 타입 5종과 일치한다.
'use strict'
const { openRom, openText, writeJson, LOCALES } = require('./rom')

const MOVE_SIZE = 16
/** 0 = 필중(명중 판정을 하지 않는다). 471개 중 127개가 여기 해당한다 */
const ALWAYS_HITS = 0
const CATEGORY = ['physical', 'special', 'status']

/** 4세대 접촉·방어 플래그 (b11) */
const Flag = {
  CONTACT: 0x01,
  PROTECT: 0x02,
  MAGIC_COAT: 0x04,
  SNATCH: 0x08,
  MIRROR_MOVE: 0x10,
  KINGS_ROCK: 0x20,
}

function parseMove(b) {
  if (b.length !== MOVE_SIZE) throw new Error(`waza 크기 ${b.length} ≠ ${MOVE_SIZE}`)
  if (b.readUInt16LE(14) !== 0) throw new Error('waza 꼬리 2B가 0이 아니다 — 배치 가정이 깨졌다')
  const cat = b[2]
  if (cat > 2) throw new Error(`분류값 ${cat}가 범위를 벗어난다`)
  const flags = b[11]
  return {
    effect: b.readUInt16LE(0),
    category: CATEGORY[cat],
    power: b[3],
    type: b[4],
    accuracy: b[5],
    alwaysHits: b[5] === ALWAYS_HITS,
    pp: b[6],
    effectChance: b[7],
    target: b.readUInt16LE(8),
    priority: b.readInt8(10),
    flags,
    contact: (flags & Flag.CONTACT) !== 0,
    protectable: (flags & Flag.PROTECT) !== 0,
  }
}

function extractMoves(rom, text) {
  const tbl = rom.narc('/poketool/waza/pl_waza_tbl.narc')
  const moves = tbl.map((b, id) => ({ id, ...parseMove(b) }))
  const names = {}
  for (const loc of LOCALES) {
    const bank = text.bank('move_names', loc)
    names[loc] = moves.map((m) => bank[m.id] ?? '')
  }
  return { moves, names }
}

function extractLabels(text) {
  // 타입·특성 이름은 종족/기술 양쪽이 참조한다. 한 파일로 묶어 낸다
  const out = {}
  for (const loc of LOCALES) {
    out[loc] = {
      types: text.bank('pokemon_type_names', loc),
      abilities: text.bank('ability_names', loc),
      // 특성 설명. 교체 화면이 고른 포켓몬의 특성을 한 줄로 풀어 준다 —
      // 이름만 있으면 "모래날림"이 뭘 하는지 화면에서 알 길이 없다
      abilityText: text.bank('ability_descriptions', loc),
    }
  }
  return out
}

function main() {
  const romPath = process.argv.find((a) => a.startsWith('--rom='))?.slice(6)
  const rom = openRom(romPath)
  const text = openText()
  const { moves, names } = extractMoves(rom, text)
  const labels = extractLabels(text)

  const out = writeJson('moves.json', { count: moves.length, moves })
  console.log(`moves: ${moves.length}개 → ${out.rel} (${out.kb}KB)`)
  for (const loc of LOCALES) {
    const n = writeJson(`names/moves.${loc}.json`, names[loc])
    const l = writeJson(`names/labels.${loc}.json`, labels[loc])
    console.log(`  이름/${loc}: 기술 ${names[loc].filter(Boolean).length}개 (${n.kb}KB) · ` +
      `타입 ${labels[loc].types.length} 특성 ${labels[loc].abilities.length}` +
      ` 설명 ${labels[loc].abilityText.length} (${l.kb}KB)`)
  }

  for (const id of [1, 7, 63, 94, 98]) {
    const m = moves[id]
    console.log(`  검증 #${id} ${names.ko[id]}: ${m.category} 위력${m.power} ` +
      `타입${m.type} 명중${m.alwaysHits ? '필중' : m.accuracy} PP${m.pp} ` +
      `우선도${m.priority >= 0 ? '+' : ''}${m.priority} ${m.contact ? '접촉' : '비접촉'}`)
  }
  const byCat = CATEGORY.map((c) => `${c} ${moves.filter((m) => m.category === c).length}`)
  console.log(`  분류: ${byCat.join(' · ')}`)
}

if (require.main === module) main()
module.exports = { extractMoves, extractLabels, parseMove, CATEGORY, Flag }
