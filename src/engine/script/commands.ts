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
import { addNpc, npcActors, removeNpc, setNpcPlacement } from '../actor/npcs'
import { mapById, world as mapWorld } from '../map/world'
import { fadeDone, startFade } from './fade'
import { DIR, parseMovements } from './movement'
import { VAR_LAST_TALKED } from './vars'
import { LIST_MENU_NO_SELECTION_YET } from './world'

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

/**
 * 다른 **파일**의 스크립트를 부른다 (`ScrCmd_CallCommonScript`).
 *
 * `Call`과 다르다 — `Call`은 같은 파일 안에서 뛰고, 이쪽은 공용 구역의 파일을
 * 통째로 새로 연다. 글 뱅크까지 같이 갈린다.
 *
 * ⚠️ 이 명령을 안 만들고 건너뛰면 **하는 일이 통째로 사라진다.** 포켓몬센터
 * 간호사의 스크립트는 `SetVar` 하나에 `CallCommonScript 2002`가 전부다
 */
on('CallCommonScript', (ctx) => {
  const id = ctx.readHalfWord()
  if (ctx.host.common?.call(id) !== true) return false
  ctx.pause((c) => c.host.common?.running() !== true)
  return true
})

/**
 * 공용 스크립트에서 돌아간다 (`ScrCmd_ReturnCommonScript`).
 *
 * 원작은 깃발만 내리고 **다음 명령을 계속 밟는다.** 우리는 여기서 문맥을
 * 끝낸다 — 디컴프의 이 명령 41곳이 **전부** 바로 뒤에 `End`라, 밟을 다음
 * 명령이 어차피 그것뿐이다. 이렇게 두면 부모와 자식이 같이 도는 상태가
 * 생기지 않는다
 */
on('ReturnCommonScript', (ctx) => {
  ctx.stop()
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

/**
 * ⚠️ **`CheckFlag`와 모양이 다르다.** 이쪽은 인자가 둘이고 답이
 * `comparisonResult`가 아니라 **변수로** 들어간다 (`ScrCmd_CheckFlagFromVar`가
 * `GetVarPointer`를 두 번 부른다):
 *
 *   CheckFlagFromVar 플래그번호가든변수, 답을받을변수
 *
 * 인자를 하나만 읽고 있었다 — 그러면 그 뒤가 통째로 두 바이트 밀린다.
 * 훑기가 이 명령에 못 닿아서(`vm.test`의 `IDLE_COMMANDS`) 오래 안 걸렸고,
 * 폭을 재는 시험(`argWidth.test`)이 잡았다
 */
on('CheckFlagFromVar', (ctx) => {
  const flag = ctx.host.vars.get(ctx.readHalfWord())
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.vars.checkFlag(flag) ? 1 : 0)
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

// ── 목록 메뉴 ────────────────────────────────────────────────────────────────
//
// 셋으로 나뉘어 있다: `Init…`이 자리와 결과 변수를 잡고, `Add…`가 항목을 쌓고,
// `Show…`가 띄운 뒤 답을 기다린다. 기다리는 방법이 특이한데, 원작은 결과
// 변수를 0xEEEE로 채워 두고 **그 값이 바뀌는 것**으로 선택을 안다.
//
// 지역(Local)과 전역(Global)의 차이는 항목 글을 어느 뱅크에서 읽느냐다.
// 지역은 지금 스크립트의 뱅크, 전역은 `TEXT_BANK_MENU_ENTRIES` 하나다.

/** `Init…TextMenu` 넷의 몸통. 인자 배치가 전부 같다 */
const initMenu = (scope: 'local' | 'global'): CommandFn => (ctx) => {
  const anchorX = ctx.readByte()
  const anchorY = ctx.readByte()
  const cursor = ctx.readByte()
  const canExitWithB = ctx.readByte()
  const dest = ctx.readHalfWord()
  void anchorX; void anchorY // 자리는 원작 화면 격자다. 우리 화면은 CSS가 잡는다
  ctx.host.world.initMenu(dest, cursor, canExitWithB !== 0, scope)
  ctx.scratch[0] = dest
  return true
}

on('InitLocalTextMenu', initMenu('local'))
on('InitGlobalTextMenu', initMenu('global'))
on('InitLocalTextListMenu', initMenu('local'))
on('InitGlobalTextListMenu', initMenu('global'))

on('AddMenuEntryImm', (ctx) => {
  // 바이트판이다. 변수도 255 넘는 글 번호도 못 쓴다
  const stringID = ctx.readByte()
  ctx.host.world.addMenuEntry(stringID, ctx.readByte())
  return false
})

on('AddMenuEntry', (ctx) => {
  const stringID = ctx.readVar()
  ctx.host.world.addMenuEntry(stringID, ctx.readVar())
  return false
})

on('AddListMenuEntry', (ctx) => {
  const stringID = ctx.readVar()
  const altID = ctx.readVar()
  // 0xff는 "설명 없음"이다 (`LIST_MENU_ENTRY_NO_ALT_TEXT`)
  ctx.host.world.addMenuEntry(stringID, ctx.readVar(), altID === LIST_MENU_ENTRY_NO_ALT_TEXT ? null : altID)
  return false
})

const LIST_MENU_ENTRY_NO_ALT_TEXT = 0xff

/** 답을 기다린다. 결과 변수가 0xEEEE에서 벗어나면 골랐다는 뜻이다 */
const chosen: ResumeFn = (ctx) =>
  ctx.host.world.vars.get(ctx.scratch[0]!) !== LIST_MENU_NO_SELECTION_YET

const showMenu = (columns: (ctx: ScriptContext) => number): CommandFn => (ctx) => {
  ctx.host.world.showMenu('list', columns(ctx))
  ctx.pause(chosen)
  return true
}

on('ShowStartMenu', (ctx) => {
  // 스크립트가 여는 시작 메뉴다 (튜토리얼에서 "가방을 열어 봐" 하는 자리).
  // 화면이 닫힐 때까지 선다
  ctx.host.world.services.openStartMenu?.()
  ctx.pause((c) => c.host.world.services.menuOpen?.() !== true)
  return true
})

// ── 상점 ─────────────────────────────────────────────────────────────────────
//
// 재고는 스크립트가 안 준다. 일반 상점은 **뱃지 수**로 늘어나고(`ScrCmd_PokeMartCommon`)
// 지역 상점은 번호로 목록을 고른다. 두 경우 다 실제 목록은 코드에 박힌 표라,
// 여기서는 무엇을 열지만 정하고 표는 붙이는 쪽(`scene/fieldServices.ts`)이 푼다.
const openShop = (stock: (ctx: ScriptContext) => readonly number[]): CommandFn => (ctx) => {
  // ⚠️ 인자를 **먼저** 읽는다. 서비스가 안 붙어 있어도 바이트는 지나가야 한다
  const items = stock(ctx)
  ctx.host.world.services.openShop?.(items)
  ctx.pause((c) => c.host.world.services.menuOpen?.() !== true)
  return true
}

on('PokeMartCommon', openShop((ctx) => {
  // 인자는 안 쓰인다 (`u16 unused = ScriptContext_GetVar(ctx)`). 그래도 읽는다
  ctx.readVar()
  return ctx.host.world.services.martStock?.common() ?? []
}))

on('PokeMartSpecialties', openShop((ctx) => {
  const martID = ctx.readVar()
  return ctx.host.world.services.martStock?.specialties(martID) ?? []
}))

// ── 보관 시스템 ──────────────────────────────────────────────────────────────
//
// PC 앞에서 "포켓몬을 맡긴다"를 고르면 이 명령이 돈다. 화면이 닫힐 때까지 서고,
// 돌아오면 스크립트가 다시 PC 메뉴를 띄운다 (`CommonScript_PCFadeInAccessWhichPC`).
on('OpenPokemonStorage', (ctx) => {
  // ⚠️ 인자를 **먼저** 읽는다. 화면이 안 붙어 있어도 바이트는 지나가야 한다
  const mode = ctx.readByte()
  ctx.host.world.services.openStorage?.(mode)
  ctx.pause((c) => c.host.world.services.menuOpen?.() !== true)
  return true
})

on('GetPCBoxesFreeSlotCount', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.boxFreeSlots?.() ?? 0)
  return false
})

on('CountAliveMonsAndBoxMons', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.aliveAndBoxMons?.() ?? 0)
  return false
})

