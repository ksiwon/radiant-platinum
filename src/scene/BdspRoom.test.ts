import { afterEach, describe, expect, it } from 'vitest'
import { world, type MapHeader } from '../engine/map/world'
import { roomFor } from './BdspRoom'
import { roomBundles } from '../import/bdsp/convert'

const was = world.maps
afterEach(() => { world.maps = was })

/** 시험에 쓰는 헤더 — 짝짓기는 이름 · 행렬만 본다 */
const header = (id: number, name: string, matrix: number): MapHeader => ({ id, name, matrix } as unknown as MapHeader)

describe('맵 ↔ BDSP 방 (`roomFor`)', () => {
  it('이름이 같은 방이 먼저다 — BDSP 방 이름이 원작 내부 맵 이름이다', () => {
    world.maps = [header(0, 'T01', 0), header(1, 'T01R0202', 129)]
    expect(roomFor(1, new Set(['t01r0202']))).toBe('t01r0202')
  })

  it('없으면 같은 행렬(원작 방 모양)의 다른 맵 방을 빌린다 — 포켓몬센터는 잔모래마을 것 한 벌이다', () => {
    world.maps = [header(0, 'T02PC0101', 55), header(1, 'C01PC0101', 55), header(2, 'C01R0401', 125)]
    const rooms = new Set(['t02pc0101'])
    expect(roomFor(1, rooms)).toBe('t02pc0101')
    // 짝이 아무 데도 없으면 원작 그림 그대로다
    expect(roomFor(2, rooms)).toBeNull()
  })

  it('바깥(행렬 0)은 방을 안 쓴다', () => {
    world.maps = [header(0, 'T01', 0)]
    expect(roomFor(0, new Set(['t01']))).toBeNull()
  })
})

describe('방 번들 목록 (`roomBundles`) — 노드 쪽 `bdspArena.py --rooms`와 같은 목록', () => {
  it('`prefab_map` 바로 아래 파일만 소문자로 센다 — 던전(`d##`)은 뺀다', () => {
    const got = roomBundles([
      'Environments/prefab_map/c01r0101', 'Environments/prefab_map/T01R0202',
      'Environments/prefab_map/sub/x', 'Environments/fields/area001', 'Environments/prefab_map/c01r0101',
      'Environments/prefab_map/d05r0114',
    ])
    expect(got).toEqual(['c01r0101', 't01r0202'])
  })
})
