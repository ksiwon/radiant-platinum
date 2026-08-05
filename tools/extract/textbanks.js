// 텍스트 뱅크 대응표 (DATA.md §2.11)
//
// pl_msg.narc의 뱅크 순서는 지역마다 다르다 (us 724 / ko 714 / ja 709개).
// 인덱스로 참조하면 로케일을 바꾸는 순간 엉뚱한 글이 나온다.
//
// 세 가지가 맞물려 이름을 확정한다:
//  ① generated/text_banks.txt — us 뱅크 순서 그대로. 줄 번호 - 1이 인덱스다
//  ② res/text/<이름>.json의 `key` — 뱅크 헤더 +2에 그대로 들어가는 암호화 키다
//  ③ tools/dataproc/src/*proc.c의 textbank_template — 빌드가 만들어내는 뱅크의 키
//
// ②③으로 (키, 엔트리 수) 쌍을 얻고 그 쌍으로 ko/ja 인덱스를 짚는다. 쌍은
// 디컴프 685개 안에서도, 세 롬 안에서도 겹치는 것이 하나도 없다 — 확정이다.
//
// 예전 방식(알려진 영어 문자열 → LCS 드리프트)은 뱅크 9개만 짚었고 추정이었다.
// 그 9개는 지금 방식과 전부 일치한다.
'use strict'
const fs = require('fs')
const path = require('path')
const { parseNarc } = require('../spike/gen4text')
const { ROOT } = require('./rom')

const LOCALES = ['us', 'ko', 'ja']
const DECOMP = path.join(ROOT, 'raw/decomp')

/**
 * 예전 방식(알려진 영어 문자열로 us를 짚고 LCS 드리프트로 ko/ja를 추정)이 낸 값.
 * 그때 짚을 수 있었던 것은 이 9개가 전부다. 지금 방식과 하나도 어긋나지 않는다 —
 * 서로 무관한 두 근거가 같은 답을 냈다는 뜻이라 그대로 남겨 검사에 쓴다.
 */
const HEURISTIC = {
  species_name:       { us: 412, ko: 408, ja: 408 },
  move_names:         { us: 647, ko: 637, ja: 636 },
  ability_names:      { us: 610, ko: 605, ja: 604 },
  item_names:         { us: 392, ko: 390, ja: 390 },
  pokemon_type_names: { us: 624, ko: 617, ja: 616 },
  nature_names:       { us: 202, ko: 201, ja: 201 },
  location_names:     { us: 433, ko: 428, ja: 427 },
  npc_trainer_names:  { us: 618, ko: 612, ja: 611 },
  trainer_class_names: { us: 619, ko: 613, ja: 612 },
}

/** 뱅크 헤더: u16 엔트리 수, u16 키 */
const head = (buf) => (buf.length < 4 ? null : { count: buf.readUInt16LE(0), key: buf.readUInt16LE(2) })

/** TEXT_BANK_ITEM_NAMES → item_names */
const stemOf = (constant) => constant.slice('TEXT_BANK_'.length).toLowerCase()

/**
 * 디컴프가 아는 키 → 출처.
 *
 * 이름은 text_banks.txt가 주고 키·엔트리 수는 롬 헤더가 준다. 디컴프는 그 둘이
 * 어긋나지 않았는지 확인하는 쪽에 쓴다 — 롬의 키 724개가 전부 여기 있어야 한다.
 *
 * res/ 아래 뱅크를 통째로 담은 json이 대부분이고, 종족·기술·아이템처럼 빌드가
 * 만들어내는 뱅크는 파일이 없다. 후자는 *proc.c의 표에 키가 박혀 있다.
 */
function decompKeys() {
  const out = new Map()
  const generated = new Map()

  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (!e.name.endsWith('.json')) continue
      let j
      try { j = JSON.parse(fs.readFileSync(p, 'utf8')) } catch { continue }
      if (typeof j?.key !== 'number' || !Array.isArray(j.messages)) continue
      // 키만으로는 겹치는 뱅크가 있다. (키,엔트리) 쌍은 685개가 전부 고유하다
      const rel = path.relative(DECOMP, p).replace(/\\/g, '/')
      out.set(`${j.key}/${j.messages.length}`, rel)
      // 타운맵은 빌드가 설명문을 덧붙여서 소스의 엔트리 수가 롬과 다르다
      if (!generated.has(j.key)) generated.set(j.key, rel)
    }
  }
  walk(path.join(DECOMP, 'res'))

  // `[T_ITEM_NAMES] = { .key = 51885, .out_filename = "item_names.json" },`
  const procDir = path.join(DECOMP, 'tools/dataproc/src')
  const line = /\.key\s*=\s*(\d+),\s*\.out_filename\s*=\s*"([a-z0-9_]+)\.json"|\.out_filename\s*=\s*"([a-z0-9_]+)\.json",\s*\.key\s*=\s*(\d+)/g
  for (const f of fs.readdirSync(procDir)) {
    if (!f.endsWith('.c')) continue
    const src = fs.readFileSync(path.join(procDir, f), 'utf8')
    for (const m of src.matchAll(line)) {
      const key = Number(m[1] ?? m[4])
      // 빌드가 만들어내는 뱅크는 엔트리 수를 소스에서 셀 수 없다. 키만 둔다
      if (key !== 0) generated.set(key, `tools/dataproc/src/${f}`)
    }
  }
  return { pairs: out, generated }
}

