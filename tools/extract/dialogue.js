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
 * 일본어는 아직 안 찾았다. 목표 로케일이 아니고, 미국 표로 뽑은 뱅크 번호를
 * 정렬로 옮기면 되므로 급하지 않다.
 */
const ROMS = {
  en: { file: 'Pokemon Platinum (US).nds', extracted: 'us', headers: 0xea01c },
  ko: { file: 'Pokemon Platinum (KO).nds', extracted: 'ko', headers: 0xeaaa4 },
}

/** 미국 뱅크 번호로 색인한 로케일 뱅크 번호 */
function bankMap(from, to) {
  if (from === to) return to.map((_, i) => i)
  return alignByCount(from.map((b) => b.length), to.map((b) => b.length))
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
 * 기본 이름이라, 우리도 같은 표를 갖고 있어야 한다
 */
const EXTRA_BANKS = ['TEXT_BANK_GENERIC_NAMES']

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
    const map = bankMap(en, banks)
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
