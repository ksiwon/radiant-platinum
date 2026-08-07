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

// ── 이동 유형 ────────────────────────────────────────────────────────────────
//
// 동작(action)과 다른 표다. **유형**은 배치표에 적힌 "이 사람은 평소에 무엇을
// 하는가"이고 (`ObjectEvent.movementType`), 동작은 그 결과로 한 프레임 걷는 일이다.
// NPC 3,555명 중 1,504명이 0(가만히 있는다)이 아닌 유형을 달고 있다.
//
// 네 파일을 이어 읽는다:
//
//   generated/movement_types.txt   이름 → 번호
//   src/unk_020EDBAC.c             `Unk_020EE3A8[]` 번호 → 행동 구조체 → 시작 함수
//   src/unk_0206450C.c             시작 함수 → 어느 갈래에 어떤 인자로 들어가는가
//                                  + 방향 묶음 표 · 기다림 표
//
// 갈래는 **단계 함수**가 가른다. 시작 함수가 아니라 단계 함수가 같으면 같은 갈래다:
//
//   sub_020645C0  look    n프레임 기다렸다 묶음에서 아무 쪽이나 **돌아본다**
//   sub_02064690  wander  기다렸다 아무 쪽이나 골라 **한 칸 걷는다**. 막히면 돌기만
//   sub_02064918  face    시작 방향으로 한 번 돌고 그만이다
//   sub_020649A8  rotate  24프레임마다 시계/반시계로 한 칸씩 돈다
//   sub_02064C48  pace    시작 방향으로 걷다 막히면 돌아온다
//   sub_02064EC8  route   방향 넷을 차례로 돈다 (x축으로 한 바퀴를 센다)
//   sub_020650DC  route   같은 것인데 z축으로 센다
const TYPE_STEPS = {
  sub_020645C0: 'look',
  sub_02064690: 'wander',
  sub_02064918: 'face',
  sub_020649A8: 'rotate',
  sub_02064C48: 'pace',
  sub_02064EC8: 'route',
  sub_020650DC: 'route',
}

/** 기다림 표 `Unk_020EEA88`. 이 중 하나를 뽑아 프레임을 센다 */
const DELAY_TABLE = 'Unk_020EEA88'
/** 회전이 한 칸 도는 데 걸리는 프레임 (`sub_02064A1C`의 24) */
const ROTATE_FRAMES = 24

function decompFile(name) {
  return fs.readFileSync(path.join(DECOMP, name), 'utf8')
}

/** `static const int NAME[] = { … };` → 숫자 배열. 끝의 −1은 뗀다 */
function readIntArrays(text) {
  const map = new Map()
  for (const m of text.matchAll(/static const int (\w+)\[\] = \{([^}]*)\}/g)) {
    const values = m[2].split(',').map((s) => s.trim()).filter((s) => s !== '')
      .map((s) => Number(s))
    if (values.some((v) => Number.isNaN(v))) continue
    map.set(m[1], values)
  }
  return map
}

/** `Unk_020EEB08[40]` — 묶음 번호 → 배열 이름 */
function readDirSets(text) {
  const block = /static const UnkStruct_020EEB08 Unk_020EEB08\[40\] = \{([\s\S]*?)\};/.exec(text)
  if (!block) throw new Error('방향 묶음 표를 못 찾았다')
  const sets = new Map()
  for (const m of block[1].matchAll(/\{\s*(0x[0-9A-Fa-f]+|\d+),\s*(\w+)\s*\}/g)) {
    if (m[2] === 'NULL') continue
    sets.set(Number(m[1]), m[2])
  }
  return sets
}

