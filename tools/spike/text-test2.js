// 정밀 진단: 로케일별 종족명 뱅크 독립 탐색 + KO 한글 매핑 가설 검증 + 정렬 이슈 정량화
'use strict'
const fs = require('fs')
const path = require('path')
const { parseNarc, decodeBank, loadCharmap, codesToString } = require('./gen4text')

const root = path.resolve(__dirname, '..', '..')
const charmap = loadCharmap(path.join(__dirname, 'charmap.txt'))

const narcs = {}
for (const loc of ['us', 'ko', 'ja']) {
  narcs[loc] = parseNarc(fs.readFileSync(path.join(root, 'raw', 'extracted', loc, 'pl_msg.narc')))
}

function tryDecode(bank) { try { return decodeBank(bank) } catch { return null } }

// 1) 디코드 실패율
for (const loc of ['us', 'ko', 'ja']) {
  let fail = 0
  for (const b of narcs[loc]) if (!tryDecode(b)) fail++
  console.log(`${loc.toUpperCase()}: ${narcs[loc].length}뱅크 중 디코드 실패 ${fail}`)
}

// 2) 종족명 뱅크 — 로케일별 독립 탐색
function findBank(loc, predicate) {
  const out = []
  for (let b = 0; b < narcs[loc].length; b++) {
    const msgs = tryDecode(narcs[loc][b])
    if (!msgs) continue
    if (predicate(msgs, b)) out.push(b)
  }
  return out
}

const usSpecies = findBank('us', msgs => msgs.some(m => codesToString(m, charmap) === 'Turtwig'))
const jaSpecies = findBank('ja', msgs => msgs.some(m => codesToString(m, charmap) === 'ナエトル'))
console.log(`\nUS 종족명 뱅크: ${usSpecies.join(',')} / JA: ${jaSpecies.join(',')}`)

if (usSpecies.length) {
  const msgs = decodeBank(narcs.us[usSpecies[0]])
  console.log(`US #${usSpecies[0]} (${msgs.length}엔트리) [1]=${codesToString(msgs[1], charmap)} [387]=${codesToString(msgs[387], charmap)} [493]=${codesToString(msgs[493], charmap)}`)
}
if (jaSpecies.length) {
  const msgs = decodeBank(narcs.ja[jaSpecies[0]])
  console.log(`JA #${jaSpecies[0]} (${msgs.length}엔트리) [1]=${codesToString(msgs[1], charmap)} [387]=${codesToString(msgs[387], charmap)}`)
}

// 3) KO 종족명 뱅크: 엔트리 수가 US 종족명 뱅크과 같은 뱅크들 중, 미매핑 코드 비중 높은 것
if (usSpecies.length) {
  const targetLen = decodeBank(narcs.us[usSpecies[0]]).length
  const koCands = findBank('ko', msgs => msgs.length === targetLen)
  console.log(`\nKO에서 엔트리 ${targetLen}개짜리 뱅크: ${koCands.join(',')}`)
  for (const b of koCands.slice(0, 6)) {
    const msgs = decodeBank(narcs.ko[b])
    const raw1 = [...msgs[1]].filter(c => c !== 0xffff)
    const mapped = codesToString(msgs[1], charmap)
    console.log(`  KO #${b}: [1] codes=[${raw1.slice(0, 8).map(c => '0x' + c.toString(16)).join(',')}] mapped="${mapped}"`)
  }
}

// 4) KO 임의 대사 뱅크에서 코드 분포 확인 (한글 코드 범위 파악)
const freq = new Map()
for (let b = 300; b < Math.min(400, narcs.ko.length); b++) {
  const msgs = tryDecode(narcs.ko[b])
  if (!msgs) continue
  for (const m of msgs) for (const c of m) {
    if (c === 0xffff || c === 0xfffe) break
    if (!charmap.has(c)) freq.set(c, (freq.get(c) || 0) + 1)
  }
}
const codes = [...freq.keys()].sort((a, b) => a - b)
console.log(`\nKO 뱅크 300~399 미매핑 코드: ${codes.length}종, 범위 0x${codes[0]?.toString(16)}~0x${codes[codes.length - 1]?.toString(16)}`)
console.log(`최빈 20개: ${[...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([c]) => '0x' + c.toString(16)).join(',')}`)
