// 뱅크 이름을 헤더의 암호화 키로 확정한다 (PLAN §4.2)
//
// 기존 bank-map.js는 "알려진 영어 문자열 → us 뱅크 → LCS 드리프트 → ko/ja"라는
// 휴리스틱이었다. 뱅크 9개밖에 못 짚었고 confidence 필드가 붙어 있다.
//
// 디컴프의 res/text/*.json에는 뱅크마다 `key`가 적혀 있고, 그 키는 pl_msg.narc의
// 각 뱅크 헤더 +2에 그대로 들어간다. (키, 엔트리 수) 쌍이 고유하면 이름이 확정된다.
// 이 스크립트는 그 고유성을 먼저 재고, 확정된 것만 표로 낸다.
'use strict'
const fs = require('fs')
const path = require('path')
const { parseNarc } = require('./gen4text')

const root = path.resolve(__dirname, '..', '..')
const LOCALES = ['us', 'ko', 'ja']

const narcs = {}
for (const loc of LOCALES) {
  narcs[loc] = parseNarc(fs.readFileSync(path.join(root, 'raw', 'extracted', loc, 'pl_msg.narc')))
}

/** 뱅크 헤더: u16 엔트리 수, u16 키 */
const head = (buf) => (buf.length < 4 ? null : { count: buf.readUInt16LE(0), key: buf.readUInt16LE(2) })

// --- 디컴프 쪽 ---
const dir = path.join(root, 'raw', 'decomp', 'res', 'text')
const decomp = []
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.json')) continue
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  if (typeof j.key !== 'number' || !Array.isArray(j.messages)) continue
  decomp.push({ name: f.slice(0, -5), key: j.key, count: j.messages.length })
}
console.log(`디컴프 텍스트 뱅크 ${decomp.length}개`)

const dup = new Map()
for (const d of decomp) {
  const k = `${d.key}/${d.count}`
  if (!dup.has(k)) dup.set(k, [])
  dup.get(k).push(d.name)
}
const ambiguous = [...dup.entries()].filter(([, v]) => v.length > 1)
console.log(`(키,엔트리) 쌍 ${dup.size}개 — 겹치는 쌍 ${ambiguous.length}개`)
for (const [k, v] of ambiguous.slice(0, 10)) console.log(`  ! ${k}: ${v.join(', ')}`)

// --- 롬 쪽 ---
for (const loc of LOCALES) {
  const seen = new Map()
  for (let i = 0; i < narcs[loc].length; i++) {
    const h = head(narcs[loc][i])
    if (!h) continue
    const k = `${h.key}/${h.count}`
    if (!seen.has(k)) seen.set(k, [])
    seen.get(k).push(i)
  }
  const collide = [...seen.values()].filter((v) => v.length > 1).length
  const matched = decomp.filter((d) => (seen.get(`${d.key}/${d.count}`) || []).length === 1).length
  const missing = decomp.filter((d) => !seen.has(`${d.key}/${d.count}`)).length
  console.log(
    `${loc}: 뱅크 ${narcs[loc].length}개 / 롬 안에서 겹치는 쌍 ${collide}개 / ` +
    `디컴프 이름 중 유일하게 짚히는 것 ${matched}개 / 아예 없는 것 ${missing}개`,
  )
}

// 키+엔트리로 안 짚히는 것들. 키가 같은 뱅크가 몇 개인지 본다
for (const loc of ['ko', 'ja']) {
  const byKey = new Map()
  for (let i = 0; i < narcs[loc].length; i++) {
    const h = head(narcs[loc][i])
    if (!h) continue
    if (!byKey.has(h.key)) byKey.set(h.key, [])
    byKey.get(h.key).push({ bank: i, count: h.count })
  }
  const seen = new Set()
  for (let i = 0; i < narcs[loc].length; i++) {
    const h = head(narcs[loc][i])
    if (h) seen.add(`${h.key}/${h.count}`)
  }
  const missed = decomp.filter((d) => !seen.has(`${d.key}/${d.count}`))
  console.log(`\n${loc}: 엔트리 수가 어긋나는 뱅크 ${missed.length}개`)
  for (const d of missed) {
    const cands = byKey.get(d.key) || []
    console.log(
      `  ${d.name}: us ${d.count}엔트리 → ${loc} 후보 ${cands.length}개` +
      (cands.length ? ` [${cands.map((c) => `#${c.bank}:${c.count}`).join(' ')}]` : ''),
    )
  }
}
