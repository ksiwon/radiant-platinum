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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { encounterKind, flatGate, isLandEncounterTile, isSurfEncounterTile } from './encounter'
import { withDecomp } from '../../data/romData.testkit'

const DECOMP = resolve(__dirname, '../../../raw/decomp')
const HEADER = resolve(DECOMP, 'include/constants/field/map_tile_behaviors.h')
const FLAGS = resolve(DECOMP, 'src/map_tile_behavior.c')
const maybe = withDecomp(
  'include/constants/field/map_tile_behaviors.h', 'src/map_tile_behavior.c',
)

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

/**
 * 거동마다 붙은 표식을 그대로 읽는다.
 *
 * ⚠️ **표식이 셋이다.** `FLAG_ENCOUNTER`(걸어서) · `FLAG_SURFABLE`(탈 수 있다) ·
 * `FLAG_SURFABLE_ENCOUNTER`(둘 다). 셋째를 앞의 것과 문자열로 가르려다 보면
 * `"FLAG_SURFABLE_ENCOUNTER".includes("FLAG_ENCOUNTER")`가 거짓이라는 것에
 * 기대게 된다 — 이름 하나 바뀌면 조용히 틀린다. 표식마다 정확히 맞춘다
 */
function readFlagged(): { land: string[], surf: string[] } {
  const src = readFileSync(FLAGS, 'utf8')
  const table = src.slice(src.indexOf('sTileBehaviorFlags'))
  const found = [...table.matchAll(/\[(TILE_BEHAVIOR_\w+)\]\s*=\s*([^,\n]+),/g)]
  const flagOf = (m: RegExpMatchArray): string => (m[2] ?? '').trim()
  return {
    land: found.filter((m) => flagOf(m) === 'TILE_BEHAVIOR_FLAG_ENCOUNTER').map((m) => m[1]!),
    surf: found.filter((m) => flagOf(m) === 'TILE_BEHAVIOR_FLAG_SURFABLE_ENCOUNTER')
      .map((m) => m[1]!),
  }
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
  const { land, surf } = readFlagged()
  const idsOf = (names: string[]): Set<number | undefined> =>
    new Set(names.map((n) => numbers.get(n)))

  /** 세는 법이 맞는지부터. 이름에 번호가 박힌 것들이 그 번호로 떨어져야 한다 */
  it('거동 번호를 제대로 세었다', () => {
    const named = [...numbers].filter(([n]) => /^TILE_BEHAVIOR_UNUSED_x[0-9A-F]{2}$/.test(n))
    expect(named.length).toBeGreaterThan(50)
    const wrong = named.filter(([n, v]) => Number(`0x${n.slice(-2)}`) !== v)
    expect(wrong).toEqual([])
  })

  it('걸어서 만나는 거동이 열셋이다', () => {
    expect(land).toHaveLength(13)
    // 이 셋이 빠져 있어서 동굴·대습초원이 조용했다
    expect(land).toContain('TILE_BEHAVIOR_CAVE_FLOOR')
    expect(land).toContain('TILE_BEHAVIOR_MUD_WITH_GRASS')
    expect(land).toContain('TILE_BEHAVIOR_VERY_TALL_GRASS')
  })

  it('파도타기로 만나는 거동이 여섯이다 — 탈 수 있는 물 열여섯 중에서', () => {
    expect(surf).toHaveLength(6)
    expect(surf).toContain('TILE_BEHAVIOR_WATER_RIVER')
    expect(surf).toContain('TILE_BEHAVIOR_WATER_SEA')
    // ⚠️ 폭포와 물 위 다리는 **탈 수는 있어도 조우가 없다.** `isSurfable`로
    // 뭉뚱그리면 다리 위를 지나가는 것만으로 배틀이 열린다
    expect(surf).not.toContain('TILE_BEHAVIOR_WATERFALL')
    expect(surf).not.toContain('TILE_BEHAVIOR_BRIDGE_OVER_WATER')
  })

  it('0~255 전부가 원작 표와 같다', () => {
    const wantLand = idsOf(land)
    const wantSurf = idsOf(surf)
    const mismatched: string[] = []
    for (let b = 0; b <= 0xff; b++) {
      const want = wantLand.has(b) ? 'land' : wantSurf.has(b) ? 'surf' : null
      if (isLandEncounterTile(b) !== wantLand.has(b)) mismatched.push(`육상 0x${b.toString(16)}`)
      if (isSurfEncounterTile(b) !== wantSurf.has(b)) mismatched.push(`물 0x${b.toString(16)}`)
      if (encounterKind(b) !== want) mismatched.push(`갈래 0x${b.toString(16)}`)
    }
    expect(mismatched).toEqual([])
  })
})
