// 존 이벤트 대조 (DATA.md §2.3)
//
// 필드 배치를 값 분포로 짐작하던 자리다. 디컴프가 **이벤트 파일 534개를 전부
// JSON 원본으로** 갖고 있는 것을 뒤늦게 찾았으므로, 스크립트 때와 같은 방식으로
// 한다 — 원본을 읽어서 롬에서 꺼낸 것과 **필드 하나하나** 맞춰 본다.
//
// 이름이 붙은 값(그래픽 번호·이동 유형·플래그)은 `generated/*.txt`의 줄 번호로
// 푼다. 그 표는 스크립트 어셈블러가 쓰는 것과 같은 것이다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, ROOT } = require('./rom')
const { extractEvents } = require('./events')

// 자리는 어댑터가 정한다 (`tools/raw/sources`) — raw를 정리해도 여기가 안 바뀐다
const DECOMP = require('../raw/sources.cjs').requireDir('references.decomp')
const EVENTS_DIR = path.join(DECOMP, 'res/field/events')

/** `generated/*.txt` — 줄 번호가 값이다 */
function readEnum(name) {
  const file = path.join(DECOMP, 'generated', `${name}.txt`)
  const map = new Map()
  let next = 0
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const text = line.trim()
    if (text === '' || text.startsWith('//')) continue
    const m = /^(\w+)(?:\s*=\s*(.+))?$/.exec(text)
    if (!m) continue
    if (m[2] !== undefined) {
      const explicit = map.has(m[2]) ? map.get(m[2]) : Number(m[2])
      if (Number.isFinite(explicit)) next = explicit
    }
    map.set(m[1], next)
    next++
  }
  return map
}

/** 이름이면 표에서 찾고 숫자면 그대로. `include/`의 `#define`도 본다 */
function value(raw, tables, defines) {
  if (typeof raw === 'number') return raw
  // 원본에 `"value": false`가 한 번 나온다. 파이썬의 `u16(False)`가 0이다
  if (typeof raw === 'boolean') return raw ? 1 : 0
  const text = String(raw).trim()
  if (/^-?\d+$/.test(text)) return Number(text)
  for (const table of tables) {
    if (table.has(text)) return table.get(text)
  }
  if (defines.has(text)) return defines.get(text)
  throw new Error(`모르는 이름: ${text}`)
}

/** `include/constants/**`의 단순 `#define NAME 123` */
function readDefines() {
  const map = new Map()
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const at = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(at); continue }
      if (!entry.name.endsWith('.h')) continue
      const text = fs.readFileSync(at, 'utf8')
      for (const m of text.matchAll(/^#define\s+(\w+)\s+\(?(-?(?:0[xX][0-9a-fA-F]+|\d+))\)?\s*$/gm)) {
        if (!map.has(m[1])) map.set(m[1], Number(m[2]))
      }
      // `LOCALID_…`처럼 열거형에 든 것도 필요하다
      for (const m of text.matchAll(/^\s*(LOCALID_\w+)\s*=\s*(\d+),?\s*$/gm)) {
        if (!map.has(m[1])) map.set(m[1], Number(m[2]))
      }
    }
  }
  walk(path.join(DECOMP, 'include'))
  return map
}

/** meson.build의 나열 순서가 곧 NARC 안의 번호다 */
function readOrder() {
  const text = fs.readFileSync(path.join(EVENTS_DIR, 'meson.build'), 'utf8')
  const block = /events_files\s*=\s*files\(([\s\S]*?)\)/.exec(text)
  if (!block) throw new Error('meson.build에서 events_files를 못 찾았다')
  return [...block[1].matchAll(/'([^']+\.json)'/g)].map((m) => m[1])
}

