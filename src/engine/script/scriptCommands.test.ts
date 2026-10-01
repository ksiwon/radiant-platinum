// 스크립트가 띄우는 메뉴의 커서 · 결과 변수 명령 셋 · 접은 계통이 묻는 수 · 막아 둔 망원경
//
// 메뉴 커서는 원작 부품이 둘이다 — `Menu`(`menu.c`의 `TryMovingCursor`)와 `ListMenu`(`list_menu.c`의
// `UpdateOffsetsForScroll`). 둘을 같은 규칙으로 뭉개 두면 감김 · 여러 열 · 쪽 넘김 · 되풀이가 전부 빠진다.
// 결과 변수 명령은 답 칸에 엉뚱한 값을 먼저 넣고 명령이 그것을 덮는지를 본다 (`smallCommands.test`와 같은 꼴)
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildCommands, countDepartmentStorePurchase, DEPARTMENT_STORE_SPECIALTIES, SYSTEM_FLAG, trainerCardLevel,
  VAR_DAILY_RANDOM_LEVEL, VAR_DEPARTMENT_STORE_REGULAR_COUNTER, VAR_UNDERGROUND_FOSSILS_UNEARTHED,
  VAR_UNDERGROUND_ITEMS_GIVEN_AWAY, VAR_UNDERGROUND_TALK_COUNTER, VAR_UNDERGROUND_TRAPS_SET,
} from './commands'
import { ScriptContext } from './context'
import { parseScriptMeta } from './data'
import { askOurs, fieldScripts, makeWorld, scriptBusy, scriptSystem, signAt, start } from './field'
import { printedText } from './printer'
import { VarStore } from './vars'
import {
  FieldWorld, LIST_MENU_MAX_DISPLAY, LIST_MENU_NO_SELECTION_YET, MENU_CANCEL, MENU_LOOPAROUND_MIN_OPTIONS,
  type FieldServices, type MenuShape,
} from './world'
import { mapById, world as mapWorld, type EventFile, type MapHeader } from '../map/world'
import { worldState } from '../../state/worldState'
import { DATA, withData } from '../../data/romData.testkit'
import { stubTrainerInfo } from './services.testkit'

/** 항목 n개짜리 메뉴를 띄운 세계 */
function menuOf(count: number, columns = 1, shape: MenuShape = {}, vars = new VarStore()): FieldWorld {
  const world = new FieldWorld({ vars })
  world.initMenu(0x8000, 0, true, 'local')
  for (let i = 0; i < count; i++) world.addMenuEntryText(`항목${String(i)}`, i)
  world.showMenu('list', columns, shape)
  return world
}

describe('`Menu` 커서 (`ShowMenu` · `ShowMenuMultiColumn` · 예/아니오)', () => {
  it('한 열 셋은 끝에서 선다 — 감기는 것은 넷부터다 (`MENU_LOOPAROUND_MIN_OPTIONS`)', () => {
    expect(MENU_LOOPAROUND_MIN_OPTIONS).toBe(4)
    const three = menuOf(3)
    three.moveCursor(-1)
    expect(three.menuCursor).toBe(0)
    three.moveCursor(1); three.moveCursor(1); three.moveCursor(1)
    expect(three.menuCursor).toBe(2)
  })

  it('한 열 넷 이상은 위아래 끝에서 감긴다', () => {
    const four = menuOf(4)
    four.moveCursor(-1)
    expect(four.menuCursor).toBe(3)
    four.moveCursor(1)
    expect(four.menuCursor).toBe(0)
    // ←→는 한 열 메뉴에서 아무 일도 안 한다
    four.moveCursor(0, 1)
    expect(four.menuCursor).toBe(0)
  })

  it('여러 열은 열부터 찬다 — ↑↓는 그 열 안, ←→는 줄 수만큼, 끝에서 안 감긴다 (칠판 여섯 · 두 열)', () => {
    const board = menuOf(6, 2)
    // 줄 수 3 — 왼쪽 열이 0·1·2, 오른쪽 열이 3·4·5다
    board.moveCursor(0, 1)
    expect(board.menuCursor).toBe(3)
    board.moveCursor(0, 1)
    expect(board.menuCursor).toBe(3)
    board.moveCursor(1); board.moveCursor(1)
    expect(board.menuCursor).toBe(5)
    board.moveCursor(1)
    expect(board.menuCursor).toBe(5)
    board.moveCursor(0, -1)
    expect(board.menuCursor).toBe(2)
    board.moveCursor(-1); board.moveCursor(-1); board.moveCursor(-1)
    expect(board.menuCursor).toBe(0)
  })

  it('예/아니오는 안 감긴다', () => {
    const world = new FieldWorld({ vars: new VarStore() })
    world.openYesNo(0x8000)
    world.moveCursor(-1)
    expect(world.menuCursor).toBe(0)
    world.moveCursor(1); world.moveCursor(1)
    expect(world.menuCursor).toBe(1)
  })

  it('인자 하나는 예전처럼 세로 칸 수다 (`moveCursor(1)`)', () => {
    const world = menuOf(5)
    world.moveCursor(2)
    expect(world.menuCursor).toBe(2)
  })
})

