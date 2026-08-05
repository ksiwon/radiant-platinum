// 이벤트 스크립트 추출 (DATA.md §2.10) — fielddata/script/scr_seq.narc, 1124개.
//
// **바이트코드를 그대로 싣는다.** 전부 288KB, brotli 71KB다. 우리 쪽 표현으로
// 옮기면 반드시 뭔가 흘리는데(조건부 길이 명령 6개, 도달 불가 코드, 정렬),
// 그럴 만큼 얻는 것이 없다. VM이 원본 바이트를 그대로 돌면 DS와 같은 것을 한다.
//
// 파일 구조는 디컴프의 어셈블러 매크로에서 읽었고 (`asm/macros/scrcmd.inc`),
// **1124개를 조립해 롬과 바이트 단위로 맞춰 확인했다** (scripts-verify.js):
//
//   ScriptEntry Foo      →  .long Foo-.-4     (진입점 표, 4바이트씩)
//   ScriptEntryEnd       →  .short 0xFD13     (표 끝 표시)
//   Foo: ...             →  u16 opcode + 피연산자
//
// 파일 1124개 중 549개는 코드가 아니라 **초기화 스크립트 표**다 (맵에 들어올 때·
// 나갈 때·매 프레임 돌 것을 고르는 작은 표). 구조가 전혀 다르므로 갈라 둔다 —
// 이걸 코드로 읽으면 예외 없이 그럴듯한 쓰레기가 나온다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { buildTable } = require('./scrcmd-table')

const NARC = '/fielddata/script/scr_seq.narc'
/** `ScriptEntryEnd` — 진입점 표의 끝 */
const ENTRY_TABLE_END = 0xfd13
const DECOMP = path.join(ROOT, 'raw/decomp')

/**
 * scriptID → (스크립트 파일, 글 뱅크).
 *
 * 맵 이벤트가 들고 있는 번호는 맵의 스크립트 파일 안 번호지만, 2000 이상은
 * **공용 스크립트 구역**이다. `script_manager.c`의 `SCRIPT_RANGE_TABLE`이
 * 그 경계를 정하고, 큰 값부터 내려오며 처음 걸리는 구역이 답이다.
 */
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

/** `scripts.order`의 줄 번호가 곧 NARC 안의 번호다 */
function readOrder() {
  return fs
    .readFileSync(path.join(DECOMP, 'res/field/scripts/scripts.order'), 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 초기화 스크립트 표인지.
 *
 * 디컴프 원본이 `InitScriptEntry`를 쓰는지로 가른다. 바이트만 보고는 구분할 수
 * 없다 — 초기화 표를 코드로 읽어도 대개 유효한 명령으로 읽힌다.
 */
function readKinds(order) {
  const dir = path.join(DECOMP, 'res/field/scripts')
  return order.map((name) => {
    const text = fs.readFileSync(path.join(dir, `${name}.s`), 'utf8')
    return /^\s+InitScriptEntry/m.test(text) ? 'init' : 'code'
  })
}

/**
 * 코드 파일의 진입점 표.
 *
 * **끝 표시(`0xFD13`)에 기대면 안 된다** — 원본이 `ScriptEntryEnd`를 빠뜨린
 * 파일이 셋 있다. 게임은 `base + offsetID * 4`로 곧장 들어가므로 끝 표시가
 * 없어도 돌아간다. 그래서 여기서는 **가장 앞선 목적지**를 표의 끝으로 본다 —
 * 코드가 시작되는 자리보다 뒤에 진입점이 있을 수는 없다.
 *
 * @returns {number[]} 절대 바이트 주소
 */
function readEntries(buf) {
  const entries = []
  let limit = buf.length
  for (let at = 0; at + 4 <= limit; at += 4) {
    if (buf.readUInt16LE(at) === ENTRY_TABLE_END) break
    const target = at + 4 + buf.readInt32LE(at)
    if (target < 0 || target > buf.length) throw new Error(`진입점이 파일 밖이다: ${target}`)
    limit = Math.min(limit, target)
    entries.push(target)
  }
  return entries
}

/**
 * 명령표를 런타임이 쓸 작은 형태로.
 *
 * 피연산자 폭만 있으면 모르는 명령도 건너뛸 수 있다 — 그게 중요하다.
 * 840개 중 실제로 손댈 것은 훨씬 적지만, 나머지를 **정확한 길이로 건너뛰지**
 * 못하면 그 뒤가 전부 밀린다.
 *
 * 폭은 `"2 2"`처럼 적고, 상대 오프셋은 `*`를 붙인다 (`"1 4*"`).
 */
function packCommands() {
  const { table } = buildTable()
  return table.map((cmd) => {
    const spec = { name: cmd.name, args: cmd.args.map(argCode).join(' ') }
    if (cmd.cases) {
      spec.on = cmd.cases.on
      spec.cases = cmd.cases.when.map((w) => ({
        v: w.values,
        args: w.args.map(argCode).join(' '),
      }))
    }
    return spec
  })
}

const argCode = (a) => `${a.size}${a.rel ? '*' : ''}`

function main() {
  const rom = openRom()
  const files = rom.narc(NARC)
  const order = readOrder()
  if (order.length !== files.length) {
    throw new Error(`목록 ${order.length}개, 롬 ${files.length}개 — 안 맞는다`)
  }
  const kinds = readKinds(order)

  const chunks = []
  const index = []
  let at = 0
  for (const [i, buf] of files.entries()) {
    chunks.push(buf)
    index.push({
      name: order[i],
      kind: kinds[i],
      at,
      size: buf.length,
      entries: kinds[i] === 'code' ? readEntries(buf).length : 0,
    })
    at += buf.length
  }

  const bin = Buffer.concat(chunks)
  const binPath = path.join(ROOT, 'public/data/scripts.bin')
  fs.writeFileSync(binPath, bin)

  const ranges = readRangeTable()
  const byName = new Map(order.map((n, i) => [n, i]))
  writeJson('scripts.json', {
    count: files.length,
    bytes: bin.length,
    files: index,
    /** 큰 값부터 내려오며 처음 걸리는 구역이 답이다 (script_manager.c) */
    ranges: ranges.map((r) => ({
      from: r.from,
      file: byName.get(r.script) ?? null,
      bank: r.bank,
    })),
    commands: packCommands(),
  })

  const counts = kinds.reduce((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {})
  console.log(`스크립트 ${files.length}개 — ${JSON.stringify(counts)}`)
  console.log(`  scripts.bin ${(bin.length / 1024).toFixed(1)}KB`)
  console.log(`  진입점 합계 ${index.reduce((s, f) => s + f.entries, 0)}`)
  console.log(`  공용 구역 ${ranges.length}개`)
}

if (require.main === module) main()
module.exports = { readEntries, readOrder, readKinds, NARC }