/** 유형 표의 순서 = 유형 번호. 항목마다 {갈래 이름, 시작 함수} */
function readTypeStructs() {
  const text = decompFile('src/unk_020EDBAC.c')
  const structs = new Map()
  for (const m of text.matchAll(/static const UnkStruct_020EDF0C (\w+) = \{\s*([^}]*)\}/g)) {
    const fields = m[2].split(',').map((s) => s.trim()).filter((s) => s !== '')
    structs.set(m[1], { init: fields[1], step: fields[2] })
  }
  const order = /const UnkStruct_020EDF0C \*const Unk_020EE3A8\[\] = \{([\s\S]*?)\};/.exec(text)
  if (!order) throw new Error('이동 유형 표를 못 찾았다')
  return order[1].split(',').map((s) => s.trim().replace(/^&/, '')).filter((s) => s !== '')
    .map((name) => structs.get(name) ?? {})
}

/** `void NAME(MapObject *mapObj) { 한 줄 }` → 그 한 줄 */
function readInitBodies(text) {
  const map = new Map()
  for (const m of text.matchAll(/\nvoid (sub_\w+)\(MapObject \*mapObj\)\s*\{([\s\S]*?)\n\}/g)) {
    map.set(m[1], m[2].trim().replace(/\s+/g, ' '))
  }
  return map
}

/**
 * 시작 함수 한 줄에서 인자를 읽는다.
 *
 * 갈래마다 인자 자리가 다르다 — 실측한 자리 그대로 적는다:
 *
 *   sub_0206450C(mapObj, 묶음)              look
 *   sub_02064668(mapObj, 0xc, 묶음, 갈래)   wander
 *   sub_020648F4(mapObj, 방향)              face
 *   sub_0206496C(mapObj, 2|3)               rotate — 2가 반시계, 3이 시계
 *   sub_02064D98(mapObj, 2, 축, 묶음)       route (x축 세기 = 0)
 *   sub_0206502C(mapObj, 2, 축, 묶음)       route
 */
function readInitArgs(body) {
  const call = /sub_(\w+)\(mapObj(?:,\s*([^)]*))?\);/.exec(body ?? '')
  if (!call) return null
  const args = (call[2] ?? '').split(',').map((s) => Number(s.trim()))
  return { fn: `sub_${call[1]}`, args }
}

/**
 * 이동 유형 68개의 표.
 *
 * @returns `{ types, delays }` — `types[i]`가 유형 i다
 */
function movementTypeTable() {
  const src = decompFile('src/unk_0206450C.c')
  const arrays = readIntArrays(src)
  const setNames = readDirSets(src)
  const inits = readInitBodies(src)
  const structs = readTypeStructs()

  const names = decompFile('generated/movement_types.txt').trim().split(/\r?\n/)
    .map((s) => s.trim().replace(/^MOVEMENT_TYPE_/, ''))

  const dirsOf = (set) => {
    const array = arrays.get(setNames.get(set))
    if (array === undefined) throw new Error(`방향 묶음 ${set}번을 못 읽었다`)
    // 끝의 −1은 개수를 세는 표시일 뿐이다 (`sub_020652EC`)
    return array.filter((v) => v >= 0)
  }

  const types = structs.map((entry, index) => {
    const name = names[index] ?? String(index)
    const kind = TYPE_STEPS[entry.step]
    if (kind === undefined) return { name, kind: 'other' }
    const init = readInitArgs(inits.get(entry.init))
    if (init === null) {
      // `pace`는 시작 함수가 인자를 안 받는다 — 방향이 배치표의 시작 방향이다
      return kind === 'pace' ? { name, kind } : { name, kind: 'other' }
    }
    if (kind === 'look') return { name, kind, dirs: dirsOf(init.args[0]) }
    if (kind === 'wander') return { name, kind, dirs: dirsOf(init.args[1]) }
    if (kind === 'face') return { name, kind, dirs: [init.args[0]] }
    // 회전 방향 두 줄은 `sub_02064A58`에 박혀 있다 — 2가 {0,2,1,3}, 3이 {0,3,1,2}
    if (kind === 'rotate') {
      return { name, kind, dirs: init.args[0] === 2 ? [0, 2, 1, 3] : [0, 3, 1, 2] }
    }
    if (kind === 'route') return { name, kind, dirs: dirsOf(init.args[2]), axis: init.args[1] }
    return { name, kind }
  })

  verifyAgainstNames(types)
  return { types, delays: arrays.get(DELAY_TABLE).filter((v) => v >= 0), rotateFrames: ROTATE_FRAMES }
}

