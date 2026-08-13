// 깨어진 세계 (PARITY §6.10) — `overlay009/ov9_02249960.c` · `fielddata/tornworld/`
//
// 여기만 맵이 **평범한 격자가 아니다.** 바닥·서쪽 벽·동쪽 벽·천장 네 갈래의
// 「떠 있는 판」이 겹쳐 있고, 서 있는 판이 무엇이냐에 따라 같은 (x,y,z)가 다른
// 통행 자료를 가리킨다. 그 자료가 맵 자료에 없어서 롬은 전용 NARC 둘을 읽는다:
//
//   /fielddata/tornworld/tw_arc.narc       파일 0 = 맵 열의 목차, 1~10 = 맵마다
//   /fielddata/tornworld/tw_arc_attr.narc  판마다의 통행 격자 열두 벌 (u16 1024개)
//
// 그리고 **자료가 아니라 코드에 박힌 것**이 또 한 뭉치 있다 — 층 잇는 차례,
// 움직이는 발판, 승강 경로, 칸을 밟으면 도는 사건 프로그램. 그것들은 오버레이의
// C 배열이라 디컴프 원문에서 읽는다.
//
// ⚠️ **`bounds`는 양끝을 포함한다.** `size`가 개수가 아니라 **차이**다
// (`start + size`까지가 안이다). 개수로 읽으면 판마다 한 줄씩 좁아진다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson } = require('./rom')
const sources = require('../raw/sources.cjs')

const DECOMP = sources.requireDir('references.decomp')
const OVERLAY = path.join(DECOMP, 'src/overlay009/ov9_02249960.c')

// ── C 값 풀기 ────────────────────────────────────────────────────────────────

/** `FX32_ONE`. 고정소수점 1.0 */
const FX32_ONE = 1 << 12

/**
 * C 열거형을 푼다. **별명 줄은 값을 안 늘린다** (`hiddenItems.js`와 같은 규칙).
 */
function enumFrom(text, values = new Map()) {
  let next = 0
  for (const raw of text.split('\n')) {
    const line = raw.split('//')[0].trim().replace(/,$/, '')
    if (!line || line.startsWith('#') || line === '{' || line === '}') continue
    // ⚠️ 이름에 소문자가 섞인다 (`FLAG_MAP_LOCAL_0x40`) — 대문자만 받으면 걸러진다
    const m = /^([A-Z][A-Za-z0-9_]*)\s*(?:=\s*(.+))?$/.exec(line)
    if (!m) continue
    const [, name, expr] = m
    const value = expr === undefined ? next : evalExpr(expr, values)
    values.set(name, value)
    next = value + 1
  }
  return values
}

/** 아주 작은 C 상수식 계산기. 이름·수·`+ - *`·괄호만 본다 */
function evalExpr(expr, values) {
  const src = expr.trim()
  // ⚠️ 열여섯 진법이 먼저다. 열 진법을 먼저 보면 `-0x8`이 `-0` + `x8`로 쪼개진다
  const tokens = src.match(/-?0[xX][0-9a-fA-F]+|-?\d+|[A-Za-z_][A-Za-z0-9_]*|<<|>>|[-+*/()]/g)
  if (!tokens) throw new Error(`값을 못 읽는다: ${expr}`)
  let i = 0
  const peek = () => tokens[i]
  const take = () => tokens[i++]
  const primary = () => {
    const t = take()
    if (t === '(') { const v = shift(); if (take() !== ')') throw new Error(`괄호가 안 닫힌다: ${expr}`); return v }
    if (t === '-') return -primary()
    if (/^-?0x/i.test(t)) {
      const neg = t.startsWith('-')
      const v = Number.parseInt(neg ? t.slice(3) : t.slice(2), 16)
      return neg ? -v : v
    }
    if (/^-?\d+$/.test(t)) return Number(t)
    if (t === 'FX32_ONE') return FX32_ONE
    if (t === 'TRUE') return 1
    if (t === 'FALSE') return 0
    if (t === 'NULL') return null
    if (values.has(t)) return values.get(t)
    throw new Error(`모르는 이름: ${t} (${expr})`)
  }
  const product = () => {
    let v = primary()
    while (peek() === '*' || peek() === '/') {
      const op = take()
      const r = primary()
      // C의 정수 나눗셈이다 — 0으로 자른다
      v = op === '*' ? v * r : Math.trunc(v / r)
    }
    return v
  }
  const sum = () => {
    let v = product()
    while (peek() === '+' || peek() === '-') { const op = take(); const r = product(); v = op === '+' ? v + r : v - r }
    return v
  }
  // 자리 옮김은 덧셈보다 늦다 — `(289 << 4) * FX32_ONE` 같은 자리 값이 이걸 쓴다
  const shift = () => {
    let v = sum()
    while (peek() === '<<' || peek() === '>>') {
      const op = take()
      const r = sum()
      v = op === '<<' ? v << r : v >> r
    }
    return v
  }
  const value = shift()
  if (i !== tokens.length) throw new Error(`남은 토큰이 있다: ${expr}`)
  return value
}

