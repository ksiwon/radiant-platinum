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
  argWidths, compare, conditionHolds, extraArgs,
  type CommandFn, type ResumeFn, type ScriptContext,
} from './context'
import {
  addNpc, npcActors, removeNpc, setNpcPlacement, switchMovementType,
} from '../actor/npcs'
import { mapById, world as mapWorld } from '../map/world'
import { fadeDone, startFade } from './fade'
import { DIR, parseMovements } from './movement'
import { APPROACH_TYPE, approachMovements, dirBetween } from '../actor/approach'
import { FLAG_HAS_POKEDEX, SCRIPT_LOCAL_VARS_START, VAR_LAST_TALKED } from './vars'
import { VAR_ETERNA_GYM_FLOWER_CLOCK_STATE } from '../world/eternaGym'
import { floorsAbove, floorTextIndex } from '../world/elevators'
import { TREE_STATUS } from '../world/honeyTree'
import { clearOverworldWeather, overworldWeather } from '../world/overworldWeather'
import {
  gameCornerPrize, lotteryWinner, VAR_LOTTERY_ID_HIGH, VAR_LOTTERY_ID_LOW,
} from '../world/gameCorner'
import { SCORE_BADGE_EARNED, SCORE_HALL_OF_FAME_ENTRY } from '../world/gameRecords'
import { fossilAtThreshold, fossilCount, speciesFromFossil } from '../world/fossil'
import {
  AMITY_GIFT_COUNT, amityFound, amityGiftId, amityGiftIsAccessory, VAR_AMITY_STEPS,
} from '../world/amity'
import { FLAG_FREED_GALACTIC_HQ } from '../world/lakeGuardianUnits'
import { trainerEncounterBgm } from '../world/trainerEncounterBgm'
import { rematchTrainerID, VsSeekerResult } from '../world/vsSeeker'
import {
  FLAG_UNLOCKED_VS_SEEKER_LVL_1, MOVEMENT_TYPE_LOOK, MOVEMENT_TYPE_VS_SEEKER_SPIN,
} from '../world/vsSeekerTable'
import { LIST_MENU_NO_SELECTION_YET, MENU_CANCEL, type ShopCurrency } from './world'
import { SPECIES_DEOXYS } from '../pokemon/form'
import { appearanceClass, appearanceOf, appearanceVariants } from '../world/appearance'
import { compareSize, SIZE_RECORD_INITIAL, SIZE_RESULT, sizeParts } from '../world/sizeContest'
import { SCRIPT_EVENT_TYPES } from '../world/journal'
import {
  HIDDEN_LOCATION_COUNT, HIDDEN_LOCATION_MAGIC, VAR_HIDDEN_LOCATION_FIRST,
} from '../map/townMap'
import { EVOLUTION_COUNTER_STOCK, isDecorMart } from '../bag/evolutionCounter'
import { frontierStock } from '../bag/frontierMart'
import { badgeCount } from '../bag/mart'
import { SHARDS } from '../bag/shards'
import { learnableTutorMoves, shardCostOf, tutorMovesAt } from '../world/tutorMoves'
import {
  COMM_CLUB_RET, GBA_CARTRIDGE_NONE, SCRIPT_UNION_ROOM_ATTENDANT,
} from '../world/comm'
// ⚠️ **두 벌로 두지 않는다.** 여기가 읽고 시원이 쓰는 같은 칸이라, 한쪽만
// 고치면 「배포를 받았는데 안 열린다」가 된다 (`world/siwon.ts`가 정본)
import { DISTRIBUTION_MAGIC, VAR_DISTRIBUTION_EVENT_FIRST } from '../world/siwon'

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
const openShop = (
  stock: (ctx: ScriptContext) => readonly number[], currency: ShopCurrency = 'money',
): CommandFn => (ctx) => {
  // ⚠️ 인자를 **먼저** 읽는다. 서비스가 안 붙어 있어도 바이트는 지나가야 한다
  const items = stock(ctx)
  ctx.host.world.services.openShop?.(items, currency)
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

/**
 * 장막백화점 4층의 계산대 (`ScrCmd_PokeMartDecor`, PARITY §12.1).
 *
 * ⚠️ **원작 재고는 별장 가구고 그 별장이 §9다.** 창구가 비었으므로 지하통로가
 * 캐던 것들을 여기 얹는다 — 화석 일곱·진화의돌 아홉·롬 밖의 도구 둘.
 * **대사는 한 줄도 안 지어낸다** — 상점 글이 전부 롬 것이다
 */
on('PokeMartDecor', openShop((ctx) => {
  const martID = ctx.readVar()
  return isDecorMart(martID) ? EVOLUTION_COUNTER_STOCK : []
}))

/**
 * 경품 하나의 물건과 값 (`ScrCmd_GetGameCornerPrizeData` · PARITY §4.10).
 *
 * ⚠️ **목록 차례가 곧 번호다.** 스크립트가 줄 번호를 그대로 넘기므로
 * 값싼 순으로 정렬하면 엉뚱한 물건이 나간다
 */
on('GetGameCornerPrizeData', (ctx) => {
  const index = ctx.readVar()
  const itemVar = ctx.readHalfWord()
  const priceVar = ctx.readHalfWord()
  const prize = gameCornerPrize(index)
  ctx.host.vars.set(itemVar, prize?.item ?? 0)
  ctx.host.vars.set(priceVar, prize?.coins ?? 0)
  return false
})

/**
 * 축복시티 복권 (PARITY §7.6).
 *
 * 날마다 뽑는 다섯 자리 번호를 파티와 박스의 **원트레이너 번호**와 맞춘다 —
 * 끝자리부터 세고 한 자리라도 틀리면 그 자리에서 멈춘다.
 *
 * ⚠️ **당첨 번호가 시스템 변수 둘에 나뉘어 있다** (아래·위 16비트). 스크립트가
 * 읽는 것은 아래 절반뿐이다 (`LO_HALF`)
 */
on('GetJubilifeLotteryTrainerID', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.vars.get(VAR_LOTTERY_ID_LOW))
  return false
})

/** 당첨 번호를 새로 뽑는다 (`ScrCmd_RandomizeJubilifeLottery`) */
on('RandomizeJubilifeLottery', (ctx) => {
  ctx.host.vars.set(VAR_LOTTERY_ID_LOW, Math.floor(Math.random() * 0x10000))
  ctx.host.vars.set(VAR_LOTTERY_ID_HIGH, Math.floor(Math.random() * 0x10000))
  return false
})

on('CheckForJubilifeLotteryWinner', (ctx) => {
  const indexVar = ctx.readHalfWord()
  const digitsVar = ctx.readHalfWord()
  const inBoxVar = ctx.readHalfWord()
  const winning = ctx.readVar()
  const all = ctx.host.world.services.boxes?.lotteryEntries()
  const got = lotteryWinner(winning, all?.party ?? [], all?.boxes ?? [])
  ctx.host.vars.set(indexVar, got.index)
  ctx.host.vars.set(digitsVar, got.digits)
  ctx.host.vars.set(inBoxVar, got.inBox ? 1 : 0)
  return false
})

/**
 * 배틀프런티어 교환 코너 (`ScrCmd_PokeMartFrontier`, PARITY §12.3).
 *
 * ⚠️ **인자가 바이트 하나다** — 다른 상점 명령이 변수를 읽는 것과 다르다
 * (`ScriptContext_ReadByte`). 변수로 읽으면 두 바이트를 먹고 그 뒤가 다 밀린다.
 *
 * ⚠️ **BP로 값을 받는다.** 재고와 값은 롬 코드에 박힌 표고, 조각 넷만 우리가
 * 얹었다 (`bag/frontierMart`)
 */
on('PokeMartFrontier', openShop((ctx) => {
  const martID = ctx.readByte()
  return frontierStock(martID)
}, 'bp'))


// ── 배틀포인트 (PARITY §12.3) ────────────────────────────────────────────────
//
// ⚠️ **버는 곳은 배틀팩토리 하나뿐이다** (§9.3). 나머지 넷이 §9라 `GiveBattlePoints`가 필드
// 스크립트에 0회다 — 원작도 시설 코드가 직접 준다. 그래도 만드는 이유는 안
// 만들면 교환 코너가 **묵은 변수 값**으로 갈라지기 때문이다 (리본과 같은 함정).

/** 지금 가진 BP (`ScrCmd_GetBattlePoints`) */
on('GetBattlePoints', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.battlePoints?.get() ?? 0)
  return false
})

/** 준다 (`ScrCmd_GiveBattlePoints`). 상한 9,999에서 멈춘다 */
on('GiveBattlePoints', (ctx) => {
  const amount = ctx.readVar()
  ctx.host.world.services.battlePoints?.add(amount)
  return false
})

/** 깎는다 (`ScrCmd_RemoveBattlePoints`). 모자라면 0이 된다 */
on('RemoveBattlePoints', (ctx) => {
  const amount = ctx.readVar()
  ctx.host.world.services.battlePoints?.subtract(amount)
  return false
})

/**
 * 그만큼 있는가 (`ScrCmd_CheckBattlePoints`).
 *
 * ⚠️ **서비스가 없을 때도 답을 적는다.** 안 적으면 앞 갈래가 쓴 값으로 갈려서
 * 못 사는 물건을 산 것으로 지나간다
 */
on('CheckBattlePoints', (ctx) => {
  const need = ctx.readVar()
  const dest = ctx.readHalfWord()
  const have = ctx.host.world.services.battlePoints?.get() ?? 0
  ctx.host.vars.set(dest, have >= need ? 1 : 0)
  return false
})

/** BP 창을 띄운다 (`ScrCmd_ShowBattlePoints`). 자리는 타일 좌표다 */
on('ShowBattlePoints', (ctx) => {
  const left = ctx.readByte()
  const top = ctx.readByte()
  ctx.host.world.services.currency?.showBP(left, top)
  return false
})

on('HideBattlePoints', (ctx) => {
  ctx.host.world.services.currency?.hideBP()
  return false
})

/** ⚠️ 값은 이걸 부를 때만 다시 찍는다 — 소지금 창과 같다 */
on('UpdateBPDisplay', (ctx) => {
  ctx.host.world.services.currency?.updateBP()
  return false
})


// ── 전망대 둘 — 안 만든다 (PARITY §7.7 · §1.23) ───────────────────────────────
//
// **경치를 보여 주는 것이 전부인 자리다.** 카메라를 옮기고 주인공을 숨겼다가
// 되돌려 놓는다 (`binoculars_vista_lighthouse.c`) — 규칙도 진행도 안 건드린다.
//
// ⚠️ **그래도 명령은 만든다.** 안 만들면 「아직 못 만든 것」과 「안 만들기로 한
// 것」이 계통표에서 같은 줄로 보인다. 둘 다 결과 변수가 없어서 아무 일도 안
// 하는 것이 곧 원작의 흐름이다 — 말을 걸면 대사가 나오고 그대로 끝난다.

/** 길잡이등대 쌍안경 (`ScrCmd_UseVistaLighthouseBinoculars`). 안 만든다 */
on('UseVistaLighthouseBinoculars', () => false)

/** 들판시티 대습초원 전망대 (`ScrCmd_StartGreatMarshLookout`). 안 만든다 */
on('StartGreatMarshLookout', () => false)


// ── 게임 기록·트레이너 스코어·TV (PARITY §7.5) ───────────────────────────────

/**
 * 기록을 하나 올린다 (`ScrCmd_IncrementGameRecord`).
 *
 * ⚠️ **인자가 기록 번호다.** 값이 아니다 — 상한과 폭은 기록마다 다르고
 * `engine/world/gameRecords`가 안다
 */
on('IncrementGameRecord', (ctx) => {
  // ⚠️ **인자를 먼저 읽는다.** `services.records?.add(ctx.readVar(), 1)`로 쓰면
  // 서비스가 없을 때 `?.`가 오른쪽을 아예 계산하지 않아 읽기 위치가 안 움직인다
  const id = ctx.readVar()
  ctx.host.world.services.records?.add(id, 1)
  return false
})

/** 기록에 얼마를 더한다 (`ScrCmd_AddToGameRecord`) */
on('AddToGameRecord', (ctx) => {
  const id = ctx.readVar()
  const amount = ctx.readVar()
  ctx.host.world.services.records?.add(id, amount)
  return false
})

/**
 * 큰 값을 더한다 (`ScrCmd_AddToGameRecordBigValue`).
 *
 * ⚠️ **두 번째 인자가 4바이트다.** 변수로 못 담는 값(상금·걸음)이라 상수로 온다 —
 * 2바이트로 읽으면 다음 명령이 남은 두 바이트를 명령으로 읽는다
 */
on('AddToGameRecordBigValue', (ctx) => {
  const id = ctx.readVar()
  const amount = ctx.readWord()
  ctx.host.world.services.records?.add(id, amount)
  return false
})

/**
 * 트레이너 스코어를 올린다 (`ScrCmd_IncrementTrainerScore`).
 *
 * ⚠️ **인자는 「사건」 번호고 오르는 폭은 표가 정한다** — 나무열매 수확 1,
 * 뱃지 30, 전국도감 상장 10,000이다. 번호를 값으로 쓰면 안 된다.
 *
 * `IncrementTrainerScore2`는 인자를 변수로 받는 판이다 (원작도 둘로 나뉜다)
 */
const incrementScore: CommandFn = (ctx) => {
  const event = ctx.readVar()
  ctx.host.world.services.records?.score(event)
  return false
}
on('IncrementTrainerScore', incrementScore)
on('IncrementTrainerScore2', incrementScore)

/**
 * TV 인터뷰를 딸 수 있는가 (`ScrCmd_CheckTVInterviewEligible`).
 *
 * ⚠️ **늘 「아니오」다.** TV 방송(`tv_segment.c`)은 낱말 고르기(`easy_chat`,
 * §4.8)로 문장을 짜 맞추는 계통이라 그쪽이 서기 전에는 만들 수가 없다.
 * 안 만든 것을 「된다」로 답하면 기자가 말을 걸고 빈 방송이 나간다.
 *
 * ⚠️ **그래도 명령은 만든다.** 안 만들면 결과 변수에 앞 갈래의 값이 남아
 * 기자가 우연히 나타난다 — 리본에서 밟은 함정과 같다 (§9.2). 배틀프런티어
 * 로비의 기자가 그 0으로 숨는다 (§9.3)
 */
on('CheckTVInterviewEligible', (ctx) => {
  ctx.readVar()
  ctx.host.vars.set(ctx.readHalfWord(), 0)
  return false
})

/**
 * TV 방송을 짜 넣는다 (`ScrCmd_CallTVBroadcast` · `…Interview` · `SaveTVSegment*`).
 *
 * ⚠️ **만들지 않는다.** 방송 한 편이 **낱말 고르기로 짜 맞춘 문장**이라
 * (`easy_chat`, §4.8) 그 계통 없이는 내용이 빈다. 대사를 지어내는 대신
 * 명령만 만들고 아무 일도 안 한다 — 「인터뷰를 딸 수 있는가」가 늘 「아니오」라
 * 부르는 자리에 닿지도 않는다.
 *
 * ⚠️ **그래도 인자는 읽는다.** 안 읽으면 다음 명령이 인자를 명령으로 읽는다
 */
const tvNoop = (words: number): CommandFn => (ctx) => {
  for (let i = 0; i < words; i++) ctx.readHalfWord()
  return false
}

/**
 * ⚠️ **인자 폭이 첫 값에 달렸다** (`CallTVBroadcast` 매크로의 `.if`).
 *
 * 표에 적힌 폭 2는 **첫 halfword까지**다 — 그 값이 갈래를 고르고, 갈래마다
 * 뒤에 붙는 변수 수가 다르다. 고정 폭으로 읽으면 남은 바이트를 다음 명령으로
 * 읽어서 스크립트가 통째로 어긋난다 (실측: `scripts_tv_broadcast`가 `0x800c`를
 * 명령으로 읽고 섰다)
 */
const TV_BROADCAST_ARGS: Readonly<Record<number, number>> = {
  0: 1, // 방송이 밀려 있는가 → 변수 하나
  1: 3, // 인사·머리말 → 갈래 + 뱅크 + 줄
  2: 0, // 프로그램 끝
  3: 3, // 꼭지 하나 → 번호 + 뱅크 + 줄
  4: 2, // 광고 → 뱅크 + 줄
  5: 3, // 안 쓰인다
  6: 1, // 다음 꼭지 번호
}

on('CallTVBroadcast', (ctx) => {
  const call = ctx.readHalfWord()
  const words = TV_BROADCAST_ARGS[call] ?? 0
  // ⚠️ **결과 변수에 0을 적는다.** 안 적으면 앞 갈래의 값이 남아 방송이
  // 우연히 시작한다 — 리본에서 밟은 함정과 같다 (§9.2)
  for (let i = 0; i < words; i++) {
    const at = ctx.readHalfWord()
    if (at >= SCRIPT_LOCAL_VARS_START) ctx.host.vars.set(at, 0)
  }
  return false
})

/** 인터뷰도 첫 값이 갈래다 — 0은 변수 셋, 1도 변수 셋이다 */
on('CallTVInterview', (ctx) => {
  ctx.readHalfWord()
  for (let i = 0; i < 3; i++) {
    const at = ctx.readHalfWord()
    if (at >= SCRIPT_LOCAL_VARS_START) ctx.host.vars.set(at, 0)
  }
  return false
})

on('SaveTVSegmentHiddenItem', tvNoop(1))
on('SaveTVSegmentHomeAndManor', tvNoop(1))
on('SaveTVSegmentHomeAndManorNoFurniture', tvNoop(0))
on('SaveTVSegmentPokemonStorageBulletin', tvNoop(0))

/**
 * 랭킹 머신 (`ScrCmd_StartRankingsMachine`).
 *
 * ⚠️ **만들지 않는다.** 이 기계가 하는 일은 **남들과 줄 세우기**인데, 그 남들이
 * 기록교환(`record_mixed_rng`)으로 들어온다 — 통신이라 §9다. 줄 세울 상대가
 * 없으면 남는 것은 내 숫자뿐이고, 그건 트레이너 카드가 이미 보여 준다.
 *
 * ⚠️ **여섯 자리가 다 축복TV방송국의 랭킹 방 둘이다** (파일 16·17) — 그 방
 * 자체가 통신 방이다. 기록 148칸은 만들었으므로, 통신이 열리면 화면만 붙이면 된다
 */
on('StartRankingsMachine', (ctx) => { ctx.readVar(); return false })


// ── 스크립트가 리포트를 쓴다 (PARITY §4.12) ──────────────────────────────────
//
// **묻고 답하는 것은 전부 원작 스크립트다** — 공용 스크립트 0x7D6이 요약창을
// 띄우고 `ShowYesNoMenu`로 두 번 묻고 결과에 따라 갈라진다. 여기 있는 것은
// 그 스크립트가 부르는 밑바닥 여섯뿐이다.
//
// ⚠️ **이게 없으면 배틀프런티어에 못 들어간다** — 로비가 도전 앞에서
// `Common_SaveGame`을 부르고 결과가 0이면 스스로 돌려보낸다 (§9.3).

/** `SAVE_TYPE_NO_DATA_EXISTS` — 아직 리포트가 없다. 서비스가 없을 때의 답이다 */
const SAVE_TYPE_NO_DATA = 1

/**
 * 어떤 저장인가 (`ScrCmd_CheckSaveType`).
 *
 * ⚠️ **「빠른 저장」은 답하지 않는다.** 원작의 그것은 플래시의 바뀐 블록만
 * 쓰는 것인데 우리 리포트는 한 덩이다 — 없는 갈래를 답하면 스크립트가
 * "조금만 저장합니다"라고 거짓말을 한다
 */
on('CheckSaveType', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.saveGame?.type() ?? SAVE_TYPE_NO_DATA)
  return false
})

/** 요약창 넷 줄 (`ScrCmd_OpenSaveInfo`) */
on('OpenSaveInfo', (ctx) => { ctx.host.world.services.saveGame?.showInfo(); return false })
on('CloseSaveInfo', (ctx) => { ctx.host.world.services.saveGame?.hideInfo(); return false })

/** 「저장 중」 표시 (`ScrCmd_ShowSavingIcon`) */
on('ShowSavingIcon', (ctx) => { ctx.host.world.services.saveGame?.showIcon(); return false })
on('HideSavingIcon', (ctx) => { ctx.host.world.services.saveGame?.hideIcon(); return false })

/**
 * 실제로 쓴다 (`ScrCmd_TrySaveGame`). 됐으면 1, 아니면 0.
 *
 * ⚠️ **여기서 선다.** 디스크로 나가는 일이라 한 프레임에 안 끝난다 —
 * 원작은 플래시에 바로 써서 안 서지만, 우리는 기다려야 한다
 */
on('TrySaveGame', (ctx) => {
  const dest = ctx.readHalfWord()
  // ⚠️ **유니온룸 접수원이 부른 저장은 「안 됐다」로 답한다** (PARITY §9.4).
  // 리포트는 진짜로 쓴다 — 거짓말하는 것은 저장이 아니라 **넘겨주기**다.
  // 이 답으로 유니온룸이 원작의 「또 오세요」 갈래로 닫힌다 (`world/comm.ts`)
  const toComm = ctx.host.world.scriptID === SCRIPT_UNION_ROOM_ATTENDANT
  const save = ctx.host.world.services.saveGame
  if (!save) { ctx.host.vars.set(dest, 0); return false }
  save.begin()
  ctx.pause((c) => {
    const got = c.host.world.services.saveGame?.result() ?? false
    if (got === null) return false
    c.host.vars.set(dest, got && !toComm ? 1 : 0)
    return true
  })
  return true
})

