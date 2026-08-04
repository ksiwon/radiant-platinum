// 최종 확인: US 종족명(대문자 가설) + KO 대사 샘플 + 로케일 정렬 상태 정량화
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
function tryDecode(b) { try { return decodeBank(b) } catch { return null } }

// 1) US 종족명 — 대문자로 재탐색
for (let b = 0; b < narcs.us.length; b++) {
  const msgs = tryDecode(narcs.us[b])
  if (!msgs || msgs.length < 490) continue
  const s387 = msgs[387] ? codesToString(msgs[387], charmap) : ''
  if (/turtwig/i.test(s387)) {
    console.log(`US 종족명 뱅크: #${b} (${msgs.length}엔트리) [1]="${codesToString(msgs[1], charmap)}" [387]="${s387}" [493]="${codesToString(msgs[493], charmap)}"`)
    break
  }
}

// 2) KO 대사 샘플 — '포켓몬'이 들어간 긴 대사 3개
outer:
for (let b = 100; b < narcs.ko.length; b++) {
  const msgs = tryDecode(narcs.ko[b])
  if (!msgs) continue
  let shown = 0
  for (let i = 0; i < msgs.length; i++) {
    const s = codesToString(msgs[i], charmap)
    if (s.includes('포켓몬') && s.length > 30) {
      console.log(`KO #${b}[${i}]: ${s.slice(0, 90).replace(/\\n|\\r/g, ' / ')}`)
      if (++shown >= 3) break outer
    }
  }
}

// 3) 로케일 정렬: 엔트리 수 시그니처로 몇 %의 뱅크이 같은 인덱스에 있는지
for (const [a, b] of [['us', 'ko'], ['us', 'ja'], ['ko', 'ja']]) {
  const n = Math.min(narcs[a].length, narcs[b].length)
  let same = 0
  for (let i = 0; i < n; i++) {
    const ma = tryDecode(narcs[a][i]), mb = tryDecode(narcs[b][i])
    if (ma && mb && ma.length === mb.length) same++
  }
  console.log(`정렬(${a}↔${b}): 같은 인덱스에서 엔트리 수 일치 ${same}/${n} (${(same / n * 100).toFixed(0)}%)`)
}
