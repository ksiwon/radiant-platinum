// 스크립트 VM 검증 (DATA.md §2.10)
//
// 결정적인 시험은 하나다: **진입점 4079개를 전부 돌려 본다.** 안 만든 명령은
// 표의 폭으로 건너뛰므로 끝까지 갈 수 있고, 폭이 하나라도 틀리면 그 자리에서
// 모르는 opcode나 파일 밖 접근으로 터진다.
//
// 눈으로 확인할 수 없는 것을 잡는 게 목적이다 — 실행이 "그럴듯하게" 이어지면서
// 사실은 엉뚱한 명령을 밟고 있는 상황. 실제로 초기화 표 549개를 코드로 읽었을 때
// 예외 하나 없이 통과한 적이 있다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseScriptMeta, countEntries, entryOffset, fileBytes, resolveScript } from './data'
import { buildCommands } from './commands'
import { ScriptContext } from './context'
import { VarStore, VAR_RESULT } from './vars'

const DATA = resolve(__dirname, '../../../public/data')
const present = existsSync(resolve(DATA, 'scripts.json')) && existsSync(resolve(DATA, 'scripts.bin'))
const maybe = present ? describe : describe.skip

/** 한 진입점이 이 이상 명령을 밟으면 되돌아 도는 것이다 */
const STEP_CAP = 100_000

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
   * `step()`은 명령이 "기다린다"고 할 때까지 도는데, 지금은 안 만든 명령을 전부
   * 건너뛰므로 기다리는 일이 없다 — 한 번 부르면 `End`까지 간다. 상한은
   * `step()` 안에 있다 (뒤로 뛰는 고리는 바깥에서 못 센다).
   */
  const run = (file: number, entry: number, commands = map, vars = new VarStore()): void => {
    const ctx = new ScriptContext({ vars, commands }, fileBytes(data, file), file)
    ctx.start(entryOffset(data, file, entry))
    while (ctx.state !== 'stopped') {
      if (!ctx.step(STEP_CAP)) break
      if (ctx.state === 'waiting') break
    }
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

  it('진입점 4079개에 해독 오류가 하나도 없다', () => {
    // 두 가지 실패를 갈라야 한다:
    //
    //   해독 오류   모르는 opcode · 파일 밖 접근. **폭이 틀렸다는 뜻**이라 0이어야 한다
    //   상한 초과   되돌아 도는 것. 아직 안 만든 대기 명령 때문이라 정상이다
    //
    // 예를 들어 기술 삭제 아저씨는 `ShowYesNoMenu VAR_RESULT`로 답을 받는데,
    // 그걸 건너뛰면 VAR_RESULT가 0(=예)에 머물러 같은 자리를 다시 돈다.
    const decodeErrors: string[] = []
    const looping: string[] = []
    let ran = 0
    for (const [i, info] of meta.files.entries()) {
      if (info.kind !== 'code') continue
      for (let e = 0; e < info.entries; e++) {
        try {
          run(i, e)
          ran++
        } catch (err) {
          const message = (err as Error).message
          if (message.includes('되돌아 도는')) looping.push(`${info.name} #${e}`)
          else decodeErrors.push(`${info.name} #${e}: ${message}`)
        }
      }
    }
    expect(decodeErrors.slice(0, 10)).toEqual([])
    expect(ran + looping.length).toBe(4079)
    // 대기 명령을 만들 때마다 줄어야 하는 숫자다
    expect(looping).toHaveLength(LOOPING_ENTRIES)
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
          run(i, e, spy, vars)
        } catch {
          // 되돌아 도는 진입점은 위 시험이 따로 센다
        }
      }
    }
    const implemented = meta.commands.length - unhandled.size
    const handledSeen = [...seen].filter((op) => !unhandled.has(op))
    // 구현한 것 중 실제 스크립트에 안 나오는 것은 `Dummy`뿐이다
    const idle = [...Array(meta.commands.length).keys()]
      .filter((op) => !unhandled.has(op) && !seen.has(op))
      .map((op) => meta.commands[op]!.name)
    expect(idle).toEqual(IDLE_COMMANDS)
    expect(handledSeen.length).toBe(implemented - IDLE_COMMANDS.length)
  })

  it('떡잎마을 기타리스트가 플래그에 따라 다른 대사로 간다', () => {
    // 스크립트 → 진입점 → 분기가 한 줄로 이어지는지 보는 기준점.
    // 원본(scripts_twinleaf_town.s)에서 이 루틴은 이렇게 시작한다:
    //   GoToIfSet FLAG_HAS_POKEDEX, ...EveryoneGoesOnAdventures
    //   GoToIfGe  VAR_VISITED_LAKE_VERITY_WITH_RIVAL, 1, ...
    //   GoToIfSet FLAG_RIVAL_LEFT_HOME, ...
    const file = meta.files.findIndex((f) => f.name === 'scripts_twinleaf_town')
    expect(file).toBeGreaterThanOrEqual(0)

    /** 그 진입점이 어느 `Message` 번호에서 멈추는지 */
    const messageOf = (setup: (v: VarStore) => void): number => {
      const vars = new VarStore()
      setup(vars)
      let message = -1
      const commands = new Map(map)
      const messageOp = meta.commands.findIndex((c) => c.name === 'Message')
      commands.set(messageOp, (ctx) => {
        message = ctx.readByte()
        ctx.stop()
        return true
      })
      // 기타리스트는 세 번째 진입점이다 (OnTransition · CoordEvent · Guitarist)
      run(file, 2, commands, vars)
      return message
    }

    const plain = messageOf(() => { /* 아무 플래그도 안 선 처음 상태 */ })
    const withDex = messageOf((v) => { v.setFlag(FLAG_HAS_POKEDEX) })
    expect(plain).toBeGreaterThanOrEqual(0)
    expect(withDex).toBeGreaterThanOrEqual(0)
    // 도감을 받았으면 다른 글로 간다 — 분기가 실제로 갈렸다는 뜻이다
    expect(withDex).not.toBe(plain)
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
 * 예/아니오 메뉴·이동 대기·배틀처럼 **바깥 세계의 답**을 기다리는 명령을 아직
 * 안 만들어서다. 그 명령을 하나씩 만들 때마다 이 숫자가 줄어야 한다
 */
const LOOPING_ENTRIES = 37

/**
 * 구현은 했지만 실제 스크립트에는 안 나오는 명령.
 *
 * 안 쓰이는 것을 구현해 두는 것 자체는 문제가 아니지만, **검증이 안 된 채로
 * 남는다**는 뜻이라 목록으로 못 박아 둔다
 */
const IDLE_COMMANDS = ['Noop', 'Dummy', 'CheckFlagFromVar', 'SetFlagFromVar']