on('ShowMenu', showMenu(() => 1))
on('ShowListMenu', showMenu(() => 1))
on('ShowMenuMultiColumn', showMenu((ctx) => Math.max(1, ctx.readByte())))
// 폭과 커서 기억은 화면이 알아서 한다 — 인자는 읽어서 버려야 그 뒤가 안 밀린다
on('ShowListMenuSetWidth', showMenu((ctx) => { ctx.readVar(); return 1 }))
on('ShowListMenuRememberCursor', showMenu((ctx) => { ctx.readVar(); ctx.readVar(); return 1 }))

// ── 가방과 돈 ────────────────────────────────────────────────────────────────
//
// 넣기·빼기가 **성공했는지를 변수로 돌려준다**. 자리가 없어서 실패하는 일이
// 실제로 있고(볼 주머니는 15칸뿐이다) 스크립트가 그 값으로 갈린다.

/** 가방이 안 붙어 있으면 아무 일도 못 한다. 그때는 실패로 답한다 */
const bagOf = (ctx: ScriptContext) => ctx.host.world.services.bag ?? null

on('AddItem', (ctx) => {
  const item = ctx.readVar()
  const count = ctx.readVar()
  const dest = ctx.readHalfWord()
  ctx.host.world.vars.set(dest, bagOf(ctx)?.add(item, count) === true ? 1 : 0)
  return false
})

on('RemoveItem', (ctx) => {
  const item = ctx.readVar()
  const count = ctx.readVar()
  const dest = ctx.readHalfWord()
  ctx.host.world.vars.set(dest, bagOf(ctx)?.remove(item, count) === true ? 1 : 0)
  return false
})

on('CanFitItem', (ctx) => {
  const item = ctx.readVar()
  const count = ctx.readVar()
  const dest = ctx.readHalfWord()
  ctx.host.world.vars.set(dest, bagOf(ctx)?.canFit(item, count) === true ? 1 : 0)
  return false
})

on('CheckItem', (ctx) => {
  // "뺄 수 있는가"다 — 개수까지 본다 (`Bag_CanRemoveItem`)
  const item = ctx.readVar()
  const count = ctx.readVar()
  const dest = ctx.readHalfWord()
  ctx.host.world.vars.set(dest, (bagOf(ctx)?.quantity(item) ?? 0) >= count ? 1 : 0)
  return false
})

on('GetItemQuantity', (ctx) => {
  const item = ctx.readVar()
  ctx.host.world.vars.set(ctx.readHalfWord(), bagOf(ctx)?.quantity(item) ?? 0)
  return false
})

on('GetItemPocket', (ctx) => {
  const item = ctx.readVar()
  ctx.host.world.vars.set(ctx.readHalfWord(), bagOf(ctx)?.pocketOf(item) ?? 0)
  return false
})

on('CheckPocketHasItems', (ctx) => {
  const pocket = ctx.readVar()
  ctx.host.world.vars.set(ctx.readHalfWord(), bagOf(ctx)?.pocketHasItems(pocket) === true ? 1 : 0)
  return false
})

on('BufferItemName', (ctx) => {
  const slot = ctx.readByte()
  // ⚠️ 인자를 **먼저** 읽는다. `bag?.name(ctx.readVar())`로 쓰면 가방이 안 붙어
  // 있을 때 `?.`가 인자까지 건너뛰어서 2바이트가 안 읽히고, 그 뒤가 전부 밀린다
  const item = ctx.readVar()
  ctx.host.world.slots.set(slot, bagOf(ctx)?.name(item) ?? '')
  return false
})

on('GiveMoney', (ctx) => {
  const amount = ctx.readWord()
  ctx.host.world.services.money?.add(amount)
  return false
})

