// 소품이 곧 장치인 자리를 배치 기록에서 찾는 규칙 (PARITY §6.6 · §1.25)
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DATA, withData } from '../../data/romData.testkit'
import type { MatrixMeta } from './grid'
import { propPlacement, propPlacements } from './propPlacement'
import { HONEY_TREE_MODEL } from '../world/honeyTree'
import { LAKE_GUARDIAN_MAP, LAKE_GUARDIAN_MODEL } from '../world/lakeGuardianUnits'

/** 청크 둘짜리 가짜 행렬. `zone`만 다르게 준다 */
function meta(zones: number[], props: Record<string, number[]>): MatrixMeta {
  return {
    id: 0, name: '시험', width: zones.length, height: 1,
    tileWidth: zones.length * 32, tileHeight: 32,
    chunks: zones.map((zone, i) => ({ i, mx: i, my: 0, land: 0, zone })),
    buildings: Object.fromEntries(Object.entries(props).map(([k, models]) => [
      k, models.map((model, n) => ({
        model, x: n, y: 0, z: 0,
        rot: [0, 0, 0] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number],
      })),
    ])),
  }
}

describe('소품 배치 고르기', () => {
  it('표식이 있으면 그 맵 것만 고른다', () => {
    // 신오 행렬 하나에 스무 그루가 같이 들어 있다 — 안 거르면 늘 첫 그루가 나온다
    const m = meta([100, 200], { 0: [HONEY_TREE_MODEL], 1: [HONEY_TREE_MODEL] })
    expect(propPlacements(m, 200, HONEY_TREE_MODEL)).toHaveLength(1)
    expect(propPlacement(m, 200, HONEY_TREE_MODEL)?.x).toBe(0)
  })

  it('⚠️ 표식이 −1인 행렬은 안 거른다', () => {
    // 제 행렬을 따로 쓰는 맵은 행렬에 헤더 표가 없어서 zone이 −1이다. 맵 번호로
    // 거르면 **한 칸도 안 남는다** — 꽃향기의 꽃밭 나무가 그렇게 사라졌었다
    const m = meta([-1], { 0: [HONEY_TREE_MODEL] })
    expect(propPlacements(m, 256, HONEY_TREE_MODEL)).toHaveLength(1)
  })

  it('없는 모델이면 빈 목록이다', () => {
    const m = meta([-1], { 0: [HONEY_TREE_MODEL] })
    expect(propPlacements(m, 256, LAKE_GUARDIAN_MODEL)).toEqual([])
    expect(propPlacement(m, 256, LAKE_GUARDIAN_MODEL)).toBeNull()
  })

  it('여럿이면 배치 차례 그대로 준다', () => {
    const m = meta([-1], { 0: [LAKE_GUARDIAN_MODEL, LAKE_GUARDIAN_MODEL] })
    const got = propPlacements(m, LAKE_GUARDIAN_MAP, LAKE_GUARDIAN_MODEL)
    expect(got.map((p) => p.x)).toEqual([0, 1])
  })
})

const read = (rel: string): unknown => JSON.parse(readFileSync(resolve(DATA, rel), 'utf8'))
const maybe = withData('maps.json', 'matrices/interiors.json')

maybe('실제 행렬에서 찾는다', () => {
  const maps = (read('maps.json') as { maps: { matrix: number }[] }).maps
  const interiors = (read('matrices/interiors.json') as
    { matrices: Record<string, MatrixMeta> }).matrices

  it('꽃향기의 꽃밭(256)의 꿀 나무가 잡힌다', () => {
    // 이 맵만 제 행렬(52)을 쓴다. 나머지 스무 그루는 신오 행렬에 있다
    const m = interiors[String(maps[256]!.matrix)]!
    expect(propPlacements(m, 256, HONEY_TREE_MODEL)).toHaveLength(1)
  })

  it('갤럭시단아지트의 감금장치가 셋이다', () => {
    const m = interiors[String(maps[LAKE_GUARDIAN_MAP]!.matrix)]!
    // 호수 삼신 하나에 하나씩이다
    expect(propPlacements(m, LAKE_GUARDIAN_MAP, LAKE_GUARDIAN_MODEL)).toHaveLength(3)
  })

  it('감금장치가 그 맵 밖에는 하나도 없다', () => {
    let outside = 0
    for (const [id, m] of Object.entries(interiors)) {
      if (Number(id) === maps[LAKE_GUARDIAN_MAP]!.matrix) continue
      for (const list of Object.values(m.buildings)) {
        for (const b of list) if (b.model === LAKE_GUARDIAN_MODEL) outside++
      }
    }
    expect(outside).toBe(0)
  })
})
