// 주는 명령과 파티를 묻는 명령 (`commands.ts`)
//
// 조용히 틀릴 자리가 셋이다:
//
//   ① **인자 차례.** 원작이 갈래마다 다르게 적어 두었다 — 친밀도는 값이 먼저고
//      자리가 나중이며, 기술 확인은 답·기술·자리 순이다. 뒤집어 읽어도 폭은
//      같아서 `argWidth`가 못 잡는다. 조용히 늘 거짓이 된다.
//   ② **파티가 가득 찼을 때.** 원작은 박스로 안 넘긴다. 넘기면 "가방이 가득
//      찼다" 가지가 영영 안 돌고 스크립트가 같은 말을 되풀이한다.
//   ③ **라이벌 파트너.** 저장하는 값이 아니라 **내 것에서 계산하는 값**이다.
//      규칙이 뒤집히면 첫 배틀 상대가 나에게 약한 쪽이 된다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import type { ScriptFile } from '../../data/schema'
import { HANDLERS, VAR_PLAYER_STARTER } from './commands'
import { ScriptContext } from './context'
import { VarStore } from './vars'
import { FieldWorld, type FieldServices } from './world'
import { withData } from '../../data/romData.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('scripts.json')

/** `generated/species.txt` */
const TURTWIG = 387, CHIMCHAR = 390, PIPLUP = 393

/** 답이 들어올 자리. 아무 세이브 변수나 되지만 지역 칸이 읽기 쉽다 */
const DEST = 0x8000

/**
 * 명령 하나를 인자 바이트와 함께 돌린다.
 *
 * 옵코드는 안 넣는다 — VM이 이미 읽고 핸들러를 부르므로 시험도 그 자리에서 시작한다
 */
function run(
  name: string, args: number[], services: FieldServices, vars = new VarStore(),
): FieldWorld {
  const fn = HANDLERS.get(name)
  if (!fn) throw new Error(`${name}을 안 만들었다`)
  const world = new FieldWorld({ vars })
  world.services = services
  const bytes = new Uint8Array(2 + args.length)
  for (const [i, b] of args.entries()) bytes[2 + i] = b
  const ctx = new ScriptContext({ vars, world, commands: new Map() }, bytes, 0)
  ctx.start(0)
  ctx.readHalfWord() // 옵코드 자리. VM도 이만큼 읽고 핸들러를 부른다
  fn(ctx)
  return world
}

/** 두 바이트를 리틀엔디언으로 편다 */
const u16 = (v: number): number[] => [v & 0xff, (v >> 8) & 0xff]

/**
 * 파티 서비스 한 벌. 시험이 보려는 것만 갈아 끼운다 —
 * 인터페이스가 넓어서 매번 다 적으면 무엇을 보는 시험인지가 안 보인다
 */
const noParty: NonNullable<FieldServices['party']> = {
  count: () => 0, species: () => 0, nickname: () => '', hasSpecies: () => false,
  aliveExcept: () => 0, level: () => 0, nature: () => 0, friendship: () => 0,
  addFriendship: () => { /* 안 본다 */ }, hasMove: () => false, move: () => 0,
  give: () => false,
}

