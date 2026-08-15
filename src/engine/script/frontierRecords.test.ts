// 배틀프런티어의 기록 기계는 얼어붙지 않는다 (PARITY §9.3)
//
// 시설 넷은 안 만들었고 접수원은 원작 대사로 돌려보낸다. 그런데 **안쪽 벽의
// 기록 기계는 아니었다** — 배틀프런티어에서 다섯 건물이 다 워프로 열려 있어
// 걸어 들어가 읽을 수 있고, 배틀홀 것을 읽으면 「포켓몬 고르기」의 답을
// 아무도 안 적어서 영영 돌았다 (실측: 6,000프레임에 6,042보). 밖에서 보면
// 화면만 껌뻑이고 발이 묶인 채 굳는다 — 통신에서 본 것과 같은 덫이다 (§9.4).
//
// 여기서 재는 것은 「고르는 자리 다섯이 다 스스로 닫히는가」다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCommands } from './commands'
import { ScriptContext } from './context'
import { entryOffset, fileBytes, parseScriptMeta } from './data'
import { TEXT_SPEED, type PrinterOptions } from './printer'
import { VarStore } from './vars'
import { FieldWorld } from './world'
import { DIR } from './movement'
import { DATA, withData } from '../../data/romData.testkit'
import { stubFieldMoves, stubLabels, stubParty, stubTrainerInfo } from './services.testkit'

const maybe = withData('scripts.json', 'scripts.bin')
const SWEEP: PrinterOptions = { speed: TEXT_SPEED.instant, canSkip: true, autoScroll: false }

/** 기계 다섯. 진입점 차례는 디컴프의 `ScriptEntry`다 */
const MACHINES = [
  { entry: 0, what: '배틀타워' },
  { entry: 1, what: '배틀타워(중복 진입점)' },
  { entry: 2, what: '배틀팩토리' },
  { entry: 3, what: '⚠️ 배틀홀 — 여기가 굳었다' },
  { entry: 4, what: '배틀캐슬' },
  { entry: 5, what: '배틀아케이드' },
] as const

/** 답을 안 하면 그 자리가 도로 도는 명령들 */
const MUST_ANSWER = [
  'ShowBattleHallRecordMonSelectionMenu', 'CallBattleHallLobbyFunction', 'OpenFrontierRecordsApp',
] as const

maybe('배틀프런티어 기록 기계', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
  const { map, unhandled } = buildCommands(meta.commands)

  const FILE = meta.files.findIndex((f) => f.name === 'scripts_battle_frontier_records')

  /** 기계를 읽는다. 메뉴는 `pick`번째를 고르고, 넷 뒤로는 손을 뗀다 */
  function read(entry: number, pick: number) {
    const vars = new VarStore()
    const world = new FieldWorld({
      vars, options: SWEEP, input: () => ({ pressed: true, held: true }),
      movements: meta.movements,
      services: {
        party: stubParty, labels: stubLabels, trainerInfo: stubTrainerInfo,
        fieldMoves: stubFieldMoves,
      },
    })
    world.player = { x: 8, z: 8, visible: true, dir: DIR.north }
    const ctx = new ScriptContext({ vars, world, commands: map }, fileBytes(data, FILE), FILE)
    ctx.start(entryOffset(data, FILE, entry))
    let ended = false
    let menus = 0
    let steps = 0
    for (let frame = 0; frame < 6000; frame++) {
      if (!ctx.step(200_000)) { ended = true; break }
      steps += 1
      world.tick()
      if (world.menu !== null && menus < 4) {
        const list = world.menu.entries
        menus += 1
        world.choose(list[Math.min(pick, list.length - 1)]?.value ?? 0)
      }
    }
    return { ended, waiting: world.menu !== null, steps }
  }

  it('그 파일이 기록 기계다', () => {
    expect(FILE).toBeGreaterThanOrEqual(0)
    expect(meta.files[FILE]?.entries).toBe(MACHINES.length)
  })

  it('⚠️ 도로 돌게 만드는 명령 셋이 다 만들어져 있다', () => {
    for (const name of MUST_ANSWER) {
      const op = meta.commands.findIndex((c) => c?.name === name)
      expect(op, `${name}이 명령 표에 없다`).toBeGreaterThanOrEqual(0)
      expect(unhandled.has(op), `${name}이 안 만들어져 있다`).toBe(false)
    }
  })

  describe.each(MACHINES)('$what', ({ entry }) => {
    it.each([0, 1, 2, 3])('고름 %i — 얼어붙지 않는다', (pick) => {
      const got = read(entry, pick)
      // 끝났거나 다음 답을 기다리는 중이거나. **끝없이 도는 갈래는 없다**
      expect(got.ended || got.waiting, `${got.steps}보를 돌고도 안 멈췄다`).toBe(true)
    })
  })
})
