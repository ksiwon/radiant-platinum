// 나무열매 밭을 **실제 스크립트로** 돌린다 (PARITY §4.6)
//
// `world/berryPatches.test.ts`가 자라는 규칙을 보고, 여기서는 밭에 말을 거는
// 스크립트가 그 규칙까지 실제로 닿는지를 본다 — 명령 열이 다 붙어 있어야 한다.
//
// ⚠️ **밭 번호를 스크립트가 안 준다.** 배치표의 `data[0]`을 쓰므로
// `world.target.params[0]`을 안 꽂으면 밭 아홉 자리가 전부 0번 밭을 만진다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { buildCommands } from './commands'
import { ScriptContext } from './context'
import { entryOffset, fileBytes, parseScriptMeta } from './data'
import { VarStore } from './vars'
import { FieldWorld, MENU_NO, MENU_YES, type FieldServices } from './world'
import { DIR } from './movement'
import {
  BERRY_STAGE, berryGrowth, berryItemOf, emptyPatch, MULCH, mulchItemOf, plantBerry,
  soilMoisture, type BerryPatch,
} from '../world/berryPatches'
import { FIRST_BERRY_ITEM, FIRST_MULCH_ITEM } from '../world/berryInit'
import { DATA, withData } from '../../data/romData.testkit'

const maybe = withData('scripts.json', 'scripts.bin')

const ALWAYS_PRESSED = () => ({ pressed: true, held: true })

/** `scripts_berry_tree_interaction`. `ranges`가 2800을 이리로 보낸다 */
const FILE = 413
/** `SCRIPT_ID(BERRY_TREE_INTERACTIONS, 0)` — 밭에 말을 걸었을 때 */
const ENTRY_MAIN = 0

/** `ITEM_SPRAYDUCK` */
const ITEM_SPRAYDUCK = 448
/** 체리열매 */
const CHERI_ITEM = FIRST_BERRY_ITEM
/** `ITEM_GROWTH_MULCH` */
const GROWTH_MULCH = FIRST_MULCH_ITEM