/**
 * 저장 결과를 스크립트 관리자에 적어 둔다 (`ScrCmd_StoreSaveResult`).
 *
 * 부른 쪽이 나중에 꺼내 보는 칸인데 **우리에게는 그 칸이 없다** — 결과는
 * `VAR_RESULT`에 이미 들어 있고 그것을 읽는 자리가 우리 쪽에는 없다.
 * ⚠️ 그래도 인자는 읽는다
 */
on('StoreSaveResult', (ctx) => { ctx.readVar(); return false })

/**
 * 덤으로 딸린 블록 (`ScrCmd_SaveExtraData` · `ScrCmd_CheckIsMiscSaveInit`).
 *
 * DS 플래시가 리포트를 여러 블록으로 나눠 쓰고, 그중 하나가 비어 있으면
 * 「전체 저장」으로 올라가는 장치다 — **우리 리포트는 한 덩이라 나눌 블록이
 * 없다.** 늘 「이미 있다」로 답한다
 */
on('SaveExtraData', () => false)
on('CheckIsMiscSaveInit', (ctx) => { ctx.host.vars.set(ctx.readHalfWord(), 1); return false })

/**
 * 저장하는 동안 주인공을 멈춘다 (`ScrCmd_258` · `ScrCmd_259`).
 *
 * 걷는 애니메이션을 세워 두는 작업 하나다 (`ov5_021E1000`). 우리 주인공은
 * 스크립트가 도는 동안 이미 멈춰 있다 (`LockAll`) — 만드는 이유는 안 만들면
 * 저장 흐름이 이 자리에서 서기 때문이다
 */
on('ScrCmd_258', () => false)
on('ScrCmd_259', () => false)


// ── 배틀프런티어 (PARITY §9.3) ────────────────────────────────────────────────

/**
 * 시설 안으로 들어간다 (`ScrCmd_LaunchBattleFrontierScene`).
 *
 * ⚠️ **여기서부터 다른 VM이다.** 원작은 오버레이 104가 자기 스크립트를 들고
 * 복도와 배틀룸을 굴린다 — 필드 스크립트는 장면 번호 하나를 넘기고 **끝날
 * 때까지 선다**. 우리는 그 안을 네이티브 흐름으로 만들었다.
 *
 * ⚠️ **안 만든 시설이면 그냥 지나간다.** 다섯 중 배틀팩토리 하나만 있고
 * 나머지 넷은 §9다 — `busy()`가 거짓이면 그 자리에서 다음 줄로 간다
 */
on('LaunchBattleFrontierScene', (ctx) => {
  const scene = ctx.readByte()
  ctx.host.world.services.frontier?.openScene(scene)
  ctx.pause((c) => c.host.world.services.frontier?.busy() !== true)
  return true
})

/**
 * 힙이 새는지 본다 (`ScrCmd_CheckHeapMemory`).
 *
 * 원작의 **디버그 확인**이다 — 스크립트 앞에서 빈 힙을 적어 두고 뒤에서
 * 같은지 본다. 인자가 0이면 적고, 1이면 견준다. 우리에게는 그 힙이 없다.
 *
 * ⚠️ **그래도 인자는 읽는다.** 안 읽으면 다음 명령이 인자 두 바이트를
 * 명령으로 읽는다
 */
on('CheckHeapMemory', (ctx) => { ctx.readVar(); return false })

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

// 값을 **변수**로 받는 짝. 하는 일은 위와 같다
on('RemoveMoney2', (ctx) => {
  const amount = ctx.readVar()
  ctx.host.world.services.money?.spend(amount)
  return false
})

on('CheckMoney2', (ctx) => {
  const dest = ctx.readHalfWord()
  const amount = ctx.readVar()
  ctx.host.world.vars.set(dest, (ctx.host.world.services.money?.get() ?? 0) >= amount ? 1 : 0)
  return false
})

// ── 소지금·코인 창 ───────────────────────────────────────────────────────────
//
// 필드 스크립트에서 가장 자주 나오는 명령 셋이다 (`HideMoney` 46자리).
// 상점·육성가·게임코너 앞에서 「지금 얼마 있는지」를 띄워 두는 작은 창이고,
// 안 만들면 값을 흥정하는 대사가 전부 허공에 뜬다.
//
// ⚠️ **자리가 타일 좌표다** — `ShowMoney 20, 2`는 왼쪽 20칸·위 2칸이다.
// 창 크기는 코드가 정한다 (돈 10×4 · 코인 10×2).

on('ShowMoney', (ctx) => {
  const left = ctx.readVar()
  const top = ctx.readVar()
  ctx.host.world.services.currency?.showMoney(left, top)
  return false
})

on('HideMoney', (ctx) => {
  ctx.host.world.services.currency?.hideMoney()
  return false
})

on('UpdateMoneyDisplay', (ctx) => {
  ctx.host.world.services.currency?.updateMoney()
  return false
})

on('ShowCoins', (ctx) => {
  const left = ctx.readVar()
  const top = ctx.readVar()
  ctx.host.world.services.currency?.showCoins(left, top)
  return false
})

on('HideCoins', (ctx) => {
  ctx.host.world.services.currency?.hideCoins()
  return false
})

on('UpdateCoinDisplay', (ctx) => {
  ctx.host.world.services.currency?.updateCoins()
  return false
})

// ── 코인 (`coins.c`) ─────────────────────────────────────────────────────────

on('GetCoinsAmount', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.coins?.get() ?? 0)
  return false
})

on('AddCoins', (ctx) => {
  const amount = ctx.readVar()
  ctx.host.world.services.coins?.add(amount)
  return false
})

on('SubtractCoinsFromValue', (ctx) => {
  const amount = ctx.readVar()
  ctx.host.world.services.coins?.subtract(amount)
  return false
})

on('SubtractCoinsFromVar', (ctx) => {
  // ⚠️ **변수 번호를 먼저 읽고 그 값을 쓴다** (`GetVarPointer`). 폭은 같지만
  // 원작이 값이 아니라 포인터를 받는 자리다
  const amount = ctx.host.vars.get(ctx.readHalfWord())
  ctx.host.world.services.coins?.subtract(amount)
  return false
})

on('HasCoinsFromValue', (ctx) => {
  const dest = ctx.readHalfWord()
  const amount = ctx.readWord()
  ctx.host.vars.set(dest, (ctx.host.world.services.coins?.get() ?? 0) >= amount ? 1 : 0)
  return false
})

on('HasCoinsFromVar', (ctx) => {
  const dest = ctx.readHalfWord()
  const amount = ctx.host.vars.get(ctx.readHalfWord())
  ctx.host.vars.set(dest, (ctx.host.world.services.coins?.get() ?? 0) >= amount ? 1 : 0)
  return false
})

on('CheckCanAddCoins', (ctx) => {
  // ⚠️ **「더할 수 있나」와 「더해진다」의 답이 다르다.** 이쪽은 합이 상한
  // 이하인지만 보고, `AddCoins`는 이미 가득이면 한 닢도 안 넣는다 (`coins.ts`)
  const dest = ctx.readHalfWord()
  const amount = ctx.readVar()
  ctx.host.vars.set(dest, ctx.host.world.services.coins?.canAdd(amount) === true ? 1 : 0)
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
  addNpc(ctx.readVar(), ctx.host.vars)
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

/**
 * 이쪽도 **지금 서 있는 사람**이다 (`MapObject_SwitchMovementType`).
 *
 * ⚠️ 배치표를 고치는 위의 `SetObjectEventMovementType`과 다른 명령이다. 여기를
 * 배치표로 두면 유형이 「맵을 한 번 나갔다 들어와야」 먹는다 — 동행이 붙는
 * 자리 여덟이 전부 이 명령이라(영원의숲 셰릴·강철섬 리키·201번도로 라이벌…)
 * 그동안 동행은 그 자리에 굳어 있었다
 */
on('SetMovementType', (ctx) => {
  const localID = ctx.readVar()
  switchMovementType(localID, ctx.readHalfWord())
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
  ctx.host.world.slots.set(slot, padNumber(text, mode, digits))
  return false
})

on('BufferVarPaddingDigits', (ctx) => {
  // 값이 4바이트가 아니라 **변수**인 것 말고는 위와 같다. 원작은 「안 채움」일 때
  // 자릿수를 그 수 자신에게서 다시 얻는데(`GetNumberDigitCount`), 어차피 안
  // 채우므로 결과가 같다
  const slot = ctx.readByte()
  const value = ctx.readVar()
  const mode = ctx.readByte()
  const digits = ctx.readByte()
  ctx.host.world.slots.set(slot, padNumber(String(value), mode, digits))
  return false
})

/** 0 안 채움 · 1 공백 · 2 영 (`constants/string.h`의 `PADDING_MODE_*`) */
function padNumber(text: string, mode: number, digits: number): string {
  return mode === 0 ? text : text.padStart(digits, mode === 2 ? '0' : ' ')
}

on('BufferTypeName', (ctx) => {
  const slot = ctx.readByte()
  const type = ctx.readVar()
  ctx.host.world.slots.set(slot, ctx.host.world.services.labels?.type(type) ?? '')
  return false
})

on('BufferNatureName', (ctx) => {
  const slot = ctx.readByte()
  const nature = ctx.readVar()
  ctx.host.world.slots.set(slot, ctx.host.world.services.labels?.nature(nature) ?? '')
  return false
})

on('BufferTrainerName', (ctx) => {
  const slot = ctx.readByte()
  const id = ctx.readVar()
  ctx.host.world.slots.set(slot, ctx.host.world.services.labels?.trainer(id) ?? '')
  return false
})

on('BufferTrainerClassNameWithArticle', (ctx) => {
  const slot = ctx.readByte()
  const trainerClass = ctx.readVar()
  ctx.host.world.slots.set(
    slot, ctx.host.world.services.labels?.trainerClassWithArticle(trainerClass) ?? '',
  )
  return false
})

on('BufferItemNameWithArticle', (ctx) => {
  const slot = ctx.readByte()
  const item = ctx.readVar()
  ctx.host.world.slots.set(slot, ctx.host.world.services.labels?.itemWithArticle(item) ?? '')
  return false
})

on('BufferItemNamePlural', (ctx) => {
  const slot = ctx.readByte()
  const item = ctx.readVar()
  ctx.host.world.slots.set(slot, ctx.host.world.services.labels?.itemPlural(item) ?? '')
  return false
})

on('BufferTMHMMoveName', (ctx) => {
  // 인자는 기술 번호가 아니라 **도구 번호**다 (`Item_MoveForTMHM`)
  const slot = ctx.readByte()
  const item = ctx.readVar()
  ctx.host.world.slots.set(slot, ctx.host.world.services.labels?.tmMove(item) ?? '')
  return false
})

on('BufferMapName', (ctx) => {
  const slot = ctx.readByte()
  const mapHeaderId = ctx.readVar()
  ctx.host.world.slots.set(slot, ctx.host.world.services.labels?.map(mapHeaderId) ?? '')
  return false
})

// ⚠️ 이 둘은 인자 뒤에 **안 쓰는 값 둘이 더 붙는다** (`unused1` 반워드 ·
// `unused2` 바이트). 안 읽고 지나가면 명령 흐름이 세 바이트 어긋난다
on('BufferSpeciesNameFromVar', (ctx) => {
  const slot = ctx.readByte()
  const species = ctx.readVar()
  ctx.readHalfWord()
  ctx.readByte()
  ctx.host.world.slots.set(slot, ctx.host.world.services.labels?.species(species) ?? '')
  return false
})

on('BufferSpeciesNameWithArticle', (ctx) => {
  const slot = ctx.readByte()
  const species = ctx.readVar()
  ctx.readHalfWord()
  ctx.readByte()
  ctx.host.world.slots.set(slot, ctx.host.world.services.labels?.speciesWithArticle(species) ?? '')
  return false
})

on('BufferPlayerCounterpartStarterSpeciesNameWithArticle', (ctx) => {
  const slot = ctx.readByte()
  const species = counterpartStarter(ctx.host.vars.get(VAR_PLAYER_STARTER))
  ctx.host.world.slots.set(slot, ctx.host.world.services.labels?.speciesWithArticle(species) ?? '')
  return false
})

on('BufferPartyMoveName', (ctx) => {
  const slot = ctx.readByte()
  const at = ctx.readVar()
  const moveSlot = ctx.readVar()
  const move = ctx.host.world.services.party?.move(at, moveSlot) ?? 0
  ctx.host.world.slots.set(slot, ctx.host.world.services.labels?.move(move) ?? '')
  return false
})

on('BufferPartyMonNicknameReturnSpecies', (ctx) => {
  // 이름을 칸에 넣고 **종족 번호를 변수로도** 준다. 칸 번호가 아니라 안 쓰는
  // 반워드가 먼저 온다 (`.short 0 // unused`) — 육성가가 맡긴 마리를 부를 때다
  ctx.readHalfWord()
  const at = ctx.readVar()
  const dest = ctx.readHalfWord()
  const party = ctx.host.world.services.party
  // 원작 `Party_StringTemplateSetNicknameReturnSpecies`가 **0번 칸**에 넣는다
  ctx.host.world.slots.set(0, party?.nickname(at) ?? '')
  ctx.host.vars.set(dest, party?.species(at) ?? 0)
  return false
})

on('BufferMonNicknameFromPC', (ctx) => {
  // 변수 하나에 박스와 자리가 함께 들어 있다 (`slot / 30`, `slot % 30`)
  const slot = ctx.readByte()
  const boxSlot = ctx.readVar()
  ctx.host.world.slots.set(slot, ctx.host.world.services.boxes?.nickname(boxSlot) ?? '')
  return false
})

on('BufferTrainerClassFromAppearance', (ctx) => {
  const slot = ctx.readByte()
  const services = ctx.host.world.services
  const gender = services.trainerInfo?.gender() ?? 0
  const trainerClass = appearanceClass(gender, services.appearance?.get() ?? 0)
  ctx.host.world.slots.set(slot, services.labels?.trainerClassWithArticle(trainerClass) ?? '')
  return false
})

/**
 * 크기 대회의 수 두 칸 (`SizeContest_SetPartyMonSizeStrParams`).
 *
 * ⚠️ **칸 번호도 변수로 온다.** 다른 `Buffer…`가 바이트 하나로 주는 것과 다르다
 */
on('BufferPartyPokemonSize', (ctx) => {
  const wholeSlot = ctx.readVar()
  const tenthSlot = ctx.readVar()
  const at = ctx.readVar()
  const size = ctx.host.world.services.party?.sizeOf(at) ?? null
  const parts = size === null ? { whole: 0, tenth: 0 } : sizeParts(size.heightDm, size.factor)
  ctx.host.world.slots.set(wholeSlot, String(parts.whole))
  ctx.host.world.slots.set(tenthSlot, String(parts.tenth))
  return false
})

on('BufferSizeContestRecord', (ctx) => {
  const wholeSlot = ctx.readVar()
  const tenthSlot = ctx.readVar()
  const species = ctx.readVar()
  const height = ctx.host.world.services.party?.heightOf(species) ?? 0
  const parts = sizeParts(height, ctx.host.vars.get(VAR_SIZE_CONTEST_RECORD))
  ctx.host.world.slots.set(wholeSlot, String(parts.whole))
  ctx.host.world.slots.set(tenthSlot, String(parts.tenth))
  return false
})

on('BufferTabletName', (ctx) => {
  // 224번도로의 석판에 새긴 이름 (`MiscSaveBlock_TabletName`). 아직 안 새겼으면
  // 빈 글이고, 스크립트도 그때는 이 대사로 안 온다
  ctx.host.world.slots.set(ctx.readByte(), ctx.host.world.services.tablet?.name() ?? '')
  return false
})

on('CapitalizeFirstLetter', (ctx) => {
  // ⚠️ **한국어에서는 하는 일이 없다.** 원작 `StringTemplate_CapitalizeArgAtIndex`가
  // 라틴 소문자만 대문자로 올린다 — 그래도 칸 번호는 읽어야 흐름이 안 어긋난다
  const slot = ctx.readByte()
  const text = ctx.host.world.slots.get(slot)
  if (text) ctx.host.world.slots.set(slot, text[0]!.toUpperCase() + text.slice(1))
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

/** `LCRNG_Next() % bound`. 상한이 0이면 나눗셈이 터지므로 막는다 */
function randMod(bound: number): number {
  return bound > 0 ? Math.floor(Math.random() * bound) : 0
}

on('GetRandom', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, randMod(ctx.readVar()))
  return false
})

// ── 날마다 바뀌는 것 (PARITY §6.11) ──────────────────────────────────────────
//
// 신오방송국이 무리를 켜고, 포켓몬저택 사무실이 트로피가든에 한 마리씩 더한다.
// 안 만들면 방송국 사람이 무리를 알려 줘도 그 도로에 아무것도 안 뜨고,
// 트로피가든은 영영 특별한 것이 없다.

on('EnableSwarms', (ctx) => {
  ctx.host.world.services.daily?.enableSwarms()
  return false
})

/**
 * 배회 포켓몬 한 자리를 연다 (`ScrCmd_ActivateRoamingPokemon`, PARITY §6.3).
 *
 * 신오에서 이 명령이 도는 자리는 둘이다 — 예진호수에서 엠라이트를 깨우는
 * 장면과 명예의 전당 뒤 만월도에서 크레세리아가 날아가는 장면
 */
on('ActivateRoamingPokemon', (ctx) => {
  // ⚠️ **인자를 먼저 읽는다.** `?.activate(ctx.readByte())`로 쓰면 서비스가
  // 없을 때 바이트를 안 읽고 지나가 명령 흐름이 한 칸 어긋난다
  const slot = ctx.readByte()
  ctx.host.world.services.roamers?.activate(slot)
  return false
})

on('GetSwarmMapAndSpecies', (ctx) => {
  const destMap = ctx.readHalfWord()
  const destSpecies = ctx.readHalfWord()
  const got = ctx.host.world.services.daily?.swarm() ?? null
  ctx.host.vars.set(destMap, got?.map ?? 0)
  ctx.host.vars.set(destSpecies, got?.species ?? 0)
  return false
})

on('AddTrophyGardenMon', (ctx) => {
  ctx.host.world.services.daily?.addTrophyMon()
  return false
})

on('GetTrophyGardenSlot1Species', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.daily?.trophySpecies(0) ?? 0)
  return false
})

// ── 육성가와 알 (PARITY §3.2·§3.3) ───────────────────────────────────────────
//
// 육성가 아저씨·아주머니의 대사가 **전부 이 값들로 갈린다.** 안 만들면 맡길
// 수도, 찾을 수도, 알을 받을 수도 없다 — 말은 걸리는데 아무 일도 안 일어난다.

on('GetDaycareState', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.daycare?.state() ?? 0)
  return false
})

on('GetDaycareCompatibilityLevel', (ctx) => {
  // ⚠️ 없을 때 0을 주면 "무척 사이가 좋다"가 된다. 3이 "서로 놀지도 않는다"다
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.daycare?.compatibility() ?? 3)
  return false
})

on('CheckDaycareHasEgg', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.daycare?.hasEgg() ? 1 : 0)
  return false
})

on('StorePartyMonIntoDaycare', (ctx) => {
  // ⚠️ **인자를 먼저 읽는다.** `?.`로 감싸면 바깥 세계가 없을 때 읽기 자체가
  // 안 일어나서 그 뒤가 통째로 밀린다 (`argWidth.test.ts`가 그걸 센다)
  const slot = ctx.readVar()
  ctx.host.world.services.daycare?.store(slot)
  return false
})

on('MoveMonToPartyFromDaycareSlot', (ctx) => {
  const dest = ctx.readHalfWord()
  const slot = ctx.readVar()
  ctx.host.vars.set(dest, ctx.host.world.services.daycare?.withdraw(slot) ?? 0)
  return false
})

on('BufferDaycarePriceBySlot', (ctx) => {
  const dest = ctx.readHalfWord()
  const slot = ctx.readVar()
  ctx.host.vars.set(dest, ctx.host.world.services.daycare?.price(slot).money ?? 0)
  return false
})

on('BufferDaycareGainedLevelsBySlot', (ctx) => {
  const dest = ctx.readHalfWord()
  const slot = ctx.readVar()
  ctx.host.vars.set(dest, ctx.host.world.services.daycare?.price(slot).levels ?? 0)
  return false
})

on('GiveEggFromDaycare', (ctx) => {
  ctx.host.world.services.daycare?.takeEgg()
  return false
})

on('ResetDaycarePersonalityAndStepCounter', (ctx) => {
  ctx.host.world.services.daycare?.resetEgg()
  return false
})

on('CountPartyNonEggs', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.eggs?.nonEggs() ?? 0)
  return false
})

on('CountPartyEggs', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.eggs?.count() ?? 0)
  return false
})

on('GetFirstNonEggInParty', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.eggs?.firstNonEgg() ?? 0)
  return false
})

on('HatchEgg', (ctx) => {
  ctx.host.world.services.eggs?.hatchFirst()
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
  // 뱃지 하나가 트레이너 스코어 30이다 (PARITY §7.5) — 원작도 여기서 올린다
  ctx.host.world.services.records?.score(SCORE_BADGE_EARNED)
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

on('CheckPartyHasSpecies2', (ctx) => {
  // 앞의 것과 하는 일이 같은데 **인자 차례가 반대**고 답을 준 뒤 한 프레임 쉰다
  const species = ctx.readVar()
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.party?.hasSpecies(species) === true ? 1 : 0)
  return true
})

on('CheckPartyHasHeldItem', (ctx) => {
  const item = ctx.readVar()
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.party?.hasHeldItem(item) === true ? 1 : 0)
  return false
})

on('GetPartyMonMoveCount', (ctx) => {
  const dest = ctx.readHalfWord()
  const slot = ctx.readVar()
  ctx.host.vars.set(dest, ctx.host.world.services.party?.moveCount(slot) ?? 0)
  return false
})