function main() {
  const narcs = {}
  for (const loc of LOCALES) {
    const p = path.join(ROOT, 'raw/extracted', loc, 'pl_msg.narc')
    if (!fs.existsSync(p)) throw new Error(`메시지 아카이브가 없다: ${p}`)
    narcs[loc] = parseNarc(fs.readFileSync(p))
  }

  const order = fs.readFileSync(path.join(DECOMP, 'generated/text_banks.txt'), 'utf8')
    .split('\n').map((s) => s.trim()).filter(Boolean)
  if (order.length !== narcs.us.length) {
    throw new Error(`us 뱅크 ${narcs.us.length}개인데 이름은 ${order.length}개다 — 롬과 디컴프 판이 다르다`)
  }

  const known = decompKeys()

  // 로케일별 (키,엔트리) → 인덱스, (키) → 인덱스들
  const index = {}
  for (const loc of LOCALES) {
    const pair = new Map(); const byKey = new Map()
    narcs[loc].forEach((buf, i) => {
      const h = head(buf)
      if (!h) return
      pair.set(`${h.key}/${h.count}`, i)
      if (!byKey.has(h.key)) byKey.set(h.key, [])
      byKey.get(h.key).push(i)
    })
    index[loc] = { pair, byKey }
  }

  const table = []
  const stats = { byPair: 0, byKey: 0, absent: { ko: 0, ja: 0 }, unknown: [] }

  order.forEach((constant, us) => {
    const stem = stemOf(constant)
    const h = head(narcs.us[us])
    if (!known.pairs.has(`${h.key}/${h.count}`) && !known.generated.has(h.key)) {
      stats.unknown.push(`#${us} ${constant} (키 ${h.key}, ${h.count}엔트리)`)
    }

    const entry = { name: stem, constant, key: h.key, bank: { us }, entries: { us: h.count } }
    for (const loc of ['ko', 'ja']) {
      const exact = index[loc].pair.get(`${h.key}/${h.count}`)
      if (exact !== undefined) {
        entry.bank[loc] = exact; entry.entries[loc] = h.count; stats.byPair++; continue
      }
      const cands = index[loc].byKey.get(h.key) ?? []
      // 엔트리 수가 지역마다 다른 뱅크가 있다. 키가 유일하면 그것으로 확정된다
      if (cands.length === 1) {
        entry.bank[loc] = cands[0]
        entry.entries[loc] = head(narcs[loc][cands[0]]).count
        stats.byKey++; continue
      }
      // 영어 문법용 뱅크(_with_articles·_plural·_uppercase)는 CJK 롬에 아예 없다
      entry.bank[loc] = null
      entry.entries[loc] = null
      stats.absent[loc]++
    }
    table.push(entry)
  })

  const clash = []
  for (const [name, want] of Object.entries(HEURISTIC)) {
    const now = table.find((t) => t.name === name)
    if (!now) { clash.push(`${name}: 지금 표에 없다`); continue }
    for (const loc of LOCALES) {
      if (now.bank[loc] !== want[loc]) clash.push(`${name}/${loc}: 예전 #${want[loc]} ≠ 지금 #${now.bank[loc]}`)
    }
  }
  console.log(`예전 방식이 짚었던 ${Object.keys(HEURISTIC).length}개와 대조 — 불일치 ${clash.length}개`)
  for (const c of clash) console.log(`  ! ${c}`)
  if (clash.length) throw new Error('두 방식이 어긋난다 — 어느 쪽이 틀렸는지 밝히기 전에는 덮어쓰지 않는다')

  console.log(
    `us 뱅크 ${order.length}개에 이름을 붙였다 / 디컴프가 모르는 키 ${stats.unknown.length}개 / ` +
    `ko·ja를 (키,엔트리)로 짚음 ${stats.byPair} · 키만으로 짚음 ${stats.byKey} / ` +
    `ko에 없음 ${stats.absent.ko} · ja에 없음 ${stats.absent.ja}`,
  )
  for (const u of stats.unknown) console.log(`  ? ${u}`)

  // 한 줄에 뱅크 하나 — 724개짜리를 들여쓰면 파일이 두 배가 되고 diff도 못 읽는다
  const json = '[\n' + table.map((t) => JSON.stringify(t)).join(',\n') + '\n]\n'
  fs.writeFileSync(path.join(ROOT, 'src/data/textBanks.json'), json, 'utf8')
  console.log(`→ src/data/textBanks.json (${table.length}개)`)
}

main()