/**
 * 이름과 뽑은 방향이 맞는지 본다.
 *
 * 표를 세 파일에 걸쳐 손으로 이어 붙였으니 한 자리만 밀려도 조용히 틀린다 —
 * 그런데 **이름이 답을 적어 두었다**. `WALK_NORTH_EAST_WEST_SOUTH`가 [0,3,2,1]이
 * 아니면 어딘가 어긋난 것이다. 이름은 사람이 붙였고 표는 기계가 읽었으니 서로
 * 독립인 두 출처다.
 *
 * `LOOK`·`WANDER`는 뽑은 표가 번호 순으로 정렬돼 있어 **집합**으로 견주고,
 * `WALK`은 도는 차례라 **고리**로 견준다.
 *
 * ⚠️ 고리로 견주는 이유가 실제로 있다. 24개 중 23개는 이름과 표가 글자 그대로
 * 같은데 `WALK_NORTH_WEST_EAST_SOUTH` 하나만 표가 [2,3,1,0]이다 — 같은 고리를
 * 한 칸 옮겨 적은 것이라 도는 길은 같다. 그 하나 때문에 순서까지 못 박으면
 * 멀쩡한 뽑기가 틀렸다고 나온다
 */
function verifyAgainstNames(types) {
  const DIRS = { NORTH: 0, SOUTH: 1, WEST: 2, EAST: 3 }
  let checked = 0
  let rotated = 0
  for (const type of types) {
    if (type.dirs === undefined) continue
    const tail = type.name.replace(/^(LOOK|WANDER|WALK)_/, '')
    if (tail === type.name || tail === 'AROUND' || tail === 'BACK_AND_FORTH') continue
    const named = tail.split('_').filter((w) => w in DIRS).map((w) => DIRS[w])
    if (named.length === 0) continue
    checked++
    if (!type.name.startsWith('WALK_')) {
      const want = [...named].sort((a, b) => a - b).join(',')
      if (want !== type.dirs.join(',')) {
        throw new Error(`${type.name}: 이름은 [${want}]인데 표는 [${type.dirs}]다`)
      }
      continue
    }
    const turns = type.dirs.map((_, k) => [...type.dirs.slice(k), ...type.dirs.slice(0, k)].join(','))
    const at = turns.indexOf(named.join(','))
    if (at < 0) throw new Error(`${type.name}: 이름은 [${named}]인데 표는 [${type.dirs}]다`)
    if (at > 0) rotated++
  }
  // LOOK 10 + WANDER 2 + WALK 24 + 고정 4 = 40. 하나라도 줄면 뽑기가 어긋난 것이다
  if (checked !== 40) throw new Error(`이름으로 견준 유형이 40개가 아니라 ${checked}개다`)
  if (rotated !== 1) throw new Error(`고리가 밀린 유형이 1개가 아니라 ${rotated}개다`)
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

  const { types, delays } = movementTypeTable()
  const typeKinds = {}
  for (const t of types) typeKinds[t.kind] = (typeKinds[t.kind] ?? 0) + 1
  console.log(`이동 유형 ${types.length}개`, typeKinds)
  console.log('  기다림 프레임:', delays.join(' · '))
  for (const name of ['LOOK_AROUND', 'WANDER_WEST_AND_EAST', 'WALK_NORTH_EAST_WEST_SOUTH']) {
    console.log(`  ${name}:`, JSON.stringify(types.find((t) => t.name === name)))
  }
}

if (require.main === module) main()
module.exports = { movementTable, movementTypeTable, UNITS_PER_TILE }
