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
const { ROOT, messageNarc } = require('./rom')

const LOCALES = ['us', 'ko', 'ja']
/** 이 표의 로케일 키 → 롬을 찾는 키. 미국판만 이름이 다르다 */
const ROM_LOCALE = { us: 'en', ko: 'ko', ja: 'ja' }
// 자리는 어댑터가 정한다 (`tools/raw/sources`) — raw를 정리해도 여기가 안 바뀐다
const DECOMP = require('../raw/sources.cjs').requireDir('references.decomp')

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

/**
 * 키로 못 짚은 뱅크를 **자리**로 메운다.
 *
 * ⚠️ **없는 뱅크와 내용이 바뀐 뱅크는 다르다.** (키, 엔트리 수)로 짝짓는 것은
 * 그 지역판이 뱅크를 **다시 쓴** 경우를 못 잡는다 — 일본판 게임코너가 그렇다.
 * 미국판 28줄, 일본판 26줄이라 쌍도 키도 안 맞아서 "일본판에 없음"으로 떨어졌는데,
 * 열어 보면 「いらっしゃいませ！
トバリ　ゲ－ムコ－ナ－　です！」다. 없다고 적으면
 * 트바리 게임코너 맵의 대사가 통째로 사라진다.
 *
 * 순서는 보존된다(빠지거나 끼어들 뿐 뒤집히지 않는다). 그래서 앞뒤로 이미 확정된
 * 뱅크 사이에 **남은 자리가 딱 하나**면 그것이 답이다. 둘 이상이면 근거가 부족한
 * 것이므로 null로 남긴다 — 정말 없는 뱅크(문법용·달 이름)는 사이에 빈자리가
 * 없어서 여기서 안 걸린다.
 */
function fillByPosition(table, narcs, loc) {
  const taken = new Set(table.map((t) => t.bank[loc]).filter((v) => v !== null && v !== undefined))
  const at = (i) => (table[i] ? table[i].bank[loc] : null)
  const filled = []
  for (let i = 0; i < table.length; i++) {
    if (at(i) !== null) continue
    let prev = -1
    for (let j = i - 1; j >= 0; j--) { if (at(j) !== null) { prev = at(j); break } }
    let next = narcs[loc].length
    for (let j = i + 1; j < table.length; j++) { if (at(j) !== null) { next = at(j); break } }
    const free = []
    for (let k = prev + 1; k < next; k++) if (!taken.has(k)) free.push(k)
    if (free.length !== 1) continue
    table[i].bank[loc] = free[0]
    table[i].entries[loc] = head(narcs[loc][free[0]]).count
    taken.add(free[0])
    filled.push(table[i].name)
  }
  return filled
}

function main() {
  const narcs = {}
  // 아카이브는 지역판 롬에서 그때그때 꺼낸다 — 미리 풀어 둔 폴더에 안 기댄다
  // (`rom.js`의 `messageNarc`에 왜인지 적어 두었다)
  for (const loc of LOCALES) narcs[loc] = parseNarc(messageNarc(ROM_LOCALE[loc]))

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

  // 키로 못 짚은 것을 **자리로** 메운다. 아래 설명 참조
  const filled = { ko: fillByPosition(table, narcs, 'ko'), ja: fillByPosition(table, narcs, 'ja') }
  for (const loc of ['ko', 'ja']) {
    if (!filled[loc].length) continue
    stats.absent[loc] -= filled[loc].length
    console.log(`${loc}: 키로 못 짚은 뱅크 ${filled[loc].length}개를 자리로 메웠다 — ${filled[loc].join(', ')}`)
  }

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

  // ⚠️ **리포에 안 넣는다.** 이 표에는 뱅크 724개의 암호화 키(u16)와 로케일별
  // 엔트리 수가 들어 있다 — 사용자 롬에서 읽은 정확한 값이라 공개 저장소에 둘
  // 것이 아니다 (COPYRIGHT.md §6). `raw/work/`는 .gitignore가 통째로 막는다.
  //
  // 앱은 이 파일을 안 읽는다. 자리는 `src/import/platinum/textBanks.ts`가 이름
  // 순서에서 계산하고, 사용자의 롬으로 검산한다. 이 표는 그 계산이 맞는지
  // 확인하는 데만 쓴다 (`textBanks.local.test.ts`, PT_REQUIRE_DATA=1).
  const out = path.join(ROOT, 'raw/work/textBanks.json')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  // 한 줄에 뱅크 하나 — 724개짜리를 들여쓰면 파일이 두 배가 되고 diff도 못 읽는다
  const json = '[\n' + table.map((t) => JSON.stringify(t)).join(',\n') + '\n]\n'
  fs.writeFileSync(out, json, 'utf8')
  console.log(`→ raw/work/textBanks.json (${table.length}개) — 리포에 안 들어간다`)
}

main()
