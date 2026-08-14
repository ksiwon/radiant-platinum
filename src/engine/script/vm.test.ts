// 스크립트 VM 검증 (DATA.md §2.10)
//
// 결정적인 시험은 하나다: **진입점 4079개를 전부 돌려 본다.** 안 만든 명령은
// 표의 폭으로 건너뛰므로 끝까지 갈 수 있고, 폭이 하나라도 틀리면 그 자리에서
// 모르는 opcode나 파일 밖 접근으로 터진다.
//
// 눈으로 확인할 수 없는 것을 잡는 게 목적이다 — 실행이 "그럴듯하게" 이어지면서
// 사실은 엉뚱한 명령을 밟고 있는 상황. 실제로 초기화 표 549개를 코드로 읽었을 때
// 예외 하나 없이 통과한 적이 있다.
//
// 대사창이 붙으면서 훑는 방식이 한 번 바뀌었다. 전에는 아무것도 안 기다려서
// `step()` 한 번이면 `End`까지 갔지만, 이제 `Message`가 프레임을 넘긴다.
// 그래서 여기 `run`은 **프레임 고리**다 — 원작의 한 프레임과 같은 모양이다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { parseScriptMeta, countEntries, entryOffset, fileBytes, resolveScript } from './data'
import { buildCommands } from './commands'
import { ScriptContext, ScriptError, type CommandFn } from './context'
import { MessagePrinter, printedText, TEXT_SPEED, type PrinterOptions } from './printer'
import { MessageSlots } from './text'
import { VarStore, VAR_RESULT } from './vars'
import { FieldWorld, MENU_NO, type FieldServices } from './world'
import { addItem, canFit, emptyBag, quantity, removeItem } from '../bag/bag'
import { withData } from '../../data/romData.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const present = existsSync(resolve(DATA, 'scripts.json')) && existsSync(resolve(DATA, 'scripts.bin'))
const maybe = withData('scripts.json', 'scripts.bin')
const MENU_ENTRIES_FILE = resolve(DATA, 'dialogue/ko/361.json')
const ITEMS_FILE = resolve(DATA, 'items.json')

/** 한 진입점이 이 이상 명령을 밟으면 되돌아 도는 것이다 */
const STEP_CAP = 100_000
/**
 * 프레임을 넘기며 도는 고리도 있다 — 대사창은 넘어가는데 답이 안 바뀌는 경우.
 *
 * 65535보다 넉넉해야 한다. `WaitTime`이 남은 프레임을 u16 변수에 두는데, 0에서
 * 한 번 더 깎으면 65535가 되어 **정상적으로** 그만큼 기다린다
 */
const FRAME_CAP = 70_000

/** 훑을 때는 기다리지 않는다. 글자는 즉시 나오고 버튼은 늘 눌려 있다 */
const SWEEP: PrinterOptions = { speed: TEXT_SPEED.instant, canSkip: true, autoScroll: false }
const ALWAYS_PRESSED = () => ({ pressed: true, held: true })

interface RunOptions {
  commands?: ReadonlyMap<number, CommandFn>
  vars?: VarStore
  messages?: readonly string[]
  /** 예/아니오에 무엇으로 답할지 */
  answer?: number
}

