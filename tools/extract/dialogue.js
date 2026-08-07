// 대사 추출 (DATA.md §2.11) — pl_msg.narc의 대사 뱅크를 로케일별로.
//
// 맵 헤더의 `msg` 번호가 뱅크를 가리키고, 스크립트의 `Message n`이 그 뱅크의
// n번째 글을 띄운다. 그 두 고리를 잇는 것이 이 파일이다.
//
// **뱅크 번호가 로케일마다 다르다.** 미국 롬 724개, 한국 714개, 일본 709개 —
// 몇 개가 빠져 있어서 번호가 밀린다. 그래서 산출물은 **미국 번호를 이름으로**
// 쓰고(맵 헤더가 그 번호다) 추출할 때 로케일별 번호로 바꿔 읽는다.
//
// 그 대응을 어떻게 확정했나:
//   1) 항목 수 배열로 최장 공통 부분수열 정렬 (삭제만 있는 모양이다)
//   2) **한국어 롬의 맵 헤더 표를 따로 찾아** 그 `msg` 열과 맞춰 봤다 —
//      msg를 뺀 나머지 필드가 593/593 일치하는 자리가 롬 전체에 하나뿐이었고
//      (0xEAAA4), 그 표의 msg 열이 위 정렬과 **593/593 일치**한다.
//
// 글 자체는 디컴프 원문과 대조해 확인했다 — 미국 뱅크 685개가 제어 코드까지
// 포함해 완전 일치한다 (`pnpm verify:dialogue`).
'use strict'
const fs = require('fs')
const path = require('path')
const { writeJson, ROOT } = require('./rom')
const { parseNarc } = require('../spike/gen4text')
const { loadCharmap, decodeBank, toString } = require('./message')
const { readBankNames, alignByCount } = require('./dialogue-verify')

const CHARMAP = path.join(ROOT, 'tools/spike/charmap.txt')
const HEADER_SIZE = 24
const MAP_COUNT = 593
const NO_BANK = 0xffff

/**
 * 로케일별 롬과 맵 헤더 표의 자리.
 *
 * 표는 arm9 안에 있어서 파일로 못 꺼내고 절대 주소로 찍어야 한다. 한국어 롬의
 * 자리는 미국 표에서 msg 열만 뺀 13046바이트를 롬 전체에서 찾아 확정했다 —
 * 후보가 하나뿐이었다.
 *
 * ⚠️ **일본어 롬의 맵 헤더 표 자리는 안 찾았고 찾을 필요도 없다.** 맵이 어느
 * 뱅크를 쓰는지는 **미국 번호**로 적고(산출물의 이름이 그것이다) 로케일 번호로
 * 바꿔 읽는 것은 `textBanks.json`이 한다. 헤더 주소는 그 표를 만들 때 쓴 것이지
 * 뽑을 때 쓰는 것이 아니다
 */
const ROMS = {
  en: { file: 'Pokemon Platinum (US).nds', extracted: 'us', headers: 0xea01c },
  ko: { file: 'Pokemon Platinum (KO).nds', extracted: 'ko', headers: 0xeaaa4 },
  ja: { file: 'Pokemon Platinum (JA).nds', extracted: 'ja', headers: null },
}

/**
 * 항목 수 LCS 정렬이 틀리는 자리. 키가 맞고 정렬이 틀렸다는 것을 확인한 것만 적는다.
 *
 * `ability_names_uppercase`(124칸)는 한국어 롬에 아예 없는데, 정렬은 같은 124칸인
 * ko#606을 짝지었다. 그 뱅크는 `ability_descriptions`다 — 이름 자리에 설명이 들어온다.
 *
 * `greetings_es`는 한국어 롬이 인사말을 하나 더 끼워 넣어(ko#657) 한 칸 밀린다.
 * 정렬은 그 끼어든 뱅크를 짝지었다. 셋 다 3칸이라 수로는 못 가른다.
 */
const LCS_WRONG = {
  us: {},
  ko: { 611: 'ability_names_uppercase', 668: 'greetings_es' },
  /**
   * 일본어는 **꼬리가 통째로 밀린다.** 611번(`ability_names_uppercase`)이 일본어
   * 롬에 없어서 뒤가 한 칸씩 당겨지는데, 701~723은 전부 종별 표(도감 설명·분류·
   * 키·몸무게)라 **항목 수가 494로 다 같다.** 수로는 어느 것이 어느 것인지
   * 가를 수가 없어 정렬이 그대로 밀린 채 붙는다.
   *
   * 키 표가 맞다는 것은 글을 열어 확인했다:
   *   `species_category` 키 698 → "たねポケモン" · 정렬 696 → "　　０．７ｍ"
   *   `species_pokedex_entry_fr` 키 689 → "Au matin de sa vie…" · 정렬 686 → 일본어
   * 그리고 키 표가 적어 둔 일본어 항목 수가 708/708 실제와 맞는다
   */
  ja: {
    611: 'ability_names_uppercase',
    701: 'species_pokedex_entry_fr', 702: 'species_pokedex_entry_de',
    703: 'species_pokedex_entry_it', 704: 'species_pokedex_entry_es',
    705: 'species_pokedex_entry_jp', 706: 'species_pokedex_entry_en',
    707: 'species_weight', 708: 'species_weight_gira',
    709: 'species_height', 710: 'species_height_gira',
    711: 'species_category',
    712: 'species_name_with_natdex_number_en', 713: 'species_name_with_natdex_number_fr',
    714: 'species_name_with_natdex_number_de', 715: 'species_name_with_natdex_number_it',
    716: 'species_name_with_natdex_number_es', 717: 'species_name_with_natdex_number_jp',
    718: 'species_category_en', 719: 'species_category_fr', 720: 'species_category_de',
    721: 'species_category_it', 722: 'species_category_es', 723: 'species_category_jp',
  },
}