describe('`ListMenu` 커서 (`ShowListMenu` 계열)', () => {
  const LIST: MenuShape = { widget: 'listMenu', pager: true }

  it('여덟 줄 창 — 내려가면 넷째 줄에서 창이 구르고, 끝에서 안 감긴다', () => {
    expect(LIST_MENU_MAX_DISPLAY).toBe(8)
    const prizes = menuOf(20, 1, LIST)
    for (let i = 0; i < 4; i++) prizes.moveCursor(1)
    expect([prizes.menuTop, prizes.menuCursor]).toEqual([0, 4])
    prizes.moveCursor(1)
    expect([prizes.menuTop, prizes.menuCursor]).toEqual([1, 5])
    for (let i = 0; i < 30; i++) prizes.moveCursor(1)
    expect([prizes.menuTop, prizes.menuCursor]).toEqual([12, 19])
    // 올라갈 때는 셋째 줄에서 구른다 (`maxDisplay − 가운데 − 1`)
    for (let i = 0; i < 4; i++) prizes.moveCursor(-1)
    expect([prizes.menuTop, prizes.menuCursor]).toEqual([12, 15])
    prizes.moveCursor(-1)
    expect([prizes.menuTop, prizes.menuCursor]).toEqual([11, 14])
    // 맨 위에서도 안 감긴다
    for (let i = 0; i < 30; i++) prizes.moveCursor(-1)
    expect([prizes.menuTop, prizes.menuCursor]).toEqual([0, 0])
    prizes.moveCursor(-1)
    expect(prizes.menuCursor).toBe(0)
  })

  it('←→는 한 창(여덟 줄)씩 넘긴다 — 짧은 목록은 끝까지 간다', () => {
    const prizes = menuOf(20, 1, LIST)
    prizes.moveCursor(0, 1)
    expect([prizes.menuTop, prizes.menuCursor]).toEqual([4, 8])
    prizes.moveCursor(0, -1)
    expect([prizes.menuTop, prizes.menuCursor]).toEqual([0, 0])
    const short = menuOf(3, 1, LIST)
    short.moveCursor(0, 1)
    expect(short.menuCursor).toBe(2)
    short.moveCursor(0, -1)
    expect(short.menuCursor).toBe(0)
  })

  it('쪽 넘김이 꺼진 목록(프런티어 · 꽃집)은 ←→에 안 움직인다', () => {
    const ours = menuOf(20, 1, { widget: 'listMenu', pager: false })
    ours.moveCursor(0, 1)
    expect(ours.menuCursor).toBe(0)
    ours.moveCursor(1)
    expect(ours.menuCursor).toBe(1)
  })

  it('기억하는 목록은 두 변수로 창과 커서를 되살리고, 움직일 때마다 적는다', () => {
    const vars = new VarStore()
    vars.set(0x8005, 6)
    vars.set(0x8006, 4)
    const prizes = menuOf(20, 1, { ...LIST, remember: { offsetVar: 0x8005, cursorVar: 0x8006 } }, vars)
    expect([prizes.menuTop, prizes.menuCursor]).toEqual([6, 10])
    prizes.moveCursor(1)
    expect([vars.get(0x8005), vars.get(0x8006)]).toEqual([7, 4])
    prizes.moveCursor(-1)
    expect([vars.get(0x8005), vars.get(0x8006)]).toEqual([7, 3])
  })
})

