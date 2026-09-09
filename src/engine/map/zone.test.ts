// 발밑 술어 — 어느 거동값이 무엇인가 (`map_tile_behavior.c`)
//
// ⚠️ **여기서 재는 것은 「몇 개인가」다.** 술어 하나가 값을 하나 더 물거나 덜
// 물면 소리가 나면 안 될 자리에서 나거나 나야 할 자리에서 안 난다. 원작 표는
// 값마다 답을 적어 두었으므로 **개수가 곧 표와 같은가**의 증거가 된다.
//
// 실측 자리 수는 `.audit/probe/surfaceScan.mjs`가 신오 전체 행렬에서 센 것이다.
import { describe, expect, it } from 'vitest'
import {
  Behavior, isDeepMud, isMud, isMudWithGrass, isOnSnow, isPuddle, isSand,
  isShallowSnow, isShallowWater, isSnow, isSnowWithShadows, isTallGrass, isVeryTallGrass,
} from './zone'

/** 0x00~0xFF 중 그 술어가 참인 값들 */
const accepts = (p: (b: number) => boolean): number[] =>
  Array.from({ length: 256 }, (_, i) => i).filter((b) => p(b))

describe('발밑 술어가 무는 거동값 개수', () => {
  // 표는 `map_tile_behavior.c`의 함수 하나가 한 줄이다. 줄 번호를 옆에 적는다
  const TABLE: readonly [string, (b: number) => boolean, number[]][] = [
    ['IsTallGrass (265줄)', isTallGrass, [Behavior.TALL_GRASS]],
    ['IsVeryTallGrass (271줄)', isVeryTallGrass, [Behavior.VERY_TALL_GRASS]],
    ['IsSand (331줄)', isSand, [Behavior.SAND]],
    ['IsShallowWater (336줄)', isShallowWater, [Behavior.SHALLOW_WATER]],
    ['IsMud (486줄)', isMud, [Behavior.MUD, Behavior.MUD_DEEP]],
    ['IsDeepMud (491줄)', isDeepMud, [Behavior.MUD_DEEP]],
    ['IsMudWithGrass (496줄)', isMudWithGrass,
      [Behavior.MUD_WITH_GRASS, Behavior.MUD_DEEP_WITH_GRASS]],
    ['IsSnow (506줄)', isSnow,
      [Behavior.SNOW_DEEP, Behavior.SNOW_DEEPER, Behavior.SNOW_DEEPEST, Behavior.SNOW_SHALLOW]],
    ['IsShallowSnow (517줄)', isShallowSnow, [Behavior.SNOW_SHALLOW]],
    ['IsPuddle (606줄)', isPuddle, [Behavior.PUDDLE, Behavior.PUDDLE_NO_SPLASHING]],
    ['IsSnowWithShadows (726줄)', isSnowWithShadows, [Behavior.SNOW_WITH_SHADOWS]],
  ]

  for (const [name, predicate, want] of TABLE) {
    it(name, () => {
      expect(accepts(predicate)).toEqual([...want].sort((a, b) => a - b))
    })
  }
})

describe('묶고 싶어지지만 원작이 안 묶은 자리', () => {
  it('대습초원의 풀 있는 진흙은 IsMud에 안 든다', () => {
    // 3,094칸이다. 묶으면 그 전부에서 진흙 소리가 나는데 원작은 안 낸다
    expect(isMud(Behavior.MUD_WITH_GRASS)).toBe(false)
    expect(isMud(Behavior.MUD_DEEP_WITH_GRASS)).toBe(false)
    expect(isMudWithGrass(Behavior.MUD)).toBe(false)
  })

  it('그림자 지는 눈은 IsSnow에 안 든다', () => {
    // `player_move.c` 300줄이 `IsOnSnow || IsSnowWithShadows`로 **따로** 묻는다
    expect(isSnow(Behavior.SNOW_WITH_SHADOWS)).toBe(false)
    expect(isSnowWithShadows(Behavior.SNOW_DEEP)).toBe(false)
  })

  it('얕은 눈이 깊은 셋과 값이 안 붙어 있다', () => {
    // 0xA1·0xA2·0xA3 다음이 0xA4(MUD)고 얕은 눈은 0xA8이다.
    // 산술로 이으면 진흙 둘을 눈으로 읽는다
    expect(Behavior.SNOW_SHALLOW - Behavior.SNOW_DEEPEST).toBe(5)
    expect(isSnow(Behavior.MUD)).toBe(false)
    expect(isSnow(Behavior.MUD_DEEP)).toBe(false)
  })

  it('웅덩이 둘도 값이 안 붙어 있다', () => {
    expect(Behavior.PUDDLE).toBe(0x16)
    expect(Behavior.PUDDLE_NO_SPLASHING).toBe(0x1d)
  })
})

describe('눈 위의 다리는 층이 가른다 (MapObject_IsOnSnow)', () => {
  const BRIDGE_OVER_SNOW = 0x75

  it('밑을 지나면 눈이고 위를 건너면 눈이 아니다', () => {
    expect(isOnSnow(BRIDGE_OVER_SNOW, false)).toBe(true)
    expect(isOnSnow(BRIDGE_OVER_SNOW, true)).toBe(false)
  })

  it('보통 눈은 층과 무관하다', () => {
    for (const on of [true, false]) {
      expect(isOnSnow(Behavior.SNOW_DEEP, on)).toBe(true)
      expect(isOnSnow(Behavior.NORMAL, on)).toBe(false)
    }
  })

  it('눈 다리는 하나뿐이다 — 물 다리 셋과 다르다', () => {
    // 0x73·0x78·0x7c가 물이고 눈은 0x75 하나다. 물 쪽 값을 눈으로 읽으면 안 된다
    for (const b of [0x73, 0x78, 0x7c]) expect(isOnSnow(b, false)).toBe(false)
  })
})
