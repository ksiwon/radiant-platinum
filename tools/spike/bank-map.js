// 로케일별 텍스트 뱅크 대응표 생성 (PLAN §4.2)
//
// pl_msg.narc의 뱅크 순서는 지역마다 다르다(us 724 / ko 714 / ja 709개). 영어는 대문자 변형
// 뱅크를 따로 가져서 CJK 대비 1:다 관계라 전단사 매핑이 성립하지 않는다.
//
// 판별 전략:
//  ① 알려진 영어 문자열로 us 뱅크를 특정
//  ② 엔트리 수가 같은 ko/ja 후보를 추림 (엔트리 수가 고유한 뱅크는 8%뿐이라 이것만으로는 부족)
//  ③ 전체 LCS 정렬로 예측 위치를 구해, 그에 가장 가까운 후보를 선택
//     — 뱅크 순서는 지역 간에 보존되고 드리프트는 인덱스에 대해 단조 증가한다
//  ④ 3로케일 샘플을 찍어 번역쌍인지 눈으로 검증
'use strict'
const fs = require('fs')
const path = require('path')
const { parseNarc, decodeBank, loadCharmap, codesToString } = require('./gen4text')

const root = path.resolve(__dirname, '..', '..')
const LOCALES = ['us', 'ko', 'ja']
const charmap = loadCharmap(path.join(__dirname, 'charmap.txt'))

const narcs = {}
for (const loc of LOCALES) {
  narcs[loc] = parseNarc(fs.readFileSync(path.join(root, 'raw', 'extracted', loc, 'pl_msg.narc')))
}

const cache = new Map()
function decoded(loc, i) {
  const k = `${loc}:${i}`
  if (!cache.has(k)) {
    try { cache.set(k, decodeBank(narcs[loc][i])) } catch { cache.set(k, null) }
  }
  return cache.get(k)
}
const str = (loc, b, i) => {
  const m = decoded(loc, b)
  return m && m[i] ? codesToString(m[i], charmap).trim() : ''
}
const counts = (loc) => narcs[loc].map((_, i) => { const m = decoded(loc, i); return m ? m.length : -1 })
const profile = (loc, bank) => decoded(loc, bank).map((m) => m.length)
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)

/**
 * 서로 다른 엔트리의 비율. 실제 데이터 뱅크(이름·설명)는 거의 1.0이고,
 * 자리표시자 뱅크는 같은 값("－" 등)이 반복돼 크게 낮다. 언어에 무관한 신호다.
 */
function distinctRatio(loc, bank) {
  const msgs = decoded(loc, bank)
  if (!msgs.length) return 0
  const seen = new Set()
  for (const m of msgs) seen.add(Array.from(m).join(','))
  return seen.size / msgs.length
}

// --- LCS 정렬: 엔트리 수 시퀀스의 순서 보존 최장 매칭 ---
function align(a, b) {
  const n = a.length, m = b.length
  let prev = new Int32Array(m + 1), cur = new Int32Array(m + 1)
  const choice = []
  for (let i = 1; i <= n; i++) {
    const row = new Uint8Array(m + 1)
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] >= 0 && a[i - 1] === b[j - 1]) { cur[j] = prev[j - 1] + 1; row[j] = 1 }
      else if (prev[j] >= cur[j - 1]) { cur[j] = prev[j]; row[j] = 2 }
      else { cur[j] = cur[j - 1]; row[j] = 3 }
    }
    choice.push(row)
    const t = prev; prev = cur; cur = t; cur.fill(0)
  }
  const pairs = []
  let i = n, j = m
  while (i > 0 && j > 0) {
    const d = choice[i - 1][j]
    if (d === 1) { pairs.push([i - 1, j - 1]); i--; j-- } else if (d === 2) i--; else j--
  }
  return pairs.reverse()
}

const usCounts = counts('us')
const lcs = {}
for (const loc of ['ko', 'ja']) lcs[loc] = new Map(align(usCounts, counts(loc)))

/** LCS에 직접 대응이 없으면 좌우 최근접 대응점으로 선형 보간해 위치를 예측한다 */
function predict(loc, usBank) {
  const m = lcs[loc]
  if (m.has(usBank)) return m.get(usBank)
  let lo = null, hi = null
  for (let d = 1; d < 60 && (lo === null || hi === null); d++) {
    if (lo === null && m.has(usBank - d)) lo = [usBank - d, m.get(usBank - d)]
    if (hi === null && m.has(usBank + d)) hi = [usBank + d, m.get(usBank + d)]
  }
  if (lo && hi) {
    const t = (usBank - lo[0]) / (hi[0] - lo[0])
    return Math.round(lo[1] + t * (hi[1] - lo[1]))
  }
  if (lo) return lo[1] + (usBank - lo[0])
  if (hi) return hi[1] - (hi[0] - usBank)
  return usBank
}

const PROBES = [
  { name: 'species_names',  at: 1, needle: 'BULBASAUR',     samples: [1, 387, 493] },
  { name: 'move_names',     at: 1, needle: 'POUND',         samples: [1, 33, 57] },
  { name: 'ability_names',  at: 1, needle: 'STENCH',        samples: [1, 65, 66] },
  { name: 'item_names',     at: 1, needle: 'MASTER BALL',   samples: [1, 2, 4] },
  { name: 'type_names',     at: 0, needle: 'NORMAL',        samples: [0, 1, 10] },
  { name: 'nature_names',   at: 0, needle: 'Hardy',         samples: [0, 1, 2] },
  { name: 'location_names', at: 1, needle: 'Twinleaf Town', samples: [1, 2, 3] },
]

