// 워프 덮개가 기다리는 것 (`terrainLanded`) · BDSP가 그림을 쥐는 때 (`bdspShowing`)
//
// ⚠️ 이름만 정해졌을 때 원작 땅을 숨기면 허공이 보인다 — 영원의 숲에서 205번도로로 나선 첫 화면이 하늘과 사람뿐이었다
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MapGrid } from '../engine/map/grid'
import { world } from '../engine/map/world'
import { worldState } from '../state/worldState'
import { expectBdsp, markBdspFailed, markBdspReady, resetBdspReady } from './bdspReady'
import { perfSnapshot } from './sceneRefs'
import { bdspDegraded, bdspShowing, bdspWanted, markTerrain, openTerrainRequest, terrainLanded } from './terrainMark'

describe('BDSP 열쇠 (`bdspWanted` · `bdspShowing`)', () => {
  afterEach(() => { resetBdspReady() })

  it('방 · 던전 · 둘레 지역을 그대로 늘어놓는다', () => {
    expect(bdspWanted('c01r0101', null, [])).toEqual(['c01r0101'])
    expect(bdspWanted(null, 'd27r0101', [])).toEqual(['d27r0101'])
    expect(bdspWanted(null, null, ['area002', 'area003'])).toEqual(['area002', 'area003'])
    expect(bdspWanted(null, null, [])).toEqual([])
  })

  it('이름만 정해졌을 때는 원작 그림을 숨기지 않는다 — 발밑(맨 앞) 지역이 서야 숨긴다', () => {
    const keys = bdspWanted(null, null, ['area002', 'area003'])
    expect(bdspShowing(keys)).toBe(false)
    // 둘레 지역만 섰다 — 숨기면 발밑이 하늘로 빈다
    markBdspReady('area003')
    expect(bdspShowing(keys)).toBe(false)
    markBdspReady('area002')
    expect(bdspShowing(keys)).toBe(true)
  })

  it('못 세운 층은 안 선 것으로 센다 — 원작 그림이 그대로 남는다', () => {
    markBdspFailed('c01r0101')
    expect(bdspShowing(['c01r0101'])).toBe(false)
  })

  it('맨 앞이 실패했는데 이웃이 섰으면 원작 땅이 서고 BDSP는 접힌다 — 두 층이 겹쳐 그려지지 않는다', () => {
    const keys = ['area002', 'area003']
    markBdspFailed('area002')
    markBdspReady('area003')
    expect(bdspShowing(keys)).toBe(false)
    expect(bdspDegraded(keys)).toBe(true)
  })

  it('먼 지역 하나가 실패해도 원작 땅이 선다 — 숨기면 그 지역이 구멍이다', () => {
    const keys = ['area002', 'area003']
    markBdspReady('area002')
    markBdspFailed('area003')
    expect(bdspShowing(keys)).toBe(false)
  })

  it('실패가 없으면 맨 앞이 서야만 숨긴다 — 순서가 바뀌면 보는 열쇠도 바뀐다', () => {
    markBdspReady('area003')
    expect(bdspDegraded(['area003', 'area002'])).toBe(false)
    expect(bdspShowing(['area003', 'area002'])).toBe(true)
    expect(bdspShowing(['area002', 'area003'])).toBe(false)
  })
})

describe('워프 덮개 (`terrainLanded`)', () => {
  const grid = { chunkIndexAt: () => 0 } as unknown as MapGrid
  let was: MapGrid | null = null

  beforeEach(() => {
    was = world.grid
    world.grid = grid
    world.matrix = 0
    worldState.player.position.set(10.5, 0, 10.5)
    // 원작 지형 한 벌이 서고 한 프레임이 나갔다
    const req = openTerrainRequest({ mapId: 3, matrix: 0, chunkIndex: 0, want: 4 })
    markTerrain({ req, mapId: 3, matrix: 0, chunkIndex: 0, want: 4, placed: 4, failed: false, why: null })
    perfSnapshot.frames += 1
  })
  afterEach(() => {
    world.grid = was
    resetBdspReady()
  })

  it('BDSP를 안 기다리는 맵은 원작 지형만 보면 된다', () => {
    expectBdsp([])
    expect(terrainLanded()).toBe(true)
  })

  it('BDSP 층이 서기 전에는 덮개를 안 걷는다', () => {
    expectBdsp(bdspWanted(null, null, ['area002']))
    expect(terrainLanded()).toBe(false)
    markBdspReady('area002')
    expect(terrainLanded()).toBe(true)
  })

  it('못 받은 glb는 섰다로 센다 — 기다리면 덮개 밑에 갇힌다', () => {
    expectBdsp(['c01r0101'])
    markBdspFailed('c01r0101')
    expect(terrainLanded()).toBe(true)
  })
})
