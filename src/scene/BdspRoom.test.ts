import { afterEach, describe, expect, it } from 'vitest'
import { world, type MapHeader } from '../engine/map/world'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { deviceMaterials, hideDevices, MISFIT_ROOMS, roomFor } from './BdspRoom'
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

describe('원작 방과 생김이 다른 BDSP 방 (`MISFIT_ROOMS`)', () => {
  it('운하 · 영원 · 장막 체육관은 이름이 맞아도 원작 그림이다', () => {
    // `mapById`는 번호가 곧 자리다
    const maps: MapHeader[] = []
    maps[35] = header(35, 'C02GYM0101', 112)
    maps[67] = header(67, 'C04GYM0101', 220)
    maps[133] = header(133, 'C07GYM0101', 115)
    world.maps = maps
    const rooms = new Set(['c02gym0101', 'c04gym0101', 'c07gym0101'])
    for (const id of [35, 67, 133]) expect(roomFor(id, rooms), String(id)).toBeNull()
    expect([...MISFIT_ROOMS].sort()).toEqual(['c02gym0101', 'c04gym0101', 'c07gym0101'])
  })
})

describe('원작 장치가 대신 그리는 BDSP 장치 (`deviceMaterials` · `hideDevices`)', () => {
  const room = (...names: string[]): Group => {
    const g = new Group()
    for (const name of names) g.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ name })))
    return g
  }
  const shown = (g: Group): string[] => g.children
    .filter((o) => o.visible).map((o) => ((o as Mesh).material as MeshStandardMaterial).name)

  it('사천왕 방 앞 승강판 · 강철섬 승강판은 판만 숨긴다', () => {
    for (const id of [176, 178, 180, 182, 184, 185, 291, 293, 294]) expect(deviceMaterials(id), String(id)).not.toBeNull()
    const g = room('M_D_047_Elevator_01', 'M_D_047_Floor_02_1F')
    expect(hideDevices(g, 176)).toHaveLength(1)
    expect(shown(g)).toEqual(['M_D_047_Floor_02_1F'])
  })

  it('들판 체육관은 물바닥만 숨기고 단추 · 단추 틀은 둔다', () => {
    const g = room('M_C_001_SeaWater_03', 'M_RO_088_Button_01', 'M_RO_088_SwitchFrame_01', 'M_RO_088_Floor_01_1F_01')
    hideDevices(g, 122)
    expect(shown(g)).toEqual(['M_RO_088_Button_01', 'M_RO_088_SwitchFrame_01', 'M_RO_088_Floor_01_1F_01'])
  })

  it('물가 체육관은 톱니와 톱니 위 길을 숨긴다', () => {
    for (const id of [154, 155, 156]) {
      const g = room('M_RO_116_GearCorner_01', 'M_RO_116_Switch_01', 'M_RO_116_Floor_01_1F', 'M_RO_116_Cover_01')
      hideDevices(g, id)
      expect(shown(g), String(id)).toEqual(['M_RO_116_Floor_01_1F', 'M_RO_116_Cover_01'])
    }
  })

  it('원작 장치가 없는 맵은 안 건드린다 — 축복 체육관 승강 판은 그대로다', () => {
    // 축복시티 체육관(`c05gym0101`)에도 `Elevator`가 있지만 원작 장치(`featureProps`)가 안 선다
    expect(deviceMaterials(88)).toBeNull()
    const g = room('M_D_059_Elevator_01')
    expect(hideDevices(g, 88)).toHaveLength(0)
    expect(shown(g)).toEqual(['M_D_059_Elevator_01'])
  })
})
