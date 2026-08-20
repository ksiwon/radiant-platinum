'use strict'
// 깨어진 세계의 **코드 표** → src/engine/world/distortionTables.ts (PARITY §6.10)
//
//     pnpm gen:distortionTables
//
// 깨어진 세계의 자료는 두 원천에서 온다. **판·통행 격자는 롬**의
// `fielddata/tornworld/` 두 NARC에 있고(그쪽은 `tools/extract/distortion.js`와
// `src/import/platinum/distortion.ts`가 굽는다), **층 잇는 차례 · 사건 프로그램 ·
// 움직이는 발판 · 승강 경로 · 늘 서 있는 소품 · 맵 물체 · 기라티나 그림자**는
// 오버레이의 C 배열(`overlay009/ov9_02249960.c`)이다.
//
// ⚠️ **롬에서 못 꺼낸다.** 그 C 배열은 오버레이 바이너리 안에 굳어 있어서
// 사용자의 롬 하나로는 안 나온다 — 브라우저 변환기가 만들 길이 없다. 그래서
// 다른 `gen:*`과 같이 디컴프에서 TS 모듈로 굽는다 (CODEMAP §2.4).
//
// ⚠️ **여기 담기는 것은 번호와 수뿐이다.** 대사도 이름도 한 바이트도 안 담는다.
//
// ⚠️ **손으로 고치지 않는다.** 고칠 곳은 디컴프이고 이 스크립트가 다시 만든다.
const fs = require('fs')
const path = require('path')
const sources = require('../raw/sources.cjs')

const ROOT = sources.ROOT
const DECOMP = sources.requireDir('references.decomp')
const OVERLAY = path.join(DECOMP, 'src/overlay009/ov9_02249960.c')
const OUT = path.join(ROOT, 'src/engine/world/distortionTables.ts')

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

/**
 * 스크립트가 부르는 기라티나 그림자 (`sGiratinaShadowExternal`).
 *
 * ⚠️ **이름을 `sGiratinaShadowTemplates`로 짚어서 오래 0개였다.** 표는 있는데
 * 못 찾으니 조용히 빈 배열이 나갔고, 1F에서 기라티나가 지나가는 연출이
 * 통째로 비었다. 여기 있는 하나를 `StartDistortionWorldGiratinaShadowEvent`가
 * 번호로 집는다 (`GIRATINA_SHADOW_EXTERNAL_COUNT` = 1)
 */
function readGiratinaShadows(tables, values) {
  const table = tables.get('sGiratinaShadowExternal')
  if (!table) return []
  return tableEntries(table, values).map(plain)
}

// ── 걷기 ─────────────────────────────────────────────────────────────────────

/** 코드 표 일곱 칸 */
function extract() {
  const src = stripComments(fs.readFileSync(OVERLAY, 'utf8'))
  const values = constantTable(src)
  const tables = allTables(src)
  return {
    connections: tableEntries(tables.get('sDistWorldMapConnectionList'), values),
    events: readEvents(tables, values),
    movingPlatforms: readMovingPlatforms(tables, values),
    elevatorPaths: readElevatorPaths(tables, values),
    simpleProps: readSimpleProps(tables, values),
    mapObjects: readMapObjects(tables, values),
    giratinaShadows: readGiratinaShadows(tables, values),
  }
}

/** 한 줄에 한 항목. 차례가 뜻을 가지는 표라 예쁘게 펴지 않는다 */
const rows = (list) => list.map((v) => `  ${JSON.stringify(v)},`).join('\n')

