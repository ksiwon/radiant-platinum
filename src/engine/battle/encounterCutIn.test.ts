// 어느 상황이 어느 컷인이고, 그것이 몇 프레임에 무엇을 하는가
//
// ⚠️ **번호는 `enc_effects.c`의 표와 대조한다.** 그 표가 정본이고 여기 있는
// 기대값은 전부 `CutInEffects_ForBattle`의 세 줄에서 나온다.
//
// ⚠️ **길이는 여기 상수로 안 적는다.** 원작 태스크를 한 프레임씩 그대로 밟게
// 옮겼으므로 길이는 **세어져 나오는 값**이다 — 표를 잘못 옮기면 그 수가 바뀐다.
import { describe, expect, it } from 'vitest'
import {
  CutIn, cutInForBattle, cutInShape, EncounterCutIn, isHigherLevel,
} from './encounterCutIn'
import { Terrain, type TerrainId } from './terrain'

const pick = (o: {
  trainer?: boolean, terrain?: TerrainId, myLevel?: number, foeLevel?: number,
}) => cutInForBattle({
  trainer: false, terrain: Terrain.PLAIN, myLevel: 10, foeLevel: 10, ...o,
})

describe('어느 상황이 어느 번호인가 (CutInEffects_ForBattle)', () => {
  it('야생 · 지형 셋 · 레벨 낮음', () => {
    expect(pick({ terrain: Terrain.GRASS })).toBe(CutIn.TALL_GRASS_LOWER)
    expect(pick({ terrain: Terrain.WATER })).toBe(CutIn.WATER_LOWER)
    expect(pick({ terrain: Terrain.CAVE })).toBe(CutIn.CAVE_LOWER)
  })

  it('상대가 한 레벨이라도 높으면 홀수 쪽이다', () => {
    expect(pick({ terrain: Terrain.GRASS, myLevel: 10, foeLevel: 11 }))
      .toBe(CutIn.TALL_GRASS_HIGHER)
    expect(pick({ terrain: Terrain.WATER, myLevel: 10, foeLevel: 11 }))
      .toBe(CutIn.WATER_HIGHER)
    expect(pick({ terrain: Terrain.CAVE, myLevel: 10, foeLevel: 11 }))
      .toBe(CutIn.CAVE_HIGHER)
  })

  it('레벨이 같으면 낮은 쪽이다 — 조건이 `> 0`이다', () => {
    expect(pick({ terrain: Terrain.GRASS, myLevel: 30, foeLevel: 30 }))
      .toBe(CutIn.TALL_GRASS_LOWER)
  })

  it('트레이너는 여섯을 더한다', () => {
    expect(pick({ trainer: true, terrain: Terrain.GRASS }))
      .toBe(CutIn.TRAINER_TALL_GRASS_LOWER)
    expect(pick({ trainer: true, terrain: Terrain.CAVE, myLevel: 5, foeLevel: 40 }))
      .toBe(CutIn.TRAINER_CAVE_HIGHER)
  })

  it('물과 굴 말고는 **전부** 풀숲 컷인이다', () => {
    // 원작 `switch`가 열하나를 한 갈래에 몰아넣었다. 눈밭도 실내도 대습원도
    // 풀숲 연출로 열린다 — 있는 것을 안 쓰는 것이 아니라 원작이 그렇다
    const same: TerrainId[] = [
      Terrain.PLAIN, Terrain.SAND, Terrain.GRASS, Terrain.PUDDLE, Terrain.MOUNTAIN,
      Terrain.SNOW, Terrain.ICE, Terrain.BUILDING, Terrain.GREAT_MARSH, Terrain.BRIDGE,
    ]
    for (const terrain of same) expect(pick({ terrain })).toBe(CutIn.TALL_GRASS_LOWER)
  })

  it('열둘이 다 서로 다른 번호다', () => {
    const all = new Set<number>()
    for (const trainer of [false, true]) {
      for (const terrain of [Terrain.GRASS, Terrain.WATER, Terrain.CAVE] as TerrainId[]) {
        for (const foeLevel of [10, 11]) all.add(pick({ trainer, terrain, foeLevel }))
      }
    }
    expect([...all].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })
})

describe('번호 → 갈래', () => {
  it('트레이너 여섯이 같은 연출을 쓴다', () => {
    for (let n = 0; n < 6; n += 1) {
      expect(cutInShape(n + 6)).toBe(cutInShape(n))
      expect(isHigherLevel(n + 6)).toBe(isHigherLevel(n))
    }
  })

  it('갈래가 둘씩 묶인다', () => {
    expect([0, 1].map(cutInShape)).toEqual(['grass', 'grass'])
    expect([2, 3].map(cutInShape)).toEqual(['water', 'water'])
    expect([4, 5].map(cutInShape)).toEqual(['cave', 'cave'])
  })
})

/** 끝날 때까지 굴린다. 안 끝나면 시험이 선다 */
function run(effect: number) {
  const cut = new EncounterCutIn(effect)
  const frames = []
  for (let f = 0; f < 600; f += 1) {
    const at = cut.tick()
    frames.push(at)
    if (at.done) return frames
  }
  throw new Error('컷인이 안 끝난다')
}

describe('여섯이 다 끝나고, 끝나면 검다', () => {
  for (let effect = 0; effect < 6; effect += 1) {
    it(`${String(effect)}번`, () => {
      const frames = run(effect)
      const last = frames[frames.length - 1]!
      expect(last.done).toBe(true)
      // 원작이 마지막에 `SetColorBrightness(COLOR_BLACK)`을 한다 — 배틀이
      // 검은 데서 열려야 이음매가 안 보인다
      expect(last.black).toBe(1)
      // 한 번쯤은 사람이 알아볼 길이여야 한다. 반 초 안팎이 원작 값이다
      expect(frames.length).toBeGreaterThan(20)
      expect(frames.length).toBeLessThan(60)
    })
  }

  it('트레이너 여섯은 야생 여섯과 프레임까지 같다', () => {
    for (let effect = 0; effect < 6; effect += 1) {
      expect(run(effect + 6).length).toBe(run(effect).length)
    }
  })
})

describe('번쩍임 — 레벨 높낮이가 색을 가른다', () => {
  it('상대가 세면 흰색, 아니면 검정', () => {
    // `EncounterEffect_Flash(1, 16, …)` ↔ `(1, -16, …)`
    const high = run(CutIn.TALL_GRASS_HIGHER)
    const low = run(CutIn.TALL_GRASS_LOWER)
    expect(Math.max(...high.map((f) => f.flash))).toBeCloseTo(1, 6)
    expect(Math.min(...high.map((f) => f.flash))).toBeCloseTo(0, 6)
    expect(Math.min(...low.map((f) => f.flash))).toBeCloseTo(-1, 6)
    expect(Math.max(...low.map((f) => f.flash))).toBeCloseTo(0, 6)
  })

  it('두 번 번쩍이고, 끝값에 세 프레임씩 머문다', () => {
    // ⚠️ **끝값이 두 번이 아니라 여섯 번이다.** 원작이 밝히기의 마지막
    // 프레임에서 끝값을 쓰고, 되돌리기를 **거는 프레임에는 아무것도 안 쓰고**
    // (그동안 하드웨어 밝기가 그대로 남는다), 되돌리기의 첫 단이 다시 끝값이다 —
    // 한 번 번쩍일 때마다 셋이라 두 번이면 여섯이다
    const flash = run(CutIn.TALL_GRASS_HIGHER).map((f) => f.flash)
    expect(flash.filter((v) => Math.abs(v - 1) < 1e-6).length).toBe(3 * 2)
  })

  it('밝기가 3단이라 0 · ⅓ · ⅔ · 1 네 값만 쓴다', () => {
    // `BrightnessFadeTask_Init(…, 3)`
    const seen = new Set(run(CutIn.TALL_GRASS_HIGHER)
      .map((f) => Math.round(f.flash * 3)))
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
  })
})

describe('풀숲 — 가로로 찢는다', () => {
  it('조각 높이가 원작 주사선 수를 화면 높이로 나눈 것이다', () => {
    // 상대가 셀 때 2줄 · 아닐 때 5줄, 화면은 192줄이다
    const high = run(CutIn.TALL_GRASS_HIGHER).find((f) => f.slice !== null)
    const low = run(CutIn.TALL_GRASS_LOWER).find((f) => f.slice !== null)
    expect(high?.slice?.band).toBeCloseTo(2 / 192, 9)
    expect(low?.slice?.band).toBeCloseTo(5 / 192, 9)
  })

  it('끝에는 화면 폭만큼(255/256) 밀려 화면이 비워진다', () => {
    const offsets = run(CutIn.TALL_GRASS_HIGHER)
      .map((f) => f.slice?.offset ?? 0)
    expect(Math.max(...offsets)).toBeCloseTo(255 / 256, 6)
  })

  it('처음에 반대쪽으로 21.6px 튕겼다가 −3px으로 돌아온다', () => {
    // ⚠️ **끝값 −3px보다 훨씬 멀리 간다.** 굽은 보간이 처음 속도 −12px/프레임을
    // 그대로 받아 나가고 가속도가 그것을 되돌리기 때문이다 —
    // `f(t) = −12t + 1.653t²`의 바닥이 t = 3.63에서 −21.8px이다.
    // 그 튕김이 「풀이 확 갈라지는」 느낌 그 자체다
    const px = run(CutIn.TALL_GRASS_HIGHER).map((f) => (f.slice?.offset ?? 0) * 256)
    expect(Math.min(...px)).toBeCloseTo(-21.6, 1)
    // 첫 걸음이 끝나는 자리는 원작이 적어 둔 −3px이다
    expect(px.filter((v) => Math.abs(v + 3) < 1e-6).length).toBe(2)
  })

  it('카메라가 뒤로 갔다가 앞으로 돌진하고 제자리로 온다', () => {
    const dolly = run(CutIn.TALL_GRASS_HIGHER).map((f) => f.dolly)
    // ⚠️ **여기도 튕긴다.** 첫 걸음의 끝값은 팔의 +7.5%(1.075)인데 도중에
    // 1.093까지 나갔다 온다 — 조각내기와 같은 굽은 보간이다
    expect(Math.max(...dolly)).toBeCloseTo(1.0933, 3)
    // 둘째 걸음이 −50이라 끝값은 다시 1.0이다. 그 사이 0.48까지 파고든다
    expect(Math.min(...dolly)).toBeCloseTo(0.483, 3)
    expect(dolly[dolly.length - 1]).toBeCloseTo(1, 6)
  })

  it('물결도 조리개도 안 쓴다', () => {
    for (const f of run(CutIn.TALL_GRASS_LOWER)) {
      expect(f.ripple).toBeNull()
      if (!f.done) expect(f.iris).toBe(1)
    }
  })
})

describe('물 — 화면이 물결친다', () => {
  it('진폭과 도는 횟수가 원작 값이다', () => {
    // `(0xffff / 192) * 2` · `FX32_CONST(12)` ↔ `* 3` · `15`
    const low = run(CutIn.WATER_LOWER).find((f) => f.ripple !== null)?.ripple
    const high = run(CutIn.WATER_HIGHER).find((f) => f.ripple !== null)?.ripple
    expect(low).toEqual({ amplitude: 12 / 256, cycles: 2 })
    expect(high).toEqual({ amplitude: 15 / 256, cycles: 3 })
  })

  it('물결이 검어지는 동안에도 돈다', () => {
    const frames = run(CutIn.WATER_LOWER)
    // ⚠️ **흔들기를 페이드 **뒤**에 끝낸다** (`ScreenShakeEffect_Finish`가
    // `case 6`이다). 세는 자가 12와 8인데 원작이 `counter--` 뒤에 `< 0`을 보므로
    // 실제 프레임은 13과 9다 — 그 스물둘이 다 물결친다
    expect(frames.filter((f) => f.ripple !== null).length).toBe(13 + 9)
  })

  it('검어지는 것이 여덟 프레임이다 (`StartScreenFade(…, 8, 1, …)`)', () => {
    const black = run(CutIn.WATER_LOWER).map((f) => f.black).filter((v) => v > 0 && v < 1)
    expect(black.length).toBe(7)
  })

  it('조각내기도 조리개도 안 쓴다', () => {
    for (const f of run(CutIn.WATER_HIGHER)) {
      expect(f.slice).toBeNull()
      if (!f.done) expect(f.iris).toBe(1)
    }
  })
})

describe('동굴 — 조리개가 닫히며 돌진한다', () => {
  it('조리개가 열둘에 걸쳐 닫힌다', () => {
    const iris = run(CutIn.CAVE_LOWER).map((f) => f.iris)
    expect(iris.filter((v) => v > 0 && v < 1).length).toBe(11)
    expect(iris[iris.length - 1]).toBe(0)
  })

  it('상대가 셀수록 더 깊이 들어간다', () => {
    const low = Math.min(...run(CutIn.CAVE_LOWER).map((f) => f.dolly))
    const high = Math.min(...run(CutIn.CAVE_HIGHER).map((f) => f.dolly))
    expect(high).toBeLessThan(low)
    // −400은 팔의 60%다 — 그대로 옮겨진다
    expect(low).toBeCloseTo(1 - 400 / 666.922119140625, 4)
  })

  it('원작에서 음수가 되는 자리를 0.05에서 자른다', () => {
    // −800은 팔의 −119.9%라 원작에서는 카메라가 겨눔점을 지나 반대편으로 간다.
    // 우리는 3D라 그 프레임이 실제로 그려지므로 자른다
    const dolly = run(CutIn.CAVE_HIGHER).map((f) => f.dolly)
    expect(Math.min(...dolly)).toBeGreaterThanOrEqual(0.05)
  })

  it('조각내기도 물결도 안 쓴다', () => {
    for (const f of run(CutIn.CAVE_HIGHER)) {
      expect(f.slice).toBeNull()
      expect(f.ripple).toBeNull()
    }
  })
})
