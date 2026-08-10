// 스크립트 호환성 메타데이터를 브라우저 모듈로 굽는다 (COPYRIGHT.md §2 · §11)
//
// 브라우저에는 디컴프가 없다. 그런데 `scr_seq.narc`의 바이트코드는 **명령마다
// 피연산자 폭을 모르면 한 걸음도 못 걷는다** — 폭이 하나 어긋나면 그 뒤가 전부
// 밀리는데 대개 다음 명령이 우연히 유효해서 조용히 이상한 스크립트가 나온다.
//
// 그래서 디컴프에서 뽑을 수 있는 것 중 **롬에 없는 것만** 여기서 굽는다:
//
//   ① 명령 840개의 이름과 피연산자 폭 — 바이트코드 ISA 설명이다
//   ② 스크립트 파일 1124개의 이름과 갈래(코드/초기화 표)
//   ③ scriptID 구역 표 — 경계 숫자와 글 뱅크 **이름**
//   ④ 이동 동작 표 — 이름·방향·타일·프레임
//
// ⚠️ **롬 바이트는 하나도 안 들어간다.** 스크립트 바이트코드 자체(288KB)는
// 사용자의 롬에서 읽는다. 여기 있는 것은 그 바이트를 어떻게 읽는지에 대한 설명뿐이다.
//
// ⚠️ **손으로 고치지 않는다.** `pnpm gen:scriptMeta`가 디컴프가 있는 기계에서
// 다시 만든다.
'use strict'
const fs = require('fs')
const path = require('path')
const { buildTable } = require('./scrcmd-table')
const { movementTable, movementTypeTable } = require('./movement-table')
const { readOrder, readKinds } = require('./scripts')

const ROOT = path.resolve(__dirname, '../..')
const DECOMP = require('../raw/sources.cjs').requireDir('references.decomp')

const argCode = (a) => `${a.size}${a.rel ? '*' : ''}`

function packCommands() {
  const { table } = buildTable()
  return table.map((cmd) => {
    const spec = { name: cmd.name, args: cmd.args.map(argCode).join(' ') }
    if (cmd.cases) {
      spec.on = cmd.cases.on
      spec.cases = cmd.cases.when.map((w) => ({ v: w.values, args: w.args.map(argCode).join(' ') }))
    }
    return spec
  })
}

