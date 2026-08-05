// 이동 동작 표 (DATA.md §2.10)
//
// `ApplyMovement`가 가리키는 것은 **또 다른 바이트코드**다: `{u16 동작, u16 횟수}`가
// 이어지다 `MOVEMENT_ACTION_END`로 끝난다. 동작 번호 157개가 무엇을 하는지가
// 필요한데, 이것도 손으로 옮기면 안 된다 — 방향 하나만 뒤집혀도 NPC가 반대로 걷고
// 그게 스크린샷으로는 안 잡힌다.
//
// 그래서 디컴프에서 기계로 뽑는다. 세 파일을 이어 읽는다:
//
//   generated/movement_actions.txt   이름 → 번호
//   src/unk_020EDBAC.c               번호 → 함수 배열 이름
//   src/unk_020655F4.c               함수 배열 → 첫 단계 → `MovementAction_Init*` 호출
//
// `InitWalk(dir, 프레임당 거리, 프레임 수)`가 실제 값이다. 한 타일이 16단위라
// **거리 × 프레임 = 16**이 걸음 하나다 — 보통 걸음은 2씩 8프레임이고 빠른 걸음은
// 4씩 4프레임이다.
'use strict'
const fs = require('fs')
const path = require('path')
const { ROOT } = require('./rom')

const DECOMP = path.join(ROOT, 'raw/decomp')
/** 한 타일의 단위 길이. `InitWalk`의 거리×프레임이 이 값이면 한 칸이다 */
const UNITS_PER_TILE = 16

const DIR = { DIR_NORTH: 0, DIR_SOUTH: 1, DIR_WEST: 2, DIR_EAST: 3, DIR_NONE: -1 }

function readActionNames() {
  const file = path.join(DECOMP, 'generated/movement_actions.txt')
  const names = []
  let next = 0
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const text = line.trim()
    if (text === '' || text.startsWith('//')) continue
    const m = /^(\w+)(?:\s*=\s*(-?\d+))?$/.exec(text)
    if (!m) continue
    if (m[2] !== undefined) next = Number(m[2])
    names[next] = m[1]
    next++
  }
  return names
}

/** `[MOVEMENT_ACTION_X] = gMovementActionFuncs_Y,` */
function readActionFuncs() {
  const text = fs.readFileSync(path.join(DECOMP, 'src/unk_020EDBAC.c'), 'utf8')
  const map = new Map()
  for (const m of text.matchAll(/\[(MOVEMENT_ACTION_\w+)\]\s*=\s*(gMovementActionFuncs_\w+)/g)) {
    map.set(m[1], m[2])
  }
  return map
}

/** `gMovementActionFuncs_Y[] = { MovementAction_Z_Step0, … }` → 첫 단계 이름 */
function readFirstSteps() {
  const text = fs.readFileSync(path.join(DECOMP, 'src/unk_020655F4.c'), 'utf8')
  const map = new Map()
  const array = /BOOL\s*\(\*const\s+(gMovementActionFuncs_\w+)\[\]\)\(MapObject \*\)\s*=\s*\{([^}]*)\}/g
  for (const m of text.matchAll(array)) {
    const first = /(\w+)/.exec(m[2].trim())
    if (first) map.set(m[1], first[1])
  }
  return map
}

/** `static BOOL Z(MapObject *mapObj) { … }` 본문 */
function readBodies() {
  const text = fs.readFileSync(path.join(DECOMP, 'src/unk_020655F4.c'), 'utf8')
  const map = new Map()
  const fn = /static BOOL (\w+)\(MapObject \*mapObj\)\s*\{([\s\S]*?)\n\}/g
  for (const m of text.matchAll(fn)) map.set(m[1], m[2])
  return map
}

/** `FX32_CONST(2)` → 2, `FX32_CONST(0.5)` → 0.5 */
function fx(token) {
  const m = /FX32_CONST\(\s*(-?[\d.]+)\s*\)/.exec(token)
  return m ? Number(m[1]) : num(token)
}

/** `8 * 2`처럼 상수끼리의 곱셈까지만 본다 — 원본에 그 이상은 없다 */
function num(token) {
  const text = token.trim()
  if (/^-?[\d.]+$/.test(text)) return Number(text)
  const mul = /^(-?[\d.]+)\s*\*\s*(-?[\d.]+)$/.exec(text)
  if (mul) return Number(mul[1]) * Number(mul[2])
  return null
}

function splitArgs(text) {
  const out = []
  let depth = 0
  let at = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ',' && depth === 0) { out.push(text.slice(at, i)); at = i + 1 }
  }
  out.push(text.slice(at))
  return out.map((s) => s.trim())
}

/**
 * 첫 단계 본문에서 무엇을 하는지 읽는다.
 *
 * @returns `{kind, dir, tiles, frames}` — 모르는 것은 `kind: 'other'`
 */
function describe(body) {
  const call = /MovementAction_Init(\w+)\(([^;]*)\);/.exec(body)
  if (!call) return { kind: 'other' }
  const args = splitArgs(call[2])
  const kind = call[1]
  const dir = DIR[args[1]] ?? null

  if (kind === 'Face') return { kind: 'face', dir, tiles: 0, frames: 1 }
  if (kind === 'Delay') return { kind: 'delay', dir: null, tiles: 0, frames: num(args[1]) }
  if (kind === 'Walk') {
    const frames = num(args[3])
    return { kind: 'walk', dir, tiles: (fx(args[2]) * frames) / UNITS_PER_TILE, frames }
  }
  // 걸음폭이 고르지 않은 걸음. 거리는 안 받고 **한 칸을 그 프레임 동안** 간다
  if (kind === 'WalkUneven') return { kind: 'walk', dir, tiles: 1, frames: num(args[2]) }
  // 제자리걸음 — 인자가 (dir, 프레임)뿐이다
  if (kind === 'WalkOnSpot') return { kind: 'walkOnSpot', dir, tiles: 0, frames: num(args[2]) }
  if (kind === 'Jump' || kind === 'JumpCustomSound') {
    const frames = num(args[3])
    return { kind: 'jump', dir, tiles: (fx(args[2]) * frames) / UNITS_PER_TILE, frames }
  }
  return { kind: 'other' }
}

/** 동작 157개의 표 */
function movementTable() {
  const names = readActionNames()
  const funcs = readActionFuncs()
  const steps = readFirstSteps()
  const bodies = readBodies()

  const table = []
  for (let code = 0; code < names.length; code++) {
    const name = names[code]
    if (name === undefined) continue
    const short = name.replace(/^MOVEMENT_ACTION_/, '')
    const array = funcs.get(name)
    const step = array === undefined ? undefined : steps.get(array)
    const body = step === undefined ? undefined : bodies.get(step)
    table[code] = { name: short, ...(body === undefined ? { kind: 'other' } : describe(body)) }
  }
  return table
}

function main() {
  const table = movementTable()
  const kinds = {}
  for (const entry of table) {
    if (!entry) continue
    kinds[entry.kind] = (kinds[entry.kind] ?? 0) + 1
  }
  console.log(`이동 동작 ${table.filter(Boolean).length}개`, kinds)
  const walk = table.find((e) => e?.name === 'WALK_NORMAL_NORTH')
  console.log('  보통 걸음 북쪽:', JSON.stringify(walk))
}

if (require.main === module) main()
module.exports = { movementTable, UNITS_PER_TILE }
