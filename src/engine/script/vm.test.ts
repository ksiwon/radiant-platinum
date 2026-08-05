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
import { describe, expect, it } from 'vitest'
import { parseScriptMeta, countEntries, entryOffset, fileBytes, resolveScript } from './data'
import { buildCommands } from './commands'
import { ScriptContext, ScriptError, type CommandFn } from './context'
import { MessagePrinter, printedText, TEXT_SPEED, type PrinterOptions } from './printer'
import { MessageSlots } from './text'
import { VarStore, VAR_RESULT } from './vars'
import { FieldWorld, MENU_NO } from './world'

const DATA = resolve(__dirname, '../../../public/data')
const present = existsSync(resolve(DATA, 'scripts.json')) && existsSync(resolve(DATA, 'scripts.bin'))
const maybe = present ? describe : describe.skip

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
      vars, messages: opts.messages, options: SWEEP, input: ALWAYS_PRESSED,
    })
    const commands = opts.commands ?? map
    const ctx = new ScriptContext({ vars, world, commands }, fileBytes(data, file), file)
    ctx.start(entryOffset(data, file, entry))
    for (let frame = 0; ; frame++) {
      if (frame >= FRAME_CAP) {
        throw new ScriptError(`프레임 ${FRAME_CAP}개를 넘겼다 — 되돌아 도는 중이다`, ctx)
      }
      if (!ctx.step(STEP_CAP)) break
      if (world.menu !== null) world.choose(opts.answer ?? MENU_NO)
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
    // 대기 명령을 만들 때마다 줄어야 하는 숫자다
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
    const vars = new VarStore()
    for (const [i, info] of meta.files.entries()) {
      if (info.kind !== 'code') continue
      for (let e = 0; e < info.entries; e++) {
        try {
          run(i, e, { commands: spy, vars })
        } catch {
          // 되돌아 도는 진입점은 위 시험이 따로 센다
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
    expect(resolveScript(meta, 6, 99)).toEqual({ file: 99, entry: 5, bank: null })
  })
})

/** `generated/vars_flags.txt`의 번호. 도감을 받았는가 */
const FLAG_HAS_POKEDEX = 144

/**
 * 대기 명령이 없어서 되돌아 도는 진입점 수.
 *
 * 목록 메뉴·이동 대기·배틀처럼 **바깥 세계의 답**을 기다리는 명령을 아직 안
 * 만들어서다. 그 명령을 하나씩 만들 때마다 이 숫자가 줄어야 한다
 */
const LOOPING_ENTRIES = 36
/** 예/아니오에 "예"로 답했을 때. 갈라지는 가지가 달라서 수도 다르다 */
const LOOPING_ENTRIES_YES = 40

/**
 * 구현은 했지만 실제 스크립트에는 안 나오는 명령.
 *
 * 안 쓰이는 것을 구현해 두는 것 자체는 문제가 아니지만, **검증이 안 된 채로
 * 남는다**는 뜻이라 목록으로 못 박아 둔다
 */
const IDLE_COMMANDS = ['Dummy', 'CheckFlagFromVar', 'MessageNoSkip', 'MessageSynchronized']

/**
 * 떡잎마을 대사 뱅크(554번)에서 필요한 만큼.
 *
 * 파일에서 읽지 않고 여기 박아 둔 이유: 이 시험이 보는 것은 **번호가 글로
 * 이어지는가**지 추출기가 맞는가가 아니다. 추출기 쪽은 `dialogue.test.ts`가 본다
 */
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
