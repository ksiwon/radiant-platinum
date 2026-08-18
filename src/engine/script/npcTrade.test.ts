// 교환해 주는 사람 넷을 **실제 스크립트로** 끝까지 돌린다 (PARITY §10)
//
// `npcTrade.test.ts`(engine/pokemon)가 개체를 만드는 규칙을 보고, 여기서는
// 롬의 스크립트가 그 자리까지 실제로 도달하는지를 본다. 갈래가 셋이라 셋 다 —
// 안 골랐다 · 엉뚱한 종을 골랐다 · 원하던 종을 골랐다.
//
// ⚠️ **`FinishNPCTrade`가 세 갈래에 다 있어야 한다.** 원작이 어느 쪽으로
// 끝나든 잡은 것을 놓는다. 한 갈래라도 빠지면 다음 사람에게 말을 걸었을 때
// 앞의 교환이 그대로 남는다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { buildCommands } from './commands'
import { ScriptContext } from './context'
import { entryOffset, fileBytes, parseScriptMeta } from './data'
import { VarStore } from './vars'
import { FieldWorld, MENU_YES, type FieldServices } from './world'
import { DATA, withData } from '../../data/romData.testkit'

const maybe = withData('scripts.json', 'scripts.bin')

const ALWAYS_PRESSED = () => ({ pressed: true, held: true })
/** 안 골랐다 (`PARTY_SLOT_NONE`) */
const NONE = 0xff

/**
 * 교환해 주는 사람 넷.
 *
 * `file`은 맵 헤더의 `scripts`, `entry`는 그 파일의 `ScriptEntry` 차례,
 * `flag`는 `generated/vars_flags.txt`의 번호다.
 *
 * ⚠️ **마이스터만 두 번 말을 걸어야 한다.** 첫 대화는 도감의 언어 판정을 켜
 * 주고 끝나고(`FLAG_ENABLED_POKEDEX_LANGUAGE_DETECTION`), 교환은 그 플래그가
 * 선 다음에야 나온다 — `pre`가 그 한 번을 대신한다
 */
const SITES = [
  {
    name: '무쇠시티 북쪽 집 — 케이케이 (아브라 ↔ 알통몬)',
    file: 60, entry: 0, flag: 133, tradeId: 0, wants: 66, pre: null,
  },
  {
    name: '영원시티 콘도 1층 — 조자리 (페라페 ↔ 브이젤)',
    file: 84, entry: 1, flag: 134, tradeId: 1, wants: 418, pre: null,
  },
  {
    name: '눈설시티 서쪽 집 — 고옹이 (고우스트 ↔ 요가램)',
    file: 180, entry: 1, flag: 244, tradeId: 2, wants: 308, pre: null,
  },
  {
    name: '226번수로의 집 — 킹킹이 (잉어킹 ↔ 케이시)',
    file: 1122, entry: 1, flag: 245, tradeId: 3, wants: 456, pre: 246,
  },
] as const

maybe('NPC 교환 — 스크립트 넷', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
  const { map } = buildCommands(meta.commands)

  interface Log {
    init: number[]
    started: number[]
    freed: number
    opened: number
  }

  /** 한 자리를 돌려 본다. `picked`가 「한 마리 골라」 화면의 답이다 */
  const play = (
    site: (typeof SITES)[number], picked: number, species: number,
  ): { log: Log, vars: VarStore } => {
    const log: Log = { init: [], started: [], freed: 0, opened: 0 }
    const vars = new VarStore()
    if (site.pre !== null) vars.setFlag(site.pre)
    const services: FieldServices = {
      chooseMon: { open: () => { log.opened++ }, picked: () => picked },
      party: {
        ...STUB_PARTY,
        species: (slot) => (slot === picked ? species : 0),
      },
      npcTrade: {
        init: (id) => { log.init.push(id) },
        species: () => 0,
        requestedSpecies: () => site.wants,
        start: (slot) => { log.started.push(slot) },
        free: () => { log.freed++ },
      },
      menuOpen: () => false,
      battleResult: () => 'win',
    }
    const world = new FieldWorld({
      vars, input: ALWAYS_PRESSED, movements: meta.movements, services,
    })
    const ctx = new ScriptContext({ vars, world, commands: map }, fileBytes(data, site.file), site.file)
    ctx.start(entryOffset(data, site.file, site.entry))
    for (let frame = 0; frame < 5000; frame++) {
      if (!ctx.step(100_000)) break
      if (world.menu?.kind === 'list') world.chooseAtCursor()
      // "교환할래?"에 예로 답한다. 아니오로 답하면 화면 자체가 안 열린다
      else if (world.menu !== null) world.choose(MENU_YES)
      world.tick()
    }
    return { log, vars }
  }

  for (const site of SITES) {
    it(`${site.name} — 원하던 종을 주면 교환이 열리고 플래그가 선다`, () => {
      const { log, vars } = play(site, 2, site.wants)
      expect(log.opened).toBe(1)
      expect(log.init).toEqual([site.tradeId])
      // 고른 자리가 그대로 넘어간다 — 여기가 밀리면 엉뚱한 마리를 보낸다
      expect(log.started).toEqual([2])
      expect(log.freed).toBe(1)
      expect(vars.checkFlag(site.flag)).toBe(true)
    })

    it(`${site.name} — 엉뚱한 종이면 교환이 안 열린다`, () => {
      // 요구한 종이 아닌 아무 번호. 어느 교환도 알통몬 아닌 1번(이상해씨)을 안 찾는다
      const { log, vars } = play(site, 0, 1)
      expect(log.init).toEqual([site.tradeId])
      expect(log.started).toEqual([])
      // ⚠️ 잡은 것은 이 갈래에서도 놓는다
      expect(log.freed).toBe(1)
      expect(vars.checkFlag(site.flag)).toBe(false)
    })

    it(`${site.name} — 안 고르고 나가면 표를 집지도 않는다`, () => {
      const { log, vars } = play(site, NONE, 0)
      expect(log.opened).toBe(1)
      expect(log.init).toEqual([])
      expect(log.started).toEqual([])
      expect(log.freed).toBe(0)
      expect(vars.checkFlag(site.flag)).toBe(false)
    })
  }
})

/** 이 시험이 안 보는 파티 조회들 */
const STUB_PARTY: NonNullable<FieldServices['party']> = {
  count: () => 6,
  species: () => 0,
  nickname: () => '',
  hasSpecies: () => false,
  aliveExcept: () => 0,
  give: () => false,
  giveFateful: () => false,
  level: () => 20,
  nature: () => 0,
  friendship: () => 0,
  addFriendship: () => { /* 안 본다 */ },
  hasMove: () => false,
  move: () => 0,
  form: () => 0,
  setForm: () => { /* 안 본다 */ },
  giratinaForm: () => { /* 안 본다 */ },
  revertForms: () => 0,
  rotomForms: () => 0,
  rotomCount: () => ({ count: 0, first: 0xff }),
  moveCount: () => 0,
  hasHeldItem: () => false,
  types: () => [0, 0],
  countAtOrBelowLevel: () => 0,
  isOutsider: () => false,
  evTotal: () => 0,
  findWithMove: () => 6,
  findWithNature: () => 0xff,
  findWithSpecies: () => 0xff,
  findFateful: () => 0xff,
  clearMoveSlot: () => { /* 안 본다 */ },
  setMoveSlot: () => { /* 안 본다 */ },
  sizeOf: () => null,
  heightOf: () => 0,
}
