// 어느 칸에서 어느 번호가 나가는가 (`player_move.c`의 `PlayerAvatar_PlayWalkSE`)
//
// ⚠️ **소리는 `pnpm shot`으로 못 잰다.** 그래서 걸음을 흉내 내고 나가는 번호를
// 모아서 센다 — 여기가 「이 칸에서 저 소리」의 정본이다.
import { describe, expect, it } from 'vitest'
import { BUMP_FRAMES, BUMP_PERIOD, BumpGate, isWarpStep, stepOf, walkEffects } from './footstep'
import { SFX } from '../audio/sfx'
import { Behavior } from '../map/zone'
import { DIR } from '../script/movement'

/** 평지 한 걸음 */
const plain = (over: Partial<Parameters<typeof walkEffects>[0]> = {}) =>
  walkEffects({
    next: Behavior.NORMAL, cur: Behavior.NORMAL, onBridge: false, walkOnSpotSlow: false, ...over,
  })

describe('표면에서만 소리가 난다', () => {
  it('평지는 한 소리도 안 낸다', () => {
    // ⚠️ 원작에 걷는 소리가 아예 없다. 없는 것을 지어내면 안 된다
    expect(plain()).toEqual([])
  })

  it('모래도 안 낸다 — 원작이 값만 버린다', () => {
    // `UNUSED(TileBehavior_IsSand(nextTile))` (313줄). 2,295칸이 깔려 있다
    expect(plain({ next: Behavior.SAND, cur: Behavior.SAND })).toEqual([])
  })

  it('큰 풀숲(TALL_GRASS)도 안 낸다 — 소리가 나는 것은 긴 풀뿐이다', () => {
    // 9,822칸이 `TALL_GRASS`고 소리가 나는 `VERY_TALL_GRASS`는 1,066칸이다
    expect(plain({ next: Behavior.TALL_GRASS, cur: Behavior.TALL_GRASS })).toEqual([])
  })
})

describe('표면마다 나가는 번호', () => {
  const TABLE: readonly [string, number, number][] = [
    ['얕은 눈', Behavior.SNOW_SHALLOW, SFX.SNOW_STEP],
    ['깊은 눈', Behavior.SNOW_DEEP, SFX.SNOW_STEP],
    ['그림자 지는 눈', Behavior.SNOW_WITH_SHADOWS, SFX.SNOW_STEP],
    ['웅덩이', Behavior.PUDDLE, SFX.PUDDLE_STEP],
    ['안 튀는 웅덩이', Behavior.PUDDLE_NO_SPLASHING, SFX.PUDDLE_STEP],
    ['얕은 물', Behavior.SHALLOW_WATER, SFX.SHALLOW_WATER_STEP],
    ['진흙', Behavior.MUD, SFX.MUD_STEP],
    ['긴 풀', Behavior.VERY_TALL_GRASS, SFX.GRASS_BRUSH],
  ]
  for (const [name, behavior, seq] of TABLE) {
    it(`${name} → ${String(seq)}`, () => {
      expect(plain({ next: behavior, cur: behavior })).toEqual([seq])
    })
  }

  it('깊은 진흙에서는 안 난다', () => {
    // `IsMud && !IsDeepMud` (315줄). 542칸이 깊은 쪽이다
    expect(plain({ next: Behavior.MUD_DEEP, cur: Behavior.MUD_DEEP })).toEqual([])
  })

  it('풀 있는 진흙에서는 안 난다 — 대습초원 3,094칸이 조용하다', () => {
    expect(plain({ next: Behavior.MUD_WITH_GRASS, cur: Behavior.MUD_WITH_GRASS })).toEqual([])
  })
})

describe('긴 풀은 떠나는 칸도 본다', () => {
  it('풀에서 나오는 걸음에도 난다', () => {
    // `IsVeryTallGrass(nextTile) || IsVeryTallGrass(curTile)` (322줄)
    expect(plain({ next: Behavior.NORMAL, cur: Behavior.VERY_TALL_GRASS }))
      .toEqual([SFX.GRASS_BRUSH])
  })

  it('막힌 걸음에서는 풀만 입을 다문다', () => {
    // `if (!MovementAction_IsWalkOnSpotSlow(code))`가 풀 하나에만 걸려 있다
    expect(plain({ next: Behavior.VERY_TALL_GRASS, cur: Behavior.VERY_TALL_GRASS, walkOnSpotSlow: true }))
      .toEqual([])
    expect(plain({ next: Behavior.SNOW_DEEP, cur: Behavior.SNOW_DEEP, walkOnSpotSlow: true }))
      .toEqual([SFX.SNOW_STEP])
  })
})

describe('여럿이 한꺼번에 난다', () => {
  it('긴 풀 위의 웅덩이는 둘 다 난다 — else if가 하나도 없다', () => {
    expect(plain({ next: Behavior.PUDDLE, cur: Behavior.VERY_TALL_GRASS }))
      .toEqual([SFX.PUDDLE_STEP, SFX.GRASS_BRUSH])
  })

  it('차례가 원작의 줄 차례다 (눈 → 웅덩이 → 얕은 물 → 진흙 → 풀)', () => {
    // 한 칸이 동시에 여럿일 수는 없으므로 떠난 칸으로 풀을 얹어 둘을 만든다
    expect(plain({ next: Behavior.SNOW_DEEP, cur: Behavior.VERY_TALL_GRASS }))
      .toEqual([SFX.SNOW_STEP, SFX.GRASS_BRUSH])
  })
})