on('RemoveMoney', (ctx) => {
  const amount = ctx.readWord()
  ctx.host.world.services.money?.spend(amount)
  return false
})

on('CheckMoney', (ctx) => {
  // 원작은 "이만큼 있는가"를 0/1로 돌려준다
  const dest = ctx.readHalfWord()
  const amount = ctx.readWord()
  ctx.host.world.vars.set(dest, (ctx.host.world.services.money?.get() ?? 0) >= amount ? 1 : 0)
  return false
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

// ── 사람 세우기·지우기·묶어 두기 ─────────────────────────────────────────────
//
// 컷신의 절반이 이 넷이다. `AddObject`로 사람이 나타나고 `RemoveObject`로
// 사라지는데, 안 만들면 **그 사람이 아예 없는 것으로** 이야기가 지나간다.

on('LockAll', () => {
  npcActors.paused = true
  // 원작은 말을 건 상대가 있으면 그쪽만 따로 묶는다 (`ScrCmd_LockLastTalked`).
  // 우리는 배회가 없어서 결과가 같다 — 둘 다 걸음을 멈추는 것뿐이다
  return false
})

on('ReleaseAll', () => {
  npcActors.paused = false
  return false
})

on('LockObject', (ctx) => {
  ctx.readHalfWord()
  npcActors.paused = true
  return false
})

on('ReleaseObject', (ctx) => {
  ctx.readHalfWord()
  npcActors.paused = false
  return false
})

on('AddObject', (ctx) => {
  addNpc(ctx.readVar())
  return false
})

on('RemoveObject', (ctx) => {
  // ⚠️ **숨김 플래그를 함께 세운다** (`MapObject_SetFlagAndDeleteObject`).
  // 안 세우면 문을 한 번 여닫는 것으로 사라진 사람이 되살아난다
  const flag = removeNpc(ctx.readVar())
  if (flag !== null) ctx.host.vars.setFlag(flag)
  return false
})

/** 배치표를 고친다. 지금 서 있는 사람이 아니라 **다음에 세울 사람**에게 먹는다 */
on('SetObjectEventPos', (ctx) => {
  const localID = ctx.readVar()
  const x = ctx.readVar()
  const z = ctx.readVar()
  setNpcPlacement(localID, { x, z })
  return false
})

on('SetObjectEventDir', (ctx) => {
  const localID = ctx.readVar()
  setNpcPlacement(localID, { dir: ctx.readVar() })
  return false
})

on('SetObjectEventMovementType', (ctx) => {
  const localID = ctx.readVar()
  setNpcPlacement(localID, { move: ctx.readVar() })
  return false
})

/** 이쪽은 **지금 서 있는 사람**을 옮긴다 (`MapObject_SetPosDirFromCoords`) */
on('SetPosition', (ctx) => {
  const localID = ctx.readVar()
  const x = ctx.readVar()
  ctx.readVar() // y. 높이는 격자가 정한다
  const z = ctx.readVar()
  const dir = ctx.readVar()
  const target = ctx.host.world.objects(localID)
  if (target) { target.x = x; target.z = z; target.dir = dir }
  return false
})

on('SetMovementType', (ctx) => {
  const localID = ctx.readVar()
  setNpcPlacement(localID, { move: ctx.readHalfWord() })
  return false
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

on('BufferPartyMonNickname', (ctx) => {
  const slot = ctx.readByte()
  const at = ctx.readVar()
  ctx.host.world.slots.set(slot, ctx.host.world.services.party?.nickname(at) ?? '')
  return false
})

on('BufferPartyMonSpecies', (ctx) => {
  const slot = ctx.readByte()
  const at = ctx.readVar()
  const species = ctx.host.world.services.party?.species(at) ?? 0
  ctx.host.world.slots.set(slot, ctx.host.world.services.labels?.species(species) ?? '')
  return false
})

// ── 처음 고른 파트너 ─────────────────────────────────────────────────────────
//
// **세이브에 새 칸을 만들 필요가 없었다.** 원작이 이것을 그냥 스크립트 변수
// 하나에 넣어 둔다 (`SystemVars_SetPlayerStarter` → `VAR_PLAYER_STARTER`).
// 우리 `VarStore`는 그 구간을 이미 세이브에 싣고 있으므로 읽고 쓰기만 하면 된다.
//
// 라이벌과 반대 성별 주인공의 파트너는 **저장하지 않는다** — 내 것에서 계산한다.

/** `generated/vars_flags.txt`의 `VAR_PLAYER_STARTER`. 바로 뒤가 `VAR_UNUSED_0x4031`이라 자리가 확정된다 */
export const VAR_PLAYER_STARTER = 0x4030

/** `generated/species.txt` — 신오 스타팅 셋 */
const STARTER = { turtwig: 387, chimchar: 390, piplup: 393 } as const

/** `SystemVars_GetRivalStarter` — 라이벌은 내 것에 **강한** 쪽을 든다 */
function rivalStarter(mine: number): number {
  if (mine === STARTER.turtwig) return STARTER.chimchar
  if (mine === STARTER.chimchar) return STARTER.piplup
  return STARTER.turtwig
}

/** `SystemVars_GetPlayerCounterpartStarter` — 남은 하나다 */
function counterpartStarter(mine: number): number {
  if (mine === STARTER.turtwig) return STARTER.piplup
  if (mine === STARTER.chimchar) return STARTER.turtwig
  return STARTER.chimchar
}

for (const [name, pick] of [
  ['BufferPlayerStarterSpeciesName', (mine: number) => mine],
  ['BufferRivalStarterSpeciesName', rivalStarter],
  ['BufferPlayerCounterpartStarterSpeciesName', counterpartStarter],
] as const) {
  on(name, (ctx) => {
    const slot = ctx.readByte()
    const species = pick(ctx.host.vars.get(VAR_PLAYER_STARTER))
    ctx.host.world.slots.set(slot, ctx.host.world.services.labels?.species(species) ?? '')
    return false
  })
}

on('BufferMoveName', (ctx) => {
  const slot = ctx.readByte()
  const move = ctx.readVar()
  ctx.host.world.slots.set(slot, ctx.host.world.services.labels?.move(move) ?? '')
  return false
})

on('BufferPocketName', (ctx) => {
  const slot = ctx.readByte()
  const pocket = ctx.readVar()
  ctx.host.world.slots.set(slot, ctx.host.world.services.labels?.pocket(pocket) ?? '')
  return false
})

on('BufferValuePaddingDigits', (ctx) => {
  // 인자는 **칸 · 값(4바이트) · 채우기 방식 · 자릿수** 순서다
  // (`.macro BufferValuePaddingDigits templateArg, value, paddingMode, maxDigits`).
  // 0 안 채움 · 1 공백 · 2 영 (`constants/string.h`). 실측으로 필드 스크립트가
  // 쓰는 것은 전부 공백 6자리다 — 지하 상점의 값을 자리 맞춰 적는 자리다
  const slot = ctx.readByte()
  const value = ctx.readWord()
  const mode = ctx.readByte()
  const digits = ctx.readByte()
  const text = String(value)
  ctx.host.world.slots.set(
    slot,
    mode === 0 ? text : text.padStart(digits, mode === 2 ? '0' : ' '),
  )
  return false
})

// ── 값 읽기 ──────────────────────────────────────────────────────────────────
//
// 하는 일이 없어 보이지만 **스크립트가 이 값으로 갈라진다.** 안 만들면 답이
// 늘 앞서 남아 있던 값이라 한쪽 가지만 돌고, 그쪽이 맞는 가지라는 보장이 없다.

on('GetPlayerMapPos', (ctx) => {
  const destX = ctx.readHalfWord()
  const destZ = ctx.readHalfWord()
  const player = ctx.host.world.player
  ctx.host.vars.set(destX, Math.floor(player?.x ?? 0))
  ctx.host.vars.set(destZ, Math.floor(player?.z ?? 0))
  return false
})

on('GetPlayerDir', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.player?.dir ?? DIR.south)
  return false
})

on('GetCurrentMapID', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), Math.max(0, mapWorld.mapId))
  return false
})