on('GetPartyMonType', (ctx) => {
  // 답이 **둘**이다. 하나만 읽으면 다음 명령이 통째로 어긋난다
  const first = ctx.readHalfWord()
  const second = ctx.readHalfWord()
  const slot = ctx.readVar()
  const [a, b] = ctx.host.world.services.party?.types(slot) ?? [0, 0]
  ctx.host.vars.set(first, a)
  ctx.host.vars.set(second, b)
  return false
})

on('CountPartyMonsBelowLevelThreshold', (ctx) => {
  // ⚠️ 이름과 달리 **그 레벨까지 센다** (`level <= threshold`)
  const dest = ctx.readHalfWord()
  const level = ctx.readVar()
  ctx.host.vars.set(dest, ctx.host.world.services.party?.countAtOrBelowLevel(level) ?? 0)
  return false
})

on('CheckIsPartyMonOutsider', (ctx) => {
  // ⚠️ **트레이너 번호만 견준다** — 이름도 비밀번호도 안 본다. 그래서 번호가
  // 우연히 같으면 남의 포켓몬도 내 것으로 센다. 원작이 그렇다
  const slotVar = ctx.readHalfWord()
  const dest = ctx.readHalfWord()
  const slot = ctx.host.vars.get(slotVar)
  ctx.host.vars.set(dest, ctx.host.world.services.party?.isOutsider(slot) === true ? 1 : 0)
  return false
})

on('GetPartyMonEVTotal', (ctx) => {
  const dest = ctx.readHalfWord()
  const slot = ctx.readVar()
  ctx.host.vars.set(dest, ctx.host.world.services.party?.evTotal(slot) ?? 0)
  return false
})

// ── 조건에 맞는 파티 자리 찾기 (`scrcmd_party.c`) ────────────────────────────
//
// ⚠️ **못 찾았을 때의 값이 명령마다 다르다.** 기술만 6이고 나머지 셋은 0xFF다.
// 스크립트가 그 값을 그대로 견주므로(`GoToIfEq VAR_RESULT, 6`) 하나로 맞추면 안 된다.

/** `MAX_PARTY_SIZE` — `FindPartySlotWithMove`가 못 찾았을 때 주는 값 */
const FIND_MOVE_NONE = 6
/** 나머지 셋이 못 찾았을 때 주는 값 */
const FIND_SLOT_NONE = 0xff

on('FindPartySlotWithMove', (ctx) => {
  const dest = ctx.readHalfWord()
  const move = ctx.readVar()
  ctx.host.vars.set(dest, ctx.host.world.services.party?.findWithMove(move) ?? FIND_MOVE_NONE)
  return false
})

on('FindPartySlotWithNature', (ctx) => {
  const dest = ctx.readHalfWord()
  const nature = ctx.readVar()
  ctx.host.vars.set(dest, ctx.host.world.services.party?.findWithNature(nature) ?? FIND_SLOT_NONE)
  return false
})

on('FindPartySlotWithSpecies', (ctx) => {
  const dest = ctx.readHalfWord()
  const species = ctx.readVar()
  ctx.host.vars.set(dest, ctx.host.world.services.party?.findWithSpecies(species) ?? FIND_SLOT_NONE)
  return false
})

on('FindPartySlotWithFatefulEncounterSpecies', (ctx) => {
  const dest = ctx.readHalfWord()
  const species = ctx.readVar()
  ctx.host.vars.set(dest, ctx.host.world.services.party?.findFateful(species) ?? FIND_SLOT_NONE)
  return false
})

/** 기술 네 칸 (`LEARNED_MOVES_MAX`) */
const LEARNED_MOVES_MAX = 4

/**
 * 기술 한 칸을 지운다 (`ScrCmd_ClearMoveSlot`).
 *
 * ⚠️ **칸 번호를 반드시 본다.** 운하시티 기술 삭제사의 스크립트는 같은 var
 * (`VAR_0x8001`)에 종족 번호를 담았다가 고른 칸으로 덮어쓴다. 고르는 화면이 없던
 * 동안에는 덮어쓰기가 일어나지 않아 **종족 번호가 칸 번호 자리로 흘러들었다.**
 * 화면이 생긴 지금도 그 자리는 남겨 둔다 — 범위 밖이면 아무것도 안 지운다
 */
on('ClearPartyMonMoveSlot', (ctx) => {
  const slot = ctx.readVar()
  const moveSlot = ctx.readVar()
  if (moveSlot < 0 || moveSlot >= LEARNED_MOVES_MAX) return false
  ctx.host.world.services.party?.clearMoveSlot(slot, moveSlot)
  return false
})

/**
 * 기술 한 칸을 갈아 끼운다 (`ScrCmd_ResetMoveSlot`).
 *
 * ⚠️ **디컴프의 인자 이름을 믿으면 안 된다.** 매크로는 `partySlot, moveID, moveSlot`
 * 이라고 적혀 있지만, `Party_ResetMonMoveSlot(party, slot, moveSlot, moveID)`에
 * 인자를 뒤바꿔 넘기고 그 함수가 다시 뒤바꿔 부른다 — 실제로는 **둘째가 칸,
 * 셋째가 기술**이다. 212번도로 집의 스크립트가 그 차례로 쓰는 것을 보고 확정했다
 * (`VAR_0x8002`가 `GetSummarySelectedMoveSlot`의 답이고 `VAR_0x8003`이 기술)
 */
on('ResetMoveSlot', (ctx) => {
  const slot = ctx.readVar()
  const moveSlot = ctx.readVar()
  const move = ctx.readVar()
  ctx.host.world.services.party?.setMoveSlot(slot, moveSlot, move)
  return false
})

// ── 한 마리 고르기 (`FieldSystem_OpenPartyMenu_SelectPokemon`) ───────────────
//
// 기술가르침·크기 대회·교환·리본 확인이 전부 이 화면 하나를 쓴다. 이름이
// `SelectMoveTutorPokemon`인 것은 디컴프가 처음 만난 자리가 기술가르침이라서고,
// 실제로는 아무 데서나 부른다.

on('SelectMoveTutorPokemon', (ctx) => {
  ctx.host.world.services.chooseMon?.open()
  // 화면이 닫힐 때까지 스크립트가 선다 (`ScriptContext_WaitForApplicationExit`)
  ctx.pause((c) => c.host.world.services.menuOpen?.() !== true)
  return true
})

on('GetSelectedPartySlot', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.chooseMon?.picked() ?? PARTY_SLOT_NONE)
  return false
})

// ── 요약 화면을 「기술 고르기」로 연다 ───────────────────────────────────────
//
// 원작은 같은 화면 하나를 모드만 바꿔 두 번 쓴다
// (`FieldSystem_OpenSummaryScreenSelectMove` · `FieldSystem_OpenSummaryScreenTeachMove`)
// 그리고 답을 `SCRIPT_MANAGER_PARTY_MANAGEMENT_DATA`에서 꺼낸다.
//
// ⚠️ **안 고른 값이 명령마다 다르다.** 삭제사 쪽은 `MOVE_NOT_SELECTED`(0xFF),
// 가르침 쪽은 `LEARNED_MOVES_MAX`(4)다. 스크립트가 그 값을 그대로 견주므로
// (`GoToIfEq VAR_0x8001, MOVE_NOT_SELECTED` · `GoToIfEq VAR_0x8002, LEARNED_MOVES_MAX`)
// 하나로 맞추면 안 된다.

/** `MOVE_NOT_SELECTED` — 기술 삭제사가 「안 골랐다」로 쓰는 값 */
const MOVE_NOT_SELECTED = 0xff

/** `MenuEntries_Text_Exit` — 메뉴 뱅크(`TEXT_BANK_MENU_ENTRIES`)의 「그만둔다」 */
const MENU_ENTRY_EXIT = 5

on('SelectPartyMonMove', (ctx) => {
  const slot = ctx.readVar()
  ctx.host.world.services.selectMove?.open(slot)
  ctx.pause((c) => c.host.world.services.menuOpen?.() !== true)
  return true
})

on('GetSelectedPartyMonMove', (ctx) => {
  const picked = ctx.host.world.services.selectMove?.picked() ?? null
  // 네 칸 밖이면 그만둔 것이다 — 원작도 `LEARNED_MOVES_MAX`를 0xFF로 바꿔 준다
  const answer = picked === null || picked >= LEARNED_MOVES_MAX ? MOVE_NOT_SELECTED : picked
  ctx.host.vars.set(ctx.readHalfWord(), answer)
  return false
})

on('OpenSummaryScreenTeachMove', (ctx) => {
  const slot = ctx.readVar()
  const move = ctx.readVar()
  ctx.host.world.services.selectMove?.open(slot, move)
  ctx.pause((c) => c.host.world.services.menuOpen?.() !== true)
  return true
})

on('GetSummarySelectedMoveSlot', (ctx) => {
  const picked = ctx.host.world.services.selectMove?.picked() ?? null
  // 이쪽은 그만둔 값이 곧 `LEARNED_MOVES_MAX`다
  const answer = picked === null || picked >= LEARNED_MOVES_MAX ? LEARNED_MOVES_MAX : picked
  ctx.host.vars.set(ctx.readHalfWord(), answer)
  return false
})

// ── 기술가르침 — 조각 교사 셋 (`overlay005/scrcmd_move_tutor.c`) ────────────
//
// 선단시티 동쪽 집 · 212번도로 집 · 서바이벌에리어 북쪽 집. 값은 돈이 아니라
// **조각 넷**이고 표는 `world/tutorMoves`가 든다 (디컴프에서 굽는다).

on('CheckHasLearnableTutorMoves', (ctx) => {
  const slot = ctx.readVar()
  const at = ctx.readVar()
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, tutorChoices(ctx, slot, at).length > 0 ? 1 : 0)
  return false
})

/**
 * 배울 기술을 고르는 목록 메뉴 (`ScrCmd_ShowMoveTutorMoveSelectionMenu`).
 *
 * ⚠️ **답이 자리 번호가 아니라 기술 번호다.** 원작이 `MoveTutorManager_AddMenuEntry`
 * 의 `index`에 기술 번호를 그대로 넣고, 스크립트가 그 값을 `CheckCanAffordMove`와
 * `PayShardCost`에 다시 넘긴다.
 *
 * ⚠️ **파티 자리가 `PARTY_SLOT_NONE`이면 그 교사의 기술을 전부 세운다** — 값만
 * 보러 온 자리다 (공용 스크립트의 조각 값 창).
 *
 * ⚠️ **항목 글을 뱅크에서 안 읽는다.** 기술 이름은 스크립트 뱅크가 아니라
 * 기술 이름표(`TEXT_BANK_MOVE_NAMES`)에 있어서 `labels.move`로 직접 넣는다
 */
on('ShowMoveTutorMoveSelectionMenu', (ctx) => {
  const slot = ctx.readVar()
  const at = ctx.readVar()
  const dest = ctx.readHalfWord()
  const world = ctx.host.world
  world.initMenu(dest, 0, true, 'global')
  for (const move of tutorChoices(ctx, slot, at)) {
    world.addMenuEntryText(world.services.labels?.move(move) ?? '', move)
  }
  // 마지막 줄은 「그만둔다」 (`MenuEntries_Text_Exit`) — 원작도 전역 뱅크에서 읽는다
  world.addMenuEntry(MENU_ENTRY_EXIT, MENU_CANCEL)
  world.showMenu('list')
  ctx.scratch[0] = dest
  ctx.pause((c) => c.host.world.vars.get(c.scratch[0]!) !== LIST_MENU_NO_SELECTION_YET)
  return true
})

on('CheckCanAffordMove', (ctx) => {
  const move = ctx.readVar()
  const dest = ctx.readHalfWord()
  const cost = shardCostOf(move)
  const bag = ctx.host.world.services.bag
  // 표에 없는 기술이면 원작도 단언에 걸리고 「못 산다」로 떨어진다
  const can = cost !== null
    && SHARDS.every((item, i) => (cost[i] ?? 0) === 0 || (bag?.quantity(item) ?? 0) >= cost[i]!)
  ctx.host.vars.set(dest, can ? 1 : 0)
  return false
})

on('PayShardCost', (ctx) => {
  const move = ctx.readVar()
  const cost = shardCostOf(move)
  if (cost === null) return false
  const bag = ctx.host.world.services.bag
  // ⚠️ **값이 0인 조각도 원작은 그대로 부른다** — 0개를 빼는 것은 아무 일도
  // 안 하므로 결과가 같다. 여기서는 부르지 않아 가방 로그가 안 더러워진다
  for (const [i, item] of SHARDS.entries()) {
    const need = cost[i] ?? 0
    if (need > 0) bag?.remove(item, need)
  }
  return false
})

/**
 * 그 자리에서 이 마리가 배울 수 있는 것들.
 *
 * 파티 자리가 없으면(`PARTY_SLOT_NONE`) 그 교사의 기술을 전부 준다 — 원작이
 * 같은 갈래로 값만 보여 준다
 */
function tutorChoices(ctx: ScriptContext, slot: number, at: number): number[] {
  if (slot === PARTY_SLOT_NONE) return tutorMovesAt(at)
  const party = ctx.host.world.services.party
  const species = party?.species(slot) ?? 0
  // 알은 종족이 0으로 온다 (`GetPartyMonSpecies`) — 아무것도 못 배운다
  if (species === 0) return []
  const known = [0, 1, 2, 3].map((i) => party?.move(slot, i) ?? 0)
  return learnableTutorMoves(species, party?.form(slot) ?? 0, known, at)
}

/**
 * 교환할 한 마리를 고른다 (`FieldSystem_OpenPartyMenu_SelectForTrade`).
 *
 * 원작이 여는 화면은 `PARTY_MENU_MODE_NPC_TRADE`고 위의 기술가르침 화면은
 * `..._SELECT_NO_PROMPT`인데, **입력 처리가 같은 가지에 묶여 있다** — 둘 다
 * 갈래 메뉴 없이 A가 곧 고르기다 (`PartyMenu_HandleInput`).
 *
 * ⚠️ 갈리는 곳이 딱 하나 있다. 교환 쪽은 고른 마리에 **볼 캡슐**이 붙어
 * 있으면 "떼어집니다"를 묻고 뗀다 (`CheckForItemApplication`). 우리 개체에는
 * 캡슐 칸이 없어서(PARITY §3.11) 그 가지가 영영 안 열린다 — 캡슐이 생기면
 * 여기가 갈라져야 한다
 */
on('OpenPartyMenuForTrade', (ctx) => {
  ctx.host.world.services.chooseMon?.open()
  ctx.pause((c) => c.host.world.services.menuOpen?.() !== true)
  return true
})

/** `constants/pokemon.h` — 안 고르고 나갔다 */
const PARTY_SLOT_NONE = 0xff

// ── NPC 교환 (PARITY §10 · `overlay006/npc_trade.c`) ────────────────────────
//
// 넷이 전부고 흐름도 넷이 같다:
//
//   SelectPokemonToTrade                 ← 매크로다. 위의 세 명령으로 풀린다
//   GoToIfEq VAR_RESULT, 0xFF, …그만둔다
//   InitNPCTrade <교환 번호>
//   GetPartyMonSpecies <자리>, VAR_0x8005
//   GetNPCTradeRequestedSpecies VAR_RESULT
//   GoToIfNe VAR_0x8005, VAR_RESULT, …그건 아닌데
//   StartNPCTrade <자리>
//   FinishNPCTrade
//
// ⚠️ **`FinishNPCTrade`가 두 갈래에 다 있다.** 원작이 `NPCTrade_Init`으로 잡은
// 것을 어느 쪽으로 끝나든 놓는다 — 안 놓으면 다음에 말을 걸었을 때 앞의 것이
// 그대로 남는다

on('InitNPCTrade', (ctx) => {
  // ⚠️ **먼저 읽는다.** `services.npcTrade?.init(ctx.readByte())`로 쓰면 바깥
  // 세계가 안 붙었을 때 `?.`가 앞에서 끊겨 인자 한 바이트를 안 읽는다 —
  // 그다음 명령부터 통째로 밀린다
  const tradeId = ctx.readByte()
  ctx.host.world.services.npcTrade?.init(tradeId)
  return false
})

on('GetNPCTradeSpecies', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.npcTrade?.species() ?? 0)
  return false
})

on('GetNPCTradeRequestedSpecies', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.npcTrade?.requestedSpecies() ?? 0)
  return false
})

on('StartNPCTrade', (ctx) => {
  const slot = ctx.readVar()
  ctx.host.world.services.npcTrade?.start(slot)
  // 원작은 여기서 필드 작업으로 넘기고 화면이 다 끝나야 돌아온다
  // (`FieldTask_StartNPCTrade` → `ScrCmd_StartNPCTrade`가 TRUE)
  ctx.pause((c) => c.host.world.services.menuOpen?.() !== true)
  return true
})

on('FinishNPCTrade', (ctx) => {
  ctx.host.world.services.npcTrade?.free()
  return false
})

// ── 크기 대회 (`overlay005/size_contest.c`) ──────────────────────────────────
//
// 222번도로의 집. 총어 한 마리만 재 주고, 기록은 시스템 변수 하나에 남는다

/** `generated/vars_flags.txt`의 `VAR_SIZE_CONTEST_RECORD` */
const VAR_SIZE_CONTEST_RECORD = 0x4035

on('InitSizeContestRecord', (ctx) => {
  ctx.host.vars.set(VAR_SIZE_CONTEST_RECORD, SIZE_RECORD_INITIAL)
  return false
})

on('CalcSizeContestResult', (ctx) => {
  const dest = ctx.readHalfWord()
  const at = ctx.readVar()
  const size = ctx.host.world.services.party?.sizeOf(at) ?? null
  const record = ctx.host.vars.get(VAR_SIZE_CONTEST_RECORD)
  ctx.host.vars.set(
    dest,
    size === null ? SIZE_RESULT.smaller : compareSize(size.heightDm, size.factor, record),
  )
  return false
})

on('UpdateSizeContestRecord', (ctx) => {
  const at = ctx.readVar()
  const size = ctx.host.world.services.party?.sizeOf(at) ?? null
  if (size !== null) ctx.host.vars.set(VAR_SIZE_CONTEST_RECORD, size.factor)
  return false
})

// ── 트레이너의 모습 (무쇠시티 포켓몬센터) ────────────────────────────────────

on('LoadTrainerAppearances', (ctx) => {
  // 칸 0~3에 후보 넷의 분류 이름을 넣는다. 메뉴가 그 칸을 읽어 항목을 만든다
  const services = ctx.host.world.services
  const classes = appearanceVariants(
    services.trainerInfo?.id() ?? 0, services.trainerInfo?.gender() ?? 0,
  )
  classes.forEach((c, i) => { ctx.host.world.slots.set(i, services.labels?.trainerClass(c) ?? '') })
  return false
})

on('CalculateTrainerInfoAppearance', (ctx) => {
  const variant = ctx.readVar()
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, appearanceOf(
    ctx.host.world.services.trainerInfo?.id() ?? 0,
    ctx.host.world.services.trainerInfo?.gender() ?? 0,
    variant,
  ))
  return false
})

on('GetTrainerInfoTrainerClass', (ctx) => {
  // 위와 같은데 **모습 번호를 분류 번호로 한 번 더 옮긴다**
  const variant = ctx.readVar()
  const dest = ctx.readHalfWord()
  const gender = ctx.host.world.services.trainerInfo?.gender() ?? 0
  const appearance = appearanceOf(ctx.host.world.services.trainerInfo?.id() ?? 0, gender, variant)
  ctx.host.vars.set(dest, appearanceClass(gender, appearance))
  return false
})