/**
 * `generated/*.txt` — 대개 줄 차례가 곧 값이다.
 *
 * ⚠️ **그런데 `= 값`이 박힌 줄이 있다** (`OBJ_EVENT_GFX_INVISIBLE = 8192`).
 * 줄 번호로 세면 그 줄부터 통째로 어긋나므로 C 열거형 규칙으로 읽는다
 */
function generated(name, values) {
  return enumFrom(fs.readFileSync(path.join(DECOMP, 'generated', name), 'utf8'), values)
}

/** 오버레이 안의 `enum X { … };` 하나 */
function overlayEnum(src, name, values) {
  const at = src.indexOf(`enum ${name} {`)
  if (at < 0) throw new Error(`오버레이에 enum ${name}이 없다`)
  const end = src.indexOf('};', at)
  return enumFrom(src.slice(src.indexOf('{', at) + 1, end), values)
}

/** 헤더 하나에서 `#define NAME 값` */
function defineValue(rel, name) {
  const src = fs.readFileSync(path.join(DECOMP, rel), 'utf8')
  const m = new RegExp(`#define\\s+${name}\\s+(\\S+)`).exec(src)
  if (!m) throw new Error(`${rel}에 #define ${name}이 없다`)
  return evalExpr(m[1], new Map())
}

function constantTable(src) {
  const values = new Map()
  generated('map_headers.txt', values)
  generated('movement_actions.txt', values)
  generated('giratina_shadow_animations.txt', values)
  generated('object_events_gfx.txt', values)
  generated('movement_types.txt', values)
  generated('trainer_types.txt', values)
  generated('vars_flags.txt', values)
  enumFrom(fs.readFileSync(path.join(DECOMP, 'include/location.h'), 'utf8'), values)
  for (const m of fs.readFileSync(path.join(DECOMP, 'include/script_manager.h'), 'utf8')
    .matchAll(/^#define\s+(SCRIPT_ID_OFFSET_[A-Z_]+)\s+(\d+)/gm)) {
    values.set(m[1], Number(m[2]))
  }
  // `MAP_HEADER_INVALID`·`MAP_HEADER_COUNT`는 표 끝을 가리킨다
  const mapCount = fs.readFileSync(path.join(DECOMP, 'generated/map_headers.txt'), 'utf8')
    .split('\n').map((l) => l.trim()).filter(Boolean).length
  values.set('MAP_HEADER_COUNT', mapCount)
  values.set('MAP_HEADER_INVALID', mapCount)
  values.set('LOCALID_PLAYER', 0xff)
  values.set('LOCALID_CAMERA', 0xfe)
  // ⚠️ `#define`을 먼저 넣는다 — 아래 열거형 여덟이 전부 이 이름 위에 얹혀 있어서,
  // 없으면 지역 아이디가 하나도 안 풀린다
  values.set('DIST_WORLD_MAP_OBJECT_BASE_LOCAL_ID', defineValue('include/constants/distortion_world.h',
    'DIST_WORLD_MAP_OBJECT_BASE_LOCAL_ID'))
  enumFrom(fs.readFileSync(path.join(DECOMP, 'include/constants/distortion_world.h'), 'utf8'), values)
  enumFrom(fs.readFileSync(path.join(DECOMP, 'include/overlay009/ov9_02249960.h'), 'utf8'), values)
  for (const name of ['FloatingPlatformKind', 'PropKind', 'PropAnimKind', 'FlagCondition',
    'MovingPlatformElevatorDirection', 'EventCmdKind', 'Axis', 'SkyKind',
    'GiratinaShadowPropSoundEffectKind', 'FallingBoulderDestination']) {
    overlayEnum(src, name, values)
  }
  overlayDefines(src, values)
  return values
}

/**
 * 오버레이 맨 위의 `#define`들.
 *
 * ⚠️ 서로를 가리키는 것이 있어서(`…PATH_INVALID`는 `…PATH_COUNT`다) **한 번에
 * 안 풀린다.** 더 안 풀릴 때까지 돈다. 끝까지 안 풀리는 것(색·좌표 매크로)은
 * 표에 안 쓰이므로 그냥 둔다
 */
function overlayDefines(src, values) {
  const pending = new Map()
  for (const m of src.matchAll(/^#define\s+([A-Z][A-Z0-9_]*)\s+(.+)$/gm)) {
    pending.set(m[1], m[2].trim())
  }
  let moved = true
  while (moved) {
    moved = false
    for (const [name, expr] of [...pending]) {
      try {
        values.set(name, evalExpr(expr, values))
        pending.delete(name)
        moved = true
      } catch { /* 아직 못 푼다 */ }
    }
  }
  return values
}

// ── C 표 읽기 ────────────────────────────────────────────────────────────────

/** `{ … }` 하나를 균형 맞춰 잘라 낸다 */
function braced(src, open) {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open + 1, i) }
  }
  throw new Error('중괄호가 안 닫힌다')
}

