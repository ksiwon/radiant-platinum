// 숨은 도구 표 (PARITY §7.3 다우징머신 · §1.10)
//
// 맵의 BG 이벤트가 `scriptID`만 들고 있고, 그 안에 **무엇이 몇 개 나오는지와
// 다우징머신의 탐지 반경**이 없다. 원작은 그 셋을 따로 있는 표에서 찾는다
// (`Script_GetHiddenItemRange` → `gHiddenItems`).
//
// 표는 디컴프의 `include/data/field/hidden_items.h`에 그대로 있다. 자리는
// `FLAG_OBTAINED_HIDDEN_* − HIDDEN_ITEM_FLAGS_START`고, 우리 필드가 쓰는
// `sign.script − 8000`과 **같은 수**다 (`engine/script/field`의 `hiddenItemFlag`).
//
// ⚠️ **번호가 아니라 플래그 이름으로 짚는다.** 표의 줄 차례가 플래그 차례와
// 같아 보이지만, 강철섬처럼 플래그가 둘인데 표에는 하나뿐인 자리가 있어서
// 줄 번호로 세면 그 뒤가 통째로 밀린다.
'use strict'
const fs = require('fs')
const path = require('path')
const { writeJson } = require('./rom')
const sources = require('../raw/sources.cjs')

const DECOMP = sources.requireDir('references.decomp')

/**
 * `generated/vars_flags.txt`를 **C 열거형으로** 푼다.
 *
 * ⚠️ **줄 번호가 값이 아니다.** `NAME = 다른이름` 꼴의 별명 줄이 여럿이고
 * (`MAP_LOCAL_FLAGS_END = FLAG_MAP_LOCAL_0x40`) C에서 별명은 **값을 안 늘린다**.
 * 줄 수로 세면 730이어야 할 `HIDDEN_ITEM_FLAGS_START`가 732로 나온다
 */
function enumValues(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
  const out = new Map()
  let next = 0
  for (const line of lines) {
    const eq = line.indexOf('=')
    if (eq < 0) {
      out.set(line, next)
      next++
      continue
    }
    const name = line.slice(0, eq).trim()
    const expr = line.slice(eq + 1).trim()
    const value = /^-?\d+$/.test(expr) ? Number(expr)
      : /^0x/i.test(expr) ? Number.parseInt(expr, 16)
        : out.get(expr)
    if (value === undefined) throw new Error(`열거형을 못 푼다: ${line}`)
    out.set(name, value)
    next = value + 1
  }
  return out
}

/** `FLAG_OBTAINED_HIDDEN_*` → `HIDDEN_ITEM_FLAGS_START`에서의 자리 */
function hiddenFlagOffsets() {
  const values = enumValues(path.join(DECOMP, 'generated/vars_flags.txt'))
  const start = values.get('HIDDEN_ITEM_FLAGS_START')
  if (start === undefined) throw new Error('vars_flags.txt에 HIDDEN_ITEM_FLAGS_START가 없다')
  const out = new Map()
  for (const [name, value] of values) {
    if (name.startsWith('FLAG_OBTAINED_HIDDEN')) out.set(name, value - start)
  }
  return out
}

/** 도구 이름 → 번호 (`generated/items.txt`) */
function itemNumbers() {
  const lines = fs.readFileSync(path.join(DECOMP, 'generated/items.txt'), 'utf8')
    .split('\n').map((l) => l.trim()).filter(Boolean)
  return new Map(lines.map((name, i) => [name, i]))
}

const ENTRY = /HIDDEN_ITEM_ENTRY\(\s*(\w+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\w+)\s*\)/g

function extract() {
  const flags = hiddenFlagOffsets()
  const items = itemNumbers()
  const src = fs.readFileSync(path.join(DECOMP, 'include/data/field/hidden_items.h'), 'utf8')

  const table = []
  for (const m of src.matchAll(ENTRY)) {
    const [, itemName, qty, range, flagName] = m
    const item = items.get(itemName)
    const script = flags.get(flagName)
    if (item === undefined) throw new Error(`도구 이름을 못 찾았다: ${itemName}`)
    if (script === undefined) throw new Error(`플래그를 못 찾았다: ${flagName}`)
    table.push({ script, item, qty: Number(qty), range: Number(range) })
  }
  if (!table.length) throw new Error('숨은 도구 표가 비었다')

  // 자리가 겹치면 하나가 조용히 사라진다
  const seen = new Set()
  for (const row of table) {
    if (seen.has(row.script)) throw new Error(`자리가 겹친다: ${row.script}`)
    seen.add(row.script)
  }
  return table
}

function main() {
  const table = extract()
  const byRange = [0, 1, 2].map((r) => `${r}칸 ${table.filter((t) => t.range === r).length}`)
  const out = writeJson('hiddenItems.json', { count: table.length, items: table })
  console.log(`숨은 도구 ${table.length}개 → ${out.rel} (${out.kb}KB)`)
  console.log(`  탐지 반경: ${byRange.join(' · ')}`)
  console.log(`  자리 범위: ${Math.min(...table.map((t) => t.script))}~${Math.max(...table.map((t) => t.script))}`)
}

if (require.main === module) main()
module.exports = { extract }