/** 줄마다 무엇이 들었는가 — 바이트로 짠 스크립트 하나를 돌린다 */
const maybeMeta = withData('scripts.json')
const DEST = 0x8004

maybeMeta('명령 하나씩', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const { map } = buildCommands(meta.commands)
  const op = (name: string): number => {
    const at = meta.commands.findIndex((c) => c?.name === name)
    if (at < 0) throw new Error(`${name} 명령이 표에 없다`)
    return at
  }
  /** 명령 여럿과 `End`를 짠다. 인자는 [폭, 값] */
  const bytes = (cmds: [string, [1 | 2, number][]][]): Uint8Array => {
    const out: number[] = []
    const u16 = (v: number) => { out.push(v & 0xff, (v >> 8) & 0xff) }
    for (const [name, args] of cmds) {
      u16(op(name))
      for (const [w, v] of args) { if (w === 1) out.push(v & 0xff); else u16(v) }
    }
    u16(op('End'))
    return Uint8Array.from(out)
  }
  const context = (cmds: [string, [1 | 2, number][]][], vars: VarStore, services: FieldServices = {}) => {
    const world = new FieldWorld({ vars, input: () => ({ pressed: false, held: false }), movements: meta.movements, services })
    const ctx = new ScriptContext({ vars, world, commands: map }, bytes(cmds), 0)
    ctx.start(0)
    return { world, ctx }
  }
  const run = (name: string, vars = new VarStore(), services: FieldServices = {}): number => {
    vars.set(DEST, 0x1234)
    const { ctx } = context([[name, [[2, DEST]]]], vars, services)
    for (let f = 0; f < 10 && ctx.step(1000); f++) { /* 한 프레임씩 */ }
    return vars.get(DEST)
  }

  it('GetTrainerCardLevel — 전당과 전국도감, 하나에 한 칸', () => {
    expect(run('GetTrainerCardLevel', new VarStore(), { trainerInfo: stubTrainerInfo })).toBe(0)
    const vars = new VarStore()
    vars.setFlag(SYSTEM_FLAG.gameCompleted)
    expect(run('GetTrainerCardLevel', vars, { trainerInfo: stubTrainerInfo })).toBe(1)
    expect(run('GetTrainerCardLevel', vars, { trainerInfo: { ...stubTrainerInfo, dexCompleted: (national) => national } })).toBe(2)
    // 도감 서비스가 없어도 답 칸을 덮는다
    expect(run('GetTrainerCardLevel')).toBe(0)
  })

  it('trainerCardLevel — 다섯 조건의 개수 (`TRAINER_CARD_LEVEL_BLACK` 5까지)', () => {
    const none = { gameCompleted: false, nationalDexCompleted: false, towerStreak100: false, contestMaster: false, undergroundPlatBase: false }
    expect(trainerCardLevel(none)).toBe(0)
    expect(trainerCardLevel({ ...none, towerStreak100: true, contestMaster: true })).toBe(2)
    expect(trainerCardLevel({ gameCompleted: true, nationalDexCompleted: true, towerStreak100: true, contestMaster: true, undergroundPlatBase: true })).toBe(5)
  })

  it('CheckIsDepartmentStoreRegular — 백화점에서 다섯 번 사야 단골이다', () => {
    expect(run('CheckIsDepartmentStoreRegular')).toBe(0)
    const vars = new VarStore()
    vars.set(VAR_DEPARTMENT_STORE_REGULAR_COUNTER, 4)
    expect(run('CheckIsDepartmentStoreRegular', vars)).toBe(0)
    vars.set(VAR_DEPARTMENT_STORE_REGULAR_COUNTER, 5)
    expect(run('CheckIsDepartmentStoreRegular', vars)).toBe(1)
  })

  it('백화점 계산대만 산 횟수를 센다 — 지역 상점 일곱 · 4층 둘, 10000에서 멈춘다', () => {
    const opened = (cmd: string, martID: number): (() => void) | undefined => {
      const vars = new VarStore()
      let hook: (() => void) | undefined
      const { ctx } = context([[cmd, [[2, martID]]]], vars, {
        openShop: (_items, _currency, onPurchase) => { hook = onPurchase },
        menuOpen: () => false,
        martStock: { common: () => [], specialties: () => [1] },
      })
      for (let f = 0; f < 5 && ctx.step(1000); f++) { /* 한 프레임씩 */ }
      return hook
    }
    for (const id of DEPARTMENT_STORE_SPECIALTIES) expect(opened('PokeMartSpecialties', id)).toBeTypeOf('function')
    // 다른 지역 상점(0 축복시티 · 18 포켓몬리그)과 일반 상점은 안 센다
    expect(opened('PokeMartSpecialties', 0)).toBeUndefined()
    expect(opened('PokeMartSpecialties', 18)).toBeUndefined()
    expect(opened('PokeMartDecor', 0)).toBeTypeOf('function')
    expect(opened('PokeMartDecor', 1)).toBeTypeOf('function')
    expect(opened('PokeMartCommon', 0)).toBeUndefined()

    const vars = new VarStore()
    for (let i = 0; i < 5; i++) countDepartmentStorePurchase(vars)
    expect(run('CheckIsDepartmentStoreRegular', vars)).toBe(1)
    vars.set(VAR_DEPARTMENT_STORE_REGULAR_COUNTER, 10000)
    countDepartmentStorePurchase(vars)
    expect(vars.get(VAR_DEPARTMENT_STORE_REGULAR_COUNTER)).toBe(10000)
  })

  it.runIf(existsSync('raw/decomp/generated/mart_specialties_id.txt'))('세는 지역 상점 번호가 장막백화점 일곱이다', () => {
    const order = readFileSync('raw/decomp/generated/mart_specialties_id.txt', 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '')
    expect(DEPARTMENT_STORE_SPECIALTIES.map((id) => order[id])).toEqual([
      'MART_SPECIALTIES_ID_VEILSTONE_1F_RIGHT', 'MART_SPECIALTIES_ID_VEILSTONE_1F_LEFT',
      'MART_SPECIALTIES_ID_VEILSTONE_2F_UP', 'MART_SPECIALTIES_ID_VEILSTONE_2F_MID',
      'MART_SPECIALTIES_ID_VEILSTONE_3F_UP', 'MART_SPECIALTIES_ID_VEILSTONE_3F_DOWN',
      'MART_SPECIALTIES_ID_VEILSTONE_B1F',
    ])
  })

  it('CheckIsTodayPlayerBirthday — 생일 자료가 없으니 늘 0', () => {
    expect(run('CheckIsTodayPlayerBirthday')).toBe(0)
  })

  /** 명령 하나 뒤에 표지 한 줄을 붙여 끝까지 돌린다 — 표지가 서면 인자 폭을 다 읽은 것이다 */
  const SENTINEL = 0x8007
  const runLine = (cmd: [string, [1 | 2, number][]], vars = new VarStore(), services: FieldServices = {}): VarStore => {
    for (const d of [DEST, 0x8005, 0x8006]) vars.set(d, 0x1234)
    const { ctx } = context([cmd, ['SetVarFromValue', [[2, SENTINEL], [2, 77]]]], vars, services)
    for (let f = 0; f < 10 && ctx.step(1000); f++) { /* 한 프레임씩 */ }
    expect(vars.get(SENTINEL)).toBe(77)
    return vars
  }

  it('GetPartyMonContestStat — 콘테스트 능력치를 담을 칸이 없으니 0 (들판시티 북동 집의 200 갈래가 안 열린다)', () => {
    for (let type = 0; type < 5; type++) {
      expect(runLine(['GetPartyMonContestStat', [[2, 0], [2, type], [2, DEST]]]).get(DEST)).toBe(0)
    }
  })

  it('씰케이스 둘 — 씰이 한 장도 없다', () => {
    expect(run('CountUniqueSealsInSealCase')).toBe(0)
    expect(runLine(['CountSealOccurence', [[2, 50], [2, DEST]]]).get(DEST)).toBe(0)
  })

  it('GivePoffin — 빈 케이스라 늘 들어가고, 답은 `Poffin_MakePoffin`의 종류다', () => {
    const give = (flavors: [number, number, number, number, number], smoothness = 40): number =>
      runLine(['GivePoffin', [[2, DEST], ...flavors.map((f) => [2, f] as [2, number]), [2, smoothness]]]).get(DEST)
    // 콘테스트회장 로비의 선물(60·30·30·30·30) — 50 이상이 하나라도 있으면 순한 포핀(28)
    expect(give([60, 30, 30, 30, 30])).toBe(28)
    // 한 맛은 그 맛 × 6 — 매움 0 · 심 24
    expect(give([10, 0, 0, 0, 0])).toBe(0)
    expect(give([0, 0, 0, 0, 10])).toBe(24)
    // 두 맛은 센 쪽이 앞이다 — 같으면 앞 번호가 앞
    expect(give([10, 0, 20, 0, 0])).toBe(2 * 5 + 0)
    expect(give([10, 0, 10, 0, 0])).toBe(0 * 5 + 2)
    expect(give([0, 30, 0, 0, 31])).toBe(4 * 5 + 1)
    // 셋은 진한(25) · 넷과 다섯은 너무 익은(26) · 없으면 엉망(27)
    expect(give([1, 1, 1, 0, 0])).toBe(25)
    expect(give([1, 1, 1, 1, 0])).toBe(26)
    expect(give([1, 1, 1, 1, 1])).toBe(26)
    expect(give([0, 0, 0, 0, 0])).toBe(27)
    // 원작은 `u8`로 자른다 — 256은 0이다
    expect(give([0x100, 0, 0, 0, 0])).toBe(27)
  })

  it('GetEmptyPoffinCaseSlotCount — 빈 케이스는 100칸이 빈다 (`MAX_POFFINS`)', () => {
    expect(run('GetEmptyPoffinCaseSlotCount')).toBe(100)
  })

  it('CheckCanCookPoffin — 나무열매 주머니가 비면 1, 아니면 0 (케이스는 늘 비어 2가 안 나온다)', () => {
    const asked: number[] = []
    const bag = (berries: boolean): FieldServices => ({
      bag: {
        pocketOf: () => 0, add: () => true, remove: () => true, canFit: () => true, quantity: () => 0, name: () => '',
        pocketHasItems: (pocket) => { asked.push(pocket); return berries },
      },
    })
    expect(run('CheckCanCookPoffin', new VarStore(), bag(true))).toBe(0)
    expect(run('CheckCanCookPoffin', new VarStore(), bag(false))).toBe(1)
    // 나무열매 주머니(`POCKET_BERRIES`)만 묻는다
    expect(asked).toEqual([4, 4])
    // 가방이 안 붙었으면 열매가 없는 것이다
    expect(run('CheckCanCookPoffin')).toBe(1)
  })

  it('CheckBackdrop — 배경 칸이 없으니 늘 거짓', () => {
    expect(runLine(['CheckBackdrop', [[2, 0], [2, DEST]]]).get(DEST)).toBe(0)
  })

  it('지하통로 기록 넷은 세이브 변수를 그대로 읽고, 깃발 수는 늘 0', () => {
    const vars = new VarStore()
    vars.set(VAR_UNDERGROUND_TALK_COUNTER, 100)
    vars.set(VAR_UNDERGROUND_ITEMS_GIVEN_AWAY, 7)
    vars.set(VAR_UNDERGROUND_FOSSILS_UNEARTHED, 3)
    vars.set(VAR_UNDERGROUND_TRAPS_SET, 250)
    expect(run('GetUndergroundTalkCounter', vars)).toBe(100)
    expect(run('GetUndergroundItemsGivenAway', vars)).toBe(7)
    expect(run('GetUndergroundFossilsUnearthed', vars)).toBe(3)
    expect(run('GetUndergroundTrapsSet', vars)).toBe(250)
    expect(run('GetUndergroundTalkCounter')).toBe(0)
    expect(run('GetCapturedFlagCount', vars)).toBe(0)
  })

  it('CalcCatchingShowPoints — 쇼를 안 열었으니 넷 다 0, 다른 번호면 답 칸을 안 건드린다', () => {
    for (let category = 0; category < 4; category++) {
      expect(runLine(['CalcCatchingShowPoints', [[2, category], [2, DEST]]]).get(DEST)).toBe(0)
    }
    expect(runLine(['CalcCatchingShowPoints', [[2, 4], [2, DEST]]]).get(DEST)).toBe(0x1234)
  })

  it('ScrCmd_2F6 — 로그인이 없으니 0을 적고, 원작처럼 한 프레임 쉰다', () => {
    const vars = new VarStore()
    vars.set(DEST, 0x1234)
    const { ctx } = context([['ScrCmd_2F6', [[2, 0], [2, 0], [2, DEST]]], ['SetVarFromValue', [[2, SENTINEL], [2, 77]]]], vars)
    expect(ctx.step(1000)).toBe(true)
    expect(vars.get(DEST)).toBe(0)
    expect(vars.get(SENTINEL)).toBe(0)
    expect(ctx.step(1000)).toBe(false)
    expect(vars.get(SENTINEL)).toBe(77)
  })

  it('ScrCmd_2F7 — 답을 안 적는다 · 한 프레임 쉰다', () => {
    const vars = new VarStore()
    vars.set(DEST, 5)
    const { ctx } = context([['ScrCmd_2F7', [[2, DEST]]], ['SetVarFromValue', [[2, SENTINEL], [2, 77]]]], vars)
    expect(ctx.step(1000)).toBe(true)
    expect(vars.get(SENTINEL)).toBe(0)
    expect(ctx.step(1000)).toBe(false)
    expect([vars.get(DEST), vars.get(SENTINEL)]).toEqual([5, 77])
  })

  it('ScrCmd_2E4 — 긁기 앱이 없어 칸이 처음(0) 그대로다 · 도구도 개수도 0', () => {
    for (let card = 0; card < 3; card++) {
      const vars = runLine(['ScrCmd_2E4', [[2, card], [2, 0x8005], [2, 0x8006]]])
      expect([vars.get(0x8005), vars.get(0x8006)]).toEqual([0, 0])
    }
  })

  it('ShowListMenuRememberCursor — 인자 둘은 변수 번호다 · 되살리고 적고, 고르면 그 값으로 간다', () => {
    const vars = new VarStore()
    vars.set(0x8005, 2)
    vars.set(0x8006, 1)
    const entries: [string, [1 | 2, number][]][] = Array.from({ length: 12 }, (_, i) =>
      ['AddListMenuEntry', [[2, i], [2, 0xff], [2, i]]] as [string, [1 | 2, number][]])
    const { world, ctx } = context([
      ['InitGlobalTextListMenu', [[1, 1], [1, 1], [1, 0], [1, 1], [2, DEST]]],
      ...entries,
      ['ShowListMenuRememberCursor', [[2, 0x8005], [2, 0x8006]]],
      ['SetVarFromValue', [[2, 0x8007], [2, 77]]],
    ], vars)
    for (let f = 0; f < 5 && world.menu === null; f++) expect(ctx.step(1000)).toBe(true)
    expect(vars.get(DEST)).toBe(LIST_MENU_NO_SELECTION_YET)
    expect(world.menu?.widget).toBe('listMenu')
    expect(world.menu?.pager).toBe(true)
    expect([world.menuTop, world.menuCursor]).toEqual([2, 3])
    world.moveCursor(1)
    expect([vars.get(0x8005), vars.get(0x8006)]).toEqual([2, 2])
    world.chooseAtCursor()
    for (let f = 0; f < 5 && ctx.step(1000); f++) { /* 한 프레임씩 */ }
    expect(vars.get(DEST)).toBe(4)
    // 인자 넷 바이트를 다 읽었으니 다음 명령이 제자리에서 돈다
    expect(vars.get(0x8007)).toBe(77)
  })

  it('ShowMenu는 `Menu` · ShowListMenu는 쪽 넘김이 켜진 `ListMenu`', () => {
    for (const [cmd, widget, pager] of [['ShowMenu', 'menu', false], ['ShowListMenu', 'listMenu', true]] as const) {
      const vars = new VarStore()
      const { world, ctx } = context([
        ['InitGlobalTextMenu', [[1, 1], [1, 1], [1, 0], [1, 1], [2, DEST]]],
        ['AddMenuEntry', [[2, 0], [2, 0]]],
        [cmd, []],
      ], vars)
      for (let f = 0; f < 5 && world.menu === null; f++) ctx.step(1000)
      expect(world.menu?.widget).toBe(widget)
      expect(world.menu?.pager).toBe(pager)
    }
  })

  it.runIf(existsSync('raw/decomp/generated/vars_flags.txt'))('단골 셈 변수 번호 — `vars_flags.txt`를 C 열거형으로 센 값', () => {
    const value = new Map<string, number>()
    let n = 0
    for (const raw of readFileSync('raw/decomp/generated/vars_flags.txt', 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (line === '') continue
      const alias = /^(\w+)\s*=\s*(\w+)$/.exec(line)
      if (alias) n = /^\d+$/.test(alias[2]!) ? Number(alias[2]) : value.get(alias[2]!)!
      value.set(alias ? alias[1]! : line, n)
      n++
    }
    expect(value.get('VAR_DAILY_RANDOM_LEVEL')).toBe(VAR_DAILY_RANDOM_LEVEL)
    expect(value.get('VAR_DEPARTMENT_STORE_REGULAR_COUNTER')).toBe(VAR_DEPARTMENT_STORE_REGULAR_COUNTER)
    // 지하통로 기록 넷 — 연고시티의 결정 갈래가 읽는다
    expect(value.get('VAR_UNDERGROUND_FOSSILS_UNEARTHED')).toBe(VAR_UNDERGROUND_FOSSILS_UNEARTHED)
    expect(value.get('VAR_UNDERGROUND_TRAPS_SET')).toBe(VAR_UNDERGROUND_TRAPS_SET)
    expect(value.get('VAR_UNDERGROUND_TALK_COUNTER')).toBe(VAR_UNDERGROUND_TALK_COUNTER)
    expect(value.get('VAR_UNDERGROUND_ITEMS_GIVEN_AWAY')).toBe(VAR_UNDERGROUND_ITEMS_GIVEN_AWAY)
  })
})