maybe('나무열매 밭 — 실제 스크립트', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
  const { map } = buildCommands(meta.commands)

  it('2800이 이 파일로 간다 — 밭 객체가 들고 있는 번호다', () => {
    expect(meta.ranges.find((r) => r.from === 2800)?.file).toBe(FILE)
    expect(meta.files[FILE]?.name).toBe('scripts_berry_tree_interaction')
  })

  interface Options {
    /** 이 밭의 상태 */
    patch: BerryPatch
    /** 가방에 든 것 (도구 번호 → 개수) */
    have?: Record<number, number>
    /** 물뿌리개를 쓸 수 있는 쪽을 보고 있는가 (`GetPlayerDir`이 0이어야 한다) */
    facingNorth?: boolean
    /** 예/아니오에 무엇으로 답하는가 */
    answer?: number
    /** 목록 메뉴에서 몇 번째 줄을 고르는가 */
    menuPick?: number
    /** 가방을 열었을 때 고를 도구. 0이면 안 고르고 나온다 */
    pick?: number
  }

  interface Log {
    patch: BerryPatch
    added: { item: number; count: number }[]
    removed: number[]
    /** 물뿌리개를 들었는가 · 놓았는가 */
    water: boolean[]
    /** 가방이 열린 주머니들 */
    bags: number[]
    menus: number
  }

  const play = (opt: Options): Log => {
    const have = { ...opt.have }
    const log: Log = {
      patch: opt.patch, added: [], removed: [], water: [], bags: [], menus: 0,
    }
    let bagOpen = false
    const vars = new VarStore()
    const services: FieldServices = {
      bag: {
        pocketOf: () => 0,
        add: (item, count) => { log.added.push({ item, count }); return true },
        remove: (item, count) => {
          log.removed.push(item)
          have[item] = Math.max(0, (have[item] ?? 0) - count)
          return true
        },
        canFit: () => true,
        quantity: (item) => have[item] ?? 0,
        pocketHasItems: (pocket) => (pocket === 4
          ? Object.keys(have).some((k) => Number(k) >= FIRST_BERRY_ITEM && (have[Number(k)] ?? 0) > 0)
          : true),
        name: () => '열매',
      },
      chooseItem: {
        open: (pocket) => { log.bags.push(pocket); bagOpen = true },
        picked: () => opt.pick ?? 0,
      },
      // ⚠️ 가방이 **닫힌 뒤에야** 스크립트가 이어진다. 늘 닫혀 있다고 하면
      // `OpenBag`의 멈춤이 뜻을 잃어 고르기 갈래가 안 돈다
      menuOpen: () => {
        if (!bagOpen) return false
        bagOpen = false
        return true
      },
      berryPatches: {
        growthStage: () => log.patch.growthStage,
        berryItem: () => berryItemOf(log.patch.berryID),
        mulchItem: () => mulchItemOf(log.patch.mulchType),
        moisture: () => soilMoisture(log.patch),
        yield: () => log.patch.yield,
        setMulch: (_p, item) => { log.patch = { ...log.patch, mulchType: item - FIRST_MULCH_ITEM + 1 } },
        plant: (_p, item) => {
          const growth = berryGrowth(item - FIRST_BERRY_ITEM + 1)
          if (growth) log.patch = plantBerry(log.patch, growth, item - FIRST_BERRY_ITEM + 1)
        },
        harvest: () => {
          log.added.push({ item: berryItemOf(log.patch.berryID), count: log.patch.yield })
          log.patch = emptyPatch()
        },
        water: (start) => { log.water.push(start) },
      },
      battleResult: () => 'win',
    }
    const world = new FieldWorld({
      vars, input: ALWAYS_PRESSED, movements: meta.movements, services,
    })
    world.player = {
      x: 0, z: 0, visible: true,
      dir: opt.facingNorth === false ? DIR.south : DIR.north,
    }
    // 밭 번호는 배치표에서 온다 — 없으면 아홉 자리가 전부 0번 밭을 만진다
    world.target = { x: 0, z: 0, dir: DIR.south, visible: true, params: [7, 0, 0] }

    const ctx = new ScriptContext({ vars, world, commands: map }, fileBytes(data, FILE), FILE)
    ctx.start(entryOffset(data, FILE, ENTRY_MAIN))
    for (let frame = 0; frame < 4000; frame++) {
      if (!ctx.step(100_000)) break
      if (world.menu?.kind === 'list') {
        log.menus++
        for (let i = 0; i < (opt.menuPick ?? 0); i++) world.moveCursor(1)
        world.chooseAtCursor()
      } else if (world.menu !== null) world.choose(opt.answer ?? MENU_YES)
      world.tick()
    }
    return log
  }

  const fruit = (over: Partial<BerryPatch> = {}): BerryPatch => ({
    ...emptyPatch(),
    berryID: 1,
    growthStage: BERRY_STAGE.fruit,
    yield: 3,
    moistureRating: 100,
    yieldRating: 3,
    ...over,
  })

  it('열린 밭에서 「예」를 고르면 개수만큼 가방에 들어간다', () => {
    const log = play({ patch: fruit() })
    expect(log.added).toContainEqual({ item: CHERI_ITEM, count: 3 })
    expect(log.patch).toEqual(emptyPatch())
  })

  it('⚠️ 「아니오」면 안 딴다 — 밭이 그대로다', () => {
    const log = play({ patch: fruit(), answer: MENU_NO, facingNorth: false })
    expect(log.added).toEqual([])
    expect(log.patch.growthStage).toBe(BERRY_STAGE.fruit)
  })

  it('⚠️ 물뿌리개는 북쪽을 볼 때만 나온다', () => {
    // 자라는 중 + 물뿌리개 + 북쪽 → 물을 준다
    const north = play({
      patch: fruit({ growthStage: BERRY_STAGE.growing, yield: 0 }),
      have: { [ITEM_SPRAYDUCK]: 1 },
    })
    expect(north.water).toEqual([true, false])
    // 다른 쪽을 보고 있으면 물뿌리개 갈래가 아예 안 열린다
    const south = play({
      patch: fruit({ growthStage: BERRY_STAGE.growing, yield: 0 }),
      have: { [ITEM_SPRAYDUCK]: 1 },
      facingNorth: false,
    })
    expect(south.water).toEqual([])
  })

  it('물뿌리개가 없으면 물을 못 준다', () => {
    const log = play({ patch: fruit({ growthStage: BERRY_STAGE.growing, yield: 0 }) })
    expect(log.water).toEqual([])
  })

  it('빈 흙에서 열매 주머니가 열리고 고른 것이 심긴다', () => {
    const log = play({
      patch: emptyPatch(),
      have: { [CHERI_ITEM]: 1 },
      pick: CHERI_ITEM,
    })
    // 4가 열매 주머니다 (`OpenBerriesBag` → `OpenBag 1`)
    expect(log.bags).toContain(4)
    expect(log.patch).toMatchObject({ berryID: 1, growthStage: BERRY_STAGE.planted })
    // 심은 열매는 가방에서 빠진다
    expect(log.removed).toContain(CHERI_ITEM)
  })

  it('⚠️ 가방에서 안 고르고 나오면 아무것도 안 심긴다', () => {
    const log = play({
      patch: emptyPatch(),
      have: { [CHERI_ITEM]: 1 },
      pick: 0,
    })
    expect(log.patch).toEqual(emptyPatch())
    expect(log.removed).toEqual([])
  })

  it('비료를 뿌리면 도구 주머니가 열리고 밭에 붙는다', () => {
    const log = play({
      patch: emptyPatch(),
      have: { [GROWTH_MULCH]: 1 },
      pick: GROWTH_MULCH,
      // 첫 줄이 「비료를 뿌린다」다
      menuPick: 0,
    })
    // 0이 도구 주머니다 (`OpenItemsBag` → `OpenBag 0`)
    expect(log.bags).toContain(0)
    expect(log.patch.mulchType).toBe(MULCH.growth)
    expect(log.removed).toContain(GROWTH_MULCH)
  })

  it('열매도 비료도 없으면 메뉴가 안 열린다', () => {
    const log = play({ patch: emptyPatch() })
    expect(log.menus).toBe(0)
    expect(log.bags).toEqual([])
  })
})