function main() {
  const rom = openRom(process.argv.find((a) => a.startsWith('--rom='))?.slice(6))
  const { events } = extractEvents(rom)
  const order = readOrder()
  const defines = readDefines()
  const gfx = readEnum('object_events_gfx')
  const movement = readEnum('movement_types')
  const trainerType = readEnum('trainer_types')
  const flags = readEnum('vars_flags')
  const dirs = readEnum('bg_event_dirs')
  const headers = readEnum('map_headers')
  const trainers = readEnum('trainers')

  /**
   * `from_script` — 트레이너 이름이면 **배틀 구역 번호로 바뀐다**.
   * 싱글은 3000 + 번호 − 1, 더블은 5000부터다. 이게 트레이너전이 걸리는 방식이다
   */
  const scriptOf = (obj) => {
    const raw = String(obj.script)
    if (!trainers.has(raw)) return Number(raw)
    const base = obj.double_battle_id === 2 ? 5000 : 3000
    return trainers.get(raw) - 1 + base
  }

  const romCount = Object.keys(events).length
  if (order.length !== romCount) {
    console.warn(`⚠ 원본 ${order.length}개, 롬 ${romCount}개 — 순서 표가 안 맞는다`)
  }

  const counts = { bg: 0, obj: 0, warp: 0, coord: 0 }
  const bad = []
  const note = (i, name, what) => {
    if (bad.length < 12) bad.push(`#${i} ${name}: ${what}`)
  }

  for (let i = 0; i < Math.min(order.length, romCount); i++) {
    const name = order[i]
    const src = JSON.parse(fs.readFileSync(path.join(EVENTS_DIR, name), 'utf8'))
    const got = events[i]

    const cmp = (kind, want, have, fields) => {
      if (want.length !== have.length) {
        note(i, name, `${kind} 개수 ${want.length} ≠ ${have.length}`)
        return
      }
      for (let k = 0; k < want.length; k++) {
        for (const [key, pick, tables] of fields) {
          let expected
          try {
            expected = value(want[k][key], tables ?? [], defines)
          } catch (e) {
            note(i, name, `${kind}[${k}].${key}: ${e.message}`)
            return
          }
          const actual = pick(have[k])
          if (expected !== actual) {
            note(i, name, `${kind}[${k}].${key} ${expected} ≠ ${actual}`)
            return
          }
        }
      }
    }

    cmp('bg', src.bg_events ?? [], got.signs, [
      ['script', (s) => s.script],
      ['type', (s) => s.type],
      ['x', (s) => s.x],
      ['z', (s) => s.z],
      ['y', (s) => s.y],
      ['player_facing_dir', (s) => s.facing, [dirs]],
    ])
    // localID는 `clone_id`가 없으면 **배열 순서**다. JSON의 `id`는 주석일 뿐이다
    const objects = (src.object_events ?? []).map((o, k) => ({
      ...o, __localID: o.clone_id ?? k, __script: scriptOf(o),
    }))
    cmp('obj', objects, got.npcs, [
      ['__localID', (o) => o.localID],
      ['graphics_id', (o) => o.sprite, [gfx]],
      ['movement_type', (o) => o.move, [movement]],
      ['trainer_type', (o) => o.trainerType, [trainerType]],
      // 숨김 플래그 자리에 **맵 헤더 번호**가 들어가는 경우가 있다
      ['hidden_flag', (o) => o.flag ?? 0xffff, [flags, headers]],
      ['__script', (o) => o.script],
      ['initial_dir', (o) => o.facing],
      ['movement_range_x', (o) => o.range[0]],
      ['movement_range_z', (o) => o.range[1]],
      ['x', (o) => o.x],
      ['z', (o) => o.z],
      ['y', (o) => o.height],
    ])
    cmp('warp', src.warp_events ?? [], got.warps, [
      ['x', (w) => w.x],
      ['z', (w) => w.z],
      ['dest_header_id', (w) => w.to, [headers]],
      ['dest_warp_id', (w) => w.anchor],
    ])
    cmp('coord', src.coord_events ?? [], got.triggers, [
      ['script', (t) => t.script],
      ['x', (t) => t.x],
      ['z', (t) => t.z],
      ['width', (t) => t.width],
      ['length', (t) => t.length],
      ['y', (t) => t.y],
      ['value', (t) => t.value],
      ['var', (t) => t.var, [flags]],
    ])

    counts.bg += got.signs.length
    counts.obj += got.npcs.length
    counts.warp += got.warps.length
    counts.coord += got.triggers.length
  }

  console.log(`이벤트 파일 ${romCount}개 대조`)
  console.log(`  간판 ${counts.bg} · NPC ${counts.obj} · 워프 ${counts.warp} · 트리거 ${counts.coord}`)
  if (bad.length === 0) {
    console.log('  불일치 0')
    return
  }
  console.log(`  ⚠ 불일치 (앞 ${bad.length}개)`)
  for (const line of bad) console.log(`    ${line}`)
  process.exitCode = 1
}

if (require.main === module) main()
