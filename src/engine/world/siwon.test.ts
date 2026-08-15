// 시원의 배포 (SIWON.md)
//
// **가장 중요한 것은 「막히지 않는가」다.** 일곱을 한 줄로 이어 놓았으므로
// 어느 한 칸이라도 판정이 너무 엄하면 그 뒤가 통째로 안 열린다 — 특히 레지를
// 놓친 사람이 마지막 선물을 못 받는 자리가 실제로 있었다 (§5의 ⚠️)
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  distributionVarOf, DISTRIBUTION_MAGIC, FLAG_GAME_COMPLETED, SIWON_GIFTS, SIWON_ITEM,
  SIWON_SPECIES, siwonTurn, VAR_DISTRIBUTION_EVENT_FIRST, type SiwonProbe,
} from './siwon'
import { siwonLines } from './siwonText'
import { planSiwonTalk } from '../script/siwonScene'
import { withData, withDecomp } from '../../data/romData.testkit'
import { buildCommands } from '../script/commands'
import { parseScriptMeta } from '../script/data'
import {
  enterMap, fieldScripts, makeWorld, resetTriggerTile, scriptBusy, scriptSystem,
} from '../script/field'
import { printedText } from '../script/printer'
import { VarStore } from '../script/vars'
import { world as mapWorld, type EventFile, type MapHeader } from '../map/world'
import { worldState } from '../../state/worldState'
import { siwonNpcOf, SIWON_MAP } from './siwonPlace'

const FLAG_CAUGHT_ARCEUS = 286
const FLAG_CAUGHT_SHAYMIN = 291
const FLAG_CAUGHT_DARKRAI = 344
const VAR_ROCK_PEAK_RUINS_STATE = 16491

/** 아무것도 안 한 사람 */
function probe(over: Partial<{
  flags: number[]; vars: Record<number, number>; rotom: number
}> = {}): SiwonProbe {
  const flags = new Set(over.flags ?? [])
  return {
    flag: (id) => flags.has(id),
    variable: (id) => over.vars?.[id] ?? 0,
    rotomForms: () => over.rotom ?? 0,
  }
}

const CLEARED = [FLAG_GAME_COMPLETED]

/** 글 한 칸에서 문장을 꺼낸다. 낱개 · 배열(`gift`) · 표(`wait`) 셋이 섞여 있다 */
function textsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[]
  if (typeof value === 'object' && value !== null) {
    return Object.values(value as Record<number, string>)
  }
  return [String(value)]
}