on('GetPlayerGender', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.trainerInfo?.gender() ?? 0)
  return false
})

on('GetRandom', (ctx) => {
  const dest = ctx.readHalfWord()
  const bound = ctx.readVar()
  // 원작은 `LCRNG_Next() % upperBound`다. 상한이 0이면 나눗셈이 터지므로 막는다
  ctx.host.vars.set(dest, bound > 0 ? Math.floor(Math.random() * bound) : 0)
  return false
})

on('GetPartyCount', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.party?.count() ?? 0)
  return false
})

on('GetPartyMonSpecies', (ctx) => {
  // ⚠️ **자리 번호도 변수 포인터로 읽는다** — 원작이 `GetVarPointer`를 두 번
  // 부르고 앞의 것을 값으로 쓴다. 폭은 같지만 읽는 뜻이 다르다
  const slotVar = ctx.readHalfWord()
  const dest = ctx.readHalfWord()
  const slot = ctx.host.vars.get(slotVar)
  ctx.host.vars.set(dest, ctx.host.world.services.party?.species(slot) ?? 0)
  return false
})

// ── 파티에 무언가가 들어온다 ─────────────────────────────────────────────────
//
// ⚠️ **여기가 비어 있으면 포켓몬을 한 마리도 못 받는다.** 스크립트가 주는 길이
// `GivePokemon` 하나뿐인데 안 만들어져 있었다 — 처음 파트너도, 도로에서 주는
// 포켓몬도, 화석도 전부 이 명령을 거친다.

on('GivePokemon', (ctx) => {
  const species = ctx.readVar()
  const level = ctx.readVar()
  const heldItem = ctx.readVar()
  const dest = ctx.readHalfWord()
  const given = ctx.host.world.services.party?.give(species, level, heldItem) ?? false
  // ⚠️ **가득 차면 0이고 그것으로 끝난다.** 박스로 안 넘긴다 —
  // `Party_AddPokemon`이 실패를 그대로 돌려주고 스크립트가 그 값으로 갈라진다
  ctx.host.vars.set(dest, given ? 1 : 0)
  return false
})

on('GiveBadge', (ctx) => {
  // ⚠️ **인자를 먼저 읽는다.** `trainerInfo?.giveBadge(ctx.readVar())`로 쓰면
  // 세이브가 안 붙었을 때 `?.`가 오른쪽을 아예 계산하지 않아 읽기 위치가 안 움직인다
  const badge = ctx.readVar()
  ctx.host.world.services.trainerInfo?.giveBadge(badge)
  return false
})

on('GetPartyMonLevel', (ctx) => {
  const dest = ctx.readHalfWord()
  const slot = ctx.readVar()
  ctx.host.vars.set(dest, ctx.host.world.services.party?.level(slot) ?? 0)
  return false
})

on('GetPartyMonNature', (ctx) => {
  const dest = ctx.readHalfWord()
  const slot = ctx.readVar()
  // 자리가 비었으면 원작이 `NATURE_HARDY`(0)를 준다 — 서비스가 그 자리를 맡는다
  ctx.host.vars.set(dest, ctx.host.world.services.party?.nature(slot) ?? 0)
  return false
})

on('GetPartyMonFriendship', (ctx) => {
  const dest = ctx.readHalfWord()
  const slot = ctx.readVar()
  ctx.host.vars.set(dest, ctx.host.world.services.party?.friendship(slot) ?? 0)
  return false
})

on('IncreasePartyMonFriendship', (ctx) => {
  // ⚠️ 인자가 **값 먼저, 자리 나중**이다 (`ScrCmd_IncreasePartyMonFriendship`)
  const amount = ctx.readVar()
  const slot = ctx.readVar()
  ctx.host.world.services.party?.addFriendship(slot, amount)
  return false
})

on('CheckPartyMonHasMove', (ctx) => {
  // 인자 차례가 **답 · 기술 · 자리**다. 기술과 자리를 바꿔 읽으면 조용히 늘 거짓이 된다
  const dest = ctx.readHalfWord()
  const move = ctx.readVar()
  const slot = ctx.readVar()
  ctx.host.vars.set(dest, ctx.host.world.services.party?.hasMove(slot, move) === true ? 1 : 0)
  return false
})

