// 직접 덤프: US #408 내용, KO #408/#27 원시 코드, KO 전체 코드 분포
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

function dump(loc, bank, indices) {
  const msgs = decodeBank(narcs[loc][bank])
  console.log(`${loc.toUpperCase()} #${bank} — ${msgs.length}엔트리`)
  for (const i of indices) {
    if (i >= msgs.length) continue
    const raw = [...msgs[i]]
    const s = codesToString(msgs[i], charmap)
    console.log(`  [${i}] "${s.slice(0, 60)}"  codes=[${raw.slice(0, 10).map(c => '0x' + c.toString(16)).join(',')}]`)
  }
}

dump('us', 408, [1, 387])
dump('ko', 408, [1, 387])
dump('ja', 408, [1, 387])
console.log()
dump('ko', 27, [14, 15, 16, 17])

// KO 전체 뱅크 코드 분포 (0xFFFE 인자 처리 제대로: 인자 스킵)
const freq = new Map()
let total = 0
for (let b = 0; b < narcs.ko.length; b++) {
  let msgs; try { msgs = decodeBank(narcs.ko[b]) } catch { continue }
  for (const m of msgs) {
    for (let j = 0; j < m.length; j++) {
      const c = m[j]
      if (c === 0xffff) break
      if (c === 0xfffe) { const n = m[j + 2]; j += 2 + n; continue }
      if (c === 0xf100) break
      total++
      if (!charmap.has(c)) freq.set(c, (freq.get(c) || 0) + 1)
    }
  }
}
const codes = [...freq.keys()].sort((a, b) => a - b)
const unmappedTotal = [...freq.values()].reduce((a, b) => a + b, 0)
console.log(`\nKO 전체: 문자 ${total}개 중 미매핑 ${unmappedTotal}개 (${(unmappedTotal / total * 100).toFixed(1)}%), 코드 ${codes.length}종`)
if (codes.length) {
  console.log(`범위: 0x${codes[0].toString(16)} ~ 0x${codes[codes.length - 1].toString(16)}`)
  // 한글 코드 영역대 히스토그램 (0x400 단위)
  const hist = new Map()
  for (const [c, n] of freq) { const k = c >> 10; hist.set(k, (hist.get(k) || 0) + n) }
  console.log('구간별:', [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([k, n]) => `0x${(k << 10).toString(16)}대:${n}`).join(' '))
}