on('SetTrainerInfoAppearance', (ctx) => {
  const appearance = ctx.readVar()
  ctx.host.world.services.appearance?.set(appearance)
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

/**
 * 가진 뱃지 수를 센다 (`ScrCmd_CountBadgesAcquired`).
 *
 * ⚠️ **없으면 조용히 「뱃지가 없구나」가 된다.** 포켓치 컴퍼니 1층 사장이 이 수로
 * 앱을 나눠 주는데(1개 → 메모장, 3개 → 마킹맵, 5개 → 링크서처, 7개 → 기술확인기),
 * 답 var가 안 세워지면 `GoToIfEq VAR_0x8000, 0`이 늘 참이라 **앱 넷을 영영 못 받는다**
 *
 * 원작은 `sBadgeIDs` 여덟(`BADGE_ID_COAL` … `BADGE_ID_BEACON`)을 돌며
 * `TrainerInfo_HasBadge`를 묻는다. 우리는 같은 여덟 칸을 세는 `badgeCount`를 쓴다 —
 * 상점 재고 계단이 이미 쓰는 그 함수다. 세는 법이 두 벌이면 언젠가 갈린다
 */
on('CountBadgesAcquired', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, badgeCount(ctx.host.world.services.fieldMoves?.badges() ?? 0))
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
 * 배를 타고 건너간다 (`ScrCmd_PlayBoatCutscene` → `FieldSystem_PlayBoatCutscene`).
 *
 * ⚠️ **이 명령 하나가 배 그 자체다.** 원작에서 배를 타는 워프는 워프 타일도
 * `Warp`도 아니고 이것뿐이라, 안 만들면 대사만 끝나고 제자리에 선다. 그러면
 * **맵 63개**가 통째로 닫힌다 — 싸움·서바이벌·리조트에리어와 그 안의 건물,
 * 배틀타워·프런티어, 스타크산, 강철섬, 풍만·신월섬, 225~230번도로, 레지 유적 셋.
 * 그 63개에만 사는 33종도 같이 닫히고 그중에 리오르·히드런·레지락·레지스틸이 있다.
 *
 * ⚠️ **`readVar()`를 쓰면 안 된다.** `Warp`는 인자가 전부 var 참조지만 이쪽 매크로는
 * `.byte .byte .short .short .short` **리터럴**이다. 한 칸이라도 어긋나면 그 뒤
 * 스크립트가 통째로 밀린다.
 *
 * `travelDir`는 배가 어느 쪽으로 가는가(`BOAT_TRAVEL_DIR_*`)로, **연출에만** 쓰인다 —
 * 어느 배 모델을 찾고 운하 다리를 올릴지가 그 값으로 갈린다. 우리는 아직 배가
 * 뜨는 장면이 없어서 읽고 버린다 (PARITY §1.26). 자리는 `scene/CinematicStage`다.
 * 목적지는 원작도 `FieldTask_ChangeMapToLocation(…, x, z, exitDir)` 한 줄이라
 * `Warp`와 같은 길로 보낸다
 */
on('PlayBoatCutscene', (ctx) => {
  ctx.readByte() // travelDir — 연출용이라 우리는 안 쓴다
  const facing = ctx.readByte()
  const to = ctx.readHalfWord()
  const x = ctx.readHalfWord()
  const z = ctx.readHalfWord()
  const dest = mapById(to)
  if (!dest) return false
  mapWorld.pending = { to, matrix: dest.matrix, x: x + 0.5, z: z + 0.5, viaDoor: false, facing }
  // 원작이 `TRUE`를 돌려준다 — 연출이 화면을 가져가므로 그 프레임은 거기서
  // 끝난다. 우리는 연출이 없지만 자리는 그대로 둔다
  return true
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

/**
 * 눈이 마주칠 때의 곡 (`FieldBGM_GetEyesMeetForTrainer`).
 *
 * ⚠️ **트레이너 번호가 아니라 갈래가 곡을 정한다.** 사천왕 넷은 다 같은 곡이고
 * 챔피언만 다르다 — 리그의 다섯 자리가 그것이다. 표에 없는 갈래는 `SEQ_EYE_KID`다
 */
on('PlayTrainerEncounterBGM', (ctx) => {
  const id = ctx.readVar()
  const found = ctx.host.world.services.trainer?.(id)
  if (found != null) soundOf(ctx)?.setMusic(trainerEncounterBgm(found.class))
  return true
})

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

/**
 * 회복기 위에 볼이 하나씩 놓이는 연출 (`ScrCmd_PlayPokecenterHealingAnimation` ·
 * `ScrCmd_PlayHallOfFameHealingAnimation`).
 *
 * ⚠️ **소리만 난다.** 원작은 회복기 소품을 찾아 그 위에 미니 몬스터볼 모델을
 * 파티 마릿수만큼 12프레임 간격으로 얹고, 다 놓이면 한 번 돌린다
 * (`overlay006/healing_machine_animation/`). 우리는 소품을 **맵 메시에 구워
 * 두어서** 소품 하나를 자리 잡아 새로 띄울 길이 아직 없다 (PARITY §8.11).
 *
 * 인자는 **꼭 읽는다** — 폭이 2바이트다
 */
const healingAnimation: CommandFn = (ctx) => {
  ctx.readVar()
  ctx.host.world.services.sound?.playEffect(SFX_HEAL)
  return false
}

/** `SEQ_SE_DP_KAIFUKU`. 회복기가 내는 소리 */
const SFX_HEAL = 1516

on('PlayPokecenterHealingAnimation', healingAnimation)
on('PlayHallOfFameHealingAnimation', healingAnimation)

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
  rematch: 17, rematchDouble1: 18, rematchDouble2: 19,
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

// ── 꿀 나무 (PARITY §6.6 · `overlay005/honey_tree.c`) ───────────────────────
//
// 공용 스크립트 8번 하나가 네 명령을 다 쓴다. 나무 앞에서 A를 누르면
// 「꿀이 발라져 있다」·「달콤한 냄새」·붙은 마리와의 배틀 셋으로 갈린다

on('SlatherHoneyTree', (ctx) => {
  ctx.host.world.services.honeyTree?.slather()
  return false
})

on('GetHoneyTreeStatus', (ctx) => {
  // 안 붙어 있으면 「맨 나무」다. 0을 주면 스크립트가 세 갈래를 다 놓치고
  // 아무 말도 없이 끝난다 (`TREE_STATUS_BARE`가 1이지 0이 아니다)
  ctx.host.vars.set(
    ctx.readHalfWord(), ctx.host.world.services.honeyTree?.status() ?? TREE_STATUS.bare,
  )
  return false
})

on('StartHoneyTreeBattle', (ctx) => {
  ctx.host.world.services.honeyTree?.startBattle()
  // 트레이너전과 같다 — 화면이 배틀로 넘어가고 결과가 올 때까지 선다
  ctx.pause((c) => c.host.world.services.battleResult?.() !== null)
  return true
})

on('StopHoneyTreeShaking', (ctx) => {
  ctx.host.world.services.honeyTree?.stopShaking()
  return false
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

// ── VS시커 (PARITY §7.9) ─────────────────────────────────────────────────────

on('StartVsSeeker', (ctx) => {
  const dest = ctx.readHalfWord()
  const seeker = ctx.host.world.services.vsSeeker
  if (!seeker) {
    // 계통이 안 붙어 있으면 원작이 "주위에 아무도 없다"로 닫는 자리와 같다
    ctx.host.vars.set(dest, VsSeekerResult.noTrainers)
    return false
  }
  ctx.host.vars.set(dest, seeker.scan())
  // ⚠️ **삑 소리가 끝날 때까지 스크립트가 선다** (`VS_SEEKER_STATE_WAIT_FOR_VS_SEEKER_SFX`).
  // 느낌표가 뜨는 것이 이 사이라, 안 세우면 대사창이 표시 위로 겹쳐 뜬다
  ctx.pause(() => !seeker.busy())
  return true
})

on('GetRematchTrainerID', (ctx) => {
  const trainerID = ctx.readVar()
  const dest = ctx.readHalfWord()
  // ⚠️ **말을 건 사람이 돌고 있어야 한다.** 느낌표가 안 뜬 사람은 `TRAINER_NONE`이고,
  // 스크립트는 그걸 보고 "이미 이긴 사람" 대사로 간다 — 이 한 줄이 재대결의 문이다
  const target = ctx.host.world.target
  ctx.host.vars.set(dest, rematchTrainerID({
    spinning: target?.movementType === MOVEMENT_TYPE_VS_SEEKER_SPIN,
    trainerID,
    defeated: (id) => ctx.host.vars.checkFlag(TRAINER_DEFEATED_FLAGS_START + id),
    // 단계 다섯이 이어진 플래그라 번호로 더한다 (`SystemFlag_CheckUnlockedVsSeekerLevel`)
    unlocked: (level) => level >= 1 && level <= 5
      && ctx.host.vars.checkFlag(FLAG_UNLOCKED_VS_SEEKER_LVL_1 + level - 1),
  }))
  return false
})

/**
 * 재대결 대사 번호 (`ScrCmd_GetTrainerRematchMessageTypes`).
 *
 * `GetTrainerMessageTypes`와 같은 자리인데 **싸움 전 글만 다르다** — 뒤 글은
 * 0이다. 재대결에서 진 트레이너는 할 말이 따로 없고, 다음에 또 말을 걸면
 * 보통 「이미 이긴 사람」 대사로 돌아간다
 */
on('GetTrainerRematchMessageTypes', (ctx) => {
  const before = ctx.readHalfWord()
  const after = ctx.readHalfWord()
  const notEnough = ctx.readHalfWord()
  const world = ctx.host.world
  const double = world.services.trainer?.(trainerIdOf(world.scriptID))?.double === true
  const second = world.scriptID >= SCRIPT_ID_OFFSET_DOUBLE_BATTLES
    && trainerIdOf(world.scriptID) % 2 === 0
  ctx.host.vars.set(before, double
    ? (second ? TRMSG.rematchDouble2 : TRMSG.rematchDouble1)
    : TRMSG.rematch)
  ctx.host.vars.set(after, 0)
  ctx.host.vars.set(notEnough, double
    ? (second ? TRMSG.notEnough2 : TRMSG.notEnough1)
    : 0)
  return false
})

/**
 * 지금 보는 쪽으로 이동 유형을 굳힌다 (`VsSeeker_SetMoveCodeForFacingDirection`).
 *
 * ⚠️ **재대결 전용 명령이 아니다.** 트레이너전이 시작될 때마다 돈다
 * (`Battles_DoTrainerBattle`) — 그 순간 도는 사람이 멈춰 서고, 배틀에서
 * 돌아왔을 때 그 자리 그대로 나를 보고 있다. 회전이 풀리는 자리도 여기다.
 *
 * 더블이면 짝도 같이 굳힌다 — 한쪽만 멈추면 배틀 뒤에 하나는 서 있고 하나는 돈다
 */
on('SetMoveCodeForFacingDirection', (ctx) => {
  const world = ctx.host.world
  const target = world.target
  if (target === null) return false
  // ⚠️ 원작의 `if` 넷은 북·남·서를 이름으로 고르고 **나머지를 전부 동쪽으로** 친다
  const move = MOVEMENT_TYPE_LOOK[target.dir] ?? MOVEMENT_TYPE_LOOK[DIR.east] ?? 0
  const localID = ctx.host.vars.get(VAR_LAST_TALKED)
  if (world.services.trainer?.(trainerIdOf(world.scriptID))?.double === true) {
    const mate = secondDoubleObject(localID)
    if (mate !== null) switchMovementType(mate, move)
  }
  switchMovementType(localID, move)
  return false
})

/**
 * 더블 배틀의 다른 한 사람 (`VsSeeker_GetSecondDoubleBattleTrainer`).
 *
 * 배치표에서 **스크립트 번호만 다르고 트레이너 번호가 같은** 객체다.
 * 여기서는 `Script_GetTrainerID`와 같은 셈(스크립트 번호 → 트레이너 번호)을 쓴다
 */
function secondDoubleObject(localID: number): number | null {
  const me = npcActors.byLocalID.get(localID)
  if (!me) return null
  const mine = trainerIdOf(me.info.script)
  for (const other of npcActors.list) {
    if (other.localID === localID || other.info.script === me.info.script) continue
    if (other.info.script < SCRIPT_ID_OFFSET_DOUBLE_BATTLES) continue
    if (trainerIdOf(other.info.script) === mine) return other.localID
  }
  return null
}

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
  /** 명예의 전당에 들어가 봤는가 (`FLAG_GAME_COMPLETED`) */
  gameCompleted: 2404,
  /**
   * 플래시·안개제거를 지금 쓰고 있는가 (`FLAG_FLASH_ACTIVE`·`FLAG_DEFOG_ACTIVE`).
   *
   * ⚠️ **이 둘은 표식만이 아니라 날씨를 바꾼다** — 맵에 들어설 때 안개는
   * 안개제거가, 어둠은 플래시가 맑음으로 덮는다 (`world/overworldWeather`).
   *
   * 번호는 두 갈래로 확인했다: 목록에서 `FLAG_GAME_COMPLETED`(2404)와
   * `FLAG_STEP`(2405)이 줄 번호 −7이고, 바로 뒤의 `FLAG_POKETCH_HIDDEN`이
   * 우리 표의 2428과 맞는다
   */
  flashActive: 2426,
  defogActive: 2427,
  /** 포켓치를 잠깐 치웠는가 (`FLAG_POKETCH_HIDDEN`) — 연출이 세우고 지운다 */
  poketchHidden: 2428,
  /** 갤럭시단아지트의 호수 삼신을 풀어 줬는가 (`FLAG_FREED_GALACTIC_HQ_POKEMON`) */
  freedGalacticHQ: FLAG_FREED_GALACTIC_HQ,
} as const

/** 레지 셋 (`SPECIES_REGIROCK`·`REGICE`·`REGISTEEL`) */
const LEGENDARY_TITANS = [377, 378, 379] as const

/** `SPECIES_REGIGIGAS`. 유적 셋의 석상이 이 마리의 「운명적 만남」만 본다 */
const SPECIES_REGIGIGAS = 486

/** `BATTLE_RESULT_CAPTURED_MON`. ⚠️ 도망 둘이 이 비트를 **같이 쓴다** */
const BATTLE_RESULT_CAPTURED = 4

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
 * 플래그를 세우고 **첫 쪽도 펼친다** (`Journal_GetSavedPage` + `sub_02053494`) —
 * 받은 그 자리가 노트 첫 줄의 「…에서 시작!」이 된다
 */
on('GiveJournal', (ctx) => {
  ctx.host.vars.setFlag(SYSTEM_FLAG.journalAcquired)
  ctx.host.world.services.journal?.give()
  return false
})

/**
 * 노트에 일 하나를 적는다 (`ScrCmd_CreateJournalEvent`).
 *
 * ⚠️ **인자를 다섯 개 다 읽는다.** 뒤 셋은 원작도 안 쓰지만, 안 읽으면
 * 명령 흐름이 밀려서 다음 명령이 엉뚱한 자리에서 시작한다
 */
on('CreateJournalEvent', (ctx) => {
  const type = ctx.readVar()
  const param = ctx.readVar()
  ctx.readVar()
  ctx.readVar()
  ctx.readVar()
  // 표에 없는 갈래는 원작도 아무것도 안 적고 빠져나간다
  if (!SCRIPT_EVENT_TYPES.includes(type)) return true
  ctx.host.world.services.journal?.event(type, param)
  return true
})

/**
 * 숨은 자리를 열고 닫는다 (`ScrCmd_SetHiddenLocation`).
 *
 * ⚠️ **0/1을 안 적는다.** 원작은 자리마다 정해진 **매직 넘버**를 변수에 넣고
 * 지도가 「그 수와 같은가」를 본다 (`sHiddenLocationMagicNumbers`) — 다른
 * 값이 흘러 들어와도 안 열리게 하는 자물쇠다
 */
on('SetHiddenLocation', (ctx) => {
  const which = ctx.readVar()
  const enable = ctx.readByte()
  if (which < 0 || which >= HIDDEN_LOCATION_COUNT) return false
  ctx.host.vars.set(
    VAR_HIDDEN_LOCATION_FIRST + which,
    enable ? HIDDEN_LOCATION_MAGIC[which] ?? 0 : 0,
  )
  return false
})

// ── 기술 되살리기 · 상장 (PARITY §5) ─────────────────────────────────────────

on('CheckHasLearnableReminderMoves', (ctx) => {
  const dest = ctx.readHalfWord()
  const slot = ctx.readVar()
  ctx.host.vars.set(dest, ctx.host.world.services.reminder?.count(slot) ?? 0)
  return false
})

on('OpenMoveReminderMenu', (ctx) => {
  const slot = ctx.readVar()
  ctx.host.world.services.reminder?.open(slot)
  // ⚠️ **화면이 뜨는 동안 스크립트가 멈춘다** (`ScriptContext_Pause`).
  // 안 멈추면 「배웠니?」를 배우기 전에 묻는다
  return true
})

on('OpenMoveTutorMenu', (ctx) => {
  const slot = ctx.readVar()
  const move = ctx.readVar()
  ctx.host.world.services.reminder?.open(slot, move)
  return true
})

/** `keepOldMove`가 거짓이면 0, 참이면 0xff다 — 원작이 그 두 값을 쓴다 */
const REMINDER_KEPT_OLD = 0xff

on('CheckLearnedReminderMove', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.reminder?.learned() === true ? 0 : REMINDER_KEPT_OLD)
  return false
})

on('CheckLearnedTutorMove', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.reminder?.learned() === true ? 0 : REMINDER_KEPT_OLD)
  return false
})

on('ShowDiplomaSinnoh', (ctx) => {
  ctx.host.world.services.diploma?.show(false)
  return true
})

on('ShowDiplomaNationalDex', (ctx) => {
  ctx.host.world.services.diploma?.show(true)
  return true
})

// ── 명예의 전당 (PARITY §7.11) ───────────────────────────────────────────────

/**
 * 이야기를 끝낸다 (`ScrCmd_ClearGame` → `clear_game.c`).
 *
 * ⚠️ **이 명령 뒤로는 아무것도 안 돈다.** 원작이 장면 끝에서
 * `OS_ResetSystem(RESET_CLEAN)`을 부르므로, 전당 방 스크립트의 남은 네 줄
 * (`ReturnToField`·`FadeScreenIn`·`WaitFadeScreen`·`ReleaseAll`)은 실제로
 * 실행되지 않는다. 우리도 타이틀로 나가면서 이 문맥이 통째로 사라진다
 */
on('ClearGame', (ctx) => {
  // 명예의 전당 한 번이 스코어 35다 (PARITY §7.5)
  ctx.host.world.services.records?.score(SCORE_HALL_OF_FAME_ENTRY)
  ctx.host.world.services.hallOfFame?.clear()
  ctx.pause((c) => c.host.world.services.menuOpen?.() !== true)
  return true
})

/**
 * 우편함에 든 편지 수 (`ScrCmd_CountMailInMailbox`).
 *
 * ⚠️ **PC의 갈래가 이 수로 갈린다** — 0이면 「메일이 없다」로 되돌리고,
 * 하나라도 있어야 화면이 열린다
 */
on('CountMailInMailbox', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.mailbox?.count() ?? 0)
  return false
})

/**
 * 우편함을 연다 (`ScrCmd_1B3`).
 *
 * ⚠️ **디컴프도 이름을 못 붙인 명령이다.** 부르는 자리가 하나뿐이고
 * (`CommonScript_Mailbox`) 바로 앞이 `CountMailInMailbox`라 무엇인지가 정해진다
 */
on('ScrCmd_1B3', (ctx) => {
  ctx.host.world.services.mailbox?.open()
  ctx.pause((c) => c.host.world.services.menuOpen?.() !== true)
  return true
})

/**
 * PC 화면이 켜지고 꺼지는 연출 (`LoadPCAnimation` · `PlayPCBootUpAnimation` ·
 * `PlayPCShutDownAnimation`).
 *
 * ⚠️ **우리는 화면이 하나다.** 원작은 **위 화면**에 PC 모니터를 그려 두고
 * 켜지는 그림을 돌린다 — 아래 화면은 그동안 메뉴다. 원 스크린에서는 그
 * 모니터가 갈 자리가 없어서, 명령을 만들어 **아무 일도 안 하게** 뒀다.
 * 안 만들면 스크립트가 그 자리에서 선다.
 *
 * ⚠️ **인자 한 바이트는 그래도 읽는다** — 안 읽으면 그 바이트를 다음 명령으로
 * 읽어서 스크립트가 통째로 어긋난다
 */
on('LoadPCAnimation', (ctx) => { ctx.readByte(); return false })
on('PlayPCBootUpAnimation', (ctx) => { ctx.readByte(); return false })
on('PlayPCShutDownAnimation', (ctx) => { ctx.readByte(); return false })


// ── 다가오는 트레이너 (PARITY §1.13) ────────────────────────────────────────
//
// 눈이 마주치면 공용 스크립트 3928이 돈다. 그 안에서 이 넷이 쓰인다:
// 어느 갈래인지 묻고 → 누구인지 묻고 → 걷게 하고 → 다 왔는지 기다린다.

/**
 * 다가오는 갈래 (`ScrCmd_GetApproachingTrainerType`).
 *
 * ⚠️ **늘 0번 자리를 본다** — 둘이 와도 갈래는 하나다
 */
on('GetApproachingTrainerType', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.approaching[0]?.type ?? APPROACH_TYPE.singles)
  return false
})

/** 다가오는 사람의 트레이너 번호 (`ScrCmd_GetApproachingTrainerID`) */
on('GetApproachingTrainerID', (ctx) => {
  const slot = ctx.readVar()
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.approaching[slot]?.trainerID ?? 0)
  return false
})

/**
 * 걸어오게 한다 (`ScrCmd_StartApproachingTrainerTask`).
 *
 * ⚠️ **한 칸을 남긴다** — `sightRange − 1`칸만 걷는다. 바로 앞에서 마주쳤으면
 * 아예 안 움직인다. 안 남기면 주인공 칸으로 걸어 들어간다.
 *
 * ⚠️ **주인공은 첫 사람만 돌아본다** (`approachNum == 0 || VS2`) — 둘이 동시에
 * 볼 때 두 번째 사람 쪽으로는 안 돈다
 */
on('StartApproachingTrainerTask', (ctx) => {
  const slot = ctx.readVar()
  const at = ctx.host.world.approaching[slot]
  if (!at) return false
  ctx.host.world.applyMovement(at.localID, approachMovements(at.direction, at.sightRange))
  // 주인공이 돌아본다. 원작은 다 걸어온 뒤에 도는데 우리는 걷는 목록을
  // 걸어 둔 참이라 여기서 돌린다 — 화면에서는 걸어오는 동안 이쪽이 먼저
  // 돌아보는 것으로 보이고, 다 온 뒤에 도는 것과 몇 프레임 차이다
  const player = ctx.host.world.player
  const walker = ctx.host.world.objects(at.localID)
  if (player !== null && walker !== null && (slot === 0 || at.type === APPROACH_TYPE.vs2)) {
    player.dir = dirBetween(player.x, player.z, walker.x, walker.z)
  }
  return false
})

/**
 * 다 왔는가 (`ScrCmd_CheckIsApproachingTrainerTaskDone`).
 *
 * ⚠️ **한 프레임 쉰다**(`return TRUE`) — 원작이 그렇다. 안 쉬면 스크립트가
 * 같은 프레임에서 되물어 영영 돈다
 */
on('CheckIsApproachingTrainerTaskDone', (ctx) => {
  ctx.readVar() // 어느 자리인지. 우리는 움직이는 것이 하나도 없을 때가 「다 왔다」다
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.moving ? 0 : 1)
  return true
})

// ── 시계와 날씨 (PARITY §8.3) ────────────────────────────────────────────────
//
// 시간대는 이미 있고(`GetTimeOfDay`), 여기 셋은 **더 잘게** 묻는 것이다.