/**
 * 미국 뱅크 번호로 색인한 로케일 뱅크 번호.
 *
 * 이제는 헤더의 암호화 키로 확정한 표(src/data/textBanks.json)를 쓴다. 예전의
 * 항목 수 LCS 정렬은 추정이었다 — 여기서 둘을 맞대 보고 어긋나면 터뜨린다.
 */
function bankMap(from, to, locale) {
  if (from === to) return to.map((_, i) => i)
  const table = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/textBanks.json'), 'utf8'))
  const exact = table.map((b) => b.bank[locale])

  const guess = alignByCount(from.map((b) => b.length), to.map((b) => b.length))
  const clash = exact
    .map((v, i) => (guess[i] != null && guess[i] !== v ? i : -1))
    .filter((i) => i >= 0)
  const unexplained = clash.filter((i) => !(i in LCS_WRONG[locale]))
  if (unexplained.length) {
    throw new Error(
      `뱅크 대응이 두 방식에서 어긋난다 (${unexplained.length}곳): ` +
      unexplained.slice(0, 5).map((i) => `#${i} ${table[i].name}: 키 ${exact[i]} ≠ 정렬 ${guess[i]}`).join(', '),
    )
  }
  console.log(`  뱅크 대응 ${exact.length}개를 정렬과 대조 — 이미 아는 정렬 오류 ${clash.length}곳 말고는 일치`)
  return exact
}

function decodeAll(extracted, charmap) {
  const file = path.join(ROOT, 'raw/extracted', extracted, 'pl_msg.narc')
  if (!fs.existsSync(file)) throw new Error(`메시지 아카이브가 없다: ${file}`)
  return parseNarc(fs.readFileSync(file)).map((bank) =>
    decodeBank(bank).map((codes) => toString(codes, charmap)))
}

/** 맵이 쓰는 뱅크 번호 (미국 기준) */
function mapBanks() {
  const rom = fs.readFileSync(path.join(ROOT, 'raw/roms', ROMS.en.file))
  const used = new Set()
  for (let id = 0; id < MAP_COUNT; id++) {
    const msg = rom.readUInt16LE(ROMS.en.headers + id * HEADER_SIZE + 8)
    if (msg !== NO_BANK) used.add(msg)
  }
  return used
}

/** `SCRIPT_RANGE_TABLE`이 쓰는 공용 뱅크 (이름 → 미국 번호) */
function commonBanks(names) {
  const manager = fs.readFileSync(
    path.join(ROOT, 'raw/decomp/src/script_manager.c'), 'utf8',
  )
  const used = new Set()
  for (const m of manager.matchAll(/Entry\(\s*\w+\s*,\s*\w+\s*,\s*(TEXT_BANK_\w+)\s*\)/g)) {
    const at = names.indexOf(m[1])
    if (at >= 0) used.add(at)
  }
  return used
}

/**
 * 맵이 안 가리키지만 필드가 쓰는 뱅크.
 *
 * `TEXT_BANK_GENERIC_NAMES`는 이름 짓기 화면이 제안하는 90개다 — 주인공
 * 남자 18 · 여자 18 …  라이벌 2. 그 자리에서 무작위로 하나를 고르는 것이
 * 기본 이름이라, 우리도 같은 표를 갖고 있어야 한다.
 *
 * `TEXT_BANK_NPC_TRAINER_MESSAGES`는 트레이너 928명의 싸움 전후 대사다.
 * 어느 항목이 누구 것인지는 `trainers.json`의 `msg`가 가리킨다
 */
