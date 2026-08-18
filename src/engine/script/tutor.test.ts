// 기술 삭제사와 조각 교사 셋 (`commands.ts`, PARITY §5)
//
// ⚠️ **VM 훑기가 이 여덟을 한 번도 안 밟는다.** 훑기의 바깥 세계에는 파티를
// 고르는 화면이 없어서 `GetSelectedPartySlot`이 `PARTY_SLOT_NONE`을 주고,
// 스크립트가 그 자리에서 「또 오라」 가지로 빠진다 (`vm.test.ts`의 `IDLE_COMMANDS`).
// 그러니 여기서 손으로 몰아 본다 — 안 그러면 만들어만 두고 검증이 없다.
//
// 보는 것은 셋이다:
//   ① **안 고른 값이 명령마다 다르다** — 삭제사는 0xFF, 가르침은 4
//   ② **목록의 값이 자리가 아니라 기술 번호다** — 그 값이 값 계산으로 다시 간다
//   ③ **조각을 정확히 그만큼만 뺀다**
import { describe, expect, it } from 'vitest'
import { HANDLERS } from './commands'
import { ScriptContext } from './context'
import { VarStore } from './vars'
import { FieldWorld, MENU_CANCEL, type FieldServices } from './world'
import { ITEM_BLUE_SHARD, ITEM_RED_SHARD, SHARDS } from '../bag/shards'
import { TUTOR_LOCATION } from '../world/tutorMoves'

const DEST = 0x8000
const u16 = (v: number): number[] => [v & 0xff, (v >> 8) & 0xff]

/** `generated/species.txt` · `generated/moves.txt` */
const SPECIES_MACHOP = 66
const MOVE_FIRE_PUNCH = 7
const MOVE_ICE_PUNCH = 8
const MOVE_THUNDER_PUNCH = 9
const MOVE_VACUUM_WAVE = 410

function run(
  name: string, args: number[], services: FieldServices = {}, vars = new VarStore(),
): { world: FieldWorld, vars: VarStore, ctx: ScriptContext } {
  const fn = HANDLERS.get(name)
  if (!fn) throw new Error(`${name}을 안 만들었다`)
  const world = new FieldWorld({ vars })
  world.services = services
  const bytes = new Uint8Array(2 + args.length)
  for (const [i, b] of args.entries()) bytes[2 + i] = b
  const ctx = new ScriptContext({ vars, world, commands: new Map() }, bytes, 0)
  ctx.start(0)
  ctx.readHalfWord()
  fn(ctx)
  return { world, vars, ctx }
}

/** 알통몬 한 마리가 든 파티. 기술은 준 대로 */
const party = (moves: number[] = []): NonNullable<FieldServices['party']> => ({
  species: () => SPECIES_MACHOP,
  form: () => 0,
  move: (_slot: number, at: number) => moves[at] ?? 0,
} as unknown as NonNullable<FieldServices['party']>)

describe('기술 고르기 화면', () => {
  it('삭제사는 고른 칸을 그대로 준다', () => {
    let opened: [number, number | undefined] | null = null
    const services: FieldServices = {
      selectMove: {
        open: (slot, move) => { opened = [slot, move] },
        picked: () => 2,
      },
      menuOpen: () => false,
    }
    run('SelectPartyMonMove', u16(3), services)
    // 「가르침」이 아니므로 기술 번호를 안 넘긴다
    expect(opened).toEqual([3, undefined])
    const r = run('GetSelectedPartyMonMove', u16(DEST), services)
    expect(r.vars.get(DEST)).toBe(2)
  })

  it('⚠️ 삭제사가 그만두면 0xFF다 — 스크립트가 그 값으로 되돌아간다', () => {
    const services: FieldServices = {
      // 네 칸 밖의 자리가 곧 「그만둔다」다
      selectMove: { open: () => { /* 열기만 한다 */ }, picked: () => 4 },
    }
    expect(run('GetSelectedPartyMonMove', u16(DEST), services).vars.get(DEST)).toBe(0xff)
    // 화면이 아예 없어도 같은 답이라야 한다 — 안 그러면 0번 칸이 지워진다
    expect(run('GetSelectedPartyMonMove', u16(DEST), {}).vars.get(DEST)).toBe(0xff)
  })

  it('가르침은 배울 기술을 같이 넘기고, 그만두면 4다', () => {
    let opened: [number, number | undefined] | null = null
    const services: FieldServices = {
      selectMove: {
        open: (slot, move) => { opened = [slot, move] },
        picked: () => 4,
      },
      menuOpen: () => false,
    }
    run('OpenSummaryScreenTeachMove', [...u16(1), ...u16(MOVE_FIRE_PUNCH)], services)
    expect(opened).toEqual([1, MOVE_FIRE_PUNCH])
    expect(run('GetSummarySelectedMoveSlot', u16(DEST), services).vars.get(DEST)).toBe(4)
  })

  it('가르침이 고른 칸은 0~3 그대로다', () => {
    const services: FieldServices = {
      selectMove: { open: () => { /* 열기만 한다 */ }, picked: () => 0 },
    }
    expect(run('GetSummarySelectedMoveSlot', u16(DEST), services).vars.get(DEST)).toBe(0)
  })

  it('⚠️ 지우는 칸이 0~3 밖이면 아무것도 안 지운다', () => {
    const cleared: number[] = []
    const services = {
      party: { clearMoveSlot: (_slot: number, at: number) => { cleared.push(at) } },
    } as unknown as FieldServices
    // 종족 번호가 칸 번호 자리로 흘러들던 자리다 (운하시티 기술 삭제사)
    run('ClearPartyMonMoveSlot', [...u16(0), ...u16(SPECIES_MACHOP)], services)
    expect(cleared).toEqual([])
    run('ClearPartyMonMoveSlot', [...u16(0), ...u16(2)], services)
    expect(cleared).toEqual([2])
  })
})