function main() {
  const t = extract()
  const cmdCount = t.events.reduce((n, m) => n + m.events.reduce((k, e) => k + e.cmds.length, 0), 0)
  const eventCount = t.events.reduce((n, m) => n + m.events.length, 0)
  const platformCount = t.movingPlatforms.reduce((n, m) => n + m.platforms.length, 0)
  const propCount = t.simpleProps.reduce((n, m) => n + m.props.length, 0)
  const objectCount = t.mapObjects.reduce((n, m) => n + m.objects.length, 0)

  const out = `// 깨어진 세계의 코드 표 (PARITY §6.10)
//
// 층 잇는 차례 · 칸을 밟으면 도는 사건 프로그램 · 움직이는 발판 · 승강 경로 ·
// 늘 서 있는 소품 · 맵 물체 · 기라티나 그림자. 전부
// \`overlay009/ov9_02249960.c\`의 \`static const\` 배열이다.
//
// ⚠️ **롬에서 안 온다.** 판과 통행 격자는 \`fielddata/tornworld/\`의 NARC 둘에서
// 오지만(→ \`data/distortion.json\`), 여기 일곱 칸은 오버레이 코드 안에 굳어 있어서
// 사용자의 롬 하나로는 못 꺼낸다. 둘을 합치는 자리는 \`data/distortionFile.ts\`
// 하나다 — 읽는 쪽 스무 군데는 합쳐진 것만 본다.
//
// 실측 — 층 이음 ${t.connections.length} · 사건 ${eventCount}자리(명령 ${cmdCount}) ·
// 움직이는 발판 ${platformCount} · 승강 경로 ${t.elevatorPaths.length} · 늘 서 있는 소품 ${propCount} ·
// 맵 물체 ${objectCount} · 기라티나 그림자 ${t.giratinaShadows.length}
//
// ⚠️ **손으로 고치지 않는다** — \`pnpm gen:distortionTables\`가 디컴프에서 다시
// 만든다 (\`tools/extract/distortionTablesModule.cjs\`).

/**
 * 명령·물체 하나의 칸들.
 *
 * 값은 번호이거나 번호 벡터(\`posDelta\` · \`scale\`)이거나 null이다 — 못 푼
 * 가리킴이 남으면 굽는 쪽이 그 자리에서 세운다 (\`plain\`)
 */
export type DistortionParams = Readonly<Record<string, number | number[] | null>>

/** 층 하나가 위아래로 무엇에 붙는가 (\`sDistWorldMapConnectionList\`) */
export interface DistortionConnection {
  currID: number
  prevID: number
  nextID: number
}

/** 칸을 밟으면 도는 사건 하나 (\`DistWorldEvent\`) */
export interface DistortionEvent {
  x: number
  y: number
  z: number
  flagCond: number
  flagVal: number
  cmds: { kind: number, params: DistortionParams | null }[]
}

export interface DistortionMovingPlatform {
  index: number
  tileX: number
  tileY: number
  tileZ: number
  elevatorPathIndex: number
  /** 0 위 · 1 아래 · 2 승강이 아니다 (그냥 떠 있는 발판) */
  elevatorDir: number
  /** 닿는 층에서 이 발판이 몇 번인가 */
  destIndex: number
  propKind: number
  /** 세이브의 발판 자리 열하나 중 하나. 11이면 늘 있다는 뜻이다 */
  persistedFlag: number
}

/**
 * 승강 경로 (\`sElevatorPlatformPaths\`).
 *
 * \`posDelta\`가 한 프레임에 움직이는 고정소수점 양이고 \`final*Offset\`이 닿는
 * 칸까지의 차다. \`changeMaps*Offset\`만큼 왔을 때 층이 바뀐다
 */
export interface DistortionElevatorPath {
  index: number
  nextIndex: number
  finalTileXOffset: number
  finalTileYOffset: number
  finalTileZOffset: number
  changeMapsTileXOffset: number
  changeMapsTileYOffset: number
  changeMapsTileZOffset: number
  posDelta: number[]
  persistedFlagToSet: number
  persistedFlagToClear: number
}

/** 늘 서 있는 소품 (\`sSimplePropsMapTemplates\`) — 문·폭포·덩굴꽃 */
export interface DistortionSimpleProp {
  propKind: number
  tileX: number
  tileY: number
  tileZ: number
  flagCond: number
  flagCondVal: number
  dummy00?: number
}

export interface DistortionTables {
  connections: DistortionConnection[]
  events: { map: number, events: DistortionEvent[] }[]
  movingPlatforms: { map: number, platforms: DistortionMovingPlatform[] }[]
  elevatorPaths: DistortionElevatorPath[]
  simpleProps: { map: number, props: DistortionSimpleProp[] }[]
  mapObjects: { map: number, objects: DistortionParams[] }[]
  giratinaShadows: DistortionParams[]
}

export const DISTORTION_TABLES: DistortionTables = {
  connections: [
${rows(t.connections)}
  ],
  events: [
${rows(t.events)}
  ],
  movingPlatforms: [
${rows(t.movingPlatforms)}
  ],
  elevatorPaths: [
${rows(t.elevatorPaths)}
  ],
  simpleProps: [
${rows(t.simpleProps)}
  ],
  mapObjects: [
${rows(t.mapObjects)}
  ],
  giratinaShadows: [
${rows(t.giratinaShadows)}
  ],
}
`
  fs.writeFileSync(OUT, out, 'utf8')
  console.log(`${path.relative(ROOT, OUT).split(path.sep).join('/')} `
    + `${(Buffer.byteLength(out) / 1024).toFixed(1)}KB`)
  console.log(`  층 이음 ${t.connections.length} · 사건 ${eventCount}자리 · 명령 ${cmdCount}`)
  console.log(`  움직이는 발판 ${platformCount} · 승강 경로 ${t.elevatorPaths.length} · 소품 ${propCount}`)
  console.log(`  맵 물체 ${objectCount} · 기라티나 그림자 ${t.giratinaShadows.length}`)
}

if (require.main === module) main()
module.exports = { extract, evalExpr }
