// 바위 수수께끼 (PARITY §6.10)
import { describe, expect, it } from 'vitest'
import { MAP } from './distortion'
import { DIST_OBJ } from './distortionElevator'
import {
  BOULDER_FALL_LOCATIONS, FALL_DEST, PUZZLE_FLAG, PUZZLE_FLAG_NONE, WRONG_PIT,
  fallDestination, fallLocationAt, fellIntoPit, fellIntoWrongPit, fellToB6F,
  initialPuzzleFlags, puzzleSolved, willFall, withPuzzleFlag,
} from './distortionBoulder'

describe('떨어지는 자리', () => {
  it('B5F 셋 · B6F 열하나 — 모두 열넷', () => {
    expect(BOULDER_FALL_LOCATIONS).toHaveLength(14)
    expect(BOULDER_FALL_LOCATIONS.filter((l) => l.map === MAP.b5f)).toHaveLength(3)
    expect(BOULDER_FALL_LOCATIONS.filter((l) => l.map === MAP.b6f)).toHaveLength(11)
  })

  it('웅덩이 셋만 자리 번호를 갖고 나머지 여덟은 −1이다', () => {
    const pits = BOULDER_FALL_LOCATIONS.filter((l) => l.flag >= 0 && l.flag < PUZZLE_FLAG_NONE)
    expect(pits.map((l) => l.flag).sort((a, b) => a - b))
      .toEqual([PUZZLE_FLAG.mespritBoulderInB6FPit, PUZZLE_FLAG.azelfBoulderInB6FPit,
        PUZZLE_FLAG.uxieBoulderInB6FPit])
    expect(BOULDER_FALL_LOCATIONS.filter((l) => l.flag === WRONG_PIT)).toHaveLength(8)
  })

  it('⚠️ −1과 「자리 없음」은 다른 값이다', () => {
    expect(WRONG_PIT).not.toBe(PUZZLE_FLAG_NONE)
    expect(fallDestination(PUZZLE_FLAG_NONE, 0)).toBe(FALL_DEST.b6f)
    expect(fallDestination(WRONG_PIT, 0)).toBe(FALL_DEST.wrongPit)
  })

  it('그 칸이 아니면 안 떨어진다', () => {
    expect(fallLocationAt(MAP.b5f, 0x4c, 0x44)).toBe(PUZZLE_FLAG_NONE)
    expect(fallLocationAt(MAP.b5f, 0x4c, 0x45)).toBeNull()
    // 같은 좌표라도 층이 다르면 아니다
    expect(fallLocationAt(MAP.b6f, 0x4c, 0x44)).toBeNull()
  })

  it('미는 쪽 한 칸 앞을 본다', () => {
    expect(willFall(MAP.b5f, 0x4b, 0x44, { x: 1, z: 0 })).toBe(true)
    expect(willFall(MAP.b5f, 0x4b, 0x44, { x: 0, z: 1 })).toBe(false)
  })
})

describe('어디로 떨어지는가', () => {
  it('아직 안 찬 웅덩이면 정답이다', () => {
    expect(fallDestination(PUZZLE_FLAG.uxieBoulderInB6FPit, 0)).toBe(FALL_DEST.correctPit)
  })

  it('⚠️ 이미 찬 웅덩이는 틀린 웅덩이가 된다 — 둘째 바위는 그냥 사라진다', () => {
    const filled = 1 << PUZZLE_FLAG.uxieBoulderInB6FPit
    expect(fallDestination(PUZZLE_FLAG.uxieBoulderInB6FPit, filled)).toBe(FALL_DEST.wrongPit)
  })
})

describe('자리 표가 도는 길', () => {
  it('새 판은 바위 셋이 B5F에 있다', () => {
    const f = initialPuzzleFlags(false)
    expect(f & (1 << PUZZLE_FLAG.mespritBoulderInB5F)).not.toBe(0)
    expect(f & (1 << PUZZLE_FLAG.uxieTutoSeen)).toBe(0)
  })

  it('이미 푼 세이브는 바위가 웅덩이에 들어 있다', () => {
    const f = initialPuzzleFlags(true)
    expect(puzzleSolved(f)).toBe(true)
    expect(f & (1 << PUZZLE_FLAG.mespritBoulderInB5F)).toBe(0)
  })

  it('B5F → B6F → 웅덩이까지 한 바퀴', () => {
    let f = initialPuzzleFlags(false)
    const id = DIST_OBJ.b6fUxieBoulderOutside
    f = fellToB6F(f, id)
    expect(f & (1 << PUZZLE_FLAG.uxieBoulderInB5F)).toBe(0)
    expect(f & (1 << PUZZLE_FLAG.uxieBoulderInB6FOutside)).not.toBe(0)

    const after = fellIntoPit(f, id)
    expect(after?.localID).toBe(DIST_OBJ.b6fUxieBoulderInPit)
    expect(after?.script).toBe(6)
    f = after?.flags ?? f
    expect(f & (1 << PUZZLE_FLAG.uxieBoulderInB6FPit)).not.toBe(0)
    expect(f & (1 << PUZZLE_FLAG.uxieBoulderInB6FOutside)).toBe(0)
    expect(puzzleSolved(f)).toBe(false)
  })

  it('틀린 웅덩이에 빠지면 B5F 자리로 되돌아간다 — 안 그러면 못 푼다', () => {
    let f = initialPuzzleFlags(false)
    f = fellToB6F(f, DIST_OBJ.b6fAzelfBoulderOutside)
    f = fellIntoWrongPit(f, DIST_OBJ.b6fAzelfBoulderOutside)
    expect(f & (1 << PUZZLE_FLAG.azelfBoulderInB5F)).not.toBe(0)
    expect(f & (1 << PUZZLE_FLAG.azelfBoulderInB6FOutside)).toBe(0)
  })

  it('셋을 다 넣어야 풀린다', () => {
    let f = initialPuzzleFlags(false)
    for (const id of [DIST_OBJ.b6fUxieBoulderOutside, DIST_OBJ.b6fAzelfBoulderOutside]) {
      f = fellIntoPit(fellToB6F(f, id), id)?.flags ?? f
    }
    expect(puzzleSolved(f)).toBe(false)
    f = fellIntoPit(fellToB6F(f, DIST_OBJ.b6fMespritBoulderOutside),
      DIST_OBJ.b6fMespritBoulderOutside)?.flags ?? f
    expect(puzzleSolved(f)).toBe(true)
  })

  it('웅덩이가 차면 그 위에 갇혀 있던 하나가 풀린다', () => {
    let f = withPuzzleFlag(initialPuzzleFlags(false), PUZZLE_FLAG.mespritInB6F, true)
    f = fellIntoPit(fellToB6F(f, DIST_OBJ.b6fMespritBoulderOutside),
      DIST_OBJ.b6fMespritBoulderOutside)?.flags ?? f
    expect(f & (1 << PUZZLE_FLAG.mespritInB6F)).toBe(0)
  })
})
