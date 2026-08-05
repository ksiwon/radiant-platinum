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
import { DIR, parseMovements } from './movement'
import { VAR_LAST_TALKED } from './vars'

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

// ── 이동 ─────────────────────────────────────────────────────────────────────
//
// `ApplyMovement`는 **또 다른 언어**를 가리킨다 — `{동작, 횟수}` 목록이다
// (`movement.ts`). 여기서는 그 목록을 읽어 세계에 넘기기만 한다.

on('ApplyMovement', (ctx) => {
  const localID = ctx.readVar()
  const at = ctx.readTarget()
  ctx.host.world.applyMovement(localID, parseMovements(ctx.bytes, at))
  return false
})

on('WaitMovement', (ctx) => {
  ctx.pause((c) => !c.host.world.moving)
  return true
})

on('FacePlayer', (ctx) => {
  // 말을 건 상대가 이쪽으로 돌아선다. 이게 없으면 등을 보고 대화한다
  const world = ctx.host.world
  if (world.target !== null && world.player !== null) {
    world.target.dir = dirToward(world.target, world.player)
  }
  return false
})

/** `from`이 `to`를 보려면 어느 쪽인가. 더 많이 벌어진 축을 고른다 */
function dirToward(from: { x: number, z: number }, to: { x: number, z: number }): number {
  const dx = to.x - from.x
  const dz = to.z - from.z
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? DIR.east : DIR.west
  return dz > 0 ? DIR.south : DIR.north
}

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

// ── 트레이너전 ───────────────────────────────────────────────────────────────
//
// 트레이너에게 말을 걸면 그 NPC의 scriptID(3000 + 번호 − 1)가 공용 파일
// `scripts_battles`의 진입점으로 풀리고, 거기 있는 이 흐름이 돈다:
//
//   GetTrainerID VAR_0x8004        scriptID에서 번호를 되뽑는다
//   GoToIfDefeated VAR_0x8004, …   이미 이겼으면 다른 대사로
//   PrintTrainerDialogue …         싸움 전 대사
//   StartTrainerBattle VAR_0x8004
//   CheckWonBattle VAR_RESULT
//   SetTrainerFlag VAR_0x8004      이겼다고 표시한다
//
// 그래서 이 여덟 개만 있으면 오버월드에서 배틀까지 이어진다.

/** `include/constants/scripts.h` */
const SCRIPT_ID_OFFSET_SINGLE_BATTLES = 3000
const SCRIPT_ID_OFFSET_DOUBLE_BATTLES = 5000
/** `generated/vars_flags.txt` — 이 뒤로 트레이너 번호만큼 떨어진 자리가 그 사람 플래그다 */
const TRAINER_DEFEATED_FLAGS_START = 1360

/** `Script_GetTrainerID` — scriptID에서 트레이너 번호를 되뽑는다 */
export function trainerIdOf(scriptID: number): number {
  const base = scriptID < SCRIPT_ID_OFFSET_DOUBLE_BATTLES
    ? SCRIPT_ID_OFFSET_SINGLE_BATTLES
    : SCRIPT_ID_OFFSET_DOUBLE_BATTLES
  return scriptID - base + 1
}

on('GetTrainerID', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), trainerIdOf(ctx.host.world.scriptID))
  return false
})

on('SetTrainerFlag', (ctx) => {
  ctx.host.vars.setFlag(TRAINER_DEFEATED_FLAGS_START + ctx.readVar())
  return false
})

on('ClearTrainerFlag', (ctx) => {
  ctx.host.vars.clearFlag(TRAINER_DEFEATED_FLAGS_START + ctx.readVar())
  return false
})

on('CheckTrainerFlag', (ctx) => {
  ctx.comparisonResult = ctx.host.vars.checkFlag(TRAINER_DEFEATED_FLAGS_START + ctx.readVar()) ? 1 : 0
  return false
})

on('CheckIsTrainerDoubleBattle', (ctx) => {
  const dest = ctx.readHalfWord()
  const trainer = ctx.host.world.services.trainer?.(trainerIdOf(ctx.host.world.scriptID))
  ctx.host.vars.set(dest, trainer?.double === true ? 1 : 0)
  return false
})

