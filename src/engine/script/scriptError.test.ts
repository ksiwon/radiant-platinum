// 스크립트가 터지면 **세고 남긴다** (PARITY §10 · CODEMAP §3)
//
// 스크립트가 터지면 `field.ts`가 그것을 잡아 창을 닫고 오버월드를 놓아준다.
// 게임은 안 멈추지만 **그 스크립트가 세우려던 플래그·워프·사람 움직임은 그
// 자리에서 전부 안 일어난다.**
//
// ⚠️ 한동안 그 사실을 읽는 자리가 `tools/e2e/story.mjs` 하나뿐이었다. 게임
// 안에는 없었고 화면에는 대사창이 그냥 사라지는 것으로만 보였다. 여기서 재는
// 것은 「터졌다」가 아니라 **「터진 것이 남는가」**다.
//
// ⚠️ **「안 만든 명령」과 「터지는 명령」은 다른 것이다.** 표에 있는데 핸들러가
// 없는 명령은 `buildCommands`가 **정확한 폭으로 건너뛰는** 손잡이를 붙여 준다
// (`skipper`) — 그 한 명령의 효과만 없어지고 스크립트는 계속 간다. 터지는 것은
// 셋뿐이다: 표에 아예 없는 opcode · 파일 끝을 넘어가는 읽기 · 되돌아 도는 고리
// (`STEP_CAP`). 아래 시험이 그 둘을 갈라 놓는다
//
// ⚠️ **롬 자료가 없어도 돈다.** 진짜 스크립트를 쓰면 어느 맵이 어느 명령을 쓰는지에
// 시험이 매이므로, 여기서는 바이트 몇 개짜리 파일을 손으로 만든다
import { beforeEach, describe, expect, it } from 'vitest'
import type { ScriptFile } from '../../data/schema'
import { buildCommands } from './commands'
import { fieldScripts, makeWorld, scriptSystem, start } from './field'
import { VarStore } from './vars'

/** 표에 있지만 아무도 안 만든 명령. **건너뛴다** */
const NO_HANDLER = 'ScrCmd_아무도_안_만든_것'
/** 표에 아예 없는 opcode. **터진다** */
const OFF_TABLE = 9

/**
 * 진입점 하나짜리 스크립트 파일.
 *
 * 배치는 원작 그대로다 — 앞이 진입점 표(u32 상대 오프셋, 기준은 **그 필드 바로
 * 뒤**)고 뒤가 코드다 (`entryOffset`)
 */
function oneEntry(opcode: number): Uint8Array {
  const bytes = new Uint8Array(8)
  const view = new DataView(bytes.buffer)
  // 진입점 0 → 4(표 바로 뒤) + 0
  view.setInt32(0, 0, true)
  view.setUint16(4, opcode, true)
  return bytes
}

function meta(commandName: string): ScriptFile {
  return {
    count: 1,
    bytes: 8,
    files: [{ name: 'test', kind: 'code', at: 0, size: 8, entries: 1 }],
    // scriptID 1 이상은 맵 파일로 간다. 공용 구역은 이 시험에 필요 없다
    ranges: [{ from: 9000, file: null, bank: 'none', msg: 0 }],
    commands: [
      { name: 'End', args: '' },
      { name: commandName, args: '' },
    ],
    movements: [null],
    movementTypes: [],
  } as unknown as ScriptFile
}

/** 진입점 하나를 돌려 본다. `opcode`가 그 바이트에 박히는 명령 번호다 */
function runOne(commandName: string, opcode = 1): void {
  const m = meta(commandName)
  fieldScripts.data = { meta: m, bytes: oneEntry(opcode) }
  fieldScripts.commands = buildCommands(m.commands)
  fieldScripts.vars = new VarStore()
  fieldScripts.world = makeWorld(fieldScripts.vars, [])
  expect(start(1, 0)).toBe(true)
  scriptSystem.fixedUpdate()
}

describe('스크립트 오류를 삼키지 않는다', () => {
  beforeEach(() => {
    fieldScripts.errors = 0
    fieldScripts.lastError = null
    fieldScripts.ctx = null
  })

  it('표에 없는 opcode를 만나면 수가 오르고 마지막 한 줄이 남는다', () => {
    runOne(NO_HANDLER, OFF_TABLE)
    expect(fieldScripts.errors).toBe(1)
    expect(fieldScripts.lastError).toContain('opcode')
    expect(fieldScripts.lastError).toContain('핸들러가 없다')
  })

  it('⚠️ 오버월드는 놓아준다 — 한 스크립트가 터졌다고 게임이 멎으면 안 된다', () => {
    runOne(NO_HANDLER, OFF_TABLE)
    expect(fieldScripts.ctx).toBeNull()
  })

  it('두 번 터지면 둘로 센다 — 한 번 뒤로 눈을 감지 않는다', () => {
    runOne(NO_HANDLER, OFF_TABLE)
    runOne(NO_HANDLER, OFF_TABLE)
    expect(fieldScripts.errors).toBe(2)
  })

  it('⚠️ 멀쩡한 명령에서는 안 센다 — 검사에 이빨이 있다', () => {
    // `End`는 핸들러가 있다. 이 줄이 없으면 위 셋은 「늘 1이 오른다」로도 통과한다
    runOne('End', 0)
    expect(fieldScripts.errors).toBe(0)
    expect(fieldScripts.lastError).toBeNull()
  })

  // ⚠️ **이 줄이 §3의 전제를 고친다.** 대장에는 「핸들러가 없는 opcode에서
  // ScriptError를 던진다」고 적혀 있었는데, 표에 **있는** 명령은 안 터진다 —
  // `buildCommands`가 폭을 아는 건너뛰기를 붙여 준다. 그래서 안 만든 명령 310종이
  // 하는 일은 「스크립트를 죽이는 것」이 아니라 **그 한 줄만 조용히 없애는 것**이다.
  // 둘은 고치는 길이 다르므로 갈라 둔다
  it('⚠️ 표에 있는데 안 만든 명령은 안 터진다 — 폭만큼 건너뛴다', () => {
    runOne(NO_HANDLER)
    expect(fieldScripts.errors).toBe(0)
    expect(fieldScripts.lastError).toBeNull()
  })
})
