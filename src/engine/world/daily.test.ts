// 날마다 바뀌는 것 검증 (PARITY §6.11)
//
// **씨앗 수열을 실제 수로 잰다.** 32비트 곱이라 `Math.imul`을 안 쓰면 조용히
// 다른 수열이 되는데, 화면에는 "빈티나가 없네"로만 보인다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ARNG_MULT, GREAT_MARSH_MAPS, MAP_MT_CORONET_B1F, SWARM_MAPS, addTrophyMon, advanceDays,
  arngNext, dayNumber, facingFeebas, feebasTiles, marshDaily, newDaily, rollOver, seedRand,
  swarmMap, trophySpecies, type FeebasData,
} from './daily'
import { withData } from '../../data/romData.testkit'

const DATA = resolve(__dirname, '../../../public')
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, 'data', p), 'utf8'))
const maybe = withData('encountersEx.json', 'matrices/interiors.json', 'maps.json')

describe('씨앗', () => {
  it('한 걸음이 `seed * 1812433253 + 1`이다', () => {
    expect(ARNG_MULT).toBe(1812433253)
    expect(arngNext(0)).toBe(1)
    expect(arngNext(1)).toBe(1812433254)
    // ⚠️ 32비트로 잘려야 한다. `*`로 쓰면 여기서 6.9e18 같은 수가 나온다
    expect(arngNext(0xffffffff)).toBe((Math.imul(0xffffffff, ARNG_MULT) + 1) >>> 0)
    for (const seed of [0, 1, 12345, 0x7fffffff, 0xdeadbeef, 0xffffffff]) {
      const got = arngNext(seed)
      expect(Number.isInteger(got), String(seed)).toBe(true)
      expect(got >= 0 && got <= 0xffffffff, String(seed)).toBe(true)
    }
  })

  it('며칠이 지나면 그만큼 굴린다 — 한 번에 뛰지 않는다', () => {
    const start = seedRand(0x1234abcd)
    let by1 = start
    for (let i = 0; i < 7; i++) by1 = arngNext(by1)
    expect(advanceDays(start, 7)).toBe(by1)
    expect(advanceDays(start, 0)).toBe(start)
  })

  it('같은 날 다시 봐도 안 바뀐다', () => {
    const s = newDaily(0x1234abcd, 100)
    expect(rollOver(s, 100)).toBe(s)
    expect(rollOver(s, 101).rand).toBe(arngNext(s.rand))
    expect(rollOver(s, 103).rand).toBe(advanceDays(s.rand, 3))
  })

  it('시계를 뒤로 돌려도 안 굴린다 — 씨앗을 갈아 낼 수 없다', () => {
    const s = newDaily(0x1234abcd, 100)
    const back = rollOver(s, 90)
    expect(back.rand).toBe(s.rand)
    expect(back.day).toBe(90)
  })

  it('하루 번호가 지역 자정에서 넘어간다', () => {
    // 같은 날 밤낮이 같은 번호고, 자정을 넘기면 하나 는다
    const at = (iso: string): Date => new Date(iso)
    const morning = at('2026-08-12T09:00:00')
    const night = at('2026-08-12T23:59:00')
    const next = at('2026-08-13T00:01:00')
    expect(dayNumber(morning)).toBe(dayNumber(night))
    expect(dayNumber(next)).toBe(dayNumber(night) + 1)
  })
})

describe('무리', () => {
  it('스물두 곳이고 마지막 둘이 도로가 아니다', () => {
    expect(SWARM_MAPS).toHaveLength(22)
    expect(new Set(SWARM_MAPS).size).toBe(22)
    // 무연시티 발전소 앞(200)과 영원의숲(203). 도로만 골라 만들면 이 둘이 빠진다
    expect(SWARM_MAPS.slice(-2)).toEqual([200, 203])
  })

  it('안 열렸으면 아무 데도 안 뜬다', () => {
    const s = newDaily(0x1234abcd, 100)
    expect(swarmMap(s)).toBeNull()
    expect(swarmMap({ ...s, swarms: true })).not.toBeNull()
  })

  it('날마다 자리가 돈다 — 한 곳에 박히지 않는다', () => {
    let s = { ...newDaily(0x1234abcd, 0), swarms: true }
    const seen = new Set<number>()
    for (let d = 1; d <= 200; d++) {
      s = rollOver(s, d)
      seen.add(swarmMap(s)!)
    }
    // 이백 일이면 스물두 곳을 거의 다 돈다. 열 곳도 안 나오면 씨앗이 죽은 것이다
    expect(seen.size).toBeGreaterThan(15)
  })
})

