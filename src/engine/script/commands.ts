// 스크립트 명령 (DATA.md §2.10) — `src/scrcmd.c`에서 필요한 것부터 옮긴다.
//
// 840개를 다 만들 필요는 없다. 중요한 것은 **안 만든 명령도 정확한 길이로
// 건너뛰는 것**이다. 폭이 하나만 틀려도 그 뒤가 전부 밀려서, 대개 다음 바이트가
// 우연히 유효한 명령으로 읽히고 스크립트가 조용히 이상해진다.
//
// 그래서 표(`scripts.json`)에 있는 폭으로 건너뛰기 핸들러를 자동으로 만들고,
// 구현한 것만 그 위에 덮어쓴다. 새 명령을 구현하는 일이 "표에 이름 하나 추가"가
// 된다.
import type { ScriptCommand } from '../../data/schema'
import {
  compare, conditionHolds, type CommandFn, type ResumeFn, type ScriptContext,
} from './context'

/**
 * 이름으로 등록한다.
 *
 * opcode 번호가 아니라 이름을 쓰는 이유: 번호는 표를 보고 옮겨 적어야 하는데
 * 그러다 틀리면 **다른 명령이 조용히 실행된다**. 이름은 표에 없으면 바로 걸린다.
 */
export const HANDLERS = new Map<string, CommandFn>()

const on = (name: string, fn: CommandFn): void => {
  if (HANDLERS.has(name)) throw new Error(`명령 ${name}이 두 번 등록됐다`)
  HANDLERS.set(name, fn)
}

// ── 흐름 ─────────────────────────────────────────────────────────────────────
// 이 넷이 사실상 VM 본체다. 나머지 명령은 전부 이 위에 얹힌다.

on('Noop', () => false)
on('Dummy', () => false)

on('End', (ctx) => {
  ctx.stop()
  return false
})

on('GoTo', (ctx) => {
  ctx.jump(ctx.readTarget())
  return false
})

on('Call', (ctx) => {
  ctx.call(ctx.readTarget())
  return false
})

on('Return', (ctx) => {
  ctx.return_()
  return false
})

// 조건 분기는 **오프셋을 먼저 다 읽고** 판단한다. 안 뛸 때도 읽기 위치는
// 그만큼 지나가 있어야 하기 때문이다
on('GoToIf', (ctx) => {
  const condition = ctx.readByte()
  const target = ctx.readTarget()
  if (conditionHolds(condition, ctx.comparisonResult)) ctx.jump(target)
  return false
})

on('CallIf', (ctx) => {
  const condition = ctx.readByte()
  const target = ctx.readTarget()
  if (conditionHolds(condition, ctx.comparisonResult)) ctx.call(target)
  return false
})

// ── 비교 ─────────────────────────────────────────────────────────────────────

on('CompareVarToValue', (ctx) => {
  const value = ctx.host.vars.get(ctx.readHalfWord())
  ctx.comparisonResult = compare(value, ctx.readHalfWord())
  return false
})

on('CompareVarToVar', (ctx) => {
  const a = ctx.readVar()
  const b = ctx.readVar()
  ctx.comparisonResult = compare(a, b)
  return false
})

// ── 변수 ─────────────────────────────────────────────────────────────────────
// 목적지는 **번호 그대로** 읽는다(쓸 자리가 필요하니까). 값 쪽은 `readVar`로
// 읽어서 상수와 변수를 구분한다 — 어셈블러가 그 경계로 명령을 갈라 쓴다.

on('SetVarFromValue', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.readHalfWord())
  return false
})

on('SetVarFromVar', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.readVar())
  return false
})

on('AddVar', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.vars.get(dest) + ctx.readVar())
  return false
})

on('SubVar', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.vars.get(dest) - ctx.readVar())
  return false
})

// ── 플래그 ───────────────────────────────────────────────────────────────────

on('SetFlag', (ctx) => {
  ctx.host.vars.setFlag(ctx.readHalfWord())
  return false
})

on('ClearFlag', (ctx) => {
  ctx.host.vars.clearFlag(ctx.readHalfWord())
  return false
})

