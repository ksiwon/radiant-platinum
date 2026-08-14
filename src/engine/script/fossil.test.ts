// 화석을 되살리는 사람을 **실제 스크립트로** 돌린다 (PARITY §4.9)
//
// `world/fossil.test.ts`가 표를 보고, 여기서는 탄갱박물관의 스크립트가 그
// 자리까지 실제로 도달하는지를 본다.
//
// ⚠️ **여기서 포켓몬이 나오지는 않는다.** 화석을 건네면 그 자리에서 되살아나는
// 것이 아니라, **되살릴 종족을 변수 16564에 적어 두고** 화석만 가방에서 뺀다 —
// 실제로 받는 것은 한참 걸은 뒤에 다시 말을 걸 때다. 그 변수가 0이 아니면 새
// 화석을 안 받는 것도 스크립트 첫머리에 있다.
//
// ⚠️ **화석이 없으면 갈래가 갈린다.** 가방이 비었을 때 `GetFossilCount`가 0을
// 주면 아무것도 안 빼고 끝나야 한다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { buildCommands } from './commands'
import { ScriptContext } from './context'
import { entryOffset, fileBytes, parseScriptMeta } from './data'
import { TEXT_SPEED, type PrinterOptions } from './printer'
import { VarStore } from './vars'
import { FieldWorld, MENU_YES, type FieldServices } from './world'
import { FOSSILS } from '../world/fossil'
import { DATA, withData } from '../../data/romData.testkit'

const maybe = withData('scripts.json', 'scripts.bin')

const SWEEP: PrinterOptions = { speed: TEXT_SPEED.instant, canSkip: true, autoScroll: false }
const ALWAYS_PRESSED = () => ({ pressed: true, held: true })

/** 탄갱박물관. 되살려 주는 사람이 여기 있다 */
const FILE = 65

maybe('화석 — 탄갱박물관 스크립트', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
  const { map } = buildCommands(meta.commands)

  interface Log {
    /** 가방에서 뺀 것들 */
    removed: number[]
    /** 되살릴 종족이 적힌 변수 (`VAR_REVIVING_FOSSIL_SPECIES`) */
    species: number
    lists: number
  }

  /** `have`가 가방의 화석이다 (도구 번호 → 개수) */
  const play = (have: Record<number, number>, picked: number): Log => {
    const log: Log = { removed: [], species: 0, lists: 0 }
    const vars = new VarStore()
    // 되살리는 갈래는 플래그 121이 서 있어야 열린다 (그전에는 다른 대사다)
    vars.setFlag(121)
    const services: FieldServices = {
      bag: {
        pocketOf: () => 0,
        add: () => true,
        remove: (item) => { log.removed.push(item); return true },
        canFit: () => true,
        quantity: (item) => have[item] ?? 0,
        pocketHasItems: () => true,
        name: () => '화석',
      },
      menuOpen: () => false,
      battleResult: () => 'win',
    }
    const world = new FieldWorld({
      vars, options: SWEEP, input: ALWAYS_PRESSED, movements: meta.movements, services,
    })
    const info = meta.files[FILE]!
    for (let e = 0; e < info.entries; e++) {
      const ctx = new ScriptContext({ vars, world, commands: map }, fileBytes(data, FILE), FILE)
      try {
        ctx.start(entryOffset(data, FILE, e))
      } catch { continue }
      for (let frame = 0; frame < 4000; frame++) {
        if (!ctx.step(100_000)) break
        if (world.menu?.kind === 'list') {
          log.lists++
          for (let i = 0; i < picked; i++) world.moveCursor(1)
          world.chooseAtCursor()
        } else if (world.menu !== null) world.choose(MENU_YES)
        world.tick()
      }
    }
    log.species = vars.get(VAR_FOSSIL_SPECIES)
    return log
  }

  it('⚠️ 하나만 있으면 목록을 안 연다 — 그것으로 정해진다', () => {
    const log = play({ 105: 1 }, 0)
    expect(log.lists).toBe(0)
    expect(log.species).toBe(408)
    // 건넨 화석은 가방에서 빠진다
    expect(log.removed).toContain(105)
  })

  it('화석이 없으면 아무것도 안 빠진다', () => {
    const log = play({}, 0)
    expect(log.removed).toEqual([])
    expect(log.species).toBe(0)
  })

  it('일곱 화석이 다 제 종족으로 적힌다', () => {
    for (const f of FOSSILS) {
      const log = play({ [f.item]: 1 }, 0)
      expect(log.species, `도구 ${String(f.item)}`).toBe(f.species)
      expect(log.removed, `도구 ${String(f.item)}`).toContain(f.item)
    }
  })

  it('⚠️ 여럿이면 목록이 열리고 표 차례가 곧 줄 차례다', () => {
    // 나선화석(101)과 두개화석(105). 표에서 나선이 앞이라 첫 줄이다
    const first = play({ 101: 1, 105: 1 }, 0)
    expect(first.lists).toBeGreaterThan(0)
    expect(first.species).toBe(138)
    expect(play({ 101: 1, 105: 1 }, 1).species).toBe(408)
  })
})

/** 되살릴 종족을 적어 두는 자리 (`VAR_REVIVING_FOSSIL_SPECIES`) */
const VAR_FOSSIL_SPECIES = 16564
