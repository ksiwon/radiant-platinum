import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DATA, withData } from '../../data/romData.testkit'
import {
  elapseHoneyTrees, HONEY_LEVELS, HONEY_TREE_COUNT, HONEY_TREE_MAPS, HONEY_TREE_MODEL,
  honeyTreeLevel, honeyTreeOf, honeyTreeSpecies, honeyTreeStatus, isMunchlaxTree,
  munchlaxTrees, newHoneyTrees, RIPE_MINUTES, rollTreeGroup, rollTreeShakes, rollTreeSlot,
  shakeAnimation, SLATHER_MINUTES, slatherTree, tableOfGroup, TREE_GROUP, TREE_STATUS,
  unslatherTree,
} from './honeyTree'

/** 백 번을 다 굴려 각 값이 몇 번 나오는지 */
const spread = (pick: (roll: number) => number): Map<number, number> => {
  const out = new Map<number, number>()
  for (let roll = 0; roll < 100; roll++) {
    const got = pick(roll)
    out.set(got, (out.get(got) ?? 0) + 1)
  }
  return out
}

describe('꿀 나무 — 규칙', () => {
  it('스물한 그루가 서로 다른 맵에 있다', () => {
    expect(HONEY_TREE_MAPS).toHaveLength(HONEY_TREE_COUNT)
    expect(new Set(HONEY_TREE_MAPS).size).toBe(HONEY_TREE_COUNT)
    // 차례가 곧 그루 번호다 — 밀리면 먹이몬 나무가 딴 데를 가리킨다
    expect(honeyTreeOf(HONEY_TREE_MAPS[0]!)).toBe(0)
    expect(honeyTreeOf(HONEY_TREE_MAPS[20]!)).toBe(20)
    expect(honeyTreeOf(1)).toBe(-1)
  })

  it('⚠️ 여섯 시간이 지나야 붙는다 — 그 전에는 「발라 둠」이다', () => {
    const bare = { minutesRemaining: 0, group: 0, slot: 0, table: 0, shakes: 0 }
    expect(honeyTreeStatus(bare)).toBe(TREE_STATUS.bare)
    // 막 발랐다 (1440) → 아직 안 익었다
    expect(honeyTreeStatus({ ...bare, minutesRemaining: SLATHER_MINUTES })).toBe(
      TREE_STATUS.slathered,
    )
    // 여섯 시간 지나기 1분 전
    expect(honeyTreeStatus({ ...bare, minutesRemaining: RIPE_MINUTES + 1 })).toBe(
      TREE_STATUS.slathered,
    )
    // 딱 여섯 시간
    expect(honeyTreeStatus({ ...bare, minutesRemaining: RIPE_MINUTES })).toBe(
      TREE_STATUS.encounter,
    )
    // 하루가 다 지났다 → 다시 맨 나무
    expect(honeyTreeStatus({ ...bare, minutesRemaining: 0 })).toBe(TREE_STATUS.bare)
  })

  it('시간이 흐르면 스물한 그루가 같이 깎이고 0에서 멈춘다', () => {
    let state = newHoneyTrees()
    state = slatherTree(state, 3, false, { keep: 99, group: 50, slot: 50, shakes: 50 })
    expect(state.trees[3]!.minutesRemaining).toBe(SLATHER_MINUTES)
    state = elapseHoneyTrees(state, 360)
    expect(state.trees[3]!.minutesRemaining).toBe(RIPE_MINUTES)
    expect(honeyTreeStatus(state.trees[3]!)).toBe(TREE_STATUS.encounter)
    state = elapseHoneyTrees(state, 99_999)
    expect(state.trees[3]!.minutesRemaining).toBe(0)
    // 안 바른 그루는 처음부터 0이라 안 바뀐다
    expect(state.trees[0]!.minutesRemaining).toBe(0)
  })

  it('⚠️ 먹이몬 나무 넷이 늘 서로 다르다 — 겹치면 밀어낸다', () => {
    // 네 바이트가 다 같은 번호라 밀어내기가 세 번 다 걸린다
    expect(munchlaxTrees(0x01010101)).toEqual([1, 2, 3, 4])
    // 21로 감기는 자리
    expect(munchlaxTrees(0x14141414)).toEqual([20, 0, 1, 2])
    for (const id of [0, 1, 0xffffffff, 0x12345678, 0x00010203, 25643]) {
      const trees = munchlaxTrees(id)
      expect(trees).toHaveLength(4)
      expect(new Set(trees).size).toBe(4)
      for (const t of trees) expect(t).toBeLessThan(HONEY_TREE_COUNT)
    }
  })

  it('⚠️ 32비트를 다 본다 — 보이는 다섯 자리만 넣으면 후보가 굳는다', () => {
    // 아래 16비트만 있으면 위 두 바이트가 늘 0이라 0·1번이 늘 후보다
    expect(munchlaxTrees(25643).slice(0, 2)).toEqual([0, 1])
    // 비밀 번호가 붙으면 달라진다
    expect(munchlaxTrees(((7 << 16) | 25643) >>> 0)).not.toEqual(munchlaxTrees(25643))
    expect(isMunchlaxTree(0x01010101, 1)).toBe(true)
    expect(isMunchlaxTree(0x01010101, 5)).toBe(false)
  })

  it('무리 확률이 보통 나무 10·20·70, 먹이몬 나무 1·9·20·70이다', () => {
    const plain = spread((r) => rollTreeGroup(false, r))
    expect(plain.get(TREE_GROUP.none)).toBe(10)
    expect(plain.get(TREE_GROUP.b)).toBe(20)
    expect(plain.get(TREE_GROUP.a)).toBe(70)
    expect(plain.get(TREE_GROUP.c)).toBeUndefined()

    const munch = spread((r) => rollTreeGroup(true, r))
    expect(munch.get(TREE_GROUP.c)).toBe(1)
    expect(munch.get(TREE_GROUP.none)).toBe(9)
    // ⚠️ 먹이몬 나무는 A와 B가 뒤바뀐다
    expect(munch.get(TREE_GROUP.a)).toBe(20)
    expect(munch.get(TREE_GROUP.b)).toBe(70)
  })

  it('자리 여섯의 확률이 40·20·20·10·5·5다', () => {
    const got = spread(rollTreeSlot)
    expect([0, 1, 2, 3, 4, 5].map((s) => got.get(s))).toEqual([40, 20, 20, 10, 5, 5])
  })

  it('⚠️ 세 번 흔들려도 먹이몬이 아닐 수 있다 — 없음·A도 1%다', () => {
    const of = (group: number): number[] => {
      const got = spread((r) => rollTreeShakes(group, r))
      expect([...got.values()].reduce((a, b) => a + b, 0)).toBe(100)
      return [0, 1, 2, 3].map((n) => got.get(n) ?? 0)
    }
    // 0·1·2·3 차례. 실측이고 문서(§6.6)가 이 표를 그대로 적는다
    expect(of(TREE_GROUP.none)).toEqual([80, 18, 1, 1])
    expect(of(TREE_GROUP.a)).toEqual([20, 60, 19, 1])
    expect(of(TREE_GROUP.b)).toEqual([1, 20, 75, 4])
    // ⚠️ 먹이몬 무리는 거의 늘 세 번이지만 **한 번만** 흔드는 1%가 있다
    expect(of(TREE_GROUP.c)).toEqual([1, 1, 5, 93])
  })

  it('흔들림 → 애니 번호. 0번은 안 흔들린다', () => {
    expect([0, 1, 2, 3].map(shakeAnimation)).toEqual([null, 0, 1, 2])
  })

  it('무리 → 표 번호가 사실상 무리 − 1이다', () => {
    expect(tableOfGroup(TREE_GROUP.none)).toBe(0)
    expect(tableOfGroup(TREE_GROUP.a)).toBe(0)
    expect(tableOfGroup(TREE_GROUP.b)).toBe(1)
    expect(tableOfGroup(TREE_GROUP.c)).toBe(2)
  })

  it('⚠️ 같은 나무에 연달아 바르면 90%로 무리가 그대로다', () => {
    let state = newHoneyTrees()
    // 먹이몬 나무로 C를 붙인다
    state = slatherTree(state, 5, true, { keep: 0, group: 0, slot: 50, shakes: 50 })
    expect(state.trees[5]!.group).toBe(TREE_GROUP.c)
    expect(state.trees[5]!.table).toBe(2)
    expect(state.lastSlathered).toBe(5)

    // 다시 바른다 — 90% 안에 들면 무리도 표도 그대로고 자리만 새로 뽑는다
    const kept = slatherTree(state, 5, true, { keep: 10, group: 99, slot: 0, shakes: 50 })
    expect(kept.trees[5]!.group).toBe(TREE_GROUP.c)
    expect(kept.trees[5]!.table).toBe(2)
    expect(kept.trees[5]!.slot).toBe(rollTreeSlot(0))
    expect(kept.trees[5]!.minutesRemaining).toBe(SLATHER_MINUTES)

    // 10%에 걸리면 다시 뽑는다
    const rerolled = slatherTree(state, 5, true, { keep: 95, group: 99, slot: 0, shakes: 50 })
    expect(rerolled.trees[5]!.group).toBe(TREE_GROUP.b)

    // 다른 나무를 바르면 그쪽은 늘 새로 뽑는다
    const other = slatherTree(state, 6, false, { keep: 0, group: 5, slot: 0, shakes: 50 })
    expect(other.trees[6]!.group).toBe(TREE_GROUP.none)
    expect(other.lastSlathered).toBe(6)
  })

  it('⚠️ 아무것도 안 붙으면 바르자마자 맨 나무다', () => {
    const state = slatherTree(newHoneyTrees(), 0, false, {
      keep: 0, group: 5, slot: 0, shakes: 50,
    })
    expect(state.trees[0]!.group).toBe(TREE_GROUP.none)
    expect(state.trees[0]!.minutesRemaining).toBe(0)
    expect(honeyTreeStatus(state.trees[0]!)).toBe(TREE_STATUS.bare)
    // 흔들림은 그래도 뽑는다 — 원작이 그 줄을 가지 밖에 둔다
    expect(state.trees[0]!.shakes).toBe(rollTreeShakes(TREE_GROUP.none, 50))
  })

  it('싸우면 그 나무가 비워진다 — 도망쳐도 마찬가지다', () => {
    let state = slatherTree(newHoneyTrees(), 2, false, {
      keep: 0, group: 50, slot: 0, shakes: 50,
    })
    state = elapseHoneyTrees(state, 400)
    expect(honeyTreeStatus(state.trees[2]!)).toBe(TREE_STATUS.encounter)
    state = unslatherTree(state, 2)
    expect(honeyTreeStatus(state.trees[2]!)).toBe(TREE_STATUS.bare)
  })

  it('레벨이 5~15고 선두 특성이 절반의 확률로 최고로 민다', () => {
    expect(honeyTreeLevel(0, false, 0)).toBe(HONEY_LEVELS.min)
    expect(honeyTreeLevel(10, false, 0)).toBe(HONEY_LEVELS.max)
    // 밀어 올리는 특성이 있어도 **동전이 0이면 그대로**다
    expect(honeyTreeLevel(0, true, 0)).toBe(HONEY_LEVELS.min)
    expect(honeyTreeLevel(0, true, 1)).toBe(HONEY_LEVELS.max)
  })
})