on('CheckFlag', (ctx) => {
  // 결과가 `comparisonResult`로 들어간다 — 그래서 `GoToIfSet`이
  // `CheckFlag` + `GoToIf 1`로 풀린다. 참이 1(같다) 자리에 오는 것이 핵심이다
  ctx.comparisonResult = ctx.host.vars.checkFlag(ctx.readHalfWord()) ? 1 : 0
  return false
})

on('SetFlagFromVar', (ctx) => {
  ctx.host.vars.setFlag(ctx.readVar())
  return false
})

on('CheckFlagFromVar', (ctx) => {
  ctx.comparisonResult = ctx.host.vars.checkFlag(ctx.readVar()) ? 1 : 0
  return false
})

// ── 대사창 ───────────────────────────────────────────────────────────────────
//
// 여기부터가 **바깥 세계를 만지는** 명령이다. 위의 흐름·변수 명령과 달리 한
// 프레임에 끝나지 않으므로 `pause`로 자리를 잡고 다음 프레임에 다시 묻는다.
//
// 원작은 전부 `ScriptContext_Pause(ctx, …)` + `return TRUE` 꼴이다. 참을
// 돌려주는 것이 중요하다 — 그래야 이번 프레임이 거기서 끝난다.

/** `ScriptContext_WaitForFinishedPrinting` */
const printed: ResumeFn = (ctx) => ctx.host.world.printed

/** A나 B가 눌렸는가 (`ScriptContext_CheckABPress`) */
const abPressed: ResumeFn = (ctx) => ctx.host.world.pressed

on('Message', (ctx) => {
  // **바이트 하나**다. `MessageVar`와 달리 변수를 안 거친다
  ctx.host.world.showMessage(ctx.readByte())
  ctx.pause(printed)
  return true
})

on('MessageVar', (ctx) => {
  ctx.host.world.showMessage(ctx.readVar() & 0xff)
  ctx.pause(printed)
  return true
})

on('MessageNoSkip', (ctx) => {
  // A/B로 빨리 감지 못한다 — 놓치면 안 되는 안내에 쓴다
  ctx.host.world.showMessage(ctx.readVar() & 0xff, false)
  ctx.pause(printed)
  return true
})

on('MessageInstant', (ctx) => {
  // 유일하게 안 기다리는 글이다. 다 찍어 놓고 다음 명령으로 넘어간다
  ctx.host.world.showInstant(ctx.readByte())
  return false
})

on('MessageSynchronized', (ctx) => {
  // 통신이 붙어 있으면 자동 넘김으로 바뀐다. 통신은 아직 없으므로 보통 글이다
  ctx.host.world.showMessage(ctx.readByte())
  ctx.pause(printed)
  return true
})

// 대기 셋은 원작에서도 조건만 다르고 같은 모양이다. 방향키로 몸을 돌리거나
// X로 시작 메뉴를 여는 곁가지는 그 계통을 만들 때 붙인다
on('WaitABPress', (ctx) => {
  ctx.pause(abPressed)
  return true
})

on('WaitButton', (ctx) => {
  ctx.pause(abPressed)
  return true
})

on('WaitABPadPress', (ctx) => {
  ctx.pause(abPressed)
  return true
})

on('WaitABPressTime', (ctx) => {
  // 버튼을 누르거나 시간이 다 되거나. 원작은 남은 수를 `ctx->data[0]`에 둔다
  ctx.scratch[0] = ctx.readVar()
  ctx.pause((c) => {
    if (c.host.world.pressed) return true
    c.scratch[0] -= 1
    return c.scratch[0] === 0
  })
  return true
})

on('WaitTime', (ctx) => {
  // 남은 수가 **변수에** 들어간다. 스크립트가 그동안 그 값을 볼 수 있다
  const frames = ctx.readHalfWord()
  const countdown = ctx.readHalfWord()
  ctx.host.vars.set(countdown, frames)
  ctx.scratch[0] = countdown
  ctx.pause((c) => {
    const left = c.host.vars.get(c.scratch[0]!) - 1
    c.host.vars.set(c.scratch[0]!, left)
    return left === 0
  })
  return true
})

