// 종족 데이터 추출 (DATA.md §2.4 / §4.2-1)
//
//   /poketool/personal/pl_personal.narc  508 × 44B  종족값·타입·특성·성비·알
//   /poketool/personal/evo.narc          508 × 44B  진화 7슬롯 × 6B + 2B 패딩
//   /poketool/personal/wotbl.narc        508 × 가변 레벨업 기술, u16 패킹
//
// ⚠️ 롬의 스탯 순서는 HP/공/방/**스피드**/특공/특방이다. 표시 순서와 다르므로
// 여기서 이름 붙인 객체로 바꿔 내보낸다 — 그러면 이후로 순서 착각이 불가능해진다.
'use strict'
const { openRom, openText, writeJson, LOCALES } = require('./rom')

const PERSONAL_SIZE = 44
const EVO_SLOTS = 7
const EVO_ENTRY = 6
/** wotbl 종료 표식 */
const WOTBL_END = 0xffff
/** 레벨업 기술 u16 패킹: 하위 9비트 기술, 다음 7비트 레벨 */
const MOVE_MASK = 0x1ff

const STAT_ORDER = ['hp', 'atk', 'def', 'spe', 'spa', 'spd']

function parsePersonal(b) {
  if (b.length !== PERSONAL_SIZE) throw new Error(`personal 크기 ${b.length} ≠ ${PERSONAL_SIZE}`)
  const stats = {}
  STAT_ORDER.forEach((k, i) => { stats[k] = b[i] })
  const evBits = b.readUInt16LE(10)
  const ev = {}
  STAT_ORDER.forEach((k, i) => { ev[k] = (evBits >> (i * 2)) & 3 })
  return {
    stats,
    types: [b[6], b[7]],
    catchRate: b[8],
    baseExp: b[9],
    ev,
    heldItems: [b.readUInt16LE(12), b.readUInt16LE(14)],
    // 255 = 무성, 0 = 항상 수컷, 254 = 항상 암컷, 그 외 = 암컷 확률 × 255/8
    genderRatio: b[16],
    eggCycles: b[17],
    baseFriendship: b[18],
    growthRate: b[19],
    eggGroups: [b[20], b[21]],
    abilities: [b[22], b[23]],
    safariFlee: b[24],
    color: b[25] & 0x3f,
    /** 기술머신·비전머신 학습 가능 비트필드 128비트 */
    tm: b.toString('hex', 28, 44),
  }
}

function parseEvo(b) {
  const out = []
  for (let i = 0; i < EVO_SLOTS; i++) {
    const method = b.readUInt16LE(i * EVO_ENTRY)
    if (method === 0) continue
    out.push({
      method,
      param: b.readUInt16LE(i * EVO_ENTRY + 2),
      to: b.readUInt16LE(i * EVO_ENTRY + 4),
    })
  }
  // 44B - 42B = 꼬리 2B는 508개 전부 0이다. 아니라면 8슬롯 가설을 다시 봐야 한다
  if (b.readUInt16LE(EVO_SLOTS * EVO_ENTRY) !== 0) throw new Error('evo 꼬리가 0이 아니다')
  return out
}

function parseLearnset(b) {
  const out = []
  for (let p = 0; p + 2 <= b.length; p += 2) {
    const v = b.readUInt16LE(p)
    if (v === WOTBL_END) break
    out.push({ level: (v >> 9) & 0x7f, move: v & MOVE_MASK })
  }
  return out
}

function extractSpecies(rom, text) {
  const personal = rom.narc('/poketool/personal/pl_personal.narc')
  const evo = rom.narc('/poketool/personal/evo.narc')
  const wotbl = rom.narc('/poketool/personal/wotbl.narc')
  if (personal.length !== evo.length || personal.length !== wotbl.length) {
    throw new Error('personal/evo/wotbl 개수 불일치 — 인덱스 축이 다르다')
  }

  const species = []
  for (let id = 0; id < personal.length; id++) {
    const p = parsePersonal(personal[id])
    // #0은 자리표시자다. 종족값이 전부 0이면 실체가 없는 슬롯으로 본다
    if (STAT_ORDER.every((k) => p.stats[k] === 0)) continue
    species.push({ id, ...p, evolutions: parseEvo(evo[id]), learnset: parseLearnset(wotbl[id]) })
  }

  // 이름 배열은 **종족 번호로 색인**한다. species 배열 순서로 색인하면 id와 어긋나서
  // 조용히 옆 포켓몬 이름이 나온다 — 그런 버그는 눈으로 안 잡힌다
  const maxId = species[species.length - 1].id
  const names = {}
  for (const loc of LOCALES) {
    const bank = text.bank('species_names', loc)
    names[loc] = Array.from({ length: maxId + 1 }, (_, id) => bank[id] ?? '')
  }
  return { species, names }
}

function main() {
  const romPath = process.argv.find((a) => a.startsWith('--rom='))?.slice(6)
  const rom = openRom(romPath)
  const text = openText()
  const { species, names } = extractSpecies(rom, text)

  const out = writeJson('species.json', { count: species.length, species })
  console.log(`species: ${species.length}종 → ${out.rel} (${out.kb}KB)`)
  for (const loc of LOCALES) {
    const n = writeJson(`names/species.${loc}.json`, names[loc])
    console.log(`  이름/${loc}: ${names[loc].filter(Boolean).length}개 → ${n.rel} (${n.kb}KB)`)
  }

  // 원작 대조 — 모부기가 어긋나면 포맷 가정이 깨진 것이다
  const turtwig = species.find((s) => s.id === 387)
  console.log(`  검증 #387 ${names.ko[387]}: ` +
    `${STAT_ORDER.map((k) => turtwig.stats[k]).join('/')} ` +
    `타입 ${turtwig.types.join('/')} 특성 ${turtwig.abilities[0]} ` +
    `진화 ${JSON.stringify(turtwig.evolutions)} 레벨업 ${turtwig.learnset.length}개`)
  const totalMoves = species.reduce((s, x) => s + x.learnset.length, 0)
  const totalEvos = species.reduce((s, x) => s + x.evolutions.length, 0)
  console.log(`  레벨업 기술 ${totalMoves}개 · 진화 분기 ${totalEvos}개`)
}

if (require.main === module) main()
module.exports = { extractSpecies, parsePersonal, parseEvo, parseLearnset, STAT_ORDER }