function findUs(probe) {
  const hits = []
  for (let b = 0; b < narcs.us.length; b++) {
    const m = decoded('us', b)
    if (!m || m.length <= probe.at) continue
    if (codesToString(m[probe.at], charmap).trim().toUpperCase() === probe.needle.toUpperCase()) {
      hits.push({ bank: b, count: m.length })
    }
  }
  return hits
}

console.log('로케일별 뱅크 수:', LOCALES.map((l) => `${l}=${narcs[l].length}`).join('  '))
for (const loc of ['ko', 'ja']) console.log(`  LCS 대응 us→${loc}: ${lcs[loc].size}/${narcs.us.length}`)
console.log()

const table = []
for (const probe of PROBES) {
  const hits = findUs(probe)
  if (!hits.length) { console.log(`✗ ${probe.name}: us에서 "${probe.needle}" 못 찾음`); continue }
  const primary = hits[0]
  const entry = { name: probe.name, entries: primary.count, us: primary.bank, ko: null, ja: null }
  if (hits.length > 1) entry.usVariants = hits.map((h) => h.bank)

  const notes = []
  for (const loc of ['ko', 'ja']) {
    const cands = []
    for (let b = 0; b < narcs[loc].length; b++) {
      const m = decoded(loc, b)
      if (m && m.length === primary.count) cands.push(b)
    }
    if (!cands.length) { notes.push(`${loc}: 같은 엔트리 수(${primary.count}) 뱅크 없음`); continue }

    // ③ LCS로 이웃을 좁히고, ④ 평균 길이비로 이름/설명 뱅크를 가른다.
    // 이름 뱅크와 설명 뱅크는 엔트리 수가 같고 서로 인접해 있어 위치만으로는 구분되지 않는다.
    // 반면 길이는 결정적으로 다르다 (이름 ~5코드 / 설명 ~50코드).
    // ③ 종류 필터 → ④ LCS 예측 위치에 가장 가까운 것.
    // 이름 뱅크와 설명 뱅크는 엔트리 수가 같고 인접해 있어 위치만으로는 갈리지 않는다.
    // 길이 '비율'은 언어마다 흔들려서 못 쓴다 — 절대 기준이 안정적이다:
    // 이름은 어느 언어에서든 짧고(<20코드) 설명은 길다. 빈 뱅크(플레이스홀더)는 제외한다.
    const SHORT_MAX = 20
    const p = predict(loc, primary.bank)
    const usIsShort = mean(profile('us', primary.bank)) < SHORT_MAX

    const all = cands.map((b) => ({
      bank: b, m: mean(profile(loc, b)), dist: Math.abs(b - p), dr: distinctRatio(loc, b),
    }))
    const typed = all
      .filter((c) => c.m > 1)                     // 빈 뱅크 제외
      .filter((c) => c.dr > 0.8)                  // 자리표시자 뱅크 제외 (같은 값 반복)
      .filter((c) => (c.m < SHORT_MAX) === usIsShort)
    const pool = typed.length ? typed : all
    pool.sort((x, y) => x.dist - y.dist)

    entry[loc] = pool[0].bank
    entry[`${loc}Drift`] = primary.bank - pool[0].bank
    const margin = pool.length > 1 ? pool[1].dist - pool[0].dist : 99
    entry[`${loc}Confidence`] = pool[0].dist <= 4 && typed.length > 0 ? 'high' : 'low'
    if (cands.length > 1) {
      notes.push(
        `${loc}: 후보 ${cands.length}개 → ${usIsShort ? '이름형(짧음)' : '설명형(김)'} ${typed.length}개 → ` +
        `예측 #${p} 최근접 #${pool[0].bank} (거리 ${pool[0].dist}, 평균길이 ${pool[0].m.toFixed(1)}` +
        (pool.length > 1 ? `, 차점 #${pool[1].bank} 거리 ${pool[1].dist}` : '') + `, 여유 ${margin})`,
      )
    }
  }

  const variantNote = hits.length > 1 ? `  us 변형 ${hits.map((h) => '#' + h.bank).join(',')}` : ''
  console.log(
    `▸ ${probe.name}  ${primary.count}엔트리  us#${entry.us} ko#${entry.ko}(+${entry.koDrift}) ja#${entry.ja}(+${entry.jaDrift})${variantNote}`,
  )
  for (const n of notes) console.log(`    ! ${n}`)
  for (const s of probe.samples) {
    console.log(`    [${s}] ` + LOCALES.map((l) => (entry[l] == null ? `${l}:—` : `${l}:"${str(l, entry[l], s)}"`)).join('  '))
  }
  console.log()
  table.push(entry)
}

const outPath = path.join(root, 'src', 'data', 'textBanks.json')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(table, null, 2) + '\n', 'utf8')
console.log(`→ ${path.relative(root, outPath)} 에 ${table.length}개 뱅크 기록`)