maybe('스크립트 VM', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const data = {
    meta,
    bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength),
  }
  const { map, unhandled } = buildCommands(meta.commands)
  /** 아이템 468종. 주머니 번호만 쓴다 */
  const items: { pocket?: number }[] = existsSync(ITEMS_FILE)
    ? JSON.parse(readFileSync(ITEMS_FILE, 'utf8')).items
    : []
  let money = 3000

  /**
   * 훑을 때 쓰는 가방. 진입점마다 새로 만든다.
   *
   * 안 붙이면 도구를 받는 스크립트가 전부 "가방이 꽉 찼다" 가지로 새고, 그
   * 너머의 명령이 한 번도 안 밟힌다 — 실제로 `Noop`·`SetFlagFromVar`가
   * 그 뒤에 있었다
   */
  const sweepBag = (): FieldServices => {
    let pockets = emptyBag()
    const at = (item: number): number => items[item]?.pocket ?? 0
    return {
      bag: {
        pocketOf: at,
        add: (item, count) => {
          const next = addItem(pockets, at(item), item, count)
          if (next === null) return false
          pockets = next
          return true
        },
        remove: (item, count) => {
          const next = removeItem(pockets, at(item), item, count)
          if (next === null) return false
          pockets = next
          return true
        },
        canFit: (item, count) => canFit(pockets, at(item), item, count),
        quantity: (item) => quantity(pockets, at(item), item),
        pocketHasItems: (pocket) => (pockets[pocket]?.length ?? 0) > 0,
        name: (item) => `도구${String(item)}`,
      },
      money: {
        get: () => money,
        add: (amount) => { money += amount },
        spend: (amount) => {
          if (money < amount) return false
          money -= amount
          return true
        },
      },
      ...SWEEP_SERVICES,
    }
  }

  /**
   * 답만 돌려주는 바깥 세계.
   *
   * ⚠️ **선 채로 기다리는 명령은 반드시 여기 답이 있어야 한다.** 파트너를
   * 고르는 화면이 그렇다 — 안 붙이면 201번도로의 서류가방 스크립트가 그
   * 자리에서 영영 서고, 그 뒤의 `GivePokemon`·`StartFirstBattle`이 한 번도
   * 안 밟힌다. 훑기가 "멀리 가는가"를 재는 시험이라 이게 곧 눈금이다
   */
  const SWEEP_SERVICES: FieldServices = {
    // 나무 파트너로 고정한다. 값이 무엇이든 지나가는 자리는 같고, 고른 뒤
    // 갈라지는 세 가지(TURTWIG·CHIMCHAR·PIPLUP) 중 하나는 밟혀야 한다
    chooseStarter: { open: () => { /* 곧바로 끝난다 */ }, chosen: () => SPECIES_TURTWIG },
    startFirstBattle: () => { /* 결과는 `battleResult`가 이긴 것으로 준다 */ },
    // 러닝슈즈는 **아직 없는** 쪽으로 답한다. 그래야 주는 가지를 밟는다
    gear: { giveRunningShoes: () => { /* 받는 자리만 지나간다 */ }, hasRunningShoes: () => false },
    timeOfDay: () => 1,
    warpEvents: { setPos: () => { /* 워프 표는 훑기에 없다 */ } },
    door: {
      load: () => { /* 소품이 없다 */ },
      open: () => { /* 소품이 없다 */ },
      close: () => { /* 소품이 없다 */ },
      // 곧바로 끝난 것으로 답한다. 참으로 두면 `WaitForAnimation`이 영영 선다
      busy: () => false,
      unload: () => { /* 소품이 없다 */ },
    },
  }

  /** `generated/species.txt` */
  const SPECIES_TURTWIG = 387

  /**
   * 진입점 하나를 끝까지 돌린다.
   *
   * 한 바퀴가 한 프레임이다: 명령을 돌리고(`step`), 기다리는 것이 있으면
   * 세계를 한 칸 굴린다(`tick`). 상한이 둘인 이유는 고리가 두 종류라서다 —
   * 프레임을 안 넘기고 도는 것과, 넘기면서 도는 것.
   */
  const run = (file: number, entry: number, opts: RunOptions = {}): FieldWorld => {
    const vars = opts.vars ?? new VarStore()
    const world = new FieldWorld({
      vars,
      messages: opts.messages,
      options: SWEEP,
      input: ALWAYS_PRESSED,
      movements: meta.movements,
      // 배틀은 늘 이긴 것으로 친다. 지는 쪽만 훑으면 이긴 뒤 가지(플래그를
      // 세우고 대사를 바꾸는 부분)를 한 번도 안 밟는다
      services: { battleResult: () => 'win', ...sweepBag() },
    })
    const commands = opts.commands ?? map
    const ctx = new ScriptContext({ vars, world, commands }, fileBytes(data, file), file)
    ctx.start(entryOffset(data, file, entry))
    for (let frame = 0; ; frame++) {
      if (frame >= FRAME_CAP) {
        throw new ScriptError(`프레임 ${FRAME_CAP}개를 넘겼다 — 되돌아 도는 중이다`, ctx)
      }
      if (!ctx.step(STEP_CAP)) break
      // 예/아니오는 정해진 답으로, 목록 메뉴는 커서가 놓인 자리로 답한다.
      // 목록은 값이 항목마다 달라서 0·1로 답하면 없는 항목을 고르는 셈이 된다
      if (world.menu?.kind === 'list') world.chooseAtCursor()
      else if (world.menu !== null) world.choose(opts.answer ?? MENU_NO)
      world.tick()
    }
    return world
  }

  it('진입점 개수가 바이트와 맞는다', () => {
    let total = 0
    for (const [i, info] of meta.files.entries()) {
      if (info.kind !== 'code') continue
      expect(countEntries(fileBytes(data, i))).toBe(info.entries)
      total += info.entries
    }
    expect(total).toBe(4079)
  })

  /** 진입점 전부를 훑고 (끝까지 간 수, 되돌아 도는 것, 해독 오류)를 준다 */
  const sweep = (opts: RunOptions = {}): { ran: number, looping: string[], errors: string[] } => {
    const errors: string[] = []
    const looping: string[] = []
    let ran = 0
    for (const [i, info] of meta.files.entries()) {
      if (info.kind !== 'code') continue
      for (let e = 0; e < info.entries; e++) {
        try {
          run(i, e, opts)
          ran++
        } catch (err) {
          const message = (err as Error).message
          if (message.includes('되돌아 도는')) looping.push(`${info.name} #${e}`)
          else errors.push(`${info.name} #${e}: ${message}`)
        }
      }
    }
    return { ran, looping, errors }
  }

  it('진입점 4079개에 해독 오류가 하나도 없다', () => {
    // 두 가지 실패를 갈라야 한다:
    //
    //   해독 오류   모르는 opcode · 파일 밖 접근. **폭이 틀렸다는 뜻**이라 0이어야 한다
    //   상한 초과   되돌아 도는 것. 아직 안 만든 대기 명령 때문이라 정상이다
    //
    // 남은 고리는 대개 목록 메뉴와 이동이다 — 기술을 고르게 하고 그 결과를
    // 변수로 받는데, 그 명령을 건너뛰면 값이 안 바뀌어 같은 자리를 다시 돈다
    const { ran, looping, errors } = sweep()
    expect(errors.slice(0, 10)).toEqual([])
    expect(ran + looping.length).toBe(4079)
    expect(looping).toHaveLength(LOOPING_ENTRIES)
  })

  it('예/아니오에 "예"로 답해도 도는 진입점 수가 같다', () => {
    // 한쪽 답으로만 훑으면 반대편 가지는 한 번도 안 밟힌다. 두 답 모두
    // 해독 오류가 0이어야 폭이 맞다고 할 수 있다
    const { ran, looping, errors } = sweep({ answer: 0 })
    expect(errors.slice(0, 10)).toEqual([])
    expect(ran + looping.length).toBe(4079)
    expect(looping).toHaveLength(LOOPING_ENTRIES_YES)
  })

  it('구현한 명령이 실제 스크립트에서 밟힌다', () => {
    // 구현했다고 등록만 해 두고 아무도 안 부르면 검증이 헛돈다
    const seen = new Set<number>()
    const spy = new Map(
      [...map].map(([op, fn]) => [op, (ctx: ScriptContext) => { seen.add(op); return fn(ctx) }]),
    )
    // ⚠️ **두 답 모두 훑는다.** 한쪽으로만 돌면 반대편 가지의 명령이 영영
    // 안 밟힌다 — 첫 배틀이 그렇다. "한판 붙자!"에 아니오로 답하면 되물어
    // 오는 자리라, 예로 답한 훑기가 없으면 `StartFirstBattle`이 안 나온다
    for (const answer of [MENU_NO, 0]) {
      const vars = new VarStore()
      for (const [i, info] of meta.files.entries()) {
        if (info.kind !== 'code') continue
        for (let e = 0; e < info.entries; e++) {
          try {
            run(i, e, { commands: spy, vars, answer })
          } catch {
            // 되돌아 도는 진입점은 위 시험이 따로 센다
          }
        }
      }
    }
    const implemented = meta.commands.length - unhandled.size
    const handledSeen = [...seen].filter((op) => !unhandled.has(op))
    // 구현했지만 실제 스크립트에 안 나오는 것들
    const idle = [...Array(meta.commands.length).keys()]
      .filter((op) => !unhandled.has(op) && !seen.has(op))
      .map((op) => meta.commands[op]!.name)
    expect(idle).toEqual(IDLE_COMMANDS)
    expect(handledSeen.length).toBe(implemented - IDLE_COMMANDS.length)
  })

  it('닿는 자리의 96.4%가 돈다 — DATA.md §2.10의 그 수', () => {
    // ⚠️ **"몇 개를 만들었나"는 눈금이 못 된다.** 안 쓰이는 명령이 태반이다.
    // 쓰는 눈금은 스크립트가 **실제로 밟는 자리**고, 문서가 그 수를 적고
    // 있으므로 여기서 같은 방법으로 세어 못 박는다 — 안 그러면 문서만 낡는다.
    //
    // 세는 법: 진입점에서 출발해 제어 흐름을 따라간다. 분기 대상까지 따라
    // 들어가고 이미 밟은 자리는 다시 안 센다. 아무 데서나 바이트를 읽으면
    // 자료 구간을 명령으로 잘못 읽는데, 진입점에서 출발하면 그럴 여지가 없다
    let reached = 0
    let ran = 0
    for (const [i, info] of meta.files.entries()) {
      if (info.kind !== 'code') continue
      const bytes = fileBytes(data, i)
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const stack: number[] = []
      for (let e = 0; e < info.entries; e++) stack.push(entryOffset(data, i, e))
      const seen = new Set<number>()
      while (stack.length > 0) {
        let at = stack.pop()!
        while (at >= 0 && at + 2 <= bytes.length && !seen.has(at)) {
          seen.add(at)
          const op = view.getUint16(at, true)
          const cmd = meta.commands[op]
          if (!cmd) break
          reached++
          if (!unhandled.has(op)) ran++
          const width = argWidth(cmd.args)
          // 분기는 마지막 인자가 PC 상대 오프셋이다
          if (/^(GoTo|Call)/.test(cmd.name) && width >= 4) {
            stack.push(at + 2 + width + view.getInt32(at + 2 + width - 4, true))
          }
          if (cmd.name === 'End' || cmd.name === 'Return' || cmd.name === 'GoTo') break
          at += 2 + width
        }
      }
    }
    expect(reached).toBe(REACHED_SITES)
    expect(ran).toBe(RUNNING_SITES)
    expect(meta.commands.length - unhandled.size).toBe(IMPLEMENTED_COMMANDS)
  })

  it('이야기를 끝내는 맵들은 자리가 하나도 안 빈다', () => {
    // 97.3%는 전체 평균이라 **여기서는 눈금이 못 된다.** 이야기를 끝까지
    // 밀려면 깨어진 세계 열 층과 전설 넷의 자리가 **하나도** 안 비어야 한다 —
    // 한 자리만 건너뛰어도 그 방에서 멈춘다.
    //
    // 지명은 롬의 지명표를 따른다: 깨어진 세계(573~583) · 신수유적 B5F(282,
    // 레지기가스) · 시작의 방(509, 아르세우스) · 신월섬 숲(320, 다크라이) ·
    // 만월섬 숲(260, 크레세리아)
    const STORY_MAPS = [
      573, 574, 575, 576, 577, 579, 580, 581, 582, 583,
      282, 509, 320, 260,
    ]
    const headers = JSON.parse(readFileSync(resolve(DATA, 'maps.json'), 'utf8')) as
      { scripts: number }[]
    const files = new Set(STORY_MAPS.map((m) => headers[m]?.scripts ?? -1))
    const missing: string[] = []
    for (const [i, info] of meta.files.entries()) {
      if (info.kind !== 'code' || !files.has(i)) continue
      const bytes = fileBytes(data, i)
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const stack: number[] = []
      for (let e = 0; e < info.entries; e++) stack.push(entryOffset(data, i, e))
      const seen = new Set<number>()
      while (stack.length > 0) {
        let at = stack.pop()!
        while (at >= 0 && at + 2 <= bytes.length && !seen.has(at)) {
          seen.add(at)
          const op = view.getUint16(at, true)
          const cmd = meta.commands[op]
          if (!cmd) break
          if (unhandled.has(op)) missing.push(`${info.name}: ${cmd.name}`)
          const width = argWidth(cmd.args)
          if (/^(GoTo|Call)/.test(cmd.name) && width >= 4) {
            stack.push(at + 2 + width + view.getInt32(at + 2 + width - 4, true))
          }
          if (cmd.name === 'End' || cmd.name === 'Return' || cmd.name === 'GoTo') break
          at += 2 + width
        }
      }
    }
    expect([...new Set(missing)]).toEqual([])
  })