describe('시원의 차례', () => {
  it('전당등록 전에는 하나도 안 준다', () => {
    expect(siwonTurn(0, probe()).kind).toBe('locked')
    // 이미 다 잡아 놨어도 마찬가지다 — 등록이 먼저다
    expect(siwonTurn(0, probe({ flags: [FLAG_CAUGHT_DARKRAI], rotom: 1 })).kind).toBe('locked')
  })

  it('⚠️ 전당등록 뒤 첫 번째는 화강돌이다 — 배가 필요 없는 자리라 맨 앞이다', () => {
    const turn = siwonTurn(0, probe({ flags: CLEARED }))
    expect(turn.kind).toBe('gift')
    if (turn.kind !== 'gift') return
    expect(turn.entry.gift).toEqual({
      kind: 'mon', species: SIWON_SPECIES.spiritomb, level: 25, fateful: false,
    })
  })

  it('화강돌은 받자마자 다음이 나온다 — 「썼는가」를 잴 신호가 없다', () => {
    const turn = siwonTurn(1, probe({ flags: CLEARED }))
    expect(turn.kind).toBe('gift')
    if (turn.kind !== 'gift') return
    expect(turn.entry.gift).toEqual({ kind: 'item', item: SIWON_ITEM.secretKey, event: 3 })
  })

  it('앞의 것을 안 쓰면 다음을 안 준다', () => {
    const turn = siwonTurn(2, probe({ flags: CLEARED }))
    expect(turn).toEqual({ kind: 'wait', at: 1 })
  })

  it('로토무 폼을 하나라도 바꾸면 다음으로 넘어간다', () => {
    const turn = siwonTurn(2, probe({ flags: CLEARED, rotom: 0b00001 }))
    expect(turn.kind).toBe('gift')
    if (turn.kind !== 'gift') return
    expect(turn.entry.gift).toEqual({ kind: 'item', item: SIWON_ITEM.memberCard, event: 0 })
  })

  it('일곱을 다 주면 끝난다', () => {
    expect(siwonTurn(SIWON_GIFTS.length, probe({ flags: CLEARED }))).toEqual({ kind: 'done' })
  })

  it('일곱이 아이템 넷 · 포켓몬 둘 · 알 하나다', () => {
    const kinds = SIWON_GIFTS.map((g) => g.gift.kind)
    expect(kinds).toEqual(['mon', 'item', 'item', 'item', 'egg', 'mon', 'item'])
    // 배포로만 열리던 자리를 전부 덮는가 — 쉐이미와 아르세우스는 아이템이 데려온다
    expect(SIWON_GIFTS.filter((g) => g.gift.kind === 'item').map((g) => (
      g.gift.kind === 'item' ? g.gift.item : 0
    ))).toEqual([
      SIWON_ITEM.secretKey, SIWON_ITEM.memberCard, SIWON_ITEM.oaksLetter, SIWON_ITEM.azureFlute,
    ])
  })

  it('⚠️ 자리 번호가 표의 차례와 같다 — 어긋나면 대사가 딴 선물의 것이 된다', () => {
    expect(SIWON_GIFTS.map((g) => g.at)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('레지기가스만 운명적 만남이다 — 그것만이 유적을 연다', () => {
    expect(SIWON_GIFTS[5]!.gift).toEqual({
      kind: 'mon', species: SIWON_SPECIES.regigigas, level: 1, fateful: true,
    })
    // ⚠️ 화강돌에 붙이면 리본과 만난 자리가 원작과 달라진다
    expect(SIWON_GIFTS.filter((g) => g.gift.kind === 'mon' && g.gift.fateful)).toHaveLength(1)
  })

  it('⚠️ 마지막은 피리다 — 아르세우스가 끝이라야 「닫힌 문은 다 열었다」가 맞는다', () => {
    expect(SIWON_GIFTS[SIWON_GIFTS.length - 1]!.gift)
      .toEqual({ kind: 'item', item: SIWON_ITEM.azureFlute, event: 2 })
  })
})

describe('막히지 않는다', () => {
  const cleared = { flags: [...CLEARED] }

  /** N번째를 받으려면 밟아야 하는 것들 */
  function upTo(n: number): SiwonProbe {
    const flags = [...CLEARED]
    if (n >= 3) flags.push(FLAG_CAUGHT_DARKRAI)
    if (n >= 4) flags.push(FLAG_CAUGHT_SHAYMIN)
    return probe({
      flags,
      rotom: n >= 2 ? 0b00001 : 0,
      vars: n >= 6 ? { [VAR_ROCK_PEAK_RUINS_STATE]: 270 } : {},
    })
  }

  it('차례대로 밟으면 일곱이 다 나온다', () => {
    for (let given = 0; given < SIWON_GIFTS.length; given++) {
      expect(siwonTurn(given, upTo(given)).kind, `${given}번째`).toBe('gift')
    }
  })

  it('⚠️ 레지를 놓쳐도 마지막 선물을 받는다', () => {
    // 석상은 깨웠는데(270) 못 잡은 상태(280). 이 자리에서 그 레지는 다시 안
    // 나오므로, 「잡았다」로 재면 여기서 영영 막힌다
    const missed = probe({
      flags: [...CLEARED, FLAG_CAUGHT_DARKRAI, FLAG_CAUGHT_SHAYMIN],
      rotom: 1,
      vars: { [VAR_ROCK_PEAK_RUINS_STATE]: 280 },
    })
    expect(siwonTurn(6, missed).kind).toBe('gift')
  })

  it('석상을 안 깨웠으면 아직 기다린다', () => {
    const untouched = probe({
      flags: [...CLEARED, FLAG_CAUGHT_DARKRAI, FLAG_CAUGHT_SHAYMIN],
      rotom: 1,
      vars: { [VAR_ROCK_PEAK_RUINS_STATE]: 260 },
    })
    expect(siwonTurn(6, untouched)).toEqual({ kind: 'wait', at: 5 })
  })

  it('가방이 가득 차도 세는 수는 안 올라간다', () => {
    let counted = 0
    const plan = planSiwonTalk({
      locale: 'ko',
      given: 1,
      probe: probe(cleared),
      canFitItem: () => false,
      hasPartyRoom: () => true,
      giveFateful: () => { throw new Error('주면 안 된다') },
      giveMon: () => { throw new Error('주면 안 된다') },
      giveEgg: () => { throw new Error('주면 안 된다') },
      setVar: () => { throw new Error('세우면 안 된다') },
      countGiven: () => { counted++ },
    })
    expect(plan.giveItem).toBeNull()
    expect(plan.commit).toBeNull()
    expect(plan.text).toBe(siwonLines('ko').bagFull)
    expect(counted).toBe(0)
  })

  it('파티가 가득 차면 레지기가스를 안 준다', () => {
    const plan = planSiwonTalk({
      locale: 'ko',
      given: 5,
      probe: probe({
        flags: [...CLEARED, FLAG_CAUGHT_DARKRAI, FLAG_CAUGHT_SHAYMIN], rotom: 1,
      }),
      canFitItem: () => true,
      hasPartyRoom: () => false,
      giveFateful: () => { throw new Error('주면 안 된다') },
      giveMon: () => { throw new Error('주면 안 된다') },
      giveEgg: () => { throw new Error('주면 안 된다') },
      setVar: () => { throw new Error('세우면 안 된다') },
      countGiven: () => { throw new Error('세면 안 된다') },
    })
    expect(plan.text).toBe(siwonLines('ko').partyFull)
    expect(plan.commit).toBeNull()
  })
})

describe('배포 변수', () => {
  it('아이템마다 제 마법의 수를 세운다', () => {
    for (const entry of SIWON_GIFTS) {
      const got = distributionVarOf(entry.gift)
      if (entry.gift.kind !== 'item') { expect(got).toBeNull(); continue }
      expect(got).toEqual({
        id: VAR_DISTRIBUTION_EVENT_FIRST + entry.gift.event,
        value: DISTRIBUTION_MAGIC[entry.gift.event],
      })
    }
  })

  it('⚠️ 물건과 변수가 한 번에 간다 — 하나만 가면 자리가 안 열린다', () => {
    const set: { id: number; value: number }[] = []
    let counted = 0
    const plan = planSiwonTalk({
      locale: 'ko',
      given: 1,
      probe: probe({ flags: CLEARED }),
      canFitItem: () => true,
      hasPartyRoom: () => true,
      giveFateful: () => { throw new Error('아이템이다') },
      giveMon: () => { throw new Error('아이템이다') },
      giveEgg: () => { throw new Error('아이템이다') },
      setVar: (id, value) => { set.push({ id, value }) },
      countGiven: () => { counted++ },
    })
    expect(plan.giveItem).toBe(SIWON_ITEM.secretKey)
    // 말이 끝나기 전에는 아무 일도 안 일어난다
    expect(set).toEqual([])
    plan.commit!()
    expect(set).toEqual([{ id: VAR_DISTRIBUTION_EVENT_FIRST + 3, value: 0x1103 }])
    expect(counted).toBe(1)
  })
})

describe('세 나라 말', () => {
  it('셋 다 빠진 줄이 없다', () => {
    for (const locale of ['ko', 'en', 'ja'] as const) {
      const lines = siwonLines(locale)
      expect(lines.gift.length, locale).toBe(SIWON_GIFTS.length)
      // ⚠️ **기다림은 뜰 수 있는 자리에만 있다.** `used`가 늘 참인 선물(화강돌 ·
      // 마나피 알)과 마지막(피리)은 이 말이 영영 안 뜬다 — 자리를 채우면 안 뜨는
      // 글을 지어내게 된다
      const shows = SIWON_GIFTS.slice(0, -1)
        .filter((g) => !g.used(probe()))
        .map((g) => g.at)
      expect(Object.keys(lines.wait).map(Number).sort((a, b) => a - b), locale).toEqual(shows)
      for (const [key, text] of Object.entries(lines)) {
        for (const one of textsOf(text)) {
          expect(String(one).trim().length, `${locale}/${key}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('모르는 말은 한국어로 준다', () => {
    expect(siwonLines('de')).toBe(siwonLines('ko'))
  })

  it('한 쪽이 두 줄을 안 넘는다', () => {
    // 대사창이 두 줄이다. `\r`·`\f`가 쪽을 나누고 그 안에서는 `\n` 하나뿐이다
    for (const locale of ['ko', 'en', 'ja'] as const) {
      const lines = siwonLines(locale)
      const all = Object.values(lines).flatMap(textsOf)
      for (const text of all) {
        for (const page of String(text).split(/[\r\f]/)) {
          expect(page.split('\n').length, `${locale}: ${page}`).toBeLessThanOrEqual(2)
        }
      }
    }
  })
})

// ── 롬에서 베낀 수를 표와 맞춰 본다 ─────────────────────────────────────────
//
// ⚠️ **이 파일의 모든 판정이 이 수들 위에 서 있다.** 하나라도 어긋나면
// 「받았는데 다음이 안 나온다」로만 보이고 왜인지는 안 보인다. 손으로 적어 둔
// 번호라 디컴프가 한 줄만 바뀌어도 조용히 틀리므로 여기서 못 박는다
// (`script/varsFlags.test.ts`와 같은 장치다).
//
// ⚠️ `raw/`는 리포에 안 들어간다. 표가 있을 때만 돌린다 — 없다고 통과시키는
// 것이 아니라 **건너뛴다**.

const decomp = withDecomp('generated/vars_flags.txt')

/**
 * `vars_flags.txt`를 C 열거형처럼 센다.
 *
 * 이름만 있는 줄은 앞 값에서 하나 올라가고, `A = B` 줄은 B의 값을 받는다 —
 * **그 줄도 하나 올라간다**. 줄 번호로 세면 어긋난다
 */
function readVarsFlags(): Map<string, number> {
  const table = resolve(__dirname, '../../../raw/decomp/generated/vars_flags.txt')
  const out = new Map<string, number>()
  let value = 0
  for (const raw of readFileSync(table, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '') continue
    const eq = line.indexOf('=')
    if (eq >= 0) {
      const rhs = line.slice(eq + 1).trim()
      value = out.get(rhs) ?? Number(rhs)
      out.set(line.slice(0, eq).trim(), value)
    } else out.set(line, value)
    value += 1
  }
  return out
}

decomp('시원이 읽는 롬의 수', () => {
  const table = readVarsFlags()

  it('먼저 세는 법이 맞는지 본다 — 이름에 번호가 박힌 것들이 그 번호다', () => {
    const named = [...table].filter(([name]) => /^FLAG_UNUSED_0x[0-9A-F]{4}$/.test(name))
    expect(named.length).toBeGreaterThan(100)
    expect(named.filter(([name, value]) => Number(`0x${name.slice(-4)}`) !== value)).toEqual([])
  })

  it('「썼다」를 재는 깃발 넷', () => {
    expect(table.get('FLAG_GAME_COMPLETED')).toBe(FLAG_GAME_COMPLETED)
    expect(table.get('FLAG_CAUGHT_DARKRAI')).toBe(FLAG_CAUGHT_DARKRAI)
    expect(table.get('FLAG_CAUGHT_SHAYMIN')).toBe(FLAG_CAUGHT_SHAYMIN)
    expect(table.get('FLAG_CAUGHT_ARCEUS')).toBe(FLAG_CAUGHT_ARCEUS)
  })

  it('⚠️ 배포 변수 넷이 잇달아 붙어 있다 — 첫 칸에 번호를 더해 쓴다', () => {
    expect(table.get('VAR_DISTRIBUTION_EVENT_DARKRAI')).toBe(VAR_DISTRIBUTION_EVENT_FIRST)
    expect(table.get('VAR_DISTRIBUTION_EVENT_SHAYMIN')).toBe(VAR_DISTRIBUTION_EVENT_FIRST + 1)
    expect(table.get('VAR_DISTRIBUTION_EVENT_ARCEUS')).toBe(VAR_DISTRIBUTION_EVENT_FIRST + 2)
    expect(table.get('VAR_DISTRIBUTION_EVENT_ROTOM')).toBe(VAR_DISTRIBUTION_EVENT_FIRST + 3)
  })

  it('⚠️ 유적 셋의 상태 칸이 셋 다 맞다 — 하나만 봐도 다섯째가 안 열린다', () => {
    expect(table.get('VAR_IRON_RUINS_STATE')).toBe(16_489)
    expect(table.get('VAR_ICEBERG_RUINS_STATE')).toBe(16_490)
    expect(table.get('VAR_ROCK_PEAK_RUINS_STATE')).toBe(VAR_ROCK_PEAK_RUINS_STATE)
  })
})

const regi = withDecomp('include/constants/regi_ruins.h')

regi('석상을 깨운 값이 270이다 — 잡은 값(290)으로 재면 막힌다', () => {
  it('표와 같다', () => {
    const header = readFileSync(
      resolve(__dirname, '../../../raw/decomp/include/constants/regi_ruins.h'), 'utf8')
    expect(header).toMatch(/RUINS_STATE_ACTIVATED_STATUE\s+270/)
    expect(header).toMatch(/RUINS_STATE_DID_NOT_CATCH_REGI\s+280/)
  })
})

const magic = withDecomp('src/system_vars.c')

magic('마법의 수 넷이 롬의 표 그대로다', () => {
  it('표와 같다', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../raw/decomp/src/system_vars.c'), 'utf8')
    const found = [...src.matchAll(/\[DISTRIBUTION_EVENT_(\w+)\] = (0x[0-9A-Fa-f]+)/g)]
      .map(([, , value]) => Number(value))
    expect(found).toEqual([...DISTRIBUTION_MAGIC])
  })
})

/**
 * 선물이 **실제로 가방에 들어가는가** (`field.ts`의 `talkToSiwon`).
 *
 * ⚠️ **화면에서 잡은 것이다.** 계획을 세우는 쪽 시험은 다 초록인데, 시원에게
 * 말을 걸어 첫 선물을 받으면 「**없음**을 손에 넣었다!」가 뜨고 가방은 그대로였다.
 * 물건을 건네는 일은 원작의 공용 스크립트(`CommonScript_AddItemQuantity`)가
 * 하고, 그 스크립트는 **지역 칸** 0x8004·0x8005를 읽는다
 * (`AddItem VAR_0x8004, VAR_0x8005` · `BufferItemName 1, VAR_0x8004`).
 * 그런데 `start()`는 첫머리에서 `resetLocals()`로 지역 칸을 통째로 비운다 —
 * 먼저 적어 두면 시작하는 그 순간 0이 된다.
 *
 * 여기서 재는 것은 **말이 끝난 뒤 그 물건이 가방에 있는가**다.
 */
const handOff = withData('scripts.json', 'scripts.bin', 'maps.json', 'events.json',
  'dialogue/ko/213.json', 'names/items.ko.json')

handOff('시원이 건넨 것이 가방에 들어간다', () => {
  const DATA = resolve(__dirname, '../../../public/data')
  const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  /** `TEXT_BANK_COMMON_STRINGS` — 2000번대 구역이 읽는 뱅크 */
  const COMMON_STRINGS_BANK = 213
  /** `generated/bag_pockets.txt` — 소중한 물건 */
  const POCKET_KEY_ITEMS = 7
  const names = read('names/items.ko.json') as string[]

  /** 시원에게 말을 걸고 끝까지 간다. 가방에 들어온 것을 돌려준다 */
  function talk(): { got: number[]; said: string[] } {
    mapWorld.maps = (read('maps.json') as { maps: MapHeader[] }).maps
    mapWorld.events = (read('events.json') as { events: Record<string, EventFile> }).events
    mapWorld.mapId = SIWON_MAP
    mapWorld.grid = null
    mapWorld.pending = null

    const got: number[] = []
    // 첫 선물은 화강돌(포켓몬)이라 가방을 안 거친다 — 물건이 실제로 들어가는
    // 것을 재는 시험이므로 둘째(비밀의열쇠)부터 시작한다
    let given = 1
    fieldScripts.data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
    fieldScripts.commands = buildCommands(meta.commands)
    fieldScripts.vars = new VarStore()
    fieldScripts.services = {
      siwon: { given: () => given, gave: () => { given += 1 } },
      party: { rotomForms: () => 0, count: () => 1, giveFateful: () => {}, give: () => {} },
      // 도구표를 안 읽고 답한다 — 여기 넷은 다 소중한 물건이다 (`POCKET_KEY_ITEMS`)
      bag: {
        pocketOf: () => POCKET_KEY_ITEMS,
        add: (item: number) => { got.push(item); return true },
        remove: () => true,
        canFit: () => true,
        quantity: () => 0,
        pocketHasItems: () => false,
        name: (item: number) => names[item] ?? '없음',
      },
    } as never
    fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
    fieldScripts.ctx = null
    fieldScripts.lastError = null
    fieldScripts.banks = new Map([[COMMON_STRINGS_BANK, read('dialogue/ko/213.json') as string[]]])
    enterMap(SIWON_MAP)
    fieldScripts.vars.setFlag(FLAG_GAME_COMPLETED)

    const npc = siwonNpcOf(SIWON_MAP)!
    worldState.player.position.set(npc.x + 0.5, 0, npc.z + 1.5)
    // 북쪽을 본다 — 시원이 그 앞 칸에 서 있다
    worldState.player.facing = Math.PI
    resetTriggerTile()

    const said: string[] = []
    for (let frame = 0; frame < 600; frame++) {
      worldState.input.interact = frame % 4 === 0
      scriptSystem.fixedUpdate()
      const printer = fieldScripts.world?.printer
      if (printer?.finished === true) {
        const line = printedText(printer)
        if (line !== '' && line !== said[said.length - 1]) said.push(line)
      }
      if (frame > 8 && !scriptBusy()) break
    }
    worldState.input.interact = false
    return { got, said }
  }

  it('⚠️ 첫 선물이 진짜로 들어간다 — 이름이 「없음」이면 지역 칸이 비워진 것이다', () => {
    const { got, said } = talk()
    expect(got).toEqual([SIWON_ITEM.secretKey])
    expect(said.join(' / ')).toContain('비밀의열쇠')
    expect(fieldScripts.lastError).toBeNull()
  })
})
