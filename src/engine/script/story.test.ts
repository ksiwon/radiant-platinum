// 이야기 길목을 막던 명령들 (`commands.ts`, DATA.md §2.10)
//
// 여기 모인 것은 성격이 하나다 — **안 만들면 스크립트가 영영 돈다.** 대개는
// 안 만든 명령을 건너뛰어도 그 연출만 없이 지나가는데, 이 몇 개는 답 칸을
// 채워 주는 쪽이라 비면 조건이 안 바뀐다. 무쇠탄갱에서 강석이 바위를 깨는
// 자리가 그랬다:
//
//   StartDestroyObstacleAnimation 2, VAR_0x8005   ← 여기서 0으로 두고 시작한다
//   …
//   WaitTime 1, VAR_RESULT
//   GoToIfEq VAR_0x8005, 0, (되돌아간다)          ← 채워 주는 사람이 없으면 무한 고리
//
// 그래서 시험이 보는 것은 "부르면 안 터지는가"가 아니라 **답 칸이 실제로
// 바뀌는가**다.
import { expect, it, describe } from 'vitest'
import { HANDLERS } from './commands'
import { ScriptContext } from './context'
import { VarStore, FLAG_HAS_POKEDEX } from './vars'
import { FieldWorld, type FieldServices } from './world'

/** 답이 들어올 자리 */
const DEST = 0x8000
const u16 = (v: number): number[] => [v & 0xff, (v >> 8) & 0xff]

interface Run {
  world: FieldWorld
  vars: VarStore
  ctx: ScriptContext
  /**
   * 한 프레임 흘려 보내고 **아직 서 있는가**를 답한다.
   *
   * `step`은 살아 있는지만 돌려주므로 `state`를 직접 본다 — 대기가 풀리면
   * `'running'`이 되고, 그때 비로소 다음 명령으로 넘어간다
   */
  tick: () => boolean
}

function run(
  name: string, args: number[], services: FieldServices = {}, vars = new VarStore(),
): Run {
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
  return {
    world, vars, ctx,
    tick: () => { ctx.step(); return ctx.state === 'waiting' },
  }
}

