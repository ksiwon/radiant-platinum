// 키우미집 할머니가 맡길 마리를 **고르게 한다** (COMPLETION 2단계 · `scripts_day_care_common.s`)
//
// 없던 동안은 파티 화면이 안 열리고 0x8000에 남은 0으로 늘 맨 앞 마리를 맡겼다. 원작 스크립트를 그대로 돌려
// 화면이 키우미집 갈래로 열리는지 · 고른 자리가 맡겨지는지 · 「능력치를 본다」 뒤 그 자리로 다시 열리는지를 본다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { buildCommands } from './commands'
import { ScriptContext } from './context'
import { entryOffset, fileBytes, parseScriptMeta } from './data'
import { VarStore } from './vars'
import { FieldWorld, type FieldServices } from './world'
import { DATA, withData } from '../../data/romData.testkit'
import { stubParty } from './services.testkit'

const maybe = withData('scripts.json', 'scripts.bin')
const MENU_YES = 0

maybe('키우미집 할머니', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
  const { map } = buildCommands(meta.commands)
  const file = meta.files.findIndex((f) => f.name === 'scripts_day_care_common')

  /** 할머니(둘째 진입점)를 끝까지 — 예/아니오는 「예」, 파티 화면은 `picks`의 차례대로 답한다 */
  function lady(picks: { slot: number, summary: boolean }[], summaryEnd = 0) {
    const log = { opened: [] as { daycare?: boolean, slot?: number }[], stored: [] as number[], summaries: [] as number[] }
    let last = picks[0]!
    const services: FieldServices = {
      party: { ...stubParty, count: () => 3, species: () => 25, aliveExcept: () => 2, revertForms: () => 0 },
      eggs: { nonEggs: () => 3, count: () => 0, firstNonEgg: () => 0, hatchFirst: () => {} },
      aliveAndBoxMons: () => 3,
      daycare: {
        state: () => 0, compatibility: () => 0, hasEgg: () => false,
        store: (slot) => { log.stored.push(slot) }, withdraw: () => 0,
        price: () => ({ money: 100, levels: 0 }), takeEgg: () => false, resetEgg: () => {}, info: () => null,
      },
      chooseMon: {
        open: (opts) => { log.opened.push(opts ?? {}); last = picks[log.opened.length - 1] ?? last },
        picked: () => last.slot, summary: () => last.summary,
      },
      monSummary: { open: (slot) => { log.summaries.push(slot) }, slot: () => summaryEnd },
      menuOpen: () => false,
    }
    const vars = new VarStore()
    const world = new FieldWorld({ vars, input: () => ({ pressed: true, held: true }), movements: meta.movements, services })
    const ctx = new ScriptContext({ vars, world, commands: map }, fileBytes(data, file), file)
    ctx.start(entryOffset(data, file, 1))
    for (let frame = 0; frame < 3000 && ctx.step(200_000); frame++) {
      if (world.menu !== null) world.choose(MENU_YES)
      world.tick()
    }
    return log
  }

  it('파티 화면이 키우미집 갈래로 열리고, 고른 자리가 맡겨진다', () => {
    const log = lady([{ slot: 2, summary: false }])
    expect(log.opened[0]).toEqual({ daycare: true, slot: 0 })
    expect(log.stored[0]).toBe(2)
  })

  it('「능력치를 본다」면 그 자리의 요약을 열고, 닫힌 자리로 파티 화면을 다시 연다', () => {
    const log = lady([{ slot: 1, summary: true }, { slot: 2, summary: false }], 2)
    expect(log.summaries).toEqual([1])
    expect(log.opened[1]).toEqual({ daycare: true, slot: 2 })
    expect(log.stored[0]).toBe(2)
  })

  it('안 고르고 나가면 아무도 안 맡긴다', () => {
    const log = lady([{ slot: 0xff, summary: false }])
    expect(log.stored).toEqual([])
  })
})