on('GetPartyMonMove', (ctx) => {
  const dest = ctx.readHalfWord()
  const slot = ctx.readVar()
  const moveSlot = ctx.readVar()
  ctx.host.vars.set(dest, ctx.host.world.services.party?.move(slot, moveSlot) ?? 0)
  return false
})

on('CheckPartyHasSpecies', (ctx) => {
  const dest = ctx.readHalfWord()
  const species = ctx.readVar()
  ctx.host.vars.set(dest, ctx.host.world.services.party?.hasSpecies(species) === true ? 1 : 0)
  return false
})

on('CountAliveMonsExcept', (ctx) => {
  const dest = ctx.readHalfWord()
  const except = ctx.readVar()
  ctx.host.vars.set(dest, ctx.host.world.services.party?.aliveExcept(except) ?? 0)
  return false
})

on('CheckBadgeAcquired', (ctx) => {
  const badge = ctx.readVar()
  ctx.host.vars.set(
    ctx.readHalfWord(),
    ctx.host.world.services.trainerInfo?.hasBadge(badge) === true ? 1 : 0,
  )
  return false
})

on('GetPlayerStarterSpecies', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.vars.get(VAR_PLAYER_STARTER))
  return false
})

on('GetSetNationalDexEnabled', (ctx) => {
  // 1이면 켜고(답은 0), 2면 묻는다
  const which = ctx.readByte()
  const dest = ctx.readHalfWord()
  const on = ctx.host.world.services.trainerInfo?.nationalDex(which === 1) === true
  ctx.host.vars.set(dest, which === 2 && on ? 1 : 0)
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
export const SCRIPT_ID_OFFSET_SINGLE_BATTLES = 3000
const SCRIPT_ID_OFFSET_DOUBLE_BATTLES = 5000
/** `generated/vars_flags.txt` — 이 뒤로 트레이너 번호만큼 떨어진 자리가 그 사람 플래그다 */
export const TRAINER_DEFEATED_FLAGS_START = 1360

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

// ── 간판 판 ──────────────────────────────────────────────────────────────────
//
// ⚠️ **간판 절반이 여기로 뜬다.** 책장·쓰레기통 같은 공용 간판은 `Message`로
// 뜨지만, 마을 이름표·우편함·도로 표지판은 `Signpost`라는 **다른 창**을 쓴다.
// 그 다섯 명령을 안 만들고 있어서, 떡잎마을 표지판을 읽으면 아무 일도 안 났다.
//
// 매크로 하나가 다섯 명령으로 펴진다 (`ShowMapSign` 등):
//
//   DrawSignpostInstantMessage 글, 종류   판을 만들고 글을 찍는다
//   SetSignpostCommand SCROLL_IN         밀어 넣는다
//   WaitForSignpostDone                  다 밀릴 때까지
//   GetSignpostInput VAR_RESULT          버튼을 기다린다
//   Common_HandleSignpostInput           답에 따라 닫는다
//
// 우리 판은 미끄러져 들어오지 않고 바로 뜬다. 그래서 `WaitForSignpostDone`은
// 늘 끝나 있다 — 원작도 다 됐으면 안 서고 지나간다

/** `generated/signpost_commands.txt` — 0 아무것도 · 1 그린다 · 2 나간다 · 3 든다 · 4 지운다 */
const SIGNPOST_SCROLL_IN = 3

/**
 * 판에 붙는 그림 번호.
 *
 * ⚠️ **스크립트가 거의 안 준다.** 매크로(`ShowMapSign` 등)가 인자를 0으로 두고
 * 넘기며, 원작은 그때 **말을 건 객체의 `data[0]`**을 대신 쓴다
 * (`ScrCmd_DrawSignpostInstantMessage`). 그래서 그림 번호는 스크립트가 아니라
 * 배치표에서 온다 — `raw[7]`이 `ObjectEvent.data[0]` 자리다
 */
function signPicture(ctx: ScriptContext, given: number): number {
  if (given !== 0) return given
  return ctx.host.world.target?.params?.[0] ?? 0
}

on('DrawSignpostInstantMessage', (ctx) => {
  const messageID = ctx.readByte()
  const type = ctx.readByte()
  const picture = ctx.readHalfWord()
  ctx.readHalfWord() // 원작도 안 쓴다
  ctx.host.world.signpost = { type, picture: signPicture(ctx, picture) }
  // 원작도 `TEXT_SPEED_INSTANT`로 찍는다 — 간판은 한 자씩 나오지 않는다
  ctx.host.world.showInstant(messageID)
  return false
})

on('DrawSignpostTextBox', (ctx) => {
  const type = ctx.readByte()
  const picture = ctx.readHalfWord()
  ctx.host.world.signpost = { type, picture: signPicture(ctx, picture) }
  ctx.host.world.openBox()
  return false
})

on('DrawSignpostScrollingMessage', (ctx) => {
  const messageID = ctx.readByte()
  const dest = ctx.readHalfWord()
  ctx.host.world.showMessage(messageID)
  ctx.scratch[0] = dest
  // 다 찍고 버튼을 받을 때까지 선다. 답은 늘 0이다(A·B·방향키가 다 0을 넣는다)
  ctx.pause((c) => {
    if (!c.host.world.printed || !c.host.world.pressed) return false
    c.host.vars.set(c.scratch[0]!, 0)
    return true
  })
  return true
})

on('SetSignpostCommand', (ctx) => {
  const cmd = ctx.readByte()
  if (cmd === SIGNPOST_SCROLL_IN) { ctx.host.world.openBox(); return false }
  // 나가기(2)·지우기(4)는 둘 다 판을 걷는 것이다
  ctx.host.world.closeBox(true)
  ctx.host.world.signpost = null
  return false
})

on('WaitForSignpostDone', () => false)

on('GetSignpostInput', (ctx) => {
  ctx.scratch[0] = ctx.readHalfWord()
  // 원작은 A·B·방향키에 0, X에 1을 넣는다 (`HandleSignpostInput`). X는 시작
  // 메뉴를 여는 자리인데 스크립트가 도는 동안 우리 X는 메뉴를 안 여므로 0뿐이다
  ctx.pause((c) => {
    if (!c.host.world.pressed) return false
    c.host.vars.set(c.scratch[0]!, 0)
    return true
  })
  return true
})

/** 메뉴가 화면 어느 쪽에 붙는가. 우리 메뉴는 자리를 스스로 잡는다 */
on('SetMenuXOriginSide', (ctx) => {
  ctx.readByte()
  return false
})

// ── 스크립트가 옮기는 이동 ───────────────────────────────────────────────────
//
// 문으로 걸어 들어가는 것 말고, **이야기가 데려가는** 이동이다. 없으면 68곳에서
// 화면이 그대로 멈춘 채 이야기만 흘러간다 — 거기서 판이 어긋난다.

on('Warp', (ctx) => {
  const to = ctx.readVar()
  ctx.readHalfWord() // 원작도 안 쓴다 (`s16 unused`)
  const x = ctx.readVar()
  const z = ctx.readVar()
  const facing = ctx.readVar()
  const dest = mapById(to)
  if (!dest) return false
  // 워프 타일과 같은 길로 보낸다 — 씬이 `pending`을 보고 격자를 갈아 끼운다.
  // 칸 가운데에 세운다(격자 좌표는 칸의 왼쪽 위 모서리다)
  mapWorld.pending = { to, matrix: dest.matrix, x: x + 0.5, z: z + 0.5, viaDoor: false, facing }
  return false
})

/**
 * 따로 도는 화면에서 필드로 돌아온다 (`FieldTransition_StartMap`).
 *
 * 원작은 박스·상점 같은 응용 프로그램이 화면을 통째로 가져간 뒤 이 명령으로
 * 필드를 다시 세운다. 우리 화면은 필드 위에 겹쳐 뜨고 자기가 닫으므로 되세울
 * 것이 없다 — 다만 **자리는 지나가야 한다**
 */
on('ReturnToField', () => false)

// ── 화면 페이드 ──────────────────────────────────────────────────────────────
//
// 장면을 끊는 자리다. 안 만들면 "어두워졌다 밝아지면 사람이 사라져 있다"는
// 연출이 통째로 안 보인다 — 실제로 사람이 그 자리에서 툭 사라진다.

on('FadeScreen', (ctx) => {
  const steps = ctx.readHalfWord()
  const frames = ctx.readHalfWord()
  const type = ctx.readHalfWord()
  const color = ctx.readHalfWord()
  startFade(steps, frames, type, color)
  return false
})

on('WaitFadeScreen', (ctx) => {
  ctx.pause(() => fadeDone())
  return true
})

// ── 소리 ─────────────────────────────────────────────────────────────────────
//
// 필드 스크립트에서 제일 많이 쓰이는 것이 소리다. 안 붙이고 건너뛰면 문과 계단
// 말고는 아무 소리가 안 난다 — 물건을 주울 때도, 배지를 받을 때도 조용하다.
//
// ⚠️ **기다리는 명령이 셋 다 다른 것을 본다** (`scrcmd_sound.c`):
// `WaitSE`는 인자로 받은 그 소리를, `WaitCry`는 울음소리를, `WaitFanfare`는
// 팡파르를 본다. 하나로 묶으면 곡이 도는 내내 스크립트가 멎는다.

const soundOf = (ctx: ScriptContext) => ctx.host.world.services.sound

on('PlaySE', (ctx) => {
  // ⚠️ **인자를 먼저 읽는다.** `sound?.playEffect(ctx.readVar())`로 쓰면 소리가
  // 안 붙어 있을 때 `?.`가 통째로 건너뛰어 **읽기 위치가 안 움직인다** —
  // 그다음 옵코드 자리에 인자(1500)가 와서 스크립트가 거기서 터진다
  const seq = ctx.readVar()
  soundOf(ctx)?.playEffect(seq)
  return false
})

on('StopSE', (ctx) => {
  const seq = ctx.readVar()
  soundOf(ctx)?.stopEffect(seq)
  return false
})

on('WaitSE', (ctx) => {
  const seq = ctx.readVar()
  ctx.scratch[0] = seq
  // 소리가 안 붙어 있으면 기다릴 것도 없다 — 여기서 서면 영영 안 깬다
  if (soundOf(ctx) === undefined) return false
  ctx.pause((c) => soundOf(c)?.effectPlaying(c.scratch[0]!) !== true)
  return true
})

on('PlayCry', (ctx) => {
  const species = ctx.readVar()
  ctx.readVar() // 원작도 안 쓴다 (`u16 unused`)
  soundOf(ctx)?.playCry(species)
  return false
})

on('WaitCry', (ctx) => {
  if (soundOf(ctx) === undefined) return false
  ctx.pause((c) => soundOf(c)?.cryPlaying() !== true)
  return true
})

on('PlayFanfare', (ctx) => {
  const seq = ctx.readHalfWord()
  soundOf(ctx)?.playFanfare(seq)
  return false
})

on('WaitFanfare', (ctx) => {
  if (soundOf(ctx) === undefined) return false
  ctx.pause((c) => soundOf(c)?.fanfarePlaying() !== true)
  return true
})

const setMusic: CommandFn = (ctx) => {
  const seq = ctx.readHalfWord()
  soundOf(ctx)?.setMusic(seq)
  return false
}
on('PlayMusic', setMusic)
on('SetBGM', setMusic)
on('SetSpecialBGM', setMusic)

on('StopMusic', (ctx) => {
  ctx.readHalfWord() // 원작도 안 쓴다 — 지금 곡을 끈다
  soundOf(ctx)?.setMusic('stop')
  return false
})

on('PlayDefaultMusic', (ctx) => {
  // 가로챈 것을 놓는다. 그러면 맵 헤더의 곡으로 되돌아간다
  soundOf(ctx)?.setMusic(null)
  return false
})

on('IsSequencePlaying', (ctx) => {
  const seq = ctx.readHalfWord()
  ctx.host.vars.set(ctx.readHalfWord(), soundOf(ctx)?.sequencePlaying(seq) === true ? 1 : 0)
  return false
})

// 곡을 갈지 않고 **소리만** 줄였다 키운다. 컷신이 "곡이 잦아들었다가
// 되살아난다"를 만드는 자리라, 도중에 곡을 다시 시작하면 안 된다.
//
// 원작은 페이드가 끝날 때까지 선다(`ScriptContext_IsSoundFadeFinished`). 우리
// 페이드는 오디오 그래프가 알아서 하는 것이라 물어볼 자리가 없어서 안 선다 —
// 프레임 몇 개 일찍 다음 명령이 도는 것이지 소리는 그대로 잦아든다
on('FadeOutBGM', (ctx) => {
  const volume = ctx.readHalfWord()
  const frames = ctx.readHalfWord()
  soundOf(ctx)?.fadeVolume(volume, frames)
  return false
})

on('FadeInBGM', (ctx) => {
  const frames = ctx.readHalfWord()
  soundOf(ctx)?.fadeVolume(127, frames)
  return false
})

// ── 포켓몬센터 · 전멸 ────────────────────────────────────────────────────────
//
// 원작은 부활 지점을 **맵을 갈아 끼울 때** 정한다(`FieldMapChange_UpdateGameData`가
// `GetMapBlackOutWarpId`를 돌린다). 그래서 간호사 스크립트에는 회복만 있고
// `SetBlackOutWarpId`는 자전거 가게 한 곳에서만 쓰인다 — 그 한 곳을 위해 남긴다.

on('HealParty', (ctx) => {
  ctx.host.world.services.healParty?.()
  return false
})

on('SetBlackOutWarpId', (ctx) => {
  // 인자는 **1부터 센 번호**다 (`MapSpawnIdToIndex`가 하나를 뺀다).
  // ⚠️ 여기도 **먼저 읽는다** — `?.`는 왼쪽이 없으면 오른쪽을 아예 안 계산한다
  const spawn = ctx.readHalfWord()
  ctx.host.world.services.setHealSpot?.(spawn - 1)
  return false
})

const blackOut: CommandFn = (ctx) => {
  ctx.host.world.services.blackOut?.()
  return true
}
on('BlackOutFromBattle', blackOut)
on('BlackOutFromBattle2', blackOut)

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

// ── 세이브에 켜지는 스위치 ───────────────────────────────────────────────────
//
// 원작이 `SystemFlag_*`로 감싸 두었지만 **속은 보통 플래그다**
// (`src/system_flags.c` — 전부 `VarsFlags_SetFlag` 한 줄이다). 그래서 여기서도
// 새 세이브 칸을 안 만들고 우리 `VarStore`의 같은 비트를 쓴다.
//
// 번호는 `generated/vars_flags.txt`를 C enum처럼 세어 나온다. 그 셈이 맞다는
// 것은 이미 확정된 값 넷이 동시에 떨어지는 것으로 확인한다 —
// `FLAG_HAS_POKEDEX`가 144, `FLAG_UNUSED_0x054E`가 0x54E,
// `TRAINER_DEFEATED_FLAGS_START`가 1360, `VARS_START`가 0x4000이다.

/** `generated/vars_flags.txt` */
export const SYSTEM_FLAG = {
  /** 가방을 받았는가. 시작 메뉴의 "가방" 줄이 이 비트로 있고 없다 */
  bagAcquired: 2400,
  /** 누가 따라다니는가 (`FLAG_HAS_PARTNER`) */
  hasPartner: 2401,
  /** 모험노트를 받았는가 */
  journalAcquired: 2403,
  /**
   * 마지막으로 세운 뒤 **한 칸도 안 움직였는가** (`FLAG_STEP`).
   *
   * 세우는 것은 스크립트뿐이고 지우는 것은 필드다 (`FieldInput_Process`가
   * 걸음마다 `SystemFlag_ClearStep`을 부른다)
   */
  step: 2405,
} as const

/** 플래그 하나를 세우고/지우고/묻는 명령 셋을 한 번에 등록한다 */
function systemFlag(flag: number, names: { set?: string, clear?: string, check?: string }): void {
  if (names.set !== undefined) on(names.set, (ctx) => { ctx.host.vars.setFlag(flag); return false })
  if (names.clear !== undefined) on(names.clear, (ctx) => { ctx.host.vars.clearFlag(flag); return false })
  if (names.check !== undefined) {
    on(names.check, (ctx) => {
      ctx.host.vars.set(ctx.readHalfWord(), ctx.host.vars.checkFlag(flag) ? 1 : 0)
      return false
    })
  }
}

systemFlag(SYSTEM_FLAG.bagAcquired, { set: 'GiveBag', check: 'CheckBagAcquired' })
systemFlag(SYSTEM_FLAG.hasPartner, {
  set: 'SetHasPartner', clear: 'ClearHasPartner', check: 'CheckHasPartner',
})
systemFlag(SYSTEM_FLAG.step, {
  set: 'SetStepFlag', clear: 'ClearStepFlag', check: 'CheckStepFlag',
})

/**
 * 모험노트를 받았다 (`ScrCmd_GiveJournal`).
 *
 * ⚠️ 원작은 플래그를 세우고 **첫 쪽도 펼친다**(`Journal_GetSavedPage`). 우리는
 * 노트 화면이 아직 없어서 플래그만 세운다 — 스크립트의 갈래는 이 비트로만
 * 갈리므로 이야기는 그대로 흐른다
 */
systemFlag(SYSTEM_FLAG.journalAcquired, { set: 'GiveJournal' })

on('GiveRunningShoes', (ctx) => {
  ctx.host.world.services.gear?.giveRunningShoes()
  return false
})

on('CheckRunningShoesAcquired', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.gear?.hasRunningShoes() === true ? 1 : 0)
  return false
})