describe('조각 교사', () => {
  const AT = TUTOR_LOCATION.route212

  it('배울 것이 있으면 1이다', () => {
    const r = run('CheckHasLearnableTutorMoves',
      [...u16(0), ...u16(AT), ...u16(DEST)], { party: party() })
    expect(r.vars.get(DEST)).toBe(1)
  })

  it('넷을 다 알면 0이다', () => {
    const known = [MOVE_THUNDER_PUNCH, MOVE_FIRE_PUNCH, MOVE_ICE_PUNCH, MOVE_VACUUM_WAVE]
    const r = run('CheckHasLearnableTutorMoves',
      [...u16(0), ...u16(AT), ...u16(DEST)], { party: party(known) })
    expect(r.vars.get(DEST)).toBe(0)
  })

  it('⚠️ 알은 아무것도 못 배운다 — 종족이 0으로 온다', () => {
    const egg = { species: () => 0, form: () => 0, move: () => 0 } as unknown as
      NonNullable<FieldServices['party']>
    const r = run('CheckHasLearnableTutorMoves',
      [...u16(0), ...u16(AT), ...u16(DEST)], { party: egg })
    expect(r.vars.get(DEST)).toBe(0)
  })

  it('⚠️ 목록의 값이 자리가 아니라 기술 번호다 — 그 값이 값 계산으로 다시 간다', () => {
    const r = run('ShowMoveTutorMoveSelectionMenu',
      [...u16(0), ...u16(AT), ...u16(DEST)],
      { party: party(), labels: { move: (m: number) => `기술${String(m)}` } as never })
    const menu = r.world.menu
    expect(menu).not.toBeNull()
    expect(menu?.entries.map((e) => e.value)).toEqual([
      MOVE_THUNDER_PUNCH, MOVE_FIRE_PUNCH, MOVE_ICE_PUNCH, MOVE_VACUUM_WAVE, MENU_CANCEL,
    ])
    // 이름은 기술 이름표에서 온다 — 스크립트 뱅크에 없다
    expect(menu?.entries[0]?.text).toBe(`기술${String(MOVE_THUNDER_PUNCH)}`)
    // 답이 들어오기 전에는 「아직 안 골랐다」 표시가 서 있다
    expect(r.ctx.state).toBe('waiting')
  })

  it('파티를 안 고르면 그 교사의 기술을 전부 세운다 — 값만 보러 온 자리다', () => {
    const PARTY_SLOT_NONE = 0xff
    const r = run('ShowMoveTutorMoveSelectionMenu',
      [...u16(PARTY_SLOT_NONE), ...u16(AT), ...u16(DEST)],
      { labels: { move: () => '' } as never })
    // 212번도로는 열셋 + 「그만둔다」
    expect(r.world.menu?.entries).toHaveLength(14)
  })

  it('조각이 모자라면 못 산다', () => {
    // 불꽃펀치는 빨강 2 · 파랑 6이다
    const have: Record<number, number> = { [ITEM_RED_SHARD]: 2, [ITEM_BLUE_SHARD]: 5 }
    const bag = { quantity: (item: number) => have[item] ?? 0 } as unknown as
      NonNullable<FieldServices['bag']>
    expect(run('CheckCanAffordMove', [...u16(MOVE_FIRE_PUNCH), ...u16(DEST)], { bag })
      .vars.get(DEST)).toBe(0)
    have[ITEM_BLUE_SHARD] = 6
    expect(run('CheckCanAffordMove', [...u16(MOVE_FIRE_PUNCH), ...u16(DEST)], { bag })
      .vars.get(DEST)).toBe(1)
  })

  it('표에 없는 기술은 못 산다', () => {
    const bag = { quantity: () => 99 } as unknown as NonNullable<FieldServices['bag']>
    expect(run('CheckCanAffordMove', [...u16(1), ...u16(DEST)], { bag }).vars.get(DEST)).toBe(0)
  })

  it('⚠️ 값만큼만 뺀다 — 0인 조각은 손대지 않는다', () => {
    const taken: [number, number][] = []
    const bag = {
      quantity: () => 99,
      remove: (item: number, count: number) => { taken.push([item, count]); return true },
    } as unknown as NonNullable<FieldServices['bag']>
    run('PayShardCost', u16(MOVE_FIRE_PUNCH), { bag })
    expect(taken).toEqual([[ITEM_RED_SHARD, 2], [ITEM_BLUE_SHARD, 6]])
    // 노랑·초록은 값이 0이라 안 부른다
    expect(taken.map(([item]) => item)).not.toContain(SHARDS[2])
  })

  it('표에 없는 기술은 값을 안 받는다', () => {
    const taken: number[] = []
    const bag = {
      quantity: () => 99,
      remove: (item: number) => { taken.push(item); return true },
    } as unknown as NonNullable<FieldServices['bag']>
    run('PayShardCost', u16(1), { bag })
    expect(taken).toEqual([])
  })
})

