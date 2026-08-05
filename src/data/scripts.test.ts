// 추출된 이벤트 스크립트 검증 (DATA.md §2.10)
//
// 포맷이 맞다는 것은 이미 다른 곳에서 증명했다 — 디컴프 원본 1124개를 조립해
// 롬과 바이트 단위로 맞췄다 (`pnpm verify:scripts`). 그건 롬이 있어야 돌아가므로
// 여기서는 **싣는 산출물**이 그 결과와 어긋나지 않았는지를 본다.
//
// 특히 조심할 것: 이 데이터는 "그럴듯하게 틀리기" 쉽다. 초기화 스크립트 549개를
// 코드로 잘못 읽었을 때도 아무 예외 없이 통과했었다 — 바이트 열이 우연히 유효한
// 명령으로 읽혔을 뿐이었다. 그래서 명령 길이를 실제로 따라가 본다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scriptFileSchema } from './schema'

const DATA = resolve(__dirname, '../../public/data')
const present = existsSync(resolve(DATA, 'scripts.json')) && existsSync(resolve(DATA, 'scripts.bin'))
const maybe = present ? describe : describe.skip

/** `ScriptEntryEnd` — 진입점 표의 끝 (있는 파일에만 있다) */
const ENTRY_TABLE_END = 0xfd13

maybe('이벤트 스크립트', () => {
  const meta = scriptFileSchema.parse(
    JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')),
  )
  const bin = readFileSync(resolve(DATA, 'scripts.bin'))
  const view = new DataView(
    bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer,
  )

  const widths = (spec: string) =>
    spec === '' ? [] : spec.split(' ').map((s) => ({ size: Number(s[0]), rel: s.endsWith('*') }))

  /** 한 명령의 길이(opcode 2 + 피연산자). 조건부 길이 여섯 개까지 본다 */
  const sizeOf = (at: number): number => {
    const op = view.getUint16(at, true)
    const cmd = meta.commands[op]
    if (!cmd) throw new Error(`0x${at.toString(16)}: opcode ${op}가 표 밖이다`)
    let pos = at + 2
    const read = (w: { size: number }) => {
      const v = w.size === 1
        ? view.getUint8(pos)
        : w.size === 2 ? view.getUint16(pos, true) : view.getInt32(pos, true)
      pos += w.size
      return v
    }
    const values = widths(cmd.args).map(read)
    if (cmd.cases !== undefined && cmd.on !== undefined) {
      const hit = cmd.cases.find((c) => c.v.includes(values[cmd.on!]!))
      if (hit) widths(hit.args).forEach(read)
    }
    return pos - at
  }

  it('bin 크기와 파일 경계가 서로 맞는다', () => {
    expect(bin.byteLength).toBe(meta.bytes)
    expect(meta.files).toHaveLength(meta.count)
    let at = 0
    for (const f of meta.files) {
      expect(f.at).toBe(at)
      // NARC는 멤버를 4바이트에 맞춰 채운다 — 1124개 전부 4의 배수여야 한다
      expect(f.size % 4).toBe(0)
      at += f.size
    }
    expect(at).toBe(meta.bytes)
  })

  it('코드 파일 575개 · 초기화 표 549개', () => {
    // 이 둘을 섞으면 초기화 표가 코드로 읽혀 조용히 이상한 스크립트가 나온다
    const code = meta.files.filter((f) => f.kind === 'code')
    expect(code).toHaveLength(575)
    expect(meta.files.filter((f) => f.kind === 'init')).toHaveLength(549)
    expect(code.reduce((s, f) => s + f.entries, 0)).toBe(4079)
    expect(meta.files.every((f) => (f.kind === 'init') === (f.entries === 0))).toBe(true)
  })

  it('진입점이 전부 자기 파일 안의 코드 자리를 가리킨다', () => {
    for (const f of meta.files) {
      if (f.kind !== 'code') continue
      let earliest = f.size
      for (let i = 0; i < f.entries; i++) {
        const at = i * 4
        const target = at + 4 + view.getInt32(f.at + at, true)
        expect(target).toBeGreaterThan(0)
        expect(target).toBeLessThan(f.size)
        earliest = Math.min(earliest, target)
      }
      // 표가 코드와 겹치면 진입점 개수를 잘못 센 것이다
      expect(f.entries * 4).toBeLessThanOrEqual(earliest)
    }
  })

  it('진입점에서 출발하면 명령이 끊기지 않고 끝까지 간다', () => {
    // 피연산자 폭이 하나만 틀려도 그 뒤가 전부 밀려 여기서 터진다
    let routines = 0
    let commands = 0
    for (const f of meta.files) {
      if (f.kind !== 'code') continue
      for (let i = 0; i < f.entries; i++) {
        const start = i * 4 + 4 + view.getInt32(f.at + i * 4, true)
        let at = start
        for (let step = 0; step < 4096; step++) {
          const op = view.getUint16(f.at + at, true)
          at += sizeOf(f.at + at)
          expect(at).toBeLessThanOrEqual(f.size)
          commands++
          // End · GoTo · Return — 여기서 제어가 다음 명령으로 흐르지 않는다
          if (op === 0x002 || op === 0x016 || op === 0x01b) break
        }
        routines++
      }
    }
    expect(routines).toBe(4079)
    expect(commands).toBeGreaterThan(20000)
  })

  it('끝 표시가 있는 파일에서는 표 바로 뒤가 그 표시다', () => {
    // 셋은 원본이 ScriptEntryEnd를 빠뜨렸다. 나머지는 전부 있어야 한다
    const missing = meta.files.filter(
      (f) => f.kind === 'code' && view.getUint16(f.at + f.entries * 4, true) !== ENTRY_TABLE_END,
    )
    expect(missing).toHaveLength(3)
  })

  it('명령표 840개가 전부 폭을 갖는다', () => {
    expect(meta.commands).toHaveLength(840)
    expect(meta.commands.filter((c) => c.cases).length).toBe(6)
    // 상대 오프셋을 갖는 명령은 아홉 개다 (GoTo·Call·조건부 넷·ApplyMovement 등)
    expect(meta.commands.filter((c) => c.args.includes('*')).length).toBe(9)
    expect(meta.commands[0x002]!.name).toBe('End')
    expect(meta.commands[0x016]!.name).toBe('GoTo')
    expect(meta.commands[0x01b]!.name).toBe('Return')
    expect(meta.commands[0x02c]!.args).toBe('1')
    expect(meta.commands[0x05e]!.name).toBe('ApplyMovement')
  })

  it('공용 스크립트 구역이 큰 값부터 내려간다', () => {
    // script_manager.c가 이 순서대로 훑는다 — 뒤집히면 엉뚱한 파일이 걸린다
    for (let i = 1; i < meta.ranges.length; i++) {
      expect(meta.ranges[i]!.from).toBeLessThan(meta.ranges[i - 1]!.from)
    }
    for (const r of meta.ranges) {
      expect(r.file).not.toBeNull()
      expect(meta.files[r.file!]!.kind).toBe('code')
    }
  })
})