/** 최상위 쉼표로 쪼갠다 (중괄호 안의 쉼표는 안 센다) */
function splitTop(body) {
  const out = []
  let depth = 0
  let start = 0
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === ',' && depth === 0) { out.push(body.slice(start, i)); start = i + 1 }
  }
  const tail = body.slice(start)
  if (tail.trim()) out.push(tail)
  return out
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/**
 * `static const T name[] = { … };` 또는 `static const T name = { … };`
 *
 * 값은 `.field = expr` 꼴이거나 자리 그대로다. 자리 그대로인 것은 `order`가 준다
 */
function readStruct(entry, order, values) {
  const out = {}
  const parts = splitTop(entry).map((p) => p.trim()).filter(Boolean)
  let positional = 0
  for (const part of parts) {
    const m = /^\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/.exec(part)
    if (m) { out[m[1]] = readValue(m[2], values); continue }
    const field = order[positional]
    positional++
    if (field === undefined) throw new Error(`자리 값이 표 밖이다: ${part}`)
    out[field] = readValue(part, values)
  }
  return out
}

function readValue(text, values) {
  let raw = text.trim().replace(/,$/, '').trim()
  // `SCRIPT_ID(VISIBLE_ITEMS, 321)` — 붙임 매크로라 계산기가 못 본다. 미리 편다
  raw = raw.replace(/SCRIPT_ID\s*\(\s*([A-Z_]+)\s*,\s*([^)]+)\)/g,
    (_, chunk, id) => `(SCRIPT_ID_OFFSET_${chunk} + ${id})`)
  if (raw.startsWith('{')) {
    const inner = braced(raw, 0)
    // 안이 또 지정 초기화면 구조체다 (`objEvent`가 그렇다). 아니면 그냥 벡터다
    if (/^\s*\./m.test(inner)) return readStruct(inner, [], values)
    return splitTop(inner).map((p) => readValue(p, values))
  }
  if (raw === 'NULL') return null
  if (raw.startsWith('&') || /^s[A-Z][A-Za-z0-9_]*$/.test(raw)) return { ref: raw.replace(/^&/, '') }
  return evalExpr(raw, values)
}

/** 이름이 붙은 `static const` 표를 전부 걷는다 */
function allTables(src) {
  const out = new Map()
  const re = /static const\s+([A-Za-z_][A-Za-z0-9_]*)\s+(\*?)\s*(s[A-Za-z0-9_]*)\s*(\[\s*[A-Za-z0-9_]*\s*\])?\s*=\s*\{/g
  let m
  while ((m = re.exec(src)) !== null) {
    const [, type, star, name, isArray] = m
    const body = braced(src, src.indexOf('{', m.index + m[0].length - 1))
    out.set(name, { type, name, array: isArray !== undefined, pointers: star === '*', body })
  }
  return out
}

// 구조체마다 「자리 값의 차례」. 지정 초기화가 아닌 줄이 있어서 필요하다
const FIELD_ORDER = {
  DistWorldEventCmd: ['kind', 'params'],
  DistWorldEvent: ['tileX', 'tileY', 'tileZ', 'flagCond', 'flagCondVal', 'cmds'],
  DistWorldMapEvents: ['mapHeaderID', 'events'],
  DistWorldMapConnections: ['currID', 'prevID', 'nextID'],
  DistWorldSimplePropTemplate: ['dummy00', 'propKind', 'tileX', 'tileY', 'tileZ', 'flagCond', 'flagCondVal'],
  DistWorldSimplePropMapTemplates: ['mapHeaderID', 'templates'],
  DistWorldMovingPlatformMapTemplates: ['mapHeaderID', 'templates'],
  DistWorldMapObjectEvents: ['mapHeaderID', 'events'],
}

function tableEntries(table, values) {
  const order = FIELD_ORDER[table.type] ?? []
  const parts = table.array ? splitTop(table.body) : [table.body]
  const rows = []
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const inner = trimmed.startsWith('{') ? braced(trimmed, 0) : trimmed
    rows.push(readStruct(inner, order, values))
  }
  return rows
}