/** `"1 2 4*"` → 7. 가변 길이 명령은 첫 피연산자만큼만 센다 */
function argWidth(spec: string): number {
  return spec === '' ? 0 : spec.split(' ').reduce((n, s) => n + Number(s[0]), 0)
}

  it('새 게임 초기화가 원작 표를 그대로 세운다', () => {
    // `FieldSystem_InitNewGameState`가 도는 스크립트다. 하는 일은 아직 안 나온
    // NPC를 숨기는 플래그를 세우는 것이고, 안 돌리면 마박사도 라이벌도 처음부터
    // 길에 서 있다.
    //
    // **개수로 확인한다.** 원본(`scripts_init_new_game.s`)에 `SetFlag`가 112줄,
    // `SetVar`가 3줄이고 `ClearFlag`는 없다. 그 112개가 그대로 서야 한다 —
    // 플래그 번호를 하나씩 적어 두면 그것대로 베끼는 것이 된다
    const file = meta.files.findIndex((f) => f.name === 'scripts_init_new_game')
    expect(file).toBeGreaterThanOrEqual(0)
    const vars = new VarStore()
    run(file, 0, { vars })

    let set = 0
    for (let i = 0; i < vars.flags.length * 8; i++) if (vars.checkFlag(i)) set++
    expect(set).toBe(112)

    // 변수 넷: 크기 대회의 첫 기록(33280) · 기타리스트 · 오르burgh 게이트
    // 등산가 · 연승 보너스. 첫 기록은 `InitSizeContestRecord`가 넣는 값이라
    // 새 게임에서 이미 0이 아니다 (`SystemVars_SetSizeContestRecord`)
    const nonZero = [...vars.saved].filter((v) => v !== 0)
    expect(nonZero).toHaveLength(4)
    expect(nonZero).toContain(33_280)
  })

  it('떡잎마을 기타리스트가 플래그에 따라 다른 대사로 간다', () => {
    // 스크립트 → 진입점 → 분기 → 대사창까지 한 줄로 이어지는지 보는 기준점.
    // 원본(scripts_twinleaf_town.s)에서 이 루틴은 이렇게 시작한다:
    //   GoToIfSet FLAG_HAS_POKEDEX, ...EveryoneGoesOnAdventures
    //   GoToIfGe  VAR_VISITED_LAKE_VERITY_WITH_RIVAL, 1, ...
    //   GoToIfSet FLAG_RIVAL_LEFT_HOME, ...
    const file = meta.files.findIndex((f) => f.name === 'scripts_twinleaf_town')
    expect(file).toBeGreaterThanOrEqual(0)

    /** 기타리스트는 세 번째 진입점이다 (OnTransition · CoordEvent · Guitarist) */
    const talk = (setup: (v: VarStore) => void): FieldWorld => {
      const vars = new VarStore()
      setup(vars)
      return run(file, 2, { vars, messages: TWINLEAF })
    }

    const plain = talk(() => { /* 아무 플래그도 안 선 처음 상태 */ })
    const withDex = talk((v) => { v.setFlag(FLAG_HAS_POKEDEX) })
    // 도감을 받았으면 다른 글로 간다 — 분기가 실제로 갈렸다는 뜻이다
    expect(withDex.lastMessage).not.toBe(plain.lastMessage)
    expect(withDex.lastMessage).toBe(TWINLEAF_EVERYONE_GOES)
  })

  it('떡잎마을 기타리스트의 대사가 글자까지 나온다', () => {
    // 위 시험은 번호만 본다. 번호가 맞아도 뱅크가 어긋나면 엉뚱한 글이 나오므로
    // 실제로 창에 찍힌 글자를 본다
    const file = meta.files.findIndex((f) => f.name === 'scripts_twinleaf_town')
    const vars = new VarStore()
    vars.setFlag(FLAG_HAS_POKEDEX)
    const world = run(file, 2, { vars, messages: TWINLEAF })
    const printer = new MessagePrinter(TWINLEAF[world.lastMessage!]!, new MessageSlots(), SWEEP)
    printer.finish()
    expect(printedText(printer)).toBe('모두 모험을 떠나면서\n어른이 되어가는 것이지')
  })

  it('선단시티 백화점 엘리베이터에 층이 그대로 뜬다', () => {
    // 목록 메뉴가 끝까지 이어지는지 보는 기준점이다. 항목 글은 **전역 뱅크**
    // (`TEXT_BANK_MENU_ENTRIES`)에서 오고 값은 나열 순서와 따로 붙는다 —
    // 뱅크를 잘못 짚으면 층 대신 엉뚱한 낱말이 뜨고, 값을 순서로 읽으면
    // 5층을 골랐는데 지하로 간다
    const file = meta.files.findIndex((f) => f.name === 'scripts_veilstone_store_elevator')
    const vars = new VarStore()
    const world = new FieldWorld({
      vars, options: SWEEP, input: ALWAYS_PRESSED, movements: meta.movements,
    })
    world.menuEntryTexts = MENU_ENTRIES
    const ctx = new ScriptContext({ vars, world, commands: map }, fileBytes(data, file), file)
    ctx.start(entryOffset(data, file, 0))
    let seen: readonly { text: string, value: number }[] = []
    for (let frame = 0; frame < 500; frame++) {
      if (!ctx.step(STEP_CAP)) break
      if (world.menu?.kind === 'list') {
        seen = world.menu.entries
        world.chooseAtCursor()
      }
      world.tick()
    }
    expect(seen.map((e) => `${e.text}=${String(e.value)}`)).toEqual([
      '5층=0', '4층=1', '3층=2', '2층=3', '1층=4', '지하1층=5', '그만둔다=6',
    ])
  })

  it('상수와 변수를 구분한다', () => {
    // `SetVar VAR_0x8004, 5`의 5는 변수 5번이 아니라 숫자 5다. 이걸 헷갈리면
    // 상수 인자가 전부 0이 된다
    const vars = new VarStore()
    expect(vars.get(5)).toBe(5)
    expect(vars.get(0x3fff)).toBe(0x3fff)
    vars.set(VAR_RESULT, 7)
    expect(vars.get(VAR_RESULT)).toBe(7)
    vars.set(5, 99)
    expect(vars.get(5)).toBe(5)
  })

  it('scriptID가 공용 구역을 큰 값부터 고른다', () => {
    // 경계가 2000·2500·2800·3000으로 촘촘해서 작은 것부터 보면 3000이 2000에 걸린다
    const common = resolveScript(meta, 2000, 99)
    const bg = resolveScript(meta, 2500, 99)
    const single = resolveScript(meta, 3000, 99)
    expect(common?.bank).toBe('TEXT_BANK_COMMON_STRINGS')
    expect(bg?.bank).toBe('TEXT_BANK_BG_EVENTS')
    expect(single?.file).not.toBe(common?.file)
    expect(single?.entry).toBe(0)
    // 2000 미만은 지금 맵의 파일이고 진입점은 번호 − 1이다
    expect(resolveScript(meta, 6, 99)).toEqual({ file: 99, entry: 5, bank: null, msg: null })
  })
})