/** `SCRIPT_RANGE_TABLE` — 큰 값부터 내려오며 처음 걸리는 구역이 답이다 */
function readRangeTable() {
  const manager = fs.readFileSync(path.join(DECOMP, 'src/script_manager.c'), 'utf8')
  const header = fs.readFileSync(path.join(DECOMP, 'include/script_manager.h'), 'utf8')
  const thresholds = new Map()
  for (const m of header.matchAll(/^#define\s+(SCRIPT_ID_OFFSET_\w+)\s+(\d+)/gm)) {
    thresholds.set(m[1], Number(m[2]))
  }
  const table = manager.slice(
    manager.indexOf('#define SCRIPT_RANGE_TABLE'),
    manager.indexOf('// clang-format on'),
  )
  const out = []
  for (const m of table.matchAll(/Entry\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/g)) {
    const from = thresholds.get(m[1])
    if (from === undefined) throw new Error(`모르는 경계 ${m[1]}`)
    out.push({ from, script: m[2], bank: m[3] })
  }
  return out
}

function main() {
  const order = readOrder()
  const kinds = readKinds(order)
  const byName = new Map(order.map((n, i) => [n, i]))
  const ranges = readRangeTable().map((r) => ({
    from: r.from,
    file: byName.get(r.script) ?? null,
    bank: r.bank,
  }))
  const { types, delays, rotateFrames } = movementTypeTable()
  const movements = movementTable().map((m) => ({
    name: m.name,
    kind: m.kind,
    ...(m.dir === null || m.dir === undefined ? {} : { dir: m.dir }),
    ...(m.tiles ? { tiles: m.tiles } : {}),
    ...(m.frames ? { frames: m.frames } : {}),
  }))

  // 갈래는 1124개 불리언이다. 이름 배열과 나란히 두는 대신 **초기화 표인 번호만**
  // 적는다 — 549개라 배열 하나가 절반으로 준다
  const initFiles = kinds.map((k, i) => (k === 'init' ? i : -1)).filter((i) => i >= 0)

  const json = (v) => JSON.stringify(v)
  const out = `// 스크립트 호환성 메타데이터 (DATA.md §2.10 · COPYRIGHT.md §11)
//
// 디컴프에서 기계로 뽑은 것이다. **롬 바이트는 하나도 없다** — 스크립트
// 바이트코드 자체는 사용자의 롬에서 읽고, 여기 있는 것은 그것을 어떻게 읽는지에
// 대한 설명이다: 명령 ${packCommands().length}개의 피연산자 폭, 파일
// ${order.length}개의 이름과 갈래, scriptID 구역 ${ranges.length}개의 경계,
// 이동 동작 ${movements.length}개.
//
// ⚠️ **손으로 고치지 않는다.** \`pnpm gen:scriptMeta\`가 디컴프가 있는 기계에서
// 다시 만든다. 손으로 옮기면 반드시 틀리고, 틀려도 티가 안 난다 — 폭이 하나
// 어긋나면 그 뒤가 전부 밀리는데 대개 다음 명령이 우연히 유효하다.

/** 명령 하나. \`args\`는 \`"2 4*"\`처럼 폭을 적고 상대 오프셋에 \`*\`를 붙인다 */
export interface CommandSpec {
  name: string
  args: string
  /** 길이가 조건부인 명령 여섯 개. 이 피연산자 값에 따라 뒤가 달라진다 */
  on?: number
  cases?: { v: number[], args: string }[]
}

export const COMMANDS: readonly CommandSpec[] = ${json(packCommands())}

/** \`scripts.order\`의 줄 번호가 곧 NARC 안의 번호다 */
export const SCRIPT_NAMES: readonly string[] = ${json(order)}

/**
 * 코드가 아니라 **초기화 스크립트 표**인 파일들.
 *
 * 바이트만 보고는 구분할 수 없다 — 초기화 표를 코드로 읽어도 대개 유효한 명령으로
 * 읽힌다. 디컴프 원본이 \`InitScriptEntry\`를 쓰는지로 가른다
 */
export const INIT_FILES: readonly number[] = ${json(initFiles)}

/** scriptID 구역. 큰 값부터 내려오며 처음 걸리는 구역이 답이다 */
export interface ScriptRange { from: number, file: number | null, bank: string }
export const RANGES: readonly ScriptRange[] = ${json(ranges)}

/** \`ApplyMovement\`가 가리키는 이동 동작 */
export interface Movement {
  name: string
  kind: string
  dir?: number
  tiles?: number
  frames?: number
}
export const MOVEMENTS: readonly (Movement | null)[] = ${json(movements)}

/** 배치표의 이동 유형 — 말을 안 걸어도 혼자 하는 짓이다 */
export const MOVEMENT_TYPES: readonly unknown[] = ${json(types)}
/** 유형이 다음 짓을 하기까지 기다리는 프레임. 이 중 하나를 뽑는다 */
export const MOVEMENT_DELAYS: readonly number[] = ${json(delays)}
/** 회전 유형이 한 칸 도는 데 걸리는 프레임 */
export const ROTATE_FRAMES = ${json(rotateFrames)}
`
  const file = path.join(ROOT, 'src/import/platinum/scriptMeta.ts')
  fs.writeFileSync(file, out, 'utf8')
  console.log(
    `명령 ${packCommands().length} · 파일 ${order.length}(초기화 ${initFiles.length}) · `
    + `구역 ${ranges.length} · 이동 ${movements.length} → ${(out.length / 1024).toFixed(1)}KB`,
  )
}

if (require.main === module) main()
