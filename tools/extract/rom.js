// 추출 파이프라인 공용 롬 접근 (DATA.md §3.1)
//
// NDS 파일시스템과 NARC 컨테이너 파서는 tools/spike/에 있는 것을 그대로 쓴다.
// 스파이크 산출물은 원칙적으로 신뢰하지 않지만 이 둘은 예외다 — land_data 666개,
// zone_event 534개가 전부 크기 합 검증을 통과했으므로 가설이 아니라 실측 확정이다.
// 반대로 charmap과 뱅크 매핑은 실제로 틀린 적이 있어서, 검증된 결과물
// (src/data/textBanks.json + 테스트로 고정된 charmap)만 여기서 소비한다.
//
// ⚠️ **글 디코더는 `./message`만 쓴다.** `spike/gen4text.js`에도 하나 있지만 그것은
// 이름표용이라 charmap의 `\n`을 **글자 두 개 그대로** 둔다 — 이름에는 줄 바꿈이
// 없어서 안 걸렸고, 아이템 설명이 화면에 `상처약.\n포켓몬`으로 뜨고 나서야 보였다.
'use strict'
const fs = require('fs')
const path = require('path')
const { readRom } = require('../spike/nds')
const { parseNarc } = require('../spike/gen4text')
const { loadCharmap, decodeBank, toString: codesToString } = require('./message')

const sources = require('../raw/sources.cjs')

const ROOT = path.resolve(__dirname, '../..')
// ⚠️ **파일 이름을 적어 두지 않는다.** 여기 `Pokemon Platinum (US).nds`가
// 박혀 있었다 — 그 이름은 이 기계에서 붙인 것이고, 같은 롬을 다른 이름으로 둔
// 사람에게는 "롬이 없다"가 된다. 헤더의 게임 코드로 찾는다 (`tools/raw/sources`)
const LOCALES = ['en', 'ko', 'ja']
/** textBanks.json은 US 롬 기준이라 로케일 키가 us다 */
const BANK_KEY = { en: 'us', ko: 'ko', ja: 'ja' }

function openRom(romPath = sources.requirePlatinumRom('en')) {
  if (!fs.existsSync(romPath)) throw new Error(`롬이 없다: ${romPath}`)
  const rom = readRom(romPath)
  return {
    rom,
    narc: (p) => parseNarc(rom.read(p)),
    read: (p) => rom.read(p),
    overlay: (id) => overlay(rom, id),
  }
}

/**
 * arm9 오버레이 하나를 통째로.
 *
 * 오버레이는 파일시스템(FNT)에 이름이 없어서 `read('/...')`로는 못 꺼낸다. 헤더의
 * 오버레이 표(+0x50)가 오버레이 번호 → 파일 번호를 주고, 그 파일 번호로 FAT를 본다.
 *
 * 배틀 상수표처럼 NARC에 안 담긴 데이터가 여기 들어 있다 (DATA.md §2.10)
 */
function overlay(rom, id) {
  const { buf } = rom
  const tableOff = buf.readUInt32LE(0x50)
  const tableSize = buf.readUInt32LE(0x54)
  const count = tableSize / 32
  if (id < 0 || id >= count) throw new Error(`오버레이 #${id}가 없다 (전체 ${count}개)`)
  const entry = tableOff + id * 32
  // 압축된 오버레이는 그대로 읽으면 안 된다. 지금 쓰는 것들은 전부 비압축이다
  const compressed = buf.readUInt32LE(entry + 28) & 0xffffff
  if (compressed) throw new Error(`오버레이 #${id}는 압축돼 있다 — 풀어야 읽을 수 있다`)
  const fileId = buf.readUInt32LE(entry + 24) & 0xffffff
  const fatOff = buf.readUInt32LE(0x48)
  const start = buf.readUInt32LE(fatOff + fileId * 8)
  const end = buf.readUInt32LE(fatOff + fileId * 8 + 4)
  return buf.subarray(start, end)
}

/**
 * 로케일별 메시지 뱅크 접근자.
 * raw/extracted/{us,ko,ja}/pl_msg.narc — 3개 롬에서 각각 뽑아둔 것이다.
 * 뱅크 인덱스 표는 `pnpm extract:textbanks`가 굽는다 (PLAN §4.2.1).
 *
 * ⚠️ **리포 안이 아니라 `raw/work/`다.** 한때 `src/data/textBanks.json`을
 * 추적했는데 그 표에 롬에서 읽은 키가 들어 있어서 빼냈고(COPYRIGHT.md §5),
 * 읽는 쪽이 옛 자리를 그대로 가리키고 있었다 — 그래서 글이 필요한 추출기가
 * 전부 `ENOENT`로 섰다
 */
function openText() {
  const table = path.join(ROOT, 'raw/work/textBanks.json')
  if (!fs.existsSync(table)) {
    throw new Error(`뱅크 표가 없다: ${table} — 먼저 \`pnpm extract:textbanks\`를 돌린다`)
  }
  const banks = JSON.parse(fs.readFileSync(table, 'utf8'))
  const charmap = loadCharmap(path.join(ROOT, 'tools/spike/charmap.txt'))
  const narcs = {}
  for (const loc of LOCALES) {
    const p = path.join(sources.requireDir('platinum.extracted'), BANK_KEY[loc], 'pl_msg.narc')
    if (!fs.existsSync(p)) throw new Error(`메시지 아카이브가 없다: ${p}`)
    narcs[loc] = parseNarc(fs.readFileSync(p))
  }
  return {
    /** @returns {string[]} 뱅크 전체를 문자열 배열로 */
    bank(name, locale) {
      const b = banks.find((x) => x.name === name)
      if (!b) throw new Error(`뱅크 "${name}"이 textBanks.json에 없다`)
      const key = BANK_KEY[locale]
      const idx = b.bank[key]
      if (idx === null) throw new Error(`뱅크 "${name}"은 ${locale} 롬에 없다`)
      const decoded = decodeBank(narcs[locale][idx])
      // 엔트리 수는 표가 롬에서 직접 읽은 값이다. 어긋나면 인덱스가 밀린 것이다
      if (decoded.length !== b.entries[key]) {
        throw new Error(`${name}/${locale} 엔트리 수 불일치: ${decoded.length} ≠ ${b.entries[key]} — 뱅크 매핑이 깨졌다`)
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

// 은 없어졌다 — 롬 자리는 어댑터가 헤더로 찾는다 ()
module.exports = { openRom, openText, writeJson, ROOT, LOCALES, sources }