/**
 * 오늘 무슨 요일인가 (`ScrCmd_GetDayOfWeek`).
 *
 * ⚠️ **0이 일요일이다** (`RTCDate.week`). 월요일부터 세면 요일마다 다른
 * 사람이 하루씩 밀린다 — 218번도로의 낚시왕과 백화점 특매가 그 표를 쓴다
 */
on('GetDayOfWeek', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.dayOfWeek?.() ?? 0)
  return false
})

/** 지금 몇 시인가 0~23 (`ScrCmd_GetHour`) */
on('GetHour', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.hour?.() ?? 12)
  return false
})

/**
 * 이 맵의 날씨 번호 (`ScrCmd_GetOverworldWeather`).
 *
 * ⚠️ **맵 헤더의 값이 아니라 지금 걸린 값이다** — 원작이 리포트 쪽
 * (`FieldOverworldState`)에 들고 있어서 스크립트가 바꾼 날씨도 여기서 읽힌다.
 * 우리는 아직 스크립트가 날씨를 못 바꾸므로 늘 맵 헤더의 값이다
 */
on('GetOverworldWeather', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, overworldWeather.value)
  return false
})

/**
 * 날씨를 맑음으로 되돌린다 (`ScrCmd_0C3` · `ScrCmd_0C4`).
 *
 * ⚠️ **바꾸는 명령이 이 둘뿐이고 둘이 똑같다.** 디컴프에서 이름조차 안 붙은
 * 명령인데 속은 `FieldOverworldState_SetWeather(…, CLEAR)` 한 줄이다 —
 * 날씨에 **다른 값**을 넣는 스크립트 명령은 원작에 없다. 그래서 「스크립트가
 * 날씨를 갈아 끼운다」는 곧 「맑게 되돌린다」다
 */
for (const name of ['ScrCmd_0C3', 'ScrCmd_0C4']) {
  on(name, () => { clearOverworldWeather(); return false })
}

/**
 * 플래시·안개제거의 표식 (`ScrCmd_DoFlashFunc` · `ScrCmd_DoDefogFunc`).
 *
 * ⚠️ **한 명령이 셋을 겸한다** — 뒤에 오는 바이트가 갈래다
 * (`FIELD_MOVE_FUNC_*`: 0 지우기 · 1 세우기 · **2 묻기**). 묻는 갈래에서만
 * 변수 자리를 한 번 더 읽으므로, 고정으로 읽으면 그 뒤가 통째로 밀린다
 */
function fieldMoveFlag(name: string, flag: number): void {
  on(name, (ctx) => {
    const which = ctx.readByte()
    if (which === 0) ctx.host.vars.clearFlag(flag)
    else if (which === 1) ctx.host.vars.setFlag(flag)
    else ctx.host.vars.set(ctx.readHalfWord(), ctx.host.vars.checkFlag(flag) ? 1 : 0)
    return false
  })
}

fieldMoveFlag('DoFlashFunc', SYSTEM_FLAG.flashActive)
fieldMoveFlag('DoDefogFunc', SYSTEM_FLAG.defogActive)

// ── 도감을 세는 것 (PARITY §6.2) ─────────────────────────────────────────────
//
// 마박사(신오)와 오박사(전국)의 평가, 그리고 상장이 이 수로 갈린다.

/** 신오도감에서 본 수 (`ScrCmd_GetLocalDexSeenCount`) */
on('GetLocalDexSeenCount', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.trainerInfo?.dexCount(false, false) ?? 0)
  return false
})

/** 전국도감에서 본 수 */
on('GetNationalDexSeenCount', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.trainerInfo?.dexCount(true, false) ?? 0)
  return false
})

/** 전국도감에서 잡은 수 */
on('GetNationalDexCaughtCount', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.trainerInfo?.dexCount(true, true) ?? 0)
  return false
})

/**
 * 신오도감이 다 찼는가 (`ScrCmd_CheckLocalDexCompleted`).
 *
 * ⚠️ **신오는 「본 것」으로 센다** — 잡을 필요가 없다. 전국은 반대로 **잡은
 * 것**이라야 한다 (`Pokedex_NationalDexCompleted`)
 */
on('CheckLocalDexCompleted', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.trainerInfo?.dexCompleted(false) === true ? 1 : 0)
  return false
})

on('CheckNationalDexCompleted', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.trainerInfo?.dexCompleted(true) === true ? 1 : 0)
  return false
})

/**
 * 도감이 폼·언어를 세기 시작한다 (`ScrCmd_TurnOnPokedex*Detection`).
 *
 * ⚠️ **켠 뒤에 만난 것부터다.** 그전에 본 개체의 폼은 안 세어진다 — 원작도
 * 비트를 하나 세울 뿐 앞의 기록을 되짚지 않는다
 */
on('TurnOnPokedexFormDetection', (ctx) => {
  ctx.host.world.services.trainerInfo?.turnOnDetection('form')
  return false
})

on('TurnOnPokedexLanguageDetection', (ctx) => {
  ctx.host.world.services.trainerInfo?.turnOnDetection('language')
  return false
})

// ── 낱말 고르기가 여는 것 (PARITY §4.8) ──────────────────────────────────────

/** 어려운 낱말이 다 풀렸는가 (`ScrCmd_CheckAllToughWordsUnlocked`) */
on('CheckAllToughWordsUnlocked', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.easyChat?.allToughUnlocked() === true ? 1 : 0)
  return false
})

/**
 * 어려운 낱말 하나를 풀고 그 글자를 칸에 넣는다
 * (`ScrCmd_TryBufferAndUnlockRandomToughWord`).
 *
 * ⚠️ **다 풀렸으면 −1이다.** 0이 아니라 −1이라 그 사람이 「더 알려 줄 것이
 * 없다」로 닫는다 — 0으로 두면 첫 낱말을 또 알려 준다
 */
on('TryBufferAndUnlockRandomToughWord', (ctx) => {
  const dest = ctx.readHalfWord()
  const slot = ctx.readVar()
  const got = ctx.host.world.services.easyChat?.unlockTough()
  if (got === undefined || got === null) { ctx.host.vars.set(dest, 0xffff); return false }
  ctx.host.vars.set(dest, got.entry)
  ctx.host.world.slots.set(slot, got.text)
  return false
})

/**
 * 고른 낱말을 글 칸에 넣는다 (`ScrCmd_BufferCustomMessageWord`).
 *
 * ⚠️ **낱말 번호는 변수에 들어 있다** — 무엇을 골랐는지는 낱말 고르기 화면이
 * 그 변수에 적어 두고 나간다
 */
on('BufferCustomMessageWord', (ctx) => {
  // ⚠️ **칸 번호도 변수다.** 다른 `Buffer*`는 칸이 한 바이트인데 이것만
  // 둘 다 변수라 4바이트다 — 한 바이트로 읽으면 그 뒤가 통째로 밀린다
  const slot = ctx.readVar()
  const word = ctx.readVar()
  ctx.host.world.slots.set(slot, ctx.host.world.services.easyChat?.wordText(word) ?? '')
  return false
})

// ── 낱개 (PARITY §10 「기타」) ───────────────────────────────────────────────

/**
 * 난수 (`ScrCmd_GetRandom2`).
 *
 * ⚠️ **`GetRandom`과 인자 차례가 뒤바뀌어 있다** — 이쪽이 「담을 곳, 상한」이고
 * 저쪽이 「담을 곳, 상한」으로 같지만 **한 프레임 쉰다**(`return TRUE`).
 * 난수를 쓰는 자리가 같은 프레임에 몰리지 않게 하는 것이다
 */
on('GetRandom2', (ctx) => {
  const dest = ctx.readHalfWord()
  const bound = ctx.readVar()
  ctx.host.vars.set(dest, randMod(bound))
  return true
})

/**
 * 그 도구가 플레이트인가 (`ScrCmd_CheckItemIsPlate`).
 *
 * ⚠️ **번호 범위로 가른다** — 이름이 아니라 불꽃플레이트(303)부터
 * 강철플레이트(319)까지다. 아르세우스의 폼을 정하는 열일곱 장이다
 */
on('CheckItemIsPlate', (ctx) => {
  const item = ctx.readVar()
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, item >= ITEM_FIRST_PLATE && item <= ITEM_LAST_PLATE ? 1 : 0)
  return false
})

/** 방금 있던 맵 (`ScrCmd_GetPreviousMapID`) */
on('GetPreviousMapID', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.previousMap?.() ?? 0)
  return false
})

/**
 * 승강기가 오르내리는 연출 (`ScrCmd_PlayElevatorAnimation`).
 *
 * ⚠️ **우리에게는 그 그림이 없다.** 원작은 위 화면에 층수판을 그려 두고
 * 흐르는 무늬를 돌린다 — 원 스크린에서 갈 자리가 없다. 대신 **인자는 다 읽고**
 * 스크립트를 한 프레임 쉬게 한다(원작도 `return TRUE`다). 안 만들면 그 자리에서 선다
 */
on('PlayElevatorAnimation', (ctx) => {
  ctx.readVar() // 오르는가 내리는가
  ctx.readVar() // 몇 번 돌리는가
  return true
})

/**
 * 지금 층을 알려 주는 작은 창 (`ScrCmd_ShowCurrentFloor`).
 *
 * ⚠️ **인자가 넷이고 마지막 하나는 원작도 안 쓴다** — 창의 왼쪽·위 자리,
 * 고른 답을 담을 변수, 그리고 안 쓰는 변수 하나다
 */
on('ShowCurrentFloor', (ctx) => {
  ctx.readByte() // 창의 왼쪽
  ctx.readByte() // 창의 위
  const dest = ctx.readHalfWord()
  ctx.readVar() // 원작도 안 쓴다
  // 층을 고르는 것이 아니라 보여 주는 창이라 답이 늘 0이다
  ctx.host.vars.set(dest, 0)
  return false
})

/**
 * 아르세우스의 플레이트 열여섯 (`ITEM_FLAME_PLATE`~`ITEM_IRON_PLATE`).
 *
 * ⚠️ **번호는 도구표에서 잰 것이다** — 손으로 적으면 한 칸 밀려도 안 보인다
 */
const ITEM_FIRST_PLATE = 298
const ITEM_LAST_PLATE = 313

/** PC의 「명예의 전당」 (`ScrCmd_OpenPCHallOfFameScreen`) */
on('OpenPCHallOfFameScreen', (ctx) => {
  ctx.host.world.services.hallOfFame?.openPC()
  ctx.pause((c) => c.host.world.services.menuOpen?.() !== true)
  return true
})

/**
 * 여태 몇 번 전당에 들었는가 (`ScrCmd_GetLeagueVictories`).
 *
 * ⚠️ **기록이 깨졌으면 0이다.** 원작이 `LOAD_RESULT_CORRUPT`도 0으로 답한다 —
 * 그래서 처음 이긴 사람과 같은 대사가 나온다
 */
on('GetLeagueVictories', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.hallOfFame?.victories() ?? 0)
  return false
})

/**
 * 기록이 깨졌는가 (`ScrCmd_CheckIsHallOfFameCorrupted`).
 *
 * 우리 리포트는 통째로 검증하고 들이므로 여기까지 깨진 채로 올 수가 없다.
 * 늘 거짓이다 — 값을 안 쓰는 것과 다르다
 */
on('CheckIsHallOfFameCorrupted', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), 0)
  return false
})

// ── 포켓치 (PARITY §7.3) ─────────────────────────────────────────────────────

on('CheckPoketchEnabled', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.poketch?.enabled() === true ? 1 : 0)
  return false
})

on('RegisterPoketchApp', (ctx) => {
  // ⚠️ 인자를 **먼저** 읽는다. `?.`가 인자를 건너뛰면 그 뒤가 통째로 밀린다
  const app = ctx.readVar()
  ctx.host.world.services.poketch?.register(app)
  return false
})

on('CheckPoketchAppRegistered', (ctx) => {
  const app = ctx.readVar()
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.poketch?.has(app) === true ? 1 : 0)
  return false
})

on('BufferPoketchAppName', (ctx) => {
  const slot = ctx.readByte()
  const app = ctx.readVar()
  ctx.host.world.slots.set(slot, ctx.host.world.services.poketch?.appName(app) ?? '')
  return false
})

on('HidePoketch', (ctx) => {
  ctx.host.vars.setFlag(SYSTEM_FLAG.poketchHidden)
  ctx.host.world.services.poketch?.show(false)
  return false
})

on('ShowPoketch', (ctx) => {
  ctx.host.vars.clearFlag(SYSTEM_FLAG.poketchHidden)
  ctx.host.world.services.poketch?.show(true)
  return false
})

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

/**
 * 본 안농 글자 수 (`ScrCmd_GetUnownFormsSeenCount`).
 *
 * 214번도로 매니아터널의 사람이 이 수를 묻는다 — 스물여섯을 다 봐야 비밀방이
 * 열리고, 거기서만 「!」와 「?」가 나온다 (PARITY §6.8)
 */
on('GetUnownFormsSeenCount', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.trainerInfo?.unownFormsSeen() ?? 0)
  return false
})

// ── 화석 (PARITY §4.9) ───────────────────────────────────────────────────────

/** 가방의 화석을 다 센다 (`ScrCmd_GetFossilCount`) */
on('GetFossilCount', (ctx) => {
  const dest = ctx.readHalfWord()
  const bag = ctx.host.world.services.bag
  ctx.host.vars.set(dest, bag === undefined ? 0 : fossilCount((item) => bag.quantity(item)))
  return false
})

/** 그 화석이 무엇이 되는가 (`ScrCmd_GetSpeciesFromFossil`) */
on('GetSpeciesFromFossil', (ctx) => {
  const dest = ctx.readHalfWord()
  const item = ctx.readVar()
  ctx.host.vars.set(dest, speciesFromFossil(item))
  return false
})

/**
 * 목록의 N번째 화석 (`ScrCmd_FindFossilAtThreshold`).
 *
 * ⚠️ **답이 둘이다** — 도구 번호와 표에서의 차례. 원작이 변수 둘을 잇달아
 * 읽으므로 순서를 바꾸면 그 뒤 인자가 통째로 밀린다
 */
on('FindFossilAtThreshold', (ctx) => {
  const destItem = ctx.readHalfWord()
  const destIndex = ctx.readHalfWord()
  const threshold = ctx.readVar()
  const bag = ctx.host.world.services.bag
  const got = bag === undefined
    ? { item: 0, index: 0 }
    : fossilAtThreshold((item) => bag.quantity(item), threshold)
  ctx.host.vars.set(destItem, got.item)
  ctx.host.vars.set(destIndex, got.index)
  return false
})

// ── 갤럭시단아지트의 감금장치 ────────────────────────────────────────────────

/**
 * 통 셋을 세운다 (`LakeGuardianContainmentUnit_InitAnimations`).
 *
 * ⚠️ **이미 풀어 줬으면 열린 채로 세운다.** 원작이 플래그를 보고 여는 애니를
 * 마지막 프레임으로 보내 놓는다 — 안 그러면 풀어 준 뒤 다시 들어왔을 때
 * 통이 도로 닫혀 있다
 */
on('InitLakeGuardianContainmentUnits', (ctx) => {
  const freed = ctx.host.vars.checkFlag(FLAG_FREED_GALACTIC_HQ)
  ctx.host.world.services.lakeGuardianUnits?.init(freed)
  return false
})

/**
 * 푼다 (`LakeGuardianContainmentUnit_Deactivate`).
 *
 * 원작이 필드 태스크를 걸고 **끝날 때까지 스크립트를 세운다**(`return TRUE`).
 * 안 세우면 통이 열리기 전에 삼신이 날아가 버린다
 */
on('DeactivateLakeGuardianContainmentUnits', (ctx) => {
  ctx.host.world.services.lakeGuardianUnits?.open()
  ctx.pause((c) => c.host.world.services.lakeGuardianUnits?.settled() !== false)
  return true
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

/**
 * 전설 조우 (`Encounter_NewVsSpeciesAtLevel`).
 *
 * 표에 없는 것을 스크립트가 직접 세운다 — 기라티나 · 디아루가 · 펄기아 ·
 * 호수의 셋 · 아르세우스가 전부 이 길로 나온다. 곡은 `songs.wildSongFor`가
 * 종족 번호로 고른다
 */
on('StartLegendaryBattle', (ctx) => {
  const species = ctx.readVar()
  const level = ctx.readVar()
  ctx.host.world.services.startScriptedWildBattle?.(species, level)
  ctx.pause((c) => c.host.world.services.battleResult?.() !== null)
  return true
})

/**
 * 스크립트가 세우는 야생 조우 (`ScrCmd_StartWildBattle`).
 *
 * 위와 **마지막 인자 하나만** 다르다 —
 * `Encounter_NewVsSpeciesAtLevel(…, isLegendary)`가 `FALSE`고, 그것이 가르는 것은
 * `BATTLE_STATUS_LEGENDARY`가 켜는 컷인과 곡뿐이다. 우리는 곡을 종족 번호로
 * 고르므로 같은 서비스를 쓴다 (`world.ts`의 `startScriptedWildBattle`).
 *
 * 쓰는 자리는 저장소에 둘뿐이고 그 둘이 곧 못 잡던 두 종이다 —
 * 숲의 양옥집 중서쪽 방의 **로토무**(밤에만)와 209번도로 무덤의 **화강돌**.
 *
 * ⚠️ **없는 동안 살아 있던 해악이 하나 같이 사라진다.** 양옥집 TV에 「예」를
 * 고르면 배틀이 안 돌고 바로 `CheckWonBattle`로 내려갔는데, 그 값은 배틀이
 * 시작될 때만 지워지므로 **직전 배틀의 결과**가 판정에 쓰였다 — 직전이 없거나
 * 졌으면 `BlackOutFromBattle`(전멸), 포획으로 끝났으면 로토무가 없는데
 * `SetFlag 329`(잡았다)가 섰다
 */
on('StartWildBattle', (ctx) => {
  const species = ctx.readVar()
  const level = ctx.readVar()
  ctx.host.world.services.startScriptedWildBattle?.(species, level)
  ctx.pause((c) => c.host.world.services.battleResult?.() !== null)
  return true
})

/**
 * 태그 배틀 (`ScrCmd_StartTagBattle`).
 *
 * ⚠️ **인자 차례가 파트너 먼저다.** 상대 둘이 뒤에 온다 — 바꿔 읽으면
 * 라이벌과 싸우게 된다
 */
on('StartTagBattle', (ctx) => {
  const partner = ctx.readVar()
  const enemy1 = ctx.readVar()
  const enemy2 = ctx.readVar()
  ctx.host.world.services.startTagBattle?.(partner, enemy1, enemy2)
  ctx.pause((c) => c.host.world.services.battleResult?.() !== null)
  return true
})

/**
 * 장애물이 부서지는 연출 (`ScrCmd_StartDestroyObstacleAnimation`).
 *
 * ⚠️ **답 칸을 0으로 두고 시작하는 것이 이 명령의 전부다.** 스크립트는
 * 그 칸이 0인 동안 `WaitTime 1`로 되돌아 돈다(무쇠탄갱 B2F가 그렇다). 안
 * 만들고 건너뛰면 그 칸이 영영 0이라 **무한 고리**가 되고, 실제로 그랬다.
 *
 * 원작은 연출이 도는 **동안에도** 스크립트가 흐르지만(10프레임 뒤 바위를
 * 치운다) 우리는 여기서 선다. 차이는 바위가 사라지는 시점 하나다
 */
on('StartDestroyObstacleAnimation', (ctx) => {
  const kind = ctx.readVar()
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, 0)
  const fx = ctx.host.world.services.breakObstacle
  fx?.start(kind)
  ctx.pause((c) => {
    if (fx !== undefined && !fx.done()) return false
    c.host.vars.set(dest, 1)
    return true
  })
  return true
})

/** 비전기술 컷인 (`HMCutIn_StartTask`) — 파티 자리의 포켓몬이 나와서 쓴다 */
on('PlayHMCutIn', (ctx) => {
  const slot = ctx.readVar()
  const cutIn = ctx.host.world.services.hmCutIn
  cutIn?.start(slot)
  ctx.pause(() => cutIn === undefined || cutIn.done())
  return true
})

/**
 * 도감을 받는다 (`ScrCmd_GivePokedex`).
 *
 * 원작은 도감 구조체의 칸이고 스크립트 플래그(`FLAG_HAS_POKEDEX`)는 따로인데,
 * **둘이 갈리는 자리가 없다** — 전 스크립트 534벌에서 `GivePokedex`가 나오는
 * 곳이 잔모래마을 연구소 한 군데뿐이고 바로 다음 줄이 그 플래그를 세운다.
 * 그래서 같은 비트를 쓴다. 시작 메뉴가 도감 줄을 이 비트로 넣고 뺀다
 */
systemFlag(FLAG_HAS_POKEDEX, { set: 'GivePokedex', check: 'CheckPokedexAcquired' })

/** 도감에 봤다고 적는다 (`FieldSystem_WriteSpeciesSeen`) */
on('SetSpeciesSeen', (ctx) => {
  // ⚠️ **인자를 먼저 읽는다.** `seeSpecies?.(ctx.readVar())`로 쓰면 서비스가
  // 없을 때 `?.`가 오른쪽을 아예 계산하지 않아 읽기 위치가 안 움직인다
  const species = ctx.readVar()
  ctx.host.world.services.seeSpecies?.(species)
  return false
})

/**
 * 어느 판인가 (`ScrCmd_GetGameVersion`).
 *
 * `GAME_VERSION`은 빌드가 정하는 상수다. 우리는 플래티넘이다 —
 * `generated/game_version.txt`에서 다이아 1 · 펄 2 · 플래티넘 3이다
 */
const VERSION_PLATINUM = 3

on('GetGameVersion', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), VERSION_PLATINUM)
  return false
})