on('GetTimeOfDay', (ctx) => {
  const dest = ctx.readHalfWord()
  // 시계가 없으면 낮이다. 시간대로 갈리는 대사가 한쪽으로 쏠릴 뿐이라 안전하다
  ctx.host.vars.set(dest, ctx.host.world.services.timeOfDay?.() ?? TIMEOFDAY_DAY)
  return false
})

/** `generated/time_of_day.txt` */
const TIMEOFDAY_DAY = 1

/**
 * 그 곡을 이 음량으로 시작한다 (`ScrCmd_SetInitialVolumeForSequence`).
 *
 * TV가 켜져 있는 방이 이걸 쓴다 — 방송 곡을 절반 음량으로 깔아 둔다
 */
on('SetInitialVolumeForSequence', (ctx) => {
  ctx.readVar() // 곡 번호
  ctx.readVar() // 음량 (0~127)
  // ⚠️ 아직 못 한다. 우리 소리 계층은 곡마다 초기 음량을 못 정한다 —
  // 곡이 **제 음량으로** 흐르는 것이 다르고, 곡 자체는 맞다
  return false
})

/**
 * 그 사람이 사라져도 플래그가 남는가 (`MapObject_SetFlagIsPersistent`).
 *
 * ⚠️ **우리에게는 걸 자리가 없다.** 원작의 객체는 맵을 옮길 때 지워지는데,
 * 이 비트가 서 있으면 따라다니는 사람처럼 **맵을 건너 살아남는다**. 우리
 * `npcActors`는 맵마다 통째로 다시 세우므로 옮길 대상이 아직 없다 — 이 비트가
 * 실제로 쓰이는 자리는 라이벌이 따라다니는 구간 하나뿐이고, 그건 도감을 받은
 * 뒤의 이야기다
 */
