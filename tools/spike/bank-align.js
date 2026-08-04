// 로케일 간 텍스트 뱅크 정렬 분석 (PLAN §4.2)
// pl_msg.narc의 뱅크 순서가 지역마다 다르다. 인덱스로는 en/ko/ja를 같은 데이터로 취급할 수 없다.
// 엔트리 수 시퀀스를 LCS로 정렬해 대응표를 만들고, 내용 기반 앵커로 검증한다.
'use strict'
const fs = require('fs')
const path = require('path')
const { parseNarc, decodeBank, loadCharmap, codesToString } = require('./gen4text')

const root = path.resolve(__dirname, '..', '..')
const LOCALES = ['us', 'ko', 'ja']
const charmap = loadCharmap(path.join(__dirname, 'charmap.txt'))

function tryDecode(b) {
  try { return decodeBank(b) } catch { return null }
}

/** 뱅크별 시그니처: 엔트리 수 (언어 독립). 내용 길이는 언어마다 달라 못 쓴다. */
function signatures(files) {
  return files.map((buf, i) => {
    const msgs = tryDecode(buf)
    if (!msgs) return { i, count: -1, ok: false }
    return { i, count: msgs.length, ok: true }
  })
}

/**
 * LCS 정렬. 엔트리 수가 같은 뱅크만 대응 후보로 보고, 순서를 보존하는 최장 매칭을 찾는다.
 * 뱅크는 지역마다 삽입/삭제될 뿐 상대 순서는 유지된다는 가정.
 */
function align(a, b) {
  const n = a.length, m = b.length
  let prev = new Int32Array(m + 1)
  let cur = new Int32Array(m + 1)
  const choice = []
  for (let i = 1; i <= n; i++) {
    const row = new Uint8Array(m + 1)
    for (let j = 1; j <= m; j++) {
      if (a[i - 1].ok && b[j - 1].ok && a[i - 1].count === b[j - 1].count) {
        cur[j] = prev[j - 1] + 1
        row[j] = 1 // diag = 대응
      } else if (prev[j] >= cur[j - 1]) {
        cur[j] = prev[j]; row[j] = 2
      } else {
        cur[j] = cur[j - 1]; row[j] = 3
      }
    }
    choice.push(row)
    const t = prev; prev = cur; cur = t
    cur.fill(0)
  }
  const pairs = []
  let i = n, j = m
  while (i > 0 && j > 0) {
    const d = choice[i - 1][j]
    if (d === 1) { pairs.push([i - 1, j - 1]); i--; j-- }
    else if (d === 2) i--
    else j--
  }
  pairs.reverse()
  return pairs
}

/** 내용 기반 앵커 — 각 로케일에서 독립적으로 찾아 정렬 결과를 교차 검증한다 */
const ANCHORS = [
  { name: '종족명', index: 387, min: 490, max: 560, probe: { us: 'TURTWIG', ko: '모부기', ja: 'ナエトル' } },
  { name: '종족명', index: 493, min: 490, max: 560, probe: { us: 'ARCEUS', ko: '아르세우스', ja: 'アルセウス' } },
]

function findBank(files, entryIndex, expect, min, max) {
  for (let b = 0; b < files.length; b++) {
    const msgs = tryDecode(files[b])
    if (!msgs || msgs.length < min || msgs.length > max) continue
    if (!msgs[entryIndex]) continue
    if (codesToString(msgs[entryIndex], charmap).trim() === expect) return b
  }
  return -1
}

const narcs = {}
const sigs = {}
for (const loc of LOCALES) {
  narcs[loc] = parseNarc(fs.readFileSync(path.join(root, 'raw', 'extracted', loc, 'pl_msg.narc')))
  sigs[loc] = signatures(narcs[loc])
  const ok = sigs[loc].filter((s) => s.ok).length
  console.log(`${loc}: 뱅크 ${narcs[loc].length}개 (디코드 성공 ${ok})`)
}

console.log('\n=== 내용 기반 앵커 ===')
const anchorBanks = []
for (const a of ANCHORS) {
  const found = {}
  for (const loc of LOCALES) found[loc] = findBank(narcs[loc], a.index, a.probe[loc], a.min, a.max)
  console.log(`  ${a.name}[${a.index}]="${a.probe.us}" → us#${found.us} ko#${found.ko} ja#${found.ja}`)
  anchorBanks.push(found)
}

console.log('\n=== LCS 정렬 (기준: us) ===')
const maps = {}
for (const loc of ['ko', 'ja']) {
  const pairs = align(sigs.us, sigs[loc])
  maps[loc] = new Map(pairs)
  const identity = pairs.filter(([x, y]) => x === y).length
  console.log(
    `  us→${loc}: ${pairs.length}/${narcs.us.length} 대응 (같은 인덱스 ${identity}, 어긋난 것 ${pairs.length - identity})`,
  )
  for (const f of anchorBanks) {
    if (f.us < 0) continue
    const got = maps[loc].get(f.us)
    console.log(`     앵커 us#${f.us} → ${loc}#${got} / 실제 ${loc}#${f[loc]} — ${got === f[loc] ? 'OK' : 'MISMATCH'}`)
  }
}

console.log('\n=== 오프셋 분포 (us 인덱스 - 대상 인덱스), 상위 6 ===')
for (const loc of ['ko', 'ja']) {
  const hist = new Map()
  for (const [u, t] of maps[loc]) hist.set(u - t, (hist.get(u - t) ?? 0) + 1)
  const top = [...hist].sort((a, b) => b[1] - a[1]).slice(0, 6)
  console.log(`  ${loc}: ` + top.map(([d, c]) => `${d >= 0 ? '+' : ''}${d}:${c}개`).join('  '))
}

console.log('\n=== 대응 실패한 us 뱅크 (앞 20개) ===')
for (const loc of ['ko', 'ja']) {
  const missing = []
  for (let i = 0; i < narcs.us.length; i++) if (!maps[loc].has(i)) missing.push(i)
  console.log(`  ${loc}: ${missing.length}개 — ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ' …' : ''}`)
}