/** 지금 서 있는 사람을 숨긴다 (`MapObject_SetHidden`). 배치표는 안 건드린다 */
on('HideObject', (ctx) => {
  const target = ctx.host.world.objects(ctx.readVar())
  if (target) target.visible = false
  return false
})

/**
 * 숨긴 사람을 다시 세운다 (`ScrCmd_ShowObject`). 위의 거울이고, 원작도
 * `MapObjMan_LocalMapObjByIndex` 하나로 같은 자리를 집는다.
 *
 * 쓰는 자리: 글로벌 터미널 · 배틀타워 넷
 */
on('ShowObject', (ctx) => {
  const target = ctx.host.world.objects(ctx.readVar())
  if (target) target.visible = true
  return false
})

/**
 * 그 자리에서 돌아선다 (`ov5_021ECDFC` → `MapObject_TryFace`).
 *
 * `SetObjectEventDir`와 다르다 — 저쪽은 **다음에 세울 때** 먹는 배치표를
 * 고치고, 이쪽은 지금 서 있는 사람을 곧바로 돌린다
 */
on('ScrCmd_18C', (ctx) => {
  const localID = ctx.readVar()
  const dir = ctx.readVar()
  const target = ctx.host.world.objects(localID)
  if (target) target.dir = dir
  return false
})

/** 독으로 쓰러지기 직전 1로 버틴다 (`Pokemon_TrySurvivePoison`) */
on('SurvivePoison', (ctx) => {
  const dest = ctx.readHalfWord()
  const slot = ctx.readVar()
  ctx.host.vars.set(dest, ctx.host.world.services.survivePoison?.(slot) === true ? 1 : 0)
  return false
})

/**
 * 맵 전환이 끝나기를 기다린다 (`FieldTransition_FinishMap`).
 *
 * 독으로 쓰러져 포켓몬센터로 실려 가는 공용 스크립트가 여기서 선다. 우리는
 * 워프가 한 프레임에 끝나므로 기다릴 것이 없다
 */
on('WaitForTransition', () => false)

/** 알을 준다 (`ScrCmd_GiveEgg`). 파티가 가득 차면 원작도 그냥 안 준다 */
on('GiveEgg', (ctx) => {
  const species = ctx.readVar()
  const giver = ctx.readVar()
  ctx.host.world.services.giveEgg?.(species, giver)
  return false
})

on('AddFreeCamera', (ctx) => {
  const x = ctx.readVar()
  const z = ctx.readVar()
  ctx.host.world.services.camera?.free(x, z)
  return false
})

on('RestoreCamera', (ctx) => {
  ctx.host.world.services.camera?.restore()
  return false
})

/**
 * 주인공의 자세 (`PlayerAvatar_TurnOnRequestStateBit` + `RequestChangeState`).
 *
 * 둘이 짝이다 — `SetPlayerState`가 원하는 자세를 적어 두고
 * `ChangePlayerState`가 그때 갈아 끼운다. 연구소에서 포켓몬을 건네줄 때
 * 쓰는 자세(`PLAYER_TRANSITION_HEALING`)가 이것이다.
 *
 * ⚠️ **자세 그림이 아직 없다.** 값을 받아 두기만 한다 — 스크립트가 이 값으로
 * 갈라지는 자리는 없어서 이야기는 그대로 흐르고, 없는 것은 손짓뿐이다
 */
on('SetPlayerState', (ctx) => {
  ctx.host.world.playerState = ctx.readHalfWord()
  return false
})

on('ChangePlayerState', () => false)

// ── 필드 기술과 자전거 ───────────────────────────────────────────────────────
//
// 파도타기·폭포오르기·록클라임은 **길이 둘**이다. 파티 화면의 기술 목록에서
// 고르는 길은 이미 있었고(`fieldMoveFromMenu`), 물이나 벽에 대고 확인을
// 누르면 "쓰겠습니까"를 묻는 길이 이 명령들이다. 둘 다 같은 규칙으로 간다.

for (const [name, id] of [
  ['UseSurf', 'surf'],
  ['UseWaterfall', 'waterfall'],
  ['UseRockClimb', 'rockClimb'],
] as const) {
  on(name, (ctx) => {
    // 인자는 **연출을 어느 쪽으로 낼지**다. 우리는 방향을 주인공에게서 읽으므로
    // 읽고 지나간다 (`FieldTask_StartUseSurf(task, dir, ScriptContext_GetVar(ctx))`)
    ctx.readVar()
    ctx.host.world.services.fieldMoves?.use(id)
    return true
  })
}

/**
 * 괴력을 켜고·끄고·묻는다 (`ScrCmd_DoStrengthFunc`).
 *
 * ⚠️ **갈래마다 인자 수가 다르다.** 묻는 쪽(2)만 답 변수를 하나 더 읽는다 —
 * 늘 읽으면 켜는 자리에서 두 바이트가 어긋난다
 */
on('DoStrengthFunc', (ctx) => {
  const mode = ctx.readByte()
  if (mode === FIELD_MOVE_FUNC.check) {
    const dest = ctx.readHalfWord()
    ctx.host.vars.set(dest, ctx.host.vars.checkFlag(FLAG_STRENGTH_ACTIVE) ? 1 : 0)
    return false
  }
  const on_ = mode === FIELD_MOVE_FUNC.set
  if (on_) ctx.host.vars.setFlag(FLAG_STRENGTH_ACTIVE)
  else ctx.host.vars.clearFlag(FLAG_STRENGTH_ACTIVE)
  ctx.host.world.services.fieldMoves?.strength(on_ ? 'set' : 'clear')
  return false
})

/** `constants/scrcmd.h`의 `FIELD_MOVE_FUNC_*` — 0 끈다 · 1 켠다 · 2 묻는다 */
const FIELD_MOVE_FUNC = { clear: 0, set: 1, check: 2 } as const
/** `generated/vars_flags.txt`의 `FLAG_STRENGTH_ACTIVE` */
const FLAG_STRENGTH_ACTIVE = 2402

on('SetPlayerBike', (ctx) => {
  // ⚠️ **바이트지 변수가 아니다** (`ScriptContext_ReadByte`).
  // ⚠️ **인자를 먼저 읽는다** — `bike?.ride(ctx.readByte())`로 쓰면 서비스가
  // 없을 때 `?.`가 오른쪽을 아예 계산하지 않아 한 바이트가 안 읽히고, 그
  // 뒤가 통째로 밀린다. 실제로 그렇게 써서 다섯 맵이 해독 오류로 섰다
  const on_ = ctx.readByte() === 1
  ctx.host.world.services.bike?.ride(on_)
  return false
})

on('CheckPlayerOnBike', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.bike?.riding() === true ? 1 : 0)
  return false
})

on('ForceBicycling', (ctx) => {
  // 자전거로드 위. 서 있는 동안은 다리에서 못 내린다
  const on_ = ctx.readByte() !== 0
  ctx.host.world.services.bike?.setRoad(on_)
  return false
})

// ── 아직 화면이 없는 것들 ────────────────────────────────────────────────────
//
// 건너뛰기와 다르다. **건너뛰면 스크립트가 영영 도는 자리**라, 끝났다고
// 답해서 이야기를 지나가게 한다. 없는 것은 연출뿐이다.

/**
 * 창기둥이 일그러지는 연출 (`ov6_02243004`).
 *
 * 갈래가 둘이다 — 0이면 시작하고, 1이면 **끝났는가**를 답한다. 스크립트가
 * 그 답이 0인 동안 되돌아 돈다(`SpearPillar_WaitThenWarpToSpearPillarDistorted`).
 * 연출이 없으니 곧바로 끝났다고 답한다
 */
on('ScrCmd_20D', (ctx) => {
  ctx.readByte()
  ctx.host.vars.set(ctx.readHalfWord(), 1)
  return false
})

/**
 * 별명 짓는 화면 (`ScrCmd_OpenPokemonNamingScreen`).
 *
 * ⚠️ **답이 뒤집혀 있다.** 원작 스크립트가 `CallIfNe VAR_0x8002, 1`로 세는 것을
 * 보면 **1이 "안 지었다"**이다 — 지었을 때만 기록을 올린다. 그래서 지으면 0이다.
 *
 * 화면이 없으면 1(안 지었다)로 지나간다. 잔모래마을 연구소가 그 답으로
 * 갈라질 뿐이라 이야기는 그대로 흐른다
 */
on('OpenPokemonNamingScreen', (ctx) => {
  const slot = ctx.readVar()
  const dest = ctx.readHalfWord()
  const naming = ctx.host.world.services.naming
  if (!naming) { ctx.host.vars.set(dest, 1); return false }
  naming.openForParty(slot)
  ctx.pause((c) => {
    const name = naming.named()
    if (name === null) return false
    c.host.vars.set(dest, name === '' ? 1 : 0)
    return true
  })
  return true
})

/** 깨어진 세계로 넘어가는 영상 (`sub_020985E4`). 화면만 없고 워프는 뒤가 한다 */
on('ScrCmd_2FB', () => false)

/** 깨어진 세계 워프 (`FieldSystem_StartDWWarp`) */
on('DoDWWarp', () => false)

/** 소리 장면을 63번으로 (`Sound_SetSceneAndPlayBGM(SOUND_SCENE_SUB_63, …)`) */
on('SetSubScene63', () => false)

// ── 깨어진 세계와 전설 (PARITY §6.10) ────────────────────────────────────────

/**
 * 깨어진 세계의 「맵마다 바뀌는 것」을 연다 (`PersistedMapFeatures_InitForDistortionWorld`).
 *
 * ⚠️ **원작은 여기서 통째로 지운다.** 층마다의 `OnTransition`이 이걸 부르는데
 * `PersistedMapFeatures_InitWithID`가 버퍼를 0으로 밀어 버린다 — 그래서 층을
 * 넘을 때마다 서 있던 판도 카메라 각도 되잡힌다. 우리는 그 칸을 세이브에 따로
 * 두었으므로 지우지 않는다. 지우면 벽에 붙어 있다가 층을 옮긴 순간 떨어진다
 */
on('InitPersistedMapFeaturesForDistortionWorld', () => false)

/** 카메라 각을 0으로 (`DistWorld_ResetPersistedCameraAngles`) */
on('ResetDistortionWorldPersistedCameraAngles', (ctx) => {
  ctx.host.world.services.distortion?.resetCamera()
  return false
})

/**
 * 깨어진 세계에만 있는 사람을 세운다 (`DistWorld_AddMapObjectWithLocalID`).
 *
 * 이 세계의 시로나·태홍·기라티나는 **맵 배치표에 없다.** 층이 이어져 흐르는
 * 세계라 배치표로는 못 세우고, 스크립트와 사건이 번호로 불러다 세운다
 */
on('AddDistortionWorldMapObject', (ctx) => {
  const localID = ctx.readVar()
  ctx.host.world.services.distortion?.addObject(localID)
  return false
})

on('DeleteDistortionWorldMapObject', (ctx) => {
  const localID = ctx.readVar()
  ctx.host.world.services.distortion?.removeObject(localID)
  return false
})

/**
 * 기라티나의 그림자가 지나간다 (`DistWorld_StartGiratinaShadowEvent`).
 *
 * ⚠️ **연출만이다.** 그림자가 날아가는 것 자체는 스크립트의 갈래를 안 바꾸고,
 * 「봤다」는 사실은 바로 뒤의 `SetVar VAR_DISTORTION_WORLD_PROGRESS`가 적는다.
 * 그래서 이 둘이 비어 있어도 이야기는 끝까지 흐른다 — 없는 것은 그림뿐이다
 */
on('StartDistortionWorldGiratinaShadowEvent', (ctx) => {
  ctx.readVar()
  return false
})

on('FinishDistortionWorldGiratinaShadowEvent', () => false)

/** `ScrCmd_2B5` — 깨어진 세계의 이름 없는 연출 하나. 인자 셋을 읽고 지나간다 */
on('ScrCmd_2B5', (ctx) => {
  ctx.readHalfWord(); ctx.readHalfWord(); ctx.readHalfWord()
  return false
})

/** `Dummy1F9` — 원작에서도 빈 명령이다. **인자 한 칸은 있다** */
on('Dummy1F9', (ctx) => {
  ctx.readHalfWord()
  return false
})

/**
 * 오리진폼 기라티나 (`Encounter_NewVsGiratinaOrigin`).
 *
 * 전설 조우와 딱 하나 다르다 — 세우고 나서 모습을 오리진으로 갈아 끼운다
 */
on('StartGiratinaOriginBattle', (ctx) => {
  const species = ctx.readVar()
  const level = ctx.readVar()
  ctx.host.world.services.startGiratinaOriginBattle?.(species, level)
  ctx.pause((c) => c.host.world.services.battleResult?.() !== null)
  return true
})

/** 「운명적인 만남」 조우 (`Encounter_NewFatefulVsSpeciesAtLevel`) — 아르세우스 */
on('StartFatefulEncounter', (ctx) => {
  const species = ctx.readVar()
  const level = ctx.readVar()
  ctx.host.world.services.startFatefulEncounter?.(species, level)
  ctx.pause((c) => c.host.world.services.battleResult?.() !== null)
  return true
})

/**
 * 배틀 결과를 **마스크 그대로** 받는다 (`ScrCmd_GetBattleResult`).
 *
 * `CheckWonBattle`은 이겼나만 답하는데, 기라티나전은 다섯 갈래로 갈린다 —
 * 졌다 · 비겼다 · 내가 달아났다 · 상대가 달아났다 · 잡았다. 그 수가 이것이다
 */
on('GetBattleResult', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.battleMask?.() ?? 0)
  return true
})

/**
 * 못 잡았는가 (`CheckPlayerDidNotCaptureWildMon`).
 *
 * ⚠️ **「잡았다」 하나만 거짓이다.** 달아난 판(포획|승)도 상대가 달아난 판도
 * 참이다 — 값이 겹쳐 있어서 비트로 보면 안 되고 수 전체를 견줘야 한다
 */
on('CheckDidNotCapture', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.battleMask?.() === BATTLE_RESULT_CAPTURED ? 0 : 1)
  return true
})

/** 명예의 전당에 들어가 봤는가 (`FLAG_GAME_COMPLETED`) */
on('CheckGameCompleted', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.vars.checkFlag(SYSTEM_FLAG.gameCompleted) ? 1 : 0)
  return false
})

on('SetGameCompleted', (ctx) => {
  ctx.host.vars.setFlag(SYSTEM_FLAG.gameCompleted)
  return false
})

/**
 * 레지 셋이 파티에 다 있는가 (`HasAllLegendaryTitansInParty`).
 *
 * 눈덮인신전 지하 5층의 레지기가스가 이걸 본다. 셋이 다 있어야 깨어난다
 */
on('CheckHasAllLegendaryTitansInParty', (ctx) => {
  const party = ctx.host.world.services.party
  const all = LEGENDARY_TITANS.every((s) => party?.hasSpecies(s) === true)
  ctx.host.vars.set(ctx.readHalfWord(), all ? 1 : 0)
  return false
})

/**
 * 파티에 **운명적 만남** 레지기가스가 있는가
 * (`ScrCmd_CheckPartyHasFatefulEncounterRegigigas`).
 *
 * 유적 셋의 석상이 이것만 본다 — 이 답이 거짓이면 레지락·레지아이스·레지스틸이
 * 한 마리도 안 나온다.
 *
 * ⚠️ **눈설신전에서 잡은 레지기가스로는 안 열린다.** 그쪽은
 * `StartLegendaryBattle`로 나와서 운명적 만남 표시가 안 붙는다 — 원작이 그렇고,
 * 그래서 원작에서 이 문을 여는 길은 배포 한 가지뿐이었다 (SIWON.md §1).
 * 알은 건너뛴다 — `findFateful`이 원작대로 먼저 거른다
 */
on('CheckPartyHasFatefulEncounterRegigigas', (ctx) => {
  const dest = ctx.readHalfWord()
  const slot = ctx.host.world.services.party?.findFateful(SPECIES_REGIGIGAS) ?? FIND_SLOT_NONE
  ctx.host.vars.set(dest, slot === FIND_SLOT_NONE ? 0 : 1)
  return false
})

/**
 * 배포 이벤트를 받았는가 (`SystemVars_CheckDistributionEvent`).
 *
 * ⚠️ **변수에 「마법의 수」가 들어 있어야 한다.** 0이나 1이 아니라 이벤트마다
 * 다른 상수다 — 다크라이 0x1209 · 쉐이미 0x1112 · 아르세우스 0x1123 ·
 * 로토무 0x1103. 배포를 받지 않고는 열 수 없는 자리라는 뜻이고, 우리도
 * 지어내지 않는다 — 신월도·꽃의낙원·하늘의피리는 그래서 잠겨 있다
 */
on('CheckDistributionEvent', (ctx) => {
  const event = ctx.readByte()
  const dest = ctx.readHalfWord()
  const magic = DISTRIBUTION_MAGIC[event]
  const got = magic !== undefined
    && ctx.host.vars.get(VAR_DISTRIBUTION_EVENT_FIRST + event) === magic
  ctx.host.vars.set(dest, got ? 1 : 0)
  return false
})

/** 주인공의 세 좌표 (`ScrCmd_GetPlayer3DPos`). ⚠️ y는 **반 타일 단위라 2로 나눈다** */
on('GetPlayer3DPos', (ctx) => {
  const dx = ctx.readHalfWord()
  const dy = ctx.readHalfWord()
  const dz = ctx.readHalfWord()
  const at = ctx.host.world.services.playerPos?.()
  ctx.host.vars.set(dx, at?.x ?? 0)
  ctx.host.vars.set(dy, at?.y ?? 0)
  ctx.host.vars.set(dz, at?.z ?? 0)
  return false
})

/**
 * 귀혼동굴의 다음 방을 정한다 (`ScrCmd_InitTurnbackCave`).
 *
 * 방이 **무작위로 이어진다.** 기둥을 셋 다 보면 기라티나 방, 서른 방을 돌면
 * 입구, 아니면 지금 본 기둥 수에 맞는 여섯 방 중 하나로 간다.
 *
 * ⚠️ **들어온 문만 빼고 나머지 셋을 전부 같은 곳으로 돌린다.** 어느 문으로
 * 나가든 같은 방이다 — 길을 고르는 것이 아니라 굴리는 것이라는 뜻이다
 */
on('InitTurnbackCave', (ctx) => {
  const pillarsSeen = ctx.readVar()
  const roomsVisited = ctx.readVar()
  ctx.host.world.services.turnbackCave?.(pillarsSeen, roomsVisited)
  return false
})

/** 전설을 만나기 전에 그 모습을 창에 띄운다 (`ScrCmd_DrawPokemonPreview`) */
on('DrawPokemonPreview', (ctx) => {
  const species = ctx.readVar()
  const gender = ctx.readVar()
  ctx.host.world.services.preview?.draw(species, gender)
  // 원작도 여기서 도감에 「봤다」를 적는다 (`FieldSystem_WriteSpeciesSeen`)
  ctx.host.world.services.seeSpecies?.(species)
  return false
})

/**
 * 파티의 한 마리를 창에 띄운다 (`ScrCmd_DrawPokemonPreviewFromPartySlot`).
 *
 * ⚠️ **성별은 그 개체의 것이다.** 위의 것은 스크립트가 성별을 주는데 이쪽은
 * 개체에서 읽는다 — 서비스가 성별을 모르므로 없음(2)으로 두고 종족만 준다
 */
on('DrawPokemonPreviewFromPartySlot', (ctx) => {
  const at = ctx.readVar()
  const species = ctx.host.world.services.party?.species(at) ?? 0
  ctx.host.world.services.preview?.draw(species, GENDER_NONE)
  ctx.host.world.services.seeSpecies?.(species)
  return false
})

/** `constants/pokemon.h`의 `GENDER_NONE` */
const GENDER_NONE = 2

on('RemovePokemonPreview', (ctx) => {
  ctx.host.world.services.preview?.remove()
  return false
})

/**
 * 사람이 깜빡인다 · 흔들린다 (`MapObject_Flicker` · `MapObject_Shake`).
 *
 * ⚠️ **연출뿐이라 값을 읽고 지나간다.** 원작은 애니메이션이 끝날 때까지 서
 * 있는데, 우리가 안 서도 스크립트의 갈래는 안 바뀐다 — 없는 것은 흔들림 하나다
 */
on('FlickerObject', (ctx) => {
  ctx.readVar(); ctx.readVar(); ctx.readVar()
  return false
})

on('ShakeObject', (ctx) => {
  ctx.readVar(); ctx.readVar(); ctx.readVar(); ctx.readVar(); ctx.readVar()
  return false
})

// ── 맵마다 움직이는 장치 (PARITY §7.12) ──────────────────────────────────────
//
// 원작이 맵에 들어설 때 「이 맵에는 이런 장치가 있다」를 못 박고
// (`InitPersistedMapFeaturesForX`), 그 뒤로 통행 판정과 프레임 갱신이 그
// 갈래로 간다 (`dynamic_map_features.c`). 갈래는 열하나인데 그중 여덟이
// 길을 막는 자리다.

/**
 * 승강판이 있는 맵이다 (`PersistedMapFeatures_InitForPlatformLift`).
 *
 * ⚠️ **어느 층에 서 있는지를 들어온 z가 정한다.** 아래층 문의 z로 들어왔으면
 * 아래층이고 아니면 위층이다 — 그래서 세이브에 층을 적을 필요가 없고, 저장했다
 * 다시 켜도 선 자리에서 다시 계산되어 맞는다
 */
on('InitPersistedMapFeaturesForPlatformLift', (ctx) => {
  ctx.host.world.services.mapFeatures?.initPlatformLift()
  return false
})