on('SetObjectFlagIsPersistent', (ctx) => {
  ctx.readVar() // 맵 안 번호
  ctx.readByte() // 켜는가 끄는가
  return false
})

on('SetWarpEventPos', (ctx) => {
  const index = ctx.readVar()
  const x = ctx.readVar()
  const z = ctx.readVar()
  ctx.host.world.services.warpEvents?.setPos(index, x, z)
  return false
})

// ── 문 여닫는 그림 ───────────────────────────────────────────────────────────
//
// 문은 새 계통이 아니라 **맵 소품**이다. 좌표로 그 소품을 찾아 한 번짜리
// 애니메이션을 걸고, 문 종류마다 다른 소리를 낸다 (`DoorAnimation_*`).
//
// ⚠️ **그림은 아직 안 움직인다.** 소품 590종을 기하와 텍스처로 뽑아 두었지만
// 애니메이션(NSBCA)은 아직 안 뽑았다. 그래서 붙이는 쪽이 소리와 시간만 낸다 —
// 문이 안 열리는 것이 아니라 열리는 **모습**이 없는 것이다.

on('LoadDoorAnimation', (ctx) => {
  // ⚠️ 앞 둘은 **변수가 아니라 생값**이다 (`ScriptContext_ReadHalfWord`).
  // 매트릭스 칸 번호라 값이 작아서, 변수로 읽으면 그 수가 그대로 나와
  // 눈에 안 띈 채 좌표가 어긋난다
  const mapX = ctx.readHalfWord()
  const mapZ = ctx.readHalfWord()
  const tileX = ctx.readVar()
  const tileZ = ctx.readVar()
  const tag = ctx.readByte()
  // `MAP_TILES_COUNT_X`·`_Z` — 매트릭스 한 칸이 32×32 타일이다
  ctx.host.world.services.door?.load(mapX * 32 + tileX, mapZ * 32 + tileZ, tag)
  return false
})

