// 추출 파이프라인 공용 롬 접근 (DATA.md §3.1)
//
// NDS 파일시스템과 NARC 컨테이너 파서는 tools/spike/에 있는 것을 그대로 쓴다.
// 스파이크 산출물은 원칙적으로 신뢰하지 않지만 이 둘은 예외다 — land_data 666개,
// zone_event 534개가 전부 크기 합 검증을 통과했으므로 가설이 아니라 실측 확정이다.
// 반대로 charmap과 뱅크 매핑은 실제로 틀린 적이 있어서, 검증된 결과물
// (src/data/textBanks.json + 테스트로 고정된 charmap)만 여기서 소비한다.
'use strict'
const fs = require('fs')
const path = require('path')
const { readRom } = require('../spike/nds')
const { parseNarc, decodeBank, loadCharmap, codesToString } = require('../spike/gen4text')

const ROOT = path.resolve(__dirname, '../..')
const DEFAULT_ROM = path.join(ROOT, 'raw/roms/Pokemon Platinum (US).nds')
const LOCALES = ['en', 'ko', 'ja']
/** textBanks.json은 US 롬 기준이라 로케일 키가 us다 */
const BANK_KEY = { en: 'us', ko: 'ko', ja: 'ja' }

function openRom(romPath = DEFAULT_ROM) {
  if (!fs.existsSync(romPath)) throw new Error(`롬이 없다: ${romPath}`)
  const rom = readRom(romPath)
  return { rom, narc: (p) => parseNarc(rom.read(p)), read: (p) => rom.read(p) }
}

/**
 * 로케일별 메시지 뱅크 접근자.
 * raw/extracted/{us,ko,ja}/pl_msg.narc — 3개 롬에서 각각 뽑아둔 것이다.
 * 뱅크 인덱스는 src/data/textBanks.json에 검증된 매핑이 있다 (PLAN §4.2.1).
 */
function openText() {
  const banks = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/textBanks.json'), 'utf8'))
  const charmap = loadCharmap(path.join(ROOT, 'tools/spike/charmap.txt'))
  const narcs = {}
  for (const loc of LOCALES) {
    const p = path.join(ROOT, 'raw/extracted', BANK_KEY[loc], 'pl_msg.narc')
    if (!fs.existsSync(p)) throw new Error(`메시지 아카이브가 없다: ${p}`)
    narcs[loc] = parseNarc(fs.readFileSync(p))
  }
  return {
    /** @returns {string[]} 뱅크 전체를 문자열 배열로 */
    bank(name, locale) {
      const b = banks.find((x) => x.name === name)
      if (!b) throw new Error(`뱅크 "${name}"이 textBanks.json에 없다`)
      const idx = b[BANK_KEY[locale]]
      const decoded = decodeBank(narcs[locale][idx])
      if (decoded.length !== b.entries) {
        throw new Error(`${name}/${locale} 엔트리 수 불일치: ${decoded.length} ≠ ${b.entries} — 뱅크 매핑이 깨졌다`)
      }
      return decoded.map((codes) => codesToString(codes, charmap))
    },
  }
}

/** public/data 아래에 JSON을 쓰고 크기를 보고한다 */
function writeJson(relPath, data) {
  const file = path.join(ROOT, 'public/data', relPath)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data), 'utf8')
  const kb = (fs.statSync(file).size / 1024).toFixed(1)
  return { file, kb, rel: path.relative(ROOT, file).replace(/\\/g, '/') }
}

module.exports = { openRom, openText, writeJson, ROOT, DEFAULT_ROM, LOCALES }
