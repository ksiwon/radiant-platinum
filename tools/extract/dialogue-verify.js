// 대사 뱅크 검증 (DATA.md §2.11) — 롬에서 푼 글을 디컴프 원문과 맞춰 본다.
//
// 두 가지를 한꺼번에 확인한다:
//
//   ① 뱅크 번호      `generated/text_banks.txt`의 줄 번호가 미국 롬의 뱅크 번호인가
//   ② 디코더         제어 코드까지 포함해 디컴프와 같은 글이 나오는가
//
// 둘 다 틀려도 각각은 그럴듯해 보인다 — 뱅크가 한 칸 밀려도 글은 여전히 글이고,
// 제어 코드를 뭉개도 문장은 읽힌다. 이름으로 짝지어 전량 대조해야 갈린다.
//
// 한국어 뱅크 번호는 미국과 다르다(724 대 714). 그쪽은 항목 수 배열을 맞춰
// 정렬하고, **제어 코드 지문**으로 확인한다 — 언어가 달라도 `{STRVAR_1 3, 0, 0}`이
// 몇 번째에 몇 개 있는지는 같아야 한다.
'use strict'
const fs = require('fs')
const path = require('path')
const { ROOT, messageNarc } = require('./rom')
const { parseNarc } = require('../spike/gen4text')
const { loadCharmap, decodeBank, toString } = require('./message')

// 자리는 어댑터가 정한다 (`tools/raw/sources`) — raw를 정리해도 여기가 안 바뀐다
const DECOMP = require('../raw/sources.cjs').requireDir('references.decomp')
const CHARMAP = path.join(ROOT, 'tools/spike/charmap.txt')

/** 뱅크 이름 → 미국 롬 뱅크 번호. 줄 번호가 곧 번호다 */
function readBankNames() {
  return fs
    .readFileSync(path.join(DECOMP, 'generated/text_banks.txt'), 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 지역판 롬에서 바로 꺼낸다 — 미리 풀어 둔 폴더에 안 기댄다 (`rom.js`) */
function openNarc(locale) {
  return parseNarc(messageNarc(locale === 'us' ? 'en' : locale))
}

/**
 * 빈 칸 메우기 문자. 디컴프가 `"garbage": 5`로 적는 것이 롬에서는 이 코드 5개다
 * (`res/text/battle_bag.json` 4번을 실제로 뜯어 확인했다)
 */
const FILLER = 0x1de

/** 디컴프 원문. `TEXT_BANK_TWINLEAF_TOWN` → `res/text/twinleaf_town.json` */
function readSource(bankName, charmap) {
  const file = path.join(DECOMP, 'res/text', `${bankName.replace(/^TEXT_BANK_/, '').toLowerCase()}.json`)
  if (!fs.existsSync(file)) return null
  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  const filler = charmap.chars.get(FILLER) ?? ''
  return json.messages.map((m) => {
    if (m.en_US === undefined) return filler.repeat(m.garbage ?? 0)
    return Array.isArray(m.en_US) ? m.en_US.join('') : m.en_US
  })
}

/**
 * 제어 코드 지문. 언어가 달라도 같아야 한다.
 * `{STRVAR_1 3, 0, 0}Hi\nthere` → `STRVAR_1 3, 0, 0|\n`
 */
function fingerprint(text) {
  const marks = []
  for (const m of text.matchAll(/\{([^}]*)\}|[\n\r\f]/g)) marks.push(m[1] ?? JSON.stringify(m[0]))
  return marks.join('|')
}

function main() {
  const charmap = loadCharmap(CHARMAP)
  const names = readBankNames()
  const us = openNarc('us')
  const ko = openNarc('ko')

  if (us.length !== names.length) {
    throw new Error(`뱅크 이름 ${names.length}개, 미국 롬 ${us.length}개 — 안 맞는다`)
  }

  // ── ① 미국 뱅크 번호 + 디코더 ──────────────────────────────────────────────
  const decoded = us.map((bank) => decodeBank(bank).map((c) => toString(c, charmap)))
  let named = 0
  let matched = 0
  const bad = []
  for (const [index, name] of names.entries()) {
    const want = readSource(name, charmap)
    if (!want) continue
    named++
    const got = decoded[index]
    if (want.length !== got.length) {
      bad.push(`${name} (#${index}): 항목 수 ${got.length} ≠ ${want.length}`)
      continue
    }
    const diff = want.findIndex((w, i) => w !== got[i])
    if (diff === -1) matched++
    else bad.push(`${name} (#${index}): ${diff}번째 글이 다르다\n    롬   ${JSON.stringify(got[diff])}\n    원문 ${JSON.stringify(want[diff])}`)
  }

  console.log(`미국 뱅크 ${names.length}개 중 디컴프에 원문이 있는 것 ${named}개`)
  console.log(`  글까지 완전 일치 ${matched}`)
  for (const line of bad.slice(0, 15)) console.log(`  ≠ ${line}`)

  // ── ② 한국어 뱅크 번호 ────────────────────────────────────────────────────
  const koDecoded = ko.map((bank) => decodeBank(bank).map((c) => toString(c, charmap)))
  const map = alignByCount(decoded.map((b) => b.length), koDecoded.map((b) => b.length))
  let printed = 0
  let same = 0
  const koBad = []
  for (const [index] of names.entries()) {
    const at = map[index]
    if (at === null) continue
    printed++
    const a = decoded[index].map(fingerprint).join('')
    const b = koDecoded[at].map(fingerprint).join('')
    if (a === b) same++
    else koBad.push(`${names[index]} (us #${index} → ko #${at})`)
  }
  console.log(`한국어 뱅크 ${ko.length}개 — 정렬된 짝 ${printed}개`)
  console.log(`  제어 코드 지문 일치 ${same}`)
  for (const line of koBad.slice(0, 15)) console.log(`  ≠ ${line}`)

  if (bad.length || koBad.length) process.exitCode = 1
}

/**
 * 항목 수 배열로 두 로케일의 뱅크를 맞춘다.
 *
 * 한국어 롬은 미국 롬에서 뱅크 몇 개가 빠진 모양이다(724 → 714). 삭제만 있는
 * 정렬이라 최장 공통 부분수열이 곧 짝이다.
 *
 * @returns {(number|null)[]} 미국 번호로 색인한 한국어 번호
 */
function alignByCount(a, b) {
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out = new Array(n).fill(null)
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out[i] = j
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return out
}

if (require.main === module) main()
module.exports = { readBankNames, openNarc, alignByCount, fingerprint }
