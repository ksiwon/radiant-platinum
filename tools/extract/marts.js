// 상점 재고 (DATA.md §2.12)
//
// 상점은 롬 데이터가 아니라 **코드에 박힌 표**다 — `Shop_Start(…, shopItems, …)`에
// 넘기는 배열이 `include/data/mart_items.h`에 상수로 있다. 그래서 여기서는 롬이
// 아니라 디컴프 헤더를 읽는다.
//
// 포켓몬센터 옆 상점(`PokeMartCommon`)은 재고가 **뱃지 수로 늘어난다.** 표에
// 적힌 `requiredBadges`는 뱃지 개수가 아니라 계단 번호고, 그 계단은
// `ScrCmd_PokeMartCommon`이 뱃지 수에서 만든다(0개→1, 1~2→2, 3~4→3, 5~6→4,
// 7→5, 8→6). 그 사다리를 여기 같이 적어 둔다.
//
// 백화점처럼 물건이 고정인 상점(`PokeMartSpecialties`)은 20곳이 각자 목록을 갖고,
// 번호는 `generated/mart_specialties_id.txt`의 줄 순서다.
'use strict'
const fs = require('fs')
const path = require('path')
const { writeJson, ROOT } = require('./rom')

// 자리는 어댑터가 정한다 (`tools/raw/sources`) — raw를 정리해도 여기가 안 바뀐다
const DECOMP = require('../raw/sources.cjs').requireDir('references.decomp')
const HEADER = path.join(DECOMP, 'include/data/mart_items.h')

/** `ITEM_POKE_BALL` → 4. `constants/items.h`가 아니라 우리 산출물을 정본으로 쓴다 */
function itemIds() {
  const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/items.json'), 'utf8'))
  return new Map(items.items.map((it, id) => [it.constant, id]))
}

/** `const u16 이름[] = { … };` 하나를 항목 문자열 배열로 */
function arrays(text) {
  const out = new Map()
  const re = /const\s+u16\s+(\w+)\[\]\s*=\s*\{([^}]*)\}/g
  for (const m of text.matchAll(re)) {
    out.set(m[1], m[2].split(',').map((s) => s.trim()).filter(Boolean))
  }
  return out
}

function main() {
  const text = fs.readFileSync(HEADER, 'utf8')
  const ids = itemIds()
  const resolve = (name) => {
    const id = ids.get(name)
    if (id === undefined) throw new Error(`아이템 상수를 못 찾았다: ${name}`)
    return id
  }

  // ── 일반 상점 ──────────────────────────────────────────────────────────────
  const commonBlock = /PokeMartCommonItems\[\]\s*=\s*\{([\s\S]*?)\n\};/.exec(text)
  if (!commonBlock) throw new Error('PokeMartCommonItems를 못 찾았다')
  const common = []
  for (const m of commonBlock[1].matchAll(/\{\s*(\w+),\s*(0x[0-9a-fA-F]+|\d+)\s*\}/g)) {
    common.push({ item: resolve(m[1]), tier: Number(m[2]) })
  }

  // ── 지역 상점 ──────────────────────────────────────────────────────────────
  const lists = arrays(text)
  const order = fs.readFileSync(path.join(DECOMP, 'generated/mart_specialties_id.txt'), 'utf8')
    .split('\n').map((s) => s.trim()).filter(Boolean)
  const indexBlock = /PokeMartSpecialties\[\]\s*=\s*\{([\s\S]*?)\n\};/.exec(text)
  if (!indexBlock) throw new Error('PokeMartSpecialties를 못 찾았다')

  const byId = new Map()
  for (const m of indexBlock[1].matchAll(/\[(\w+)\]\s*=\s*(\w+)/g)) {
    const at = order.indexOf(m[1])
    if (at < 0) throw new Error(`상점 번호가 표에 없다: ${m[1]}`)
    const list = lists.get(m[2])
    if (!list) throw new Error(`재고 배열을 못 찾았다: ${m[2]}`)
    // SHOP_ITEM_END가 끝 표지다. 그 뒤는 없다
    byId.set(at, list.filter((n) => n !== 'SHOP_ITEM_END').map(resolve))
  }
  const specialties = order.map((_, i) => byId.get(i) ?? null)

  const missing = specialties.filter((s) => s === null).length
  if (missing) throw new Error(`재고가 빈 상점 ${missing}곳 — 색인이 밀렸다`)

  const out = writeJson('marts.json', { common, specialties })
  console.log(`일반 상점 ${common.length}종 · 지역 상점 ${specialties.length}곳 → ${out.rel} (${out.kb}KB)`)
  // 뱃지 0개면 몬스터볼·상처약·해독제·마비회복만 산다. 원작 첫 상점이 그렇다
  const first = common.filter((c) => c.tier <= 1).length
  console.log(`  뱃지 0개일 때 살 수 있는 것 ${first}종 · 8개일 때 ${common.length}종`)
}

main()