/**
 * 판을 움직인다 (`PlatformLift_Trigger`).
 *
 * ⚠️ **이게 없으면 게임을 못 끝낸다.** 사천왕 넷과 챔피언에게 올라가는 길이
 * 이 판뿐이고, 챔피언을 이긴 뒤 명예의 전당으로 가는 것도 같은 판이다.
 * 다 올라갈 때까지 스크립트가 선다 — 원작도 필드 태스크가 끝나야 다음 줄로 간다
 */
on('TriggerPlatformLift', (ctx) => {
  const moved = ctx.host.world.services.mapFeatures?.triggerPlatformLift() === true
  if (!moved) return false
  ctx.pause((c) => c.host.world.services.mapFeatures?.platformLiftBusy() !== true)
  return true
})

/**
 * 들어올 때 판이 아직 아래에 있었는가 (`PlatformLift_WasNotUsedWhenEnteredMap`).
 *
 * 리그의 다섯은 **한 번 오르면 안 내려온다.** 위층 문으로 들어오면 이 값이
 * 거짓이 되고, 스크립트가 그것을 보고 판 칸의 좌표 트리거를 꺼 버린다 —
 * 안 그러면 내려서자마자 그 자리에서 다시 탄다
 */
on('CheckPlatformLiftNotUsedWhenEnteredMap', (ctx) => {
  const at = ctx.readHalfWord()
  const notUsed = ctx.host.world.services.mapFeatures?.platformLiftNotUsedWhenEnteredMap() ?? true
  ctx.host.vars.set(at, notUsed ? 1 : 0)
  return false
})

/**
 * 물가시티 체육관이다 (`PersistedMapFeatures_InitForPastoriaGym`).
 *
 * ⚠️ **들어설 때마다 물이 낮은 데서 다시 시작한다.** 원작이 이 자리를 통째로
 * 0으로 지우고, 그 0이 주황 단추다 — 나갔다 들어오면 풀던 것이 처음으로 돌아간다
 */
on('InitPersistedMapFeaturesForPastoriaGym', (ctx) => {
  ctx.host.world.services.mapFeatures?.initPastoriaGym()
  return false
})

/**
 * 단추를 밟았다 (`PastoriaGym_PressButton`).
 *
 * ⚠️ **어느 단추인지는 인자가 아니라 밟은 칸이 말한다.** 스크립트는 셋으로
 * 나뉘어 있는데 명령은 하나다 — 원작이 선 칸에 놓인 소품 모델을 보고 고른다
 * (`FieldSystem_FindCollidingLoadedMapPropByModelIDs`). 물이 다 움직일 때까지
 * 스크립트가 선다
 */
on('PressPastoriaGymButton', (ctx) => {
  const moved = ctx.host.world.services.mapFeatures?.pressPastoriaButton() === true
  if (!moved) return false
  ctx.pause((c) => c.host.world.services.mapFeatures?.pastoriaBusy() !== true)
  return true
})

/**
 * 선단시티 체육관이다 (`PersistedMapFeatures_InitForSunyshoreGym`).
 *
 * ⚠️ **처음 회전 상태가 방마다 다르고 들어온 문이 그것을 뒤집는다.** 앞 방에서
 * 걸어 들어오면 0이고, 뒤에서 돌아오면 방마다 2·1·0으로 선다 — 되돌아 나가는
 * 길이 그때 열려 있어야 하기 때문이다
 */
on('InitPersistedMapFeaturesForSunyshoreGym', (ctx) => {
  const room = ctx.readByte()
  ctx.host.world.services.mapFeatures?.initSunyshoreGym(room)
  return false
})

/**
 * 톱니를 돌린다 (`SunyshoreGym_PressButton`).
 *
 * 단추가 셋이다 — 보통(+1) · 거꾸로(−1) · 두 배(+2).
 * ⚠️ **회전 상태는 누르는 순간 바뀐다.** 톱니가 다 돌기를 안 기다린다
 */
on('PressSunyshoreGymButton', (ctx) => {
  const button = ctx.readByte()
  const turned = ctx.host.world.services.mapFeatures?.pressSunyshoreButton(button) === true
  if (!turned) return false
  ctx.pause((c) => c.host.world.services.mapFeatures?.sunyshoreBusy() !== true)
  return true
})

/**
 * 영원시티 체육관이다 (`PersistedMapFeatures_InitForEternaGym`).
 *
 * ⚠️ **시계 상태만 리포트에 남는다.** 다른 체육관 장치는 나가면 처음으로
 * 돌아가는데 이것만 변수에 따로 적힌다 — 트레이너를 이긴 것을 되돌릴 수는 없다
 */
on('InitPersistedMapFeaturesForEternaGym', (ctx) => {
  ctx.host.world.services.mapFeatures?.initEternaGym(
    ctx.host.vars.get(VAR_ETERNA_GYM_FLOWER_CLOCK_STATE))
  return false
})

/**
 * 꽃시계를 한 칸 넘긴다 (`EternaGym_AdvanceClockState`).
 *
 * 트레이너 셋과 관장을 이길 때마다 한 번씩, 모두 다섯 상태다. 바늘이 돌면
 * 시계 판의 통행이 통째로 갈린다 — 그것이 이 방의 길이다.
 *
 * ⚠️ **통행은 즉시 바뀌고 바늘만 미끄러진다.** 원작도 태스크를 걸기 **전에**
 * 상태를 올린다
 */
on('AdvanceEternaGymClock', (ctx) => {
  const next = ctx.host.world.services.mapFeatures?.advanceEternaClock() ?? null
  if (next === null) return false
  ctx.host.vars.set(VAR_ETERNA_GYM_FLOWER_CLOCK_STATE, next)
  ctx.pause((c) => c.host.world.services.mapFeatures?.eternaBusy() !== true)
  return true
})

/**
 * 운하시티 체육관이다 (`PersistedMapFeatures_InitForCanalaveGym`).
 *
 * 스크립트가 하는 일은 이 한 줄뿐이다 — 판을 움직이는 것은 명령이 아니라
 * **걸음**이다 (`Field_ProcessStep`이 한 걸음마다 묻는다)
 */
on('InitPersistedMapFeaturesForCanalaveGym', (ctx) => {
  ctx.host.world.services.mapFeatures?.initCanalaveGym()
  return false
})

/**
 * 장막시티 체육관이다 (`PersistedMapFeatures_InitForVeilstoneGym`).
 *
 * 여기도 스크립트가 하는 일은 이 한 줄뿐이다 — 샌드백을 차는 것은 명령이
 * 아니라 **A**다 (`field_control.c`가 말 걸기보다 먼저 묻는다)
 */
on('InitPersistedMapFeaturesForVeilstoneGym', (ctx) => {
  ctx.host.world.services.mapFeatures?.initVeilstoneGym()
  return false
})

/**
 * 연고시티 체육관이다 (`PersistedMapFeatures_InitForHearthomeGym`).
 *
 * 문 고르기 방 둘에서는 여기서 **틀린 문들의 목적지를 입구 방으로 돌려놓는다** —
 * 문을 잠그는 것이 아니라 그 너머를 바꾼다. 입구 방·관장 방에서는 아무 일도 없다
 */
on('InitPersistedMapFeaturesForHearthomeGym', (ctx) => {
  ctx.host.world.services.mapFeatures?.initHearthomeGym()
  return false
})

// ── 승강기 (PARITY §7.12) ────────────────────────────────────────────────────
//
// ⚠️ **길을 막지는 않는다.** 층을 고르는 목록도 워프도 스크립트에 통째로
// 적혀 있어서 이 넷이 없어도 승강기는 돈다 — 없으면 「지금 몇 층인가」가
// 안 뜰 뿐이다.

/**
 * 승강기를 타기 전의 자리를 적어 둔다 (`FieldOverworldState_SetSpecialLocation`).
 *
 * 승강기 방은 층마다 따로 있지 않고 하나를 돌려 쓴다 — 어느 층에서 탔는지를
 * 아는 길이 이 값뿐이다
 */
on('SetSpecialLocation', (ctx) => {
  const map = ctx.readVar()
  ctx.readVar(); ctx.readVar(); ctx.readVar(); ctx.readVar()
  specialLocation = map
  return false
})

/** `FieldOverworldState_GetSpecialLocation`의 맵 번호만. 리포트에는 안 남는다 */
let specialLocation = -1

on('GetFloorsAbove', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), floorsAbove(specialLocation))
  return false
})

/**
 * 층 이름을 글 칸에 넣는다 (`StringTemplate_SetFloorNumber`).
 *
 * ⚠️ **0이 지하다.** 원작이 `floor == 0`만 따로 갈라 B1F로 보낸다
 */
on('BufferFloorNumber', (ctx) => {
  const slot = ctx.readByte()
  const floor = ctx.readByte()
  // 목록 메뉴가 이미 그 뱅크를 들고 있다 (`TEXT_BANK_MENU_ENTRIES`) — 층 이름이
  // 「5F」·「B1F」로 그 안에 있고, 승강기 메뉴가 쓰는 바로 그 글이다
  ctx.host.world.slots.set(
    slot, ctx.host.world.menuEntryTexts[floorTextIndex(floor)] ?? '')
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
    // 값에 달린 여벌 인자. 재는 규칙은 `context`가 혼자 든다 —
    // 감사 도구도 같은 함수를 쓴다 (`operandWidth`)
    for (const size of widths(extraArgs(cmd, values))) read(ctx, size)
    return false
  }
}

const widths = (spec: ScriptCommand['args']): number[] =>
  argWidths(spec).map((a) => a.size)

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

// ── 폼 (PARITY §3.4) ─────────────────────────────────────────────────────────
//
// 폼을 실제로 갈아입히는 곳은 씬 서비스다 (`fieldServices`). 여기서는 인자
// 차례만 원작과 맞추는데, 그 차례가 명령마다 다르다 — `GetPartyMonForm`은
// **자리 먼저 답 나중**이고 `GetRotomFormsInSave`는 답이 다섯 개다.

on('GetPartyMonForm', (ctx) => {
  const slot = ctx.readVar()
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.party?.form(slot) ?? 0)
  return false
})

// 깨어진 세계 쪽이 쓰는 같은 명령. 오버레이가 달라 번호가 둘이다
on('GetPartyMonForm2', (ctx) => {
  const slot = ctx.readVar()
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.party?.form(slot) ?? 0)
  return false
})

/**
 * 파티의 기라티나를 한꺼번에 (`ScrCmd_SetPartyGiratinaForm`).
 *
 * 0이 아니면 **무조건 오리진**이다 — 깨어진 세계가 그렇게 부른다. 0이면 백금옥을
 * 보고 정한다
 */
on('SetPartyGiratinaForm', (ctx) => {
  const form = ctx.readVar()
  ctx.host.world.services.party?.giratinaForm(form !== 0)
  return false
})

/**
 * 로토무를 가전에 넣는다 (`ScrCmd_SetRotomForm`).
 *
 * ⚠️ 인자가 넷인데 **셋째는 안 쓴다.** 원작도 읽기만 하고 버린다 — 그래도
 * 읽어야 넷째(폼)가 제자리에서 읽힌다
 */
on('SetRotomForm', (ctx) => {
  const slot = ctx.readVar()
  const moveSlot = ctx.readVar()
  ctx.readVar()
  const form = ctx.readVar()
  ctx.host.world.services.party?.setForm(slot, form, moveSlot)
  return false
})

/** 테오키스는 그 자리의 유성이 폼을 정한다 (`ScrCmd_ChangeDeoxysForm`) */
on('ChangeDeoxysForm', (ctx) => {
  const form = ctx.readVar()
  const party = ctx.host.world.services.party
  if (party) {
    for (let slot = 0; slot < party.count(); slot++) {
      if (party.species(slot) === SPECIES_DEOXYS) party.setForm(slot, form)
    }
  }
  return false
})

/** 파티에 로토무가 몇 마리고 첫 자리가 어디인가 */
on('GetPartyRotomCountAndFirst', (ctx) => {
  const countVar = ctx.readHalfWord()
  const slotVar = ctx.readHalfWord()
  const got = ctx.host.world.services.party?.rotomCount() ?? { count: 0, first: 0xff }
  ctx.host.vars.set(countVar, got.count)
  ctx.host.vars.set(slotVar, got.first)
  return false
})

/**
 * 리포트에 어느 가전을 써 본 로토무가 있는가.
 *
 * 답이 다섯 개고 차례가 히트·워시·프로스트·팬·모우다 — 그 차례가 폼 번호와
 * 같아서 비트를 그대로 편다
 */
on('GetRotomFormsInSave', (ctx) => {
  const dest = [
    ctx.readHalfWord(), ctx.readHalfWord(), ctx.readHalfWord(),
    ctx.readHalfWord(), ctx.readHalfWord(),
  ]
  const bits = ctx.host.world.services.party?.rotomForms() ?? 0
  dest.forEach((at, i) => { ctx.host.vars.set(at, (bits >> (i + 1)) & 1) })
  return false
})

/**
 * 폼이 바뀐 마리를 전부 되돌린다 (통신에 나가기 전에).
 *
 * ⚠️ 답이 0xFF면 **가방에 백금옥 자리가 없다**는 뜻이고, 그때는 아무것도 안
 * 바뀐다. 스크립트가 그 값으로 「가방이 가득 찼다」 쪽으로 갈라진다
 */
on('TryRevertPartyPokemonForms', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.party?.revertForms() ?? 0)
  return false
})

on('TryRevertPokemonForm', (ctx) => {
  const slot = ctx.readVar()
  const dest = ctx.readHalfWord()
  // 0xff는 "그런 자리 없음"이다 — 원작도 그때는 아무것도 안 한다
  const got = slot === 0xff ? 0 : ctx.host.world.services.party?.revertForms(slot) ?? 0
  ctx.host.vars.set(dest, got)
  return false
})

// ── 가방에서 고르기 ─────────────────────────────────────────────────────────

/**
 * 가방을 열어 하나 고르게 한다 (`ScrCmd_OpenBag`).
 *
 * ⚠️ **인자가 주머니 번호가 아니다.** 0이면 도구 주머니고 **그 밖은 전부**
 * 열매 주머니다 (`if (ReadByte(ctx) == 0) v1 = 0; else v1 = 1;`).
 *
 * ⚠️ **화면이 닫힐 때까지 선다** (`ScriptContext_WaitForApplicationExit`).
 * 안 세우면 고르기도 전에 `GetSelectedItem`이 옛 값을 읽는다
 */
on('OpenBag', (ctx) => {
  const mode = ctx.readByte()
  ctx.host.world.services.chooseItem?.open(mode === 0 ? POCKET_ITEMS : POCKET_BERRIES)
  ctx.pause((c) => c.host.world.services.menuOpen?.() !== true)
  return true
})

/** 방금 고른 도구 (`ScrCmd_GetSelectedItem`). 0이면 안 고르고 나갔다 */
on('GetSelectedItem', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.world.services.chooseItem?.picked() ?? 0)
  return false
})

/** `POCKET_ITEMS` · `POCKET_BERRIES` */
const POCKET_ITEMS = 0
const POCKET_BERRIES = 4

// ── 나무열매 밭 118 (PARITY §4.6) ────────────────────────────────────────────

/**
 * 지금 손댄 밭의 번호 (`MapObject_GetDataAt(mapObject, 0)`).
 *
 * ⚠️ **스크립트가 안 준다.** 밭 아홉 자리 전부가 인자 없이 「이 밭」을 말하고,
 * 원작은 말을 건 객체의 `data[0]`을 쓴다 — 배치표의 `raw[7]`이 그 자리다.
 * 밭 객체 118개가 0~117을 하나씩 들고 있고 겹치지 않는다
 */
function berryPatchId(ctx: ScriptContext): number {
  return ctx.host.world.target?.params?.[0] ?? 0
}

/** 지금 자란 정도 (`ScrCmd_GetBerryGrowthStage`). 0이면 빈 흙이다 */
on('GetBerryGrowthStage', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.berryPatches?.growthStage(berryPatchId(ctx)) ?? 0)
  return false
})

/** 심긴 열매의 도구 번호 (`ScrCmd_GetBerryItemID`) */
on('GetBerryItemID', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.berryPatches?.berryItem(berryPatchId(ctx)) ?? 0)
  return false
})

/** 뿌려 둔 비료의 도구 번호 (`ScrCmd_GetBerryMulchType`). **종류가 아니라 도구 번호다** */
on('GetBerryMulchType', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.berryPatches?.mulchItem(berryPatchId(ctx)) ?? 0)
  return false
})

/** 흙이 얼마나 말랐는가 (`ScrCmd_GetBerryMoisture`). 0 바싹 · 1 마름 · 2 촉촉 */
on('GetBerryMoisture', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.berryPatches?.moisture(berryPatchId(ctx)) ?? 0)
  return false
})

/** 열려 있는 개수 (`ScrCmd_GetBerryYield`). 스크립트가 이걸로 단수·복수를 가른다 */
on('GetBerryYield', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.berryPatches?.yield(berryPatchId(ctx)) ?? 0)
  return false
})

/** 비료를 뿌린다 (`ScrCmd_SetBerryMulch`). 도구를 빼는 것은 스크립트가 먼저 했다 */
on('SetBerryMulch', (ctx) => {
  const item = ctx.readVar()
  ctx.host.world.services.berryPatches?.setMulch(berryPatchId(ctx), item)
  return false
})

/** 심는다 (`ScrCmd_PlantBerry`) */
on('PlantBerry', (ctx) => {
  const item = ctx.readVar()
  ctx.host.world.services.berryPatches?.plant(berryPatchId(ctx), item)
  return false
})

/**
 * 물뿌리개를 들고 벗는다 (`ScrCmd_SetBerryWateringState`).
 *
 * ⚠️ **인자가 변수가 아니라 상수다** — `ScriptContext_ReadHalfWord`다. 0이 들기,
 * 1이 벗기.
 *
 * ⚠️ **한 프레임 쉰다** (`return TRUE`). 물 주는 일이 스크립트와 **나란히** 도는
 * 태스크라, 여기서 안 쉬면 아래의 「참 좋아하네」가 물보다 먼저 뜬다
 */
on('SetBerryWateringState', (ctx) => {
  const state = ctx.readHalfWord()
  ctx.host.world.services.berryPatches?.water(state === 0)
  return true
})

/**
 * 딴다 (`ScrCmd_HarvestBerry`).
 *
 * ⚠️ **가방이 찼는지는 안 본다.** 스크립트가 `GoToIfCannotFitItem`으로 먼저
 * 갈라 놓았기에 여기까지 왔으면 들어간다
 */
on('HarvestBerry', (ctx) => {
  ctx.host.world.services.berryPatches?.harvest(berryPatchId(ctx))
  return false
})

/**
 * 나무열매의 이름을 글 칸에 넣는다 (`ScrCmd_BufferBerryName`).
 *
 * ⚠️ **도구 이름이 아니다** — 「체리열매」가 아니라 「체리」다. 싹·자람·꽃 단계의
 * 대사가 이 이름을 쓴다.
 *
 * ⚠️ **인자가 셋인데 마지막은 원작도 안 쓴다** — 값을 읽어 버리기는 해야 한다
 */
on('BufferBerryName', (ctx) => {
  const slot = ctx.readByte()
  const item = ctx.readVar()
  ctx.readVar() // 원작도 `unused`로만 받는다
  ctx.host.world.slots.set(slot, ctx.host.world.services.labels?.berry(item) ?? '')
  return false
})

// ── 대습초원 사파리 (PARITY §7.7) ────────────────────────────────────────────

/**
 * 놀이를 시작하거나 끝낸다 (`ScrCmd_StartEndSafariGame`).
 *
 * ⚠️ **인자가 변수가 아니라 상수다** — 0이 시작, 1이 끝이다
 * (`SAFARI_GAME_ACTIVE` · `SAFARI_GAME_INACTIVE`).
 *
 * ⚠️ **끝낼 때 볼을 0으로 지운다.** 남은 볼을 들고 나가지 못한다 — 원작이
 * 두 칸을 다 0으로 밀어 놓는다
 */
on('StartEndSafariGame', (ctx) => {
  // ⚠️ 인자를 **먼저** 읽는다. `safari?.setActive(ctx.readByte())`로 쓰면 놀이가
  // 안 붙어 있을 때 `?.`가 인자까지 건너뛰어 1바이트가 안 읽히고 그 뒤가 밀린다
  const state = ctx.readByte()
  ctx.host.world.services.safari?.setActive(state === SAFARI_GAME_ACTIVE)
  return false
})

/** `SAFARI_GAME_ACTIVE` · `SAFARI_GAME_INACTIVE` (`constants/scrcmd.h`) */
const SAFARI_GAME_ACTIVE = 0

/** 이번 판에 잡은 마리 (`ScrCmd_GetCurrentSafariGameCaughtNum`) */
on('GetCurrentSafariGameCaughtNum', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.safari?.caught() ?? 0)
  return false
})

/**
 * 습초원 열차를 세운다 (`ScrCmd_InitGreatMarshTram`).
 *
 * ⚠️ **이미 세워져 있으면 자리를 안 건드린다.** 원작이 갈래 번호를 먼저 보고
 * 다르면 그때만 5·6구역으로 놓는다 — 매번 놓으면 열차가 맵에 들어설 때마다
 * 제자리로 되돌아간다
 */
on('InitGreatMarshTram', (ctx) => {
  ctx.host.world.services.safari?.initTram()
  return false
})

/**
 * 열차를 그 자리로 보낸다 (`ScrCmd_MoveGreatMarshTram`).
 *
 * ⚠️ **첫 인자가 변수고 둘째가 상수다.** 목적지는 변수에서 읽고 움직임 갈래는
 * 스크립트에 박혀 있다 — 부르는 쪽이 「타고 간다」와 「불러온다」로 갈린다.
 *
 * 도착할 때까지 스크립트가 선다 (`return TRUE`)
 */