// ── tw_arc ───────────────────────────────────────────────────────────────────

/** `DistWorldBounds` 여섯 s16 */
function readBounds(buf, off) {
  return {
    x: buf.readInt16LE(off), y: buf.readInt16LE(off + 2), z: buf.readInt16LE(off + 4),
    sx: buf.readInt16LE(off + 6), sy: buf.readInt16LE(off + 8), sz: buf.readInt16LE(off + 10),
  }
}

const MAP_INFO_SIZE = 12
const PLATFORM_SIZE = 20
const JUMP_SIZE = 40
const CAMERA_SIZE = 24
const GHOST_TEMPLATE_SIZE = 12
const GHOST_TRIGGER_SIZE = 20
const HEADER_SIZE = 20

function readMapFile(buf) {
  const platformSize = buf.readInt32LE(4)
  const jumpSize = buf.readInt32LE(8)
  const cameraSize = buf.readInt32LE(12)
  const platformAt = HEADER_SIZE
  const jumpAt = platformAt + platformSize
  const cameraAt = jumpAt + jumpSize
  const ghostAt = cameraAt + cameraSize

  const platforms = []
  if (platformSize) {
    const count = buf.readInt32LE(platformAt)
    for (let i = 0; i < count; i++) {
      const o = platformAt + 4 + i * PLATFORM_SIZE
      platforms.push({
        kind: buf.readInt16LE(o),
        attr: buf.readUInt16LE(o + 2),
        bounds: readBounds(buf, o + 4),
        rows: buf.readUInt16LE(o + 16),
        cols: buf.readUInt16LE(o + 18),
      })
    }
    if (platformAt + 4 + count * PLATFORM_SIZE !== jumpAt) throw new Error('판 구역 크기가 안 맞는다')
  }

  const jumps = []
  if (jumpSize) {
    const count = buf.readInt32LE(jumpAt)
    for (let i = 0; i < count; i++) {
      const o = jumpAt + 4 + i * JUMP_SIZE
      jumps.push({
        handler: buf.readUInt16LE(o),
        dir: buf.readInt16LE(o + 2),
        bounds: readBounds(buf, o + 8),
        dx: buf.readInt16LE(o + 20),
        dy: buf.readInt16LE(o + 22),
        dz: buf.readInt16LE(o + 24),
        spriteAngle: buf.readInt16LE(o + 26),
        steps: buf.readInt16LE(o + 28),
        axis: buf.readUInt16LE(o + 30),
        inverted: buf.readUInt16LE(o + 32),
        facing: buf.readInt16LE(o + 34),
        platformKind: buf.readInt16LE(o + 36),
        platformIndex: buf.readUInt16LE(o + 38),
      })
    }
    if (jumpAt + 4 + count * JUMP_SIZE !== cameraAt) throw new Error('뛰는 자리 구역 크기가 안 맞는다')
  }

  const cameras = []
  if (cameraSize) {
    const count = buf.readInt32LE(cameraAt)
    for (let i = 0; i < count; i++) {
      const o = cameraAt + 4 + i * CAMERA_SIZE
      cameras.push({
        bounds: readBounds(buf, o),
        angleX: buf.readUInt16LE(o + 12),
        angleY: buf.readUInt16LE(o + 14),
        angleZ: buf.readUInt16LE(o + 16),
        dir: buf.readInt16LE(o + 18),
        steps: buf.readInt32LE(o + 20),
      })
    }
    if (cameraAt + 4 + count * CAMERA_SIZE !== ghostAt) throw new Error('카메라 구역 크기가 안 맞는다')
  }

  const templateCount = buf.readInt32LE(ghostAt)
  const triggerCount = buf.readInt32LE(ghostAt + 4)
  const visible = buf.readUInt32LE(ghostAt + 8)
  const props = []
  for (let i = 0; i < templateCount; i++) {
    const o = ghostAt + 12 + i * GHOST_TEMPLATE_SIZE
    props.push({
      group: buf.readUInt32LE(o),
      kind: buf.readUInt16LE(o + 4),
      x: buf.readInt16LE(o + 6), y: buf.readInt16LE(o + 8), z: buf.readInt16LE(o + 10),
    })
  }
  const triggers = []
  const triggerAt = ghostAt + 12 + templateCount * GHOST_TEMPLATE_SIZE
  for (let i = 0; i < triggerCount; i++) {
    const o = triggerAt + i * GHOST_TRIGGER_SIZE
    triggers.push({
      group: buf.readUInt32LE(o),
      dir: buf.readInt16LE(o + 4),
      show: buf.readInt16LE(o + 6),
      bounds: readBounds(buf, o + 8),
    })
  }
  const end = triggerAt + triggerCount * GHOST_TRIGGER_SIZE
  if (end !== buf.length) throw new Error(`맵 파일 크기가 안 맞는다: ${end} ≠ ${buf.length}`)

  return { platforms, jumps, cameras, props, triggers, visibleGroups: visible }
}

