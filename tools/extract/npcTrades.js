// NPC 교환 넷 (DATA.md §2.24 · PARITY §10)
//
// 신오에 교환해 주는 사람이 넷 있다. 무쇠시티의 케이케이(아브라 ↔ 알통몬),
// 영원시티의 조자리(페라페 ↔ 브이젤), 눈설시티의 고옹이(고우스트 ↔ 요가램),
// 226번수로의 킹킹이(잉어킹 ↔ 케이시).
//
// ⚠️ **이 넷이 「말 안 듣기」의 유일한 문이다.** 통신교환이 없으므로 남에게서
// 온 포켓몬을 얻는 길이 이것뿐이고, 남의 포켓몬만 뱃지 수를 넘으면 말을 안
// 듣는다 (`battle/meta/obedience.ts`). 이 넷이 없으면 그 규칙이 게임 안에서
// 한 번도 안 뜬다.
//
// 자료는 `fielddata/pokemon_trade/fld_trade.narc` 넷이고 하나가 u32 스무 칸이다
// (`NPCTradeMon`). 이름은 여기 없다 — 별명 넷과 트레이너 이름 넷이
// `TEXT_BANK_NPC_TRADE_NAMES` 한 뱅크에 0~3·4~7로 들어 있어서 대사 추출기가
// 같이 굽는다 (`dialogue.js`의 `EXTRA_BANKS`).
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson } = require('./rom')

// 자리는 어댑터가 정한다 (`tools/raw/sources`) — raw를 정리해도 여기가 안 바뀐다
const DECOMP = require('../raw/sources.cjs').requireDir('references.decomp')

const NARC = '/fielddata/pokemon_trade/fld_trade.narc'

/** `MAX_NPC_TRADES` */
const COUNT = 4
/** `NPCTradeMon`의 칸 수. u32 스무 개 = 80바이트 */
const WORDS = 20

/**
 * 칸 차례 그대로 (`include/overlay006/npc_trade.h`).
 *
 * ⚠️ **개체값 차례에 스피드가 넷째다.** 능력 화면 차례(HP·공격·방어·특공·특방·
 * 스피드)가 아니라 저장 차례(HP·공격·방어·**스피드**·특공·특방)다 — 뒤집으면
 * 특공 25인 아브라가 스피드 25가 된다
 */
const FIELDS = [
  'species', 'hpIV', 'atkIV', 'defIV', 'speedIV', 'spAtkIV', 'spDefIV', 'unused1',
  'otID', 'cool', 'beauty', 'cute', 'smart', 'tough', 'personality', 'heldItem',
  'otGender', 'unused2', 'language', 'requestedSpecies',
]

/** 디컴프가 같은 자료를 사람이 읽는 이름으로도 들고 있다 — 그것과 대조한다 */
const RES = ['kazza_abra', 'charap_chatot', 'gaspar_haunter', 'foppa_magikarp']

/** `generated/*.txt`는 줄 번호가 곧 값이다 — `SPECIES_ABRA`는 63번째 줄 */
function generatedList(name) {
  const file = path.join(DECOMP, 'generated', `${name}.txt`)
  const lines = fs.readFileSync(file, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)
  return new Map(lines.map((s, i) => [s, i]))
}

/** `enum Language`만 생성 목록이 없다 — 헤더의 열거를 그대로 읽는다 */
function languageEnum() {
  const src = fs.readFileSync(path.join(DECOMP, 'include/constants/versions.h'), 'utf8')
  const block = /enum Language \{([\s\S]*?)\}/.exec(src)
  if (!block) throw new Error('versions.h에서 enum Language를 못 찾았다')
  const out = new Map()
  let next = 0
  for (const line of block[1].split(',')) {
    const m = /(\w+)\s*(?:=\s*(\d+))?\s*$/.exec(line.trim())
    if (!m) continue
    next = m[2] === undefined ? next : Number(m[2])
    out.set(m[1], next)
    next++
  }
  return out
}