on('OpenMessage', (ctx) => {
  ctx.host.world.openBox()
  return false
})

on('CloseMessage', (ctx) => {
  ctx.host.world.closeBox(true)
  return false
})

on('CloseMessageWithoutErasing', (ctx) => {
  ctx.host.world.closeBox(false)
  return false
})

on('ShowYesNoMenu', (ctx) => {
  // 고른 값이 **변수로** 들어간다. 대개 VAR_RESULT고, 바로 뒤에
  // `CompareVarToValue VAR_RESULT, 0` + `GoToIf`가 따라온다
  ctx.host.world.openYesNo(ctx.readHalfWord())
  ctx.pause((c) => c.host.world.menu === null)
  return true
})

// ── 칸 채우기 ────────────────────────────────────────────────────────────────
//
// `{STRVAR_1 …, 칸, 조사}` 자리를 채우는 명령들이다. 이걸 안 만들면 대사에
// 이름이 빈칸으로 나온다 — 떡잎마을 첫 대사부터 "오오!  아닌가"가 된다.
//
// 칸 번호는 **바이트 하나**다(`ScriptContext_ReadByte`).

on('BufferPlayerName', (ctx) => {
  ctx.host.world.slots.set(ctx.readByte(), ctx.host.world.names.player())
  return false
})

on('BufferRivalName', (ctx) => {
  ctx.host.world.slots.set(ctx.readByte(), ctx.host.world.names.rival())
  return false
})

on('BufferCounterpartName', (ctx) => {
  // 주인공의 반대 성별 주인공. 콘테스트·통신 안내에 나온다
  ctx.host.world.slots.set(ctx.readByte(), ctx.host.world.names.counterpart())
  return false
})

on('BufferNumber', (ctx) => {
  // 원작은 자릿수를 맞춰 공백으로 채우는데(`PADDING_MODE_SPACES`), 자릿수를
  // `GetNumberDigitCount(number)`로 그 수 자신에게서 얻으므로 채울 것이 없다
  const slot = ctx.readByte()
  ctx.host.world.slots.set(slot, String(ctx.readVar()))
  return false
})

// ── 표 만들기 ────────────────────────────────────────────────────────────────

/**
 * 안 만든 명령을 **정확한 길이로** 건너뛰는 핸들러.
 *
 * 여섯 명령은 길이가 첫 피연산자 값에 달렸다. 그것까지 봐야 한다
 */
function skipper(cmd: ScriptCommand): CommandFn {
  const fixed = widths(cmd.args)
  return (ctx) => {
    const values = fixed.map((size) => read(ctx, size))
    if (cmd.cases !== undefined && cmd.on !== undefined) {
      const hit = cmd.cases.find((c) => c.v.includes(values[cmd.on!]!))
      if (hit) for (const size of widths(hit.args)) read(ctx, size)
    }
    return false
  }
}

const widths = (spec: string): number[] =>
  spec === '' ? [] : spec.split(' ').map((s) => Number(s[0]))

const read = (ctx: ScriptContext, size: number): number =>
  size === 1 ? ctx.readByte() : size === 2 ? ctx.readHalfWord() : ctx.readWord()

export interface CommandTable {
  readonly map: ReadonlyMap<number, CommandFn>
  /** 아직 구현 안 한 명령의 opcode. 만나면 건너뛴다 */
  readonly unhandled: ReadonlySet<number>
}

/** 표 하나에서 실행 가능한 명령 맵을 만든다 */
export function buildCommands(table: readonly ScriptCommand[]): CommandTable {
  const map = new Map<number, CommandFn>()
  const unhandled = new Set<number>()
  for (const [opcode, cmd] of table.entries()) {
    const handler = HANDLERS.get(cmd.name)
    if (handler === undefined) unhandled.add(opcode)
    map.set(opcode, handler ?? skipper(cmd))
  }
  return { map, unhandled }
}