on('CheckHasTwoAliveMons', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), (ctx.host.world.services.aliveMons?.() ?? 0) >= 2 ? 1 : 0)
  return false
})

on('GetTrainerMessageTypes', (ctx) => {
  // 싱글이면 0(싸움 전) · 2(싸움 뒤)다. 더블은 앞뒤 번호가 따로 있는데
  // 어느 쪽 트레이너인지가 scriptID에 들어 있다
  const before = ctx.readHalfWord()
  const after = ctx.readHalfWord()
  const notEnough = ctx.readHalfWord()
  const world = ctx.host.world
  const double = world.services.trainer?.(trainerIdOf(world.scriptID))?.double === true
  const second = world.scriptID >= SCRIPT_ID_OFFSET_DOUBLE_BATTLES
    && trainerIdOf(world.scriptID) % 2 === 0
  ctx.host.vars.set(before, double ? (second ? TRMSG.preDouble2 : TRMSG.preDouble1) : TRMSG.pre)
  ctx.host.vars.set(after, double ? (second ? TRMSG.postDouble2 : TRMSG.postDouble1) : TRMSG.post)
  ctx.host.vars.set(notEnough, double
    ? (second ? TRMSG.notEnough2 : TRMSG.notEnough1)
    : 0)
  return false
})

/** `generated/trainer_message_types.txt`의 줄 번호 */
const TRMSG = {
  pre: 0, defeat: 1, post: 2,
  preDouble1: 3, postDouble1: 5, notEnough1: 6,
  preDouble2: 7, postDouble2: 9, notEnough2: 10,
  rematch: 17,
}

on('PrintTrainerDialogue', (ctx) => {
  const trainerID = ctx.readVar()
  const type = ctx.readVar()
  const world = ctx.host.world
  const at = world.services.trainer?.(trainerID)?.msg[String(type)]
  world.showText(at === undefined ? '' : world.services.trainerMessage?.(at) ?? '')
  ctx.pause(printed)
  return true
})

on('StartTrainerBattle', (ctx) => {
  const trainerID = ctx.readVar()
  ctx.readVar() // 두 번째 상대. 더블 배틀에서만 쓴다
  ctx.host.world.services.startTrainerBattle?.(trainerID)
  // 화면이 배틀로 넘어간다. 돌아올 때까지 이 자리에 선다
  ctx.pause((c) => c.host.world.services.battleResult?.() !== null)
  return true
})

on('CheckWonBattle', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.battleResult?.() === 'win' ? 1 : 0)
  return true
})

on('CheckLostBattle', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.battleResult?.() === 'loss' ? 1 : 0)
  return true
})

on('SetTargetTrainerDefeated', (ctx) => {
  // 트레이너 번호가 아니라 **맵 안 번호**로 표시한다. 원작이 그렇다 —
  // `Script_SetTrainerDefeated(…, MapObject_GetLocalID(*mapObj))`
  const id = ctx.host.vars.get(VAR_LAST_TALKED)
  ctx.host.vars.setFlag(TRAINER_DEFEATED_FLAGS_START + id)
  return false
})

on('GoToIfTargetTrainerDefeated', (ctx) => {
  const target = ctx.readTarget()
  const id = ctx.host.vars.get(VAR_LAST_TALKED)
  if (ctx.host.vars.checkFlag(TRAINER_DEFEATED_FLAGS_START + id)) ctx.jump(target)
  return false
})

on('GetMovementType', (ctx) => {
  const dest = ctx.readHalfWord()
  const localID = ctx.readVar()
  const object = ctx.host.world.objects(localID)
  ctx.host.vars.set(dest, object?.movementType ?? MOVEMENT_TYPE_NONE)
  return false
})

/** `generated/movement_types.txt`의 마지막 값. 대상이 없을 때 쓴다 */
const MOVEMENT_TYPE_NONE = 0xff

on('GetRematchTrainerID', (ctx) => {
  // 재대결은 VS시커가 있어야 성립한다. 없으면 `TRAINER_NONE`이고,
  // 스크립트는 그걸 보고 "이미 이긴 사람" 대사로 간다
  ctx.readVar()
  ctx.host.vars.set(ctx.readHalfWord(), 0)
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