// ── 걷기 ─────────────────────────────────────────────────────────────────────

function extract() {
  const src = stripComments(fs.readFileSync(OVERLAY, 'utf8'))
  const values = constantTable(src)
  const tables = allTables(src)

  const rom = openRom()
  const main = rom.narc('/fielddata/tornworld/tw_arc.narc')
  const attrNarc = rom.narc('/fielddata/tornworld/tw_arc_attr.narc')

  const info = main[0]
  const mapCount = info.readInt32LE(0)
  if (4 + mapCount * MAP_INFO_SIZE !== info.length) throw new Error('목차 크기가 안 맞는다')

  const maps = []
  for (let i = 0; i < mapCount; i++) {
    const o = 4 + i * MAP_INFO_SIZE
    const map = info.readUInt32LE(o)
    const fileIndex = info.readUInt16LE(o + 4)
    const body = readMapFile(main[fileIndex + 1])
    maps.push({
      map,
      offsetX: info.readInt16LE(o + 6),
      offsetY: info.readInt16LE(o + 8),
      offsetZ: info.readInt16LE(o + 10),
      ...body,
    })
  }

  // 통행 격자. 판마다 `rows × cols`만 쓰지만 파일은 늘 1024칸이다
  const attrs = []
  for (const key of Object.keys(attrNarc)) {
    const buf = attrNarc[key]
    if (buf.length % 2) throw new Error(`통행 격자가 u16 배수가 아니다: ${buf.length}`)
    const cells = new Array(buf.length / 2)
    for (let i = 0; i < cells.length; i++) cells[i] = buf.readUInt16LE(i * 2)
    attrs.push(cells)
  }

  // 판이 가리키는 격자 번호가 실제로 있는지, `rows × cols`가 격자 안에 드는지
  for (const m of maps) {
    for (const p of m.platforms) {
      const grid = attrs[p.attr]
      if (grid === undefined) throw new Error(`맵 ${m.map}: 통행 격자 ${p.attr}이 없다`)
      if (p.rows * p.cols > grid.length) {
        throw new Error(`맵 ${m.map}: 판 ${p.rows}×${p.cols}가 격자 ${grid.length}칸을 넘는다`)
      }
    }
  }

  return {
    maps,
    attrs,
    connections: tableEntries(tables.get('sDistWorldMapConnectionList'), values),
    events: readEvents(tables, values),
    movingPlatforms: readMovingPlatforms(tables, values),
    elevatorPaths: readElevatorPaths(tables, values),
    simpleProps: readSimpleProps(tables, values),
    mapObjects: readMapObjects(tables, values),
    giratinaShadows: readGiratinaShadows(tables, values),
  }
}

/** 사건 프로그램. `sMapEvents`에서 시작해 이름을 따라 내려간다 */
function readEvents(tables, values) {
  const root = tableEntries(tables.get('sMapEvents'), values)
  const out = []
  for (const row of root) {
    if (row.events === null || row.events === undefined) continue
    const list = tableEntries(tables.get(row.events.ref), values)
    const events = []
    for (const e of list) {
      if (e.cmds === null || e.cmds === undefined) continue
      events.push({
        x: e.tileX, y: e.tileY, z: e.tileZ,
        flagCond: e.flagCond, flagVal: e.flagCondVal,
        cmds: readCmds(tables, values, e.cmds.ref),
      })
    }
    out.push({ map: row.mapHeaderID, events })
  }
  return out
}