describe('눈 다리는 층이 가른다', () => {
  const BRIDGE_OVER_SNOW = 0x75
  it('밑을 지나면 눈 소리가 나고 위를 건너면 안 난다', () => {
    expect(plain({ next: BRIDGE_OVER_SNOW, cur: BRIDGE_OVER_SNOW })).toEqual([SFX.SNOW_STEP])
    expect(plain({ next: BRIDGE_OVER_SNOW, cur: BRIDGE_OVER_SNOW, onBridge: true })).toEqual([])
  })
})

describe('워프로 끝난 걸음은 조용하다 (PlayerAvatar_WillWarp)', () => {
  const WARP_ENTRANCE_NORTH = 0x64
  const WARP_ENTRANCE_SOUTH = 0x65
  const DOOR = 0x69

  it('선 칸이 그 방향의 워프 어귀면 참', () => {
    expect(isWarpStep(WARP_ENTRANCE_NORTH, Behavior.NORMAL, DIR.north)).toBe(true)
    expect(isWarpStep(WARP_ENTRANCE_SOUTH, Behavior.NORMAL, DIR.south)).toBe(true)
  })

  it('방향이 다르면 거짓 — 어귀는 방향마다 값이 따로다', () => {
    expect(isWarpStep(WARP_ENTRANCE_NORTH, Behavior.NORMAL, DIR.south)).toBe(false)
    expect(isWarpStep(WARP_ENTRANCE_NORTH, Behavior.NORMAL, DIR.east)).toBe(false)
  })

  it('앞 칸이 문이면 방향과 무관하게 참', () => {
    for (const dir of [DIR.north, DIR.south, DIR.west, DIR.east]) {
      expect(isWarpStep(Behavior.NORMAL, DOOR, dir)).toBe(true)
    }
  })

  it('그냥 벽이면 거짓 — 그때가 부딪히는 소리다', () => {
    expect(isWarpStep(Behavior.NORMAL, Behavior.NORMAL, DIR.north)).toBe(false)
  })
})

describe('막힌 걸음은 원작 16프레임마다 한 번이다', () => {
  it('그 주기가 제자리걸음 동작의 길이다', () => {
    // `MovementAction_WalkOnSpotSlowNorth_Step0`이 `InitWalkOnSpot(…, 16, …)`
    expect(BUMP_FRAMES).toBe(16)
    // 60Hz 고정 스텝이니 0.267초다 (`engine/loop`)
    expect(BUMP_PERIOD).toBeCloseTo(16 / 60, 10)
  })

  it('밀기 시작한 프레임에 한 번 나고 그 뒤로 정확히 16프레임마다', () => {
    const gate = new BumpGate()
    const at: number[] = []
    for (let f = 0; f < 60; f += 1) if (gate.push(true)) at.push(f)
    expect(at).toEqual([0, 16, 32, 48])
  })

  it('한 프레임도 60번이 안 난다 — 매 프레임 판정이 기관총이 되는 것을 막는 자리다', () => {
    const gate = new BumpGate()
    let fired = 0
    for (let f = 0; f < 16; f += 1) if (gate.push(true)) fired += 1
    expect(fired).toBe(1)
  })

  it('안 막히면 그 자리에서 다시 채워진다', () => {
    const gate = new BumpGate()
    expect(gate.push(true)).toBe(true)
    expect(gate.push(true)).toBe(false)
    // 한 프레임 통했다가 다시 막히면 곧바로 난다 — 원작도 걸음이 통하면
    // 제자리걸음 동작이 끝난다
    expect(gate.push(false)).toBe(false)
    expect(gate.push(true)).toBe(true)
  })

  it('안 밀면 안 난다', () => {
    const gate = new BumpGate()
    let fired = 0
    for (let f = 0; f < 120; f += 1) if (gate.push(false)) fired += 1
    expect(fired).toBe(0)
  })

  it('reset하면 다음 충돌이 첫 충돌이다', () => {
    const gate = new BumpGate()
    expect(gate.push(true)).toBe(true)
    gate.reset()
    expect(gate.push(true)).toBe(true)
  })
})

describe('방향 → 한 칸', () => {
  it('z가 커지는 쪽이 남쪽이다', () => {
    expect(stepOf(DIR.south)).toEqual({ x: 0, z: 1 })
    expect(stepOf(DIR.north)).toEqual({ x: 0, z: -1 })
    expect(stepOf(DIR.east)).toEqual({ x: 1, z: 0 })
    expect(stepOf(DIR.west)).toEqual({ x: -1, z: 0 })
  })

  it('없는 방향은 제자리다', () => {
    expect(stepOf(-1)).toEqual({ x: 0, z: 0 })
  })
})