// ⚠️ 셋 다 **먼저 읽고** 넘긴다. `?.`가 짧게 끊기면 인자를 안 읽은 채 지나가고,
// 그러면 그 뒤 바이트가 통째로 밀린다 (`argWidth.test.ts`가 이 종류를 잡는다)
on('PlayDoorOpenAnimation', (ctx) => {
  const tag = ctx.readByte()
  ctx.host.world.services.door?.open(tag)
  return false
})

on('PlayDoorCloseAnimation', (ctx) => {
  const tag = ctx.readByte()
  ctx.host.world.services.door?.close(tag)
  return false
})

on('WaitForAnimation', (ctx) => {
  const tag = ctx.readByte()
  ctx.pause((c) => c.host.world.services.door?.busy(tag) !== true)
  return true
})

on('UnloadAnimation', (ctx) => {
  const tag = ctx.readByte()
  ctx.host.world.services.door?.unload(tag)
  return false
})

// ── 처음 만나는 파트너 ───────────────────────────────────────────────────────

/**
 * 가방이 열리고 몬스터볼 셋이 뜬다 (`ScrCmd_StartChooseStarterScene`).
 *
 * 스크립트가 아니라 **따로 도는 화면**이라 바이트코드가 없다
 * (`choose_starter/choose_starter_app.c`). 여기서는 화면을 열고 그것이 끝날
 * 때까지 선다 — 원작도 `ScriptContext_WaitForApplicationExit`로 선다
 */
on('StartChooseStarterScene', (ctx) => {
  ctx.host.world.services.chooseStarter?.open()
  ctx.pause((c) => c.host.world.services.chooseStarter?.chosen() != null)
  return true
})

/**
 * 고른 것을 적어 둔다 (`SystemVars_SetPlayerStarter`).
 *
 * 세이브에 새 칸이 없다 — 스크립트 변수 하나다. 라이벌과 반대 성별 주인공의
 * 파트너는 여기서 **계산**된다 (`rivalStarter`·`counterpartStarter`)
 */
on('SaveChosenStarter', (ctx) => {
  const species = ctx.host.world.services.chooseStarter?.chosen()
  if (species != null) ctx.host.vars.set(VAR_PLAYER_STARTER, species)
  return false
})

on('StartFirstBattle', (ctx) => {
  const trainerID = ctx.readVar()
  ctx.host.world.services.startFirstBattle?.(trainerID)
  ctx.pause((c) => c.host.world.services.battleResult?.() !== null)
  return true
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