describe('이야기 길목', () => {
  it('바위 부수기는 답 칸을 0으로 두었다가 1로 채운다 — 안 채우면 무한 고리다', () => {
    let started: number | null = null
    let finished = false
    const r = run('StartDestroyObstacleAnimation', [...u16(2), ...u16(DEST)], {
      breakObstacle: {
        start: (kind) => { started = kind },
        done: () => finished,
      },
    })
    // 갈래 번호가 그대로 간다 — 0 나무 · 1 바위 · 2 큰 바위
    expect(started).toBe(2)
    // 연출이 도는 동안은 0이다. 스크립트는 이 0을 보고 되돌아 돈다
    expect(r.vars.get(DEST)).toBe(0)
    expect(r.tick()).toBe(true)
    expect(r.vars.get(DEST)).toBe(0)
    finished = true
    r.tick()
    expect(r.vars.get(DEST)).toBe(1)
  })

  it('연출을 붙이지 않아도 답 칸은 채워진다 — 이야기가 서면 안 된다', () => {
    const r = run('StartDestroyObstacleAnimation', [...u16(0), ...u16(DEST)])
    r.tick()
    expect(r.vars.get(DEST)).toBe(1)
  })

  it('창기둥이 일그러지는 연출은 끝났다고 답한다', () => {
    // 갈래 1이 "끝났는가"이고, 0이면 스크립트가 되돌아 돈다
    const r = run('ScrCmd_20D', [1, ...u16(DEST)])
    expect(r.vars.get(DEST)).toBe(1)
  })

  it('도감을 주면 시작 메뉴가 보는 그 비트가 선다', () => {
    // 원작은 도감 구조체의 칸과 스크립트 플래그가 따로인데 둘이 갈리는 자리가
    // 없다 — `GivePokedex`가 나오는 곳이 잔모래마을 한 군데뿐이고 바로 다음
    // 줄이 이 플래그를 세운다
    const vars = new VarStore()
    // 받기 전에는 묻는 답도 0이다 — 시작 메뉴에 도감 줄이 없는 상태
    expect(run('CheckPokedexAcquired', u16(DEST), {}, vars).vars.get(DEST)).toBe(0)

    run('GivePokedex', [], {}, vars)
    expect(vars.checkFlag(FLAG_HAS_POKEDEX)).toBe(true)
    expect(run('CheckPokedexAcquired', u16(DEST), {}, vars).vars.get(DEST)).toBe(1)
  })

  it('전설 조우는 종과 레벨을 그 차례로 읽는다', () => {
    let got: [number, number] | null = null
    let over = false
    const GIRATINA = 487
    const r = run('StartLegendaryBattle', [...u16(GIRATINA), ...u16(47)], {
      startScriptedWildBattle: (species, level) => { got = [species, level] },
      battleResult: () => (over ? 'win' : null),
    })
    expect(got).toEqual([GIRATINA, 47])
    // 배틀이 끝날 때까지 선다
    expect(r.tick()).toBe(true)
    over = true
    expect(r.tick()).toBe(false)
  })

  it('태그 배틀은 파트너를 먼저 읽는다 — 뒤집으면 라이벌과 싸운다', () => {
    let got: number[] | null = null
    const r = run('StartTagBattle', [...u16(11), ...u16(22), ...u16(33)], {
      startTagBattle: (partner, a, b) => { got = [partner, a, b] },
      battleResult: () => null,
    })
    expect(got).toEqual([11, 22, 33])
    expect(r.tick()).toBe(true)
  })

  it('독은 체력이 정확히 1일 때만 풀린다', () => {
    // `Pokemon_TrySurvivePoison` — 조건 둘이 **함께** 맞아야 한다
    const asked: number[] = []
    const r = run('SurvivePoison', [...u16(DEST), ...u16(3)], {
      survivePoison: (slot) => { asked.push(slot); return true },
    })
    expect(asked).toEqual([3])
    expect(r.vars.get(DEST)).toBe(1)

    const no = run('SurvivePoison', [...u16(DEST), ...u16(0)], { survivePoison: () => false })
    expect(no.vars.get(DEST)).toBe(0)
  })

  it('판 번호는 플래티넘이다', () => {
    // `generated/game_version.txt` — 다이아 1 · 펄 2 · 플래티넘 3.
    // 창기둥이 이 값으로 대사를 가른다
    const r = run('GetGameVersion', u16(DEST))
    expect(r.vars.get(DEST)).toBe(3)
  })

  it('본 종을 도감에 적는다', () => {
    const seen: number[] = []
    const DIALGA = 483
    run('SetSpeciesSeen', u16(DIALGA), { seeSpecies: (s) => seen.push(s) })
    expect(seen).toEqual([DIALGA])
  })

  it('자유 카메라는 칸 한가운데를 본다', () => {
    let at: { x: number, z: number } | null = { x: -1, z: -1 }
    const camera = {
      free: (x: number, z: number) => { at = { x, z } },
      restore: () => { at = null },
    }
    run('AddFreeCamera', [...u16(30), ...u16(17)], { camera })
    // 좌표는 타일 번호 그대로 넘어간다. 가운데로 옮기는 것은 붙이는 쪽 일이다
    expect(at).toEqual({ x: 30, z: 17 })
    run('RestoreCamera', [], { camera })
    expect(at).toBeNull()
  })

  it('알은 종과 준 사람을 그 차례로 읽는다', () => {
    let got: [number, number] | null = null
    const RIOLU = 447
    run('GiveEgg', [...u16(RIOLU), ...u16(2)], {
      giveEgg: (species, giver) => { got = [species, giver] },
    })
    expect(got).toEqual([RIOLU, 2])
  })

  it('주인공 자세는 적어만 둔다 — 값이 남아야 그림이 붙을 자리가 생긴다', () => {
    // `PLAYER_TRANSITION_HEALING` — 연구소에서 포켓몬을 건네주는 자세
    const r = run('SetPlayerState', u16(4))
    expect(r.world.playerState).toBe(4)
  })
})

describe('별명 짓기', () => {
  it('지으면 0 · 안 지으면 1이다 — 원작이 1을 "안 지었다"로 센다', () => {
    // `CallIfNe VAR_0x8002, 1, IncrementRecordPokemonNicknamed` — 1이 아닐 때만
    // 기록을 올린다. 그러니 1이 "안 지었다"이고 지으면 다른 값이다
    let answer: string | null = null
    let asked: number | null = null
    const naming = {
      openForParty: (slot: number) => { asked = slot },
      named: () => answer,
    }
    const r = run('OpenPokemonNamingScreen', [...u16(0), ...u16(DEST)], { naming })
    expect(asked).toBe(0)
    // 짓는 동안 선다
    expect(r.tick()).toBe(true)
    answer = '모부기짱'
    r.tick()
    expect(r.vars.get(DEST)).toBe(0)

    answer = ''
    const skipped = run('OpenPokemonNamingScreen', [...u16(0), ...u16(DEST)], { naming })
    skipped.tick()
    expect(skipped.vars.get(DEST)).toBe(1)
  })

  it('화면이 없으면 안 지은 것으로 지나간다 — 스크립트가 서면 안 된다', () => {
    const r = run('OpenPokemonNamingScreen', [...u16(0), ...u16(DEST)])
    expect(r.vars.get(DEST)).toBe(1)
    // 대기를 아예 안 세운다 — 한 프레임도 안 쉬고 다음 명령으로 간다
    expect(r.ctx.state).not.toBe('waiting')
  })
})