/** `generated/vars_flags.txt`의 번호. 도감을 받았는가 */
const FLAG_HAS_POKEDEX = 144

/**
 * 아직 끝까지 못 가는 진입점 수.
 *
 * 목록 메뉴·통신처럼 **바깥 세계의 답**을 기다리는 명령을 아직 안 만들어서
 * 조건이 영영 안 바뀌는 자리들이다.
 *
 * **이 숫자가 늘 줄기만 하는 것은 아니다.** 명령을 만들면 스크립트가 전에는
 * 못 가던 가지로 더 깊이 들어가고, 거기서 또 다른 미구현 명령을 만나기도 한다.
 * 중요한 것은 해독 오류가 0이라는 쪽이고, 이 숫자는 **얼마나 멀리 가는가**의
 * 눈금이라 값이 바뀌면 왜 바뀌었는지 설명이 되어야 한다
 */
const LOOPING_ENTRIES = 30
/** 예/아니오에 "예"로 답했을 때. 갈라지는 가지가 달라서 수도 다르다 */
const LOOPING_ENTRIES_YES = 31

/**
 * 진입점에서 제어 흐름을 따라가 **닿는** 명령 자리와, 그중 **도는** 자리.
 *
 * DATA.md §2.10이 이 둘의 비를 적는다(96.4%). 문서에만 적어 두면 명령을 붙일
 * 때마다 조용히 낡으므로 여기서 못 박는다 — 값이 바뀌면 왜 바뀌었는지
 * 설명하고 문서를 같이 고친다
 */