on('MoveGreatMarshTram', (ctx) => {
  const to = ctx.readVar()
  const movement = ctx.readHalfWord()
  ctx.host.world.services.safari?.moveTram(to, movement)
  ctx.pause((c) => c.host.world.services.safari?.tramSettled() !== false)
  return true
})

/** 열차가 그 자리에 서 있는가 (`ScrCmd_CheckGreatMarshTramLocation`). 1이 「있다」 */
on('CheckGreatMarshTramLocation', (ctx) => {
  const location = ctx.readHalfWord()
  const dest = ctx.readHalfWord()
  ctx.host.vars.set(dest, ctx.host.world.services.safari?.tramAt(location) === true ? 1 : 0)
  return false
})


// ── 상호교류광장 (PARITY §7.8) ───────────────────────────────────────────────────

/** 걸음을 0으로 지운다 (`ScrCmd_ClearAmitySquareStepCount`). 들어갈 때 돈다 */
on('ClearAmitySquareStepCount', (ctx) => {
  ctx.host.vars.set(VAR_AMITY_STEPS, 0)
  return false
})

/** 지금까지 걸은 걸음 (`ScrCmd_GetAmitySquareStepCount`) */
on('GetAmitySquareStepCount', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), ctx.host.vars.get(VAR_AMITY_STEPS))
  return false
})

/**
 * 따라다니는 마리가 주워 온 장식 (`ScrCmd_CalcAmitySquareFoundAccessory`).
 *
 * ⚠️ **답이 먼저고 종족이 나중이다** — 원작이 변수 둘을 그 차례로 읽는다.
 *
 * ⚠️ **표에 없는 종은 0번 무리를 쓴다.** 상호교류광장에 못 들어가는 종이 여기 오면
 * 불꽃숭이의 표가 나온다 — 원작의 `default`가 그렇다
 */
on('CalcAmitySquareFoundAccessory', (ctx) => {
  const dest = ctx.readHalfWord()
  const species = ctx.readVar()
  ctx.host.vars.set(dest, amityFound(species, randMod(100)))
  return false
})

/** 아저씨가 무엇을 줄지 뽑는다 (`ScrCmd_CalcAmitySquareBerryAndAccessoryManOptionID`) */
on('CalcAmitySquareBerryAndAccessoryManOptionID', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), randMod(AMITY_GIFT_COUNT))
  return false
})

/** 그 선물이 장식인가 (`ScrCmd_CheckAmitySquareManGiftIsAccessory`). 앞의 아홉이 열매다 */
on('CheckAmitySquareManGiftIsAccessory', (ctx) => {
  const option = ctx.readVar()
  ctx.host.vars.set(ctx.readHalfWord(), amityGiftIsAccessory(option) ? 1 : 0)
  return false
})

/** 그 선물의 도구·장식 번호 (`ScrCmd_GetAmitySquareBerryOrAccessoryIDFromMan`) */
on('GetAmitySquareBerryOrAccessoryIDFromMan', (ctx) => {
  const option = ctx.readVar()
  ctx.host.vars.set(ctx.readHalfWord(), amityGiftId(option))
  return false
})


// ── 장식 케이스 (PARITY §7.16) ────────────────────────────────────────────────
//
// 콘테스트는 범위 밖인데(§9) 케이스만 있다. 상호교류광장이 주워 온 장식을 넣을
// 곳이 없으면 §7.8이 안 닫히기 때문이다.
//
// ⚠️ **여는 화면은 없다.** 원작의 옷 갈아입히기는 콘테스트 쪽이라 안 만든다 —
// 모으는 것까지가 여기고, 무엇을 모았는지는 리포트에 남는다.

/**
 * 그만큼 더 들어가는가 (`ScrCmd_CanFitAccessory`).
 *
 * ⚠️ **이 답이 갈래를 가른다.** 상호교류광장은 장식이 안 들어가면 도구를 대신
 * 주워 오고, 그것도 안 되면 아무것도 안 준다 — 케이스가 없을 때 답을 안 적으면
 * 앞의 갈래가 쓴 묵은 값으로 갈린다. **그래서 없을 때 0을 적는다**
 */
on('CanFitAccessory', (ctx) => {
  const accessory = ctx.readVar()
  const count = ctx.readVar()
  const dest = ctx.readHalfWord()
  const fits = ctx.host.world.services.fashionCase?.canFit(accessory, count) ?? false
  ctx.host.vars.set(dest, fits ? 1 : 0)
  return false
})

/** 케이스에 넣는다 (`ScrCmd_AddAccessory`) */
on('AddAccessory', (ctx) => {
  // ⚠️ 인자를 **먼저** 읽는다 — `?.`가 인자 평가를 건너뛰면 4바이트가 안 읽히고
  // 그 뒤가 전부 밀린다 (`BufferItemName`에서 이미 밟은 함정이다)
  const accessory = ctx.readVar()
  const amount = ctx.readVar()
  ctx.host.world.services.fashionCase?.add(accessory, amount)
  return false
})

/** 케이스에서 뺀다 (`ScrCmd_RemoveAccessory`) */
on('ScrCmd_RemoveAccessory', (ctx) => {
  const accessory = ctx.readVar()
  const amount = ctx.readVar()
  ctx.host.world.services.fashionCase?.remove(accessory, amount)
  return false
})

/** 장식 이름을 칸에 채운다 (`ScrCmd_BufferAccessoryName`) */
on('BufferAccessoryName', (ctx) => {
  const slot = ctx.readByte()
  const accessory = ctx.readVar()
  ctx.host.world.slots.set(slot, ctx.host.world.services.labels?.accessory(accessory) ?? '')
  return false
})


// ── 리본 (PARITY §9.2) ───────────────────────────────────────────────────────
//
// **리본은 이 게임에 없다.** 콘테스트가 §9로 나가면서 같이 접혔고, 저장할 칸도
// 보여 줄 화면도 안 만든다.
//
// ⚠️ **그래도 명령은 만든다.** 안 만들면 결과를 적는 변수가 **앞의 갈래가 쓴
// 값 그대로** 남고, 스크립트는 그 묵은 값으로 갈라진다 — "리본이 몇 개냐"에
// 우연히 10 이상이 들어 있으면 리본신드롬이 열린다. 읽는 쪽은 0을 적고 쓰는
// 쪽은 아무 일도 안 하는 것이, 리본이 없는 세계의 **참값**이다.
//
// ⚠️ **리본신드롬은 이 0으로 닫힌다.** 1층 들머리가 `CountPartyRibbons`를
// 10과 견주고 모자라면 제 대사로 돌려보낸다(`GoToIf <`) — 우리가 문을 막는
// 것이 아니라 **원작이 제 말로 막는다.** 지어낸 글이 한 줄도 없다

/** 파티가 가진 리본 종류 수 (`ScrCmd_CountPartyRibbons`). 늘 0이다 */
on('CountPartyRibbons', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), 0)
  return false
})

/** 한 마리가 가진 리본 수 (`ScrCmd_CountPartyMonRibbons_Unused`). 늘 0이다 */
on('CountPartyMonRibbons_Unused', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.readVar()
  ctx.host.vars.set(dest, 0)
  return false
})

/** 그 마리가 그 리본을 가졌는가 (`ScrCmd_GetPartyMonRibbon`). 아무도 안 가졌다 */
on('GetPartyMonRibbon', (ctx) => {
  const dest = ctx.readHalfWord()
  ctx.readVar()
  ctx.readVar()
  ctx.host.vars.set(dest, 0)
  return false
})

/** 콘테스트가 묻는 자리 (`ScrCmd_CheckPlayerMonHasRibbon`) */
on('CheckPlayerMonHasRibbon', (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), 0)
  return false
})

/** 붙인다 (`ScrCmd_SetPartyMonRibbon`). 저장할 곳이 없어서 아무 일도 안 한다 */
on('SetPartyMonRibbon', (ctx) => {
  ctx.readVar()
  ctx.readVar()
  return false
})

/** 콘테스트가 이름을 짓는 자리 (`ScrCmd_SetRibbonName`) */
on('SetRibbonName', (ctx) => {
  ctx.readVar()
  return false
})

/**
 * 리본 이름을 칸에 채운다 (`ScrCmd_BufferRibbonName`).
 *
 * ⚠️ **빈 글을 적는다.** 이름표가 없으니 지어내지 않고, 대신 앞의 명령이 그
 * 칸에 넣어 둔 **남의 이름**이 그대로 뜨는 것을 막는다
 */
on('BufferRibbonName', (ctx) => {
  const slot = ctx.readByte()
  ctx.readVar()
  ctx.host.world.slots.set(slot, '')
  return false
})

// ── 통신은 실패한다 (PARITY §9.4) ────────────────────────────────────────────
//
// 왜 「안 만든다」가 아니라 「안 된다고 답한다」인지는 `world/comm.ts`에 적었다.
// 요약하면 **안 만들면 우연히 열린다** — 결과 변수에 앞 갈래가 쓴 값이 남고,
// 거기 「성공」에 해당하는 수가 들어 있으면 스크립트가 문을 연다. 리본과 같다
// (§9.2). 다른 점은 리본은 열려도 대사 하나로 끝나는데 **통신은 열리면
// 주인공이 카운터 뒤에 갇힌다**는 것이다.
//
// 아래는 전부 「없다·못 한다·오류」다. 화면에 뜨는 글은 한 줄도 우리 것이 아니다.

/** 답 하나짜리 명령. 답을 **적어야** 앞 갈래의 값이 안 남는다 */
const answers = (value: number): CommandFn => (ctx) => {
  ctx.host.vars.set(ctx.readHalfWord(), value)
  return false
}

/**
 * 통신 대전 — 손님으로 붙기 · 방장으로 열기
 * (`ScrCmd_StartBattleClient` · `ScrCmd_StartBattleServer`).
 *
 * 셋을 읽고 답을 적는다. **`COMM_CLUB_RET_ERROR`가 우리 답이다** — 바로 다음
 * 줄의 `GoToIfEq`가 그 값을 잡아 원작의 「통신 오류. 처음부터 다시 등록해
 * 주세요」로 간다. 그 대사가 창을 닫고 발을 풀어 준다.
 */
const startCommBattle: CommandFn = (ctx) => {
  ctx.readVar()
  ctx.readVar()
  ctx.readVar()
  ctx.host.vars.set(ctx.readHalfWord(), COMM_CLUB_RET.error)
  return false
}

on('StartBattleClient', startCommBattle)
on('StartBattleServer', startCommBattle)

/** 붙은 뒤에야 도는 것들. 여기까지 오지 않지만 **답을 안 하면 밀린다** */
on('StartLinkBattle', () => false)
on('FieldCommEnterBattleRoom', () => false)
on('EndCommunication', () => false)
on('InitCommFieldCmd', () => false)
on('SetCommPlayerDir', (ctx) => { ctx.readHalfWord(); return false })
on('ClearReceivedTempDataAllPlayers', () => false)
on('DestroyNetworkIcon', () => false)
on('LogLinkInfoInWiFiHistory', () => false)
/** 유니온룸에 실제로 넘겨주는 자리 (`sub_02054708`). 넘겨줄 데가 없다 */
on('ScrCmd_153', () => false)

/**
 * 대전 규칙 고르기 (`ScrCmd_OpenBattleRegulationMenu`).
 *
 * 원작은 화면을 띄우고 고른 규칙을 적는다. 1과 3만 「골랐다」로 치고
 * 나머지는 취소다 — **0을 적어 취소로 만든다.** 콜로세움 접수원이 그 값으로
 * 「또 오세요」에 간다.
 */
on('OpenBattleRegulationMenu', answers(0))

/**
 * GTS 앱을 띄운다 (`ScrCmd_TryStartGTSApp`).
 *
 * 원작도 **Wi-Fi 로그인이 없으면 FALSE를 적고 앱을 안 띄운다.** 우리 답이 그
 * 갈래다 — 글로벌 터미널이 스스로 화면을 되돌리고, 주인공을 방 밖으로 걸어
 * 내보내고, 「또 오세요」로 닫는다 (`GlobalTerminal1F_ExitAndEnd`).
 */
on('TryStartGTSApp', (ctx) => {
  ctx.readVar()
  ctx.host.vars.set(ctx.readHalfWord(), 0)
  return false
})

/** GTS 방으로 들어가기 직전의 준비 (`ScrCmd_0B3` · `sub_0207DDE0`) */
on('ScrCmd_0B3', answers(0))
/** 그 방에서 나올 때 (`ScrCmd_0A3` · `sub_0207DDC0`) */
on('ScrCmd_0A3', () => false)

/**
 * Wi-Fi 친구 목록 (`WiFiList_*`).
 *
 * 로그인이 없고 친구도 0명이다. 이 답이 GTS·Wi-Fi 광장 갈래를 다 닫는다.
 */
on('CheckHasWiFiListValidLogin', answers(0))
on('GetWiFListValidFriendsCount', answers(0))
/** 광장에 다시 들어가기까지 남은 시간. 「들어가도 된다」를 안 답한다 */
on('CheckNoWiFiPlazaCooldown', answers(0))
/** 붙은 상대가 플래티넘인가 (`ScrCmd_IsCommGameCodePlatinum`). 상대가 없다 */
on('IsCommGameCodePlatinum', answers(0))

/**
 * 유니온룸 (`overlay007/union_room.c`).
 *
 * 맵 466은 걸어서 닿을 수 없다 — 포켓몬센터 2층의 그 문은 **통행 불가인
 * 카운터 줄 너머**에 있고, 접수원 갈래는 저장 답으로 닫힌다 (`world/comm.ts`).
 * 그래도 명령을 만드는 이유는 위와 같다: 답을 안 하면 묵은 값으로 갈라진다.
 */
on('ShowUnionRoomMenu', () => false)
on('OpenUnionRoomTrainerCase', () => false)
on('OpenPartyMenuForUnionRoomBattle', () => false)
on('GetUnionRoomTealaMessage', answers(0))
on('GetUnionRoomMessage', (ctx) => {
  ctx.readHalfWord()
  ctx.host.vars.set(ctx.readHalfWord(), 0)
  return false
})
on('DoUnionRoomGreeting', (ctx) => { ctx.readHalfWord(); return false })

/**
 * 미스터리기프트 (`scrcmd_mystery_gift.c`).
 *
 * 배포 서버가 닫힌 지 오래고 우리에게는 받을 길이 없다. 배포로만 나오던
 * 것들은 **시원이 손으로 건넨다** ([SIWON.md](../../../docs/SIWON.md)) —
 * 여기를 되살려서가 아니다.
 *
 * ⚠️ **길이가 첫 인자에 달렸다.** `generated/mystery_gift_delivery_stages.txt`의
 * 차례가 답 칸 수를 가른다 — 셋(1·2·3)은 한 칸, 둘(5·6)은 **두 칸**(글 뱅크와
 * 글 번호)이고 나머지 넷은 없다. 한 칸만 읽으면 그 뒤가 통째로 밀려서,
 * 배달원 스크립트가 변수 번호(`0x40ED`)를 명령으로 읽는다 (실측)
 */
const MYSTERY_GIFT_ONE_ANSWER = [1, 2, 3]
const MYSTERY_GIFT_TWO_ANSWERS = [5, 6]

on('MysteryGiftGive', (ctx) => {
  const stage = ctx.readHalfWord()
  // 「받을 것이 있는가」에 0을 답하면 배달원이 숨고, 뒤의 갈래는 안 열린다.
  // 두 칸짜리(받았다는 글 고르기)는 그래서 닿지 않지만 **길이는 맞춰 둔다**
  if (MYSTERY_GIFT_ONE_ANSWER.includes(stage)) ctx.host.vars.set(ctx.readHalfWord(), 0)
  else if (MYSTERY_GIFT_TWO_ANSWERS.includes(stage)) {
    ctx.host.vars.set(ctx.readHalfWord(), 0)
    ctx.host.vars.set(ctx.readHalfWord(), 0)
  }
  return false
})

/** 타이틀에 「신비한 선물」 줄을 여는 암호. 그 말이 아니다 */
on('CheckIsMysteryGiftPhrase', (ctx) => {
  ctx.readVar()
  ctx.readVar()
  ctx.readVar()
  ctx.readVar()
  ctx.host.vars.set(ctx.readHalfWord(), 0)
  return false
})

/** 그래서 열 것도 없다 (`ScrCmd_UnlockMysteryGift`) */
on('UnlockMysteryGift', () => false)

/**
 * 팔파크 (`scrcmd_catching_show.c`).
 *
 * 3세대 팩을 꽂아야 열린다. **꽂힌 팩이 없다**고 답하면 접수원이 제 대사로
 * 돌려보낸다 — 우리가 문을 잠그는 것이 아니다.
 */
on('GetGBACartridgeVersion', answers(GBA_CARTRIDGE_NONE))

/**
 * 옮겨 온 여섯 마리가 다 있는가 (`ScrCmd_CheckHasEnoughMonForCatchingShow`).
 *
 * 팔파크 접수원이 「참가한다」 다음에 이걸 묻는다. 옮겨 온 것이 없으니
 * 「모자란다」가 참이고, 원작이 제 대사(`NotEnoughPokemonMigrated`)로
 * 돌려보낸다 — **접수원을 지나쳐 문으로 걸어가는 길은 따로 막았다**
 * (`map/world`의 밟는 워프에서 0x60을 뺀 자리)
 */
on('CheckHasEnoughMonForCatchingShow', answers(0))

/**
 * 트레이너 카드에 사인을 받는 화면 (`FieldSystem_LaunchSignatureApp`).
 *
 * 교환할 상대에게 보여 주는 것이라 통신에 딸린 화면이다. 원작은 앱을 띄우고
 * 돌아올 때까지 서는데, 우리는 그냥 지나간다 — 스크립트가 앞뒤로 화면을
 * 어둡게 했다 밝히는 것까지는 원작 그대로 돈다
 */
on('StartSignatureApp', () => false)

/** 통신 아이콘을 띄우기 전에 사람들을 저장해 둔다 (`FieldSystem_SaveObjects`) */
on('ScrCmd_2B2', () => false)

/**
 * 파티에 「나쁜 알」이 있는가 (`ScrCmd_CheckPartyHasBadEgg`).
 *
 * 통신 접수원 넷이 **말을 꺼내기 전에** 이걸 묻는다. 나쁜 알은 통신으로
 * 깨진 알이 들어왔을 때 생기는 것이라 우리에게는 만들어질 길이 없다 —
 * 「없다」가 참이다. ⚠️ 답을 안 하면 앞 갈래의 값으로 갈라져서, 통신과
 * 상관없는 자리에서 「나쁜 알이 있다」는 대사가 뜬다
 */
on('CheckPartyHasBadEgg', answers(0))


// ── 배틀홀의 기록 기계 (PARITY §9.3) ─────────────────────────────────────────
//
// 시설 넷은 안 만들었고 접수원은 제 대사로 돌려보내는데, **안쪽 벽의 기록
// 기계는 아니었다.** 배틀프런티어에서 다섯 건물이 다 워프로 열려 있어서 걸어
// 들어가 이 기계를 읽을 수 있고, 읽으면 이렇게 돈다:
//
//     SelectPokemonWithStartingLetter:
//       ShowBattleHallRecordMonSelectionMenu …, VAR_0x8003, …
//       GoToIfEq VAR_0x8003, MENU_CANCEL, SelectStartingLetters
//       Call OpenRecordDisplay          ← 화면을 어둡게 → 앱 → 밝게
//       Message WhichPokemon
//       GoTo SelectPokemonWithStartingLetter
//
// 고른 값을 아무도 안 적으면 `VAR_0x8003`이 바로 앞에서 넣은 0으로 남아
// **영영 돈다** (실측: 6,000프레임에 6,042보). 밖에서 보면 화면만 껌뻑이고
// 발이 묶인 채 굳는다 — 통신에서 본 것과 같은 덫이다 (§9.4).

/**
 * 기록이 있는 포켓몬 고르기 (`ScrCmd_ShowBattleHallRecordMonSelectionMenu`).
 *
 * ⚠️ **「그만둔다」로 답한다.** 원작도 기록이 하나도 없으면 목록에 그 한 줄만
 * 남기므로(`MenuEntries_Text_ListMenu_Exit` → `MENU_CANCEL`), 이 답이 곧 원작이
 * 세워 주는 목록의 유일한 답이다. 그러면 글자 고르기 메뉴로 돌아가고, 거기
 * 「그만둔다」로 기계를 닫을 수 있다 — **우리가 막는 것이 아니다**
 */
on('ShowBattleHallRecordMonSelectionMenu', (ctx) => {
  ctx.readVar()
  ctx.readVar()
  const result = ctx.readHalfWord()
  const listPos = ctx.readHalfWord()
  const cursorPos = ctx.readHalfWord()
  ctx.host.vars.set(result, MENU_CANCEL)
  // 자리 기억 칸 둘도 적어 둔다. 안 적으면 다음 바퀴에 묵은 값으로 갈라진다
  ctx.host.vars.set(listPos, 0)
  ctx.host.vars.set(cursorPos, 0)
  return false
})

/**
 * 배틀홀 로비가 묻는 것들 (`ScrCmd_CallBattleHallLobbyFunction`).
 *
 * 파티가 자격이 되는가 · 이어 가던 도전이 있는가 · 그 종이 무엇인가.
 * **셋 다 「없다」가 참이다** — 배틀홀을 안 만들었으니 이어 갈 도전이 없다
 */
on('CallBattleHallLobbyFunction', (ctx) => {
  ctx.readHalfWord()
  ctx.readVar()
  ctx.host.vars.set(ctx.readHalfWord(), 0)
  return false
})

/** 기록 화면을 띄운다 (`ScrCmd_OpenFrontierRecordsApp`). 띄울 화면이 없다 */
on('OpenFrontierRecordsApp', (ctx) => {
  ctx.readVar()
  ctx.readVar()
  ctx.readVar()
  return false
})
