// 스파이크 검증: US에서 종족명 뱅크을 찾고, 같은 인덱스를 KO/JA에서 디코드해 로케일 정렬 확인
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
console.log(`뱅크 수 — US: ${narcs.us.length} / KO: ${narcs.ko.length} / JA: ${narcs.ja.length}`)

// 1) US 전체 뱅크에서 "Turtwig"(모부기 영문명)이 들어있는 뱅크 탐색
let speciesBank = -1
for (let b = 0; b < narcs.us.length; b++) {
  try {
    const msgs = decodeBank(narcs.us[b])
    if (msgs.length < 400) continue // 종족명 뱅크은 493+ 엔트리
    const sample = msgs.slice(1, 500).map(m => codesToString(m, charmap))
    if (sample.includes('Turtwig') && sample.includes('Bulbasaur')) { speciesBank = b; break }
  } catch { /* 뱅크 포맷 예외 무시 */ }
}
console.log(`종족명 뱅크: #${speciesBank}`)

if (speciesBank >= 0) {
  const idx = [1, 25, 387, 389, 391, 487] // 이상해씨, 피카츄, 모부기, 불꽃숭이, 팽도리, 기라티나
  for (const loc of ['us', 'ko', 'ja']) {
    const msgs = decodeBank(narcs[loc][speciesBank])
    const names = idx.map(i => codesToString(msgs[i], charmap))
    console.log(`${loc.toUpperCase()} (${msgs.length}엔트리): ${names.join(' | ')}`)
  }
}

// 2) 대사 샘플 — 임의 대형 뱅크 하나에서 첫 문장들 (로우 박사 인트로 등 확인용)
console.log('\n--- 대사 샘플 (US 뱅크 서치: "Welcome" 포함 뱅크) ---')
for (let b = 0; b < narcs.us.length; b++) {
  try {
    const msgs = decodeBank(narcs.us[b])
    const strs = msgs.slice(0, 30).map(m => codesToString(m, charmap))
    const hit = strs.findIndex(s => s.includes('Welcome') || s.includes('world of Pok'))
    if (hit >= 0) {
      console.log(`US 뱅크 #${b} msg#${hit}: ${strs[hit].slice(0, 120)}`)
      for (const loc of ['ko', 'ja']) {
        const m2 = decodeBank(narcs[loc][b])
        if (m2.length > hit) console.log(`${loc.toUpperCase()} 뱅크 #${b} msg#${hit}: ${codesToString(m2[hit], charmap).slice(0, 120)}`)
      }
      break
    }
  } catch { }
}

// 3) KO 미매핑 코드 분포 — 한글 테이블 리스크 정량화
const koCodes = new Map()
try {
  const msgs = decodeBank(narcs.ko[speciesBank])
  for (const m of msgs.slice(1, 494)) {
    for (const c of m) {
      if (c === 0xffff) break
      if (!charmap.has(c)) koCodes.set(c, (koCodes.get(c) || 0) + 1)
    }
  }
} catch { }
const sorted = [...koCodes.keys()].sort((a, b) => a - b)
console.log(`\nKO 종족명에서 US charmap에 없는 코드: ${sorted.length}종`)
if (sorted.length) {
  console.log(`범위: 0x${sorted[0].toString(16)} ~ 0x${sorted[sorted.length - 1].toString(16)}`)
  // 선형 매핑 가설 검증: 코드 오름차순 = 유니코드 가나다순이면 base 오프셋으로 즉시 변환 가능
  const first = sorted[0]
  const guess = [...decodeBank(narcs.ko[speciesBank])[1]].filter(c => c !== 0xffff)
    .map(c => charmap.has(c) ? charmap.get(c) : String.fromCharCode(0xac00 + (c - first)))
    .join('')
  console.log(`선형 매핑 가설(base=0x${first.toString(16)}→U+AC00)로 이상해씨: "${guess}"`)
}