maybe('빈티나', () => {
  const ex = read('encountersEx.json') as { feebas: FeebasData }
  const feebas = ex.feebas

  it('천관산 B1F의 낚시 칸 528개를 그대로 들고 있다', () => {
    expect(feebas.species).toBe(349)
    expect(feebas.groups.reduce((a, b) => a + b, 0)).toBe(feebas.tiles.length)
    expect(feebas.tiles).toHaveLength(528)
  })

  it('칸이 전부 그 맵의 물 위다 — 좌표 셈법의 교차검증', () => {
    // ⚠️ 이게 이 자료의 유일한 눈금이다. 좌표를 `z*32+x`가 아니라 `x*32+z`로
    // 읽으면 배열은 멀쩡히 채워지는데 **낚시 칸이 벽 안에** 들어간다.
    // 인카운터 표와 완전히 다른 자료(타일 격자)로 맞춰 본다
    const index = read('matrices/interiors.json') as {
      matrices: Record<string, { width: number, tileWidth: number, byteOffset: number }>
    }
    const maps = (read('maps.json') as { maps: { matrix: number }[] }).maps
    const matrix = maps[MAP_MT_CORONET_B1F]!.matrix
    const meta = index.matrices[String(matrix)]!
    expect(meta.width, '천관산 B1F는 행렬 폭이 1이다').toBe(1)

    const bin = readFileSync(resolve(DATA, 'data/matrices/interiors.bin'))
    const tiles = new Uint16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2)
    const at = meta.byteOffset / 2
    // 물 거동 여섯 + 폭포. 낚시는 `IsSurfable`이 참인 칸을 보므로 넉넉히 잡는다
    const water = new Set([0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x19, 0x22, 0x2a])
    const notWater: number[] = []
    for (const coord of feebas.tiles) {
      const behavior = tiles[at + coord]! & 0x7fff
      if (!water.has(behavior)) notWater.push(coord)
    }
    expect(notWater).toEqual([])
  })

  it('오늘의 칸이 넷이고 네 묶음에서 하나씩 나온다', () => {
    const total = feebas.tiles.length
    const group = total / 4
    for (const seed of [0, 0x1234abcd, 0xffffffff]) {
      const rand = seedRand(seed)
      const got = feebasTiles(rand, feebas)
      expect(got).toHaveLength(4)
      for (const [i, coord] of got.entries()) {
        const index = feebas.tiles.indexOf(coord)
        expect(index, `씨앗 ${String(seed)} 묶음 ${String(i)}`).toBeGreaterThanOrEqual(i * group)
        expect(index).toBeLessThan((i + 1) * group)
      }
    }
  })

  it('날마다 칸이 바뀐다', () => {
    let s = newDaily(0x1234abcd, 0)
    const days: string[] = []
    for (let d = 1; d <= 30; d++) {
      s = rollOver(s, d)
      days.push(feebasTiles(s.rand, feebas).join(','))
    }
    expect(new Set(days).size).toBeGreaterThan(25)
  })

  it('칸을 맞춰도 절반은 그냥 떨어진다', () => {
    const s = newDaily(0x1234abcd, 0)
    const here = feebasTiles(s.rand, feebas)[0]!
    const x = here % 32, z = Math.floor(here / 32)
    expect(facingFeebas(s.rand, feebas, 1, x, z, () => true)).toBe(true)
    // ⚠️ 이 한 줄이 빈티나의 50%다. 빼면 칸만 찾으면 백발백중이 된다
    expect(facingFeebas(s.rand, feebas, 1, x, z, () => false)).toBe(false)
    // 옆 칸은 아니다
    expect(facingFeebas(s.rand, feebas, 1, x + 1, z, () => true)).toBe(false)
  })
})

maybe('트로피가든', () => {
  const table = (read('encountersEx.json') as { trophyGarden: number[] }).trophyGarden

  it('특별한 열여섯 종을 들고 있다', () => {
    expect(table).toHaveLength(16)
    // 이브이(133)와 럭키(113)가 이 표의 표식이다
    expect(table).toContain(133)
    expect(table).toContain(113)
    expect(new Set(table).size).toBe(16)
  })

  it('처음에는 두 자리가 다 비어 있다', () => {
    const s = newDaily(1, 0)
    expect(s.trophy).toEqual([-1, -1])
    expect(trophySpecies(s, table, true)).toEqual([null, null])
  })

  it('한 마리를 더하면 앞자리로 오고 있던 것이 뒤로 밀린다', () => {
    let s = newDaily(1, 0)
    s = addTrophyMon(s, table, () => 0)
    expect(s.trophy[0]).toBe(0)
    expect(s.trophy[1]).toBe(-1)
    // 0번이 이미 있으므로 다른 것이 뽑힌다 — 원작이 겹치면 다시 굴린다
    let calls = 0
    s = addTrophyMon(s, table, () => (calls++ === 0 ? 0 : 3 / table.length))
    expect(s.trophy).toEqual([3, 0])
  })

  it('전국도감 전에는 아무것도 안 얹힌다', () => {
    let s = newDaily(1, 0)
    s = addTrophyMon(s, table, () => 0)
    expect(trophySpecies(s, table, false)).toEqual([null, null])
    expect(trophySpecies(s, table, true)[0]).toBe(table[0])
  })
})

maybe('대습초원 일일', () => {
  const ex = read('encountersEx.json') as { greatMarsh: { natdex: number[], local: number[] } }

  it('여섯 구역이 씨앗의 다른 5비트를 본다', () => {
    const s = newDaily(0x1234abcd, 0)
    const got = GREAT_MARSH_MAPS.map((m) => marshDaily(s, m, ex.greatMarsh.natdex))
    expect(got.every((v) => v !== null)).toBe(true)
    // 구역 번호가 아니라 비트 자리로 갈리므로, 같은 날에도 구역마다 다르다
    expect(new Set(got).size).toBeGreaterThan(1)
    expect(marshDaily(s, 411, ex.greatMarsh.natdex), '대습초원이 아닌 맵').toBeNull()
  })

  it('전국도감 전후로 표가 다르다 — 이전판은 우파가 잔뜩이다', () => {
    const local = ex.greatMarsh.local
    const natdex = ex.greatMarsh.natdex
    expect(local).toHaveLength(32)
    expect(natdex).toHaveLength(32)
    // 우파(194)가 이전판에 훨씬 많다. 두 표를 바꿔 실으면 여기서 걸린다
    const woopers = (t: number[]): number => t.filter((s) => s === 194).length
    expect(woopers(local)).toBeGreaterThan(woopers(natdex))
  })
})