const REACHED_SITES = 55_463
const RUNNING_SITES = 54_231
/** 만든 명령 수. 표는 840종이고 나머지는 폭만 알고 건너뛴다 */
const IMPLEMENTED_COMMANDS = 412

/**
 * 구현은 했지만 실제 스크립트에는 안 나오는 명령.
 *
 * 안 쓰이는 것을 구현해 두는 것 자체는 문제가 아니지만, **검증이 안 된 채로
 * 남는다**는 뜻이라 목록으로 못 박아 둔다
 */
const IDLE_COMMANDS = [
  // 0번 opcode다. 어셈블러가 실제로 안 내보낸다
  'Noop',
  'Dummy', 'CheckFlagFromVar',
  'MessageNoSkip',
  // 시작 메뉴를 스크립트가 여는 자리는 초반 안내뿐이고, 그 앞이 통신·이름
  // 짓기라 훑기가 못 닿는다
  'ShowStartMenu',
  // 필드 스크립트에 **한 번도 안 나온다**. 프런티어 쪽 것이라 닿을 자리가 없다
  'SetSpecialBGM',
  // 돈을 주는 자리는 상점·복권처럼 목록 메뉴 너머에 있다
  'GiveMoney',
  // ⚠️ **코인은 게임코너 안에서만 움직인다.** 슬롯도 룰렛도 목록 메뉴로
  // 들어가는데 그 화면이 아직 없어서, 창을 여는 `ShowCoins`까지만 밟히고
  // 닫고·다시 찍고·더하고 빼는 다섯은 그 너머에 있다
  'HideCoins', 'UpdateCoinDisplay', 'GetCoinsAmount', 'AddCoins', 'SubtractCoinsFromValue',
  // ⚠️ **폼을 묻는 자리는 파티 너머다.** 유적마을 동쪽 집의 「도롱마담 아저씨」
  // 하나뿐이고(`scripts_solaceon_town_east_house.s`), 그 앞이 파티에 도롱마담이
  // 있는지 보는 갈래라 세이브 없는 훑기가 못 지나간다
  'GetPartyMonForm',
  // 기술을 가졌는지 묻는 자리(14곳)는 전부 **파티가 있어야** 닿는다. 훑기는
  // 세이브를 안 붙이므로 파티 조회가 0으로 답하고 "가진 게 없다" 쪽으로 갈라진다
  'CheckPartyMonHasMove',
  // 재대결은 **이미 이긴 트레이너**에게 다시 말을 걸어야 나온다. 훑기는 늘
  // 깨끗한 플래그로 시작하므로 그 가지에 안 들어간다
  'GetRematchTrainerID',
  // ⚠️ **PC의 「명예의 전당」은 목록 메뉴 너머다.** 주인공 집 PC 메뉴가
  // `FLAG_GAME_COMPLETED`가 서야 그 줄을 붙이고(`CommonScript_InitPlayersPCMenu`),
  // 훑기는 깨끗한 플래그로 도니 그 항목이 아예 안 생긴다
  'OpenPCHallOfFameScreen',
  // 자전거로드에 들어서는 자리는 206번도로의 문 안쪽이고, 그 앞이 자전거를
  // 가졌는지 보는 갈래라 훑기가 못 지나간다
  'ForceBicycling',
  // ⚠️ **무쇠시티 포켓몬센터의 「모습」은 목록 메뉴 너머다.** 후보 넷을
  // `LoadTrainerAppearances`로 만들고 `ShowMenu`로 고르게 하는데, 훑기는
  // 메뉴가 답하기를 기다리지 않으므로 고른 뒤의 가지에 못 든다
  'BufferTrainerClassFromAppearance',
  // ⚠️ **원본이 안 쓰는 자리에만 있다.** 처음 고른 파트너 이름을 찍는 곳은
  // 201번도로에 딱 한 번 나오는데 그것이 `Route201_…_Unused` 안이라 어느
  // 진입점에서도 안 닿는다. 반대 성별 주인공 쪽은 필드 스크립트에 0회다
  'BufferPlayerStarterSpeciesName', 'BufferPlayerCounterpartStarterSpeciesName',
  // 맵 이름을 칸에 넣는 자리는 **날아가기 표 너머** 하나뿐이다
  'BufferMapName',
  // 무리를 알려 주는 신오방송국 사람은 **무리가 열린 뒤**에만 그 말을 한다
  // (`EnableSwarms`가 먼저다). 훑기는 깨끗한 세이브로 도니 그 가지에 못 든다
  'GetSwarmMapAndSpecies',
  'SetTargetTrainerDefeated', 'GoToIfTargetTrainerDefeated',
  // ⚠️ **꿀 나무 셋은 가방에 꿀이 있어야 열린다.** 훑기의 가방은 비어 있어서
  // `CheckItem ITEM_HONEY`가 0을 주고, 그러면 「맨 나무」 대사로 끝난다 —
  // 상태를 묻는 `GetHoneyTreeStatus`까지는 밟힌다 (PARITY §6.6)
  'SlatherHoneyTree', 'StartHoneyTreeBattle', 'StopHoneyTreeShaking',
  // 전멸 명령이 둘인데 스크립트가 쓰는 것은 앞의 하나뿐이다. 뒤엣것은 통신
  // 대전방에서만 나가는 갈래라 훑기가 못 닿는다
  'BlackOutFromBattle2',
  // 도감을 가졌는지 **묻는** 자리는 스크립트에 0회다. 주는 자리만 있다 —
  // 갈래를 가르는 것은 `FLAG_HAS_POKEDEX` 쪽이고 그건 보통 플래그다
  'CheckPokedexAcquired',
  // ⚠️ **이 넷은 필드 스크립트에 0회다.** 러닝슈즈·가방·발자국을 *묻는* 쪽은
  // 스크립트가 아니라 엔진이 본다 — 가방 아이콘을 띄울지, 뛸 수 있는지 같은
  // 판단이라 코드 쪽에 있다
  // (opcode 순서대로 늘어놓는다 — `GiveBag`과 `SetStepFlag`가 사이에 끼어 있다)
  'CheckRunningShoesAcquired', 'CheckBagAcquired',
  // ⚠️ **가방은 스크립트가 주는 것이 아니다.** `GiveBag`이 나오는 자리는
  // 떡잎마을 집 1층의 `…_Unused2` 하나뿐이고, 진짜로 켜는 것은 새 게임
  // 초기화다 (`game_start.c`의 `StartNewSave`). 우리도 거기서 켠다
  'GiveBag',
  'CheckStepFlag',
  // 라이벌이 따라붙는 자리에서 세운다. 그 앞이 `GetPlayerMapPos`로 x가
  // 110~113인지 보는 갈래라, 주인공을 안 세운 훑기는 못 지나간다
  'SetStepFlag',
  'ClearStepFlag',
  // ⚠️ **명예의 전당을 세우는 것은 스크립트가 아니다.** 전당 화면이 끝나면서
  // 코드가 켠다 (`hall_of_fame.c`). 스크립트에는 묻는 쪽만 있다
  'SetGameCompleted',
  // ⚠️ **가방 화면 너머다.** 여는 것까지는 밟지만 그 뒤는 사람이 도구를
  // 고르고 나와야 이어진다 — 훑기는 화면을 안 연다
  'OpenBag',
  'GetSelectedItem',
  // 나무열매 밭 셋도 같은 이유다 (PARITY §4.6). 훑기는 밭이 늘 빈 흙이라
  // 「싹이 텄다」와 「땄다」 쪽으로 안 간다 — 물기를 묻는 자리도 그 안이다
  'BufferBerryName',
  'GetBerryMoisture',
  'HarvestBerry',
  // 남에게 받은 마리인지 묻는 자리도 파티 너머다
  'CheckIsPartyMonOutsider',
  // ⚠️ **육성가 여덟은 파티가 있어야 닿는다.** 아저씨·아주머니의 대사가 전부
  // `GetDaycareState`로 갈리는데, 훑기는 세이브를 안 붙이므로 늘 "없음"(0)
  // 가지로 간다 — 맡긴 마리가 있어야 열리는 쪽에 이 여덟이 있다
  // (opcode 순서대로 늘어놓는다)
  'CountPartyEggs',
  // 값을 변수로 받아 돈을 깎는 쪽은 육성가와 상점 너머다
  'RemoveMoney2',
  'MoveMonToPartyFromDaycareSlot',
  'ResetDaycarePersonalityAndStepCounter',
  'GiveEggFromDaycare',
  'BufferDaycarePriceBySlot',
  'BufferDaycareGainedLevelsBySlot',
  'BufferPartyMonNicknameReturnSpecies',
  'StorePartyMonIntoDaycare',
  // 친밀도를 올리고 기술칸을 읽는 자리도 파티 너머다
  'IncreasePartyMonFriendship',
  'GetDaycareCompatibilityLevel',
  // ⚠️ **크기 대회 넷은 총어를 데리고 있어야 닿는다.** 222번도로 동쪽 집의
  // 첫 갈래가 `CheckPartyHasSpecies SPECIES_REMORAID`라, 파티가 빈 훑기는
  // 「꿈이었나 보다」 쪽으로 빠진다 (`scripts_route_222_east_house.s`)
  'CalcSizeContestResult',
  'UpdateSizeContestRecord',
  'BufferPartyPokemonSize',
  'BufferSizeContestRecord',
  // 기술 칸을 세고 비우는 자리도 파티 너머다 — 기술가르침 세 집이 전부
  // 「가르칠 포켓몬을 골라」 다음이다
  'GetPartyMonMoveCount',
  'ClearPartyMonMoveSlot',
  'GetPartyMonMove',
  'BufferPartyMoveName',
  // 모험노트는 **도감을 받은 뒤**라야 준다(`GoToIfSet FLAG_HAS_POKEDEX`).
  // 도감을 주는 명령을 아직 안 만들어서 그 플래그가 안 선다
  'GiveJournal',
  // ⚠️ **케이스에 자리가 있는지 묻는 자리는 파티 너머다** (PARITY §7.16).
  // 상호교류광장은 따라다니는 마리가 있어야 열리고, 팔파크 쪽은 GBA 연결이 있어야
  // 한다 — 넣는 쪽(`AddAccessory`)과 이름 쪽은 훑기가 실제로 밟는다
  'CanFitAccessory',
  // 상장 둘은 도감을 다 채운 사람에게만 오는 갈래라 훑기가 안 닿는다
  'ShowDiplomaSinnoh',
  'ShowDiplomaNationalDex',
  // ⚠️ **셋 다 전국도감 뒤의 자리다.** 트로피가든에 특별한 것이 뜨는 것도,
  // 무리가 열리는 것도 이야기를 끝낸 뒤라 훑기가 그 가지에 못 들어간다 —
  // `AddTrophyGardenMon`은 포켓몬저택 사무실, `EnableSwarms`는 신오방송국이다
  'AddTrophyGardenMon', 'GetTrophyGardenSlot1Species',
  // 레벨을 세거나 성격으로 찾는 자리도 파티가 있어야 열린다
  // ⚠️ **화석 셋은 플래그 121이 서 있어야 닿는다.** 탄갱박물관 안쪽 사람의
  // 첫 갈래가 그 플래그로 갈리고, 훑기는 늘 깨끗한 플래그라 「아직 안 열렸다」
  // 쪽으로 빠진다. 셋 다 실제로 도는 것은 `script/fossil.test.ts`가 본다
  'GetFossilCount', 'GetSpeciesFromFossil', 'FindFossilAtThreshold',
  'CountPartyMonsBelowLevelThreshold',
  // ⚠️ **대습초원 전망대는 안 만든다** (PARITY §7.7). 들판시티 전망대 안이라
  // 훑기가 그 방까지 못 들어간다 — 길잡이등대 쌍안경 쪽은 밟힌다
  'StartGreatMarshLookout',
  'FindPartySlotWithNature',
  // 상호교류광장 둘은 **따라다니는 마리가 있어야** 닿는다 (PARITY §7.8) — 훑기는
  // 파티가 비어 있어서 광장에 들어가는 갈래 자체가 안 열린다
  'ClearAmitySquareStepCount', 'CalcAmitySquareFoundAccessory',
  'EnableSwarms',
  // ⚠️ **기술 되살리기 다섯은 파티에서 한 마리를 고른 뒤에 온다.** 고르는
  // 명령(`SelectMoveTutorPokemon` 갈래)이 아직 없어서 훑기가 그 앞에서 멈춘다 —
  // 명령 자체는 실제 스크립트에 있다 (§10 「기술가르침」 39자리)
  'CheckHasLearnableReminderMoves', 'OpenMoveReminderMenu', 'CheckLearnedReminderMove',
  'OpenMoveTutorMenu', 'CheckLearnedTutorMove',
  // ⚠️ **NPC 교환 다섯도 같은 이유다.** 앞이 `SelectPokemonToTrade` 매크로고
  // 그 끝의 `GetSelectedPartySlot`이 세이브 없는 훑기에서 0xFF(안 골랐다)를
  // 답한다 — 그러면 바로 뒤의 `GoToIfEq …, 0xFF`가 "기다리고 있을게" 쪽으로
  // 갈라져서 교환 본체에 못 든다. 화면을 여는 `OpenPartyMenuForTrade`까지는
  // 밟힌다. 넷 다 실제 스크립트에 있다 (PARITY §10)
  'InitNPCTrade', 'GetNPCTradeSpecies', 'GetNPCTradeRequestedSpecies',
  'StartNPCTrade', 'FinishNPCTrade',
  // ⚠️ **리본 일곱 중 셋은 훑기가 못 닿는다** (PARITY §9.2). 붙이는 자리는
  // 파티가 있어야 하고(노력리본은 노력치 510, 발자국리본은 최대 친밀도),
  // 이름을 부르는 자리는 그 뒤다. 읽는 넷은 밟히므로 리본신드롬 들머리가
  // 실제로 0을 받아 제 대사로 닫힌다
  'CountPartyMonRibbons_Unused', 'SetPartyMonRibbon', 'BufferRibbonName',
  'GetPartyMonType',
  // 박스 안의 별명을 부르는 자리는 **보관 시스템 화면 너머**다
  'BufferMonNicknameFromPC',
  // ⚠️ **테오키스는 배포 이벤트다** (§9). 축복시티의 유성이 폼을 갈아 끼우는데
  // (`scripts_veilstone_city.s`), 그 앞이 파티에 테오키스가 있는지 보는 갈래다
  'ChangeDeoxysForm',
  // 포켓치를 잠깐 치우는 쪽은 실제 스크립트에 안 나온다 — 되살리는
  // `ShowPoketch`만 쓰인다
  'HidePoketch',
  // ⚠️ **흔드는 자리는 눈덮인신전 지하 5층 하나뿐이다.** 레지기가스가 깨어나는
  // 그 장면인데, 그 앞이 레지 셋을 파티에서 세는 갈래라 훑기가 못 지나간다
  'ShakeObject',
  'HasCoinsFromValue', 'CheckCanAddCoins',
  // 장식을 도로 빼는 자리는 원작 스크립트에 아예 없다 — 명령만 있다
  'ScrCmd_RemoveAccessory',
  // TV가 켜진 방의 첫 음량이다. 같은 파일에서 **앞선 진입점**이 그 변수를
  // 1로 바꿔 놓고(방송이 끝나는 장면), 훑기는 변수를 이어 쓰므로 뒤에 오는
  // `OnTransition`의 `== 0` 갈래가 이미 닫혀 있다
  'SetInitialVolumeForSequence',
  // ⚠️ **BP를 벌 곳이 없다** (PARITY §12.3). 다섯 시설이 §9라 주는 명령이
  // 필드 스크립트에 0회고, 읽고 찍는 둘은 교환 코너의 목록 메뉴 너머다 —
  // 창을 여는 `ShowBattlePoints`와 값을 견주는 `CheckBattlePoints`까지는 밟힌다
  'UpdateBPDisplay', 'GetBattlePoints', 'GiveBattlePoints', 'RemoveBattlePoints',
  'SubtractCoinsFromVar',
  // `SetSpecialBGM`과 같다 — 필드 스크립트에 0회다
  'IsSequencePlaying',
  'FindPartySlotWithSpecies',
  'ResetMoveSlot',
  // 트레이너 이름·타입 이름을 칸에 넣는 자리도 전부 파티나 메뉴 너머다
  'BufferTrainerName',
  'BufferTypeName',
  // 개수 확인은 가방 화면에서 고른 도구를 되묻는 자리라 훑기가 못 밟는다
  'GetItemQuantity',
  // ⚠️ **로토무 가전 방 셋은 로토무가 있어야 열린다.** `scripts_rotoms_room.s`
  // 하나에 다 모여 있고, 그 앞이 `GetPartyRotomCountAndFirst`로 파티를 세는
  // 갈래다 — 세이브 없는 훑기는 0마리로 답해서 「아무 일도 안 일어났다」로 빠진다
  'GetRotomFormsInSave', 'SetRotomForm', 'GetPartyMonForm2',
  // ⚠️ **기라티나를 이긴 뒤에만 도는 줄이다** (`…_RemoveGiratina`). 그 방의
  // `OnLoad`가 「없애라」 플래그를 보고 갈리는데 훑기는 늘 깨끗한 플래그다
  'ResetDistortionWorldPersistedCameraAngles',
  'CheckPartyHasHeldItem',
  // 위와 같은 자리다 — 전당 항목을 고른 **뒤에** 나오는 줄이라 더 못 닿는다
  'CheckIsHallOfFameCorrupted',
]

