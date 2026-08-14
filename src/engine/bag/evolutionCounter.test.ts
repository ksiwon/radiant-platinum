// 장막백화점 4층의 진화 창구 (PARITY §12.1)
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DECOR_MART_IDS, EVOLUTION_COUNTER_STOCK, EVOLUTION_STONES, FOSSILS, isDecorMart,
} from './evolutionCounter'
import { FIRST_EXTRA_ITEM, ITEM_LINKING_CORD, ITEM_PRISM_SCALE } from './extraItems'
import { buildCommands } from '../script/commands'
import { ScriptContext } from '../script/context'
import { entryOffset, fileBytes, parseScriptMeta } from '../script/data'
import { TEXT_SPEED, type PrinterOptions } from '../script/printer'
import { VarStore } from '../script/vars'
import { FieldWorld, type FieldServices } from '../script/world'
import { DIR } from '../script/movement'
import { DATA, withData } from '../../data/romData.testkit'

describe('재고', () => {
  it('화석 일곱 · 진화의돌 아홉 · 롬 밖의 둘이다', () => {
    expect(FOSSILS).toHaveLength(7)
    expect(EVOLUTION_STONES).toHaveLength(9)
    expect(EVOLUTION_COUNTER_STOCK).toHaveLength(18)
    expect(EVOLUTION_COUNTER_STOCK).toContain(ITEM_LINKING_CORD)
    expect(EVOLUTION_COUNTER_STOCK).toContain(ITEM_PRISM_SCALE)
  })

  it('⚠️ 롬 밖의 둘 말고는 전부 롬 번호다', () => {
    for (const id of EVOLUTION_COUNTER_STOCK) {
      if (id === ITEM_LINKING_CORD || id === ITEM_PRISM_SCALE) continue
      expect(id, `도구 ${String(id)}`).toBeLessThan(FIRST_EXTRA_ITEM)
    }
  })

  it('같은 것이 두 번 안 나온다', () => {
    expect(new Set(EVOLUTION_COUNTER_STOCK).size).toBe(EVOLUTION_COUNTER_STOCK.length)
  })

  it('창구 번호는 둘뿐이다', () => {
    for (const id of DECOR_MART_IDS) expect(isDecorMart(id)).toBe(true)
    expect(isDecorMart(2)).toBe(false)
  })
})

const maybe = withData('scripts.json', 'scripts.bin')
const SWEEP: PrinterOptions = { speed: TEXT_SPEED.instant, canSkip: true, autoScroll: false }

/** `C07R0204` — 장막백화점 4층 */
const FILE = 145

maybe('창구가 실제로 열린다', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
  const { map } = buildCommands(meta.commands)

  /** 그 파일의 진입점을 하나씩 걸어 보고, 상점이 열리면 그 재고를 적는다 */
  const openedStocks = (): number[][] => {
    const out: number[][] = []
    const info = meta.files[FILE]
    if (!info) return out
    for (let entry = 0; entry < info.entries; entry++) {
      const vars = new VarStore()
      let closed = false
      const services: FieldServices = {
        openShop: (items) => { out.push([...items]); closed = false },
        // 상점이 닫혀야 스크립트가 이어진다
        menuOpen: () => { closed = !closed; return !closed },
      }
      const world = new FieldWorld({
        vars, options: SWEEP, input: () => ({ pressed: true, held: true }),
        movements: meta.movements, services,
      })
      world.player = { x: 0, z: 0, visible: true, dir: DIR.north }
      world.target = { x: 0, z: 1, dir: DIR.south, visible: true }
      const ctx = new ScriptContext({ vars, world, commands: map }, fileBytes(data, FILE), FILE)
      ctx.start(entryOffset(data, FILE, entry))
      for (let frame = 0; frame < 2000; frame++) {
        if (!ctx.step(100_000)) break
        if (world.menu !== null) world.choose(0)
        world.tick()
      }
    }
    return out
  }

  it('그 파일이 장막백화점이다', () => {
    expect(meta.files[FILE]?.name).toBe('scripts_veilstone_store_4f')
  })

  it('⚠️ 계산대가 우리 재고를 연다 — 원작 재고(별장 가구)는 §9로 나갔다', () => {
    const stocks = openedStocks()
    expect(stocks.length, '열린 상점 수').toBeGreaterThan(0)
    for (const stock of stocks) expect(stock).toEqual([...EVOLUTION_COUNTER_STOCK])
  })
})
