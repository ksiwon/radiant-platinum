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
const { eggMovesBySpecies } = require('./eggMoveTableModule.cjs')

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
  const eggMoves = eggMovesBySpecies()

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
      // 알 기술은 롬의 종족 자료에 **없다** — 원작도 오버레이 5의 배열
      // (`sEggMoves`)로 들고 있다. 기술머신표와 같은 자리라 디컴프에서 온다
      eggMoves: eggMoves[id] ?? [],
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
  return { species, names, babyOf: readBabyTable(rom), ...dexOrder(rom) }
}

/**
 * 종족 → 그 계통의 **맨 앞**(알에서 나오는 종).
 *
 *   /poketool/personal/pms.narc  508 × u16 평평한 표
 *
 * ⚠️ NARC 껍데기를 벗기지 않는다. 원작이 이 파일을 아카이브로 안 열고
 * `species * 2` 바이트로 **직접 시크**한다 (`Pokemon_GetBaseSpeciesFromPersonalData`)
 * — 그래서 헤더까지 포함한 파일 전체가 표다.
 *
 * 이게 없으면 이상해꽃을 맡겨도 이상해꽃 알이 나온다. 실측으로 246종이
 * 자기 자신이 아닌 앞 단계를 가리킨다 — 진화 분기 수와 같다
 */
function readBabyTable(rom) {
  const raw = rom.read('/poketool/personal/pms.narc')
  const table = Array.from({ length: raw.length >> 1 }, (_, i) => raw.readUInt16LE(i * 2))
  // 피카츄(25) → 피츄(172)가 이 표의 눈금이다. 진화 전으로만 가는 표가 아니라
  // **알 단계**로 간다 — 4세대에서 새로 생긴 아기들이 여기 걸린다
  if (table[25] !== 172) throw new Error(`피카츄의 알 단계가 ${table[25]}다 (172이어야 한다)`)
  return table
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
  const { species, names, babyOf, sinnohOf, sinnohDex } = extractSpecies(rom, text)

  const out = writeJson('species.json',
    { count: species.length, species, babyOf, sinnohOf, sinnohDex })
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
  const totalEggMoves = species.reduce((s, x) => s + x.eggMoves.length, 0)
  const babies = babyOf.filter((v, i) => v !== 0 && v !== i).length
  console.log(`  레벨업 기술 ${totalMoves}개 · 진화 분기 ${totalEvos}개 · 알 기술 ${totalEggMoves}개`)
  console.log(`  알 단계표 ${babyOf.length}칸 (자기가 아닌 것 ${babies}종)`)
}

if (require.main === module) main()
module.exports = { extractSpecies, parsePersonal, parseEvo, parseLearnset, STAT_ORDER }