const maybe = withData('encountersEx.json', 'maps.json', 'matrices/0.json', 'matrices/interiors.json')
const read = (rel: string): unknown => JSON.parse(readFileSync(resolve(DATA, rel), 'utf8'))

maybe('꿀 나무 — 자료와 맞대기', () => {
  it('붙는 종족이 세 표에서 나온다', () => {
    const ex = read('encountersEx.json') as { honeyTree: Record<string, number[]> }
    for (const key of ['common', 'uncommon', 'rare']) {
      expect(ex.honeyTree[key]).toHaveLength(6)
    }
    // 표 2번(먹이몬 무리)은 여섯 칸이 다 먹이몬이다 — 어느 자리를 뽑아도 같다
    expect(new Set(ex.honeyTree.rare)).toEqual(new Set([446]))
    const tree = { minutesRemaining: 100, group: TREE_GROUP.c, slot: 3, table: 2, shakes: 2 }
    expect(honeyTreeSpecies(tree, ex.honeyTree)).toBe(446)
    expect(honeyTreeSpecies({ ...tree, table: 0, slot: 0 }, ex.honeyTree))
      .toBe(ex.honeyTree.common![0])
  })

  it('스물한 맵이 다 있고 저마다 나무 소품이 하나씩이다', () => {
    const maps = read('maps.json') as { maps: { id: number, matrix: number }[] }
    interface Matrix {
      chunks: { i: number, zone: number }[]
      buildings: Record<string, { model: number }[]>
    }
    const main = read('matrices/0.json') as Matrix
    const interiors = (read('matrices/interiors.json') as { matrices: Record<string, Matrix> })
      .matrices

    for (const mapId of HONEY_TREE_MAPS) {
      const header = maps.maps[mapId]
      expect(header, `맵 ${String(mapId)}`).toBeDefined()
      // 신오 행렬에 있으면 거기서, 아니면 자기 행렬에서 찾는다
      const inMain = main.chunks.some((c) => c.zone === mapId)
      const matrix = inMain ? main : interiors[String(header!.matrix)]
      expect(matrix, `행렬 ${String(header!.matrix)}`).toBeDefined()
      let trees = 0
      for (const chunk of matrix!.chunks) {
        if (inMain && chunk.zone !== mapId) continue
        for (const b of matrix!.buildings[String(chunk.i)] ?? []) {
          if (b.model === HONEY_TREE_MODEL) trees++
        }
      }
      // ⚠️ **한 그루씩이다.** 둘이면 `honeyTreePlacement`가 아무거나 집는다
      expect(trees, `맵 ${String(mapId)}의 나무 수`).toBe(1)
    }
  })

  it('나무 소품이 스물한 맵 밖에는 하나도 없다', () => {
    interface Matrix {
      chunks: { i: number, zone: number }[]
      buildings: Record<string, { model: number }[]>
    }
    const main = read('matrices/0.json') as Matrix
    const zoneOf = new Map(main.chunks.map((c) => [c.i, c.zone]))
    const stray: number[] = []
    for (const [key, list] of Object.entries(main.buildings)) {
      for (const b of list) {
        if (b.model !== HONEY_TREE_MODEL) continue
        const zone = zoneOf.get(Number(key)) ?? -1
        if (!HONEY_TREE_MAPS.includes(zone)) stray.push(zone)
      }
    }
    expect(stray).toEqual([])
  })
})
