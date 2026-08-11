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

/**
 * 키·몸무게 (`application/zukanlist/zkn_data/zukan_data.narc` 멤버 0·1).
 *
 * ⚠️ **글 뱅크가 아니다.** 화면에 찍는 `1.0 m`은 따로 있고, 배틀이 쓰는 것은
 * 여기 있는 `int[494]`다 — 데시미터와 헥토그램이다. 저울질과 풀묶기의 위력이
 * 이 숫자에서 나온다. 폼 자리(494번 뒤)는 표에 칸이 없어서 0이다.
 *
 * ⚠️ **기라티나 한 마리만 표가 둘이다.** 기본 표는 오리진(6.9m·650kg)이고
 * 어나더(4.5m·750kg)는 `zukan_data_gira.narc`에 있다 — 원작이 폼에 따라
 * NARC을 갈아 끼운다(`Pokedex_SetupGiratina`)
 */
const GIRATINA = 487

function readSizes(rom) {
  const ints = (b) => Array.from({ length: b.length >> 2 }, (_, i) => b.readInt32LE(i * 4))
  const read = (p) => {
    const m = rom.narc(p)
    return [ints(m[0]), ints(m[1])]
  }
  const [heightDm, weightHg] = read('/application/zukanlist/zkn_data/zukan_data.narc')
  if (heightDm.length !== weightHg.length) {
    throw new Error(`키 ${heightDm.length}칸 ≠ 몸무게 ${weightHg.length}칸`)
  }
  const [giraH, giraW] = read('/application/zukanlist/zkn_data/zukan_data_gira.narc')
  heightDm[GIRATINA] = giraH[GIRATINA]
  weightHg[GIRATINA] = giraW[GIRATINA]
  return { heightDm, weightHg }
}

function extractSpecies(rom, text) {
  const personal = rom.narc('/poketool/personal/pl_personal.narc')
  const evo = rom.narc('/poketool/personal/evo.narc')
  const wotbl = rom.narc('/poketool/personal/wotbl.narc')
  if (personal.length !== evo.length || personal.length !== wotbl.length) {
    throw new Error('personal/evo/wotbl 개수 불일치 — 인덱스 축이 다르다')
  }

  const size = readSizes(rom)

  const species = []
  for (let id = 0; id < personal.length; id++) {
    const p = parsePersonal(personal[id])
    // #0은 자리표시자다. 종족값이 전부 0이면 실체가 없는 슬롯으로 본다
    if (STAT_ORDER.every((k) => p.stats[k] === 0)) continue
    species.push({
      id,
      ...p,
      heightDm: size.heightDm[id] ?? 0,
      weightHg: size.weightHg[id] ?? 0,
      evolutions: parseEvo(evo[id]),
      learnset: parseLearnset(wotbl[id]),
    })
  }

  // 이름 배열은 **종족 번호로 색인**한다. species 배열 순서로 색인하면 id와 어긋나서
  // 조용히 옆 포켓몬 이름이 나온다 — 그런 버그는 눈으로 안 잡힌다
  const maxId = species[species.length - 1].id
  const names = {}
  for (const loc of LOCALES) {
    const bank = text.bank('species_name', loc)
    names[loc] = Array.from({ length: maxId + 1 }, (_, id) => bank[id] ?? '')
  }
  return { species, names, ...dexOrder(rom) }
}

/**
 * 신오도감 순서 (`Pokemon_SinnohDexNumber`).
 *
 * 표가 **양방향으로 두 벌** 있다. `pl_pokezukan`이 종족 → 신오 번호(494칸),
 * `shinzukan`이 신오 번호 → 종족(211칸)이다. 둘이 서로의 역이어야 하고,
 * 그것이 표를 제대로 읽었다는 증거다 — 한 칸만 밀려도 역이 깨진다.
 *
 * 211칸인 것은 0번을 비워 두기 때문이다. 신오도감은 210마리다.
 */
function dexOrder(rom) {
  const forward = rom.narc('/poketool/pl_pokezukan.narc')[0]
  const backward = rom.narc('/poketool/shinzukan.narc')[0]
  const sinnohOf = Array.from({ length: forward.length / 2 }, (_, i) => forward.readUInt16LE(i * 2))
  const speciesOf = Array.from({ length: backward.length / 2 }, (_, i) => backward.readUInt16LE(i * 2))

  let checked = 0
  for (let n = 1; n < speciesOf.length; n++) {
    const species = speciesOf[n]
    if (sinnohOf[species] !== n) {
      throw new Error(`신오도감 ${n}번이 종족 ${species}인데 역표는 ${sinnohOf[species]}라고 한다`)
    }
    checked++
  }
  const listed = sinnohOf.filter((n) => n !== 0).length
  if (listed !== checked) throw new Error(`신오도감에 오른 종족 ${listed}종 ≠ 역표 ${checked}칸`)
  return { sinnohOf, sinnohDex: speciesOf }
}

function main() {
  const romPath = process.argv.find((a) => a.startsWith('--rom='))?.slice(6)
  const rom = openRom(romPath)
  const text = openText()
  const { species, names, sinnohOf, sinnohDex } = extractSpecies(rom, text)

  const out = writeJson('species.json', { count: species.length, species, sinnohOf, sinnohDex })
  console.log(`species: ${species.length}종 → ${out.rel} (${out.kb}KB)`)
  console.log(`  신오도감 ${sinnohDex.length - 1}마리 (양방향 표가 서로의 역)`)
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
