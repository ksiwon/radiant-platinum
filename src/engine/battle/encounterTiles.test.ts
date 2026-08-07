// 야생이 나오는 타일 거동을 디컴프 표와 통째로 맞춰 본다.
//
// ⚠️ 여기가 조용히 틀려 있던 자리다. 풀숲(0x02) 하나만 보고 있어서 **동굴과
// 대습초원에서는 아무리 걸어도 야생이 안 나왔다.** 화면에는 아무 표시도 안
// 뜬다 — 그냥 "안 나오네" 하고 지나치게 된다.
//
// 그래서 목록을 눈으로 고르지 않고, 원작이 거동마다 붙여 둔 표식
// (`sTileBehaviorFlags`의 `TILE_BEHAVIOR_FLAG_ENCOUNTER`)과 **0~255 전부**를
// 견준다. 한 칸이라도 어긋나면 여기서 걸린다.
//
// ⚠️ `raw/`는 리포에 안 들어간다(§14.1). 표가 있을 때만 돌린다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { flatGate, isEncounterTile } from './encounter'

const DECOMP = resolve(__dirname, '../../../raw/decomp')
const HEADER = resolve(DECOMP, 'include/constants/field/map_tile_behaviors.h')
const FLAGS = resolve(DECOMP, 'src/map_tile_behavior.c')
const maybe = existsSync(HEADER) && existsSync(FLAGS) ? describe : describe.skip

/** `enum { A, B = 5, C }` — 이름만 있는 줄이 하나씩 올라간다 */
function readBehaviorNumbers(): Map<string, number> {
  const src = readFileSync(HEADER, 'utf8')
  const body = src.slice(src.indexOf('{') + 1, src.lastIndexOf('}'))
  const out = new Map<string, number>()
  let value = 0
  for (const piece of body.split(',')) {
    const line = piece.split('//')[0]?.trim() ?? ''
    if (line === '') continue
    const eq = line.indexOf('=')
    if (eq >= 0) {
      out.set(line.slice(0, eq).trim(), Number(line.slice(eq + 1).trim()))
      value = out.get(line.slice(0, eq).trim()) ?? value
    } else {
      out.set(line, value)
    }
    value += 1
  }
  return out
}

/** `[TILE_BEHAVIOR_X] = TILE_BEHAVIOR_FLAG_ENCOUNTER,` 인 것들 */
function readEncounterNames(): string[] {
  const src = readFileSync(FLAGS, 'utf8')
  const table = src.slice(src.indexOf('sTileBehaviorFlags'))
  const found = [...table.matchAll(/\[(TILE_BEHAVIOR_\w+)\]\s*=\s*([^,\n]+),/g)]
  return found.filter(([, , flags]) => flags?.includes('FLAG_ENCOUNTER')).map((m) => m[1]!)
}

/**
 * 평평한 관문의 높이. 원작 `ShouldGetRandomEncounter`가 이 세 줄이다:
 *
 *     u8 flatEncounterRate = 40;
 *     if (TileBehavior_IsVeryTallGrass(...)) flatEncounterRate += 30;
 *     else if (... == PLAYER_AVATAR_CYCLING) flatEncounterRate += 30;
 *
 * ⚠️ `else if`라는 것이 이 시험의 요지다. 둘 다면 100이 아니라 70이다
 */
describe('평평한 관문', () => {
  it('맨땅은 40, 긴 풀은 70, 자전거도 70', () => {
    expect(flatGate({})).toBe(40)
    expect(flatGate({ veryTallGrass: true })).toBe(70)
    expect(flatGate({ cycling: true })).toBe(70)
  })

  it('긴 풀 위에서 자전거를 타도 70이다 — 더해지지 않는다', () => {
    expect(flatGate({ veryTallGrass: true, cycling: true })).toBe(70)
  })
})

maybe('야생이 나오는 타일', () => {
  const numbers = readBehaviorNumbers()
  const names = readEncounterNames()

  /** 세는 법이 맞는지부터. 이름에 번호가 박힌 것들이 그 번호로 떨어져야 한다 */
  it('거동 번호를 제대로 세었다', () => {
    const named = [...numbers].filter(([n]) => /^TILE_BEHAVIOR_UNUSED_x[0-9A-F]{2}$/.test(n))
    expect(named.length).toBeGreaterThan(50)
    const wrong = named.filter(([n, v]) => Number(`0x${n.slice(-2)}`) !== v)
    expect(wrong).toEqual([])
  })

  it('표식이 붙은 거동이 열셋이다', () => {
    expect(names).toHaveLength(13)
    // 이 셋이 빠져 있어서 동굴·대습초원이 조용했다
    expect(names).toContain('TILE_BEHAVIOR_CAVE_FLOOR')
    expect(names).toContain('TILE_BEHAVIOR_MUD_WITH_GRASS')
    expect(names).toContain('TILE_BEHAVIOR_VERY_TALL_GRASS')
  })

  it('0~255 전부가 원작 표와 같다', () => {
    const want = new Set(names.map((n) => numbers.get(n)))
    const mismatched: string[] = []
    for (let b = 0; b <= 0xff; b++) {
      if (isEncounterTile(b) !== want.has(b)) mismatched.push(`0x${b.toString(16)}`)
    }
    expect(mismatched).toEqual([])
  })
})