describe('필드 메뉴 입력 — 목록은 누르고 있으면 되풀이한다 (`JOY_REPEAT` 8 · 4)', () => {
  beforeEach(() => {
    fieldScripts.vars = new VarStore()
    fieldScripts.world = makeWorld(fieldScripts.vars)
    fieldScripts.ctx = null
    fieldScripts.services = {}
    worldState.input.interact = false
    worldState.input.cancel = false
    worldState.input.move.set(0, 0)
  })
  afterEach(() => { worldState.input.move.set(0, 0) })

  /** n 프레임 — `move`는 스크립트가 프레임마다 지우므로 매번 다시 넣는다 */
  const frames = (n: number, move: [number, number] = [0, 0], a = false): void => {
    for (let i = 0; i < n; i++) {
      worldState.input.move.set(move[0], move[1])
      worldState.input.interact = a
      scriptSystem.fixedUpdate()
    }
  }

  it('↓를 누르고 있으면 처음 한 칸, 8프레임 뒤부터 4프레임마다 한 칸', async () => {
    const picked = askOurs('고른다', {
      kind: 'list',
      entries: Array.from({ length: 20 }, (_, i) => ({ text: `항목${String(i)}`, value: i })),
      cursor: 0,
      canCancel: true,
    })
    frames(5)
    const world = fieldScripts.world!
    expect(world.menu?.widget).toBe('listMenu')
    frames(8, [0, 1])
    expect(world.menuCursor).toBe(1)
    frames(9, [0, 1])
    // 8 · 12 · 16번째 프레임에 한 칸씩
    expect(world.menuCursor).toBe(4)
    // 떼었다 다시 누르면 처음부터 센다
    frames(1)
    frames(2, [0, 1])
    expect(world.menuCursor).toBe(5)
    // 이 목록은 쪽 넘김이 없다
    frames(1)
    frames(1, [1, 0])
    expect(world.menuCursor).toBe(5)
    frames(1)
    frames(1, [0, 0], true)
    frames(2)
    expect(await picked).toBe(5)
    expect(scriptBusy()).toBe(false)
  })

  it('B는 취소다', async () => {
    const picked = askOurs('고른다', {
      kind: 'list', entries: [{ text: '하나', value: 0 }, { text: '둘', value: 1 }], cursor: 0, canCancel: true,
    })
    frames(5)
    worldState.input.cancel = true
    frames(1)
    worldState.input.cancel = false
    frames(2)
    expect(await picked).toBe(MENU_CANCEL)
  })
})