/**
 * 떡잎마을 대사 뱅크(554번)에서 필요한 만큼.
 *
 * 파일에서 읽지 않고 여기 박아 둔 이유: 이 시험이 보는 것은 **번호가 글로
 * 이어지는가**지 추출기가 맞는가가 아니다. 추출기 쪽은 `dialogue.test.ts`가 본다
 */
/**
 * `TEXT_BANK_MENU_ENTRIES`(미국 361번) — 전역 메뉴의 항목 글 280개.
 *
 * 여기만 파일에서 읽는다. 다른 시험은 "번호가 글로 이어지는가"를 보므로 글을
 * 박아 두지만, 이 시험이 보려는 것 자체가 **전역 뱅크를 제대로 짚는가**다
 */
const MENU_ENTRIES: readonly string[] = present && existsSync(MENU_ENTRIES_FILE)
  ? JSON.parse(readFileSync(MENU_ENTRIES_FILE, 'utf8'))
  : []

const TWINLEAF_EVERYONE_GOES = 7
const TWINLEAF: readonly string[] = [
  '{SIZE 200}꽈당!!{SIZE 100}\r',
  '{STRVAR_1 3, 0, 0}: 뭐야-!\r어라, 너 {STRVAR_1 3, 1, 6}잖아!\r이봐! 마박사님을\n만나러 갈 거야! 빨리 와!\r',
  '{STRVAR_1 3, 0, 0}: 아! 깜빡한 게 있다!\r',
  '오오! {STRVAR_1 3, 0, 0} 아닌가\n{STRVAR_1 3, 1, 3} 찾았단다\r그 녀석 집에\n가보는 건 어때?\r',
  '오오! {STRVAR_1 3, 0, 0} 아닌가\n{STRVAR_1 3, 1, 3} 찾았단다\r그 녀석 집까지\n가보는 건 어때?',
  '오오! {STRVAR_1 3, 0, 0} 아닌가\n{STRVAR_1 3, 1, 3} 바로 조금 전에\f달려나갔단다!\r아직 그 주변에 있을 것 같으니까\n어서 쫓아가 보는 게 어때?',
  '{STRVAR_1 3, 0, 6}라면\n좀 전에 엄청난 기세로 외출하던데!\r...아까 부딪혔는데\n욱신욱신거려서 아파\f그 녀석 강인해지긴 했나 봐',
  '모두 모험을 떠나면서\n어른이 되어가는 것이지',
]