maybe('주는 명령', () => {
  const meta = JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')) as ScriptFile

  /** 표에 적힌 폭. 인자 바이트를 그만큼 준비해야 읽기가 파일 밖으로 안 나간다 */
  const widthOf = (name: string): number => {
    const cmd = meta.commands.find((c) => c.name === name)
    if (!cmd) throw new Error(`${name}이 표에 없다`)
    return cmd.args === '' ? 0 : cmd.args.split(' ').reduce((n, s) => n + Number(s[0]), 0)
  }

  it('GivePokemon은 종·레벨·도구를 그 차례로 읽는다', () => {
    expect(widthOf('GivePokemon')).toBe(8)
    const got: number[][] = []
    const vars = new VarStore()
    run('GivePokemon', [...u16(TURTWIG), ...u16(5), ...u16(0), ...u16(DEST)], {
      party: { ...noParty, give: (species, level, item) => { got.push([species, level, item]); return true } },
    }, vars)
    expect(got).toEqual([[TURTWIG, 5, 0]])
    expect(vars.get(DEST)).toBe(1)
  })

  it('파티가 가득 차면 0이다 — 박스로 안 넘긴다', () => {
    const vars = new VarStore()
    run('GivePokemon', [...u16(TURTWIG), ...u16(5), ...u16(0), ...u16(DEST)], {
      party: { ...noParty, count: () => 6 },
    }, vars)
    expect(vars.get(DEST)).toBe(0)
  })

  it('GiveBadge가 뱃지 번호를 그대로 넘긴다', () => {
    const given: number[] = []
    run('GiveBadge', u16(3), {
      trainerInfo: {
        gender: () => 0, hasBadge: () => false, nationalDex: () => false,
        giveBadge: (badge) => { given.push(badge) },
      },
    })
    expect(given).toEqual([3])
  })

  it('친밀도는 값이 먼저 자리가 나중이다', () => {
    const calls: number[][] = []
    // 값 20 · 자리 1. 뒤집어 읽으면 1번 자리가 아니라 20번 자리에 20이 아닌 1이 간다
    run('IncreasePartyMonFriendship', [...u16(20), ...u16(1)], {
      party: { ...noParty, addFriendship: (slot, amount) => { calls.push([slot, amount]) } },
    })
    expect(calls).toEqual([[1, 20]])
  })

  it('기술 확인은 답·기술·자리 차례다', () => {
    const asked: number[][] = []
    const vars = new VarStore()
    run('CheckPartyMonHasMove', [...u16(DEST), ...u16(15), ...u16(2)], {
      party: { ...noParty, hasMove: (slot, move) => { asked.push([slot, move]); return true } },
    }, vars)
    expect(asked).toEqual([[2, 15]])
    expect(vars.get(DEST)).toBe(1)
  })
})

maybe('처음 고른 파트너', () => {
  /** 종족 이름표만 있으면 된다 */
  const labels: FieldServices = {
    labels: {
      move: () => '', pocket: () => '',
      species: (id) => (
        { [TURTWIG]: '모부기', [CHIMCHAR]: '불꽃숭이', [PIPLUP]: '팽도리' }[id] ?? `#${String(id)}`
      ),
    },
  }

  it('세이브 변수 하나에 들어 있다 — 새 칸을 안 만들었다', () => {
    // `VAR_PLAYER_STARTER`는 0x4030이고 그 자리는 이미 세이브에 실린다
    expect(VAR_PLAYER_STARTER).toBe(0x4030)
    const vars = new VarStore()
    vars.set(VAR_PLAYER_STARTER, PIPLUP)
    run('GetPlayerStarterSpecies', u16(DEST), {}, vars)
    expect(vars.get(DEST)).toBe(PIPLUP)
  })

  /**
   * `SystemVars_GetRivalStarter` — 라이벌은 **내 것에 강한 쪽**을 든다.
   * 풀 → 불꽃 → 물 → 풀로 도는 고리다
   */
  it('라이벌은 내 것에 강한 쪽을 든다', () => {
    for (const [mine, want] of [
      [TURTWIG, '불꽃숭이'], [CHIMCHAR, '팽도리'], [PIPLUP, '모부기'],
    ] as const) {
      const vars = new VarStore()
      vars.set(VAR_PLAYER_STARTER, mine)
      const world = run('BufferRivalStarterSpeciesName', [0], labels, vars)
      expect(world.slots.get(0)).toBe(want)
    }
  })

  it('반대 성별 주인공은 남은 하나를 든다', () => {
    for (const [mine, want] of [
      [TURTWIG, '팽도리'], [CHIMCHAR, '모부기'], [PIPLUP, '불꽃숭이'],
    ] as const) {
      const vars = new VarStore()
      vars.set(VAR_PLAYER_STARTER, mine)
      const world = run('BufferPlayerCounterpartStarterSpeciesName', [0], labels, vars)
      expect(world.slots.get(0)).toBe(want)
    }
  })

  it('아직 안 골랐으면 라이벌은 모부기다 — 원작도 그 갈래로 떨어진다', () => {
    const vars = new VarStore()
    const world = run('BufferRivalStarterSpeciesName', [0], labels, vars)
    expect(world.slots.get(0)).toBe('모부기')
  })
})