const EXTRA_BANKS = [
  'TEXT_BANK_GENERIC_NAMES', 'TEXT_BANK_NPC_TRAINER_MESSAGES',
  // 전역 메뉴(`InitGlobalTextMenu`)가 항목 글을 여기서 읽는다
  'TEXT_BANK_MENU_ENTRIES',
  // 메뉴 화면들이 쓰는 글. 스크립트가 안 가리키므로 따로 적어야 한다
  'TEXT_BANK_START_MENU', 'TEXT_BANK_BAG', 'TEXT_BANK_BAG_POCKET_NAMES',
  'TEXT_BANK_PARTY_MENU', 'TEXT_BANK_POKEDEX',
  // 도감 화면의 알맹이. 분류("씨앗포켓몬")·설명문·키·몸무게 넷이 따로 있다.
  // 다이아 판과 펄 판의 설명문이 종마다 달라서, Pt는 다이아 쪽을 쓴다
  'TEXT_BANK_SPECIES_CATEGORY', 'TEXT_BANK_SPECIES_POKEDEX_ENTRY_DIAMOND',
  'TEXT_BANK_SPECIES_HEIGHT', 'TEXT_BANK_SPECIES_WEIGHT',
  // 설정·리포트 화면. 상점은 따로 뱅크가 없고 가방 뱅크(TEXT_BANK_BAG)를 쓴다 —
  // "몇 개 파시겠습니까?"·"용돈"·"예/아니오"가 전부 거기 있다
  'TEXT_BANK_OPTIONS_MENU', 'TEXT_BANK_SAVE_INFO_WINDOW', 'TEXT_BANK_MAIN_MENU_OPTIONS',
  // 인트로. 마박사의 말과 이름 짓기 화면은 필드 스크립트가 아니라 따로 도는
  // 응용 프로그램이라(`applications/rowan_intro`, `naming_screen`) 스크립트가
  // 이 뱅크를 안 가리킨다
  'TEXT_BANK_ROWAN_INTRO', 'TEXT_BANK_NAMING_SCREEN',
  // 기술 설명 468줄. 파티 화면에서 기술에 커서를 올리면 이게 뜬다 —
  // 스크립트가 안 가리키므로 여기 적어야 실린다
  'TEXT_BANK_MOVE_DESCRIPTIONS',
  // 보관 시스템. 박스 이름 18개와 벽지 이름이 앞쪽 뱅크에 있고, 화면이 띄우는
  // 말("박스가 가득 찼다")은 뒤쪽 뱅크다. 박스 화면도 따로 도는 응용 프로그램이라
  // (`applications/pc_boxes`) 스크립트가 이 둘을 안 가리킨다
  'TEXT_BANK_POKEMON_STORAGE_SYSTEM', 'TEXT_BANK_BOX_MESSAGES',
  // 파트너를 고르는 화면. 디컴프도 이름을 못 붙인 뱅크라 번호로 부른다 —
  // `choose_starter_app.c`가 뱅크 360의 0·1~3·4~6·7번을 읽는다
  // (0 "이것은 몬스터볼" · 1~3 고른 볼의 설명 · 4~6 이름표 · 7 "골라라")
  'TEXT_BANK_UNK_0360',
]

function main() {
  const charmap = loadCharmap(CHARMAP)
  const names = readBankNames()
  const en = decodeAll(ROMS.en.extracted, charmap)
  if (en.length !== names.length) {
    throw new Error(`뱅크 이름 ${names.length}개, 미국 롬 ${en.length}개 — 안 맞는다`)
  }

  // 맵이 쓰는 것 + 공용 스크립트가 쓰는 것. 나머지(배틀 UI·프런티어 등)는
  // 스크립트가 가리키지 않으므로 싣지 않는다
  const extra = EXTRA_BANKS.map((name) => {
    const at = names.indexOf(name)
    if (at < 0) throw new Error(`뱅크 이름 표에 ${name}이 없다`)
    return at
  })
  const wanted = [...new Set([...mapBanks(), ...commonBanks(names), ...extra])].sort((a, b) => a - b)

  const written = {}
  for (const [locale, info] of Object.entries(ROMS)) {
    const banks = locale === 'en' ? en : decodeAll(info.extracted, charmap)
    const map = bankMap(en, banks, locale === 'en' ? 'us' : locale)
    let bytes = 0
    let missing = 0
    for (const index of wanted) {
      const at = map[index]
      if (at === null || at === undefined) {
        missing++
        continue
      }
      const out = path.join(ROOT, 'public/data/dialogue', locale, `${index}.json`)
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, JSON.stringify(banks[at]))
      bytes += fs.statSync(out).size
    }
    written[locale] = { bytes, missing }
    if (missing) console.warn(`  ⚠ ${locale}: 짝을 못 찾은 뱅크 ${missing}개`)
  }

  writeJson('dialogue/index.json', {
    /** 미국 뱅크 번호가 이름이다 — 맵 헤더의 msg가 그 번호다 */
    banks: wanted.map((index) => ({
      index,
      name: names[index],
      entries: en[index].length,
    })),
    locales: Object.keys(ROMS),
  })

  console.log(`대사 뱅크 ${wanted.length}개 (맵 ${mapBanks().size} + 공용)`)
  for (const [locale, w] of Object.entries(written)) {
    console.log(`  ${locale} ${(w.bytes / 1024).toFixed(0)}KB`)
  }
}

if (require.main === module) main()
module.exports = { bankMap, mapBanks, commonBanks, ROMS }