/** `SPECIES_ABRA` → 63 */
function constantTables() {
  return {
    species: generatedList('species'),
    item: generatedList('items'),
    gender: generatedList('genders'),
    language: languageEnum(),
  }
}

/** 디컴프 res의 한 벌을 롬에서 읽은 한 벌과 견준다 */
function crossCheck(index, row, tables) {
  const file = path.join(DECOMP, 'res/npc_trades', `${RES[index]}.json`)
  if (!fs.existsSync(file)) throw new Error(`디컴프 자료가 없다: ${file}`)
  const want = JSON.parse(fs.readFileSync(file, 'utf8'))
  const resolve = (key, value) => {
    if (typeof value === 'number') return value
    const table = key === 'species' || key === 'requestedSpecies' ? tables.species
      : key === 'heldItem' ? tables.item
        : key === 'otGender' ? tables.gender
          : key === 'language' ? tables.language : null
    if (!table) throw new Error(`이름을 풀 표가 없다: ${key}`)
    const at = table.get(value)
    if (at === undefined) throw new Error(`상수를 못 찾았다: ${value}`)
    return at
  }
  const bad = []
  for (const key of FIELDS) {
    const mine = row[key]
    const theirs = resolve(key, want[key])
    if (mine !== theirs) bad.push(`${key}: 롬 ${mine} ≠ 디컴프 ${theirs}`)
  }
  if (bad.length) throw new Error(`${RES[index]}이 어긋난다 — ${bad.join(' · ')}`)
  return want.name
}

function main() {
  const rom = openRom()
  const records = rom.narc(NARC)
  if (records.length !== COUNT) {
    throw new Error(`${NARC}이 ${COUNT}개가 아니라 ${records.length}개다`)
  }
  const tables = constantTables()
  const names = []

  const trades = records.map((buf, at) => {
    if (buf.length !== WORDS * 4) {
      throw new Error(`${at}번이 ${WORDS * 4}바이트가 아니라 ${buf.length}바이트다`)
    }
    const row = {}
    FIELDS.forEach((name, i) => { row[name] = buf.readUInt32LE(i * 4) })
    names.push(crossCheck(at, row, tables))
    return {
      species: row.species,
      // 저장 차례 그대로 담되 이름은 우리 쪽 이름으로 (`Stats`)
      ivs: {
        hp: row.hpIV, atk: row.atkIV, def: row.defIV,
        spa: row.spAtkIV, spd: row.spDefIV, spe: row.speedIV,
      },
      // ⚠️ **u32 통째가 트레이너 번호다.** 아래 16비트가 보이는 번호고 위가
      // 비밀 번호다 — 넷 다 위가 0이라 나눠 담아도 값이 같지만, 나눠 두지
      // 않으면 색깔 판정(`isShiny`)이 32비트를 못 본다
      otId: row.otID & 0xffff,
      otSecretId: row.otID >>> 16,
      personality: row.personality,
      heldItem: row.heldItem,
      otGender: row.otGender,
      language: row.language,
      requestedSpecies: row.requestedSpecies,
      // 콘테스트 능력치 다섯. 우리에게 담을 칸이 아직 없다 (PARITY §3.11) —
      // 그래도 **버리지 않는다**. 칸이 생기면 여기서 바로 집어 간다
      contest: {
        cool: row.cool, beauty: row.beauty, cute: row.cute,
        smart: row.smart, tough: row.tough,
      },
    }
  })

  // ⚠️ **디컴프의 영어 이름은 산출물에 안 넣는다.** 브라우저 변환기에는 디컴프가
  // 없어서 그 칸을 못 채운다 — 넣으면 노드 산출물과 브라우저 산출물이 갈린다.
  // 화면에 뜨는 이름은 뱅크 370에서 온다
  const out = writeJson('npcTrades.json', { count: trades.length, trades })
  console.log(`교환 ${trades.length}벌 — ${names.join(' · ')}`)
  console.log(`→ ${out.rel} (${out.kb}KB)`)
}

main()