function readCmds(tables, values, name) {
  const rows = tableEntries(tables.get(name), values)
  const out = []
  for (const row of rows) {
    if (row.kind === values.get('EVENT_CMD_KIND_COUNT')) break
    const params = row.params === null || row.params === undefined
      ? null
      : readStruct(tables.get(row.params.ref).body, [], values)
    out.push({ kind: row.kind, params: plain(params) })
  }
  return out
}

/** `{ref: …}`가 남아 있으면 못 푼 것이다 — 조용히 넘기지 않는다 */
function plain(params) {
  if (params === null) return null
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && typeof value === 'object' && 'ref' in value) {
      throw new Error(`못 푼 가리킴: ${key} → ${value.ref}`)
    }
  }
  return params
}

/**
 * 가리킴 배열(`static const T *name[] = { &a, &b, NULL }`)을 풀어 준다.
 *
 * ⚠️ **NULL이 끝 표시다.** 그 뒤를 읽으면 없는 이름을 찾게 된다
 */
function derefList(tables, values, name) {
  const table = tables.get(name)
  if (!table) throw new Error(`표 ${name}이 없다`)
  const out = []
  for (const part of splitTop(table.body)) {
    const raw = part.trim().replace(/,$/, '').trim()
    if (!raw || raw === 'NULL') break
    const ref = raw.replace(/^&/, '')
    const target = tables.get(ref)
    if (!target) throw new Error(`가리킨 표 ${ref}이 없다`)
    out.push(readStruct(target.body, FIELD_ORDER[target.type] ?? [], values))
  }
  return out
}

function readMovingPlatforms(tables, values) {
  const root = tableEntries(tables.get('sMovingPlatformsMapTemplates'), values)
  return root.filter((r) => r.templates).map((r) => ({
    map: r.mapHeaderID,
    platforms: derefList(tables, values, r.templates.ref).map(plain),
  }))
}

function readElevatorPaths(tables, values) {
  return tableEntries(tables.get('sElevatorPlatformPaths'), values).map(plain)
}

function readSimpleProps(tables, values) {
  const root = tableEntries(tables.get('sSimplePropsMapTemplates'), values)
  return root.filter((r) => r.templates).map((r) => ({
    map: r.mapHeaderID,
    props: tableEntries(tables.get(r.templates.ref), values)
      .filter((p) => p.propKind !== values.get('PROP_KIND_COUNT'))
      .map(plain),
  }))
}

function readMapObjects(tables, values) {
  const root = tableEntries(tables.get('sMapObjectEvents'), values)
  return root.filter((r) => r.events).map((r) => ({
    map: r.mapHeaderID,
    objects: derefList(tables, values, r.events.ref).map(flatten),
  }))
}

/** `objEvent`가 한 겹 안에 들어 있다 — 펴서 내보낸다 */
function flatten(row) {
  const { objEvent, ...rest } = row
  return { ...plain(rest), ...(objEvent === undefined ? {} : plain(objEvent)) }
}

function readGiratinaShadows(tables, values) {
  const table = tables.get('sGiratinaShadowTemplates')
  if (!table) return []
  return tableEntries(table, values).map(plain)
}

function main() {
  const data = extract()
  const platformCount = data.maps.reduce((n, m) => n + m.platforms.length, 0)
  const jumpCount = data.maps.reduce((n, m) => n + m.jumps.length, 0)
  const cameraCount = data.maps.reduce((n, m) => n + m.cameras.length, 0)
  const propCount = data.maps.reduce((n, m) => n + m.props.length, 0)
  const cmdCount = data.events.reduce((n, m) => n + m.events.reduce((k, e) => k + e.cmds.length, 0), 0)
  const out = writeJson('distortion.json', data)
  console.log(`깨어진 세계 맵 ${data.maps.length}개 → ${out.rel} (${out.kb}KB)`)
  console.log(`  떠 있는 판 ${platformCount} · 뛰는 자리 ${jumpCount} · 카메라 ${cameraCount}`)
  console.log(`  통행 격자 ${data.attrs.length}벌 · 유령 소품 ${propCount}`)
  console.log(`  사건 ${data.events.reduce((n, m) => n + m.events.length, 0)}자리 · 명령 ${cmdCount}`)
  console.log(`  움직이는 발판 ${data.movingPlatforms.reduce((n, m) => n + m.platforms.length, 0)}` +
    ` · 승강 경로 ${data.elevatorPaths.length}`)
}

if (require.main === module) main()
module.exports = { extract, evalExpr }