const maybeField = withData('scripts.bin', 'scripts.json', 'events.json', 'maps.json')

maybeField('대습초원 전망대 망원경 — 돈을 받기 전에 우리 안내로 닫는다', () => {
  const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  /** `MAP_HEADER_PASTORIA_CITY_OBSERVATORY_GATE_2F` */
  const GATE_2F = 126
  const sounds: number[] = []
  let moneyTaken = 0

  beforeEach(() => {
    mapWorld.maps = (read('maps.json') as { maps: MapHeader[] }).maps
    mapWorld.events = (read('events.json') as { events: Record<string, EventFile> }).events
    mapWorld.mapId = GATE_2F
    fieldScripts.data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
    fieldScripts.commands = buildCommands(meta.commands)
    fieldScripts.vars = new VarStore()
    sounds.length = 0
    moneyTaken = 0
    fieldScripts.services = {
      sound: { playEffect: (seq) => { sounds.push(seq) } } as NonNullable<FieldServices['sound']>,
      money: { get: () => 5000, add: () => {}, spend: (n) => { moneyTaken += n; return true } },
    }
    fieldScripts.world = makeWorld(fieldScripts.vars, [])
    fieldScripts.varsReady = true
    fieldScripts.ctx = null
    fieldScripts.lastError = null
    worldState.input.interact = false
    worldState.input.cancel = false
    worldState.input.move.set(0, 0)
  })

  const frames = (n: number, a = false): void => {
    for (let i = 0; i < n; i++) {
      worldState.input.interact = a
      scriptSystem.fixedUpdate()
    }
  }

  it('망원경 칸은 1번 스크립트를 부른다', () => {
    // 북쪽을 보고(사분면 2) 망원경 앞에 선다
    expect(signAt(GATE_2F, 2, 3, 2, fieldScripts.vars)?.script).toBe(1)
  })

  it('롬 스크립트는 한 줄도 안 돌고, 안내 두 쪽만 뜬다', () => {
    const header = mapById(GATE_2F)!
    expect(start(1, header.scripts)).toBe(true)
    expect(fieldScripts.ctx).toBeNull()
    expect(scriptBusy()).toBe(true)
    // 첫 줄 `PlaySE SEQ_SE_CONFIRM` 하나만 남긴다
    expect(sounds).toEqual([1500])
    frames(2)
    expect(printedText(fieldScripts.world!.printer!)).toContain('망원경은 아직 준비 중이다.')
    // 두 쪽을 넘기면 닫힌다
    for (let i = 0; i < 4 && scriptBusy(); i++) { frames(1, true); frames(2) }
    expect(scriptBusy()).toBe(false)
    expect(fieldScripts.ctx).toBeNull()
    expect(moneyTaken).toBe(0)
    expect(fieldScripts.lastError).toBeNull()
  })

  it('같은 방의 사람은 롬 스크립트 그대로다', () => {
    const header = mapById(GATE_2F)!
    expect(start(2, header.scripts)).toBe(true)
    expect(fieldScripts.ctx).not.toBeNull()
    fieldScripts.ctx = null
    fieldScripts.world!.reset()
  })
})