describe('조각 값 창 (PARITY §10)', () => {
  it('값과 가진 수를 나란히 내놓고 예/아니오를 연다', () => {
    // `ScrCmd_ShowShardCost`는 창이자 물음이다 — 원작이 답 변수 자리를 같이
    // 넘긴다. **앞의 두 바이트는 창 자리**라 읽고 버린다
    const vars = new VarStore()
    const MOVE_VAR = 0x4000
    vars.set(MOVE_VAR, MOVE_FIRE_PUNCH)
    const services: FieldServices = {
      bag: { quantity: (item: number) => (item === ITEM_RED_SHARD ? 1 : 99) } as
        unknown as NonNullable<FieldServices['bag']>,
      labels: { item: (item: number) => `조각${String(item)}` } as
        unknown as NonNullable<FieldServices['labels']>,
    }
    const r = run('ShowShardCost', [0, 0, ...u16(MOVE_VAR), ...u16(DEST)], services, vars)
    expect(r.world.shardCost).toHaveLength(SHARDS.length)
    expect(r.world.shardCost![0]!.name).toBe(`조각${String(ITEM_RED_SHARD)}`)
    // 빨강만 하나뿐이라 모자란 줄이 화면에서 갈린다
    expect(r.world.shardCost![0]!.have).toBe(1)
    expect(r.world.shardCost![1]!.have).toBe(99)
    // 값이 있는 기술이라 필요한 수가 0이 아니다
    expect(r.world.shardCost!.some((c) => c.need > 0)).toBe(true)
    expect(r.world.menu?.kind).toBe('yesno')
    expect(r.world.menu?.dest).toBe(DEST)
  })

  it('닫으면 창이 사라진다', () => {
    const vars = new VarStore()
    vars.set(0x4000, MOVE_FIRE_PUNCH)
    const r = run('ShowShardCost', [0, 0, ...u16(0x4000), ...u16(DEST)], {}, vars)
    expect(r.world.shardCost).not.toBeNull()
    // 같은 세계에서 닫아야 한다 — `run`이 세계를 새로 만드므로 손으로 부른다
    const fn = HANDLERS.get('CloseShardCostWindow')!
    const bytes = new Uint8Array(2)
    const ctx = new ScriptContext({ vars, world: r.world, commands: new Map() }, bytes, 0)
    ctx.start(0)
    ctx.readHalfWord()
    fn(ctx)
    expect(r.world.shardCost).toBeNull()
  })
})
